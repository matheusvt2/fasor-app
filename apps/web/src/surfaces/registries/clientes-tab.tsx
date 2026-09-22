import { copy } from '../../copy/pt-br.ts';
import { RegistryTabPlaceholder } from './registry-tab-placeholder.tsx';

/** Clientes — Story 2.4 owns the real tab (clients and their sites). */
export function ClientesTab() {
  return <RegistryTabPlaceholder heading={copy.registries.tabClientes} />;
}
