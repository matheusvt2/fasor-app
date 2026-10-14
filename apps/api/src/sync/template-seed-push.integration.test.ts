import {
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  duplicateTemplate,
  makeOp,
  SEED_VERSION,
  standardTemplate,
  syncPullResponseSchema,
  syncPushResponseSchema,
  SYSTEM_IDENTITY_ACTOR,
  type Op,
  type OpInput,
  type SyncPushResponse,
  type TemplateRow,
} from '@app/domain';
import { and, desc, eq, inArray, like, or } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { now } from '../clock.ts';
import { loadConfig } from '../config.ts';
import { createDb } from '../db/client.ts';
import { asCompanyId } from '../db/repositories/company-id.ts';
import { entities, ops, syncDevicePush } from '../db/schema.ts';
import { TEST_SEED } from '../db/seed.ts';
import { newId } from '../ids.ts';
import { applyOps } from './apply.ts';
import { templateSeedDecision } from './template-seed-step.ts';

/*
 * Epic 14 QA Q-7: a template a device pushes on an older seed version after the api's boot
 * pass reaches the current one in the push's own transaction, through POST /api/sync/ops over
 * the compose api with a seeded user: the server appends `template/{id}/seed_version` (actor
 * `system:identity`, a batch of its own), the template's `version` stays, and the company pull
 * carries the move. A create on v3, a duplicate on v4, an edited one and a restored old one
 * move; a removed one does not. Every id is minted per run; the rows written are removed after.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const company = TEST_SEED.companies[0];
const DEVICE = 'tablet-test-template-seed';

const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);

const templateIds = new Set<string>();

function call(path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    origin: apiUrl,
    [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION),
    ...(init.headers as Record<string, string> | undefined),
  };
  return fetch(`${apiUrl}${path}`, { ...init, redirect: 'manual', headers });
}

let cookie: string | null = null;
async function signIn(): Promise<string> {
  const res = await call('/api/auth/sign-in/email', { method: 'POST', body: JSON.stringify({ email: company.email, password: TEST_SEED.password }) });
  expect(res.status, await res.text()).toBe(200);
  return res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}

/** An authenticated call that signs in again once on a 401 (another suite may re-seed the users). */
async function authed(path: string, init: RequestInit = {}): Promise<Response> {
  const attempt = async (fresh: boolean) => {
    if (cookie === null || fresh) cookie = await signIn();
    return call(path, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), cookie } });
  };
  const first = await attempt(false);
  return first.status === 401 ? attempt(true) : first;
}

async function push(batch: Op[]): Promise<SyncPushResponse> {
  const res = await authed('/api/sync/ops', { method: 'POST', body: JSON.stringify({ ops: batch }) });
  expect(res.status, await res.clone().text()).toBe(200);
  return syncPushResponseSchema.parse(await res.json());
}

function op(input: Omit<OpInput, 'company_id' | 'actor_id' | 'device_id' | 'project_id' | 'relatorio_id' | 'prev_op_id' | 'batch_id' | 'meta' | 'scope'>): Op {
  return makeOp(
    { company_id: company.companyId, actor_id: company.userId, device_id: DEVICE, scope: 'company', project_id: null, relatorio_id: null, prev_op_id: null, batch_id: null, meta: null, ...input },
    { newId, now: now() },
  );
}

const create = (row: TemplateRow): Op => {
  templateIds.add(row.id);
  return op({ kind: 'create', path: `template/${row.id}`, value: row as unknown as Op['value'] });
};

async function stored(id: string): Promise<{ row: TemplateRow; removed_at: string | null }> {
  const [row] = await db
    .select({ row: entities.row, removed_at: entities.removed_at })
    .from(entities)
    .where(and(eq(entities.company_id, company.companyId), eq(entities.entity, 'template'), eq(entities.id, id)));
  return row as { row: TemplateRow; removed_at: string | null };
}

async function moves(id: string) {
  return db
    .select({ seq: ops.seq, value: ops.value, actor_id: ops.actor_id, device_id: ops.device_id, batch_id: ops.batch_id })
    .from(ops)
    .where(and(eq(ops.company_id, company.companyId), eq(ops.path, `template/${id}/seed_version`)))
    .orderBy(ops.seq);
}

async function latestSeq(): Promise<number> {
  const [row] = await db.select({ seq: ops.seq }).from(ops).where(eq(ops.company_id, company.companyId)).orderBy(desc(ops.seq)).limit(1);
  return row?.seq ?? 0;
}

afterAll(async () => {
  const ids = [...templateIds];
  if (ids.length > 0) {
    await db.delete(ops).where(and(eq(ops.company_id, company.companyId), or(...ids.map((id) => like(ops.path, `template/${id}%`)))));
    await db.delete(entities).where(and(eq(entities.company_id, company.companyId), inArray(entities.id, ids)));
  }
  await db.delete(syncDevicePush).where(eq(syncDevicePush.device_id, DEVICE));
  await sql.end();
});

