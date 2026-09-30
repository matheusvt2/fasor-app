import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/*
 * Story 11.8: the gates of `infra/bin/deploy`, exercised through its dry run, which touches
 * no AWS, Terraform or registry. `git`, `docker` and `curl` are stubs on PATH, so the test
 * runs the same in a worktree (whose git directory is outside the container) and needs no
 * Docker daemon.
 */

const root = resolve(import.meta.dirname, '..');
const deploy = resolve(root, 'infra/bin/deploy');
const HEAD = '0123456789abcdef0123456789abcdef01234567';

let stubs: string;

beforeAll(() => {
  stubs = mkdtempSync(join(tmpdir(), 'deploy-test-'));
  const stub = (name: string, body: string) => {
    const file = join(stubs, name);
    writeFileSync(file, `#!/usr/bin/env bash\n${body}\n`);
    chmodSync(file, 0o755);
  };
  // `git status --porcelain` prints DEPLOY_TEST_DIRTY; everything else is HEAD.
  stub('git', `case "$*" in *status*) printf '%s' "\${DEPLOY_TEST_DIRTY:-}" ;; *) echo ${HEAD} ;; esac`);
  stub('docker', 'echo "docker stub must not run in a dry run" >&2; exit 97');
  stub('curl', 'echo "curl stub must not run in a dry run" >&2; exit 97');
});

afterAll(() => rmSync(stubs, { recursive: true, force: true }));

function run(args: string[], env: Record<string, string> = {}) {
  const result = spawnSync('bash', [deploy, ...args], {
    encoding: 'utf8',
    env: { PATH: `${stubs}:/usr/bin:/bin`, HOME: tmpdir(), ...env },
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

const headers = (out: string) => [...out.matchAll(/^==> \d+\. (.*)$/gm)].map((match) => match[1] ?? '');

describe('Story 11.8 infra/bin/deploy --dry-run', () => {
  it('runs build, push, migrate, roll, health and record in that order, touching nothing', () => {
    const { status, out } = run(['--dry-run']);
    expect(status, out).toBe(0);
    const steps = headers(out);
    const index = (prefix: string) => steps.findIndex((step) => step.startsWith(prefix));
    const order = ['preflight', 'read the Terraform outputs', 'build the images', 'push the images', 'migrate', 'roll the services', 'health', 'record'];
    const positions = order.map(index);
    expect(positions, steps.join('\n')).not.toContain(-1);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    // Every real action is only printed.
    expect(out).toMatch(/^DRY-RUN: docker buildx build --platform linux\/amd64 /m);
    expect(out).toMatch(/^DRY-RUN: docker push .*fasor\/api:0123456789abcdef/m);
    expect(out).toMatch(/-target=aws_ecs_task_definition\.migrate/);
    expect(out).toMatch(/ecs run-task .*--launch-type EC2/);
    expect(out).toMatch(/ssm put-parameter .*--value 0123456789abcdef/);
    expect(out).not.toContain('stub must not run');
  });

  it('stops before the roll when the migration task exits non-zero', () => {
    const { status, out } = run(['--dry-run'], { DEPLOY_DRY_RUN_MIGRATION_EXIT: '1' });
    expect(status).toBe(1);
    expect(out).toContain("the migration task exited with '1'; the services were not rolled");
    expect(headers(out).some((step) => step.startsWith('roll the services'))).toBe(false);
    expect(out).not.toMatch(/ssm put-parameter/);
  });

  it('refuses a tag other than HEAD when it has to build', () => {
    const { status, out } = run(['--dry-run', '--tag', 'feedfacefeedfacefeedfacefeedfacefeedface']);
    expect(status).toBe(1);
    expect(out).toContain('is not HEAD');
    expect(out).not.toMatch(/buildx/);
  });

  it('reports a dirty tree, which a real run refuses', () => {
    const { status, out } = run(['--dry-run'], { DEPLOY_TEST_DIRTY: ' M apps/api/src/main.ts' });
    expect(status).toBe(0);
    expect(out).toContain('a real run would refuse here');
  });

  it('refuses a dirty tree on a real run before any build or AWS call', () => {
    const { status, out } = run([], { DEPLOY_TEST_DIRTY: ' M apps/api/src/main.ts' });
    expect(status).toBe(1);
    expect(out).toContain('uncommitted changes');
    expect(out).not.toContain('stub must not run');
  });
});
