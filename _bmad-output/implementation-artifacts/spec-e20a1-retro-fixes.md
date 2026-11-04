---
title: 'E20-A1: the Epic 20 retrospective fix batch (budget, resend, clock, sign-out, files, point editor, print guards, edge test, hygiene)'
type: 'bugfix'
created: '2026-11-04'
status: 'in-progress'
route: 'dispatch'
baseline_revision: '8a70f700aba248e346dbf518f0386971d5ccf5f7'
baseline_commit: '8a70f700aba248e346dbf518f0386971d5ccf5f7'
review_loop_iteration: 0
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
1. `value-limits.ts`, `rules.ts`: the budget.
   - Judge by growth: `stored - bytes(current value at path) + bytes(new value)`. A non-positive growth always applies.
   - A restore (`put .../removed_at` null) is judged by the revived row's bytes.
   - Sum only client entity kinds (exclude every `serverOnly` family).
   - Measure the stored side with the same serializer as the op side. Re-serialize in JS, or use the bytes of `jsonb` cast to compact text, and document which.
   - Grow the in-push cache by the growth.
   - Kernel tests at N and N+1; integration cases for restore, shrink, in-push and server rows, on one fill.
2. `sync-store.ts`, `attribution.ts`: "Reenviar".
   - Restamp `op_attribution` rows.
   - Restamp `op_target_missing` rows only when one of their `targets`, or a value reference, is the key of a create restamped in this run.
   - Order the restamped rows by `op_id` (commit order on the device), not by the old `client_ts`.
   - `restampOp` gains the learned clock error: value instants within the tolerance shift by that error, clamped to `at`. Far leaves are left untouched (the clamp no longer touches them).
   - The caller passes `clockOffsetMs()`.
3. `clock.ts` and the four duration consumers.
   - Add `elapsedNowMs()` (monotonic, `performance.now`) for durations, and migrate the call sites listed.
   - Store the offset with the raw clock and the monotonic clock at learn time. Drop it at load or read when raw minus monotonic moved more than the tolerance since.
4. `account-surface.tsx:263` → `db === null ? null`.
   - `runPendingWipes` also calls `clearUserStorage()` when a wipe is pending.
   - `altitude-reading.ts` writes no answer after a sign-out cleared storage (session or generation check), and `clearUserStorage` empties `inFlight`.
5. `files.ts`.
   - GET answers 404 for a file named as `cover_photo_file_id` by a removed relatório (and only by removed ones).
   - PUT answers 404 for a removed file, or a file of a removed relatório, before reading the body.
   - Integration cases in `edges.integration.test.ts`.
6. `point-editor.tsx`.
   - `finish` awaits every queued write (persist, pick, `writeFields`, `persistDeadline`).
   - A refused write of any of them keeps the editor open.
   - A pick after `finish` started is ignored.
   - e2e in `points.spec.ts`: a refused pick keeps the editor open; a pick that created the point shows "Ponto de atenção salvo".
7. `layout.ts`.
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

## Spec Change Log

## Review Triage Log

## Verification

**Commands** (host podman, lock with `lockf`):
- `lockf /tmp/fasor-verify.lock podman compose --profile tools run --rm tools pnpm lint` (also `static`, `test:unit` and `test:api`). Expected: exit 0 each.
- `lockf /tmp/fasor-verify.lock podman compose --profile tools run --rm tools pnpm exec tsx scripts/e2e.ts e2e/points.spec.ts e2e/security-device.spec.ts e2e/security-ops.spec.ts e2e/device-clock.durability.spec.ts e2e/document-pages.spec.ts e2e/sync.spec.ts e2e/sync-status.spec.ts --project desktop-chrome --project durability-desktop-chrome`. Expected: green.
- The durability specs touched, on the `durability-android-chrome` and `durability-webkit` projects. Expected: green.
