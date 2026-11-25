import { describe, expect, it } from 'vitest';
import {
  DEVICE_KINDS,
  DEVICE_OSES,
  DEVICE_PX_MAX,
  DEVICE_TABLET_MIN_SHORT_SIDE_PX,
  deviceKindOf,
  deviceOsOf,
  POINTERS,
  sessionDeviceFields,
  TOUCH_POINTS_MAX,
  type DeviceReading,
} from './telemetry-device.ts';

/*
 * Story 30.6 (2026-11-25): what kind of device a session starts on, read from the hardware
 * (touch and the screen's shorter side), never from the window's width (`viewport`).
 */

const UA = {
  androidPhone: 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 13; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  // iPadOS Safari asks for the desktop site by default: a Mac user agent.
  ipadSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  ipadOld: 'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  chromebook: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  other: 'SomeBot/1.0',
};

const reading = (over: Partial<DeviceReading>): DeviceReading => ({
  pointerCoarse: false,
  maxTouchPoints: 0,
  userAgent: UA.windows,
  screenWidth: 1920,
  screenHeight: 1080,
  innerWidth: 1920,
  ...over,
});

describe('Story 30.6: the closed lists', () => {
  it('30.6-UNIT-001: names the pointers, the systems and the device kinds, and the bounds', () => {
    expect(POINTERS).toEqual(['coarse', 'fine']);
    expect(DEVICE_OSES).toEqual(['android', 'ios', 'ipados', 'windows', 'macos', 'linux', 'chromeos', 'other']);
    expect(DEVICE_KINDS).toEqual(['phone', 'tablet', 'desktop']);
    expect(TOUCH_POINTS_MAX).toBe(10);
    expect(DEVICE_PX_MAX).toBe(10000);
    expect(DEVICE_TABLET_MIN_SHORT_SIDE_PX).toBe(600);
  });
});

describe('Story 30.6: deviceOsOf', () => {
  it('30.6-UNIT-002: reads the system from the user agent, an iPad on Safari (a Mac agent with touch) as ipados', () => {
    expect(deviceOsOf(UA.androidPhone, 5)).toBe('android');
    expect(deviceOsOf(UA.androidTablet, 10)).toBe('android');
    expect(deviceOsOf(UA.iphone, 5)).toBe('ios');
    expect(deviceOsOf(UA.ipadSafari, 5)).toBe('ipados');
    expect(deviceOsOf(UA.ipadOld, 5)).toBe('ipados');
    expect(deviceOsOf(UA.mac, 0)).toBe('macos');
    // A Mac with one touch point (a touch bar or an emulator) stays a Mac: an iPad reports 5.
    expect(deviceOsOf(UA.mac, 1)).toBe('macos');
    expect(deviceOsOf(UA.windows, 10)).toBe('windows');
    expect(deviceOsOf(UA.linux, 0)).toBe('linux');
    expect(deviceOsOf(UA.chromebook, 10)).toBe('chromeos');
    expect(deviceOsOf(UA.other, 0)).toBe('other');
    expect(deviceOsOf('', 0)).toBe('other');
  });

  it('30.6-UNIT-003: prefers the browser\'s own platform hint when it names a system', () => {
    expect(deviceOsOf(UA.linux, 5, 'Android')).toBe('android');
    expect(deviceOsOf(UA.linux, 10, 'Chrome OS')).toBe('chromeos');
    expect(deviceOsOf(UA.linux, 10, 'Chromium OS')).toBe('chromeos');
    expect(deviceOsOf(UA.mac, 0, 'macOS')).toBe('macos');
    expect(deviceOsOf(UA.linux, 0, 'Windows')).toBe('windows');
    expect(deviceOsOf(UA.windows, 0, 'Linux')).toBe('linux');
    // An empty or unknown hint falls back to the user agent.
    expect(deviceOsOf(UA.windows, 0, '')).toBe('windows');
    expect(deviceOsOf(UA.androidPhone, 5, 'Unknown')).toBe('android');
  });
});

