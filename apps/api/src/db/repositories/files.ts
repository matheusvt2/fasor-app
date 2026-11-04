import { fileRowSchema, uuidV7Schema, type FileRow } from '@app/domain';
import { and, eq, inArray, sql } from 'drizzle-orm';
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

/**
 * e20f (2026-11-04, QA N2): whether the relatório a file is filed under is removed (its row
 * tombstoned), so the file route stops serving its photos with it. False for a relatório the
 * company does not hold.
 */
export async function relatorioRemoved(db: Reader, companyId: CompanyId, relatorioId: string): Promise<boolean> {
  const [record] = await db
    .select({ removed_at: entities.removed_at })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'relatorio'), eq(entities.id, relatorioId)))
    .limit(1);
  return record !== undefined && record.removed_at !== null;
}

/**
 * E20-A1 (R-5): whether a company-wide file is the cover photo of removed relatórios only. A
 * cover photo is filed under no relatório (`file-commit.ts`), so `relatorioRemoved` never sees
 * it: it is named by `relatorio.setup.cover_photo_file_id`. True when at least one relatório of
 * the company names it as its cover and every one that does is removed; false when none names it
 * or a live one does.
 */
export async function coverOfRemovedRelatoriosOnly(db: Reader, companyId: CompanyId, fileId: string): Promise<boolean> {
  const records = await db
    .select({ removed_at: entities.removed_at })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'relatorio'), sql`${entities.row}->'setup'->>'cover_photo_file_id' = ${fileId}`));
  return records.length > 0 && records.every((record) => record.removed_at !== null);
}

/**
 * Story 20.13 (S8), e20f (QA N2), E20-A1 (R-5): whether the file routes withhold a file the
 * company holds, answering 404 as for one it does not: the file is removed (its row or its
 * lookup tombstoned), it is filed under a removed relatório, or it is the cover photo of removed
 * relatórios only. Restoring the relatório serves it again. An issued revision's documents are
 * served by their own routes.
 */
export async function fileWithdrawn(db: Reader, companyId: CompanyId, id: string, lookup: FileRowLookup): Promise<boolean> {
  if (lookup.removedAt !== null || lookup.row.removed_at != null) return true;
  if (lookup.relatorioId !== null) return relatorioRemoved(db, companyId, lookup.relatorioId);
  // A cover is a photo: a logo or a certificate is never asked (the cover query scans the company's relatórios).
  if (lookup.row.kind !== 'photo') return false;
  return coverOfRemovedRelatoriosOnly(db, companyId, id);
}
