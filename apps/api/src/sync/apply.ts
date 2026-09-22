import {
  applyOp,
  entityKey,
  isServerOnly,
  opSchema,
  parsePath,
  PathError,
  rowIndexColumns,
  rowRemovedAt,
  SERVER_DEVICE_ID,
  splitEntityKey,
  targetsOf,
  toIso,
  type Clock,
  type Entity,
  type EntityKey,
  type EntityRow,
  type Op,
  type OpRejectCode,
} from '@app/domain';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { ZodError } from 'zod';
import type { Db } from '../db/client.ts';
import type { CompanyId } from '../db/repositories/company-id.ts';
import { entities, ops } from '../db/schema.ts';

/*
 * AD-3, AD-4, AD-24: the server materializer. Per-op transaction: insert the
 * op (an existing `op_id` returns its `seq`), load the target rows, call the
 * same `applyOp`, upsert `entities`. Rejected only for shape, unknown path,
 * origin (a server-only family, a spoofed device or actor), ownership (a user
 * row written by anyone but that user) or tenant; never for a domain rule.
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
export type ApplyDeps = { now: Clock } & ({ origin: 'client'; actorId: string } | { origin: 'server' });

type Validation = { ok: true; op: Op } | { ok: false; code: OpRejectCode };

function validate(raw: unknown, companyId: CompanyId, deps: ApplyDeps): Validation {
  const path = (raw as { path?: unknown } | null)?.path;
  if (typeof path === 'string') {
    try {
      parsePath(path);
    } catch (error) {
      if (error instanceof PathError) return { ok: false, code: 'op_path_unknown' };
      throw error;
    }
  }
  const parsed = opSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: 'op_invalid' };
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
    const path = parsePath(op.path);
    if (path.family === 'user/field' && (path.id !== deps.actorId || path.field === 'name')) {
      return { ok: false, code: 'op_forbidden' };
    }
  }
  return { ok: true, op };
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

async function applyOne(db: Db, companyId: CompanyId, op: Op, receivedAt: string): Promise<Applied> {
  return db.transaction(async (tx) => {
    // Applies serialize per company: no lost update on a shared row, and seq order equals commit order.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${companyId}))`);

    // The server's current op on this path, read before the insert. Implicit-relatorio
    // families (`relatorio/status`, `relatorio/setup/*`) share one path across relatorios,
    // so the relatorio id narrows the lookup whenever the op carries one.
    const [latest] = await tx
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
    const seq = inserted[0]?.seq;
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
    const next = applyOp(state, { ...op, seq });
    for (const [key, row] of next) {
      if (row === state.get(key)) continue;
      const { entity, id } = splitEntityKey(key);
      const columns = { ...rowIndexColumns(entity, row), removed_at: rowRemovedAt(row), row, updated_seq: seq };
      await tx
        .insert(entities)
        .values({ company_id: companyId, entity, id, ...columns })
        .onConflictDoUpdate({ target: [entities.company_id, entities.entity, entities.id], set: columns });
    }
    const supersededOver = latest !== undefined && latest.op_id !== (op.prev_op_id ?? null) ? latest.op_id : null;
    return { seq, supersededOver };
  });
}

/** Applies ops in array order for one tenant; one rejected op never blocks the rest. */
export async function applyOps(
  db: Db,
  companyId: CompanyId,
  rawOps: readonly unknown[],
  deps: ApplyDeps,
): Promise<ApplyResult> {
  const result: ApplyResult = { applied: [], rejected: [], superseded: [] };
  for (const raw of rawOps) {
    const rawId = (raw as { op_id?: unknown } | null)?.op_id;
    const opId = typeof rawId === 'string' ? rawId : '';
    const validation = validate(raw, companyId, deps);
    if (!validation.ok) {
      result.rejected.push({ op_id: opId, code: validation.code });
      continue;
    }
    try {
      const { seq, supersededOver } = await applyOne(db, companyId, validation.op, toIso(deps.now()));
      result.applied.push({ op_id: validation.op.op_id, seq });
      if (supersededOver !== null) result.superseded.push({ op_id: validation.op.op_id, over_op_id: supersededOver });
    } catch (error) {
      // Only a row-schema refusal by applyOp or an op_id taken by another company is a permanent
      // rejection; anything else (connection, lock, pool) propagates so the caller retries instead
      // of marking the op dead.
      if (!(error instanceof ZodError) && !(error instanceof ForeignOpIdError)) throw error;
      result.rejected.push({ op_id: validation.op.op_id, code: 'op_invalid' });
    }
  }
  return result;
}
