import { describe, expect, it } from 'vitest';
import type { RegistryRow } from '../schemas/entities.ts';
import { compareWordRows, parseVoltageClassKv, sortWordRegistryRows, wordRegistryRowText, type WordRow } from './word-row.ts';

function manufacturer(overrides: Partial<WordRow> = {}): WordRow {
  return {
    id: '019966b0-0004-7000-8000-000000000001',
    kind: 'manufacturer',
    name: 'Schneider',
    gender: null,
    number: null,
    removed_at: null,
    ...overrides,
  } as Extract<RegistryRow, { kind: 'manufacturer' }>;
}

describe('parseVoltageClassKv (Epic 2 retro D-6)', () => {
  it.each([
    ['15', '15'],
    ['17,5', '17,5'],
    ['23', '23'],
    [' 13.8 ', '13,8'],
    ['34,5 kV', '34,5'],
    ['0,38kV', '0,38'],
  ])('accepts %j as %j', (text, stored) => {
    expect(parseVoltageClassKv(text)).toBe(stored);
  });

  it.each(['abc', '', '15,', ',5', '17,5,1', '-15', '15 V', '1 5'])('refuses %j', (text) => {
    expect(parseVoltageClassKv(text)).toBeNull();
  });
});

describe('wordRegistryRowText', () => {
  it('shows the name', () => {
    expect(wordRegistryRowText(manufacturer({ name: 'WEG' }))).toEqual({ primary: 'WEG' });
  });

  it('reads a voltage class with its unit, and a legacy non-numeric name as it is', () => {
    const voltage = (name: string) => ({ ...manufacturer({ name }), kind: 'voltage_class' }) as WordRow;
    expect(wordRegistryRowText(voltage('17,5'))).toEqual({ primary: '17,5 kV' });
    expect(wordRegistryRowText(voltage('Baixa tensão'))).toEqual({ primary: 'Baixa tensão' });
  });
});

describe('compareWordRows / sortWordRegistryRows', () => {
  it('sorts alphabetically by name', () => {
    const a = manufacturer({ name: 'ABB' });
    const b = manufacturer({ name: 'Siemens' });
    expect(compareWordRows(a, b)).toBeLessThan(0);
    expect(sortWordRegistryRows([b, a])).toEqual([a, b]);
  });

  it('sorts accented pt-BR names in locale order, not raw UTF-16 code unit order', () => {
    // Plain `<`/`>` would put "Água" after "Zebra" (uppercase Á is a higher code unit than
    // lowercase z); pt-BR collation sorts it near "A".
    const agua = manufacturer({ name: 'Água' });
    const zebra = manufacturer({ name: 'Zebra' });
    expect(compareWordRows(agua, zebra)).toBeLessThan(0);
    expect(sortWordRegistryRows([zebra, agua])).toEqual([agua, zebra]);
  });
});
