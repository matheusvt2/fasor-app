import {
  buildSnapshot,
  entityKey,
  type Entity,
  type EntityKey,
  type EntityRow,
  type RelatorioRow,
  type RelatorioSnapshot,
} from '@app/domain';
import { and, eq, or } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import type { CompanyId } from '../db/repositories/company-id.ts';
import { entities } from '../db/schema.ts';

/** AD-15: the server-side `toSnapshot()`, byte-equal to the device's for one log. */
export async function toSnapshot(db: Db, companyId: CompanyId, relatorioId: string): Promise<RelatorioSnapshot> {
  const [relatorio] = await db
    .select()
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'relatorio'), eq(entities.id, relatorioId)));
  if (!relatorio) throw new Error(`relatorio ${relatorioId} not found`);
  const projectId = (relatorio.row as RelatorioRow).project_id;
  const rows = await db
    .select()
    .from(entities)
    .where(
      and(
        eq(entities.company_id, companyId),
        or(
          eq(entities.relatorio_id, relatorioId),
          eq(entities.project_id, projectId),
          and(eq(entities.entity, 'project'), eq(entities.id, projectId)),
          eq(entities.entity, 'registry'),
        ),
      ),
    );
  const state = new Map<EntityKey, EntityRow>();
  for (const row of [relatorio, ...rows]) state.set(entityKey(row.entity as Entity, row.id), row.row);
  return buildSnapshot(state, relatorioId);
}
