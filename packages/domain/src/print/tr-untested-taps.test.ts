import { describe, expect, it } from 'vitest';
import { portoSeguroSmall } from '../../fixtures/porto-seguro/small/op-log.ts';
import { replay } from '../ops/replay.ts';
import type { EquipmentBlockType } from '../schemas/block-config.ts';
import type { BlockRow, Cell } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { EMPTY_DEFINITION_CONTEXT, getDefinition, SEED_VERSION } from '../seed/definitions.ts';
import { evaluateSheetReadings } from '../relatorio/readings.ts';
import { printedMeasurementRows, printedTapRows } from '../relatorio/tap-rows.ts';
import { newEquipmentBlock } from '../relatorio/tree.ts';
import { TEST_PROJECT, TEST_RELATORIO } from '../test-support.ts';
import { section9Layout, type LayoutSectionSheets, type PrintTable, type SheetPart } from './section-9.ts';

/*
 * Fix fix-tr-untested-taps (Bruno 2026-11-26, "os tap dos TR ficam mostrando todos, mesmo os não ensaiados"): the
 * transformer's TTR, one row per tap of TAPS since Story 23.8 (seed v13), prints only the taps that were tested. The
 * sheet keeps every tap; the TP's ratio table, which has no taps, prints every row as before. Sample values invented.
 */

const id = (n: number) => `019966b0-0e26-7000-8000-${n.toString(16).padStart(12, '0')}`;
let opCounter = 0;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: id(80_000 + ++opCounter) });
const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' as const });
const notMeasured = { raw: '', unit: null, state: 'not_measured' as const };

