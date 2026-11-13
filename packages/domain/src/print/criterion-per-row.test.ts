import { afterEach, describe, expect, it, vi } from 'vitest';
import { layoutLockEpic25Snapshot, layoutLockSnapshot, LAYOUT_LOCK_ISSUED_AT } from '../../fixtures/layout-lock/op-log.ts';
import { notApplicableReadingValue } from '../relatorio/reading-not-applicable.ts';
import type { BlockRow, Cell, JsonValue } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import type { SeedRuleFlag } from '../seed/schema.ts';
import { layoutSpec } from './layout.ts';
import { readingFitWidthEm, section9Layout, wordsWiderThanColumns, type PrintSheet, type PrintTable } from './section-9.ts';

/*
 * 25.20-UNIT (batch e25p, Story 25.20, seed v15 `criterion_result_per_row` and `corrected_headers_corrigido`;
 * M24, Bruno's answers 2, 3 and 5, Matheus's decision 5; the approved frame `key-print-section-9-v15.html`):
 * every table `measurementTestPart` prints, but a choice test, gains CRITÉRIO and RESULTADO on each row, last,
 * after MANUT. ANTERIOR; the corrected columns read "20 °C (corrigido)" and "75 °C (corrigido)"; each table
 * holds every word and value whole, a value with its unit. The relatórios are the layout lock's synthetic ones
 * (`fixtures/layout-lock`), their cells rewritten here per case; every value is invented. Each flag is read off
 * in turn through the one module the domain reads a flag from (`seedRule`, mocked below).
 */

const off = vi.hoisted(() => new Set<string>());
vi.mock('../seed/definitions.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../seed/definitions.ts')>();
  return { ...actual, seedRule: (version: string, flag: SeedRuleFlag) => (off.has(flag) ? false : actual.seedRule(version, flag)) };
});

afterEach(() => off.clear());

const NBSP = '\u00a0';
const OP = '019966b0-0e25-7020-8000-0000000000aa';
const num = (raw: string, unit: string | null): JsonValue => ({ raw, unit, state: 'measured' });
const CRITERIA = { winding: 'desvio entre fases ≤ 2 % (com restrição até 5 %)', similares: 'ΔT entre similares ≤ 3 °C (com restrição até 15 °C)', ambiente: 'ΔT sobre o ambiente ≤ 10 °C (com restrição até 40 °C)' };

/** A cell of a test written as the sheet stores it. */
function write(block: BlockRow, testKey: string, row: number, col: number, value: JsonValue): void {
  const test = (block.sheet.test[testKey] ??= { instrument: null, criterion_override: null, cells: {} } as never);
  ((test.cells[String(row)] ??= {}) as Record<string, Cell>)[String(col)] = { value: value as Cell['value'], source_suggestion_id: null, op_id: OP };
}

const live = (snapshot: RelatorioSnapshot, type: string) => snapshot.blocks.filter((block) => block.block_type === type && block.removed_at === null && block.equipment_id !== null);

function sheetOf(snapshot: RelatorioSnapshot, blockId: string): PrintSheet {
  return section9Layout(snapshot, 9, 'RESULTADOS')!.subsections.flatMap((sub) => sub.sheets).find((sheet) => sheet.blockId === blockId)!;
}

const tablesOf = (sheet: PrintSheet): PrintTable[] => sheet.parts.flatMap((part) => (part.kind === 'table' ? [part.table] : []));
const plain = (text: string) => text.replaceAll(NBSP, ' ');
const titled = (sheet: PrintSheet, title: string): PrintTable => tablesOf(sheet).find((table) => plain(table.rows[0]!.cells[0]!.text).endsWith(title))!;
/** The table's rows as printed text, the no-break space read as a space. */
const grid = (table: PrintTable) => table.rows.map((row) => row.cells.map((cell) => plain(cell.text)));
const headerOf = (table: PrintTable) => grid(table).find((row) => row.includes('CRITÉRIO')) ?? grid(table).filter((_, i) => table.rows[i]!.header === true).at(-1)!;
/** A data row by its first cell: its CRITÉRIO and RESULTADO, the last two cells. */
const judged = (table: PrintTable, label: string) => {
  const row = grid(table).find((cells) => cells[0] === label)!;
  return { criterion: row.at(-2)!, result: row.at(-1)! };
};
const whole = (table: PrintTable) => wordsWiderThanColumns(table, readingFitWidthEm(table));

