---
title: 'Story 10.1: Merge the same sheet from two devices by rule'
type: 'feature'
created: '2026-09-29'
status: 'in-progress'
baseline_revision: '256f358c2202f6ddcf061b126501bec658cd69df'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context.md'
warnings: ['oversized']
deferred:
  - 'Known limit (open question): an observation the C device wrote BEFORE its C result is not caught by nc_observation (the result cell carries no merge record yet when the observation folds), so it folds as latest_text.'
  - 'Known limit (open question): the undo of a merged-away put writes its inverse with prev_op_id = op.op_id, which is the head, so it applies sequentially (clearing the other side''s value).'
  - 'Known limit (open question): "de {nome}" names the standing value''s author even when that is the viewer (no "você" form).'
  - 'Known limit (open question): whether an NC vs NA pair should merge is open; it is treated as a contradiction (seq-later applies, no entry; Story 10.2).'
  - 'Reading taken: "empty" follows isCellFilled (null, absent, a blank string, or an AD-11 number whose state is empty), a superset of the spec''s list; the web never writes the last form (a cleared cell is null).'
  - 'Reading taken: a stream''s first download (every page until the stream was complete once) yields no pulled merge pairs (history, not this session''s merges); pairs whose ops never both reach the device are dropped after 3 cycles.'
---

<intent-contract>

## Intent

**Problem:** Two devices writing the same sheet converge by last-writer-wins on server `seq`, so a later "C" silently erases the other engineer's "NC" (and a later clear erases a filled cell); nothing tells the user a merge happened.

**Approach:** A pure kernel merge (`packages/domain/src/merge/`) runs inside `applyOp` for the `sheet/*` families, keyed on `op.prev_op_id` versus the cell's head op, so the device fold (`materializeEntity`) and the server (`applyOneIn`) compute the same row and replay stays byte-equal. Each concurrent pair becomes a kernel-derived `MergeInfo` entry kept in the sync engine's memory for the tab session, counted by `syncCounts` and shown as a minimal Sync status row. Also: a second user per e2e worker company, ledger 1161 (atomic client batches), 334 and 370.

## Boundaries & Constraints

**Always:**
- Coordinator decisions in `epic-10-context.md` (Conflicts 1-4 and 13, "Coordinator decisions") are binding: merge in the kernel fold on both sides keyed on `prev_op_id`; the seq-later free text wins except the NC device's observation; `merge_info` lives in engine memory for the session (a reload clears it; never an entity, never synced) and is an explicit input of `syncCounts`; contract bump `CONTRACT_VERSION = 10`, `MIN_CONTRACT_VERSION = 10` with a dated note in `contract/version.ts` (re-bump to main + 1 if main moved at merge time).
- A pair is "concurrent" when the target cell exists and `(op.prev_op_id ?? null) !== (cell.merge?.head_op_id ?? cell.op_id)`, the op is a `put` on a `sheet/*` family, and `op.device_id !== SERVER_DEVICE_ID`. Everything else folds exactly as today.
- Rules for a concurrent `sheet/*` put, evaluated in this order (the `MergeRule` names are the contract):
  1. `same_value`: equal values: the incoming op applies; no info entry.
  2. `filled_over_empty`: exactly one side is empty (`null`, absent, or a string that trims to `''`): the filled side stands, whichever arrives later.
  3. `nc_over_c`: `sheet/checklist … result` with `{NC, C}`: NC stands, whichever arrives later.
  4. `nc_observation`: `sheet/checklist … observation` where the item's result cell is NC and carries a `merge` record: the NC device's observation stands. The NC device is `merge.device_id` when `merge.kept === false`, and "any device but `merge.device_id`" when `merge.kept === true`.
  5. `latest_text`: free text (`sheet/checklist … observation`, `sheet/observations`, `sheet/conclusion text`): the incoming (seq-later) op applies; the entry keeps the overridden text.
  6. `contradiction`: any other two different filled values (C vs NA, NC vs NA, two readings, two conclusions, two nameplate values). Story 10.1 applies the incoming (seq-later) op and emits NO info entry; Story 10.2 (batch X) turns this branch into the cell `conflict` state. `mergePolicy` must return this outcome from one place so X changes one branch.
