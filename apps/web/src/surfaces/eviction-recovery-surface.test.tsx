import { PRODUTO } from '@app/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SessionState } from '../state/session.tsx';
import { SyncContext, type SyncState } from '../state/sync.tsx';
import { EvictionRecoverySurface } from './eviction-recovery-surface.tsx';

/*
 * Test 1.8-E2E-004's unit half (AD-8): "the app shows a one-time screen naming what the
 * server holds and re-pulls".
 */

const dismissRecovery = vi.fn();

const sessionState: SessionState = {
  status: 'signed-in',
  user: { id: 'u1', name: 'Bruno', email: 'b@teste.local', companyId: 'c1', companyName: 'E', council: null, registrationNumber: null, title: null },
  online: true,
  reAuthRequired: false,
  recoveryNeeded: true,
  database: null,
  signIn: vi.fn(),
  signOut: vi.fn(async () => {}),
  saveRegistration: vi.fn(async () => {}),
  dismissReAuth: vi.fn(),
  dismissRecovery,
};

vi.mock('../state/session.tsx', () => ({ useSession: () => sessionState }));

function syncState(over: Partial<SyncState> = {}): SyncState {
  return {
    counts: { pending: 0, sent: 0, dead: 0, sheets_pending: 0, photos_pending: 0 },
    badgeState: 'ok',
    pendingText: '',
    pendingCount: 0,
    online: true,
    running: false,
    outdated: false,
    lastResult: null,
    lastFailure: null,
    lastSyncAt: null,
    lastPushAt: [],
    supersededCount: 0,
    deviceId: 'tablet-1',
    userNames: {},
    summaryRelatorios: [],
    syncNow: vi.fn(async () => 'ran' as const),
    syncRelatorio: vi.fn(async () => 'ran' as const),
    resendDead: vi.fn(async () => {}),
    ...over,
  };
}

const summary = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `r${i}`,
    project_id: 'p1',
    status: 'rascunho' as const,
    template_id: null,
    seed_version: 'v1',
    updated_seq: i + 1,
  }));

function renderSurface(sync: SyncState = syncState()) {
  return render(
    <SyncContext value={sync}>
      <EvictionRecoverySurface />
    </SyncContext>,
  );
}

describe('EvictionRecoverySurface', () => {
  it('names what the server holds, in the product name, with no codename', () => {
    renderSurface(
      syncState({ summaryRelatorios: summary(3), userNames: { u1: 'Bruno', u2: 'Ana' } }),
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Dados deste aparelho foram apagados');
    expect(screen.getByText(new RegExp(PRODUTO))).toBeVisible();
    expect(screen.getByTestId('recovery-holds')).toHaveTextContent('O servidor tem 3 relatórios e 2 pessoas da equipe.');
  });

  it('uses the singular and, before the first pull, says nothing is known yet', () => {
    renderSurface(syncState({ summaryRelatorios: summary(1), userNames: { u1: 'Bruno' } }));
    expect(screen.getByTestId('recovery-holds')).toHaveTextContent('O servidor tem 1 relatório e 1 pessoa da equipe.');
    screen.getByTestId('recovery-holds');

    renderSurface();
    expect(screen.getAllByTestId('recovery-holds')[1]).toHaveTextContent(
      'Ainda não sabemos o que o servidor tem; baixe para descobrir.',
    );
  });

  it('the action runs one cycle and then dismisses the screen for good', async () => {
    const syncNow = vi.fn(async () => 'ran' as const);
    renderSurface(syncState({ syncNow }));
    await userEvent.click(screen.getByRole('button', { name: 'Baixar do servidor' }));
    expect(syncNow).toHaveBeenCalledTimes(1);
    expect(dismissRecovery).toHaveBeenCalledTimes(1);
  });

  it('keeps the screen with the failure text when the cycle did not run', async () => {
    dismissRecovery.mockClear();
    renderSurface(syncState({ syncNow: vi.fn(async () => 'paused' as const) }));
    await userEvent.click(screen.getByRole('button', { name: 'Baixar do servidor' }));
    expect(dismissRecovery).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Não foi possível baixar agora. Verifique a conexão e tente de novo.',
    );
  });

  // The engine answers `ran` even when both phases ended in a swallowed failure, so a
  // dead network would otherwise dismiss the one-time screen with nothing downloaded.
  it('keeps the screen when the cycle ran but the pull failed', async () => {
    dismissRecovery.mockClear();
    renderSurface(syncState({ syncNow: vi.fn(async () => 'ran' as const), lastFailure: { kind: 'network' } }));
    await userEvent.click(screen.getByRole('button', { name: 'Baixar do servidor' }));
    expect(dismissRecovery).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Não foi possível baixar agora. Verifique a conexão e tente de novo.',
    );
  });

  it('says nothing and dismisses nothing while the launch cycle is already running', async () => {
    dismissRecovery.mockClear();
    renderSurface(syncState({ syncNow: vi.fn(async () => 'busy' as const) }));
    await userEvent.click(screen.getByRole('button', { name: 'Baixar do servidor' }));
    expect(dismissRecovery).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('states why the action is unavailable offline', () => {
    renderSurface(syncState({ online: false }));
    const action = screen.getByRole('button', { name: 'Baixar do servidor' });
    expect(action).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Baixar precisa de conexão')).toBeVisible();
  });
});
