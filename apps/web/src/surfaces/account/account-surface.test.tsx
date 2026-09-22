import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { SessionState } from '../../state/session.tsx';
import { SyncContext, type SyncState } from '../../state/sync.tsx';
import { AccountSurface } from './account-surface.tsx';

/*
 * The "Sign out with pending work" row of the Story 1.5 matrix: the "Sair" reason and the
 * Confirm dialog carry the kernel's pending summary, and with nothing pending the Story
 * 1.3 wording is back. The session is mocked at the module (its context is private), the
 * sync state through its exported context.
 */

const signedIn: SessionState = {
  status: 'signed-in',
  user: {
    id: 'seed-user-a-teste-local',
    name: 'Ana Alves',
    email: 'a@teste.local',
    companyId: '0a000000-0000-7000-8000-00000000000a',
    companyName: 'Empresa A de Teste',
    council: 'crea',
    registrationNumber: 'SP 1000000001',
    title: 'Eng. Eletricista',
  },
  online: true,
  reAuthRequired: false,
  database: null,
  signIn: vi.fn(),
  signOut: vi.fn(async () => {}),
  saveRegistration: vi.fn(async () => {}),
  dismissReAuth: vi.fn(),
};

vi.mock('../../state/session.tsx', () => ({ useSession: () => signedIn }));

function syncState(pendingText: string, pendingCount: number): SyncState {
  return {
    counts: { pending: pendingCount, sent: 0, dead: 0, sheets_pending: pendingCount, photos_pending: 0 },
    badgeState: pendingCount > 0 ? 'pending' : 'ok',
    pendingText,
    pendingCount,
    online: true,
    running: false,
    outdated: false,
    lastResult: 'ran',
    lastSyncAt: null,
    lastPushAt: [],
    supersededCount: 0,
    deviceId: 'tablet-1',
    userNames: {},
    syncNow: vi.fn(async () => 'ran' as const),
    resendDead: vi.fn(async () => {}),
  };
}

const renderAccount = (sync: SyncState) =>
  render(
    <MemoryRouter>
      <SyncContext value={sync}>
        <AccountSurface />
      </SyncContext>
    </MemoryRouter>,
  );

describe('Account: sign out with pending work', () => {
  it('with 3 fichas pending, the Sair reason and the Confirm dialog carry the pending summary', async () => {
    renderAccount(syncState('3 fichas', 3));

    expect(screen.getByTestId('account-pending-value')).toHaveTextContent('3 fichas aguardando envio');
    expect(screen.getByRole('link', { name: 'Ver status de sincronização' })).toHaveAttribute('href', '/sync');

    const sair = screen.getByRole('button', { name: 'Sair' });
    expect(sair).toHaveAccessibleDescription(
      '3 fichas aguardando envio. Sair antes do envio pede confirmação; nada é apagado deste aparelho.',
    );
    await userEvent.click(sair);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName('Sair com envios pendentes?');
    expect(dialog).toHaveAccessibleDescription(
      '3 fichas ainda não foram enviadas. Elas continuam neste aparelho e sobem quando você entrar de novo com conexão.',
    );
    expect(screen.getByRole('button', { name: 'Sair mesmo assim' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('with nothing pending, the Story 1.3 wording is back', async () => {
    renderAccount(syncState('', 0));

    expect(screen.getByTestId('account-pending-value')).toHaveTextContent('Nada aguardando envio');

    const sair = screen.getByRole('button', { name: 'Sair' });
    expect(sair).toHaveAccessibleDescription('Sair antes do envio pede confirmação; nada é apagado deste aparelho.');
    await userEvent.click(sair);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName('Sair desta conta?');
    expect(dialog).toHaveAccessibleDescription(
      'Nada é apagado deste aparelho. O que estiver aqui continua aqui e sobe quando você entrar de novo com conexão.',
    );
    expect(screen.getByRole('button', { name: 'Sair mesmo assim' })).toBeInTheDocument();
  });

  it('uses the singular sentence for one pending item', async () => {
    renderAccount(syncState('1 ficha', 1));
    await userEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
      '1 ficha ainda não foi enviada. Ela continua neste aparelho e sobe quando você entrar de novo com conexão.',
    );
  });
});
