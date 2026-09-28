import { configure } from '@testing-library/react';
import { vi } from 'vitest';
import { STORE_READ_TIMEOUT_MS } from '../db/until-stored.ts';

/*
 * E7-A2: waits that hold whatever the machine's load. A jsdom test over a real device
 * database runs three times slower beside a gate, so a wait sized for an idle CPU (the
 * 1 s `waitFor` default, a 15 s test budget for a test that takes 9 s alone) times out
 * there although nothing is wrong. Store state is awaited by its own change events
 * (`untilStored`, a Dexie live query), never by polling; a DOM wait whose content lands
 * from an async store read gets an explicit, generous ceiling; a real hang still fails.
 */

export { STORE_READ_TIMEOUT_MS, untilStored } from '../db/until-stored.ts';

/** The test budget of a file whose tests each chain several store round trips. */
export const LOADED_TEST_TIMEOUT_MS = 90_000;

/** For the calling test file: the DOM waits' ceiling and the test budget above. */
export function loadIndependentWaits(): void {
  configure({ asyncUtilTimeout: STORE_READ_TIMEOUT_MS });
  vi.setConfig({ testTimeout: LOADED_TEST_TIMEOUT_MS });
}
