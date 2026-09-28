import { describe, expect, it } from 'vitest';
import type { WordRow } from '../registry/word-row.ts';
import { assessReadingValue, type ReadingRegistry } from './assess.ts';
import { digitCoverage, digitsOf, inTokenOrder, tokenIndex } from './digits.ts';

const token = (index: number, text: string) => ({ id: `t${index}`, text });
const none: ReadingRegistry = { manufacturers: [], voltageClasses: [] };

let seq = 0;
function word(kind: 'manufacturer' | 'voltage_class', name: string, removed = false): WordRow {
  seq += 1;
  return {
    id: `019966b0-0000-7000-8000-${String(seq).padStart(12, '0')}`,
    kind,
    name,
    gender: null,
    number: null,
    removed_at: removed ? '2026-09-20T10:00:00.000Z' : null,
  } as WordRow;
}

const text = { kind: 'text' } as const;
const number = { kind: 'number' } as const;

describe('8.5-UNIT digits', () => {
  it('keeps 0-9 only', () => {
    expect(digitsOf('TSE-500/15')).toBe('50015');
    expect(digitsOf('Celtta')).toBe('');
    expect(digitsOf('17,5 kV')).toBe('175');
  });

  it('reads token ids and orders tokens by them, not by citation', () => {
    expect(tokenIndex('t42')).toBe(42);
    expect(tokenIndex('w1')).toBe(Number.POSITIVE_INFINITY);
    expect(inTokenOrder([token(10, 'b'), token(2, 'a')]).map((t) => t.id)).toEqual(['t2', 't10']);
  });
});

describe('8.5-UNIT digit coverage (Story 8.5 AC 1)', () => {
  const serial = [token(9, '240815-07')];

  it('a text value: an extra digit and a missing digit are verify, an exact match is suggested', () => {
    const extra = assessReadingValue({ field: text, value: '2408150-07', cited: serial, registry: none });
    const missing = assessReadingValue({ field: text, value: '24081-07', cited: serial, registry: none });
    const exact = assessReadingValue({ field: text, value: '240815-07', cited: serial, registry: none });
    expect([extra.trust, missing.trust, exact.trust]).toEqual(['verify', 'verify', 'suggested']);
  });

  it('a number value: an extra digit and a missing digit are verify, an exact match is suggested', () => {
    const cited = [token(22, '500'), token(23, 'kVA')];
    const shape = (raw: string) => ({ raw, unit: 'kVA', state: 'measured' });
    const extra = assessReadingValue({ field: number, value: shape('5000'), cited, registry: none });
    const missing = assessReadingValue({ field: number, value: shape('50'), cited, registry: none });
    const exact = assessReadingValue({ field: number, value: shape('500'), cited, registry: none });
    expect([extra.trust, missing.trust, exact.trust]).toEqual(['verify', 'verify', 'suggested']);
  });

  it('a value without digits citing a token with one is the missing-digit case', () => {
    expect(assessReadingValue({ field: text, value: 'Dyn', cited: [token(42, 'Dyn1')], registry: none }).trust).toBe('verify');
    expect(assessReadingValue({ field: text, value: 'Dyn1', cited: [token(42, 'Dyn1')], registry: none }).trust).toBe('suggested');
  });

  it('a date compares through its pt-BR display', () => {
    const field = { kind: 'date' } as const;
    expect(assessReadingValue({ field, value: '2024-08', cited: [token(29, '08/2024')], registry: none }).trust).toBe('suggested');
    expect(assessReadingValue({ field, value: '2024-08', cited: [token(29, '08.24')], registry: none }).trust).toBe('verify');
    expect(assessReadingValue({ field, value: '2024-08-15', cited: [token(1, '15/08/2024')], registry: none }).trust).toBe('suggested');
  });

  it('a voltage class compares through its kV text', () => {
    const field = { kind: 'voltage_class' } as const;
    const registry = { manufacturers: [], voltageClasses: [word('voltage_class', '17,5')] };
    expect(assessReadingValue({ field, value: '17,5', cited: [token(3, '17,5'), token(4, 'kV')], registry }).trust).toBe('suggested');
    expect(assessReadingValue({ field, value: '17,5', cited: [token(3, '1,75'), token(4, 'kV')], registry }).trust).toBe('suggested');
    expect(assessReadingValue({ field, value: '17,5', cited: [token(3, '17'), token(4, 'kV')], registry }).trust).toBe('verify');
  });

  it('reads the cited tokens in token-array order, whatever order they were cited in', () => {
    const cited = [token(8, '15'), token(7, '08')];
    expect(digitCoverage('0815', cited)).toBe(true);
    expect(digitCoverage('1508', cited)).toBe(false);
    expect(assessReadingValue({ field: text, value: '08-15', cited, registry: none }).trust).toBe('suggested');
  });

  it('a normalization verdict forces verify even when the digits match', () => {
    const cited = [token(22, '500'), token(23, 'V')];
    const value = { raw: '500', unit: 'kVA', state: 'measured' };
    expect(assessReadingValue({ field: number, value, cited, registry: none, verify: true }).trust).toBe('verify');
  });
});

describe('8.5-UNIT registries (Story 8.5 AC 2)', () => {
  const voltage = { kind: 'voltage_class' } as const;
  const manufacturer = { kind: 'manufacturer' } as const;

  it('a voltage class in the registry is suggested and stores the registry name; out of it, verify', () => {
    const registry = { manufacturers: [], voltageClasses: [word('voltage_class', '15,0'), word('voltage_class', '36,2')] };
    const cited = [token(1, '15'), token(2, 'kV')];
    expect(assessReadingValue({ field: voltage, value: '15', cited, registry })).toEqual({ value: '15,0', trust: 'suggested', hint: null });
    const absent = assessReadingValue({ field: voltage, value: '23', cited: [token(1, '23'), token(2, 'kV')], registry });
    expect(absent).toEqual({ value: '23', trust: 'verify', hint: null });
  });

  it('a removed voltage class does not count', () => {
    const registry = { manufacturers: [], voltageClasses: [word('voltage_class', '15', true)] };
    expect(assessReadingValue({ field: voltage, value: '15', cited: [token(1, '15')], registry }).trust).toBe('verify');
  });

  it('a manufacturer in the registry stores its canonical name and no hint', () => {
    const registry = { manufacturers: [word('manufacturer', 'Schneider Electric')], voltageClasses: [] };
    const result = assessReadingValue({ field: manufacturer, value: 'SCHNEIDER  ELECTRIC', cited: [token(6, 'SCHNEIDER'), token(7, 'ELECTRIC')], registry });
    expect(result).toEqual({ value: 'Schneider Electric', trust: 'suggested', hint: null });
  });

  it('an unknown manufacturer is suggested with the create hint naming the value', () => {
    const registry = { manufacturers: [word('manufacturer', 'WEG'), word('manufacturer', 'Celtta', true)], voltageClasses: [] };
    const result = assessReadingValue({ field: manufacturer, value: 'Celtta', cited: [token(6, 'Celtta')], registry });
    expect(result).toEqual({ value: 'Celtta', trust: 'suggested', hint: { create_registry_entry: { kind: 'manufacturer', name: 'Celtta' } } });
  });

  it('an unknown manufacturer failing the digit rule is verify and keeps the hint', () => {
    const result = assessReadingValue({ field: manufacturer, value: 'Celtta', cited: [token(6, 'Celtta2')], registry: none });
    expect(result.trust).toBe('verify');
    expect(result.hint).toEqual({ create_registry_entry: { kind: 'manufacturer', name: 'Celtta' } });
  });
});
