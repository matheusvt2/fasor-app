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

/** The five badge states of `key-sync-status.html`. */
export type SyncBadgeState = 'ok' | 'pending' | 'offline' | 'error' | 'conflict';

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
}

/**
 * Conflict before error before offline before pending (epic-10 Conflict 12, the banner
 * priority). A rejected op needs attention wherever the device is.
 * An unreachable server reads as `offline` ("Sem conexão"): EXPERIENCE.md has five badge
 * states and no sixth for it, and "no connection; still saving locally" is exactly what
 * the user needs to know then. Sync status names the actual cause.
 */
export function syncBadgeState(counts: Pick<SyncCounts, 'dead' | 'pending' | 'sent'>, deps: SyncBadgeInputs): SyncBadgeState {
  if ((deps.conflicts ?? 0) > 0) return 'conflict';
  if (counts.dead > 0) return 'error';
  if (!deps.online || deps.reachable === false) return 'offline';
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
 * The sign-out confirm sentence around a pending summary, in agreement with its count:
 * "1 ficha ainda não foi enviada. Ela continua ..." / "3 fichas ainda não foram enviadas. Elas continuam ...".
 */
export function pendingNotSentText(summary: string, count: number): string {
  return count === 1
    ? `${summary} ainda não foi enviada. Ela continua neste aparelho e sobe quando você entrar de novo com conexão.`
    : `${summary} ainda não foram enviadas. Elas continuam neste aparelho e sobem quando você entrar de novo com conexão.`;
}

/** Sync status: "1 alteração rejeitada" / "3 alterações rejeitadas". */
export function rejectedText(count: number): string {
  return plural(count, 'alteração rejeitada', 'alterações rejeitadas');
}

/** Sync status, the server's `superseded` signal: "1 alteração mesclada pelo servidor". */
export function supersededText(count: number): string {
  return plural(count, 'alteração mesclada pelo servidor', 'alterações mescladas pelo servidor');
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
    case 'offline':
      return 'Sem conexão';
    case 'error':
      return 'Erro';
    case 'conflict':
      return 'Conflito';
  }
}

/**
 * The narrow-viewport word of the same badge (`.sync-short`, `MOCK-GUIDE.md`):
 * "OK" · "Off" · ⟨n⟩ · "Erro" · "Confl.". Both words are always in the DOM; the
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
      return 'OK';
    case 'pending':
      return String(counts.pending + counts.sent);
    case 'offline':
      return 'Off';
    case 'error':
      return 'Erro';
    case 'conflict':
      return 'Confl.';
  }
}
