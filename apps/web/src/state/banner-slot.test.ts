import { describe, expect, it } from 'vitest';
import { BANNER_PRIORITY, type Banner, pickBanner } from './banner-slot.tsx';

const banner = (kind: Banner['kind']): Banner => ({ kind, variant: 'warning', text: kind });

describe('banner priority', () => {
  it('follows the spine list', () => {
    expect([...BANNER_PRIORITY]).toEqual([
      'conflict',
      're-auth',
      'draft-found',
      'suggestions-ready',
      'relatorio-exported',
      'offline',
      'unsynced-5-days',
    ]);
  });

  it('picks nothing when there is nothing', () => {
    expect(pickBanner([])).toBeNull();
  });

  it('picks the only candidate', () => {
    expect(pickBanner([banner('re-auth')])?.kind).toBe('re-auth');
  });

  it('prefers conflict over re-auth and re-auth over everything below it', () => {
    expect(pickBanner([banner('re-auth'), banner('conflict')])?.kind).toBe('conflict');
    expect(pickBanner([banner('offline'), banner('re-auth')])?.kind).toBe('re-auth');
    expect(pickBanner([banner('unsynced-5-days'), banner('draft-found')])?.kind).toBe('draft-found');
  });

  it('is order-independent', () => {
    const all = BANNER_PRIORITY.map(banner);
    expect(pickBanner(all)?.kind).toBe('conflict');
    expect(pickBanner([...all].reverse())?.kind).toBe('conflict');
  });
});
