import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SYNC_ANNOUNCEMENT_CLEAR_MS, SyncAnnouncer } from './sync-announcer.tsx';

describe('SyncAnnouncer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is a hidden status region that says nothing on the first render', () => {
    render(<SyncAnnouncer state="pending" />);
    const region = screen.getByTestId('sync-announcer');
    expect(region).toHaveAttribute('role', 'status');
    expect(region).toHaveClass('visually-hidden');
    expect(region).toHaveTextContent('');
  });

  it('announces the transition word of the new state (D10)', () => {
    const { rerender } = render(<SyncAnnouncer state="pending" />);
    rerender(<SyncAnnouncer state="ok" />);
    expect(screen.getByTestId('sync-announcer')).toHaveTextContent('Sincronizado');
    rerender(<SyncAnnouncer state="offline" />);
    expect(screen.getByTestId('sync-announcer')).toHaveTextContent('Sem conexão');
    rerender(<SyncAnnouncer state="error" />);
    expect(screen.getByTestId('sync-announcer')).toHaveTextContent('Erro de sincronização');
    rerender(<SyncAnnouncer state="conflict" />);
    expect(screen.getByTestId('sync-announcer')).toHaveTextContent('Conflito');
  });

  it('F-23: announces pending without a count, so the region never holds a stale number', () => {
    const { rerender } = render(<SyncAnnouncer state="ok" />);
    rerender(<SyncAnnouncer state="pending" />);
    const region = screen.getByTestId('sync-announcer');
    expect(region).toHaveTextContent('Alterações pendentes');
    expect(region.textContent).not.toMatch(/\d/);
    // A count change is not a transition: the props carry no count, and a rerender says nothing new.
    rerender(<SyncAnnouncer state="pending" />);
    expect(region).toHaveTextContent('Alterações pendentes');
  });

  it('F-23: clears the region a few seconds after writing it', () => {
    vi.useFakeTimers();
    const { rerender } = render(<SyncAnnouncer state="ok" />);
    rerender(<SyncAnnouncer state="offline" />);
    const region = screen.getByTestId('sync-announcer');
    expect(region).toHaveTextContent('Sem conexão');
    act(() => {
      vi.advanceTimersByTime(SYNC_ANNOUNCEMENT_CLEAR_MS - 1);
    });
    expect(region).toHaveTextContent('Sem conexão');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(region).toHaveTextContent('');
  });
});
