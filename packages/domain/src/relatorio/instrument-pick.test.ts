import { describe, expect, it } from 'vitest';
import type { InstrumentRow } from '../registry/instrument-row.ts';
import { emptySheet, type BlockRow, type Cell } from '../schemas/entities.ts';
import {
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
