import { z } from 'zod';
import { isoTimestampSchema } from '../clock.ts';
import { opSchema } from '../ops/op.ts';
import { relatorioStatusSchema } from '../schemas/entities.ts';
import { opRejectCodeSchema } from './errors.ts';

/*
 * AD-13, AD-24: the three sync routes. The client builds every request from
 * these schemas and validates every response with them; the server parses the
 * batch envelope here and each op through `applyOps`.
 */

export const SYNC_PUSH_MAX_OPS = 500;

/** Body of `POST /api/sync/ops` as the client sends it: array order is apply order. */
export const syncPushRequestSchema = z.object({
  ops: z.array(opSchema).max(SYNC_PUSH_MAX_OPS),
});
export type SyncPushRequest = z.infer<typeof syncPushRequestSchema>;

/**
 * The batch envelope the server checks before touching any op: `{ops: [...]}` of at
 * most `SYNC_PUSH_MAX_OPS` elements. Each element is validated on its own by `applyOps`
 * so one malformed op is rejected per op (`op_invalid`) instead of failing the batch
 * (per-op atomicity, AD-24). Anything else is `400 sync_batch_invalid`.
 */
export const syncPushBodySchema = z.object({
  ops: z.array(z.unknown()).max(SYNC_PUSH_MAX_OPS),
});

const seqSchema = z.number().int().nonnegative();

export const syncPushResponseSchema = z.object({
  applied: z.array(z.object({ op_id: z.string().min(1), seq: seqSchema })),
  rejected: z.array(z.object({ op_id: z.string(), code: opRejectCodeSchema })),
  superseded: z.array(z.object({ op_id: z.string().min(1), over_op_id: z.string().min(1) })),
});
export type SyncPushResponse = z.infer<typeof syncPushResponseSchema>;

/** AD-24: `last_push_at` per `(user_id, device_id)`; written to `sync_state`, never to an entity. */
export const lastPushAtSchema = z.object({
  user_id: z.string().min(1),
  device_id: z.string().min(1),
  at: isoTimestampSchema,
});
export type LastPushAt = z.infer<typeof lastPushAtSchema>;

/** AD-8: the minimal relatorio row that scopes a stream; `progress` is appended by a later epic. */
export const relatorioSummarySchema = z.object({
  id: z.string().min(1),
  project_id: z.string().min(1),
  status: relatorioStatusSchema,
  template_id: z.string().nullable(),
  seed_version: z.string(),
  updated_seq: seqSchema,
});
export type RelatorioSummary = z.infer<typeof relatorioSummarySchema>;

export const syncSummarySchema = z.object({
  last_push_at: z.array(lastPushAtSchema),
  relatorios: z.array(relatorioSummarySchema),
});
export type SyncSummary = z.infer<typeof syncSummarySchema>;

/**
 * Response of both pull routes, `{ops, seq, summary?}` and nothing else. `ops` are
 * validated one by one on the device (`parsePulled`), so an op this bundle cannot
 * parse stops the cursor instead of failing the page; `seq` is the stream head at the
 * time of the pull; `summary` comes only with the company stream.
 */
export const syncPullResponseSchema = z.strictObject({
  ops: z.array(z.unknown()),
  seq: seqSchema,
  summary: syncSummarySchema.optional(),
});
export type SyncPullResponse = z.infer<typeof syncPullResponseSchema>;

/** The `since` query of a pull: a non-negative integer, `0` when absent. */
export const sinceQuerySchema = z.coerce.number().int().nonnegative().default(0);

export interface SyncRoute {
  method: 'GET' | 'POST';
  path: string;
}

/** The route table the client speaks through (AD-13). */
export const SYNC_ROUTES = {
  pushOps: { method: 'POST', path: '/api/sync/ops' } as SyncRoute,
  pullCompany: { method: 'GET', path: '/api/sync/company' } as SyncRoute,
  pullRelatorio: (id: string): SyncRoute => ({ method: 'GET', path: `/api/sync/relatorios/${id}` }),
} as const;
