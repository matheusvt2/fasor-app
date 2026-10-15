import { resolve } from 'node:path';

/*
 * Story 14.10 part 6: what the production smoke needs from its caller (`infra/bin/deploy`,
 * through `-e NAME` on the tools container, never a value on a command line): the deployed
 * URL and the smoke user's credentials (`infra/production/smoke.tf`). Missing, the run stops
 * before a browser starts, naming each one; the password is never printed.
 */

export const SMOKE_VARIABLES = ['SMOKE_BASE_URL', 'SMOKE_EMAIL', 'SMOKE_PASSWORD'] as const;

export interface SmokeEnv {
  baseURL: string;
  email: string;
  password: string;
}

/** The variables of `SMOKE_VARIABLES` that are unset or blank in `env`. */
export function missingSmokeVariables(env: Record<string, string | undefined>): string[] {
  return SMOKE_VARIABLES.filter((name) => (env[name] ?? '').trim() === '');
}

/** The smoke's input, or an error naming every missing variable. */
export function readSmokeEnv(env: Record<string, string | undefined>): SmokeEnv {
  const missing = missingSmokeVariables(env);
  if (missing.length > 0) {
    throw new Error(`production smoke: missing ${missing.join(', ')} (infra/bin/deploy sets them; see infra/PUBLISHING.md)`);
  }
  return { baseURL: env.SMOKE_BASE_URL!.trim().replace(/\/+$/, ''), email: env.SMOKE_EMAIL!.trim(), password: env.SMOKE_PASSWORD! };
}

/** Where the run writes: the JSON report, the progress file, the traces of a failure. */
export const SMOKE_RESULTS_DIR = resolve(import.meta.dirname, '../../test-results/production-smoke');

/** Each step of the suite appends its name here when it starts, so the last line names where a red run stopped. */
export const SMOKE_PROGRESS_FILE = resolve(SMOKE_RESULTS_DIR, 'progress.txt');
