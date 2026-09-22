import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { parseArgs } from './seed-users.ts';
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

  // The CLI's Postgres-touching happy path (`--test` actually provisioning the two
  // companies) moved to `apps/api/src/db/seed-cli.integration.test.ts` (F-GATE-2): this
  // file runs under `test:unit`, which must never open a database connection.

  it('parses long flags and bare switches', () => {
    expect(parseArgs(['--test'])).toEqual({ test: true });
    expect(parseArgs(['--email', 'a@b.c', '--council', 'crea', '--test'])).toEqual({
      email: 'a@b.c',
      council: 'crea',
      test: true,
    });
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

/**
 * Emoji and forbidden-document-word scan over the app tree (NFR-15, UX-DR6, epics.md DoD
 * clause 6: the deliverable is a "relatório", never the other word). Scoped to source under
 * `apps/`, `packages/`, `scripts/`, `e2e/` only, never
 * `_bmad-output/planning-artifacts/research/**` or `docs/context/**`, which legitimately
 * carry that other word and are outside these four roots anyway.
 *
 * The needle is assembled from characters, not written as a literal below: a literal would
 * trip this very file's own scan (this file necessarily discusses the word it forbids) and
 * would also self-match every time `pnpm test:unit` scans its own source.
 */
const SCAN_ROOTS = ['apps', 'packages', 'scripts', 'e2e'];
const SCAN_EXTENSIONS = /\.(tsx?|jsx?|html|css|sh|json|ya?ml)$/;
const SCAN_EXCLUDE_DIRS = new Set(['node_modules', 'dist', 'coverage', '.turbo']);
const FORBIDDEN_DOCUMENT_WORD = ['l', 'a', 'u', 'd', 'o'].join('');

/**
 * Pictographic emoji (the astral-plane blocks plus regional-indicator flags), and any BMP
 * symbol only when forced into emoji presentation by a trailing variation selector-16.
 * A plain arrow (`→`) or the mockup's CSS checkmark glyph (`✓`, `components.css`
 * content, byte-identical to the mock) are not emoji on their own and must not trip this.
 */
const EMOJI_PATTERN = /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}]|[☀-➿]\u{FE0F}/u;

function sourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (SCAN_EXCLUDE_DIRS.has(name)) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (SCAN_EXTENSIONS.test(name)) files.push(path);
    }
  };
  for (const dirName of SCAN_ROOTS) walk(join(root, dirName));
  return files;
}

describe('emoji and forbidden-document-word scans', () => {
  it('never introduces an emoji under apps/**, packages/**, scripts/**, e2e/**', () => {
    const offenders = sourceFiles()
      .filter((file) => EMOJI_PATTERN.test(readFileSync(file, 'utf8')))
      .map((file) => relative(root, file));
    expect(offenders, `emoji found in: ${offenders.join(', ')}`).toEqual([]);
  });

  it('never uses the forbidden word for the document under apps/**, packages/**, scripts/**, e2e/** (the word is "relatório")', () => {
    const pattern = new RegExp(FORBIDDEN_DOCUMENT_WORD, 'i');
    const offenders = sourceFiles()
      // This file itself is exempt: it is the only file allowed to name the forbidden word
      // (assembled above, never as a literal), because it is what scans for it.
      .filter((file) => file !== import.meta.filename)
      .filter((file) => pattern.test(readFileSync(file, 'utf8')))
      .map((file) => relative(root, file));
    expect(offenders, `forbidden word found in: ${offenders.join(', ')}`).toEqual([]);
  });
});
