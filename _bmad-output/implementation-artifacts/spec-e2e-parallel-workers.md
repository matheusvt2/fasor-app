---
title: 'Gate: run the e2e suite on parallel workers with per-worker companies'
type: 'chore'
created: '2026-09-25'
status: 'in-progress'
baseline_revision: '3edcc59ba5ee7717a722988b163a43c0b5f3c5a6'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/playwright.config.ts'
  - '{project-root}/e2e/support/global-setup.ts'
  - '{project-root}/e2e/support/merged-fixtures.ts'
warnings: ['batched']
# batched: E6-Q7 (gate cost) as one infrastructure change after the Epic 6 fix batch, same orchestrator (token economy).
deferred: []
---

<intent-contract>

## Intent

**Problem:** `pnpm verify` takes 17-20 minutes against the 15-minute budget (E6-Q7): the Playwright suite runs with `workers: 1` because every spec shares the two seeded users (Empresa A and B of `TEST_SEED`) and `resetEmpresaB` empties Empresa B mid-run.

**Approach:** give every Playwright worker its own pair of companies and users, keep the specs that touch server-wide state on one worker that never overlaps the others, add a leak check, and switch the gate to `workers: 3` only after a 3 + 3 validation proves the parallel run executes the same tests with the same results. Matheus (binding): parallelism must never let workers interact or let a test run incompletely. Do not change what any test asserts.

Acceptance criteria from the coordinator (binding, 2026-09-25):
- **(a)** Every worker gets its own pair (A_i, B_i) of companies and users, seeded in global setup with deterministic uuidv7 ids per worker index; the `seed` fixture returns the pair for `testInfo.parallelIndex`; `resetEmpresaB`, `resetEmpresaBWithFixture` and every helper that touches a company take the worker's ids; no spec references a fixed company id, user id or seeded e-mail. The api test suite keeps `TEST_SEED` unchanged.
- **(b)** Specs that generate documents (the pg-boss queue and LibreOffice are shared), that load fixed-id fixtures (`seedPortoSeguroSmall`, `SMALL_FIXTURE_RELATORIO_ID`), or that depend on server-wide state run in a separate group with one worker that never runs at the same time as the parallel workers; a failure in either group never skips the other group's tests (both always run; the combined exit code is non-zero if either failed). The spec lists every such spec and why.
- **(c)** A leak check after the run (global teardown or a final step) fails the run when any op or entity row written by a worker's user sits in a company other than that worker's two companies (and when any e2e worker user wrote into a `TEST_SEED` or other company).
- **(d)** Before switching the gate: `test:e2e:full` 3 times with `--workers=1` and 3 times with the new setting on an otherwise idle machine; per run: tests executed, passed, failed, skipped, flaky, duration; the set of executed test titles identical across all six; no test passes serially and fails in parallel. If any does, `verify` keeps `workers: 1` and the PR says why. (The orchestrator runs this validation; the implementer makes it possible, see Tasks.)
- **(e)** Start at `workers: 3`; report the `verify` wall time per stage before and after.

## Boundaries & Constraints

**Always:** every e2e run (`test:e2e`, `test:e2e:full`, `test:e2e:matrix`) goes through the same grouping so no command can run a serial-group spec beside a parallel worker; worker company ids come from one module (deterministic, uuidv7-shaped, never colliding with `TEST_SEED` or `LEGACY_TEST_COMPANY_IDS`); `resetTestCompanyData` still refuses any company that is not a test or e2e-worker company; the durability projects get the same per-worker pairs; the device database name `releng-{user_id}` follows the worker's user.

**Never:** change a test's assertions, tags or titles (a title change breaks the identical-set check); weaken a timeout to make parallel pass; touch `TEST_SEED` or the api suite's seed; run anything on the host; install a service outside Docker.

</intent-contract>

## Code Map

