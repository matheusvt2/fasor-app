import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';
import { photoFileRowSchema } from '@app/domain';
import { BLOCK_1_ID, COMPANY_ID, RELATORIO_ID, USER_ID } from '@app/domain/fixtures/replay-small';
import { describe, expect, it } from 'vitest';
import { commitPhotoCapture, type PhotoCaptureInput } from './file-commit.ts';
import {
  clearUploadError,
  markBlobAcked,
  pendingUploadCount,
  pendingUploads,
  putServerThumb,
  readThumb,
  runEviction,
  setUploadError,
  thumbsToRefresh,
} from './file-store.ts';
import { photoTilesOfBlock } from './photo-store.ts';
import { openDatabase, PHOTO_SEQ_PREF, type AppDatabase } from './schema.ts';

/*
 * 6.1/6.2-UNIT: one shot is one transaction (row, outbox, original, thumb, counter), the
 * upload queue order and its persisted errors, the server thumb swap and the eviction pass.
 */

let counter = 0;
const newId = () => `019966b0-0066-7000-8000-${String(++counter).padStart(12, '0')}`;
const now = () => new Date('2026-09-25T12:00:00.000Z');
const blobOf = (text: string): Blob => new NodeBlob([text]) as unknown as Blob;

const users = new WeakMap<AppDatabase, string>();

async function freshDb(): Promise<AppDatabase> {
  const user = `photo-store-${++counter}`;
  const db = openDatabase(user);
  users.set(db, user);
  await db.open();
  return db;
}

function shot(fileId: string, capturedAt: string, extra: Partial<PhotoCaptureInput> = {}): PhotoCaptureInput {
  return {
    companyId: COMPANY_ID,
    relatorioId: RELATORIO_ID,
    actorId: USER_ID,
    fileId,
    blockId: BLOCK_1_ID,
    itemKey: null,
    caption: 'Detalhe da chave seccionadora do Cubículo Enel',
    capturedAt,
    tzOffset: -180,
    coords: { lat: -23.5505, lng: -46.6333, accuracy_m: 10, source: 'geolocation' },
    original: blobOf('original-bytes'),
    thumb: blobOf('thumb'),
    sha256: 'ab'.repeat(32),
    ...extra,
  };
}

const PHOTO_A = '019966b0-0000-7000-8000-0000000006a1';
const PHOTO_B = '019966b0-0000-7000-8000-0000000006b2';
const PHOTO_C = '019966b0-0000-7000-8000-0000000006c3';

async function ackCreate(db: AppDatabase, fileId: string): Promise<void> {
  const row = await db.outbox.where('path').equals(`file/${fileId}`).first();
  await db.outbox.update(row!.op_id, { status: 'acked', seq: 1 });
}

describe('6.1-UNIT-006 commitPhotoCapture', () => {
  it('writes the photo row, its create op, the original, the device thumb and the counter in one batch', async () => {
    const db = await freshDb();
    const { localSeq } = await commitPhotoCapture(db, shot(PHOTO_A, '2026-09-25T11:00:00.000Z'), { newId, now });
    expect(localSeq).toBe(1);

    const record = await db.entities.get(['file', PHOTO_A]);
    const row = photoFileRowSchema.parse(record!.row);
    expect(row).toMatchObject({
      kind: 'photo',
      relatorio_id: RELATORIO_ID,
      mime: 'image/jpeg',
      block_id: BLOCK_1_ID,
      item_key: null,
      local_seq: 1,
      reading_status: 'none',
      reading_kind: null,
      caption: 'Detalhe da chave seccionadora do Cubículo Enel',
      tz_offset: -180,
      coords: { lat: -23.5505, lng: -46.6333, accuracy_m: 10, source: 'geolocation' },
    });
    const outbox = await db.outbox.where('path').equals(`file/${PHOTO_A}`).toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ kind: 'create', scope: 'relatorio', relatorio_id: RELATORIO_ID, status: 'pending' });
    expect((outbox[0]!.value as { local_seq: number }).local_seq).toBe(1);
    expect(await db.files.get(PHOTO_A)).toMatchObject({ variant: 'original', acked: false });
    expect(await readThumb(db, PHOTO_A)).toMatchObject({ source: 'device' });
    expect(await db.local_prefs.get(PHOTO_SEQ_PREF)).toEqual({ key: PHOTO_SEQ_PREF, value: 1 });

    // The counter keeps counting, one per shot.
    const second = await commitPhotoCapture(db, shot(PHOTO_B, '2026-09-25T11:01:00.000Z'), { newId, now });
    expect(second.localSeq).toBe(2);
    db.close();
  });

  it('lists a sheet photos in capture order with their thumb and item', async () => {
    const db = await freshDb();
    await commitPhotoCapture(db, shot(PHOTO_B, '2026-09-25T11:05:00.000Z', { itemKey: 'contatos' }), { newId, now });
    await commitPhotoCapture(db, shot(PHOTO_A, '2026-09-25T11:00:00.000Z'), { newId, now });
    const tiles = await photoTilesOfBlock(db, RELATORIO_ID, BLOCK_1_ID);
    expect(tiles.map((tile) => [tile.id, tile.item_key])).toEqual([
      [PHOTO_A, null],
      [PHOTO_B, 'contatos'],
    ]);
    expect(tiles[0]!.thumb).not.toBeNull();
    expect(tiles[0]!.upload_error).toBeNull();
    db.close();
  });
});

