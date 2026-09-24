import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import type { UserRow } from '../schemas/entities.ts';

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

/** The first missing item, in the matrix's fixed order, or null when every gap is closed. */
export function firstSetupGap(snapshot: RelatorioSnapshot, responsible: UserRow | null): SetupGap | null {
  const setup = snapshot.relatorio.setup;
  if (snapshot.client === null) return 'client';
  if (setup.service_start === null) return 'service_start';
  if (setup.service_end === null) return 'service_end';
  if (setup.responsible_user_id === null) return 'responsible_user_id';
  if (responsible === null || responsible.registration_number === null || responsible.registration_number === '') return 'registration_number';
  if (setup.art_trt_number === null || setup.art_trt_number === '') return 'art_trt_number';
  if (setup.instrument_ids.length === 0) return 'instruments';
  return null;
}

export function isSetupComplete(snapshot: RelatorioSnapshot, responsible: UserRow | null): boolean {
  return firstSetupGap(snapshot, responsible) === null;
}

/**
 * FR-16: the site altitude as it prints/displays, "< 1000 m" below the threshold, else
 * "⟨m⟩ m" -- the one place this rule decides, so the Setup page (Etapa 5) and Epic 5's
 * Ambiente de ensaio show the same text for the same altitude (AD-1: never decided twice).
 */
export function siteAltitudeText(m: number): string {
  return m < 1000 ? '< 1000 m' : `${m} m`;
}

/** "Concluir dados do relatório: falta ⟨o quê⟩", or null once every gap is closed. */
export function setupIncompleteReason(snapshot: RelatorioSnapshot, responsible: UserRow | null): string | null {
  const gap = firstSetupGap(snapshot, responsible);
  return gap === null ? null : `Concluir dados do relatório: falta ${GAP_TEXTS[gap]}`;
}
