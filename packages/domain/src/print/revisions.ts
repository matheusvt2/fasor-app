import { formatDateTime } from '../format/datetime.ts';
import type { GenerationJobRow, RevisionRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';

/*
 * Story 4.8: revisions as the Export dialog and the document name them. Every sentence
 * that carries a revision number is composed here (AD-2), so the dialog, the toast and the
 * document control agree on "Rev. n"; `apps/web/src/copy/pt-br.ts` keeps only the static
 * words. Verbatim from `73-exportar.html` where the mock has the sentence.
 */

const byNumberDesc = (a: RevisionRow, b: RevisionRow) => b.number - a.number || (a.id < b.id ? 1 : -1);

/** The revisions newest first, as the "Revisões" list draws them. */
export function sortRevisions(rows: readonly RevisionRow[]): RevisionRow[] {
  return [...rows].sort(byNumberDesc);
}

/** The revision with the highest number, or null with none. */
export function latestRevision(rows: readonly RevisionRow[]): RevisionRow | null {
  return sortRevisions(rows)[0] ?? null;
}

/** The number the next generate allocates: the latest plus one, 1 for the first. */
export function nextRevisionNumber(rows: readonly RevisionRow[]): number {
  return (latestRevision(rows)?.number ?? 0) + 1;
}

/**
 * The number the Export dialog's idle line promises (Epic 4 QA Q11): 1 before any
 * revision; the latest revision's own number while nothing was edited since its snapshot
 * (AD-15: a second "Gerar relatório" then answers that revision); the next one otherwise.
 */
export function idleRevisionNumber(rows: readonly RevisionRow[], edited: boolean): number {
  const latest = latestRevision(rows);
  if (latest === null) return 1;
  return edited ? latest.number + 1 : latest.number;
}

/** "Rev. 2": the document control's "Revisão do documento" and the head of a revision row. */
export function revisionTitle(number: number): string {
  return `Rev. ${number}`;
}

export interface RevisionRowSegments {
  /** "Rev. 2 — " */
  before: string;
  /** The `datetime` attribute of the row's `<time>`. */
  datetime: string;
  /** "10/09/2026 08:47" */
  dateText: string;
  /** " — Bruno", or '' when nobody is known. */
  after: string;
}

/**
 * The parts of a "Revisões" row, "Rev. 2 — 10/09/2026 08:47 — Bruno", so the dialog can
 * wrap the date in a `<time>` without composing the sentence itself. `whoName` is the
 * name of `created_by` as this device knows it, or null.
 */
export function revisionRowSegments(row: RevisionRow, whoName: string | null): RevisionRowSegments {
  const who = whoName?.trim() ?? '';
  return {
    before: `${revisionTitle(row.number)} — `,
    datetime: row.created_at,
    dateText: formatDateTime(row.created_at),
    after: who === '' ? '' : ` — ${who}`,
  };
}

export interface RevisionMetaSegments {
  /** The `datetime` attribute of the line's `<time>`. */
  datetime: string;
  /** "10/09/2026 11:03" */
  dateText: string;
  /** " · Bruno", or '' when nobody is known. */
  after: string;
}

/** The parts of the result block's meta line, so the dialog can wrap the date in a `<time>`. */
export function revisionMetaSegments(row: RevisionRow, whoName: string | null): RevisionMetaSegments {
  const who = whoName?.trim() ?? '';
  return { datetime: row.created_at, dateText: formatDateTime(row.created_at), after: who === '' ? '' : ` · ${who}` };
}

/**
 * Seconds pg-boss lets a generate job stay active (running) before it expires it (the
 * api's queue options), and so how long after its `started_at` a `running` row still
 * counts as running. One value for the queue, the route and the Export dialog.
 */
export const GENERATE_JOB_EXPIRE_S = 900;

/**
 * R7 (Story 4.8 review): seconds a job may wait `queued` before it no longer counts as
 * running: pg-boss's `retentionSeconds` of the queue, the time a created job is kept
 * waiting for a worker. One hour, so a busy queue never makes a waiting press look dead.
 */
export const GENERATE_JOB_QUEUE_RETENTION_S = 3600;

/**
 * The instant (ms since the epoch) after which a job no longer counts as running, or null
 * when it cannot be said: a `running` job expires `expireS` after its `started_at`
 * (`created_at` for a row written before `started_at` existed), a `queued` one
 * `GENERATE_JOB_QUEUE_RETENTION_S` after its `created_at`. Null when the date read does
 * not parse, or for a job that is neither queued nor running.
 */
export function jobExpiresAt(
  job: Pick<GenerationJobRow, 'created_at' | 'status'> & Partial<Pick<GenerationJobRow, 'started_at'>>,
  expireS: number = GENERATE_JOB_EXPIRE_S,
  queueRetentionS: number = GENERATE_JOB_QUEUE_RETENTION_S,
): number | null {
  if (job.status === 'running') {
    const started = Date.parse(job.started_at ?? job.created_at);
    return Number.isNaN(started) ? null : started + expireS * 1000;
  }
  if (job.status === 'queued') {
    const created = Date.parse(job.created_at);
    return Number.isNaN(created) ? null : created + queueRetentionS * 1000;
  }
  return null;
}

/**
 * AD-15, R7: a generate job still counts as running only while it is `queued` (until the
 * queue's retention after `created_at`) or `running` (until the queue's expiry after
 * `started_at`): pg-boss gives up on it then, and a worker that died after `status:
 * running` never writes `failed`. The route and the Export dialog read this one rule, so
 * neither waits forever on a dead job. A job whose dates do not parse is inactive.
 */
export function isJobActive(
  job: Pick<GenerationJobRow, 'status' | 'created_at'> & Partial<Pick<GenerationJobRow, 'started_at'>>,
  nowIso: string,
  expireS: number = GENERATE_JOB_EXPIRE_S,
  queueRetentionS: number = GENERATE_JOB_QUEUE_RETENTION_S,
): boolean {
  if (job.status !== 'queued' && job.status !== 'running') return false;
  const expires = jobExpiresAt(job, expireS, queueRetentionS);
  const now = Date.parse(nowIso);
  if (expires === null || Number.isNaN(now)) return false;
  return now < expires;
}

/** The idle reason beside "Gerar relatório" (mock, with the number live). */
export function idleReason(number: number): string {
  return `Gera o DOCX e o PDF juntos, a partir dos dados do app, como a revisão ${number}. Precisa de conexão.`;
}

/** The reason beside "Gerar relatório" under the failed line (mock, with the number live). */
export function failedReason(number: number): string {
  return `Gera o DOCX e o PDF juntos, como a revisão ${number}. Precisa de conexão.`;
}

/**
 * E9 sweep B14: whether a `409 not_caught_up` can still be answered by syncing and asking
 * again. It can while the server misses an op, or a file this device still has to upload
 * (`pendingUploadIds`); a file named missing that no upload of this device will ever bring
 * (another device's photo, or one this device no longer holds) keeps it refused however
 * often the dialog retries, so the request fails at once.
 */
export function notCaughtUpRetryable(
  details: { missing_op: boolean; missing_files: readonly string[] },
  pendingUploadIds: ReadonlySet<string>,
): boolean {
  if (details.missing_op || details.missing_files.length === 0) return true;
  return details.missing_files.some((id) => pendingUploadIds.has(id));
}

/**
 * The failed line's addition when the server still misses files this device cannot send
 * (E9 sweep B14). authored: the mock's failed state names no cause.
 */
export function missingFilesText(count: number): string {
  return count === 1 ? '1 arquivo ainda não chegou ao servidor' : `${count} arquivos ainda não chegaram ao servidor`;
}

/** The progress counter's text while a job runs. */
export function generatingText(number: number): string {
  return `Gerando revisão ${number}…`;
}

/** The disabled reason beside the button while a job runs. */
export function generatingReason(number: number): string {
  return `Gerando a revisão ${number} — DOCX e PDF juntos`;
}

/** The result block's title. */
export function readyTitle(number: number): string {
  return `Revisão ${number} pronta`;
}

/** The toast when the revision arrives, verbatim from the mock (`73-exportar.html`): both files ship (Story 11.1). */
export function readyToast(number: number): string {
  return `Revisão ${number} pronta — DOCX e PDF`;
}

/** The note beside the status pill in the result block. */
export function nextEditNote(number: number): string {
  return `Qualquer alteração a partir de agora gera a revisão ${number + 1}.`;
}

/**
 * AD-15: the files the device expects the server to have stored before it generates —
 * every non-photo file of the snapshot plus the company logo and the cover photo when set,
 * once each. The server answers `409 not_caught_up` while any of them has no `uploaded_at`.
 * Photos never block "Gerar" (coordinator decision 2026-09-25): the job renders with the
 * photos the server holds, so no `kind: 'photo'` row is listed here.
 */
export function expectedFileIds(snapshot: RelatorioSnapshot): string[] {
  const ids = new Set<string>();
  for (const file of snapshot.files) if (file.kind !== 'photo') ids.add(file.id);
  const logo = snapshot.empresa?.logo_file_id ?? null;
  if (logo !== null) ids.add(logo);
  const cover = snapshot.relatorio.setup.cover_photo_file_id;
  if (cover !== null) ids.add(cover);
  return [...ids];
}
