import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';
import { photoFileRowSchema } from '@app/domain';
import { BLOCK_1_ID, COMPANY_ID, RELATORIO_ID, USER_ID } from '@app/domain/fixtures/replay-small';
import { describe, expect, it } from 'vitest';
import { commitPhotoCapture } from '../../db/file-commit.ts';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import { assignPhotoBatch, toastPhotoWriteFailure } from './photo-ops.ts';

/*
 * Ledger 1131 (contract 14): a gallery import batch is created with no reading; its answer
 * (or its "Cancelar") asks for the caption reading of each photo left with no sheet, no
 * caption and no "Pessoas na foto" mark, after that photo's other puts, in one batch.
 */

let counter = 0;
const newId = () => `019966b0-0077-7000-8000-${String(++counter).padStart(12, '0')}`;
const now = () => new Date('2026-09-30T12:00:00.000Z');
const blobOf = (text: string): Blob => new NodeBlob([text]) as unknown as Blob;
const author = { id: USER_ID, companyId: COMPANY_ID };

const PHOTO_A = '019966b0-0000-7000-8000-0000000007a1';
const PHOTO_B = '019966b0-0000-7000-8000-0000000007b2';

async function batchDb(): Promise<AppDatabase> {
  const db = openDatabase(`photo-ops-${++counter}`);
  await db.open();
  for (const fileId of [PHOTO_A, PHOTO_B]) {
    await commitPhotoCapture(
      db,
      {
        companyId: COMPANY_ID,
        relatorioId: RELATORIO_ID,
        actorId: USER_ID,
        fileId,
        blockId: null,
        itemKey: null,
        caption: null,
        reading: null,
        capturedAt: '2026-09-30T11:00:00.000Z',
        tzOffset: -180,
        coords: null,
        original: blobOf('original'),
        thumb: blobOf('thumb'),
        sha256: 'cd'.repeat(32),
      },
      { newId, now },
    );
  }
  return db;
}

async function puts(db: AppDatabase): Promise<Array<{ path: string; value: unknown; batch_id: string | null | undefined }>> {
  const ops = await db.outbox.toArray();
  return ops.filter((op) => op.kind === 'put').map((op) => ({ path: op.path, value: op.value, batch_id: op.batch_id }));
}

describe('ledger 1131 assignPhotoBatch', () => {
  it('a batch left open carries no reading and no reading_kind put', async () => {
    const db = await batchDb();
    expect(await puts(db)).toEqual([]);
    const row = photoFileRowSchema.parse((await db.entities.get(['file', PHOTO_A]))!.row);
    expect(row).toMatchObject({ reading_kind: null, reading_status: 'none' });
    db.close();
  });

  it('"Geral" with nothing else (or "Cancelar") puts reading_kind caption on every photo, in one batch', async () => {
    const db = await batchDb();
    await assignPhotoBatch(db, author, RELATORIO_ID, [PHOTO_A, PHOTO_B], null, '  ', false);
    const written = await puts(db);
    expect(written.map(({ path, value }) => ({ path, value }))).toEqual([
      { path: `file/${PHOTO_A}/reading_kind`, value: 'caption' },
      { path: `file/${PHOTO_B}/reading_kind`, value: 'caption' },
    ]);
    expect(new Set(written.map((op) => op.batch_id)).size).toBe(1);
    const row = photoFileRowSchema.parse((await db.entities.get(['file', PHOTO_B]))!.row);
    expect(row).toMatchObject({ reading_kind: 'caption', reading_status: 'queued' });
    db.close();
  });

  it('a sheet, a caption or the people mark writes its puts and no reading_kind put', async () => {
    for (const [blockId, caption, people] of [
      [BLOCK_1_ID, null, false],
      [null, 'Vista geral da cabine', false],
      [null, null, true],
    ] as const) {
      const db = await batchDb();
      await assignPhotoBatch(db, author, RELATORIO_ID, [PHOTO_A, PHOTO_B], blockId, caption, people);
      const written = await puts(db);
      expect(written).toHaveLength(2);
      expect(written.some((op) => op.path.endsWith('/reading_kind'))).toBe(false);
      db.close();
    }
  });
});

describe('W-9 a photo edit the device refuses', () => {
  it('raises the refused-write toast: the quota words for a full device, the general ones otherwise', () => {
    const shown: string[] = [];
    const onError = toastPhotoWriteFailure((text) => shown.push(text));
    onError(Object.assign(new Error('full'), { name: 'QuotaExceededError' }));
    onError(Object.assign(new Error('closed'), { name: 'DatabaseClosedError' }));
    expect(shown).toEqual(['Não foi possível salvar neste aparelho. Libere espaço e tente de novo.', 'Não foi possível salvar. Tente de novo.']);
  });
});
