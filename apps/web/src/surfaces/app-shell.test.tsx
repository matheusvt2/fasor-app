import { PRODUTO } from '@app/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { DraftsContext, type DraftsState } from '../state/drafts.tsx';
import type { SessionState } from '../state/session.tsx';
import { SyncContext, type SyncState } from '../state/sync.tsx';
import { makeSyncState } from '../test/sync-state.ts';
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

const syncState = (over: Partial<SyncState> = {}): SyncState => makeSyncState(over);

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

  it('names the browser tab per route (WCAG 2.4.2): the product alone on Home (retro U8)', () => {
    const home = renderShell();
    expect(document.title).toBe('PRODUTO');
    home.unmount();
    const account = renderShell(syncState(), '/account');
    expect(document.title).toBe('Conta · PRODUTO');
    account.unmount();
    renderShell(syncState(), '/sync');
    expect(document.title).toBe('Sincronização · PRODUTO');
  });

  it('Home has the wordmark and no back button; Account and Sync have "Voltar", which goes Home (retro U8)', async () => {
    const home = renderShell();
    expect(screen.queryByRole('button', { name: 'Voltar' })).toBeNull();
    expect(screen.getByRole('link', { name: `${PRODUTO} — início` })).toHaveAttribute('aria-current', 'page');
    home.unmount();

    for (const path of ['/account', '/sync']) {
      const view = renderShell(syncState(), path);
      const back = screen.getByRole('button', { name: 'Voltar' });
      expect(back).toHaveClass('icon-btn');
      expect(back.querySelector('use')).toHaveAttribute('href', '/sprite.svg#i-back');
      await userEvent.click(back);
      expect(screen.getByText('home')).toBeVisible();
      view.unmount();
    }
  });

  it('the avatar marks Account as the current page there', () => {
    renderShell(syncState(), '/account');
    expect(screen.getByRole('link', { name: 'Conta' })).toHaveAttribute('aria-current', 'page');
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

  // FR-61, retro U7: the offer is the persistent toast alone; no banner repeats it.
  it('a waiting draft raises no banner', () => {
    const { container } = renderShell(syncState(), '/', draftsState(true));
    expect(container.querySelector('.banner')).toBeNull();
  });
});
