import { revisionRowSchema, type RevisionRow } from '@app/domain';
import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../client.ts';
import { entities } from '../schema.ts';
import type { CompanyId } from './company-id.ts';

/**
 * The live `revision` rows of a relatório, parsed, read through `reader` (the pool or a
 * transaction). The generate route and the generate job both read them here (A-28).
 */
export async function liveRevisions(reader: Pick<Db, 'select'>, companyId: CompanyId, relatorioId: string): Promise<RevisionRow[]> {
  const rows = await reader
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'revision'), eq(entities.relatorio_id, relatorioId), isNull(entities.removed_at)));
  return rows.flatMap((r) => {
    const parsed = revisionRowSchema.safeParse(r.row);
    return parsed.success ? [parsed.data] : [];
  });
}
