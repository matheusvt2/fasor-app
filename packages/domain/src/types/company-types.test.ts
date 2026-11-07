import { describe, expect, it } from 'vitest';
import {
  BLOCK_1_ID,
  BLOCK_2_ID,
  BLOCK_3_ID,
  CABINE_ID,
  COMPANY_ID,
  companyTypes,
  DEFINITION_1,
  DEFINITION_2,
  DEFINITION_3,
  DEVICE_ID,
  EQUIPMENT_1_ID,
  OPEN_DRAFT,
  PROJECT_ID,
  RELATORIO_ID,
  TYPE_1,
  TYPE_1_ID,
  TYPE_2,
  TYPE_2_ID,
  USER_ID,
  VERSION_1_ID,
  VERSION_2_ID,
  VERSION_3_ID,
} from '../../fixtures/company-types/op-log.ts';
import { replaySmall } from '../../fixtures/replay-small/op-log.ts';
import { applyOp, definitionTypeIdsOf, entityKey, SeedPathError, splitEntityKey, targetsOf, type EntityKey, type EntityState } from '../ops/apply.ts';
import { materializeEntity } from '../ops/materialize.ts';
import { opSchema, type Op } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { groupForPrint } from '../print/group-for-print.ts';
import { section9Layout } from '../print/section-9.ts';
import { composeConclusion, effectiveConclusionPair } from '../relatorio/conclusion.ts';
import { instantiateTemplate } from '../relatorio/instantiate.ts';
import { sheetProgress } from '../relatorio/sheet-progress.ts';
import { suggestTag, tagPrefixOf } from '../relatorio/tag.ts';
import { blockTypeLabelIn, locationTree, paletteItems, paletteTypeGroups, treeNodes } from '../relatorio/tree.ts';
import { learnedOptionCandidates } from '../registry/nc-phrase-row.ts';
import { blockConfigSchema, companyBlockType, EQUIPMENT_BLOCK_TYPES, isCompanyBlockType, templateBlockSchema, typeVersionOf } from '../schemas/block-config.ts';
import type { BlockRow, EntityRow, EquipmentTypeRow, EquipmentTypeVersionRow, TemplateRow } from '../schemas/entities.ts';
import { buildSnapshot, serializeSnapshot } from '../schemas/snapshot.ts';
import { compareCriterion, formatCriterionValue } from '../seed/criteria.ts';
import {
  definitionContext,
  definitionContextOf,
  EMPTY_DEFINITION_CONTEXT,
  equipmentTypesOf,
  findDefinition,
  findDefinitionIn,
  getDefinition,
  getDefinitionIn,
  latestTypeVersion,
  offeredTypes,
  SEED_VERSION,
} from '../seed/definitions.ts';
import { defaultBlockConfig, defaultBlockConfigIn, standardTemplate, templateTotals } from '../seed/template.ts';
import { composerView, setQuantity } from '../templates/compose.ts';
import { asBlockDefinition } from './block-definition.ts';
import { companyTypeDefinitionSchema, companyTypeDraftSchema, companySubBlocksOf } from './definition.ts';
import { duplicateCompanyType, duplicateSeededType, newEquipmentTypeRow, openDraftText, typeStatusText, typeVersionRow } from './duplicate.ts';
import { publishBlockedText, typeDraftIssueCount, validateTypeDraft } from './validate.ts';

/*
 * Story 14.6 (contract 33; the AD-3, AD-15 and AD-21 notes of 2026-11-06): company equipment
 * types in the kernel. The matrix of `spec-e22t-company-types.md`, each refusal at its boundary.
 */

const T = (n: number) => `2026-11-07T12:${String(n).padStart(2, '0')}:00.000Z`;
let opCounter = 0;
const opId = () => `019a5c00-0002-7000-8000-${(++opCounter).toString(16).padStart(12, '0')}`;

function op(kind: Op['kind'], scope: Op['scope'], path: string, value: unknown, extra: Partial<Op> = {}): Op {
  return opSchema.parse({
    op_id: opId(),
    kind,
    scope,
    company_id: COMPANY_ID,
    project_id: scope === 'project' ? PROJECT_ID : null,
    relatorio_id: scope === 'relatorio' ? RELATORIO_ID : null,
    path,
    value,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: USER_ID,
    device_id: DEVICE_ID,
    client_ts: T(opCounter % 60),
    ...extra,
  });
}

const typeCreate = (id: string, draft: unknown = DEFINITION_1) =>
  op('create', 'company', `equipment_type/${id}`, { id, derived_from: { seed_version: 'v12', block_type: 'chave_transferencia_automatica' }, draft, retired_at: null, removed_at: null, latest_version: 0 });
const versionCreate = (id: string, typeId: string, version: number, definition: unknown = DEFINITION_1) =>
  op('create', 'company', `equipment_type_version/${id}`, { id, type_id: typeId, version, definition, published_by: USER_ID, published_at: T(1) });

/** Folds ops one by one through `targetsOf` and the version rows the fold resolves, as both layers do. */
function fold(ops: readonly Op[], start: EntityState = new Map()): Map<EntityKey, EntityRow> {
  const state = new Map(start);
  for (const o of ops) {
    const touched = new Map<EntityKey, EntityRow>();
    for (const ref of targetsOf(o)) {
      const row = state.get(ref.key);
      if (row) touched.set(ref.key, row);
    }
    for (const [key, row] of state) if (key.startsWith('equipment_type_version:') && !touched.has(key)) touched.set(key, row);
    const next = applyOp(touched, o);
    for (const [key, row] of next) if (row !== touched.get(key)) state.set(key, row);
  }
  return state;
}

