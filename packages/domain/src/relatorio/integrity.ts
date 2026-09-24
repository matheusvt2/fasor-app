import type { EquipmentRow } from '../schemas/entities.ts';
import { normalizeTag } from './tag.ts';

/*
 * Story 4.1: the kernel `integrity` surface (Epic 4 context: "TAG uniqueness is a kernel
 * integrity check ... never a database constraint"). A finding is data two devices may
 * both produce after a merge; nothing here throws or rejects. Later rules (unresolved
 * section variables, instruments still referenced, ...) append their own `kind` to the
 * union and their own `push` below, so the Sumário and the Export read one list.
 */

export interface DuplicateTagFinding {
  kind: 'duplicate_tag';
  /** The tag as compared (trimmed, uppercased). */
  tag: string;
  /** Every live equipment row carrying it, in input order. */
  equipment_ids: string[];
}

export type IntegrityFinding = DuplicateTagFinding;

export interface IntegrityInput {
  equipment: readonly Pick<EquipmentRow, 'id' | 'tag' | 'removed_at'>[];
}

/** Every integrity finding of a project's equipment (a `RelatorioSnapshot` fits the input). */
export function integrityFindings(input: IntegrityInput): IntegrityFinding[] {
  const byTag = new Map<string, string[]>();
  for (const row of input.equipment) {
    if (row.removed_at !== null) continue;
    const tag = normalizeTag(row.tag);
    const ids = byTag.get(tag);
    if (ids === undefined) byTag.set(tag, [row.id]);
    else ids.push(row.id);
  }
  const findings: IntegrityFinding[] = [];
  for (const [tag, equipment_ids] of byTag) {
    if (equipment_ids.length > 1) findings.push({ kind: 'duplicate_tag', tag, equipment_ids });
  }
  return findings;
}
