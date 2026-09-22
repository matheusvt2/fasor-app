import { copy } from '../../copy/pt-br.ts';
import { RegistryTabPlaceholder } from './registry-tab-placeholder.tsx';

/** Fabricantes — Story 2.5 owns the real tab (manufacturer/voltage-class pick-lists). */
export function FabricantesTab() {
  return <RegistryTabPlaceholder heading={copy.registries.tabFabricantes} />;
}
