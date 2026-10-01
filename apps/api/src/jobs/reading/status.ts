import { toIso, type Clock, type NewId, type Op } from '@app/domain';
import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.ts';
import type { CompanyId } from '../../db/repositories/company-id.ts';
import { findFileRow } from '../../db/repositories/files.ts';
import { ops } from '../../db/schema.ts';
import { log } from '../../log.ts';
import { applyServerBatch, ServerBatchRejectedError, type Tx } from '../../sync/apply.ts';
import { serverOp } from '../../sync/server-op.ts';
import type { ReadingPayload } from './payload.ts';

/*
 * Story 8.4: the reading status transitions, all written by `system:reading`: the device's
 * create says `queued`; file receipt and `POST /api/photos/{id}/reread` send one job and
 * write `running`; the job writes `done` or `failed`.
 */

export const READING_ACTOR = 'system:reading';

export type ReadingStatusValue = 'running' | 'done' | 'failed';

/** The `file/{id}/reading_status` path of a photo. */
export function readingStatusPath(photoId: string): string {
  return `file/${photoId}/reading_status`;
}

/** One server op of the reading job's actor (relatório scope when the photo has one). */
export function readingServerOp(input: {
  companyId: string;
  relatorioId: string | null;
  kind: 'create' | 'put';
  path: string;
  value: unknown;
  batchId: string | null;
  now: Clock;
  newId: NewId;
}): Op {
  return serverOp({
    opId: input.newId(),
    companyId: input.companyId,
    actorId: READING_ACTOR,
    clientTs: toIso(input.now()),
    kind: input.kind,
    path: input.path,
    value: input.value,
    relatorioId: input.relatorioId,
    batchId: input.batchId,
  });
}

/** The newest op on a photo's `reading_status` path, or null when only its create set one. */
async function latestStatusOpId(db: Db | Tx, companyId: CompanyId, photoId: string): Promise<string | null> {
  const [latest] = await db
    .select({ op_id: ops.op_id })
    .from(ops)
    .where(and(eq(ops.company_id, companyId), eq(ops.path, readingStatusPath(photoId))))
    .orderBy(desc(ops.seq))
    .limit(1);
  return latest?.op_id ?? null;
}

/** The job already wrote its outcome before `running` could be written: `running` is not written over it. */
class StatusMovedError extends Error {}

/**
 * E78-Q7: the send of the reading job itself failed (nothing was queued), as opposed to the
 * `running` write after it. File receipt writes `failed` for it; the reread route answers 500.
 */
export class ReadingSendError extends Error {}

/** The photo's stored `reading_status`, or null when the company holds no such photo row. */
async function storedStatus(db: Db | Tx, companyId: CompanyId, photoId: string): Promise<string | null> {
  const found = await findFileRow(db, companyId, photoId);
  return found === null || found.row.kind !== 'photo' ? null : found.row.reading_status;
}

/** Why `writeReadingFailed` wrote nothing: the status moved (or the photo is gone), or `stillLive` said a job will write. */
class NotStuckError extends Error {}

export interface WriteFailedDeps {
  db: Db;
  now: Clock;
  newId: NewId;
}

/**
 * Writes `reading_status = failed` as `system:reading` (E78-Q6, E78-Q7), under the company
 * lock, only while the photo's status is still `from` and `stillLive` (when given) finds no
 * job that will write an outcome of its own. Returns whether `failed` was written.
 */
export async function writeReadingFailed(
  deps: WriteFailedDeps,
  companyId: CompanyId,
  photo: { id: string; relatorioId: string | null },
  from: 'queued' | 'running',
  stillLive?: () => Promise<boolean>,
): Promise<boolean> {
  const op = readingServerOp({
    companyId,
    relatorioId: photo.relatorioId,
    kind: 'put',
    path: readingStatusPath(photo.id),
    value: 'failed' satisfies ReadingStatusValue,
    batchId: null,
    now: deps.now,
    newId: deps.newId,
  });
  try {
    await applyServerBatch(deps.db, companyId, [op], {
      now: deps.now,
      before: async (tx) => {
        if ((await storedStatus(tx, companyId, photo.id)) !== from) throw new NotStuckError();
        if (stillLive !== undefined && (await stillLive())) throw new NotStuckError();
      },
    });
    return true;
  } catch (error) {
    if (error instanceof NotStuckError) return false;
    if (error instanceof ServerBatchRejectedError) throw new Error(`reading failed op rejected: ${error.message}`, { cause: error });
    throw error;
  }
}

export interface StartReadingDeps {
  db: Db;
  now: Clock;
  newId: NewId;
  enqueue: (payload: ReadingPayload) => Promise<void>;
}

/**
 * Sends one reading job and writes `running`. The status op is applied only if no other
 * `reading_status` op landed since the job was sent (checked inside the batch transaction,
 * under the company lock): a job fast enough to write `done` or `failed` first keeps its
 * outcome instead of being overwritten by a stale `running`. Returns whether `running` was
 * written. A failed send throws `ReadingSendError` to the caller, before anything is written.
 */
export async function startReading(
  deps: StartReadingDeps,
  companyId: CompanyId,
  photo: { id: string; relatorioId: string | null },
  payload: ReadingPayload,
): Promise<boolean> {
  const seen = await latestStatusOpId(deps.db, companyId, photo.id);
  try {
    await deps.enqueue(payload);
  } catch (error) {
    throw new ReadingSendError(`reading job not sent: ${String(error)}`, { cause: error });
  }
  const op = readingServerOp({
    companyId,
    relatorioId: photo.relatorioId,
    kind: 'put',
    path: readingStatusPath(photo.id),
    value: 'running' satisfies ReadingStatusValue,
    batchId: null,
    now: deps.now,
    newId: deps.newId,
  });
  try {
    await applyServerBatch(deps.db, companyId, [op], {
      now: deps.now,
      before: async (tx) => {
        if ((await latestStatusOpId(tx, companyId, photo.id)) !== seen) throw new StatusMovedError();
      },
    });
    return true;
  } catch (error) {
    if (error instanceof StatusMovedError) {
      log('reading status moved before running was written', { company_id: companyId, relatorio_id: photo.relatorioId, photo_id: photo.id });
      return false;
    }
    if (error instanceof ServerBatchRejectedError) throw new Error(`reading running op rejected: ${error.message}`, { cause: error });
    throw error;
  }
}
