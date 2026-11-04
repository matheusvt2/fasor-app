---
title: 'E20-A1: the Epic 20 retrospective fix batch (budget, resend, clock, sign-out, files, point editor, print guards, edge test, hygiene)'
type: 'bugfix'
created: '2026-11-04'
status: 'done'
route: 'dispatch'
baseline_revision: '8a70f700aba248e346dbf518f0386971d5ccf5f7'
baseline_commit: '8a70f700aba248e346dbf518f0386971d5ccf5f7'
review_loop_iteration: 1
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-20-retro-2026-11-04.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-20-context.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_reason: 'Action item E20-A1 of the Epic 20 retrospective: the confirmed code findings R-1 to R-5, R-7, R-8 (docs), R-10, R-11 (test) and R-12 (part), one fix batch, one PR (Matheus 2026-11-04: "siga ate o final").'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A code read of the parts of Epic 20 no review had read found nine defects (retrospective `epic-20-retro-2026-11-04.md`, R-1 to R-12):
- the relatório budget can be bypassed by a restore and locks out shrinking edits;
- "Reenviar" re-stamps unrelated rows and moves recorded instants to the resend time;
- durations read the corrected clock, and a stale clock offset survives a fixed device clock;
- sign-out can delete unsent work behind "nada pendente";
- a removed relatório's cover photo is still served, and uploads to removed files are accepted;
- the point editor closes before its writes settle;
- two print guards rest on untested conditions;
- the 413-through-Caddy behavior is tested only outside the repository;
- small hygiene items.

**Approach:** Fix each finding red-first, keeping every rule in the kernel and the refusal codes of contract 29 unchanged. Each test must fail on the baseline and pass after the fix.

## Boundaries & Constraints

**Always:**
- Every rule lives in `packages/domain`; apps load state and call it (AD-1, AD-13).
- No contract bump; stay at 29.
- A budget refusal keeps `op_value_invalid`.
- A remove and a put of null on a non-`removed_at` path always apply.
- `apps/web/src/clock.ts` stays the one place apps/web reads the clock.
- Every existing test stays green, except assertions this batch changes on purpose. List those in the PR.
- No emoji. English code. No new pt-BR string.

**Never:**
- Never loosen the server's attribution bounds.
- Do not touch R-6 (the offline undo across devices), the R-8 copy or codes, or R-9 (contract 30). They wait for Matheus (E20-A2).
- Do not edit `epics.md`, `sprint-status.yaml` or the retrospective.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error |
|---|---|---|---|
| Restore past budget | relatório near `RELATORIO_MAX_BYTES`; restore of a removed row whose bytes cross it | refused | `op_value_invalid` |
| Restore within budget | the same restore with room | applies | N/A |
| Shrink near budget | put that replaces a value with a shorter one | applies | N/A |
| Grow in one push | 5 puts in one push; only 3 fit | the last 2 are refused, stored bytes stay at or under the cap | `op_value_invalid` |
| Server rows | relatório full of `generation_job`/`audit_run` bytes only | a user write applies | N/A |
| Resend, unrelated target-missing row | dead `op_target_missing` row with no restamped create among its targets | goes pending with its stamps unchanged | N/A |
| Resend, dependent row | dead create `op_attribution` plus a dependent | both are restamped in commit order; the create comes first | N/A |
| Resend, value instant | `concluded_by.at` stamped by a clock 30 min fast | shifted by the learned clock error, not to the resend time | N/A |
| Sign-out, no handle | Conta with `db === null` | the unknown-count dialog, never "nada pendente" | N/A |
| Cover of a removed relatório | GET of the company-wide cover file after `relatorio/removed_at` | 404; 200 again after restore | N/A |
| PUT to a removed file or relatório | upload bytes | 404; no reading queued | N/A |
| Section 9 removed | photos numbered, `section_9` block removed | section 7 prints the empty note; section 8 has no `startsPage` | N/A |
| 413 on the wire | node-server, guard on, declared length `SYNC_PUSH_MAX_BYTES + 1` | JSON 413 `body_too_large`, socket not reset; exactly `SYNC_PUSH_MAX_BYTES` is not refused 413 | N/A |

</frozen-after-approval>

## Code Map

