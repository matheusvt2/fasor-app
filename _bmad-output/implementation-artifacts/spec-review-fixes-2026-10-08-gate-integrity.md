---
title: 'Review fixes 2026-10-08: gate integrity (focused tests, test ids, sync arrange, recurring unit failures)'
type: 'bugfix'
created: '2026-10-08'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/review-fixes-2026-10-08-context.md'
warnings: ['batched']
batched_reason: 'Four gate-integrity findings (TST-V1, TST-V2, TST-2, E13-A2) share the test tooling files (scripts/e2e.ts, scripts/e2e.test.ts, the configs) and one story gate.'
deferred:
  - summary: 'scripts/e2e.ts summarize keys results by title, so under --repeat-each the summary counts each title once with its last outcome (a run with 2 failed repeats printed "14 passed" while Playwright exited 1; the exit code stays right).'
    evidence: 'scripts/e2e.ts collect(); .scratch run tst2-x5 of this batch'
    severity: low
  - summary: 'The signIn setup helper waits 5 s for Home ("Relatórios por status"); under host load 12.2-E2E-006 failed there 2 of 5 repeats, then passed 3 of 3 isolated.'
    evidence: 'e2e/support/merged-fixtures.ts signIn; journey-forward.spec.ts:172'
    severity: low
  - summary: 'number-input.test.tsx leaked timer: the unhandled error of PR #105 could not be reproduced on demand (nor with --detectAsyncLeaks); the harness now clears its timers on unmount, which removes the only timer that outlived a test.'
    evidence: 'apps/web/src/components/number-input.test.tsx Harness'
    severity: low
---

<intent-contract>

## Intent

**Problem:** The gate can go green on less than it claims. Playwright had no `forbidOnly` and every group runs with `--pass-with-no-tests`, so a stray `test.only` or a mistyped spec path passed on one test or none (TST-V1). Five e2e test ids are carried by two tests each (TST-V2). Three tap-timing specs arrange their sync with an inline "Sincronizar agora" click that returns on `data-pending="0"`, which can hold before the cycle ran (TST-2). And `test:unit` is red under load on almost every gate, so five Epic 13 PRs merged red (E13-A2, R13-6).

**Approach:** Refuse focused tests at four layers (Playwright `forbidOnly`, Vitest `allowOnly: false`, `eslint-plugin-playwright`, a tooling scan), fail a spec path that matched no test, renumber the duplicate ids behind a `duplicateTestIds()` check, move the three arranges onto `syncNow`/`syncNowAndReturn` behind a tooling check, and fix each recurring unit failure at its root cause.

## Boundaries & Constraints

**Always:** verify each finding against `origin/main` before fixing; a mechanism fix ships a mutation run; a longer timeout only where the root cause is a legitimately slow path, stated in the code.

**Never:** retries; renumbering the id the retros cite (lost-taps `12.1-E2E-007` keeps its id); changing what a spec asserts beyond its arrange; edits to `sprint-status.yaml` or `epics.md`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Focused e2e | `test.only` in any spec | Playwright refuses the run; lint error `playwright/no-focused-test`; tooling scan lists the line | Gate red |
| Focused unit | `it.only` in any unit file | Vitest fails the run (`allowOnly: false`) in every project | Gate red |
| Mistyped path | `scripts/e2e.ts e2e/a.spec.ts e2e/tpyo.spec.ts` | Exit 1, `spec path matched no test: e2e/tpyo.spec.ts` | Gate red |
| Serial path in parallel group | a serial spec path only | Matches in the serial group, so exit 0 | none |
| Duplicate id | two `test(` calls carrying `12.1-E2E-007` | `duplicateTestIds()` lists it | Unit red |
| Late theme read | press "Escuro" before the stored theme is read | Attribute stays `dark`; the late read is ignored | none |

</intent-contract>

## Code Map

