import { avatarInitial, PRODUTO, unsyncedForDays } from '@app/domain';
import { Link, Outlet, useMatches, useNavigate } from 'react-router';
import { now } from '../clock.ts';
import { SyncAnnouncer } from '../components/sync-announcer.tsx';
import { SyncBadge } from '../components/index.ts';
import { copy } from '../copy/pt-br.ts';
import { oldestPendingClientTs } from '../db/commit.ts';
import { useLiveQuery } from '../db/live.ts';
import { BannerSlot, bannerCandidates } from '../state/banner-slot.tsx';
import { useDrafts } from '../state/drafts.tsx';
import { useSession } from '../state/session.tsx';
import { useSync } from '../state/sync.tsx';
import { ToastOutlet } from '../state/toast.tsx';

/** The surface title the App bar shows; `titleHidden` is `key-home.html`'s Home rule. */
export interface RouteTitle {
  title: string;
  titleHidden?: boolean;
}

/**
 * The App bar (`shell-head.html`), the one banner slot, the sync live region and the
 * toast outlet — each rendered once for the whole app (AR-27).
 *
 * The surface title is the App bar's `<h1>`, not the screen's: `key-home.html` puts it
 * there and marks it `visually-hidden` on Home, where the wordmark already names the
 * page. Each route declares it through `handle`.
 */
export function AppShell() {
  const session = useSession();
  const sync = useSync();
  const drafts = useDrafts();
  const navigate = useNavigate();
  const matches = useMatches();
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

  const banners = bannerCandidates({
    reAuthRequired: session.reAuthRequired,
    online: sync.online,
    unsyncedForDays: unsyncedForDays(oldest, now()),
    draftFound: drafts.draftFound,
    reAuthAction: (
      <button
        type="button"
        className="btn btn-text"
        // The flag stays set until a sign-in clears it, so /login does not bounce
        // straight back to Home.
        onClick={() => void navigate('/login')}
      >
        {copy.banner.reAuthAction}
      </button>
    ),
  });

  return (
    <>
      <header className="app-bar">
        <span className="app-bar-left">
          <Link className="wordmark" to="/" aria-label={copy.home.wordmarkLabel(PRODUTO)}>
            {PRODUTO}
          </Link>
        </span>
        <h1 className={handle?.titleHidden ? 'app-bar-title visually-hidden' : 'app-bar-title'}>{title}</h1>
        <span className="app-bar-right">
          <SyncBadge state={sync.badgeState} counts={sync.counts} onPress={() => void navigate('/sync')} />
          <Link className="avatar-btn" to="/account" aria-label={copy.home.accountLink}>
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
