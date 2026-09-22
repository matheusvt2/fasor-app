---
title: 'Epic 1 fixes: deterministic gate, refreshed docs and the deferred-work ledger'
type: 'chore'
created: '2026-09-22'
status: 'done'
dev_model: 'sonnet'
dev_effort: 'high'
baseline_revision: '88a6664eb5a57069a5b706f08e0103ad7a548fa7'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-retro-2026-09-22.md'
  - '{project-root}/_bmad-output/test-artifacts/test-design-qa.md'
warnings: [oversized, multiple-goals]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Epic 1's retrospective (`_bmad-output/implementation-artifacts/epic-1-retro-2026-09-22.md`) found the merge gate non-deterministic and too narrow (F-GATE-1..3, F-DUP-3), README/AGENTS.md still describe a pre-Story-1.1 prototype (F-DOC-1), Story 1.7's CI AC was never struck through after the no-CI decision (F-SPEC-7), the deferred-work ledger holds 2 entries against 39 real spec `deferred` items with roughly a third already closed and unmarked (F-DEBT-1), and the Epic 1 process lessons (P1-P6) were never recorded anywhere a future run would read them.

**Approach:** Remediate action items A6, A9, A10 and the file-only part of A11 exactly as scoped below: harden `test:unit`/`verify`/e2e tagging/the test-reset mechanism (A6); refresh README.md, AGENTS.md and strike Story 1.7's CI AC (A9); rebuild `deferred-work.md` from all 8 `spec-1-*.md` files with class + verified state, and add a cross-tenant DoD clause (A10); record the five A11 process lessons in `_bmad/custom/bmad-build.toml` only (A11, files only — no epics.md Dev model line changes).

## Boundaries & Constraints

**Always:** Every claim in the rebuilt `deferred-work.md` about an item being "closed" must be verified against the current code/git history, not copied from the retro. `pnpm verify` (via `docker compose --profile tools run --rm tools pnpm verify`) must be green, and `test:unit` must be run 3 consecutive times, all green, to prove A6's determinism fix. Keep `_bmad/custom/bmad-build.toml`'s existing TOML schema/style (persistent_facts array of triple-quoted strings, `{placeholder}` interpolation, review_layers tables) when adding new policy text — append, do not restructure. `scripts/test-reset.ts` must call `resetTestCompanyData` from `apps/api/src/db/seed.ts` for the ops/entities/sync_device_push tables rather than its own guessed table list; keep its extra pgboss.job and S3-prefix cleanup (behavior `resetTestCompanyData` does not cover).

**Never:** Do not touch `packages/domain`, `apps/api/src/sync`, `apps/web/src/state` or `apps/web/src/api` — a parallel branch is changing identity ids there. Touch `apps/api/src/db/seed.ts` only if strictly required (current investigation found `resetTestCompanyData(db)` already resets both `TEST_SEED` companies in one call with no signature change needed — expect zero edits there unless implementation proves otherwise). Do not edit any `**Dev model:** ... · **Effort:** ...` line in `epics.md`. Do not delete deferred items when merging into `deferred-work.md` — every item from all 8 specs must appear, even ones judged closed (marked closed with evidence, not dropped). Do not add a "sample-relatorio" seed flag to `seed-users.ts` (investigation found it needs new op-log-replay plumbing, not a flag) — instead add it as a new `post-mvp`/`debt` entry in the rebuilt `deferred-work.md`. Do not invent a brand-new "integration" vitest project/config if an existing one already serves the purpose — apps/api's own `*.integration.test.ts` convention (already separate from `test:unit`, already run in `verify` via `test:api`) is that existing integration project; reuse it.

</intent-contract>

## Code Map

### A6 — gate determinism and coverage

