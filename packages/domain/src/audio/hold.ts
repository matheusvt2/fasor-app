import type { SheetStep } from '../relatorio/sheet-progress.ts';
import type { AudioStatus, AudioTarget } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { listPtBr, plural } from '../text/plural.ts';
import { audioWritingContext } from './context.ts';
import { failedAudiosText, pendingAudiosText } from './status.ts';
import { audioBlockId } from './target.ts';

/*
 * Story 31.6 (AD-30, decision 6): what a pending audio holds. An audio still on its way (`queued`,
 * `transcribing`) and, by the coordinator's reading open to Matheus, one that `failed` three times
 * hold its ficha (it cannot be concluded) and the emission (the pre-issue check refuses it on the
 * device and on the server) until it is transcribed, retried or dismissed. `done` and `dismissed`
 * hold nothing. This file names those audios, their places and the sentences every surface shows
 * (the ficha's line, the Export dialog's rows, Sync status); `apps/*` count nothing of their own.
 */

/** The statuses that hold a ficha and the emission. */
export type HoldingAudioStatus = Extract<AudioStatus, 'queued' | 'transcribing' | 'failed'>;

/** True for an audio still on its way or failed: it holds its ficha and the emission. */
export function isHoldingAudioStatus(status: AudioStatus): status is HoldingAudioStatus {
  return status === 'queued' || status === 'transcribing' || status === 'failed';
}

interface HoldFile {
  id: string;
  kind: string;
  removed_at: string | null;
}

interface HoldAudio extends HoldFile {
  kind: 'audio';
  audio_status: AudioStatus;
  audio_target: AudioTarget;
}

/** One audio that holds: its id, status, target and the ficha (block) it belongs to, or null outside one. */
export interface HeldAudio {
  id: string;
  status: HoldingAudioStatus;
  target: AudioTarget;
  blockId: string | null;
}

