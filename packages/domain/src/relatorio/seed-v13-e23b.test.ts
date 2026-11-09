import { describe, expect, it } from 'vitest';
import { portoSeguroSmall } from '../../fixtures/porto-seguro/small/op-log.ts';
import { applyOp, entityKey, SeedPathError, type EntityState } from '../ops/apply.ts';
import { replay } from '../ops/replay.ts';
import { lastResults, previousHelpers } from '../print/last-results.ts';
import { section9Layout, type LayoutSectionSheets, type PrintTable, type SheetPart } from '../print/section-9.ts';
import type { EquipmentBlockType } from '../schemas/block-config.ts';
import type { BlockRow, Cell } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { EMPTY_DEFINITION_CONTEXT, getDefinition } from '../seed/definitions.ts';
import { blockDefinitionSchema, type BlockDefinition } from '../seed/schema.ts';
import { opFactory, TEST_PROJECT, TEST_RELATORIO } from '../test-support.ts';
import { duplicateSeededType } from '../types/duplicate.ts';
import { validateTypeDraft } from '../types/validate.ts';
import { nameplateMissingKeys } from './dry-insulation.ts';
import { fieldValueText, nameplateFieldInput, numberFieldValue } from './ficha.ts';
import { isOilFieldExcused } from './oil-rule.ts';
import { cellAddressesOf, evaluateSheetReadings, evaluatedCells, failedRatioRows, firstRunCell, ratioRowCondicaoText, runTarget, type TestEvaluation } from './readings.ts';
import { sheetProgress } from './sheet-progress.ts';
import { plateTaps, TAP_PICKER_NOT_APPLICABLE_KEY, tapMarkText, tapOptionText, tapPickerOf, tapRowAccepted, tapsHelperText, tapsLineText } from './tap-rows.ts';
import { newEquipmentBlock } from './tree.ts';

/*
 * Stories 23.7 and 23.8 (seed v13, batch e23b): the kernel over v13 sheets built by hand, one
 * test per row of the spec's I/O matrix the kernel answers: the nameplate fields of decision K,
 * the list and √3 values, the TC's dash ratio and the TTR per tap, against v12 sheets that answer
 * as before. Sample values are invented (never Bruno's base).
 */

const id = (n: number) => `019966b0-0e23-7000-8000-${n.toString(16).padStart(12, '0')}`;
let opCounter = 0;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: id(70_000 + ++opCounter) });
const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' as const });

function sheet(type: EquipmentBlockType, seedVersion = 'v13', n = 1): BlockRow {
  return structuredClone(
    newEquipmentBlock({ definitions: EMPTY_DEFINITION_CONTEXT, blockId: id(n), equipmentId: id(100 + n), relatorioId: TEST_RELATORIO, projectId: TEST_PROJECT, locationId: id(999), type, tag: `T${n}`, seedVersion, orderKey: `a${n}` }).block,
  );
}

function withNameplate(block: BlockRow, values: Record<string, unknown>): BlockRow {
  for (const [key, value] of Object.entries(values)) block.sheet.nameplate[key] = cell(value);
  return block;
}

function withTest(block: BlockRow, testKey: string, cells: Record<string, unknown>): BlockRow {
  const test = block.sheet.test[testKey] ?? { cells: {} };
  for (const [address, value] of Object.entries(cells)) {
    const [row, col] = address.split('/') as [string, string];
    test.cells[row] = { ...test.cells[row], [col]: cell(value) };
  }
  block.sheet.test[testKey] = test;
  return block;
}

const definitionOf = (block: BlockRow): BlockDefinition => getDefinition(block.seed_version, 'cabine_primaria', block.block_type);
const labels = (version: string, type: EquipmentBlockType) => getDefinition(version, 'cabine_primaria', type).nameplate.map((field) => field.label);
const ratioOf = (block: BlockRow): TestEvaluation => evaluateSheetReadings(block, definitionOf(block)).find((test) => test.testKey === 'relacao_transformacao')!;

/** A v13 transformer with five taps, the third in service, on a Dyn1 plate of 13,8 kV over 380 V. */
const FIVE_TAPS = measured('13.8;13.2;12.6;12;11.4', 'kV');
function fiveTaps(extra: Record<string, unknown> = {}): BlockRow {
  return withNameplate(sheet('transformador_forca'), {
    taps: FIVE_TAPS,
    tap_atual_kv: measured('12.6', 'kV'),
    tensao_nominal_at: measured('13.8', 'kV'),
    tensao_nominal_bt: measured('380', 'V'),
    ligacao_secundaria: 'Dyn1',
    ...extra,
  });
}

/** The three captures of a ratio row (cols 3 to 5 of the transformer's TTR). */
const captures = (row: number, value = '62.9') => ({ [`${row}/3`]: measured(value, null), [`${row}/4`]: measured(value, null), [`${row}/5`]: measured(value, null) });

