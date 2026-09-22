import { copy } from '../../copy/pt-br.ts';
import { WordRegistryTab } from './word-registry-tab.tsx';

/** Fabricantes (Story 2.5): a thin wrapper around the shared `WordRegistryTab`. */
export function FabricantesTab() {
  const t = copy.registries.fabricantes;
  return (
    <WordRegistryTab
      kind="manufacturer"
      listLabel={copy.registries.tabFabricantes}
      newRowButton={t.newRow}
      empty={t.empty}
      note={t.note}
      copy={t.panel}
    />
  );
}
