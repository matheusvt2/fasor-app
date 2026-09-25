import type { HomeCard } from '@app/domain';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RelatorioCard } from './relatorio-card.tsx';

function card(counter: HomeCard['counter']): HomeCard {
  return {
    id: 'r1',
    status: 'em_campo',
    statusPillId: 'em_campo',
    title: 'Cliente · Obra',
    meta: '',
    device: { kind: 'absent-online', text: 'Não está neste aparelho' },
    badgeState: 'ok',
    badgeCounts: { pending: 0, sent: 0, dead: 0, sheets_pending: 0, photos_pending: 0 },
    isCurrent: false,
    isUnavailable: false,
    counter,
  } as unknown as HomeCard;
}

describe('RelatorioCard', () => {
  it('E12-Q12: a card with no counter (not on this device) is named with no trailing separator', () => {
    render(<RelatorioCard card={card(null)} onPress={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Cliente · Obra, Em campo' })).toBeInTheDocument();
  });

  it('a card with a counter carries it last in its name', () => {
    render(<RelatorioCard card={card({ text: '3 de 94 fichas', state: 'pending' })} onPress={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Cliente · Obra, Em campo, 3 de 94 fichas' })).toBeInTheDocument();
  });
});
