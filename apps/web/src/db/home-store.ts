import {
  entityKey,
  entityRowSchemas,
  type BlockRow,
  type EmpresaRow,
  type ClientRow,
  type EntityKey,
  type EntityRow,
  type EntityState,
  type EquipmentRow,
  type FileRow,
  type InstrumentRow,
  type PointRow,
  type SuggestionRow,
  type LocationRow,
  type ProjectRow,
  type RegistryRow,
  type RelatorioRow,
  type RevisionRow,
  type TemplateRow,
  type WordRow,
} from '@app/domain';
import { type AppDatabase, type EntityRecord } from './schema.ts';

/*
 * AD-1: the live-query sources Home and Account read. Dexie stays inside `src/db`;
 * the surfaces get plain arrays and hand them to the kernel.
 *
 * Every row is parsed through its kernel schema on the way out: a record written by
 * an older bundle that no longer fits is dropped rather than rendered half-formed.
 */

async function rows<T>(db: AppDatabase, entity: keyof typeof entityRowSchemas): Promise<T[]> {
  const records: EntityRecord[] = await db.entities.where('entity').equals(entity).toArray();
  const parsed: T[] = [];
  for (const record of records) {
    if (record.removed_at !== null) continue;
    const result = entityRowSchemas[entity].safeParse(record.row);
    if (result.success) parsed.push(result.data as T);
  }
  return parsed;
}

export function relatorioRows(db: AppDatabase): Promise<RelatorioRow[]> {
  return rows<RelatorioRow>(db, 'relatorio');
}

export function projectRows(db: AppDatabase): Promise<ProjectRow[]> {
  return rows<ProjectRow>(db, 'project');
}

/** The `client` registry rows, for the Home card title and the Clientes tab (Story 2.4). */
export async function clientRows(db: AppDatabase): Promise<ClientRow[]> {
  const registries = await rows<RegistryRow>(db, 'registry');
  return registries.filter((row): row is ClientRow => row.kind === 'client');
}

/** The company's Empresa row (Story 2.3), or null until a field has been committed. */
export async function empresaRow(db: AppDatabase): Promise<EmpresaRow | null> {
  const registries = await rows<RegistryRow>(db, 'registry');
  return registries.find((row): row is EmpresaRow => row.kind === 'empresa') ?? null;
}

/** The `instrument` registry rows, for the Instrumentos tab (Story 2.1). */
export async function instrumentRows(db: AppDatabase): Promise<InstrumentRow[]> {
  const registries = await rows<RegistryRow>(db, 'registry');
  return registries.filter((row): row is InstrumentRow => row.kind === 'instrument');
}

/** The `manufacturer` registry rows, for the Fabricantes tab (Story 2.5). */
export async function manufacturerRows(db: AppDatabase): Promise<WordRow[]> {
  const registries = await rows<RegistryRow>(db, 'registry');
  return registries.filter((row): row is Extract<WordRow, { kind: 'manufacturer' }> => row.kind === 'manufacturer');
}

/** The `voltage_class` registry rows, for the Classes de tensão tab (Story 2.5). */
export async function voltageClassRows(db: AppDatabase): Promise<WordRow[]> {
  const registries = await rows<RegistryRow>(db, 'registry');
  return registries.filter((row): row is Extract<WordRow, { kind: 'voltage_class' }> => row.kind === 'voltage_class');
}

/** Every block on this device, for `isInstrumentReferenced` (AC4). */
export function blockRows(db: AppDatabase): Promise<BlockRow[]> {
  return rows<BlockRow>(db, 'block');
}

export function templateRows(db: AppDatabase): Promise<TemplateRow[]> {
  return rows<TemplateRow>(db, 'template');
}

/** One live row of an entity by id, or null: absent, removed, or no longer parsing. */
async function liveRow<T>(db: AppDatabase, entity: keyof typeof entityRowSchemas, id: string): Promise<T | null> {
  const record = await db.entities.get([entity, id]);
  if (record === undefined || record.removed_at !== null) return null;
  const parsed = entityRowSchemas[entity].safeParse(record.row);
  return parsed.success ? (parsed.data as T) : null;
}

/** Every row of an entity in one relatório or project, tombstones included (the caller filters). */
async function rowsWhere<T>(db: AppDatabase, entity: keyof typeof entityRowSchemas, index: 'relatorio_id' | 'project_id', id: string): Promise<T[]> {
  const records = await db.entities.where(index).equals(id).toArray();
  const parsed: T[] = [];
  for (const record of records) {
    if (record.entity !== entity) continue;
    const result = entityRowSchemas[entity].safeParse(record.row);
    if (result.success) parsed.push(result.data as T);
  }
  return parsed;
}

/** One live project (Story 4.1, the Project surface), or null. */
export function projectRow(db: AppDatabase, id: string): Promise<ProjectRow | null> {
  return liveRow<ProjectRow>(db, 'project', id);
}

/** One live relatório (the Sumário's row), or null. */
export function relatorioRow(db: AppDatabase, id: string): Promise<RelatorioRow | null> {
  return liveRow<RelatorioRow>(db, 'relatorio', id);
}

