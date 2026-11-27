import {
  AI_WRITE_PATH,
  aiRewriteJoin,
  aiRewriteSource,
  aiRewriteVerdict,
  aiWriteRequestSchema,
  audioPermissionPath,
  can,
  permissionForPath,
  toIso,
  type AiWriteResponse,
  type Clock,
  type ErrorCode,
  type ErrorResponse,
  type GuardReason,
  type NewId,
  type WritingProvider,
  type WritingResult,
} from '@app/domain';
import { Hono } from 'hono';
import { billedCallOf } from '../ai/errors.ts';
import type { Db } from '../db/client.ts';
import { consumeDailyQuota, DEFAULT_AI_WRITE_DAILY_QUOTA } from '../db/repositories/ai-usage.ts';
import { transcriptionRuns } from '../db/schema.ts';
import { log, logError } from '../log.ts';
import { toSnapshot } from '../sync/snapshot.ts';
import { barrierMissing, readLiveRelatorio } from './barrier.ts';
import { FixedWindowLimiter, tooMany, type RateLimitRule } from './rate-limit.ts';
import { type AppEnv, ForbiddenError, requireSession } from './session.ts';

/*
 * Story 31.9 (AD-30, FR-79): `POST /api/relatorios/:id/write`, the AI control ("Melhorar o texto
 * com IA"). The order of the answers: an unknown (or another company's) relatório `404 not_found`
 * (the company comes from the session, AD-10); AI features off `409 ai_features_off`; a body that
 * is not `{target, last_op_id}` or names a measurement table `400 invalid_request`; a role without
 * the key of the field's own path `403 forbidden` (AD-29: the control follows the field's write
 * permission, as the mic does); over the per-user limit `429 rate_limited`; AD-15's flush barrier
 * `409 not_caught_up`; a field that holds no text `409 invalid_request`. Then the server reads the
 * field's text and context from its own store (`aiRewriteSource`), runs the writing step at the
 * `report` level on the prose provider (`LLM_PROVIDER`, `fake` by default) and the kernel's guard,
 * stores one `transcription_runs` row (`kind = 'ai_write'`: model, prompt version, tokens, USD) and
 * answers `200`: the new text, or `refused` (the guard failed, or the call did). Nothing is written
 * to the relatório here: the device replaces the text by an ordinary put of the user's, so the
 * outbox, the permission and "Desfazer" are the normal ones.
 */

/** The default per-user limit of the AI control: a tap every few seconds at most, sustained. */
export const AI_WRITE_RATE_LIMIT: RateLimitRule = { max: 20, windowMs: 60_000 };

export interface AiWriteRouteDeps {
  now: Clock;
  newId: NewId;
  /** The prose (writing) provider and its name for the run row. */
  writing: { name: string; provider: WritingProvider };
  /** `false` when `AI_FEATURES=off`. Absent reads as on. */
  aiFeatures?: boolean;
  /** The per-user limit; absent, `AI_WRITE_RATE_LIMIT`. Always on. */
  limit?: RateLimitRule;
  limitNow?: () => number;
  /** Security pass 2026-11-26 (A1): the company's daily ceiling of AI control taps; at it the route answers `429 quota_exceeded` and calls no model. */
  dailyQuota?: number;
}

function fail(code: ErrorCode, message: string): ErrorResponse {
  return { code, message };
}

