import { audioFileRowSchema, fileFieldPath, filePath, relatorioOpEnvelope, type AudioFileRow, type AudioQuality, type AudioTarget, type Author, type OpDraft } from '@app/domain';
import { sha256Hex } from '../files/photo-encode.ts';
import { commitBatch, commitFileBatch, type CommitDeps } from './commit.ts';
import { useLiveQuery } from './live.ts';
import type { AppDatabase } from './schema.ts';

/*
 * Story 31.3 (AD-30, AR-6): a recording that heard speech is kept in ONE transaction: the
 * `file/{id}` create of kind `audio` (relatório scope, its target and the kernel's quality,
 * `audio_status: 'queued'`) and its Blob (`commitFileBatch`). Nothing exists before the stop, so
 * a recording cut off by a closed tab leaves no row, no blob and no op. The uploader sends it
 * with the waiting readings (`orderUploads`); the server's upload starts its transcription.
 */

export interface AudioCaptureInput {
  companyId: string;
  relatorioId: string;
  actorId: string;
  /** Minted by the caller. */
  fileId: string;
  target: AudioTarget;
  quality: AudioQuality;
  blob: Blob;
  /** The container alone, as the server stores it (`audio/webm` or `audio/mp4`). */
  mime: 'audio/webm' | 'audio/mp4';
}

/** The audio's `file/{id}` create draft: relatório scope, the full `audioFileRowSchema` row. */
export function audioCreateDraft(input: AudioCaptureInput, sha256: string): OpDraft {
  return {
    scope: 'relatorio',
    company_id: input.companyId,
    project_id: null,
    relatorio_id: input.relatorioId,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: input.actorId,
    kind: 'create',
    path: filePath(input.fileId),
    value: {
      id: input.fileId,
      company_id: input.companyId,
      relatorio_id: input.relatorioId,
      kind: 'audio',
      sha256,
      mime: input.mime,
      size: input.blob.size,
      uploaded_at: null,
      variants: null,
      removed_at: null,
      audio_target: input.target,
      audio_status: 'queued',
      quality: input.quality,
      transcript_heard: null,
      transcript_written: null,
      transcription_run_id: null,
    } satisfies AudioFileRow as never,
  };
}

/** Commits one recording: the create op and the Blob together, or neither. */
export async function commitAudioCapture(
  db: AppDatabase,
  input: AudioCaptureInput,
  deps: CommitDeps & { hash?: (blob: Blob) => Promise<string> },
): Promise<{ batch_id: string }> {
  const sha256 = await (deps.hash ?? sha256Hex)(input.blob);
  const { batch_id } = await commitFileBatch(db, { ops: [audioCreateDraft(input, sha256)], blob: input.blob, fileId: input.fileId }, deps);
  return { batch_id };
}

/**
 * Story 31.6 (AD-30): "Dispensar" of an audio whose transcription failed, the one status a device
 * writes (`file/{id}/audio_status = dismissed`). The row, its bytes and its measures stay; it stops
 * holding the ficha and the emission.
 */
export function audioDismissDraft(author: Author, audio: Pick<AudioFileRow, 'id' | 'relatorio_id'>): OpDraft {
  // An audio is always relatório scope (`audioCreateDraft`); the type allows null for every file kind.
  if (audio.relatorio_id === null) throw new Error('an audio with no relatório');
  return { ...relatorioOpEnvelope(author, audio.relatorio_id), kind: 'put', path: fileFieldPath(audio.id, 'audio_status'), value: 'dismissed' };
}

/** Commits a dismiss, one op in its own batch. */
export async function commitAudioDismiss(db: AppDatabase, author: Author, audio: Pick<AudioFileRow, 'id' | 'relatorio_id'>, deps: CommitDeps): Promise<void> {
  await commitBatch(db, [audioDismissDraft(author, audio)], deps);
}

/** Every live audio row of a relatório on this device. */
export async function audioRowsOf(db: AppDatabase, relatorioId: string): Promise<AudioFileRow[]> {
  const records = await db.entities.where('entity').equals('file').toArray();
  const rows: AudioFileRow[] = [];
  for (const record of records) {
    const row = record.row as { kind?: unknown; relatorio_id?: unknown };
    if (row.kind !== 'audio' || row.relatorio_id !== relatorioId) continue;
    const parsed = audioFileRowSchema.safeParse(record.row);
    if (parsed.success && parsed.data.removed_at === null) rows.push(parsed.data);
  }
  return rows;
}

/** Every live audio row on this device, of every relatório (Sync status's counts). */
export async function allAudioRows(db: AppDatabase): Promise<AudioFileRow[]> {
  const records = await db.entities.where('entity').equals('file').toArray();
  const rows: AudioFileRow[] = [];
  for (const record of records) {
    if ((record.row as { kind?: unknown }).kind !== 'audio') continue;
    const parsed = audioFileRowSchema.safeParse(record.row);
    if (parsed.success && parsed.data.removed_at === null) rows.push(parsed.data);
  }
  return rows;
}

const NO_ROWS: readonly AudioFileRow[] = [];

/** The relatório's audio rows, live; empty while read or without a database. */
export function useAudioRows(db: AppDatabase | null, relatorioId: string | null): readonly AudioFileRow[] {
  return useLiveQuery(async () => (db === null || relatorioId === null ? NO_ROWS : audioRowsOf(db, relatorioId)), [db, relatorioId], NO_ROWS) ?? NO_ROWS;
}
