import type { EntityRow } from '@app/domain';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.ts';
import { newId } from '../ids.ts';
import { createDb } from './client.ts';
import { entities, ops, syncDevicePush } from './schema.ts';
import { resetTestCompanyData } from './seed.ts';
import { TEST_SEED } from './test-seed.ts';

/**
 * `resetTestCompanyData` is `scripts/test-reset.ts`'s single reset mechanism for the DB
 * rows (F-DUP-3): it must clear both `TEST_SEED` companies' `ops`, `entities` and
 * `sync_device_push` rows, and must not touch any other company's rows while doing it.
 */

const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);

const OTHER_COMPANY_ID = '00000000-0000-7000-8000-0000000000ff';

afterAll(async () => {
  await sql.end();
});

async function plantRows(companyId: string, now: string): Promise<void> {
  await db.insert(ops).values({
    op_id: newId(),
    company_id: companyId,
    scope: 'company',
    kind: 'put',
    path: 'test-reset/probe',
    value: null,
    actor_id: 'test-reset-probe',
    device_id: 'test-reset-device',
    client_ts: now,
    received_at: now,
  });
  await db.insert(entities).values({
    company_id: companyId,
    entity: 'test_reset_probe',
    id: newId(),
    row: {} as EntityRow,
    updated_seq: 1,
  });
  await db
    .insert(syncDevicePush)
    .values({ company_id: companyId, user_id: 'test-reset-probe', device_id: 'test-reset-device', last_push_at: now })
    .onConflictDoNothing();
}

describe('resetTestCompanyData', () => {
  it('clears both TEST_SEED companies and leaves every other company alone', async () => {
    const now = new Date().toISOString();
    try {
      for (const company of TEST_SEED.companies) await plantRows(company.companyId, now);
      await plantRows(OTHER_COMPANY_ID, now);

      await resetTestCompanyData(db);

      for (const company of TEST_SEED.companies) {
        expect(await db.select().from(ops).where(eq(ops.company_id, company.companyId))).toEqual([]);
        expect(await db.select().from(entities).where(eq(entities.company_id, company.companyId))).toEqual([]);
        expect(await db.select().from(syncDevicePush).where(eq(syncDevicePush.company_id, company.companyId))).toEqual([]);
      }

      expect(await db.select().from(ops).where(eq(ops.company_id, OTHER_COMPANY_ID))).toHaveLength(1);
      expect(await db.select().from(entities).where(eq(entities.company_id, OTHER_COMPANY_ID))).toHaveLength(1);
      expect(await db.select().from(syncDevicePush).where(eq(syncDevicePush.company_id, OTHER_COMPANY_ID))).toHaveLength(1);
    } finally {
      // This probe row belongs to no real company and would otherwise linger and poison the
      // next run's `toHaveLength(1)` assertions above; clean it up even if an assertion threw.
      await db.delete(ops).where(eq(ops.company_id, OTHER_COMPANY_ID));
      await db.delete(entities).where(eq(entities.company_id, OTHER_COMPANY_ID));
      await db.delete(syncDevicePush).where(eq(syncDevicePush.company_id, OTHER_COMPANY_ID));
    }
  });

  it('narrows to the named test companies and refuses any other company', async () => {
    const now = new Date().toISOString();
    const [a, b] = TEST_SEED.companies;
    for (const company of TEST_SEED.companies) await plantRows(company.companyId, now);

    await resetTestCompanyData(db, [b.companyId]);

    expect(await db.select().from(ops).where(eq(ops.company_id, b.companyId))).toEqual([]);
    expect(await db.select().from(entities).where(eq(entities.company_id, b.companyId))).toEqual([]);
    expect((await db.select().from(ops).where(eq(ops.company_id, a.companyId))).length).toBeGreaterThan(0);
    await expect(resetTestCompanyData(db, [OTHER_COMPANY_ID])).rejects.toThrow(/only the test companies/);

    await resetTestCompanyData(db);
  });
});
