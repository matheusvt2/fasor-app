---
title: 'Chore T2: keep the e2e suite from waiting on real time'
type: 'chore'
created: '2026-11-04'
status: 'done'
route: 'oneshot'
baseline_revision: 'aa5bfff215fc49d7b013396db137feb6d5edaa1a'
dev_model: 'opus'
dev_effort: 'medium'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-04.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** On 2026-11-04 the e2e suite was found waiting on real time. Five tests sat on the 60 s sync tick, breaking decision C-4, and the reading-age tests waited on the wall clock. Those waits are fixed on main (`8dda538c`, `aa5bfff2`), but nothing stops the sync-tick pattern from coming back. Separately, the two `review-layout-*` specs sit in the serial group for a reason that may not hold: a fixed-viewport box does not depend on CPU load. And the KB still says `PARALLEL_WORKERS` is 1.

**Approach:** Chore batch T2 of `sprint-change-proposal-2026-11-04.md` § 4.1, approved by Matheus on 2026-11-04. It has four parts:

1. **Guard.** A `test:unit` guard in `scripts/e2e.test.ts` fails when an `e2e/**/*.spec.ts` file waits for the sync badge's `data-pending` with `SYNC_CYCLE_TIMEOUT` or with a timeout of 30 s or more. The failure names the file and line and points to `syncNow` or `syncNowAndReturn`; `e2e/support/sync.ts` is exempt. Any spec the guard flags today is fixed.
2. **Layout specs.** `review-layout-copy-3.spec.ts` and `review-layout-interaction-2026-10-08.spec.ts` each run `--repeat-each 5` in the parallel group on two workers, under the host lock.
   - Five green runs of each: its `SERIAL_SPECS` entry is removed, with a dated comment naming the runs.
   - Any red run: the entry stays, and its `why` gains the failing test and the date.
3. **KB.** `docs/kbs/workflow/e2e-testing.md` says `PARALLEL_WORKERS` 2 (validated 2026-10-08), and `docs/kbs/log.md` gets an entry.
4. **Gate.** `lint`, `static`, `test:unit` and the touched specs pass, with their output in the PR.

The PR also carries the `AGENTS.md` decision-of-record line and `sprint-change-proposal-2026-11-04.md`.

</frozen-after-approval>

## Implementation Notes

- The guard flags `e2e/qgbt.spec.ts:327`. There, `toHaveAttribute('data-pending', '0', { timeout: 60_000 })` follows `syncNowAndReturn`, which already ends on `data-pending="0"`. The fix drops the 60 s timeout and keeps the assertion. `qgbt.spec.ts` is therefore a touched spec.
- The guard's first `test:unit` run caught a second case that the manual grep had missed. In `e2e/durability.spec.ts`, 1.8-E2E-002 (`@p0`) tapped "Sincronizar agora" by hand, then waited 30 s for `data-pending="0"` on `.app-bar [data-testid="sync-badge"]`. It now calls the shared `syncNow`, imported as `syncNowCycle` because the file has local `syncNow` button constants. That helper waits until the cycle that started after the tap is over and nothing is pending. `durability.spec.ts` is a touched spec. It changes no op fold, commit path or live query, so the matrix rule does not apply.
- Layout validation, one run under the host lock, both specs `--repeat-each 5` in the parallel group on two workers: 155 runs, 154 green, 1 red.
  - `review-layout-copy-3`: 16 tests × 5 = 80, all green. It leaves `SERIAL_SPECS`, with a dated comment.
  - `review-layout-interaction-2026-10-08`: 74 of 75 green. R8LAY-E2E-008 failed on repeat 4: the "Novo relatório" dialog was not visible 5 s after its click. Per AC 2 the entry stays, and its `why` names the failure and the date.
  - Logs: `t2-gate-2.log` and `t2-layout-summary.json` in the session scratchpad. They are not tracked; their counts are copied here and into the PR.
- KB: `docs/kbs/workflow/e2e-testing.md` (the workers line, the guard, the stale "only the epic retro runs full and matrix" line, the timestamp and the sources), `docs/kbs/workflow/merge-gate.md` (the one-off direct push) and `docs/kbs/log.md`.
- Left to the wave, outside this PR: the proposal's DoD of § 4.1 asks that the next `test:e2e:full` record its group times against the baseline (serial 22.0 min, parallel 17.3 min). That run is the coordinator's, once per wave (E11-A1).

## Review Triage Log

Blind Hunter (opus, one layer), 13 findings:

- **The guard reads only `SYNC_CYCLE_TIMEOUT` as a named timeout: medium, patched.** Any constant or expression is now read as the tick, and only a literal under 30 s passes. `production.smoke.ts` `SYNC_TIMEOUT` is out of scope because the smoke runs outside every gate.
- **The guard stops at the first `)` and misses other shapes: medium, patched in part.** It now reads the call up to its `);`, so `String(n)` and `.not.` are caught. Outbox polls and `data-state` waits are other signals: low, rejected (a fuzzy widening). The KB names what the guard reads.
- **Support files are exempt beyond `support/sync.ts`: medium, patched.** The guard scans every `e2e/**/*.ts` but `support/sync.ts` and `production/`. A dry run found no offender.
- **The detector test misses edge cases: low, patched.** It now covers the 30 000 and 29 999 boundary, `SYNC_TIMEOUT`, the `.not` form with a call, and an assertion with no timeout.
- **Two hand-rolled taps remain in `durability.spec.ts`: low, deferred.** They predate T2 and are not tick waits. See the `deferred-work.md` row.
- **The `qgbt` check repeats `syncNow`'s own: low, patched.** The comment now says it is a check after the navigation, not a wait.
- **The spec drops the DoD item on recording group times: low, recorded.** Implementation Notes give it to the wave run. The frozen intent is left as approved.
- **The layout evidence is not recorded: medium, patched.** The counts are in Implementation Notes, the `groups.ts` comment and the PR.
- **The spike is untracked: medium, deferred.** A `deferred-work.md` row now holds it for Matheus to schedule.
- **"Nobody has measured the breakdown" is wrong: medium, patched.** The proposal strikes the sentence and cites the job's `generate timing` line and `generation-time.integration.test.ts`.
- **`merge-gate.md` is not updated for the `AGENTS.md` line: low, patched.**
- **`e2e-testing.md` is stale (timestamp, sources, line 13): low, patched.**
- **The documents disagree (the guard's path scope, § 4.3's quote): low, patched.** Proposal AC 1 marks the wider scope. § 4.3 marks its quote as superseded by the committed line.
