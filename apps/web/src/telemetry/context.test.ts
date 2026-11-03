import { afterEach, describe, expect, it, vi } from 'vitest';
import { deviceContext } from './context.ts';

/* Story 18.4: the device context of a `session_start`. */

const setWidth = (width: number) => Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
const original = { width: window.innerWidth, matchMedia: window.matchMedia };

afterEach(() => {
  setWidth(original.width);
  window.matchMedia = original.matchMedia;
  vi.restoreAllMocks();
  delete (navigator as Navigator & { standalone?: unknown }).standalone;
});

const media = (matches: boolean) => vi.fn(() => ({ matches }) as MediaQueryList);

describe('deviceContext (Story 18.4)', () => {
  it('names the viewport by the window width: 767 / 768 / 1279 / 1280', () => {
    window.matchMedia = media(false);
    const at = (width: number) => {
      setWidth(width);
      return deviceContext().viewport;
    };
    expect([390, 767, 768, 1279, 1280].map(at)).toEqual(['phone', 'phone', 'tablet', 'tablet', 'desktop']);
  });

  it('a browser tab online at 390 px', () => {
    setWidth(390);
    window.matchMedia = media(false);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    expect(deviceContext()).toEqual({ viewport: 'phone', standalone: false, online: true });
  });

  it('installed (display-mode standalone or iOS navigator.standalone) and offline', () => {
    setWidth(1024);
    window.matchMedia = media(true);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(deviceContext()).toEqual({ viewport: 'tablet', standalone: true, online: false });
    window.matchMedia = media(false);
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
    expect(deviceContext().standalone).toBe(true);
  });

  it('never throws: a missing or failing matchMedia reads as a browser tab', () => {
    setWidth(1280);
    // @ts-expect-error: a browser without matchMedia.
    window.matchMedia = undefined;
    expect(deviceContext()).toMatchObject({ viewport: 'desktop', standalone: false });
    window.matchMedia = vi.fn(() => {
      throw new Error('no media');
    });
    expect(() => deviceContext()).not.toThrow();
    expect(deviceContext().standalone).toBe(false);
  });
});
