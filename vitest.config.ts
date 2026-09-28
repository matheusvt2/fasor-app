import { defineConfig } from 'vitest/config';

/**
 * `pnpm test:unit`: one Vitest run over the three suites that need no database (test-speed
 * batch, 2026-09-27). They used to run one after the other (domain, then web, then this
 * repo's tooling tests), each with its own worker pool; as projects of one run they share
 * one pool, so the short domain files fill the gaps the long jsdom files of apps/web leave.
 * Each project keeps its own config: `packages/domain/vitest.config.ts`, the `test` block
 * of `apps/web/vite.config.ts`, and the tooling project below. The api suite is not here:
 * it needs Postgres and runs as `pnpm test:api`.
 */
export default defineConfig({
  test: {
    projects: [
      'packages/domain',
      'apps/web',
      {
        test: {
          name: 'tooling',
          include: ['scripts/**/*.test.ts'],
          // F-GATE-1: the 5 s default timed out real runs of the CLI-spawning tests in this
          // project under normal machine load; 15 s gives them headroom without hiding a hang.
          testTimeout: 15_000,
        },
      },
    ],
  },
});
