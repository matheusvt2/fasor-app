import type { EntityRow } from '@app/domain';
import { DeleteObjectsCommand, ListObjectVersionsCommand } from '@aws-sdk/client-s3';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.ts';
import { newId } from '../ids.ts';
import { createS3, putObject } from '../storage/s3.ts';
import { createDb } from './client.ts';
import { resetCompanyJobs } from './reset-company-jobs.ts';
import { resetTestCompany } from './reset-test-company.ts';
import { entities, ops, syncDevicePush } from './schema.ts';
import { resetTestCompanyData } from './seed.ts';
import { workerSeed } from './e2e-worker-seed.ts';
import { TEST_SEED } from './test-seed.ts';

/**
 * `resetTestCompanyData` is `scripts/test-reset.ts`'s single reset mechanism for the DB
 * rows (F-DUP-3): it must clear both `TEST_SEED` companies' `ops`, `entities` and
 * `sync_device_push` rows, and must not touch any other company's rows while doing it.
 */

const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const s3 = createS3(config);

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

  it('also empties an e2e worker company (E6-Q7), and no company it was not given', async () => {
    const now = new Date().toISOString();
    // An index no Playwright run reaches, so a live suite's pair is never touched.
    const worker = workerSeed(0xff02).companies[1].companyId;
    try {
      await plantRows(worker, now);
      await plantRows(OTHER_COMPANY_ID, now);

      await resetTestCompanyData(db, [worker]);

      expect(await db.select().from(ops).where(eq(ops.company_id, worker))).toEqual([]);
      expect(await db.select().from(entities).where(eq(entities.company_id, worker))).toEqual([]);
      expect(await db.select().from(syncDevicePush).where(eq(syncDevicePush.company_id, worker))).toEqual([]);
      expect(await db.select().from(ops).where(eq(ops.company_id, OTHER_COMPANY_ID))).toHaveLength(1);
    } finally {
      await resetTestCompanyData(db, [worker]);
      await db.delete(ops).where(eq(ops.company_id, OTHER_COMPANY_ID));
      await db.delete(entities).where(eq(entities.company_id, OTHER_COMPANY_ID));
      await db.delete(syncDevicePush).where(eq(syncDevicePush.company_id, OTHER_COMPANY_ID));
    }
  });

  it("deletes the company's pg-boss jobs keyed company_id or companyId, and no other company's", async () => {
    // `completed`, so the running api never picks a planted job up; an index no Playwright run reaches.
    const company = workerSeed(0xff03).companies[0].companyId;
    const plant = async (data: Record<string, string>): Promise<string> => {
      const [row] = await sql<{ id: string }[]>`insert into pgboss.job (name, data, state) values ('generate', ${JSON.stringify(data)}::jsonb, 'completed') returning id`;
      return row!.id;
    };
    const snake = await plant({ company_id: company });
    const camel = await plant({ companyId: company });
    const other = await plant({ company_id: OTHER_COMPANY_ID });
    try {
      await resetCompanyJobs(sql, company);

      const left = await sql<{ id: string }[]>`select id from pgboss.job where id in (${snake}, ${camel}, ${other})`;
      expect(left.map((row) => row.id)).toEqual([other]);
    } finally {
      await sql`delete from pgboss.job where id in (${snake}, ${camel}, ${other})`;
    }
  });
});

/** Every version and delete marker under a prefix (all pages). */
async function versionsUnder(prefix: string): Promise<{ Key: string; VersionId?: string }[]> {
  const out: { Key: string; VersionId?: string }[] = [];
  let keyMarker: string | undefined;
  let versionIdMarker: string | undefined;
  for (;;) {
    const page = await s3.send(new ListObjectVersionsCommand({ Bucket: config.S3_BUCKET, Prefix: prefix, KeyMarker: keyMarker, VersionIdMarker: versionIdMarker }));
    for (const entry of [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])]) out.push({ Key: entry.Key!, VersionId: entry.VersionId });
    if (page.IsTruncated !== true) return out;
    keyMarker = page.NextKeyMarker;
    versionIdMarker = page.NextVersionIdMarker;
  }
}

/*
 * Review 2026-09-30, E-3: `scripts/test-reset.ts <company>` resets that company alone. Its
 * object versions go (every listing page: the test lists two at a time over five objects of
 * two versions each), then its rows; the other test company's rows and objects stay.
 */
describe('E-3 test-reset of one company', () => {
  it("empties the named company's rows and every object version under its prefix, past one listing page, and leaves the other company alone", async () => {
    const [a, b] = TEST_SEED.companies;
    const now = new Date().toISOString();
    const probeA = `company/${a.companyId}/test-reset-probe/`;
    const probeB = `company/${b.companyId}/test-reset-probe/`;
    try {
      for (const company of TEST_SEED.companies) await plantRows(company.companyId, now);
      for (let n = 0; n < 5; n += 1) {
        await putObject(s3, config.S3_BUCKET, `${probeA}${n}`, new TextEncoder().encode(`first ${n}`), 'text/plain');
        await putObject(s3, config.S3_BUCKET, `${probeA}${n}`, new TextEncoder().encode(`second ${n}`), 'text/plain');
      }
      await putObject(s3, config.S3_BUCKET, `${probeB}kept`, new TextEncoder().encode('kept'), 'text/plain');
      expect((await versionsUnder(probeA)).length).toBe(10);

      await resetTestCompany({ db, sql, s3, bucket: config.S3_BUCKET, pageSize: 2 }, a.companyId);

      expect(await versionsUnder(`company/${a.companyId}/`)).toEqual([]);
      expect(await db.select().from(ops).where(eq(ops.company_id, a.companyId))).toEqual([]);
      expect(await db.select().from(entities).where(eq(entities.company_id, a.companyId))).toEqual([]);
      expect((await db.select().from(ops).where(eq(ops.company_id, b.companyId))).length).toBeGreaterThan(0);
      expect((await db.select().from(entities).where(eq(entities.company_id, b.companyId))).length).toBeGreaterThan(0);
      expect((await versionsUnder(probeB)).length).toBe(1);
      await expect(resetTestCompany({ db, sql, s3, bucket: config.S3_BUCKET }, OTHER_COMPANY_ID)).rejects.toThrow(/only resets the seeded test companies/);
    } finally {
      const planted = await versionsUnder(probeB);
      if (planted.length > 0) await s3.send(new DeleteObjectsCommand({ Bucket: config.S3_BUCKET, Delete: { Objects: planted } }));
      await resetTestCompanyData(db);
    }
  });
});
