import { clientPreIssueRows } from '../checks/pre-issue-client.ts';
import { companyPreIssues } from '../checks/pre-issue.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { normalizeRegistryName } from '../text/normalize-name.ts';
import { pointPhotoRemovedText, pointsSemAcaoText, pointsWithoutAction, pointsWithRemovedPhotos } from '../points/checks.ts';
import { cabineMissingText, cabineProgress } from './cabine.ts';
import type { RelatorioSectionType } from './instantiate.ts';
import { cabineLocationIds, naoEnsaiadasText, progress, progressCounterText, type Progress } from './progress.ts';
import { isEquipmentBlock } from './sheet-state.ts';

/*
 * AD-15, Story 4.3: the one pre-issue check the Sumário rows and the Export dialog both
 * render (Epic 4 context: "never two implementations that could disagree"). Every rule
 * yields typed rows addressed to a Sumário row (`row`), with a severity and a `kind`, so
 * a later epic appends its family (photos without caption, points without action, the
 * parecer, expired certificates) by pushing rows here and the Sumário draws them without
 * changing. Nothing in this story blocks; "Parecer não preenchido" (Story 4.6/4.8) will be
 * the first `blocking` row.
 */

/** Where a pre-issue row is drawn: the cover, the document control, or one numbered section. */
export type SumarioRowKey = 'capa' | 'controle' | RelatorioSectionType;

export type PreIssueSeverity = 'blocking' | 'pending' | 'info';

export type PreIssueKind =
  | 'setup_missing'
  | 'sheets'
  | 'not_tested'
  | 'cabine_sem_equipamento'
  | 'cabine_incompleta'
  | 'company'
  | 'client'
  | 'points_sem_acao'
  | 'point_photo_removed';

export interface PreIssueRow {
  /** Stable key of the rule and its subject, for React lists and tests; never shown. */
  id: string;
  row: SumarioRowKey;
  severity: PreIssueSeverity;
  /** pt-BR, ready to render. */
  text: string;
  kind: PreIssueKind;
}

// authored: the mocks draw the cover row only when it is complete; these name the gaps in
// the same register as the Clientes tab's "CNPJ do contratante em branco".
const SETUP_TEXTS = {
  client: 'Cliente em branco',
  service_start: 'Início da parada em branco',
  service_end: 'Fim da parada em branco',
  responsible_user_id: 'Responsável técnico em branco',
} as const;

/**
 * "Cabine ⟨nome⟩ sem equipamento", or "⟨nome⟩ sem equipamento" when the name already says
 * Cabine ("Cabine 7", "Cabine-7", "CABINE QA", "Cabíne A"): never "Cabine Cabine QA" (Epic 4 QA Q9).
 */
export function cabineSemEquipamentoText(name: string): string {
  const trimmed = name.trim();
  // "Cabine" as a word at the start ("Cabine 7", "Cabine-7", "Cabine7"), never "Cabinet".
  const saysCabine = /^cabine(?![a-z])/.test(normalizeRegistryName(trimmed));
  return saysCabine ? `${trimmed} sem equipamento` : `Cabine ${trimmed} sem equipamento`;
}

/** Every pre-issue row of a relatório, in reading order: the cover, the control, section 8, then section 9. */
export function preIssue(snapshot: RelatorioSnapshot, computed: Progress = progress(snapshot)): PreIssueRow[] {
  const rows: PreIssueRow[] = [];
  const setup = snapshot.relatorio.setup;
  const missing: (keyof typeof SETUP_TEXTS)[] = [];
  if (snapshot.client === null) missing.push('client');
  if (setup.service_start === null) missing.push('service_start');
  if (setup.service_end === null) missing.push('service_end');
  if (setup.responsible_user_id === null) missing.push('responsible_user_id');
  for (const field of missing) {
    rows.push({ id: `setup_missing:${field}`, row: 'capa', severity: 'pending', text: SETUP_TEXTS[field], kind: 'setup_missing' });
  }
  for (const warning of companyPreIssues(snapshot.empresa)) {
    rows.push({ id: `company:${warning.id}`, row: 'capa', severity: 'info', text: warning.text, kind: 'company' });
  }
  for (const warning of clientPreIssueRows(snapshot.client)) {
    rows.push({ id: `client:${warning.key}`, row: 'controle', severity: 'info', text: warning.text, kind: 'client' });
  }

  // Story 6.6: section 8. Manual points with no action are pending, never blocking; a point
  // whose text cites a removed photo gets its own row, so the Export dialog can name it.
  const semAcao = pointsWithoutAction(snapshot.points).length;
  if (semAcao > 0) {
    rows.push({ id: 'points_sem_acao', row: 'section_8', severity: 'pending', text: pointsSemAcaoText(semAcao), kind: 'points_sem_acao' });
  }
  for (const { point, position } of pointsWithRemovedPhotos(snapshot)) {
    rows.push({ id: `point_photo_removed:${point.id}`, row: 'section_8', severity: 'pending', text: pointPhotoRemovedText(position), kind: 'point_photo_removed' });
  }

  if (computed.sheets_concluded < computed.sheets_total) {
    rows.push({ id: 'sheets', row: 'section_9', severity: 'pending', text: progressCounterText(computed), kind: 'sheets' });
  }
  if (computed.not_tested > 0) {
    rows.push({ id: 'not_tested', row: 'section_9', severity: 'info', text: naoEnsaiadasText(computed.not_tested), kind: 'not_tested' });
  }
  for (const location of snapshot.locations) {
    if (location.kind !== 'cabine') continue;
    const ids = cabineLocationIds(snapshot.locations, location.id);
    const holdsEquipment = snapshot.blocks.some((block) => block.location_id !== null && ids.has(block.location_id) && isEquipmentBlock(block));
    if (!holdsEquipment) {
      rows.push({
        id: `cabine_sem_equipamento:${location.id}`,
        row: 'section_9',
        severity: 'pending',
        text: cabineSemEquipamentoText(location.name),
        kind: 'cabine_sem_equipamento',
      });
      continue;
    }
    // Story 12.3 (J-03): a cabine field still empty is pending, never blocking. A cabine
    // with no equipment has no sheet to fill it on; the row above already names it.
    const missing = cabineMissingText(cabineProgress(snapshot, location.id));
    if (missing !== null) {
      rows.push({
        id: `cabine_incompleta:${location.id}`,
        row: 'section_9',
        severity: 'pending',
        text: cabineIncompletaText(location.name, missing),
        kind: 'cabine_incompleta',
      });
    }
  }
  return rows;
}

/** "Cubículo Enel: falta a umidade", "Cubículo Enel: faltam 3 campos". */
export function cabineIncompletaText(name: string, missingText: string): string {
  // authored: the pre-issue row of a cabine with empty fields (open question for Bruno).
  return `${name.trim()}: ${missingText}`;
}

/** The rows addressed to one Sumário row. */
export function preIssueRowsFor(rows: readonly PreIssueRow[], key: SumarioRowKey): PreIssueRow[] {
  return rows.filter((row) => row.row === key);
}

/** The blocking rows, the ones "Gerar relatório" names in its reason. */
export function blockingRows(rows: readonly PreIssueRow[]): PreIssueRow[] {
  return rows.filter((row) => row.severity === 'blocking');
}
