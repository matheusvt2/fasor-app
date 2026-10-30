// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type AppDatabase } from '../db/schema.ts';
import { queuedUxEvents } from '../db/ux-events-store.ts';
import { observeReadingResults, resetReadingResultsForTests } from './readings.ts';
import { configureTelemetry, resetTelemetryForTests, whenTelemetryWritten } from './track.ts';

const DEVICE = '019966b0-0033-7000-8000-0000000000dd';
const RELATORIO = '019966b0-0033-7000-8000-000000000071';
const BLOCK = '019966b0-0033-7000-8000-000000000072';
const CAPTURED = '2026-10-29T12:00:00.000Z';

let counter = 0;
let db: AppDatabase;

async function putPhoto(id: string, status: string, kind = 'plate'): Promise<void> {
  await db.entities.put({
    entity: 'file',
    id,
    relatorio_id: RELATORIO,
    project_id: null,
    removed_at: null,
    row: { kind: 'photo', captured_at: CAPTURED, block_id: BLOCK, reading_kind: kind, reading_status: status } as never,
  });
}

beforeEach(async () => {
  resetTelemetryForTests();
  resetReadingResultsForTests();
  db = openDatabase(`019966b0-0033-7000-8000-${(++counter).toString(16).padStart(12, '0')}`);
  await db.open();
  configureTelemetry({ db, deviceId: DEVICE });
});

afterEach(() => {
  configureTelemetry(null);
  db.close();
});

const events = async () => {
  await whenTelemetryWritten();
  return (await queuedUxEvents(db)).map(({ name, kind, outcome, duration_ms, relatorio_id, block_id }) => ({ name, kind, outcome, duration_ms, relatorio_id, block_id }));
};

describe('reading results (Story 18.1)', () => {
  it('tracks nothing on the first look, then a reading_result and its wait when a pending reading lands', async () => {
    await putPhoto('019966b0-0033-7000-8000-0000000000a1', 'running');
    await putPhoto('019966b0-0033-7000-8000-0000000000a2', 'done', 'display');
    await observeReadingResults(db, Date.parse(CAPTURED) + 1_000);
    expect(await events()).toEqual([]);

    await putPhoto('019966b0-0033-7000-8000-0000000000a1', 'done');
    await putPhoto('019966b0-0033-7000-8000-0000000000a3', 'failed', 'caption');
    await observeReadingResults(db, Date.parse(CAPTURED) + 7_500);
    // The plate landed; a photo first seen already failed (pulled from elsewhere) was never waited for here.
    expect(await events()).toEqual([
      { name: 'reading_result', kind: 'plate', outcome: 'ok', duration_ms: undefined, relatorio_id: RELATORIO, block_id: BLOCK },
      { name: 'wait', kind: 'reading', outcome: 'ok', duration_ms: 7_500, relatorio_id: RELATORIO, block_id: BLOCK },
    ]);

    // A landed reading is tracked once.
    await observeReadingResults(db, Date.parse(CAPTURED) + 9_000);
    expect(await events()).toHaveLength(2);
  });

  it('tracks a failed reading as fail', async () => {
    await putPhoto('019966b0-0033-7000-8000-0000000000b1', 'queued', 'nc_obs');
    await observeReadingResults(db, Date.parse(CAPTURED));
    await putPhoto('019966b0-0033-7000-8000-0000000000b1', 'failed', 'nc_obs');
    await observeReadingResults(db, Date.parse(CAPTURED) + 2_000);
    expect((await events()).map((e) => [e.name, e.kind, e.outcome])).toEqual([
      ['reading_result', 'nc_obs', 'fail'],
      ['wait', 'reading', 'fail'],
    ]);
  });
});
