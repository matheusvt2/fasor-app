import { describe, expect, it } from 'vitest';
import { applyOp, cellAt, entityKey, readPath, type EntityKey, type EntityState } from '../ops/apply.ts';
import { invertBatch } from '../ops/outbox.ts';
import { blockPath, fileFieldPath, parsePath, sheetChecklistPath, sheetNameplatePath } from '../ops/path.ts';
import type { Op } from '../ops/op.ts';
import { normalizeReadingValue } from '../reading/value.ts';
import { displayCellTarget } from '../reading/target.ts';
import type { EquipmentBlockType } from '../schemas/block-config.ts';
import { relatorioRowSchema, type BlockRow, type EntityRow, type EquipmentRow, type FileRow, type JsonValue, type LocationRow } from '../schemas/entities.ts';
import { getDefinition } from '../seed/definitions.ts';
import { selectOptionFor } from '../seed/select-option.ts';
import { idSequence, opFactory, T0, TEST_COMPANY, TEST_PROJECT, TEST_RELATORIO, type OpFactory } from '../test-support.ts';
import { nameplateMissingKeys } from './dry-insulation.ts';
import { lastNameplateCopy, nameplateCopyFields } from './nameplate-copy.ts';
import { isOilFieldExcused, isOilUnit, oilCrossingPuts, oilDerivedNaKeys } from './oil-rule.ts';
import { bandCriterion, pickedBand } from './readings.ts';
import { checklistResultOf } from './sheet-progress.ts';
import { parseFieldInput } from './suggestion-group.ts';
import { selvNoticeFieldOf, selvVoltageNoticeText, SELV_VOLTAGE_NOTICE, TEST_VOLTAGE_NOT_CHECKED, testParameterVolts, testVoltageCheck } from './test-voltage.ts';
import { newEquipmentBlock } from './tree.ts';

/*
 * Story 14.14 (seed v7): every row of the spec's I/O matrix. The disjuntor's "Outro" through the
 * oil rule (on sheets filled through the fold), the old spellings mapped on the four paths that
 * bring a value into a select, the SELV notice and the test-voltage check.
 */

const BLOCK = '019966b0-0241-7000-8000-000000000001';
const EQUIPMENT = '019966b0-0241-7000-8000-000000000002';
const LOCAL = '019966b0-0241-7000-8000-000000000003';
const PHOTO = '019966b0-0241-7000-8000-000000000004';
const SHOT = '019966b0-0241-7000-8000-000000000005';
const OIL_ITEM = 'oleo_isolante_indicador_de_nivel';
const num = (raw: string, unit: string): JsonValue => ({ raw, unit, state: 'measured' });

const local = (): LocationRow => ({
  id: LOCAL,
  relatorio_id: TEST_RELATORIO,
  parent_id: null,
  kind: 'cabine',
  name: 'Subestação',
  order_key: 'a0',
  se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
  env: { altitude_m: null, temperature_c: null, humidity_pct: null },
  agrupar_por_tipo: false,
  removed_at: null,
});

const relatorio = (seedVersion: string) =>
  relatorioRowSchema.parse({
    id: TEST_RELATORIO,
    project_id: TEST_PROJECT,
    template_id: null,
    template_version: null,
    seed_version: seedVersion,
    status: 'em_campo',
    setup: { service_start: null, service_end: null, atividade: null, local: null, responsible_user_id: null, cover_photo_file_id: null },
    export: { scheme: 'ordem_de_campo' },
    preview_file_id: null,
    removed_at: null,
  });

type PhotoRow = Extract<FileRow, { kind: 'photo' }>;

function photo(id: string, options: { itemKey?: string | null; target?: JsonValue | null; removedAt?: string | null; kind?: PhotoRow['reading_kind'] } = {}): PhotoRow {
  return {
    id,
    company_id: TEST_COMPANY,
    relatorio_id: TEST_RELATORIO,
    kind: 'photo',
    sha256: 'ab',
    mime: 'image/jpeg',
    size: 1,
    uploaded_at: null,
    variants: null,
    removed_at: options.removedAt ?? null,
    captured_at: '2026-10-21T12:00:00.000Z',
    tz_offset: -180,
    coords: null,
    local_seq: 1,
    block_id: BLOCK,
    item_key: options.itemKey ?? null,
    caption: null,
    reading_kind: options.kind ?? null,
    reading_target: options.target ?? null,
    reading_status: 'none',
    people_in_photo: false,
  } as PhotoRow;
}

