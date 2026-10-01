import { fileRowSchema, uuidV7Schema, type FileRow } from '@app/domain';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../client.ts';
import { entities } from '../schema.ts';
import type { CompanyId } from './company-id.ts';

/*
 * The one lookup of a `file` row (review 2026-09-30, A-28): the file routes, the reread
 * route, the push's re-targeted reading, the reading status writes and the generate job all
 * read a file row by id through here, scoped by the company (AD-10).
 */

/** What any reader of a query runs through: the pool, or a transaction. */
type Reader = Pick<Db, 'select'>;

export interface FileRowLookup {
  row: FileRow;
  /** The `entities.relatorio_id` column the row is filed under (the key a photo's objects live under). */
  relatorioId: string | null;
  /** The `entities.removed_at` column. */
  removedAt: string | null;
}

function lookupOf(id: string, record: { row: unknown; relatorio_id: string | null; removed_at: string | null }): FileRowLookup | null {
  const parsed = fileRowSchema.safeParse(record.row);
  // The stored row is the create op's client-supplied JSON, so its `id` is claimed, not
  // proven: a row whose claimed id is not the id it is filed under is refused, since every
  // caller builds object keys from it.
  if (!parsed.success || parsed.data.id !== id) return null;
  return { row: parsed.data, relatorioId: record.relatorio_id, removedAt: record.removed_at };
}

/**
 * The company's own `file` row by id, parsed, or null: for another company's id, an unknown
 * one, a row that does not parse or claims another id, and an id that is not a uuid at all
 * (`entities.id` is a uuid column, so a malformed value would otherwise raise a cast error).
 */
export async function findFileRow(db: Reader, companyId: CompanyId, id: string): Promise<FileRowLookup | null> {
  if (!uuidV7Schema.safeParse(id).success) return null;
  const [record] = await db
    .select({ row: entities.row, relatorio_id: entities.relatorio_id, removed_at: entities.removed_at })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'file'), eq(entities.id, id)))
    .limit(1);
  return record === undefined ? null : lookupOf(id, record);
}

/** Several `file` rows of the company in one query, by id; an id `findFileRow` would answer null for is absent. */
export async function findFileRows(db: Reader, companyId: CompanyId, ids: readonly string[]): Promise<Map<string, FileRowLookup>> {
  const wanted = [...new Set(ids)].filter((id) => uuidV7Schema.safeParse(id).success);
  const out = new Map<string, FileRowLookup>();
  if (wanted.length === 0) return out;
  const records = await db
    .select({ id: entities.id, row: entities.row, relatorio_id: entities.relatorio_id, removed_at: entities.removed_at })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'file'), inArray(entities.id, wanted)));
  for (const record of records) {
    const lookup = lookupOf(record.id, record);
    if (lookup !== null) out.set(record.id, lookup);
  }
  return out;
}
