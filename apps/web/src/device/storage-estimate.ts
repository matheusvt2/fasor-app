import type { StorageReading } from '@app/domain';

/*
 * UX-DR65: the one call to the Storage API. It is a measurement, not a network call
 * and not a Dexie read, so it lives in its own module and the kernel turns the number
 * into a sentence (`storageLine`) or into a verdict (`storageLow`).
 */

/** The raw estimate, or null when the browser has none. Never throws. */
async function readEstimate(): Promise<StorageEstimate | null> {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
  if (storage === undefined || typeof storage.estimate !== 'function') return null;
  try {
    return await storage.estimate();
  } catch {
    return null;
  }
}

/**
 * Bytes this origin is using, or null when the browser has no `navigator.storage`,
 * refuses the estimate, or answers without a `usage` — Safari in a private window does
 * all three. Never throws.
 */
export async function estimateStorageUsage(): Promise<number | null> {
  const estimate = await readEstimate();
  return typeof estimate?.usage === 'number' ? estimate.usage : null;
}

/**
 * AD-8 storage pressure: both numbers, for the kernel's `storageLow`. Null unless the
 * browser answered with a usage and a quota, so an unknown headroom is never mistaken
 * for a full device. Never throws.
 *
 * Nothing warns on this yet: AD-8's 500 MB threshold is provisional until the manual
 * iPadOS check returns a number (spine, Deferred). The reading and the kernel check ship
 * so that publishing the banner is one candidate away.
 */
export async function storageHeadroom(): Promise<StorageReading | null> {
  const estimate = await readEstimate();
  if (typeof estimate?.usage !== 'number' || typeof estimate.quota !== 'number') return null;
  return { usage: estimate.usage, quota: estimate.quota };
}
