---
title: 'Stories 8.2 and 8.6 (plus the web half of 8.5): Photograph the plate, keep it until there is signal, confirm it in one tap'
type: 'feature'
created: '2026-09-27'
status: 'in-progress'
baseline_revision: '842bb34c25ddeb5cfa47fd4cc40cbac35f76f52c'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-1-suggestion-entity.md'
warnings: ['batched', 'oversized', 'multiple-goals']
batched_reason: 'Batch P of the Epic 8 delivery: 8.2 (plate tile, queued states, arrival) and 8.6 (plate crop, Flow 2b) share the nameplate group and one e2e walk; the web half of 8.5 ("Criar ⟨nome⟩?", verify rendering) is the same field.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 8.1 renders pending suggestions, but nothing on the sheet takes the plate photo, shows the reading's progress or failure, shows the plate crop with the focused field's region, announces arriving readings, offers "Criar ⟨nome⟩?" for an unknown manufacturer, or counts readings in Sync status; the pre-issue row "N fichas com sugestões por confirmar" is missing too.

**Approach:** Add the "Fotografar placa" tile (single shot, photo created with `reading_kind: plate`), a plate photo row with its reading line (queued / running / failed with "Tentar novamente" -> `POST /api/photos/{id}/reread` and "Preencher manualmente"), the plate crop above a ready group, the create-hint confirm, the arrival toast and the sheet banner, the Sync status "Leituras" rows, a sweep that auto-confirms any equal pending suggestion after each pull, and (last, on top of Epic 7) the pre-issue warning. Every rule and derived text in `packages/domain`.

## Boundaries & Constraints

**Always:**
- AD-1/AD-13: rules, states, counts and derived texts in `packages/domain`; `apps/web` renders from IndexedDB and writes ops. Fixed copy in `apps/web/src/copy/pt-br.ts` (surface) or `copy/ui.ts` (component chrome), per AGENTS.md.
- Nothing unconfirmed is written, counted as filled or printed; the engineer's value is never overwritten without a tap (Story 8.1 batches unchanged).
- The plate photo is a normal sheet photo (Story 6.1 path, `commitPhotoCapture` with `reading`), caption `placa de identificação`, `reading_target: {block_id, block_type}`, `reading_status: queued`; it shows in the gallery like any other photo.
- Mock class names: `.camera-group` > `.camera-capture-tile` (`60-ficha.html` "empty" state, lines ~313-316, WITHOUT the "Digitar" link, source-deltas D-6); `.photo-row.ficha-np-photo` > `.photo-tile` + `.photo-text` (`.photo-caption`, `.photo-meta`, `.queued-banner`) (lines ~318-323); `.plate-crop` > picture + `.region` (line ~328); `.reading-line` for "Lendo…" and the failure line (`components.css:450`). `tokens.css`/`components.css` untouched; new rules in `app.css` (or `ficha.css`) with a comment naming the mock rule mirrored.
- No op family, no schema change, no `CONTRACT_VERSION` bump (contract 5 already carries everything). If a gap appears, say so in the report.

