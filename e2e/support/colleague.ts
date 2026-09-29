import type { Browser, BrowserContext, Page } from '@playwright/test';
import { signIn, timed, type SeedAccount, type WorkerSeed } from './merged-fixtures.ts';

/**
 * Story 10.1 (epic-10 Conflict 13): the second device of a two-device spec. A new browser
 * context (its own IndexedDB, its own device id) signed in as the colleague of this worker's
 * Empresa A (`SeedAccount.colleague`, Eduardo Esteves), so a merge names another author of
 * the same company. The caller closes `context`.
 */
export function colleagueContext(browser: Browser, seed: WorkerSeed): Promise<{ context: BrowserContext; page: Page; account: SeedAccount }> {
  return timed('colleagueContext', async () => {
    const account = seed.companies[0].colleague;
    if (account === undefined) throw new Error('the worker seed has no colleague in Empresa A');
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await signIn(page, account.email);
      return { context, page, account };
    } catch (error) {
      await context.close();
      throw error;
    }
  });
}
