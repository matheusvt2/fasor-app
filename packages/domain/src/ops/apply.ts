import { BASE_EQUIPMENT_BLOCK_TYPES, companyTypeIdOf, isCompanyBlockType, isEquipmentBlockType, sameTypeVersion, typeVersionIdOf, typeVersionOf } from '../schemas/block-config.ts';
import { definitionContextOf, findDefinition, findDefinitionIn, siteItems, typeVersionText, type DefinitionContext } from '../seed/definitions.ts';
import type { MeasurementTest } from '../seed/measurement.ts';
import type { BlockDefinition, TestDef } from '../seed/schema.ts';
import { manufacturerRefusal } from '../relatorio/reading-evaluation.ts';
import {
  blockRowSchema,
  cellSchema,
  entityRowSchemas,
  type BlockRow,
  type Cell,
  type Entity,
  type EntityRow,
  type EquipmentTypeRow,
  type EquipmentTypeVersionRow,
  type FileRow,
  type LocationRow,
  type RelatorioRow,
  type Sheet,
} from '../schemas/entities.ts';
import { lockedSubBlocksOf } from '../seed/template.ts';
import { canonicalJson } from '../text/hash.ts';
import { companyTypeDefinitionSchema } from '../types/definition.ts';
import { validateTypeDraft } from '../types/validate.ts';
import { SERVER_DEVICE_ID, uuidV7Schema } from '../ids.ts';
import { mergeCell } from '../merge/policy.ts';
import { readingKindPutStatus } from '../reading/retarget.ts';
import type { Op } from './op.ts';
import { familyDef, formatPath, parsePath, targetOf, type OpPath } from './path.ts';

/*
 * AD-3: `applyOp` is the only code that turns an op into state, on both sides.
 * The Dexie and Drizzle layers load the rows named by `targetsOf`, call
 * `applyOp` and write back the rows that changed. It also materializes the
 * derived columns: AD-12 provenance on cells and AD-18 attribution on blocks.
 * Derived timestamps come from `op.client_ts`, the one time both layers share.
 */

export type EntityKey = `${Entity}:${string}`;
export type EntityState = ReadonlyMap<EntityKey, EntityRow>;

export function entityKey(entity: Entity, id: string): EntityKey {
  return `${entity}:${id}`;
}

export function splitEntityKey(key: EntityKey): { entity: Entity; id: string } {
  const at = key.indexOf(':');
  return { entity: key.slice(0, at) as Entity, id: key.slice(at + 1) };
}

export interface ResolvedRef {
  entity: Entity;
  id: string;
  key: EntityKey;
}

function ref(entity: Entity, id: string): ResolvedRef {
  return { entity, id, key: entityKey(entity, id) };
}

function targetRef(op: Op, path: OpPath): ResolvedRef {
  const target = targetOf(path);
  const id = target.id ?? op.relatorio_id;
  if (!id) throw new Error(`op ${op.op_id}: ${path.family} needs relatorio_id`);
  return ref(target.entity, id);
}

/**
 * The block a photo file op attributes to, when the op itself carries `block_id`. Epic 14 QA
 * Q-11: only an id of the kernel's own shape is named, as `carriedLocationId` does: any other
 * string would fail the server's uuid row lookup (a 500, retried forever) instead of reaching
 * the file row's schema, which refuses it (`op_invalid`).
 */
function carriedBlockId(op: Op, path: OpPath): string | null {
  let carried: unknown = null;
  if (path.family === 'file' && op.kind === 'create') {
    const value = op.value as { kind?: string; block_id?: string | null } | null;
    carried = value !== null && typeof value === 'object' && value.kind === 'photo' ? value.block_id : null;
  } else if (path.family === 'file/field' && path.field === 'block_id') {
    carried = op.value;
  }
  return typeof carried === 'string' && uuidV7Schema.safeParse(carried).success ? carried : null;
}

/**
 * Story 14.2: the location a block op places the block on, when the op itself names one: a
 * `block/{id}` create carrying `location_id`, or a `block/{id}/location_id` put.
 *
 * Only an id of the kernel's own shape is named (coordinator review 2026-10-13): `targetsOf`
 * feeds the server's row lookup, whose id column is a uuid, so any other string would fail
 * that query instead of being refused. Left unnamed, the value reaches the block row's own
 * schema, which refuses it as it always did (`op_invalid`).
 */
function carriedLocationId(op: Op, path: OpPath): string | null {
  let carried: unknown = null;
  if (path.family === 'block' && op.kind === 'create') {
    const value = op.value as { location_id?: unknown } | null;
    carried = value !== null && typeof value === 'object' ? value.location_id : null;
  } else if (path.family === 'block/field' && path.field === 'location_id' && op.kind === 'put') {
    carried = op.value;
  }
  return typeof carried === 'string' && uuidV7Schema.safeParse(carried).success ? carried : null;
}

/**
 * Story 14.5: the block type a `block/{id}` create carries when it is one that only some seed
 * versions ship (any equipment type outside the eight: the Chave de transferência automática),
 * else null. The eight are in every version and are never judged.
 */
function carriedLibraryType(op: Op, path: OpPath): string | null {
  if (path.family !== 'block' || op.kind !== 'create') return null;
  const value = op.value as { block_type?: unknown } | null;
  const type = value !== null && typeof value === 'object' ? value.block_type : null;
  if (typeof type !== 'string' || !isEquipmentBlockType(type)) return null;
  return (BASE_EQUIPMENT_BLOCK_TYPES as readonly string[]).includes(type) ? null : type;
}

/**
 * Story 14.6: the type a `equipment_type_version/{id}` create publishes, when its value names one
 * by an id of the kernel's shape (any other value is the row schema's to refuse, `op_invalid`).
 */
function carriedTypeId(op: Op, path: OpPath): string | null {
  if (path.family !== 'equipment_type_version' || op.kind !== 'create') return null;
  const value = op.value as { type_id?: unknown } | null;
  const typeId = value !== null && typeof value === 'object' ? value.type_id : null;
  return typeof typeId === 'string' && uuidV7Schema.safeParse(typeId).success ? typeId : null;
}

/**
 * The rows an op may read or write: its target, plus the block a photo op carries, the
 * location a block op places its block on (read only, for `LocationKindError`) and, Story
 * 14.3, the relatório of a site checklist put (read only, for the seed check of
 * `assertSiteItem`; named when the op carries `relatorio_id`, as every relatório-scope op does).
 * Story 14.5: the relatório of a block create of a type only some seed versions ship (read
 * only, for `assertBlockType`); a create of one of the eight names nothing more than before.
 * Story 14.6: the type row of a published version's create, which its fold writes too
 * (`latest_version`, the draft it published). The version rows a company block's fold resolves
 * are not named here (a sheet op does not say its block's type): each layer adds them to the
 * state it folds in (`definitionTypeIdsOf`).
 */
