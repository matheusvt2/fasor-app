import { entityKey, targetsOf } from '../ops/apply.ts';
import type { Op } from '../ops/op.ts';
import { parsePath } from '../ops/path.ts';
import { valueReferencesOf } from '../ops/targets.ts';

/*
 * E20-A1 (R-2, 2026-11-04): which dead outbox rows "Reenviar" stamps again before it resends
 * them, and in what order. A row refused `op_attribution` was stamped by a wrong clock: sent with
 * the same stamp it is refused again, so it is stamped again (`restampOp`). A row refused
 * `op_target_missing` is stamped again only when it depends on a create stamped again in the same
 * run (one of its targets, or a row its value names, is that create's own row): on a slow clock
 * the create is refused first and leaves its dependents dead, and with their old stamps they
 * would sort before it. Any other target-missing row keeps its stamps: its target is really
 * missing, and stamping it at now would let an old edit win last-writer-wins over newer ones.
 */

/** A dead outbox row as "Reenviar" reads it: the op and the code the server refused it with. */
export interface DeadRow {
  readonly op: Op;
  readonly code: string | null;
}

/** The entity key of the row a create op makes (its first target), or null for any other op. */
function createdKey(op: Op): string | null {
  if (op.kind !== 'create') return null;
  try {
    return targetsOf(op)[0]?.key ?? null;
  } catch {
    return null;
  }
}

/** The entity keys an op depends on: its targets and the rows its value names. */
function dependencyKeys(op: Op): string[] {
  try {
    const path = parsePath(op.path);
    return [...targetsOf(op).map((ref) => ref.key), ...valueReferencesOf(op, path).map((reference) => entityKey(reference.entity, reference.id))];
  } catch {
    return [];
  }
}

/**
 * The ops "Reenviar" stamps again, in the order it stamps them: every `op_attribution` row, and
 * every `op_target_missing` row that depends on a create stamped again in this run (followed
 * transitively: a dependent create brings its own dependents), sorted by `op_id`, never by their
 * old `client_ts`, which a clock moved back between a create and its dependent puts out of order.
 * `op_id` is a UUIDv7 minted on the device's raw clock,
 * so it is commit order only within one page session: after a reload under a clock set back, a
 * dependent may sort before its create (an accepted limitation, E20-A1 review loop 1).
 */
export function resendRestampOrder(dead: readonly DeadRow[]): Op[] {
  const chosen = new Map<string, Op>();
  const created = new Set<string>();
  const choose = (op: Op) => {
    chosen.set(op.op_id, op);
    const key = createdKey(op);
    if (key !== null) created.add(key);
  };
  for (const row of dead) if (row.code === 'op_attribution') choose(row.op);
  const missing = dead.filter((row) => row.code === 'op_target_missing').map((row) => ({ op: row.op, keys: dependencyKeys(row.op) }));
  for (let grew = true; grew; ) {
    grew = false;
    for (const { op, keys } of missing) {
      if (chosen.has(op.op_id) || !keys.some((key) => created.has(key))) continue;
      choose(op);
      grew = true;
    }
  }
  return [...chosen.values()].sort((a, b) => (a.op_id < b.op_id ? -1 : a.op_id > b.op_id ? 1 : 0));
}
