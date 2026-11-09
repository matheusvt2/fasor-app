import { describe, expect, it } from 'vitest';
import { conflictValueText } from '../merge/conflicts.ts';
import { applyOp, entityKey, SeedPathError, type EntityState } from '../ops/apply.ts';
import { opSchema, type Op } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { section9Layout, type SheetPart } from '../print/section-9.ts';
import { companyBlockType, type EquipmentBlockType } from '../schemas/block-config.ts';
import { emptySheet, type BlockRow, type Cell } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import type { AppliesWhen } from '../seed/measurement.ts';
import { blockDefinitionSchema, type BlockDefinition, type FieldDef } from '../seed/schema.ts';
import { blockDefinitionIn, EMPTY_DEFINITION_CONTEXT, getDefinition, snapshotDefinitionContext } from '../seed/definitions.ts';
import { defaultBlockConfigIn, startsOff } from '../seed/template.ts';
import { companySubBlocksOf, companyTypeDefinitionSchema, type CompanyTypeDefinition } from '../types/definition.ts';
import { duplicateSeededType } from '../types/duplicate.ts';
import { validateTypeDraft } from '../types/validate.ts';
import { APPLICABILITY_APPLIED, isTestInForce, testApplicability } from './applicability.ts';
import { conclusionFloor } from './conclusion.ts';
import { evaluateSheetMeasurements, measurementCounts } from './measurement-evaluation.ts';
import { evaluateSheetReadings } from './readings.ts';
import { sheetProgress } from './sheet-progress.ts';

/*
 * Story 23.9 (seed v13, decision J; contract 35): a test applies from the nameplate. No seeded v13
 * test carries `applies_when` (Stories 23.15 to 23.21 attach theirs), so the readers are exercised
 * through a company type duplicated from the v13 Chave seccionadora whose contact-resistance test
 * applies only to a seccionadora with fuses, the spec's fixture definition; the grammar through
 * synthetic definitions. Values invented.
 */

const hex = (n: number) => n.toString(16).padStart(12, '0');
const fixed = (n: number) => `019a5c23-0000-7000-8000-${hex(n)}`;
const COMPANY = fixed(1);
const USER = fixed(2);
const TYPE = fixed(3);
const VERSION = fixed(4);
const PROJECT = fixed(5);
const RELATORIO = fixed(6);
const CABINE = fixed(7);
const EQUIPMENT = fixed(8);
const BLOCK = fixed(9);
const COMPANY_TYPE = companyBlockType(TYPE);

const FUSED = 'SOB CARGA COM FUSÍVEIS';
const CONDITION: AppliesWhen = { op: 'in', field: 'tipo_seccionadora', values: [FUSED], unmet: 'sem fusíveis' };

/** The v13 seccionadora copied, its contact resistance applying only with fuses (the spec's fixture definition). */
function fusedCopy(condition: AppliesWhen = CONDITION): CompanyTypeDefinition {
  const draft = duplicateSeededType('v13', 'chave_seccionadora').draft;
  return { ...draft, tests: draft.tests.map((test) => (test.key === 'resistencia_contato' ? { ...test, applies_when: condition } : test)) };
}

let seq = 0;
function op(kind: 'create' | 'put', scope: 'company' | 'project' | 'relatorio', path: string, value: unknown, extra: Partial<Op> = {}): Op {
  seq += 1;
  return opSchema.parse({
    op_id: `019a5c23-0001-7000-8000-${hex(seq)}`,
    kind,
    scope,
    company_id: COMPANY,
    project_id: scope === 'project' ? PROJECT : null,
    relatorio_id: scope === 'relatorio' ? RELATORIO : null,
    path,
    value,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: USER,
    device_id: 'tablet-a',
    client_ts: `2026-11-08T10:${String(seq % 60).padStart(2, '0')}:00.000Z`,
    ...extra,
  });
}

