---
title: 'Review fixes 2026-10-08: layout and interaction (TTR table, phone dialog, mid-word breaks, Enter in plate fields, lost manufacturer)'
type: 'bugfix'
created: '2026-10-09'
status: 'in-review'
baseline_revision: 'f057f9b8941cee18c412ca5afe38e320e92f2d4d'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/review-fixes-2026-10-08-context.md'
warnings: ['batched', 'multiple-goals', 'oversized']
# batched: the review-fixes round cuts its batches by surface (context row r8lay, wave 4, Matheus 2026-10-08); these items share app.css's translations and the sheet's tables, fields and dialogs.
deferred:
  - summary: >-
      A TAG wider than the phone Sumário row's room runs the page sideways at 390 px (no ellipsis as the rail's F-07 rule gives).
    evidence: |-
      Edge Case Hunter: `.s9-eq-open .block-tag { white-space: nowrap }` and `.s9-eq > .s9-eq-open { min-width: min-content }` (relatorio.css, block r8lay DA-6); before the batch `.sum-s9 .s9-eq-open` (grid, `1fr auto`) already gave an unbreakable TAG its min-content, so mostly pre-existing; TAGs are free text (rename dialog).
    location: >-
      apps/web/src/surfaces/relatorio/relatorio.css (r8lay DA-6 block)
    severity: low
---

<intent-contract>

## Intent

**Problem:** The agent browser pass of the 2026-10-08 review (report section 13: DB-1/DC-1/DG-1, DA-1, DA-8, DB-3/DA-6, DB-7, DB-2, DH-1, DH-3) found field-device defects: the 8-column transformer ratio (TTR) table squeezed to 24-36 px inputs at every tablet width; the phone's "Novo relatório" dialog unable to reach "Criar relatório" at 800 px height or less; the sheet scrolling sideways at 768 px with the rail open; words split mid-token in phone tables and Sumário tree rows; Enter dead in plate and cabine fields; a stray tap under a 29 px input rewriting GΩ to TΩ even on a concluded sheet; a manufacturer typed under "Outro…" never saved; a stored manufacturer missing from Fabricantes hidden in the instrument panel.

**Approach:** CSS in `app.css` (one r8lay block), `ficha.css` and `relatorio.css` that gives tables, dialogs, the Sticky action bar and tree rows real minimum sizes, never splits a word, and uses a table's own horizontal scroller only as UX-DR40's last resort (`tokens.css` and `components.css` stay byte-identical); a DOM Enter run for plate and cabine fields over the kernel's missing-field markers; a kernel guard on the unit tap of a concluded sheet; commit-on-leave in `RegistryPickerField`; the E78-Q4 unregistered-name line in the instrument panel.

## Boundaries & Constraints

**Always:**
- `tokens.css`/`components.css` byte-identical (`styles.test.ts`). New rules go in ONE commented block `/* Review fixes 2026-10-08 (batch r8lay): … */` at the end of `app.css`, or in `ficha.css`/`relatorio.css`; each names its finding and the mock rule it mirrors, or says `authored`. The r8emit and r8cap blocks of `app.css` and the toast clearance rule (`--toast-clearance`, `data-toast-up`, `data-toast-room`, `scroll-padding-bottom`) stay as they are.
- Rules and verdicts in `packages/domain` (AD-1/AD-13); `apps/web` renders them. New pt-BR copy in the three homes of AGENTS.md; text not from a mock marked `// authored:`.
- Tests in the project's style; mechanism fixes (DB-2 guard, DB-7 focus move, DH-1 commit-on-leave) ship a mutation run (revert the fix, show the covering test red, restore) reported in the final report.
- One new e2e spec `e2e/review-layout-interaction-2026-10-08.spec.ts` (serial: add it to `SERIAL_SPECS` in `e2e/support/groups.ts` with its reason, as `review-layout-copy-3.spec.ts`), unique ids `R8LAY-E2E-0nn`, `@p0` for the main ACs asserting committed state (outbox/store) where data is written, `@p1` for the rest. No `.only`.
- Geometry is measured against what the browser draws (`document.documentElement.clientWidth`, `horizontalOverflow` of `e2e/support/merged-fixtures.ts`), at 390, 768 and 1280 px (plus 1024 for the TTR, 390x700 and 360x640 for DA-1).