function stateWith(type: EquipmentBlockType, seedVersion = 'v7', photos: FileRow[] = [], f: OpFactory = opFactory()): { state: EntityState; f: OpFactory } {
  const { equipment, block } = newEquipmentBlock({ blockId: BLOCK, equipmentId: EQUIPMENT, relatorioId: TEST_RELATORIO, projectId: TEST_PROJECT, locationId: LOCAL, type, tag: 'DJ-1', seedVersion, orderKey: 'a0' });
  const rows = new Map<EntityKey, EntityRow>([
    [entityKey('relatorio', TEST_RELATORIO), relatorio(seedVersion)],
    [entityKey('location', LOCAL), local()],
    [entityKey('equipment', EQUIPMENT), equipment],
  ]);
  for (const row of photos) rows.set(entityKey('file', row.id), row);
  return { state: applyOp(rows, f.op({ kind: 'create', path: blockPath(BLOCK), value: block as unknown as JsonValue })), f };
}

function put(state: EntityState, f: OpFactory, path: string, value: unknown, extra: { batch_id?: string } = {}): { state: EntityState; op: Op } {
  const current = parsePath(path).family === 'file/field' ? null : cellAt(state, parsePath(path));
  const op = f.op({ path, value: value as JsonValue, prev_op_id: current?.merge?.head_op_id ?? current?.op_id ?? null, ...extra });
  return { state: applyOp(state, op), op };
}

function puts(state: EntityState, f: OpFactory, writes: readonly [string, unknown][]): EntityState {
  let next = state;
  for (const [path, value] of writes) next = put(next, f, path, value).state;
  return next;
}

const blockOf = (state: EntityState): BlockRow => state.get(entityKey('block', BLOCK)) as BlockRow;
const filesOf = (state: EntityState): PhotoRow[] => [...state.values()].filter((row): row is PhotoRow => (row as { kind?: string }).kind === 'photo');
const plate = (key: string) => sheetNameplatePath(BLOCK, key);
const item = (key: string, field: 'result' | 'observation' = 'result') => sheetChecklistPath(BLOCK, key, field);
const field = (version: string, type: string, key: string) => getDefinition(version, 'cabine_primaria', type).nameplate.find((candidate) => candidate.key === key)!;
const MEDIA = field('v7', 'disjuntor_mt', 'meio_de_extincao').options!;
const NON_OIL = ['Ar', 'Gás SF6', 'Vácuo'];

