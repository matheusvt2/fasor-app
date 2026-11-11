import { describe, expect, it } from 'vitest';
import {
  cameraSavingText,
  burstCountText,
  cameraZoomText,
  photosPendingText,
  photoUploadState,
  sheetPhotosHeading,
  storageLowBannerText,
  storageRefusedBannerText,
  thermalPhotoText,
  uploadPillText,
} from './text.ts';

const MB = 1024 * 1024;

describe('6.1-UNIT-005 burstCountText', () => {
  it('counts the burst with agreement', () => {
    expect(burstCountText(1)).toBe('1 foto nesta rajada · salva no relatório com a legenda do contexto');
    expect(burstCountText(3)).toBe('3 fotos nesta rajada · salvas no relatório com a legenda do contexto');
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
  it('review F-09: says the device refused the photo, with no free-space figure', () => {
    expect(storageRefusedBannerText()).toBe('Este aparelho recusou guardar a foto. Sincronize para liberar espaço.');
    expect(storageRefusedBannerText()).not.toMatch(/MB/);
  });
});

describe('review F-09 burstCountText while a shot is held', () => {
  it('never says "salva" for a refused shot held in memory', () => {
    expect(burstCountText(1, true)).toBe('1 foto nesta rajada · aguardando espaço neste aparelho');
    // The earlier shots of the burst were saved: only the held one waits.
    expect(burstCountText(3, true)).toBe('3 fotos nesta rajada · 1 aguardando espaço neste aparelho');
    expect(burstCountText(1, true)).not.toMatch(/salva/);
    expect(burstCountText(1, false)).toBe(burstCountText(1));
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

describe('R8CAP-UNIT the camera saving line (review 2026-10-08, DB-4)', () => {
  it('names one shot in the singular, more in the plural, and nothing with no shot', () => {
    expect(cameraSavingText(0)).toBeNull();
    expect(cameraSavingText(1)).toBe('Salvando a foto…');
    expect(cameraSavingText(2)).toBe('Salvando as fotos…');
    expect(cameraSavingText(12)).toBe('Salvando as fotos…');
  });
});

describe('24.9-UNIT F11 (review of e24b): "Foto térmica" counts the live shots of the sheet taken through it', () => {
  const block = '019966b0-0300-7000-8000-000000000001';
  const caption = 'Termografia · TR-01';
  const shot = (over: Record<string, unknown> = {}) => ({ kind: 'photo', removed_at: null, block_id: block, item_key: null, caption, ...over }) as never;
  it('two shots count; a removed shot, an item photo, another caption, another block and a document never do', () => {
    const files = [
      shot(),
      shot(),
      shot({ removed_at: '2026-11-10T12:00:00.000Z' }),
      shot({ item_key: 'estado_geral' }),
      shot({ caption: 'Placa · TR-01' }),
      shot({ block_id: '019966b0-0300-7000-8000-000000000002' }),
      shot({ kind: 'document' }),
    ];
    expect(thermalPhotoText(files, block, caption)).toBe('Foto térmica · 2');
    expect(thermalPhotoText([], block, caption)).toBe('Foto térmica');
    expect(thermalPhotoText(files, block, null)).toBe('Foto térmica');
  });
});
