import { describe, expect, it } from 'vitest';
import { normalizeBox, unionBox } from './boxes.ts';
import { plateReadingTarget, plateReadingTargetSchema, readingSingletonKey } from './target.ts';

describe('8.4-UNIT boxes', () => {
  it('unions pixel boxes', () => {
    expect(unionBox([])).toBeNull();
    expect(unionBox([[900, 612, 972, 641]])).toEqual([900, 612, 972, 641]);
    expect(
      unionBox([
        [984, 612, 1058, 641],
        [900, 610, 972, 645],
      ]),
    ).toEqual([900, 610, 1058, 645]);
  });

  it('normalizes over the image, rounded to 4 decimals and clamped to [0, 1]', () => {
    expect(normalizeBox([899, 192, 1011, 221], { width: 1600, height: 1100 })).toEqual([0.5619, 0.1745, 0.6319, 0.2009]);
    expect(normalizeBox([0, 0, 100, 50], { width: 100, height: 50 })).toEqual([0, 0, 1, 1]);
    expect(normalizeBox([-4, 10, 130, 60], { width: 100, height: 50 })).toEqual([0, 0.2, 1, 1]);
    expect(normalizeBox([1, 1, 2, 2], { width: 3, height: 7 })).toEqual([0.3333, 0.1429, 0.6667, 0.2857]);
  });
});

describe('8.4-UNIT plate target and singleton key', () => {
  const blockId = '019966b0-0000-7000-8000-00000000003c';

  it('builds and parses a plate target, keeping extra keys', () => {
    const target = plateReadingTarget(blockId, 'transformador_forca');
    expect(target).toEqual({ block_id: blockId, block_type: 'transformador_forca' });
    expect(plateReadingTargetSchema.parse({ ...target, note: 'x' })).toEqual({ ...target, note: 'x' });
    expect(plateReadingTargetSchema.safeParse({ block_id: 'nope', block_type: 'tc' }).success).toBe(false);
    expect(plateReadingTargetSchema.safeParse(null).success).toBe(false);
    expect(plateReadingTargetSchema.safeParse({ block_id: blockId }).success).toBe(false);
  });

  it('keys a job by photo and kind', () => {
    expect(readingSingletonKey(blockId, 'plate')).toBe(`${blockId}:plate`);
  });
});
