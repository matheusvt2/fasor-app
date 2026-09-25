import type { RelatorioSummary } from '../contract/sync.ts';
import { formatServiceDates, formatShortDateTime, formatTimeOfDay } from '../format/datetime.ts';
import type { Op } from '../ops/op.ts';
import { fichasCountText, progress, progressCounterState } from '../relatorio/progress.ts';
import { sumarioTitle } from '../relatorio/sumario.ts';
import type { BlockRow, ProjectRow, RegistryRow, RelatorioRow, RelatorioStatus, TemplateRow } from '../schemas/entities.ts';
import { RELATORIO_STATUSES, statusPillId, type StatusPillId } from '../status/table.ts';
import {
  syncBadgeState,
  syncCounts,
  type OutboxLike,
  type SyncBadgeState,
  type SyncCounts,
} from '../sync/counts.ts';

/*
 * AD-2: Home is a rendering of this module. Every count, every order and every
 * line of text on a card is decided here once; `apps/web/src/surfaces/home` places
 * the results in the mock's elements and derives nothing of its own.
 */

/** What a card needs of a `sync_state` row (AD-8). */
export interface SyncStateLike {
  id: string;
  complete: boolean;
  last_sync_at: string | null;
}

/** An outbox row scoped to its relatório, so a card's badge counts only its own work. */
export type HomeOutboxLike = OutboxLike & Pick<Op, 'relatorio_id'>;

export type HomeCardDeviceKind = 'on-device' | 'downloading' | 'absent-online' | 'absent-offline';

export interface HomeCardDevice {
  kind: HomeCardDeviceKind;
  /** `.card-device`, already written out. */
  text: string;
}

export interface HomeCard {
  id: string;
  status: RelatorioStatus;
  statusPillId: StatusPillId;
  /** `.card-title`: "⟨cliente⟩ · ⟨local⟩". */
  title: string;
  /** `.card-meta`: "⟨datas⟩ · ⟨template⟩"; '' when neither part exists. */
  meta: string;
  device: HomeCardDevice;
  badgeState: Exclude<SyncBadgeState, 'conflict'>;
  badgeCounts: SyncCounts;
  /** The relatório Em campo on this device: sorts first and carries `.is-current`. */
  isCurrent: boolean;
  /** `.is-unavailable`: not on this device and no connection to fetch it. */
  isUnavailable: boolean;
  /**
   * `.progress-counter[data-state]`: "42 de 94 fichas" (`20-home.html`), only on a card
   * whose relatório is on this device (Story 12.2); null otherwise.
   */
  counter: { text: string; state: 'complete' | 'pending' } | null;
}

export interface HomeCardsInput {
  relatorios: readonly RelatorioRow[];
  /** The company pull's per-relatório summary: the only source of a relatório never downloaded. */
  summary: readonly RelatorioSummary[];
  projects: readonly ProjectRow[];
  clients: readonly RegistryRow[];
  templates: readonly TemplateRow[];
  syncStates: readonly SyncStateLike[];
  outbox: readonly HomeOutboxLike[];
  /** One status tile pressed, or null for the whole list. Never changes the board counts. */
  filter: RelatorioStatus | null;
  online: boolean;
  /** The server answered the last finished cycle (`syncBadgeState`); omitted means true. */
  reachable?: boolean;
  /** Injected, never read from a clock here (TC-1): decides whether a card's stamp needs its date. */
  now: Date;
  /** Every block this device holds (Story 12.2): the counter of an on-device card. Omitted means no counter. */
  blocks?: readonly BlockRow[];
}

// authored: the mock never draws a relatório without a client and a local, but a
// Rascunho created minutes ago has neither, and a card with an empty title is a card
// nobody can tap with confidence.
const UNTITLED = 'Relatório sem identificação';

const DEVICE_TEXT = {
  // Verbatim from `20-home.html` and `key-home.html` frame 3.
  onDevice: (stamp: string) => (stamp === '' ? 'No aparelho' : `No aparelho · atualizado ${stamp}`),
  // AD-8's counted form ("Baixando… n de m") waits for the summary's `progress(snapshot)`;
  // until then the honest word is the state alone (Design Notes).
  downloading: 'Baixando…',
  absentOnline: 'Não está neste aparelho · baixa ao abrir',
  absentOffline: 'Não está neste aparelho — conecte para baixar',
} as const;

const join = (parts: readonly (string | null | undefined)[]) =>
  parts.filter((part): part is string => typeof part === 'string' && part !== '').join(' · ');

/** Every status present, zeros included, in board order. */
export function statusBoardCounts(rows: readonly { status: RelatorioStatus }[]): Record<RelatorioStatus, number> {
  const counts = {} as Record<RelatorioStatus, number>;
  for (const status of RELATORIO_STATUSES) counts[status] = 0;
  for (const row of rows) if (row.status in counts) counts[row.status] = (counts[row.status] ?? 0) + 1;
  return counts;
}

interface CardSource {
  id: string;
  status: RelatorioStatus;
  project_id: string;
  template_id: string | null;
  local: string | null;
  service_start: string | null;
  service_end: string | null;
}

function fromRow(row: RelatorioRow): CardSource {
  return {
    id: row.id,
    status: row.status,
    project_id: row.project_id,
    template_id: row.template_id,
    local: row.setup.local,
    service_start: row.setup.service_start,
    service_end: row.setup.service_end,
  };
}

function fromSummary(entry: RelatorioSummary): CardSource {
  return {
    id: entry.id,
    status: entry.status,
    project_id: entry.project_id,
    template_id: entry.template_id,
    local: null,
    service_start: null,
    service_end: null,
  };
}

