import { describe, expect, it } from 'vitest';
import { normalizeRegistryName } from './normalize-name.ts';

describe('normalizeRegistryName', () => {
  it('collapses a case difference', () => {
    expect(normalizeRegistryName('Schneider')).toBe(normalizeRegistryName('SCHNEIDER'));
  });

  it('collapses a diacritic difference', () => {
    expect(normalizeRegistryName('Blütrafos')).toBe(normalizeRegistryName('Blutrafos'));
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeRegistryName('  WEG  ')).toBe(normalizeRegistryName('WEG'));
  });

  it('collapses an internal whitespace run', () => {
    expect(normalizeRegistryName('Schneider  Eletric')).toBe(normalizeRegistryName('Schneider Eletric'));
  });

  it('keeps two genuinely different names apart', () => {
    expect(normalizeRegistryName('Siemens')).not.toBe(normalizeRegistryName('Schneider'));
  });
});
