// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodePhoto, ORIGINAL_MAX_PX, ORIGINAL_QUALITY, THUMB_MAX_PX, THUMB_QUALITY } from './photo-encode.ts';

/*
 * W-24 (full review 2026-09-30): one shot is drawn once at the original's size; the thumb is
 * drawn from that resized canvas, never from the full-size picture again, at the size fitted
 * to the picture's own (as before).
 */

interface Drawn {
  canvas: FakeCanvas;
  source: unknown;
  width: number;
  height: number;
}

const draws: Drawn[] = [];

class FakeCanvas {
  constructor(
    public width: number,
    public height: number,
  ) {}
  getContext() {
    return {
      drawImage: (source: unknown, _x: number, _y: number, width: number, height: number) => {
        draws.push({ canvas: this, source, width, height });
      },
    };
  }
  async convertToBlob(options: { type: string; quality: number }): Promise<Blob> {
    return new Blob([`${this.width}x${this.height}@${options.quality}`], { type: options.type });
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  draws.length = 0;
});

describe('W-24 encodePhoto', () => {
  it('draws the thumb from the resized canvas, at the size fitted to the picture', async () => {
    vi.stubGlobal('OffscreenCanvas', FakeCanvas);
    const frame = { width: 4000, height: 3000, close: vi.fn() } as unknown as ImageBitmap;
    const encoded = await encodePhoto(frame);

    expect(draws).toHaveLength(2);
    const [large, thumb] = draws;
    expect(large).toMatchObject({ source: frame, width: ORIGINAL_MAX_PX, height: 1920 });
    // The thumb reads the large canvas, never the 12 MP frame.
    expect(thumb!.source).toBe(large!.canvas);
    expect(thumb).toMatchObject({ width: THUMB_MAX_PX, height: 384 });
    expect(await encoded.original.text()).toBe(`2560x1920@${ORIGINAL_QUALITY}`);
    expect(await encoded.thumb.text()).toBe(`512x384@${THUMB_QUALITY}`);
    expect(encoded.sha256).toMatch(/^[0-9a-f]{64}$/);
    // A frame the caller passed stays the caller's.
    expect((frame as unknown as { close: ReturnType<typeof vi.fn> }).close).not.toHaveBeenCalled();
  });

  it('keeps the thumb size of an odd aspect fitted to the picture itself', async () => {
    vi.stubGlobal('OffscreenCanvas', FakeCanvas);
    const frame = { width: 3001, height: 4999, close: vi.fn() } as unknown as ImageBitmap;
    await encodePhoto(frame);
    // fitWithin(3001, 4999, 512) directly: 307 x 512 (never re-fitted from the 1537 x 2560 canvas).
    expect(draws[1]).toMatchObject({ width: 307, height: 512 });
  });
});

describe('13.1-UNIT-001 the encode cap after the full-resolution capture', () => {
  it('keeps 2560 px / 0.85 (narrowing of 2026-10-07): a 3840x2160 frame is stored at 2560x1440', async () => {
    expect(ORIGINAL_MAX_PX).toBe(2560);
    expect(ORIGINAL_QUALITY).toBe(0.85);
    vi.stubGlobal('OffscreenCanvas', FakeCanvas);
    const frame = { width: 3840, height: 2160, close: vi.fn() } as unknown as ImageBitmap;
    const encoded = await encodePhoto(frame);
    expect(await encoded.original.text()).toBe('2560x1440@0.85');
  });
});
