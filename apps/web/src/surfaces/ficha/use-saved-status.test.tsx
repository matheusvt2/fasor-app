import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SyncContext, type SyncState } from '../../state/sync.tsx';
import { FichaSavedLine } from './ficha-header.tsx';
import { useSavedStatus } from './use-ficha-actions.ts';

/*
 * Story 13.4 regression (5.6-E2E-001 under load): the sheet body calls `useSavedStatus`, so
 * that hook must never subscribe to the sync state. A body that did re-rendered the whole
 * sheet on every outbox count change, and under CPU load the readings' Enter run fell behind
 * (4 of 9 reading ops in the outbox after 5 s). Only the saved line reads reachability.
 */

const syncState = (online: boolean, outbox: number) => ({ online, unreachable: null, counts: { outbox } }) as unknown as SyncState;

describe('13.4 useSavedStatus stays off the sync state', () => {
  it('a sync state change re-renders the saved line, not the component holding useSavedStatus', () => {
    let bodyRenders = 0;
    let saved: () => void = () => undefined;
    function Body() {
      bodyRenders += 1;
      const status = useSavedStatus();
      saved = status.saved;
      return <FichaSavedLine at={status.at} />;
    }
    // One element instance across renders: only a context consumer inside it can re-render.
    const body = <Body />;
    function Shell({ state }: { state: SyncState }) {
      return <SyncContext value={state}>{body}</SyncContext>;
    }
    const { getByTestId, rerender } = render(<Shell state={syncState(true, 0)} />);
    act(() => saved());
    expect(getByTestId('ficha-saved').textContent).toMatch(/^Salvo às \d{2}:\d{2}$/);
    const settled = bodyRenders;
    // The outbox count moves and the browser goes offline: the line follows, the body does not.
    rerender(<Shell state={syncState(true, 1)} />);
    rerender(<Shell state={syncState(true, 2)} />);
    rerender(<Shell state={syncState(false, 3)} />);
    expect(bodyRenders).toBe(settled);
    expect(getByTestId('ficha-saved').textContent).toMatch(/^Salvo neste aparelho às \d{2}:\d{2}$/);
  });
});
