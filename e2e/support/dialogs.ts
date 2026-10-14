import type { Locator, Page } from '@playwright/test';
import { expect } from './merged-fixtures.ts';

/**
 * E9-Q13: Escape reaches a dialog only from a focused element inside it. When a dialog
 * re-renders or a nested dialog closes, React Aria hands the focus back a moment later and
 * `BODY` holds it in between, a gap no person presses a key in. The key waits until the focus
 * is in `dialog` (the state a person sees), then the dialog must close.
 */
export async function escapeDialog(page: Page, dialog: Locator): Promise<void> {
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
}
