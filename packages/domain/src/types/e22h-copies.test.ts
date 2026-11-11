import { describe, expect, it } from 'vitest';
import { COMPANY_ID, DEFINITION_1, DEVICE_ID, TYPE_1_ID, USER_ID, VERSION_1_ID } from '../../fixtures/company-types/op-log.ts';
import { applyOp, entityKey, type EntityKey } from '../ops/apply.ts';
import { opSchema } from '../ops/op.ts';
import { oilDerivedNaKeys, oilRuleOf } from '../relatorio/oil-rule.ts';
import { effectiveCriterion, evaluatedCells, evaluateTest } from '../relatorio/reading-evaluation.ts';
import { isVectorGroupField } from '../relatorio/vector-group.ts';
import { companyBlockType } from '../schemas/block-config.ts';
import { emptySheet, equipmentTypeVersionRowSchema, type BlockRow, type Cell, type EntityRow, type EquipmentTypeVersionRow } from '../schemas/entities.ts';
import { compareCriterion } from '../seed/criteria.ts';
import { blockDefinitionIn, definitionContext, definitionContextOf, equipmentTypesOf, getDefinition, versionRowIn, type DefinitionContext } from '../seed/definitions.ts';
import type { BlockDefinition } from '../seed/schema.ts';
import { asBlockDefinition } from './block-definition.ts';
import { companyTypeDefinitionSchema, criterionRulesFor, type CompanyTypeDefinition } from './definition.ts';
import { plateCriterionOf, removeDraftEntry, updateDraftField } from './draft-edit.ts';
import { duplicateSeededType, newEquipmentTypeRow, nextTypeVersion } from './duplicate.ts';
import { latestCompanyTypeVersion, latestVersionRow, recordedTypeVersions } from './list.ts';
import { validateTypeDraft } from './validate.ts';

/*
 * Fix batch e22h (Epic 22 wave C integrated review, `epic-22-wave-c-integrated-review-2026-11-07.md`):
 * S1 (coordinator's decision: a copy keeps its source's judging behaviour), N1 (`pass_fail` and `±`
 * on a choice row judge nothing), N2 (the web's derivations as kernel helpers), N3 (a published
 * version is read with its structural shape) and N9 (the vector-group field of a copy).
 */

const SEED = 'v12';
const OP = '019a5c00-0e22-7000-8000-000000000001';
const USER = USER_ID;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: OP });
const measured = (raw: string, unit: string | null) => cell({ raw, unit, state: 'measured' });

/**
 * The copy of a seeded type published untouched as version 1: its version row and its definition
 * as every reader takes it, through the real path (review e22h, verification gap 6): the row parsed
 * by the tolerant row schema inside the op, the `equipment_type_version` create folded by
 * `applyOp` (its strict check), and the definition resolved from the folded state by the block's
 * own `{version, id}` reference. A strip of the bands, the class field or the oil rule anywhere on
 * that path turns the judging tests below red.
 */
function publishedCopy(blockType: 'quadro_eletrico' | 'tc' | 'tp' | 'transformador_forca'): { row: EquipmentTypeVersionRow; definition: BlockDefinition; ctx: DefinitionContext } {
  const draft = duplicateSeededType(SEED, blockType).draft;
  expect(validateTypeDraft(draft), blockType).toEqual([]);
  const stored = equipmentTypeVersionRowSchema.parse({ id: VERSION_1_ID, type_id: TYPE_1_ID, version: 1, definition: draft, published_by: USER, published_at: '2026-11-07T12:00:00.000Z' });
  const type = newEquipmentTypeRow(TYPE_1_ID, { derived_from: { seed_version: SEED, block_type: blockType }, draft });
  const publish = opSchema.parse({
    op_id: OP,
    kind: 'create',
    scope: 'company',
    company_id: COMPANY_ID,
    project_id: null,
    relatorio_id: null,
    path: `equipment_type_version/${VERSION_1_ID}`,
    value: stored,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: USER,
    device_id: DEVICE_ID,
    client_ts: '2026-11-07T12:00:00.000Z',
  });
  const state = applyOp(new Map<EntityKey, EntityRow>([[entityKey('equipment_type', TYPE_1_ID), type]]), publish);
  const ctx = definitionContextOf(state);
  const row = versionRowIn(ctx, TYPE_1_ID, { version: 1, id: VERSION_1_ID });
  const definition = blockDefinitionIn(ctx, blockOf(companyBlockType(TYPE_1_ID), {}));
  expect(row, blockType).not.toBeNull();
  expect(definition, blockType).not.toBeNull();
  return { row: row!, definition: definition!, ctx };
}

