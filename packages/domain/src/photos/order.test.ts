import { describe, expect, it } from 'vitest';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { numberPhotos } from './numbering.ts';
import { comparePhotos, livePhotos, photosOfBlock } from './order.ts';

/*
 * 6.3-UNIT: capture order and the provisional numbers (spec I/O matrix rows "Numbering"
 * and "Same instant + seq").
 */

const id = (n: number) => `019966b0-0000-7000-8000-0000000002${String(n).padStart(2, '0')}`;

function photo(n: number, capturedAt: string, localSeq: number, removedAt: string | null = null) {
  return { id: id(n), kind: 'photo' as const, captured_at: capturedAt, local_seq: localSeq, removed_at: removedAt };
}

const T0 = '2026-09-06T10:00:00.000Z';
const T1 = '2026-09-06T11:00:00.000Z';
const T2 = '2026-09-06T12:00:00.000Z';

describe('6.3-UNIT-001 comparePhotos / numberPhotos', () => {
  it('numbers live photos 1..n by captured_at, then local_seq; a removed photo has no number', () => {
    const files = [photo(1, T2, 5), photo(2, T1, 9), photo(3, T1, 3), photo(4, T0, 1, '2026-09-07T00:00:00.000Z')];
    const numbers = numberPhotos(files);
    expect(numbers.get(id(3))).toBe(1);
    expect(numbers.get(id(2))).toBe(2);
    expect(numbers.get(id(1))).toBe(3);
    expect(numbers.has(id(4))).toBe(false);
    expect(numbers.size).toBe(3);
  });

  it('same instant and same local_seq: the lower UUIDv7 id first', () => {
    const a = photo(7, T1, 2);
    const b = photo(6, T1, 2);
    expect(comparePhotos(a, b)).toBeGreaterThan(0);
    expect([a, b].sort(comparePhotos).map((row) => row.id)).toEqual([id(6), id(7)]);
  });

  it('compares instants, not strings (an offset timestamp sorts by its UTC time)', () => {
    // As strings "…T10:00…" sorts first; as instants it is 13:00 UTC, after 12:00 UTC.
    const offset = photo(1, '2026-09-06T10:00:00-03:00', 1);
    const utc = photo(2, '2026-09-06T12:00:00.000Z', 9);
    expect(comparePhotos(offset, utc)).toBeGreaterThan(0);
  });

  it('livePhotos keeps the photos of a snapshot, drops other files, in capture order', () => {
    const files = [photo(1, T2, 1), { id: id(9), kind: 'logo', removed_at: null }, photo(2, T0, 1)];
    const live = livePhotos({ files } as unknown as RelatorioSnapshot);
    expect(live.map((row) => row.id)).toEqual([id(2), id(1)]);
  });
});

describe('11.11-UNIT-001 photosOfBlock', () => {
  const BLOCK = '019966b0-0000-7000-8000-000000000301';
  const OTHER = '019966b0-0000-7000-8000-000000000302';
  const onBlock = (n: number, capturedAt: string, localSeq: number, blockId: string | null, extra: Record<string, unknown> = {}) => ({
    ...photo(n, capturedAt, localSeq),
    block_id: blockId,
    item_key: null,
    ...extra,
  });

  it('keeps the live photos of this block only (plate, item and sheet photos), in capture order, with the relatório numbers', () => {
    const files = [
      onBlock(1, T2, 4, BLOCK),
      onBlock(2, T0, 1, BLOCK, { reading_kind: 'plate' }),
      onBlock(3, T1, 2, OTHER),
      onBlock(4, T1, 3, BLOCK, { item_key: 'contatos' }),
      onBlock(5, T1, 5, null),
      { ...onBlock(6, T0, 0, BLOCK), removed_at: '2026-09-07T00:00:00.000Z' },
      { id: id(9), kind: 'logo', removed_at: null, block_id: BLOCK },
    ];
    const snapshot = { files } as unknown as RelatorioSnapshot;
    const strip = photosOfBlock(snapshot, BLOCK);
    expect(strip.map((row) => row.id)).toEqual([id(2), id(4), id(1)]);
    const numbers = numberPhotos(snapshot.files);
    expect(strip.map((row) => numbers.get(row.id))).toEqual([1, 3, 5]);
  });

  it('is empty for a block with no live photo', () => {
    const files = [onBlock(1, T0, 1, OTHER), { ...onBlock(2, T0, 2, BLOCK), removed_at: '2026-09-07T00:00:00.000Z' }];
    expect(photosOfBlock({ files } as unknown as RelatorioSnapshot, BLOCK)).toEqual([]);
  });
});
