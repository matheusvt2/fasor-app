import {
  canonicalJson,
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  entityKey,
  getDefinition,
  instantiateTemplate,
  keepBothTag,
  makeOp,
  materializeEntity,
  newEquipmentBlock,
  openDecisions,
  standardTemplate,
  syncPullResponseSchema,
  syncPushResponseSchema,
  targetsOf,
  type BlockRow,
  type EquipmentRow,
  type JsonValue,
  type Op,
  type OpDraft,
  type OpFacts,
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
 * Stories 10.2 and 10.3 (FR-59), through the sync route: the fold marks a true contradiction
 * on the cell (`cell.conflict`) and a block removed on one device and edited on the other
 * (`block.removal_conflict`) on the server exactly as the device fold of the pulled log does;
 * each resolution is a plain client op that clears its mark ("Aplicar", "Manter",
 * "Remover"); a TAG created on two devices is listed by the kernel and "Manter as duas"
 * suffixes the later one. The ledger case of Story 10.1 (the losing device writes again
 * before its pull) stays merged by rule thanks to the standing stamp. The api suite has one
 * user per test company, so both devices sign in as it (authorship is the e2e's).
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const company = TEST_SEED.companies[0];
const E_DEVICE = 'tablet-conflict-e';
const A_DEVICE = 'tablet-conflict-a';
const OFFICE = 'office-conflict';

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
    if (op.kind === 'create') written.entityIds.add(op.path.split('/').at(-1)!);
  }
  const res = await authed('/api/sync/ops', { method: 'POST', body: JSON.stringify({ ops: batch }) });
  expect(res.status, await res.clone().text()).toBe(200);
  const response = syncPushResponseSchema.parse(await res.json());
  expect(response.rejected).toEqual([]);
  return response;
}

/** One stream, page by page, as a device pull reads it. */
async function pullStream(route: string): Promise<Op[]> {
  const pulled: Op[] = [];
  let since = 0;
  for (;;) {
    const res = await authed(`${route}?since=${since}`);
    expect(res.status, await res.clone().text()).toBe(200);
    const page = syncPullResponseSchema.parse(await res.json());
    pulled.push(...(page.ops as Op[]));
    const last = (page.ops as Op[]).at(-1)?.seq;
    if (last === undefined || last >= page.seq) return pulled;
    since = last;
  }
}

async function serverRow<T>(entity: 'block' | 'equipment', id: string): Promise<T> {
  const [row] = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, company.companyId), eq(entities.entity, entity), eq(entities.id, id)));
  return row!.row as T;
}

const onBlock = (blockId: string) => (op: Op) => targetsOf(op).some((ref) => ref.key === entityKey('block', blockId));

/** The device fold of the pulled relatório log for one block (what every device materializes). */
async function deviceFold(blockId: string, local: readonly Op[] = []): Promise<BlockRow> {
  const pulled = (await pullStream(`/api/sync/relatorios/${relatorioId}`)).filter(onBlock(blockId));
  return materializeEntity({ entity: 'block', id: blockId }, pulled, local) as BlockRow;
}

let relatorioId = '';
let projectId = '';
let locationId = '';
let seedVersion = '';
let blocks: { id: string; equipmentId: string }[] = [];
const item = getDefinition(standardTemplate({ id: newId() }).seed_version, 'cabine_primaria', 'chave_seccionadora').checklist![9]!.key;
const measured = (raw: string): JsonValue => ({ raw, unit: 'MΩ', state: 'measured' });

type DeviceDraft = Omit<OpDraft, 'company_id' | 'actor_id' | 'scope' | 'project_id' | 'relatorio_id' | 'meta' | 'batch_id'> & Partial<OpDraft>;

