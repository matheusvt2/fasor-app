import { describe, expect, it } from 'vitest';
import { portoSeguro } from '../../fixtures/porto-seguro/op-log.ts';
import { portoSeguroSmall } from '../../fixtures/porto-seguro/small/op-log.ts';
import { replay } from '../ops/replay.ts';
import { blockConfigWithOption, evaluateSheetMeasurements } from '../relatorio/measurement-evaluation.ts';
import { unitsOf } from '../relatorio/reading-cells.ts';
import { newEquipmentBlock } from '../relatorio/tree.ts';
import type { EquipmentBlockType } from '../schemas/block-config.ts';
import type { BlockRow, Cell, JsonValue, LocationRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { SEED_VERSIONS } from '../seed/definitions.ts';
import type { FieldDef } from '../seed/schema.ts';
import { TEST_PROJECT } from '../test-support.ts';
import { readingSlotsOf } from './last-results.ts';
import { layoutSpec } from './layout.ts';
import { READING_FIT_WIDTH_EM, section9Layout, TABLE_TEXT_STEPS_HALF_POINTS, widenToFit, withPreviousColumn, wordsWiderThanColumns, type LayoutSectionSheets, type PrintRow, type PrintTable, type SheetPart } from './section-9.ts';

/*
 * Story 22.3 (FR-68): the label and value pair tables (DADOS DO EQUIPAMENTO, CONFIGURAÇÃO),
 * the cabine tables and the instrument header keep their base weights and widen a value
 * column only where a word would break inside itself (`widenToFit`). Measured here: every
 * seeded option of every seed version, set in every select at once (the worst row), and every
 * typed value of the Porto Seguro fixture, against its printed column.
 */

const small = buildSnapshot(replay(portoSeguroSmall.log, { deadOpIds: portoSeguroSmall.deadOpIds }), portoSeguroSmall.relatorioId);
const RELATORIO = small.relatorio.id;
const id = (n: number) => `019966b0-0072-7000-8000-${n.toString(16).padStart(12, '0')}`;
let opCounter = 0;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: id(60_000 + ++opCounter) });

const PAIRS = [1.6, 1.7, 1.6, 1.7, 1.6, 1.7];
const pairRow = (cells: string[]): PrintRow => ({ cells: cells.map((text, i) => ({ text, bold: i % 2 === 0, align: 'left' as const })) });

/** The option with the widest longest word: the hardest one for its column. */
function widest(options: readonly string[]): string {
  const longest = (text: string) => Math.max(...text.split(/\s+/).map((word) => [...word].length));
  return [...options].sort((a, b) => longest(b) - longest(a))[0]!;
}

function cabine(over: Partial<Extract<LocationRow, { kind: 'cabine' }>> = {}): LocationRow {
  return {
    id: id(1),
    relatorio_id: RELATORIO,
    parent_id: null,
    kind: 'cabine',
    name: 'Cabine A',
    order_key: 'a0',
    removed_at: null,
    se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
    env: { altitude_m: null, temperature_c: null, humidity_pct: null },
    agrupar_por_tipo: false,
    ...over,
  };
}

const tablesOf = (section: LayoutSectionSheets): Extract<SheetPart, { kind: 'table' }>['table'][] =>
  section.subsections.flatMap((s) => [...(s.localParts ?? []), ...s.sheets.flatMap((sheet) => sheet.parts)]).flatMap((part) => (part.kind === 'table' ? [part.table] : []));

/** The fitted tables: the pairs, the cabine tables and the instrument headers (their first row a band, their second a header or pairs). */
const FITTED = /^(DADOS DO EQUIPAMENTO|CONFIGURAÇÃO|CARACTERÍSTICAS DA SE|AMBIENTE DE ENSAIO|ENSAIO .*)$/u;
const isFitted = (table: PrintTable) => FITTED.test(table.rows[0]!.cells[0]!.text) && table.rows[0]!.cells[0]!.span === table.columns.length && table.columns.length > 1;
/** The pair tables, whose even columns are labels: their weights are fixed, so only the value columns are measured. */
const PAIR_TABLES = /^(DADOS DO EQUIPAMENTO|CONFIGURAÇÃO)$/u;
/** The words wider than their value column (every column of a cabine table or an instrument header holds values). */
const valueOverflow = (table: PrintTable) => wordsWiderThanColumns(table).filter((w) => !PAIR_TABLES.test(table.rows[0]!.cells[0]!.text) || w.col % 2 === 1);

