import { formatShortDateTime } from '../format/datetime.ts';
import { blockName, type MergeInfo, type MergeInfoContext } from '../merge/info.ts';
import type { MergeRule } from '../merge/rules.ts';
import { orderUploads } from '../photos/upload-order.ts';
import { leiturasNaFilaText } from '../relatorio/plate-suggestions.ts';
import { sumarioTitle } from '../relatorio/project.ts';
import { blockTypeLabel } from '../relatorio/tree.ts';
import type { BlockRow, ProjectRow } from '../schemas/entities.ts';
import { plural } from '../text/plural.ts';
import { outboxBlockId, pendingSummaryText, type OutboxLike, type SyncCounts } from './counts.ts';
import { isProjectStreamId } from './streams.ts';

/*
 * Story 10.4 (FR-60, UX-DR13): every text, row and figure of the Sync status surface
 * (`85-sync.html`), derived here once. `apps/web/src/surfaces/sync` places them in the
 * mock's elements and derives nothing of its own (AD-2).
 */

/** The state words of a Sync status row's `.sr-state`. */
export const SYNC_ROW_STATE_TEXT = {
  sending: 'Enviando…',
  waiting: 'Aguardando envio',
  readingQueued: 'Leitura na fila',
  merged: 'Mesclado',
} as const;

/** What the headline and the summary badges read besides the counts. */
export interface SyncStatusInputs {
  counts: SyncCounts;
  /** The open contradictions (Stories 10.2/10.3 fill it; 0 until then). */
  contradictions?: number;
}

/**
 * The headline's `.sh-counts` (epic-10 Conflict 9): "1 contradição para resolver · 3 fichas e
 * 12 fotos aguardando · 2 leituras na fila", each part only when it counts something; the
 * mock's sentence for nothing at all.
 */
export function syncHeadlineText({ counts, contradictions = 0 }: SyncStatusInputs): string {
  const parts: string[] = [];
  if (contradictions > 0) parts.push(`${plural(contradictions, 'contradição', 'contradições')} para resolver`);
  const pending = pendingSummaryText(counts);
  if (pending !== '') parts.push(`${pending} aguardando`);
  if (counts.readings_queued > 0) parts.push(leiturasNaFilaText(counts.readings_queued));
  return parts.length === 0 ? 'Nada pendente neste aparelho.' : parts.join(' · ');
}

export interface SyncSummaryBadge {
  state: 'conflict' | 'pending' | 'error' | 'ok';
  text: string;
}

/**
 * The `.sync-summary` compact badges of `85-sync.html` (lines 51-55), in its order, each
 * only when it counts something: contradictions, work waiting, errors (rejected ops and
 * stopped uploads), readings ready (suggestions to confirm) and queued.
 */
export function syncSummaryBadges({ counts, contradictions = 0 }: SyncStatusInputs): SyncSummaryBadge[] {
  const badges: SyncSummaryBadge[] = [];
  if (contradictions > 0) badges.push({ state: 'conflict', text: plural(contradictions, 'contradição', 'contradições') });
  const pending = pendingSummaryText(counts);
  if (pending !== '') badges.push({ state: 'pending', text: `${pending} aguardando envio` });
  const errors = counts.dead + counts.upload_errors;
  if (errors > 0) badges.push({ state: 'error', text: plural(errors, 'erro', 'erros') });
  const ready = counts.suggestions_pending;
  const queued = counts.readings_queued;
  if (ready > 0 && queued > 0) badges.push({ state: 'ok', text: `${plural(ready, 'leitura pronta', 'leituras prontas')} · ${queued} na fila` });
  else if (ready > 0) badges.push({ state: 'ok', text: plural(ready, 'leitura pronta', 'leituras prontas') });
  else if (queued > 0) badges.push({ state: 'ok', text: leiturasNaFilaText(queued) });
  return badges;
}

// --- Enviando: sheets -----------------------------------------------------------------------

/** What a pending sheet row reads of an outbox row. */
export type PendingSheetOutboxLike = OutboxLike & { actor_id: string; client_ts: string };

/** The rows the sheet rows are named from. */
export type PendingSheetContext = Pick<MergeInfoContext, 'blocks' | 'equipment' | 'users'>;

