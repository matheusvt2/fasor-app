import {
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  composerView,
  makeOp,
  materializeEntity,
  removeNode,
  setQuantity,
  standardTemplate,
  syncPullResponseSchema,
  syncPushResponseSchema,
  templateRowSchema,
  type Op,
  type OpInput,
  type SyncPushResponse,
} from '@app/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../auth/auth.ts';
import { parseTrustedOrigins } from '../auth/trusted-origins.ts';
import { now } from '../clock.ts';
import { loadConfig } from '../config.ts';
import { createDb } from '../db/client.ts';
import { seedTestCompanies, TEST_SEED } from '../db/seed.ts';
import { entities, ops, syncDevicePush } from '../db/schema.ts';
import { newId } from '../ids.ts';

/**
 * 3.4-API-001 (deferred-work "Story 3.4 must handle concurrent template edits"): two
 * devices of one company edit one template's two last-writer-wins fields apart. Device A
 * removes a coluna (skeleton and blocks); device A2, still on the old row, places a block
 * on that coluna (blocks). Both pushes are accepted, the server row holds an orphan block
 * that parses, and each device's fold of the pulled log is the server's row. Every id is
 * minted per run and removed afterwards.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const company = TEST_SEED.companies[0];
const DEVICE_A = 'tablet-template-a';
const DEVICE_A2 = 'tablet-template-a2';
const COLUNA = 'subsolo-1/coluna-9';

const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const auth = createAuth({
  db,
  secret: config.SESSION_SECRET,
  baseURL: config.AUTH_BASE_URL,
  trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
});

const written = { opIds: new Set<string>(), entityIds: new Set<string>() };
let cookie: string | null = null;

function call(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${apiUrl}${path}`, {
    ...init,
    redirect: 'manual',
    headers: {
      'content-type': 'application/json',
      origin: apiUrl,
      [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

async function signIn(): Promise<string> {
  const res = await call('/api/auth/sign-in/email', {
    method: 'POST',
    body: JSON.stringify({ email: company.email, password: TEST_SEED.password }),
  });
  expect(res.status, await res.text()).toBe(200);
  return res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}

/** Signs in again once on a 401: another api suite may re-seed the user and revoke sessions. */
async function authed(path: string, init: RequestInit = {}): Promise<Response> {
  const attempt = async (fresh: boolean) => {
    if (cookie === null || fresh) cookie = await signIn();
    return call(path, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), cookie } });
  };
  const first = await attempt(false);
  return first.status === 401 ? attempt(true) : first;
}

async function pushOk(batch: Op[]): Promise<SyncPushResponse> {
  for (const op of batch) written.opIds.add(op.op_id);
  const res = await authed('/api/sync/ops', { method: 'POST', body: JSON.stringify({ ops: batch }) });
  expect(res.status, await res.clone().text()).toBe(200);
  return syncPushResponseSchema.parse(await res.json());
}

/** The whole company stream, page by page, as a device pull reads it. */
async function pullAll(): Promise<Op[]> {
  const pulled: Op[] = [];
  let since = 0;
  for (;;) {
    const res = await authed(`/api/sync/company?since=${since}`);
    expect(res.status, await res.clone().text()).toBe(200);
    const page = syncPullResponseSchema.parse(await res.json());
    pulled.push(...(page.ops as Op[]));
    const last = (page.ops as Op[]).at(-1)?.seq;
    if (last === undefined || last >= page.seq) return pulled;
    since = last;
  }
}

function op(device: string, input: Omit<OpInput, 'company_id' | 'actor_id' | 'device_id' | 'scope'>): Op {
  return makeOp(
    {
      company_id: company.companyId,
      actor_id: company.userId,
      device_id: device,
      scope: 'company',
      project_id: null,
      relatorio_id: null,
      batch_id: null,
      meta: null,
      ...input,
    },
    { newId, now: now() },
  );
}

beforeAll(async () => {
  await seedTestCompanies(db, auth);
}, 60_000);

