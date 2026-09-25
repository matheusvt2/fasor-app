import { initialOrderKey, orderKeyAfter, orderKeyForMove, sortByOrderKey } from '../ops/order-key.ts';
import type { PointRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { plural } from '../text/plural.ts';
import { extractPhotoRefs } from './refs.ts';

/*
 * Story 6.6: the section 8 facts `preIssue` reads (points with no action, points citing a
 * removed photo). Kept apart from `summary.ts`, which reads the location tree, so the
 * pre-issue check imports no tree code.
 */

/** The live points of a relatório in `order_key` order: the manual part of section 8, reorderable. */
export function livePoints(points: readonly PointRow[]): PointRow[] {
  return sortByOrderKey(points.filter((point) => point.removed_at === null));
}

/** Whether a live point written from an untested sheet already stands for this equipment (it replaces the derived entry). */
export function hasNotTestedPoint(points: readonly PointRow[], equipmentId: string | null): boolean {
  return equipmentId !== null && points.some((point) => point.removed_at === null && point.origin === 'not_tested' && point.equipment_id === equipmentId);
}

/** Live manual points with a blank Ação recomendada (a point written from an untested sheet is not asked for one). */
export function pointsWithoutAction(points: readonly PointRow[]): PointRow[] {
  return livePoints(points).filter((point) => point.origin === 'manual' && (point.action === null || point.action.trim() === ''));
}

/** "1 ponto sem ação" / "2 pontos sem ação": the pre-issue row of manual points with no action. */
export function pointsSemAcaoText(n: number): string {
  return `${plural(n, 'ponto', 'pontos')} sem ação`;
}

/** "Ponto 2 cita uma foto removida": the pre-issue row of a point whose text references a photo that is gone. */
export function pointPhotoRemovedText(position: number): string {
  // authored: no mock draws this row.
  return `Ponto ${position} cita uma foto removida`;
}

/** The live points (with their 1-based position) whose text references a photo the relatório no longer holds live. */
export function pointsWithRemovedPhotos(snapshot: Pick<RelatorioSnapshot, 'points' | 'files'>): { point: PointRow; position: number }[] {
  const livePhotos = new Set(snapshot.files.filter((file) => file.kind === 'photo' && file.removed_at === null).map((file) => file.id));
  return livePoints(snapshot.points)
    .map((point, i) => ({ point, position: i + 1 }))
    .filter(({ point }) => extractPhotoRefs(point.text).some((id) => !livePhotos.has(id)));
}

export interface NewPointInput {
  id: string;
  relatorioId: string;
  text: string;
  equipmentId: string | null;
  origin: PointRow['origin'];
  action: string | null;
}

/** A new point, placed after every live point (the end of the manual part of section 8). */
export function newPointRow(input: NewPointInput, points: readonly PointRow[]): PointRow {
  const live = livePoints(points);
  const last = live.at(-1);
  return {
    id: input.id,
    relatorio_id: input.relatorioId,
    text: input.text,
    equipment_id: input.equipmentId,
    origin: input.origin,
    order_key: last === undefined ? initialOrderKey(0) : orderKeyAfter(live, last.id),
    removed_at: null,
    action: input.action,
    priority: null,
    deadline: null,
    owner: null,
  };
}

/** The key a live point takes when moved to `toIndex` (0-based) among the live points; null when it stays. */
export function pointMoveOrderKey(points: readonly PointRow[], id: string, toIndex: number): string | null {
  return orderKeyForMove(livePoints(points), id, toIndex);
}

/** The announcement of a move: "Ponto de atenção movido: 1 de 3 na seção 8". */
export function pointMovedText(position: number, total: number): string {
  // authored: the mock's toast ("Ponto movido uma posição para cima — a seção 8 segue esta
  // ordem") names no position; the announcement says where the point landed.
  return `Ponto de atenção movido: ${position} de ${total} na seção 8`;
}

/** The toast after "Concluir": "Ponto de atenção salvo · 4 de 4 na seção 8" (`72-pontos.html`). */
export function pointSavedText(position: number, total: number): string {
  return `Ponto de atenção salvo · ${position} de ${total} na seção 8`;
}
