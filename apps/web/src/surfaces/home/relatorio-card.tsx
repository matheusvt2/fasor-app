import { statusLabel, type HomeCard, type ResumeTarget } from '@app/domain';
import { Button, StatusPill, SyncBadge, TextButton } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';

export interface RelatorioCardProps {
  card: HomeCard;
  onPress: (card: HomeCard) => void;
  /** The current card's "Continuar" target (`resumeTarget`); null opens the Sumário. */
  resume?: ResumeTarget | null;
  onContinue?: (card: HomeCard, target: ResumeTarget | null) => void;
}

/**
 * `.relatorio-card` from `20-home.html`. Every line is a string the kernel already
 * wrote (`homeCards`, `resumeTarget`): the surface only places it.
 *
 * "Ver sumário" opens the Sumário like the card's own tap (Story 4.3). "Continuar" opens
 * the sheet the kernel resumes (Story 12.2: the last sheet on this device, else the first
 * one still missing something), or the Sumário for a relatório with no sheet. The
 * `.progress-counter` shows only on a card whose relatório is on this device.
 */
export function RelatorioCard({ card, onPress, resume = null, onContinue }: RelatorioCardProps) {
  const className = ['relatorio-card', card.isCurrent && 'is-current', card.isUnavailable && 'is-unavailable']
    .filter(Boolean)
    .join(' ');
  const label = [card.title, statusLabel(card.status), card.counter?.text].filter((part) => part != null).join(', ');

  return (
    <div className={className} data-testid="relatorio-card" data-relatorio={card.id} data-status={card.status}>
      <button
        type="button"
        className="card-title"
        // The mock's label is "⟨cliente⟩, ⟨local⟩, ⟨status⟩, ⟨n de N fichas⟩, …": the status
        // is only a coloured pill for the eye, so the name has to carry it. The device
        // sentence is already read from the visible `.card-device` and is not repeated here.
        aria-label={label}
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
        {card.counter === null ? null : (
          <span className="progress-counter" data-state={card.counter.state}>
            <span className="dot" aria-hidden="true" />
            {card.counter.text}
          </span>
        )}
        <SyncBadge state={card.badgeState} counts={card.badgeCounts} compact />
      </div>
      {card.isCurrent ? (
        <div className="card-continue">
          <Button variant="primary" onPress={() => (onContinue === undefined ? onPress(card) : onContinue(card, resume))}>
            {resume === null ? (
              copy.home.continue
            ) : (
              <>
                {copy.home.continueTo}
                <span className="tabular">{resume.text}</span>
              </>
            )}
          </Button>
          <TextButton onPress={() => onPress(card)}>{copy.home.openSummary}</TextButton>
        </div>
      ) : null}
      <p className="card-device">{card.device.text}</p>
    </div>
  );
}
