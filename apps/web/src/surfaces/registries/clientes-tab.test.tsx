import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copy } from '../../copy/pt-br.ts';
import { ToastProvider } from '../../state/toast.tsx';
import type { SessionState } from '../../state/session.tsx';
import { ClientesTab } from './clientes-tab.tsx';

const session: SessionState = {
  status: 'signed-in',
  user: {
    id: '0a000000-0000-7000-8000-0000000000a1',
    name: 'Ana Alves',
    email: 'a@teste.local',
    companyId: '0a000000-0000-7000-8000-00000000000a',
    companyName: 'Empresa A de Teste',
    council: null,
    registrationNumber: null,
    title: null,
  },
  online: true,
  reAuthRequired: false,
  database: null,
  signIn: vi.fn(),
  signOut: vi.fn(async () => {}),
  saveRegistration: vi.fn(async () => {}),
  dismissReAuth: vi.fn(),
  recoveryNeeded: false,
  dismissRecovery: vi.fn(),
};

vi.mock('../../state/session.tsx', () => ({ useSession: () => session }));

afterEach(cleanup);

describe('ClientesTab', () => {
  it('shows the empty state with one action and opens the panel for a new client from it', async () => {
    const user = userEvent.setup();
    const t = copy.registries.clientes;
    render(
      <ToastProvider>
        <ClientesTab />
      </ToastProvider>,
    );
    // One action on an empty registry, under its sentence (Epic 2 retro D-8).
    expect(screen.getByText(t.emptyText)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t.empty })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t.newClient })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: t.newClient })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: t.empty }));
    expect(screen.getByRole('heading', { name: t.newClient })).toBeInTheDocument();
  });
});
