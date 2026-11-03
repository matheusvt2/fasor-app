import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
    const order = ['preflight', 'read the Terraform outputs', 'build the images', 'push the images', 'migrate', 'roll the services', 'wait until the services are stable', 'health', 'record'];
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
    // E15-A10: the calls after the roll that are safe to repeat go through the retry; run-task never does.
    expect(out).toMatch(/^DRY-RUN: aws_retry \S+\/infra\/bin\/aws ecs wait services-stable --cluster fasor-production --services api caddy ocr$/m);
    expect(out).toMatch(/^DRY-RUN: aws_retry \S+\/infra\/bin\/aws ssm get-parameter /m);
    expect(out).toMatch(/^DRY-RUN: aws_retry \S+\/infra\/bin\/aws ssm put-parameter .*--overwrite$/m);
    expect(out).toMatch(/^DRY-RUN: aws_retry \S+\/infra\/bin\/aws ecs describe-tasks /m);
    expect(out).not.toMatch(/aws_retry \S+ ecs run-task/);
    expect(out).not.toMatch(/to resume/);
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
  const SMOKE_STEPS = ['smoke: reset the test company', 'smoke: run the production suite', 'smoke: check the usage events', 'smoke: clean up the test company'];
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
    for (const title of [SMOKE_STEPS[0]!, SMOKE_STEPS[3]!]) {
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
    expect(headers(out).slice(-4)).toEqual(SMOKE_STEPS);
    expect(section(out, SMOKE_STEPS[3]!)).toMatch(/--task-definition fasor-production-smoke-seed /);
    // The suite ran, red: the usage events are still counted.
    expect(section(out, SMOKE_STEPS[2]!)).toMatch(/^telemetry: 1 session_start /m);
    expect(out).toContain('deploy: smoke failed at step: smoke: run the production suite');
    expect(out).toMatch(/deploy: report: \S+\/test-results\/production-smoke /);
    expect(out).toContain('deploy: to roll back: infra/bin/deploy --skip-build --skip-smoke --tag fedcba9876543210fedcba9876543210fedcba98');
    expect(out).not.toMatch(/production smoke passed/);
    // A red smoke is reported as one, never as a deploy to resume.
    expect(out).not.toMatch(/to resume/);
  });

  it('a failed reset skips the suite, still runs the cleanup, and reports both failures', () => {
    const { status, out } = run(['--dry-run'], { DEPLOY_DRY_RUN_SMOKE_SEED_EXIT: '1' });
    expect(status, out).toBe(1);
    expect(headers(out).slice(-4)).toEqual(SMOKE_STEPS);
    expect(section(out, SMOKE_STEPS[1]!)).toContain('not run: the reset failed');
    expect(section(out, SMOKE_STEPS[2]!)).toContain('not run: the suite did not run');
    expect(out).not.toMatch(/filter-log-events/);
    expect(section(out, SMOKE_STEPS[1]!)).not.toMatch(SUITE);
    expect(out).toContain("deploy: the smoke-seed task exited with '1'");
    expect(out).toContain('its log: group /fasor/production/smoke, stream smoke/smoke-seed/0123456789abcdef0123456789abcdef');
    expect(out).toContain('deploy: smoke failed at step: smoke: reset the test company');
    expect(out).toContain('deploy: smoke failed at step: smoke: clean up the test company');
    expect(out).toContain('deploy: to roll back: infra/bin/deploy --skip-build --skip-smoke --tag fedcba9876543210fedcba9876543210fedcba98');
    expect(out).not.toMatch(/to resume/);
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
    expect(out).not.toMatch(/to resume/);
  });

  it('--skip-smoke prints the four steps as skipped and runs none of them', () => {
    const { status, out } = run(['--dry-run', '--skip-smoke']);
    expect(status, out).toBe(0);
    expect(headers(out).slice(-4)).toEqual(SMOKE_STEPS);
    for (const title of SMOKE_STEPS) expect(section(out, title).trim()).toMatch(/^[^\n]*\nskipped by --skip-smoke/);
    expect(out).not.toMatch(/--task-definition fasor-production-smoke-seed|secretsmanager get-secret-value|pnpm smoke:production|filter-log-events/);
    expect(out).toMatch(/smoke skipped by --skip-smoke\)$/m);
  });
});

