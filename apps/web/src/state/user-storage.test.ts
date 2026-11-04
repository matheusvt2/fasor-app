import { afterEach, describe, expect, it } from 'vitest';
import { ALTITUDE_KEY_PREFIX, clearUserStorage, LEGEND_KEY } from './user-storage.ts';

/* e20f (QA N3): the browser-storage keys of the user go with a sign-out; the device-wide ones stay. */

describe('clearUserStorage (e20f)', () => {
  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('removes every relatório key and the legend key, and keeps the clock offset, the theme mirror and the pending wipes', () => {
    window.localStorage.setItem(`${ALTITUDE_KEY_PREFIX}019966c1-0000-7000-8000-0000000000a1`, '{"altitude":812}');
    window.localStorage.setItem(`${ALTITUDE_KEY_PREFIX}019966c1-0000-7000-8000-0000000000a2`, '{"altitude":null}');
    window.localStorage.setItem('releng.clock-offset', '-1800000');
    window.localStorage.setItem('releng.theme', 'dark');
    window.localStorage.setItem('releng.pending-wipe', '["releng-x"]');
    window.sessionStorage.setItem(LEGEND_KEY, '019966c1-0000-7000-8000-0000000000b1');
    clearUserStorage();
    expect(Object.keys(window.localStorage).sort()).toEqual(['releng.clock-offset', 'releng.pending-wipe', 'releng.theme']);
    expect(window.sessionStorage.getItem(LEGEND_KEY)).toBeNull();
  });
});
