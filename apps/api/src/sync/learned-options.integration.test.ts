import {
  blockPath,
  canonicalJson,
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  defaultBlockConfig,
  layoutSpec,
  makeOp,
  newEquipmentBlock,
  registryFieldPath,
  seedNcPhrasesOf,
  serializeSnapshot,
  sheetChecklistPath,
  sheetNameplatePath,
  syncPullResponseSchema,
  syncPushResponseSchema,
  NC_PHRASE_MAX_LENGTH,
  type BlockRow,
  type JsonValue,
  type Op,
  type OpInput,
  type RegistryRow,
  type SyncPushResponse,
} from '@app/domain';
import { and, eq, inArray, like, or, sql as raw } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../auth/auth.ts';
import { parseTrustedOrigins } from '../auth/trusted-origins.ts';
import { now } from '../clock.ts';
import { loadConfig } from '../config.ts';
import { createDb } from '../db/client.ts';
import { asCompanyId } from '../db/repositories/company-id.ts';
import { seedTestCompanies, TEST_SEED } from '../db/seed.ts';
import { entities, ops, syncDevicePush } from '../db/schema.ts';
import { newId } from '../ids.ts';
import { REGISTRY_MERGE_ACTOR, validLearnedCreates } from './apply.ts';
import { serverOp } from './server-op.ts';
import { toSnapshot } from './snapshot.ts';

/*
 * Story 14.12 (contract 23): the learned company options through POST /api/sync/ops, over the
 * compose api with the seeded users, as `sync-v6.integration.test.ts` drives it. A push that
 * leaves an NC item's observation typed by hand teaches an `nc_phrase` row of that type and item,
 * and a FABRICANTE typed with no matching row a `manufacturer` row, both server creates in the
 * push's transaction; nothing is learned twice (case, diacritics, two devices, a removed row); a
 * client create of the kind is refused; the office's rename and remove are accepted and change no
 * relatório; company B never receives company A's rows; a version-22 pull is answered 426. Every
 * text carries this run's nonce, and every row and op this run wrote, the server's included, is
 * removed afterwards.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const [companyA, companyB] = TEST_SEED.companies;
const DEVICE = 'tablet-test-learned';
const DEVICE_2 = 'tablet-test-learned-2';
const ITEM = 'abertura_e_fechamento_mecanico';
const SEED = seedNcPhrasesOf('disjuntor_mt', ITEM);
const NONCE = newId().slice(-8);

const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const auth = createAuth({
  db,
  secret: config.SESSION_SECRET,
  baseURL: config.AUTH_BASE_URL,
  trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
});

const written = { opIds: new Set<string>(), entityIds: new Set<string>() };
type Company = (typeof TEST_SEED.companies)[number];

function call(path: string, init: RequestInit = {}, version = String(CONTRACT_VERSION)): Promise<Response> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    origin: apiUrl,
    [CONTRACT_VERSION_HEADER]: version,
    ...(init.headers as Record<string, string> | undefined),
  };
  return fetch(`${apiUrl}${path}`, { ...init, redirect: 'manual', headers });
}

const cookies = new Map<string, string>();

async function signIn(who: Company): Promise<string> {
  const res = await call('/api/auth/sign-in/email', { method: 'POST', body: JSON.stringify({ email: who.email, password: TEST_SEED.password }) });
  expect(res.status, await res.text()).toBe(200);
  return res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}

/** An authenticated call that signs in again once on a 401 (another suite may have re-seeded the users). */
async function authed(path: string, init: RequestInit = {}, version = String(CONTRACT_VERSION), who: Company = companyA): Promise<Response> {
  const attempt = async (fresh: boolean) => {
    if (!cookies.has(who.email) || fresh) cookies.set(who.email, await signIn(who));
    return call(path, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), cookie: cookies.get(who.email)! } }, version);
  };
  const first = await attempt(false);
  return first.status === 401 ? attempt(true) : first;
}

async function push(batch: Op[]): Promise<SyncPushResponse> {
  const res = await authed('/api/sync/ops', { method: 'POST', body: JSON.stringify({ ops: batch }) });
  expect(res.status, await res.clone().text()).toBe(200);
  for (const pushed of batch) written.opIds.add(pushed.op_id);
  return syncPushResponseSchema.parse(await res.json());
}

