import { TELEMETRY_BATCH_MAX, TELEMETRY_ROUTE, type UxEvent } from '@app/domain';
import { beaconTelemetryBody, postTelemetry } from '../api/telemetry-client.ts';
import type { AppDatabase } from '../db/schema.ts';
import { deleteUxEvents, oldestUxEvents, UX_EVENTS_CAP, type QueuedUxEvent } from '../db/ux-events-store.ts';
import { whenTelemetryWritten } from './track.ts';

/*
 * Epic 18, Story 18.1 (AD-28): draining the usage-event queue. After every sync cycle that
 * ran, `flushTelemetry` posts the oldest events in batches of at most `TELEMETRY_BATCH_MAX`;
 * on `visibilitychange: hidden`, `beaconTelemetry` hands one batch to `sendBeacon`. A batch
 * is deleted on a 2xx and on any 4xx (an invalid batch is dropped, never retried) and kept on
 * a 5xx or when the network fails. One flush at a time, and a row in flight is never sent
 * by another path: events are never posted twice concurrently.
 */

/** sendBeacon's quota is 64 KiB per page; a beacon carries at most this many bytes. */
export const BEACON_MAX_BYTES = 60_000;

export interface TelemetryTransport {
  /** Resolves to the HTTP status; rejects when the request never completed. */
  post(events: readonly UxEvent[]): Promise<number>;
  /** `navigator.sendBeacon`: true when the browser queued the body. */
  beacon(url: string, body: Blob): boolean;
  online(): boolean;
}

export const browserTransport: TelemetryTransport = {
  post: postTelemetry,
  beacon: beaconTelemetryBody,
  online: () => typeof navigator === 'undefined' || navigator.onLine !== false,
};

/** Ids of rows a flush or a beacon is sending right now. */
const inFlight = new Set<number>();
let running: Promise<void> | null = null;

/** The events as the route takes them: the queue's key left out. */
function payloadOf(rows: readonly QueuedUxEvent[]): UxEvent[] {
  return rows.map((row) => {
    const event: Partial<QueuedUxEvent> = { ...row };
    delete event.id;
    return event as UxEvent;
  });
}

/** Every batch the queue can hold, plus one: a flush never loops on rows tracked while it runs. */
const MAX_BATCHES_PER_FLUSH = Math.ceil(UX_EVENTS_CAP / TELEMETRY_BATCH_MAX) + 1;

async function drain(db: AppDatabase, transport: TelemetryTransport): Promise<void> {
  // What was tracked before this flush started is queued first, so it leaves with it.
  await whenTelemetryWritten();
  for (let batch = 0; batch < MAX_BATCHES_PER_FLUSH; batch += 1) {
    const rows = await oldestUxEvents(db, TELEMETRY_BATCH_MAX, inFlight);
    if (rows.length === 0) return;
    const ids = rows.map((row) => row.id);
    for (const id of ids) inFlight.add(id);
    try {
      let status: number;
      try {
        status = await transport.post(payloadOf(rows));
      } catch {
        return; // No network: the rows stay for the next flush.
      }
      if (status >= 500) return; // The server failed: the rows stay.
      await deleteUxEvents(db, ids);
    } finally {
      for (const id of ids) inFlight.delete(id);
    }
    if (rows.length < TELEMETRY_BATCH_MAX) return;
  }
}

/**
 * Posts the queue to `POST /api/telemetry`. A call while a flush runs starts nothing and
 * resolves with that flush. Never rejects.
 */
export function flushTelemetry(db: AppDatabase, transport: TelemetryTransport = browserTransport): Promise<void> {
  if (running !== null) return running;
  const flush = drain(db, transport)
    .catch(() => undefined)
    .finally(() => {
      running = null;
    });
  running = flush;
  return flush;
}

/** The oldest rows whose JSON array fits in `maxBytes`, and that JSON. */
function fitting(rows: readonly QueuedUxEvent[], maxBytes: number): { rows: QueuedUxEvent[]; json: string } {
  const encoder = new TextEncoder();
  const taken: QueuedUxEvent[] = [];
  const parts: string[] = [];
  let bytes = 2; // `[` and `]`
  for (const row of rows) {
    const part = JSON.stringify(payloadOf([row])[0]);
    const size = encoder.encode(part).length + (parts.length === 0 ? 0 : 1);
    if (bytes + size > maxBytes) break;
    bytes += size;
    parts.push(part);
    taken.push(row);
  }
  return { rows: taken, json: `[${parts.join(',')}]` };
}

/**
 * The hidden-tab path: one batch (at most `TELEMETRY_BATCH_MAX` events and `maxBytes`) to
 * `sendBeacon`, deleted only when the browser took it. Offline, nothing is sent: a beacon
 * that cannot leave would still answer true and lose its rows. Never rejects.
 */
export async function beaconTelemetry(db: AppDatabase, transport: TelemetryTransport = browserTransport, maxBytes: number = BEACON_MAX_BYTES): Promise<void> {
  try {
    if (!transport.online()) return;
    const { rows, json } = fitting(await oldestUxEvents(db, TELEMETRY_BATCH_MAX, inFlight), maxBytes);
    if (rows.length === 0) return;
    const ids = rows.map((row) => row.id);
    for (const id of ids) inFlight.add(id);
    try {
      if (transport.beacon(TELEMETRY_ROUTE.path, new Blob([json], { type: 'application/json' }))) await deleteUxEvents(db, ids);
    } finally {
      for (const id of ids) inFlight.delete(id);
    }
  } catch {
    // An event is never worth a failure.
  }
}
