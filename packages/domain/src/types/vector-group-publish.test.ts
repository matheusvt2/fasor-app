import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFINITION_1 } from '../../fixtures/company-types/op-log.ts';
import { materializeEntity } from '../ops/materialize.ts';
import { opSchema, type Op } from '../ops/op.ts';
import { asBlockDefinition } from './block-definition.ts';
import { VECTOR_GROUP_FIELD } from '../relatorio/vector-group.ts';
import { evaluateSheetReadings } from '../relatorio/reading-evaluation.ts';
import { companyBlockType } from '../schemas/block-config.ts';
import { emptySheet, type BlockRow, type EquipmentTypeVersionRow } from '../schemas/entities.ts';
import { EMPTY_DEFINITION_CONTEXT, findDefinition, SEED_VERSION } from '../seed/definitions.ts';
import { companyTypeDefinitionSchema, type CompanyTypeDefinition, type CompanyTypeDraft } from './definition.ts';
import { removeDraftEntry, updateDraftField, updateDraftFieldRefusal } from './draft-edit.ts';
import { duplicateSeededType } from './duplicate.ts';
import { parseTestBaseText, planTestBaseImport } from './test-base-import.ts';
import { publishBlockedText, validateTypeDraft, vectorGroupPublishIssue } from './validate.ts';

/*
 * Story 24.20 ("24.20-UNIT", batch e24c): a company type whose ratio table reads by the vector group
 * and whose plate holds no valid vector-group field cannot publish (one issue on Ensaios); the editor
 * refuses a change of that field's kind or options while a ratio table reads it; the rule stays
 * outside the strict schema, so a version published broken before it still folds (D3).
 */

const copy = duplicateSeededType(SEED_VERSION, 'transformador_forca').draft;
const fieldAt = copy.nameplate.findIndex((field) => field.key === VECTOR_GROUP_FIELD);
const field = copy.nameplate[fieldAt]!;
const ratioAt = copy.tests.findIndex((test) => (test.tables ?? []).some((table) => table.ratio_factor === 'vector_group'));
const ratio = copy.tests[ratioAt]!;
const baseLabel = findDefinition(SEED_VERSION, 'transformador_forca')!.nameplate.find((entry) => entry.key === VECTOR_GROUP_FIELD)!.label;

const withField = (patch: Record<string, unknown> | null): CompanyTypeDraft => ({
  ...structuredClone(copy),
  nameplate: patch === null ? copy.nameplate.filter((entry) => entry.key !== VECTOR_GROUP_FIELD) : copy.nameplate.map((entry) => (entry.key === VECTOR_GROUP_FIELD ? ({ ...entry, ...patch } as typeof entry) : entry)),
});
const missing = withField(null);
const kindChanged = (() => {
  const draft = withField({ kind: 'text' });
  delete (draft.nameplate![fieldAt] as Record<string, unknown>).options;
  return draft;
})();
const optionsChanged = withField({ options: field.options!.slice(1) });

describe('24.20-UNIT: the publish issue', () => {
  it('the copy as "Duplicar" gives it has a valid field and publishes', () => {
    expect(fieldAt).toBeGreaterThanOrEqual(0);
    expect(ratioAt).toBeGreaterThanOrEqual(0);
    expect(vectorGroupPublishIssue(copy)).toBeNull();
    expect(validateTypeDraft(copy)).toEqual([]);
  });

  it('raises one issue on the ratio test (Ensaios) for the field missing, its kind changed or its options changed, counted in the publish bar', () => {
    const message = (label: string) => `${ratio.label}: a relação de transformação é calculada pelo grupo de ligação do campo ${label} da placa, que não está mais na placa como a lista dos grupos. Remova este ensaio, ou comece de novo com "Duplicar".`;
    for (const [name, draft, label] of [['missing', missing, baseLabel], ['kind', kindChanged, field.label], ['options', optionsChanged, field.label]] as const) {
      expect(vectorGroupPublishIssue(draft), name).toEqual({ test: ratioAt, label });
      const issues = validateTypeDraft(draft);
      expect(issues, name).toEqual([{ path: ['tests', ratioAt], part: 'ensaios', message: message(label), summary: `Ensaios › ${ratio.label} sem o campo ${label}` }]);
      expect(publishBlockedText(issues), name).toBe(`1 aviso antes de publicar: Ensaios › ${ratio.label} sem o campo ${label}`);
    }
    // A field with no label of its own and no base names its key.
    const bare = { ...missing, base_block_type: undefined } as CompanyTypeDraft;
    delete (bare as Record<string, unknown>).base_block_type;
    expect(vectorGroupPublishIssue(bare)?.label).toBe(VECTOR_GROUP_FIELD);
  });

  it('raises it beside the strict schema\'s own issues, in tab order', () => {
    const both = { ...missing, label: '' };
    const issues = validateTypeDraft(both);
    expect(issues.map((issue) => issue.part)).toEqual(['identificacao', 'ensaios']);
  });

  it('raises none for a ratio by the fixed √3 factor, a type with no ratio test, or once the ratio test is removed', () => {
    const sqrt3: CompanyTypeDraft = { ...missing, tests: missing.tests!.map((test) => ({ ...test, tables: (test.tables ?? []).map((table) => (table.ratio_factor === 'vector_group' ? { ...table, ratio_factor: 'sqrt3' as const } : table)) })) };
    expect(vectorGroupPublishIssue(sqrt3)).toBeNull();
    expect(vectorGroupPublishIssue(DEFINITION_1)).toBeNull();
    expect(validateTypeDraft(DEFINITION_1)).toEqual([]);
    expect(vectorGroupPublishIssue(null)).toBeNull();
    const removed = removeDraftEntry(missing, 'tests', ratioAt);
    expect(vectorGroupPublishIssue(removed)).toBeNull();
    expect(validateTypeDraft(removed)).toEqual([]);
  });

  it('stays outside the strict schema (D3): the broken definition parses, and a version published broken still folds on a fresh device and its sheet works', () => {
    expect(companyTypeDefinitionSchema.safeParse(missing).success).toBe(true);
    const id = '019a5c00-0000-7000-8000-00000000f201';
    const typeId = '019a5c00-0000-7000-8000-00000000f202';
    const value: EquipmentTypeVersionRow = { id, type_id: typeId, version: 1, definition: missing as CompanyTypeDefinition, published_by: '019a5c00-0000-7000-8000-00000000f203', published_at: '2026-11-01T10:00:00.000Z' };
    const pulled: Op = opSchema.parse({
      op_id: '019a5c00-0001-7000-8000-00000000f204',
      kind: 'create',
      scope: 'company',
      company_id: '019a5c00-0000-7000-8000-00000000f205',
      project_id: null,
      relatorio_id: null,
      path: `equipment_type_version/${id}`,
      value,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: '019a5c00-0000-7000-8000-00000000f203',
      device_id: 'tablet-a',
      client_ts: '2026-11-01T10:00:00.000Z',
      seq: 7,
    });
    const row = materializeEntity({ entity: 'equipment_type_version', id }, [pulled], []) as EquipmentTypeVersionRow;
    expect(row).toMatchObject({ id, type_id: typeId, version: 1 });
    const definition = asBlockDefinition(row);
    const block = { config: { block_type: companyBlockType(typeId), sub_blocks: {}, na_defaults: [], type_version: 1, type_version_id: id }, sheet: emptySheet(), seed_version: SEED_VERSION } as unknown as BlockRow;
    expect(() => evaluateSheetReadings(block, definition)).not.toThrow();
  });
});

