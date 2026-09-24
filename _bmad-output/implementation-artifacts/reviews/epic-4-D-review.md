# Epic 4 batch D review: Story 4.8 (document skeleton as a numbered DOCX revision)

PR #24, branch `story/4-8-docx-skeleton-renderer`, compose project `fasor-e4d` (ports 150xx).

## 1. Human-style browser pass (2026-09-24)

A throwaway Playwright script (scratch, never committed) drove the real UI on the `fasor-e4d` stack: sign in as Empresa B, create a relatório from Home, the Sumário, the foot's "Gerar relatório", the Export dialog, keyboard, offline, 390/768/1280 px, light and dark, and the api recreated with `GENERATE_FAULT=libreoffice_timeout` for the failed-job path. Screenshots: `qa-epic-4-D/NN-*.png`. The mock `73-exportar.html` was compared by its class list and copy (a `file://` render of the mock loses its stylesheet, so no mock screenshot is kept).

| AC (epics.md Story 4.8) | Result | Evidence |
|---|---|---|
| Revision 1 with `docx`/`pdf` file rows reaches the device; job `done`, `toc_converged`; log `duration_ms` | pass | `04`, api log `generate done ... duration_ms: 6890, toc_passes: 2, toc_converged: true, pages: 7`; `generate.integration.test.ts` |
| DOCX structure (header, footer, cover, document control, ÍNDICE pages = PDF outline, sections) | pass (automated); Bruno's read pending | `docx.test.ts` golden, 4.8-INT-002; `qa-epic-4-D/porto-seguro-skeleton-rev1.docx` for Bruno |
| `GENERATE_FAULT=libreoffice_timeout`: failed, no revision, no file; next generate is number 1 | pass | `15-failed-job-*` (alert, "Nenhuma revisão gerada ainda."), api log `generate failed ... libreoffice_timeout`; `16-after-fault-rev1-1280-light` |
| Dialog: flush, request, working "Gerando revisão 1…" + "pode fechar", close and reopen into working, toast, `issue` op, result row opens the DOCX | pass | `02`, `03`, `04`; download `relatorio-rev-1.docx`, 200, DOCX mime, `attachment`, `nosniff`; `11`-`13`: dialog closed, Sumário left and reopened, toast "Revisão 1 pronta — DOCX" and pill Emitido on return |
| Second press with no edit: "Revisão 1 pronta" again, no op, no second row | pass | `07-idle-with-revision-*`, `08` |
| 390/768/1280, light/dark: mock classes and copy, `role=dialog aria-modal`, labelled, Esc returns focus, axe clean | pass | `06-*`, `07-*`, `15-*` (no sideways overflow at any size); axe on idle, working, ready, failed: no violations; keyboard: Tab to the foot button, Enter opens, focus inside, Tab stays inside, Esc returns focus to the foot button (`05`) |
| Offline says so | pass | `10-dialog-offline-768-dark` |
| Status: `statusTable(Em campo, generate)` then `issue` | pass | `11` (Em revisão behind the dialog), `13`/`14` (Emitido) |

Observations for the reviewer (not yet triaged):

- O1. After a failed job the relatório stays Em revisão: the `generate` status op is written at the 202, as the spec's matrix says, while the failed sentence reads "Os dados não foram alterados". Spec-conformant; worth a product decision.
- O2. Right after "Criar relatório", Tab pressed at machine speed (about 5 ms apart) occasionally cycled inside the first numbered Sumário row (pos-box, open button, Overflow) or fell to `<body>`; at a human pace (1.5 s to read, 60 ms between presses) the foot button is reached in 40 presses every time. A 6 s and a 40 s probe with the focus parked on a row showed it stable. Batch A's surface; recorded, not reproduced at human speed.
- O3. The small fixture predates the section blocks, so its Sumário shows only the two fixed rows (`09`, `13`); the Home-born relatório shows all 13 (`01`).

## 2. Independent review (opus)

Scope: `git diff origin/main...HEAD` (4 commits, 117 files), with the resume commits `022e004` (Sumário wiring, fixture route removed, e2e re-pointed, `e2e/support/relatorio-flow.ts`) and `092a075` (QA screenshots). Reviewed 2026-09-24 in the `fasor-e4d` stack.

Evidence run in the tools container:

