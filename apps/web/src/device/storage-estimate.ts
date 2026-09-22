/*
 * UX-DR65: the one call to the Storage API. It is a measurement, not a network call
 * and not a Dexie read, so it lives in its own module and the kernel turns the number
 * into a sentence (`storageLine`).
 */

/**
 * Bytes this origin is using, or null when the browser has no `navigator.storage`,
 * refuses the estimate, or answers without a `usage` — Safari in a private window does
 * all three. Never throws.
 */
export async function estimateStorageUsage(): Promise<number | null> {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
  if (storage === undefined || typeof storage.estimate !== 'function') return null;
  try {
    const estimate = await storage.estimate();
    return typeof estimate.usage === 'number' ? estimate.usage : null;
  } catch {
    return null;
  }
}
