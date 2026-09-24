import { describe, expect, it } from 'vitest';
import { emptySheet, type BlockRow, type Cell } from '../schemas/entities.ts';
import { defaultBlockConfig } from '../seed/template.ts';
import { enabledCells, isCellFilled, isEquipmentBlock, sheetState, sheetStateLabel } from './sheet-state.ts';

const ID = '019966b0-0042-7000-8000-000000000001';
const OP = '019966b0-0042-7000-8000-000000000002';
const REL = '019966b0-0042-7000-8000-000000000003';
const LOC = '019966b0-0042-7000-8000-000000000004';
const EQ = '019966b0-0042-7000-8000-000000000005';

const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: OP });

function block(over: Partial<BlockRow> = {}): BlockRow {
  return {
    id: ID,
    relatorio_id: REL,
    location_id: LOC,
    equipment_id: EQ,
    block_type: 'chave_seccionadora',
    config: defaultBlockConfig('v1', 'chave_seccionadora', { subtype: 'manual' }),
    seed_version: 'v1',
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
    ...over,
  };
}

const NOT_TESTED = { reason: 'desligamento_nao_autorizado', text: null, at: '2026-09-06T10:00:00.000Z', by: 'u1' } as const;

describe('4.3-UNIT sheetState (AD-18 precedence)', () => {
  it('not_tested wins over concluded and cells', () => {
    const b = block({
      not_tested: NOT_TESTED as BlockRow['not_tested'],
      concluded_by: { actor_id: 'u1', at: '2026-09-06T10:00:00.000Z' },
      sheet: { ...emptySheet(), nameplate: { fabricante: cell('ABB') } },
    });
    expect(sheetState(b)).toBe('nao_ensaiada');
  });

  it('concluded_by wins over cells', () => {
    const b = block({
      concluded_by: { actor_id: 'u1', at: '2026-09-06T10:00:00.000Z' },
      sheet: { ...emptySheet(), nameplate: { fabricante: cell('ABB') } },
    });
    expect(sheetState(b)).toBe('concluida');
  });

  it('a filled enabled cell is em_preenchimento; an empty number value or blank string is not', () => {
    expect(sheetState(block({ sheet: { ...emptySheet(), nameplate: { fabricante: cell('ABB') } } }))).toBe('em_preenchimento');
    expect(sheetState(block({ sheet: { ...emptySheet(), nameplate: { tensao: cell({ raw: '', unit: 'kV', state: 'empty' }) } } }))).toBe('vazia');
    expect(sheetState(block({ sheet: { ...emptySheet(), nameplate: { fabricante: cell('   ') } } }))).toBe('vazia');
    expect(sheetState(block({ sheet: { ...emptySheet(), observations: cell('ok') } }))).toBe('em_preenchimento');
    expect(sheetState(block())).toBe('vazia');
  });

  it('ignores the cells of a sub-block the config switched off', () => {
    const config = defaultBlockConfig('v1', 'chave_seccionadora', { subtype: 'manual' });
    config.sub_blocks.nameplate = { enabled: false };
    config.sub_blocks.isolacao = { enabled: false };
    const b = block({
      config,
      sheet: {
        ...emptySheet(),
        nameplate: { fabricante: cell('ABB') },
        test: { isolacao: { cells: { '0': { '0': cell({ raw: '330', unit: 'MΩ', state: 'measured' }) } } } },
      },
    });
    expect(sheetState(b)).toBe('vazia');
    expect(enabledCells(b)).toEqual([]);
    // The locked checklist is always read.
    config.sub_blocks.checklist = { enabled: false };
    expect(sheetState(block({ config, sheet: { ...emptySheet(), checklist: { limpeza: { result: cell('C') } } } }))).toBe('em_preenchimento');
  });

  it('reads every cell when the config is not a BlockConfig (a hand-built row)', () => {
    expect(sheetState(block({ config: {}, sheet: { ...emptySheet(), nameplate: { x: cell('1') } } }))).toBe('em_preenchimento');
  });

  it('labels the four states with the mock words', () => {
    expect(sheetStateLabel('vazia')).toBe('Vazia');
    expect(sheetStateLabel('em_preenchimento')).toBe('Em preenchimento');
    expect(sheetStateLabel('concluida')).toBe('Concluída');
    expect(sheetStateLabel('nao_ensaiada')).toBe('Não ensaiada');
  });

  it('isCellFilled and isEquipmentBlock', () => {
    expect(isCellFilled(undefined)).toBe(false);
    expect(isCellFilled(cell(null))).toBe(false);
    expect(isCellFilled(cell(0))).toBe(true);
    expect(isCellFilled(cell({ raw: '1', unit: null, state: 'not_measured' }))).toBe(true);
    expect(isEquipmentBlock({ block_type: 'section_2', equipment_id: null })).toBe(false);
    expect(isEquipmentBlock({ block_type: 'tp', equipment_id: null })).toBe(true);
  });
});
