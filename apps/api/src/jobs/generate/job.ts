import { createHash } from 'node:crypto';
import {
  DOCX_MIME,
  fileRowSchema,
  layoutSpec,
  nextRevisionNumber,
  objectKey,
  PDF_MIME,
  revisionRowSchema,
  SERVER_DEVICE_ID,
  toIso,
  type Clock,
  type DocumentLayout,
  type FileRow,
  type GenerationResult,
  type NewId,
  type Op,
  type RelatorioSnapshot,
  type RevisionRow,
} from '@app/domain';
import type { S3Client } from '@aws-sdk/client-s3';
import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client.ts';
import { asCompanyId, type CompanyId } from '../../db/repositories/company-id.ts';
import { entities } from '../../db/schema.ts';
import { log, logError } from '../../log.ts';
import { getObject, putObject } from '../../storage/s3.ts';
import { applyOps, applyServerBatch, lockCompany, type Tx } from '../../sync/apply.ts';
import { freezeSnapshot } from '../../sync/snapshot.ts';
import { buildDocx, type DocxImages } from './docx.ts';
import { convertToPdf, DEFAULT_CONVERT_TIMEOUT_MS, LibreOfficeTimeoutError, type GenerateFault } from './libreoffice.ts';
import { readOutline } from './pdf-outline.ts';
import { headingPages, missingHeadings, placeholderPages, tocConverged, type TocPages } from './toc.ts';

/*
 * AD-15: the one renderer. The job freezes the snapshot under the company lock, renders
 * the kernel's layout with the `docx` library, converts its own DOCX with LibreOffice in
 * two (at most three) passes so the printed TOC pages equal the PDF outline, stores both
 * files, and only then applies ONE server batch: the two `file` creates, the `revision`
 * create with the number allocated in that same transaction, and the job's `status` and
 * `result`. A throw anywhere leaves only `status: failed` and `error` behind: no revision
 * number is consumed and no `file` row exists (objects already written to S3 are orphans
 * under immutable, never referenced keys).
 */

export const GENERATE_ACTOR = 'system:generate';

/** Every value `generation_job/{id}/error` may carry; `enqueue_failed` is written by the route. */
export const GENERATE_ERROR_CODES = ['libreoffice_timeout', 'toc_outline_missing', 'render_failed', 'enqueue_failed'] as const;
export type GenerateErrorCode = (typeof GENERATE_ERROR_CODES)[number];

export interface GeneratePayload {
  job_id: string;
  company_id: string;
  relatorio_id: string;
  /** The user who pressed "Gerar relatório": the revision's `created_by`. */
  actor_id: string;
}

export interface GenerateJobDeps {
  db: Db;
  s3: S3Client;
  bucket: string;
  now: Clock;
  newId: NewId;
  fault?: GenerateFault | undefined;
  timeoutMs?: number;
}

/** The PDF outline lacks a section heading, so the TOC cannot be written (never silently `00`). */
export class TocOutlineMissingError extends Error {
  constructor(sections: number[]) {
    super(`PDF outline has no heading for section(s) ${sections.join(', ')}`);
    this.name = 'TocOutlineMissingError';
  }
}

/** Another job allocated the number this one rendered; refused rather than printed wrong. */
export class RevisionNumberConflictError extends Error {
  constructor(expected: number, actual: number) {
    super(`revision number ${expected} was rendered but ${actual} is next`);
    this.name = 'RevisionNumberConflictError';
  }
}

export interface RenderedDocument {
  docx: Buffer;
  pdf: Buffer;
  pages: number;
  tocPasses: number;
  tocConverged: boolean;
}

export interface RenderOptions {
  jobId: string;
  timeoutMs?: number;
  fault?: GenerateFault | undefined;
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function serverOp(
  payload: GeneratePayload,
  now: string,
  newId: NewId,
  input: { kind: Op['kind']; scope: Op['scope']; path: string; value: unknown },
): Op {
  return {
    op_id: newId(),
    kind: input.kind,
    scope: input.scope,
    company_id: payload.company_id,
    project_id: null,
    relatorio_id: payload.relatorio_id,
    path: input.path,
    value: input.value as Op['value'],
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: GENERATE_ACTOR,
    device_id: SERVER_DEVICE_ID,
    client_ts: now,
  };
}

function jobPut(payload: GeneratePayload, now: string, newId: NewId, field: 'status' | 'error' | 'result', value: unknown): Op {
  return serverOp(payload, now, newId, { kind: 'put', scope: 'relatorio', path: `generation_job/${payload.job_id}/${field}`, value });
}

/** The live revision rows of the relatório, read through `reader` (the pool or a transaction). */
async function liveRevisions(reader: Pick<Db, 'select'>, companyId: CompanyId, relatorioId: string): Promise<RevisionRow[]> {
  const rows = await reader
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'revision'), eq(entities.relatorio_id, relatorioId), isNull(entities.removed_at)));
  return rows.flatMap((r) => {
    const parsed = revisionRowSchema.safeParse(r.row);
    return parsed.success ? [parsed.data] : [];
  });
}

