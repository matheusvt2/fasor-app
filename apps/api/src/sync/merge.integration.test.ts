import {
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  entityKey,
  getDefinition,
  instantiateTemplate,
  makeOp,
  materializeEntity,
  standardTemplate,
  syncPullResponseSchema,
  syncPushResponseSchema,
  targetsOf,
  type BlockRow,
  type JsonValue,
  type Op,
  type OpDraft,
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
 * Story 10.1 (FR-58), through the sync route: two devices of one company write the same
 * checklist item of one sheet. Whichever pushes first, the server row holds NC with the NC
 * device's op, its observation and its photo; the later push is answered `superseded`
 * (information, never a rejection); and the device fold of the pulled log (remote in `seq`
 * order, `materializeEntity`) is the server row, deep-equal. Ledger 1161: a push holding a
 * multi-op batch with one refused op applies none of that batch and answers each op
 * `op_invalid`, while the other ops of the push apply. The api suite has one user per test
 * company, so both devices sign in as it (authorship is not asserted here; the e2e does).
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const company = TEST_SEED.companies[0];
const NC_DEVICE = 'tablet-merge-nc';
const C_DEVICE = 'tablet-merge-c';

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
  const res = await call('/api/auth/sign-in/email', { method: 'POST', body: JSON.stringify({ email: company.email, password: TEST_SEED.password }) });
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

async function push(batch: readonly Op[]): Promise<SyncPushResponse> {
  for (const op of batch) {
    written.opIds.add(op.op_id);
    const segments = op.path.split('/');
    if (op.kind === 'create') written.entityIds.add(segments.at(-1)!);
  }
  const res = await authed('/api/sync/ops', { method: 'POST', body: JSON.stringify({ ops: batch }) });
  expect(res.status, await res.clone().text()).toBe(200);
  return syncPushResponseSchema.parse(await res.json());
}

/** The relatório stream, page by page, as a device pull reads it. */
async function pullRelatorio(relatorioId: string): Promise<Op[]> {
  const pulled: Op[] = [];
  let since = 0;
  for (;;) {
    const res = await authed(`/api/sync/relatorios/${relatorioId}?since=${since}`);
    expect(res.status, await res.clone().text()).toBe(200);
    const page = syncPullResponseSchema.parse(await res.json());
    pulled.push(...(page.ops as Op[]));
    const last = (page.ops as Op[]).at(-1)?.seq;
    if (last === undefined || last >= page.seq) return pulled;
    since = last;
  }
}

async function serverBlock(blockId: string): Promise<BlockRow> {
  const [row] = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, company.companyId), eq(entities.entity, 'block'), eq(entities.id, blockId)));
  return row!.row as BlockRow;
}

const onBlock = (blockId: string) => (op: Op) => targetsOf(op).some((ref) => ref.key === entityKey('block', blockId));

let relatorioId = '';
let blocks: { id: string; tag: string }[] = [];
const item = getDefinition(standardTemplate({ id: newId() }).seed_version, 'cabine_primaria', 'chave_seccionadora').checklist![9]!.key;

function deviceOp(device: string, draft: Omit<OpDraft, 'company_id' | 'actor_id' | 'scope' | 'project_id' | 'relatorio_id' | 'meta' | 'batch_id'> & Partial<OpDraft>): Op {
  return makeOp(
    {
      scope: 'relatorio',
      company_id: company.companyId,
      project_id: null,
      relatorio_id: relatorioId,
      batch_id: null,
      meta: null,
      actor_id: company.userId,
      ...draft,
      device_id: device,
    },
    { newId, now: now() },
  );
}

function photoCreate(blockId: string, batchId: string): Op {
  const id = newId();
  const value = {
    id,
    company_id: company.companyId,
    relatorio_id: relatorioId,
    kind: 'photo',
    sha256: 'a'.repeat(64),
    mime: 'image/jpeg',
    size: 10,
    uploaded_at: null,
    variants: null,
    removed_at: null,
    captured_at: now().toISOString(),
    tz_offset: -180,
    coords: null,
    local_seq: 1,
    block_id: blockId,
    item_key: item,
    caption: null,
    reading_kind: null,
    reading_target: null,
    reading_status: 'none',
    people_in_photo: false,
  } satisfies Record<string, JsonValue>;
  return deviceOp(NC_DEVICE, { kind: 'create', path: `file/${id}`, value, prev_op_id: null, batch_id: batchId });
}

