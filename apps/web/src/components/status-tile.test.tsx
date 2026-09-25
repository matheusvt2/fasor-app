import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from '../test-axe.ts';
import { describe, expect, it, vi } from 'vitest';
import { StatusTile } from './status-tile.tsx';

describe('StatusTile', () => {
  it('renders the mock markup with the count over the status pill', () => {
    const { container } = render(<StatusTile status="em_campo" count={3} isPressed={false} onPress={vi.fn()} />);
    const tile = screen.getByRole('button', { name: 'Em campo, 3 relatórios' });
    expect(tile).toHaveClass('status-tile');
    expect(tile).toHaveAttribute('aria-pressed', 'false');
    expect(container.querySelector('.tile-count')).toHaveTextContent('3');
    expect(container.querySelector('.tile-count')).not.toHaveClass('is-zero');
    expect(container.querySelector('.status-pill')).toHaveAttribute('data-status', 'em-campo');
  });

  it('marks a zero count without hiding the tile, and uses the singular', () => {
    const { container } = render(<StatusTile status="em_revisao" count={0} isPressed={false} onPress={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Em revisão, 0 relatórios' })).toBeVisible();
    expect(container.querySelector('.tile-count')).toHaveClass('is-zero');
    render(<StatusTile status="rascunho" count={1} isPressed={false} onPress={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Rascunho, 1 relatório' })).toBeInTheDocument();
  });

  it('carries aria-pressed on the visible button and reports every press', async () => {
    const onPress = vi.fn();
    const { container } = render(<StatusTile status="emitido" count={2} isPressed onPress={onPress} />);
    const tile = screen.getByRole('button', { name: 'Emitido, 2 relatórios' });
    expect(tile).toHaveAttribute('aria-pressed', 'true');
    // The pressed look in `src/styles/app.css` hangs off this attribute, on this element.
    expect(container.querySelectorAll('.status-tile[aria-pressed="true"]')).toHaveLength(1);
    await userEvent.click(tile);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(await axe(container)).toHaveNoViolations();
  });
});
