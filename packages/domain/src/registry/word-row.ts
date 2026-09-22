import type { RegistryRow } from '../schemas/entities.ts';

/*
 * AD-2, AGENTS.md "composed row": the Fabricantes/Classes de tensão row text and sort
 * order, shared by both tabs (they carry the identical `{name, gender, number}` shape,
 * AD-19). Neither tab's row has more than a name to show yet — no block exists before
 * Epic 5 to count usages against (Design Notes elsewhere in this batch).
 */

export type WordRow = Extract<RegistryRow, { kind: 'manufacturer' | 'voltage_class' }>;

export interface WordRowText {
  primary: string;
}

/** Composes one Fabricantes/Classes de tensão row's text from the row. */
export function wordRegistryRowText(row: WordRow): WordRowText {
  return { primary: row.name };
}

/** Alphabetical by name (pt-BR collation, so accented names sort in locale order), for a stable list order. */
export function compareWordRows(a: WordRow, b: WordRow): number {
  return a.name.localeCompare(b.name, 'pt-BR');
}

/** The Fabricantes/Classes de tensão list's own sort: alphabetical by name. */
export function sortWordRegistryRows<T extends WordRow>(rows: readonly T[]): T[] {
  return [...rows].sort(compareWordRows);
}
