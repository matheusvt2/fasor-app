import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/*
 * Batch e18fb (2026-11-03, ledger row "Deferred from: the Epic 19 deploy"): `infra/bin/check`
 * runs `init` and `validate` in a data dir of its own, through `infra/bin/tf`, which passes
 * INFRA_TF_DATA_DIR into the container as TF_DATA_DIR and never forwards a TF_DATA_DIR of the
 * operator's shell. A `docker` stub on PATH prints the env file `tf` hands the container.
 */

const root = resolve(import.meta.dirname, '..');
const tf = resolve(root, 'infra/bin/tf');
let stubs: string;

beforeAll(() => {
  stubs = mkdtempSync(join(tmpdir(), 'infra-tf-test-'));
  const docker = join(stubs, 'docker');
  writeFileSync(docker, '#!/usr/bin/env bash\nwhile [ $# -gt 0 ]; do if [ "$1" = --env-file ]; then cat "$2"; fi; shift; done\n');
  chmodSync(docker, 0o755);
});

afterAll(() => rmSync(stubs, { recursive: true, force: true }));

/** The env file `infra/bin/tf` gives the container, offline (no session export). */
function envFile(env: Record<string, string>): string {
  const result = spawnSync('bash', [tf, 'production', 'validate'], {
    encoding: 'utf8',
    env: { PATH: `${stubs}:/usr/bin:/bin`, HOME: tmpdir(), TF_OFFLINE: '1', ...env },
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
}

describe('infra/bin/tf and infra/bin/check, the data dir of the offline check', () => {
  it('passes INFRA_TF_DATA_DIR into the container as TF_DATA_DIR', () => {
    expect(envFile({ INFRA_TF_DATA_DIR: '.terraform/check' }).split('\n')).toContain('TF_DATA_DIR=.terraform/check');
  });

  it('passes no TF_DATA_DIR when it is unset, and never the operator\'s own TF_DATA_DIR', () => {
    expect(envFile({})).not.toMatch(/TF_DATA_DIR/);
    expect(envFile({ TF_DATA_DIR: '/somewhere/else' })).not.toMatch(/TF_DATA_DIR/);
  });

  it('infra/bin/check runs init and validate with that variable on .terraform/check', () => {
    const check = readFileSync(resolve(root, 'infra/bin/check'), 'utf8');
    expect(check).toMatch(/^check_data_dir=\.terraform\/check$/m);
    expect(check).toMatch(/check "terraform init \$stack" env INFRA_TF_DATA_DIR="\$check_data_dir" "\$bin\/tf" "\$stack" init -backend=false /);
    expect(check).toMatch(/check "terraform validate \$stack" env INFRA_TF_DATA_DIR="\$check_data_dir" "\$bin\/tf" "\$stack" validate /);
  });
});
