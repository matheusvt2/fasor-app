import { isCompanyBlockType, type BlockTypeKey, type EquipmentBlockType } from '../schemas/block-config.ts';
import type { EquipmentRow } from '../schemas/entities.ts';

/*
 * Story 4.1: the TAG an equipment block is born with (Smart Input › Equipment identity).
 * Uniqueness is an `integrity` finding (`integrity.ts`), never a constraint.
 *
 * Story 24.8 (batch e24b, Bruno's question 29): the suggestion is `PREFIX-NN`, the type's prefix
 * and the smallest number from 01 free among the obra's live TAGs (`suggestTag`); the local no
 * longer enters it, and the seccionadora's prefix is SC. The technician types the plate's TAG
 * over it. The rule before (a type prefix plus the column code, `SEC-C05`, a `-2` suffix on
 * collision, the cabine's short name on the cabine itself, `CE-ENEL`, and a project-wide running
 * number for transformers, `TR-3`) is kept frozen as `legacySuggestTag` with its own prefix
 * table: Story 24.21 stores its value as the equipment's `reuse_key` (`reuseKeyFor`, and the run
 * of `instantiateTemplate`), and the fixtures and goldens build their TAGs with it
 * (`tagRule: 'legacy'`), so nothing printed before moves.
 */

/**
 * Story 24.8: the frozen prefix table of the rule before (`legacySuggestTag`). It names a
 * placement for the reuse (Story 24.21), so it must read the same in every relatório: a type
 * added later gets its entry here as it gets one in `TAG_PREFIX`, and no entry ever changes.
 */
export const LEGACY_TAG_PREFIX: Readonly<Record<EquipmentBlockType, string>> = {
  cabos_entrada: 'CE',
  para_raio: 'PR',
  chave_seccionadora: 'SEC',
  disjuntor_mt: 'DJ',
  tp: 'TP',
  tc: 'TC',
  cabos_saida: 'CS',
  transformador_forca: 'TR',
  chave_transferencia_automatica: 'CTA',
  quadro_eletrico: 'QD',
  inspecao_qgbt: 'QGBT',
  malha_aterramento: 'MA',
};

export const TAG_PREFIX: Readonly<Record<EquipmentBlockType, string>> = {
  cabos_entrada: 'CE',
  para_raio: 'PR',
  // Story 24.8 (Bruno's question 29): SC, where the rule before had SEC (`LEGACY_TAG_PREFIX`).
  chave_seccionadora: 'SC',
  disjuntor_mt: 'DJ',
  tp: 'TP',
  tc: 'TC',
  cabos_saida: 'CS',
  transformador_forca: 'TR',
  // Story 14.5 (seed v5): the Chave de transferência automática.
  chave_transferencia_automatica: 'CTA',
  // Story 14.9 (seed v6; Bruno 2026-10-20 answer 5): the Quadro elétrico (QGBT/QD).
  quadro_eletrico: 'QD',
  // Story 22.11 (seed v12): the Inspeção de QGBT.
  inspecao_qgbt: 'QGBT',
  // Story 23.21 (seed v13, batch e23e): the Malha de aterramento.
  malha_aterramento: 'MA',
};

/**
 * Story 14.6 (AD-21 item 4): the TAG prefix of a block type: a seeded type's `TAG_PREFIX`, a
 * company type's its definition's (`tag_prefix`, which only a resolved definition carries).
 */
export function tagPrefixOf(
  type: BlockTypeKey,
  definition?: { tag_prefix?: string | undefined } | null,
  /** Story 24.8: the frozen table of the rule before (`legacySuggestTag`); a company type's prefix is its own either way. */
  table: Readonly<Record<EquipmentBlockType, string>> = TAG_PREFIX,
): string {
  if (!isCompanyBlockType(type)) return table[type];
  const prefix = definition?.tag_prefix;
  if (prefix === undefined) throw new Error(`tagPrefixOf: the company block type "${type}" needs its definition`);
  return prefix;
}

/** What `legacySuggestTag` and `reuseKeyFor` need of the location a block is placed on. */
export interface TagLocation {
  kind: 'cabine' | 'coluna';
  name: string;
}

/** What the rules read of an equipment row: the live ones with their tags. */
export type TagEquipment = Pick<EquipmentRow, 'tag' | 'removed_at'>;

/** A tag as compared: trimmed and uppercased, so `sec-c05` and `SEC-C05` are one tag. */
export function normalizeTag(tag: string): string {
  return tag.trim().toUpperCase();
}

const ORDINAL_OR_NUMBER = /^\d+[°ºª]?$/;

/**
 * A location name as a TAG segment: diacritics stripped, uppercased, ordinal and
 * number-only tokens dropped ("1° Subsolo" → "SUBSOLO"), then the last token when it has
 * two or more characters ("Cubículo Enel" → "ENEL"), else the initials ("Cobertura A" →
 * "CA"). An empty name yields "LOCAL".
 */
export function shortName(name: string): string {
  const tokens = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .split(/[^0-9A-Z°ºª]+/)
    .filter((token) => token !== '' && !ORDINAL_OR_NUMBER.test(token));
  if (tokens.length === 0) return 'LOCAL';
  const last = tokens[tokens.length - 1]!;
  if (last.length >= 2) return last;
  return tokens.map((token) => token[0]!).join('');
}

