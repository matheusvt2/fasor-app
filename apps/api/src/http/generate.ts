import { Readable } from 'node:stream';
import {
  DOCX_MIME,
  editedSince,
  fileRowSchema,
  generateRequestSchema,
  generationJobRowSchema,
  isJobActive,
  latestRevision,
  nextRevisionNumber,
  objectKey,
  relatorioRowSchema,
  revisionRowSchema,
  SERVER_DEVICE_ID,
  toIso,
  uuidV7Schema,
  type Clock,
  type ErrorCode,
  type ErrorResponse,
  type GenerateResponse,
  type GenerationJobRow,
  type NewId,
  type NotCaughtUpDetails,
  type Op,
  type RevisionRow,
} from '@app/domain';
import type { S3Client } from '@aws-sdk/client-s3';
import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Db } from '../db/client.ts';
import type { CompanyId } from '../db/repositories/company-id.ts';
import { entities, ops } from '../db/schema.ts';
import { GENERATE_ACTOR, type GeneratePayload } from '../jobs/generate/job.ts';
import { logError } from '../log.ts';
import { getObject } from '../storage/s3.ts';
import { applyOps, applyServerBatch, type Tx } from '../sync/apply.ts';
import { type AppEnv, requireSession } from './session.ts';

/*
 * AD-15: `POST /api/relatorios/:id/generate` is the flush barrier and the one place a
 * generate job is created; `GET /api/revisions/:id/docx` serves a revision's DOCX. Both
 * resolve the company from the session and scope every read by it (AD-10), so another
 * company's relatório or revision answers exactly as an unknown id.
 */

export interface GenerateRouteDeps {
  now: Clock;
  newId: NewId;
  /** Sends the job to the queue; `enqueueGenerate` in production, absent in unit tests. */
  enqueue?: (payload: GeneratePayload) => Promise<void>;
}

function fail(code: ErrorCode, message: string, details?: unknown): ErrorResponse {
  return details === undefined ? { code, message } : { code, message, details };
}

const notFound = fail('not_found', 'No such relatorio.');

/** Thrown inside the job-create transaction when a job of the relatório is already active: the route answers `running`. */
class AlreadyRunningError extends Error {
  readonly job: GenerationJobRow;
  constructor(job: GenerationJobRow) {
    super(`generate job ${job.id} is already ${job.status}`);
    this.name = 'AlreadyRunningError';
    this.job = job;
  }
}

/** A revision's DOCX filename: `relatorio-rev-{n}.docx`. */
export function docxFilename(number: number): string {
  return `relatorio-rev-${number}.docx`;
}

