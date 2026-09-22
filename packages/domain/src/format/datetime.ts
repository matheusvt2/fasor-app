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
