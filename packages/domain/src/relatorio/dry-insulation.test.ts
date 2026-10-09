import { describe, expect, it } from 'vitest';
import { mergePolicy } from '../merge/policy.ts';
import { parsePath } from '../ops/path.ts';
import type { EquipmentBlockType } from '../schemas/block-config.ts';
import { emptySheet, type BlockRow, type Cell, type JsonValue, type Sheet } from '../schemas/entities.ts';
import { getDefinition, SEED_VERSION } from '../seed/definitions.ts';
import { defaultBlockConfig } from '../seed/template.ts';
import { opFactory } from '../test-support.ts';
import {
  drySubtypeOfInsulation,
  INSULATION_FIELD_KEY,
  isDryBlock,
  nameplateMissingKeys,
  OIL_VOLUME_FIELD_KEY,
  oilItemsNaText,
  oilNaChipItems,
  oilNaChipText,
} from './dry-insulation.ts';
import { sheetProgress } from './sheet-progress.ts';

/*
 * Review 2026-10-08, Decision 2 (H-4, MKT-7), amended 2026-10-09: a dry transformador de força,
 * TP or TC with no subtype offers the chip "Marcar N itens de óleo como NA" while its stored
 * TIPO DE ISOLAÇÃO is dry, whatever wrote it, and VOL. ÓLEO stops counting as missing on a dry
 * block.
 */

const ID = '019966b0-d0a1-7000-8000-000000000001';
const OP = '019966b0-d0a1-7000-8000-000000000002';
const REL = '019966b0-d0a1-7000-8000-000000000003';
const LOC = '019966b0-d0a1-7000-8000-000000000004';
const EQ = '019966b0-d0a1-7000-8000-000000000005';

/** The eight oil items in the transformers' checklist order (seed v1 `OIL_RELATED_ITEMS`). */
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

const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: OP });

function block(type: EquipmentBlockType, sheet: Partial<Sheet> = {}, options: { subtype?: 'epoxi' | 'a_seco' | 'manual'; checklistOff?: boolean } = {}): BlockRow {
  const config = defaultBlockConfig(SEED_VERSION, type, options.subtype === undefined ? {} : { subtype: options.subtype });
  if (options.checklistOff === true) config.sub_blocks.checklist = { enabled: false };
  return {
    id: ID,
    relatorio_id: REL,
    location_id: LOC,
    equipment_id: EQ,
    block_type: type,
    config,
    seed_version: SEED_VERSION,
    order_key: 'a0',
    feeds_block_id: null,
    not_tested: null,
    concluded_by: null,
    sheet: { ...emptySheet(), ...sheet },
    created_by: null,
    first_edited_at: null,
    last_modified_by: null,
    last_modified_at: null,
    removed_at: null,
  };
}

/** Every nameplate field of `type` filled, except the keys given. */
function plate(type: EquipmentBlockType, except: readonly string[] = [], over: Record<string, unknown> = {}): Sheet['nameplate'] {
  const definition = getDefinition(SEED_VERSION, 'cabine_primaria', type);
  const out: Sheet['nameplate'] = {};
  for (const field of definition.nameplate) {
    if (except.includes(field.key)) continue;
    const value = field.key in over ? over[field.key] : field.kind === 'number' ? { raw: '10', unit: field.unit ?? null, state: 'measured' } : field.kind === 'select' ? field.options![0] : 'X';
    out[field.key] = cell(value);
  }
  return out;
}

describe('drySubtypeOfInsulation', () => {
  it.each(TRANSFORMERS)('names the dry subtype of EPÓXI and Á SECO on %s, nothing else', (type) => {
    const definition = getDefinition(SEED_VERSION, 'cabine_primaria', type);
    expect(drySubtypeOfInsulation(definition, 'EPÓXI')?.key).toBe('epoxi');
    expect(drySubtypeOfInsulation(definition, 'Á SECO')?.key).toBe('a_seco');
    for (const value of [null, undefined, '', '  ', 'ÓLEO', 'epoxi', 42]) expect(drySubtypeOfInsulation(definition, value)).toBeNull();
  });

  it('is null on a type without TIPO DE ISOLAÇÃO and on no definition', () => {
    expect(drySubtypeOfInsulation(getDefinition(SEED_VERSION, 'cabine_primaria', 'disjuntor_mt'), 'EPÓXI')).toBeNull();
    expect(drySubtypeOfInsulation(getDefinition(SEED_VERSION, 'cabine_primaria', 'chave_seccionadora'), 'EPÓXI')).toBeNull();
    expect(drySubtypeOfInsulation(null, 'EPÓXI')).toBeNull();
  });
});

