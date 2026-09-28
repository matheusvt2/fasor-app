---
title: 'Epics 7 and 8 fixes: integrated review findings'
type: 'bugfix'
created: '2026-09-28'
status: 'done'
baseline_revision: '1922634738501401fbfc87d0ffbd6317076f79fa'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/reviews/epic-7-8-review-qa.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_reason: 'One fix batch for the integrated Epics 7 and 8 review (playbook section 6): the findings share the Sumário, the nameplate group and the reading job, and one gate run covers them.'
deferred:
  - summary: >-
      A confirmed parecer text taller than one page inside the cantSplit Parecer box row might be clipped by Word or LibreOffice.
    evidence: |-
      Edge Case Hunter, 2026-09-28 review pass (maybe-false). The composed summary states counts only and stays far under a page; settle by rendering a page-long edited summary through LibreOffice and checking the PDF.
    location: >-
      apps/api/src/jobs/generate/sections/section-10.ts
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** The integrated review of Epics 7 and 8 (`reviews/epic-7-8-review-qa.md`) found that a section-less relatório hides its only blocker on the Sumário (E78-Q1), a plate taken through the app can never be read under the `fake` providers (Q2), month-only dates and unregistered manufacturers are stored but invisible (Q3, Q4), the reading pipeline can double-run or strand a photo in `running`/`queued` (Q5-Q8), the parecer band shows two different "concluídas" counts (Q9), the Parecer box splits across pages (Q11), "Criar ⟨nome⟩?" fails label-in-name (Q13) and the plate crop is a sliver at 768 px (Q14).

**Approach:** Fix each finding exactly as the coordinator decided (below), kernel first (AD-1/AD-13), each with the test that proves it; then write the dated narrowing lines the review and PRs #50-#54 report under their stories in `epics.md` and close the `deferred-work.md` entries this batch resolves.

## Boundaries & Constraints

**Always:**
- Every status, count, verdict, date shape and composed text lives in `packages/domain`; `apps/web` renders and writes ops only. New pt-BR strings follow AGENTS.md's three homes; "Criar ⟨nome⟩?" is the kernel's `criarText`.
- `tokens.css`/`components.css` stay byte-identical; any CSS goes in `app.css` with a comment. Mock class names are kept.
- `OCR_PROVIDER`/`LLM_PROVIDER` stay `fake` everywhere; no network, no cloud account.
- New e2e specs that time a tap or share the document queue go in `SERIAL_SPECS` (`e2e/support/groups.ts`) as the existing rule says.
- `epics.md` edits are only the dated narrowing lines (append `*(2026-09-28, narrowing: … — PR #NN)*` lines at the end of the story section, the Epic 6 style at lines ~1640-1783); never delete or rewrite a sentence.
- A mechanism fix (Q1 foot, Q5 409/disable, Q6 dead letter, Q7 failed send, Q8 cadence) ships with a mutation run: revert the fix in the working tree, show its test goes red, restore; record the result in the Auto Run Result.

