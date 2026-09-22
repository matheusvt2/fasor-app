import { copy } from '../../copy/pt-br.ts';
import { RegistryTabPlaceholder } from './registry-tab-placeholder.tsx';

/** Classes de tensão — Story 2.5 owns the real tab. */
export function ClassesTensaoTab() {
  return <RegistryTabPlaceholder heading={copy.registries.tabClassesTensao} />;
}
