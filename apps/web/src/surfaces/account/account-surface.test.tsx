import 'fake-indexeddb/auto';
import { entityKey, type UserRow } from '@app/domain';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toRecord } from '../../db/commit.ts';
import { openDatabase } from '../../db/schema.ts';
import { ThemeProvider } from '../../state/theme.tsx';
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
    id: '0a000000-0000-7000-8000-0000000000a1',
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
  recoveryNeeded: false,
  dismissRecovery: vi.fn(),
};

/** The session the surface reads; a test that needs another one builds its own object. */
let session: SessionState = signedIn;

vi.mock('../../state/session.tsx', () => ({ useSession: () => session }));

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
  };
}

const renderAccount = (sync: SyncState) =>
  render(
    <MemoryRouter>
      <SyncContext value={sync}>
        <ThemeProvider>
          <AccountSurface />
        </ThemeProvider>
      </SyncContext>
    </MemoryRouter>,
  );

/** Replaces `navigator.storage` for one test; returns the undo. */
function stubStorage(estimate: (() => Promise<StorageEstimate>) | null): () => void {
  const original = Object.getOwnPropertyDescriptor(navigator, 'storage');
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: estimate === null ? undefined : { estimate },
  });
  return () => {
    if (original === undefined) Reflect.deleteProperty(navigator, 'storage');
    else Object.defineProperty(navigator, 'storage', original);
  };
}

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

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

describe('Account: Tema', () => {
  it('the visible .seg button carries aria-checked and the root element follows at once', async () => {
    const { container } = renderAccount(syncState('', 0));

    const group = screen.getByRole('radiogroup', { name: 'Tema' });
    expect(group).toHaveClass('segmented');
    expect(screen.getByRole('radio', { name: 'Sistema' })).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);

    await userEvent.click(screen.getByRole('radio', { name: 'Escuro' }));
    const dark = screen.getByRole('radio', { name: 'Escuro' });
    expect(dark).toHaveClass('seg');
    // The selector `components.css` styles is `.segmented .seg[aria-checked="true"]`.
    expect(container.querySelectorAll('.segmented .seg[aria-checked="true"]')).toHaveLength(1);
    expect(dark).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    await userEvent.click(screen.getByRole('radio', { name: 'Sistema' }));
    // "Sistema" removes the attribute so prefers-color-scheme decides again.
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('has no axe violations', async () => {
    const { container } = renderAccount(syncState('', 0));
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Account: Armazenamento', () => {
  it('renders the kernel storage line when the browser has an estimate', async () => {
    const undo = stubStorage(async () => ({ usage: 1_288_490_188 }));
    try {
      renderAccount(syncState('', 0));
      await waitFor(() =>
        expect(screen.getByTestId('storage-value')).toHaveTextContent('1,2 GB· 0 relatórios · 0 fotos'),
      );
      expect(screen.getByTestId('storage-value').querySelector('.sr-value.t-value')).toHaveTextContent('1,2 GB');
    } finally {
      undo();
    }
  });

  it('says so and does not throw when navigator.storage is absent', async () => {
    const undo = stubStorage(null);
    try {
      renderAccount(syncState('', 0));
      await waitFor(() =>
        expect(screen.getByTestId('storage-value')).toHaveTextContent('Indisponível neste navegador'),
      );
      expect(screen.getByRole('link', { name: 'Ver status de sincronização' })).toHaveAttribute('href', '/sync');
    } finally {
      undo();
    }
  });

  it('survives an estimate that rejects', async () => {
    const undo = stubStorage(async () => {
      throw new Error('denied');
    });
    try {
      renderAccount(syncState('', 0));
      await waitFor(() =>
        expect(screen.getByTestId('storage-value')).toHaveTextContent('Indisponível neste navegador'),
      );
    } finally {
      undo();
    }
  });
});

describe('Account: Registro profissional reads the device (retro A2)', () => {
  it('shows the kernel user row once the company pull has brought it, and the session profile until then', async () => {
    renderAccount(syncState('', 0));
    expect(screen.getByTestId('registration-row-value')).toHaveTextContent('CREA SP 1000000001 · Eng. Eletricista');
    cleanup();

    const db = openDatabase(signedIn.user!.id);
    await db.open();
    const row: UserRow = {
      id: signedIn.user!.id,
      name: 'Ana Alves',
      email: 'a@teste.local',
      council: 'crt',
      registration_number: 'SP 7777',
      title: 'Técnico(a) em Eletrotécnica',
      photo_location_enabled: false,
    };
    await db.entities.put(toRecord(entityKey('user', row.id), row));
    session = { ...signedIn, database: db };
    try {
      renderAccount(syncState('', 0));
      await waitFor(() =>
        expect(screen.getByTestId('registration-row-value')).toHaveTextContent('CRT SP 7777 · Técnico(a) em Eletrotécnica'),
      );
      // The dialog opens on what the row shows.
      await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
      expect(screen.getByLabelText('Número CRT')).toHaveValue('SP 7777');
    } finally {
      session = signedIn;
      db.close();
      await db.delete();
    }
  });
});