describe('22.3 widenToFit', () => {
  it('keeps the base weights when every word fits', () => {
    const rows = [pairRow(['TIPO', 'SECO', 'TAG', 'TR-1', 'FABRICAÇÃO', 'WEG'])];
    expect(widenToFit(PAIRS, rows, [1, 3, 5])).toEqual(PAIRS);
  });

  it('widens only the value column whose word would break, taking the width from the other value columns, labels unchanged', () => {
    const rows = [pairRow(['TIPO', 'TRANSFORMADOR TRIFÁSICO', 'TAG', 'TR-1', 'FABRICAÇÃO', 'WEG'])];
    const fitted = widenToFit(PAIRS, rows, [1, 3, 5]);
    expect(wordsWiderThanColumns({ columns: PAIRS, rows })).toEqual([{ col: 1, word: 'TRANSFORMADOR' }]);
    expect(wordsWiderThanColumns({ columns: fitted, rows })).toEqual([]);
    expect(fitted[1]).toBeGreaterThan(1.7);
    for (const label of [0, 2, 4]) expect(fitted[label]).toBeCloseTo(PAIRS[label]!, 9);
    expect(fitted.reduce((a, b) => a + b, 0)).toBeCloseTo(PAIRS.reduce((a, b) => a + b, 0), 9);
  });

  it('never takes a value column below its own longest word; short of slack, it widens as far as the slack goes', () => {
    const rows = [pairRow(['A', 'TRANSFORMADORTRANSFORMADOR', 'B', 'SUBESTAÇÃOSUBESTAÇÃO', 'C', 'X'])];
    const fitted = widenToFit(PAIRS, rows, [1, 3, 5]);
    // Column 5 gave everything above its own word; column 3, too wide itself, gave nothing.
    expect(fitted[3]).toBeGreaterThanOrEqual(1.7);
    expect(fitted[1]).toBeGreaterThan(1.7);
    expect(wordsWiderThanColumns({ columns: fitted, rows }).map((w) => w.col)).not.toContain(5);
  });
});

describe('22.3 the fitted tables of every seed version hold their longest seeded words', () => {
  for (const [version, bundle] of Object.entries(SEED_VERSIONS)) {
    const seed = bundle.report_types.cabine_primaria;
    it(`${version}: DADOS DO EQUIPAMENTO, CONFIGURAÇÃO and the cabine tables, every select at its widest option`, () => {
      const selects = (fields: readonly FieldDef[]) => Object.fromEntries(fields.filter((f) => f.kind === 'select').map((f) => [f.key, widest(f.options!)]));
      const local = cabine({ se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null, ...selects(seed.cabine.se) } as never, env: { altitude_m: null, temperature_c: null, humidity_pct: null, ...selects(seed.cabine.env) } as never });
      const built = Object.values(seed.blocks).map((definition, n) => {
        const one = newEquipmentBlock({ blockId: id(1000 + n), equipmentId: id(2000 + n), relatorioId: RELATORIO, projectId: TEST_PROJECT, locationId: id(1), type: definition!.block_type as EquipmentBlockType, tag: `T${n}`, seedVersion: version, orderKey: `a${n}` });
        const block: BlockRow = structuredClone(one.block);
        for (const [key, value] of Object.entries(selects(definition!.nameplate))) block.sheet.nameplate[key] = cell(value);
        let config: JsonValue = block.config;
        for (const field of definition!.config_fields ?? []) {
          const label = widest(field.options.map((option) => option.label));
          config = blockConfigWithOption(config, field.key, field.options.find((option) => option.label === label)!.key);
        }
        return { ...one, block: { ...block, config } };
      });
      const snapshot: RelatorioSnapshot = { ...small, relatorio: { ...small.relatorio, seed_version: version }, locations: [local], blocks: built.map((b) => b.block), equipment: built.map((b) => b.equipment), files: [], points: [], suggestions: [], actors: [] };
      const section = section9Layout(snapshot, 9, 'RELATÓRIOS DOS ENSAIOS')!;
      const fitted = tablesOf(section).filter(isFitted);
      expect(fitted.length).toBeGreaterThan(0);
      for (const table of fitted) expect(valueOverflow(table), `${version} ${table.rows[0]!.cells[0]!.text}`).toEqual([]);
    });
  }
});