const typeOf = (state: EntityState, id: string) => state.get(entityKey('equipment_type', id)) as EquipmentTypeRow;

// --- the fixture: the AD-3 log with company types ----------------------------------------------

const fixtureState = replay(companyTypes.log);
const fixtureSnapshot = buildSnapshot(fixtureState, RELATORIO_ID);

describe('Story 14.6: schemas', () => {
  it('opens blockTypeSchema to type:{uuidv7} and keeps every seeded or section type', () => {
    expect(isCompanyBlockType(TYPE_1)).toBe(true);
    expect(isCompanyBlockType('type:not-a-uuid')).toBe(false);
    expect(isCompanyBlockType('chave_seccionadora')).toBe(false);
    expect(companyBlockType(TYPE_1_ID)).toBe(TYPE_1);
  });

  it('parses every config a seed version writes to the same bytes, and refuses a type_version on a seeded type', () => {
    for (const type of equipmentTypesOf(SEED_VERSION)) {
      const config = defaultBlockConfig(SEED_VERSION, type);
      expect(JSON.stringify(blockConfigSchema.parse(config))).toBe(JSON.stringify(config));
      expect(blockConfigSchema.safeParse({ ...config, type_version: 1 }).success).toBe(false);
    }
    // Every block of the seeded standard template (a config and its placement) keeps its bytes.
    for (const block of standardTemplate({ id: VERSION_1_ID }).blocks) expect(JSON.stringify(templateBlockSchema.parse(block))).toBe(JSON.stringify(block));
    // A key outside the closed enums is still refused on a seeded type.
    expect(blockConfigSchema.safeParse({ block_type: 'tp', sub_blocks: { tensoes: { enabled: true } }, na_defaults: [] }).success).toBe(false);
    expect(blockConfigSchema.safeParse({ block_type: 'tp', sub_blocks: {}, na_defaults: ['bornes'] }).success).toBe(false);
  });

  it('requires type_version exactly on a company type, with no subtype and no role, and takes its own keys', () => {
    const config = { block_type: TYPE_1, sub_blocks: { tensoes_medidas: { enabled: true } }, na_defaults: ['bornes'], type_version: 2 };
    expect(blockConfigSchema.parse(config)).toEqual(config);
    expect(typeVersionOf(config)).toBe(2);
    expect(blockConfigSchema.safeParse({ ...config, type_version: undefined }).success).toBe(false);
    expect(blockConfigSchema.safeParse({ ...config, type_version: 0 }).success).toBe(false);
    expect(blockConfigSchema.safeParse({ ...config, subtype: 'manual' }).success).toBe(false);
    expect(blockConfigSchema.safeParse({ ...config, role: 'entrada' }).success).toBe(false);
  });

  it('parses the strict definition, refuses one without a source, and saves any incomplete draft', () => {
    expect(companyTypeDefinitionSchema.safeParse(DEFINITION_1).success).toBe(true);
    const noSource = { ...DEFINITION_1, criteria: [{ ...DEFINITION_1.criteria[0]!, source: { name: ' ', edition: null } }] };
    expect(companyTypeDefinitionSchema.safeParse(noSource).success).toBe(false);
    for (const draft of [{}, { label: '' }, { nameplate: [{ label: 'Meio campo' }] }, { checklist: [{ nc_phrases: ['uma'] }] }, { criteria: [{ operator: 'between' }] }]) {
      expect(companyTypeDraftSchema.safeParse(draft).success).toBe(true);
    }
  });

  it('derives the sub-blocks of a definition from its parts', () => {
    expect(companySubBlocksOf(DEFINITION_3)).toEqual(['nameplate', 'checklist', 'observations', 'conclusion']);
    expect(companySubBlocksOf(DEFINITION_1)).toContain('tensoes_medidas');
    expect(companySubBlocksOf({ checklist: null })).toEqual(['observations', 'conclusion']);
  });
});