describe('matrix "Media on v7", "Outro", "Óleo ↔ Outro", "To non-oil", "Non-oil → Outro"', () => {
  it('the five media; Óleo and Outro show the oil item unanswered and counted and VOL. ÓLEO required; Ar, Gás SF6 and Vácuo derive it NA', () => {
    expect(MEDIA).toEqual(['Ar', 'Gás SF6', 'Vácuo', 'Óleo', 'Outro']);
    for (const value of MEDIA) {
      const { state, f } = stateWith('disjuntor_mt');
      const block = blockOf(put(state, f, plate('meio_de_extincao'), value).state);
      const full = value === 'Óleo' || value === 'Outro';
      expect(isOilUnit(block), value).toBe(full);
      expect(checklistResultOf(block, OIL_ITEM), value).toBe(full ? null : 'NA');
      expect(oilDerivedNaKeys(block).has(OIL_ITEM), value).toBe(!full);
      expect(nameplateMissingKeys({ blocks: [block] }, BLOCK).has('vol_oleo'), value).toBe(full);
      expect(isOilFieldExcused(block, 'vol_oleo'), value).toBe(!full);
    }
  });

  it('Outro: VOL. ÓLEO typed is stored and kept, the oil item answered is stored', () => {
    const { state, f } = stateWith('disjuntor_mt');
    const block = blockOf(
      puts(state, f, [
        [plate('meio_de_extincao'), 'Outro'],
        [plate('vol_oleo'), num('45', 'L')],
        [item(OIL_ITEM), 'C'],
      ]),
    );
    expect(block.sheet.nameplate.vol_oleo!.value).toEqual(num('45', 'L'));
    expect(checklistResultOf(block, OIL_ITEM)).toBe('C');
    expect(isOilFieldExcused(block, 'vol_oleo')).toBe(false);
  });

  it('Óleo to Outro and Outro to Óleo cross nothing', () => {
    for (const [from, to] of [
      ['Óleo', 'Outro'],
      ['Outro', 'Óleo'],
    ] as const) {
      const { state, f } = stateWith('disjuntor_mt');
      const filled = puts(state, f, [
        [plate('meio_de_extincao'), from],
        [item(OIL_ITEM), 'NC'],
        [plate('vol_oleo'), num('45', 'L')],
      ]);
      expect(oilCrossingPuts({ blocks: [blockOf(filled)], files: [] }, BLOCK, 'meio_de_extincao', to), `${from} → ${to}`).toEqual([]);
    }
  });

  it('Outro or Óleo to Ar, Gás SF6 or Vácuo is the crossing batch: the item, VOL. ÓLEO and the photo tie; its undo restores them', () => {
    for (const from of ['Outro', 'Óleo']) {
      for (const to of NON_OIL) {
        const f = opFactory();
        const { state } = stateWith('disjuntor_mt', 'v7', [photo(PHOTO, { itemKey: OIL_ITEM })], f);
        const filled = puts(state, f, [
          [plate('meio_de_extincao'), from],
          [item(OIL_ITEM), 'C'],
          [item(OIL_ITEM, 'observation'), 'nível baixo'],
          [plate('vol_oleo'), num('45', 'L')],
        ]);
        const crossing = oilCrossingPuts({ blocks: [blockOf(filled)], files: filesOf(filled) }, BLOCK, 'meio_de_extincao', to);
        expect(crossing, `${from} → ${to}`).toEqual([
          { path: item(OIL_ITEM), value: null },
          { path: item(OIL_ITEM, 'observation'), value: null },
          { path: plate('vol_oleo'), value: null },
          { path: fileFieldPath(PHOTO, 'item_key'), value: null },
        ]);
        const batch = '019966b0-0242-7000-8000-000000000001';
        const ops: Op[] = [];
        const before = new Map<string, unknown>();
        let next = filled;
        for (const entry of [{ path: plate('meio_de_extincao'), value: to as unknown }, ...crossing]) {
          const current = parsePath(entry.path).family === 'file/field' ? null : cellAt(next, parsePath(entry.path));
          const op = f.op({ path: entry.path, value: entry.value as JsonValue, prev_op_id: current?.merge?.head_op_id ?? current?.op_id ?? null, batch_id: batch });
          before.set(op.op_id, readPath(next, op));
          ops.push(op);
          next = applyOp(next, op);
        }
        const after = blockOf(next);
        expect(checklistResultOf(after, OIL_ITEM)).toBe('NA');
        expect(isOilFieldExcused(after, 'vol_oleo')).toBe(true);
        expect(filesOf(next).find((row) => row.id === PHOTO)!.item_key).toBeNull();
        let undone = next;
        for (const op of invertBatch(ops, before, { newId: idSequence('019966b0-0243-7000-8000-'), now: T0 })) undone = applyOp(undone, op);
        const restored = blockOf(undone);
        expect(restored.sheet.nameplate.meio_de_extincao!.value).toBe(from);
        expect(checklistResultOf(restored, OIL_ITEM)).toBe('C');
        expect(restored.sheet.nameplate.vol_oleo!.value).toEqual(num('45', 'L'));
        expect(filesOf(undone).find((row) => row.id === PHOTO)!.item_key).toBe(OIL_ITEM);
      }
    }
  });

  it('Ar to Outro crosses: what a non-oil unit held on the oil item is cleared, and the item returns unanswered', () => {
    const { state, f } = stateWith('disjuntor_mt');
    const ar = puts(state, f, [[plate('meio_de_extincao'), 'Ar']]);
    expect(oilCrossingPuts({ blocks: [blockOf(ar)], files: [] }, BLOCK, 'meio_de_extincao', 'Outro')).toEqual([]);
    const tapped = put(ar, f, item(OIL_ITEM), 'NA').state;
    expect(oilCrossingPuts({ blocks: [blockOf(tapped)], files: [] }, BLOCK, 'meio_de_extincao', 'Outro')).toEqual([{ path: item(OIL_ITEM), value: null }]);
    const outro = blockOf(put(ar, f, plate('meio_de_extincao'), 'Outro').state);
    expect(checklistResultOf(outro, OIL_ITEM)).toBeNull();
  });

  it('v6 untouched: its five media, ÓLEO (PVO) and (GVO) oil, AR, SF6 and VÁCUO non-oil, and no Outro', () => {
    expect(field('v6', 'disjuntor_mt', 'meio_de_extincao').options).toEqual(['AR', 'SF6', 'VÁCUO', 'ÓLEO (PVO)', 'ÓLEO (GVO)']);
    for (const [value, oil] of [
      ['AR', false],
      ['SF6', false],
      ['VÁCUO', false],
      ['ÓLEO (PVO)', true],
      ['ÓLEO (GVO)', true],
    ] as const) {
      const { state, f } = stateWith('disjuntor_mt', 'v6');
      const block = blockOf(put(state, f, plate('meio_de_extincao'), value).state);
      expect(isOilUnit(block), value).toBe(oil);
      expect(checklistResultOf(block, OIL_ITEM), value).toBe(oil ? null : 'NA');
    }
  });
});

