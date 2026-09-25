# Epic 5 coordinator notes: delivery shape, what went well, what went badly

Written by the coordinator session on 2026-09-24 as evidence for the Epic 5 retrospective.

## Delivery shape (token economy run)

Matheus asked for the Epic 2/3 token-economy strategy because the account was near its weekly limit. What changed
against Epic 4:

- One shared orchestrator instruction file for every batch (worktree setup, model policy, token rules, finish).
- The epic context was compiled once by a sonnet subagent and committed to main (`d1d6aba`) before any worktree.
- The internal bmad-build-auto review ran two layers only (Edge Case Hunter, Verification Gap), with one fix loop.
  Blind Hunter and Intent Alignment were skipped.
- No per-batch independent review and no per-batch Playwright MCP pass. They were replaced by ONE integrated
  review + QA agent on clean main after the last story merged. The same agent re-checked the fixes via SendMessage
  (cached context), and the same fix orchestrator closed the re-check findings.
- Orchestrators ran on sonnet for sonnet-level batches (A, C) and on opus for the rest. Output rules: logs to a file
  with only the tail read, targeted reads, mock HTML never read whole, at most 30 screenshots.

| Step | Scope | Orchestrator | Dev | PR | Orchestrator tokens (as reported) |
|---|---|---|---|---|---|
| context | epic-5-context.md | sonnet | - | - | 89k |
| F | Epic 4 carry-over E4-A1..A4, E4-A9 SyncState factory | opus | opus/high | #29 | 269k |
| A | 5.1-5.4 + E3-A3 | sonnet | opus/high (A11 floor) | #30 | 463k (with resume) |
| C | 5.9 + two A leftovers | sonnet | sonnet/medium | #31 | 498k |
| B | 5.5-5.8 + nameplate number bug | opus | opus/high | #32 | 355k (with resume) |
| QA | integrated review + gate + browser pass + re-check | opus | - | review on main | 363k (two rounds) |
| Q | fixes E5-Q1..Q18, then E5-R1..R3 | opus | opus/medium | #33 | 277k (two rounds) |

Epic 4 for comparison: 450-600k per orchestrator and about 820k for the QA agent (Epic 4 retro P-7). The dev
children's own tokens are not in these numbers.

Waves: F and A in parallel (F merged first, A merged main in), then B and C in parallel (C merged first, B merged main
and wired C's read-only contract), then QA, then Q.

## What went well

- W-1 Carry-over first. The Epic 4 seams (editedSince, issue rules, cross-device reuse, undo hook) merged before any
  Epic 5 code; A adopted F's `useUndoableEdits` during its merge instead of adding a fourth undo queue.
- W-2 Re-cutting wave 2 by data dependency. The original plan split 5.5-5.7 from 5.8-5.9. It was changed to B =
  5.5-5.8 (readings and the conclusion that judges them) and C = 5.9 + leftovers, so one kernel reading evaluation
  (`evaluateSheetReadings`) feeds the UI, `sheetProgress`, `suggestConclusionPair` and `composeConclusion`. The
  integrated review found no second "out of criterion" rule.
- W-3 Named cross-batch contracts. Each orchestrator's final report listed its op paths and kernel signatures;
  A's stub hosts had owners; C's `useSheetReadOnly()` was wired by B right after C merged, with an e2e.
- W-4 Leftovers routed to the batch already touching the surface (nameplate number bug to B, Repetir and the cabine
  row to C) instead of a separate fix batch.
- W-5 The integrated pass paid for itself: it found a high regression (E5-Q1) and the 390 px clipping (E5-Q2) that
  the two-layer batch reviews missed, and its re-check found E5-R2 in the Q2 fix.
- W-6 Resuming agents with SendMessage (A's finish, B's merge, QA re-check, Q's follow-up) reused cached context and
  cost far less than fresh agents.
- W-7 Every story has `@p0` e2e; `verify` grew from 51 to 70 `@p0` tests, and `test:e2e:full` from 90 to 123.

## What went badly

- B-1 A's sonnet orchestrator launched its two review subagents in the background and was handed back with nothing
  committed, although the instruction file required blocking calls (the same failure Epic 3 recorded four times).
  The instruction file gained an explicit "both layers in ONE message, run_in_background: false" line and a WIP
  commit before review. B and C did not repeat it.
- B-2 E3-A3 introduced a high regression. `assertSeedPath` throws a plain `Error`, which the server answered with
  500; the client retried forever and the device's sync stuck (E5-Q1). A kernel validation was added without mapping
  it into the sync refusal contract, and a `@p1` test (4.2-E2E-002) caught it only because the integrated pass ran
  `test:e2e:full`, which `verify` does not.
- B-3 The gate is unstable under load. 3.6-E2E-001 (E3-A4) failed in almost every full run; 4.1-E2E-002, 4.3-E2E-002,
  1.6-E2E-001, 5.5-E2E-001 and the new E5-Q8 e2e each timed out once. Batch C needed seven verify attempts, the last
  after `docker compose down -v`. Every flake passed alone. E3-A4 is still open after two epics.
- B-4 Narrow-width layout took two rounds (E5-Q2, then E5-R2). Without a per-batch browser pass, 390 px problems
  surface only at the integrated pass; the batch e2e ran at desktop width only.
- B-5 Product questions pile up. About fifteen questions are open for Matheus (E5-Q3, Q6, Q11-Q13, the empty-sheet
  conclusion wording, the 80 % humidity threshold, CONDIÇÕES when out, the single TAP row, the fixture's kV unit,
  Q15, item 23). The authored conclusion recommendations are placeholders until someone who signs relatórios reads
  them.
- B-6 Human gates are still open while Epic 5 shipped: E1-A1 (iPad/Android proof, "blocking before Epics 5 and 6"),
  E3-A1 (R-009 seed review, deferred "to before Epic 5"; Epic 5 ran on seed v1), E3-A2 (not_tested_reason of the
  fixture) and E4-A6 (Bruno reads the skeleton DOCX).
- B-7 No Epic 5 test runs on touch: `test:e2e:matrix` passed but ran no sheet test on Android Chrome or WebKit,
  though the sheet is the tablet's main surface.
- B-8 Worktrees keep accumulating (26 entries), and the coordinator's shell was moved into a worktree twice by a
  `cd`; absolute paths are required.
