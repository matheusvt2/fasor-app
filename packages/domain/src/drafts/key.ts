import { z } from 'zod';

/*
 * AD-1/AD-2: uncommitted field text and unsaved dialog state are persisted to a
 * per-user `drafts` table "keyed by surface and entity". The key is computed here,
 * once, so the device store and every surface that registers a draft source agree
 * on what identifies one draft. Pure: no clock, no I/O.
 */

/** A segment of a draft key: the vocabulary of surfaces, entity ids (uuidv7) and field keys. */
const SEGMENT = /^[a-z0-9][a-z0-9_-]*$/;

const segmentSchema = z.string().regex(SEGMENT);

export const draftTargetSchema = z.object({
  /** The surface that owns the uncommitted value (`fixture-field`, a sheet, a dialog). */
  surface: segmentSchema,
  /** The entity the surface is editing. */
  entity_id: segmentSchema,
  /** The field inside the entity, when the surface holds more than one. */
  field: segmentSchema.optional(),
});

export type DraftTarget = z.infer<typeof draftTargetSchema>;

/** The separator: forbidden inside a segment, so the join is unambiguous. */
const SEP = '/';

/**
 * The stable key of one draft. Two targets produce the same key only when their
 * three segments are equal: no segment may contain the separator, and a missing
 * `field` shortens the key rather than leaving an empty segment.
 */
export function draftKey(target: DraftTarget): string {
  const { surface, entity_id, field } = draftTargetSchema.parse(target);
  return field === undefined ? `${surface}${SEP}${entity_id}` : `${surface}${SEP}${entity_id}${SEP}${field}`;
}

/** The target a key was built from, or null when the string is not one of ours. */
export function parseDraftKey(key: string): DraftTarget | null {
  const parts = key.split(SEP);
  if (parts.length !== 2 && parts.length !== 3) return null;
  const parsed = draftTargetSchema.safeParse({
    surface: parts[0],
    entity_id: parts[1],
    ...(parts.length === 3 ? { field: parts[2] } : {}),
  });
  return parsed.success ? parsed.data : null;
}
