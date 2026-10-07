import type { SuggestionRow } from '@app/domain';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SyncContext } from '../../state/sync.tsx';
import { makeSyncState, type SyncStateOverrides } from '../../test/sync-state.ts';
import { MismatchLine, QueuedBanner } from './read-display.tsx';

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

describe('F-22 MismatchLine (review 2026-10-06)', () => {
  const number = (raw: string) => ({ raw, unit: 'GΩ', state: 'measured' as const });

  it('draws two lines, "Visor: 1,45 GΩ" then "digitado 1.000 GΩ — Conferir", the values still buttons and the text one line', async () => {
    const onVisor = vi.fn();
    const onTyped = vi.fn();
    const suggestion = { id: 'sug-1', value: number('1.45') } as unknown as SuggestionRow;
    render(<MismatchLine value={number('1000')} suggestion={suggestion} onVisor={onVisor} onTyped={onTyped} />);
    const group = screen.getByRole('group', { name: 'Leitura do visor diferente do valor digitado' });
    const lines = group.querySelectorAll('.mismatch-line');
    expect(lines).toHaveLength(2);
    expect(lines[0]!.textContent).toBe('Visor: 1,45 GΩ · ');
    expect(lines[1]!.textContent).toBe('digitado 1.000 GΩ — Conferir');
    expect(group.textContent).toBe('Visor: 1,45 GΩ · digitado 1.000 GΩ — Conferir');
    expect(lines[0]!.querySelector('.visually-hidden')).toHaveTextContent('·');
    await userEvent.click(within(group).getByRole('button', { name: '1,45 GΩ' }));
    expect(onVisor).toHaveBeenCalledTimes(1);
    await userEvent.click(within(group).getByRole('button', { name: '1.000 GΩ' }));
    expect(onTyped).toHaveBeenCalledTimes(1);
  });
});
