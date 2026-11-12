import { plural } from '../text/plural.ts';

/*
 * Story 25.3 (M03): an edit that waited more than one minute while the device could send it.
 * The rule, the count and the sentence live here once; `apps/web` passes the `client_ts` of its
 * waiting outbox rows (`pending` and `sent`) and the clock, and renders what comes back.
 */

/** Story 25.3: an op waiting longer than this (strictly) is late. 60 000 ms exactly is not. */
export const SYNC_LATE_AFTER_MS = 60_000;

/** The instant of a waiting op's `client_ts`, or null when it cannot be read. */
function instantOf(clientTs: string): number | null {
  const at = Date.parse(clientTs);
  return Number.isNaN(at) ? null : at;
}

/**
 * When an op's wait counts from: its `client_ts`, or `sinceMs` when the device became able to send
 * later (online, signed in, reaching the server, not paused): an op committed offline is not late
 * the moment the device reconnects.
 */
function waitStart(clientTs: string, sinceMs: number): number | null {
  const at = instantOf(clientTs);
  return at === null ? null : Math.max(at, sinceMs);
}

/**
 * Story 25.3: how many of the waiting ops (their `client_ts`, the outbox rows still `pending` or
 * `sent`) have waited strictly more than `SYNC_LATE_AFTER_MS` at `nowMs`, the wait counted from
 * the later of `client_ts` and `sinceMs` (when the device last became able to send; omitted, from
 * `client_ts`). A `client_ts` that cannot be read counts as not late.
 */
export function lateOpCount(waitingClientTs: readonly string[], nowMs: number, sinceMs: number = Number.NEGATIVE_INFINITY): number {
  let late = 0;
  for (const clientTs of waitingClientTs) {
    const at = waitStart(clientTs, sinceMs);
    if (at !== null && nowMs - at > SYNC_LATE_AFTER_MS) late += 1;
  }
  return late;
}

/**
 * Story 25.3: the instant (ms) at which the next waiting op turns late, the first instant where
 * `lateOpCount` grows (with the same `sinceMs`), or null when every waiting op is already late or none waits. The caller
 * arms one timer at it so the badge flips without waiting for another render.
 */
export function syncLateAt(waitingClientTs: readonly string[], nowMs: number, sinceMs: number = Number.NEGATIVE_INFINITY): number | null {
  let next: number | null = null;
  for (const clientTs of waitingClientTs) {
    const at = waitStart(clientTs, sinceMs);
    if (at === null) continue;
    // `lateOpCount` counts strictly more than the bound: the op turns late one millisecond after it.
    const turns = at + SYNC_LATE_AFTER_MS + 1;
    if (turns <= nowMs) continue;
    if (next === null || turns < next) next = turns;
  }
  return next;
}

/**
 * Story 25.3 (`85-sync-atrasado.html`): the one line of the late alert on Sync status, under its
 * headline. The plural is the frame's; the singular is authored.
 */
export function syncLateText(count: number): string {
  if (count === 1) {
    // authored (e25a, listed for Bruno)
    return 'O aparelho está com conexão, mas 1 alteração aguarda envio há mais de 1 minuto.';
  }
  return `O aparelho está com conexão, mas ${plural(count, 'alteração', 'alterações')} aguardam envio há mais de 1 minuto.`;
}
