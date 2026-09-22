import type { ReactNode } from 'react';

/**
 * One banner slot for the whole app. Priority is the spine's Consistency Conventions
 * list, not EXPERIENCE.md's (which still carries the removed install banner):
 *
 *   conflict > re-auth > draft found > suggestions ready > relatório exported > offline
 *   > unsynced > 5 days
 *
 * This story populates only `re-auth`; Story 1.6 extends the slot with the rest.
 */
export const BANNER_PRIORITY = [
  'conflict',
  're-auth',
  'draft-found',
  'suggestions-ready',
  'relatorio-exported',
  'offline',
  'unsynced-5-days',
] as const;

export type BannerKind = (typeof BANNER_PRIORITY)[number];

export type BannerVariant = 'warning' | 'conflict' | 'info';

export interface Banner {
  kind: BannerKind;
  variant: BannerVariant;
  text: string;
  /** Rendered inside `.banner-actions`. */
  actions?: ReactNode;
  /** `alert` for conflict and session errors, `region` otherwise. */
  role?: 'alert' | 'region';
}

/** The highest-priority banner of the candidates, or null when there is none. */
export function pickBanner(candidates: readonly Banner[]): Banner | null {
  let best: Banner | null = null;
  let bestRank: number = BANNER_PRIORITY.length;
  for (const candidate of candidates) {
    const rank: number = BANNER_PRIORITY.indexOf(candidate.kind);
    if (rank === -1) continue;
    if (rank < bestRank) {
      best = candidate;
      bestRank = rank;
    }
  }
  return best;
}

/**
 * The single slot. Renders `.banner-slot` with at most one `.banner` inside it, so the
 * stylesheet's single-slot rule has nothing to hide.
 */
export function BannerSlot({ banners }: { banners: readonly Banner[] }) {
  const banner = pickBanner(banners);
  if (banner === null) return null;
  return (
    <div className="banner-slot">
      <div
        className="banner"
        data-variant={banner.variant}
        role={banner.role ?? 'region'}
        aria-label={banner.role === 'alert' ? undefined : banner.text}
        data-banner={banner.kind}
      >
        <span className="banner-text">{banner.text}</span>
        {banner.actions === undefined ? null : (
          <span className="banner-actions">{banner.actions}</span>
        )}
      </div>
    </div>
  );
}
