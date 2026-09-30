import { applyOp, targetsOf, type EntityKey, type EntityState } from './apply.ts';
import type { Op } from './op.ts';
import type { EntityRow } from '../schemas/entities.ts';

export interface ReplayOptions {
  /** Ops rejected by the server (`outbox.status = dead`, AD-24): excluded from state. */
  deadOpIds?: Iterable<string>;
}

/**
 * A device's commit order of its own ops (K-8): `client_ts`, then `op_id` for a tie. The one
 * comparator for unsequenced local ops, on the device (`apps/web/src/db`) and in the kernel
 * (`materializeEntity`): a second tab can mint a smaller `op_id` for a later put, so the id
 * alone is not the commit order.
 */
export const byClientTsThenOpId = (a: { client_ts: string; op_id: string }, b: { client_ts: string; op_id: string }): number =>
  a.client_ts < b.client_ts ? -1 : a.client_ts > b.client_ts ? 1 : a.op_id < b.op_id ? -1 : a.op_id > b.op_id ? 1 : 0;

/** Ops in `seq` order; ops without `seq` come after every sequenced op, in array order (stable). */
export function orderLog(log: readonly Op[]): Op[] {
  return log
    .map((op, index) => ({ op, index }))
    .sort((a, b) => {
      const sa = a.op.seq ?? Number.POSITIVE_INFINITY;
      const sb = b.op.seq ?? Number.POSITIVE_INFINITY;
      return sa === sb ? a.index - b.index : sa - sb;
    })
    .map((x) => x.op);
}

/**
 * The reference materializer: folds `applyOp` over a log in `seq` order. The
 * Dexie and Drizzle layers must produce the same state from the same log.
 */
export function replay(log: readonly Op[], options: ReplayOptions = {}): EntityState {
  const dead = new Set(options.deadOpIds ?? []);
  const state = new Map<EntityKey, EntityRow>();
  for (const op of orderLog(log)) {
    if (dead.has(op.op_id)) continue;
    const touched = new Map<EntityKey, EntityRow>();
    for (const ref of targetsOf(op)) {
      const row = state.get(ref.key);
      if (row) touched.set(ref.key, row);
    }
    const next = applyOp(touched, op);
    for (const [key, row] of next) if (row !== touched.get(key)) state.set(key, row);
  }
  return state;
}
