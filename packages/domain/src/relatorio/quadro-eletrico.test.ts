import { describe, expect, it } from 'vitest';
import { applyOp, cellAt, entityKey, SeedPathError, type EntityKey, type EntityState } from '../ops/apply.ts';
import { blockPath, parsePath, sheetChecklistPath, sheetConclusionPath, sheetNameplatePath, sheetObservationsPath, sheetTestCellPath } from '../ops/path.ts';
import { CAPTION_EQUIPMENT_WORDS } from '../photos/caption.ts';
import { groupForPrint } from '../print/group-for-print.ts';
import { section9Layout, type PrintSheet, type PrintTable, type SheetPart } from '../print/section-9.ts';
import { relatorioRowSchema, type BlockRow, type EntityRow, type JsonValue, type LocationRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { getDefinition } from '../seed/definitions.ts';
import { defaultBlockConfig } from '../seed/template.ts';
import { quantityLabel, subBlockSummaryText, TOTALS_ORDER, totalsText } from '../templates/text.ts';
import { opFactory, TEST_PROJECT, TEST_RELATORIO, type OpFactory } from '../test-support.ts';
import { composeConclusion, suggestConclusionPair } from './conclusion.ts';
import { nameplateMissingKeys } from './dry-insulation.ts';
import { CTA } from './measurement-test-support.ts';
import { bandCriterion, CRITERION_NOT_EVALUATED, evaluatedCells, evaluateSheetReadings, worstReadings } from './readings.ts';
import { sheetProgress } from './sheet-progress.ts';
import { suggestTag, TAG_PREFIX } from './tag.ts';
import { LIBRARY_GROUP_LABEL, libraryTypeSummaryText, newEquipmentBlock, paletteItems, paletteTypeGroups } from './tree.ts';

/*
 * Story 14.9 (seed v6): the Quadro elétrico (QGBT/QD), the second library type, on the seeded
 * nameplate, checklist and single-table insulation grammars. Its palettes, TAG and words, its
 * criterion picked from the plate by the NBR 5410 bands (every boundary of the spec's matrix),
 * its conclusion, and its sheet in section 9. Sheets are filled through the fold.
 */

const QD = 'quadro_eletrico';
const BLOCK = '019966b0-0221-7000-8000-000000000001';
const EQUIPMENT = '019966b0-0221-7000-8000-000000000002';
const LOCAL = '019966b0-0221-7000-8000-000000000003';
const CTA_BLOCK = '019966b0-0221-7000-8000-000000000011';
const CTA_EQUIPMENT = '019966b0-0221-7000-8000-000000000012';
/** The 1 MINUTO column, the one captured. */
const MINUTO = 1;
const ROWS = ['FASE A', 'FASE B', 'FASE C', 'NEUTRO'];

const definition = () => getDefinition('v6', 'cabine_primaria', QD);
const num = (raw: string, unit: string): JsonValue => ({ raw, unit, state: 'measured' });

const local = (): LocationRow => ({
  id: LOCAL,
  relatorio_id: TEST_RELATORIO,
  parent_id: null,
  kind: 'cabine',
  name: 'Subestação',
  order_key: 'a0',
  se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
  env: { altitude_m: null, temperature_c: null, humidity_pct: null },
  agrupar_por_tipo: true,
  removed_at: null,
});

const relatorio = (seedVersion: string) =>
  relatorioRowSchema.parse({
    id: TEST_RELATORIO,
    project_id: TEST_PROJECT,
    template_id: null,
    template_version: null,
    seed_version: seedVersion,
    status: 'em_campo',
    setup: { service_start: null, service_end: null, atividade: null, local: null, responsible_user_id: null, cover_photo_file_id: null },
    export: { scheme: 'por_local_e_tipo' },
    preview_file_id: null,
    removed_at: null,
  });

function stateWith(options: { withCta?: boolean } = {}, f: OpFactory = opFactory()): { state: EntityState; f: OpFactory } {
  const qd = newEquipmentBlock({ blockId: BLOCK, equipmentId: EQUIPMENT, relatorioId: TEST_RELATORIO, projectId: TEST_PROJECT, locationId: LOCAL, type: QD, tag: 'QD-SUBESTACAO', seedVersion: 'v6', orderKey: 'a1' });
  const rows = new Map<EntityKey, EntityRow>([
    [entityKey('relatorio', TEST_RELATORIO), relatorio('v6')],
    [entityKey('location', LOCAL), local()],
    [entityKey('equipment', EQUIPMENT), qd.equipment],
  ]);
  let state: EntityState = rows;
  if (options.withCta === true) {
    const cta = newEquipmentBlock({ blockId: CTA_BLOCK, equipmentId: CTA_EQUIPMENT, relatorioId: TEST_RELATORIO, projectId: TEST_PROJECT, locationId: LOCAL, type: CTA, tag: 'CTA-SUBESTACAO', seedVersion: 'v6', orderKey: 'a0' });
    rows.set(entityKey('equipment', CTA_EQUIPMENT), cta.equipment);
    state = applyOp(state, f.op({ kind: 'create', path: blockPath(CTA_BLOCK), value: cta.block as unknown as JsonValue }));
  }
  state = applyOp(state, f.op({ kind: 'create', path: blockPath(BLOCK), value: qd.block as unknown as JsonValue }));
  return { state, f };
}

function puts(state: EntityState, f: OpFactory, writes: readonly [string, unknown][]): EntityState {
  let next = state;
  for (const [path, value] of writes) {
    const current = cellAt(next, parsePath(path));
    next = applyOp(next, f.op({ path, value: value as JsonValue, prev_op_id: current?.merge?.head_op_id ?? current?.op_id ?? null }));
  }
  return next;
}

const plate = (key: string) => sheetNameplatePath(BLOCK, key);
const reading = (row: number) => sheetTestCellPath(BLOCK, 'isolacao', row, MINUTO);
const blockOf = (state: EntityState): BlockRow => state.get(entityKey('block', BLOCK)) as BlockRow;
/** The QGBT with its TENSÃO NOMINAL (V, or a raw cell) and, when given, its SELV/PELV mark. */
function board(volts: JsonValue | null, selv?: string): BlockRow {
  const { state, f } = stateWith();
  const writes: [string, unknown][] = [];
  if (volts !== null) writes.push([plate('tensao_nominal'), volts]);
  if (selv !== undefined) writes.push([plate('circuito_selv_pelv'), selv]);
  return blockOf(puts(state, f, writes));
}
const test = () => definition().tests[0]!;

describe('the type in the palettes, its TAG and its words', () => {
  it('v6 offers it under "Outros equipamentos" after the CTA; v5 does not', () => {
    expect(paletteTypeGroups('v6')[1]).toEqual({ key: 'library', label: LIBRARY_GROUP_LABEL, types: [CTA, QD] });
    expect(paletteTypeGroups('v5')[1]!.types).toEqual([CTA]);
    const coluna = { kind: 'coluna' as const, name: 'Coluna 5' };
    const items = paletteItems('v6', coluna, []);
    expect(items.map((entry) => entry.type).slice(-2)).toEqual([CTA, QD]);
    expect(items.at(-1)).toEqual({ type: QD, label: 'Quadro elétrico (QGBT/QD)', tag: 'QD-C05', library: true, summary: '17 itens · até 1 ensaio' });
    expect(paletteItems('v5', coluna, []).some((entry) => entry.type === QD)).toBe(false);
    expect(libraryTypeSummaryText('v6', QD)).toBe('17 itens · até 1 ensaio');
    expect(libraryTypeSummaryText('v5', QD)).toBeNull();
  });

  it('the TAG prefix is QD by the existing rule, on a coluna and on a local', () => {
    expect(TAG_PREFIX[QD]).toBe('QD');
    expect(suggestTag(QD, { kind: 'coluna', name: 'Coluna 5' }, [])).toBe('QD-C05');
    expect(suggestTag(QD, { kind: 'cabine', name: 'Subestação' }, [{ tag: 'QD-SUBESTACAO', removed_at: null }])).toBe('QD-SUBESTACAO-2');
  });

  it('the template totals name it last, the stepper label, the caption word and the conclusion noun (masculine)', () => {
    expect(TOTALS_ORDER.at(-1)).toBe(QD);
    const zero = Object.fromEntries(TOTALS_ORDER.map((type) => [type, 0])) as Record<(typeof TOTALS_ORDER)[number], number>;
    expect(totalsText({ ...zero, [QD]: 1 })).toBe('1 quadro elétrico');
    expect(totalsText({ ...zero, [CTA]: 1, [QD]: 3 })).toBe('1 chave de transferência automática · 3 quadros elétricos');
    expect(quantityLabel(QD, 2)).toBe('Quadros elétricos, 2');
    expect(CAPTION_EQUIPMENT_WORDS[QD]).toEqual({ name: 'quadro elétrico', gender: 'm', number: 'singular' });
  });

  it('its default config switches on every sub-block but the IA/IP columns, as the para-raio\'s', () => {
    const config = defaultBlockConfig('v6', QD);
    expect(config.sub_blocks).toEqual({
      nameplate: { enabled: true },
      checklist: { enabled: true },
      isolacao: { enabled: true },
      ia_ip_display: { enabled: false },
      observations: { enabled: true },
      conclusion: { enabled: true },
    });
    expect(config.na_defaults).toEqual([]);
    expect(subBlockSummaryText(definition(), 'isolacao')).toBe('Fase A · Fase B · Fase C · Neutro × 1 minuto · >=0,5 MΩ até 500 V · >=1 MΩ até 1000 V · >=0,25 MΩ SELV/PELV (NBR 5410)');
    expect(subBlockSummaryText(definition(), 'nameplate')).toBe('10 campos');
  });

  it('matrix "QGBT on an old seed": a block create of the type on v1 to v5 is refused by the fold', () => {
    for (const seedVersion of ['v1', 'v4', 'v5']) {
      const f = opFactory();
      const { block } = newEquipmentBlock({ blockId: BLOCK, equipmentId: EQUIPMENT, relatorioId: TEST_RELATORIO, projectId: TEST_PROJECT, locationId: LOCAL, type: QD, tag: 'QD-1', seedVersion: 'v6', orderKey: 'a0' });
      const state: EntityState = new Map<EntityKey, EntityRow>([
        [entityKey('relatorio', TEST_RELATORIO), relatorio(seedVersion)],
        [entityKey('location', LOCAL), local()],
      ]);
      const op = f.op({ kind: 'create', path: blockPath(BLOCK), value: { ...block, seed_version: seedVersion } as unknown as JsonValue });
      expect(() => applyOp(state, op), seedVersion).toThrow(SeedPathError);
    }
  });
});

describe('matrix "Band criterion", "No criterion" and "SELV/PELV": the criterion from TENSÃO NOMINAL', () => {
  const value = (block: BlockRow) => bandCriterion(block, test());

  it('up to 500 V inclusive: >= 0,5 MΩ, NBR 5410; above 500 V up to 1000 V inclusive: >= 1,0 MΩ', () => {
    for (const volts of ['380', '220', '500', '0.5']) expect(value(board(num(volts, 'V'))), volts).toMatchObject({ operator: '>=', value: 0.5, unit: 'MΩ', source: { name: 'NBR 5410', edition: null } });
    for (const volts of ['501', '690', '1000']) expect(value(board(num(volts, 'V'))), volts).toMatchObject({ operator: '>=', value: 1, unit: 'MΩ', source: { name: 'NBR 5410' } });
    // A value stored in kV is moved into V.
    expect(value(board(num('0.69', 'kV')))?.value).toBe(1);
  });

  it('empty, not a number, zero or above 1000 V: no criterion, never a throw', () => {
    for (const volts of [null, num('1001', 'V'), num('13800', 'V'), num('0', 'V'), { raw: 'abc', unit: 'V', state: 'invalid' }, { raw: '', unit: 'V', state: 'not_measured' }]) {
      expect(value(board(volts as JsonValue | null)), JSON.stringify(volts)).toBeNull();
    }
  });

  it('a board marked SIM is judged >= 0,25 MΩ whatever its voltage; NÃO or empty reads the voltage bands, and an empty mark is never missing', () => {
    for (const volts of [null, num('380', 'V'), num('13800', 'V')]) expect(value(board(volts, 'SIM'))?.value, JSON.stringify(volts)).toBe(0.25);
    expect(value(board(num('380', 'V'), 'NÃO'))?.value).toBe(0.5);
    expect(value(board(num('690', 'V'), 'NÃO'))?.value).toBe(1);
    const missing = nameplateMissingKeys({ blocks: [board(num('380', 'V'))] }, BLOCK);
    expect(missing.has('circuito_selv_pelv')).toBe(false);
    expect([...missing]).toEqual(['identificacao', 'fabricante', 'n_serie', 'tipo', 'tipo_de_isolacao', 'data_de_fabricacao', 'corrente_de_curto', 'ip']);
  });
});

describe('the readings judged by the band', () => {
  const filled = (volts: string, readings: readonly string[], extra: [string, unknown][] = []) => {
    const { state, f } = stateWith();
    return blockOf(puts(state, f, [[plate('tensao_nominal'), num(volts, 'V')], ...readings.map((raw, row) => [reading(row), num(raw, 'MΩ')] as [string, unknown]), ...extra]));
  };

  it('four rows against MASSA; one under 0,5 MΩ at 380 V is out with the existing helper', () => {
    const block = filled('380', ['850', '1200', '0.4', '900']);
    const [evaluation] = evaluateSheetReadings(block, definition());
    expect(evaluation!.criterionText).toBe('>=0,5 MΩ');
    expect(evaluation!.sourceName).toBe('NBR 5410');
    expect(evaluation!.tables[0]!.rows.map((row) => row.connection)).toEqual(ROWS.map((phase) => [phase === 'NEUTRO' ? 'Neutro' : phase.replace('FASE', 'Fase'), 'Massa', '']));
    const cells = evaluatedCells([evaluation!]);
    expect(cells.map((cell) => cell.verdict)).toEqual(['within', 'within', 'out', 'within']);
    expect(cells[2]!.helperText).toBe('Abaixo do aceitável (>=0,5 MΩ)');
    expect(sheetProgress({ blocks: [block] }, BLOCK).steps.ensaios).toEqual({ missing: 0, outOfLimit: 1 });
  });

  it('matrix "Re-evaluation": TENSÃO NOMINAL 380 to 690 turns a 0,8 MΩ row from within to out', () => {
    const at380 = filled('380', ['850', '0.8', '900', '900']);
    expect(evaluatedCells(evaluateSheetReadings(at380, definition()))[1]!.verdict).toBe('within');
    const { state, f } = stateWith();
    const at690 = blockOf(puts(state, f, [[plate('tensao_nominal'), num('380', 'V')], [reading(1), num('0.8', 'MΩ')], [plate('tensao_nominal'), num('690', 'V')]]));
    const cell = evaluatedCells(evaluateSheetReadings(at690, definition()))[1]!;
    expect(cell.verdict).toBe('out');
    expect(cell.helperText).toBe('Abaixo do aceitável (>=1 MΩ)');
  });

  it('with no criterion no row is judged, the test reads "critério não avaliado", and no Sem restrições is suggested', () => {
    const block = filled('13800', ['850', '1200', '0.4', '900']);
    const [evaluation] = evaluateSheetReadings(block, definition());
    expect(evaluation!.criterion).toBeNull();
    expect(evaluation!.criterionText).toBe(CRITERION_NOT_EVALUATED);
    expect(CRITERION_NOT_EVALUATED).toBe('critério não avaliado');
    expect(evaluation!.sourceName).toBe('NBR 5410');
    expect(evaluatedCells([evaluation!]).every((cell) => cell.verdict === null && cell.helperText === null)).toBe(true);
    expect(worstReadings([evaluation!])).toEqual([]);
    expect(suggestConclusionPair(block)).toBeNull();
    // An NC item still suggests the restriction.
    const withNc = filled('13800', ['850'], [[sheetChecklistPath(BLOCK, 'barramentos', 'result'), 'NC']]);
    expect(suggestConclusionPair(withNc)).toEqual({ result: 'aprovado', restriction: 'com_restricoes' });
    // Measured but never judged: the text says so.
    expect(composeConclusion(block, definition(), 'QD-01').text).toContain('valores medidos sem comparação com o critério de aceitação');
  });

  it('an NC item and an out reading: "Aprovado · Com restrições?" and a text naming both', () => {
    const block = filled('380', ['850', '1200', '0.4', '900'], [
      [sheetChecklistPath(BLOCK, 'barramentos', 'result'), 'NC'],
      [sheetChecklistPath(BLOCK, 'barramentos', 'observation'), 'oxidação no barramento'],
    ]);
    expect(suggestConclusionPair(block)).toEqual({ result: 'aprovado', restriction: 'com_restricoes' });
    const text = composeConclusion(block, definition(), 'QD-01').text;
    expect(text.startsWith('O quadro elétrico QD-01 (380 V) apresentou resistência de isolação mínima de 0,4 MΩ em Fase C–Massa (critério: >=0,5 MΩ, NBR 5410)')).toBe(true);
    expect(text).toContain('oxidação no barramento (item 11, NC)');
  });
});

describe('section 9 of a QGBT', () => {
  const snapshotOf = (state: EntityState): RelatorioSnapshot => ({ ...buildSnapshot(state, TEST_RELATORIO), actors: [] });
  const tableNamed = (sheet: PrintSheet, name: string): PrintTable => {
    const part = sheet.parts.find((p): p is Extract<SheetPart, { kind: 'table' }> => p.kind === 'table' && p.table.rows[0]!.cells[0]!.text === name);
    if (part === undefined) throw new Error(`no table "${name}"`);
    return part.table;
  };
  const texts = (table: PrintTable) => table.rows.map((row) => row.cells.map((cell) => cell.text));

  function filledState(volts: string | null) {
    const { state, f } = stateWith({ withCta: true });
    return puts(state, f, [
      ...(volts === null ? [] : [[plate('tensao_nominal'), num(volts, 'V')] as [string, unknown]]),
      [plate('ip'), 'IP54'],
      ...ROWS.map((_, row) => [reading(row), num(row === 2 ? '0.4' : '850', 'MΩ')] as [string, unknown]),
      [sheetChecklistPath(BLOCK, 'disjuntores_termomagneticos', 'result'), 'NC'],
      [sheetChecklistPath(BLOCK, 'disjuntores_termomagneticos', 'observation'), 'disjuntor não atua no trip'],
      [sheetChecklistPath(BLOCK, 'organizacao_interna', 'result'), 'C'],
      [sheetObservationsPath(BLOCK), 'Quadro com acesso restrito.'],
      [sheetConclusionPath(BLOCK, 'result'), 'reprovado'],
      [sheetConclusionPath(BLOCK, 'restriction'), 'com_restricoes'],
    ]);
  }

  it('prints in "Outros equipamentos" after the CTA, titled QGBT/QD\'s with its TAG', () => {
    const snapshot = snapshotOf(filledState('380'));
    expect(groupForPrint(snapshot).subsections.map((s) => [s.kind, s.title, s.blockIds])).toEqual([['outros', 'Outros equipamentos da Subestação', [CTA_BLOCK, BLOCK]]]);
    const layout = section9Layout(snapshot, 9, 'RELATÓRIOS DOS ENSAIOS')!;
    const sheets = layout.subsections.flatMap((subsection) => subsection.sheets);
    expect(sheets.map((sheet) => sheet.title)).toEqual(['CHAVE DE TRANSFERÊNCIA AUTOMÁTICA CTA-SUBESTACAO', "QGBT/QD's QD-SUBESTACAO"]);
  });

  it('DADOS DO EQUIPAMENTO, VERIFICAÇÕES GERAIS without the hints, the insulation with ACEITÁVEL MΩ the band minimum, OBSERVAÇÕES and CONCLUSÃO', () => {
    const sheet = section9Layout(snapshotOf(filledState('380')), 9, 'RELATÓRIOS DOS ENSAIOS')!.subsections[0]!.sheets[1]!;
    const nameplate = texts(tableNamed(sheet, 'DADOS DO EQUIPAMENTO')).flat();
    expect(nameplate).toEqual(expect.arrayContaining(['FABRICANTE', 'TENSÃO NOMINAL', '380 V', 'IP', 'IP54', 'CIRCUITO SELV/PELV', 'CORRENTE DE CURTO']));
    const checklist = texts(tableNamed(sheet, 'VERIFICAÇÕES GERAIS'));
    expect(checklist.slice(2).map((row) => row[0])).toEqual(definition().checklist!.map((item, index) => `${index + 1}. ${item.label}`));
    expect(checklist[9]).toEqual(['8. DISJUNTORES TERMOMAGNÉTICOS', '', 'X', '', 'disjuntor não atua no trip']);
    expect(checklist[17]).toEqual(['16. ORGANIZAÇÃO INTERNA', 'X', '', '', '']);
    const all = JSON.stringify(sheet);
    expect(all).not.toContain('FUNCIONAMENTO MECÂNICO');
    expect(all).not.toContain('CANALETA, CHICOTE');
    const instrument = texts(tableNamed(sheet, 'ENSAIO DE ISOLAÇÃO'));
    expect(instrument[1]).toEqual(['INSTRUM./FABRIC.', 'TIPO', 'Nº SÉRIE', 'RBC', 'TENSÃO ENSAIO', 'ACEITÁVEL MΩ']);
    expect(instrument[2]!.at(-1)).toBe('0,5');
    expect(sheet.parts).toContainEqual({ kind: 'paragraph', text: 'CRITÉRIO: >=0,5 MΩ · NBR 5410' });
    const measurement = sheet.parts.filter((part): part is Extract<SheetPart, { kind: 'table' }> => part.kind === 'table').map((part) => texts(part.table));
    const values = measurement.find((rows) => rows.some((row) => row[0] === 'NEUTRO'))!;
    expect(values.filter((row) => ['FASE A', 'FASE B', 'FASE C', 'NEUTRO'].includes(row[0]!)).map((row) => row.slice(0, 5))).toEqual([
      ['FASE A', 'MASSA', '', '-', '850 MΩ'],
      ['FASE B', 'MASSA', '', '-', '850 MΩ'],
      ['FASE C', 'MASSA', '', '-', '0,4 MΩ'],
      ['NEUTRO', 'MASSA', '', '-', '850 MΩ'],
    ]);
    expect(texts(tableNamed(sheet, 'OBSERVAÇÕES'))[1]).toEqual(['Quadro com acesso restrito.']);
    expect(texts(tableNamed(sheet, 'CONCLUSÃO'))[1]).toEqual(['APROVADO', '', 'REPROVADO', 'X', 'SEM RESTRIÇÕES', '', 'COM RESTRIÇÕES (VER OBSERVAÇÕES)', 'X']);
  });

  it('with 1,0 MΩ above 500 V, and "-" when no band applies', () => {
    const at690 = section9Layout(snapshotOf(filledState('690')), 9, 'RELATÓRIOS DOS ENSAIOS')!.subsections[0]!.sheets[1]!;
    expect(texts(tableNamed(at690, 'ENSAIO DE ISOLAÇÃO'))[2]!.at(-1)).toBe('1,0');
    const none = section9Layout(snapshotOf(filledState(null)), 9, 'RELATÓRIOS DOS ENSAIOS')!.subsections[0]!.sheets[1]!;
    expect(texts(tableNamed(none, 'ENSAIO DE ISOLAÇÃO'))[2]!.at(-1)).toBe('-');
    expect(none.parts).toContainEqual({ kind: 'paragraph', text: 'CRITÉRIO: critério não avaliado · NBR 5410' });
  });
});
