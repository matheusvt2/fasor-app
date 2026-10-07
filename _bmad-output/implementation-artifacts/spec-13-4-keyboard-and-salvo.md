---
title: 'Story 13.4: the keyboard stops fighting the field, and the sheet says Salvo'
type: 'feature'
created: '2026-10-07'
status: 'in-progress'
baseline_revision: 'b1c2c6b1a411a41d783bfa7ef50834cb94c68380'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-13-context.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_why: 'Batch B of Epic 13 is one story (13.4) whose four findings INP-1 to INP-4 all live in the sheet field components and header that this batch owns.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** On site the mobile keyboard autocorrects serials and TAGs (INP-1), the readings' Enter run has no `enterKeyHint` and the iOS decimal pad has no Return key (INP-2), an empty Data de fabricação accepts only a full day (plates say "08/2024" or "2012", INP-3), and the sheet's "Salvo" is screen-reader-only, so a typed value is doubted (INP-4). Findings with file:line: `_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/review-field-ux-2026-10-06.md` lines 26-29; story text `epics.md` § Story 13.4 (line ~2817).

**Approach:** Keyboard attributes on the sheet's text inputs; a kernel-computed `next`/`done` hint on every run cell; the empty sheet date field becomes the mock's text `.input` that accepts a full date, a month-year or a year (kernel parse), plus an authored "Hoje" chip on the full-date service-period fields; and a visible, quiet "Salvo às HH:MM" line in the sheet header (kernel text, offline variant) that replaces the visually hidden region.

## Boundaries & Constraints

**Always:**
- Ownership AD-1/AD-13: the saved-state wording, the time formatting, the date parse and the run hint are `packages/domain` functions; `apps/web` only renders them. pt-BR homes per AGENTS.md: derived text in the kernel; "Hoje" (`// authored:`) and the placeholder (mock verbatim) in `apps/web/src/copy/pt-br.ts` or `ui.ts` (chip chrome).
- Tap budget unchanged: `e2e/tap-budget.spec.ts` and `e2e/tap-budget-signal.spec.ts` run unedited and green; journey specs keep their tap and keystroke counts (a locator may change, a count never).
- INP-4 builds on F-02 (`spec-review-fixes-field-defects-2.md`): blur still commits (`useNumberInput`, `useFieldCommit`, `useFlushOnUnmount`); nothing in that path is replaced.
- The header never grows when the first save lands (E6-Q1 comment in `ficha-header.tsx:56-60`): the saved line keeps its height from the first render.
- Times shown in America/Sao_Paulo (`DISPLAY_TIME_ZONE`), read from `apps/web/src/clock.ts` `now()`.
- No emoji; English code and comments; mock class names only (`.sheet-meta`, `.input`, `.chip`, `.chip-row`).

**Never:**
- Do not edit files owned by other batches: `camera-view.tsx`, `use-photo-capture.ts`, `photo-viewer.tsx`, `plate-photo.tsx`, `read-display.tsx`, `sync/engine.ts`.
- No new op family, no contract version bump, no change to `parseCalendarDate` (service dates and `dateValueSchema` stay `YYYY-MM[-DD]`), no change to `applyOp` or the commit path.
- No "Hoje" chip on the sheet's fabrication dates or on "Próxima intervenção" (a future date); no new Tab stop inside the sheet's plate.
- Do not decide product questions beyond this spec; list them as open questions.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| INP-1 | nameplate Nº série, TAG, Tipo, Identificação, TAP atual (every sheet `TextField`, and the date text input) | `autocapitalize="off"`, `autocorrect="off"`, `spellcheck="false"` on the `<input>` | - |
| INP-2 next | a run cell whose `runTarget(..., 'next')` is another cell | `enterkeyhint="next"` | - |
| INP-2 done | the cell whose `runTarget(..., 'next')` is `'end'` (Enter goes to `#ficha-primary`) | `enterkeyhint="done"`; recomputed as cells fill | - |
| INP-2 tap | type `1500` in a reading, tap another cell (no Enter) | the cell op is in the outbox; reload shows it | invalid text stays typed, nothing written |
| INP-3 month | empty Data de fabricação, type `08/2024` or `082024`, blur or Enter | stored `2024-08`; renders `08/2024` (as stored month-only values render today) | - |
| INP-3 year | type `2024` | stored `2024`; renders `2024` | - |
| INP-3 day | type `15/03/2019` or `15032019` | stored `2019-03-15`; after the focus leaves, the field is the existing picker | - |
| INP-3 range | `1899`, `13/2024`, `abc`, a year above next year | nothing written, invalid helper `copy.ficha.nameplate.invalidDate` | F-22 rule (`plateDateAccepted`) also checks a bare year |
| INP-3 Hoje | empty service start or end (setup Etapa 1, "Novo relatório" dialog), tap "Hoje" | the field holds today's America/Sao_Paulo date and commits it like a typed one | chip absent once a value exists |
| INP-4 online | a field op lands in the outbox, server reachable | header line "Salvo às 14:32" | - |
| INP-4 offline | same while `useServerReachable()` is false | "Salvo neste aparelho às 14:32" | - |
| INP-4 before | no save yet in this sheet session | the line is present, empty (non-breaking space), same height | - |

