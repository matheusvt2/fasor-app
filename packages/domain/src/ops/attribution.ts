import { CLOCK_SKEW_MS } from '../sync/clock-constants.ts';
import type { Op } from './op.ts';
import { familyDef, isCreateFamily, parsePath, pathField, type OpPath } from './path.ts';

/*
 * Story 20.8 (2026-11-03, contract 29, security pass S3): who and when an op says. The op's own
 * `actor_id` is the session's (the push route checks it); the ids and instants a value carries
 * are checked here, against one table, so a new attributed field cannot skip the check (the
 * guard test walks the row and op schemas and fails on a leaf the table does not name).
 *
 * - An actor leaf must equal the op's `actor_id`, or, where the table says `history`, be the
 *   actor of an earlier logged op that holds the same leaf: the "Desfazer" of a colleague's
 *   conclusion, Não ensaiado mark or block removal puts that colleague's own value back.
 * - A `bounded` instant, and every op's `client_ts`, lies at most `CLOCK_SKEW_MS` past the
 *   server's clock and, on an op that names a relatório, at most `CLOCK_SKEW_MS` before that
 *   relatório's creation (two devices' clocks). Past instants stay allowed otherwise: a tablet
 *   works offline for days. A `future` instant has the upper bound only.
 *
 * The stateless part (the upper bounds, the actor leaves) runs in the push route's validation;
 * what needs the log (a history claim, the lower bound) is returned as pending for the apply
 * transaction, which loads the rows and asks `historyClaimHolds` and `lowerBoundIssue`.
 */

// E20-A1 (R-12): defined in the leaf `sync/clock-constants.ts`, re-exported here unchanged.
export { CLOCK_SKEW_MS };

export type ActorRule = 'op' | 'history' | 'none';
export type InstantRule = 'bounded' | 'future' | 'exempt';

/**
 * Where the log may show that a colleague named by an actor leaf wrote it (`actor: 'history'`):
 * - `same_path_value`: an earlier op on the same path, by that colleague, whose value holds the
 *   same id at the same place (their own conclusion or Não ensaiado mark);
 * - `same_path_actor`: an earlier op on the same path by that colleague (their own removal of
 *   the block, which `meta.restore.removed_by` names);
 * - `same_relatorio_actor`: an earlier op of the same relatório by that colleague (their edit of
 *   the removed block, on any of its paths, which a removal conflict's `edited_by` names).
 */
export type HistoryRule = 'same_path_value' | 'same_path_actor' | 'same_relatorio_actor';

/**
 * One actor or instant leaf a client op may carry. `pointer` is where it sits: `{entity}.{key}...`
 * inside a row of that entity (a create's value, or the value of a put on that field), or
 * `op.{key}...` in the op envelope and its `meta`. Every exemption, every future-only bound and
 * every history rule says why in one line.
 */
export type AttributedField =
  | { readonly pointer: string; readonly actor: 'op' }
  | { readonly pointer: string; readonly actor: 'history'; readonly history: HistoryRule; readonly reason: string }
  | { readonly pointer: string; readonly actor: 'none'; readonly reason: string }
  | { readonly pointer: string; readonly instant: 'bounded' }
  | { readonly pointer: string; readonly instant: 'future' | 'exempt'; readonly reason: string };

const SERVER_ONLY = 'server-only family: a client op never writes it (the push route refuses it before this check)';
const DERIVED = 'derived by applyOp from the op itself; a create row\'s own value is overwritten or dropped (createRow)';

