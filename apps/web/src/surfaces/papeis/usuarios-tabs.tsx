import { Link } from 'react-router';
import { copy } from '../../copy/pt-br.ts';

/*
 * Story 26.10 (`93-papeis.html` `nav.tabs`): the two tabs of Usuários as links, one route per tab
 * (MOCK-GUIDE § 2026-11-21, Components: "Tabs (as links, one route per tab)"). The Usuários tab is
 * wired once batch e26d's `/usuarios` is on main: until then its entry stays out of `TABS`, and the
 * swap is the one commented line below.
 */

const t = copy.papeis;

const TABS: ReadonlyArray<{ to: string; label: string }> = [
  // { to: '/usuarios', label: t.tabUsuarios },
  { to: '/usuarios/papeis', label: t.tabPapeis },
];

export function UsuariosTabs({ selected }: { selected: string }) {
  return (
    <nav className="tabs pp-tabs" role="tablist" aria-label={t.tabsLabel}>
      {TABS.map((tab) => (
        <Link key={tab.to} className="tab" role="tab" aria-selected={tab.to === selected} to={tab.to}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
