import { fileRowSchema, relatorioRowSchema, uuidV7Schema, type NotCaughtUpDetails } from '@app/domain';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import type { CompanyId } from '../db/repositories/company-id.ts';
import { entities, ops } from '../db/schema.ts';

/*
 * AD-15's flush barrier, shared by the job routes (generate and preview, Story 4.8 and 7.5;
 * the emission audit, Story 13.8): the live relatório of the session's company, and what the
 * server still misses of what the device says it sent.
 */

/** The live relatório `id` of the company (its project and latest preview file), or null: unknown, removed, malformed or another company's. */
export async function readLiveRelatorio(db: Db, companyId: CompanyId, id: string): Promise<{ project_id: string; preview_file_id: string | null } | null> {
  if (!uuidV7Schema.safeParse(id).success) return null;
  const [record] = await db
    .select({ row: entities.row, removed_at: entities.removed_at })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'relatorio'), eq(entities.id, id)))
    .limit(1);
  if (record === undefined || record.removed_at !== null) return null;
  const parsed = relatorioRowSchema.safeParse(record.row);
  return parsed.success ? { project_id: parsed.data.project_id, preview_file_id: parsed.data.preview_file_id } : null;
}

/** The barrier: is the named op in the log, and is every named file stored? */
export async function barrierMissing(db: Db, companyId: CompanyId, lastOpId: string | null, fileIds: readonly string[]): Promise<NotCaughtUpDetails> {
  let missingOp = false;
  if (lastOpId !== null) {
    const [found] = await db
      .select({ op_id: ops.op_id })
      .from(ops)
      .where(and(eq(ops.company_id, companyId), eq(ops.op_id, lastOpId)))
      .limit(1);
    missingOp = found === undefined;
  }
  const stored = new Set<string>();
  if (fileIds.length > 0) {
    const rows = await db
      .select({ id: entities.id, row: entities.row })
      .from(entities)
      .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'file'), inArray(entities.id, [...fileIds])));
    for (const record of rows) {
      const parsed = fileRowSchema.safeParse(record.row);
      if (parsed.success && parsed.data.uploaded_at !== null) stored.add(record.id);
    }
  }
  return { missing_op: missingOp, missing_files: fileIds.filter((id) => !stored.has(id)) };
}
