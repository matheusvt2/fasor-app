---
title: 'Review fixes: kernel fold, location tree and device outbox performance'
type: 'refactor'
created: '2026-09-30'
status: 'in-review'
baseline_revision: '6b219098f2881aee6487cd57bfc8396b76141ea8'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/AGENTS.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_why: 'Review-fix batch rfp of 2026-09-30: one PR for the kernel fold, location-tree and device outbox findings the coordinator assigned to this batch (review-fixes-2026-09-30-context.md).'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The full review of 2026-09-30 (`reviews/full-review-2026-09-30/1-code-quality.md` in the main checkout, `/home/matheus/Documentos/fasor/_bmad-output/implementation-artifacts/reviews/full-review-2026-09-30/1-code-quality.md`) measured super-linear hot paths: `applyOp` re-parses the whole row through zod on every op (97% of the fold), the location tree is rebuilt per block and per call (O(b^2) per relatório), and the device outbox is never pruned and is read whole on every commit, with several whole-table live reads behind the Sync provider. The audit (`audit-2026-09-30-stories-vs-code.md` 1.4) also found no Dexie `toSnapshot` byte-equality test on the Porto Seguro fixture.

**Approach:** Fix findings K-1, K-2, K-6 to K-11, K-15 to K-20, W-1 to W-8, W-10, W-11, W-24 to W-27 and audit 1.4 exactly as each finding proposes (read the finding text first; it carries file:line and the fix), each with a test that fails before the fix; keep the op contract and every golden byte-identical.

## Boundaries & Constraints

**Always:**
- `CONTRACT_VERSION` / `MIN_CONTRACT_VERSION` unchanged; every golden under `packages/domain/fixtures/**` and every `*.golden.json` byte-identical (never regenerate one). `applyOp` still throws on an op whose value breaks the row schema (same error class as today) and still returns a new map with unchanged rows keeping identity.
- Dexie: versions are append-only; add ONE new `version: 6` entry (indexes only, `upgrade: stamp(6)`), never edit versions 1-5. An upgrade test opens a v5 database holding rows (`openDatabase(id, { upToVersion: 5 })`), reopens at latest, and reads through every new index.
- Ownership (AGENTS.md): every rule (e.g. which outbox rows may be pruned, the retention) lives in `packages/domain`; `apps/web` stores and reads.
- Files owned by this batch: `packages/domain/src/{ops/,relatorio/tree.ts,relatorio/sheet-progress.ts,relatorio/sumario.ts,relatorio/pre-issue.ts,points/,print/,schemas/}`, `apps/web/src/db/**`, `apps/web/src/state/**`, `apps/web/src/sync/**`, `apps/web/src/surfaces/sync/**`, plus the specific files the findings name (`components/crop-thumb.tsx`, `files/photo-import.ts`, `files/photo-encode.ts`, `text/hash.ts` for K-7, `relatorio/progress.ts`, `relatorio/cabine.ts`, `seed/definitions.ts`, `merge/*`, the dead-export files of K-19). Outside these, only one-line `useSync()` -> `useSyncActions()` swaps (W-8) and dead-code deletions (W-27).
- Every fix gets a test in the project's style (Vitest beside the file; `fake-indexeddb` for Dexie as existing `db/*.test.ts` do).

**Never:**
- Do not edit `apps/api/**`, `apps/web/src/surfaces/**` (except the W-8/W-27 exceptions above), `apps/web/src/copy/**` beyond removing the one dead key of W-27, `packages/domain/src/{relatorio/section-variables.ts,checks/,format/,home/}` (batch `rff`), `e2e/**` (batch `rft`), `sprint-status.yaml`, `epics.md`.
- No `files.acked` boolean-to-0/1 migration (section 4 suggestion): 60 read/write sites incl. e2e helpers owned by `rft`; list it as known open.
- No behaviour change a user can see: same texts, same counts, same order, same sync results.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sheet put fold | 3526 Porto Seguro sheet puts | same rows as today (goldens), fold time well below the baseline | a put whose cell breaks `cellSchema` throws as before |
| Tree memo | same `blocks`/`locations`/`equipment` arrays, two calls | second call returns the cached tree (same identity) | new array (a commit) -> rebuilt once |
| Outbox prune | acked row, pulled back into `remote_ops`, `client_ts` older than the retention | deleted by the prune | pending/sent/dead rows, acked rows not pulled back, and rows younger than the retention are kept |
| Undo after prune window | batch younger than retention | `undoBatch` still finds all its rows | - |
| "Sincronizar agora" during a cycle | `runCycle` busy | a follow-up fresh cycle runs after it (not the 60 s tick) | never rejects |
| Engine public call on a closed db | Dexie throws mid-cycle | resolves to a failure result, no unhandled rejection | - |
| v5 -> v6 upgrade | v5 db with entities, outbox, remote_ops rows | opens at v6, rows intact, new indexes answer | - |

