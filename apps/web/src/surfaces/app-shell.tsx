import { avatarInitial, PRODUTO, unsyncedForDays } from '@app/domain';
import { useEffect, useRef } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { Link, Outlet, useLocation, useMatches, useNavigate, useParams } from 'react-router';
import { now } from '../clock.ts';
import { SyncAnnouncer } from '../components/sync-announcer.tsx';
import { SyncBadge, TextButton } from '../components/index.ts';
import { copy } from '../copy/pt-br.ts';
import { ui } from '../copy/ui.ts';
import { oldestPendingClientTs } from '../db/commit.ts';
import { useLiveQuery } from '../db/live.ts';
import { returnToOrigin, useEntryOrigins } from '../state/history-return.ts';
import { startOverlayHistory } from '../state/overlay-history.ts';
import { useScrollRestoration } from '../state/scroll-restoration.ts';
import { useBackTargetValue } from '../state/back-target.tsx';
import { BannerSlot, bannerCandidates } from '../state/banner-slot.tsx';
import { useExtraBannerValue } from '../state/extra-banner.tsx';
import { useForwardArrival } from '../state/forward-arrival.ts';
import { usePageTitleValue } from '../state/page-title.tsx';
import { ReadingArrivals } from '../state/reading-arrivals.tsx';
import { AudioArrivals } from '../state/audio-arrivals.tsx';
import { RemovedLocalNotice } from '../state/removed-local-notice.tsx';
import { useSession } from '../state/session.tsx';
import { useCaptureRefused, useStorageReading } from '../state/storage-reading.ts';
import { useSync } from '../state/sync.tsx';
import { ToastOutlet } from '../state/toast.tsx';
import { spriteHref } from '../styles/sprite.ts';

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
  /**
   * Where back goes when the destination also reads navigation state (a sheet returns to
   * the Sumário with section 9 open and its row focused). It applies at every width
   * whenever no `useBackTarget` override is set: Story 15.4 revoked journey review D-8's
   * phone exception (Story 12.2), so there is no width check left to make.
   */
  backWith?: (params: Record<string, string | undefined>) => { to: string; state: unknown };
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
  const titleOverride = usePageTitleValue();
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
  // A surface's own title (a sheet's TAG, `usePageTitle`) wins over the route's, as `back` does.
  const titled: RouteTitle | undefined = titleOverride === null ? handle : { ...handle, title: titleOverride };
  const title = titled?.title ?? '';
  const tabTitle = documentTitle(titled);
  const routeBack = typeof handle?.back === 'function' ? handle.back(params) : handle?.back;
  const back = backTarget ?? routeBack ?? '/';

  useEffect(() => {
    document.title = tabTitle;
  }, [tabTitle]);

  // E12-Q2: a forward navigation opens the new page at its top, its heading focused.
  const titleRef = useRef<HTMLHeadingElement>(null);
  useForwardArrival(titleRef);
  // Story 29.2: a back (a pop) returns to the scroll the screen had, and closes an open overlay first.
  useScrollRestoration();
  useEffect(() => startOverlayHistory(), []);
  // Fix batch e28w (N2): the address each entry was pushed from, for "Voltar" below.
  useEntryOrigins();

  function goBack(): void {
    // A `useBackTarget` override (the Export-dialog return) wins over the route's back.
    const backWith = backTarget === null ? handle?.backWith : undefined;
    if (backWith !== undefined) {
      const { to, state } = backWith(params);
      // Fix batch e28w (N2): opened from that very screen (the Sumário), "Voltar" steps back to its entry, so a
      // later device back goes on to the screen before it; a deep link or another origin navigates as before.
      if (returnToOrigin(location.key, to, state)) {
        void navigate(-1);
        return;
      }
      void navigate(to, { state });
      return;
    }
    void navigate(back);
  }

  // Story 6.2 (FR-57): measured on mount, after each capture and after each sync cycle.
  const storage = useStorageReading(sync.running);
  // Story 13.6 (CAP-4): a shot held in memory after a refusal forces the storage banner.
  const storageRefused = useCaptureRefused();

  const banners = bannerCandidates({
    reAuthRequired: session.reAuthRequired,
    // Story 26.11: a paused account shows its own banner in place of the session one.
    reAuthCause: session.reAuthCause ?? null,
    online: sync.online,
    unsyncedForDays: unsyncedForDays(oldest, now()),
    storage,
    storageRefused,
    storageAction: (
      <TextButton data-telemetry="sync.now" onPress={() => void sync.syncNow()}>
        {copy.banner.storageLowAction}
      </TextButton>
    ),
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
            <AriaButton className="icon-btn" aria-label={ui.appBar.back} onPress={goBack}>
              <svg className="ico" aria-hidden="true">
                <use href={spriteHref('i-back')} />
              </svg>
            </AriaButton>
          )}
        </span>
        <h1 className={handle?.titleHidden ? 'app-bar-title visually-hidden' : 'app-bar-title'} tabIndex={-1} ref={titleRef}>
          {title}
        </h1>
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
      <SyncAnnouncer state={sync.badgeState} />
      <BannerSlot banners={banners} onOpenSync={() => void navigate('/sync')} />
      <Outlet />
      <ToastOutlet />
      {/* Story 8.2: "3 leituras prontas para confirmar — Ver" when a pull brings readings in. */}
      <ReadingArrivals />
      {/* Story 31.4: "2 áudios transcritos — Ver" when a sync brings transcripts in. */}
      <AudioArrivals />
      {/* Story 30.4: "Cubículo Enel foi removido por Ana. Suas 19 respostas não foram mantidas. — Ver", once, on the writer's device. */}
      <RemovedLocalNotice />
    </>
  );
}
