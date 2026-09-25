import type { OpDraft } from '../ops/op.ts';
import { blockFieldPath, pointFieldPath, pointPath, relatorioStatusPath } from '../ops/path.ts';
import type { JsonValue, PointRow, RelatorioStatus } from '../schemas/entities.ts';

/*
 * Epic 4 retro item 7: the one builder of the relatório-scope op envelope, the
 * `relatorio/status` put and the `block/{id}/{field}` put. Every status move (setup's
 * "Concluir", the Export dialog's generate and issue, the Sumário's backward move, the
 * commit path's `Emitido --edit--> Em revisão`) and every block write goes through these,
 * so no caller hand-builds the envelope.
 */

/** Who writes: the signed-in user and their company. */
export interface Author {
  id: string;
  companyId: string;
}

/** A relatório-scope op without its kind, path and value. */
export function relatorioOpEnvelope(author: Author, relatorioId: string): Omit<OpDraft, 'kind' | 'path' | 'value'> {
  return {
    scope: 'relatorio',
    company_id: author.companyId,
    project_id: null,
    relatorio_id: relatorioId,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: author.id,
  };
}

/** `relatorio/status` put (AD-22: a client op; the server never writes it). */
export function putRelatorioStatusOp(author: Author, relatorioId: string, status: RelatorioStatus): OpDraft {
  return { ...relatorioOpEnvelope(author, relatorioId), kind: 'put', path: relatorioStatusPath(), value: status };
}

export type BlockField = 'order_key' | 'removed_at' | 'config' | 'concluded_by' | 'not_tested';

/** `block/{id}/{field}` put. */
export function putBlockOp(author: Author, relatorioId: string, blockId: string, field: BlockField, value: unknown): OpDraft {
  return { ...relatorioOpEnvelope(author, relatorioId), kind: 'put', path: blockFieldPath(blockId, field), value: value as JsonValue };
}

/** Story 6.6: the `point/{id}/{field}` fields a device writes (`origin` is set at create). */
export type PointField = 'text' | 'equipment_id' | 'order_key' | 'action' | 'priority' | 'deadline' | 'owner';

/** `point/{id}` create of a whole row (section 8, Story 6.6). */
export function createPointOp(author: Author, row: PointRow): OpDraft {
  return { ...relatorioOpEnvelope(author, row.relatorio_id), kind: 'create', path: pointPath(row.id), value: row as unknown as JsonValue };
}

/** `point/{id}/{field}` put. */
export function putPointOp(author: Author, relatorioId: string, pointId: string, field: PointField, value: string | null): OpDraft {
  return { ...relatorioOpEnvelope(author, relatorioId), kind: 'put', path: pointFieldPath(pointId, field), value };
}

/** `point/{id}/removed_at` remove: the point is tombstoned (AD-20), and a put of null restores it. */
export function removePointOp(author: Author, relatorioId: string, pointId: string): OpDraft {
  return { ...relatorioOpEnvelope(author, relatorioId), kind: 'remove', path: pointFieldPath(pointId, 'removed_at'), value: null };
}