- `playwright.config.ts` -- `workers: 1`, projects `desktop-chrome`, `durability-*`, one `vite preview` on 5200
- `package.json` scripts `test:e2e`, `test:e2e:full`, `test:e2e:matrix`, `verify`
- `e2e/support/global-setup.ts` -- resets and seeds the two `TEST_SEED` companies; becomes: seed N worker pairs (N = the max worker count of any group, at least 3)
- `e2e/support/merged-fixtures.ts` -- `seed` option fixture = `TEST_SEED`; `signIn(page, email)` uses `TEST_SEED.password`
- `apps/api/src/db/test-seed.ts` (`TEST_SEED`, `LEGACY_TEST_COMPANY_IDS`), `apps/api/src/db/seed.ts` (`resetTestCompanyData` guard at ~380, `seedTestCompanies`, `seedUser`, `seedStandardTemplate`) -- add the worker pairs beside, without changing `TEST_SEED`
- `e2e/support/reset-empresa-b.ts`, `e2e/support/export-fixture.ts` (`seedPortoSeguroSmall`, fixed ids), `e2e/support/relatorio-seed.ts`, `photos.ts`, `durability.ts`, `outbox.ts`, `sync.ts` -- helpers that name a company or user
- Specs with fixed e-mails or ids (grep `@teste.local`, `0a000000`, `0b000000`, `TEST_SEED`): account, auth, cadastros, durability, ergonomics, export, export-visual, ficha(.durability), files, home, journey-*, lost-taps.durability, points, p-screens.capture, relatorio, sheet-knows, sync, tap-budget, templates, tree, ui-hygiene, v09-visual
- Candidates for the serial group (verify each): `export.spec.ts`, `export-visual.spec.ts` (generation, fixed-id fixture); any spec calling `/api/health`, generating, or asserting server-wide counts (grep `generate`, `Gerar`, `health`, `libreoffice` in `e2e/`)

## Tasks & Acceptance

**Execution:**
- Worker pairs: one module (e.g. `e2e/support/worker-seed.ts`, or beside `test-seed.ts` if the api guard needs it) exporting `workerSeed(index)` with the `TEST_SEED` shape (same names, council, registration, template flags; ids and e-mails derived from the index); `resetTestCompanyData` accepts them.
- `global-setup.ts` resets and seeds every pair; `seed` fixture = `workerSeed(testInfo.parallelIndex)` (worker-scoped); every helper and spec takes ids, e-mails and names from `seed` (pass it through); `signIn` unchanged in behavior.
- Grouping: a serial group (one worker, never concurrent with the parallel group) for the specs of (b), listed in this spec's Design Notes with the reason each; the parallel group at `workers: 3`; scripts run both groups every time and exit non-zero if either failed.
- Leak check (c) as a global teardown (or final step) querying Postgres; fails the run with the offending rows.
- A way to force one worker for the validation (`--workers=1` must still work for both groups) and a machine-readable result per run (e.g. JSON reporter to a file) so tests executed/passed/failed/skipped/flaky and titles can be compared.
- `AGENTS.md` "Running and verifying" is not edited here (agent-context file); note the new behavior in the PR only.

**Acceptance Criteria:**
- Given the new config, when `pnpm test:e2e:full` runs with `--workers=1` and with the default, then the executed test title sets are identical and both exit 0.
- Given a spec in the serial group, when the suite runs, then no parallel-group test runs at the same time (serial group starts after the parallel group ends, or before it starts).
- Given a worker user writes an op into another worker's company (simulated in a unit/integration test of the leak check), when the leak check runs, then it fails naming the row.
- Given `pnpm verify`, when it runs, then it exits 0 under the 15-minute budget or the PR explains why not.

## Design Notes

Baseline measured by the orchestrator before this change (2026-09-25, `workers: 1`, each stage alone in one `tools` container): lint 32 s, static 45 s, test:unit 149 s, test:api 97 s, test:e2e 722 s; total 1045 s.

~~Serial-group list and reasons: filled in by the implementer after grepping (keep it here).~~ Serial-group list and reasons (2026-09-25, from a grep of `e2e/` for `generate`, `Gerar`, `health`, `libreoffice`, `pgboss`, `seedPortoSeguroSmall`, `SMALL_FIXTURE_RELATORIO_ID`, `export-fixture`, direct database access); the list lives in `e2e/support/groups.ts` with the same reasons:

- `export.spec.ts` -- generates documents through the api's one pg-boss queue and one LibreOffice, and loads the small Porto Seguro fixture, whose ids are fixed and whose seed (`seedPortoSeguroSmall`) reclaims those ids from every company.
- `export-visual.spec.ts` -- loads the same fixed-id fixture and generates a revision through the shared queue and LibreOffice.

Checked and left in the parallel group: `relatorio.spec.ts` opens and closes the Export dialog without generating; `durability.ts` visits `/api/health` only as a neutral same-origin page and asserts nothing about it; `relatorio.spec.ts` and `tap-budget.spec.ts` write server-only rows (`push-server-ops.ts`) into the worker's own company; `templates.spec.ts`'s database access was only its own copy of the Empresa B reset. No spec asserts a server-wide count. `scripts/e2e.test.ts` fails when a spec that imports the fixture or drives generation is not in the serial group.

