import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { toHaveNoViolations } from 'jest-axe';
import { afterEach, expect } from 'vitest';

expect.extend(toHaveNoViolations);

// jsdom implements no `Element.prototype.scrollTo`; React Aria's selectable collections
// (Tabs, the composer's menus) call it in an animation frame after a keyboard move, which
// surfaced as an unhandled `TypeError` outside any test and failed the run without a
// failing assertion. A no-op is the honest stand-in: nothing scrolls in jsdom. The
// service-worker suites run with no DOM at all, where there is no `Element` to patch.
if (typeof Element !== 'undefined' && typeof Element.prototype.scrollTo !== 'function') {
  Element.prototype.scrollTo = () => {};
}

afterEach(() => {
  cleanup();
});
