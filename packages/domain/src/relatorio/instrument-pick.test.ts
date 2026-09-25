import { describe, expect, it } from 'vitest';
import type { InstrumentRow } from '../registry/instrument-row.ts';
import { emptySheet, type BlockRow, type Cell } from '../schemas/entities.ts';
import { defaultBlockConfig } from '../seed/template.ts';
import {
  suggestedInstrument,
  suggestedInstruments,
  instrumentDetailText,
  instrumentExpiredText,
  instrumentFieldText,
  instrumentHeaderOf,
  instrumentOptionOf,
  instrumentPickerOrder,
  lastInstrumentIdFor,
  storedInstrumentHeader,
} from './instrument-pick.ts';

const now = new Date('2026-09-22T12:00:00.000Z');

function instrument(over: Partial<InstrumentRow> = {}): InstrumentRow {
  return {
    id: '019966b0-0051-7000-8000-00000000000a',
    kind: 'instrument',
    code: '2E',
    name: 'Megôhmetro',
    manufacturer: 'Instrum',
    model: 'DMG10Ki',
    serial: 'IN919021',
    cert_number: '37428/26',
    laboratory: null,
    calibrated_at: '2026-08-28',
    calibration_interval_months: 12,
    rbc_accredited: true,
    test_isolacao: { raw: '5', unit: 'kV' },
    test_resistencia_contato: null,
    test_relacao_transformacao: null,
    certificate_file_id: null,
    removed_at: null,
    ...over,
  } as InstrumentRow;
}

describe('5.7-UNIT the instrument header', () => {
  it('copies the registry values, the computed validity and the per-test default', () => {
    const header = instrumentHeaderOf(instrument(), 'isolacao');
    expect(header).toEqual({
      instrument_id: '019966b0-0051-7000-8000-00000000000a',
      code: '2E',
      manufacturer: 'Instrum',
      model: 'DMG10Ki',
      serial: 'IN919021',
      cert_number: '37428/26',
      calibrated_at: '2026-08-28',
      valid_until: '2027-08-28',
      test_parameter: '5 kV',
    });
    expect(instrumentHeaderOf(instrument(), 'resistencia_contato').test_parameter).toBeNull();
    expect(storedInstrumentHeader(header)).toEqual(header);
    expect(storedInstrumentHeader('x')).toBeNull();
  });

  it('field, detail and expired texts', () => {
    const header = instrumentHeaderOf(instrument(), 'isolacao');
    expect(instrumentFieldText(header, 'Megôhmetro')).toBe('2E — Megôhmetro');
    expect(instrumentFieldText(header, null)).toBe('2E — DMG10Ki');
    expect(instrumentDetailText(header, false)).toBe('DMG10Ki · Instrum · série IN919021 · RBC 37428/26 · válida até 28/08/2027 · 5 kV');
    expect(instrumentExpiredText(header, '2026-09-08', now)).toBeNull();
    const old = instrumentHeaderOf(instrument({ calibrated_at: '2025-02-02' }), 'isolacao');
    expect(instrumentExpiredText(old, '2026-09-08', now)).toBe('Calibração vencida em 02/02/2026');
    expect(instrumentDetailText(old, true)).not.toContain('válida até');
  });

  it('an option carries its expired line, always, and stays selectable', () => {
    const option = instrumentOptionOf(instrument({ calibrated_at: '2025-02-02' }), '2026-09-08', now);
    expect(option).toMatchObject({ code: '2E', name: 'Megôhmetro DMG10Ki', expired: 'Calibração vencida em 02/02/2026' });
    expect(instrumentOptionOf(instrument(), '2026-09-08', now).detail).toBe('Instrum · série IN919021 · RBC 37428/26 · válida até 28/08/2027');
  });
});

describe('5.7-UNIT remembering the last instrument per test type', () => {
  const cellOf = (id: string, opId: string): Cell => ({ value: { instrument_id: id, code: 'x' }, source_suggestion_id: null, op_id: opId });
  const blockWith = (test: BlockRow['sheet']['test'], removed = false): Pick<BlockRow, 'sheet' | 'removed_at'> => ({
    sheet: { ...emptySheet(), test },
    removed_at: removed ? '2026-09-06T12:00:00.000Z' : null,
  });

  it('the instrument cell with the greatest op id, per test key, live blocks only', () => {
    const blocks = [
      blockWith({ isolacao: { cells: {}, instrument: cellOf('A', '019966b0-0000-7000-8000-000000000001') } }),
      blockWith({ isolacao: { cells: {}, instrument: cellOf('B', '019966b0-0000-7000-8000-000000000003') } }),
      blockWith({ isolacao: { cells: {}, instrument: cellOf('C', '019966b0-0000-7000-8000-000000000009') } }, true),
      blockWith({ resistencia_contato: { cells: {}, instrument: cellOf('D', '019966b0-0000-7000-8000-000000000005') } }),
    ];
    expect(lastInstrumentIdFor(blocks, 'isolacao')).toBe('B');
    expect(lastInstrumentIdFor(blocks, 'resistencia_contato')).toBe('D');
    expect(lastInstrumentIdFor(blocks, 'relacao_transformacao')).toBeNull();
  });

  it('orders the list: the last used first, then by code; removed rows out', () => {
    const rows = [
      { id: '1', code: '5A', removed_at: null },
      { id: '2', code: '2E', removed_at: null },
      { id: '3', code: '10B', removed_at: null },
      { id: '4', code: '1T', removed_at: '2026-09-06T12:00:00.000Z' },
    ];
    expect(instrumentPickerOrder(rows, '1').map((r) => r.code)).toEqual(['5A', '2E', '10B']);
    expect(instrumentPickerOrder(rows, null).map((r) => r.code)).toEqual(['2E', '5A', '10B']);
  });
});

