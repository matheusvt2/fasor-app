import { copy } from '../../copy/pt-br.ts';
import { RegistryTabPlaceholder } from './registry-tab-placeholder.tsx';

/** Empresa — Story 2.3 owns the real tab (company document identity, brand preview). */
export function EmpresaTab() {
  return <RegistryTabPlaceholder heading={copy.registries.tabEmpresa} />;
}
