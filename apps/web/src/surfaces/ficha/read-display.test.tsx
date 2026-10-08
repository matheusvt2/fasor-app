import type { SuggestionRow } from '@app/domain';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PhotoTile } from '../../db/photo-store.ts';
import { SyncContext } from '../../state/sync.tsx';
import { ToastProvider } from '../../state/toast.tsx';
import { makeSyncState, type SyncStateOverrides } from '../../test/sync-state.ts';
import { envAfter, MismatchLine, QueuedBanner, type EnvDisplayModel } from './read-display.tsx';

const session = { database: null, user: null, online: true };
vi.mock('../../state/session.tsx', () => ({ useSession: () => session }));

/*
 * F-17 (review 2026-09-30; State Patterns › Reading in progress): a "Ler visor" cell whose
 * photo waits for its reading says "Lendo…" on a device with signal; the waiting words
 * ("Foto guardada — leitura quando houver sinal") are for a device without one, or whose
 * server did not answer (F-13, review 2026-10-06: the plate row's rule).
 */

const PHOTO = '019966b0-0092-7000-8000-000000000101';

/** The display photo's tile, captured `ageMs` ago (no status op pulled yet). */
const tileAged = (ageMs: number, extra: Partial<PhotoTile> = {}): PhotoTile => ({
  id: PHOTO,
  block_id: null,
  item_key: null,
  caption: null,
  captured_at: new Date(Date.now() - ageMs).toISOString(),
  local_seq: 1,
  coords: null,
  uploaded_at: null,
  thumb: null,
  upload_error: null,
  reading_kind: 'display',
  reading_status: 'queued',
  reading_status_op_id: null,
  ...extra,
});

/** Review 2026-10-08 (DG-4): a tile whose bytes the server took when it was captured, `ageMs` ago (the age counts from there). */
const ackedAged = (ageMs: number, extra: Partial<PhotoTile> = {}): PhotoTile => {
  const at = new Date(Date.now() - ageMs).toISOString();
  return tileAged(ageMs, { captured_at: at, bytes_acked_at: at, ...extra });
};

function renderBanner(state: 'queued' | 'running' | 'failed' | 'empty', sync: SyncStateOverrides = {}, tile: PhotoTile = tileAged(0)) {
  session.online = sync.online ?? true;
  return render(
    <SyncContext value={makeSyncState(sync)}>
      <ToastProvider>
        <QueuedBanner entry={{ state, photoId: PHOTO }} tile={tile} />
      </ToastProvider>
    </SyncContext>,
  );
}

describe('F-17 QueuedBanner', () => {
  it('online, a queued reading reads "Lendo…"', () => {
    renderBanner('queued');
    expect(screen.getByText('Lendo…', { selector: '.queued-banner' })).toBeInTheDocument();
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
    expect(screen.getByText('Lendo…', { selector: '.queued-banner' })).toBeInTheDocument();
  });
});

