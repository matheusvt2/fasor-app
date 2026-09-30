# Full review 2026-09-30, front 1: code quality

Read-only review of `main` at `be25ae7`. Method: the kernel fold, snapshot build, derivation hot paths, web commit path, api apply loop and export routes were read directly and timed; six package sweeps (kernel, web, api, e2e and scripts, OCR service, infra and compose) reported findings which were each re-read at the cited lines before entering this file. Line numbers are as of `be25ae7`. Measurements: `test-results/full-review-2026-09-30/kernel-timing.ts` (run in the `tools` container; output in `kernel-timing.txt`); duplication: `jscpd-report.json` and `jscpd-source-clones.json` in the same folder.

## Summary

| Severity | Count |
|---|---|
| high | 5 |
| medium | 33 |
| low | 46 |

Duplication (jscpd, 50-token minimum): 8.72% of all scanned lines (14238 of 163273), of which 4982 lines are golden JSON and most of the rest test harnesses. Source only (tests, fixtures and goldens excluded): 79 clone pairs, 855 lines: `packages/domain/src` 52 lines (0.2% of 22980), `apps/web/src` 636 (1.6% of 38779), `apps/api/src` 88 (1.1% of 8253), `e2e/support` 79 (3.4% of 2298), `scripts` 0. By hand, beyond jscpd's token window: the e2e specs repeat the same ten helpers in 4 to 24 files each (section 3).

Super-linear paths: `sheetProgress` and `isCabineFirstSheet` build the whole location tree per block (O(b) per call, O(b^2) per relatório); `locationTree` is O(l * (l + b)); `pointTitle` builds a tree per point; `lastAppliedOpId` on the device reads every op of the entity per commit; the api relatório pull is O(stream) per page (an OR of two indexed columns); registry creates on push load every live row of the kind; the device outbox is never pruned and is read whole on every write; `layoutPhotoIds` and `applyPulled` have O(n^2) `includes`/`find` loops. The fold is linear in ops but each op pays a full zod re-parse of its row (97% of the fold time).

Ownership rules (AGENTS.md): both write paths pass only target rows to `applyOp` (`apps/web/src/db/commit.ts:65-79`, `apps/api/src/sync/apply.ts:368-399`); the api has no reducer of its own (no `switch` over op kinds in `sync/apply.ts`; the only server-side transforms are the registry merge redirect, the reading-kind refusal and shape validation, none of which change what `applyOp` produces from a logged op). Both snapshot paths call the kernel builders. Seven surface rules in `apps/web` re-derive what the kernel should own (section 1.2, items W-15 to W-21). pt-BR strings: every production surface reads `copy.*` or `ui.*`; the only literals outside the three homes are eleven in the dev-only fixture route (`apps/web/src/surfaces/fixtures/field-fixture-surface.tsx:97-158`, tree-shaken by `import.meta.env.DEV`) and two in the api (A-25, A-26).

## 1. Logic errors and code quality

### 1.1 packages/domain (kernel)