describe('23.7-UNIT the v13 nameplate fields (decision K)', () => {
  it('the transformador de força: TAPS and TAP ATUAL in place of the text TAP ATUAL, the new fields after DESLOCAMENTO ANGULAR', () => {
    const v12 = labels('v12', 'transformador_forca');
    const v13 = labels('v13', 'transformador_forca');
    const at = v12.indexOf('TAP ATUAL');
    // Batch e23t (Story 23.17): TIPO DO ÓLEO gave way in place to NATUREZA DO LÍQUIDO and TIPO (ANP), one label more before TAPS.
    expect(v13.slice(0, at + 1)).toEqual(v12.slice(0, at).flatMap((label) => (label === 'TIPO DO ÓLEO' ? ['NATUREZA DO LÍQUIDO', 'TIPO (ANP)'] : [label])));
    expect(v13.slice(at + 1, at + 3)).toEqual(['TAPS', 'TAP ATUAL']);
    const group = v13.indexOf('DESLOCAMENTO ANGULAR');
    expect(v13.slice(group + 1)).toEqual(['IMPEDÂNCIA', 'MATERIAL DO ENROLAMENTO', 'TEMPERATURA DO ÓLEO', 'TEMPERATURA DO ENROLAMENTO', 'CLASSE TÉRMICA']);
    const fields = getDefinition('v13', 'cabine_primaria', 'transformador_forca').nameplate;
    const field = (key: string) => fields.find((one) => one.key === key)!;
    expect(field('taps')).toMatchObject({ kind: 'number', unit: 'kV', list: true });
    expect(field('tap_atual_kv')).toMatchObject({ kind: 'number', unit: 'kV', pick_from: 'taps' });
    expect(fields.some((one) => one.key === 'tap_atual')).toBe(false);
    expect(field('material_enrolamento')).toMatchObject({ kind: 'select', options: ['Cu', 'Al'] });
    expect(field('material_enrolamento').optional).toBeUndefined();
    for (const key of ['impedancia_pct', 'temperatura_oleo_c', 'temperatura_enrolamento_c', 'classe_termica']) expect(field(key).optional, key).toBe(true);
    expect(getDefinition('v13', 'cabine_primaria', 'transformador_forca').tests.find((test) => test.key === 'relacao_transformacao')!.tables[0]!.rows_from).toBe('taps');
  });

  it('the temperature the insulation calls for: an oil unit excuses the winding and CLASSE TÉRMICA, a dry one the oil; unknown excuses neither', () => {
    // Batch e23t (Story 23.17, M-4): v13's oil option is ÓLEO ISOLANTE.
    const oil = withNameplate(sheet('transformador_forca'), { tipo_de_isolacao: 'ÓLEO ISOLANTE' });
    const dry = withNameplate(sheet('transformador_forca'), { tipo_de_isolacao: 'EPÓXI' });
    const unknown = sheet('transformador_forca');
    const excused = (block: BlockRow) => ['temperatura_oleo_c', 'temperatura_enrolamento_c', 'classe_termica'].filter((key) => isOilFieldExcused(block, key, EMPTY_DEFINITION_CONTEXT));
    expect(excused(oil)).toEqual(['temperatura_enrolamento_c', 'classe_termica']);
    expect(excused(dry)).toEqual(['temperatura_oleo_c']);
    expect(excused(unknown)).toEqual([]);
    // v12's oil fields keep their rule.
    expect(isOilFieldExcused(dry, 'vol_oleo', EMPTY_DEFINITION_CONTEXT)).toBe(true);
    expect(isOilFieldExcused(oil, 'vol_oleo', EMPTY_DEFINITION_CONTEXT)).toBe(false);
  });

  it('the other types gain their fields after v12\'s; the seccionadora\'s ACIONAMENTO offers MOTORIZADO; the cables open with a nameplate', () => {
    const tail = (type: EquipmentBlockType, n: number) => labels('v13', type).slice(-n);
    expect(labels('v13', 'disjuntor_mt').slice(0, labels('v12', 'disjuntor_mt').length)).toEqual(labels('v12', 'disjuntor_mt'));
    expect(tail('disjuntor_mt', 6)).toEqual(['MONTAGEM', 'TENSÃO DE COMANDO', 'ACIONAMENTO', 'CONTADOR DE OPERAÇÕES', 'TEMPO DE ABERTURA DO FABRICANTE', 'TEMPO DE FECHAMENTO DO FABRICANTE']);
    expect(tail('chave_seccionadora', 2)).toEqual(['TIPO DE SECCIONADORA', 'CORRENTE DO FUSÍVEL']);
    expect(getDefinition('v13', 'cabine_primaria', 'chave_seccionadora').nameplate.find((field) => field.key === 'acionamento')!.options).toEqual(['MANUAL/PUNHO', 'MOTORIZADO']);
    expect(getDefinition('v12', 'cabine_primaria', 'chave_seccionadora').nameplate.find((field) => field.key === 'acionamento')!.options).toEqual(['MANUAL/PUNHO']);
    expect(tail('tp', 1)).toEqual(['GRUPO DE LIGAÇÃO']);
    expect(getDefinition('v13', 'cabine_primaria', 'tp').nameplate.filter((field) => field.over_sqrt3 === true).map((field) => field.key)).toEqual(['tensao_nominal_at', 'tensao_nominal_bt']);
    expect(getDefinition('v13', 'cabine_primaria', 'tc').nameplate.find((field) => field.key === 'relacao')!.dash_ratio).toBe(true);
    expect(tail('para_raio', 3)).toEqual(['MCOV', 'INVÓLUCRO', 'DESLIGADOR ÍNTEGRO']);
    for (const type of ['cabos_entrada', 'cabos_saida'] as const) {
      expect(labels('v12', type)).toEqual([]);
      expect(labels('v13', type), type).toEqual(['CLASSE U0/U', 'ISOLAÇÃO', 'SEÇÃO', 'COMPRIMENTO', 'TERMINAÇÃO', 'CONDIÇÃO']);
      expect(getDefinition('v13', 'cabine_primaria', type).sub_blocks[0]).toBe('nameplate');
    }
  });

  it('a para-raio with DESLIGADOR ÍNTEGRO empty counts it missing, as a required field; MCOV and INVÓLUCRO too', () => {
    const block = withNameplate(sheet('para_raio'), { mcov_kv: measured('12', 'kV'), involucro: 'POLIMÉRICO' });
    const missing = nameplateMissingKeys({ blocks: [block], equipment_types: [] }, block.id);
    expect(missing.has('desligador_integro')).toBe(true);
    expect(missing.has('mcov_kv')).toBe(false);
    expect(sheetProgress({ blocks: [block] }, block.id).steps.placa.missing).toBe(missing.size);
    const filled = withNameplate(structuredClone(block), { desligador_integro: 'SIM' });
    expect(nameplateMissingKeys({ blocks: [filled], equipment_types: [] }, filled.id).has('desligador_integro')).toBe(false);
  });

  it('the optional fields never count missing: IMPEDÂNCIA, the temperatures, CLASSE TÉRMICA, the disjuntor\'s counter and times, the fuse current', () => {
    const transformer = nameplateMissingKeys({ blocks: [sheet('transformador_forca')], equipment_types: [] }, id(1));
    for (const key of ['impedancia_pct', 'temperatura_oleo_c', 'temperatura_enrolamento_c', 'classe_termica']) expect(transformer.has(key), key).toBe(false);
    for (const key of ['taps', 'tap_atual_kv', 'material_enrolamento']) expect(transformer.has(key), key).toBe(true);
    const breaker = nameplateMissingKeys({ blocks: [sheet('disjuntor_mt')], equipment_types: [] }, id(1));
    for (const key of ['contador_operacoes', 'tempo_abertura_fab_ms', 'tempo_fechamento_fab_ms']) expect(breaker.has(key), key).toBe(false);
    for (const key of ['tipo_montagem', 'tensao_comando_v', 'acionamento']) expect(breaker.has(key), key).toBe(true);
    const seccionadora = nameplateMissingKeys({ blocks: [sheet('chave_seccionadora')], equipment_types: [] }, id(1));
    expect(seccionadora.has('fusivel_corrente_a')).toBe(false);
    expect(seccionadora.has('tipo_seccionadora')).toBe(true);
  });

  it('the input flags the sheet reads: a list and √3 take text; every v12 field the decimal keypad', () => {
    const fields = getDefinition('v13', 'cabine_primaria', 'transformador_forca').nameplate;
    expect(nameplateFieldInput(fields.find((field) => field.key === 'taps')!)).toEqual({ list: true, sqrt3: false, pickFrom: null, inputMode: 'text' });
    expect(nameplateFieldInput(fields.find((field) => field.key === 'tap_atual_kv')!)).toEqual({ list: false, sqrt3: false, pickFrom: 'taps', inputMode: 'decimal' });
    const tp = getDefinition('v13', 'cabine_primaria', 'tp').nameplate.find((field) => field.key === 'tensao_nominal_bt')!;
    expect(nameplateFieldInput(tp)).toEqual({ list: false, sqrt3: true, pickFrom: null, inputMode: 'text' });
    for (const field of getDefinition('v12', 'cabine_primaria', 'tp').nameplate) expect(nameplateFieldInput(field), field.key).toEqual({ list: false, sqrt3: false, pickFrom: null, inputMode: 'decimal' });
  });
});

