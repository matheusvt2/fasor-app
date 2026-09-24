import { type EquipmentBlockType } from '../schemas/block-config.ts';
import type { EquipmentRow } from '../schemas/entities.ts';

/*
 * Story 4.1: the TAG an equipment block is born with (Smart Input › Equipment identity).
 * The scheme is deterministic so the office and the field palette (Story 4.5) name a block
 * the same way: a type prefix plus the column code (`SEC-C05`), a `-2` suffix on
 * collision, the cabine's short name when the block sits on the cabine itself
 * (`CE-ENEL`), and a project-wide running number for transformers (`TR-3`). Uniqueness is
 * an `integrity` finding (`integrity.ts`), never a constraint.
 */

export const TAG_PREFIX: Readonly<Record<EquipmentBlockType, string>> = {
  cabos_entrada: 'CE',
  para_raio: 'PR',
  chave_seccionadora: 'SEC',
  disjuntor_mt: 'DJ',
  tp: 'TP',
  tc: 'TC',
  cabos_saida: 'CS',
  transformador_forca: 'TR',
};

/** What `suggestTag` needs of the location a block is placed on. */
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
 * The suggested TAG of a new block of `type` on `location`, free among `existingEquipment`
 * (removed rows never count): `PREFIX-CODE`, then `PREFIX-CODE-2`, `-3`, ...; a
 * transformer is `TR-n` with the smallest free n across the project.
 */
export function suggestTag(type: EquipmentBlockType, location: TagLocation, existingEquipment: readonly TagEquipment[]): string {
  if (type === 'transformador_forca') {
    for (let n = 1; ; n++) {
      const tag = `${TAG_PREFIX[type]}-${n}`;
      if (!isTagTaken(tag, existingEquipment)) return tag;
    }
  }
  const base = `${TAG_PREFIX[type]}-${locationCode(location)}`;
  if (!isTagTaken(base, existingEquipment)) return base;
  for (let n = 2; ; n++) {
    const tag = `${base}-${n}`;
    if (!isTagTaken(tag, existingEquipment)) return tag;
  }
}
