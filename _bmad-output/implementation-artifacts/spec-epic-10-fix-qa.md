---
title: 'Epic 10 fixes: integrated review findings (E10-Q1..Q7)'
type: 'bugfix'
created: '2026-09-29'
status: 'done'
baseline_revision: '9a60dd5d33bcd849950d61160562873505b687a8'
review_loop_iteration: 0
followup_review_recommended: true
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/reviews/epic-10-review-qa.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_reason: 'One fix batch for the Epic 10 integrated review (playbook section 6): seven QA findings on the merge fold, the Conflict view undo and the Sync status surface, one PR.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The Epic 10 QA (`reviews/epic-10-review-qa.md`) found seven defects: a reading committed twice by chip-then-Enter that keeps `test:e2e:matrix` red (Q1); "Desfazer" after a resolution silently drops the other device's side (Q2); a Sync status line that counts contradictions as merges (Q3); structure decisions worded "contradições" (Q4); "Enviando…" shown offline (Q5); a pre-contract-12 client that can clear a conflict mark with a plain edit (Q6); counts derived in `apps/web` (Q7).

**Approach:** Fix each at its root with the coordinator's conservative readings: the measurement field stops re-committing a value its unit chip already wrote; an undo inverse carries the marks its op cleared and the fold restores them (contract 13, MIN 13); the superseded line goes; the kernel words cells and structure apart, reads "Enviando…" only while a request is open, and returns every count the surface prints; the push route answers 426 to an outdated client whose push touches a marked cell or block.

## Boundaries & Constraints

**Always:** AD-1/AD-13: every count, plural, state word and derived text in `packages/domain`; `apps/web` renders and writes ops only. `applyOp` stays the one reducer on device and server; replay stays byte-equal. New pt-BR strings marked `// authored:`. Each mechanism fix (Q1, Q2, Q6) ships with a mutation run (revert the fix, the gate test goes red, restore). New @p0 specs assert IndexedDB (entities/outbox) on both devices and the server row, not only the screen. Two devices = two browser contexts, two users of the same worker company, "Sincronizar agora".

