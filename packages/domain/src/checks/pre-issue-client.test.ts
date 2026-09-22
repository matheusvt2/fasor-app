import { describe, expect, it } from 'vitest';
import type { ClientRow } from '../registry/client-row.ts';
import { clientPreIssueRows } from './pre-issue-client.ts';

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

describe('clientPreIssueRows', () => {
  it('is empty with no client', () => {
    expect(clientPreIssueRows(null)).toEqual([]);
  });

  it('is empty when the client has a CNPJ', () => {
    expect(clientPreIssueRows(client({ cnpj: '00.000.000/0001-00' }))).toEqual([]);
  });

  it('warns when the client has no CNPJ', () => {
    expect(clientPreIssueRows(client({ cnpj: null }))).toEqual([
      { key: 'cnpj_do_contratante_em_branco', text: 'CNPJ do contratante em branco' },
    ]);
  });
});