function log(definition: CompanyTypeDefinition, tipo: string | null): Op[] {
  const subBlocks = Object.fromEntries(companySubBlocksOf(definition).map((key) => [key, { enabled: key !== 'ia_ip_display' }]));
  const steps: Op[] = [
    op('create', 'company', `equipment_type/${TYPE}`, { id: TYPE, derived_from: { seed_version: 'v13', block_type: 'chave_seccionadora' }, draft: definition, retired_at: null, removed_at: null, latest_version: 0 }),
    op('create', 'company', `equipment_type_version/${VERSION}`, { id: VERSION, type_id: TYPE, version: 1, definition, published_by: USER, published_at: '2026-11-08T10:00:00.000Z' }),
    op('create', 'company', `project/${PROJECT}`, { id: PROJECT, client_id: null, name: 'Unidade Norte', site: null, removed_at: null }),
    op('create', 'relatorio', `relatorio/${RELATORIO}`, {
      id: RELATORIO,
      project_id: PROJECT,
      template_id: null,
      template_version: null,
      seed_version: 'v13',
      status: 'rascunho',
      setup: { service_start: null, service_end: null, atividade: null, local: null, responsible_user_id: null, cover_photo_file_id: null, escopo: null, exclusions: null, additional_info: null, art_trt_number: null, instrument_ids: [], site_altitude_m: null, site_altitude_confirmed: false, next_intervention_date: null, next_intervention_justification: null },
      export: { scheme: 'por_local_e_tipo' },
      preview_file_id: null,
      removed_at: null,
    }),
    op('create', 'relatorio', `location/${CABINE}`, { id: CABINE, relatorio_id: RELATORIO, parent_id: null, kind: 'cabine', name: 'Cabine', order_key: 'a0', se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null }, env: { altitude_m: null, temperature_c: null, humidity_pct: null }, agrupar_por_tipo: false, removed_at: null }),
    op('create', 'project', `equipment/${EQUIPMENT}`, { id: EQUIPMENT, project_id: PROJECT, tag: 'SEC-01', type: COMPANY_TYPE, last_nameplate: null, removed_at: null }),
    op('create', 'relatorio', `block/${BLOCK}`, {
      id: BLOCK,
      relatorio_id: RELATORIO,
      location_id: CABINE,
      equipment_id: EQUIPMENT,
      block_type: COMPANY_TYPE,
      config: { block_type: COMPANY_TYPE, sub_blocks: subBlocks, na_defaults: [], type_version: 1, type_version_id: VERSION },
      seed_version: 'v13',
      order_key: 'a0',
      feeds_block_id: null,
      not_tested: null,
      concluded_by: null,
      sheet: emptySheet(),
      created_by: null,
      first_edited_at: null,
      last_modified_by: null,
      last_modified_at: null,
      removed_at: null,
    }),
  ];
  if (tipo !== null) steps.push(op('put', 'relatorio', `sheet/${BLOCK}/nameplate/tipo_seccionadora`, tipo));
  return steps;
}

function snapshotOf(ops: readonly Op[]): RelatorioSnapshot {
  return buildSnapshot(replay([...ops]), RELATORIO);
}

const blockOf = (snapshot: RelatorioSnapshot): BlockRow => snapshot.blocks.find((row) => row.id === BLOCK)!;
const definitionOf = (snapshot: RelatorioSnapshot): BlockDefinition => blockDefinitionIn(snapshotDefinitionContext(snapshot), blockOf(snapshot))!;
const sheetTests = (snapshot: RelatorioSnapshot) => evaluateSheetReadings(blockOf(snapshot), definitionOf(snapshot)).map((test) => test.testKey);
const printedBands = (snapshot: RelatorioSnapshot) =>
  section9Layout(snapshot, 9, 'RELATÓRIOS DOS ENSAIOS')!
    .subsections.flatMap((s) => s.sheets.flatMap((one) => one.parts))
    .flatMap((part: SheetPart) => (part.kind === 'table' ? [part.table.rows[0]!.cells[0]!.text] : []));
const applicabilityPut = (value: unknown, extra: Partial<Op> = {}) => op('put', 'relatorio', `sheet/${BLOCK}/test/resistencia_contato/applicability`, value, extra);

