import { entityKey, targetsOf } from '../ops/apply.ts';
import type { Op } from '../ops/op.ts';
import { parsePath, safeParsePath } from '../ops/path.ts';
import { valueReferencesOf } from '../ops/targets.ts';
import type { EquipmentTypeRow, JsonValue } from '../schemas/entities.ts';
import { companyTypeDefinitionSchema } from '../types/definition.ts';

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

/**
 * e22h S2: what "Reenviar" renumbers before it resends. Two devices publishing a company type at
 * once, the server takes one number from the device that pushed first and refuses the other's
 * version create (`latest_version + 1`, `op_invalid`), and with it every block create naming that
 * version row (`type_version_id`): the block never binds to the other device's definition. Here,
 * given the dead rows in commit order and the device's current type rows (the refused create no
 * longer folded in, the other device's version pulled), each dead `equipment_type_version/{id}`
 * create whose `version` is not the next free number of its type is moved to it (consecutive for
 * several of one type, in commit order), and every dead block create or `block/{id}/config` put
 * naming that row's id follows it to the new number. A create whose definition the strict schema
 * refuses keeps its number and takes none (it is refused again for its definition), and so does
 * one of a type the device does not hold or that is removed. Returns the ops it rewrote, each with
 * its new value (same `op_id`, same stamps), in the order of `dead`; none when nothing moves.
 */
export function resendRenumberedVersions(dead: readonly Op[], types: Iterable<Pick<EquipmentTypeRow, 'id' | 'latest_version' | 'removed_at'>>): Op[] {
  const typeRows = new Map<string, Pick<EquipmentTypeRow, 'id' | 'latest_version' | 'removed_at'>>();
  for (const row of types) typeRows.set(row.id, row);
  const next = new Map<string, number>();
  const renumbered = new Map<string, number>();
  const rewritten = new Map<string, Op>();
  for (const op of dead) {
    const path = safeParsePath(op.path);
    if (path === null || path.family !== 'equipment_type_version' || op.kind !== 'create') continue;
    const value = record(op.value);
    if (value === null || typeof value.type_id !== 'string' || typeof value.version !== 'number') continue;
    const type = typeRows.get(value.type_id);
    if (type === undefined || type.removed_at !== null) continue;
    if (!companyTypeDefinitionSchema.safeParse(value.definition).success) continue;
    const free = next.get(type.id) ?? type.latest_version + 1;
    next.set(type.id, free + 1);
    if (value.version === free) continue;
    renumbered.set(path.id, free);
    rewritten.set(op.op_id, { ...op, value: { ...value, version: free } as JsonValue });
  }
  if (renumbered.size === 0) return [];
  for (const op of dead) {
    const path = safeParsePath(op.path);
    if (path === null) continue;
    if (path.family === 'block' && op.kind === 'create') {
      const value = record(op.value);
      const config = value === null ? null : record(value.config);
      const moved = config === null ? undefined : renumberedOf(config, renumbered);
      if (value !== null && config !== null && moved !== undefined) rewritten.set(op.op_id, { ...op, value: { ...value, config: { ...config, type_version: moved } } as JsonValue });
    } else if (path.family === 'block/field' && path.field === 'config' && op.kind === 'put') {
      const config = record(op.value);
      const moved = config === null ? undefined : renumberedOf(config, renumbered);
      if (config !== null && moved !== undefined) rewritten.set(op.op_id, { ...op, value: { ...config, type_version: moved } as JsonValue });
    }
  }
  return dead.flatMap((op) => {
    const again = rewritten.get(op.op_id);
    return again === undefined ? [] : [again];
  });
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** The new number of the version row a company block's config names, when "Reenviar" moved that row. */
function renumberedOf(config: Record<string, unknown>, renumbered: ReadonlyMap<string, number>): number | undefined {
  const id = config.type_version_id;
  return typeof id === 'string' ? renumbered.get(id) : undefined;
}
