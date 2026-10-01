import { describe, expect, it } from 'vitest';
import { plateDateAccepted } from './plate-date.ts';

describe('F-22 plateDateAccepted', () => {
  const now = new Date('2026-09-30T12:00:00.000Z');

  it('refuses a year typed into the day segment and any year before 1900', () => {
    expect(plateDateAccepted('0001-02-20', now)).toBe(false);
    expect(plateDateAccepted('1899-12-31', now)).toBe(false);
  });

  it('accepts 1900 up to next year, day or month dates', () => {
    expect(plateDateAccepted('1900-01-01', now)).toBe(true);
    expect(plateDateAccepted('2024-08', now)).toBe(true);
    expect(plateDateAccepted('2027-12-31', now)).toBe(true);
    expect(plateDateAccepted('2028-01-01', now)).toBe(false);
  });

  it('reads the current year in America/Sao_Paulo', () => {
    // 22:00 of 31/12/2026 in São Paulo is already 2027 in UTC: next year is still 2027.
    expect(plateDateAccepted('2028-01-01', new Date('2027-01-01T01:00:00.000Z'))).toBe(false);
  });

  it('leaves a value with no leading year to other checks', () => {
    expect(plateDateAccepted('2012', now)).toBe(true);
  });
});
