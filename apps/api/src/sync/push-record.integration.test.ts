import { makeOp, syncPushResponseSchema } from '@app/domain';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { now } from '../clock.ts';
import { loadConfig } from '../config.ts';
import { createDb } from '../db/client.ts';
import { asCompanyId } from '../db/repositories/company-id.ts';
import { entities, ops } from '../db/schema.ts';
import type { AppEnv } from '../http/session.ts';
import { newId } from '../ids.ts';

/*
 * Review 2026-09-30, A-15: the push's "last push" stamp (`recordPush`) runs after the ops
 * committed. When it throws, the route still answers 200 with the apply result (a 500 would
 * make the device send ops the server already holds) and logs the failure. `recordPush` is
 * replaced by one that fails as a pool timeout would.
 */

vi.mock('./pull.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./pull.ts')>()),
  recordPush: vi.fn(async () => {
    throw new Error('timeout exceeded when trying to connect');
  }),
}));

const { createSyncRoutes } = await import('./routes.ts');

const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const companyId = asCompanyId(newId());
const userId = newId();

const app = new Hono<AppEnv>();
app.use('*', async (c, next) => {
  c.set('session', { userId, companyId });
  await next();
});
app.route('/', createSyncRoutes(db, { now }));

afterAll(async () => {
  await db.delete(ops).where(eq(ops.company_id, companyId));
  await db.delete(entities).where(eq(entities.company_id, companyId));
  await sql.end();
});

describe('A-15 a failed push stamp never fails the push', () => {
  it('answers 200 with the applied op and logs the failure', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const projectId = newId();
      const op = makeOp(
        { scope: 'company', company_id: companyId, project_id: null, relatorio_id: null, batch_id: null, meta: null, actor_id: userId, kind: 'create', path: `project/${projectId}`, value: { id: projectId, client_id: null, name: 'Obra A-15', site: null, removed_at: null }, prev_op_id: null, device_id: 'tablet-a15' },
        { newId, now: now() },
      );
      const res = await app.request('/api/sync/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ops: [op] }) });
      expect(res.status, await res.clone().text()).toBe(200);
      expect(syncPushResponseSchema.parse(await res.json()).applied.map((a) => a.op_id)).toEqual([op.op_id]);
      const lines = errors.mock.calls.map((args) => JSON.parse(String(args[0])) as { msg: string; device_id?: string });
      expect(lines.find((line) => line.msg === 'push not recorded')).toMatchObject({ device_id: 'tablet-a15' });
    } finally {
      errors.mockRestore();
    }
  });
});