- `playwright.config.ts` -- add `forbidOnly: true`.
- `vitest.config.ts`, `packages/domain/vitest.config.ts`, `apps/web/vite.config.ts` (`test`), `apps/api/vitest.config.ts` -- `allowOnly: false` (per-project option; the projects load their own configs).
- `scripts/e2e.ts:79` `groupArgs` (keeps `--pass-with-no-tests`), `summarize` collects `files`, new `specFilters`, `unmatchedFilters` (mirrors Playwright's `createFileFiltersFromArguments`: `:line[:col]` dropped, `/re/` literal, else case-insensitive regex on the absolute path), `combine` fails on unmatched paths.
- `eslint.config.js` + root `package.json`/`pnpm-lock.yaml` -- `eslint-plugin-playwright` 2.12.1 (peer `eslint >=8.40`), rules `no-focused-test`, `missing-playwright-await` on `e2e/**`.
- `scripts/e2e.test.ts` -- tests for the above, the focused-test scan over `e2e`, `apps`, `packages`, `scripts`, `testIds`/`duplicateTestIds`, and the TST-2 check on the tap-timing entries of `SERIAL_SPECS` (`e2e/support/groups.ts`).
- Duplicate ids (verified): `12.1-E2E-007` (`lost-taps.durability.spec.ts:285`, `ficha.spec.ts:840`), `12.1-E2E-008` (`sheet-knows-12-3-12-4.spec.ts:278`, `ficha.spec.ts:916`), `13.7-E2E-001` (`plate-every-type.spec.ts:73, 83`), plus `8.1-E2E-005` (`suggestions.spec.ts:279`, `nameplate-values.spec.ts:40`) not in the report.
- TST-2: `e2e/journey-taps.spec.ts:155-162`, `e2e/lost-taps.durability.spec.ts:134-140`, `e2e/journey-forward.spec.ts:55-64`; helpers `e2e/support/sync.ts` `syncNow`, `syncNowAndReturn`.
- E13-A2: `apps/web/src/state/theme.tsx` + `theme.test.tsx`; `apps/web/src/surfaces/export/export-dialog.test.tsx:271` (press deferred until the dialog's read, `export-dialog.tsx:197-219`); `apps/web/src/components/number-input.test.tsx:21` (harness `setTimeout` never cleared); `session.test.tsx`, `sumario-surface.test.tsx` (checked under load); `apps/web/src/test-setup.ts`.

## Tasks & Acceptance

**Execution:**
- `playwright.config.ts`, the four Vitest configs -- forbid focused tests -- TST-V1.
- `scripts/e2e.ts` -- fail a spec path matching no test -- TST-V1.
- `eslint.config.js`, `package.json`, `pnpm-lock.yaml` -- Playwright lint rules -- TST-V1.
- `e2e/ficha.spec.ts` (`12.1-E2E-011`, `12.1-E2E-012`), `e2e/nameplate-values.spec.ts` (`8.1-E2E-010`), `e2e/plate-every-type.spec.ts:83` (`13.7-E2E-002`) -- renumber -- TST-V2.
- The three tap-timing specs -- use the shared sync helpers -- TST-2.
- `apps/web/src/state/theme.tsx` -- a choice made before the stored theme is read wins (`chosen` ref) -- E13-A2 root cause of "expected null to be 'dark'".
- `export-dialog.test.tsx:271` -- wait for the press to be taken -- E13-A2.
- `number-input.test.tsx` harness -- clear its store timers on unmount -- E13-A2.
- `scripts/e2e.test.ts` -- guard tests -- all items.

**Acceptance Criteria:**
- Given a `test.only` in a spec, when lint or the e2e runner runs, then each fails (mutation runs in the PR body).
- Given `scripts/e2e.ts` called with one real and one mistyped spec path, when it ends, then it exits 1 naming the mistyped path.
- Given the e2e specs, when `test:unit` runs, then `duplicateTestIds()` finds none.
- Given the three tap-timing specs, when each runs 5 times serially under the lock, then the results are reported.
- Given the story gate, when `test:unit` runs twice in a row, then it exits 0 both times.

## Design Notes

The JSON report names spec files relative to `testDir` (`rootDir: /workspace/e2e`), so `unmatchedFilters` resolves them under `e2e/` before matching, as Playwright matches the absolute path. A path whose every test a `--grep` filtered out counts as unmatched: that is the "gate ran nothing for this spec" case.

## Verification

**Commands:**
- `podman compose --profile tools run --rm --user root tools pnpm lint|static|test:unit|test:api` -- exit 0.
- `pnpm exec tsx scripts/e2e.ts e2e/journey-taps.spec.ts e2e/lost-taps.durability.spec.ts e2e/journey-forward.spec.ts e2e/ficha.spec.ts e2e/nameplate-values.spec.ts e2e/plate-every-type.spec.ts e2e/sheet-knows-12-3-12-4.spec.ts e2e/suggestions.spec.ts --project desktop-chrome --project durability-desktop-chrome` under the lock -- exit 0.

## Auto Run Result

Status: done. Implemented by the orchestrator in place of `bmad-dev-opus-high` (no subagent tool in this session). Story gate: lint, static, test:api 550/550, test:unit 3097/3097 twice in a row; touched specs and mutation runs as listed in the PR body.

## Independent review (2026-10-08, PR #116)

16 findings kept. Fixed in the batch branch:

- r8gate-tests-1: the 5 s `asyncUtilTimeout` left `apps/web/src/test-setup.ts` (the shared setup is back to its `origin/main` form) and is set only in `session.test.tsx` and `theme.test.tsx`, whose waits end on a Dexie open or write on fake-indexeddb. A `camera-view.test.tsx` guard keeps the default ceiling under `TAKE_PHOTO_TIMEOUT_MS`, so its rejection tests cannot pass on the timeout's fallback.
- r8gate-tests-6, r8gate-rules-7, r8gate-correctness-2: `specFilters` walks the arguments as Commander does for `playwright test`, from a table of every option of Playwright 1.63 with its arity (`PLAYWRIGHT_TEST_OPTIONS`); a tooling test compares the table with the installed Playwright's own options and the filters with its own parser.
- r8gate-tests-3: a spec path counts as matched only through a test that ran: a spec whose every test skipped, or a `:line[:column]` on which no ran test or describe starts, fails the run. The message is now "spec path ran no test", and a run of skipped tests only counts as no test run.
- r8gate-rules-2: `playwright/no-wait-for-timeout` is a warning on `e2e/**` with an allow-list (`e2e/support/taps.ts`, `e2e/lost-taps.durability.spec.ts`).
- r8gate-rules-1: `deferred-work.md` closes the E13-A2 row and carries this batch's deferrals, the three above and the review's known-open findings.
- r8gate-rules-4: `docs/kbs/log.md` keeps both wave-1 lines when `origin/main` is merged.

Known open, each a ledger row: r8gate-correctness-1, r8gate-correctness-3 with r8gate-tests-4, r8gate-tests-2, r8gate-tests-5, r8gate-rules-5. r8gate-rules-3 (files outside the listed ownership) and r8gate-rules-6 (a note for PR #115) are recorded in the PR body.
