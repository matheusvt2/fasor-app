import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SyncContext } from '../../state/sync.tsx';
import { makeSyncState, type SyncStateOverrides } from '../../test/sync-state.ts';
import { QueuedBanner } from './read-display.tsx';

/*
 * F-17 (review 2026-09-30; State Patterns › Reading in progress): a "Ler visor" cell whose
 * photo waits for its reading says "Lendo…" on a device with signal; the waiting words
 * ("Foto guardada — leitura quando houver sinal") are for a device without one, or whose
 * server did not answer (F-13, review 2026-10-06: the plate row's rule).
 */

function renderBanner(state: 'queued' | 'running', sync: SyncStateOverrides = {}) {
  return render(
    <SyncContext value={makeSyncState(sync)}>
      <QueuedBanner state={state} />
    </SyncContext>,
  );
}

describe('F-17 QueuedBanner', () => {
  it('online, a queued reading reads "Lendo…"', () => {
    renderBanner('queued');
    expect(screen.getByText('Lendo…')).toHaveClass('queued-banner');
    expect(screen.queryByText('Foto guardada — leitura quando houver sinal')).toBeNull();
  });

  it('offline, a queued reading keeps the waiting words', () => {
    renderBanner('queued', { online: false });
    expect(screen.getByText('Foto guardada — leitura quando houver sinal')).toHaveClass('queued-banner');
  });

  it('F-13: online with the server unreachable, a queued reading keeps the waiting words, as the plate row does', () => {
    renderBanner('queued', { unreachable: 'server' });
    expect(screen.getByText('Foto guardada — leitura quando houver sinal')).toHaveClass('queued-banner');
  });

  it('a running reading reads "Lendo…" either way', () => {
    renderBanner('running', { online: false });
    expect(screen.getByText('Lendo…')).toBeInTheDocument();
  });
});