describe('23.7-UNIT TAPS and "N/√3" typed, stored and shown', () => {
  it('TAPS: "13,8; 13,2; 12,6; 12; 11,4" (or with "·" or spaces) stores the dot-decimal list and shows it with "·"; the helper counts the taps', () => {
    for (const typed of ['13,8; 13,2; 12,6; 12; 11,4', '13,8 · 13,2 · 12,6 · 12 · 11,4', '13,8 13,2 12,6 12 11,4']) {
      expect(numberFieldValue(typed, 'kV', { list: true }), typed).toEqual(FIVE_TAPS);
    }
    const field = { kind: 'number' as const, list: true as const };
    expect(fieldValueText(field, FIVE_TAPS)).toBe('13,8 · 13,2 · 12,6 · 12 · 11,4');
    expect(tapsHelperText(FIVE_TAPS)).toBe('Na ordem da placa · 5 taps');
    expect(tapsHelperText(null)).toBe('Na ordem da placa');
  });

  it('TAPS refuses a repeated value, a non-number, a value not whole in V and one entry alone; N/A stays N/A', () => {
    for (const typed of ['13,8; 13,8', '13,8; doze', '13,8505; 13,2', '13,8', '13,8; -13,2', '13,8; 0']) expect(numberFieldValue(typed, 'kV', { list: true }), typed).toBe('invalid');
    expect(numberFieldValue('N/A', 'kV', { list: true })).toEqual({ raw: '', unit: null, state: 'not_applicable' });
    // Without the flag a list is no number, as on v12.
    expect(numberFieldValue('13,8; 13,2', 'kV')).toBe('invalid');
  });

  it('"115/√3", "115/V3", "115/raiz3" in any case store "115/√3" and show it; "/√3" alone and "x/√2" are refused; v12 refuses all of them', () => {
    for (const typed of ['115/√3', '115/V3', '115/v3', '115/raiz3', '115 / RAIZ 3']) expect(numberFieldValue(typed, 'V', { sqrt3: true }), typed).toEqual(measured('115/√3', 'V'));
    expect(numberFieldValue('13,8/√3', 'kV', { sqrt3: true })).toEqual(measured('13.8/√3', 'kV'));
    for (const typed of ['/√3', '115/√2', 'x/√3']) expect(numberFieldValue(typed, 'V', { sqrt3: true }), typed).toBe('invalid');
    expect(numberFieldValue('115', 'V', { sqrt3: true })).toEqual(measured('115', 'V'));
    expect(numberFieldValue('115/√3', 'V')).toBe('invalid');
    expect(fieldValueText({ kind: 'number', over_sqrt3: true }, measured('13.8/√3', 'kV'))).toBe('13,8/√3');
    expect(fieldValueText({ kind: 'number', over_sqrt3: true }, measured('115', 'V'))).toBe('115');
  });

  it('TAP ATUAL lists the taps as "N — V kV"', () => {
    expect(tapOptionText(3, '12,6', 'kV')).toBe('3 — 12,6 kV');
    expect(tapsLineText(5)).toBe('Taps da placa 5 · medir o tap atual e os extremos (marcados) · os outros são opcionais');
  });

  it('the TAP ATUAL picker reads TAPS as the TTR does: a list with a repeat or a tap not whole in V lists nothing, as the table falls back to its seeded row', () => {
    const definition = getDefinition('v13', 'cabine_primaria', 'transformador_forca');
    const field = definition.nameplate.find((f) => f.key === 'tap_atual_kv')!;
    const table = definition.tests.find((test) => test.key === 'relacao_transformacao')!.tables[0]!;
    for (const raw of ['13.8;13.80', '13.8;13.2004']) {
      const block = withNameplate(sheet('transformador_forca'), { taps: measured(raw, 'kV') });
      expect(plateTaps(block, definition, table), raw).toBeNull();
      expect(tapPickerOf(block, definition, field), raw).toBeNull();
    }
    expect(tapPickerOf(fiveTaps(), definition, field)?.options).toHaveLength(5);
  });

  it('the TAP ATUAL picker offers "N/A" where the field takes it, and a stored N/A selects it', () => {
    const definition = getDefinition('v13', 'cabine_primaria', 'transformador_forca');
    const field = definition.nameplate.find((f) => f.key === 'tap_atual_kv')!;
    const offered = tapPickerOf(fiveTaps(), definition, field, { acceptsNotApplicable: true })!;
    expect(offered.options.map((option) => option.label)).toEqual(['1 — 13,8 kV', '2 — 13,2 kV', '3 — 12,6 kV', '4 — 12 kV', '5 — 11,4 kV', 'N/A']);
    expect(offered.options.at(-1)).toEqual({ key: TAP_PICKER_NOT_APPLICABLE_KEY, label: 'N/A', raw: null });
    expect(offered.selectedKey).toBe('3');
    const stored = tapPickerOf(fiveTaps({ tap_atual_kv: { raw: '', unit: null, state: 'not_applicable' } }), definition, field)!;
    expect(stored.selectedKey).toBe(TAP_PICKER_NOT_APPLICABLE_KEY);
    expect(stored.options.at(-1)?.label).toBe('N/A');
  });

  it('rows_from belongs to a table of one seeded row and one connection column: a copy with a row or a column added is refused', () => {
    const base = structuredClone(getDefinition('v13', 'cabine_primaria', 'transformador_forca')) as BlockDefinition;
    const t = base.tests.findIndex((test) => test.key === 'relacao_transformacao');
    const withTable = (change: (table: BlockDefinition['tests'][number]['tables'][number]) => void) => {
      const copy = structuredClone(base);
      change(copy.tests[t]!.tables[0]!);
      return blockDefinitionSchema.safeParse(copy).error?.issues.map((issue) => [issue.path.join('.'), issue.message]);
    };
    expect(blockDefinitionSchema.safeParse(base).success).toBe(true);
    const refused = [[`tests.${t}.tables.0.rows_from`, 'rows_from belongs to a table of one seeded row and one connection column']];
    expect(withTable((table) => table.rows.push(['']))).toEqual(refused);
    expect(
      withTable((table) => {
        table.connection_columns.push('OUTRA');
        table.rows = table.rows.map((row) => [...row, '']);
      }),
    ).toEqual(refused);
    // A company copy with a row added says it in pt-BR on the Ensaios tab.
    const copy = duplicateSeededType('v13', 'transformador_forca').draft;
    copy.tests[t]!.tables[0]!.rows.push(['']);
    expect(validateTypeDraft(copy).map((issue) => [issue.part, issue.message])).toEqual([
      ['ensaios', 'ENSAIO DE RELAÇÃO DE TRANSFORMAÇÃO: as linhas vêm da lista de taps da placa; mantenha a tabela com uma linha e uma coluna de conexão.'],
    ]);
  });
});