/** A company-scope or relatório-scope `file` row by id, parsed, or null. */
async function fileRow(db: Db, companyId: CompanyId, id: string): Promise<FileRow | null> {
  const [record] = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'file'), eq(entities.id, id)))
    .limit(1);
  const parsed = record === undefined ? null : fileRowSchema.safeParse(record.row);
  return parsed !== null && parsed.success ? parsed.data : null;
}

async function readAll(body: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

/** The `print` variant bytes of a file whose row says the variants were rendered; null otherwise. */
async function printVariant(deps: GenerateJobDeps, companyId: CompanyId, fileId: string | null): Promise<Buffer | undefined> {
  if (fileId === null) return undefined;
  const row = await fileRow(deps.db, companyId, fileId);
  if (row === null || row.uploaded_at === null || row.variants === null) return undefined;
  const stored = await getObject(deps.s3, deps.bucket, objectKey(companyId, row.kind, fileId, 'print'));
  return stored === null ? undefined : readAll(stored.body);
}

/**
 * AD-15's pass loop: pass 1 with placeholders, pass 2 with the outline's pages, a third
 * pass only when pass-2 moved a heading. Returns the last pass's DOCX and PDF.
 */
export async function renderDocument(layout: DocumentLayout, images: DocxImages, options: RenderOptions): Promise<RenderedDocument> {
  const convert = (docx: Buffer) => convertToPdf(docx, { jobId: options.jobId, timeoutMs: options.timeoutMs ?? DEFAULT_CONVERT_TIMEOUT_MS, fault: options.fault });
  const pass = async (tocPages: TocPages) => {
    const docx = await buildDocx(layout, { tocPages, images });
    const pdf = await convert(docx);
    const outline = await readOutline(pdf);
    const pages = headingPages(outline, layout);
    const missing = missingHeadings(pages);
    if (missing.length > 0) throw new TocOutlineMissingError(missing);
    return { docx, pdf, pageCount: outline.pages, pages };
  };
  const first = await pass(placeholderPages(layout));
  const second = await pass(first.pages);
  if (tocConverged(second.pages, first.pages)) {
    return { docx: second.docx, pdf: second.pdf, pages: second.pageCount, tocPasses: 2, tocConverged: true };
  }
  const third = await pass(second.pages);
  return { docx: third.docx, pdf: third.pdf, pages: third.pageCount, tocPasses: 3, tocConverged: tocConverged(third.pages, second.pages) };
}

function errorCodeOf(error: unknown): GenerateErrorCode {
  if (error instanceof LibreOfficeTimeoutError) return 'libreoffice_timeout';
  if (error instanceof TocOutlineMissingError) return 'toc_outline_missing';
  return 'render_failed';
}

/** Runs one generate job end to end; never throws (a failure is recorded on the job row and logged). */
export async function runGenerateJob(deps: GenerateJobDeps, payload: GeneratePayload): Promise<'done' | 'failed'> {
  const companyId = asCompanyId(payload.company_id);
  const started = Date.now();
  const fields = { company_id: payload.company_id, relatorio_id: payload.relatorio_id, job_id: payload.job_id };
  const stamp = () => toIso(deps.now());
  /** The job's own status/error puts, applied one by one; a rejection is logged, never silent. */
  const putJobFields = async (ops: Op[]) => {
    const result = await applyOps(deps.db, companyId, ops, { now: deps.now, origin: 'server' });
    if (result.rejected.length > 0) logError('generate job field op rejected', { ...fields, rejected: result.rejected });
  };
  try {
    await putJobFields([jobPut(payload, stamp(), deps.newId, 'status', 'running')]);

    const frozen = await deps.db.transaction(async (tx: Tx) => {
      await lockCompany(tx, companyId);
      const { snapshot, snapshotSeq } = await freezeSnapshot(tx, companyId, payload.relatorio_id);
      const number = nextRevisionNumber(await liveRevisions(tx, companyId, payload.relatorio_id));
      return { snapshot, snapshotSeq, number };
    });
    const issuedAt = stamp();
    const layout = layoutSpec(frozen.snapshot, { revisionNumber: frozen.number, issuedAt, art: frozen.snapshot.relatorio.setup.art_trt_number });
    const images: DocxImages = {};
    const logo = await printVariant(deps, companyId, frozen.snapshot.empresa?.logo_file_id ?? null);
    if (logo !== undefined) images.logo = logo;
    const cover = await printVariant(deps, companyId, frozen.snapshot.relatorio.setup.cover_photo_file_id);
    if (cover !== undefined) images.cover = cover;

    const rendered = await renderDocument(layout, images, { jobId: payload.job_id, timeoutMs: deps.timeoutMs, fault: deps.fault });

    const docxId = deps.newId();
    const pdfId = deps.newId();
    await putObject(deps.s3, deps.bucket, objectKey(companyId, 'docx', docxId), rendered.docx, DOCX_MIME);
    await putObject(deps.s3, deps.bucket, objectKey(companyId, 'pdf', pdfId), rendered.pdf, PDF_MIME);

    const durationMs = Date.now() - started;
    const result: GenerationResult = { toc_passes: rendered.tocPasses, toc_converged: rendered.tocConverged, pages: rendered.pages, duration_ms: durationMs };
    await commitRevision(deps, payload, companyId, frozen, { docxId, pdfId, docx: rendered.docx, pdf: rendered.pdf, result });

    log('generate done', { ...fields, duration_ms: durationMs, toc_passes: rendered.tocPasses, toc_converged: rendered.tocConverged, pages: rendered.pages, revision_number: frozen.number });
    return 'done';
  } catch (error) {
    const code = errorCodeOf(error);
    logError('generate failed', { ...fields, error: code, detail: String(error), duration_ms: Date.now() - started });
    await putJobFields([jobPut(payload, stamp(), deps.newId, 'status', 'failed'), jobPut(payload, stamp(), deps.newId, 'error', code)]).catch(
      (applyError: unknown) => logError('generate failure could not be recorded', { ...fields, error: String(applyError) }),
    );
    return 'failed';
  }
}

interface Outputs {
  docxId: string;
  pdfId: string;
  docx: Buffer;
  pdf: Buffer;
  result: GenerationResult;
}

/** The one transaction: files, revision (number re-checked under the lock), status done, result. */
async function commitRevision(
  deps: GenerateJobDeps,
  payload: GeneratePayload,
  companyId: CompanyId,
  frozen: { snapshot: RelatorioSnapshot; snapshotSeq: number; number: number },
  outputs: Outputs,
): Promise<void> {
  const now = toIso(deps.now());
  const fileCreate = (id: string, kind: 'docx' | 'pdf', bytes: Buffer, mime: string): Op =>
    serverOp(payload, now, deps.newId, {
      kind: 'create',
      scope: 'relatorio',
      path: `file/${id}`,
      value: {
        id,
        company_id: payload.company_id,
        relatorio_id: payload.relatorio_id,
        kind,
        sha256: sha256(bytes),
        mime,
        size: bytes.byteLength,
        uploaded_at: now,
        variants: null,
        removed_at: null,
      },
    });
  const revisionId = deps.newId();
  const revision: RevisionRow = {
    id: revisionId,
    relatorio_id: payload.relatorio_id,
    number: frozen.number,
    snapshot_seq: frozen.snapshotSeq,
    created_by: payload.actor_id,
    docx_file_id: outputs.docxId,
    pdf_file_id: outputs.pdfId,
    created_at: now,
  };
  const batch: Op[] = [
    fileCreate(outputs.docxId, 'docx', outputs.docx, DOCX_MIME),
    fileCreate(outputs.pdfId, 'pdf', outputs.pdf, PDF_MIME),
    serverOp(payload, now, deps.newId, { kind: 'create', scope: 'relatorio', path: `revision/${revisionId}`, value: revision }),
    jobPut(payload, now, deps.newId, 'status', 'done'),
    jobPut(payload, now, deps.newId, 'result', outputs.result),
  ];
  // The number was rendered into the document. It is re-checked inside the transaction
  // that writes the revision (the `before` hook runs under the same lock as the writes),
  // so two workers can never commit one number; a mismatch refuses the batch rather
  // than printing a wrong document (the queue's concurrency of 1 and the route's
  // "running" answer make this a safeguard, not a path).
  await applyServerBatch(deps.db, companyId, batch, {
    now: deps.now,
    before: async (tx: Tx) => {
      const next = nextRevisionNumber(await liveRevisions(tx, companyId, payload.relatorio_id));
      if (next !== frozen.number) throw new RevisionNumberConflictError(frozen.number, next);
    },
  });
}
