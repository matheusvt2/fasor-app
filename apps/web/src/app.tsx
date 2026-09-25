import { I18nProvider } from 'react-aria-components';
import { createBrowserRouter, Navigate, Outlet, RouterProvider, type RouteObject } from 'react-router';
import { copy } from './copy/pt-br.ts';
import { BackTargetProvider } from './state/back-target.tsx';
import { DraftProvider } from './state/drafts.tsx';
import { ExtraBannerProvider } from './state/extra-banner.tsx';
import { PageTitleProvider } from './state/page-title.tsx';
import { SessionProvider, useSession } from './state/session.tsx';
import { SyncProvider, useSync } from './state/sync.tsx';
import { ThemeProvider } from './state/theme.tsx';
import { ToastProvider } from './state/toast.tsx';
import { useShellUpdate } from './sw/use-shell-update.ts';
import { AppShell } from './surfaces/app-shell.tsx';
import { AccountSurface } from './surfaces/account/account-surface.tsx';
import { ContractOutdatedSurface } from './surfaces/contract-outdated-surface.tsx';
import { EvictionRecoverySurface } from './surfaces/eviction-recovery-surface.tsx';
import { FichaSurface } from './surfaces/ficha/ficha-surface.tsx';
import { FieldFixtureSurface } from './surfaces/fixtures/field-fixture-surface.tsx';
import { HomeSurface } from './surfaces/home/home-surface.tsx';
import { LoginSurface } from './surfaces/login/login-surface.tsx';
import { PointsSurface } from './surfaces/points/points-surface.tsx';
import { ProjectSurface } from './surfaces/project/project-surface.tsx';
import { SectionTextSurface } from './surfaces/relatorio/section-text-surface.tsx';
import { SetupSurface } from './surfaces/relatorio/setup-surface.tsx';
import { SumarioSurface } from './surfaces/relatorio/sumario-surface.tsx';
import { TreeSurface } from './surfaces/relatorio/tree-surface.tsx';
import { RegistriesSurface } from './surfaces/registries/registries-surface.tsx';
import { SyncStatusSurface } from './surfaces/sync/sync-status-surface.tsx';
import { TemplateComposerSurface } from './surfaces/templates/template-composer.tsx';
import { TemplatesSurface } from './surfaces/templates/templates-surface.tsx';
import { GallerySurface } from './surfaces/photos/gallery-surface.tsx';

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
            <BackTargetProvider>
              <PageTitleProvider>
                <ExtraBannerProvider>
                  <SessionShell />
                </ExtraBannerProvider>
              </PageTitleProvider>
            </BackTargetProvider>
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
          { path: '/templates', element: <TemplatesSurface />, handle: { title: copy.templates.title } },
          {
            path: '/templates/:id',
            element: <TemplateComposerSurface />,
            handle: { title: copy.composer.title, back: '/templates' },
          },
          // Story 4.1 and 4.3: the Project, the Sumário and the two routes the Sumário
          // opens (batch C's setup page and section text keep these paths).
          { path: '/project/:id', element: <ProjectSurface />, handle: { title: copy.project.title, back: '/' } },
          { path: '/relatorio/:id', element: <SumarioSurface />, handle: { title: copy.sumario.title } },
          {
            path: '/relatorio/:id/setup',
            element: <SetupSurface />,
            handle: { title: copy.setup.heading, back: (params: Record<string, string | undefined>) => `/relatorio/${params.id ?? ''}` },
          },
          // Story 4.4: the tree's rail presentation, until Epic 5 mounts it inside a sheet.
          {
            path: '/relatorio/:id/arvore',
            element: <TreeSurface />,
            handle: { title: copy.sumario.rail.title, back: (params: Record<string, string | undefined>) => `/relatorio/${params.id ?? ''}` },
          },
          // Story 5.1: the equipment sheet, keyed by block id (a TAG rename keeps the address).
          // Its App bar title is the TAG, which the surface sets (`usePageTitle`).
          {
            path: '/relatorio/:id/ficha/:blockId',
            element: <FichaSurface />,
            // Story 12.2 (D-8): from 768 px the sheet goes back to the Sumário, section 9
            // open and its row focused; the phone keeps the tree surface.
            handle: {
              title: '',
              back: (params: Record<string, string | undefined>) => `/relatorio/${params.id ?? ''}/arvore`,
              backWide: (params: Record<string, string | undefined>) => ({
                to: `/relatorio/${params.id ?? ''}`,
                state: { openSection9: true, focusBlockId: params.blockId ?? null },
              }),
            },
          },
          // Story 6.3: the gallery, reached from Sumário row 7.
          {
            path: '/relatorio/:id/fotos',
            element: <GallerySurface />,
            handle: { title: copy.gallery.title, back: (params: Record<string, string | undefined>) => `/relatorio/${params.id ?? ''}` },
          },
          // Story 6.6: section 8, opened from Sumário row 8.
          {
            path: '/relatorio/:id/pontos',
            element: <PointsSurface />,
            handle: { title: copy.points.title, back: (params: Record<string, string | undefined>) => `/relatorio/${params.id ?? ''}` },
          },
          {
            path: '/relatorio/:id/secao/:blockId',
            element: <SectionTextSurface />,
            handle: { title: copy.sectionText.title, back: (params: Record<string, string | undefined>) => `/relatorio/${params.id ?? ''}` },
          },
          ...fixtureRoutes,
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

/** pt-BR orders the date field's segments (day, month, year) and names them. */
export function App() {
  return (
    <I18nProvider locale="pt-BR">
      <RouterProvider router={router} />
    </I18nProvider>
  );
}