/** A block of `blockType` with `plate` on its nameplate and `cells` (row/col) on test `testKey`. */
function blockOf(blockType: string, plate: Record<string, unknown>, testKey?: string, cells: Record<string, Cell> = {}): BlockRow {
  const sheet = emptySheet();
  for (const [key, value] of Object.entries(plate)) sheet.nameplate[key] = cell(value);
  if (testKey !== undefined) {
    const test: { cells: Record<string, Record<string, Cell>> } = { cells: {} };
    for (const [address, value] of Object.entries(cells)) {
      const [row, col] = address.split('/') as [string, string];
      test.cells[row] = { ...test.cells[row], [col]: value };
    }
    (sheet.test as Record<string, unknown>)[testKey] = test;
  }
  const config = blockType.startsWith('type:') ? { block_type: blockType, sub_blocks: {}, na_defaults: [], type_version: 1, type_version_id: VERSION_1_ID } : { block_type: blockType, sub_blocks: {}, na_defaults: [] };
  return { id: '019a5c00-0e22-7000-8000-0000000000b1', block_type: blockType, seed_version: SEED, config, sheet } as unknown as BlockRow;
}

describe('e22h S1: a copy published untouched judges as its source on the same readings', () => {
  it('Quadro elétrico: a 380 V board at 45 to 60 MΩ is Conforme at >=0,5 MΩ (NBR 5410), the band carried', () => {
    const source = getDefinition(SEED, 'cabine_primaria', 'quadro_eletrico');
    const { definition } = publishedCopy('quadro_eletrico');
    const readings = ['50', '60', '55', '45'];
    const cells = Object.fromEntries(readings.map((raw, row) => [`${row}/1`, measured(raw, 'MΩ')]));
    const verdicts = (def: BlockDefinition, blockType: string, volts: string, on = cells) => {
      const block = blockOf(blockType, { tensao_nominal: { raw: volts, unit: 'V', state: 'measured' } }, 'isolacao', on);
      const evaluation = evaluateTest(block, def, def.tests.find((test) => test.key === 'isolacao')!);
      return { criterion: evaluation.criterionText, source: evaluation.sourceName, verdicts: evaluatedCells([evaluation]).filter((c) => c.state === 'measured').map((c) => c.verdict) };
    };
    const seeded = verdicts(source, 'quadro_eletrico', '380');
    const copy = verdicts(definition, companyBlockType(TYPE_1_ID), '380');
    expect(seeded.verdicts).toEqual(['within', 'within', 'within', 'within']);
    expect(copy).toEqual(seeded);
    expect(copy.source).toBe('NBR 5410');
    // The band boundary: 0,8 MΩ is within up to 500 V (>=0,5 MΩ) and out at 690 V (>=1 MΩ), on both.
    const low = Object.fromEntries(readings.map((_, row) => [`${row}/1`, measured('0.8', 'MΩ')]));
    for (const volts of ['500', '501', '690']) expect(verdicts(definition, companyBlockType(TYPE_1_ID), volts, low), volts).toEqual(verdicts(source, 'quadro_eletrico', volts, low));
    expect(verdicts(definition, companyBlockType(TYPE_1_ID), '500', low).verdicts).toEqual(['within', 'within', 'within', 'within']);
    expect(verdicts(definition, companyBlockType(TYPE_1_ID), '501', low).verdicts).toEqual(['out', 'out', 'out', 'out']);
    // SELV/PELV SIM picks 0,25 MΩ on both.
    const selv = (def: BlockDefinition, blockType: string) => effectiveCriterion(blockOf(blockType, { circuito_selv_pelv: 'SIM' }), def.tests[0]!)?.value;
    expect(selv(definition, companyBlockType(TYPE_1_ID))).toBe(0.25);
    expect(selv(definition, companyBlockType(TYPE_1_ID))).toBe(selv(source, 'quadro_eletrico'));
  });

  it('TC and TP: the accuracy class carried; a 10P TC at 2 % passes, a 0,3 TC at 0,4 % fails, as on the source', () => {
    const judged = (blockType: 'tc' | 'tp', cls: string | null, deviation: number) => {
      const source = getDefinition(SEED, 'cabine_primaria', blockType);
      const { definition } = publishedCopy(blockType);
      const plate = cls === null ? {} : { exatidao: cls };
      const of = (def: BlockDefinition, type: string) => {
        const criterion = effectiveCriterion(blockOf(type, plate), def.tests.find((test) => test.key === 'relacao_transformacao')!)!;
        return { value: criterion.value, operator: criterion.operator, pass: compareCriterion({ value: deviation, unit: '%' }, criterion) };
      };
      const copy = of(definition, companyBlockType(TYPE_1_ID));
      expect(copy, `${blockType} ${cls}`).toEqual(of(source, blockType));
      return copy;
    };
    expect(judged('tc', '10P', 2)).toEqual({ value: 3, operator: '±', pass: true });
    expect(judged('tc', '0,3', 0.4)).toEqual({ value: 0.3, operator: '±', pass: false });
    expect(judged('tc', '5P', 1).pass).toBe(true);
    expect(judged('tc', '5P', 1.01).pass).toBe(false);
    expect(judged('tp', '6P', 5.9).pass).toBe(true);
    expect(judged('tp', '3P', 3.1).pass).toBe(false);
    // No class on the plate: the copy's own row (± 0,5 %), as the seed's criterion.
    expect(judged('tc', null, 0.5)).toEqual({ value: 0.5, operator: '±', pass: true });
  });

  it('transformador de força: the oil rule derives the same NA items, and the vector-group field is recognized', () => {
    const source = getDefinition(SEED, 'cabine_primaria', 'transformador_forca');
    const { definition, ctx } = publishedCopy('transformador_forca');
    const rule = source.oil_rule!;
    expect(definition.oil_rule).toEqual(rule);
    const company = companyBlockType(TYPE_1_ID);
    expect(oilRuleOf(blockOf(company, {}), ctx)).toEqual(rule);
    const options = source.nameplate.find((field) => field.key === rule.field)!.options!;
    const dry = options.find((option) => !rule.oil_values.includes(option) && !(rule.full_values ?? []).includes(option))!;
    for (const value of [dry, rule.oil_values[0]!]) {
      const copyKeys = [...oilDerivedNaKeys(blockOf(company, { [rule.field]: value }), ctx)].sort();
      const seedKeys = [...oilDerivedNaKeys(blockOf('transformador_forca', { [rule.field]: value }), ctx)].sort();
      expect(copyKeys, value).toEqual(seedKeys);
    }
    expect(oilDerivedNaKeys(blockOf(company, { [rule.field]: dry }), ctx).size).toBeGreaterThan(0);
    const group = definition.nameplate.find((field) => field.key === 'ligacao_secundaria')!;
    expect(isVectorGroupField(company, group)).toBe(true);
    expect(isVectorGroupField('transformador_forca', group)).toBe(true);
  });

  it('every library and FO.SERV-03 type of the seed copies to a draft that publishes as it is', () => {
    for (const type of equipmentTypesOf(SEED)) expect(validateTypeDraft(duplicateSeededType(SEED, type).draft), type).toEqual([]);
  });

  it('fix batch e24x (G2): every type of seed v14 copies to a draft that publishes as it is, its strict schema too', () => {
    for (const type of equipmentTypesOf('v14')) {
      const draft = duplicateSeededType('v14', type).draft;
      expect(validateTypeDraft(draft), type).toEqual([]);
      expect(companyTypeDefinitionSchema.safeParse(draft).success, type).toBe(true);
    }
  });

  it('the TC and TP copies keep their oil rule too, and every copy carries the seed bands, class field and rule as data', () => {
    for (const type of ['quadro_eletrico', 'tc', 'tp', 'transformador_forca', 'disjuntor_mt'] as const) {
      const seeded = getDefinition(SEED, 'cabine_primaria', type);
      const copy = duplicateSeededType(SEED, type).draft;
      expect(copy.tests.map((test) => [test.criterion_bands, test.criterion_class_field]), type).toEqual(seeded.tests.map((test) => [test.criterion_bands, test.criterion_class_field]));
      expect(copy.oil_rule, type).toEqual(seeded.oil_rule);
      expect(companyTypeDefinitionSchema.safeParse(copy).success, type).toBe(true);
    }
  });
});

