import {
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  EMPTY_DEFINITION_CONTEXT,
  errorResponseSchema,
  instantiateTemplate,
  makeOp,
  standardTemplate,
  syncPullResponseSchema,
  syncPushResponseSchema,
  type EquipmentRow,
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
 * Story 24.21 (batch e24b, contract 42), 24.21-API-001: the equipment's `reuse_key` travels in its
 * create through `POST /api/sync/ops`, the server stores it with the row, and a second device that
 * pulls the project stream folds the same key; nothing can put it afterwards (no path parses
 * `equipment/{id}/reuse_key`), a rename keeps it, a client on contract 41 is refused at pull, and
 * another company neither reads the obra nor writes into it.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const companyB = TEST_SEED.companies[1];
const DEVICE_A = 'tablet-reuse-key-a';
type Company = (typeof TEST_SEED.companies)[number];

const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const auth = createAuth({
  db,
  secret: config.SESSION_SECRET,
  baseURL: config.AUTH_BASE_URL,
  trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
});

const written = { opIds: new Set<string>(), entityIds: new Set<string>() };
const cookies = new Map<string, string>();

async function signIn(company: Company): Promise<string> {
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

/** An authenticated call that signs in again once on a 401 (another suite may re-seed the users). */
async function authed(company: Company, path: string, init: RequestInit = {}, contract = String(CONTRACT_VERSION)): Promise<Response> {
  const attempt = async (fresh: boolean) => {
    if (fresh || !cookies.has(company.email)) cookies.set(company.email, await signIn(company));
    return fetch(`${apiUrl}${path}`, {
      ...init,
      redirect: 'manual',
      headers: { 'content-type': 'application/json', origin: apiUrl, [CONTRACT_VERSION_HEADER]: contract, cookie: cookies.get(company.email)!, ...(init.headers as Record<string, string> | undefined) },
    });
  };
  const first = await attempt(false);
  return first.status === 401 ? attempt(true) : first;
}

function stamp(draft: OpDraft, device: string): Op {
  const op = makeOp({ ...draft, device_id: device }, { newId, now: now() });
  written.opIds.add(op.op_id);
  return op;
}

async function push(company: Company, batch: Op[]) {
  const res = await authed(company, '/api/sync/ops', { method: 'POST', body: JSON.stringify({ ops: batch }) });
  expect(res.status, await res.clone().text()).toBe(200);
  return syncPushResponseSchema.parse(await res.json());
}

async function storedEquipment(companyId: string, id: string): Promise<EquipmentRow | undefined> {
  const [found] = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'equipment'), eq(entities.id, id)));
  return found?.row as EquipmentRow | undefined;
}

const envelope = (company: Company, scope: 'company' | 'project', projectId: string | null) => ({
  scope,
  company_id: company.companyId,
  project_id: projectId,
  relatorio_id: null,
  prev_op_id: null,
  batch_id: null,
  meta: null,
  actor_id: company.userId,
});

beforeAll(async () => {
  await seedTestCompanies(db, auth);
}, 60_000);

afterAll(async () => {
  const opIds = [...written.opIds];
  const entityIds = [...written.entityIds];
  if (opIds.length > 0) await db.delete(ops).where(inArray(ops.op_id, opIds));
  if (entityIds.length > 0) await db.delete(entities).where(inArray(entities.id, entityIds));
  await sql.end();
});

