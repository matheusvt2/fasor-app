import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  reporter: 'list',
  use: { baseURL: 'http://localhost:5199' },
  projects: [{ name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm --filter @app/web exec vite --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
