// @vitest-environment node
import 'fake-indexeddb/auto';
import { draftKey } from '@app/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { dropAllDrafts, dropDraft, listDrafts, readDraft, saveDraft, saveDrafts } from './drafts.ts';
import { openDatabase, type AppDatabase } from './schema.ts';

/* FR-61: the per-user drafts table, keyed by surface and entity (AD-2). */

const ENTITY = '019966b0-0030-7000-8000-000000000001';
const OTHER = '019966b0-0030-7000-8000-000000000002';
const T0 = new Date('2026-09-22T12:00:00.000Z');

let counter = 0;
let db: AppDatabase;

beforeEach(async () => {
  const user = `019966b0-0031-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const stale = openDatabase(user);
  await stale.delete();
  db = openDatabase(user);
  await db.open();
});

describe('drafts store', () => {
  it('writes one row per target under its draft key', async () => {
    const target = { surface: 'ficha', entity_id: ENTITY, field: 'observacoes' };
    await saveDraft(db, target, 'texto em andamento', T0);
    expect(await readDraft(db, target)).toEqual({
      key: draftKey(target),
      surface: 'ficha',
      entity_id: ENTITY,
      value: 'texto em andamento',
      saved_at: T0.toISOString(),
    });
  });

  it('replaces the row of the same target and keeps a different one', async () => {
    const a = { surface: 'ficha', entity_id: ENTITY, field: 'observacoes' };
    const b = { surface: 'ficha', entity_id: OTHER, field: 'observacoes' };
    await saveDraft(db, a, 'um', T0);
    await saveDraft(db, a, 'dois', new Date('2026-09-22T12:05:00.000Z'));
    await saveDraft(db, b, 'outro', T0);
    expect((await readDraft(db, a))?.value).toBe('dois');
    expect((await readDraft(db, a))?.saved_at).toBe('2026-09-22T12:05:00.000Z');
    expect(await listDrafts(db)).toHaveLength(2);
  });

  it('drops the row when the value is empty, null or undefined', async () => {
    const target = { surface: 'ficha', entity_id: ENTITY };
    for (const empty of ['', null, undefined]) {
      await saveDraft(db, target, 'algo', T0);
      expect(await readDraft(db, target)).toBeDefined();
      await saveDraft(db, target, empty, T0);
      expect(await readDraft(db, target)).toBeUndefined();
    }
  });

  it('keeps a value that is not a string, such as a dialog state', async () => {
    const target = { surface: 'dialogo', entity_id: ENTITY };
    await saveDraft(db, target, { rows: [1, 2], open: true }, T0);
    expect((await readDraft(db, target))?.value).toEqual({ rows: [1, 2], open: true });
  });

  it('drops one target and, separately, all of them', async () => {
    const a = { surface: 'ficha', entity_id: ENTITY };
    const b = { surface: 'ficha', entity_id: OTHER };
    await saveDraft(db, a, 'um', T0);
    await saveDraft(db, b, 'dois', T0);
    await dropDraft(db, a);
    expect(await listDrafts(db)).toHaveLength(1);
    await dropAllDrafts(db);
    expect(await listDrafts(db)).toHaveLength(0);
  });

  it('dropping a target that has no row is not an error', async () => {
    await expect(dropDraft(db, { surface: 'ficha', entity_id: ENTITY })).resolves.toBeUndefined();
  });

  // A tab-hide writes every registered source at once: one transaction, so a discarded
  // tab cannot keep the first draft and lose the rest.
  it('writes every source of one tab-hide in a single transaction', async () => {
    await saveDrafts(
      db,
      [
        { target: { surface: 'ficha', entity_id: ENTITY, field: 'a' }, value: 'um' },
        { target: { surface: 'ficha', entity_id: ENTITY, field: 'b' }, value: 'dois' },
        { target: { surface: 'dialogo', entity_id: OTHER }, value: { aberto: true } },
      ],
      T0,
    );
    const rows = await listDrafts(db);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.saved_at)).toEqual([T0.toISOString(), T0.toISOString(), T0.toISOString()]);
  });

  it('drops and writes in the same batch, and writing none is not an error', async () => {
    await saveDraft(db, { surface: 'ficha', entity_id: ENTITY }, 'para apagar', T0);
    await saveDrafts(
      db,
      [
        { target: { surface: 'ficha', entity_id: ENTITY }, value: null },
        { target: { surface: 'ficha', entity_id: OTHER }, value: 'para manter' },
      ],
      T0,
    );
    expect(await readDraft(db, { surface: 'ficha', entity_id: ENTITY })).toBeUndefined();
    expect((await readDraft(db, { surface: 'ficha', entity_id: OTHER }))?.value).toBe('para manter');
    await expect(saveDrafts(db, [], T0)).resolves.toBeUndefined();
  });

  it('is reachable through the version 4 [surface+entity_id] index', async () => {
    await saveDraft(db, { surface: 'ficha', entity_id: ENTITY, field: 'a' }, 'um', T0);
    await saveDraft(db, { surface: 'ficha', entity_id: ENTITY, field: 'b' }, 'dois', T0);
    await saveDraft(db, { surface: 'ficha', entity_id: OTHER, field: 'a' }, 'tres', T0);
    expect(await db.drafts.where('[surface+entity_id]').equals(['ficha', ENTITY]).count()).toBe(2);
  });
});
