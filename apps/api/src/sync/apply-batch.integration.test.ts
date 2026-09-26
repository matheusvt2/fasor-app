import { makeOp, type Op, type OpInput } from '@app/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { now } from '../clock.ts';
import { createDb, type Db } from '../db/client.ts';
import { asCompanyId } from '../db/repositories/company-id.ts';
import { entities, ops } from '../db/schema.ts';
import { newId } from '../ids.ts';
import { applyOps, applyServerBatch, ServerBatchRejectedError } from './apply.ts';

/*
 * Story 4.8: `applyServerBatch` is one transaction under the company lock. A batch whose
 * later op is refused by `applyOp` (a row schema violation) leaves no row and no op of the
 * batch behind; a clean batch lands whole, in order.
 */

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://app:app@postgres:5432/app';
const companyId = asCompanyId(newId());
const { sql, db } = createDb(databaseUrl);

function serverOp(
  input: Omit<OpInput, 'company_id' | 'actor_id' | 'device_id' | 'project_id' | 'relatorio_id' | 'prev_op_id' | 'batch_id' | 'meta'> & Partial<Pick<OpInput, 'relatorio_id'>>,
): Op {
  return makeOp(
    {
      company_id: companyId,
      actor_id: 'system:generate',
      device_id: 'server',
      project_id: null,
      relatorio_id: null,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      ...input,
    },
    { newId, now: now() },
  );
}

function clientCreate(id: string): Op {
  return serverOp({
    kind: 'create',
    scope: 'company',
    path: `registry/client/${id}`,
    value: { id, kind: 'client', name: 'Cliente do lote', cnpj: null, contact_name: null, contact_phone: null, sites: [], removed_at: null },
  });
}

afterAll(async () => {
  await db.delete(entities).where(eq(entities.company_id, companyId));
  await db.delete(ops).where(eq(ops.company_id, companyId));
  await sql.end();
});

describe('4.8-INT-001 applyServerBatch', () => {
  it('rolls the whole batch back when a later op is refused by applyOp: no row, no op', async () => {
    const id = newId();
    const create = clientCreate(id);
    // A put whose value the client row schema refuses (`name` must be a string).
    const badPut = serverOp({ kind: 'put', scope: 'company', path: `registry/client/${id}/name`, value: 42 });
    await expect(applyServerBatch(db, companyId, [create, badPut], { now })).rejects.toBeInstanceOf(ServerBatchRejectedError);
    const rows = await db.select({ id: entities.id }).from(entities).where(and(eq(entities.company_id, companyId), eq(entities.id, id)));
    expect(rows).toEqual([]);
    const logged = await db.select({ op_id: ops.op_id }).from(ops).where(inArray(ops.op_id, [create.op_id, badPut.op_id]));
    expect(logged).toEqual([]);
  });

  it('refuses a batch with an invalid op before touching the database', async () => {
    const id = newId();
    const create = clientCreate(id);
    const forged = { ...create, op_id: newId(), company_id: newId() };
    await expect(applyServerBatch(db, companyId, [create, forged], { now })).rejects.toMatchObject({
      name: 'ServerBatchRejectedError',
      rejected: [{ op_id: forged.op_id, code: 'op_tenant_mismatch' }],
    });
    const logged = await db.select({ op_id: ops.op_id }).from(ops).where(eq(ops.op_id, create.op_id));
    expect(logged).toEqual([]);
  });

  it('E5-Q1 refuses a seed-path op as op_invalid naming it, and rolls the batch back', async () => {
    const relatorioId = newId();
    const blockId = newId();
    const createBlock = serverOp({
      kind: 'create',
      scope: 'relatorio',
      relatorio_id: relatorioId,
      path: `block/${blockId}`,
      value: {
        id: blockId,
        relatorio_id: relatorioId,
        location_id: null,
        equipment_id: null,
        block_type: 'tp',
        config: {},
        seed_version: 'v1',
        order_key: 'a0',
        feeds_block_id: null,
        not_tested: null,
        concluded_by: null,
        sheet: { nameplate: {}, checklist: {}, test: {}, conclusion: {}, observations: null },
        created_by: null,
        first_edited_at: null,
        last_modified_by: null,
        last_modified_at: null,
        removed_at: null,
      },
    });
    // TP ratio: column 2 is VAL CALCULADO, derived by the kernel and never written.
    const derived = serverOp({
      kind: 'put',
      scope: 'relatorio',
      relatorio_id: relatorioId,
      path: `sheet/${blockId}/test/relacao_transformacao/cell/0/2`,
      value: { raw: '120', unit: null, state: 'measured' },
    });
    await expect(applyServerBatch(db, companyId, [createBlock, derived], { now })).rejects.toMatchObject({
      name: 'ServerBatchRejectedError',
      rejected: [{ op_id: derived.op_id, code: 'op_invalid' }],
    });
    const rows = await db.select({ id: entities.id }).from(entities).where(and(eq(entities.company_id, companyId), eq(entities.id, blockId)));
    expect(rows).toEqual([]);
    const logged = await db.select({ op_id: ops.op_id }).from(ops).where(inArray(ops.op_id, [createBlock.op_id, derived.op_id]));
    expect(logged).toEqual([]);
  });

  it('applies a clean batch whole, in order, with ascending seqs', async () => {
    const id = newId();
    const create = clientCreate(id);
    const rename = serverOp({ kind: 'put', scope: 'company', path: `registry/client/${id}/name`, value: 'Cliente renomeado' });
    const result = await applyServerBatch(db, companyId, [create, rename], { now });
    expect(result.rejected).toEqual([]);
    expect(result.applied.map((a) => a.op_id)).toEqual([create.op_id, rename.op_id]);
    expect(result.applied[1]!.seq).toBeGreaterThan(result.applied[0]!.seq);
    const [row] = await db.select({ row: entities.row }).from(entities).where(and(eq(entities.company_id, companyId), eq(entities.id, id)));
    expect((row?.row as { name: string }).name).toBe('Cliente renomeado');
  });
});

