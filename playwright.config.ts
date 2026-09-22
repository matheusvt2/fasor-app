import { defineConfig, devices } from '@playwright/test';

/**
 * Two servers, because two kinds of spec need two kinds of bundle.
 *
 * The suites merged before Story 1.8 run on the Vite dev server on 5199, exactly as
 * they did. The durability suite runs on `vite preview` on 5200 over the real build:
 * under `vite dev` the document references `/src/main.tsx` and an unbounded module
 * graph, so an app-shell precache there could not boot offline and the test would
 * assert a lie (AR-7).
 */
export default defineConfig({
  testDir: 'e2e',
  reporter: 'list',
  // The specs share the two seeded users, so they run one at a time.
  workers: 1,
  globalSetup: './e2e/support/global-setup.ts',
  use: { baseURL: 'http://localhost:5199' },
  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /durability\.spec\.ts/,
    },
    // NFR-17: the three FR-54 scenarios on desktop Chrome, Android Chrome emulation and
    // WebKit, all against the built bundle.
    {
      name: 'durability-desktop-chrome',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5200' },
      testMatch: /durability\.spec\.ts/,
    },
    {
      name: 'durability-android-chrome',
      use: { ...devices['Galaxy Tab S4 landscape'], baseURL: 'http://localhost:5200' },
      testMatch: /durability\.spec\.ts/,
    },
    {
      name: 'durability-webkit',
      use: { ...devices['Desktop Safari'], baseURL: 'http://localhost:5200' },
      testMatch: /durability\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @app/web exec vite --port 5199 --strictPort',
      url: 'http://localhost:5199',
      reuseExistingServer: false,
      timeout: 60_000,
    },
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
