import type { RegistryRow } from '../schemas/entities.ts';

/*
 * AD-2, AGENTS.md "composed row": the Clientes row text and its sort order are derived
 * once here, never in `apps/web` (mirrors `registry/instrument-row.ts`). `80-cadastros.html`'s
 * row is `⟨name⟩` / `⟨CNPJ or "não informado"⟩`.
 */

export type ClientRow = Extract<RegistryRow, { kind: 'client' }>;

export interface ClientRowText {
  primary: string;
  /** CNPJ, or the "not informed" fallback text (I/O matrix: a blank CNPJ still shows "—" on the row itself). */
  secondary: string;
}

/** Composes one Clientes row's text from the row. `cnpj` is stored already canonicalized. */
export function clientRegistryRowText(client: ClientRow): ClientRowText {
  return { primary: client.name, secondary: client.cnpj ? `CNPJ ${client.cnpj}` : 'CNPJ não informado' };
}

/** Alphabetical by name (pt-BR collation, so accented names sort in locale order), for a stable list order. */
export function compareClientRows(a: ClientRow, b: ClientRow): number {
  return a.name.localeCompare(b.name, 'pt-BR');
}

/** The Clientes list's own sort: alphabetical by name. */
export function sortClientRegistryRows(clients: readonly ClientRow[]): ClientRow[] {
  return [...clients].sort(compareClientRows);
}
