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

/**
 * Live manual points with a blank Ação recomendada (a point written from an untested sheet is
 * not asked for one). Story 22.5: a point written from an NC row, an out reading or a Reprovado
 * sheet is the engineer's own, asked for one as a manual point is.
 */
export function pointsWithoutAction(points: readonly PointRow[]): PointRow[] {
  return livePoints(points).filter((point) => point.origin !== 'not_tested' && (point.action === null || point.action.trim() === ''));
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
  /**
   * Story 22.5: the source of a point written from a derived entry (`origin` `nc` with its
   * checklist item, `reading` with its test). ~~Absent or null: the row carries no key, so every
   * other point keeps the row shape from before the fields existed.~~ e22f N4: `item_key` is
   * always written (null when absent), the mark of a contract-31 row; `test_key` only when set.
   */
  itemKey?: string | null;
  testKey?: string | null;
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
    // e22f N4: always written from contract 31 on (null when the point names no item), so a row
    // with no `item_key` key at all is known to predate it (`predatesItemSource`).
    item_key: input.itemKey ?? null,
    ...((input.testKey ?? null) === null ? {} : { test_key: input.testKey }),
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
 * a relatório without section 8 says the point does not print instead of naming the section.
 * UX pass 2026-10-22 (F43): `section8` is how the relatório names section 8
 * (`sectionRefText`: "seção 4" by its Sumário position, 'seção "Pontos de atenção"' when absent);
 * `section8Prints` false says it does not print.
 */
export function pointMovedText(position: number, total: number, section8Prints: boolean, section8: string): string {
  // authored: the mock's toast ("Ponto movido uma posição para cima — a seção 8 segue esta
  // ordem") names no position; the announcement says where the point landed.
  if (section8Prints) return `Ponto de atenção movido: ${position} de ${total} na ${section8}`;
  // authored: p020 P-1b, a relatório without section 8.
  return `Ponto de atenção movido: ${position} de ${total} · não sai no documento: o relatório não tem a ${section8}`;
}

/**
 * The toast after "Concluir": "Ponto de atenção salvo · 4 de 4 na seção 8" (`72-pontos.html`).
 * p020 P-1b: `section8Prints` false names no section 8 (the relatório has none). F43:
 * `section8` as in `pointMovedText`.
 */
export function pointSavedText(position: number, total: number, section8Prints: boolean, section8: string): string {
  if (section8Prints) return `Ponto de atenção salvo · ${position} de ${total} na ${section8}`;
  // authored: p020 P-1b, a relatório without section 8.
  return `Ponto de atenção salvo · ${position} de ${total} · não sai no documento: o relatório não tem a ${section8}`;
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
 *
 * Story 22.5: a point written from the row since (`origin` `nc`) names its item (`item_key`):
 * it matches by that, photo or not, when `itemKey` is given.
 */
export function ncRowPointPositions(points: readonly PointRow[], owner: string | null | NcRowOwner, itemPhotoIds: readonly string[], itemKey: string | null = null): number[] {
  const equipmentId = typeof owner === 'string' ? owner : (owner?.equipmentId ?? null);
  const locationId = owner === null || typeof owner === 'string' ? null : (owner.locationId ?? null);
  if (equipmentId === null && locationId === null) return [];
  return livePoints(points).flatMap((point, i) => {
    const ofEquipment = equipmentId !== null && point.equipment_id === equipmentId;
    const ofLocal = locationId !== null && (point.location_id ?? null) === locationId;
    if (!ofEquipment && !ofLocal) return [];
    if (point.origin === 'nc') return itemKey !== null && point.item_key === itemKey ? [i + 1] : [];
    if (point.origin !== 'manual' || itemPhotoIds.length === 0) return [];
    return extractPhotoRefs(point.text).some((id) => itemPhotoIds.includes(id)) ? [i + 1] : [];
  });
}

/**
 * Story 24.7 (every seed, stored points only): the live points a checklist row asks about when
 * its result leaves NC for C or for N.A.: the points written from that row (`origin` `nc`, the
 * row's `item_key`, the same equipment or local), by "Criar ponto de atenção" or, before fix
 * batch e24h, by "Editar" on an automatic entry. A point added by hand (`manual`) never is. In
 * `livePoints` order, the order the row's mark (`ncRowPointPositions`) numbers them. Empty for
 * any other change.
 */
export function pointsAskedOnLeave(points: readonly PointRow[], owner: NcRowOwner, itemKey: string, from: string | null, to: string | null): PointRow[] {
  if (from !== 'NC' || (to !== 'C' && to !== 'NA')) return [];
  const equipmentId = owner.equipmentId ?? null;
  const locationId = owner.locationId ?? null;
  if (equipmentId === null && locationId === null) return [];
  return livePoints(points).filter(
    (point) =>
      point.origin === 'nc' &&
      point.item_key === itemKey &&
      ((equipmentId !== null && point.equipment_id === equipmentId) || (locationId !== null && (point.location_id ?? null) === locationId)),
  );
}

/** Story 24.7: the words of the question a row asks about its points (`pointsAskedOnLeave`). */
export interface PointQuestionText {
  title: string;
  description: string;
  /** The toast after "Remover ponto", which offers "Desfazer". */
  removed: string;
}

/**
 * Story 24.7: the question's words, the points named by their section 8 position (as the row's
 * mark names them) and the row's new result. The singular title and the Conforme description
 * are the mock's (`60-ficha.html` `#ficha-dlg-ponto-item`); null with no point.
 */
export function pointQuestionText(points: readonly PointRow[], asked: readonly PointRow[], to: 'C' | 'NA'): PointQuestionText | null {
  const order = livePoints(points).map((point) => point.id);
  const positions = asked.map((point) => order.indexOf(point.id) + 1).filter((position) => position > 0);
  if (positions.length === 0) return null;
  // authored (e24b, listed for Bruno): the N.A. form of the mock's "que agora está Conforme".
  const now = to === 'C' ? 'que agora está Conforme' : 'que agora está marcado como Não se aplica';
  const list = listPtBr(positions.map(String));
  if (positions.length === 1) {
    return {
      title: 'Remover o ponto de atenção deste item?',
      description: `O ponto de atenção ${list} foi criado a partir deste item, ${now}. Se mantiver, ele fica com a marca “Origem resolvida”.`,
      removed: `Ponto de atenção ${list} removido`,
    };
  }
  // authored (e24b, listed for Bruno): the plural forms of the mock's question, description and toast.
  return {
    title: 'Remover os pontos de atenção deste item?',
    description: `Os pontos de atenção ${list} foram criados a partir deste item, ${now}. Se mantiver, eles ficam com a marca “Origem resolvida”.`,
    removed: `Pontos de atenção ${list} removidos`,
  };
}

/** E6-Q11: the NC row's mark beside its actions: "Ponto de atenção 1", "Pontos de atenção 1 e 3"; null with none. */
export function ncRowPointsText(positions: readonly number[]): string | null {
  if (positions.length === 0) return null;
  // authored: no mock draws the mark (open for Bruno).
  return positions.length === 1 ? `Ponto de atenção ${positions[0]}` : `Pontos de atenção ${listPtBr(positions.map(String))}`;
}
