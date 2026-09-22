import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { parseArgs, resolveCompanyId, validateCompanyId } from './seed-users.ts';
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

describe('seed-users CLI', () => {
  it('refuses outside docker-compose and names the requirement', () => {
    const result = spawnSync('pnpm', ['exec', 'tsx', 'scripts/seed-users.ts', '--test'], {
      cwd: root,
      env: { ...process.env, RUNNING_IN_COMPOSE: '' },
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/docker-compose/);
    expect(result.stderr).toMatch(/seed-users/);
  });

  it('provisions the two test companies through the CLI', () => {
    const result = spawnSync('pnpm', ['exec', 'tsx', 'scripts/seed-users.ts', '--test'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('seeded a@teste.local');
    expect(result.stdout).toContain('seeded b@teste.local');
  }, 120_000);

  it('accepts only a uuidv7 company id and shows a v7 example otherwise', () => {
    const v7 = '019966b0-5b6d-7e7f-9a0b-1c2d3e4f5a6b';
    expect(validateCompanyId(v7)).toBe(v7);
    const example = '019966b0-0000-7000-8000-00000000abcd';
    expect(() => validateCompanyId('8f3a2c1e-5b6d-4e7f-8a9b-0c1d2e3f4a5b', () => example)).toThrow(/uuidv7/);
    expect(() => validateCompanyId('8f3a2c1e-5b6d-4e7f-8a9b-0c1d2e3f4a5b', () => example)).toThrow(example);
    expect(() => validateCompanyId('acme')).toThrow(/uuidv7/);
  });

  it('mints a uuidv7 company id when --company-id is left out, and validates a supplied one', () => {
    const example = '019966b0-0000-7000-8000-00000000abcd';
    expect(resolveCompanyId({ company: 'Acme' }, () => example)).toEqual({ companyId: example, minted: true });
    const v7 = '019966b0-5b6d-7e7f-9a0b-1c2d3e4f5a6b';
    expect(resolveCompanyId({ 'company-id': v7 })).toEqual({ companyId: v7, minted: false });
    expect(() => resolveCompanyId({ 'company-id': '8f3a2c1e-5b6d-4e7f-8a9b-0c1d2e3f4a5b' })).toThrow(/uuidv7/);
    expect(() => resolveCompanyId({ 'company-id': true })).toThrow(/missing --company-id/);
  });

  it('exits non-zero on a v4 company id before touching the database', () => {
    const result = spawnSync(
      'pnpm',
      [
        'exec',
        'tsx',
        'scripts/seed-users.ts',
        '--company-id',
        '8f3a2c1e-5b6d-4e7f-8a9b-0c1d2e3f4a5b',
        '--company',
        'Acme',
        '--email',
        'v4@acme.test',
        '--password',
        'uma-senha-qualquer-1',
        '--name',
        'Ana',
        '--council',
        'crea',
        '--number',
        'SP 1',
      ],
      // An unreachable database: the refusal must come before any connection is attempted.
      { cwd: root, env: { ...process.env, DATABASE_URL: 'postgres://nobody@127.0.0.1:1/none' }, encoding: 'utf8' },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/uuidv7/);
    expect(result.stderr).toMatch(/--company-id [0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/);
  });

  it('parses long flags and bare switches', () => {
    expect(parseArgs(['--test'])).toEqual({ test: true });
    expect(parseArgs(['--email', 'a@b.c', '--council', 'crea', '--test'])).toEqual({
      email: 'a@b.c',
      council: 'crea',
      test: true,
    });
  });
});

describe('A7: derived text lives in the kernel', () => {
  it('apps/web writes no pt-BR status word and no singular-or-plural ternary of its own', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(path);
      }
    };
    walk(join(root, 'apps/web/src'));
    // A status word as a whole string literal ("Rascunho encontrado" is another string).
    const statusWord = /(['"`])(Rascunho|Em campo|Em revisão|Emitido)\1/;
    const pluralTernary = /===\s*1\s*\?/;
    const offenders: string[] = [];
    for (const file of files) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (statusWord.test(line) || pluralTernary.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
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