afterAll(async () => {
  const opIds = [...written.opIds];
  const entityIds = [...written.entityIds];
  if (opIds.length > 0) await db.delete(ops).where(inArray(ops.op_id, opIds));
  if (entityIds.length > 0) await db.delete(entities).where(inArray(entities.id, entityIds));
  await db.delete(syncDevicePush).where(inArray(syncDevicePush.device_id, [DEVICE_A, DEVICE_A2]));
  await sql.end();
});

describe('3.4-API-001 concurrent template edits converge', () => {
  it('accepts a coluna removal and a block on that coluna from two devices, and every device folds to the server row', async () => {
    const id = newId();
    written.entityIds.add(id);
    const base = standardTemplate({ id });
    const create = op(DEVICE_A, { kind: 'create', path: `template/${id}`, value: base as never, prev_op_id: null });
    expect((await pushOk([create])).rejected).toEqual([]);

    // Device A removes the coluna: one batch, both fields.
    const removed = removeNode(base, COLUNA);
    const batchA = newId();
    const aSkeleton = op(DEVICE_A, {
      kind: 'put',
      path: `template/${id}/skeleton`,
      value: removed.skeleton as never,
      prev_op_id: null,
      batch_id: batchA,
    });
    const aBlocks = op(DEVICE_A, {
      kind: 'put',
      path: `template/${id}/blocks`,
      value: removed.blocks as never,
      prev_op_id: null,
      batch_id: batchA,
    });
    const first = await pushOk([aSkeleton, aBlocks]);
    expect(first.rejected).toEqual([]);

    // Device A2, still on the old row, places one disjuntor on that coluna. It never wrote
    // `blocks` before, so its op names no previous op on that path (`lastAppliedOpId`).
    const a2Blocks = op(DEVICE_A2, {
      kind: 'put',
      path: `template/${id}/blocks`,
      value: setQuantity(base, COLUNA, 'disjuntor_mt', 1) as never,
      prev_op_id: null,
      batch_id: newId(),
    });
    const second = await pushOk([a2Blocks]);
    expect(second.rejected).toEqual([]);
    expect(second.applied.map((a) => a.op_id)).toEqual([a2Blocks.op_id]);
    // Last writer wins on blocks: the server reports it as superseded, and applies it.
    expect(second.superseded).toEqual([{ op_id: a2Blocks.op_id, over_op_id: aBlocks.op_id }]);

    // The server row: the coluna is gone, the orphan block is there and parses.
    const [stored] = await db
      .select({ row: entities.row })
      .from(entities)
      .where(and(eq(entities.company_id, company.companyId), eq(entities.entity, 'template'), eq(entities.id, id)));
    const server = templateRowSchema.parse(stored!.row);
    expect(server.skeleton.some((n) => n.ref === COLUNA)).toBe(false);
    expect(server.blocks.some((b) => b.skeleton_location_ref === COLUNA)).toBe(true);
    expect(composerView(server).colunaCount).toBe(16);

    // Both devices pull the company stream to its head; every template row it folds parses,
    // and each device's fold is the server's row. Device A2 still holds its own op in the
    // outbox until the pull acks it: the fold is the same either way.
    const pulled = (await pullAll()).filter((o) => o.path === `template/${id}` || o.path.startsWith(`template/${id}/`));
    expect(pulled.map((o) => o.op_id)).toEqual([create.op_id, aSkeleton.op_id, aBlocks.op_id, a2Blocks.op_id]);
    for (let n = 1; n <= pulled.length; n++) {
      const folded = materializeEntity({ entity: 'template', id }, pulled.slice(0, n), []);
      expect(templateRowSchema.safeParse(folded).success).toBe(true);
    }
    const onA = materializeEntity({ entity: 'template', id }, pulled, []);
    const onA2 = materializeEntity({ entity: 'template', id }, pulled, [a2Blocks]);
    expect(onA).toEqual(server);
    expect(onA2).toEqual(server);
  });
});
