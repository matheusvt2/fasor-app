import { revisionFileMime, revisionFileName, type RevisionFileFormat } from '@app/domain';
import { fetchRevisionBlob, revisionDocxUrl, revisionPdfUrl } from '../../sync/client.ts';

/*
 * E11-Q1 (Matheus, 2026-09-30): the Export dialog's DOCX and PDF rows hand over the file
 * itself, never a URL (the route needs a session the client does not have). A press fetches
 * the revision's bytes with the session cookie, wraps them in a `File` named
 * `relatorio-rev-{n}.{docx,pdf}` and either saves it (an object URL on a temporary
 * `<a download>`) or gives it to the system share sheet when the browser can share files;
 * where it cannot, the share falls back to saving the file. A failed fetch rejects (the
 * dialog words it); a share sheet the person closes is silent.
 */

export interface RevisionFileRef {
  revisionId: string;
  number: number;
  format: RevisionFileFormat;
}

/** The outcome of a share press: shared through the sheet, saved instead, or closed by the person. */
export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

export interface RevisionFileDeps {
  /** The bytes of a revision file at its route (default: `fetchRevisionBlob`, with the session cookie). */
  fetchBlob?: (path: string) => Promise<Blob>;
}

const pathOf = (ref: RevisionFileRef): string => (ref.format === 'docx' ? revisionDocxUrl(ref.revisionId) : revisionPdfUrl(ref.revisionId));

/** The revision file as a named, typed `File`; rejects when the request fails (offline, 401, 5xx). */
export async function fetchRevisionFile(ref: RevisionFileRef, deps: RevisionFileDeps = {}): Promise<File> {
  const blob = await (deps.fetchBlob ?? ((path: string) => fetchRevisionBlob(path)))(pathOf(ref));
  const type = revisionFileMime(ref.format);
  return new File([blob], revisionFileName(ref.number, ref.format), { type });
}

/** Saves `file` through a temporary `<a download>` on an object URL, revoked once the click has handed it over. */
export function saveFile(file: File): void {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    // The click starts the download synchronously; a later revoke keeps slow browsers safe.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

/** Whether the browser has a share sheet at all (the share buttons show only then). */
export function hasShareSheet(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/** Whether the share sheet takes files (Android Chrome, iPadOS Safari). */
export function canShareFile(file: File): boolean {
  if (!hasShareSheet() || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

const isAbort = (error: unknown): boolean => typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';

/** "DOCX — abrir no Word", "PDF — enviar ao cliente" and a revision row's DOCX/PDF: saves the file. */
export async function downloadRevisionFile(ref: RevisionFileRef, deps: RevisionFileDeps = {}): Promise<void> {
  saveFile(await fetchRevisionFile(ref, deps));
}

/**
 * "Compartilhar DOCX/PDF": the file to the system share sheet when it takes files, else the
 * file saved. The person closing the sheet is `cancelled` and silent; a sheet that refuses
 * the file for another reason (its user activation expired while the bytes came) saves it.
 */
export async function shareRevisionFile(ref: RevisionFileRef, title: string, deps: RevisionFileDeps = {}): Promise<ShareOutcome> {
  const file = await fetchRevisionFile(ref, deps);
  if (!canShareFile(file)) {
    saveFile(file);
    return 'downloaded';
  }
  try {
    await navigator.share({ files: [file], title });
    return 'shared';
  } catch (error) {
    if (isAbort(error)) return 'cancelled';
    saveFile(file);
    return 'downloaded';
  }
}
