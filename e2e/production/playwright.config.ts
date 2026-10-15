import { defineConfig, devices } from '@playwright/test';
import { readSmokeEnv, SMOKE_RESULTS_DIR } from './smoke-env.ts';

/**
 * Story 14.10 part 6: the production smoke, run by `infra/bin/deploy` after every deploy
 * (`pnpm smoke:production` in the tools container) against the deployed URL, signed in as the
 * dedicated test user. It is excluded from every local command: its tests are `*.smoke.ts`,
 * which no project of the root `playwright.config.ts` collects (`scripts/e2e.test.ts` pins
 * it), and nothing here starts a web server, seeds a database or runs a global setup: the
 * deploy's `smoke-seed` task resets the test company before the run and after it.
 *
 * One worker, no retries: a red step is a red deploy, reported as it happened. The variables
 * are checked before any browser starts (`--list` alone runs without them).
 */
const listing = process.argv.includes('--list');
const env = listing ? null : readSmokeEnv(process.env);

export default defineConfig({
  testDir: '.',
  testMatch: /\.smoke\.ts$/,
  forbidOnly: true,
  workers: 1,
  retries: 0,
  fullyParallel: false,
  reporter: [['list'], ['json', { outputFile: `${SMOKE_RESULTS_DIR}/report.json` }]],
  outputDir: `${SMOKE_RESULTS_DIR}/artifacts`,
  // Production answers over the network: an action waits up to 30 s, a navigation 60 s, and
  // the steps that wait on a sync, a reading or a document give their own budgets.
  timeout: 20 * 60_000,
  expect: { timeout: 15_000 },
  use: {
    ...devices['Desktop Chrome'],
    ...(env === null ? {} : { baseURL: env.baseURL }),
    // The run checks the server's flows, not the app-shell cache (the durability suite does).
    serviceWorkers: 'block',
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    // No trace: it would record the password typed into the sign-in form. A failure keeps
    // its screenshot under artifacts/.
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'production-chrome' }],
});
