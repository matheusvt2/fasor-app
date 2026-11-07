import type { Entity, EntityRow } from '../schemas/entities.ts';
import { applyOp, entityKey, SeedPathError, targetsOf, withDefinitionRows, type EntityKey, type EntityState } from './apply.ts';
import type { Op } from './op.ts';
import { byClientTsThenOpId, orderLog } from './replay.ts';

/*
 * AD-24 on the device: an entity's local row is always the server log for that
 * entity in `seq` order, then the device's own not-yet-pulled ops on top.
 * Rebase (a pending op re-applied over a pulled value), dead-op exclusion (the
 * caller leaves dead ops out of `local`), "Reenviar" and device/server
 * convergence are all this one function.
 *
 * Story 14.6 (AD-21 note of 2026-11-06, item 4): a block of a company type folds with the
 * published versions of its type, which no op of the block names. The caller passes the version
 * rows it holds as `context` (the device's Dexie version rows: immutable, and pulled with the
 * company stream before any relatório stream, AD-24), read beside the fold's own rows and never
 * returned. Every local op the fold refuses with a `SeedPathError`, whatever the rule (a publish
 * whose number another device's version already took, a block naming a version this device does
 * not hold, a sheet write outside its block's definition, a site item or a block type its seed
 * version does not offer, on a seeded block as on a company one), is left out of the row: the op
 * stays in the outbox, the server refuses it too and it goes dead. A pulled op the fold refuses
 * still throws, as before; any other error, local or pulled, throws.
 */

export interface MaterializeRef {
  entity: Entity;
  id: string;
}

const NO_CONTEXT: EntityState = new Map();

function fold(state: Map<EntityKey, EntityRow>, op: Op, context: EntityState, local: boolean): void {
  const touched = new Map<EntityKey, EntityRow>();
  for (const ref of targetsOf(op)) {
    const row = state.get(ref.key);
    if (row) touched.set(ref.key, row);
  }
  const withContext = withDefinitionRows(touched, op, context);
  let next: EntityState;
  try {
    next = applyOp(withContext, op);
  } catch (error) {
    if (local && error instanceof SeedPathError) return;
    throw error;
  }
  for (const [key, row] of next) if (row !== withContext.get(key)) state.set(key, row);
}

/**
 * `replay` of `remote` (the pulled ops that target `ref`, in `seq` order), then
 * `local` (the device's outbox ops that target `ref`, minus any already among the
 * remote ids) in commit order (`byClientTsThenOpId`, K-8). Returns the row, or `null` when the entity does not
 * exist after the fold. `context` holds the version rows a company block's fold resolves (Story 14.6).
 */
export function materializeEntity(ref: MaterializeRef, remote: readonly Op[], local: readonly Op[], context: EntityState = NO_CONTEXT): EntityRow | null {
  const remoteIds = new Set(remote.map((op) => op.op_id));
  const state = new Map<EntityKey, EntityRow>();
  for (const op of orderLog(remote)) fold(state, op, context, false);
  for (const op of [...local].filter((op) => !remoteIds.has(op.op_id)).sort(byClientTsThenOpId)) fold(state, op, context, true);
  return state.get(entityKey(ref.entity, ref.id)) ?? null;
}
