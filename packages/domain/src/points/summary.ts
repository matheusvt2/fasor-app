import type { PointRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { naoEnsaiadasText } from '../relatorio/progress.ts';
import { siteLocalOf, sitePointTitle } from '../relatorio/site-checklist.ts';
import { locationTree, treeNodes, type TreeEquipmentNode, type TreeLocationNode } from '../relatorio/tree.ts';
import { plural } from '../text/plural.ts';
import { equipmentPointTitle } from './derived.ts';
import { livePoints, pointsWithoutAction } from './checks.ts';

/*
 * Story 6.6: section 8 as data. Its entries are the live points in `order_key` order; the counts
 * and texts the Points surface and Sumário row 8 show are composed here once (AD-1, AD-13).
 * ~~Then the derived entries (`derivedPoints`: the untested sheets and, Story 22.5, every NC row,
 * out test and Reprovado sheet).~~ Fix batch e24h (Matheus, 2026-11-10): a point exists only when
 * the technician creates it; a ficha finding with no stored point is no entry, no count, no bullet.
 */

type PointsSnapshot = Pick<RelatorioSnapshot, 'blocks' | 'points'>;

/** Fix batch e24h: a live point; the derived kind is gone. */
export type SectionEightEntry = { kind: 'point'; point: PointRow };

const SEP = ' · ';

/** Every section 8 entry, in print order: the live points (fix batch e24h: only they). */
export function sectionEightEntries(snapshot: Pick<RelatorioSnapshot, 'points'>): SectionEightEntry[] {
  return livePoints(snapshot.points).map((point) => ({ kind: 'point' as const, point }));
}

// authored: the title of a point linked to no equipment (the mock's free "Título" is not in the entity).
export const POINT_TITLE_GENERAL = 'Geral';

/*
 * K-15 (full review 2026-09-30): the equipment nodes of a tree by equipment id, the first in
 * drawing order standing, built once per tree (`locationTree` is memoized, so every card of
 * one render reads one index).
 */
const equipmentIndexByTree = new WeakMap<readonly TreeLocationNode[], Map<string, TreeEquipmentNode>>();

function equipmentNodeIndex(tree: readonly TreeLocationNode[]): Map<string, TreeEquipmentNode> {
  let index = equipmentIndexByTree.get(tree);
  if (index === undefined) {
    index = new Map();
    for (const node of treeNodes(tree)) {
      if (node.kind === 'equipment' && node.equipmentId !== null && !index.has(node.equipmentId)) index.set(node.equipmentId, node);
    }
    equipmentIndexByTree.set(tree, index);
  }
  return index;
}

/**
 * A point's card title: its linked equipment as section 8 names it ("SEC-C12 · 1° Subsolo ›
 * Coluna 12"); Story 14.3: for a point created from a site item, its local ("1° Subsolo ·
 * Verificações do local", `sitePointTitle`) while that local is live; else "Geral" (also for
 * equipment no live sheet of this relatório holds, and for a local that is not live here).
 *
 * 2026-10-13 (review of batch e14b): the local is resolved as every site reader resolves it
 * (`siteLocalOf`): a live root cabine of a relatório whose seed ships a site list. A
 * `location_id` naming a painel, a coluna or no location reads "Geral".
 */
export function pointTitle(
  point: Pick<PointRow, 'equipment_id'> & { location_id?: string | null },
  snapshot: Pick<RelatorioSnapshot, 'relatorio' | 'locations' | 'blocks' | 'equipment'>,
): string {
  if (point.equipment_id !== null) {
    const node = equipmentNodeIndex(locationTree(snapshot)).get(point.equipment_id);
    if (node !== undefined) return equipmentPointTitle(node, snapshot);
  }
  const locationId = point.location_id ?? null;
  if (locationId !== null) {
    const local = siteLocalOf(snapshot, locationId);
    if (local !== null) return sitePointTitle(local.name);
  }
  return POINT_TITLE_GENERAL;
}

export interface PointsSummary {
  /** Every section 8 entry: the live points (fix batch e24h: ~~plus derived entries~~ only they). */
  total: number;
  /** Live manual points with no Ação recomendada. */
  semAcao: number;
  /** Live points written from a sheet still untested (fix batch e24h: ~~derived Não ensaiado entries plus~~ only they). */
  naoEnsaiadas: number;
}

export function pointsSummary(snapshot: PointsSnapshot): PointsSummary {
  const live = livePoints(snapshot.points);
  return {
    total: live.length,
    semAcao: pointsWithoutAction(snapshot.points).length,
    // A point written from an untested sheet counts only while that sheet is still untested,
    // so row 8 agrees with row 9 once the sheet is tested again.
    naoEnsaiadas:
      live.filter(
        (point) =>
          point.origin === 'not_tested' &&
          point.equipment_id !== null &&
          snapshot.blocks.some((block) => block.removed_at === null && block.equipment_id === point.equipment_id && block.not_tested !== null),
      ).length,
  };
}

// authored: row 8 of a relatório with no point and no untested sheet.
export const NO_POINTS_TEXT = 'Nenhum ponto de atenção';

/**
 * Sumário row 8: "5 pontos · 1 sem ação · 3 não ensaiadas", the parts that are not 0; "Nenhum
 * ponto de atenção" when empty. "não ensaiadas" counts the live points written from a sheet still
 * untested. ~~Story 15.2 (F34, `40-relatorio-overview.html`): the derived (automatic) entries are
 * counted once, after the live points ("4 pontos + 1 automático · 1 sem ação"; "1 automático"
 * alone, fix batch fx15q).~~ Fix batch e24h (2026-11-10): no automatic entry exists any more.
 */
export function pointsSummaryText(summary: PointsSummary): string {
  if (summary.total === 0) return NO_POINTS_TEXT;
  return [
    plural(summary.total, 'ponto', 'pontos'),
    summary.semAcao > 0 ? `${summary.semAcao} sem ação` : null,
    summary.naoEnsaiadas > 0 ? naoEnsaiadasText(summary.naoEnsaiadas) : null,
  ]
    .filter((part): part is string => part !== null)
    .join(SEP);
}

/** `.poa-order` of a live point: "1 de 4" (`72-pontos.html`). */
export function pointOrderText(position: number, total: number): string {
  return `${position} de ${total}`;
}

/**
 * The Points surface heading: "Pontos de atenção (4)" (`72-pontos.html`), "Pontos de atenção"
 * with none at all. ~~"Pontos de atenção (4 + 1 automático)" with derived entries.~~ Fix batch
 * e24h (2026-11-10): the live points only.
 */
export function pointsHeadingText(live: number): string {
  const title = 'Pontos de atenção';
  return live === 0 ? title : `${title} (${live})`;
}
