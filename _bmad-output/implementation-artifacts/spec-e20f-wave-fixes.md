---
title: 'Epic 20 fix batch e20f: device clock, every reference checked, values bounded whole, backward moves judged by the server'
type: 'bugfix'
created: '2026-11-04'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-20-context.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_reason: 'Four findings of the integrated review of 76cbdb79 on the same server rules of wave B (20.7 to 20.10); one fix batch, one PR (coordinator).'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The integrated review of `76cbdb79` (PRs #237 to #240) found four gaps in the server rules of wave B, read in the code: (1) a device whose clock is more than 10 min fast, or behind the relatório's creation, has every op refused `op_attribution` and "Reenviar" resends the same `client_ts`, so the work is lost for good; (2) the 20.10 value-reference check covers only `point`, `file`, `block`; (3) the 20.9 caps bound each string, not a whole `strings`/`structured` value, so one value can still weigh megabytes; (4) `statusSeen` trusts the device's `prev_op_id`, so a relatório once Emitido can be moved Rascunho to Em revisão as a "backward" move, skipping the generate.

**Approach:** (1) the device learns its offset from the server's `Date` header and stamps with the corrected clock; "Reenviar" re-stamps ops refused `op_attribution`; the server is unchanged, S3 stays closed. (2) one kernel table of every id-valued leaf of the row and op schemas, guarded by a schema walk like `ATTRIBUTED_FIELDS`; each reference must exist and belong where the op is filed. (3) a byte cap on open-shaped values and a count cap on every array, set from measurement. (4) a move counts as backward only when it is backward from the server's status (and from what the device saw).

## Boundaries & Constraints

**Always:**
- Every rule in `packages/domain`; apps only load state and call it (AD-1/AD-13). Red-first: each item gets a test that fails on `76cbdb79` before its fix.
- No contract bump (stay at 29): the clock comes from the HTTP `Date` header, no response field is added.
- `apps/web/src/clock.ts` stays the one place apps/web reads the clock (TC-1).
- A null reference stays valid. A put on a tombstoned row still applies. The merge redirect runs before every check.
- `responsible_user_id` keeps `op_value_invalid` (20.10 AC). Every other value reference is refused `op_target_missing` (launch prompt), including the existing point/file/block ones, which today answer `op_value_invalid`.
- Every existing unit, api and e2e test stays green except the assertions this batch changes on purpose (list them in the PR); `replay.integration.test.ts` and `porto-seguro.integration.test.ts` prove no fixture op is refused.
- No emoji; English code; any new pt-BR string follows the three homes of AGENTS.md (prefer none).

**Never:**
- Never loosen the server's attribution check (`CLOCK_SKEW_MS`, the lower bound) or trust a client-sent time beyond it.
- No new UI surface. A device warning is optional and only with existing copy patterns (`opRejectReasonText` already says "Confira a data e a hora deste aparelho").
- Do not edit `epics.md`, `sprint-status.yaml`, `epic-20-context.md`.
- Out of scope: AD-9 expired-session data on the device, a member putting back a colleague's conclusion after reopening, the reading quota cost, and the em_revisao to emitido revision freshness (recorded as known open).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior |
|---|---|---|
| Fast clock, online | device clock +30 min; signs in, edits | first sync response teaches offset about -30 min; new ops stamped server-time; applied |
| Clock behind creation | device clock -3 days; relatório created server-side now | ops stamped corrected; applied (no lower-bound refusal) |
| Work stamped before the offset was known | ops queued with +30 min stamps, then online | push refused `op_attribution` (rows dead, kept); "Reenviar" re-stamps `client_ts` and the device's own bounded value instants to corrected now (order kept), push applies |
| Offset jitter | estimates within 60 s of the applied offset | applied offset unchanged (no ordering churn) |
| Small true skew | estimate within 60 s of zero | offset 0 |
| Offline boot | offset learned in an earlier session | persisted offset applies at once |
| Reference missing / misfiled | `location/{id}/parent_id` naming R2's local; `feeds_block_id` of a missing block; `cover_photo_file_id` of R2's photo; `instrument_ids` with an id that is no instrument; `project/{id}/client_id` naming no client | refused `op_target_missing`, row unchanged |
| Reference in same push | create of the target earlier in the same push | applies |
| Open value over caps | nameplate cell of 15 000 short strings; structured value of many 20 000-char strings | refused `op_value_invalid` |
| Value at the caps | one value at exactly the byte and count caps | applies; the relatório previews with no `libreoffice_timeout` |
| Forged seen status | relatório once Emitido, now Rascunho; status put `em_revisao` with `prev_op_id` = the old Emitido op, no generate | refused `op_status_transition` |
| Legit backward and undo | manual "Voltar", undo of a first edit (Em campo to Rascunho), the two-device stale case | unchanged from PR #239 |

</intent-contract>

## Code Map

Item 1 (clock):
- `packages/domain/src/ops/attribution.ts:24,163-205` -- `CLOCK_SKEW_MS`, `ATTRIBUTED_FIELDS`, `leavesOf` (private; reuse it for re-stamping). Server checks: `attributionIssue` upper bound, `lowerBoundIssue`.
- `apps/api/src/sync/rules.ts:240-254` -- the apply-transaction half; read only, no change.
- `apps/web/src/clock.ts` -- `export const now: Clock = () => new Date()`; imported by about 50 web files (all op stamping and value instants such as `removed_at`, `concluded_by.at` go through it).
- `apps/web/src/sync/client.ts:166-203` -- `createSyncClient({fetch})`, `request()` for push and pulls; `send()` for files; `createBrowserSyncClient()` at 163 (also used by `surfaces/ficha/use-photo-capture.ts:85`).
- `apps/web/src/db/sync-store.ts:160-172` -- `resendDead(db)`: dead rows back to pending; caller `apps/web/src/state/sync.tsx:461-465`; test double `apps/web/src/test/sync-state.ts:46`.
- `packages/domain/src/ops/materialize.ts:39` -- local ops fold sorted by `byClientTsThenOpId`: re-stamped ops sort last, as the server receives them last.
- `apps/web/src/state/last-session.ts:13-16` -- localStorage key convention `releng.*`, try/catch pattern.
- `packages/domain/src/sync/counts.ts:233` -- the `op_attribution` sentence already exists.
- Server sends `Date` (Node default; checked: `curl -D -` on the api shows `Date: Wed, 04 Nov 2026 07:49:09 GMT`).
- e2e helpers: `e2e/support/merged-fixtures.ts` (`signIn`, `deviceDatabaseName`), `e2e/support/outbox.ts` (`readStore`, `seedOutbox`, `readDeviceId`), `e2e/support/sync.ts` (`syncNow`), `e2e/support/relatorio-flow.ts`; Reenviar precedent `e2e/sync-status.spec.ts:331-361`.

Item 2 (references):
- `packages/domain/src/ops/targets.ts:72-125` -- `ValueReference`, `REFERENCE_FIELDS` (point, file, block only), `valueReferencesOf`, `referenceRowVerdict`; `responsibleUserIdOf` 127-142.
- `apps/api/src/sync/rules.ts:79-101,145-160` -- `checkClientOp`, `referencesHold` (returns `op_value_invalid` today), `rowOf`.
- `packages/domain/src/schemas/entities.ts` -- id leaves: `project.client_id` (113), registry `logo_file_id`/`watermark_file_id`/`cover_background_file_id` (159-162), `sites[].id` (172, own sub-id), `certificate_file_id` (192), relatorio `template_id` (360), `setup.responsible_user_id`/`cover_photo_file_id` (326-327), `setup.instrument_ids` (340), `preview_file_id` (366, server-only family), `location.parent_id` (386, 419), `block.feeds_block_id` (499), cell `op_id`/`source_suggestion_id`/`head_op_id`/`shown_op_id` (60-95, derived), `lastNameplate.relatorio_id` (287, server-only), suggestion/generation_job/revision/audit_run ids (server-only), template blocks/skeleton ids (own node ids).
- `packages/domain/src/ops/op.ts:58,77-80` -- meta ids: `source_suggestion_id` (a confirm names a suggestion of the relatório), `standing_op_id`, `seen_conflict_op_id`, `shown_op_id` (op ids compared by the fold).
- Guard pattern to copy: `packages/domain/src/ops/attribution.test.ts:50-86` (`attributedLeaves` walk over `entityRowSchemas` and `opSchema`); id schema `uuidV7Schema` in `packages/domain/src/ids.ts`.
- Tests that assert the old code: `apps/api/src/sync/targets.integration.test.ts:297-326` (point relink strays, `op_value_invalid`), `packages/domain/src/ops/targets.test.ts`; `e2e/security-ops.spec.ts` (misfiled put).

Item 3 (whole-value caps):
- `packages/domain/src/ops/value-limits.ts:137-170,203-230` -- `stringsIssue`, `ruleIssue` kinds `strings`/`structured`/`texts`, `opValueIssue` (general pass then family rule).
- `apps/web/src/sync/policy.ts:81` -- `serializedBytes` (move or mirror into the kernel if the cap needs it; one definition only).
- Fixtures to measure: `packages/domain/fixtures/porto-seguro/op-log.ts`, `fixtures/porto-seguro/small/op-log.ts`, `fixtures/replay-small/op-log.ts`, and the seed templates/blocks the kernel ships (grep `seed` under `packages/domain/src`).
- `apps/api/src/sync/value-limits.integration.test.ts`, `e2e/security-ops.spec.ts` (S4 push then preview, `JOB_TIMEOUT`).

Item 4 (status):
- `packages/domain/src/status/table.ts:150-213` -- `statusSeen`, `isBackwardIntent(seen,to)`, `statusMoveFacts`, `statusMoveVerdict`.
- `apps/api/src/sync/rules.ts:187-206` -- `statusIssue` (keep the `seen === null` refusal).
- Tests: `packages/domain/src/status/table.test.ts`, `apps/api/src/sync/status-transition.integration.test.ts` (two-device case in both orders, undo cases).

## Tasks & Acceptance

**Execution:**
1. `packages/domain/src/sync/clock-offset.ts` (new, exported from the index) -- `CLOCK_OFFSET_TOLERANCE_MS = 60_000`; `clockOffsetEstimate(serverDate: string | null, sentAtMs: number, receivedAtMs: number): number | null` (Date header has 1 s resolution: server ms + 500 minus the request midpoint; null when absent, unparsable, or the round trip exceeds `CLOCK_SKEW_MS / 2`); `nextClockOffset(applied: number, estimate: number | null): number` (keep `applied` when the estimate is null or within tolerance of it; else 0 when the estimate is within tolerance of 0, else the rounded estimate). Unit tests at the boundaries (equal, tolerance, tolerance+1, negative).
2. `packages/domain/src/ops/attribution.ts` -- `restampOp(op: Op, at: Date): Op`: `client_ts` becomes `at`; each `bounded` or `future` instant leaf (via `leavesOf` and `ATTRIBUTED_FIELDS`) that lies within `CLOCK_OFFSET_TOLERANCE_MS` of the old `client_ts` was stamped by the same clock and shifts by the same delta; any remaining bounded or future leaf later than `at` becomes `at`; exempt leaves and actors untouched; pure, no mutation. Tests: a fast-clock `removed_at` and `concluded_by.at` shift, a colleague's `removal_conflict.edited_at` hours earlier stays, `attributionIssue(restampOp(op, now), path, now).ok` holds for fast and slow cases.
3. `apps/web/src/clock.ts` -- keep `now` as the only clock: `now()` = raw time + applied offset; add `rawNowMs()`, `clockOffsetMs()`, `learnServerClock(serverDate, sentAtMs, receivedAtMs)` (applies `nextClockOffset`, persists to `localStorage` key `releng.clock-offset`, read once at module load; every storage access in try/catch, an unreadable value is 0).
4. `apps/web/src/sync/client.ts` -- `createSyncClient` takes optional `{ rawNowMs, onServerDate }`; `request()` and `send()` report `response.headers.get('date')` with the raw send and receive instants for every answer (2xx or not); `createBrowserSyncClient` wires them to `clock.ts`. Test in `client.test.ts`.
5. `apps/web/src/db/sync-store.ts` -- `resendDead(db, now: Date)`: rows dead with `error_code === 'op_attribution'` are re-stamped with `restampOp` at `now + i` ms in `byClientTsThenOpId` order (outbox row `client_ts` and value updated together), then every dead row goes pending as today; update `state/sync.tsx` to pass `now()`, and the unit tests.
6. `packages/domain/src/ops/targets.ts` -- replace `REFERENCE_FIELDS` by an exported table of every uuid leaf of the row and op schemas by pointer (as `ATTRIBUTED_FIELDS` does), each either a reference `{ entity, kind?, scope: 'relatorio' | 'obra' | 'company' }` or exempt with a one-line reason (own id, envelope-checked, derived by `applyOp`, server-only family, op ids the fold compares, AD-25 provenance). References: point/file/block as today; `location.parent_id` (location, relatorio); `block.feeds_block_id` (block, relatorio); `relatorio.setup.cover_photo_file_id` (file, relatorio); `relatorio.setup.instrument_ids[]` (registry kind instrument, company); `relatorio.template_id` (template, company); `project.client_id` (registry kind client, company); registry file ids (file, company); `op.meta.source_suggestion_id` (suggestion, relatorio) unless the code shows the fold never trusts it (then exempt with that reason). `valueReferencesOf` reads the table for creates and for puts of those fields (`location/field`, `block/field`, `relatorio/setup`, `project/field`, `registry/field`, and any other family that writes one). `referenceRowVerdict` checks existence, registry kind, and scope (relatorio: the row's relatório is the op's; obra: equipment of the relatório's obra; company: exists in the company). Guard test walks the schemas (arrays as `[]`) and fails on an unlisted uuid leaf or a stale entry.
7. `apps/api/src/sync/rules.ts` -- `referencesHold` refusals return `op_target_missing`; `responsible_user_id` stays `op_value_invalid`. `targets.integration.test.ts`: red-first cases for each new field (missing, other relatório or obra, wrong registry kind, null applies, created earlier in the same push applies); update the e20w relink case to `op_target_missing`.
8. `packages/domain/src/ops/value-limits.ts` -- measure first (a kernel test that computes, over the three fixture logs and the shipped seed values, the largest serialized value of each `strings`/`structured` field and the longest array in any op value, and asserts the caps leave at least 4x margin). Add `VALUE_MAX_BYTES` for every value judged by a `strings` or `structured` rule (also the row fields that fall to `structured`) and `VALUE_MAX_ITEMS` for every array anywhere in a client value, both `op_value_invalid`; never refuse a value whose every field is within its text cap (the byte cap applies to open shapes only). Boundary tests at N and N+1; `value-limits.integration.test.ts` for the two examples of the matrix. State the measured maxima and the chosen numbers in the spec's Design Notes.
9. `packages/domain/src/status/table.ts` -- a move is backward only when `manualMove(server, to)` and `manualMove(seen, to)` both hold; `statusMoveFacts` uses the same classification; doc comments updated. Red-first kernel test (the forged-seen case) and an integration case in `status-transition.integration.test.ts`; every existing case (two-device both orders, undo, manual backward) green.
10. `e2e/device-clock.durability.spec.ts` (new, `@p0`) -- a browser `addInitScript` shifts the page's `Date` (constructor without arguments and `Date.now`) by +30 min in one test and -3 days in another; through the real UI (sign in, open or create a relatório, type a value) the work reaches the server (assert the outbox row `acked` and the server log through a pull from the page's session). Third test: clear `releng.clock-offset`, block `/api/sync/*`, edit, unblock, see the row refused (`op_attribution`), tap "Reenviar", and assert the op is applied with a re-stamped `client_ts` within the skew of the server clock.
11. `e2e/security-ops.spec.ts` -- extend: a forged-seen status push refused `op_status_transition`; a misfiled `location/parent_id` (or `feeds_block_id`) refused `op_target_missing`; a push of one value at the byte and count caps applies and the relatório previews within `JOB_TIMEOUT`, and the same value over the caps is refused `op_value_invalid`.

**Acceptance Criteria:**
- Given a tablet whose clock is 30 min fast, or 3 days behind the relatório's creation, when the engineer works through the UI and syncs, then every op is applied and the server log holds the work.
- Given ops refused `op_attribution` for a wrong clock, when the engineer taps "Reenviar", then they are applied, and an op that forges a time beyond the server's bounds is still refused.
- Given each item's red-first test, when run on `76cbdb79`, then it fails; on the batch head it passes.
- Given the story gate (lint, static, test:unit, test:api) and the touched specs plus `security-ops`, `security-device`, `sync`, `sync-status`, second-device specs, and the durability specs on the matrix projects, when run on the head that merges, then all are green.

## Spec Change Log

## Review Triage Log

## Design Notes

- Re-stamping to the corrected now (not shifting by the offset) keeps the device's fold equal to the server's: the server receives a resent op after anything written since, and the local fold sorts it last by its new `client_ts`.
- `seen` can now only narrow a move: forging `prev_op_id` gains nothing.
- Measured maxima and chosen caps (item 8): filled by the implementer.

## Verification

**Commands (inside the `tools` container, `podman compose --profile tools run --rm --user root tools ...`):**
- `pnpm lint`, `pnpm static`, `pnpm test:unit`, `pnpm test:api` -- expected: exit 0.
- `pnpm exec tsx scripts/e2e.ts e2e/device-clock.durability.spec.ts e2e/security-ops.spec.ts --project desktop-chrome --project durability-desktop-chrome` under `lockf -t 20000 /tmp/fasor-verify.lock` -- expected: green.
