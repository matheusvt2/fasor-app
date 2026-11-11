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
  EQUIPMENT_2_ID,
  EQUIPMENT_3_ID,
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
import { makeOp, opSchema, type Op } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { contextCaption } from '../photos/caption.ts';
import { photoItemLine } from '../photos/gallery.ts';
import { groupForPrint } from '../print/group-for-print.ts';
import { lastNameplates } from '../print/last-nameplate.ts';
import { lastResults } from '../print/last-results.ts';
import { documentPhotoOrder } from '../print/photo-order.ts';
import { section9Layout } from '../print/section-9.ts';
import { composeConclusion, effectiveConclusionPair } from '../relatorio/conclusion.ts';
import { instantiateTemplate } from '../relatorio/instantiate.ts';
import { instrumentRangeFor } from '../relatorio/instrument-pick.ts';
import { composeParecer, derivedParecer } from '../relatorio/parecer.ts';
import { preIssue } from '../relatorio/pre-issue.ts';
import { sheetProgress, shownSheetSteps } from '../relatorio/sheet-progress.ts';
import { legacySuggestTag, suggestTag, tagPrefixOf } from '../relatorio/tag.ts';
import { blockTypeLabelIn, locationTree, newEquipmentBlock, paletteItems, paletteTypeGroups, treeNodes } from '../relatorio/tree.ts';
import { learnedOptionCandidates } from '../registry/nc-phrase-row.ts';
import { blockConfigSchema, companyBlockType, EQUIPMENT_BLOCK_TYPES, isCompanyBlockType, templateBlockSchema, typeVersionOf } from '../schemas/block-config.ts';
import { photoFileRowSchema, type BlockRow, type Cell, type EntityRow, type EquipmentTypeRow, type EquipmentTypeVersionRow, type TemplateRow } from '../schemas/entities.ts';
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
  snapshotDefinitionContext,
} from '../seed/definitions.ts';
import { defaultBlockConfig, defaultBlockConfigIn, standardTemplate, templateTotals } from '../seed/template.ts';
import { composerView, enabledSubBlocks, setQuantity } from '../templates/compose.ts';
import { asBlockDefinition } from './block-definition.ts';
import { companyTypeDefinitionSchema, companyTypeDraftSchema, companySubBlocksOf, criterionRulesFor, type CompanyTypeDefinition } from './definition.ts';
import { TEST_TEXT_MAX_LENGTH } from '../seed/test-help.ts';
import { duplicateCompanyType, duplicateSeededDefinition, duplicateSeededType, newEquipmentTypeRow, openDraftText, typeStatusText, typeVersionRow } from './duplicate.ts';
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
    // e22h S2: the version row's id goes beside the number, on a company type only, and must be a uuidv7.
    const named = { ...config, type_version_id: VERSION_2_ID };
    expect(blockConfigSchema.parse(named)).toEqual(named);
    expect(typeVersionOf(named)).toEqual({ version: 2, id: VERSION_2_ID });
    expect(blockConfigSchema.safeParse({ ...named, type_version: undefined }).success).toBe(false);
    expect(blockConfigSchema.safeParse({ ...named, type_version_id: 'not-a-uuid' }).success).toBe(false);
    expect(blockConfigSchema.safeParse({ block_type: 'tp', sub_blocks: {}, na_defaults: [], type_version_id: VERSION_2_ID }).success).toBe(false);
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

  it('fix batch e24x (G2): copies every seeded type of v14 (the No-break de comando and the v14 Inspeção de QGBT among them) into a draft that publishes', () => {
    const types = equipmentTypesOf('v14');
    expect(types).toContain('no_break_comando');
    expect(types).toContain('inspecao_qgbt');
    for (const type of types) expect(validateTypeDraft(duplicateSeededType('v14', type).draft), type).toEqual([]);
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
      config: { block_type: TYPE_1, sub_blocks: sub, na_defaults: [], type_version: 1, type_version_id: VERSION_1_ID, ...config },
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
    const config = { block_type: TYPE_1, sub_blocks: sub, na_defaults: [], type_version: 1, type_version_id: VERSION_1_ID };
    expect(() => fold([op('put', 'relatorio', `block/${BLOCK_1_ID}/config`, { ...config, type_version: 2 })], state)).toThrow(SeedPathError);
    // e22h S2: the version row's id is kept too, compared by value (never dropped, never swapped).
    expect(() => fold([op('put', 'relatorio', `block/${BLOCK_1_ID}/config`, { ...config, type_version_id: VERSION_2_ID })], state)).toThrow(SeedPathError);
    const withoutId: Record<string, unknown> = { ...config };
    delete withoutId.type_version_id;
    expect(() => fold([op('put', 'relatorio', `block/${BLOCK_1_ID}/config`, withoutId)], state)).toThrow(SeedPathError);
    expect(() => fold([op('put', 'relatorio', `block/${BLOCK_1_ID}/config`, structuredClone(config))], state)).not.toThrow();
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
    expect(paletteTypeGroups(SEED_VERSION, EMPTY_DEFINITION_CONTEXT)).toEqual(paletteTypeGroups(SEED_VERSION, EMPTY_DEFINITION_CONTEXT));
    const item = paletteItems(SEED_VERSION, { kind: 'cabine', name: 'Cubículo Enel' }, [], ctx).find((row) => row.type === TYPE_1)!;
    expect(item).toMatchObject({ typeVersion: 2, label: 'No-break de comando 125 Vcc', tag: 'NB-01', library: true });
    expect(blockTypeLabelIn(ctx, SEED_VERSION, TYPE_1, 1)).toBe('No-break de comando');
  });

  it('suggests a company type\'s TAG from its own prefix', () => {
    const v1 = getDefinitionIn(ctx, SEED_VERSION, TYPE_1, 1);
    expect(tagPrefixOf(TYPE_1, v1)).toBe('NB');
    expect(() => tagPrefixOf(TYPE_1)).toThrow();
    // Story 24.8: NB-NN, free in the obra; the rule before (`legacySuggestTag`) keeps the type's prefix too.
    expect(suggestTag(TYPE_1, [{ tag: 'NB-01', removed_at: null }], v1)).toBe('NB-02');
    expect(legacySuggestTag(TYPE_1, { kind: 'coluna', name: 'Coluna 5' }, [{ tag: 'NB-C05', removed_at: null }], v1)).toBe('NB-C05-2');
  });

  it('builds a company block\'s default config at its version', () => {
    expect(defaultBlockConfigIn(ctx, SEED_VERSION, TYPE_2, 1)).toEqual({
      block_type: TYPE_2,
      sub_blocks: { nameplate: { enabled: true }, checklist: { enabled: true }, observations: { enabled: true }, conclusion: { enabled: true } },
      na_defaults: [],
      type_version: 1,
      type_version_id: VERSION_3_ID,
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
      { service_start: null, service_end: null, existingEquipment: [], responsible_user_id: null, definitions: ctx, tagRule: 'legacy' },
      { newId: opId, actorId: USER_ID, companyId: COMPANY_ID },
    );
    const blocks = drafts.filter((draft) => draft.path.startsWith('block/')).map((draft) => draft.value as unknown as BlockRow).filter((block) => isCompanyBlockType(block.block_type));
    expect(blocks.map((block) => [block.block_type, typeVersionOf(block.config)])).toEqual([
      [TYPE_1, { version: 2, id: VERSION_2_ID }],
      [TYPE_1, { version: 2, id: VERSION_2_ID }],
      [TYPE_2, { version: 1, id: VERSION_3_ID }],
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

// --- review of batch e22t -----------------------------------------------------------------------

const cellOf = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: opId() });
/** A version create of `definition` built valid and then given it: `opSchema` would refuse a definition the strict schema refuses. */
const versionCreateOf = (id: string, typeId: string, version: number, definition: unknown): Op => ({
  ...versionCreate(id, typeId, version),
  value: { id, type_id: typeId, version, definition, published_by: USER_ID, published_at: T(1) } as Op['value'],
});

// Fix batch e22h (S1): "Duplicar" now carries the plate-picked criteria; `e22h-copies.test.ts` proves a copy judges as its source.

describe('Story 14.6 review: the rules a criterion may take (criterionRulesFor)', () => {
  const ratio = duplicateSeededType('v12', 'tc').draft;
  const ratioKey = ratio.tests.find((test) => test.key === 'relacao_transformacao')!.criterion_key;
  const withRule = (definition: CompanyTypeDefinition, key: string, operator: '±' | 'pass_fail'): CompanyTypeDefinition => ({
    ...definition,
    criteria: definition.criteria.map((criterion) => {
      if (criterion.key !== key) return criterion;
      const next: CompanyTypeDefinition['criteria'][number] = { ...criterion, operator, type: operator === '±' ? 'deviation_between' : 'pass_fail', value: 1 };
      delete next.value_max;
      return next;
    }),
  });
  const choiceTable = (definition: CompanyTypeDefinition): CompanyTypeDefinition => ({
    ...definition,
    measurement_tests: [
      {
        ...definition.measurement_tests![0]!,
        rows: [{ key: 'estado', label: 'Estado do banco', kind: 'choice', options: [{ key: 'bom', label: 'Bom' }, { key: 'ruim', label: 'Ruim' }] }],
        criteria: [{ type: 'absolute', seeded: 'tensao_saida', rows: ['estado'], source: { name: 'Manual do fabricante', edition: null } }],
      },
    ],
  });

  it('an insulation or contact reading, a number row and a choice row take neither ± nor pass_fail (e22h N1); the ratio takes ±', () => {
    // Story 24.18 (2026-11-11): "nominal ± %" follows "entre" wherever it may, never on the ratio's deviation.
    const comparisons = ['>', '<', '>=', '<=', 'between', 'nominal_pct'];
    expect(criterionRulesFor(DEFINITION_1, 'isolacao')).toEqual(comparisons);
    expect(criterionRulesFor(DEFINITION_1, 'tensao_saida')).toEqual(comparisons);
    expect(criterionRulesFor(ratio, ratioKey)).toEqual(['>', '<', '>=', '<=', 'between', '±']);
    expect(criterionRulesFor(choiceTable(DEFINITION_1), 'tensao_saida')).toEqual(comparisons);
    // A row no test names, and a loose draft the editor holds, take what their uses allow.
    expect(criterionRulesFor(DEFINITION_1, 'sem_uso')).toEqual([...comparisons, '±', 'pass_fail']);
    expect(criterionRulesFor({ tests: [{ key: 'resistencia_contato', criterion_key: 'x' }] }, 'x')).toEqual(comparisons);
    expect(criterionRulesFor(null, 'x')).toEqual([...comparisons, '±', 'pass_fail']);
  });

  it('refuses each pairing at its boundary, in pt-BR, and the fold refuses the version', () => {
    const plusMinus = withRule(DEFINITION_1, 'isolacao', '±');
    expect(validateTypeDraft(plusMinus)).toEqual([
      {
        path: ['criteria', 0, 'operator'],
        part: 'criterios',
        message: 'Isolamento mínimo: a regra ± vale para o desvio da relação de transformação; escolha outra regra.',
        summary: 'Critérios › Isolamento mínimo com regra ±',
      },
    ]);
    expect(validateTypeDraft(withRule(DEFINITION_1, 'tensao_saida', '±')).map((issue) => issue.message)).toEqual(['Tensão de saída: a regra ± vale para o desvio da relação de transformação; escolha outra regra.']);
    expect(validateTypeDraft(withRule(DEFINITION_1, 'tensao_saida', 'pass_fail')).map((issue) => issue.message)).toEqual(['Tensão de saída: nenhum ensaio julga "aprovado ou reprovado"; escolha outra regra.']);
    expect(validateTypeDraft(withRule(ratio, ratioKey, 'pass_fail')).map((issue) => issue.path)).toEqual([['criteria', ratio.criteria.findIndex((criterion) => criterion.key === ratioKey), 'operator']]);
    // The boundary that publishes: ± on the ratio; pass_fail on a choice row no longer does (e22h N1).
    expect(validateTypeDraft(withRule(ratio, ratioKey, '±'))).toEqual([]);
    expect(validateTypeDraft(withRule(choiceTable(DEFINITION_1), 'tensao_saida', 'pass_fail'))).toHaveLength(1);
    expect(companyTypeDefinitionSchema.safeParse(plusMinus).success).toBe(false);
    const state = fold([typeCreate(TYPE_1_ID)]);
    expect(() => applyOp(state, versionCreateOf(VERSION_1_ID, TYPE_1_ID, 1, plusMinus))).toThrow(/regra ±/);
  });
});

describe('Story 14.6 review: a company type without a checklist has no Verificações', () => {
  it('keeps the locked checklist only when the definition has one; the conclusion always', () => {
    const noChecklist: CompanyTypeDefinition = { ...DEFINITION_3, checklist: null };
    const config = { block_type: TYPE_2, sub_blocks: Object.fromEntries(companySubBlocksOf(noChecklist).map((key) => [key, { enabled: true }])), na_defaults: [], type_version: 1 };
    expect(enabledSubBlocks(config)).toEqual(['nameplate', 'observations', 'conclusion']);
    expect(shownSheetSteps({ config })).toEqual(['placa', 'conclusao']);
    // With a checklist the locked part stays in, even switched off in the config.
    expect(enabledSubBlocks({ ...config, sub_blocks: { ...config.sub_blocks, checklist: { enabled: false } } })).toContain('checklist');
    expect(enabledSubBlocks({ ...config, sub_blocks: { nameplate: { enabled: true } } })).toEqual(['nameplate', 'conclusion']);
  });
});

describe('Story 14.6 review: the next visit, photos, parecer and pre-issue over company sheets', () => {
  it('lastResults and lastNameplates carry a company sheet\'s readings and plate by its version', () => {
    const issued = { revisionNumber: 1, issuedAt: T(50) };
    expect(lastResults(fixtureSnapshot, issued)).toEqual([
      {
        equipmentId: EQUIPMENT_1_ID,
        value: {
          relatorio_id: RELATORIO_ID,
          revision_number: 1,
          issued_at: T(50),
          // The fixture's relatório is pinned at seed v12 (`fixtures/company-types/op-log.ts`), not the current version.
          seed_version: 'v12',
          block_type: TYPE_1,
          readings: { 'tensoes_medidas|saida|valor': { raw: '125', unit: 'Vcc', state: 'measured' }, 'tensoes_medidas|flutuacao|valor': { raw: '131', unit: 'Vcc', state: 'measured' } },
          prior: null,
        },
      },
    ]);
    expect(lastNameplates(fixtureSnapshot, issued).map((entry) => [entry.equipmentId, entry.value.block_type, entry.value.fields])).toEqual([
      [EQUIPMENT_1_ID, TYPE_1, { modelo: 'NB-3000' }],
      [EQUIPMENT_2_ID, TYPE_1, { tensao_de_saida: { raw: '125', unit: 'Vcc', state: 'measured' } }],
    ]);
  });

  it('an item photo and a test photo: the caption names the noun, the item line and the document order follow the checklist', () => {
    const ITEM_PHOTO = '019a5c00-0000-7000-8000-0000000000e1';
    const TEST_PHOTO = '019a5c00-0000-7000-8000-0000000000e2';
    const photo = (id: string, itemKey: string | null, seq: number) =>
      photoFileRowSchema.parse({
        id,
        company_id: COMPANY_ID,
        relatorio_id: RELATORIO_ID,
        kind: 'photo',
        sha256: 'c'.repeat(64),
        mime: 'image/jpeg',
        size: 1000,
        uploaded_at: null,
        variants: null,
        removed_at: null,
        captured_at: T(40 + seq),
        tz_offset: -180,
        coords: null,
        local_seq: seq,
        block_id: BLOCK_1_ID,
        item_key: itemKey,
        caption: null,
        reading_kind: null,
        reading_target: null,
        reading_status: 'none',
      });
    const state = new Map(fixtureState);
    state.set(entityKey('file', ITEM_PHOTO), photo(ITEM_PHOTO, 'bornes', 1));
    state.set(entityKey('file', TEST_PHOTO), photo(TEST_PHOTO, null, 2));
    const snapshot = buildSnapshot(state, RELATORIO_ID);
    const meta = { step: 'verificacoes' as const, testKey: null, words: { atividades: [], locais: [] }, registry: [] };
    expect(contextCaption({ block_id: BLOCK_1_ID, item_key: 'bornes' }, snapshot, meta)).toBe('Detalhe da verificação de bornes e conexões das baterias realizada no no-break NB-01 da Cabine principal');
    expect(contextCaption({ block_id: BLOCK_1_ID, item_key: null }, snapshot, { ...meta, step: 'ensaios' })).toBe('Detalhe dos ensaios de resistência de isolação realizados no no-break NB-01 da Cabine principal');
    expect(photoItemLine({ block_id: BLOCK_1_ID, item_key: 'bornes' }, snapshot)).toEqual({ head: 'Item 2 · Bornes e conexões das baterias', result: 'NC', nc: true, text: 'Item 2 · Bornes e conexões das baterias · NC' });
    const order = documentPhotoOrder(snapshot);
    expect(order.sheets.get(BLOCK_1_ID)).toMatchObject({ plate: [], items: [{ id: ITEM_PHOTO }], other: [{ id: TEST_PHOTO }] });
    expect(order.order.map((row) => row.id)).toEqual([ITEM_PHOTO, TEST_PHOTO]);
  });

  it('the parecer: a company sheet reprovado by its own criteria gives Não apto, named by its TAG', () => {
    expect(derivedParecer(fixtureSnapshot)).toBe('nao_apto');
    expect(composeParecer(fixtureSnapshot).text).toContain('1 ficha foi reprovada por leituras fora do critério de aceitação (NB-01).');
  });

  it('a pre-issue row names a company sheet without a TAG by its version\'s label', () => {
    const block = fixtureSnapshot.blocks.find((row) => row.id === BLOCK_3_ID)!;
    const stale: BlockRow = {
      ...block,
      concluded_by: { actor_id: USER_ID, at: T(51) },
      sheet: {
        ...block.sheet,
        conclusion: { result: cellOf('aprovado'), restriction: cellOf('sem_restricoes'), text: cellOf('Texto composto antes da mudança'), text_status: cellOf('confirmed'), text_basis: cellOf('deadbeef') },
      },
    };
    const snapshot = {
      ...fixtureSnapshot,
      blocks: fixtureSnapshot.blocks.map((row) => (row.id === BLOCK_3_ID ? stale : row)),
      equipment: fixtureSnapshot.equipment.map((row) => (row.id === EQUIPMENT_3_ID ? { ...row, tag: '' } : row)),
    };
    const rows = preIssue(snapshot, undefined, { now: new Date(T(55)) }).filter((row) => row.kind === 'conclusion_stale');
    expect(rows.map((row) => row.text)).toEqual(['Texto de conclusão desatualizado: Fonte auxiliar']);
  });

  it('instrumentRangeFor reads the range picked on a company sheet\'s test through the context', () => {
    const INSTRUMENT = '019a5c00-0000-7000-8000-0000000000d1';
    const testKey = DEFINITION_1.tests[0]!.key;
    const block = fixtureSnapshot.blocks.find((row) => row.id === BLOCK_1_ID)!;
    const picked: BlockRow = { ...block, sheet: { ...block.sheet, test: { ...block.sheet.test, [testKey]: { ...(block.sheet.test[testKey] ?? { cells: {} }), instrument: cellOf({ instrument_id: INSTRUMENT, code: '2E' }) } } } };
    const row = { id: INSTRUMENT, range_isolacao: { raw: '2', unit: 'TΩ' }, range_resistencia_contato: null };
    expect(instrumentRangeFor(picked, [row], testKey, snapshotDefinitionContext(fixtureSnapshot))).toEqual({ raw: '2', unit: 'TΩ' });
    // Without the context a company block resolves no definition, so no range.
    expect(instrumentRangeFor(picked, [row], testKey, EMPTY_DEFINITION_CONTEXT)).toBeNull();
  });
});

describe('Story 14.6 review: blocks born at a version', () => {
  const both = fold([typeCreate(TYPE_1_ID), versionCreate(VERSION_1_ID, TYPE_1_ID, 1), versionCreate(VERSION_2_ID, TYPE_1_ID, 2, DEFINITION_2)]);
  const ctx = definitionContextOf(both);

  it('newEquipmentBlock at v1 and v2: the config names the version, the TAG takes the type\'s prefix, and the create folds', () => {
    const location = { kind: 'cabine' as const, name: 'Cabine principal' };
    for (const version of [1, 2]) {
      const definition = getDefinitionIn(ctx, SEED_VERSION, TYPE_1, version);
      const blockId = `019a5c00-0000-7000-8000-0000000000c${version}`;
      const { equipment, block } = newEquipmentBlock({
        blockId,
        equipmentId: `019a5c00-0000-7000-8000-0000000000b${version}`,
        relatorioId: RELATORIO_ID,
        projectId: PROJECT_ID,
        locationId: CABINE_ID,
        type: TYPE_1,
        tag: suggestTag(TYPE_1, [], definition),
        seedVersion: SEED_VERSION,
        orderKey: `b${version}`,
        typeVersion: version,
        definitions: ctx,
        // Story 24.21: the reuse key takes the company type's own prefix at the local.
        placement: { location, equipment: [] },
      });
      expect(typeVersionOf(block.config)).toEqual({ version, id: version === 1 ? VERSION_1_ID : VERSION_2_ID });
      expect(Object.keys((block.config as { sub_blocks: object }).sub_blocks)).toEqual(definition.sub_blocks);
      expect(equipment.tag).toBe('NB-01');
      expect(equipment.reuse_key).toBe('NB-PRINCIPAL');
      expect(fold([op('create', 'relatorio', `block/${blockId}`, block)], both).get(entityKey('block', blockId))).toMatchObject({ block_type: TYPE_1 });
    }
  });

  it('a template built on v1 instantiates at a v2 that drops a test and an item: the keys are gone and the creates fold', () => {
    const DROPPED: CompanyTypeDefinition = {
      ...structuredClone(DEFINITION_1),
      tests: [],
      checklist: DEFINITION_1.checklist!.filter((item) => item.key !== 'bornes'),
      criteria: DEFINITION_1.criteria.filter((criterion) => criterion.key !== 'isolacao'),
    };
    expect(validateTypeDraft(DROPPED)).toEqual([]);
    const v1 = fold([typeCreate(TYPE_1_ID), versionCreate(VERSION_1_ID, TYPE_1_ID, 1)]);
    const testKey = DEFINITION_1.tests[0]!.key;
    const v1Config = defaultBlockConfigIn(definitionContextOf(v1), SEED_VERSION, TYPE_1, 1);
    expect(v1Config.sub_blocks).toHaveProperty(testKey);
    const template: TemplateRow = {
      id: '019a5c00-0000-7000-8000-0000000000f1',
      name: 'No-break na v1',
      version: 1,
      seed_version: SEED_VERSION,
      skeleton: [{ ref: 'cab', kind: 'cabine', parent_ref: null, name: 'Cabine', agrupar_por_tipo: false }],
      blocks: [{ ...v1Config, sub_blocks: { ...v1Config.sub_blocks, [testKey]: { enabled: false } }, na_defaults: ['bornes'], quantity: 1, skeleton_location_ref: 'cab', section_text: null }],
      archived_at: null,
      removed_at: null,
    };
    const v2 = fold([versionCreate(VERSION_2_ID, TYPE_1_ID, 2, DROPPED)], v1);
    const { drafts } = instantiateTemplate(
      template,
      { id: PROJECT_ID },
      { service_start: null, service_end: null, existingEquipment: [], responsible_user_id: null, definitions: definitionContextOf(v2) },
      { newId: opId, actorId: USER_ID, companyId: COMPANY_ID },
    );
    const created = drafts.find((draft) => draft.path.startsWith('block/') && (draft.value as { block_type?: unknown }).block_type === TYPE_1)!.value as unknown as BlockRow;
    const config = created.config as { sub_blocks: Record<string, unknown>; na_defaults: string[]; type_version: number };
    expect(config.type_version).toBe(2);
    expect(config.sub_blocks).not.toHaveProperty(testKey);
    expect(Object.keys(config.sub_blocks)).toEqual(companySubBlocksOf(DROPPED));
    expect(config.na_defaults).toEqual([]);
    const ops = drafts.map((draft) => makeOp({ ...draft, device_id: DEVICE_ID }, { newId: opId, now: new Date(T(30)) }));
    expect(fold(ops, v2).get(entityKey('block', created.id))).toMatchObject({ block_type: TYPE_1, config: { type_version: 2 } });
  });
});

describe('Story 14.6 review: snapshots and the device fold', () => {
  it('a seeded-only relatório beside unreferenced type versions has no equipment_types and keeps its bytes', () => {
    const seeded = replay(replaySmall.log, { deadOpIds: replaySmall.deadOpIds });
    const types = [...fixtureState].filter(([key]) => key.startsWith('equipment_type'));
    expect(types).toHaveLength(5);
    const snapshot = buildSnapshot(new Map([...seeded, ...types]), replaySmall.relatorioId);
    expect('equipment_types' in snapshot).toBe(false);
    expect(serializeSnapshot(snapshot)).toBe(serializeSnapshot(buildSnapshot(seeded, replaySmall.relatorioId)));
  });

  it('leaves out a local op any seed-path rule refuses, on a seeded block too; a pulled one still throws', () => {
    const create = { ...replaySmall.log.find((o) => o.path.startsWith('block/') && o.kind === 'create')!, seq: 1 };
    const blockId = (create.value as { id: string }).id;
    const ref = { entity: 'block' as const, id: blockId };
    const outside = op('put', 'relatorio', `sheet/${blockId}/nameplate/campo_inexistente`, 'X', { company_id: create.company_id, relatorio_id: create.relatorio_id });
    const alone = materializeEntity(ref, [create], []);
    expect(alone).not.toBeNull();
    expect(materializeEntity(ref, [create], [outside])).toEqual(alone);
    expect(() => materializeEntity(ref, [create, { ...outside, seq: 2 }], [])).toThrow(SeedPathError);
  });
});

describe('Stories 23.10 and 23.11 (batch e23h): a test\'s "Como ensaiar" and recommendation on a company type', () => {
  // Synthetic texts (M-1: the base's texts never enter git).
  const HELP = { objective: 'Objetivo de exemplo.', instrument: 'Instrumento de exemplo.', procedure: 'Procedimento de exemplo.', standard: 'Norma de exemplo.', nr10: 'Pré-requisito de exemplo.' };
  const withTexts = (definition: CompanyTypeDefinition, help: Record<string, unknown> = HELP, recommendation: unknown = 'Recomendação de exemplo.'): CompanyTypeDefinition =>
    ({
      ...structuredClone(definition),
      tests: definition.tests.map((test) => ({ ...structuredClone(test), help, recommendation })),
      measurement_tests: definition.measurement_tests?.map((test) => ({ ...structuredClone(test), help, recommendation })),
    }) as CompanyTypeDefinition;

  it('"Duplicar" of a seeded definition carrying both keys (a fixture) carries them whole, in both grammars, and the copy publishes', () => {
    // The seeded grammars on the v13 transformer, the measurement grammar on the v13 CTA.
    for (const type of ['transformador_forca', 'chave_transferencia_automatica'] as const) {
      const seed = structuredClone(getDefinition('v13', 'cabine_primaria', type));
      const fixture = {
        ...seed,
        tests: seed.tests.map((test) => ({ ...test, help: HELP, recommendation: 'Trocar o componente.' })),
        ...(seed.measurement_tests === undefined ? {} : { measurement_tests: seed.measurement_tests.map((test) => ({ ...test, help: { procedure: 'Passos de exemplo.' }, recommendation: 'Refazer a medição.' })) }),
      };
      const copy = duplicateSeededDefinition('v13', type, fixture);
      const tests = [...copy.draft.tests, ...(copy.draft.measurement_tests ?? [])];
      expect(tests.length, type).toBeGreaterThan(0);
      expect(copy.draft.tests.map((test) => [test.help, test.recommendation])).toEqual(fixture.tests.map(() => [HELP, 'Trocar o componente.']));
      expect((copy.draft.measurement_tests ?? []).map((test) => [test.help, test.recommendation])).toEqual((fixture.measurement_tests ?? []).map(() => [{ procedure: 'Passos de exemplo.' }, 'Refazer a medição.']));
      expect(validateTypeDraft(copy.draft), type).toEqual([]);
    }
    expect(getDefinition('v13', 'cabine_primaria', 'transformador_forca').tests.length).toBeGreaterThan(0);
    expect(getDefinition('v13', 'cabine_primaria', 'chave_transferencia_automatica').measurement_tests!.length).toBeGreaterThan(0);
    // The seeded path is the same core: a seeded definition carries neither key, so neither comes.
    const plain = duplicateSeededType('v13', 'chave_transferencia_automatica');
    expect(plain).toEqual(duplicateSeededDefinition('v13', 'chave_transferencia_automatica', getDefinition('v13', 'cabine_primaria', 'chave_transferencia_automatica')));
    expect(JSON.stringify(plain.draft)).not.toMatch(/"(help|recommendation)"/);
  });

  it('"Duplicar" of a published company version carries both keys whole', () => {
    const definition = withTexts(DEFINITION_1);
    const copy = duplicateCompanyType({ type_id: TYPE_1_ID, version: 1, definition });
    expect(copy.draft.tests).toEqual(definition.tests);
    expect(copy.draft.measurement_tests).toEqual(definition.measurement_tests);
    expect(validateTypeDraft(copy.draft)).toEqual([]);
  });

  it('publishes a version whose tests carry the eight headings and a recommendation; the row keeps the definition as written', () => {
    const eight = { objective: 'A', instrument: 'B', voltage: 'C', connections: 'D', procedure: 'E', criterion: 'F', standard: 'G', nr10: '  H com espaços  ' };
    const definition = withTexts(DEFINITION_1, eight);
    const state = fold([typeCreate(TYPE_1_ID), versionCreate(VERSION_1_ID, TYPE_1_ID, 1, definition)]);
    expect((state.get(entityKey('equipment_type_version', VERSION_1_ID)) as EquipmentTypeVersionRow).definition).toEqual(definition);
    // The block definition the readers take carries both keys.
    const adapted = asBlockDefinition({ id: VERSION_1_ID, type_id: TYPE_1_ID, version: 1, definition });
    expect(adapted.tests[0]!.help).toEqual(eight);
    expect(adapted.measurement_tests![0]!.recommendation).toBe('Recomendação de exemplo.');
  });

  it('an over-cap heading or recommendation: the draft names it inline, "Publicar" waits, and the version create is refused', () => {
    const atCap = 'x'.repeat(TEST_TEXT_MAX_LENGTH);
    const accepted = withTexts(DEFINITION_1, { objective: atCap }, atCap);
    expect(validateTypeDraft(accepted)).toEqual([]);
    const overHelp = withTexts(DEFINITION_1, { objective: `${atCap}x`, procedure: `${atCap}x` });
    const issues = validateTypeDraft(overHelp);
    expect(issues.map((issue) => issue.path)).toEqual([
      ['tests', 0, 'help', 'objective'],
      ['tests', 0, 'help', 'procedure'],
      ['measurement_tests', 0, 'help', 'objective'],
      ['measurement_tests', 0, 'help', 'procedure'],
    ]);
    expect(issues[0]).toMatchObject({ part: 'ensaios', message: `${DEFINITION_1.tests[0]!.label}: cada tópico de Como ensaiar tem até 1.000 caracteres.` });
    expect(publishBlockedText(issues)).toMatch(/^4 avisos antes de publicar: Ensaios › /);
    const overRecommendation = withTexts(DEFINITION_1, HELP, `${atCap}x`);
    expect(validateTypeDraft(overRecommendation).map((issue) => [issue.path, issue.message])).toEqual([
      [['tests', 0, 'recommendation'], `${DEFINITION_1.tests[0]!.label}: a recomendação se reprovado tem até 1.000 caracteres.`],
      [['measurement_tests', 0, 'recommendation'], 'Tensões medidas: a recomendação se reprovado tem até 1.000 caracteres.'],
    ]);
    const state = fold([typeCreate(TYPE_1_ID)]);
    for (const definition of [overHelp, overRecommendation]) expect(() => fold([versionCreate(VERSION_1_ID, TYPE_1_ID, 1, definition)], state)).toThrow(SeedPathError);
    expect(typeOf(fold([versionCreate(VERSION_1_ID, TYPE_1_ID, 1, accepted)], state), TYPE_1_ID).latest_version).toBe(1);
  });

  it('the version create (assertVersionCreate) refuses a blank heading, a non-string heading, an unknown heading and a blank recommendation', () => {
    const state = fold([typeCreate(TYPE_1_ID)]);
    for (const definition of [
      withTexts(DEFINITION_1, { objective: '' }),
      withTexts(DEFINITION_1, { objective: '   ' }),
      withTexts(DEFINITION_1, { objective: 3 }),
      withTexts(DEFINITION_1, { outro: 'Texto.' }),
      withTexts(DEFINITION_1, HELP, ' '),
      withTexts(DEFINITION_1, HELP, 7),
    ]) {
      expect(() => fold([versionCreate(VERSION_1_ID, TYPE_1_ID, 1, definition)], state), JSON.stringify(definition.tests[0]!.help)).toThrow(SeedPathError);
      expect(validateTypeDraft(definition).length).toBeGreaterThan(0);
    }
  });
});
