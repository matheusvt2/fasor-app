import { copy } from '../../copy/pt-br.ts';
import { RegistryTabPlaceholder } from './registry-tab-placeholder.tsx';

/** Critérios de aceitação — Story 2.6 owns the real tab (read-only seeded criteria). */
export function CriteriosTab() {
  return <RegistryTabPlaceholder heading={copy.registries.tabCriterios} />;
}