describe('matrix "Old spelling copied" and "Old spelling read"', () => {
  const v7Medium = field('v7', 'disjuntor_mt', 'meio_de_extincao');
  const v6Medium = field('v6', 'disjuntor_mt', 'meio_de_extincao');

  it('selectOptionFor: each v6 spelling reads as its v7 option; the option itself and a case or accent variant too; anything else null', () => {
    expect(['AR', 'SF6', 'VÁCUO', 'ÓLEO (PVO)', 'ÓLEO (GVO)'].map((value) => selectOptionFor(v7Medium, value))).toEqual(['Ar', 'Gás SF6', 'Vácuo', 'Óleo', 'Óleo']);
    for (const option of MEDIA) expect(selectOptionFor(v7Medium, option)).toBe(option);
    expect(selectOptionFor(v7Medium, 'vacuo')).toBe('Vácuo');
    expect(selectOptionFor(v7Medium, ' gás  sf6 ')).toBe('Gás SF6');
    expect(selectOptionFor(v7Medium, 'óleo (pvo)')).toBe('Óleo');
    for (const value of ['MINERAL', '', '   ', null, 3, { raw: '1' }]) expect(selectOptionFor(v7Medium, value), String(value)).toBeNull();
    // v6 untouched: its own options, no alias, so a v7 spelling is not one of them.
    for (const option of v6Medium.options!) expect(selectOptionFor(v6Medium, option)).toBe(option);
    expect(selectOptionFor(v6Medium, 'Gás SF6')).toBeNull();
    expect(selectOptionFor(v6Medium, 'Outro')).toBeNull();
  });

  it('"Igual à ⟨TAG⟩?" from a v6 disjuntor onto a v7 one maps the medium; a value with no option nor alias is not copied', () => {
    const target = getDefinition('v7', 'cabine_primaria', 'disjuntor_mt');
    for (const [old, now] of [
      ['AR', 'Ar'],
      ['SF6', 'Gás SF6'],
      ['VÁCUO', 'Vácuo'],
      ['ÓLEO (PVO)', 'Óleo'],
      ['ÓLEO (GVO)', 'Óleo'],
    ]) {
      const { state, f } = stateWith('disjuntor_mt', 'v6');
      const source = blockOf(puts(state, f, [[plate('meio_de_extincao'), old], [plate('fabricacao'), 'ABB']]));
      const copied = nameplateCopyFields(source, target);
      expect(copied.find((entry) => entry.fieldKey === 'meio_de_extincao')?.value, old).toBe(now);
      expect(copied.find((entry) => entry.fieldKey === 'fabricacao')?.value, old).toBe('ABB');
    }
    const stray = { sheet: { nameplate: { meio_de_extincao: { value: 'MINERAL', source_suggestion_id: null, op_id: 'x' } }, checklist: {}, test: {}, conclusion: {}, observations: null } } as unknown as BlockRow;
    expect(nameplateCopyFields(stray, target)).toEqual([]);
  });

  it('"Copiar da última visita" from a v6 last plate maps the medium the same way, dropping an unknown one', () => {
    const target = getDefinition('v7', 'cabine_primaria', 'disjuntor_mt');
    const last = (value: string) => ({ last_nameplate: { fields: { meio_de_extincao: value, fabricacao: 'ABB' } } }) as unknown as Pick<EquipmentRow, 'last_nameplate'>;
    expect(lastNameplateCopy(last('ÓLEO (GVO)'), target)).toEqual(expect.arrayContaining([{ fieldKey: 'fabricacao', value: 'ABB' }, { fieldKey: 'meio_de_extincao', value: 'Óleo' }]));
    expect(lastNameplateCopy(last('ÓLEO (GVO)'), target)).toHaveLength(2);
    expect(lastNameplateCopy(last('MINERAL'), target)).toEqual([{ fieldKey: 'fabricacao', value: 'ABB' }]);
    // On v6 the last plate's v6 value copies as it is.
    expect(lastNameplateCopy(last('SF6'), getDefinition('v6', 'cabine_primaria', 'disjuntor_mt')).find((entry) => entry.fieldKey === 'meio_de_extincao')?.value).toBe('SF6');
  });

  it('a plate reading and a typed suggestion of an old spelling suggest the v7 option; no match stays invalid', () => {
    for (const [given, now] of [
      ['SF6', 'Gás SF6'],
      ['ÓLEO (PVO)', 'Óleo'],
      ['vacuo', 'Vácuo'],
      ['AR', 'Ar'],
    ] as const) {
      expect(normalizeReadingValue(v7Medium, given), given).toEqual({ ok: true, value: now, verify: false });
      expect(parseFieldInput(v7Medium, given), given).toEqual({ ok: true, value: now });
    }
    expect(normalizeReadingValue(v7Medium, 'MINERAL').ok).toBe(false);
    expect(parseFieldInput(v7Medium, 'MINERAL')).toEqual({ ok: false });
    // v6: as it shipped.
    expect(normalizeReadingValue(v6Medium, 'sf6')).toEqual({ ok: true, value: 'SF6', verify: false });
    expect(normalizeReadingValue(v6Medium, 'Gás SF6').ok).toBe(false);
  });
});

