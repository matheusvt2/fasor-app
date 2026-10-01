import {
  applyOp,
  clientReadingKindPutAllowed,
  entityKey,
  FILE_SERVER_FIELDS,
  formatPath,
  isServerOnly,
  normalizeRegistryName,
  opSchema,
  parsePath,
  PathError,
  rowIndexColumns,
  rowRemovedAt,
  SeedPathError,
  SERVER_DEVICE_ID,
  splitEntityKey,
  targetsOf,
  toIso,
  type Clock,
  type Entity,
  type EntityKey,
  type EntityRow,
  type Op,
  type OpPath,
  type OpRejectCode,
  type ReadingKindPutPhoto,
  type RegistryRow,
} from '@app/domain';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { ZodError } from 'zod';
import type { Db } from '../db/client.ts';
import type { CompanyId } from '../db/repositories/company-id.ts';
import { entities, ops } from '../db/schema.ts';
import { newId } from '../ids.ts';

/*
 * AD-3, AD-4, AD-24: the server materializer. One transaction per push
 * (E6-A1): per op, insert the op (an existing `op_id` returns its `seq`), load the
 * target rows, call the same `applyOp`, upsert `entities`. Rejected only for shape, unknown path,
 * origin (a server-only family, a spoofed device or actor), ownership (a user
 * row written by anyone but that user) or tenant; never for a domain rule, the one exception
 * being a client `reading_kind` put its photo does not allow (E9-Q2: it would queue a paid
 * reading).
 */

export interface ApplyResult {
  applied: { op_id: string; seq: number }[];
  rejected: { op_id: string; code: OpRejectCode }[];
  /** Applied ops whose `prev_op_id` was not the server's latest op on that path (AD-24). */
  superseded: { op_id: string; over_op_id: string }[];
}

/**
 * `origin` is required so every emitter states who it is: a route passes `client` with
 * the session's user id; the server's own emitters pass `server` (provisioning's
 * `user/{id}` projection today, the Epic 6 files, reading and generate jobs later).
 */
export type ApplyDeps = {
  now: Clock;
  /**
   * Runs inside the push's transaction, right after the company lock and before the first
   * op (A-10: the push route's mark-blind check reads the rows it guards under the same lock
   * as the writes). Whatever it throws rolls the push back and propagates as is.
   */
  before?: (tx: Tx) => Promise<void>;
} & ({ origin: 'client'; actorId: string } | { origin: 'server' });

/** A valid op carries its parsed path, so the apply path parses it once (A-23). */
type Validation = { ok: true; op: Op; path: OpPath } | { ok: false; code: OpRejectCode };

/**
 * The `file/server` fields a create may not carry a value for. `reading_status` is left
 * out on purpose: it is a required, non-null enum on a photo row that a create has to
 * set (`'none'`), so it cannot be checked the same way: `clientReadingFieldsAreValid`
 * holds its rule (Story 8.1).
 */
const CREATE_FORBIDDEN_FILE_FIELDS = FILE_SERVER_FIELDS.filter((field) => field !== 'reading_status');

/**
 * True when a `file` create leaves the server-owned fields unset. Only the server may
 * fill them, and only once it has actually stored the bytes.
 */
function serverFileFieldsAreEmpty(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  const row = value as Record<string, unknown>;
  return CREATE_FORBIDDEN_FILE_FIELDS.every((field) => row[field] === null || row[field] === undefined);
}

/**
 * Story 8.1 (contract 5): a device's photo create may queue a reading, never report one.
 * Its `reading_status` is `none`, or `queued` together with the `reading_kind` the reading
 * job needs; `running`, `done` and `failed` are the reading job's own (`system:reading`).
 */
function clientReadingFieldsAreValid(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  const row = value as Record<string, unknown>;
  if (row.kind !== 'photo') return true;
  if (row.reading_status === 'none') return true;
  return row.reading_status === 'queued' && row.reading_kind !== null && row.reading_kind !== undefined;
}

