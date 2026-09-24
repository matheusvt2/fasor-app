import {
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  instantiateTemplate,
  makeOp,
  standardTemplate,
  syncPullResponseSchema,
  syncPushResponseSchema,
  type BlockRow,
  type Op,
  type OpDraft,
  type RelatorioRow,
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
 * Epic 4 review F-1: an op value that is a string which is itself JSON text (`"4"`, the
 * `order_key` a move to the first slot minted; `"2026"`, `"true"`, `"null"` typed into a
 * setup field) must pull back as that same string. drizzle's `jsonb()` column parsed the
 * driver's already-decoded value a second time, so those came back as a number, a
 * boolean or null and the pulling device refused the whole page. `schema.ts` now reads
 * jsonb through a custom type; this suite pins the invariant "what was written comes back
 * identical" for `ops.value` and for `entities.row`.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const company = TEST_SEED.companies[0];
const DEVICE = 'tablet-test-jsonb-round-trip';

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

async function pushOk(batch: Op[]): Promise<void> {
  for (const op of batch) written.opIds.add(op.op_id);
  const res = await authed('/api/sync/ops', { method: 'POST', body: JSON.stringify({ ops: batch }) });
  expect(res.status, await res.clone().text()).toBe(200);
  const pushed = syncPushResponseSchema.parse(await res.json());
  expect(pushed.rejected).toEqual([]);
  expect(pushed.applied).toHaveLength(batch.length);
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

/** The string values that are valid JSON text on their own, plus one that is not. */
const JSON_LOOKING = ['4', '2026', 'true', 'null', 'Sala 12'] as const;

describe('F-1 jsonb round trip', () => {
  it(
    'pulls back a string op value that is itself JSON text as the identical string, and entities.row keeps it too',
    async () => {
      const template = standardTemplate({ id: newId() });
      const projectId = newId();
      const base = {
        company_id: company.companyId,
        project_id: null,
        relatorio_id: null,
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: company.userId,
      } satisfies Omit<OpDraft, 'kind' | 'scope' | 'path' | 'value'>;
      const projectDraft: OpDraft = {
        ...base,
        kind: 'create',
        scope: 'company',
        path: `project/${projectId}`,
        value: { id: projectId, client_id: null, name: 'Obra jsonb', site: 'Obra jsonb', removed_at: null },
      };
      const { relatorioId, drafts } = instantiateTemplate(
        template,
        { id: projectId },
        { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null },
        { newId, actorId: company.userId, companyId: company.companyId },
      );
      const at = now();
      const creation: Op[] = [projectDraft, ...drafts].map((draft) => makeOp({ ...draft, device_id: DEVICE }, { newId, now: at }));
      for (const op of creation) written.entityIds.add((op.value as { id: string }).id);
      await pushOk(creation);

      // A section block (no location) of the new relatório, moved to the first slot: the key
      // `orderKeyBetween(null, 'a0')` used to mint, as a string.
      const section = drafts.find((draft) => draft.path.startsWith('block/') && (draft.value as BlockRow).location_id === null)!;
      const blockId = (section.value as BlockRow).id;
      const put = (path: string, value: string): Op =>
        makeOp({ ...base, kind: 'put', scope: 'relatorio', relatorio_id: relatorioId, path, value, device_id: DEVICE }, { newId, now: now() });
      const puts = [...JSON_LOOKING.map((value) => put('relatorio/setup/local', value)), put(`block/${blockId}/order_key`, '4')];
      await pushOk(puts);

      // The relatório stream: every put comes back with the very string that was pushed.
      const pull = await authed(`/api/sync/relatorios/${relatorioId}?since=0`);
      expect(pull.status, await pull.clone().text()).toBe(200);
      const page = syncPullResponseSchema.parse(await pull.json());
      const pulled = new Map((page.ops as Op[]).map((op) => [op.op_id, op]));
      for (const sent of puts) {
        const got = pulled.get(sent.op_id);
        expect(got, sent.path).toBeDefined();
        expect(typeof got!.value, `${sent.path} = ${JSON.stringify(sent.value)}`).toBe('string');
        expect(got!.value).toBe(sent.value);
      }
      expect(puts.map((op) => pulled.get(op.op_id)!.value)).toEqual([...JSON_LOOKING, '4']);

      // The materialized rows hold the same strings.
      const [block] = await db
        .select({ row: entities.row })
        .from(entities)
        .where(and(eq(entities.company_id, company.companyId), eq(entities.entity, 'block'), eq(entities.id, blockId)));
      expect((block!.row as BlockRow).order_key).toBe('4');
      const [relatorio] = await db
        .select({ row: entities.row })
        .from(entities)
        .where(and(eq(entities.company_id, company.companyId), eq(entities.entity, 'relatorio'), eq(entities.id, relatorioId)));
      expect((relatorio!.row as RelatorioRow).setup.local).toBe('Sala 12');
      // And an object value (the create) is still an object, not a string, on the way back.
      const create = pulled.get(creation.find((op) => op.path === `block/${blockId}`)!.op_id)!;
      expect(typeof create.value).toBe('object');
      expect((create.value as BlockRow).id).toBe(blockId);
    },
    60_000,
  );
});
