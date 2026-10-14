import type { SiteItemKey } from '../schemas/block-config.ts';
import type { RelatorioStatus, RevisionRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { siteChecklistOf, siteItems, type SiteItem } from '../seed/definitions.ts';
import { statusLabel } from '../status/table.ts';
import { listPtBr, plural } from '../text/plural.ts';
import type { CabineLocation } from './cabine.ts';
import { funcaoLabel } from './local.ts';
import { isCellFilled } from './sheet-state.ts';

/*
 * Story 14.3: "Verificações do local", the site checklist of a local, as every reader takes
 * it (AD-1/AD-13): the capture surface, the tree row, the Sumário, the pre-issue check and
 * the printed table. A local is a live root `kind = cabine` row; it has a checklist only on a
 * relatório whose seed version ships a site list (`siteChecklistOf`, v4 or later). A v1 to v3
 * relatório, a painel and a coluna have none: every reader here answers null or nothing for
 * them. The answers are the row's `checklist` cells, written through
 * `location/{id}/checklist/{item_key}/{result|observation}`.
 *
 * Locals are read from `snapshot.locations` (the live set), never from raw rows: a removed
 * local has no checklist, no counter and no print, and its values come back with its restore.
 * Nothing here is stored: an item is answered when its result cell holds C, NC or NA, and a
 * checklist is complete when every item of the seed's list is answered.
 */

export type SiteResult = 'C' | 'NC' | 'NA';

/** "Verificações do local": the name of the checklist on every surface and in every composed text. */
export const SITE_CHECKLIST_LABEL = 'Verificações do local';

const SEP = ' · ';

type SiteSnapshot = Pick<RelatorioSnapshot, 'relatorio' | 'locations'>;

/**
 * The locals of a snapshot, in tree order: the live `kind = cabine` rows at the root (no
 * parent, or a parent that is not live, as the tree draws its roots). Empty on a relatório
 * whose seed version ships no site list.
 */
export function siteLocals(snapshot: SiteSnapshot): CabineLocation[] {
  if (siteChecklistOf(snapshot.relatorio.seed_version) === null) return [];
  const liveIds = new Set(snapshot.locations.filter((row) => row.removed_at === null).map((row) => row.id));
  return snapshot.locations.filter(
    (row): row is CabineLocation => row.kind === 'cabine' && row.removed_at === null && (row.parent_id === null || !liveIds.has(row.parent_id)),
  );
}

/** The local `locationId` names, or null: not live, not a root cabine, or a relatório with no site list. */
export function siteLocalOf(snapshot: SiteSnapshot, locationId: string): CabineLocation | null {
  return siteLocals(snapshot).find((row) => row.id === locationId) ?? null;
}

/** The result a site item shows: its stored C, NC or NA, else null (unanswered). No display default: nothing is NA until answered. */
export function siteResultOf(location: Pick<CabineLocation, 'checklist'>, itemKey: string): SiteResult | null {
  const cell = location.checklist?.[itemKey as SiteItemKey]?.result;
  if (cell === undefined || !isCellFilled(cell)) return null;
  const value = cell.value;
  return value === 'C' || value === 'NC' || value === 'NA' ? value : null;
}

/** A site item's observation as typed, trimmed; null when it holds none. */
export function siteObservationOf(location: Pick<CabineLocation, 'checklist'>, itemKey: string): string | null {
  const cell = location.checklist?.[itemKey as SiteItemKey]?.observation;
  if (cell === undefined || !isCellFilled(cell) || typeof cell.value !== 'string') return null;
  return cell.value.trim();
}

/** The items "Marcar os restantes como Conforme" sets on a local: the unanswered ones, in the list's order. */
export function siteUnsetItems(location: Pick<CabineLocation, 'checklist'>, seedVersion: string): SiteItemKey[] {
  return siteItems(seedVersion)
    .filter((item) => siteResultOf(location, item.key) === null)
    .map((item) => item.key);
}

/** How many of a local's site items are answered, out of how many the seed lists. */
export interface SiteProgress {
  answered: number;
  total: number;
}

function progressOf(location: Pick<CabineLocation, 'checklist'>, items: readonly SiteItem[]): SiteProgress {
  return { answered: items.filter((item) => siteResultOf(location, item.key) !== null).length, total: items.length };
}

/** A local's site progress; null for anything that has no site checklist (see `siteLocalOf`). */
export function siteChecklistProgress(snapshot: SiteSnapshot, locationId: string): SiteProgress | null {
  const location = siteLocalOf(snapshot, locationId);
  return location === null ? null : progressOf(location, siteItems(snapshot.relatorio.seed_version));
}

/** `.progress-counter[data-state]` of the surface's header: complete once every item is answered. */
export function siteProgressState(p: SiteProgress): 'complete' | 'pending' {
  return p.answered >= p.total ? 'complete' : 'pending';
}

/** "12 de 19": the counter of the surface's header, of a group's head and of the sheet's "Do local" line. */
export function siteCounterText(p: SiteProgress): string {
  return `${p.answered} de ${p.total}`;
}

/** "Verificações do local · 12 de 19": the Sumário row's button (`40-relatorio-overview.html` `.s9-verif`). */
export function siteRowText(p: SiteProgress): string {
  return `${SITE_CHECKLIST_LABEL}${SEP}${siteCounterText(p)}`;
}

/** "19 itens · uma vez por local": the rail row's meta line (`shell-foot.html`). */
export function siteRailMetaText(total: number): string {
  return `${plural(total, 'item', 'itens')}${SEP}uma vez por local`;
}

/** "Verificações do local — Cubículo Enel": the surface's title (`61-verificacoes-local.html`). */
export function siteHeaderTitle(name: string): string {
  return `${SITE_CHECKLIST_LABEL} — ${name.trim()}`;
}

/** "Função: Primária": the surface's first meta line; null for a local with no Função. */
export function siteHeaderMeta(funcao: string | null | undefined): string | null {
  const label = funcaoLabel(funcao);
  return label === null ? null : `Função: ${label}`;
}

/** One site item as the surface draws its row. */
export interface SiteRowView {
  key: SiteItemKey;
  /** 1 to 19, running across the groups. */
  number: number;
  /** The seed's label, sentence case as approved. */
  label: string;
  result: SiteResult | null;
  /** The observation as typed, trimmed; null with none. */
  observation: string | null;
  nc_phrases: readonly string[];
}

/** One group of the surface: its heading, its "N de M" and its rows. */
export interface SiteGroupView extends SiteProgress {
  key: string;
  label: string;
  /** "5 de 7". */
  counterText: string;
  rows: SiteRowView[];
}

/** A local's whole checklist as the surface draws it. */
export interface SiteChecklistView extends SiteProgress {
  locationId: string;
  /** The local's name as stored. */
  name: string;
  /** The local's Função as stored (a reserved key or a typed name), or null. */
  funcao: string | null;
  /** "Verificações do local — Cubículo Enel". */
  title: string;
  /** "Função: Entrada", or null. */
  meta: string | null;
  /** "12 de 19". */
  counterText: string;
  state: 'complete' | 'pending';
  groups: SiteGroupView[];
  /**
   * The op that last wrote any cell of the checklist (the greatest UUIDv7 `op_id`), or null
   * while nothing was answered: the surface reads its author and time from the op log for
   * the attribution line, as the sheet composes its own.
   */
  latestOpId: string | null;
}

function latestOpIdOf(location: Pick<CabineLocation, 'checklist'>): string | null {
  let latest: string | null = null;
  for (const entry of Object.values(location.checklist ?? {})) {
    for (const cell of [entry?.result, entry?.observation]) {
      if (cell !== undefined && (latest === null || cell.op_id > latest)) latest = cell.op_id;
    }
  }
  return latest;
}

/**
 * The site checklist of one local: null unless `locationId` is a live root cabine of a
 * relatório whose seed ships a site list; else its groups with their "N de M", its rows and
 * its totals.
 */
export function siteChecklistView(snapshot: SiteSnapshot, locationId: string): SiteChecklistView | null {
  const location = siteLocalOf(snapshot, locationId);
  const list = siteChecklistOf(snapshot.relatorio.seed_version);
  if (location === null || list === null) return null;
  const items = new Map(siteItems(snapshot.relatorio.seed_version).map((item) => [item.key, item]));
  const groups = list.groups.map((group): SiteGroupView => {
    const rows = group.items.map((item): SiteRowView => ({
      key: item.key,
      number: items.get(item.key)!.number,
      label: item.label,
      result: siteResultOf(location, item.key),
      observation: siteObservationOf(location, item.key),
      nc_phrases: item.nc_phrases,
    }));
    const counts = { answered: rows.filter((row) => row.result !== null).length, total: rows.length };
    return { key: group.key, label: group.label, ...counts, counterText: siteCounterText(counts), rows };
  });
  const totals = { answered: groups.reduce((sum, group) => sum + group.answered, 0), total: groups.reduce((sum, group) => sum + group.total, 0) };
  return {
    locationId: location.id,
    name: location.name,
    funcao: location.funcao ?? null,
    title: siteHeaderTitle(location.name),
    meta: siteHeaderMeta(location.funcao),
    ...totals,
    counterText: siteCounterText(totals),
    state: siteProgressState(totals),
    groups,
    latestOpId: latestOpIdOf(location),
  };
}

/** The first unanswered item of a local in the list's order ("Concluir verificações" focuses its row), or null when none is left. */
export function siteFirstUnanswered(snapshot: SiteSnapshot, locationId: string): SiteItem | null {
  const location = siteLocalOf(snapshot, locationId);
  if (location === null) return null;
  return siteItems(snapshot.relatorio.seed_version).find((item) => siteResultOf(location, item.key) === null) ?? null;
}

/**
 * What "Concluir verificações" announces while items are unanswered: "7 itens sem resposta —
 * o primeiro é o item 6, EPI disponível" (`61-verificacoes-local.html`); null when every item
 * is answered, and for anything that has no site checklist.
 */
export function siteMissingText(snapshot: SiteSnapshot, locationId: string): string | null {
  const progress = siteChecklistProgress(snapshot, locationId);
  const first = siteFirstUnanswered(snapshot, locationId);
  if (progress === null || first === null) return null;
  const missing = progress.total - progress.answered;
  // authored: the singular of the mock's sentence, which draws seven items.
  if (missing === 1) return `1 item sem resposta — é o item ${first.number}, ${first.label}`;
  return `${missing} itens sem resposta — o primeiro é o item ${first.number}, ${first.label}`;
}

/**
 * The NC chips of a site row beyond the seed's own phrases: the five most recent
 * observations typed for this item on the relatório's other locals (cells ordered by their
 * UUIDv7 op id), without repeats and without the phrases already offered. Never the
 * observation of `currentLocationId` itself, which the field already holds. The sheet's
 * rule (`recentChecklistObservations`) over locals.
 */
export function recentSiteObservations(snapshot: SiteSnapshot, itemKey: string, seeded: readonly string[] = [], currentLocationId: string | null = null): string[] {
  const cells: { text: string; opId: string }[] = [];
  for (const location of siteLocals(snapshot)) {
    if (location.id === currentLocationId) continue;
    const cell = location.checklist?.[itemKey as SiteItemKey]?.observation;
    if (cell === undefined || !isCellFilled(cell) || typeof cell.value !== 'string') continue;
    cells.push({ text: cell.value.trim(), opId: cell.op_id });
  }
  cells.sort((a, b) => (a.opId < b.opId ? 1 : a.opId > b.opId ? -1 : 0));
  const skip = new Set(seeded.map((phrase) => phrase.trim()));
  const out: string[] = [];
  for (const { text } of cells) {
    if (skip.has(text) || out.includes(text)) continue;
    out.push(text);
    if (out.length === 5) break;
  }
  return out;
}

/** One local with unanswered site items, for the pre-issue row. */
export interface SiteUnanswered {
  locationId: string;
  name: string;
  missing: number;
}

/** Every live local with unanswered site items and how many, in tree order; empty on a relatório with no site list. */
export function siteUnanswered(snapshot: SiteSnapshot): SiteUnanswered[] {
  const items = siteItems(snapshot.relatorio.seed_version);
  return siteLocals(snapshot).flatMap((location) => {
    const progress = progressOf(location, items);
    const missing = progress.total - progress.answered;
    return missing === 0 ? [] : [{ locationId: location.id, name: location.name.trim(), missing }];
  });
}

/**
 * The pre-issue row of the locals with unanswered site items: "Verificações do local sem
 * resposta: Cubículo Enel (7 itens) e 1° Subsolo (19 itens)"; null with none.
 */
export function siteUnansweredText(locals: readonly SiteUnanswered[]): string | null {
  if (locals.length === 0) return null;
  // authored: no mock draws this row (open for Bruno).
  return `${SITE_CHECKLIST_LABEL} sem resposta: ${listPtBr(locals.map((local) => `${local.name} (${plural(local.missing, 'item', 'itens')})`))}`;
}

/** Epic 14 QA Q-4: one local with more site items answered NC than live points of attention naming it. */
export interface SiteNcWithoutPoint {
  locationId: string;
  name: string;
  /** Its site items answered NC. */
  nc: number;
  /** The live points that carry its `location_id`. */
  points: number;
}

/**
 * Epic 14 QA Q-4: every live local whose NC site items outnumber the live points created for
 * it, in tree order. A point carries the local (`location_id`) but not the item, so "an NC
 * item with no point" is read as more NC items than points with that `location_id`. A removed
 * local is not among the snapshot's locals (nor are its points), so it raises nothing; a
 * relatório with no site list (v1 to v3) neither.
 */
export function siteNcWithoutPoint(snapshot: Pick<RelatorioSnapshot, 'relatorio' | 'locations' | 'points'>): SiteNcWithoutPoint[] {
  const items = siteItems(snapshot.relatorio.seed_version);
  return siteLocals(snapshot).flatMap((location) => {
    const nc = items.filter((item) => siteResultOf(location, item.key) === 'NC').length;
    if (nc === 0) return [];
    const points = snapshot.points.filter((point) => point.removed_at === null && (point.location_id ?? null) === location.id).length;
    return nc > points ? [{ locationId: location.id, name: location.name.trim(), nc, points }] : [];
  });
}

/**
 * The pre-issue row of those locals: "Verificações do local com NC sem ponto de atenção: Sala
 * dos trafos e Geradores"; null with none.
 */
export function siteNcWithoutPointText(locals: readonly SiteNcWithoutPoint[]): string | null {
  if (locals.length === 0) return null;
  // authored: Epic 14 QA Q-4, worded like `siteUnansweredText` (open for Bruno).
  return `${SITE_CHECKLIST_LABEL} com NC sem ponto de atenção: ${listPtBr(locals.map((local) => local.name))}`;
}

/**
 * The surface's banner on an Emitido relatório: editing reopens it. The sheet's sentence
 * (`fichaIssuedBannerText`) with "estas verificações" where it says "esta ficha". Null in
 * every other status and with no revision on record.
 */
export function localIssuedBannerText(status: RelatorioStatus, revision: Pick<RevisionRow, 'number'> | null): string | null {
  if (status !== 'emitido' || revision === null) return null;
  // authored: 2026-10-13, after the sheet's sentence of 2026-10-10.
  return `Relatório emitido (revisão ${revision.number}). Editar estas verificações reabre o relatório como ${statusLabel('em_revisao')} e gera a revisão ${revision.number + 1}.`;
}

/**
 * The title of a point of attention created from a site item: "1° Subsolo · Verificações do
 * local" (`pointTitle`).
 */
export function sitePointTitle(localName: string): string {
  // authored: no mock draws a point of a local (open for Bruno).
  return `${localName.trim()}${SEP}${SITE_CHECKLIST_LABEL}`;
}

/**
 * 2026-10-14 (Bruno, source-deltas): an NC site item counts as an NC. How many site items are
 * answered NC over the live locals (`siteLocals`): a removed local, or a relatório on a seed
 * with no site list (v1 to v3), adds nothing. What `Progress.nc_open` adds to the sheets' NCs.
 */
export function siteNcCount(snapshot: SiteSnapshot): number {
  const items = siteItems(snapshot.relatorio.seed_version);
  return siteLocals(snapshot).reduce((sum, location) => sum + items.filter((item) => siteResultOf(location, item.key) === 'NC').length, 0);
}

/** A local's NC site items, for the F-24 finder: 0 for anything that has no site checklist. */
export function siteNcOf(snapshot: SiteSnapshot, locationId: string): number {
  const location = siteLocalOf(snapshot, locationId);
  if (location === null) return 0;
  return siteItems(snapshot.relatorio.seed_version).filter((item) => siteResultOf(location, item.key) === 'NC').length;
}

/** One site item answered NC on at least one live local, as the parecer names it. */
export interface SiteNcItem {
  /** 1 to 19, running across the groups. */
  number: number;
  /** The seed's label. */
  label: string;
  /** The names of the live locals answering it NC, trimmed, in tree order. */
  locals: string[];
}

/** 2026-10-14: every site item answered NC on a live local, in the list's order, with those locals; empty with none. */
export function siteNcItems(snapshot: SiteSnapshot): SiteNcItem[] {
  const locals = siteLocals(snapshot);
  return siteItems(snapshot.relatorio.seed_version).flatMap((item) => {
    const names = locals.filter((location) => siteResultOf(location, item.key) === 'NC').map((location) => location.name.trim());
    return names.length === 0 ? [] : [{ number: item.number, label: item.label, locals: names }];
  });
}
