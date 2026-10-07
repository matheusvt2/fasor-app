import { describe, expect, it } from 'vitest';
import { formatDateTime, formatIssueDate, formatServiceDates, formatShortDateTime, formatTimeOfDay } from './datetime.ts';
import { dateFieldText, dateRangeText, formatDateOfInstant, formatDateRange, normalizeDateValue, parseCalendarDate, parsePlateDateText, savedStateText, uuidV7Instant } from './datetime.ts';

describe('formatDateTime and formatIssueDate (Story 4.8)', () => {
  it('render dd/mm/aaaa HH:mm and dd/mm/aaaa in America/Sao_Paulo', () => {
    expect(formatDateTime('2026-09-10T11:47:00.000Z')).toBe('10/09/2026 08:47');
    expect(formatDateTime('2026-09-24T01:30:00.000Z')).toBe('23/09/2026 22:30');
    expect(formatIssueDate('2026-09-24T01:30:00.000Z')).toBe('23/09/2026');
    expect(formatIssueDate('2026-09-23T12:00:00.000Z')).toBe('23/09/2026');
  });

  it('return an empty string for garbage', () => {
    expect(formatDateTime('yesterday')).toBe('');
    expect(formatIssueDate('')).toBe('');
  });
});

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

describe('K-12 formatDateRange: one range implementation behind both names', () => {
  const cases: [string | null, string | null][] = [
    ['2026-09-06', '2026-09-08'],
    ['2026-09-06', '2026-10-02'],
    ['2026-07-28', '2026-08-02'],
    ['2026-12-28', '2027-01-02'],
    ['2026-09-06', '2026-09-06'],
    ['2026-09-06', null],
    [null, '2026-09-08'],
    [null, null],
    ['2026-09', '2026-10'],
    ['2026-09', null],
    ['setembro', null],
  ];
  it('the "full" style is formatServiceDates and the "compact" style is dateRangeText, for every shape', () => {
    for (const [start, end] of cases) {
      expect(formatDateRange(start, end, 'full')).toBe(formatServiceDates(start, end));
      expect(formatDateRange(start, end, 'compact')).toBe(dateRangeText(start, end));
    }
    expect(formatDateRange('2026-07-28', '2026-08-02', 'full')).toBe('28/07/2026 – 02/08/2026');
    expect(formatDateRange('2026-07-28', '2026-08-02', 'compact')).toBe('28/07–02/08/2026');
  });
});

describe('4.1-UNIT dateRangeText', () => {
  it('writes the five forms', () => {
    expect(dateRangeText('2026-09-06', '2026-09-08')).toBe('06–08/09/2026');
    expect(dateRangeText('2026-09-06', '2026-10-02')).toBe('06/09–02/10/2026');
    expect(dateRangeText('2026-12-28', '2027-01-02')).toBe('28/12/2026–02/01/2027');
    expect(dateRangeText('2026-09-06', '2026-09-06')).toBe('06/09/2026');
    expect(dateRangeText('2026-09-06', null)).toBe('06/09/2026');
    expect(dateRangeText(null, '2026-09-08')).toBe('08/09/2026');
    expect(dateRangeText(null, null)).toBe('');
    expect(dateRangeText('2026-09', '2026-10')).toBe('09/2026–10/2026');
  });
});

describe('4.1-UNIT uuidV7Instant and formatDateOfInstant', () => {
  it('reads the minting instant out of a UUIDv7 and formats it in São Paulo', () => {
    expect(uuidV7Instant('019966b0-0057-7000-8000-000000000001')).toBe(new Date(0x019966b00057).toISOString());
    expect(uuidV7Instant('0a000000-0000-4000-8000-00000000000a')).toBeNull();
    expect(uuidV7Instant('nope')).toBeNull();
    expect(formatDateOfInstant('2026-09-23T02:30:00.000Z')).toBe('22/09/2026');
    expect(formatDateOfInstant('x')).toBe('');
  });
});

