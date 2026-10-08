import { describe, expect, it } from 'vitest';
import { normalizeReadingValue, readingValueText } from './value.ts';

const kva = { kind: 'number', unit: 'kVA' } as const;
const kv = { kind: 'number', unit: 'kV' } as const;
const va = { kind: 'number', unit: 'VA' } as const;
const amps = { kind: 'number', unit: 'A' } as const;
const tokens = (...texts: string[]) => texts.map((text, index) => ({ id: `t${index}`, text }));
const number = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' });
const unitless = { kind: 'number' } as const;
const date = { kind: 'date' } as const;
const select = { kind: 'select' as const, options: ['EPÓXI', 'Á SECO'] };
const voltage = { kind: 'voltage_class', unit: 'kV' } as const;
const text = { kind: 'text' } as const;
const manufacturer = { kind: 'manufacturer' } as const;

describe('8.4-UNIT readingValueText', () => {
  it('reads a number raw, a date in pt-BR, a voltage class kV text and a string as it is', () => {
    expect(readingValueText(kva, { raw: '500', unit: 'kVA', state: 'measured' })).toBe('500');
    expect(readingValueText(date, '2024-08')).toBe('08/2024');
    expect(readingValueText(date, '2024-08-15')).toBe('15/08/2024');
    expect(readingValueText(voltage, '15 kV')).toBe('15');
    expect(readingValueText(voltage, '17.5')).toBe('17,5');
    expect(readingValueText(text, 'Dyn1')).toBe('Dyn1');
  });
});

describe('8.4-UNIT normalizeReadingValue', () => {
  it('number: keeps raw, takes the field unit, marks it measured', () => {
    expect(normalizeReadingValue(kva, { raw: '500', unit: 'kVA', state: 'measured' })).toEqual({
      ok: true,
      value: { raw: '500', unit: 'kVA', state: 'measured' },
      verify: false,
    });
    expect(normalizeReadingValue(kva, { raw: '0.50', unit: null, state: 'empty' })).toEqual({
      ok: true,
      value: { raw: '0.50', unit: 'kVA', state: 'measured' },
      verify: false,
    });
    expect(normalizeReadingValue(kva, { raw: '-3', unit: 'KVA', state: 'measured' })).toMatchObject({ ok: true, verify: false });
  });

  it('number: a model unit that is not the field unit asks for a check', () => {
    expect(normalizeReadingValue(kva, { raw: '500', unit: 'V', state: 'measured' })).toEqual({
      ok: true,
      value: { raw: '500', unit: 'kVA', state: 'measured' },
      verify: true,
    });
    expect(normalizeReadingValue(unitless, { raw: '3', unit: 'L', state: 'measured' })).toEqual({
      ok: true,
      value: { raw: '3', unit: null, state: 'measured' },
      verify: true,
    });
  });

  it('number: refuses a raw that is not a plain decimal and a value of another shape', () => {
    for (const raw of ['5,00', '1e3', '3.300.000', '', ' 5', '5.']) {
      expect(normalizeReadingValue(kva, { raw, unit: 'kVA', state: 'measured' })).toEqual({ ok: false, reason: 'invalid_shape' });
    }
    expect(normalizeReadingValue(kva, '500')).toEqual({ ok: false, reason: 'invalid_shape' });
    expect(normalizeReadingValue(kva, { raw: '500', unit: 'kVA', state: 'measured', extra: 1 })).toEqual({ ok: false, reason: 'invalid_shape' });
  });

  it('date: a valid ISO month or day', () => {
    expect(normalizeReadingValue(date, '2024-08')).toEqual({ ok: true, value: '2024-08', verify: false });
    expect(normalizeReadingValue(date, '2024-02-29')).toEqual({ ok: true, value: '2024-02-29', verify: false });
    for (const value of ['2024-13', '2023-02-29', '2024-00', '13/2024', '12', '20120', 'agosto de 2024']) {
      expect(normalizeReadingValue(date, value)).toEqual({ ok: false, reason: 'invalid_shape' });
    }
    // E78-Q3: a plate's month or day order is stored in the canonical shape.
    expect(normalizeReadingValue(date, '08/2024')).toEqual({ ok: true, value: '2024-08', verify: false });
    expect(normalizeReadingValue(date, '15/03/2019')).toEqual({ ok: true, value: '2019-03-15', verify: false });
  });

  it('AIR-V1 date: a bare year is kept as printed, never given a month', () => {
    expect(normalizeReadingValue(date, '2012')).toEqual({ ok: true, value: '2012', verify: false });
    expect(normalizeReadingValue(date, ' 2012 ')).toEqual({ ok: true, value: '2012', verify: false });
    expect(readingValueText(date, '2012')).toBe('2012');
  });

  it('select: an option ignoring case and accents, stored as the option', () => {
    expect(normalizeReadingValue(select, 'epoxi')).toEqual({ ok: true, value: 'EPÓXI', verify: false });
    expect(normalizeReadingValue(select, ' a  seco ')).toEqual({ ok: true, value: 'Á SECO', verify: false });
    expect(normalizeReadingValue(select, 'ÓLEO')).toEqual({ ok: false, reason: 'invalid_shape' });
  });

  it('voltage class: a kV number, stored as its kV text', () => {
    expect(normalizeReadingValue(voltage, '15 kV')).toEqual({ ok: true, value: '15', verify: false });
    expect(normalizeReadingValue(voltage, '17.5')).toEqual({ ok: true, value: '17,5', verify: false });
    expect(normalizeReadingValue(voltage, 'quinze')).toEqual({ ok: false, reason: 'invalid_shape' });
  });

  it('text and manufacturer: whitespace collapsed, never empty', () => {
    expect(normalizeReadingValue(text, '  TR -  01 ')).toEqual({ ok: true, value: 'TR - 01', verify: false });
    expect(normalizeReadingValue(manufacturer, 'Celtta\n')).toEqual({ ok: true, value: 'Celtta', verify: false });
    expect(normalizeReadingValue(text, '   ')).toEqual({ ok: false, reason: 'invalid_shape' });
    expect(normalizeReadingValue(manufacturer, { raw: '1', unit: null, state: 'measured' })).toEqual({ ok: false, reason: 'invalid_shape' });
  });
});

