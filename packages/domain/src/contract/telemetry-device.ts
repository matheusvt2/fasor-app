/*
 * Story 30.6 (2026-11-25, Matheus: "é o tablet do Bruno, pode registrar o tipo do aparelho"):
 * what kind of device a session starts on. The Story 18.4 `viewport` is the window's CSS width
 * class, so one tablet read as phone, desktop and tablet across its sessions; these fields read
 * the hardware instead. Every value is from a closed list or a bounded integer, computed once on
 * the device at session start: the user agent string is read on the device to name the system
 * and is never sent, and no device model or free text is ever part of an event (AD-28).
 *
 * The one rule of the device kind lives here (`deviceKindOf`); `apps/web` only reads the
 * browser's values and hands them to `sessionDeviceFields`.
 */

/** The primary pointer: `matchMedia('(pointer: coarse)')` (a finger) or not (a mouse, a trackpad). */
export const POINTERS = ['coarse', 'fine'] as const;
export type Pointer = (typeof POINTERS)[number];

/** The device's system, derived on the device from the user agent (and the platform hint when there is one). */
export const DEVICE_OSES = ['android', 'ios', 'ipados', 'windows', 'macos', 'linux', 'chromeos', 'other'] as const;
export type DeviceOs = (typeof DEVICE_OSES)[number];

/** The kernel's one reading of the hardware. */
export const DEVICE_KINDS = ['phone', 'tablet', 'desktop'] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];

/** `touch_points` is `navigator.maxTouchPoints` capped at this (a browser may report 256). */
export const TOUCH_POINTS_MAX = 10;

/** `screen_w`, `screen_h` and `viewport_w` are CSS pixels from 0 to this; 0 means unreadable. */
export const DEVICE_PX_MAX = 10_000;

/**
 * A touch screen whose shorter side is at least this many CSS pixels is a tablet, below it a
 * phone (Android's own split between phone and tablet layouts, `sw600dp`).
 */
export const DEVICE_TABLET_MIN_SHORT_SIDE_PX = 600;

/** The hardware a device reads at session start, as the browser gives it. */
export interface DeviceReading {
  /** `matchMedia('(pointer: coarse)').matches`. */
  pointerCoarse: boolean;
  /** `navigator.maxTouchPoints`. */
  maxTouchPoints: number;
  /** `navigator.userAgent`: read here to name the system, never sent. */
  userAgent: string;
  /** `navigator.userAgentData.platform`, where the browser has it (Chromium). */
  platformHint?: string;
  /** `screen.width` and `screen.height`, in CSS pixels. */
  screenWidth: number;
  screenHeight: number;
  /** `window.innerWidth`, in CSS pixels. */
  innerWidth: number;
}

/** The fields a `session_start` carries for Story 30.6. */
export interface SessionDeviceFields {
  pointer: Pointer;
  touch_points: number;
  os: DeviceOs;
  screen_w: number;
  screen_h: number;
  viewport_w: number;
  device_kind: DeviceKind;
}

/** A whole number from 0 to `max`: rounded, capped; anything not a finite non-negative number reads as 0. */
function bounded(value: number, max: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.round(value), max);
}

const PLATFORM_HINTS: readonly (readonly [RegExp, DeviceOs])[] = [
  [/^android$/i, 'android'],
  [/^(chrome|chromium) os$/i, 'chromeos'],
  [/^ios$/i, 'ios'],
  [/^macos$/i, 'macos'],
  [/^windows$/i, 'windows'],
  [/^linux$/i, 'linux'],
];

/**
 * The device's system. The platform hint wins when it names one; otherwise the user agent, in
 * this order: Chrome OS, Android, iPhone or iPod, iPad, a Mac (an iPad on Safari asks for the
 * desktop site and reports a Mac user agent, told apart by more than one touch point), Windows,
 * Linux; anything else is `other`.
 */
export function deviceOsOf(userAgent: string, maxTouchPoints: number, platformHint?: string): DeviceOs {
  const hint = platformHint?.trim() ?? '';
  for (const [pattern, os] of PLATFORM_HINTS) if (pattern.test(hint)) return os;
  const ua = userAgent;
  if (/\bCrOS\b/i.test(ua)) return 'chromeos';
  if (/\bAndroid\b/i.test(ua)) return 'android';
  if (/\b(iPhone|iPod)\b/i.test(ua)) return 'ios';
  if (/\biPad\b/i.test(ua)) return 'ipados';
  if (/\bMacintosh\b|\bMac OS X\b/i.test(ua)) return bounded(maxTouchPoints, TOUCH_POINTS_MAX) > 1 ? 'ipados' : 'macos';
  if (/\bWindows\b/i.test(ua)) return 'windows';
  if (/\bLinux\b/i.test(ua)) return 'linux';
  return 'other';
}

/** What `deviceKindOf` reads: the closed values, never the window. */
export interface DeviceKindInput {
  pointer: Pointer;
  touchPoints: number;
  os: DeviceOs;
  screenWidth: number;
  screenHeight: number;
}

/**
 * The device kind by the hardware, never by the window's width:
 * - an iPhone (`ios`) is a phone and an iPad (`ipados`) a tablet, whatever is attached to it;
 * - an Android device is a phone when the screen's shorter side is below
 *   `DEVICE_TABLET_MIN_SHORT_SIDE_PX`, a tablet from it on;
 * - any other system is a desktop with no touch point or a fine primary pointer (a touch
 *   laptop), and otherwise read by the screen's shorter side as Android is (a Windows or
 *   Chrome OS tablet in tablet mode).
 * An unreadable screen (0) reads as the smallest, so as a phone where the screen decides.
 */
export function deviceKindOf(input: DeviceKindInput): DeviceKind {
  if (input.os === 'ios') return 'phone';
  if (input.os === 'ipados') return 'tablet';
  const shortSide = Math.min(bounded(input.screenWidth, DEVICE_PX_MAX), bounded(input.screenHeight, DEVICE_PX_MAX));
  const bySide: DeviceKind = shortSide >= DEVICE_TABLET_MIN_SHORT_SIDE_PX ? 'tablet' : 'phone';
  if (input.os === 'android') return bySide;
  if (bounded(input.touchPoints, TOUCH_POINTS_MAX) === 0 || input.pointer === 'fine') return 'desktop';
  return bySide;
}

/** The Story 30.6 fields of a `session_start`, from what the browser reads; every value closed or bounded. */
export function sessionDeviceFields(reading: DeviceReading): SessionDeviceFields {
  const pointer: Pointer = reading.pointerCoarse ? 'coarse' : 'fine';
  const touchPoints = bounded(reading.maxTouchPoints, TOUCH_POINTS_MAX);
  const os = deviceOsOf(reading.userAgent, touchPoints, reading.platformHint);
  const screenWidth = bounded(reading.screenWidth, DEVICE_PX_MAX);
  const screenHeight = bounded(reading.screenHeight, DEVICE_PX_MAX);
  return {
    pointer,
    touch_points: touchPoints,
    os,
    screen_w: screenWidth,
    screen_h: screenHeight,
    viewport_w: bounded(reading.innerWidth, DEVICE_PX_MAX),
    device_kind: deviceKindOf({ pointer, touchPoints, os, screenWidth, screenHeight }),
  };
}
