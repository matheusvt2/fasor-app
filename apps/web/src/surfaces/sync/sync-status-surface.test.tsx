import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from '../../test-axe.ts';
import { describe, expect, it } from 'vitest';
import { SyncContext, type SyncState } from '../../state/sync.tsx';
import { makeSyncState, type SyncStateOverrides } from '../../test/sync-state.ts';
import { SyncStatusSurface } from './sync-status-surface.tsx';

const state = (over: SyncStateOverrides = {}): SyncState =>
  makeSyncState({
    lastSyncAt: '2026-09-07T17:35:00.000Z',
    lastPushAt: [
      { user_id: 'u-bruno', device_id: 'tablet-1', at: '2026-09-07T17:32:00.000Z' },
      { user_id: 'u-eduardo', device_id: 'phone-2', at: '2026-09-06T21:10:00.000Z' },
    ],
    userNames: { 'u-bruno': 'Bruno' },
    ...over,
  });

const renderWith = (value: SyncState) =>
  render(
    <SyncContext value={value}>
      <SyncStatusSurface />
    </SyncContext>,
  );

describe('Sync status surface: server unreachable or session expired (retro U5)', () => {
  it('names the unreachable server under the "Sem conexão" headline, keeping the pending count', () => {
    const { container } = renderWith(
      state({
        badgeState: 'offline',
        unreachable: 'server',
        pendingText: '2 alterações',
        pendingCount: 2,
        counts: { pending: 2 },
      }),
    );
    expect(container.querySelector('.sh-state')).toHaveTextContent('Sem conexão');
    expect(container.querySelector('.sh-counts')).toHaveTextContent('2 alterações aguardando envio');
    expect(screen.getByTestId('sync-unreachable')).toHaveTextContent(
      'Não foi possível falar com o servidor. Tudo fica salvo neste aparelho.',
    );
  });

  it('names an expired session', () => {
    renderWith(state({ badgeState: 'offline', unreachable: 'session' }));
    expect(screen.getByTestId('sync-unreachable')).toHaveTextContent('Sua sessão expirou. Entre de novo para enviar.');
  });

  it('says nothing more when the server answered', () => {
    renderWith(state());
    expect(screen.queryByTestId('sync-unreachable')).toBeNull();
  });

  it('says nothing more when the device is simply offline', () => {
    renderWith(state({ online: false, badgeState: 'offline', unreachable: null }));
    expect(screen.queryByTestId('sync-unreachable')).toBeNull();
  });

  it('does not repeat a cause while the browser itself is offline', () => {
    renderWith(state({ online: false, badgeState: 'offline', unreachable: 'server' }));
    expect(screen.queryByTestId('sync-unreachable')).toBeNull();
  });
});

