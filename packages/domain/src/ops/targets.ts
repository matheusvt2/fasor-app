import { uuidV7Schema } from '../ids.ts';
import { rowIndexColumns, type Entity, type EntityRow } from '../schemas/entities.ts';
import { valuePointerOf } from './attribution.ts';
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

/*
 * e20f (2026-11-04, integrated review of 76cbdb79): every id-valued leaf of the row and op
 * schemas, by pointer, in one table, so a new id field cannot skip the reference check (the guard
 * test walks the schemas and fails on a uuid leaf the table does not name, or an entry that is no
 * leaf). Pointers follow `ATTRIBUTED_FIELDS`: `{entity}.{key}...` inside a row of that entity (a
 * create's value, or the value of a put on that field), `op.{key}...` in the envelope and its
 * `meta`; `[]` steps into an array, `*` into a record; a sheet or site-checklist cell's ids are
 * written once, re-rooted at `cell.`.
 */

/** Where a referenced row must belong: the op's relatório, the obra of that relatório, or anywhere in the company. */
export type ReferenceScope = 'relatorio' | 'obra' | 'company';

/** The entities a value may name by id. */
export type ReferencedEntity = 'location' | 'block' | 'equipment' | 'file' | 'registry' | 'template' | 'suggestion';

export type ReferenceField =
  /** A row the value names, which must exist and belong to `scope` (a registry row of `kind`). */
  | { readonly pointer: string; readonly reference: { readonly entity: ReferencedEntity; readonly kind?: string; readonly scope: ReferenceScope } }
  /** Not a reference this check reads, with the one-line reason. */
  | { readonly pointer: string; readonly exempt: string };

const OWN_ID = 'the row\'s own id, which the path names (createRow refuses a value naming another)';
const SERVER_ONLY_ID = 'server-only family: a client op never writes it (the push route refuses it before this check)';
const FOLD_OP_ID = 'an op id the fold compares with the log (a stale or forged one only loses a comparison), never a row';
const ENVELOPE = 'a create row\'s parent id: opSchema refuses one that is not the op envelope\'s (op_invalid), and the target check reads the envelope';
const PROVENANCE = 'AD-25 provenance: readers look it up among the relatório\'s own rows and drop an id they do not find';