function deviceOp(device: string, draft: DeviceDraft): Op {
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

const cellPath = (blockId: string) => `sheet/${blockId}/test/isolacao/cell/0/0`;
const resultPath = (blockId: string) => `sheet/${blockId}/checklist/${item}/result`;

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  projectId = newId();
  const project = deviceOp(OFFICE, {
    kind: 'create',
    scope: 'company',
    relatorio_id: null,
    path: `project/${projectId}`,
    value: { id: projectId, client_id: null, name: 'Obra das decisões', site: null, removed_at: null },
    prev_op_id: null,
  });
  const template = standardTemplate({ id: newId() });
  seedVersion = template.seed_version;
  const built = instantiateTemplate(
    template,
    { id: projectId },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null },
    { newId, actorId: company.userId, companyId: company.companyId },
  );
  relatorioId = built.relatorioId;
  const created = built.drafts.map((draft) => makeOp({ ...draft, device_id: OFFICE }, { newId, now: now() }));
  await push([project, ...created]);
  const values = created.filter((op) => op.kind === 'create').map((op) => op.value as Record<string, unknown>);
  blocks = values
    .filter((row) => row.block_type === 'chave_seccionadora' && typeof row.equipment_id === 'string')
    .map((row) => ({ id: row.id as string, equipmentId: row.equipment_id as string }));
  locationId = (values.find((row) => row.block_type === 'chave_seccionadora')!.location_id as string) ?? '';
  expect(blocks.length).toBeGreaterThanOrEqual(6);
}, 120_000);

afterAll(async () => {
  const opIds = [...written.opIds];
  const entityIds = [...written.entityIds, relatorioId];
  if (opIds.length > 0) await db.delete(ops).where(inArray(ops.op_id, opIds));
  if (entityIds.length > 0) await db.delete(entities).where(and(eq(entities.company_id, company.companyId), inArray(entities.id, entityIds)));
  await db.delete(syncDevicePush).where(inArray(syncDevicePush.device_id, [E_DEVICE, A_DEVICE, OFFICE]));
  await sql.end();
});

describe('10.2-API-001 a cell contradiction, through the sync route', () => {
  it('two readings over a value both saw: the later push stands, the cell holds the other; "Aplicar" clears it; the device fold is the server row', async () => {
    const block = blocks[0]!;
    const path = cellPath(block.id);
    const x = deviceOp(OFFICE, { kind: 'put', path, value: measured('1'), prev_op_id: null });
    await push([x]);
    const e = deviceOp(E_DEVICE, { kind: 'put', path, value: measured('330'), prev_op_id: x.op_id, meta: { standing_op_id: x.op_id } });
    const a = deviceOp(A_DEVICE, { kind: 'put', path, value: measured('3300'), prev_op_id: x.op_id, meta: { standing_op_id: x.op_id } });
    await push([e]);
    // Ana's device before her push: the pulled log and her pending op on top.
    const anaView = await deviceFold(block.id, [a]);
    const second = await push([a]);
    expect(second.superseded).toEqual([{ op_id: a.op_id, over_op_id: e.op_id }]);

    const server = await serverRow<BlockRow>('block', block.id);
    expect(server.sheet.test.isolacao?.cells['0']?.['0']).toEqual({
      value: measured('3300'),
      source_suggestion_id: null,
      op_id: a.op_id,
      conflict: { op_id: e.op_id, value: measured('330'), source_suggestion_id: null },
    });
    expect(await deviceFold(block.id)).toEqual(server);
    expect(anaView).toEqual(server);

    // "Aplicar" on Eduardo's device: his pick, chained on the latest op and the standing cell.
    const pick = deviceOp(E_DEVICE, { kind: 'put', path, value: measured('330'), prev_op_id: a.op_id, meta: { standing_op_id: a.op_id } });
    const applied = await push([pick]);
    expect(applied.superseded).toEqual([]);
    const after = await serverRow<BlockRow>('block', block.id);
    expect(after.sheet.test.isolacao?.cells['0']?.['0']).toEqual({ value: measured('330'), source_suggestion_id: null, op_id: pick.op_id });
    expect(await deviceFold(block.id)).toEqual(after);
  });

  it('ledger (10.1 known limit): the losing device taps C again before its pull, stamped with its own merged-away C: NC stays', async () => {
    const block = blocks[1]!;
    const path = resultPath(block.id);
    const nc = deviceOp(E_DEVICE, { kind: 'put', path, value: 'NC', prev_op_id: null, meta: { standing_op_id: null } });
    const c = deviceOp(A_DEVICE, { kind: 'put', path, value: 'C', prev_op_id: null, meta: { standing_op_id: null } });
    await push([nc]);
    await push([c]);
    // Ana has not pulled: her row still shows her C, and she chains on it.
    const again = deviceOp(A_DEVICE, { kind: 'put', path, value: 'C', prev_op_id: c.op_id, meta: { standing_op_id: c.op_id } });
    await push([again]);
    const server = await serverRow<BlockRow>('block', block.id);
    expect(server.sheet.checklist[item]?.result).toMatchObject({ value: 'NC', op_id: nc.op_id, merge: { head_op_id: again.op_id, kept: true, rule: 'nc_over_c' } });
    expect(server.sheet.checklist[item]?.result?.conflict).toBeUndefined();
    expect(await deviceFold(block.id)).toEqual(server);
  });
});

