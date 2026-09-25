import {
  blockFieldPath,
  blockPath,
  equipmentFieldPath,
  equipmentPath,
  locationAgruparPath,
  locationFieldPath,
  locationPath,
  relatorioOpEnvelope,
  type Author,
  type BlockRow,
  type EquipmentRow,
  type JsonValue,
  type LocationRow,
  type OpDraft,
} from '@app/domain';

/*
 * The ops the Sumário and its location tree write (Stories 4.3, 4.4, 4.5):
 * `block/{id}/{order_key|removed_at}` puts and `block/{id}` creates, `location/{id}`
 * creates and `name`/`order_key`/`agrupar_por_tipo` puts (relatório scope), and the
 * project-scope `equipment/{id}` create and `tag`/`removed_at` writes. The relatório row
 * itself is born by `instantiateTemplate` (Story 4.1) and never touched here. The envelope,
 * the `relatorio/status` put and the `block/{id}/{field}` put are the kernel's (Epic 4 retro
 * item 7), re-exported here so the surfaces keep one import.
 */

export { putBlockOp, putRelatorioStatusOp, type Author, type BlockField } from '@app/domain';

const envelope = relatorioOpEnvelope;

/** Equipment belongs to the project (AD-5): its ops are project scope, and every relatório of the project pulls them. */
function projectEnvelope(author: Author, projectId: string): Omit<OpDraft, 'kind' | 'path' | 'value'> {
  return { ...envelope(author, ''), scope: 'project', project_id: projectId, relatorio_id: null };
}

/** `block/{id}/removed_at` remove: the row is tombstoned, and an undo puts null back. */
export function removeBlockOp(author: Author, relatorioId: string, blockId: string): OpDraft {
  return { ...envelope(author, relatorioId), kind: 'remove', path: blockFieldPath(blockId, 'removed_at'), value: null };
}

/** `block/{id}` create of a whole row. */
export function createBlockOp(author: Author, relatorioId: string, row: BlockRow): OpDraft {
  return { ...envelope(author, relatorioId), kind: 'create', path: blockPath(row.id), value: row as unknown as JsonValue };
}

/** `location/{id}` create of a whole row (a coluna or a cabine added from the tree). */
export function createLocationOp(author: Author, relatorioId: string, row: LocationRow): OpDraft {
  return { ...envelope(author, relatorioId), kind: 'create', path: locationPath(row.id), value: row as unknown as JsonValue };
}

/** `location/{id}/{name|order_key}` put. */
export function putLocationOp(author: Author, relatorioId: string, locationId: string, field: 'name' | 'order_key', value: string): OpDraft {
  return { ...envelope(author, relatorioId), kind: 'put', path: locationFieldPath(locationId, field), value };
}

/** `location/{id}/agrupar_por_tipo` put (the cabine's flag; the family has no field segment). */
export function putAgruparOp(author: Author, relatorioId: string, locationId: string, value: boolean): OpDraft {
  return { ...envelope(author, relatorioId), kind: 'put', path: locationAgruparPath(locationId), value };
}

/** `equipment/{id}` create, project scope. */
export function createEquipmentOp(author: Author, row: EquipmentRow): OpDraft {
  return { ...projectEnvelope(author, row.project_id), kind: 'create', path: equipmentPath(row.id), value: row as unknown as JsonValue };
}

/** `equipment/{id}/tag` put: a rename keeps the row, so the block and its history stay attached. */
export function putEquipmentTagOp(author: Author, projectId: string, equipmentId: string, tag: string): OpDraft {
  return { ...projectEnvelope(author, projectId), kind: 'put', path: equipmentFieldPath(equipmentId, 'tag'), value: tag };
}

/** `equipment/{id}/removed_at` remove (the TAG is freed with its sheet), or a put of null that restores it. */
export function equipmentRemovedOp(author: Author, projectId: string, equipmentId: string, removed: boolean): OpDraft {
  return removed
    ? { ...projectEnvelope(author, projectId), kind: 'remove', path: equipmentFieldPath(equipmentId, 'removed_at'), value: null }
    : { ...projectEnvelope(author, projectId), kind: 'put', path: equipmentFieldPath(equipmentId, 'removed_at'), value: null };
}
