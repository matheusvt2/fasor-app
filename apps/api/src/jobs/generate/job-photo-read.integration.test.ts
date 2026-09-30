import { createHash } from 'node:crypto';
import {
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  generateResponseSchema,
  generationJobRowSchema,
  objectKey,
  SERVER_DEVICE_ID,
  toIso,
  type Op,
} from '@app/domain';
import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { and, eq, inArray } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createAuth } from '../../auth/auth.ts';
import { parseTrustedOrigins } from '../../auth/trusted-origins.ts';
import { now } from '../../clock.ts';
import { loadConfig } from '../../config.ts';
import { createDb } from '../../db/client.ts';
import { asCompanyId } from '../../db/repositories/company-id.ts';
import { entities, ops } from '../../db/schema.ts';
import { seedTestCompanies, TEST_SEED } from '../../db/seed.ts';
import { removePortoSeguroSmall, seedPortoSeguroSmall, SMALL_FIXTURE_RELATORIO_ID, TEST_PARECER } from '../../db/test-fixtures.ts';
import { newId } from '../../ids.ts';
import { createS3, putObject } from '../../storage/s3.ts';
import { applyOps } from '../../sync/apply.ts';
import { GENERATE_ACTOR, runGenerateJob } from './job.ts';

/*
 * Review 2026-09-30, A-4: a transient read failure never issues a revision. An issue job
 * whose S3 read of one photo's print variant (or of a certificate's original) THROWS ends
 * `failed` with `render_failed` on its `generation_job` row, allocates no revision number
 * and writes no DOCX/PDF file row; AD-15 keeps no automatic retry, so the user's "Tentar
 * novamente" is a new job, which then issues revision 1 once the reads work.
 *
 * The web keys its failed state on exactly these fields: the Export dialog's
 * `if (job.status === 'failed') setPhase({ kind: 'failed' })`
 * (`apps/web/src/surfaces/export/use-generate.ts:414`) and the background watcher's
 * `if (job.status === 'failed')` (`apps/web/src/state/generate-watcher.tsx:118`); the
 * `render_failed` code is what the job row carries for it (`GENERATE_ERROR_CODES`).
 *
 * The failing jobs run here, in the tools container, with an S3 client that throws for one
 * key; the failure happens while the images load, before LibreOffice would be needed. The
 * healthy job runs through the api (its worker and its LibreOffice).
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const companyId = asCompanyId(companyA.companyId);
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const s3 = createS3(config);
const auth = createAuth({ db, secret: config.SESSION_SECRET, baseURL: config.AUTH_BASE_URL, trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS) });

const RELATORIO_ID = SMALL_FIXTURE_RELATORIO_ID;
const [MEGOHMETRO_ID] = portoSeguroSmall.log
  .filter((op) => op.kind === 'create' && op.path.startsWith('registry/instrument/'))
  .map((op) => (op.value as { id: string }).id);

const PHOTO_ID = newId();
const CERT_ID = newId();
const extraOpIds: string[] = [];
const photoKey = objectKey(companyA.companyId, 'photo', PHOTO_ID, 'print', RELATORIO_ID);
const certKey = objectKey(companyA.companyId, 'certificate', CERT_ID);

function op(input: Pick<Op, 'kind' | 'scope' | 'path' | 'value'>): Op {
  const id = newId();
  extraOpIds.push(id);
  return {
    op_id: id,
    kind: input.kind,
    scope: input.scope,
    company_id: companyA.companyId,
    project_id: null,
    relatorio_id: input.scope === 'relatorio' ? RELATORIO_ID : null,
    path: input.path,
    value: input.value,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: companyA.userId,
    device_id: 'tablet-int-a4',
    client_ts: toIso(now()),
  };
}

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/** The compose MinIO, except that a `GetObject` of `failingKey` throws as a stalled or failing store would. */
function failingS3(failingKey: string): S3Client {
  return {
    send: (command: unknown) => {
      if (command instanceof GetObjectCommand && command.input.Key === failingKey) {
        return Promise.reject(Object.assign(new Error('socket hang up'), { name: 'TimeoutError' }));
      }
      return (s3.send as (c: unknown) => Promise<unknown>)(command);
    },
  } as unknown as S3Client;
}

async function rowsOf(entity: 'revision' | 'file' | 'generation_job') {
  return db
    .select({ id: entities.id, row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, entity), eq(entities.relatorio_id, RELATORIO_ID)));
}

/** The DOCX/PDF file rows of the relatório (the photo's own row is a `file` too). */
async function documentFiles() {
  return (await rowsOf('file')).filter((f) => ['docx', 'pdf'].includes((f.row as { kind: string }).kind));
}

async function createJob(): Promise<string> {
  const jobId = newId();
  const created = await applyOps(
    db,
    companyId,
    [
      {
        op_id: newId(),
        kind: 'create',
        scope: 'relatorio',
        company_id: companyA.companyId,
        project_id: null,
        relatorio_id: RELATORIO_ID,
        path: `generation_job/${jobId}`,
        value: { id: jobId, relatorio_id: RELATORIO_ID, kind: 'issue', status: 'queued', error: null, result_file_id: null, result: null, created_at: toIso(now()) },
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: GENERATE_ACTOR,
        device_id: SERVER_DEVICE_ID,
        client_ts: toIso(now()),
      },
    ],
    { now, origin: 'server' },
  );
  expect(created.rejected).toEqual([]);
  return jobId;
}