function guardText(reasons: readonly GuardReason[]): string {
  return reasons.length === 0 ? 'guard: empty text' : `guard: ${reasons.map((reason) => `${reason.problem} ${reason.kind} ${reason.value}`).join('; ')}`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

export function createAiWriteRoutes(db: Db, deps: AiWriteRouteDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const limiter = new FixedWindowLimiter(deps.limit ?? AI_WRITE_RATE_LIMIT, deps.limitNow);

  routes.post(AI_WRITE_PATH, async (c) => {
    const session = requireSession(c);
    const relatorioId = c.req.param('id') ?? '';
    c.set('relatorioId', relatorioId);
    const relatorio = await readLiveRelatorio(db, session.companyId, relatorioId);
    if (relatorio === null) return c.json(fail('not_found', 'No such relatorio.'), 404);
    if (deps.aiFeatures === false) return c.json(fail('ai_features_off', 'AI features are off on this server.'), 409);

    const body: unknown = await c.req.json().catch(() => undefined);
    const parsed = aiWriteRequestSchema.safeParse(body);
    if (!parsed.success) return c.json(fail('invalid_request', 'The body must be {target, last_op_id} naming a prose field.'), 400);
    const { target, last_op_id } = parsed.data;
    const need = permissionForPath(audioPermissionPath(target), { kind: 'put', value: null });
    if (need !== 'none' && !can(session.role, need)) throw new ForbiddenError();

    const decision = limiter.consume(session.userId);
    if (!decision.allowed) return tooMany(c, decision.retryAfterSeconds);

    const missing = await barrierMissing(db, session.companyId, last_op_id, []);
    if (missing.missing_op) return c.json(fail('not_caught_up', 'The server has not applied every op yet.'), 409);

    const snapshot = await toSnapshot(db, session.companyId, relatorioId);
    const source = aiRewriteSource(snapshot, target, { now: deps.now() });
    if (source === null) return c.json(fail('invalid_request', 'The field holds no text.'), 409);

    // Security pass 2026-11-26 (A1): one unit of the company's day per tap that reaches the provider.
    if (!(await consumeDailyQuota(db, session.companyId, 'ai_write', deps.dailyQuota ?? DEFAULT_AI_WRITE_DAILY_QUOTA))) {
      log('quota_exceeded', { company_id: session.companyId, relatorio_id: relatorioId, kind: 'ai_write' });
      return c.json(fail('quota_exceeded', 'The daily AI writing limit of this company is reached.'), 429);
    }

    const startedAt = deps.now().getTime();
    let result: WritingResult | null = null;
    let billed: ReturnType<typeof billedCallOf> = null;
    let error: string | null = null;
    let guard: 'passed' | 'failed' | null = null;
    let fallback: string | null = null;
    let answer: AiWriteResponse;
    try {
      // e31f: one call per piece (a section text block by block, so each block keeps its kind), the usage summed.
      const written: string[] = [];
      let summed: WritingResult | null = null;
      for (const piece of source.pieces) {
        const one: WritingResult = await deps.writing.provider.write({ text: piece, level: 'report', context: source.context, source: 'field' });
        written.push(one.text);
        const usage: WritingResult['usage'] = summed === null ? one.usage : { input_tokens: summed.usage.input_tokens + one.usage.input_tokens, output_tokens: summed.usage.output_tokens + one.usage.output_tokens, usd: summed.usage.usd + one.usage.usd };
        summed = { ...one, usage };
        result = summed;
      }
      const text = aiRewriteJoin(source, written);
      const verdict = aiRewriteVerdict(source, text);
      if (verdict.ok) {
        guard = 'passed';
        answer = { outcome: 'written', source: source.text, text };
      } else {
        guard = 'failed';
        fallback = guardText(verdict.reasons);
        answer = { outcome: 'refused', reason: 'guard' };
      }
    } catch (caught) {
      billed = billedCallOf(caught);
      error = errorText(caught);
      fallback = `writing_failed: ${error}`;
      answer = { outcome: 'refused', reason: 'failed' };
    }

    const runId = deps.newId();
    const usage = result?.usage ?? billed?.usage ?? null;
    const fields = { company_id: session.companyId, relatorio_id: relatorioId, run_id: runId, target: target.type, outcome: answer.outcome };
    try {
      await db.insert(transcriptionRuns).values({
        id: runId,
        company_id: session.companyId,
        kind: 'ai_write',
        audio_id: null,
        user_id: session.userId,
        target,
        relatorio_id: relatorioId,
        job_id: null,
        attempt: 1,
        outcome: error === null ? 'ok' : 'error',
        error,
        level: 'report',
        speech_provider: null,
        speech_model: null,
        writing_provider: deps.writing.name,
        model: result?.model ?? billed?.model ?? null,
        prompt_version: result?.prompt_version ?? billed?.prompt_version ?? null,
        audio_seconds: null,
        input_tokens: usage?.input_tokens ?? null,
        output_tokens: usage?.output_tokens ?? null,
        usd: usage === null ? null : Math.round(usage.usd * 1e6) / 1e6,
        duration_ms: Math.max(0, deps.now().getTime() - startedAt),
        guard_outcome: guard,
        fallback_reason: fallback,
        not_a_reading: false,
        created_at: toIso(deps.now()),
      });
    } catch (recordError) {
      // The answer still reaches the device; the missing row is logged.
      logError('ai write run row not written', { ...fields, error: errorText(recordError) });
    }
    // Closed values only: never the field's text nor the model's.
    log('ai write', { ...fields, guard, writing_provider: deps.writing.name });
    return c.json(answer, 200);
  });

  return routes;
}
