import {
  CONTRACT_VERSION_HEADER,
  safeParsePath,
  MARK_AWARE_CONTRACT_VERSION,
  MIN_CONTRACT_VERSION,
  sinceQuerySchema,
  syncPushBodySchema,
  toIso,
  type Clock,
  type ErrorResponse,
  type NewId,
  type SyncPullResponse,
  type SyncPushResponse,
} from '@app/domain';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Db } from '../db/client.ts';
import type { CompanyId } from '../db/repositories/company-id.ts';
import { findFileRow } from '../db/repositories/files.ts';
import { type AppEnv, requireSession } from '../http/session.ts';
import { newId as mintId } from '../ids.ts';
import type { ReadingPayload } from '../jobs/reading/payload.ts';
import { sendReading } from '../jobs/reading/send.ts';
import { logError } from '../log.ts';
import { applyOps, type Tx } from './apply.ts';
import { pushTouchesConflictMark } from './marks.ts';
import { companySummary, pullCompany, pullProject, pullRelatorio, recordPush } from './pull.ts';

/*
 * AD-13, AD-24: the sync routes of `packages/domain/contract`. A push is
 * accepted from any client (families are append-only); a pull checks the
 * contract header and answers `426 contract_outdated`. One exception (2026-09-29,
 * E10-Q6): a push from a client older than `MARK_AWARE_CONTRACT_VERSION` (or with no
 * header) that writes a cell or block holding a conflict mark is answered 426 whole,
 * nothing applied, since its unstamped write would settle a decision it never saw.
 */

export interface SyncRouteDeps {
  now: Clock;
  newId?: NewId;
  /**
   * Story 9.2: sends a photo's reading when a client `file/{id}/reading_kind` put re-queued it
   * and its bytes are already stored (file receipt sends it otherwise). Absent without a queue.
   */
  enqueueReading?: (payload: ReadingPayload) => Promise<void>;
  /** Story 11.8 follow-up: `false` when `AI_FEATURES=off` (`jobs/reading/send.ts`); absent reads as on. */
  aiFeatures?: boolean;
}

/** The photo ids of the applied client `file/{id}/reading_kind` puts of a push, once each. */
function retargetedPhotos(ops: readonly unknown[], applied: ReadonlySet<string>): string[] {
  const ids = new Set<string>();
  for (const raw of ops) {
    const op = raw as { op_id?: unknown; kind?: unknown; path?: unknown };
    if (typeof op.op_id !== 'string' || !applied.has(op.op_id) || op.kind !== 'put' || typeof op.path !== 'string') continue;
    const path = safeParsePath(op.path);
    if (path !== null && path.family === 'file/field' && path.field === 'reading_kind') ids.add(path.id);
  }
  return [...ids];
}

/**
 * Story 9.2: the reading a re-target queued, sent when the photo row now says `queued` with a
 * kind, is live, and its bytes are already stored; a photo not uploaded yet is sent by file
 * receipt when its bytes land. Scoped by the session's company (AD-10). Never fatal to the push.
 */
async function sendRetargetedReading(db: Db, companyId: CompanyId, photoId: string, deps: SyncRouteDeps): Promise<void> {
  const record = await findFileRow(db, companyId, photoId);
  if (record === null || record.removedAt !== null || record.row.kind !== 'photo') return;
  const photo = record.row;
  if (photo.removed_at !== null || photo.uploaded_at === null || photo.reading_status !== 'queued' || photo.reading_kind === null) return;
  await sendReading(
    { db, now: deps.now, newId: deps.newId ?? mintId, ...(deps.enqueueReading === undefined ? {} : { enqueue: deps.enqueueReading }), ...(deps.aiFeatures === undefined ? {} : { aiFeatures: deps.aiFeatures }) },
    companyId,
    { id: photo.id, relatorioId: record.relatorioId },
    photo.reading_kind,
  );
}

const batchInvalid: ErrorResponse = {
  code: 'sync_batch_invalid',
  message: 'The body must be {ops: Op[]} with at most 500 ops, and `since` a non-negative integer.',
};

const outdated: ErrorResponse = {
  code: 'contract_outdated',
  message: 'This app version is too old to receive changes; update the app.',
};

const relatorioNotFound: ErrorResponse = {
  code: 'relatorio_not_found',
  message: 'No such relatorio in this company.',
};

const projectNotFound: ErrorResponse = {
  code: 'not_found',
  message: 'No such project in this company.',
};

/** The client's contract version, or null when the header is missing or not an integer. */
function contractVersionOf(c: Context<AppEnv>): number | null {
  const raw = c.req.header(CONTRACT_VERSION_HEADER);
  if (raw === undefined || !/^\d+$/.test(raw.trim())) return null;
  return Number.parseInt(raw, 10);
}

function isOutdated(c: Context<AppEnv>): boolean {
  const version = contractVersionOf(c);
  return version === null || version < MIN_CONTRACT_VERSION;
}

/** E10-Q6: a client that stamps nothing it saw (older than contract 12, or no header). */
function isMarkBlind(c: Context<AppEnv>): boolean {
  const version = contractVersionOf(c);
  return version === null || version < MARK_AWARE_CONTRACT_VERSION;
}

