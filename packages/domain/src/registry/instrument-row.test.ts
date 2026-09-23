import { describe, expect, it } from 'vitest';
import type { CalibrationStatus } from '../checks/calibration.ts';
import {
  compareInstrumentRows,
  instrumentManufacturerRecents,
  instrumentRegistryRowText,
  sortInstrumentRegistryRows,
  type InstrumentRow,
  wordRowByName,
} from './instrument-row.ts';
import type { WordRow } from './word-row.ts';

function instrument(overrides: Partial<InstrumentRow> = {}): InstrumentRow {
  return {
    id: '019966b0-0005-7000-8000-000000000001',
    kind: 'instrument',
    code: '2E',
    name: 'Megôhmetro digital DMG10Ki',
    manufacturer: 'Instrum',
    model: 'DMG10Ki',
    serial: 'IN919021-25945',
    cert_number: '37428/26',
    laboratory: null,
    calibrated_at: '2026-08-28',
    calibration_interval_months: 12,
    rbc_accredited: true,
    test_isolacao: { raw: '10', unit: 'kV' },
    test_resistencia_contato: null,
    test_relacao_transformacao: null,
    certificate_file_id: null,
    removed_at: null,
    ...overrides,
  } as InstrumentRow;
}

describe('instrumentRegistryRowText', () => {
  it('composes the primary and secondary text (mock 2E row)', () => {
    const text = instrumentRegistryRowText(instrument(), 'valid');
    expect(text.code).toBe('2E');
    expect(text.primaryRest).toBe('— Megôhmetro digital DMG10Ki DMG10Ki');
    expect(text.secondaryLead).toBe('Instrum · série IN919021-25945 · RBC 37428/26');
    expect(text.validity).toEqual({ text: 'Válida até 28/08/2027', expired: false });
  });

  it('flags an expired validity for the amber row text', () => {
    const text = instrumentRegistryRowText(
      instrument({ calibrated_at: '2025-01-01', calibration_interval_months: 12 }),
      'expired',
    );
    expect(text.validity).toEqual({ text: 'Vencida em 01/01/2026', expired: true });
  });

  it('has no validity clause with no calibration data yet', () => {
    const text = instrumentRegistryRowText(instrument({ calibrated_at: null }), 'valid');
    expect(text.validity).toBeNull();
  });

  it('skips missing manufacturer/serial/cert parts', () => {
    const text = instrumentRegistryRowText(instrument({ manufacturer: null, serial: null, cert_number: null }), 'valid');
    expect(text.secondaryLead).toBe('');
  });
});

describe('sortInstrumentRegistryRows', () => {
  const now = new Date('2026-09-22T12:00:00.000Z');

  it('sorts expired rows first, then alphabetically by code', () => {
    const expired = instrument({ code: '5A', calibrated_at: '2020-01-01', calibration_interval_months: 12 });
    const valid1 = instrument({ code: '3M' });
    const valid2 = instrument({ code: '1T' });
    const sorted = sortInstrumentRegistryRows([valid1, valid2, expired], now);
    expect(sorted.map((s) => s.instrument.code)).toEqual(['5A', '1T', '3M']);
    expect(sorted[0]!.status).toBe('expired');
  });
});

describe('compareInstrumentRows', () => {
  it('ranks expired before expiring and valid', () => {
    const rows: { instrument: InstrumentRow; status: CalibrationStatus }[] = [
      { instrument: instrument({ code: 'B' }), status: 'valid' },
      { instrument: instrument({ code: 'A' }), status: 'expired' },
    ];
    expect([...rows].sort(compareInstrumentRows).map((r) => r.instrument.code)).toEqual(['A', 'B']);
  });
});

describe('instrumentManufacturerRecents (Epic 2 retro D-2)', () => {
  const maker = (id: string, name: string) =>
    ({ id, kind: 'manufacturer', name, gender: null, number: null, removed_at: null }) as WordRow;
  const makers = [maker('m-hitech', 'Hi-Tech'), maker('m-instrum', 'Instrum'), maker('m-megabras', 'Megabras'), maker('m-weg', 'WEG')];

  it('puts the current value first, then the most used, ties by name', () => {
    const instruments = [
      instrument({ manufacturer: 'hi-tech' }),
      instrument({ manufacturer: 'Hi-Tech' }),
      instrument({ manufacturer: 'Megabras' }),
      instrument({ manufacturer: 'Instrum' }),
      instrument({ manufacturer: 'Sem cadastro' }),
    ];
    expect(instrumentManufacturerRecents('WEG', instruments, makers)).toEqual(['m-weg', 'm-hitech', 'm-instrum', 'm-megabras']);
    expect(instrumentManufacturerRecents(null, instruments, makers, 2)).toEqual(['m-hitech', 'm-instrum']);
  });

  it('finds an entry by its normalized name, never a blank one', () => {
    expect(wordRowByName(' MEGABRAS ', makers)?.id).toBe('m-megabras');
    expect(wordRowByName('', makers)).toBeNull();
    expect(wordRowByName(null, makers)).toBeNull();
  });
});
