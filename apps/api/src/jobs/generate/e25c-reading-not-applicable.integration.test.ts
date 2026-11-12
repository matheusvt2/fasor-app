import { layoutSpec, notApplicableReadingValue, type BlockRow, type Cell, type RelatorioSnapshot } from '@app/domain';
import { LAYOUT_LOCK_ISSUED_AT, layoutLockEpic25Snapshot } from '@app/domain/fixtures/layout-lock';
import { describe, expect, it } from 'vitest';
import { buildDocx } from './docx.ts';
import { extractStructure } from './docx-structure.test-support.ts';
import { placeholderPages } from './toc.ts';

/*
 * 25.9-INT (batch e25c, Story 25.9, seed v15 `reading_not_applicable`): the DOCX of the Epic 25 v15 relatório
 * (`layoutLockEpic25Fixture`) with "Não se aplica" on a seeded table and on a measurement table: the TP's third
 * insulation phase and its whole third ratio row, and phase C of the oil transformer's first winding row. Each
 * such cell prints "N/A", the ratio row's VAL CALCULADO and CONDIÇÕES and the winding's value at 75 °C too, and
 * no other cell moves: the same relatório with those cells "Não medido" prints the same document but "-" there.
 */

const OP = '019966b0-0e25-7009-8000-0000000000bb';

/** The fixture with the cells of the story written `value`. */
function withCells(value: (unit: string | null) => unknown): RelatorioSnapshot {
  const snapshot = structuredClone(layoutLockEpic25Snapshot('v15'));
  const tp = snapshot.blocks.find((block) => block.block_type === 'tp' && block.removed_at === null)!;
  const oil = snapshot.blocks.find((block) => block.block_type === 'transformador_forca' && block.removed_at === null && block.sheet.test.resistencia_enrolamento !== undefined)!;
  const write = (block: BlockRow, testKey: string, row: number, col: number, unit: string | null) => {
    const test = block.sheet.test[testKey]!;
    test.cells[String(row)] = { ...test.cells[String(row)], [String(col)]: { value: value(unit) as Cell['value'], source_suggestion_id: null, op_id: OP } };
  };
  write(tp, 'isolacao', 2, 1, 'GΩ');
  for (const [col, unit] of [[0, 'V'], [1, 'V'], [3, null]] as const) write(tp, 'relacao_transformacao', 2, col, unit);
  write(oil, 'resistencia_enrolamento', 0, 2, 'Ω');
  return snapshot;
}

async function tablesOf(snapshot: RelatorioSnapshot): Promise<string[][][]> {
  const layout = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: LAYOUT_LOCK_ISSUED_AT });
  return extractStructure(await buildDocx(layout, { tocPages: placeholderPages(layout) })).tables;
}

describe('25.9-INT the DOCX with N/A cells in a seeded table and in a measurement table', () => {
  it('each N/A cell prints "N/A" (and the derived cells of the all-N/A row and the corrected value), and no other cell moves', async () => {
    const [na, nm] = await Promise.all([tablesOf(withCells(notApplicableReadingValue)), tablesOf(withCells((unit) => ({ raw: '', unit, state: 'not_measured' })))]);
    // The same tables, the same rows and cells: nothing moves.
    expect(na.map((table) => table.map((row) => row.length))).toEqual(nm.map((table) => table.map((row) => row.length)));
    const differing: { table: number; row: number; cell: number; now: string; was: string }[] = [];
    na.forEach((table, t) => table.forEach((row, r) => row.forEach((text, c) => (text === nm[t]![r]![c] ? undefined : differing.push({ table: t, row: r, cell: c, now: text, was: nm[t]![r]![c]! })))));
    // Every difference is a "-" of the unmeasured cells now "N/A".
    expect(differing.length).toBeGreaterThan(0);
    for (const one of differing) expect({ now: one.now, was: one.was }, JSON.stringify(one)).toEqual({ now: 'N/A', was: '-' });
    // The TP's insulation row (FASE T): its 1 MINUTO cell; the TP's ratio row (FASE T): V PRIMÁRIO, V SECUNDÁRIO, VAL CALCULADO, the reading and CONDIÇÕES.
    const rowOf = (one: (typeof differing)[number]) => na[one.table]![one.row]!;
    const phaseT = differing.filter((one) => rowOf(one)[0] === 'FASE T');
    const byRow = new Map<string, number>();
    for (const one of phaseT) byRow.set(`${one.table}/${one.row}`, (byRow.get(`${one.table}/${one.row}`) ?? 0) + 1);
    expect([...byRow.values()].sort()).toEqual([1, 5]);
    // The oil transformer's winding row: phase C and its value at 75 °C.
    expect(differing.length - phaseT.length).toBe(2);
    const winding = differing.filter((one) => rowOf(one)[0] !== 'FASE T');
    expect(new Set(winding.map((one) => `${one.table}/${one.row}`)).size).toBe(1);
  }, 120_000);
});
