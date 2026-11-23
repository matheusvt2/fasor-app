import {
  blockFieldPath,
  choiceValue,
  EMPTY_DEFINITION_CONTEXT,
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  instantiateTemplate,
  makeOp,
  sheetChecklistPath,
  sheetTestValuePath,
  MIN_CONTRACT_VERSION,
  SEED_VERSION,
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
        { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
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

describe('24.2-API-001 seed v14 through the sync route', () => {
  it(
    'a relatório created from the standard template on v14 is on v14, every sheet on v14; a version-46 client is refused its stream with 426, a current one reads it (pinned to v14 since seed v15, Story 25.5)',
    async () => {
      expect(MIN_CONTRACT_VERSION).toBeGreaterThanOrEqual(49);
      const projectId = newId();
      const projectDraft: OpDraft = {
        kind: 'create',
        scope: 'company',
        company_id: company.companyId,
        project_id: null,
        relatorio_id: null,
        path: `project/${projectId}`,
        value: { id: projectId, client_id: null, name: 'Obra v14', site: 'Obra v14', removed_at: null },
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: company.userId,
      };
      const { relatorioId, drafts } = instantiateTemplate(
        standardTemplate({ id: newId(), seedVersion: 'v14' }),
        { id: projectId },
        { service_start: '2026-11-11', service_end: '2026-11-11', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
        { newId, actorId: company.userId, companyId: company.companyId },
      );
      const batchId = newId();
      const at = now();
      const batch: Op[] = [projectDraft, ...drafts].map((draft) => makeOp({ ...draft, batch_id: batchId, device_id: DEVICE }, { newId, now: at }));
      for (const op of batch) {
        written.opIds.add(op.op_id);
        written.entityIds.add((op.value as { id: string }).id);
      }
      const res = await authed('/api/sync/ops', { method: 'POST', body: JSON.stringify({ ops: batch }) });
      expect(res.status, await res.clone().text()).toBe(200);
      expect(syncPushResponseSchema.parse(await res.json()).rejected).toEqual([]);

      const [relatorio] = await db
        .select({ row: entities.row })
        .from(entities)
        .where(and(eq(entities.company_id, company.companyId), eq(entities.entity, 'relatorio'), eq(entities.id, relatorioId)));
      expect(relatorio?.row).toMatchObject({ seed_version: 'v14' });
      const blocks = await db
        .select({ row: entities.row })
        .from(entities)
        .where(and(eq(entities.company_id, company.companyId), eq(entities.entity, 'block'), eq(entities.relatorio_id, relatorioId)));
      const sheets = blocks.map((block) => block.row as { seed_version: string; equipment_id: string | null }).filter((block) => block.equipment_id !== null);
      expect(sheets.length).toBeGreaterThan(0);
      expect(new Set(sheets.map((block) => block.seed_version))).toEqual(new Set(['v14']));

      // The previous contract ships no seed v14: its pull is refused with the update notice's code.
      const old = await authed(`/api/sync/relatorios/${relatorioId}?since=0`, { headers: { [CONTRACT_VERSION_HEADER]: '46' } });
      expect(old.status).toBe(426);
      expect(((await old.json()) as { code: string }).code).toBe('contract_outdated');
      const current = await authed(`/api/sync/relatorios/${relatorioId}?since=0`, { headers: { [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION) } });
      expect(current.status, await current.clone().text()).toBe(200);
      const pulled = syncPullResponseSchema.parse(await current.json()).ops as Op[];
      expect(pulled.find((op) => op.path === `relatorio/${relatorioId}`)?.value).toMatchObject({ seed_version: 'v14' });
    },
    60_000,
  );
});

/*
 * 25.5-API-001 (Story 25.5, batch e25c, contract 50): seed v15 opens equal to v14 and is the version a new
 * relatório is born on. A relatório created from the standard template through the sync route is on v15, every
 * sheet on v15; a version-49 client (the contract before) is refused its stream with 426 and the update
 * notice's code, and the current one reads it.
 */
describe('25.5-API-001 seed v15 through the sync route', () => {
  it(
    'a relatório created from the standard template on v15 is on v15, every sheet on v15; a version-49 client is refused its stream with 426 contract_outdated, a current one reads it (pinned to v15 since seed v16, batch e25s)',
    async () => {
      // Batch e25p (Story 25.23) moved the contract to 51: 49 stays refused.
      expect(MIN_CONTRACT_VERSION).toBeGreaterThanOrEqual(50);
      const projectId = newId();
      const projectDraft: OpDraft = {
        kind: 'create',
        scope: 'company',
        company_id: company.companyId,
        project_id: null,
        relatorio_id: null,
        path: `project/${projectId}`,
        value: { id: projectId, client_id: null, name: 'Obra v15', site: 'Obra v15', removed_at: null },
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: company.userId,
      };
      const { relatorioId, drafts } = instantiateTemplate(
        standardTemplate({ id: newId(), seedVersion: 'v15' }),
        { id: projectId },
        { service_start: '2026-11-11', service_end: '2026-11-11', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
        { newId, actorId: company.userId, companyId: company.companyId },
      );
      const batchId = newId();
      const at = now();
      const batch: Op[] = [projectDraft, ...drafts].map((draft) => makeOp({ ...draft, batch_id: batchId, device_id: DEVICE }, { newId, now: at }));
      for (const op of batch) {
        written.opIds.add(op.op_id);
        written.entityIds.add((op.value as { id: string }).id);
      }
      const res = await authed('/api/sync/ops', { method: 'POST', body: JSON.stringify({ ops: batch }) });
      expect(res.status, await res.clone().text()).toBe(200);
      expect(syncPushResponseSchema.parse(await res.json()).rejected).toEqual([]);

      const [relatorio] = await db
        .select({ row: entities.row })
        .from(entities)
        .where(and(eq(entities.company_id, company.companyId), eq(entities.entity, 'relatorio'), eq(entities.id, relatorioId)));
      expect(relatorio?.row).toMatchObject({ seed_version: 'v15' });
      const blocks = await db
        .select({ row: entities.row })
        .from(entities)
        .where(and(eq(entities.company_id, company.companyId), eq(entities.entity, 'block'), eq(entities.relatorio_id, relatorioId)));
      const sheets = blocks.map((block) => block.row as { seed_version: string; equipment_id: string | null }).filter((block) => block.equipment_id !== null);
      expect(sheets.length).toBeGreaterThan(0);
      expect(new Set(sheets.map((block) => block.seed_version))).toEqual(new Set(['v15']));

      // The previous contract ships no seed v15: its pull is refused with the update notice's code.
      const old = await authed(`/api/sync/relatorios/${relatorioId}?since=0`, { headers: { [CONTRACT_VERSION_HEADER]: '49' } });
      expect(old.status).toBe(426);
      expect(((await old.json()) as { code: string }).code).toBe('contract_outdated');
      const current = await authed(`/api/sync/relatorios/${relatorioId}?since=0`, { headers: { [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION) } });
      expect(current.status, await current.clone().text()).toBe(200);
      const pulled = syncPullResponseSchema.parse(await current.json()).ops as Op[];
      expect(pulled.find((op) => op.path === `relatorio/${relatorioId}`)?.value).toMatchObject({ seed_version: 'v15' });
    },
    60_000,
  );
});

/*
 * e25s-API-001 (batch e25s, Epic 25 wave 3, contract 53): seed v16 opens equal to v15 and is the version a new
 * relatório is born on. A relatório created from the standard template through the sync route is on v16, every
 * sheet on v16; a version-52 client (the contract before) is refused its stream with 426 and the update
 * notice's code, and the current one reads it.
 */
describe('e25s-API-001 seed v16 through the sync route', () => {
  it(
    'a relatório created from the standard template on v16 is on v16, every sheet on v16; a version-52 client is refused its stream with 426 contract_outdated, a current one reads it (pinned to v16 since seed v17, batch e27b)',
    async () => {
      expect(MIN_CONTRACT_VERSION).toBeGreaterThanOrEqual(53);
      const projectId = newId();
      const projectDraft: OpDraft = {
        kind: 'create',
        scope: 'company',
        company_id: company.companyId,
        project_id: null,
        relatorio_id: null,
        path: `project/${projectId}`,
        value: { id: projectId, client_id: null, name: 'Obra v16', site: 'Obra v16', removed_at: null },
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: company.userId,
      };
      const { relatorioId, drafts } = instantiateTemplate(
        standardTemplate({ id: newId(), seedVersion: 'v16' }),
        { id: projectId },
        { service_start: '2026-11-11', service_end: '2026-11-11', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
        { newId, actorId: company.userId, companyId: company.companyId },
      );
      const batchId = newId();
      const at = now();
      const batch: Op[] = [projectDraft, ...drafts].map((draft) => makeOp({ ...draft, batch_id: batchId, device_id: DEVICE }, { newId, now: at }));
      for (const op of batch) {
        written.opIds.add(op.op_id);
        written.entityIds.add((op.value as { id: string }).id);
      }
      const res = await authed('/api/sync/ops', { method: 'POST', body: JSON.stringify({ ops: batch }) });
      expect(res.status, await res.clone().text()).toBe(200);
      expect(syncPushResponseSchema.parse(await res.json()).rejected).toEqual([]);

      const [relatorio] = await db
        .select({ row: entities.row })
        .from(entities)
        .where(and(eq(entities.company_id, company.companyId), eq(entities.entity, 'relatorio'), eq(entities.id, relatorioId)));
      expect(relatorio?.row).toMatchObject({ seed_version: 'v16' });
      const blocks = await db
        .select({ row: entities.row })
        .from(entities)
        .where(and(eq(entities.company_id, company.companyId), eq(entities.entity, 'block'), eq(entities.relatorio_id, relatorioId)));
      const sheets = blocks.map((block) => block.row as { seed_version: string; equipment_id: string | null }).filter((block) => block.equipment_id !== null);
      expect(sheets.length).toBeGreaterThan(0);
      expect(new Set(sheets.map((block) => block.seed_version))).toEqual(new Set(['v16']));

      // The previous contract ships no seed v16: its pull is refused with the update notice's code.
      const old = await authed(`/api/sync/relatorios/${relatorioId}?since=0`, { headers: { [CONTRACT_VERSION_HEADER]: '52' } });
      expect(old.status).toBe(426);
      expect(((await old.json()) as { code: string }).code).toBe('contract_outdated');
      const current = await authed(`/api/sync/relatorios/${relatorioId}?since=0`, { headers: { [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION) } });
      expect(current.status, await current.clone().text()).toBe(200);
      const pulled = syncPullResponseSchema.parse(await current.json()).ops as Op[];
      expect(pulled.find((op) => op.path === `relatorio/${relatorioId}`)?.value).toMatchObject({ seed_version: 'v16' });
    },
    60_000,
  );
});

/*
 * 27.8-API-001 (batch e27b, Epic 27 wave 2, Story 27.8, contract 57): seed v17 opens equal to v16 and is the version
 * a new relatório is born on. A relatório created from the standard template through the sync route is on v17, every
 * sheet on v17; a version-56 client (the contract before) is refused its stream with 426 and the update notice's
 * code, and the current one reads it.
 */
describe('27.8-API-001 seed v17 through the sync route', () => {
  it(
    'a relatório created from the standard template on v17 is on v17, every sheet on v17; a version-56 client is refused its stream with 426 contract_outdated, a current one reads it (pinned to v17 since seed v18, batch e28a)',
    async () => {
      expect(MIN_CONTRACT_VERSION).toBeGreaterThanOrEqual(57);
      const projectId = newId();
      const projectDraft: OpDraft = {
        kind: 'create',
        scope: 'company',
        company_id: company.companyId,
        project_id: null,
        relatorio_id: null,
        path: `project/${projectId}`,
        value: { id: projectId, client_id: null, name: 'Obra v17', site: 'Obra v17', removed_at: null },
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: company.userId,
      };
      const { relatorioId, drafts } = instantiateTemplate(
        standardTemplate({ id: newId(), seedVersion: 'v17' }),
        { id: projectId },
        { service_start: '2026-11-11', service_end: '2026-11-11', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
        { newId, actorId: company.userId, companyId: company.companyId },
      );
      const batchId = newId();
      const at = now();
      const batch: Op[] = [projectDraft, ...drafts].map((draft) => makeOp({ ...draft, batch_id: batchId, device_id: DEVICE }, { newId, now: at }));
      for (const op of batch) {
        written.opIds.add(op.op_id);
        written.entityIds.add((op.value as { id: string }).id);
      }
      const res = await authed('/api/sync/ops', { method: 'POST', body: JSON.stringify({ ops: batch }) });
      expect(res.status, await res.clone().text()).toBe(200);
      expect(syncPushResponseSchema.parse(await res.json()).rejected).toEqual([]);

      const [relatorio] = await db
        .select({ row: entities.row })
        .from(entities)
        .where(and(eq(entities.company_id, company.companyId), eq(entities.entity, 'relatorio'), eq(entities.id, relatorioId)));
      expect(relatorio?.row).toMatchObject({ seed_version: 'v17' });
      const blocks = await db
        .select({ row: entities.row })
        .from(entities)
        .where(and(eq(entities.company_id, company.companyId), eq(entities.entity, 'block'), eq(entities.relatorio_id, relatorioId)));
      const sheets = blocks.map((block) => block.row as { seed_version: string; equipment_id: string | null }).filter((block) => block.equipment_id !== null);
      expect(sheets.length).toBeGreaterThan(0);
      expect(new Set(sheets.map((block) => block.seed_version))).toEqual(new Set(['v17']));

      // The previous contract ships no seed v17: its pull is refused with the update notice's code.
      const old = await authed(`/api/sync/relatorios/${relatorioId}?since=0`, { headers: { [CONTRACT_VERSION_HEADER]: '56' } });
      expect(old.status).toBe(426);
      expect(((await old.json()) as { code: string }).code).toBe('contract_outdated');
      const current = await authed(`/api/sync/relatorios/${relatorioId}?since=0`, { headers: { [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION) } });
      expect(current.status, await current.clone().text()).toBe(200);
      const pulled = syncPullResponseSchema.parse(await current.json()).ops as Op[];
      expect(pulled.find((op) => op.path === `relatorio/${relatorioId}`)?.value).toMatchObject({ seed_version: 'v17' });
    },
    60_000,
  );
});

/*
 * 28.2-API-001 (batch e28a, Epic 28 wave 1, Story 28.2, contract 58): seed v18 opens equal to v17 and is the version
 * a new relatório is born on. A relatório created from the standard template through the sync route is on v18, every
 * sheet on v18; a version-57 client (the contract before) is refused its stream with 426 and the update notice's
 * code, and the current one reads it.
 */
describe('28.2-API-001 seed v18 through the sync route', () => {
  it(
    'a relatório created from the standard template is born on v18, every sheet on v18; a version-57 client is refused its stream with 426 contract_outdated, a current one reads it',
    async () => {
      expect(SEED_VERSION).toBe('v18');
      expect(MIN_CONTRACT_VERSION).toBe(58);
      const projectId = newId();
      const projectDraft: OpDraft = {
        kind: 'create',
        scope: 'company',
        company_id: company.companyId,
        project_id: null,
        relatorio_id: null,
        path: `project/${projectId}`,
        value: { id: projectId, client_id: null, name: 'Obra v18', site: 'Obra v18', removed_at: null },
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: company.userId,
      };
      const { relatorioId, drafts } = instantiateTemplate(
        standardTemplate({ id: newId() }),
        { id: projectId },
        { service_start: '2026-11-23', service_end: '2026-11-23', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
        { newId, actorId: company.userId, companyId: company.companyId },
      );
      const batchId = newId();
      const at = now();
      const batch: Op[] = [projectDraft, ...drafts].map((draft) => makeOp({ ...draft, batch_id: batchId, device_id: DEVICE }, { newId, now: at }));
      for (const op of batch) {
        written.opIds.add(op.op_id);
        written.entityIds.add((op.value as { id: string }).id);
      }
      const res = await authed('/api/sync/ops', { method: 'POST', body: JSON.stringify({ ops: batch }) });
      expect(res.status, await res.clone().text()).toBe(200);
      expect(syncPushResponseSchema.parse(await res.json()).rejected).toEqual([]);

      const [relatorio] = await db
        .select({ row: entities.row })
        .from(entities)
        .where(and(eq(entities.company_id, company.companyId), eq(entities.entity, 'relatorio'), eq(entities.id, relatorioId)));
      expect(relatorio?.row).toMatchObject({ seed_version: 'v18' });
      const blocks = await db
        .select({ row: entities.row })
        .from(entities)
        .where(and(eq(entities.company_id, company.companyId), eq(entities.entity, 'block'), eq(entities.relatorio_id, relatorioId)));
      const sheets = blocks.map((block) => block.row as { seed_version: string; equipment_id: string | null }).filter((block) => block.equipment_id !== null);
      expect(sheets.length).toBeGreaterThan(0);
      expect(new Set(sheets.map((block) => block.seed_version))).toEqual(new Set(['v18']));

      // The previous contract ships no seed v18: its pull is refused with the update notice's code.
      const old = await authed(`/api/sync/relatorios/${relatorioId}?since=0`, { headers: { [CONTRACT_VERSION_HEADER]: '57' } });
      expect(old.status).toBe(426);
      expect(((await old.json()) as { code: string }).code).toBe('contract_outdated');
      const current = await authed(`/api/sync/relatorios/${relatorioId}?since=0`, { headers: { [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION) } });
      expect(current.status, await current.clone().text()).toBe(200);
      const pulled = syncPullResponseSchema.parse(await current.json()).ops as Op[];
      expect(pulled.find((op) => op.path === `relatorio/${relatorioId}`)?.value).toMatchObject({ seed_version: 'v18' });
    },
    60_000,
  );
});

/*
 * 28.4-API-001 (batch e28a, Story 28.4, contract 58): the v18 keys through the sync route. On a v18 relatório created
 * from the standard template, the transformer's item 18 answered NC, a TP's thermography not done for "Carga
 * insuficiente para avaliação" and a TC marked not tested for "Equipamento da concessionária" with the utility's name are
 * applied as pushed; a version-57 client is refused the stream that holds them (426), the current one reads them.
 */
describe('28.4-API-001 the v18 item and reason keys through the sync route', () => {
  it(
    'item 18, the new thermography reason and the utility reason with its name are applied; a version-57 pull of the relatório is refused with 426',
    async () => {
      const projectId = newId();
      const projectDraft: OpDraft = {
        kind: 'create',
        scope: 'company',
        company_id: company.companyId,
        project_id: null,
        relatorio_id: null,
        path: `project/${projectId}`,
        value: { id: projectId, client_id: null, name: 'Obra v18 listas', site: 'Obra v18 listas', removed_at: null },
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: company.userId,
      };
      const { relatorioId, drafts } = instantiateTemplate(
        standardTemplate({ id: newId() }),
        { id: projectId },
        { service_start: '2026-11-23', service_end: '2026-11-23', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
        { newId, actorId: company.userId, companyId: company.companyId },
      );
      const blockOf = (type: string) => drafts.find((draft) => draft.kind === 'create' && draft.path.startsWith('block/') && (draft.value as { block_type?: string }).block_type === type)!.value as { id: string };
      const transformer = blockOf('transformador_forca');
      const tp = blockOf('tp');
      const tc = blockOf('tc');
      const put = (path: string, value: unknown): OpDraft => ({ ...projectDraft, kind: 'put', scope: 'relatorio', project_id: projectId, relatorio_id: relatorioId, path, value: value as never });
      // The mark's instant is the op's own (a future one is refused `op_attribution`).
      const at = now();
      const mark = { reason: 'equipamento_concessionaria', text: null, at: at.toISOString(), by: company.userId, utility_name: 'Concessionária Exemplo' };
      const writes = [
        put(sheetChecklistPath(transformer.id, 'temperatura_alarme_e_desligamento', 'result'), 'NC'),
        put(sheetTestValuePath(tp.id, 'termografia', 'realizacao'), choiceValue('nao_realizada')),
        put(sheetTestValuePath(tp.id, 'termografia', 'motivo'), choiceValue('carga_insuficiente')),
        put(blockFieldPath(tc.id, 'not_tested'), mark),
      ];
      const batchId = newId();
      const batch: Op[] = [projectDraft, ...drafts, ...writes].map((draft) => makeOp({ ...draft, batch_id: batchId, device_id: DEVICE }, { newId, now: at }));
      for (const op of batch) {
        written.opIds.add(op.op_id);
        if (op.kind === 'create') written.entityIds.add((op.value as { id: string }).id);
      }
      const res = await authed('/api/sync/ops', { method: 'POST', body: JSON.stringify({ ops: batch }) });
      expect(res.status, await res.clone().text()).toBe(200);
      expect(syncPushResponseSchema.parse(await res.json()).rejected).toEqual([]);

      const rowOf = async (id: string) =>
        (await db.select({ row: entities.row }).from(entities).where(and(eq(entities.company_id, company.companyId), eq(entities.entity, 'block'), eq(entities.id, id))))[0]!.row as {
          seed_version: string;
          not_tested: unknown;
          sheet: { checklist: Record<string, { result?: { value: unknown } }>; test: Record<string, { values?: Record<string, { value: unknown }> }> };
        };
      const tr = await rowOf(transformer.id);
      expect(tr.seed_version).toBe('v18');
      expect(tr.sheet.checklist.temperatura_alarme_e_desligamento?.result?.value).toBe('NC');
      expect((await rowOf(tp.id)).sheet.test.termografia?.values?.motivo?.value).toEqual(choiceValue('carga_insuficiente'));
      expect((await rowOf(tc.id)).not_tested).toMatchObject({ reason: 'equipamento_concessionaria', utility_name: 'Concessionária Exemplo' });

      const old = await authed(`/api/sync/relatorios/${relatorioId}?since=0`, { headers: { [CONTRACT_VERSION_HEADER]: '57' } });
      expect(old.status).toBe(426);
      expect(((await old.json()) as { code: string }).code).toBe('contract_outdated');
      const current = await authed(`/api/sync/relatorios/${relatorioId}?since=0`, { headers: { [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION) } });
      expect(current.status, await current.clone().text()).toBe(200);
      const pulled = syncPullResponseSchema.parse(await current.json()).ops as Op[];
      expect(pulled.find((op) => op.path === blockFieldPath(tc.id, 'not_tested'))?.value).toMatchObject({ utility_name: 'Concessionária Exemplo' });
    },
    60_000,
  );
});