describe('23.7-UNIT the TP\'s "115/√3" and the TC\'s "200-5" read by the ratio test', () => {
  it('a v13 TP with "13,8/√3" kV over "115/√3" V computes VAL CALCULADO from both, √3 over √3', () => {
    const tp = withNameplate(sheet('tp'), { tensao_nominal_at: measured('13.8/√3', 'kV'), tensao_nominal_bt: measured('115/√3', 'V') });
    const row = ratioOf(tp).tables[0]!.rows[0]!;
    expect(row.cells.filter((one) => one.role === 'input').map((one) => one.fallback?.text)).toEqual(['13.800/√3', '115/√3']);
    expect(row.calculated?.text).toBe('120,00');
    expect(Number(row.calculated!.raw)).toBeCloseTo(120, 5);
  });

  it('a v13 TC "200-5" (and "200-5 A") reads 200 and 5 and computes VAL CALCULADO; a v12 TC "200-5" stays without it', () => {
    for (const ratio of ['200-5', '200-5 A', '200/5']) {
      const tc = withNameplate(sheet('tc'), { relacao: ratio });
      const row = ratioOf(tc).tables[0]!.rows[0]!;
      expect(row.cells.filter((one) => one.role === 'input').map((one) => one.fallback?.raw), ratio).toEqual(['200', '5']);
      expect(row.calculated?.text, ratio).toBe('40,00');
    }
    const v12 = withNameplate(sheet('tc', 'v12'), { relacao: '200-5' });
    expect(ratioOf(v12).tables[0]!.rows[0]!.calculated).toBeNull();
  });
});

