import { calendarDateOfInstant } from '../format/datetime.ts';

/*
 * F-22 (review 2026-09-30): a plate's manufacture date is a year, a month or a day from the
 * last century or so. A year typed into the day segment ("20/02/0001") is a nonsense date
 * that would print and be copied to the next sheet, so the sheet refuses a date outside
 * 1900 .. next year (America/Sao_Paulo) with the invalid-date helper, and writes nothing.
 */

/** The earliest year a plate date may carry. */
export const PLATE_DATE_MIN_YEAR = 1900;

/**
 * True when a date value (`YYYY-MM-DD` or `YYYY-MM`) falls in 1900 .. the current year + 1
 * in America/Sao_Paulo. Anything else (no leading four-digit year) is not this check's to
 * refuse, so it passes.
 */
export function plateDateAccepted(value: string, now: Date): boolean {
  const match = /^(\d{4})-\d{2}/.exec(value);
  if (match === null) return true;
  const year = Number(match[1]);
  const current = Number(calendarDateOfInstant(now).slice(0, 4));
  return year >= PLATE_DATE_MIN_YEAR && year <= current + 1;
}