describe('24.20-UNIT: the editor refuses the change of the field', () => {
  it('refuses a kind change or options that are no longer the codes, with its toast; the draft is unchanged', () => {
    const toast = `O campo ${field.label} não pode mudar de tipo nem de opções: a relação de transformação calcula por ele. Remova antes o ensaio.`;
    expect(updateDraftFieldRefusal(copy, fieldAt, { kind: 'text' })).toBe(toast);
    expect(updateDraftFieldRefusal(copy, fieldAt, { options: field.options!.slice(1) })).toBe(toast);
    expect(updateDraftFieldRefusal(copy, fieldAt, { options: [...field.options!, 'Xx0'] })).toBe(toast);
    expect(updateDraftField(copy, fieldAt, { kind: 'text' })).toEqual(copy);
    expect(updateDraftField(copy, fieldAt, { options: field.options!.slice(1) })).toEqual(copy);
  });

  it('lets the label and the unit change, the same options, and any change once no ratio table reads it', () => {
    expect(updateDraftFieldRefusal(copy, fieldAt, { label: 'GRUPO' })).toBeNull();
    expect(updateDraftFieldRefusal(copy, fieldAt, { unit: 'x' })).toBeNull();
    expect(updateDraftFieldRefusal(copy, fieldAt, { kind: 'select', options: [...field.options!] })).toBeNull();
    const renamed = updateDraftField(copy, fieldAt, { label: 'GRUPO', kind: 'text' });
    expect(renamed.nameplate![fieldAt]).toMatchObject({ label: 'GRUPO', kind: 'select', options: field.options });
    const free = removeDraftEntry(copy, 'tests', ratioAt);
    const at = free.nameplate!.findIndex((entry) => entry.key === VECTOR_GROUP_FIELD);
    expect(updateDraftFieldRefusal(free, at, { kind: 'text' })).toBeNull();
    expect(updateDraftField(free, at, { kind: 'text' }).nameplate![at]!.kind).toBe('text');
    // Another field of the plate is never refused.
    const other = copy.nameplate.findIndex((entry) => entry.key !== VECTOR_GROUP_FIELD);
    expect(updateDraftFieldRefusal(copy, other, { kind: 'text' })).toBeNull();
    // A field already invalid (a draft put by an older build) is not held either: the issue says it.
    expect(updateDraftFieldRefusal(optionsChanged, fieldAt, { kind: 'text' })).toBeNull();
  });
});

describe('24.20-UNIT: the base import', () => {
  it('plans a transformer copy that passes, as before', () => {
    const text = readFileSync(new URL('../../fixtures/test-base/base-ensaios-sintetica.json', import.meta.url), 'utf8');
    const parsed = parseTestBaseText(text);
    if (!parsed.ok) throw new Error('the synthetic base does not parse');
    const transformer = planTestBaseImport(parsed.file, EMPTY_DEFINITION_CONTEXT).copies.filter((c) => c.blockType === 'transformador_forca');
    expect(transformer.length).toBeGreaterThan(0);
    for (const planned of transformer) {
      expect(vectorGroupPublishIssue(planned.duplicate.draft)).toBeNull();
      expect(planned.publishable).toBe(true);
    }
  });
});
