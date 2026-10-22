import type { OpPath } from '../ops/path.ts';
import { screenLabel } from '../relatorio/screen-label.ts';
import { NC_PHRASE_MAX_LENGTH, type BlockRow, type RegistryRow } from '../schemas/entities.ts';
import { findDefinition, SEED_VERSION, SEED_VERSIONS } from '../seed/definitions.ts';
import { normalizeRegistryName } from '../text/normalize-name.ts';

/*
 * Story 14.12 (contract 23): the company's learned options. An NC observation typed by hand on
 * a sheet becomes a chip of that equipment type's item on every later sheet of the company, and
 * a FABRICANTE typed with no matching row becomes a Fabricantes row, both learned by the server
 * after a client push (`apps/api/src/sync/apply.ts`, `learnPushedOptions`) as registry rows of
 * the company stream (AD-19). This module is the whole rule: what a push teaches
 * (`learnedOptionCandidates`), what a row offers (`ncChipPhrases`, the only chip-list function)
 * and how the office's "Frases de NC" list reads (`ncPhraseRegistryRows`). A learned option never
 * changes a stored value, a relatório or a generated document, and the seed's lists never change.
 */

export type NcPhraseRow = Extract<RegistryRow, { kind: 'nc_phrase' }>;
type ManufacturerRow = Extract<RegistryRow, { kind: 'manufacturer' }>;

function isNcPhraseRow(row: RegistryRow): row is NcPhraseRow {
  return row.kind === 'nc_phrase';
}

function isManufacturerRow(row: RegistryRow): row is ManufacturerRow {
  return row.kind === 'manufacturer';
}

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * The NC chips of one checklist row, in the order they are offered: the seed's phrases of the
 * item, then the company's live learned phrases of that type and item (by id, so in the order
 * they were learned), then the relatório's recent observations of the item. A phrase whose
 * normalized text (`normalizeRegistryName`) an earlier chip already offers is dropped, and so is
 * a blank one. A site item ("Verificações do local") passes no learned rows and a null type.
 */
export function ncChipPhrases({
  seeded,
  learned,
  blockType,
  itemKey,
  recents,
}: {
  seeded: readonly string[];
  learned: readonly RegistryRow[];
  blockType: string | null;
  itemKey: string;
  recents: readonly string[];
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (phrase: string) => {
    const normalized = normalizeRegistryName(phrase);
    if (normalized === '' || seen.has(normalized)) return;
    seen.add(normalized);
    out.push(phrase);
  };
  for (const phrase of seeded) add(phrase);
  if (blockType !== null) {
    const own = learned
      .filter(isNcPhraseRow)
      .filter((row) => row.removed_at === null && row.block_type === blockType && row.item_key === itemKey)
      .sort(byId);
    for (const row of own) add(row.name);
  }
  for (const phrase of recents) add(phrase);
  return out;
}

/** The seed's NC phrases of one type and item in every shipped seed version that defines them, first-seen order. */
export function seedNcPhrasesOf(blockType: string, itemKey: string): string[] {
  const out: string[] = [];
  for (const version of Object.keys(SEED_VERSIONS)) {
    const item = findDefinition(version, blockType)?.checklist?.find((entry) => entry.key === itemKey);
    for (const phrase of item?.nc_phrases ?? []) if (!out.includes(phrase)) out.push(phrase);
  }
  return out;
}

/** What one push wrote on one block: the checklist items and nameplate fields of its applied ops. */
export interface LearnTouched {
  checklist: readonly string[];
  nameplate: readonly string[];
}

/**
 * The blocks a push wrote on through `sheet/{id}/checklist/{item}/{result|observation}` and
 * `sheet/{id}/nameplate/{field}`, each with the items and fields it touched, in first-seen order.
 */
export function learnTouchedOf(paths: readonly OpPath[]): Map<string, LearnTouched> {
  const touched = new Map<string, { checklist: string[]; nameplate: string[] }>();
  const of = (blockId: string) => {
    let entry = touched.get(blockId);
    if (entry === undefined) {
      entry = { checklist: [], nameplate: [] };
      touched.set(blockId, entry);
    }
    return entry;
  };
  for (const path of paths) {
    if (path.family === 'sheet/checklist') {
      const entry = of(path.block_id);
      if (!entry.checklist.includes(path.item_key)) entry.checklist.push(path.item_key);
    } else if (path.family === 'sheet/nameplate') {
      const entry = of(path.block_id);
      if (!entry.nameplate.includes(path.field_key)) entry.nameplate.push(path.field_key);
    }
  }
  return touched;
}

/** The characters a phrase occurrence must sit between (or the text's start and end) to split the text. */
const BOUNDARY = '\\s,;.()\u0000';
const CUT = '\u0000';

/**
 * The phrase pieces of a typed observation: the text cut at every whole occurrence of an offered
 * phrase (bounded by the text's start or end, whitespace or `,;.()`, matched case-insensitively,
 * so "Trinca" never cuts "Trincado"), each piece trimmed of whitespace and `,;.` (and of a bracket
 * the cut left dangling); a piece with no letter or digit is dropped.
 */
export function typedPieces(text: string, offered: readonly string[]): string[] {
  const phrases = [...new Set(offered.map((phrase) => phrase.trim()).filter((phrase) => phrase !== ''))].sort((a, b) => b.length - a.length);
  let cut = text.replaceAll(CUT, ' ');
  for (const phrase of phrases) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cut = cut.replace(new RegExp(`(?<=^|[${BOUNDARY}])${escaped}(?=$|[${BOUNDARY}])`, 'giu'), CUT);
  }
  return cut
    .split(CUT)
    // A cut beside a bracket leaves its other half dangling ("(" at a piece's end, ")" at its start).
    .map((piece) => piece.replace(/^[\s,;.)]+|[\s,;.(]+$/g, ''))
    .filter((piece) => /[\p{L}\p{N}]/u.test(piece));
}

