import { seedRule } from '../seed/definitions.ts';

/*
 * Story 28.9 (seed v18, B-15, contract 59): the relatório's "Itens adicionais", the remarks that belong to the whole
 * relatório (a test done through the busbar on several units at once, a caveat on the relay's selectivity study),
 * written in Etapa 6 and printed as topics in section 10 after its fixed items. The list is `setup.additional_items`,
 * one LWW value written whole; this module holds its one rule set, so Etapa 6, the print and every count agree.
 */

/** Whether the relatório's seed offers the additional items (Etapa 6) and prints them (section 10): the rule flag `additional_items`. */
export function offersAdditionalItems(seedVersion: string): boolean {
  return seedRule(seedVersion, 'additional_items');
}

/** A blank item (empty or whitespace only): never stored, never printed. Etapa 6 asks it too (a blank row is removed with no write). */
export function blankAdditionalItem(text: string): boolean {
  return text.trim() === '';
}

const blank = blankAdditionalItem;

/**
 * The items that print, in order: every blank one dropped. A stored list never holds one (Etapa 6 writes the list
 * through `additionalItemsWithoutBlanks`), but an op from elsewhere may, so the print drops it too.
 */
export function printedAdditionalItems(items: readonly string[] | null | undefined): string[] {
  return (items ?? []).filter((text) => !blank(text));
}

/**
 * The list Etapa 6 stores for what is on its screen: the rows in order, a blank row (one "Adicionar item" opened and
 * nothing typed yet, or one emptied) left out. "Um item vazio não é guardado."
 */
export function additionalItemsWithoutBlanks(rows: readonly string[]): string[] {
  return rows.filter((text) => !blank(text));
}

/** The list without the item at `index` ("Remover" of an item's overflow menu). */
export function withoutAdditionalItem(items: readonly string[], index: number): string[] {
  return items.filter((_, i) => i !== index);
}

/** Whether two lists are the same items in the same order (a write that changes nothing is not made). */
export function sameAdditionalItems(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((text, i) => text === b[i]);
}
