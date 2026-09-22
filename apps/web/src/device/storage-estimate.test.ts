import { afterEach, describe, expect, it, vi } from 'vitest';
import { estimateStorageUsage, storageHeadroom } from './storage-estimate.ts';

/* AD-8: a browser without `navigator.storage.estimate` must never throw and must never
 * be mistaken for a device that is out of space. */

function withStorage(estimate: (() => Promise<StorageEstimate>) | undefined): void {
  vi.stubGlobal('navigator', estimate === undefined ? {} : { storage: { estimate } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('estimateStorageUsage', () => {
  it('reads the usage', async () => {
    withStorage(async () => ({ usage: 1024, quota: 4096 }));
    expect(await estimateStorageUsage()).toBe(1024);
  });

  it('is null without the API, without a usage, or when the call throws', async () => {
    withStorage(undefined);
    expect(await estimateStorageUsage()).toBeNull();
    withStorage(async () => ({ quota: 4096 }));
    expect(await estimateStorageUsage()).toBeNull();
    withStorage(async () => {
      throw new Error('SecurityError');
    });
    expect(await estimateStorageUsage()).toBeNull();
  });
});

describe('storageHeadroom', () => {
  it('reads both numbers for the kernel check', async () => {
    withStorage(async () => ({ usage: 1024, quota: 4096 }));
    expect(await storageHeadroom()).toEqual({ usage: 1024, quota: 4096 });
  });

  it('is null when either number is missing, the API is absent, or the call throws', async () => {
    withStorage(async () => ({ usage: 1024 }));
    expect(await storageHeadroom()).toBeNull();
    withStorage(async () => ({ quota: 4096 }));
    expect(await storageHeadroom()).toBeNull();
    withStorage(undefined);
    expect(await storageHeadroom()).toBeNull();
    withStorage(async () => {
      throw new Error('SecurityError');
    });
    expect(await storageHeadroom()).toBeNull();
  });
});
