import {
  blockFieldPath,
  buildSnapshot,
  companyBlockType,
  companySubBlocksOf,
  CONTRACT_VERSION,
  equipmentTypeFieldPath,
  equipmentTypePath,
  equipmentTypeVersionPath,
  replay,
  serializeSnapshot,
  sheetChecklistPath,
  sheetNameplatePath,
  syncPullResponseSchema,
  type CompanyTypeDefinition,
  type Op,
} from '@app/domain';
import { companyTypes, DEFINITION_1, DEFINITION_2, RELATORIO_ID } from '@app/domain/fixtures/company-types';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { now } from '../clock.ts';
import { asCompanyId } from '../db/repositories/company-id.ts';
import { entities, ops } from '../db/schema.ts';
import { newId } from '../ids.ts';
import { applyOps } from './apply.ts';
import { companyA, companyB, routeHarness } from './rules.test-support.ts';
import { toSnapshot } from './snapshot.ts';

/*
 * Story 14.6 (contract 33; the AD-3, AD-15 and AD-21 notes of 2026-11-06): company equipment
 * types through the server. The AD-3 log replays byte-equal on the Drizzle layer; every new
 * refusal of the kernel is answered through `POST /api/sync/ops` (`op_invalid`, the device drops
 * the op); a version naming a type the company does not hold is `op_target_missing`; company B
 * never resolves company A's type (its block create is refused, its pull never carries A's rows);
 * two devices publishing the same number, the later one is refused and publishes the next.
 */

const h = routeHarness('tablet-company-types');

beforeAll(() => h.setup(), 60_000);
afterAll(() => h.cleanup());

type Company = (typeof companyA) | (typeof companyB);

const DEVICE_X = 'tablet-company-types-x';
const DEVICE_Y = 'tablet-company-types-y';

interface PublishedType {
  typeId: string;
  versionId: string;
  /** The seq of the type's create. */
  seq: number;
}

/** A company type of `company`, created with its draft and published as v1, through the route. */
async function publishedType(company: Company, definition: CompanyTypeDefinition = DEFINITION_1): Promise<PublishedType> {
  const typeId = newId();
  const versionId = newId();
  const create = h.clientOp(company, {
    kind: 'create',
    scope: 'company',
    path: equipmentTypePath(typeId),
    value: { id: typeId, derived_from: { seed_version: 'v12', block_type: 'chave_transferencia_automatica' }, draft: definition, retired_at: null, removed_at: null, latest_version: 0 },
  });
  const publish = h.clientOp(company, { kind: 'create', scope: 'company', path: equipmentTypeVersionPath(versionId), value: versionValue(company, versionId, typeId, 1, definition) });
  const result = await h.push(company, [create, publish]);
  expect(result.rejected, JSON.stringify(result.rejected)).toEqual([]);
  return { typeId, versionId, seq: result.applied[0]!.seq };
}

function versionValue(company: Company, id: string, typeId: string, version: number, definition: unknown = DEFINITION_1) {
  return { id, type_id: typeId, version, definition, published_by: company.userId, published_at: new Date().toISOString() };
}

const subBlocks = Object.fromEntries(companySubBlocksOf(DEFINITION_1).map((key) => [key, { enabled: key !== 'ia_ip_display' }]));

/** A block create of a company type on a fresh relatório of `company`. */
async function companyBlockCreate(company: Company, typeId: string, typeVersion: number, relatorio?: Awaited<ReturnType<typeof h.seedRelatorio>>): Promise<{ op: Op; blockId: string; relatorioId: string }> {
  const seeded = relatorio ?? (await h.seedRelatorio(company));
  const blockId = newId();
  const equipmentId = seeded.blocks[0]!.equipmentId;
  const blockType = companyBlockType(typeId);
  const op = h.clientOp(company, {
    kind: 'create',
    path: `block/${blockId}`,
    relatorio_id: seeded.relatorioId,
    value: {
      id: blockId,
      relatorio_id: seeded.relatorioId,
      location_id: seeded.locationId,
      equipment_id: equipmentId,
      block_type: blockType,
      config: { block_type: blockType, sub_blocks: subBlocks, na_defaults: [], type_version: typeVersion },
      seed_version: 'v12',
      order_key: 'zz',
      feeds_block_id: null,
      not_tested: null,
      concluded_by: null,
      sheet: { nameplate: {}, checklist: {}, test: {}, conclusion: {}, observations: null },
      created_by: null,
      first_edited_at: null,
      last_modified_by: null,
      last_modified_at: null,
      removed_at: null,
    },
  });
  return { op, blockId, relatorioId: seeded.relatorioId };
}

