import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusPill } from './status-pill.tsx';

describe('StatusPill', () => {
  it.each([
    ['rascunho', 'Rascunho'],
    ['em-campo', 'Em campo'],
    ['em-revisao', 'Em revisão'],
    ['emitido', 'Emitido'],
  ] as const)('maps %s to .status-pill[data-status] with the %s label', (status, label) => {
    render(<StatusPill status={status} />);
    const pill = screen.getByText(label);
    expect(pill).toHaveClass('status-pill');
    expect(pill).toHaveAttribute('data-status', status);
  });
});