/**
 * Review of Story 14.12: the names the company's rows held before a rename (their create values and
 * earlier `name` puts), known like the rows' current names, so a spelling the office renamed away is
 * never learned again.
 */
export interface EarlierNames {
  ncPhrases: readonly { block_type: string; item_key: string; name: string }[];
  manufacturers: readonly string[];
}

const NO_EARLIER: EarlierNames = { ncPhrases: [], manufacturers: [] };

export interface LearnedOptions {
  ncPhrases: { block_type: NcPhraseRow['block_type']; item_key: NcPhraseRow['item_key']; name: string }[];
  manufacturers: string[];
}

/**
 * What a push teaches from one block, read from the block's row at the end of the push: for each
 * touched checklist item whose result is NC, the pieces of its observation typed by hand (split at
 * every occurrence of an offered phrase, the item's seed phrases in any shipped version and the
 * live learned ones, `insertPhrase`'s separators trimmed), at most `NC_PHRASE_MAX_LENGTH`
 * characters; and for each touched nameplate field of kind `manufacturer`, its typed value. Nothing
 * is learned from a removed block or one with no definition; nothing whose normalized text is a
 * seed phrase of the item, any row of the same key (live or removed: an option the office removed
 * is never learned again), a name such a row held before a rename (`earlier`), or an earlier
 * candidate of the result.
 */
