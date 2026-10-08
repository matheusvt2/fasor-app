import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

/*
 * E13-A2: `waitFor` and `findBy*` give up after 5 s instead of Testing Library's 1 s. The
 * wait they bound is a legitimately slow path here: a provider boot or a live query opens a
 * Dexie database on fake-indexeddb in jsdom, a few hundred milliseconds idle and well over a
 * second on a gate host running other stacks (session.test.tsx saw "booting" at 1 s). A
 * wait still ends at the first check that passes, so no assertion changes meaning; a
 * condition that never holds fails after 5 s, and the 15 s test timeout still bounds a hang.
 */
configure({ asyncUtilTimeout: 5_000 });

afterEach(() => {
  cleanup();
});