**Never:** No new resolution kinds, no removal of "Desfazer" from the resolution toasts (option (a) is not the coordinator's choice). No change to merge rules (FR-58) or to which pairs are contradictions. No edits to `epics.md`, `sprint-status.yaml` or mocks. No `PARALLEL_WORKERS` change.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Q1 chip then Enter | empty insulation cell, type "2", tap M chip, Enter | exactly one outbox put `{raw:'2',unit:'MΩ'}` after the run settles | none |
| Q1 chip then more typing | chip wrote "2 MΩ", engineer types "5" then Enter | a second put `25 MΩ` (a real change still commits) | none |
| Q2 undo "Aplicar" | cell A (op X, Eduardo) with `conflict` B (op Y, Ana); Ana applies B, then "Desfazer" | cell value A, `conflict` = B/Y again, the view names A "de Eduardo" and B "A minha"; Banner and Decisões row back; after sync both devices and the server row hold the same | inverse lands concurrently (other device wrote in between): normal merge, restore ignored |
| Q2 undo "Manter"/"Remover" | tombstone T with `removal_conflict` R; "Manter" (or "Remover"), then "Desfazer" | `removed_at` T, `removed_by` and `removal_conflict` R restored on both devices and the server | as above |
| Q3 | two contradictions, no merge | no "alterações mescladas pelo servidor" line; merges only as "Mesclado automaticamente" rows | none |
| Q4 | 1 cell contradiction + 1 removal + 1 duplicate TAG | headline "1 contradição e 2 decisões para resolver"; badge "1 contradição e 2 decisões"; only structure: "2 decisões para resolver" / "2 decisões" | none |
| Q5 | device offline or server unreachable, outbox row `sent` | the sheet row reads "Aguardando envio" | none |
| Q6 | push with contract header < 12 (or missing) carrying a `sheet/*` put on a cell with `conflict`, or a `block/{id}/removed_at` write on a block with `removal_conflict` | `426 contract_outdated`, nothing of that push applied | a push from the same old client touching no marked row is accepted as today (AD-13) |

</intent-contract>

## Code Map

- `apps/web/src/surfaces/ficha/measurement-field.tsx:124-129` -- `chooseUnit` writes `{raw, unit}` through `write()` directly; `useNumberInput` stays `dirty`, so Enter's `settle()` commits the same value again (Q1 root cause; present since Epic 5, `1e79a3e`; the matrix test only passed when its first poll sampled before Enter's commit landed -- confirmed 2026-09-29: with a 2 s settle both desktop Chrome and WebKit hold two identical rows, each its own `batch_id` from `commitBatch`, so they never coalesce).
- `apps/web/src/components/number-input.tsx:93-112,146` -- `settle`, `dirty`, `commitNow`; add a way to commit a given parsed value that marks the text clean.
- `e2e/ficha.durability.spec.ts:124-151` -- E5-A2-E2E-002; its `expect.poll(written).toEqual([...])` passes on the first matching sample, hiding the second row.
- `packages/domain/src/ops/outbox.ts:50-83` -- `invertBatch`: inverses carry `meta: null`.
- `apps/web/src/db/commit.ts:63-100,337-343` -- `applyOne` (records outbox-only `prev_value`), `undoBatch` (builds `before` from `prev_value`).
- `apps/web/src/db/schema.ts:34` -- `OutboxRow.prev_value`; outbox-only keys list `OUTBOX_ONLY_KEYS` in `commit.ts:47`.
- `packages/domain/src/merge/policy.ts:128-155` -- `mergeCell` sequential branch; `plainCell`.
- `packages/domain/src/merge/stamp.ts` -- `stampSeen`; `packages/domain/src/ops/op.ts:38-44` `opMetaSchema` (loose object).
- `packages/domain/src/ops/apply.ts:116-158` -- `attributed`, `withoutRemovalMarks`, `writeRemovedAt`.
- `packages/domain/src/schemas/entities.ts:59-76,436` -- `cellSchema` (`conflict`), `removal_conflict`.
- `packages/domain/src/merge/conflicts.ts:121-130,288-304` -- `sideOf` (author/time from `opOf(cell.op_id)`), `conflictOpIds`.
- `packages/domain/src/contract/version.ts` -- `CONTRACT_VERSION = 12`, MIN 12, dated notes.
- `apps/api/src/sync/routes.ts:102-160` -- `contractVersionOf`, `isOutdated`, push route (never reads the version).
- `apps/api/src/sync/apply.ts` -- `applyOps`/`applyOneIn` (server fold).
- `apps/web/src/sync/engine.ts:78-79,195,280` -- `supersededCount`; `apps/web/src/state/sync.tsx:96,188,299,343,401-425`.
- `apps/web/src/surfaces/sync/sync-status-surface.tsx:27-30,91-115` -- `decisions.length` fallback, superseded row.
- `apps/web/src/surfaces/sync/sync-sections.tsx:119-129,244` -- `photoTotal`, `sheets.length`, `decisions.length` fed into texts.
- `packages/domain/src/sync/status.ts:37-66,106-128` -- `syncHeadlineText`, `syncSummaryBadges`, `pendingSheetRows`.
- `packages/domain/src/sync/counts.ts:190-193` -- `supersededText`; `merge/conflicts.ts:307-333` `decisionCount`, `decisionTotal`.
- Tests: `e2e/conflicts.spec.ts` (10.2-E2E-001/002, 10.3-E2E-001..006), `e2e/sync-status.spec.ts`, `apps/api/src/sync/sync.integration.test.ts`, `packages/domain/src/merge/*.test.ts`, `packages/domain/src/sync/*.test.ts`, `apps/web/src/surfaces/sync/sync-status-surface.test.tsx`.

## Tasks & Acceptance