- `packages/domain/src/ops/value-limits.ts`:
  - `serializedBytes` :304; `RELATORIO_MAX_BYTES` :322;
  - `relatorioBudgetVerdict` :330. Lets every null put through, so a restore passes.
- `apps/api/src/sync/rules.ts`:
  - `ClientCheckCache.relatorioBytes` :59; `budgetIssue` :119-136.
  - Sums `octet_length(row::text)` (jsonb text with spaces) over every entity kind. Adds the full value at :134.
  - `deps.state` (`apply.ts:504-515`) holds the op's target rows, tombstoned ones included. Kernel `readPath(state, op)` (`ops/apply.ts:540`) gives the current value at a path.
  - Server-only kinds: `FAMILIES` `serverOnly` (`ops/path.ts:220`, `isServerOnly` :491). Includes `suggestion`, `generation_job`, `revision`, `audit_run`.
- `apps/web/src/db/sync-store.ts`:
  - `RESTAMPED_CODES` :162; `resendDead` :174-189 (sorted by `byClientTsThenOpId`).
  - Outbox rows carry `targets[]`. A create's targets hold its own key.
  - `op_id`/`batch_id` are UUIDv7 on raw `Date.now()`; `byClientTsThenOpId` lives in `ops/replay.ts:16`.
- `packages/domain/src/ops/attribution.ts`:
  - `restampOp` :263-286: delta is `at − old client_ts`; the clamp at :279 also hits far leaves.
  - `CLOCK_SKEW_MS` :25.
- `packages/domain/src/sync/clock-offset.ts`:
  - `CLOCK_OFFSET_TOLERANCE_MS` :16, `nextClockOffset` :40, `monotonicNowMs` :56.
  - Import cycle with `attribution.ts:1`; both re-exported in `index.ts:17,62`.
- `apps/web/src/clock.ts`:
  - `readStoredOffset` :14, `appliedOffset` :34, `rawNowMs` :37, `now` :49, `learnServerClock` :60, `clockOffsetMs` :42.
  - Key `releng.clock-offset` holds the number only.
- Duration consumers of `now()`:
  - `input/use-screen-wake-lock.ts` :44, 65, 133, 139, 156, 183;
  - `surfaces/export/use-preview.ts` :138, 156;
  - `surfaces/export/use-audit.ts` :112, 119;
  - `sync/engine.ts` :719, 750.

  Absolute comparisons stay on `now()`: `use-generate.ts:451`, `telemetry/readings.ts:78`.
- `apps/web/src/surfaces/account/account-surface.tsx`:
  - `prepareSignOut` :257-268; the bug is at :263.
  - The dialog choice at :538-539: `null` shows `signOutUnsentUnknown`.
- `apps/web/src/state/session.tsx`: `runPendingWipes` :171 (boot :233); `doSignOut` :390-414 (`clearUserStorage` :406).
- `apps/web/src/state/user-storage.ts:19` `clearUserStorage`.
- `apps/web/src/surfaces/relatorio/setup/altitude-reading.ts`: `inFlight` :19; `keepAltitudeAnswer` :33, called after the settle at :60.
- `apps/api/src/http/files.ts`: PUT :191 (lookup :202, no removed check); GET :328 (checks :341, :343).
- `apps/api/src/db/repositories/files.ts`: `findFileRow` :38, `relatorioRemoved` :69.
- Cover photos: filed company-wide (`file-commit.ts:30`), named by `relatorio.setup.cover_photo_file_id`. Query pattern `row->'setup'->>…` as in `http/generate.ts:118`.
- `apps/web/src/surfaces/points/point-editor.tsx`:
  - refs :177-182; `persist` :228; `persistDeadline` :314 (untracked); `writeFields` :332-350 (untracked, rejection swallowed); `pickLink` :370-410; `finish` :516-548.
  - `edits` queue: `state/use-undoable-edits.ts:35-81`.
  - `onDone` callers: `points-surface.tsx:119` (toast :126) and `create-point-action.tsx:51`.
- `packages/domain/src/print/layout.ts`:
  - `testsAt` :238, `photosNote` :241, `startsPage` :263.
  - `section9Layout` (`print/section-9.ts:909`): photo parts are `kind: 'photos'` in `subsections[].sheets[].parts` and `subsections[].localParts`.
