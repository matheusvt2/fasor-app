import { artOrTrtLabel } from '../registration.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';

/*
 * Story 4.2, AR-21: whether the relatório's office-side setup is complete enough to leave
 * Rascunho, and the first gap's reason when it is not. `newRelatorioReason`
 * (`relatorio/sumario.ts`) is the "Novo relatório" dialog's own, narrower check; this one
 * gates the setup page's "Concluir dados do relatório" button and is stricter (AC 3).
 */

export type SetupGap = 'client' | 'service_start' | 'service_end' | 'responsible_user_id' | 'registration_number' | 'art_trt_number' | 'instruments';

// authored: "Concluir dados do relatório: falta ⟨o quê⟩", the fixed order the matrix names.
const GAP_TEXTS: Readonly<Record<SetupGap, string>> = {
  client: 'o cliente',
  service_start: 'a data de início',
  service_end: 'a data de fim',
  responsible_user_id: 'o responsável técnico',
  registration_number: 'o número de registro do responsável',
  art_trt_number: 'o número do ART/TRT',
  instruments: 'um instrumento',
};

/**
 * Epic 4 retro item 14: every setup gap in the matrix's fixed order, read off the snapshot
 * alone (its `responsible` is the `user` row the setup names). The one list both the setup
 * page's "Concluir" reason (`firstSetupGap`) and the pre-issue rows (`preIssue`) derive
 * from, so the two can no longer disagree. The registration number is a gap only once a
 * responsible is named (before that, the responsible's own gap says it).
 */
export function setupGaps(snapshot: RelatorioSnapshot): SetupGap[] {
  const setup = snapshot.relatorio.setup;
  const gaps: SetupGap[] = [];
  if (snapshot.client === null) gaps.push('client');
  if (setup.service_start === null) gaps.push('service_start');
  if (setup.service_end === null) gaps.push('service_end');
  if (setup.responsible_user_id === null) gaps.push('responsible_user_id');
  else if (blank(snapshot.responsible?.registration_number)) gaps.push('registration_number');
  if (blank(setup.art_trt_number)) gaps.push('art_trt_number');
  if (setup.instrument_ids.length === 0) gaps.push('instruments');
  return gaps;
}

function blank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === '';
}

/** The first missing item, in the matrix's fixed order, or null when every gap is closed. */
export function firstSetupGap(snapshot: RelatorioSnapshot): SetupGap | null {
  return setupGaps(snapshot)[0] ?? null;
}

export function isSetupComplete(snapshot: RelatorioSnapshot): boolean {
  return firstSetupGap(snapshot) === null;
}

/**
 * FR-16: the site altitude as it prints/displays, "< 1000 m" below the threshold, else
 * "⟨m⟩ m" -- the one place this rule decides, so the Setup page (Etapa 5) and Epic 5's
 * Ambiente de ensaio show the same text for the same altitude (AD-1: never decided twice).
 */
export function siteAltitudeText(m: number): string {
  return m < 1000 ? '< 1000 m' : `${m} m`;
}

/**
 * "Concluir dados do relatório: falta ⟨o quê⟩", or null once every gap is closed. The
 * ART/TRT gap names the responsible's own document once their council is known (Epic 4 QA
 * Q12): "o número da ART" (CREA) or "o número da TRT" (CRT), both feminine; "o número do
 * ART/TRT" only while the council is unknown.
 */
export function setupIncompleteReason(snapshot: RelatorioSnapshot): string | null {
  const gap = firstSetupGap(snapshot);
  if (gap === null) return null;
  const council = snapshot.responsible?.council ?? null;
  const text = gap === 'art_trt_number' && council !== null ? `o número da ${artOrTrtLabel(council)}` : GAP_TEXTS[gap];
  return `Concluir dados do relatório: falta ${text}`;
}
