import { configureAxe, toHaveNoViolations } from 'jest-axe';
import { expect } from 'vitest';

/*
 * E3-A4: the one axe the web unit tests scan with. jsdom resolves no CSS custom property
 * (`gallery.test.tsx` header), so axe's `color-contrast` rule, the costliest it runs, can
 * only come back "incomplete" here: it is off, and nothing is lost. Contrast is checked
 * where it can be computed: on the resolved token values in both themes, by the v0.9
 * contrast table in `styles/contrast.test.ts` and the gallery's token tests. Every other WCAG 2.2 AA rule runs as before; a test's own options
 * (the gallery's `region`) merge over these. The `toHaveNoViolations` matcher is registered
 * here, not in `test-setup.ts`, so only a file that scans loads axe-core.
 */

expect.extend(toHaveNoViolations);
export const axe = configureAxe({ rules: { 'color-contrast': { enabled: false } } });
