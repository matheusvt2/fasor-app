import {
  instantiateTemplate,
  makeOp,
  parsePath,
  sheetCellAt,
  standardTemplate,
  syncPushResponseSchema,
  type BlockRow,
  type JsonValue,
  type Op,
  type OpDraft,
} from '@app/domain';
import { and, eq, sql as dsql } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { now } from '../clock.ts';
import { loadConfig } from '../config.ts';
import { createDb } from '../db/client.ts';
import { asCompanyId } from '../db/repositories/company-id.ts';
import { entities, ops, syncDevicePush } from '../db/schema.ts';
import type { AppEnv } from '../http/session.ts';
import { newId } from '../ids.ts';
import { applyOps, lockCompany, type Tx } from './apply.ts';
import { createSyncRoutes } from './routes.ts';

/*
 * Review 2026-09-30, A-10: the mark-blind check of a push (E10-Q6: a client older than the
 * mark-aware contract that writes a cell holding a conflict mark is answered 426, nothing
 * applied) reads the rows under the company lock the apply takes. A mark stamped by a push
 * that commits while this one waits for the lock is seen, never cleared by the old client.
 * The route runs in-process on a throwaway company, its session set by a stand-in middleware.
 */

const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const companyId = asCompanyId(newId());
const userId = newId();
const DEVICE = 'tablet-a10-old-client';

const app = new Hono<AppEnv>();
app.use('*', async (c, next) => {
  c.set('session', { userId, companyId });
  await next();
});
app.route('/', createSyncRoutes(db, { now }));

let relatorioId = '';
let blockId = '';
let otherBlockId = '';
const measured = (raw: string): JsonValue => ({ raw, unit: 'MΩ', state: 'measured' });
const cellPath = () => `sheet/${blockId}/test/isolacao/cell/0/0`;

function deviceOp(draft: Omit<OpDraft, 'company_id' | 'actor_id' | 'scope' | 'project_id' | 'relatorio_id' | 'meta' | 'batch_id'> & Partial<OpDraft>): Op {
  return makeOp(
    { scope: 'relatorio', company_id: companyId, project_id: null, relatorio_id: relatorioId, batch_id: null, meta: null, actor_id: userId, ...draft, device_id: DEVICE },
    { newId, now: now() },
  );
}

beforeAll(async () => {
  const projectId = newId();
  const template = standardTemplate({ id: newId() });
  const built = instantiateTemplate(
    template,
    { id: projectId },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null },
    { newId, actorId: userId, companyId },
  );
  relatorioId = built.relatorioId;
  const project = makeOp(
    { scope: 'company', company_id: companyId, project_id: null, relatorio_id: null, batch_id: null, meta: null, actor_id: userId, kind: 'create', path: `project/${projectId}`, value: { id: projectId, client_id: null, name: 'Obra A-10', site: null, removed_at: null }, prev_op_id: null, device_id: DEVICE },
    { newId, now: now() },
  );
  const created = built.drafts.map((draft) => makeOp({ ...draft, device_id: DEVICE }, { newId, now: now() }));
  const result = await applyOps(db, companyId, [project, ...created], { now, origin: 'client', actorId: userId });
  expect(result.rejected).toEqual([]);
  const chaves = created.map((op) => op.value as Record<string, unknown>).filter((row) => row.block_type === 'chave_seccionadora' && typeof row.equipment_id === 'string');
  blockId = chaves[0]!.id as string;
  otherBlockId = chaves[1]!.id as string;
  const first = await applyOps(db, companyId, [deviceOp({ kind: 'put', path: cellPath(), value: measured('1'), prev_op_id: null })], { now, origin: 'client', actorId: userId });
  expect(first.rejected).toEqual([]);
}, 60_000);

afterAll(async () => {
  await db.delete(ops).where(eq(ops.company_id, companyId));
  await db.delete(entities).where(eq(entities.company_id, companyId));
  await db.delete(syncDevicePush).where(eq(syncDevicePush.company_id, companyId));
  await sql.end();
});

/** True once some backend waits on an advisory lock (the push, queued behind the one held here). */
async function aPushWaitsOnTheLock(): Promise<boolean> {
  const rows = await db.execute(dsql`select count(*)::int as n from pg_stat_activity where wait_event_type = 'Lock' and wait_event = 'advisory'`);
  return ((rows as unknown as { n: number }[])[0]?.n ?? 0) > 0;
}

describe('A-10 the mark-blind check runs under the company lock', () => {
  it('a conflict mark committed while an old client push waits for the lock answers that push 426, the mark kept', async () => {
    const put = deviceOp({ kind: 'put', path: cellPath(), value: measured('7'), prev_op_id: null });
    let response: Promise<Response> | null = null;
    await db.transaction(async (tx: Tx) => {
      await lockCompany(tx, companyId);
      // The old client (no contract header) pushes a plain put on the cell while the lock is held.
      response = Promise.resolve(app.request('/api/sync/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ops: [put] }) }));
      const deadline = Date.now() + 10_000;
      while (!(await aPushWaitsOnTheLock())) {
        if (Date.now() > deadline) throw new Error('the push never waited for the lock');
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      // Another device's push stamps the mark on that cell and commits (this transaction).
      const [record] = await tx
        .select({ row: entities.row })
        .from(entities)
        .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'block'), eq(entities.id, blockId)));
      const row = structuredClone(record!.row) as BlockRow;
      const cell = sheetCellAt(row.sheet, parsePath(cellPath()))!;
      (cell as { conflict?: unknown }).conflict = { op_id: newId(), value: measured('330'), source_suggestion_id: null };
      await tx.update(entities).set({ row }).where(and(eq(entities.company_id, companyId), eq(entities.entity, 'block'), eq(entities.id, blockId)));
    });
    const res = await response!;
    expect(res.status, await res.clone().text()).toBe(426);
    const [after] = await db
      .select({ row: entities.row })
      .from(entities)
      .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'block'), eq(entities.id, blockId)));
    expect(sheetCellAt((after!.row as BlockRow).sheet, parsePath(cellPath()))?.conflict).toBeDefined();
    const logged = await db.select({ op_id: ops.op_id }).from(ops).where(eq(ops.op_id, put.op_id));
    expect(logged).toEqual([]);
  }, 30_000);

  it('an old client push on an unmarked cell still applies', async () => {
    const other = `sheet/${otherBlockId}/test/isolacao/cell/0/0`;
    const put = deviceOp({ kind: 'put', path: other, value: measured('8'), prev_op_id: null });
    const res = await app.request('/api/sync/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ops: [put] }) });
    expect(res.status, await res.clone().text()).toBe(200);
    expect(syncPushResponseSchema.parse(await res.json()).applied.map((a) => a.op_id)).toEqual([put.op_id]);
  });
});
