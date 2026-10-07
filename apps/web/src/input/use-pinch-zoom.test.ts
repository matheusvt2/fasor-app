import { describe, expect, it } from 'vitest';
import { clampZoom, maxZoomScale, zoomAbout } from './use-pinch-zoom.ts';

/*
 * 13.3-UNIT: the zoom's arithmetic (the gestures themselves run in a real browser,
 * `e2e/photo-zoom.durability.spec.ts`).
 */

describe('13.3-UNIT the pinch zoom arithmetic', () => {
  it('the maximum is one picture pixel per CSS pixel of the stage at fit, never below fit', () => {
    // A 4000 x 3000 photo in a 1000 x 500 stage fits by its height (500 / 3000): 6x to native.
    expect(maxZoomScale({ width: 4000, height: 3000 }, { width: 1000, height: 500 })).toBe(6);
    expect(maxZoomScale({ width: 4000, height: 3000 }, { width: 2000, height: 3000 })).toBe(2);
    // A picture smaller than its stage, or a size not known yet: no zoom.
    expect(maxZoomScale({ width: 300, height: 200 }, { width: 1000, height: 500 })).toBe(1);
    expect(maxZoomScale(null, { width: 1000, height: 500 })).toBe(1);
    expect(maxZoomScale({ width: 4000, height: 3000 }, null)).toBe(1);
  });

  it('clamps the scale to [1, max] and the pan so the picture covers its stage', () => {
    const stage = { width: 400, height: 300 };
    expect(clampZoom({ scale: 0.5, x: 10, y: 10 }, 4, stage)).toEqual({ scale: 1, x: 0, y: 0 });
    expect(clampZoom({ scale: 9, x: 0, y: 0 }, 4, stage)).toEqual({ scale: 4, x: 0, y: 0 });
    // At 2x the picture is 800 x 600: x within [-400, 0], y within [-300, 0].
    expect(clampZoom({ scale: 2, x: 50, y: -1000 }, 4, stage)).toEqual({ scale: 2, x: 0, y: -300 });
    expect(clampZoom({ scale: 2, x: -1000, y: 20 }, 4, stage)).toEqual({ scale: 2, x: -400, y: 0 });
  });

  it('zooms about a point that stays where it is (the pinch midpoint, the double-tap)', () => {
    const next = zoomAbout({ scale: 1, x: 0, y: 0 }, 2, 100, 50);
    expect(next).toEqual({ scale: 2, x: -100, y: -50 });
    // The picture point under (100, 50) is still there: (100 - x) / scale = 100.
    expect((100 - next.x) / next.scale).toBe(100);
    expect(zoomAbout(next, 1, 100, 50)).toEqual({ scale: 1, x: 0, y: 0 });
  });
});