/** The Epic 25 v15 relatório with the oil transformer on its first visit: AT on the tap in service 1,2 · 1,212 · 1,236 Ω (3 % on phase C). */
function windingFirstVisit(version = 'v15'): { snapshot: RelatorioSnapshot; blockId: string } {
  const snapshot = structuredClone(layoutLockEpic25Snapshot(version));
  const oil = live(snapshot, 'transformador_forca').find((block) => block.sheet.test.resistencia_enrolamento !== undefined)!;
  for (const equipment of snapshot.equipment) if (equipment.id === oil.equipment_id) equipment.last_results = null;
  for (const [col, raw] of [[0, '1.2'], [1, '1.212'], [2, '1.236']] as const) write(oil, 'resistencia_enrolamento', 0, col, num(raw, 'Ω'));
  return { snapshot, blockId: oil.id };
}

describe('25.20-UNIT the criterion and the result on each row of a v15 measurement table', () => {
  it('the deviation between phases: a v15 oil winding with phase C 3 % over the lowest prints COM RESTRIÇÃO on that row, the criterion on each row, "75 °C (corrigido)", every value whole with its unit', () => {
    const { snapshot, blockId } = windingFirstVisit();
    const table = titled(sheetOf(snapshot, blockId), 'RESISTÊNCIA ÔHMICA DOS ENROLAMENTOS');
    expect(headerOf(table)).toEqual(['ENROLAMENTO', 'FASE A', 'FASE B', 'FASE C', 'FASE A', 'FASE B', 'FASE C', 'CRITÉRIO', 'RESULTADO']);
    expect(grid(table).some((row) => row.includes('75 °C (corrigido)'))).toBe(true);
    expect(judged(table, 'AT, TAP ATUAL')).toEqual({ criterion: CRITERIA.winding, result: 'COM RESTRIÇÃO' });
    for (const label of ['AT, PRIMEIRO TAP', 'AT, ÚLTIMO TAP', 'BT']) expect(judged(table, label), label).toEqual({ criterion: CRITERIA.winding, result: 'SATISFATÓRIO' });
    // A value keeps its unit (a no-break space), and no word or value is wider than its column at the table's size.
    expect(table.rows.flatMap((row) => row.cells.map((cell) => cell.text))).toContain(`1,236${NBSP}Ω`);
    expect(whole(table)).toEqual([]);
  });

  it('bands over two columns: a thermography point with both ΔT filled prints both criteria, one per line, and the worse of the two', () => {
    const snapshot = structuredClone(layoutLockEpic25Snapshot('v15'));
    const arrester = live(snapshot, 'para_raio')[0]!;
    // CONEXÕES within on both; TERMINAÇÕES 4 °C between similares (restricted) and 8 °C over the ambient (within); CONTATOS 20 °C (out).
    for (const [row, similares, ambiente] of [[0, '1', '4'], [1, '4', '8'], [2, '20', '9'], [3, '2', '25']] as const) {
      write(arrester, 'termografia', row, 0, num(similares, '°C'));
      write(arrester, 'termografia', row, 1, num(ambiente, '°C'));
    }
    const table = titled(sheetOf(snapshot, arrester.id), 'TERMOGRAFIA');
    expect(headerOf(table)).toEqual(['PONTO', 'ΔT ENTRE SIMILARES (°C)', 'ΔT SOBRE O AMBIENTE (°C)', 'CRITÉRIO', 'RESULTADO']);
    const both = `${CRITERIA.similares}\n${CRITERIA.ambiente}`;
    expect(judged(table, 'CONEXÕES')).toEqual({ criterion: both, result: 'SATISFATÓRIO' });
    expect(judged(table, 'TERMINAÇÕES')).toEqual({ criterion: both, result: 'COM RESTRIÇÃO' });
    expect(judged(table, 'CONTATOS')).toEqual({ criterion: both, result: 'INSATISFATÓRIO' });
    expect(judged(table, 'BUCHAS')).toEqual({ criterion: both, result: 'COM RESTRIÇÃO' });
    expect(whole(table)).toEqual([]);
  });

  it('a limit and a design value (the Malha): a row not measured and a row N/A print "-" under RESULTADO, their criterion still printed', () => {
    const snapshot = structuredClone(layoutLockEpic25Snapshot('v15'));
    const grid0 = live(snapshot, 'malha_aterramento')[0]!;
    write(grid0, 'continuidade_malha', 0, 0, num('0.72', 'Ω'));
    write(grid0, 'continuidade_malha', 3, 0, { raw: '', unit: 'Ω', state: 'not_measured' });
    write(grid0, 'continuidade_malha', 4, 0, notApplicableReadingValue('Ω'));
    const sheet = sheetOf(snapshot, grid0.id);
    const continuity = titled(sheet, 'CONTINUIDADE E EQUIPOTENCIALIZAÇÃO');
    expect(judged(continuity, 'CARCAÇAS')).toEqual({ criterion: '≤ 0,5 Ω entre pontos', result: 'INSATISFATÓRIO' });
    expect(judged(continuity, 'PORTAS')).toEqual({ criterion: '≤ 0,5 Ω entre pontos', result: 'SATISFATÓRIO' });
    expect(judged(continuity, 'PARA-RAIOS')).toEqual({ criterion: '≤ 0,5 Ω entre pontos', result: '-' });
    expect(grid(continuity).find((row) => row[0] === 'BLINDAGENS')).toEqual(['BLINDAGENS', 'N/A', '≤ 0,5 Ω entre pontos', '-']);
    // The design value read from the plate, in the form the kernel words it.
    expect(judged(titled(sheet, 'RESISTÊNCIA DE ATERRAMENTO DA MALHA'), 'MALHA')).toEqual({ criterion: '≤ 100 Ω, valor de projeto', result: 'SATISFATÓRIO' });
    expect(whole(continuity)).toEqual([]);
  });

  it('a company table: "220 V ± 5 %" with 232 V prints INSATISFATÓRIO, a range row its own; MANUT. ANTERIOR stays before them; "Tipo da empresa" prints nowhere', () => {
    const snapshot = structuredClone(layoutLockEpic25Snapshot('v15'));
    const version = snapshot.equipment_types![0]!;
    const definition = version.definition as unknown as { measurement_tests: { columns: { unit: string }[] }[]; criteria: { key: string; value: number; value_max?: number; unit: string }[] };
    definition.measurement_tests[0]!.columns[0]!.unit = 'V';
    for (const criterion of definition.criteria) {
      if (criterion.key === 'tensao_nominal_saida') Object.assign(criterion, { value: 220, unit: 'V' });
      if (criterion.key === 'tensao_saida') Object.assign(criterion, { value: 210, value_max: 230, unit: 'V' });
    }
    const company = snapshot.blocks.find((block) => block.block_type.startsWith('type:'))!;
    write(company, 'tensoes_medidas', 0, 0, num('232', 'V'));
    write(company, 'tensoes_medidas', 1, 0, num('221', 'V'));
    const table = titled(sheetOf(snapshot, company.id), 'TENSÕES MEDIDAS');
    expect(headerOf(table)).toEqual(['MEDIÇÃO', 'VALOR MEDIDO (V)', 'MANUT. ANTERIOR\n06/11/2025', 'CRITÉRIO', 'RESULTADO']);
    expect(judged(table, 'TENSÃO DE SAÍDA')).toEqual({ criterion: '220 V ± 5 %', result: 'INSATISFATÓRIO' });
    expect(judged(table, 'TENSÃO DE FLUTUAÇÃO')).toEqual({ criterion: 'entre 210 e 230 V', result: 'SATISFATÓRIO' });
    // The nominal and its tolerance are one word (the frame's "220 V ± 5 %"), as a value with its unit is.
    expect(table.rows.flatMap((row) => row.cells.map((cell) => cell.text))).toContain(`220${NBSP}V${NBSP}±${NBSP}5${NBSP}%`);
    expect(whole(table)).toEqual([]);
    const document = JSON.stringify(layoutSpec(snapshot, { revisionNumber: 1, issuedAt: LAYOUT_LOCK_ISSUED_AT })).toLocaleLowerCase('pt-BR');
    expect(document).not.toContain('tipo da empresa');
  });

  it('the CTA: a comparison with the lowest, a comparison with another column, a limit on one row only and a pass or fail choice, each on its rows', () => {
    const snapshot = structuredClone(layoutLockSnapshot('v15'));
    const cta = live(snapshot, 'chave_transferencia_automatica')[0]!;
    // E1 by the lowest of each side; E4's "Deixado" against "Projeto"; E5's limit on "Até carga na Emergência" only; E6's class.
    for (const [row, normal, emergency] of [[0, '40', '41'], [1, '62', '42'], [2, '45', '43']] as const) {
      write(cta, 'cta_resistencia_contato', row, 0, num(normal, 'µΩ'));
      write(cta, 'cta_resistencia_contato', row, 1, num(emergency, 'µΩ'));
    }
    write(cta, 'cta_ajustes_controlador', 0, 1, num('90', '%'));
    write(cta, 'cta_ajustes_controlador', 0, 3, num('90', '%'));
    write(cta, 'cta_transferencia', 1, 1, num('8', 's'));
    write(cta, 'cta_termografia', 0, 3, { raw: 'normal', unit: null, state: 'measured' });
    write(cta, 'cta_termografia', 1, 3, { raw: 'provavel_deficiencia', unit: null, state: 'measured' });
    const sheet = sheetOf(snapshot, cta.id);
    const contact = titled(sheet, 'RESISTÊNCIA DE CONTATO');
    expect(judged(contact, 'POLO A')).toEqual({ criterion: '≤ 50 % acima do menor do mesmo lado', result: 'SATISFATÓRIO' });
    expect(judged(contact, 'POLO B')).toEqual({ criterion: '≤ 50 % acima do menor do mesmo lado', result: 'INSATISFATÓRIO' });
    // The reference row takes no criterion and no result.
    expect(grid(contact).find((row) => row[0] === 'MENOR DO LADO')!.slice(-2)).toEqual(['', '']);
    expect(judged(titled(sheet, 'AJUSTES DO CONTROLADOR'), 'NORMAL · PICKUP DE TENSÃO')).toEqual({ criterion: 'Deixado = projeto', result: 'SATISFATÓRIO' });
    const transfer = titled(sheet, 'TRANSFERÊNCIA');
    expect(judged(transfer, 'ATÉ CARGA NA EMERGÊNCIA')).toEqual({ criterion: 'Assumir a carga ≤ 10 s', result: 'SATISFATÓRIO' });
    // A row no criterion covers prints "-" in both.
    expect(judged(transfer, 'RETRANSFERÊNCIA')).toEqual({ criterion: '-', result: '-' });
    const thermo = titled(sheet, 'TERMOGRAFIA SOB CARGA');
    const classe = judged(thermo, 'NORMAL · A').criterion;
    expect(classe.startsWith('Classe Normal')).toBe(true);
    expect(judged(thermo, 'NORMAL · A').result).toBe('SATISFATÓRIO');
    expect(judged(thermo, 'NORMAL · B')).toEqual({ criterion: classe, result: 'INSATISFATÓRIO' });
    for (const table of [contact, transfer, thermo]) expect(whole(table)).toEqual([]);
  });

  it('a choice test (the oil sampling) prints as v14 prints it: its answer is its result', () => {
    const v15 = structuredClone(layoutLockEpic25Snapshot('v15'));
    const v14 = structuredClone(layoutLockEpic25Snapshot('v14'));
    const sampling = (snapshot: RelatorioSnapshot) => {
      const oil = live(snapshot, 'transformador_forca').find((block) => block.sheet.test.resistencia_enrolamento !== undefined)!;
      return titled(sheetOf(snapshot, oil.id), 'COLETA DE ÓLEO');
    };
    expect(grid(sampling(v15))).toEqual(grid(sampling(v14)));
    expect(headerOf(sampling(v15))).toEqual(['COLETA', 'RESULTADO']);
  });

  it('the breaker\'s paired insulation tables on a second visit read "20 °C (corrigido)", every value of the column on one line, at the frame\'s 6,5 pt', () => {
    const snapshot = layoutLockEpic25Snapshot('v15');
    const [rise] = live(snapshot, 'disjuntor_mt');
    const pair = tablesOf(sheetOf(snapshot, rise!.id)).find((table) => table.rows.some((row) => row.cells.some((cell) => cell.text === 'GUARD')))!;
    expect(headerOf(pair).filter((text) => text === '20 °C (corrigido)')).toHaveLength(2);
    expect(headerOf(pair).filter((text) => text.startsWith('MANUT. ANTERIOR'))).toHaveLength(2);
    expect(pair.rows.flatMap((row) => row.cells.map((cell) => cell.text))).toContain(`20${NBSP}°C (corrigido)`);
    expect(pair.textHalfPoints).toBe(13);
    expect(whole(pair)).toEqual([]);
    // The seeded insulation, contact and ratio tables keep their columns: no CRITÉRIO, no RESULTADO.
    expect(headerOf(pair)).not.toContain('CRITÉRIO');
  });

  it('the transformer\'s insulation table, printed alone with its corrected column, reads "20 °C (corrigido)" and holds every word and value whole', () => {
    const snapshot = layoutLockEpic25Snapshot('v15');
    const oil = live(snapshot, 'transformador_forca').find((block) => block.sheet.test.resistencia_enrolamento !== undefined)!;
    const insulation = tablesOf(sheetOf(snapshot, oil.id)).find((table) => grid(table).some((row) => row.includes('POLARIZAÇÃO')))!;
    expect(grid(insulation).some((row) => row.includes('20 °C (corrigido)'))).toBe(true);
    expect(grid(insulation).some((row) => row.includes('CRITÉRIO'))).toBe(false);
    expect(whole(insulation)).toEqual([]);
    // The second visit with its ACEITÁVEL per row and MANUT. ANTERIOR: twelve columns, the one table of the fixture under 6 pt (5,5 pt).
    expect(insulation.textHalfPoints).toBe(11);
  });
});

