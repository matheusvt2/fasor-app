import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { assertInCompose } from './test-reset.ts';

const root = resolve(import.meta.dirname, '..');
const eslint = new ESLint({ cwd: root });

async function violations(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: join(root, filePath) });
  return (result?.messages ?? []).filter((m) => m.severity === 2).map((m) => m.ruleId ?? 'fatal');
}

describe('import-direction lint rules', () => {
  it('fails domain importing an app', async () => {
    expect(await violations('packages/domain/src/probe.ts', "import x from '@app/web';\nexport { x };\n")).toContain('no-restricted-imports');
    expect(await violations('packages/domain/src/probe.ts', "import x from '../../../apps/api/src/main.ts';\nexport { x };\n")).toContain('no-restricted-imports');
  });

  it('fails web and api importing each other', async () => {
    expect(await violations('apps/web/src/surfaces/probe.ts', "import x from '@app/api';\nexport { x };\n")).toContain('no-restricted-imports');
    expect(await violations('apps/web/src/surfaces/probe.ts', "import x from '../../../../api/src/main.ts';\nexport { x };\n")).toContain('no-restricted-imports');
    expect(await violations('apps/api/src/probe.ts', "import x from '@app/web';\nexport { x };\n")).toContain('no-restricted-imports');
  });

  it('passes a permitted import', async () => {
    expect(await violations('apps/web/src/surfaces/probe.ts', "import { PRODUTO } from '@app/domain';\nexport { PRODUTO };\n")).toEqual([]);
  });
});

describe('fetch-location lint rule', () => {
  const code = "export const load = () => fetch('/api/health');\n";
  it('fails fetch outside sync, files and api', async () => {
    expect(await violations('apps/web/src/surfaces/probe.ts', code)).toContain('no-restricted-syntax');
    expect(await violations('apps/web/src/state/probe.ts', "export const load = () => window.fetch('/x');\n")).toContain('no-restricted-syntax');
  });

  it('passes fetch inside the three allowed directories', async () => {
    for (const dir of ['sync', 'files', 'api']) {
      expect(await violations(`apps/web/src/${dir}/probe.ts`, code)).toEqual([]);
    }
  });
});

describe('store-boundary lint rule', () => {
  it('fails a dexie import outside src/db and keeps the api ban there', async () => {
    expect(await violations('apps/web/src/surfaces/probe.ts', "import Dexie from 'dexie';\nexport { Dexie };\n")).toContain('no-restricted-imports');
    expect(await violations('apps/web/src/state/probe.ts', "import { useLiveQuery } from 'dexie-react-hooks';\nexport { useLiveQuery };\n")).toContain('no-restricted-imports');
    expect(await violations('apps/web/src/state/probe.ts', "import x from '@app/api';\nexport { x };\n")).toContain('no-restricted-imports');
  });

  it('passes a dexie import inside src/db', async () => {
    expect(await violations('apps/web/src/db/probe.ts', "import Dexie from 'dexie';\nexport { Dexie };\n")).toEqual([]);
    expect(await violations('apps/web/src/db/probe.ts', "import { useLiveQuery } from 'dexie-react-hooks';\nexport { useLiveQuery };\n")).toEqual([]);
  });
});

describe('test-reset guard', () => {
  it('refuses outside docker-compose', () => {
    expect(() => assertInCompose({}, () => true)).toThrow(/docker-compose/);
    expect(() => assertInCompose({ RUNNING_IN_COMPOSE: '1' }, () => false)).toThrow(/docker-compose/);
    expect(() => assertInCompose({ RUNNING_IN_COMPOSE: '1' }, () => true)).not.toThrow();
  });

  it('exits non-zero when run without the compose marker', () => {
    const result = spawnSync('pnpm', ['exec', 'tsx', 'scripts/test-reset.ts', 'c1'], {
      cwd: root,
      env: { ...process.env, RUNNING_IN_COMPOSE: '' },
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/docker-compose/);
  });
});

describe('naming', () => {
  it('never shows the codename in a user-visible web string', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(tsx?|html)$/.test(name) && !name.endsWith('.test.ts')) files.push(path);
      }
    };
    walk(join(root, 'apps/web/src'));
    files.push(join(root, 'apps/web/index.html'));
    for (const file of files) expect(readFileSync(file, 'utf8').toLowerCase()).not.toContain('fasor');
  });
});
