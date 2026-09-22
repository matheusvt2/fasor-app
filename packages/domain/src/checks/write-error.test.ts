import { describe, expect, it } from 'vitest';
import { writeErrorKind } from './write-error.ts';

/* Test 1.8-UNIT-002: AD-8's "never a silent refusal" needs two sentences, not one. */

describe('writeErrorKind', () => {
  it('names the browser quota refusal', () => {
    expect(writeErrorKind('QuotaExceededError')).toBe('quota');
  });

  it('names the Dexie aliases', () => {
    expect(writeErrorKind('QuotaExceeded')).toBe('quota');
    expect(writeErrorKind('quotaexceedederror')).toBe('quota');
    expect(writeErrorKind(' QuotaExceededError ')).toBe('quota');
  });

  it('calls everything else unknown, including nothing at all', () => {
    for (const name of ['AbortError', 'DataError', 'VersionError', '', 'Error', null, undefined]) {
      expect(writeErrorKind(name)).toBe('unknown');
    }
  });

  it('never throws on a value that is not a string', () => {
    expect(writeErrorKind(undefined)).toBe('unknown');
    expect(writeErrorKind(null)).toBe('unknown');
  });
});