</intent-contract>

## Code Map

Kernel (`packages/domain/src`):
- `ops/apply.ts:426-449` `applyOp`; `:439` full-row re-parse (K-1); `:249-279` `putSheet`, `:102` `cellOf`, `:116` `attributed`; `:337` dead `?? emptySheet()` (K-11). `schemas/entities.ts:77` `cellSchema`, `:367` `sheetSchema`, `:420` `blockRowSchema`, `:35-36` `fieldValueSchema` (K-10), `:617 entitySchema` (K-19). `ops/op.ts:64` `opMetaSchema` loose (K-10, comment).
- `ops/replay.ts`, `ops/materialize.ts:41` `sort(byOpId)` (K-8; the device comparator is `apps/web/src/db/commit.ts:129 byClientTsThenOpId` -- move it to the kernel, re-export from commit.ts).
- `relatorio/tree.ts:210-285` `locationTree` (K-16: `locationBlocks` filter per location `:200`, children filter, `locationProgress` in `relatorio/progress.ts:117-121` with `descendantLocationIds` `:101-115`); `:321` `firstInTree` (K-2); `sheet-state.ts:43` `sheetState` parses `block.config` each call.
- `relatorio/sheet-progress.ts:125-129` `isCabineFirstSheet`, `:174` `sheetProgress`, `:277-280` `joinPtBr` (dup of `text/plural.ts:7-10 listPtBr`, K-20).
- `points/summary.ts:36-38` `pointTitle` (K-15). `relatorio/sumario.ts:191,205` and `pre-issue.ts:373,392` (K-17, tree built 4-5x); `parecer.ts:146,207-208` (3x). `pre-issue.ts:379` loop-invariant break (K-6); `pre-issue.ts:163-166` and `relatorio/cabine.ts:47-53` swallowed seed failure (K-9). `text/hash.ts:9` `canonicalJson` undefined member (K-7). `print/section-9.ts:662-670` unused O(p^2) `layoutPhotoIds` (K-18). K-19 and K-20 lists: finding text.
- Timing script: `test-results/full-review-2026-09-30/kernel-timing.ts` (gitignored copy in this worktree); baseline in the same folder `kernel-timing.txt` (review) and `.scratch-rfp/kt-before-rfp.log` (this batch, tree at `origin/main`).