**Never:**
- Do not touch E78-Q10 (`[ART]` wording), Q12 (who-sends wording), Q15 (fixture TTR data), Q16 (Confirmar todos and the create-hint manufacturer), Q17 (queued wording), whether a Rascunho may generate, the parecer suggestion timing, the dual secondary ratio, not-tested bullets naming the TAG, PARSeq vs PP-OCRv5, or whether the plate tile shows on types other than the transformer: keep today's behavior.
- Do not edit `sprint-status.yaml`, the Porto Seguro fixture data, or regenerate a golden without reading its diff (a golden may change only where this spec says it should: Sumário rows of a section-less snapshot, section 10's `cantSplit`).
- No new op family and no `CONTRACT_VERSION` bump (a new API error code is not an op family).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Q1 section-less | Porto Seguro snapshot (no live section block), no parecer | `sumarioRows` gives capa, controle, then eleven virtual rows numbered 1-11 from `sectionNumbers(seed_version)` (as `print/layout.ts` `printedSections` prints them); row 10 `blocking` with "Parecer não preenchido"; foot "Só Conclusão e parecer (linha 10) impede gerar. …"; dialog reason "Preencha o parecer (linha 10 do sumário) …" | — |
| Q1 template | relatório with section blocks | unchanged rows; a relatório with some live sections never gets virtual rows | — |
| Q1 parecer set | section-less, parecer set | foot "Nada impede gerar.", row 10 meta = verdict label, dialog enabled | — |
| Q2 sha match | photo sha has a fixture | that fixture, as today | — |
| Q2 fallback | no sha fixture, target `transformador_forca` | the synthetic plate fixture (`a1eac910…json`), its OCR boxes scaled to the photo's actual `print` size, → 11 pending suggestions | — |
| Q2 other type | no sha fixture, any other block type | reading ends `failed` on the first attempt (permanent, "no fixture for block type …") → "Não foi possível ler" | — |
| Q3 shapes | cell `2024-08`, `2024-08-15`, `07/2025`, `2012`, `15/03/2019` | field shows `08/2024`, `15/08/2024` (date field as today), `07/2025`, `2012`, `15/03/2019`; never blank | typed text the kernel cannot parse keeps the value and shows `invalidDate` |
| Q3 copy | `last_nameplate.fields.data_fabricacao = "07/2025"` | the copy op writes canonical `2025-07` | a shape with no canonical form (`2012`) is copied as is |
| Q4 | manufacturer `SIEMENS` in the cell, absent from the registry | the field shows `SIEMENS` and an inline `Criar SIEMENS?` button; one tap → one `registry/manufacturer/{id}` create op; the field then shows the registry row selected | offline works (ops only) |
| Q5 | photo `running` | `POST /api/photos/{id}/reread` → 409 `reading_running`; no job sent, no run row | web: button disabled from the tap until the photo's `reading_status` changes (a failed→failed pass included) or the POST fails |
| Q6 | last attempt expires / worker dies | the reading's `reading_status` becomes `failed` | only if still `running` and no newer job for the key is queued/active |
| Q7 | pg-boss `send` throws at file receipt | photo `reading_status = failed` ("Tentar novamente" offered) | reread route with a failing send answers 500 and writes nothing |
| Q8 | this device holds a photo `running` | sync cycles every 5 s, for at most 120 s from the first cycle that saw one; then back to 60 s | offline/paused: no cycles, as today |

</intent-contract>

## Code Map

- `packages/domain/src/relatorio/sumario.ts` -- `sumarioRows` (:195) builds numbered rows only from `sectionBlocks`; `generateReason(rows)` (:275) reads rows only. `SumarioRow` has `blockId`, `kind`, `position`, `siblings`.
- `packages/domain/src/relatorio/pre-issue.ts` -- `preIssue` (:204); `parecer_missing` blocks while section 10 prints (:329-338, section-less counts as printing); `exportPrecheck` (:410); `parecerMissingReason(number, line)` (:423).
- `packages/domain/src/print/layout.ts:168` -- `printedSections`: section-less snapshot prints `sectionNumbers(seed_version)`; the Sumário fallback must mirror it (export or share the helper).
- `apps/web/src/surfaces/relatorio/sumario-surface.tsx` (rows :106, foot :293, `openable` ~:240) and `sumario-row.tsx` (`NumberedRow`, `Section9Row` need a block to reorder).
- `apps/web/src/surfaces/export/export-dialog.tsx:98` -- `parecerLine` from `sectionBlocks`; must come from the same kernel rows so both say "linha 10".
- `e2e/photo-numbers.spec.ts:164` -- 7.3-E2E-001 never calls `setParecer` (imported at :11; helper `e2e/support/relatorio-flow.ts:80`).
- `apps/api/src/jobs/reading/providers/fake.ts` + `index.ts` -- `ReadingProvidersFactory(ctx: {photo_sha256})`; `loadFakeFixture` throws permanent on a missing file. `fixtures/README.md` documents fixtures (update it). `job.ts:199-204` calls the factory after the block is known; `:207-213` refuses an OCR size different from the print size.
- `apps/api/src/jobs/reading/worker.ts` -- queue `reading`, policy `stately`, `retryLimit: 2`, `expireInSeconds: 300`, no dead letter; `ensureReadingQueue` only creates.
- `apps/api/src/jobs/reading/status.ts` -- `startReading` (send, then `running` guarded by the latest status op); `readingServerOp`, `readingStatusPath`, `READING_ACTOR`.
- `apps/api/src/http/files.ts:190-208` -- `queueReading` logs a failed send only. `apps/api/src/http/reading.ts` -- reread route (no `running` check).
- `packages/domain/src/contract/errors.ts:24` -- `errorCodeSchema` (add `reading_running`).
- `apps/web/src/surfaces/ficha/plate-photo.tsx` -- `FailedReading` (`asking` resets in `finally`), `PlateCrop` (ratio from the loaded picture). `apps/web/src/state/sync.tsx:273` `rereadPhoto`.
- `apps/web/src/sync/engine.ts` -- `SYNC_INTERVAL_MS` (:136), `schedule()` (:544); `apps/web/src/db/suggestion-store.ts:91` `readingCountRows` reads photos' `reading_status`.
- `packages/domain/src/relatorio/suggestions.ts` -- `parseFieldInput`/`parseDateInput` (accepts `mm/aaaa`), `suggestionValueText`, `suggestionAnnouncement` (:458), `criarText` (:473), `plateCropRegion` (:530), `regionWithin`.
- `packages/domain/src/format/datetime.ts:85` -- `splitDate`/`formatCalendarDate` (`YYYY-MM[-DD]` only). `schemas/entities.ts:32` `dateValueSchema` is the canonical shape `YYYY-MM[-DD]`. `reading/value.ts:87` date branch.
- `packages/domain/src/relatorio/nameplate-copy.ts:103` -- `lastNameplateCopy`; copied values go through here.
- `apps/web/src/surfaces/ficha/ficha-fields.tsx` -- `DateValueField` (:231, blank unless `YYYY-MM-DD`), `WordField` (:291). `components/registry-picker-field.tsx` (chip row has no chip for an unregistered value). `surfaces/ficha/nameplate-suggestions.tsx:323` passes `confirmLabel`; `components/suggestion-field.tsx` sets `aria-label={announcement}`. `surfaces/ficha/ficha-ops.ts` `createWordOp`.
- `packages/domain/src/relatorio/parecer.ts` -- `parecerHintText` (:143) uses `progress().sheets_concluded` (counts não ensaiadas); `composeParecer` (:176) counts `sheetState === 'concluida'` only.
- `apps/api/src/jobs/generate/sections/section-10.ts` -- the one-row Parecer box table (no `cantSplit`); `docx-section-10.test.ts`.
- `e2e/plate.spec.ts` (fake camera; `shootPlate`), `e2e/support/reading-ops.ts`, `e2e/support/photos.ts`; fixture image `services/ocr/tests/fixtures/plate-transformador.jpg` (1600x1100).
- `_bmad-output/planning-artifacts/epics.md` Epic 7 at :1785, Epic 8 at :1899; `_bmad-output/implementation-artifacts/deferred-work.md` entries at ~:966 (Q6), ~:984 (Q3), ~:990 (7.3-E2E-001).

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/relatorio/sumario.ts` -- Q1: when the snapshot has no live section block, append virtual numbered rows for `sectionNumbers(seed_version)` (same helper as `printedSections`), `blockId: null`, `rowKey` `section_N`, kind from `KIND_OF`, metas and `blocking`/`pending` from the same `preIssue` rows as a real row; add `virtual: boolean` to `SumarioRow`. Make the foot and the dialog's line one kernel answer: e.g. `sumarioLineOf(rows, 'section_10')`, and `generateReason` naming every row a blocking pre-issue row addresses (so a blocker can never be silent). Unit tests: section-less and template snapshots; every `exportPrecheck(issues).blocking` row is named by `generateReason(rows)` and every pre-issue row whose key is a Sumário row lands on a row (AD-2 agreement).
- `apps/web/src/surfaces/relatorio/sumario-surface.tsx`, `sumario-row.tsx` -- render a virtual row with its number as static text (no Position box input, no Overflow, no Alt+arrow move); it opens where no block is needed (setup rows 1, 3 and 10 → Dados do relatório as today, 7 gallery, 8 points); row 9 expands the tree; text rows 2, 4, 5, 6 do not open. `export-dialog.tsx` -- `parecerLine` from the kernel rows.
- `e2e/photo-numbers.spec.ts` -- 7.3-E2E-001 calls `setParecer` before `generateRevision`. Add `@p0` (in `e2e/parecer-export.spec.ts` or a spec on the Porto Seguro fixture) asserting, on the section-less fixture with no parecer: Sumário row 10 reads "Parecer não preenchido", the foot names "(linha 10)", the dialog shows the same blocking row and "(linha 10 do sumário)"; after `setParecer` both say nothing blocks and Gerar is enabled.
- `apps/api/src/jobs/reading/providers/{fake,index}.ts` -- Q2: factory ctx gains `block_type`; the fake keeps the sha256 fixture first, else a default fixture per block type (`transformador_forca` → the synthetic plate fixture), else a permanent failure. A fallback fixture's OCR is scaled to the actual image size (the `read` input's bytes, via sharp metadata) so the size check passes. Unit tests in `fake.test.ts`; update `fixtures/README.md`.
- `e2e/plate.spec.ts` (or a new `e2e/plate-reading.spec.ts`) -- Q2+Q8 `@p0`: open a transformer sheet, import `plate-transformador.jpg` through the app's own plate path (the camera fallback file input, `getUserMedia` rejecting), let it upload with no "Sincronizar agora" tap after the capture, and see "Lendo…" clear and the suggestions arrive from the real job within ~20 s (the fast cadence); assert the store holds the server's `reading_status = done` and 11 pending `suggestion` rows.
- `packages/domain` (`format/datetime.ts` and/or `relatorio/suggestions.ts`) -- Q3: `normalizeDateValue(value)`: `YYYY-MM[-DD]` kept, `MM/YYYY` → `YYYY-MM`, `DD/MM/YYYY` → `YYYY-MM-DD`, anything else returned unchanged; `dateFieldText(value)` for display (`formatCalendarDate` of the canonical shape, else the stored text). Use it in the reading value parse (`reading/value.ts`) and in `lastNameplateCopy` for date fields. Unit tests over every shape of the matrix.
- `apps/web/src/surfaces/ficha/ficha-fields.tsx` -- Q3: `DateValueField` keeps the date field for an empty or full-date value; for any other stored value it shows the kernel's text in a text input that commits `parseFieldInput` on blur/Enter (invalid → keeps the stored value, `invalidDate` helper). Q4: `WordField` (manufacturer) with a stored name absent from the registry shows that name and an inline text button `criarText(name)` committing `createWordOp` (one op); after it lands the chip/combobox shows it selected.
- `packages/domain/src/relatorio/suggestions.ts` + `components/suggestion-field.tsx` + `nameplate-suggestions.tsx` -- Q13: with a `confirmLabel`, the button's accessible name starts with the visible words (kernel `criarAnnouncement(name, trust)` → "Criar Celtta?, sugerido"); the Q4 button's name is its visible text. Update the specs that query the old name.
- `packages/domain/src/contract/errors.ts`, `apps/api/src/http/reading.ts` -- Q5: 409 `reading_running` while the photo's `reading_status` is `running`; integration test in `http/reading.integration.test.ts` (no job sent, no `reading_runs` row). `plate-photo.tsx` -- "Tentar novamente" disabled from the tap until the photo's `reading_status` changes (key the control by a value that changes on every status op, e.g. the photo row's last status op id or `last_modified_at`; re-enabled when the POST fails); extend 8.2-E2E-002 to assert it is disabled after one tap and that a second tap sends no second POST.
- `apps/api/src/jobs/reading/worker.ts` (+ `status.ts`) -- Q6: a dead-letter queue (`reading-dead`, created first) set as `deadLetter` on `reading` (update the existing queue's options, not only on create); its worker writes `failed` as `system:reading` when the photo's status is still `running` and no job for its singleton key is queued or active; register it where the reading worker is registered. Integration test with a provider that never resolves and shrunk `expireInSeconds`/`retryLimit`.
- `apps/api/src/http/files.ts`, `status.ts` -- Q7: a send that throws at receipt writes `reading_status = failed`; integration test with a throwing `enqueueReading`.
- `apps/web/src/sync/engine.ts` -- Q8: while this device's store holds a photo with `reading_status = running`, schedule the next cycle after 5 s instead of 60 s, for at most 120 s from the first cycle that saw one (reset once none is running); constants exported; unit test in `engine.test.ts` with the fake clock.
- `packages/domain/src/relatorio/parecer.ts` -- Q9: one `parecerCounts(snapshot)` (concluded = `composeParecer`'s definition, not tested apart) used by both `parecerHintText` and `composeParecer`; unit test that the hint's "N de M fichas concluídas" equals the Criteria line's "N concluídas"; update any e2e expecting the old hint.
- `apps/api/src/jobs/generate/sections/section-10.ts` -- Q11: the box row `cantSplit: true` and its paragraphs `keepLines`/`keepNext` so title and text stay together; `docx-section-10.test.ts` asserts `<w:cantSplit/>` in the box.
- `packages/domain/src/relatorio/suggestions.ts` + `plate-photo.tsx` -- Q14: kernel `padCropToAspect(region, image: {width,height}, minRatio)` widens the region symmetrically (shifted inside [0,1], clamped at the full width) until its pixel aspect ≥ `minRatio`; `PlateCrop` passes the box's rendered aspect once the picture loads. Unit tests; `@p1` e2e at 768 and 390 px: the `.plate-crop-view` width is at least `min(box width, the full-picture-width view) − 2 px` (and several times the 50 px sliver).
- `_bmad-output/planning-artifacts/epics.md` -- the dated narrowing lines of the review's "Dated narrowings" list plus any other narrowing the PR bodies of #50-#54 report (`gh pr view <n> --json body`), under Stories 7.1-8.6, plus this batch's own narrowings.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- close (strike + dated state) the Q6 dead-letter entry, the Q3 month-date entry and the 7.3-E2E-001 entry; add an entry for any narrowing this batch leaves.

**Acceptance Criteria:**
- Given the Porto Seguro fixture relatório with no parecer, when the Sumário opens, then row 10 "Conclusão e parecer" is present, red, reads "Parecer não preenchido", the foot names "(linha 10)", and the Export dialog's blocking row and reason agree; after the parecer is set, both say nothing blocks and `@p1` 7.3-E2E-001 passes.
- Given compose's `fake` providers, when a plate is imported through the app on a transformer sheet, then the real reading job produces the 11 suggestions and the sheet shows them without a manual sync.
- Given every date shape of the matrix in a nameplate date cell, when the sheet renders, then no value is blank, and a "Copiar da última visita" of `07/2025` stores `2025-07`.
- Given a copied manufacturer absent from the registry, when the sheet renders, then its name and "Criar ⟨nome⟩?" show, and one tap writes one registry create.
- Given a failed reading, when "Tentar novamente" is tapped twice quickly, then one POST is sent; and the route answers 409 while the photo is `running`.
- Given a reading whose last attempt expires, or a send that fails at receipt, then the photo ends `failed`.
- Given the parecer band, then the hint and the Criteria line show the same "concluídas" count.
- Given a revision whose section 10 starts near a page foot, then the Parecer box row carries `cantSplit`.
- Given the "Criar Celtta?" button, then its accessible name contains "Criar Celtta?".
- `docker compose --profile tools run --rm tools pnpm verify` is green and `pnpm test:e2e:full` has no failure other than a reported load flake with its passing isolated run.

## Spec Change Log

## Review Triage Log

### 2026-09-28 — Review pass
- Layers: Edge Case Hunter and Verification Gap Reviewer ran; Blind Hunter and Intent Alignment were skipped (token economy; the integrated epic review covers them).
- verdicts: 13 findings — high 0, medium 2, low 8, false 1, maybe-false 2
- findings:
  - `[medium]` `[patch]` VG: `photo-store.ts` `readingStatusOpId` (the key that re-enables "Tentar novamente") is run by no test; a stale value leaves the button disabled after a failed-over-failed pull — patched: `photo-store.test.ts` case over two pulled status ops, and 8.2-E2E-002 pushes another `failed` and sees the button enabled again.
  - `[medium]` `[patch]` VG: the padded plate crop is observed only by the `@p1` 8.6-E2E-003 and the unit test never fires `load` — patched: a jsdom case in `plate-photo.test.tsx` fires `load` with stubbed sizes and asserts the padded percentages and outline.
  - `[low]` `[reject]` EC: removing every section block makes the Sumário draw eleven virtual rows — by design: `printedSections` already prints the seed's eleven for such a snapshot (unchanged since Story 4.8), so the rows now say what prints; removing all eleven sections is not an everyday path.
  - `[maybe-false]` `[defer]` EC: a confirmed parecer text taller than a page inside the `cantSplit` row might be clipped by Word or LibreOffice — would be settled by rendering a page-long summary through LibreOffice; the composed summary is counts only, far under a page.
  - `[low]` `[reject]` EC: a rejected local commit of the "Criar ⟨nome⟩?" registry create leaves the button hidden until remount — a local IndexedDB commit failure is not an everyday event, and the fix adds a promise contract and state.
  - `[low]` `[reject]` EC: a stored manufacturer matching a removed registry row gets no "Criar" and no chip — removing a manufacturer still used on a sheet is rare; the invisibility itself predates this batch.
  - `[false]` `[reject]` EC: a name registered meanwhile makes "Criar ⟨nome⟩?" write a duplicate registry row — registry names merge on the normalized name (AR-18, `registry-picker-field.tsx`), and a pulled row selects the name and removes the button.
  - `[low]` `[reject]` EC: Enter then an immediate blur in the month-date text field may write the same put twice — an identical second put changes nothing the device or the document shows; the window is the few ms before the live read lands.
  - `[low]` `[reject]` EC: a pulled date change while the engineer types in the month-date text field replaces the typed text — the same trade-off as the other plain fields; unlikely on one relatório edited by one engineer.
  - `[low]` `[reject]` EC: the crop's box ratio is measured once at load (hidden box or a later rotation keeps a stale ratio) — the box has a fixed 160 px height; a rotation leaves a padded, not a sliver, view; a ResizeObserver is added complexity.
  - `[low]` `[reject]` EC: a wall clock moved backwards keeps the 5 s cadence while a reading stays `running` — needs both a clock jump and a stuck reading, which E78-Q6 now ends.
  - `[maybe-false]` `[reject]` EC: the dead-letter worker exhausting its own retries (database down about 15 s) leaves the photo `running` — if true it is low (a database outage during a dead-letter event); settled by a test with the database stopped.
  - `[low]` `[reject]` EC: a send that throws after pg-boss committed the job writes `failed` while the job runs — pg-boss `send` is one insert; a throw after its commit (connection drop at the reply) is rare, and the job's own `done` then overrides.

## Design Notes

- Q1 virtual rows are the review's second option ("render fallback rows 1 to 11 when a snapshot has no section blocks"); rows 1-11 match what the document prints for that snapshot, so "linha 10" is true on both surfaces.
- Q2's other-type failure is permanent rather than the fixture `outcome: error` (transient, three attempts with backoff): same "Não foi possível ler", reached in one attempt.
- Q8's bound is per burst: the 120 s window restarts only after a cycle sees no `running` photo.

## Verification

**Commands:** (always inside the compose project of this worktree; heavy runs under `flock /tmp/fasor-verify.lock`; output to a log, read the tail)
- `docker compose --profile tools run --rm tools pnpm test:unit -- <paths>` -- green for the touched kernel/web tests.
- `docker compose --profile tools run --rm tools pnpm test:api -- <paths>` -- reading, files, generate section 10 green.
- `docker compose --profile tools run --rm tools pnpm test:e2e -- <spec> --grep <id>` -- each new or changed spec green alone.
- `docker compose --profile tools run --rm tools pnpm lint` and `pnpm static` -- clean.

## Auto Run Result

- `pnpm test:unit` (whole suite): 208 files, 2294 tests passed. `pnpm test:api` (whole suite): 39 files, 243 tests passed (the Porto Seguro structure golden unchanged). `pnpm lint` and `pnpm static` clean.
- e2e, each alone on `desktop-chrome`: E78-Q1 7.5-E2E-006, `@p1` 7.3-E2E-001, E78-Q2 8.4-E2E-001, `@p1` E78-Q14 8.6-E2E-003, 8.2-E2E-002 (extended), 8.6-E2E-001, E78-Q3/Q4 8.1-E2E-005: 7 passed, 0 failed.
- Mutation runs, each fix reverted at one point in the working tree, its test run, then restored:
  - Q1 (no virtual rows in `sumarioRows`): `sumario.test.ts` 4 failed.
  - Q5 route (no `reading_running` check, api restarted): `reading.integration.test.ts` E78-Q5 failed.
  - Q5 web (button not disabled while asking): `plate-photo.test.tsx` E78-Q5 failed.
  - Q6 (dead letter worker not registered): `job.integration.test.ts` E78-Q6 "a provider that never answers" failed (status stayed `running`).
  - Q7 (receipt no longer writes `failed`): `files-reading.integration.test.ts` both E78-Q7 tests failed.
  - Q8 (`observeReadings` skipped): `engine.test.ts` both E78-Q8 tests failed.
  - After the restores: `pnpm static`, `pnpm lint` and the touched web tests green.
- Review pass (2026-09-28): 13 findings; 2 medium patched (both test gaps: `photo-store.test.ts` E78-Q5 case over pulled status ops, 8.2-E2E-002 re-enable after another `failed`; `plate-photo.test.tsx` E78-Q14 loaded-crop case, red with the padding removed), 1 deferred (cantSplit on an overlong parecer, unverified), 10 rejected with reasons in the triage log.
- Follow-up review recommendation: false. The two patched mediums added tests only and changed no product code, so no unverified risk remains from the patches (patched counts: high 0, medium 2, low 0).
- Residual risks: the rejected edge cases in the triage log; the full `pnpm verify` and `test:e2e:full` are run by the orchestrator under the host lock (results in the PR).
