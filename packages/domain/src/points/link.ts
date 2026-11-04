import type { PointRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { photoEquipmentGroups, photoEquipmentOptions } from '../photos/gallery.ts';
import { sheetOrder } from '../relatorio/ficha.ts';
import { siteLocalOf, siteLocals, sitePointTitle } from '../relatorio/site-checklist.ts';
import { POINT_TITLE_GENERAL } from './summary.ts';

/*
 * Story 20.4: what a point of attention may be linked to, as the point editor's picker
 * "Equipamento ou local" offers it (AD-1/AD-13: the options, their order, their text and the
 * selected one are decided here once). A point names an equipment (`equipment_id`), a local
 * (`location_id`, a live root cabine of a relatório whose seed ships a site list) or neither
 * ("Geral"). A pick writes both fields every time (`pointLinkValues`), so a stale
 * `location_id` never survives a pick of an equipment.
 *
 * The groups follow the photo capture's "De qual equipamento?" (`photoEquipmentOptions`,
 * `photoEquipmentGroups`): each equipment by its TAG, type and place, in sheet order.
 */

type LinkSnapshot = Pick<RelatorioSnapshot, 'relatorio' | 'locations' | 'blocks' | 'equipment'>;

/** The key of the "Geral" option: a point linked to no equipment and no local. */
export const POINT_LINK_GENERAL_KEY = 'geral';

export interface PointLinkOption {
  /** `geral`, `local:{location id}` or `equipment:{equipment id}`. */
  key: string;
  equipmentId: string | null;
  locationId: string | null;
  /** The option's words: "Geral", "⟨local⟩ · Verificações do local", or "TAG · tipo · lugar". */
  text: string;
}

export interface PointLinkGroup {
  id: string;
  /** The group's heading: a local's name or a place; null for the group holding "Geral" alone. */
  label: string | null;
  options: PointLinkOption[];
}

const GENERAL_OPTION: PointLinkOption = { key: POINT_LINK_GENERAL_KEY, equipmentId: null, locationId: null, text: POINT_TITLE_GENERAL };

const equipmentKey = (equipmentId: string) => `equipment:${equipmentId}`;
const localKey = (locationId: string) => `local:${locationId}`;

/**
 * The picker's groups, in order: "Geral" alone; then each site local in tree order, its own
 * option ("⟨local⟩ · Verificações do local") first and the equipment of the sheets under it
 * after, in sheet order; then the equipment under no site local, grouped by place as the photo
 * capture groups it. A sheet with no equipment row is skipped, and an equipment appears once
 * (its first sheet in tree order stands, as `pointTitle` reads it).
 */
export function pointLinkGroups(snapshot: LinkSnapshot): PointLinkGroup[] {
  const textOf = new Map(photoEquipmentOptions(snapshot).map((option) => [option.blockId, option.text]));
  const locals = siteLocals(snapshot);
  const localIds = new Set(locals.map((local) => local.id));
  const parentOf = new Map(snapshot.locations.map((row) => [row.id, row.parent_id]));
  /** The site local a location hangs under (itself included), or null. */
  const localOf = (locationId: string): string | null => {
    const seen = new Set<string>();
    let at: string | null = locationId;
    while (at !== null && !seen.has(at)) {
      if (localIds.has(at)) return at;
      seen.add(at);
      at = parentOf.get(at) ?? null;
    }
    return null;
  };

  const placed = new Set<string>();
  const underLocal = new Map<string, PointLinkOption[]>(locals.map((local) => [local.id, []]));
  const blockOptions = new Map<string, PointLinkOption>();
  for (const node of sheetOrder(snapshot)) {
    if (node.equipmentId === null || placed.has(node.equipmentId)) continue;
    placed.add(node.equipmentId);
    const option: PointLinkOption = { key: equipmentKey(node.equipmentId), equipmentId: node.equipmentId, locationId: null, text: textOf.get(node.blockId) ?? node.name };
    const local = localOf(node.locationId);
    if (local !== null) underLocal.get(local)!.push(option);
    else blockOptions.set(node.blockId, option);
  }

  const groups: PointLinkGroup[] = [{ id: 'group:geral', label: null, options: [GENERAL_OPTION] }];
  for (const local of locals) {
    groups.push({
      id: `group:local:${local.id}`,
      label: local.name,
      options: [{ key: localKey(local.id), equipmentId: null, locationId: local.id, text: sitePointTitle(local.name) }, ...underLocal.get(local.id)!],
    });
  }
  for (const group of photoEquipmentGroups(snapshot, null).groups) {
    const options = group.options.map((option) => blockOptions.get(option.blockId)).filter((option): option is PointLinkOption => option !== undefined);
    if (options.length > 0) groups.push({ id: `group:place:${group.locationId}`, label: group.label, options });
  }
  return groups;
}

/** Every option of the picker, in the order the groups draw them. */
export function pointLinkOptions(groups: readonly PointLinkGroup[]): PointLinkOption[] {
  return groups.flatMap((group) => group.options);
}

/**
 * The option a point names: its equipment while a live sheet holds it, else its local while
 * that local is live, else "Geral" (a stale link reads `geral`). This agrees with `pointTitle`.
 */
export function pointLinkKey(point: Pick<PointRow, 'equipment_id'> & { location_id?: string | null }, snapshot: LinkSnapshot): string {
  const keys = new Set(pointLinkOptions(pointLinkGroups(snapshot)).map((option) => option.key));
  if (point.equipment_id !== null && keys.has(equipmentKey(point.equipment_id))) return equipmentKey(point.equipment_id);
  const locationId = point.location_id ?? null;
  if (locationId !== null && siteLocalOf(snapshot, locationId) !== null) return localKey(locationId);
  return POINT_LINK_GENERAL_KEY;
}

/** The two fields a pick of `option` writes: an equipment and no local, a local and no equipment, or neither. */
export function pointLinkValues(option: Pick<PointLinkOption, 'equipmentId' | 'locationId'>): { equipment_id: string | null; location_id: string | null } {
  return { equipment_id: option.equipmentId, location_id: option.locationId };
}
