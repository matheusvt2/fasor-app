---
title: 'Epic 20 fix batch e20f: device clock, every reference checked, values bounded whole, backward moves judged by the server'
type: 'bugfix'
created: '2026-11-04'
status: 'in-review'
baseline_revision: '418e308a26d6bfe222d29c99f3fdadb47d10183f'
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

## Added items (coordinator, 2026-11-04, after the second QA pass on 76cbdb79)

The coordinator added these to the batch (`review-e20-integrated-2026-11-04.md` in the session scratchpad; reproductions `probe-e20.ts`, `probe-e20b.ts`). Each gets a test that fails on `76cbdb79`.

12. **Item 3, aggregate (reproduced live):** two pushes of 90 points of 20 000 characters each (every op within its caps) applied, and the next preview failed `libreoffice_timeout` after 124 s. Per-value caps cannot bound that. Add a per-relatório budget in the kernel (`packages/domain/src/ops/value-limits.ts`): `RELATORIO_MAX_BYTES` = 2 MiB of stored rows (the serialized live rows of the relatório, what `entities.row` holds). Measured (orchestrator, `replay` of the Porto Seguro op log): the Porto Seguro relatório is 207 live rows, 643 247 bytes, 230 644 characters of strings, so 2 MiB is 3.26x the largest real relatório; a kernel test asserts the Porto Seguro replay stays under a third of the budget. The server (`apps/api/src/sync/rules.ts`, in `checkClientOp`) refuses `op_value_invalid` a client create or put naming a relatório when the relatório's stored bytes plus the op value's serialized bytes exceed the budget; the stored bytes are read once per relatório per push (`sum(octet_length(row::text))` over its live rows, through the `entities_company_relatorio_entity_live_idx` index) into `ClientCheckCache` and grown by each applied op's value bytes (an upper bound, so a push cannot sneak past the budget op by op). A remove, and a put of null, always apply (a full relatório can still be emptied). Integration test: a relatório filled close to the budget refuses the op that crosses it and still applies a null put. e2e (`security-ops.spec.ts`): fill a relatório with point text up to just under the budget, then the preview succeeds within `JOB_TIMEOUT` with no `libreoffice_timeout` (record its time in the report); the op past the budget is refused `op_value_invalid`. If that preview does not finish well under the timeout, report the measured time and stop: the budget number is then the coordinator's decision.
13. **N1:** a value nested 20 000 levels deep answers 500 (stack overflow in the recursive walks). Add `VALUE_MAX_DEPTH` (32; measure the deepest legitimate value, about 4) and refuse deeper values `op_value_invalid` without recursing past the cap: check depth iteratively, or before any recursive walk (`stringsIssue`, the reference walk, the zod parse in `apps/api/src/sync/apply.ts` validate). Also catch a `RangeError` per op in `validate` as `op_invalid`, so one op never fails the push. Integration test through the push route: 200 with that op refused, the other ops of the push applied.
14. **N2:** `apps/api/src/http/files.ts:341` serves a photo of a removed (tombstoned) relatório. Answer 404 when the file's relatório row is tombstoned, as for a tombstoned file (the revision DOCX/PDF routes keep their own rules). Case in `apps/api/src/http/edges.integration.test.ts`: 200, remove the relatório, 404, restore, 200.
15. **N3:** sign-out leaves `relatorio-altitude-asked:{id}` keys in localStorage (`apps/web/src/surfaces/relatorio/setup/altitude-reading.ts:15`). `doSignOut` (`apps/web/src/state/session.tsx:389-411`) removes every localStorage key the app owns that names a relatório or another user-specific id (the `relatorio-` prefix at least; also the checklist legend key in sessionStorage, `apps/web/src/surfaces/ficha/checklist-section.tsx:90`), keeping device-wide keys (`releng.clock-offset`, the theme mirror). Assertion in `e2e/security-device.spec.ts`: after "Sair", no localStorage or sessionStorage key names a relatório id.
16. **N4:** after sign-out and a fresh sign-in, a deep link to `/relatorio/{id}/setup` or `/relatorio/{id}/secao/{blockId}` of an Em revisão or Emitido relatório shows "Relatório não encontrado." and never downloads it: `setup-surface.tsx` and `section-text-surface.tsx` lack `RelatorioGate`. Wrap them as the ficha, local, photos, points and Sumário surfaces are. e2e: a fresh device opens each deep link of an Em revisão relatório and sees the surface.
17. **N5:** `apps/web/src/copy/pt-br.ts:30` promises "os relatórios já baixados neste aparelho continuam disponíveis após o login", which a sign-out now makes false. Smallest true change, marked `// authored: 2026-11-04, e20f (QA N5)`: "os relatórios ainda guardados neste aparelho continuam disponíveis após o login." Update any spec asserting the old sentence (grep `e2e/` and `apps/web`).
18. **N7:** a telemetry event dated 2099 answers 204. In the ingest (`apps/api/src/http/telemetry.ts` / `apps/api/src/telemetry/sink.ts`), an event whose `ts` lies more than `CLOCK_SKEW_MS` past the server's clock is stored with the server's receive time instead (clamp, so a fast device loses no event); a kernel helper holds the rule. Test at the boundary (now + 10 min kept, now + 10 min + 1 ms clamped).