export function targetsOf(op: Op): ResolvedRef[] {
  const path = parsePath(op.path);
  const refs = [targetRef(op, path)];
  const blockId = carriedBlockId(op, path);
  if (blockId) refs.push(ref('block', blockId));
  const locationId = carriedLocationId(op, path);
  if (locationId) refs.push(ref('location', locationId));
  if (path.family === 'location/checklist' && op.relatorio_id) refs.push(ref('relatorio', op.relatorio_id));
  if (carriedLibraryType(op, path) !== null && op.relatorio_id) refs.push(ref('relatorio', op.relatorio_id));
  const typeId = carriedTypeId(op, path);
  if (typeId !== null) refs.push(ref('equipment_type', typeId));
  return refs;
}

/**
 * Story 14.6 (AD-21 note of 2026-11-06, item 4): the company types whose published versions the
 * fold of `op` resolves, given the rows `targetsOf(op)` names (`state`): the type a `block/{id}`
 * create names, and the type of the block a `block/{id}/config` put or a `sheet/*` write lands on
 * (and the type a config put names); no other op reads a definition. Each layer loads that type's version rows into the state it
 * folds in (the api the pushing company's only: the AD-10 tenant guard), so `applyOp` reads them
 * through `definitionContextOf`. Empty for every op that touches no company type, which is every
 * op of a relatório holding only seeded types.
 */
export function definitionTypeIdsOf(op: Op, state: EntityState): string[] {
  let path: OpPath;
  try {
    path = parsePath(op.path);
  } catch {
    return [];
  }
  const ids = new Set<string>();
  const add = (blockType: unknown) => {
    const typeId = companyTypeIdOf(blockType);
    if (typeId !== null) ids.add(typeId);
  };
  if (path.family === 'block' && op.kind === 'create') {
    add((op.value as { block_type?: unknown } | null)?.block_type);
  } else if ((path.family === 'block/field' && path.field === 'config') || path.family.startsWith('sheet/')) {
    const blockId = 'block_id' in path ? path.block_id : (path as { id: string }).id;
    const block = state.get(entityKey('block', blockId)) as BlockRow | undefined;
    if (block !== undefined) add(block.block_type);
    if (path.family === 'block/field' && op.value !== null && typeof op.value === 'object') add((op.value as { block_type?: unknown }).block_type);
  }
  return [...ids];
}

/**
 * Story 14.6: `touched` (the rows `targetsOf(op)` names) with the version rows of `source` the
 * fold of `op` resolves (`definitionTypeIdsOf`) added beside them, at keys `touched` does not
 * hold; `touched` itself when the op meets no company type. The one way a layer that folds over a
 * larger state (the kernel's `replay`, the device's `materializeEntity` context) adds them.
 */
export function withDefinitionRows(touched: EntityState, op: Op, source: EntityState): EntityState {
  if (source.size === 0) return touched;
  const typeIds = definitionTypeIdsOf(op, touched);
  if (typeIds.length === 0) return touched;
  const wanted = new Set(typeIds);
  let out: Map<EntityKey, EntityRow> | null = null;
  for (const [key, row] of source) {
    if (!key.startsWith('equipment_type_version:') || touched.has(key)) continue;
    if (!wanted.has((row as EquipmentTypeVersionRow).type_id)) continue;
    out ??= new Map(touched);
    out.set(key, row);
  }
  return out ?? touched;
}

/** Story 14.3: the families whose value is a cell folded through `mergeCell`: every `sheet/*` one and a local's site checklist. */
export function isCellFamily(family: OpPath['family']): boolean {
  return family.startsWith('sheet/') || family === 'location/checklist';
}

/** Story 14.3: the cell a `location/{id}/checklist/...` path addresses on a location row, or undefined (no such cell, or not a cabine). */
export function siteCellAt(location: LocationRow | null | undefined, path: OpPath): Cell | undefined {
  if (path.family !== 'location/checklist' || location === null || location === undefined || location.kind !== 'cabine') return undefined;
  return location.checklist?.[path.item_key]?.[path.field];
}

/**
 * Story 14.3: the cell a cell-family path (`isCellFamily`) addresses in `state`, on the block
 * or the location it targets; undefined when the row or the slot is absent.
 */
export function cellAt(state: EntityState, path: OpPath): Cell | undefined {
  if (path.family === 'location/checklist') return siteCellAt(state.get(entityKey('location', path.id)) as LocationRow | undefined, path);
  if (!path.family.startsWith('sheet/')) return undefined;
  const block = state.get(entityKey('block', (path as { block_id: string }).block_id)) as BlockRow | undefined;
  return block === undefined ? undefined : sheetCellAt(block.sheet, path);
}

/** The cell a `sheet/*` path addresses on a sheet, or undefined when the slot holds none. */
export function sheetCellAt(sheet: Sheet, path: OpPath): Cell | undefined {
  switch (path.family) {
    case 'sheet/nameplate':
      return sheet.nameplate[path.field_key];
    case 'sheet/checklist':
      return sheet.checklist[path.item_key]?.[path.field];
    case 'sheet/test':
      return sheet.test[path.test_key]?.[path.field];
    case 'sheet/test/cell':
      return sheet.test[path.test_key]?.cells[String(path.row)]?.[String(path.col)];
    case 'sheet/test/value':
      return sheet.test[path.test_key]?.values?.[path.value_key];
    case 'sheet/conclusion':
      return sheet.conclusion[path.field];
    case 'sheet/observations':
      return sheet.observations ?? undefined;
    default:
      return undefined;
  }
}

/**
 * Story 10.1: the cell a `sheet/*` put writes, through the kernel merge (`mergeCell`): the
 * op's own cell when it is sequential, the rule's standing cell when two devices wrote the
 * path concurrently (judged by `op.prev_op_id` against the cell's head op).
 */
function cellOf(block: BlockRow, op: Op, path: OpPath): Cell {
  const result = path.family === 'sheet/checklist' && path.field === 'observation' ? block.sheet.checklist[path.item_key]?.result : undefined;
  // Contract 16: a composed conclusion text never replaces an edited one as latest free text,
  // and the basis follows the text unless the status is in contradiction.
  const textStatus = path.family === 'sheet/conclusion' && (path.field === 'text' || path.field === 'text_basis') ? block.sheet.conclusion.text_status : undefined;
  return mergeCell(sheetCellAt(block.sheet, path), op, { path, result, textStatus });
}

