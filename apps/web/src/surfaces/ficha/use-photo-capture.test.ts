import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';
import { BLOCK_1_ID, COMPANY_ID, RELATORIO_ID, USER_ID } from '@app/domain/fixtures/replay-small';
import { afterEach, describe, expect, it } from 'vitest';
import { commitPhotoCapture, type PhotoCaptureInput } from '../../db/file-commit.ts';
import { markBlobAcked } from '../../db/file-store.ts';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import { createCaptureRescue } from '../../files/capture-rescue.ts';
import { captureRescueDeps } from './use-photo-capture.ts';

/*
 * 13.6-UNIT (CAP-4): the refusal path with the hook's real rescue dependencies on a real
 * device store: a `files` write refused once frees an acknowledged original
 * (`runEviction` sized to the shot), and the retried commit stores the shot.
 */

let counter = 0;
const newId = () => `019966b0-0136-7000-8000-${String(++counter).padStart(12, '0')}`;
const now = () => new Date('2026-10-07T12:00:00.000Z');
const blobOf = (text: string): Blob => new NodeBlob([text]) as unknown as Blob;

function shot(fileId: string, capturedAt: string): PhotoCaptureInput {
  return {
    companyId: COMPANY_ID,
    relatorioId: RELATORIO_ID,
    actorId: USER_ID,
    fileId,
    blockId: BLOCK_1_ID,
    itemKey: null,
    caption: null,
    capturedAt,
    tzOffset: -180,
    coords: null,
    original: blobOf('original-bytes'),
    thumb: blobOf('thumb'),
    sha256: 'ab'.repeat(32),
  };
}

const OLD = '019966b0-0000-7000-8000-000000001361';
const NEW = '019966b0-0000-7000-8000-000000001362';

const realPut = IDBObjectStore.prototype.put;
let refuseFilesOnce = false;
IDBObjectStore.prototype.put = function put(this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
  if (refuseFilesOnce && this.name === 'files') {
    refuseFilesOnce = false;
    throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
  }
  return realPut.apply(this, args);
};

const opened: AppDatabase[] = [];
afterEach(() => {
  refuseFilesOnce = false;
  for (const db of opened.splice(0)) db.close();
});

describe('13.6-UNIT-005 captureRescueDeps on a real store', () => {
  it('a files write refused once evicts the acked original and stores the shot on the retry', async () => {
    const db = openDatabase(`use-photo-capture-${++counter}`);
    opened.push(db);
    await db.open();
    // An earlier shot, uploaded and acknowledged, of a relatório still in the field.
    await commitPhotoCapture(db, shot(OLD, '2026-10-07T11:00:00.000Z'), { newId, now });
    const record = (await db.entities.get(['file', OLD]))!;
    await db.entities.put({ ...record, row: { ...record.row, uploaded_at: '2026-10-07T11:30:00.000Z' } as never });
    await markBlobAcked(db, OLD, '2026-10-07T11:30:00.000Z');
    await db.entities.put({ entity: 'relatorio', id: RELATORIO_ID, relatorio_id: RELATORIO_ID, project_id: null, removed_at: null, row: { id: RELATORIO_ID, status: 'em_campo' } as never });

    refuseFilesOnce = true;
    const outcome = await createCaptureRescue().save(shot(NEW, '2026-10-07T12:00:00.000Z'), captureRescueDeps(db, () => false));

    expect(outcome).toBe('saved');
    expect(refuseFilesOnce).toBe(false);
    expect(await db.files.get(NEW)).toMatchObject({ variant: 'original', acked: false });
    expect(await db.entities.get(['file', NEW])).toBeDefined();
    // The eviction sized to the shot ran before the retry: the acked original is gone, its thumb kept.
    expect(await db.files.get(OLD)).toBeUndefined();
    expect(await db.thumbs.get(OLD)).toBeDefined();
  });
});
