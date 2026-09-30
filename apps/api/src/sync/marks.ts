import { safeParsePath, sheetCellAt, type BlockRow } from '@app/domain';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import type { CompanyId } from '../db/repositories/company-id.ts';
import { entities } from '../db/schema.ts';

/*
 * E10-Q6 (2026-09-29, AD-13): a client older than `MARK_AWARE_CONTRACT_VERSION` stamps
 * nothing it saw, so the fold takes its plain `sheet/*` put as one that saw the cell's
 * `conflict` and clears it, and its `removed_at` write as one that saw the block's removal
 * conflict. The push route asks this under the push's company lock, before the first op is
 * applied (the apply's `before` hook, A-10), for such a client's push: true when one of
 * its ops writes a cell that holds `conflict` (a `sheet/*` put) or a block that holds
 * `removal_conflict` (a `block/{id}/removed_at` write), as the server's rows stand. The ops
 * are raw (validated later, per op, by `applyOps`): anything unparseable is left to it.
 */
export async function pushTouchesConflictMark(db: Pick<Db, 'select'>, companyId: CompanyId, rawOps: readonly unknown[]): Promise<boolean> {
  const cells: { blockId: string; path: NonNullable<ReturnType<typeof safeParsePath>> }[] = [];
  const removals = new Set<string>();
  for (const raw of rawOps) {
    const op = raw as { kind?: unknown; path?: unknown };
    if (typeof op.path !== 'string') continue;
    const path = safeParsePath(op.path);
    if (path === null) continue;
    if (path.family.startsWith('sheet/') && op.kind === 'put') cells.push({ blockId: (path as { block_id: string }).block_id, path });
    else if (path.family === 'block/field' && path.field === 'removed_at' && (op.kind === 'put' || op.kind === 'remove')) removals.add(path.id);
  }
  const ids = [...new Set([...cells.map((cell) => cell.blockId), ...removals])];
  if (ids.length === 0) return false;
  const records = await db
    .select({ id: entities.id, row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'block'), inArray(entities.id, ids)));
  const blocks = new Map(records.map((record) => [record.id, record.row as BlockRow]));
  for (const id of removals) if (blocks.get(id)?.removal_conflict !== undefined) return true;
  return cells.some(({ blockId, path }) => {
    const block = blocks.get(blockId);
    return block !== undefined && sheetCellAt(block.sheet, path)?.conflict !== undefined;
  });
}
