import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * e20f (2026-11-04): `now` is the device clock corrected by the offset learned from the server's
 * `Date` header, kept in localStorage so an offline boot applies the last one at once.
 */

const KEY = 'releng.clock-offset';
const SERVER = 'Wed, 04 Nov 2026 07:49:09 GMT';
const SERVER_MS = Date.parse(SERVER);

async function freshClock() {
  vi.resetModules();
  return import('./clock.ts');
}

describe('clock.ts (e20f)', () => {
  beforeEach(() => window.localStorage.removeItem(KEY));
  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.removeItem(KEY);
  });

  it('a device 30 minutes fast learns the offset from one answer, stamps server time, and keeps the offset for the next boot', async () => {
    vi.useFakeTimers({ now: SERVER_MS + 30 * 60_000 });
    const clock = await freshClock();
    expect(clock.clockOffsetMs()).toBe(0);
    clock.learnServerClock(SERVER, clock.rawNowMs(), clock.rawNowMs() + 100);
    expect(Math.abs(clock.clockOffsetMs() + 30 * 60_000)).toBeLessThan(1_000);
    expect(Math.abs(clock.now().getTime() - SERVER_MS)).toBeLessThan(1_000);
    expect(Number(window.localStorage.getItem(KEY))).toBe(clock.clockOffsetMs());

    // An offline boot: no answer yet, the stored offset applies at once.
    const again = await freshClock();
    expect(again.clockOffsetMs()).toBe(clock.clockOffsetMs());
  });

  it('jitter within a minute changes nothing; a correct clock goes back to 0 and forgets the stored offset', async () => {
    vi.useFakeTimers({ now: SERVER_MS + 30 * 60_000 });
    const clock = await freshClock();
    clock.learnServerClock(SERVER, clock.rawNowMs(), clock.rawNowMs());
    const applied = clock.clockOffsetMs();
    clock.learnServerClock(new Date(SERVER_MS + 30_000).toUTCString(), clock.rawNowMs(), clock.rawNowMs());
    expect(clock.clockOffsetMs()).toBe(applied);
    vi.setSystemTime(SERVER_MS + 5_000);
    clock.learnServerClock(SERVER, clock.rawNowMs(), clock.rawNowMs());
    expect(clock.clockOffsetMs()).toBe(0);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('an unreadable stored offset is 0, and an answer with no Date header teaches nothing', async () => {
    window.localStorage.setItem(KEY, 'not a number');
    const clock = await freshClock();
    expect(clock.clockOffsetMs()).toBe(0);
    clock.learnServerClock(null, clock.rawNowMs(), clock.rawNowMs());
    expect(clock.clockOffsetMs()).toBe(0);
  });
});
