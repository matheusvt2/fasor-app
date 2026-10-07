import {
  AUDIT_ROUTE_PATH,
  auditRequestSchema,
  auditRunActive,
  auditRunRowSchema,
  toIso,
  type AuditResponse,
  type AuditRunningDetails,
  type AuditRunRow,
  type Clock,
  type ErrorCode,
  type ErrorResponse,
  type NewId,
} from '@app/domain';
import { and, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Db } from '../db/client.ts';
import type { CompanyId } from '../db/repositories/company-id.ts';
import { entities } from '../db/schema.ts';
import { auditRunPut } from '../jobs/audit/job.ts';
import { AUDIT_ACTOR, type AuditPayload } from '../jobs/audit/payload.ts';
import { logError } from '../log.ts';
import { applyOps, applyServerBatch, type Tx } from '../sync/apply.ts';
import { serverOp } from '../sync/server-op.ts';
import { barrierMissing, readLiveRelatorio } from './barrier.ts';
import { type AppEnv, requireSession } from './session.ts';

/*
 * Story 13.8 (AI-3): `POST /api/relatorios/:id/audit`, "Conferir antes de emitir". The order
 * of the answers: an unknown (or another company's) relatório `404 not_found`; the server's
 * AI features off `409 ai_features_off` (no run, no job); a body that is not the barrier's
 * `400 invalid_request`; the preview's flush barrier `409 not_caught_up`; a run of the
 * relatório still active (`auditRunActive`, decided under the company lock the create takes)
 * `409 audit_running` with its id and nothing sent; otherwise one `audit_run` create
 * (`queued`), one job on the `audit` queue and `202 {audit_run_id}`. An enqueue failure marks
 * the run `failed` (`enqueue_failed`) and answers 500.
 */

export interface AuditRouteDeps {
  now: Clock;
  newId: NewId;
  /** Sends the job; `enqueueAudit` in production, absent in unit tests (the route then fails its enqueue). */
  enqueue?: (payload: AuditPayload) => Promise<void>;
  /** `false` when `AI_FEATURES=off`; the route then answers `409 ai_features_off`. Absent reads as on. */
  aiFeatures?: boolean;
}

function fail(code: ErrorCode, message: string, details?: unknown): ErrorResponse {
  return details === undefined ? { code, message } : { code, message, details };
}

/** Thrown inside the run-create transaction when a run of the relatório is still active. */
class AuditRunningError extends Error {
  readonly run: AuditRunRow;
  constructor(run: AuditRunRow) {
    super(`audit run ${run.id} is still ${run.status}`);
    this.name = 'AuditRunningError';
    this.run = run;
  }
}

export function createAuditRoutes(db: Db, deps: AuditRouteDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  /** The relatório's run that still counts as running, or null; only its queued and running rows are read. */
  async function activeRun(reader: Pick<Db, 'select'>, companyId: CompanyId, relatorioId: string): Promise<AuditRunRow | null> {
    const rows = await reader
      .select({ row: entities.row })
      .from(entities)
      .where(
        and(
          eq(entities.company_id, companyId),
          eq(entities.entity, 'audit_run'),
          eq(entities.relatorio_id, relatorioId),
          sql`${entities.row}->>'status' in ('queued', 'running')`,
        ),
      );
    const nowIso = toIso(deps.now());
    for (const record of rows) {
      const parsed = auditRunRowSchema.safeParse(record.row);
      if (parsed.success && auditRunActive(parsed.data, nowIso)) return parsed.data;
    }
    return null;
  }

  routes.post(AUDIT_ROUTE_PATH, async (c) => {
    const session = requireSession(c);
    const relatorioId = c.req.param('id') ?? '';
    c.set('relatorioId', relatorioId);
    const relatorio = await readLiveRelatorio(db, session.companyId, relatorioId);
    if (relatorio === null) return c.json(fail('not_found', 'No such relatorio.'), 404);
    if (deps.aiFeatures === false) return c.json(fail('ai_features_off', 'AI features are off on this server.'), 409);

    const body: unknown = await c.req.json().catch(() => undefined);
    const parsed = auditRequestSchema.safeParse(body);
    if (!parsed.success) return c.json(fail('invalid_request', 'The body must be {last_op_id, file_ids_expected}.'), 400);
    const details = await barrierMissing(db, session.companyId, parsed.data.last_op_id, parsed.data.file_ids_expected);
    if (details.missing_op || details.missing_files.length > 0) {
      return c.json(fail('not_caught_up', 'The server has not applied every op or stored every file yet.', details), 409);
    }

    const runId = deps.newId();
    const createdAt = toIso(deps.now());
    const create = serverOp({
      opId: deps.newId(),
      companyId: session.companyId,
      actorId: AUDIT_ACTOR,
      clientTs: createdAt,
      kind: 'create',
      path: `audit_run/${runId}`,
      value: { id: runId, relatorio_id: relatorioId, status: 'queued', findings: [], error: null, prompt_version: null, created_at: createdAt, started_at: null, finished_at: null },
      relatorioId,
    });
    try {
      // Two taps that interleave cannot create two runs: the check runs under the lock the create takes.
      await applyServerBatch(db, session.companyId, [create], {
        now: deps.now,
        before: async (tx: Tx) => {
          const other = await activeRun(tx, session.companyId, relatorioId);
          if (other !== null) throw new AuditRunningError(other);
        },
      });
    } catch (error) {
      if (error instanceof AuditRunningError) {
        const running: AuditRunningDetails = { audit_run_id: error.run.id };
        return c.json(fail('audit_running', 'An audit of this relatorio is still running.', running), 409);
      }
      throw error;
    }

    const payload: AuditPayload = { run_id: runId, company_id: session.companyId, relatorio_id: relatorioId, actor_id: session.userId };
    try {
      if (deps.enqueue === undefined) throw new Error('no queue is configured for audit jobs');
      await deps.enqueue(payload);
    } catch (error) {
      const fields = { company_id: session.companyId, relatorio_id: relatorioId, job_id: runId };
      logError('audit enqueue failed', { ...fields, error: String(error) });
      // The run must not stay `queued` (it would hold every tap for the queue's retention); a
      // failure to record that is logged, and the enqueue error is the one the route answers.
      try {
        const at = toIso(deps.now());
        const result = await applyOps(
          db,
          session.companyId,
          [auditRunPut(payload, at, deps.newId, 'status', 'failed'), auditRunPut(payload, at, deps.newId, 'error', 'enqueue_failed'), auditRunPut(payload, at, deps.newId, 'finished_at', at)],
          { now: deps.now, origin: 'server' },
        );
        if (result.rejected.length > 0) logError('audit enqueue failure could not fail its run row', { ...fields, rejected: result.rejected });
      } catch (recordError) {
        logError('audit enqueue failure could not fail its run row', { ...fields, error: String(recordError) });
      }
      throw error;
    }
    return c.json({ audit_run_id: runId } satisfies AuditResponse, 202);
  });

  return routes;
}
