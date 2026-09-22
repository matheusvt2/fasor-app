import type { EmpresaRow } from '../registry/empresa.ts';

/*
 * Epic 2 context: "Missing razão social/logo never blocks; feeds kernel `preIssue` as
 * warning rows for Epic 7's Sumário/Export dialog." This module holds the two company
 * rows only; the registry, sheet and photo rows of Stories 2.4-2.6 and later epics append
 * their own from their own modules, so the batches never collide.
 */

export interface PreIssueRow {
  /** Stable key of the rule, for React lists and for tests; never shown. */
  id: string;
  severity: 'warning';
  /** pt-BR, ready to render. */
  text: string;
  /** The one-word way out, when the row has one. */
  action?: string;
}

/**
 * The company identity rows: razão social and logo. Both are warnings — nothing blocks,
 * no field is required to leave the Empresa tab (Epic 2 context).
 */
export function companyPreIssues(empresa: EmpresaRow | null): PreIssueRow[] {
  const rows: PreIssueRow[] = [];
  if (empresa === null || empresa.name.trim() === '') {
    rows.push({ id: 'company_name', severity: 'warning', text: 'Razão social não cadastrada' });
  }
  if (empresa === null || empresa.logo_file_id === null) {
    rows.push({ id: 'company_logo', severity: 'warning', text: 'Logo da empresa não cadastrado', action: 'Cadastrar' });
  }
  return rows;
}
