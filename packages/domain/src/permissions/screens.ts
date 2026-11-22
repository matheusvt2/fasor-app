import type { PermissionNeed } from './map.ts';

/*
 * AD-29 (Story 26.5): the one map from a web route to the key its screen needs. The app's route
 * guard (`RequirePermission`, `apps/web/src/state/permissions.tsx`) reads it for the address in the
 * bar, so a route added to `apps/web/src/app.tsx` needs only a line here. `'none'` means open to
 * every active user: Home, Conta, Sync status, Login, the dev fixtures and any address the app does
 * not know (the router sends that one to Home). The Usuários screens of later stories are mapped
 * now, so they need no kernel edit.
 */

/** One segment of a route id, never empty and never holding a slash. */
const SEGMENT = '[^/]+';

const SCREENS: ReadonlyArray<readonly [RegExp, PermissionNeed]> = [
  [/^\/cadastros(?:\/.*)?$/, 'registry.edit'],
  [new RegExp(`^/templates/tipos/${SEGMENT}$`), 'equipment_type.edit'],
  [/^\/templates(?:\/.*)?$/, 'template.edit'],
  [/^\/usuarios\/papeis(?:\/.*)?$/, 'roles.manage'],
  [/^\/usuarios(?:\/.*)?$/, 'users.manage'],
  [new RegExp(`^/project/${SEGMENT}(?:/.*)?$`), 'relatorio.view'],
  [new RegExp(`^/relatorio/${SEGMENT}(?:/.*)?$`), 'relatorio.view'],
];

/** The key the screen at `pathname` needs, or `'none'`. A trailing slash is ignored. */
export function permissionForScreen(pathname: string): PermissionNeed {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  for (const [pattern, need] of SCREENS) if (pattern.test(path)) return need;
  return 'none';
}

/**
 * Story 26.10: the screens that open with no role at all, because they are how a user reads the device's own
 * state (Conta, Sync status) or are not behind the session (Login). Every other screen, Home included, waits for
 * the role (`ROLE_UNKNOWN_TEXT` while offline).
 */
export function screenNeedsKnownRole(pathname: string): boolean {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return !/^\/(account|sync|login|__fixture\/.+)$/.test(path);
}