describe('Story 14.6: compareCriterion, seven operators', () => {
  const at = (operator: string, value: number, extra: { value_max?: number; unit?: string | null } = {}) => ({ operator, value, unit: 'Vcc' as string | null, ...extra });
  const measured = (value: number) => ({ value, unit: 'Vcc' });
  it('judges >, <, >= and <= at their bound', () => {
    expect(compareCriterion(measured(100), at('>', 100))).toBe(false);
    expect(compareCriterion(measured(100.1), at('>', 100))).toBe(true);
    expect(compareCriterion(measured(100), at('<', 100))).toBe(false);
    expect(compareCriterion(measured(99.9), at('<', 100))).toBe(true);
    expect(compareCriterion(measured(100), at('>=', 100))).toBe(true);
    expect(compareCriterion(measured(99.9), at('>=', 100))).toBe(false);
    expect(compareCriterion(measured(100), at('<=', 100))).toBe(true);
    expect(compareCriterion(measured(100.1), at('<=', 100))).toBe(false);
  });

  it('judges between at both bounds, inclusive', () => {
    const between = at('between', 118, { value_max: 132 });
    expect(compareCriterion(measured(118), between)).toBe(true);
    expect(compareCriterion(measured(132), between)).toBe(true);
    expect(compareCriterion(measured(117.99), between)).toBe(false);
    expect(compareCriterion(measured(132.01), between)).toBe(false);
    expect(() => compareCriterion(measured(120), at('between', 118))).toThrow();
    expect(formatCriterionValue(between)).toBe('entre 118 e 132 Vcc');
  });

  it('judges ± as a deviation and pass_fail as a verdict', () => {
    expect(compareCriterion({ value: -0.5, unit: '%' }, { operator: '±', value: 0.5, unit: '%' })).toBe(true);
    expect(compareCriterion({ value: 0.51, unit: '%' }, { operator: '±', value: 0.5, unit: '%' })).toBe(false);
    expect(compareCriterion({ value: 1, unit: null }, { operator: 'pass_fail', value: 1, unit: null })).toBe(true);
    expect(compareCriterion({ value: 0, unit: null }, { operator: 'pass_fail', value: 1, unit: null })).toBe(false);
    expect(formatCriterionValue({ operator: 'pass_fail', value: 1, unit: null })).toBe('aprovado ou reprovado');
  });
});

describe('Story 14.6: validateTypeDraft', () => {
  it('has no issue for a definition that publishes, and the same rules as the strict schema', () => {
    expect(validateTypeDraft(DEFINITION_1)).toEqual([]);
    expect(validateTypeDraft(DEFINITION_3)).toEqual([]);
    for (const draft of [{}, { ...DEFINITION_1, tag_prefix: 'nb' }, { ...DEFINITION_1, label: ' ' }]) {
      expect(validateTypeDraft(draft).length > 0).toBe(!companyTypeDefinitionSchema.safeParse(draft).success);
    }
  });

  it('names a criterion without a source with the mock sentence, and the publish reason', () => {
    const draft = { ...DEFINITION_1, criteria: DEFINITION_1.criteria.map((c) => (c.key === 'flutuacao' ? { ...c, source: { name: '', edition: null } } : c)) };
    const issues = validateTypeDraft(draft);
    expect(issues).toEqual([{ path: ['criteria', 2, 'source', 'name'], part: 'criterios', message: 'Informe a fonte do critério.', summary: 'Critérios › Flutuação do banco sem fonte' }]);
    expect(publishBlockedText(issues)).toBe('1 aviso antes de publicar: Critérios › Flutuação do banco sem fonte');
    expect(typeDraftIssueCount(issues, 'criterios')).toBe(1);
    expect(publishBlockedText([])).toBeNull();
  });

  it('names a bad TAG prefix, a repeated key, an NC phrase count and a missing name in pt-BR, in tab order', () => {
    const draft = {
      ...DEFINITION_1,
      label: '',
      tag_prefix: '9NB',
      nameplate: [...DEFINITION_1.nameplate, { ...DEFINITION_1.nameplate[0]! }],
      checklist: [{ ...DEFINITION_1.checklist![0]!, nc_phrases: ['Só uma'] }],
    };
    const messages = validateTypeDraft(draft).map((issue) => `${issue.part}: ${issue.message}`);
    expect(messages).toEqual([
      'identificacao: Informe o nome do tipo.',
      'identificacao: O prefixo da TAG começa com uma letra e tem até 6 letras maiúsculas ou números.',
      'placa: Dois campos da placa têm a mesma chave.',
      'verificacoes: Item 1: informe de 3 a 4 frases de NC.',
    ]);
    expect(publishBlockedText(validateTypeDraft(draft))).toBe('4 avisos antes de publicar: Identificação › nome do tipo');
  });

  it('names a test whose criterion is not on the Critérios tab', () => {
    const draft = { ...DEFINITION_1, criteria: DEFINITION_1.criteria.filter((c) => c.key !== 'isolacao') };
    expect(validateTypeDraft(draft).map((issue) => issue.message)).toContain(`${DEFINITION_1.tests[0]!.label}: o critério do ensaio não está na aba Critérios.`);
  });
});

