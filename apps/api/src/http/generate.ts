import { Readable } from 'node:stream';
import {
  blockingRows,
  blockRowSchema,
  fileRowSchema,
  generateRequestSchema,
  generationJobRowSchema,
  isJobActive,
  latestRevision,
  nextRevisionNumber,
  objectKey,
  PDF_MIME,
  preIssue,
  previewFileName,
  referencedEquipmentIds,
  relatorioEditedSince,
  relatorioRowSchema,
  revisionFileMime,
  revisionFileName,
  revisionRowSchema,
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
  type PreIssueBlockedDetails,
  type PreviewResponse,
  type RevisionFileFormat,
  type RevisionRow,
} from '@app/domain';
import type { S3Client } from '@aws-sdk/client-s3';
import { and, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import type { Db } from '../db/client.ts';
import type { CompanyId } from '../db/repositories/company-id.ts';
import { liveRevisions } from '../db/repositories/revisions.ts';
import { entities, ops } from '../db/schema.ts';
import { GENERATE_ACTOR, type GenerateKind, type GeneratePayload } from '../jobs/generate/job.ts';
import { logError } from '../log.ts';
import { getObject } from '../storage/s3.ts';
import { applyOps, applyServerBatch, type Tx } from '../sync/apply.ts';
import { serverOp } from '../sync/server-op.ts';
import { toSnapshot } from '../sync/snapshot.ts';
import { type AppEnv, requireSession, type SessionContext } from './session.ts';

/*
 * AD-15: `POST /api/relatorios/:id/generate` is the flush barrier and the one place an
 * issue job is created; `GET /api/revisions/:id/docx` serves a revision's DOCX. Story 7.5:
 * the issue route refuses while `preIssue` holds a blocking row ("Parecer não preenchido",
 * `409 pre_issue_blocked`); `POST /api/relatorios/:id/preview` creates the same job with
 * `kind: preview` behind the same barrier, and `GET /api/relatorios/:id/preview.pdf` serves
 * the relatório's latest preview. All resolve the company from the session and scope every
 * read by it (AD-10), so another company's relatório or revision answers exactly as an
 * unknown id.
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

/** Thrown inside the issue-job transaction when nothing was edited since the latest revision: the route answers `unchanged`. */
class UnchangedError extends Error {
  readonly revision: RevisionRow;
  constructor(revision: RevisionRow) {
    super(`nothing was edited since revision ${revision.number}`);
    this.name = 'UnchangedError';
    this.revision = revision;
  }
}

/** What `createJob` decided under the company lock. */
type CreateOutcome =
  | { outcome: 'queued'; jobId: string; revisionNumber: number }
  | { outcome: 'running'; job: GenerationJobRow; revisionNumber: number }
  | { outcome: 'unchanged'; revision: RevisionRow };

export function createGenerateRoutes(db: Db, s3: S3Client, bucket: string, deps: GenerateRouteDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  async function readRelatorio(companyId: CompanyId, id: string): Promise<{ project_id: string; preview_file_id: string | null } | null> {
    if (!uuidV7Schema.safeParse(id).success) return null;
    const [record] = await db
      .select({ row: entities.row, removed_at: entities.removed_at })
      .from(entities)
      .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'relatorio'), eq(entities.id, id)))
      .limit(1);
    if (record === undefined || record.removed_at !== null) return null;
    const parsed = relatorioRowSchema.safeParse(record.row);
    return parsed.success ? { project_id: parsed.data.project_id, preview_file_id: parsed.data.preview_file_id } : null;
  }

  /**
   * The relatório's job of `kind` that still counts as running (`isJobActive`), or null. A
   * preview never holds an issue back, nor an issue a preview (Story 7.5). Only the queued
   * and running rows of that kind are read (A-9: job rows are never removed, so reading
   * every one of them grew with every press); the age rule stays the kernel's.
   */
  async function activeJob(reader: Pick<Db, 'select'>, companyId: CompanyId, relatorioId: string, kind: GenerateKind): Promise<GenerationJobRow | null> {
    const rows = await reader
      .select({ row: entities.row })
      .from(entities)
      .where(
        and(
          eq(entities.company_id, companyId),
          eq(entities.entity, 'generation_job'),
          eq(entities.relatorio_id, relatorioId),
          sql`${entities.row}->>'kind' = ${kind}`,
          sql`${entities.row}->>'status' in ('queued', 'running')`,
        ),
      );
    const nowIso = toIso(deps.now());
    for (const r of rows) {
      const parsed = generationJobRowSchema.safeParse(r.row);
      if (parsed.success && parsed.data.kind === kind && isJobActive(parsed.data, nowIso)) return parsed.data;
    }
    return null;
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

  /**
   * AD-15: exists an op of the relatório's stream after the snapshot that counts as an edit.
   * The stream is the relatório's own ops plus the project-scope ops of the equipment its
   * live blocks reference (Epic 4 retro items 18, Q15): the kernel decides both.
   */
  async function editedAfter(reader: Pick<Db, 'select'>, companyId: CompanyId, relatorioId: string, projectId: string, snapshotSeq: number): Promise<boolean> {
    const blockRows = await reader
      .select({ row: entities.row })
      .from(entities)
      .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'block'), eq(entities.relatorio_id, relatorioId), isNull(entities.removed_at)));
    const rows = await reader
      .select({ path: ops.path, actor_id: ops.actor_id, kind: ops.kind, value: ops.value, seq: ops.seq, scope: ops.scope, relatorio_id: ops.relatorio_id })
      .from(ops)
      .where(
        and(
          eq(ops.company_id, companyId),
          gt(ops.seq, snapshotSeq),
          or(eq(ops.relatorio_id, relatorioId), and(eq(ops.scope, 'project'), eq(ops.project_id, projectId))),
        ),
      );
    const blocks = blockRows.flatMap((r) => {
      const parsed = blockRowSchema.safeParse(r.row);
      return parsed.success ? [parsed.data] : [];
    });
    return relatorioEditedSince(
      rows.map((r) => ({
        path: r.path,
        actor_id: r.actor_id,
        kind: r.kind as Op['kind'],
        value: r.value,
        seq: r.seq,
        scope: r.scope as Op['scope'],
        relatorio_id: r.relatorio_id,
      })),
      snapshotSeq,
      { relatorioId, equipmentIds: referencedEquipmentIds(blocks) },
    );
  }

  function jobOp(companyId: CompanyId, relatorioId: string, input: { kind: Op['kind']; path: string; value: unknown }): Op {
    return serverOp({
      opId: deps.newId(),
      companyId,
      actorId: GENERATE_ACTOR,
      clientTs: toIso(deps.now()),
      kind: input.kind,
      path: input.path,
      value: input.value,
      relatorioId,
    });
  }

  /**
   * Creates one job of `kind` under the company lock, then sends it to the queue; an enqueue
   * failure marks the job `failed` and rethrows. Every decision is read inside the lock the
   * create takes (Design Notes, review 2026-09-30): (1) a job of that kind still active
   * answers `running` (two presses that interleave cannot queue two jobs); (2) for an issue,
   * a latest revision nothing was edited after answers `unchanged` (A-12: read before the
   * lock, a job committing revision N in between left a stale answer and queued an identical
   * N+1); (3) otherwise the job is created.
   */
  async function createJob(companyId: CompanyId, relatorioId: string, projectId: string, actorId: string, kind: GenerateKind): Promise<CreateOutcome> {
    const jobId = deps.newId();
    const create = jobOp(companyId, relatorioId, {
      kind: 'create',
      path: `generation_job/${jobId}`,
      value: {
        id: jobId,
        relatorio_id: relatorioId,
        kind,
        status: 'queued',
        error: null,
        result_file_id: null,
        result: null,
        created_at: toIso(deps.now()),
        started_at: null,
      },
    });
    let revisionNumber = 1;
    try {
      await applyServerBatch(db, companyId, [create], {
        now: deps.now,
        before: async (tx: Tx) => {
          const revisions = kind === 'issue' ? await liveRevisions(tx, companyId, relatorioId) : [];
          revisionNumber = nextRevisionNumber(revisions);
          const other = await activeJob(tx, companyId, relatorioId, kind);
          if (other !== null) throw new AlreadyRunningError(other);
          const latest = latestRevision(revisions);
          if (latest !== null && !(await editedAfter(tx, companyId, relatorioId, projectId, latest.snapshot_seq))) throw new UnchangedError(latest);
        },
      });
    } catch (error) {
      if (error instanceof AlreadyRunningError) return { outcome: 'running', job: error.job, revisionNumber };
      if (error instanceof UnchangedError) return { outcome: 'unchanged', revision: error.revision };
      throw error;
    }

    const payload: GeneratePayload = { job_id: jobId, company_id: companyId, relatorio_id: relatorioId, actor_id: actorId, kind };
    try {
      if (deps.enqueue === undefined) throw new Error('no queue is configured for generate jobs');
      await deps.enqueue(payload);
    } catch (error) {
      logError('generate enqueue failed', { company_id: companyId, relatorio_id: relatorioId, job_id: jobId, kind, error: String(error) });
      await applyOps(
        db,
        companyId,
        [
          jobOp(companyId, relatorioId, { kind: 'put', path: `generation_job/${jobId}/status`, value: 'failed' }),
          jobOp(companyId, relatorioId, { kind: 'put', path: `generation_job/${jobId}/error`, value: 'enqueue_failed' }),
        ],
        { now: deps.now, origin: 'server' },
      );
      throw error;
    }
    return { outcome: 'queued', jobId, revisionNumber };
  }

  /**
   * The preamble both job routes share (A-28): the session, a live relatório of its company
   * (404 otherwise), the `{last_op_id, file_ids_expected}` body (400) and the flush barrier
   * (409 `not_caught_up`). Answers the response to send, or what the route goes on with.
   */
  async function caughtUpRequest(
    c: Context<AppEnv>,
  ): Promise<{ response: Response } | { session: SessionContext; relatorioId: string; relatorio: { project_id: string } }> {
    const session = requireSession(c);
    const relatorioId = c.req.param('id') ?? '';
    c.set('relatorioId', relatorioId);
    const relatorio = await readRelatorio(session.companyId, relatorioId);
    if (relatorio === null) return { response: c.json(notFound, 404) };

    const body: unknown = await c.req.json().catch(() => undefined);
    const parsed = generateRequestSchema.safeParse(body);
    if (!parsed.success) return { response: c.json(fail('invalid_request', 'The body must be {last_op_id, file_ids_expected}.'), 400) };

    const details = await missing(session.companyId, parsed.data.last_op_id, parsed.data.file_ids_expected);
    if (details.missing_op || details.missing_files.length > 0) {
      return { response: c.json(fail('not_caught_up', 'The server has not applied every op or stored every file yet.', details), 409) };
    }
    return { session, relatorioId, relatorio };
  }

  /** `GET /api/revisions/:id/docx` and `/pdf` (A-28): the revision's stored file, as a download. */
  function serveRevisionFile(format: RevisionFileFormat) {
    return async (c: Context<AppEnv>) => {
      const session = requireSession(c);
      const id = c.req.param('id') ?? '';
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
      const fileId = format === 'docx' ? revision.data.docx_file_id : revision.data.pdf_file_id;
      const stored = await getObject(s3, bucket, objectKey(session.companyId, format, fileId));
      if (stored === null) return c.json(notFound, 404);
      return c.body(Readable.toWeb(stored.body) as ReadableStream, 200, {
        'content-type': revisionFileMime(format),
        'content-disposition': `attachment; filename="${revisionFileName(revision.data.number, format)}"`,
        'x-content-type-options': 'nosniff',
        ...(stored.contentLength === null ? {} : { 'content-length': String(stored.contentLength) }),
      });
    };
  }

  routes.post('/api/relatorios/:id/generate', async (c) => {
    const request = await caughtUpRequest(c);
    if ('response' in request) return request.response;
    const { session, relatorioId, relatorio } = request;

    // Story 7.5: the one blocking pre-issue row stops the issue here too, never only in the
    // dialog; the rule is the kernel's, over the snapshot the server holds. A check, not the
    // job's frozen input: read without a transaction or a head scan (A-11).
    const snapshot = await toSnapshot(db, session.companyId, relatorioId);
    const blocking = blockingRows(preIssue(snapshot, undefined, { now: deps.now() }));
    if (blocking.length > 0) {
      const blocked: PreIssueBlockedDetails = { rows: blocking.map((row) => row.kind) };
      return c.json(fail('pre_issue_blocked', 'A blocking pre-issue row stands; the revision cannot be issued.', blocked), 409);
    }

    // A-9, A-12: "already running", "unchanged" and the create are all decided under the
    // company lock the create takes; nothing is read for them on the pool first.
    const created = await createJob(session.companyId, relatorioId, relatorio.project_id, session.userId, 'issue');
    if (created.outcome === 'unchanged') {
      const answer: GenerateResponse = { outcome: 'unchanged', revision_id: created.revision.id, revision_number: created.revision.number };
      return c.json(answer, 200);
    }
    if (created.outcome === 'running') {
      const answer: GenerateResponse = { outcome: 'running', job_id: created.job.id, revision_number: created.revisionNumber };
      return c.json(answer, 200);
    }
    const answer: GenerateResponse = { outcome: 'queued', job_id: created.jobId, revision_number: created.revisionNumber };
    return c.json(answer, 202);
  });

  routes.post('/api/relatorios/:id/preview', async (c) => {
    const request = await caughtUpRequest(c);
    if ('response' in request) return request.response;
    const { session, relatorioId, relatorio } = request;

    const created = await createJob(session.companyId, relatorioId, relatorio.project_id, session.userId, 'preview');
    if (created.outcome === 'running') return c.json({ outcome: 'running', job_id: created.job.id } satisfies PreviewResponse, 200);
    if (created.outcome === 'unchanged') throw new Error('a preview job is never answered unchanged');
    return c.json({ outcome: 'queued', job_id: created.jobId } satisfies PreviewResponse, 202);
  });

  routes.get('/api/relatorios/:id/preview.pdf', async (c) => {
    const session = requireSession(c);
    const relatorio = await readRelatorio(session.companyId, c.req.param('id'));
    if (relatorio === null || relatorio.preview_file_id === null) return c.json(notFound, 404);
    // The key is derived from the session's company and the id the relatório names.
    const stored = await getObject(s3, bucket, objectKey(session.companyId, 'preview', relatorio.preview_file_id));
    if (stored === null) return c.json(notFound, 404);
    return c.body(Readable.toWeb(stored.body) as ReadableStream, 200, {
      'content-type': PDF_MIME,
      'content-disposition': `inline; filename="${previewFileName()}"`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...(stored.contentLength === null ? {} : { 'content-length': String(stored.contentLength) }),
    });
  });

  routes.get('/api/revisions/:id/docx', serveRevisionFile('docx'));
  // Story 11.1: the revision's closed PDF, the DOCX route's twin. The job stores it under
  // `objectKey(companyId, 'pdf', pdf_file_id)` beside the DOCX; the route serves it as is.
  routes.get('/api/revisions/:id/pdf', serveRevisionFile('pdf'));

  return routes;
}
