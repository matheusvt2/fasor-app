import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusPill } from './status-pill.tsx';

describe('StatusPill', () => {
  it.each([
    ['rascunho', 'rascunho', 'Rascunho'],
    ['em_campo', 'em-campo', 'Em campo'],
    ['em_revisao', 'em-revisao', 'Em revisão'],
    ['emitido', 'emitido', 'Emitido'],
  ] as const)('maps %s to .status-pill[data-status="%s"] with the %s label', (status, pillId, label) => {
    render(<StatusPill status={status} />);
    const pill = screen.getByText(label);
    expect(pill).toHaveClass('status-pill');
    expect(pill).toHaveAttribute('data-status', pillId);
  });
});
