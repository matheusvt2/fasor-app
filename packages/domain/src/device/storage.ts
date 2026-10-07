import { plural, relatoriosCount } from '../text/plural.ts';

/*
 * UX-DR65, AD-2: the Account "Em uso" row. The device measures (one
 * `navigator.storage.estimate()` call in `apps/web/src/device`), the kernel writes
 * every word of the line.
 */

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
const STEP = 1024;

const comma = (value: number) => value.toFixed(1).replace('.', ',');

/**
 * pt-BR byte size: whole units below a megabyte, one comma decimal from there up
 * (`1_288_490_188` → `1,2 GB`), and `0 B` at zero.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  let value = bytes;
  let unit = 0;
  while (value >= STEP && unit < UNITS.length - 1) {
    value /= STEP;
    unit++;
  }
  // Rounding can push the value back up to a whole unit (1_048_575 B is 1023.999 KB,
  // which rounds to 1024): re-check the unit afterwards so no boundary ever renders
  // "1024 KB" instead of "1,0 MB".
  const render = (n: number, u: number) => (u >= 2 ? comma(n) : String(Math.round(n)));
  if (Number(render(value, unit).replace(',', '.')) >= STEP && unit < UNITS.length - 1) {
    value /= STEP;
    unit++;
  }
  return `${render(value, unit)} ${UNITS[unit]}`;
}

export interface StorageUsage {
  /** `navigator.storage.estimate().usage`, or null when the browser has no answer. */
  usage_bytes: number | null;
  relatorios: number;
  /** The photo originals kept on this device (`originalFileCount`). */
  photos: number;
  /** F-21: the photos the outbox still holds (`SyncCounts.photos_pending`); 0 when omitted. */
  photos_awaiting?: number;
}

export interface StorageLine {
  /** `.sr-value.t-value`: the size, or why there is none. */
  value: string;
  /** `.sr-value`: "· 2 relatórios · 4 fotos neste aparelho", or '' when there is no size to qualify. */
  detail: string;
  /** F-21: the second line, "2 fotos aguardando envio", or '' when none waits. */
  awaiting: string;
}

/** The two spans of `90-account.html`'s `.storage-line`. */
export function storageLine(usage: StorageUsage): StorageLine {
  // authored: the mock always has an estimate; a browser that refuses one needs a
  // sentence, and "Indisponível neste navegador" says what is true without alarming.
  // F-21 (review 2026-10-06): the photos are those kept on the device, said so, never read
  // as a total; the ones still waiting to go out get a line of their own.
  const waiting = usage.photos_awaiting ?? 0;
  // authored: F-21.
  const awaiting = waiting > 0 ? `${plural(waiting, 'foto', 'fotos')} aguardando envio` : '';
  if (usage.usage_bytes === null) return { value: 'Indisponível neste navegador', detail: '', awaiting };
  return {
    value: formatBytes(usage.usage_bytes),
    // authored: F-21, "neste aparelho" after the mock's "· 2 relatórios · 118 fotos".
    detail: `· ${relatoriosCount(usage.relatorios)} · ${plural(usage.photos, 'foto', 'fotos')} neste aparelho`,
    awaiting,
  };
}
