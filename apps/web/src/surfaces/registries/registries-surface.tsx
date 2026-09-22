import { useState } from 'react';
import { Tabs, type TabItem } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { ClassesTensaoTab } from './classes-tensao-tab.tsx';
import { ClientesTab } from './clientes-tab.tsx';
import { CriteriosTab } from './criterios-tab.tsx';
import { EmpresaTab } from './empresa-tab.tsx';
import { FabricantesTab } from './fabricantes-tab.tsx';
import { InstrumentosTab } from './instrumentos-tab.tsx';
import './registries.css';

/** `sessionStorage` key for the last selected tab; a reload of the same tab keeps it (AC1). */
const TAB_STORAGE_KEY = 'registries.tab';
const DEFAULT_TAB = 'instrumentos';

const TAB_IDS = ['empresa', 'clientes', 'instrumentos', 'fabricantes', 'classes-tensao', 'criterios'] as const;
type TabId = (typeof TAB_IDS)[number];

function readStoredTab(): TabId {
  try {
    const stored = sessionStorage.getItem(TAB_STORAGE_KEY);
    return (TAB_IDS as readonly string[]).includes(stored ?? '') ? (stored as TabId) : DEFAULT_TAB;
  } catch {
    return DEFAULT_TAB;
  }
}

function storeTab(id: string): void {
  try {
    sessionStorage.setItem(TAB_STORAGE_KEY, id);
  } catch {
    // Private mode or a full quota: the tab still switches, it just is not remembered.
  }
}

/**
 * Cadastros (`80-cadastros.html`, `key-registries.html`): six tabs, Instrumentos is the
 * only real one this story ships (the other five are placeholders, Stories 2.2-2.6),
 * wired once here so each later story only ever touches its own tab file.
 */
export function RegistriesSurface() {
  const [selectedId, setSelectedId] = useState<TabId>(readStoredTab);

  const tabs: ReadonlyArray<TabItem> = [
    { id: 'empresa', label: copy.registries.tabEmpresa, panel: <EmpresaTab /> },
    { id: 'clientes', label: copy.registries.tabClientes, panel: <ClientesTab /> },
    { id: 'instrumentos', label: copy.registries.tabInstrumentos, panel: <InstrumentosTab /> },
    { id: 'fabricantes', label: copy.registries.tabFabricantes, panel: <FabricantesTab /> },
    { id: 'classes-tensao', label: copy.registries.tabClassesTensao, panel: <ClassesTensaoTab /> },
    { id: 'criterios', label: copy.registries.tabCriterios, panel: <CriteriosTab /> },
  ];

  return (
    <main className="screen" data-route="/cadastros">
      <Tabs
        items={tabs}
        selectedId={selectedId}
        onSelectionChange={(id) => {
          setSelectedId(id as TabId);
          storeTab(id);
        }}
        aria-label={copy.registries.tabsLabel}
      />
    </main>
  );
}