- `apps/api/src/http/app.ts` `bodyTooLarge` :157-165; `origin-guard.ts:41-47` `hasNoBody`; `SYNC_PUSH_MAX_BYTES` (`contract/sync.ts:21`). No test starts `@hono/node-server`; `main.ts:135` does.
- `apps/api/src/sync/apply.ts`: `RangeError` catch :185-190; `logRuleRefusal` :100.
- `packages/domain/src/contract/errors.ts:22-25`: JSDoc of `op_value_invalid` and `op_target_missing`.
- `apps/web/src/copy/pt-br.ts`: orphaned `setup.notFound` :1452, `loadingWhat.setup` :1589, `loadingWhat.section` :1590. Keep `sectionText.notFound` :1559.
- Tests to extend:
  - `value-limits.test.ts:357-385`;
  - `value-limits.integration.test.ts:63-112` (one fill takes 180 s, so reuse one fill for every budget case);
  - `sync-store.test.ts:230-321`;
  - `attribution.test.ts:275+`;
  - `clock.test.ts`;
  - `account-surface.test.tsx:184`;
  - `session.test.tsx:342`;
  - `user-storage.test.ts`;
  - `edges.integration.test.ts:296-338`;
  - `section-7.test.ts:100-111`;
  - `layout.test.ts:245-263`;
  - `absent-sections.test.ts:39` (`without`);
  - `security.test.ts:142-160`;
  - `e2e/points.spec.ts` (`__refuseOutbox` init script :452, :977; E2E-006 :1019).

## Tasks & Acceptance

**Execution:**
1. [x] `value-limits.ts`, `rules.ts`: the budget.
   - Judge by growth: `stored - bytes(current value at path) + bytes(new value)`. A non-positive growth always applies.
   - A restore (`put .../removed_at` null) is judged by the revived row's bytes.
   - Sum only client entity kinds (exclude every `serverOnly` family).
   - Measure the stored side with the same serializer as the op side. Re-serialize in JS, or use the bytes of `jsonb` cast to compact text, and document which.
   - Grow the in-push cache by the growth.
   - Kernel tests at N and N+1; integration cases for restore, shrink, in-push and server rows, on one fill.
2. [x] `sync-store.ts`, `attribution.ts`: "Reenviar".
   - Restamp `op_attribution` rows.
   - Restamp `op_target_missing` rows only when one of their `targets`, or a value reference, is the key of a create restamped in this run.
   - Order the restamped rows by `op_id` (commit order on the device), not by the old `client_ts`.
   - `restampOp` gains the learned clock error: value instants within the tolerance shift by that error, clamped to `at`. Far leaves are left untouched (the clamp no longer touches them).
   - The caller passes `clockOffsetMs()`.
3. [x] `clock.ts` and the four duration consumers.
   - Add `elapsedNowMs()` (monotonic, `performance.now`) for durations, and migrate the call sites listed.
   - ~~Store the offset with the raw clock and the monotonic clock at learn time. Drop it at load or read when raw minus monotonic moved more than the tolerance since.~~ *(2026-11-04, review loop 1: `performance.now` stops while a tablet sleeps, and `Date.now` does not, so that rule dropped the offset after every sleep over 60 s.)*
   - Store the offset with the raw clock at learn time.
     - At load, drop it only when the raw clock now reads more than the tolerance before the stored raw instant (set back while the app was closed). Then re-anchor the in-page basis to the load instant, so a monotonic value from another page is never compared.
     - Within a page, drop it only when the raw clock moved *backward* against the monotonic one by more than the tolerance (set back while running).
     - A forward drift is sleep or a clock set forward, which cannot be told apart, so it is kept; the next server answer corrects it.
     - Store the offset and its raw instant in one value.
4. [x] `account-surface.tsx:263` → `db === null ? null`.
   - `runPendingWipes` also calls `clearUserStorage()` when a wipe is pending.
   - `altitude-reading.ts` writes no answer after a sign-out cleared storage (session or generation check), and `clearUserStorage` empties `inFlight`.
5. [x] `files.ts`.
   - GET answers 404 for a file named as `cover_photo_file_id` by a removed relatório (and only by removed ones).
   - PUT answers 404 for a removed file, or a file of a removed relatório, before reading the body.
   - Integration cases in `edges.integration.test.ts`.
