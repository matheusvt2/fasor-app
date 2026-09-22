import { avatarInitial, PRODUTO } from '@app/domain';
import { Link, Outlet, useMatches, useNavigate } from 'react-router';
import { SyncAnnouncer } from '../components/sync-announcer.tsx';
import { SyncBadge } from '../components/index.ts';
import { copy } from '../copy/pt-br.ts';
import { BannerSlot, bannerCandidates } from '../state/banner-slot.tsx';
import { useSession } from '../state/session.tsx';
import { useSync } from '../state/sync.tsx';
import { ToastOutlet } from '../state/toast.tsx';

/** The surface title the App bar shows; `titleHidden` is `key-home.html`'s Home rule. */
export interface RouteTitle {
  title: string;
  titleHidden?: boolean;
}

/** The inline sprite of the symbols this story's markup uses. */
function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <symbol id="i-check" viewBox="0 0 24 24">
        <path d="M5 12l5 5 9-10" />
      </symbol>
      <symbol id="i-chev-right" viewBox="0 0 24 24">
        <path d="M9 6l6 6-6 6" />
      </symbol>
      <symbol id="i-layers" viewBox="0 0 24 24">
        <path d="M12 4l8 4-8 4-8-4z" />
        <path d="M4 12l8 4 8-4" />
        <path d="M4 16l8 4 8-4" />
      </symbol>
      <symbol id="i-book" viewBox="0 0 24 24">
        <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3z" />
        <path d="M5 4v16a3 3 0 0 1 3-3h11" />
      </symbol>
    </svg>
  );
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
  const navigate = useNavigate();
  const matches = useMatches();

  const handle = [...matches].reverse().find((match) => match.handle !== undefined)?.handle as
    | RouteTitle
    | undefined;
  const title = handle?.title ?? '';

  const banners = bannerCandidates({
    reAuthRequired: session.reAuthRequired,
    online: sync.online,
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
      <IconSprite />
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
