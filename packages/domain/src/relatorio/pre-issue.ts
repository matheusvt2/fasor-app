import { calibrationCheck, calibrationValidUntil } from '../checks/calibration.ts';
import { clientPreIssueRows } from '../checks/pre-issue-client.ts';
import { companyPreIssues } from '../checks/pre-issue.ts';
import { calendarDateOfInstant, formatCalendarDate, formatShortDateTime } from '../format/datetime.ts';
import { captionSuggestions, legendasSugeridasText } from '../photos/captions.ts';
import { livePhotos } from '../photos/order.ts';
import { photosAwaitingText, photosUncaptionedText } from '../photos/text.ts';
import { artLabel } from '../print/document-control.ts';
import { missingCertificates, section11Instruments } from '../print/section-11.ts';
import type { SuggestionRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { findSeed, getSeed, sectionText, type SectionVariable } from '../seed/definitions.ts';
import type { TextBlock } from '../seed/schema.ts';
import { rejectedText } from '../sync/counts.ts';
import { isOptionalSectionVariable, resolveSectionText, SECTION_VARIABLE_LABELS } from '../templates/section-text.ts';
import { normalizeRegistryName } from '../text/normalize-name.ts';
import { listPtBr, plural } from '../text/plural.ts';
import { pointPhotoRemovedText, pointsSemAcaoText, pointsWithoutAction, pointsWithRemovedPhotos } from '../points/checks.ts';
import { pointsSemPrazo, pointsSemPrazoText } from '../points/priority.ts';
import { duplicateTagText } from './block-texts.ts';
import { cabineMissingText, cabineProgress } from './cabine.ts';
import { conclusionTextForPrint } from './conclusion.ts';
import { relatorioSectionNumber, type RelatorioSectionType } from './instantiate.ts';
import { integrityFindings } from './integrity.ts';
import { parecerOf } from './parecer.ts';
import { cabineLocationIds, emptySheetCount, fichasVaziasText, naoEnsaiadasText, progress, progressCounterText, type Progress } from './progress.ts';
import { section3Blocks, sectionVariables } from './section-variables.ts';
import { setupGaps, type SetupGap } from './setup-complete.ts';
import { enabledSubBlocksOf, isEquipmentBlock, sheetState } from './sheet-state.ts';
import { blocksWithPendingSuggestions, fichasComSugestoesText, livePendingSuggestions } from './suggestions.ts';
import { sectionBlocks } from './sumario.ts';

/*
 * AD-15, Story 4.3: the one pre-issue check the Sumário rows and the Export dialog both
 * render (Epic 4 context: "never two implementations that could disagree"). Every rule
 * yields typed rows addressed to a Sumário row (`row`), with a severity and a `kind`, so
 * a later epic appends its family by pushing rows here and the Sumário draws them without
 * changing. Story 7.5 closes the list: exactly one row may be `blocking`, "Parecer não
 * preenchido" (section 10); everything else warns and the document prints its consequence.
 * The `sync` rows (rejected ops, the other devices' last send) are what no Sumário row can
 * say: only the Export dialog draws them.
 */

/** Where a pre-issue row is drawn: the cover, the document control, one numbered section, or the Export dialog's sync lines. */
export type SumarioRowKey = 'capa' | 'controle' | RelatorioSectionType | 'sync';

export type PreIssueSeverity = 'blocking' | 'pending' | 'info';

export type PreIssueKind =
  | 'setup_missing'
  | 'sheets'
  | 'sheets_empty'
  | 'not_tested'
  | 'cabine_sem_equipamento'
  | 'cabine_incompleta'
  | 'company'
  | 'client'
  | 'photos_uncaptioned'
  | 'captions_suggested'
  | 'photos_pending_upload'
  | 'photos_upload_error'
  | 'points_sem_acao'
  | 'point_photo_removed'
  | 'points_sem_prazo'
  | 'parecer_missing'
  | 'conclusion_unconfirmed'
  | 'suggestions_pending'
  | 'calibration'
  | 'certificate_missing'
  | 'cert_number_mismatch'
  | 'duplicate_tag'
  | 'section_variables'
  | 'seed_unknown'
  | 'rejected'
  | 'last_send';

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
const SETUP_TEXTS: Readonly<Record<Exclude<SetupGap, 'art_trt_number'>, string>> = {
  client: 'Cliente em branco',
  service_start: 'Início da parada em branco',
  service_end: 'Fim da parada em branco',
  responsible_user_id: 'Responsável técnico em branco',
  registration_number: 'Registro profissional do responsável em branco',
  instruments: 'Nenhum instrumento em Dados do relatório',
};

/** Where each setup gap is drawn: the instruments on section 11 (the certificates), the rest on the cover row. */
function setupGapRow(gap: SetupGap): SumarioRowKey {
  return gap === 'instruments' ? 'section_11' : 'capa';
}

/** The text of a setup gap's row; the ART/TRT one names the council's own document ("Número da ART em branco"). */
export function setupGapText(gap: SetupGap, snapshot: Pick<RelatorioSnapshot, 'responsible'>): string {
  // authored: "Número da ART em branco", "… da TRT …", "… da ART/TRT …" while the council is unknown.
  if (gap === 'art_trt_number') return `Número da ${artLabel(snapshot.responsible?.council ?? null)} em branco`;
  return SETUP_TEXTS[gap];
}

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

/** What the device knows beside the snapshot, for the rules that read it. */
export interface PreIssueContext {
  /**
   * Ids of the photos whose local upload stopped with an error (`failed` or `dead`): their
   * tile says "Erro", so section 7's "aguardando envio" does not count them and the
   * "com erro de envio" row does. Default: none.
   */
  photoErrors?: ReadonlySet<string>;
  /**
   * The caller's clock reading (TC-1: the kernel never reads the clock): the instant a
   * calibration is judged at when the relatório has no service end, and the date the
   * seeded section texts are chosen for. Without it, a calibration with no service end is
   * not judged and the latest seeded texts are read.
   */
  now?: Date;
  /** Ops of this device the server rejected (`dead`): the Export dialog's "N alterações rejeitadas" with "Reenviar". Default: 0. */
  rejected?: number;
  /** The other devices' last send, by the user's name ("Último envio de Eduardo: 06/09 18:10"). Default: none. */
  lastPushes?: readonly { name: string; at: string }[];
  /**
   * Story 8.6: the device's pending suggestion rows of this relatório (a snapshot holds only
   * confirmed ones, coordinator conflict 3): section 9's "N fichas com sugestões por confirmar",
   * a warning that never blocks. Default: none.
   */
  pendingSuggestions?: readonly SuggestionRow[];
}

const NO_PHOTO_ERRORS: ReadonlySet<string> = new Set();
/** The date that selects the latest seeded section texts (the one `print/layout.ts` falls back to). */
const LATEST_TEXT_DATE = '9999-12-31';
/** A placeholder instant `calibrationCheck` never reads while a service end is given. */
const EPOCH = new Date(0);

/**
 * The text blocks a section block prints: its own text, else the seed's in force on `date`;
 * none for a generated section or a section with no seeded text on `date` (the print leaves
 * it empty too). K-9: a seed version this device does not ship is never read as "no text":
 * `preIssue` names it once (`seed_unknown`), so its section texts are not checked here.
 */
function sectionTextBlocks(snapshot: RelatorioSnapshot, block: RelatorioSnapshot['blocks'][number], section: number, date: string): readonly Pick<TextBlock, 'text'>[] {
  const own = (block.config as { section_text?: unknown } | null)?.section_text;
  if (typeof own === 'string') return own.split('\n').map((text) => ({ text }));
  const seedVersion = snapshot.relatorio.seed_version;
  if (findSeed(seedVersion) === null) return [];
  try {
    return section === 3 ? section3Blocks(seedVersion, date, snapshot.relatorio.setup.exclusions) : sectionText(seedVersion, section, date);
  } catch {
    return [];
  }
}

/** "Conteúdo padrão v9 indisponível neste aparelho": the relatório's seed version is not one this app ships. */
export function seedUnknownText(seedVersion: string): string {
  // authored: K-9, the section texts and the cabine fields cannot be checked on this device.
  return `Conteúdo padrão ${seedVersion} indisponível neste aparelho`;
}

/** "Dado do relatório em branco: Responsável", "Dados do relatório em branco: Cliente e Datas". */
export function sectionVariablesText(labels: readonly string[]): string {
  // authored: a section text prints `[Label]` for these (Story 4.7); the row names them.
  return `${labels.length === 1 ? 'Dado do relatório em branco' : 'Dados do relatório em branco'}: ${listPtBr(labels)}`;
}

/** "2 fichas concluídas sem texto de conclusão confirmado". */
export function conclusionUnconfirmedText(n: number): string {
  // authored: the sheets whose conclusion text will not print (Story 5.8: nothing unconfirmed prints).
  return plural(n, 'ficha concluída sem texto de conclusão confirmado', 'fichas concluídas sem texto de conclusão confirmado');
}

/** "3 com erro de envio": section 7's photos whose upload stopped with an error on this device. */
export function photosUploadErrorText(n: number): string {
  // authored: beside "N aguardando envio" on row 7; these photos are not on the server and do not print.
  return `${n} com erro de envio`;
}

/** "MEG-01 — calibração vencida em 10/08/2026", "… vence em 20/09/2026". */
export function calibrationText(code: string, status: 'expired' | 'expiring', validUntil: string): string {
  // authored: the certificate prints as it is; the row says what the reader will see.
  return `${code} — calibração ${status === 'expired' ? 'vencida' : 'vence'} em ${formatCalendarDate(validUntil)}`;
}

/** "MEG-01 sem certificado". */
export function certificateMissingText(code: string): string {
  // authored: section 11 prints a placeholder line for it.
  return `${code} sem certificado`;
}

/** "MG-01: nº de certificado da ficha difere do cadastro". */
export function certNumberMismatchText(code: string): string {
  // authored: a sheet copied another certificate number than the registry holds; section 11
  // prints the registry's (open for Bruno).
  return `${code}: nº de certificado da ficha difere do cadastro`;
}

/** "Último envio de Eduardo: 06/09 18:10". */
export function lastSendText(name: string, at: string): string {
  // authored: the Sync status surface's "Último envio", as one line of the Export dialog.
  return `Último envio de ${name}: ${formatShortDateTime(at)}`;
}

/** The one blocking row's text (`73-exportar.html` `#exportar-pc-parecer`). */
export const PARECER_MISSING_TEXT = 'Parecer não preenchido';

/**
 * The live section blocks whose text prints a variable with no value as `[Label]`, each with
 * those variables once, in order of first appearance (Story 7.5's `section_variables` rows
 * and F-03's count of blank fields read the same list).
 */
function sectionVariableGaps(snapshot: RelatorioSnapshot, now: Date | null): { block: RelatorioSnapshot['blocks'][number]; unresolved: SectionVariable[] }[] {
  const variables = sectionVariables(snapshot, snapshot.responsible?.name ?? null);
  const date = now === null ? LATEST_TEXT_DATE : calendarDateOfInstant(now);
  const gaps: { block: RelatorioSnapshot['blocks'][number]; unresolved: SectionVariable[] }[] = [];
  for (const block of sectionBlocks(snapshot.blocks)) {
    const section = relatorioSectionNumber(block.block_type);
    if (section === null) continue;
    const unresolved: SectionVariable[] = [];
    for (const text of sectionTextBlocks(snapshot, block, section, date)) {
      for (const name of resolveSectionText(text.text, variables).unresolved) if (!unresolved.includes(name)) unresolved.push(name);
    }
    if (unresolved.length > 0) gaps.push({ block, unresolved });
  }
  return gaps;
}

/** Every pre-issue row of a relatório, in reading order: the cover, the control, the sections in FO.SERV-03 order, then the sync lines. */
export function preIssue(snapshot: RelatorioSnapshot, computed: Progress = progress(snapshot), context: PreIssueContext = {}): PreIssueRow[] {
  const photoErrors = context.photoErrors ?? NO_PHOTO_ERRORS;
  const now = context.now ?? null;
  const rows: PreIssueRow[] = [];
  const setup = snapshot.relatorio.setup;
  const gaps = setupGaps(snapshot);
  for (const gap of gaps) {
    if (setupGapRow(gap) !== 'capa') continue;
    rows.push({ id: `setup_missing:${gap}`, row: 'capa', severity: 'pending', text: setupGapText(gap, snapshot), kind: 'setup_missing' });
  }
  // K-9: a seed version this device does not ship leaves the section texts and the cabine
  // fields unchecked; one row says so instead of every check reading "nothing missing".
  if (findSeed(snapshot.relatorio.seed_version) === null) {
    rows.push({ id: 'seed_unknown', row: 'capa', severity: 'pending', text: seedUnknownText(snapshot.relatorio.seed_version), kind: 'seed_unknown' });
  }
  for (const warning of companyPreIssues(snapshot.empresa)) {
    rows.push({ id: `company:${warning.id}`, row: 'capa', severity: 'info', text: warning.text, kind: 'company' });
  }
  for (const warning of clientPreIssueRows(snapshot.client)) {
    rows.push({ id: `client:${warning.key}`, row: 'controle', severity: 'info', text: warning.text, kind: 'client' });
  }

  // Story 7.5: a section text with a variable that has no value prints `[Label]`; its row says which.
  for (const { block, unresolved } of sectionVariableGaps(snapshot, now)) {
    rows.push({
      id: `section_variables:${block.id}`,
      row: block.block_type as RelatorioSectionType,
      severity: 'pending',
      text: sectionVariablesText(unresolved.map((name) => SECTION_VARIABLE_LABELS[name])),
      kind: 'section_variables',
    });
  }

  // Stories 6.3/6.5: section 7's photo family. Photos never block "Gerar" (coordinator
  // decision 2026-09-25): an uncaptioned photo is pending, an unsent one a plain warning.
  const photos = livePhotos(snapshot);
  const uncaptioned = photos.filter((photo) => photo.caption === null || photo.caption.trim() === '').length;
  if (uncaptioned > 0) {
    rows.push({ id: 'photos_uncaptioned', row: 'section_7', severity: 'pending', text: photosUncaptionedText(uncaptioned), kind: 'photos_uncaptioned' });
  }
  // Story 9.3 (FR-39): vision captions nobody confirmed yet; those photos print without them.
  // A warning, never blocking; `photos_uncaptioned` still counts them (nothing is written yet).
  const suggestedCaptions = captionSuggestions(photos, context.pendingSuggestions ?? []).size;
  if (suggestedCaptions > 0) {
    rows.push({ id: 'captions_suggested', row: 'section_7', severity: 'info', text: legendasSugeridasText(suggestedCaptions), kind: 'captions_suggested' });
  }
  // A photo with a local upload error is not waiting: `photoUploadState` reads it as `error`.
  const unsent = photos.filter((photo) => photo.uploaded_at === null && !photoErrors.has(photo.id)).length;
  if (unsent > 0) {
    rows.push({ id: 'photos_pending_upload', row: 'section_7', severity: 'info', text: photosAwaitingText(unsent), kind: 'photos_pending_upload' });
  }
  // Story 7.5 (carry-over): the photos the server does not hold because their upload failed
  // here; the document prints without them. A warning, never blocking.
  const failed = photos.filter((photo) => photo.uploaded_at === null && photoErrors.has(photo.id)).length;
  if (failed > 0) {
    rows.push({ id: 'photos_upload_error', row: 'section_7', severity: 'info', text: photosUploadErrorText(failed), kind: 'photos_upload_error' });
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
  // Story 11.10 (FR-52): live points with no deadline print "—" in the action-plan table;
  // information only, never pending or blocking.
  const semPrazo = pointsSemPrazo(snapshot.points).length;
  if (semPrazo > 0) {
    rows.push({ id: 'points_sem_prazo', row: 'section_8', severity: 'info', text: pointsSemPrazoText(semPrazo), kind: 'points_sem_prazo' });
  }

  if (computed.sheets_concluded < computed.sheets_total) {
    rows.push({ id: 'sheets', row: 'section_9', severity: 'pending', text: progressCounterText(computed), kind: 'sheets' });
  }
  // F-03 (review 2026-10-06, D1): the sheets nothing was typed on print as dashes; a warning
  // that never blocks, but issuing with any asks for a confirmation (`issueConfirmation`).
  const empty = emptySheetCount(snapshot.blocks);
  if (empty > 0) {
    rows.push({ id: 'sheets_empty', row: 'section_9', severity: 'info', text: fichasVaziasText(empty), kind: 'sheets_empty' });
  }
  if (computed.not_tested > 0) {
    rows.push({ id: 'not_tested', row: 'section_9', severity: 'info', text: naoEnsaiadasText(computed.not_tested), kind: 'not_tested' });
  }
  // Story 8.6 (FR-73): sheets holding suggestions nobody confirmed yet; they print without them.
  const withSuggestions = blocksWithPendingSuggestions(livePendingSuggestions(snapshot.blocks, context.pendingSuggestions ?? [])).size;
  if (withSuggestions > 0) {
    rows.push({ id: 'suggestions_pending', row: 'section_9', severity: 'pending', text: fichasComSugestoesText(withSuggestions), kind: 'suggestions_pending' });
  }
  // Story 7.5: a concluded sheet whose conclusion text is not confirmed prints without it.
  const unconfirmed = snapshot.blocks.filter(
    (block) =>
      block.removed_at === null &&
      isEquipmentBlock(block) &&
      sheetState(block) === 'concluida' &&
      enabledSubBlocksOf(block).has('conclusion') &&
      conclusionTextForPrint(block) === null,
  ).length;
  if (unconfirmed > 0) {
    rows.push({ id: 'conclusion_unconfirmed', row: 'section_9', severity: 'pending', text: conclusionUnconfirmedText(unconfirmed), kind: 'conclusion_unconfirmed' });
  }
  for (const finding of integrityFindings({ equipment: snapshot.equipment })) {
    rows.push({
      id: `duplicate_tag:${finding.tag}`,
      row: 'section_9',
      severity: 'pending',
      text: duplicateTagText(finding.tag),
      kind: 'duplicate_tag',
    });
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

  // Story 7.4/7.5: the one blocking row, only while section 10 prints: a live `section_10`
  // block, or no live section block at all (the legacy snapshot prints the seed's eleven,
  // `print/layout.ts` `printedSections`).
  const printedSectionTypes = sectionBlocks(snapshot.blocks)
    .filter((block) => relatorioSectionNumber(block.block_type) !== null)
    .map((block) => block.block_type);
  const section10Prints = printedSectionTypes.length === 0 || printedSectionTypes.includes('section_10');
  if (section10Prints && parecerOf(snapshot) === null) {
    rows.push({ id: 'parecer_missing', row: 'section_10', severity: 'blocking', text: PARECER_MISSING_TEXT, kind: 'parecer_missing' });
  }

  // Section 11: the setup's instruments, the calibration of each instrument section 11
  // prints (E7-A4: its own list, `section11Instruments`, so the rows name exactly what the
  // section prints; each judged on its registry row), expired pending and about to expire a
  // plain warning, a missing certificate, and a sheet whose copied certificate number
  // differs from the registry's (information: the print uses the registry's).
  for (const gap of gaps) {
    if (setupGapRow(gap) !== 'section_11') continue;
    rows.push({ id: `setup_missing:${gap}`, row: 'section_11', severity: 'pending', text: setupGapText(gap, snapshot), kind: 'setup_missing' });
  }
  const printedInstruments = section11Instruments(snapshot);
  const registryInstruments = new Map(snapshot.instruments.filter((row) => row.removed_at === null).map((row) => [row.id, row]));
  // The reference is the service end; the caller's `now` only when there is none (K-6: with
  // neither, no calibration is judged).
  const judgesCalibration = setup.service_end !== null || now !== null;
  for (const entry of judgesCalibration ? printedInstruments : []) {
    const instrument = registryInstruments.get(entry.instrument_id);
    if (instrument === undefined) continue;
    const status = calibrationCheck(instrument, setup.service_end, now ?? EPOCH);
    const validUntil = calibrationValidUntil(instrument.calibrated_at, instrument.calibration_interval_months);
    if (status === 'valid' || validUntil === null) continue;
    rows.push({
      id: `calibration:${instrument.id}`,
      row: 'section_11',
      severity: status === 'expired' ? 'pending' : 'info',
      text: calibrationText(instrument.code, status, validUntil),
      kind: 'calibration',
    });
  }
  // Story 7.3's rule (section 11 prints a placeholder line for each of these).
  for (const entry of missingCertificates(snapshot)) {
    rows.push({ id: `certificate_missing:${entry.instrument_id}`, row: 'section_11', severity: 'info', text: certificateMissingText(entry.code), kind: 'certificate_missing' });
  }
  for (const entry of printedInstruments) {
    if (!entry.cert_mismatch) continue;
    rows.push({ id: `cert_number_mismatch:${entry.instrument_id}`, row: 'section_11', severity: 'info', text: certNumberMismatchText(entry.code), kind: 'cert_number_mismatch' });
  }

  // The Export dialog's own lines: what this device could not send, and when the others last sent.
  const rejected = context.rejected ?? 0;
  if (rejected > 0) rows.push({ id: 'rejected', row: 'sync', severity: 'pending', text: rejectedText(rejected), kind: 'rejected' });
  (context.lastPushes ?? []).forEach((push, index) => {
    rows.push({ id: `last_send:${index}`, row: 'sync', severity: 'info', text: lastSendText(push.name, push.at), kind: 'last_send' });
  });
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

/**
 * The kinds the Export dialog lists one by one: the empty sheets (F-03), the photos the
 * server does not hold, the sync lines and (E7-A4, 2026-09-28) a sheet certificate number that differs from the
 * registry's, since the document then prints a certificate the sheet did not name.
 */
const EXPLICIT_KINDS: ReadonlySet<PreIssueKind> = new Set(['sheets_empty', 'photos_pending_upload', 'photos_upload_error', 'cert_number_mismatch', 'rejected', 'last_send']);

export interface ExportPrecheck {
  /** The rows that stop "Gerar relatório" (only "Parecer não preenchido"). */
  blocking: PreIssueRow[];
  /** The rows the dialog draws one per line. */
  explicit: PreIssueRow[];
  /** How many other rows stand on the Sumário ("N avisos — estão nas linhas do sumário"). */
  summarizedCount: number;
  /** "7 avisos", "1 aviso"; '' with none. */
  countText: string;
  /**
   * Review fixes 2026-10-08 (XC-4): what follows the count, agreeing with it: " — está na linha
   * do sumário; não impede gerar." for one, " — estão nas linhas do sumário; nenhum impede gerar."
   * for more; '' with none.
   */
  countMetaText: string;
}

/** The sentence after the Export dialog's warnings count, singular or plural with it; '' with none. */
export function precheckCountMetaText(n: number): string {
  if (n === 0) return '';
  // authored: XC-4 (review 2026-10-08), the singular of the mock's count line.
  if (n === 1) return ' — está na linha do sumário; não impede gerar.';
  // authored: the mock lists the kinds of its seven warnings; the app says where they are.
  return ' — estão nas linhas do sumário; nenhum impede gerar.';
}

/**
 * Story 7.5 (`73-exportar.html` "Antes de emitir", v0.8): the Export dialog's pre-issue list
 * from the same rows the Sumário draws: the blocking row, the rows only the dialog can say
 * (photos not on the server, rejected ops, the other devices' last send) and a count of
 * the rest, which stay on their Sumário rows.
 */
export function exportPrecheck(rows: readonly PreIssueRow[]): ExportPrecheck {
  const blocking = blockingRows(rows);
  const explicit = rows.filter((row) => row.severity !== 'blocking' && EXPLICIT_KINDS.has(row.kind));
  const summarizedCount = rows.length - blocking.length - explicit.length;
  return {
    blocking,
    explicit,
    summarizedCount,
    countText: summarizedCount === 0 ? '' : plural(summarizedCount, 'aviso', 'avisos'),
    countMetaText: precheckCountMetaText(summarizedCount),
  };
}

/**
 * The reason beside a blocked "Gerar relatório" (`73-exportar.html`
 * `#exportar-gen-blocked-reason`): "Preencha o parecer (linha 10 do sumário) para emitir a
 * revisão 3. O rascunho pode ser visto antes." `line` is section 10's Sumário number; the
 * parenthesis is left out when the relatório has no such row.
 */
export function parecerMissingReason(number: number, line: number | null): string {
  const where = line === null ? '' : ` (linha ${line} do sumário)`;
  return `Preencha o parecer${where} para emitir a revisão ${number}. O rascunho pode ser visto antes.`;
}

/**
 * F-03 (review 2026-10-06, D1): what issuing a revision prints blank, counted for the
 * confirmation "Gerar relatório" asks for before it issues. `emptySheets` are the live sheets
 * nothing was typed on; `blankFields` the distinct relatório data a section text or a cover row
 * prints as a `[Label]` placeholder ("[Empresa executora]", "[Responsável]"). Only the parecer blocks issuing; these ask.
 */
export interface IssueConfirmation {
  emptySheets: number;
  blankFields: number;
  /**
   * Review fixes 2026-10-08 (DF-6): the named parties whose CNPJ Controle do documento prints as
   * "—" (`partyLine`'s "CNPJ —"; a missing party prints "—" whole and is not named here). Named in the question only when it is asked (empty sheets or blanks): they
   * never ask on their own (D1, EXPERIENCE.md, the trigger is unchanged).
   */
  blankCnpjs: readonly ('contratante' | 'contratada')[];
  /** DF-6: the company has no logo (`companyPreIssues`), so the cover and the header print none. */
  logoMissing: boolean;
}

const blankText = (value: string | null | undefined): boolean => value === null || value === undefined || value.trim() === '';

export function issueConfirmation(snapshot: RelatorioSnapshot, context: Pick<PreIssueContext, 'now'> = {}): IssueConfirmation {
  const blank = new Set<SectionVariable>();
  for (const { unresolved } of sectionVariableGaps(snapshot, context.now ?? null)) for (const name of unresolved) blank.add(name);
  // The cover rows print a required field's `[Label]` too ("[Responsável]"); an empty optional
  // one is left out of the cover (F-04), so it is not blank.
  if (findSeed(snapshot.relatorio.seed_version) !== null) {
    const variables = sectionVariables(snapshot, snapshot.responsible?.name ?? null);
    for (const row of getSeed(snapshot.relatorio.seed_version, 'cabine_primaria').cover.rows) {
      for (const name of resolveSectionText(row.value, variables).unresolved) if (!isOptionalSectionVariable(name)) blank.add(name);
    }
  }
  const blankCnpjs: ('contratante' | 'contratada')[] = [];
  // Exactly when `partyLine` prints "CNPJ —": the party is named and its CNPJ is blank (with no
  // party at all the whole line prints "—", and the question does not name a CNPJ).
  const cnpjDash = (party: { name: string; cnpj?: string | null } | null | undefined) => party != null && !blankText(party.name) && blankText(party.cnpj);
  if (cnpjDash(snapshot.client)) blankCnpjs.push('contratante');
  if (cnpjDash(snapshot.empresa)) blankCnpjs.push('contratada');
  const logoMissing = snapshot.empresa === null || snapshot.empresa.logo_file_id === null;
  return { emptySheets: emptySheetCount(snapshot.blocks), blankFields: blank.size, blankCnpjs, logoMissing };
}

/** DF-6: the identity gaps the question names after its counts. */
function identityGapParts({ blankCnpjs, logoMissing }: Pick<IssueConfirmation, 'blankCnpjs' | 'logoMissing'>): string[] {
  const parts: string[] = [];
  const contratante = blankCnpjs.includes('contratante');
  const contratada = blankCnpjs.includes('contratada');
  // authored: DF-6 (review 2026-10-08), the CNPJs Controle do documento prints as "—".
  if (contratante && contratada) parts.push('os CNPJs do contratante e da contratada em branco');
  // authored: DF-6.
  else if (contratante) parts.push('o CNPJ do contratante em branco');
  // authored: DF-6.
  else if (contratada) parts.push('o CNPJ da contratada em branco');
  // authored: DF-6, the logo the cover and the header print without.
  if (logoMissing) parts.push('o logo da empresa não cadastrado');
  return parts;
}

/**
 * "93 fichas vazias e 2 campos em branco", "1 campo em branco"; null when nothing is blank. With
 * a count, DF-6 names the blank CNPJs and the missing logo after it ("93 fichas vazias, os CNPJs
 * do contratante e da contratada em branco e o logo da empresa não cadastrado"); alone they never ask.
 */
function issueBlanksText(counts: IssueConfirmation): string | null {
  const { emptySheets, blankFields } = counts;
  const parts = [
    ...(emptySheets > 0 ? [fichasVaziasText(emptySheets)] : []),
    // authored: F-03, the placeholders a section text prints.
    ...(blankFields > 0 ? [plural(blankFields, 'campo em branco', 'campos em branco')] : []),
  ];
  return parts.length === 0 ? null : listPtBr([...parts, ...identityGapParts(counts)]);
}

/** "Emitir com 93 fichas vazias e 2 campos em branco?"; null when both counts are zero (no confirmation). */
export function issueConfirmText(counts: IssueConfirmation): string | null {
  const blanks = issueBlanksText(counts);
  // authored: F-03 (D1), the question "Gerar relatório" asks before issuing.
  return blanks === null ? null : `Emitir com ${blanks}?`;
}

/** The foot's line when nothing blocks but issuing asks first: "Nada impede gerar. Emitir pede confirmação: 93 fichas vazias." */
export function issueConfirmReason(counts: IssueConfirmation): string | null {
  const blanks = issueBlanksText(counts);
  // authored: F-03 (D1).
  return blanks === null ? null : `Emitir pede confirmação: ${blanks}.`;
}
