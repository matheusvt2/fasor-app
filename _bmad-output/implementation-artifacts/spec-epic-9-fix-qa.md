---
title: 'Epic 9 fixes: integrated review findings (E9-Q1..Q5, Q7..Q14)'
type: 'bugfix'
created: '2026-09-29'
status: 'in-progress'
baseline_revision: '6134dd4cecc8491f6a74e01b7a61ff7b97721dfb'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/reviews/epic-9-review-qa.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_reason: 'One fix batch for the Epic 9 integrated review (playbook section 6): thirteen small findings on the same surfaces (sheet cells, panel dialog, reading re-target), one PR.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The Epic 9 integrated QA (`reviews/epic-9-review-qa.md`) found five medium defects where two Epic 9 stories meet (confirm-all writes a hidden display value; a client `reading_kind` put re-queues a paid reading; undo of a photo-backed create re-queues the panel reading; a suggested cell overflows its table at 390 px; a racy dictation test) and eight low ones (burst row skip, Enter on a dictated cell, stale dictated state, AD-1 leaks in the panel dialog and two web files, a silent `aria-live`, a dead string, three load-flaky tests, a doubled reason line).

**Approach:** Fix each finding as the report proposes, with the smallest correct change; move every derived rule into `packages/domain`; mechanism fixes (Q1, Q2) ship a test that goes red without the fix (mutation run); flaky tests wait on committed state, never on time.

## Boundaries & Constraints

**Always:** AD-1/AD-13 ownership (statuses, rules, derived text in `packages/domain`; web renders and writes ops). New pt-BR strings go in their one home (AGENTS.md "Where a new user-facing string goes"), authored ones marked `// authored:`. Mock class names; `.frame-*` translations in `app.css` only. Every new `@p0` spec asserts committed state (outbox or IndexedDB), not only the screen. `LLM_PROVIDER`/`OCR_PROVIDER` stay `fake`. English code and comments, no emoji, `relatorio` never `laudo`.