describe('23.9-UNIT a test made not applicable by the nameplate', () => {
  const base = log(fusedCopy(), 'SEM CARGA');

  it('the plate says no fuses: NA with the composed reason, absent from the evaluation, nothing missing, no floor, omitted from section 9', () => {
    const snapshot = snapshotOf(base);
    const block = blockOf(snapshot);
    const definition = definitionOf(snapshot);
    expect(testApplicability(block, definition, 'resistencia_contato')).toEqual({
      state: 'na',
      reason: 'Não se aplica: TIPO DE SECCIONADORA sem fusíveis.',
      phrase: 'TIPO DE SECCIONADORA sem fusíveis.',
      appliedText: 'A placa diz sem fusíveis.',
    });
    expect(testApplicability(block, definition, 'isolacao').state).toBe('always');
    expect(isTestInForce(block, definition, 'resistencia_contato')).toBe(false);
    expect(sheetTests(snapshot)).toEqual(['isolacao']);
    // Six insulation captures: the contact resistance counts nothing.
    expect(sheetProgress(snapshot, BLOCK).steps.ensaios.missing).toBe(6);
    expect(printedBands(snapshot)).not.toContain('ENSAIO DE RESISTÊNCIA ÔHMICA DE CONTATO');
    // A contact reading stored before the plate said no fuses never reaches the floor.
    const out = snapshotOf([...base, op('put', 'relatorio', `sheet/${BLOCK}/test/resistencia_contato/cell/0/0`, { raw: '900', unit: 'µΩ', state: 'measured' })]);
    expect(conclusionFloor(blockOf(out), definitionOf(out))).toBeNull();
  });

  it('"Aplicar este ensaio" stores one override: the test counts, judges and prints; a reload (replay) keeps it; "Seguir a placa" clears it', () => {
    const applied = snapshotOf([...base, applicabilityPut(APPLICABILITY_APPLIED)]);
    const block = blockOf(applied);
    expect(block.sheet.test.resistencia_contato?.applicability?.value).toBe('applied');
    expect(testApplicability(block, definitionOf(applied), 'resistencia_contato')).toMatchObject({ state: 'applied', appliedText: 'A placa diz sem fusíveis.' });
    expect(sheetTests(applied)).toEqual(['isolacao', 'resistencia_contato']);
    expect(sheetProgress(applied, BLOCK).steps.ensaios.missing).toBe(9);
    expect(printedBands(applied)).toContain('ENSAIO DE RESISTÊNCIA ÔHMICA DE CONTATO');
    const out = snapshotOf([...base, applicabilityPut(APPLICABILITY_APPLIED), op('put', 'relatorio', `sheet/${BLOCK}/test/resistencia_contato/cell/0/0`, { raw: '900', unit: 'µΩ', state: 'measured' })]);
    expect(conclusionFloor(blockOf(out), definitionOf(out))?.pair.result).toBe('reprovado');
    const cleared = snapshotOf([...base, applicabilityPut(APPLICABILITY_APPLIED), applicabilityPut(null)]);
    expect(testApplicability(blockOf(cleared), definitionOf(cleared), 'resistencia_contato').state).toBe('na');
  });

  it('a plate that meets the condition applies the test with no override, and a stored one stays harmless', () => {
    const fused = snapshotOf(log(fusedCopy(), FUSED));
    expect(testApplicability(blockOf(fused), definitionOf(fused), 'resistencia_contato').state).toBe('met');
    const harmless = snapshotOf([...log(fusedCopy(), FUSED), applicabilityPut(APPLICABILITY_APPLIED)]);
    expect(testApplicability(blockOf(harmless), definitionOf(harmless), 'resistencia_contato')).toEqual({ state: 'met', reason: null, phrase: null, appliedText: null });
    expect(sheetTests(harmless)).toEqual(['isolacao', 'resistencia_contato']);
  });

  it('an empty TIPO DE SECCIONADORA applies the test (the conservative reading); one the test needs makes it NA', () => {
    const empty = snapshotOf(log(fusedCopy(), null));
    expect(testApplicability(blockOf(empty), definitionOf(empty), 'resistencia_contato').state).toBe('met');
    const needs = snapshotOf(log(fusedCopy({ ...CONDITION, needs_value: true }), null));
    expect(testApplicability(blockOf(needs), definitionOf(needs), 'resistencia_contato')).toMatchObject({ state: 'na', reason: 'Não se aplica: TIPO DE SECCIONADORA sem valor.' });
  });

  it('the fold: the override is accepted as "applied" or null on a test with a condition, refused on any other value or test', () => {
    const state = replay(base);
    const key = entityKey('block', BLOCK);
    expect((applyOp(state, applicabilityPut('applied')).get(key) as BlockRow).sheet.test.resistencia_contato?.applicability?.value).toBe('applied');
    expect((applyOp(state, applicabilityPut(null)).get(key) as BlockRow).sheet.test.resistencia_contato?.applicability?.value).toBeNull();
    expect(() => applyOp(state, applicabilityPut('yes'))).toThrow(SeedPathError);
    expect(() => applyOp(state, applicabilityPut(true))).toThrow(SeedPathError);
    expect(() => applyOp(state, op('put', 'relatorio', `sheet/${BLOCK}/test/isolacao/applicability`, 'applied'))).toThrow(/no applicability condition/);
  });

  it('a seeded v13 test has no condition: its override is refused', () => {
    const seeded: BlockRow = { ...blockOf(snapshotOf(base)), block_type: 'chave_seccionadora', config: {} };
    const state: EntityState = new Map([[entityKey('block', BLOCK), seeded]]);
    expect(() => applyOp(state, applicabilityPut('applied'))).toThrow(SeedPathError);
  });

  it('two devices disagreeing (one applies, one follows the plate) meet the single-cell conflict, read in pt-BR', () => {
    const first = applicabilityPut('applied');
    const second = applicabilityPut(null, { device_id: 'tablet-b' });
    const state = replay([...base, first, second]);
    const stored = (state.get(entityKey('block', BLOCK)) as BlockRow).sheet.test.resistencia_contato!.applicability! as Cell;
    expect(stored.value).toBeNull();
    expect(stored.conflict?.value).toBe('applied');
    const path = { path: `sheet/${BLOCK}/test/resistencia_contato/applicability` };
    expect(conflictValueText(path, 'applied', undefined, EMPTY_DEFINITION_CONTEXT)).toBe('Aplicado por você');
    expect(conflictValueText(path, null, undefined, EMPTY_DEFINITION_CONTEXT)).toBe('Segue a placa');
  });
});

