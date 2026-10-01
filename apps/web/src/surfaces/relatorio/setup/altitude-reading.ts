/*
 * F-11 / W-14 (review 2026-09-30; Story 4.2 AC 2 "asks once for the site altitude"): the
 * device is asked for its position at most once per relatório. The first answer, granted or
 * denied, is kept on this device (`localStorage`, a per-viewer convenience; every access is
 * wrapped, a blocked storage only means asking again), and a mount that finds it reuses the
 * reading instead of asking. While the one question is in flight, every mount (React
 * StrictMode mounts twice; a return to the page mounts again) waits for the same answer.
 */

/** The answer the device gave: the altitude it read in metres, or null (denied, unavailable, no altitude). */
export interface AltitudeAnswer {
  altitude: number | null;
}

const KEY_PREFIX = 'relatorio-altitude-asked:';

const inFlight = new Map<string, Promise<AltitudeAnswer>>();

/** The answer kept for this relatório, or undefined when the device was never asked (or storage is unavailable). */
export function keptAltitudeAnswer(relatorioId: string): AltitudeAnswer | undefined {
  try {
    const raw = globalThis.localStorage?.getItem(`${KEY_PREFIX}${relatorioId}`) ?? null;
    if (raw === null) return undefined;
    const parsed = JSON.parse(raw) as { altitude?: unknown };
    return { altitude: typeof parsed.altitude === 'number' && Number.isFinite(parsed.altitude) ? parsed.altitude : null };
  } catch {
    return undefined;
  }
}

function keepAltitudeAnswer(relatorioId: string, answer: AltitudeAnswer): void {
  try {
    globalThis.localStorage?.setItem(`${KEY_PREFIX}${relatorioId}`, JSON.stringify(answer));
  } catch {
    // Storage blocked: the next visit asks again, nothing else is lost.
  }
}

/**
 * The site altitude reading of a relatório: the kept answer, the question already in flight,
 * or a new question to `geolocation` (the only call to `getCurrentPosition`). Null when the
 * device has no geolocation and nothing was kept.
 */
export function siteAltitudeReading(relatorioId: string, geolocation: Geolocation | undefined): Promise<AltitudeAnswer> | null {
  const kept = keptAltitudeAnswer(relatorioId);
  if (kept !== undefined) return Promise.resolve(kept);
  const pending = inFlight.get(relatorioId);
  if (pending !== undefined) return pending;
  if (geolocation === undefined) return null;
  const asked = new Promise<AltitudeAnswer>((resolve) => {
    geolocation.getCurrentPosition(
      (position) => resolve({ altitude: position.coords.altitude === null ? null : Math.round(position.coords.altitude) }),
      () => resolve({ altitude: null }),
    );
  });
  inFlight.set(relatorioId, asked);
  void asked.then((answer) => {
    keepAltitudeAnswer(relatorioId, answer);
    inFlight.delete(relatorioId);
  });
  return asked;
}