describe('Story 14.6: "Duplicar" and the status words', () => {
  it('copies a seeded type (the v12 CTA) into a draft that publishes, its criteria materialized with their source', () => {
    const copy = duplicateSeededType('v12', 'chave_transferencia_automatica');
    expect(copy.derived_from).toEqual({ seed_version: 'v12', block_type: 'chave_transferencia_automatica' });
    expect(copy.draft.label).toBe(`${getDefinition('v12', 'cabine_primaria', 'chave_transferencia_automatica').label} (cópia)`);
    expect(copy.draft.tag_prefix).toBe('CTA');
    expect(copy.draft.noun).toEqual({ singular: 'chave de transferência automática', plural: 'chaves de transferência automática', gender: 'f' });
    expect(copy.draft.criteria.map((c) => c.key)).toEqual(['isolacao']);
    expect(copy.draft.criteria[0]!.source.name).toBe('aceitável na ficha');
    expect(validateTypeDraft(copy.draft)).toEqual([]);
  });

  it('copies every seeded type of v12 into a draft that publishes', () => {
    for (const type of equipmentTypesOf('v12')) expect(validateTypeDraft(duplicateSeededType('v12', type).draft), type).toEqual([]);
  });

  it('copies a published company version, and builds the rows the ops carry', () => {
    const version = { type_id: TYPE_1_ID, version: 2, definition: DEFINITION_2 };
    const copy = duplicateCompanyType(version);
    expect(copy.derived_from).toEqual({ type_id: TYPE_1_ID, version: 2 });
    expect(copy.draft.label).toBe('No-break de comando 125 Vcc (cópia)');
    expect(newEquipmentTypeRow(TYPE_2_ID, copy)).toMatchObject({ id: TYPE_2_ID, latest_version: 0, retired_at: null, removed_at: null });
    expect(typeVersionRow({ id: VERSION_3_ID, type: { id: TYPE_1_ID, latest_version: 2 }, definition: DEFINITION_2, publishedBy: USER_ID, publishedAt: T(2) }).version).toBe(3);
  });

  it('says Rascunho, Publicado · versão N, Aposentado · versão N and the open draft line', () => {
    expect(typeStatusText({ latest_version: 0, retired_at: null })).toBe('Rascunho');
    expect(typeStatusText({ latest_version: 2, retired_at: null })).toBe('Publicado · versão 2');
    expect(typeStatusText({ latest_version: 1, retired_at: T(3) })).toBe('Aposentado · versão 1');
    expect(openDraftText({ latest_version: 2, draft: {} })).toBe('Rascunho da versão 3 aberto');
    expect(openDraftText({ latest_version: 2, draft: null })).toBeNull();
    expect(openDraftText({ latest_version: 0, draft: {} })).toBeNull();
  });
});

describe('Story 14.6: the publish fold and the type refusals', () => {
  it('publishes v1 as latest + 1, clears a draft it published and keeps one edited after it', () => {
    const state = fold([typeCreate(TYPE_1_ID), versionCreate(VERSION_1_ID, TYPE_1_ID, 1)]);
    expect(typeOf(state, TYPE_1_ID).latest_version).toBe(1);
    expect(typeOf(state, TYPE_1_ID).draft).toBeNull();
    const edited = fold([op('put', 'company', `equipment_type/${TYPE_1_ID}/draft`, DEFINITION_2), versionCreate(VERSION_2_ID, TYPE_1_ID, 2, DEFINITION_1)], state);
    // Edit after publish: the type keeps its version and the edited draft stays open as the next one.
    expect(typeOf(edited, TYPE_1_ID).latest_version).toBe(2);
    expect(typeOf(edited, TYPE_1_ID).draft).toEqual(DEFINITION_2);
  });

  it('refuses a version that is latest (two devices publishing at once) or latest + 2, at the boundary', () => {
    const state = fold([typeCreate(TYPE_1_ID), versionCreate(VERSION_1_ID, TYPE_1_ID, 1)]);
    expect(() => fold([versionCreate(VERSION_2_ID, TYPE_1_ID, 1)], state)).toThrow(SeedPathError);
    expect(() => fold([versionCreate(VERSION_2_ID, TYPE_1_ID, 3)], state)).toThrow(SeedPathError);
    expect(typeOf(fold([versionCreate(VERSION_2_ID, TYPE_1_ID, 2)], state), TYPE_1_ID).latest_version).toBe(2);
  });

  it('refuses a definition the strict schema refuses, naming the kernel sentence', () => {
    const state = fold([typeCreate(TYPE_1_ID)]);
    const bad = { ...DEFINITION_1, tag_prefix: 'nb' };
    const create = { ...versionCreate(VERSION_1_ID, TYPE_1_ID, 1), value: { id: VERSION_1_ID, type_id: TYPE_1_ID, version: 1, definition: bad, published_by: USER_ID, published_at: T(1) } };
    expect(() => applyOp(state, create as Op)).toThrow(/O prefixo da TAG/);
    expect(() => applyOp(state, create as Op)).toThrow(SeedPathError);
  });

  it('refuses a version, a draft or a retirement on a removed type, and a discard once published', () => {
    const removed = fold([typeCreate(TYPE_1_ID), op('put', 'company', `equipment_type/${TYPE_1_ID}/removed_at`, T(4))]);
    expect(typeOf(removed, TYPE_1_ID).removed_at).toBe(T(4));
    expect(() => fold([versionCreate(VERSION_1_ID, TYPE_1_ID, 1)], removed)).toThrow(SeedPathError);
    expect(() => fold([op('put', 'company', `equipment_type/${TYPE_1_ID}/draft`, DEFINITION_2)], removed)).toThrow(SeedPathError);
    expect(() => fold([op('put', 'company', `equipment_type/${TYPE_1_ID}/retired_at`, T(5))], removed)).toThrow(SeedPathError);
    // Discard: valid at latest 0 (above), refused at latest 1, whether a put or a remove.
    const published = fold([typeCreate(TYPE_1_ID), versionCreate(VERSION_1_ID, TYPE_1_ID, 1)]);
    expect(() => fold([op('put', 'company', `equipment_type/${TYPE_1_ID}/removed_at`, T(6))], published)).toThrow(SeedPathError);
    expect(() => fold([op('remove', 'company', `equipment_type/${TYPE_1_ID}/removed_at`, null)], published)).toThrow(SeedPathError);
  });

  it('refuses a put on a type that is not in state; retires and reactivates without touching a version', () => {
    expect(() => fold([op('put', 'company', `equipment_type/${TYPE_1_ID}/draft`, DEFINITION_1)])).toThrow(SeedPathError);
    const state = fold([typeCreate(TYPE_1_ID), versionCreate(VERSION_1_ID, TYPE_1_ID, 1), op('put', 'company', `equipment_type/${TYPE_1_ID}/retired_at`, T(7))]);
    expect(typeOf(state, TYPE_1_ID)).toMatchObject({ retired_at: T(7), latest_version: 1 });
    const reactivated = fold([op('put', 'company', `equipment_type/${TYPE_1_ID}/retired_at`, null)], state);
    expect(typeOf(reactivated, TYPE_1_ID).retired_at).toBeNull();
    expect(reactivated.get(entityKey('equipment_type_version', VERSION_1_ID))).toBe(state.get(entityKey('equipment_type_version', VERSION_1_ID)));
  });

  it('never takes latest_version from a create value, and names the type row for a version create', () => {
    const created = applyOp(new Map(), { ...typeCreate(TYPE_1_ID), value: { ...(typeCreate(TYPE_1_ID).value as object), latest_version: 5 } } as Op);
    expect((created.get(entityKey('equipment_type', TYPE_1_ID)) as EquipmentTypeRow).latest_version).toBe(0);
    expect(targetsOf(versionCreate(VERSION_1_ID, TYPE_1_ID, 1)).map((ref) => ref.key)).toEqual([entityKey('equipment_type_version', VERSION_1_ID), entityKey('equipment_type', TYPE_1_ID)]);
  });

  it('folds a version alone (a device rebuilding the version row) without its type row', () => {
    const alone = applyOp(new Map(), versionCreate(VERSION_1_ID, TYPE_1_ID, 1));
    expect(alone.get(entityKey('equipment_type_version', VERSION_1_ID))).toMatchObject({ type_id: TYPE_1_ID, version: 1 });
  });
});

