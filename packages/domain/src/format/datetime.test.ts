import { describe, expect, it } from 'vitest';
import { formatShortDateTime } from './datetime.ts';

describe('formatShortDateTime', () => {
  it('renders dd/mm HH:mm in America/Sao_Paulo', () => {
    // 17:32 UTC is 14:32 in Sao Paulo (UTC-3, no DST since 2019).
    expect(formatShortDateTime('2026-09-07T17:32:00.000Z')).toBe('07/09 14:32');
    // Crossing midnight moves the day; midnight itself is 00, never 24.
    expect(formatShortDateTime('2026-09-08T01:10:00.000Z')).toBe('07/09 22:10');
    expect(formatShortDateTime('2026-09-08T03:05:00.000Z')).toBe('08/09 00:05');
  });

  it('returns an empty string for garbage', () => {
    expect(formatShortDateTime('yesterday')).toBe('');
  });
});