describe('10.3-API-001 a block removed on one device and edited on the other', () => {
  for (const order of ['edit first', 'removal first'] as const) {
    it(`${order}: removed, the edit kept, the mark on the server and the device fold alike`, async () => {
      const block = blocks[order === 'edit first' ? 2 : 3]!;
      const edit = deviceOp(A_DEVICE, { kind: 'put', path: resultPath(block.id), value: 'C', prev_op_id: null, meta: { standing_op_id: null } });
      const removal = deviceOp(E_DEVICE, { kind: 'remove', path: `block/${block.id}/removed_at`, value: null, prev_op_id: null, meta: { seen_modified_at: null } });
      for (const batch of order === 'edit first' ? [[edit], [removal]] : [[removal], [edit]]) await push(batch);
      const server = await serverRow<BlockRow>('block', block.id);
      expect(server.removed_at).toBe(removal.client_ts);
      expect(server.removed_by).toBe(company.userId);
      expect(server.sheet.checklist[item]?.result?.value).toBe('C');
      expect(server.removal_conflict).toEqual({ removed_by: company.userId, removed_at: removal.client_ts, edited_by: company.userId, edited_at: edit.client_ts });
      expect(await deviceFold(block.id)).toEqual(server);
    });
  }

  it('"Manter" (the restore, stamped with the row) brings the block back and clears the mark; "Remover" keeps it removed and clears it', async () => {
    const kept = blocks[2]!;
    const marked = await serverRow<BlockRow>('block', kept.id);
    const lastRemoval = (await pullStream(`/api/sync/relatorios/${relatorioId}`)).filter((op) => op.path === `block/${kept.id}/removed_at`).at(-1)!;
    const keep = deviceOp(A_DEVICE, {
      kind: 'put',
      path: `block/${kept.id}/removed_at`,
      value: null,
      prev_op_id: lastRemoval.op_id,
      meta: { seen_modified_at: marked.last_modified_at },
    });
    await push([keep]);
    const restored = await serverRow<BlockRow>('block', kept.id);
    expect(restored.removed_at).toBeNull();
    expect(restored.removal_conflict).toBeUndefined();
    expect(restored.removed_by).toBeUndefined();
    expect(restored.sheet.checklist[item]?.result?.value).toBe('C');
    expect(await deviceFold(kept.id)).toEqual(restored);

    const removedAgain = blocks[3]!;
    const markedToo = await serverRow<BlockRow>('block', removedAgain.id);
    const remove = deviceOp(A_DEVICE, {
      kind: 'remove',
      path: `block/${removedAgain.id}/removed_at`,
      value: null,
      prev_op_id: null,
      meta: { seen_modified_at: markedToo.last_modified_at },
    });
    await push([remove]);
    const removed = await serverRow<BlockRow>('block', removedAgain.id);
    expect(removed.removed_at).toBe(remove.client_ts);
    expect(removed.removal_conflict).toBeUndefined();
    expect(await deviceFold(removedAgain.id)).toEqual(removed);
  });
});

