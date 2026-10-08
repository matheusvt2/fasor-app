import { describe, expect, it } from 'vitest';
import { KEEP_SCREEN_ON_DEFAULT, keepScreenOnOf, keepScreenOnSchema, WAKE_LOCK_IDLE_MS, wakeLockWanted } from './wake-lock.ts';

/*
 * Review 2026-10-08 (FLD-1): the "Manter a tela ligada" vocabulary and the rule that decides
 * when the screen is held awake.
 */

describe('R8CAP-UNIT the wake-lock preference and rule', () => {
  it('is on by default, ten minutes idle, and a stored value that does not parse reads the default', () => {
    expect(KEEP_SCREEN_ON_DEFAULT).toBe(true);
    expect(WAKE_LOCK_IDLE_MS).toBe(600_000);
    expect(keepScreenOnOf(undefined)).toBe(true);
    expect(keepScreenOnOf('off')).toBe(true);
    expect(keepScreenOnOf(false)).toBe(false);
    expect(keepScreenOnOf(true)).toBe(true);
    expect(keepScreenOnSchema.safeParse(null).success).toBe(false);
  });

  it('wants the lock only with the switch on, a holder, the page visible and a touch or key within ten minutes', () => {
    const base = { enabled: true, holders: 1, visible: true, idleMs: 0 };
    expect(wakeLockWanted(base)).toBe(true);
    expect(wakeLockWanted({ ...base, holders: 3 })).toBe(true);
    expect(wakeLockWanted({ ...base, idleMs: WAKE_LOCK_IDLE_MS - 1 })).toBe(true);
    // Idle ten minutes: released.
    expect(wakeLockWanted({ ...base, idleMs: WAKE_LOCK_IDLE_MS })).toBe(false);
    // Hidden, switched off or no surface wanting it: released.
    expect(wakeLockWanted({ ...base, visible: false })).toBe(false);
    expect(wakeLockWanted({ ...base, enabled: false })).toBe(false);
    expect(wakeLockWanted({ ...base, holders: 0 })).toBe(false);
  });
});
