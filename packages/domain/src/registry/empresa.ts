import type { RegistryRow } from '../schemas/entities.ts';

export type EmpresaRow = Extract<RegistryRow, { kind: 'empresa' }>;

/**
 * The FO.SERV-03 values a company's first Empresa row starts from (Epic 2 context:
 * form title "Relatório Técnico de Cabine Primária", code "FO.SERV-03", revision
 * "Revisão 01"). Stored values, not surface copy, so they live in the kernel with the
 * row they seed.
 */
export const EMPRESA_DEFAULTS = {
  form_title: 'Relatório Técnico de Cabine Primária',
  form_code: 'FO.SERV-03',
  form_revision: 'Revisão 01',
} as const;

/**
 * The row the first committed Empresa field creates (AD-3: a create op carries the whole
 * row). Everything but the three form defaults starts empty; nothing is required.
 */
export function defaultEmpresaRow(id: string): EmpresaRow {
  return {
    id,
    kind: 'empresa',
    name: '',
    cnpj: null,
    address: null,
    phone: null,
    email: null,
    form_title: EMPRESA_DEFAULTS.form_title,
    form_code: EMPRESA_DEFAULTS.form_code,
    form_revision: EMPRESA_DEFAULTS.form_revision,
    logo_file_id: null,
    watermark_file_id: null,
    cover_background_file_id: null,
    removed_at: null,
  };
}

/**
 * The footer line the generated document composes from the company row: address, phone
 * and e-mail, in that order, separated by the document's middot, skipping what is empty.
 */
export function empresaFooterLine(empresa: EmpresaRow | null): string {
  if (empresa === null) return '';
  return [empresa.address, empresa.phone, empresa.email].filter((part) => part !== null && part.trim() !== '').join(' · ');
}

/** The header strip's second line: form code and revision, skipping what is empty. */
export function empresaFormLine(empresa: EmpresaRow | null): string {
  if (empresa === null) return '';
  return [empresa.form_code, empresa.form_revision].filter((part) => part !== null && part.trim() !== '').join(' · ');
}