async function companyPull(company: Company, contract: string = String(CONTRACT_VERSION), since = 0): Promise<Response> {
  return h.authed(company, `/api/sync/company?since=${since}`, { headers: { 'x-contract-version': contract } });
}

/** Every path of the company stream from `since` on, page after page (bounded). */
async function streamPaths(company: Company, since = 0): Promise<string[]> {
  const paths: string[] = [];
  let at = since;
  for (let page = 0; page < 200; page++) {
    const body = syncPullResponseSchema.parse(await (await companyPull(company, String(CONTRACT_VERSION), at)).json());
    const pulled = body.ops as { path: string; seq: number }[];
    paths.push(...pulled.map((op) => op.path));
    if (pulled.length === 0 || body.seq <= at) break;
    at = pulled.at(-1)!.seq;
  }
  return paths;
}

describe('Story 14.6: the AD-3 log with company types replays byte-equal (Drizzle layer)', () => {
  const companyId = asCompanyId(newId());
  const log: Op[] = companyTypes.log.map((op) => ({ ...op, company_id: companyId, seq: undefined }));

  beforeAll(async () => {
    // The fixture's op ids are fixed: reclaim them from a run killed before its cleanup.
    await h.db.delete(ops).where(inArray(ops.op_id, log.map((op) => op.op_id)));
  });

  afterAll(async () => {
    await h.db.delete(entities).where(eq(entities.company_id, companyId));
    await h.db.delete(ops).where(eq(ops.company_id, companyId));
  });

  it('applies the log in order, and the snapshot carries the three versions, byte-equal to the pure replay', async () => {
    const result = await applyOps(h.db, companyId, log, { now, origin: 'server' });
    expect(result.rejected).toEqual([]);
    const drizzle = await toSnapshot(h.db, companyId, RELATORIO_ID);
    expect(drizzle.equipment_types?.map((row) => row.version)).toEqual([1, 2, 1]);
    const pure = buildSnapshot(replay(companyTypes.log), RELATORIO_ID);
    expect(serializeSnapshot(drizzle)).toBe(serializeSnapshot(pure));
  });
});

