import { describe, expect, it } from 'vitest';
import { applyOp, cellAt, entityKey, readPath, type EntityKey, type EntityState } from '../ops/apply.ts';
import { invertBatch } from '../ops/outbox.ts';
import { blockPath, fileFieldPath, parsePath, sheetChecklistPath, sheetNameplatePath } from '../ops/path.ts';
import type { Op } from '../ops/op.ts';
import { section9Layout, type PrintTable, type SheetPart } from '../print/section-9.ts';
import type { EquipmentBlockType, Subtype } from '../schemas/block-config.ts';
import { relatorioRowSchema, type BlockRow, type EntityRow, type FileRow, type JsonValue, type LocationRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { defaultBlockConfig } from '../seed/template.ts';
import { idSequence, opFactory, T0, TEST_COMPANY, TEST_PROJECT, TEST_RELATORIO, type OpFactory } from '../test-support.ts';
import { isDryBlock, nameplateMissingKeys, oilNaChipItems } from './dry-insulation.ts';
import {
  isOilFieldExcused,
  isOilUnit,
  oilCrossingClearedCount,
  oilCrossingPuts,
  oilDerivedNaKeys,
  oilItemsClearedText,
  oilRuleOf,
  type OilCrossingPut,
} from './oil-rule.ts';
import { repeatChecklistPattern } from './ficha.ts';
import { checklistResultIsStored, checklistResultOf, sheetProgress } from './sheet-progress.ts';
import { newEquipmentBlock } from './tree.ts';

/*
 * Story 14.11 (seed v6): the insulation (or the extinction medium) drives the oil items. Every
 * row of the spec's I/O matrix from "Dry from start" to "Answered on dry", on sheets filled
 * through the fold (`applyOp`), then the crossing batch, its undo and two devices converging.
 */

const BLOCK = '019966b0-0211-7000-8000-000000000001';
const EQUIPMENT = '019966b0-0211-7000-8000-000000000002';
const LOCAL = '019966b0-0211-7000-8000-000000000003';
const PHOTO_OIL = '019966b0-0211-7000-8000-000000000004';
const PHOTO_OTHER = '019966b0-0211-7000-8000-000000000005';
const PHOTO_GONE = '019966b0-0211-7000-8000-000000000006';

/** The eight oil items of the transformers, in checklist order. */
const OIL = [
  'valvula_de_alivio',
  'elemento_secante',
  'juntas_vedacoes_e_vazamentos',
  'indicador_nivel_de_oleo',
  'registros_radiadores',
  'rele_de_gas_funcionamento',
  'termometro',
  'oleo_isolante_indicador_de_nivel',
];
const TRANSFORMERS: EquipmentBlockType[] = ['transformador_forca', 'tp', 'tc'];
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

function photo(id: string, itemKey: string | null, removedAt: string | null = null): FileRow {
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
    removed_at: removedAt,
    captured_at: '2026-10-20T12:00:00.000Z',
    tz_offset: -180,
    coords: null,
    local_seq: 1,
    block_id: BLOCK,
    item_key: itemKey,
    caption: null,
    reading_kind: null,
    reading_target: { item_key: itemKey } as JsonValue,
    reading_status: 'none',
    people_in_photo: false,
  } as FileRow;
}

/** A state with the relatório (on `seedVersion`), the local and one block of `type` created through the fold. */
function stateWith(type: EquipmentBlockType, options: { seedVersion?: string; subtype?: Subtype; photos?: FileRow[] } = {}, f: OpFactory = opFactory()): { state: EntityState; f: OpFactory } {
  const seedVersion = options.seedVersion ?? 'v6';
  const config = defaultBlockConfig(seedVersion, type, options.subtype === undefined ? {} : { subtype: options.subtype }) as unknown as JsonValue;
  const { equipment, block } = newEquipmentBlock({ blockId: BLOCK, equipmentId: EQUIPMENT, relatorioId: TEST_RELATORIO, projectId: TEST_PROJECT, locationId: LOCAL, type, tag: 'TR-1', seedVersion, orderKey: 'a0', config });
  const rows = new Map<EntityKey, EntityRow>([
    [entityKey('relatorio', TEST_RELATORIO), relatorio(seedVersion)],
    [entityKey('location', LOCAL), local()],
    [entityKey('equipment', EQUIPMENT), equipment],
  ]);
  for (const row of options.photos ?? []) rows.set(entityKey('file', row.id), row);
  const state = applyOp(rows, f.op({ kind: 'create', path: blockPath(BLOCK), value: block as unknown as JsonValue }));
  return { state, f };
}

