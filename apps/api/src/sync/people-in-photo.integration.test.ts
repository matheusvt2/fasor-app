import {
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  MIN_CONTRACT_VERSION,
  fileFieldPath,
  instantiateTemplate,
  makeOp,
  photoFileRowSchema,
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
 * Story 9.3 (contract 8): the photo's "Pessoas na foto" mark travels through the sync route.
 * A photo create carrying `people_in_photo` and a `file/{id}/people_in_photo` put are accepted
 * on push, materialized on the server row and pulled back identical; a version-6 bundle is
 * answered `426` on the pull.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const company = TEST_SEED.companies[0];
const DEVICE = 'tablet-test-people-mark';

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

describe('9.3-API-001 the people mark through the sync route', () => {
  it(
    'pushes a photo create with people_in_photo and a people_in_photo put, and pulls them back identical',
    async () => {
      const projectId = newId();
      const projectDraft: OpDraft = {
        kind: 'create',
        scope: 'company',
        company_id: company.companyId,
        project_id: null,
        relatorio_id: null,
        path: `project/${projectId}`,
        value: { id: projectId, client_id: null, name: 'Obra pessoas', site: 'Obra pessoas', removed_at: null },
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
      const stamp = (draft: OpDraft): Op => makeOp({ ...draft, device_id: DEVICE }, { newId, now: now() });
      const creation = [projectDraft, ...drafts].map(stamp);
      for (const op of creation) written.entityIds.add((op.value as { id: string }).id);
      await pushOk(creation);

      const envelope = { scope: 'relatorio' as const, company_id: company.companyId, project_id: null, relatorio_id: relatorioId, prev_op_id: null, batch_id: null, meta: null, actor_id: company.userId };
      const photoRow = (id: string, people: boolean) => ({
        id,
        company_id: company.companyId,
        relatorio_id: relatorioId,
        kind: 'photo',
        sha256: 'ab'.repeat(32),
        mime: 'image/jpeg',
        size: 10,
        uploaded_at: null,
        variants: null,
        removed_at: null,
        captured_at: '2026-09-28T10:00:00.000Z',
        tz_offset: -180,
        coords: null,
        local_seq: 1,
        block_id: null,
        item_key: null,
        caption: null,
        reading_kind: people ? null : 'caption',
        reading_target: null,
        reading_status: people ? 'none' : 'queued',
        people_in_photo: people,
      });
      const marked = newId();
      const captioned = newId();
      written.entityIds.add(marked);
      written.entityIds.add(captioned);
      const creates = [
        stamp({ ...envelope, kind: 'create', path: `file/${marked}`, value: photoRow(marked, true) as never }),
        stamp({ ...envelope, kind: 'create', path: `file/${captioned}`, value: photoRow(captioned, false) as never }),
      ];
      await pushOk(creates);
      const put = stamp({ ...envelope, kind: 'put', path: fileFieldPath(captioned, 'people_in_photo'), value: true });
      await pushOk([put]);

      const pull = await authed(`/api/sync/relatorios/${relatorioId}?since=0`);
      expect(pull.status, await pull.clone().text()).toBe(200);
      const page = syncPullResponseSchema.parse(await pull.json());
      const pulled = new Map((page.ops as Op[]).map((op) => [op.op_id, op]));
      expect(photoFileRowSchema.parse(pulled.get(creates[0]!.op_id)!.value).people_in_photo).toBe(true);
      expect([pulled.get(put.op_id)!.path, pulled.get(put.op_id)!.value]).toEqual([`file/${captioned}/people_in_photo`, true]);

      for (const id of [marked, captioned]) {
        const [stored] = await db
          .select({ row: entities.row })
          .from(entities)
          .where(and(eq(entities.company_id, company.companyId), eq(entities.entity, 'file'), eq(entities.id, id)));
        expect(photoFileRowSchema.parse(stored!.row).people_in_photo).toBe(true);
      }

      // A version-7 bundle cannot parse the people_in_photo put: its pull is refused (AD-13).
      expect((await authed(`/api/sync/relatorios/${relatorioId}?since=0`, {}, String(MIN_CONTRACT_VERSION - 1))).status).toBe(426);
    },
    60_000,
  );
});
