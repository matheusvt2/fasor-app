---
title: 'Gate: faster and fail-fast test suites'
type: 'chore'
created: '2026-09-27'
status: 'done'
baseline_revision: '842bb34'
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-batch-orchestrator.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-e2e-parallel-workers.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-epic-8-carry-over.md'
---

# Gate: faster and fail-fast test suites (batch T)

## Problem

Matheus, 2026-09-27: "os testes estão demorando muito e dando timeout, isso é um problema que precisamos
investigar e resolver". The gate took 22-25 minutes against the 15-minute DoD budget, the e2e parallel group ran
on one worker because three workers failed one load-sensitive test per full run, a click on an aria-disabled
button waited out a 360 s test timeout, and web unit files timed out when two gates overlapped.

Constraints: no test removed, skipped or weakened; product code only for a genuine race a test exposes (with its
mutation run); every timing under the host lock `flock /tmp/fasor-verify.lock`.

## Machine and noise

Intel i5-8265U, 4 cores / 8 threads, 15 GB RAM, 4.6 GB in zram swap during the work. Every measurement ran under
the host lock, so no other gate overlapped it; development in the other worktrees (batches R and P, their stacks
up, a host Chrome, VS Code) was not locked. The load average at the start of each run was 2-4 and during the e2e
runs 5-9 (3 workers) or 4-6 (1 worker); the CPU sampler (`top` every 5 s) put the Playwright Chromium renderers at
about 200 % of one core at 3 workers, host Chrome at 50 %, VS Code and the desktop at about 30 %.

## Measure

`e2e/support/timing-reporter.ts` (a Playwright reporter, registered in `playwright.config.ts`) writes
`test-results/e2e-report/timings-{group}.json`: per test its total, hook and body time and its slowest steps, and
the run's total per shared setup helper, which now run as boxed `setup: …` steps (`timed` in `merged-fixtures.ts`:
`signIn`, `resetEmpresaB`, `resetEmpresaBWithFixture`, `pushDrafts`, `syncNow`).

Baseline `verify` at `842bb34` (run `base1`, each stage alone in order): lint 16 s, static 57 s, unit 196 s
(domain 26 s, web 149 s, tooling 17 s), api 157 s, e2e 1072 s (parallel group 973 s for 116 tests on 1 worker,
serial group 93 s); total 1499 s.

Where e2e time goes (subset ficha, relatorio and points `@p0`, 35 tests, 1 worker): 89 s of 330 s in setup
helpers: `signIn` 36 x 0.97 s, `pushDrafts` 35 x 0.76 s, `resetEmpresaB` 35 x 0.53 s, `syncNow` 10 x 0.89 s. The
rest is the tests' own steps; no single wait dominates. At 3 workers the same helpers cost about twice as much
per call (`signIn` 1.86 s, `pushDrafts` 1.37 s): the CPU is the shared resource. A per-worker `storageState`
would save at most the login page (about 0.5 s of the 1-2 s `signIn`, the rest is Home's first pull, which the
tests assert on) and was not worth the change to what 107 tests exercise.

Web unit: `vitest doctor` on apps/web (quiet machine): baseline forks 127 s, threads 121 s, fsModuleCache 132 s,
maxWorkers 3 172 s; vmThreads, vmForks and `isolate: false` fail tests (shared jsdom and fake-indexeddb state).
No candidate was more than 10 % faster, so the pool stays. The slow jsdom files (relatorio-tree-edges,
template-composer-*, sumario, setup) spend their time in real IndexedDB round trips and `waitFor`; run alone they
take a third of their time in the full run (template-composer-undo 9.5 s alone, 32.6 s in the full run), so they
are CPU-bound by their neighbours, not slow by themselves.

## Root causes of the load failures

