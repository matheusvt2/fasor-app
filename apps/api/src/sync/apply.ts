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
} from '@app/domain';
import { and, eq, or, sql } from 'drizzle-orm';
import { ZodError } from 'zod';
import type { Db } from '../db/client.ts';
import { entities, ops } from '../db/schema.ts';

/*
 * AD-3, AD-4, AD-24: the server materializer. Per-op transaction: insert the
 * op (an existing `op_id` returns its `seq`), load the target rows, call the
 * same `applyOp`, upsert `entities`. Rejected only for shape, unknown path or
 * a server-only family from a client; never for a domain rule.
 */

export const REJECT_CODES = ['op_invalid', 'op_path_unknown', 'op_server_only'] as const;
export type RejectCode = (typeof REJECT_CODES)[number];

export interface ApplyResult {
  applied: { op_id: string; seq: number }[];
  rejected: { op_id: string; code: RejectCode }[];
}

export interface ApplyDeps {
  now: Clock;
}

type Validation = { ok: true; op: Op } | { ok: false; code: RejectCode };

function validate(raw: unknown, companyId: string): Validation {
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
  if (op.company_id !== companyId) return { ok: false, code: 'op_invalid' };
  if (isServerOnly(op.path) && op.device_id !== SERVER_DEVICE_ID) return { ok: false, code: 'op_server_only' };
  return { ok: true, op };
}

async function applyOne(db: Db, companyId: string, op: Op, receivedAt: string): Promise<number> {
  return db.transaction(async (tx) => {
    // Applies serialize per company: no lost update on a shared row, and seq order equals commit order.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${companyId}))`);
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
      const [existing] = await tx.select({ seq: ops.seq }).from(ops).where(eq(ops.op_id, op.op_id));
      if (!existing) throw new Error(`op ${op.op_id} neither inserted nor found`);
      return existing.seq;
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
    return seq;
  });
}

/** Applies ops in array order for one tenant; one rejected op never blocks the rest. */
export async function applyOps(
  db: Db,
  companyId: string,
  rawOps: readonly unknown[],
  deps: ApplyDeps,
): Promise<ApplyResult> {
  const result: ApplyResult = { applied: [], rejected: [] };
  for (const raw of rawOps) {
    const rawId = (raw as { op_id?: unknown } | null)?.op_id;
    const opId = typeof rawId === 'string' ? rawId : '';
    const validation = validate(raw, companyId);
    if (!validation.ok) {
      result.rejected.push({ op_id: opId, code: validation.code });
      continue;
    }
    try {
      const seq = await applyOne(db, companyId, validation.op, toIso(deps.now()));
      result.applied.push({ op_id: validation.op.op_id, seq });
    } catch (error) {
      // Only a row-schema refusal by applyOp is a permanent rejection; anything else (connection, lock,
      // pool) propagates so the caller retries instead of marking the op dead.
      if (!(error instanceof ZodError)) throw error;
      result.rejected.push({ op_id: validation.op.op_id, code: 'op_invalid' });
    }
  }
  return result;
}
