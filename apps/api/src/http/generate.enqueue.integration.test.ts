import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONTRACT_VERSION, CONTRACT_VERSION_HEADER, errorResponseSchema, generateResponseSchema, generationJobRowSchema } from '@app/domain';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../auth/auth.ts';
import { parseTrustedOrigins } from '../auth/trusted-origins.ts';
import { loadConfig } from '../config.ts';
import { createDb } from '../db/client.ts';
import { asCompanyId } from '../db/repositories/company-id.ts';
import { entities } from '../db/schema.ts';
import { seedTestCompanies, TEST_SEED } from '../db/seed.ts';
import { removePortoSeguroSmall, seedPortoSeguroSmall, SMALL_FIXTURE_RELATORIO_ID } from '../db/test-fixtures.ts';
import type { GeneratePayload } from '../jobs/generate/job.ts';
import { createS3 } from '../storage/s3.ts';
import { createApp } from './app.ts';

/*
 * The enqueue-failure path of `POST /api/relatorios/:id/generate`, in process: the app is
 * built with a send to the queue that throws, so the route records the job as
 * `failed`/`enqueue_failed` and answers the 5xx envelope; a later press with a working
 * send is accepted. The session cookie comes from the compose api (sessions are stored in
 * Postgres, so this in-process app resolves it).
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const s3 = createS3(config);
const auth = createAuth({
  db,
  secret: config.SESSION_SECRET,
  baseURL: config.AUTH_BASE_URL,
  trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
});
const staticDir = mkdtempSync(join(tmpdir(), 'generate-enqueue-'));
const up = async () => undefined;

let cookie = '';

async function signIn(): Promise<string> {
  const res = await fetch(`${apiUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { origin: apiUrl, 'content-type': 'application/json' },
    body: JSON.stringify({ email: companyA.email, password: TEST_SEED.password }),
  });
  expect(res.status, await res.text()).toBe(200);
  return res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}

async function post(app: ReturnType<typeof createApp>): Promise<Response> {
  return app.request(`/api/relatorios/${SMALL_FIXTURE_RELATORIO_ID}/generate`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json', [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION) },
    body: JSON.stringify({ last_op_id: null, file_ids_expected: [] }),
  });
}

async function jobs() {
  const rows = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, asCompanyId(companyA.companyId)), eq(entities.entity, 'generation_job'), eq(entities.relatorio_id, SMALL_FIXTURE_RELATORIO_ID)));
  return rows.map((r) => generationJobRowSchema.parse(r.row));
}

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  await seedPortoSeguroSmall(db, companyA.companyId);
  cookie = await signIn();
}, 60_000);

afterAll(async () => {
  await removePortoSeguroSmall(db);
  rmSync(staticDir, { recursive: true, force: true });
  await sql.end();
});

describe('4.8-INT-004 generate when the queue refuses the job', () => {
  it('records the job as failed/enqueue_failed, answers the error envelope, and a later press with a working queue is queued', async () => {
    const probes = { db: up, queue: up, storage: up, libreoffice: up };
    const broken = createApp({ probes, auth, db, s3, bucket: config.S3_BUCKET, staticDir, enqueueGenerate: async () => { throw new Error('boom'); } });
    const failed = await post(broken);
    expect(failed.status).toBe(500);
    expect(errorResponseSchema.parse(await failed.json()).code).toBe('internal_error');
    const afterFailure = await jobs();
    expect(afterFailure).toHaveLength(1);
    expect(afterFailure[0]).toMatchObject({ status: 'failed', error: 'enqueue_failed' });

    const sent: GeneratePayload[] = [];
    const working = createApp({ probes, auth, db, s3, bucket: config.S3_BUCKET, staticDir, enqueueGenerate: async (payload) => void sent.push(payload) });
    const queued = await post(working);
    expect(queued.status, await queued.clone().text()).toBe(202);
    const answer = generateResponseSchema.parse(await queued.json());
    expect(answer).toMatchObject({ outcome: 'queued', revision_number: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ company_id: companyA.companyId, relatorio_id: SMALL_FIXTURE_RELATORIO_ID, actor_id: companyA.userId });
    if (answer.outcome === 'queued') expect(sent[0]!.job_id).toBe(answer.job_id);
    // Nothing ran it (the stub only recorded it): a third press answers `running` for that job.
    const third = generateResponseSchema.parse(await (await post(working)).json());
    expect(third).toMatchObject({ outcome: 'running', revision_number: 1 });
  }, 60_000);
});
