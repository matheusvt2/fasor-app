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

/** Runs the deploy with stderr folded into stdout, so the output reads in the order it was written. */
function run(args: string[], env: Record<string, string> = {}) {
  const result = spawnSync('bash', ['-c', 'exec bash "$@" 2>&1', 'deploy', deploy, ...args], {
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
    // Review fixes 2026-09-30 (O-6): production ships the sidecar's runtime stage, never its test stage.
    expect(out).toMatch(/^DRY-RUN: docker buildx build --platform linux\/amd64 --target runtime -t \S*fasor\/ocr:/m);
    // A dry run never asks ECR whether the (immutable) tag is already there.
    expect(out).not.toMatch(/already in ECR/);
    expect(out).toMatch(/-target=aws_ecs_task_definition\.migrate/);
    expect(out).toMatch(/ecs run-task .*--launch-type EC2/);
    expect(out).toMatch(/ssm put-parameter .*--value 0123456789abcdef/);
    expect(out).not.toContain('stub must not run');
  });

  it('builds with podman, which has no buildx, when docker is not installed', () => {
    // A PATH with a podman stub and no docker: lib.sh picks podman (CONTAINER_CLI unset).
    const podmanStubs = mkdtempSync(join(tmpdir(), 'deploy-test-podman-'));
    try {
      for (const name of ['git', 'curl', 'podman']) {
        const file = join(podmanStubs, name);
        const body = name === 'git' ? `case "$*" in *status*) printf '' ;; *) echo ${HEAD} ;; esac` : 'echo "stub must not run in a dry run" >&2; exit 97';
        writeFileSync(file, `#!/usr/bin/env bash\n${body}\n`);
        chmodSync(file, 0o755);
      }
      const result = spawnSync('bash', [deploy, '--dry-run'], { encoding: 'utf8', env: { PATH: `${podmanStubs}:/usr/bin:/bin`, HOME: tmpdir() } });
      const out = `${result.stdout}${result.stderr}`;
      expect(result.status, out).toBe(0);
      // Epic 18: the api image's web bundle carries the tag as its usage events' `app_version`.
      expect(out).toMatch(/^DRY-RUN: podman build --platform linux\/amd64 -f \S*Dockerfile\.prod --build-arg VITE_APP_VERSION=0123456789abcdef0123456789abcdef01234567 -t \S*fasor\/api:0123456789abcdef/m);
      expect(out).toMatch(/^DRY-RUN: podman build --platform linux\/amd64 --target runtime -t \S*fasor\/ocr:/m);
      expect(out).toMatch(/^DRY-RUN: podman push .*fasor\/api:0123456789abcdef/m);
      expect(out).toMatch(/\| podman login --username AWS --password-stdin/);
      expect(out).not.toMatch(/buildx|--load|docker/);
      expect(out).not.toContain('stub must not run');
    } finally {
      rmSync(podmanStubs, { recursive: true, force: true });
    }
  });

  it('stops before the roll when the migration task exits non-zero', () => {
    const { status, out } = run(['--dry-run'], { DEPLOY_DRY_RUN_MIGRATION_EXIT: '1' });
    expect(status).toBe(1);
    expect(out).toContain("the migration task exited with '1'; the services were not rolled");
    expect(out).toContain('its log: group /fasor/production/migrate, stream migrate/migrate/0123456789abcdef0123456789abcdef');
    expect(headers(out).some((step) => step.startsWith('roll the services'))).toBe(false);
    expect(headers(out).some((step) => step.startsWith('smoke'))).toBe(false);
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

/*
 * Story 14.10 part 6: the production smoke after the record step. The suite's password comes
 * from Secrets Manager into the deploy's environment and reaches the container by name only,
 * so no line of a run (dry or not) ever holds it; the dry run prints `<secret>` in its place.
 */
describe('Story 14.10 part 6 infra/bin/deploy --dry-run, the production smoke', () => {
  const SMOKE_STEPS = ['smoke: reset the test company', 'smoke: run the production suite', 'smoke: clean up the test company'];
  const SUITE = /^DRY-RUN: (?:(?:lockf|flock) -[tw] 1800 \/tmp\/fasor-verify\.lock )?docker compose --profile tools run --rm --no-deps -e SMOKE_BASE_URL -e SMOKE_EMAIL -e SMOKE_PASSWORD tools pnpm smoke:production$/m;
  /** The lines between one step header and the next. */
  const section = (out: string, title: string) => out.split(/^==> \d+\. /m).find((part) => part.startsWith(title)) ?? '';

  it('runs the reset, the suite and the cleanup after the record step, each printing its command, and never prints a password', () => {
    // An operator's shell that happens to hold the variable: the deploy never prints it either.
    const { status, out } = run(['--dry-run'], { SMOKE_PASSWORD: 'leak-check-password-0001' });
    expect(status, out).toBe(0);
    const steps = headers(out);
    const record = steps.findIndex((step) => step.startsWith('record'));
    expect(record).toBeGreaterThan(-1);
    expect(steps.slice(record + 1)).toEqual(SMOKE_STEPS);
    for (const title of [SMOKE_STEPS[0]!, SMOKE_STEPS[2]!]) {
      expect(section(out, title)).toMatch(/^DRY-RUN: \S+ ecs run-task --cluster fasor-production --launch-type EC2 --task-definition fasor-production-smoke-seed /m);
    }
    const suite = section(out, SMOKE_STEPS[1]!);
    expect(suite).toMatch(/^DRY-RUN: \S+ secretsmanager get-secret-value --secret-id fasor-production\/smoke-user-password --query SecretString --output text {2}-> <secret>$/m);
    expect(suite).toMatch(SUITE);
    expect(out).not.toContain('leak-check-password-0001');
    expect(out).not.toMatch(/SMOKE_PASSWORD=/);
    // The previous tag is read before the new one is recorded, for the rollback hint.
    expect(section(out, 'record')).toMatch(/ssm get-parameter --name \/fasor\/production\/image-tag[^\n]*\n[^\n]*ssm put-parameter/);
    expect(out).toMatch(/production smoke passed$/m);
    expect(out).not.toContain('stub must not run');
  });

  it('a red suite still cleans up, names the failing step and the rollback to the previous tag, and exits 1', () => {
    const { status, out } = run(['--dry-run'], { DEPLOY_DRY_RUN_SMOKE_EXIT: '1' });
    expect(status, out).toBe(1);
    expect(headers(out).slice(-3)).toEqual(SMOKE_STEPS);
    expect(section(out, SMOKE_STEPS[2]!)).toMatch(/--task-definition fasor-production-smoke-seed /);
    expect(out).toContain('deploy: smoke failed at step: smoke: run the production suite');
    expect(out).toMatch(/deploy: report: \S+\/test-results\/production-smoke /);
    expect(out).toContain('deploy: to roll back: infra/bin/deploy --skip-build --skip-smoke --tag fedcba9876543210fedcba9876543210fedcba98');
    expect(out).not.toMatch(/production smoke passed/);
  });

  it('a failed reset skips the suite, still runs the cleanup, and reports both failures', () => {
    const { status, out } = run(['--dry-run'], { DEPLOY_DRY_RUN_SMOKE_SEED_EXIT: '1' });
    expect(status, out).toBe(1);
    expect(headers(out).slice(-3)).toEqual(SMOKE_STEPS);
    expect(section(out, SMOKE_STEPS[1]!)).toContain('not run: the reset failed');
    expect(section(out, SMOKE_STEPS[1]!)).not.toMatch(SUITE);
    expect(out).toContain("deploy: the smoke-seed task exited with '1'");
    expect(out).toContain('its log: group /fasor/production/smoke, stream smoke/smoke-seed/0123456789abcdef0123456789abcdef');
    expect(out).toContain('deploy: smoke failed at step: smoke: reset the test company');
    expect(out).toContain('deploy: smoke failed at step: smoke: clean up the test company');
    expect(out).toContain('deploy: to roll back: infra/bin/deploy --skip-build --skip-smoke --tag fedcba9876543210fedcba9876543210fedcba98');
  });

  it('a failed cleanup after a green reset and suite exits 1 with the cleanup line and no rollback hint', () => {
    const { status, out } = run(['--dry-run'], { DEPLOY_DRY_RUN_SMOKE_CLEANUP_EXIT: '1' });
    expect(status, out).toBe(1);
    expect(section(out, SMOKE_STEPS[0]!)).toContain('test company reset');
    expect(section(out, SMOKE_STEPS[1]!)).toContain('production suite passed');
    expect(out).toContain('deploy: smoke failed at step: smoke: clean up the test company');
    expect(out).not.toContain('smoke failed at step: smoke: reset the test company');
    expect(out).not.toContain('smoke failed at step: smoke: run the production suite');
    expect(out).not.toMatch(/production smoke passed/);
    expect(out).not.toMatch(/to roll back/);
  });

  it('--skip-smoke prints the three steps as skipped and runs none of them', () => {
    const { status, out } = run(['--dry-run', '--skip-smoke']);
    expect(status, out).toBe(0);
    expect(headers(out).slice(-3)).toEqual(SMOKE_STEPS);
    for (const title of SMOKE_STEPS) expect(section(out, title).trim()).toMatch(/^[^\n]*\nskipped by --skip-smoke/);
    expect(out).not.toMatch(/--task-definition fasor-production-smoke-seed|secretsmanager get-secret-value|pnpm smoke:production/);
    expect(out).toMatch(/smoke skipped by --skip-smoke\)$/m);
  });
});
