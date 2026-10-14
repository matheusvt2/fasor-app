import { BASE_EQUIPMENT_BLOCK_TYPES, isEquipmentBlockType } from '../schemas/block-config.ts';
import { findDefinition, siteItems } from '../seed/definitions.ts';
import type { MeasurementTest } from '../seed/measurement.ts';
import type { TestDef } from '../seed/schema.ts';
import {
  blockRowSchema,
  cellSchema,
  entityRowSchemas,
  type BlockRow,
  type Cell,
  type Entity,
  type EntityRow,
  type FileRow,
  type LocationRow,
  type RelatorioRow,
  type Sheet,
} from '../schemas/entities.ts';
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

/** The block a photo file op attributes to, when the op itself carries `block_id`. */
function carriedBlockId(op: Op, path: OpPath): string | null {
  if (path.family === 'file' && op.kind === 'create') {
    const value = op.value as { kind?: string; block_id?: string | null };
    return value.kind === 'photo' && typeof value.block_id === 'string' ? value.block_id : null;
  }
  if (path.family === 'file/field' && path.field === 'block_id' && typeof op.value === 'string') return op.value;
  return null;
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
 * The rows an op may read or write: its target, plus the block a photo op carries, the
 * location a block op places its block on (read only, for `LocationKindError`) and, Story
 * 14.3, the relatório of a site checklist put (read only, for the seed check of
 * `assertSiteItem`; named when the op carries `relatorio_id`, as every relatório-scope op does).
 * Story 14.5: the relatório of a block create of a type only some seed versions ship (read
 * only, for `assertBlockType`); a create of one of the eight names nothing more than before.
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
  return refs;
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
function assertSeedPath(block: BlockRow, path: OpPath): void {
  if (
    path.family !== 'sheet/nameplate' &&
    path.family !== 'sheet/checklist' &&
    path.family !== 'sheet/test' &&
    path.family !== 'sheet/test/cell' &&
    path.family !== 'sheet/test/value'
  ) {
    return;
  }
  const definition = findDefinition(block.seed_version, block.block_type);
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
function writeSheet(block: BlockRow, op: Op, path: OpPath): BlockRow {
  assertSeedPath(block, path);
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
function writeRow(row: EntityRow, op: Op, path: OpPath): EntityRow {
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
    case 'sheet/nameplate':
    case 'sheet/checklist':
    case 'sheet/test':
    case 'sheet/test/cell':
    case 'sheet/test/value':
    case 'sheet/conclusion':
    case 'sheet/observations':
      return writeSheet(row as BlockRow, op, path);
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

  if (op.kind === 'create') {
    if (current) return next;
    assertBlockLocation(state, op, path);
    assertBlockType(state, op, path);
    next.set(target.key, createRow(target.entity, target.id, op));
  } else {
    if (!current) return next;
    if (target.entity === 'location') assertLocationKind(current as LocationRow, op, path);
    if (path.family === 'location/checklist') assertSiteItem(state, current as LocationRow, op, path);
    assertBlockLocation(state, op, path);
    const written = writeRow(current, op, path);
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
