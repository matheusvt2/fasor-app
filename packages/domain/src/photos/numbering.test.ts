import { describe, expect, it } from 'vitest';
import { captionSavedText, photoRemovedText, photoTileLabel, viewerLabel } from './gallery.ts';
import { numberPhotos, type NumberableFile } from './numbering.ts';

/*
 * 16.3-UNIT: a "Ler visor" display shot (`reading_kind: 'display'`) takes no number; the
 * numbered photos close around it (spec I/O matrix B1 and B5).
 */

const id = (n: number) => `019966b0-0000-7000-8000-0000000163${String(n).padStart(2, '0')}`;
const T = (h: number) => `2026-10-26T${String(h).padStart(2, '0')}:00:00.000Z`;

function file(n: number, hour: number, readingKind: string | null = null, removedAt: string | null = null): NumberableFile {
  return { id: id(n), kind: 'photo', captured_at: T(hour), local_seq: n, removed_at: removedAt, reading_kind: readingKind };
}

describe('16.3-UNIT numberPhotos skips display shots', () => {
  it('B1: p1, d1 (display), p2 in capture order number p1 = 1, p2 = 2, d1 absent', () => {
    const numbers = numberPhotos([file(1, 10), file(2, 11, 'display'), file(3, 12)]);
    expect([...numbers.entries()]).toEqual([
      [id(1), 1],
      [id(3), 2],
    ]);
    expect(numbers.has(id(2))).toBe(false);
  });

  it('other reading kinds (plate, panel, caption, nc_obs) and a null or absent kind keep their numbers', () => {
    const numbers = numberPhotos([
      file(1, 10, 'plate'),
      file(2, 11, 'panel'),
      file(3, 12, 'caption'),
      file(4, 13, 'nc_obs'),
      file(5, 14, null),
      { id: id(6), kind: 'photo', captured_at: T(15), local_seq: 6, removed_at: null },
    ]);
    expect([...numbers.values()]).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('B5: removing then restoring a display shot leaves the numbered photos unchanged', () => {
    const live = numberPhotos([file(1, 10), file(2, 11, 'display'), file(3, 12)]);
    const removed = numberPhotos([file(1, 10), file(2, 11, 'display', T(13)), file(3, 12)]);
    const restored = numberPhotos([file(1, 10), file(2, 11, 'display', null), file(3, 12)]);
    expect([...removed.entries()]).toEqual([...live.entries()]);
    expect([...restored.entries()]).toEqual([...live.entries()]);
  });

  it('a display shot only: no number at all', () => {
    expect(numberPhotos([file(1, 10, 'display')]).size).toBe(0);
  });

  it('the screen words of an unnumbered photo carry no number', () => {
    expect(photoTileLabel(null)).toBe('Foto, abrir');
    expect(photoTileLabel(null, { suggested: true })).toBe('Foto, legenda sugerida, abrir');
    expect(photoTileLabel(4)).toBe('Foto 4, abrir');
    expect(photoRemovedText(null)).toBe('Foto removida do relatório');
    expect(photoRemovedText(4)).toBe('Foto 4 removida do relatório');
    expect(viewerLabel(null, 2)).toBe('Foto');
    expect(viewerLabel(2, 2)).toBe('Foto 2 de 2');
    expect(captionSavedText(numberPhotos([file(1, 10, 'display')]).get(id(1)) ?? null)).toBe('Legenda salva');
  });
});
