import type { MergeInfo } from '../merge/info.ts';
import type { Op } from '../ops/op.ts';
import { safeParsePath } from '../ops/path.ts';
import { peopleCount, plural, relatoriosCount } from '../text/plural.ts';

/*
 * AD-2, UX-DR10: the sync counts, the badge state and every text derived from
 * them exist once, here. `apps/web/src/state` renders these results and never
 * counts an outbox itself.
 */

export type OutboxStatus = 'pending' | 'sent' | 'acked' | 'dead';

/** What `syncCounts` reads of an outbox row; `kind` and `value` only tell a photo create apart. */
export type OutboxLike = Pick<Op, 'path'> & { status: OutboxStatus; kind?: Op['kind']; value?: unknown };

export interface SyncCounts {
  pending: number;
  sent: number;
  dead: number;
  /** Distinct blocks with an unsent, non-dead `sheet/*` or `block/*` op. */
  sheets_pending: number;
  /**
   * Unsent, non-dead `file/{id}` photo creates; with the `uploads` input (Story 10.4), the
   * distinct photo ids of those creates united with the original blobs still waiting to
   * upload without an error.
   */
  photos_pending: number;
  /** Story 10.4: the original blobs whose upload stopped with an error (0 when `uploads` is not given). */
  upload_errors: number;
  /** Story 8.1: the device's suggestion rows with `status = pending` (0 when not given). */
  suggestions_pending: number;
  /** Story 8.1: the device's photo rows whose reading is `queued` or `running` (0 when not given). */
  readings_queued: number;
  /** Story 10.1: the merges by rule this tab listed since it opened (`MergeInfo` entries, 0 when not given). */
  merged: number;
}

/**
 * Story 8.1 (coordinator conflict 3): what the reading counts read besides the outbox, the
 * device's own rows passed explicitly. Omitted, both counts are 0.
 */
export interface ReadingCountInputs {
  suggestions?: readonly { status: string }[];
  photos?: readonly { reading_status?: string | null }[];
}

/** Story 10.4: one original blob this device has not seen acked by the server; `error` when its upload stopped. */
export interface UploadCountInput {
  id: string;
  error: boolean;
}

/** The block an outbox path writes on (`sheet/*`, `block/*`), or null. */
export function outboxBlockId(path: string): string | null {
  const parsed = safeParsePath(path);
  if (!parsed) return null;
  if (parsed.family === 'block' || parsed.family === 'block/field') return parsed.id;
  if (parsed.family.startsWith('sheet/')) return (parsed as { block_id: string }).block_id;
  return null;
}

function isPhotoCreate(row: OutboxLike): boolean {
  if (row.kind !== 'create') return false;
  const parsed = safeParsePath(row.path);
  if (!parsed || parsed.family !== 'file') return false;
  return (row.value as { kind?: unknown } | null | undefined)?.kind === 'photo';
}

/**
 * Story 10.1 (epic-10 Conflict 3): `merges` are the sync engine's in-memory merge entries
 * (`MergeInfo`), an explicit input like `reading`; each counts once.
 */
export function syncCounts(
  outbox: readonly OutboxLike[],
  reading: ReadingCountInputs = {},
  merges: readonly Pick<MergeInfo, 'op_id' | 'over_op_id'>[] = [],
  uploads?: readonly UploadCountInput[],
): SyncCounts {
  const photoIds = new Set<string>();
  let pending = 0;
  let sent = 0;
  let dead = 0;
  let photos = 0;
  const blocks = new Set<string>();
  for (const row of outbox) {
    if (row.status === 'pending') pending++;
    else if (row.status === 'sent') sent++;
    else if (row.status === 'dead') dead++;
    if (row.status !== 'pending' && row.status !== 'sent') continue;
    const blockId = outboxBlockId(row.path);
    if (blockId) blocks.add(blockId);
    if (isPhotoCreate(row)) {
      photos++;
      photoIds.add(row.path.slice('file/'.length));
    }
  }
  const suggestions = (reading.suggestions ?? []).filter((row) => row.status === 'pending').length;
  const readings = (reading.photos ?? []).filter((row) => row.reading_status === 'queued' || row.reading_status === 'running').length;
  const merged = new Set(merges.map((entry) => `${entry.op_id}:${entry.over_op_id}`)).size;
  let uploadErrors = 0;
  if (uploads !== undefined) {
    // A photo whose upload stopped counts as an error only, even while its create op waits.
    for (const upload of uploads) if (!upload.error) photoIds.add(upload.id);
    for (const upload of uploads) {
      if (!upload.error) continue;
      uploadErrors++;
      photoIds.delete(upload.id);
    }
  }
  return {
    pending,
    sent,
    dead,
    sheets_pending: blocks.size,
    photos_pending: uploads === undefined ? photos : photoIds.size,
    upload_errors: uploadErrors,
    suggestions_pending: suggestions,
    readings_queued: readings,
    merged,
  };
}

