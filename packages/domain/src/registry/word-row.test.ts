import { describe, expect, it } from 'vitest';
import type { RegistryRow } from '../schemas/entities.ts';
import { compareWordRows, sortWordRegistryRows, wordRegistryRowText, type WordRow } from './word-row.ts';

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

describe('wordRegistryRowText', () => {
  it('shows the name', () => {
    expect(wordRegistryRowText(manufacturer({ name: 'WEG' }))).toEqual({ primary: 'WEG' });
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