describe('E78-Q3 normalizeDateValue and dateFieldText (every stored date shape)', () => {
  it('keeps the canonical shapes, converts mm/aaaa and dd/mm/aaaa, returns anything else unchanged', () => {
    expect(normalizeDateValue('2024-08')).toBe('2024-08');
    expect(normalizeDateValue('2024-08-15')).toBe('2024-08-15');
    expect(normalizeDateValue('07/2025')).toBe('2025-07');
    expect(normalizeDateValue('15/03/2019')).toBe('2019-03-15');
    expect(normalizeDateValue('2012')).toBe('2012');
    expect(normalizeDateValue('31/02/2024')).toBe('31/02/2024');
    expect(normalizeDateValue('ago/2024')).toBe('ago/2024');
    expect(normalizeDateValue(null)).toBeNull();
    expect(normalizeDateValue({ raw: '1' })).toEqual({ raw: '1' });
    expect(parseCalendarDate(' 7/2025 ')).toBe('2025-07');
    expect(parseCalendarDate('2012')).toBeNull();
  });

  it('shows every shape, never blank for a stored value', () => {
    expect(dateFieldText('2024-08')).toBe('08/2024');
    expect(dateFieldText('2024-08-15')).toBe('15/08/2024');
    expect(dateFieldText('07/2025')).toBe('07/2025');
    expect(dateFieldText('2012')).toBe('2012');
    expect(dateFieldText('15/03/2019')).toBe('15/03/2019');
    expect(dateFieldText(null)).toBe('');
  });
});

describe('13.4 INP-3 parsePlateDateText (the sheet date typed as plates write it)', () => {
  it('reads a full day, a month-year and a bare year, with or without the slashes', () => {
    expect(parsePlateDateText('15/03/2019')).toBe('2019-03-15');
    expect(parsePlateDateText('15032019')).toBe('2019-03-15');
    expect(parsePlateDateText('01012020')).toBe('2020-01-01');
    expect(parsePlateDateText('08/2024')).toBe('2024-08');
    expect(parsePlateDateText('8/2024')).toBe('2024-08');
    expect(parsePlateDateText('082024')).toBe('2024-08');
    expect(parsePlateDateText('2024')).toBe('2024');
    expect(parsePlateDateText(' 2012 ')).toBe('2012');
    expect(parsePlateDateText('2024-08')).toBe('2024-08');
    expect(parsePlateDateText('2019-03-15')).toBe('2019-03-15');
  });

  it('refuses what is no calendar day, month or year; the range is left to plateDateAccepted', () => {
    expect(parsePlateDateText('13/2024')).toBeNull();
    expect(parsePlateDateText('132024')).toBeNull();
    expect(parsePlateDateText('31022019')).toBeNull();
    expect(parsePlateDateText('abc')).toBeNull();
    expect(parsePlateDateText('')).toBeNull();
    expect(parsePlateDateText('12345')).toBeNull();
    expect(parsePlateDateText('202')).toBeNull();
    // A year out of range still parses, four digits kept: plateDateAccepted refuses it.
    expect(parsePlateDateText('1899')).toBe('1899');
    expect(parsePlateDateText('20/02/0001')).toBe('0001-02-20');
    expect(parsePlateDateText('20020001')).toBe('0001-02-20');
  });
});

describe('13.4 INP-4 savedStateText', () => {
  it('says when the last op landed, in America/Sao_Paulo, online and offline', () => {
    expect(savedStateText('2026-10-07T17:32:10.000Z', true)).toBe('Salvo às 14:32');
    expect(savedStateText('2026-10-07T17:32:10.000Z', false)).toBe('Salvo neste aparelho às 14:32');
  });

  it('crosses midnight in Sao Paulo, not in UTC', () => {
    expect(savedStateText('2026-10-08T02:59:00.000Z', true)).toBe('Salvo às 23:59');
    expect(savedStateText('2026-10-08T03:00:00.000Z', true)).toBe('Salvo às 00:00');
  });

  it('is empty for no or an unparseable instant', () => {
    expect(savedStateText(null, true)).toBe('');
    expect(savedStateText('soon', false)).toBe('');
  });
});
