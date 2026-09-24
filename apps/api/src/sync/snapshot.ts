import {
  buildSnapshot,
  entityKey,
  type Entity,
  type EntityKey,
  type EntityRow,
  type RelatorioRow,
  type RelatorioSnapshot,
} from '@app/domain';
import { and, eq, max, or } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import type { CompanyId } from '../db/repositories/company-id.ts';
import { entities, ops } from '../db/schema.ts';
import type { Tx } from './apply.ts';

/** What the snapshot reads through: the pool, or the transaction a freeze runs in. */
type Reader = Pick<Db, 'select'>;

/** AD-15: the server-side `toSnapshot()`, byte-equal to the device's for one log. */
export async function toSnapshot(db: Reader, companyId: CompanyId, relatorioId: string): Promise<RelatorioSnapshot> {
  const [relatorio] = await db
    .select()
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'relatorio'), eq(entities.id, relatorioId)));
  if (!relatorio) throw new Error(`relatorio ${relatorioId} not found`);
  const row = relatorio.row as RelatorioRow;
  const projectId = row.project_id;
  const responsibleId = row.setup.responsible_user_id;
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
          // Story 4.8: the responsible's `user` row, for the cover and the document control.
          responsibleId === null ? undefined : and(eq(entities.entity, 'user'), eq(entities.id, responsibleId)),
        ),
      ),
    );
  const state = new Map<EntityKey, EntityRow>();
  for (const record of [relatorio, ...rows]) state.set(entityKey(record.entity as Entity, record.id), record.row);
  return buildSnapshot(state, relatorioId);
}

export interface FrozenSnapshot {
  snapshot: RelatorioSnapshot;
  /** `max(seq)` of the relatório's stream (its ops, its project's and the company's) at the freeze. */
  snapshotSeq: number;
}

/**
 * AD-15: the generate job's frozen input, read inside a transaction the caller locked
 * with `lockCompany`, so no op interleaves between the snapshot and its `snapshot_seq`.
 * `editedSince(snapshot_seq)` later compares against exactly this head.
 */
export async function freezeSnapshot(tx: Tx, companyId: CompanyId, relatorioId: string): Promise<FrozenSnapshot> {
  const snapshot = await toSnapshot(tx, companyId, relatorioId);
  const [head] = await tx
    .select({ seq: max(ops.seq) })
    .from(ops)
    .where(
      and(
        eq(ops.company_id, companyId),
        or(eq(ops.relatorio_id, relatorioId), eq(ops.project_id, snapshot.relatorio.project_id), eq(ops.scope, 'company')),
      ),
    );
  return { snapshot, snapshotSeq: head?.seq ?? 0 };
}
