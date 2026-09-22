import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { SyncBadge } from './sync-badge.tsx';

const counts = (over: Partial<Parameters<typeof SyncBadge>[0]['counts']> = {}) => ({
  pending: 0,
  sent: 0,
  dead: 0,
  sheets_pending: 0,
  photos_pending: 0,
  ...over,
});

describe('SyncBadge', () => {
  it('renders the mock markup with the kernel word for each state', () => {
    const { rerender } = render(<SyncBadge state="ok" counts={counts()} />);
    const badge = screen.getByTestId('sync-badge');
    expect(badge).toHaveClass('sync-badge');
    expect(badge).toHaveAttribute('data-state', 'ok');
    expect(badge).toHaveAttribute('data-pending', '0');
    expect(badge).toHaveAttribute('data-dead', '0');
    expect(badge.querySelector('.pill .dot')).toHaveAttribute('aria-hidden', 'true');
    expect(badge).toHaveTextContent('Sincronizado');

    rerender(<SyncBadge state="pending" counts={counts({ pending: 4, sent: 1 })} />);
    expect(screen.getByTestId('sync-badge')).toHaveTextContent('5 pendentes');
    expect(screen.getByTestId('sync-badge')).toHaveAttribute('data-pending', '5');

    rerender(<SyncBadge state="offline" counts={counts({ pending: 2 })} />);
    expect(screen.getByTestId('sync-badge')).toHaveTextContent('Sem conexão');

    rerender(<SyncBadge state="error" counts={counts({ dead: 1 })} />);
    expect(screen.getByTestId('sync-badge')).toHaveTextContent('Erro');
    expect(screen.getByTestId('sync-badge')).toHaveAttribute('data-dead', '1');
  });

  it('takes the compact class for cards and stays a plain span without onPress', () => {
    render(<SyncBadge state="pending" counts={counts({ pending: 1 })} compact />);
    const badge = screen.getByTestId('sync-badge');
    expect(badge).toHaveClass('is-compact');
    expect(badge.tagName).toBe('SPAN');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('is a button that opens Sync status when onPress is given, and has no live region', async () => {
    const onPress = vi.fn();
    const { container } = render(<SyncBadge state="ok" counts={counts()} onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Sincronizado' });
    expect(button).toHaveClass('sync-badge-btn');
    const badge = screen.getByTestId('sync-badge');
    expect(button).toContainElement(badge);
    expect(badge).toHaveAttribute('data-pending', '0');
    await userEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[aria-live]')).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });
});
