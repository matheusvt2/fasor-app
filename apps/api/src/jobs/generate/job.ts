import { createHash } from 'node:crypto';
import { buffer } from 'node:stream/consumers';
import {
  confirmedCellsLaterEdited,
  DOCX_MIME,
  lastNameplates,
  layoutSpec,
  livePhotos,
  nextRevisionNumber,
  objectKey,
  PDF_MIME,
  toIso,
  type Clock,
  type DocumentLayout,
  type GenerationResult,
  type LayoutSectionCertificates,
  type NewId,
  type Op,
  type RelatorioSnapshot,
  type RevisionRow,
} from '@app/domain';
import type { S3Client } from '@aws-sdk/client-s3';
import { and, eq, like } from 'drizzle-orm';
import type { Db } from '../../db/client.ts';
import { asCompanyId, type CompanyId } from '../../db/repositories/company-id.ts';
import { findFileRows, type FileRowLookup } from '../../db/repositories/files.ts';
import { liveRevisions } from '../../db/repositories/revisions.ts';
import { ops as opsTable } from '../../db/schema.ts';
import { log, logError } from '../../log.ts';
import { getObject, putObject } from '../../storage/s3.ts';
import { applyOps, applyServerBatch, lockCompany, type Tx } from '../../sync/apply.ts';
import { serverOp } from '../../sync/server-op.ts';
import { freezeSnapshot } from '../../sync/snapshot.ts';
import { s3PagesCache } from './certificate-cache.ts';
import { buildDocx, type DocxImages } from './docx.ts';
import { convertToPdf, DEFAULT_CONVERT_TIMEOUT_MS, LibreOfficeTimeoutError, type GenerateFault } from './libreoffice.ts';
import { readOutline } from './pdf-outline.ts';
import type { Rasterizer } from './pdf-raster.ts';
import { loadCertificatePages, type StoredOriginal } from './sections/section-11.ts';
import { loadPhotoImages } from './sections/section-7.ts';
import { headingPages, missingHeadings, placeholderPages, tocConverged, type TocPages } from './toc.ts';
import { watermarkPng } from './watermark.ts';

/*
 * AD-15: the one renderer. The job freezes the snapshot under the company lock, renders
 * the kernel's layout with the `docx` library, converts its own DOCX with LibreOffice in
 * two (at most three) passes so the printed TOC pages equal the PDF outline, stores both
 * files, and only then applies ONE server batch: the two `file` creates, the `revision`
 * create with the number allocated in that same transaction, the `last_nameplate` puts of
 * the issued plates (Story 7.5, AD-25), and the job's `status` and `result`. A throw
 * anywhere leaves only `status: failed` and `error` behind: no revision number is consumed
 * and no `file` row exists (objects already written to S3 are orphans under immutable,
 * never referenced keys).
 *
 * Story 7.5: a `preview` job is the identical render with the layout's `draft` (RASCUNHO
 * behind every page, no revision number) and stores only its PDF, as a `file` of kind
 * `preview` the relatório's `preview_file_id` names; it changes no status, allocates no
 * number and writes no `last_nameplate`.
 */

export const GENERATE_ACTOR = 'system:generate';

/** Every value `generation_job/{id}/error` may carry; `enqueue_failed` is written by the route. */
export const GENERATE_ERROR_CODES = ['libreoffice_timeout', 'toc_outline_missing', 'render_failed', 'enqueue_failed'] as const;
export type GenerateErrorCode = (typeof GENERATE_ERROR_CODES)[number];

export type GenerateKind = 'issue' | 'preview';

export interface GeneratePayload {
  job_id: string;
  company_id: string;
  relatorio_id: string;
  /** The user who pressed "Gerar relatório": the revision's `created_by`. */
  actor_id: string;
  /** Story 7.5: `preview` renders the RASCUNHO draft; absent means `issue` (payloads queued before the field existed). */
  kind?: GenerateKind;
}

