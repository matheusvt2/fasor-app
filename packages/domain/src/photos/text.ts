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

/** Story 11.11 (`60-ficha.html` `#ficha-h-fotos-dj`): the sheet's photo strip heading, "Fotos da ficha (3)". */
export function sheetPhotosHeading(n: number): string {
  return `Fotos da ficha (${n})`;
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

/**
 * Story 13.6 (CAP-4): the low-storage banner while a shot is refused, shown whatever the last
 * reading said. With a reading it is `storageLowBannerText`; without one (the browser gave no
 * estimate) the same sentence without the number. Authored.
 */
export function storageRefusedBannerText(reading: StorageReading | null): string {
  return reading === null ? 'Pouco espaço neste aparelho. Sincronize para liberar.' : storageLowBannerText(reading);
}

/** Story 13.2 (CAP-2): the camera's zoom readout, "1,0×", "2,5×" (one decimal, pt-BR comma). Authored. */
export function cameraZoomText(zoom: number): string {
  const value = Number.isFinite(zoom) ? zoom : 1;
  return `${value.toFixed(1).replace('.', ',')}×`;
}