/**
 * Story 9.2 (contract 7), narrowed by E9-Q2 (contract 9): a device re-targets a panel photo to
 * its new block's plate with a `file/{id}/reading_kind` put of `plate` (which queues it,
 * `applyOp`) and a `file/{id}/reading_target` put holding an object; its undo puts both null.
 * Contract 14 (ledger 1131): a gallery import batch asks for its photos' caption reading with a
 * `file/{id}/reading_kind` put of `caption` once the batch is answered. Anything else is
 * `op_invalid`. Which photo may take a `plate` or `caption` put is the row's state, checked
 * where the row is loaded (`clientReadingKindPutAllowed`, `applyOneIn`).
 */
function clientReadingPutIsValid(field: string, value: unknown): boolean {
  if (field === 'reading_kind') return value === 'plate' || value === 'caption' || value === null;
  if (field === 'reading_target') return value === null || (typeof value === 'object' && !Array.isArray(value));
  return true;
}

/** E9-Q2: a client `reading_kind` put the photo's stored state does not allow (`op_invalid`, a permanent refusal). */
class ReadingKindPutRefusedError extends Error {
  constructor(path: string) {
    super(`reading_kind put refused on ${path}`);
    this.name = 'ReadingKindPutRefusedError';
  }
}

/**
 * E9-Q2: refuses a client `file/{id}/reading_kind` put its photo's stored row does not allow
 * (a kind other than the 9.2 re-target or the contract-14 caption request, `plate` on a photo
 * that is not a panel one, or `caption` on a photo that has a reading already or a sheet, a
 * caption or the "Pessoas na foto" mark), before `applyOp` would queue a second paid reading or
 * send a marked photo to the prose provider. Server ops are never checked here.
 */
function assertClientReadingKindPut(op: Op, path: OpPath, state: ReadonlyMap<EntityKey, EntityRow>, origin: ApplyDeps['origin']): void {
  if (origin !== 'client' || op.kind !== 'put') return;
  if (path.family !== 'file/field' || path.field !== 'reading_kind') return;
  const photo = state.get(entityKey('file', path.id)) as ReadingKindPutPhoto | undefined;
  if (!clientReadingKindPutAllowed(photo, op.value)) throw new ReadingKindPutRefusedError(op.path);
}

function validate(raw: unknown, companyId: CompanyId, deps: ApplyDeps): Validation {
  const rawPath = (raw as { path?: unknown } | null)?.path;
  let path: OpPath | null = null;
  if (typeof rawPath === 'string') {
    try {
      path = parsePath(rawPath);
    } catch (error) {
      if (error instanceof PathError) return { ok: false, code: 'op_path_unknown' };
      throw error;
    }
  }
  const parsed = opSchema.safeParse(raw);
  if (!parsed.success || path === null) return { ok: false, code: 'op_invalid' };
  const op = parsed.data;
  if (op.company_id !== companyId) return { ok: false, code: 'op_tenant_mismatch' };
  if (isServerOnly(op.path) && op.device_id !== SERVER_DEVICE_ID) return { ok: false, code: 'op_server_only' };
  if (deps.origin === 'client') {
    if (isServerOnly(op.path)) return { ok: false, code: 'op_server_only' };
    if (op.device_id === SERVER_DEVICE_ID) return { ok: false, code: 'op_server_only' };
    if (op.actor_id.startsWith('system:')) return { ok: false, code: 'op_server_only' };
    // A forged attribution is a shape error, not a tenant one.
    if (op.actor_id !== deps.actorId) return { ok: false, code: 'op_invalid' };
    // A user row is written only by that user (CAP-6): the registration of a colleague,
    // in this company or any other, is refused per op. The name is identity-owned
    // (provisioning writes it), so no client may write it, not even its own.
    if (path.family === 'user/field' && (path.id !== deps.actorId || path.field === 'name')) {
      return { ok: false, code: 'op_forbidden' };
    }
    // `file/server` blocks the *puts* to `uploaded_at`, `variants` and `reading_status`,
    // but a create carries the whole row, so the same server-owned fields could ride in
    // on it. A file that says it is uploaded when no bytes exist is unrecoverable: the
    // device's `pendingUploads` skips it forever and every read of it 404s (AD-7).
    if (path.family === 'file' && !serverFileFieldsAreEmpty(op.value)) {
      return { ok: false, code: 'op_invalid' };
    }
    if (path.family === 'file' && !clientReadingFieldsAreValid(op.value)) {
      return { ok: false, code: 'op_invalid' };
    }
    if (path.family === 'file/field' && (op.kind !== 'put' ? path.field === 'reading_kind' || path.field === 'reading_target' : !clientReadingPutIsValid(path.field, op.value))) {
      return { ok: false, code: 'op_invalid' };
    }
  }
  return { ok: true, op, path };
}

