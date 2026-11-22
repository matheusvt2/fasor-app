import { Link } from 'react-router';
import { copy } from '../../copy/pt-br.ts';
import { useCan } from '../../state/permissions.tsx';

export const USERS_PATH = '/usuarios';
export const ROLES_PATH = '/usuarios/papeis';

export interface UsersTabsProps {
  /** The tab of the screen that renders the row. */
  current: 'usuarios' | 'papeis';
}

/**
 * Story 26.9 (`92-usuarios.html` `nav.tabs`): the Tabs row of the two Usuários screens, as links,
 * one route per tab (MOCK-GUIDE § 2026-11-21, Components: "Tabs (as links, one route per tab)").
 * "Papéis e permissões" shows only with `roles.manage`; its screen is Story 26.10's (batch e26e),
 * which renders this same row with `current="papeis"`.
 */
export function UsersTabs({ current }: UsersTabsProps) {
  const rolesShown = useCan('roles.manage');
  const t = copy.users;
  return (
    <div className="tabs" role="tablist" aria-label={t.tabsLabel}>
      <Link className="tab" role="tab" aria-selected={current === 'usuarios'} to={USERS_PATH}>
        {t.tabUsers}
      </Link>
      {rolesShown ? (
        <Link className="tab" role="tab" aria-selected={current === 'papeis'} to={ROLES_PATH}>
          {t.tabRoles}
        </Link>
      ) : null}
    </div>
  );
}