export function learnedOptionCandidates(
  block: Pick<BlockRow, 'block_type' | 'seed_version' | 'removed_at' | 'sheet'>,
  touched: LearnTouched,
  registryRows: readonly RegistryRow[],
  earlier: EarlierNames = NO_EARLIER,
): LearnedOptions {
  const result: LearnedOptions = { ncPhrases: [], manufacturers: [] };
  if (block.removed_at !== null) return result;
  const definition = findDefinition(block.seed_version, block.block_type);
  if (definition === null) return result;
  const blockType = definition.block_type;
  const phraseRows = registryRows.filter(isNcPhraseRow);

  for (const item of definition.checklist ?? []) {
    if (!touched.checklist.includes(item.key)) continue;
    // An NC is always a stored cell (no default derives one), so the stored value is read.
    if (block.sheet.checklist[item.key]?.result?.value !== 'NC') continue;
    const cell = block.sheet.checklist[item.key]?.observation;
    if (typeof cell?.value !== 'string' || cell.value.trim() === '') continue;
    const seeded = seedNcPhrasesOf(blockType, item.key);
    const sameKey = phraseRows.filter((row) => row.block_type === blockType && row.item_key === item.key);
    const offered = [...seeded, ...sameKey.filter((row) => row.removed_at === null).map((row) => row.name)];
    const renamedAway = earlier.ncPhrases.filter((entry) => entry.block_type === blockType && entry.item_key === item.key).map((entry) => entry.name);
    const known = new Set([...seeded, ...sameKey.map((row) => row.name), ...renamedAway].map(normalizeRegistryName));
    for (const piece of typedPieces(cell.value, offered)) {
      if (piece.length > NC_PHRASE_MAX_LENGTH) continue;
      const normalized = normalizeRegistryName(piece);
      if (normalized === '' || known.has(normalized)) continue;
      known.add(normalized);
      result.ncPhrases.push({ block_type: blockType, item_key: item.key, name: piece });
    }
  }

  const knownNames = new Set([...registryRows.filter(isManufacturerRow).map((row) => row.name), ...earlier.manufacturers].map(normalizeRegistryName));
  for (const field of definition.nameplate) {
    if (field.kind !== 'manufacturer' || !touched.nameplate.includes(field.key)) continue;
    const value = block.sheet.nameplate[field.key]?.value;
    if (typeof value !== 'string') continue;
    const name = value.trim();
    const normalized = normalizeRegistryName(name);
    if (normalized === '' || knownNames.has(normalized)) continue;
    knownNames.add(normalized);
    result.manufacturers.push(name);
  }
  return result;
}

/** One row of Cadastros › Frases de NC: the phrase, its item as the secondary line, its type as the group. */
export interface NcPhraseRegistryRow {
  row: NcPhraseRow;
  /** The type's name ("Disjuntor MT"), the group the row is listed under. */
  group: string;
  text: { primary: string; secondary: string };
}

function typeLabelOf(blockType: string): string {
  return findDefinition(SEED_VERSION, blockType)?.label ?? blockType;
}

function itemLabelOf(blockType: string, itemKey: string): string {
  // Story 15.3 (seed v9): an item a later seed dropped (`indicador_nivel_de_oleo`) keeps the label
  // of the newest version that has it, so its learned phrases still read by name.
  const versions = Object.keys(SEED_VERSIONS);
  const newestFirst = [SEED_VERSION, ...versions.filter((version) => version !== SEED_VERSION).reverse()];
  for (const version of newestFirst) {
    const item = findDefinition(version, blockType)?.checklist?.find((entry) => entry.key === itemKey);
    if (item !== undefined) return screenLabel(item.label);
  }
  return itemKey;
}

const collate = (a: string, b: string) => a.localeCompare(b, 'pt-BR');

/**
 * The live learned phrases as Cadastros › Frases de NC lists them, sorted by type name, item name
 * and phrase (pt-BR collation). Type and item names are the current seed's, the key when it has none.
 */
export function ncPhraseRegistryRows(rows: readonly RegistryRow[]): NcPhraseRegistryRow[] {
  return rows
    .filter(isNcPhraseRow)
    .filter((row) => row.removed_at === null)
    .map((row) => ({ row, group: typeLabelOf(row.block_type), text: { primary: row.name, secondary: itemLabelOf(row.block_type, row.item_key) } }))
    .sort((a, b) => collate(a.group, b.group) || collate(a.text.secondary, b.text.secondary) || collate(a.text.primary, b.text.primary) || byId(a.row, b.row));
}

/** The same rows in their type groups, in list order. */
export function ncPhraseRegistryGroups(rows: readonly RegistryRow[]): { label: string; rows: NcPhraseRegistryRow[] }[] {
  const groups: { label: string; rows: NcPhraseRegistryRow[] }[] = [];
  for (const entry of ncPhraseRegistryRows(rows)) {
    const last = groups[groups.length - 1];
    if (last !== undefined && last.label === entry.group) last.rows.push(entry);
    else groups.push({ label: entry.group, rows: [entry] });
  }
  return groups;
}
