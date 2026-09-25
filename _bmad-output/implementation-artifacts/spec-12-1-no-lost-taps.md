---
title: 'Story 12.1: No tap is ever lost, and a section never collapses under the finger'
type: 'bugfix'
created: '2026-09-24'
status: 'done'
baseline_revision: '144a55892a5b86c1ecb7b03ed91589bec03d6910'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-12-context.md'
warnings: ['batched', 'oversized']
batched_reason: 'Story 12.1 runs as its own batch (A) beside Story 12.2; one spec keeps the sheet-surface changes of J-01, J-04 and J-15 together (shared surface, token economy).'
deferred:
  - summary: >-
      The gate does not fail when useHeldWhilePressed is removed from Ficha.
    evidence: |-
      With the hold removed, 12.1-E2E-003 (touch taps) still passes on durability-desktop-chrome; only the Android
      picker blur-commit variant of the diagnosis needed the hold, and it runs in test:e2e:matrix only. A touch
      blur-commit race case in the gate, or a component test of Ficha, would settle it.
    location: >-
      apps/web/src/surfaces/ficha/ficha-surface.tsx (Ficha, useHeldWhilePressed)
    severity: medium
  - summary: >-
      The primary concluding from a stale "Próxima ficha" render has no deterministic test.
    evidence: |-
      12.1-E2E-004 taps after the render has most likely caught up, so the 'next' branch of conclude() is not
      exercised; reverting to `concludable ? conclude : goNext` would likely pass every test.
    location: >-
      apps/web/src/surfaces/ficha/ficha-surface.tsx (primary)
    severity: low
---

<intent-contract>

## Intent

**Problem:** On the equipment sheet the first tap after a field commit or a section change is sometimes acknowledged with nothing (J-01: "Marcar os restantes como Conforme", "Repetir da ficha anterior do mesmo tipo", the instrument picker); a completed section collapses under the finger (J-04); the Sticky action bar keeps a disabled bulk mirror once the checklist is complete (J-15). Source: `_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/review-journey-2026-09-24.md` § 2 and § 6; `source-deltas.md` row D-2 (line 48).

**Approach:** Reproduce red first with a Playwright race test, confirm the mechanism by instrumentation, then fix it once in the shared press path (`apps/web/src/input/`) plus the shared write queue, apply the D-2 collapse rule, and drop the mirror when nothing is left to mark.

## Boundaries & Constraints

**Always:** reproduce red before any fix and keep the red run's output for the PR body; a comment at the fix names the mechanism that swallowed the tap; kernel owns every count/rule (AD-1/AD-13: the out-of-limit count and the "may collapse" predicate live in `packages/domain`); every tap keeps its feedback (toast with "Desfazer" for structural edits, counters, expanded picker); 48/56 px targets unchanged.

**Never:** touch navigation files owned by Story 12.2 running in parallel (`app.tsx`, `state/back-target.tsx`, `surfaces/home/*`, `surfaces/relatorio/setup-surface.tsx`, `surfaces/relatorio/tree-actions.ts`, `surfaces/relatorio/tree-surface.tsx`); per-surface workarounds for the lost tap (debounces, retries, `setTimeout` in a handler); edit `tokens.css`/`components.css`, `epics.md`, `sprint-status.yaml`; build on branch `fix/e2e-gate-stability`; change Stories 12.3/12.4 behavior (instrument suggestion, Digitar, cabine line).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tap after Enter | Last missing nameplate field typed + Enter, tap on a control in another section at 50/200/400 ms | Tap applied exactly once, its feedback shows | none |
| Tap during blur commit | Field focused with a typed value, tap elsewhere (blur commits at pointer down) | Same | a refused write still raises the write toast (`use-field-commit.ts`) |
| Concluir right after the last value | Last missing value typed + Enter, "Concluir ficha" at 50 ms | Concludes on the fresh rows (toast, next sheet); never "incomplete" because of a stale render | incomplete on fresh rows: announce + jump as today |
| Section completed by a tap inside it | NC chip fills the last observation of the checklist | Checklist stays expanded; stepper shows it complete | none |
| Leaving by stepper / Enter run | Tap another stepper step, or Enter moves focus into the next section | The left, complete section collapses | never while it holds an out-of-limit reading |
| Pointer focus into another section | Tap any control in the next section | The previous section does not collapse (D-2 "never in reaction to the tap") | none |
| Checklist complete | `unset === 0` | Sticky bar mirror absent (no disabled button, no "Todos os itens já estão marcados" in the bar); the list-head bulk bar keeps today's behavior | none |
| Long press / scroll | Pointer held > hold cap, or pointercancel (touch scroll) | Held render is released; nothing frozen | none |