describe('Story 14.6: company blocks in the fold', () => {
  const published = fold([typeCreate(TYPE_1_ID), versionCreate(VERSION_1_ID, TYPE_1_ID, 1)]);
  const sub = Object.fromEntries(companySubBlocksOf(DEFINITION_1).map((key) => [key, { enabled: true }]));
  const blockCreate = (config: Record<string, unknown>, id = BLOCK_1_ID) =>
    op('create', 'relatorio', `block/${id}`, {
      id,
      relatorio_id: RELATORIO_ID,
      location_id: CABINE_ID,
      equipment_id: EQUIPMENT_1_ID,
      block_type: TYPE_1,
      config: { block_type: TYPE_1, sub_blocks: sub, na_defaults: [], type_version: 1, ...config },
      seed_version: SEED_VERSION,
      order_key: 'a0',
      feeds_block_id: null,
      not_tested: null,
      concluded_by: null,
      sheet: { nameplate: {}, checklist: {}, test: {}, conclusion: {}, observations: null },
      created_by: null,
      first_edited_at: null,
      last_modified_by: null,
      last_modified_at: null,
      removed_at: null,
    });

  it('names the type a block op resolves, from its create or its block row', () => {
    expect(definitionTypeIdsOf(blockCreate({}), new Map())).toEqual([TYPE_1_ID]);
    const state = fold([blockCreate({})], published);
    const put = op('put', 'relatorio', `sheet/${BLOCK_1_ID}/nameplate/modelo`, 'X');
    expect(definitionTypeIdsOf(put, state)).toEqual([TYPE_1_ID]);
    expect(definitionTypeIdsOf(replaySmall.log[0]!, new Map())).toEqual([]);
  });

  it('refuses a block naming a version no row in state holds (the cross-tenant guard), and a key its version lacks', () => {
    expect(() => fold([blockCreate({})])).toThrow(SeedPathError);
    expect(() => fold([blockCreate({ type_version: 2 })], published)).toThrow(SeedPathError);
    expect(() => fold([blockCreate({ sub_blocks: { ...sub, cta_termografia: { enabled: true } } })], published)).toThrow(SeedPathError);
    expect(() => fold([blockCreate({ na_defaults: ['mufla'] })], published)).toThrow(SeedPathError);
    expect(() => fold([blockCreate({ sub_blocks: { ...sub, conclusion: { enabled: false } } })], published)).toThrow(SeedPathError);
    expect(fold([blockCreate({ na_defaults: ['bornes'] })], published).get(entityKey('block', BLOCK_1_ID))).toBeDefined();
  });

  it('refuses a config put changing a company block\'s type or version; a seeded block is unaffected', () => {
    const state = fold([blockCreate({})], published);
    const config = { block_type: TYPE_1, sub_blocks: sub, na_defaults: [], type_version: 1 };
    expect(() => fold([op('put', 'relatorio', `block/${BLOCK_1_ID}/config`, { ...config, type_version: 2 })], state)).toThrow(SeedPathError);
    expect(() => fold([op('put', 'relatorio', `block/${BLOCK_1_ID}/config`, { ...config, block_type: 'tp' })], state)).toThrow(SeedPathError);
    // A test the type leaves switchable switches off; a measurement test without `switchable` is always on, as on a seeded type.
    expect(() => fold([op('put', 'relatorio', `block/${BLOCK_1_ID}/config`, { ...config, sub_blocks: { ...sub, [DEFINITION_1.tests[0]!.key]: { enabled: false } } })], state)).not.toThrow();
    expect(() => fold([op('put', 'relatorio', `block/${BLOCK_1_ID}/config`, { ...config, sub_blocks: { ...sub, tensoes_medidas: { enabled: false } } })], state)).toThrow(/always on/);
    // A seeded block's config put that names a company type is refused too (either side checked).
    const seeded = replay(replaySmall.log.slice(0, replaySmall.log.findIndex((o) => o.path.startsWith('block/')) + 1));
    const seededBlock = [...seeded.entries()].find(([key]) => key.startsWith('block:'))!;
    const id = (seededBlock[1] as BlockRow).id;
    expect(() => applyOp(new Map([seededBlock]), op('put', 'relatorio', `block/${id}/config`, config))).toThrow(SeedPathError);
  });

  it('checks a sheet write against the resolved definition', () => {
    const state = fold([blockCreate({})], published);
    expect(() => fold([op('put', 'relatorio', `sheet/${BLOCK_1_ID}/nameplate/potencia`, 'X')], state)).toThrow(SeedPathError);
    expect(() => fold([op('put', 'relatorio', `sheet/${BLOCK_1_ID}/checklist/mufla/result`, 'C')], state)).toThrow(SeedPathError);
    expect(() => fold([op('put', 'relatorio', `sheet/${BLOCK_1_ID}/test/tensoes_medidas/cell/2/0`, { raw: '1', unit: 'Vcc', state: 'measured' })], state)).toThrow(SeedPathError);
    const written = fold([op('put', 'relatorio', `sheet/${BLOCK_1_ID}/test/tensoes_medidas/cell/1/0`, { raw: '131', unit: 'Vcc', state: 'measured' })], state);
    expect((written.get(entityKey('block', BLOCK_1_ID)) as BlockRow).sheet.test.tensoes_medidas?.cells['1']?.['0']?.value).toEqual({ raw: '131', unit: 'Vcc', state: 'measured' });
    // Without its version rows the fold has no definition to write by.
    const block = written.get(entityKey('block', BLOCK_1_ID))!;
    expect(() => applyOp(new Map([[entityKey('block', BLOCK_1_ID), block]]), op('put', 'relatorio', `sheet/${BLOCK_1_ID}/nameplate/modelo`, 'X'))).toThrow(SeedPathError);
  });

  it('leaves out a local op the fold refuses on a device, and keeps throwing for a pulled one', () => {
    const remote = [typeCreate(TYPE_1_ID), versionCreate(VERSION_1_ID, TYPE_1_ID, 1), versionCreate(VERSION_2_ID, TYPE_1_ID, 2)].map((o, i) => ({ ...o, seq: i + 1 }));
    // This device published its own v2 before pulling another device's: its op is the later one, refused.
    const local = [versionCreate(VERSION_3_ID, TYPE_1_ID, 2, DEFINITION_2)];
    const type = materializeEntity({ entity: 'equipment_type', id: TYPE_1_ID }, remote, local) as EquipmentTypeRow;
    expect(type.latest_version).toBe(2);
    expect(() => materializeEntity({ entity: 'equipment_type', id: TYPE_1_ID }, [...remote, { ...local[0]!, seq: 9 }], [])).toThrow(SeedPathError);
  });
});

