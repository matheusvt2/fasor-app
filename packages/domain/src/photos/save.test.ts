import { describe, expect, it } from 'vitest';
import { photoFileName, photoSaveSource } from './save.ts';

/*
 * Story 17.7 (M9, M11): which original "Salvar no aparelho" hands over, and the file's name.
 */

describe('17.7-UNIT photoSaveSource', () => {
  it("takes this device's original first, then the server's, else none", () => {
    expect(photoSaveSource({ hasLocalOriginal: true, uploaded_at: null })).toBe('local');
    expect(photoSaveSource({ hasLocalOriginal: true, uploaded_at: '2026-09-06T17:00:00.000Z' })).toBe('local');
    expect(photoSaveSource({ hasLocalOriginal: false, uploaded_at: '2026-09-06T17:00:00.000Z' })).toBe('server');
    expect(photoSaveSource({ hasLocalOriginal: false, uploaded_at: null })).toBe('none');
  });
});

describe('17.7-UNIT photoFileName', () => {
  it("names the file by the stamp's local date and time in America/Sao_Paulo", () => {
    // 17:32:05 UTC is 14:32:05 in Sao Paulo (UTC-3).
    expect(photoFileName({ captured_at: '2026-09-06T17:32:05.000Z' })).toBe('foto-2026-09-06-143205.jpg');
    // Past midnight UTC, still the evening before in Sao Paulo.
    expect(photoFileName({ captured_at: '2026-09-07T01:02:03.000Z' })).toBe('foto-2026-09-06-220203.jpg');
  });

  it('carries no character a file name refuses and falls back for an unparseable stamp', () => {
    expect(photoFileName({ captured_at: '2026-09-06T17:32:05.000Z' })).toMatch(/^foto-\d{4}-\d{2}-\d{2}-\d{6}\.jpg$/);
    expect(photoFileName({ captured_at: 'not a date' })).toBe('foto.jpg');
  });
});