</intent-contract>

## Code Map

- `apps/web/src/surfaces/ficha/ficha-surface.tsx` -- `Ficha` builds the snapshot (`useMemo(buildSnapshot)` line 97); `FichaBody` step state lines 227-261: `setCurrent` adds the previous step to `left` on ANY focus (step `div`s' `onFocus` lines 456, 471, 490-494), `collapsed()` line 239. Leading hypothesis for J-01: React Aria's `usePress` focuses the button on pointer down, the focus bubbles to the step `div`, `setCurrent` collapses the complete section above, the target moves before pointer up, and `usePress` cancels the press (pointer up not over target). Matches all four review scripts ("the same tap a second later works"). `api.commit` lines 206-214 bypasses the edit queue and calls `editor.retireUndo()` when it resolves (second candidate: a field commit that resolves after a bulk edit retires that edit's fresh toast). `conclude()` line 281 decides on the render's `progress` (stale right after Enter). Mirror line 499.
- `apps/web/src/surfaces/relatorio/relatorio-editor.ts` -- `edit` (line 87) runs through `useUndoableEdits().write`; `retireUndo`.
- `apps/web/src/state/use-undoable-edits.ts` -- serial `queue`/`enqueue` (lines 56-75): the one write queue to join.
- `apps/web/src/surfaces/ficha/checklist-section.tsx` -- `useChecklistBulk`, `BulkActionBar` (`compact` = mirror), lines 60-125.
- `apps/web/src/surfaces/ficha/section-stepper.tsx` -- `onGo` (stepper tap = leaving).
- `apps/web/src/surfaces/ficha/ensaios-section.tsx` -- Enter run, ends on `primaryId` (line 75).
- `apps/web/src/components/button.tsx`, `chip.tsx`, `tri-state-control.tsx` -- shared React Aria press controls.
- `apps/web/src/input/` -- shared input path (`use-field-commit.ts`, `use-press-and-hold.ts`); new module goes here.
- `packages/domain/src/relatorio/sheet-progress.ts` -- `SheetProgress.steps` (`{ missing }`), `sheetProgress`; `readings.ts` `evaluatedCells(...)[].verdict === 'out'` is the one out-of-limit rule.
- `e2e/ficha.spec.ts` -- helpers to copy (`openRelatorio`, `openEnel`, `rowOfType`, `openSheet`, `field`, `checklistRow`, `stepper`, `instrumentDraft`, `pushDrafts`); line 720 relies on the Ensaios step collapsing.
- `playwright.config.ts` -- durability projects match `/durability\.spec\.ts/` (desktop, Android Chrome emulation, WebKit); `desktop-chrome` ignores them.

## Tasks & Acceptance

**Execution:**
- `e2e/lost-taps.durability.spec.ts` (new) -- FIRST, before any fix: race tests. Per control (bulk "Marcar os restantes como Conforme", "Repetir da ficha anterior do mesmo tipo", an instrument picker trigger, a checklist tri-state segment, an NC observation chip, "Concluir ficha"), for each delay 50/200/400 ms: make the tapped section's predecessor become complete by typing its last missing value (seed the rest by ops) and pressing Enter, wait the delay, tap with a human-like tap (pointer down, ~80 ms hold, pointer up at the element's centre; touch pointer on `hasTouch` projects via CDP where available), assert the state change and its feedback (toast/counter/expanded picker/next sheet). Tag the four review scripts (bulk, Repetir, picker, Concluir) `@p0`, the others `@p1`; keep the file under ~2 min on desktop. Run it red on current code and save the output tail for the PR.
- (diagnosis) -- instrument once (temporary logs or a Playwright trace) to confirm which candidate cancels the press; if it differs from the Code Map hypothesis, fix the real one in the same shared modules and record it in the Spec Change Log.
- `apps/web/src/input/press-hold.ts` (+ `press-hold.test.ts`) -- new shared press guard: one module-level store of "a primary pointer is down" fed by document capture listeners (`pointerdown`; release one task after `pointerup`, on `pointercancel`, or after a cap ~800 ms); `useHeldWhilePressed<T>(value: T): T` returns the value seen at pointer down until release. Header comment names the mechanism (a render between pointer down and pointer up moves or remounts the pressed control and React Aria cancels the press).
- `apps/web/src/surfaces/ficha/ficha-surface.tsx` -- feed `buildSnapshot` with `useHeldWhilePressed(state)`; route `api.commit` through the editor's serial queue (next item) so a later edit reads the typed value and its toast is never retired by an earlier commit; `conclude()` decides completeness on fresh rows inside the edit (keeps announce + `goTo` first missing when the fresh rows are incomplete); D-2: a pointer focus sets `current` (stepper highlight) and removes that step from `left` but never adds the previous one; a stepper tap (`goTo`) or a keyboard focus arriving in another section adds the previous step to `left`; `collapsed(step)` also requires the kernel predicate; mirror only when `bulk.unset > 0`.
- `apps/web/src/surfaces/relatorio/relatorio-editor.ts`, `apps/web/src/state/use-undoable-edits.ts` -- expose a queued commit for typed values (no undo, no toast) on the same serial queue; it retires only an undo toast raised before it began.
- `packages/domain/src/relatorio/sheet-progress.ts` (+ test) -- `steps[step].outOfLimit` (ensaios: cells with verdict `out`; others 0) and `stepMayCollapse(progress, step): boolean` (`missing === 0 && outOfLimit === 0`); export from the package index.
- `e2e/ficha.spec.ts` -- adapt tests that relied on collapse-on-focus (e.g. line 720) to the D-2 rule; add `@p0` "D-2: the NC chip completing the checklist keeps it open; the stepper collapses it; an out-of-limit Ensaios step never collapses" and `@p1` "J-15: complete checklist, no mirror in the Sticky action bar".
- `e2e/journey-taps.spec.ts` (new, `@p1`) -- J1 (SEC-ENEL) and J3 (SEC-ENEL-2) of review § 6 with instrument MG-01 pushed by ops, at 768x1024; a counting `tap()` helper asserts each tap's effect on the first try (a lost tap fails); record the counts with `test.info().annotations` and print them.

**Acceptance Criteria:**
- Given the red run on current code, when the fix lands, then `e2e/lost-taps.durability.spec.ts` passes on `durability-desktop-chrome`, `durability-android-chrome` and `durability-webkit` (`pnpm test:e2e:matrix --grep "lost tap"` or equivalent project list).
- Given the fix, when a reviewer reads it, then the lost-tap fix lives in `apps/web/src/input/press-hold.ts` and the shared write queue, with a comment naming the mechanism, and no surface adds its own delay or retry.
- Given J1 and J3 run by `e2e/journey-taps.spec.ts`, when it passes, then no tap is lost and the report states the counts next to the baseline (J1 24 + 1 lost; J3 9 + 2 lost).

## Spec Change Log

- 2026-09-25, implementation: the press guard releases one task after the click that follows `pointerup` (at most 300 ms after it, then the 800 ms cap), not one task after `pointerup`: on touch the click that makes React Aria fire `onPress` is its own task, measured 100 to 160 ms after `pointerup` on the Android emulation, and a render in between still moved the target.
- 2026-09-25, diagnosis (temporary logs and a variant run, removed): both candidates of the Code Map swallow taps. With the D-2 rule alone (no held render), 11 of the 12 desktop and Android race tests pass and the Android picker at 400 ms still loses its tap: the observation's commit lands between pointer up and the touch click and re-renders the sheet. With the held render alone the collapse still happens (it is focus state, not the snapshot). The second candidate of the Code Map (a typed commit retiring a fresh bulk toast) is closed by the queued commit.
- 2026-09-25, implementation: the picker race uses the blur-commit path of the matrix (the last checklist observation typed, the tap itself blurs and commits it): the checklist's last missing value is a textarea, where Enter types a newline instead of committing.
- 2026-09-25, implementation: an open sheet's primary always concludes on the fresh rows. While the render still says "Próxima ficha" (the last value's commit not drawn yet) and the fresh rows are complete, the tap concludes ("Ficha concluída") instead of skipping the conclusion; with the fresh rows incomplete it moves on as before.
- 2026-09-25, implementation: D-2 "pointer vs keyboard" is read from the latest user input (`isPointerModality()` in `press-hold.ts`, a pointer down or a key), because on touch the focus of a native control arrives after `pointerup`.

