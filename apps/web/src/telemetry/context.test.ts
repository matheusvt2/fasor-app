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
  delete (navigator as { maxTouchPoints?: unknown }).maxTouchPoints;
  delete (navigator as { userAgentData?: unknown }).userAgentData;
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
    expect(deviceContext()).toMatchObject({ viewport: 'phone', standalone: false, online: true });
  });

  it('installed (display-mode standalone or iOS navigator.standalone) and offline', () => {
    setWidth(1024);
    window.matchMedia = media(true);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(deviceContext()).toMatchObject({ viewport: 'tablet', standalone: true, online: false });
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

/* Story 30.6 (2026-11-25): the hardware a `session_start` reads, through the kernel's one rule. */

interface Hardware {
  coarse: boolean;
  touchPoints: number;
  userAgent: string;
  platform?: string;
  screen: [number, number];
  width: number;
}

function onHardware(hw: Hardware): void {
  setWidth(hw.width);
  window.matchMedia = vi.fn((query: string) => ({ matches: query === '(pointer: coarse)' ? hw.coarse : false }) as MediaQueryList);
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: hw.touchPoints });
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(hw.userAgent);
  if (hw.platform !== undefined) Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: { platform: hw.platform } });
  vi.spyOn(window.screen, 'width', 'get').mockReturnValue(hw.screen[0]);
  vi.spyOn(window.screen, 'height', 'get').mockReturnValue(hw.screen[1]);
}

const IPAD_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
const ANDROID_TABLET = 'Mozilla/5.0 (Linux; Android 13; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

describe('deviceContext (Story 30.6): the device kind by the hardware', () => {
  it('30.6-WEB-001: an Android tablet upright at a phone-width window says tablet, with the window and the screen', () => {
    onHardware({ coarse: true, touchPoints: 10, userAgent: ANDROID_TABLET, screen: [800, 1280], width: 600 });
    expect(deviceContext()).toEqual({
      viewport: 'phone',
      standalone: false,
      online: expect.any(Boolean),
      pointer: 'coarse',
      touch_points: 10,
      os: 'android',
      screen_w: 800,
      screen_h: 1280,
      viewport_w: 600,
      device_kind: 'tablet',
    });
  });

  it('30.6-WEB-002: an iPad on Safari (a Mac user agent with touch) says ipados and tablet; a desktop says desktop', () => {
    onHardware({ coarse: true, touchPoints: 5, userAgent: IPAD_SAFARI, screen: [820, 1180], width: 820 });
    expect(deviceContext()).toMatchObject({ os: 'ipados', device_kind: 'tablet', viewport: 'tablet' });
    vi.restoreAllMocks();
    onHardware({ coarse: false, touchPoints: 0, userAgent: IPAD_SAFARI.replace('Version/18.1 Safari/605.1.15', 'Chrome/131 Safari/537.36'), screen: [1440, 900], width: 1440, platform: 'macOS' });
    expect(deviceContext()).toMatchObject({ os: 'macos', pointer: 'fine', touch_points: 0, device_kind: 'desktop' });
  });

  it('30.6-WEB-003: sends no user agent, and an unreadable reading never throws', () => {
    onHardware({ coarse: false, touchPoints: 0, userAgent: ANDROID_TABLET, screen: [1920, 1080], width: 1920 });
    expect(JSON.stringify(deviceContext())).not.toMatch(/Mozilla|Android 13/);
    vi.spyOn(window.screen, 'width', 'get').mockImplementation(() => {
      throw new Error('no screen');
    });
    // @ts-expect-error: a browser without matchMedia.
    window.matchMedia = undefined;
    expect(() => deviceContext()).not.toThrow();
    expect(deviceContext()).toMatchObject({ pointer: 'fine', screen_w: 0 });
  });
});
