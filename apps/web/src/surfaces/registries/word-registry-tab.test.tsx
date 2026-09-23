import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copy } from '../../copy/pt-br.ts';
import { ToastProvider } from '../../state/toast.tsx';
import type { SessionState } from '../../state/session.tsx';
import { WordRegistryTab } from './word-registry-tab.tsx';

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

describe('WordRegistryTab', () => {
  it('shows the empty state and opens the panel when the toolbar button is pressed', async () => {
    const user = userEvent.setup();
    const t = copy.registries.fabricantes;
    render(
      <ToastProvider>
        <WordRegistryTab
          kind="manufacturer"
          listLabel={copy.registries.tabFabricantes}
          newRowButton={t.newRow}
          empty={t.empty}
          emptyText={t.emptyText}
          note={t.note}
          copy={t.panel}
        />
      </ToastProvider>,
    );
    // One action on an empty registry, under its sentence (Epic 2 retro D-8).
    expect(screen.getByText(t.emptyText)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t.empty })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t.newRow })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: t.panel.newRow })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: t.empty }));
    expect(screen.getByRole('heading', { name: t.panel.newRow })).toBeInTheDocument();
  });
});