describe('e22h S1: the Critérios tab reads the plate-picked criterion (plateCriterionOf)', () => {
  it('a banded row says the plate decides and its row judges nothing; a class-field row judges only without a class', () => {
    const quadro = duplicateSeededType(SEED, 'quadro_eletrico').draft;
    const at = quadro.criteria.findIndex((criterion) => criterion.key === quadro.tests[0]!.criterion_key);
    expect(plateCriterionOf(quadro, at)).toEqual({
      lead: 'Escolhido pela placa: a faixa de tensão do campo TENSÃO NOMINAL julga cada leitura.',
      lines: expect.arrayContaining(['até 500 V: >=0,5 MΩ · NBR 5410', 'até 1000 V: >=1 MΩ · NBR 5410', 'acima de 1000 V: critério não avaliado']) as unknown as string[],
      rowJudges: false,
      rowNote: 'Esta linha não julga nenhuma leitura: a faixa da placa decide. Editar as faixas virá depois.',
    });
    expect(plateCriterionOf(quadro, at)!.lines[0]).toMatch(/SIM: >=0,25 MΩ · NBR 5410$/);
    const tc = duplicateSeededType(SEED, 'tc').draft;
    const ratio = tc.criteria.findIndex((criterion) => criterion.key === tc.tests.find((test) => test.key === 'relacao_transformacao')!.criterion_key);
    const view = plateCriterionOf(tc, ratio)!;
    expect(view.rowJudges).toBe(true);
    expect(view.lines).toEqual(['classe de medição (0,3 · 0,6 · 1,2…): ± o valor da classe, em %', '3P: ±3 %', '5P: ±1 %', '6P: ±6 %', '10P: ±3 %']);
    expect(view.rowNote).toBe('Esta linha julga só enquanto a placa não informa a classe no campo EXATIDÃO.');
    // A row no plate-picking test names: none (the TC's insulation row).
    const plain = tc.criteria.findIndex((criterion) => criterion.key !== tc.criteria[ratio]!.key);
    expect(plain === -1 ? null : plateCriterionOf(tc, plain)).toBeNull();
  });
});

