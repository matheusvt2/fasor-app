import { describe, expect, it } from 'vitest';
import { defaultEmpresaRow, type EmpresaRow } from '../registry/empresa.ts';
import { companyPreIssues } from './pre-issue.ts';

const ID = '019966b0-0000-7000-8000-000000000004';

function empresa(fields: Partial<EmpresaRow> = {}): EmpresaRow {
  return { ...defaultEmpresaRow(ID), ...fields };
}

describe('2.3-UNIT-001 companyPreIssues', () => {
  it('warns about both when there is no Empresa row at all', () => {
    const rows = companyPreIssues(null);
    expect(rows.map((row) => row.id)).toEqual(['company_name', 'company_logo']);
    expect(rows.every((row) => row.severity === 'warning')).toBe(true);
  });

  it('warns about a blank razão social and a missing logo, separately', () => {
    expect(companyPreIssues(empresa({ name: '   ', logo_file_id: ID })).map((r) => r.id)).toEqual(['company_name']);
    expect(companyPreIssues(empresa({ name: 'Empresa' })).map((r) => r.id)).toEqual(['company_logo']);
  });

  it('returns nothing when both are present', () => {
    expect(companyPreIssues(empresa({ name: 'Empresa', logo_file_id: ID }))).toEqual([]);
  });

  it('carries the pt-BR text and the logo row its action', () => {
    const [name, logo] = companyPreIssues(null);
    expect(name?.text).toBe('Razão social não cadastrada');
    expect(name?.action).toBeUndefined();
    expect(logo?.text).toBe('Logo da empresa não cadastrado');
    expect(logo?.action).toBe('Cadastrar');
  });
});

describe('2.3-UNIT-002 defaultEmpresaRow', () => {
  it('seeds the FO.SERV-03 form defaults and leaves everything else empty', () => {
    const row = defaultEmpresaRow(ID);
    expect(row.form_title).toBe('Relatório Técnico de Cabine Primária');
    expect(row.form_code).toBe('FO.SERV-03');
    expect(row.form_revision).toBe('Revisão 01');
    expect(row.name).toBe('');
    expect(row.logo_file_id).toBeNull();
    expect(row.cover_background_file_id).toBeNull();
  });
});
