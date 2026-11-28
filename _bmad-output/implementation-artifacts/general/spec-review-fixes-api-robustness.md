---
title: 'Review fixes 2026-09-30: api robustness, queries and jobs (batch rfa)'
type: 'bugfix'
created: '2026-09-30'
status: 'done'
baseline_revision: '6b219098f2881aee6487cd57bfc8396b76141ea8'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/reviews/full-review-2026-09-30/1-code-quality.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_reason: 'The coordinator cut the review findings of apps/api into one batch (rfa): 28 api findings plus E-3, E-4, E-11 and two audit test gaps, all in apps/api/src and scripts/test-reset.ts, fixed together to keep one gate run.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The full review of 2026-09-30 found robustness, query-cost and job-behaviour defects in `apps/api` (A-1 to A-28), unsafe test-support cleanup (E-3, E-4, E-11) and two untested audit ACs (8.4 reading-job log fields, 2.2 `cover_background` variants). The worst: a transient S3 read failure during an issue job produces a numbered revision with placeholder text in place of evidence photos (A-4).

**Approach:** Fix each finding as the review's "fix" sentence proposes, read against the code first; each fix with a test in the project's style that fails before the fix (pure performance fixes: a behaviour-pinning test plus a before/after measurement for the PR body). Keep route shapes and status codes the web reads unchanged.

## Boundaries & Constraints

**Always:**
- Read the finding (review file, section 1.3/1.4/2/4) and verify it against the code before fixing; a finding that turns out false is recorded in the Review Triage Log style note at the end of this spec ("Finding verdicts") with the evidence, not fixed.
- One test per fix, written first and seen red (except where noted as perf-only). Integration tests use the existing `*.integration.test.ts` harness (compose Postgres and MinIO).
- A-4: a photo or certificate read that THROWS (S3 error, timeout, pool error) propagates: the job fails with `render_failed` on its `generation_job` row, no `revision` row and no revision number is issued, and pressing again (a new job) issues normally once reads work. Absent objects (`readPrint` returns undefined, row without variants) and bytes sharp cannot decode keep the current placeholder behaviour (epics.md 2026-09-28 narrowing under Story 7.2: "a photo the server lacks keeps its number and prints a placeholder"). AD-15 stays: no automatic pg-boss retry; "retry" means the user's "Tentar novamente" press creating a new job.
- A-4 integration test: an issue job with a `readPrint`/S3 getObject that throws for one photo ends `failed`/`render_failed`, the relatório has no revision; a second job with healthy reads issues revision 1. Also assert the generate status the web reads (`generation_job` row `status: 'failed'`, `error: 'render_failed'`) is what the Export dialog's failed state keys on (grep `apps/web/src` for `render_failed`/`failed` handling and cite it in the test comment; do not edit web code).
- Mechanism fixes (A-4, A-10, A-12, A-1 cache invalidation) ship a mutation run: revert the fix in the working tree, show the new test red, restore; record the result in the "Mutation runs" note at the end of this spec.
- Keep edits in `apps/api/src/http/app.ts`, `apps/api/src/config.ts` and `apps/api/src/auth/**` minimal (the security batch changes them on another branch): A-26 is a one-line change in `auth/auth.ts`; do not touch `app.ts` or `config.ts` unless unavoidable.
- Everything runs in Docker: `docker compose --profile tools run --rm tools pnpm ...`. Never run pnpm or node on the host. Redirect long output to a log under `.scratch-rfa/` and read its tail.
- English code and comments; no emoji; no new user-visible strings.

