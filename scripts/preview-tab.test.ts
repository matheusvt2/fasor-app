import { describe, expect, it } from 'vitest';
import { isTabClosedError, previewRequest, type PreviewTab } from '../e2e/production/preview-tab.ts';

/*
 * Batch e18fb (2026-11-03, the deploy of 54b11947): the production smoke's step 6 presses the
 * preview once more only when its tab closed before the preview request was seen. Driven here
 * with fakes: no browser, no deployed URL.
 */

const URL = /\/preview\.pdf$/;
const closed = () => new Error('page.waitForRequest: Target page, context or browser has been closed');

/** A tab whose wait resolves with `request`, or rejects with `error`. */
function tab(outcome: { request: string } | { error: Error }): PreviewTab<string> & { asked: RegExp[] } {
  const asked: RegExp[] = [];
  return {
    asked,
    waitForRequest: async (url) => {
      asked.push(url);
      if ('error' in outcome) throw outcome.error;
      return outcome.request;
    },
  };
}

/** Runs the helper over the tabs in order, counting presses and recoveries. */
async function drive(tabs: ReturnType<typeof tab>[]) {
  let presses = 0;
  const recovered: Error[] = [];
  const result = previewRequest({
    openTab: async () => tabs[presses++]!,
    url: URL,
    timeout: 1_000,
    recover: async (error) => {
      recovered.push(error);
    },
  });
  return { result, presses: () => presses, recovered };
}

describe('previewRequest (e2e/production/preview-tab.ts)', () => {
  it('returns the request of the first tab when it is seen, without a retry', async () => {
    const first = tab({ request: 'GET /preview.pdf' });
    const run = await drive([first]);
    await expect(run.result).resolves.toEqual({ request: 'GET /preview.pdf', tab: first, retried: false });
    expect(run.presses()).toBe(1);
    expect(run.recovered).toEqual([]);
    expect(first.asked).toEqual([URL]);
  });

  it('a tab closed before the request: recovers once, presses again and returns the second request', async () => {
    const error = closed();
    const second = tab({ request: 'GET /preview.pdf?v=2' });
    const run = await drive([tab({ error }), second]);
    await expect(run.result).resolves.toEqual({ request: 'GET /preview.pdf?v=2', tab: second, retried: true });
    expect(run.presses()).toBe(2);
    expect(run.recovered).toEqual([error]);
  });

  it('a second close fails with the first error, after one recovery and two presses', async () => {
    const error = closed();
    const run = await drive([tab({ error }), tab({ error: closed() })]);
    await expect(run.result).rejects.toBe(error);
    expect(run.presses()).toBe(2);
    expect(run.recovered).toHaveLength(1);
  });

  it('any other error (a timeout) fails at once: no recovery, no second press', async () => {
    const error = new Error('page.waitForRequest: Timeout 300000ms exceeded while waiting for event "request"');
    const run = await drive([tab({ error }), tab({ request: 'never' })]);
    await expect(run.result).rejects.toBe(error);
    expect(run.presses()).toBe(1);
    expect(run.recovered).toEqual([]);
  });

  it('a retry that fails another way fails with that error', async () => {
    const other = new Error('page.waitForRequest: Timeout 300000ms exceeded');
    const run = await drive([tab({ error: closed() }), tab({ error: other })]);
    await expect(run.result).rejects.toBe(other);
  });

  it('reads a closed tab, page or browser as closed, and nothing else', () => {
    expect(isTabClosedError(closed())).toBe(true);
    expect(isTabClosedError(new Error('Target closed'))).toBe(true);
    expect(isTabClosedError(new Error('Timeout 30000ms exceeded'))).toBe(false);
    expect(isTabClosedError('Target closed')).toBe(false);
  });
});