export interface PendingSheetRow {
  block_id: string;
  /** "SEC-C12 — Chave seccionadora"; the type alone without a TAG; "Ficha" for a block not held. */
  primary: string;
  /** "Alterada por Ana Alves · 07/09 14:31" (the latest unsent op). */
  secondary: string;
  state: 'sending' | 'waiting';
  stateText: string;
}

/** A user's name as the device holds it; the id when it holds none (as "Último envio" does). */
function userName(userId: string, users: PendingSheetContext['users']): string {
  const name = users.find((user) => user.id === userId)?.name.trim() ?? '';
  return name === '' ? userId : name;
}

function sheetLabel(blockId: string, context: PendingSheetContext): string {
  const block = context.blocks.find((row) => row.id === blockId);
  // authored: a block this device does not hold (yet) has no name to give.
  if (block === undefined) return 'Ficha';
  const name = blockName(blockId, context);
  const type = blockTypeLabel(block.seed_version, block.block_type);
  return name === type ? type : `${name} — ${type}`;
}

/**
 * The "Enviando › Fichas" rows: one per block with an unsent, non-dead `sheet/*` or `block/*`
 * op, the most recently changed first; "Enviando…" while any of its ops is in a request that
 * has not answered (`sent`), else "Aguardando envio".
 */
export function pendingSheetRows(outbox: readonly PendingSheetOutboxLike[], context: PendingSheetContext): PendingSheetRow[] {
  const byBlock = new Map<string, { latest: PendingSheetOutboxLike; sent: boolean }>();
  for (const row of outbox) {
    if (row.status !== 'pending' && row.status !== 'sent') continue;
    const blockId = outboxBlockId(row.path);
    if (blockId === null) continue;
    const entry = byBlock.get(blockId);
    if (entry === undefined) byBlock.set(blockId, { latest: row, sent: row.status === 'sent' });
    else {
      if (row.client_ts > entry.latest.client_ts) entry.latest = row;
      if (row.status === 'sent') entry.sent = true;
    }
  }
  return [...byBlock.entries()]
    .sort(([a, x], [b, y]) => (x.latest.client_ts === y.latest.client_ts ? (a < b ? -1 : 1) : x.latest.client_ts < y.latest.client_ts ? 1 : -1))
    .map(([blockId, entry]) => ({
      block_id: blockId,
      primary: sheetLabel(blockId, context),
      secondary: `Alterada por ${userName(entry.latest.actor_id, context.users)} · ${formatShortDateTime(entry.latest.client_ts)}`,
      state: entry.sent ? 'sending' : 'waiting',
      stateText: entry.sent ? SYNC_ROW_STATE_TEXT.sending : SYNC_ROW_STATE_TEXT.waiting,
    }));
}

// --- Enviando: photos -----------------------------------------------------------------------

/** One original this device still has to upload (its blob unacked) and the photo row it belongs to. */
export interface PendingPhotoInput {
  id: string;
  caption: string | null;
  captured_at: string | null;
  reading_status?: string | null;
  /** The upload stopped (`upload_error` on the blob). */
  error: boolean;
}

export interface PendingPhotoRow {
  id: string;
  primary: string;
  secondary: string;
  state: 'pending' | 'error';
}

/** The photo rows shown before the "+ n fotos aguardando envio" line. */
export const PENDING_PHOTO_ROWS_MAX = 10;

// authored: a photo without a caption still needs a name in its row.
const UNCAPTIONED = 'Foto sem legenda';

function photoPrimary(caption: string | null): string {
  const text = caption?.trim() ?? '';
  return text === '' ? UNCAPTIONED : text;
}

/**
 * The "Enviando › Fotos" rows in upload order (`orderUploads`: photos waiting for a reading
 * first, then by capture time), at most `PENDING_PHOTO_ROWS_MAX`; `more` counts the rest.
 */
export function pendingPhotoRows(photos: readonly PendingPhotoInput[]): { rows: PendingPhotoRow[]; more: number } {
  const ordered = orderUploads(photos.map((photo) => ({ ...photo, kind: 'photo' })));
  return {
    rows: ordered.slice(0, PENDING_PHOTO_ROWS_MAX).map((photo) => ({
      id: photo.id,
      primary: photoPrimary(photo.caption),
      secondary: photo.captured_at === null ? '' : formatShortDateTime(photo.captured_at),
      state: photo.error ? 'error' : 'pending',
    })),
    more: Math.max(0, ordered.length - PENDING_PHOTO_ROWS_MAX),
  };
}

