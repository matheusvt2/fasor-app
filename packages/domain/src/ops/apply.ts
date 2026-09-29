import { getDefinition } from '../seed/definitions.ts';
import type { TestDef } from '../seed/schema.ts';
import {
  emptySheet,
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
import { SERVER_DEVICE_ID } from '../ids.ts';
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

/** The rows an op may read or write: its target, plus the block a photo op carries. */
export function targetsOf(op: Op): ResolvedRef[] {
  const path = parsePath(op.path);
  const refs = [targetRef(op, path)];
  const blockId = carriedBlockId(op, path);
  if (blockId) refs.push(ref('block', blockId));
  return refs;
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
  return mergeCell(sheetCellAt(block.sheet, path), op, { path, result });
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
 * E3-A3 (Epic 3 retro G-2): rejects a `sheet/*` write whose seed-defined key -- nameplate
 * `field_key`, checklist `item_key`, `test_key` -- is not present in the block's own
 * definition at its `seed_version`. `parsePath` checks these segments structurally only
 * (`seedKey`, a bare `[a-z0-9_]+`); it has no block state to check them against
 * `getDefinition`, so the check runs here, where the target block is already loaded.
 * `sheet/conclusion` and `sheet/observations` carry no seed-defined key and are not checked.
 */
function assertSeedPath(block: BlockRow, path: OpPath): void {
  if (
    path.family !== 'sheet/nameplate' &&
    path.family !== 'sheet/checklist' &&
    path.family !== 'sheet/test' &&
    path.family !== 'sheet/test/cell'
  ) {
    return;
  }
  let definition;
  try {
    definition = getDefinition(block.seed_version, 'cabine_primaria', block.block_type);
  } catch {
    throw new SeedPathError(formatPath(path), 
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
    if (test === undefined) throw new SeedPathError(formatPath(path), `${path.family}: "${path.test_key}" is not a test of ${block.block_type}`);
    if (path.family === 'sheet/test/cell') assertCellGeometry(block, test, path);
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

function putSheet(block: BlockRow, path: OpPath, cell: Cell): BlockRow {
  switch (path.family) {
    case 'sheet/nameplate':
      return withSheet(block, (s) => ({ ...s, nameplate: { ...s.nameplate, [path.field_key]: cell } }));
    case 'sheet/checklist':
      return withSheet(block, (s) => ({
        ...s,
        checklist: { ...s.checklist, [path.item_key]: { ...s.checklist[path.item_key], [path.field]: cell } },
      }));
    case 'sheet/test':
      return withSheet(block, (s) => ({
        ...s,
        test: { ...s.test, [path.test_key]: { cells: {}, ...s.test[path.test_key], [path.field]: cell } },
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
    case 'sheet/conclusion':
      return withSheet(block, (s) => ({ ...s, conclusion: { ...s.conclusion, [path.field]: cell } }));
    case 'sheet/observations':
      return withSheet(block, (s) => ({ ...s, observations: cell }));
    default:
      return block;
  }
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
    case 'suggestion/status':
      return r.status;
    case 'equipment/last_nameplate':
      return r.last_nameplate;
    case 'sheet/nameplate':
    case 'sheet/checklist':
    case 'sheet/test':
    case 'sheet/test/cell':
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
      sheet: block.sheet ?? emptySheet(),
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
    case 'sheet/conclusion':
    case 'sheet/observations':
      assertSeedPath(row as BlockRow, path);
      return attributed(putSheet(row as BlockRow, path, cellOf(row as BlockRow, op, path)), op);
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

/**
 * The single reducer. `state` holds the rows named by `targetsOf(op)`; the
 * result is a new map with the changed rows replaced (unchanged rows keep
 * their identity). A second create is a no-op; a put or remove on a missing
 * row is a no-op; an op whose value breaks the row schema throws.
 */
export function applyOp(state: EntityState, op: Op): EntityState {
  const path = parsePath(op.path);
  const target = targetRef(op, path);
  const next = new Map(state);
  const current = state.get(target.key);

  if (op.kind === 'create') {
    if (current) return next;
    next.set(target.key, createRow(target.entity, target.id, op));
  } else {
    if (!current) return next;
    const written = writeRow(current, op, path);
    if (written === current) return next;
    next.set(target.key, entityRowSchemas[target.entity].parse(written));
  }

  const blockId = carriedBlockId(op, path);
  if (blockId) {
    const key = entityKey('block', blockId);
    const block = state.get(key) as BlockRow | undefined;
    if (block && (op.kind === 'create' ? !current : true)) next.set(key, attributed(block, op));
  }
  return next;
}
