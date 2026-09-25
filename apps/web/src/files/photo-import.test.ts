import { COMPANY_ID, RELATORIO_ID, USER_ID, BLOCK_1_ID } from '@app/domain/fixtures/replay-small';
import { describe, expect, it, vi } from 'vitest';
import type { PhotoCaptureInput } from '../db/file-commit.ts';
import { importPhotoFiles, isHeic, isImportableImage, type ImportDeps } from './photo-import.ts';

/*
 * 6.4-UNIT: the import path. The converter and the encoder are stand-ins (no canvas and no
 * HEIC decoder in the unit environment); the EXIF reader, the time fallbacks and the
 * commit input are the real ones.
 */

/** A JPEG head with an APP1 Exif segment: DateTimeOriginal, OffsetTimeOriginal and GPS (big-endian). */
function jpegWithExif(): Uint8Array<ArrayBuffer> {
  const tiff = new DataView(new ArrayBuffer(512));
  let heap = 300;
  const ascii = (at: number, text: string) => [...text].forEach((c, i) => tiff.setUint8(at + i, c.charCodeAt(0)));
  const entry = (at: number, tag: number, type: number, count: number, value: number) => {
    tiff.setUint16(at, tag);
    tiff.setUint16(at + 2, type);
    tiff.setUint32(at + 4, count);
    if (type === 3) tiff.setUint16(at + 8, value);
    else tiff.setUint32(at + 8, value);
  };
  const text = (value: string) => {
    const at = heap;
    ascii(at, `${value}\0`);
    heap += value.length + 2;
    return at;
  };
  const rationals = (pairs: [number, number][]) => {
    const at = heap;
    pairs.forEach(([n, d], i) => {
      tiff.setUint32(at + i * 8, n);
      tiff.setUint32(at + i * 8 + 4, d);
    });
    heap += pairs.length * 8;
    return at;
  };
  tiff.setUint16(0, 0x4d4d);
  tiff.setUint16(2, 0x2a);
  tiff.setUint32(4, 8);
  // IFD0: the Exif and GPS pointers.
  tiff.setUint16(8, 2);
  entry(10, 0x8769, 4, 1, 100);
  entry(22, 0x8825, 4, 1, 200);
  // Exif IFD.
  tiff.setUint16(100, 2);
  entry(102, 0x9003, 2, 20, text('2026:09:06 08:12:30'));
  entry(114, 0x9011, 2, 7, text('-03:00'));
  // GPS IFD: 23° 33' 1.8" S, 46° 38' 0" W.
  tiff.setUint16(200, 4);
  entry(202, 0x0001, 2, 2, 0x53000000);
  entry(214, 0x0002, 5, 3, rationals([[23, 1], [33, 1], [18, 10]]));
  entry(226, 0x0003, 2, 2, 0x57000000);
  entry(238, 0x0004, 5, 3, rationals([[46, 1], [38, 1], [0, 1]]));
  const body = new Uint8Array(tiff.buffer, 0, heap);
  const header = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
  const length = 2 + header.length + body.length;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 0xff, ...header, ...body, 0xff, 0xda, 0x00, 0x02]);
}

let counter = 0;

function deps(overrides: Partial<ImportDeps> = {}) {
  const committed: PhotoCaptureInput[] = [];
  const encode = vi.fn(async (source: Blob) => ({ original: source, thumb: source, sha256: 'ab'.repeat(32) }));
  const value: ImportDeps = {
    companyId: COMPANY_ID,
    relatorioId: RELATORIO_ID,
    actorId: USER_ID,
    newId: () => `019966b0-0067-7000-8000-${String(++counter).padStart(12, '0')}`,
    now: () => new Date('2026-09-25T12:00:00.000Z'),
    encode,
    commit: async (input) => {
      committed.push(input);
    },
    ...overrides,
  };
  return { value, committed, encode };
}

const target = { blockId: BLOCK_1_ID, itemKey: null, caption: 'Detalhe da chave seccionadora do Cubículo Enel' };

describe('6.4-UNIT-001 importPhotoFiles', () => {
  it('recognises pictures by type or extension, HEIC included', () => {
    expect(isImportableImage({ name: 'a.jpg', type: '' })).toBe(true);
    expect(isImportableImage({ name: 'IMG_1.HEIC', type: '' })).toBe(true);
    expect(isImportableImage({ name: 'scan', type: 'image/png' })).toBe(true);
    expect(isImportableImage({ name: 'documento.pdf', type: 'application/pdf' })).toBe(false);
    expect(isHeic({ name: 'x', type: 'image/heif' })).toBe(true);
    expect(isHeic({ name: 'x.jpg', type: 'image/jpeg' })).toBe(false);
  });

  it('keeps the EXIF time and GPS (source exif), the target sheet and caption', async () => {
    const { value, committed } = deps();
    const file = new File([jpegWithExif()], 'com-exif.jpg', { type: 'image/jpeg', lastModified: Date.parse('2026-09-20T10:00:00.000Z') });
    const result = await importPhotoFiles([file], target, value);
    expect(result).toEqual({ saved: [committed[0]!.fileId], skipped: 0 });
    expect(committed[0]).toMatchObject({
      blockId: BLOCK_1_ID,
      itemKey: null,
      caption: target.caption,
      capturedAt: '2026-09-06T11:12:30.000Z',
      tzOffset: -180,
      coords: { accuracy_m: null, source: 'exif' },
    });
    expect(committed[0]!.coords!.lat).toBeCloseTo(-23.5505, 4);
    expect(committed[0]!.coords!.lng).toBeCloseTo(-46.6333, 4);
  });

  it('no EXIF: the file date, else the device clock; no coords', async () => {
    const { value, committed } = deps();
    const dated = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'sem-exif.jpg', { type: 'image/jpeg', lastModified: Date.parse('2026-09-20T10:00:00.000Z') });
    const undated = new File([new Uint8Array([0x89, 0x50])], 'tela.png', { type: 'image/png', lastModified: 0 });
    await importPhotoFiles([dated, undated], { blockId: null, itemKey: null, caption: null }, value);
    expect(committed.map((input) => input.capturedAt)).toEqual(['2026-09-20T10:00:00.000Z', '2026-09-25T12:00:00.000Z']);
    expect(committed.map((input) => input.coords)).toEqual([null, null]);
    expect(committed.map((input) => input.blockId)).toEqual([null, null]);
  });

  it('converts a HEIC before the encode; a failed conversion and a PDF are skipped and counted', async () => {
    const converted = new Blob(['jpeg'], { type: 'image/jpeg' });
    const convertHeic = vi.fn().mockResolvedValueOnce(converted).mockRejectedValueOnce(new Error('bad heic'));
    const { value, committed, encode } = deps({ convertHeic });
    const heic = new File(['heic-1'], 'IMG_0001.HEIC', { type: '' });
    const broken = new File(['heic-2'], 'IMG_0002.heic', { type: 'image/heic' });
    const pdf = new File(['%PDF'], 'documento.pdf', { type: 'application/pdf' });
    const result = await importPhotoFiles([heic, broken, pdf], target, value);
    expect(convertHeic).toHaveBeenCalledTimes(2);
    expect(encode).toHaveBeenCalledWith(converted);
    expect(result.saved).toHaveLength(1);
    expect(result.skipped).toBe(2);
    expect(committed).toHaveLength(1);
  });
});
