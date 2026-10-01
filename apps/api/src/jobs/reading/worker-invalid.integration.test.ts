import { photoFileRowSchema, SERVER_DEVICE_ID, toIso, type Op } from '@app/domain';
import type { S3Client } from '@aws-sdk/client-s3';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { now } from '../../clock.ts';
import { loadConfig } from '../../config.ts';
import { createDb } from '../../db/client.ts';
import { asCompanyId } from '../../db/repositories/company-id.ts';
import { entities, ops } from '../../db/schema.ts';
import { newId } from '../../ids.ts';
import { applyOps } from '../../sync/apply.ts';
import type { ReadingJobDeps } from './job.ts';
import { READING_ACTOR, readingStatusPath } from './status.ts';
import { handleReadingJobs } from './worker.ts';

/*
 * Review 2026-09-30, A-14: a reading job whose payload the worker schema refuses no longer
 * completes without an outcome. When its company and photo ids still parse, the photo's
 * `reading_status` is written `failed` as `system:reading` (the device shows it and "Ler
 * novamente" starts over) and the job completes; otherwise the refusal is only logged. No
 * provider is reached either way. A throwaway company.
 */

const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const companyId = asCompanyId(newId());
const deps: ReadingJobDeps = {
  db,
  s3: {} as S3Client,
  bucket: config.S3_BUCKET,
  now,
  newId,
  providers: () => {
    throw new Error('no provider is reached for an invalid payload');
  },
};

function photoCreate(id: string, status: 'running' | 'queued'): Op {
  return {
    op_id: newId(),
    kind: 'create',
    scope: 'company',
    company_id: companyId,
    project_id: null,
    relatorio_id: null,
    path: `file/${id}`,
    value: {
      id,
      company_id: companyId,
      relatorio_id: null,
      kind: 'photo',
      sha256: 'x'.repeat(64),
      mime: 'image/jpeg',
      size: 10,
      uploaded_at: toIso(now()),
      removed_at: null,
      variants: null,
      captured_at: '2026-09-06T17:32:00.000Z',
      tz_offset: -180,
      coords: null,
      local_seq: 1,
      block_id: null,
      item_key: null,
      caption: null,
      reading_kind: 'plate',
      reading_target: null,
      reading_status: status,
    },
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: READING_ACTOR,
    device_id: SERVER_DEVICE_ID,
    client_ts: toIso(now()),
  };
}

async function statusOf(photoId: string): Promise<string> {
  const [record] = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'file'), eq(entities.id, photoId)));
  return photoFileRowSchema.parse(record!.row).reading_status;
}

const running = newId();
const queued = newId();

beforeAll(async () => {
  const result = await applyOps(db, companyId, [photoCreate(running, 'running'), photoCreate(queued, 'queued')], { now, origin: 'server' });
  expect(result.rejected).toEqual([]);
});

afterAll(async () => {
  await db.delete(ops).where(eq(ops.company_id, companyId));
  await db.delete(entities).where(eq(entities.company_id, companyId));
  await sql.end();
});

describe('A-14 an invalid reading payload fails its photo', () => {
  it('writes failed as system:reading for a running photo, and for one still queued, and completes', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await handleReadingJobs(deps, [
        { id: 'job-a14-running', data: { company_id: companyId, photo_id: running, reading_kind: 'hologram' }, retryCount: 0, retryLimit: 2 },
        { id: 'job-a14-queued', data: { company_id: companyId, photo_id: queued }, retryCount: 0, retryLimit: 2 },
      ]);
    } finally {
      errors.mockRestore();
    }
    expect(await statusOf(running)).toBe('failed');
    expect(await statusOf(queued)).toBe('failed');
    const written = await db
      .select({ actor_id: ops.actor_id, value: ops.value })
      .from(ops)
      .where(and(eq(ops.company_id, companyId), eq(ops.path, readingStatusPath(running))));
    expect(written).toEqual([{ actor_id: READING_ACTOR, value: 'failed' }]);
  });

  it('only logs a payload whose ids do not parse', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await handleReadingJobs(deps, [{ id: 'job-a14-garbage', data: { photo: 'nothing' }, retryCount: 0, retryLimit: 2 }]);
      const lines = errors.mock.calls.map((args) => JSON.parse(String(args[0])) as { msg: string; job_id?: string });
      expect(lines).toContainEqual(expect.objectContaining({ msg: 'reading job payload invalid', job_id: 'job-a14-garbage' }));
    } finally {
      errors.mockRestore();
    }
  });
});
