import { viewportOf, type Viewport } from '@app/domain';

/*
 * Story 18.4: what a `session_start` says of the device and its connection: the viewport
 * (`viewportOf` the window's width), whether the app runs installed (`standalone`: the
 * `display-mode: standalone` media query, or iOS's `navigator.standalone`) and whether the
 * browser is online. Never throws: anything unreadable reads as a phone, a browser tab, online.
 */

export interface DeviceContext {
  viewport: Viewport;
  standalone: boolean;
  online: boolean;
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

export function deviceContext(): DeviceContext {
  return { viewport: viewportOf(width()), standalone: standalone(), online: online() };
}