/** The block's stored insulation, as any path writes it (a copy chip's cell carries no `source_suggestion_id`). */
const insulated = (value: unknown, sheet: Partial<Sheet> = {}): Partial<Sheet> => ({ ...sheet, nameplate: { [INSULATION_FIELD_KEY]: cell(value) } });
const unused = { used: false };

describe('oilNaChipItems', () => {
  it.each(TRANSFORMERS)('offers the eight oil items, in checklist order, on %s with a stored EPÓXI or Á SECO and no subtype', (type) => {
    expect(oilNaChipItems(block(type, insulated('EPÓXI')), unused)).toEqual(OIL);
    expect(oilNaChipItems(block(type, insulated('Á SECO')), unused)).toEqual(OIL);
  });

  it('whatever wrote the insulation: a confirmed cell and a copied one offer the same', () => {
    const confirmed = block('tp', { nameplate: { [INSULATION_FIELD_KEY]: { ...cell('EPÓXI'), source_suggestion_id: OP } } });
    expect(oilNaChipItems(confirmed, unused)).toEqual(OIL);
    expect(oilNaChipItems(block('tp', insulated('EPÓXI')), unused)).toEqual(OIL);
  });

  it.each(TRANSFORMERS)('never counts an answered item on %s (C, NC or NA), but counts a cleared one', (type) => {
    const b = block(
      type,
      insulated('EPÓXI', {
        checklist: {
          valvula_de_alivio: { result: cell('C') },
          elemento_secante: { result: cell('NC') },
          termometro: { result: cell('NA') },
          registros_radiadores: { result: cell(null) },
          ventiladores: { result: cell('C') },
        },
      }),
    );
    expect(oilNaChipItems(b, unused)).toEqual(OIL.filter((key) => !['valvula_de_alivio', 'elemento_secante', 'termometro'].includes(key)));
  });

  it('offers nothing once every oil item is answered', () => {
    const b = block('transformador_forca', insulated('EPÓXI', { checklist: Object.fromEntries(OIL.map((key) => [key, { result: cell('C') }])) }));
    expect(oilNaChipItems(b, unused)).toEqual([]);
  });

  it('offers nothing once used on this block (the device flag)', () => {
    expect(oilNaChipItems(block('tc', insulated('Á SECO')), { used: true })).toEqual([]);
  });

  it.each(TRANSFORMERS)('offers nothing on %s whose stored insulation is not dry, empty or cleared', (type) => {
    expect(oilNaChipItems(block(type), unused)).toEqual([]);
    for (const value of [null, '', 'ÓLEO MINERAL']) expect(oilNaChipItems(block(type, insulated(value)), unused)).toEqual([]);
  });

  it.each(TRANSFORMERS)('offers nothing on %s with a subtype (its na_defaults already display NA)', (type) => {
    expect(oilNaChipItems(block(type, insulated('EPÓXI'), { subtype: 'epoxi' }), unused)).toEqual([]);
    expect(oilNaChipItems(block(type, insulated('EPÓXI'), { subtype: 'a_seco' }), unused)).toEqual([]);
  });

  it('a config claiming the checklist off still offers: the checklist is a locked sub-block', () => {
    expect(oilNaChipItems(block('transformador_forca', insulated('EPÓXI'), { checklistOff: true }), unused)).toEqual(OIL);
  });

  it('offers nothing on a block type without TIPO DE ISOLAÇÃO', () => {
    expect(oilNaChipItems(block('disjuntor_mt', insulated('EPÓXI')), unused)).toEqual([]);
    expect(oilNaChipItems(block('chave_seccionadora', insulated('Á SECO')), unused)).toEqual([]);
  });
});

describe('isDryBlock', () => {
  it('reads the dry subtype or the stored insulation', () => {
    expect(isDryBlock(block('tp'))).toBe(false);
    expect(isDryBlock(block('tp', {}, { subtype: 'epoxi' }))).toBe(true);
    expect(isDryBlock(block('tc', {}, { subtype: 'a_seco' }))).toBe(true);
    expect(isDryBlock(block('transformador_forca', { nameplate: { [INSULATION_FIELD_KEY]: cell('Á SECO') } }))).toBe(true);
    expect(isDryBlock(block('transformador_forca', { nameplate: { [INSULATION_FIELD_KEY]: cell(null) } }))).toBe(false);
    expect(isDryBlock(block('transformador_forca', { nameplate: { [INSULATION_FIELD_KEY]: cell('OUTRO') } }))).toBe(false);
  });
});