export function createGenerateRoutes(db: Db, s3: S3Client, bucket: string, deps: GenerateRouteDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  async function readRelatorio(companyId: CompanyId, id: string): Promise<{ project_id: string } | null> {
    if (!uuidV7Schema.safeParse(id).success) return null;
    const [record] = await db
      .select({ row: entities.row, removed_at: entities.removed_at })
      .from(entities)
      .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'relatorio'), eq(entities.id, id)))
      .limit(1);
    if (record === undefined || record.removed_at !== null) return null;
    const parsed = relatorioRowSchema.safeParse(record.row);
    return parsed.success ? { project_id: parsed.data.project_id } : null;
  }

  /** The relatório's job that still counts as running (`isJobActive`: queued/running and younger than the queue expiry), or null. */
  async function activeJob(reader: Pick<Db, 'select'>, companyId: CompanyId, relatorioId: string): Promise<GenerationJobRow | null> {
    const rows = await reader
      .select({ row: entities.row })
      .from(entities)
      .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'generation_job'), eq(entities.relatorio_id, relatorioId)));
    const nowIso = toIso(deps.now());
    for (const r of rows) {
      const parsed = generationJobRowSchema.safeParse(r.row);
      if (parsed.success && isJobActive(parsed.data, nowIso)) return parsed.data;
    }
    return null;
  }

  async function revisionsOf(companyId: CompanyId, relatorioId: string): Promise<RevisionRow[]> {
    const rows = await db
      .select({ row: entities.row })
      .from(entities)
      .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'revision'), eq(entities.relatorio_id, relatorioId), isNull(entities.removed_at)));
    return rows.flatMap((r) => {
      const parsed = revisionRowSchema.safeParse(r.row);
      return parsed.success ? [parsed.data] : [];
    });
  }

  /** The barrier: is the named op in the log, and is every named file stored? */
  async function missing(companyId: CompanyId, lastOpId: string | null, fileIds: readonly string[]): Promise<NotCaughtUpDetails> {
    let missingOp = false;
    if (lastOpId !== null) {
      const [found] = await db
        .select({ op_id: ops.op_id })
        .from(ops)
        .where(and(eq(ops.company_id, companyId), eq(ops.op_id, lastOpId)))
        .limit(1);
      missingOp = found === undefined;
    }
    const stored = new Set<string>();
    if (fileIds.length > 0) {
      const rows = await db
        .select({ id: entities.id, row: entities.row })
        .from(entities)
        .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'file'), inArray(entities.id, [...fileIds])));
      for (const record of rows) {
        const parsed = fileRowSchema.safeParse(record.row);
        if (parsed.success && parsed.data.uploaded_at !== null) stored.add(record.id);
      }
    }
    return { missing_op: missingOp, missing_files: fileIds.filter((id) => !stored.has(id)) };
  }

  /** AD-15: exists an op of the relatório's stream after the snapshot that counts as an edit. */
  async function editedAfter(companyId: CompanyId, relatorioId: string, projectId: string, snapshotSeq: number): Promise<boolean> {
    const rows = await db
      .select({ path: ops.path, actor_id: ops.actor_id, kind: ops.kind, value: ops.value, seq: ops.seq })
      .from(ops)
      .where(
        and(
          eq(ops.company_id, companyId),
          gt(ops.seq, snapshotSeq),
          or(eq(ops.relatorio_id, relatorioId), and(eq(ops.scope, 'project'), eq(ops.project_id, projectId))),
        ),
      );
    return editedSince(
      rows.map((r) => ({ path: r.path, actor_id: r.actor_id, kind: r.kind as Op['kind'], value: r.value, seq: r.seq })),
      snapshotSeq,
    );
  }

  function jobOp(companyId: CompanyId, relatorioId: string, input: { kind: Op['kind']; path: string; value: unknown }): Op {
    return {
      op_id: deps.newId(),
      kind: input.kind,
      scope: 'relatorio',
      company_id: companyId,
      project_id: null,
      relatorio_id: relatorioId,
      path: input.path,
      value: input.value as Op['value'],
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: GENERATE_ACTOR,
      device_id: SERVER_DEVICE_ID,
      client_ts: toIso(deps.now()),
    };
  }

  routes.post('/api/relatorios/:id/generate', async (c) => {
    const session = requireSession(c);
    const relatorioId = c.req.param('id');
    c.set('relatorioId', relatorioId);
    const relatorio = await readRelatorio(session.companyId, relatorioId);
    if (relatorio === null) return c.json(notFound, 404);

    const body: unknown = await c.req.json().catch(() => undefined);
    const parsed = generateRequestSchema.safeParse(body);
    if (!parsed.success) return c.json(fail('invalid_request', 'The body must be {last_op_id, file_ids_expected}.'), 400);

    const details = await missing(session.companyId, parsed.data.last_op_id, parsed.data.file_ids_expected);
    if (details.missing_op || details.missing_files.length > 0) {
      return c.json(fail('not_caught_up', 'The server has not applied every op or stored every file yet.', details), 409);
    }

    const revisions = await revisionsOf(session.companyId, relatorioId);
    const number = nextRevisionNumber(revisions);
    const running = (job: GenerationJobRow): GenerateResponse => ({ outcome: 'running', job_id: job.id, revision_number: number });

    const active = await activeJob(db, session.companyId, relatorioId);
    if (active !== null) return c.json(running(active), 200);

    const latest = latestRevision(revisions);
    if (latest !== null && !(await editedAfter(session.companyId, relatorioId, relatorio.project_id, latest.snapshot_seq))) {
      const answer: GenerateResponse = { outcome: 'unchanged', revision_id: latest.id, revision_number: latest.number };
      return c.json(answer, 200);
    }

    // The job row is created under the company lock, with the "already running" check
    // re-read inside that same transaction: two presses that interleave above cannot
    // queue two jobs.
    const jobId = deps.newId();
    const create = jobOp(session.companyId, relatorioId, {
      kind: 'create',
      path: `generation_job/${jobId}`,
      value: {
        id: jobId,
        relatorio_id: relatorioId,
        kind: 'issue',
        status: 'queued',
        error: null,
        result_file_id: null,
        result: null,
        created_at: toIso(deps.now()),
      },
    });
    try {
      await applyServerBatch(db, session.companyId, [create], {
        now: deps.now,
        before: async (tx: Tx) => {
          const other = await activeJob(tx, session.companyId, relatorioId);
          if (other !== null) throw new AlreadyRunningError(other);
        },
      });
    } catch (error) {
      if (error instanceof AlreadyRunningError) return c.json(running(error.job), 200);
      throw error;
    }

    const payload: GeneratePayload = { job_id: jobId, company_id: session.companyId, relatorio_id: relatorioId, actor_id: session.userId };
    try {
      if (deps.enqueue === undefined) throw new Error('no queue is configured for generate jobs');
      await deps.enqueue(payload);
    } catch (error) {
      logError('generate enqueue failed', { company_id: session.companyId, relatorio_id: relatorioId, job_id: jobId, error: String(error) });
      await applyOps(
        db,
        session.companyId,
        [
          jobOp(session.companyId, relatorioId, { kind: 'put', path: `generation_job/${jobId}/status`, value: 'failed' }),
          jobOp(session.companyId, relatorioId, { kind: 'put', path: `generation_job/${jobId}/error`, value: 'enqueue_failed' }),
        ],
        { now: deps.now, origin: 'server' },
      );
      throw error;
    }

    const answer: GenerateResponse = { outcome: 'queued', job_id: jobId, revision_number: number };
    return c.json(answer, 202);
  });

  routes.get('/api/revisions/:id/docx', async (c) => {
    const session = requireSession(c);
    const id = c.req.param('id');
    if (!uuidV7Schema.safeParse(id).success) return c.json(notFound, 404);
    const [record] = await db
      .select({ row: entities.row })
      .from(entities)
      .where(and(eq(entities.company_id, session.companyId), eq(entities.entity, 'revision'), eq(entities.id, id)))
      .limit(1);
    const revision = record === undefined ? null : revisionRowSchema.safeParse(record.row);
    if (revision === null || !revision.success || revision.data.id !== id) return c.json(notFound, 404);
    // The key is derived from the session's company and the id the revision names, never
    // read out of a row (`files.ts` follows the same rule).
    const stored = await getObject(s3, bucket, objectKey(session.companyId, 'docx', revision.data.docx_file_id));
    if (stored === null) return c.json(notFound, 404);
    return c.body(Readable.toWeb(stored.body) as ReadableStream, 200, {
      'content-type': DOCX_MIME,
      'content-disposition': `attachment; filename="${docxFilename(revision.data.number)}"`,
      'x-content-type-options': 'nosniff',
      ...(stored.contentLength === null ? {} : { 'content-length': String(stored.contentLength) }),
    });
  });

  return routes;
}
