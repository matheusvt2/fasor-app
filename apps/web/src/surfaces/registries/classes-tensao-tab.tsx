import { copy } from '../../copy/pt-br.ts';
import { WordRegistryTab } from './word-registry-tab.tsx';

/** Classes de tensão (Story 2.5): a thin wrapper around the shared `WordRegistryTab`. */
export function ClassesTensaoTab() {
  const t = copy.registries.classesTensao;
  return (
    <WordRegistryTab
      kind="voltage_class"
      listLabel={copy.registries.tabClassesTensao}
      newRowButton={t.newRow}
      empty={t.empty}
      emptyText={t.emptyText}
      note={t.note}
      copy={t.panel}
    />
  );
}
