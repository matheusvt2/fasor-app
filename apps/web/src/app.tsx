import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router';
import { copy } from './copy/pt-br.ts';
import { SessionProvider, useSession } from './state/session.tsx';
import { AppShell } from './surfaces/app-shell.tsx';
import { AccountSurface } from './surfaces/account/account-surface.tsx';
import { HomeSurface } from './surfaces/home/home-surface.tsx';
import { LoginSurface } from './surfaces/login/login-surface.tsx';

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

/** Unauthenticated routes redirect to /login. */
function RequireSession() {
  const session = useSession();
  if (session.status === 'booting') return <Booting />;
  if (session.status === 'signed-out') return <Navigate to="/login" replace />;
  return <AppShell />;
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
          { path: '/', element: <HomeSurface /> },
          { path: '/account', element: <AccountSurface /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