describe('23.9-UNIT the condition grammar', () => {
  const select: FieldDef = { key: 'tipo', label: 'TIPO DE SECCIONADORA', kind: 'select', options: ['SEM CARGA', FUSED] };
  const number: FieldDef = { key: 'mcov_kv', label: 'MCOV', kind: 'number', unit: 'kV' };
  const definitionWith = (condition: AppliesWhen): Pick<BlockDefinition, 'nameplate' | 'tests' | 'measurement_tests'> => ({
    nameplate: [select, number],
    tests: [{ ...getDefinition('v13', 'cabine_primaria', 'para_raio').tests[0]!, applies_when: condition }],
  });
  const plate = (values: Record<string, unknown>) => {
    const sheet = emptySheet();
    for (const [key, value] of Object.entries(values)) sheet.nameplate[key] = { value: value as Cell['value'], source_suggestion_id: null, op_id: fixed(900) };
    return { sheet };
  };
  const stateOf = (condition: AppliesWhen, values: Record<string, unknown>) => testApplicability(plate(values), definitionWith(condition), 'isolacao');

  it('in: one of the values (an older spelling read through its option), else NA naming the values', () => {
    expect(stateOf({ op: 'in', field: 'tipo', values: [FUSED] }, { tipo: FUSED }).state).toBe('met');
    expect(stateOf({ op: 'in', field: 'tipo', values: [FUSED] }, { tipo: 'sob carga com fusiveis' }).state).toBe('met');
    expect(stateOf({ op: 'in', field: 'tipo', values: [FUSED] }, { tipo: 'SEM CARGA' })).toMatchObject({ state: 'na', reason: `Não se aplica: TIPO DE SECCIONADORA não é ${FUSED}.`, appliedText: `A placa diz TIPO DE SECCIONADORA não é ${FUSED}.` });
  });

  it('filled, above and below, an empty field and an N/A', () => {
    const kv = (raw: string) => ({ raw, unit: 'kV', state: 'measured' });
    expect(stateOf({ op: 'filled', field: 'mcov_kv' }, { mcov_kv: kv('12') }).state).toBe('met');
    expect(stateOf({ op: 'filled', field: 'mcov_kv' }, {}).state).toBe('met');
    expect(stateOf({ op: 'filled', field: 'mcov_kv', needs_value: true }, {})).toMatchObject({ state: 'na', reason: 'Não se aplica: MCOV sem valor.' });
    expect(stateOf({ op: 'above', field: 'mcov_kv', value: 5 }, { mcov_kv: kv('12') }).state).toBe('met');
    expect(stateOf({ op: 'above', field: 'mcov_kv', value: 5 }, { mcov_kv: kv('5') })).toMatchObject({ state: 'na', reason: 'Não se aplica: MCOV não passa de 5 kV.' });
    expect(stateOf({ op: 'below', field: 'mcov_kv', value: 5 }, { mcov_kv: kv('4,9'.replace(',', '.')) }).state).toBe('met');
    expect(stateOf({ op: 'below', field: 'mcov_kv', value: 5 }, { mcov_kv: kv('12') })).toMatchObject({ state: 'na', reason: 'Não se aplica: MCOV não fica abaixo de 5 kV.' });
    // N/A is filled and meets no condition.
    expect(stateOf({ op: 'filled', field: 'mcov_kv' }, { mcov_kv: { raw: '', unit: null, state: 'not_applicable' } })).toMatchObject({ state: 'na', reason: 'Não se aplica: MCOV N/A.' });
    expect(stateOf({ op: 'above', field: 'mcov_kv', value: 5, unmet: 'abaixo do limite' }, { mcov_kv: { raw: '', unit: null, state: 'not_applicable' } }).reason).toBe('Não se aplica: MCOV abaixo do limite.');
    expect(stateOf({ op: 'in', field: 'tipo', values: [FUSED] }, { tipo: 'N/A' }).state).toBe('na');
  });

  it('a test without a condition is always in force, v1 to v12 included', () => {
    for (const version of ['v1', 'v12', 'v13']) {
      const definition = getDefinition(version, 'cabine_primaria', 'chave_seccionadora');
      for (const test of definition.tests) expect(testApplicability({ sheet: emptySheet() }, definition, test.key).state, `${version} ${test.key}`).toBe('always');
    }
  });

  it('refused at seed load: an unknown field, "in" on a field that is no select or naming no option, "above" on a field that is no number', () => {
    const base = structuredClone(getDefinition('v13', 'cabine_primaria', 'chave_seccionadora')) as BlockDefinition;
    const withCondition = (condition: AppliesWhen) => ({ ...base, tests: base.tests.map((test) => (test.key === 'resistencia_contato' ? { ...test, applies_when: condition } : test)) });
    expect(blockDefinitionSchema.safeParse(withCondition(CONDITION)).success).toBe(true);
    const refused = (condition: AppliesWhen) => blockDefinitionSchema.safeParse(withCondition(condition)).error?.issues.map((issue) => issue.path.join('.'));
    expect(refused({ ...CONDITION, field: 'nao_existe' })).toEqual(['tests.1.applies_when.field']);
    expect(refused({ ...CONDITION, values: ['COM FUSÍVEL'] })).toEqual(['tests.1.applies_when.values']);
    expect(refused({ op: 'in', field: 'corrente_nominal', values: ['10'] })).toEqual(['tests.1.applies_when.values']);
    expect(refused({ op: 'above', field: 'tipo_seccionadora', value: 1 })).toEqual(['tests.1.applies_when.field']);
    // A company type's draft says it in pt-BR on the Ensaios tab.
    const copy = fusedCopy({ ...CONDITION, field: 'nao_existe' });
    expect(companyTypeDefinitionSchema.safeParse(copy).success).toBe(false);
    expect(validateTypeDraft(copy).map((issue) => [issue.part, issue.message])).toEqual([['ensaios', 'ENSAIO DE RESISTÊNCIA ÔHMICA DE CONTATO: a condição de aplicação lê um campo da placa; mantenha esse campo e as suas opções como a condição pede.']]);
    expect(validateTypeDraft(fusedCopy())).toEqual([]);
  });
});

