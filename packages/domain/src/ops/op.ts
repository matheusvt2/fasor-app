import { z } from 'zod';
import { isoTimestampSchema, toIso } from '../clock.ts';
import { actorIdSchema, deviceIdSchema, uuidV7Schema, type NewId } from '../ids.ts';
import {
  blockRemovalConflictSchema,
  cellConflictSchema,
  ENTITY_SCOPE,
  entityRowSchemas,
  jsonValueSchema,
  scopeSchema,
} from '../schemas/entities.ts';
import { familyDef, isCreateFamily, pathField, PathError, parsePath, targetOf } from './path.ts';

/*
 * AD-3: the unit of change. Shape, families and kind rules are the spine's;
 * `seq` is set only by the server. `prev_op_id` is the last op the device had applied on
 * the path: the server compares it for `superseded` (AD-24), and since Story 10.1
 * (contract 10) the fold reads it for a `sheet/*` put, where it differing from the cell's
 * head op makes the put concurrent and merged by rule (`merge/policy.ts`).
 */

export const opKindSchema = z.enum(['create', 'put', 'remove']);
export type OpKind = z.infer<typeof opKindSchema>;

/**
 * AD-12: `source_suggestion_id` marks a confirm; `auto` marks a device auto-confirm.
 * Stories 10.2/10.3 (contract 12): what the writing device saw, stamped at commit
 * (`apps/web/src/db/commit.ts`) and read by the fold (`merge/policy.ts`, `ops/apply.ts`):
 * - `standing_op_id`: on a `sheet/*` put, the `op_id` of the cell the device's row held
 *   (null when the slot was empty). The fold treats the put as concurrent when it is not
 *   the cell's current `op_id`, even when `prev_op_id` is the path's head.
 * - `seen_conflict_op_id`: on the same put, the `op_id` of that cell's `conflict` (null
 *   when none). A sequential put clears a `conflict` only when it saw that one ("Aplicar");
 *   a device that rewrites its cell before pulling the mark keeps it.
 * - `seen_modified_at`: on a `block/{id}/removed_at` write, the block's `last_modified_at`
 *   as the device held it (null when never edited). A removal that did not see the latest
 *   edit marks the block with a removal conflict.
 * An op without the key (fixtures, server ops, older bundles) folds as before.
 *
 * E10-Q2 (contract 13): `restore`, set only on the undo inverse of an op that cleared a
 * conflict mark (`invertBatch`, from `clearedMarks`), carries the marks back:
 * - on a `sheet/*` put, `{conflict, shown_op_id}`: the cell's `conflict` and the op whose
 *   value it showed (the "Desfazer" of "Aplicar");
 * - on a `block/{id}/removed_at` write, `{removed_by, removal_conflict}` (the "Desfazer" of
 *   "Manter" or "Remover").
 * The fold writes them back only when the inverse lands sequentially; a concurrent one
 * folds as any other write.
 */
export const cellRestoreSchema = z.object({
  conflict: cellConflictSchema,
  shown_op_id: uuidV7Schema.nullable(),
});
export type CellRestore = z.infer<typeof cellRestoreSchema>;

export const blockRestoreSchema = z.object({
  removed_by: actorIdSchema.nullable(),
  removal_conflict: blockRemovalConflictSchema,
});
export type BlockRestore = z.infer<typeof blockRestoreSchema>;

export const restoreMarksSchema = z.union([cellRestoreSchema, blockRestoreSchema]);
export type RestoreMarks = z.infer<typeof restoreMarksSchema>;

/**
 * K-10 (full review 2026-09-30): meta keys are open on purpose. An op keeps every key its
 * emitter stamped and the server stores it as it came; the kernel reads only the keys below.
 * An unknown key is a reason not to coalesce (`ops/outbox.ts`): merging could drop it.
 */
export const opMetaSchema = z.looseObject({
  source_suggestion_id: uuidV7Schema.optional(),
  auto: z.boolean().optional(),
  standing_op_id: uuidV7Schema.nullable().optional(),
  seen_conflict_op_id: uuidV7Schema.nullable().optional(),
  seen_modified_at: isoTimestampSchema.nullable().optional(),
  restore: restoreMarksSchema.optional(),
});
export type OpMeta = z.infer<typeof opMetaSchema>;

