import { describe, expect, it } from 'vitest';
import {
  canonicalDecimal,
  formatDecimalGroupedPtBr,
  formatDecimalPtBr,
  INSULATION_UNITS,
  numberEchoText,
  parseDecimalPtBr,
  parseReadingPtBr,
} from './pt-br-number.ts';

describe('5.3-UNIT parseDecimalPtBr (EXPERIENCE.md › Measurement field, Parsing)', () => {
  it('a dot followed by exactly three digits and no comma is a thousands separator', () => {
    expect(parseDecimalPtBr('3.300')).toBe('3300');
    expect(parseDecimalPtBr('1.234.567')).toBe('1234567');
  });

  it('any other dot is a decimal', () => {
    expect(parseDecimalPtBr('3.7')).toBe('3.7');
    expect(parseDecimalPtBr('3.30')).toBe('3.30');
    expect(parseDecimalPtBr('0.0045')).toBe('0.0045');
  });

  it('a leading zero group is never a thousands separator (nobody writes "0.500" for five hundred)', () => {
    expect(parseDecimalPtBr('0.500')).toBe('0.500');
    expect(parseDecimalPtBr('0.025')).toBe('0.025');
    expect(parseDecimalPtBr('00.500')).toBe('00.500');
  });

  it('the comma is the decimal separator', () => {
    expect(parseDecimalPtBr('13,8')).toBe('13.8');
    expect(parseDecimalPtBr('1.234,5')).toBe('1234.5');
    expect(parseDecimalPtBr(',5')).toBe('0.5');
    expect(parseDecimalPtBr(' 630 ')).toBe('630');
    expect(parseDecimalPtBr('-2,5')).toBe('-2.5');
  });

  it('text that holds no number is null', () => {
    expect(parseDecimalPtBr('')).toBeNull();
    expect(parseDecimalPtBr('   ')).toBeNull();
    expect(parseDecimalPtBr('abc')).toBeNull();
    expect(parseDecimalPtBr('13,8,1')).toBeNull();
    expect(parseDecimalPtBr('12.34,5')).toBeNull();
    expect(parseDecimalPtBr('15 kV')).toBeNull();
  });

  it('formats a dot-decimal raw back to pt-BR', () => {
    expect(formatDecimalPtBr('13.8')).toBe('13,8');
    expect(formatDecimalPtBr('630')).toBe('630');
  });
});

describe('5.5-UNIT parseReadingPtBr, formatDecimalGroupedPtBr, numberEchoText', () => {
  const insulation = { units: INSULATION_UNITS, defaultUnit: 'MΩ' };
  const micro = { units: ['µΩ'], defaultUnit: 'µΩ' };

  it('reads the pt-BR number the same way, in one canonical raw', () => {
    expect(parseReadingPtBr('3.300', insulation)).toEqual({ raw: '3300', unit: 'MΩ' });
    expect(parseReadingPtBr('3.7', insulation)).toEqual({ raw: '3.7', unit: 'MΩ' });
    expect(parseReadingPtBr('13,8', micro)).toEqual({ raw: '13.8', unit: 'µΩ' });
    expect(parseReadingPtBr('0.500', insulation)).toEqual({ raw: '0.5', unit: 'MΩ' });
    expect(parseReadingPtBr('120,00', { units: [], defaultUnit: null })).toEqual({ raw: '120', unit: null });
  });

  it('a unit suffix sets the unit on the insulation family only', () => {
    expect(parseReadingPtBr('147G', insulation)).toEqual({ raw: '147', unit: 'GΩ' });
    expect(parseReadingPtBr('330M', insulation)).toEqual({ raw: '330', unit: 'MΩ' });
    expect(parseReadingPtBr('3.7T', insulation)).toEqual({ raw: '3.7', unit: 'TΩ' });
    expect(parseReadingPtBr('147 g', insulation)).toEqual({ raw: '147', unit: 'GΩ' });
    expect(parseReadingPtBr('147 GΩ', insulation)).toEqual({ raw: '147', unit: 'GΩ' });
    expect(parseReadingPtBr('330 Ω', insulation)).toEqual({ raw: '330', unit: 'MΩ' });
    expect(parseReadingPtBr('147G', micro)).toBe('invalid');
  });

  it('empty is null, no number is invalid', () => {
    expect(parseReadingPtBr('  ', insulation)).toBeNull();
    expect(parseReadingPtBr('abc', insulation)).toBe('invalid');
    expect(parseReadingPtBr('G', insulation)).toBe('invalid');
    expect(parseReadingPtBr('-', insulation)).toBe('invalid');
  });

  it('groups thousands and echoes', () => {
    expect(formatDecimalGroupedPtBr('3300')).toBe('3.300');
    expect(formatDecimalGroupedPtBr('1234.5')).toBe('1.234,5');
    expect(formatDecimalGroupedPtBr('1234567')).toBe('1.234.567');
    expect(formatDecimalGroupedPtBr('0.5')).toBe('0,5');
    expect(formatDecimalGroupedPtBr('-1234')).toBe('-1.234');
    expect(formatDecimalGroupedPtBr('n/a')).toBe('n/a');
    expect(numberEchoText('3300', 'MΩ')).toBe('= 3.300 MΩ');
    expect(numberEchoText('3300', null)).toBe('= 3.300');
    expect(canonicalDecimal('007.2500')).toBe('7.25');
    expect(canonicalDecimal('-0.0')).toBe('0');
  });
});