describe('22.3 the Porto Seguro fixture: every typed value fits its printed column', () => {
  it('no word of DADOS DO EQUIPAMENTO, CONFIGURAÇÃO, the cabine tables or an instrument header is wider than its column', () => {
    const snapshot = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
    const section = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: '2026-09-23T12:00:00.000Z' }).sections.find((s): s is LayoutSectionSheets => s.kind === 'sheets')!;
    const fitted = tablesOf(section).filter(isFitted);
    expect(fitted.some((t) => t.rows[0]!.cells[0]!.text === 'DADOS DO EQUIPAMENTO')).toBe(true);
    expect(fitted.some((t) => t.rows[0]!.cells[0]!.text.startsWith('ENSAIO '))).toBe(true);
    const broken = fitted.flatMap((table) => valueOverflow(table).map((w) => `${table.rows[0]!.cells[0]!.text}: ${w.word}`));
    expect(broken).toEqual([]);
  });
});

/*
 * e22g (review B1, the coordinator's decision of 2026-11-07): every reading table of every seed
 * version, every reading cell filled, with and without a previous visit (MANUT. ANTERIOR) and
 * with one unit or mixed units (and a reading above the instrument's limit), prints every word
 * whole. A table whose words do not fit at 9 pt prints one step smaller (`textHalfPoints`);
 * a word still wider than its column fails here.
 */
