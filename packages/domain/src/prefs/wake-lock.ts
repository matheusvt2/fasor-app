import { z } from 'zod';

/*
 * Review 2026-10-08 (FLD-1): "Manter a tela ligada" is device-local state in `local_prefs`,
 * on by default. The kernel owns the vocabulary and the one rule: when the app holds the
 * screen awake. The app only reports what it knows (the switch, how many surfaces want the
 * screen on, whether the page is visible, how long since the last touch or key) and asks.
 */

/** The stored value of the switch: on (the default) or off. */
export const keepScreenOnSchema = z.boolean();
export type KeepScreenOn = z.infer<typeof keepScreenOnSchema>;

/** A fresh device keeps the screen on while a ficha, the camera or a reading wait is shown. */
export const KEEP_SCREEN_ON_DEFAULT: KeepScreenOn = true;

/** Ten minutes without a touch or a key: the screen may sleep again (the device's own timeout takes over). */
export const WAKE_LOCK_IDLE_MS = 600_000;

/** The stored switch, or the default when nothing (or nothing valid) is stored. */
export function keepScreenOnOf(stored: unknown): KeepScreenOn {
  const parsed = keepScreenOnSchema.safeParse(stored);
  return parsed.success ? parsed.data : KEEP_SCREEN_ON_DEFAULT;
}

export interface WakeLockInput {
  /** "Manter a tela ligada" on this device. */
  enabled: boolean;
  /** How many surfaces want the screen on now (the ficha, an open camera, a reading wait). */
  holders: number;
  /** The page is visible (a hidden page cannot hold the lock; the browser drops it). */
  visible: boolean;
  /** Milliseconds since the last touch or key on the page. */
  idleMs: number;
}

/** Whether the screen is to be held awake now: the switch on, some surface wanting it, the page visible, a touch or key in the last ten minutes. */
export function wakeLockWanted(input: WakeLockInput): boolean {
  return input.enabled && input.holders > 0 && input.visible && input.idleMs < WAKE_LOCK_IDLE_MS;
}