describe('e22h S1: a broken plate reference is said in pt-BR, and removing its field or item keeps the copy publishable', () => {
  it('a class field made text, a band field made text, an oil select made text', () => {
    const tc = duplicateSeededType(SEED, 'tc').draft;
    const exatidao = tc.nameplate.findIndex((field) => field.key === 'exatidao');
    const asText = updateDraftField(tc, exatidao, { kind: 'text' });
    expect(validateTypeDraft(asText).map((issue) => [issue.part, issue.message])).toEqual([
      ['ensaios', 'Relação de transformação: a classe de exatidão é lida do campo EXATIDÃO da placa; mantenha esse campo como uma lista.'.replace('Relação de transformação', tc.tests.find((test) => test.key === 'relacao_transformacao')!.label)],
    ]);
    const quadro = duplicateSeededType(SEED, 'quadro_eletrico').draft;
    const voltage = quadro.nameplate.findIndex((field) => field.key === 'tensao_nominal');
    const issues = validateTypeDraft(updateDraftField(quadro, voltage, { kind: 'text' }));
    expect(issues.map((issue) => issue.message)).toEqual([`${quadro.tests[0]!.label}: o critério é escolhido pela tensão do campo TENSÃO NOMINAL da placa; mantenha esse campo como um número em V.`]);
    const tf = duplicateSeededType(SEED, 'transformador_forca').draft;
    const oilField = tf.nameplate.findIndex((field) => field.key === tf.oil_rule!.field);
    const oilIssues = validateTypeDraft(updateDraftField(tf, oilField, { kind: 'text' }));
    expect(oilIssues[0]).toMatchObject({ part: 'placa', path: ['oil_rule', 'field'] });
    expect(oilIssues[0]!.message).toMatch(/^A regra do óleo lê o campo .+ da placa; mantenha esse campo como uma lista\.$/);
  });

  it('removing the oil field drops the rule; removing an oil item drops it from the rule; both still publish', () => {
    const tf = duplicateSeededType(SEED, 'transformador_forca').draft;
    const rule = tf.oil_rule!;
    const withoutField = removeDraftEntry(tf, 'nameplate', tf.nameplate.findIndex((field) => field.key === rule.field));
    expect(withoutField.oil_rule).toBeUndefined();
    const item = (tf.checklist ?? []).findIndex((entry) => entry.key === rule.items[0]);
    const withoutItem = removeDraftEntry(tf, 'checklist', item);
    expect(withoutItem.oil_rule?.items ?? []).not.toContain(rule.items[0]);
    for (const draft of [withoutField, withoutItem]) expect(validateTypeDraft(draft)).toEqual([]);
  });

  it('review e22h finding 4: removing only the SELV/PELV field keeps the voltage bands; removing the voltage field drops them', () => {
    const quadro = duplicateSeededType(SEED, 'quadro_eletrico').draft;
    const bandsOf = (draft: CompanyTypeDefinition) => draft.tests.find((test) => test.key === 'isolacao')!.criterion_bands;
    const source = bandsOf(quadro)!;
    const selvField = quadro.nameplate.findIndex((field) => field.key === source.selv_field);
    const withoutSelv = removeDraftEntry(quadro, 'nameplate', selvField) as CompanyTypeDefinition;
    expect(bandsOf(withoutSelv)).toEqual({ field: source.field, bands: source.bands });
    expect(validateTypeDraft(withoutSelv)).toEqual([]);
    // It still judges by the band: 0,8 MΩ at 380 V is within (>=0,5 MΩ), never out at the test's own "> 400 MΩ".
    const row: EquipmentTypeVersionRow = { id: VERSION_1_ID, type_id: TYPE_1_ID, version: 1, definition: withoutSelv, published_by: USER, published_at: '2026-11-07T12:00:00.000Z' };
    const definition = asBlockDefinition(row);
    const block = blockOf(companyBlockType(TYPE_1_ID), { tensao_nominal: { raw: '380', unit: 'V', state: 'measured' } }, 'isolacao', { '0/1': measured('0.8', 'MΩ') });
    const evaluation = evaluateTest(block, definition, definition.tests.find((test) => test.key === 'isolacao')!);
    expect(evaluatedCells([evaluation]).filter((c) => c.state === 'measured').map((c) => c.verdict)).toEqual(['within']);
    expect(effectiveCriterion(block, definition.tests.find((test) => test.key === 'isolacao')!)?.value).toBe(0.5);
    // The voltage field takes the whole bands with it.
    const voltage = quadro.nameplate.findIndex((field) => field.key === source.field);
    const withoutVoltage = removeDraftEntry(quadro, 'nameplate', voltage) as CompanyTypeDefinition;
    expect(bandsOf(withoutVoltage)).toBeUndefined();
    expect(validateTypeDraft(withoutVoltage)).toEqual([]);
  });
});

