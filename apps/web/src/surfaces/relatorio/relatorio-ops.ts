import type { BlockRow, JsonValue, OpDraft } from '@app/domain';

/*
 * The ops the Sumário writes (Story 4.3): `block/{id}/{order_key|removed_at}` puts and
 * `block/{id}` creates, all relatório scope. The relatório row itself, its locations and
 * its equipment are born by `instantiateTemplate` (Story 4.1) and never touched here.
 */

export interface Author {
  id: string;
  companyId: string;
}

function envelope(author: Author, relatorioId: string): Omit<OpDraft, 'kind' | 'path' | 'value'> {
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

export type BlockField = 'order_key' | 'removed_at' | 'config';

/** `block/{id}/{field}` put. */
export function putBlockOp(author: Author, relatorioId: string, blockId: string, field: BlockField, value: unknown): OpDraft {
  return { ...envelope(author, relatorioId), kind: 'put', path: `block/${blockId}/${field}`, value: value as JsonValue };
}

/** `block/{id}/removed_at` remove: the row is tombstoned, and an undo puts null back. */
export function removeBlockOp(author: Author, relatorioId: string, blockId: string): OpDraft {
  return { ...envelope(author, relatorioId), kind: 'remove', path: `block/${blockId}/removed_at`, value: null };
}

/** `block/{id}` create of a whole row. */
export function createBlockOp(author: Author, relatorioId: string, row: BlockRow): OpDraft {
  return { ...envelope(author, relatorioId), kind: 'create', path: `block/${row.id}`, value: row as unknown as JsonValue };
}

/** `relatorio/status` put: a manual backward move (Story 4.6), the server never writes it. */
export function putRelatorioStatusOp(author: Author, relatorioId: string, status: string): OpDraft {
  return { ...envelope(author, relatorioId), kind: 'put', path: 'relatorio/status', value: status as JsonValue };
}