/*
 * E15-A10 (batch e18fb, 2026-11-03): the v0.3.0 deploy lost the ECS endpoint during
 * `ecs wait services-stable` right after the roll (exit 255, "Could not connect to the endpoint
 * URL") and `set -e` ended it before the tag record. The repeatable AWS calls are retried on
 * that message only, an exit after the roll names `--resume`, and `--resume` finishes a deploy
 * without building, migrating or rolling again.
 */
describe('E15-A10 aws_retry (infra/bin/lib.sh)', () => {
  const lib = resolve(root, 'infra/bin/lib.sh');
  /** A stub that fails `failures` times with `message` on stderr and exit `code`, then prints ok; its calls are counted. */
  function retry(failures: number, message: string, code = 255, attempts = '3') {
    const dir = mkdtempSync(join(tmpdir(), 'deploy-retry-'));
    try {
      const counter = join(dir, 'calls');
      const said = join(dir, 'message');
      const stub = join(dir, 'stub');
      writeFileSync(counter, '0');
      writeFileSync(said, `${message}\n`);
      writeFileSync(
        stub,
        `#!/usr/bin/env bash\nn=$(($(cat "${counter}") + 1)); echo "$n" > "${counter}"\nif [ "$n" -le ${failures} ]; then cat "${said}" >&2; exit ${code}; fi\necho "ok $* stdin=[$(cat)]"\n`,
      );
      chmodSync(stub, 0o755);
      // The caller's stdin holds text: the command must never read it (stdin /dev/null, so
      // infra/bin/aws never sees a terminal and never allocates one with -it).
      const result = spawnSync('bash', ['-c', '. "$1"; shift; aws_retry "$@"', 'retry', lib, stub, 'ecs', 'wait'], {
        encoding: 'utf8',
        input: 'the-callers-stdin\n',
        env: { PATH: '/usr/bin:/bin', HOME: tmpdir(), DEPLOY_RETRY_ATTEMPTS: attempts, DEPLOY_RETRY_PAUSE_S: '0' },
      });
      return { status: result.status, stdout: result.stdout, stderr: result.stderr, calls: Number(readFileSync(counter, 'utf8').trim()) };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  const LOST = 'aws: [ERROR]: Could not connect to the endpoint URL: "https://ecs.us-east-1.amazonaws.com/"';

  it('retries a lost endpoint (exit 255 and the message) and passes the stdout of the attempt that worked', () => {
    const result = retry(2, LOST);
    expect(result.status, result.stderr).toBe(0);
    expect(result.calls).toBe(3);
    // stdin is /dev/null: the stub read nothing of the caller's.
    expect(result.stdout).toBe('ok ecs wait stdin=[]\n');
    expect(result.stderr.match(/Could not connect to the endpoint URL/g)).toHaveLength(2);
    expect(result.stderr).toContain('lost the AWS endpoint (exit 255); attempt 3 of 3');
  });

  it.each([
    ['Connect timeout on endpoint URL: "https://ssm.us-east-1.amazonaws.com/"'],
    ['Read timeout on endpoint URL: "https://logs.us-east-1.amazonaws.com/"'],
    ['Connection was closed before we received a valid response from endpoint URL'],
  ])('retries the other connection message %s', (message) => {
    expect(retry(1, `aws: [ERROR]: ${message}`).calls).toBe(2);
  });

  it('never retries another exit 255 (a waiter out of attempts, AccessDenied) or the message under another exit', () => {
    const waiter = retry(5, 'Waiter ServicesStable failed: Max attempts exceeded');
    expect(waiter.status).toBe(255);
    expect(waiter.calls).toBe(1);
    expect(waiter.stderr).toContain('Max attempts exceeded');
    expect(retry(5, 'An error occurred (AccessDeniedException) when calling the DescribeServices operation').calls).toBe(1);
    expect(retry(5, LOST, 1).calls).toBe(1);
  });

  it('gives up after the bound with the exit and the stderr of the last attempt', () => {
    const result = retry(9, LOST);
    expect(result.status).toBe(255);
    expect(result.calls).toBe(3);
    expect(result.stdout).toBe('');
    expect(result.stderr.trimEnd().endsWith(LOST)).toBe(true);
  });
});

describe('E15-A10 infra/bin/deploy --dry-run, the resume hint and --resume', () => {
  const TAG = 'feedfacefeedfacefeedfacefeedfacefeedface';
  const section = (out: string, title: string) => out.split(/^==> \d+\. /m).find((part) => part.startsWith(title)) ?? '';

  it('a stable wait that fails after the roll prints the resume command and records nothing', () => {
    const { status, out } = run(['--dry-run'], { DEPLOY_DRY_RUN_STABLE_EXIT: '255' });
    expect(status, out).toBe(255);
    expect(out).toContain(`deploy: the roll to ${HEAD} started, but the deploy stopped before it finished`);
    expect(out).toContain(`deploy: to resume: infra/bin/deploy --resume --tag ${HEAD}`);
    expect(out).toContain(`deploy: (--resume refuses when a service does not run ${HEAD}; then rerun the deploy without it)`);
    expect(out).not.toMatch(/services were rolled|ssm put-parameter|smoke: reset/);
    // With --skip-smoke the hint keeps it.
    const skipped = run(['--dry-run', '--skip-smoke'], { DEPLOY_DRY_RUN_STABLE_EXIT: '255' });
    expect(skipped.out).toContain(`deploy: to resume: infra/bin/deploy --resume --tag ${HEAD} --skip-smoke`);
  });

  it('prints no resume hint when the deploy stops before the roll', () => {
    const { status, out } = run(['--dry-run'], { DEPLOY_DRY_RUN_MIGRATION_EXIT: '1' });
    expect(status).toBe(1);
    expect(out).not.toMatch(/to resume/);
  });

  it('--resume skips build, push, migrate and roll, checks every service runs the tag, then waits, checks health, records and smokes', () => {
    const { status, out } = run(['--dry-run', '--resume', '--tag', TAG]);
    expect(status, out).toBe(0);
    const steps = headers(out);
    for (const skipped of ['build the images', 'push the images', 'migrate', 'roll the services']) {
      const title = steps.find((step) => step.startsWith(skipped));
      expect(title, skipped).toBeDefined();
      expect(section(out, title!).trim()).toMatch(/^[^\n]*\nskipped by --resume$/);
    }
    const check = section(out, `check the services run ${TAG} (--resume)`);
    for (const service of ['api', 'caddy', 'ocr']) {
      expect(check).toMatch(new RegExp(`^DRY-RUN: aws_retry \\S+ ecs describe-services --cluster fasor-production --services ${service} `, 'm'));
      expect(check).toMatch(new RegExp(`^DRY-RUN: aws_retry \\S+ ecs describe-task-definition --task-definition \\S+-${service}:1 `, 'm'));
      expect(check).toContain(`${service} runs 673409896745.dkr.ecr.us-east-1.amazonaws.com/fasor/${service}:${TAG}`);
    }
    const after = steps.slice(steps.findIndex((step) => step.startsWith('check the services run')) + 1);
    expect(after.slice(0, 3).map((step) => step.split(':')[0])).toEqual(['wait until the services are stable', 'health', `record ${TAG} as the deployed tag`]);
    expect(after.slice(3)).toEqual(['smoke: reset the test company', 'smoke: run the production suite', 'smoke: check the usage events', 'smoke: clean up the test company']);
    expect(out).toMatch(new RegExp(`ssm put-parameter --name /fasor/production/image-tag --value ${TAG} --overwrite`));
    // Nothing that builds, pushes, migrates or rolls.
    expect(out).not.toMatch(/buildx|docker push|ecr describe-images|-target=aws_ecs_task_definition\.migrate|-auto-approve|--task-definition fasor-production-migrate/);
    expect(out).toMatch(/production smoke passed$/m);
  });

  it('--resume refuses a service that runs another tag, naming it, and records nothing', () => {
    const { status, out } = run(['--dry-run', '--resume', '--tag', TAG], { DEPLOY_DRY_RUN_RESUME_IMAGE_TAG: 'abad1dea' });
    expect(status).toBe(1);
    expect(out).toContain(`deploy: the service api runs 673409896745.dkr.ecr.us-east-1.amazonaws.com/fasor/api:abad1dea (task definition arn:aws:ecs:us-east-1:673409896745:task-definition/fasor-production-api:1), not the tag ${TAG}`);
    expect(out).not.toMatch(/ssm put-parameter|services-stable|smoke:|to resume/);
  });
});

/*
 * E18-A2 (batch e18fb, 2026-11-03): the smoke's step "check the usage events" counts, read-only,
 * the session_start events of this tag that reached the ux-events group since the deploy
 * started and the api's ux_event_sink_failed lines; it prints counts only and warns, never fails.
 */
describe('E18-A2 infra/bin/deploy --dry-run, the usage-events check', () => {
  const STEP = 'smoke: check the usage events';
  const section = (out: string, title: string) => out.split(/^==> \d+\. /m).find((part) => part.startsWith(title)) ?? '';
  /** The dry run prints each command with `printf %q`; this reads it back as typed. */
  const unquote = (text: string) => text.replace(/\\(.)/g, '$1');

  it('reads both groups from the outputs, filters by this tag since the deploy start, and prints the two counts', () => {
    const before = Math.floor(Date.now() / 1000) * 1000;
    const { status, out } = run(['--dry-run'], { SMOKE_PASSWORD: 'leak-check-password-0002' });
    const after = Date.now();
    expect(status, out).toBe(0);
    const text = unquote(section(out, STEP));
    expect(text).toMatch(/^DRY-RUN: \S+ production output -raw ux_events_log_group {2}-> \/fasor\/production\/ux-events$/m);
    expect(text).toMatch(/^DRY-RUN: \S+ production output -raw api_log_group {2}-> \/fasor\/production\/api$/m);
    const sessions = new RegExp(
      `^DRY-RUN: aws_retry \\S+ logs filter-log-events --log-group-name /fasor/production/ux-events --start-time (\\d{13}) --filter-pattern \\{ \\(\\$\\.name = "session_start"\\) && \\(\\$\\.app_version = "${HEAD}"\\) \\} --query length\\(events\\) --output json {2}-> 1$`,
      'm',
    ).exec(text);
    expect(sessions, text).not.toBeNull();
    const start = Number(sessions![1]);
    expect(start).toBeGreaterThanOrEqual(before);
    expect(start).toBeLessThanOrEqual(after);
    expect(text).toMatch(new RegExp(`^DRY-RUN: aws_retry \\S+ logs filter-log-events --log-group-name /fasor/production/api --start-time ${start} --filter-pattern "ux_event_sink_failed" --query length\\(events\\) --output json {2}-> 0$`, 'm'));
    const iso = new Date(start).toISOString().replace(/\.\d{3}Z$/, 'Z');
    expect(text).toContain(`telemetry: 1 session_start with app_version ${HEAD} since ${iso}; 0 ux_event_sink_failed`);
    expect(text).not.toMatch(/warning/);
    // Counts only: no event body, no password.
    expect(out).not.toContain('leak-check-password-0002');
    expect(text).not.toMatch(/"message"|@message|session_id|device_id|user_id/);
  });

  it.each([
    ['no session_start of this tag', { DEPLOY_DRY_RUN_TELEMETRY_SESSIONS: '0' }, /deploy: warning: 0 session_start with app_version \S+ in \/fasor\/production\/ux-events since /],
    ['sink failures in the api log', { DEPLOY_DRY_RUN_TELEMETRY_SINK_FAILURES: '3' }, /deploy: warning: 3 ux_event_sink_failed in \/fasor\/production\/api since /],
    ['a read error', { DEPLOY_DRY_RUN_TELEMETRY_SESSIONS: 'None' }, /deploy: warning: could not read the session_start events of \/fasor\/production\/ux-events/],
  ])('warns on %s and keeps the deploy green', (_label, env, warning) => {
    const { status, out } = run(['--dry-run'], env);
    expect(status, out).toBe(0);
    expect(section(out, STEP)).toMatch(warning);
    expect(section(out, STEP)).toContain("a warning only in this release; the deploy's exit is unchanged");
    expect(out).toMatch(/production smoke passed$/m);
  });
});
