import { useId, type ReactNode } from 'react';
import { copy } from '../copy/pt-br.ts';

/**
 * One banner slot for the whole app. Priority is the spine's Consistency Conventions
 * list, not EXPERIENCE.md's (which still carries the removed install banner):
 *
 *   conflict > re-auth > draft found > suggestions ready > relatório exported > offline
 *   > unsynced > 5 days
 *
 * Only `re-auth` and `offline` have a publisher today; the other five kinds are
 * declared here and published by the story that owns them — `draft-found` by Story 1.8,
 * `suggestions-ready` by Epic 8, `relatorio-exported` by Epic 7, `unsynced-5-days` by
 * Story 1.8 (`unsyncedForDays` is already in the kernel) and `conflict` by Epic 10's
 * merge policy.
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

export interface BannerConditions {
  reAuthRequired: boolean;
  online: boolean;
  /** "Entrar de novo": the shell owns the navigation, the candidate owns the wording. */
  reAuthAction?: ReactNode;
  /** AD-8: the outbox has held work for five days or more (`unsyncedForDays`). */
  unsyncedForDays?: boolean;
  /** FR-61: a `drafts` row is waiting. The offer itself is the persistent toast. */
  draftFound?: boolean;
  /** Optional action for the draft-found candidate; the toast carries the real one. */
  draftAction?: ReactNode;
  /** Everything a surface contributes on its own (none of them exist yet). */
  extra?: readonly Banner[];
}

/**
 * The candidate list for the current conditions.
 *
 * EXPERIENCE.md › Several conditions at once: "Offline alone is a Toast once per
 * session and the badge, not a banner". So `offline` is contributed only when another
 * condition is already asking for the slot — where its job is to be counted by the
 * "+N" chip, never to take the slot itself (it is last but one in the priority).
 */
export function bannerCandidates(conditions: BannerConditions): Banner[] {
  const candidates: Banner[] = [...(conditions.extra ?? [])];
  if (conditions.reAuthRequired) {
    candidates.push({
      kind: 're-auth',
      variant: 'warning',
      role: 'alert',
      text: copy.banner.reAuthText,
      actions: conditions.reAuthAction,
    });
  }
  // FR-61: the offer is the persistent toast (`key-sheet-states.html`). This candidate
  // exists so the condition is counted by the "+N" chip when something above it holds
  // the slot; its text never carries the recovery action.
  if (conditions.draftFound === true) {
    candidates.push({
      kind: 'draft-found',
      variant: 'info',
      role: 'region',
      text: copy.banner.draftFoundText,
      actions: conditions.draftAction,
    });
  }
  // AD-8, last in the priority: work has waited in the outbox for five days. Pushed
  // before the offline check, so that a tablet that is both offline and long-unsynced
  // shows one of them and counts the other.
  if (conditions.unsyncedForDays === true) {
    candidates.push({
      kind: 'unsynced-5-days',
      variant: 'warning',
      role: 'region',
      text: copy.banner.unsyncedText,
    });
  }
  if (!conditions.online && candidates.length > 0) {
    candidates.push({ kind: 'offline', variant: 'info', role: 'region', text: copy.banner.offlineText });
  }
  return candidates;
}

/**
 * The single slot. Renders `.banner-slot` with at most one `.banner` inside it, so the
 * stylesheet's single-slot rule has nothing to hide; the conditions that did not get
 * the slot fold into the `.banner-more` "+N" chip, which opens Sync status.
 */
export function BannerSlot({
  banners,
  onOpenSync,
}: {
  banners: readonly Banner[];
  onOpenSync?: () => void;
}) {
  const textId = useId();
  const banner = pickBanner(banners);
  if (banner === null) return null;
  const folded = banners.filter((b) => BANNER_PRIORITY.includes(b.kind)).length - 1;
  return (
    <div className="banner-slot">
      <div
        className="banner"
        data-variant={banner.variant}
        role={banner.role ?? 'region'}
        // The region is named by the sentence it already shows, not by a copy of it:
        // an `aria-label` here would replace the visible text rather than point at it.
        aria-labelledby={banner.role === 'alert' ? undefined : textId}
        data-banner={banner.kind}
      >
        <span className="banner-text" id={textId}>
          {banner.text}
        </span>
        {banner.actions === undefined ? null : <span className="banner-actions">{banner.actions}</span>}
        {folded > 0 && onOpenSync !== undefined ? (
          <button
            type="button"
            className="banner-more"
            // WCAG 2.5.3 Label in Name: the accessible name starts with the visible
            // "+N" so speech input can reach the control by what it reads.
            aria-label={copy.banner.moreLabel(folded)}
            onClick={onOpenSync}
          >
            {`+${folded}`}
          </button>
        ) : null}
      </div>
    </div>
  );
}