/** The NC device's batch on one item: NC, its observation and a photo on the item. */
function ncBatch(blockId: string): Op[] {
  const batch = newId();
  return [
    deviceOp(NC_DEVICE, { kind: 'put', path: `sheet/${blockId}/checklist/${item}/result`, value: 'NC', prev_op_id: null, batch_id: batch }),
    deviceOp(NC_DEVICE, { kind: 'put', path: `sheet/${blockId}/checklist/${item}/observation`, value: 'Fusível com sinais de aquecimento', prev_op_id: null, batch_id: batch }),
    photoCreate(blockId, batch),
  ];
}

/** The C device's writes on the same item, not having seen the NC device's (no `prev_op_id`). */
function cOps(blockId: string): Op[] {
  return [
    deviceOp(C_DEVICE, { kind: 'put', path: `sheet/${blockId}/checklist/${item}/result`, value: 'C', prev_op_id: null }),
    deviceOp(C_DEVICE, { kind: 'put', path: `sheet/${blockId}/checklist/${item}/observation`, value: 'Sem anomalias', prev_op_id: null }),
  ];
}

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  const projectId = newId();
  const project = deviceOp('office-merge', {
    kind: 'create',
    scope: 'company',
    relatorio_id: null,
    path: `project/${projectId}`,
    value: { id: projectId, client_id: null, name: 'Obra da mesclagem', site: null, removed_at: null },
    prev_op_id: null,
  });
  const built = instantiateTemplate(
    standardTemplate({ id: newId() }),
    { id: projectId },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null },
    { newId, actorId: company.userId, companyId: company.companyId },
  );
  relatorioId = built.relatorioId;
  const created = built.drafts.map((draft) => makeOp({ ...draft, device_id: 'office-merge' }, { newId, now: now() }));
  const response = await push([project, ...created]);
  expect(response.rejected).toEqual([]);
  const values = created.filter((op) => op.kind === 'create').map((op) => op.value as Record<string, unknown>);
  const tags = new Map(values.filter((row) => typeof row.tag === 'string').map((row) => [row.id as string, row.tag as string]));
  blocks = values
    .filter((row) => row.block_type === 'chave_seccionadora' && typeof row.equipment_id === 'string')
    .map((row) => ({ id: row.id as string, tag: tags.get(row.equipment_id as string) ?? '' }));
  expect(blocks.length).toBeGreaterThanOrEqual(3);
}, 120_000);

afterAll(async () => {
  const opIds = [...written.opIds];
  const entityIds = [...written.entityIds, relatorioId];
  if (opIds.length > 0) await db.delete(ops).where(inArray(ops.op_id, opIds));
  if (entityIds.length > 0) await db.delete(entities).where(and(eq(entities.company_id, company.companyId), inArray(entities.id, entityIds)));
  await db.delete(syncDevicePush).where(inArray(syncDevicePush.device_id, [NC_DEVICE, C_DEVICE, 'office-merge']));
  await sql.end();
});

