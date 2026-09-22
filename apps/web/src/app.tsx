import { createBrowserRouter, Navigate, Outlet, RouterProvider, type RouteObject } from 'react-router';
import { copy } from './copy/pt-br.ts';
import { DraftProvider } from './state/drafts.tsx';
import { SessionProvider, useSession } from './state/session.tsx';
import { SyncProvider, useSync } from './state/sync.tsx';
import { ThemeProvider } from './state/theme.tsx';
import { ToastProvider } from './state/toast.tsx';
import { useShellUpdate } from './sw/use-shell-update.ts';
import { AppShell } from './surfaces/app-shell.tsx';
import { AccountSurface } from './surfaces/account/account-surface.tsx';
import { ContractOutdatedSurface } from './surfaces/contract-outdated-surface.tsx';
import { EvictionRecoverySurface } from './surfaces/eviction-recovery-surface.tsx';
import { FieldFixtureSurface } from './surfaces/fixtures/field-fixture-surface.tsx';
import { HomeSurface } from './surfaces/home/home-surface.tsx';
import { LoginSurface } from './surfaces/login/login-surface.tsx';
import { RegistriesSurface } from './surfaces/registries/registries-surface.tsx';
import { SyncStatusSurface } from './surfaces/sync/sync-status-surface.tsx';

/** While the cookie is being read, render nothing decisive: never flash Login. */
function Booting() {
  return (
    <main className="screen">
      <div className="content">
        <p className="section-note" role="status">
          {copy.common.loading}
        </p>
      </div>
    </main>
  );
}

/**
 * The shell, or one of the two full-surface states that replace it: the "Atualizar"
 * screen while a pull answered 426 (AD-13), and the one-time eviction recovery when the
 * cookie outlived the device store (AD-8). This is also the launch that promotes a
 * waiting shell when the outbox is empty.
 */
function SessionShell() {
  const session = useSession();
  const sync = useSync();
  useShellUpdate(session.database);
  if (sync.outdated) return <ContractOutdatedSurface />;
  if (session.recoveryNeeded) return <EvictionRecoverySurface />;
  return <AppShell />;
}

/** Unauthenticated routes redirect to /login; a session gets the sync engine and the shell. */
function RequireSession() {
  const session = useSession();
  if (session.status === 'booting') return <Booting />;
  if (session.status === 'signed-out') return <Navigate to="/login" replace />;
  return (
    <SyncProvider>
      <ThemeProvider>
        <ToastProvider>
          <DraftProvider>
            <SessionShell />
          </DraftProvider>
        </ToastProvider>
      </ThemeProvider>
    </SyncProvider>
  );
}

/**
 * An authenticated visit to /login goes back to Home — unless the server has already
 * dropped the session, in which case "Entrar de novo" must be able to land here while
 * the local data stays where it is.
 */
function LoginRoute() {
  const session = useSession();
  if (session.status === 'booting') return <Booting />;
  if (session.status === 'signed-in' && !session.reAuthRequired) return <Navigate to="/" replace />;
  return <LoginSurface />;
}

/**
 * The dev-only field fixture the durability scenarios drive (no sheet surface exists
 * before Epic 5). `import.meta.env.DEV` is statically replaced at build time, so the
 * route and the surface are tree-shaken out of a production bundle.
 */
const fixtureRoutes: RouteObject[] = import.meta.env.DEV
  ? [{ path: '/__fixture/field', element: <FieldFixtureSurface />, handle: { title: 'Campo de teste' } }]
  : [];

const router = createBrowserRouter([
  {
    element: (
      <SessionProvider>
        <div className="app-root">
          <Outlet />
        </div>
      </SessionProvider>
    ),
    children: [
      { path: '/login', element: <LoginRoute /> },
      {
        element: <RequireSession />,
        children: [
          // `handle.title` is the App bar's <h1>; Home hides it because the wordmark
          // already names the page (`key-home.html`).
          { path: '/', element: <HomeSurface />, handle: { title: copy.home.title, titleHidden: true } },
          { path: '/account', element: <AccountSurface />, handle: { title: copy.account.title } },
          { path: '/sync', element: <SyncStatusSurface />, handle: { title: copy.sync.title } },
          { path: '/cadastros', element: <RegistriesSurface />, handle: { title: copy.registries.title } },
          ...fixtureRoutes,
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
