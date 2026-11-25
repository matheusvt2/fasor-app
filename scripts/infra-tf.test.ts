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

/*
 * Story 30.2 A (L1296): each Bedrock model id of `infra/production/variables.tf` is validated by the shape of a
 * Bedrock model or inference-profile id (an optional `global.` or region prefix, a provider, a dot, a model name);
 * the prose and escalation ids also accept empty, as their descriptions say. The condition is Terraform's
 * `can(regex(...))`; its pattern is read from the file and run here (RE2 and JavaScript agree on it), against
 * today's defaults, the example tfvars and the typos of the story. Terraform itself refuses a typo at plan
 * (the PR pastes that run).
 */
const MODEL_VARIABLES = ['bedrock_model_id', 'bedrock_panel_model_id', 'bedrock_prose_model_id', 'bedrock_escalation_model_id'] as const;
const EMPTY_ALLOWED = new Set(['bedrock_prose_model_id', 'bedrock_escalation_model_id']);

function variableBlock(name: string): string {
  const text = readFileSync(resolve(root, 'infra/production/variables.tf'), 'utf8');
  const start = text.indexOf(`variable "${name}" {`);
  expect(start, `variable ${name}`).toBeGreaterThanOrEqual(0);
  const end = text.indexOf('\n}\n', start);
  return text.slice(start, end);
}

/** The variable's validation, as a function of a value: the `regex` pattern of its condition, and whether "" passes. */
function validationOf(name: string): (value: string) => boolean {
  const block = variableBlock(name);
  const condition = /condition\s*=\s*(.+)/.exec(block)?.[1] ?? '';
  const pattern = /regex\("((?:[^"\\]|\\.)*)"/.exec(condition)?.[1];
  expect(pattern, `${name} has no regex in its validation: ${condition}`).toBeDefined();
  const re = new RegExp(pattern!.replace(/\\\\/g, '\\'));
  const empty = /var\.\w+\s*==\s*""/.test(condition);
  return (value) => (value === '' ? empty : re.test(value));
}

function defaultOf(name: string): string {
  return /default\s*=\s*"([^"]*)"/.exec(variableBlock(name))![1]!;
}

describe('30.2-UNIT-A: the Bedrock model ids are validated by their shape', () => {
  it('today\'s defaults and the example tfvars pass', () => {
    const example = readFileSync(resolve(root, 'infra/production/terraform.tfvars.example'), 'utf8');
    for (const name of MODEL_VARIABLES) {
      const valid = validationOf(name);
      expect(valid(defaultOf(name)), `${name} default`).toBe(true);
      const sample = new RegExp(`^#\\s*${name}\\s*=\\s*"([^"]*)"`, 'm').exec(example)?.[1];
      expect(sample, `${name} in the example`).toBeDefined();
      expect(valid(sample!), `${name} example`).toBe(true);
    }
    for (const id of ['anthropic.claude-haiku-4-5-20251001-v1:0', 'us.anthropic.claude-haiku-4-5-20251001-v1:0', 'eu.amazon.nova-pro-v1:0', 'apac.amazon.nova-lite-v1:0', 'qwen.qwen3-vl-235b-a22b', 'meta.llama3-1-70b-instruct-v1:0']) {
      expect(validationOf('bedrock_model_id')(id), id).toBe(true);
    }
  });

  it('a mistyped id is refused (a missing dot, a space, a stray character); empty only where the description allows it', () => {
    for (const name of MODEL_VARIABLES) {
      const valid = validationOf(name);
      for (const typo of ['anthropicclaude-haiku-4-5', 'global.anthropic claude-haiku-4-5', ' qwen.qwen3-vl', 'us.amazon.nova-pro-v1:0 ', 'global..anthropic.claude', 'us.amazon.', '.amazon.nova-pro']) {
        expect(valid(typo), `${name}: "${typo}"`).toBe(false);
      }
      expect(valid(''), `${name}: ""`).toBe(EMPTY_ALLOWED.has(name));
    }
  });
});

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