describe('Story 14.6: publishing through the route', () => {
  it('publishes v1, and a draft edited after it stays open as the next version', async () => {
    const { typeId } = await publishedType(companyA);
    expect(await h.rowOf(companyA, 'equipment_type', typeId)).toMatchObject({ latest_version: 1, draft: null });
    const edit = h.clientOp(companyA, { kind: 'put', scope: 'company', path: equipmentTypeFieldPath(typeId, 'draft'), value: DEFINITION_2 });
    expect((await h.push(companyA, [edit])).rejected).toEqual([]);
    expect(await h.rowOf(companyA, 'equipment_type', typeId)).toMatchObject({ latest_version: 1, draft: DEFINITION_2 });
  });

  it('two devices publish version 2: the later push is refused op_invalid, and its device publishes again as version 3', async () => {
    const { typeId } = await publishedType(companyA);
    const xId = newId();
    const yId = newId();
    const x = h.clientOp(companyA, { kind: 'create', scope: 'company', path: equipmentTypeVersionPath(xId), device_id: DEVICE_X, value: versionValue(companyA, xId, typeId, 2, DEFINITION_2) });
    const y = h.clientOp(companyA, { kind: 'create', scope: 'company', path: equipmentTypeVersionPath(yId), device_id: DEVICE_Y, value: versionValue(companyA, yId, typeId, 2, DEFINITION_1) });
    expect((await h.push(companyA, [x])).rejected).toEqual([]);
    expect((await h.push(companyA, [y])).rejected).toEqual([{ op_id: y.op_id, code: 'op_invalid' }]);
    expect(await h.logged(y.op_id)).toBe(false);
    const againId = newId();
    const again = h.clientOp(companyA, { kind: 'create', scope: 'company', path: equipmentTypeVersionPath(againId), device_id: DEVICE_Y, value: versionValue(companyA, againId, typeId, 3, DEFINITION_1) });
    expect((await h.push(companyA, [again])).rejected).toEqual([]);
    expect(await h.rowOf(companyA, 'equipment_type', typeId)).toMatchObject({ latest_version: 3 });
  });

  it('refuses latest + 2 and a definition the strict schema refuses (op_invalid); a type the company does not hold is op_target_missing', async () => {
    const { typeId } = await publishedType(companyA);
    const skipId = newId();
    const skip = h.clientOp(companyA, { kind: 'create', scope: 'company', path: equipmentTypeVersionPath(skipId), value: versionValue(companyA, skipId, typeId, 3) });
    const badId = newId();
    // Built valid and then broken: `makeOp` would refuse it before it reached the route.
    const valid = h.clientOp(companyA, { kind: 'create', scope: 'company', path: equipmentTypeVersionPath(badId), value: versionValue(companyA, badId, typeId, 2) });
    const bad = { ...valid, value: versionValue(companyA, badId, typeId, 2, { ...DEFINITION_1, criteria: [{ ...DEFINITION_1.criteria[0]!, source: { name: '', edition: null } }] }) } as Op;
    const strayId = newId();
    const stray = h.clientOp(companyA, { kind: 'create', scope: 'company', path: equipmentTypeVersionPath(strayId), value: versionValue(companyA, strayId, newId(), 1) });
    const result = await h.push(companyA, [skip, bad, stray]);
    expect(result.rejected).toEqual([
      { op_id: skip.op_id, code: 'op_invalid' },
      { op_id: bad.op_id, code: 'op_invalid' },
      { op_id: stray.op_id, code: 'op_target_missing' },
    ]);
  });

  it('discards a never-published type, and refuses the discard of a published one and a draft on a removed one', async () => {
    const typeId = newId();
    const create = h.clientOp(companyA, { kind: 'create', scope: 'company', path: equipmentTypePath(typeId), value: { id: typeId, derived_from: null, draft: { label: 'Rascunho' }, retired_at: null, removed_at: null, latest_version: 0 } });
    const discard = h.clientOp(companyA, { kind: 'remove', scope: 'company', path: equipmentTypeFieldPath(typeId, 'removed_at'), value: null });
    expect((await h.push(companyA, [create, discard])).rejected).toEqual([]);
    const draft = h.clientOp(companyA, { kind: 'put', scope: 'company', path: equipmentTypeFieldPath(typeId, 'draft'), value: DEFINITION_1 });
    const retire = h.clientOp(companyA, { kind: 'put', scope: 'company', path: equipmentTypeFieldPath(typeId, 'retired_at'), value: new Date().toISOString() });
    const versionId = newId();
    const publish = h.clientOp(companyA, { kind: 'create', scope: 'company', path: equipmentTypeVersionPath(versionId), value: versionValue(companyA, versionId, typeId, 1) });
    expect((await h.push(companyA, [draft, retire, publish])).rejected).toEqual([
      { op_id: draft.op_id, code: 'op_invalid' },
      { op_id: retire.op_id, code: 'op_invalid' },
      { op_id: publish.op_id, code: 'op_invalid' },
    ]);
    const { typeId: published } = await publishedType(companyA);
    const late = h.clientOp(companyA, { kind: 'put', scope: 'company', path: equipmentTypeFieldPath(published, 'removed_at'), value: new Date().toISOString() });
    expect((await h.push(companyA, [late])).rejected).toEqual([{ op_id: late.op_id, code: 'op_invalid' }]);
  });

  it('retires and reactivates a type; the company stream carries the three families', async () => {
    const { typeId, versionId, seq } = await publishedType(companyA);
    const retire = h.clientOp(companyA, { kind: 'put', scope: 'company', path: equipmentTypeFieldPath(typeId, 'retired_at'), value: new Date().toISOString() });
    expect((await h.push(companyA, [retire])).rejected).toEqual([]);
    expect((await h.rowOf<{ retired_at: string | null }>(companyA, 'equipment_type', typeId))?.retired_at).not.toBeNull();
    const reactivate = h.clientOp(companyA, { kind: 'put', scope: 'company', path: equipmentTypeFieldPath(typeId, 'retired_at'), value: null });
    expect((await h.push(companyA, [reactivate])).rejected).toEqual([]);
    expect((await h.rowOf<{ retired_at: string | null }>(companyA, 'equipment_type', typeId))?.retired_at).toBeNull();
    const paths = await streamPaths(companyA, seq - 1);
    expect(paths).toContain(equipmentTypePath(typeId));
    expect(paths).toContain(equipmentTypeVersionPath(versionId));
    expect(paths).toContain(equipmentTypeFieldPath(typeId, 'retired_at'));
  });
});

