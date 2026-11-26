import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';
import { audioFileRowSchema, audioQualityOf, type AudioTarget } from '@app/domain';
import { BLOCK_1_ID, COMPANY_ID, RELATORIO_ID, USER_ID } from '@app/domain/fixtures/replay-small';
import { describe, expect, it, vi } from 'vitest';
import { audioRowsOf, commitAudioCapture, type AudioCaptureInput } from './audio-commit.ts';
import { pendingUploads } from './file-store.ts';
import { openDatabase, type AppDatabase } from './schema.ts';

/*
 * 31.3-WEB the commit of a recording: the `file/{id}` audio create (relatório scope, its target,
 * the kernel's quality, `queued`) and its Blob land in ONE transaction; a Blob the device refuses
 * leaves no op and no row.
 */

let counter = 0;
const newId = () => `019966b0-0313-7000-8000-${String(++counter).padStart(12, '0')}`;
const now = () => new Date('2026-11-26T12:00:00.000Z');
const blobOf = (text: string, type = 'audio/webm'): Blob => new NodeBlob([text], { type }) as unknown as Blob;
const hash = () => Promise.resolve('cd'.repeat(32));

async function freshDb(): Promise<AppDatabase> {
  const db = openDatabase(`audio-commit-${++counter}`);
  await db.open();
  return db;
}

const AUDIO = '019966b0-0000-7000-8000-0000000031a1';
const TARGET: AudioTarget = { type: 'item', block_id: BLOCK_1_ID, item_key: 'contatos' };
const QUALITY = audioQualityOf({ level: 0.2, clipped_share: 0, noise_ratio: 0.05, duration_ms: 4200, speech_ms: 3100 });

function input(extra: Partial<AudioCaptureInput> = {}): AudioCaptureInput {
  return { companyId: COMPANY_ID, relatorioId: RELATORIO_ID, actorId: USER_ID, fileId: AUDIO, target: TARGET, quality: QUALITY, blob: blobOf('opus-bytes'), mime: 'audio/webm', ...extra };
}

describe('31.3-WEB-001 commitAudioCapture', () => {
  it('writes the audio row, its create op and the Blob in one batch', async () => {
    const db = await freshDb();
    const { batch_id } = await commitAudioCapture(db, input(), { newId, now, hash });

    const row = audioFileRowSchema.parse((await db.entities.get(['file', AUDIO]))!.row);
    expect(row).toMatchObject({
      kind: 'audio',
      relatorio_id: RELATORIO_ID,
      audio_status: 'queued',
      audio_target: TARGET,
      quality: { verdict: 'good', reasons: [] },
      mime: 'audio/webm',
      size: 10,
      sha256: 'cd'.repeat(32),
      transcript_heard: null,
      transcript_written: null,
      transcription_run_id: null,
      uploaded_at: null,
    });
    const outbox = await db.outbox.where('batch_id').equals(batch_id).toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ kind: 'create', scope: 'relatorio', relatorio_id: RELATORIO_ID, path: `file/${AUDIO}`, status: 'pending' });
    expect(await db.files.get(AUDIO)).toMatchObject({ variant: 'original', acked: false });
    expect(await audioRowsOf(db, RELATORIO_ID)).toHaveLength(1);
  });

  it('a Blob the device refuses leaves no op, no row and no Blob', async () => {
    const db = await freshDb();
    vi.spyOn(db.files, 'put').mockRejectedValueOnce(new Error('QuotaExceededError'));
    await expect(commitAudioCapture(db, input(), { newId, now, hash })).rejects.toThrow('QuotaExceededError');
    expect(await db.outbox.count()).toBe(0);
    expect(await db.entities.get(['file', AUDIO])).toBeUndefined();
    expect(await db.files.get(AUDIO)).toBeUndefined();
  });

  it('31.3-WEB-002 joins the upload queue with the waiting readings once the server holds its row', async () => {
    const db = await freshDb();
    await commitAudioCapture(db, input(), { newId, now, hash });
    expect(await pendingUploads(db)).toEqual([]);
    const op = await db.outbox.where('path').equals(`file/${AUDIO}`).first();
    await db.outbox.update(op!.op_id, { status: 'acked', seq: 1 });
    expect((await pendingUploads(db)).map((item) => [item.id, item.kind, item.mime])).toEqual([[AUDIO, 'audio', 'audio/webm']]);
  });
});
