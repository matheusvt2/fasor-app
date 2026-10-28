import { DISPLAY_TIME_ZONE } from '../format/datetime.ts';

/*
 * Story 17.7: "Salvar no aparelho" on the photo viewer. A photo leaves the browser's store
 * only on request: the viewer hands this device's original, else the server's, to the share
 * sheet or a download. The kernel owns which original is used and the file's name.
 */

/** Where the JPEG to save comes from: this device's original, the server's, or none yet. */
export type PhotoSaveSource = 'local' | 'server' | 'none';

/**
 * This device's original when it holds one; else the server's once the photo was uploaded;
 * else none (a colleague's photo whose device has not sent the original yet).
 */
export function photoSaveSource(input: { hasLocalOriginal: boolean; uploaded_at: string | null }): PhotoSaveSource {
  if (input.hasLocalOriginal) return 'local';
  if (input.uploaded_at !== null) return 'server';
  return 'none';
}

// The stamp's local date and time (America/Sao_Paulo, the zone `photoStampShort` displays in), with seconds.
const fileStamp = new Intl.DateTimeFormat('pt-BR', {
  timeZone: DISPLAY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/**
 * The saved file's name: `foto-YYYY-MM-DD-HHMMSS.jpg` from the stamp's local date and time.
 * A file name carries no `/`, `:` or the coordinates' `,`, so the coordinates stay out.
 * `foto.jpg` for an unparseable stamp.
 */
export function photoFileName(photo: { captured_at: string }): string {
  const time = Date.parse(photo.captured_at);
  if (Number.isNaN(time)) return 'foto.jpg';
  const parts = fileStamp.formatToParts(new Date(time));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `foto-${part('year')}-${part('month')}-${part('day')}-${part('hour')}${part('minute')}${part('second')}.jpg`;
}
