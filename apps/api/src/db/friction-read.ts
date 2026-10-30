import { displayCellTargetSchema, safeParsePath, type OpPath } from '@app/domain';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from './client.ts';
import { entities, ops } from './schema.ts';

/*
 * Story 18.3: the op-log friction read. Read-only (SELECTs only) over one company's live
 * relatórios, their live blocks and the company's ops in `seq` order. It answers three
 * questions the usage events cannot:
 *
 * - D1 how long a sheet took: first to last `client_ts` of the DEVICE ops (actor not
 *   `system:*`) that target the block (`block/{id}`, `block/{id}/*`, `sheet/{id}/*`);
 *   server ops (reading suggestions, cleanups, seed moves) never stretch a span.
 * - D2 which fields were edited more than once: a block or sheet field path (not the
 *   `block/{id}` create) with two or more device ops of any kind.
 * - D3 what was typed after a failed reading: per `display` photo whose latest
 *   `reading_target` parses as `displayCellTargetSchema`, 1 when a device put on exactly its
 *   `start_cell` path lands after (by `seq`) a `failed` reading status.
 *
 * The report carries ids, closed keys and numbers only: no op value ever leaves this module.
 * Only `file/*` op values are fetched at all (the reading kind, target and status).
 */

export interface FrictionSheet {
  block_id: string;
  block_type: string;
  first_op_at: string | null;
  last_op_at: string | null;
  span_ms: number | null;
  device_op_count: number;
  fields_reedited: number;
  typed_after_failed_reading: number;
}

export interface FrictionRelatorio {
  relatorio_id: string;
  status: string;
  sheets: FrictionSheet[];
}

export interface FrictionTotals {
  relatorio_count: number;
  sheet_count: number;
  span_ms_total: number;
  device_op_count: number;
  fields_reedited: number;
  typed_after_failed_reading: number;
}

export interface FrictionReport {
  company: FrictionTotals;
  relatorios: FrictionRelatorio[];
}

/** One op as the read needs it; `value` is set only for `file/*` paths. */
export interface FrictionOp {
  seq: number;
  path: string;
  kind: string;
  actor_id: string;
  client_ts: string;
  value: unknown;
}

export const isServerActor = (actorId: string): boolean => actorId.startsWith('system:');

/** The block a path targets, for the families D1 and D2 count; null otherwise. */
export function blockOfPath(path: OpPath): string | null {
  switch (path.family) {
    case 'block':
    case 'block/field':
      return path.id;
    case 'sheet/nameplate':
    case 'sheet/checklist':
    case 'sheet/test':
    case 'sheet/test/cell':
    case 'sheet/test/value':
    case 'sheet/conclusion':
    case 'sheet/observations':
      return path.block_id;
    default:
      return null;
  }
}

interface SheetAcc {
  first: number | null;
  last: number | null;
  count: number;
  pathCounts: Map<string, number>;
  typed: number;
}

