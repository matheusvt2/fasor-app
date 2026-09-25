import { configureAxe } from 'jest-axe';

/*
 * E3-A4: the one axe the web unit tests scan with. jsdom resolves no CSS custom property
 * (`gallery.test.tsx` header), so axe's `color-contrast` rule, the costliest it runs, can
 * only come back "incomplete" here: it is off, and nothing is lost. Contrast is checked
 * where it can be computed: on the tokens themselves in both themes
 * (`styles/contrast.test.ts`, the gallery's token tests) and in a real browser by the
 * Playwright specs. Every other WCAG 2.2 AA rule runs as before; a test's own options
 * (the gallery's `region`) merge over these.
 */
export const axe = configureAxe({ rules: { 'color-contrast': { enabled: false } } });
