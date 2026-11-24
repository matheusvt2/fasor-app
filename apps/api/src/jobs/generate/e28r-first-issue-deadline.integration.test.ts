import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';
import { buffer } from 'node:stream/consumers';
import { newPointRow, objectKey, revisionRowSchema, SERVER_DEVICE_ID, toIso, type Op, type RevisionRow } from '@app/domain';
import { layoutLockFixture } from '@app/domain/fixtures/layout-lock';
import { and, eq, inArray, or } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../../auth/auth.ts';
import { parseTrustedOrigins } from '../../auth/trusted-origins.ts';
import { now } from '../../clock.ts';
import { loadConfig } from '../../config.ts';
import { createDb } from '../../db/client.ts';
import { asCompanyId } from '../../db/repositories/company-id.ts';
import { entities, ops } from '../../db/schema.ts';
import { seedTestCompanies, TEST_SEED } from '../../db/seed.ts';
import { newId } from '../../ids.ts';
import { createS3, getObject } from '../../storage/s3.ts';
import { applyOps } from '../../sync/apply.ts';
import { extractStructure } from './docx-structure.test-support.ts';
import { GENERATE_ACTOR, runGenerateJob } from './job.ts';

/*
 * 28.5-INT-002 (batch e28r; Matheus 2026-11-23, "Opção A"): on seed v18 a suggested deadline counts from the relatório's
 * FIRST issue in every revision. The synthetic v18 relatório (`layoutLockFixture('v18')`) with a P1 point suggested on
 * 2026-12-01 is issued twice by the generate job itself, in process, with its clock at 2026-12-10 and at 2027-02-10: both
 * DOCX print 09/01/2027 (the first issue plus 30 days), and a typed date prints as typed. The job renders the PDF too, so
 * it needs LibreOffice, which the api image carries and the tools image does not:
 *   podman compose exec api pnpm --filter @app/api exec vitest run src/jobs/generate/e28r-first-issue-deadline.integration.test.ts
 * Where no `soffice` is on the PATH it is skipped. Every value is invented.
 */

const sofficeOnPath = (process.env.PATH ?? '').split(delimiter).some((dir) => {
  try {
    accessSync(join(dir, 'soffice'), constants.X_OK);
    return true;
  } catch {
    return false;
  }
});

const REV_1 = '2026-12-10T15:00:00.000Z';
const REV_2 = '2027-02-10T15:00:00.000Z';
const DEVICE = 'tablet-e28r-first-issue';
const companyA = TEST_SEED.companies[0];
const companyId = asCompanyId(companyA.companyId);
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const s3 = createS3(config);
const auth = createAuth({ db, secret: config.SESSION_SECRET, baseURL: config.AUTH_BASE_URL, trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS) });
const fixture = layoutLockFixture('v18', { companyId: companyA.companyId, actorId: companyA.userId, deviceId: DEVICE });