/** Every actor and instant leaf of the row and op schemas (`schemas/entities.ts`, `ops/op.ts`), each with its rule. */
export const ATTRIBUTED_FIELDS: readonly AttributedField[] = [
  // The op envelope and its meta.
  { pointer: 'op.actor_id', actor: 'op' },
  { pointer: 'op.client_ts', instant: 'bounded' },
  { pointer: 'op.meta.seen_modified_at', instant: 'exempt', reason: 'the block last_modified_at the device held, compared for equality by the fold, never printed nor ordered on' },
  { pointer: 'op.meta.restore.removed_by', actor: 'history', history: 'same_path_actor', reason: 'the undo of a removal resolution puts back who removed the block' },
  { pointer: 'op.meta.restore.removal_conflict.removed_by', actor: 'history', history: 'same_path_actor', reason: 'the undo of a removal resolution puts back who removed the block' },
  { pointer: 'op.meta.restore.removal_conflict.removed_at', instant: 'bounded' },
  { pointer: 'op.meta.restore.removal_conflict.edited_by', actor: 'history', history: 'same_relatorio_actor', reason: 'the undo of a removal resolution puts back who edited the removed block, on any of its paths' },
  { pointer: 'op.meta.restore.removal_conflict.edited_at', instant: 'bounded' },

  // Company scope.
  { pointer: 'project.removed_at', instant: 'bounded' },
  { pointer: 'registry.removed_at', instant: 'bounded' },
  { pointer: 'template.archived_at', instant: 'bounded' },
  { pointer: 'template.removed_at', instant: 'bounded' },

  // Project scope.
  { pointer: 'equipment.last_nameplate.issued_at', instant: 'future', reason: 'the issue instant of an earlier visit\'s plate (AD-25), which may predate every relatório of the obra' },
  { pointer: 'equipment.last_results.issued_at', instant: 'future', reason: 'the issue instant of an earlier visit\'s readings (AD-25, Story 22.12), which may predate every relatório of the obra' },
  { pointer: 'equipment.last_results.prior.issued_at', instant: 'future', reason: 'the issue instant of the visit before a re-issued relatório (AD-25, Story 22.12)' },
  { pointer: 'equipment.removed_at', instant: 'bounded' },

  // Relatório scope.
  { pointer: 'relatorio.removed_at', instant: 'bounded' },
  { pointer: 'location.removed_at', instant: 'bounded' },
  { pointer: 'block.not_tested.at', instant: 'bounded' },
  { pointer: 'block.not_tested.by', actor: 'history', history: 'same_path_value', reason: 'the undo of clearing a colleague\'s Não ensaiado mark puts their mark back' },
  { pointer: 'block.concluded_by.actor_id', actor: 'history', history: 'same_path_value', reason: 'the undo of reopening a colleague\'s conclusion puts their conclusion back' },
  { pointer: 'block.concluded_by.at', instant: 'bounded' },
  { pointer: 'block.created_by', actor: 'none', reason: DERIVED },
  { pointer: 'block.first_edited_at', instant: 'exempt', reason: DERIVED },
  { pointer: 'block.last_modified_by', actor: 'none', reason: DERIVED },
  { pointer: 'block.last_modified_at', instant: 'exempt', reason: DERIVED },
  { pointer: 'block.removed_at', instant: 'bounded' },
  { pointer: 'block.removed_by', actor: 'none', reason: DERIVED },
  { pointer: 'block.removal_conflict.removed_by', actor: 'none', reason: `${DERIVED}; its undo travels in op.meta.restore, checked there` },
  { pointer: 'block.removal_conflict.removed_at', instant: 'exempt', reason: `${DERIVED}; its undo travels in op.meta.restore, checked there` },
  { pointer: 'block.removal_conflict.edited_by', actor: 'none', reason: `${DERIVED}; its undo travels in op.meta.restore, checked there` },
  { pointer: 'block.removal_conflict.edited_at', instant: 'exempt', reason: `${DERIVED}; its undo travels in op.meta.restore, checked there` },
  { pointer: 'file.uploaded_at', instant: 'exempt', reason: 'server-owned (AD-7): the push route refuses a client create that sets it, and a put is file/server' },
  { pointer: 'file.removed_at', instant: 'bounded' },
  { pointer: 'file.captured_at', instant: 'future', reason: 'a photo picked from the gallery was taken before the relatório existed' },
  { pointer: 'point.removed_at', instant: 'bounded' },

  // Server-only rows.
  { pointer: 'generation_job.created_at', instant: 'exempt', reason: SERVER_ONLY },
  { pointer: 'generation_job.started_at', instant: 'exempt', reason: SERVER_ONLY },
  { pointer: 'revision.created_by', actor: 'none', reason: SERVER_ONLY },
  { pointer: 'revision.created_at', instant: 'exempt', reason: SERVER_ONLY },
  { pointer: 'audit_run.created_at', instant: 'exempt', reason: SERVER_ONLY },
  { pointer: 'audit_run.started_at', instant: 'exempt', reason: SERVER_ONLY },
  { pointer: 'audit_run.finished_at', instant: 'exempt', reason: SERVER_ONLY },
];

/**
 * Where in a row of its entity the value of an op on `path` sits: the whole row for a create,
 * the field's place for a put or remove (`relatorio/setup/{field}` is `relatorio.setup.{field}`).
 */
