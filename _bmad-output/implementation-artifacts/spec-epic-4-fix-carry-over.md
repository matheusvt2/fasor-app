---
title: 'Epic 4 carry-over: generate and status seams, cross-device reuse, section text and small fixes'
type: 'bugfix'
created: '2026-09-24'
status: 'done'
baseline_revision: 'd1d6aba252c4ee4923772787539e7d8ad11491ce'
review_loop_iteration: 0
followup_review_recommended: true
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-retro-2026-09-24.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_reason: 'Five Epic 4 retro action items (E4-A1, A2, A3, A4, A9 part) share the relatório status, generate and write-path surface; one branch saves tokens and lands them before Epic 5 builds on status and equipment identity.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The Epic 4 retrospective (`epic-4-retro-2026-09-24.md`, "Open" tables, items 5, 7, 9, 12, 15, 17-22, 24, Q15) found defects at the seams: three different "edited since" rules, an `issue` that ignores late edits and never fires on `unchanged`, a status rule hard-coded in the setup page, equipment reuse that reads only the local Dexie, a section-text editor that bypasses the undo queue and swallows write errors, a Sumário meta that calls an edited text "texto do template", blank exclusions that print and cannot be removed, duplicated op builders and web-side label fallbacks.

**Approach:** One kernel predicate for "this relatório was edited since snapshot N" scoped to the relatório's own ops plus the equipment its live blocks reference, used by the api, the Export dialog and the status advance; kernel rules for the issue decision and the new-relatório readiness; a project equipment pull stream; one shared undo-toast/edit-queue hook; kernel op builders; a shared `SyncState` test factory.

## Boundaries & Constraints

**Always:** AD-1/AD-13: every status, verdict, count and derived text is decided in `packages/domain`; `apps/web` renders from Dexie and writes ops only; `applyOp` stays the only reducer (a pulled stream is applied with the existing `applyPulled`). New pt-BR strings follow the three homes in AGENTS.md, marked `// authored:` when no mock gives them. Run everything in Docker (`docker compose --profile tools run --rm tools ...`). Keep existing tests green; change a pinned expectation only when this spec changes the behavior, and say so in the test name.

**Never:** Do not change which text prints when a template customises section 3 (item 23, open question). Do not block, fork or warn on a shared TAG rename (Q15 product choice, open question). Do not touch E4-A5/A6 items (25, 27-31), E4-A7 refactors beyond files already edited here, or E3-A3 (Batch A). Do not edit the equipment sheet route, the tree row navigation (`relatorio-tree.tsx`, `relatorio-tree.test.tsx`), or `packages/domain` progress/sheet-state (Batch A owns them). Do not edit `sprint-status.yaml` or `epics.md`. No emoji.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Other relatório's equipment (18) | R1 Emitido rev 1; R2 of the same obra adds a new equipment/block | R1 generate answers `unchanged`; R1 Export dialog idle number stays 1; R1 status stays Emitido | none |
| Shared TAG rename (Q15) | R1 Emitido rev 1 references equipment E; E renamed from R2 | api `editedSince` true for R1 (next generate is rev 2); R1's Export dialog shows rev 2; if R1 is on the device its status moves Emitido -> Em revisão in the same batch | R1 not on the device: its status is not moved there (open question) |
| Edit while generating (19) | Em revisão, generate queued at snapshot S, then a setup edit (seq > S or unsent) before the revision arrives | revision N is shown ready; NO `issue` op; status stays Em revisão; idle number becomes N+1 | none |
| Unchanged (20) | Emitido rev 1, manual back to Em revisão, no edit, Gerar | answer `unchanged`; `issue` op written; status Emitido | none |
| Setup complete (12) | status X | "Concluir" enabled only when `statusTable(X,'setup_complete')` is non-null; writes that status | none |
| Criar online (17) | device never pulled R1 (Emitido) of the obra | project equipment stream pulled first; R2 reuses R1's equipment by base TAG and type; no suffixed TAGs, no "TAG duplicada" after sync | pull fails -> treated as offline row below |
| Criar offline, never pulled (17) | offline; summary lists a relatório of the project this device never pulled; no project stream downloaded | "Criar relatório" refuses with the kernel's pt-BR reason; nothing written | none |
| Criar offline, first relatório | offline; summary lists no relatório of the project, or the project's equipment was pulled before | creation proceeds as today | none |
| Section text write fails (21) | commit rejects | error toast (`writeErrorText`), not swallowed | the queue continues |
| Stale Desfazer (21) | restore -> toast "Desfazer" -> user types | typing retires the undo toast; an undo can no longer overwrite newer text | none |
| Blank exclusion (24) | `setup.exclusions = ['A', '  ', '']` | DOCX/preview/section 3 text list only "A"; Sumário counts 1 | none |

