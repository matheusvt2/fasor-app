import { now } from '../clock.ts';
import { COMPANY_STREAM, type AppDatabase } from '../db/schema.ts';
import { readSyncState } from '../db/sync-store.ts';
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

/**
 * Whether the engine ran the company pull inside the bound (a failure it recorded included); false when
 * skipped offline, cut, or skipped because the company stream was downloaded before. Never rejects.
 *
 * 2026-11-22 (e26r, review of Epic 26): only a company stream this device never downloaded is pulled
 * here. Once downloaded, a pull lists the "merged by rule" pairs of the ops it brings
 * (`queuePulledPairs`) and moves the cursor past them; this throwaway engine would consume both, so
 * the app's own engine would never show them. A re-auth sign-in on a device that already holds the
 * company's rows has nothing to wait for: the app's engine pulls as it always does.
 */
export async function firstCompanyPull(db: AppDatabase, options: FirstCompanyPullOptions = {}): Promise<boolean> {
  if (!(options.online ?? browserOnline())) return false;
  try {
    const company = await readSyncState(db, COMPANY_STREAM);
    if (company !== undefined && company.downloaded_at !== null) return false;
  } catch {
    return false;
  }
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
