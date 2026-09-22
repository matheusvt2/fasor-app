import { z } from 'zod';

/**
 * Reads the current time. The kernel never reads the clock itself: every
 * time-dependent function takes `now: Date` or a Clock from the caller (TC-1).
 */
export type Clock = () => Date;

/** UTC ISO 8601 `YYYY-MM-DDTHH:mm:ss.sssZ` (AD-17): offsets and any other precision are rejected. */
export const isoTimestampSchema = z.iso.datetime({ precision: 3 });

export type IsoTimestamp = z.infer<typeof isoTimestampSchema>;

/** Canonical wire form of a Date: `YYYY-MM-DDTHH:mm:ss.sssZ`. */
export function toIso(date: Date): IsoTimestamp {
  return date.toISOString();
}
