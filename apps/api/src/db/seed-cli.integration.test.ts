import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `scripts/seed-users.ts --test` actually provisioning the two test companies against real
 * Postgres. Moved out of `scripts/tooling.test.ts` (F-GATE-2): `test:unit` must never open
 * a database connection, so this DB-touching case lives in the integration suite instead,
 * which already runs under docker-compose Postgres via `test:api`/`test:fast`.
 */
const root = resolve(import.meta.dirname, '../../../..');

describe('seed-users CLI', () => {
  it('provisions the two test companies through the CLI', () => {
    const result = spawnSync('pnpm', ['exec', 'tsx', 'scripts/seed-users.ts', '--test'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('seeded a@teste.local');
    expect(result.stdout).toContain('seeded b@teste.local');
  }, 120_000);
});
