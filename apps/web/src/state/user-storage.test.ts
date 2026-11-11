import { afterEach, describe, expect, it } from 'vitest';
import { siteAltitudeReading } from '../surfaces/relatorio/setup/altitude-reading.ts';
import { ALTITUDE_KEY_PREFIX, clearUserStorage, KEPT_KEY_PREFIX, LEGEND_KEY } from './user-storage.ts';

/* e20f (QA N3): the browser-storage keys of the user go with a sign-out; the device-wide ones stay. */

describe('clearUserStorage (e20f)', () => {
  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('removes every relatório key and the legend key, and keeps the clock offset, the theme mirror and the pending wipes', () => {
    window.localStorage.setItem(`${ALTITUDE_KEY_PREFIX}019966c1-0000-7000-8000-0000000000a1`, '{"altitude":812}');
    window.localStorage.setItem(`${ALTITUDE_KEY_PREFIX}019966c1-0000-7000-8000-0000000000a2`, '{"altitude":null}');
    window.localStorage.setItem('releng.clock-offset', '-1800000');
    window.localStorage.setItem('releng.theme', 'dark');
    window.localStorage.setItem('releng.pending-wipe', '["releng-x"]');
    window.sessionStorage.setItem(LEGEND_KEY, '019966c1-0000-7000-8000-0000000000b1');
    clearUserStorage();
    expect(Object.keys(window.localStorage).sort()).toEqual(['releng.clock-offset', 'releng.pending-wipe', 'releng.theme']);
    expect(window.sessionStorage.getItem(LEGEND_KEY)).toBeNull();
  });

  it('fix batch e24x (A5): removes every kept-warning record of a checklist row and keeps any other session key', () => {
    window.sessionStorage.setItem(`${KEPT_KEY_PREFIX}r1:b1:isoladores`, '{"observation":"Texto","result":"C"}');
    window.sessionStorage.setItem(`${KEPT_KEY_PREFIX}r2:l1:extintores`, '{"observation":"Texto","result":"NA"}');
    window.sessionStorage.setItem('other-key', 'kept');
    clearUserStorage();
    expect(Object.keys(window.sessionStorage)).toEqual(['other-key']);
  });

  it('E20-A1 (R-4c): an altitude answer that settles after a sign-out cleared storage is not kept, and the question in flight is forgotten', async () => {
    const relatorioId = '019966c1-0000-7000-8000-0000000000a3';
    let answer: PositionCallback | null = null;
    const geolocation = { getCurrentPosition: (success: PositionCallback) => void (answer = success) } as unknown as Geolocation;
    const asked = siteAltitudeReading(relatorioId, geolocation)!;
    // Asked again while in flight: the same question.
    expect(siteAltitudeReading(relatorioId, geolocation)).toBe(asked);
    clearUserStorage();
    answer!({ coords: { altitude: 812.4 } } as GeolocationPosition);
    expect(await asked).toEqual({ altitude: 812 });
    await Promise.resolve();
    expect(window.localStorage.getItem(`${ALTITUDE_KEY_PREFIX}${relatorioId}`)).toBeNull();
    // The next question is a new one, and its answer is kept.
    const again = siteAltitudeReading(relatorioId, geolocation)!;
    expect(again).not.toBe(asked);
    answer!({ coords: { altitude: 900 } } as GeolocationPosition);
    expect(await again).toEqual({ altitude: 900 });
    await Promise.resolve();
    expect(window.localStorage.getItem(`${ALTITUDE_KEY_PREFIX}${relatorioId}`)).toBe('{"altitude":900}');
  });
});
