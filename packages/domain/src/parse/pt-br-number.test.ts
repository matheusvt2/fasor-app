import { describe, expect, it } from 'vitest';
import { formatDecimalPtBr, parseDecimalPtBr } from './pt-br-number.ts';

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