Out of scope: N6 (dev-only origin wildcard).

## Spec Change Log

## Review Triage Log

### 2026-11-04 — Review pass
- layers: Edge Case Hunter and Verification Gap Reviewer; Blind Hunter and Intent Alignment skipped (token economy; the integrated epic review covers them).
- verdicts: 14 findings — high 0, medium 3, low 8, false 3, maybe-false 0
- findings:
  - `[medium]` `[patch]` ECH-1: the offset moving backward mid-session makes `now()` jump back, so later own ops sort before pending ones — patched: a kernel `monotonicNowMs` keeps the corrected clock non-decreasing within the session for a gap up to `CLOCK_SKEW_MS / 2`; past it the clock jumps (those pending stamps are refused anyway and "Reenviar" re-stamps them).
  - `[low]` `[patch]` ECH-2: a round trip up to 5 min lets the estimate err by 2.5 min, more than the 60 s band — patched: no estimate when the round trip exceeds `CLOCK_OFFSET_TOLERANCE_MS`.
  - `[medium]` `[patch]` ECH-3: on a slow clock a refused create's dependents stay dead `op_target_missing` with old stamps and sort before the re-stamped create — patched: `resendDead` re-stamps `op_attribution` and `op_target_missing` rows together in commit order.
  - `[low]` `[reject]` ECH-4: an own bounded leaf more than 60 s from `client_ts` is not shifted — every own leaf the web writes is stamped in the same commit as its `client_ts` (milliseconds apart); unlikely, and the fix needs the relatório's creation on the device.
  - `[low]` `[reject]` ECH-5: `op_attribution` also covers actor refusals, which get re-stamped too — such an op is refused again on resend unless its history claim now holds; re-stamping keeps the device's fold equal to the server's arrival order (Design Notes).
  - `[low]` `[reject]` ECH-6: a stored offset goes stale when the device clock is fixed while offline — the first answer online re-learns it, and any refusal in between is recovered by "Reenviar"; a TTL adds state for a rare case.
  - `[false]` `[reject]` ECH-7: a `*` record step in a reference pointer yields no ids — no entry of `REFERENCE_FIELDS` uses `*` (grep), so no check is skipped; latent only.
  - `[low]` `[reject]` ECH-8: `fixtures/value-caps.ts` has no guard for zero items or negative content — a test helper called with fixed sizes in the boundary tests; no caller reaches it.
  - `[low]` `[patch]` ECH-9: `relatorio.template_id` is exempt while the spec asked for a reference, and the `rules.ts` comment still lists the template — the exemption is kept as a narrowing (every reader drops an unknown template id; as a reference it needed template rows in about 25 api suites); patched the comment.
  - `[false]` `[reject]` ECH-10: `restampOp` clamps a forged far-future instant to now, so it applies after "Reenviar" — the clamp runs in the honest client; the server still refuses every pushed instant past its bounds (S3 unchanged), and an attacker can push an in-bounds instant directly anyway.
  - `[low]` `[patch]` ECH-11: no integration case for the brand file ids, a `feeds_block_id` created earlier in the push, or a null certificate — patched: one integration test covering them.
  - `[medium]` `[patch]` VG-O1: same root cause as ECH-1 (backward offset reorders own ops, and a reference can be pushed before its create) — patched with ECH-1.
  - `[low]` `[patch]` VG-O2: readings telemetry compares raw `Date.now()` with stamps from the corrected clock — patched: `observeReadingResults` and `markFileAcked` default to `now()` of `clock.ts`.
  - `[false]` `[reject]` VG-O3: durations on `now()` jump once when the offset is learned — after the ECH-1 patch a backward move up to 5 min is held; a forward jump happens once per learned offset and only shortens one wake-lock idle or one reading poll interval; no user-visible harm found.
  - Verification Gap Reviewer: no verification gaps in the traced behaviors.

