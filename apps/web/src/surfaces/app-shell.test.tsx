import { PRODUTO } from '@app/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { DraftsContext, type DraftsState } from '../state/drafts.tsx';
import type { SessionState } from '../state/session.tsx';
import { SyncContext, type SyncState } from '../state/sync.tsx';
import { ToastProvider, useToast } from '../state/toast.tsx';
import { AppShell } from './app-shell.tsx';

/*
 * The shell renders the App bar, the one banner slot, the sync live region and the
 * toast outlet once for the whole app (AR-27). The title is the App bar's <h1>, taken
 * from the matched route's `handle`.
 */

let sessionState: SessionState = {
  status: 'signed-in',
  user: { id: 'u1', name: 'Bruno Matsui', email: 'b@teste.local', companyId: 'c1', companyName: 'Empresa', council: null, registrationNumber: null, title: null },
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
    ...over,
  };
}

function Screen({ label }: { label: string }) {
  const { showToast } = useToast();
  return (
    <main>
      <p>{label}</p>
      <button type="button" onClick={() => showToast('Uma mensagem')}>
        avisar
      </button>
    </main>
  );
}

const draftsState = (draftFound = false): DraftsState => ({
  draftFound,
  register: vi.fn(() => () => {}),
  persistAll: vi.fn(async () => {}),
});

function renderShell(sync: SyncState = syncState(), path = '/', drafts: DraftsState = draftsState()) {
  const router = createMemoryRouter(
    [
      {
        element: (
          <SyncContext value={sync}>
            <ToastProvider>
              <DraftsContext value={drafts}>
                <AppShell />
              </DraftsContext>
            </ToastProvider>
          </SyncContext>
        ),
        children: [
          { path: '/', element: <Screen label="home" />, handle: { title: 'Início', titleHidden: true } },
          { path: '/account', element: <Screen label="conta" />, handle: { title: 'Conta' } },
          { path: '/sync', element: <Screen label="sync" />, handle: { title: 'Sincronização' } },
        ],
      },
      { path: '/login', element: <p>login</p> },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

describe('AppShell app bar', () => {
  it('renders the wordmark, the route title, the badge and the avatar initial', () => {
    renderShell();
    expect(screen.getByRole('link', { name: `${PRODUTO} — início` })).toHaveTextContent(PRODUTO);
    const title = screen.getByRole('heading', { level: 1 });
    expect(title).toHaveTextContent('Início');
    // Home hides the title: the wordmark already names the page (`key-home.html`).
    expect(title).toHaveClass('app-bar-title', 'visually-hidden');
    expect(screen.getByTestId('sync-badge')).toHaveAttribute('data-state', 'ok');
    expect(screen.getByRole('link', { name: 'Conta' }).querySelector('.avatar')).toHaveTextContent('B');
  });

  it('shows the title on the other surfaces', () => {
    renderShell(syncState(), '/account');
    const title = screen.getByRole('heading', { level: 1, name: 'Conta' });
    expect(title).not.toHaveClass('visually-hidden');
  });

  it('there is exactly one level-1 heading and one badge in the tree', () => {
    const { container } = renderShell();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(container.querySelectorAll('.sync-badge')).toHaveLength(1);
  });

  it('the badge opens Sync status', async () => {
    renderShell();
    await userEvent.click(screen.getByRole('button', { name: 'Sincronização: sincronizado. Abrir status' }));
    expect(screen.getByText('sync')).toBeVisible();
  });
});

describe('AppShell banner slot, live region and toast', () => {
  it('renders the live region once and nothing else when all is well', () => {
    const { container } = renderShell();
    expect(screen.getByTestId('sync-announcer')).toHaveAttribute('role', 'status');
    expect(container.querySelector('.banner-slot')).toBeNull();
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('offline alone shows no banner (it is the toast and the badge)', () => {
    const { container } = renderShell(syncState({ online: false, badgeState: 'offline' }));
    expect(container.querySelector('.banner')).toBeNull();
    expect(screen.getByTestId('sync-badge')).toHaveAttribute('data-state', 'offline');
  });

  it('re-auth takes the slot and offline folds into the "+1" chip', async () => {
    sessionState = { ...sessionState, reAuthRequired: true };
    try {
      const { container } = renderShell(syncState({ online: false, badgeState: 'offline' }));
      expect(container.querySelectorAll('.banner')).toHaveLength(1);
      expect(container.querySelector('.banner')).toHaveAttribute('data-banner', 're-auth');
      expect(
        screen.getByRole('button', { name: '+1, outras condições — abrir status de sincronização' }),
      ).toHaveTextContent(
        '+1',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Entrar de novo' }));
    } finally {
      sessionState = { ...sessionState, reAuthRequired: false };
    }
  });

  it('a surface can raise a toast through the shell outlet', async () => {
    renderShell();
    await userEvent.click(screen.getByRole('button', { name: 'avisar' }));
    expect(screen.getByTestId('toast')).toHaveTextContent('Uma mensagem');
  });

  // FR-61: the offer itself is the persistent toast; this candidate exists so the
  // condition is counted when something above it holds the slot.
  it('a waiting draft is a banner condition, below re-auth', async () => {
    const { container } = renderShell(syncState(), '/', draftsState(true));
    expect(container.querySelector('.banner')).toHaveAttribute('data-banner', 'draft-found');

    sessionState = { ...sessionState, reAuthRequired: true };
    try {
      const withReAuth = renderShell(syncState(), '/', draftsState(true));
      expect(withReAuth.container.querySelector('.banner')).toHaveAttribute('data-banner', 're-auth');
      expect(
        withReAuth.getByRole('button', { name: '+1, outras condições — abrir status de sincronização' }),
      ).toHaveTextContent('+1');
    } finally {
      sessionState = { ...sessionState, reAuthRequired: false };
    }
  });
});
