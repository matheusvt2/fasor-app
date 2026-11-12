import { readFileSync } from 'node:fs';
import {
  CONTRACT_VERSION,
  definitionContext,
  equipmentTypeFieldPath,
  equipmentTypePath,
  equipmentTypeVersionPath,
  errorResponseSchema,
  MIN_CONTRACT_VERSION,
  newEquipmentTypeRow,
  parseTestBaseText,
  planTestBaseImport,
  planTestBaseUpdate,
  syncPullResponseSchema,
  testBaseUpdateDraft,
  testIndexHelpOf,
  typeVersionRow,
  type CompanyTypeDefinition,
  type EquipmentTypeRow,
  type EquipmentTypeVersionRow,
  type Op,
  type TestBaseFile,
} from '@app/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REVISION_B_TR_SE_INDEX_PROCEDURE, syntheticRevisionB } from '../../../../packages/domain/fixtures/test-base/revision-b.ts';
import { entities } from '../db/schema.ts';
import { newId } from '../ids.ts';
import { companyA, companyB, routeHarness } from './rules.test-support.ts';

/*
 * 25.23-API-001 (Story 25.23, contract 51): "Atualizar base de ensaios" through the sync route. The update
 * writes only the existing company-scope ops (a type's `draft` put, a type create), so it goes through
 * `POST /api/sync/ops` as the editor does. Company A imports synthetic revision A (its versions carry the
 * new keys `index_help` and `base_texts`), applies revision B's plan as draft puts, and publishes the
 * TR-SE copy's draft as version 2: every op applies, version 1 stays byte-equal, and version 2 carries
 * B's index help. A version-50 pull is answered 426; company B sees nothing of A's update and its own
 * plan holds no type of A. The revisions are synthetic.
 */

const h = routeHarness('tablet-test-base-update');

beforeAll(() => h.setup(), 60_000);
afterAll(() => h.cleanup());

type Company = typeof companyA | typeof companyB;

const A: TestBaseFile = (() => {
  const parsed = parseTestBaseText(readFileSync(new URL('../../../../packages/domain/fixtures/test-base/base-ensaios-sintetica.json', import.meta.url), 'utf8'));
  if (!parsed.ok) throw new Error('the synthetic base does not parse');
  return parsed.file;
})();
const B = syntheticRevisionB(A);

async function companyContext(company: Company) {
  const rows = await h.db
    .select({ entity: entities.entity, row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, company.companyId), inArray(entities.entity, ['equipment_type', 'equipment_type_version'])));
  const types = rows.filter((row) => row.entity === 'equipment_type').map((row) => row.row as unknown as EquipmentTypeRow);
  const versions = rows.filter((row) => row.entity === 'equipment_type_version').map((row) => row.row as unknown as EquipmentTypeVersionRow);
  return definitionContext(versions, types);
}

async function streamPaths(company: Company): Promise<string[]> {
  const paths: string[] = [];
  let at = 0;
  for (let page = 0; page < 200; page++) {
    const response = await h.authed(company, `/api/sync/company?since=${at}`, { headers: { 'x-contract-version': String(CONTRACT_VERSION) } });
    const body = syncPullResponseSchema.parse(await response.json());
    const pulled = body.ops as { path: string; seq: number }[];
    paths.push(...pulled.map((op) => op.path));
    if (pulled.length === 0 || body.seq <= at) break;
    at = pulled.at(-1)!.seq;
  }
  return paths;
}