| Test | Seen | Cause | Fix |
| --- | --- | --- | --- |
| 6.2-E2E-001 | past 60 s after "Erro — Tentar novamente" (PR #48 p3) | The tile's retry cleared the error and tried `runCycle()` for at most 40 x 250 ms; a cycle in flight longer than 10 s (a relatório pull under load) left the retry to the 60 s tick | `SyncEngine.retryUpload(fileId)`: clears the error and runs a cycle that starts after the one in flight, however long it runs (`runFreshCycle`, shared with `syncProject`). Engine unit test; mutation (the bounded loop back) fails it |
| 6.2-E2E-003 | `file/{id}/variants` emitted twice, 4 ms apart (full run at 3 workers) | Genuine api race: a PUT whose answer was dropped and its retry both read the file row before either wrote, and both emitted `uploaded_at`/`variants` | `emitServerOp` in `apps/api/src/http/files.ts` checks the field inside the company lock the write takes (`applyServerBatch`'s `before`); the losing PUT answers the stored `uploaded_at`. New integration test: 4 concurrent PUTs emit each op once and answer one `uploaded_at`; red before the fix (2 distinct `uploaded_at`), green after |
| 12.3-E2E-004 | "the target's centre hits div.nameplate-grid" (1 of 5 repeats at 3 workers) | After a choice in a Combobox, React Aria keeps the page `aria-hidden` (so `pointer-events: none` from the mock rule) until the close renders; under load that render came after `humanTap`'s 10-frame settle | `humanTap` settles for at least 10 frames and up to 2 s before the finger goes down. The tap, its hit test at pointer-down and the 3 s effect window are unchanged |
| 12.1-E2E-007 (lost-taps) | tap lost with the finger down 650 ms (1 of 5 repeats at both 2 and 3 workers) | The test holds the finger at most 650 ms and relies on the render landing inside the 800 ms hold cap; beside two other browsers the device commit and its render come later. It measures the device, which per-worker pairs cannot isolate | Every spec that times a tap against a render (`humanTap`, `touchPressAcross`, `tapCounter`) runs in the serial group, alone on the machine; a tooling test keeps any new one there |
| 5.8-E2E-001, 4.2-E2E-001 | once each in a 3-worker subset run while load reached 16 (unlocked work in another worktree) | Not reproduced in the full 3-worker `@p0` runs | none; watched in the validation runs |

## Changes

- `scripts/verify.ts` (`pnpm verify`): the five stages in three phases, `lint` + `static` + `test:api` together,
  then `test:unit` alone, then `test:e2e` alone; the first failure stops its phase and skips later phases; a
  per-stage summary and `test-results/verify/{stage}.log`. Measured: `test:unit` beside the others ran its jsdom
  files three times slower and timed out 7 tests, so it has a phase of its own. Tested in `scripts/verify.test.ts`.
- `test:unit` is one Vitest run over three projects (`packages/domain`, `apps/web`, `tooling`) in the root
  `vitest.config.ts`, one pool instead of three sequential runs; `static` runs the package type checks in parallel.
- `playwright.config.ts`: `actionTimeout` 15 s, `navigationTimeout` 30 s, `expect` 5 s stated; the parallel group
  is `fullyParallel` (ficha.spec.ts alone is a fifth of the group); the timing reporter.
- `e2e/support/groups.ts`: the six tap-timing specs join the serial group. `PARALLEL_WORKERS` stays 1 (validation
  below); `--workers=3` runs the parallel group on three pairs on demand.
- AGENTS.md "Running and verifying" updated.

## Validation (coordinator plan of 2026-09-27)

Known serial numbers reused (PR #45: full 1255-1281 s; PR #48: three serial full runs; latest gate e2e on
1 worker: parallel group 799-973 s, serial group 93-180 s).

| Run | Workers | Result | Time | Leak check |
| --- | --- | --- | --- | --- |
| `--repeat-each=5` 12.3-E2E-004, 6.2-E2E-001, 12.1-E2E-007 (before the grouping change) | 3 | 19/20, 12.3-E2E-004 once (humanTap settle) | 240 s | clean |
| same, after the humanTap fix | 3 | 19/20, lost-taps 12.1-E2E-007 once | 258 s | clean |
| same | 2 | 19/20, lost-taps 12.1-E2E-007 once | 287 s | clean |
| `test:e2e:full` (tap specs serial) | 3 | 212/213 run, 6.2-E2E-003 failed (the api race above, fixed after) | 1015 s (parallel 624 s, serial 383 s) | clean |
| `pnpm verify` #1 (after merging origin/main) | 3 | e2e 123/125: 12.4-E2E-001 (parallel, a Confirmar not applied in 5 s, load 12-14) and 12.1-E2E-007 (serial group, alone) failed | 1388 s (e2e 732 s: parallel 428 s, serial 299 s) | clean |
| `pnpm verify` #2 (shipped setting) | 1 | green: 125/125 e2e, lint, static, unit, api | 1268 s (e2e 868 s: parallel 635 s, serial 229 s) | clean |

Decision: the rule was "switch only when every run is green"; `verify` #1 was not, so `PARALLEL_WORKERS` stays 1
and the second 3-worker gate run was not spent. Noise during #1: host Chrome about 150 % of a core and an
unlocked `pip install` (another worktree's OCR build) during the first phase, load 15-19; the api suite took 435 s
there against 157 s at baseline.

## Before / after per stage (`pnpm verify`)

| Stage | Before (`base1`, 1 worker) | After #1 (3 workers, noisy) | After #2 (1 worker, shipped) |
| --- | --- | --- | --- |
| lint + static + api | 16 + 57 + 157 = 230 s (in sequence) | 435 s (in parallel; api 435 s under load 15-19) | 232 s (in parallel; api 232 s, lint 38 s, static 71 s) |
| unit | 196 s | 220 s | 167 s |
| e2e `@p0` | 1072 s (116 + 4 tests) | 732 s (106 + 19 tests) | 868 s (106 + 19 tests) |
| total | 1499 s | 1388 s | 1268 s |

Machine during #2: load 2-3 at start and end, the quietest run of the batch; the api suite grew with Stories
7.2-7.5 and 8.4-8.5 merged from main (preview, reading job), so its 232 s is not comparable to the 157 s baseline.

## Left open

- 12.1-E2E-007 (lost-taps) failed alone in the serial group in `verify` #1 (round 2, finger down 528 ms, the
  commit in the outbox at about 230 ms). It failed serially once before too (PR #48, s2). A likely mechanism:
  `press-hold.ts` releases the held render `RELEASE_AFTER_UP_MS` (300 ms) after the pointer up when no click came,
  and Chrome's touch click, 100-160 ms after the up on an idle machine, comes later on a loaded one, so the render
  moves the action before the click lands. Whether the hold should wait for the click longer is a product timing
  choice of Story 12.1 (OPEN QUESTION), not decided here.
- 12.4-E2E-001 failed once on three workers under heavy unlocked load (a suggestion's Confirmar not reflected in
  5 s); not reproduced alone.

- The gate stays over 15 minutes on this laptop: the e2e serial group grew by the tap-timing specs, and the
  unit suite cannot share the CPU with anything. The next lever is the device cost behind every e2e step (the
  relatório's live query rebuilds the whole snapshot on each commit; CPU-bound under contention), which is
  product work, recorded in `deferred-work.md`.
- `summary.json` still collapses `--repeat-each` repeats into one title (known since PR #45); the repeat counts
  above are read from the list reporter.