## Review Triage Log

### 2026-09-25 — Review pass

Layers run: Edge Case Hunter, Verification Gap Reviewer. Blind Hunter and Intent Alignment skipped (token economy; the integrated Epic 12 review covers them). One orchestrator finding added from its own red re-run.

- verdicts: 18 findings — high 0, medium 5, low 11, false 1, maybe-false 0 (plus 1 deferred)
- findings:
  - `[low]` `[patch]` press-hold cap timer can fire between a slow pointerup and its touch click — clear `capTimer` on pointerup.
  - `[low]` `[patch]` untracked `setTimeout(release, 0)` on click can end a newer hold — tracked and cleared in `clearTimers`.
  - `[low]` `[reject]` `api.commit` calls `saved()` when `db === null` — the sheet renders only inside a session with a database; unreachable in everyday use.
  - `[low]` `[reject]` "Concluir ficha" gives no feedback when the fresh block is concluded/not tested/removed — same null-batch silence as before the change (pre-existing).
  - `[low]` `[reject]` double tap on "Próxima ficha" runs `goNext` twice — pre-existing (the old primary called `goNext` directly too).
  - `[medium]` `[patch]` keyboard activation of the Sticky mirror that marks the last item unmounts the focused button — focus moves to the list-head bulk action.
  - `[medium]` `[patch]` `standing` toast read when the queued commit job starts, not when `commit()` is called — captured at call time (grouped with the claim row below).
  - `[low]` `[patch]` CDP session leak in `e2e/support/taps.ts` on a failed check — detached in `finally`.
  - `[low]` `[patch]` `e2e/journey-taps.spec.ts:229` out-of-range sheet index — length asserted first.
  - `[low]` `[patch]` `e2e/lost-taps.durability.spec.ts:172` too few seccionadora sheets crash — length asserted first.
  - `[false]` `[reject]` claim: release is not "one task after pointerup" as the spec says — the Spec Change Log (2026-09-25, first entry) records the amended release rule.
  - `[low]` `[patch]` claim: "retires only a toast raised before it began" holds only with a two-microtask caller chain — same root cause as the `standing` row.
  - `[low]` `[reject]` a section left by a pointer focus is never collapsed later — matches the AC's literal reading ("collapses only when the user taps another step or the readings run moves focus"); listed as an open question in the PR.
  - `[medium]` `[patch]` gate does not fail if `useHeldWhilePressed` is removed (desktop mouse taps only) — E2E-003 now taps by touch on every Chromium project, but with the hold removed it still passes on durability-desktop-chrome (the D-2 rule alone covers that path); the remaining gap is known open and deferred (one review loop only).
  - `[medium]` `[patch]` orchestrator re-run: E2E-003 passes on the baseline code in all three durability projects (not proven red) — reworked to the review's picker script and proven red then green.
  - `[medium]` `[patch]` keyboard half of D-2 untested — 12.1-E2E-007 extended with a keyboard move into the next section.
  - `[low]` `[patch]` typed commit retiring a standing "Desfazer" untested — @p1 test added.
  - `[low]` `[defer]` the primary concluding from a stale "Próxima ficha" render has no deterministic test — deferred (frontmatter `deferred`).