- Cell shape: `cellSchema` gains an optional `merge: {head_op_id, device_id, kept, rule}` written only by a concurrent fold. `op_id`, `value` and `source_suggestion_id` are always the standing value's op (AD-12 provenance unchanged); `head_op_id` is the latest op folded at the path (the server's "latest op on the path"), `device_id` that head op's device, `kept` true when the head op was merged away. A later sequential put replaces the cell without `merge`.
- Non-cell families (block, location, equipment, file caption, point, setup) keep last-writer-wins by `seq`; their concurrent pairs (push `superseded`, or pulled ops detected the same way) still become info entries with rule `latest_edit`. Additions from both devices are distinct entities and are already kept; photos keep `numberPhotos` order (`captured_at`, `local_seq`, `id`).
- Texts are kernel-derived (`packages/domain`), pt-BR; the story example is verbatim: `SEC-C12: item 10 NC de Eduardo (com foto) mesclado` (TAG, item number as the sheet shows it, standing value, author name of the standing value, `(com foto)` when a live photo file carries that `block_id` + `item_key`). Other texts are `// authored:`.
- Tests: api integration tests through the sync route; Playwright with two browser contexts, two users of the same worker company, "Sincronizar agora" (never the timer); every `@p0` asserts the committed cell in IndexedDB on BOTH devices and the server row.

**Never:**
- No server-emitted merge ops; `superseded` stays information. No Dexie store or entity for merge info. No change to `client_ts` semantics (display and audit only).
- No conflict state, banner, Conflict view, block-removal or duplicate-TAG handling (Stories 10.2, 10.3), no full Sync status surface, "Como funciona" or `.sync-summary` (Story 10.4). Do not remove `supersededCount`/`supersededText` (10.4 replaces them).
- No PARALLEL_WORKERS change. No host pnpm/node.

## I/O & Edge-Case Matrix