describe('13.5-UNIT the wait and failed lines of a display reading', () => {
  it('under 10 s "Lendo…" alone; from 10 s its age and "Cancelar"; from 120 s the still-reading note', () => {
    const { unmount } = renderBanner('queued', {}, ackedAged(5_000));
    expect(screen.getByRole('status')).toHaveTextContent(/^Lendo…$/);
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull();
    unmount();

    const again = renderBanner('running', {}, ackedAged(12_400));
    expect(screen.getByText(/^Lendo… 12 s$/)).toHaveClass('queued-banner');
    // Review F-06: the ticking age sits outside the live region; the region says the transition.
    expect(screen.getByText(/^Lendo… 12 s$/).closest('[role="status"], [aria-live]')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(/^Lendo… já é possível cancelar\.$/);
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(screen.queryByText(/A leitura está demorando/)).toBeNull();
    again.unmount();

    renderBanner('running', {}, ackedAged(125_000));
    expect(screen.getByText(/^Lendo… 2 min 05 s$/)).toHaveClass('queued-banner');
    expect(screen.getByRole('status')).toHaveTextContent('Lendo… a leitura está demorando; o app continua conferindo a cada minuto.');
    expect(screen.getByText('A leitura está demorando. O app continua conferindo a cada minuto; a foto está guardada.')).toBeInTheDocument();
  });

  it('counts from the newest pulled status op when there is one', () => {
    renderBanner('running', {}, tileAged(300_000, { reading_status_at: new Date(Date.now() - 15_000).toISOString() }));
    expect(screen.getByText(/^Lendo… 15 s$/)).toHaveClass('queued-banner');
  });

  it('review 2026-10-08 (DG-4): a photo whose bytes the server does not hold yet reads "Lendo…" alone, however old, with no "Cancelar" and no note; once acked the age counts from the ack', () => {
    const { unmount } = renderBanner('queued', {}, tileAged(180_000));
    expect(screen.getByText(/^Lendo…$/, { selector: '.queued-banner' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull();
    expect(screen.queryByText(/A leitura está demorando/)).toBeNull();
    unmount();
    renderBanner('queued', {}, tileAged(180_000, { bytes_acked_at: new Date(Date.now() - 12_400).toISOString() }));
    expect(screen.getByText(/^Lendo… 12 s$/)).toHaveClass('queued-banner');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('review 2026-10-08 (CAPT-V1): an empty reading says "Nada foi lido nesta foto" with "Fotografar de novo" (given the retake) and "Digitar", which focuses the cell', async () => {
    const retake = { relatorioId: '019966b0-0092-7000-8000-000000000999', photos: [{ id: PHOTO, reading_kind: 'display' as const, reading_target: null, reading_status: 'done' as const, local_seq: 1, captured_at: '2026-10-08T12:00:00.000Z', block_id: null, item_key: null, caption: 'T1' }] };
    const { unmount } = render(
      <SyncContext value={makeSyncState()}>
        <ToastProvider>
          <div className="ficha-cell">
            <input aria-label="T1, Valor" />
            <QueuedBanner entry={{ state: 'empty', photoId: PHOTO }} tile={tileAged(0, { reading_status: 'done' })} retake={retake} />
          </div>
        </ToastProvider>
      </SyncContext>,
    );
    expect(await screen.findByText('Nada foi lido nesta foto')).toHaveClass('reading-line');
    expect(screen.getByRole('button', { name: 'Fotografar de novo' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Digitar' }));
    expect(screen.getByRole('textbox', { name: 'T1, Valor' })).toHaveFocus();
    unmount();
    // Without the retake (nothing to shoot again with), only the way to type.
    renderBanner('empty', {}, tileAged(0, { reading_status: 'done' }));
    expect(await screen.findByText('Nada foi lido nesta foto')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fotografar de novo' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Digitar' })).toBeInTheDocument();
  });

  it('offline the queued words stay and nothing is offered to cancel (nothing runs)', () => {
    renderBanner('queued', { online: false }, tileAged(60_000));
    expect(screen.getByText('Foto guardada — leitura quando houver sinal')).toHaveClass('queued-banner');
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull();
  });

  it('"Cancelar" takes the line away at once', async () => {
    renderBanner('running', {}, ackedAged(20_000));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText(/^Lendo…/)).toBeNull();
  });

  it('a failed reading: "Não foi possível ler", "Tentar novamente" (disabled offline with "Sem conexão") and "Digitar", which focuses the cell', async () => {
    const { container, unmount } = render(
      <SyncContext value={makeSyncState()}>
        <ToastProvider>
          <div className="ficha-cell">
            <input aria-label="T1, Valor" />
            <QueuedBanner entry={{ state: 'failed', photoId: PHOTO }} tile={tileAged(0, { reading_status: 'failed' })} />
          </div>
        </ToastProvider>
      </SyncContext>,
    );
    expect(screen.getByText('Não foi possível ler')).toHaveClass('reading-line');
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).not.toHaveAttribute('aria-disabled');
    await userEvent.click(screen.getByRole('button', { name: 'Digitar' }));
    expect(screen.getByRole('textbox', { name: 'T1, Valor' })).toHaveFocus();
    expect(container.querySelector('.reading-failed')).not.toBeNull();
    unmount();

    session.online = false;
    renderBanner('failed', { online: false }, tileAged(0, { reading_status: 'failed' }));
    const retry = screen.getByRole('button', { name: 'Tentar novamente' });
    expect(retry).toHaveAttribute('aria-disabled', 'true');
    expect(retry).toHaveAccessibleDescription('Sem conexão');
    session.online = true;
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

describe('13.5-UNIT a failed thermo-hygrometer reading under its environment field', () => {
  const model = (): EnvDisplayModel => ({
    entries: new Map(),
    queued: { state: 'failed', photoId: PHOTO },
    tiles: [tileAged(0, { reading_status: 'failed' })],
    confirm: vi.fn(),
    type: vi.fn(),
    keepTyped: vi.fn(),
    openCrop: vi.fn(),
    viewer: null,
  });
  const field = { key: 'temperature_c', label: 'Temperatura', kind: 'number' } as unknown as Parameters<typeof envAfter>[1];
  const draw = (value: unknown, line: string | null = 'temperature_c') =>
    render(
      <SyncContext value={makeSyncState()}>
        <ToastProvider>
          <div className="field" data-field-key="temperature_c">
            <input aria-label="Temperatura" />
            {envAfter(model(), field, value, line)}
          </div>
        </ToastProvider>
      </SyncContext>,
    );

  it('shows under an empty field, "Digitar" focuses that field\'s input; a value hides it', async () => {
    const empty = draw(null);
    expect(screen.getByText('Não foi possível ler')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Digitar' }));
    expect(screen.getByRole('textbox', { name: 'Temperatura' })).toHaveFocus();
    empty.unmount();

    draw({ raw: '23.4', unit: '°C', state: 'measured' });
    expect(screen.queryByText('Não foi possível ler')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Digitar' })).toBeNull();
  });

  it('review F-08: a field that is not the photo\'s line field shows no line (one line per photo)', () => {
    draw(null, 'humidity_pct');
    expect(screen.queryByText('Não foi possível ler')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Digitar' })).toBeNull();
  });
});
