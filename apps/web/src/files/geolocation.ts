/*
 * Story 6.1 (FR-44): the position a photo is stamped with. Only when the user's
 * `photo_location_enabled` is on. A fix is requested when the camera opens (so the OS
 * prompt shows at the first capture after sign-in, never earlier); each shot uses a fix no
 * older than 60 s, or waits up to 5 s for the request in flight. A denial or a timeout
 * leaves the photo without coordinates, never blocks the shot.
 */

export const FIX_MAX_AGE_MS = 60_000;
export const FIX_WAIT_MS = 5_000;

export interface PhotoCoords {
  lat: number;
  lng: number;
  accuracy_m: number | null;
  source: 'geolocation';
}

export interface GeolocationDeps {
  geolocation: Pick<Geolocation, 'getCurrentPosition'> | null;
  now: () => number;
  setTimeout: (callback: () => void, ms: number) => unknown;
  /** The browser answered PERMISSION_DENIED: the caller records it (the device-local pref). */
  onDenied?: () => void;
}

interface Fix {
  coords: PhotoCoords;
  at: number;
}

export interface PositionTracker {
  /** Starts a request unless a fresh fix or a request in flight already covers it. */
  warm(): void;
  /** The fix for a shot taken now, or null (denied, unavailable, timed out). */
  positionAtCapture(): Promise<PhotoCoords | null>;
}

const PERMISSION_DENIED = 1;

export function createPositionTracker(deps: GeolocationDeps): PositionTracker {
  let last: Fix | null = null;
  let inFlight: Promise<Fix | null> | null = null;
  let denied = false;

  const fresh = (): Fix | null => (last !== null && deps.now() - last.at <= FIX_MAX_AGE_MS ? last : null);

  function request(): Promise<Fix | null> {
    if (inFlight !== null) return inFlight;
    const geolocation = deps.geolocation;
    if (geolocation === null || denied) return Promise.resolve(null);
    inFlight = new Promise<Fix | null>((resolve) => {
      try {
        geolocation.getCurrentPosition(
          (position) => {
            last = {
              coords: {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                accuracy_m: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
                source: 'geolocation',
              },
              // The fix's own time: a cached position (`maximumAge`) is as old as it says.
              at: Number.isFinite(position.timestamp) ? position.timestamp : deps.now(),
            };
            resolve(last);
          },
          (error) => {
            if (error.code === PERMISSION_DENIED) {
              denied = true;
              deps.onDenied?.();
            }
            resolve(null);
          },
          { enableHighAccuracy: true, maximumAge: FIX_MAX_AGE_MS, timeout: FIX_WAIT_MS * 6 },
        );
      } catch {
        resolve(null);
      }
    }).finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  return {
    warm() {
      if (fresh() === null) void request();
    },
    async positionAtCapture() {
      const now = fresh();
      if (now !== null) return now.coords;
      const pending = request();
      const timeout = new Promise<null>((resolve) => {
        deps.setTimeout(() => resolve(null), FIX_WAIT_MS);
      });
      const fix = await Promise.race([pending, timeout]);
      return fix?.coords ?? null;
    },
  };
}

/** The tracker over the browser's Geolocation API. */
export function browserPositionTracker(onDenied?: () => void): PositionTracker {
  return createPositionTracker({
    geolocation: typeof navigator !== 'undefined' && 'geolocation' in navigator ? navigator.geolocation : null,
    now: () => Date.now(),
    setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
    ...(onDenied === undefined ? {} : { onDenied }),
  });
}
