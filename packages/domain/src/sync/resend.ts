import { entityKey, targetsOf } from '../ops/apply.ts';
import type { Op } from '../ops/op.ts';
import { parsePath, safeParsePath } from '../ops/path.ts';
import { valueReferencesOf } from '../ops/targets.ts';
import type { EquipmentTypeRow, EquipmentTypeVersionRow, JsonValue } from '../schemas/entities.ts';
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

/** What "Reenviar" reads of the device beside its dead rows (`resendRenumberedVersions`). */
export interface ResendDeviceState {
  /** The device's type rows (the refused creates no longer folded in, the other device's version pulled). */
  readonly types: Iterable<Pick<EquipmentTypeRow, 'id' | 'latest_version' | 'removed_at'>>;
  /** The device's live outbox ops (`pending` and `sent`), in commit order. */
  readonly live: readonly Op[];
  /** The version rows the device holds, each at the number it holds it at. */
  readonly versions: Iterable<Pick<EquipmentTypeVersionRow, 'id' | 'version'>>;
}

/**
 * e22h S2: what "Reenviar" renumbers before it resends. Two devices publishing a company type at
 * once, the server takes one number from the device that pushed first and refuses the other's
 * version create (`latest_version + 1`, `op_invalid`), and with it every block create naming that
 * version row (`type_version_id`): the block never binds to the other device's definition. Here,
 * given the dead rows in commit order and the device's state, each dead
 * `equipment_type_version/{id}` create whose `version` is not the next free number of its type is
 * moved to it (consecutive for several of one type, in commit order). The next free number is one
 * past the highest of the type's `latest_version` and this device's own live creates of the type
 * (review e22h finding 2): a live create the device's fold could not apply still takes its number
 * on the server. Data stays first: a dead create with blocks naming it is renumbered after those
 * live creates rather than dropped. A create whose definition the strict schema refuses keeps its
 * number and takes none (it is refused again for its definition), and so does one of a type the
 * device does not hold or that is removed.
 *
 * Then every block create and `block/{id}/config` put naming a version row by id, dead or live
 * (review e22h finding 1: a block create still pending or sent when its version create came back
 * dead), follows that row: to its new number when it was renumbered here, otherwise to the number
 * the device holds the row at, when that differs from the one it names (a version renumbered by
 * an earlier "Reenviar" whose block was refused later is unstuck). Returns the ops it rewrote,
 * each with its new value (same `op_id`, same stamps), the dead ones in the order of `dead` and
 * then the live ones in the order of `live`; none when nothing moves.
 */
export function resendRenumberedVersions(dead: readonly Op[], device: ResendDeviceState): Op[] {
  const typeRows = new Map<string, Pick<EquipmentTypeRow, 'id' | 'latest_version' | 'removed_at'>>();
  for (const row of device.types) typeRows.set(row.id, row);
  const next = new Map<string, number>();
  for (const op of device.live) {
    const created = versionCreateOf(op);
    if (created !== null) next.set(created.value.type_id, Math.max(next.get(created.value.type_id) ?? 0, created.value.version + 1));
  }
  const renumbered = new Map<string, number>();
  const rewritten = new Map<string, Op>();
  for (const op of dead) {
    const created = versionCreateOf(op);
    if (created === null) continue;
    const { id, value } = created;
    const type = typeRows.get(value.type_id);
    if (type === undefined || type.removed_at !== null) continue;
    if (!companyTypeDefinitionSchema.safeParse(value.definition).success) continue;
    const free = Math.max(next.get(type.id) ?? 0, type.latest_version + 1);
    next.set(type.id, free + 1);
    if (value.version === free) continue;
    renumbered.set(id, free);
    rewritten.set(op.op_id, { ...op, value: { ...value, version: free } as JsonValue });
  }
  const numbers = new Map<string, number>();
  for (const row of device.versions) numbers.set(row.id, row.version);
  for (const [id, version] of renumbered) numbers.set(id, version);
  const follow = (op: Op) => {
    const again = followedBlockOp(op, numbers);
    if (again !== null) rewritten.set(op.op_id, again);
  };
  for (const op of dead) follow(op);
  for (const op of device.live) follow(op);
  return [...dead, ...device.live].flatMap((op) => {
    const again = rewritten.get(op.op_id);
    return again === undefined ? [] : [again];
  });
}

/** An `equipment_type_version/{id}` create with its type and number, or null for any other op. */
function versionCreateOf(op: Op): { id: string; value: Record<string, unknown> & { type_id: string; version: number } } | null {
  if (op.kind !== 'create') return null;
  const path = safeParsePath(op.path);
  if (path === null || path.family !== 'equipment_type_version') return null;
  const value = record(op.value);
  if (value === null || typeof value.type_id !== 'string' || typeof value.version !== 'number') return null;
  return { id: path.id, value: value as Record<string, unknown> & { type_id: string; version: number } };
}

/**
 * A block create or `block/{id}/config` put naming a version row by id, rewritten to the number
 * `numbers` holds for that row; null when it is neither, names no row, names one `numbers` does
 * not hold, or already names its number.
 */
function followedBlockOp(op: Op, numbers: ReadonlyMap<string, number>): Op | null {
  const path = safeParsePath(op.path);
  if (path === null) return null;
  if (path.family === 'block' && op.kind === 'create') {
    const value = record(op.value);
    const config = value === null ? null : record(value.config);
    const moved = config === null ? undefined : movedNumberOf(config, numbers);
    return value !== null && config !== null && moved !== undefined ? { ...op, value: { ...value, config: { ...config, type_version: moved } } as JsonValue } : null;
  }
  if (path.family === 'block/field' && path.field === 'config' && op.kind === 'put') {
    const config = record(op.value);
    const moved = config === null ? undefined : movedNumberOf(config, numbers);
    return config !== null && moved !== undefined ? { ...op, value: { ...config, type_version: moved } as JsonValue } : null;
  }
  return null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** The number `numbers` holds for the version row a company block's config names, when it is not the one it names. */
function movedNumberOf(config: Record<string, unknown>, numbers: ReadonlyMap<string, number>): number | undefined {
  const id = config.type_version_id;
  const held = typeof id === 'string' ? numbers.get(id) : undefined;
  return held !== undefined && held !== config.type_version ? held : undefined;
}
