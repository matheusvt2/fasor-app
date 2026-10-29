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
  parseDecimalPtBr,
  parseReadingPtBr,
  parseVoltagePairPtBr,
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
