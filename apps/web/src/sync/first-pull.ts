import { now } from '../clock.ts';
import type { AppDatabase } from '../db/schema.ts';
import { newId } from '../ids.ts';
import { createBrowserSyncClient, type SyncClient } from './client.ts';
import { createSyncEngine } from './engine.ts';

/*
 * Story 26.10 (the deferred row of Story 26.5, `e2e/home.spec.ts` 1.6-E2E-003): the sign-in's first
 * company pull. The permissions provider reads the user's own row and role row from IndexedDB and fails
 * closed with no key while it holds neither, so a first sign-in followed at once by an offline cold open
 * showed the shell with an empty main. The sign-in flow therefore finishes the first company pull
 * (the company stream alone, `SyncEngine.pullCompany`) before it leaves Login, inside Login's busy state,
 * with a bounded wait. A pull that cannot finish (offline, a failure, the bound) never stops the sign-in:
 * the user enters and the provider behaves as it always did.
 */

/** How long the sign-in waits for the first company pull before it lets the user in. */
export const FIRST_PULL_WAIT_MS = 10_000;

const browserTimers = {
  setTimeout: (callback: () => void, ms: number) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle: unknown) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
};

const browserOnline = (): boolean => (typeof navigator === 'undefined' ? true : navigator.onLine);

export interface FirstCompanyPullOptions {
  online?: boolean;
  waitMs?: number;
  client?: SyncClient;
}

/** Whether the engine ran the company pull inside the bound (a failure it recorded included); false when skipped offline or cut. Never rejects. */
export async function firstCompanyPull(db: AppDatabase, options: FirstCompanyPullOptions = {}): Promise<boolean> {
  if (!(options.online ?? browserOnline())) return false;
  const engine = createSyncEngine({
    db,
    client: options.client ?? createBrowserSyncClient(),
    timers: browserTimers,
    random: Math.random,
    now,
    newId,
    isOnline: browserOnline,
    onReAuth: () => {},
    onOutdated: () => {},
    onChange: () => {},
  });
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  const cut = new Promise<'cut'>((resolve) => {
    timer = globalThis.setTimeout(() => resolve('cut'), options.waitMs ?? FIRST_PULL_WAIT_MS);
  });
  try {
    const outcome = await Promise.race([engine.pullCompany(), cut]);
    return outcome === 'ran';
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    // A pull still running at the bound ends at its next step; the app's own engine takes over.
    engine.stop();
  }
}