/**
 * The five badge states of `key-sync-status.html`, plus `retrying` (Story 14.10 lane B,
 * production finding of 2026-10-15): the last cycle failed on the network or a 5xx while the
 * server still answers its health check, so "Sem conexão" would be false. Story 25.3 adds
 * `late` (`85-sync-atrasado.html`): an op has waited more than one minute while the device is
 * online, signed in, reaching the server and not paused.
 */
export type SyncBadgeState = 'ok' | 'pending' | 'late' | 'offline' | 'retrying' | 'error' | 'conflict';

export interface SyncBadgeInputs {
  /** The browser says it has a network. */
  online: boolean;
  /**
   * The server answered the last finished cycle. False while that cycle ended in a
   * network or 5xx failure, or while the session needs a new sign-in: the device then
   * cannot send anything either, so it must not read "Sincronizado". Omitted means true.
   */
  reachable?: boolean;
  /**
   * Story 10.4 (epic-10 Conflict 12): the open decisions this device holds (Stories
   * 10.2/10.3: `decisionTotal` of the held relatórios; omitted means 0). Any turns the
   * badge to `conflict` first.
   */
  conflicts?: number;
  /**
   * Story 14.10 lane B: after a cycle that ended unreachable, whether the server answered the
   * health probe the engine sent then. True turns an unreachable cycle into `retrying`
   * ("Tentando de novo"); false or omitted keeps it `offline`. Ignored while `reachable` is
   * not false.
   */
  serverAnswers?: boolean;
  /**
   * Story 25.3: how many waiting ops have waited more than one minute (`lateOpCount`); omitted
   * means 0. Any turns a `pending` badge to `late`, never one that an earlier state explains.
   */
  late?: number;
  /** Story 25.3: sync is paused on this device (the engine waits for a sign-in): never `late` then. */
  paused?: boolean;
}

/**
 * Conflict before error before offline before pending (epic-10 Conflict 12, the banner
 * priority). A rejected op needs attention wherever the device is.
 * Story 25.3: `late` sits between the unreachable states and `pending`: only a device that is
 * online, reaching the server and not paused reads it, when an op has waited more than a minute.
 * An unreachable server reads as `offline` ("Sem conexão"): EXPERIENCE.md has five badge
 * states and no sixth for it, and "no connection; still saving locally" is exactly what
 * the user needs to know then. Sync status names the actual cause.
 * Story 14.10 lane B: an unreachable cycle while the server answers its health check reads
 * `retrying` ("Tentando de novo") instead; the browser offline stays `offline` whatever the
 * probe said.
 */
export function syncBadgeState(counts: Pick<SyncCounts, 'dead' | 'pending' | 'sent'>, deps: SyncBadgeInputs): SyncBadgeState {
  if ((deps.conflicts ?? 0) > 0) return 'conflict';
  if (counts.dead > 0) return 'error';
  if (!deps.online) return 'offline';
  if (deps.reachable === false) return deps.serverAnswers === true ? 'retrying' : 'offline';
  if (counts.pending + counts.sent > 0 && (deps.late ?? 0) > 0 && deps.paused !== true) return 'late';
  if (counts.pending + counts.sent > 0) return 'pending';
  return 'ok';
}

/**
 * "3 fichas", "1 ficha e 2 fotos", "5 alterações" (ops that are neither a sheet nor a
 * photo) or '' when nothing waits. Feeds the Sync status headline and the sign-out
 * wording of Account.
 */
