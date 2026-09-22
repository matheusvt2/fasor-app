import { statusLabel, type HomeCard } from '@app/domain';
import { useId } from 'react';
import { Button, StatusPill, SyncBadge, TextButton } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';

export interface RelatorioCardProps {
  card: HomeCard;
  onPress: (card: HomeCard) => void;
}

/**
 * `.relatorio-card` from `20-home.html`. Every line is a string the kernel already
 * wrote (`homeCards`): the surface only places it.
 *
 * "Continuar" and "Ver sumário" point at the relatório tree and the Sumário, which
 * Epics 2 and 5 own, so they render `aria-disabled` and stay focusable with one shared
 * reason beside them (AD-23) instead of vanishing. The reason is written once for both,
 * as the mock's `.btn-reason` is: two copies of the same sentence would be the screen
 * arguing with itself. There is no `.progress-counter` either — its "n de N fichas"
 * needs `progress(snapshot)`, which does not exist yet (AD-8, Design Notes).
 */
export function RelatorioCard({ card, onPress }: RelatorioCardProps) {
  const reasonId = useId();
  const className = ['relatorio-card', card.isCurrent && 'is-current', card.isUnavailable && 'is-unavailable']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={className} data-testid="relatorio-card" data-relatorio={card.id} data-status={card.status}>
      <button
        type="button"
        className="card-title"
        // The mock's label is "⟨cliente⟩, ⟨local⟩, ⟨status⟩, …": the status is only a
        // coloured pill for the eye, so the name has to carry it. The device sentence is
        // already read from the visible `.card-device` and is not repeated here.
        aria-label={`${card.title}, ${statusLabel(card.status)}`}
        onClick={() => onPress(card)}
      >
        <span>{card.title}</span>
        <svg className="ico card-chev" aria-hidden="true">
          <use href="/sprite.svg#i-chev-right" />
        </svg>
      </button>
      {card.meta === '' ? null : <p className="card-meta">{card.meta}</p>}
      <div className="card-state">
        <StatusPill status={card.status} />
        <SyncBadge state={card.badgeState} counts={card.badgeCounts} compact />
      </div>
      {card.isCurrent ? (
        <>
          <div className="card-continue">
            <Button variant="primary" isDisabled disabledReasonId={reasonId}>
              {copy.home.continue}
            </Button>
            <TextButton isDisabled disabledReasonId={reasonId}>
              {copy.home.openSummary}
            </TextButton>
          </div>
          <span className="btn-reason" id={reasonId}>
            {copy.home.notAvailableYet}
          </span>
        </>
      ) : null}
      <p className="card-device">{card.device.text}</p>
    </div>
  );
}
