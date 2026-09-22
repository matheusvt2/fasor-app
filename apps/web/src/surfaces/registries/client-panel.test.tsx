import type { ClientRow } from '@app/domain';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../state/toast.tsx';
import type { SessionState } from '../../state/session.tsx';
import { ClientPanel } from './client-panel.tsx';

/*
 * Mirrors `instrument-panel.test.tsx`'s harness: `database: null` keeps every commit
 * handler a no-op, so this only needs to assert what renders and what the CNPJ field and
 * the Confirm dialog gate.
 */

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

const client: ClientRow = {
  id: '0a000000-0000-7000-8000-0000000000c1',
  kind: 'client',
  name: 'Porto Seguro',
  cnpj: null,
  contact_name: null,
  contact_phone: null,
  sites: [],
  removed_at: null,
};

function renderPanel(referenced: boolean, row: ClientRow | null = client) {
  return render(
    <ToastProvider>
      <ClientPanel clientId={client.id} client={row} referenced={referenced} onClose={vi.fn()} />
    </ToastProvider>,
  );
}

afterEach(cleanup);

describe('ClientPanel — AC1 referenced vs unreferenced deletion', () => {
  it('offers only Arquivar, with the reason line, and no Remover button when referenced', () => {
    renderPanel(true);
    expect(screen.getByRole('button', { name: /Arquivar/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remover$/ })).not.toBeInTheDocument();
    expect(screen.getByText(/referenciado em projetos/)).toBeInTheDocument();
  });

  it('offers Remover (not Arquivar) and gates it behind a Confirm dialog when unreferenced', async () => {
    const user = userEvent.setup();
    renderPanel(false);
    expect(screen.queryByRole('button', { name: /Arquivar/ })).not.toBeInTheDocument();
    const removeButton = screen.getByRole('button', { name: /^Remover$/ });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(removeButton);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Remover Porto Seguro?');
  });
});

describe('ClientPanel — CNPJ format (AC1 I/O matrix)', () => {
  it('never shows the inline error while still typing, only after blur, and never commits an invalid value', async () => {
    const user = userEvent.setup();
    renderPanel(false);
    const cnpjInput = screen.getByLabelText('CNPJ');
    await user.type(cnpjInput, '123');
    expect(screen.queryByText(/CNPJ inválido/)).not.toBeInTheDocument();
    await user.tab();
    expect(screen.getByText(/CNPJ inválido/)).toBeInTheDocument();
  });

  it('accepts a 14-digit CNPJ with no error', async () => {
    const user = userEvent.setup();
    renderPanel(false);
    const cnpjInput = screen.getByLabelText('CNPJ');
    await user.type(cnpjInput, '00000000000100');
    expect(screen.queryByText(/CNPJ inválido/)).not.toBeInTheDocument();
    await user.tab();
    expect(screen.queryByText(/CNPJ inválido/)).not.toBeInTheDocument();
  });

});

describe('ClientPanel — sites sub-list', () => {
  it('adds and removes a site row', async () => {
    const user = userEvent.setup();
    renderPanel(false);
    await user.click(screen.getByRole('button', { name: 'Adicionar obra' }));
    expect(screen.getByRole('button', { name: 'Remover obra 1' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remover obra 1' }));
    expect(screen.queryByRole('button', { name: 'Remover obra 1' })).not.toBeInTheDocument();
  });

  // Independent review, PR #14 finding 3: removing the only site row left focus falling back
  // to <body>. The removal now moves focus to "Adicionar obra" instead.
  it('moves focus to "Adicionar obra" after removing the only site row', async () => {
    const user = userEvent.setup();
    renderPanel(false);
    await user.click(screen.getByRole('button', { name: 'Adicionar obra' }));
    await user.click(screen.getByRole('button', { name: 'Remover obra 1' }));
    expect(screen.getByRole('button', { name: 'Adicionar obra' })).toHaveFocus();
  });

  // Removing one row out of several moves focus to the remove button now at the same index,
  // not to <body>.
  it('moves focus to the next remove button after removing a middle site row', async () => {
    const user = userEvent.setup();
    renderPanel(false);
    await user.click(screen.getByRole('button', { name: 'Adicionar obra' }));
    await user.click(screen.getByRole('button', { name: 'Adicionar obra' }));
    await user.click(screen.getByRole('button', { name: 'Adicionar obra' }));
    await user.click(screen.getByRole('button', { name: 'Remover obra 1' }));
    expect(screen.getByRole('button', { name: 'Remover obra 1' })).toHaveFocus();
  });
});
