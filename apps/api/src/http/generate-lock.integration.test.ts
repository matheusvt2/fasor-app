import { generateResponseSchema, type RevisionRow } from '@app/domain';
import type { S3Client } from '@aws-sdk/client-s3';
import { and, eq, inArray, max, sql as dsql } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../auth/auth.ts';
import { parseTrustedOrigins } from '../auth/trusted-origins.ts';
import { now } from '../clock.ts';
import { loadConfig } from '../config.ts';
import { createDb } from '../db/client.ts';
import { asCompanyId } from '../db/repositories/company-id.ts';
import { entities, ops } from '../db/schema.ts';
import { seedTestCompanies, TEST_SEED } from '../db/seed.ts';
import { removePortoSeguroSmall, seedPortoSeguroSmall, SMALL_FIXTURE_RELATORIO_ID, TEST_PARECER } from '../db/test-fixtures.ts';
import { newId } from '../ids.ts';
import type { GeneratePayload } from '../jobs/generate/job.ts';
import { lockCompany, type Tx } from '../sync/apply.ts';
import { createGenerateRoutes } from './generate.ts';
import type { AppEnv } from './session.ts';

/*
 * Review 2026-09-30, A-12: "Gerar relatório" decides "unchanged" under the company lock
 * the job create takes. A revision committed while the press waits for that lock (a job of
 * the same relatório finishing) is read by the press, which answers `unchanged` with it
 * instead of queueing a second, identical revision. The route runs in-process with a
 * stand-in session and a recording queue, over the small Porto Seguro fixture.
 */

const companyA = TEST_SEED.companies[0];
const companyId = asCompanyId(companyA.companyId);
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const auth = createAuth({ db, secret: config.SESSION_SECRET, baseURL: config.AUTH_BASE_URL, trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS) });
const RELATORIO_ID = SMALL_FIXTURE_RELATORIO_ID;

const enqueued: GeneratePayload[] = [];
const app = new Hono<AppEnv>();
app.use('*', async (c, next) => {
  c.set('session', { userId: companyA.userId, companyId });
  await next();
});
app.route('/', createGenerateRoutes(db, {} as S3Client, config.S3_BUCKET, { now, newId, enqueue: async (payload) => void enqueued.push(payload) }));

const revisionId = newId();

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  await seedPortoSeguroSmall(db, companyA.companyId, { parecer: TEST_PARECER });
}, 60_000);

afterAll(async () => {
  const jobIds = enqueued.map((payload) => payload.job_id);
  if (jobIds.length > 0) {
    await db.delete(entities).where(and(eq(entities.company_id, companyId), inArray(entities.id, jobIds)));
    await db.delete(ops).where(and(eq(ops.company_id, companyId), inArray(ops.path, jobIds.map((id) => `generation_job/${id}`))));
  }
  await db.delete(entities).where(and(eq(entities.company_id, companyId), eq(entities.id, revisionId)));
  await removePortoSeguroSmall(db);
  await sql.end();
});

async function aPressWaitsOnTheLock(): Promise<boolean> {
  const rows = await db.execute(dsql`select count(*)::int as n from pg_stat_activity where wait_event_type = 'Lock' and wait_event = 'advisory'`);
  return ((rows as unknown as { n: number }[])[0]?.n ?? 0) > 0;
}

describe('A-12 "unchanged" is decided under the company lock', () => {
  it('a revision committed while the press waits for the lock answers unchanged, and no second job is queued', async () => {
    let response: Promise<Response> | null = null;
    await db.transaction(async (tx: Tx) => {
      await lockCompany(tx, companyId);
      response = Promise.resolve(
        app.request(`/api/relatorios/${RELATORIO_ID}/generate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ last_op_id: null, file_ids_expected: [] }),
        }),
      );
      const deadline = Date.now() + 15_000;
      while (!(await aPressWaitsOnTheLock())) {
        if (Date.now() > deadline) throw new Error('the press never waited for the lock');
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      // A job of this relatório commits revision 1 of the relatório as it stands now.
      const [head] = await tx.select({ seq: max(ops.seq) }).from(ops).where(eq(ops.company_id, companyId));
      const revision: RevisionRow = {
        id: revisionId,
        relatorio_id: RELATORIO_ID,
        number: 1,
        snapshot_seq: head!.seq!,
        created_by: companyA.userId,
        docx_file_id: newId(),
        pdf_file_id: newId(),
        created_at: new Date().toISOString(),
      };
      await tx.insert(entities).values({ company_id: companyId, entity: 'revision', id: revisionId, relatorio_id: RELATORIO_ID, project_id: null, row: revision, removed_at: null, updated_seq: head!.seq! });
    });
    const res = await response!;
    expect(res.status, await res.clone().text()).toBe(200);
    expect(generateResponseSchema.parse(await res.json())).toEqual({ outcome: 'unchanged', revision_id: revisionId, revision_number: 1 });
    expect(enqueued).toEqual([]);
  }, 30_000);
});