/** The "Enviando" group labels of `85-sync.html`: "Fichas (3)", "Fotos (31)". */
export function sendingGroupText(group: 'sheets' | 'photos', n: number): string {
  return `${group === 'sheets' ? 'Fichas' : 'Fotos'} (${n})`;
}

/** "+ 16 fotos aguardando envio" / "+ 1 foto aguardando envio". */
export function morePhotosText(n: number): string {
  return `+ ${plural(n, 'foto', 'fotos')} aguardando envio`;
}

// --- Leituras -------------------------------------------------------------------------------

export interface ReadingPhotoInput {
  id: string;
  caption: string | null;
  captured_at: string | null;
  reading_status: string | null;
}

export interface QueuedReadingRow {
  id: string;
  primary: string;
  secondary: string;
  stateText: string;
}

/** The "Leituras" photo rows: each live photo whose reading is queued or running, oldest first. */
export function queuedReadingRows(photos: readonly ReadingPhotoInput[]): QueuedReadingRow[] {
  return photos
    .filter((photo) => photo.reading_status === 'queued' || photo.reading_status === 'running')
    .sort((a, b) => ((a.captured_at ?? '') === (b.captured_at ?? '') ? (a.id < b.id ? -1 : 1) : (a.captured_at ?? '') < (b.captured_at ?? '') ? -1 : 1))
    .map((photo) => ({
      id: photo.id,
      primary: photoPrimary(photo.caption),
      secondary: photo.captured_at === null ? '' : formatShortDateTime(photo.captured_at),
      stateText: SYNC_ROW_STATE_TEXT.readingQueued,
    }));
}

// --- Baixando -------------------------------------------------------------------------------

/** Sheets (live blocks) and photos (live photo files) of one relatório. */
export interface DownloadTotals {
  sheets: number;
  photos: number;
}

export interface DownloadProgress {
  /** "Baixando… 12 de 30 fichas · 8 de 20 fotos", or "Baixando…" without totals. */
  text: string;
  /** The Home card's form: "Baixando… 12 de 30 fichas". */
  short: string;
  /** (sheets + photos held) / (sheets + photos on the server), floored, 0-100; null without totals. */
  percent: number | null;
}

const DOWNLOADING = 'Baixando…';

/**
 * The download line of one relatório (ledger 106/166): what this device holds of it against
 * the server's totals (`RelatorioSummary.progress`). A server that sends no totals (older
 * than contract 11) reads "Baixando…" alone.
 */
export function downloadProgress(totals: DownloadTotals | undefined, local: DownloadTotals): DownloadProgress {
  if (totals === undefined || totals.sheets + totals.photos <= 0) return { text: DOWNLOADING, short: DOWNLOADING, percent: null };
  const sheets = Math.min(Math.max(0, local.sheets), totals.sheets);
  const photos = Math.min(Math.max(0, local.photos), totals.photos);
  const sheetsPart = totals.sheets > 0 ? `${sheets} de ${plural(totals.sheets, 'ficha', 'fichas')}` : null;
  const photosPart = totals.photos > 0 ? `${photos} de ${plural(totals.photos, 'foto', 'fotos')}` : null;
  const parts = [sheetsPart, photosPart].filter((part): part is string => part !== null);
  const percent = Math.min(100, Math.max(0, Math.floor(((sheets + photos) / (totals.sheets + totals.photos)) * 100)));
  return { text: `${DOWNLOADING} ${parts.join(' · ')}`, short: `${DOWNLOADING} ${parts[0]}`, percent };
}

/** "40 %" (the mock's spacing). */
export function percentText(percent: number): string {
  return `${percent} %`;
}

/** What `localDownloadTotals` reads of a block and of a file row. */
export type DownloadBlockLike = Pick<BlockRow, 'relatorio_id' | 'removed_at'>;
export interface DownloadFileLike {
  relatorio_id: string | null;
  kind: string;
  removed_at: string | null;
}