/** The template fields whose put is a content edit (D-4): every relatório copies these at creation. */
const TEMPLATE_CONTENT_FIELDS: ReadonlySet<string> = new Set(['name', 'blocks', 'skeleton']);

/**
 * AD-18 attribution of an edit (a sheet put, `not_tested`, a photo carrying the block).
 * Story 10.3 (contract 12): an edit from a device that lands on a tombstone is kept (as
 * before) and marks the block with a removal conflict: that device edited a block another
 * one removed without having seen the removal. Server ops never mark.
 */
function attributed(block: BlockRow, op: Op): BlockRow {
  const next: BlockRow = {
    ...block,
    first_edited_at: block.first_edited_at ?? op.client_ts,
    last_modified_by: op.actor_id,
    last_modified_at: op.client_ts,
  };
  if (block.removed_at === null || op.device_id === SERVER_DEVICE_ID) return next;
  return {
    ...next,
    removal_conflict: { removed_by: block.removed_by ?? null, removed_at: block.removed_at, edited_by: op.actor_id, edited_at: op.client_ts },
  };
}

/** The block without its derived removal columns (`removed_by`, `removal_conflict`). */
function withoutRemovalMarks(block: BlockRow): BlockRow {
  const rest: BlockRow = { ...block };
  delete rest.removed_by;
  delete rest.removal_conflict;
  return rest;
}

/**
 * Story 10.3 (contract 12): a `block/{id}/removed_at` write (a `remove`, or a put). A removal
 * records its actor (`removed_by`); a restore drops it. A removal from a device that lands on
 * a live block whose latest edit it did not see (`meta.seen_modified_at`, the block's
 * `last_modified_at` as that device held it, differs from the row's) applies and marks the
 * block with a removal conflict. Any other `removed_at` write (a sequential "Remover", the
 * "Manter" restore, an op without the stamp) drops the mark, except the undo of a resolution
 * (E10-Q2, `meta.restore`), which writes back the mark it carries.
 */
function writeRemovedAt(block: BlockRow, op: Op, value: string | null): BlockRow {
  const rest = withoutRemovalMarks(block);
  if (value === null) return { ...rest, removed_at: null };
  const removed: BlockRow = { ...rest, removed_at: value, removed_by: op.actor_id };
  const seen = op.meta?.seen_modified_at;
  const unseenEdit = seen !== undefined && (seen ?? null) !== block.last_modified_at;
  // E10-Q2 (contract 13): the undo of "Manter" or "Remover" (`meta.restore`) puts the removal
  // back with the author and the mark the resolution cleared, when it saw the block's latest
  // edit; one that did not folds as any other removal.
  const restore = op.meta?.restore;
  if (restore !== undefined && 'removal_conflict' in restore && op.device_id !== SERVER_DEVICE_ID && !unseenEdit) {
    const restored: BlockRow = { ...rest, removed_at: value, removal_conflict: restore.removal_conflict };
    return restore.removed_by === null ? restored : { ...restored, removed_by: restore.removed_by };
  }
  if (block.removed_at !== null || op.device_id === SERVER_DEVICE_ID || !unseenEdit) return removed;
  return {
    ...removed,
    removal_conflict: { removed_by: op.actor_id, removed_at: value, edited_by: block.last_modified_by, edited_at: block.last_modified_at },
  };
}

function withSheet(block: BlockRow, update: (sheet: Sheet) => Sheet): BlockRow {
  return { ...block, sheet: update(block.sheet) };
}

/**
 * E5-Q1: a `sheet/*` op whose seed key or cell address is outside the block's definition,
 * or a create whose row id is not its path id (`createRow`, which re-checks the rule
 * `opSchema` holds at the push boundary, for an emitter that bypasses it).
 * A permanent refusal, like a schema failure: the api answers it `op_invalid` (never a 500),
 * so the device drops it from the outbox instead of retrying it forever.
 */
export class SeedPathError extends Error {
  readonly path: string;
  constructor(path: string, detail: string) {
    super(`invalid op path "${path}": ${detail}`);
    this.name = 'SeedPathError';
    this.path = path;
  }
}

/**
 * Story 14.2 (AD-6): an op that asks of a location something its `kind` never holds. A
 * `painel` only groups colunas: a block placed on one (`block/{id}` create or a
 * `block/{id}/location_id` put naming it) and any `se`, `env`, `agrupar_por_tipo` or `funcao`
 * put on it are refused; so is a `funcao` put on a coluna. A permanent refusal like
 * `SeedPathError`: the api answers it `op_invalid`, so the device drops the op instead of
 * retrying it forever.
 *
 * Replay safety: thrown only for shapes that could not exist before contract 17 (a `painel`
 * row, the `funcao` path). `se`, `env` and `agrupar_por_tipo` on a coluna stay the silent
 * no-op they always were, and a location that is not in `state` is not checked.
 *
 * Story 14.3 (contract 18): a site checklist put (`location/{id}/checklist/...`) on a painel
 * or a coluna is refused the same way: the checklist exists only on a cabine, the local.
 */
export class LocationKindError extends Error {
  readonly path: string;
  constructor(path: string, detail: string) {
    super(`invalid op path "${path}": ${detail}`);
    this.name = 'LocationKindError';
    this.path = path;
  }
}

/** Story 14.2: refuses a data put on a location whose kind never holds that data (see `LocationKindError`). */
function assertLocationKind(location: LocationRow, op: Op, path: OpPath): void {
  if (path.family === 'location/funcao') {
    if (location.kind !== 'cabine') throw new LocationKindError(op.path, `funcao exists only on a cabine; location ${location.id} is a ${location.kind}`);
    return;
  }
  if (path.family === 'location/checklist') {
    if (location.kind !== 'cabine') throw new LocationKindError(op.path, `the site checklist exists only on a cabine; location ${location.id} is a ${location.kind}`);
    return;
  }
  if (path.family !== 'location/se' && path.family !== 'location/env' && path.family !== 'location/agrupar_por_tipo') return;
  if (location.kind === 'painel') throw new LocationKindError(op.path, `a painel holds no data; ${path.family} exists only on a cabine`);
}

/** Story 14.2: refuses a block placed on a painel held in `state`; a location not in state is not checked. */
function assertBlockLocation(state: EntityState, op: Op, path: OpPath): void {
  const locationId = carriedLocationId(op, path);
  if (locationId === null) return;
  const location = state.get(entityKey('location', locationId)) as LocationRow | undefined;
  if (location !== undefined && location.kind === 'painel') {
    throw new LocationKindError(op.path, `a painel takes no block; location ${location.id} only groups colunas`);
  }
}