describe('10.3-API-002 one TAG created on two devices', () => {
  it('is listed by the kernel from the pulled rows and log (later = higher seq); "Manter as duas" suffixes the later one', async () => {
    const created = (device: string, suffix: string) => {
      const ids = { equipment: newId(), block: newId() };
      const { equipment, block } = newEquipmentBlock({
        equipmentId: ids.equipment,
        blockId: ids.block,
        projectId,
        relatorioId,
        locationId,
        type: 'chave_seccionadora',
        tag: 'SEC-C99',
        seedVersion,
        orderKey: `z${suffix}`,
      });
      return {
        ids,
        ops: [
          deviceOp(device, { kind: 'create', scope: 'project', project_id: projectId, relatorio_id: null, path: `equipment/${equipment.id}`, value: equipment as unknown as JsonValue, prev_op_id: null }),
          deviceOp(device, { kind: 'create', path: `block/${block.id}`, value: block as unknown as JsonValue, prev_op_id: null }),
        ],
      };
    };
    const first = created(A_DEVICE, '1');
    const second = created(E_DEVICE, '2');
    await push(first.ops);
    await push(second.ops);

    const relatorioLog = await pullStream(`/api/sync/relatorios/${relatorioId}`);
    const projectLog = await pullStream(`/api/sync/projects/${projectId}`);
    const log = [...relatorioLog, ...projectLog];
    const facts = (op: Op | undefined): OpFacts | undefined => (op === undefined ? undefined : { actor_id: op.actor_id, device_id: op.device_id, client_ts: op.client_ts, seq: op.seq });
    const equipment = await Promise.all([first.ids.equipment, second.ids.equipment].map((id) => serverRow<EquipmentRow>('equipment', id)));
    const allBlocks = await Promise.all([first.ids.block, second.ids.block].map((id) => serverRow<BlockRow>('block', id)));
    const decisions = openDecisions({
      relatorioId,
      blocks: allBlocks,
      locations: [],
      equipment,
      opOf: () => undefined,
      createOpOf: (key) => facts(log.find((op) => op.kind === 'create' && targetsOf(op)[0]!.key === key)),
    });
    expect(decisions).toEqual([
      expect.objectContaining({ kind: 'duplicate_tag', tag: 'SEC-C99', earlier_equipment_id: first.ids.equipment, later_equipment_id: second.ids.equipment, later_block_id: second.ids.block }),
    ]);

    const decision = decisions[0]!;
    if (decision.kind !== 'duplicate_tag') throw new Error('expected a TAG decision');
    const tag = keepBothTag(decision, equipment);
    expect(tag).toBe('SEC-C99-2');
    const keep = deviceOp(A_DEVICE, { kind: 'put', scope: 'project', project_id: projectId, relatorio_id: null, path: `equipment/${second.ids.equipment}/tag`, value: tag, prev_op_id: null });
    await push([keep]);
    const renamed = await serverRow<EquipmentRow>('equipment', second.ids.equipment);
    expect(renamed.tag).toBe('SEC-C99-2');
    expect(
      openDecisions({
        relatorioId,
        blocks: allBlocks,
        locations: [],
        equipment: [equipment[0]!, renamed],
        opOf: () => undefined,
        createOpOf: (key) => facts(log.find((op) => op.kind === 'create' && targetsOf(op)[0]!.key === key)),
      }),
    ).toEqual([]);
  });
});

describe('10.2/10.3-API-003 replay', () => {
  it('a log holding an open contradiction, an open removal conflict and resolved ones replays byte-equal on the device', async () => {
    const open = blocks[4]!;
    const e = deviceOp(E_DEVICE, { kind: 'put', path: resultPath(open.id), value: 'C', prev_op_id: null, meta: { standing_op_id: null } });
    const a = deviceOp(A_DEVICE, { kind: 'put', path: resultPath(open.id), value: 'NA', prev_op_id: null, meta: { standing_op_id: null } });
    const removed = blocks[5]!;
    const removal = deviceOp(E_DEVICE, { kind: 'remove', path: `block/${removed.id}/removed_at`, value: null, prev_op_id: null, meta: { seen_modified_at: null } });
    const edit = deviceOp(A_DEVICE, { kind: 'put', path: cellPath(removed.id), value: measured('12'), prev_op_id: null, meta: { standing_op_id: null } });
    await push([e, removal]);
    await push([a, edit]);
    expect((await serverRow<BlockRow>('block', open.id)).sheet.checklist[item]?.result?.conflict).toMatchObject({ op_id: e.op_id, value: 'C' });
    expect((await serverRow<BlockRow>('block', removed.id)).removal_conflict).toBeDefined();

    const pulled = await pullStream(`/api/sync/relatorios/${relatorioId}`);
    for (const block of blocks.slice(0, 6)) {
      const server = await serverRow<BlockRow>('block', block.id);
      const device = materializeEntity({ entity: 'block', id: block.id }, pulled.filter(onBlock(block.id)), []);
      expect(canonicalJson(device)).toBe(canonicalJson(server));
    }
  });
});
