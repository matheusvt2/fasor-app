import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  auditResponseSchema,
  auditRunRowSchema,
  blockRowSchema,
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  instantiateTemplate,
  isEquipmentBlock,
  makeOp,
  newEquipmentBlock,
  opSchema,
  standardTemplate,
  syncPullResponseSchema,
  syncPushResponseSchema,
  type LocationRow,
  type Op,
  type OpDraft,
} from '@app/domain';
import { and, eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../../auth/auth.ts';
import { parseTrustedOrigins } from '../../auth/trusted-origins.ts';
import { now } from '../../clock.ts';
import { loadConfig } from '../../config.ts';
import { createDb } from '../../db/client.ts';
import { entities, ops } from '../../db/schema.ts';
import { seedTestCompanies, TEST_SEED } from '../../db/seed.ts';
import { createApp } from '../../http/app.ts';
import { newId } from '../../ids.ts';
import { createS3 } from '../../storage/s3.ts';
import { runAuditJob } from './job.ts';
import type { AuditPayload } from './payload.ts';
import { createAuditProvider } from './provider.ts';

/*
 * Story 14.10 lane B (contract 20): the audit run's coverage through the route and the job. A
 * tap creates a run with `coverage: null`; the fake job writes `audit_run/{id}/coverage` with
 * the sheets the text carried of the ones the layout prints, and the relatório stream pulled
 * at the current contract carries that put. A device's push of the same path is refused as
 * server-only (`op_server_only`), like every other `audit_run` field.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const DEVICE = 'tablet-audit-coverage';
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const s3 = createS3(config);
const auth = createAuth({ db, secret: config.SESSION_SECRET, baseURL: config.AUTH_BASE_URL, trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS) });
const staticDir = mkdtempSync(join(tmpdir(), 'audit-coverage-'));
const up = async () => undefined;
const probes = { db: up, queue: up, storage: up, libreoffice: up };
const relatorios = new Set<string>();
const projects = new Set<string>();

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

type App = ReturnType<typeof createApp>;

const appWith = (sent: AuditPayload[]): App => createApp({ probes, auth, db, s3, bucket: config.S3_BUCKET, staticDir, enqueueAudit: async (payload) => void sent.push(payload) });

function request(app: App, path: string, init: RequestInit = {}): Promise<Response> | Response {
  return app.request(path, { ...init, headers: { cookie, [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION), ...(init.headers as Record<string, string>) } });
}

const stamp = (draft: OpDraft): Op => makeOp({ ...draft, device_id: DEVICE }, { newId, now: now() });

async function pushOps(app: App, batch: Op[]) {
  const res = await request(app, '/api/sync/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ops: batch }) });
  expect(res.status, await res.clone().text()).toBe(200);
  return syncPushResponseSchema.parse(await res.json());
}

/** A relatório of the standard template plus one chave seccionadora, pushed by company A's device; its newest op id. */
async function relatorio(app: App): Promise<{ relatorioId: string; lastOpId: string }> {
  const projectId = newId();
  projects.add(projectId);
  const projectDraft: OpDraft = {
    kind: 'create',
    scope: 'company',
    company_id: companyA.companyId,
    project_id: null,
    relatorio_id: null,
    path: `project/${projectId}`,
    value: { id: projectId, client_id: null, name: 'Obra cobertura', site: 'Obra cobertura', removed_at: null },
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: companyA.userId,
  };
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: newId() }),
    { id: projectId },
    { service_start: '2026-10-14', service_end: '2026-10-15', existingEquipment: [], responsible_user_id: null },
    { newId, actorId: companyA.userId, companyId: companyA.companyId },
  );
  relatorios.add(relatorioId);
  const coluna = drafts.map((draft) => draft.value as unknown as LocationRow).find((row) => row?.kind === 'coluna')!;
  const pair = newEquipmentBlock({
    blockId: newId(),
    equipmentId: newId(),
    relatorioId,
    projectId,
    locationId: coluna.id,
    type: 'chave_seccionadora',
    tag: 'SEC-COV',
    seedVersion: 'v3',
    orderKey: 'zz',
  });
  const envelope = { company_id: companyA.companyId, prev_op_id: null, batch_id: null, meta: null, actor_id: companyA.userId, kind: 'create' as const };
  const creation = [
    projectDraft,
    ...drafts,
    { ...envelope, scope: 'project' as const, project_id: projectId, relatorio_id: null, path: `equipment/${pair.equipment.id}`, value: pair.equipment as never },
    { ...envelope, scope: 'relatorio' as const, project_id: null, relatorio_id: relatorioId, path: `block/${pair.block.id}`, value: pair.block as never },
  ].map(stamp);
  const pushed = await pushOps(app, creation);
  expect(pushed.rejected).toEqual([]);
  return { relatorioId, lastOpId: creation.at(-1)!.op_id };
}

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  cookie = await signIn();
}, 60_000);

