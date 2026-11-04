import type { Page } from '@playwright/test';

/*
 * Story 20.13 (security pass S8): every mutating `/api` request must name a trusted `Origin`
 * (or come with `Sec-Fetch-Site: same-origin`), which a browser adds on its own and
 * Playwright's `page.request` does not. A test that writes without the browser sends the
 * header it would have sent: the origin of the page under test.
 */

/** The e2e base URL (`playwright.config.ts` `use.baseURL`), for a page that has not navigated yet. */
const E2E_ORIGIN = 'http://localhost:5200';

/** The `Origin` header of the app's own requests from `page`. */
export function appOrigin(page: Page): { origin: string } {
  const url = page.url();
  return { origin: url.startsWith('http') ? new URL(url).origin : E2E_ORIGIN };
}
