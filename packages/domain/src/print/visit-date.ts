import { calendarDateOfInstant, formatCalendarDate, formatDateOfInstant } from '../format/datetime.ts';
import { seedRule } from '../seed/definitions.ts';
import type { PreviousResults } from './reading-slots.ts';

/*
 * Batch e24p (Story 24.15, Matheus's decision 6 of 2026-11-10): the date of a visit. From this
 * story on the issue job keeps the visit's service date in each `last_results` entry it writes
 * (`service_date`: the relatório's `service_end`, else its `service_start`, a day or a month), for
 * every seed. An entry written before keeps none, and its visit is dated by its issue instant (the
 * calendar day in America/Sao_Paulo). One kernel answer for the order of two visits
 * (`compareVisits`, read by `lastResults`), the "Anterior" helper (every seed) and, on a seed that
 * turns `previous_visit_date` on (v14), the MANUT. ANTERIOR header and the history texts.
 */

/** What dates a visit: its service date when kept, else its issue instant. */
export type VisitDated = Pick<PreviousResults, 'issued_at'> & Partial<Pick<PreviousResults, 'service_date'>>;

/**
 * Fix batch e24x (D3): a relatório's own visit date, as the issue keeps it (`lastResults`): its
 * `service_end`, else its `service_start`; null with neither (or a blank one).
 */
export function relatorioVisitDate(setup: { service_start?: string | null; service_end?: string | null } | null | undefined): string | null {
  const date = setup?.service_end ?? setup?.service_start ?? null;
  return date === null || date === '' ? null : date;
}

/** The visit's date as an AD-11 `date` value: its `service_date` (`YYYY-MM-DD` or `YYYY-MM`), else the issue instant's calendar day. */
export function visitDateOf(entry: VisitDated): string {
  if (entry.service_date !== undefined) return entry.service_date;
  const time = Date.parse(entry.issued_at);
  return Number.isNaN(time) ? '' : calendarDateOfInstant(new Date(time));
}

/** The visit's date as printed: "14/03/2026", a month-only service date "03/2026". */
export function visitDateText(entry: VisitDated): string {
  return formatCalendarDate(visitDateOf(entry));
}

/**
 * The order of two visits by their dates: negative when `a` is the older, positive when the newer,
 * 0 when they are equal or the dates cannot decide. Dates decide only when at least one of the two
 * carries a `service_date` (Design Notes D4: data from before Story 24.15 keeps today's order, by
 * first issue); a month and a day of that month compare equal.
 */
export function compareVisits(a: VisitDated, b: VisitDated): number {
  if (a.service_date === undefined && b.service_date === undefined) return 0;
  const left = visitDateOf(a);
  const right = visitDateOf(b);
  if (left === '' || right === '') return 0;
  const length = Math.min(left.length, right.length);
  const x = left.slice(0, length);
  const y = right.slice(0, length);
  return x < y ? -1 : x > y ? 1 : 0;
}

/**
 * The previous visit's date as a history text names it ("rev. 1, 14/03/2026"): on a seed that turns
 * `previous_visit_date` on (v14), the visit's date (`visitDateText`); on v1 to v13 the issue date, as
 * before.
 */
export function previousVisitDateText(entry: VisitDated, seedVersion: string): string {
  return seedRule(seedVersion, 'previous_visit_date') ? visitDateText(entry) : formatDateOfInstant(entry.issued_at);
}

/** Story 22.12: the header of the previous visit's column, the last column of a reading table. */
export const PREVIOUS_HEADER = 'MANUT. ANTERIOR';

/**
 * The MANUT. ANTERIOR header of a sheet of seed `seedVersion`: on a seed that turns
 * `previous_visit_date` on (v14), the previous visit's date on a second line ("MANUT.
 * ANTERIOR\n14/03/2026", authored layout from Story 24.1's frame; the renderer splits a cell on its
 * line breaks), so the column's widest word stays "ANTERIOR" and the table keeps its v13 weights and
 * type size; on v1 to v13 "MANUT. ANTERIOR" alone.
 */
export function previousHeaderText(entry: VisitDated, seedVersion: string): string {
  return seedRule(seedVersion, 'previous_visit_date') ? `${PREVIOUS_HEADER}\n${visitDateText(entry)}` : PREVIOUS_HEADER;
}