export function pendingSummaryText(counts: SyncCounts): string {
  const parts: string[] = [];
  if (counts.sheets_pending > 0) parts.push(plural(counts.sheets_pending, 'ficha', 'fichas'));
  if (counts.photos_pending > 0) parts.push(plural(counts.photos_pending, 'foto', 'fotos'));
  if (parts.length > 0) return parts.join(' e ');
  const waiting = counts.pending + counts.sent;
  return waiting > 0 ? plural(waiting, 'alteração', 'alterações') : '';
}

/** The number of items behind a pending summary (for singular or plural sentences around it). */
export function pendingSummaryCount(counts: SyncCounts): number {
  if (counts.sheets_pending + counts.photos_pending > 0) return counts.sheets_pending + counts.photos_pending;
  return counts.pending + counts.sent;
}

/**
 * Story 20.11: the sign-out confirm sentence once the flush is done, over the count of what is
 * still unsent on the device (outbox ops not acknowledged plus photo originals not uploaded):
 * "1 alteração ainda não foi enviada. Sair apaga-a deste aparelho." /
 * "3 alterações ainda não foram enviadas. Sair apaga-as deste aparelho."
 */
export function signOutUnsentText(count: number): string {
  // authored: 2026-11-04, Story 20.11 (coordinator's reading; the sign-out deletes the device data).
  return count === 1
    ? '1 alteração ainda não foi enviada. Sair apaga-a deste aparelho.'
    : `${count} alterações ainda não foram enviadas. Sair apaga-as deste aparelho.`;
}

/**
 * Story 20.12: the sentence of a reading or an audit the server refused with `429
 * quota_exceeded` (the company's daily ceiling of paid AI work).
 */
export function quotaExceededText(kind: 'reading' | 'audit'): string {
  // authored: 2026-11-04, Story 20.12.
  return kind === 'reading'
    ? 'Limite diário de leituras atingido. Tente amanhã ou fale com o administrador.'
    : 'Limite diário de conferências atingido. Tente amanhã ou fale com o administrador.';
}

/** Sync status: "1 alteração rejeitada" / "3 alterações rejeitadas". */
export function rejectedText(count: number): string {
  return plural(count, 'alteração rejeitada', 'alterações rejeitadas');
}

/**
 * Stories 20.7 to 20.10 (contract 29): why the server refused an op, one sentence per code a
 * business rule gives, shown under the rejected count of Sync status (`.sr-secondary`). Null for
 * the codes of a malformed op, which no user action causes.
 */
export function opRejectReasonText(code: string | null | undefined): string | null {
  switch (code) {
    case 'op_status_transition':
      // authored: 2026-11-03, Story 20.7.
      return 'Mudança de status recusada: no servidor, o relatório já está em outro status.';
    case 'op_attribution':
      // authored: 2026-11-03, Story 20.8.
      return 'Alteração recusada: o autor ou a data não conferem com o servidor. Confira a data e a hora deste aparelho.';
    case 'op_value_invalid':
      // authored: 2026-11-03, Story 20.9.
      return 'Alteração recusada: um valor passa do tamanho ou do tipo que o campo aceita.';
    case 'op_target_missing':
      // authored: 2026-11-03, Story 20.10.
      return 'Alteração recusada: o item alterado não existe neste relatório no servidor.';
    case 'op_forbidden':
      // authored: 2026-11-03, Story 20.10 (review): both refusals of the code, the removal of an
      // Emitido relatório and a write to another user's own row (`user/{id}`).
      return 'Alteração recusada: o servidor não permite esta alteração, como remover um relatório emitido ou mudar o cadastro de outra pessoa.';
    default:
      return null;
  }
}

/** Story 20.9: the share of a text field's cap from which its character count shows (authored, 90 %). */
export const CHAR_COUNT_FROM = 0.9;

