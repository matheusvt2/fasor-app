import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';
import { COMPANY_ID, USER_ID } from '@app/domain/fixtures/replay-small';
import type { OpDraft } from '@app/domain';
import { describe, expect, it } from 'vitest';
import { commitFileBatch } from './commit.ts';
import { ensureLocalBlob, pendingUploads, previewBlob, readLocalBlob } from './file-store.ts';
import { openDatabase, type AppDatabase } from './schema.ts';

/*
 * 2.2-UNIT: the one-transaction ops+Blob write and the pending-upload query.
 */

const FILE_ID = '019966b0-0000-7000-8000-0000000000a1';
const INSTRUMENT_ID = '019966b0-0000-7000-8000-000000000005';

let counter = 0;
const newId = () => `019966b0-0044-7000-8000-${String(++counter).padStart(12, '0')}`;
const now = () => new Date('2026-09-22T12:00:00.000Z');

async function freshDb(): Promise<AppDatabase> {
  const db = openDatabase(`file-store-${++counter}`);
  await db.open();
  return db;
}

/*
 * Node's `Blob`, not jsdom's: `fake-indexeddb` clones through Node's `structuredClone`,
 * which knows Node's Blob and turns jsdom's into an empty object. The browser stores the
 * real thing either way; this only keeps the byte assertions below meaningful.
 */
const blobOf = (text: string): Blob => new NodeBlob([text]) as unknown as Blob;

const base: Omit<OpDraft, 'kind' | 'path' | 'value'> = {
  scope: 'company',
  company_id: COMPANY_ID,
  project_id: null,
  relatorio_id: null,
  prev_op_id: null,
  batch_id: null,
  meta: null,
  actor_id: USER_ID,
};

function fileOps(sha = 'deadbeef'): OpDraft[] {
  return [
    {
      ...base,
      kind: 'create',
      path: `file/${FILE_ID}`,
      value: {
        id: FILE_ID,
        company_id: COMPANY_ID,
        relatorio_id: null,
        kind: 'certificate',
        sha256: sha,
        mime: 'application/pdf',
        size: 4,
        uploaded_at: null,
        variants: null,
        removed_at: null,
      } as never,
    },
    { ...base, kind: 'put', path: `registry/instrument/${INSTRUMENT_ID}/certificate_file_id`, value: FILE_ID as never },
  ];
}

describe('2.2-UNIT-005 commitFileBatch', () => {
  it('writes the create op, the owner field op and the Blob in one batch', async () => {
    const db = await freshDb();
    const { batch_id, ops } = await commitFileBatch(
      db,
      { ops: fileOps(), blob: blobOf('abcd'), fileId: FILE_ID, fileName: '35102-25.pdf' },
      { newId, now },
    );

    expect(ops).toHaveLength(2);
    expect(ops.every((op) => op.batch_id === batch_id)).toBe(true);
    const outbox = await db.outbox.where('batch_id').equals(batch_id).toArray();
    expect(outbox.map((row) => row.path).sort()).toEqual(
      [`file/${FILE_ID}`, `registry/instrument/${INSTRUMENT_ID}/certificate_file_id`].sort(),
    );
    const blob = await readLocalBlob(db, FILE_ID);
    expect(blob?.name).toBe('35102-25.pdf');
    // `size` and not `text()`: the structured clone the store round-trips through is not
    // guaranteed to be a jsdom `Blob` instance with the whole interface on it.
    expect(blob?.blob.size).toBe(4);
    expect(blob?.acked).toBe(false);
    expect(await db.entities.get(['file', FILE_ID])).toBeDefined();
    db.close();
  });
});

describe('2.2-UNIT-006 pendingUploads', () => {
  it('waits for the create op to be acked before offering the file', async () => {
    const db = await freshDb();
    const { ops } = await commitFileBatch(db, { ops: fileOps(), blob: blobOf('abcd'), fileId: FILE_ID }, { newId, now });
    expect(await pendingUploads(db)).toEqual([]);

    await db.outbox.update(ops[0]!.op_id, { status: 'acked', seq: 1 });
    const pending = await pendingUploads(db);
    expect(pending.map((item) => item.id)).toEqual([FILE_ID]);
    expect(pending[0]?.sha256).toBe('deadbeef');
    expect(pending[0]?.mime).toBe('application/pdf');
    db.close();
  });

  it('drops a file the server already holds, and one whose bytes are already acked', async () => {
    const db = await freshDb();
    const { ops } = await commitFileBatch(db, { ops: fileOps(), blob: blobOf('abcd'), fileId: FILE_ID }, { newId, now });
    await db.outbox.update(ops[0]!.op_id, { status: 'acked', seq: 1 });

    const record = (await db.entities.get(['file', FILE_ID]))!;
    await db.entities.put({ ...record, row: { ...record.row, uploaded_at: '2026-09-22T12:00:01.000Z' } as never });
    expect(await pendingUploads(db)).toEqual([]);

    await db.entities.put(record);
    await db.files.update(FILE_ID, { acked: true });
    expect(await pendingUploads(db)).toEqual([]);
    db.close();
  });
});