describe('Sync status surface', () => {
  it('renders the headline, the primary button and the mock sections when idle', async () => {
    const value = state();
    const { container } = renderWith(value);
    expect(screen.getByRole('heading', { level: 2, name: 'Sincronização' })).toBeInTheDocument();
    const headline = container.querySelector('.sync-headline')!;
    expect(headline).toHaveAttribute('data-tone', 'ok');
    expect(headline.querySelector('.sh-state')).toHaveTextContent('Sincronizado');
    expect(headline.querySelector('.sh-counts')).toHaveTextContent('Nada pendente neste aparelho.');

    const button = screen.getByRole('button', { name: 'Sincronizar agora' });
    expect(button).toHaveClass('btn', 'btn-primary');
    expect(button).not.toHaveAttribute('aria-disabled');
    await userEvent.click(button);
    expect(value.syncNow).toHaveBeenCalledTimes(1);

    // "Último envio": name from the local user rows, "Este aparelho" for this device, the id otherwise.
    expect(screen.getByRole('heading', { level: 2, name: 'Último envio' })).toBeInTheDocument();
    const rows = container.querySelectorAll('.sync-list .sync-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Bruno');
    expect(rows[0]).toHaveTextContent('Este aparelho');
    expect(rows[0]!.querySelector('time')).toHaveTextContent('07/09 14:32');
    expect(rows[1]).toHaveTextContent('u-eduardo');
    expect(rows[1]).toHaveTextContent('Outro aparelho');
    expect(container.querySelector('.sync-foot')).toHaveTextContent('Última sincronização 07/09 14:35');
    expect(screen.queryByText('Reenviar')).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('while a cycle runs the button is aria-disabled with "Sincronizando…" beside it and a tap is a no-op', async () => {
    const value = state({ running: true, badgeState: 'pending', pendingText: '3 fichas', counts: { pending: 3, sheets_pending: 3 } });
    const { container } = renderWith(value);
    const button = screen.getByRole('button', { name: 'Sincronizar agora' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription('Sincronizando…');
    expect(screen.getByText('Sincronizando…')).toHaveClass('btn-reason');
    await userEvent.click(button);
    expect(value.syncNow).not.toHaveBeenCalled();
    expect(container.querySelector('.sh-counts')).toHaveTextContent('3 fichas aguardando envio');
    expect(container.querySelector('.sync-headline')).toHaveAttribute('data-tone', 'pending');
  });

  it('offline the button is aria-disabled with "Sem conexão" beside it', () => {
    renderWith(state({ online: false, badgeState: 'offline' }));
    const button = screen.getByRole('button', { name: 'Sincronizar agora' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription('Sem conexão');
  });

  it('lists the rejected ops with "Reenviar", which resends and runs a cycle', async () => {
    const value = state({ badgeState: 'error', counts: { dead: 2, pending: 1 }, pendingText: '1 alteração', supersededCount: 3 });
    renderWith(value);
    const row = screen.getByTestId('sync-rejected-row');
    expect(row).toHaveTextContent('2 alterações rejeitadas');
    await userEvent.click(screen.getByRole('button', { name: 'Reenviar' }));
    expect(value.resendDead).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('sync-superseded-row')).toHaveTextContent('3 alterações mescladas pelo servidor');
  });

  it('10.1 lists one row per merge of the session with the kernel sentence', () => {
    const info = {
      op_id: '019966b0-0020-7000-8000-000000000001',
      over_op_id: '019966b0-0020-7000-8000-000000000002',
      relatorio_id: null,
      block_id: null,
      path: 'sheet/x',
      rule: 'nc_over_c' as const,
      standing: { value: 'NC', op_id: '019966b0-0020-7000-8000-000000000002', actor_id: 'u', client_ts: '2026-09-29T12:00:00.000Z' },
      overridden: null,
    };
    renderWith(state({ merges: [{ key: 'k', info, text: 'SEC-C12: item 10 NC de Eduardo (com foto) mesclado' }] }));
    const rows = screen.getAllByTestId('sync-merge-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.querySelector('.sr-primary')).toHaveTextContent('SEC-C12: item 10 NC de Eduardo (com foto) mesclado');
    expect(rows[0]).toHaveAttribute('data-rule', 'nc_over_c');
  });

  it('8.2 shows the "Leituras" rows from the counts, each only when it counts something', () => {
    const { rerender } = renderWith(state({ counts: { readings_queued: 2, suggestions_pending: 9 } }));
    const section = screen.getByTestId('sync-readings');
    expect(section.querySelector('h2')).toHaveTextContent('Leituras');
    expect(screen.getByTestId('sync-readings-queued')).toHaveTextContent('2 leituras na fila');
    expect(screen.getByTestId('sync-suggestions-pending')).toHaveTextContent('9 sugestões por confirmar');

    rerender(
      <SyncContext value={state({ counts: { readings_queued: 1, suggestions_pending: 0 } })}>
        <SyncStatusSurface />
      </SyncContext>,
    );
    expect(screen.getByTestId('sync-readings-queued')).toHaveTextContent('1 leitura na fila');
    expect(screen.queryByTestId('sync-suggestions-pending')).toBeNull();

    rerender(
      <SyncContext value={state()}>
        <SyncStatusSurface />
      </SyncContext>,
    );
    expect(screen.queryByTestId('sync-readings')).toBeNull();
  });

  it('uses the singular for one rejected op and says when nothing was ever synced', () => {
    const { container } = renderWith(state({ counts: { dead: 1 }, lastSyncAt: null, lastPushAt: [] }));
    expect(screen.getByTestId('sync-rejected-row')).toHaveTextContent('1 alteração rejeitada');
    expect(container.querySelector('.sync-foot')).toHaveTextContent('Ainda não sincronizado');
    expect(screen.getByText('Nenhum envio registrado ainda.')).toBeInTheDocument();
  });
});