- Web unit: `src/surfaces/export`, `src/surfaces/relatorio`, `src/db/generate-store.test.ts`, `src/sync/client.test.ts`: 4 files, 41 tests pass.
- Domain unit: `src/print`, `src/contract`, `src/format`, `src/schemas/snapshot.test.ts`: 6 files, 52 tests pass.
- Api: `src/jobs/generate`, `src/http/generate*`, `src/sync/apply-batch`: 7 files, 30 tests pass. This covers the real LibreOffice job over HTTP (2 passes, converged), the fault path, the enqueue failure, cross-tenant 404, and revision numbers 2 and 3 after an edit.
- E2E `e2e/export.spec.ts` and `e2e/export-visual.spec.ts` on `desktop-chrome`: 5 of 5 pass (1.6 min).
- A throwaway Playwright probe, since deleted, drove the dialog by keyboard through idle, working, ready, "Gerar de novo", unchanged and Esc. The focus stays inside the dialog at every state change: the first tabbable control of the new state gets it, and it never falls to `<body>`. Esc returns the focus to the Sumário's foot button.
- Screenshots `qa-epic-4-D/04`, `06-*-390`, `15-*-390-dark` were read. Classes and copy match `73-exportar.html` minus the out-of-slice parts.
- Checked with nothing found: no emoji in the diff, no `laudo`, and no Fasor string in `apps/web` copy. The golden `porto-seguro-skeleton.json` and `qa-epic-4-D/porto-seguro-skeleton-rev1.*` carry only fixture data (client name, city, the fixture's empresa), which the 2026-09-21 waiver covers as the fixture's golden documents.
- Every printed and numbered string is the kernel's (`print/layout.ts`, `print/revisions.ts`, `print/document-control.ts`). `docx.ts` composes none. `copy.export` keeps only static words.

### Findings

**R1 — must-fix — `docker-compose.yml:34`, `apps/web/src/test-setup.ts:8-15`.** Cause: `NODE_ENV: ${NODE_ENV:-development}` went into the shared `x-app-env` anchor. Every service now inherits it, including `tools`. It has two effects, both shown by experiment:

- (a) **Unit tests now run on React Aria's non-test code paths.** Without the PR's shim, the untouched `tabs.test.tsx`, `new-project-dialog.test.tsx` and `template-composer.test.tsx` throw 8-9 unhandled `scrollView.scrollTo is not a function` errors. Unsetting `NODE_ENV` makes them clean: 37 tests, 0 errors. The cause is in `react-aria` 3.52.1: `scrollIntoView.mjs:79`, `usePress.mjs:436,582`, `useHover.mjs:47` and `platform.mjs:20` branch on `process.env.NODE_ENV === 'test'`. Vitest sets `'test'` only when the variable is unset. So the `Element.prototype.scrollTo` shim does not fix a jsdom gap that main had. It hides one symptom of a changed test environment, which also changes press and hover semantics across the whole web suite. No suite on origin/main needed the shim.
- (b) **The documented production build is now a dev build.** `docker compose --profile tools run --rm tools pnpm --filter @app/web build` is the command in `README.md:105` and `docs/tablet-https-setup.md:99`, and it feeds the `prod` profile. With the variable set, it emits a bundle with `import.meta.env.DEV === true`. That bundle contains the dev-only `/__fixture/field` route and the `jsxDEV` runtime. With `NODE_ENV` unset, the same build has neither. This contradicts `playwright.config.ts` ("`build` ... stays a production build, and the fixture route is absent") and the purpose of `fixture-route.test.ts`.
- **Fix:** drop `NODE_ENV` from `x-app-env`. `config.ts` already treats unset as non-production, so `GENERATE_FAULT` keeps working on `api`. If an explicit value is wanted, set it on the `api` service only. Keep `NODE_ENV: production` on `api-prod`. Then delete the shim from `test-setup.ts` and re-run `pnpm verify`.

**R2 — should-fix — `apps/web/src/surfaces/export/use-generate.ts:294-318`.** The working phase never gives up on a dead job. The expiry check (`jobIsActive`) runs only on the resume path. While working, the dialog leaves only on `failed`, on `done`, or when the revision arrives. The hook stays mounted as long as the Sumário is open (`generate-action.tsx` always renders `ExportDialog`), so closing and reopening the dialog does not reset it.
- **Scenario:** the api container restarts or is OOM-killed during the LibreOffice pass. `docker compose up -d --force-recreate api` is even a step in the spec's own verification list. The `generation_job` row stays `running`, because pg-boss expires the job with `retryLimit: 0` and the handler never runs to write `failed`. The dialog then shows "Gerando revisão n…", keeps the button `aria-disabled` and pulls every 3 s indefinitely. After 15 minutes and a remount it drops silently to idle, without the failed sentence.
- **Fix:** in the working phase, schedule a timer to `created_at + GENERATE_JOB_EXPIRE_S` and switch to `failed`, clearing the awaiting pref, when the job is no longer active. Optionally, have `registerGenerateWorker` mark this instance's orphaned `queued`/`running` rows `failed` at boot.

**R3 — should-fix — `packages/domain/src/print/layout.ts:134-170`.** The layout ignores the relatório's section blocks. It prints the seed's eleven sections in fixed order whatever the block tree says. Since the merge of Stories 4.1/4.3, a relatório is born with section `block` rows, and the Sumário offers Remover, Subir/Descer, Duplicar and "Adicionar seção abaixo" on them (`sumario-row.tsx:57-67`).
- **Scenario:** the user removes section 5 or moves 8 above 6 on the Sumário, then presses "Gerar relatório". The DOCX and its ÍNDICE still print section 5, in seed order. The Sumário ("the relatório as its own table of contents") and the document disagree.
- **Why the tests miss it:** the fixtures predate section blocks (QA O3), so neither the golden nor the e2e can catch this.
- **Fix:** either derive the printed section list from the snapshot's live section blocks (order by `order_key`, skip tombstones, number by position) with a layout test on a Home-born snapshot, or record a dated narrowing in the spec plus a `deferred-work.md` entry naming the owner (Epic 7). Today it is not recorded anywhere.

**R4 — should-fix — `apps/web/src/surfaces/relatorio/generate-action.tsx:39`, `use-generate.ts:163-193`.** "pode fechar — o aviso chega quando terminar" holds only while the user stays on that relatório's Sumário. The watcher lives in the Sumário's `ExportDialog`.
- **Scenario:** the user closes the dialog and goes to Home or another relatório. The revision lands, but no toast appears and no `issue` op is written until they come back to that Sumário (QA shots `12`/`13`). A user who never returns leaves the relatório Em revisão with a finished revision.
- The spec amendment accepted reconcile-on-mount, but that does not meet the mock's promise or the AC's "a toast when ready" for the common case.
- **Fix:** lift the awaiting reconciliation into an app-level watcher (for example beside `SyncProvider`, iterating the `generate_awaiting:*` prefs), or record it as a dated narrowing with an owner.

**R5 — should-fix — `_bmad-output/implementation-artifacts/deferred-work.md`** (the removed batch A entry "Gerar relatório wiring: stub, owner batch D"). Commit `022e004` deletes the ledger entry instead of closing it. The ledger's convention is `state: closed (...)`, which this same commit follows for its own entry 2, and AGENTS.md forbids silently rewriting planning records. The audit trail of batch A's stub is lost.
- **Fix:** restore the entry with `state: closed (2026-09-24, story/4-8-docx-skeleton-renderer: generate-action.tsx opens ExportDialog)`.

**R6 — nice-to-have — `apps/web/src/surfaces/export/use-generate.ts:59`, `apps/api/src/jobs/generate/worker.ts:337`.** `GENERATE_JOB_EXPIRE_S = 900` is defined twice, and both copies feed the kernel's `isJobActive`. If they drift, the route and the dialog disagree on whether a job is running.
- **Fix:** move the constant into `packages/domain/src/print/revisions.ts` next to `isJobActive`, so the web side does not hold its own rule parameter (AGENTS.md copy and ownership rule).

**R7 — nice-to-have — `packages/domain/src/print/revisions.ts:94-100`.** Expiry is counted from `created_at`, which is the queue time. pg-boss's `expireInSeconds` counts from when the job starts.
- **Scenario:** with concurrency 1 per instance and up to 3 passes of 120 s each, a job that waits more than 15 minutes behind others counts as dead to the route. A second press then queues a duplicate job, which later allocates an extra revision number.
- The risk is low in the MVP. Note it, or stamp a `started_at` in the `running` put and expire from that.

**R8 — nice-to-have — `packages/domain/src/contract/generate.ts:25`.** `file_ids_expected` is an uncapped array. A very large body turns into one `inArray` query past Postgres's parameter limit and answers 500 instead of 400.
- **Fix:** add a `.max()` (for example 10 000).

**R9 — nice-to-have — `apps/api/src/jobs/generate/worker.ts:55-60`.** A payload that fails `payloadSchema` is logged and skipped, and its `generation_job` row stays `queued` until it expires.
- **Fix:** when `job_id` and `company_id` parse, write `failed` plus `render_failed`.

**R10 — nice-to-have — mock parity, `export-dialog.tsx:120-137`.**
- In the failed state, the mock's reason is the short "Gera o DOCX e o PDF juntos, como a revisão n. Precisa de conexão."; the app reuses the idle sentence.
- In the result state, the mock replaces the `h2.dialog-title` block, while the app keeps "Gerar relatório" above "Revisão n pronta". Keeping it is defensible, since the title labels the dialog.
- After an unchanged answer, "Gerar de novo" shows "como a revisão 2" although a press with no edit returns revision 1 (seen in 4.8-E2E-001, `IDLE_2`).
- These are cosmetic. Align the failed reason with the mock, or mark it `// authored:`.

### Triage of the QA observations

- **O1** (Em revisão after a failed job): no change. AD-22 (spine line 193) makes `Em campo -generate-> Em revisão` a client op the Export dialog emits "before calling generate". The implementation emits it after the 202, which is stricter: a request that never reaches the server leaves the status alone (4.8-E2E-005 asserts this). "Os dados não foram alterados" refers to the relatório's captured data, and the status move is the workflow's decision. If the product wants it otherwise, it is a change to the spine's status table, not to this story.
- **O2** (machine-speed Tab cycling in the Sumário rows): out of this PR's scope. It is batch A's surface, it does not reproduce at human pace, and this story's Tab path works (the keyboard probe above). Leave it to the Epic 4 retro.
- **O3** (small fixture has no section blocks): not a defect of this PR by itself, but it is why R3 goes unnoticed by every test. Fold it into R3's fix, with a Home-born snapshot in the layout test.

### Other checks, no finding

- Revision numbering: the number is read under the company lock at the freeze and re-checked in the `before` hook of the one `applyServerBatch` transaction that writes both files, the revision, `done` and `result`.
- Barrier: the 409 carries `missing_op`/`missing_files`. The running check is re-read under the lock. Unchanged/running answers are correct.
- Failure paths: a failed job leaves only `failed`/`error` (in-process fault test). LibreOffice runs with a per-job profile, is serialized, and on timeout its process group gets SIGKILL (fake-soffice test). `GENERATE_FAULT` is dropped when `NODE_ENV === 'production'`, and `api-prod` sets production.
- `GET /api/revisions/:id/docx`: session-scoped lookup, and the object key is derived from the session company. Unknown or cross-tenant ids answer 404. It sends `attachment; filename="relatorio-rev-n.docx"`, `nosniff` and the DOCX mime.
- Tests: `@p0` drives the full flow through the real Sumário UI, including flush, working, Esc and focus return, reopen, toast, download, second press unchanged, and reload during the job with `issue` on return. The jsdom suite asserts behaviour, not implementation. No tautologies found.

Verdict: changes-requested

## 3. Fix status (2026-09-24, batch D orchestrator)

| Finding | Decision | Change |
|---|---|---|
| R1 must-fix | fixed | `docker-compose.yml`: `NODE_ENV` removed from the shared `x-app-env` anchor (commented why); `api-prod` keeps `NODE_ENV: production`; an unset value is non-production for `config.ts`, so `GENERATE_FAULT` still works on `api`. The `Element.prototype.scrollTo` shim is deleted from `apps/web/src/test-setup.ts`; the web suite runs clean without it (Vitest back in `test` mode). |
| R2 should-fix | fixed | `use-generate.ts`: while working, a timer to the kernel's `jobExpiresAt(job)` switches to the failed state and clears the `generate_awaiting` entry; jsdom test "stops waiting when the running job outlives the queue expiry". |
| R3 should-fix | fixed | `print/layout.ts`: the printed sections are the relatório's live section blocks in `order_key` order, numbered by position (the Sumário's order); a block's own `config.section_text` wins over the seed default; a snapshot without section blocks prints the seed's eleven. Test `4.8-UNIT-007` on the small fixture plus the template's section blocks: removal, move, duplicate with its own text. The structure golden is unchanged (the fixture has no section blocks). |
| R4 should-fix | deferred | Recorded in `deferred-work.md` (Story 4.8): an app-level watcher belongs with Epic 7's `relatorio-exported` notification; today's behaviour (toast and `issue` on return to the Sumário, reload included) is proven by 4.8-E2E-004. |
| R5 should-fix | fixed | Batch A's "Gerar relatório wiring" ledger entry restored with `state: closed (...)`. |
| R6 nice-to-have | fixed | `GENERATE_JOB_EXPIRE_S` lives in `packages/domain/src/print/revisions.ts` (default of `isJobActive`, new `jobExpiresAt`); the api worker and route and the web hook read it from there. |
| R7 nice-to-have | deferred | Ledger entry (expiry from queue time vs pg-boss start time). |
| R8 nice-to-have | fixed | `generateRequestSchema.file_ids_expected` capped at `GENERATE_MAX_EXPECTED_FILES` (10 000); contract test. |
| R9 nice-to-have | deferred | Ledger entry (invalid payload leaves the row `queued` until expiry). |
| R10 nice-to-have | partly fixed | The failed state's reason is the mock's shorter sentence (`failedReason(n)`, kernel); the dialog title stays above the result (it labels the dialog); "Gerar de novo" keeps naming the number the next edit allocates. |
| O1, O2, O3 | as triaged | O1 no change (AD-22); O2 left to the Epic 4 retro; O3 folded into R3. |