/** The op_id is already taken by another company's op: the insert can never succeed. */
class ForeignOpIdError extends Error {
  constructor(opId: string) {
    super(`op ${opId} belongs to another company`);
    this.name = 'ForeignOpIdError';
  }
}

interface Applied {
  seq: number;
  /** The latest op on the path before this one, when it differs from `prev_op_id`. */
  supersededOver: string | null;
}

/** The actor of the server's merge ops (Story 2.5 AC4, Epic 2 retro D-1). */
export const REGISTRY_MERGE_ACTOR = 'system:registry';

/** The transaction handle drizzle hands a `db.transaction` callback; `applyOneIn` and `freezeSnapshot` run inside one. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type MergeKind = 'manufacturer' | 'voltage_class';

/** Takes the per-company advisory lock every apply and every snapshot freeze serialize on (AD-3). */
export async function lockCompany(tx: Tx, companyId: CompanyId): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${companyId}))`);
}

function isMergeKind(kind: string): kind is MergeKind {
  return kind === 'manufacturer' || kind === 'voltage_class';
}

/**
 * The live row an id was merged into, read from the log. A merge is recorded as one
 * `system:registry` remove of the merged-away id's `removed_at` whose `meta.merged_into`
 * names the survivor (the system op `applyOneIn` emits): the redirect is persisted in the
 * one log, so a put or remove on the merged-away id that reaches the server in any later
 * request still lands on the survivor instead of being acked onto a row that does not
 * exist (Epic 2 retro D-1).
 */
async function mergedInto(tx: Tx, companyId: CompanyId, kind: MergeKind, id: string): Promise<string | null> {
  const [row] = await tx
    .select({ meta: ops.meta })
    .from(ops)
    .where(
      and(
        eq(ops.company_id, companyId),
        eq(ops.path, `registry/${kind}/${id}/removed_at`),
        eq(ops.actor_id, REGISTRY_MERGE_ACTOR),
      ),
    )
    .limit(1);
  const target = (row?.meta as { merged_into?: unknown } | null | undefined)?.merged_into;
  return typeof target === 'string' ? target : null;
}

/** An op with its parsed path (A-23: parsed once per op along the apply). */
interface PathedOp {
  op: Op;
  path: OpPath;
}

/** The same registry op on another id of the same kind (a create's row id follows its path). */
function retarget(target: PathedOp, id: string): PathedOp {
  const { op, path } = target;
  if (path.family !== 'registry' && path.family !== 'registry/field') return target;
  const value =
    op.kind === 'create' && op.value !== null && typeof op.value === 'object' && !Array.isArray(op.value)
      ? { ...(op.value as Record<string, unknown>), id }
      : op.value;
  const moved = { ...path, id };
  return { op: { ...op, path: formatPath(moved), value }, path: moved };
}

/**
 * Rewrites an op that targets a merged-away manufacturer/voltage_class id onto the row
 * it merged into. Without this, a put/remove on the vanished id would resolve to a
 * missing entity and `applyOp` would silently no-op it (AD-3), and the device that sent
 * it would get an ack for an edit nobody holds.
 */
async function redirectOp(tx: Tx, companyId: CompanyId, target: PathedOp): Promise<PathedOp> {
  const { path } = target;
  if (path.family !== 'registry' && path.family !== 'registry/field') return target;
  if (!isMergeKind(path.kind)) return target;
  const survivor = await mergedInto(tx, companyId, path.kind, path.id);
  return survivor === null ? target : retarget(target, survivor);
}

/**
 * A-1 (review 2026-09-30): the live manufacturer/voltage_class rows of the company by
 * normalized name, loaded once per kind per call of `applyOps`/`applyServerBatch` (never at
 * module level: a concurrent push of the company waits on the lock and builds its own).
 * A create that inserted a new row adds it; any other applied op on a row of the kind drops
 * that kind (the next create reloads it); a rolled-back batch savepoint drops every kind.
 */
type RegistryNames = Map<MergeKind, Map<string, string[]>>;

async function registryNames(tx: Tx, companyId: CompanyId, kind: MergeKind, cache: RegistryNames): Promise<Map<string, string[]>> {
  const known = cache.get(kind);
  if (known !== undefined) return known;
  // Only the live rows of this kind are loaded (the JSON `kind` filtered in SQL); the check
  // below stays as the guard of the rule.
  const candidates = await tx
    .select({ id: entities.id, row: entities.row })
    .from(entities)
    .where(
      and(
        eq(entities.company_id, companyId),
        eq(entities.entity, 'registry'),
        isNull(entities.removed_at),
        sql`${entities.row}->>'kind' = ${kind}`,
      ),
    );
  const names = new Map<string, string[]>();
  for (const candidate of candidates) {
    const row = candidate.row as RegistryRow;
    if (row.kind !== kind) continue;
    addName(names, normalizeRegistryName(row.name), candidate.id);
  }
  cache.set(kind, names);
  return names;
}

function addName(names: Map<string, string[]>, normalized: string, id: string): void {
  const ids = names.get(normalized);
  if (ids === undefined) names.set(normalized, [id]);
  else if (!ids.includes(id)) ids.push(id);
}

/** Keeps the cache current after an op was applied (the entity writes are done). */
function noteRegistryWrite(cache: RegistryNames, target: PathedOp, existedBefore: boolean): void {
  const { op, path } = target;
  if (path.family !== 'registry' && path.family !== 'registry/field') return;
  if (!isMergeKind(path.kind)) return;
  const names = cache.get(path.kind);
  if (names === undefined) return;
  const name = (op.value as { name?: unknown } | null)?.name;
  if (path.family === 'registry' && op.kind === 'create' && !existedBefore && typeof name === 'string') {
    const normalized = normalizeRegistryName(name);
    if (normalized !== '') addName(names, normalized, path.id);
    return;
  }
  cache.delete(path.kind);
}

/**
 * AR-18 / Design Notes "Server merge scope": manufacturer/voltage_class are stored by
 * value on sheets, so the only thing to prevent is two live registry rows with the same
 * normalized name. A create whose name normalizes to an existing live row of the same
 * kind+company merges onto that row (a duplicate create is a no-op, AD-3). Returns the
 * merged-away id and the survivor, or null when the create does not merge. An empty or
 * blank name never merges: normalizeRegistryName('') === '' would otherwise collide
 * every blank-name row into one (independent review, PR #14 finding 1).
 */
async function mergeTarget(
  tx: Tx,
  companyId: CompanyId,
  target: PathedOp,
  cache: RegistryNames,
): Promise<{ kind: MergeKind; from: string; into: string } | null> {
  const { op, path } = target;
  if (op.kind !== 'create') return null;
  if (path.family !== 'registry' || !isMergeKind(path.kind)) return null;
  const kind = path.kind;
  const incomingName = (op.value as { name?: unknown } | null)?.name;
  if (typeof incomingName !== 'string') return null;
  const normalized = normalizeRegistryName(incomingName);
  if (normalized === '') return null;
  const match = (await registryNames(tx, companyId, kind, cache)).get(normalized)?.find((id) => id !== path.id);
  return match === undefined ? null : { kind, from: path.id, into: match };
}

/** Inserts one op into the log; `undefined` when its `op_id` is already there (a dedupe hit). */
async function insertOp(tx: Tx, companyId: CompanyId, op: Op, receivedAt: string): Promise<number | undefined> {
  const inserted = await tx
    .insert(ops)
    .values({
      op_id: op.op_id,
      company_id: companyId,
      scope: op.scope,
      project_id: op.project_id ?? null,
      relatorio_id: op.relatorio_id ?? null,
      kind: op.kind,
      path: op.path,
      value: op.value,
      prev_op_id: op.prev_op_id ?? null,
      batch_id: op.batch_id ?? null,
      meta: op.meta ?? null,
      actor_id: op.actor_id,
      device_id: op.device_id,
      client_ts: op.client_ts,
      received_at: receivedAt,
    })
    .onConflictDoNothing({ target: ops.op_id })
    .returning({ seq: ops.seq });
  return inserted[0]?.seq;
}

/**
 * The body of one apply, inside a transaction the caller opened and locked (`lockCompany`):
 * applies serialize per company, so no update is lost on a shared row and seq order equals
 * commit order. `applyOps` runs every op of a push in one transaction under one lock;
 * `applyServerBatch` runs several under one lock so they land together or not at all.
 */
async function applyOneIn(
  tx: Tx,
  companyId: CompanyId,
  received: PathedOp,
  receivedAt: string,
  origin: ApplyDeps['origin'],
  cache: RegistryNames,
): Promise<Applied> {
  // Epic 2 retro D-1: an op on a merged-away id is rewritten onto the survivor, and a
  // create that merges is rewritten onto the row it merges into, *before* the op is
  // logged. The log then holds what was applied, so every device that pulls it (the one
  // that sent it included) converges on the survivor. The op keeps its `op_id`, so the
  // ack and the dedupe still work, and the device's `rematerialize` lets the pulled
  // version stand in for its own outbox copy (`sync-store.ts`).
  const redirected = await redirectOp(tx, companyId, received);
  const merge = await mergeTarget(tx, companyId, redirected, cache);
  const target = merge === null ? redirected : retarget(redirected, merge.into);
  const op = target.op;

  // The server's current op on this path, read before the insert. Implicit-relatorio
  // families (`relatorio/status`, `relatorio/setup/*`) share one path across relatorios,
  // so the relatorio id narrows the lookup whenever the op carries one. A-23: not for a
  // create, whose `prev_op_id` is always null and whose superseded pair the kernel never
  // shows (`mergeInfoOf` returns null for a create).
  const [latest] =
    op.kind === 'create'
      ? []
      : await tx
          .select({ op_id: ops.op_id })
          .from(ops)
          .where(
            and(
              eq(ops.company_id, companyId),
              eq(ops.path, op.path),
              op.relatorio_id ? eq(ops.relatorio_id, op.relatorio_id) : undefined,
            ),
          )
          .orderBy(desc(ops.seq))
          .limit(1);

  const seq = await insertOp(tx, companyId, op, receivedAt);
  if (seq === undefined) {
    // A dedupe hit: the op was applied before and is never superseded again. The lookup is
    // tenant-scoped (AD-10): an op_id that exists under another company can never be inserted
    // (global unique), so it is a shape rejection, never that company's seq.
    const [existing] = await tx
      .select({ seq: ops.seq })
      .from(ops)
      .where(and(eq(ops.op_id, op.op_id), eq(ops.company_id, companyId)));
    if (!existing) throw new ForeignOpIdError(op.op_id);
    return { seq: existing.seq, supersededOver: null };
  }

  const refs = targetsOf(op);
  const rows = await tx
    .select()
    .from(entities)
    .where(
      and(
        eq(entities.company_id, companyId),
        or(...refs.map((r) => and(eq(entities.entity, r.entity), eq(entities.id, r.id)))),
      ),
    );
  const state = new Map<EntityKey, EntityRow>();
  for (const row of rows) state.set(entityKey(row.entity as Entity, row.id), row.row);
  let next: ReturnType<typeof applyOp>;
  try {
    assertClientReadingKindPut(op, target.path, state, origin);
    next = applyOp(state, { ...op, seq });
  } catch (error) {
    // E6-A1: a refusal by `applyOp` (row schema, seed path) comes before any entity write,
    // so the op's own log row is its only write: removed here, the push's transaction holds
    // nothing of the refused op and goes on with the next one (no savepoint needed).
    if (isPermanentRefusal(error)) await tx.delete(ops).where(and(eq(ops.company_id, companyId), eq(ops.op_id, op.op_id)));
    throw error;
  }
  for (const [key, row] of next) {
    if (row === state.get(key)) continue;
    const { entity, id } = splitEntityKey(key);
    const columns = { ...rowIndexColumns(entity, row), removed_at: rowRemovedAt(row), row, updated_seq: seq };
    await tx
      .insert(entities)
      .values({ company_id: companyId, entity, id, ...columns })
      .onConflictDoUpdate({ target: [entities.company_id, entities.entity, entities.id], set: columns });
  }
  noteRegistryWrite(cache, target, target.path.family === 'registry' && state.has(entityKey('registry', target.path.id)));

  if (merge !== null) {
    // The system op that retires the merged-away id on every device and persists the
    // redirect (`mergedInto`). The id never had a row on the server, so the op applies
    // to nothing here; on the device that minted the id it is what tombstones the row.
    await insertOp(
      tx,
      companyId,
      {
        op_id: newId(),
        company_id: companyId,
        scope: 'company',
        project_id: null,
        relatorio_id: null,
        kind: 'remove',
        path: `registry/${merge.kind}/${merge.from}/removed_at`,
        value: null,
        prev_op_id: null,
        batch_id: null,
        meta: { merged_into: merge.into },
        actor_id: REGISTRY_MERGE_ACTOR,
        device_id: SERVER_DEVICE_ID,
        client_ts: receivedAt,
      },
      receivedAt,
    );
  }

  const supersededOver = latest !== undefined && latest.op_id !== (op.prev_op_id ?? null) ? latest.op_id : null;
  return { seq, supersededOver };
}

/** A server batch was refused because an op of it was rejected: nothing of it was applied. */
export class ServerBatchRejectedError extends Error {
  readonly rejected: { op_id: string; code: OpRejectCode }[];
  constructor(rejected: { op_id: string; code: OpRejectCode }[], options?: { cause?: unknown }) {
    super(`server batch rejected: ${rejected.map((r) => `${r.op_id} ${r.code}`).join(', ')}`, options);
    this.name = 'ServerBatchRejectedError';
    this.rejected = rejected;
  }
}