/**
 * Story 14.3 (contract 18): refuses a site checklist put whose item the relatório's seed
 * version does not offer: a relatório on v1 to v3 has no site checklist at all, and a later
 * version may not ship every `SITE_ITEM_KEYS` key. `parsePath` already refused a key outside
 * the closed list. The relatório row is the one `targetsOf` names from `op.relatorio_id`; an
 * op naming another relatório than the location's own is refused too, since its seed could
 * not be judged. A relatório row that is not in `state` is not checked (the device's
 * re-materialization of one location folds without it): replay safety, as for
 * `LocationKindError`. Thrown only for a path that could not exist before contract 18.
 */
function assertSiteItem(state: EntityState, location: LocationRow, op: Op, path: OpPath & { family: 'location/checklist' }): void {
  if (op.relatorio_id != null && op.relatorio_id !== location.relatorio_id) {
    throw new SeedPathError(op.path, `location/checklist: location ${location.id} is not of relatório ${op.relatorio_id}`);
  }
  const relatorio = state.get(entityKey('relatorio', location.relatorio_id)) as RelatorioRow | undefined;
  if (relatorio === undefined) return;
  if (!siteItems(relatorio.seed_version).some((item) => item.key === path.item_key)) {
    throw new SeedPathError(op.path, `location/checklist: "${path.item_key}" is not a site item of seed_version "${relatorio.seed_version}"`);
  }
}

/**
 * Story 14.5 (contract 19): refuses a `block/{id}` create of a type its seed version does not
 * ship. Only a type outside the eight is judged (`carriedLibraryType`: the Chave de
 * transferência automática, in no version before v5), against the block's own `seed_version`
 * and against the relatório's when `targetsOf` loaded that row: a CTA on a v1 to v4 relatório
 * has no definition to be filled or printed by. A permanent refusal (`SeedPathError`, answered
 * `op_invalid`). Replay safety: thrown only for a block type that could not exist before
 * contract 19; a relatório row that is not in `state` is not checked.
 */
function assertBlockType(state: EntityState, op: Op, path: OpPath): void {
  const type = carriedLibraryType(op, path);
  if (type === null) return;
  const value = op.value as { seed_version?: unknown; relatorio_id?: unknown };
  if (typeof value.seed_version === 'string' && findDefinition(value.seed_version, type) === null) {
    throw new SeedPathError(op.path, `block: block_type "${type}" is not in seed_version "${value.seed_version}"`);
  }
  const relatorioId = typeof value.relatorio_id === 'string' ? value.relatorio_id : op.relatorio_id;
  const relatorio = relatorioId == null ? undefined : (state.get(entityKey('relatorio', relatorioId)) as RelatorioRow | undefined);
  if (relatorio !== undefined && findDefinition(relatorio.seed_version, type) === null) {
    throw new SeedPathError(op.path, `block: block_type "${type}" is not in the relatório's seed_version "${relatorio.seed_version}"`);
  }
}

/**
 * E3-A3 (Epic 3 retro G-2): rejects a `sheet/*` write whose seed-defined key -- nameplate
 * `field_key`, checklist `item_key`, `test_key` -- is not present in the block's own
 * definition at its `seed_version`. `parsePath` checks these segments structurally only
 * (`seedKey`, a bare `[a-z0-9_]+`); it has no block state to check them against
 * `getDefinition`, so the check runs here, where the target block is already loaded.
 * `sheet/conclusion` and `sheet/observations` carry no seed-defined key and are not checked.
 *
 * Story 14.5 (contract 19): a `test_key` may also name a measurement test of the definition
 * (`measurement_tests`). Its table cells are `sheet/test/cell` (`assertMeasurementCell`), its
 * values `sheet/test/value` (a key the test does not declare is refused; a seeded test has
 * none). `sheet/test` on a measurement test writes its instrument only, and only when the
 * test offers a picker (`instrument_of`); there is no criterion override.
 */
function assertSeedPath(block: BlockRow, path: OpPath, ctx: () => DefinitionContext): void {
  if (
    path.family !== 'sheet/nameplate' &&
    path.family !== 'sheet/checklist' &&
    path.family !== 'sheet/test' &&
    path.family !== 'sheet/test/cell' &&
    path.family !== 'sheet/test/value'
  ) {
    return;
  }
  // Story 14.6: a company block's definition is its published version, through the context.
  const definition = isCompanyBlockType(block.block_type)
    ? findDefinitionIn(ctx(), block.seed_version, block.block_type, typeVersionOf(block.config))
    : findDefinition(block.seed_version, block.block_type);
  if (definition === null) {
    throw new SeedPathError(
      formatPath(path),
      `${path.family}: block ${block.id} has no equipment definition for block_type "${block.block_type}" at seed_version "${block.seed_version}"`,
    );
  }
  if (path.family === 'sheet/nameplate') {
    if (!definition.nameplate.some((f) => f.key === path.field_key)) {
      throw new SeedPathError(formatPath(path), `sheet/nameplate: "${path.field_key}" is not a nameplate field of ${block.block_type}`);
    }
  } else if (path.family === 'sheet/checklist') {
    if (!(definition.checklist ?? []).some((c) => c.key === path.item_key)) {
      throw new SeedPathError(formatPath(path), `sheet/checklist: "${path.item_key}" is not a checklist item of ${block.block_type}`);
    }
  } else {
    const test = definition.tests.find((t) => t.key === path.test_key);
    if (test !== undefined) {
      if (path.family === 'sheet/test/cell') assertCellGeometry(block, test, path);
      if (path.family === 'sheet/test/value') {
        throw new SeedPathError(formatPath(path), `sheet/test/value: ${block.block_type}/${test.key} declares no value "${path.value_key}"`);
      }
      return;
    }
    const measurement = (definition.measurement_tests ?? []).find((t) => t.key === path.test_key);
    if (measurement === undefined) throw new SeedPathError(formatPath(path), `${path.family}: "${path.test_key}" is not a test of ${block.block_type}`);
    if (path.family === 'sheet/test/cell') assertMeasurementCell(block, measurement, path);
    else if (path.family === 'sheet/test/value') {
      if (!(measurement.values ?? []).some((value) => value.key === path.value_key)) {
        throw new SeedPathError(formatPath(path), `sheet/test/value: ${block.block_type}/${measurement.key} declares no value "${path.value_key}"`);
      }
    } else if (path.field !== 'instrument' || measurement.instrument_of === undefined) {
      throw new SeedPathError(formatPath(path), `sheet/test: ${block.block_type}/${measurement.key} holds no ${path.field}`);
    }
  }
}

// --- batch e23a: Story 23.3 (contract 34) ----------------------------------------------------

/** The first seed version whose sheets hold a manufacturer's value under the fold's check. */
const MANUFACTURER_CHECK_FROM = 13;