/** One put folded in, chained on the cell it lands on (one device writing in sequence). */
function put(state: EntityState, f: OpFactory, path: string, value: unknown, extra: { batch_id?: string; device_id?: string } = {}): { state: EntityState; op: Op } {
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
const plate = (key: string) => sheetNameplatePath(BLOCK, key);
const item = (key: string, field: 'result' | 'observation' = 'result') => sheetChecklistPath(BLOCK, key, field);
const results = (block: BlockRow, keys: readonly string[]) => keys.map((key) => checklistResultOf(block, key));
const filesOf = (state: EntityState): FileRow[] => [...state.values()].filter((row): row is FileRow => (row as { kind?: string }).kind === 'photo');

describe('the oil state of a v6 unit', () => {
  it('reads the stored value first, then the dry subtype, else unknown; only types with a rule have one', () => {
    for (const type of TRANSFORMERS) {
      const { state, f } = stateWith(type);
      expect(isOilUnit(blockOf(state)), type).toBeNull();
      for (const [value, oil] of [
        ['EPÓXI', false],
        ['Á SECO', false],
        ['ÓLEO', true],
      ] as const) {
        expect(isOilUnit(blockOf(put(state, f, plate('tipo_de_isolacao'), value).state)), `${type} ${value}`).toBe(oil);
      }
      // A dry template subtype with nothing stored is dry; a stored ÓLEO wins over it.
      const dry = stateWith(type, { subtype: 'a_seco' });
      expect(isOilUnit(blockOf(dry.state)), type).toBe(false);
      expect(isOilUnit(blockOf(put(dry.state, dry.f, plate('tipo_de_isolacao'), 'ÓLEO').state)), type).toBe(true);
    }
    const disjuntor = stateWith('disjuntor_mt');
    for (const [value, oil] of [
      ['AR', false],
      ['SF6', false],
      ['VÁCUO', false],
      ['ÓLEO (PVO)', true],
      ['ÓLEO (GVO)', true],
    ] as const) {
      expect(isOilUnit(blockOf(put(disjuntor.state, disjuntor.f, plate('meio_de_extincao'), value).state)), value).toBe(oil);
    }
    // No rule: the seccionadora, the CTA, the QGBT, and every type on v1 to v5.
    for (const type of ['chave_seccionadora', 'para_raio', 'cabos_entrada', 'quadro_eletrico'] as const) expect(oilRuleOf(blockOf(stateWith(type).state)), type).toBeNull();
    for (const seedVersion of ['v1', 'v4', 'v5']) {
      const old = stateWith('transformador_forca', { seedVersion });
      const stored = blockOf(put(old.state, old.f, plate('tipo_de_isolacao'), 'EPÓXI').state);
      expect(oilRuleOf(stored), seedVersion).toBeNull();
      expect(isOilUnit(stored), seedVersion).toBeNull();
      expect(oilDerivedNaKeys(stored).size, seedVersion).toBe(0);
    }
  });
});

describe('matrix "Dry from start", "Oil", "Empty value", "Stored value vs subtype"', () => {
  it('a dry transformer, TP or TC shows the eight oil items NA with no cell, counts none of them, and VOL. ÓLEO is excused', () => {
    for (const type of TRANSFORMERS) {
      for (const value of ['EPÓXI', 'Á SECO']) {
        const { state, f } = stateWith(type);
        const block = blockOf(put(state, f, plate('tipo_de_isolacao'), value).state);
        expect(results(block, OIL), `${type} ${value}`).toEqual(OIL.map(() => 'NA'));
        // Derived, never a cell: the first tap still commits one.
        expect(OIL.every((key) => block.sheet.checklist[key] === undefined && !checklistResultIsStored(block, key))).toBe(true);
        expect(results(block, ['limpeza', 'aterramento'])).toEqual([null, null]);
        expect(sheetProgress({ blocks: [block] }, BLOCK).steps.verificacoes.missing, type).toBe(15 - 8);
        expect(nameplateMissingKeys({ blocks: [block] }, BLOCK).has('vol_oleo'), type).toBe(false);
        expect(isOilFieldExcused(block, 'vol_oleo')).toBe(true);
        expect(isDryBlock(block)).toBe(true);
        // No chip on v6: the items already show NA.
        expect(oilNaChipItems(block, { used: false }), type).toEqual([]);
      }
    }
  });

  it('a disjuntor with AR, SF6 or VÁCUO shows its one oil item NA; VOL. ÓLEO excused', () => {
    for (const value of ['AR', 'SF6', 'VÁCUO']) {
      const { state, f } = stateWith('disjuntor_mt');
      const block = blockOf(put(state, f, plate('meio_de_extincao'), value).state);
      expect(checklistResultOf(block, 'oleo_isolante_indicador_de_nivel'), value).toBe('NA');
      expect(checklistResultOf(block, 'camara_de_extincao'), value).toBeNull();
      expect(nameplateMissingKeys({ blocks: [block] }, BLOCK).has('vol_oleo'), value).toBe(false);
    }
  });

  it('ÓLEO (or an oil medium) leaves every oil item unanswered and counted, and VOL. ÓLEO required', () => {
    for (const [type, field, value, items] of [
      ['transformador_forca', 'tipo_de_isolacao', 'ÓLEO', OIL],
      ['tp', 'tipo_de_isolacao', 'ÓLEO', OIL],
      ['disjuntor_mt', 'meio_de_extincao', 'ÓLEO (PVO)', ['oleo_isolante_indicador_de_nivel']],
      ['disjuntor_mt', 'meio_de_extincao', 'ÓLEO (GVO)', ['oleo_isolante_indicador_de_nivel']],
    ] as const) {
      const { state, f } = stateWith(type);
      const block = blockOf(put(state, f, plate(field), value).state);
      expect(results(block, items), `${type} ${value}`).toEqual(items.map(() => null));
      expect(nameplateMissingKeys({ blocks: [block] }, BLOCK).has('vol_oleo'), `${type} ${value}`).toBe(true);
      expect(isDryBlock(block)).toBe(false);
    }
  });

  it('with nothing stored and no subtype no rule applies, as an oil unit today; a dry subtype still shows its oil items NA', () => {
    const empty = blockOf(stateWith('transformador_forca').state);
    expect(results(empty, OIL)).toEqual(OIL.map(() => null));
    expect(nameplateMissingKeys({ blocks: [empty] }, BLOCK).has('vol_oleo')).toBe(true);
    const subtype = blockOf(stateWith('transformador_forca', { subtype: 'epoxi' }).state);
    expect(results(subtype, OIL)).toEqual(OIL.map(() => 'NA'));
    expect(nameplateMissingKeys({ blocks: [subtype] }, BLOCK).has('vol_oleo')).toBe(false);
  });

  it('a dry subtype with a stored ÓLEO: the stored value wins, the oil items are not NA', () => {
    const { state, f } = stateWith('tc', { subtype: 'a_seco' });
    const block = blockOf(put(state, f, plate('tipo_de_isolacao'), 'ÓLEO').state);
    expect(results(block, OIL)).toEqual(OIL.map(() => null));
    expect(nameplateMissingKeys({ blocks: [block] }, BLOCK).has('vol_oleo')).toBe(true);
  });
});

describe('matrix "Cleared on dry" and "Answered on dry"', () => {
  it('an oil item cleared to null on a dry unit still shows NA; a C the engineer taps wins, is stored and prints', () => {
    const { state, f } = stateWith('transformador_forca');
    let next = put(state, f, plate('tipo_de_isolacao'), 'Á SECO').state;
    next = put(next, f, item('termometro'), 'C').state;
    expect(checklistResultOf(blockOf(next), 'termometro')).toBe('C');
    expect(checklistResultIsStored(blockOf(next), 'termometro')).toBe(true);
    next = put(next, f, item('termometro'), null).state;
    expect(checklistResultOf(blockOf(next), 'termometro')).toBe('NA');
    expect(checklistResultIsStored(blockOf(next), 'termometro')).toBe(false);
    // On a non-rule item a cleared cell is unanswered, as before.
    next = put(next, f, item('limpeza'), 'C').state;
    next = put(next, f, item('limpeza'), null).state;
    expect(checklistResultOf(blockOf(next), 'limpeza')).toBeNull();
  });

  it('on v1 to v5 a dry stored insulation marks nothing by itself: the chip is offered, today\'s rule', () => {
    const { state, f } = stateWith('transformador_forca', { seedVersion: 'v5' });
    const block = blockOf(put(state, f, plate('tipo_de_isolacao'), 'EPÓXI').state);
    expect(results(block, OIL)).toEqual(OIL.map(() => null));
    expect(oilNaChipItems(block, { used: false })).toEqual(OIL);
    expect(nameplateMissingKeys({ blocks: [block] }, BLOCK).has('vol_oleo')).toBe(false);
  });
});

describe('matrix "Crossing" and "No crossing"', () => {
  /** An oil transformer with an oil item answered C with an observation, VOL. ÓLEO typed and photos. */
  function oilUnit() {
    const { state, f } = stateWith('transformador_forca', { photos: [photo(PHOTO_OIL, 'termometro'), photo(PHOTO_OTHER, 'limpeza'), photo(PHOTO_GONE, 'valvula_de_alivio', '2026-10-20T13:00:00.000Z')] });
    const next = puts(state, f, [
      [plate('tipo_de_isolacao'), 'ÓLEO'],
      [item('termometro'), 'NC'],
      [item('termometro', 'observation'), 'visor do termômetro danificado'],
      [item('valvula_de_alivio'), 'C'],
      [item('limpeza'), 'C'],
      [plate('vol_oleo'), num('320', 'L')],
    ]);
    return { state: next, f };
  }

  it('ÓLEO to Á SECO clears the oil items holding a value, VOL. ÓLEO and the tie of every live photo on an oil item', () => {
    const { state } = oilUnit();
    const snapshot = { blocks: [blockOf(state)], files: filesOf(state) };
    const crossing = oilCrossingPuts(snapshot, BLOCK, 'tipo_de_isolacao', 'Á SECO');
    expect(crossing).toEqual([
      { path: item('valvula_de_alivio'), value: null },
      { path: item('termometro'), value: null },
      { path: item('termometro', 'observation'), value: null },
      { path: plate('vol_oleo'), value: null },
      { path: fileFieldPath(PHOTO_OIL, 'item_key'), value: null },
    ]);
    // Each oil item once and VOL. ÓLEO once.
    expect(oilCrossingClearedCount(crossing, snapshot)).toBe(3);
    expect(oilItemsClearedText(3)).toBe('3 itens de óleo apagados');
    expect(oilItemsClearedText(1)).toBe('1 item de óleo apagado');
    // Á SECO to ÓLEO (non-oil to oil) clears what a dry unit held: a C tapped on an oil item.
    const dry = put(state, opFactory(T0, idSequence('019966b0-0212-7000-8000-')), plate('tipo_de_isolacao'), 'Á SECO').state;
    expect(oilCrossingPuts({ blocks: [blockOf(dry)], files: [] }, BLOCK, 'tipo_de_isolacao', 'ÓLEO').map((entry) => entry.path)).toContain(item('valvula_de_alivio'));
  });

  it('no crossing: EPÓXI to Á SECO, empty to anything, anything to empty, another field, a type or seed with no rule', () => {
    const { state, f } = stateWith('transformador_forca', { photos: [photo(PHOTO_OIL, 'termometro')] });
    const empty = { blocks: [blockOf(state)], files: filesOf(state) };
    for (const value of ['ÓLEO', 'EPÓXI']) expect(oilCrossingPuts(empty, BLOCK, 'tipo_de_isolacao', value), value).toEqual([]);
    const epoxi = puts(state, f, [
      [plate('tipo_de_isolacao'), 'EPÓXI'],
      [item('termometro'), 'C'],
    ]);
    const snapshot = { blocks: [blockOf(epoxi)], files: filesOf(epoxi) };
    expect(oilCrossingPuts(snapshot, BLOCK, 'tipo_de_isolacao', 'Á SECO')).toEqual([]);
    expect(oilCrossingPuts(snapshot, BLOCK, 'tipo_de_isolacao', null)).toEqual([]);
    expect(oilCrossingPuts(snapshot, BLOCK, 'tipo', 'ÓLEO')).toEqual([]);
    // Anything to empty clears nothing, even on a dry subtype (stored ÓLEO, subtype epoxi, put null or blank).
    const sub = stateWith('transformador_forca', { subtype: 'epoxi' });
    const oil = puts(sub.state, sub.f, [
      [plate('tipo_de_isolacao'), 'ÓLEO'],
      [item('termometro'), 'C'],
    ]);
    expect(oilCrossingPuts({ blocks: [blockOf(oil)], files: [] }, BLOCK, 'tipo_de_isolacao', null)).toEqual([]);
    expect(oilCrossingPuts({ blocks: [blockOf(oil)], files: [] }, BLOCK, 'tipo_de_isolacao', '  ')).toEqual([]);
    expect(oilCrossingPuts({ blocks: [blockOf(oil)], files: [] }, BLOCK, 'tipo_de_isolacao', 'EPÓXI')).toEqual([{ path: item('termometro'), value: null }]);
    // The seccionadora's medium carries no rule; v5 neither.
    const sec = stateWith('chave_seccionadora');
    expect(oilCrossingPuts({ blocks: [blockOf(put(sec.state, sec.f, plate('meio_de_extincao'), 'AR').state)], files: [] }, BLOCK, 'meio_de_extincao', 'SF6')).toEqual([]);
    const v5 = stateWith('transformador_forca', { seedVersion: 'v5' });
    expect(oilCrossingPuts({ blocks: [blockOf(put(v5.state, v5.f, plate('tipo_de_isolacao'), 'EPÓXI').state)], files: [] }, BLOCK, 'tipo_de_isolacao', 'Á SECO')).toEqual([]);
  });

  it('the disjuntor: VÁCUO to ÓLEO (GVO) and back crosses on its one oil item', () => {
    const { state, f } = stateWith('disjuntor_mt');
    const vacuo = puts(state, f, [
      [plate('meio_de_extincao'), 'VÁCUO'],
      [item('oleo_isolante_indicador_de_nivel'), 'NA'],
      [item('camara_de_extincao'), 'C'],
    ]);
    expect(oilCrossingPuts({ blocks: [blockOf(vacuo)], files: [] }, BLOCK, 'meio_de_extincao', 'ÓLEO (GVO)')).toEqual([{ path: item('oleo_isolante_indicador_de_nivel'), value: null }]);
    expect(oilCrossingPuts({ blocks: [blockOf(vacuo)], files: [] }, BLOCK, 'meio_de_extincao', 'SF6')).toEqual([]);
    expect(oilCrossingPuts({ blocks: [blockOf(vacuo)], files: [] }, BLOCK, 'meio_de_extincao', 'ÓLEO (PVO)')).toHaveLength(1);
  });

  it('the batch folds through the existing families: the item NA, VOL. ÓLEO empty, the photo kept untied; its undo restores all three', () => {
    const { state, f } = oilUnit();
    const batch = '019966b0-0213-7000-8000-000000000001';
    const crossing: OilCrossingPut[] = oilCrossingPuts({ blocks: [blockOf(state)], files: filesOf(state) }, BLOCK, 'tipo_de_isolacao', 'Á SECO');
    const ops: Op[] = [];
    const before = new Map<string, unknown>();
    let next = state;
    for (const [path, value] of [[plate('tipo_de_isolacao'), 'Á SECO'] as [string, unknown], ...crossing.map((entry) => [entry.path, entry.value] as [string, unknown])]) {
      const current = parsePath(path).family === 'file/field' ? null : cellAt(next, parsePath(path));
      const op = f.op({ path, value: value as JsonValue, prev_op_id: current?.merge?.head_op_id ?? current?.op_id ?? null, batch_id: batch });
      before.set(op.op_id, readPath(next, op));
      ops.push(op);
      next = applyOp(next, op);
    }
    const after = blockOf(next);
    expect(checklistResultOf(after, 'termometro')).toBe('NA');
    expect(after.sheet.checklist.termometro?.observation?.value ?? null).toBeNull();
    expect(after.sheet.nameplate.vol_oleo?.value ?? null).toBeNull();
    const kept = next.get(entityKey('file', PHOTO_OIL)) as Extract<FileRow, { kind: 'photo' }>;
    expect(kept.removed_at).toBeNull();
    expect(kept.block_id).toBe(BLOCK);
    expect(kept.item_key).toBeNull();
    // `reading_target` is never rewritten.
    expect(kept.reading_target).toEqual({ item_key: 'termometro' });
    expect((next.get(entityKey('file', PHOTO_OTHER)) as FileRow & { item_key: string | null }).item_key).toBe('limpeza');
    // Undo: one inverse batch puts every earlier value back.
    const undo = invertBatch(ops, before, { newId: idSequence('019966b0-0214-7000-8000-'), now: T0 });
    let undone = next;
    for (const op of undo) undone = applyOp(undone, op);
    const restored = blockOf(undone);
    expect(restored.sheet.nameplate.tipo_de_isolacao?.value).toBe('ÓLEO');
    expect(checklistResultOf(restored, 'termometro')).toBe('NC');
    expect(restored.sheet.checklist.termometro?.observation?.value).toBe('visor do termômetro danificado');
    expect(checklistResultOf(restored, 'valvula_de_alivio')).toBe('C');
    expect(restored.sheet.nameplate.vol_oleo?.value).toEqual(num('320', 'L'));
    expect((undone.get(entityKey('file', PHOTO_OIL)) as FileRow & { item_key: string | null }).item_key).toBe('termometro');
  });

  it('two devices: one crossing dry to oil and one concurrent oil item answer converge on the same rows whatever the order', () => {
    const { state, f } = stateWith('transformador_forca');
    const base = puts(state, f, [
      [plate('tipo_de_isolacao'), 'Á SECO'],
      [item('termometro'), 'C'],
    ]);
    const head = cellAt(base, parsePath(item('termometro')))!;
    const plateHead = cellAt(base, parsePath(plate('tipo_de_isolacao')))!;
    const a = opFactory(T0, idSequence('019966b0-0215-7000-8000-'));
    const b = opFactory(T0, idSequence('019966b0-0216-7000-8000-'));
    const batch = '019966b0-0215-7000-8000-0000000000ff';
    // Device A: Á SECO to ÓLEO, which clears the C (both from the same heads).
    const crossing = oilCrossingPuts({ blocks: [blockOf(base)], files: [] }, BLOCK, 'tipo_de_isolacao', 'ÓLEO');
    expect(crossing).toEqual([{ path: item('termometro'), value: null }]);
    const fromA = [
      a.op({ path: plate('tipo_de_isolacao'), value: 'ÓLEO', prev_op_id: plateHead.op_id, batch_id: batch, device_id: 'tablet-a' }),
      a.op({ path: item('termometro'), value: null, prev_op_id: head.op_id, batch_id: batch, device_id: 'tablet-a' }),
    ];
    // Device B, offline at the same moment: answers the other oil item NC.
    const fromB = [b.op({ path: item('rele_de_gas_funcionamento'), value: 'NC', prev_op_id: null, device_id: 'tablet-b' })];
    let one = base;
    for (const op of [...fromA, ...fromB]) one = applyOp(one, op);
    let two = base;
    for (const op of [...fromB, ...fromA]) two = applyOp(two, op);
    // The cells converge (the server's order then gives both devices the same row stamps).
    expect(blockOf(two).sheet).toEqual(blockOf(one).sheet);
    const converged = blockOf(one);
    expect(isOilUnit(converged)).toBe(true);
    expect(checklistResultOf(converged, 'termometro')).toBeNull();
    expect(checklistResultOf(converged, 'rele_de_gas_funcionamento')).toBe('NC');
    // The other oil items of the now-oil unit are unanswered on both.
    expect(checklistResultOf(blockOf(two), 'valvula_de_alivio')).toBeNull();
  });
});

describe('"Repetir" from a non-oil unit onto an oil one', () => {
  it('copies the stored results only: an oil item NA derived by the source\'s rule is never written onto the target', () => {
    const source = stateWith('transformador_forca');
    const dry = blockOf(
      puts(source.state, source.f, [
        [plate('tipo_de_isolacao'), 'Á SECO'],
        [item('limpeza'), 'C'],
        [item('termometro'), 'NA'],
      ]),
    );
    const target = stateWith('transformador_forca', {}, opFactory(T0, idSequence('019966b0-0217-7000-8000-')));
    const oil = blockOf(put(target.state, target.f, plate('tipo_de_isolacao'), 'ÓLEO').state);
    // The source reads every oil item NA, but only TERMÔMETRO's NA is a stored answer.
    expect(results(dry, OIL)).toEqual(OIL.map(() => 'NA'));
    expect(repeatChecklistPattern(dry, oil)).toEqual([
      { itemKey: 'limpeza', value: 'C' },
      { itemKey: 'termometro', value: 'NA' },
    ]);
  });
});

describe('the print of a v6 unit (matrix "Dry from start": the same choice on the sheet and in the document)', () => {
  function snapshotOf(state: EntityState): RelatorioSnapshot {
    const snapshot = buildSnapshot(state, TEST_RELATORIO);
    return { ...snapshot, actors: [] };
  }
  const table = (parts: readonly SheetPart[], title: string): PrintTable =>
    parts.find((part): part is Extract<SheetPart, { kind: 'table' }> => part.kind === 'table' && part.table.rows[0]!.cells[0]!.text === title)!.table;

  it('a dry transformer prints its oil items NA and VOL. ÓLEO "-" whatever is stored; an oil one prints what it holds', () => {
    const { state, f } = stateWith('transformador_forca');
    // VOL. ÓLEO typed while oil, then the field switched to dry by a plain put (no crossing batch).
    const dry = puts(state, f, [
      [plate('tipo_de_isolacao'), 'ÓLEO'],
      [plate('vol_oleo'), num('320', 'L')],
      [plate('tipo_de_isolacao'), 'Á SECO'],
      [item('termometro'), 'C'],
    ]);
    const layout = section9Layout(snapshotOf(dry), 9, 'RELATÓRIOS DOS ENSAIOS')!;
    const parts = layout.subsections[0]!.sheets[0]!.parts;
    const nameplate = table(parts, 'DADOS DO EQUIPAMENTO');
    const pairs = nameplate.rows.slice(1).flatMap((row) => row.cells.map((cell) => cell.text));
    expect(pairs[pairs.indexOf('VOL. ÓLEO') + 1]).toBe('-');
    const checklist = table(parts, 'VERIFICAÇÕES GERAIS');
    const rowOf = (label: string) => checklist.rows.find((row) => row.cells[0]!.text.endsWith(label))!.cells.map((cell) => cell.text);
    // ÍTEM · C · NC · NA · OBSERVAÇÕES: a derived NA prints NA, the stored C prints C.
    expect(rowOf('VÁLVULA DE ALÍVIO').slice(1, 4)).toEqual(['', '', 'X']);
    expect(rowOf('TERMÔMETRO').slice(1, 4)).toEqual(['X', '', '']);
    expect(rowOf('LIMPEZA').slice(1, 4)).toEqual(['', '', '']);
    const oil = put(dry, f, plate('tipo_de_isolacao'), 'ÓLEO').state;
    const oilParts = section9Layout(snapshotOf(oil), 9, 'RELATÓRIOS DOS ENSAIOS')!.subsections[0]!.sheets[0]!.parts;
    const oilPairs = table(oilParts, 'DADOS DO EQUIPAMENTO').rows.slice(1).flatMap((row) => row.cells.map((cell) => cell.text));
    expect(oilPairs[oilPairs.indexOf('VOL. ÓLEO') + 1]).toBe('320 L');
  });
});
