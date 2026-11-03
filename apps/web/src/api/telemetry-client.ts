import { CONTRACT_VERSION, CONTRACT_VERSION_HEADER, TELEMETRY_ROUTE, type UxEvent } from '@app/domain';

/*
 * Epic 18 (AD-28): the network side of the usage-event queue, here because only
 * `src/{sync,files,api}` may call `fetch` (AR-1). `src/telemetry/flush.ts` decides what to
 * send and what to delete; this only carries a batch and says how the server answered.
 */

/**
 * E18-A1 (R-A4): a post that has not settled after this long is aborted, so a stalled
 * connection never holds the queue (one flush at a time) for the rest of the app's life.
 */
export const TELEMETRY_POST_TIMEOUT_MS = 15_000;

/** Posts one batch; resolves to the answer's status, rejects when the request never completed or timed out. */
export async function postTelemetry(events: readonly UxEvent[]): Promise<number> {
  // A plain `setTimeout` rather than `AbortSignal.timeout`, so fake timers drive it in tests.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TELEMETRY_POST_TIMEOUT_MS);
  try {
    const response = await fetch(TELEMETRY_ROUTE.path, {
      method: TELEMETRY_ROUTE.method,
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION) },
      body: JSON.stringify(events),
      signal: controller.signal,
    });
    // Read to its end (a 204 is empty), so the request completes rather than being cut off.
    await response.arrayBuffer().catch(() => undefined);
    return response.status;
  } finally {
    clearTimeout(timer);
  }
}

/** Hands one batch to `navigator.sendBeacon` (the hidden-tab path); false when the browser refused it. */
export function beaconTelemetryBody(url: string, body: Blob): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return false;
  return navigator.sendBeacon(url, body);
}
