import { describe, expect, it } from 'vitest';
import { STORAGE_LOW_FREE_BYTES, storageLow } from './storage.ts';

/* AD-8 storage pressure. The banner is not published on this yet (the threshold is
 * provisional until the manual iPadOS check returns a number); the check is the part
 * that is decided, so it ships tested. */

const MB = 1024 * 1024;

describe('storageLow', () => {
  it('uses the provisional 500 MB of AD-8', () => {
    expect(STORAGE_LOW_FREE_BYTES).toBe(500 * 1024 * 1024);
  });

  it('is true just under the threshold and false at it', () => {
    expect(storageLow({ usage: 1000 * MB, quota: 1000 * MB + STORAGE_LOW_FREE_BYTES - 1 })).toBe(true);
    expect(storageLow({ usage: 1000 * MB, quota: 1000 * MB + STORAGE_LOW_FREE_BYTES })).toBe(false);
  });

  it('is true when the origin is already over its quota', () => {
    expect(storageLow({ usage: 2000 * MB, quota: 1000 * MB })).toBe(true);
  });

  it('is false when the browser has no answer', () => {
    expect(storageLow(null)).toBe(false);
  });

  it('is false on a reading that is not two finite numbers', () => {
    expect(storageLow({ usage: Number.NaN, quota: 1000 * MB })).toBe(false);
    expect(storageLow({ usage: 0, quota: Number.POSITIVE_INFINITY })).toBe(false);
  });

  it('takes an explicit threshold', () => {
    expect(storageLow({ usage: 0, quota: 10 * MB }, 20 * MB)).toBe(true);
    expect(storageLow({ usage: 0, quota: 10 * MB }, 5 * MB)).toBe(false);
  });
});