/** The live audios that hold (of one ficha when `scope.blockId` is given), oldest first. */
export function heldAudios(files: readonly HoldFile[], scope: { blockId?: string } = {}): HeldAudio[] {
  const out: HeldAudio[] = [];
  for (const file of files) {
    if (file.kind !== 'audio' || file.removed_at !== null) continue;
    const audio = file as HoldAudio;
    if (!isHoldingAudioStatus(audio.audio_status)) continue;
    const blockId = audioBlockId(audio.audio_target);
    if (scope.blockId !== undefined && blockId !== scope.blockId) continue;
    out.push({ id: audio.id, status: audio.audio_status, target: audio.audio_target, blockId });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * e31f (Matheus, 2026-11-26: "Dispensar na lista de pendências"): the statuses "Tentar de novo" may
 * queue again: a `failed` audio, and a `queued` one (on the server it waits for a job that may never
 * come: sent while AI features were off, or a send lost). The server queues it only once it holds the
 * bytes (`audioRetryAllowed`).
 */
export function isRetryableAudioStatus(status: AudioStatus): boolean {
  return status === 'failed' || status === 'queued';
}

/** e31f: whether "Tentar de novo" applies to an audio: a retryable status and the server holds its bytes. */
export function audioRetryAllowed(audio: { audio_status: AudioStatus; uploaded_at: string | null }): boolean {
  return isRetryableAudioStatus(audio.audio_status) && audio.uploaded_at !== null;
}

/**
 * e31f: what a not-done audio offers wherever it is listed (the field, the ficha's hold line, the
 * Export dialog's rows): "Dispensar" on every audio that holds (queued, transcribing, failed, its
 * field removed or not), "Tentar de novo" where `audioRetryAllowed`. The audio stays stored either way.
 */
export function heldAudioActions(audio: { audio_status: AudioStatus; uploaded_at: string | null }): { retry: boolean; dismiss: boolean } {
  const holding = isHoldingAudioStatus(audio.audio_status);
  return { retry: holding && audioRetryAllowed(audio), dismiss: holding };
}

/** How many of the held audios are on their way and how many failed. */
export function heldAudioCounts(held: readonly Pick<HeldAudio, 'status'>[]): { pending: number; failed: number } {
  const failed = held.filter((audio) => audio.status === 'failed').length;
  return { pending: held.length - failed, failed };
}

/**
 * The sentence of what holds: "1 áudio aguardando transcrição", "2 áudios não transcritos", or both
 * joined ("1 áudio aguardando transcrição e 1 áudio não transcrito"); null when nothing holds.
 */
export function heldAudiosText(held: readonly Pick<HeldAudio, 'status'>[]): string | null {
  const { pending, failed } = heldAudioCounts(held);
  const parts = [...(pending > 0 ? [pendingAudiosText(pending)] : []), ...(failed > 0 ? [failedAudiosText(failed)] : [])];
  return parts.length === 0 ? null : listPtBr(parts);
}

/**
 * Where an audio is, as a line names it: the field the screen calls it (`audioWritingContext`'s
 * field) after the ficha's TAG, else its equipment type ("SEC-01 · Observações da ficha"); the field
 * alone outside a ficha ("Legenda da foto"); the field's kind when the relatório no longer holds it.
 */
export function audioPlaceText(snapshot: RelatorioSnapshot, target: AudioTarget): string {
  const context = audioWritingContext(snapshot, target);
  // authored (Story 31.6, listed for Bruno): the place of an audio whose field the relatório no longer holds.
  if (context === null) return 'Campo removido';
  const sheet = context.tag ?? context.equipment_type;
  return sheet === null ? context.field : `${sheet} · ${context.field}`;
}

/** The ficha step a held audio's field is on, where "Concluir ficha" and the ficha's line lead; null for a field outside the steps. */
export function audioSheetStep(target: AudioTarget): SheetStep | null {
  switch (target.type) {
    case 'item':
      return 'verificacoes';
    case 'test_value':
    case 'table':
      return 'ensaios';
    case 'sheet_field':
      return target.field === 'not_tested_text' ? null : 'conclusao';
    default:
      return null;
  }
}

/** What Sync status counts of the device's audios (Story 31.6). */
export interface AudioSyncCounts {
  /** `queued` audios whose bytes the server does not hold yet. */
  to_upload: number;
  /** Audios the server holds and has not transcribed yet (`queued` and uploaded, or `transcribing`). */
  transcribing: number;
  failed: number;
}

/** Sync status's audio counts over the device's live audio rows of every relatório. */
export function audioSyncCounts(files: readonly (HoldFile & { uploaded_at?: string | null })[]): AudioSyncCounts {
  const counts: AudioSyncCounts = { to_upload: 0, transcribing: 0, failed: 0 };
  for (const file of files) {
    if (file.kind !== 'audio' || file.removed_at !== null) continue;
    const audio = file as HoldAudio & { uploaded_at?: string | null };
    if (audio.audio_status === 'failed') counts.failed += 1;
    else if (audio.audio_status === 'transcribing') counts.transcribing += 1;
    else if (audio.audio_status === 'queued') {
      if ((audio.uploaded_at ?? null) === null) counts.to_upload += 1;
      else counts.transcribing += 1;
    }
  }
  return counts;
}

/** "1 áudio aguardando envio", "2 áudios aguardando envio". */
export function audiosToUploadText(count: number): string {
  // authored (Story 31.6, listed for Bruno): Sync status's audios the server does not hold yet.
  return `${plural(count, 'áudio', 'áudios')} aguardando envio`;
}

/** Sync status's audio lines, in order: to send, transcribing, failed; only the counts above zero. */
export function audioSyncLines(counts: AudioSyncCounts): { key: keyof AudioSyncCounts; text: string }[] {
  const lines: { key: keyof AudioSyncCounts; text: string }[] = [];
  if (counts.to_upload > 0) lines.push({ key: 'to_upload', text: audiosToUploadText(counts.to_upload) });
  if (counts.transcribing > 0) lines.push({ key: 'transcribing', text: pendingAudiosText(counts.transcribing) });
  if (counts.failed > 0) lines.push({ key: 'failed', text: failedAudiosText(counts.failed) });
  return lines;
}
