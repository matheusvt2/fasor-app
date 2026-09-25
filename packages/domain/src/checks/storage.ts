/*
 * AD-8 storage pressure: "warn when `navigator.storage.estimate()` reports under
 * 500 MB free". The device measures, the kernel decides.
 */

/**
 * PROVISIONAL. AD-8 marks the number `[ASSUMPTION]` and the spine's Deferred list says
 * it is set after the iPadOS check, which has not run yet. Story 6.2 publishes the global
 * "Pouco espaço neste aparelho" banner on it (`storageLowBannerText`) and sizes the
 * eviction pressure from it (`storagePressureBytes`); the number itself stays provisional
 * until the manual iPadOS reading replaces it.
 */
export const STORAGE_LOW_FREE_BYTES = 500 * 1024 * 1024;

/** One `navigator.storage.estimate()` answer that carried both numbers. */
export interface StorageReading {
  usage: number;
  quota: number;
}

/**
 * True when the origin has less than `freeBytes` left. A browser with no answer
 * (`null`) is never "low": an unknown headroom is not a reason to warn.
 */
export function storageLow(
  reading: StorageReading | null,
  freeBytes: number = STORAGE_LOW_FREE_BYTES,
): boolean {
  if (reading === null) return false;
  if (!Number.isFinite(reading.usage) || !Number.isFinite(reading.quota)) return false;
  return reading.quota - reading.usage < freeBytes;
}