/** Thrown under the push's lock when a mark-blind client's push writes a marked cell or block: the route answers 426. */
class MarkBlindPushError extends Error {
  constructor() {
    super('a mark-blind push writes a cell or block holding a conflict mark');
    this.name = 'MarkBlindPushError';
  }
}

/** `entities.id` is a uuid column: anything else is "no such relatorio", never a cast error. */
const relatorioIdSchema = z.uuid();

export function createSyncRoutes(db: Db, deps: SyncRouteDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post('/api/sync/ops', async (c) => {
    const session = requireSession(c);
    const body: unknown = await c.req.json().catch(() => undefined);
    const parsed = syncPushBodySchema.safeParse(body);
    if (!parsed.success) return c.json(batchInvalid, 400);
    // A-10 (review 2026-09-30): the mark-blind check reads the rows under the company lock the
    // apply takes (its `before` hook), so a mark another push stamps while this one waits for
    // the lock is seen, never cleared by a client that could not have seen it.
    const guard = isMarkBlind(c)
      ? async (tx: Tx) => {
          if (await pushTouchesConflictMark(tx, session.companyId, parsed.data.ops)) throw new MarkBlindPushError();
        }
      : undefined;
    let result: Awaited<ReturnType<typeof applyOps>>;
    try {
      result = await applyOps(db, session.companyId, parsed.data.ops, {
        now: deps.now,
        origin: 'client',
        actorId: session.userId,
        ...(guard === undefined ? {} : { before: guard }),
      });
    } catch (error) {
      if (error instanceof MarkBlindPushError) return c.json(outdated, 426);
      throw error;
    }

    if (result.applied.length > 0) {
      const appliedIds = new Set(result.applied.map((a) => a.op_id));
      const devices = new Set<string>();
      for (const raw of parsed.data.ops) {
        const op = raw as { op_id?: unknown; device_id?: unknown };
        if (typeof op.op_id === 'string' && typeof op.device_id === 'string' && appliedIds.has(op.op_id)) {
          devices.add(op.device_id);
        }
      }
      const at = toIso(deps.now());
      for (const deviceId of devices) {
        try {
          await recordPush(db, session.companyId, session.userId, deviceId, at);
        } catch (error) {
          // A-15: the ops are committed; a failed "last push" stamp must not answer 500 and
          // make the device send them again. It is logged, and the next push stamps it.
          logError('push not recorded', { company_id: session.companyId, device_id: deviceId, error: String(error) });
        }
      }
      for (const photoId of retargetedPhotos(parsed.data.ops, appliedIds)) {
        try {
          await sendRetargetedReading(db, session.companyId, photoId, deps);
        } catch (error) {
          // The ops are committed: the push is answered whatever the send did.
          logError('retargeted reading not sent', { company_id: session.companyId, file_id: photoId, error: String(error) });
        }
      }
    }

    const response: SyncPushResponse = {
      applied: result.applied,
      rejected: result.rejected,
      superseded: result.superseded,
    };
    return c.json(response, 200);
  });

  routes.get('/api/sync/company', async (c) => {
    const session = requireSession(c);
    if (isOutdated(c)) return c.json(outdated, 426);
    const since = sinceQuerySchema.safeParse(c.req.query('since'));
    if (!since.success) return c.json(batchInvalid, 400);

    const [page, summary] = await Promise.all([
      pullCompany(db, session.companyId, since.data),
      companySummary(db, session.companyId),
    ]);
    const response: SyncPullResponse = { ops: page.ops, seq: page.head, summary };
    return c.json(response, 200);
  });

  routes.get('/api/sync/relatorios/:id', async (c) => {
    const session = requireSession(c);
    const id = c.req.param('id');
    c.set('relatorioId', id);
    if (isOutdated(c)) return c.json(outdated, 426);
    const since = sinceQuerySchema.safeParse(c.req.query('since'));
    if (!since.success) return c.json(batchInvalid, 400);
    if (!relatorioIdSchema.safeParse(id).success) return c.json(relatorioNotFound, 404);

    const page = await pullRelatorio(db, session.companyId, id, since.data);
    if (page === null) return c.json(relatorioNotFound, 404);
    const response: SyncPullResponse = { ops: page.ops, seq: page.head };
    return c.json(response, 200);
  });

  // Epic 4 retro item 17: the project's own stream (its project-scope ops), same page shape.
  routes.get('/api/sync/projects/:id', async (c) => {
    const session = requireSession(c);
    const id = c.req.param('id');
    if (isOutdated(c)) return c.json(outdated, 426);
    const since = sinceQuerySchema.safeParse(c.req.query('since'));
    if (!since.success) return c.json(batchInvalid, 400);
    if (!relatorioIdSchema.safeParse(id).success) return c.json(projectNotFound, 404);

    const page = await pullProject(db, session.companyId, id, since.data);
    if (page === null) return c.json(projectNotFound, 404);
    const response: SyncPullResponse = { ops: page.ops, seq: page.head };
    return c.json(response, 200);
  });

  return routes;
}
