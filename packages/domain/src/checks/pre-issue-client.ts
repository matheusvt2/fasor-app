import type { ClientRow } from '../registry/client-row.ts';

/*
 * Design Notes "`preIssue` is not built here": Epic 7's real `preIssue(snapshot)`
 * aggregator (AD-15) does not exist until Epic 4 gives it a `RelatorioSnapshot` to read.
 * This is a small, separately-named, standalone helper it composes later — kept in its
 * own file (not `pre-issue.ts`) so a parallel batch's own isolated warning helper never
 * collides on the same file at merge time.
 */

/** One warning-row shape Epic 7's Sumário/Export dialog will render (AD-15's contract). */
export interface PreIssueRow {
  key: string;
  text: string;
}

/** Story 2.4 AC3: a client with no CNPJ surfaces one pre-issue warning row. */
export function clientPreIssueRows(client: ClientRow | null): PreIssueRow[] {
  if (client !== null && client.cnpj === null) {
    return [{ key: 'cnpj_do_contratante_em_branco', text: 'CNPJ do contratante em branco' }];
  }
  return [];
}