## 4. Re-check of the fixes

Re-checked 2026-09-24 against `git diff 092a075..82616be`. Targeted Vitest runs in the tools container, where `NODE_ENV` is now empty:

- Domain `src/print` and `src/contract`: 4 files, 39 tests pass.
- Web `src/surfaces/export`, `src/surfaces/relatorio` and the three suites that threw `scrollTo` errors before (`tabs`, `new-project-dialog`, `template-composer`): 5 files, 69 tests pass, with no unhandled errors and no shim.

I ran no Playwright, because `pnpm verify` was running on this stack.

- **R1: resolved.** `NODE_ENV` is gone from `x-app-env` (`docker-compose.yml`, with a comment saying why), and `api-prod` keeps `production`. The `scrollTo` shim is deleted, and the suites run clean in Vitest's `test` mode. With `NODE_ENV` unset, the tools-container `vite build` has no `/__fixture/field` route and no `jsxDEV` runtime (probe in section 2).
- **R2: resolved.** `use-generate.ts` sets a timer to the kernel's `jobExpiresAt` while working, then switches to failed and clears the awaiting pref. The jsdom test "stops waiting when the running job outlives the queue expiry" covers it.
- **R3: resolved.** `layout.ts` `printedSections` prints the live section blocks via `sectionBlocks` (tombstones dropped, `order_key` order), numbered by position, and a block's own `config.section_text` wins over the seed text. TOC matching stays unique, because `headingPages` keys on "n TITLE". `4.8-UNIT-007` covers removal, a move and a duplicate with its own text.
  - Residual nice-to-have, `packages/domain/src/print/layout.ts:164`: a relatório whose section blocks are all removed falls back to printing the seed's eleven sections. The fallback cannot tell "no blocks ever" from "all removed". Not blocking.
- **R5: resolved.** Batch A's "Gerar relatório wiring" entry is restored in `deferred-work.md` with `state: closed (2026-09-24, ...)`.
- **R6: resolved.** `GENERATE_JOB_EXPIRE_S` and `jobExpiresAt` now live in `packages/domain/src/print/revisions.ts` (the default of `isJobActive`). The worker, the route and the web hook read them from there, and neither app keeps a copy.
- **R8: resolved.** `file_ids_expected` is capped by `.max(GENERATE_MAX_EXPECTED_FILES)` (10 000) in `contract/generate.ts`, with a contract test.
- **R10: resolved as decided.** The failed state now shows the mock's shorter `failedReason(n)`, a kernel string. The dialog title staying above the result, and "Gerar de novo" naming the next number, are recorded decisions, and both were nice-to-have.
- **R4, R7, R9 (not re-checked, deferred):** each has a ledger entry in `deferred-work.md`, which is acceptable for those severities.

Verdict after fixes: approve
