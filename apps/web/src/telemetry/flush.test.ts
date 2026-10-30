// @vitest-environment node
import 'fake-indexeddb/auto';
import { TELEMETRY_BATCH_MAX, TELEMETRY_ROUTE, uxEventSchema, type UxEvent } from '@app/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type AppDatabase } from '../db/schema.ts';
import { appendUxEvents, queuedUxEvents } from '../db/ux-events-store.ts';
import { BEACON_MAX_BYTES, beaconTelemetry, flushTelemetry, type TelemetryTransport } from './flush.ts';

const DEVICE = '019966b0-0031-7000-8000-0000000000dd';

let counter = 0;
async function freshDb(): Promise<AppDatabase> {
  const db = openDatabase(`019966b0-0031-7000-8000-${(++counter).toString(16).padStart(12, '0')}`);
  await db.open();
  return db;
}

const event = (i: number): UxEvent => ({
  v: 1,
  ts: new Date(Date.UTC(2026, 9, 29, 12, 0, 0, i)).toISOString(),
  session_id: DEVICE,
  device_id: DEVICE,
  app_version: 'dev',
  name: 'wait',
  screen: 'ficha',
  kind: 'reading',
  duration_ms: i,
});

async function queue(db: AppDatabase, count: number): Promise<void> {
  await appendUxEvents(db, Array.from({ length: count }, (_, i) => event(i)));
}

/** A fake transport: each post answers the next status of `answers` (a thrown one is a network failure). */
function fakeTransport(answers: (number | 'network')[], options: { beacon?: boolean; online?: boolean } = {}) {
  const posts: UxEvent[][] = [];
  const beacons: { url: string; body: Blob }[] = [];
  let release: (() => void) | null = null;
  let hold: Promise<void> | null = null;
  const transport: TelemetryTransport = {
    post: async (events) => {
      posts.push(events.map((e) => ({ ...e })));
      if (hold !== null) await hold;
      const answer = answers.shift() ?? 204;
      if (answer === 'network') throw new TypeError('Failed to fetch');
      return answer;
    },
    beacon: (url, body) => {
      beacons.push({ url, body });
      return options.beacon ?? true;
    },
    online: () => options.online ?? true,
  };
  return {
    transport,
    posts,
    beacons,
    holdPosts: () => {
      hold = new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    release: () => release?.(),
  };
}

let db: AppDatabase;
beforeEach(async () => {
  db = await freshDb();
});

describe('flushTelemetry (Story 18.1)', () => {
  it('posts the queue in batches of at most 200 and deletes each batch on a 2xx', async () => {
    await queue(db, 450);
    const fake = fakeTransport([204, 200, 204]);
    await flushTelemetry(db, fake.transport);
    expect(fake.posts.map((p) => p.length)).toEqual([TELEMETRY_BATCH_MAX, TELEMETRY_BATCH_MAX, 50]);
    expect(fake.posts[0]![0]).not.toHaveProperty('id');
    for (const batch of fake.posts) for (const e of batch) expect(uxEventSchema.safeParse(e).success).toBe(true);
    // Oldest first.
    expect(fake.posts.flat().map((e) => e.duration_ms)).toEqual(Array.from({ length: 450 }, (_, i) => i));
    expect(await db.ux_events.count()).toBe(0);
  });

  it('drops a batch the server refuses with a 4xx and goes on', async () => {
    await queue(db, 250);
    const fake = fakeTransport([400, 204]);
    await flushTelemetry(db, fake.transport);
    expect(fake.posts.map((p) => p.length)).toEqual([200, 50]);
    expect(await db.ux_events.count()).toBe(0);
  });

  it('drops on a 401 and a 429 too (every 4xx)', async () => {
    await queue(db, 3);
    await flushTelemetry(db, fakeTransport([401]).transport);
    expect(await db.ux_events.count()).toBe(0);
    await queue(db, 3);
    await flushTelemetry(db, fakeTransport([429]).transport);
    expect(await db.ux_events.count()).toBe(0);
  });

  it('keeps the batch on a 5xx and stops', async () => {
    await queue(db, 250);
    const fake = fakeTransport([503]);
    await flushTelemetry(db, fake.transport);
    expect(fake.posts).toHaveLength(1);
    expect(await db.ux_events.count()).toBe(250);
  });

  it('keeps the batch when the network fails, and sends it on the next flush', async () => {
    await queue(db, 10);
    await flushTelemetry(db, fakeTransport(['network']).transport);
    expect(await db.ux_events.count()).toBe(10);
    const next = fakeTransport([204]);
    await flushTelemetry(db, next.transport);
    expect(next.posts.map((p) => p.length)).toEqual([10]);
    expect(await db.ux_events.count()).toBe(0);
  });

  it('never runs two flushes at once: a second call while one is in flight sends nothing', async () => {
    await queue(db, 5);
    const fake = fakeTransport([204]);
    fake.holdPosts();
    const first = flushTelemetry(db, fake.transport);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fake.posts).toHaveLength(1);
    const second = flushTelemetry(db, fake.transport);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fake.posts).toHaveLength(1);
    fake.release();
    await Promise.all([first, second]);
    expect(fake.posts).toHaveLength(1);
    expect(await db.ux_events.count()).toBe(0);
  });

  it('never rejects, even on a closed database', async () => {
    db.close();
    await expect(flushTelemetry(db, fakeTransport([204]).transport)).resolves.toBeUndefined();
  });
});

