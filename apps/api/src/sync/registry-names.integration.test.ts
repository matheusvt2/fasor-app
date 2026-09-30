import { SERVER_DEVICE_ID, toIso, type Op } from '@app/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { now } from '../clock.ts';
import { loadConfig } from '../config.ts';
import type { Db } from '../db/client.ts';
import { asCompanyId } from '../db/repositories/company-id.ts';
import { entities, ops, schema } from '../db/schema.ts';
import { newId } from '../ids.ts';
import { applyOps } from './apply.ts';

/*
 * Review 2026-09-30, A-1: a push's registry creates read the live manufacturer and
 * voltage_class rows once per kind, not once per create, and the merge rule (AR-18: a create
 * whose normalized name a live row of the kind already holds merges onto it) answers exactly
 * as before: within one push, after a batch savepoint rolled back, and after another op
 * renamed a row of the kind. Every push here runs on a throwaway company.
 */

const config = loadConfig();
/** The query text of every statement the counting client sent. */
const statements: string[] = [];
const client = postgres(config.DATABASE_URL, { max: 5, onnotice: () => {}, debug: (_connection, query) => statements.push(query) });
const db = drizzle(client, { schema }) as unknown as Db;
const companyId = asCompanyId(newId());
const ACTOR = 'system:registry-cache-test';

afterAll(async () => {
  await db.delete(ops).where(eq(ops.company_id, companyId));
  await db.delete(entities).where(eq(entities.company_id, companyId));
  await client.end();
});

type Kind = 'manufacturer' | 'voltage_class';

function registryOp(input: { kind: Op['kind']; path: string; value: unknown; batchId?: string }): Op {
  return {
    op_id: newId(),
    kind: input.kind,
    scope: 'company',
    company_id: companyId,
    project_id: null,
    relatorio_id: null,
    path: input.path,
    value: input.value as Op['value'],
    prev_op_id: null,
    batch_id: input.batchId ?? null,
    meta: null,
    actor_id: ACTOR,
    device_id: SERVER_DEVICE_ID,
    client_ts: toIso(now()),
  };
}

function create(kind: Kind, id: string, name: string, batchId?: string): Op {
  return registryOp({ kind: 'create', path: `registry/${kind}/${id}`, value: { id, kind, name, gender: null, number: null, removed_at: null }, ...(batchId === undefined ? {} : { batchId }) });
}

async function liveIds(ids: readonly string[]): Promise<string[]> {
  const rows = await db
    .select({ id: entities.id, removed_at: entities.removed_at })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'registry'), inArray(entities.id, [...ids])));
  return rows
    .filter((row) => row.removed_at === null)
    .map((row) => row.id)
    .sort();
}

const candidateQueries = () => statements.filter((text) => text.includes(`->>'kind' =`)).length;

describe('A-1 the registry names of a push', () => {
  it('reads each kind once per push, however many creates it carries', async () => {
    await applyOps(db, companyId, Array.from({ length: 5 }, (_, n) => create('manufacturer', newId(), `Existente ${n}`)), { now, origin: 'server' });
    statements.length = 0;
    const push = [
      ...Array.from({ length: 20 }, (_, n) => create('manufacturer', newId(), `Novo ${n}`)),
      ...Array.from({ length: 3 }, (_, n) => create('voltage_class', newId(), `${n + 10} kV`)),
    ];
    const result = await applyOps(db, companyId, push, { now, origin: 'server' });
    expect(result.rejected).toEqual([]);
    expect(candidateQueries()).toBe(2);
  });

  it('merges a second create of the same normalized name in the same push onto the first', async () => {
    const [first, second] = [newId(), newId()];
    const result = await applyOps(db, companyId, [create('manufacturer', first, 'Schneider Electric'), create('manufacturer', second, '  SCHNEIDER electric ')], { now, origin: 'server' });
    expect(result.rejected).toEqual([]);
    expect(await liveIds([first, second])).toEqual([first]);
  });

  it('forgets a create its batch savepoint rolled back: a later create of that name is not merged onto a row that does not exist', async () => {
    const [rolledBack, later] = [newId(), newId()];
    const batchId = newId();
    const refused = registryOp({ kind: 'create', path: `registry/manufacturer/${newId()}`, value: { kind: 'manufacturer', name: 42 }, batchId });
    const result = await applyOps(db, companyId, [create('manufacturer', rolledBack, 'Legrand Brasil', batchId), refused, create('manufacturer', later, 'LEGRAND BRASIL')], { now, origin: 'server' });
    expect(result.rejected.map((r) => r.code)).toEqual(['op_invalid', 'op_invalid']);
    expect(await liveIds([rolledBack, later])).toEqual([later]);
  });

  it('reads the kind again after another op on one of its rows: a renamed row no longer takes its old name, and takes its new one', async () => {
    const [renamed, oldName, newName] = [newId(), newId(), newId()];
    const result = await applyOps(
      db,
      companyId,
      [
        create('manufacturer', renamed, 'WEG Antigo'),
        registryOp({ kind: 'put', path: `registry/manufacturer/${renamed}/name`, value: 'WEG Novo' }),
        create('manufacturer', oldName, 'weg antigo'),
        create('manufacturer', newName, 'WEG NOVO'),
      ],
      { now, origin: 'server' },
    );
    expect(result.rejected).toEqual([]);
    expect(await liveIds([renamed, oldName, newName])).toEqual([renamed, oldName].sort());
  });
});
