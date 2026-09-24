import { formatCnpj } from '../checks/cnpj.ts';
import { formatIssueDate, formatServiceDates } from '../format/datetime.ts';
import { councilLabel } from '../registration.ts';
import { empresaFormLine } from '../registry/empresa.ts';
import type { Council } from '../schemas/council.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { revisionTitle } from './revisions.ts';

/*
 * Story 4.8: the document control page printed after the cover (FR-64), the one place
 * its rows, their order and their "—" for a missing value are written. The Export dialog's
 * read-only summary of the same table (FR-73, Epic 7) reads these rows too.
 */

/** What a missing value prints as, in the document control only (section bodies print `[Label]`). */
export const MISSING = '—';

export interface DocumentControlRow {
  label: string;
  value: string;
}

export interface DocumentControlInputs {
  revisionNumber: number;
  /** The generation instant (UTC ISO); printed as a São Paulo calendar date. */
  issuedAt: string;
  /** The ART/TRT number (`setup.art_trt_number`, typed in Etapa 3); `—` prints when it is null or blank. */
  art?: string | null;
}

/** The label of the registration-document row by the responsible's council: `ART` (CREA), `TRT` (CRT), `ART/TRT` when unknown. */
export function artLabel(council: Council | null): string {
  if (council === 'crea') return 'ART';
  if (council === 'crt') return 'TRT';
  return 'ART/TRT';
}

function present(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value.trim() === '' ? null : value;
}

/** "Name · CNPJ 00.000.000/0001-00"; the CNPJ slot prints `—` when unknown; `—` alone with no party at all. */
function partyLine(name: string | null | undefined, cnpj: string | null | undefined): string {
  const who = present(name);
  if (who === null) return MISSING;
  const number = present(cnpj);
  return `${who} · CNPJ ${number === null ? MISSING : formatCnpj(number)}`;
}

/** "Name · CREA 5063583141"; the council alone when the number is blank; the name alone with no council. */
function responsibleLine(responsible: RelatorioSnapshot['responsible']): string {
  if (responsible === null) return MISSING;
  const name = present(responsible.name) ?? MISSING;
  if (responsible.council === null) return name;
  const number = present(responsible.registration_number);
  const council = councilLabel(responsible.council);
  return number === null ? `${name} · ${council}` : `${name} · ${council} ${number}`;
}

/** "Relatório Técnico de Cabine Primária · FO.SERV-03 · Revisão 00": the form's title and its code line, skipping what is empty. */
function documentLine(empresa: RelatorioSnapshot['empresa']): string {
  const parts = [present(empresa?.form_title), present(empresaFormLine(empresa))].filter((part): part is string => part !== null);
  return parts.length === 0 ? MISSING : parts.join(' · ');
}

/**
 * The rows in the AC's order: Documento · Revisão do documento · Data de emissão ·
 * Contratante · Contratada · Responsável técnico · ART/TRT · Período do serviço.
 */
export function documentControlRows(snapshot: RelatorioSnapshot, inputs: DocumentControlInputs): DocumentControlRow[] {
  const { setup } = snapshot.relatorio;
  const period = formatServiceDates(setup.service_start, setup.service_end);
  return [
    { label: 'Documento', value: documentLine(snapshot.empresa) },
    { label: 'Revisão do documento', value: revisionTitle(inputs.revisionNumber) },
    { label: 'Data de emissão', value: present(formatIssueDate(inputs.issuedAt)) ?? MISSING },
    { label: 'Contratante', value: partyLine(snapshot.client?.name, snapshot.client?.cnpj) },
    { label: 'Contratada', value: partyLine(snapshot.empresa?.name, snapshot.empresa?.cnpj) },
    { label: 'Responsável técnico', value: responsibleLine(snapshot.responsible) },
    { label: artLabel(snapshot.responsible?.council ?? null), value: present(inputs.art) ?? MISSING },
    { label: 'Período do serviço', value: period === '' ? MISSING : period },
  ];
}