export interface GenerateJobDeps {
  db: Db;
  s3: S3Client;
  bucket: string;
  now: Clock;
  newId: NewId;
  fault?: GenerateFault | undefined;
  timeoutMs?: number;
  /** Section 11's PDF rasterizer; default pdftoppm (`rasterizePdfPages`). Tests inject a failing or counting one. */
  rasterize?: Rasterizer;
  /** Story 14.10 part 4: called with the job's stage times where its `generate timing` line is logged. */
  onTiming?: (timing: GenerateTiming) => void;
}

/** Story 14.10 part 4: one job's wall time per stage (ms), as its `generate timing` line logs it. */
export interface GenerateTiming {
  kind: GenerateKind;
  outcome: 'done' | 'failed';
  total_ms: number;
  stages_ms: Record<string, number>;
}

/** The PDF outline lacks a section heading, so the TOC cannot be written (never silently `00`). */
export class TocOutlineMissingError extends Error {
  constructor(sections: string[]) {
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
  /** Story 14.10 part 4: times each pass's DOCX build, conversion and outline read. */
  clock?: StageClock;
}

/**
 * Story 14.10 part 4 (2026-10-15): the wall time of each stage of one job, in ms. A stage
 * timed twice (a step of the TOC pass loop is named by its pass) adds up. Logged as one
 * `generate timing` line per job and handed to `GenerateJobDeps.onTiming`.
 */
export interface StageClock {
  readonly stages: Record<string, number>;
  time<T>(stage: string, work: () => Promise<T> | T): Promise<T>;
}

export function stageClock(now: () => number = () => performance.now()): StageClock {
  const stages: Record<string, number> = {};
  return {
    stages,
    async time(stage, work) {
      const started = now();
      try {
        return await work();
      } finally {
        stages[stage] = (stages[stage] ?? 0) + Math.max(0, Math.round(now() - started));
      }
    },
  };
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** One `system:generate` op (A-28: the shared envelope), of the job's relatório unless `scope` says otherwise. */
function generateOp(
  payload: GeneratePayload,
  now: string,
  newId: NewId,
  input: { kind: Op['kind']; path: string; value: unknown; scope?: 'relatorio' | 'project'; projectId?: string },
): Op {
  const project = input.scope === 'project';
  return serverOp({
    opId: newId(),
    companyId: payload.company_id,
    actorId: GENERATE_ACTOR,
    clientTs: now,
    kind: input.kind,
    path: input.path,
    value: input.value,
    scope: input.scope ?? 'relatorio',
    projectId: project ? (input.projectId ?? null) : null,
    relatorioId: project ? null : payload.relatorio_id,
  });
}

function jobPut(payload: GeneratePayload, now: string, newId: NewId, field: 'status' | 'error' | 'result' | 'result_file_id' | 'started_at', value: unknown): Op {
  return generateOp(payload, now, newId, { kind: 'put', path: `generation_job/${payload.job_id}/${field}`, value });
}

/**
 * A-8: the `file` rows the job reads bytes of (the logo, the cover, every live photo and
 * every attached certificate), in one query instead of one per file.
 */
function fileIdsToLoad(snapshot: RelatorioSnapshot, certificates: LayoutSectionCertificates | undefined): string[] {
  const ids = [snapshot.empresa?.logo_file_id ?? null, snapshot.relatorio.setup.cover_photo_file_id, ...livePhotos(snapshot).map((photo) => photo.id)];
  for (const certificate of certificates?.certificates ?? []) ids.push(certificate.certificateFileId);
  return ids.filter((id): id is string => id !== null);
}

/** The `print` variant bytes of a file whose row says the variants were rendered; undefined otherwise. A failing read throws. */
async function printVariant(deps: GenerateJobDeps, companyId: CompanyId, files: ReadonlyMap<string, FileRowLookup>, fileId: string | null): Promise<Buffer | undefined> {
  if (fileId === null) return undefined;
  const found = files.get(fileId);
  if (found === undefined || found.row.uploaded_at === null || found.row.variants === null) return undefined;
  const stored = await getObject(deps.s3, deps.bucket, objectKey(companyId, found.row.kind, fileId, 'print', found.relatorioId));
  return stored === null ? undefined : buffer(stored.body);
}

/** Story 7.3: the original bytes and type of an uploaded file (a certificate), or undefined when the server holds none. A failing read throws. */
async function readOriginal(deps: GenerateJobDeps, companyId: CompanyId, files: ReadonlyMap<string, FileRowLookup>, fileId: string): Promise<StoredOriginal | undefined> {
  const found = files.get(fileId);
  if (found === undefined || found.row.uploaded_at === null || found.row.removed_at !== null) return undefined;
  const stored = await getObject(deps.s3, deps.bucket, objectKey(companyId, found.row.kind, fileId, 'original', found.relatorioId));
  return stored === null ? undefined : { bytes: await buffer(stored.body), mime: found.row.mime };
}

/**
 * Story 14.10 part 4 (2026-10-15): the layout one TOC pass renders. Pass 1 exists only for
 * its PDF outline (the pages of the headings); its DOCX and PDF are thrown away, so the
 * preview's RASCUNHO image, which floats behind the text and moves no line, prints nothing
 * there and is left out: measured on the production shape (76 sheets, 86 pages), it tripled
 * the pass's LibreOffice time (6.3 s against 2.1 s). Every later pass, the one whose files
 * are kept among them, renders the layout whole; and should the image ever move a heading,
 * pass 2 sees it and the loop takes its third pass, as for any moved heading.
 */
export function passLayout(layout: DocumentLayout, pass: number): DocumentLayout {
  return pass === 1 && layout.watermark !== null ? { ...layout, watermark: null } : layout;
}

/**
 * AD-15's pass loop: pass 1 with placeholders, pass 2 with the outline's pages, a third
 * pass only when pass-2 moved a heading. Returns the last pass's DOCX and PDF.
 */
export async function renderDocument(layout: DocumentLayout, images: DocxImages, options: RenderOptions): Promise<RenderedDocument> {
  const convert = (docx: Buffer) => convertToPdf(docx, { jobId: options.jobId, timeoutMs: options.timeoutMs ?? DEFAULT_CONVERT_TIMEOUT_MS, fault: options.fault });
  const clock = options.clock ?? stageClock();
  let passes = 0;
  const pass = async (tocPages: TocPages) => {
    passes += 1;
    const docx = await clock.time(`docx_${passes}`, () => buildDocx(passLayout(layout, passes), { tocPages, images }));
    const pdf = await clock.time(`convert_${passes}`, () => convert(docx));
    const outline = await clock.time(`outline_${passes}`, () => readOutline(pdf));
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
  const kind: GenerateKind = payload.kind ?? 'issue';
  const clock = stageClock();
  /** One structured line per job with every stage's time (Story 14.10 part 4). */
  const logTiming = (outcome: 'done' | 'failed') => {
    const timing: GenerateTiming = { kind, outcome, total_ms: Date.now() - started, stages_ms: { ...clock.stages } };
    log('generate timing', { ...fields, ...timing });
    deps.onTiming?.(timing);
  };
  try {
    // R7: the running put carries `started_at`, the instant a running job's expiry counts from.
    const startedAt = stamp();
    await putJobFields([jobPut(payload, startedAt, deps.newId, 'status', 'running'), jobPut(payload, startedAt, deps.newId, 'started_at', startedAt)]);

    const frozen = await clock.time('freeze', () =>
      deps.db.transaction(async (tx: Tx) => {
        await lockCompany(tx, companyId);
        const { snapshot, snapshotSeq } = await freezeSnapshot(tx, companyId, payload.relatorio_id);
        const number = nextRevisionNumber(await liveRevisions(tx, companyId, payload.relatorio_id));
        return { snapshot, snapshotSeq, number };
      }),
    );
    const issuedAt = stamp();
    const layout = await clock.time('layout', () =>
      layoutSpec(frozen.snapshot, {
        revisionNumber: frozen.number,
        issuedAt,
        art: frozen.snapshot.relatorio.setup.art_trt_number,
        draft: kind === 'preview',
      }),
    );
    const certificatesSection = layout.sections.find((section): section is LayoutSectionCertificates => section.kind === 'certificates');
    const files = await clock.time('file_rows', () => findFileRows(deps.db, companyId, fileIdsToLoad(frozen.snapshot, certificatesSection)));
    const images: DocxImages = {};
    await clock.time('logo_cover', async () => {
      const logo = await printVariant(deps, companyId, files, frozen.snapshot.empresa?.logo_file_id ?? null);
      if (logo !== undefined) images.logo = logo;
      const cover = await printVariant(deps, companyId, files, frozen.snapshot.relatorio.setup.cover_photo_file_id);
      if (cover !== undefined) images.cover = cover;
    });
    // Stories 7.2/7.3: the photos' print bytes and the certificates' page images, loaded
    // once before the passes. The loaders log and skip what the server does not hold or
    // cannot decode; a read that throws, or certificate pages not produced in time, fail
    // the job (A-4; Matheus 2026-09-30), never issue without them.
    images.photos = await clock.time('photos', () => loadPhotoImages(frozen.snapshot, (fileId) => printVariant(deps, companyId, files, fileId), fields));
    images.certificates = await clock.time('certificates', () =>
      loadCertificatePages(certificatesSection, (fileId) => readOriginal(deps, companyId, files, fileId), {
        jobId: payload.job_id,
        context: fields,
        cache: s3PagesCache(deps.s3, deps.bucket, companyId),
        ...(deps.rasterize === undefined ? {} : { rasterize: deps.rasterize }),
      }),
    );
    // A-24: a preview's RASCUNHO image is drawn once per job, not once per TOC pass.
    const watermark = layout.watermark;
    if (watermark !== null) images.watermark = await clock.time('watermark', () => watermarkPng(watermark));

    const rendered = await renderDocument(layout, images, { jobId: payload.job_id, timeoutMs: deps.timeoutMs, fault: deps.fault, clock });

    if (kind === 'preview') {
      const previewId = deps.newId();
      await clock.time('upload', () => putObject(deps.s3, deps.bucket, objectKey(companyId, 'preview', previewId), rendered.pdf, PDF_MIME));
      const durationMs = Date.now() - started;
      const result: GenerationResult = { toc_passes: rendered.tocPasses, toc_converged: rendered.tocConverged, pages: rendered.pages, duration_ms: durationMs };
      await clock.time('commit', () => commitPreview(deps, payload, companyId, { previewId, pdf: rendered.pdf, result }));
      log('generate preview done', { ...fields, duration_ms: durationMs, toc_passes: rendered.tocPasses, pages: rendered.pages });
      logTiming('done');
      return 'done';
    }

    const docxId = deps.newId();
    const pdfId = deps.newId();
    await clock.time('upload', async () => {
      await putObject(deps.s3, deps.bucket, objectKey(companyId, 'docx', docxId), rendered.docx, DOCX_MIME);
      await putObject(deps.s3, deps.bucket, objectKey(companyId, 'pdf', pdfId), rendered.pdf, PDF_MIME);
    });

    const durationMs = Date.now() - started;
    const result: GenerationResult = { toc_passes: rendered.tocPasses, toc_converged: rendered.tocConverged, pages: rendered.pages, duration_ms: durationMs };
    await clock.time('commit', () => commitRevision(deps, payload, companyId, frozen, { docxId, pdfId, docx: rendered.docx, pdf: rendered.pdf, result }));
    logTiming('done');

    log('generate done', { ...fields, duration_ms: durationMs, toc_passes: rendered.tocPasses, toc_converged: rendered.tocConverged, pages: rendered.pages, revision_number: frozen.number });
    await logSmC1(deps, companyId, payload, frozen.number);
    return 'done';
  } catch (error) {
    const code = errorCodeOf(error);
    logError('generate failed', { ...fields, error: code, detail: String(error), duration_ms: Date.now() - started });
    logTiming('failed');
    await putJobFields([jobPut(payload, stamp(), deps.newId, 'status', 'failed'), jobPut(payload, stamp(), deps.newId, 'error', code)]).catch(
      (applyError: unknown) => logError('generate failure could not be recorded', { ...fields, error: String(applyError) }),
    );
    return 'failed';
  }
}

/**
 * SM-C1 (Story 7.5): how many sheet cells written from a confirmed suggestion were later
 * overwritten by hand, over the relatório's ops, logged per issue and never stored. A
 * failure to count is logged and never fails the issued revision.
 */
async function logSmC1(deps: GenerateJobDeps, companyId: CompanyId, payload: GeneratePayload, revisionNumber: number): Promise<void> {
  try {
    const rows = await deps.db
      .select({ kind: opsTable.kind, path: opsTable.path, meta: opsTable.meta, seq: opsTable.seq })
      .from(opsTable)
      .where(and(eq(opsTable.company_id, companyId), eq(opsTable.relatorio_id, payload.relatorio_id), like(opsTable.path, 'sheet/%')));
    const count = confirmedCellsLaterEdited(rows.map((row) => ({ kind: row.kind as Op['kind'], path: row.path, meta: (row.meta ?? null) as Op['meta'], seq: row.seq })));
    log('generate sm_c1', { company_id: payload.company_id, relatorio_id: payload.relatorio_id, job_id: payload.job_id, revision_number: revisionNumber, sm_c1: count });
  } catch (error) {
    logError('generate sm_c1 not counted', { company_id: payload.company_id, relatorio_id: payload.relatorio_id, job_id: payload.job_id, error: String(error) });
  }
}

/** The preview's one batch: the `preview` file, the relatório's `preview_file_id`, and the job's result file, status and result. */
async function commitPreview(
  deps: GenerateJobDeps,
  payload: GeneratePayload,
  companyId: CompanyId,
  outputs: { previewId: string; pdf: Buffer; result: GenerationResult },
): Promise<void> {
  const now = toIso(deps.now());
  const batch: Op[] = [
    generateOp(payload, now, deps.newId, {
      kind: 'create',
      path: `file/${outputs.previewId}`,
      value: {
        id: outputs.previewId,
        company_id: payload.company_id,
        relatorio_id: payload.relatorio_id,
        kind: 'preview',
        sha256: sha256(outputs.pdf),
        mime: PDF_MIME,
        size: outputs.pdf.byteLength,
        uploaded_at: now,
        variants: null,
        removed_at: null,
      },
    }),
    generateOp(payload, now, deps.newId, { kind: 'put', path: 'relatorio/preview_file_id', value: outputs.previewId }),
    jobPut(payload, now, deps.newId, 'result_file_id', outputs.previewId),
    jobPut(payload, now, deps.newId, 'status', 'done'),
    jobPut(payload, now, deps.newId, 'result', outputs.result),
  ];
  await applyServerBatch(deps.db, companyId, batch, { now: deps.now });
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
    generateOp(payload, now, deps.newId, {
      kind: 'create',
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
  // AD-25: the issued plates, projected onto their equipment rows (project scope) in the
  // same batch as the revision, so "Copiar da última visita" appears on the next visit.
  const projectId = frozen.snapshot.relatorio.project_id;
  const lastNameplateOps: Op[] = lastNameplates(frozen.snapshot, { revisionNumber: frozen.number, issuedAt: now }).map((entry) =>
    generateOp(payload, now, deps.newId, { kind: 'put', scope: 'project', projectId, path: `equipment/${entry.equipmentId}/last_nameplate`, value: entry.value }),
  );
  const batch: Op[] = [
    fileCreate(outputs.docxId, 'docx', outputs.docx, DOCX_MIME),
    fileCreate(outputs.pdfId, 'pdf', outputs.pdf, PDF_MIME),
    generateOp(payload, now, deps.newId, { kind: 'create', path: `revision/${revisionId}`, value: revision }),
    ...lastNameplateOps,
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