describe('23.9-UNIT the measurement grammar and the initial state', () => {
  const nobreak: CompanyTypeDefinition = {
    label: 'Banco de baterias',
    tag_prefix: 'BB',
    noun: { singular: 'banco', plural: 'bancos', gender: 'm' },
    nameplate: [{ key: 'tem_monitor', label: 'POSSUI MONITOR', kind: 'select', options: ['SIM', 'NÃO'] }],
    checklist: null,
    tests: [],
    measurement_tests: [
      {
        key: 'monitor',
        label: 'Leituras do monitor',
        row_header: 'Leitura',
        switchable: { off_note: 'Desligado nesta ficha.' },
        initial_off: true,
        applies_when: { op: 'in', field: 'tem_monitor', values: ['SIM'], unmet: 'sem monitor' },
        columns: [{ key: 'valor', label: 'Valor', kind: 'number', unit: 'V' }],
        rows: [{ key: 'tensao', label: 'Tensão' }],
        criteria: [{ type: 'absolute', operator: '>', value: 1, unit: 'V', text: '> 1 V', source: { name: 'Manual', edition: null } }],
      },
    ],
    criteria: [],
  };

  it('a measurement test NA by the plate is not live: nothing missing, judged or printed; the screen reads its applicability', () => {
    expect(companyTypeDefinitionSchema.safeParse(nobreak).success).toBe(true);
    const definition = nobreak as unknown as BlockDefinition;
    const block = { config: { block_type: COMPANY_TYPE, sub_blocks: { monitor: { enabled: true } }, na_defaults: [], type_version: 1 }, sheet: emptySheet() };
    block.sheet.nameplate.tem_monitor = { value: 'NÃO', source_suggestion_id: null, op_id: fixed(901) };
    const [test] = evaluateSheetMeasurements(block, definition);
    expect(test!.applicability.state).toBe('na');
    expect(test!.applicability.reason).toBe('Não se aplica: POSSUI MONITOR sem monitor.');
    expect(measurementCounts([test!])).toEqual({ missing: 0, outOfLimit: 0 });
    block.sheet.test.monitor = { cells: {}, applicability: { value: 'applied', source_suggestion_id: null, op_id: fixed(902) } };
    const [applied] = evaluateSheetMeasurements(block, definition);
    expect(applied!.applicability.state).toBe('applied');
    expect(measurementCounts([applied!]).missing).toBe(1);
  });

  it('initial_off starts a switchable test off in a new block; the seed refuses it on a test the sheet cannot switch off', () => {
    const definition = nobreak as unknown as BlockDefinition;
    expect(startsOff(definition, 'monitor')).toBe(true);
    expect(startsOff(definition, 'ia_ip_display')).toBe(true);
    expect(startsOff(definition, 'checklist')).toBe(false);
    const row = { id: VERSION, type_id: TYPE, version: 1, definition: nobreak, published_by: USER, published_at: '2026-11-08T10:00:00.000Z' };
    const ctx = { versions: new Map([[`${TYPE}@1`, row]]), byId: new Map([[VERSION, row]]), types: new Map() };
    expect(defaultBlockConfigIn(ctx, 'v13', COMPANY_TYPE, 1).sub_blocks.monitor).toEqual({ enabled: false });
    const locked = { ...nobreak, measurement_tests: nobreak.measurement_tests!.map((test) => ({ ...test, switchable: undefined })) };
    expect(companyTypeDefinitionSchema.safeParse(JSON.parse(JSON.stringify(locked))).error?.issues.map((issue) => issue.message)).toContain('initial_off belongs to a switchable test');
    // No seeded test of any version starts off on its own: v13's are all "Sempre".
    for (const type of ['transformador_forca', 'chave_seccionadora', 'disjuntor_mt'] as EquipmentBlockType[]) {
      for (const test of getDefinition('v13', 'cabine_primaria', type).tests) expect(startsOff(getDefinition('v13', 'cabine_primaria', type), test.key), `${type} ${test.key}`).toBe(false);
    }
  });
});