describe('Story 30.6: deviceKindOf, by the hardware and never by the window', () => {
  it('30.6-UNIT-004: a phone is a phone (Android and iPhone)', () => {
    expect(deviceKindOf({ pointer: 'coarse', touchPoints: 5, os: 'android', screenWidth: 412, screenHeight: 915 })).toBe('phone');
    expect(deviceKindOf({ pointer: 'coarse', touchPoints: 5, os: 'ios', screenWidth: 393, screenHeight: 852 })).toBe('phone');
    // A phone turned on its side keeps its shorter side.
    expect(deviceKindOf({ pointer: 'coarse', touchPoints: 5, os: 'android', screenWidth: 915, screenHeight: 412 })).toBe('phone');
  });

  it('30.6-UNIT-005: an Android tablet upright at a narrow window is a tablet, whatever the window', () => {
    const tablet = sessionDeviceFields(reading({ pointerCoarse: true, maxTouchPoints: 10, userAgent: UA.androidTablet, screenWidth: 800, screenHeight: 1280, innerWidth: 600 }));
    expect(tablet).toMatchObject({ os: 'android', pointer: 'coarse', device_kind: 'tablet', viewport_w: 600, screen_w: 800, screen_h: 1280 });
    // Landscape, split screen at 400 px: still a tablet.
    expect(sessionDeviceFields(reading({ pointerCoarse: true, maxTouchPoints: 10, userAgent: UA.androidTablet, screenWidth: 1280, screenHeight: 800, innerWidth: 400 })).device_kind).toBe('tablet');
    // At the threshold: a shorter side of 600 is a tablet, 599 a phone.
    expect(deviceKindOf({ pointer: 'coarse', touchPoints: 5, os: 'android', screenWidth: 600, screenHeight: 960 })).toBe('tablet');
    expect(deviceKindOf({ pointer: 'coarse', touchPoints: 5, os: 'android', screenWidth: 599, screenHeight: 960 })).toBe('phone');
  });

  it('30.6-UNIT-006: an iPad on Safari (a Mac user agent with touch points) is a tablet, with a keyboard and trackpad too', () => {
    expect(sessionDeviceFields(reading({ pointerCoarse: true, maxTouchPoints: 5, userAgent: UA.ipadSafari, screenWidth: 820, screenHeight: 1180, innerWidth: 820 }))).toMatchObject({
      os: 'ipados',
      device_kind: 'tablet',
    });
    expect(deviceKindOf({ pointer: 'fine', touchPoints: 5, os: 'ipados', screenWidth: 1024, screenHeight: 1366 })).toBe('tablet');
  });

  it('30.6-UNIT-007: a touch laptop (fine primary pointer, touch points) is a desktop; a Windows tablet in tablet mode is a tablet', () => {
    expect(sessionDeviceFields(reading({ pointerCoarse: false, maxTouchPoints: 10, userAgent: UA.windows, screenWidth: 1536, screenHeight: 864, innerWidth: 1536 })).device_kind).toBe('desktop');
    expect(deviceKindOf({ pointer: 'coarse', touchPoints: 10, os: 'windows', screenWidth: 1368, screenHeight: 912 })).toBe('tablet');
    expect(deviceKindOf({ pointer: 'coarse', touchPoints: 10, os: 'chromeos', screenWidth: 1280, screenHeight: 800 })).toBe('tablet');
  });

  it('30.6-UNIT-008: a desktop is a desktop, at any window width', () => {
    expect(sessionDeviceFields(reading({ userAgent: UA.mac, screenWidth: 1440, screenHeight: 900, innerWidth: 500 }))).toMatchObject({
      os: 'macos',
      pointer: 'fine',
      touch_points: 0,
      device_kind: 'desktop',
      viewport_w: 500,
    });
    expect(deviceKindOf({ pointer: 'fine', touchPoints: 0, os: 'linux', screenWidth: 1920, screenHeight: 1080 })).toBe('desktop');
    // No touch at all is a desktop even with a coarse pointer reported (a TV remote, an odd driver).
    expect(deviceKindOf({ pointer: 'coarse', touchPoints: 0, os: 'other', screenWidth: 1920, screenHeight: 1080 })).toBe('desktop');
  });
});

describe('Story 30.6: sessionDeviceFields keeps every value inside its bounds', () => {
  it('30.6-UNIT-009: rounds and caps the numbers; an unreadable one reads as 0', () => {
    const fields = sessionDeviceFields(reading({ maxTouchPoints: 256, screenWidth: 1280.6, screenHeight: 99999, innerWidth: Number.NaN }));
    expect(fields).toMatchObject({ touch_points: TOUCH_POINTS_MAX, screen_w: 1281, screen_h: DEVICE_PX_MAX, viewport_w: 0 });
    expect(sessionDeviceFields(reading({ maxTouchPoints: -3, screenWidth: -1, screenHeight: Number.POSITIVE_INFINITY, innerWidth: 0 }))).toMatchObject({
      touch_points: 0,
      screen_w: 0,
      screen_h: 0,
      viewport_w: 0,
    });
  });

  it('30.6-UNIT-010: carries only the closed fields, never the user agent', () => {
    const fields = sessionDeviceFields(reading({ userAgent: UA.windows }));
    expect(Object.keys(fields).sort()).toEqual(['device_kind', 'os', 'pointer', 'screen_h', 'screen_w', 'touch_points', 'viewport_w']);
    expect(JSON.stringify(fields)).not.toContain('Mozilla');
  });
});