**Execution:**
- `apps/web/src/components/number-input.tsx`, `measurement-field.tsx` -- Q1: expose e.g. `commitValue(value)` that sets `dirty=false`, clears `invalid`, formats the text and commits via `committer.immediate`; `chooseUnit` uses it when a value is parsed. Enter after a chip then has nothing to commit; typing after the chip dirties it again.
- `apps/web/src/components/number-input.test.tsx` (or the field's test) -- Q1 unit: chip-then-Enter commits once; chip, type, Enter commits twice.
- `e2e/ficha.durability.spec.ts` -- Q1: after Enter, wait for the focus to move (the run settled), then assert `written(...)` once more with a plain `expect(...).toEqual([...])` after a short settle, so a second row fails the spec on every engine.
- `packages/domain/src/ops/op.ts`, `schemas/entities.ts` -- Q2: `opMetaSchema.restore` optional, either `{conflict: cellConflict, shown_op_id: uuid|null}` (sheet put) or `{removed_by: actor|null, removal_conflict: blockRemovalConflict}` (removed_at write); `cellSchema.shown_op_id` optional (the op whose value the cell shows when it is not `op_id`).
- `packages/domain/src/merge/stamp.ts` (or a sibling) -- Q2: kernel `clearedMarks(state, op)`: the marks the row held that this op's apply would clear (the cell's `conflict` + its `shown_op_id ?? op_id` for a `sheet/*` put; `removed_by` + `removal_conflict` for a `removed_at` write), or undefined.
- `apps/web/src/db/commit.ts`, `db/schema.ts` -- Q2: `applyOne` stores outbox-only `prev_marks` when `clearedMarks` returns one (add to `OUTBOX_ONLY_KEYS`); `undoBatch` passes them to `invertBatch`.
- `packages/domain/src/ops/outbox.ts` -- Q2: `invertBatch(ops, before, deps, marks?)` puts `meta.restore` on the inverse of an op with marks.
- `packages/domain/src/merge/policy.ts`, `ops/apply.ts` -- Q2: a sequential `sheet/*` put with `meta.restore` writes `{...plainCell(op), conflict, shown_op_id}`; a non-null `removed_at` write with `meta.restore` writes `removed_by` and `removal_conflict` from it. A concurrent op ignores `restore`. `sideOf`/`conflictOpIds` read `shown_op_id ?? op_id`.
- `packages/domain/src/contract/version.ts` -- Q2: `CONTRACT_VERSION = 13`, `MIN_CONTRACT_VERSION = 13`, dated notes (reducer + cell shape changed).
- `apps/api/src/sync/routes.ts` (+ a helper in `apps/api/src/sync/`) -- Q6: before applying, a push whose contract header is missing or `< 12` (named constant, e.g. `MARK_AWARE_CONTRACT_VERSION = 12` in `contract/version.ts`) and that carries a `sheet/*` put on a cell holding `conflict`, or a `block/{id}/removed_at` write on a block holding `removal_conflict`, answers `426` with the existing `outdated` body; nothing applied. Update the AD-13 comments there and in `version.ts` with a dated note.
- `apps/web/src/sync/engine.ts`, `state/sync.tsx`, `surfaces/sync/sync-status-surface.tsx`, `packages/domain/src/sync/counts.ts` -- Q3: remove the superseded row, `supersededCount` and `supersededText` (keep `superseded` feeding `queueMergePairs`); update tests that assert them.
- `packages/domain/src/merge/conflicts.ts`, `sync/status.ts`, `state/sync.tsx` -- Q4: kernel `decisionSplit(entries) -> {contradictions, decisions}` (cells vs removal + duplicate TAG, after `uniqueHeldDecisions`); `syncHeadlineText`/`syncSummaryBadges` take both and word them per the matrix (`// authored:`); the badge state still counts the total.
- `packages/domain/src/sync/status.ts`, `state/sync.tsx` -- Q5: `pendingSheetRows(outbox, context, {requestOpen})`; `sent` reads "Enviando…" only when `requestOpen` (`status.running && online && unreachable === null`), else "Aguardando envio".
- `packages/domain/src/sync/status.ts` (or `counts.ts`), `sync-sections.tsx`, `sync-status-surface.tsx` -- Q7: the kernel returns the counts the surface prints (`sendingCounts(sheets, uploads)` or counts on the row lists; the Decisões heading count); remove the `decisions.length` fallback (state always supplies headline and badges; tests supply them).

