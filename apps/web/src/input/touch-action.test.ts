// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { TOUCH_ACTION, touchActionStyle } from './touch-action.ts';

describe('touch-action', () => {
  it('never maps a kind to a value that permits a horizontal-only swipe', () => {
    for (const value of Object.values(TOUCH_ACTION)) {
      expect(value).not.toBe('pan-x');
    }
  });

  it('gives press-and-hold targets `none` so no scroll competes with a hold', () => {
    expect(touchActionStyle('hold')).toEqual({ touchAction: 'none' });
  });

  it('gives tappable controls `manipulation` (no double-tap-zoom delay)', () => {
    expect(touchActionStyle('tap')).toEqual({ touchAction: 'manipulation' });
  });

  it('keeps vertical scroll for list-like surfaces', () => {
    expect(touchActionStyle('scrollY')).toEqual({ touchAction: 'pan-y' });
  });
});
