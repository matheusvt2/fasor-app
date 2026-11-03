// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type AppDatabase } from '../db/schema.ts';
import { queuedUxEvents } from '../db/ux-events-store.ts';
import { observeReadingResults, resetReadingResultsForTests } from './readings.ts';
import { configureTelemetry, resetTelemetryForTests, whenTelemetryWritten } from './track.ts';

const DEVICE = '019966b0-0033-7000-8000-0000000000dd';
const RELATORIO = '019966b0-0033-7000-8000-000000000071';
const BLOCK = '019966b0-0033-7000-8000-000000000072';
const CAPTURED = '2026-10-29T12:00:00.000Z';

let counter = 0;
let seq = 0;
let db: AppDatabase;

/** The photo as stored, without the pulled op that would name it (a change this device made and has not pulled back). */
async function storePhoto(id: string, status: string, kind = 'plate', capturedAt = CAPTURED): Promise<void> {
  await db.entities.put({
    entity: 'file',
    id,
    relatorio_id: RELATORIO,
    project_id: null,
    removed_at: null,
    row: { kind: 'photo', captured_at: capturedAt, block_id: BLOCK, reading_kind: kind, reading_status: status } as never,
  });
}

/** The photo as a pull leaves it: the entity and the pulled op on it, with a rising `seq`. */
async function putPhoto(id: string, status: string, kind = 'plate', capturedAt = CAPTURED): Promise<void> {
  await storePhoto(id, status, kind, capturedAt);
  seq += 1;
  await db.remote_ops.put({ op_id: `019966b0-0033-7000-8000-${seq.toString(16).padStart(12, '0')}`, seq, targets: [`file:${id}`], path: `file/${id}/reading_status` } as never);
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

  it('tracks a photo shot after the last look whose reading landed before the next one', async () => {
    const lookAt = Date.parse(CAPTURED);
    await observeReadingResults(db, lookAt);
    // Shot 3 s after the look, pushed, read and pulled within the next cycle.
    await putPhoto('019966b0-0033-7000-8000-0000000000c1', 'done', 'display', new Date(lookAt + 3_000).toISOString());
    await observeReadingResults(db, lookAt + 9_000);
    expect((await events()).map((e) => [e.name, e.kind, e.outcome, e.duration_ms])).toEqual([
      ['reading_result', 'display', 'ok', undefined],
      ['wait', 'reading', 'ok', 6_000],
    ]);
  });
});

describe('reading results read only what may have landed (E18-A1, R-A14)', () => {
  it('after the baseline, a look scans no photo table: it reads the pending photos and the pulled ones by key', async () => {
    const lookAt = Date.parse(CAPTURED) + 1_000;
    const pending = '019966b0-0033-7000-8000-0000000000d1';
    const landedBefore = '019966b0-0033-7000-8000-0000000000d2';
    const untouched = '019966b0-0033-7000-8000-0000000000d3';
    await putPhoto(pending, 'running');
    await putPhoto(landedBefore, 'done');
    await putPhoto(untouched, 'done', 'display');
    await observeReadingResults(db, lookAt);
    expect(await events()).toEqual([]);

    const where = vi.spyOn(db.entities, 'where');
    const bulkGet = vi.spyOn(db.entities, 'bulkGet');
    // The pending plate lands through the pull; a display is shot after the look and pulled read.
    await putPhoto(pending, 'done');
    const shot = '019966b0-0033-7000-8000-0000000000d4';
    await putPhoto(shot, 'done', 'display', new Date(lookAt + 2_000).toISOString());
    // A photo neither pending nor pulled is not read, even when its row changed under the look.
    await storePhoto(untouched, 'done', 'display', new Date(lookAt + 3_000).toISOString());
    await observeReadingResults(db, lookAt + 8_000);

    expect(where).not.toHaveBeenCalled();
    const read = bulkGet.mock.calls.flatMap(([keys]) => (keys as [string, string][]).map(([, id]) => id));
    expect(new Set(read)).toEqual(new Set([pending, shot]));
    expect((await events()).map((e) => [e.name, e.kind, e.outcome, e.duration_ms])).toEqual([
      ['reading_result', 'plate', 'ok', undefined],
      ['wait', 'reading', 'ok', 8_000 + 1_000],
      ['reading_result', 'display', 'ok', undefined],
      ['wait', 'reading', 'ok', 6_000],
    ]);
  });

  it('a look with nothing pending and nothing pulled reads no photo at all', async () => {
    await putPhoto('019966b0-0033-7000-8000-0000000000e1', 'done');
    await observeReadingResults(db, Date.parse(CAPTURED) + 1_000);
    const where = vi.spyOn(db.entities, 'where');
    const bulkGet = vi.spyOn(db.entities, 'bulkGet');
    await observeReadingResults(db, Date.parse(CAPTURED) + 61_000);
    expect(where).not.toHaveBeenCalled();
    expect(bulkGet).not.toHaveBeenCalled();
    expect(await events()).toEqual([]);
  });
});
