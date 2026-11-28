---
title: 'Epic 8 carry-over: sync push under overlap, gate workers, Epic 6 and 12 follow-ups'
type: 'bugfix'
created: '2026-09-26'
status: 'done'
baseline_revision: '8c9527cd48e45d6b0c0e79febac21138b78e2125'
review_loop_iteration: 0
followup_review_recommended: true
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-batch-orchestrator.md'
warnings:
  - 'batched'
  - 'multiple-goals'
  - 'oversized'
batched_reason: 'Carry-over batch C of Epic 8: eight agent-closable action items and deferred entries of Epics 4, 6 and 12, batched into one PR by the coordinator (token economy) before Epic 8 builds on the sheet and sync path.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** Earlier epics left agent-closable items open: the sync push slows about 14x when pushes overlap, which keeps the gate on one e2e worker and `verify` over its 15-minute budget (E6-A1); the e2e runner is undocumented (E6-A3); four Epic 6 lows (E6-A6); a 704-line `ficha-surface.tsx` and Epic 6 narrowings missing from `epics.md` (E6-A7); Epic 12 visual lows (E12-A7); three web tests building SyncState by hand (E4-A9); the TAG-rename status bug's ledger entry and e2e (Epic 4); and a pg-boss reset that misses `company_id` payloads.

**Approach:** Close each item with the smallest change that keeps behavior, contracts and ownership (AD-1/AD-13) intact; one mechanism fix (the push path) with before/after and mutation timings; the rest are targeted fixes, a no-behavior-change split, docs and tests. Close every resolved `deferred-work.md` entry with a dated strike.

## Boundaries & Constraints

**Always:**
- Everything runs in Docker (`docker compose --profile tools run --rm tools ...`); never pnpm/node on the host. The worktree's `.env` already sets the compose project `fasor-s8c` and ports base 31.
- Every e2e run with more than one spec file, every `test:e2e:full`/`verify`, and every multi-worker measurement run is wrapped in the host lock, foreground, output to a log: `flock /tmp/fasor-verify.lock docker compose --profile tools run --rm tools pnpm <script> > /tmp/<name>-s8c.log 2>&1; echo EXIT=$?; tail -40 /tmp/<name>-s8c.log`. Never let full test output into context. Iterate with the narrowest suite (`pnpm test:unit -- <path>`, one Playwright spec with `--grep`).
- Per-company op ordering and idempotence of `POST /api/sync/ops` are unchanged: seq order equals commit order within a company; a re-sent `op_id` returns its existing seq; one permanently refused op (`op_invalid`) never blocks the other ops of the push; a transient error (connection, lock, pool) still propagates so the client retries.
- Kernel owns every count and derived text; new static pt-BR copy goes to `apps/web/src/copy/pt-br.ts` marked `// authored:`; `tokens.css` and `components.css` in `apps/web/src/styles` stay byte-identical to `_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/mockups/`.
- Planning documents: never delete or rewrite a sentence; strike (`~~…~~`) and add the dated replacement beside it.
- New `@p0` specs assert committed state (outbox/IndexedDB row or server state), not only the screen.

**Never:**
- Touch `services/ocr/**` or `packages/domain/src/contract/ocr/**` (batch O owns them). Edit `sprint-status.yaml`. Edit `epics.md` beyond the dated narrowing lines of task 4b.
- Weaken durability to get speed (no `synchronous_commit=off`, `fsync=off` or relaxed Postgres settings in compose or code).
- Change `CONTRACT_VERSION` or add an op family.
- Change a class name or `data-testid` in the ficha split; change behavior in the split.
- Run a Playwright MCP browser pass (the integrated QA does it).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Push, all valid | N ops, one push | all applied in array order, seqs ascending, one transaction under one `lockCompany` | none |
| Push, one refused | op k fails `applyOp` row schema (ZodError) or `SeedPathError` or foreign op_id | op k `rejected: op_invalid`; ops before and after k applied | savepoint of op k rolled back only |
| Push re-sent | same ops again | same seqs returned, no new rows, `superseded` empty for dedupe hits | none |
| Push, transient failure | DB error mid-push | nothing of the push committed; 5xx; client retries whole push | propagate |
| Overlapping pushes | 3 companies push about 220 ops each at once | median `POST /api/sync/ops` close to the solo time (target under 3 s, report actual) | none |
| Point draft | type into a new point, reload without hiding the page first | "Recuperar" offers the typed text after reload | none |
| Caption "Editar texto" | stored caption not composed by rows | chips `aria-disabled="true"`, never `aria-pressed="true"`; a tap changes nothing; authored note shown | none |
| Sumário awaiting | 3 photos not uploaded, 1 of them with a local upload error (failed or dead) | "2 … aguardando envio" (kernel text), the error photo not counted | none |
| TAG rename | relatório Emitido, block references equipment E; rename E's TAG | status becomes Em revisão in the same batch; outbox holds the `relatorio/status` op | none |
| Test reset | pg-boss jobs with `data.company_id` or `data.companyId` = test company | both deleted; other companies' jobs kept | none |

