/*
 * Batch e18fb (2026-11-03, the deploy of 54b11947): step 6 of the production smoke opens the
 * preview tab and waits for its navigation to the PDF. Right after a roll that tab once closed
 * before the request was seen (`page.waitForRequest: Target page, context or browser has been
 * closed`, 24 s into the run), and the same suite passed 8 of 8 minutes later: the web closes
 * the tab it opened whenever the preview fails on the device (`use-preview.ts`). This helper
 * presses the preview once more, after recording what the device said, and only in that case:
 * any other error, and a second close, fail the step as before. No assertion is retried.
 */

/** The part of a Playwright `Page` the helper uses, so a unit test can drive it with fakes. */
export interface PreviewTab<R> {
  waitForRequest(url: RegExp, options: { timeout: number }): Promise<R>;
}

/** The request type a tab's wait resolves with (Playwright's `Request` for a `Page`). */
export type RequestOf<T> = T extends PreviewTab<infer R> ? R : never;

export interface PreviewRequestOptions<T extends PreviewTab<unknown>> {
  /** Presses "Pré-visualizar" in the open dialog and resolves with the tab it opened. */
  openTab: () => Promise<T>;
  /** The preview's URL, as the tab navigates to it. */
  url: RegExp;
  timeout: number;
  /**
   * Before the one retry: records the dialog's failure line and the page's console errors,
   * closes the dialog, reloads the Sumário and opens the dialog again.
   */
  recover: (error: Error) => Promise<void>;
}

/** Whether the error is the tab (or its page) having closed under a wait. */
export function isTabClosedError(error: unknown): error is Error {
  return error instanceof Error && /Target page, context or browser has been closed|Target closed|Page closed/.test(error.message);
}

/**
 * Presses the preview and returns the request its tab made, with that tab. When the tab closed
 * before the request was seen, `recover` runs and the preview is pressed once more; a second
 * close rethrows the first error unchanged, and any other error is rethrown at once.
 */
export async function previewRequest<T extends PreviewTab<unknown>>(options: PreviewRequestOptions<T>): Promise<{ request: RequestOf<T>; tab: T; retried: boolean }> {
  const attempt = async () => {
    const tab = await options.openTab();
    return { request: (await tab.waitForRequest(options.url, { timeout: options.timeout })) as RequestOf<T>, tab };
  };
  try {
    return { ...(await attempt()), retried: false };
  } catch (error) {
    if (!isTabClosedError(error)) throw error;
    await options.recover(error);
    try {
      return { ...(await attempt()), retried: true };
    } catch (second) {
      throw isTabClosedError(second) ? error : second;
    }
  }
}
