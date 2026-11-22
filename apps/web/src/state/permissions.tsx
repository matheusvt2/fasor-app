import { can as roleCan, permissionForScreen, permissionRefusalText, PRODUTO, ROLE_UNKNOWN_TEXT, SCREEN_UNAVAILABLE_TEXT, screenNeedsKnownRole, type PermissionKey, type PermissionNeed, type RoleRow } from '@app/domain';
import { createContext, use, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { LoadingNote } from '../components/index.ts';
import { localRoleOf } from '../db/sync-store.ts';
import { useLiveQuery } from '../db/live.ts';
import { useSession } from './session.tsx';
import { useSync } from './sync.tsx';
import { useToast } from './toast.tsx';

/*
 * Story 26.5 (AD-29): the one source of what the signed-in user may do on this device. The
 * provider reads the user's role from IndexedDB (the `role/{id}` row its user row's `role_id`
 * names, both brought by the company pull: `localRoleOf`, the query `state/sync.tsx` runs for the
 * rejection causes), live, so a pull that changes the role changes the screen with no reload. It
 * answers with the kernel's `can`; no component compares a role name or lists a key beside a role.
 *
 * `loading` until the device store answered and, while the role is not on the device, until a sync
 * cycle completed this session or the device is offline; after that an absent role holds no key
 * (fail closed, as the server does). What the app hides is a courtesy: the server refuses on its own.
 */

export interface PermissionsState {
  status: 'loading' | 'ready';
  role: RoleRow | null;
  /**
   * Story 26.10: the device is offline and does not hold the user's own role (a first sign-in cut off
   * before its company pull): no key is held, and a screen says so instead of drawing an empty one.
   */
  unknownOffline: boolean;
  /** Whether the role holds the key; false while loading. */
  can: (key: PermissionKey) => boolean;
}

const PermissionsContext = createContext<PermissionsState | null>(null);

/** The pure verdict of the provider's state, exported for its unit test. */
export function permissionsStatus(role: RoleRow | null | undefined, cycled: boolean, online: boolean): PermissionsState['status'] {
  if (role === undefined) return 'loading';
  if (role !== null) return 'ready';
  return cycled || !online ? 'ready' : 'loading';
}

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const sync = useSync();
  const db = session.database;
  const userId = session.user?.id ?? null;
  // The query shape of `state/sync.tsx` (`viewerRole`), without a default: undefined while unanswered.
  const role = useLiveQuery(() => (db === null || userId === null ? Promise.resolve(null) : localRoleOf(db, userId)), [db, userId]);
  // `lastResult` goes back to null when the next cycle starts: one completed cycle is kept for the session.
  const [cycled, setCycled] = useState(false);
  // Adjusting state while rendering (React's pattern for state derived from a changing input).
  if (sync.lastResult !== null && !cycled) setCycled(true);
  const status = permissionsStatus(role, cycled || sync.lastResult !== null, session.online);
  const held = role ?? null;
  const value = useMemo<PermissionsState>(
    () => ({ status, role: held, unknownOffline: status === 'ready' && held === null && !session.online, can: (key) => status === 'ready' && roleCan(held, key) }),
    [status, held, session.online],
  );
  return <PermissionsContext value={value}>{children}</PermissionsContext>;
}

/**
 * A fixed, known role for a surface's unit test, with no device store behind it (production
 * mounts `PermissionsProvider`). `role` null holds no key.
 */
export function PermissionsFixture({ role, children }: { role: RoleRow | null; children: ReactNode }) {
  const value = useMemo<PermissionsState>(() => ({ status: 'ready', role, unknownOffline: false, can: (key) => roleCan(role, key) }), [role]);
  return <PermissionsContext value={value}>{children}</PermissionsContext>;
}

/** The provider's state, or null where none is mounted (a surface rendered alone in a unit test). */
export function usePermissions(): PermissionsState | null {
  return use(PermissionsContext);
}

/**
 * The one hook a control asks: whether the signed-in user's role holds `key`. With no provider
 * mounted (a surface rendered alone in a unit test) every key is allowed, so the tests written
 * before Epic 26, where every user is Admin, read as they did; production always mounts the
 * provider in `RequireSession` (`app.tsx`). `'none'` is always allowed.
 */
export function useCan(key: PermissionNeed): boolean {
  const value = use(PermissionsContext);
  if (key === 'none' || value === null) return true;
  return value.can(key);
}

/** The same verdict for a key chosen at call time (an op's need, `permissionForPath`), from the hook's state. */
export function useCanFn(): (key: PermissionNeed) => boolean {
  const value = use(PermissionsContext);
  return (key) => key === 'none' || value === null || value.can(key);
}

/**
 * A control that opens another screen (a jump to Cadastros from a ficha or the setup): whether the
 * role opens it, by the kernel's screen map, and else the kernel's one line of reason.
 */
export function useScreenAccess(pathname: string): { allowed: boolean; reason: string | undefined } {
  const need = permissionForScreen(pathname);
  const allowed = useCan(need);
  return { allowed, reason: allowed || need === 'none' ? undefined : permissionRefusalText(need) };
}

/**
 * The route guard (a layout element): the screen's key from the kernel's map for the address in
 * the bar (`permissionForScreen`), or `need` when given. Loading waits with the loading note (never
 * bounces); allowed renders the screen; refused lands on Home (`replace`) with one Toast,
 * "Essa tela não está disponível para o seu papel." (rule 3 of `MOCK-GUIDE.md` § 2026-11-21).
 */
export function RequirePermission({ need, children }: { need?: PermissionNeed; children?: ReactNode }) {
  const { pathname } = useLocation();
  const permissions = usePermissions();
  const wanted = need ?? permissionForScreen(pathname);
  const allowed = wanted === 'none' || permissions === null || permissions.can(wanted);
  const loading = !allowed && permissions !== null && permissions.status === 'loading';
  const refused = !allowed && !loading;
  if (loading) {
    return (
      <main className="screen">
        <div className="content">
          <LoadingNote what={PRODUTO} />
        </div>
      </main>
    );
  }
  if (refused) return <Refused pathname={pathname} />;
  // Story 26.10: offline with no role on the device, no screen is drawn empty.
  if (permissions !== null && permissions.unknownOffline && screenNeedsKnownRole(pathname)) {
    return (
      <main className="screen">
        <div className="content">
          <p className="section-note" role="status">
            {ROLE_UNKNOWN_TEXT}
          </p>
        </div>
      </main>
    );
  }
  return children === undefined ? <Outlet /> : <>{children}</>;
}

/** Says the Toast once for the refused address, then lands on Home. */
function Refused({ pathname }: { pathname: string }) {
  const { showToast } = useToast();
  const said = useRef<string | null>(null);
  useEffect(() => {
    if (said.current === pathname) return;
    said.current = pathname;
    showToast(SCREEN_UNAVAILABLE_TEXT);
  }, [pathname, showToast]);
  return <Navigate to="/" replace />;
}