/** A UUIDv7 minted at `iso`. */
function v7At(iso: string, tail: string): string {
  const hex = Date.parse(iso).toString(16).padStart(12, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7000-8000-${tail}`;
}

function relatorioOp(path: string, value: Op['value'], actor: string = companyA.userId, device: string = DEVICE): Op {
  return {
    op_id: newId(),
    kind: 'create',
    scope: 'relatorio',
    company_id: companyA.companyId,
    project_id: null,
    relatorio_id: fixture.relatorioId,
    path,
    value,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: actor,
    device_id: device,
    client_ts: toIso(now()),
  };
}

async function removeFixture(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(ops).where(and(eq(ops.company_id, companyA.companyId), or(inArray(ops.op_id, fixture.log.map((op) => op.op_id)), eq(ops.relatorio_id, fixture.relatorioId), eq(ops.project_id, fixture.projectId))));
    await tx
      .delete(entities)
      .where(and(eq(entities.company_id, companyA.companyId), or(eq(entities.relatorio_id, fixture.relatorioId), eq(entities.project_id, fixture.projectId), inArray(entities.id, [fixture.projectId, ...fixture.companyEntityIds]))));
  });
}

/** One issue job run by the job function with its clock at `at`; the revision it committed. */
async function issueAt(at: string, number: number): Promise<RevisionRow> {
  const jobId = newId();
  const created = await applyOps(
    db,
    companyId,
    [relatorioOp(`generation_job/${jobId}`, { id: jobId, relatorio_id: fixture.relatorioId, kind: 'issue', status: 'queued', error: null, result_file_id: null, result: null, created_at: at }, GENERATE_ACTOR, SERVER_DEVICE_ID)],
    { now, origin: 'server' },
  );
  expect(created.rejected).toEqual([]);
  const outcome = await runGenerateJob({ db, s3, bucket: config.S3_BUCKET, now: () => new Date(at), newId }, { job_id: jobId, company_id: companyA.companyId, relatorio_id: fixture.relatorioId, actor_id: companyA.userId, kind: 'issue' });
  expect(outcome).toBe('done');
  const rows = await db.select({ row: entities.row }).from(entities).where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, 'revision'), eq(entities.relatorio_id, fixture.relatorioId)));
  const revision = rows.map((record) => revisionRowSchema.parse(record.row)).find((row) => row.number === number);
  expect(revision, `revision ${number}`).toBeDefined();
  expect(revision!.created_at).toBe(at);
  return revision!;
}

/** The action plan's Prazo cells of the two points this test wrote, from the revision's DOCX. */
async function deadlinesOf(revision: RevisionRow): Promise<(string | undefined)[]> {
  const stored = await getObject(s3, config.S3_BUCKET, objectKey(companyA.companyId, 'docx', revision.docx_file_id));
  expect(stored).not.toBeNull();
  const structure = extractStructure(await buffer(stored!.body));
  const plan = structure.tables.find((table) => table[0]?.[0] === 'Nº' && table[0]?.[4] === 'Prazo')!;
  expect(plan).toBeDefined();
  return plan.slice(1).filter((cells) => /^Ponto e28r/.test(cells[1] ?? '')).map((cells) => cells[4]);
}

beforeAll(async () => {
  if (!sofficeOnPath) return;
  await seedTestCompanies(db, auth);
  await removeFixture();
  const applied = await applyOps(db, companyId, fixture.log.map((op): Op => ({ ...op })), { now, origin: 'server' });
  expect(applied.rejected).toEqual([]);
  const suggested = newPointRow({ id: v7At('2026-12-01T15:00:00Z', '0000000e28a1'), relatorioId: fixture.relatorioId, text: 'Ponto e28r sugerido', equipmentId: null, origin: 'manual', action: 'Ação' }, []);
  const typed = newPointRow({ id: v7At('2026-12-01T15:00:00Z', '0000000e28a2'), relatorioId: fixture.relatorioId, text: 'Ponto e28r digitado', equipmentId: null, origin: 'manual', action: 'Ação' }, [suggested]);
  const points = await applyOps(
    db,
    companyId,
    [relatorioOp(`point/${suggested.id}`, { ...suggested, priority: 'P1', deadline: '2026-12-31' }), relatorioOp(`point/${typed.id}`, { ...typed, priority: 'P2', deadline: '2027-04-15' })],
    { now, origin: 'server' },
  );
  expect(points.rejected).toEqual([]);
}, 60_000);

afterAll(async () => {
  if (sofficeOnPath) await removeFixture();
  await sql.end();
});

describe.skipIf(!sofficeOnPath)('28.5-INT-002 the v18 suggested deadline counts from the first issue in every revision', () => {
  it('revision 1 issued 2026-12-10 and revision 2 issued 2027-02-10 both print 09/01/2027; the typed date as typed', async () => {
    const first = await issueAt(REV_1, 1);
    expect(await deadlinesOf(first)).toEqual(['09/01/2027', '15/04/2027']);
    const second = await issueAt(REV_2, 2);
    expect(await deadlinesOf(second)).toEqual(['09/01/2027', '15/04/2027']);
  }, 400_000);
});
