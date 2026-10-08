---
type: Runbook
title: End-to-end testing
description: How Playwright runs are grouped, tagged and timed, plus the human-style browser pass. Open when writing or debugging e2e specs.
tags: [workflow, e2e, playwright]
timestamp: 2026-09-30T00:00:00Z
sources: [AGENTS.md, scripts/e2e.ts, e2e/support/groups.ts, playwright.config.ts]
---
# End-to-end testing

- Code: `scripts/e2e.ts`, `e2e/support/groups.ts`, `playwright.config.ts`, `apps/api/src/db/e2e-worker-seed.ts`, `apps/api/src/db/e2e-leak-check.ts`.
- Every `test:e2e*` command goes through `scripts/e2e.ts`: build the web bundle once, run a parallel group (`fullyParallel`), then a serial group on one worker (`SERIAL_SPECS` in `e2e/support/groups.ts`: specs sharing the document queue, LibreOffice or a fixed-id fixture, and every spec that times a tap against a render). Both groups always run; the command fails if either fails. Since the 2026-10-08 gate-integrity batch (TST-V1) it also fails when a spec path it was given ran no test in either group (a typo, a spec whose every test skipped, a `:line` no test or describe starts on; option values are read as Playwright's own parser reads them, so `--update-snapshots all` or `--project a b` never become paths), and `playwright.config.ts` sets `forbidOnly: true` (with `allowOnly: false` in every Vitest project and `eslint-plugin-playwright` `no-focused-test` and `missing-playwright-await` as errors on `e2e/**`, `no-wait-for-timeout` as a warning outside a two-file allow-list), so a stray `.only` or a mistyped path can no longer pass the gate on fewer tests.
- Tags: `@p0` is the merge gate; `test:e2e:full` runs everything regardless of tag; `test:e2e:matrix` runs the durability suite on desktop Chrome, Android Chrome emulation and WebKit. Only the epic retro runs full and matrix.
- Parallel workers: default `PARALLEL_WORKERS` is 1 (three-worker validation still failed, `spec-test-speed.md`); `--workers=N` overrides for one run. Each worker has its own pair of companies (`workerSeed(index)` in `apps/api/src/db/e2e-worker-seed.ts`); a global teardown leak check fails the run if a worker wrote outside its pair.
- Timeouts: actions 15 s, navigations 30 s. Output: `test-results/e2e-report/summary.json` and `timings-{group}.json`.
- Nothing ships untested. A feature with a front end runs through Playwright as a human would, covering the whole feature. In addition the owner wants a hands-on pass via the Playwright MCP browser at 390, 768 and 1280 px with screenshots saved under `_bmad-output/implementation-artifacts/reviews/`.
- Gate rules: [merge-gate](/workflow/merge-gate.md).