export interface ServerBatchDeps {
  now: Clock;
  /**
   * Runs inside the transaction, right after the company lock and before the first op:
   * the place for a check that must share the writes' transaction (the generate job's
   * revision number, the route's "no job already running"). Whatever it throws rolls
   * the batch back and propagates as is.
   */
  before?: (tx: Tx) => Promise<void>;
}

/**
 * A refusal no retry can fix: a row schema failure, a seed key or cell outside the block's
 * definition (E5-Q1, `SeedPathError`), an op_id another company holds, or a client
 * `reading_kind` put its photo does not allow (E9-Q2). Each is `op_invalid`.
 */
export function isPermanentRefusal(error: unknown): boolean {
  return error instanceof ZodError || error instanceof SeedPathError || error instanceof ForeignOpIdError || error instanceof ReadingKindPutRefusedError;
}

/**
 * Story 4.8: the server's own ops applied as ONE transaction under the company lock —
 * the generate job's two `file` creates, the `revision` create and the job's `status`
 * and `result` puts land together, so a failed job allocates no revision number and
 * stores no file row (AD-15). Every op is validated first; a rejected op, or a row schema
 * refusal by `applyOp` mid-batch, throws `ServerBatchRejectedError` and rolls the whole
 * batch back.
 */
export async function applyServerBatch(
  db: Db,
  companyId: CompanyId,
  rawOps: readonly unknown[],
  deps: ServerBatchDeps,
): Promise<ApplyResult> {
  const validated: PathedOp[] = [];
  const rejected: { op_id: string; code: OpRejectCode }[] = [];
  for (const raw of rawOps) {
    const validation = validate(raw, companyId, { now: deps.now, origin: 'server' });
    if (validation.ok) validated.push({ op: validation.op, path: validation.path });
    else {
      const rawId = (raw as { op_id?: unknown } | null)?.op_id;
      rejected.push({ op_id: typeof rawId === 'string' ? rawId : '', code: validation.code });
    }
  }
  if (rejected.length > 0) throw new ServerBatchRejectedError(rejected);
  const receivedAt = toIso(deps.now());
  const result: ApplyResult = { applied: [], rejected: [], superseded: [] };
  let applying: Op | null = null;
  const cache: RegistryNames = new Map();
  try {
    await db.transaction(async (tx) => {
      await lockCompany(tx, companyId);
      if (deps.before !== undefined) await deps.before(tx);
      for (const target of validated) {
        const op = target.op;
        applying = op;
        const { seq, supersededOver } = await applyOneIn(tx, companyId, target, receivedAt, 'server', cache);
        result.applied.push({ op_id: op.op_id, seq });
        if (supersededOver !== null) result.superseded.push({ op_id: op.op_id, over_op_id: supersededOver });
      }
    });
  } catch (error) {
    if (isPermanentRefusal(error)) {
      const opId = (applying as Op | null)?.op_id ?? '';
      throw new ServerBatchRejectedError([{ op_id: opId, code: 'op_invalid' }], { cause: error });
    }
    throw error;
  }
  return result;
}

