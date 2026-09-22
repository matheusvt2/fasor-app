import { defineConfig } from 'vitest/config';

export default defineConfig({
  // F-GATE-1: the 5 s default timed out real runs of the CLI-spawning tests in this
  // project under normal machine load; 15 s gives them headroom without hiding a hang.
  test: { include: ['scripts/**/*.test.ts'], testTimeout: 15_000 },
});
