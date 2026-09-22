import {
  entityRowSchemas,
  type ProjectRow,
  type RegistryRow,
  type RelatorioRow,
  type RelatorioSummary,
  type TemplateRow,
} from '@app/domain';
import { COMPANY_STREAM, type AppDatabase, type EntityRecord } from './schema.ts';

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

/** The `client` registry rows: the only registry kind a Home card title needs. */
export async function clientRows(db: AppDatabase): Promise<RegistryRow[]> {
  const registries = await rows<RegistryRow>(db, 'registry');
  return registries.filter((row) => row.kind === 'client');
}

export function templateRows(db: AppDatabase): Promise<TemplateRow[]> {
  return rows<TemplateRow>(db, 'template');
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

/** AD-8: the relatórios the company knows about, from the `company` sync_state row. */
export async function companySummaryRelatorios(db: AppDatabase): Promise<RelatorioSummary[]> {
  const row = await db.sync_state.get(COMPANY_STREAM);
  return row?.relatorios ?? [];
}