**Never:**
- Do not edit `scripts/e2e.ts`, `playwright.config.ts`, any `vitest.config.ts`, or e2e support helpers other than new files of this batch (batch T runs in parallel). New e2e helpers go in a NEW file `e2e/support/reading-ops.ts`.
- No api route, job or server code (batch R owns `POST /api/photos/{id}/reread`, the reading job and `reading_status` server ops); the web only calls the route.
- Do not touch `preIssue` / Sumário row 9 / the Export dialog in the implementation pass: the orchestrator adds the pre-issue row after Epic 7 merges.
- No Playwright config change, no Playwright MCP browser pass.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Empty plate | no live plate photo for the block | `.camera-group`: the copy chips (unchanged markup, moved inside) then the `.camera-capture-tile` "Fotografar placa"; fields visible below | camera denied -> the existing `.camera-denied` reason under the tile |
| Single shot | tile tapped, one shutter | camera closes by itself after the first shot; the photo is committed with `reading_kind: plate`, caption, target, `reading_status: queued`; a sync cycle is requested | capture failure -> existing failed toast |
| Queued | plate photo `reading_status = queued` | `.photo-row.ficha-np-photo` (thumb with number badge, caption, meta) + `.queued-banner` "Foto guardada — leitura quando houver sinal" + section note "Os campos continuam digitáveis; o que você digitar não é sobrescrito pela leitura." | - |
| Running | `reading_status = running` | same row, `.reading-line` "Lendo…" instead of the queued banner | - |
| Failed | `reading_status = failed` | same row, `.reading-line` (role status) "Não foi possível ler" + `btn btn-text` "Tentar novamente" and "Preencher manualmente"; the photo stays, nothing written | "Tentar novamente" offline: disabled with reason (existing `disabledReason` pattern, copy "Sem conexão"-style authored); a non-2xx answer -> toast "Não foi possível pedir a nova leitura" (authored); a 2xx -> `requestSyncCycle()` |
| Preencher manualmente | tap | focus moves to the first empty nameplate field | - |
| Ready | pending suggestions whose `source.photo_id` is the plate photo exist | no photo row; `.plate-crop` (full width, height ≤ 160 px) draws the union of those suggestions' `bbox`es (kernel, with a small margin, clamped 0..1) fitted inside the box keeping its aspect; the focused nameplate field's `bbox` (its pending suggestion, else its confirmed source from this photo) is outlined as one `.region`; tap opens the Photo viewer zoomed on the union region; `role="img"` + aria-label "Recorte da placa lida — as regiões marcam os campos sugeridos" | picture not available -> `.thumb-fake` |
| Done, nothing pending | `reading_status = done`, no pending from it | the photo row with its meta, no reading line | - |
| Group note | fills pending from plate photo N | "9 sugestões lidas da foto 3. Nada foi gravado: …" (photo number from `numberPhotos`) | number unknown -> the 8.1 text without "da foto N" |
| Create hint | pending `suggested` manufacturer fill with `hint.create_registry_entry = {kind: 'manufacturer', name}` and the name absent from the device registry | the confirm button reads "Criar Celtta?" and its accessible name stays the kernel announcement; tap writes ONE batch: the registry `create` (`createWordOp`) + the confirm pair; "Confirmar todos" skips it (like `verify`) | name already in the registry (normalized) -> plain "Confirmar" (confirm pair only) |
| Typed unknown manufacturer | engineer types a name over a manufacturer guess that is not in the registry | ONE batch: registry create + typed put + discard | known name -> typed put + discard (8.1) |
| Arrival toast | new pending suggestion ids appear on the device after mount (pulled) | toast "3 leituras prontas para confirmar" (n = distinct `source.reading_run_id` among the new ids) with action "Ver" -> `/relatorio/{id}/ficha/{blockId}` of the first sheet with pending suggestions of the newest arrival's relatório (`firstSheetWithPendingSuggestions`) | ids present at first observation never toast |
| Sheet banner | the open sheet's block has pending suggestions | info banner in the one slot (`useExtraBanner`, kind `suggestions-ready`): "Sugestões prontas — N campos para confirmar" | lower-priority than conflict/re-auth/storage/draft by the existing `pickBanner` |
| Sync status | photos with `reading_status` queued/running, pending suggestion rows on the device | section "Leituras" with `.sync-row`s "N leituras na fila" and "N sugestões por confirmar" (each only when > 0; section absent when both 0); `SyncProvider` feeds `syncCounts(outbox, {suggestions, photos})` from live queries | - |
| Sweep | after each successful pull, any local pending suggestion (any origin) whose nameplate target now holds an equal value | auto-confirm batch (`meta.auto = true`, engineer's value written back) — replaces the pulled-creates-only pass; a failure is logged and retried at the next pull | issued relatório, removed block, no author -> skipped |

</intent-contract>

## Code Map

- `apps/web/src/surfaces/ficha/nameplate-section.tsx` -- the group; add the tile / photo row / plate crop above the grid, pass focus tracking; chips at lines 110-129.
- `apps/web/src/surfaces/ficha/nameplate-suggestions.tsx` -- `useNameplateSuggestions` (confirm, confirmAll, type, viewer with `zoom`), `SuggestionGroupHead`, `SuggestionFill`; add the create-hint confirm and the typed-unknown-manufacturer batch; `createWord` pattern in `nameplate-section.tsx:98`.
- `apps/web/src/components/suggestion-field.tsx` -- props `onConfirm`, `announcement`, copy `ui.suggestionField`; add an optional confirm label (default "Confirmar").
- `apps/web/src/components/crop-thumb.tsx` -- `useCropSource` (local original, else fetched `original` kept as `crop`), `regionStyle`; export/reuse for the plate crop.
- `apps/web/src/surfaces/ficha/camera-view.tsx:41` `useCamera(relatorioId, target, opener)` -- add a single-shot option (finish after the first grab); `photo-openers.tsx` openers; `use-ficha-photos.ts` `photoTarget`, `useBlockPhotoTiles`.
- `apps/web/src/surfaces/ficha/use-photo-capture.ts:30` `CaptureTarget` -- add `reading?`; pass it to `PhotoCaptureInput.reading` (`db/file-commit.ts:86`).
- `apps/web/src/db/photo-store.ts:18` `PhotoTile` -- add `reading_kind`, `reading_status`.
- `apps/web/src/components/photo-row.tsx` -- `useObjectUrl`, `PhotoRow`; the gallery/sheet photo meta text functions in the kernel (grep `photoMeta`/`provisório` in `packages/domain/src/photos`).
- `apps/web/src/surfaces/photos/photo-viewer.tsx` -- `PhotoViewer` with `zoom`.
- `apps/web/src/state/extra-banner.tsx` `useExtraBanner`; `state/banner-slot.tsx` kind `suggestions-ready` (already ranked).
- `apps/web/src/state/toast.tsx` `showToast(text, {action})`; `apps/web/src/surfaces/app-shell.tsx` -- mount point for the arrival watcher (router + toast available).
- `apps/web/src/state/sync.tsx:202` `syncCounts(rows)` -- add the reading inputs; `SyncState` gains `rereadPhoto(id)`; `apps/web/src/sync/client.ts` -- add `rereadPhoto(id)` (`POST /api/photos/{id}/reread`, same auth/credentials as `fetchFile`).
- `apps/web/src/surfaces/sync/sync-status-surface.tsx` -- add the "Leituras" section (mock `85-sync.html:59-70`: `.section` > `.section-head h2 "Leituras"` > `ul.sync-list` > `li.sync-row` > `.sr-body .sr-primary` + `.sr-state[data-tone="pending"]`).
- `apps/web/src/db/suggestion-store.ts` `autoConfirmPulled` + `apps/web/src/sync/engine.ts:386` `autoConfirm` -- turn into the sweep over every local pending suggestion (entities where `entity = 'suggestion'`).
- `apps/web/src/surfaces/ficha/ficha-surface.tsx` -- where `NameplateSection` gets `state`, `snapshot`; publish the sheet banner here.
- Kernel: `packages/domain/src/relatorio/suggestions.ts` (texts at 388-428, `confirmAllCandidates:240`, `suggestionGroupCounts:247`, `firstSheetWithPendingSuggestions` (grep)), `packages/domain/src/sync/counts.ts` (`ReadingCountInputs`), `packages/domain/src/photos/` (`numberPhotos`, `upload-order.ts` already ranks readings first), `text/plural.ts`, `text/normalize-name.ts` `normalizeRegistryName`.
- E2E: `e2e/suggestions.spec.ts` (8.1 walk and helpers `suggest`, `cell`, `suggestionStatus`), `e2e/support/photos.ts` (`openChaveSheet`, `expectCameraOpen`, `devicePhotos`), `e2e/support/push-server-ops.ts` (`pushSuggestion` pattern: `applyOps(..., {origin: 'server'})`), `e2e/support/sync.ts` (`syncNow`, `syncNowAndReturn`), `e2e/support/outbox.ts` `readStore`. The fixture plate is described in `services/ocr/tests/fixtures/plate-transformador.md` (transformer `transformador_forca` field keys).

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/relatorio/suggestions.ts` (+ tests) -- `PLATE_CAPTION = 'placa de identificação'`; `platePhotoOf(photos, blockId)` (newest live photo with `reading_kind = 'plate'` and that `block_id`, by `local_seq` then `captured_at`); `plateReadingView(photo, pending)` -> `'queued' | 'running' | 'failed' | 'ready' | 'done'` (`ready` when a pending suggestion's `source.photo_id` is the photo, whatever its status); `plateCropRegion(pending, photoId)` (union bbox + margin, clamped) and `regionWithin(outer, inner)` (percent box for the outline); `hasCreateHint(s, registry)` (hint present and `normalizeRegistryName(name)` absent from live registry rows); `confirmAllCandidates` / `suggestionGroupCounts` skip create-hint fills (counted apart, e.g. `create`); `criarText(name)` "Criar Celtta?"; `suggestionGroupNoteText(n, verify, photoNumber?)` adds "da foto N"; `leiturasProntasText(n)` "3 leituras prontas para confirmar" / "1 leitura pronta para confirmar"; `arrivedReadingsCount(newRows)` (distinct `reading_run_id`); `leiturasNaFilaText(n)` "2 leituras na fila" / "1 leitura na fila"; `sugestoesProntasBannerText(n)` "Sugestões prontas — 9 campos para confirmar"; `unknownManufacturer(field, value, registry)` for the typed path.
- `apps/web/src/surfaces/ficha/use-photo-capture.ts`, `camera-view.tsx`, `photo-openers.tsx` -- `CaptureTarget.reading?`, single-shot mode, a `PlateCaptureTile` opener (`.camera-capture-tile`, `i-camera`, "Fotografar placa", denied reason).
- `apps/web/src/db/photo-store.ts` -- `PhotoTile.reading_kind`, `reading_status`.
- `apps/web/src/surfaces/ficha/plate-photo.tsx` (new) -- the tile/photo row/reading line/plate crop per the matrix; "Tentar novamente" via `useSync().rereadPhoto`; "Preencher manualmente" focuses the first empty field (reuse `firstFocusable`).
- `apps/web/src/surfaces/ficha/nameplate-section.tsx`, `nameplate-suggestions.tsx`, `components/suggestion-field.tsx` -- wire the plate block, focus tracking for the outline (focus within `.nameplate-grid` -> `[data-field-key]`), the create-hint confirm, the typed unknown manufacturer, "da foto N".
- `apps/web/src/state/sync.tsx`, `sync/client.ts`, `surfaces/sync/sync-status-surface.tsx` -- reading inputs to `syncCounts`, `rereadPhoto`, the "Leituras" rows.
- `apps/web/src/state/reading-arrivals.tsx` (new, mounted in `app-shell.tsx`) -- the arrival toast; `ficha-surface.tsx` -- the sheet banner.
- `apps/web/src/db/suggestion-store.ts`, `sync/engine.ts` -- `autoConfirmPending(db, author, deps)` sweep after each pull (keep `autoConfirmPulled` only if other callers need it); unit tests incl. a copy-chip-equal value and a retry after a thrown commit.
- `apps/web/src/copy/pt-br.ts`, `copy/ui.ts` -- the fixed strings of the matrix (tile word, queued banner, "Lendo…", "Não foi possível ler", "Tentar novamente", "Preencher manualmente", fields note, crop aria-label, "Leituras", toast action "Ver", authored error lines marked `// authored:`).
- Web unit tests -- component tests for the plate block states, the create-hint button, the Sync rows, the arrival watcher (no toast for rows present at mount).
- `e2e/support/reading-ops.ts` (new) -- `pushReadingStatus(companyId, relatorioId, photoId, status, actorId)` (server `put` on `file/{id}/reading_status` as `system:reading`, `origin: 'server'`) and `pushPlateSuggestions(...)` (the fixture-shaped set, with `hint` support), same pattern as `pushSuggestion`.
- `e2e/plate.spec.ts` (new) -- `@p0` (1) offline capture: tile -> one shutter -> camera closes; the outbox holds the photo create with `reading_kind: 'plate'`, `reading_status: 'queued'`, caption, target; the photo row shows "Foto guardada — leitura quando houver sinal"; the fields stay typeable. (2) online: sync pushes it; seeded `running` -> "Lendo…"; seeded `failed` -> the failure line; "Tentar novamente" sends `POST /api/photos/{id}/reread` (asserted by `page.route` interception, fulfilled 202 until batch R merges); "Preencher manualmente" focuses the first empty field. (3) Flow 2b on a `transformador_forca` sheet: engineer types TENSÃO NOMINAL AT first; seeded suggestions from the plate photo (7 grounded `suggested`, `n_serie` `verify` with one wrong digit, `fabricacao` "Celtta" with the create hint, `tensao_nominal_at` 15 kV); pull -> arrival toast "1 leitura pronta para confirmar" -> "Ver" opens the sheet; the plate crop shows, focusing a suggested field outlines one `.region`; "Confirmar todos (7)" writes one batch of 7 confirm pairs; the typed field keeps its value with "Sugerido: 15 kV — Substituir"; "Criar Celtta?" writes one batch (registry create + confirm pair) while offline; the verify field fixed with two keystrokes then Confirmar writes typed put + discard; the outbox proves every batch. `@p1`: Sync status "Leituras" rows counts; the sheet banner "Sugestões prontas"; the plate group at 390 px without horizontal overflow; the plate photo uploads before an older plain photo (or a unit test of `pendingUploads` if already covered).

**Acceptance Criteria:**
- Given an empty nameplate, when "Fotografar placa" is tapped and one shot taken (offline), then the camera closes, one `file/{id}` create with `reading_kind: plate`, `reading_target: {block_id, block_type}`, `reading_status: queued` and caption "placa de identificação" is in the outbox, the gallery lists the photo, and the group shows its row with "Foto guardada — leitura quando houver sinal" while every field stays typeable.
- Given the plate photo's reading is `running`, when the sheet renders, then "Lendo…" shows under the photo; given `failed`, then "Não foi possível ler" with "Tentar novamente" (sends `POST /api/photos/{id}/reread`) and "Preencher manualmente" shows, the photo stays and nothing is written.
- Given suggestions from the plate photo arrive on pull, when the tab is open, then the toast "N leituras prontas para confirmar — Ver" opens the first sheet with pending suggestions, the sheet shows the "Sugestões prontas" banner, the plate crop (≤ 160 px) shows above the fields with the focused field's region outlined, and the group note names "da foto N".
- Given the Flow 2b plate, when walked, then "Confirmar todos (7)" confirms the seven in one batch, the typed field keeps its value with "Sugerido: 15 kV — Substituir", "Criar Celtta?" creates the manufacturer and confirms the field in one batch offline, the `verify` field is fixed with two keystrokes, and the outbox holds exactly the Story 8.1 batches.
- Given readings queued or suggestions pending, when Sync status opens, then its "Leituras" section shows "N leituras na fila" and "N sugestões por confirmar" from `syncCounts`.
- Given a pending suggestion whose target later holds an equal value by any path, when the next pull finishes, then the device auto-confirms it once.
- (Orchestrator, after Epic 7 merges) Given sheets with pending suggestions, when the Sumário row 9 or the Export dialog renders, then "N fichas com sugestões por confirmar" is a warning that never blocks.

## Spec Change Log

## Review Triage Log

## Design Notes

- Wiring owners: `POST /api/photos/{id}/reread`, the reading job and the `reading_status` server ops are batch R's; this batch calls the route and seeds server ops in e2e. The true job-driven walk is the integrated QA's. Integration risk for QA: once R merges, a real upload of an e2e plate photo enqueues the `fake` job for an unknown sha256, which may write `failed`/suggestions concurrently with the seeded ones.
- Open question: Flow 2b and 8.5 do not say whether "Confirmar todos" takes the create-hint manufacturer; the conservative reading (a registry row needs its own tap) skips it, and the toast's skipped clause keeps counting `verify` fields only.
- Open question: "a field typed first is excluded from incoming suggestions" is read as Story 8.1's replace view (value kept, "Substituir" offered), which is what Flow 2b shows.
- Open question: "Foto guardada — leitura quando houver sinal" is shown for `queued` whether or not the device is online (the server moves it to `running` at file receipt); "Lendo…" for `running`.
- Open question: the Sync status headline stays as is; the counts go in the mock's "Leituras" section.
- Open question: the plate crop outlines only the focused field's region (story text), not every region at once (mock).

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:unit > /tmp/unit-s8p.log 2>&1; tail -30 /tmp/unit-s8p.log` -- green.
- `docker compose --profile tools run --rm tools pnpm lint` and `pnpm static` -- green.
- One spec at a time through the repo runner, e.g. `docker compose --profile tools run --rm tools pnpm test:e2e -- e2e/plate.spec.ts` (check `scripts/e2e.ts` for the exact pass-through) -- green; also re-run `e2e/suggestions.spec.ts`.
- The orchestrator runs `pnpm verify` and `pnpm test:e2e:full` under `flock /tmp/fasor-verify.lock`.
