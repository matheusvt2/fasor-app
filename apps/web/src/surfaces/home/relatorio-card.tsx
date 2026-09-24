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
 * "Ver sumário" opens the Sumário like the card's own tap (Story 4.3). "Continuar" points
 * at the last sheet, which Epic 5 owns, so it renders `aria-disabled` and stays focusable
 * with its reason beside it (AD-23) instead of vanishing. There is no `.progress-counter`
 * on the card yet: the Home card reads relatórios it may not hold, and the counter of a
 * relatório on this device is the Project row's (Story 4.1).
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
            <TextButton onPress={() => onPress(card)}>{copy.home.openSummary}</TextButton>
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
