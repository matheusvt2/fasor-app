import { avatarInitial, PRODUTO, unsyncedForDays } from '@app/domain';
import { useEffect } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { Link, Outlet, useLocation, useMatches, useNavigate, useParams } from 'react-router';
import { now } from '../clock.ts';
import { SyncAnnouncer } from '../components/sync-announcer.tsx';
import { SyncBadge, TextButton } from '../components/index.ts';
import { copy } from '../copy/pt-br.ts';
import { ui } from '../copy/ui.ts';
import { oldestPendingClientTs } from '../db/commit.ts';
import { useLiveQuery } from '../db/live.ts';
import { useBackTargetValue } from '../state/back-target.tsx';
import { BannerSlot, bannerCandidates } from '../state/banner-slot.tsx';
import { useExtraBannerValue } from '../state/extra-banner.tsx';
import { useSession } from '../state/session.tsx';
import { useSync } from '../state/sync.tsx';
import { ToastOutlet } from '../state/toast.tsx';

/** The surface title the App bar shows; `titleHidden` is `key-home.html`'s Home rule. */
export interface RouteTitle {
  title: string;
  titleHidden?: boolean;
  /**
   * Where the App bar's back button goes: one level up (Home when omitted), as a route or
   * as a function of the route params (`/relatorio/:id/setup` goes back to `/relatorio/:id`).
   * A surface whose parent only its data names (the Sumário's project) sets it through
   * `useBackTarget` instead.
   */
  back?: string | ((params: Record<string, string | undefined>) => string);
}

/** The document title of a route: "Conta · PRODUTO", or the product name alone on Home. */
export function documentTitle(handle: RouteTitle | undefined): string {
  if (handle === undefined || handle.titleHidden === true || handle.title === '') return PRODUTO;
  return `${handle.title} · ${PRODUTO}`;
}

/**
 * The App bar (`shell-head.html`), the one banner slot, the sync live region and the
 * toast outlet — each rendered once for the whole app (AR-27).
 *
 * The surface title is the App bar's `<h1>`, not the screen's: `key-home.html` puts it
 * there and marks it `visually-hidden` on Home, where the wordmark already names the
 * page. Each route declares it through `handle`, which also names the browser tab
 * (WCAG 2.4.2).
 *
 * The left of the App bar is the wordmark on Home and the back `.icon-btn` "Voltar"
 * everywhere else (`MOCK-GUIDE.md` › App bar, `key-account.html`). Back goes to Home, not
 * to the browser history: a deep link opened cold has no history, and Account and Sync
 * status are one level below Home (EXPERIENCE.md: "Back returns one level").
 */
export function AppShell() {
  const session = useSession();
  const sync = useSync();
  const navigate = useNavigate();
  const matches = useMatches();
  const location = useLocation();
  const params = useParams();
  const backTarget = useBackTargetValue();
  const extraBanner = useExtraBannerValue();
  const isHome = location.pathname === '/';
  const db = session.database;

  // AD-8: the oldest op still on its way to the server. The kernel decides whether five
  // days have passed; the shell only reads the store and renders the answer.
  const oldest = useLiveQuery(
    () => (db === null ? Promise.resolve(null) : oldestPendingClientTs(db)),
    [db],
    null,
  );

  const handle = [...matches].reverse().find((match) => match.handle !== undefined)?.handle as
    | RouteTitle
    | undefined;
  const title = handle?.title ?? '';
  const tabTitle = documentTitle(handle);
  const routeBack = typeof handle?.back === 'function' ? handle.back(params) : handle?.back;
  const back = backTarget ?? routeBack ?? '/';

  useEffect(() => {
    document.title = tabTitle;
  }, [tabTitle]);

  const banners = bannerCandidates({
    reAuthRequired: session.reAuthRequired,
    online: sync.online,
    unsyncedForDays: unsyncedForDays(oldest, now()),
    extra: extraBanner === null ? undefined : [extraBanner],
    reAuthAction: (
      // The flag stays set until a sign-in clears it, so /login does not bounce straight
      // back to Home.
      <TextButton onPress={() => void navigate('/login')}>{copy.banner.reAuthAction}</TextButton>
    ),
  });

  return (
    <>
      <header className="app-bar">
        <span className="app-bar-left">
          {isHome ? (
            <Link className="wordmark" to="/" aria-label={copy.home.wordmarkLabel(PRODUTO)} aria-current="page">
              {PRODUTO}
            </Link>
          ) : (
            <AriaButton className="icon-btn" aria-label={ui.appBar.back} onPress={() => void navigate(back)}>
              <svg className="ico" aria-hidden="true">
                <use href="/sprite.svg#i-back" />
              </svg>
            </AriaButton>
          )}
        </span>
        <h1 className={handle?.titleHidden ? 'app-bar-title visually-hidden' : 'app-bar-title'}>{title}</h1>
        <span className="app-bar-right">
          <SyncBadge state={sync.badgeState} counts={sync.counts} onPress={() => void navigate('/sync')} />
          <Link
            className="avatar-btn"
            to="/account"
            aria-label={copy.home.accountLink}
            aria-current={location.pathname === '/account' ? 'page' : undefined}
          >
            <span className="avatar" aria-hidden="true">
              {avatarInitial(session.user?.name ?? '')}
            </span>
          </Link>
        </span>
      </header>
      <SyncAnnouncer state={sync.badgeState} counts={sync.counts} />
      <BannerSlot banners={banners} onOpenSync={() => void navigate('/sync')} />
      <Outlet />
      <ToastOutlet />
    </>
  );
}
