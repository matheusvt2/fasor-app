import { describe, expect, it } from 'vitest';
import {
  burstCountText,
  cameraZoomText,
  photosPendingText,
  photoUploadState,
  sheetPhotosHeading,
  storageLowBannerText,
  storageRefusedBannerText,
  uploadPillText,
} from './text.ts';

const MB = 1024 * 1024;

describe('6.1-UNIT-005 burstCountText', () => {
  it('counts the burst with agreement', () => {
    expect(burstCountText(1)).toBe('1 foto nesta rajada · salva neste aparelho com a legenda do contexto');
    expect(burstCountText(3)).toBe('3 fotos nesta rajada · salvas neste aparelho com a legenda do contexto');
  });
});

describe('6.2-UNIT-004 upload state and pill', () => {
  it('reads the server first, then a local error, else waiting', () => {
    expect(photoUploadState({ uploaded_at: '2026-09-06T11:00:00.000Z', localError: { state: 'dead' } })).toBe('uploaded');
    expect(photoUploadState({ uploaded_at: null, localError: { state: 'dead', code: 'file_too_large' } })).toBe('error');
    expect(photoUploadState({ uploaded_at: null, localError: { state: 'failed' } })).toBe('error');
    expect(photoUploadState({ uploaded_at: null, localError: null })).toBe('pending');
    expect(photoUploadState({ uploaded_at: null, localError: undefined })).toBe('pending');
  });

  it('gives the pill its words, and none once uploaded', () => {
    expect(uploadPillText('pending')).toBe('Aguardando envio');
    expect(uploadPillText('error')).toBe('Erro — Tentar novamente');
    expect(uploadPillText('uploaded')).toBeNull();
  });

  it('counts the photos waiting', () => {
    expect(photosPendingText(1)).toBe('1 foto aguardando envio');
    expect(photosPendingText(3)).toBe('3 fotos aguardando envio');
  });
});

describe('6.2-UNIT-005 storageLowBannerText', () => {
  it('floors the free space to whole MB', () => {
    expect(storageLowBannerText({ usage: 1_000 * MB, quota: 1_180 * MB + 900_000 })).toBe(
      'Pouco espaço neste aparelho (180 MB). Sincronize para liberar.',
    );
    expect(storageLowBannerText({ usage: 2_000 * MB, quota: 1_000 * MB })).toBe('Pouco espaço neste aparelho (0 MB). Sincronize para liberar.');
  });
});

describe('11.11-UNIT-002 sheetPhotosHeading', () => {
  it('reads "Fotos da ficha (n)" (`60-ficha.html` `#ficha-h-fotos-dj`)', () => {
    expect(sheetPhotosHeading(1)).toBe('Fotos da ficha (1)');
    expect(sheetPhotosHeading(3)).toBe('Fotos da ficha (3)');
  });
});

describe('13.6-UNIT-001 storageRefusedBannerText', () => {
  it('names the free space when there is a reading, and drops the number without one', () => {
    expect(storageRefusedBannerText({ usage: 1_000 * MB, quota: 1_180 * MB })).toBe('Pouco espaço neste aparelho (180 MB). Sincronize para liberar.');
    expect(storageRefusedBannerText(null)).toBe('Pouco espaço neste aparelho. Sincronize para liberar.');
  });
});

describe('13.2-UNIT-001 cameraZoomText', () => {
  it('reads one decimal with the pt-BR comma', () => {
    expect(cameraZoomText(1)).toBe('1,0×');
    expect(cameraZoomText(2.5)).toBe('2,5×');
    expect(cameraZoomText(3.04)).toBe('3,0×');
    expect(cameraZoomText(Number.NaN)).toBe('1,0×');
  });
});
