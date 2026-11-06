import { describe, expect, it, vi } from 'vitest';
import type { ImportResult, ImportTarget } from '../../files/photo-import.ts';
import { attachPicked, importTargetOf } from './attach-file.tsx';
import type { CaptureTarget } from './use-photo-capture.ts';

/*
 * Story 22.1: the picked-file path of "Anexar arquivo". The file goes through the import path
 * with the opener's own target (its reading and minted id included), only the first file of a
 * pick, and the opener hears the save (the plate retake cancels the older plates then).
 */

const BLOCK = '019966b0-2201-7000-8000-000000000001';
const PHOTO = '019966b0-2201-7000-8000-000000000002';
const plate: CaptureTarget = {
  blockId: BLOCK,
  itemKey: null,
  caption: 'Placa de identificação',
  reading: { kind: 'plate', target: { block_id: BLOCK, block_type: 'transformador_forca' } },
  fileId: PHOTO,
};
const jpeg = (name: string) => new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: 'image/jpeg' });

describe('22.1 attach file', () => {
  it('maps a shot target to the import target: sheet, item, caption, reading and minted id; a local only when set', () => {
    expect(importTargetOf(plate)).toEqual({ blockId: BLOCK, itemKey: null, caption: 'Placa de identificação', reading: plate.reading, fileId: PHOTO });
    expect(importTargetOf({ blockId: null, itemKey: 'x', locationId: 'loc', caption: null })).toEqual({ blockId: null, itemKey: 'x', locationId: 'loc', caption: null });
    expect(importTargetOf({ blockId: BLOCK, itemKey: null, caption: null })).toEqual({ blockId: BLOCK, itemKey: null, caption: null });
  });

  it('imports the first picked file alone with the opener\'s target, and tells the opener once it is saved', async () => {
    const importFiles = vi.fn(async (files: readonly File[], target: ImportTarget): Promise<ImportResult> => ({ saved: [target.fileId ?? 'x'], skipped: 0 }));
    const onSaved = vi.fn();
    const first = jpeg('placa.jpg');
    const result = await attachPicked([first, jpeg('outra.jpg')], plate, importFiles, onSaved);
    expect(importFiles).toHaveBeenCalledTimes(1);
    expect(importFiles.mock.calls[0]![0]).toEqual([first]);
    expect(importFiles.mock.calls[0]![1]).toEqual(importTargetOf(plate));
    expect(result).toEqual({ saved: [PHOTO], skipped: 0 });
    expect(onSaved).toHaveBeenCalledWith(plate);
  });

  it('a file the import skips (not a picture) or an import that could not run saves nothing and tells nobody', async () => {
    const onSaved = vi.fn();
    await attachPicked([new File(['%PDF'], 'documento.pdf', { type: 'application/pdf' })], plate, async () => ({ saved: [], skipped: 1 }), onSaved);
    await attachPicked([jpeg('placa.jpg')], plate, async () => null, onSaved);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('an empty pick (the picker cancelled) imports nothing', async () => {
    const importFiles = vi.fn(async () => ({ saved: [], skipped: 0 }));
    expect(await attachPicked([], plate, importFiles)).toBeNull();
    expect(importFiles).not.toHaveBeenCalled();
  });
});
