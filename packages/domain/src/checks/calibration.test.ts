import { describe, expect, it } from 'vitest';
import { calibrationCheck, calibrationStatusOf, calibrationValidUntil } from './calibration.ts';

describe('calibrationValidUntil', () => {
  it('adds the interval as calendar months', () => {
    expect(calibrationValidUntil('2026-01-15', 12)).toBe('2027-01-15');
  });

  it('is null when calibrated_at is missing', () => {
    expect(calibrationValidUntil(null, 12)).toBeNull();
  });

  it('is null when the interval is missing', () => {
    expect(calibrationValidUntil('2026-01-15', null)).toBeNull();
  });

  it('rolls an overflowing day into the next month, never a time-zone drift', () => {
    expect(calibrationValidUntil('2026-01-31', 1)).toBe('2026-03-03');
  });
});

describe('calibrationCheck', () => {
  const now = new Date('2026-09-22T12:00:00.000Z');

  it('valid: validUntil far past the service period end', () => {
    const status = calibrationCheck({ calibrated_at: '2026-01-15', calibration_interval_months: 12 }, '2026-06-01', now);
    expect(status).toBe('valid');
  });

  it('expiring: validUntil 0-30 days after the service period end', () => {
    const status = calibrationCheck({ calibrated_at: '2025-09-10', calibration_interval_months: 12 }, '2026-09-01', now);
    expect(status).toBe('expiring');
  });

  it('expired: validUntil before the service period end', () => {
    const status = calibrationCheck({ calibrated_at: '2025-01-01', calibration_interval_months: 12 }, '2026-06-01', now);
    expect(status).toBe('expired');
  });

  it('no period context compares against now', () => {
    const status = calibrationCheck({ calibrated_at: '2026-01-01', calibration_interval_months: 1 }, null, now);
    expect(status).toBe('expired');
  });

  it('5.7-UNIT calibrationStatusOf is the same rule on a validity date already known', () => {
    expect(calibrationStatusOf('2026-01-01', '2026-06-01', now)).toBe('expired');
    expect(calibrationStatusOf('2026-06-20', '2026-06-01', now)).toBe('expiring');
    expect(calibrationStatusOf('2027-06-20', '2026-06-01', now)).toBe('valid');
    expect(calibrationStatusOf(null, '2026-06-01', now)).toBe('valid');
    expect(calibrationStatusOf('garbage', '2026-06-01', now)).toBe('valid');
  });

  it('missing calibration data is always valid, never blocks', () => {
    expect(calibrationCheck({ calibrated_at: null, calibration_interval_months: 12 }, '2026-06-01', now)).toBe('valid');
    expect(calibrationCheck({ calibrated_at: '2026-01-01', calibration_interval_months: null }, '2026-06-01', now)).toBe(
      'valid',
    );
  });

  describe('window boundary (validUntil fixed at 2026-07-01, one calibration_interval_months apart)', () => {
    // calibrated_at + 1 month = validUntil = 2026-07-01 for every case below; only the
    // service period end (the reference date) moves, sweeping delta = validUntil - reference
    // across the -1 / 0 / 30 / 31 day boundary the window rule (delta <= 30 => 'expiring') hinges on.
    const instrument = { calibrated_at: '2026-06-01', calibration_interval_months: 1 };

    it('delta = -1 (one day past validity) is expired', () => {
      expect(calibrationCheck(instrument, '2026-07-02', now)).toBe('expired');
    });

    it('delta = 0 (service period ends exactly on validUntil) is expiring', () => {
      expect(calibrationCheck(instrument, '2026-07-01', now)).toBe('expiring');
    });

    it('delta = 30 (last day still inside the window) is expiring', () => {
      expect(calibrationCheck(instrument, '2026-06-01', now)).toBe('expiring');
    });

    it('delta = 31 (one day past the window) is valid', () => {
      expect(calibrationCheck(instrument, '2026-05-31', now)).toBe('valid');
    });
  });
});