## Design Notes

- Re-stamping to the corrected now (not shifting by the offset) keeps the device's fold equal to the server's: the server receives a resent op after anything written since, and the local fold sorts it last by its new `client_ts`.
- `seen` can now only narrow a move: forging `prev_op_id` gains nothing.
- Measured maxima and chosen caps (item 8): filled by the implementer. *(2026-11-04, implementer: over 4 230 client ops (the three fixture logs, a relatório instantiated from the shipped standard template, and that template's create and field puts), the largest open-shaped value is the standard template's `blocks`, 23 840 B serialized, and the longest array is the same `blocks`, 76 items. Chosen: `VALUE_MAX_BYTES` = 128 KiB (131 072 B, 5.5x) and `VALUE_MAX_ITEMS` = 500 (6.6x); the measurement test in `value-limits.test.ts` asserts at least 4x. The byte cap reads only the parts a `strings` or `structured` rule judges (`openValueParts`); the count cap reads every array of a client value.)*
- *(2026-11-04, implementer, item 6:)* `relatorio.template_id` is exempt in `REFERENCE_FIELDS`, not a reference: as a reference it refused the relatório create of about 25 api suites (and `db/seed.ts`), which instantiate `standardTemplate({ id: newId() })` without a template row (131 api tests red). Every reader of it looks the template up among the company's templates and drops an id it does not find, so the exemption reads it as provenance. Turning it into a reference is one table line plus a template create in those suites' setup.
- *(2026-11-04, orchestrator, task 12:)* ~~`RELATORIO_MAX_BYTES` = 2 MiB~~ 1.5 MiB. At 2 MiB the at-budget relatório previewed in 147.9 s end to end (e20f-E2E-004, device pull included), against the spec's 150 s job wait and LibreOffice's 120 s convert limit; at 1.5 MiB (2.45x Porto Seguro) it previewed in 99.7 s (61 points of 20 000 characters and the ones after). The number is an open question for the coordinator.
- *(2026-11-04, implementer, item 6:)* the row parent ids of a create (`location.relatorio_id`, `block.relatorio_id`, `file.relatorio_id`, `file.company_id`, `point.relatorio_id`, `equipment.project_id`) are exempt as envelope-checked: `opSchema` already refuses a create row whose parent id is not the op envelope's. A cover photo is filed company-wide (`relatorio_id` null, `commitFilePick`), so a `relatorio`-scope file reference also accepts a file with no relatório; another relatório's photo is refused.

## Verification

**Commands (inside the `tools` container, `podman compose --profile tools run --rm --user root tools ...`):**
- `pnpm lint`, `pnpm static`, `pnpm test:unit`, `pnpm test:api` -- expected: exit 0.
- `pnpm exec tsx scripts/e2e.ts e2e/device-clock.durability.spec.ts e2e/security-ops.spec.ts --project desktop-chrome --project durability-desktop-chrome` under `lockf -t 20000 /tmp/fasor-verify.lock` -- expected: green.
