import { avatarInitial, PRODUTO } from '@app/domain';
import { Link, Outlet, useNavigate } from 'react-router';
import { copy } from '../copy/pt-br.ts';
import { BannerSlot, type Banner } from '../state/banner-slot.tsx';
import { useSession } from '../state/session.tsx';

/** The one inline sprite the surfaces of this story need. Story 1.2 owns the real one. */
function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <symbol id="i-check" viewBox="0 0 24 24">
        <path d="M5 12l5 5 9-10" />
      </symbol>
    </svg>
  );
}

/**
 * App bar plus the single banner slot, rendered once for the whole app. Only the re-auth
 * banner is populated here; Story 1.6 adds the rest of the priority list.
 */
export function AppShell() {
  const session = useSession();
  const navigate = useNavigate();

  const banners: Banner[] = [];
  if (session.reAuthRequired) {
    banners.push({
      kind: 're-auth',
      variant: 'warning',
      role: 'alert',
      text: copy.banner.reAuthText,
      actions: (
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
  }

  return (
    <>
      <IconSprite />
      <header className="app-bar">
        <span className="app-bar-left">
          <Link className="wordmark" to="/">
            {PRODUTO}
          </Link>
        </span>
        <span className="app-bar-title" />
        <span className="app-bar-right">
          <Link className="avatar-btn" to="/account" aria-label={copy.home.accountLink}>
            <span className="avatar" aria-hidden="true">
              {avatarInitial(session.user?.name ?? '')}
            </span>
          </Link>
        </span>
      </header>
      <BannerSlot banners={banners} />
      <Outlet />
    </>
  );
}