/**
 * A `Db` whose `failAt`-th insert into `ops` throws a plain Error, as a dropped connection
 * would: a transient failure, not a refusal. Nested transactions (savepoints) are wrapped too.
 */
function failingOnOpInsert(real: Db, failAt: number): Db {
  let inserts = 0;
  const wrap = <T extends object>(target: T): T =>
    new Proxy(target, {
      get(obj, prop, receiver) {
        if (prop === 'insert') {
          return (table: unknown) => {
            if (table === ops) {
              inserts += 1;
              if (inserts === failAt) throw new Error('connection terminated unexpectedly');
            }
            return (obj as unknown as Db).insert(table as typeof ops);
          };
        }
        if (prop === 'transaction') {
          return (callback: (tx: unknown) => Promise<unknown>) => (obj as unknown as Db).transaction((inner) => callback(wrap(inner)));
        }
        const value = Reflect.get(obj, prop, receiver) as unknown;
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(obj) : value;
      },
    });
  return wrap(real);
}

describe('E6-A1 applyOps: one transaction per push', () => {
  it('a transient error mid-push propagates and commits nothing of the push', async () => {
    const id = newId();
    const create = clientCreate(id);
    const rename = serverOp({ kind: 'put', scope: 'company', path: `registry/client/${id}/name`, value: 'Cliente renomeado' });
    const third = clientCreate(newId());
    await expect(applyOps(failingOnOpInsert(db, 3), companyId, [create, rename, third], { now, origin: 'server' })).rejects.toThrow(
      'connection terminated unexpectedly',
    );
    const logged = await db.select({ op_id: ops.op_id }).from(ops).where(inArray(ops.op_id, [create.op_id, rename.op_id, third.op_id]));
    expect(logged).toEqual([]);
    const rows = await db.select({ id: entities.id }).from(entities).where(and(eq(entities.company_id, companyId), eq(entities.id, id)));
    expect(rows).toEqual([]);

    // The retry of the same push lands whole, in order.
    const retried = await applyOps(db, companyId, [create, rename, third], { now, origin: 'server' });
    expect(retried.rejected).toEqual([]);
    expect(retried.applied.map((a) => a.op_id)).toEqual([create.op_id, rename.op_id, third.op_id]);
  });
});