describe('Story 14.6: company blocks through the route', () => {
  it('a block naming a version the company holds applies; one naming no version row is refused op_invalid', async () => {
    const { typeId } = await publishedType(companyA);
    const good = await companyBlockCreate(companyA, typeId, 1);
    expect((await h.push(companyA, [good.op])).rejected).toEqual([]);
    const missing = await companyBlockCreate(companyA, typeId, 2);
    expect((await h.push(companyA, [missing.op])).rejected).toEqual([{ op_id: missing.op.op_id, code: 'op_invalid' }]);
  });

  it('cross-tenant: company B never resolves company A\'s type, and its pull never carries A\'s rows', async () => {
    const { typeId, versionId } = await publishedType(companyA);
    const theirs = await companyBlockCreate(companyB, typeId, 1);
    expect((await h.push(companyB, [theirs.op])).rejected).toEqual([{ op_id: theirs.op.op_id, code: 'op_invalid' }]);
    // B's version naming A's type: the type is no type of B's.
    const forgedId = newId();
    const forged = h.clientOp(companyB, { kind: 'create', scope: 'company', path: equipmentTypeVersionPath(forgedId), value: versionValue(companyB, forgedId, typeId, 2) });
    expect((await h.push(companyB, [forged])).rejected).toEqual([{ op_id: forged.op_id, code: 'op_target_missing' }]);
    const paths = await streamPaths(companyB);
    expect(paths.some((path) => path === equipmentTypePath(typeId) || path === equipmentTypeVersionPath(versionId))).toBe(false);
  });

  it('refuses a config put changing the block\'s type version, and a sheet write outside its definition; a write inside it applies', async () => {
    const { typeId } = await publishedType(companyA);
    const created = await companyBlockCreate(companyA, typeId, 1);
    expect((await h.push(companyA, [created.op])).rejected).toEqual([]);
    const blockType = companyBlockType(typeId);
    const config = h.clientOp(companyA, { kind: 'put', path: blockFieldPath(created.blockId, 'config'), relatorio_id: created.relatorioId, value: { block_type: blockType, sub_blocks: subBlocks, na_defaults: [], type_version: 2 } });
    const outside = h.clientOp(companyA, { kind: 'put', path: sheetNameplatePath(created.blockId, 'potencia_nominal'), relatorio_id: created.relatorioId, value: '10 kVA' });
    const inside = h.clientOp(companyA, { kind: 'put', path: sheetChecklistPath(created.blockId, 'bornes', 'result'), relatorio_id: created.relatorioId, value: 'NC' });
    const result = await h.push(companyA, [config, outside, inside]);
    expect(result.rejected).toEqual([
      { op_id: config.op_id, code: 'op_invalid' },
      { op_id: outside.op_id, code: 'op_invalid' },
    ]);
    expect(result.applied.map((a) => a.op_id)).toEqual([inside.op_id]);
  });
});

describe('Story 14.6: contract 33', () => {
  it('answers a version-32 pull 426 contract_outdated, and still accepts its push', async () => {
    const res = await companyPull(companyA, '32');
    expect(res.status).toBe(426);
    expect(((await res.json()) as { code?: string }).code).toBe('contract_outdated');
    const typeId = newId();
    const create = h.clientOp(companyA, { kind: 'create', scope: 'company', path: equipmentTypePath(typeId), value: { id: typeId, derived_from: null, draft: null, retired_at: null, removed_at: null, latest_version: 0 } });
    h.track([create]);
    const pushed = await h.authed(companyA, '/api/sync/ops', { method: 'POST', body: JSON.stringify({ ops: [create] }), headers: { 'x-contract-version': '32' } });
    expect(pushed.status).toBe(200);
  });
});