function sheet(type: EquipmentBlockType, seedVersion: string): BlockRow {
  return structuredClone(
    newEquipmentBlock({ definitions: EMPTY_DEFINITION_CONTEXT, blockId: id(1), equipmentId: id(101), relatorioId: TEST_RELATORIO, projectId: TEST_PROJECT, locationId: id(999), type, tag: 'T1', seedVersion, orderKey: 'a1' }).block,
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

/** A transformer with five taps, the third in service, on a Dyn1 plate of 13,8 kV over 380 V. */
const fiveTaps = (seedVersion: string): BlockRow =>
  withNameplate(sheet('transformador_forca', seedVersion), {
    taps: measured('13.8;13.2;12.6;12;11.4', 'kV'),
    tap_atual_kv: measured('12.6', 'kV'),
    tensao_nominal_at: measured('13.8', 'kV'),
    tensao_nominal_bt: measured('380', 'V'),
    ligacao_secundaria: 'Dyn1',
  });

/** The three captures of a ratio row (cols 3 to 5 of the transformer's TTR). */
const captures = (row: number, value: unknown) => ({ [`${row}/3`]: value, [`${row}/4`]: value, [`${row}/5`]: value });

const small = buildSnapshot(replay(portoSeguroSmall.log, { deadOpIds: portoSeguroSmall.deadOpIds }), portoSeguroSmall.relatorioId);
function snapshotWith(block: BlockRow): RelatorioSnapshot {
  const local = { ...small.locations.find((row) => row.kind === 'cabine')!, id: id(999) };
  return {
    ...small,
    relatorio: { ...small.relatorio, seed_version: block.seed_version },
    locations: [local],
    blocks: [{ ...block, relatorio_id: small.relatorio.id, location_id: local.id }],
    equipment: [{ id: block.equipment_id!, project_id: small.relatorio.project_id, tag: 'EQ-1', type: block.block_type, last_nameplate: null, last_results: null, removed_at: null } as never],
    files: [],
    points: [],
    suggestions: [],
    actors: [],
  };
}

const tablesOf = (snapshot: RelatorioSnapshot): PrintTable[] =>
  (section9Layout(snapshot, 9, 'RELATÓRIOS DOS ENSAIOS') as LayoutSectionSheets).subsections
    .flatMap((s) => s.sheets.flatMap((one) => one.parts))
    .flatMap((part: SheetPart) => (part.kind === 'table' ? [part.table] : []));
const dataRows = (table: PrintTable) => table.rows.filter((row) => row.header !== true && row.band !== true).map((row) => row.cells.map((one) => one.text));
const ttrRows = (block: BlockRow) => dataRows(tablesOf(snapshotWith(block)).find((table) => table.rows.some((row) => row.cells[0]?.text === 'TAP Nº'))!);

describe('fix-tr-untested-taps: the TTR prints only its tested taps', () => {
  for (const version of ['v13', 'v18', SEED_VERSION]) {
    it(`${version}: taps 1, 3 and 5 tested print alone, in plate order; taps 2 and 4 are left out`, () => {
      const block = withTest(fiveTaps(version), 'relacao_transformacao', { ...captures(13800, measured('62.9', null)), ...captures(12600, measured('57.43', null)), ...captures(11400, measured('51.96', null)) });
      const rows = ttrRows(block);
      expect(rows.map((row) => row[0])).toEqual(['1', '3', '5']);
      expect(rows.map((row) => row[1])).toEqual(['13,8 kV', '12,6 kV', '11,4 kV']);
      expect(rows.map((row) => row.at(-1))).toEqual(['SATISFATÓRIO', 'SATISFATÓRIO', 'SATISFATÓRIO']);
    });
  }

  it('an unmarked tap tested too prints in its place; a tap set to "Não medido" by hand prints "-"', () => {
    const block = withTest(fiveTaps(SEED_VERSION), 'relacao_transformacao', {
      ...captures(13800, measured('62.9', null)),
      ...captures(13200, measured('60.17', null)),
      ...captures(12600, measured('57.43', null)),
      ...captures(11400, notMeasured),
    });
    const rows = ttrRows(block);
    expect(rows.map((row) => row[0])).toEqual(['1', '2', '3', '5']);
    expect(rows[3]!.slice(4)).toEqual(['-', '-', '-', '-']);
  });

  it('a tap that left TAPS with its reading still prints after the tested taps, "-" its TAP Nº', () => {
    const block = withTest(fiveTaps(SEED_VERSION), 'relacao_transformacao', { ...captures(13800, measured('62.9', null)), ...captures(12300, measured('56.06', null)) });
    expect(ttrRows(block).map((row) => row[0])).toEqual(['1', '-']);
  });

  it('with no tap of the plate tested every tap prints, as Story 23.8 printed it', () => {
    expect(ttrRows(fiveTaps(SEED_VERSION)).map((row) => row[0])).toEqual(['1', '2', '3', '4', '5']);
  });

  it('a v12 transformer prints its one typed row as before', () => {
    const v12 = withNameplate(sheet('transformador_forca', 'v12'), { tensao_nominal_at: measured('13.8', 'kV'), tensao_nominal_bt: measured('380', 'V'), ligacao_secundaria: 'Dyn1', tap_atual: '3' });
    expect(ttrRows(v12)).toEqual([['3', '13,8 kV', '380 V', '62,90', '-', '-', '-', '-']]);
  });

  it('the sheet keeps every tap: the evaluation the screen and the progress read still holds five rows', () => {
    const block = withTest(fiveTaps(SEED_VERSION), 'relacao_transformacao', { ...captures(13800, measured('62.9', null)) });
    const ratio = evaluateSheetReadings(block, getDefinition(SEED_VERSION, 'cabine_primaria', 'transformador_forca')).find((test) => test.testKey === 'relacao_transformacao')!;
    expect(ratio.tables[0]!.rows).toHaveLength(5);
    expect(printedTapRows(ratio.tables[0]!.rows).map((row) => row.row)).toEqual([13800]);
  });

  it('the TP keeps every row of its ratio table, a phase left untested printing "-"', () => {
    const tp = sheet('tp', SEED_VERSION);
    const ratio = evaluateSheetReadings(tp, getDefinition(SEED_VERSION, 'cabine_primaria', 'tp')).find((test) => test.testKey === 'relacao_transformacao');
    expect(ratio).toBeDefined();
    const seeded = ratio!.tables.flatMap((table) => table.rows);
    expect(seeded.every((row) => row.tap === null)).toBe(true);
    expect(printedTapRows(seeded)).toEqual(seeded);
    // Only the first row tested: the table still prints all its rows.
    const first = seeded[0]!;
    const capture = first.cells.find((one) => one.role === 'capture')!;
    const tested = withTest(tp, 'relacao_transformacao', { [`${first.row}/${capture.address.col}`]: measured('120', null) });
    const printed = tablesOf(snapshotWith(tested)).filter((table) => table.rows.some((row) => row.cells.some((one) => one.text === 'VAL CALCULADO')));
    expect(printed.flatMap(dataRows)).toHaveLength(seeded.length);
  });
});

describe('e31f-UNIT-007 a tap with any filled cell counts as tested; the winding resistance leaves out its empty optional taps', () => {
  it('a tap whose only filled cell is a typed V SECUNDÁRIO prints; a marked tap with nothing filled stays out', () => {
    const block = withTest(fiveTaps(SEED_VERSION), 'relacao_transformacao', { ...captures(13800, measured('62.9', null)), '13200/1': measured('380', 'V') });
    // Tap 3 is the plate's TAP ATUAL (marked Atual) and holds nothing: it is left out.
    expect(ttrRows(block).map((row) => row[0])).toEqual(['1', '2']);
  });

  const windingRows = (block: BlockRow) =>
    dataRows(tablesOf(snapshotWith(block)).find((table) => table.rows.some((row) => row.cells[0]?.text === 'AT, TAP ATUAL'))!)
      .map((row) => row[0]!)
      .filter((label) => /^(AT|BT)\b/.test(label));

  it('empty "AT, primeiro tap" and "AT, último tap" are left out of the print; filled, each prints in its place', () => {
    const empty = withTest(fiveTaps(SEED_VERSION), 'resistencia_enrolamento', { '0/0': measured('1.2', 'Ω'), '3/0': measured('3.1', 'mΩ') });
    expect(windingRows(empty)).toEqual(['AT, TAP ATUAL', 'BT']);
    const first = withTest(fiveTaps(SEED_VERSION), 'resistencia_enrolamento', { '0/0': measured('1.2', 'Ω'), '1/1': measured('1.3', 'Ω') });
    expect(windingRows(first)).toEqual(['AT, TAP ATUAL', 'AT, PRIMEIRO TAP', 'BT']);
    const last = withTest(fiveTaps(SEED_VERSION), 'resistencia_enrolamento', { '2/2': notMeasured });
    expect(windingRows(last)).toEqual(['AT, TAP ATUAL', 'AT, ÚLTIMO TAP', 'BT']);
  });

  it('only the winding resistance omits its empty optional rows', () => {
    const rows = [{ cells: [{ optional: true, state: 'empty', fixed: null }] }, { cells: [{ optional: false, state: 'empty', fixed: null }] }];
    expect(printedMeasurementRows('resistencia_enrolamento', rows)).toEqual([rows[1]]);
    expect(printedMeasurementRows('termografia', rows)).toEqual(rows);
    expect(printedMeasurementRows('continuidade_malha', rows)).toEqual(rows);
  });
});
