import { z } from 'zod';

/*
 * Story 17.2: "Câmera do aparelho" is device-local state in `local_prefs` (AR-27). On, every
 * camera opener takes the device's own camera app through the `capture` input (one photo per
 * tap); off, the in-app viewfinder opens. The kernel owns the stored shape and the one default
 * rule: on where the device has touch points (a phone or a tablet), off on a desktop.
 */

/** The stored value of the switch: on (the camera app) or off (the in-app viewfinder). */
export const cameraAppSchema = z.boolean();
export type CameraApp = z.infer<typeof cameraAppSchema>;

/** A fresh device takes its camera app when it has touch points (`navigator.maxTouchPoints > 0`). */
export function cameraAppDefault(touchPoints: number): CameraApp {
  return touchPoints > 0;
}

/** The stored switch, or the device's default when nothing (or nothing valid) is stored. */
export function cameraAppOf(stored: unknown, touchPoints: number): CameraApp {
  const parsed = cameraAppSchema.safeParse(stored);
  return parsed.success ? parsed.data : cameraAppDefault(touchPoints);
}
