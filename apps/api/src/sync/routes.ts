import {
  CONTRACT_VERSION_HEADER,
  MIN_CONTRACT_VERSION,
  sinceQuerySchema,
  syncPushBodySchema,
  toIso,
  type Clock,
  type ErrorResponse,
  type SyncPullResponse,
  type SyncPushResponse,
} from '@app/domain';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Db } from '../db/client.ts';
import { type AppEnv, requireSession } from '../http/session.ts';
import { applyOps } from './apply.ts';
import { companySummary, pullCompany, pullProject, pullRelatorio, recordPush } from './pull.ts';

/*
 * AD-13, AD-24: the sync routes of `packages/domain/contract`. A push is
 * accepted from any client (families are append-only); only a pull checks the
 * contract header and answers `426 contract_outdated`.
 */

export interface SyncRouteDeps {
  now: Clock;
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

/** `entities.id` is a uuid column: anything else is "no such relatorio", never a cast error. */
const relatorioIdSchema = z.uuid();

export function createSyncRoutes(db: Db, deps: SyncRouteDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post('/api/sync/ops', async (c) => {
    const session = requireSession(c);
    const body: unknown = await c.req.json().catch(() => undefined);
    const parsed = syncPushBodySchema.safeParse(body);
    if (!parsed.success) return c.json(batchInvalid, 400);

    const result = await applyOps(db, session.companyId, parsed.data.ops, {
      now: deps.now,
      origin: 'client',
      actorId: session.userId,
    });

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
      for (const deviceId of devices) await recordPush(db, session.companyId, session.userId, deviceId, at);
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