describe('Story 14.6: the resolver context', () => {
  const versions = [...fixtureState.values()].filter((row): row is EquipmentTypeVersionRow => 'definition' in row && 'type_id' in row);
  const types = [...fixtureState.values()].filter((row): row is EquipmentTypeRow => 'latest_version' in row);
  const ctx = definitionContext(versions, types);

  it('keeps the old lookups for seeded types only: null or a throw for a type: key', () => {
    expect(findDefinition(SEED_VERSION, TYPE_1)).toBeNull();
    expect(() => getDefinition(SEED_VERSION, 'cabine_primaria', TYPE_1)).toThrow();
    expect(findDefinitionIn(ctx, SEED_VERSION, 'tp')).toBe(findDefinition(SEED_VERSION, 'tp'));
    expect(findDefinitionIn(EMPTY_DEFINITION_CONTEXT, SEED_VERSION, TYPE_1, 1)).toBeNull();
    expect(findDefinitionIn(ctx, SEED_VERSION, TYPE_1)).toBeNull();
    expect(() => getDefinitionIn(ctx, SEED_VERSION, TYPE_1, 3)).toThrow();
  });

  it('resolves a company version as a library BlockDefinition carrying its criteria', () => {
    const v1 = getDefinitionIn(ctx, SEED_VERSION, TYPE_1, 1);
    const v2 = getDefinitionIn(ctx, SEED_VERSION, TYPE_1, 2);
    expect(v1).toBe(asBlockDefinition(versions.find((row) => row.id === VERSION_1_ID)!));
    expect(v1.label).toBe('No-break de comando');
    expect(v2.label).toBe('No-break de comando 125 Vcc');
    expect(v1).toMatchObject({ block_type: TYPE_1, library: true, subtypes: [], tag_prefix: 'NB', type_id: TYPE_1_ID, type_version: 1 });
    expect(v1.tests[0]!.criterion).toMatchObject({ key: 'isolacao', operator: '>', value: 100, unit: 'MΩ' });
    expect(v1.measurement_tests![0]!.criteria[0]).toMatchObject({ seeded: 'tensao_saida', seeded_criterion: { operator: 'between', value: 118, value_max: 132 } });
    expect(definitionContextOf(fixtureState).versions.size).toBe(3);
    expect(definitionContext(versions, types)).toBe(ctx);
  });

  it('offers published non-retired company types after the seeded ones, at their latest version', () => {
    expect(latestTypeVersion(ctx, TYPE_1_ID)).toBe(2);
    expect(latestTypeVersion(ctx, TYPE_2_ID)).toBe(1);
    const offered = offeredTypes(ctx, SEED_VERSION);
    expect(offered.slice(0, equipmentTypesOf(SEED_VERSION).length)).toEqual(equipmentTypesOf(SEED_VERSION));
    expect(offered.slice(equipmentTypesOf(SEED_VERSION).length)).toEqual([TYPE_1]);
    const groups = paletteTypeGroups(SEED_VERSION, ctx);
    expect(groups.at(-1)!.types.at(-1)).toBe(TYPE_1);
    expect(paletteTypeGroups(SEED_VERSION)).toEqual(paletteTypeGroups(SEED_VERSION, EMPTY_DEFINITION_CONTEXT));
    const item = paletteItems(SEED_VERSION, { kind: 'cabine', name: 'Cubículo Enel' }, [], ctx).find((row) => row.type === TYPE_1)!;
    expect(item).toMatchObject({ typeVersion: 2, label: 'No-break de comando 125 Vcc', tag: 'NB-ENEL', library: true });
    expect(blockTypeLabelIn(ctx, SEED_VERSION, TYPE_1, 1)).toBe('No-break de comando');
  });

  it('suggests a company type\'s TAG from its own prefix', () => {
    const v1 = getDefinitionIn(ctx, SEED_VERSION, TYPE_1, 1);
    expect(tagPrefixOf(TYPE_1, v1)).toBe('NB');
    expect(() => tagPrefixOf(TYPE_1)).toThrow();
    expect(suggestTag(TYPE_1, { kind: 'coluna', name: 'Coluna 5' }, [{ tag: 'NB-C05', removed_at: null }], v1)).toBe('NB-C05-2');
  });

  it('builds a company block\'s default config at its version', () => {
    expect(defaultBlockConfigIn(ctx, SEED_VERSION, TYPE_2, 1)).toEqual({
      block_type: TYPE_2,
      sub_blocks: { nameplate: { enabled: true }, checklist: { enabled: true }, observations: { enabled: true }, conclusion: { enabled: true } },
      na_defaults: [],
      type_version: 1,
    });
    expect(defaultBlockConfigIn(ctx, SEED_VERSION, 'tp')).toEqual(defaultBlockConfig(SEED_VERSION, 'tp'));
  });
});

