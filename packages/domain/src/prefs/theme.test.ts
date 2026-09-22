import { describe, expect, it } from 'vitest';
import { themeAttribute, themePreferenceSchema, THEME_PREFERENCES } from './theme.ts';

describe('theme preference', () => {
  it('has the three choices of Account › Tema', () => {
    expect(THEME_PREFERENCES).toEqual(['system', 'light', 'dark']);
  });

  it('parses the stored value and refuses anything else', () => {
    expect(themePreferenceSchema.parse('dark')).toBe('dark');
    expect(themePreferenceSchema.safeParse('sepia').success).toBe(false);
    expect(themePreferenceSchema.safeParse(null).success).toBe(false);
  });

  it('"Sistema" removes the attribute so prefers-color-scheme decides again', () => {
    expect(themeAttribute('system')).toBeNull();
    expect(themeAttribute('light')).toBe('light');
    expect(themeAttribute('dark')).toBe('dark');
  });
});
