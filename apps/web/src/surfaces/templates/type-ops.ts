import {
  equipmentTypeFieldPath,
  equipmentTypePath,
  equipmentTypeVersionPath,
  type CompanyTypeDraft,
  type EquipmentTypeRow,
  type EquipmentTypeVersionRow,
  type JsonValue,
  type OpDraft,
} from '@app/domain';

/*
 * Story 14.7 (AD-3 note of 2026-11-06): the only ops the type list and the type editor write, all
 * company scope: the `equipment_type/{id}` create ("Duplicar"), its `draft`, `retired_at` and
 * `removed_at` puts (every editor change, "Aposentar" and "Reativar", "Descartar rascunho"), and the
 * one `equipment_type_version/{id}` create ("Publicar"). The kernel builds every value
 * (`newEquipmentTypeRow`, `typeVersionRow`, the draft edits).
 */

interface Author {
  id: string;
  companyId: string;
}

function envelope(author: Author): Omit<OpDraft, 'kind' | 'path' | 'value'> {
  return { scope: 'company', company_id: author.companyId, project_id: null, relatorio_id: null, prev_op_id: null, batch_id: null, meta: null, actor_id: author.id };
}

/** `equipment_type/{id}` create of a whole row. */
export function createTypeOp(author: Author, row: EquipmentTypeRow): OpDraft {
  return { ...envelope(author), kind: 'create', path: equipmentTypePath(row.id), value: row as unknown as JsonValue };
}

/** `equipment_type/{id}/draft` put of the whole draft (or null). */
export function putTypeDraftOp(author: Author, id: string, draft: CompanyTypeDraft | null): OpDraft {
  return { ...envelope(author), kind: 'put', path: equipmentTypeFieldPath(id, 'draft'), value: draft as unknown as JsonValue };
}

/** `equipment_type/{id}/{retired_at|removed_at}` put. */
export function putTypeStampOp(author: Author, id: string, field: 'retired_at' | 'removed_at', at: string | null): OpDraft {
  return { ...envelope(author), kind: 'put', path: equipmentTypeFieldPath(id, field), value: at };
}

/** `equipment_type_version/{id}` create: "Publicar". */
export function createVersionOp(author: Author, row: EquipmentTypeVersionRow): OpDraft {
  return { ...envelope(author), kind: 'create', path: equipmentTypeVersionPath(row.id), value: row as unknown as JsonValue };
}