/** The live relatórios of one project, in store order (the kernel orders them). */
export async function relatoriosOfProject(db: AppDatabase, projectId: string): Promise<RelatorioRow[]> {
  return (await rowsWhere<RelatorioRow>(db, 'relatorio', 'project_id', projectId)).filter((row) => row.removed_at === null);
}

/** The live locations of one relatório. */
export async function locationRows(db: AppDatabase, relatorioId: string): Promise<LocationRow[]> {
  return (await rowsWhere<LocationRow>(db, 'location', 'relatorio_id', relatorioId)).filter((row) => row.removed_at === null);
}

/** Story 6.6: every point of one relatório, removed ones included (a new point's order key is read from the live ones). */
export function pointRowsOf(db: AppDatabase, relatorioId: string): Promise<PointRow[]> {
  return rowsWhere<PointRow>(db, 'point', 'relatorio_id', relatorioId);
}

/** Every block of one relatório, removed ones included ("Restaurar ficha removida" lists them). */
export function blockRowsOf(db: AppDatabase, relatorioId: string): Promise<BlockRow[]> {
  return rowsWhere<BlockRow>(db, 'block', 'relatorio_id', relatorioId);
}

/**
 * Every block this device holds of the project's live relatórios, removed ones included
 * (Epic 4 QA Q4: a sheet's removal frees its equipment only when no other live block of
 * the obra references it).
 */
export async function projectBlockRows(db: AppDatabase, projectId: string): Promise<BlockRow[]> {
  const relatorios = await relatoriosOfProject(db, projectId);
  return (await Promise.all(relatorios.map((row) => blockRowsOf(db, row.id)))).flat();
}

/** Every equipment row of one project, removed ones included (`suggestTag` and `isTagTaken` read `removed_at`). */
export function equipmentRows(db: AppDatabase, projectId: string): Promise<EquipmentRow[]> {
  return rowsWhere<EquipmentRow>(db, 'equipment', 'project_id', projectId);
}

/**
 * The rows `buildSnapshot(state, relatorioId)` needs, as an `EntityState`: the relatório,
 * its project, its locations and blocks, the project's equipment and the company registry
 * rows. Null when this device holds no live relatório of that id. Read in one place so the
 * Sumário renders exactly what the kernel's snapshot says (AD-1, AD-15).
 */
export async function relatorioState(db: AppDatabase, relatorioId: string): Promise<EntityState | null> {
  // E7-A1/E8-A1: the relatório's own index is read once (not once per entity) and a record
  // whose write stamp (`rev`) is the one seen last time yields the row object parsed then,
  // so an untouched row keeps its identity across live-query runs and is not parsed again.
  const cache = parsedRows.get(databaseKey(db, relatorioId)) ?? new Map<string, ParsedRow>();
  const kept = new Map<string, ParsedRow>();
  const parse = <T>(record: EntityRecord): T | null => parsedRow<T>(record, cache, kept);

  const own = await db.entities.where('relatorio_id').equals(relatorioId).toArray();
  const byEntity = new Map<string, EntityRecord[]>();
  for (const record of own) {
    const list = byEntity.get(record.entity);
    if (list) list.push(record);
    else byEntity.set(record.entity, [record]);
  }
  const parsedOf = <T>(entity: keyof typeof entityRowSchemas): T[] => {
    const out: T[] = [];
    for (const record of byEntity.get(entity) ?? []) {
      const row = parse<T>(record);
      if (row !== null) out.push(row);
    }
    return out;
  };

  const relatorioRecord = (byEntity.get('relatorio') ?? []).find((record) => record.id === relatorioId);
  if (relatorioRecord === undefined || relatorioRecord.removed_at !== null) return null;
  const relatorio = parse<RelatorioRow>(relatorioRecord);
  if (relatorio === null) return null;
  const state = new Map<EntityKey, EntityRow>();
  const put = (entity: keyof typeof entityRowSchemas, row: { id: string }) => state.set(entityKey(entity, row.id), row as EntityRow);
  put('relatorio', relatorio);
  const projectRecord = await db.entities.get(['project', relatorio.project_id]);
  const project = projectRecord === undefined || projectRecord.removed_at !== null ? null : parse<ProjectRow>(projectRecord);
  if (project !== null) put('project', project);
  for (const row of parsedOf<LocationRow>('location')) if (row.removed_at === null) put('location', row);
  for (const row of parsedOf<BlockRow>('block')) put('block', row);
  const projectRecords = await db.entities.where('project_id').equals(relatorio.project_id).toArray();
  for (const record of projectRecords) {
    if (record.entity !== 'equipment') continue;
    const row = parse<EquipmentRow>(record);
    if (row !== null) put('equipment', row);
  }
  for (const record of await db.entities.where('entity').equals('registry').toArray()) {
    if (record.removed_at !== null) continue;
    const row = parse<RegistryRow>(record);
    if (row !== null) put('registry', row);
  }
  // Story 4.6: the Sumário's issued banner reads the relatório's revisions straight off
  // this state, the same way it already reads `equipment` -- `RelatorioSnapshot` is not
  // extended for revisions by this batch (batch D/4.8 owns that).
  for (const row of parsedOf<RevisionRow>('revision')) put('revision', row);
  // Story 6.6: section 8 is counted from the points, and a point citing a removed photo is
  // named by `preIssue`, so the snapshot needs both (`buildSnapshot` keeps the live ones).
  for (const row of parsedOf<PointRow>('point')) put('point', row);
  for (const row of parsedOf<FileRow>('file')) put('file', row);
  // Story 7.5 (AD-2, Epic 4 item 14): the responsible's `user` row, as the server's
  // `toSnapshot` holds it, so the setup gaps and the pre-issue rows read the same snapshot.
  // Kept as stored (not parsed), as before; its stamp still keeps its identity.
  const responsibleId = relatorio.setup.responsible_user_id;
  if (responsibleId !== null) {
    const record = await db.entities.get(['user', responsibleId]);
    if (record !== undefined) state.set(entityKey('user', responsibleId), storedRow(record, cache, kept));
  }
  // Story 8.1: the device's suggestion rows (pending ones included), which the nameplate and
  // the Sumário's pending counts read (`suggestionRowsOf`); `buildSnapshot` keeps only the
  // ones a cell references.
  for (const row of parsedOf<SuggestionRow>('suggestion')) put('suggestion', row);
  const at = databaseKey(db, relatorioId);
  parsedRows.set(at, kept);
  // A live-query run that finds every row as it was (a write elsewhere woke it) returns the
  // previous state itself, so its readers do not render again for nothing.
  const prev = lastStates.get(at);
  if (prev !== undefined && prev.size === state.size && [...state].every(([key, row]) => prev.get(key) === row)) return prev;
  lastStates.set(at, state);
  return state;
}

