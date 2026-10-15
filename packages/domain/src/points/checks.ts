import { initialOrderKey, orderKeyAfter, orderKeyForMove, sortByOrderKey } from '../ops/order-key.ts';
import { pointsOnLiveLocals } from '../relatorio/location-live.ts';
import type { LocationRow, PointRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { listPtBr, plural } from '../text/plural.ts';
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

/**
 * Epic 14 QA Q-2: the points section 8 draws, from raw rows: the live points in `order_key`
 * order, less those on a local that is not live (`pointsOnLiveLocals`, the snapshot's rule).
 * `locations` are the relatório's location rows, removed ones included, so a removed ancestor
 * is seen. The reorder key and the "N de M" place read this, as the list reads the snapshot.
 */
export function livePointsOfLocals(points: readonly PointRow[], locations: readonly Pick<LocationRow, 'id' | 'parent_id' | 'removed_at'>[]): PointRow[] {
  return pointsOnLiveLocals(livePoints(points), locations);
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
  /**
   * Story 14.3: the local of a point created from a site item ("Verificações do local"); its
   * `equipmentId` is then null. Absent or null: the row carries no `location_id` key, so a
   * point of an equipment or a general one keeps the row shape from before the field existed.
   */
  locationId?: string | null;
}

/** A new point, placed after every live point (the end of the manual part of section 8). */
export function newPointRow(input: NewPointInput, points: readonly PointRow[]): PointRow {
  const live = livePoints(points);
  const last = live.at(-1);
  const locationId = input.locationId ?? null;
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
    ...(locationId === null ? {} : { location_id: locationId }),
  };
}

/**
 * The key a live point takes when moved to `toIndex` (0-based) among the points section 8
 * draws (`livePointsOfLocals`: a point on a removed local holds no slot); null when it stays.
 */
export function pointMoveOrderKey(
  points: readonly PointRow[],
  locations: readonly Pick<LocationRow, 'id' | 'parent_id' | 'removed_at'>[],
  id: string,
  toIndex: number,
): string | null {
  return orderKeyForMove(livePointsOfLocals(points, locations), id, toIndex);
}

/**
 * The announcement of a move: "Ponto de atenção movido: 1 de 3 na seção 8". p020 P-1b:
 * `section8Prints` false (the relatório has no section 8, `printsSection`) says the point
 * does not print instead of naming the section.
 */
export function pointMovedText(position: number, total: number, section8Prints = true): string {
  // authored: the mock's toast ("Ponto movido uma posição para cima — a seção 8 segue esta
  // ordem") names no position; the announcement says where the point landed.
  if (section8Prints) return `Ponto de atenção movido: ${position} de ${total} na seção 8`;
  // authored: p020 P-1b, a relatório without section 8.
  return `Ponto de atenção movido: ${position} de ${total} · não sai no documento: o relatório não tem a seção 8`;
}

/**
 * The toast after "Concluir": "Ponto de atenção salvo · 4 de 4 na seção 8" (`72-pontos.html`).
 * p020 P-1b: `section8Prints` false names no section 8 (the relatório has none).
 */
export function pointSavedText(position: number, total: number, section8Prints = true): string {
  if (section8Prints) return `Ponto de atenção salvo · ${position} de ${total} na seção 8`;
  // authored: p020 P-1b, a relatório without section 8.
  return `Ponto de atenção salvo · ${position} de ${total} · não sai no documento: o relatório não tem a seção 8`;
}

/** E6-Q11: the 1-based section 8 positions of the live points whose text cites `photoId`. */
export function pointsCitingPhoto(points: readonly PointRow[], photoId: string): number[] {
  return livePoints(points).flatMap((point, i) => (extractPhotoRefs(point.text).includes(photoId) ? [i + 1] : []));
}

/**
 * E6-Q11: the Remover confirm's line for a photo points cite, null when none does:
 * "Ela é citada no ponto de atenção 2, que passa a mostrar Foto removida."
 */
export function photoCitedByText(positions: readonly number[]): string | null {
  if (positions.length === 0) return null;
  // authored: no mock draws this line (open for Bruno).
  return positions.length === 1
    ? `Ela é citada no ponto de atenção ${positions[0]}, que passa a mostrar Foto removida.`
    : `Ela é citada nos pontos de atenção ${listPtBr(positions.map(String))}, que passam a mostrar Foto removida.`;
}

/** What an NC row belongs to: a sheet's equipment, or (Story 14.3) the local of a site item. */
export interface NcRowOwner {
  equipmentId?: string | null;
  locationId?: string | null;
}

/**
 * E6-Q11: the live points an NC row already has, by section 8 position. A point stores no
 * checklist item, so the row matches by what "Criar ponto de atenção" put in it: the
 * sheet's equipment and the item's photos -- the points of that equipment citing one of the
 * item's photos. An item with no photo gets no mark: nothing tells its point from another
 * NC item's of the same sheet.
 *
 * Story 14.3: a site item's row matches the same way by its local: the manual points whose
 * `location_id` is that local, citing one of the item's photos. `owner` is the sheet's
 * equipment id (as before) or an `NcRowOwner` naming the equipment or the local.
 */
export function ncRowPointPositions(points: readonly PointRow[], owner: string | null | NcRowOwner, itemPhotoIds: readonly string[]): number[] {
  const equipmentId = typeof owner === 'string' ? owner : (owner?.equipmentId ?? null);
  const locationId = owner === null || typeof owner === 'string' ? null : (owner.locationId ?? null);
  if ((equipmentId === null && locationId === null) || itemPhotoIds.length === 0) return [];
  return livePoints(points).flatMap((point, i) => {
    if (point.origin !== 'manual') return [];
    const ofEquipment = equipmentId !== null && point.equipment_id === equipmentId;
    const ofLocal = locationId !== null && (point.location_id ?? null) === locationId;
    if (!ofEquipment && !ofLocal) return [];
    return extractPhotoRefs(point.text).some((id) => itemPhotoIds.includes(id)) ? [i + 1] : [];
  });
}

/** E6-Q11: the NC row's mark beside its actions: "Ponto de atenção 1", "Pontos de atenção 1 e 3"; null with none. */
export function ncRowPointsText(positions: readonly number[]): string | null {
  if (positions.length === 0) return null;
  // authored: no mock draws the mark (open for Bruno).
  return positions.length === 1 ? `Ponto de atenção ${positions[0]}` : `Pontos de atenção ${listPtBr(positions.map(String))}`;
}
