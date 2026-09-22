import { describe, expect, it } from 'vitest';
import { clientRegistryRowText, compareClientRows, sortClientRegistryRows, type ClientRow } from './client-row.ts';

function client(overrides: Partial<ClientRow> = {}): ClientRow {
  return {
    id: '019966b0-0004-7000-8000-000000000001',
    kind: 'client',
    name: 'Porto Seguro',
    cnpj: null,
    contact_name: null,
    contact_phone: null,
    sites: [],
    removed_at: null,
    ...overrides,
  };
}

describe('clientRegistryRowText', () => {
  it('shows the CNPJ when present', () => {
    expect(clientRegistryRowText(client({ cnpj: '00.000.000/0001-00' }))).toEqual({
      primary: 'Porto Seguro',
      secondary: 'CNPJ 00.000.000/0001-00',
    });
  });

  it('falls back to the not-informed text when the CNPJ is blank', () => {
    expect(clientRegistryRowText(client({ cnpj: null }))).toEqual({
      primary: 'Porto Seguro',
      secondary: 'CNPJ não informado',
    });
  });
});

describe('compareClientRows / sortClientRegistryRows', () => {
  it('sorts alphabetically by name', () => {
    const a = client({ name: 'Alameda' });
    const b = client({ name: 'Beta' });
    expect(compareClientRows(a, b)).toBeLessThan(0);
    expect(sortClientRegistryRows([b, a])).toEqual([a, b]);
  });
});
