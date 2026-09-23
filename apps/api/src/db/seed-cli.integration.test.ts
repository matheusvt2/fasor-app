import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { STANDARD_TEMPLATE_NAME } from '@app/domain';
import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.ts';
import { newId } from '../ids.ts';
import { createDb } from './client.ts';
import { entities } from './schema.ts';
import { dropCompany } from './test-cleanup.ts';
import { TEST_SEED } from './test-seed.ts';

/**
 * `scripts/seed-users.ts --test` actually provisioning the two test companies against real
 * Postgres. Moved out of `scripts/tooling.test.ts` (F-GATE-2): `test:unit` must never open
 * a database connection, so this DB-touching case lives in the integration suite instead,
 * which already runs under docker-compose Postgres via `test:api`/`test:fast`.
 */
const root = resolve(import.meta.dirname, '../../../..');

const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);

afterAll(async () => {
  await sql.end();
});

function seedUsers(args: string[]) {
  return spawnSync('pnpm', ['exec', 'tsx', 'scripts/seed-users.ts', ...args], { cwd: root, encoding: 'utf8' });
}

describe('seed-users CLI', () => {
  it('provisions the two test companies through the CLI', () => {
    const result = seedUsers(['--test']);
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('seeded a@teste.local');
    expect(result.stdout).toContain('seeded b@teste.local');
  }, 120_000);

  it('seeds the standard template once with --standard-template, however often it runs (Story 3.2)', async () => {
    const companyId = newId();
    const args = [
      '--company-id',
      companyId,
      '--company',
      'Empresa da Flag',
      '--email',
      `flag-${companyId}@teste.local`,
      '--password',
      TEST_SEED.password,
      '--name',
      'Flávia Flag',
      '--council',
      'crea',
      '--number',
      'SP 9',
      '--standard-template',
    ];
    try {
      const first = seedUsers(args);
      expect(first.status, `${first.stdout}\n${first.stderr}`).toBe(0);
      expect(first.stdout).toContain('seeded the standard template');
      const second = seedUsers(args);
      expect(second.status, `${second.stdout}\n${second.stderr}`).toBe(0);
      expect(second.stdout).toContain('already has the standard template');

      const live = await db
        .select({ row: entities.row })
        .from(entities)
        .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'template'), isNull(entities.removed_at)));
      expect(live.map((t) => (t.row as { name: string }).name)).toEqual([STANDARD_TEMPLATE_NAME]);
    } finally {
      await dropCompany(db, companyId);
    }
  }, 120_000);
});