describe('25.23-API-001 the base update through the route', () => {
  const draftPaths: string[] = [];
  let trSeTypeId = '';
  let trSeVersion1: EquipmentTypeVersionRow | undefined;

  it('company A imports revision A: the versions carry index_help and base_texts', async () => {
    const plan = planTestBaseImport(A, await companyContext(companyA));
    const ops: Op[] = [];
    for (const copy of plan.copies) {
      const row = newEquipmentTypeRow(newId(), copy.duplicate);
      ops.push(h.clientOp(companyA, { kind: 'create', scope: 'company', path: equipmentTypePath(row.id), value: row }));
      const version = typeVersionRow({ id: newId(), type: row, definition: copy.duplicate.draft, publishedBy: companyA.userId, publishedAt: new Date().toISOString() });
      ops.push(h.clientOp(companyA, { kind: 'create', scope: 'company', path: equipmentTypeVersionPath(version.id), value: version }));
      if (copy.equipmentId === 'TR-SE') trSeTypeId = row.id;
    }
    const result = await h.push(companyA, ops);
    expect(result.rejected, JSON.stringify(result.rejected)).toEqual([]);
    const ctx = await companyContext(companyA);
    trSeVersion1 = ctx.versions.get(`${trSeTypeId}@1`);
    const test = (trSeVersion1!.definition.tests as unknown as { key: string; index_help?: object; base_texts?: object }[]).find((one) => one.key === 'isolacao')!;
    expect(test.index_help).toBeDefined();
    expect(test.base_texts).toMatchObject({ index_help: { revision: 'sintética 1' } });
  });

  it("company A applies revision B as draft puts, then publishes the TR-SE draft: version 1 is unchanged and version 2 shows B's index help", async () => {
    const plan = planTestBaseUpdate(B, await companyContext(companyA));
    expect(plan.creates).toEqual([]);
    const ops: Op[] = [];
    for (const update of plan.updates) {
      const draft = testBaseUpdateDraft(update, new Set());
      if (draft === null) continue;
      const path = equipmentTypeFieldPath(update.typeId, 'draft');
      draftPaths.push(path);
      ops.push(h.clientOp(companyA, { kind: 'put', scope: 'company', path, value: draft }));
    }
    expect(ops.length).toBeGreaterThan(0);
    const result = await h.push(companyA, ops);
    expect(result.rejected, JSON.stringify(result.rejected)).toEqual([]);

    const type = await h.rowOf<EquipmentTypeRow>(companyA, 'equipment_type', trSeTypeId);
    expect(type!.latest_version).toBe(1);
    const version = typeVersionRow({ id: newId(), type: type!, definition: type!.draft as CompanyTypeDefinition, publishedBy: companyA.userId, publishedAt: new Date().toISOString() });
    const publish = await h.push(companyA, [h.clientOp(companyA, { kind: 'create', scope: 'company', path: equipmentTypeVersionPath(version.id), value: version })]);
    expect(publish.rejected, JSON.stringify(publish.rejected)).toEqual([]);

    const ctx = await companyContext(companyA);
    expect(ctx.versions.get(`${trSeTypeId}@1`)).toEqual(trSeVersion1);
    expect(testIndexHelpOf(ctx.versions.get(`${trSeTypeId}@2`)!.definition as never, 'isolacao')?.procedure).toBe(REVISION_B_TR_SE_INDEX_PROCEDURE);
    expect(await h.rowOf(companyA, 'equipment_type', trSeTypeId)).toMatchObject({ latest_version: 2, draft: null });
  });

  it('speaks contract 51: a version-50 pull is answered 426 contract_outdated, the current one is answered', async () => {
    expect(CONTRACT_VERSION).toBe(51);
    expect(MIN_CONTRACT_VERSION).toBe(51);
    const old = await h.authed(companyA, '/api/sync/company?since=0', { headers: { 'x-contract-version': '50' } });
    expect(old.status).toBe(426);
    expect(errorResponseSchema.parse(await old.json()).code).toBe('contract_outdated');
    const current = await h.authed(companyA, '/api/sync/company?since=0', { headers: { 'x-contract-version': String(CONTRACT_VERSION) } });
    expect(current.status).toBe(200);
  });

  it("company B pulls nothing of A's update, and its own update plans every type as a create", async () => {
    expect(draftPaths.length).toBeGreaterThan(0);
    const paths = await streamPaths(companyB);
    expect(paths.some((path) => draftPaths.includes(path) || path.startsWith(equipmentTypePath(trSeTypeId)))).toBe(false);
    const plan = planTestBaseUpdate(B, await companyContext(companyB));
    expect(plan.updates).toEqual([]);
    expect(plan.creates.length).toBe(planTestBaseImport(B, await companyContext(companyB)).copies.length);
  });
});
