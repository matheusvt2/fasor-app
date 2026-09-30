---
title: 'Stories 11.9 + 11.10: Priority-driven deadline and the action-plan table'
type: 'feature'
created: '2026-09-30'
status: 'done'
baseline_revision: 'd7beb605ccc7cc22c1537c05cac945e78e799650'
review_loop_iteration: 0
followup_review_recommended: true
dev_model: opus
dev_effort: medium
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
warnings: ['batched', 'oversized']
batched_reason: '11.10 prints exactly the priority, deadline and owner that 11.9 lets the user write; one kernel module feeds both, and 11.10-TABLE-FROM-PICKER is one assertion across the two.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** `point.priority`, `deadline` and `owner` exist in the row (contract 4, `entities.ts:506-526`) with no UI and nothing printed (source-deltas row 29 dated them post-MVP for NR-10 10.7.11). The office cannot schedule findings, and section 8 prints only bullets.

**Approach:** A pure kernel module computes the priority labels, `deadlineFromPriority`, the typed-versus-suggested reading of a stored deadline, the action-plan rows and the "pontos sem prazo" pre-issue row. The point editor gains the Priority picker, Prazo (Suggestion field) and Responsável per `72-pontos.html`; the read-mode card shows Prazo, Prioridade pill and Responsável; the generate job prints the table beneath section 8's bullets. No new op family: the `point/{id}/{priority|deadline|owner}` puts exist since contract 4, so `CONTRACT_VERSION` stays 13.

## Boundaries & Constraints

**Always:**
- Ownership (AD-1/AD-13): labels, hints, suggestion dates, the typed/suggested decision, the pick's writes, row composition, numbering and the pre-issue text live in `packages/domain`; `apps/web` renders from IndexedDB and writes ops through `commitBatch` only.
- Deadline table (FR-50): P0 = the point's creation date; P1 +30, P2 +90, P3 +180 calendar days; P4 = the relatório's `next_intervention_date` verbatim (it may be `YYYY-MM`), and `null` when that field is empty. Never +365, never an annual interval (context "Conflicts to resolve" item 2; source-deltas row 29 wins over `EXPERIENCE.md:130`).
- Creation date = the America/Sao_Paulo calendar date of `uuidV7Instant(point.id)` (`format/datetime.ts:231`, with `calendarDateOfInstant`); day arithmetic on `YYYY-MM-DD` with UTC math so no host time zone shifts a day.
- A stored deadline counts as **suggested** when it is `null` or equals `deadlineFromPriority(point.priority, …)` of the point's current priority; anything else is **typed**. A pick writes one batch: the `priority` put, plus a `deadline` put to the new suggestion only when the current deadline is suggested (the new suggestion may be `null`, which clears a stale suggested date). A typed date is never overwritten by a pick.
- When the stored deadline is typed and the current priority's suggestion is non-null and differs, the field shows the suggestion beside it with a "Substituir" button that writes the `deadline` put (one batch).
- Priority pill: text first ("P0 · Imediata", "P1 · Curto prazo", "P2 · Médio prazo", "P3 · Longo prazo", "P4 · Próxima manutenção"), `data-p` tone second; mock class names `.priority-pill[data-p]`, `.priority-picker .option-row[role=radio][aria-checked]`, `.radio`, `.pr-text`, `.pr-hint`, `.poa-prazo-sf`, `.suggested-pill`.
- Picker: `radiogroup` labelled "Prioridade", five rows, accessible names "P0, Imediata, hoje" … "P3, Longo prazo, 180 dias", "P4, Próxima manutenção, próxima intervenção"; roving focus with arrow keys; one tap/Space selects and writes; Delete/Backspace on a focused row clears the priority (and a suggested deadline); no default selection.
- Every pick, clear and "Substituir" is one batch offered for undo through the editor's `useUndoableEdits` toast ("Desfazer"), which restores both priority and deadline.
- Responsável is a free-text field writing `point/{id}/owner` (trimmed, `null` when blank) through the same autosave path as Ação (`useFieldCommit`, `point-writes.ts`).
- Action-plan table, printed beneath section 8's bullets whenever section 8 prints: columns Nº · Ponto de atenção · Local/TAG · Prioridade · Prazo · Ação recomendada · Responsável · Imagens; one row per section 8 bullet, in bullet order (live points by `order_key`, then derived groups), numbered 1..n continuously; "—" for every missing value.
- pt-BR strings follow the three homes (AGENTS.md): labels, hints, row text and the pre-issue text in the kernel; field labels and helpers in `apps/web/src/copy/pt-br.ts`; new authored strings marked `// authored:`.
- No emoji; English code and comments.

