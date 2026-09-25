import { makeOp, type Op, type OpInput } from '@app/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { now } from '../clock.ts';
import { createDb } from '../db/client.ts';
import { asCompanyId } from '../db/repositories/company-id.ts';
import { entities, ops } from '../db/schema.ts';
import { newId } from '../ids.ts';
import { applyServerBatch, ServerBatchRejectedError } from './apply.ts';

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
