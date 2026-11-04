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
