/*
 * AD-2, AD-17: `packages/domain/format` is the only formatter for UI and document.
 * Timestamps are stored as UTC ISO and displayed in America/Sao_Paulo. This story
 * needs one short form ("07/09 14:32", the Sync status rows and foot); the full
 * `format` module arrives with the capture stories.
 */

export const DISPLAY_TIME_ZONE = 'America/Sao_Paulo';

const shortDateTime = new Intl.DateTimeFormat('pt-BR', {
  timeZone: DISPLAY_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** `dd/mm HH:mm` in America/Sao_Paulo, or '' for an unparseable timestamp. */
export function formatShortDateTime(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  // Intl renders "07/09, 14:32" (or "07/09 14:32" depending on the ICU build); one form for both.
  return shortDateTime.format(new Date(time)).replace(',', '');
}

const longDateTime = new Intl.DateTimeFormat('pt-BR', {
  timeZone: DISPLAY_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** `dd/mm/aaaa HH:mm` in America/Sao_Paulo (the Export dialog's revision lines), or '' for an unparseable timestamp. */
export function formatDateTime(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  return longDateTime.format(new Date(time)).replace(',', '');
}

const issueDate = new Intl.DateTimeFormat('pt-BR', {
  timeZone: DISPLAY_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** `dd/mm/aaaa` in America/Sao_Paulo: the document control's "Data de emissão", or '' for an unparseable timestamp. */
export function formatIssueDate(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  return issueDate.format(new Date(time));
}

const timeOfDay = new Intl.DateTimeFormat('pt-BR', {
  timeZone: DISPLAY_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** `HH:mm` in America/Sao_Paulo, or '' for an unparseable timestamp (Home card device line). */
export function formatTimeOfDay(iso: string | null): string {
  if (iso === null) return '';
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  return timeOfDay.format(new Date(time));
}

/*
 * Service dates (AD-11 `date` values: `YYYY-MM-DD` or `YYYY-MM`) are calendar dates,
 * not instants: they are split by hand rather than through `Date`, so no time zone
 * can move `2026-09-06` to the fifth.
 */

interface DateParts {
  year: string;
  month: string;
  day: string | null;
}

function splitDate(value: string | null | undefined): DateParts | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
  if (match === null) return null;
  return { year: match[1]!, month: match[2]!, day: match[3] ?? null };
}

function formatDate(parts: DateParts): string {
  return parts.day === null ? `${parts.month}/${parts.year}` : `${parts.day}/${parts.month}/${parts.year}`;
}

/**
 * The service period as the Home card and the document control table write it:
 * `06–08/09/2026` when both dates fall in one month, `28/07/2026 – 02/08/2026`
 * otherwise, the single date when only one is present, `''` when neither is.
 */
/** `dd/mm/aaaa` (or `mm/aaaa`) of a `date` value, or `''` when null/unparseable. */
export function formatCalendarDate(value: string | null): string {
  const parts = splitDate(value);
  return parts === null ? '' : formatDate(parts);
}

export function formatServiceDates(start: string | null, end: string | null): string {
  const from = splitDate(start);
  const to = splitDate(end);
  if (from === null && to === null) return '';
  if (from === null) return formatDate(to!);
  if (to === null) return formatDate(from);
  if (from.year === to.year && from.month === to.month && from.day === to.day) return formatDate(from);
  if (from.year === to.year && from.month === to.month && from.day !== null && to.day !== null) {
    return `${from.day}–${to.day}/${from.month}/${from.year}`;
  }
  return `${formatDate(from)} – ${formatDate(to)}`;
}