describe('10.1-API-001 NC vs C on one item from two devices, through the sync route', () => {
  for (const order of ['NC first', 'C first'] as const) {
    it(`${order}: NC stands with the NC device's op, observation and photo; the later push is superseded; the device fold equals the server row`, async () => {
      const block = blocks[order === 'NC first' ? 0 : 1]!;
      const nc = ncBatch(block.id);
      const c = cOps(block.id);
      const [firstPush, secondPush] = order === 'NC first' ? [nc, c] : [c, nc];

      const first = await push(firstPush);
      expect(first.rejected).toEqual([]);
      expect(first.superseded).toEqual([]);
      // The device that pushes second rebased its pending ops on nothing: its fold of the
      // pulled log plus its own ops on top is what the server computes once it pushes.
      const beforeSecond = (await pullRelatorio(relatorioId)).filter(onBlock(block.id));
      const deviceView = materializeEntity({ entity: 'block', id: block.id }, beforeSecond, secondPush);

      const second = await push(secondPush);
      expect(second.rejected).toEqual([]);
      // Two sheet puts landed on ops they did not see: information, never a rejection.
      const sheetOps = secondPush.filter((op) => op.path.startsWith('sheet/'));
      expect(second.superseded.map((s) => s.op_id).sort()).toEqual(sheetOps.map((op) => op.op_id).sort());

      const server = await serverBlock(block.id);
      const cell = server.sheet.checklist[item]!;
      expect(cell.result).toMatchObject({ value: 'NC', op_id: nc[0]!.op_id });
      expect(cell.observation).toMatchObject({ value: 'Fusível com sinais de aquecimento', op_id: nc[1]!.op_id });
      expect(cell.result?.merge?.rule).toBe('nc_over_c');
      expect(cell.observation?.merge?.rule).toBe('nc_observation');
      const [photo] = await db.select({ row: entities.row }).from(entities).where(and(eq(entities.company_id, company.companyId), eq(entities.id, nc[2]!.path.split('/')[1]!)));
      expect(photo?.row).toMatchObject({ block_id: block.id, item_key: item, removed_at: null });

      // Replay: every device folds the pulled log to the server row.
      const pulled = (await pullRelatorio(relatorioId)).filter(onBlock(block.id));
      expect(materializeEntity({ entity: 'block', id: block.id }, pulled, [])).toEqual(server);
      expect(deviceView).toEqual(server);
    });
  }

  it('the device that lost taps C again after seeing NC: C applies and the merge record goes', async () => {
    const block = blocks[0]!;
    const head = (await serverBlock(block.id)).sheet.checklist[item]!.result!.merge!.head_op_id;
    const again = deviceOp(C_DEVICE, { kind: 'put', path: `sheet/${block.id}/checklist/${item}/result`, value: 'C', prev_op_id: head });
    const response = await push([again]);
    expect(response.superseded).toEqual([]);
    expect((await serverBlock(block.id)).sheet.checklist[item]!.result).toEqual({ value: 'C', source_suggestion_id: null, op_id: again.op_id });
  });
});

describe('10.1-API-002 ledger 1161: a client batch is atomic in a push', () => {
  it('a refused op rolls back its whole batch, each op op_invalid, while the other ops of the push apply', async () => {
    const block = blocks[2]!;
    const batch = newId();
    const good = deviceOp(NC_DEVICE, { kind: 'put', path: `sheet/${block.id}/observations`, value: 'Aplicada com o lote', prev_op_id: null, batch_id: batch });
    // A checklist item the chave's definition does not have: `applyOp` refuses it (SeedPathError).
    const refused = deviceOp(NC_DEVICE, { kind: 'put', path: `sheet/${block.id}/checklist/nao_existe/result`, value: 'C', prev_op_id: null, batch_id: batch });
    const alone = deviceOp(NC_DEVICE, { kind: 'put', path: `sheet/${block.id}/conclusion/text`, value: 'Fora do lote', prev_op_id: null });
    const otherBatch = newId();
    const otherA = deviceOp(NC_DEVICE, { kind: 'put', path: `sheet/${block.id}/conclusion/result`, value: 'aprovado', prev_op_id: null, batch_id: otherBatch });
    const otherB = deviceOp(NC_DEVICE, { kind: 'put', path: `sheet/${block.id}/conclusion/restriction`, value: 'sem_restricoes', prev_op_id: null, batch_id: otherBatch });

    const response = await push([good, alone, refused, otherA, otherB]);
    expect(response.rejected).toEqual([
      { op_id: good.op_id, code: 'op_invalid' },
      { op_id: refused.op_id, code: 'op_invalid' },
    ]);
    expect(response.applied.map((a) => a.op_id)).toEqual([alone.op_id, otherA.op_id, otherB.op_id]);
    const logged = await db.select({ op_id: ops.op_id }).from(ops).where(inArray(ops.op_id, [good.op_id, refused.op_id]));
    expect(logged).toEqual([]);
    const server = await serverBlock(block.id);
    expect(server.sheet.observations).toBeNull();
    expect(server.sheet.conclusion.text?.value).toBe('Fora do lote');
    expect(server.sheet.conclusion.result?.value).toBe('aprovado');
    expect(server.sheet.conclusion.restriction?.value).toBe('sem_restricoes');
  });
});
