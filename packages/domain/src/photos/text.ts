import type { StorageReading } from '../checks/storage.ts';
import { plural } from '../text/plural.ts';

/*
 * Stories 6.1 and 6.2: every count, state word and banner sentence of the photo capture
 * and the upload queue (AGENTS.md "Derived text goes in packages/domain").
 */

/** The camera view's status line during a burst (`70-fotos.html` `.cam-count`). */
export function burstCountText(n: number): string {
  return n === 1
    ? '1 foto nesta rajada · salva neste aparelho com a legenda do contexto'
    : `${n} fotos nesta rajada · salvas neste aparelho com a legenda do contexto`;
}

/** The gallery header's count (Story 6.3): "3 fotos aguardando envio". */
export function photosPendingText(n: number): string {
  return `${plural(n, 'foto', 'fotos')} aguardando envio`;
}

/** Section 7's count (the Sumário row): "82 fotos", "1 foto", "Nenhuma foto". */
export function photoCountText(n: number): string {
  return n === 0 ? 'Nenhuma foto' : plural(n, 'foto', 'fotos');
}

/** Section 7's pre-issue row: "1 sem legenda", "3 sem legenda". */
export function photosUncaptionedText(n: number): string {
  return `${n} sem legenda`;
}

/** Section 7's pre-issue row: "3 aguardando envio". */
export function photosAwaitingText(n: number): string {
  return `${n} aguardando envio`;
}

/** Where one photo's bytes stand: on the server, waiting, or refused/failed. */
export type PhotoUploadState = 'uploaded' | 'pending' | 'error';

/**
 * The server's `uploaded_at` wins; otherwise a local upload error (a refusal, or retries
 * exhausted) reads as `error`, and anything else is still waiting.
 */
export function photoUploadState(input: { uploaded_at: string | null; localError: unknown }): PhotoUploadState {
  if (input.uploaded_at !== null) return 'uploaded';
  if (input.localError !== null && input.localError !== undefined) return 'error';
  return 'pending';
}

/** The upload pill's words; null once the server holds the photo (no pill). */
export function uploadPillText(state: PhotoUploadState): string | null {
  if (state === 'pending') return 'Aguardando envio';
  if (state === 'error') return 'Erro — Tentar novamente';
  return null;
}

const MIB = 1024 * 1024;

/** The global low-storage banner: "Pouco espaço neste aparelho (180 MB). Sincronize para liberar." */
export function storageLowBannerText(reading: StorageReading): string {
  const free = Math.max(0, reading.quota - reading.usage);
  return `Pouco espaço neste aparelho (${Math.floor(free / MIB)} MB). Sincronize para liberar.`;
}
