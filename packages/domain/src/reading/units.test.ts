import { describe, expect, it } from 'vitest';
import { convertReadingUnit, parseSiUnit } from './units.ts';

describe('AIR-1 parseSiUnit', () => {
  it('reads the prefix and the base of the units the nameplates use', () => {
    expect(parseSiUnit('V')).toEqual({ power: 0, base: 'V' });
    expect(parseSiUnit('kV')).toEqual({ power: 3, base: 'V' });
    expect(parseSiUnit('KV')).toEqual({ power: 3, base: 'V' });
    expect(parseSiUnit('kv')).toEqual({ power: 3, base: 'V' });
    expect(parseSiUnit('VA')).toEqual({ power: 0, base: 'VA' });
    expect(parseSiUnit('kVA')).toEqual({ power: 3, base: 'VA' });
    expect(parseSiUnit('KVA')).toEqual({ power: 3, base: 'VA' });
    expect(parseSiUnit('MVA')).toEqual({ power: 6, base: 'VA' });
    expect(parseSiUnit('A')).toEqual({ power: 0, base: 'A' });
    expect(parseSiUnit('kA')).toEqual({ power: 3, base: 'A' });
    expect(parseSiUnit('mA')).toEqual({ power: -3, base: 'A' });
    expect(parseSiUnit('L')).toEqual({ power: 0, base: 'L' });
    expect(parseSiUnit('%')).toEqual({ power: 0, base: '%' });
    expect(parseSiUnit(' kV. ')).toEqual({ power: 3, base: 'V' });
  });

  it('reads the ohm family with every micro spelling', () => {
    expect(parseSiUnit('µΩ')).toEqual({ power: -6, base: 'Ω' });
    expect(parseSiUnit('μΩ')).toEqual({ power: -6, base: 'Ω' });
    expect(parseSiUnit('uΩ')).toEqual({ power: -6, base: 'Ω' });
    expect(parseSiUnit('MΩ')).toEqual({ power: 6, base: 'Ω' });
    expect(parseSiUnit('GΩ')).toEqual({ power: 9, base: 'Ω' });
    expect(parseSiUnit('TΩ')).toEqual({ power: 12, base: 'Ω' });
    expect(parseSiUnit('ohms')).toEqual({ power: 0, base: 'Ω' });
  });

  it('refuses what is not a known unit', () => {
    for (const text of ['', ' ', 'kVef', 'Vcc', 'k', 'k%', 'xV', 'kVAr', 'POTÊNCIA', '°C']) expect(parseSiUnit(text), text).toBeNull();
  });
});

describe('AIR-1 convertReadingUnit', () => {
  it('moves a value between units of one base by a decimal shift', () => {
    expect(convertReadingUnit('13800', 'V', 'kV')).toBe('13.8');
    expect(convertReadingUnit('13.8', 'kV', 'V')).toBe('13800');
    expect(convertReadingUnit('1.5', 'MVA', 'kVA')).toBe('1500');
    expect(convertReadingUnit('0.5', 'kVA', 'VA')).toBe('500');
    expect(convertReadingUnit('1.25', 'kA', 'A')).toBe('1250');
    expect(convertReadingUnit('630', 'A', 'kA')).toBe('0.63');
    expect(convertReadingUnit('380', 'V', 'kV')).toBe('0.38');
    expect(convertReadingUnit('3300', 'MΩ', 'GΩ')).toBe('3.3');
  });

  it('keeps the raw as given for the same power, whatever the case', () => {
    expect(convertReadingUnit('500', 'KVA', 'kVA')).toBe('500');
    expect(convertReadingUnit('0.50', 'kVA', 'kVA')).toBe('0.50');
  });

  it('is null for another quantity or an unknown unit', () => {
    expect(convertReadingUnit('500', 'V', 'kVA')).toBeNull();
    expect(convertReadingUnit('15', 'kVef', 'kV')).toBeNull();
    expect(convertReadingUnit('15', 'kV', 'L')).toBeNull();
  });
});