describe('23.8-UNIT the TTR has one row per tap of the plate', () => {
  it('five taps with the third in service: five rows in plate order keyed by volts, rows 1, 3, 5 marked, each VAL CALCULADO from its tap', () => {
    const table = ratioOf(fiveTaps()).tables[0]!;
    expect(table.rows.map((row) => row.row)).toEqual([13800, 13200, 12600, 12000, 11400]);
    expect(table.rows.map((row) => row.connection[0])).toEqual(['1', '2', '3', '4', '5']);
    expect(table.rows.map((row) => row.label)).toEqual(['Tap 1', 'Tap 2', 'Tap 3', 'Tap 4', 'Tap 5']);
    expect(table.rows.map((row) => tapMarkText(row.tap))).toEqual(['Extremo', null, 'Atual', null, 'Extremo']);
    expect(table.rows.map((row) => row.cells[0]!.fallback?.text)).toEqual(['13,8', '13,2', '12,6', '12', '11,4']);
    expect(table.rows.map((row) => row.cells[1]!.fallback?.text)).toEqual(['380', '380', '380', '380', '380']);
    expect(table.rows.map((row) => row.calculated?.text)).toEqual(['62,90', '60,17', '57,43', '54,70', '51,96']);
    expect(table.rows.map((row) => ratioRowCondicaoText(row))).toEqual(['—', 'Não medido', '—', 'Não medido', '—']);
  });

  it('readings on rows 1, 3 and 5 only complete the test; a marked row left empty counts its captures missing, an unmarked one nothing', () => {
    const missingOf = (block: BlockRow) => evaluatedCells([ratioOf(block)]).filter((one) => one.missing).length;
    expect(missingOf(fiveTaps())).toBe(9);
    const done = withTest(fiveTaps(), 'relacao_transformacao', { ...captures(13800, '62.9'), ...captures(12600, '57.43'), ...captures(11400, '51.96') });
    expect(missingOf(done)).toBe(0);
    expect(ratioOf(done).tables[0]!.rows.map((row) => row.condicao)).toEqual(['SATISFATÓRIO', null, 'SATISFATÓRIO', null, 'SATISFATÓRIO']);
    const partial = withTest(fiveTaps(), 'relacao_transformacao', { ...captures(13800), ...captures(12600, '57.43') });
    expect(missingOf(partial)).toBe(3);
    // An unmarked row filled is judged as any row.
    const extra = withTest(structuredClone(done), 'relacao_transformacao', captures(13200, '70'));
    expect(ratioOf(extra).tables[0]!.rows[1]!.condicao).toBe('INSATISFATÓRIO');
    expect(failedRatioRows([ratioOf(extra)]).map((row) => row.label)).toEqual(['TAP 2']);
  });

  it('a tap dropped from TAPS keeps its row and reading after the plate rows, flagged off the plate, judged and never missing', () => {
    const block = withTest(fiveTaps(), 'relacao_transformacao', captures(12600, '70'));
    block.sheet.nameplate.taps = cell(measured('13.8;13.2;12;11.4', 'kV'));
    const table = ratioOf(block).tables[0]!;
    expect(table.rows.map((row) => row.row)).toEqual([13800, 13200, 12000, 11400, 12600]);
    const off = table.rows[4]!;
    expect(off.tap).toEqual({ position: null, volts: 12600, mark: null, onPlate: false, name: '12,6 kV' });
    expect(tapMarkText(off.tap)).toBe('Fora da placa');
    expect(off.connection).toEqual(['']);
    expect(off.cells.every((one) => !one.missing)).toBe(true);
    expect(off.condicao).toBe('INSATISFATÓRIO');
    expect(failedRatioRows([ratioOf(block)]).map((row) => row.label)).toEqual(['TAP 12,6 kV']);
    // TAP ATUAL left the list: the extremes alone are marked.
    expect(table.rows.slice(0, 4).map((row) => tapMarkText(row.tap))).toEqual(['Extremo', null, null, 'Extremo']);
  });

  it('TAPS empty (or unreadable): v12\'s one typed row, row 0, with the plate\'s fallbacks; a row 0 typed before TAPS stays off the plate once TAPS is filled', () => {
    const empty = withNameplate(sheet('transformador_forca'), { tensao_nominal_at: measured('13.8', 'kV'), tensao_nominal_bt: measured('380', 'V'), ligacao_secundaria: 'Dyn1' });
    const table = ratioOf(empty).tables[0]!;
    expect(table.rows.map((row) => [row.row, row.tap])).toEqual([[0, null]]);
    expect(table.rows[0]!.calculated?.text).toBe('62,90');
    const single = withNameplate(structuredClone(empty), { taps: measured('13.8', 'kV') });
    expect(ratioOf(single).tables[0]!.rows.map((row) => row.row)).toEqual([0]);
    const typedBefore = withTest(structuredClone(empty), 'relacao_transformacao', captures(0, '62.9'));
    typedBefore.sheet.nameplate.taps = cell(FIVE_TAPS);
    const rows = ratioOf(typedBefore).tables[0]!.rows;
    expect(rows.map((row) => row.row)).toEqual([13800, 13200, 12600, 12000, 11400, 0]);
    expect(rows[5]!.tap).toEqual({ position: null, volts: null, mark: null, onPlate: false, name: null });
    expect(rows[5]!.calculated?.text).toBe('62,90');
  });

  it('a v12 transformer keeps its one typed row, unchanged', () => {
    const v12 = withNameplate(sheet('transformador_forca', 'v12'), { tensao_nominal_at: measured('13.8', 'kV'), tensao_nominal_bt: measured('380', 'V'), ligacao_secundaria: 'Dyn1', tap_atual: '3' });
    const rows = ratioOf(v12).tables[0]!.rows;
    expect(rows.map((row) => [row.row, row.connection, row.tap])).toEqual([[0, ['3'], null]]);
  });

  it('the cell addresses and the fold follow the plate: a tap row is written, a row off the plate or outside it refused', () => {
    const block = fiveTaps();
    const definition = definitionOf(block);
    expect([...new Set(cellAddressesOf(definition, 'relacao_transformacao', block).map((address) => address.row))]).toEqual([13800, 13200, 12600, 12000, 11400]);
    expect([...new Set(cellAddressesOf(definition, 'relacao_transformacao').map((address) => address.row))]).toEqual([0]);
    const table = definition.tests.find((test) => test.key === 'relacao_transformacao')!.tables[0]!;
    expect(plateTaps(block, definition, table)?.map((tap) => tap.volts)).toEqual([13800, 13200, 12600, 12000, 11400]);
    expect(tapRowAccepted(block, definition, table, 12600)).toBe(true);
    expect(tapRowAccepted(block, definition, table, 0)).toBe(false);
    expect(tapRowAccepted(sheet('transformador_forca'), definition, table, 0)).toBe(true);

    const f = opFactory();
    const state: EntityState = new Map([[entityKey('block', block.id), block]]);
    const write = (row: number, col = 3) => f.op({ path: `sheet/${block.id}/test/relacao_transformacao/cell/${row}/${col}`, value: measured('57.4', null) });
    const written = applyOp(state, write(12600)).get(entityKey('block', block.id)) as BlockRow;
    expect(written.sheet.test.relacao_transformacao?.cells['12600']?.['3']?.value).toEqual(measured('57.4', null));
    expect(() => applyOp(state, write(0))).toThrow(SeedPathError);
    expect(() => applyOp(state, write(12601))).toThrow(SeedPathError);
    // A derived column stays refused on a tap row too.
    expect(() => applyOp(state, write(12600, 2))).toThrow(SeedPathError);
  });

  it('the run walks every tap row down a column, but the jump to what follows stops only at a marked row; inputs of a tap row are no stops', () => {
    const evaluation = ratioOf(fiveTaps());
    const at = (row: number, col: number) => ({ testKey: 'relacao_transformacao' as const, row, col });
    expect(runTarget([evaluation], at(13800, 3), 'next')).toEqual(at(13200, 3));
    expect(runTarget([evaluation], at(11400, 3), 'next')).toEqual(at(13800, 4));
    expect(runTarget([evaluation], at(13800, 0), 'next')).toBeNull();
    const filled = withTest(fiveTaps(), 'relacao_transformacao', { '13800/3': measured('62.9', null) });
    // From the last tap of column 3 the jump skips the unmarked rows of column 4 that are empty, landing on the first marked one.
    expect(runTarget([ratioOf(filled)], at(11400, 3), 'next')).toEqual(at(13800, 4));
    const marked = withTest(fiveTaps(), 'relacao_transformacao', { '13800/4': measured('62.9', null), '12600/4': measured('57.4', null), '11400/4': measured('52', null) });
    expect(runTarget([ratioOf(marked)], at(11400, 3), 'next')).toEqual(at(13800, 5));
    expect(firstRunCell([evaluation])).toEqual(at(13800, 3));
  });
});