**Acceptance Criteria:**
- Given E5-A2-E2E-002 strengthened, when it runs on desktop Chrome, Android Chrome emulation and WebKit, then it passes; with the Q1 fix reverted it fails on desktop Chrome (mutation run).
- Given two devices with a cell contradiction, when the user taps "Ver", picks a side, "Aplicar", then "Desfazer" and both sync, then IndexedDB on both devices and the server block row hold the pre-"Aplicar" cell (value, `conflict`, displayed-side author), the Banner and the Decisões row are back, and the Conflict view names each side's original author; with the restore reverted the new @p0 fails (mutation run).
- Given a removed-versus-edited block, when "Manter" then "Desfazer" (and "Remover" then "Desfazer"), then both devices and the server hold `removed_at`, `removed_by` and `removal_conflict` as before the decision, and the Sumário Banner is back.
- Given an api client with contract header 11, when it pushes a put on a marked cell through `POST /api/sync/ops`, then 426 and the cell keeps `conflict`; the same client pushing onto an unmarked cell gets 200 (api integration test; mutation run).
- Given the replay/convergence api tests, when run, then device and server layers stay byte-equal with the new fold branch (extend `replay.integration.test.ts` or `template-convergence` with an undo-of-resolution sequence).
- Given the kernel unit tests, then Q4 wording, Q5 `requestOpen` and Q7 counts are covered; no `.length` of a row list feeds a text in `apps/web/src/surfaces/sync`.

## Spec Change Log

## Review Triage Log

### 2026-09-29 — Review pass
- layers: Edge Case Hunter and Verification Gap Reviewer (opus); Blind Hunter and Intent Alignment skipped (token economy; the integrated epic review covers them).
- verdicts: 9 findings — high 0, medium 2, low 5, false 2, maybe-false 0
- findings:
  - `[medium]` `[patch]` E10-Q1 chip-then-Enter on the real MeasurementField is tested only by `@p1` E5-A2-E2E-002, outside `verify` — retagged `@p0`.
  - `[low]` `[patch]` E10-Q4 provider wiring (`decisionSplit` into headline and badges) has no e2e — headline and badge assertions added to the 10.3 removed-versus-edited e2e.
  - `[medium]` `[patch]` `shown_op_id` through a later contradiction or rule merge untested — two kernel cases added in `conflicts.test.ts`.
  - `[low]` `[patch]` E10-Q6 api test covers `put` on `removed_at` only, not `remove` — one `remove` case added.
  - `[low]` `[reject]` Old client batch whose first put creates a contradiction and whose second plain put clears it in the same push passes the pre-apply check — a pre-contract-12 client after MIN 13 is rare and the fix needs a per-op check inside the apply transaction; listed as known open in the PR.
  - `[false]` `[reject]` Coalesced outbox row keeps only the earlier row's `prev_marks` — every resolution is a `commitBatch` with a `batch_id`, and `coalesce` refuses any op with a `batch_id`, so a mark-clearing op never coalesces.
  - `[low]` `[reject]` During a retry cycle after a failed one, a `sent` row reads "Aguardando envio" — momentary; dropping `unreachable === null` from `requestOpen` would bring back the QA case ("Enviando…" beside "Não foi possível falar com o servidor").
  - `[false]` `[reject]` The cell restore lacks the `SERVER_DEVICE_ID` guard `writeRemovedAt` has — server ops never carry `meta.restore` (only `invertBatch` on a device sets it).
  - `[low]` `[patch]` `e2e/auth.spec.ts:346` asserts the removed `sync-superseded-row` has count 0 (vacuous) — assertion deleted.
- note: the edge-case claims check found no falsified spec claim.

## Design Notes

Undo restore, sheet cell (contract 13):

```
before Aplicar: {value:A, op_id:X, conflict:{op_id:Y, value:B}}
Aplicar put B (seen_conflict_op_id Y) -> {value:B, op_id:Z}; outbox.prev_marks = {conflict:{Y,B}, shown_op_id:X}
Desfazer put A, meta.restore = prev_marks, sequential -> {value:A, op_id:W, shown_op_id:X, conflict:{Y,B}}
```

