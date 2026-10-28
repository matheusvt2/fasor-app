import { cameraAppDefault } from '@app/domain';
import { useLiveQuery } from '../db/live.ts';
import { readCameraApp } from '../db/prefs.ts';
import type { AppDatabase } from '../db/schema.ts';
import { useSession } from '../state/session.tsx';

/*
 * Story 17.2: "Câmera do aparelho" on this device, read live from `local_prefs`. Only
 * `useCamera` (`surfaces/ficha/camera-session.tsx`) asks it for the openers, and Conta for its
 * switch; its own module so a component test can mock it.
 */

/** The device's touch points (`navigator.maxTouchPoints`), 0 without a navigator. */
export function touchPoints(): number {
  if (typeof navigator === 'undefined') return 0;
  const points = navigator.maxTouchPoints;
  return typeof points === 'number' && Number.isFinite(points) ? points : 0;
}

/** The database where there is a session; null where a surface renders without one (a component test). */
function useDeviceDatabase(): AppDatabase | null {
  try {
    return useSession().database;
  } catch {
    return null;
  }
}

/** Whether every camera opener takes the device's camera app: the stored switch, else the device's default. */
export function useCameraApp(): boolean {
  const db = useDeviceDatabase();
  const points = touchPoints();
  const stored = useLiveQuery(() => (db === null ? Promise.resolve(cameraAppDefault(points)) : readCameraApp(db, points)), [db, points], null);
  return stored ?? cameraAppDefault(points);
}