describe('23.8-UNIT the TTR per tap in print, and v12 unchanged', () => {
  const small = buildSnapshot(replay(portoSeguroSmall.log, { deadOpIds: portoSeguroSmall.deadOpIds }), portoSeguroSmall.relatorioId);
  const snapshotWith = (block: BlockRow, version: string): RelatorioSnapshot => {
    const local = { ...small.locations.find((row) => row.kind === 'cabine')!, id: id(999) };
    const placed = { ...block, relatorio_id: small.relatorio.id, location_id: local.id };
    return {
      ...small,
      relatorio: { ...small.relatorio, seed_version: version },
      locations: [local],
      blocks: [placed],
      equipment: [{ id: block.equipment_id!, project_id: small.relatorio.project_id, tag: 'TR-1', type: block.block_type, last_nameplate: null, last_results: null, removed_at: null } as never],
      files: [],
      points: [],
      suggestions: [],
      actors: [],
    };
  };
  const tablesOf = (section: LayoutSectionSheets): PrintTable[] =>
    section.subsections.flatMap((s) => s.sheets.flatMap((one) => one.parts)).flatMap((part: SheetPart) => (part.kind === 'table' ? [part.table] : []));
  const ratioTable = (snapshot: RelatorioSnapshot) => tablesOf(section9Layout(snapshot, 9, 'RELATÓRIOS DOS ENSAIOS')!).find((table) => table.rows.some((row) => row.cells[0]?.text === 'TAP Nº'))!;
  const dataRows = (table: PrintTable) => table.rows.filter((row) => row.header !== true && row.band !== true).map((row) => row.cells.map((one) => one.text));

  it('prints every evaluated row: TAP Nº the position or "-" off the plate, V PRIMÁRIO the tap, an unmeasured unmarked row "-"', () => {
    const block = withTest(fiveTaps(), 'relacao_transformacao', { ...captures(13800, '62.9'), ...captures(12600, '57.43'), ...captures(11400, '51.96') });
    block.sheet.test.relacao_transformacao!.cells['12000'] = { '3': cell(measured('54.7', null)), '4': cell(measured('54.7', null)), '5': cell(measured('54.7', null)) };
    block.sheet.nameplate.taps = cell(measured('13.8;13.2;12.6;11.4', 'kV'));
    const rows = dataRows(ratioTable(snapshotWith(block, 'v13')));
    expect(rows.map((row) => row[0])).toEqual(['1', '2', '3', '4', '-']);
    expect(rows.map((row) => row[1])).toEqual(['13,8 kV', '13,2 kV', '12,6 kV', '11,4 kV', '12 kV']);
    expect(rows[1]).toEqual(['2', '13,2 kV', '380 V', '60,17', '-', '-', '-', '-']);
    expect(rows[4]!.at(-1)).toBe('SATISFATÓRIO');
  });

  it('a v12 transformer prints its one typed row as before', () => {
    const v12 = withNameplate(sheet('transformador_forca', 'v12'), { tensao_nominal_at: measured('13.8', 'kV'), tensao_nominal_bt: measured('380', 'V'), ligacao_secundaria: 'Dyn1', tap_atual: '3' });
    const rows = dataRows(ratioTable(snapshotWith(v12, 'v12')));
    expect(rows).toEqual([['3', '13,8 kV', '380 V', '62,90', '-', '-', '-', '-']]);
  });

  it('an issued revision leaves each tap\'s readings on the equipment by its volts; the next relatório finds them on the same taps, however the plate orders them, and prints MANUT. ANTERIOR', () => {
    // Visit A: readings on taps 1, 3 and 5.
    const visitA = withTest(fiveTaps(), 'relacao_transformacao', { ...captures(13800, '62.9'), ...captures(12600, '57.43'), ...captures(11400, '51.96') });
    const [entry] = lastResults(snapshotWith(visitA, 'v13'), { revisionNumber: 1, issuedAt: '2026-11-08T12:00:00.000Z' });
    const readings = entry!.value.readings;
    expect(readings['relacao_transformacao|relacao_transformacao:@12600|H2-H1 / X2-X0']).toEqual(measured('57.43', null));
    expect(Object.keys(readings).filter((key) => key.startsWith('relacao_transformacao|'))).toHaveLength(9);
    // Visit B, another relatório of the obra: the same plate listed from the lowest tap, nothing measured yet.
    const visitB = fiveTaps({ taps: measured('11.4;12;12.6;13.2;13.8', 'kV') });
    const earlier = { ...entry!.value, relatorio_id: id(4242) };
    const next = snapshotWith(visitB, 'v13');
    const withPrevious: RelatorioSnapshot = { ...next, equipment: next.equipment.map((row) => ({ ...row, last_results: earlier })) };
    const table = ratioTable(withPrevious);
    expect(table.rows.find((row) => row.header === true && row.cells.some((one) => one.text === 'MANUT. ANTERIOR'))).toBeDefined();
    const rows = dataRows(table);
    expect(rows.map((row) => row[1])).toEqual(['11,4 kV', '12 kV', '12,6 kV', '13,2 kV', '13,8 kV']);
    expect(rows.map((row) => row.at(-1))).toEqual(['51,96 · 51,96 · 51,96', '-', '57,43 · 57,43 · 57,43', '-', '62,9 · 62,9 · 62,9']);
    // The sheet's "Anterior: …" line under the tap's own cell.
    const helpers = previousHelpers({ last_results: earlier }, visitB, definitionOf(visitB), next.relatorio.id);
    expect(helpers.get('relacao_transformacao/12600/4')).toBe('Anterior: 57,43 (rev. 1, 08/11/2026)');
    expect(helpers.has('relacao_transformacao/13200/3')).toBe(false);
    // Without the block (a v12 reader) the seeded row alone has a slot, as before.
    expect(previousHelpers({ last_results: earlier }, { block_type: 'transformador_forca' }, definitionOf(visitB), next.relatorio.id).size).toBe(0);
  });

  it('DADOS DO EQUIPAMENTO prints TAPS with "·", a √3 as typed and the excused temperature "-"', () => {
    const block = fiveTaps({ tipo_de_isolacao: 'ÓLEO ISOLANTE', temperatura_enrolamento_c: measured('40', '°C'), temperatura_oleo_c: measured('35', '°C') });
    const pairs = tablesOf(section9Layout(snapshotWith(block, 'v13'), 9, 'RELATÓRIOS DOS ENSAIOS')!).find((table) => table.rows[0]!.cells[0]!.text === 'DADOS DO EQUIPAMENTO')!;
    const cells = pairs.rows.slice(1).flatMap((row) => row.cells.map((one) => one.text));
    const valueOf = (label: string) => cells[cells.indexOf(label) + 1];
    expect(valueOf('TAPS')).toBe('13,8 · 13,2 · 12,6 · 12 · 11,4 kV');
    expect(valueOf('TAP ATUAL')).toBe('12,6 kV');
    expect(valueOf('TEMPERATURA DO ÓLEO')).toBe('35 °C');
    expect(valueOf('TEMPERATURA DO ENROLAMENTO')).toBe('-');
    const tp = withNameplate(sheet('tp'), { tensao_nominal_bt: measured('115/√3', 'V') });
    const tpPairs = tablesOf(section9Layout(snapshotWith(tp, 'v13'), 9, 'RELATÓRIOS DOS ENSAIOS')!).find((table) => table.rows[0]!.cells[0]!.text === 'DADOS DO EQUIPAMENTO')!;
    const tpCells = tpPairs.rows.slice(1).flatMap((row) => row.cells.map((one) => one.text));
    expect(tpCells[tpCells.indexOf('TENSÃO NOMINAL BT') + 1]).toBe('115/√3 V');
  });
});
