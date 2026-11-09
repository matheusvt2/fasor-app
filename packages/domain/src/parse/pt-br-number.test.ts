import { describe, expect, it } from 'vitest';
import {
  canonicalDecimal,
  formatDecimalGroupedPtBr,
  INSULATION_UNITS,
  isNotApplicableNumber,
  isNotApplicableText,
  NOT_APPLICABLE_NUMBER,
  NOT_APPLICABLE_TEXT,
  numberEchoText,
  formatNumberListPtBr,
  formatOverSqrt3PtBr,
  parseDecimalPtBr,
  parseNumberListPtBr,
  parseOverSqrt3PtBr,
  parseReadingPtBr,
  parseVoltagePairPtBr,
  readNumberListRaw,
  readOverSqrt3Raw,
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
    // E5-Q7: a lowercase m with the ohm is milliohm, refused; mega spellings stay mega.
    expect(parseReadingPtBr('147 mΩ', insulation)).toBe('invalid');
    expect(parseReadingPtBr('147 mohm', insulation)).toBe('invalid');
    expect(parseReadingPtBr('147mohms', insulation)).toBe('invalid');
    expect(parseReadingPtBr('147 MΩ', insulation)).toEqual({ raw: '147', unit: 'MΩ' });
    expect(parseReadingPtBr('147M', insulation)).toEqual({ raw: '147', unit: 'MΩ' });
    expect(parseReadingPtBr('147 m', insulation)).toEqual({ raw: '147', unit: 'MΩ' });
    expect(parseReadingPtBr('147 Mohm', insulation)).toEqual({ raw: '147', unit: 'MΩ' });
  });

  it('empty is null, no number is invalid', () => {
    expect(parseReadingPtBr('  ', insulation)).toBeNull();
    expect(parseReadingPtBr('abc', insulation)).toBe('invalid');
    expect(parseReadingPtBr('G', insulation)).toBe('invalid');
    expect(parseReadingPtBr('-', insulation)).toBe('invalid');
    expect(parseReadingPtBr('-330', insulation)).toBe('invalid');
    expect(parseReadingPtBr('-5', micro)).toBe('invalid');
    expect(parseReadingPtBr(' -1,5 ', { units: [], defaultUnit: null })).toBe('invalid');
    expect(parseReadingPtBr('-147G', insulation)).toBe('invalid');
    expect(parseDecimalPtBr('-5')).toBe('-5');
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

describe('16.4-UNIT the "N.A" spellings and value (contract 26)', () => {
  it('accepts N.A, NA, N/A and N.A. in any case, whitespace anywhere', () => {
    for (const typed of ['N.A', 'NA', 'N/A', 'N.A.', 'n.a', 'na', 'n/a', 'n.a.', 'Na', ' n . a ', 'N / A', '\tN.A.\n']) {
      expect(isNotApplicableText(typed), typed).toBe(true);
    }
  });

  it('refuses anything else', () => {
    for (const typed of ['', 'N', 'A', 'N.A.A', 'NAO', 'n-a', 'N.A 5', 'N..A', 'N.A./', 'NA.', '5']) {
      expect(isNotApplicableText(typed), typed).toBe(false);
    }
  });

  it('17.3: shows "N/A" and stores the frozen fourth state with no raw nor unit', () => {
    expect(NOT_APPLICABLE_TEXT).toBe('N/A');
    expect(NOT_APPLICABLE_NUMBER).toEqual({ raw: '', unit: null, state: 'not_applicable' });
    expect(Object.isFrozen(NOT_APPLICABLE_NUMBER)).toBe(true);
    expect(isNotApplicableNumber(NOT_APPLICABLE_NUMBER)).toBe(true);
    expect(isNotApplicableNumber({ raw: '', unit: null, state: 'not_applicable' })).toBe(true);
    for (const other of [null, undefined, 'N.A', { raw: '', unit: null, state: 'empty' }, { raw: '5', unit: 'kV', state: 'measured' }, ['not_applicable']]) {
      expect(isNotApplicableNumber(other)).toBe(false);
    }
  });
});

describe('fix batch fxpw G4: the two-level voltage "380/220" (FO.SERV-03 practice)', () => {
  it('parses two non-negative pt-BR numbers around one slash into dot-decimal sides', () => {
    expect(parseVoltagePairPtBr('380/220')).toBe('380/220');
    expect(parseVoltagePairPtBr(' 380 / 220 ')).toBe('380/220');
    expect(parseVoltagePairPtBr('13,8/7,97')).toBe('13.8/7.97');
    expect(parseVoltagePairPtBr('13.800/7.970')).toBe('13800/7970');
    for (const typed of ['380/', '/220', '-380/220', '380/-220', '+380/220', '380/220/127', 'abc', '380', '', '/', 'N/A', '380/abc']) {
      expect(parseVoltagePairPtBr(typed), typed).toBeNull();
    }
  });

  it('formats each side of a stored pair the way a single number reads; any other text unchanged', () => {
    expect(formatDecimalGroupedPtBr('380/220')).toBe('380/220');
    expect(formatDecimalGroupedPtBr('13.8/7.97')).toBe('13,8/7,97');
    expect(formatDecimalGroupedPtBr('13800/7970')).toBe('13.800/7.970');
    expect(formatDecimalGroupedPtBr('n/a')).toBe('n/a');
    expect(formatDecimalGroupedPtBr('380/')).toBe('380/');
    expect(numberEchoText('380/220', 'V')).toBe('= 380/220 V');
  });
});

describe('23.7-UNIT parseNumberListPtBr: the plate\'s list of values (TAPS)', () => {
  it('reads two or more pt-BR numbers separated by ";", "·" or spaces, in order, canonical', () => {
    expect(parseNumberListPtBr('13,8; 13,2; 12,6; 12; 11,4', { unit: 'kV' })).toBe('13.8;13.2;12.6;12;11.4');
    expect(parseNumberListPtBr('13,8 · 13,2 · 12,6', { unit: 'kV' })).toBe('13.8;13.2;12.6');
    expect(parseNumberListPtBr('  13,8   13,2 ;; 12,60 ', { unit: 'kV' })).toBe('13.8;13.2;12.6');
    expect(parseNumberListPtBr('13.800;13.200', { unit: 'V' })).toBe('13800;13200');
    expect(parseNumberListPtBr('1,5; 2', { unit: 'A' })).toBe('1.5;2');
  });

  it('refuses one entry, a repeat (once canonical), a sign, zero, a non-number and a value not whole in volts', () => {
    for (const text of ['13,8', '', ';', '12; 12,0', '13,8; -13,2', '+13,8; 13,2', '0; 13,2', '13,8; doze', '13,8, 13,2'])
      expect(parseNumberListPtBr(text, { unit: 'kV' }), text).toBeNull();
    expect(parseNumberListPtBr('13,8505; 13,2', { unit: 'kV' })).toBeNull();
    expect(parseNumberListPtBr('13800,5; 13200', { unit: 'V' })).toBeNull();
    // A unit with no volts reads any positive decimal.
    expect(parseNumberListPtBr('13,8505; 13,2', { unit: 'A' })).toBe('13.8505;13.2');
  });

  it('reads back a stored list and shows it with "·"; any other raw reads none and shows as it is', () => {
    expect(readNumberListRaw('13.8;13.2;12')).toEqual(['13.8', '13.2', '12']);
    for (const raw of ['13.8', '13.8;13.8', '13,8;13,2', '13.8;', '', null, 13.8]) expect(readNumberListRaw(raw), String(raw)).toBeNull();
    expect(formatNumberListPtBr('13.8;13.2;12.6;12;11.4')).toBe('13,8 · 13,2 · 12,6 · 12 · 11,4');
    expect(formatNumberListPtBr('13800;13200')).toBe('13.800 · 13.200');
    expect(formatNumberListPtBr('13.8')).toBe('13.8');
  });
});

describe('23.7-UNIT parseOverSqrt3PtBr: a value over √3 (the TP\'s "115/√3")', () => {
  it('reads "N/√3", "N/V3", "N/raiz3" in any case, spaces allowed, stored "N/√3" canonical', () => {
    for (const text of ['115/√3', '115/V3', '115/v3', '115/raiz3', '115/RAIZ3', ' 115 / raiz 3 ', '115,0/√3']) expect(parseOverSqrt3PtBr(text), text).toBe('115/√3');
    expect(parseOverSqrt3PtBr('13,8/√3')).toBe('13.8/√3');
    expect(parseOverSqrt3PtBr('13.800/√3')).toBe('13800/√3');
  });

  it('refuses "/√3" alone, another root, a sign, zero and a plain number', () => {
    for (const text of ['/√3', '√3', '115/√2', '115/√', '-115/√3', '0/√3', '115', 'x/√3', '115/√3/√3']) expect(parseOverSqrt3PtBr(text), text).toBeNull();
  });

  it('reads back a stored "N/√3" and shows it pt-BR', () => {
    expect(readOverSqrt3Raw('115/√3')).toBe('115');
    expect(readOverSqrt3Raw('13.8/√3')).toBe('13.8');
    for (const raw of ['115', '115/V3', '13,8/√3', null]) expect(readOverSqrt3Raw(raw), String(raw)).toBeNull();
    expect(formatOverSqrt3PtBr('13.8/√3')).toBe('13,8/√3');
    expect(formatOverSqrt3PtBr('13800/√3')).toBe('13.800/√3');
    expect(formatOverSqrt3PtBr('115')).toBe('115');
  });
});
