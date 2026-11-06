import { describe, expect, it } from 'vitest';
import { portoSeguro } from '../../fixtures/porto-seguro/op-log.ts';
import { portoSeguroSmall } from '../../fixtures/porto-seguro/small/op-log.ts';
import { replay } from '../ops/replay.ts';
import { blockConfigWithOption } from '../relatorio/measurement-evaluation.ts';
import { newEquipmentBlock } from '../relatorio/tree.ts';
import type { EquipmentBlockType } from '../schemas/block-config.ts';
import type { BlockRow, Cell, JsonValue, LocationRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { SEED_VERSIONS } from '../seed/definitions.ts';
import type { FieldDef } from '../seed/schema.ts';
import { TEST_PROJECT } from '../test-support.ts';
import { layoutSpec } from './layout.ts';
import { section9Layout, widenToFit, wordsWiderThanColumns, type LayoutSectionSheets, type PrintRow, type PrintTable, type SheetPart } from './section-9.ts';

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
