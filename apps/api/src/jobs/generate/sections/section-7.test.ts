import type { RelatorioSnapshot } from '@app/domain';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { loadPhotoImages } from './section-7.ts';

/*
 * Review 2026-09-30, A-4: `loadPhotoImages` over an injected reader. A photo the server does
 * not hold (`undefined`) and bytes sharp cannot read are left out, so section 7 prints the
 * placeholder and the photo keeps its number (epics.md 2026-09-28, Story 7.2); a read that
 * THROWS (an S3 error, a timeout, a pool error) rejects the load, so the job fails with
 * `render_failed` instead of issuing a revision without the photo.
 */

function photo(id: string, localSeq: number) {
  return { id, kind: 'photo', removed_at: null, captured_at: '2026-09-06T17:32:00.000Z', local_seq: localSeq };
}

const snapshot = (ids: string[]) => ({ files: ids.map((id, i) => photo(id, i + 1)) }) as unknown as Pick<RelatorioSnapshot, 'files'>;

describe('A-4 loadPhotoImages', () => {
  it('leaves out a photo the server does not hold and bytes sharp cannot read, and never throws for them', async () => {
    const jpeg = await sharp({ create: { width: 32, height: 24, channels: 3, background: '#336699' } }).jpeg().toBuffer();
    const stored = new Map<string, Buffer>([
      ['good', jpeg],
      ['garbage', Buffer.from('not an image')],
    ]);
    const images = await loadPhotoImages(snapshot(['good', 'absent', 'garbage']), async (id) => stored.get(id));
    expect([...images.keys()]).toEqual(['good']);
  });

  it('rejects when a read throws, whatever the other photos did', async () => {
    const jpeg = await sharp({ create: { width: 32, height: 24, channels: 3, background: '#336699' } }).jpeg().toBuffer();
    const ids = Array.from({ length: 12 }, (_, i) => `photo-${String(i).padStart(2, '0')}`);
    const reads: string[] = [];
    const load = loadPhotoImages(snapshot(ids), async (id) => {
      reads.push(id);
      if (id === 'photo-03') throw new Error('S3 request timed out');
      return jpeg;
    });
    await expect(load).rejects.toThrow('S3 request timed out');
    // The readers stop at their next photo once one failed: not every photo is read.
    expect(reads.length).toBeLessThan(ids.length);
  });
});
