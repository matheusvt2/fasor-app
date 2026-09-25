import { describe, expect, it, vi } from 'vitest';
import { createPositionTracker, FIX_WAIT_MS } from './geolocation.ts';

/*
 * 6.1-UNIT: the position a shot is stamped with. A fix no older than 60 s is reused, a
 * request in flight is waited for up to 5 s, a denial is recorded and leaves no coords.
 */

type Success = (position: GeolocationPosition) => void;
type Failure = (error: GeolocationPositionError) => void;

function harness() {
  let clock = 0;
  const timers: { at: number; run: () => void }[] = [];
  const requests: { ok: Success; fail: Failure }[] = [];
  const onDenied = vi.fn();
  const tracker = createPositionTracker({
    geolocation: {
      getCurrentPosition: (ok: Success, fail?: Failure | null) => {
        requests.push({ ok, fail: fail ?? (() => {}) });
      },
    },
    now: () => clock,
    setTimeout: (run, ms) => timers.push({ at: clock + ms, run }),
    onDenied,
  });
  const position = (lat: number) => ({ coords: { latitude: lat, longitude: -46.6333, accuracy: 12 } }) as GeolocationPosition;
  return {
    tracker,
    requests,
    onDenied,
    position,
    advance(ms: number) {
      clock += ms;
      for (const timer of timers.splice(0)) {
        if (timer.at <= clock) timer.run();
        else timers.push(timer);
      }
    },
  };
}

describe('6.1-UNIT-007 positionAtCapture', () => {
  it('warms on open, then stamps each shot with the fix while it is under 60 s old', async () => {
    const h = harness();
    h.tracker.warm();
    expect(h.requests).toHaveLength(1);
    h.requests[0]!.ok(h.position(-23.5505));
    await Promise.resolve();
    expect(await h.tracker.positionAtCapture()).toEqual({ lat: -23.5505, lng: -46.6333, accuracy_m: 12, source: 'geolocation' });
    h.advance(30_000);
    await h.tracker.positionAtCapture();
    expect(h.requests).toHaveLength(1);
    h.advance(31_000);
    const pending = h.tracker.positionAtCapture();
    expect(h.requests).toHaveLength(2);
    h.requests[1]!.ok(h.position(-23.6));
    expect((await pending)?.lat).toBe(-23.6);
  });

  it('waits at most 5 s for a request in flight, then leaves the shot without coords', async () => {
    const h = harness();
    const pending = h.tracker.positionAtCapture();
    h.advance(FIX_WAIT_MS);
    expect(await pending).toBeNull();
  });

  it('records a denial and never asks again', async () => {
    const h = harness();
    const pending = h.tracker.positionAtCapture();
    h.requests[0]!.fail({ code: 1, message: 'denied' } as GeolocationPositionError);
    expect(await pending).toBeNull();
    expect(h.onDenied).toHaveBeenCalledTimes(1);
    expect(await h.tracker.positionAtCapture()).toBeNull();
    expect(h.requests).toHaveLength(1);
  });

  it('is null on a device with no Geolocation API', async () => {
    const tracker = createPositionTracker({ geolocation: null, now: () => 0, setTimeout: () => 0 });
    tracker.warm();
    expect(await tracker.positionAtCapture()).toBeNull();
  });
});
