import {
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  instantiateTemplate,
  invertBatch,
  locationBlocks,
  makeOp,
  movePlan,
  standardTemplate,
  syncPushResponseSchema,
  templateFromRelatorio,
  templateRowSchema,
  type BlockRow,
  type EquipmentRow,
  type LocationRow,
  type Op,
  type OpDraft,
  type RelatorioRow,
  type SyncPushResponse,
  type TemplateRow,
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
 * Stories 11.2 and 11.3, through the sync push route: the move batch (`block/{id}/location_id`,
 * `block/{id}/order_key`, `equipment/{id}/tag`) materializes on the server, and its
 * `invertBatch` undo (11.2-UNDO) puts all three back; a `template/{id}` create projected by
 * `templateFromRelatorio` is accepted as a template row, and its undo (11.3-UNDO) sets
 * `removed_at`. No new op family, no reducer change: both ride existing families.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const company = TEST_SEED.companies[0];
const DEVICE = 'tablet-move-block';

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
  return syncPushResponseSchema.parse(await res.json());
}

async function serverRow<T>(entity: string, id: string): Promise<T> {
  const [row] = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, company.companyId), eq(entities.entity, entity), eq(entities.id, id)));
  return row!.row as T;
}

const stamp = (draft: OpDraft): Op => makeOp({ ...draft, device_id: DEVICE }, { newId, now: now() });

let relatorioId = '';
let projectId = '';
let relatorio: RelatorioRow;
let locations: LocationRow[] = [];
let blocks: BlockRow[] = [];
let equipment: EquipmentRow[] = [];

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  projectId = newId();
  const project = stamp({
    kind: 'create',
    scope: 'company',
    company_id: company.companyId,
    project_id: null,
    relatorio_id: null,
    path: `project/${projectId}`,
    value: { id: projectId, client_id: null, name: 'Obra do mover', site: null, removed_at: null },
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: company.userId,
  });
  const built = instantiateTemplate(
    standardTemplate({ id: newId() }),
    { id: projectId },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null },
    { newId, actorId: company.userId, companyId: company.companyId },
  );
  relatorioId = built.relatorioId;
  const created = built.drafts.map(stamp);
  const response = await push([project, ...created]);
  expect(response.rejected).toEqual([]);
  const values = created.map((op) => ({ path: op.path, value: op.value }));
  relatorio = values.find((row) => row.path.startsWith('relatorio/'))!.value as unknown as RelatorioRow;
  locations = values.filter((row) => row.path.startsWith('location/')).map((row) => row.value as unknown as LocationRow);
  blocks = values.filter((row) => row.path.startsWith('block/')).map((row) => row.value as unknown as BlockRow);
  equipment = values.filter((row) => row.path.startsWith('equipment/')).map((row) => row.value as unknown as EquipmentRow);
}, 120_000);

afterAll(async () => {
  const opIds = [...written.opIds];
  const entityIds = [...written.entityIds, relatorioId];
  if (opIds.length > 0) await db.delete(ops).where(inArray(ops.op_id, opIds));
  if (entityIds.length > 0) await db.delete(entities).where(and(eq(entities.company_id, company.companyId), inArray(entities.id, entityIds)));
  await db.delete(syncDevicePush).where(inArray(syncDevicePush.device_id, [DEVICE]));
  await sql.end();
});

const envelope = (scope: 'relatorio' | 'project' | 'company', batchId: string) => ({
  scope,
  company_id: company.companyId,
  project_id: scope === 'project' ? projectId : null,
  relatorio_id: scope === 'relatorio' ? relatorioId : null,
  prev_op_id: null,
  batch_id: batchId,
  meta: null,
  actor_id: company.userId,
});

describe('11.2-API move a block through the sync route', () => {
  it('the move batch materializes location, order and TAG; its invertBatch undo puts all three back (11.2-UNDO)', async () => {
    const coluna5 = locations.find((row) => row.name === 'Coluna 5')!;
    const coluna9 = locations.find((row) => row.name === 'Coluna 9')!;
    const block = locationBlocks(blocks, coluna5.id).find((row) => row.block_type === 'chave_seccionadora')!;
    const own = equipment.find((row) => row.id === block.equipment_id)!;
    const plan = movePlan({ blocks, locations, equipment, blockId: block.id, targetId: coluna9.id, rename: true });
    expect(plan.kind).toBe('move');
    if (plan.kind !== 'move') return;
    expect(plan.rename).not.toBeNull();

    const batchId = newId();
    const batch = [
      stamp({ ...envelope('relatorio', batchId), kind: 'put', path: `block/${block.id}/location_id`, value: plan.targetId }),
      stamp({ ...envelope('relatorio', batchId), kind: 'put', path: `block/${block.id}/order_key`, value: plan.orderKey }),
      stamp({ ...envelope('project', batchId), kind: 'put', path: `equipment/${own.id}/tag`, value: plan.rename!.tag }),
    ];
    const pushed = await push(batch);
    expect(pushed.rejected).toEqual([]);
    expect(await serverRow<BlockRow>('block', block.id)).toMatchObject({ location_id: coluna9.id, order_key: plan.orderKey, removed_at: null });
    expect((await serverRow<EquipmentRow>('equipment', own.id)).tag).toBe(plan.rename!.tag);

    const before = new Map<string, unknown>([
      [batch[0]!.op_id, block.location_id],
      [batch[1]!.op_id, block.order_key],
      [batch[2]!.op_id, own.tag],
    ]);
    const undo = invertBatch(batch, before, { newId, now: now() });
    expect(undo).toHaveLength(3);
    const undone = await push(undo);
    expect(undone.rejected).toEqual([]);
    expect(await serverRow<BlockRow>('block', block.id)).toMatchObject({ location_id: coluna5.id, order_key: block.order_key });
    expect((await serverRow<EquipmentRow>('equipment', own.id)).tag).toBe(own.tag);
  });
});

describe('11.3-API save a relatório as a template through the sync route', () => {
  it('the projected template/{id} create is accepted; its undo sets removed_at (11.3-UNDO)', async () => {
    const template = templateFromRelatorio({ relatorio, locations, blocks }, { id: newId(), name: 'Obra do mover' });
    const batchId = newId();
    const create = stamp({ ...envelope('company', batchId), kind: 'create', path: `template/${template.id}`, value: template as never });
    const pushed = await push([create]);
    expect(pushed.rejected).toEqual([]);
    const row = templateRowSchema.parse(await serverRow<TemplateRow>('template', template.id));
    expect(row).toMatchObject({ name: 'Obra do mover', version: 1, removed_at: null });
    expect(row.skeleton).toHaveLength(23);
    expect(row.blocks.filter((block) => block.skeleton_location_ref !== null).reduce((sum, block) => sum + block.quantity, 0)).toBe(94);

    const undo = invertBatch([create], new Map(), { newId, now: now() });
    expect(undo).toHaveLength(1);
    expect((await push(undo)).rejected).toEqual([]);
    expect((await serverRow<TemplateRow>('template', template.id)).removed_at).not.toBeNull();
  });
});