/** The number of a seed version ("v13" -> 13), NaN for any other text. */
function seedVersionNumber(version: string): number {
  return /^v\d+$/.test(version) ? Number(version.slice(1)) : Number.NaN;
}

/**
 * Story 23.3 (contract 34, "refused, never ignored"): a `sheet/test/{key}/criterion_override` put on
 * a seeded test (`definition.tests`) of a v13 (or later) sheet stores the manufacturer's value only
 * when it is null (the clear) or well formed (`manufacturerRefusal`: `{raw, unit}`, raw a positive
 * dot-decimal, a unit the criterion's converts to); any other value is a permanent refusal
 * (`SeedPathError`, answered `op_invalid`). Replay safety: v1 to v12 sheets are not checked, so an
 * override any older log holds (the replay fixture's) folds as it always did, and the readers keep
 * ignoring a malformed one (`effectiveCriterion`); a v13 sheet cannot exist before contract 34.
 */
function assertManufacturerValue(block: BlockRow, op: Op, path: OpPath, ctx: () => DefinitionContext): void {
  if (path.family !== 'sheet/test' || path.field !== 'criterion_override' || op.kind !== 'put') return;
  if (!(seedVersionNumber(block.seed_version) >= MANUFACTURER_CHECK_FROM)) return;
  const definition = isCompanyBlockType(block.block_type)
    ? findDefinitionIn(ctx(), block.seed_version, block.block_type, typeVersionOf(block.config))
    : findDefinition(block.seed_version, block.block_type);
  const test = definition?.tests.find((candidate) => candidate.key === path.test_key);
  if (test === undefined) return;
  const refusal = manufacturerRefusal(test, op.value ?? null);
  if (refusal !== null) throw new SeedPathError(formatPath(path), `sheet/test: criterion_override of ${block.block_type}/${test.key} refused: ${refusal}`);
}

/**
 * Story 14.5: a cell address of a measurement test: `row` is the index in the test's `rows`
 * (a row the configuration hides keeps its index and stays writable: the configuration may
 * change under a put) and `col` the index in its `columns`. A row or column outside that
 * geometry is refused, and so is a fixed cell, which is drawn as text and never typed.
 */
function assertMeasurementCell(block: BlockRow, test: MeasurementTest, path: OpPath & { family: 'sheet/test/cell' }): void {
  const row = test.rows[path.row];
  if (row === undefined) throw new SeedPathError(formatPath(path), `sheet/test/cell: row ${path.row} is outside ${block.block_type}/${test.key}`);
  const column = test.columns[path.col];
  if (column === undefined) throw new SeedPathError(formatPath(path), `sheet/test/cell: column ${path.col} is outside ${block.block_type}/${test.key} row ${path.row}`);
  if (row.fixed?.[column.key] !== undefined) {
    throw new SeedPathError(formatPath(path), `sheet/test/cell: ${row.key}/${column.key} of ${block.block_type}/${test.key} is fixed, never written`);
  }
}

/**
 * Stories 5.5-5.6: a cell address is the fixture's (`relatorio/readings.ts`): `row` across
 * the test's tables in table order, `col` into that row's table `value_columns`. A row or
 * column outside the geometry, or a `derived` column (VAL CALCULADO, CONDIÇÕES: the
 * kernel's, never written), is refused; a `print` column stays writable.
 */
function assertCellGeometry(block: BlockRow, test: TestDef, path: OpPath & { family: 'sheet/test/cell' }): void {
  const { row, col } = path;
  let offset = 0;
  for (const table of test.tables) {
    if (row < offset + table.rows.length) {
      const column = table.value_columns[col];
      if (column === undefined) throw new SeedPathError(formatPath(path), `sheet/test/cell: column ${col} is outside ${block.block_type}/${test.key} row ${row}`);
      if (column.role === 'derived') throw new SeedPathError(formatPath(path), `sheet/test/cell: column ${col} of ${block.block_type}/${test.key} is derived, never written`);
      return;
    }
    offset += table.rows.length;
  }
  throw new SeedPathError(formatPath(path), `sheet/test/cell: row ${row} is outside ${block.block_type}/${test.key}`);
}

/*
 * K-1 (full review 2026-09-30): a sheet put no longer re-parses the whole block row. The
 * row it starts from was itself produced by a parse (the create) or by a previous validated
 * write, so only what the put adds is validated: the written cell (`cellSchema`) and the
 * attribution columns (`attributionSchema`). The fixed-shape objects the put rebuilds are
 * written in their schema's key order, as the whole-row parse wrote them, so the stored row
 * is the one the parse produced.
 */
const CHECKLIST_ITEM_KEYS = Object.keys(blockRowSchema.shape.sheet.shape.checklist.valueType.shape);
const TEST_ENTRY_KEYS = Object.keys(blockRowSchema.shape.sheet.shape.test.valueType.shape);
const CONCLUSION_KEYS = Object.keys(blockRowSchema.shape.sheet.shape.conclusion.shape);
const attributionSchema = blockRowSchema.pick({
  first_edited_at: true,
  last_modified_by: true,
  last_modified_at: true,
  removal_conflict: true,
});

/** `value` with its own keys in `keys` order (the zod object parse's order); keys outside `keys` are dropped, as the parse strips them. */
function inShapeOrder<T extends object>(value: T, keys: readonly string[]): T {
  const out: Record<string, unknown> = {};
  for (const key of keys) if (key in value) out[key] = (value as Record<string, unknown>)[key];
  return out as T;
}

function putSheet(block: BlockRow, path: OpPath, cell: Cell): BlockRow {
  switch (path.family) {
    case 'sheet/nameplate':
      return withSheet(block, (s) => ({ ...s, nameplate: { ...s.nameplate, [path.field_key]: cell } }));
    case 'sheet/checklist':
      return withSheet(block, (s) => ({
        ...s,
        checklist: { ...s.checklist, [path.item_key]: inShapeOrder({ ...s.checklist[path.item_key], [path.field]: cell }, CHECKLIST_ITEM_KEYS) },
      }));
    case 'sheet/test':
      return withSheet(block, (s) => ({
        ...s,
        test: { ...s.test, [path.test_key]: inShapeOrder({ cells: {}, ...s.test[path.test_key], [path.field]: cell }, TEST_ENTRY_KEYS) },
      }));
    case 'sheet/test/cell': {
      return withSheet(block, (s) => {
        const test = s.test[path.test_key] ?? { cells: {} };
        const row = test.cells[String(path.row)] ?? {};
        return {
          ...s,
          test: {
            ...s.test,
            [path.test_key]: { ...test, cells: { ...test.cells, [String(path.row)]: { ...row, [String(path.col)]: cell } } },
          },
        };
      });
    }
    case 'sheet/test/value':
      return withSheet(block, (s) => {
        const test = s.test[path.test_key];
        const entry = { cells: {}, ...test, values: { ...test?.values, [path.value_key]: cell } };
        return { ...s, test: { ...s.test, [path.test_key]: inShapeOrder(entry, TEST_ENTRY_KEYS) } };
      });
    case 'sheet/conclusion':
      return withSheet(block, (s) => ({ ...s, conclusion: inShapeOrder({ ...s.conclusion, [path.field]: cell }, CONCLUSION_KEYS) }));
    case 'sheet/observations':
      return withSheet(block, (s) => ({ ...s, observations: cell }));
    default:
      return block;
  }
}

