import { readFileSync } from 'node:fs';
import {
  definitionContext,
  EMPTY_DEFINITION_CONTEXT,
  equipmentTypePath,
  equipmentTypeVersionPath,
  newEquipmentTypeRow,
  parseTestBaseText,
  planTestBaseImport,
  syncPullResponseSchema,
  CONTRACT_VERSION,
  typeVersionRow,
  type EquipmentTypeRow,
  type EquipmentTypeVersionRow,
  type Op,
  type TestBaseFile,
  type TestBaseImportPlan,
} from '@app/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { entities } from '../db/schema.ts';
import { newId } from '../ids.ts';
import { companyA, companyB, routeHarness } from './rules.test-support.ts';

/*
 * Story 23.12 (M-1 (b), no contract): the base import writes only the two existing company-scope
 * creates, so it goes through `POST /api/sync/ops` as "Duplicar" and "Publicar" do. The planned
 * copies apply with their tests' texts, the company's state re-planned gives no copies, and the
 * import stays inside its company (B's pull and plan never see A's copies). The base is synthetic.
 */

const h = routeHarness('tablet-test-base-import');

beforeAll(() => h.setup(), 60_000);
afterAll(() => h.cleanup());

type Company = typeof companyA | typeof companyB;

const FIXTURE: TestBaseFile = (() => {
  const parsed = parseTestBaseText(readFileSync(new URL('../../../../packages/domain/fixtures/test-base/base-ensaios-sintetica.json', import.meta.url), 'utf8'));
  if (!parsed.ok) throw new Error('the synthetic base does not parse');
  return parsed.file;
})();

/** The company's live equipment types and versions, as its devices would hold them. */
async function companyContext(company: Company) {
  const rows = await h.db
    .select({ entity: entities.entity, row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, company.companyId), inArray(entities.entity, ['equipment_type', 'equipment_type_version'])));
  const types = rows.filter((row) => row.entity === 'equipment_type').map((row) => row.row as unknown as EquipmentTypeRow);
  const versions = rows.filter((row) => row.entity === 'equipment_type_version').map((row) => row.row as unknown as EquipmentTypeVersionRow);
  return definitionContext(versions, types);
}

/** The plan's ops as the Tipos section writes them: each create, then its version 1 when publishable. */
function planOps(company: Company, plan: TestBaseImportPlan): { ops: Op[]; typeIds: string[]; versionIds: string[] } {
  const ops: Op[] = [];
  const typeIds: string[] = [];
  const versionIds: string[] = [];
  for (const copy of plan.copies) {
    const row = newEquipmentTypeRow(newId(), copy.duplicate);
    typeIds.push(row.id);
    ops.push(h.clientOp(company, { kind: 'create', scope: 'company', path: equipmentTypePath(row.id), value: row }));
    if (!copy.publishable) continue;
    const version = typeVersionRow({ id: newId(), type: row, definition: copy.duplicate.draft, publishedBy: company.userId, publishedAt: new Date().toISOString() });
    versionIds.push(version.id);
    ops.push(h.clientOp(company, { kind: 'create', scope: 'company', path: equipmentTypeVersionPath(version.id), value: version }));
  }
  return { ops, typeIds, versionIds };
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

const FULL = planTestBaseImport(FIXTURE, EMPTY_DEFINITION_CONTEXT).copies.map((copy) => copy.label);

describe('Story 23.12: the base import through the route', () => {
  let aTypes: string[] = [];
  let aVersions: string[] = [];

  it('company A pushes its plan: every op applies and the versions carry the help and the recommendation', async () => {
    const plan = planTestBaseImport(FIXTURE, await companyContext(companyA));
    expect(plan.copies.map((copy) => copy.label)).toEqual(FULL);
    const { ops, typeIds, versionIds } = planOps(companyA, plan);
    aTypes = typeIds;
    aVersions = versionIds;
    const result = await h.push(companyA, ops);
    expect(result.rejected, JSON.stringify(result.rejected)).toEqual([]);
    expect(result.applied).toHaveLength(ops.length);

    const dj = rowOf(FIXTURE, 'DJ-02');
    const djIndex = plan.copies.findIndex((copy) => copy.equipmentId === 'DJ');
    const version = await h.rowOf<EquipmentTypeVersionRow>(companyA, 'equipment_type_version', versionIds[djIndex]!);
    const test = (version!.definition.tests as unknown as { key: string; help?: Record<string, string>; recommendation?: string }[]).find((t) => t.key === 'isolacao')!;
    expect(test.help?.['procedure']).toBe(dj.procedimento);
    expect(test.help?.['objective']).toBe(dj.objetivo);
    expect(test.recommendation).toBe(dj.recomendacao_reprovado);
    expect(await h.rowOf(companyA, 'equipment_type', typeIds[djIndex]!)).toMatchObject({ latest_version: 1, draft: null });
  });

  it("A's state re-planned gives no copies (idempotent)", async () => {
    const again = planTestBaseImport(FIXTURE, await companyContext(companyA));
    expect(again.copies).toEqual([]);
    expect(again.alreadyImported).toEqual(FULL);
  });

  it("company B's pull carries none of A's types, its plan is full, and its push leaves A's types unchanged", async () => {
    const paths = await streamPaths(companyB);
    expect(paths.some((path) => aTypes.some((id) => path === equipmentTypePath(id)) || aVersions.some((id) => path === equipmentTypeVersionPath(id)))).toBe(false);
    const plan = planTestBaseImport(FIXTURE, await companyContext(companyB));
    expect(plan.copies.map((copy) => copy.label)).toEqual(FULL);

    const before = (await companyContext(companyA)).types.size;
    const { ops } = planOps(companyB, plan);
    const result = await h.push(companyB, ops);
    expect(result.rejected, JSON.stringify(result.rejected)).toEqual([]);
    expect((await companyContext(companyA)).types.size).toBe(before);
    expect(planTestBaseImport(FIXTURE, await companyContext(companyB)).copies).toEqual([]);
  });
});

function rowOf(file: TestBaseFile, id: string) {
  return file.ensaios.find((row) => row.id === id)!;
}
