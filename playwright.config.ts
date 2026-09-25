import { defineConfig, devices } from '@playwright/test';

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
export default defineConfig({
  testDir: 'e2e',
  reporter: 'list',
  // The specs share the two seeded users, so they run one at a time.
  workers: 1,
  globalSetup: './e2e/support/global-setup.ts',
  use: { baseURL: 'http://localhost:5200' },
  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'], serviceWorkers: 'block' },
      testIgnore: /durability\.spec\.ts/,
    },
    // NFR-17: the three FR-54 scenarios on desktop Chrome, Android Chrome emulation and
    // WebKit, all against the built bundle.
    {
      name: 'durability-desktop-chrome',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /durability\.spec\.ts/,
    },
    {
      name: 'durability-android-chrome',
      use: { ...devices['Galaxy Tab S4 landscape'] },
      testMatch: /durability\.spec\.ts/,
    },
    {
      name: 'durability-webkit',
      use: { ...devices['Desktop Safari'] },
      testMatch: /durability\.spec\.ts/,
    },
  ],
  webServer: [
    {
      // `build:e2e` builds in development mode: a real bundle, with hashed assets and a
      // stamped `sw.js`, but with `import.meta.env.DEV` true so the dev-only field
      // fixture the scenarios drive is in it. `build` (what the prod profile runs) stays
      // a production build, and the fixture route is absent from its output.
      command: 'pnpm --filter @app/web run build:e2e && pnpm --filter @app/web exec vite preview --port 5200 --strictPort',
      url: 'http://localhost:5200',
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