/** The client batch a raw op names (`batch_id`), read before validation so a refused op still names its batch. */
function rawBatchId(raw: unknown): string | null {
  const batchId = (raw as { batch_id?: unknown } | null)?.batch_id;
  return typeof batchId === 'string' ? batchId : null;
}

/** Thrown inside a multi-op batch's savepoint to roll it back: an op of it was refused permanently. */
class BatchRefusedError extends Error {
  readonly opId: string;
  constructor(opId: string, options?: { cause?: unknown }) {
    super(`batch refused at op ${opId}`, options);
    this.name = 'BatchRefusedError';
    this.opId = opId;
  }
}

type Step = ({ ok: true; op: Op; path: OpPath } | { ok: false; op_id: string; code: OpRejectCode }) & { batch_id: string | null };

/**
 * Applies ops in array order for one tenant; one rejected op never blocks the rest.
 *
 * E6-A1: the whole push is ONE transaction under ONE company lock. A permanent refusal
 * (`isPermanentRefusal`) is raised before the op wrote anything but its own log row, which
 * `applyOneIn` removes, so it is answered `op_invalid` and the ops before and after it land;
 * no savepoint is needed for a single op (a savepoint per op made the 2500-op Porto Seguro
 * replay six times slower: every one is a Postgres subtransaction, and past 64 of them in
 * one transaction each visibility check goes through `pg_subtrans`).
 * Anything else (connection, lock, pool) rolls the whole push back and propagates, so the
 * device retries the push as it is (a re-sent `op_id` answers its existing seq). Holding
 * the lock for the push keeps seq order equal to commit order within the company, and the
 * push pays one commit (one WAL flush) instead of one per op: with one transaction per op,
 * overlapping pushes of a few hundred ops each queued on the flushes and slowed sharply.
 *
 * Ledger 1161 (Story 10.1): a client batch (FR-32, one `batch_id`) is atomic. Its ops are
 * applied together, at the position of its first op in the push, under ONE savepoint per
 * multi-op batch (never one per op); a permanent refusal of any of its ops rolls back that
 * batch alone and answers every op of it `op_invalid` (an op the validation refused keeps
 * its own code), while the ops of other batches in the push apply. The device never splits
 * a batch across pushes (`batches` in `apps/web/src/sync/policy.ts`).
 */
