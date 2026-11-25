import { sessionDeviceFields, viewportOf, type SessionDeviceFields, type Viewport } from '@app/domain';

/*
 * Story 18.4: what a `session_start` says of the device and its connection: the viewport
 * (`viewportOf` the window's width), whether the app runs installed (`standalone`: the
 * `display-mode: standalone` media query, or iOS's `navigator.standalone`) and whether the
 * browser is online. Never throws: anything unreadable reads as a phone, a browser tab, online.
 *
 * Story 30.6 (2026-11-25): and what kind of device it is, by the hardware. This file only reads
 * the browser's values (the primary pointer, the touch points, the user agent and its platform
 * hint, the screen and the window); the kernel's `sessionDeviceFields` turns them into the closed
 * fields and the device kind. The user agent never leaves this function.
 */

export interface DeviceContext extends SessionDeviceFields {
  viewport: Viewport;
  standalone: boolean;
  online: boolean;
}

/** Reads one browser value; a missing or throwing one reads as `fallback`. */
function read<T>(get: () => T | undefined, fallback: T): T {
  try {
    const value = get();
    return value === undefined || value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function width(): number {
  try {
    if (typeof window !== 'undefined' && Number.isFinite(window.innerWidth)) return window.innerWidth;
  } catch {
    // Unreadable reads as 0.
  }
  return 0;
}

function standalone(): boolean {
  try {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) return true;
  } catch {
    // A missing or failing matchMedia is a browser tab.
  }
  try {
    return typeof navigator !== 'undefined' && (navigator as Navigator & { standalone?: unknown }).standalone === true;
  } catch {
    return false;
  }
}

function online(): boolean {
  try {
    return typeof navigator === 'undefined' || navigator.onLine !== false;
  } catch {
    return true;
  }
}

/** Story 30.6: the hardware as the browser gives it; anything unreadable reads as a fine pointer, no touch, 0 px. */
function hardware(): SessionDeviceFields {
  const nav = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { userAgentData?: { platform?: unknown } });
  const platform = read(() => nav?.userAgentData?.platform, undefined as unknown);
  return sessionDeviceFields({
    pointerCoarse: read(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches, false),
    maxTouchPoints: read(() => nav?.maxTouchPoints, 0),
    userAgent: read(() => nav?.userAgent, ''),
    platformHint: typeof platform === 'string' ? platform : undefined,
    screenWidth: read(() => (typeof window === 'undefined' ? undefined : window.screen?.width), 0),
    screenHeight: read(() => (typeof window === 'undefined' ? undefined : window.screen?.height), 0),
    innerWidth: width(),
  });
}

export function deviceContext(): DeviceContext {
  return { viewport: viewportOf(width()), standalone: standalone(), online: online(), ...hardware() };
}