describe('e22g B1: the reading tables of every seed version hold every word whole', () => {
  const MIXED_PREVIOUS = [
    { raw: '2', unit: 'TΩ', state: 'over_range' as const },
    { raw: '1450', unit: 'GΩ', state: 'measured' as const },
    { raw: '800', unit: 'MΩ', state: 'measured' as const },
  ];
  /** A filled value for a cell whose unit slot takes `units`, the `n`th filled. */
  const reading = (units: readonly string[], n: number, mixed: boolean): { raw: string; unit: string | null; state: 'measured' | 'over_range' } => {
    if (units.length === 0) return { raw: '1450', unit: null, state: 'measured' };
    if (!mixed) return { raw: '1450', unit: units[0]!, state: 'measured' };
    // Mixed: the units in turn, and a reading above the limit where the slot takes TΩ.
    const unit = units[n % units.length]!;
    return unit === 'TΩ' && n % 4 === 2 ? { raw: '2', unit, state: 'over_range' } : { raw: n % 2 === 0 ? '1450' : '0.85', unit, state: 'measured' };
  };

  function snapshotOf(version: string, previous: boolean, mixed: boolean): RelatorioSnapshot {
    const seed = SEED_VERSIONS[version]!.report_types.cabine_primaria;
    const built = Object.values(seed.blocks).map((definition, n) => {
      const one = newEquipmentBlock({ blockId: id(3000 + n), equipmentId: id(4000 + n), relatorioId: RELATORIO, projectId: TEST_PROJECT, locationId: id(1), type: definition!.block_type as EquipmentBlockType, tag: `T${n}`, seedVersion: version, orderKey: `a${n}` });
      const block: BlockRow = structuredClone(one.block);
      const put = (testKey: string, row: number, col: number, value: JsonValue) => {
        const test = (block.sheet.test[testKey] ??= { instrument: null, criterion_override: null, cells: {} } as never);
        ((test.cells[String(row)] ??= {}) as Record<string, Cell>)[String(col)] = cell(value);
      };
      let k = 0;
      for (const test of definition!.tests) {
        let offset = 0;
        for (const table of test.tables) {
          table.rows.forEach((_, r) => {
            table.value_columns.forEach((column, col) => {
              if (column.role === 'voltage') put(test.key, offset + r, col, { raw: mixed && r % 2 === 1 ? '10' : '2.5', unit: 'kV', state: 'measured' });
              else if (column.role === 'capture' || column.role === 'input') put(test.key, offset + r, col, reading(unitsOf(column), k++, mixed));
            });
          });
          offset += table.rows.length;
        }
      }
      for (const test of evaluateSheetMeasurements(block, definition!)) {
        for (const row of test.rows) for (const one of row.cells) if (one.kind === 'number' && one.fixed === null) put(one.address.testKey, one.address.row, one.address.col, reading(one.units, k++, mixed));
      }
      const equipment = structuredClone(one.equipment);
      if (previous) {
        const readings = Object.fromEntries(readingSlotsOf(definition!).map((slot, i) => [slot.key, mixed ? MIXED_PREVIOUS[i % 3]! : { raw: '4900', unit: 'MΩ', state: 'measured' as const }]));
        equipment.last_results = { relatorio_id: id(9), revision_number: 1, issued_at: '2026-01-01T00:00:00.000Z', seed_version: version, block_type: definition!.block_type, readings, prior: null };
      }
      return { block, equipment };
    });
    return { ...small, relatorio: { ...small.relatorio, seed_version: version }, locations: [cabine()], blocks: built.map((b) => b.block), equipment: built.map((b) => b.equipment), files: [], points: [], suggestions: [], actors: [] };
  }

  /** The fixed-shape tables of a sheet, whose weights the layout sets (the pairs, the cabine tables, the instrument header, the checklist, CONCLUSÃO). */
  const FIXED_SHAPE = /^(CONCLUSÃO|OBSERVAÇÕES|VERIFICAÇÕES.*)$/u;
  const readingTables = (section: LayoutSectionSheets) =>
    tablesOf(section).filter((table) => !FIXED_SHAPE.test(table.rows[0]!.cells[0]!.text) && !(isFitted(table) && !table.rows.some((row) => row.header === true)));
  const hasPreviousColumn = (table: PrintTable) => table.rows.some((row) => row.cells.some((one) => one.text === 'MANUT. ANTERIOR'));

  for (const version of Object.keys(SEED_VERSIONS)) {
    for (const previous of [false, true]) {
      for (const mixed of [false, true]) {
        it(`${version}, ${previous ? 'with' : 'without'} a previous visit, ${mixed ? 'mixed units and an over-range reading' : 'one unit'}: no word wider than its column`, () => {
          const section = section9Layout(snapshotOf(version, previous, mixed), 9, 'RELATÓRIOS DOS ENSAIOS')!;
          const tables = readingTables(section);
          expect(tables.length).toBeGreaterThan(0);
          const broken = tables.flatMap((table) => wordsWiderThanColumns(table, READING_FIT_WIDTH_EM).map((w) => `${table.rows[0]!.cells[0]!.text} (${table.columns.length} cols, ${table.textHalfPoints ?? 18} hp): ${w.word}`));
          expect(broken).toEqual([]);
          expect(tables.some(hasPreviousColumn)).toBe(previous);
        });
      }
    }
  }

  it('the step rule at its boundaries: under the fit width stays 9 pt, above it takes the largest step that fits, past the floor stays at 7 pt', () => {
    // Plain cells: "A" is 0,72 em, a column's margins 0,9 em; the appended column's "-" takes the 1,5 em floor.
    const table = (word: string, columns: number): PrintTable => ({ columns: new Array<number>(columns).fill(1), rows: [{ cells: new Array(columns).fill(null).map(() => ({ text: word })) }] });
    // 7 x (7,2 + 0,9) + 2,4 = 59,1 em: within the fit width, printed as before.
    const under = withPreviousColumn(table('A'.repeat(10), 7), ['-']);
    expect(under.textHalfPoints).toBeUndefined();
    expect(wordsWiderThanColumns(under, READING_FIT_WIDTH_EM)).toEqual([]);
    // 7 x (7,92 + 0,9) + 2,4 = 64,1 em: 8,5 pt is 61,0 em, 8 pt 57,8 em, so 8 pt (16 half-points).
    const over = withPreviousColumn(table('A'.repeat(11), 7), ['-']);
    expect(over.textHalfPoints).toBe(16);
    expect(wordsWiderThanColumns(over, READING_FIT_WIDTH_EM)).toEqual([]);
    expect(wordsWiderThanColumns({ ...over, textHalfPoints: 17 }, READING_FIT_WIDTH_EM)).not.toEqual([]);
    // Past what 7 pt holds: the floor, best effort.
    const past = withPreviousColumn(table('A'.repeat(12), 12), ['-']);
    expect(past.textHalfPoints).toBe(TABLE_TEXT_STEPS_HALF_POINTS[TABLE_TEXT_STEPS_HALF_POINTS.length - 1]);
  });

  it('v1 to v11 with one unit and no previous visit print every reading table at 9 pt, as before; v12 steps its wide insulation tables down', () => {
    const smaller = Object.keys(SEED_VERSIONS)
      .filter((v) => v !== 'v12')
      .flatMap((version) =>
        section9Layout(snapshotOf(version, false, false), 9, 'RELATÓRIOS DOS ENSAIOS')!
          .subsections.flatMap((s) => s.sheets)
          .flatMap((sheet) => sheet.parts.flatMap((part) => (part.kind === 'table' && part.table.textHalfPoints !== undefined ? [`${version} ${sheet.title}: ${part.table.rows[0]!.cells[0]!.text} ${part.table.textHalfPoints}`] : []))),
      );
    expect(smaller).toEqual([]);
    const stepped = readingTables(section9Layout(snapshotOf('v12', false, true), 9, 'RELATÓRIOS DOS ENSAIOS')!).filter((table) => table.textHalfPoints !== undefined);
    expect(stepped.length).toBeGreaterThan(0);
    for (const table of stepped) expect(TABLE_TEXT_STEPS_HALF_POINTS).toContain(table.textHalfPoints);
  });
});
