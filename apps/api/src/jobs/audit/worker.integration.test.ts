import { auditRunRowSchema, toIso } from '@app/domain';
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
import { serverOp } from '../../sync/server-op.ts';
import { applyOps } from '../../sync/apply.ts';
import { AUDIT_ACTOR } from './payload.ts';
import { createAuditProvider } from './provider.ts';
import { handleAuditJobs } from './worker.ts';

/*
 * Review fixes 2026-10-08 (API-V1; deferred-work "audit worker's invalid-payload path"): a queue
 * job whose payload fails the worker schema fails its `audit_run` row (`status failed`, `error
 * audit_failed`) and stamps `finished_at`, as every other failure writer does, when its run and
 * company ids parse and the row exists; otherwise it is only logged and never throws. Driven
 * through `handleAuditJobs` against the compose Postgres; no job runs, so no provider is called.
 */

const companyA = TEST_SEED.companies[0];
const companyId = asCompanyId(companyA.companyId);
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const auth = createAuth({ db, secret: config.SESSION_SECRET, baseURL: config.AUTH_BASE_URL, trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS) });
const FIXED_NOW = new Date('2026-10-08T12:00:00.000Z');
const deps = { db, now: () => FIXED_NOW, newId, provider: createAuditProvider({ LLM_PROVIDER: 'fake' }) };

async function createRunRow(): Promise<string> {
  const runId = newId();
  const createdAt = toIso(now());
  const created = await applyOps(
    db,
    companyId,
    [
      serverOp({
        opId: newId(),
        companyId: companyA.companyId,
        actorId: AUDIT_ACTOR,
        clientTs: createdAt,
        kind: 'create',
        path: `audit_run/${runId}`,
        value: { id: runId, relatorio_id: SMALL_FIXTURE_RELATORIO_ID, status: 'queued', findings: [], error: null, prompt_version: null, created_at: createdAt, started_at: null, finished_at: null },
        relatorioId: SMALL_FIXTURE_RELATORIO_ID,
      }),
    ],
    { now, origin: 'server' },
  );
  expect(created.rejected).toEqual([]);
  return runId;
}

async function runRow(runId: string) {
  const [record] = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'audit_run'), eq(entities.id, runId)));
  return auditRunRowSchema.parse(record?.row);
}

const runOps = (runId: string) =>
  db
    .select({ path: ops.path, value: ops.value, actor_id: ops.actor_id })
    .from(ops)
    .where(inArray(ops.path, [`audit_run/${runId}/status`, `audit_run/${runId}/error`, `audit_run/${runId}/finished_at`]));

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  await seedPortoSeguroSmall(db, companyA.companyId);
}, 60_000);

afterAll(async () => {
  await removePortoSeguroSmall(db);
  await sql.end();
});

describe('API-V1 an invalid audit payload', () => {
  it('fails the existing run row with audit_failed and stamps finished_at, written by the audit actor', async () => {
    const runId = await createRunRow();
    // The relatório id and the actor fail the schema; the run and company ids parse.
    await handleAuditJobs(deps, [{ id: 'queue-job-1', data: { run_id: runId, company_id: companyA.companyId, relatorio_id: 'not-a-uuid', actor_id: '' } }]);
    const row = await runRow(runId);
    expect(row.status).toBe('failed');
    expect(row.error).toBe('audit_failed');
    expect(row.finished_at).toBe(toIso(FIXED_NOW));
    const written = await runOps(runId);
    expect(written.map((op) => [op.path, op.value, op.actor_id]).sort()).toEqual([
      [`audit_run/${runId}/error`, 'audit_failed', AUDIT_ACTOR],
      [`audit_run/${runId}/finished_at`, toIso(FIXED_NOW), AUDIT_ACTOR],
      [`audit_run/${runId}/status`, 'failed', AUDIT_ACTOR],
    ]);
  });

  it('only logs when the ids do not parse or no run row exists, and never throws', async () => {
    const runId = await createRunRow();
    await expect(
      handleAuditJobs(deps, [
        { id: 'queue-job-2', data: { run_id: 'nope', company_id: companyA.companyId } },
        { id: 'queue-job-3', data: null },
        // Ids that parse but name no row of this company.
        { id: 'queue-job-4', data: { run_id: newId(), company_id: companyA.companyId } },
        { id: 'queue-job-5', data: { run_id: runId, company_id: TEST_SEED.companies[1].companyId } },
      ]),
    ).resolves.toBeUndefined();
    const row = await runRow(runId);
    expect(row.status).toBe('queued');
    expect(row.error).toBeNull();
    expect(row.finished_at).toBeNull();
    expect(await runOps(runId)).toEqual([]);
  });
});
