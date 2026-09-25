import type { OpDraft } from '../ops/op.ts';
import { blockFieldPath, relatorioStatusPath } from '../ops/path.ts';
import type { JsonValue, RelatorioStatus } from '../schemas/entities.ts';

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
