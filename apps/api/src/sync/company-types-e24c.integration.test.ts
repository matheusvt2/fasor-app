import { duplicateSeededType, equipmentTypePath, equipmentTypeVersionPath, SEED_VERSION, VECTOR_GROUP_FIELD, vectorGroupPublishIssue, type CompanyTypeDefinition } from '@app/domain';
import { DEFINITION_1 } from '@app/domain/fixtures/company-types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../ids.ts';
import { companyA, routeHarness } from './rules.test-support.ts';

/*
 * Batch e24c through `POST /api/sync/ops`. 24.18-API-001: a version whose criteria row is
 * "nominal ± %" (220 V ± 5 %) publishes; one with a tolerance of zero, or with "nominal ± %" on the
 * ratio's deviation, is refused `op_invalid` (the strict schema). 24.20-API-001: a version whose
 * ratio table reads by the vector group with no valid vector-group field on its plate is refused
 * `op_invalid`, the code a strict-schema refusal gets, while its draft (any shape) still saves; the
 * same type with the field publishes.
 */

const h = routeHarness('tablet-e24c-types');

beforeAll(() => h.setup(), 60_000);
afterAll(() => h.cleanup());

type Company = typeof companyA;

const source = { name: 'Manual do fabricante', edition: null };

/** DEFINITION_1 whose `tensao_saida` row is ruled by `criterion`. */
function nominal(criterion: Record<string, unknown>): CompanyTypeDefinition {
  const definition = structuredClone(DEFINITION_1);
  definition.criteria = definition.criteria.map((row) => (row.key === 'tensao_saida' ? ({ key: row.key, label: row.label, unit: 'V', type: 'deviation_between', source, ...criterion } as CompanyTypeDefinition['criteria'][number]) : row));
  return definition;
}

/** A type created with `draft` and, in the same push, its version 1 holding `definition`. */
async function publish(company: Company, draft: unknown, definition: unknown) {
  const typeId = newId();
  const versionId = newId();
  const create = h.clientOp(company, {
    kind: 'create',
    scope: 'company',
    path: equipmentTypePath(typeId),
    value: { id: typeId, derived_from: { seed_version: SEED_VERSION, block_type: 'transformador_forca' }, draft: draft as never, retired_at: null, removed_at: null, latest_version: 0 },
  });
  // Built valid and then given the definition: `opSchema` would refuse one the strict schema refuses.
  const valid = h.clientOp(company, {
    kind: 'create',
    scope: 'company',
    path: equipmentTypeVersionPath(versionId),
    value: { id: versionId, type_id: typeId, version: 1, definition: DEFINITION_1, published_by: company.userId, published_at: new Date().toISOString() },
  });
  const version = { ...valid, value: { ...(valid.value as object), definition } as typeof valid.value };
  const result = await h.push(company, [create, version]);
  return { typeId, versionId, create, version, result };
}

const storedVersion = (company: Company, versionId: string) => h.rowOf<unknown>(company, 'equipment_type_version', versionId);

describe('24.18-API-001: "nominal ± %" through the sync route', () => {
  it('publishes a version whose row is 220 V ± 5 %, stored as written', async () => {
    const definition = nominal({ operator: 'nominal_pct', value: 220, tolerance_pct: 5 });
    const { versionId, result } = await publish(companyA, definition, definition);
    expect(result.rejected).toEqual([]);
    expect(result.applied).toHaveLength(2);
    expect(((await storedVersion(companyA, versionId)) as { definition: CompanyTypeDefinition }).definition.criteria.find((row) => row.key === 'tensao_saida')).toMatchObject({ operator: 'nominal_pct', value: 220, tolerance_pct: 5 });
  });

  it('refuses a malformed one (a tolerance of zero, none, or the rule on the ratio\'s deviation) with op_invalid, and stores no version', async () => {
    const tc = duplicateSeededType(SEED_VERSION, 'tc').draft;
    const ratioKey = tc.tests.find((test) => test.key === 'relacao_transformacao')!.criterion_key;
    const onRatio = { ...tc, criteria: tc.criteria.map((row) => (row.key === ratioKey ? { ...row, operator: 'nominal_pct', value: 1, tolerance_pct: 0.5 } : row)) };
    for (const definition of [nominal({ operator: 'nominal_pct', value: 220, tolerance_pct: 0 }), nominal({ operator: 'nominal_pct', value: 220 }), onRatio]) {
      const { version, versionId, result } = await publish(companyA, definition, definition);
      expect(result.rejected).toContainEqual({ op_id: version.op_id, code: 'op_invalid' });
      expect(await storedVersion(companyA, versionId)).toBeUndefined();
    }
  });
});

describe('24.20-API-001: a type whose ratio cannot compute is not published', () => {
  const copy = duplicateSeededType(SEED_VERSION, 'transformador_forca').draft;
  const field = copy.nameplate.find((entry) => entry.key === VECTOR_GROUP_FIELD)!;
  const missing = { ...copy, nameplate: copy.nameplate.filter((entry) => entry.key !== VECTOR_GROUP_FIELD) };
  const optionsChanged = { ...copy, nameplate: copy.nameplate.map((entry) => (entry.key === VECTOR_GROUP_FIELD ? { ...entry, options: field.options!.slice(1) } : entry)) };

  it('refuses the version create with op_invalid (the field missing, or its options changed), keeps the draft, and stores no version', async () => {
    for (const definition of [missing, optionsChanged]) {
      expect(vectorGroupPublishIssue(definition)).not.toBeNull();
      const { typeId, versionId, create, version, result } = await publish(companyA, definition, definition);
      expect(result.rejected).toEqual([{ op_id: version.op_id, code: 'op_invalid' }]);
      expect(result.applied.map((applied) => applied.op_id)).toEqual([create.op_id]);
      expect(await storedVersion(companyA, versionId)).toBeUndefined();
      const type = await h.rowOf<object>(companyA, 'equipment_type', typeId);
      expect(type).toMatchObject({ latest_version: 0, draft: definition });
    }
  });

  it('publishes the copy as "Duplicar" gives it', async () => {
    const { result } = await publish(companyA, copy, copy);
    expect(result.rejected).toEqual([]);
    expect(result.applied).toHaveLength(2);
  });
});
