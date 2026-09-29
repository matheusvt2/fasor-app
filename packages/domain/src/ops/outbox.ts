import { toIso } from '../clock.ts';
import type { NewId } from '../ids.ts';
import { opSchema, type Op } from './op.ts';
import { familyDef, parsePath, safeParsePath } from './path.ts';

/*
 * AD-3 outbox rules. The kernel decides; the Dexie layer stores.
 */

/** Stories 10.2/10.3: the keys a device stamps on every op it commits (`merge/stamp.ts`); they alone never block coalescing. */
const SEEN_STAMP_KEYS: ReadonlySet<string> = new Set(['standing_op_id', 'seen_modified_at']);

/** No `meta`, or one holding only the device's commit stamps. */
function plainMeta(meta: Op['meta']): boolean {
  return meta == null || Object.keys(meta).every((key) => SEEN_STAMP_KEYS.has(key));
}

/**
 * Coalescing rule: two consecutive pending `put` ops on one path from the same
 * device merge only when neither carries `meta` (beyond the commit stamps) or
 * `batch_id`. The merged op keeps the last `op_id`, `value` and `client_ts` and
 * the first `prev_op_id` and stamps (what the device saw before the run).
 * Returns null when the pair must stay two rows.
 */
export function coalesce(prev: Op, next: Op): Op | null {
  if (prev.kind !== 'put' || next.kind !== 'put') return null;
  if (prev.path !== next.path) return null;
  if (prev.device_id !== next.device_id || prev.actor_id !== next.actor_id) return null;
  if (prev.company_id !== next.company_id || prev.scope !== next.scope) return null;
  if ((prev.relatorio_id ?? null) !== (next.relatorio_id ?? null)) return null;
  if ((prev.project_id ?? null) !== (next.project_id ?? null)) return null;
  if (!plainMeta(prev.meta) || !plainMeta(next.meta)) return null;
  if (prev.batch_id != null || next.batch_id != null) return null;
  return { ...next, prev_op_id: prev.prev_op_id ?? null, meta: prev.meta ?? null };
}

export interface InvertDeps {
  newId: NewId;
  now: Date;
  /** Defaults to each original op's actor and device. */
  actor_id?: string;
  device_id?: string;
}

/**
 * Undo of a batch: N inverse ops in a new batch, in reverse order. `before`
 * maps each original `op_id` to the value its path held before it applied
 * (`readPath`); a create is undone by a remove, a put or remove by a put of the
 * previous value. Ops with no inverse family (`relatorio/{id}`) are skipped.
 */
export function invertBatch(ops: readonly Op[], before: ReadonlyMap<string, unknown>, deps: InvertDeps): Op[] {
  const batch_id = deps.newId();
  const client_ts = toIso(deps.now);
  const inverses: Op[] = [];
  const retargets = ops.some((op) => op.kind === 'put' && isReadingPut(op.path, 'reading_kind'));
  for (const op of [...ops].reverse()) {
    const base = {
      scope: op.scope,
      company_id: op.company_id,
      project_id: op.project_id ?? null,
      relatorio_id: op.relatorio_id ?? null,
      prev_op_id: op.op_id,
      batch_id,
      meta: null,
      actor_id: deps.actor_id ?? op.actor_id,
      device_id: deps.device_id ?? op.device_id,
      client_ts,
    };
    if (op.kind === 'create') {
      const path = `${op.path}/removed_at`;
      const parsed = safeParsePath(path);
      if (!parsed || familyDef(parsed.family).create) continue;
      inverses.push(opSchema.parse({ ...base, op_id: deps.newId(), kind: 'remove', path, value: null }));
      continue;
    }
    parsePath(op.path);
    const value = op.kind === 'put' ? readingInverse(op.path, retargets) : undefined;
    const previous = value === undefined ? before.get(op.op_id) : value;
    inverses.push(
      opSchema.parse({ ...base, op_id: deps.newId(), kind: 'put', path: op.path, value: previous === undefined ? null : previous }),
    );
  }
  return inverses;
}

/** Whether `path` is the `file/{id}/{field}` put of a photo's reading. */
function isReadingPut(path: string, field: 'reading_kind' | 'reading_target'): boolean {
  const parsed = parsePath(path);
  return parsed.family === 'file/field' && parsed.field === field;
}

/**
 * E9-Q3 (contract 9): the inverse a reading re-target gets instead of the previous value, or
 * undefined. An undo never re-queues a provider reading nor leaves a suggestion nobody can
 * resolve: the inverse of a `reading_kind` put is null (the photo becomes a plain one,
 * `reading_status: none`, `applyOp`), of a `reading_target` put null, and a suggestion status
 * put in a batch that also re-targets a photo (the Story 9.2 create's panel suggestion) is
 * undone to `discarded`, never back to `pending`.
 */
function readingInverse(path: string, retargets: boolean): unknown {
  if (isReadingPut(path, 'reading_kind') || isReadingPut(path, 'reading_target')) return null;
  if (retargets && parsePath(path).family === 'suggestion/status') return 'discarded';
  return undefined;
}