describe('AIR-1 normalizeReadingValue: a plate number in another unit of the field quantity', () => {
  it('V on a kV field is moved into kV; the digit rule reads the printed raw', () => {
    expect(normalizeReadingValue(kv, number('13800', 'V'), tokens('13.800', 'V'))).toEqual({
      ok: true,
      value: { raw: '13.8', unit: 'kV', state: 'measured' },
      verify: false,
      printedText: '13800',
    });
  });

  it('a model that drops the unit takes the unit the tokens print', () => {
    expect(normalizeReadingValue(kv, number('13800', null), tokens('13.800', 'V'))).toMatchObject({ value: { raw: '13.8', unit: 'kV' }, verify: false, printedText: '13800' });
  });

  it('a model that keeps the pt-BR thousands dot takes the printed pt-BR number, and asks for a check', () => {
    expect(normalizeReadingValue(kv, number('13.800', 'V'), tokens('13.800', 'V'))).toMatchObject({ value: { raw: '13.8', unit: 'kV' }, verify: true, printedText: '13.800' });
  });

  it('MVA on a kVA field, kVA on a VA field, kA on an A field, with pt-BR decimal commas printed', () => {
    expect(normalizeReadingValue(kva, number('1.5', 'MVA'), tokens('1,5', 'MVA'))).toMatchObject({ value: { raw: '1500', unit: 'kVA' }, verify: false });
    expect(normalizeReadingValue(va, number('0.5', 'kVA'), tokens('0,5', 'kVA'))).toMatchObject({ value: { raw: '500', unit: 'VA' }, verify: false });
    expect(normalizeReadingValue(amps, number('1.25', 'kA'), tokens('1,25', 'kA'))).toMatchObject({ value: { raw: '1250', unit: 'A' }, verify: false });
  });

  it('the same unit in another case is no conversion and no check', () => {
    expect(normalizeReadingValue(kva, number('500', 'KVA'), tokens('500', 'KVA'))).toEqual({ ok: true, value: { raw: '500', unit: 'kVA', state: 'measured' }, verify: false });
  });

  it('a unit of another quantity or an unknown unit keeps the raw and asks for a check', () => {
    expect(normalizeReadingValue(kva, number('500', 'V'), tokens('500', 'V'))).toEqual({ ok: true, value: { raw: '500', unit: 'kVA', state: 'measured' }, verify: true });
    expect(normalizeReadingValue(kv, number('15', 'kVef'), tokens('15', 'kVef'))).toEqual({ ok: true, value: { raw: '15', unit: 'kV', state: 'measured' }, verify: true });
  });

  it('a model unit the tokens contradict keeps the model pair and asks for a check', () => {
    expect(normalizeReadingValue(kv, number('13.8', 'kV'), tokens('13.800', 'V'))).toEqual({ ok: true, value: { raw: '13.8', unit: 'kV', state: 'measured' }, verify: true });
  });

  it('a unit stuck to the number is still read', () => {
    expect(normalizeReadingValue(kv, number('13800', 'V'), tokens('13.800V'))).toMatchObject({ value: { raw: '13.8', unit: 'kV' }, verify: false });
    expect(normalizeReadingValue(kv, number('13800', null), tokens('13.800V'))).toMatchObject({ value: { raw: '13.8', unit: 'kV' }, verify: false });
  });

  it('no unit anywhere is stored under the field unit as before', () => {
    expect(normalizeReadingValue(kv, number('15', null), tokens('15'))).toEqual({ ok: true, value: { raw: '15', unit: 'kV', state: 'measured' }, verify: false });
  });

  it('a wrong digit is converted from the model raw, never replaced by the print (the digit rule flags it)', () => {
    expect(normalizeReadingValue(kv, number('13900', 'V'), tokens('13.800', 'V'))).toMatchObject({ value: { raw: '13.9', unit: 'kV' }, verify: false, printedText: '13900' });
  });

  it('a signed raw is compared by magnitude with the unsigned print', () => {
    expect(normalizeReadingValue(kva, number('-3', 'kVA'), tokens('-3', 'kVA'))).toEqual({ ok: true, value: { raw: '-3', unit: 'kVA', state: 'measured' }, verify: false });
  });

  it('two numbers in the tokens skip the printed-number check', () => {
    expect(normalizeReadingValue(amps, number('200', 'A'), tokens('200-5', 'A'))).toEqual({ ok: true, value: { raw: '200', unit: 'A', state: 'measured' }, verify: false });
  });

  it('a voltage class printed in V is moved into kV and keeps the printed text for the digit rule', () => {
    expect(normalizeReadingValue(voltage, '13.800 V', tokens('13.800', 'V'))).toEqual({ ok: true, value: '13,8', verify: false, printedText: '13.800 V' });
    expect(normalizeReadingValue(voltage, '15000V')).toEqual({ ok: true, value: '15', verify: false, printedText: '15000V' });
    expect(normalizeReadingValue(voltage, '15 A')).toEqual({ ok: false, reason: 'invalid_shape' });
  });
});
