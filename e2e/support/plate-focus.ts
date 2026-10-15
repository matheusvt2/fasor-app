import type { Page } from '@playwright/test';

/*
 * Story 14.10 lane B: where the focus is around a plate shot. `plate` is inside the plate's
 * row or its crop (`#ficha-nameplate`), `BODY` when the focus is lost, `other` anywhere else.
 */

export type PlateFocusPlace = 'plate' | 'BODY' | 'other';

/** The focus right now. */
export function plateFocusPlace(page: Page): Promise<PlateFocusPlace> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (active === null || active === document.body) return 'BODY';
    return active.closest('#ficha-nameplate .ficha-np-photo, #ficha-nameplate .plate-crop-open') !== null ? 'plate' : 'other';
  });
}

/** Starts sampling the focus every 50 ms in the page, until `stopPlateFocusSampler`. */
export async function startPlateFocusSampler(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __plateFocus?: string[]; __plateFocusTimer?: number };
    w.__plateFocus = [];
    w.__plateFocusTimer = window.setInterval(() => {
      const active = document.activeElement;
      w.__plateFocus!.push(
        active === null || active === document.body ? 'BODY' : active.closest('#ficha-nameplate .ficha-np-photo, #ficha-nameplate .plate-crop-open') !== null ? 'plate' : 'other',
      );
    }, 50);
  });
}

/** Stops the sampler and returns every place it saw, in order. */
export function stopPlateFocusSampler(page: Page): Promise<PlateFocusPlace[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __plateFocus?: PlateFocusPlace[]; __plateFocusTimer?: number };
    window.clearInterval(w.__plateFocusTimer);
    return [...(w.__plateFocus ?? [])];
  });
}

/** Samples the focus every 50 ms for `ms`. */
export async function samplePlateFocus(page: Page, ms: number): Promise<PlateFocusPlace[]> {
  await startPlateFocusSampler(page);
  const until = (await page.evaluate(() => Date.now())) + ms;
  await page.waitForFunction((end) => Date.now() >= end, until, { timeout: ms + 10_000, polling: 250 });
  return stopPlateFocusSampler(page);
}