/**
 * K-1: a sheet put (seed path checked, cell merged), validating only what it adds: the cell
 * through `cellSchema` and the attribution columns through `attributionSchema`. Throws the
 * same `ZodError` the whole-row parse threw for a value that is not a JSON value.
 */
function writeSheet(block: BlockRow, op: Op, path: OpPath, ctx: () => DefinitionContext): BlockRow {
  assertSeedPath(block, path, ctx);
  assertManufacturerValue(block, op, path, ctx);
  const cell = cellSchema.parse(cellOf(block, op, path));
  const next = attributed(putSheet(block, path, cell), op);
  attributionSchema.parse(next);
  return next;
}

/** The value a put/remove op replaces at its path (`undefined` when the row or slot is absent). */
export function readPath(state: EntityState, op: Op): unknown {
  const path = parsePath(op.path);
  const def = familyDef(path.family);
  if (def.create) return undefined;
  const row = state.get(targetRef(op, path).key);
  if (!row) return undefined;
  const r = row as Record<string, unknown>;
  switch (path.family) {
    case 'relatorio/setup':
      return (row as RelatorioRow).setup[path.field as keyof RelatorioRow['setup']];
    case 'relatorio/status':
      return (row as RelatorioRow).status;
    case 'relatorio/export/scheme':
      return (row as RelatorioRow).export.scheme;
    case 'relatorio/preview_file_id':
      return (row as RelatorioRow).preview_file_id;
    case 'relatorio/removed_at':
      return (row as RelatorioRow).removed_at;
    case 'location/se':
    case 'location/env': {
      const loc = row as LocationRow;
      if (loc.kind !== 'cabine') return undefined;
      const group = path.family === 'location/se' ? loc.se : loc.env;
      return (group as Record<string, unknown>)[path.field];
    }
    case 'location/agrupar_por_tipo':
      return (row as LocationRow).kind === 'cabine' ? (row as { agrupar_por_tipo: boolean }).agrupar_por_tipo : undefined;
    case 'location/funcao': {
      // Absent and null both mean none: an undo of the first put writes null back.
      const loc = row as LocationRow;
      return loc.kind === 'cabine' ? (loc.funcao ?? null) : undefined;
    }
    case 'location/checklist':
      // As a sheet cell: undefined for an item never answered.
      return siteCellAt(row as LocationRow, path)?.value;
    case 'suggestion/status':
      return r.status;
    case 'equipment/last_nameplate':
      return r.last_nameplate;
    case 'equipment/last_results':
      // Story 22.12: absent (a row written before contract 32) and null both mean none.
      return r.last_results ?? null;
    case 'sheet/nameplate':
    case 'sheet/checklist':
    case 'sheet/test':
    case 'sheet/test/cell':
    case 'sheet/test/value':
    case 'sheet/conclusion':
    case 'sheet/observations':
      return sheetCellAt((row as BlockRow).sheet, path)?.value;
    default:
      return typeof (path as { field?: string }).field === 'string' ? r[(path as { field: string }).field] : undefined;
  }
}

function createRow(entity: Entity, id: string, op: Op): EntityRow {
  const row = entityRowSchemas[entity].parse(op.value);
  // The row is keyed by its path id: a value naming another id would materialize a row whose
  // JSON id differs from its key.
  if (row.id !== id) throw new SeedPathError(op.path, `the created row's id "${row.id}" is not the path id`);
  // Story 14.6: a type is born unpublished; `latest_version` is the reducer's, never the value's.
  if (entity === 'equipment_type') return { ...(row as EquipmentTypeRow), latest_version: 0 };
  if (entity === 'block') {
    // The derived columns are the reducer's: a created row never brings its own.
    const block = withoutRemovalMarks(row as BlockRow);
    return {
      ...block,
      created_by: op.actor_id,
      first_edited_at: null,
      last_modified_by: null,
      last_modified_at: null,
    } satisfies BlockRow;
  }
  return row;
}

/** E9-Q2/Q3: the `reading_status` a `reading_kind` put writes with it (`readingKindPutStatus`). */
function readingKindStatus(file: FileRow, field: string, value: unknown): Record<string, unknown> {
  return field === 'reading_kind' ? readingKindPutStatus(file as { reading_kind?: unknown }, value) : {};
}

