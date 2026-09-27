import { generationJobRowSchema, SERVER_DEVICE_ID, toIso } from '@app/domain';
import { and, eq, inArray } from 'drizzle-orm';
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
import { GENERATE_ACTOR } from './job.ts';
import { handleGenerateJobs } from './worker.ts';

/*
 * Story 4.8 review debt R9 (Story 7.3 batch): a queue job whose payload fails the worker
 * schema fails its `generation_job` row with `render_failed` when its job and company ids
 * parse and the row exists; otherwise it is only logged. Driven through
 * `handleGenerateJobs` against the compose Postgres; no job runs, so no LibreOffice.
 */

const companyA = TEST_SEED.companies[0];
const companyId = asCompanyId(companyA.companyId);
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const s3 = createS3(config);
const auth = createAuth({ db, secret: config.SESSION_SECRET, baseURL: config.AUTH_BASE_URL, trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS) });
const deps = { db, s3, bucket: config.S3_BUCKET, now, newId };

async function createJobRow(): Promise<string> {
  const jobId = newId();
  const stamp = toIso(now());
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
        relatorio_id: SMALL_FIXTURE_RELATORIO_ID,
        path: `generation_job/${jobId}`,
        value: { id: jobId, relatorio_id: SMALL_FIXTURE_RELATORIO_ID, kind: 'issue', status: 'queued', error: null, result_file_id: null, result: null, created_at: stamp },
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: GENERATE_ACTOR,
        device_id: SERVER_DEVICE_ID,
        client_ts: stamp,
      },
    ],
    { now, origin: 'server' },
  );
  expect(created.rejected).toEqual([]);
  return jobId;
}

async function jobRow(jobId: string) {
  const [record] = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'generation_job'), eq(entities.id, jobId)));
  return generationJobRowSchema.parse(record?.row);
}

const jobOps = (jobId: string) =>
  db
    .select({ path: ops.path, value: ops.value, actor_id: ops.actor_id })
    .from(ops)
    .where(inArray(ops.path, [`generation_job/${jobId}/status`, `generation_job/${jobId}/error`]));

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  await seedPortoSeguroSmall(db, companyA.companyId);
}, 60_000);

afterAll(async () => {
  await removePortoSeguroSmall(db);
  await sql.end();
});

describe('R9 an invalid generate payload', () => {
  it('fails the existing job row with render_failed, written by system:generate', async () => {
    const jobId = await createJobRow();
    // The relatório id and the actor fail the schema; the job and company ids parse.
    await handleGenerateJobs(deps, [{ id: 'queue-job-1', data: { job_id: jobId, company_id: companyA.companyId, relatorio_id: 'not-a-uuid', actor_id: '' } }]);
    const row = await jobRow(jobId);
    expect(row.status).toBe('failed');
    expect(row.error).toBe('render_failed');
    const written = await jobOps(jobId);
    expect(written.map((op) => [op.path, op.value, op.actor_id]).sort()).toEqual([
      [`generation_job/${jobId}/error`, 'render_failed', GENERATE_ACTOR],
      [`generation_job/${jobId}/status`, 'failed', GENERATE_ACTOR],
    ]);
  });

  it('only logs when the ids do not parse or no job row exists, and never throws', async () => {
    const jobId = await createJobRow();
    await expect(
      handleGenerateJobs(deps, [
        { id: 'queue-job-2', data: { job_id: 'nope', company_id: companyA.companyId } },
        { id: 'queue-job-3', data: null },
        // Ids that parse but name no row of this company.
        { id: 'queue-job-4', data: { job_id: newId(), company_id: companyA.companyId } },
        { id: 'queue-job-5', data: { job_id: jobId, company_id: TEST_SEED.companies[1].companyId } },
      ]),
    ).resolves.toBeUndefined();
    const row = await jobRow(jobId);
    expect(row.status).toBe('queued');
    expect(row.error).toBeNull();
    expect(await jobOps(jobId)).toEqual([]);
  });
});