- `vitest.config.ts` (root) -- "tooling" project: `test.include: ['scripts/**/*.test.ts']`, no `testTimeout` set (5s default). Raise `testTimeout` (>=15000ms) here.
- `apps/web/vite.config.ts:96-99` -- "jsdom" project (`test.environment: 'jsdom'`), no `testTimeout` set. Raise it here too.
- `scripts/tooling.test.ts:91-99` -- `it('provisions the two test companies through the CLI', ...)` spawns `pnpm exec tsx scripts/seed-users.ts --test` against real Postgres (already has a 120s per-test override, but runs under `test:unit`). Move this test out of `scripts/tooling.test.ts` into a new `apps/api/src/db/seed-cli.integration.test.ts` (matching the existing `*.integration.test.ts` convention already excluded from `test:unit` and run under `test:api`/`test:fast`, which is already in `verify`). Leave the rest of `scripts/tooling.test.ts` (import-direction, fetch-location, store-boundary, naming rules) in place — those don't touch Postgres.
- `package.json:11-20` -- scripts: `test:unit`, `test:api` (`pnpm --filter @app/api run test:fast`), `test:e2e` (`playwright test --grep @p0 --project desktop-chrome --project durability-desktop-chrome`), `test:e2e:matrix`, `verify` (`pnpm lint && pnpm static && pnpm test:unit && pnpm test:api && pnpm test:e2e`). Add a `pnpm audit --prod` step to `verify` (append after `test:e2e`) unless it proves unreliable in the sandboxed `tools` container (no registry reachability) — in that case do NOT add it; instead add one sentence to AGENTS.md's gate description explaining why (per A9's AGENTS.md edit).
- `e2e/*.spec.ts` -- every test title is currently prefixed `@p0` (20 titled tests + 1 untitled in `e2e/shell.spec.ts:3`). `_bmad-output/test-artifacts/test-design-qa.md` (P0 table ~299-346, P1 ~350-411, P2 ~417-424) says these are really P1, not P0: `1.5-E2E-002` (dead-op/Reenviar), `1.6-E2E-001` (Home status board), `1.8-E2E-004` (eviction recovery), `1.8-E2E-005` (5-day banner) — retag these `@p1`. Tests with no entry in `test-design-qa.md` (`1.3-E2E-001b/001c/002b/003/003b` in `e2e/auth.spec.ts`, `1.5-E2E-003` in `e2e/sync.spec.ts:114`, `1.6-E2E-002/003/004` in `e2e/home.spec.ts`/`e2e/account.spec.ts`, `1.8-AC-001` in `e2e/durability.spec.ts:92`, the untitled shell test): use judgment — a variant/edge-case check of an already-`@p0`-covered scenario becomes `@p1`; a check gated on a known tool limitation (WebKit/offline, SW interception) stays or becomes `@p2`. State the reasoning per test in the PR body. `package.json:14`'s `--grep @p0` filter needs no script change — after retagging it will legitimately select a subset.
- `Dockerfile.tools:1-6` -- already runs `npx --yes playwright@1.63.0 install --with-deps chromium webkit` (no Firefox project exists, so this is complete). The retro's "tools image lacks WebKit" (F-GATE-3) is a stale-cached-image issue, not a Dockerfile gap — no source edit needed; instead rebuild it (`docker compose --profile tools build tools`) and confirm `pnpm test:e2e:matrix` (which includes the `durability-webkit` project, `playwright.config.ts`) runs webkit without a "browser not found" error, as part of Verification below.
- `scripts/test-reset.ts:11` -- guessed `TABLES = ['ops', 'entities', 'files', 'revisions', 'generation_jobs', 'reading_runs']` (`files`/`revisions`/`generation_jobs`/`reading_runs` don't exist in `apps/api/src/db/schema.ts`; `sync_device_push` does exist and is currently missed). Rewrite to import and call `resetTestCompanyData` from `apps/api/src/db/seed.ts:172` for the DB rows, keeping this script's own `pgboss.job` and S3-prefix cleanup (`resetTestCompanyData` does not do either). `resetTestCompanyData(db)` already resets **both** `TEST_SEED.companies` (from `apps/api/src/db/test-seed.ts`) in one transaction — no signature change needed.
- New: `apps/api/src/db/test-reset.integration.test.ts` (or similar, following the `*.integration.test.ts` convention) -- the required "two-company test": seed both `TEST_SEED` companies with rows in `ops`/`entities`, run the reset path, assert both companies' rows are gone and neither leaked into the other.

### A9 — docs refresh

- `README.md` (11 lines, entirely stale — "Protótipo", only lists planning dirs, no run/build/test instructions) -- rewrite: what fasor is, the stack (docker-compose.yml services), `docker compose up -d` to run, `docker compose --profile tools run --rm tools pnpm verify` to verify, the `prod` profile is Docker-only (`docker compose --profile tools run --rm tools pnpm --filter @app/web build` then `docker compose --profile prod up migrate && docker compose --profile prod up -d`, matching `docs/tablet-https-setup.md:84-97` but wrapped in the tools container instead of bare host pnpm), trusting the mkcert CA (point to `docs/tablet-https-setup.md`, add a short desktop-trust note since only iPad/Android are documented there today — e.g. importing `certs/ca/rootCA.pem` into the OS trust store), `seed-users.ts` usage described generically (no hardcoded id example, since a parallel branch is changing id formats).
- `AGENTS.md:28-32` -- "Running and verifying" section still reads "TODO until Story 1.1 lands: ... `pnpm lint` and `pnpm test` run at the workspace root" (no such `pnpm test` script exists). Rewrite with the real scripts (`test:unit`, `test:api`, `test:e2e`, `verify`) and the Docker Compose invocation forms (`docker compose up -d`; `docker compose --profile tools run --rm tools pnpm verify`), matching `docker-compose.yml:169`'s own comment.
- `docs/tablet-https-setup.md:84-97` -- documents running `pnpm --filter @app/web build` bare on the host before the `prod` profile, which contradicts AGENTS.md:12 ("never install or run a service natively on the machine"). Wrap it in `docker compose --profile tools run --rm tools pnpm --filter @app/web build` (or equivalent) so the doc is internally consistent.
- `_bmad-output/planning-artifacts/epics.md:720-722` -- Story 1.7's CI AC (`**Given** CI on the main branch ... **Then** the api image is built once and tagged with the commit ...`). Strike it through using the exact pattern already used at `epics.md:507` and `epics.md:1899` (`~~in CI~~ ... (2026-09-21: no CI in the MVP; ...)`), pointing at the no-CI decision already recorded in AGENTS.md (`AGENTS.md:17`, `AGENTS.md:55`).
- `scripts/seed-users.ts:11-45` -- CLI usage (`--test`, or `--company-id/--company/--email/--password/--name/--council/--number/--title`); its own doc comment at line 21 hardcodes an example company id — do not copy that literal example into README/AGENTS.md; describe the flag generically ("a company id").

### A10 — deferred-work ledger

- `_bmad-output/implementation-artifacts/deferred-work.md` -- current schema per entry: `source_spec`, `summary`, `evidence` (2 entries only). Rebuild with every item below, each entry gaining `class` (one of `bug`, `debt`, `test-gap`, `docs`, `post-mvp`) and `state` (`open`, or `closed (commit <short-sha> "<subject>")`, or `partially closed: ...`). The two existing entries map to spec-1-1 items 1 and 2 below (already correctly `open`) — keep the reset-mechanism one open (F-DUP-3 is only resolved by this same spec's A6 work; the AGENTS.md one is resolved by this spec's own A9 work, so mark it closed with a self-reference to this PR once merged).
- The 8 source files, one `deferred:` YAML-frontmatter list each **except** `spec-1-1` (which has no `deferred:` key — its deferred items are the `[defer]`-verdict rows of its "Review Triage Log" markdown table, ~lines 87-118): `_bmad-output/implementation-artifacts/spec-1-1-run-the-whole-stack-with-one-command.md`, `spec-1-2-build-the-shared-components-from-the-mockups-css.md`, `spec-1-3-sign-in-and-hold-a-session-that-survives-offline.md`, `spec-1-4-every-change-is-an-operation-applied-locally-first.md`, `spec-1-5-what-i-did-on-the-tablet-reaches-the-office-by-itself.md`, `spec-1-6-home-and-account-show-what-is-on-this-device.md`, `spec-1-7-reach-the-local-stack-from-a-tablet-over-https.md`, `spec-1-8-nothing-captured-is-lost-when-the-tab-closes-the-network-dro.md`. Full item-by-item classification and verified state (39 items, already investigated so it does not need re-deriving) is in Design Notes below — transcribe it into `deferred-work.md`'s format.
- `_bmad-output/planning-artifacts/epics.md:411` -- Definition of Done clause 1 ("Every acceptance criterion is exercised by an automated test..."). Insert a new clause right after it — "Every new API route is exercised by a cross-tenant test: a request from company A can never read or write company B's data." — and renumber the following clauses (current 2-9 become 3-10). This is the DoD's sole location (AGENTS.md:39 only points to it, carries no DoD text of its own), so no AGENTS.md edit is needed for this specific item.

### A11 — bmad-build.toml (files only)

- `_bmad/custom/bmad-build.toml` (117 lines, committed, tracked — edits will show in the PR diff) -- schema: `[workflow]` table with `persistent_facts` (array of triple-quoted strings) and `implementation_handoff` (string), plus `[[workflow.review_layers]]` / `[[workflow.oneshot_review_layers]]` arrays of `{id, name, instruction}`. No existing entry covers independent-review-re-examines-patches, mandatory browser pass, component-library/a11y/security model floor, ACs-only-against-existing-artifacts, epic-close manual-AC gate, or a parallel-story checklist — all net new. Two edits:
  1. In the existing `persistent_facts[0]` "MODEL AND EFFORT POLICY" string, add a step establishing opus/high as the floor when a story is tagged (by title/AC content) component-library, a11y-keyboard, or security-adjacent and its `epics.md` `Dev model` line names something lower on the ladder — override `{dev_model}`/`{dev_effort}` for the run without editing `epics.md`, and say so once.
  2. Append a **new** `persistent_facts` array entry (second triple-quoted string) titled e.g. `PROCESS LESSONS (Epic 1 retrospective, A11)` covering: (a) the independent review that runs after this workflow completes must re-examine this workflow's own review-layer patches, not only the original diff (PRs #4-#8 each had an internal-review-introduced defect); (b) a mandatory hands-on real-browser pass (390/768/1280px, light/dark, keyboard, offline) for any story touching UI or the service worker, because library/platform semantics were previously assumed rather than probed; (c) write acceptance criteria only against artifacts that already exist, not ones a later epic will add; (d) the epic-close gate must check every AC including manual ones, not only automated ones; (e) a checklist for starting a parallel story: unique host ports below 65535, any stubbed shared component listed as a tracked item with its removal owner, and a stated merge plan before work starts.
  - `_bmad-output/planning-artifacts/epics.md:376-395` -- "Model and effort guide" and the per-story `**Dev model:**`/`**Effort:**` lines (71 occurrences, e.g. line 492, 595, 1719) -- read-only reference for phrasing consistency; **do not edit any of these lines**.

## Tasks & Acceptance

**Execution:**
- `vitest.config.ts` -- add `test.testTimeout` (>=15000) -- stop the 5s-default flakiness opus reproduced (F-GATE-1).
- `apps/web/vite.config.ts` -- add `test.testTimeout` (>=15000) to the existing `test` block -- same fix for the jsdom project.
- `scripts/tooling.test.ts` -- remove the `seed-users.ts --test` spawn test -- stop `test:unit` writing to Postgres (F-GATE-2).
- `apps/api/src/db/seed-cli.integration.test.ts` (new) -- add the moved spawn test, following the file's existing `*.integration.test.ts` sibling conventions -- keeps DB coverage inside the existing integration suite that already runs in `verify` via `test:api`.
- `e2e/auth.spec.ts`, `e2e/sync.spec.ts`, `e2e/home.spec.ts`, `e2e/account.spec.ts`, `e2e/durability.spec.ts`, `e2e/shell.spec.ts` -- retag test titles per the Code Map mapping (and judgment calls, reasoning stated in the PR) -- makes `--grep @p0` (package.json:14) select a real subset (F-GATE-3).
- `scripts/tooling.test.ts` -- extend (or add a sibling test in the same file) an emoji scan and a `laudo` scan over `apps/**`, `packages/**`, `scripts/**`, `e2e/**` source files (excluding `node_modules`, `dist`, build output) -- emoji ban per `epics.md:148` (NFR-15) and `epics.md:200` (UX-DR6); `laudo` ban per `epics.md:416` ("routes and identifiers say `relatorio`, never `laudo`") — scope the `laudo` check to code/identifiers in the app tree, not `_bmad-output/planning-artifacts/research/**` or `docs/context/**`, which legitimately use the domain word.
- `package.json` -- append `pnpm audit --prod` to `verify` if it runs reliably in the `tools` container; otherwise add one sentence to AGENTS.md explaining why not -- closes the audit half of A6.
- `scripts/test-reset.ts` -- replace the guessed `TABLES` loop with a call to `resetTestCompanyData` from `apps/api/src/db/seed.ts`, keep the pgboss.job and S3-prefix cleanup -- one reset mechanism, real table names (F-DUP-3).
- `apps/api/src/db/test-reset.integration.test.ts` (new) -- two-company test: seed both `TEST_SEED` companies, run the reset, assert both are cleared -- the two-company proof the task asked for.
- `README.md` -- rewrite per Code Map -- F-DOC-1.
- `AGENTS.md` -- rewrite lines 28-32 per Code Map -- F-DOC-1.
- `docs/tablet-https-setup.md` -- wrap the bare host `pnpm --filter @app/web build` in the tools container -- internal consistency with AGENTS.md's Docker-only rule.
- `_bmad-output/planning-artifacts/epics.md` -- strike Story 1.7's CI AC (lines 720-722) per the existing pattern at lines 507/1899 -- F-SPEC-7.
- `_bmad-output/planning-artifacts/epics.md` -- insert the cross-tenant DoD clause after line 411, renumber 2-9 to 3-10 -- A10's DoD addition.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- rebuild with all 39 items (Design Notes below has the full list with class/state) -- F-DEBT-1.
- `_bmad/custom/bmad-build.toml` -- the two edits described in the Code Map -- A11 files-only.

**Acceptance Criteria:**
- Given the rewritten `vitest.config.ts` and `apps/web/vite.config.ts`, when `docker compose --profile tools run --rm tools pnpm test:unit` runs 3 times in a row, then all 3 runs are green with no timeout failures.
- Given `scripts/tooling.test.ts` after the move, when `pnpm test:unit` runs, then it makes no Postgres connection (no `seed-users.ts --test` spawn remains in it).
- Given the new `apps/api/src/db/seed-cli.integration.test.ts`, when `pnpm test:api` runs, then it still provisions and asserts the two test companies via the CLI.
- Given the retagged e2e tests, when `pnpm test:e2e` (which greps `@p0`) runs, then it selects a strict subset of the full e2e suite (not all tests), and it still passes.
- Given the emoji/laudo scan, when a UI copy string or identifier introduces an emoji or the word `laudo` under `apps/**`/`packages/**`/`scripts/**`/`e2e/**`, then `pnpm test:unit` fails with a clear message naming the offending file.
- Given `scripts/test-reset.ts` after the rewrite, when it runs against seeded data for both `TEST_SEED` companies, then both companies' `ops`/`entities`/`sync_device_push` rows are cleared and the guessed nonexistent-table list is gone.
- Given the rewritten README.md and AGENTS.md, when a new developer follows them from a clean checkout, then every command shown (`docker compose up -d`, the tools-container `verify`, the `prod` profile sequence, `seed-users.ts` usage) is copy-pasteable and correct against the current `docker-compose.yml` and `package.json`.
- Given `epics.md`, when Story 1.7's CI AC and the DoD section are inspected, then the CI AC is struck through with a dated note like the two existing precedents, and the new cross-tenant DoD clause reads correctly in the renumbered list.
- Given the rebuilt `deferred-work.md`, when every item from all 8 `spec-1-*.md` files is checked, then each appears exactly once (duplicates cross-referenced, not dropped) with a `class` and a `state` that matches the current code (verified, not copied from the retro's estimate).
- Given `_bmad/custom/bmad-build.toml`, when it is parsed as TOML, then it is still valid, the existing `review_layers`/`oneshot_review_layers`/`implementation_handoff` entries are unchanged, and the two new pieces of policy text are present.
- Given `epics.md`, when every `**Dev model:** ... · **Effort:** ...` line is diffed against `main`, then none of them changed.

## Spec Change Log

## Review Triage Log

### 2026-09-22 — Review pass
- verdicts: 20 findings — high 1, medium 5, low 7, false 7, maybe-false 0
- findings:
  - `[medium]` `[patch]` scripts/test-reset.ts silently ignored its own `<company-id>` argument for the DB reset (`resetTestCompanyData` isn't parameterized by company) — patched: added a guard that fails loudly with the list of valid ids for any company id other than the two `TEST_SEED` ones, instead of a misleading success message (blind-hunter).
  - `[low]` `[patch]` deferred-work.md's header claimed cross-spec duplicates are "recorded once with both source_spec values," but the actual format records two cross-referencing entries — patched: reworded the header to match the actual format (blind-hunter).
  - `[low]` `[patch]` two spec-1-1 ledger entries read "closed (this PR ... verify the merge commit once it lands)," a forward-looking claim at odds with the ledger's own "verified against current code" principle — patched: reworded to "closed (branch fix/epic-1-gate-docs-ledger, this file's own PR)" since the fix ships in the same commit as the ledger update (blind-hunter).
  - `[false]` `1.8-AC-001` and the untitled shell test were not retagged despite the spec's Code Map flagging them for a judgment call — refuted: the implementer's report gives explicit reasoning for keeping both `@p0` (trivial smoke test; foundational SW precache-list test, not Chromium-gated), and the AC only requires the `@p0` filter select a strict subset, which it does — 8 of 21 under `test:e2e`, all 21 pass under the new `test:e2e:full` (blind-hunter).
  - `[low]` `[patch]` bmad-build.toml's new opus/high floor check said "below opus/high on the ladder," but the declared ladder ranks models only, leaving opus-at-lower-effort and fable-at-any-effort ambiguous — patched: reworded to state fable at any effort already meets the floor, and opus below high or sonnet at any effort gets raised (blind-hunter).
  - `[low]` `[reject]` bmad-build.toml's new process-lessons text cites memory `human-style-e2e-testing`, not in the visible memory index — rejected: carried verbatim from the retrospective's own P2 finding, not invented here; a dangling process-doc pointer has no functional consequence, and removing it would diverge from the retrospective's record (blind-hunter).
  - `[low]` `[reject]` the new emoji regex only catches VS-16-forced BMP symbols in U+2600-27BF, missing others like the info/arrow/keycap emoji — rejected: the regex was deliberately tuned to avoid false-flagging the mockup's byte-identical `✓` checkmark glyph in components.css; widening it risks reintroducing that exact false positive and would need re-verification against the mock, so the fix is not a direct correction, and the missed symbols are not plausible in this app's actual copy (blind-hunter).
  - `[low]` `[patch]` the emoji/forbidden-word scan's SCAN_EXTENSIONS excluded `.json`/`.yaml` — patched: widened to include them after confirming no existing json/yaml file under the four scanned roots contains the forbidden word (blind-hunter, edge-case-hunter).
  - `[medium]` `[patch]` the new test-reset.integration.test.ts deleted its OTHER_COMPANY_ID probe rows in bare statements after its assertions, so a failing assertion would leave them in place and poison the next run's length checks — patched: wrapped the body in try/finally (blind-hunter).
  - `[false]` epics.md DoD clause 4 still reads "docker compose up" while this PR's other docs say "docker compose up -d" — refuted: clause 4's text is pre-existing (only renumbered, not authored, by this diff) and matches epics.md's own convention elsewhere in the same file (lines 502, 710, untouched); changing it would introduce a new inconsistency within epics.md itself (blind-hunter).
  - `[false]` the rebuilt deferred-work.md has 40 entries while the spec's own Design Notes list 39 — refuted: the extra entry is the `pnpm audit --prod`/esbuild-advisory item, discovered during the A6 investigation itself and not in any source spec's `deferred:` list, so it couldn't have been in the original count; the ledger is correct and complete, only the spec's own printed count is stale, and a finding whose only fix is editing this build's spec is rejected by rule (blind-hunter).
  - `[high]` `[patch]` `resetTestCompanyData`'s own doc comment (apps/api/src/db/seed.ts:162-171, pre-existing) warns it must never run while other apps/api `*.integration.test.ts` files are seeding the same TEST_SEED companies in their own beforeAll, since "a reset there would wipe rows a neighbouring file had just written"; the new test-reset.integration.test.ts calls it directly from inside that same suite, and file-level parallelism was not disabled anywhere — patched: added `fileParallelism: false` to the new apps/api/vitest.config.ts; verified test:api's total duration (23s) stays far under the 15-minute gate budget (edge-case-hunter).
  - `[medium]` `[patch]` duplicate of the test-reset.ts company-id finding above (edge-case-hunter).
  - `[low]` `[patch]` duplicate of the SCAN_EXTENSIONS finding above (edge-case-hunter).
  - `[false]` claimed the Story 1.7 CI-AC strikethrough uses a broader scope than the cited precedent at epics.md:507/1899 (whole block vs. just the "in CI" phrase) — refuted: unlike those precedents, where the described work still happens through a different mechanism, Story 1.7's AC describes a CI-triggered build/tag with no surviving equivalent, so striking the entire criterion is the semantically correct scope; the dated note still points at the same no-CI decision (edge-case-hunter, confidence medium).
  - `[medium]` `[patch]` 13 e2e tests retagged off `@p0` became unreachable by any pnpm script (`test:e2e:matrix`'s durability-* projects are scoped by testMatch to durability.spec.ts only, and no other script ran desktop-chrome without the `--grep @p0` filter) — patched: added `test:e2e:full` (desktop-chrome + durability-desktop-chrome, no tag filter) to package.json, documented in AGENTS.md as what the epic retrospective runs for the P1 coverage check; verified all 21 tests pass under it (verification-gap).
  - `[medium]` `[patch]` duplicate of the test-reset.ts company-id finding above (verification-gap).
  - `[false]` the diff carries no execution evidence proving A6's "run it 3 times green"/"so the matrix can run"/"so the filter selects a subset" claims — refuted: a unified diff cannot carry execution transcripts by nature; the orchestrating session ran `test:unit` x3, `test:api`, `test:e2e`, `test:e2e:matrix`, `test:e2e:full`, `lint` and `static` against the real compose stack outside the diff, pasted into the PR body per the project's own merge-gate convention (intent-alignment).
  - `[false]` the emoji/forbidden-word scan covers all source text, broader than A6's literal "in source/copy" wording — refuted: matches AGENTS.md's actual, broader policy ("No emoji anywhere: UI strings, documents, mocks, code, commit messages..."), the authority A6 itself points at (intent-alignment).
  - `[false]` the new cross-tenant DoD clause lives only in epics.md, not also in AGENTS.md — refuted: AGENTS.md carries no DoD text of its own anywhere, only a pointer to epics.md's DoD, matching the intent's own conditional wording ("AGENTS.md if nowhere else") (intent-alignment).

## Design Notes

### A10 full deferred-item list (39 items; transcribe into `deferred-work.md`, one entry per row, keep both source_specs when an item is a cross-spec duplicate)

**spec-1-1** (Review Triage Log `[defer]` rows, no YAML `deferred:` key):
1. Test-reset guesses table names / only clears `pgboss.job`, plus scoping (company_id, S3 prefix) untested — class `test-gap` — state: **open** until this spec's own A6 task lands, then closed by this PR's commit.
2. AGENTS.md "Running and verifying" still shows host pnpm that fails on this host — class `docs` — state: **open** until this spec's own A9 task lands, then closed by this PR's commit.

**spec-1-2** (3 items):
1. Toggle/Checkbox/SegmentedControl/FilterChipGroup never show selected/on fill — class `bug` — state: **partially closed** (SegmentedControl fixed, commit `3395035` "Story 1.6 ... (#7)"; Toggle/Checkbox/Chip still open, unchanged since `a2c1190`).
2. Hit-area/typography ACs verified only via jsdom class/var presence, not rendered pixels — class `test-gap` — state: **open** (no component-level visual test tier exists).
3. `_bmad/custom/config.toml` gaining `[core]`/`[modules.bmm]` keys — class `debt` — state: **closed (not applicable — describes transient local orchestration state never actually committed as described)**.

**spec-1-3** (4 items):
1. Extend cross-tenant sweep (1.3-API-002) to stream/file/generate/revision routes as they land — class `test-gap` — state: **open** (those routes don't exist yet; covered going forward by this spec's new DoD clause).
2. Convert registration save to a `user/{id}/{field}` op once the op log lands — class `debt` — state: **open** (`auth-client.ts:140` still does a bare PUT fetch; op log shipped in 1.4 but this conversion was never done).
3. Restore sign-out dialog's pending-sync wording/count once 1.5 provides counts — class `debt` — state: **closed (commit `3395035` "Story 1.6 ... (#7)")**.
4. `revokeSessions` filters on `session.company_id`, theoretically bypassable by a null-company_id row inserted another way — class `bug` — state: **open (unverified, theoretical edge case, unchanged since `be86c65`)**.

**spec-1-4** (5 items):
1. Replay byte-equality test on the Porto Seguro fixture once Story 3.7 ships it — class `test-gap` — state: **open** (Epic 3 still backlog).
2. Validate seed-defined path segments against `getDefinition` once Story 3.1 ships — class `test-gap` — state: **open** (Epic 3 still backlog).
3. `applyOps` reject server-only families/spoofed device_id/actor_id for client pushes — class `bug`/`test-gap` — state: **closed (commit `60f11fe` "Story 1.5 ... (#6)")**.
4. Re-materialize entities excluding dead ops (AD-24) — class `bug` — state: **closed (commit `60f11fe` "Story 1.5 ... (#6)")**.
5. Coalescing option (a) vs (b) architecture decision — class `debt` — state: **closed (decision made: option (b), commit `60f11fe`; option (a) remains a documented future alternative, not a blocking open item)**.

**spec-1-5** (10 items):
1. Per-relatorio progress in company pull summary once kernel `progress(snapshot)` exists — class `post-mvp` — state: **open**.
2. Coalescing option (a) stays open for the architect — class `debt` — state: **open (soft, non-blocking; duplicate of spec-1-4 item 5, cross-reference)**.
3. Feed the minted `device_id` into every committed op once a capture surface calls `commitBatch` — class `post-mvp` — state: **open** (`CommitDeps` in `apps/web/src/db/commit.ts:27-30` still `{newId, now}`).
4. Define outbox retention (acked rows never pruned) — class `debt` — state: **open** (duplicate of spec-1-8 item 1, cross-reference).
5. Assert the request log carries `relatorio_id` for the relatorio stream route — class `test-gap` — state: **open (unverified)**.
6. Move Story 1.3 account calls onto contract route definitions — class `debt` — state: **open** (`auth-client.ts` still calls literal paths; no `ACCOUNT_ROUTES` in the contract).
7. Add the sync badge's short word for every state — class `bug` — state: **closed (commit `3395035` "Story 1.6 ... (#7)")**.
8. Re-auth banner dismiss must not fire a sync cycle at once — class `bug` — state: **open, partially advanced** (`dismissReAuth` now exists, `apps/web/src/state/session.tsx:225`, added in `3395035`, but no UI surface calls it yet and `sync.tsx:119-121` still calls `engine.resume()` unconditionally).
9. Define retention/compaction for `remote_ops` — class `debt` — state: **open**.
10. Decide whether "Reenviar" of a dead create must re-send later acked puts on the same entity — class `post-mvp` — state: **open** (not reachable until Epic 5 multi-op batches).

**spec-1-6** (5 items):
1. Home card counted forms ("Baixando… n de m") once company summary carries `progress(snapshot)` — class `post-mvp` — state: **open** (duplicate of spec-1-5 item 1, cross-reference).
2. Decide whether `syncCounts` takes the snapshot beside the outbox — class `debt` — state: **open**.
3. Port Toggle/Checkbox/FilterChipGroup onto the ToggleButtonGroup fix pattern — class `bug` — state: **open** (duplicate of spec-1-2 item 1, cross-reference).
4. Apply stored theme before first paint — class `bug` — state: **closed (commit `38ca1d3` "Story 1.8 ... (#8)")**.
5. Publish the remaining five banner kinds as their conditions become real — class `post-mvp` — state: **partially closed** (`draft-found` and `unsynced-5-days` added, commit `38ca1d3`; `suggestions-ready`/`relatorio-exported`/`conflict` remain, gated on Epics 8/7/10, still backlog).

**spec-1-7** (2 items):
1. `build-tagged-image.sh` produces byte-identical tags (no COPY, bind-mount only) — class `post-mvp` — state: **open** (explicitly deferred to Epic 11).
2. `apps/api/src/db/migrate.ts` has no automated test, not invoked by `pnpm verify` — class `test-gap` — state: **open** (migrations now exist, `apps/api/drizzle/0000_sweet_solo.sql` etc., but still untested).

**spec-1-8** (7 items):
1. Outbox retention (duplicate of spec-1-5 item 4, cross-reference) — class `debt` — state: **open**.
2. FR-54 scenario 2 covers op push only; photo-upload half lands with Story 6.2's uploader — class `post-mvp` — state: **open** (Epic 6 backlog).
3. 500 MB storage-low banner has no publisher — class `post-mvp`/`bug` — state: **open** (deliberately incomplete pending manual iPad calibration, A1).
4. Draft sources registered per-surface only by capture screens; only the fixture route registers one today — class `post-mvp` — state: **open**.
5. Offline cold open asserted on Chromium only; WebKit's offline reopen not covered — class `test-gap` — state: **open** (known Playwright/WebKit limitation, mitigated by the manual iPad script).
6. Durability projects sign in via `/api/auth/*` instead of the Login form (WebKit drops Secure cookies on http origin) — class `test-gap` — state: **open** (same tool-limitation category as item 5).
7. Scenarios 1.8-E2E-002/005 run with the service worker disabled (Playwright can't intercept through SW outside Chromium) — class `test-gap` — state: **open** (tooling limitation).

**New item to add** (from A9's own investigation, not from a spec's `deferred:` list): a "sample-relatorio" seed flag for `seed-users.ts` — class `post-mvp` — state: **open** — evidence: would need new op-log-replay plumbing through `applyOp` to seed from `packages/domain/fixtures/replay-small/op-log.ts`-style fixtures; not a flag flip.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:unit` -- run 3 times in a row -- expected: all 3 green, no timeout failures, no Postgres connection attempted.
- `docker compose --profile tools run --rm tools pnpm test:api` -- expected: green, includes the moved seed-cli integration test and the new test-reset two-company integration test.
- `docker compose --profile tools run --rm tools pnpm test:e2e` -- expected: green, and the set of tests actually run is a strict subset of the full e2e suite (proves the `@p0` retag took effect).
- `docker compose --profile tools build tools && docker compose --profile tools run --rm tools pnpm test:e2e:matrix` -- expected: the `durability-webkit` project runs without a "browser not found"/executable-missing error.
- `docker compose --profile tools run --rm tools pnpm verify` -- expected: green end to end, output pasted in the PR.
- `docker compose --profile tools run --rm tools pnpm audit --prod` -- if added to `verify`, run standalone once first to confirm it doesn't hang/fail on network access inside the tools container.

**Manual checks (if no CLI):**
- Read the rewritten README.md and AGENTS.md end to end and confirm every command shown matches an actual `package.json` script or `docker-compose.yml` service/profile.
- Diff `epics.md` against `main` and confirm no `**Dev model:**`/`**Effort:**` line changed, only the Story 1.7 CI AC strikethrough and the DoD clause insertion.
- Read the rebuilt `deferred-work.md` and spot-check 3-4 "closed" entries' cited commit SHAs with `git show <sha> --stat`.

## Auto Run Result

**Summary:** Implemented A6 (deterministic, wider gate), A9 (docs refresh), A10 (rebuilt deferred-work ledger, cross-tenant DoD clause) and the file-only part of A11 (bmad-build.toml process lessons), then fixed every real finding the 4-layer review surfaced, including a genuine test-suite race condition the implementation introduced.

**Files changed** (baseline `88a6664`):
- `vitest.config.ts`, `apps/web/vite.config.ts`, `apps/api/vitest.config.ts` (new) -- raised `testTimeout` to 15s on all three vitest projects; the new api config also disables file parallelism (review fix, see below).
- `scripts/tooling.test.ts` -- removed the Postgres-touching seed-users spawn test; added emoji and forbidden-document-word scans over `apps/**`/`packages/**`/`scripts/**`/`e2e/**` (incl. json/yaml after the review fix).
- `apps/api/src/db/seed-cli.integration.test.ts` (new) -- the moved Postgres-touching test, now in the integration suite.
- `scripts/test-reset.ts` -- rewritten to call `resetTestCompanyData`, with a review-added guard against a non-test company id.
- `apps/api/src/db/test-reset.integration.test.ts` (new) -- the two-company (plus a third, other-company control) reset test; review-fixed to clean up in `finally`.
- `e2e/auth.spec.ts`, `e2e/sync.spec.ts`, `e2e/home.spec.ts`, `e2e/account.spec.ts`, `e2e/durability.spec.ts` -- 13 tests retagged `@p1`/`@p2` per `test-design-qa.md` and judgment.
- `package.json` -- added `test:e2e:full` (review fix, so the retagged tests stay reachable); did not add `pnpm audit --prod` to `verify` (real moderate advisory in a dev-only transitive dependency, documented instead).
- `README.md`, `AGENTS.md`, `docs/tablet-https-setup.md` -- refreshed per A9; AGENTS.md also documents the audit non-inclusion and `test:e2e:full`.
- `_bmad-output/planning-artifacts/epics.md` -- struck Story 1.7's CI AC through (F-SPEC-7); inserted the cross-tenant DoD clause (A10), renumbered 2-9 to 3-10; zero `Dev model`/`Effort` lines touched.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- rebuilt with 40 entries (39 planned + the audit/esbuild item found during A6 work), each with class/state verified against current code and git history; review-fixed header wording and two premature "closed" claims.
- `_bmad/custom/bmad-build.toml` -- added the opus/high floor-check step (review-clarified for effort ambiguity) and the 5-part process-lessons block (A11 P1-P6).

**Review findings breakdown** (20 findings across blind-hunter, edge-case-hunter, verification-gap and intent-alignment; full detail in Review Triage Log above):
- Patched (8 grouped entries, 12 rows): a real race condition where the new reset integration test could wipe rows a sibling `apps/api` integration test was mid-seeding (fixed with `fileParallelism: false`); `test-reset.ts` silently no-op'ing on the DB side for a non-test company id (fixed with a guard); a self-poisoning cleanup in the new reset test (fixed with try/finally); 13 retagged e2e tests becoming unreachable by any script (fixed by adding `test:e2e:full`); the emoji/word scan missing json/yaml (widened); three documentation-accuracy nits in `deferred-work.md` and `bmad-build.toml` (reworded).
- Rejected as low/cosmetic (2): a dangling memory citation carried verbatim from the retrospective; an emoji-regex gap for exotic VS-16 symbols where widening risks reintroducing a known false positive against the mockup's checkmark glyph.
- False (7): 1.8-AC-001/shell not retagged (a deliberate, reasoned decision, AC still met); epics.md DoD clause 4's pre-existing "docker compose up" wording (not authored by this diff, matches the file's own convention); the ledger's 40-vs-39 count (the extra item is a legitimate new discovery, not an omission); the CI-AC strikethrough's scope (semantically correct, not a precedent violation); and three intent-alignment observations (execution evidence lives in the PR body, not the diff; the scan's broader scope matches actual project policy; the DoD clause's single location matches the intent's own conditional).

**Follow-up review recommended:** true. This pass patched a `high` finding (the `apps/api` test-parallelism race). The specific unverified risk: `fileParallelism: false` was verified to fix the one race found (re-ran `test:api` clean afterward, single run) but was not stress-tested across many repeated runs, and serializing `apps/api`'s test files could surface latent ordering assumptions elsewhere in that suite that concurrent execution previously masked.

**Verification performed:** `pnpm test:unit` x3 consecutive green (before and after the review patches, 6 total green runs); `pnpm test:api` (10/11 files green; the 1 failure, `src/sync/replay.integration.test.ts`, is a pre-existing baseline defect confirmed unrelated to this diff -- reproduced identically on files this diff never touches, `origin/main` unchanged at the same commit); `pnpm test:e2e` (8/8 `@p0` green, confirming the retag produces a strict, non-trivial subset); `pnpm test:e2e:full` (21/21 green, confirming every retagged test stays reachable); `docker compose --profile tools build tools` + `pnpm test:e2e:matrix` (18/18 green across Chromium, Android-Chrome and WebKit, confirming the tools image's WebKit install); `pnpm lint` and `pnpm static` clean; `pnpm audit --prod` run standalone (exit 1, one moderate advisory in `drizzle-kit`'s dev-only `esbuild` transitive dependency, documented rather than gated on).

**Residual risks:** the pre-existing `replay.integration.test.ts` failure (unrelated, out of the forbidden `apps/api/src/sync` / `packages/domain` paths, likely addressed by the parallel identity-id branch); the `fileParallelism: false` stress-test gap noted above; `test-reset.ts`'s CLI now rejects any company id outside the two `TEST_SEED` companies rather than resetting an arbitrary real company -- a deliberate, spec-directed narrowing (see deferred-work.md) rather than a defect.

### Independent review (PR #10, external subagent, approve)

Verdict: **approve**, verified empirically (re-ran `test:unit` x3, `test:api`, `test:e2e`, `test:e2e:full`, `test:e2e:matrix`, `lint`, `static`, `pnpm audit --prod`, all matching this PR's claims; independently reproduced the pre-existing `replay.integration.test.ts` failure on current `origin/main` tip in an isolated scratch stack, confirming it predates and is unrelated to this PR and is not yet fixed by the parallel identity-id branch either). Findings and their disposition:
- `[medium]` `apps/api/src/db/seed.ts`'s `resetTestCompanyData` doc comment still said "called by the Playwright global setup only," not mentioning the two new callers this PR adds or that `fileParallelism: false` is now load-bearing for one of them -- fixed: comment updated to name both new callers and warn against re-enabling file parallelism without re-solving the race.
- `[low]` this spec and the PR description said "11 e2e tests retagged"; actual count is 13 -- fixed: corrected in this spec's Code Map, Review Triage Log and Auto Run Result.
- `[low]` `deferred-work.md` used two compound `class` values (`bug/test-gap`, `post-mvp/bug`) outside its declared 5-value enum -- fixed: each set to its single dominant class (`bug` for the closed `applyOps` validation item; `post-mvp` for the deliberately-incomplete storage-low banner item).
- `[informational]` the untracked scratch file `_scratch_inspect.mjs` left over from an earlier interrupted implementation pass -- noted, harmless, not part of the diff, left as-is.

All three actionable findings were fixed in a follow-up commit; re-ran `pnpm lint`, `pnpm static` and `pnpm test:api` afterward (same 10/11-files/54/56-tests result as before, confirming no regression from the comment/wording-only changes). No second independent review pass was run for these fixes: all three are documentation/comment corrections with no behavior change, already re-verified by command.
