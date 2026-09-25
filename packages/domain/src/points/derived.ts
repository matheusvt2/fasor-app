import type { BlockRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { getSeed } from '../seed/definitions.ts';
import { locationPathText } from '../relatorio/location-path.ts';
import { locationTree, treeNodes, type TreeEquipmentNode } from '../relatorio/tree.ts';

/*
 * Story 6.6 (FR-31, E3-A9 bullet 4): every equipment sheet marked Não ensaiado lists
 * itself in section 8, after the manual points, in tree order (the section 9 order of
 * `sheetOrder`), with its reason and the justification the seed prints for it (the typed
 * text for "Outro"). The entry is derived, never stored: clearing the mark takes it away,
 * and a live point with `origin: 'not_tested'` for the same equipment (written from that
 * sheet) replaces it. A block with no equipment is never suppressed.
 */

export interface DerivedPoint {
  block_id: string;
  equipment_id: string | null;
  /** The TAG, else the type's name: what "Abrir ficha ⟨TAG⟩" names. */
  name: string;
  /** "DJ-C14 · 1° Subsolo › Coluna 14": the TAG (else the type's name) and where it sits. */
  title: string;
  /** The seed `not_tested_reasons` key. */
  reason_key: string;
  /** The seed's label of the reason ("Impossibilidade de desligamento", "Outro"). */
  reason_label: string;
  /** What section 8 prints for it: the seed's justification, or the typed text of "Outro"; null when there is none. */
  justification: string | null;
}

const SEP = ' · ';

type TreeSnapshot = Pick<RelatorioSnapshot, 'locations' | 'blocks' | 'equipment'>;

/** The seed's label and justification of a sheet's Não ensaiado reason; null when it was tested. */
function reasonOf(block: Pick<BlockRow, 'not_tested' | 'seed_version'>): { key: string; label: string; justification: string | null } | null {
  const mark = block.not_tested;
  if (mark === null) return null;
  const typed = mark.text !== null && mark.text.trim() !== '' ? mark.text.trim() : null;
  let seeded: { label: string; justification: string | null } | undefined;
  try {
    seeded = getSeed(block.seed_version, 'cabine_primaria').not_tested_reasons.find((reason) => reason.key === mark.reason);
  } catch {
    seeded = undefined;
  }
  return { key: mark.reason, label: seeded?.label ?? mark.reason, justification: seeded?.justification ?? typed };
}

/** The title of an equipment row as section 8 names it: "⟨TAG⟩ · ⟨path⟩", the TAG alone without a place. */
export function equipmentPointTitle(node: Pick<TreeEquipmentNode, 'name' | 'locationId'>, snapshot: Pick<RelatorioSnapshot, 'locations'>): string {
  const path = locationPathText(snapshot.locations, node.locationId);
  return path === '' ? node.name : `${node.name}${SEP}${path}`;
}

/** The derived section 8 entries of a relatório, in tree order, after suppression. */
export function derivedPoints(snapshot: TreeSnapshot & Pick<RelatorioSnapshot, 'points'>): DerivedPoint[] {
  const suppressed = new Set(
    snapshot.points
      .filter((point) => point.removed_at === null && point.origin === 'not_tested' && point.equipment_id !== null)
      .map((point) => point.equipment_id!),
  );
  const blocks = new Map(snapshot.blocks.map((block) => [block.id, block]));
  const out: DerivedPoint[] = [];
  for (const node of treeNodes(locationTree(snapshot))) {
    if (node.kind !== 'equipment') continue;
    const block = blocks.get(node.blockId);
    if (block === undefined || block.removed_at !== null) continue;
    const reason = reasonOf(block);
    if (reason === null) continue;
    if (block.equipment_id !== null && suppressed.has(block.equipment_id)) continue;
    out.push({
      block_id: block.id,
      equipment_id: block.equipment_id,
      name: node.name,
      title: equipmentPointTitle(node, snapshot),
      reason_key: reason.key,
      reason_label: reason.label,
      justification: reason.justification,
    });
  }
  return out;
}

export interface DerivedPointGroup {
  reason_key: string;
  justification: string | null;
  block_ids: string[];
}

/**
 * E3-A9 bullet 4, the data half: consecutive derived entries with the same reason and the
 * same justification form one group, so section 8 prints one bullet for them. Composing
 * that bullet's sentence is the renderer's (Epic 7).
 */
export function groupDerivedPoints(entries: readonly DerivedPoint[]): DerivedPointGroup[] {
  const groups: DerivedPointGroup[] = [];
  for (const entry of entries) {
    const last = groups.at(-1);
    if (last !== undefined && last.reason_key === entry.reason_key && last.justification === entry.justification) {
      last.block_ids.push(entry.block_id);
    } else {
      groups.push({ reason_key: entry.reason_key, justification: entry.justification, block_ids: [entry.block_id] });
    }
  }
  return groups;
}

/**
 * The `.not-tested-band` text of a derived card (`72-pontos.html`): "⟨reason⟩ — ⟨justification⟩",
 * the typed text alone for "Outro", the reason alone when nothing is printed for it.
 */
export function derivedPointReasonText(entry: Pick<DerivedPoint, 'reason_key' | 'reason_label' | 'justification'>): string {
  if (entry.justification === null) return entry.reason_label;
  if (entry.reason_key === 'outro') return entry.justification;
  return `${entry.reason_label} — ${entry.justification}`;
}

/** The text a point written from an untested sheet starts with: what section 8 would print for it; "" when nothing. */
export function notTestedPointText(block: Pick<BlockRow, 'not_tested' | 'seed_version'>): string {
  return reasonOf(block)?.justification ?? '';
}
