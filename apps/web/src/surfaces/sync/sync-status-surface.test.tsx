import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from '../../test-axe.ts';
import { describe, expect, it, vi } from 'vitest';
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
    expect(container.querySelector('.sh-counts')).toHaveTextContent('2 alterações aguardando');
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
    expect(rows[0]!.querySelector('.sr-primary')).toHaveTextContent('Último envio de Bruno: 07/09 14:32');
    expect(rows[0]).toHaveTextContent('Este aparelho');
    expect(rows[1]!.querySelector('.sr-primary')).toHaveTextContent('Último envio de u-eduardo: 06/09 18:10');
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
    expect(container.querySelector('.sync-actions .btn-reason')).toHaveTextContent('Sincronizando…');
    await userEvent.click(button);
    expect(value.syncNow).not.toHaveBeenCalled();
    expect(container.querySelector('.sh-counts')).toHaveTextContent('3 fichas aguardando');
    expect(container.querySelector('.sync-headline')).toHaveAttribute('data-tone', 'pending');
    // F-14: the headline reads the same state as the button.
    expect(container.querySelector('.sh-state')).toHaveTextContent('Sincronizando…');
  });

  it('F-14: a background cycle with nothing pending never reads "Sincronizado" beside a disabled button; idle it does, with the button enabled', () => {
    const { container, unmount } = renderWith(state({ running: true }));
    expect(container.querySelector('.sh-state')).toHaveTextContent('Sincronizando…');
    expect(container.querySelector('.sh-state')).not.toHaveTextContent('Sincronizado');
    expect(screen.getByRole('button', { name: 'Sincronizar agora' })).toHaveAttribute('aria-disabled', 'true');
    unmount();
    const idle = renderWith(state());
    expect(idle.container.querySelector('.sh-state')).toHaveTextContent('Sincronizado');
    expect(screen.getByRole('button', { name: 'Sincronizar agora' })).not.toHaveAttribute('aria-disabled');
  });

  it('F-14: no device word is drawn while this device\'s id is still unknown; once known, its own row says "Este aparelho"', () => {
    const { container, unmount } = renderWith(state({ deviceId: null }));
    const rows = container.querySelectorAll('[data-testid="sync-last-send-row"]');
    expect(rows).toHaveLength(2);
    expect(container.querySelector('[data-testid="sync-last-send-row"] .sr-secondary')).toBeNull();
    expect(container).not.toHaveTextContent('Outro aparelho');
    unmount();
    const known = renderWith(state({ deviceId: 'tablet-1' }));
    expect(known.container.querySelectorAll('[data-testid="sync-last-send-row"]')[0]).toHaveTextContent('Este aparelho');
  });

  it('offline the button is aria-disabled with "Sem conexão" beside it', () => {
    renderWith(state({ online: false, badgeState: 'offline' }));
    const button = screen.getByRole('button', { name: 'Sincronizar agora' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription('Sem conexão');
  });

  it('lists the rejected ops with "Reenviar", which resends and runs a cycle', async () => {
    const value = state({ badgeState: 'error', counts: { dead: 2, pending: 1 }, pendingText: '1 alteração' });
    const { container } = renderWith(value);
    const row = screen.getByTestId('sync-rejected-row');
    expect(row).toHaveTextContent('2 alterações rejeitadas');
    await userEvent.click(screen.getByRole('button', { name: 'Reenviar' }));
    expect(value.resendDead).toHaveBeenCalledTimes(1);
    // E10-Q3: no "alterações mescladas pelo servidor" line; merges are only "Mesclado automaticamente" rows.
    expect(container).not.toHaveTextContent(/mesclad[ao]s? pelo servidor/);
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

describe('Sync status surface: the full 85-sync surface (Story 10.4)', () => {
  const full = (over: SyncStateOverrides = {}) =>
    state({
      badgeState: 'pending',
      counts: { pending: 4, sheets_pending: 2, photos_pending: 12, readings_queued: 1, suggestions_pending: 3, upload_errors: 1 },
      headline: '2 fichas e 12 fotos aguardando · 1 leitura na fila',
      summaryBadges: [
        { state: 'pending', text: '2 fichas e 12 fotos aguardando envio' },
        { state: 'error', text: '1 erro' },
        { state: 'ok', text: '3 leituras prontas · 1 na fila' },
      ],
      pendingSheets: [
        { block_id: 'b1', primary: 'SEC-C12 — Chave seccionadora', secondary: 'Alterada por Bruno · 07/09 14:31', state: 'sending', stateText: 'Enviando…' },
        { block_id: 'b2', primary: 'Chave seccionadora', secondary: 'Alterada por Bruno · 07/09 14:26', state: 'waiting', stateText: 'Aguardando envio' },
      ],
      uploads: {
        rows: [
          { id: 'f1', primary: 'Detalhe dos contatos', secondary: '07/09 14:30', state: 'pending' },
          { id: 'f2', primary: 'Detalhe do ensaio', secondary: '06/09 14:40', state: 'error' },
        ],
        more: 11,
      },
      readingsQueued: [{ id: 'f3', primary: 'Placa de identificação', secondary: '07/09 14:29', stateText: 'Leitura na fila' }],
      downloads: [{ relatorio_id: 'r1', primary: 'Porto Seguro · Oxigênio', secondary: 'Baixando… 12 de 30 fichas · 8 de 20 fotos', percent: 40, percentText: '40 %' }],
      decisions: [{ key: 'd1', kind: 'cell', text: 'SEC-C12: 1 célula em contradição' }],
      decisionCount: 1,
      retryUpload: vi.fn(async () => {}),
      ...over,
    });

  it('renders every section in the mock order with the kernel rows', () => {
    const { container } = renderWith(full());
    expect(container.querySelector('.sh-counts')).toHaveTextContent('2 fichas e 12 fotos aguardando · 1 leitura na fila');
    expect([...container.querySelectorAll('.sync-summary .sync-badge')].map((b) => [b.getAttribute('data-state'), b.textContent])).toEqual([
      ['pending', '2 fichas e 12 fotos aguardando envio'],
      ['error', '1 erro'],
      ['ok', '3 leituras prontas · 1 na fila'],
    ]);
    expect([...container.querySelectorAll('main h2')].map((h) => h.textContent)).toEqual([
      'Sincronização',
      'Leituras',
      'Enviando',
      'Baixando',
      'Último envio',
      'Decisões',
    ]);
    expect(screen.getByTestId('sync-reading-row')).toHaveTextContent('Placa de identificação');
    expect(screen.getByTestId('sync-reading-row').querySelector('.sr-state')).toHaveTextContent('Leitura na fila');
    const sheets = screen.getAllByTestId('sync-sheet-row');
    expect(sheets.map((row) => row.querySelector('.sr-state')!.textContent)).toEqual(['Enviando…', 'Aguardando envio']);
    expect(screen.getByText('Fichas (2)')).toHaveClass('field-label');
    expect(screen.getByText('Fotos (13)')).toHaveClass('field-label');
    expect(screen.getAllByTestId('sync-photo-row')[0]!.querySelector('.upload-pill')).toHaveTextContent('Aguardando envio');
    expect(screen.getByTestId('sync-photo-more')).toHaveTextContent('+ 11 fotos aguardando envio');
    const download = screen.getByTestId('sync-download-row');
    expect(download.querySelector('.sr-secondary')).toHaveTextContent('Baixando… 12 de 30 fichas · 8 de 20 fotos');
    expect(download.querySelector('.sr-state')).toHaveTextContent('40 %');
    expect(download.querySelector('.progress-track > i')).toHaveStyle({ width: '40%' });
    const decisions = screen.getByTestId('sync-decisions');
    expect(decisions.querySelector('.section-head .sync-badge')).toHaveTextContent('1 aguarda decisão');
    expect(screen.getByTestId('sync-decision-row')).toHaveAttribute('data-variant', 'conflict');
  });

  it('the error pill retries that photo', async () => {
    const value = full();
    renderWith(value);
    await userEvent.click(screen.getByRole('button', { name: 'Erro — Tentar novamente' }));
    expect(value.retryUpload).toHaveBeenCalledWith('f2');
  });

  it('the merge rows sit under "Mesclado automaticamente" with the rule words and "Mesclado"', () => {
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
    renderWith(state({ merges: [{ key: 'k', info, text: 'SEC-C12: item 10 NC de Eduardo (com foto) mesclado', secondary: '29/09 09:00 · NC vence C' }] }));
    const section = screen.getByTestId('sync-decisions');
    expect(section).toHaveTextContent('Mesclado automaticamente');
    expect(section.querySelector('.section-head .sync-badge')).toBeNull();
    const row = screen.getByTestId('sync-merge-row');
    expect(row.querySelector('.sr-secondary')).toHaveTextContent('29/09 09:00 · NC vence C');
    expect(row.querySelector('.sr-state')).toHaveTextContent('Mesclado');
  });

  it('hides the sections with nothing to list, and "Decisões" with neither decisions nor merges', () => {
    renderWith(state());
    for (const id of ['sync-sending', 'sync-downloading', 'sync-decisions', 'sync-readings', 'sync-summary']) expect(screen.queryByTestId(id)).toBeNull();
  });

  it('has no live region and keeps the explanations behind the collapsed "Como funciona a mesclagem"', async () => {
    const { container } = renderWith(full());
    const main = container.querySelector('main[data-route="/sync"]')!;
    expect(main.querySelectorAll('[aria-live], [role="status"], [role="alert"]')).toHaveLength(0);
    const details = main.querySelector('details.sync-how')!;
    expect(details).not.toHaveAttribute('open');
    const summary = details.querySelector('summary.sh-how')!;
    expect(summary).toHaveTextContent('Como funciona a mesclagem');
    await userEvent.click(summary);
    expect(details).toHaveAttribute('open');
    expect(details.querySelector('.how-body')).toHaveTextContent('NC vence C.');
    expect(await axe(container)).toHaveNoViolations();
  });
});