## Design Notes

Holding the snapshot only while a pointer is down (at most ~800 ms) is invisible to the engineer: press handlers write through `api.edit`, which reads fresh Dexie rows, so correctness never depends on the held render. Keyboard focus counts as "leaving" because the readings' Enter run and Tab are the keyboard way to move on (source-deltas row 48: "next section entered by Enter").

Narrowings and open questions go in the PR body: the durability matrix is run for the race test only (not the whole matrix); the list-head bulk bar keeps its disabled state with the reason (only the mirror leaves, J-15).

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:unit > /tmp/s121-unit.log 2>&1; echo EXIT=$?; tail -30 /tmp/s121-unit.log` -- expected: green.
- `docker compose --profile tools run --rm tools pnpm exec playwright test e2e/lost-taps.durability.spec.ts --project=durability-desktop-chrome --project=durability-android-chrome --project=durability-webkit > /tmp/s121-race.log 2>&1; echo EXIT=$?; tail -30 /tmp/s121-race.log` -- expected: red before the fix, green after.
- `docker compose --profile tools run --rm tools pnpm exec playwright test e2e/ficha.spec.ts e2e/journey-taps.spec.ts --project=desktop-chrome > /tmp/s121-ficha.log 2>&1; echo EXIT=$?; tail -30 /tmp/s121-ficha.log` -- expected: green.

## Auto Run Result

Status: done

- Summary: J-01 fixed in the shared press path (`apps/web/src/input/press-hold.ts`, `useHeldWhilePressed`, plus typed commits joining the one serial write queue in `state/use-undoable-edits.ts` / `relatorio-editor.ts`); D-2 collapse rule (pointer focus never collapses the section left; stepper and keyboard do; kernel `stepMayCollapse`, `steps[].outOfLimit`); "Concluir ficha" decides on fresh rows; J-15 mirror leaves the Sticky bar when nothing is unset.
- Files: `apps/web/src/input/press-hold.ts` (+test) new guard; `state/use-undoable-edits.ts` queued `commit`; `surfaces/relatorio/relatorio-editor.ts` `commit`; `surfaces/ficha/ficha-surface.tsx` held snapshot, D-2, conclude, mirror; `packages/domain/src/relatorio/sheet-progress.ts` (+test) outOfLimit and stepMayCollapse; `e2e/lost-taps.durability.spec.ts`, `e2e/journey-taps.spec.ts`, `e2e/support/taps.ts` new; `e2e/ficha.spec.ts` 12.1-E2E-007/008/010; `e2e/support/relatorio-seed.ts` helper.
- Review: 12 patches applied, 2 deferred, 5 rejected (reasons in the triage log). Follow-up review recommended: false (no high patched; the medium patches were test additions and small guards verified by their tests).
- Verification: race file red on baseline (desktop 4/6 failed; E2E-003 reworked, 3/3 failed on baseline across projects; E2E-004 red on WebKit), 18/18 green on the three durability projects after the fix; ficha 12.1 tests and journey spec green; J1 24 taps 0 lost, J3 9 taps 0 lost.
- Residual risks: the two deferred items; a chip for an item's own committed observation can appear just before a tap (outside the hold).
