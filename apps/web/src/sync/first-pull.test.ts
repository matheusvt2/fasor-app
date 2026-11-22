import 'fake-indexeddb/auto';
import { makeOp, systemRoleRow, SYSTEM_ROLE_ROW_IDS, type Op, type SyncPullResponse } from '@app/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { localRoleOf } from '../db/sync-store.ts';
import { openDatabase, type AppDatabase } from '../db/schema.ts';
import { SyncRequestError, type SyncClient } from './client.ts';
import { FIRST_PULL_WAIT_MS, firstCompanyPull } from './first-pull.ts';

/*
 * Story 26.10 (the sign-in's first company pull, deferred row of Story 26.5): the user's own row and
 * role row are on the device when the pull ends; offline, a failure and the bound never stop the sign-in.
 */

const COMPANY = '019966c1-0526-7000-8000-0000000000c0';
const USER = '019966c1-0526-7000-8000-000000000001';

let counter = 0;
let db: AppDatabase | null = null;

async function freshDb(): Promise<AppDatabase> {
  db = openDatabase(`019966c1-0527-7000-8000-${(++counter + 0x200).toString(16).padStart(12, '0')}`);
  await db.open();
  return db;
}

afterEach(() => {
  db?.close();
  db = null;
});

const ids = (() => {
  let n = 0;
  return () => `019966c1-0527-7000-8000-${(++n + 0x900).toString(16).padStart(12, '0')}`;
})();

/** A company op the server would send: `user/{id}` with a role, and the role row itself. */
function companyOps(): Op[] {
  const base = { scope: 'company' as const, company_id: COMPANY, relatorio_id: null, project_id: null, prev_op_id: null, batch_id: null, meta: null, device_id: 'server' };
  const deps = { newId: ids, now: new Date('2026-11-22T10:00:00.000Z') };
  const role = systemRoleRow('engenheiro_de_campo');
  const roleOp = makeOp({ ...base, kind: 'create', path: `role/${role.id}`, value: role, actor_id: 'system:admin' }, deps);
  const userOp = makeOp(
    {
      ...base,
      kind: 'create',
      path: `user/${USER}`,
      value: { id: USER, name: 'Carla', email: 'c@t.local', council: null, registration_number: null, title: null, photo_location_enabled: true, role_id: role.id, status: 'active' },
      actor_id: 'system:identity',
    },
    deps,
  );
  return [roleOp, userOp].map((op, index) => ({ ...op, seq: index + 1 }));
}

function client(overrides: Partial<SyncClient>): { client: SyncClient; calls: number[] } {
  const calls: number[] = [];
  const base = {
    pullCompany: async (since: number): Promise<SyncPullResponse> => {
      calls.push(since);
      return { ops: [], seq: 0, summary: { last_push_at: [], relatorios: [] } } as unknown as SyncPullResponse;
    },
  };
  return { client: { ...base, ...overrides } as unknown as SyncClient, calls };
}

describe('26.10-WEB-FIRSTPULL the sign-in finishes the first company pull', () => {
  it('brings the user row and the role row to IndexedDB, so the role is known locally when it ends', async () => {
    const database = await freshDb();
    expect(await localRoleOf(database, USER)).toBeNull();
    const ops = companyOps();
    const { client: fake, calls } = client({
      pullCompany: async (since) => {
        calls.push(since);
        return { ops: since === 0 ? ops : [], seq: 2, summary: { last_push_at: [], relatorios: [] } } as unknown as SyncPullResponse;
      },
    });
    expect(await firstCompanyPull(database, { online: true, client: fake })).toBe(true);
    expect(calls).toEqual([0]);
    expect((await localRoleOf(database, USER))?.id).toBe(SYSTEM_ROLE_ROW_IDS.engenheiro_de_campo);
    const state = await database.sync_state.get('company');
    expect(state?.complete).toBe(true);
  });

  it('offline: no request, no wait, the sign-in goes on', async () => {
    const database = await freshDb();
    const { client: fake, calls } = client({});
    expect(await firstCompanyPull(database, { online: false, client: fake })).toBe(false);
    expect(calls).toEqual([]);
  });

  it('a pull that hangs is cut at the bound and the sign-in goes on', async () => {
    const database = await freshDb();
    const { client: fake } = client({ pullCompany: () => new Promise<SyncPullResponse>(() => {}) });
    const started = Date.now();
    expect(await firstCompanyPull(database, { online: true, waitMs: 60, client: fake })).toBe(false);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('a pull the server refuses (a 401) ends at once, recorded by the engine, and never throws', async () => {
    const database = await freshDb();
    const { client: fake } = client({
      pullCompany: async () => {
        throw new SyncRequestError({ kind: 'http', status: 401 });
      },
    });
    await expect(firstCompanyPull(database, { online: true, waitMs: 2_000, client: fake })).resolves.toBe(true);
  });

  it('the bound is ten seconds', () => {
    expect(FIRST_PULL_WAIT_MS).toBe(10_000);
  });
});
