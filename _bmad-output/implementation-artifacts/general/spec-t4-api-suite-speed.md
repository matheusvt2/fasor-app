---
title: 'Chore T4: run the api suite in lanes, the print lane only where the print can change'
type: 'chore'
created: '2026-11-26'
status: 'review'
baseline_revision: 'baa388c9'
route: 'direct'
context:
  - '{project-root}/_bmad-output/planning-artifacts/sprint-change-proposals/sprint-change-proposal-2026-11-04.md'
  - '{project-root}/_bmad-output/implementation-artifacts/general/spec-t3-serial-split.md'
---

<intent-contract>

## Intent

**Problem:** `pnpm test:api` ran one file at a time (`fileParallelism: false` in `apps/api/vitest.config.ts`, whose comment still said the suite took under 10 s). The gate of batch e31d measured 678 s for 166 files and 1264 tests; about 50 files need no database at all and wait in the same queue. The print locks (`layout-lock.integration.test.ts` alone 76 s) re-render every frozen seed version on every batch gate, whatever the batch touched.

**Approach:** Chore T4, `sprint-change-proposal-2026-11-04.md` § 4.5 (approved by Matheus on 2026-11-26, "pode fazer 1 e 2 ja"). Part 1: the suite runs in four lanes; the parallel one gives each worker its own pair of test companies. Part 2: the batch gate leaves the print lane out when the batch changed no path the print can depend on; the wave gate always runs it.

## Boundaries & Constraints

