import {
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  instantiateTemplate,
  makeOp,
  standardTemplate,
  syncPullResponseSchema,
  syncPushResponseSchema,
  type Op,
  type OpDraft,
} from '@app/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../auth/auth.ts';
import { parseTrustedOrigins } from '../auth/trusted-origins.ts';
import { now } from '../clock.ts';
import { loadConfig } from '../config.ts';
import { createDb } from '../db/client.ts';
import { seedTestCompanies, TEST_SEED } from '../db/seed.ts';
import { entities, ops } from '../db/schema.ts';
import { newId } from '../ids.ts';

/*
 * Story 4.1 (AR-5, AR-23): a relatório created from the standard template is ONE client
 * batch — the project create plus the 223 creates `instantiateTemplate` produces — that
 * the server applies op by op and copies nothing; the relatório stream then unites the
 * 94 project-scope equipment ops with the relatório's own ops, in seq order.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const company = TEST_SEED.companies[0];
const DEVICE = 'tablet-test-relatorio-creation';

const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const auth = createAuth({
  db,
  secret: config.SESSION_SECRET,
  baseURL: config.AUTH_BASE_URL,
  trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
});

const written = { opIds: new Set<string>(), entityIds: new Set<string>() };
let cookie = '';

async function signIn(): Promise<string> {
  const res = await fetch(`${apiUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/json', origin: apiUrl },
    body: JSON.stringify({ email: company.email, password: TEST_SEED.password }),
  });
  expect(res.status, await res.text()).toBe(200);
  return res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}

async function authed(path: string, init: RequestInit = {}): Promise<Response> {
  const call = () =>
    fetch(`${apiUrl}${path}`, {
      ...init,
      redirect: 'manual',
      headers: { 'content-type': 'application/json', origin: apiUrl, [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION), cookie, ...(init.headers as Record<string, string> | undefined) },
    });
  const first = await call();
  if (first.status !== 401) return first;
  cookie = await signIn();
  return call();
}

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  cookie = await signIn();
}, 60_000);

afterAll(async () => {
  const opIds = [...written.opIds];
  const entityIds = [...written.entityIds];
  if (opIds.length > 0) await db.delete(ops).where(inArray(ops.op_id, opIds));
  if (entityIds.length > 0) await db.delete(entities).where(inArray(entities.id, entityIds));
  await sql.end();
});

describe('4.1-API relatório creation as one batch', () => {
  it(
    'pushes the project plus the 223 instantiate drafts under one batch_id with zero rejections, and the relatório stream unites the equipment ops',
    async () => {
      const template = standardTemplate({ id: newId() });
      const projectId = newId();
      const projectDraft: OpDraft = {
        kind: 'create',
        scope: 'company',
        company_id: company.companyId,
        project_id: null,
        relatorio_id: null,
        path: `project/${projectId}`,
        value: { id: projectId, client_id: null, name: 'Obra de teste', site: 'Obra de teste', removed_at: null },
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: company.userId,
      };
      const { relatorioId, drafts } = instantiateTemplate(
        template,
        { id: projectId },
        { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null },
        { newId, actorId: company.userId, companyId: company.companyId },
      );
      expect(drafts).toHaveLength(223);

      const batchId = newId();
      const at = now();
      const batch: Op[] = [projectDraft, ...drafts].map((draft) => makeOp({ ...draft, batch_id: batchId, device_id: DEVICE }, { newId, now: at }));
      for (const op of batch) {
        written.opIds.add(op.op_id);
        written.entityIds.add((op.value as { id: string }).id);
      }
      expect(new Set(batch.map((op) => op.batch_id)).size).toBe(1);

      const res = await authed('/api/sync/ops', { method: 'POST', body: JSON.stringify({ ops: batch }) });
      expect(res.status, await res.clone().text()).toBe(200);
      const pushed = syncPushResponseSchema.parse(await res.json());
      expect(pushed.rejected).toEqual([]);
      expect(pushed.applied).toHaveLength(224);

      // The server materialized every row: 94 equipment and 105 blocks (11 sections + 94 sheets).
      const equipmentRows = await db
        .select({ id: entities.id })
        .from(entities)
        .where(and(eq(entities.company_id, company.companyId), eq(entities.entity, 'equipment'), eq(entities.project_id, projectId)));
      expect(equipmentRows).toHaveLength(94);
      const blockRows = await db
        .select({ id: entities.id })
        .from(entities)
        .where(and(eq(entities.company_id, company.companyId), eq(entities.entity, 'block'), eq(entities.relatorio_id, relatorioId)));
      expect(blockRows).toHaveLength(105);

      // AR-23: the relatório stream is its own ops united with the project-scope equipment ops, in seq order.
      const pull = await authed(`/api/sync/relatorios/${relatorioId}?since=0`);
      expect(pull.status, await pull.clone().text()).toBe(200);
      const page = syncPullResponseSchema.parse(await pull.json());
      const pulled = page.ops as Op[];
      expect(pulled.filter((op) => op.scope === 'project' && op.path.startsWith('equipment/'))).toHaveLength(94);
      expect(pulled.filter((op) => op.relatorio_id === relatorioId)).toHaveLength(1 + 23 + 105);
      expect(pulled.some((op) => op.path === `project/${projectId}`)).toBe(false);
      const seqs = pulled.map((op) => op.seq!);
      expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
      expect(pulled.every((op) => op.batch_id === batchId)).toBe(true);
    },
    60_000,
  );
});
