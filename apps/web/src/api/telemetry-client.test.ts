// @vitest-environment node
import { CONTRACT_VERSION, CONTRACT_VERSION_HEADER, TELEMETRY_ROUTE, type UxEvent } from '@app/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { beaconTelemetryBody, postTelemetry, TELEMETRY_POST_TIMEOUT_MS } from './telemetry-client.ts';

/*
 * E18-A1 (R-V2): the real wire of the usage-event queue, which `flush.test.ts` replaces with a
 * fake transport. A stubbed `fetch` reads what `postTelemetry` sends; the beacon path reads
 * `navigator.sendBeacon`, present or not.
 */

const DEVICE = '019966b0-0034-7000-8000-0000000000dd';

const event = (i: number): UxEvent => ({
  v: 1,
  ts: new Date(Date.UTC(2026, 10, 3, 12, 0, 0, i)).toISOString(),
  session_id: DEVICE,
  device_id: DEVICE,
  app_version: 'dev',
  name: 'wait',
  screen: 'ficha',
  kind: 'sync',
  duration_ms: i,
});

type FetchCall = [input: string, init: RequestInit];

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('postTelemetry (Story 18.1, E18-A1)', () => {
  it('posts the batch as a bare JSON array to the route, same-origin, with the contract header, and resolves to the status', async () => {
    const fetch = vi.fn<(input: string, init: RequestInit) => Promise<Response>>(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    const batch = [event(1), event(2)];
    await expect(postTelemetry(batch)).resolves.toBe(204);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [input, init] = fetch.mock.calls[0] as FetchCall;
    expect(input).toBe(TELEMETRY_ROUTE.path);
    expect(init.method).toBe(TELEMETRY_ROUTE.method);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(init.headers).toEqual({ 'content-type': 'application/json', [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION) });
    expect(JSON.parse(init.body as string)).toEqual(batch);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('resolves to a refusal status rather than rejecting', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"too_many"}', { status: 429 })));
    await expect(postTelemetry([event(1)])).resolves.toBe(429);
  });

  it('rejects when the network fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(postTelemetry([event(1)])).rejects.toBeInstanceOf(TypeError);
  });

  it('aborts a post that has not settled after 15 s, and rejects', async () => {
    expect(TELEMETRY_POST_TIMEOUT_MS).toBe(15_000);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            signal = init.signal ?? undefined;
            init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          }),
      ),
    );
    const posted = postTelemetry([event(1)]);
    const settled = posted.then(
      () => 'resolved',
      () => 'rejected',
    );
    await vi.advanceTimersByTimeAsync(TELEMETRY_POST_TIMEOUT_MS - 1);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal?.aborted).toBe(true);
    await expect(settled).resolves.toBe('rejected');
  });

  it('clears its timer once the answer came, so nothing aborts later', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: string, init: RequestInit) => {
        signal = init.signal ?? undefined;
        return new Response(null, { status: 204 });
      }),
    );
    await expect(postTelemetry([event(1)])).resolves.toBe(204);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(TELEMETRY_POST_TIMEOUT_MS);
    expect(signal?.aborted).toBe(false);
  });
});

describe('beaconTelemetryBody (Story 18.1, the hidden-tab path)', () => {
  it('hands the body to navigator.sendBeacon and answers what it answered', () => {
    const sendBeacon = vi.fn(() => true);
    vi.stubGlobal('navigator', { sendBeacon });
    const body = new Blob(['[]'], { type: 'application/json' });
    expect(beaconTelemetryBody(TELEMETRY_ROUTE.path, body)).toBe(true);
    expect(sendBeacon).toHaveBeenCalledWith(TELEMETRY_ROUTE.path, body);
    sendBeacon.mockReturnValue(false);
    expect(beaconTelemetryBody(TELEMETRY_ROUTE.path, body)).toBe(false);
  });

  it('answers false when the browser has no sendBeacon', () => {
    vi.stubGlobal('navigator', {});
    expect(beaconTelemetryBody(TELEMETRY_ROUTE.path, new Blob(['[]']))).toBe(false);
  });
});
