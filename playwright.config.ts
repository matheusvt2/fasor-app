import { defineConfig, devices } from '@playwright/test';
import { NON_SERIAL_SPEC_PATTERN, PARALLEL_WORKERS, readGroup, SERIAL_SPEC_PATTERN } from './e2e/support/groups.ts';

/**
 * One server: `vite preview` on 5200 over the `build:e2e` bundle, for every project.
 *
 * The durability suite needs the real build: under `vite dev` the document references
 * `/src/main.tsx` and an unbounded module graph, so an app-shell precache there could not
 * boot offline and the test would assert a lie (AR-7).
 *
 * The other suites ran on the Vite dev server until E5-A1. There every fresh context (one
 * per test) fetched and compiled about 240 modules on each navigation: 2 s idle and 4-6 s
 * under load, so a test with five navigations spent its 30 s budget on page loads and the
 * gate timed out whenever the machine was busy. `build:e2e` is a development-mode build
 * (React dev, `import.meta.env.DEV` true, the dev-only fixture route in it), so the specs
 * see the same app, loaded in about 0.5 s. `desktop-chrome` blocks service workers: no
 * spec there tests the shell cache, and a precached shell would change what a reload
 * offline or a routed request means for them.
 */
/**
 * E6-Q7: the suite runs in two groups (`e2e/support/groups.ts`), which `scripts/e2e.ts`
 * runs one after the other with `E2E_GROUP` set: `parallel` on `PARALLEL_WORKERS` workers,
 * each on its own pair of companies (the `seed` fixture), then `serial` on one worker for
 * the specs that share the document queue or a fixed-id fixture. A bare `playwright test`
 * (no group) runs every spec on one worker, so no invocation puts a serial spec beside a
 * parallel worker. `--workers=N` still overrides the parallel group's count.
 */
const group = readGroup(process.env.E2E_GROUP);
const groupIgnore = group === 'parallel' ? [SERIAL_SPEC_PATTERN] : group === 'serial' ? [NON_SERIAL_SPEC_PATTERN] : [];
const label = group ?? 'all';

export default defineConfig({
  testDir: 'e2e',
  // `list` for the terminal; the JSON report per group is what `scripts/e2e.ts` counts
  // (tests, outcomes, titles) for the run's summary.
  reporter: [['list'], ['json', { outputFile: `test-results/e2e-report/${label}.json` }]],
  // Each group keeps its own artifacts: the serial run must not clean the parallel run's.
  outputDir: group === undefined ? 'test-results' : `test-results/${group}`,
  workers: group === 'parallel' ? PARALLEL_WORKERS : 1,
  globalSetup: './e2e/support/global-setup.ts',
  globalTeardown: './e2e/support/global-teardown.ts',
  use: { baseURL: 'http://localhost:5200' },
  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'], serviceWorkers: 'block' },
      testIgnore: [/durability\.spec\.ts/, ...groupIgnore],
    },
    // NFR-17: the three FR-54 scenarios on desktop Chrome, Android Chrome emulation and
    // WebKit, all against the built bundle.
    {
      name: 'durability-desktop-chrome',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /durability\.spec\.ts/,
      testIgnore: groupIgnore,
    },
    {
      name: 'durability-android-chrome',
      use: { ...devices['Galaxy Tab S4 landscape'] },
      testMatch: /durability\.spec\.ts/,
      testIgnore: groupIgnore,
    },
    {
      name: 'durability-webkit',
      use: { ...devices['Desktop Safari'] },
      testMatch: /durability\.spec\.ts/,
      testIgnore: groupIgnore,
    },
  ],
  webServer: [
    {
      // `build:e2e` builds in development mode: a real bundle, with hashed assets and a
      // stamped `sw.js`, but with `import.meta.env.DEV` true so the dev-only field
      // fixture the scenarios drive is in it. `build` (what the prod profile runs) stays
      // a production build, and the fixture route is absent from its output.
      // `scripts/e2e.ts` builds once for both groups and sets `E2E_PREBUILT=1`.
      command:
        process.env.E2E_PREBUILT === '1'
          ? 'pnpm --filter @app/web exec vite preview --port 5200 --strictPort'
          : 'pnpm --filter @app/web run build:e2e && pnpm --filter @app/web exec vite preview --port 5200 --strictPort',
      url: 'http://localhost:5200',
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