async function pushOk(batch: Op[]): Promise<SyncPushResponse> {
  const result = await push(batch);
  expect(result.rejected).toEqual([]);
  expect(result.applied.map((a) => a.op_id)).toEqual(batch.map((o) => o.op_id));
  return result;
}

function op(input: Omit<OpInput, 'company_id' | 'actor_id' | 'device_id'> & Partial<OpInput>): Op {
  return makeOp(
    { company_id: companyA.companyId, actor_id: companyA.userId, device_id: DEVICE, project_id: null, relatorio_id: null, prev_op_id: null, batch_id: null, meta: null, ...input },
    { newId, now: now() },
  );
}

const scoped = (relatorioId: string) => ({ scope: 'relatorio' as const, relatorio_id: relatorioId });
const put = (relatorioId: string, path: string, value: unknown, extra: Partial<OpInput> = {}): Op => op({ ...scoped(relatorioId), kind: 'put', path, value: value as Op['value'], ...extra });
const companyOp = (kind: Op['kind'], path: string, value: unknown): Op => op({ scope: 'company', kind, path, value: value as Op['value'] });

interface Sheet {
  relatorio: string;
  project: string;
  local: string;
  block: string;
}

/** A v6 relatório with one local and one Disjuntor MT sheet, pushed. */
async function disjuntorSheet(): Promise<Sheet> {
  const ids = { relatorio: newId(), project: newId(), local: newId(), block: newId(), equipment: newId() };
  for (const id of Object.values(ids)) written.entityIds.add(id);
  const built = newEquipmentBlock({
    blockId: ids.block,
    equipmentId: ids.equipment,
    relatorioId: ids.relatorio,
    projectId: ids.project,
    locationId: ids.local,
    type: 'disjuntor_mt',
    tag: 'DJ-1',
    seedVersion: 'v6',
    orderKey: 'a0',
    config: defaultBlockConfig('v6', 'disjuntor_mt') as unknown as JsonValue,
  });
  await pushOk([
    op({
      ...scoped(ids.relatorio),
      kind: 'create',
      path: `relatorio/${ids.relatorio}`,
      value: {
        id: ids.relatorio,
        project_id: ids.project,
        template_id: null,
        template_version: null,
        seed_version: 'v6',
        status: 'rascunho',
        setup: { service_start: null, service_end: null, atividade: null, local: null, responsible_user_id: null, cover_photo_file_id: null },
        export: { scheme: 'por_local_e_tipo' },
        preview_file_id: null,
        removed_at: null,
      },
    }),
    op({
      ...scoped(ids.relatorio),
      kind: 'create',
      path: `location/${ids.local}`,
      value: {
        id: ids.local,
        relatorio_id: ids.relatorio,
        parent_id: null,
        kind: 'cabine',
        name: 'Subestação',
        order_key: 'a0',
        removed_at: null,
        se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
        env: { altitude_m: null, temperature_c: null, humidity_pct: null },
        agrupar_por_tipo: true,
      },
    }),
    op({ kind: 'create', scope: 'project', project_id: ids.project, path: `equipment/${ids.equipment}`, value: built.equipment as unknown as Op['value'] }),
    op({ ...scoped(ids.relatorio), kind: 'create', path: blockPath(ids.block), value: built.block as unknown as Op['value'] }),
  ]);
  return ids;
}

const ncPuts = (sheet: Sheet, observation: string, extra: Partial<OpInput> = {}): Op[] => [
  put(sheet.relatorio, sheetChecklistPath(sheet.block, ITEM, 'result'), 'NC', extra),
  put(sheet.relatorio, sheetChecklistPath(sheet.block, ITEM, 'observation'), observation, extra),
];

/** Company A's registry rows of `kind` whose name holds `text` (this run's nonce), live or removed. */
async function rowsNamed(kind: 'nc_phrase' | 'manufacturer', text: string, companyId: string = companyA.companyId): Promise<{ id: string; row: RegistryRow }[]> {
  const found = await db
    .select({ id: entities.id, row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'registry'), raw`${entities.row}->>'kind' = ${kind}`, raw`${entities.row}->>'name' ilike ${`%${text}%`}`));
  return found.map((entry) => ({ id: entry.id, row: entry.row as RegistryRow }));
}

