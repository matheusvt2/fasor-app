// @vitest-environment node
import 'fake-indexeddb/auto';
import { makeOp, SERVER_DEVICE_ID, type BlockRow, type Op, type SuggestionRow } from '@app/domain';
import { BLOCK_1_ID, COMPANY_ID, READING_RUN_ID, PHOTO_ID, RELATORIO_ID, replaySmall, USER_ID } from '@app/domain/fixtures/replay-small';
import { describe, expect, it } from 'vitest';
import { commitBatch } from './commit.ts';
import { openDatabase, type AppDatabase } from './schema.ts';
import { autoConfirmPending, readingCountRows } from './suggestion-store.ts';
import { applyPulled } from './sync-store.ts';

/*
 * 8.1/8.2-UNIT: the device auto-confirm sweep after a pull. A local pending suggestion whose
 * nameplate target holds an equal value -- typed first, or written later by any path (a copy
 * chip) -- is confirmed once, as the signed-in user, with `meta.auto`; a different value, an
 * empty target, a row no longer pending, a removed block or an issued relatório are left
 * alone, and a sweep whose commit threw takes the row again the next time.
 */

let userCounter = 0;
async function freshDb(): Promise<AppDatabase> {
  const user = `019966b0-0083-7000-8000-${(++userCounter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  return openDatabase(user);
}

/** One id sequence and clock for the whole file: every commit mints fresh op ids. */
let minted = 0;
let clock = Date.parse('2026-09-26T15:00:00.000Z');
const deps = () => ({ newId: () => `019966b0-0084-7000-8000-${(++minted).toString(16).padStart(12, '0')}`, now: () => new Date((clock += 1000)) });

const AUTHOR = { id: USER_ID, companyId: COMPANY_ID };
let seq = 0;
let sug = 0;

/** The replay-small log up to the first block's create, pulled from the server. */
async function seed(db: AppDatabase): Promise<void> {
  const upTo = replaySmall.log.findIndex((op) => op.path === `block/${BLOCK_1_ID}` && op.kind === 'create');
  await applyPulled(
    db,
    replaySmall.log.slice(0, upTo + 1).map((op) => ({ ...op, seq: ++seq })),
  );
}

function serverSuggestion(field: string, value: SuggestionRow['value'], extra: Partial<SuggestionRow> = {}): Op {
  const id = `019966b0-0085-7000-8000-${(++sug).toString(16).padStart(12, '0')}`;
  const row: SuggestionRow = {
    id,
    relatorio_id: RELATORIO_ID,
    target_path: `sheet/${BLOCK_1_ID}/nameplate/${field}`,
    value,
    trust: 'suggested',
    mode: 'fill',
    source: { photo_id: PHOTO_ID, bbox: [0.1, 0.1, 0.2, 0.2], ocr_token_ids: ['t0'], reading_run_id: READING_RUN_ID },
    status: 'pending',
    prompt_version: 'test-1',
    hint: null,
    ...extra,
  };
  const op = makeOp(
    {
      kind: 'create',
      scope: 'relatorio',
      company_id: COMPANY_ID,
      project_id: null,
      relatorio_id: RELATORIO_ID,
      path: `suggestion/${id}`,
      value: row as never,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: 'system:reading',
      device_id: SERVER_DEVICE_ID,
    },
    { newId: () => `019966b0-0086-7000-8000-${(++sug).toString(16).padStart(12, '0')}`, now: new Date('2026-09-26T16:00:00.000Z') },
  );
  return { ...op, seq: ++seq };
}

async function type(db: AppDatabase, field: string, value: unknown): Promise<void> {
  await commitBatch(
    db,
    [
      {
        kind: 'put',
        scope: 'relatorio',
        company_id: COMPANY_ID,
        project_id: null,
        relatorio_id: RELATORIO_ID,
        path: `sheet/${BLOCK_1_ID}/nameplate/${field}`,
        value: value as never,
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: USER_ID,
      },
    ],
    deps(),
  );
}

async function block(db: AppDatabase): Promise<BlockRow> {
  return (await db.entities.get(['block', BLOCK_1_ID]))!.row as BlockRow;
}

describe('8.1/8.2-UNIT autoConfirmPending', () => {
  it('confirms an equal suggestion on a filled field once, with meta.auto, and leaves different and empty targets pending', async () => {
    const db = await freshDb();
    await seed(db);
    await type(db, 'fabricacao', 'WEG S.A.');
    await type(db, 'tensao_nominal_at', { raw: '13.8', unit: 'kV', state: 'measured' });
    const equal = serverSuggestion('fabricacao', 'weg  s.a.');
    const different = serverSuggestion('tensao_nominal_at', { raw: '15', unit: 'kV', state: 'measured' });
    const empty = serverSuggestion('n_serie', 'SU1240998');
    const pulled = [equal, different, empty];
    await applyPulled(db, pulled);

    expect(await autoConfirmPending(db, AUTHOR, deps())).toEqual([(equal.value as SuggestionRow).id]);

    const outbox = (await db.outbox.toArray()).filter((row) => row.meta?.auto === true);
    expect(outbox.map((row) => [row.path, row.value])).toEqual([
      [`suggestion/${(equal.value as SuggestionRow).id}/status`, 'confirmed'],
      // The engineer's own spelling is kept; only the provenance is new.
      [`sheet/${BLOCK_1_ID}/nameplate/fabricacao`, 'WEG S.A.'],
    ]);
    expect(new Set(outbox.map((row) => row.batch_id)).size).toBe(1);
    expect(outbox.every((row) => row.actor_id === USER_ID)).toBe(true);
    expect(outbox[1]!.meta).toEqual({ source_suggestion_id: (equal.value as SuggestionRow).id, auto: true });
    expect((await block(db)).sheet.nameplate.fabricacao).toMatchObject({ value: 'WEG S.A.', source_suggestion_id: (equal.value as SuggestionRow).id });
    expect(((await db.entities.get(['suggestion', (different.value as SuggestionRow).id]))!.row as SuggestionRow).status).toBe('pending');
    expect(((await db.entities.get(['suggestion', (empty.value as SuggestionRow).id]))!.row as SuggestionRow).status).toBe('pending');

    // A second sweep confirms nothing: the row is no longer pending.
    expect(await autoConfirmPending(db, AUTHOR, deps())).toEqual([]);
    db.close();
  });

  it('skips an issued relatório and a removed block', async () => {
    const db = await freshDb();
    await seed(db);
    await type(db, 'fabricacao', 'WEG S.A.');
    const equal = serverSuggestion('fabricacao', 'WEG S.A.');
    await applyPulled(db, [equal]);
    const record = (await db.entities.get(['relatorio', RELATORIO_ID]))!;
    await db.entities.put({ ...record, row: { ...record.row, status: 'emitido' } as never });
    expect(await autoConfirmPending(db, AUTHOR, deps())).toEqual([]);
    await db.entities.put(record);
    const blockRecord = (await db.entities.get(['block', BLOCK_1_ID]))!;
    await db.entities.put({ ...blockRecord, row: { ...blockRecord.row, removed_at: '2026-09-26T17:00:00.000Z' } as never });
    expect(await autoConfirmPending(db, AUTHOR, deps())).toEqual([]);
    db.close();
  });

  it('confirms a suggestion whose target a copy chip later filled with an equal value, and retries after a thrown commit', async () => {
    const db = await freshDb();
    await seed(db);
    const pulled = serverSuggestion('n_serie', 'SU1240998');
    await applyPulled(db, [pulled]);
    const id = (pulled.value as SuggestionRow).id;
    // An empty target: a fill, left for the engineer's tap.
    expect(await autoConfirmPending(db, AUTHOR, deps())).toEqual([]);
    // A copy chip writes the same value (no suggestion meta): now equal.
    await type(db, 'n_serie', 'SU1240998');
    // The commit throws once (the id source fails): nothing is written, the row stays pending.
    const failing = { ...deps(), newId: () => {
      throw new Error('storage refused');
    } };
    await expect(autoConfirmPending(db, AUTHOR, failing)).rejects.toThrow('storage refused');
    expect(((await db.entities.get(['suggestion', id]))!.row as SuggestionRow).status).toBe('pending');
    // The next sweep takes it again.
    expect(await autoConfirmPending(db, AUTHOR, deps())).toEqual([id]);
    expect((await block(db)).sheet.nameplate.n_serie).toMatchObject({ value: 'SU1240998', source_suggestion_id: id });
    db.close();
  });

  it('reads the suggestion statuses and the live photo readings for the Sync status counts', async () => {
    const db = await freshDb();
    await seed(db);
    await applyPulled(db, [serverSuggestion('n_serie', 'A'), serverSuggestion('tipo', 'B', { status: 'confirmed' })]);
    const rows = await readingCountRows(db);
    expect(rows.suggestions.map((row) => row.status).sort()).toEqual(['other', 'pending']);
    expect(rows.photos).toEqual([]);
    db.close();
  });
});
