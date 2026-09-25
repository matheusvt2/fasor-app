// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Story 12.5 DoD: the contrast table of DESIGN.md § v0.9 direction, checked on the tokens
 * the app actually loads. Each pair is read from `tokens.css` (the light block and the
 * manual dark block, which the device-preference block repeats) and its WCAG contrast
 * ratio must reach the stated value; a pair the table does not state holds the sunlight
 * floor of § Colors (ink on surfaces at 7:1 or better).
 */

const tokens = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function block(selector: RegExp): Map<string, string> {
  const match = selector.exec(tokens);
  if (match === null) throw new Error(`no block ${selector}`);
  const start = match.index + match[0].length;
  const body = tokens.slice(start, tokens.indexOf('}', start));
  const values = new Map<string, string>();
  for (const declaration of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) values.set(declaration[1]!, declaration[2]!.trim());
  return values;
}

const light = block(/:root,\s*\[data-theme="light"\]\s*\{/);
const dark = block(/\n\[data-theme="dark"\]\s*\{/);
const darkPreference = block(/:root:not\(\[data-theme="light"\]\)\s*\{/);

/** A token's hex, following `var(--x)` aliases inside the same theme block. */
function hex(theme: Map<string, string>, name: string): string {
  let value = theme.get(name) ?? light.get(name);
  for (let hops = 0; value !== undefined && value.startsWith('var(') && hops < 5; hops++) {
    const alias = /var\((--[\w-]+)\)/.exec(value)![1]!;
    value = theme.get(alias) ?? light.get(alias);
  }
  if (value === undefined || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${name} is not a hex color: ${value}`);
  return value;
}

function luminance(color: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

/**
 * [foreground token, background token, stated ratio] per theme (DESIGN.md § v0.9, "Contrast
 * checks"). The table as first written overstated six pairs (15.9, 7.9, 13.1, 9.9, 9.1, 8.7);
 * Story 12.5 struck them for the WCAG values measured on the same hex (2026-09-25), which
 * every pair here states. Each still clears the sunlight floor: ink at 7:1 or better, the
 * chosen tri-state letter at 6:1 or better in `heading` weight.
 */
const PAIRS: Record<'light' | 'dark', [string, string, number][]> = {
  light: [
    ['--ink-primary', '--surface-sunken', 15.7],
    ['--ink-secondary', '--surface-sunken', 7.8],
    ['--tri-state-selected-foreground', '--conforme', 6.6],
    ['--tri-state-selected-foreground', '--nao-conforme', 6.6],
    ['--tri-state-selected-foreground', '--nao-aplica', 6.0],
  ],
  dark: [
    ['--ink-primary', '--surface-sunken', 12.9],
    ['--ink-secondary', '--surface-sunken', 7.5],
    ['--tri-state-selected-foreground', '--conforme', 9.2],
    ['--tri-state-selected-foreground', '--nao-conforme', 7.8],
    ['--tri-state-selected-foreground', '--nao-aplica', 8.0],
  ],
};

/** The table states ratios to one decimal: a pair passes at its stated value rounded. */
const ROUNDING = 0.05;

describe('12.5 DoD: the v0.9 contrast table holds on tokens.css', () => {
  for (const [theme, values] of [['light', light], ['dark', dark], ['dark (device preference)', darkPreference]] as const) {
    const pairs = PAIRS[theme === 'light' ? 'light' : 'dark'];
    for (const [foreground, background, stated] of pairs) {
      it(`${theme}: ${foreground} on ${background} >= ${stated}:1`, () => {
        expect(ratio(hex(values, foreground), hex(values, background))).toBeGreaterThanOrEqual(stated - ROUNDING);
      });
    }
  }

  it('the field fill is the sunken surface in both themes', () => {
    expect(light.get('--field-fill')).toBe('var(--surface-sunken)');
    expect(dark.get('--field-fill')).toBe('var(--surface-sunken)');
    expect(hex(light, '--surface-sunken')).toBe('#EEF1F5');
    expect(hex(dark, '--surface-sunken')).toBe('#262B33');
  });
});