describe('2.2-UNIT-007 ensureLocalBlob', () => {
  it('serves the local bytes without a fetch, and fetches once when they are missing', async () => {
    const db = await freshDb();
    await commitFileBatch(db, { ops: fileOps(), blob: blobOf('abcd'), fileId: FILE_ID }, { newId, now });

    let fetches = 0;
    const fetchFile = async () => {
      fetches += 1;
      return blobOf('fetched');
    };
    expect((await ensureLocalBlob(db, FILE_ID, 'original', { fetchFile, nowIso: '2026-09-22T12:00:00.000Z' }))?.size).toBe(4);
    expect(fetches).toBe(0);

    const other = '019966b0-0000-7000-8000-0000000000b2';
    expect((await ensureLocalBlob(db, other, 'thumb', { fetchFile, nowIso: '2026-09-22T12:00:00.000Z' }))?.size).toBe(7);
    expect(fetches).toBe(1);
    // Kept: the second ask is served from the store.
    await ensureLocalBlob(db, other, 'thumb', { fetchFile, nowIso: '2026-09-22T12:00:00.000Z' });
    expect(fetches).toBe(1);
    db.close();
  });

  it('never hands back a cached rendering for a different variant', async () => {
    const db = await freshDb();
    // This device picked the file, so it holds the full-size original and nothing else.
    await commitFileBatch(db, { ops: fileOps(), blob: blobOf('the original'), fileId: FILE_ID }, { newId, now });

    const asked: string[] = [];
    const fetchFile = async (_id: string, variant: string) => {
      asked.push(variant);
      return blobOf(`served ${variant}`);
    };
    const deps = { fetchFile, nowIso: '2026-09-22T12:00:00.000Z' };

    // `original` is what is stored, so it is served without a fetch.
    expect((await ensureLocalBlob(db, FILE_ID, 'original', deps))?.size).toBe('the original'.length);
    expect(asked).toEqual([]);

    // `thumb` is not: the original must not be passed off as one.
    expect((await ensureLocalBlob(db, FILE_ID, 'thumb', deps))?.size).toBe('served thumb'.length);
    expect(asked).toEqual(['thumb']);
    // And the fetched thumb did not evict the original this device still has to upload.
    expect((await readLocalBlob(db, FILE_ID))?.variant).toBe('original');
    expect((await readLocalBlob(db, FILE_ID))?.acked).toBe(false);

    // `print` is a third rendering; it is never filed under `thumb` either.
    expect((await ensureLocalBlob(db, FILE_ID, 'print', deps))?.size).toBe('served print'.length);
    expect((await readLocalBlob(db, FILE_ID))?.variant).toBe('original');
    db.close();
  });

  it('previewBlob takes whatever rendering this device holds, and only asks otherwise', async () => {
    const db = await freshDb();
    await commitFileBatch(db, { ops: fileOps(), blob: blobOf('the original'), fileId: FILE_ID }, { newId, now });
    let fetches = 0;
    const fetchFile = async () => {
      fetches += 1;
      return blobOf('served thumb');
    };
    const deps = { fetchFile, nowIso: '2026-09-22T12:00:00.000Z' };

    // A logo just picked here has no thumb on the server yet; the preview still draws.
    expect((await previewBlob(db, FILE_ID, deps))?.size).toBe('the original'.length);
    expect(fetches).toBe(0);

    // A file this device never held comes from the server's thumb.
    const other = '019966b0-0000-7000-8000-0000000000d4';
    expect((await previewBlob(db, other, deps))?.size).toBe('served thumb'.length);
    expect(fetches).toBe(1);
    db.close();
  });

  it('returns null and stores nothing when the fetch fails', async () => {
    const db = await freshDb();
    const missing = '019966b0-0000-7000-8000-0000000000c3';
    const fetchFile = async () => {
      throw new Error('404');
    };
    expect(await ensureLocalBlob(db, missing, 'thumb', { fetchFile, nowIso: '2026-09-22T12:00:00.000Z' })).toBeNull();
    expect(await db.files.get(missing)).toBeUndefined();
    db.close();
  });
});
