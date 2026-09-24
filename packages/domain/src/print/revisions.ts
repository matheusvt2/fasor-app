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

/** The same row as one string. */
export function revisionRowText(row: RevisionRow, whoName: string | null): string {
  const s = revisionRowSegments(row, whoName);
  return `${s.before}${s.dateText}${s.after}`;
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

/** The result block's meta line as one string: "10/09/2026 11:03 · Bruno" (the date alone when nobody is known). */
export function revisionMetaText(row: RevisionRow, whoName: string | null): string {
  const s = revisionMetaSegments(row, whoName);
  return `${s.dateText}${s.after}`;
}

/**
 * Seconds pg-boss lets a generate job stay active before it expires it (the api's queue
 * options), and so the age past which a `queued`/`running` row no longer counts as
 * running. One value for the queue, the route and the Export dialog.
 */
export const GENERATE_JOB_EXPIRE_S = 900;

/**
 * The instant (ms since the epoch) after which a job no longer counts as running, or
 * null when its `created_at` does not parse.
 */
export function jobExpiresAt(job: Pick<GenerationJobRow, 'created_at'>, expireS: number = GENERATE_JOB_EXPIRE_S): number | null {
  const created = Date.parse(job.created_at);
  return Number.isNaN(created) ? null : created + expireS * 1000;
}

/**
 * AD-15: a generate job still counts as running only while it is `queued` or `running`
 * and younger than the queue's expiry (pg-boss gives up on it after `expireS` seconds,
 * and a worker that died after `status: running` never writes `failed`). The route and
 * the Export dialog read this one rule, so neither waits forever on a dead job. A job
 * whose `created_at` does not parse is treated as expired.
 */
export function isJobActive(
  job: Pick<GenerationJobRow, 'status' | 'created_at'>,
  nowIso: string,
  expireS: number = GENERATE_JOB_EXPIRE_S,
): boolean {
  if (job.status !== 'queued' && job.status !== 'running') return false;
  const expires = jobExpiresAt(job, expireS);
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

/** The toast when the revision arrives; the mock says "— DOCX e PDF", and the PDF download is out of the slice. */
export function readyToast(number: number): string {
  return `Revisão ${number} pronta — DOCX`;
}

/** The note beside the status pill in the result block. */
export function nextEditNote(number: number): string {
  return `Qualquer alteração a partir de agora gera a revisão ${number + 1}.`;
}

/**
 * AD-15: the files the device expects the server to have stored before it generates —
 * every file of the snapshot plus the company logo and the cover photo when set, once
 * each. The server answers `409 not_caught_up` while any of them has no `uploaded_at`.
 */
export function expectedFileIds(snapshot: RelatorioSnapshot): string[] {
  const ids = new Set<string>();
  for (const file of snapshot.files) ids.add(file.id);
  const logo = snapshot.empresa?.logo_file_id ?? null;
  if (logo !== null) ids.add(logo);
  const cover = snapshot.relatorio.setup.cover_photo_file_id;
  if (cover !== null) ids.add(cover);
  return [...ids];
}
