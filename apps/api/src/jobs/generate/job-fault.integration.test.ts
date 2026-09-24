import {
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  generateResponseSchema,
  generationJobRowSchema,
  SERVER_DEVICE_ID,
  toIso,
} from '@app/domain';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../../auth/auth.ts';
import { parseTrustedOrigins } from '../../auth/trusted-origins.ts';
import { now } from '../../clock.ts';
import { loadConfig } from '../../config.ts';
import { createDb } from '../../db/client.ts';
import { asCompanyId } from '../../db/repositories/company-id.ts';
import { entities, ops } from '../../db/schema.ts';
import { seedTestCompanies, TEST_SEED } from '../../db/seed.ts';
import { removePortoSeguroSmall, seedPortoSeguroSmall, SMALL_FIXTURE_RELATORIO_ID } from '../../db/test-fixtures.ts';
import { newId } from '../../ids.ts';
import { createS3 } from '../../storage/s3.ts';
import { applyOps } from '../../sync/apply.ts';
import { GENERATE_ACTOR, runGenerateJob } from './job.ts';

/*
 * TC-3 (R-005): the `libreoffice_timeout` fault. `runGenerateJob` runs here, in the tools
 * container, against the compose Postgres and MinIO: the fault short-circuits before
 * `soffice` would spawn, so no LibreOffice is needed. The job must end `failed` with the
 * error op, allocate no revision and create no `file` row; the next generate through the
 * api (no fault) then succeeds with number 1.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const companyId = asCompanyId(companyA.companyId);
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const s3 = createS3(config);
const auth = createAuth({
  db,
  secret: config.SESSION_SECRET,
  baseURL: config.AUTH_BASE_URL,
  trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
});

const RELATORIO_ID = SMALL_FIXTURE_RELATORIO_ID;

async function rowsOf(entity: 'revision' | 'file' | 'generation_job') {
  return db
    .select({ id: entities.id, row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, entity), eq(entities.relatorio_id, RELATORIO_ID)));
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
  await seedPortoSeguroSmall(db, companyA.companyId);
}, 60_000);

afterAll(async () => {
  await removePortoSeguroSmall(db);
  await sql.end();
});

describe('4.8-INT-003 GENERATE_FAULT=libreoffice_timeout', () => {
  it(
    'fails the job at the conversion step, records the error, allocates no revision and stores no file; the next generate succeeds with number 1',
    async () => {
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

      const outcome = await runGenerateJob(
        { db, s3, bucket: config.S3_BUCKET, now, newId, fault: 'libreoffice_timeout' },
        { job_id: jobId, company_id: companyA.companyId, relatorio_id: RELATORIO_ID, actor_id: companyA.userId },
      );
      expect(outcome).toBe('failed');

      const jobs = await rowsOf('generation_job');
      const job = generationJobRowSchema.parse(jobs.find((j) => j.id === jobId)?.row);
      expect(job.status).toBe('failed');
      expect(job.error).toBe('libreoffice_timeout');
      expect(job.result).toBeNull();
      expect(await rowsOf('revision')).toEqual([]);
      expect(await rowsOf('file')).toEqual([]);
      const errorOps = await db.select({ value: ops.value, actor_id: ops.actor_id }).from(ops).where(eq(ops.path, `generation_job/${jobId}/error`));
      expect(errorOps).toEqual([{ value: 'libreoffice_timeout', actor_id: GENERATE_ACTOR }]);

      // The api container runs without the fault: the next generate allocates number 1.
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
          expect((revisions[0]!.row as { number: number }).number).toBe(1);
          break;
        }
        const failed = (await rowsOf('generation_job')).map((j) => generationJobRowSchema.parse(j.row)).find((j) => j.id !== jobId && j.status === 'failed');
        if (failed !== undefined) throw new Error(`the generate without the fault failed: ${failed.error}`);
        if (Date.now() > deadline) throw new Error('revision 1 did not arrive in time');
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      expect((await rowsOf('file')).map((f) => (f.row as { kind: string }).kind).sort()).toEqual(['docx', 'pdf']);
    },
    180_000,
  );
});
