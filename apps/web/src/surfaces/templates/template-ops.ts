import { templateFieldPath, templatePath, type JsonValue, type OpDraft, type TemplateRow } from '@app/domain';

/*
 * The only ops the Templates surfaces write (Story 3.4 AC, FR-13): a `template/{id}`
 * create and `template/{id}/{name|blocks|skeleton|archived_at|removed_at}` puts and
 * removes, all company scope. No `relatorio`, `location` or `block` op is ever built here,
 * which is what keeps relatórios already created from a template untouched.
 */

export type TemplateField = 'name' | 'blocks' | 'skeleton' | 'archived_at';

interface Author {
  id: string;
  companyId: string;
}

function envelope(author: Author): Omit<OpDraft, 'kind' | 'path' | 'value'> {
  return {
    scope: 'company',
    company_id: author.companyId,
    project_id: null,
    relatorio_id: null,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: author.id,
  };
}

/** `template/{id}` create of a whole row. */
export function createTemplateOp(author: Author, row: TemplateRow): OpDraft {
  return { ...envelope(author), kind: 'create', path: templatePath(row.id), value: row as unknown as JsonValue };
}

/** `template/{id}/{field}` put. */
export function putTemplateOp(author: Author, id: string, field: TemplateField, value: unknown): OpDraft {
  return { ...envelope(author), kind: 'put', path: templateFieldPath(id, field), value: value as JsonValue };
}

/** `template/{id}/removed_at` remove: the row is tombstoned, and an undo puts null back. */
export function removeTemplateOp(author: Author, id: string): OpDraft {
  return { ...envelope(author), kind: 'remove', path: templateFieldPath(id, 'removed_at'), value: null };
}

/** The toast for a refused device write (AD-8, FR-54), kept where the edit queue raises it. */
export { writeErrorText } from '../../state/use-undoable-edits.ts';