/** Every uuid leaf of `entityRowSchemas` and `opSchema`, each a reference or exempt with its reason. */
export const REFERENCE_FIELDS: readonly ReferenceField[] = [
  // The op envelope and its meta.
  { pointer: 'op.op_id', exempt: 'the op\'s own id (the log\'s idempotency key)' },
  { pointer: 'op.company_id', exempt: 'envelope: the push route refuses any company but the session\'s (op_tenant_mismatch)' },
  { pointer: 'op.project_id', exempt: 'envelope: the target check (targetRowVerdict, createProjectOf) reads it' },
  { pointer: 'op.relatorio_id', exempt: 'envelope: the target check (targetLookupOf, targetRowVerdict) reads it' },
  { pointer: 'op.prev_op_id', exempt: FOLD_OP_ID },
  { pointer: 'op.batch_id', exempt: 'a grouping id the device mints for one commit; it names no row' },
  { pointer: 'op.meta.source_suggestion_id', reference: { entity: 'suggestion', scope: 'relatorio' } },
  { pointer: 'op.meta.standing_op_id', exempt: FOLD_OP_ID },
  { pointer: 'op.meta.seen_conflict_op_id', exempt: FOLD_OP_ID },
  { pointer: 'op.meta.restore.conflict.op_id', exempt: FOLD_OP_ID },
  { pointer: 'op.meta.restore.conflict.source_suggestion_id', exempt: PROVENANCE },
  { pointer: 'op.meta.restore.merge.head_op_id', exempt: FOLD_OP_ID },
  { pointer: 'op.meta.restore.shown_op_id', exempt: FOLD_OP_ID },

  // A sheet or site-checklist cell, wherever it sits.
  { pointer: 'cell.op_id', exempt: FOLD_OP_ID },
  { pointer: 'cell.source_suggestion_id', exempt: PROVENANCE },
  { pointer: 'cell.merge.head_op_id', exempt: FOLD_OP_ID },
  { pointer: 'cell.conflict.op_id', exempt: FOLD_OP_ID },
  { pointer: 'cell.conflict.source_suggestion_id', exempt: PROVENANCE },
  { pointer: 'cell.shown_op_id', exempt: FOLD_OP_ID },

  // Company scope.
  { pointer: 'project.id', exempt: OWN_ID },
  { pointer: 'project.client_id', reference: { entity: 'registry', kind: 'client', scope: 'company' } },
  { pointer: 'registry.id', exempt: OWN_ID },
  { pointer: 'registry.logo_file_id', reference: { entity: 'file', scope: 'company' } },
  { pointer: 'registry.watermark_file_id', reference: { entity: 'file', scope: 'company' } },
  { pointer: 'registry.cover_background_file_id', reference: { entity: 'file', scope: 'company' } },
  { pointer: 'registry.certificate_file_id', reference: { entity: 'file', scope: 'company' } },
  { pointer: 'registry.sites[].id', exempt: 'a client site\'s own sub-id inside its registry row' },
  { pointer: 'template.id', exempt: OWN_ID },
  { pointer: 'user.id', exempt: OWN_ID },

  // Project scope.
  { pointer: 'equipment.id', exempt: OWN_ID },
  { pointer: 'equipment.project_id', exempt: ENVELOPE },
  { pointer: 'equipment.last_nameplate.relatorio_id', exempt: 'AD-25 provenance of an earlier visit\'s plate, written by the server-only last_nameplate put' },

  // Relatório scope.
  { pointer: 'relatorio.id', exempt: OWN_ID },
  { pointer: 'relatorio.project_id', exempt: 'the obra a relatório create files under, checked by createProjectOf (op_target_missing)' },
  { pointer: 'relatorio.template_id', exempt: 'provenance: the relatório copies its template at create (AR-20); every reader looks it up among the company\'s templates and drops an id it does not find' },
  { pointer: 'relatorio.setup.responsible_user_id', exempt: 'checked by responsibleUserIdOf against the company\'s users (op_value_invalid, 20.10 AC)' },
  { pointer: 'relatorio.setup.cover_photo_file_id', reference: { entity: 'file', scope: 'relatorio' } },
  { pointer: 'relatorio.setup.instrument_ids[]', reference: { entity: 'registry', kind: 'instrument', scope: 'company' } },
  { pointer: 'relatorio.preview_file_id', exempt: 'server-only family: the preview job writes it (relatorio/preview_file_id); the web creates it null' },
  { pointer: 'location.id', exempt: OWN_ID },
  { pointer: 'location.relatorio_id', exempt: ENVELOPE },
  { pointer: 'location.parent_id', reference: { entity: 'location', scope: 'relatorio' } },
  { pointer: 'block.id', exempt: OWN_ID },
  { pointer: 'block.relatorio_id', exempt: ENVELOPE },
  { pointer: 'block.location_id', reference: { entity: 'location', scope: 'relatorio' } },
  { pointer: 'block.equipment_id', reference: { entity: 'equipment', scope: 'obra' } },
  { pointer: 'block.feeds_block_id', reference: { entity: 'block', scope: 'relatorio' } },
  { pointer: 'file.id', exempt: OWN_ID },
  { pointer: 'file.company_id', exempt: ENVELOPE },
  { pointer: 'file.relatorio_id', exempt: ENVELOPE },
  { pointer: 'file.block_id', reference: { entity: 'block', scope: 'relatorio' } },
  { pointer: 'file.location_id', reference: { entity: 'location', scope: 'relatorio' } },
  { pointer: 'point.id', exempt: OWN_ID },
  { pointer: 'point.relatorio_id', exempt: ENVELOPE },
  { pointer: 'point.equipment_id', reference: { entity: 'equipment', scope: 'obra' } },
  { pointer: 'point.location_id', reference: { entity: 'location', scope: 'relatorio' } },

  // Server-only rows.
  { pointer: 'suggestion.id', exempt: SERVER_ONLY_ID },
  { pointer: 'suggestion.relatorio_id', exempt: SERVER_ONLY_ID },
  { pointer: 'suggestion.source.photo_id', exempt: SERVER_ONLY_ID },
  { pointer: 'suggestion.source.reading_run_id', exempt: SERVER_ONLY_ID },
  { pointer: 'generation_job.id', exempt: SERVER_ONLY_ID },
  { pointer: 'generation_job.relatorio_id', exempt: SERVER_ONLY_ID },
  { pointer: 'generation_job.result_file_id', exempt: SERVER_ONLY_ID },
  { pointer: 'revision.id', exempt: SERVER_ONLY_ID },
  { pointer: 'revision.relatorio_id', exempt: SERVER_ONLY_ID },
  { pointer: 'revision.docx_file_id', exempt: SERVER_ONLY_ID },
  { pointer: 'revision.pdf_file_id', exempt: SERVER_ONLY_ID },
  { pointer: 'audit_run.id', exempt: SERVER_ONLY_ID },
  { pointer: 'audit_run.relatorio_id', exempt: SERVER_ONLY_ID },
  { pointer: 'audit_run.findings[].target.blockId', exempt: SERVER_ONLY_ID },
];

