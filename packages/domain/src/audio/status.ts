import type { AudioStatus, AudioTarget } from '../schemas/entities.ts';
import { plural } from '../text/plural.ts';
import { audioBlockId } from './target.ts';

/*
 * Story 31.1 (AD-30): an audio's status words and the counts every reader shows: the audios still
 * on their way (`queued`, `transcribing`) hold a ficha and the emission (Story 31.6), the ones that
 * failed three times wait for "Tentar de novo" or "Dispensar"; a `done` or `dismissed` one holds
 * nothing. Nothing in `apps/*` derives a status word or a count of its own.
 */

// authored (Story 31.1, listed for Bruno)
const STATUS_WORDS: Readonly<Record<AudioStatus, string>> = {
  queued: 'Aguardando envio',
  transcribing: 'Transcrevendo',
  done: 'Transcrito',
  failed: 'Falhou',
  dismissed: 'Dispensado',
};

/** The word of an audio's status. */
export function audioStatusLabel(status: AudioStatus): string {
  return STATUS_WORDS[status];
}

/** A status that holds the ficha and the emission: the audio is still on its way to text. */
export function isPendingAudioStatus(status: AudioStatus): boolean {
  return status === 'queued' || status === 'transcribing';
}

/** What a count reads of a file: any `file` row or snapshot file. */
interface CountedFile {
  kind: string;
  removed_at: string | null;
}

interface CountedAudio extends CountedFile {
  kind: 'audio';
  audio_status: AudioStatus;
  audio_target: AudioTarget;
}

/** The scope of a count: the whole relatório, or one ficha (the block an audio's target names). */
export interface AudioCountScope {
  blockId?: string;
}

function liveAudios(files: readonly CountedFile[], scope: AudioCountScope): CountedAudio[] {
  return files.filter((file): file is CountedAudio => {
    if (file.kind !== 'audio' || file.removed_at !== null) return false;
    return scope.blockId === undefined || audioBlockId((file as CountedAudio).audio_target) === scope.blockId;
  });
}

/** How many audios are `queued` or `transcribing` (of one ficha when `scope.blockId` is given). */
export function pendingAudios(files: readonly CountedFile[], scope: AudioCountScope = {}): number {
  return liveAudios(files, scope).filter((audio) => isPendingAudioStatus(audio.audio_status)).length;
}

/** How many audios are `failed` (of one ficha when `scope.blockId` is given). */
export function failedAudios(files: readonly CountedFile[], scope: AudioCountScope = {}): number {
  return liveAudios(files, scope).filter((audio) => audio.audio_status === 'failed').length;
}

/** "1 áudio aguardando transcrição", "2 áudios aguardando transcrição". */
export function pendingAudiosText(count: number): string {
  // authored (Story 31.1, listed for Bruno)
  return `${plural(count, 'áudio', 'áudios')} aguardando transcrição`;
}

/** "1 áudio não transcrito", "2 áudios não transcritos". */
export function failedAudiosText(count: number): string {
  // authored (Story 31.1, listed for Bruno)
  return plural(count, 'áudio não transcrito', 'áudios não transcritos');
}
