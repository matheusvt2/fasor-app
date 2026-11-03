// @vitest-environment node
import 'fake-indexeddb/auto';
import { uxEventSchema } from '@app/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type AppDatabase } from '../db/schema.ts';
import { queuedUxEvents } from '../db/ux-events-store.ts';
import { configureTelemetry, resetTelemetryForTests, whenTelemetryWritten } from './track.ts';
import { enterRouteScreen, enterScreen, leaveScreen, resetViewsForTests, resumeScreen } from './views.ts';

/*
 * Story 18.4: the view tracker writes each `screen_view` when its screen is left, with how
 * long it stayed open and the screen shown before it.
 */

const DEVICE = '019966b0-0040-7000-8000-0000000000dd';
const RELATORIO = '019966b0-0040-7000-8000-000000000071';
const BLOCK = '019966b0-0040-7000-8000-000000000072';

let counter = 0;
let db: AppDatabase;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['performance'] });
  resetTelemetryForTests();
  resetViewsForTests();
  db = openDatabase(`019966b0-0040-7000-8000-${(++counter).toString(16).padStart(12, '0')}`);
  await db.open();
  configureTelemetry({ db, deviceId: DEVICE });
});

afterEach(() => {
  vi.useRealTimers();
  configureTelemetry(null);
  db.close();
});

async function views() {
  await whenTelemetryWritten();
  const rows = (await queuedUxEvents(db)).filter((event) => event.name === 'screen_view');
  for (const row of rows) {
    const event: Record<string, unknown> = { ...row };
    delete event.id;
    expect(uxEventSchema.safeParse(event).success).toBe(true);
  }
  return rows.map(({ screen, from, duration_ms, relatorio_id, block_id }) => ({ screen, from, duration_ms, relatorio_id, block_id }));
}

describe('the view tracker (Story 18.4)', () => {
  it('writes nothing on entering; leaving a screen writes its view with its duration, the first one without from', async () => {
    enterScreen('home');
    expect(await views()).toEqual([]);
    vi.advanceTimersByTime(4000);
    enterScreen('sumario', { relatorio_id: RELATORIO });
    vi.advanceTimersByTime(1500);
    enterScreen('ficha', { relatorio_id: RELATORIO, block_id: BLOCK });
    expect(await views()).toEqual([
      { screen: 'home', from: undefined, duration_ms: 4000, relatorio_id: undefined, block_id: undefined },
      { screen: 'sumario', from: 'home', duration_ms: 1500, relatorio_id: RELATORIO, block_id: undefined },
    ]);
  });

  it('a hidden tab writes the open view; shown again, a view of the same screen opens with from equal to it', async () => {
    enterScreen('home');
    vi.advanceTimersByTime(1000);
    enterScreen('ficha', { relatorio_id: RELATORIO, block_id: BLOCK });
    vi.advanceTimersByTime(2000);
    leaveScreen();
    // Hidden: nothing open, a second leave writes nothing, time passes uncounted.
    leaveScreen();
    vi.advanceTimersByTime(60_000);
    resumeScreen();
    // A second resume opens nothing more.
    resumeScreen();
    vi.advanceTimersByTime(500);
    enterScreen('sumario', { relatorio_id: RELATORIO });
    expect(await views()).toEqual([
      { screen: 'home', from: undefined, duration_ms: 1000, relatorio_id: undefined, block_id: undefined },
      { screen: 'ficha', from: 'home', duration_ms: 2000, relatorio_id: RELATORIO, block_id: BLOCK },
      { screen: 'ficha', from: 'ficha', duration_ms: 500, relatorio_id: RELATORIO, block_id: BLOCK },
    ]);
  });

  it('a screen entered while the tab is hidden comes from the screen the tab left', async () => {
    enterScreen('home');
    leaveScreen();
    enterScreen('templates');
    leaveScreen();
    expect((await views()).map(({ screen, from }) => [screen, from])).toEqual([
      ['home', undefined],
      ['templates', 'home'],
    ]);
  });

  it('a full-surface state enters and leaves through the same tracker, handing back to the route', async () => {
    enterScreen('home');
    vi.advanceTimersByTime(300);
    enterScreen('update', {}, 'surface');
    vi.advanceTimersByTime(700);
    enterRouteScreen();
    vi.advanceTimersByTime(100);
    leaveScreen();
    expect(await views()).toEqual([
      { screen: 'home', from: undefined, duration_ms: 300, relatorio_id: undefined, block_id: undefined },
      { screen: 'update', from: 'home', duration_ms: 700, relatorio_id: undefined, block_id: undefined },
      { screen: 'home', from: 'update', duration_ms: 100, relatorio_id: undefined, block_id: undefined },
    ]);
  });

  it('before any route, a full surface going hands back to nothing', async () => {
    enterScreen('recovery', {}, 'surface');
    enterRouteScreen();
    leaveScreen();
    expect((await views()).map(({ screen }) => screen)).toEqual(['recovery']);
  });
});
