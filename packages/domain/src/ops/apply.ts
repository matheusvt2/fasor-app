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
import type { Op } from './op.ts';
import { familyDef, parsePath, targetOf, type OpPath } from './path.ts';

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

function cellOf(op: Op): Cell {
  return { value: op.value, source_suggestion_id: op.meta?.source_suggestion_id ?? null, op_id: op.op_id };
}

function attributed(block: BlockRow, op: Op): BlockRow {
  return {
    ...block,
    first_edited_at: block.first_edited_at ?? op.client_ts,
    last_modified_by: op.actor_id,
    last_modified_at: op.client_ts,
  };
}

function withSheet(block: BlockRow, update: (sheet: Sheet) => Sheet): BlockRow {
  return { ...block, sheet: update(block.sheet) };
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
      return (row as BlockRow).sheet.nameplate[path.field_key]?.value;
    case 'sheet/checklist':
      return (row as BlockRow).sheet.checklist[path.item_key]?.[path.field]?.value;
    case 'sheet/test':
      return (row as BlockRow).sheet.test[path.test_key]?.[path.field]?.value;
    case 'sheet/test/cell':
      return (row as BlockRow).sheet.test[path.test_key]?.cells[String(path.row)]?.[String(path.col)]?.value;
    case 'sheet/conclusion':
      return (row as BlockRow).sheet.conclusion[path.field]?.value;
    case 'sheet/observations':
      return (row as BlockRow).sheet.observations?.value;
    default:
      return typeof (path as { field?: string }).field === 'string' ? r[(path as { field: string }).field] : undefined;
  }
}

function createRow(entity: Entity, op: Op): EntityRow {
  const row = entityRowSchemas[entity].parse(op.value);
  if (entity === 'block') {
    const block = row as BlockRow;
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
      return { ...file, [path.field]: value } as FileRow;
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
      return attributed(putSheet(row as BlockRow, path, cellOf(op)), op);
    case 'block/field': {
      const block = { ...(row as BlockRow), [path.field]: value } as BlockRow;
      return path.field === 'not_tested' ? attributed(block, op) : block;
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
    next.set(target.key, createRow(target.entity, op));
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