6. [x] `point-editor.tsx`.
   - `finish` awaits every queued write (persist, pick, `writeFields`, `persistDeadline`).
   - A refused write of any of them keeps the editor open.
   - A pick after `finish` started is ignored.
   - e2e in `points.spec.ts`: a refused pick keeps the editor open; a pick that created the point shows "Ponto de atenção salvo".
7. [x] `layout.ts`.
   - `photosNote` only when the built section 9 holds at least one photo part. Build section 9 before section 7.
   - Tests with `section_9` removed: section 7 note and section 8 `startsPage`.
8. A new `apps/api/src/http/body-limit.node.integration.test.ts` (or the nearest name that the api Vitest config picks up).
   - Start `@hono/node-server` on an ephemeral port with the guard on and a trusted origin.
   - Declared `SYNC_PUSH_MAX_BYTES + 1` with a slow body: JSON 413 `body_too_large`, and no socket reset.
   - Declared exactly `SYNC_PUSH_MAX_BYTES`: not 413.
9. Hygiene.
   - Move `CLOCK_SKEW_MS` and `CLOCK_OFFSET_TOLERANCE_MS` to a leaf `packages/domain/src/sync/clock-constants.ts` (both re-exported unchanged). `restampOp` gets its own named window constant.
   - The `RangeError` catch calls `logRuleRefusal` with the error text.
   - Remove the three orphaned copy keys.
   - Update the JSDoc at `errors.ts:22-25`: references now answer `op_target_missing`, and the relatório budget answers `op_value_invalid`.

**Acceptance Criteria:**
- Given each task's red-first test, when it runs on `8a70f700`, then it fails; on the batch head it passes.
- Given the story gate (lint, static, test:unit, test:api) and the touched specs (`points`, `security-device`, `security-ops`, `device-clock.durability`, `document-pages`, `sync`, `sync-status`), with the durability specs also on the matrix projects, when run on the merge head, then all are green.

## Design Notes

These are coordinator readings taken under "siga ate o final", open to Matheus's correction:
- A restore that would cross the budget is refused like any other growth. The user removes something else first. Letting it apply would reopen the timeout the budget exists for.
- A resent dependent keeps "now" ordering for `client_ts`, as e20f chose, so the device fold matches the server's arrival order. Only value instants move by the clock error.

## Implementation Notes

- 2026-11-04, implementer (bmad-dev-opus-high), reviewed by the coordinator against the diff:
  - Task 1 judges growth with the kernel's own reducer (`relatorioBudgetGrowth`: `applyOp` on the target rows, counted bytes after minus before), not the `readPath` formula the task sketched. It is exact for creates (stored defaults) and sheet cells, so the in-push cache never runs under the real size.
  - New exports: `relatorioBudgetRowBytes`, `RELATORIO_BUDGET_SERVER_ENTITIES` (every `serverOnly` create family: audit_run, generation_job, revision, suggestion, user).
  - `relatorioBudgetVerdict(op, stored, growth)` has a new signature.
  - Task 2 is the new kernel module `sync/resend.ts` (`resendRestampOrder`, transitive dependents, `op_id` order); `restampOp(op, at, clockErrorMs)` has its own `RESTAMP_WINDOW_MS` (60 s).
  - Task 3 keeps the offset key and adds `releng.clock-offset-basis`; the kernel says when it is stale (`clockOffsetStale`).
  - Task 9: `CLOCK_SKEW_MS` and `CLOCK_OFFSET_TOLERANCE_MS` have one home, `sync/clock-constants.ts`, re-exported from their old modules.
- Red-first on `8a70f700` (sources stashed, tests kept): every new test failed except three coverage pins:
  - E20-A1-E2E-002, whose behavior already held;
  - the section-9-removed layout test, which pins the existing `testsAt >= 0` guard;
  - Task 8's node-server test. With `@hono/node-server` 2.x and Hono 4.13.8 the header-only 413 and the streamed 413 both answer JSON and close with a FIN, so the test also passes with the e20e header check disabled. The Caddy-side 502 it was meant to guard needs Caddy in front, and stays on the VGR-1 ledger row.
  - The api budget tests fail on the baseline at import (`relatorioBudgetRowBytes` absent), not at the behavior.
