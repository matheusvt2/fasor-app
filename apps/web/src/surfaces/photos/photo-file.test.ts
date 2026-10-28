import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppDatabase, FileBlobRow } from '../../db/schema.ts';
import { photoSaveFile, savePhotoToDevice } from './photo-file.ts';

/*
 * Story 17.7 (M9-M11): "Salvar no aparelho" hands this device's original, else the server's,
 * to the share sheet, else saves it, named by the photo's stamp. `navigator.share`,
 * `navigator.canShare` and `URL.createObjectURL` are stubbed as in `revision-file.test.ts`;
 * the anchor click is recorded with the name it would save. The device's blob store is an
 * in-memory map behind `readLocalBlob` (jsdom's IndexedDB stand-in does not keep a Blob).
 */

const blobs = vi.hoisted(() => new Map<string, FileBlobRow>());
vi.mock('../../db/file-store.ts', () => ({ readLocalBlob: async (_db: unknown, id: string) => blobs.get(id) ?? null }));

const PHOTO = '019966c1-0000-7000-8000-0000000000f1';
const CAPTURED = '2026-09-06T17:32:05.000Z';
const NAME = 'foto-2026-09-06-143205.jpg';

const db = {} as AppDatabase;
let saved: { name: string }[];

function putBlob(variant: FileBlobRow['variant'], bytes: string): void {
  blobs.set(PHOTO, { id: PHOTO, variant, blob: new Blob([bytes], { type: 'image/jpeg' }), acked: false, created_at: CAPTURED });
}

function installShare(canShare: boolean, share = vi.fn<(data: ShareData) => Promise<void>>(async () => {})) {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true });
  Object.defineProperty(navigator, 'canShare', { value: vi.fn(() => canShare), configurable: true, writable: true });
  return share;
}

beforeEach(() => {
  blobs.clear();
  saved = [];
  URL.createObjectURL = vi.fn(() => 'blob:photo-file');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    saved.push({ name: this.download });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (navigator as { share?: unknown }).share;
  delete (navigator as { canShare?: unknown }).canShare;
});

describe('17.7-UNIT photoSaveFile: which original, and the file it makes', () => {
  it("takes this device's original without asking the server, named by the stamp, typed image/jpeg", async () => {
    putBlob('original', 'local-jpeg');
    const fetchFile = vi.fn(async () => new Blob(['server']));
    const file = await photoSaveFile(db, { id: PHOTO, captured_at: CAPTURED, uploaded_at: null }, fetchFile);
    expect(file).not.toBeNull();
    expect(file!.name).toBe(NAME);
    expect(file!.type).toBe('image/jpeg');
    expect(await file!.text()).toBe('local-jpeg');
    expect(fetchFile).not.toHaveBeenCalled();
  });

  it("an uploaded photo with only a crop copy here fetches the server's original", async () => {
    putBlob('crop', 'crop-copy');
    const fetchFile = vi.fn(async () => new Blob(['server-original']));
    const file = await photoSaveFile(db, { id: PHOTO, captured_at: CAPTURED, uploaded_at: '2026-09-06T18:00:00.000Z' }, fetchFile);
    expect(fetchFile).toHaveBeenCalledExactlyOnceWith(PHOTO, 'original');
    expect(await file!.text()).toBe('server-original');
    expect(file!.name).toBe(NAME);
  });

  it('is null when the original is neither here nor uploaded (no fetch), and rejects when the fetch fails', async () => {
    const fetchFile = vi.fn(async () => Promise.reject(new Error('offline')));
    expect(await photoSaveFile(db, { id: PHOTO, captured_at: CAPTURED, uploaded_at: null }, fetchFile)).toBeNull();
    expect(fetchFile).not.toHaveBeenCalled();
    await expect(photoSaveFile(db, { id: PHOTO, captured_at: CAPTURED, uploaded_at: '2026-09-06T18:00:00.000Z' }, fetchFile)).rejects.toThrow('offline');
  });
});

describe('17.7-UNIT savePhotoToDevice: share where files share, else download', () => {
  const file = () => new File(['jpeg'], NAME, { type: 'image/jpeg' });

  it('shares the JPEG through the sheet when canShare takes files, and saves nothing', async () => {
    const share = installShare(true);
    const photo = file();
    expect(await savePhotoToDevice(photo, 'Foto do relatório')).toBe('shared');
    expect(share).toHaveBeenCalledExactlyOnceWith({ files: [photo], title: 'Foto do relatório' });
    expect(saved).toEqual([]);
  });

  it('a dismissed sheet is silent: cancelled, nothing saved', async () => {
    installShare(true, vi.fn(async () => Promise.reject(new DOMException('dismissed', 'AbortError'))));
    expect(await savePhotoToDevice(file(), 'Foto do relatório')).toBe('cancelled');
    expect(saved).toEqual([]);
  });

  it('a sheet that refuses the file saves it instead', async () => {
    installShare(true, vi.fn(async () => Promise.reject(new DOMException('refused', 'NotAllowedError'))));
    expect(await savePhotoToDevice(file(), 'Foto do relatório')).toBe('downloaded');
    expect(saved).toEqual([{ name: NAME }]);
  });

  it('downloads the JPEG by its name without a share sheet, or when canShare refuses files', async () => {
    expect(await savePhotoToDevice(file(), 'Foto do relatório')).toBe('downloaded');
    const share = installShare(false);
    expect(await savePhotoToDevice(file(), 'Foto do relatório')).toBe('downloaded');
    expect(share).not.toHaveBeenCalled();
    expect(saved).toEqual([{ name: NAME }, { name: NAME }]);
  });
});
