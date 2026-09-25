import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Tabs, type TabItem } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { readRegistryTab, writeRegistryTab } from '../../db/prefs.ts';
import { useBackTarget } from '../../state/back-target.tsx';
import { useSession } from '../../state/session.tsx';
import { ClassesTensaoTab } from './classes-tensao-tab.tsx';
import { ClientesTab } from './clientes-tab.tsx';
import { CriteriosTab } from './criterios-tab.tsx';
import { EmpresaTab } from './empresa-tab.tsx';
import { FabricantesTab } from './fabricantes-tab.tsx';
import { InstrumentosTab } from './instrumentos-tab.tsx';
import './registries.css';

const DEFAULT_TAB = 'instrumentos';

const TAB_IDS = ['empresa', 'clientes', 'instrumentos', 'fabricantes', 'classes-tensao', 'criterios'] as const;
type TabId = (typeof TAB_IDS)[number];

function isTabId(value: unknown): value is TabId {
  return typeof value === 'string' && (TAB_IDS as readonly string[]).includes(value);
}

/**
 * Story 12.2 (J-11): the navigation state a surface opens Cadastros with (setup Etapa 4's
 * "Cadastrar instrumento"): the tab, a new instrument's panel already open, and where both
 * "Fechar" and the App bar "Voltar" return.
 */
interface RegistriesEntry {
  tab?: TabId;
  newInstrument?: boolean;
  returnTo?: string;
}

function entryOf(state: unknown): RegistriesEntry {
  if (typeof state !== 'object' || state === null) return {};
  const raw = state as Record<string, unknown>;
  return {
    tab: isTabId(raw.tab) ? raw.tab : undefined,
    newInstrument: raw.newInstrument === true,
    returnTo: typeof raw.returnTo === 'string' && raw.returnTo.startsWith('/') ? raw.returnTo : undefined,
  };
}

/**
 * Cadastros (`80-cadastros.html`, `key-registries.html`): six tabs, Instrumentos is the
 * only real one this story ships (the other five are placeholders, Stories 2.2-2.6),
 * wired once here so each later story only ever touches its own tab file.
 *
 * The last selected tab is device-local state (AR-27, `local_prefs`, same durability and
 * same `ThemeProvider`-style async read as every other device preference) -- not
 * `sessionStorage`, which a closed and reopened tab would forget.
 */
export function RegistriesSurface() {
  const session = useSession();
  const db = session.database;
  const navigate = useNavigate();
  const location = useLocation();
  // Read once: the entry state belongs to the arrival, and is spent by its panel's close or
  // by a tab change, never replayed.
  const [entry, setEntry] = useState(() => entryOf(location.state));
  const [arrivalTab] = useState(entry.tab);
  const [selectedId, setSelectedId] = useState<TabId>(arrivalTab ?? DEFAULT_TAB);
  useBackTarget(entry.returnTo ?? null);
  // History keeps no arrival state: a browser back or a reload onto Cadastros opens it plain.
  useEffect(() => {
    if (location.state !== null && location.state !== undefined) void navigate(location.pathname + location.search, { replace: true, state: null });
    // Once per mount, with the values captured above.
  }, []);

  function endEntry(back: boolean): void {
    const returnTo = entry.returnTo;
    setEntry({});
    if (back && returnTo !== undefined) void navigate(returnTo);
  }

  useEffect(() => {
    // An arrival that names its tab keeps it over the remembered one.
    if (db === null || arrivalTab !== undefined) return;
    let cancelled = false;
    void readRegistryTab(db).then((stored) => {
      if (cancelled) return;
      if (isTabId(stored)) setSelectedId(stored);
    });
    return () => {
      cancelled = true;
    };
  }, [db, arrivalTab]);

  function selectTab(id: string): void {
    if (!isTabId(id)) return;
    if (id !== selectedId) setEntry({});
    setSelectedId(id);
    if (db !== null) void writeRegistryTab(db, id);
  }

  const tabs: ReadonlyArray<TabItem> = [
    { id: 'empresa', label: copy.registries.tabEmpresa, panel: <EmpresaTab /> },
    { id: 'clientes', label: copy.registries.tabClientes, panel: <ClientesTab /> },
    {
      id: 'instrumentos',
      label: copy.registries.tabInstrumentos,
      panel: (
        <InstrumentosTab openNew={entry.newInstrument === true} onEntryEnd={endEntry} />
      ),
    },
    { id: 'fabricantes', label: copy.registries.tabFabricantes, panel: <FabricantesTab /> },
    { id: 'classes-tensao', label: copy.registries.tabClassesTensao, panel: <ClassesTensaoTab /> },
    { id: 'criterios', label: copy.registries.tabCriterios, panel: <CriteriosTab /> },
  ];

  return (
    <main className="screen" data-route="/cadastros">
      <Tabs items={tabs} selectedId={selectedId} onSelectionChange={selectTab} aria-label={copy.registries.tabsLabel} />
    </main>
  );
}