- Assertions changed on purpose:
  - `attribution.test.ts`: the e20f `restampOp` tests pass the clock error; "a forged far instant is capped at now" became "a far instant stays".
  - `sync-store.test.ts`: the e20f Reenviar test passes -30 min, and the removal instant is `15:00:00.001Z` instead of `14:59:59.501Z`.
  - `value-limits.test.ts` and `value-limits.integration.test.ts`: the e20f budget tests were rewritten for the growth rule, on one fill.
- Gate run by the implementer, under `lockf`:
  - lint 0 errors (26 warnings: 25 existing, plus the `waitForTimeout` of E20-A1-E2E-001, as at `points.spec.ts:507`);
  - static 0;
  - test:unit 5085 of 5085;
  - test:api 831 passed, 4 skipped;
  - touched specs 50 of 50 on desktop-chrome and durability-desktop-chrome;
  - `device-clock.durability` 6 of 6 on the two matrix projects.

## Spec Change Log

- 2026-11-04, review loop 1.
  - **Trigger:** Blind Hunter 1, Edge Case Hunter 1, 2 and 11, and the verification-gap "other" finding all report the same defect. `clockOffsetStale` treated any drift of raw minus monotonic over 60 s as a clock set. `performance.now` stops during device suspend on Android and iPadOS, so an offline tablet that slept dropped its learned offset and went back to its wrong clock, undoing Story 20.8 and e20f.
  - **Amended:** task 3's drop rule (above).
  - **Known-bad state avoided:** an offset lost on every wake.
  - **Narrowed loopback, recorded as a deviation from the workflow:** the code was not reverted. Every other task is KEEP, as built and verified (tasks 1, 2, 4 to 9, their tests and the assertion changes listed in Implementation Notes). Only `clockOffsetStale`, `clock.ts` and their tests are re-derived, together with the patch findings below.

## Review Triage Log

### 2026-11-04 — Review pass 1

- **Layers run:** Blind Hunter, Edge Case Hunter and Verification Gap, all on opus. None was skipped.
- **Findings:** 31 raw findings, 24 after dedupe.
- **Verdicts:** high 1, medium 7, low 12, false 0, maybe-false 2.

