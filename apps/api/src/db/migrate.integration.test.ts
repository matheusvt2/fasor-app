import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.ts';
import { newId } from '../ids.ts';
import { createDb } from './client.ts';
import { migrate, migrationsFolder } from './migrate.ts';

/*
 * `migrate()` on a database of its own: created empty by this file and dropped after it, so
 * the forward-only migrations run from the first one, as on a fresh volume, without touching
 * the database every other suite shares.
 */

const config = loadConfig();
const admin = createDb(config.DATABASE_URL);
const scratchName = `migrate_test_${newId().replaceAll('-', '')}`;
const scratchUrl = (() => {
  const url = new URL(config.DATABASE_URL);
  url.pathname = `/${scratchName}`;
  return url.toString();
})();
let scratch: ReturnType<typeof createDb> | null = null;

interface Journal {
  entries: { idx: number; when: number; tag: string }[];
}
const journal = JSON.parse(readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8')) as Journal;

beforeAll(async () => {
  await admin.sql.unsafe(`create database "${scratchName}"`);
  scratch = createDb(scratchUrl);
}, 30_000);

afterAll(async () => {
  await scratch?.sql.end();
  await admin.sql.unsafe(`drop database if exists "${scratchName}" with (force)`);
  await admin.sql.end();
});

async function applied(): Promise<number[]> {
  const rows = await scratch!.sql`select created_at from drizzle.__drizzle_migrations order by id`;
  return rows.map((row) => Number(row.created_at));
}

describe('migrate() on a fresh database', () => {
  it('applies every journal entry, and a second run applies nothing and does not throw', async () => {
    expect(journal.entries.length).toBeGreaterThan(0);
    await migrate(scratch!.db);
    expect(await applied()).toEqual(journal.entries.map((entry) => entry.when));
    const [table] = await scratch!.sql`select to_regclass('public.entities') as name`;
    expect(table?.name).not.toBeNull();

    await expect(migrate(scratch!.db)).resolves.toBeUndefined();
    expect(await applied()).toEqual(journal.entries.map((entry) => entry.when));
  }, 60_000);
});
