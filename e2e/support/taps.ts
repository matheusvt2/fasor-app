import type { Locator, Page, TestInfo } from '@playwright/test';

/** How long a human finger rests on the glass in a plain tap. */
export const TAP_HOLD_MS = 80;

/**
 * Story 12.1: a tap the way a hand makes it, not Playwright's instantaneous `click()`:
 * the pointer goes down at the element's centre, stays about 80 ms, and comes up at the
 * same point, wherever the element has moved to meanwhile. A render that moves the pressed
 * control between down and up (J-01, the lost tap) therefore shows up as a lost tap here,
 * exactly as it did on the tablet.
 *
 * On a touch project (`hasTouch`) running Chromium, or with `touch` on any Chromium project,
 * the contact is a real touch through CDP `Input.dispatchTouchEvent`, so the browser runs
 * its own tap gesture (pointer events, then the compatibility mouse events and the click);
 * elsewhere it is the mouse. The box is
 * read right before the pointer goes down, after `beforeDown` (a race's delay).
 */
export async function humanTap(page: Page, target: Locator, info: TestInfo, beforeDown?: () => Promise<void>, options: { touch?: boolean } = {}): Promise<void> {
  const chromium = page.context().browser()?.browserType().name() === 'chromium';
  const hasTouch = info.project.use.hasTouch === true;
  const touch = chromium && (hasTouch || options.touch === true);
  // On screen as a person sees it before tapping: a target off screen or covered (by the
  // Sticky action bar) is scrolled to the middle; one already in view is not scrolled (a
  // scroll would close an open list, as it does on the tablet). Its centre must hit it when
  // the pointer goes down (a frame still settling is waited out); what moves it after that
  // is exactly what the tap is testing.
  const covering = await target.evaluate(
    async (element) => {
      const hitsCentre = () => {
        const rect = element.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        if (y < 0 || y >= window.innerHeight || x < 0 || x >= window.innerWidth) return null;
        const hit = document.elementFromPoint(x, y);
        return hit !== null && (hit === element || element.contains(hit)) ? true : hit;
      };
      if (hitsCentre() !== true) element.scrollIntoView({ block: 'center', inline: 'nearest' });
      let last: ReturnType<typeof hitsCentre> = null;
      for (let frame = 0; frame < 10; frame += 1) {
        last = hitsCentre();
        if (last === true) return null;
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      return last === null ? 'nothing (off screen)' : `${last.tagName.toLowerCase()}.${last.className}`;
    },
    undefined,
    { timeout: 10_000 },
  );
  if (covering !== null) throw new Error(`humanTap: the target's centre hits ${covering}`);
  // The race's delay is waited here, once the target is on screen, so the pointer goes down
  // right after it: positioning time never pushes the tap later than the delay it tests.
  if (beforeDown !== undefined) await beforeDown();
  const box = await target.boundingBox({ timeout: 10_000 });
  if (box === null) throw new Error('humanTap: the target has no box on screen');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (touch) {
    // Opened only now, after every check that can throw, and always detached.
    const cdp = await page.context().newCDPSession(page);
    try {
      // A desktop context has no touch: emulate it for this tap, so Chromium runs its tap
      // gesture (the click comes 100 ms or more after pointerup, its own task).
      if (!hasTouch) await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await page.waitForTimeout(TAP_HOLD_MS);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally {
      await cdp.detach();
    }
    return;
  }
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(TAP_HOLD_MS);
  await page.mouse.up();
}
