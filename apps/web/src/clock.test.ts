import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * e20f (2026-11-04): `now` is the device clock corrected by the offset learned from the server's
 * `Date` header, kept in localStorage so an offline boot applies the last one at once.
 */

const KEY = 'releng.clock-offset';
/** What `clock.ts` keeps (E20-A1): the offset and the raw instant it was learned at, in one value. */
const stored = () => JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as { offset: number; rawMs: number } | null;
const SERVER = 'Wed, 04 Nov 2026 07:49:09 GMT';
const SERVER_MS = Date.parse(SERVER);

async function freshClock() {
  vi.resetModules();
  return import('./clock.ts');
}

describe('clock.ts (e20f)', () => {
  beforeEach(() => {
    window.localStorage.removeItem(KEY);
  });
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
    expect(stored()?.offset).toBe(clock.clockOffsetMs());

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

  it('review: when the offset moves back by 2 minutes, now() holds the last instant it gave until real time catches up; back by 30 minutes, it jumps', async () => {
    vi.useFakeTimers({ now: SERVER_MS + 2 * 60_000 });
    const clock = await freshClock();
    const before = clock.now().getTime();
    expect(before).toBe(SERVER_MS + 2 * 60_000);
    clock.learnServerClock(SERVER, clock.rawNowMs(), clock.rawNowMs());
    expect(Math.abs(clock.clockOffsetMs() + 2 * 60_000)).toBeLessThan(1_000);
    // A later edit never sorts before one stamped before the offset moved.
    expect(clock.now().getTime()).toBe(before);
    vi.advanceTimersByTime(60_000);
    expect(clock.now().getTime()).toBe(before);
    vi.advanceTimersByTime(61_000);
    expect(clock.now().getTime()).toBeGreaterThan(before);

    vi.setSystemTime(SERVER_MS + 30 * 60_000);
    window.localStorage.removeItem(KEY);
    const fast = await freshClock();
    const stamped = fast.now().getTime();
    fast.learnServerClock(SERVER, fast.rawNowMs(), fast.rawNowMs());
    // More than five minutes back: the stamps before it are refused anyway and "Reenviar" stamps them again.
    expect(Math.abs(fast.now().getTime() - SERVER_MS)).toBeLessThan(1_000);
    expect(fast.now().getTime()).toBeLessThan(stamped);
  });

  it('an unreadable stored offset is 0, and an answer with no Date header teaches nothing', async () => {
    window.localStorage.setItem(KEY, 'not a number');
    const clock = await freshClock();
    expect(clock.clockOffsetMs()).toBe(0);
    clock.learnServerClock(null, clock.rawNowMs(), clock.rawNowMs());
    expect(clock.clockOffsetMs()).toBe(0);
  });

  it('E20-A1 (R-3): elapsedNowMs measures durations on the monotonic clock: a learned 30-minute offset moves now(), never it', async () => {
    vi.useFakeTimers({ now: SERVER_MS - 30 * 60_000 });
    const clock = await freshClock();
    const startNow = clock.now().getTime();
    const startElapsed = clock.elapsedNowMs();
    clock.learnServerClock(SERVER, clock.rawNowMs(), clock.rawNowMs());
    expect(clock.now().getTime() - startNow).toBeGreaterThan(29 * 60_000);
    expect(clock.elapsedNowMs() - startElapsed).toBe(0);
    vi.advanceTimersByTime(5_000);
    expect(clock.elapsedNowMs() - startElapsed).toBe(5_000);
  });

  it('E20-A1 (R-3): a 2-hour sleep (the raw clock runs, the monotonic one stops) keeps the offset; a clock set back while running drops it', async () => {
    vi.useFakeTimers({ now: SERVER_MS + 30 * 60_000 });
    const clock = await freshClock();
    clock.learnServerClock(SERVER, clock.rawNowMs(), clock.rawNowMs());
    const learned = clock.clockOffsetMs();
    expect(Math.abs(learned + 30 * 60_000)).toBeLessThan(1_000);
    expect(stored()).toEqual({ offset: learned, rawMs: SERVER_MS + 30 * 60_000 });
    // Asleep for two hours: the system clock moves, the monotonic one does not.
    vi.setSystemTime(Date.now() + 2 * 60 * 60_000);
    expect(clock.clockOffsetMs()).toBe(learned);
    // An hour of use: both clocks move together.
    vi.advanceTimersByTime(60 * 60_000);
    expect(clock.clockOffsetMs()).toBe(learned);
    // The tablet's clock is corrected while the app runs: set back 30 minutes.
    vi.setSystemTime(Date.now() - 30 * 60_000);
    expect(clock.clockOffsetMs()).toBe(0);
    expect(Math.abs(clock.now().getTime() - Date.now())).toBeLessThan(1_000);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('E20-A1 (R-3): at load, an offset whose clock was set back past the instant it was learned is dropped; one learned earlier, or kept as a plain number, still applies', async () => {
    vi.useFakeTimers({ now: SERVER_MS });
    window.localStorage.setItem(KEY, JSON.stringify({ offset: -30 * 60_000, rawMs: SERVER_MS + 30 * 60_000 }));
    expect((await freshClock()).clockOffsetMs()).toBe(0);
    expect(window.localStorage.getItem(KEY)).toBeNull();

    window.localStorage.setItem(KEY, JSON.stringify({ offset: -30 * 60_000, rawMs: SERVER_MS - 3 * 60 * 60_000 }));
    expect((await freshClock()).clockOffsetMs()).toBe(-30 * 60_000);

    window.localStorage.setItem(KEY, String(-30 * 60_000));
    expect((await freshClock()).clockOffsetMs()).toBe(-30 * 60_000);
  });

  it('E20-A1 (R-3): an answer that confirms the offset moves its stored raw instant to now', async () => {
    vi.useFakeTimers({ now: SERVER_MS + 30 * 60_000 });
    const clock = await freshClock();
    clock.learnServerClock(SERVER, clock.rawNowMs(), clock.rawNowMs());
    const learned = stored()!;
    vi.advanceTimersByTime(10 * 60_000);
    clock.learnServerClock(new Date(SERVER_MS + 10 * 60_000).toUTCString(), clock.rawNowMs(), clock.rawNowMs());
    expect(stored()).toEqual({ offset: learned.offset, rawMs: learned.rawMs + 10 * 60_000 });
  });
});
