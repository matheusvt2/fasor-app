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
import { sampleRelatorioIds } from './sample-relatorio.ts';
import { SMALL_FIXTURE_RELATORIO_ID } from './test-fixtures.ts';
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

  it('seeds the small Porto Seguro relatório onto the named company with --sample-relatorio, under ids derived for it (review F-14)', async () => {
    const companyId = newId();
    const args = [
      '--company-id',
      companyId,
      '--company',
      'Empresa da Amostra',
      '--email',
      `amostra-${companyId}@teste.local`,
      '--password',
      TEST_SEED.password,
      '--name',
      'Amanda Amostra',
      '--council',
      'crea',
      '--number',
      'SP 14',
      '--sample-relatorio',
    ];
    try {
      const run = seedUsers(args);
      expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
      const { relatorioId } = sampleRelatorioIds(companyId);
      expect(relatorioId).not.toBe(SMALL_FIXTURE_RELATORIO_ID);
      expect(run.stdout).toContain(`seeded the sample relatório ${relatorioId} in company ${companyId}`);
      const userId = /as user (\S+) in company/.exec(run.stdout)?.[1];

      const [relatorio] = await db
        .select({ company_id: entities.company_id, row: entities.row })
        .from(entities)
        .where(and(eq(entities.entity, 'relatorio'), eq(entities.id, relatorioId)));
      expect(relatorio?.company_id).toBe(companyId);
      expect((relatorio?.row as { setup: { responsible_user_id: string | null } }).setup.responsible_user_id).toBe(userId);
      const blocks = await db
        .select({ id: entities.id })
        .from(entities)
        .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'block')));
      expect(blocks.length).toBeGreaterThan(0);
      // Nothing of the test fixture's fixed ids was planted in this company.
      expect(await db.select({ id: entities.id }).from(entities).where(and(eq(entities.company_id, companyId), eq(entities.id, SMALL_FIXTURE_RELATORIO_ID)))).toEqual([]);

      // A re-run replaces the company's own copy: the same rows, no second relatório.
      const again = seedUsers(args);
      expect(again.status, `${again.stdout}\n${again.stderr}`).toBe(0);
      const relatorios = await db
        .select({ id: entities.id })
        .from(entities)
        .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'relatorio')));
      expect(relatorios.map((row) => row.id)).toEqual([relatorioId]);
      const blocksAgain = await db
        .select({ id: entities.id })
        .from(entities)
        .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'block')));
      expect(blocksAgain.map((row) => row.id).sort()).toEqual(blocks.map((row) => row.id).sort());
    } finally {
      await dropCompany(db, companyId);
    }
  }, 180_000);
});
