import { defineConfig } from 'vitest/config';

export default defineConfig({
  // E3-A4 (the F-GATE-1 rule of `apps/web` and the root): the 5 s default timed out the
  // Porto Seguro fixture replay (about 3 s idle, over 6 s under machine load) in real gate
  // runs; 15 s gives it headroom without hiding a hang.
  test: { testTimeout: 15_000 },
});