**Never:**
- Change a route path, response shape or status code the web reads (401 for no session stays 401; 409/200/202 of generate stay). A-13 adds a 503 only when the session lookup itself threw.
- Touch `apps/web/**`, `packages/domain/src/ops/**`, `schemas/**`, `relatorio/**` or the web-side duplication (W-*, groups 5-15: batch rfr). Only exception: A-25 adds one exported function at the end of `packages/domain/src/print/revisions.ts` (plus its unit test).
- Change goldens: the generated DOCX/PDF of the fixtures stays byte-identical (A-22, A-24, A-8 are pure refactors of the inputs).
- Change `CONTRACT_VERSION`, change any application password, touch AWS or `infra/`.
- Decide product questions: certificate rasterization that times out or exceeds the new total budget keeps printing the placeholder (current behaviour); list "should a certificate timeout fail the issue job like A-4?" as an open question.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| A-4 transient photo read | issue job, `getObject` throws for one photo | job row `failed`/`render_failed`; no revision; no S3 DOCX/PDF committed as revision | logged `generate failed` with `detail` |
| A-4 absent photo | photo row without variants or object missing | revision issued, photo keeps number, `PHOTO_UNAVAILABLE_TEXT` printed | logged as today |
| A-4 undecodable bytes | sharp throws on metadata | placeholder, as today | logged |
| A-4 certificate read throws | `readOriginal` getObject throws | job fails `render_failed` | logged |
| A-13 auth DB down | `auth.api.getSession` throws | protected route answers 503 `{code:'session_unavailable'}`-style ErrorResponse; `/api/health` still answers | logged once per request |
| A-13 no cookie | no session | 401 as today | none |
| A-14 bad reading payload with parseable `{company_id, photo_id}` | schema refuses | photo's reading status written `failed` via the existing `writeReadingFailed`; job completes | logged |
| A-1 registry create twice in one push | two creates, same normalized name | second merges into the first (as today) with one candidate query per kind per push | cache cleared on batch rollback or any other registry op |
| E-4 fixture in a foreign company | fixture rows under a company not TEST_SEED, not an e2e worker pair, not the seeding target | `removePortoSeguroSmall` throws, deletes nothing | transaction rolled back |

</intent-contract>

## Code Map

All paths under `apps/api/src/` unless noted; line numbers from the review, verify before editing.