/**
 * The time of day alone would read as today for a copy that came down last week, so a
 * stamp from another day carries its date (`formatShortDateTime`, the same form the
 * Sync status rows use). Both are rendered in America/Sao_Paulo, so "the same day" is
 * decided on the date part of that zone's rendering, never on UTC.
 */
function updatedStamp(lastSyncAt: string | null, now: Date): string {
  if (lastSyncAt === null) return '';
  const short = formatShortDateTime(lastSyncAt);
  if (short === '') return '';
  return short.slice(0, 5) === formatShortDateTime(now.toISOString()).slice(0, 5)
    ? formatTimeOfDay(lastSyncAt)
    : short;
}

function deviceOf(state: SyncStateLike | undefined, online: boolean, now: Date): HomeCardDevice {
  if (state !== undefined) {
    return state.complete
      ? { kind: 'on-device', text: DEVICE_TEXT.onDevice(updatedStamp(state.last_sync_at, now)) }
      : { kind: 'downloading', text: DEVICE_TEXT.downloading };
  }
  return online
    ? { kind: 'absent-online', text: DEVICE_TEXT.absentOnline }
    : { kind: 'absent-offline', text: DEVICE_TEXT.absentOffline };
}

/**
 * The ordered Home cards. The card set is the local relatório rows (tombstones
 * excluded) unioned by id with the company summary entries the device has no row
 * for; ordering is the current card, then the service start descending with missing
 * dates last, then the id.
 */
export function homeCards(input: HomeCardsInput): HomeCard[] {
  const sources = new Map<string, CardSource>();
  for (const row of input.relatorios) {
    if (row.removed_at !== null) continue;
    sources.set(row.id, fromRow(row));
  }
  for (const entry of input.summary) {
    if (sources.has(entry.id)) continue;
    sources.set(entry.id, fromSummary(entry));
  }

  const projects = new Map(input.projects.map((p) => [p.id, p]));
  const clients = new Map(
    input.clients.filter((c) => c.kind === 'client').map((c) => [c.id, c.name as string]),
  );
  const templates = new Map(input.templates.map((t) => [t.id, t.name]));
  const states = new Map(input.syncStates.map((s) => [s.id, s]));

  const outboxByRelatorio = new Map<string, HomeOutboxLike[]>();
  for (const row of input.outbox) {
    const id = row.relatorio_id;
    if (typeof id !== 'string') continue;
    const bucket = outboxByRelatorio.get(id);
    if (bucket === undefined) outboxByRelatorio.set(id, [row]);
    else bucket.push(row);
  }

  const blocksByRelatorio = new Map<string, BlockRow[]>();
  for (const block of input.blocks ?? []) {
    const bucket = blocksByRelatorio.get(block.relatorio_id);
    if (bucket === undefined) blocksByRelatorio.set(block.relatorio_id, [block]);
    else bucket.push(block);
  }
  const counterOf = (id: string, device: HomeCardDevice): HomeCard['counter'] => {
    if (input.blocks === undefined || device.kind !== 'on-device') return null;
    const p = progress({ blocks: blocksByRelatorio.get(id) ?? [], suggestions: [] });
    return { text: fichasCountText(p), state: progressCounterState(p) };
  };

  const cards: HomeCard[] = [];
  for (const source of sources.values()) {
    const project = projects.get(source.project_id);
    const clientName = project?.client_id === null || project === undefined ? null : (clients.get(project.client_id) ?? null);
    // Epic 4 QA Q5: with the project row known, the card names the relatório exactly as the
    // Sumário header does (`sumarioTitle`: client · obra); the setup's "Local" is the
    // section 1 phrase, never the card title. Without it, the older fallback stands.
    const title =
      project === undefined ? join([clientName, source.local]) || UNTITLED : sumarioTitle(clientName === null ? null : { name: clientName }, project);
    const meta = join([
      formatServiceDates(source.service_start, source.service_end),
      source.template_id === null ? null : (templates.get(source.template_id) ?? null),
    ]);
    const counts = syncCounts(outboxByRelatorio.get(source.id) ?? []);
    const device = deviceOf(states.get(source.id), input.online, input.now);
    cards.push({
      id: source.id,
      status: source.status,
      statusPillId: statusPillId(source.status),
      title,
      meta,
      device,
      badgeState: syncBadgeState(counts, { online: input.online, reachable: input.reachable }),
      badgeCounts: counts,
      isCurrent: false,
      isUnavailable: device.kind === 'absent-offline',
      counter: counterOf(source.id, device),
    });
  }

  const startOf = new Map(cards.map((card) => [card.id, sources.get(card.id)?.service_start ?? null]));
  cards.sort((a, b) => {
    const sa = startOf.get(a.id) ?? null;
    const sb = startOf.get(b.id) ?? null;
    if (sa !== sb) {
      if (sa === null) return 1;
      if (sb === null) return -1;
      return sa < sb ? 1 : -1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const current = cards.find((card) => card.status === 'em_campo' && states.has(card.id));
  if (current !== undefined) {
    current.isCurrent = true;
    cards.splice(cards.indexOf(current), 1);
    cards.unshift(current);
  }

  return input.filter === null ? cards : cards.filter((card) => card.status === input.filter);
}

/** `.shortcut-sub` of the Templates card; the count is live, the wording is the mock's. */
export function templatesSubline(count: number): string {
  // authored: the mock only draws the plural with two templates on the device.
  if (count === 0) return 'Nenhum template neste aparelho';
  return count === 1 ? '1 template' : `${count} templates`;
}

/**
 * `.shortcut-sub` of the Cadastros card. authored: `20-home.html` draws the four registries
 * that existed then; Empresa and Critérios de aceitação are tabs of the same surface since
 * Epic 2, so the line names all six (Epic 2 retro D-8).
 */
export const CADASTROS_SUBLINE = 'Empresa · Clientes · Instrumentos · Fabricantes · Classes de tensão · Critérios';