K-1 `ops/apply.ts:439` — high — `next.set(target.key, entityRowSchemas[target.entity].parse(written))` re-parses the whole written row through zod on every op; for a `sheet/*` put that is the entire `BlockRow` with every cell. Measured: the 3526 Porto Seguro sheet puts cost 844 ms in `applyOp`, 823 ms of it the zod parse; `parsePath` and `targetsOf` are 30 ms each. The full `replay` takes 0.5 to 1.3 s on the desktop under load; on a tablet main thread (the first pull of a colleague's relatório, `applyPulled`) expect several seconds. It is the per-op cost of the api push as well (`apps/api/src/sync/apply.ts:383`). Fix: validate `op.value` per family at the boundary (creates already parse the row, line 328) and skip the row re-parse for the typed sheet branches; keep the goldens as the guard; add a fold benchmark.

K-2 `relatorio/sheet-progress.ts:128` and `relatorio/tree.ts:321` — high — `isCabineFirstSheet` calls `firstInTree`, which builds `locationTree(snapshot)` and flattens it. Measured: `sheetProgress` over 94 blocks is 666 ms with a full snapshot and 16.5 ms with `{ blocks }`; `isCabineFirstSheet` x 94 = 680 ms (7.2 ms each); `locationTree` alone 8 ms. The ficha hook `apps/web/src/surfaces/ficha/use-ficha-data.ts:64-67` runs `sheetProgress` (one tree), `nextSheet` (`sheetOrder`, one tree, `relatorio/ficha.ts:27`) and `isCabineFirstSheet` (one tree) on every snapshot change, so every idle-committed keystroke on a ficha pays three tree builds before the render; `use-ficha-actions.ts:140` a fourth on "Concluir". Fix: compute `firstBlockId` per cabine by a direct scan (first live equipment block by `order_key` on the cabine, then on its colunas), memoize `locationTree` on the snapshot object (the incremental builder keeps identity across commits), and let the hook pass `cabineFirst` into `sheetProgress`.

K-3 `checks/calibration.ts:40-42, 91` — medium — the "now" reference is the UTC calendar day (`now.toISOString().slice(0, 10)`) while every other date decision uses the America/Sao_Paulo day (`calendarDateOfInstant`, `format/datetime.ts:207`; `relatorio/pre-issue.ts:235`). Between 21:00 and 24:00 local the reference is tomorrow: a certificate valid until today reads `expired` in the registry and in the pre-issue row when the relatório has no service end. Fix: `servicePeriodEnd ?? calendarDateOfInstant(now)`.

K-4 `checks/calibration.ts:53` — low — `Date.UTC(year, month - 1 + intervalMonths, day)` overflows the day: `2026-01-31` + 1 month gives `2026-03-03`. Clamp the day to the target month's length (as `format/datetime.ts:115` does).

K-5 `home/cards.ts:159` — low — "same day" for the card stamp compares `dd/mm` only (`short.slice(0, 5)`), so a copy last synced on the same day-month of an earlier year shows the time alone. Compare `formatDateOfInstant` of both.

K-6 `relatorio/pre-issue.ts:379` — low — a loop-invariant `break` (`if (setup.service_end === null && now === null) break;`) sits inside the per-instrument loop after a `continue`; hoist the condition before the loop.

K-7 `text/hash.ts:9` — low — `canonicalJson` writes the text `undefined` for an `undefined` array member (objects drop them, line 12); latent, callers pass JSON. Map `undefined` to `null`.

K-8 `ops/materialize.ts:41` — low — the device's unpulled ops are folded in `op_id` order (`sort(byOpId)`), correct only because `uuid.v7()` is monotonic within one process; a second tab could mint a smaller id for a later put. Sort by `client_ts` then `op_id` (`byClientTsThenOpId`, `apps/web/src/db/commit.ts:129`) or document the single-writer assumption.

K-9 `relatorio/pre-issue.ts:163-166` and `relatorio/cabine.ts:47-53` — low — a seed-resolution failure returns `[]` / `null`, so `section_variables` rows vanish and every cabine reads "complete". Let it throw (the snapshot schema guarantees a known seed) or return a typed row. 32 bare `catch {}` around `getDefinition`/`getSeed` exist; these two hide a check.

K-10 `schemas/entities.ts:35-36` — low — `fieldValueSchema = jsonValueSchema` with the comment "any JSON until Story 3.1": every cell value is unvalidated at apply time and each reader re-derives the shape (`reading-cells.ts:204-215`, `conclusion.ts:169`, `section-9.ts:193`, `conflicts.ts:499`). Either a union per AD-11 or a comment stating the choice. `ops/op.ts:64` `opMetaSchema = z.looseObject(...)` accepts unknown meta keys, which `ops/outbox.ts:14-15` then treats as a reason not to coalesce.

K-11 `ops/apply.ts:337` — low — `sheet: block.sheet ?? emptySheet()` is dead: `blockRowSchema` requires `sheet` (`schemas/entities.ts:432`) and line 328 already parsed it.

K-12 `format/datetime.ts:156-167` (`formatServiceDates`) vs `:175-186` (`dateRangeText`) — medium — two range formatters for the same input with different output (`28/07/2026 – 02/08/2026` vs `28/07–02/08/2026`): Home cards and the document control use one, the Sumário and the Project the other, so one period reads two ways. One implementation with a `style` parameter; also the JSDoc at 96-100 describes `formatServiceDates` but sits on `formatCalendarDate`.

K-13 `relatorio/tree.ts:133-142` (`notTestedReasonText`), `relatorio/parecer.ts:105-117` (`notTestedReason`), `points/derived.ts:36-47` (`reasonOf`) — medium — three readers of `block.not_tested` against the seed's reasons, each with its own "Outro"/typed-text rule (one lower-cases, one prefers `justification`). One `notTestedReasonOf(block)` in `relatorio/not-tested.ts` returning `{ key, label, typed, justification }`.

K-14 Story 4.7 restore defect (audit item, confirmed) — medium — `relatorio/section-variables.ts:95-96` writes `section_text: null`; the surface then shows `defaultSectionText(seedVersion)` (`apps/web/src/surfaces/relatorio/section-text-surface.tsx:97-98`), but instantiation copied the template's own text (`relatorio/instantiate.ts:105`), which the composer lets the user edit (`template-composer.tsx:369, 516`). A customised template text is lost on "Restaurar texto do template". Fix: keep `template_section_text` in the block config at instantiation and restore to it. The whole-config put is by design (`BLOCK_FIELDS` has no sub-path) but makes two devices editing different config keys last-writer-wins on the object; a merge-granularity limit worth a note.

K-15 `points/summary.ts:36-38` — medium — `pointTitle` builds and flattens the whole `locationTree` per call; called per card render in `apps/web/src/surfaces/points/points-surface.tsx:288` (unmemoized) and per point in `print/section-8.ts:130`. Index equipment nodes once.

K-16 `relatorio/tree.ts:254-258` — medium — `locationTree` is O(l * (l + b)): per location `locationBlocks` filters every block (200-202), `locations.filter(parent_id)` scans all locations, and `locationProgress` (`relatorio/progress.ts:117-121`) runs `descendantLocationIds` (101-115, a fixed-point loop, O(l^2) worst) and filters every block again; `sheetState` (which zod-parses `block.config` each call, `sheet-state.ts:43`) runs several times per block per tree. Bucket blocks by `location_id` and children by `parent_id` once, memoize `enabledSubBlocksOf` per block object, aggregate counters bottom-up.

K-17 `relatorio/sumario.ts:191, 205` with `pre-issue.ts:373, 392` — medium — one Sumário render builds the location tree 4 to 5 times (`pointsSummary`, `section11Instruments` three times, `preIssue`); `parecer.ts:207-208, 146` builds it three times per parecer render. Per-snapshot memo of `locationTree` and of `section11Instruments`.

K-18 `print/section-9.ts:668` — low — `ids.includes` inside the photo loop (O(p^2)); the function `layoutPhotoIds` is also unused. Delete or use a `Set`.

K-19 Dead exports (no importer outside the defining file, tests excluded; confirmed for the first seven by grep) — low — `ops/path.ts:438-442` (`projectFieldPath`, `relatorioPath`, `relatorioExportSchemePath`), `print/section-9.ts:662 layoutPhotoIds`, `print/revisions.ts:72, 93`, `relatorio/progress.ts:87 cabineSheetsProgress`, `relatorio/sumario.ts:341 numberedSiblings`, `relatorio/section-variables.ts:67 section3Text`, `relatorio/setup-complete.ts:53 isSetupComplete`, `relatorio/conclusion.ts:27-28`, `relatorio/reading-evaluation.ts:294 cellAt` (O(c) per lookup; shadowed by a local closure in `reading/display.ts:358`), `templates/compose.ts:180 quantityAt`, `parse/pt-br-number.ts:51 formatDecimalPtBr`, `parse/utterance.ts:235`, `drafts/key.ts:40 parseDraftKey`, `files/candidate.ts:28`, `files/tile.ts:54`, `schemas/entities.ts:617 entitySchema`, `status/table.ts:65`, `contract/errors.ts:22`, `contract/examples.ts:86`.

K-20 Duplicated helpers — low — `text/plural.ts:7-10 listPtBr` and `relatorio/sheet-progress.ts:277-280 joinPtBr` (identical); `text/hash.ts:8-17 canonicalJson` and `schemas/snapshot.ts:345-361 canonical`; `relatorio/sumario.ts:178-180 sectionBlocks` and `relatorio/pre-issue.ts:153-155 liveSections`; the `getDefinition` try/catch wrapper copied 9 times (21 call sites) with a `findDefinition(seedVersion, blockType): BlockDefinition | null` missing beside `seed/definitions.ts:89`; `checks/calibration.ts:25-30 parseCalendarDate` and `format/datetime.ts:85-90 splitDate`; `schemas/snapshot.ts:147-152` and `:291-296` (actor collection); `merge/conflicts.ts:428-433` and `merge/info.ts:189-195` (block name lookup).

### 1.2 apps/web

W-1 `db/sync-store.ts:171-173` — high — the outbox is never pruned (the only `outbox.delete` is the dead coalesce branch, `db/commit.ts:86`) and `outboxRows` is `db.outbox.toArray()`, subscribed live in the SyncProvider (`state/sync.tsx:289`) and again by Home (`surfaces/home/home-surface.tsx:82`); `lastOpIdFor` also scans it (`db/generate-store.ts:96`). Every keystroke commit, `markSent`, `markAcked` and pulled ack re-reads every op ever committed on the device and re-runs `syncCounts` and `pendingSheetContext` (`sync.tsx:300-307`). Fix: prune acked rows once pulled back (`applyPulled` knows them, `sync-store.ts:97-108`), keep `dead` and the undo window; read `where('status').anyOf(['pending','sent','dead'])` live and count acked with `.count()`; hand the provider's rows to Home.

W-2 `db/commit.ts:82-97` — medium — the coalesce branch of `applyOne` is unreachable: `coalesce` returns null when either op has a `batch_id` (`packages/domain/src/ops/outbox.ts:34`), `buildBatch` mints one for every batch (`commit.ts:220`), and `commitOps` is only reached from `undoBatch` (`commit.ts:354`) whose inverses carry one too. It still costs an `orderBy('client_ts').last()` read per op; if it ever fired it would delete a row `takePending` already selected while a later batch awaits the network. Remove the branch.

W-3 `db/commit.ts:143-150` — medium — `lastAppliedOpId` reads every pulled op targeting the entity (`remote_ops.where('targets').equals(key).toArray()`) and every outbox row on the path, then sorts, on every commit; for a block with thousands of ops that is O(history) per typed field. Add a v6 compound index `remote_ops: [path+seq]` and read `.last()`, or keep a per-slot last-op table written by `applyOne`/`applyPulled`.

W-4 `state/sync.tsx:356, 365-369` — medium — "Sincronizar agora" and "Reenviar" call `runCycle()`, which answers `busy` while a cycle runs (`sync/engine.ts:565`) and nothing schedules a follow-up, so a resent dead row waits for the 60 s tick; `runFreshCycle` (`engine.ts:697-704`) already solves this for `retryUpload`. Use it for both.

W-5 `db/decision-store.ts:70-74, 86` — medium — `heldDecisions`, live in the SyncProvider, reads every block, equipment and relatório on the device on any block write (each sheet keystroke) and filters blocks per relatório in a nested loop, O(R x B). Group once; add `[entity+relatorio_id]` to `entities`; skip relatórios with no conflict marks.

W-6 `db/suggestion-store.ts:201-207` — medium — `readingCountRows`, also live in the provider, reads all suggestions, blocks, locations and files on every write to those tables, to count statuses. Same index; count per relatório lazily.

W-7 `db/photo-store.ts:56-68` — medium — `photoTiles` reads every `file` record on the device, filters `relatorio_id` in JS, then 2-3 point reads per photo (N+1). `[entity+relatorio_id]` plus `bulkGet` for thumbs and blobs.

W-8 `state/sync.tsx:412-451` — medium — the context value depends on 26 values (every outbox write, every `sync_state` write, every engine emit), so every `useSync()` consumer (AppShell, Home, Sumário, ficha photos, gallery, conflict banners) re-renders per keystroke commit. Split stable actions from live data, or a selector hook on `useSyncExternalStore`.

W-9 `surfaces/photos/gallery-surface.tsx:142, 147, 192, 198, 207` and `surfaces/ficha/use-ficha-photos.ts:112` — medium — photo edits use `void commit(...).then(...)` with no `catch`; a refused write (quota, closed database) is an unhandled rejection with no toast, against AD-8/FR-54. Route through `useUndoableEdits().write` (`state/use-undoable-edits.ts:100-112`) or add `.catch`.

W-10 `surfaces/export/use-generate.ts:401, 456, 463`, `surfaces/app-shell.tsx:124`, `surfaces/sync/sync-status-surface.tsx:89`, `surfaces/home/home-surface.tsx:151` — low — `void sync.syncNow()` / `void syncRelatorio(id)` without catch; the engine's public `runCycle`, `syncRelatorio`, `syncProject` are not wrapped like `fireCycle` (`engine.ts:629-632`), so a Dexie error mid-cycle (database closed by sign-out, `state/session.tsx:284`) is an unhandled rejection. Make the public methods never reject.

W-11 `components/crop-thumb.tsx:47-64, 92` — medium — each `CropThumb` loads the full-resolution original and its own object URL; a plate has up to nine fields, so nine decodes of one 2560 px JPEG stay alive on the tablet. Hoist the source to the nameplate section and pass one URL down.

W-12 `surfaces/relatorio/setup/etapa2-escopo.tsx:123` — low — the editable exclusions list keys `<li>` (holding an `<input>`) by index, so removing a row re-keys the inputs below it (focus and uncommitted text move to the neighbour). Key by a stable id.

W-13 `surfaces/ficha/camera-view.tsx:224-241` — low — `finish()` chains `Promise.allSettled(...).then(settle).then(...)` with no catch; a rejecting `settle` leaves `finishing.current` true and the stream live. Add `finally`.

W-14 `surfaces/relatorio/setup/etapa5-local.tsx:40-54` — low — (a) geolocation is asked on every mount (`[]` deps; the comment "once per relatório" is wrong; audit 4.2 confirmed); (b) no cancelled guard, `setReading` after unmount. Persist a marker; add a cleanup flag.

W-15 `surfaces/ficha/use-ficha-actions.ts:165, 169, 181-189`, `surfaces/relatorio/relatorio-tree.tsx:603` — medium — "can conclude / can mark not tested / can clear" rebuilt from raw fields (`progress.complete && block.concluded_by === null && block.not_tested === null`). Kernel `sheetActions(block, progress)`.

W-16 `surfaces/ficha/ficha-surface.tsx:168` (also `:138, :165, :172`, `use-checklist-mirror.ts:14`, `not-tested-band.tsx:34`) — medium — "a not-tested sheet is read-only" decided in the surface (`<SheetReadOnlyProvider value={block.not_tested !== null}>`). Same kernel helper.

W-17 `surfaces/ficha/conclusao-section.tsx:203, 357, 358` — medium — per-field missing rules (`missing={result === null}`, `observationRequired(block) && result !== null && restriction !== null`) in the surface. Kernel `conclusionMissing(block)`.

W-18 `db/suggestion-store.ts:174` — medium — the auto-confirm sweep decides "never on an issued relatório" from `status === 'emitido'`. Kernel `acceptsAutoConfirm(status)`.

W-19 `surfaces/project/project-surface.tsx:56, 168` — medium — the project counters call `progress({ blocks, suggestions: [] })` after a local `removed_at === null` filter, ignoring pending suggestions, so they can disagree with Home and the Sumário. Pass the relatório's suggestion rows; drop the local filter.

W-20 `surfaces/sync/decision-actions.ts:138-141` and `surfaces/relatorio/tree-actions.ts:559-573` (reused `sumario-actions.ts:213`) — medium — "only live equipment is freed" and "restore also un-removes the equipment" decided in the surface with no kernel counterpart. Move into `equipmentFreedByRemoval` and a kernel `restoreSheetOps`.

W-21 `db/suggestion-store.ts:53-55`, `state/reading-arrivals.tsx:41`, `surfaces/relatorio/panel-capture.tsx:150`, `db/file-store.ts:154` (and `use-generate.ts:328`) — low — `status === 'pending'` filtered three times with a local sort; "a dead file never blocks Gerar" as a local count. One `pendingSuggestionRows(db)`; kernel `uploadableCount`.

W-22 `surfaces/export/export-dialog.tsx:119-139` — low — the DOCX and PDF prefetch continues after the dialog closes; no fetch in the app is abortable or has a timeout (`sync/client.ts:146, 185`). Thread an `AbortSignal`.

W-23 `surfaces/export/revision-file.ts:30` — low — a 401 on the revision download is folded into the network text (asserted at `export-dialog.test.tsx:1111`) while `copy/pt-br.ts:169` already has `sessionExpired` (audit item confirmed). Call `publishReAuth()` (`api/auth-client.ts:31`).

W-24 `files/photo-import.ts:96`, `files/photo-encode.ts:62` — low — image passes: camera 1 decode + 2 encodes + hash (good); HEIC reads the whole file for EXIF, then `heic-to` reads it again, 2 decodes and 3 encodes. Draw the thumb from the resized canvas; read EXIF from the converted head.

W-25 `db/file-store.ts:82-92, 122-146, 180-206` — low — per-cycle N+1 (`thumbs.get`, `localFileRow`, `entities.get` per photo); fine at 60 s cadence; `bulkGet` when photo counts grow.

W-26 `db/sync-store.ts:106` — low — `applyPulled` does `rows.find(op_id)` inside a loop over the page, O(page x own). Map by `op_id`.

W-27 Dead code — low — `surfaces/registries/registry-tab-placeholder.tsx:9` (and `copy/ui.ts:171`), `db/generate-store.ts:125 useGenerationJob`, `db/file-store.ts:168 localUploadError`, `db/sync-store.ts:282 remoteOpRows`, `surfaces/relatorio/relatorio-ops.ts:28` re-export; plus W-2.

W-28 Duplication — low — TAG rename builder x3 (`sumario-surface.tsx:221-239`, `tree-actions.ts:391-421`, `use-ficha-actions.ts:222-247`); "Marcar não ensaiado" write x2 (`tree-actions.ts:423-442`, `use-ficha-actions.ts:207-220`); `sha256Hex` x2 (`files/photo-encode.ts:47-50`, `components/upload-tile.tsx:52-55`); EXIF head read x2 (`photo-import.ts:16, 81-83`, `use-photo-capture.ts:45, 124`); blob-to-state hook x2 (`crop-thumb.tsx:47-64`, `photo-viewer.tsx:46-63`); timer shims x3 (`sync.tsx:206-209`, `toast.tsx:33-36`, `field-commit.ts:37-40`); `sync-store.ts:211-219` vs `:226-235`; `photo-store.ts:145-148` vs `:170-173`; `home-store.ts:123-128` vs `generate-store.ts:26-31`; inline `{ id: user.id, companyId: user.companyId }` in 7 places (a `useAuthor()` on `session.tsx`); registry panels (jscpd group 7); name dialogs (group 6); roving radio (group 10); rich-text areas (group 11); `read-display.tsx` internal (group 8); `button.tsx` (group 9).

Sync races checked and found sound: a pull cannot overwrite a local op committed between push and pull (`applyPulled` acks and re-materializes in one `rw` transaction over `remote_ops, entities, outbox`, `sync-store.ts:87-145`; every commit path runs in a transaction over the same tables, `commit.ts:122, 167, 195, 293, 332`, so IndexedDB serializes them); two cycles cannot overlap (`runCycle` mutex, `engine.ts:565`; timer, `online` and nudge coalesce into `onlineWhileRunning`); drain order is `client_ts` then `op_id` with batches kept together (`sync-store.ts:49-52`, `sync/policy.ts:83-112`); a tab closed mid-push leaves rows `sent`, re-pushed next launch and deduped by the server on `op_id` (`apps/api/src/sync/apply.ts:315-317, 357-366`). Listeners, intervals, `liveQuery` subscriptions, object URLs and camera tracks are all released (`useObjectUrl`, `photo-row.tsx:17-29`; `camera-view.tsx:156-157, 213, 351`); the two unbalanced `addEventListener` sites are `{ once: true }` and an abort-signal listener.

### 1.3 apps/api

A-1 `sync/apply.ts:278-288` — medium — every registry `create` of `manufacturer`/`voltage_class` loads all live registry rows of that kind of the company and normalizes them in JS: O(n * R) per push, repeated per op inside the same transaction. Load each kind once per push into a `Map<normalizedName, id>` and keep it current; or persist the normalized name and index it.

A-2 `sync/pull.ts:73-76` — medium — the relatório stream filter is `OR(relatorio_id = X, scope = 'project' AND project_id = Y)`; Postgres cannot walk one index in `seq` order across the OR, so each page is a BitmapOr over both streams plus a sort and `LIMIT 500`, O(L_r + L_p) per page and again for the head (`:50`), on every 60 s cycle of every device. `UNION ALL` of two index-ordered sub-selects each with `seq > since ORDER BY seq LIMIT n`.

A-3 `sync/pull.ts:106-118` with `db/client.ts:7` (`max: 5`) — medium — `relatorioTotals` groups every live block and photo of the company on every company pull, and the company pull runs five queries concurrently, so one pull can occupy the whole pool and a push transaction waits behind it. Partial index `(company_id, relatorio_id, entity) WHERE removed_at IS NULL`; compute totals only when the list changed; raise `max`.

A-4 `jobs/generate/sections/section-7.ts:41-51` (also `section-11.ts:73`) — medium — `loadPhotoImages` catches every error from `readPrint` (S3 outage, pool timeout) and issues the revision with the placeholder text in place of the photo: a transient failure yields a numbered, issued relatório missing evidence photos with only a log line. Swallow only decode failures and absent objects; let a thrown read propagate to `render_failed`, or fail an `issue` job when `missing.length > 0`.

A-5 `jobs/generate/libreoffice.ts:155-178` — medium — `rasterizePdfPages` has a per-run timeout (120 s) but no total budget: 20 pages x 2 soffice runs x 120 s = 80 min worst case inside the process-wide `serialize` chain every conversion waits on; pg-boss expires the job at 900 s but the promise keeps the chain. Pass a deadline; export all pages in one run.

A-6 `storage/s3.ts:22` — medium — the `S3Client` has no request handler timeouts (no `requestTimeout` anywhere in `apps/api/src`); a stalled socket hangs a `GetObject` or `PutObject` forever. `NodeHttpHandler({ connectionTimeout: 5_000, requestTimeout: 120_000 })`.

A-7 `storage/variants.ts:58` — medium — `renderVariants` runs two independent `sharp(source)` pipelines concurrently: two full decodes of the uploaded original (a 24 MP JPEG is about 72 MB raw, twice, per PUT). Render `print` from the original, `thumb` from the print bytes.

A-8 `jobs/generate/job.ts:180-184` — medium — `printVariant` runs one `entities` query per photo (`fileRow`) although the frozen snapshot already holds every file row; the same for `readOriginal` per certificate (`:189-194`). Key the object from the snapshot's row.

A-9 `http/generate.ts:111-121` — low/medium — `activeJob` loads every `generation_job` row of the relatório (all statuses, both kinds) and filters in JS, twice per press (`:310`, `:252`); rows are never removed. Push `kind` and `status in ('queued','running')` into SQL; drop the pool-side call.

A-10 `sync/routes.ts:137-139` — low — the mark-blind conflict check (`pushTouchesConflictMark`) runs on the pool outside the lock `applyOps` takes at `:139`; a concurrent push can stamp a mark between the check and the apply. Run it in the `before` hook under the lock.

A-11 `http/generate.ts:299` — low — `freezeSnapshot` is documented as "inside a transaction the caller locked" but is called in an unlocked transaction, and its `max(seq)` head scan over every company-scope op is thrown away. Use `toSnapshot`.

A-12 `http/generate.ts:306-317` — low — the "unchanged" decision (`revisionsOf`, `editedAfter`) reads on the pool, then `createJob` locks; a job committing revision N in between leaves a stale `latest` and a second identical N+1. Move into `createJob`'s `before` hook.

A-13 `http/session.ts:34-36` — low — any error from `auth.api.getSession` (DB down) is swallowed and the request is anonymous, so an outage surfaces as 401 on every device instead of a retriable 5xx. Log and rethrow or 503.

A-14 `jobs/reading/worker.ts:129-132` — low — a reading job whose payload fails the schema is logged and `continue`d, so pg-boss completes it and the photo stays `running` forever; the generate worker fails its row instead (`generate/worker.ts:65-103`). Parse `{company_id, photo_id}` leniently and `writeReadingFailed`.

A-15 `sync/routes.ts:155` — low — `recordPush` runs after the push committed; if it throws the route answers 500 although every op landed and the device re-sends. Wrap and log.

A-16 `jobs/generate/pdf-outline.ts:43` — low — `task.promise` awaited before the `try/finally` that destroys it (`readPageSizes` at `:72-83` does it right).

A-17 `jobs/generate/libreoffice.ts:65` — low — a fresh `mkdtemp` and `-env:UserInstallation` profile per run (2-3 per job plus one per certificate), 1-3 s of cold profile each; concurrency is already 1. Keep one profile per process.

A-18 `jobs/queue.ts:5` — low — pg-boss errors go to `console.error` outside the structured log.

A-19 `http/files.ts:246-248` — low — dead branch: `readCappedBody` (`:106`) already throws `BodyTooLargeError` at the first byte past the limit.

A-20 `http/files.ts:213, 274, 279` (and `:180`) — low — the PUT re-reads the same `file` row up to four times plus up to three HEADs. Have `emitServerOp` return the row it read.

A-21 `jobs/reading/job.ts:70-76` — low — `pendingOfPhoto` loads every suggestion row of the relatório and filters status/photo in JS, twice per run (`:232`, `:246`). Push both predicates into SQL.

A-22 `sync/snapshot.ts:36` — low — `toSnapshot` loads every entity carrying the project's `project_id`, including every sibling relatório row, which `buildSnapshot` discards. Restrict by entity.

A-23 `sync/apply.ts:342-353` — low — the "latest op on this path" lookup runs for creates too (whose `prev_op_id` is always null): one indexed round trip per create. Skip for `create`. Also `parsePath` runs about seven times per op along the apply path (`:124, 154, 231, 247, 269, 368`, plus `applyOp`); carry the parsed path.

A-24 `jobs/generate/docx.ts:266` — low — the RASCUNHO watermark PNG (a 1200 px SVG rasterization) is rebuilt on every TOC pass because `images.watermark` is never filled; `sizedImage` metadata runs per placement per pass. Compute once per job.

A-25 `http/generate.ts:359` — low — `filename="relatorio-rascunho.pdf"` composed in the api; every other document name is the kernel's `revisionFileName`. Add `previewFileName()` in `packages/domain/src/print/revisions.ts`.

A-26 `auth/auth.ts:38` — low — `appName: 'PRODUTO'` as a literal instead of the `PRODUTO` constant (`packages/domain/src/product.ts:2`).

A-27 Dead code and misplaced test support — low — `db/repositories/users.ts:79 listUserProfiles` (test-only importer); `jobs/generate/docx-structure.ts` (145 lines) and `sample-pdf.ts` are test support shipped in the image.

A-28 Duplication — low — file-row lookup x5 (`http/files.ts:73-84`, `jobs/generate/job.ts:163-171`, `http/reading.ts:53-61`, `sync/routes.ts:70-79`, `jobs/reading/status.ts:75-83`): one `findFileRow` in `db/repositories/files.ts`; server-op envelope builder x6 (`http/generate.ts:201-218`, `jobs/generate/job.ts:119-141`, `jobs/generate/worker.ts:82-97`, `jobs/reading/status.ts:26-52`, `http/files.ts:160-176`, `db/seed.ts:82-95`): one `serverOp(...)` in `sync/server-op.ts`; `revisionsOf` (`http/generate.ts:124`) vs `liveRevisions` (`jobs/generate/job.ts:148`); `ensureGenerateQueue` vs `createQueueOnce`; the generate/preview route preambles (`http/generate.ts:281-299` vs `:327-343`) and the DOCX/PDF routes (`:366-379` vs `:391-402`); `readAll` (`job.ts:173`) re-implements `node:stream/consumers.buffer`.

No server-side replay exists: nothing rebuilds `entities` from `ops` if they ever diverge (the kernel's `replay` is the device's). A `scripts/rebuild-entities.ts` under the company lock would be the repair path (low, operational).

### 1.4 e2e and scripts

E-1 `scripts/verify.ts:99` — high — stages are spawned `detached: true` and the file has no `SIGINT`/`SIGTERM` handler (`grep -n "process.on(" scripts/verify.ts` is empty); Ctrl-C on `pnpm verify` kills the parent and leaves `vitest`, `playwright` and the vite preview server as orphans holding the compose Postgres, port 5200 and the next run behind `/tmp/fasor-verify.lock`. Keep the children in a set; on signal `killTree` each and exit 130. No per-stage timeout either (`:99-114`): a hung stage blocks the 15-minute gate forever.

E-2 `scripts/e2e.ts:185-187` — medium — `summary.json` is written only at the very end; a crash or Ctrl-C between the two groups leaves the previous run's file in place with no run-start stamp, so the epic retro's P1 coverage check can read a stale result. `rmSync` at start and stamp `startTime`/`endTime`.

E-3 `scripts/test-reset.ts:64-65` — medium — the script takes one `<company-id>` but `resetTestCompanyData(db)` (no argument) always wipes both `TEST_SEED` companies while `resetCompanyJobs` and the S3 purge scope to the one id; the function already accepts `only` (`apps/api/src/db/seed.ts:464-467`). Pass `[companyId]`. The S3 purge loop (`:70-93`) has no page marker and runs after the DB reset committed (a failing delete leaves half a purge).

E-4 `apps/api/src/db/test-fixtures.ts:24-37` — medium — `removePortoSeguroSmall` deletes the fixture's ops and entities from every company (no `company_id` filter) in two statements outside a transaction; `seed-users.ts --sample-relatorio` on a real company is silently deleted by any `test:api`/e2e run. Wrap in a transaction; refuse when the fixture lives in a company that is neither `TEST_SEED` nor an e2e worker pair.

E-5 Fixed sleeps that prove a negative — `e2e/parecer-export.spec.ts:325` (4 s, medium; a serial-group test), `e2e/points.spec.ts:505` (1.5 s, medium), `e2e/ui-hygiene.spec.ts:222`, `e2e/plate.spec.ts:146`, `e2e/ficha.durability.spec.ts:154, 253`, `e2e/durability.spec.ts:302` (1 s / 500 ms, low) — a "still absent after N ms" after a sleep passes silently on a slow launch. Assert on the positive signal (the drafts store read, `data-pending="0"` through `syncNow`, the focused primary) and then read once. By design and kept: `templates.spec.ts:343` (press-and-hold), `durability.spec.ts:553-556` (long-press gesture), `lost-taps.durability.spec.ts:162` (the delay under test), `support/taps.ts:77, 86` (80 ms human hold). `e2e/ficha.spec.ts:247, 963` wait 1 s to cross the 500 ms idle timer: wait on the observable commit instead. `support/durability.ts:85-96` (100 x 100 ms polls inside `evaluate`) and `:123` (300 ms after `hideTab`): wait on `controllerchange` and the drafts row. `support/sync.ts:47`: a 1 s inner `getAttribute` timeout inside a poll costs 1 s per failed sample. `home.spec.ts:162` (4 s route delay in a `@p0` test): 1 s is enough. `tap-budget-signal.spec.ts:185-189`: a polling loop with a swallowed `expect(...).catch(() => undefined)`; use `expect.poll`.

E-6 `e2e/durability.spec.ts:553-556` — low — the timed long-press test is not in `SERIAL_SPECS` (`e2e/support/groups.ts:11-72`) and the guard regex in `scripts/e2e.test.ts:180-184` (`/humanTap|touchPressAcross|tapCounter/`) does not match `Input.dispatchTouchEvent`, so `--workers=3` runs this timed gesture beside other workers. Add the token or the file.

E-7 `e2e/support/reset-empresa-b.ts:12-27` — low — `withSeedDb` opens a new Postgres pool and `createAuth` on every call: per test (77 call sites) and again in `push-server-ops.ts:20-21, 61-62, 106-107` and `reading-ops.ts:166-167, 180-181`. One lazily created worker-scoped fixture.

E-8 `e2e/ficha.durability.spec.ts:57-75` — low — `tapAt` repeats `support/taps.ts:69-88` (CDP touch emulation, hold, detach). Add `{ skipHitCheck: true }` to `humanTap`.

E-9 `scripts/e2e.ts:63-75` — low — `withoutWorkers` drops any argument starting with `-j`; use `/^-j\d+$/`. `:146-149, 181`: a parallel run killed by a signal still starts the serial group.

E-10 `scripts/build-tagged-image.sh:2-3` — low — marked SUPERSEDED, nothing calls it, and it runs `pnpm verify` on the host side (`:12`). Delete.

E-11 `apps/api/src/db/test-cleanup.ts:10-19` — low — `dropCompany` runs 8 deletes without a transaction.

Counts: 55 spec files, 322 `test(` declarations (186 `@p0`, 123 `@p1`, 12 `@p2`, 1 untagged behind `CAPTURE_P=1`); no `.only`/`.fixme`; `test.skip` only with runtime conditions; no assertion that cannot fail; no order dependence within a file (every test resets its company in `beforeEach`); the fixed-id fixture specs are all in `SERIAL_SPECS` and guarded by `scripts/e2e.test.ts:173-178`. `verify.ts` phases match AGENTS.md (`:33, 55-70`), a failure aborts siblings and later phases, stdout/stderr are drained (`:105-106`), the exit code propagates. `e2e.ts` `collect`/`summarize`/`combine` are linear in tests. `seedUser` is idempotent via upserts; `resetTestCompanyData` is one transaction guarded against foreign ids (`seed.ts:472-481`). `regen-goldens.ts` and `export-ocr-schema.ts`: no findings.

### 1.5 services/ocr

Facts: the image is decoded once (`app/pipeline.py:63` via `app/main.py:101`); models load once in the lifespan (`main.py:46-51`); inference is serialized on a module lock (`:43, 88`); decode and pipeline run in the threadpool (`:101, 105`), so no sync CPU work on the event loop; no swallowed exceptions (`:115-117` logs and answers 500); no temp files; `USER ocr` (`Dockerfile:77`). No hand-written Pydantic models: `contract_models.py` is generated at build from the committed schema (`Dockerfile:42-46`) and the TS contract, schema and Python producer match field by field (`ocr.ts:32-56, 92-103` vs `main.py:69, 96-117`, `pipeline.py:246-257`, `recognizer.py:67`). One drift: `OcrImage.mime` (`ocr.ts:108-112`) is narrower than `ACCEPTED_TYPES` (`main.py:38`, also `application/octet-stream`).

O-1 `app/main.py:88-89, 105` — high — no inference timeout or cancellation under the single lock: the api aborts at 60 s (`apps/api/src/jobs/reading/providers/ocr-svc.ts:14, 32`) and retries, but the sidecar keeps computing, so one slow image stalls the reading queue. `asyncio.wait_for(run_in_threadpool(...), timeout)`, `_inference.acquire(timeout=...)` failing fast, a pixel cap before detection; export the timeout from the kernel's `x-ocr-service` beside `read_max_bytes`.

O-2 `app/main.py:101` — medium — no concurrency cap: up to 40 threadpool requests each decode (up to `READ_MAX_BYTES`) before waiting on the lock, and the compose service sets no memory limit (`docker-compose.yml:213-225`). `asyncio.Semaphore(1-2)` before the body read, 503 when full, plus `deploy.resources.limits`.

O-3 `app/pipeline.py:62-63` — medium — the decode dimension cap lives only in the Dockerfile ENV `OPENCV_IO_MAX_IMAGE_PIXELS=50000000` (`Dockerfile:76`); outside that image a tiny PNG declaring 30000 x 30000 allocates 2.7 GB. `os.environ.setdefault` before `import cv2` plus a post-decode shape check against one constant.

O-4 `app/detector.py:19-25` with `pipeline.py:20` (`MAX_SIDE = 4000`) — medium — the detector receives the full working image with no `limit_side_len` and `enable_mkldnn=False`; tens of seconds on CPU, twice when deskewing (`pipeline.py:222-231`). `limit_side_len=1600-2000, limit_type="max"`, try `enable_mkldnn=True`.

O-5 `Dockerfile:36-39` — medium — the PP-OCRv5 detection weights are downloaded at build from Hugging Face with no pinned revision or checksum (PARSeq is pinned at `:15-18`). `ADD --checksum` or a committed manifest.

O-6 `Dockerfile:33, 54, 61` — low — the runtime venv includes the dev group (`uv sync --frozen` without `--no-dev`; `pyproject.toml:21-27`) and `COPY tests/`; the production and ECS image ships pytest and codegen. `--no-dev` runtime venv; a separate test target.

O-7 `Dockerfile:7, 10, 29` (tags without digests), `:77-79` (no `HEALTHCHECK`; only compose has one), `:15-20` (large `ADD`s before `pip install onnxruntime`, so a weights bump re-downloads it) — low.

O-8 `app/pipeline.py:190-191` — low — `_reading_order` recomputes row medians per word, O(W x R). `app/display.py:45-46` — low — the erosion kernel scales with the image (k = 27 at 4000 px, O(P x k^2)). `app/main.py:79` — low — `ClientDisconnect` from `request.stream()` escapes `_read_body` (called at `:94` outside the try at `:104`) and logs a 500 traceback on a normal api abort.

O-9 Duplication — low — `pipeline.py:136-144` and `display.py:56-62` (rectify a quad); `pipeline.py:246-250` and `display.py:72-77` (clamp a box); `tests/test_api.py:61-67, 92-98` and `tests/test_fixture_plate.py:20-27` (the plate-accuracy assertion, literal 0.95 vs `MIN_ACCURACY`).

### 1.6 infra and compose

Checked and correct: every CloudWatch group has 14-day retention (`infra/production/storage.tf:96-101`); ECR keep-5 lifecycle (`:78-94`); both buckets versioned, encrypted, public-access-blocked, with noncurrent expiry and `prevent_destroy`; RDS 7-day backups, final snapshot, deletion protection, private subnets, `db.t4g.micro`; SGs open only 80/443 and 5432 from the instance SG; secrets are SSM SecureString injected through `secrets` (`ecs.tf:49-52`), never plain env; no `.tfvars` committed; prod images run non-root; compose ports for postgres, minio, api, ocr bound to loopback; no privileged containers; every named volume declared. Budget: `bootstrap/budget.tf` declares the USD 100 monthly budget with e-mail at 50/80/100% actual and 100% forecast; `production/budget.tf:52-75` attaches the Bedrock/Textract deny policy at 100% actual. Declared infrastructure costs about USD 41-42 per month with the night schedule (t3a.medium 21.7, EBS 2.4, IPv4 3.65, RDS 9.45 + 2.3, S3/ECR/logs about 2), about 50 without it; the README's AI allowances (7.5 Textract + 30 Bedrock) bring it to about 79.

I-1 `infra/bootstrap/variables.tf:10` (also `infra/production/variables.tf:94, 106`) — medium — a real person's e-mail at the client company is committed as a Terraform default in a public repository and is the only recipient of every budget alert, anomaly alert, budget-action notice and the ACME contact; the operator holding `fasor-admin` gets none. Drop the defaults (required variables read from an untracked `terraform.tfvars`), make `budget_alert_email` a list; `.gitignore:52-55` does not ignore `*.tfvars`.

I-2 `docker-compose.yml:59` — medium — `minio/minio` is untagged (`latest`); `:136` `caddy:2-alpine` floats while production pins `caddy:2.11.4-alpine` (`infra/caddy/Dockerfile:3`); `:43` `postgres:18` floats on minor. Pin.

I-3 `infra/production/budget.tf:56-62` — low — the only automatic cap fires on ACTUAL at 100% with up to a day of billing lag. 90%, or a second action on FORECASTED.

I-4 `infra/production/rds.tf:14-45` — low — `deletion_protection = true` but no `lifecycle { prevent_destroy = true }` (the buckets have it); a destroy tears the dependents first.

I-5 `docker-compose.yml:42, 58, 88, 106, 135` — low — no `restart:` on any long-running service; after a daemon restart the tablet origin (Caddy) stays down. `restart: unless-stopped` on the long-running ones only. `:119-121, 145-147`: web and caddy depend on api with `service_started` although api has a healthcheck (`:100-104`; `tools` uses `service_healthy`, `:206`), so Caddy answers 502 during api boot. `:117-118`: Vite published on all interfaces while every other port is loopback. `:42-57`: postgres without `stop_grace_period`. `:15` vs `:45-47`: DB credentials hard-coded twice. `:22` with `:168-176`: `api-prod` runs `NODE_ENV=production` with the committed placeholder `SESSION_SECRET` (`apps/api/src/config.ts:24` checks `min(32)` only).

I-6 `infra/production/ecs.tf:181-195` — low — no `deployment_circuit_breaker`; a task dying at boot relaunches forever and `infra/bin/deploy:179` waits 10 minutes with no rollback. `deploy:179`: a first roll after a night stop or a multi-GB ocr image can exceed the 10-minute `services-stable` wait; the SSM tag then stays at the previous SHA (`ssm.tf:25-34`) and the next apply rolls back silently.

I-7 `infra/production/storage.tf:71` — low — ECR `MUTABLE` with commit-SHA tags; a rebuild of the same SHA (`node:24-bookworm-slim` floats, `apps/api/Dockerfile.prod:12`) overwrites the rollback image.

I-8 `infra/production/cloudfront.tf:28-33` with `infra/caddy/Caddyfile:28-30` and `network.tf:108-116` — low (off by default) — with the CloudFront fallback on, the edge reaches the origin `http-only` on 80, and port 80 is open to the world for ACME, so anyone sending `Host: <id>.cloudfront.net` to the EIP over plain HTTP gets the app un-redirected. A custom origin header matched by the Caddy fallback site, or a domain with ACM.

I-9 `apps/api/Dockerfile:11-13`, `apps/api/Dockerfile.prod:68-76` (LibreOffice tarball and RDS CA bundle without a pinned checksum; the bundle passes `grep -q 'BEGIN CERTIFICATE'` only), `docker/mkcert/Dockerfile:7` (`latest?for=linux/amd64`, unpinned, amd64-only) — low.

I-10 Duplication — low — the account id `673409896745` in 9 places, `us-east-1` in 14, `amazon/aws-cli:2.37.6` and the credential-export block in `infra/bin/tf:14-16` and `infra/bin/aws:8-10`, bootstrap names re-declared as strings in `production/variables.tf:100-118`, `bootstrap/versions.tf:1-23` = `production/versions.tf:1-27`; `apps/api/Dockerfile:6-16` = `Dockerfile.prod:58-78` (LibreOffice install; the dev one hard-codes x86_64), `apps/api/Dockerfile:23-37` = `Dockerfile.tools:7-21`, the api and ocr healthchecks repeated in compose (`:100-104, 184-188, 220-225`) and `ecs.tf:71-77, 99-105`. An `infra/bin/lib.sh`, `terraform_remote_state` for the bootstrap names, a `Dockerfile.base` for the api, compose extension fields.

## 2. Big-O of the hot paths

n = ops, s = sheets (blocks), l = locations, p = photos, e = equipment, R = live registry rows of a kind, L = company log, L_r/L_p = relatório/project stream, E = entities of the company, J = job rows, t = tests. Kernel times: medians from `kernel-timing.txt` on the Porto Seguro fixture (3841 ops, 94 blocks, 23 locations, 82 files, 7 points), Node 24 in the tools container under load from three other agents.

| Function | File:line | Complexity | At Porto Seguro scale | Risk | Suggestion |
|---|---|---|---|---|---|
| `parsePath` | `ops/path.ts:351-367` | O(1) per op (families constant) | 3841 ops: 33 ms | low | index families by head literal; parse once per op (called 2x in `replay`, 5x on the device commit, about 7x on the api apply) |
| `applyOp` (sheet put) | `ops/apply.ts:426-449`, parse at 439 | O(row size) per op (zod) | 3526 puts: 844 ms, 823 ms zod | high | K-1 |
| `replay` | `ops/replay.ts:26-40` | O(n log n) + O(n * row) | 525-1300 ms | high | K-1 |
| `materializeEntity` | `ops/materialize.ts:37-43` | O((r + l) log + (r + l) * row) per entity | per pulled entity | low | K-8 |
| `buildSnapshot` | `schemas/snapshot.ts:91-165` | O(6 * state) + one zod parse of the snapshot | 34 ms | low | once per export |
| `createSnapshotBuilder` | `schemas/snapshot.ts:209-345` | O(state) scan, parses changed rows only | 1.1 ms first, 0.7 ms after one put | low | good |
| `serializeSnapshot` | `schemas/snapshot.ts:347-361` | O(size log keys) | 15 ms | low | tests only |
| `progress` | `relatorio/progress.ts:63` | O(s * cells) | 5.7 ms | low | |
| `sheetProgress` (full snapshot) | `relatorio/sheet-progress.ts:174` | O(tree) per call | 94 calls: 666 ms | high | K-2 |
| `sheetProgress` ({blocks}) | same | O(cells) + `blocks.find` O(s) | 94 calls: 16.5 ms | low | |
| `isCabineFirstSheet` | `sheet-progress.ts:125-129` | O(tree) | 94 calls: 680 ms | high | K-2 |
| `locationTree` | `relatorio/tree.ts:210-285` | O(l * (l + s)) + `sheetState` several times per block | 8 ms | medium | K-16 |
| `sheetOrder`, `nextSheet`, `firstInTree`, `resumeTarget`, `galleryCabineOptions`, `derivedPoints`, `countedSheets`, `section11Instruments`, `groupForPrint` | `ficha.ts:27, 50`, `tree.ts:321`, `resume.ts:25`, `gallery.ts:95`, `points/derived.ts:64`, `parecer.ts:69`, `section-11.ts:86`, `group-for-print.ts:196` | O(tree) each; 12 call sites rebuild it | 6-8 ms each | medium | one memo per snapshot (K-17) |
| `pointTitle` | `points/summary.ts:36` | O(tree) per point | 7 points, about 50 ms per list render | medium | K-15 |
| `preIssue` | `relatorio/pre-issue.ts:216` | O(s * cells + l * (l + s)) | 28 ms | low | |
| `sumarioRows` | `relatorio/sumario.ts:223` | O(s + rows) + 3-4 trees | 22 ms | low | K-17 |
| `composeParecer` / `parecerCounts` | `relatorio/parecer.ts:206, 174` | O(tree + s); `checklistResultOf` rebuilds `naDefaultsOf` per item | 31 / 13 ms | low | K-17 |
| `groupForPrint` | `print/group-for-print.ts:195` | O(tree + s) | 11 ms | low | |
| `section9Layout` | `print/section-9.ts:641` | O(s * (t + cells) + p); `evaluateSheetReadings` twice per sheet (626, 550) | 137 ms | low (per generation) | reuse the evaluation |
| `layoutPhotoIds` | `section-9.ts:662-670` | O(p^2), unused | trivial | low | K-18 |
| `openDecisions` | `merge/conflicts.ts:224` | O(s * cells) | 0.3 ms | low | |
| `instantiateTemplate` | `relatorio/instantiate.ts:147-289` | O(b * e) (`prior.find`, `isTagTaken`) | small | low | index by tag |
| `integrityFindings` | `relatorio/integrity.ts` | O(e) | 0.03 ms | low | |
| web `applyOne` | `apps/web/src/db/commit.ts:65-107` | O(targets) + wasted `orderBy('client_ts').last()` | per op | low | W-2 |
| web `lastAppliedOpId` | `commit.ts:140-152` | O(k log k), k = ops on the entity | per typed field | medium | W-3 |
| web `applyPulled` + `rematerialize` | `db/sync-store.ts:85-145` | O(page * own) `find` + O(k log k) replay per touched entity | per pull page | medium | W-26; materialized checkpoints |
| web `outboxRows` live | `sync-store.ts:171`, `state/sync.tsx:289`, `home-surface.tsx:82` | O(outbox) read + `syncCounts` on every outbox write | grows without bound | high | W-1 |
| web `heldDecisions`, `readingCountRows`, `photoTiles`, `editedSinceSnapshot` live | `decision-store.ts:69`, `suggestion-store.ts:201`, `photo-store.ts:53`, `generate-store.ts:70` | O(all blocks / files / suggestions on the device) per write | per keystroke commit | medium | W-5 to W-8 |
| web `relatorioState` live | `db/home-store.ts:193-273` | O(rows of the relatório) deserialization per write; parse cached by `rev` | per keystroke on the sheet | low (by design) | `[entity+relatorio_id]` |
| web push / pull | `sync/engine.ts:266-279, 441-483` | O(pending) in pages of 500; since-cursor per stream | | low | payloads are right-sized |
| api `applyOps` (push) | `apps/api/src/sync/apply.ts:551, 328-430` | O(n) x about 5 statements per op under the company lock; registry creates O(n * R) | a 3841-op first push is about 20k statements in one transaction | medium | A-1, A-23; load target rows once per push |
| api `pullRelatorio` | `sync/pull.ts:60-78` | O(L_r + L_p) per page | per device per 60 s | medium | A-2 |
| api `pullCompany` + `companySummary` | `pull.ts:55, 130` | O(page) + O(E) group-by, 5 concurrent queries on a 5-connection pool | per device per 60 s | medium | A-3 |
| api `POST /generate` | `http/generate.ts:281` | `missing` O(F), `freezeSnapshot` O(E_r) + O(L) head scan, `activeJob` O(J) twice | per press | low | A-9, A-11 |
| api `runGenerateJob` | `jobs/generate/job.ts:227`, `docx.ts:260` | p x (query + GET), 8-way; per pass k = 2-3: build + `sizedImage` per placement + base64 of every image + soffice; memory O(bytes + k * (docx + pdf)) | per generation | medium | A-8, A-24 |
| api PDF conversion / rasterize | `libreoffice.ts:62, 155` | k soffice runs, fresh profile each; certificates c x pages x 2 runs, serialized, no total budget | worst case 80 min | medium | A-5, A-17 |
| api `runReadingJob` | `jobs/reading/job.ts:143` | O(1) lookups + `pendingOfPhoto` O(S) twice + provider timeout | per photo | low | A-21 |
| api seeds | `db/seed.ts:167, 489, 540` | O(1) per user + scrypt; e2e pairs 3W sequential seeds | 9 seeds per group run | low | |
| api `findE2eLeaks` | `db/e2e-leak-check.ts:43` | `ops` and `entities` seq scans (`actor_id LIKE`, `row::text LIKE`) | teardown only | low | |
| `scripts/verify.ts`, `scripts/e2e.ts` | | O(stages); O(t) | | low | none |
| OCR `read_image` | `services/ocr/app/pipeline.py:203-258` | resize O(P), detection O(P) (twice when deskewed), per-line split with Python column loops (`:101-113`), recognition in batches of 16, reading order O(W x R) | seconds per image on CPU at 4000 px | medium | O-4, O-8 |

## 3. Duplication

Method: jscpd (50-token minimum) over `packages/domain/src apps/web/src apps/api/src e2e scripts`, 1039 clone pairs; source-only pairs separated by path from test, fixture and golden pairs (`jscpd-source-clones.json`); plus the sweeps' by-hand findings, which catch the e2e helper copies jscpd's token window misses.

Per package, source only: domain 52 / 22980 lines (0.2%); web 636 / 38779 (1.6%); api 88 / 8253 (1.1%); e2e support 79 / 2298 (3.4%); scripts 0 / 733. Test and fixture duplication: api 7798 lines (4982 inside `apps/api/src/jobs/generate/golden/porto-seguro-skeleton.json`, the rest integration setup), web 2200, e2e 2674, domain 549.

Top clone groups and the refactor for each:

1. e2e "reset + sign in + push standard relatório + open Sumário" prelude in 8+ specs (`ficha.spec.ts:49-57`, `tree.spec.ts:39-47`, `panel-capture.spec.ts:60-72`, `save-template.spec.ts:30-38`, `points.spec.ts:115-132`, `action-plan.spec.ts:57-74`, `sheet-knows-12-3-12-4.spec.ts:82-101`, `v09-visual.spec.ts:47-57`, `lost-taps.durability.spec.ts:124-143`) and in support (`photos.ts:26-55`, `reading-ops.ts:185-209`); the Sumário wait line appears in 24 files. `openSeededRelatorio(page, account, database, opts)` and `waitForSumario(page)` in `e2e/support/relatorio-seed.ts`. Accidental.
2. e2e `openSheet(page, relatorioId, blockId)` identical in 5 specs (`conflicts.spec.ts:86-89`, `gallery.spec.ts:71-74`, `lost-taps.durability.spec.ts:145-148`, `merge.spec.ts:83-86`, `sheet-knows-12-3-12-4.spec.ts:103-106`), and the section-9 tree opening in about 20 files (`ergonomics.spec.ts:122-132`, `tree.spec.ts:50-54`, `move-block.spec.ts:97-104`, ...). New `e2e/support/ficha.ts` with `openSheet` and `openSection9`.
3. e2e journey steps x2-4 (`pickInstruments`, `readings`, `conclude`, `confirmPair`, `typeField`, `installCounter`, `report` across `journeys-12-3-12-4.spec.ts`, `journey-taps.spec.ts`, `tap-budget-signal.spec.ts`, `tap-budget.spec.ts`; the largest test clone is `tap-budget-signal.spec.ts:125-157` = `tap-budget.spec.ts:160-195`). `e2e/support/journey-steps.ts`.
4. e2e two-device harness (`conflicts.spec.ts:57-84, 124-133, 147-151, 163-168` vs `merge.spec.ts:54-81, 102-111, 113-117, 127-132`), `resetEmpresaA` x4, `plateValue` x4, `instrumentDraft` x3 (two byte-identical to `support/relatorio-seed.ts:78-111`), `openGallery` x4, `pickFiles` x3, the export dialog locators x4, `const outbox = ...` in 16 specs, `toast`/`stepper`/`tree` locators in 20+. `e2e/support/two-devices.ts`, `reset-company.ts` (one `resetCompany(account, opts)` covering `resetEmpresaA`, `resetEmpresaB` and `resetEmpresaBWithFixture`), `locators.ts`, additions to `photos.ts`, `relatorio-seed.ts`, `export-fixture.ts`, `outbox.ts`.
5. `apps/web/src/styles/tokens.css:77-109` and `115-147` (33 lines): the dark palette under `prefers-color-scheme` and under `[data-theme="dark"]`. Justified: CSS cannot share a block across a media query, and AGENTS.md keeps `tokens.css` byte-identical to the mock.
6. `apps/api/src/http/generate.ts:281-299` vs `327-343` and `366-379` vs `391-402`: the generate/preview preambles and the DOCX/PDF routes. `caughtUpRequest(c)` and `serveRevisionFile(kind)`.
7. api file-row lookup x5 and server-op envelope x6 (A-28). `db/repositories/files.ts findFileRow`, `sync/server-op.ts serverOp`.
8. `apps/web/src/surfaces/registries/client-panel.tsx:59-212`, `instrument-panel.tsx:167-405`, `word-registry-panel.tsx:87-265` (six pairs, about 80 lines): registry panel scaffolding. `surfaces/registries/use-registry-panel.ts`.
9. `apps/web/src/surfaces/relatorio/save-template-dialog.tsx:19-66` vs `tag-dialogs.tsx:131-178` (about 45 lines): a name-input dialog. `components/name-dialog.tsx`.
10. TAG rename builder x3 and "Marcar não ensaiado" x2 in `apps/web` (W-28). `renameTagEdit`, `markNotTestedEdit` in `tree-actions.ts`.
11. `apps/web/src/surfaces/ficha/read-display.tsx:156-200` vs `532-566` (two pairs, 34 lines): the capture-result block for two display kinds. A `ReadingResult` component in the file.
12. `components/segmented-control.tsx:58-79` vs `tri-state-control.tsx:58-79` (and `ficha/conclusao-section.tsx:82-100`): roving-tabindex radio logic. `input/use-roving-radio.ts`. Also `components/button.tsx:71-91` vs `123-143` (`buttonProps`), `input/use-rich-text-area.ts:52-66, 243-253` vs `use-section-text-area.ts:39-53, 141-152` (`use-textarea-selection.ts`).
13. Kernel: `formatServiceDates` vs `dateRangeText` (K-12, a behaviour difference), three `not_tested` readers (K-13), `listPtBr` vs `joinPtBr`, two canonical JSON serializers, `sectionBlocks` vs `liveSections`, the `getDefinition` wrapper x9, `parseCalendarDate` vs `splitDate` (K-20).
14. OCR: `pipeline.py:136-144` vs `display.py:56-62`, `pipeline.py:246-250` vs `display.py:72-77`, the plate-accuracy assertion x3 (O-9). Infra: account id x9, region x14, the credential block, the healthchecks, the LibreOffice install (I-10).
15. Test harnesses: `apps/web/src/surfaces/relatorio/relatorio-tree-edges.test.tsx:53-173` = `relatorio-tree.test.tsx:56-176` (121 lines), `templates/template-composer-defaults.test.tsx:2-88` = `template-composer.test.tsx:2-88` (87 lines), `apps/api/src/sync/conflicts.integration.test.ts:53-103` with `move-block.integration.test.ts:45-94` and `merge.integration.test.ts:46-92`. Per-file harness copies; move each into a `*-harness.ts`.

Justified repetition: the per-block-type seed data, the fixtures, the golden JSON, `tokens.css`.

## 4. Inefficiencies

- Repeated database round trips (N+1): api `printVariant` per photo and `readOriginal` per certificate in the generate job (A-8); the PUT re-reading the file row four times (A-20); `pendingOfPhoto` twice per reading (A-21); `activeJob` twice per press over all job rows (A-9); registry candidates per create (A-1); the latest-op lookup for creates (A-23); web `photoTiles` 2-3 point reads per photo (W-7) and the file-store per-cycle scans (W-25); e2e `withSeedDb` opening a pool per test (E-7).
- Whole-table Dexie reads where an index exists or is missing: `outboxRows` (W-1), `heldDecisions` (W-5), `readingCountRows` (W-6), `photoTiles` (W-7), `editedSinceSnapshot` (W-8 in the web sweep: `remote_ops.where('seq').above(...)` across every stream), `lastOpIdFor`; `files.acked` is a boolean, which IndexedDB cannot key, so every upload scan is a `filter()` (`file-store.ts:123-125, 163, 182`, `sync-store.ts:395`, `home-store.ts:345`). Recommended v6 schema: `entities + [entity+relatorio_id]`; `remote_ops + [path+seq], [relatorio_id+seq]`; `outbox + relatorio_id`; `acked` as 0/1.
- Re-rendering from unstable values: the SyncProvider context (W-8), Home's two `homeCards` calls over every block and file on the device (`home-surface.tsx:85-87, 117-119`), `pointTitle` per card (K-15), three trees per ficha snapshot (K-2).
- Images processed more than once: two full decodes per upload (A-7); per-field `CropThumb` decodes (W-11); the watermark and `sizedImage` per TOC pass (A-24); LibreOffice re-decoding every image per pass is inherent to the multi-pass TOC; HEIC read twice on import (W-24). The camera path decodes once (good).
- Sync payloads: right-sized (push pages of 500 ops, blobs once, since-cursor pulls). The api relatório pull is O(stream) per page on the server side (A-2) and the company pull recomputes totals over every entity per device per minute (A-3).
- e2e fixed sleeps: 15 `waitForTimeout` sites, 9 of them proving a negative after a sleep (E-5); `home.spec.ts:162` adds 4 s to a `@p0` test.

## Audit cross-check

Against `_bmad-output/implementation-artifacts/reviews/audit-2026-09-30-stories-vs-code.md`, "Gaps that need code or tests":

| Audit item | Verdict | Evidence |
|---|---|---|
| 4.7 restore defect | confirmed, medium | K-14: `instantiate.ts:105` copies the template's text, `section-variables.ts:95-96` restores to null, `section-text-surface.tsx:97-98` falls back to the seed text; the template's text is editable (`template-composer.tsx:369, 516`). Refined: the whole-config put is by design; a merge-granularity limit. |
| 4.2 geolocation re-prompt | confirmed, low | W-14: `etapa5-local.tsx:40-54`, `[]` deps, no persisted marker, wrong comment; plus no cancelled guard. |
| 1.4 Dexie byte-equality | confirmed, medium (test) | `apps/web/src/db/porto-seguro-fixture.test.ts:37-55` counts rows only; `commit.test.ts:70-83` covers replay-small. One `it` asserting `serializeSnapshot(await toSnapshot(db, portoSeguro.relatorioId))` against the golden closes it. |
| export 401 wording | confirmed, low | W-23. |
| E12-A4 seed_version guard | confirmed absent; decision needed | no template check in `apps/api/src/sync/apply.ts`; `packages/domain/src/ops/apply.ts:406-412` writes any template field; `schemas/entities.ts:427` is shape-only; sheet puts are guarded (`assertSeedPath`, `apply.ts:196-226`). |
| 10.2 crop untested | confirmed (test) | every `source_suggestion_id` in `e2e/conflicts.spec.ts` (283, 669, 684) is null; no conflict-dialog test with one. |
| 10.1 two-device photos/points/setup | confirmed (test) | `e2e/merge.spec.ts:134-190` covers one photo on an NC item only. |
| 2.2 cover_background | confirmed (test) | no `cover_background` in `files.integration.test.ts`. |
| 2.6 criteria cases | confirmed (test) | `seed/criteria.test.ts:14-17` rejects one lump object; no 330 vs >400 case (147 GΩ vs >400 MΩ at line 29). |
| 5.1 "Próxima coluna" | confirmed (test) | label at `use-ficha-actions.ts:166`; no test names it. |
| 6.4 HEIC | confirmed (test) | `photo-import.test.ts:132, 149` inject a fake `convertHeic`; `photo-import.ts:97` is the real path. |
| 8.4 log fields and outcome default | refined | `outcome: 'ok'` is asserted on the attempt row (`job-prose.integration.test.ts:234, 264`); the structured log fields (`job.ts:148-154`) are not asserted anywhere. Gap is the log line only. |
| 12.5 dark theme at one point | confirmed (test) | `e2e/v09-visual.spec.ts:132-136`, one element at one viewport. |
| E11-A5 hardening | partly confirmed | the placeholder `SESSION_SECRET` in production is I-5; Vite on all interfaces is I-5; rate limits and Caddy headers are the security front's. |
| E11-A3 gate lock script | confirmed absent | nothing in `scripts/`; E-1 makes the orphan problem worse. |
| E11-A10, deferred 1005, 1221 | not re-verified | outside this front. |

## Top 10 actions

| # | Action | Effort |
|---|---|---|
| 1 | K-1: move the per-op zod parse in `applyOp` to the boundary; keep the goldens; add a fold benchmark from `kernel-timing.ts` | M (1 day, both sides) |
| 2 | K-2, K-15, K-16, K-17: memoize `locationTree` per snapshot, give `firstInTree` and `sheetProgress` an O(s) path, index equipment nodes for `pointTitle`; re-time `commit-to-render.perf.spec.ts` | M (1 day) |
| 3 | W-1, W-3, W-5 to W-8: prune the outbox, v6 Dexie indexes (`[entity+relatorio_id]`, `[path+seq]`, `[relatorio_id+seq]`, `acked` 0/1), status-filtered live reads, split the sync context | L (2-3 days) |
| 4 | A-4, A-6, A-5: stop issuing a revision on a failed photo read; S3 request timeouts; a total budget for certificate rasterization | S (half a day) |
| 5 | O-1, O-2, O-3: inference timeout and semaphore in the OCR sidecar, pixel cap in code, compose memory limit | S (half a day) |
| 6 | E-1, E-2, E-3, E-4: signal handling and stage timeout in `verify.ts`, `summary.json` start stamp, scoped `test-reset`, transactional and company-scoped fixture removal | S (half a day) |
| 7 | K-14, K-3, K-4, K-12, W-4, W-9: restore to the template's text, Sao Paulo calendar day in calibration, month clamp, one date-range formatter, `runFreshCycle` for "Sincronizar agora", catch on photo edits | S (half a day) |
| 8 | A-1, A-2, A-3, A-8: registry map per push, `UNION ALL` relatório pull, partial index for totals and a larger pool, snapshot-keyed print variants | M (1 day) |
| 9 | W-15 to W-20: move the seven surface rules into the kernel (`sheetActions`, `conclusionMissing`, `acceptsAutoConfirm`, `restoreSheetOps`, project counters with suggestions) | M (1 day) |
| 10 | Duplication groups 1-4 (e2e support), 6-7 (api), 8-12 (web), I-1 and I-2 (e-mail default, image tags), the audit's 1.4 test | M (2 days, spread over stories) |

Raw outputs: `test-results/full-review-2026-09-30/kernel-timing.ts`, `kernel-timing.txt`, `jscpd-report.json`, `jscpd-source-clones.json`.
