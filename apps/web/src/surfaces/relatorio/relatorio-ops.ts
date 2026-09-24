import type { BlockRow, EquipmentRow, JsonValue, LocationRow, OpDraft } from '@app/domain';

/*
 * The ops the Sumário and its location tree write (Stories 4.3, 4.4, 4.5):
 * `block/{id}/{order_key|removed_at}` puts and `block/{id}` creates, `location/{id}`
 * creates and `name`/`order_key`/`agrupar_por_tipo` puts (relatório scope), and the
 * project-scope `equipment/{id}` create and `tag`/`removed_at` writes. The relatório row
 * itself is born by `instantiateTemplate` (Story 4.1) and never touched here.
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

/** Equipment belongs to the project (AD-5): its ops are project scope, and every relatório of the project pulls them. */
function projectEnvelope(author: Author, projectId: string): Omit<OpDraft, 'kind' | 'path' | 'value'> {
  return { ...envelope(author, ''), scope: 'project', project_id: projectId, relatorio_id: null };
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

/** `location/{id}` create of a whole row (a coluna or a cabine added from the tree). */
export function createLocationOp(author: Author, relatorioId: string, row: LocationRow): OpDraft {
  return { ...envelope(author, relatorioId), kind: 'create', path: `location/${row.id}`, value: row as unknown as JsonValue };
}

/** `location/{id}/{name|order_key}` put. */
export function putLocationOp(author: Author, relatorioId: string, locationId: string, field: 'name' | 'order_key', value: string): OpDraft {
  return { ...envelope(author, relatorioId), kind: 'put', path: `location/${locationId}/${field}`, value };
}

/** `location/{id}/agrupar_por_tipo` put (the cabine's flag; the family has no field segment). */
export function putAgruparOp(author: Author, relatorioId: string, locationId: string, value: boolean): OpDraft {
  return { ...envelope(author, relatorioId), kind: 'put', path: `location/${locationId}/agrupar_por_tipo`, value };
}

/** `equipment/{id}` create, project scope. */
export function createEquipmentOp(author: Author, row: EquipmentRow): OpDraft {
  return { ...projectEnvelope(author, row.project_id), kind: 'create', path: `equipment/${row.id}`, value: row as unknown as JsonValue };
}

/** `equipment/{id}/tag` put: a rename keeps the row, so the block and its history stay attached. */
export function putEquipmentTagOp(author: Author, projectId: string, equipmentId: string, tag: string): OpDraft {
  return { ...projectEnvelope(author, projectId), kind: 'put', path: `equipment/${equipmentId}/tag`, value: tag };
}

/** `equipment/{id}/removed_at` remove (the TAG is freed with its sheet), or a put of null that restores it. */
export function equipmentRemovedOp(author: Author, projectId: string, equipmentId: string, removed: boolean): OpDraft {
  return removed
    ? { ...projectEnvelope(author, projectId), kind: 'remove', path: `equipment/${equipmentId}/removed_at`, value: null }
    : { ...projectEnvelope(author, projectId), kind: 'put', path: `equipment/${equipmentId}/removed_at`, value: null };
}
