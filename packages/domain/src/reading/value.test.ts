import { describe, expect, it } from 'vitest';
import { normalizeReadingValue, readingValueText } from './value.ts';

const kva = { kind: 'number', unit: 'kVA' } as const;
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
    for (const value of ['2024-13', '2023-02-29', '2024-00', '13/2024', '2012', 'agosto de 2024']) {
      expect(normalizeReadingValue(date, value)).toEqual({ ok: false, reason: 'invalid_shape' });
    }
    // E78-Q3: a plate's month or day order is stored in the canonical shape.
    expect(normalizeReadingValue(date, '08/2024')).toEqual({ ok: true, value: '2024-08', verify: false });
    expect(normalizeReadingValue(date, '15/03/2019')).toEqual({ ok: true, value: '2019-03-15', verify: false });
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
