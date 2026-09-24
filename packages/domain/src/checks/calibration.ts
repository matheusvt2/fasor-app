/*
 * AR-18: an instrument's calibration validity never blocks anything; it only drives a
 * picker's warning and the registry row's amber "Vencida em dd/mm/aaaa". Both functions
 * are pure, with `now`/`service_period_end` injected by the caller (pattern of
 * `checks/unsynced.ts`, `status/table.ts`): the kernel never reads a clock itself.
 */

/** Days after the service period end that still count as "about to expire". */
export const CALIBRATION_EXPIRING_WINDOW_DAYS = 30;

export type CalibrationStatus = 'expired' | 'expiring' | 'valid';

export interface CalibrationInput {
  calibrated_at: string | null;
  calibration_interval_months: number | null;
}

interface DateParts {
  year: number;
  month: number;
  day: number;
}

/** `YYYY-MM-DD` or `YYYY-MM` (day defaults to the first), or null when unparseable. */
function parseCalendarDate(value: string | null): DateParts | null {
  if (value === null) return null;
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
  if (match === null) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: match[3] ? Number(match[3]) : 1 };
}

function formatCalendarParts(parts: DateParts): string {
  const y = String(parts.year).padStart(4, '0');
  const m = String(parts.month).padStart(2, '0');
  const d = String(parts.day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** `YYYY-MM-DD` of a `Date`, in UTC (calendar comparisons never move a day by time zone). */
function isoDateOnly(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * `calibratedAt + intervalMonths` calendar months, via `Date.UTC` so no time zone can
 * move the day (AD-17's rule for the `date` value shape). Null when either input is
 * missing: the instrument has nothing to flag yet, per the I/O matrix.
 */
export function calibrationValidUntil(calibratedAt: string | null, intervalMonths: number | null): string | null {
  if (calibratedAt === null || intervalMonths === null) return null;
  const parts = parseCalendarDate(calibratedAt);
  if (parts === null) return null;
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1 + intervalMonths, parts.day));
  return formatCalendarParts({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
}

function daysBetween(a: string, b: string): number {
  const pa = parseCalendarDate(a)!;
  const pb = parseCalendarDate(b)!;
  const msa = Date.UTC(pa.year, pa.month - 1, pa.day);
  const msb = Date.UTC(pb.year, pb.month - 1, pb.day);
  return Math.round((msb - msa) / (24 * 60 * 60 * 1000));
}

/**
 * `'expired'` when the calibration's validity is before the reference date, `'expiring'`
 * when it falls within `CALIBRATION_EXPIRING_WINDOW_DAYS` after it, otherwise `'valid'`.
 * `servicePeriodEnd` is the relatório's service period end date; `null` (the registry
 * list itself, with no relatório context) compares against `now` instead. An instrument
 * with no calibration data yet (`calibrated_at` or `calibration_interval_months` null)
 * is always `'valid'` — nothing to flag.
 */
export function calibrationCheck(
  instrument: CalibrationInput,
  servicePeriodEnd: string | null,
  now: Date,
): CalibrationStatus {
  return calibrationStatusOf(calibrationValidUntil(instrument.calibrated_at, instrument.calibration_interval_months), servicePeriodEnd, now);
}

/**
 * `calibrationCheck`'s rule on a validity date already known (Story 5.7: the instrument
 * header copied onto a sheet carries `valid_until` by value): `'valid'` with no date.
 */
export function calibrationStatusOf(validUntil: string | null, servicePeriodEnd: string | null, now: Date): CalibrationStatus {
  if (validUntil === null || parseCalendarDate(validUntil) === null) return 'valid';
  const reference = servicePeriodEnd ?? isoDateOnly(now);
  const delta = daysBetween(reference, validUntil);
  if (delta < 0) return 'expired';
  if (delta <= CALIBRATION_EXPIRING_WINDOW_DAYS) return 'expiring';
  return 'valid';
}
