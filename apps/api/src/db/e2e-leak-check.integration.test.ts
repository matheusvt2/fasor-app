import type { EntityRow } from '@app/domain';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.ts';
import { newId } from '../ids.ts';
import { createDb } from './client.ts';
import { describeE2eLeaks, findE2eLeaks } from './e2e-leak-check.ts';
import { isE2eWorkerCompany, workerIndexOfCompany, workerIndexOfUser, workerSeed } from './e2e-worker-seed.ts';
import { entities, ops, syncDevicePush } from './schema.ts';
import { LEGACY_TEST_COMPANY_IDS, TEST_SEED } from './test-seed.ts';

/**
 * E6-Q7: the leak check the Playwright global teardown runs. A worker user's op, push row
 * or entity reference inside its own pair is fine; the same row in another worker's pair
 * or in a `TEST_SEED` company is a leak, named by table, user, path and company.
 *
 * The probes use worker indexes no Playwright run reaches (0xff00 and up), so the test
 * never collides with a suite's live pairs; the assertions look only at the probes' users.
 */

const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);

const mine = workerSeed(0xff00);
const theirs = workerSeed(0xff01);
const probeUsers = [mine.companies[0].userId, mine.companies[1].userId];
const probeCompanies = [
  mine.companies[0].companyId,
  mine.companies[1].companyId,
  theirs.companies[0].companyId,
  TEST_SEED.companies[0].companyId,
];

afterAll(async () => {
  await cleanUp();
  await sql.end();
});

async function cleanUp(): Promise<void> {
  await db.delete(ops).where(inArray(ops.actor_id, probeUsers));
  await db.delete(syncDevicePush).where(inArray(syncDevicePush.user_id, probeUsers));
  for (const companyId of probeCompanies) {
    const rows = await db.select({ id: entities.id, entity: entities.entity }).from(entities).where(eq(entities.company_id, companyId));
    const probes = rows.filter((row) => row.entity === 'e2e_leak_probe').map((row) => row.id);
    if (probes.length > 0) await db.delete(entities).where(inArray(entities.id, probes));
  }
}

async function plantOp(companyId: string, actorId: string, path: string): Promise<void> {
  const now = new Date().toISOString();
  await db.insert(ops).values({
    op_id: newId(),
    company_id: companyId,
    scope: 'company',
    kind: 'put',
    path,
    value: null,
    actor_id: actorId,
    device_id: 'e2e-leak-probe',
    client_ts: now,
    received_at: now,
  });
}

async function plantEntity(companyId: string, createdBy: string): Promise<string> {
  const id = newId();
  await db.insert(entities).values({
    company_id: companyId,
    entity: 'e2e_leak_probe',
    id,
    row: { id, created_by: createdBy } as unknown as EntityRow,
    updated_seq: 1,
  });
  return id;
}

describe('the e2e worker id scheme', () => {
  it('derives deterministic uuidv7 ids per index that never meet TEST_SEED or the legacy ids', () => {
    expect(workerSeed(2)).toEqual(workerSeed(2));
    const ids = [0, 1, 2].flatMap((index) => workerSeed(index).companies.flatMap((c) => [c.companyId, c.userId]));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const fixed: string[] = [...LEGACY_TEST_COMPANY_IDS, ...TEST_SEED.companies.flatMap((c) => [c.companyId, c.userId])];
    for (const id of fixed) {
      expect(ids).not.toContain(id);
      expect(isE2eWorkerCompany(id)).toBe(false);
    }
    expect(workerIndexOfCompany(workerSeed(7).companies[1].companyId)).toBe(7);
    expect(workerIndexOfUser(workerSeed(7).companies[0].userId)).toBe(7);
    expect(workerIndexOfUser(workerSeed(7).companies[0].companyId)).toBeNull();
  });
});

describe('findE2eLeaks', () => {
  it('passes rows inside the pair and names every row a worker user wrote outside it', async () => {
    const [a, b] = mine.companies;
    try {
      // Inside the pair: the user of A writing into A and into B is the normal case.
      await plantOp(a.companyId, a.userId, 'probe/own-a');
      await plantOp(b.companyId, a.userId, 'probe/own-b');
      await plantEntity(b.companyId, a.userId);
      let leaks = (await findE2eLeaks(db)).filter((leak) => probeUsers.includes(leak.userId));
      expect(leaks).toEqual([]);

      // Another worker's company, and a TEST_SEED company.
      await plantOp(theirs.companies[0].companyId, a.userId, 'probe/other-worker');
      await plantOp(TEST_SEED.companies[0].companyId, b.userId, 'probe/test-seed');
      const entityId = await plantEntity(theirs.companies[0].companyId, b.userId);
      await db.insert(syncDevicePush).values({
        company_id: TEST_SEED.companies[0].companyId,
        user_id: a.userId,
        device_id: 'e2e-leak-probe',
        last_push_at: new Date().toISOString(),
      });

      leaks = (await findE2eLeaks(db)).filter((leak) => probeUsers.includes(leak.userId));
      expect(leaks).toHaveLength(4);
      expect(leaks).toEqual(
        expect.arrayContaining([
          { table: 'ops', companyId: theirs.companies[0].companyId, userId: a.userId, what: 'probe/other-worker' },
          { table: 'ops', companyId: TEST_SEED.companies[0].companyId, userId: b.userId, what: 'probe/test-seed' },
          { table: 'entities', companyId: theirs.companies[0].companyId, userId: b.userId, what: `e2e_leak_probe/${entityId}` },
          { table: 'sync_device_push', companyId: TEST_SEED.companies[0].companyId, userId: a.userId, what: 'e2e-leak-probe' },
        ]),
      );
      const message = describeE2eLeaks(leaks);
      expect(message).toContain(`user ${a.userId} wrote probe/other-worker into company ${theirs.companies[0].companyId}`);
    } finally {
      await cleanUp();
    }
  });
});