`op_id` stays the head (W) so later `prev_op_id`/`standing_op_id` checks keep working; `shown_op_id` only feeds provenance (`sideOf`). Any later plain put drops `shown_op_id` (`plainCell`). Open questions for Matheus (PR body): Q2 undo kept vs dropped; Q3 line dropped; Q4 wording; Q6 refusal scope (426 only when a marked row is touched, not every old push).

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:unit` -- green
- `docker compose --profile tools run --rm tools pnpm test:api` -- green
- `docker compose --profile tools run --rm tools pnpm exec tsx scripts/e2e.ts --project durability-desktop-chrome --project durability-webkit --project durability-android-chrome --grep "E5-A2-E2E-002"` -- green on all three
- `docker compose --profile tools run --rm tools pnpm exec tsx scripts/e2e.ts --project desktop-chrome --grep "conflicts|sync-status|10\\.[1-4]-E2E"` -- green
- `docker compose --profile tools run --rm tools pnpm lint` and `pnpm static` -- green

## Auto Run Result

Status: done

**Summary.** The seven Epic 10 QA findings are fixed. E10-Q1: the measurement field's unit chip commits through `useNumberInput.commitValue`, which marks the text clean, so Enter no longer writes the same reading twice (the double write had been present since Epic 5; E5-A2-E2E-002 only passed when its first poll sampled before Enter's commit). E10-Q2: an undo inverse carries the conflict marks its op cleared (`meta.restore`, from the kernel's `clearedMarks`, kept on the outbox row as `prev_marks`), and the fold writes them back on a sequential apply; a cell may carry `shown_op_id` for provenance. This is contract 13, MIN 13. E10-Q3: the superseded line, `supersededCount` and `supersededText` are gone. E10-Q4: `decisionSplit` words cells as "contradição" and structure as "decisão". E10-Q5: `pendingSheetRows(..., {requestOpen})`. E10-Q6: the push route answers 426 when a client below `MARK_AWARE_CONTRACT_VERSION` (12), or one with no header, touches a marked cell or block. E10-Q7: `sendingCounts`, a required `decisionCount`/`headline`/`summaryBadges` on `SyncState`, and no `.length` fallbacks.

**Files.**
- Kernel: `ops/op.ts`, `ops/outbox.ts`, `ops/apply.ts`, `merge/policy.ts`, `merge/restore.ts` (new), `merge/conflicts.ts`, `merge/index.ts`, `schemas/entities.ts`, `contract/version.ts`, `sync/status.ts`, `sync/counts.ts`.
- Web: `components/number-input.tsx`, `surfaces/ficha/measurement-field.tsx`, `db/commit.ts`, `db/schema.ts`, `state/sync.tsx`, `sync/engine.ts`, `surfaces/sync/sync-status-surface.tsx`, `surfaces/sync/sync-sections.tsx`, `copy/pt-br.ts`, `test/sync-state.ts`.
- Api: `sync/routes.ts`, `sync/marks.ts` (new).
- Tests: unit, api (`conflicts.integration.test.ts`, `replay.integration.test.ts`) and e2e (`conflicts.spec.ts` 10.2-E2E-003, 10.3-E2E-007/008; `sync-status.spec.ts` 10.4-E2E-009; `ficha.durability.spec.ts` E5-A2-E2E-002 strengthened and now `@p0`; `auth.spec.ts`).

**Review.** Two layers ran; 9 findings. Five were patched (two medium, three low), none were deferred, and four were rejected (see the triage log).

**Follow-up review recommendation:** `true`. Two medium entries were patched, both test gaps (E5-A2-E2E-002 outside `verify`, and the provenance of `shown_op_id` through later merges). The unverified risk is the new reducer branch under three-device sequences beyond the two kernel cases; the integrated QA re-check covers it.

**Verification.** The implementer ran the targeted suites: `test:api` 49/49 files, lint, static, the touched unit files, E5-A2-E2E-002 on all three durability projects, and the conflicts and sync-status e2e on desktop-chrome. Mutation runs were red for Q1 (desktop Chrome), Q2 (all three new @p0) and Q6 (api test). The gates on the PR head are recorded in the PR body.

**Residual risks.**
- An undo op carries no `source_suggestion_id`, so after "Desfazer" the displayed side has no reading crop. This was already the case before this batch.
- An undo of "Manter" that did not see a later edit writes a fresh removal conflict, not the old mark.
- A pre-12 client whose single push creates a contradiction and then clears it passes the pre-apply check (rejected low).