interface PhotoState {
  kind: string | null;
  target: unknown;
  /** The cell path and block a failure armed, waiting for a device put. */
  armed: { blockId: string; cellPath: string } | null;
  counted: boolean;
  /** A `removed_at` put non-null: the photo never arms again. */
  removed: boolean;
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/** Folds the company's ops (in `seq` order) into per-block accumulators. Pure. */
export function foldFriction(rows: readonly FrictionOp[]): Map<string, SheetAcc> {
  const sheets = new Map<string, SheetAcc>();
  const photos = new Map<string, PhotoState>();
  const accOf = (blockId: string): SheetAcc => {
    let acc = sheets.get(blockId);
    if (acc === undefined) {
      acc = { first: null, last: null, count: 0, pathCounts: new Map(), typed: 0 };
      sheets.set(blockId, acc);
    }
    return acc;
  };
  const photoOf = (id: string): PhotoState => {
    let photo = photos.get(id);
    if (photo === undefined) {
      photo = { kind: null, target: null, armed: null, counted: false, removed: false };
      photos.set(id, photo);
    }
    return photo;
  };
  // Cell paths armed by a failure, to the photos waiting on them.
  const armedCells = new Map<string, Set<string>>();
  /** Drops a photo's armed cell: its reading was re-run, re-kinded, re-targeted or removed. */
  const disarm = (photoId: string, photo: PhotoState): void => {
    if (photo.armed === null) return;
    const waiting = armedCells.get(photo.armed.cellPath);
    waiting?.delete(photoId);
    if (waiting?.size === 0) armedCells.delete(photo.armed.cellPath);
    photo.armed = null;
  };

  for (const row of rows) {
    const path = safeParsePath(row.path);
    if (path === null) continue;
    const device = !isServerActor(row.actor_id);

    if (path.family === 'file') {
      const value = record(row.value);
      const photo = photoOf(path.id);
      if (value !== null) {
        if (typeof value.reading_kind === 'string') photo.kind = value.reading_kind;
        if ('reading_target' in value) photo.target = value.reading_target;
      }
      continue;
    }
    if (path.family === 'file/field') {
      const photo = photoOf(path.id);
      if (path.field === 'reading_kind') {
        photo.kind = typeof row.value === 'string' ? row.value : null;
        disarm(path.id, photo);
      }
      if (path.field === 'reading_target') {
        photo.target = row.value;
        disarm(path.id, photo);
      }
      if (path.field === 'removed_at' && row.value !== null) {
        photo.removed = true;
        disarm(path.id, photo);
      }
      continue;
    }
    if (path.family === 'file/server') {
      if (path.field !== 'reading_status') continue;
      const photo = photoOf(path.id);
      // Any other status (queued, running, done, none) is a re-read: the failure no longer stands.
      if (row.value !== 'failed') {
        disarm(path.id, photo);
        continue;
      }
      if (photo.counted || photo.removed || photo.armed !== null || photo.kind !== 'display') continue;
      const target = displayCellTargetSchema.safeParse(photo.target);
      if (!target.success) continue;
      const { block_id, table_key, start_cell } = target.data;
      const cellPath = `sheet/${block_id}/test/${table_key}/cell/${start_cell.row}/${start_cell.col}`;
      photo.armed = { blockId: block_id, cellPath };
      const waiting = armedCells.get(cellPath) ?? new Set<string>();
      waiting.add(path.id);
      armedCells.set(cellPath, waiting);
      continue;
    }

    const blockId = blockOfPath(path);
    if (blockId === null || !device) continue;
    const acc = accOf(blockId);
    const ts = Date.parse(row.client_ts);
    acc.first = acc.first === null ? ts : Math.min(acc.first, ts);
    acc.last = acc.last === null ? ts : Math.max(acc.last, ts);
    acc.count += 1;
    if (path.family !== 'block') acc.pathCounts.set(row.path, (acc.pathCounts.get(row.path) ?? 0) + 1);

    if (path.family === 'sheet/test/cell' && row.kind === 'put') {
      const waiting = armedCells.get(row.path);
      if (waiting !== undefined) {
        for (const photoId of waiting) {
          const photo = photoOf(photoId);
          photo.counted = true;
          photo.armed = null;
          acc.typed += 1;
        }
        armedCells.delete(row.path);
      }
    }
  }
  return sheets;
}

function sheetOf(blockId: string, blockType: string, acc: SheetAcc | undefined): FrictionSheet {
  if (acc === undefined || acc.count === 0) {
    return { block_id: blockId, block_type: blockType, first_op_at: null, last_op_at: null, span_ms: null, device_op_count: 0, fields_reedited: 0, typed_after_failed_reading: acc?.typed ?? 0 };
  }
  let reedited = 0;
  for (const count of acc.pathCounts.values()) if (count >= 2) reedited += 1;
  return {
    block_id: blockId,
    block_type: blockType,
    first_op_at: new Date(acc.first!).toISOString(),
    last_op_at: new Date(acc.last!).toISOString(),
    span_ms: acc.last! - acc.first!,
    device_op_count: acc.count,
    fields_reedited: reedited,
    typed_after_failed_reading: acc.typed,
  };
}

/** Sums sheets into the totals a relatório or the company line prints. */
export function totalsOf(sheets: readonly FrictionSheet[]): Omit<FrictionTotals, 'relatorio_count'> {
  return {
    sheet_count: sheets.length,
    span_ms_total: sheets.reduce((sum, s) => sum + (s.span_ms ?? 0), 0),
    device_op_count: sheets.reduce((sum, s) => sum + s.device_op_count, 0),
    fields_reedited: sheets.reduce((sum, s) => sum + s.fields_reedited, 0),
    typed_after_failed_reading: sheets.reduce((sum, s) => sum + s.typed_after_failed_reading, 0),
  };
}

export async function readFriction(db: Db, companyId: string): Promise<FrictionReport> {
  // One read-only snapshot, so the entities and the ops agree with each other.
  const { relatorioRows, blockRows, opRows } = await db.transaction(
    async (tx) => ({
      relatorioRows: await readRelatorios(tx, companyId),
      blockRows: await readBlocks(tx, companyId),
      opRows: await readOps(tx, companyId),
    }),
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
  return reportOf(relatorioRows, blockRows, opRows);
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const readRelatorios = (tx: Tx, companyId: string) =>
  tx
    .select({ id: entities.id, status: sql<string>`${entities.row}->>'status'` })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'relatorio'), isNull(entities.removed_at)))
    .orderBy(asc(entities.id));

const readBlocks = (tx: Tx, companyId: string) =>
  tx
    .select({ id: entities.id, relatorio_id: entities.relatorio_id, block_type: sql<string>`${entities.row}->>'block_type'` })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'block'), isNull(entities.removed_at)))
    .orderBy(asc(entities.id));

const readOps = (tx: Tx, companyId: string) =>
  tx
    .select({
      seq: ops.seq,
      path: ops.path,
      kind: ops.kind,
      actor_id: ops.actor_id,
      client_ts: ops.client_ts,
      // Only a photo's values are read (reading kind, target, status); no other value is fetched.
      value: sql<unknown>`case when ${ops.path} like 'file/%' then ${ops.value} else null end`,
    })
    .from(ops)
    .where(eq(ops.company_id, companyId))
    .orderBy(asc(ops.seq));

function reportOf(
  relatorioRows: readonly { id: string; status: string | null }[],
  blockRows: readonly { id: string; relatorio_id: string | null; block_type: string | null }[],
  opRows: readonly FrictionOp[],
): FrictionReport {
  const accs = foldFriction(opRows);
  const relatorios: FrictionRelatorio[] = relatorioRows.map((r) => ({
    relatorio_id: r.id,
    status: r.status ?? 'unknown',
    sheets: blockRows.filter((b) => b.relatorio_id === r.id).map((b) => sheetOf(b.id, b.block_type ?? 'unknown', accs.get(b.id))),
  }));
  const allSheets = relatorios.flatMap((r) => r.sheets);
  return { company: { relatorio_count: relatorios.length, ...totalsOf(allSheets) }, relatorios };
}