describe('e22h N1: pass_fail only on a row no test names, ± only on the ratio deviation', () => {
  // Story 24.18 (2026-11-11): "nominal ± %" follows "entre" wherever it may, never on the ratio's deviation.
  const comparisons = ['>', '<', '>=', '<=', 'between', 'nominal_pct'];
  // DEFINITION_1's measurement table with its row made a choice (as the batch review's test built it).
  const choiceTable: CompanyTypeDefinition = {
    ...DEFINITION_1,
    measurement_tests: [
      {
        ...DEFINITION_1.measurement_tests![0]!,
        rows: [{ key: 'estado', label: 'Estado do banco', kind: 'choice', options: [{ key: 'bom', label: 'Bom' }, { key: 'ruim', label: 'Ruim' }] }],
        criteria: [{ type: 'absolute', seeded: 'tensao_saida', rows: ['estado'], source: { name: 'Manual do fabricante', edition: null } }],
      },
    ],
  };
  const withRule = (definition: CompanyTypeDefinition, key: string, operator: '±' | 'pass_fail'): CompanyTypeDefinition => ({
    ...definition,
    criteria: definition.criteria.map((criterion) => (criterion.key === key ? { key: criterion.key, label: criterion.label, operator, value: 1, unit: criterion.unit, type: operator === '±' ? 'deviation_between' : 'pass_fail', source: criterion.source } : criterion)),
  });
  const nameOf = (key: string) => DEFINITION_1.criteria.find((criterion) => criterion.key === key)!.label;

  it('a choice row takes neither; an unused row takes both; the ratio takes ± only', () => {
    expect(validateTypeDraft(choiceTable)).toEqual([]);
    expect(criterionRulesFor(choiceTable, 'tensao_saida')).toEqual(comparisons);
    expect(criterionRulesFor(choiceTable, 'sem_uso')).toEqual([...comparisons, '±', 'pass_fail']);
    expect(criterionRulesFor(null, 'x')).toEqual([...comparisons, '±', 'pass_fail']);
    const tc = duplicateSeededType(SEED, 'tc').draft;
    const ratioKey = tc.tests.find((test) => test.key === 'relacao_transformacao')!.criterion_key;
    expect(criterionRulesFor(tc, ratioKey)).toEqual(['>', '<', '>=', '<=', 'between', '±']);
  });

  it('the strict schema refuses pass_fail and ± on a choice row in pt-BR; ± on the ratio publishes', () => {
    const name = nameOf('tensao_saida');
    expect(validateTypeDraft(withRule(choiceTable, 'tensao_saida', 'pass_fail')).map((issue) => issue.message)).toEqual([`${name}: nenhum ensaio julga "aprovado ou reprovado"; escolha outra regra.`]);
    expect(validateTypeDraft(withRule(choiceTable, 'tensao_saida', '±')).map((issue) => issue.message)).toEqual([`${name}: a regra ± vale para o desvio da relação de transformação; escolha outra regra.`]);
    expect(companyTypeDefinitionSchema.safeParse(withRule(choiceTable, 'tensao_saida', 'pass_fail')).success).toBe(false);
    const tc = duplicateSeededType(SEED, 'tc').draft;
    const ratioKey = tc.tests.find((test) => test.key === 'relacao_transformacao')!.criterion_key;
    expect(validateTypeDraft(withRule(tc, ratioKey, '±'))).toEqual([]);
    expect(validateTypeDraft(withRule(tc, ratioKey, 'pass_fail')).map((issue) => issue.path)).toEqual([['criteria', tc.criteria.findIndex((criterion) => criterion.key === ratioKey), 'operator']]);
  });
});

