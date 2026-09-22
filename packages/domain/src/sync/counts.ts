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
  /** Unsent, non-dead `file/{id}` photo creates (0 until Epic 6 emits them). */
  photos_pending: number;
}

function blockIdOf(path: string): string | null {
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

export function syncCounts(outbox: readonly OutboxLike[]): SyncCounts {
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
    const blockId = blockIdOf(row.path);
    if (blockId) blocks.add(blockId);
    if (isPhotoCreate(row)) photos++;
  }
  return { pending, sent, dead, sheets_pending: blocks.size, photos_pending: photos };
}

/** The five badge states of `key-sync-status.html`; `conflict` waits for the deferred merge policy. */
export type SyncBadgeState = 'ok' | 'pending' | 'offline' | 'error' | 'conflict';

/** Error before offline before pending: a rejected op needs attention wherever the device is. */
export function syncBadgeState(counts: SyncCounts, deps: { online: boolean }): Exclude<SyncBadgeState, 'conflict'> {
  if (counts.dead > 0) return 'error';
  if (!deps.online) return 'offline';
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