/** A Quadro elétrico block of `seedVersion` with the plate values and the insulation instrument's TENSÃO ENSAIO given. */
function board(options: { seedVersion?: string; voltage?: JsonValue | null; selv?: string | null; testParameter?: string | null } = {}): BlockRow {
  const seedVersion = options.seedVersion ?? 'v7';
  const { block } = newEquipmentBlock({ blockId: BLOCK, equipmentId: EQUIPMENT, relatorioId: TEST_RELATORIO, projectId: TEST_PROJECT, locationId: LOCAL, type: 'quadro_eletrico', tag: 'QD-1', seedVersion, orderKey: 'a0' });
  const cell = (value: JsonValue) => ({ value, source_suggestion_id: null, op_id: 'x' });
  const nameplate: Record<string, unknown> = {};
  if (options.voltage !== undefined && options.voltage !== null) nameplate.tensao_nominal = cell(options.voltage);
  if (options.selv !== undefined && options.selv !== null) nameplate.circuito_selv_pelv = cell(options.selv);
  const test: Record<string, unknown> = {};
  if (options.testParameter !== undefined) {
    test.isolacao = {
      cells: {},
      instrument: cell({ instrument_id: '019966b0-0241-7000-8000-0000000000a1', code: '2E', manufacturer: 'Megabras', model: 'MI', serial: '1', cert_number: null, calibrated_at: null, valid_until: null, test_parameter: options.testParameter }),
    };
  }
  return { ...block, sheet: { ...block.sheet, nameplate: nameplate as BlockRow['sheet']['nameplate'], test: test as BlockRow['sheet']['test'] } } as BlockRow;
}

const shot = (removedAt: string | null = null, tableKey = 'isolacao') =>
  photo(SHOT, { kind: 'display', target: displayCellTarget(BLOCK, 'quadro_eletrico', tableKey, { row: 0, col: 1 }) as unknown as JsonValue, removedAt });
const isolacao = (seedVersion = 'v7') => getDefinition(seedVersion, 'cabine_primaria', 'quadro_eletrico').tests[0]!;