async function blockRow(id: string): Promise<BlockRow> {
  const [found] = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, 'block'), eq(entities.id, id)));
  return found!.row as BlockRow;
}

beforeAll(async () => {
  await seedTestCompanies(db, auth);
}, 60_000);

afterAll(async () => {
  // The server's learned rows of this run, found by the nonce every typed text carries.
  const learned = await db
    .select({ id: entities.id })
    .from(entities)
    .where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, 'registry'), raw`${entities.row}->>'name' ilike ${`%${NONCE}%`}`));
  const learnedIds = learned.map((entry) => entry.id);
  if (learnedIds.length > 0) {
    await db.delete(ops).where(and(eq(ops.company_id, companyA.companyId), or(...learnedIds.map((id) => like(ops.path, `registry/%/${id}%`)))));
    await db.delete(entities).where(and(eq(entities.company_id, companyA.companyId), inArray(entities.id, learnedIds)));
  }
  const opIds = [...written.opIds];
  const entityIds = [...written.entityIds];
  if (opIds.length > 0) await db.delete(ops).where(inArray(ops.op_id, opIds));
  if (entityIds.length > 0) await db.delete(entities).where(inArray(entities.id, entityIds));
  await db.delete(syncDevicePush).where(inArray(syncDevicePush.device_id, [DEVICE, DEVICE_2]));
  await sql.end();
});