const COLUNA_NAME = /^coluna\s+(\d+)$/i;

/** The column code of a location: "Coluna 5" → "C05", "Coluna 12" → "C12"; any other name → its short name. */
export function locationCode(location: TagLocation): string {
  const match = COLUNA_NAME.exec(location.name.trim());
  if (match !== null) return `C${match[1]!.padStart(2, '0')}`;
  return shortName(location.name);
}

/** True when a live equipment row already carries this tag (case-insensitive, trimmed). */
export function isTagTaken(tag: string, equipment: readonly TagEquipment[]): boolean {
  const wanted = normalizeTag(tag);
  return equipment.some((row) => row.removed_at === null && normalizeTag(row.tag) === wanted);
}

/**
 * Story 24.8, frozen: the TAG the rule before Story 24.8 gives a new block of `type` on
 * `location`, free among `existingEquipment` (removed rows never count): `PREFIX-CODE`, then
 * `PREFIX-CODE-2`, `-3`, ...; a transformer is `TR-n` with the smallest free n across the
 * project. Its prefixes are `LEGACY_TAG_PREFIX`. Nothing on screen shows it: it names a
 * placement for the reuse (`reuseKeyFor`, Story 24.21) and builds the TAGs of the fixtures
 * (`instantiateTemplate` with `tagRule: 'legacy'`).
 */
export function legacySuggestTag(
  type: BlockTypeKey,
  location: TagLocation,
  existingEquipment: readonly TagEquipment[],
  /** Story 14.6: a company type's definition, which carries its prefix (`tagPrefixOf`). */
  definition?: { tag_prefix?: string | undefined } | null,
): string {
  const prefix = tagPrefixOf(type, definition, LEGACY_TAG_PREFIX);
  if (type === 'transformador_forca') {
    for (let n = 1; ; n++) {
      const tag = `${prefix}-${n}`;
      if (!isTagTaken(tag, existingEquipment)) return tag;
    }
  }
  const base = `${prefix}-${locationCode(location)}`;
  if (!isTagTaken(base, existingEquipment)) return base;
  for (let n = 2; ; n++) {
    const tag = `${base}-${n}`;
    if (!isTagTaken(tag, existingEquipment)) return tag;
  }
}

/** A TAG prefix's numbered form, `PREFIX-<digits>` with any zeros: what `suggestTag` counts as holding a number. */
function numberedTag(prefix: string): RegExp {
  return new RegExp(`^${normalizeTag(prefix).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-0*(\\d+)$`);
}

/**
 * Story 24.8 (Bruno's question 29): the suggested TAG of a new block of `type`: `PREFIX-NN`, NN
 * the smallest number from 1 that no live TAG of the obra holds as `PREFIX-<number>` (whatever its
 * zeros and its case: "TR-1" holds 1), written with two digits ("DJ-01"; "DJ-100" from 100).
 * Removed rows never count. The local does not enter it, and a company type with a seeded type's
 * prefix shares that prefix's numbers.
 */
export function suggestTag(
  type: BlockTypeKey,
  existingEquipment: readonly TagEquipment[],
  /** Story 14.6: a company type's definition, which carries its prefix (`tagPrefixOf`). */
  definition?: { tag_prefix?: string | undefined } | null,
): string {
  const prefix = tagPrefixOf(type, definition);
  const pattern = numberedTag(prefix);
  const held = new Set<number>();
  for (const row of existingEquipment) {
    if (row.removed_at !== null) continue;
    const match = pattern.exec(normalizeTag(row.tag));
    if (match !== null) held.add(Number(match[1]));
  }
  let n = 1;
  while (held.has(n)) n += 1;
  return `${prefix}-${String(n).padStart(2, '0')}`;
}

/** Story 24.21: what a row's match key reads: its stored key and its TAG. */
export type MatchKeyEquipment = Pick<EquipmentRow, 'tag'> & { reuse_key?: string | undefined };

/**
 * Story 24.21: the key the reuse of an obra's equipment compares a placement with: the row's
 * stored `reuse_key` (written once at its creation), else, for a row from before the story, its
 * TAG; both trimmed and uppercased. Every reader of the reuse goes through it.
 */
export function equipmentMatchKey(row: MatchKeyEquipment): string {
  return normalizeTag(row.reuse_key ?? row.tag);
}

/**
 * Story 24.21: the reuse key of an equipment of `type` added on `location` outside "Novo
 * relatório" (the palette, "Duplicar", "Fotografar equipamento"): the frozen rule's TAG for the
 * placement, free among the match keys of the obra's live equipment (a row from before the story
 * counted by its TAG), so a relatório saved with "Salvar como template" finds it again.
 */
export function reuseKeyFor(
  type: BlockTypeKey,
  location: TagLocation,
  equipment: readonly (MatchKeyEquipment & Pick<EquipmentRow, 'removed_at'>)[],
  definition?: { tag_prefix?: string | undefined } | null,
): string {
  const keys = equipment.filter((row) => row.removed_at === null).map((row): TagEquipment => ({ tag: equipmentMatchKey(row), removed_at: null }));
  return normalizeTag(legacySuggestTag(type, location, keys, definition));
}