describe('e22h N3: a published version is read with its structural shape', () => {
  it('a stored version the strict rules refuse (pass_fail on a reading) still parses and resolves; publishing it is refused', () => {
    const tc = duplicateSeededType(SEED, 'tc').draft;
    const ratioKey = tc.tests.find((test) => test.key === 'resistencia_contato' || test.key === 'isolacao')!.criterion_key;
    const tightened: CompanyTypeDefinition = { ...tc, criteria: tc.criteria.map((criterion) => (criterion.key === ratioKey ? { ...criterion, operator: 'pass_fail', type: 'pass_fail', value: 1 } : criterion)), future_key: { any: 1 } } as CompanyTypeDefinition;
    expect(companyTypeDefinitionSchema.safeParse(tightened).success).toBe(false);
    const stored = { id: VERSION_1_ID, type_id: TYPE_1_ID, version: 1, definition: tightened, published_by: USER, published_at: '2026-11-07T12:00:00.000Z' };
    const parsed = equipmentTypeVersionRowSchema.safeParse(stored);
    expect(parsed.success).toBe(true);
    const ctx = definitionContext([parsed.data!]);
    expect(ctx.versions.size).toBe(1);
    expect(asBlockDefinition(parsed.data!).label).toBe(tc.label);
    // A structural break is still refused (the tests not a list); review e22h finding 5: a nested shape is not checked here.
    expect(equipmentTypeVersionRowSchema.safeParse({ ...stored, definition: { ...tc, tests: 'isolacao' } }).success).toBe(false);
    // The fold's version create keeps the strict check.
    const state = new Map<EntityKey, EntityRow>();
    const type = newEquipmentTypeRow(TYPE_1_ID, { derived_from: { seed_version: SEED, block_type: 'tc' }, draft: tc });
    state.set(entityKey('equipment_type', TYPE_1_ID), type);
    // opSchema parses the value with the tolerant row schema, so the op itself is well formed.
    const op = opSchema.parse({
      op_id: OP,
      kind: 'create',
      scope: 'company',
      company_id: COMPANY_ID,
      project_id: null,
      relatorio_id: null,
      path: `equipment_type_version/${VERSION_1_ID}`,
      value: stored,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: USER,
      device_id: DEVICE_ID,
      client_ts: '2026-11-07T12:00:00.000Z',
    });
    expect(() => applyOp(state, op)).toThrow(/does not publish/);
  });

  it('review e22h finding 5: no nested refinement runs on read: two NC phrases on an item, a between without value_max', () => {
    const tc = duplicateSeededType(SEED, 'tc').draft;
    const item = tc.checklist![0]!;
    const criterion = tc.criteria[0]!;
    const loose = {
      ...tc,
      checklist: [{ ...item, nc_phrases: item.nc_phrases.slice(0, 2) }, ...tc.checklist!.slice(1)],
      criteria: [{ ...criterion, operator: 'between', type: 'absolute_min' }, ...tc.criteria.slice(1)],
    } as CompanyTypeDefinition;
    expect(companyTypeDefinitionSchema.safeParse(loose).success).toBe(false);
    const parsed = equipmentTypeVersionRowSchema.safeParse({ id: VERSION_1_ID, type_id: TYPE_1_ID, version: 1, definition: loose, published_by: USER, published_at: '2026-11-07T12:00:00.000Z' });
    expect(parsed.success).toBe(true);
    // Kept as written, and it resolves for a block naming it.
    expect(parsed.data!.definition.checklist![0]!.nc_phrases).toEqual(item.nc_phrases.slice(0, 2));
    expect((parsed.data!.definition.criteria[0] as { value_max?: number }).value_max).toBeUndefined();
    const ctx = definitionContext([parsed.data!]);
    const definition = blockDefinitionIn(ctx, blockOf(companyBlockType(TYPE_1_ID), {}));
    expect(definition?.label).toBe(tc.label);
    expect(definition?.checklist?.[0]?.nc_phrases).toEqual(item.nc_phrases.slice(0, 2));
  });
});

describe('e22h N2: the derivations the web read by hand', () => {
  it('latestVersionRow, latestCompanyTypeVersion, nextTypeVersion and recordedTypeVersions', () => {
    const { row, ctx } = publishedCopy('tc');
    expect(latestVersionRow(ctx, TYPE_1_ID)).toBe(row);
    expect(latestVersionRow(ctx, 'none')).toBeNull();
    expect(latestCompanyTypeVersion(ctx, companyBlockType(TYPE_1_ID))).toBe(1);
    expect(latestCompanyTypeVersion(ctx, 'tc')).toBeUndefined();
    expect(nextTypeVersion({ latest_version: 0 })).toBe(1);
    expect(nextTypeVersion({ latest_version: 2 })).toBe(3);
    const company = companyBlockType(TYPE_1_ID);
    expect([...recordedTypeVersions([{ block_type: 'tc' }, { block_type: company, type_version: 2 }, { block_type: company, type_version: 3 }])]).toEqual([[company, 2]]);
  });
});
