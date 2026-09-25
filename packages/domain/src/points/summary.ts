import type { PointRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { naoEnsaiadasText } from '../relatorio/progress.ts';
import { locationTree, treeNodes } from '../relatorio/tree.ts';
import { plural } from '../text/plural.ts';
import { derivedPoints, equipmentPointTitle, type DerivedPoint } from './derived.ts';
import { livePoints, pointsWithoutAction } from './checks.ts';

/*
 * Story 6.6: section 8 as data. Its entries are the live points in `order_key` order, then
 * the derived untested entries (`derivedPoints`); the counts and texts the Points surface
 * and Sumário row 8 show are composed here once (AD-1, AD-13).
 */

type PointsSnapshot = Pick<RelatorioSnapshot, 'locations' | 'blocks' | 'equipment' | 'points'>;

export type SectionEightEntry = { kind: 'point'; point: PointRow } | { kind: 'derived'; derived: DerivedPoint };

const SEP = ' · ';

/** Every section 8 entry, in print order: the live points, then the derived untested entries. */
export function sectionEightEntries(snapshot: PointsSnapshot): SectionEightEntry[] {
  return [
    ...livePoints(snapshot.points).map((point) => ({ kind: 'point' as const, point })),
    ...derivedPoints(snapshot).map((derived) => ({ kind: 'derived' as const, derived })),
  ];
}

// authored: the title of a point linked to no equipment (the mock's free "Título" is not in the entity).
export const POINT_TITLE_GENERAL = 'Geral';

/**
 * A point's card title: its linked equipment as section 8 names it ("SEC-C12 · 1° Subsolo ›
 * Coluna 12"), else "Geral" (also for equipment no live sheet of this relatório holds).
 */
export function pointTitle(point: Pick<PointRow, 'equipment_id'>, snapshot: Pick<RelatorioSnapshot, 'locations' | 'blocks' | 'equipment'>): string {
  if (point.equipment_id === null) return POINT_TITLE_GENERAL;
  const node = treeNodes(locationTree(snapshot)).find((n) => n.kind === 'equipment' && n.equipmentId === point.equipment_id);
  if (node === undefined || node.kind !== 'equipment') return POINT_TITLE_GENERAL;
  return equipmentPointTitle(node, snapshot);
}

export interface PointsSummary {
  /** Every section 8 entry: live points plus derived entries. */
  total: number;
  /** Live manual points with no Ação recomendada. */
  semAcao: number;
  /** Derived entries plus live points written from an untested sheet. */
  naoEnsaiadas: number;
}

export function pointsSummary(snapshot: PointsSnapshot): PointsSummary {
  const live = livePoints(snapshot.points);
  const derived = derivedPoints(snapshot);
  return {
    total: live.length + derived.length,
    semAcao: pointsWithoutAction(snapshot.points).length,
    // A point written from an untested sheet counts only while that sheet is still untested,
    // so row 8 agrees with row 9 once the sheet is tested again.
    naoEnsaiadas:
      derived.length +
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

/** Sumário row 8: "5 pontos · 1 sem ação · 3 não ensaiadas", the parts that are not 0; "Nenhum ponto de atenção" when empty. */
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
 * The Points surface heading: "Pontos de atenção (4 + 1 automático)" (`72-pontos.html`),
 * "Pontos de atenção (4)" with no derived entry, "Pontos de atenção" with none at all.
 */
export function pointsHeadingText(live: number, derived: number): string {
  const title = 'Pontos de atenção';
  if (live + derived === 0) return title;
  if (derived === 0) return `${title} (${live})`;
  return `${title} (${live} + ${plural(derived, 'automático', 'automáticos')})`;
}