describe('beaconTelemetry (Story 18.1, the hidden-tab path)', () => {
  it('beacons the oldest batch as JSON to the route and deletes it when the browser takes it', async () => {
    await queue(db, 250);
    const fake = fakeTransport([]);
    await beaconTelemetry(db, fake.transport);
    expect(fake.beacons).toHaveLength(1);
    expect(fake.beacons[0]!.url).toBe(TELEMETRY_ROUTE.path);
    expect(fake.beacons[0]!.body.type).toBe('application/json');
    const sent = JSON.parse(await fake.beacons[0]!.body.text()) as UxEvent[];
    expect(sent).toHaveLength(200);
    expect(sent.map((e) => e.duration_ms)).toEqual(Array.from({ length: 200 }, (_, i) => i));
    expect(sent[0]).not.toHaveProperty('id');
    expect((await queuedUxEvents(db)).map((e) => e.duration_ms)).toEqual(Array.from({ length: 50 }, (_, i) => i + 200));
  });

  it('keeps the rows when the browser refuses the beacon', async () => {
    await queue(db, 3);
    const fake = fakeTransport([], { beacon: false });
    await beaconTelemetry(db, fake.transport);
    expect(fake.beacons).toHaveLength(1);
    expect(await db.ux_events.count()).toBe(3);
  });

  it('sends nothing while offline, so no row is lost to a beacon that cannot leave', async () => {
    await queue(db, 3);
    const fake = fakeTransport([], { online: false });
    await beaconTelemetry(db, fake.transport);
    expect(fake.beacons).toHaveLength(0);
    expect(await db.ux_events.count()).toBe(3);
  });

  it('caps the payload under the beacon quota (60 000 bytes), taking the oldest events that fit', async () => {
    expect(BEACON_MAX_BYTES).toBe(60_000);
    // At about 300 bytes an event, 200 events of the longest target run past the quota.
    await appendUxEvents(db, Array.from({ length: 200 }, (_, i) => ({ ...event(i + 1000), target: `x${'y'.repeat(62)}` })));
    const fake = fakeTransport([]);
    await beaconTelemetry(db, fake.transport);
    const body = fake.beacons[0]!.body;
    expect(body.size).toBeLessThanOrEqual(BEACON_MAX_BYTES);
    const sent = JSON.parse(await body.text()) as UxEvent[];
    expect(sent.length).toBeGreaterThan(150);
    expect(sent.length).toBeLessThan(200);
    expect(sent.map((e) => e.duration_ms)).toEqual(Array.from({ length: sent.length }, (_, i) => i + 1000));
    expect(await db.ux_events.count()).toBe(200 - sent.length);
  });

  it('with a smaller budget, still the oldest that fit and never an event cut in half', async () => {
    await queue(db, 50);
    const fake = fakeTransport([]);
    await beaconTelemetry(db, fake.transport, 1000);
    const sent = JSON.parse(await fake.beacons[0]!.body.text()) as UxEvent[];
    expect(fake.beacons[0]!.body.size).toBeLessThanOrEqual(1000);
    expect(sent.map((e) => e.duration_ms)).toEqual(Array.from({ length: sent.length }, (_, i) => i));
    expect(sent.length).toBeGreaterThan(0);
  });

  it('never beacons a batch a flush has in flight', async () => {
    await queue(db, 5);
    const fake = fakeTransport([204]);
    fake.holdPosts();
    const flushing = flushTelemetry(db, fake.transport);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await beaconTelemetry(db, fake.transport);
    expect(fake.beacons).toHaveLength(0);
    fake.release();
    await flushing;
    expect(await db.ux_events.count()).toBe(0);
  });
});