describe('6.2-UNIT-006 the upload queue', () => {
  it('orders photos by captured_at before the other kinds', async () => {
    const db = await freshDb();
    await commitPhotoCapture(db, shot(PHOTO_B, '2026-09-25T11:05:00.000Z'), { newId, now });
    await commitPhotoCapture(db, shot(PHOTO_A, '2026-09-25T11:00:00.000Z'), { newId, now });
    await ackCreate(db, PHOTO_A);
    await ackCreate(db, PHOTO_B);
    expect((await pendingUploads(db)).map((item) => item.id)).toEqual([PHOTO_A, PHOTO_B]);
    db.close();
  });

  it('persists an upload error, leaves a dead file out of the drain count, and clears it on retry or ack', async () => {
    const db = await freshDb();
    await commitPhotoCapture(db, shot(PHOTO_A, '2026-09-25T11:00:00.000Z'), { newId, now });
    await commitPhotoCapture(db, shot(PHOTO_B, '2026-09-25T11:01:00.000Z'), { newId, now });
    await ackCreate(db, PHOTO_A);
    await ackCreate(db, PHOTO_B);
    await setUploadError(db, PHOTO_A, { state: 'dead', code: 'file_too_large', at: '2026-09-25T12:00:00.000Z' });

    const pending = await pendingUploads(db);
    expect(pending.find((item) => item.id === PHOTO_A)?.upload_error).toMatchObject({ state: 'dead' });
    expect(await pendingUploadCount(db)).toBe(1);

    // A reopened database still holds it (the "reload" of the matrix).
    db.close();
    const reopened = openDatabase(users.get(db)!);
    await reopened.open();
    expect((await reopened.files.get(PHOTO_A))?.upload_error).toMatchObject({ state: 'dead', code: 'file_too_large' });

    await clearUploadError(reopened, PHOTO_A);
    expect((await reopened.files.get(PHOTO_A))?.upload_error).toBeUndefined();
    expect(await pendingUploadCount(reopened)).toBe(2);

    await setUploadError(reopened, PHOTO_B, { state: 'failed', code: '503', at: '2026-09-25T12:00:00.000Z' });
    await markBlobAcked(reopened, PHOTO_B, '2026-09-25T12:01:00.000Z');
    expect(await reopened.files.get(PHOTO_B)).toMatchObject({ acked: true, acked_at: '2026-09-25T12:01:00.000Z' });
    expect((await reopened.files.get(PHOTO_B))?.upload_error).toBeUndefined();
    reopened.close();
  });
});

describe('6.2-UNIT-007 server thumbs and eviction', () => {
  async function markUploaded(db: AppDatabase, fileId: string): Promise<void> {
    const record = (await db.entities.get(['file', fileId]))!;
    await db.entities.put({
      ...record,
      row: { ...record.row, uploaded_at: '2026-09-25T12:00:00.000Z', variants: { thumb: 'k/thumb', print: 'k/print' } } as never,
    });
  }

  it('asks for the server thumb of a photo whose variants exist while the device thumb is the one kept', async () => {
    const db = await freshDb();
    await commitPhotoCapture(db, shot(PHOTO_A, '2026-09-25T11:00:00.000Z'), { newId, now });
    await commitPhotoCapture(db, shot(PHOTO_B, '2026-09-25T11:01:00.000Z'), { newId, now });
    expect(await thumbsToRefresh(db)).toEqual([]);
    await markUploaded(db, PHOTO_A);
    expect(await thumbsToRefresh(db)).toEqual([PHOTO_A]);
    await putServerThumb(db, PHOTO_A, blobOf('server-thumb'), '2026-09-25T12:02:00.000Z');
    expect(await readThumb(db, PHOTO_A)).toMatchObject({ source: 'server' });
    expect(await thumbsToRefresh(db)).toEqual([]);
    db.close();
  });

  it('never evicts an unacked original; evicts acked ones of a relatório that left the field, keeping every thumb', async () => {
    const db = await freshDb();
    await commitPhotoCapture(db, shot(PHOTO_A, '2026-09-25T11:00:00.000Z'), { newId, now });
    await commitPhotoCapture(db, shot(PHOTO_B, '2026-09-25T11:01:00.000Z'), { newId, now });
    await commitPhotoCapture(db, shot(PHOTO_C, '2026-09-25T11:02:00.000Z'), { newId, now });
    await markUploaded(db, PHOTO_A);
    await markUploaded(db, PHOTO_B);
    await markBlobAcked(db, PHOTO_A, '2026-09-25T12:00:00.000Z');
    await markBlobAcked(db, PHOTO_B, '2026-09-25T12:01:00.000Z');

    // In the field and no pressure: nothing goes.
    await db.entities.put({ entity: 'relatorio', id: RELATORIO_ID, relatorio_id: RELATORIO_ID, project_id: null, removed_at: null, row: { id: RELATORIO_ID, status: 'em_campo' } as never });
    expect(await runEviction(db, { usage: 0, quota: 10_000 * 1024 * 1024 })).toEqual([]);

    // Pressure: the oldest-acked original first, until covered; never the unacked one.
    const MB = 1024 * 1024;
    const tiny = { usage: 10_000 * MB - (500 * MB - 1), quota: 10_000 * MB };
    expect(await runEviction(db, tiny)).toEqual([PHOTO_A]);
    expect(await db.files.get(PHOTO_A)).toBeUndefined();
    expect(await db.files.get(PHOTO_C)).toMatchObject({ acked: false });

    // Out of the field: every acked original goes, never the unacked, never a thumb.
    await db.entities.put({ entity: 'relatorio', id: RELATORIO_ID, relatorio_id: RELATORIO_ID, project_id: null, removed_at: null, row: { id: RELATORIO_ID, status: 'em_revisao' } as never });
    expect(await runEviction(db, null)).toEqual([PHOTO_B]);
    expect(await db.files.get(PHOTO_C)).toMatchObject({ acked: false });
    expect(await db.thumbs.count()).toBe(3);
    db.close();
  });
});