**Never:** E9-Q6 and E9-Q15..Q18 (Matheus's questions). No change to `PARALLEL_WORKERS`. No new op family. No change to `services/ocr` or `contract/ocr.ts`. No `retry`/`waitForTimeout` added to make a test pass. `tokens.css`/`components.css` stay byte-identical.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error handling |
|---|---|---|---|
| Q1 dictated over display | empty cell, pending display suggestion 147 GΩ, dictated 150 GΩ on the same cell | cell shows the dictated 150 (Sugerido); "Confirmar todos" count and batch exclude that cell; after the dictated "Confirmar" the display reading is the "Visor … Conferir" line (existing replace view) | dictation dropped (field emptied) -> the display fill shows again and counts again |
| Q2 same-kind put | photo `reading_kind: plate`, status queued/running/done; client pushes `file/{id}/reading_kind = plate` | api rejects `op_invalid`; no job sent; row unchanged | device drops the dead op (AD-24) |
| Q2 other kinds | client put `reading_kind` = display/caption/panel/nc_obs | `op_invalid` | - |
| Q2 re-target | photo kind `panel` (queued, running or done) -> put `plate` | applied, `reading_status: queued`, plate job sent once bytes exist; a running panel job ends superseded (existing) | - |
| Q2 null | put `reading_kind = null` (any current kind) | applied; kernel sets `reading_status: none`; no job sent | - |
| Q3 undo create | 9.2 create batch (equipment + block + retarget + panel suggestion status) then "Desfazer" | block and equipment removed; photo `reading_kind: null`, `reading_status: none`, `reading_target: null`; panel suggestion `discarded`; no reading job sent (no enqueue, no new run row) | a plate job already queued ends superseded (kind changed) |
| Q7 failed grab | burst of 3, grab 2 rejects | failure toast; next shutter retries row 2 | - |
| Q8 Enter | Enter on a dictated suggested cell with the heard text unchanged | confirms it (writes the value) and runs to the next cell, like the display suggested cell | - |
| Q9 stale dictation | dictated on row 1, row 1 filled by "Confirmar todos" or a pull, later emptied | the old dictated suggestion does not come back | - |
| Q10 panel dialog online | panel photo `reading_status: failed`, or `done` with no panel suggestion | no "Lendo a foto…"; a reason line under the title; chips work | offline keeps the existing offline line |

</intent-contract>

## Code Map

- `packages/domain/src/relatorio/suggestions.ts:720` `measurementConfirmAllCandidates` (and `measurementTableVerifyCount` :736) -- Q1: add an optional `exclude: readonly CellAddress[]` (cells that show a dictated reading).
- `apps/web/src/surfaces/ficha/read-display.tsx` -- `useDisplaySuggestions.confirmAll/confirmable` (~:196-212), `ConfirmTableButton` (:496), `ReadingCell` (:261), `SuggestedCell` Enter handling (:393, the golden example for Q8).
- `apps/web/src/surfaces/ficha/ensaios-section.tsx:157-230` -- `MeasurementTable` owns `dictated` (`useTableDictation`); `actions` (incl. `ConfirmTableButton`) is built by the parent: pass the dictated address down (e.g. `actions` becomes a render function of the dictated address, or `ConfirmTableButton` moves into `MeasurementTable`).
- `apps/web/src/surfaces/ficha/sheet-observation-dictation.tsx:47` `useTableDictation` -- Q9: drop `dictated` once its cell is no longer empty.
- `apps/web/src/surfaces/ficha/measurement-field.tsx:242` `DictatedMeasurementField` -- Q8 Enter (:~318 `if (event.key === 'Enter') commitTyped()` does nothing on unchanged text); Q10 `valueText` join (:266) -> kernel `suggestionValueText`.
- `packages/domain/src/ops/apply.ts:297-304` `writeRow` `file/field` -- Q2/Q3 kernel rule: a `reading_kind` put queues only when the value is non-null and differs from the row's kind; a null put sets `reading_status: 'none'`.
- `apps/api/src/sync/apply.ts:92-100` `clientReadingPutIsValid`, `validate` (:103-144), `applyOneIn` (:300) -- Q2: shape: `reading_kind` value `plate` or null, `reading_target` object or null; row-state refusal (client origin only) through a new pure kernel predicate (e.g. `clientReadingKindPutAllowed(photo, value)`: null always; `plate` only when the stored kind is `panel`), answered `op_invalid`. `applyOneIn` does not know the origin today: thread it or check where the row is loaded.
- `apps/api/src/sync/routes.ts:45-78` `retargetedPhotos`/`sendRetargetedReading` -- must never send for a null put (row says `none`) -- verify.
- `apps/api/src/sync/panel-retarget.integration.test.ts` -- existing 9.2 route tests (:275 the op_invalid pattern); add Q2 and Q3 cases here.
- `packages/domain/src/ops/outbox.ts:42` `invertBatch` -- Q3: the inverse of a `file/{id}/reading_kind` put is a put of null, of `file/{id}/reading_target` a put of null; the inverse of a `suggestion/{id}/status` put in a batch that also puts a `reading_kind` is `discarded` (an undo never re-queues a provider reading, never leaves an orphan pending panel suggestion). Keep the rule in the kernel, commented.
- `packages/domain/src/relatorio/panel.ts:184` `panelRetargetOps`; `apps/web/src/surfaces/relatorio/tree-actions.ts:219-287` the create + `undoable`; `apps/web/src/db/commit.ts:306` `undoBatch`.
- `packages/domain/src/contract/version.ts:40` `CONTRACT_VERSION = 8` -- bump to 9 with a dated note (client `reading_kind` puts narrowed to `plate`/null, undo inverse); `MIN_CONTRACT_VERSION` unchanged.
- `apps/web/src/surfaces/relatorio/panel-capture.tsx:187-188,224-229` -- Q10: `offline`/`waiting` decided in web; replace with one kernel function in `packages/domain/src/relatorio/panel.ts` (e.g. `panelReadingLine({ online, photo, suggestion })` -> `{ kind: 'waiting' | 'offline' | 'failed' | 'empty', text } | null`), texts in the kernel (waiting/offline move from `copy/pt-br.ts` `sumario.panel` or stay referenced verbatim; failed/empty authored). Q12: `panel.typeGroup` (`copy/pt-br.ts:613`) unused -> remove. The chip row stays `role="group"`: its chips are `aria-pressed` toggle buttons, which a `radiogroup` cannot own (radiogroup needs `role="radio"` children).
- `apps/web/src/surfaces/photos/gallery-surface.tsx:278` `tile.block_id === null || marked` -- Q10: kernel predicate (e.g. `offersPeopleMark(photo)`), next to the 9.3 people rules.
- `apps/web/src/surfaces/ficha/camera-view.tsx:177-190` `grab` failure branch; `shutter` (:106-115) uses `taken.current` -- Q7: on a rejected frame also step `taken.current` back.
- `apps/web/src/speech/dictation.tsx:142` -- Q11: the `aria-live` word never changes; render `ui.dictation.listening` inside the live region only while `listening` (keep the element so the region exists) or announce it; CSS still shows it.
- `apps/web/src/surfaces/home/new-project-dialog.tsx:195,202` -- Q14: the Local field's `disabledReason` and the "Continuar" button's reason both say the client is missing; keep exactly one reason line (read `EXPERIENCE.md` by grep for "disabled" reasons / `btn-reason` to pick which one), and keep the button row intact at 1906 px.
- 60-ficha mock: `grep -n "frame-phone\|cell-value\|confirm-btn" _bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/mockups/prototype/screens/60-ficha.html` (never read it whole); `components.css:528-530` wraps `.suggestion-field` in `.is-wide` tables only. Q4 fix goes in `app.css` with a comment naming the mock rule it mirrors.
- Tests: `e2e/dictation.spec.ts:241-270` (Q5, 9.4-E2E-007: reload right after "Usar"); `e2e/suggestions.spec.ts:136-180` (Q13, 8.1-E2E-002: 8 `suggestion/` ops against 7 under load); `e2e/export.spec.ts:272` (E4-E2E-001 Escape under load); `e2e/journey-taps.spec.ts:144` (12.1-E2E-009, `humanTap` hit `div.nameplate-grid`); 9.1/9.4 specs `e2e/read-display*.spec.ts`, `e2e/dictation.spec.ts`, 9.2 `e2e/panel*.spec.ts` (find by grep `9.2-E2E`).

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/relatorio/suggestions.ts` + unit test -- Q1 `exclude` param on confirm-all candidates and verify count -- confirm-all must match what the table shows.
- `apps/web/src/surfaces/ficha/ensaios-section.tsx`, `read-display.tsx` -- Q1 pass the dictated cell to `confirmable`/`confirmAll`; the fresh-block re-check inside `api.edit` also excludes it.
- `apps/web/src/surfaces/ficha/measurement-field.tsx` -- Q8 Enter confirms (unchanged text) or writes the typed value, then runs on (`onRun` next; Shift+Enter previous) as `SuggestedCell` does; Q10 `valueText` from the kernel.
- `apps/web/src/surfaces/ficha/sheet-observation-dictation.tsx` -- Q9 clear `dictated` when its cell stops being empty.
- `app.css` -- Q4 suggested cell (display and dictated) and the "Conferir" cell fit a 390 px table: the suggested cell's confirm compact or on a second line as `60-ficha.html` draws it; `.ficha-mt` `scrollWidth <= clientWidth` at 390 px.
- `packages/domain/src/ops/apply.ts` + tests -- Q2/Q3 queue rule (change-only, null -> none).
- `packages/domain` new predicate + `apps/api/src/sync/apply.ts` -- Q2 refusal (client origin): value not `plate`/null, or `plate` on a photo whose stored kind is not `panel`; `reading_target` null accepted.
- `packages/domain/src/ops/outbox.ts` + tests -- Q3 inverse rules.
- `packages/domain/src/contract/version.ts` -- bump to 9, dated note.
- `packages/domain/src/relatorio/panel.ts`, `panel-capture.tsx`, `copy/pt-br.ts` -- Q10 panel reading line incl. failed/empty reasons online; Q12 remove `typeGroup`.
- `packages/domain` + `gallery-surface.tsx` -- Q10 people-mark predicate.
- `camera-view.tsx` -- Q7.
- `dictation.tsx` -- Q11.
- `new-project-dialog.tsx` -- Q14.
- `e2e/dictation.spec.ts` -- Q5 poll `storedBlock(...)` for "Contato com oxidação" before `page.reload()`.
- Q13 -- first find why 8.1-E2E-002 sees 8 `suggestion/` ops (reproduce under CPU load, e.g. run it with `--repeat-each` beside a parallel group, or reason from the code: a focused suggested field's blur-commit writing its own confirm/discard in the same tap as "Confirmar todos", whose candidates come from a render-time `pending`; the Verificar field's formatted guess `03/2012` against raw `2012-03`). Fix the product if it is a real duplicate write (the confirm-all must read the fresh pending suggestions, and one suggestion never gets two status ops), else the test. Record the root cause in this spec's Design Notes. Then E4-E2E-001: wait for the dialog's committed/focused state before Escape; 12.1-E2E-009: wait until the target is the element hit at its centre (layout settled) before the tap -- no sleeps.
- Tests per AC below.

**Acceptance Criteria:**
- Given a table cell with a dictated 150 GΩ and a pending display 147 GΩ, when the engineer taps "Confirmar todos (N)", then N excludes that cell and the batch in the outbox holds no op for it; when they then tap the cell's "Confirmar", the stored value is 150 GΩ with no `source_suggestion_id` and the display shows as the "Visor … Conferir" line. (`@p0` e2e; mutation run: remove the exclusion -> red.)
- Given a photo whose kind is `plate`, when a client pushes `reading_kind = plate` through `POST /api/sync/push`, then it is rejected `op_invalid`, the row's `reading_status` is unchanged and `enqueueReading` is not called; the same for `display`, `panel`, `caption`, `nc_obs`; a `panel -> plate` put is applied and sent; a null put is applied with `reading_status: none` and nothing sent. (api integration test through the sync route; mutation run: remove the refusal -> red.)
- Given a block created with "Fotografar equipamento", when the engineer taps "Desfazer", then the block is gone, the outbox undo batch puts `reading_kind` null and the panel suggestion `discarded`, and after "Sincronizar agora" the server holds the photo with `reading_status: none` and no new reading was sent (e2e plus api integration test).
- Given 390 px and a suggested measurement cell (display) and a dictated one, and a "Conferir" cell, then `.ficha-mt` `scrollWidth <= clientWidth` and "Confirmar" stays reachable (`@p0` e2e).
- Given a dictated suggested cell, when Enter is pressed, then the value is written (outbox put) and focus moves to the next cell.
- Given the panel dialog online with a failed or empty reading, then no "Lendo a foto…" shows and the reason line does, and the chips create the block (e2e `@p1` or component test).
- Q5, Q13: each of the four named tests passes `--repeat-each=5` alone and in `test:e2e:full`; none gained a sleep.
- Q7, Q9, Q11, Q12, Q14: each has a unit/component test or an e2e assertion; `typeGroup` no longer exists in `copy/pt-br.ts`.

## Spec Change Log

## Review Triage Log

## Design Notes

Q2/Q3 are one rule set. The kernel's `applyOp` runs on device replay too, so it never throws on a `reading_kind` put (an acked op re-applied over a snapshot must not break the device); it only decides whether the put queues. The refusal is the api's, for client ops, from a pure kernel predicate. Allowed client puts are exactly the 9.2 re-target (`panel -> plate`, allowed while the panel reading runs: that job ends superseded) and the undo's null. A refused put rolls its batch back, so the 9.2 create batch must never contain a refusable put -- keep a test for the create batch while the panel photo is `running`.

Q1 narrowing: the display reading under a pending dictated cell is not drawn as a second line before the dictation is confirmed (the "Visor … digitado" words would be wrong for a heard value); it shows as the existing "Conferir" line once the dictated value is stored.

~~Q13 root cause: to be filled by the implementation.~~

Q13 root cause (2026-09-29, implementation): a real duplicate write, not the test. `suggest()` in 8.1-E2E-002 ends with `syncNowAndReturn`, whose `page.goto(back)` reloads the app; the launch cycle's pull is followed by the device's auto-confirm sweep (`autoConfirmPending`, `db/suggestion-store.ts`), which may still be running when the test taps "Confirmar todos". The sweep read each pending suggestion, then its block, then committed, in three separate IndexedDB steps. When the "Confirmar todos" batch (cell value plus `confirmed` status, one transaction) landed between the sweep's suggestion read (still `pending`) and its block read (cell now equal), the sweep confirmed the same suggestion a second time (`meta.auto`): 8 `suggestion/` ops instead of 7. Under CPU load that window is wide; alone it is almost never hit. Reproduced deterministically in `suggestion-store.test.ts` ("E9-Q13 the sweep and a confirm tapped while it runs": with the guard removed it fails at `delay 1` with two status ops for one suggestion). Fix: the sweep commits through `commitBatchIf` (`db/commit.ts`), which re-reads inside the commit's own transaction that the row is still `pending` and the target still holds the value the confirm writes back; the stale-prose discard does the same. A single outer transaction around the sweep was tried first and dropped: Dexie committed it early (`PrematureCommitError`) across the sweep's nested async reads. The "Confirmar todos" side keeps its render-time `pending`: its fresh block read already drops a cell that is no longer empty, and a suggestion confirmed anywhere always fills its cell. E4-E2E-001 (Escape) and 12.1-E2E-009 (tap on a settling layout) were test timing under load: the Escape now waits for the focus inside the dialog, and the journey counter waits (by polling) until the target is the element at its centre.

Q4 finding (2026-09-29, implementation): at 390 px the `.ficha-mt` sideways scroll came mostly from the title row, not the cell: "Ler visor", the Dictation button and "Confirmar todos (N)" (shown whenever a table holds a suggested cell) did not fit one 358 px line and `.mt-actions` did not wrap (81 of the 110 px measured). Both are fixed in `app.css`: the actions row wraps below 768 px (authored), and the suggested cell takes the mock's narrow-table wrapping so its "Confirmar" moves to a second line instead of being clipped by `.measurement-field { overflow: hidden }`.

Q14 choice (2026-09-29, implementation): EXPERIENCE.md › Button keeps the reason beside the disabled primary, so the one line is "Continuar"'s; the Local field is disabled for the same reason and points at that line (`Combobox` gained `disabledReasonId`, the `Button` prop of the same name).

## Verification

**Commands (all inside Docker, from the worktree):**
- `docker compose --profile tools run --rm tools pnpm test:unit -- <paths>` -- green.
- `docker compose --profile tools run --rm tools pnpm --filter api test -- panel-retarget` (or the api suite's filter form) -- green.
- `docker compose --profile tools run --rm tools pnpm test:e2e -- --grep "<ids>"` -- green; flaky ones with `--repeat-each=5`.
- `docker compose --profile tools run --rm tools pnpm lint` and `pnpm static` -- green.
- The full gates (`test:e2e:full`, `verify`) are run by the orchestrator under `flock /tmp/fasor-verify.lock`, not by the implementer.
