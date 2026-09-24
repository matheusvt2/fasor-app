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
  type InstrumentRow,
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
  const relatorio = await relatorioRow(db, relatorioId);
  if (relatorio === null) return null;
  const state = new Map<EntityKey, EntityRow>();
  const put = (entity: keyof typeof entityRowSchemas, row: { id: string }) => state.set(entityKey(entity, row.id), row as EntityRow);
  put('relatorio', relatorio);
  const project = await projectRow(db, relatorio.project_id);
  if (project !== null) put('project', project);
  for (const row of await locationRows(db, relatorioId)) put('location', row);
  for (const row of await blockRowsOf(db, relatorioId)) put('block', row);
  for (const row of await equipmentRows(db, relatorio.project_id)) put('equipment', row);
  for (const row of await rows<RegistryRow>(db, 'registry')) put('registry', row);
  // Story 4.6: the Sumário's issued banner reads the relatório's revisions straight off
  // this state, the same way it already reads `equipment` -- `RelatorioSnapshot` is not
  // extended for revisions by this batch (batch D/4.8 owns that).
  for (const row of await rowsWhere<RevisionRow>(db, 'revision', 'relatorio_id', relatorioId)) put('revision', row);
  return state;
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
