import { describe, expect, it } from 'vitest';
import { formatServiceDates, formatShortDateTime, formatTimeOfDay } from './datetime.ts';

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

describe('formatTimeOfDay', () => {
  it('renders HH:mm in America/Sao_Paulo', () => {
    expect(formatTimeOfDay('2026-09-08T00:40:00.000Z')).toBe('21:40');
    expect(formatTimeOfDay('2026-09-08T03:05:00.000Z')).toBe('00:05');
  });

  it('returns an empty string for null and for garbage', () => {
    expect(formatTimeOfDay(null)).toBe('');
    expect(formatTimeOfDay('soon')).toBe('');
  });
});

describe('formatServiceDates', () => {
  it('compacts a period inside one month', () => {
    expect(formatServiceDates('2026-09-06', '2026-09-08')).toBe('06–08/09/2026');
  });

  it('writes both dates in full across months or years', () => {
    expect(formatServiceDates('2026-07-28', '2026-08-02')).toBe('28/07/2026 – 02/08/2026');
    expect(formatServiceDates('2025-12-30', '2026-01-02')).toBe('30/12/2025 – 02/01/2026');
  });

  it('writes one date when only one is present or both are the same day', () => {
    expect(formatServiceDates('2026-09-06', null)).toBe('06/09/2026');
    expect(formatServiceDates(null, '2026-09-08')).toBe('08/09/2026');
    expect(formatServiceDates('2026-09-06', '2026-09-06')).toBe('06/09/2026');
  });

  it('handles a month-only date and refuses garbage', () => {
    expect(formatServiceDates('2026-09', null)).toBe('09/2026');
    expect(formatServiceDates(null, null)).toBe('');
    expect(formatServiceDates('setembro', null)).toBe('');
  });
});
