import { describe, expect, it } from 'vitest';
import { companyStreamDownloaded } from './streams.ts';

describe('companyStreamDownloaded (E9 sweep B9)', () => {
  it('is false before the first company pull wrote a sync row', () => {
    expect(companyStreamDownloaded(undefined)).toBe(false);
  });

  it('is false while the company stream has not reached its end once', () => {
    expect(companyStreamDownloaded({ downloaded_at: null })).toBe(false);
  });

  it('is true once the company stream was pulled to the end', () => {
    expect(companyStreamDownloaded({ downloaded_at: '2026-09-28T10:00:00.000Z' })).toBe(true);
  });
});