/** Applies a put or remove to its target row; returns the row unchanged when the op does not apply. */
function writeRow(row: EntityRow, op: Op, path: OpPath, ctx: () => DefinitionContext): EntityRow {
  const value = op.kind === 'remove' ? op.client_ts : op.value;
  const r = row as Record<string, unknown>;
  switch (path.family) {
    case 'relatorio/setup':
      return { ...(row as RelatorioRow), setup: { ...(row as RelatorioRow).setup, [path.field]: value } };
    case 'relatorio/status':
      return { ...(row as RelatorioRow), status: value as RelatorioRow['status'] };
    case 'relatorio/export/scheme':
      return { ...(row as RelatorioRow), export: { scheme: value as RelatorioRow['export']['scheme'] } };
    case 'relatorio/preview_file_id':
      return { ...(row as RelatorioRow), preview_file_id: value as string | null };
    case 'relatorio/removed_at':
      // Fix batch fxrm (contract 28): a `remove` writes its `client_ts`, a put of null restores.
      return { ...(row as RelatorioRow), removed_at: value as string | null };
    case 'location/se':
    case 'location/env': {
      const loc = row as LocationRow;
      if (loc.kind !== 'cabine') return row;
      const groupKey = path.family === 'location/se' ? 'se' : 'env';
      return { ...loc, [groupKey]: { ...loc[groupKey], [path.field]: value } };
    }
    case 'location/agrupar_por_tipo': {
      const loc = row as LocationRow;
      return loc.kind === 'cabine' ? { ...loc, agrupar_por_tipo: value as boolean } : row;
    }
    case 'location/funcao': {
      // `assertLocationKind` already refused any other kind.
      const loc = row as LocationRow;
      return loc.kind === 'cabine' ? { ...loc, funcao: value as string | null } : row;
    }
    case 'location/checklist': {
      // Story 14.3: one cell of the site checklist, merged by the sheet checklist's own rules
      // (`mergeCell`). `assertLocationKind` already refused any other kind; the row parse that
      // follows validates the cell and writes the entry in its schema's key order.
      const loc = row as LocationRow;
      if (loc.kind !== 'cabine') return row;
      const entry = loc.checklist?.[path.item_key];
      const result = path.field === 'observation' ? entry?.result : undefined;
      const cell = mergeCell(entry?.[path.field], op, { path, result });
      return { ...loc, checklist: { ...loc.checklist, [path.item_key]: { ...entry, [path.field]: cell } } };
    }
    case 'file/field': {
      const file = row as FileRow;
      if (file.kind !== 'photo' && path.field !== 'removed_at') return row;
      // Story 9.2 (contract 7): a new reading kind on a photo queues its reading, here, on the
      // device and on the server alike (the `template/field` version-bump precedent); the
      // server sends it once the bytes are there. No client ever writes `reading_status`.
      // E9-Q2/Q3 (contract 9): only a kind that differs from the stored one queues (a put of
      // the same kind re-applied, or pushed again, never re-queues a paid reading), and a null
      // kind (the undo of a re-target) leaves the photo a plain one, `reading_status: none`.
      // This never throws: the push route refuses a client put it does not allow
      // (`clientReadingKindPutAllowed`), while a replay on the device must always apply.
      return { ...file, ...readingKindStatus(file, path.field, value), [path.field]: value } as FileRow;
    }
    case 'suggestion/status':
      return { ...r, status: value } as EntityRow;
    case 'equipment/last_nameplate':
      return { ...r, last_nameplate: value } as EntityRow;
    case 'equipment/last_results':
      return { ...r, last_results: value } as EntityRow;
    case 'sheet/nameplate':
    case 'sheet/checklist':
    case 'sheet/test':
    case 'sheet/test/cell':
    case 'sheet/test/value':
    case 'sheet/conclusion':
    case 'sheet/observations':
      return writeSheet(row as BlockRow, op, path, ctx);
    case 'block/field': {
      if (path.field === 'removed_at') return writeRemovedAt(row as BlockRow, op, value as string | null);
      const block = { ...(row as BlockRow), [path.field]: value } as BlockRow;
      return path.field === 'not_tested' ? attributed(block, op) : block;
    }
    case 'template/field': {
      // D-4 (2026-09-23): a content edit bumps `version` here, on the device and on the
      // server alike, so both agree without a second op; archive, restore and remove do
      // not, and a `version` put sets the value explicitly.
      const bump = TEMPLATE_CONTENT_FIELDS.has(path.field) ? { version: ((r.version as number) ?? 0) + 1 } : {};
      return { ...r, ...bump, [path.field]: value } as EntityRow;
    }
    default: {
      const field = (path as { field?: string }).field;
      return field ? ({ ...r, [field]: value } as EntityRow) : row;
    }
  }
}

// --- Story 14.6: company equipment types (AD-3 note of 2026-11-06) --------------------------------

/**
 * A published version's create: its definition passes the strict schema (the kernel's first pt-BR
 * sentence when it does not: `validateTypeDraft`), and, with its type row in `state` (the row
 * `targetsOf` names), the type is not removed and the version is the type's `latest_version + 1`:
 * two users publishing at once, the later push is refused and its device keeps its draft, which it
 * publishes again as the next number. A type row that is not in `state` is not judged here, as a
 * relatório row in `assertSiteItem` is not: the device rebuilds a version row from its own create
 * alone; the server holds the row whenever the company does, and refuses a version naming a type
 * the company does not hold before the fold (`REFERENCE_FIELDS`, `op_target_missing`).
 */
function assertVersionCreate(state: EntityState, op: Op): void {
  const value = op.value as { type_id?: unknown; version?: unknown; definition?: unknown } | null;
  if (value === null || typeof value !== 'object') return;
  if (!companyTypeDefinitionSchema.safeParse(value.definition).success) {
    const first = validateTypeDraft(value.definition as never)[0];
    throw new SeedPathError(op.path, `equipment_type_version: the definition does not publish: ${first?.message ?? 'invalid'}`);
  }
  if (typeof value.type_id !== 'string') return;
  const type = state.get(entityKey('equipment_type', value.type_id)) as EquipmentTypeRow | undefined;
  if (type === undefined) return;
  if (type.removed_at !== null) throw new SeedPathError(op.path, `equipment_type_version: type ${type.id} is removed`);
  if (value.version !== type.latest_version + 1) {
    throw new SeedPathError(op.path, `equipment_type_version: version ${String(value.version)} of type ${type.id} is not its latest_version + 1 (${type.latest_version + 1})`);
  }
}

/**
 * The type row after one of its versions is published: its `latest_version`, and its draft
 * cleared when it is the definition just published (deep-equal); a draft edited after the publish
 * differs and stays open as the next version's.
 */
function publishedType(type: EquipmentTypeRow, version: EquipmentTypeVersionRow): EquipmentTypeRow {
  const published = type.draft !== null && canonicalJson(type.draft) === canonicalJson(version.definition);
  return { ...type, latest_version: version.version, ...(published ? { draft: null } : {}) };
}

/**
 * An `equipment_type/{id}/{field}` put: a draft or retirement put on a removed type is refused,
 * and so is a `removed_at` put ("Descartar rascunho") on a type with a published version; a put
 * on a type that is not in `state` too (the server answers it `op_target_missing` first).
 */
function assertTypePut(type: EquipmentTypeRow | undefined, op: Op, path: OpPath & { family: 'equipment_type/field' }): void {
  if (type === undefined) throw new SeedPathError(op.path, `equipment_type/field: type ${path.id} is not in state`);
  if (path.field === 'removed_at') {
    if (type.latest_version > 0) throw new SeedPathError(op.path, `equipment_type/field: type ${type.id} has a published version and is never discarded`);
    return;
  }
  if (type.removed_at !== null) throw new SeedPathError(op.path, `equipment_type/field: type ${type.id} is removed`);
}

