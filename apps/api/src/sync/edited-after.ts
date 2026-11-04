import { blockRowSchema, referencedEquipmentIds, relatorioEditedSince, type Op } from '@app/domain';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import type { CompanyId } from '../db/repositories/company-id.ts';
import { entities, ops } from '../db/schema.ts';

/**
 * AD-15: exists an op of the relatório's stream after the snapshot that counts as an edit.
 * The stream is the relatório's own ops plus the project-scope ops of the equipment its
 * live blocks reference (Epic 4 retro items 18, Q15): the kernel decides both.
 *
 * Story 20.7 (2026-11-03): moved here from `http/generate.ts`, unchanged, so the generate route's
 * `unchanged` answer and the server's status check (`rules.ts`, a move to Em revisão on an
 * unchanged revision) read the same predicate.
 */
export async function editedAfter(reader: Pick<Db, 'select'>, companyId: CompanyId, relatorioId: string, projectId: string, snapshotSeq: number): Promise<boolean> {
  const blockRows = await reader
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'block'), eq(entities.relatorio_id, relatorioId), isNull(entities.removed_at)));
  const rows = await reader
    .select({ path: ops.path, actor_id: ops.actor_id, kind: ops.kind, value: ops.value, seq: ops.seq, scope: ops.scope, relatorio_id: ops.relatorio_id })
    .from(ops)
    .where(
      and(
        eq(ops.company_id, companyId),
        gt(ops.seq, snapshotSeq),
        or(eq(ops.relatorio_id, relatorioId), and(eq(ops.scope, 'project'), eq(ops.project_id, projectId))),
      ),
    );
  const blocks = blockRows.flatMap((r) => {
    const parsed = blockRowSchema.safeParse(r.row);
    return parsed.success ? [parsed.data] : [];
  });
  return relatorioEditedSince(
    rows.map((r) => ({
      path: r.path,
      actor_id: r.actor_id,
      kind: r.kind as Op['kind'],
      value: r.value,
      seq: r.seq,
      scope: r.scope as Op['scope'],
      relatorio_id: r.relatorio_id,
    })),
    snapshotSeq,
    { relatorioId, equipmentIds: referencedEquipmentIds(blocks) },
  );
}