describe('matrix "SELV help", "SELV notice" and "SELV no notice"', () => {
  it('the help sits on the v7 field only', () => {
    expect(field('v7', 'quadro_eletrico', 'circuito_selv_pelv').help).toBe('SELV e PELV: tensão até 120 V em corrente contínua ou 50 V em corrente alternada, conforme a NBR 5410');
    expect(field('v6', 'quadro_eletrico', 'circuito_selv_pelv').help).toBeUndefined();
    expect(selvNoticeFieldOf(board())).toBe('circuito_selv_pelv');
    expect(selvNoticeFieldOf(board({ seedVersion: 'v6' }))).toBeNull();
  });

  it('SIM above 50 V shows the notice (380 V, 0,38 kV, 51 V); the SELV band still applies', () => {
    for (const voltage of [num('380', 'V'), num('0.38', 'kV'), num('51', 'V')]) {
      const block = board({ voltage, selv: 'SIM' });
      expect(selvVoltageNoticeText(block), JSON.stringify(voltage)).toBe(SELV_VOLTAGE_NOTICE);
      expect(bandCriterion(block, isolacao())!.value).toBe(0.25);
    }
    expect(SELV_VOLTAGE_NOTICE).toBe('Marcado SELV/PELV, mas a TENSÃO NOMINAL passa de 50 V: confira a marcação ou a tensão.');
  });

  it('no notice: SIM with 50 V, empty or unparsable voltage; NÃO or empty mark with any voltage; v6', () => {
    const none: BlockRow[] = [
      board({ voltage: num('50', 'V'), selv: 'SIM' }),
      board({ selv: 'SIM' }),
      board({ voltage: { raw: 'alta', unit: 'V', state: 'measured' }, selv: 'SIM' }),
      board({ voltage: 'trezentos', selv: 'SIM' }),
      board({ voltage: num('380', 'V'), selv: 'NÃO' }),
      board({ voltage: num('380', 'V') }),
      board({ seedVersion: 'v6', voltage: num('380', 'V'), selv: 'SIM' }),
    ];
    for (const block of none) expect(() => selvVoltageNoticeText(block)).not.toThrow();
    expect(none.map((block) => selvVoltageNoticeText(block))).toEqual(none.map(() => null));
  });
});

