import {
  AI_WRITE_OUTCOME_PATH,
  aiWriteOutcomeRequestSchema,
  audioPermissionPath,
  audioTargetSchema,
  can,
  permissionForPath,
  toIso,
  type Clock,
  type ErrorCode,
  type ErrorResponse,
} from '@app/domain';
import { Hono } from 'hono';
import { aiWriteAnswerOf, settleReportedRefusal } from '../ai/answers.ts';
import type { Db } from '../db/client.ts';
import { log } from '../log.ts';
import { AI_WRITE_RATE_LIMIT } from './ai-write.ts';
import { readLiveRelatorio } from './barrier.ts';
import { FixedWindowLimiter, tooMany, type RateLimitRule } from './rate-limit.ts';
import { type AppEnv, ForbiddenError, requireSession } from './session.ts';

/*
 * Story 32.1 (Matheus, 2026-11-27): `POST /api/relatorios/:id/write-outcome`, the device's report of
 * an AI proposal it did not write (Story 31.10's "Manter o meu texto", or the text changed while the
 * AI wrote). Such a proposal writes no op, so this is the only way its record learns the user's
 * answer. The order of the answers, as the AI control's own route: an unknown (or another company's)
 * relatório `404 not_found` (the company comes from the session, AD-10); a body that is not
 * `{run_id, outcome: 'refused', action}` `400 invalid_request`; a run that is no proposal of this
 * relatório `404 not_found`; a role without the key of the field's own path `403 forbidden` (AD-29,
 * the field's write permission); over the per-user limit `429 rate_limited`; then `204`. A record
 * already settled (a confirm that landed first) or closed is left as it is, and the answer is still
 * `204`: the report is a fact about the device, never an undo. Nothing is written to the relatório.
 */

export interface AiWriteOutcomeRouteDeps {
  now: Clock;
  /** The per-user limit; absent, the AI control's (`AI_WRITE_RATE_LIMIT`). Always on. */
  limit?: RateLimitRule;
  limitNow?: () => number;
}

function fail(code: ErrorCode, message: string): ErrorResponse {
  return { code, message };
}

export function createAiWriteOutcomeRoutes(db: Db, deps: AiWriteOutcomeRouteDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const limiter = new FixedWindowLimiter(deps.limit ?? AI_WRITE_RATE_LIMIT, deps.limitNow);

  routes.post(AI_WRITE_OUTCOME_PATH, async (c) => {
    const session = requireSession(c);
    const relatorioId = c.req.param('id') ?? '';
    c.set('relatorioId', relatorioId);
    const relatorio = await readLiveRelatorio(db, session.companyId, relatorioId);
    if (relatorio === null) return c.json(fail('not_found', 'No such relatorio.'), 404);

    const body: unknown = await c.req.json().catch(() => undefined);
    const parsed = aiWriteOutcomeRequestSchema.safeParse(body);
    if (!parsed.success) return c.json(fail('invalid_request', "The body must be {run_id, outcome: 'refused', action: 'keep_mine' | 'text_changed'}."), 400);
    const { run_id, action } = parsed.data;

    const record = await aiWriteAnswerOf(db, session.companyId, relatorioId, run_id);
    const target = record === null ? null : audioTargetSchema.safeParse(record.target);
    if (record === null || target === null || !target.success) return c.json(fail('not_found', 'No such AI proposal in this relatorio.'), 404);
    const need = permissionForPath(audioPermissionPath(target.data), { kind: 'put', value: null });
    if (need !== 'none' && !can(session.role, need)) throw new ForbiddenError();

    const decision = limiter.consume(session.userId);
    if (!decision.allowed) return tooMany(c, decision.retryAfterSeconds);

    const settled = await settleReportedRefusal(db, session.companyId, record, action, { userId: session.userId, at: toIso(deps.now()) });
    // Closed values only: never a text.
    log('ai write outcome', { company_id: session.companyId, relatorio_id: relatorioId, run_id, action, settled });
    return c.body(null, 204);
  });

  return routes;
}