const opShape = z.object({
  op_id: uuidV7Schema,
  kind: opKindSchema,
  scope: scopeSchema,
  company_id: uuidV7Schema,
  project_id: uuidV7Schema.nullish(),
  relatorio_id: uuidV7Schema.nullish(),
  path: z.string().min(1),
  // Postgres jsonb refuses U+0000 inside strings; refusing it here keeps device and server in step.
  value: jsonValueSchema.refine((v) => !JSON.stringify(v).includes('\\u0000'), 'value must not contain U+0000'),
  prev_op_id: uuidV7Schema.nullish(),
  batch_id: uuidV7Schema.nullish(),
  meta: opMetaSchema.nullish(),
  actor_id: actorIdSchema,
  device_id: deviceIdSchema,
  client_ts: isoTimestampSchema,
  seq: z.number().int().nonnegative().optional(),
});

export const opSchema = opShape.superRefine((op, ctx) => {
  if (op.scope === 'project' && !op.project_id) {
    ctx.addIssue({ code: 'custom', path: ['project_id'], message: 'required when scope = project' });
  }
  if (op.scope === 'relatorio' && !op.relatorio_id) {
    ctx.addIssue({ code: 'custom', path: ['relatorio_id'], message: 'required when scope = relatorio' });
  }
  let path;
  try {
    path = parsePath(op.path);
  } catch (error) {
    ctx.addIssue({ code: 'custom', path: ['path'], message: (error as PathError).message });
    return;
  }
  const def = familyDef(path.family);
  if (!ENTITY_SCOPE[def.entity].includes(op.scope)) {
    ctx.addIssue({ code: 'custom', path: ['scope'], message: `${def.entity} rows are not ${op.scope} scope` });
  }
  if (def.implicitRelatorio && !op.relatorio_id) {
    ctx.addIssue({ code: 'custom', path: ['relatorio_id'], message: `required for ${path.family}` });
  }
  if (isCreateFamily(path)) {
    if (op.kind !== 'create') {
      ctx.addIssue({ code: 'custom', path: ['kind'], message: `${path.family} accepts only create` });
      return;
    }
    const parsed = entityRowSchemas[def.entity].safeParse(op.value);
    if (!parsed.success) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: `not a ${def.entity} row: ${parsed.error.message}` });
      return;
    }
    const { id } = targetOf(path);
    if (parsed.data.id !== id) {
      ctx.addIssue({ code: 'custom', path: ['value', 'id'], message: 'must equal the path id' });
    }
    if (path.family === 'registry' && (parsed.data as { kind: string }).kind !== path.kind) {
      ctx.addIssue({ code: 'custom', path: ['value', 'kind'], message: 'must equal the path kind' });
    }
    // The row is indexed by its own ids; they must be the envelope's, or the row lands in another stream.
    const row = parsed.data as { relatorio_id?: string | null; project_id?: string | null; company_id?: string };
    const envelope = { relatorio_id: op.relatorio_id, project_id: op.project_id, company_id: op.company_id };
    for (const key of ['relatorio_id', 'project_id', 'company_id'] as const) {
      if (!(key in row)) continue;
      // A relatorio row names its owner project; the relatorio-scope envelope may leave project_id unset.
      if (path.family === 'relatorio' && key === 'project_id' && envelope.project_id == null) continue;
      if ((row[key] ?? null) !== (envelope[key] ?? null)) {
        ctx.addIssue({ code: 'custom', path: ['value', key], message: `must equal the op ${key}` });
      }
    }
    return;
  }
  if (op.kind === 'create') {
    ctx.addIssue({ code: 'custom', path: ['kind'], message: `${path.family} does not accept create` });
  }
  if (op.kind === 'remove' && pathField(path) !== 'removed_at') {
    ctx.addIssue({ code: 'custom', path: ['kind'], message: 'remove is valid only on a removed_at path' });
  }
});

export type Op = z.infer<typeof opSchema>;

export type OpInput = Omit<Op, 'op_id' | 'client_ts' | 'seq'>;

/** An op input before the device commits it: the device stamps its own `device_id` (AD-3). */
export type OpDraft = Omit<OpInput, 'device_id'>;

/** Builds and validates an op; the id and the timestamp come from the caller (TC-1, TC-2). */
export function makeOp(input: OpInput, deps: { newId: NewId; now: Date }): Op {
  return opSchema.parse({ ...input, op_id: deps.newId(), client_ts: toIso(deps.now) });
}