describe('Epic 14 QA Q-7: a template pushed on an older seed version reaches the current one in the push', () => {
  it('a create on v3 and a duplicate on v4 land on SEED_VERSION with their version kept; the move is a system:identity op of its own batch, and the company pull carries it', async () => {
    const since = await latestSeq();
    const v3 = standardTemplate({ id: newId(), seedVersion: 'v3' });
    const pushed = await push([create(v3)]);
    expect(pushed.rejected).toEqual([]);
    // The push answers the device's own op only.
    expect(pushed.applied.map((entry) => entry.op_id)).toHaveLength(1);
    expect((await stored(v3.id)).row).toMatchObject({ seed_version: SEED_VERSION, version: v3.version, name: v3.name });

    // A device holding a v4 row duplicates it after the boot ("Duplicar" copies `seed_version`).
    const v4 = { ...duplicateTemplate(standardTemplate({ id: newId(), seedVersion: 'v4' }), newId(), [v3.name]), seed_version: 'v4' };
    await push([create(v4)]);
    expect((await stored(v4.id)).row).toMatchObject({ seed_version: SEED_VERSION, version: 1 });

    for (const id of [v3.id, v4.id]) {
      const written = await moves(id);
      expect(written).toHaveLength(1);
      expect(written[0]).toMatchObject({ value: SEED_VERSION, actor_id: SYSTEM_IDENTITY_ACTOR, device_id: 'server' });
      expect(written[0]!.batch_id).not.toBeNull();
    }
    expect((await moves(v3.id))[0]!.batch_id).not.toBe((await moves(v4.id))[0]!.batch_id);

    // The pull carries the moves after the creates.
    const res = await authed(`/api/sync/company?since=${since}`);
    expect(res.status).toBe(200);
    const page = syncPullResponseSchema.parse(await res.json());
    const paths = (page.ops as { path: string; value: unknown }[]).filter((entry) => entry.path.startsWith(`template/${v3.id}`) || entry.path.startsWith(`template/${v4.id}`)).map((entry) => [entry.path, entry.value]);
    expect(paths).toEqual([
      [`template/${v3.id}`, expect.objectContaining({ seed_version: 'v3' })],
      [`template/${v3.id}/seed_version`, SEED_VERSION],
      [`template/${v4.id}`, expect.objectContaining({ seed_version: 'v4' })],
      [`template/${v4.id}/seed_version`, SEED_VERSION],
    ]);
  });

  it('an old template edited in the push keeps its new version; one restored is moved too; one removed in the push stays where it was', async () => {
    const edited = standardTemplate({ id: newId(), seedVersion: 'v2' });
    await push([create(edited), op({ kind: 'put', path: `template/${edited.id}/blocks`, value: edited.blocks.slice(0, -1) as unknown as Op['value'] })]);
    const after = (await stored(edited.id)).row;
    expect(after).toMatchObject({ seed_version: SEED_VERSION });
    expect(after.version).toBeGreaterThan(1);

    // Removed in the same push: not moved.
    const removed = standardTemplate({ id: newId(), seedVersion: 'v3' });
    await push([create(removed), op({ kind: 'remove', path: `template/${removed.id}/removed_at`, value: null })]);
    expect(await stored(removed.id)).toMatchObject({ row: expect.objectContaining({ seed_version: 'v3' }), removed_at: expect.any(String) });
    expect(await moves(removed.id)).toEqual([]);

    // Restored later (`removed_at` back to null): moved in the restore's push.
    await push([op({ kind: 'put', path: `template/${removed.id}/removed_at`, value: null })]);
    expect(await stored(removed.id)).toMatchObject({ row: expect.objectContaining({ seed_version: SEED_VERSION }), removed_at: null });
    expect(await moves(removed.id)).toHaveLength(1);

    // A second push on a current template writes no move.
    await push([op({ kind: 'put', path: `template/${removed.id}/name`, value: 'Renomeado' })]);
    expect(await moves(removed.id)).toHaveLength(1);
  });

  it('a server emitter (origin server) is left as it is: the boot pass and the seed own those rows', async () => {
    const v1 = standardTemplate({ id: newId(), seedVersion: 'v1' });
    templateIds.add(v1.id);
    const envelope = { scope: 'company', company_id: company.companyId, project_id: null, relatorio_id: null, prev_op_id: null, batch_id: null, meta: null, actor_id: SYSTEM_IDENTITY_ACTOR, device_id: 'server' };
    const result = await applyOps(db, asCompanyId(company.companyId), [{ ...envelope, op_id: newId(), client_ts: new Date().toISOString(), kind: 'create', path: `template/${v1.id}`, value: v1 }], {
      now: () => new Date(),
      origin: 'server',
    });
    expect(result.rejected).toEqual([]);
    expect((await stored(v1.id)).row).toMatchObject({ seed_version: 'v1' });
  });

  it('the decision: a removed row, a current one and nothing stored are left; a row that would not validate on the current version is skipped', () => {
    const v3 = standardTemplate({ id: newId(), seedVersion: 'v3' });
    expect(templateSeedDecision(v3, null)).toEqual({ kind: 'move', from: 'v3', target: SEED_VERSION });
    expect(templateSeedDecision(v3, '2026-10-01T00:00:00.000Z')).toEqual({ kind: 'none' });
    expect(templateSeedDecision(standardTemplate({ id: newId() }), null)).toEqual({ kind: 'none' });
    expect(templateSeedDecision(undefined, null)).toEqual({ kind: 'none' });
    // A coluna whose parent is not in the skeleton: no op could write it, the step never moves it.
    const broken = { ...v3, skeleton: [...v3.skeleton, { ref: 'solta', kind: 'coluna', parent_ref: 'ausente', name: 'Coluna solta' }] };
    expect(templateSeedDecision(broken, null)).toEqual({ kind: 'invalid', from: 'v3' });
  });
});