describe('nameplateMissingKeys', () => {
  it.each(TRANSFORMERS)('leaves VOL. ÓLEO out on %s whose stored insulation is dry', (type) => {
    const b = block(type, { nameplate: plate(type, [OIL_VOLUME_FIELD_KEY], { [INSULATION_FIELD_KEY]: 'EPÓXI' }) });
    expect([...nameplateMissingKeys({ blocks: [b] }, ID)]).toEqual([]);
  });

  it.each(TRANSFORMERS)('leaves VOL. ÓLEO out on %s whose subtype is dry, insulation empty', (type) => {
    const b = block(type, { nameplate: plate(type, [OIL_VOLUME_FIELD_KEY, INSULATION_FIELD_KEY]) }, { subtype: 'a_seco' });
    expect([...nameplateMissingKeys({ blocks: [b] }, ID)]).toEqual([INSULATION_FIELD_KEY]);
  });

  it.each(TRANSFORMERS)('counts VOL. ÓLEO as before on %s without either', (type) => {
    const b = block(type, { nameplate: plate(type, [OIL_VOLUME_FIELD_KEY, INSULATION_FIELD_KEY]) });
    expect([...nameplateMissingKeys({ blocks: [b] }, ID)]).toEqual([INSULATION_FIELD_KEY, OIL_VOLUME_FIELD_KEY]);
    const other = block(type, { nameplate: plate(type, [OIL_VOLUME_FIELD_KEY], { [INSULATION_FIELD_KEY]: 'ÓLEO' }) });
    expect([...nameplateMissingKeys({ blocks: [other] }, ID)]).toEqual([OIL_VOLUME_FIELD_KEY]);
  });

  it('keeps the TAG prefill rule (Story 12.3)', () => {
    const b = block('disjuntor_mt', { nameplate: plate('disjuntor_mt', ['tag']) });
    expect([...nameplateMissingKeys({ blocks: [b] }, ID)]).toEqual(['tag']);
    expect([...nameplateMissingKeys({ blocks: [b], equipment: [{ id: EQ, tag: 'DJ-01' }] }, ID)]).toEqual([]);
    expect([...nameplateMissingKeys({ blocks: [b], equipment: [{ id: EQ, tag: '' }] }, ID)]).toEqual(['tag']);
  });

  it('is empty for an unknown block and a disabled nameplate', () => {
    expect(nameplateMissingKeys({ blocks: [] }, ID).size).toBe(0);
    const b = block('tp');
    (b.config as { sub_blocks: Record<string, unknown> }).sub_blocks.nameplate = { enabled: false };
    expect(nameplateMissingKeys({ blocks: [b] }, ID).size).toBe(0);
  });

  it('agrees with the Placa count of sheetProgress', () => {
    const dry = block('transformador_forca', { nameplate: plate('transformador_forca', [OIL_VOLUME_FIELD_KEY], { [INSULATION_FIELD_KEY]: 'Á SECO' }) });
    expect(sheetProgress({ blocks: [dry] }, ID).steps.placa.missing).toBe(0);
    const wet = block('transformador_forca', { nameplate: plate('transformador_forca', [OIL_VOLUME_FIELD_KEY, INSULATION_FIELD_KEY]) });
    expect(sheetProgress({ blocks: [wet] }, ID).steps.placa.missing).toBe(2);
  });
});

describe('the texts', () => {
  it('names the chip and counts the oil items marked NA', () => {
    expect(oilNaChipText(1)).toBe('Marcar 1 item de óleo como NA');
    expect(oilNaChipText(8)).toBe('Marcar 8 itens de óleo como NA');
    expect(oilItemsNaText(1)).toBe('1 item de óleo marcado NA');
    expect(oilItemsNaText(7)).toBe('7 itens de óleo marcados NA');
  });
});

describe('two devices on an oil item (E4-A8)', () => {
  const result = `sheet/${ID}/checklist/valvula_de_alivio/result`;
  const at = parsePath(result);
  // Device B's cell, written without seeing device A's NA mark (A's op chains on nothing).
  const theirs = (value: JsonValue): Cell => ({ value, source_suggestion_id: null, op_id: '019966b0-d0a1-7000-8000-0000000000bb' });
  const markFromA = () => opFactory().op({ path: result, value: 'NA', prev_op_id: null, device_id: 'tablet-a' });

  it('NA against NA is the same value', () => {
    expect(mergePolicy({ path: at, current: theirs('NA'), op: markFromA() })).toEqual({ kind: 'apply', rule: 'same_value' });
  });

  it('NA against an empty side fills it', () => {
    expect(mergePolicy({ path: at, current: theirs(null), op: markFromA() })).toEqual({ kind: 'apply', rule: 'filled_over_empty' });
  });

  it('NA against C or NC is a contradiction (the seq-later value shows, the other kept for "Aplicar")', () => {
    expect(mergePolicy({ path: at, current: theirs('C'), op: markFromA() })).toEqual({ kind: 'contradiction' });
    expect(mergePolicy({ path: at, current: theirs('NC'), op: markFromA() })).toEqual({ kind: 'contradiction' });
  });
});