**Always:**
- No product code changes: only `apps/api/vitest.config.ts`, the test-support modules (`db/test-seed.ts`, `db/test-cleanup.ts`, `db/seed.ts`'s doc comment), the new `src/test-lanes.ts` and `src/test-setup/test-pair.ts`, three test files' own setup or cleanup, the root scripts and docs.
- Every test and assertion is kept; where a file's state leaked into another file of the same pair, the leak is fixed, not the file moved.
- `pnpm test:api` (and so `pnpm verify`) runs every lane, always. When in doubt the print lane runs.
- AD-15 unchanged: the api's one LibreOffice still orders every conversion.

**Never:**
- No lane drop, no `@slow` tag, no skipped test. A file moves to a one-at-a-time lane only with its reason written in `test-lanes.ts`.

</intent-contract>

## Design

**Why a pair per worker, not a database per worker.** Fifty-two api test files call the live `api:3000` container, which serves one `DATABASE_URL`; a database per Vitest worker would need an api per worker. What the files really share is the two `TEST_SEED` companies: 57 files call `seedTestCompanies` in their `beforeAll`, and re-seeding a user revokes that user's sessions (`seedUser`, the documented password-reset path), so on one shared pair every file signed the others out. Every other id a file writes is already minted per run, the reading and transcription workers already run on queues of their own, and S3 keys are prefixed by company. So `TEST_SEED` became per process: `testSeedPair(p)` keeps the fixed pair as pair 1 and derives pair `p` from 2 on (same names, councils, template flags and password; ids `0a000000-00pp-7000-8000-…` and e-mails `a-w{p}@teste.local`), and the parallel lane's setup file (`src/test-setup/test-pair.ts`) sets `API_TEST_PAIR` to the worker slot plus one before the test file imports anything. This is the e2e side's per-worker pair (`workerSeed`) applied to the api suite, with no new mechanism.

**Lanes** (`apps/api/src/test-lanes.ts`, four Vitest projects in `apps/api/vitest.config.ts`, run by `scripts/api-suite.ts` in two phases):

| Phase | Run | Project | Workers | Pair | What |
| --- | --- | --- | --- | --- | --- |
| 1 | solo | `api-solo` | 1 | 1 (fixed) | 4 files: the generation timing, the legacy companies, the two boot upgrades |
| 2 | parallel | `api` | `PARALLEL_WORKERS` = 4 | slot + 1 | every file not listed |
| 2 | queue | `api-serial`, then `api-print` | 1 | 1 (fixed) | 20 files: the api's document queue, the small fixture's fixed ids, the fixture op reclaim; then 16 files: the print locks and the LibreOffice print checks |

The queue run spends most of its time waiting on the api's LibreOffice, so it runs beside the parallel lane instead of after it. The solo files need nothing at all beside them, and run first: with the solo phase last, `generation-time` timed out reading the api's log through the engine socket (5 s) right after the busy phase, in two runs of three. Both phases always run; the command fails when any run failed or none had a test file. A third run at once (the print lane on a pair of its own beside the serial lane) was measured and reverted: on this CPU-bound VM it slowed every lane (parallel 433 s, print 524 s, total 579 s, red on load timeouts).

**Machine note.** The VM is CPU-bound well before eight workers: on six workers every parallel file ran about twice as slow as on three, and the lane took 174 s against 185 s. The users-read CLI test (spawns `tsx` several times under a 15 s test timeout), the route tests (one api process) and `generation-time` (reads the api container's log through the engine socket with a 5 s timeout, slow once the container has logged a few MB; recreate the api container before a gate) are the first to go red under extra load.

**Moved to a one-at-a-time lane, and why** (each entry's `why` in `test-lanes.ts` says the same):
- Document queue (AD-15), with the small fixture's fixed ids: `http/e25c-stale-conclusion`, `http/e31c-audio-hold`, `http/generate-lock`, `http/generate.enqueue`, `http/generate`, `http/preview`, `http/request-log`, `jobs/generate/job-fault`, `job-photo-read`, `job`, `rich-text`.
- Document queue only: `sync/roles`, `sync/e26r-issued`, `sync/sync`.
- Fixed-id fixture only: `jobs/generate/job-certificate`, `jobs/generate/worker`, `jobs/audit/worker`, `db/test-fixtures`, `db/seed-cli` (it also runs the seed CLI's `--test` on the fixed pair).
- `sync/porto-seguro`: deletes the fixtures' fixed op ids in every company before applying them, which would remove the small fixture a serial file holds.
- Print lane: `layout-lock`, `docx-layout-lock`, `e24a/e24p/e24s-v14-print`, `e24y-paired-tables`, `e25b-revision-verdicts` and `-gaps`, `e25p-criterion-per-row`, `e25r-like-with-like`, `e28b/e28c-v18-print`, `v13-insulation-print`, and the three in-process LibreOffice files skipped in the tools container.
- Solo: `generation-time` (times a preview and an issue against budgets), `db/seed` (plants the legacy v4 companies every `seedTestCompanies` removes), `db/roles` and `db/template-seed-upgrade` (boot upgrades over every company: measured, tombstone's op count went 5 over beside them).

**Isolation fixes (not moves).**
- `db/standard-template.integration.test.ts` asserted the template batch's five ops have consecutive global `seq`; `seq` is one sequence for every company, so a parallel writer takes numbers in between. It now asserts they are consecutive in the company's own log, the stream a device pulls.
- `sync/pull-stream.integration.test.ts` applied the small fixture to a throwaway company under its fixed relatório, project and entity ids (fresh op ids only). Beside the serial lane, `db/test-fixtures.integration.test.ts` then found the fixed relatório in a company it did not know (red on gate 4, run 3). pull-stream now applies the company's own copy (`smallFixtureCopy`, the T3 helper), and the guard fails a parallel file that maps a Porto Seguro fixture log into the database.
- `http/reading.integration.test.ts` expects the README plate's "Celtta" to be unknown to the company; `sync/suggestion.integration.test.ts` confirms "Celtta" into FABRICANTE, which teaches the company that manufacturer, and never removed it. The leak predates T4 (the baseline run went red on it too, once the fixed pair held it). The suggestion test now removes what it taught and the reading test clears the name first (`dropRegistryRowsNamed`, `db/test-cleanup.ts`).

**Part 2: the batch gate's print lane.** `pnpm test:api:batch` reads `API_CHANGED_FILES` (the host fills it from git, since a worktree's git directory is not mounted in the tools container) and leaves `api-print` out only when every changed path is outside `PRINT_TRIGGERS`. The triggers are the render code with its goldens (`apps/api/src/jobs/generate/`), the queue and entry that run it, the whole `packages/domain` (the print's import closure holds 264 of its 290 source files), the api modules the print reaches (`db/`, `sync/`, `storage/`, `auth/`, `email/`, `admin/password-links.ts`, `clock`, `config`, `ids`, `log`), the api image and compose file, the manifests and lockfile, and the lane machinery. An unset or empty list runs the lane. The old `test:fast` script (`-t '^(?!.*@slow)'`) matched no test (no title carries `@slow`); it is removed and the filter kept in the runner (R-011).

**Guards** (`scripts/api-suite.test.ts`, in `test:unit`): every listed file exists, has a reason and sits in one lane; a test file that calls the preview or generate route, seeds or removes the small fixture under its fixed ids, maps a Porto Seguro fixture log into the database, applies a layout-lock fixture to the database, deletes a fixture's fixed op ids, runs the seed CLI's `--test`, compares a print with a golden, plants a legacy company or runs a boot upgrade cannot sit in the parallel lane, and the last two must sit in `api-solo`; no parallel integration file names the fixed pair's ids or e-mails; the config gives each project its include, workers, setup file and group order; the setup file gives slot `k` pair `k + 1` and imports nothing; the plan, the phase order, the exit rule and the count parser; the print's import closure (computed from the files, through `@app/domain` by name) lies under `PRINT_TRIGGERS`.

## Measurements

All on the 8-vCPU podman VM of the M2 Pro host (6 performance cores), stack `fasor-t4`, under the host lock, `podman compose --profile tools run --rm --user node tools ...`. Logs: `_bmad-output/test-artifacts/manual/t4/`.

**Baseline.** e31d gate: 678 s. Same machine, the old one-file-at-a-time mode on this branch (`vitest run --no-file-parallelism`): 733 s (`first-pass/api-baseline.log`).

**First design (three lanes one after the other)**, kept for the record (`first-pass/`): parallel lane alone 174 s on six workers and 185 s on three (every file ran about twice as slow on six); full run 506 to 509 s alone, 627 s beside lint and static; batch form 299 s. Runs 2 and 3 and its batch run went red on the Celtta leak (below), so it never had three green runs.

**Final design (solo first, then the queue run beside the parallel lane)**: wall time of `pnpm test:api` (the command), with the runner's own lines (solo / parallel / queue / total).

| Run | Wall | solo | parallel | queue | Result | Load at end |
| --- | --- | --- | --- | --- | --- | --- |
| gate 6, run 1 | 533 s | 41.2 s | 250.6 s | 488.7 s | 1268 passed, 10 skipped | 5.47 |
| gate 6, run 2 | 484 s | 42.6 s | 206.2 s | 438.3 s | 1268 passed, 10 skipped | 5.80 |
| gate 6, run 3 | 488 s | 43.4 s | 209.3 s | 441.0 s | 1268 passed, 10 skipped | 5.02 |
| gate 6, beside `lint` and `static` (verify's phase 1) | 554 s | 93.6 s | 218.8 s | 457.4 s | green; `static` 84 s green; `lint` red in 66 s on this agent's scratch `.ts` files in the worktree, moved away, clean in 27 s on gate 7 | 5.70 |
| gate 6, batch form (no print lane) | 347 s | 50.9 s | 287.4 s | 292.2 s | red, load 7.9 from another session: users-read CLI timeout (fixed: 60 s like its friction-read siblings) and one ECONNRESET in `sync/roles` | 7.36 |
| gate 7, batch form | 296 s | 43.0 s | 239.2 s | 249.7 s | 1174 passed (no print lane) | 7.77 |
| gate 7, final commit | 466 s | 45.7 s | 187.0 s | 417.6 s | 1268 passed, 10 skipped | 5.72 |
| gate 8, after merging main (`788fed7f`), beside `lint` (52 s) and `static` (64 s), both green | 478 s | 74.8 s | 177.5 s | 400.5 s | 1285 passed, 10 skipped (main added 17) | 5.38 |

1268 = the 1264 tests of the e31d gate plus the four of `db/test-seed.test.ts`; the 10 skipped are the three in-process LibreOffice files, as before. `test:unit`: 524 files, 8213 tests, 375 s (load 9) on gate 6; after merging main, 8241 tests, 312 s (gate 8). Against the 733 s of the old mode on this machine, the full form saves 3.4 to 4.2 min (466 to 533 s) and the batch form 7.3 min (296 s); against the e31d gate's 678 s, 2.4 to 3.5 min and 6.4 min. The queue run (the api's one LibreOffice, AD-15) is the full form's critical path: 335 s alone, 420 to 490 s beside the parallel lane. Said plainly: on this CPU-bound VM the overlap buys little over the first design (466 to 533 s against 506 to 509 s, batch 296 s against 299 s, within the run-to-run noise); the saving is the parallel lane and the batch form's missing print lane. The final design is the one the green runs were measured on, and its solo-first order is what keeps `generation-time` green.

Runs that went red on the way, each fixed in the tests or the plan, none moved to a lane without its reason: gate 1 runs 2 and 3 and the baseline (the Celtta leak), gate 3 (three runs at once, reverted), gate 4 run 3 (pull-stream's fixed ids), gate 5 (`generation-time` reading the api log after the busy phase; the solo lane now runs first), gate 6 batch (load, above). One flake class is left: a fetch to the api answering ECONNRESET or "other side closed" under load (seen in `sync/roles` and `db/roles` in four of about fifteen runs, all at load 6 or more, in the old one-file mode too); it looks like a reused keep-alive socket after the test process's event loop was blocked (`spawnSync`), and is not fixed here.

**Unit transform cache (measurement only, asked by Matheus on 2026-11-26, "vamos testar o cache").** `pnpm test:unit` as it is: 334 s wall (Vitest Duration 330.5 s: tests 35 %, import 32 %, environment 15 %, transform 11 %, setup 6 %). `pnpm exec vitest run --fsModuleCache`, first run (fills the cache): 309 s (306.2 s: tests 35 %, import 33 %, environment 15 %, transform 11 %, setup 6 %). Second run (reads it): 286 s (283.3 s: tests 39 %, import 35 %, environment 16 %, setup 7 %, transform 4 %). The cached read saved about 47 s of wall time against the uncached run, one sample each, with the host load rising from 6.7 to 8.4 across the three runs. No Vitest config of the unit suite changed; enabling the cache is Matheus's decision.

## Verification

- `podman compose --profile tools run --rm --user node tools pnpm lint` and `pnpm static`: clean.
- `podman compose --profile tools run --rm --user node tools pnpm test:unit`: green, `scripts/api-suite.test.ts` included.
- `pnpm test:api` three times in a row, then once beside `lint` and `static`, then `pnpm test:api:batch` with a list outside the triggers: see Measurements.
