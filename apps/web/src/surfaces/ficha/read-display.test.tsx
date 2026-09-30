import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueuedBanner } from './read-display.tsx';

/*
 * F-17 (review 2026-09-30; State Patterns › Reading in progress): a "Ler visor" cell whose
 * photo waits for its reading says "Lendo…" on a device with signal; the waiting words
 * ("Foto guardada — leitura quando houver sinal") are for a device without one.
 */

let online = true;
vi.mock('../../state/session.tsx', () => ({ useSession: () => ({ online }) }));

beforeEach(() => {
  online = true;
});

describe('F-17 QueuedBanner', () => {
  it('online, a queued reading reads "Lendo…"', () => {
    render(<QueuedBanner state="queued" />);
    expect(screen.getByText('Lendo…')).toHaveClass('queued-banner');
    expect(screen.queryByText('Foto guardada — leitura quando houver sinal')).toBeNull();
  });

  it('offline, a queued reading keeps the waiting words', () => {
    online = false;
    render(<QueuedBanner state="queued" />);
    expect(screen.getByText('Foto guardada — leitura quando houver sinal')).toHaveClass('queued-banner');
  });

  it('a running reading reads "Lendo…" either way', () => {
    online = false;
    render(<QueuedBanner state="running" />);
    expect(screen.getByText('Lendo…')).toBeInTheDocument();
  });
});