/** A row a value names by id, with where it must belong. */
export interface ValueReference {
  readonly entity: ReferencedEntity;
  readonly id: string;
  /** For a registry row: the kind it must be. */
  readonly kind?: string;
  readonly scope: ReferenceScope;
  /** The table pointer that names it, for the log. */
  readonly field: string;
}

/** The ids at `keys` under `value`, stepping into every item at a `[]` key; anything not an id of the kernel's shape is skipped. */
function idsAt(value: unknown, keys: readonly string[]): string[] {
  if (keys.length === 0) {
    const id = idOf(value);
    return id === null ? [] : [id];
  }
  const [key, ...rest] = keys as [string, ...string[]];
  if (value === null || typeof value !== 'object') return [];
  if (key.endsWith('[]')) {
    const items = (value as Record<string, unknown>)[key.slice(0, -2)];
    return Array.isArray(items) ? items.flatMap((item) => idsAt(item, rest)) : [];
  }
  if (Array.isArray(value)) return [];
  return idsAt((value as Record<string, unknown>)[key], rest);
}

/**
 * The keys that reach `pointer` from the value of an op whose value sits at `base`
 * (`valuePointerOf`), or null when the pointer is not under it. `relatorio.setup.instrument_ids[]`
 * under the base `relatorio.setup.instrument_ids` is the array itself (`['[]']`).
 */
function keysUnder(pointer: string, base: string): string[] | null {
  if (pointer === base) return [];
  if (pointer === `${base}[]`) return ['[]'];
  if (!pointer.startsWith(`${base}.`)) return null;
  return pointer.slice(base.length + 1).split('.');
}

/** `idsAt` for a key list that may start with a bare `[]` (the value is the array). */
function idsUnder(value: unknown, keys: readonly string[]): string[] {
  if (keys[0] === '[]') return Array.isArray(value) ? value.flatMap((item) => idsAt(item, keys.slice(1))) : [];
  return idsAt(value, keys);
}

/**
 * Story 20.10, widened by e20f (2026-11-04): the rows a client op names by id, read from
 * `REFERENCE_FIELDS`, which must exist and belong where the op is filed (`referenceRowVerdict`):
 * every reference leaf of a create's row, of the value of a put on a reference field (or on a
 * field holding one: `relatorio/setup/instrument_ids`, `location/{id}/parent_id`, ...), and the
 * envelope's `meta.source_suggestion_id`. A null reference names nothing and stays valid, as the
 * point relink of Story 20.4 writes it ("Geral"). A remove carries no value.
 */
export function valueReferencesOf(op: Op, path: OpPath): readonly ValueReference[] {
  const base = op.kind === 'remove' ? null : valuePointerOf(path);
  const out: ValueReference[] = [];
  for (const field of REFERENCE_FIELDS) {
    if (!('reference' in field)) continue;
    const { entity, scope } = field.reference;
    const kind = field.reference.kind;
    let ids: string[];
    if (field.pointer.startsWith('op.')) ids = idsAt(op, field.pointer.slice('op.'.length).split('.'));
    else {
      const keys = base === null ? null : keysUnder(field.pointer, base);
      ids = keys === null ? [] : idsUnder(op.value, keys);
    }
    for (const id of ids) out.push({ entity, id, scope, field: field.pointer, ...(kind === undefined ? {} : { kind }) });
  }
  return out;
}

/**
 * Whether the row a reference names may stand there: it exists in the company (live or
 * tombstoned), a registry row is of the kind the field names, and it belongs to the reference's
 * scope: `relatorio`, the op's relatório (a file filed company-wide, `relatorio_id` null, as the
 * web files a cover photo, belongs to every relatório of the company); `obra`, an equipment of
 * that relatório's obra (`relatorioProjectId`, the relatório row's `project_id`); `company`, any.
 * Refused otherwise, `op_target_missing`.
 */
export function referenceRowVerdict(op: Op, reference: ValueReference, row: EntityRow | undefined, relatorioProjectId: string | null): TargetVerdict {
  if (row === undefined) return 'refused';
  if (reference.kind !== undefined && (row as { kind?: unknown }).kind !== reference.kind) return 'refused';
  switch (reference.scope) {
    case 'company':
      return 'allowed';
    case 'obra': {
      const projectId = (row as { project_id?: unknown }).project_id;
      return relatorioProjectId !== null && projectId === relatorioProjectId ? 'allowed' : 'refused';
    }
    case 'relatorio': {
      const relatorioId = (row as { relatorio_id?: unknown }).relatorio_id ?? null;
      if (reference.entity === 'file' && relatorioId === null) return 'allowed';
      return relatorioId === (op.relatorio_id ?? null) ? 'allowed' : 'refused';
    }
  }
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
