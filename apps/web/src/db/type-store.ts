import {
  definitionContext,
  entityKey,
  equipmentTypeRowSchema,
  equipmentTypeVersionRowSchema,
  type DefinitionContext,
  type EntityKey,
  type EntityRow,
  type EquipmentTypeRow,
  type EquipmentTypeVersionRow,
} from '@app/domain';
import type { AppDatabase, EntityRecord } from './schema.ts';

/*
 * Story 14.6 (AD-21 note of 2026-11-06, item 4): the device's company equipment types, read from
 * Dexie's generic `entities` table (the company stream fills it, AD-24): the published version
 * rows (immutable) and the type rows. Every kernel call that can meet a company type takes the
 * context built from them (`definitionContext`), so this is where the device's context comes
 * from. Rows keep their identity across reads while their record's write stamp (`rev`) is
 * unchanged, and the lists keep theirs while every row does, so the kernel's memoized context is
 * the same object until a version or a type is written.
 */

interface ParsedRecord {
  rev: string;
  row: unknown;
}

const parsedByDb = new WeakMap<AppDatabase, Map<string, ParsedRecord>>();
const listsByDb = new WeakMap<AppDatabase, { versions: EquipmentTypeVersionRow[]; types: EquipmentTypeRow[] }>();

function parsedOf<T>(db: AppDatabase, record: EntityRecord, parse: (row: unknown) => { success: true; data: T } | { success: false }): T | null {
  let cache = parsedByDb.get(db);
  if (cache === undefined) {
    cache = new Map();
    parsedByDb.set(db, cache);
  }
  const key = `${record.entity}:${record.id}`;
  const hit = record.rev === undefined ? undefined : cache.get(key);
  if (hit !== undefined && hit.rev === record.rev) return hit.row as T;
  const parsed = parse(record.row);
  if (!parsed.success) return null;
  if (record.rev !== undefined) cache.set(key, { rev: record.rev, row: parsed.data });
  return parsed.data;
}

const sameList = <T>(next: T[], prev: T[] | undefined): T[] => (prev !== undefined && prev.length === next.length && next.every((row, i) => row === prev[i]) ? prev : next);

/** Every version row and every type row this device holds (removed types included, as the fold reads them). */
export async function equipmentTypeRows(db: AppDatabase): Promise<{ versions: EquipmentTypeVersionRow[]; types: EquipmentTypeRow[] }> {
  const [versionRecords, typeRecords] = await Promise.all([
    db.entities.where('entity').equals('equipment_type_version').toArray(),
    db.entities.where('entity').equals('equipment_type').toArray(),
  ]);
  const versions: EquipmentTypeVersionRow[] = [];
  for (const record of versionRecords) {
    const row = parsedOf(db, record, (value) => equipmentTypeVersionRowSchema.safeParse(value));
    if (row !== null) versions.push(row);
  }
  const types: EquipmentTypeRow[] = [];
  for (const record of typeRecords) {
    const row = parsedOf(db, record, (value) => equipmentTypeRowSchema.safeParse(value));
    if (row !== null) types.push(row);
  }
  versions.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  types.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const prev = listsByDb.get(db);
  const lists = { versions: sameList(versions, prev?.versions), types: sameList(types, prev?.types) };
  if (prev !== undefined && lists.versions === prev.versions && lists.types === prev.types) return prev;
  listsByDb.set(db, lists);
  return lists;
}

/** The device's definition context: its company's published versions and type rows. */
export async function deviceDefinitionContext(db: AppDatabase): Promise<DefinitionContext> {
  const { versions, types } = await equipmentTypeRows(db);
  return definitionContext(versions, types);
}

/**
 * The version rows of the company types `typeIds` names, keyed as the fold's state holds them:
 * what the commit path and re-materialization add beside a company block's own rows.
 */
export async function typeVersionState(db: AppDatabase, typeIds: readonly string[]): Promise<Map<EntityKey, EntityRow>> {
  const out = new Map<EntityKey, EntityRow>();
  if (typeIds.length === 0) return out;
  const wanted = new Set(typeIds);
  for (const record of await db.entities.where('entity').equals('equipment_type_version').toArray()) {
    const typeId = (record.row as { type_id?: unknown }).type_id;
    if (typeof typeId === 'string' && wanted.has(typeId)) out.set(entityKey('equipment_type_version', record.id), record.row);
  }
  return out;
}

/** Every version row this device holds, keyed as the fold's state holds them (the re-materialization's context). */
export async function allTypeVersionState(db: AppDatabase): Promise<Map<EntityKey, EntityRow>> {
  const out = new Map<EntityKey, EntityRow>();
  for (const record of await db.entities.where('entity').equals('equipment_type_version').toArray()) out.set(entityKey('equipment_type_version', record.id), record.row);
  return out;
}
