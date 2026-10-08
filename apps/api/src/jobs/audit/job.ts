import { auditInput, layoutSpec, toIso, validateAuditFindings, type AuditFinding, type Clock, type NewId, type Op } from '@app/domain';
import type { Db } from '../../db/client.ts';
import { asCompanyId, type CompanyId } from '../../db/repositories/company-id.ts';
import { log, logError } from '../../log.ts';
import { applyOps, applyServerBatch } from '../../sync/apply.ts';
import { serverOp } from '../../sync/server-op.ts';
import { toSnapshot } from '../../sync/snapshot.ts';
import { AiFeaturesOffError, PermanentReadingError, ProviderError, ProviderRefusedError, ProviderTimeoutError } from '../../ai/errors.ts';
import { AUDIT_ACTOR, type AuditPayload } from './payload.ts';
import type { AuditProvider } from './provider.ts';

/*
 * Story 13.8 (AI-3): one audit run end to end. The run row exists (`queued`, created by the
 * route); the job puts it `running`, reads the relatório's snapshot as it is now, builds the
 * kernel's draft layout and the assembled text (`auditInput`: text and values only, capped),
 * makes ONE provider call, keeps the findings the kernel validates against the refs it sent,
 * and writes them in one server batch with `status: done`. A failure writes `status: failed`
 * and its error code; nothing is retried (one tap is at most one LLM call). The job writes
 * only `audit_run/{id}/*` ops: no sheet, block, relatório field, suggestion or count.
 *
 * Every run logs one `audit run` line: company, relatório, run id, model, prompt version,
 * input and output tokens, `usd` (0 on `fake`), the kept and dropped counts, the duration,
 * and on a failure its status and error class.
 */

/** Every value `audit_run/{id}/error` may carry; `enqueue_failed` is written by the route. */
// `provider_refused` (review 2026-10-08, API-V2): a denied or misconfigured call (IAM, model id, request shape), not a bad answer.
export const AUDIT_ERROR_CODES = ['ai_features_off', 'provider_timeout', 'provider_failed', 'provider_refused', 'invalid_output', 'audit_failed', 'enqueue_failed'] as const;
export type AuditErrorCode = (typeof AUDIT_ERROR_CODES)[number];

export interface AuditJobDeps {
  db: Db;
  now: Clock;
  newId: NewId;
  provider: AuditProvider;
}

type AuditField = 'status' | 'findings' | 'error' | 'prompt_version' | 'started_at' | 'finished_at';

/** One `audit_run/{id}/{field}` put of the run, as the server's op. */
export function auditRunPut(payload: Pick<AuditPayload, 'run_id' | 'company_id' | 'relatorio_id'>, now: string, newId: NewId, field: AuditField, value: unknown): Op {
  return serverOp({
    opId: newId(),
    companyId: payload.company_id,
    actorId: AUDIT_ACTOR,
    clientTs: now,
    kind: 'put',
    path: `audit_run/${payload.run_id}/${field}`,
    value,
    relatorioId: payload.relatorio_id,
  });
}

function errorCodeOf(error: unknown): AuditErrorCode {
  if (error instanceof AiFeaturesOffError) return 'ai_features_off';
  if (error instanceof ProviderTimeoutError) return 'provider_timeout';
  if (error instanceof ProviderRefusedError) return 'provider_refused';
  if (error instanceof PermanentReadingError) return 'invalid_output';
  if (error instanceof ProviderError) return 'provider_failed';
  return 'audit_failed';
}

/** Runs one audit; never throws (a failure is recorded on the run row and logged). */
export async function runAuditJob(deps: AuditJobDeps, payload: AuditPayload): Promise<'done' | 'failed'> {
  const companyId: CompanyId = asCompanyId(payload.company_id);
  const started = Date.now();
  const fields = { company_id: payload.company_id, relatorio_id: payload.relatorio_id, job_id: payload.run_id, audit_run_id: payload.run_id };
  const stamp = () => toIso(deps.now());
  const put = (field: AuditField, value: unknown, at: string) => auditRunPut(payload, at, deps.newId, field, value);
  const usage = { model: null as string | null, prompt_version: null as string | null, input_tokens: 0, output_tokens: 0, usd: 0 };
  try {
    const startedAt = stamp();
    const running = await applyOps(deps.db, companyId, [put('status', 'running', startedAt), put('started_at', startedAt, startedAt)], { now: deps.now, origin: 'server' });
    if (running.rejected.length > 0) throw new Error(`audit run ${payload.run_id}: running puts rejected (${running.rejected.map((r) => r.code).join(', ')})`);

    const snapshot = await toSnapshot(deps.db, companyId, payload.relatorio_id);
    // The draft layout, as the preview prints it: no revision number, RASCUNHO, the same text.
    const layout = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: startedAt, art: snapshot.relatorio.setup.art_trt_number, draft: true });
    const input = auditInput(layout, snapshot);
    const answer = await deps.provider.audit({ text: input.text, refs: input.refs });
    Object.assign(usage, { model: answer.model, prompt_version: answer.prompt_version, ...answer.usage });
    const { kept, dropped } = validateAuditFindings(answer.findings, input.refs);

    const finishedAt = stamp();
    await applyServerBatch(
      deps.db,
      companyId,
      [
        put('findings', kept satisfies AuditFinding[], finishedAt),
        put('prompt_version', answer.prompt_version, finishedAt),
        put('finished_at', finishedAt, finishedAt),
        put('status', 'done', finishedAt),
      ],
      { now: deps.now },
    );
    log('audit run', {
      ...fields,
      status: 'done',
      actor_id: payload.actor_id,
      model: answer.model,
      prompt_version: answer.prompt_version,
      input_tokens: answer.usage.input_tokens,
      output_tokens: answer.usage.output_tokens,
      usd: answer.usage.usd,
      findings: kept.length,
      dropped: dropped.length,
      dropped_reasons: dropped.map((entry) => entry.reason),
      input_chars: input.text.length,
      truncated: input.truncated,
      duration_ms: Date.now() - started,
    });
    return 'done';
  } catch (error) {
    const code = errorCodeOf(error);
    log('audit run', {
      ...fields,
      status: 'failed',
      actor_id: payload.actor_id,
      model: usage.model,
      prompt_version: usage.prompt_version,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      usd: usage.usd,
      findings: 0,
      dropped: 0,
      duration_ms: Date.now() - started,
      error: code,
      error_class: error instanceof Error ? error.name : typeof error,
      error_message: String(error).slice(0, 500),
    });
    try {
      const at = stamp();
      const result = await applyOps(deps.db, companyId, [put('status', 'failed', at), put('error', code, at), put('finished_at', at, at)], { now: deps.now, origin: 'server' });
      if (result.rejected.length > 0) logError('audit run could not record its failure', { ...fields, rejected: result.rejected });
    } catch (recordError) {
      logError('audit run could not record its failure', { ...fields, error: String(recordError) });
    }
    return 'failed';
  }
}
