import { render, screen } from '@testing-library/react';
import { TEXT_CAPS } from '@app/domain';
import { describe, expect, it } from 'vitest';
import { CharCount } from './char-count.tsx';

/* Story 20.9: the shared counter under a capped field renders the kernel's sentence from 90 % of the cap. */
describe('CharCount (Story 20.9)', () => {
  it('renders nothing below 90 % of the cap, and with no cap', () => {
    const { container, rerender } = render(<CharCount length={179} cap={TEXT_CAPS.short} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<CharCount length={5000} cap={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('from 90 % of the cap: the kernel sentence in a polite .helper line', () => {
    render(<CharCount length={180} cap={TEXT_CAPS.short} id="count-1" />);
    const count = screen.getByTestId('char-count');
    expect(count).toHaveTextContent('180 de 200 caracteres');
    expect(count).toHaveClass('helper');
    expect(count).toHaveAttribute('aria-live', 'polite');
    expect(count).toHaveAttribute('id', 'count-1');
  });

  it('at a long cap the count and the cap are grouped as pt-BR writes them', () => {
    render(<CharCount length={TEXT_CAPS.long} cap={TEXT_CAPS.long} />);
    expect(screen.getByTestId('char-count')).toHaveTextContent('20.000 de 20.000 caracteres');
  });
});
