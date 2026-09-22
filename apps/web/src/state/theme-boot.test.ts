import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { THEME_PREFERENCES, themeAttribute, type ThemePreference } from '@app/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { THEME_MIRROR_KEY } from '../db/prefs.ts';

/*
 * Story 1.6 left the theme flash open: `ThemeProvider` mounts inside `RequireSession`, so
 * `data-theme` landed 121-145 ms after the first paint. The fix is a blocking inline
 * script in `index.html`, which no bundler, no linter and no test would otherwise touch —
 * a typo in the key or a dropped branch would bring the flash back in silence.
 *
 * So the real script is read out of the real file and run here, and its answer is
 * compared with the kernel's `themeAttribute`, which is the one definition of the mapping.
 */

const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');

/** The inline `<script>` of `<head>`; the module script in `<body>` carries a `src`. */
function bootScript(): string {
  const match = /<script>([\s\S]*?)<\/script>/.exec(html);
  if (match === null) throw new Error('index.html has no inline boot script');
  return match[1]!;
}

/** Runs the script exactly as the browser would, against jsdom's document and storage. */
function runBoot(): void {
  new Function(bootScript())();
}

const attribute = () => document.documentElement.getAttribute('data-theme');

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('the pre-paint theme script in index.html', () => {
  it('reads the same key the store mirrors to', () => {
    expect(html).toContain(THEME_MIRROR_KEY);
  });

  it('is a blocking script in the head, before the module script', () => {
    expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('<script type="module"'));
    expect(bootScript()).not.toContain('async');
  });

  it('reproduces themeAttribute exactly, for every preference', () => {
    for (const preference of THEME_PREFERENCES as readonly ThemePreference[]) {
      // Start from the other theme, so "leaves it alone" and "sets it" cannot be confused.
      document.documentElement.setAttribute('data-theme', 'not-a-theme');
      localStorage.setItem(THEME_MIRROR_KEY, preference);
      runBoot();
      expect(attribute(), `preference ${preference}`).toBe(themeAttribute(preference));
    }
  });

  it('leaves the element untouched when nothing is mirrored', () => {
    runBoot();
    expect(attribute()).toBeNull();
  });

  it('leaves the element untouched for a value that is not a preference', () => {
    for (const bad of ['sepia', '', 'Dark', '{"theme":"dark"}']) {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem(THEME_MIRROR_KEY, bad);
      runBoot();
      expect(attribute(), `stored ${JSON.stringify(bad)}`).toBe('dark');
    }
  });

  it('never throws when the origin refuses site data', () => {
    const real = Object.getOwnPropertyDescriptor(Storage.prototype, 'getItem');
    Storage.prototype.getItem = () => {
      throw new Error('SecurityError');
    };
    try {
      expect(() => runBoot()).not.toThrow();
      expect(attribute()).toBeNull();
    } finally {
      if (real !== undefined) Object.defineProperty(Storage.prototype, 'getItem', real);
    }
  });
});