/** "18.000" from 18000: thousands grouped with dots, as pt-BR writes a count. */
function groupedCount(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Story 20.9: the counter under a capped text field, "180 de 200 caracteres", once the text
 * reaches `CHAR_COUNT_FROM` of the cap; null below it (the counter is not shown).
 */
export function charCountText(length: number, cap: number): string | null {
  if (cap <= 0 || length < cap * CHAR_COUNT_FROM) return null;
  // authored: 2026-11-03, Story 20.9.
  return `${groupedCount(length)} de ${groupedCount(cap)} caracteres`;
}

/** AD-8 eviction screen, from the company pull: "O servidor tem 3 relatórios e 2 pessoas da equipe." */
export function serverHoldsText(relatorios: number, users: number): string {
  return `O servidor tem ${relatoriosCount(relatorios)} e ${peopleCount(users)}.`;
}

/** The badge word, always visible beside the dot (`key-sync-status.html` lines 308-315). */
export function syncBadgeLabel(state: SyncBadgeState, counts: SyncCounts): string {
  switch (state) {
    case 'ok':
      return 'Sincronizado';
    case 'pending':
      return plural(counts.pending + counts.sent, 'pendente', 'pendentes');
    case 'late':
      // Story 25.3: the frame's word (`85-sync-atrasado.html`).
      return 'Envio atrasado';
    case 'offline':
      return 'Sem conexão';
    case 'retrying':
      // authored: Story 14.10 lane B, the server answers but the last sync failed (open for Bruno).
      return 'Tentando de novo';
    case 'error':
      return 'Erro';
    case 'conflict':
      return 'Conflito';
  }
}

/**
 * Review fixes 2026-10-06 (F-23, D10): what the Sync live region announces on a state
 * transition, never a count (EXPERIENCE.md: "announces transitions only, never counts";
 * UX-DR8). authored: the pending word drops the badge's count.
 */
export function syncAnnouncementText(state: SyncBadgeState): string {
  switch (state) {
    case 'ok':
      return 'Sincronizado';
    case 'pending':
      return 'Alterações pendentes';
    case 'late':
      // authored (e25a, listed for Bruno): the frame's badge word, announced as it is.
      return 'Envio atrasado';
    case 'offline':
      return 'Sem conexão';
    case 'retrying':
      // authored: Story 14.10 lane B.
      return 'Tentando de novo';
    case 'error':
      return 'Erro de sincronização';
    case 'conflict':
      return 'Conflito';
  }
}

/** F-14 (review 2026-10-06): the word for a cycle running now. */
export const SYNCING_WORD = 'Sincronizando…';

/**
 * F-14: the Sync status headline's word, `syncBadgeLabel`'s, except while a cycle runs over a
 * state with nothing for the user to act on (`ok`, `pending`, `late`, `offline`, `retrying`): then "Sincronizando…",
 * the reason the disabled "Sincronizar agora" gives too, so the headline and the button always
 * read one state. A conflict or an error keeps its word: it needs the user whatever runs.
 */
export function syncStatusWord(state: SyncBadgeState, counts: SyncCounts, running: boolean): string {
  if (running && (state === 'ok' || state === 'pending' || state === 'late' || state === 'offline' || state === 'retrying')) return SYNCING_WORD;
  return syncBadgeLabel(state, counts);
}

/**
 * The narrow-viewport word of the same badge (`.sync-short`, `MOCK-GUIDE.md`):
 * "Sinc." · "Off" · ⟨n⟩ · "Erro" · "Confl.". Review fixes 2026-10-06 (F-29): authored "Sinc."
 * where the mock says "OK", a word that means nothing on its own. Both words are always in the DOM; the
 * stylesheet decides which one shows, and the badge's accessible name says the
 * state either way.
 *
 * The pending number counts exactly what `syncBadgeLabel` counts (unsent ops, not the
 * sheets-and-photos summary): the two words describe one queue, so a narrow viewport
 * must never show "3" where a wide one shows "5 pendentes".
 */
export function syncBadgeShortLabel(state: SyncBadgeState, counts: SyncCounts): string {
  switch (state) {
    case 'ok':
      return 'Sinc.';
    case 'pending':
      return String(counts.pending + counts.sent);
    case 'late':
      // Story 25.3: the frame's phone word (`proto.js` `SYNC_SHORT.late`).
      return 'Atraso';
    case 'offline':
      return 'Off';
    case 'retrying':
      // authored: Story 14.10 lane B, the narrow word of "Tentando de novo".
      return 'Tentando';
    case 'error':
      return 'Erro';
    case 'conflict':
      return 'Confl.';
  }
}
