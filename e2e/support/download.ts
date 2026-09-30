import { readFile } from 'node:fs/promises';
import type { Download, Page } from '@playwright/test';

/*
 * E11-Q1: the Export dialog's file buttons fetch the revision with the session and save the
 * file itself through an `<a download>` on an object URL, in the same tab. These helpers
 * press a button, wait for that download and read its bytes from disk (a `blob:` URL cannot
 * be fetched again through `page.request`).
 */

/** Presses the button and returns the download it starts in this tab. The listener is attached before the press. */
export async function downloadFrom(page: Page, press: () => Promise<void>): Promise<Download> {
  const downloading = page.waitForEvent('download', { timeout: 30_000 });
  await press();
  return downloading;
}

/** The downloaded file's bytes. */
export async function downloadBytes(download: Download): Promise<Buffer> {
  const path = await download.path();
  return readFile(path);
}