export function valuePointerOf(path: OpPath): string {
  const entity = familyDef(path.family).entity;
  if (isCreateFamily(path)) return entity;
  switch (path.family) {
    case 'relatorio/setup':
      return `relatorio.setup.${path.field}`;
    case 'relatorio/export/scheme':
      return 'relatorio.export.scheme';
    case 'location/se':
      return `location.se.${path.field}`;
    case 'location/env':
      return `location.env.${path.field}`;
    case 'location/checklist':
      return `location.checklist.${path.item_key}.${path.field}`;
    default:
      if (path.family.startsWith('sheet/')) return 'block.sheet';
      return `${entity}.${pathField(path) ?? ''}`;
  }
}

/** The leaf at `keys` under `value` (undefined when any step is not an object holding it). */
function leafAt(value: unknown, keys: readonly string[]): unknown {
  let at: unknown = value;
  for (const key of keys) {
    if (at === null || typeof at !== 'object' || Array.isArray(at)) return undefined;
    at = (at as Record<string, unknown>)[key];
  }
  return at;
}

/** A colleague an actor leaf names, which only the log can excuse (`historyClaimHolds`). */
export interface HistoryClaim {
  readonly actorId: string;
  readonly rule: HistoryRule;
  /** For `same_path_value`: where, in a logged op's value on the same path, the same id must sit. */
  readonly pointer: readonly string[];
  /** The table pointer, for the log line. */
  readonly field: string;
}

/** What the stateless check leaves to the apply transaction, which reads the log. */
export interface AttributionPending {
  readonly history: readonly HistoryClaim[];
  /** Every bounded instant the op carries (its `client_ts` first); the lower bound applies when the op names a relatório. */
  readonly bounded: readonly string[];
}

export type AttributionCheck = { readonly ok: false; readonly issue: string } | { readonly ok: true; readonly pending: AttributionPending };

/** The table's leaves that sit under an op of `path`, with the keys that reach each one from the op or from its value. */
function leavesOf(op: Op, path: OpPath): Array<{ field: AttributedField; leaf: unknown; keys: readonly string[] }> {
  const base = valuePointerOf(path);
  const out: Array<{ field: AttributedField; leaf: unknown; keys: readonly string[] }> = [];
  for (const field of ATTRIBUTED_FIELDS) {
    if (field.pointer.startsWith('op.')) {
      const keys = field.pointer.slice('op.'.length).split('.');
      out.push({ field, leaf: leafAt(op, keys), keys });
      continue;
    }
    if (op.kind === 'remove') continue;
    if (field.pointer !== base && !field.pointer.startsWith(`${base}.`)) continue;
    const keys = field.pointer === base ? [] : field.pointer.slice(base.length + 1).split('.');
    out.push({ field, leaf: leafAt(op.value, keys), keys });
  }
  return out;
}

/**
 * Story 20.8: the stateless half of the check of a client op. Refuses (with a reason for the
 * log) an actor leaf that names another actor where only the op's own may stand, and an instant
 * more than `CLOCK_SKEW_MS` past `now`; leaves the history claims and the bounded instants to the
 * apply transaction. Null and absent leaves are not checked (a cleared mark names no one).
 */
export function attributionIssue(op: Op, path: OpPath, now: Date): AttributionCheck {
  const latest = now.getTime() + CLOCK_SKEW_MS;
  const history: HistoryClaim[] = [];
  const bounded: string[] = [];
  for (const { field, leaf, keys } of leavesOf(op, path)) {
    if (leaf === null || leaf === undefined) continue;
    if ('actor' in field) {
      if (field.actor === 'none' || typeof leaf !== 'string' || leaf === op.actor_id) continue;
      if (field.actor === 'op') return { ok: false, issue: `${field.pointer} names ${leaf}, not the op's actor` };
      history.push({ actorId: leaf, rule: field.history, pointer: keys, field: field.pointer });
      continue;
    }
    if (field.instant === 'exempt' || typeof leaf !== 'string') continue;
    const at = Date.parse(leaf);
    if (Number.isNaN(at)) continue;
    if (at > latest) return { ok: false, issue: `${field.pointer} ${leaf} is more than ${CLOCK_SKEW_MS / 60_000} minutes past the server's clock` };
    if (field.instant === 'bounded') bounded.push(leaf);
  }
  return { ok: true, pending: { history, bounded } };
}

/** An earlier logged op, as `historyClaimHolds` reads it. */
export interface LoggedAttribution {
  readonly actor_id: string;
  readonly value: unknown;
}

/**
 * Whether the log shows that the colleague a claim names did write what the op puts back:
 * `logged` holds the earlier ops the claim's rule selects (the same path, or the same relatório).
 */