</intent-contract>

## Code Map

- `apps/web/src/surfaces/ficha/ficha-fields.tsx` -- `TextField` :179-213 (INP-1 attrs); `DateValueField` :270-276 routes empty/full/other; `DateTextField` :283-335 (text form, `parseFieldInput` + `plateDateAccepted`); `DatePickerField` :337-386 (segmented picker, stays for a stored full date); `useFlushOnUnmount` :117-128.
- `apps/web/src/components/number-input.tsx` -- `useNumberInput`; blur and Enter commit (F-02 basis); `inputProps` :178-211. Read-only for this story unless a hint prop is needed.
- `apps/web/src/surfaces/ficha/ensaios-section.tsx` :82-101 -- `focusCell`, `onRun` with kernel `runTarget`; the one place that knows every run cell (`[data-cell-input]` inside `host`).
- `apps/web/src/surfaces/ficha/measurement-field.tsx` -- `MeasurementField` input :160-170 and `DictatedMeasurementField` input :327-334 carry `data-cell-input`; `read-display.tsx:394-402` (batch C, DO NOT EDIT) also does.
- `packages/domain/src/relatorio/reading-run.ts:40` -- `runTarget(evaluations, from, direction)`; add the hint function here.
- `packages/domain/src/format/datetime.ts` -- `formatTimeOfDay` :66, `parseCalendarDate` :120 (unchanged), `dateFieldText` :145 (renders `2012` as is), `calendarDateOfInstant` (today's date, used by `new-relatorio-dialog.tsx:71`).
- `packages/domain/src/checks/plate-date.ts:18` -- `plateDateAccepted` (bare year currently unchecked).
- `packages/domain/src/relatorio/suggestion-group.ts:147` -- `parseFieldInput`; leave its `date` case alone (OCR path), use the new parse in the sheet text form.
- `apps/web/src/surfaces/ficha/use-ficha-actions.ts:35-58` -- `useSavedStatus` (3 s throttle, 1.5 s clear); `use-ficha-data.ts:51,79-82` calls `saved()` after `editor.commit`/`edit`.
- `apps/web/src/surfaces/ficha/ficha-surface.tsx:157-169,247-249` -- `FichaHeader` call and the visually hidden `ficha-saved` region to remove.
- `apps/web/src/surfaces/ficha/ficha-header.tsx` -- header lines; `.sheet-meta` style `components.css:390`.
- `apps/web/src/state/sync.tsx:473` -- `useServerReachable()` (F-13 meaning of online; false outside `SyncProvider`).
- `apps/web/src/components/date-field.tsx` -- shared `DateField`; `components/chip.tsx` `Chip` (onPress) and `.chip-row`.
- `apps/web/src/surfaces/relatorio/setup/etapa1-capa.tsx:88-91`, `apps/web/src/surfaces/project/new-relatorio-dialog.tsx:175-176` -- the service-period `DateField`s that get the chip.
- `apps/web/src/surfaces/relatorio/tag-dialogs.tsx:50-51` -- existing TAG input attrs (reference).
- Mock: `ux-fasor-2026-09-18/mockups/prototype/screens/60-ficha.html:344,372` -- the empty "Data de fabricação" is an `.input` with placeholder "Ex: 03/2012".
- Tests touched: `e2e/ficha.spec.ts:138` (`toHaveText('Salvo')`) and `:1408` (E5-Q18f throttle spec); `e2e/journey-taps.spec.ts:212-214`, `e2e/journeys-12-3-12-4.spec.ts:163-165` tap the empty date's day `spinbutton` and type `01012020`; `e2e/ficha.spec.ts:905` uses the year spinbutton of a stored full date (stays valid); `e2e/nameplate-values.spec.ts:58-100` (month-only and `2012` text form).

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/format/datetime.ts` -- add `parsePlateDateText(text): string | null`: `dd/mm/aaaa`, `mm/aaaa`, `aaaa`, ISO, and digit runs of 8 (`ddmmaaaa`), 6 (`mmaaaa`) and 4 (`aaaa`); returns `YYYY-MM-DD`, `YYYY-MM` or `YYYY`; null otherwise. Add `savedStateText(atIso, reachable): string` ("Salvo às HH:MM" / "Salvo neste aparelho às HH:MM", via `formatTimeOfDay`; '' for an unparseable instant). Export both from the package index.
- `packages/domain/src/checks/plate-date.ts` -- `plateDateAccepted` range-checks a bare `YYYY` too.
- `packages/domain/src/relatorio/reading-run.ts` -- add `runEnterKeyHint(evaluations, address): 'next' | 'done'` (`'done'` when `runTarget(..., 'next')` is `'end'` or null).
- Kernel unit tests (next to the existing ones) -- every I/O row above for the parse, the range, the hint and the saved text (online, offline, 23:59/00:00 in Sao Paulo, unparseable).
- `apps/web/src/surfaces/ficha/ficha-fields.tsx` -- INP-1 attrs on `TextField` and the date text input; `DateValueField` routes an empty value to the text form (placeholder "Ex: 03/2012" from the mock, `inputMode="numeric"`, `autoComplete="off"`), a stored full date to the picker, and keeps the text form mounted while it holds the focus (the switch to the picker happens after blur, so Enter never drops the focus); the text form parses with `parsePlateDateText`, keeps F-22, and flushes on unmount like the picker (`flushOnUnmount`).
- `apps/web/src/surfaces/ficha/ensaios-section.tsx` (and `measurement-field.tsx` if cleaner) -- every `[data-cell-input]` input inside the section carries `enterKeyHint` from `runEnterKeyHint`; one mechanism that also covers `read-display.tsx`'s suggested cell without editing that file (a layout effect over `host` that sets the attribute is acceptable; document why).
- `apps/web/src/components/date-field.tsx` -- optional `today?: () => string` prop: while the value is null, a `.chip-row` with a `Chip` "Hoje" after the `.input`; pressing it calls `onChange(today())` then `onBlur?.()`; the calendar glyph stays in place.
- `etapa1-capa.tsx`, `new-relatorio-dialog.tsx` -- pass `today={() => calendarDateOfInstant(now())}` on the start and end fields only.
- `apps/web/src/copy/ui.ts` or `pt-br.ts` -- "Hoje" (`// authored: Story 13.4 INP-3`), the placeholder (mock verbatim); retire `copy.ficha.saved` if unused.
- `apps/web/src/surfaces/ficha/use-ficha-actions.ts`, `use-ficha-data.ts` -- `useSavedStatus` keeps the instant of the last landed commit (no clearing timer); the text is `savedStateText(at, useServerReachable())`, so it changes at most once per minute or on a reachability change, never per commit.
- `apps/web/src/surfaces/ficha/ficha-header.tsx`, `ficha-surface.tsx` -- the header renders `<p className="sheet-meta" role="status" data-testid="ficha-saved">` (non-breaking space while empty) after the attribution lines; the visually hidden region is removed. Unit test in the existing header/surface tests.
- `e2e/ficha.spec.ts` -- `:138` asserts `/^Salvo às \d{2}:\d{2}$/` visibly; E5-Q18f rewritten to the new rule (a burst of commits changes the live text at most once; pin the clock with `page.clock` if needed). `e2e/journey-taps.spec.ts`, `e2e/journeys-12-3-12-4.spec.ts` -- the date tap targets the text input; `01012020` and the counts unchanged.
- `e2e/keyboard-salvo.spec.ts` (new, `@p0`) -- INP-1 attributes on the five named fields; INP-3 `08/2024`, `2024` and "Hoje" (setup Etapa 1 with an emptied start) asserting the outbox value and the rendered text after reload; INP-4 online and offline (`context.setOffline`) wording visible in the header after an op lands in the outbox; the header height before and after the first save is equal; one 390 px run.
- `e2e/keyboard-salvo.durability.spec.ts` (new, `@p0`) -- INP-2: `enterkeyhint` next/done on the run cells; a reading and a nameplate number typed then left by a tap on another field are in the outbox and survive a reload. Runs on `durability-desktop-chrome`, `durability-android-chrome`, `durability-webkit`.
- `docs/kbs/log.md` -- one line; the KB concept for the sheet header or fields if it describes "Salvo" as hidden.

**Acceptance Criteria:**
- Given the nameplate text fields (Nº série, TAG, Tipo, Identificação, TAP atual), when they render, then `autocapitalize`, `autocorrect` and `spellcheck` are off, matching the TAG dialogs.
- Given every input in the readings' continuous Enter run, when it renders, then it carries `enterkeyhint="next"` and the cell whose Enter lands on the primary carries `"done"`; and on Android Chrome emulation and WebKit a focus change by tap commits the typed value.
- Given an empty Data de fabricação, when `08/2024` or `2024` is typed and the focus leaves, then the outbox holds `2024-08` or `2024` and the field renders `08/2024` or `2024`, also after a reload; given an empty service start or end date, when "Hoje" is tapped, then today's date is stored and shown.
- Given a field op lands in the outbox, when the sheet header renders, then a visible "Salvo às HH:MM" (offline: "Salvo neste aparelho às HH:MM") is shown without blocking or a tap, and the header kept its height.
- Given the change, when `e2e/tap-budget.spec.ts` and `e2e/tap-budget-signal.spec.ts` run unedited, then they pass within `TAP_BUDGET`.

## Spec Change Log

## Review Triage Log

## Design Notes

- Why the text form for an empty date: React Aria's `DateField` has no month or year granularity, and the mock draws the empty fabrication date as a plain `.input` ("Ex: 03/2012"). Digit-only parsing (`01012020`, `082024`, `2024`) keeps the journeys' 8 keystrokes and works on a numeric pad without "/".
- Why a bare year is stored as `YYYY`: sheet cells hold any JSON (K-10, `schemas/entities.ts:35-40`) and E78-Q3 already stores, renders and prints `2012` as is (`dateFieldText`); inventing a month would put a false date on the relatório.
- "Salvo" announcements: the live text changes only when the minute or the reachability changes, which meets EXPERIENCE.md's "at most every few seconds, never per keystroke".

## Open questions (kept as the conservative reading)

- OQ-1: which full-date fields get "Hoje": this batch puts it on the service start and end (setup Etapa 1, "Novo relatório"), not on "Próxima intervenção" nor the sheet's fabrication dates.
- OQ-2: "offline" is `useServerReachable()` false (F-13's meaning), so an unreachable server also reads "Salvo neste aparelho".
- OQ-3: a stored full date keeps the segmented picker; only the empty state became the text form.

## Verification

**Commands:**
- `podman compose --profile tools run --rm --user root tools pnpm test:unit -- <touched test paths>` -- green
- `podman compose --profile tools run --rm --user root tools pnpm exec tsx scripts/e2e.ts e2e/keyboard-salvo.spec.ts e2e/ficha.spec.ts --project desktop-chrome` -- green
- `podman compose --profile tools run --rm --user root tools pnpm exec tsx scripts/e2e.ts e2e/keyboard-salvo.durability.spec.ts --project durability-android-chrome --project durability-webkit` -- green
- `podman compose --profile tools run --rm --user root tools pnpm exec tsx scripts/e2e.ts e2e/tap-budget.spec.ts e2e/tap-budget-signal.spec.ts e2e/journey-taps.spec.ts e2e/journeys-12-3-12-4.spec.ts --project desktop-chrome` -- green, counts unchanged
