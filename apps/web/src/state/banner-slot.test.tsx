import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BANNER_PRIORITY, BannerSlot, bannerCandidates, pickBanner, type Banner } from './banner-slot.tsx';

/*
 * Test 1.6-UNIT-002, second half (AR-27, UX-DR11): the seven-kind order, one banner at
 * a time, the "+N" chip for the folded conditions, and EXPERIENCE.md's rule that
 * offline alone is a toast and the badge, never a banner.
 */

const banner = (kind: Banner['kind']): Banner => ({ kind, variant: 'warning', text: kind });

describe('banner priority', () => {
  it('follows the spine list', () => {
    expect([...BANNER_PRIORITY]).toEqual([
      'conflict',
      're-auth',
      'storage-low',
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

  it('is order-independent, and the whole list resolves in order', () => {
    const all = BANNER_PRIORITY.map(banner);
    expect(pickBanner(all)?.kind).toBe('conflict');
    expect(pickBanner([...all].reverse())?.kind).toBe('conflict');
    // Removing the winner hands the slot to the next kind, all the way down.
    let remaining = [...all];
    const order: string[] = [];
    while (remaining.length > 0) {
      const next = pickBanner(remaining)!;
      order.push(next.kind);
      remaining = remaining.filter((b) => b.kind !== next.kind);
    }
    expect(order).toEqual([...BANNER_PRIORITY]);
  });
});

describe('bannerCandidates', () => {
  it('offers nothing when the connection is up and the session is fine', () => {
    expect(bannerCandidates({ reAuthRequired: false, online: true })).toEqual([]);
  });

  it('offline alone is not a banner', () => {
    expect(bannerCandidates({ reAuthRequired: false, online: false })).toEqual([]);
  });

  it('offline joins the list only when another condition already asks for the slot', () => {
    const candidates = bannerCandidates({ reAuthRequired: true, online: false });
    expect(candidates.map((b) => b.kind).sort()).toEqual(['offline', 're-auth']);
    expect(pickBanner(candidates)?.kind).toBe('re-auth');
  });

  // AD-8: the two kinds Story 1.6 declared and left without a publisher.
  it('publishes the 5-day warning with the acceptance criterion wording', () => {
    const candidates = bannerCandidates({ reAuthRequired: false, online: true, unsyncedForDays: true });
    expect(candidates).toEqual([
      { kind: 'unsynced-5-days', variant: 'warning', role: 'region', text: 'Alterações sem envio há 5 dias' },
    ]);
  });

  it('offline takes the slot over the 5-day warning and the warning is counted', () => {
    const candidates = bannerCandidates({ reAuthRequired: false, online: false, unsyncedForDays: true });
    expect(candidates.map((b) => b.kind).sort()).toEqual(['offline', 'unsynced-5-days']);
    expect(pickBanner(candidates)?.kind).toBe('offline');
  });

  it('6.2 publishes the low-storage warning under 500 MB free, ranked right after re-auth', () => {
    const MB = 1024 * 1024;
    const low = { usage: 9_820 * MB, quota: 10_000 * MB };
    const candidates = bannerCandidates({ reAuthRequired: false, online: true, storage: low });
    expect(candidates).toEqual([
      { kind: 'storage-low', variant: 'warning', role: 'region', text: 'Pouco espaço neste aparelho (180 MB). Sincronize para liberar.', actions: undefined },
    ]);
    expect(bannerCandidates({ reAuthRequired: false, online: true, storage: { usage: 0, quota: 10_000 * MB } })).toEqual([]);
    expect(bannerCandidates({ reAuthRequired: false, online: true, storage: null })).toEqual([]);
    expect(pickBanner(bannerCandidates({ reAuthRequired: true, online: true, storage: low }))?.kind).toBe('re-auth');
    expect(pickBanner(bannerCandidates({ reAuthRequired: false, online: false, unsyncedForDays: true, storage: low }))?.kind).toBe('storage-low');
  });

  it('never publishes a draft-found candidate: the persistent toast is the only offer (retro U7)', () => {
    const candidates = bannerCandidates({ reAuthRequired: false, online: true, unsyncedForDays: true });
    expect(candidates.map((b) => b.kind)).toEqual(['unsynced-5-days']);
  });
});

describe('BannerSlot', () => {
  it('renders one banner and folds the rest into the "+N" chip', async () => {
    const onOpenSync = vi.fn();
    render(
      <BannerSlot banners={bannerCandidates({ reAuthRequired: true, online: false })} onOpenSync={onOpenSync} />,
    );
    expect(document.querySelectorAll('.banner-slot > .banner')).toHaveLength(1);
    expect(document.querySelector('.banner')).toHaveAttribute('data-banner', 're-auth');
    // WCAG 2.5.3: the accessible name begins with the visible "+1".
    const more = screen.getByRole('button', { name: '+1, outras condições — abrir status de sincronização' });
    expect(more).toHaveClass('banner-more');
    expect(more).toHaveTextContent('+1');
    await userEvent.click(more);
    expect(onOpenSync).toHaveBeenCalledTimes(1);
  });

  it('has no chip with a single candidate, and the region is named by its own text', () => {
    render(<BannerSlot banners={[banner('re-auth')]} onOpenSync={vi.fn()} />);
    expect(document.querySelector('.banner-more')).toBeNull();
    // Named through `aria-labelledby` on the visible sentence, never by a copy of it
    // in an `aria-label` that would replace what the region shows.
    const region = screen.getByRole('region');
    expect(region).not.toHaveAttribute('aria-label');
    expect(region).toHaveAccessibleName('re-auth');
  });

  it('renders nothing when there is no candidate', () => {
    const { container } = render(<BannerSlot banners={[]} onOpenSync={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