/** A company block's config: it names its own type, and its sub-block and NA keys are the definition's. */
function assertCompanyConfig(op: Op, definition: BlockDefinition, blockType: string, config: unknown): void {
  const c = config as { block_type?: unknown; sub_blocks?: unknown; na_defaults?: unknown };
  if (c.block_type !== blockType) throw new SeedPathError(op.path, `block: the config names "${String(c.block_type)}", not the block's type "${blockType}"`);
  const subBlocks = new Set(definition.sub_blocks);
  const entries = typeof c.sub_blocks === 'object' && c.sub_blocks !== null ? (c.sub_blocks as Record<string, { enabled?: unknown } | undefined>) : {};
  for (const key of Object.keys(entries)) {
    if (!subBlocks.has(key)) throw new SeedPathError(op.path, `block: "${key}" is not a sub-block of ${blockType}`);
  }
  // A test the type does not make switchable (and the checklist and conclusion) is never switched off.
  for (const key of lockedSubBlocksOf(definition)) {
    if (entries[key]?.enabled === false) throw new SeedPathError(op.path, `block: "${key}" of ${blockType} is always on`);
  }
  const items = new Set<string>((definition.checklist ?? []).map((item) => item.key));
  for (const key of Array.isArray(c.na_defaults) ? (c.na_defaults as unknown[]) : []) {
    if (typeof key !== 'string' || !items.has(key)) throw new SeedPathError(op.path, `block: "${String(key)}" is not an item of ${blockType}`);
  }
}

/**
 * A `block/{id}` create of a company type: its config names a published version of the type that
 * a version row in `state` holds (on the server, the pushing company's rows only: the cross-tenant
 * guard), and its keys are that definition's. e22h S2: it names that row by its id too
 * (`type_version_id`), and the row of that id is of that type and that number: a block born on a
 * publish the server refused (another device took the number) is refused with it, never bound to
 * the other device's definition, and is resent beside its renumbered row.
 */
function assertCompanyBlockCreate(op: Op, path: OpPath, ctx: () => DefinitionContext): void {
  if (path.family !== 'block' || op.kind !== 'create') return;
  const value = op.value as { block_type?: unknown; config?: unknown; seed_version?: unknown } | null;
  if (value === null || typeof value !== 'object' || !isCompanyBlockType(value.block_type)) return;
  const blockType = value.block_type;
  const config = value.config;
  if (typeof config !== 'object' || config === null || Array.isArray(config)) throw new SeedPathError(op.path, `block: ${blockType} carries no config`);
  const typeVersion = typeVersionOf(config);
  if (typeVersion !== undefined && typeVersionIdOf(typeVersion) === undefined) throw new SeedPathError(op.path, `block: ${blockType} names its version without the version row's id`);
  const definition = findDefinitionIn(ctx(), typeof value.seed_version === 'string' ? value.seed_version : '', blockType, typeVersion);
  if (definition === null) {
    throw new SeedPathError(op.path, `block: no published version ${typeVersionText(typeVersion)} of ${blockType} in state`);
  }
  assertCompanyConfig(op, definition, blockType, config);
}

/**
 * A `block/{id}/config` put on a block of a company type, or one naming a company type: the
 * block keeps the `{block_type, type_version, type_version_id}` it was created with (checked only when either
 * side is a company type, so no earlier log changes outcome), and its keys are its definition's.
 */
function assertConfigPut(block: BlockRow, op: Op, ctx: () => DefinitionContext): void {
  const next = op.value as { block_type?: unknown } | null;
  const nextType = next !== null && typeof next === 'object' ? next.block_type : undefined;
  if (!isCompanyBlockType(block.block_type) && !isCompanyBlockType(nextType)) return;
  if (nextType !== block.block_type) throw new SeedPathError(op.path, `block/config: the type of block ${block.id} is "${block.block_type}" and never changes`);
  // e22h S2: the number and the version row's id, never the reference object's identity.
  if (!sameTypeVersion(typeVersionOf(op.value), typeVersionOf(block.config))) throw new SeedPathError(op.path, `block/config: block ${block.id} keeps type_version ${typeVersionText(typeVersionOf(block.config))}`);
  const definition = findDefinitionIn(ctx(), block.seed_version, block.block_type, typeVersionOf(block.config));
  if (definition !== null) assertCompanyConfig(op, definition, block.block_type, op.value);
}

/** The `sheet/*` families: `writeSheet` validates what they write, so the row is not parsed again. */
function isSheetFamily(family: OpPath['family']): boolean {
  return family.startsWith('sheet/');
}

/**
 * The single reducer. `state` holds the rows named by `targetsOf(op)`; the
 * result is a new map with the changed rows replaced (unchanged rows keep
 * their identity). A second create is a no-op; a put or remove on a missing
 * row is a no-op; an op whose value breaks the row schema throws, and so does
 * one that asks of a location what its kind never holds (`LocationKindError`) or of a
 * relatório a site item its seed version does not offer (`SeedPathError`), or creates a block
 * of a type its seed version does not ship (Story 14.5, `SeedPathError`). A `sheet/*`
 * put validates what it writes (K-1); every other family re-parses the row.
 */
export function applyOp(state: EntityState, op: Op): EntityState {
  const path = parsePath(op.path);
  const target = targetRef(op, path);
  const next = new Map(state);
  const current = state.get(target.key);
  // Story 14.6: the context of the version rows in the state, built only when a company type is met.
  let ctx: DefinitionContext | null = null;
  const context = (): DefinitionContext => (ctx ??= definitionContextOf(state));

  if (op.kind === 'create') {
    if (current) return next;
    assertBlockLocation(state, op, path);
    assertBlockType(state, op, path);
    assertCompanyBlockCreate(op, path, context);
    if (path.family === 'equipment_type_version') assertVersionCreate(state, op);
    const created = createRow(target.entity, target.id, op);
    next.set(target.key, created);
    if (path.family === 'equipment_type_version') {
      // The one fold that writes a row beside its target: the type's latest version and its draft.
      const version = created as EquipmentTypeVersionRow;
      const typeKey = entityKey('equipment_type', version.type_id);
      const type = state.get(typeKey) as EquipmentTypeRow | undefined;
      if (type !== undefined) next.set(typeKey, entityRowSchemas.equipment_type.parse(publishedType(type, version)));
    }
  } else {
    if (path.family === 'equipment_type/field') assertTypePut(current as EquipmentTypeRow | undefined, op, path);
    if (!current) return next;
    if (target.entity === 'location') assertLocationKind(current as LocationRow, op, path);
    if (path.family === 'location/checklist') assertSiteItem(state, current as LocationRow, op, path);
    assertBlockLocation(state, op, path);
    if (path.family === 'block/field' && path.field === 'config') assertConfigPut(current as BlockRow, op, context);
    const written = writeRow(current, op, path, context);
    if (written === current) return next;
    next.set(target.key, isSheetFamily(path.family) ? written : entityRowSchemas[target.entity].parse(written));
  }

  const blockId = carriedBlockId(op, path);
  if (blockId) {
    const key = entityKey('block', blockId);
    const block = state.get(key) as BlockRow | undefined;
    if (block && (op.kind === 'create' ? !current : true)) next.set(key, attributed(block, op));
  }
  return next;
}