</intent-contract>

## Code Map

- `apps/api/src/sync/apply.ts` -- `applyOps` (about l.435) loops ops and calls `applyOne` = one `db.transaction` + `lockCompany` per op (l.251); `applyOneIn` (l.260) is the per-op body; `applyServerBatch` (l.395) already runs many ops under one lock; `isPermanentRefusal` (ZodError, SeedPathError, ForeignOpIdError).
- `apps/api/src/sync/routes.ts:67-100` -- `POST /api/sync/ops`: `applyOps` then `recordPush` per device.
- `apps/api/src/db/client.ts` -- `postgres(url, { max: 5 })` pool per process.
- `apps/api/src/http/app.ts:110` -- request log with `duration_ms` (the measurement source: `docker compose logs api`).
- `apps/api/src/sync/apply-batch.integration.test.ts`, `sync.integration.test.ts`, `replay.integration.test.ts` -- existing apply/push integration tests to extend.
- `e2e/support/groups.ts:36` -- `PARALLEL_WORKERS = 1` with its dated rationale comment; `scripts/e2e.ts` (runner: build once, parallel group then serial group, `--workers=N` reaches the parallel group only, `summary.json`, leak check as global teardown `apps/api/src/db/e2e-leak-check.ts`); `e2e/support/groups.ts` `SERIAL_SPECS` (`export.spec.ts`, `export-visual.spec.ts`).
- `AGENTS.md:28-33` -- "Running and verifying".
- `apps/web/src/state/drafts.tsx:83-128` -- `DraftProvider.persistAll`, runs only on `visibilitychange`/`pagehide`; `useDraftSource` (:208); `apps/web/src/db/drafts.ts` `saveDraft` (:12); `apps/web/src/surfaces/points/point-editor.tsx:211-240` registers the point draft source (`POINT_DRAFT_SURFACE`, `point-writes.ts:16`); `point-draft-recovery.ts:20` `usePointDraftRecovery`; reusable debounce `apps/web/src/input/field-commit.ts:8` `createFieldCommitter` (injectable `timers`, `idleMs`); e2e `e2e/points.spec.ts:375` (6.6-E2E-009), `:415` (6.6-E2E-010).
- `apps/web/src/surfaces/photos/caption-composer.tsx` -- `editing` initial state (:113), toggle `.caption-edit-toggle` (:189), `PartRow` (:220) renders `Chip` (`apps/web/src/components/chip.tsx:17`, RAC ToggleButton `.chip`) in `.chip-row.chips-recent`; `save` (:149). Copy `pt-br.ts:673` `captionComposer`. Mock `71-legenda.html:45` ("the fields above stop regenerating"); only disabled look in the mock CSS is `.btn.is-disabled, .btn[aria-disabled="true"] { opacity: .4 }` (`components.css:185`).
- `packages/domain/src/relatorio/pre-issue.ts:97-99` -- counts live photos with `uploaded_at === null` for "aguardando envio" (`photos/text.ts:32` `photosAwaitingText`), joined into Sumário row 7 meta at `relatorio/sumario.ts:162`; "com erro" per `photos/text.ts:43` `photoUploadState` (a non-null local error and no `uploaded_at`); `apps/web/src/db/file-store.ts:153` `pendingUploadCount`; file row `upload_error` (`apps/web/src/db/schema.ts:53`, `{state:'failed'|'dead'}`); caller `apps/web/src/surfaces/relatorio/sumario-surface.tsx:95-96`.
- `apps/web/src/surfaces/photos/photo-viewer.tsx:39-55` -- `useViewerPicture`: local original Blob when present, else `ensureLocalBlob(..., 'print')` (thumb meanwhile); `<img className="viewer-img">` (:111); e2e `e2e/gallery.spec.ts` 6.3-E2E-001 (:102), 6.5-E2E-001 (:385).
- `apps/web/src/surfaces/ficha/ficha-surface.tsx` (704 lines) -- `FichaSurface` 107-114, `Ficha` 116-138, `useSavedStatus` 141-160, helpers 163-176, `FichaBody` 177-704 (data 190-244, steps 246-266, photos 267-312, `goTo` 317-377, checklist mirror 378-400, conclude/next 401-456, header/menu/rename/not-tested 457-531, rail 532-545, JSX 546-702). Only importer: `apps/web/src/app.tsx:17`.
- `_bmad-output/planning-artifacts/epics.md` -- Stories 6.1 (l.1615), 6.2 (1640), 6.3 (1670), 6.4 (1696), 6.5 (1718), 6.6 (1736); `deferred-work.md` entries from `spec-6-*` and `spec-epic-6-fix-*` (22 lines reference them).
- Stepper: `components.css:257` `.section-stepper .step[aria-current]{border-bottom: var(--section-stepper-current-rule)}` (v0.8, 3px) and `:258` `…[aria-current]::after{height:4px}` (v0.9) both apply; DESIGN.md l.769 (v0.9 row: "a 3px progress rule under every name …, 4px on the current") supersedes l.833's v0.8 "3px primary bottom rule"; `e2e/v09-visual.spec.ts:147-150`.
- Section 9 header: `apps/web/src/surfaces/relatorio/sumario-row.tsx:131` `Section9Row` (`.sum-s9-head` > `.tree-chevron`, `.sum-pos`, `.sum-body`, `.sum-ctrls`); `relatorio.css:47,53,63,83`; mock `40-relatorio-overview.html:86,202-205`.
- Captures: `e2e/p-screens.capture.spec.ts:16-20` `VIEWPORTS` (390x844, 768x1024, 1280x800, light and dark); `app.css:347-356` `.frame-tablet-landscape` translations (`.sticky-action-bar .bar-buttons` right-aligned).
- Epic 12 batch D lows (`spec-12-5-12-6-v09-visual-and-tap-budget.md` frontmatter `deferred`): (a) `section-stepper.tsx:5` `STEPPER_STEPS = SHEET_STEPS`, passed as `shown` to `sheetSummaryText` (`packages/domain/src/relatorio/sheet-progress.ts:301`) at `ficha-surface.tsx:598`; kernel `enabledSubBlocksOf(block)` (`relatorio/sheet-state.ts:42`); step to sub-block: placa=nameplate, verificacoes=checklist, ensaios=tests, conclusao=conclusion (`sheet-progress.ts:112-149`). (b) `components.css:277` `.is-done` rule never set; the app unmounts the compact bulk bar instead (`ficha-surface.tsx:384` `showMirror`). (c) `readings.ts:115` `readingLabelText`, `:125` `sentenceCase` vs `screen-label.ts` `screenLabel` + `SCREEN_LABEL_ACRONYMS`.
- MOCK-GUIDE: `_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/mockups/MOCK-GUIDE.md` § `## v0.9 (2026-09-24)` (l.134).
- SyncState: type `apps/web/src/state/sync.tsx:38`; factory `apps/web/src/test/sync-state.ts` (`makeSyncState`, `SyncStateOverrides`, used by 10 files); hand-built literals in `relatorio-tree.test.tsx:59`, `relatorio-tree-edits.test.tsx:58`, `relatorio-tree-edges.test.tsx:57` (under `apps/web/src/surfaces/relatorio/`); partial `vi.mock` in `instrument-panel.test.tsx:42`.
- TAG rename: fix already on main (#29, `apps/web/src/db/commit.ts:163-184`, `inRelatorioStream` scan over the project's relatórios); unit test `apps/web/src/db/commit.test.ts:423` ("E4 retro Q15"). UI paths: tree menu "Renomear TAG" (`relatorio/tree-actions.ts:326`, `e2e/tree.spec.ts:175`), sheet header rename (`e2e/sheet-knows-12-3-12-4.spec.ts:115`). Emitido seed: `e2e/support/outbox.ts:81-105` (`RelatorioSeed.status: 'emitido'`), `e2e/support/push-server-ops.ts:19` `pushRevision`. Ledger entry: `deferred-work.md` l.639-645.
- `scripts/test-reset.ts:64-65` -- `delete from pgboss.job where data->>'companyId' = …`; the generate job payload keys `company_id` (`apps/api/src/jobs/generate/worker.ts:21`); test `apps/api/src/db/test-reset.integration.test.ts`.

## Tasks & Acceptance

**Execution:**
1. Item 1, push path (E6-A1).
   - Measure first: with the stack up, run a 3-worker subset under the lock (`pnpm test:e2e:full --workers=3` restricted to about three heavy specs, e.g. `e2e/ficha.spec.ts e2e/relatorio.spec.ts e2e/tree.spec.ts`) and extract `POST /api/sync/ops` `duration_ms` (median, p90, max, count) from `docker compose logs api`; also one 1-worker run of the same subset for the solo figure. If it helps, inspect `pg_stat_activity` wait events during the overlap to name the bottleneck (fsync/WAL, lock, pool).
   - `apps/api/src/sync/apply.ts` -- apply a client push as ONE transaction under one `lockCompany`, each op inside a savepoint (drizzle nested `tx.transaction`) so a permanent refusal rolls back only that op and is reported `op_invalid`; transient errors propagate and roll back the push. Keep `applyOneIn` as the shared body. Fix any further cause the measurement names (e.g. pool size in `db/client.ts`) only if it is shown, within the Never list.
   - `apps/api/src/sync/*.integration.test.ts` -- add tests through the sync route: a push with a refused op in the middle applies the others (seqs ascending, refused op absent from `ops`); a re-sent push returns the same seqs; a push is all-or-nothing on a transient error (inject via a failing hook or a closed-connection stub if feasible, otherwise assert with a unit-level fake `Db`).
   - Measure after with the same subset and commands. Mutation: revert the apply.ts change in the working tree, re-run the 3-worker subset, record the median, restore. Write the three timing rows (before, after, mutation) into this spec's `## Design Notes` as a table.
   - Do NOT run the 3 serial + 3 parallel full-run validation or change `PARALLEL_WORKERS`; the orchestrator runs that after review.
2. Item 2 (E6-A3), `AGENTS.md` "Running and verifying" -- one added bullet (keep other bullets unchanged): `test:e2e*` run through `scripts/e2e.ts` (build once, a parallel group then a serial group of `export.spec.ts` and `export-visual.spec.ts` on one worker, both always run, `test-results/e2e-report/summary.json`), per-worker company pairs (`workerSeed(index)`, at least 3 seeded), the leak check as global teardown failing the run, the `--workers` default (`PARALLEL_WORKERS` in `e2e/support/groups.ts`) with `--workers=N` opt-in, and that on a shared machine only one gate runs at a time under `flock /tmp/fasor-verify.lock`. State the default as `PARALLEL_WORKERS` without a number (the orchestrator adds it after validation).
3. Item 3a (E6-R1) -- `apps/web/src/surfaces/points/point-editor.tsx` (and `state/drafts.tsx` only if a small export is needed): write the `point/{id}` draft on each input, debounced about 300 ms (reuse `createFieldCommitter` or an equivalent injectable timer), cleared/overwritten the same way the hide-time draft is when the field commits; hide-time persistence stays. Unit test with fake timers. E2E in `e2e/points.spec.ts` (`@p0`): type into a new point, poll IndexedDB until the draft row holds the text, `page.reload()` with no prior hide, "Recuperar" restores the text into a stored point (assert the entity row). Mutation: remove the debounced write, show the new e2e fails, restore.
4. Item 3b (E6-R2) -- `caption-composer.tsx`: while `editing` is on, every chip in the rows (`Chip`, `.chip-other`) renders `aria-disabled="true"`, never `aria-pressed="true"`, and a press is a no-op; a short note under the toggle, new key in `pt-br.ts` `captionComposer` marked `// authored:` (e.g. "Texto editado à mão. Desligue Editar texto para montar pelas opções."); turning "Editar texto" off restores the chips as today. Look: `app.css` mirrors the mock's `.btn[aria-disabled="true"] { opacity: .4 }` for `.chip[aria-disabled="true"]` with a comment naming the mirrored rule (`components.chip.tsx` may need an `isInactive`-style prop). Unit test plus an e2e (`e2e/gallery.spec.ts`, `@p1`) on a photo whose stored caption the rows do not compose: chips `aria-disabled`, tap leaves the caption unchanged in the stored row, note visible.
5. Item 3c -- kernel: the Sumário "aguardando envio" count excludes photos with a local upload error. Add an explicit optional input (e.g. `photoErrors: ReadonlySet<string>` of photo file ids whose local `upload_error` is non-null) to `preIssue` (and whatever `sumarioRows` needs); default empty keeps other callers unchanged. `sumario-surface.tsx` reads the file store's `upload_error` ids (a small live query beside the snapshot) and passes them. Kernel unit tests (failed and dead both excluded, uploaded never counted); a `@p1` e2e or web unit test on the Sumário row 7 meta.
6. Item 3d -- `e2e/gallery.spec.ts` (`@p1`): the viewer shows the local original for a photo taken on this device and the server `print` variant for a photo this device does not hold (pushed from "another device" via the server-op pattern or by clearing the local Blob); assert as a human sees it: the displayed `img.viewer-img` `naturalWidth`/`naturalHeight` equals the original's size in one case and the variant's size in the other (use an original larger than the print variant's bound).
7. Item 4a (E6-A7) -- split `ficha-surface.tsx` into cohesive modules under `apps/web/src/surfaces/ficha/` (suggested: `ficha-surface.tsx` shell with `FichaSurface`/`Ficha`/render; `use-ficha-steps.ts` steps, collapse, `goTo`, focus helpers; `use-ficha-actions.ts` conclude/next/primary/rename/not-tested/clear-conclusion/menu + `useSavedStatus`; `use-ficha-photos.ts`; `ficha-rail.tsx`), each file under about 250 lines; no behavior change, same class names, test ids and exports used by `app.tsx`. Existing unit and e2e ficha tests pass unchanged.
8. Item 4b -- `epics.md`: under each of Stories 6.1-6.6, after its existing content (before the next story heading), one line per Epic 6 narrowing in `deferred-work.md` whose `source_spec` is `spec-6-*` or `spec-epic-6-fix-*` and whose state is open or partially closed (skip entries fully closed within Epic 6, and non-narrowing bugs/test-gaps), in the form `*(2026-09-26, narrowing: <what> — deferred-work.md, owner <owner>)*`, attached to the story the narrowing names. Never delete or reword existing text.
9. Item 5 (E12-A7):
   - Stepper double underline: remove the v0.8 current-step `border-bottom` so only the v0.9 4px `::after` rule marks the current step (DESIGN.md l.769 wins over l.833). Edit the mock source `mockups/components.css` (dated CSS comment) and copy it byte-identical to `apps/web/src/styles/components.css`; strike-and-date DESIGN.md l.833's "3px `primary` bottom rule" phrase pointing at l.769. `v09-visual.spec.ts`: assert the current step's computed `border-bottom-width` is `0px` at 768 and 1280 and the `::after` is 4px.
   - Section 9 header at 390: add to `v09-visual.spec.ts` (or `ergonomics.spec.ts`) a 390 px check that `.sum-s9-head` has no horizontal overflow and `.sum-title` is not clipped (`scrollWidth <= clientWidth`) for a cabine with a long name; if it fails, translate the mock's matching `.frame-phone .sum-*` rule in `app.css` per AGENTS.md (no invented look), else record it as fitting.
   - 1024 landscape: add `{ width: 1024, height: 768 }` to `p-screens.capture.spec.ts` `VIEWPORTS`; add a `@p1` assertion at 1024x768 that the sheet's `.sticky-action-bar .bar-buttons` is right-aligned (the `.frame-tablet-landscape` translation) and the Sumário renders without horizontal page scroll.
   - Batch D lows: (a) kernel `shownSheetSteps(block)` (or equivalent) returns the steps whose sub-block is enabled (`enabledSubBlocksOf`); the stepper draws only those and `sheetSummaryText` receives them, so no header sentence names an off step; unit tests in the kernel, and existing e2e updated only where a sheet without a sub-block is asserted. (b) `is-done`: no code change; record the resolution (the app unmounts the compact bulk bar when nothing is unset, equivalent to the mock's `display:none`) in `deferred-work.md` and the spec. (c) unify the two sentence-case rules: `readingLabelText`/`sentenceCase` keep `SCREEN_LABEL_ACRONYMS` words as `screenLabel` does (one shared helper in the kernel); update kernel unit expectations that change only in acronym case; if the Porto Seguro golden (`packages/domain/fixtures/porto-seguro/snapshot.golden.json`) or any DOCX golden changes, revert this sub-item and record it as known-open instead.
   - MOCK-GUIDE: under `## v0.9 (2026-09-24)` add a dated line (2026-09-26) that `key-equipment-sheet.html` and `prototype/screens/40-relatorio-overview.html` now render with the v0.9 CSS, and the "before" survives only as the Epic 12 review screenshots under `_bmad-output/implementation-artifacts/reviews/qa-epic-12/`; strike any existing sentence that says otherwise.
10. Item 6 (E4-A9) -- migrate `relatorio-tree.test.tsx`, `relatorio-tree-edits.test.tsx`, `relatorio-tree-edges.test.tsx` (and `instrument-panel.test.tsx` if it builds a SyncState value) to `makeSyncState` from `apps/web/src/test/sync-state.ts`; after this, `grep -rn "syncRelatorio:" apps/web/src --include=*.test.tsx` hits only the factory's users' overrides, never a full literal.
11. Item 7 -- add one `@p1` e2e (in `e2e/tree.spec.ts` or `e2e/relatorio.spec.ts`): an Emitido relatório (seeded `status: 'emitido'` plus `pushRevision`) whose block references equipment E; rename E's TAG from the tree's "Renomear TAG"; the Sumário shows "Em revisão" and the outbox holds a `relatorio/status` op `em_revisao` in the rename's batch. The code fix already exists (`commit.ts:163-184`, #29); change code only if the e2e shows a gap.
12. Item 8 -- `scripts/test-reset.ts`: delete pg-boss jobs where `data->>'companyId' = $1 or data->>'company_id' = $1`; extend `test-reset.integration.test.ts` to plant one job of each key for the test company and one for another company, and assert only the first two are gone.
13. `deferred-work.md` -- close with a dated strike (`~~open …~~ closed (2026-09-26, spec-epic-8-carry-over.md: …)`) the entries resolved here: `spec-e2e-parallel-workers.md` push slowdown (state the gate outcome as "validation by the orchestrator, see PR"), E6-R1, E6-R2, the Epic 4 TAG rename entry (l.639-645), the three batch D lows in the 12.5 spec's own list are not ledger entries (record their resolution in this spec only). Add a ledger entry for anything this batch narrows.

**Acceptance Criteria:**
- Given three companies pushing about 220 ops each at the same time, when the api applies them, then each push is one transaction under one company lock and the median `POST /api/sync/ops` time is reported before, after and with the fix reverted, and the after median is at most half the before median, or the Design Notes name the measured cause that prevents it (then the gate stays at one worker).
- Given a push whose middle op is refused by the row schema, when it is applied, then the ops before and after it are stored with ascending seqs and the response lists it `op_invalid` (api integration test through the route).
- Given a new point with text typed and no hide event, when the page reloads, then the text is offered and recovered (e2e with the reverted fix red).
- Given the caption composer in "Editar texto", when a chip is tapped, then nothing changes, no chip reads pressed, and the authored note is visible.
- Given a relatório with photos, some with a local upload error, when the Sumário renders, then "aguardando envio" counts only the photos without an error.
- Given the Photo viewer, when it opens a local photo and a server-only photo, then the picture shown has the original's and the print variant's pixel size respectively.
- Given the refactored sheet, when the existing ficha unit and e2e tests run, then they pass unchanged and no file in `surfaces/ficha/` exceeds about 300 lines.
- Given `epics.md`, when Stories 6.1-6.6 are read, then every open Epic 6 narrowing of the ledger appears as a dated line under its story and no existing line changed.
- Given the sheet at 768 and 1280 px, when the current step is drawn, then exactly one rule (the 4px `::after`) marks it.
- Given a relatório tree with an Emitido relatório, when a referenced equipment's TAG is renamed, then its status becomes Em revisão in the same batch (e2e).
- Given pg-boss jobs keyed `company_id` or `companyId`, when `test-reset` runs for a test company, then both kinds of its jobs are deleted and other companies' jobs remain.

## Spec Change Log

## Review Triage Log

### 2026-09-26 — Review pass
- layers run: Edge Case Hunter, Verification Gap; Blind Hunter and Intent Alignment skipped (token economy; the integrated epic review covers them)
- verdicts: 16 findings — high 0, medium 7, low 6, false 3, maybe-false 0 (grouped into 4 medium entries patched, 3 low patched, 3 low rejected, 3 false rejected)
- findings:
  - `[medium]` `[patch]` VG: the point editor's post-commit draft drop is unverified; removing it would offer every saved point back as a draft — patched: `@p0` e2e type, wait for draft, Concluir, reload, no `point` draft row and no "Rascunho encontrado".
  - `[medium]` `[patch]` VG: the sheet's use of `shownSheetSteps` (header and stepper) has no test — patched: test on a block with nameplate off, not the cabine's first sheet.
  - `[low]` `[patch]` VG: the acronym rule of `readingLabelText`/`sentenceCase` is unpinned (TP table header "TAP Nº") — patched: kernel expectations added.
  - `[medium]` `[patch]` VG: the 1280 px Combobox and the "Outro…" input stay live in "Editar texto" (E6-R2 symptom on desktop) — grouped with ECH 1 and 2; patched: Combobox `isDisabled` with the note as reason, Outro input read-only, unit test.
  - `[medium]` `[patch]` VG other: on a complete sheet with Placa hidden, `current` starts on the hidden `placa` so no step is `aria-current` — grouped with ECH 3; patched: start on the first shown step.
  - `[low]` `[reject]` VG other: Sumário `photoErrors` wiring is covered end to end only by `@p1` 6.2-E2E-006 — secondary AC, `@p1` is the playbook's level for it and `test:e2e:full` runs before the PR; kernel side unit-tested.
  - `[low]` `[patch]` VG other: `sync.integration.test.ts:527` title says savepoint, the code uses none — grouped with ECH 6 (title half); patched: retitled.
  - `[medium]` `[patch]` ECH: Combobox live while editing — see the VG row above.
  - `[medium]` `[patch]` ECH: Outro input editable while chips read disabled — see the VG row above.
  - `[medium]` `[patch]` ECH: `use-ficha-steps.ts:42` default current step hidden — see the VG row above.
  - `[low]` `[reject]` ECH: a deterministic non-permanent error (DB constraint, TypeError) mid-push now rolls the whole push back, where the ops before it used to land — real but the device outbox is stuck at the same poison op either way (no ack before), a poison op is a bug of this codebase, and the fix (a per-op fallback path) adds a branch; listed as known-open in the PR.
  - `[false]` `[reject]` ECH: test-reset integration test fails without `pgboss.job` — `test:api` runs against the compose Postgres where the api service has already started pg-boss (the test passed in `verify`); guarding it would silently skip the assertion.
  - `[false]` `[reject]` ECH claim: a permanent refusal after an entity write commits partial rows — `rowIndexColumns`/`rowRemovedAt` are pure and never throw; every permanent refusal (`applyOp` ZodError/SeedPathError, ForeignOpIdError) precedes the upserts (`apply.ts` `applyOneIn`).
  - `[low]` `[reject]` ECH claim: `readingLabelText` splits on spaces only, so a leading lowercase-form acronym or a punctuated one ("(KV)") differs from `screenLabel` — no seed reading label or title hits either case (`seed/v1.ts` grep); tokenizing like `screenLabel` would add complexity for no present label.
  - `[false]` `[reject]` ECH claim: AC "no file in `surfaces/ficha/` exceeds about 300 lines" fails on pre-existing files — the intent is the split of `ficha-surface.tsx` (every new module is under 250 lines); the fix would be a spec edit.
  - `[low]` `[patch]` ECH: the prototype page CSS (`60-ficha.html:42`, `prototype/index.html:1814`) still draws the v0.8 current-step border — patched: declaration removed in both.

## Design Notes

Why savepoints and not one plain transaction: `applyOps` must keep "one rejected op never blocks the rest", and a failed statement aborts a Postgres transaction; a savepoint per op keeps that rule while paying one WAL flush per push instead of one per op. The company lock held for the whole push keeps seq order equal to commit order within a company (pulls are per company).

The implementer writes the measured timing table here (before / after / mutation: median, p90, max, count of `POST /api/sync/ops`, workers, spec subset).

Measured 2026-09-26 on this worktree's stack (`fasor-s8c`), subset `e2e/ficha.spec.ts e2e/relatorio.spec.ts e2e/tree.spec.ts` through `pnpm test:e2e:full --workers=N` (48 tests), `duration_ms` of every `POST /api/sync/ops` in `docker compose logs api` over the run's window (ms):

| Run | Workers | Count | Median | p90 | Max | Pushes over 3 s | Tests |
|-----|---------|-------|--------|-----|-----|-----------------|-------|
| Before (per-op transaction) | 1 | 87 | 916 | 1197 | 15363 | 3 | 48 passed |
| Before (per-op transaction) | 3 | 81 | 1045 | 3873 | 32883 | 10 | 45 passed, 2 failed (4.2-E2E-001, 4.6-E2E-001) |
| After (one transaction per push) | 3 | 86 | 669 | 1486 | 2157 | 0 | 48 passed |
| Mutation (apply.ts reverted to HEAD) | 3 | 86 | 993 | 2400 | 21713 | 6 | 48 passed |

Reading: about half of the pushes are small (under 300 ms in every run), so the median of all pushes moves less than the tail: the after median is 64 % of the before median, not at most half. The slowdown PR #45 measured lives in the tail, the whole-relatório pushes of about 220 ops that overlap: before, 10 pushes took over 3 s and the worst 33 s; after, none took over 2.2 s, under the solo run's own worst (15 s) and inside the 3 s target of the I/O matrix. The measured cause of the old tail was one transaction (one commit, one WAL flush, one lock round) per op: 220 commits per push, queued behind the other workers' commits. The mutation run brings the tail back (6 pushes over 3 s, worst 22 s). Whether the gate moves to three workers is the orchestrator's 3 + 3 validation.

Why no savepoints after all (a change from the Approach above): a savepoint per op, as first written, made the 2500-op Porto Seguro replay (`porto-seguro.integration.test.ts`, 3.7-INT-001) take 118 s against 19 s before, and fail its 60 s budget. Each savepoint is a Postgres subtransaction, and past 64 of them in one transaction every visibility check goes through `pg_subtrans`. The rule the savepoint served is kept without one: every permanent refusal is raised before the op wrote anything but its own `ops` row (`ForeignOpIdError` before any insert, `ZodError`/`SeedPathError` from `applyOp` before the entity upserts), so `applyOneIn` deletes that row and the push's transaction goes on clean. A failed SQL statement is never a permanent refusal and still rolls the whole push back. With this, 3.7-INT-001 runs in 19 s again.

Batch D lows of `spec-12-5-12-6-v09-visual-and-tap-budget.md` (recorded here, not in the ledger, per task 13):
- (a) resolved: kernel `shownSheetSteps(block, { cabineFirst })` (`relatorio/sheet-progress.ts`) returns the steps whose sub-block is enabled (Ensaios while any test sub-block is on; Verificações and Conclusão are locked on). Placa also stays on the cabine's first sheet, whose cabine fields are filled in that step even with the plate off. `SectionStepper` draws only those steps and `FichaHeader` passes them to `sheetSummaryText`; `STEPPER_STEPS` is gone.
- (b) resolved with no code change: `.section-stepper`/bulk bar `.is-done` (`components.css:277`) is never set because the app unmounts the compact bulk bar when nothing is unset (`use-checklist-mirror.ts` `showMirror`), which is what the mock's `display: none` does.
- (c) resolved: `screenAcronym` (`relatorio/screen-label.ts`) is the one acronym rule; `screenLabel`, `readingLabelText` and the table-title `sentenceCase` in `readings.ts` use it. No kernel golden (Porto Seguro `snapshot.golden.json`) changed.

Section 9 header at 390 px (12.5-E2E-003): fits as it is with a cabine named "Cabine de medição e proteção do galpão norte da subestação principal" (no overflow of `.sum-s9-head`, `.sum-title` not clipped, no page scroll); no `app.css` translation was needed.

E6-R2 e2e: Playwright never clicks an `aria-disabled` control (and a forced click at 1024 px can land on the Sticky action bar over the chip), so 6.5-E2E-001 and 6.5-E2E-004 press the inactive chip from the keyboard (focus, Enter), as a person with a keyboard would.

E6-R1 e2e (6.6-E2E-013): the idle commit (500 ms) is held back by refusing the device's `outbox` writes while the test types, so the reload surely comes before any commit on a loaded machine; no hide event fires before the reload. Without the refusal the test would race 300 ms against 500 ms.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm lint` and `pnpm static` -- expected: clean.
- `docker compose --profile tools run --rm tools pnpm test:unit -- <touched paths>` -- expected: green.
- `flock /tmp/fasor-verify.lock docker compose --profile tools run --rm tools pnpm test:api > /tmp/api-s8c.log 2>&1` -- expected: EXIT 0.
- Each new or touched Playwright spec alone with `--grep` under the lock -- expected: green.

## Auto Run Result

Status: done (orchestrator validation and gate below).

- Summary: a client push is one transaction under one company lock (a permanently refused op deletes its own log row; no savepoints, which made the 2500-op replay six times slower); AGENTS.md documents the e2e runner; E6-R1 point draft written 300 ms after typing and dropped after a stored commit; E6-R2 chips, Combobox and "Outro…" inactive in "Editar texto" with an authored note; Sumário "aguardando envio" leaves out photos with a local upload error (kernel `preIssue` `photoErrors`); viewer picture e2e by pixel size; `ficha-surface.tsx` split into eight modules under 250 lines; nine dated Epic 6 narrowing lines in `epics.md`; stepper single current rule (mock CSS, prototype pages, app copy), kernel `shownSheetSteps`, one acronym rule `screenAcronym`, 1024 landscape capture and checks, section 9 header fit at 390, MOCK-GUIDE and DESIGN.md dated notes; `makeSyncState` in the three tree tests and the instrument panel test; TAG-rename e2e 4.6-E2E-006 (fix already on main, #29); pg-boss reset matches `company_id` and `companyId`; four ledger entries closed.
- Files: api `sync/apply.ts`, `db/reset-company-jobs.ts`, `scripts/test-reset.ts` and their integration tests; web `state/draft-autosave.ts`, `state/drafts.tsx`, `surfaces/points/point-editor.tsx`, `surfaces/photos/caption-composer.tsx`, `components/chip.tsx`, `copy/pt-br.ts`, `styles/app.css`, `styles/components.css`, `db/file-store.ts`, `surfaces/relatorio/sumario-surface.tsx`, `surfaces/ficha/*` (split, `section-stepper.tsx`), test migrations; kernel `relatorio/{pre-issue,readings,screen-label,sheet-progress}.ts` and tests; e2e `ficha`, `gallery`, `p-screens.capture`, `photos`, `points`, `tree`, `v09-visual`; docs AGENTS.md, `deferred-work.md`, `epics.md`, DESIGN.md, MOCK-GUIDE.md, mock `components.css`, `60-ficha.html`, `prototype/index.html`.
- Review: 16 findings; patched 4 medium entries (post-commit draft drop test, shown steps in the sheet with the start step, caption desktop controls, and the hidden start step grouped) and 3 low (acronym tests, test title, prototype stepper rule); rejected 3 low (Sumário wiring at `@p1`, poison op now rolls back the whole push, leading or punctuated acronym) and 3 false. Known open for the PR: a deterministic non-permanent error mid-push now rolls back the ops before it too (the device outbox is stuck at that op either way).
- Follow-up review recommended: true (four medium entries patched). Named risk: the one-transaction push path (refused op removes its own `ops` row) and the start-step fix have no independent re-check; the integrated Epic 8 review should re-check both.
- Verification: implementer `pnpm verify` green before review (kernel 1143, web 854, tooling 33, api 157, e2e @p0 112); review patches verified by their own suites under the lock; orchestrator's 3 serial + 3 parallel `test:e2e:full` runs and the final `verify` are in the PR body.
- Residual risks: 6.6-E2E-013 refuses outbox writes to hold the idle commit back; the E6-R2 e2e presses inactive chips by keyboard (Playwright does not click `aria-disabled`).
- Orchestrator validation (2026-09-26, `test:e2e:full`, each run alone under the host lock): serial s1 200/204 passed, 0 failed, 1432 s; s2 1 failed (12.1-E2E-007, load), 2004 s; s3 0 failed, 1858 s. Parallel (3 workers) p1 1 failed (12.3-E2E-004), 964 s; p2 1 failed (12.3-E2E-004), 844 s; p3 1 failed (6.2-E2E-001), 822 s. Leak check clean in all six. Push times in the parallel runs: median 197-251 ms, max 2.2-2.9 s, none over 3 s. The three failing tests pass alone three times each. Gate kept at one worker (`PARALLEL_WORKERS = 1`, dated comment in `e2e/support/groups.ts`, new ledger entry owned by the Epic 9 carry-over).