Device (`apps/web/src`):
- `db/schema.ts:170-215` `VERSIONS` (add v6: `entities: '[entity+id], entity, relatorio_id, project_id, [entity+relatorio_id]'`, `remote_ops: 'op_id, seq, *targets, relatorio_id, project_id, [path+seq], [relatorio_id+seq]'`, `outbox: 'op_id, status, path, client_ts, batch_id, *targets, seq, relatorio_id'`); `schema.test.ts` holds the existing upgrade tests.
- `db/commit.ts:65-107` `applyOne` (W-2: remove the coalesce branch and its `orderBy('client_ts').last()` read), `:143-150` `lastAppliedOpId` (W-3), `:349` `undoBatch`.
- `db/sync-store.ts:85-110` `applyPulled` (W-26 `rows.find` in loop; prune hook), `:171` `outboxRows` (W-1: read `where('status').anyOf(['pending','sent','dead'])`), `:282 remoteOpRows` dead (W-27), `:292 notTestedSynced` (true when no row: stays correct after a prune).
- `db/generate-store.ts:70-78` `editedSinceSnapshot` (use `[relatorio_id+seq]` where it narrows), `:96` `lastOpIdFor` (use the `relatorio_id` outbox index), `:125 useGenerationJob` dead (W-27). `db/decision-store.ts:69-90` `heldDecisions` (W-5), `db/suggestion-store.ts:201-227` `readingCountRows` (W-6), `db/photo-store.ts:53-88` `photoTiles` N+1 (W-7), `db/file-store.ts:82-92,122-146,180-206` (W-25), `:168 localUploadError` dead (W-27).
- `state/sync.tsx:289-451` SyncProvider (W-1 rows, W-4 `syncNow`/`resendDead` at `:356,365-369`, W-8 context split). `sync/engine.ts:565` `runCycle` busy, `:629-632` `fireCycle` wrapper, `:673-708` `syncRelatorio`/`syncProject`/`runFreshCycle` (W-4, W-10).
- `components/crop-thumb.tsx:47-64,92` (W-11: one object URL/decode per source shared by every `CropThumb` of the same file, refcounted, released when the last unmounts). `files/photo-import.ts:96`, `files/photo-encode.ts:62` (W-24).
- W-27 dead: `surfaces/registries/registry-tab-placeholder.tsx` + its `copy/ui.ts:171` key, `surfaces/relatorio/relatorio-ops.ts:28` re-export (delete only when grep proves no importer).
- Audit 1.4: `db/porto-seguro-fixture.test.ts:37-55`, pattern at `db/commit.test.ts:70-83`, golden `packages/domain/fixtures/porto-seguro/snapshot.golden.json`, `db/snapshot.ts:12 toSnapshot`.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/ops/apply.ts` -- K-1: in the `sheet/*` branch, validate only what the op adds (the written cell through `cellSchema`, and the attribution columns incl. a `removal_conflict` through a picked block schema) and skip the whole-row parse; every other family keeps the full-row parse. K-11: drop the dead fallback. The timing script is the benchmark (no benchmark test); add a unit test that a sheet put whose value is not a JSON value (e.g. `undefined` or a `Date`) still throws, as it does today.
- `packages/domain/src/relatorio/tree.ts`, `relatorio/progress.ts`, `relatorio/sheet-state.ts` -- K-16: bucket blocks by `location_id` and children by `parent_id` once per build; per-location counters from the bucketed subtree; memoize `sheetState`/`enabledSubBlocksOf` per block object (WeakMap). K-17/K-2: memoize `locationTree` per input identity (nested WeakMaps on `snapshot.blocks`, `snapshot.locations`, the `equipment` argument, `snapshot.relatorio` or a sentinel, `pending` or a sentinel). K-2: `firstInTree` becomes a direct O(l + b) scan in the tree's own order (the cabine's live equipment blocks by `order_key`, then its live child locations in `order_key`, depth first) with no tree build. Search the kernel tests for in-place mutation of snapshot arrays before memoizing; a test that mutates must build a new array instead.
- `packages/domain/src/points/summary.ts` -- K-15: `pointTitle` finds the equipment node through a per-tree index (`Map<equipmentId, node>`, memoized on the tree array).
- `packages/domain/src/relatorio/sheet-progress.ts`, `sumario.ts`, `pre-issue.ts`, `parecer.ts` -- K-17 falls out of the memo; K-6 hoist; K-9 per finding (throw only if the snapshot schema guarantees a known seed, else a typed row; never a silent `[]`/`null` that hides a check); K-20: `joinPtBr` -> `listPtBr`, `sectionBlocks`/`liveSections` one helper, `findDefinition(seedVersion, blockType): BlockDefinition | null` beside `seed/definitions.ts:89` used by the copied try/catch wrappers, `schemas/snapshot.ts` actor collection once, `canonical` vs `canonicalJson` one implementation (output byte-identical: goldens), `merge/conflicts.ts:428-433` vs `merge/info.ts:189-195` one lookup. `parseCalendarDate`/`splitDate` pair is `rff`'s files: leave, list as known open.
- `packages/domain/src/text/hash.ts` -- K-7: `undefined` array member -> `null`, with a test.
- `packages/domain/src/ops/materialize.ts` -- K-8: local ops ordered by `client_ts` then `op_id` (kernel comparator), with a test of a later put carrying a smaller id.
- `packages/domain/src/schemas/entities.ts`, `ops/op.ts` -- K-10: a comment stating the choice (any JSON by design until a per-AD-11 union; meta keys open on purpose), no schema change.
- `packages/domain/src/print/section-9.ts` and the K-19 list -- K-18/K-19: delete the dead exports (and their test-only cases); keep a symbol when an in-file caller needs it (un-export). Skip `relatorio/section-variables.ts:67 section3Text` (`rff`), list it.
- `packages/domain/src/ops/outbox.ts` (or `sync/`) -- W-1 rule: `OUTBOX_ACKED_RETENTION_MS` (10 minutes, well past the 6 s undo toast, `state/toast.tsx:11`) and `prunableOutboxRow(row, { pulledBack, now })`: true only for `acked` rows the server log holds on this device and older than the retention.
- `apps/web/src/db/schema.ts` -- v6 indexes (Code Map) + upgrade test in `schema.test.ts`.
- `apps/web/src/db/sync-store.ts` -- W-1: `pruneOutbox(db, now)` deleting prunable rows in one `rw` transaction over `outbox` and `remote_ops`, called by the engine at the end of every cycle; `outboxRows` reads only pending/sent/dead; W-26 Map by `op_id`; W-27 delete `remoteOpRows`.
- `apps/web/src/db/commit.ts` -- W-2 remove the coalesce branch (keep the kernel `coalesce` and its tests); W-3 `lastAppliedOpId` reads the remote head through `[path+seq]` in reverse with the `sameSlot` filter and `.first()`; `byClientTsThenOpId` from the kernel.
- `apps/web/src/db/{decision-store,suggestion-store,photo-store,file-store,generate-store}.ts` -- W-5, W-6, W-7, W-25 per the findings through `[entity+relatorio_id]` and `bulkGet`; W-5 groups blocks by relatório once and skips relatórios with no conflict mark and no duplicate; `lastOpIdFor` via indexes; W-27 dead code.
- `apps/web/src/sync/engine.ts` -- W-4 expose a public fresh-cycle method; W-10 `runCycle`, `syncRelatorio`, `syncProject` (and the fresh one) never reject (resolve to the existing failure result); call `pruneOutbox` after each cycle.
- `apps/web/src/state/sync.tsx` -- W-4 `syncNow` and `resendDead` use the fresh cycle; W-8 split: a `SyncActionsContext` holding the stable callbacks (`syncNow`, `syncRelatorio`, `syncProject`, `resendDead`, `retryUpload`, `fetchFile`, `generate`, `preview`, `rereadPhoto`) with `useSyncActions()`; `useSync()` keeps returning the merged shape; swap action-only consumers (`crop-thumb.tsx`, `photo-viewer.tsx`, `instrument-panel.tsx`, `empresa-tab.tsx`, `gallery-surface.tsx`, `export-dialog.tsx`) to `useSyncActions()`.
- `apps/web/src/components/crop-thumb.tsx` -- W-11 shared refcounted source per file id.
- `apps/web/src/files/photo-import.ts`, `photo-encode.ts` -- W-24: thumb drawn from the resized canvas; EXIF read once from the converted head; tests keep passing with the injected `convertHeic`.
- `apps/web/src/db/porto-seguro-fixture.test.ts` -- audit 1.4: `applyPulled(db, portoSeguro.log)` then `serializeSnapshot(await toSnapshot(db, portoSeguro.relatorioId))` equals the serialized golden.

**Acceptance Criteria:**
- Given the Porto Seguro fixture, when `kernel-timing.ts` runs, then `replay(log)` and `applyOp x 3526` medians drop at least 3x against `.scratch-rfp/kt-before-rfp.log`, and `sheetProgress(snapshot, id) x 94` and `isCabineFirstSheet x 94` drop at least 10x, with every golden test green.
- Given a Dexie database fed the Porto Seguro log through `applyPulled`, when `toSnapshot` runs, then its serialization equals `snapshot.golden.json` byte for byte.
- Given acked ops pulled back and older than the retention, when a sync cycle ends, then they are gone from `outbox`; given any other row, then it stays; and the Sync counts, Home cards, `lastAppliedOpId`, `undoBatch` (within the window), `notTestedSynced`, `editedSinceSnapshot` and `lastOpIdFor` answer as before (unit tests per reader).
- Given a v5 database with rows, when the app opens it, then it upgrades to v6 with every row intact and the new indexes return the expected rows.
- Given a cycle in flight, when "Sincronizar agora" or "Reenviar" is pressed, then a fresh cycle runs right after it; given a closed database, when any public engine method runs, then it resolves (no unhandled rejection).
- Given a keystroke commit on the ficha, when the Sync data changes, then components using only `useSyncActions()` do not re-render (a render-count unit test).
- Given the mutation rule, when the prune's "pulled back" guard or the W-4 fresh-cycle call is reverted, then a named test goes red (record both in the report).

## Spec Change Log

## Review Triage Log

## Design Notes

The tree memo keys on array identity, which the web's incremental snapshot builder (`schemas/snapshot.ts:209-345 createSnapshotBuilder`) keeps across commits for untouched arrays; a commit yields a new `blocks` array, so each keystroke pays exactly one tree build (today three in `use-ficha-data.ts:64-67`, a fourth on "Concluir"). Callers wrapping the same arrays in a fresh object (`{ blocks, locations, equipment }`) still hit the cache because the key is the arrays, not the wrapper.

K-1 is safe because the row a sheet put starts from was itself produced by a parse (create) or a previous validated write; the only new data is the cell and the attribution columns, which is what gets validated.

Open questions (keep current behaviour, list in the PR): none known at planning time.

## Verification

**Commands (inside the tools container: `docker compose --profile tools run --rm tools <cmd>`, logs to `.scratch-rfp/`, read tails only):**
- `pnpm test:unit` -- expected: green, goldens untouched (`git status packages/domain/fixtures` clean).
- `pnpm test:api` -- expected: green (applyOp change reaches the api push).
- `pnpm lint` and `pnpm static` -- expected: green.
- `pnpm exec tsx test-results/full-review-2026-09-30/kernel-timing.ts` -- expected: the AC numbers.
- Do NOT run `pnpm verify`, `test:e2e*` or the perf spec; the orchestrator runs the gates under the host lock.