| Scenario | Input / State (X = cell op both devices last saw) | Expected Output / Behavior |
|----------|--------------|---------------------------|
| NC vs C, NC first | E: result NC + obs "a" + photo, pushed; A: result C + obs "b" (prev X) pushed later | Server and both devices: result NC (op = E's), obs "a"; photo file kept; A's push `superseded`; info entry on both devices |
| NC vs C, C first | Same, A pushes first | Same final row (commutative) |
| Filled vs empty | E fills a test cell "12,5"; A clears it (put null, prev X) later in seq | "12,5" stands; entry `filled_over_empty` |
| Free text | Both edit `sheet/observations` | seq-later text stands; entry `latest_text` carries the overridden text and both `client_ts` |
| Deliberate override after merge | A sees NC (cell `merge.head_op_id` = A's C op), then taps C | prev = head, sequential: C applies, `merge` dropped |
| Contradiction | C vs NA on one item | seq-later applies (as today); no info entry (10.2 owns it) |
| Server op | `SERVER_DEVICE_ID` op on a path | never merged |
| Structure | Both devices add a block / move the same block | both blocks kept; the later move stands; entry `latest_edit` for the move |
| Replay | Any of the above | device `materializeEntity` row deep-equals the server row |

</intent-contract>

## Code Map

- `packages/domain/src/ops/apply.ts` -- `applyOp` (:352), `writeRow` sheet branch (:283-291), `putSheet` (:158), `cellOf` (:79), `readPath` (:209). The merge hooks in the sheet branch: read the current cell, call the kernel policy, write the standing cell with its `merge` record.
- `packages/domain/src/ops/materialize.ts` -- device fold: remote in `seq` order, then local by `op_id`. No change expected; it is why the fold must decide from row state only.
- `packages/domain/src/schemas/entities.ts:40-44` -- `cellSchema` (non-strict `z.object`; add optional `merge`).
- `packages/domain/src/ops/op.ts:14,37` -- `prev_op_id` comment "recorded, never interpreted": update it.
- `packages/domain/src/ops/path.ts:42-45` -- `CHECKLIST_FIELDS`, `CONCLUSION_FIELDS` (`restriction` is an enum, not free text).
- `packages/domain/src/sync/counts.ts:54` -- `syncCounts(outbox, reading)`: add a third input (merge entries) and a `merged` count; `supersededText` (:137) stays.
- `packages/domain/src/relatorio/ficha.ts:152`, `block-texts.ts` -- checklist values and TAG texts; find the existing helper for the item number the sheet shows (definition order) and the block's TAG label, reuse them.
- `packages/domain/src/contract/version.ts:48,80` -- bump both to 10 with the dated note.
- `apps/api/src/sync/apply.ts` -- `applyOneIn` (:330-424) already computes `supersededOver` from the latest op on the path; no merge code needed here beyond `applyOp`. `applyOps` (:492+) per-op refusal (E6-A1 comment) is where ledger 1161 goes; `SERVER_DEVICE_ID` import source is here.
- `apps/web/src/sync/engine.ts` -- `pushPhase` (:250-265; `status.supersededCount`), `pullStream` (:419-457), status shape (:60-74, :182). Merge entries: push pairs from `response.superseded`, resolved after the cycle's pull (the over op may only arrive then); pulled pairs from ops of another device whose `prev_op_id` is not the previous `remote_ops` op on that path (the server's superseded rule restated in a kernel function). Dedupe by `(op_id, over_op_id)`.
- `apps/web/src/sync/policy.ts:78` -- `batches(items, size)` splits pushes by count only; keep a `batch_id` group in one push (1161).
- `apps/web/src/db/sync-store.ts:72-100` -- `applyPulled`, `rematerialize`; `apps/web/src/db/commit.ts:123` -- `lastAppliedOpId` (the device's prev stamping: already equals the head semantics).
- `apps/web/src/state/sync.tsx:219,295` -- `counts`, `supersededCount`; expose the entries and their row texts (built by the kernel from IndexedDB rows: block, equipment, user, files).
- `apps/web/src/surfaces/sync/sync-status-surface.tsx:68-95` -- existing superseded row; render one `li.sync-row` per merge text (`.sr-primary`), classes from `prototype/screens/85-sync.html` lines 111-135 (grep, do not read whole).
- `apps/api/src/db/e2e-worker-seed.ts`, `e2e-leak-check.ts` -- one user per company today; ids `e2e00000-00a1-…`, `USER_ID` regex, `E2E_WORKER_USER_LIKE`, the leak regexp `00[ab]1`. Find where the seed is written (global setup) and the Playwright login helpers (`e2e/support/merged-fixtures.ts`).
- Tests to extend: `apps/api/src/sync/template-convergence.integration.test.ts:142`, `replay.integration.test.ts`, `porto-seguro.integration.test.ts`, `packages/domain/src/ops/apply.test.ts`, `materialize.test.ts`, `packages/domain/src/sync/counts.test.ts`, `apps/web/src/sync/engine.test.ts`, `surfaces/sync/sync-status-surface.test.tsx`; two-context e2e pattern `e2e/templates.spec.ts:452-500`, helpers `e2e/support/sync.ts:34-68`, `outbox.ts:138-219`.
- Ledger: `_bmad-output/implementation-artifacts/deferred-work.md` entries at lines ~334 (registry merge residue), ~370 (two `empresa` rows), ~1161 (per-batch atomic apply).

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/merge/` (new: `policy.ts`, `info.ts`, `index.ts`, tests) -- export exactly these names: `MergeRule` type; `isConcurrent(op, cell)`; `mergePolicy(input) -> MergeOutcome` (`{kind: 'sequential'} | {kind: 'apply' | 'keep', rule} | {kind: 'contradiction'}`); `mergeCell(current, op, context) -> Cell` used by `applyOp`; `MergeInfo` type (`op_id, over_op_id, relatorio_id, block_id, path, rule, standing: {value, op_id, actor_id}, overridden: {value, actor_id, client_ts} | null`); `mergeInfoOf(op, overOp, rowAfter) -> MergeInfo | null` (null for `same_value` and `contradiction`); `pulledMergePairs(previous, pulled, ownDeviceId)`; `mergeInfoText(info, context) -> string`. Re-export from the package index. -- one kernel owner (AD-2).
- `packages/domain/src/schemas/entities.ts`, `ops/apply.ts`, `ops/op.ts` -- optional `merge` on cells; fold calls `mergeCell` for `sheet/*` puts. -- the merge on both sides.
- `packages/domain/src/sync/counts.ts` -- `syncCounts(outbox, reading, merges = [])` adds `merged`. -- AC "read by syncCounts".
- `packages/domain/src/contract/version.ts` -- 10/10 with the dated note. -- older `applyOp` diverges.
- `apps/web/src/sync/engine.ts`, `state/sync.tsx`, `surfaces/sync/sync-status-surface.tsx` (+ `sync.css` only if needed) -- in-memory entries, row texts, minimal rows under the superseded row. -- the visible information row.
- `apps/web/src/sync/policy.ts` + `apps/api/src/sync/apply.ts` -- ledger 1161: a push never splits a `batch_id` group (unless one group alone exceeds `SYNC_PUSH_MAX_OPS`); on the server a permanent refusal of any op of a multi-op batch in one push rolls back that batch's ops only (savepoint per multi-op batch, never per op; measure the Porto Seguro replay test time before/after and report it) and answers every op of the batch `op_invalid`. Api integration test through the sync route.
- `apps/api/src/db/e2e-worker-seed.ts`, `e2e-leak-check.ts`, global setup, e2e support -- a second user in company A of each pair: name `Eduardo Esteves`, id `e2e00000-00a2-7000-8000-{i}`, e-mail `e2e-w{i}-a2@teste.local`, same password; exported as `SeedAccount.colleague` (company A only) plus an e2e helper that opens a second browser context signed in as the colleague (name it `colleagueContext`, export from `e2e/support`). Widen the regex, LIKE pattern and leak regexp so the colleague is checked like the first user; add a unit test of the leak rule for the colleague.
- `e2e/merge.spec.ts` (new) -- `@p0`: the NC/C merge with photo and observation (Ana on one context, Eduardo on the other, both offline-edit, Eduardo syncs first, then Ana, then Eduardo again): IndexedDB cell on both devices, server row via the api, the Sync status row text on both. `@p0`: filled-over-empty on a test cell. `@p1`: free text latest wins and the entry carries the overridden text; `@p1`: two block additions both kept and a same-block move (latest stands). Add the spec to `SERIAL_SPECS` only if it times taps or shares the queue.
- `deferred-work.md` -- 1161 closed by this story; 334: prove with a test that the pulled `system:registry` remove tombstones the minting device's merged-away row, then close it (else re-own with the reason); 370: not covered by the fold (two distinct `empresa` entity ids), re-own with the reason (company singleton rule, owner Epic 11 or Matheus) -- strike the old state, add the dated new one.

**Acceptance Criteria:**
- Given two devices of one company on one sheet, when the NC device and the C device push in either order and both run "Sincronizar agora", then the server row and both devices' IndexedDB rows hold result NC with the NC device's `op_id`, the NC device's observation, and its photo file, and the device and server rows deep-equal.
- Given a concurrent put pair on any `sheet/*` path, when the api replays the log (`replay.integration.test.ts` pattern), then the materialized rows are byte-equal to the device fold, and the Porto Seguro golden stays unchanged.
- Given a merge by rule, when the Sync status surface opens on either device, then it lists `SEC-C12: item 10 NC de Eduardo (com foto) mesclado` for that merge, `syncCounts(...).merged` counts it, and a reload clears it.
- Given a device that lost the NC/C merge, when its user taps C again after seeing NC, then C applies on both devices (no repeated merge).
- Given a push holding a multi-op batch where one op is refused, when the route answers, then no op of that batch is applied and each is `op_invalid`, while ops of other batches in the push apply.
- Given the e2e run, when the leak check runs at teardown, then it passes with the colleague writing into company A, and would fail if the colleague wrote into another worker's pair (unit test).

## Design Notes

Why the head is stored on the cell: the device stamps `prev_op_id` with the latest op on the path (`lastAppliedOpId`), and the server's `superseded` compares with the latest op on the path. When a merge keeps the older value, `op_id` stays the standing value's op, so without `merge.head_op_id` the losing device's next deliberate tap would look concurrent forever and could never change the cell.

Fixtures: the Porto Seguro and replay-small op logs stamp `prev_op_id: null` (`fixtures/porto-seguro/op-log.ts:660`, `replay-small/op-log.ts:431`). If a log writes one path twice, the second put would now fold as concurrent; fix the log builder to stamp the previous op on that path (what a real device does), never the golden.

Known limits (list them in the spec's deferred section and the PR as open questions, do not solve): an observation written by the C device BEFORE its C result is not caught by `nc_observation`; the undo of a merged-away put writes its inverse with `prev_op_id = op.op_id`, which is the head, so it applies (clearing the other side's value); `de {nome}` names the standing value's author even when that is the viewer (no "você" form, open question); whether an NC vs NA pair should merge is open (treated as a contradiction).

## Verification

**Commands** (inside the worktree, compose project `fasor-e10m`):
- `docker compose --profile tools run --rm tools pnpm test:unit -- packages/domain/src/merge` -- green
- `docker compose --profile tools run --rm tools pnpm test:api` -- green, including the new integration tests and the replay/Porto Seguro ones
- `docker compose --profile tools run --rm tools pnpm test:e2e -- --grep merge` -- green
- A mutation run: make `mergePolicy` return `sequential` for every pair, show the api merge test and `e2e/merge.spec.ts` @p0 red, restore.
