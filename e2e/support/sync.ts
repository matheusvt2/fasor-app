import type { Page } from '@playwright/test';
import { expect, syncBadge } from './merged-fixtures.ts';
import { readStore } from './outbox.ts';

/*
 * E5-A1: the shared waits on sync state. Every spec used to carry its own "Sincronizar
 * agora" helper, and each returned on signals that could already hold before the tapped
 * cycle ran: `data-pending="0"` is true at once when nothing local is waiting (an op pushed
 * from the "office" through the api), and "the button is not aria-disabled" can be read
 * before React has rendered the cycle as running. The spec then reloaded or navigated
 * with the cycle's pull still in flight, and what it asserted next raced that pull. These
 * helpers wait on what proves the cycle is over instead.
 */

/**
 * The budget of one sync cycle. A whole relatório is 223 ops, and the server applies each
 * in its own transaction (AD-24): seconds on an idle machine, several times that under
 * load. The waits below end as soon as the state is reached; this only bounds them.
 */
export const SYNC_CYCLE_TIMEOUT = 60_000;

/** The time on the page's own clock, which also stamps `sync_state.last_sync_at`. */
async function pageNow(page: Page): Promise<number> {
  return page.evaluate(() => Date.now());
}

/**
 * Opens Sync status from the App bar badge and runs one cycle with "Sincronizar agora",
 * then waits until that cycle is over: the "Última sincronização" time on the page has
 * moved past the tap (the company pull of a cycle that started after it has landed), the
 * button is back (the relatório and project pulls that follow it are done too), and
 * nothing is left pending. Leaves the tab on Sync status.
 */
export async function syncNow(page: Page): Promise<void> {
  await syncBadge(page).click();
  const button = page.getByRole('button', { name: 'Sincronizar agora' });
  // A cycle already running (launch, `online`, the 60 s tick) keeps the button disabled.
  await expect(button).not.toHaveAttribute('aria-disabled', 'true', { timeout: SYNC_CYCLE_TIMEOUT });
  const tappedAt = await pageNow(page);
  await button.click();
  const lastSync = page.locator('.sync-foot time');
  await expect
    .poll(async () => Date.parse((await lastSync.getAttribute('datetime', { timeout: 1_000 }).catch(() => null)) ?? ''), {
      timeout: SYNC_CYCLE_TIMEOUT,
    })
    .toBeGreaterThanOrEqual(tappedAt);
  await expect(button).not.toHaveAttribute('aria-disabled', 'true', { timeout: SYNC_CYCLE_TIMEOUT });
  await expect(syncBadge(page)).toHaveAttribute('data-pending', '0');
}

/** `syncNow`, then the badge reads "ok" and the tab goes back to the page it was on. */
export async function syncNowAndReturn(page: Page): Promise<void> {
  const back = page.url();
  await syncNow(page);
  await expect(syncBadge(page)).toHaveAttribute('data-state', 'ok');
  await page.goto(back);
}

/**
 * Waits until this device holds the company stream to its head (`sync_state` "company"
 * complete): the launch pull after sign-in has landed. Anything read off Home or the
 * device before that is whatever the pull had reached so far.
 */
export async function waitForCompanyPull(page: Page, database: string): Promise<void> {
  await expect
    .poll(
      async () =>
        (await readStore<{ id: string; complete: boolean }>(page, database, 'sync_state').catch(() => [])).find((row) => row.id === 'company')
          ?.complete ?? false,
      { timeout: SYNC_CYCLE_TIMEOUT },
    )
    .toBe(true);
}
