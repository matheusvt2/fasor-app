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

const KV_PATTERN = /^\d+(?:[,.]\d+)?$/;

/**
 * Story 2.5 AC1: a voltage class is a value in kV, typed pt-BR ("15", "17,5", "23"; a
 * trailing "kV" and a decimal point are tolerated). Returns the stored text, with a
 * decimal comma and no unit, or null when the text is not a number (the form refuses it
 * inline, Epic 2 retro D-6). The row keeps it in `name`, the by-value field the sheets
 * and the server merge already read (AD-19).
 */
export function parseVoltageClassKv(text: string): string | null {
  const bare = text.trim().replace(/\s*kv$/i, '');
  return KV_PATTERN.test(bare) ? bare.replace('.', ',') : null;
}

/**
 * Composes one Fabricantes/Classes de tensão row's text from the row. A voltage class
 * reads with its unit ("17,5 kV", `80-cadastros.html` Classes de tensão); a stored name
 * that is not a number is shown as it is.
 */
export function wordRegistryRowText(row: WordRow): WordRowText {
  if (row.kind === 'voltage_class') {
    const kv = parseVoltageClassKv(row.name);
    return { primary: kv === null ? row.name : `${kv} kV` };
  }
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