**Never:**
- No schema, row-shape or op-family change; no `CONTRACT_VERSION` bump; no `created_at` column on `point`.
- No "Como imprime na seção 8" preview on the Points surface (not named by either story; listed as an open question).
- No priority counts in section 10's parecer summary; no Título field on the point.
- Do not touch `sprint-status.yaml` or `epics.md`; do not call AWS; do not run `test:e2e:full` or the full matrix.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pick on empty | point created 2026-09-08, priority null, deadline null; pick P1 | batch: priority P1, deadline 2026-10-08; Prazo shows 08/10/2026 with "Sugerido" | none |
| Re-pick suggested | P1 / 2026-10-08; pick P2 | priority P2, deadline 2026-12-07 (+90) | none |
| Typed survives | P1, deadline typed 2026-11-30; pick P3 | only priority put; Prazo keeps 30/11/2026, no "Sugerido"; beside it the P3 suggestion 07/03/2027 with "Substituir" | none |
| Substituir | as above, press "Substituir" | deadline put 2027-03-07; "Sugerido" pill returns | none |
| P4 with date | `next_intervention_date` 2027-09 or 2027-09-08 | deadline = that value verbatim | none |
| P4 without date | `next_intervention_date` null; deadline suggested by P1 | priority P4, deadline put null; field empty, helper says the relatório has no next intervention date | none |
| Clear | Delete on the checked row, deadline suggested | batch: priority null, deadline null | typed deadline kept |
| Undo | "Desfazer" after any pick | previous priority and deadline both restored in IndexedDB and pushed | none |
| Month end | created 2026-01-31, P1 | 2026-03-02 (calendar-day addition) | none |
| Non-v7 id | point id not UUIDv7 (legacy/test) | creation date unknown: P0..P3 suggestion null | no throw |
| Table row, manual | text with photo token of Imagem 5, equipment SEC-C12 in "1° Subsolo › Coluna 12", P1, 2026-10-08, owner | Nº 1, resolved text, "SEC-C12 · 1° Subsolo › Coluna 12", "P1 · Curto prazo", "08/10/2026", action, owner, "5" | "—" per blank cell |
| Table row, derived | Não ensaiado group of 2 sheets | one row after the manual ones, Ponto = the bullet text, Local/TAG = both titles joined "; ", Prioridade/Prazo/Ação/Responsável/Imagens "—" | none |
| Images | point cites photos 12, 5 and a removed one | "12, 5" (citation order, deduplicated, removed omitted) | "—" when none |
| Pre-issue | 3 live points, 2 with deadline null | info row `points_sem_prazo`, section_8, "2 pontos sem prazo"; 0 → no row | none |

</intent-contract>

## Code Map