## Narrowings and open questions

Filled in by the implementer (2026-09-25):

- **Grouping mechanism.** Playwright project `dependencies` skip the dependent project when its dependency fails, which (b) forbids, so `scripts/e2e.ts` runs two Playwright processes one after the other: `E2E_GROUP=parallel` (every spec but the serial list, `workers: 3`), then `E2E_GROUP=serial` (the serial list, one worker). Both always run; the command exits 1 when either failed or when neither found a test. `test:e2e`, `test:e2e:full` and `test:e2e:matrix` all go through it. A bare `playwright test` (no `E2E_GROUP`) runs every spec on one worker, so no invocation can put a serial spec beside a parallel worker.
- **`--workers=N`** is passed to the parallel group; the serial group always gets `--workers=1`. The global setup seeds `max(config.workers, 3)` pairs, so any worker count has its pairs.
- **One build.** The wrapper builds `build:e2e` once and sets `E2E_PREBUILT=1`, so each group's `webServer` only starts `vite preview`.
- **Results.** Each group writes a JSON report to `test-results/e2e-report/{parallel,serial}.json` and its artifacts to `test-results/{group}/`; the wrapper writes `test-results/e2e-report/summary.json` (per group and in total: tests, passed, failed, skipped, flaky, duration, and every test's `project > file > describe > title` with its outcome, plus the sorted `titles`) and prints the totals. The 3 + 3 validation compares `titles` and the outcomes across runs.
- **Worker pairs.** `apps/api/src/db/e2e-worker-seed.ts` (`workerSeed(index)`): company A/B `e2e00000-000{a,b}-7000-8000-{index as 12 hex}`, user A/B `e2e00000-00{a,b}1-7000-8000-{index}`, e-mails `e2e-w{index}-{a,b}@teste.local`, and `TEST_SEED`'s names, councils, registrations, password and template flags. `resetTestCompanyData` accepts these companies besides `TEST_SEED`'s and still refuses any other. The e2e global setup no longer resets or seeds `TEST_SEED` (the api suite seeds its own).
- **How specs take the pair.** Files that held a module-level `const account = TEST_SEED.companies[1]` (and `database`) now assign both in a file-level `test.beforeEach(({ seed }) => ...)`; the helpers already took the account as a parameter, and `resetEmpresaB(b, ...)`/`resetEmpresaBWithFixture(b)` now take it too. No title, tag, assertion or timeout changed. `scripts/e2e.test.ts` fails on any `TEST_SEED`, seeded e-mail or fixed test id under `e2e/`.
- **Leak check.** `apps/api/src/db/e2e-leak-check.ts`, run by `e2e/support/global-teardown.ts` after each group: an `ops` row whose `actor_id`, a `sync_device_push` row whose `user_id`, or an `entities` row whose materialized row names a worker's user, in any company outside that worker's pair, fails the run with the rows listed. Verified by `e2e-leak-check.integration.test.ts` and by a planted op, which failed both groups' runs naming it.
- **One test race fixed, no assertion changed.** `photos.spec.ts` 6.2-E2E-001 installed its 413 route after the shots, but E6-Q14 uploads a saved shot at once, so the first PUT could pass before the route existed (failed once at 3 workers). The route now goes in before the shots and waits for the first photo's id, as 6.1-E2E-002 already does with `holdUploadsUntilReleased`.
- **Open (blocks the green `test:e2e:full` at 3 workers).** Five full runs after that fix (four at 3 workers, one at 2) each had one or two failures, every time a different test, all timing (30 s default test timeouts, one `humanTap` cover check). No leak was found. The api log shows why: `POST /api/sync/ops` (223 per-op transactions for each relatório push) has a median of 1.2 s alone but 16.8 s when three or more pushes overlap (maximum 39 s), while pulls stay under 20 ms at p95. `pg_test_fsync` in the compose Postgres shows fdatasync between 0.4 ms and 24 ms. So the per-op commits look fsync-bound, and several browsers writing IndexedDB at once make it worse. Fixing it means a change outside this spec (the api's push path or the local Postgres durability settings), or raising timeouts, which this spec forbids. `pnpm verify` (`@p0` only) was green at 3 workers: 878 s in total, e2e stage 519 s against a 722 s baseline.

## Verification

Run inside the `tools` container of this worktree's compose project; redirect output to a log and read the tail.

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:e2e:full` -- expected: exit 0
- `docker compose --profile tools run --rm tools pnpm verify` -- expected: exit 0

## Spec Change Log

## Review Triage Log