function call(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${apiUrl}${path}`, {
    ...init,
    redirect: 'manual',
    headers: { origin: apiUrl, [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION), ...(init.headers as Record<string, string> | undefined) },
  });
}

async function signIn(): Promise<string> {
  const res = await call('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: companyA.email, password: TEST_SEED.password }),
  });
  expect(res.status, await res.text()).toBe(200);
  return res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  await seedPortoSeguroSmall(db, companyA.companyId, { parecer: TEST_PARECER });
  const photo = await sharp({ create: { width: 320, height: 240, channels: 3, background: { r: 30, g: 90, b: 160 } } }).jpeg().toBuffer();
  const certificate = await sharp({ create: { width: 600, height: 800, channels: 3, background: '#ffffff' } }).png().toBuffer();
  await putObject(s3, config.S3_BUCKET, photoKey, photo, 'image/jpeg');
  await putObject(s3, config.S3_BUCKET, certKey, certificate, 'image/png');
  const result = await applyOps(
    db,
    companyId,
    [
      op({
        kind: 'create',
        scope: 'relatorio',
        path: `file/${PHOTO_ID}`,
        value: {
          id: PHOTO_ID,
          company_id: companyA.companyId,
          relatorio_id: RELATORIO_ID,
          kind: 'photo',
          sha256: sha(photo),
          mime: 'image/jpeg',
          size: photo.byteLength,
          uploaded_at: toIso(now()),
          removed_at: null,
          variants: { thumb: objectKey(companyA.companyId, 'photo', PHOTO_ID, 'thumb', RELATORIO_ID), print: photoKey },
          captured_at: '2026-09-06T17:32:00.000Z',
          tz_offset: -180,
          coords: null,
          local_seq: 1,
          block_id: null,
          item_key: null,
          caption: 'Vista geral da cabine',
          reading_kind: null,
          reading_target: null,
          reading_status: 'none',
        },
      }),
      op({
        kind: 'create',
        scope: 'company',
        path: `file/${CERT_ID}`,
        value: {
          id: CERT_ID,
          company_id: companyA.companyId,
          relatorio_id: null,
          kind: 'certificate',
          sha256: sha(certificate),
          mime: 'image/png',
          size: certificate.byteLength,
          uploaded_at: toIso(now()),
          removed_at: null,
          variants: null,
        },
      }),
      op({ kind: 'put', scope: 'company', path: `registry/instrument/${MEGOHMETRO_ID}/certificate_file_id`, value: CERT_ID }),
      op({ kind: 'put', scope: 'relatorio', path: 'relatorio/setup/instrument_ids', value: [MEGOHMETRO_ID!] }),
    ],
    { now, origin: 'server' },
  );
  expect(result.rejected).toEqual([]);
}, 60_000);

afterAll(async () => {
  if (extraOpIds.length > 0) await db.delete(ops).where(inArray(ops.op_id, extraOpIds));
  await db.delete(entities).where(and(eq(entities.company_id, companyId), inArray(entities.id, [PHOTO_ID, CERT_ID])));
  await removePortoSeguroSmall(db);
  await sql.end();
});

describe('A-4 a read that throws fails the issue job; it never issues a revision without its evidence', () => {
  it.each([
    ['a photo print variant', photoKey],
    ['a certificate original', certKey],
  ])('%s read throwing ends the job failed/render_failed with no revision and no document file', async (_what, failingKey) => {
    const errors = vi.spyOn(console, 'error');
    try {
      const jobId = await createJob();
      const outcome = await runGenerateJob({ db, s3: failingS3(failingKey), bucket: config.S3_BUCKET, now, newId }, {
        job_id: jobId,
        company_id: companyA.companyId,
        relatorio_id: RELATORIO_ID,
        actor_id: companyA.userId,
        kind: 'issue',
      });
      expect(outcome).toBe('failed');
      const job = generationJobRowSchema.parse((await rowsOf('generation_job')).find((j) => j.id === jobId)?.row);
      expect(job.status).toBe('failed');
      expect(job.error).toBe('render_failed');
      expect(job.result).toBeNull();
      expect(await rowsOf('revision')).toEqual([]);
      expect(await documentFiles()).toEqual([]);
      const lines = errors.mock.calls.map((args) => JSON.parse(String(args[0])) as Record<string, unknown>);
      // The read error is not swallowed as an unreadable photo or certificate (the placeholder path).
      expect(lines.filter((line) => line.msg === 'generate photo unreadable' || line.msg === 'generate certificate unreadable')).toEqual([]);
      const failures = lines.filter((line) => line.msg === 'generate failed');
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({ job_id: jobId, error: 'render_failed' });
      expect(String(failures[0]!.detail)).toContain('socket hang up');
    } finally {
      errors.mockRestore();
    }
  });

  it('the next press, with the reads working again, issues revision 1', async () => {
    const cookie = await signIn();
    const res = await call(`/api/relatorios/${RELATORIO_ID}/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ last_op_id: null, file_ids_expected: [] }),
    });
    expect(res.status, await res.clone().text()).toBe(202);
    const answer = generateResponseSchema.parse(await res.json());
    expect(answer).toMatchObject({ outcome: 'queued', revision_number: 1 });
    const deadline = Date.now() + 150_000;
    for (;;) {
      const revisions = await rowsOf('revision');
      if (revisions.length > 0) {
        expect(revisions).toHaveLength(1);
        expect((revisions[0]!.row as { number: number }).number).toBe(1);
        break;
      }
      const failed = (await rowsOf('generation_job'))
        .map((j) => generationJobRowSchema.parse(j.row))
        .find((j) => answer.outcome === 'queued' && j.id === answer.job_id && j.status === 'failed');
      if (failed !== undefined) throw new Error(`the healthy generate failed: ${failed.error}`);
      if (Date.now() > deadline) throw new Error('revision 1 did not arrive in time');
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    expect((await documentFiles()).map((f) => (f.row as { kind: string }).kind).sort()).toEqual(['docx', 'pdf']);
  }, 180_000);
});