afterAll(async () => {
  const ids = [...relatorios];
  if (ids.length > 0) {
    await db.delete(ops).where(and(eq(ops.company_id, companyA.companyId), inArray(ops.relatorio_id, ids)));
    await db.delete(entities).where(and(eq(entities.company_id, companyA.companyId), inArray(entities.relatorio_id, ids)));
    await db.delete(entities).where(and(eq(entities.company_id, companyA.companyId), inArray(entities.id, ids)));
  }
  for (const projectId of projects) {
    await db.delete(ops).where(and(eq(ops.company_id, companyA.companyId), like(ops.path, `project/${projectId}%`)));
    await db.delete(ops).where(and(eq(ops.company_id, companyA.companyId), eq(ops.project_id, projectId)));
    await db.delete(entities).where(and(eq(entities.company_id, companyA.companyId), eq(entities.project_id, projectId)));
    await db.delete(entities).where(and(eq(entities.company_id, companyA.companyId), eq(entities.id, projectId)));
  }
  rmSync(staticDir, { recursive: true, force: true });
  await sql.end();
});

describe('14.10-API-001 the audit run stores its coverage (contract 20)', () => {
  it('the route creates the run with no coverage; the fake job writes sent and total; the stream carries the put; a device push of it is refused as server-only', async () => {
    const queued: AuditPayload[] = [];
    const app = appWith(queued);
    const { relatorioId, lastOpId } = await relatorio(app);

    const res = await request(app, `/api/relatorios/${relatorioId}/audit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ last_op_id: lastOpId, file_ids_expected: [] }),
    });
    expect(res.status, await res.clone().text()).toBe(202);
    const { audit_run_id: runId } = auditResponseSchema.parse(await res.json());

    const runRow = async () => {
      const [record] = await db
        .select({ row: entities.row })
        .from(entities)
        .where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, 'audit_run'), eq(entities.id, runId)));
      return auditRunRowSchema.parse(record?.row);
    };
    expect((await runRow()).coverage).toBeNull();

    expect(await runAuditJob({ db, now, newId, provider: createAuditProvider({ LLM_PROVIDER: 'fake', AI_FEATURES: 'on' }) }, queued[0]!)).toBe('done');

    // Every live equipment sheet of the relatório prints in section 9. The standard template's
    // relatório holds about 95 sheets, more than the text cap carries: the run says how many it sent.
    const blocks = (await db.select({ row: entities.row }).from(entities).where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, 'block'), eq(entities.relatorio_id, relatorioId)))).map(
      (record) => blockRowSchema.parse(record.row),
    );
    const sheets = blocks.filter((block) => block.removed_at === null && isEquipmentBlock(block)).length;
    expect(sheets).toBeGreaterThan(1);
    const done = await runRow();
    expect(done.status).toBe('done');
    expect(done.coverage?.total).toBe(sheets);
    const sent = done.coverage!.sent;
    expect(sent).toBeGreaterThan(0);
    expect(sent).toBeLessThanOrEqual(sheets);

    const pull = await request(app, `/api/sync/relatorios/${relatorioId}?since=0`);
    expect(pull.status).toBe(200);
    const pulled = syncPullResponseSchema.parse(await pull.json()).ops.map((op) => opSchema.parse(op));
    const coverage = pulled.find((op) => op.path === `audit_run/${runId}/coverage`);
    expect(coverage?.kind).toBe('put');
    expect(coverage?.value).toEqual({ sent, total: sheets });

    const forged = stamp({
      kind: 'put',
      scope: 'relatorio',
      company_id: companyA.companyId,
      project_id: null,
      relatorio_id: relatorioId,
      path: `audit_run/${runId}/coverage`,
      value: { sent: 76, total: 76 },
      prev_op_id: coverage?.op_id ?? null,
      batch_id: null,
      meta: null,
      actor_id: companyA.userId,
    });
    const refused = await pushOps(app, [forged]);
    expect(refused.applied).toEqual([]);
    expect(refused.rejected).toEqual([{ op_id: forged.op_id, code: 'op_server_only' }]);
    expect((await runRow()).coverage).toEqual({ sent, total: sheets });
  });
});
