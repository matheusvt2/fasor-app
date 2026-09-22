import type { Entity, EntityRow } from '../schemas/entities.ts';
import { applyOp, entityKey, targetsOf, type EntityKey, type EntityState } from './apply.ts';
import type { Op } from './op.ts';
import { orderLog } from './replay.ts';

/*
 * AD-24 on the device: an entity's local row is always the server log for that
 * entity in `seq` order, then the device's own not-yet-pulled ops on top.
 * Rebase (a pending op re-applied over a pulled value), dead-op exclusion (the
 * caller leaves dead ops out of `local`), "Reenviar" and device/server
 * convergence are all this one function.
 */

export interface MaterializeRef {
  entity: Entity;
  id: string;
}

function fold(state: Map<EntityKey, EntityRow>, op: Op): void {
  const touched = new Map<EntityKey, EntityRow>();
  for (const ref of targetsOf(op)) {
    const row = state.get(ref.key);
    if (row) touched.set(ref.key, row);
  }
  const next: EntityState = applyOp(touched, op);
  for (const [key, row] of next) if (row !== touched.get(key)) state.set(key, row);
}

const byOpId = (a: Op, b: Op) => (a.op_id < b.op_id ? -1 : a.op_id > b.op_id ? 1 : 0);

/**
 * `replay` of `remote` (the pulled ops that target `ref`, in `seq` order), then
 * `local` (the device's outbox ops that target `ref`, minus any already among the
 * remote ids) in `op_id` order. Returns the row, or `null` when the entity does not
 * exist after the fold.
 */
export function materializeEntity(ref: MaterializeRef, remote: readonly Op[], local: readonly Op[]): EntityRow | null {
  const remoteIds = new Set(remote.map((op) => op.op_id));
  const state = new Map<EntityKey, EntityRow>();
  for (const op of orderLog(remote)) fold(state, op);
  for (const op of [...local].filter((op) => !remoteIds.has(op.op_id)).sort(byOpId)) fold(state, op);
  return state.get(entityKey(ref.entity, ref.id)) ?? null;
}