- `jobs/generate/sections/section-7.ts:28-56` -- `loadPhotoImages`: catch-all around `readPrint` (A-4).
- `jobs/generate/sections/section-11.ts:50-78` -- `loadCertificatePages`: catch-all around `readOriginal` and rasterize (A-4, A-5 budget).
- `jobs/generate/job.ts:115-196` -- local `serverOp`/`jobPut` (A-28 envelope), `liveRevisions` (A-28 vs `http/generate.ts:124 revisionsOf`), `fileRow` (A-28), `readAll` (A-28: use `buffer` from `node:stream/consumers`), `printVariant`/`readOriginal` per-file query (A-8: key from the frozen snapshot's `files` rows; snapshot `files` carries `kind`, `variants`, `uploaded_at`, `removed_at`, `mime`, but check it carries the `relatorio_id` needed by `objectKey`; if not, one batched `inArray` query for all ids), `runGenerateJob:227-300`.
- `jobs/generate/worker.ts:24-120` -- `ensureGenerateQueue` (A-28 vs reading's `createQueueOnce`), `recordInvalidPayload` envelope (A-28).
- `jobs/generate/libreoffice.ts:62-178` -- per-run `mkdtemp` profile (A-17: one lazily created profile dir per process, recreated after a failed run), `rasterizePdfPages` without total budget (A-5: `deadlineMs`/total budget; each run's timeout = min(per-run, remaining); budget exceeded throws `LibreOfficeTimeoutError`). Keep the per-page two-run approach (a one-run export renders page 1 only, see comment at `:141`).
- `jobs/generate/pdf-outline.ts:43, 72-83` -- `task.promise` outside try/finally (A-16).
- `jobs/generate/docx.ts:260-270` -- watermark PNG rebuilt per TOC pass (A-24: compute once per job, e.g. fill `images.watermark` once or memoize).
- `jobs/queue.ts:5` -- pg-boss `error` to `console.error` (A-18: `logError('pg-boss error', {error: String(error)})`).
- `http/generate.ts` -- `activeJob:111-121` (A-9: `row->>'kind'` and `row->>'status' in ('queued','running')` in SQL, keep `isJobActive` in JS; drop the pool-side pre-check at `:310`/`:338` since `createJob` re-checks under the lock), `createJob:223-270` (A-12: move the "unchanged" decision `revisionsOf`+`latestRevision`+`editedAfter` into its `before` hook, returning a third outcome), `:299` `freezeSnapshot` in an unlocked tx (A-11: `toSnapshot`), `:359` literal filename (A-25), preambles `:281-299` vs `:327-343` and DOCX/PDF routes `:366-402` (A-28: `caughtUpRequest(c)`, `serveRevisionFile(kind)`), `jobOp:201-218` envelope (A-28).
- `http/files.ts` -- `:73-84` file-row lookup (A-28), `:160-176` envelope (A-28), `:213, 274, 279` and `:180` repeated row reads (A-20: `emitServerOp` returns the row), `:246-248` dead branch (A-19).
- `http/reading.ts:53-61`, `sync/routes.ts:70-79`, `jobs/reading/status.ts:75-83` -- file-row lookups (A-28 -> `findFileRow` in new `db/repositories/files.ts`, exported from `db/repositories/index.ts` if that is the pattern). `jobs/reading/status.ts:26-52`, `db/seed.ts:82-95` -- envelopes (A-28 -> `serverOp(...)` in new `sync/server-op.ts`).
- `http/session.ts:25-40` -- swallowed `getSession` error (A-13): record `sessionError` on the context; `requireSession` throws a 503 HTTPException when set, 401 otherwise. Check how `requireSession` throws today and the `AppEnv` type (may live in `http/app.ts`; if the context var must be declared there, add one line only).
- `storage/s3.ts:22` -- `S3Client` without `NodeHttpHandler` timeouts (A-6: `connectionTimeout: 5_000`, `requestTimeout: 120_000`, overridable by a parameter for the test).
- `storage/variants.ts:58` -- two full decodes (A-7: `print` from the original, `thumb` from the print bytes).
- `sync/apply.ts` -- `mergeTarget:263-293` (A-1: per-push cache `Map<kind, Map<normalizedName, id>>` passed down from `applyOps`; add a row after a create that inserted; clear a kind on any other applied registry op of that kind; clear all on a batch savepoint rollback), `:339-353` latest-op lookup (A-23: skip for `create`), `parsePath` repeated (A-23: carry the parsed path where the functions are local to this file; `applyOp` itself is the kernel's, untouched).
- `sync/pull.ts:47-78, 106-124` -- relatório stream `OR` (A-2: `UNION ALL` of two index-ordered sub-selects each `seq > since ORDER BY seq LIMIT n`, then merge/sort/limit; head = max of the two heads), `relatorioTotals` (A-3: partial index migration `entities (company_id, relatorio_id, entity) WHERE removed_at IS NULL`).
- `db/client.ts:7` -- pool `max: 5` (A-3: raise to 10 through a named constant; do not touch `config.ts`).
- `db/schema.ts` + `apps/api/drizzle/` -- new migration `0005_*` generated with drizzle-kit in the tools container (see `migrations-match.test.ts` for the check it must pass).
- `sync/routes.ts:137` -- mark-blind check outside the lock (A-10: move `pushTouchesConflictMark` into `applyOps`' `before` hook, `sync/apply.ts:445-493`, throwing a sentinel the route maps to the same 426); `:155` `recordPush` unguarded (A-15: try/catch + `logError`).
- `sync/snapshot.ts:20-48` -- `toSnapshot` loads sibling relatórios' rows (A-22: project-scope rows only, i.e. `project_id = X AND relatorio_id IS NULL`, verify against `buildSnapshot`'s needs; golden byte-equality tests must stay green).
- `jobs/reading/worker.ts:129-132` -- invalid payload `continue` (A-14: lenient `{company_id, photo_id}` parse, then the existing reading-failed writer, find it in `jobs/reading/status.ts`).
- `jobs/reading/job.ts:70-76, 148-154, 232, 246` -- `pendingOfPhoto` filters in JS (A-21), log fields (audit 8.4: assert the structured `log` line fields `company_id, relatorio_id, job_id, photo_id, reading_kind, run_id, attempt` and the outcome in an integration test; see `job-prose.integration.test.ts:234, 264` and how other tests capture `log` output, e.g. `http/request-log.integration.test.ts`).
- `auth/auth.ts:38` -- `appName: 'PRODUTO'` literal (A-26: import `PRODUTO` from `@app/domain`).
- `db/repositories/users.ts:79` -- `listUserProfiles` test-only (A-27: move to the test that uses it or a test-support file); `jobs/generate/docx-structure.ts`, `jobs/generate/sample-pdf.ts` -- rename to `*.test-support.ts` (update every importer including `e2e/*.spec.ts` import paths only) and append `**/*.test-support.ts` to `apps/api/Dockerfile.prod.dockerignore` (one line, flagged for the security batch merge).
- `db/test-fixtures.ts:24-37` -- `removePortoSeguroSmall` (E-4: one transaction; find the companies holding fixture rows; refuse when any is not a `TEST_SEED` company, not an e2e worker pair company (`db/e2e-worker-seed.ts`), and not the `allowCompanyId` the seeder passes; delete scoped to those companies).
- `db/test-cleanup.ts:10-19` -- `dropCompany` 8 deletes outside a transaction (E-11).
- `scripts/test-reset.ts:64-93` -- `resetTestCompanyData(db)` wipes both companies (E-3: pass `[companyId]`, the `only` parameter at `db/seed.ts:464-467`); S3 purge without `KeyMarker`/`VersionIdMarker` paging (E-3: page with the markers). Test through `db/test-reset.integration.test.ts`.
- `http/files.integration.test.ts:431-495` -- audit 2.2: add `cover_background` upload asserting its `print` and `thumb` variants exist (as the `logo`/`cover_photo` cases do).

## Tasks & Acceptance

**Execution (order: behaviour fixes, then queries, then refactors, then tests-only):**
- `jobs/generate/sections/section-7.ts`, `section-11.ts`, `jobs/generate/job.ts` + new `jobs/generate/job-photo-read.integration.test.ts` (or an added case in `job-fault.integration.test.ts`) -- A-4 as in Boundaries.
- `storage/s3.ts` + test -- A-6: a local `net` server that accepts and never answers; `getObject` with a small injected `requestTimeout` rejects.
- `jobs/generate/libreoffice.ts` + `libreoffice.test.ts` -- A-5 total budget (unit test with a stub/short budget), A-17 one profile per process.
- `http/session.ts` + test -- A-13.
- `jobs/reading/worker.ts` + test -- A-14 (export the per-job handler if needed, like `handleGenerateJobs`).
- `sync/routes.ts`, `sync/apply.ts` + tests -- A-10 (two concurrent pushes: a mark stamped in between is caught; or a unit test that the check runs inside the `before` hook under the lock), A-15 (recordPush throws -> route still 200 with the apply result), A-1, A-23.
- `http/generate.ts` + tests -- A-9, A-11, A-12 (race test: a revision committed between the pool read and the lock no longer yields a second identical revision; or an ordering test through the hook), A-25, A-28 route helpers.
- `packages/domain/src/print/revisions.ts` + its test -- A-25 `previewFileName()` returning `relatorio-rascunho.pdf` (same value as today).
- `sync/pull.ts`, `db/client.ts`, `db/schema.ts`, `apps/api/drizzle/0005_*` -- A-2, A-3 (pull paging test over interleaved relatório/project ops across two pages: same ops, same order, same head as before).
- `storage/variants.ts`, `jobs/generate/pdf-outline.ts`, `jobs/generate/docx.ts`, `jobs/queue.ts`, `jobs/reading/job.ts`, `sync/snapshot.ts`, `http/files.ts` -- A-7, A-16, A-24, A-18, A-21, A-22, A-19, A-20.
- New `db/repositories/files.ts` (`findFileRow`), new `sync/server-op.ts` (`serverOp`) and their callers -- A-28 (api side only), plus `revisionsOf`/`liveRevisions` into one, `ensureGenerateQueue`/`createQueueOnce` into one, `readAll` -> `node:stream/consumers`.
- `auth/auth.ts`, `db/repositories/users.ts`, test-support renames, dockerignore line -- A-26, A-27.
- `db/test-fixtures.ts`, `db/test-cleanup.ts`, `scripts/test-reset.ts` + integration tests -- E-4, E-11, E-3.
- `http/files.integration.test.ts`, reading job integration test -- audit 2.2, 8.4.

**Acceptance Criteria:**
- Given an issue job whose S3 read of one photo throws, when the job runs, then its `generation_job` row ends `failed` with `render_failed`, no `revision` row exists, and a later job with working reads issues revision 1 (A-4).
- Given a stalled S3 endpoint, when `getObject` runs, then it rejects within the configured request timeout (A-6).
- Given the auth database lookup throws, when a protected route is called, then it answers 503 and `/api/health` still answers; given no cookie, then 401 (A-13).
- Given `test-reset <company-A>`, when it runs, then company B's ops and entities are untouched and every S3 object version under A's prefix is gone, including past one listing page (E-3).
- Given the small fixture seeded on a company that is neither a test nor an e2e worker company, when a test calls `removePortoSeguroSmall`, then it throws and nothing is deleted (E-4).
- Given the `cover_background` upload, when the PUT completes, then its `print` and `thumb` objects exist (audit 2.2); given a reading job run, then the structured log line carries the seven fields named above (audit 8.4).
- Given every other finding, then its fix has a test or, for perf-only items (A-2, A-3, A-7, A-8, A-9, A-17, A-20, A-21, A-22, A-23, A-24), a behaviour-pinning test plus a before/after number (statement count or ms) recorded in the "Measurements" note below.
- Given the whole change, when `pnpm test:unit` and `pnpm test:api` run in the tools container, then both are green and the Porto Seguro goldens are byte-identical.

## Spec Change Log

## Review Triage Log

## Design Notes

A-12/A-9 ordering inside `createJob`'s `before` hook, under the company lock: (1) active job of this kind -> `running`; (2) issue only: latest live revision unchanged since its `snapshot_seq` -> `unchanged` (same response body as today); (3) create. The route keeps its 404/400/409 pre-checks and response bodies.

A-1 cache: scoped to one `applyOps` call (never module level), so a concurrent push never reads a stale map; the company lock already serializes pushes of one company.

Open question (do not decide): should a certificate rasterization timeout or an exceeded total budget fail the issue job like A-4, instead of printing the certificate placeholder?

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:api > .scratch-rfa/api.log 2>&1; tail -30 .scratch-rfa/api.log` -- expected: green.
- `docker compose --profile tools run --rm tools pnpm test:unit > .scratch-rfa/unit.log 2>&1; tail -30 .scratch-rfa/unit.log` -- expected: green.
- `docker compose --profile tools run --rm tools pnpm lint` and `pnpm static` -- expected: green.

Implementer notes go below this line: "Finding verdicts", "Mutation runs", "Measurements".

### Finding verdicts

- A-2 refined. On the compose Postgres the old relatório page is not a BitmapOr: the planner walks `ops_pkey` in `seq` order with the `OR` as a filter (EXPLAIN: "Index Scan using ops_pkey ... Rows Removed by Filter"), so its cost is the number of other ops (other relatórios, other companies) interleaved before the 500th match, not the stream length. The fix is kept: each page now reads only the two streams' own indexes. Measured neutral on a dense stream, 20-30 % faster on a sparse one (Measurements).
- A-13 confirmed. The 503 body uses the existing `internal_error` code with its own message: adding a `session_unavailable` code would touch `packages/domain/src/contract`, outside this batch; the web already retries any 5xx (`apps/web/src/sync/policy.ts`). `http/app.ts` changed by two lines (the import and one `onError` branch): unavoidable, `onError` answers every thrown error.
- A-23 confirmed with one consequence: a create is no longer reported in `superseded` (a merged registry create used to be, over the survivor's create). Nothing reads it: the kernel's `mergeInfoOf` returns null for any create.
- A-20 refined. The row is read under the lock once (`emitServerOp` returns it); a row already uploaded at the start of the PUT is still re-read once after the body, so a concurrent PUT's `running` is seen before a second reading is sent.
- A-26: two lines (the import and the use), not one.
- E-3 refined. Paging with `KeyMarker`/`VersionIdMarker` alone left objects behind on MinIO: a file's `{id}/thumb` and `{id}/print` are listed only once the `{id}` original is gone. The purge lists every page, deletes, and lists again until empty (bounded at 10 rounds). It now also runs before the database reset, so a failing delete leaves the rows as they were.
- A-14: the invalid payload's photo is failed from `running`, or from `queued` when the job was picked up before `running` landed.
- A-5: the budget is per job (`CERTIFICATE_RASTERIZE_BUDGET_MS`, 300 s for all certificates together, so it plus three conversions stays under the queue's 900 s expiry). A certificate past it prints the placeholder (current behaviour).
- A-19 confirmed dead (`readCappedBody` throws at the first byte past the limit); removed, pinned by the existing body-over-limit test.
- A-27: `apps/api/Dockerfile.prod.dockerignore` gained `**/*.test-support.ts`; flag for the security batch merge.
- Open question (not decided): should a certificate rasterization timeout or an exceeded total budget fail the issue job like A-4, instead of printing the certificate placeholder?

### Mutation runs

Each fix reverted in the working tree (the pre-fix file as committed at the baseline revision, or the named lines removed), its test run in the tools container, the fix restored (the working-tree diff stat identical before and after):

| Fix | Mutation | Test | Result |
|---|---|---|---|
| A-4 | `section-7.ts`, `section-11.ts` at the baseline | `sections/section-7.test.ts`, `section-11.test.ts` | 2 failed |
| A-4 | same | `job-photo-read.integration.test.ts` (the two failing-read cases) | 2 failed (the read error swallowed as "generate photo/certificate unreadable") |
| A-10 | `sync/routes.ts` at the baseline | `push-route.integration.test.ts` | 1 failed (200 instead of 426) |
| A-12 | `http/generate.ts` at the baseline | `generate-lock.integration.test.ts` | 1 failed (202 queued instead of 200 unchanged) |
| A-1 cache invalidation | `cache.clear()` and `cache.delete(kind)` removed | `registry-names.integration.test.ts` | 1 failed (renamed row) |
| A-14 | `failInvalidPayload` call removed | `worker-invalid.integration.test.ts` | 1 failed (photo stays running) |
| A-15 | `recordPush` try/catch removed | `push-record.integration.test.ts` | 1 failed (500) |
| E-3 | `resetTestCompanyData(db)` without `[companyId]` | `test-reset.integration.test.ts -t E-3` | 1 failed (company B wiped) |

Tests first seen red against the unfixed code before the fix landed: A-4 units, A-1 (23 candidate queries, expected 2), A-5, A-6 (hung), A-10, A-13, A-16, A-17, A-25, E-4, E-11.

### Measurements

Tools container (api container for A-17), compose Postgres and MinIO, a machine shared with other agents (load average 25-70): medians, before then after.

| Finding | What | Before | After |
|---|---|---|---|
| A-1 + A-23 | one push of 200 manufacturer creates over 300 live rows | 1203 statements, 1941 ms | 804 statements, 1116 ms |
| A-8 | issue job with 20 photos, up to the injected conversion fault | 54 statements, 1027 ms | 30 statements, 447 ms |
| A-22 | `toSnapshot` beside 40 sibling relatórios of 100 rows | 49.4 ms | 15.1 ms |
| A-3 | `companySummary` (partial index `entities_company_relatorio_entity_live_idx`, pool 5 to 10) | 13.6 ms | 8.2 ms |
| A-2 | relatório page, dense (40k own, 20k project ops) | 25.1 / 24.9 ms | 24.0 / 21.9 ms |
| A-2 | relatório page, very sparse (2k own, 500 project, 300k sibling ops) | 46.7 / 36.5 ms | 38.0 / 26.5 ms |
| A-7 | `renderVariants` of a 24 MP JPEG (one full decode instead of two) | 980 ms | 356 ms |
| A-17 | DOCX to PDF, four conversions in a row | 4716, 2770, 2306, 2584 ms | 2557, 2096, 1674, 1633 ms |
| A-24 | RASCUNHO rasterization (53 ms, then 24 ms per call) | once per TOC pass (2-3 per preview) | once per job; image dimensions read once per buffer |
| A-9 | job rows read per press (counted from code) | every job row of the relatório, twice | queued/running rows of the kind, once, under the lock |
| A-20 | file-row reads per first image PUT (counted from code) | 4 (5 when a concurrent PUT won) | 3 |
| A-21 | suggestion rows read per reading run (counted from code) | every suggestion of the relatório, twice | the photo's pending ones, twice |

Behaviour pins for the perf-only items: A-2 and A-22 `sync/pull-stream.integration.test.ts`; A-7 `storage/variants.test.ts`; A-24 `docx-section-10.test.ts`; A-8 `job.integration.test.ts` and `job-photo-read.integration.test.ts`; A-9 `preview.integration.test.ts` (R7); A-20 `files.integration.test.ts` (concurrent PUTs); A-21 `job-prose.integration.test.ts` (rerun discards); A-17 `libreoffice.test.ts`; A-23 the sync suites; A-1 `registry-names.integration.test.ts`; A-3 `migrations-match.test.ts` and the summary tests. Goldens unchanged (`docx.test.ts` skeleton golden and `sync/porto-seguro.integration.test.ts` green).