describe('Story 14.6: the snapshot, replay and print', () => {
  it('carries every version a live block references, ordered by type then version, a retired type included', () => {
    expect(fixtureSnapshot.equipment_types?.map((row) => row.id)).toEqual([VERSION_1_ID, VERSION_2_ID, VERSION_3_ID]);
  });

  it('keeps a seeded-only snapshot byte-equal: no equipment_types key', () => {
    const snapshot = buildSnapshot(replay(replaySmall.log, { deadOpIds: replaySmall.deadOpIds }), replaySmall.relatorioId);
    expect('equipment_types' in snapshot).toBe(false);
    expect(serializeSnapshot(snapshot)).not.toContain('equipment_types');
  });

  it('replays the AD-3 log identically through the per-entity materialization a device folds', () => {
    const keys = [...fixtureState.keys()];
    const context = new Map([...fixtureState].filter(([key]) => key.startsWith('equipment_type_version:')));
    const device = new Map<EntityKey, EntityRow>();
    for (const key of keys) {
      const { entity, id } = splitEntityKey(key);
      const remote = companyTypes.log.filter((o) => targetsOf(o).some((ref) => ref.key === key));
      const row = materializeEntity({ entity, id }, remote, [], context);
      if (row !== null) device.set(key, row);
    }
    expect(serializeSnapshot(buildSnapshot(device, RELATORIO_ID))).toBe(serializeSnapshot(fixtureSnapshot));
  });

  it('keeps R1 on v1 and R2 on v2: each block prints and is named by its own version', () => {
    const nodes = treeNodes(locationTree(fixtureSnapshot)).filter((node) => node.kind === 'equipment');
    expect(nodes.map((node) => node.kind === 'equipment' && node.typeLabel)).toEqual(['No-break de comando', 'No-break de comando 125 Vcc', 'Fonte auxiliar']);
    const grouping = groupForPrint(fixtureSnapshot);
    expect(grouping.subsections.map((s) => s.kind)).toEqual(['outros']);
    expect(grouping.subsections[0]!.title).toBe('Outros equipamentos da Cabine principal');
    const layout = section9Layout(fixtureSnapshot, 9, 'RELATÓRIOS DOS ENSAIOS')!;
    const titles = layout.subsections.flatMap((s) => s.sheets.map((sheet) => sheet.title));
    expect(titles).toEqual(['NO-BREAK DE COMANDO NB-01', 'NO-BREAK DE COMANDO NB-02', 'FONTE AUXILIAR FA-01']);
  });

  it('judges a company sheet through its own criteria: the floor, the progress and the composed text', () => {
    const block = fixtureSnapshot.blocks.find((row) => row.id === BLOCK_1_ID)!;
    const definition = getDefinitionIn(definitionContext(fixtureSnapshot.equipment_types), SEED_VERSION, TYPE_1, 1);
    // An NC row floors the pair at Aprovado · Com restrições; 125 and 131 Vcc sit inside their criteria (between 118 and 132, >= 132 fails 131).
    expect(effectiveConclusionPair(block, definition)).toEqual({ result: 'reprovado', restriction: 'com_restricoes' });
    const text = composeConclusion(block, definition, 'NB-01').text;
    expect(text.startsWith('O no-break NB-01')).toBe(true);
    expect(text).toContain('fora do critério');
    expect(() => effectiveConclusionPair(block)).toThrow();
    const progress = sheetProgress(fixtureSnapshot, BLOCK_1_ID);
    // FABRICANTE and TENSÃO DE SAÍDA are empty on the plate (the cabine's own fields count apart).
    expect(progress.steps.placa.missing - (progress.steps.placa.cabine ?? 0)).toBe(2);
    expect(progress.complete).toBe(false);
  });
});