- `packages/domain/src/schemas/entities.ts:300,506-526` -- `next_intervention_date`, `pointPrioritySchema`, `pointRowSchema` (read only).
- `packages/domain/src/format/datetime.ts:102,150,207,231` -- `formatCalendarDate`, `dateFieldText`, `calendarDateOfInstant`, `uuidV7Instant`: reuse for creation date and dd/mm/aaaa printing.
- `packages/domain/src/points/` -- `checks.ts` (`livePoints`, `pointsSemAcaoText` pattern, `newPointRow`), `summary.ts:36` (`pointTitle`, `equipmentPointTitle`), `derived.ts` (`derivedPoints`, groups), `refs.ts` (`extractPhotoRefs`). New module here: `priority.ts` (name free).
- `packages/domain/src/print/section-8.ts` -- `resolveSection8`, `LayoutSectionPoints`, `section8Layout`; add the table rows to the layout; update the header comment.
- `packages/domain/src/photos/numbering.ts` -- `numberPhotos` (the same numbers section 7 prints).
- `packages/domain/src/relatorio/pre-issue.ts:48-72,277-283` -- `PreIssueKind`, section 8 rows; add `points_sem_prazo` (severity `info`). `exportPrecheck` counts it in "N avisos": update tests that assert counts.
- `packages/domain/src/relatorio/ops.ts:46` + `putPointOp` -- existing put families for `priority|deadline|owner`.
- `packages/domain/src/index.ts` -- export the new functions.
- `apps/api/src/jobs/generate/sections/section-8.ts` -- `section8Children`: append the table after the bullets; reuse the table builders in `apps/api/src/jobs/generate/docx.ts:169,234`.
- `apps/api/src/jobs/generate/docx-structure.ts` -- `extractStructure`/`readZipEntries` for DOCX assertions; `docx.test.ts` for unit coverage.
- `apps/api/src/jobs/generate/golden/` + `scripts/regen-goldens.ts` -- regenerate the Porto Seguro goldens in the tools container.
- `apps/web/src/surfaces/points/point-editor.tsx` -- editor (Ação field pattern, `useUndoableEdits` at :97/:159); add picker, Prazo, Responsável after Ação per `72-pontos.html:226-255`.
- `apps/web/src/surfaces/points/point-writes.ts` -- `writePoint`/`PointValues`: add `owner`; add the pick/clear/replace batch writer (ops from the kernel decision).
- `apps/web/src/surfaces/points/points-surface.tsx:323-328` -- read-mode `dl.poa-fields`: add Prazo, Prioridade (pill or "—"), Responsável per `72-pontos.html:89-94`.
- `apps/web/src/components/date-field.tsx`, `suggestion-field.tsx` -- reuse for Prazo; `apps/web/src/copy/ui.ts:98` "Substituir".
- `apps/web/src/styles/components.css:842-856` -- `.priority-pill`, `.priority-picker` rules exist (unchanged); mock-only rules for `.poa-prazo-sf` go in `apps/web/src/surfaces/points/points.css` under the surface scope.
- `apps/web/src/copy/pt-br.ts:814` -- the "not built" comment to update; add Prioridade, Prazo, Responsável labels and helpers (`72-pontos.html:241,248`).
- `apps/web/src/surfaces/relatorio/setup/etapa5-local.tsx:135` -- where `next_intervention_date` is edited (e2e setup path).
- `e2e/points.spec.ts`, `e2e/photo-numbers.spec.ts:172-250` -- patterns for point creation, DOCX download and `extractStructure`.
- `apps/api/src/sync/points.integration.test.ts:103-160` -- already pushes the three puts through the sync route (no new refusal, so no new api test is required).

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/points/priority.ts` (+ `index.ts` exports) -- `POINT_PRIORITIES`, `priorityLabel(p)`, `priorityHint(p)`, `priorityAccessibleName(p)`, `pointCreatedDate(pointId): string|null`, `deadlineFromPriority(priority, createdDate, nextIntervention): string|null`, `deadlineState(point, nextIntervention) -> { suggestion, suggested: boolean, replace: string|null }`, `priorityPickWrites(point, next: Priority|null, nextIntervention) -> { priority, deadline?: string|null }`, `replaceDeadlineWrite`, `pointsSemPrazo(points)`, `pointsSemPrazoText(n)` -- one place for every rule above.
- `packages/domain/src/points/priority.test.ts` -- unit-test every matrix row (dates, month end, leap day, YYYY-MM, null P4, non-v7 id, typed vs suggested, clear).
- `packages/domain/src/print/section-8.ts` + `section-8.test.ts` -- `ActionPlanRow { number, point, local, priority, deadline, action, owner, images }` (all strings, "—" resolved), `resolveActionPlan(snapshot, numbering)`, `LayoutSectionPoints.table`; tests for manual+derived numbering, "—", images, order after a move.
- `packages/domain/src/relatorio/pre-issue.ts` + its tests -- `points_sem_prazo` info row on `section_8`.
- `apps/api/src/jobs/generate/sections/section-8.ts` + `docx.test.ts` -- a header row with the eight column titles and one row per `ActionPlanRow`, directly after the last bullet, styled like the existing document tables; assert from the section 8 heading, never by position (E7-A6).
- `apps/api/src/jobs/generate/golden/*` -- regenerate with `scripts/regen-goldens.ts` in the tools container; state the golden diff in the PR.
- `apps/web/src/surfaces/points/point-writes.ts` -- `owner` in `PointValues`/drafts (`pointDraftValue` accepts rows without `owner` as `''`); `writePriorityPick`, `writeDeadline` returning the batch id for undo.
- `apps/web/src/surfaces/points/point-editor.tsx` + `points.css` -- Prioridade picker, Prazo Suggestion field (DateField value, "Sugerido" pill when suggested, typed date editable and committed as a `deadline` put, the "Substituir" line when `replace` is set, helper from the mock; the P4-without-date helper authored), Responsável field; undo toast for pick/clear/replace. A pick on a point not yet stored creates it in the same batch (the create path `writePoint` uses for text/action), so the picker is never disabled.
- `apps/web/src/surfaces/points/points-surface.tsx` -- read-mode Prazo (`formatCalendarDate` or "—"), Prioridade pill or "—", Responsável or "—".
- `apps/web/src/copy/pt-br.ts` -- labels and helpers.
- `e2e/action-plan.spec.ts` (new) -- the ACs below as a human (clicks, keyboard, typing, reload), each `@p0` asserting IndexedDB rows/outbox, not only the screen; one `@p1` 390 px fit of the picker and card fields (no horizontal scroll of the editor container).
- `_bmad-output/implementation-artifacts/deferred-work.md` -- entries for the deferred items below; `_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/mockups/prototype/screens/72-pontos.html` has no `data-slice` marks for these; leave the mock unchanged.

**Acceptance Criteria:**
- Given a point on the Points surface and a relatório with `next_intervention_date` set, when the user opens it in edit mode and taps "P1 · Curto prazo", then the priority and the +30 date are written in one batch, Prazo shows the date with "Sugerido", and after reload the read-mode card shows the pill "P1 · Curto prazo" and the date (11.9 main).
- Given that point, when the user taps P4, then Prazo becomes the relatório's next intervention date; given a relatório without it, then Prazo is empty and the helper says so (conflict item 2).
- Given a typed Prazo, when the user picks another priority, then the typed date stays, the differing suggestion shows with "Substituir", and pressing it writes the suggestion (11.9 AC "never overwritten").
- Given a pick, when the user presses "Desfazer", then priority and deadline both return to their previous values in IndexedDB (11.9-UNDO).
- Given the picker focused, when the user presses arrow keys and Space, then selection moves and writes; Delete clears; the rows' accessible names follow "P1, Curto prazo, 30 dias".
- Given a Responsável typed, when the field blurs, then `point/{id}/owner` is in the outbox and the card shows it after reload.
- Given a point prioritized in the UI and another with no deadline, when the office generates the relatório and downloads the DOCX, then section 8 carries the table with the eight headers, the first row with "P1 · Curto prazo" and the suggested date, the second with "—" in Prazo, derived rows after manual ones numbered continuously, and the Sumário section 8 row lists "1 ponto sem prazo" (11.10-TABLE-FROM-PICKER).

## Spec Change Log

## Review Triage Log

### 2026-09-30 — Review pass

Layers: Edge Case Hunter and Verification Gap Reviewer. Blind Hunter and Intent Alignment were skipped (token economy; the integrated epic review covers them).

- verdicts: 12 findings — high 1, medium 6, low 3, false 2, maybe-false 0
- findings:
  - `[high]` `[patch]` VG: "Recuperar" with the editor closed drops a recovered Responsável on stored points (`point-draft-recovery.ts` passes `['text','action']`). Fix: pass `owner` too, plus an e2e recovery case.
  - `[medium]` `[patch]` VG: no test covers the month-only Prazo branch. Grouped with EC4. Fix: an e2e with next intervention `2027-09`.
  - `[medium]` `[patch]` VG other (grouped with EC4): a month-only deadline renders read-only, so Prazo cannot be typed or cleared. Fix: show the month value and render an empty DateField with it.
  - `[medium]` `[patch]` EC1 (grouped with EC9): a pick on a blank new point creates an empty-text point, which prints an empty bullet; `writePoint` refuses that create. Fix: gate the create and keep the pick pending until the first text, action or owner commit.
  - `[false]` `[reject]` EC2: a refused pick or deadline write closes the editor "silently". `useUndoableEdits.write` toasts every refusal (`writeErrorText`) and rethrows, which is the same path Ação already uses.
  - `[medium]` `[patch]` EC3: a typed Prazo that has not committed is not in the FR-61 draft, so a reload loses it. Fix: carry it in the draft and write it on apply and on recovery.
  - `[medium]` `[patch]` EC4: month-only deadline blocks typing/clearing Prazo — same root and fix as the VG other row.
  - `[low]` `[reject]` EC5: a pending typed-Prazo commit can later override an external change. This needs a sync or undo landing inside the 500 ms idle window. It is the existing `useFieldCommit` pattern every autosaved field shares, and the fix adds cancel logic.
  - `[low]` `[patch]` EC6: a pick or "Substituir" on a point removed elsewhere gives no feedback. Fix: return `gone` and notify, as `persist` does.
  - `[low]` `[patch]` EC7: a table row taller than a page cannot split. Fix: `cantSplit` only on the header row (a direct deletion).
  - `[false]` `[reject]` EC8: arrow keys only move focus. The spec says "roving focus with arrow keys; one tap/Space selects and writes", and `EXPERIENCE.md` says "one tap selects and writes". Selecting on every arrow press would write a batch per key.
  - `[medium]` `[patch]` EC9: the picker create path disagrees with `writePoint`'s gated create. Same root and fix as EC1.

## Design Notes

Deferred with owners (PR "Narrowings"): **11.10-PDF** (the table in the downloaded PDF) waits for batch A's `GET /api/revisions/{id}/pdf` (Story 11.1); the PDF is LibreOffice's conversion of the same DOCX, so the table is already in it; owner batch A or the epic QA. Open questions for Matheus/Bruno: the P4 hint word ("próxima intervenção", authored), the undo toast text (authored), whether "pontos sem prazo" should count points without priority instead (EXPERIENCE says priority, the story says prazo; the story wins here), whether the table prints when no row has any action-plan value (the story reading: always), and the Points surface "Como imprime na seção 8" preview (drawn in `72-pontos.html:290-318`, named by neither story).

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:unit -- packages/domain/src/points packages/domain/src/print packages/domain/src/relatorio` -- green.
- `docker compose --profile tools run --rm tools pnpm test:api -- docx` -- green.
- `docker compose --profile tools run --rm tools pnpm test:e2e -- e2e/action-plan.spec.ts e2e/points.spec.ts` (and any spec whose "N avisos" count changed) -- green.
- `pnpm verify` under `flock /tmp/fasor-verify.lock` (the orchestrator runs it).

## Auto Run Result

Status: done.

**Summary:** The kernel module `points/priority.ts` holds the labels, `deadlineFromPriority` and the rule for a typed versus a suggested deadline. The pick, clear and replace writes also live there, as does "pontos sem prazo". The action-plan rows sit in `print/section-8.ts` (`resolveActionPlan`, `LayoutSectionPoints.table`), and the DOCX table in `apps/api/.../sections/section-8.ts`. The point editor gains the Priority picker (`priority-picker.tsx`), Prazo (a Suggestion field with "Substituir") and Responsável. The read-mode card shows Prazo, the Prioridade pill and Responsável. The pre-issue list gains the `points_sem_prazo` info row. The goldens are regenerated: the skeleton now carries the section 8 table, and the pre-issue golden reads "7 pontos sem prazo". No contract bump.

**Review findings:** 12 in total.
- 8 patched: VG-owner-recovery (high), VG-month-test, VG-month-readonly/EC4, EC1/EC9 (the pick stays pending until the first text), EC3 (typed Prazo in the draft), EC6 (gone toast), EC7 (only the header row is `cantSplit`).
- 0 deferred.
- 4 rejected: EC2, EC8 and the original EC9 claim are false; EC5 is low and uses the shared `useFieldCommit` pattern.

**Follow-up review:** `true` by the rule, since one high was patched. The risk is the pending-pick path added to `point-writes.ts`/`point-editor.tsx` in the fix loop, which only the orchestrator's e2e run verifies. The playbook allows one fix loop, so this goes to the integrated epic review.

**Verification:**
- `static` and `lint` are green. `docx.test.ts` passes 17/17. The api suite passes 324/324 after the golden update.
- `test:unit` has 26 failures under load average ~30, all timeouts in files this batch does not touch. They pass 166/166 when run sequentially.
- `e2e/action-plan.spec.ts` and `e2e/points.spec.ts` pass 23/23, and `e2e/dictation.spec.ts` passes 6/6.
- The full gate is recorded in the PR.

**Residual risks:**
- 11.10-PDF is deferred to batch A.
- The @p1 390 px spec (11.9-E2E-008) is not part of `verify`; it runs in the wave's `test:e2e:full`.
