import { uuidV7Schema } from '../ids.ts';
import { rowIndexColumns, type Entity, type EntityRow } from '../schemas/entities.ts';
import type { Op } from './op.ts';
import { targetOf, type OpPath } from './path.ts';

/*
 * Story 20.10 (2026-11-03, contract 29, security pass S5): every client op lands on a row that
 * exists in the relatório it names. The server checks it in the apply transaction, under the
 * company lock and after the merge redirect, against the rows it holds then: a row created earlier
 * in the same push counts, and a put on a tombstoned row still applies (LWW). A refusal is
 * `op_target_missing`, and the op is never logged, so no orphan op hides in a stream nobody pulls.
 */

/** What the server must find before a client op applies. */
export type TargetLookup =
  /** Nothing: a create naming no relatório (company or project scope). */
  | { readonly kind: 'none' }
  /** A `relatorio/{id}` create filed under another relatório's id: refused without a lookup. */
  | { readonly kind: 'refused' }
  /** A create naming a relatório: that relatório must exist in the company (live or tombstoned). */
  | { readonly kind: 'relatorio'; readonly id: string }
  /** A put or remove: its target row (the op's own relatório for the implicit families). */
  | { readonly kind: 'row'; readonly entity: Entity; readonly id: string };

export function targetLookupOf(op: Op, path: OpPath): TargetLookup {
  if (op.kind === 'create') {
    if (op.relatorio_id == null) return { kind: 'none' };
    // A relatório's stream id is its own id: a create filed under another would hide in that stream.
    if (path.family === 'relatorio') return op.relatorio_id === path.id ? { kind: 'none' } : { kind: 'refused' };
    return { kind: 'relatorio', id: op.relatorio_id };
  }
  const target = targetOf(path);
  const id = target.id ?? op.relatorio_id;
  return id == null ? { kind: 'refused' } : { kind: 'row', entity: target.entity, id };
}

export type TargetVerdict = 'allowed' | 'refused';

/**
 * Whether the target row the server holds may take a put or remove: it exists (live or
 * tombstoned), a relatório-scope row (and the relatório itself, for the implicit families) belongs
 * to the op's `relatorio_id`, and an equipment row to the op's `project_id`. A company-scope row
 * (a project, a registry entry, a template, a user, a brand file) has no parent to check.
 */
export function targetRowVerdict(op: Op, entity: Entity, row: EntityRow | undefined): TargetVerdict {
  if (row === undefined) return 'refused';
  if (entity === 'equipment') return (row as { project_id?: unknown }).project_id === (op.project_id ?? null) ? 'allowed' : 'refused';
  const { relatorio_id } = rowIndexColumns(entity, row);
  return relatorio_id === null || relatorio_id === (op.relatorio_id ?? null) ? 'allowed' : 'refused';
}

/** An id of the kernel's own shape, or null: anything else is the row schema's to refuse (`op_invalid`). */
function idOf(value: unknown): string | null {
  return typeof value === 'string' && uuidV7Schema.safeParse(value).success ? value : null;
}

/**
 * Story 20.10 (review, 2026-11-03): the obra a create files its row under, which must be a project
 * of the company (`op_target_missing` otherwise; one created earlier in the same push counts): an
 * equipment create's `project_id` (its envelope's, which the row repeats) and a relatório create's
 * row `project_id`. Null for any other op, or for an id of no kernel shape (the row schema refuses it).
 */
export function createProjectOf(op: Op, path: OpPath): string | null {
  if (op.kind !== 'create') return null;
  if (path.family === 'equipment') return idOf(op.project_id);
  if (path.family === 'relatorio') return idOf((op.value as { project_id?: unknown } | null)?.project_id);
  return null;
}

/** A row a value names by id: a location or a block of the op's relatório, or an equipment of its obra. */
export interface ValueReference {
  readonly entity: 'location' | 'block' | 'equipment';
  readonly id: string;
  /** The field that names it, for the log. */
  readonly field: string;
}

/** The reference fields of a row, by entity: what a create carries and a put on that field writes. */
const REFERENCE_FIELDS: Readonly<Partial<Record<string, Readonly<Record<string, ValueReference['entity']>>>>> = {
  point: { equipment_id: 'equipment', location_id: 'location' },
  file: { block_id: 'block', location_id: 'location' },
  block: { location_id: 'location', equipment_id: 'equipment' },
};

/**
 * Story 20.10 (review, 2026-11-03): the rows a client op's value names by id, which must exist and
 * belong where the op is filed (`referenceRowVerdict`): a point's `equipment_id` and `location_id`,
 * a photo's `block_id` and `location_id`, a block's `location_id` and `equipment_id`, on their
 * creates and on the puts of those fields. A null reference names nothing and stays valid, as the
 * point relink of Story 20.4 writes it ("Geral").
 */
export function valueReferencesOf(op: Op, path: OpPath): readonly ValueReference[] {
  const create = op.kind === 'create' && (path.family === 'point' || path.family === 'file' || path.family === 'block');
  const put = op.kind === 'put' && (path.family === 'point/field' || path.family === 'file/field' || path.family === 'block/field');
  if (!create && !put) return [];
  const fields = REFERENCE_FIELDS[path.family.split('/')[0]!] ?? {};
  const out: ValueReference[] = [];
  if (create) {
    const row = op.value !== null && typeof op.value === 'object' && !Array.isArray(op.value) ? (op.value as Record<string, unknown>) : {};
    for (const [field, entity] of Object.entries(fields)) {
      const id = idOf(row[field]);
      if (id !== null) out.push({ entity, id, field });
    }
    return out;
  }
  const field = (path as { field?: string }).field ?? '';
  const entity = fields[field];
  const id = entity === undefined ? null : idOf(op.value);
  return entity === undefined || id === null ? [] : [{ entity, id, field }];
}

/**
 * Whether the row a reference names may stand there: it exists in the company (live or
 * tombstoned), and a location or a block belongs to the op's relatório, an equipment to that
 * relatório's obra (`relatorioProjectId`, the relatório row's `project_id`). Refused otherwise,
 * `op_value_invalid`, as a `responsible_user_id` that is no user of the company is.
 */
export function referenceRowVerdict(op: Op, reference: ValueReference, row: EntityRow | undefined, relatorioProjectId: string | null): TargetVerdict {
  if (row === undefined) return 'refused';
  if (reference.entity === 'equipment') {
    const projectId = (row as { project_id?: unknown }).project_id;
    return relatorioProjectId !== null && projectId === relatorioProjectId ? 'allowed' : 'refused';
  }
  return (row as { relatorio_id?: unknown }).relatorio_id === (op.relatorio_id ?? null) ? 'allowed' : 'refused';
}

/**
 * Story 20.10: the user a client op names as the relatório's responsible engineer (the
 * `relatorio/setup/responsible_user_id` put, or the setup a `relatorio/{id}` create carries), when
 * it names one by an id; the server checks that a user of the company has it (`op_value_invalid`
 * otherwise). Null when it names none, or names something that is no id (the row schema refuses
 * that one, `op_invalid`).
 */
export function responsibleUserIdOf(op: Op, path: OpPath): string | null {
  let named: unknown = null;
  if (op.kind === 'put' && path.family === 'relatorio/setup' && path.field === 'responsible_user_id') named = op.value;
  else if (op.kind === 'create' && path.family === 'relatorio') {
    const setup = (op.value as { setup?: unknown } | null)?.setup;
    named = setup !== null && typeof setup === 'object' ? (setup as { responsible_user_id?: unknown }).responsible_user_id : null;
  }
  return typeof named === 'string' && uuidV7Schema.safeParse(named).success ? named : null;
}