describe('12.3-UNIT suggestedInstrument (J-07, D-4)', () => {
  const REL = '019966b0-0051-7000-8000-000000000100';
  const X = '019966b0-0051-7000-8000-00000000000a';
  const Y = '019966b0-0051-7000-8000-00000000000b';
  const opId = (n: number) => `019966b0-0051-7000-8000-0000000002${String(n).padStart(2, '0')}`;
  const picked = (instrumentId: string, n: number): Cell => ({ value: { instrument_id: instrumentId, code: instrumentId === X ? '2E' : '3M' }, source_suggestion_id: null, op_id: opId(n) });

  function sec(n: number, test: Record<string, Cell> = {}, over: Partial<BlockRow> = {}): BlockRow {
    return {
      id: `019966b0-0051-7000-8000-0000000001${String(n).padStart(2, '0')}`,
      relatorio_id: REL,
      location_id: REL,
      equipment_id: `019966b0-0051-7000-8000-0000000003${String(n).padStart(2, '0')}`,
      block_type: 'chave_seccionadora',
      config: defaultBlockConfig('v2', 'chave_seccionadora', { subtype: 'manual' }),
      seed_version: 'v2',
      order_key: `a${n}`,
      feeds_block_id: null,
      not_tested: null,
      concluded_by: null,
      sheet: { ...emptySheet(), test: Object.fromEntries(Object.entries(test).map(([key, instrumentCell]) => [key, { cells: {}, instrument: instrumentCell }])) },
      created_by: null,
      first_edited_at: null,
      last_modified_by: null,
      last_modified_at: null,
      removed_at: null,
      ...over,
    };
  }

  const instruments = [instrument(), instrument({ id: Y, code: '3M', name: 'Microhmímetro', test_isolacao: null })];

  it('suggests the instrument last used for the test kind in the relatório, from its live registry row', () => {
    const earlier = sec(1, { isolacao: picked(Y, 1) });
    const later = sec(2, { isolacao: picked(X, 2), resistencia_contato: picked(Y, 3) });
    const target = sec(3);
    const snapshot = { blocks: [earlier, later, target], instruments };
    expect(suggestedInstrument(snapshot, target.id, 'isolacao')).toEqual(instrumentHeaderOf(instruments[0]!, 'isolacao'));
    expect(suggestedInstrument(snapshot, target.id, 'resistencia_contato')?.instrument_id).toBe(Y);
    // "Concluir ficha" writes one per enabled test that has a suggestion, in the definition's order.
    expect(suggestedInstruments(snapshot, target.id).map((s) => [s.testKey, s.header.instrument_id])).toEqual([
      ['isolacao', X],
      ['resistencia_contato', Y],
    ]);
  });

  it('suggests nothing when the cell is filled, with no prior use, when the instrument was removed, or on a sheet not tested or concluded', () => {
    const used = sec(1, { isolacao: picked(X, 1) });
    // The cell is filled: the picker shows what is stored.
    const filled = sec(2, { isolacao: picked(Y, 2) });
    expect(suggestedInstrument({ blocks: [used, filled], instruments }, filled.id, 'isolacao')).toBeNull();
    // No prior use for this test kind.
    const target = sec(3);
    expect(suggestedInstrument({ blocks: [used, target], instruments }, target.id, 'resistencia_contato')).toBeNull();
    expect(suggestedInstrument({ blocks: [target], instruments }, target.id, 'isolacao')).toBeNull();
    // X was removed from the registry.
    const removed = [{ ...instruments[0]!, removed_at: '2026-09-06T12:00:00.000Z' }, instruments[1]!];
    expect(suggestedInstrument({ blocks: [used, target], instruments: removed }, target.id, 'isolacao')).toBeNull();
    // A use on a removed block does not count.
    expect(suggestedInstrument({ blocks: [{ ...used, removed_at: '2026-09-06T12:00:00.000Z' }, target], instruments }, target.id, 'isolacao')).toBeNull();
    // Nothing would confirm it on a sheet not tested or already concluded.
    const notTested = sec(4, {}, { not_tested: { reason: 'outro', text: 'x', at: '2026-09-06T12:00:00.000Z', by: 'u1' } });
    const concluded = sec(5, {}, { concluded_by: { actor_id: 'u1', at: '2026-09-06T12:00:00.000Z' } });
    expect(suggestedInstrument({ blocks: [used, notTested], instruments }, notTested.id, 'isolacao')).toBeNull();
    expect(suggestedInstrument({ blocks: [used, concluded], instruments }, concluded.id, 'isolacao')).toBeNull();
    expect(suggestedInstruments({ blocks: [used, notTested], instruments }, notTested.id)).toEqual([]);
    // A test the block type does not have.
    expect(suggestedInstrument({ blocks: [used, target], instruments }, target.id, 'relacao_transformacao')).toBeNull();
    expect(suggestedInstrument({ blocks: [used], instruments }, 'nope', 'isolacao')).toBeNull();
  });
});