**Never:**
- Edit `nameplate-section.tsx`, `nameplate-suggestions.tsx`, `checklist-section.tsx`, `packages/domain/src/relatorio/dry-insulation.ts` (r8dry, PR #120) or `conclusion.ts`, `use-ficha-actions.ts`, `conclusao-section.tsx` (r8conc, PR #121); `sprint-status.yaml`, `epics.md`; `CONTRACT_VERSION`/`MIN_CONTRACT_VERSION`; new op kinds.
- Decide product questions the documents leave open (record them in `deferred-work.md` instead): the TTR as cards at tablet widths or an auto-collapsing rail; hiding the drag handle or Position box on phone; abbreviating or dropping Linha/Terra/Guard columns; a "Desfazer" for a unit change on an open sheet; moving the Combobox popover off the next field.
- Change the readings' continuous run, the M · G · T chips, the tap-cycle on an open sheet, the TTR cards below 768 px, or the Export dialog (it already scrolls, `export.css:35`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| DH-1 unmatched text left | "Megabras" typed under "Outro…", focus leaves the field (tap on Nome, Tab, Escape then tap elsewhere) | one registry create `manufacturer` "Megabras" and the field's value "Megabras" (instrument or nameplate), as "Criar" writes them | no second create when "Criar" was tapped before leaving, nor on a later blur while the created row has not landed |
| DH-1 matching text left | "celtta" typed, Fabricantes holds "Celtta" | "Celtta" selected (its value written once), no new word | — |
| DH-1 empty or reverted text | text cleared, or Escape reverting to the selected entry | today's behaviour | — |
| DH-1 unreadable voltage class | "abc" in Classe de tensão, leave | nothing created, the text stays (today) | known open, listed |
| DH-3 stored name not in registry | instrument manufacturer "Hi-Tech", Fabricantes without it | the panel shows "Hi-Tech" and "Criar Hi-Tech?" under Fabricante at every width | the tap writes the registry word only; the instrument already holds the name |
| DB-2 concluded, filled, input not focused, pointer tap on the unit | `sheetState(block) === 'concluida'`, cell `measured` | nothing written; the cell's input takes the focus | — |
| DB-2 concluded, input focused, tap on the unit | same sheet | cycles and commits as today | — |
| DB-2 keyboard activation (Enter/Space on the focused unit button), empty cell, or an open sheet | — | cycles as today | — |
| DB-7 Enter in a plate/cabine text, number or date-text field | valid value | commits, then the focus moves to the next visible `[data-missing-field]` after this field in document order (its first focusable, text selected); none left: `#ficha-primary` | invalid number or date: commits nothing, helper shows, the focus stays; IME composing or Shift+Enter: commits only (no move) |

</intent-contract>

## Code Map

- `apps/web/src/styles/components.css` (read-only) -- 190-205 Sticky action bar (`.btn` nowrap 173-178, `flex: 1`); 483-503 `.measurement-field` (`.mf-value { flex: 1; min-width: 0 }`), `.unit-cycle`; 518-532 `.measurement-table`, `.is-wide` fixed layout with widths for columns 1-6 only (8-column transformer TTR gets nothing for 7-8), `td { overflow-wrap: anywhere }`, `.ficha-mt { overflow-x: auto }` (scrolls the title row with the table); 664-667 `.dialog-scrim` centred, `.form-dialog` no max-height; 1015-1019 `.sum-s9` rows.
- `apps/web/src/styles/app.css` -- 124-127 phone bar wrap; 241-246 phone `.s9-eq-open` wrap, `.s9-eq-name { flex: 1 1 60% }`; 362-364 and 408-410 bar from 1024 px (nothing covers 768-1023); 522-528 scrim fixed, `.dialog-modal { display: contents }`; 727-737 E9-Q4 phone wrap of `.suggestion-field` cells -- it also wraps the CONFIRMED reading cell, which puts the input alone on a 29 px line over the unit button (DB-2's trigger); 798-810 F-07 tree rules (pattern for whole words); 848-873 r8emit and r8cap blocks (keep).
- `apps/web/src/surfaces/ficha/ficha.css` -- 113 TTR cell padding; 124-127 the 300 px value-cell minimum from 768 px, unscoped (must become `:not(.ficha-ttr)`); 128-142 phone non-TTR tables with `overflow-wrap: anywhere` (DB-3); 145-158 TTR cards below 768 px; 168-169 `.calc-mark`.
- `apps/web/src/surfaces/ficha/ensaios-section.tsx` -- 293-362 `MeasurementTable`: `ficha-ttr is-wide` on every ratio table (TP/TC 6 columns, transformer 8), every derived column drawn `td.cell-calc` at value size (the mock `60-ficha.html:729-732` draws Condição as `td.cell-dim`, header without `col-value`), cards 363-391; 130-160 `useRunEnterKeyHints`; 85-105 `focusCell`/`onRun`.
- `packages/domain/src/seed/v1.ts:442-494` -- the three ratio tables; `packages/domain/src/relatorio/reading-evaluation.ts:189` condição "SATISFATÓRIO".
- `apps/web/src/surfaces/ficha/measurement-field.tsx` -- 131-137 `chooseUnit` (commits at once), 156-199 cell markup, 166-179 the unit-cycle button with `keepFocus` on pointer/mouse down; `number.focused`.
- `apps/web/src/surfaces/ficha/sheet-read-only.tsx` -- the context pattern (`SheetReadOnlyContext`) to copy for the unit guard; `packages/domain` exports `sheetState` (`'concluida'`), used in `parecer.ts:122`.
- `packages/domain/src/relatorio/reading-run.ts` -- home for the new pure guard (beside `runEnterKeyHint`), exported through the package index.
- `apps/web/src/surfaces/ficha/ficha-fields.tsx` -- 49-55 `firstFocusable`; 185-215 `TextField` (Enter only commits); 221-270 `NumberField` (`useNumberInput` `onEnter`, which `number-input.tsx:204-210` calls even after an invalid settle; check `number.parsed !== 'invalid'`); 296-380 `DateTextField` (Enter `submit`); 480-545 `WordField` and its E78-Q4 `.word-unregistered` line with `criarText`.
- `apps/web/src/surfaces/ficha/ficha-surface.tsx:51` `PRIMARY_ID = 'ficha-primary'`; `use-ficha-steps.ts:72` the visible-marker lookup "Concluir ficha" jumps with; `cabine-block.tsx:105-125` SE and env `SheetField`s inside `.nameplate-grid`; checklist rows carry the marker on `li.checklist-row`.
- `apps/web/src/components/registry-picker-field.tsx` -- 119-133 the Combobox, `onCreate` only through the "Criar" option; `combobox.tsx:95-125` `allowsCustomValue` keeps unmatched text after blur and may report a null selection; `registry-picker-field.test.tsx` exists.
- `apps/web/src/surfaces/registries/instrument-panel.tsx` -- 136-142 `createManufacturer` (registry create + field in one commit); 274-285 the field (value from `wordRowByName`, `initialText` the stored name). `registries.css` is not this batch's: the panel's `.word-unregistered` rule goes in `app.css` (declarations of `ficha.css:181-182`).
- `apps/web/src/components/{dialog-shell.tsx,form-dialog.tsx,confirm-dialog.tsx}`; `export.css:35` (the max-height precedent); `templates.css:103,125` (`.rich-dialog`, `.defaults-dialog` keep their own rules); `surfaces/project/new-relatorio-dialog.tsx`, `surfaces/home/new-project-dialog.tsx:146-153` (DA-1's dialogs).
- `apps/web/src/surfaces/relatorio/relatorio-tree.tsx:663-705` `SumarioEquipment` (handle, Position box, `.s9-eq-open` with `.block-tag`, `.s9-eq-name`, `.s9-state` glyph + word, Overflow); `relatorio.css:94-118` the s9 row (`.s9-eq-name { min-width: 0 }`, `.s9-state` without `nowrap`).
- `e2e/review-layout-copy-3.spec.ts:247-281` `railRows` (the word-split check by `Range.getClientRects` per word: reuse it as a shared helper); `e2e/support/relatorio-seed.ts` (`newRelatorioDrafts`, `officeDraft`, `pushDrafts`, `instrumentDraft`); `e2e/support/relatorio-flow.ts` (`createProjectFromHome`, `createRelatorio`); `e2e/ficha.spec.ts:600-615` asserts the TP header and `td.cell-calc`; `e2e/support/outbox.ts`.

## Tasks & Acceptance

**Execution:**
- `apps/web/src/surfaces/ficha/ensaios-section.tsx` -- wrap each `<table>` in an authored scroller element (e.g. `div.mt-scroll`) so only the table scrolls sideways, never `.ficha-mt` or its title row; draw the Condição derived column as the mock's `td.cell-dim` (header without `col-value`), keeping its "calc." mark and spoken "calculado" -- DC-1, DB-3.
- `apps/web/src/surfaces/ficha/ficha.css` -- scope the 300 px minimum to `:not(.ficha-ttr)`; replace the phone tables' `overflow-wrap: anywhere` with whole-word wrapping (a cell is never narrower than its longest word, units `nowrap`); TTR from 768 px: `table-layout: auto` with the six mock widths reset, inputs with a minimum that shows "34,512" whole and at least 48 px tall, header and derived words never split, "calc." whole -- DC-1, DB-3.
- `apps/web/src/styles/app.css` (r8lay block) -- the translations those need outside the sheet route; scope the E9-Q4 phone wrap (727-737) so a confirmed reading cell keeps its input and unit on one line, and give a table value input at least 48 px of height wherever it wraps; `.form-dialog` and `.confirm-dialog` `max-height` inside the scrim's padding with `overflow-y: auto` (the scrim stays; `.rich-dialog`/`.defaults-dialog`/`.export-dialog` keep their rules); 768-1023.98 px `.sticky-action-bar .bar-buttons { flex-wrap: wrap }` so no button runs past the column; the instrument panel's `.word-unregistered` line -- DA-1, DA-8, DB-2, DH-3.
- `apps/web/src/surfaces/relatorio/relatorio.css` (or the app.css block) -- phone s9 rows: `.block-tag` and `.s9-state` `nowrap` (glyph and word together), `.s9-eq-name` never narrower than its longest word so items wrap to a new line instead of splitting a word -- DA-6.
- `packages/domain/src/relatorio/reading-run.ts` + index export + unit test -- a pure guard, e.g. `unitTapNeedsEdit(block, cell): boolean`, true when `sheetState(block) === 'concluida'` and the cell holds a measured value -- DB-2.
- `apps/web/src/surfaces/ficha/measurement-field.tsx` (+ a context provided by `ensaios-section.tsx`) -- when the guard is true and the press is a pointer press that began while the input was not focused, the unit button focuses the input and writes nothing; otherwise today's cycle -- DB-2.
- `apps/web/src/surfaces/ficha/ficha-fields.tsx` -- `TextField`, `NumberField`, `DateTextField`: `enterKeyHint="next"`; Enter (not Shift, not composing, value valid) commits as today, then moves the focus as the matrix says; export the move as one helper with a unit test in `ficha-fields.test.tsx` -- DB-7.
- `apps/web/src/components/registry-picker-field.tsx` + `registry-picker-field.test.tsx` -- when the focus leaves the field (not into its own popover) with typed text: select the entry it matches by `matchKey`, else create it through `onCreate` exactly as the "Criar" option does, at most once per text -- DH-1.
- `apps/web/src/surfaces/registries/instrument-panel.tsx` (+ `instrument-panel.test.tsx`) -- a stored manufacturer with no registry row shows the E78-Q4 line (name + `criarText(name)` button writing the registry row only); copy from `criarText`, no new string -- DH-3.
- `e2e/review-layout-interaction-2026-10-08.spec.ts`, `e2e/support/groups.ts` (and `e2e/ficha.spec.ts` only if its TTR assertions name the changed class) -- the ACs below.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- one entry per open question in Boundaries "Never" (owner: coordinator, decision Matheus/Bruno), the TTR's scroll at 657 px boxes, the Form dialog still not full-screen on phone (DESIGN.md › Form dialog, UX-DR60: it now scrolls inside the scrim), DB-7's always-"next" hint and DH-1's invalid voltage class.

**Acceptance Criteria:**
- AC1 (DC-1) Given a transformer sheet's TTR with 13,8 kV, 380 V, 34,512, 39,48 and 34,51 typed, when it is drawn at 768x1024 (rail collapsed), 1024x768 (rail open) and 1280x800, then every TTR input is at least 48 px tall and 72 px wide and shows its whole value (`scrollWidth <= clientWidth`), no word of a header or body cell is split across lines ("calc.", "SATISFATÓRIO", "secundário" whole), the document has no horizontal overflow, and after focusing the last capture input `.ficha-mt.scrollLeft` is 0, its `.mt-title-row` lies inside the viewport and the input lies inside its table scroller's visible box; at 1280 the table scroller does not scroll at all.
- AC2 (DC-1) Given a TP's 6-column ratio table at the same three sizes, then the same invariants hold, and at 390 both ratio tables are their cards with inputs at least 48 px tall and no horizontal overflow.
- AC3 (DB-3) Given at 390x844 a transformer's isolation table, a para-raio's isolation table and a seccionadora's contact tables (one cell typed, one filled by a confirmed reading), then no word or unit in them splits, every value input is at least 48 px tall and shows its value, its unit control shares the input's line (centres within 4 px), the document has no horizontal overflow and the title row stays put; a table wider than its box scrolls only inside its scroller; at 768 and 1280 the same tables keep no overflow.
- AC4 (DB-2) Given a concluded sheet whose isolation cell holds 1,45 GΩ, at 390, when the unit control is tapped with the input not focused, then the outbox gains no op for that cell and the input is focused; tapped again, the cell is stored in TΩ; on an open sheet one tap still cycles at once; and `elementFromPoint` 8 px below any table value input is never a unit control.
- AC5 (DB-7) Given a transformer sheet's empty plate at 1280 and 390, when the engineer types into each plate field and presses Enter, then every Enter writes its field's op (outbox) and lands the focus on the next empty plate field, inputs carry `enterkeyhint="next"`, Enter on the last one lands on the sheet's next missing field ("Concluir ficha"'s jump target), an invalid number keeps the focus with its helper; on a cabine's first sheet Enter runs Tensão primária to Tensão secundária to the next field.
- AC6 (DH-1) Given Cadastros at 768 with Fabricantes "Celtta", when on an instrument without manufacturer "Outro…" is tapped, "Megabras" typed and Nome tapped, then the outbox holds one registry create "Megabras" and the instrument's manufacturer "Megabras", the closed row reads "Megabras · série …" and the reopened panel shows the "Megabras" chip selected; "celtta" left selects Celtta with no new word; Escape then a tap elsewhere behaves as leaving; on a sheet's Fabricante a typed name left is written with its word.
- AC7 (DH-3) Given an instrument with manufacturer "Hi-Tech" absent from Fabricantes, when its panel opens at 390, 768 and 1280, then "Hi-Tech" and "Criar Hi-Tech?" show under Fabricante, the name's computed colour equals `--ink-primary` in light and dark themes; the tap writes the registry word only and the chip row then shows "Hi-Tech" selected.
- AC8 (DA-1) Given 390x700 and 360x640, when "Novo relatório" (tipo e datas) and "Novo projeto" are open, then each dialog's box lies inside the viewport and scrolls inside itself, "Criar relatório" scrolled into view creates the relatório (navigation and its stored row asserted), and every open `.form-dialog`/`.confirm-dialog` computes `overflow-y: auto` with a max-height inside the viewport; at 768x1024 and 1280x800 the dialog stays centred with no scroll needed.
- AC9 (DA-8) Given a sheet at 768x1024 with the rail opened from its strip (and at 1024x768 rail open), then the document has no horizontal overflow and every Sticky action bar button lies inside the viewport with its whole label.
- AC10 (DA-6) Given the Sumário at 390x844 with the tree open, then in every equipment row no word of the TAG, type or state splits, each state's glyph and word share one line, and the document has no horizontal overflow; the F-07 checks of `review-layout-copy-3.spec.ts` stay green.
- AC11 Given the condição cell, its computed colour is `--ink-secondary` in light and dark themes.

## Spec Change Log

## Review Triage Log

### 2026-10-09 — Review pass
- layers: Edge Case Hunter and Verification Gap Reviewer (opus); Blind Hunter and Intent Alignment skipped (token economy; the integrated epic review covers them); two orchestrator rows from reading the diff.
- verdicts: 16 findings — high 0, medium 9, low 6, false 0, maybe-false 1
- findings:
  - `[medium]` `[patch]` VG: the plate/cabine Enter run's "leave a completed step expanded" guard (`use-ficha-steps.ts` `!isEnterRunMoving()`) has no observing test (R8LAY-E2E-003/004 never complete the plate; 12.1-E2E-011 tests Tab) — patch: a new e2e completing the plate with Enter and asserting `#ficha-step-placa` stays expanded.
  - `[low]` `[patch]` VG: the IME `isComposing` branches and the date field's Shift+Enter have no tests — patch: unit cases in the R8LAY DB-7 describe.
  - `[medium]` `[patch]` VG other: `DateTextField` Enter commits, the run's focus move blurs inside the handler and `onBlur` submits the same date again (`shown.current` not yet echoed; `immediate` does not dedupe), two identical ops per Enter — patch: the blur after an Enter commit writes nothing; test asserts one call. (Same root cause as the ECH row below.)
  - `[medium]` `[patch]` VG other: `commitLeft` treats the stored `initialText` as typed, so focus-and-leave on an unregistered stored manufacturer or voltage class creates a registry word and rewrites the value, bypassing E78-Q4/DH-3's explicit "Criar" — patch: commit only text changed since the field took the focus; unit tests.
  - `[medium]` `[patch]` ECH: same as the row above (Tab through Fabricante at 1280 creates the word) — grouped, same patch.
  - `[medium]` `[patch]` ECH: Combobox focused then "Criar Hi-Tech?" tapped creates the word twice (blur create, then the click) — grouped with the `initialText` root cause; patch plus a panel test of one create.
  - `[low]` `[reject]` ECH: `registerManufacturer` early return or rejected write leaves the line hidden with no toast — `commitField`/`createManufacturer` of the same panel have no catch either (pre-existing pattern); `db`/`opBase` are null only signed out; adding error branches is more than a direct correction for an unlikely case.
  - `[medium]` `[patch]` ECH: `DateTextField` double op (same as the VG row) — grouped, same patch.
  - `[medium]` `[patch]` ECH: the run lands on a checklist row's "C" segment (a native button); a held Enter's auto-repeat clicks it and commits an unchosen answer — patch: swallow repeated Enter keydowns on a non-text landing target until keyup; unit test.
  - `[low]` `[defer]` ECH: a TAG wider than the phone Sumário row (now `nowrap`, row `min-content`) runs the page sideways at 390 — largely pre-existing (`.sum-s9 .s9-eq-open` grid gave the TAG its min-content before); the rail's F-07 ellipsis has no phone s9 counterpart; deferred.
  - `[low]` `[reject]` ECH: a TTR value longer than six characters clips in the six-digit input — ratio and voltage values are at most seven characters ("120,135", typed in R8LAY-E2E-009 and asserted whole); `field-sizing` is not available on every target browser.
  - `[low]` `[reject]` ECH: R8LAY-E2E-002 would throw a TypeError, not an assertion, if the seed had fewer than two seccionadoras — the standard template always has them (SEC-ENEL-1/2); cosmetic.
  - `[medium]` `[patch]` ECH claim: AC1/AC2 "at 1280 the table scroller does not scroll" not met (transformer minimum 1223 px, TP 945 px, against 864 px) — grouped with the orchestrator row below.
  - `[medium]` `[patch]` Orchestrator: the 1223 px minimum comes from `.measurement-field { flex-wrap: nowrap }` in ratio cells, which overrides the mock's own `.is-wide td.cell-value .measurement-field { flex-wrap: wrap }` and keeps input, static unit and the 48 px Overflow on one line — patch: drop the nowrap so the trailing parts wrap under the six-digit 48 px input, assert no scroll at 1280 in R8LAY-E2E-001/009 (or report the measured minimum), update the two deferred-work entries.
  - `[maybe-false]` `[reject]` ECH claim (low confidence): the E9-Q4 wrap left on confirmed cells may wrap the unit off the input's line for a wider value or narrower table — AC3/AC4 assert the shared line and the 8 px hit test on the real phone tables; settling it needs a value or table the seed does not draw; if true it would be low (the DB-2 guard and 48 px input still hold).
  - `[low]` `[patch]` Orchestrator: the DB-7 doc comment of `focusNextMissingField` sits above `let enterRunMoving` — patch: move it.

### 2026-10-09 — Re-check of the loop's patches (process lesson P1)
- layer: one blocking opus reviewer over the loop diff only (cc66ba3).
- verdicts: 2 findings — high 0, medium 0, low 2, false 0, maybe-false 0
- findings:
  - `[low]` `[patch]` DateTextField: `submitted` was checked on every submit, so after a write the store refused (AD-8) a Shift+Enter (no blur) no longer re-committed it — patch (orchestrator): the skip applies only to the blur's submit (`submit(true)`); Enter and Shift+Enter re-commit as before.
  - `[low]` `[patch]` deferred-work.md: the resolved TTR entry's evidence still listed the pre-fix 1223/945 px column widths as current — patch (orchestrator): marked as the measurement before the fix.
- every other loop patch re-checked as fixing its finding with no new defect (commit-on-leave, the held-Enter swallow, the TTR wrap and `.mt-word`, R8LAY-E2E-014, the IME tests, the doc comment).

## Design Notes

At 657 px (768 portrait with the 48 px strip, 1024 with the 320 px rail) the 8-column TTR cannot hold five 48 px-tall inputs of five digits at the value size plus TAP, Calculado and Condição: its whole-word minimum is about 800 px, so it scrolls inside its own box there (UX-DR40 "horizontal scroll as a last resort") with the title row and page still; from about 880 px (1280 with the rail) it fits. Cards at tablet widths or an auto-collapsing rail would contradict UX-DR40 ("real table at every width") and UX-DR74 ("tables in full in landscape") and are an open question, not this batch's choice.

## Verification

**Commands** (worktree root; `podman compose`, never docker; tools as root; the batch stack `fasor-r8lay` up with `podman compose up -d` before the api and e2e stages; never build images):
- `podman compose --profile tools run --rm --user root tools pnpm lint` -- expected: exit 0.
- `podman compose --profile tools run --rm --user root tools pnpm static` -- expected: exit 0.
- `podman compose --profile tools run --rm --user root tools pnpm test:unit` -- expected: exit 0 (includes `styles.test.ts` byte-identity and `scripts/e2e.test.ts` duplicate-id and serial checks).
- `podman compose --profile tools run --rm --user root tools pnpm test:api` -- expected: exit 0.
- Under the host lock only (`nohup sh -c "lockf -t 20000 /tmp/fasor-verify.lock sh -c '...'; echo EXIT=\$?" > /tmp/gate-r8lay-<stage>.log 2>&1 &`, polled): `pnpm exec tsx scripts/e2e.ts e2e/review-layout-interaction-2026-10-08.spec.ts <touched specs> --project desktop-chrome --project durability-desktop-chrome` -- expected: every test passed.
