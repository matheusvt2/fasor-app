import {
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  createPointOp,
  instantiateTemplate,
  makeOp,
  newPointRow,
  photoToken,
  pointRowSchema,
  putPointOp,
  standardTemplate,
  syncPullResponseSchema,
  syncPushResponseSchema,
  type Op,
  type OpDraft,
  type PointRow,
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
 * Story 6.6 (E5-A6): the point row's new fields travel through the sync route. A `point`
 * create carrying `action`, then `point/{id}/action`, `priority`, `deadline` and `owner`
 * puts (contract version 4), are accepted on push, materialized on the server row and
 * pulled back identical; a version-3 bundle is answered `426` on the pull.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const company = TEST_SEED.companies[0];
const DEVICE = 'tablet-test-points';

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

async function authed(path: string, init: RequestInit = {}, version = String(CONTRACT_VERSION)): Promise<Response> {
  const call = () =>
    fetch(`${apiUrl}${path}`, {
      ...init,
      redirect: 'manual',
      headers: { 'content-type': 'application/json', origin: apiUrl, [CONTRACT_VERSION_HEADER]: version, cookie, ...(init.headers as Record<string, string> | undefined) },
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

describe('6.6-API-001 point fields through the sync route', () => {
  it(
    'pushes a point create with its action and the action, priority, deadline and owner puts, and pulls them back identical',
    async () => {
      const author = { id: company.userId, companyId: company.companyId };
      const projectId = newId();
      const projectDraft: OpDraft = {
        kind: 'create',
        scope: 'company',
        company_id: company.companyId,
        project_id: null,
        relatorio_id: null,
        path: `project/${projectId}`,
        value: { id: projectId, client_id: null, name: 'Obra pontos', site: 'Obra pontos', removed_at: null },
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: company.userId,
      };
      const { relatorioId, drafts } = instantiateTemplate(
        standardTemplate({ id: newId() }),
        { id: projectId },
        { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null },
        { newId, actorId: company.userId, companyId: company.companyId },
      );
      const at = now();
      const creation = [projectDraft, ...drafts].map((draft) => makeOp({ ...draft, device_id: DEVICE }, { newId, now: at }));
      for (const op of creation) written.entityIds.add((op.value as { id: string }).id);
      await pushOk(creation);

      const photoId = newId();
      const row: PointRow = newPointRow(
        { id: newId(), relatorioId, text: `Fusível com aquecimento ${photoToken(photoId)}`, equipmentId: null, origin: 'manual', action: 'Substituir o fusível' },
        [],
      );
      written.entityIds.add(row.id);
      const stamp = (draft: OpDraft): Op => makeOp({ ...draft, device_id: DEVICE }, { newId, now: now() });
      const create = stamp(createPointOp(author, row));
      await pushOk([create]);
      const puts = [
        stamp(putPointOp(author, relatorioId, row.id, 'action', 'Substituir o fusível da fase B')),
        stamp(putPointOp(author, relatorioId, row.id, 'priority', 'P1')),
        stamp(putPointOp(author, relatorioId, row.id, 'deadline', '2026-10-08')),
        stamp(putPointOp(author, relatorioId, row.id, 'owner', 'Manutenção predial')),
      ];
      await pushOk(puts);

      // The relatório stream carries every op back as it was pushed.
      const pull = await authed(`/api/sync/relatorios/${relatorioId}?since=0`);
      expect(pull.status, await pull.clone().text()).toBe(200);
      const page = syncPullResponseSchema.parse(await pull.json());
      const pulled = new Map((page.ops as Op[]).map((op) => [op.op_id, op]));
      expect(pointRowSchema.parse(pulled.get(create.op_id)!.value)).toEqual(row);
      expect(puts.map((op) => [pulled.get(op.op_id)!.path, pulled.get(op.op_id)!.value])).toEqual([
        [`point/${row.id}/action`, 'Substituir o fusível da fase B'],
        [`point/${row.id}/priority`, 'P1'],
        [`point/${row.id}/deadline`, '2026-10-08'],
        [`point/${row.id}/owner`, 'Manutenção predial'],
      ]);

      // The materialized server row holds the new fields, the token kept as written.
      const [stored] = await db
        .select({ row: entities.row })
        .from(entities)
        .where(and(eq(entities.company_id, company.companyId), eq(entities.entity, 'point'), eq(entities.id, row.id)));
      expect(pointRowSchema.parse(stored!.row)).toEqual({
        ...row,
        action: 'Substituir o fusível da fase B',
        priority: 'P1',
        deadline: '2026-10-08',
        owner: 'Manutenção predial',
      });

      // A priority outside P0 to P4 is refused per op and the row keeps P1.
      const bad = stamp(putPointOp(author, relatorioId, row.id, 'priority', 'P9'));
      written.opIds.add(bad.op_id);
      const refused = syncPushResponseSchema.parse(await (await authed('/api/sync/ops', { method: 'POST', body: JSON.stringify({ ops: [bad] }) })).json());
      expect(refused.applied).toEqual([]);
      expect(refused.rejected).toHaveLength(1);
      const [kept] = await db
        .select({ row: entities.row })
        .from(entities)
        .where(and(eq(entities.company_id, company.companyId), eq(entities.entity, 'point'), eq(entities.id, row.id)));
      expect((kept!.row as PointRow).priority).toBe('P1');

      // A version-3 bundle cannot parse these puts: its pull is refused (AD-13).
      expect((await authed(`/api/sync/relatorios/${relatorioId}?since=0`, {}, '3')).status).toBe(426);
    },
    60_000,
  );
});