| # | Sources | Verdict | Finding and evidence | Route |
|---|---|---|---|---|
| 1 | BH-1, ECH-1, ECH-2, ECH-11, VG-other-1 | high | The offset is dropped after any sleep over 60 s. `clockOffsetStale` drift rule; `performance.now` pauses in suspend while `Date.now` runs. A stored basis from an earlier page is also compared across pages. | bad_spec (task 3 amended; narrowed loopback) |
| 2 | ECH-3, ECH-4, BH-2, VG-other-2 | medium | `restampOp` shifts by the current offset only. When the offset is unknown (0, for example a clock fixed before reconnecting), a slow clock's value instants stay days before the relatório's create, which was itself restamped to now. They are refused again on every "Reenviar". e20f's shift-to-resend-time covered that case. | patch: an error of 0 falls back to the e20f delta (`at − old client_ts`). The double-shift of a row stamped after the offset was learned is accepted: such a row is refused `op_attribution` only for an actor or lower-bound claim that a resend does not cure anyway. |
| 3 | ECH-6, BH-4 | medium | The PUT 404 for a withdrawn file maps to `permanent` (`policy.ts` `classifyUploadFailure`, via `classifyFailure` `stop`). After a restore the bytes never upload by themselves. Since lookup-null answers 409, this 404 is the withdrawn case alone. | patch: a 404 `not_found` on the upload PUT defers, with a policy test |
| 4 | BH-8 | medium | `pickRefused` is cleared only by `finish`. After a refused pick and a later stored pick, "Concluir" stays open once more and needs a second tap. | patch: a pick that settles stored clears `pickRefused`; the e2e sequence picks twice before "Concluir" |
| 5 | ECH-5, BH-9 | medium | A priority, clear or deadline pick after `finish` started is still queued; only `pickLink` checks `finishing`. | patch: `writeFields` and `changeDeadline` return early while finishing |
| 6 | VG-5 | medium | A refused priority pick that keeps the editor open is not tested in e2e. | patch: a test beside E20-A1-E2E-001 with `refusableOutbox` |
| 7 | VG-2 | medium | `resendRestampOrder` has no kernel test for a value-reference dependent or a transitive chain. | patch: `packages/domain/src/sync/resend.test.ts` |
| 8 | VG-1 | medium | The `clockOffsetMs()` argument at `sync.tsx:465` is not verified at the caller. DUR-003 asserts no value instant. | patch: extend `e20f-DUR-003` (or a sibling) with a removal written offline on the shifted clock; after "Reenviar" the logged `removed_at` is within the tolerance of server time |
| 9 | VG-3 | low | The engine's `elapsedMs` window is not tested with distinct clocks. | patch: an `engine.test.ts` case where `now` jumps 30 min and `elapsedMs` does not |
| 10 | VG-3 (hooks) | low | The preview and audit "never arrived" expiries have no test harness. | defer |
| 11 | VG-4 | low | A confirming answer refreshing the stored basis is not tested. | patch, folded into the task 3 re-derivation tests |
| 12 | BH-6 | low | `coverOfRemovedRelatoriosOnly` runs on every company-wide file, logos and certificates included (an unindexed jsonb filter). | patch: query only for a photo-kind file |
| 13 | BH-7 | low | The `RangeError` branch logs an unchecked `op_id` and `path` at full length. | patch: truncate both, as a log field (200 characters) |
| 14 | ECH-8 | low | The node-server test hangs instead of failing when the server resets before answering. | patch: reject on a request error before the answer |
| 15 | BH-11, VG-7 | low | The node-server test's header claims it guards the e20e header check, and it does not. | patch: correct the header comment to name what it pins and point to VGR-1 |
| 16 | ECH-10, BH-3 | low | `op_id` (UUIDv7 on the raw clock) is commit order only within one page. After a reload under a clock set back, a dependent can sort first. | patch: narrow the doc comment in `resend.ts`; the limitation is accepted |
| 17 | BH-5 | maybe-false | `storedRelatorioBytes` reads and re-serializes every live client row of the relatório on each growing push, where before it was one SQL sum. Unmeasured; would be medium if real. Settled by timing a push on a Porto Seguro-sized relatório. | defer |
| 18 | VG-6 | low | `POST /api/photos/{id}/reread` and `sendRetargetedReading` do not use `fileWithdrawn`, so a photo of a removed relatório can still spend a reading. | defer |
| 19 | ECH-7, BH-10 | low | While a wipe stays pending (blocked delete), every boot clears device-wide `relatorio-*` keys, erasing the next user's altitude memo. Unlikely; the fix adds state. | reject |
| 20 | BH-12 | low | Offset and basis are written as two keys, not atomically. | folded into #1 (one value) |
| 21 | ECH-9 | low | Server-written fields on client rows (file variants, reading fields, `preview_file_id`) still count toward the budget. These are bytes, not documents. | reject |
| 22 | BH-13 | low | `refusableOutbox` is a third inline copy, and E20-A1-E2E-001 uses a fixed 1.5 s wait. A refactor touching two other tests. | reject (the wait matches the existing `points.spec.ts:507`) |
| 23 | VG-7 | maybe-false | The Caddy-side 502 the test was meant to guard is still verified only outside the repository. | defer (already the VGR-1 ledger row) |
| 24 | BH-2 (part) | low | A row stamped after the offset was learned and refused for another reason gets its instants double-shifted. | reject, see #2 |

## Verification

**Commands** (host podman, lock with `lockf`):
- `lockf /tmp/fasor-verify.lock podman compose --profile tools run --rm tools pnpm lint` (also `static`, `test:unit` and `test:api`). Expected: exit 0 each.
- `lockf /tmp/fasor-verify.lock podman compose --profile tools run --rm tools pnpm exec tsx scripts/e2e.ts e2e/points.spec.ts e2e/security-device.spec.ts e2e/security-ops.spec.ts e2e/device-clock.durability.spec.ts e2e/document-pages.spec.ts e2e/sync.spec.ts e2e/sync-status.spec.ts --project desktop-chrome --project durability-desktop-chrome`. Expected: green.
- The durability specs touched, on the `durability-android-chrome` and `durability-webkit` projects. Expected: green.