</intent-contract>

## Code Map

- `packages/domain/src/status/edited-since.ts` -- `editedSince(ops, snapshotSeq)`, `editedOnDevice(pulled, unsent, snapshotSeq)`, `countsAsEdit`. Only `equipment` is project-scoped (`schemas/entities.ts:537` `ENTITY_SCOPE`); equipment paths are `equipment/{id}` and `equipment/{id}/{field}` (`ops/path.ts:220-226`).
- `packages/domain/src/status/table.ts` -- `statusTable(state, event)`.
- `packages/domain/src/relatorio/status-advance.ts:19` -- `advanceOnEdit(status, drafts)`.
- `apps/api/src/http/generate.ts:139-156` -- `editedAfter` selects `relatorio_id = R OR (scope project AND project_id = P)`; block rows are in `entities` (`entity='block'`, `relatorio_id`, row `equipment_id`, `removed_at`).
- `apps/web/src/db/generate-store.ts:62-72` -- `editedSinceSnapshot` with the same over-broad `inStream`.
- `apps/web/src/db/commit.ts:150-196` -- `buildBatch` groups by `relatorio_id`, skips `relatorio_id == null` ops, hand-builds the status op.
- `apps/web/src/surfaces/export/use-generate.ts:139-167` (`emitStatus`, hand-built status op), `:186-209` (`finishReady` always emits `issue`), `:272-273` (`unchanged` emits nothing).
- `apps/web/src/surfaces/relatorio/setup-surface.tsx:135-161` (`canComplete`, hard-coded `'rascunho'`, hand-built status op), `:279` (obra label fallback), `:335-410` (exclusions state, `onAddExclusion`, list markup).
- `apps/web/src/surfaces/relatorio/relatorio-ops.ts:37,52` -- existing `putBlockOp`, `putRelatorioStatusOp` (surface-local; `db/commit.ts` must not import from `surfaces/`).
- `apps/web/src/surfaces/relatorio/section-text-surface.tsx:79-150` -- hand-written `block/{id}/config` put from the render's `block.config`, `useFieldCommit` commit `void`s the promise, restore toast with direct `undoBatch`.
- Undo/edit-queue copies: `apps/web/src/surfaces/relatorio/relatorio-editor.ts:69-190`, `apps/web/src/surfaces/templates/template-composer.tsx:123-225`, `apps/web/src/surfaces/templates/templates-surface.tsx:64-90,168-220`.
- `packages/domain/src/relatorio/sumario.ts:118-155` -- `META.textFromTemplate`, `metaOfSection`; `:331` `projectLabel`.
- `packages/domain/src/relatorio/section-variables.ts:50-70` -- `section3Blocks`/`section3Text`; `print/layout.ts:184-191` reads `setup.exclusions`.
- `packages/domain/src/print/document-control.ts:27-30` -- stale ART comment.
- Web obra-label fallbacks: `apps/web/src/surfaces/project/new-relatorio-dialog.tsx` (subject), `project-surface.tsx:102` (`project.site ?? project.name`), `setup-surface.tsx:279`.
- Reuse (17): `new-relatorio-dialog.tsx:80-90` reads `equipmentRows(db, project.id)`; `instantiateTemplate` reuses by base TAG and type. Pull: `apps/api/src/sync/pull.ts:60` `pullRelatorio` (pattern), `routes.ts:109` (route pattern), `SYNC_ROUTES` in the kernel, `apps/web/src/sync/client.ts:70-71`, `apps/web/src/sync/engine.ts:300-360` (`pullStream`, `pullPhase` treats every non-company `sync_state` id as a relatório id), `apps/web/src/state/sync.tsx:36-83` (`SyncState`), `apps/web/src/db/sync-store.ts` (`companySummaries`, `syncStateRows`), `home-surface.tsx:74-77` maps sync_state ids.
- Tests that hand-build `SyncState`: `eviction-recovery-surface`, `app-shell`, `registries/empresa-tab`, `export/export-dialog`, `sync/sync-status-surface`, `home/home-surface`, `account/account-surface`, `relatorio/sumario-surface` (`*.test.tsx`); `relatorio-tree.test.tsx` stays untouched (Batch A).
- e2e: `e2e/export.spec.ts` (4.8-E2E-001/004 flows, `support/export-fixture.ts`, `support/push-server-ops.ts`, `support/relatorio-seed.ts`); api: `apps/api/src/http/generate.integration.test.ts`, `apps/api/src/sync/sync.integration.test.ts`.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/status/edited-since.ts` -- add `referencedEquipmentIds(blocks)` (live blocks' non-null `equipment_id`), `inRelatorioStream(op, {relatorioId, equipmentIds})` (own relatório ops, or project-scope `equipment`/`equipment/field` ops whose id is referenced), and `relatorioEditedSince(ops, snapshotSeq, stream)` plus a stream-aware `editedOnDevice`; add `issueOnRevision(status, editedAfterSnapshot)` returning `statusTable(status,'issue')` or null when edited. Unit-test every matrix row that is kernel logic -- one rule for three callers.
- `apps/api/src/http/generate.ts` -- `editedAfter` builds the stream from the relatório's live block rows and filters with the kernel -- items 18, Q15.
- `apps/web/src/db/generate-store.ts` -- `editedSinceSnapshot` uses the same kernel stream (blocks from Dexie) -- item 18.
- `apps/web/src/db/commit.ts` -- the auto status op uses the kernel `putRelatorioStatusOp`; for project-scope equipment ops in a batch, find this device's live relatórios of that project whose live blocks reference the equipment and apply `advanceOnEdit` to each (scan only when the batch has equipment ops) -- Q15, item 7.
- `apps/web/src/surfaces/export/use-generate.ts` -- the ready path reads `editedSinceSnapshot(revision.snapshot_seq)` at write time and emits the status from `issueOnRevision`; the `unchanged` answer runs the same path for its revision; status ops via `putRelatorioStatusOp` -- items 19, 20, 7.
- `packages/domain` (e.g. `src/relatorio/ops.ts`, exported) -- move the relatório op envelope, `putRelatorioStatusOp` and `putBlockOp` here; `relatorio-ops.ts` re-exports or imports them; every status and block-config write (setup, use-generate, sumário/tree, commit.ts, section text) uses them -- item 7.
- `apps/web/src/surfaces/relatorio/setup-surface.tsx` -- `canComplete` and `onComplete` ask `statusTable(relatorio.status,'setup_complete')` (fresh status at write time); obra label via `projectLabel`; each exclusion row gets the mock's `.overflow-trigger` ("Mais opções da exclusão N") with a "Remover" item that writes the list without it, undoable through the shared hook -- items 12, 9, 24.
- `packages/domain/src/relatorio/section-variables.ts` (+ any kernel exclusion count) -- blank or whitespace-only exclusions are dropped in one helper used by `section3Blocks`, the print layout and any count -- item 24.
- `apps/web/src/state/use-undoable-edits.ts` (new; name free) -- one hook: serialized write queue, write errors toasted with `writeErrorText` and rethrown, the undo toast retired by any later write and on unmount, "Desfazer" runs `undoBatch` in the queue with optional focus target; `relatorio-editor.ts`, `template-composer.tsx`, `templates-surface.tsx` and `section-text-surface.tsx` use it -- items 5, 21.
- `apps/web/src/surfaces/relatorio/section-text-surface.tsx` -- autosave and restore go through the hook and `putBlockOp`, reading the fresh block config at write time; an edited text writes a config marker (e.g. `section_text_edited: true`), restore clears it -- items 21, 22.
- `packages/domain/src/relatorio/sumario.ts` -- the meta reads the marker: edited -> authored "texto editado"; drop the stale "Story 4.7 refines" comment -- item 22.
- `apps/web/src/surfaces/project/*.tsx` -- use kernel `projectLabel` -- item 9.
- `packages/domain/src/print/document-control.ts` -- drop the stale ART comment -- item 15.
- Project equipment pull (17): kernel `SYNC_ROUTES.pullProject(id)` = `/api/sync/projects/:id`; api `pullProject` (project-scope ops of that project, same page shape, 404 for an unknown project) and route; client `pullProject`; engine stream id `project:{id}` via `pullStream`, followed in `pullPhase` through the project route (never as a relatório), plus `syncProject(projectId)`; `SyncState.syncProject`; Home ignores `project:` rows.
- `packages/domain` -- `newRelatorioEquipmentReady({projectId, summaries, heldRelatorioIds, downloadedStreamIds})`: ready when the summary lists no relatório of the project the device does not hold, or a `project:{id}` stream or a held relatório stream of that project was downloaded; plus the authored pt-BR refusal reason beside `newRelatorioReason`.
- `apps/web/src/surfaces/project/new-relatorio-dialog.tsx` -- on Criar: online -> `syncProject` then read `equipmentRows`; offline or pull failed -> kernel readiness; not ready -> refuse with the reason (toast or the button's reason), write nothing.
- `apps/web/src/test/sync-state.ts` (new; path free) -- `makeSyncState(overrides)` used by the eight test files listed in the Code Map.
- Tests: kernel unit tests for the matrix; api integration tests for R1/R2 generate (18, Q15) and the project pull route; web unit tests for the offline refusal, the section-text write error toast and stale undo retirement, exclusion removal; e2e below.

**Acceptance Criteria:**
- Given an Em campo relatório on one device, when the user generates revision 1 in the Export dialog, edits a setup field, sees the Sumário banner and the Em revisão pill, then generates again, then revision 2 is listed and the status is Emitido (`@p0` Playwright, clicks and typing, reload once).
- Given that relatório Emitido at revision 2, when the user moves it back to Em revisão from the header Overflow and presses "Gerar relatório" with no edit, then the dialog answers the same revision and the pill reads Emitido (`@p0`, same spec or its own).
- Given relatório R1 Emitido created by another device (seeded as server ops) and never pulled here, when this device creates R2 of the same obra online, then R2's equipment TAGs are R1's (no suffix) and Sync status shows no "TAG duplicada" after "Sincronizar agora" (`@p0` Playwright; plus an api integration test of the project pull).
- Given the same state offline, when the user presses "Criar relatório", then the kernel's pt-BR reason is shown and no relatório is created (web unit test or `@p1`).
- Given the section text editor, when a write fails or the user types after "Restaurar", then the failure is toasted and the old "Desfazer" is gone; and the Sumário row reads "texto editado" after an edit (unit tests; one `@p1` e2e for the meta).
- Given Etapa 2 with a blank exclusion and a filled one, when the user removes the filled one from its overflow menu and undoes, then the list is restored, and a blank exclusion never prints (unit + `@p1`).

## Open questions (do not decide)

- Q15 product choice: should renaming a TAG shared with an Emitido relatório be blocked, fork the equipment, or warn? Built: the rename is kept, `editedSince` sees it, and a relatório on the device moves to Em revisão; one not on the device keeps its status until it is opened or generated.
- Item 23: when a template customises section 3, which prints, the template text or the setup exclusions? Unchanged.
- Item 19 limit: an edit made on another device and not yet pulled cannot stop the `issue`.
- The "texto editado" word is authored (no mock covers an edited section row).

## Spec Change Log

## Review Triage Log

### 2026-09-24 — Review pass

Layers run: Edge Case Hunter, Verification Gap Reviewer. Skipped: Blind Hunter, Intent Alignment (token economy; the integrated Epic 5 review covers them).

- verdicts: 15 findings — high 0, medium 4, low 11, false 0, maybe-false 0
- findings:
  - `[medium]` `[reject]` commit.ts: a TAG rename does not move an Emitido relatório this device does not hold — the launch intent says a fix needing a product choice keeps the behavior and becomes an open question; listed under Open questions (Q15).
  - `[medium]` `[patch]` setup-surface.tsx onRemoveExclusion: a failed write leaves the row hidden, and the next autosave silently drops it — fix: restore the previous list when no batch was written.
  - `[low]` `[patch]` engine.ts syncProject: the second runCycle can answer 'busy' when a timer cycle takes the mutex — fix: loop while busy, awaiting cycleEnded.
  - `[low]` `[reject]` sumario.ts newRelatorioEquipmentReady: a held relatório whose first download was cut counts as ready — needs offline creation after an interrupted multi-page first download (online always pulls the project stream first); the proposed stricter rule refuses locally created relatórios, so it is a trade-off, not a correction.
  - `[medium]` `[patch]` use-generate.ts: an `unchanged` answer from Em campo (moved back two steps) never gets the 'generate' status, so it stays Em campo — fix: emit 'generate' before the issue, as the queued path does.
  - `[low]` `[reject]` use-generate.ts: revision row still absent after syncRelatorio — the device just reached the server and the answer names its latest revision, which the idle number already read; showing "failed" would misreport a success.
  - `[low]` `[reject]` use-generate.ts: a Dexie read throwing inside the not-caught-up try — needs a failing local read right after a successful request; rare and the fix adds a branch.
  - `[low]` `[reject]` generate.ts: a live block row failing blockRowSchema drops its equipment from the stream — server rows are written by applyOp with the same schema; no path shown that stores an unparseable block.
  - `[low]` `[reject]` section-variables.ts: a section edited before this change carries no marker and reads "texto do template" — no deployed data exists before the MVP; dev databases only.
  - `[low]` `[patch]` use-undoable-edits.ts: write and undo error toasts are shown with showToast, so leaving the Templates list no longer takes them away — fix: raise them through notify.
  - `[low]` `[reject]` claim, readiness "held" means an entity row exists — same root cause as the readiness row above; rejected with it.
  - `[medium]` `[reject]` claim, Q15 believed closed for unheld relatórios — same as the first row; the spec's Open questions state the limit.
  - `[medium]` `[patch]` claim, unchanged runs "the same issue path" — same root cause as the Em campo row; patched with it.
  - `[medium]` `[patch]` (verification-gap) no dialog test for item 19 (edit while generating, no issue) — fix: add an export-dialog test.
  - `[low]` `[patch]` (verification-gap) the project pull route has no 426 contract-skew test — fix: add it to 1.5-API-005's loop.

## Design Notes

The stream is recomputed from live blocks at check time: a block removed or re-pointed after the snapshot is itself a relatório-scoped edit, so no history of references is needed. Keeping the project stream in `sync_state` under `project:{id}` reuses `pullStream`'s cursor and completeness bookkeeping; every reader that assumes a relatório id must skip that prefix.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:unit` -- expected: green
- `docker compose --profile tools run --rm tools pnpm test:api` -- expected: green
- `docker compose --profile tools run --rm tools pnpm exec playwright test e2e/export.spec.ts --project=desktop-chrome` -- expected: green
- `docker compose --profile tools run --rm tools pnpm verify` -- expected: green (lint, static, unit, api, e2e @p0)

## Narrowings

- `SyncState.syncProject` is optional in the type, so `relatorio-tree.test.tsx` (Batch A's file) keeps type-checking without an edit; the provider always supplies it.
- The spec's "Sumário counts 1" for blank exclusions has no target: no kernel count of exclusions exists. `printedExclusions` is the one helper any future count uses.
- `relatorio-tree.test.tsx` does not use the new `makeSyncState` factory (Batch A owns the file); the other eight `SyncState` test doubles do.

## Auto Run Result

Status: done

**Summary:** The Epic 4 retro code items E4-A1, A2, A3, A4 and the `SyncState` factory of A9 are built.
- One kernel stream rule (`inRelatorioStream`, `relatorioEditedSince`, stream-aware `editedOnDevice`) is used by the api generate barrier, the Export dialog and the commit path's Emitido -> Em revisão (now also for a shared TAG rename of a relatório held on the device).
- `issueOnRevision` gates the issue on "no edit after the snapshot". An `unchanged` answer runs generate then issue.
- Setup "Concluir" asks `statusTable` with the real status.
- A new project pull stream (`GET /api/sync/projects/:id`, sync id `project:{id}`) is pulled before "Criar relatório". Offline creation is refused by `newRelatorioEquipmentReady` when the device never pulled the obra's equipment.
- The shared `useUndoableEdits` hook replaces three copies and is used by the section text editor and the exclusions.
- The section-text edited marker is read by the Sumário as "texto editado". Blank exclusions are filtered by `printedExclusions`, and an exclusion can be removed with undo.
- Kernel `putRelatorioStatusOp`/`putBlockOp` in `relatorio/ops.ts`, the web uses `projectLabel`, and the stale ART comment is gone.

**Files:** Kernel: `status/edited-since.ts`, `relatorio/ops.ts` (new), `sync/streams.ts` (new), `relatorio/section-variables.ts`, `relatorio/sumario.ts`, `contract/sync.ts`, `print/document-control.ts`. api: `http/generate.ts`, `sync/pull.ts`, `sync/routes.ts`. web: `db/commit.ts`, `db/generate-store.ts`, `db/sync-store.ts`, `state/sync.tsx`, `state/use-undoable-edits.ts` (new), `sync/client.ts`, `sync/engine.ts`, `surfaces/export/use-generate.ts`, the project, setup, section-text, relatório-editor, template-composer and templates surfaces, `test/sync-state.ts` (new). Tests and `e2e/export.spec.ts` (E4-E2E-001/002 `@p0`, 003/004 `@p1`).

**Review:**
- Layers run: Edge Case Hunter and Verification Gap Reviewer, with one fix loop.
- 15 findings. 8 were patched (4 medium, 4 low): exclusion removal failure, the syncProject busy race, unchanged from Em campo, error toasts through notify, the item 19 dialog test, and the 426 test for the project route.
- 7 were rejected, with reasons in the triage log. Two restate the Q15 open question, and the rest are rare lows. Nothing was deferred.

**Follow-up review recommended:** true. Two or more medium entries were patched on a first pass. The unverified risk is the unchanged-from-Em-campo path, which is covered only by a jsdom dialog test.

**Verification:**
- `pnpm verify` first run: lint, static, unit and api green; e2e 50 passed and 1 failed. The failure was 4.1-E2E-002, a "Sincronizar agora" 30 s wait under load average 8 with a parallel batch running. It passed 2 of 2 on re-run.
- Final `pnpm verify`: see the PR body.

**Residual risks:**
- A shared TAG rename does not move an Emitido relatório this device does not hold (Q15 open question).
- An edit made on another device and not yet pulled cannot stop the issue.
- Offline readiness trusts a held relatório whose first download was cut.
