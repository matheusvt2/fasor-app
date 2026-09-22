import type { SyncCounts } from '@app/domain';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SyncAnnouncer } from './sync-announcer.tsx';

const counts = (over: Partial<SyncCounts> = {}): SyncCounts => ({
  pending: 0,
  sent: 0,
  dead: 0,
  sheets_pending: 0,
  photos_pending: 0,
  ...over,
});

describe('SyncAnnouncer', () => {
  it('is a hidden status region that says nothing on the first render', () => {
    render(<SyncAnnouncer state="pending" counts={counts({ pending: 3 })} />);
    const region = screen.getByTestId('sync-announcer');
    expect(region).toHaveAttribute('role', 'status');
    expect(region).toHaveClass('visually-hidden');
    expect(region).toHaveTextContent('');
  });

  it('announces the new state word on a transition', () => {
    const { rerender } = render(<SyncAnnouncer state="pending" counts={counts({ pending: 3 })} />);
    rerender(<SyncAnnouncer state="ok" counts={counts()} />);
    expect(screen.getByTestId('sync-announcer')).toHaveTextContent('Sincronizado');
    rerender(<SyncAnnouncer state="offline" counts={counts()} />);
    expect(screen.getByTestId('sync-announcer')).toHaveTextContent('Sem conexão');
  });

  it('stays silent when only the counts change', () => {
    const { rerender } = render(<SyncAnnouncer state="ok" counts={counts()} />);
    rerender(<SyncAnnouncer state="pending" counts={counts({ pending: 3 })} />);
    expect(screen.getByTestId('sync-announcer')).toHaveTextContent('3 pendentes');
    rerender(<SyncAnnouncer state="pending" counts={counts({ pending: 5 })} />);
    // A count is not a transition: the region keeps the word it already announced.
    expect(screen.getByTestId('sync-announcer')).toHaveTextContent('3 pendentes');
  });
});