describe('24.21-API-001 the equipment reuse key through the sync route', () => {
  it(
    'a create carries the key, a second device reads it back, a rename keeps it, a put to the key is refused, contract 41 is refused, and another company reaches nothing',
    async () => {
      const projectId = newId();
      written.entityIds.add(projectId);
      const projectDraft: OpDraft = {
        ...envelope(companyA, 'company', null),
        kind: 'create',
        path: `project/${projectId}`,
        value: { id: projectId, client_id: null, name: 'Obra da chave', site: 'Obra da chave', removed_at: null },
      };
      const { drafts } = instantiateTemplate(
        standardTemplate({ id: newId() }),
        { id: projectId },
        { service_start: '2026-11-10', service_end: '2026-11-10', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
        { newId, actorId: companyA.userId, companyId: companyA.companyId },
      );
      const batchId = newId();
      const batch = [projectDraft, ...drafts].map((draft) => stamp({ ...draft, batch_id: batchId }, DEVICE_A));
      for (const op of batch) written.entityIds.add((op.value as { id: string }).id);
      const pushed = await push(companyA, batch);
      expect(pushed.rejected).toEqual([]);

      const created = drafts.filter((draft) => draft.path.startsWith('equipment/')).map((draft) => draft.value as unknown as EquipmentRow);
      const breaker = created.find((row) => row.reuse_key === 'DJ-C05')!;
      expect(breaker.tag).toMatch(/^DJ-\d{2}$/);
      expect(await storedEquipment(companyA.companyId, breaker.id)).toMatchObject({ id: breaker.id, tag: breaker.tag, reuse_key: 'DJ-C05' });

      // A rename writes the TAG only.
      const rename = stamp({ ...envelope(companyA, 'project', projectId), kind: 'put', path: `equipment/${breaker.id}/tag`, value: '52-1' }, DEVICE_A);
      expect((await push(companyA, [rename])).rejected).toEqual([]);
      // No path writes the key: the put is refused per op and the row keeps its key.
      // `makeOp` refuses the path on the device already, so the op is forged from a valid one, as an old or hostile client would send it.
      const keyPut: Op = { ...stamp({ ...envelope(companyA, 'project', projectId), kind: 'put', path: `equipment/${breaker.id}/tag`, value: 'DJ-C09' }, DEVICE_A), path: `equipment/${breaker.id}/reuse_key` };
      expect((await push(companyA, [keyPut])).rejected).toEqual([{ op_id: keyPut.op_id, code: 'op_path_unknown' }]);
      expect(await storedEquipment(companyA.companyId, breaker.id)).toMatchObject({ tag: '52-1', reuse_key: 'DJ-C05' });

      // A second device pulls the project stream and reads the same key in the create.
      const res = await authed(companyA, `/api/sync/projects/${projectId}?since=0`);
      expect(res.status, await res.clone().text()).toBe(200);
      const page = syncPullResponseSchema.parse(await res.json());
      const pulledCreate = (page.ops as Op[]).find((op) => op.path === `equipment/${breaker.id}` && op.kind === 'create')!;
      expect((pulledCreate.value as unknown as EquipmentRow).reuse_key).toBe('DJ-C05');
      expect((page.ops as Op[]).some((op) => op.path.endsWith('/reuse_key'))).toBe(false);
      const keys = (page.ops as Op[]).filter((op) => op.kind === 'create' && op.path.startsWith('equipment/')).map((op) => (op.value as unknown as EquipmentRow).reuse_key);
      expect(new Set(keys).size).toBe(created.length);

      // A client on contract 41 is refused at pull and told to update.
      const old = await authed(companyA, `/api/sync/projects/${projectId}?since=0`, {}, '41');
      expect(old.status).toBe(426);
      expect(errorResponseSchema.parse(await old.json()).code).toBe('contract_outdated');

      // Another company neither reads the obra nor writes its key or its TAG.
      const foreignPull = await authed(companyB, `/api/sync/projects/${projectId}?since=0`);
      expect(foreignPull.status).toBe(404);
      const forged = stamp({ ...envelope(companyB, 'project', projectId), company_id: companyA.companyId, kind: 'put', path: `equipment/${breaker.id}/tag`, value: 'INTRUSO' }, 'tablet-reuse-key-b');
      expect((await push(companyB, [forged])).rejected).toEqual([{ op_id: forged.op_id, code: 'op_tenant_mismatch' }]);
      expect(await storedEquipment(companyA.companyId, breaker.id)).toMatchObject({ tag: '52-1', reuse_key: 'DJ-C05' });
      expect(await storedEquipment(companyB.companyId, breaker.id)).toBeUndefined();
    },
    60_000,
  );
});
