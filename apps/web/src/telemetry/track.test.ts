// @vitest-environment node
import 'fake-indexeddb/auto';
import { uxEventSchema } from '@app/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type AppDatabase } from '../db/schema.ts';
import { queuedUxEvents } from '../db/ux-events-store.ts';
import { configureTelemetry, PRE_CONFIG_BUFFER_MAX, resetTelemetryForTests, SESSION_ID, track, whenTelemetryWritten } from './track.ts';

const DEVICE = '019966b0-0030-7000-8000-0000000000dd';
const RELATORIO = '019966b0-0030-7000-8000-000000000071';

let counter = 0;
async function freshDb(): Promise<AppDatabase> {
  const db = openDatabase(`019966b0-0030-7000-8000-${(++counter).toString(16).padStart(12, '0')}`);
  await db.open();
  return db;
}

const consoleSpies = () => (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) => vi.spyOn(console, method));

beforeEach(() => resetTelemetryForTests());
afterEach(() => {
  configureTelemetry(null);
  vi.restoreAllMocks();
});

describe('track (Story 18.1)', () => {
  it('queues a full event: v, instant, the session and device ids, the app version and the screen', async () => {
    const db = await freshDb();
    configureTelemetry({ db, deviceId: DEVICE });
    const before = Date.now();
    track({ name: 'action', screen: 'ficha', target: 'ficha.mark_c', relatorio_id: RELATORIO });
    await whenTelemetryWritten();
    const [row] = await queuedUxEvents(db);
    expect(row).toMatchObject({ v: 1, session_id: SESSION_ID, device_id: DEVICE, app_version: 'dev', name: 'action', screen: 'ficha', target: 'ficha.mark_c', relatorio_id: RELATORIO });
    expect(Date.parse(row!.ts)).toBeGreaterThanOrEqual(before);
    const event: Record<string, unknown> = { ...row! };
    delete event.id;
    expect(uxEventSchema.safeParse(event).success).toBe(true);
    expect(Object.values(event)).not.toContain(undefined);
  });

  it('returns nothing to await and never throws, even on a closed database, without a word on the console', async () => {
    const spies = consoleSpies();
    const db = await freshDb();
    configureTelemetry({ db, deviceId: DEVICE });
    db.close();
    const returned: unknown = track({ name: 'action', screen: 'home', target: 'home.card_open' });
    expect(returned).toBeUndefined();
    expect(() => track({ name: 'action', screen: 'home', target: 'home.card_open' })).not.toThrow();
    await whenTelemetryWritten();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it('drops an event the schema refuses and keeps the next one', async () => {
    const db = await freshDb();
    configureTelemetry({ db, deviceId: DEVICE });
    track({ name: 'action', screen: 'home', target: 'Transformador 1' });
    track({ name: 'wait', screen: 'ficha', kind: 'reading', duration_ms: -3 });
    track({ name: 'action', screen: 'home', target: 'home.continue' });
    await whenTelemetryWritten();
    expect((await queuedUxEvents(db)).map((e) => e.target)).toEqual(['home.continue']);
  });

  it('caps the queue at 5000 events, dropping the oldest, silently', async () => {
    const spies = consoleSpies();
    const db = await freshDb();
    const old = Array.from({ length: 5000 }, (_, i) => ({
      v: 1 as const,
      ts: new Date(Date.UTC(2026, 9, 29, 0, 0, i)).toISOString(),
      session_id: DEVICE,
      device_id: DEVICE,
      app_version: 'dev',
      name: 'screen_view' as const,
      screen: 'home' as const,
    }));
    await db.ux_events.bulkAdd(old);
    const firstId = (await db.ux_events.toCollection().first())!.id;
    configureTelemetry({ db, deviceId: DEVICE });
    track({ name: 'action', screen: 'home', target: 'home.summary' });
    await whenTelemetryWritten();
    expect(await db.ux_events.count()).toBe(5000);
    expect(await db.ux_events.get(firstId!)).toBeUndefined();
    expect((await db.ux_events.toCollection().last())?.target).toBe('home.summary');
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it('holds at most 50 events before the device is known and queues them, with its id, once it is', async () => {
    for (let i = 0; i < PRE_CONFIG_BUFFER_MAX + 10; i += 1) track({ name: 'wait', screen: 'home', kind: 'sync', duration_ms: i });
    const db = await freshDb();
    configureTelemetry({ db, deviceId: DEVICE });
    await whenTelemetryWritten();
    const rows = await queuedUxEvents(db);
    expect(PRE_CONFIG_BUFFER_MAX).toBe(50);
    expect(rows.map((r) => r.duration_ms)).toEqual(Array.from({ length: 50 }, (_, i) => i + 10));
    expect(rows.every((r) => r.device_id === DEVICE)).toBe(true);
  });

  it('stops writing once unconfigured (sign-out) and buffers again', async () => {
    const db = await freshDb();
    configureTelemetry({ db, deviceId: DEVICE });
    configureTelemetry(null);
    track({ name: 'action', screen: 'home', target: 'home.summary' });
    await whenTelemetryWritten();
    expect(await db.ux_events.count()).toBe(0);
  });
});