describe('25.20-UNIT each flag off, and v14', () => {
  const texts = (snapshot: RelatorioSnapshot, blockId: string) => tablesOf(sheetOf(snapshot, blockId)).flatMap((table) => grid(table).flat());

  it('`criterion_result_per_row` off: no CRITÉRIO and no RESULTADO, the headers still "(corrigido)"', () => {
    off.add('criterion_result_per_row');
    const { snapshot, blockId } = windingFirstVisit();
    const printed = texts(snapshot, blockId);
    expect(printed).not.toContain('CRITÉRIO');
    expect(printed).not.toContain('COM RESTRIÇÃO');
    expect(printed).toContain('75 °C (corrigido)');
    expect(printed).toContain('20 °C (corrigido)');
  });

  it('`corrected_headers_corrigido` off: the headers read "20 °C" and "75 °C", the two columns still print', () => {
    off.add('corrected_headers_corrigido');
    const { snapshot, blockId } = windingFirstVisit();
    const printed = texts(snapshot, blockId);
    expect(printed).toContain('CRITÉRIO');
    expect(printed).toContain('75 °C');
    expect(printed).toContain('20 °C');
    expect(printed.some((text) => text.includes('(corrigido)'))).toBe(false);
  });

  it('both off, a v15 relatório prints its measured tables as the v14 one does; v14 itself has neither the columns nor "(corrigido)"', () => {
    const tableTexts = (version: string) => {
      const { snapshot, blockId } = windingFirstVisit(version);
      return tablesOf(sheetOf(snapshot, blockId)).map((table) => ({ columns: table.columns, size: table.textHalfPoints ?? null, rows: grid(table) }));
    };
    const v14 = tableTexts('v14');
    expect(v14.flatMap((table) => table.rows.flat())).not.toContain('CRITÉRIO');
    expect(v14.flatMap((table) => table.rows.flat()).some((text) => text.includes('(corrigido)'))).toBe(false);
    expect(v14.flatMap((table) => table.rows.flat())).toContain('75 °C');
    off.add('criterion_result_per_row');
    off.add('corrected_headers_corrigido');
    expect(tableTexts('v15')).toEqual(v14);
  });
});