export async function applyOps(
  db: Db,
  companyId: CompanyId,
  rawOps: readonly unknown[],
  deps: ApplyDeps,
): Promise<ApplyResult> {
  // Shape, origin and tenant checks need no database: done first, in array order.
  const steps: Step[] = rawOps.map((raw) => {
    const batch_id = rawBatchId(raw);
    const validation = validate(raw, companyId, deps);
    if (validation.ok) return { ...validation, batch_id };
    const rawId = (raw as { op_id?: unknown } | null)?.op_id;
    return { ok: false, op_id: typeof rawId === 'string' ? rawId : '', code: validation.code, batch_id };
  });
  const result: ApplyResult = { applied: [], rejected: [], superseded: [] };
  // The steps of each batch that has more than one op in this push, in array order.
  const groups = new Map<string, Step[]>();
  for (const step of steps) {
    if (step.batch_id === null) continue;
    const group = groups.get(step.batch_id);
    if (group === undefined) groups.set(step.batch_id, [step]);
    else group.push(step);
  }
  for (const [batchId, group] of groups) if (group.length < 2) groups.delete(batchId);
  const opIdOf = (step: Step) => (step.ok ? step.op.op_id : step.op_id);

  /** Every op of a refused batch: `op_invalid`, or the code the validation gave the op itself. */
  const refuseAll = (group: readonly Step[]) => {
    for (const member of group) result.rejected.push({ op_id: opIdOf(member), code: member.ok ? 'op_invalid' : member.code });
  };

  const cache: RegistryNames = new Map();

  /** One multi-op batch: all of it under one savepoint, or none of it. */
  const applyBatchIn = async (tx: Tx, group: readonly Step[]): Promise<void> => {
    if (group.some((member) => !member.ok)) {
      refuseAll(group);
      return;
    }
    const applied: ApplyResult['applied'] = [];
    const superseded: ApplyResult['superseded'] = [];
    try {
      await tx.transaction(async (savepoint) => {
        for (const member of group) {
          const target = member as { op: Op; path: OpPath };
          const op = target.op;
          try {
            const { seq, supersededOver } = await applyOneIn(savepoint, companyId, target, toIso(deps.now()), deps.origin, cache);
            applied.push({ op_id: op.op_id, seq });
            if (supersededOver !== null) superseded.push({ op_id: op.op_id, over_op_id: supersededOver });
          } catch (error) {
            if (isPermanentRefusal(error)) throw new BatchRefusedError(op.op_id, { cause: error });
            throw error;
          }
        }
      });
    } catch (error) {
      // The savepoint rolled back what the batch wrote, rows the registry cache may name.
      cache.clear();
      if (!(error instanceof BatchRefusedError)) throw error;
      refuseAll(group);
      return;
    }
    result.applied.push(...applied);
    result.superseded.push(...superseded);
  };

  if (!steps.some((step) => step.ok) && deps.before === undefined) {
    for (const step of steps) if (!step.ok) result.rejected.push({ op_id: step.op_id, code: step.code });
    return result;
  }
  await db.transaction(async (tx) => {
    await lockCompany(tx, companyId);
    if (deps.before !== undefined) await deps.before(tx);
    const handled = new Set<Step>();
    for (const step of steps) {
      if (handled.has(step)) continue;
      const group = step.batch_id === null ? undefined : groups.get(step.batch_id);
      if (group !== undefined) {
        for (const member of group) handled.add(member);
        await applyBatchIn(tx, group);
        continue;
      }
      if (!step.ok) {
        result.rejected.push({ op_id: step.op_id, code: step.code });
        continue;
      }
      try {
        const { seq, supersededOver } = await applyOneIn(tx, companyId, step, toIso(deps.now()), deps.origin, cache);
        result.applied.push({ op_id: step.op.op_id, seq });
        if (supersededOver !== null) result.superseded.push({ op_id: step.op.op_id, over_op_id: supersededOver });
      } catch (error) {
        // Only a row-schema or seed-path refusal by applyOp or an op_id taken by another company is a
        // permanent rejection; anything else (connection, lock, pool) propagates so the caller retries
        // instead of marking the op dead.
        if (!isPermanentRefusal(error)) throw error;
        result.rejected.push({ op_id: step.op.op_id, code: 'op_invalid' });
      }
    }
  });
  return result;
}