export function historyClaimHolds(claim: HistoryClaim, logged: readonly LoggedAttribution[]): boolean {
  return logged.some((entry) => {
    if (entry.actor_id !== claim.actorId) return false;
    return claim.rule !== 'same_path_value' || leafAt(entry.value, claim.pointer) === claim.actorId;
  });
}

/**
 * The lower bound of Story 20.8: an issue when an instant of an op naming a relatório lies more
 * than `CLOCK_SKEW_MS` before that relatório's creation (the earlier of its create's `client_ts`
 * and the instant the server received that create), else null.
 */
export function lowerBoundIssue(bounded: readonly string[], createdAt: string): string | null {
  const earliest = Date.parse(createdAt) - CLOCK_SKEW_MS;
  if (Number.isNaN(earliest)) return null;
  for (const instant of bounded) {
    const at = Date.parse(instant);
    if (!Number.isNaN(at) && at < earliest) return `${instant} is more than ${CLOCK_SKEW_MS / 60_000} minutes before the relatório's creation (${createdAt})`;
  }
  return null;
}

/** Sets the leaf at `keys` under `root` (a fresh copy the caller owns); a missing step leaves it as it is. */
function setLeafAt(root: unknown, keys: readonly string[], leaf: string): void {
  let at: unknown = root;
  for (const key of keys.slice(0, -1)) {
    if (at === null || typeof at !== 'object' || Array.isArray(at)) return;
    at = (at as Record<string, unknown>)[key];
  }
  const last = keys.at(-1);
  if (last === undefined || at === null || typeof at !== 'object' || Array.isArray(at)) return;
  (at as Record<string, unknown>)[last] = leaf;
}

/**
 * E20-A1 (R-2, R-12): how close to an op's old `client_ts` a value instant must lie to count as
 * read from the same clock as the stamp (60 s), for `restampOp`. Its own window: tuning the
 * device's offset tolerance (`CLOCK_OFFSET_TOLERANCE_MS`) does not change what a resend rewrites.
 */
export const RESTAMP_WINDOW_MS = 60_000;

/**
 * e20f (2026-11-04): an op the server refused because the device's clock was wrong, stamped
 * again at `at` (the device's corrected now) for "Reenviar". Its `client_ts` becomes `at`.
 * E20-A1 (R-2): each `bounded` or `future` instant of the table that lies within
 * `RESTAMP_WINDOW_MS` of the old `client_ts` was read from the same wrong clock, so it moves by
 * the clock's error the device has learned since (`clockErrorMs`, the server's clock minus the
 * device's: `clockOffsetMs()` on the web), not to the resend time; one still later than `at`
 * after that becomes `at`. Review loop 1: an error of 0 means none is known (the clock was fixed
 * before the device reconnected), and then the instant moves by the stamp's own delta
 * (`at - old client_ts`, e20f's rule), so a slow clock's instants never stay behind a create
 * stamped again at now. An instant far from the old stamp (a colleague's edit put back by an
 * undo, a gallery photo's capture) is left exactly as it is, and exempt instants and actor
 * leaves are never touched. Pure: returns a new op.
 */
export function restampOp(op: Op, at: Date, clockErrorMs = 0): Op {
  const atMs = at.getTime();
  const oldMs = Date.parse(op.client_ts);
  const next: Op = { ...structuredClone(op), client_ts: at.toISOString() };
  if (Number.isNaN(oldMs)) return next;
  const error = Number.isFinite(clockErrorMs) && clockErrorMs !== 0 ? clockErrorMs : atMs - oldMs;
  let path: OpPath;
  try {
    path = parsePath(op.path);
  } catch {
    return next;
  }
  for (const { field, leaf, keys } of leavesOf(op, path)) {
    if (field.pointer === 'op.client_ts' || !('instant' in field) || field.instant === 'exempt') continue;
    if (typeof leaf !== 'string') continue;
    const leafMs = Date.parse(leaf);
    if (Number.isNaN(leafMs) || Math.abs(leafMs - oldMs) > RESTAMP_WINDOW_MS) continue;
    const shifted = Math.min(leafMs + error, atMs);
    if (shifted === leafMs) continue;
    const iso = new Date(shifted).toISOString();
    if (field.pointer.startsWith('op.')) setLeafAt(next, keys, iso);
    else if (keys.length === 0) next.value = iso;
    else setLeafAt(next.value, keys, iso);
  }
  return next;
}