describe('matrix "Test voltage band" and the voltage check', () => {
  it('each band names its test voltage: SELV 250 V, up to 500 V 500 V, up to 1000 V 1000 V; v6 none', () => {
    expect(pickedBand(board({ voltage: num('380', 'V'), selv: 'SIM' }), isolacao())!.test_voltage).toBe(250);
    expect(pickedBand(board({ voltage: num('500', 'V') }), isolacao())!.test_voltage).toBe(500);
    expect(pickedBand(board({ voltage: num('501', 'V') }), isolacao())!.test_voltage).toBe(1000);
    expect(pickedBand(board({ voltage: num('1000', 'V') }), isolacao())!.test_voltage).toBe(1000);
    expect(pickedBand(board({ voltage: num('1001', 'V') }), isolacao())).toBeNull();
    expect(pickedBand(board({ seedVersion: 'v6', voltage: num('380', 'V') }), isolacao('v6'))!.test_voltage).toBeUndefined();
  });

  it('match: 500 V, 0,5 kV and 500 Vcc on a 380 V board with a live display shot; nothing shown', () => {
    for (const parameter of ['500 V', '0,5 kV', '500 Vcc', '500 Vca']) {
      const check = testVoltageCheck({ block: board({ voltage: num('380', 'V'), testParameter: parameter }), files: [shot()] }, isolacao());
      expect(check, parameter).toEqual({ state: 'match', text: null, expected: '500 V', given: '500 V' });
    }
    // Each band matched by its own voltage.
    expect(testVoltageCheck({ block: board({ voltage: num('380', 'V'), selv: 'SIM', testParameter: '250 V' }), files: [shot()] }, isolacao())!.state).toBe('match');
    expect(testVoltageCheck({ block: board({ voltage: num('690', 'V'), testParameter: '1.000 V' }), files: [shot()] }, isolacao())!.state).toBe('match');
    expect(testVoltageCheck({ block: board({ voltage: num('690', 'V'), testParameter: '1 kV' }), files: [shot()] }, isolacao())!.state).toBe('match');
  });

  it('mismatch: 5.000 V or 5 kV on a 380 V board names both voltages, and no verdict changes', () => {
    for (const parameter of ['5.000 V', '5 kV']) {
      const block = board({ voltage: num('380', 'V'), testParameter: parameter });
      const check = testVoltageCheck({ block, files: [shot()] }, isolacao());
      expect(check, parameter).toEqual({
        state: 'mismatch',
        text: 'Tensão de ensaio do instrumento (5.000 V) diferente da prevista para a faixa (500 V).',
        expected: '500 V',
        given: '5.000 V',
      });
      expect(bandCriterion(block, isolacao())!.value).toBe(0.5);
    }
    // The SELV band once SIM: 250 V expected.
    expect(testVoltageCheck({ block: board({ voltage: num('380', 'V'), selv: 'SIM', testParameter: '5.000 V' }), files: [shot()] }, isolacao())!.text).toBe(
      'Tensão de ensaio do instrumento (5.000 V) diferente da prevista para a faixa (250 V).',
    );
  });

  it('not checked: no shot, a removed shot, a shot of another test, a plate photo, or an unparsable TENSÃO ENSAIO', () => {
    const block = board({ voltage: num('380', 'V'), testParameter: '5.000 V' });
    const notChecked = { state: 'not_checked', text: TEST_VOLTAGE_NOT_CHECKED, expected: '500 V', given: '5.000 V' };
    expect(TEST_VOLTAGE_NOT_CHECKED).toBe('Tensão de ensaio não conferida');
    expect(testVoltageCheck({ block, files: [] }, isolacao())).toEqual(notChecked);
    expect(testVoltageCheck({ block, files: [shot('2026-10-21T13:00:00.000Z')] }, isolacao())).toEqual(notChecked);
    expect(testVoltageCheck({ block, files: [shot(null, 'resistencia_contato')] }, isolacao())).toEqual(notChecked);
    expect(testVoltageCheck({ block, files: [photo(PHOTO, { kind: 'plate', target: { block_id: BLOCK, block_type: 'quadro_eletrico' } })] }, isolacao())).toEqual(notChecked);
    expect(testVoltageCheck({ block, files: [{ ...shot(), block_id: '019966b0-0241-7000-8000-0000000000ff' }] }, isolacao())).toEqual(notChecked);
    for (const parameter of ['alta', '5000', '5 kΩ', '-500 V']) {
      const check = testVoltageCheck({ block: board({ voltage: num('380', 'V'), testParameter: parameter }), files: [shot()] }, isolacao());
      expect(check, parameter).toEqual({ state: 'not_checked', text: TEST_VOLTAGE_NOT_CHECKED, expected: '500 V', given: null });
    }
  });

  it('n/a: no band picked, no instrument or no TENSÃO ENSAIO, a test without bands, v6', () => {
    const files = [shot()];
    expect(testVoltageCheck({ block: board({ testParameter: '500 V' }), files }, isolacao())).toBeNull();
    expect(testVoltageCheck({ block: board({ voltage: num('1500', 'V'), testParameter: '500 V' }), files }, isolacao())).toBeNull();
    expect(testVoltageCheck({ block: board({ voltage: num('380', 'V') }), files }, isolacao())).toBeNull();
    expect(testVoltageCheck({ block: board({ voltage: num('380', 'V'), testParameter: null }), files }, isolacao())).toBeNull();
    expect(testVoltageCheck({ block: board({ voltage: num('380', 'V'), testParameter: '  ' }), files }, isolacao())).toBeNull();
    expect(testVoltageCheck({ block: board({ seedVersion: 'v6', voltage: num('380', 'V'), testParameter: '5.000 V' }), files }, isolacao('v6'))).toBeNull();
    const paraRaio = getDefinition('v7', 'cabine_primaria', 'para_raio').tests[0]!;
    expect(testVoltageCheck({ block: board({ voltage: num('380', 'V'), testParameter: '5.000 V' }), files }, paraRaio)).toBeNull();
  });

  it('testParameterVolts reads V, Vcc, Vca, kV, kVcc and kVca with pt-BR numbers', () => {
    expect(['5.000 V', '5 kV', '5kV', '5 kVcc', '5 KVCA', '5000 Vca', '0,38 kV'].map(testParameterVolts)).toEqual([5000, 5000, 5000, 5000, 5000, 5000, 380]);
    expect(['', 'V', '5', 'cinco V', '5,0,0 V', null, undefined].map(testParameterVolts)).toEqual([null, null, null, null, null, null, null]);
  });
});