/** One cached row of `relatorioState`: the stamp of the record it was read from, and the row. */
interface ParsedRow {
  rev: string;
  row: unknown;
  /** Kept as stored, not parsed (the responsible's `user` row). */
  raw: boolean;
}

/**
 * E7-A1/E8-A1: per database and relatório, the rows the last `relatorioState` returned,
 * keyed by `entity:id`. Each entry carries the `rev` of the record it came from; a record
 * is written only through `toRecord`, which stamps a fresh `rev` on every write, so an
 * entry whose `rev` matches the record's is that record's row -- never a stale one. Each
 * call keeps only the entries it used, so rows that left the relatório are dropped. A
 * record without a stamp (written before `rev` existed) is parsed on every read.
 */
const parsedRows = new Map<string, Map<string, ParsedRow>>();
/** Per database and relatório, the state the last `relatorioState` returned. */
const lastStates = new Map<string, EntityState>();

function databaseKey(db: AppDatabase, relatorioId: string): string {
  return `${db.name}|${relatorioId}`;
}

function parsedRow<T>(record: EntityRecord, cache: Map<string, ParsedRow>, kept: Map<string, ParsedRow>): T | null {
  const key = `${record.entity}:${record.id}`;
  const hit = record.rev === undefined ? undefined : cache.get(key);
  if (hit !== undefined && hit.rev === record.rev && !hit.raw) {
    kept.set(key, hit);
    return hit.row as T;
  }
  const result = entityRowSchemas[record.entity].safeParse(record.row);
  if (!result.success) return null;
  if (record.rev !== undefined) kept.set(key, { rev: record.rev, row: result.data, raw: false });
  return result.data as T;
}

function storedRow(record: EntityRecord, cache: Map<string, ParsedRow>, kept: Map<string, ParsedRow>): EntityRow {
  const key = `${record.entity}:${record.id}`;
  const hit = record.rev === undefined ? undefined : cache.get(key);
  if (hit !== undefined && hit.rev === record.rev && hit.raw) {
    kept.set(key, hit);
    return hit.row as EntityRow;
  }
  if (record.rev !== undefined) kept.set(key, { rev: record.rev, row: record.row, raw: true });
  return record.row;
}

/**
 * One live template (the composer's row, Story 3.4), or null when this device holds no
 * live template of that id -- never there, removed, or a record that no longer parses.
 */
export async function templateRow(db: AppDatabase, id: string): Promise<TemplateRow | null> {
  const record = await db.entities.get(['template', id]);
  if (record === undefined || record.removed_at !== null) return null;
  const parsed = entityRowSchemas.template.safeParse(record.row);
  return parsed.success ? (parsed.data as TemplateRow) : null;
}

/**
 * Files held on this device, for the Account storage line: one per file, not one per
 * stored blob.
 *
 * `files` is keyed by `id` alone today, so a second variant of one file overwrites the
 * first and no double count is possible yet. AD-7 gives a file an `original`, a `thumb`
 * and sometimes a `crop`, so that key grows when Epic 6 stores them side by side —
 * counting rows would then count one photo two or three times. Counting the `original`
 * is the count the word "fotos" can stand behind before and after that change.
 */
export async function originalFileCount(db: AppDatabase): Promise<number> {
  return db.files.filter((row) => row.variant === 'original').count();
}
