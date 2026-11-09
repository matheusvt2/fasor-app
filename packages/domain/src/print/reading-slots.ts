import { tapRowsOf } from '../relatorio/tap-rows.ts';
import type { BlockRow, EquipmentRow, LastResults } from '../schemas/entities.ts';
import type { BlockDefinition } from '../seed/schema.ts';

/*
 * Story 22.12 (`last-results.ts`, which re-exports everything here): the keys of a definition's
 * reading cells and the previous visit an equipment row holds, by those keys. Batch e23v
 * (Story 23.6) moved them out of `last-results.ts` unchanged, so the reading evaluation can read
 * the previous visit (`relatorio/visit-context.ts`, `relatorio/restriction.ts`) without importing
 * the evaluation back: nothing here evaluates a sheet.
 */

/** One revision's readings, without its `prior`. */
export type PreviousResults = Omit<LastResults, 'prior'>;
export type LastResultReading = LastResults['readings'][string];

/** One reading cell of a definition and its key. */
export interface ReadingSlot {
  testKey: string;
  /** The op path's `row` and `col` (`reading-cells.ts` for a seeded test, `measurement-evaluation.ts` for a measurement test). */
  row: number;
  col: number;
  key: string;
}

/** The op-path address of a cell as one string: `${testKey}/${row}/${col}`. */
export function readingAddressKey(address: { testKey: string; row: number; col: number }): string {
  return `${address.testKey}/${address.row}/${address.col}`;
}

/** What `readingSlotsOf` reads of a definition: its tests, and the nameplate a `rows_from` table's list is on. */
export type SlotDefinition = Pick<BlockDefinition, 'tests' | 'measurement_tests'> & Partial<Pick<BlockDefinition, 'nameplate'>>;

/**
 * Every reading cell of a definition, keyed: the capture cells of every seeded test, in table,
 * row and column order, then the number cells of every measurement test (fixed cells left out),
 * whatever the block's configuration or switches. Story 23.8: with `block`, a `rows_from` table's
 * rows are the block's (`tapRowsOf`); without it, or with the plate's list empty, the seeded ones.
 */
export function readingSlotsOf(definition: SlotDefinition, block?: Pick<BlockRow, 'sheet'>): ReadingSlot[] {
  const out: ReadingSlot[] = [];
  const seen = new Map<string, number>();
  const push = (testKey: string, row: number, col: number, base: string) => {
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out.push({ testKey, row, col, key: n === 1 ? base : `${base}~${n}` });
  };
  for (const test of definition.tests) {
    let offset = 0;
    for (const table of test.tables) {
      const seededKey = (r: number) => {
        const cells = (table.rows[r] ?? []).map((text) => text.trim());
        return `${table.key}:${cells.every((text) => text === '') ? `#${r}` : cells.join('/')}`;
      };
      const captures = (row: number, rowKey: string) =>
        table.value_columns.forEach((column, col) => {
          if (column.role === 'capture') push(test.key, row, col, `${test.key}|${rowKey}|${column.label}`);
        });
      const plan = block === undefined || definition.nameplate === undefined ? null : tapRowsOf(block, { nameplate: definition.nameplate }, table, test.key);
      if (plan === null) table.rows.forEach((_, r) => captures(offset + r, seededKey(r)));
      else for (const entry of plan) captures(entry.row, entry.volts === null ? seededKey(entry.row) : `${table.key}:@${entry.volts}`);
      offset += table.rows.length;
    }
  }
  for (const test of definition.measurement_tests ?? []) {
    test.rows.forEach((row, r) => {
      test.columns.forEach((column, col) => {
        const kind = row.kind ?? column.kind;
        if (kind !== 'number' || row.fixed?.[column.key] !== undefined) return;
        push(test.key, r, col, `${test.key}|${row.key}|${column.key}`);
      });
    });
  }
  return out;
}

/** An entry without its `prior`. */
export function withoutPrior(entry: LastResults): PreviousResults {
  return {
    relatorio_id: entry.relatorio_id,
    revision_number: entry.revision_number,
    issued_at: entry.issued_at,
    seed_version: entry.seed_version,
    block_type: entry.block_type,
    readings: entry.readings,
  };
}

/**
 * The previous visit a sheet of relatório `relatorioId` reads: the equipment's entry when another
 * relatório left it, else (this relatório re-issued) its `prior`; null with none, or when the
 * entry is of another block type than the sheet's (the equipment changed type).
 */
export function previousResultsFor(equipment: Pick<EquipmentRow, 'last_results'> | null | undefined, block: Pick<BlockRow, 'block_type'>, relatorioId: string): PreviousResults | null {
  const top = equipment?.last_results ?? null;
  if (top === null) return null;
  const entry = top.relatorio_id !== relatorioId ? withoutPrior(top) : top.prior;
  if (entry === null || entry.block_type !== block.block_type) return null;
  return entry;
}

/**
 * The previous reading of each cell of `definition` the entry holds, by `readingAddressKey`; with
 * `block`, its tap rows read the readings of their taps (Story 23.8).
 */
export function previousReadingsByAddress(entry: PreviousResults | null, definition: SlotDefinition, block?: Pick<BlockRow, 'sheet'>): ReadonlyMap<string, LastResultReading> {
  const out = new Map<string, LastResultReading>();
  if (entry === null) return out;
  for (const slot of readingSlotsOf(definition, block)) {
    const reading = entry.readings[slot.key];
    if (reading !== undefined) out.set(readingAddressKey(slot), reading);
  }
  return out;
}