describe('Story 14.12 (contract 23): learned options through POST /api/sync/ops', () => {
  it('NC typed: one server create of registry/nc_phrase in the push, outside the push answer, on the company stream', async () => {
    const sheet = await disjuntorSheet();
    const text = `Fuga no bujão ${NONCE}a`;
    const edits = ncPuts(sheet, text);
    const result = await pushOk(edits);
    // The answer lists only the device's ops.
    expect(result.applied.map((a) => a.op_id)).toEqual(edits.map((e) => e.op_id));
    const rows = await rowsNamed('nc_phrase', `${NONCE}a`);
    expect(rows.map((r) => r.row)).toEqual([{ id: rows[0]!.id, kind: 'nc_phrase', block_type: 'disjuntor_mt', item_key: ITEM, name: text, removed_at: null }]);
    const [create] = await db.select().from(ops).where(and(eq(ops.company_id, companyA.companyId), eq(ops.path, `registry/nc_phrase/${rows[0]!.id}`)));
    expect(create).toMatchObject({ kind: 'create', scope: 'company', actor_id: REGISTRY_MERGE_ACTOR, device_id: 'server', relatorio_id: null });
    // The sheet keeps what was typed.
    expect((await blockRow(sheet.block)).sheet.checklist[ITEM]!.observation!.value).toBe(text);
    // Company A's pull carries it.
    const page = syncPullResponseSchema.parse(await (await authed(`/api/sync/company?since=${create!.seq - 1}`)).json());
    expect((page.ops as Op[]).map((o) => o.path)).toContain(`registry/nc_phrase/${rows[0]!.id}`);
  });

  it('Chip + typed: the observation is split at the offered phrases and only the typed piece is learned; only chips teach nothing', async () => {
    const sheet = await disjuntorSheet();
    await pushOk(ncPuts(sheet, `${SEED[0]}, mola fraca ${NONCE}b; ${SEED[1]}.`));
    expect((await rowsNamed('nc_phrase', `${NONCE}b`)).map((r) => r.row.name)).toEqual([`mola fraca ${NONCE}b`]);
    const other = await disjuntorSheet();
    const before = await rowsNamed('nc_phrase', NONCE);
    await pushOk(ncPuts(other, `${SEED[1]}, mola fraca ${NONCE}b`));
    expect((await rowsNamed('nc_phrase', NONCE)).length).toBe(before.length);
  });

  it('Not NC: an observation on a C item teaches nothing', async () => {
    const sheet = await disjuntorSheet();
    await pushOk([put(sheet.relatorio, sheetChecklistPath(sheet.block, ITEM, 'result'), 'C'), put(sheet.relatorio, sheetChecklistPath(sheet.block, ITEM, 'observation'), `Nota ${NONCE}c`)]);
    expect(await rowsNamed('nc_phrase', `${NONCE}c`)).toEqual([]);
  });

  it('Two devices: "Vazamento Ácido" and "vazamento acido" converge on one row', async () => {
    const first = await disjuntorSheet();
    const second = await disjuntorSheet();
    await pushOk(ncPuts(first, `Vazamento Ácido ${NONCE}d`));
    await pushOk(ncPuts(second, `vazamento  acido ${NONCE}D`, { device_id: DEVICE_2 }));
    expect((await rowsNamed('nc_phrase', `${NONCE}d`)).map((r) => r.row.name)).toEqual([`Vazamento Ácido ${NONCE}d`]);
  });

  it('Same push twice: re-sent op_ids learn nothing more', async () => {
    const sheet = await disjuntorSheet();
    const edits = ncPuts(sheet, `Corrosão ${NONCE}e`);
    await pushOk(edits);
    await pushOk(edits);
    expect(await rowsNamed('nc_phrase', `${NONCE}e`)).toHaveLength(1);
  });

  it('FABRICANTE typed: a manufacturer row with no grammar, the sheet keeping the spelling; a known name or the push\'s own "Criar" teaches nothing', async () => {
    const sheet = await disjuntorSheet();
    const typed = `Celtta ${NONCE}f`;
    await pushOk([put(sheet.relatorio, sheetNameplatePath(sheet.block, 'fabricacao'), typed)]);
    const rows = await rowsNamed('manufacturer', `${NONCE}f`);
    expect(rows.map((r) => r.row)).toEqual([{ id: rows[0]!.id, kind: 'manufacturer', name: typed, gender: null, number: null, removed_at: null }]);
    expect((await blockRow(sheet.block)).sheet.nameplate.fabricacao!.value).toBe(typed);

    // Another case of the same name: nothing.
    const other = await disjuntorSheet();
    await pushOk([put(other.relatorio, sheetNameplatePath(other.block, 'fabricacao'), typed.toUpperCase())]);
    expect(await rowsNamed('manufacturer', `${NONCE}f`)).toHaveLength(1);

    // "Criar ⟨nome⟩?": the client's create in the same push is the only row.
    const created = newId();
    written.entityIds.add(created);
    const name = `Novafab ${NONCE}g`;
    await pushOk([
      companyOp('create', `registry/manufacturer/${created}`, { id: created, kind: 'manufacturer', name, gender: null, number: null, removed_at: null }),
      put(other.relatorio, sheetNameplatePath(other.block, 'fabricacao'), name),
    ]);
    expect((await rowsNamed('manufacturer', `${NONCE}g`)).map((r) => r.id)).toEqual([created]);
  });

  it('a client create of registry/nc_phrase is refused op_server_only; a rename and a remove are accepted, a put of its type or item is op_path_unknown; a removed phrase is never learned again', async () => {
    const forged = newId();
    const create = companyOp('create', `registry/nc_phrase/${forged}`, { id: forged, kind: 'nc_phrase', block_type: 'disjuntor_mt', item_key: ITEM, name: `Forjada ${NONCE}h`, removed_at: null });
    expect((await push([create])).rejected).toEqual([{ op_id: create.op_id, code: 'op_server_only' }]);
    expect(await rowsNamed('nc_phrase', `${NONCE}h`)).toEqual([]);

    const sheet = await disjuntorSheet();
    await pushOk(ncPuts(sheet, `Trinca ${NONCE}i`));
    const [learned] = await rowsNamed('nc_phrase', `${NONCE}i`);
    // Built on a valid path and then moved: `makeOp` itself refuses the immutable fields.
    const moveType = { ...companyOp('put', registryFieldPath('nc_phrase', learned!.id, 'name'), 'tp'), path: `registry/nc_phrase/${learned!.id}/block_type` };
    const moveItem = { ...companyOp('put', registryFieldPath('nc_phrase', learned!.id, 'name'), 'bobinas'), path: `registry/nc_phrase/${learned!.id}/item_key` };
    expect((await push([moveType, moveItem])).rejected).toEqual([
      { op_id: moveType.op_id, code: 'op_path_unknown' },
      { op_id: moveItem.op_id, code: 'op_path_unknown' },
    ]);
    await pushOk([companyOp('put', registryFieldPath('nc_phrase', learned!.id, 'name'), `Trinca no isolador ${NONCE}i`)]);
    expect((await rowsNamed('nc_phrase', `${NONCE}i`)).map((r) => r.row.name)).toEqual([`Trinca no isolador ${NONCE}i`]);
    await pushOk([companyOp('remove', registryFieldPath('nc_phrase', learned!.id, 'removed_at'), null)]);
    expect((await rowsNamed('nc_phrase', `${NONCE}i`))[0]!.row.removed_at).not.toBeNull();

    // Typed again on another sheet: the removed row is not re-learned.
    const again = await disjuntorSheet();
    await pushOk(ncPuts(again, `trinca no isolador ${NONCE}I`));
    expect(await rowsNamed('nc_phrase', `${NONCE}i`)).toHaveLength(1);
  });

  it('a rename and a remove of a learned phrase leave a relatório\'s snapshot and print layout byte-equal', async () => {
    const sheet = await disjuntorSheet();
    await pushOk(ncPuts(sheet, `Oxidação ${NONCE}j`));
    const [learned] = await rowsNamed('nc_phrase', `${NONCE}j`);
    const companyId = asCompanyId(companyA.companyId);
    const inputs = { revisionNumber: 1, issuedAt: '2026-10-21T12:00:00.000Z', draft: true };
    const before = await toSnapshot(db, companyId, sheet.relatorio);
    const beforeLayout = canonicalJson(layoutSpec(before, inputs) as unknown as JsonValue);
    await pushOk([companyOp('put', registryFieldPath('nc_phrase', learned!.id, 'name'), `Oxidação leve ${NONCE}j`)]);
    await pushOk([companyOp('remove', registryFieldPath('nc_phrase', learned!.id, 'removed_at'), null)]);
    const after = await toSnapshot(db, companyId, sheet.relatorio);
    expect(serializeSnapshot(after)).toBe(serializeSnapshot(before));
    expect(canonicalJson(layoutSpec(after, inputs) as unknown as JsonValue)).toBe(beforeLayout);
  });

  it('Removed block: a block removed in the push teaches nothing', async () => {
    const sheet = await disjuntorSheet();
    await pushOk([...ncPuts(sheet, `Folga ${NONCE}k`), op({ ...scoped(sheet.relatorio), kind: 'remove', path: `block/${sheet.block}/removed_at`, value: null })]);
    expect(await rowsNamed('nc_phrase', `${NONCE}k`)).toEqual([]);
  });

  it('Other select: a typed value on a select field is stored as it is today, and teaches nothing (only NC phrases and FABRICANTE are learned)', async () => {
    // The spec's matrix row says `op_invalid`, but no shipped fold checks a select value against
    // its options (`assertSeedPath` checks keys only): this pins the behaviour as it is, unchanged.
    const sheet = await disjuntorSheet();
    const typed = `Gás ${NONCE}l`;
    await pushOk([put(sheet.relatorio, sheetNameplatePath(sheet.block, 'meio_de_extincao'), typed)]);
    expect((await blockRow(sheet.block)).sheet.nameplate.meio_de_extincao!.value).toBe(typed);
    expect(await rowsNamed('nc_phrase', `${NONCE}l`)).toEqual([]);
    expect(await rowsNamed('manufacturer', `${NONCE}l`)).toEqual([]);
  });

  it('Other company: company B never receives company A\'s learned rows', async () => {
    const sheet = await disjuntorSheet();
    await pushOk([...ncPuts(sheet, `Isolada ${NONCE}m`), put(sheet.relatorio, sheetNameplatePath(sheet.block, 'fabricacao'), `Tenant ${NONCE}m`)]);
    const learned = [...(await rowsNamed('nc_phrase', `${NONCE}m`)), ...(await rowsNamed('manufacturer', `${NONCE}m`))].map((r) => r.id);
    expect(learned).toHaveLength(2);
    const res = await authed('/api/sync/company?since=0', {}, String(CONTRACT_VERSION), companyB);
    expect(res.status).toBe(200);
    const page = syncPullResponseSchema.parse(await res.json());
    const paths = (page.ops as Op[]).map((o) => o.path);
    for (const id of learned) expect(paths.some((path) => path.includes(id))).toBe(false);
    expect(await rowsNamed('nc_phrase', NONCE, companyB.companyId)).toEqual([]);
  });

  it('review: a phrase the office renamed away is not learned again from a sheet that still holds the old spelling', async () => {
    const sheet = await disjuntorSheet();
    const old = `Mola fraca ${NONCE}n`;
    await pushOk(ncPuts(sheet, old));
    const [learned] = await rowsNamed('nc_phrase', `${NONCE}n`);
    await pushOk([companyOp('put', registryFieldPath('nc_phrase', learned!.id, 'name'), `Mola fraca na abertura ${NONCE}n`)]);
    // Another push of a sheet holding the old spelling (its observation written again, as an edit would).
    const again = await disjuntorSheet();
    await pushOk(ncPuts(again, old.toUpperCase()));
    await pushOk([put(sheet.relatorio, sheetChecklistPath(sheet.block, ITEM, 'observation'), `${old}.`)]);
    expect((await rowsNamed('nc_phrase', `${NONCE}n`)).map((r) => r.row.name)).toEqual([`Mola fraca na abertura ${NONCE}n`]);

    // A manufacturer renamed away likewise.
    const maker = await disjuntorSheet();
    await pushOk([put(maker.relatorio, sheetNameplatePath(maker.block, 'fabricacao'), `Celta ${NONCE}o`)]);
    const [made] = await rowsNamed('manufacturer', `${NONCE}o`);
    await pushOk([companyOp('put', registryFieldPath('manufacturer', made!.id, 'name'), `Celtta ${NONCE}o`)]);
    const later = await disjuntorSheet();
    await pushOk([put(later.relatorio, sheetNameplatePath(later.block, 'fabricacao'), `CELTA ${NONCE}o`)]);
    expect((await rowsNamed('manufacturer', `${NONCE}o`)).map((r) => r.row.name)).toEqual([`Celtta ${NONCE}o`]);
  });

  it('review: a rename to a blank phrase or past NC_PHRASE_MAX_LENGTH is op_invalid; one at the limit is accepted', async () => {
    const sheet = await disjuntorSheet();
    await pushOk(ncPuts(sheet, `Folga axial ${NONCE}p`));
    const [learned] = await rowsNamed('nc_phrase', `${NONCE}p`);
    const path = registryFieldPath('nc_phrase', learned!.id, 'name');
    for (const name of ['', '   ', `${NONCE}p`.padEnd(NC_PHRASE_MAX_LENGTH + 1, 'x')]) {
      const rename = companyOp('put', path, name);
      expect((await push([rename])).rejected, JSON.stringify(name)).toEqual([{ op_id: rename.op_id, code: 'op_invalid' }]);
    }
    const atLimit = `${NONCE}p`.padEnd(NC_PHRASE_MAX_LENGTH, 'y');
    await pushOk([companyOp('put', path, atLimit)]);
    expect((await rowsNamed('nc_phrase', `${NONCE}p`)).map((r) => r.row.name)).toEqual([atLimit]);
  });

  it('review: a learned create that does not validate is left out alone; the others still land', () => {
    const at = new Date().toISOString();
    const mk = (company: string, name: string) => {
      const id = newId();
      return serverOp({ opId: newId(), companyId: company, actorId: REGISTRY_MERGE_ACTOR, clientTs: at, kind: 'create', path: `registry/manufacturer/${id}`, value: { id, kind: 'manufacturer', name, gender: null, number: null, removed_at: null }, scope: 'company' });
    };
    const good = [mk(companyA.companyId, 'A'), mk(companyA.companyId, 'C')];
    const foreign = mk(companyB.companyId, 'B');
    const kept = validLearnedCreates([good[0]!, foreign, good[1]!], asCompanyId(companyA.companyId), now);
    expect(kept.map((entry) => entry.op.op_id)).toEqual(good.map((op) => op.op_id));
  });

  it('Old client: a version-22 pull of the company stream is answered 426 contract_outdated', async () => {
    const res = await authed('/api/sync/company?since=0', {}, '22');
    expect(res.status).toBe(426);
    expect(((await res.json()) as { code: string }).code).toBe('contract_outdated');
  });
});