describe('Story 14.6: templates, totals and the NC learner', () => {
  const versions = [...fixtureState.values()].filter((row): row is EquipmentTypeVersionRow => 'definition' in row && 'type_id' in row);
  const types = [...fixtureState.values()].filter((row): row is EquipmentTypeRow => 'latest_version' in row);
  const ctx = definitionContext(versions, types);
  const template: TemplateRow = {
    id: VERSION_1_ID,
    name: 'Com no-break',
    version: 1,
    seed_version: SEED_VERSION,
    skeleton: [{ ref: 'cab', kind: 'cabine', parent_ref: null, name: 'Cabine', agrupar_por_tipo: false }],
    blocks: [
      { ...defaultBlockConfigIn(ctx, SEED_VERSION, TYPE_1, 1), quantity: 2, skeleton_location_ref: 'cab', section_text: null },
      { ...defaultBlockConfigIn(ctx, SEED_VERSION, TYPE_2, 1), quantity: 1, skeleton_location_ref: 'cab', section_text: null },
      { ...defaultBlockConfig(SEED_VERSION, 'tp'), quantity: 1, skeleton_location_ref: 'cab', section_text: null },
    ],
    archived_at: null,
    removed_at: null,
  };

  it('counts company blocks in the template totals and the composer', () => {
    const totals = templateTotals(template);
    expect(totals[TYPE_1]).toBe(2);
    expect(totals[TYPE_2]).toBe(1);
    expect(totals.tp).toBe(1);
    expect(composerView(template).blockCount).toBe(4);
    expect(EQUIPMENT_BLOCK_TYPES.every((type) => typeof totals[type] === 'number')).toBe(true);
    const placed = setQuantity(template, 'cab', TYPE_1, 3, ctx);
    expect(placed.find((block) => block.block_type === TYPE_1)!.quantity).toBe(3);
  });

  it('instantiates each company block at its type\'s latest version, a retired type\'s included', () => {
    const { drafts } = instantiateTemplate(
      template,
      { id: PROJECT_ID },
      { service_start: null, service_end: null, existingEquipment: [], responsible_user_id: null, definitions: ctx },
      { newId: opId, actorId: USER_ID, companyId: COMPANY_ID },
    );
    const blocks = drafts.filter((draft) => draft.path.startsWith('block/')).map((draft) => draft.value as unknown as BlockRow).filter((block) => isCompanyBlockType(block.block_type));
    expect(blocks.map((block) => [block.block_type, typeVersionOf(block.config)])).toEqual([
      [TYPE_1, 2],
      [TYPE_1, 2],
      [TYPE_2, 1],
    ]);
    const tags = drafts.filter((draft) => draft.path.startsWith('equipment/')).map((draft) => (draft.value as { tag: string }).tag);
    expect(tags).toEqual(['NB-CABINE', 'NB-CABINE-2', 'FA-CABINE', 'TP-CABINE']);
  });

  it('learns no NC phrase (and no manufacturer) from a company-type sheet', () => {
    const block = fixtureSnapshot.blocks.find((row) => row.id === BLOCK_1_ID)!;
    expect(learnedOptionCandidates(block, { checklist: ['bornes'], nameplate: ['fabricante'] }, [])).toEqual({ ncPhrases: [], manufacturers: [] });
  });
});

describe('Story 14.6: the fixture', () => {
  it('folds to the open draft, the retired type and the three blocks', () => {
    expect(typeOf(fixtureState, TYPE_1_ID)).toMatchObject({ latest_version: 2, draft: OPEN_DRAFT, retired_at: null });
    expect(typeOf(fixtureState, TYPE_2_ID).retired_at).not.toBeNull();
    expect([BLOCK_1_ID, BLOCK_2_ID, BLOCK_3_ID].every((id) => fixtureState.has(entityKey('block', id)))).toBe(true);
    expect(validateTypeDraft(DEFINITION_2)).toEqual([]);
    expect(validateTypeDraft(DEFINITION_3)).toEqual([]);
  });
});