/** The live blocks and live photo files this device holds, per relatório. */
export function localDownloadTotals(blocks: readonly DownloadBlockLike[], files: readonly DownloadFileLike[]): Map<string, DownloadTotals> {
  const out = new Map<string, DownloadTotals>();
  const bucket = (id: string) => {
    let entry = out.get(id);
    if (entry === undefined) {
      entry = { sheets: 0, photos: 0 };
      out.set(id, entry);
    }
    return entry;
  };
  for (const block of blocks) if (block.removed_at === null) bucket(block.relatorio_id).sheets++;
  for (const file of files) if (file.removed_at === null && file.kind === 'photo' && file.relatorio_id !== null) bucket(file.relatorio_id).photos++;
  return out;
}

export interface DownloadRowInput {
  /** The device's stream rows (`sync_state`). */
  states: readonly { id: string; complete: boolean }[];
  /** The company pull's summary (`progress` when the server sends it). */
  summaries: readonly { id: string; project_id: string; progress?: DownloadTotals | undefined }[];
  projects: readonly Pick<ProjectRow, 'id' | 'name' | 'site' | 'client_id'>[];
  clients: readonly { id: string; name: string }[];
  local: ReadonlyMap<string, DownloadTotals>;
}

export interface DownloadRow {
  relatorio_id: string;
  /** The relatório as the Sumário names it (client · obra). */
  primary: string;
  secondary: string;
  percent: number | null;
  percentText: string | null;
}

/** The "Baixando" rows: every relatório stream this device follows and has not pulled to its end. */
export function downloadRows(input: DownloadRowInput): DownloadRow[] {
  const summaries = new Map(input.summaries.map((row) => [row.id, row]));
  const projects = new Map(input.projects.map((row) => [row.id, row]));
  const clients = new Map(input.clients.map((row) => [row.id, row]));
  return input.states
    .filter((state) => !state.complete && state.id !== 'company' && !isProjectStreamId(state.id))
    .map((state) => {
      const summary = summaries.get(state.id);
      const project = summary === undefined ? undefined : projects.get(summary.project_id);
      const client = project?.client_id == null ? null : (clients.get(project.client_id) ?? null);
      const line = downloadProgress(summary?.progress, input.local.get(state.id) ?? { sheets: 0, photos: 0 });
      return {
        relatorio_id: state.id,
        primary: sumarioTitle(client, project ?? null),
        secondary: line.text,
        percent: line.percent,
        percentText: line.percent === null ? null : percentText(line.percent),
      };
    });
}

// "Último envio de Eduardo: 06/09 18:10" is `lastSendText` (`relatorio/pre-issue.ts`), shared
// with the Export dialog's sync lines.

// --- Decisões and Mesclado automaticamente ---------------------------------------------------

/** "3 aguardam decisão" / "1 aguarda decisão" (the Decisões head badge). */
export function decisionsCountText(n: number): string {
  return n === 1 ? '1 aguarda decisão' : `${n} aguardam decisão`;
}

/** The rule words of a merge row's `.sr-secondary` (`85-sync.html` lines 131-135, "Como funciona a mesclagem"). */
export function mergeRuleText(rule: MergeRule): string {
  switch (rule) {
    case 'filled_over_empty':
      return 'preenchido vence vazio';
    case 'nc_over_c':
    case 'nc_observation':
      return 'NC vence C';
    case 'latest_text':
    case 'latest_edit':
      return 'a edição mais recente prevalece';
    case 'same_value':
      // authored: never listed (no entry), named for completeness.
      return 'mesmo valor';
    case 'contradiction':
      // authored: Stories 10.2/10.3 list contradictions under Decisões.
      return 'contradição';
  }
}

/** A merge row's secondary: "07/09 14:20 · NC vence C" (the standing version's time, then the rule). */
export function mergeRowSecondaryText(info: Pick<MergeInfo, 'rule' | 'standing'>): string {
  const at = formatShortDateTime(info.standing.client_ts);
  return at === '' ? mergeRuleText(info.rule) : `${at} · ${mergeRuleText(info.rule)}`;
}

/**
 * The X/S seam of Epic 10 (Story 10.4 Design Notes): one open contradiction as the Decisões
 * section lists it. Stories 10.2/10.3 own its source and its buttons; until they merge the
 * list is empty.
 */
export interface SyncDecisionRow {
  key: string;
  kind: 'cell' | 'removal' | 'duplicate_tag';
  text: string;
}
