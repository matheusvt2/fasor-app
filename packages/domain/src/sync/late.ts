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
 * Story 25.3: how many of the waiting ops (their `client_ts`, the outbox rows still `pending` or
 * `sent`) have waited strictly more than `SYNC_LATE_AFTER_MS` at `nowMs`. A `client_ts` that
 * cannot be read counts as not late.
 */
export function lateOpCount(waitingClientTs: readonly string[], nowMs: number): number {
  let late = 0;
  for (const clientTs of waitingClientTs) {
    const at = instantOf(clientTs);
    if (at !== null && nowMs - at > SYNC_LATE_AFTER_MS) late += 1;
  }
  return late;
}

/**
 * Story 25.3: the instant (ms) at which the next waiting op turns late, the first instant where
 * `lateOpCount` grows, or null when every waiting op is already late or none waits. The caller
 * arms one timer at it so the badge flips without waiting for another render.
 */
export function syncLateAt(waitingClientTs: readonly string[], nowMs: number): number | null {
  let next: number | null = null;
  for (const clientTs of waitingClientTs) {
    const at = instantOf(clientTs);
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
