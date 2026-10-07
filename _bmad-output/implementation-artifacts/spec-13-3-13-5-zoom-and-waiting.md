---
title: 'Stories 13.3 and 13.5: pinch-zoom the photo, and a reading that shows its age, cancels and never dead-ends'
type: 'feature'
created: '2026-10-07'
status: 'in-progress'
baseline_revision: 'b1c2c6b1a411a41d783bfa7ef50834cb94c68380'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-13-context.md'
  - '{project-root}/AGENTS.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_reason: 'Epic 13 batch C: both stories live on the reading surfaces (photo viewer, plate crop, reading lines) that batch C owns, so one branch avoids cross-batch conflicts on those files.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The photo viewer only zooms programmatically onto a suggestion's crop, so the engineer cannot use their own photo as a magnifier (CAP-3). A pending reading shows a bare "Lendo…" with no age and no way out, its 5 s fast poll silently falls back to 60 s after 120 s (WAIT-1), a failed display reading has no retry (WAIT-2), and leaving the panel-capture dialog orphans the photo and its suggestion (WAIT-3). Findings: `_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/review-field-ux-2026-10-06.md` lines 21, 33-35.

**Approach:** One shared pointer-event zoom hook drives the Photo viewer (pinch, double-tap, visible zoom buttons, pan while zoomed) and the inline plate crop (pinch and pan). The kernel derives the reading's age and its still-reading state; the web shows "Lendo… 30 s" plus "Cancelar" from 10 s, an authored still-reading note from 120 s, a display-failure line with "Tentar novamente" and "Digitar", and a palette row plus a "Ver" route that bring an orphan panel photo's dialog back. No contract change, no new op kind.

## Boundaries & Constraints

**Always:**
- Ownership AD-1/AD-13: every derived text, threshold, verdict and rule ("which suggestions a cancel discards", "which panel photos await", the elapsed text) lives in `packages/domain`; the web renders from IndexedDB and writes ops only. Authored words go to `apps/web/src/copy/pt-br.ts` marked `// authored:` (append one Epic 13 batch C block per surface; do not reorder other blocks).
- Cancel discards through the existing `discardSuggestionOp` (`packages/domain`), via the post-pull sweep pattern of `discardStaleProse` (`apps/web/src/db/suggestion-store.ts:148`), guarded by `commitBatchIf(... stillPending ...)`; never on an issued relatório. The photo is kept.
- Every control 48 px hit area at 390 px; no swipe navigation; Escape and "Fechar" keep closing the viewer and returning focus; "Anterior/Próxima", "Editar legenda", "Remover" unchanged.
- The programmatic crop zoom (`ZoomedPicture`, `photo-viewer.tsx:198`; `PlateCrop` focus zoom, `plate-photo.tsx:201` via `plateCropView`) stays the base view (scale 1) the user zoom starts from.
- `LLM_PROVIDER`/`OCR_PROVIDER` stay `fake`; the e2e injects the delay on the client (`holdPhotoBytes`, `e2e/support/reading-ops.ts:214`, then `page.unroute`) or with Playwright `page.clock`; no server-op seeding for the cancel pipeline test.
- No emoji. English code and comments.

**Never:**
- Do not edit `camera-view.tsx`, `use-photo-capture.ts`, `files/photo-encode.ts`, `files/capture-rescue.ts` (batch A), `ficha-fields.tsx`, `components/number-input.tsx`, `components/date-field.tsx`, `ficha-surface.tsx` header (batch B), `apps/api/src/jobs/reading/providers/fake.ts` or `providers/fixtures/` (batch D).
- No `CONTRACT_VERSION` bump, no new op path, no server change, no new reading kind. Cancel does not stop the server job.
- No swipe gestures, no browser page-zoom reliance, no third-party gesture library.
- The panel dialog's existing "Cancelar" keeps its Story 9.2 meaning (removes the unconfirmed photo); 13.5's keep-the-photo cancel applies to plate and display readings.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Pinch in viewer | two touch pointers spread on `.viewer-photo` | scale grows up to native resolution (1 image px per CSS px, never below fit = 1); one pointer pans while zoomed | scale clamped [1, max]; pan clamped to the picture's edges |
| Double-tap / double-click | two taps within 300 ms on the photo | toggles fit and 2x (capped at max), centred on the tap point | a single tap does nothing |
| Zoom buttons | "Ampliar" / "Reduzir" / "Ajustar à tela" in the viewer | step x1.5 / ÷1.5 / back to fit; disabled at the bounds with their reason | none |
| Crop-zoomed viewer | opened from a crop (`zoom` set) | lands on the crop as today; user zoom multiplies on top; Anterior/Próxima reset to fit | none |
| Inline plate crop pinch | two pointers on `.plate-crop` | zooms and pans inside the 160 px box; a single tap still opens the viewer; a field focus change resets the user zoom to the focus view | one-finger vertical drag at scale 1 scrolls the sheet (`touch-action: pan-y`) |
| Reading under 10 s | photo queued (online) or running, age < 10 s | "Lendo…" exactly as today, no Cancelar | none |
| Reading at 10 s+ | age >= 10 s | "Lendo… 12 s" (kernel), ticking, and "Cancelar" (authored) | offline the queued wording stays and no Cancelar shows (nothing runs) |
| Reading at 120 s+ | age >= `READING_FAST_POLL_WINDOW_MS` | elapsed line plus authored still-reading note; engine keeps polling at 60 s until a result or the job's failure | never a silent stop |
| Cancel | tap "Cancelar" on a plate row or display cell/env banner | line gone at once; record `reading_cancelled:{photoId}` in `local_prefs`; pending suggestions of that photo now or later are discarded by the sweep; no arrival toast for them; photo kept | a commit failure is logged, the row stays pending, the next sweep retries |
| Reread after cancel | "Tentar novamente" on a later failure | clears the cancel record before asking; the new run's suggestions show normally | as the plate's `FailedReading` |
| Display reading failed | display photo `reading_status: failed`, target cell empty | under the cell: "Não foi possível ler", "Tentar novamente" (disabled offline with "Sem conexão", disabled after a press with "Nova leitura pedida", persisted like `reread_asked`), "Digitar" (focuses the cell input) | a typed value in the cell hides the failure line on that cell |
| Panel dialog left by navigation | live photo with `reading_kind: panel` not confirmed, user navigated away | reopening the palette for that location shows one row per such photo with its state ("Lendo a foto…" or the kernel proposal text); a tap reopens the result dialog for it (Confirmar/Cancelar/Fotografar de novo as in 9.2) | a photo removed meanwhile disappears from the list |
| Arrival toast "Ver" | the newest arrival is a panel suggestion on such a photo | navigates to `/relatorio/{id}?panel={photoId}`; the Sumário opens that photo's result dialog | photo gone or confirmed: the Sumário alone |

</intent-contract>

## Code Map

- `apps/web/src/surfaces/photos/photo-viewer.tsx` -- `ViewerBody` (l.76) renders `.viewer-photo` with `<img class="viewer-img">` or `ZoomedPicture` (l.198, SVG viewBox on the crop); wrap the picture in a zoom stage; add zoom buttons; key the zoom state by `tile.id`.
- `apps/web/src/surfaces/photos/photos.css` -- viewer rules l.60-86, 170-171; the viewer scrolls inside itself (l.86); the new stage/button rules go here, `// authored:`.
- `apps/web/src/surfaces/ficha/plate-photo.tsx` -- `PlateCrop` (l.201, `.plate-crop-open` > `.plate-crop` > `.plate-crop-view`), `PlatePhotoRow` (l.45, reading line l.66-110), `FailedReading` (l.130-185, reread + `local_prefs` via `db/prefs.ts:163-176`). Extract `FailedReading` to a shared component (same file export or `ficha/reading-line.tsx`) taking `{photoId, statusOpId, canRetry, onFallback, fallbackLabel}` so display cells reuse it.
- `apps/web/src/surfaces/ficha/read-display.tsx` -- `useDisplaySuggestions` (l.138; `queued` from kernel `displayQueuedCells`, l.157), `QueuedBanner` (l.235), `ReadingCell` (l.282), `envAfter` (l.625, env banner l.632). Add the elapsed/cancel/still-reading line and the failed state here.
- `apps/web/src/surfaces/ficha/nameplate-suggestions.tsx` -- `useCropViewer` (l.110) holds `tiles` (with `reading_status_op_id`); read only, reuse its tiles for the display cells' status op ids.
- `apps/web/src/db/photo-store.ts` -- `readingStatusOpId` (l.45) reads `remote_ops` `[path+seq]`; add `reading_status_at` (that op's timestamp) to `PhotoTile`.
- `apps/web/src/db/prefs.ts` -- add `reading_cancelled:{photoId}` read/write/clear/readAll beside `reread_asked`.
- `apps/web/src/db/suggestion-store.ts` -- add `discardCancelledReadings(db, author, deps)` modeled on `discardStaleProse` (l.148); `hasRunningReading` (l.238) unchanged.
- `apps/web/src/sync/engine.ts` -- `READING_POLL_INTERVAL_MS`/`READING_POLL_WINDOW_MS` (l.161-162), cadence l.672, sweep wiring l.493-494. Import the window from the kernel; call the new sweep beside `discardStaleProse`.
- `apps/web/src/surfaces/relatorio/panel-capture.tsx` -- `PanelCaptureHandle.open` (l.46), `Shot`, `isOpen` rule; add `resume(photoId, target)` that sets the shot without opening the camera.
- `apps/web/src/surfaces/relatorio/block-palette-field.tsx` -- `FieldPalette` (l.79), `.pal-camera` (l.124); add the awaiting-photos rows and an `onResume` prop.
- `apps/web/src/surfaces/relatorio/relatorio-tree.tsx` -- `panelRef` (l.182), palette `onPhotograph` (l.355), `<PanelCapture>` (l.364); wire `onResume` and the `?panel=` param (read once, then cleared with `replace`).
- `apps/web/src/state/reading-arrivals.tsx` -- `arrivalTarget` (l.~75) builds "Ver"'s route; panel arrivals route to `?panel=`.
- `packages/domain/src/relatorio/measurement-suggestions.ts` -- `DisplayQueuedState` (l.218), `displayQueuedCells` (l.226), `displayQueuedEnv` (l.240): add `failed` (only on a cell or env field without a value) and expose the photo id per entry.
- `packages/domain/src/relatorio/panel.ts` -- `panelReadingLine` (l.~65), `panelReadingTarget`; add `panelPhotosAwaiting`.
- `packages/domain/src/relatorio/plate-suggestions.ts` -- the plate reading view; home for the wait helpers if no better reading module exists (`packages/domain/src/reading/` is the alternative).
- `apps/web/public/sprite.svg` -- no zoom icons yet (has `i-plus`); add `i-zoom-in`, `i-zoom-out`, `i-zoom-fit` symbols in the sprite's style.
- Tests to extend or mirror: `apps/web/src/sync/engine.test.ts:1363`, `apps/web/src/surfaces/ficha/plate-photo.test.tsx`, `e2e/plate.spec.ts:112`, `e2e/read-display.spec.ts`, `e2e/read-display-pipeline.spec.ts`, `e2e/panel-capture.spec.ts`, `e2e/support/reading-ops.ts`.
- `playwright.config.ts:64-86` -- the durability projects match `/durability\.spec\.ts/` only; the touch spec must be named `*.durability.spec.ts`.

## Tasks & Acceptance

**Execution:**
- `packages/domain` -- add and export from the index: `READING_FAST_POLL_WINDOW_MS = 120_000`, `READING_CANCEL_AFTER_MS = 10_000`; `readingStartedAt({captured_at, reading_status_at, reread_at})` (latest non-null ISO); `readingWait(startedAt, nowIso)` -> `{ text: 'Lendo…' | 'Lendo… 12 s' | 'Lendo… 2 min 05 s', cancellable, stillReading }` (age clamped >= 0; seconds under a minute, else `M min SS s`); `cancelledReadingSuggestions(pending, cancelledPhotoIds)` (pending rows whose `source.photo_id` is cancelled); `failed` in `displayQueuedCells`/`displayQueuedEnv` with each entry's `photoId`; `panelPhotosAwaiting(photos, locationId)` (live photos with `reading_kind: 'panel'`, `reading_target` equal to `panelReadingTarget(locationId)`, capture order). Unit-test each, the I/O matrix rows that are kernel rules included.
- `apps/web/src/sync/engine.ts` -- import the window constant from the kernel (keep `READING_POLL_WINDOW_MS` exported as an alias); run `discardCancelledReadings` in the post-pull sweep before `autoConfirmPending`. Engine unit test: past the window with a reading still `running`, cycles keep coming every `SYNC_INTERVAL_MS` (never stop) until it clears.
- `apps/web/src/db/prefs.ts`, `db/suggestion-store.ts`, `db/photo-store.ts` -- the cancel record API, the sweep, `reading_status_at` on tiles. Unit tests for the sweep (cancelled photo discarded, others untouched, issued skipped, confirmed-meanwhile skipped).
- `apps/web/src/surfaces/ficha/` -- a shared `ReadingWaitLine` (role=status; renders `readingWait` text ticking every second while shown, "Cancelar" `TextButton` when `cancellable` and a reading actually runs or is queued online, the authored still-reading note when `stillReading`); used by `PlatePhotoRow` and `QueuedBanner`/`envAfter`. Cancel writes the record (and discards already-pending rows of that photo at once through the same kernel rule) and hides the line. The shared failed line (extracted `FailedReading`) on display cells and env fields with "Digitar" focusing the field input; "Tentar novamente" clears the cancel record before asking.
- `apps/web/src/surfaces/photos/` and a new `apps/web/src/input/use-pinch-zoom.ts` -- pointer-event zoom (pinch from two pointers' distance, pan from one pointer while scale > 1, double-tap/double-click toggle, `wheel` with ctrlKey for trackpads), returns `{scale, x, y}` and handlers, clamps to `[1, maxScale]`, resets on a `resetKey`. The viewer stage uses `touch-action: none`, applies a CSS `transform` to the picture (img or the crop SVG), adds three 48 px `icon-btn`s in `.viewer-top` (labels authored: "Ampliar", "Reduzir", "Ajustar à tela") disabled at the bounds. `PlateCrop` uses the same hook for pinch/pan only (no double-tap, the tap opens the viewer), `touch-action: pan-y` at scale 1, reset when `focused` changes. Expose `data-zoom-scale` on the stage for tests.
- `apps/web/src/surfaces/relatorio/` -- `PanelCapture.resume`; palette rows for `panelPhotosAwaiting` (authored row label, text from `panelReadingLine`/`panelProposal`, a tap closes the palette and resumes); the tree's `?panel=` handling; `reading-arrivals.tsx` routes a panel arrival on an awaiting photo there. Elapsed `readingWait` text also replaces the dialog's "Lendo a foto…" line after 10 s (no new cancel there).
- `apps/web/src/copy/pt-br.ts` -- one appended block for batch C: `cancel: 'Cancelar'`, `stillReading` note, `typeInstead: 'Digitar'`, the zoom button labels and their disabled reasons, the palette row label; each `// authored:`.
- `e2e/photo-zoom.durability.spec.ts` (new) -- `@p0`: on touch (synthetic `PointerEvent`s with `pointerType: 'touch'`, two pointers; `test.use({ hasTouch: true })` where the project lacks it) pinch zooms the gallery viewer and a pan moves it, double-tap toggles, buttons step and disable at the bounds, Escape closes and focus returns to the tile; the crop-opened viewer still lands on the crop region (`data-zoom`) and zooms from there; the inline plate crop pinches and a tap still opens the viewer; at 390 px every viewer control's box is >= 48x48 and nothing overflows horizontally. Runs on all three durability projects.
- `e2e/reading-wait.spec.ts` (new) -- `@p0` cancel pipeline: hold the plate (and a display) photo bytes, wait past 10 s (`page.clock` or real time), "Lendo… N s" and "Cancelar" show; Cancelar; release the bytes (`page.unroute`); the real `fake` job runs; assert in the outbox a `suggestion/{id}/status` discard for each arrived suggestion, the photo still live, no arrival toast, no suggestion field shown. `@p0` display failure: `pushReadingStatus(..., 'failed')` on a display photo; the cell shows the line, "Tentar novamente" hits the reread route and disables with its reason across a reload, "Digitar" focuses the cell, offline disables with "Sem conexão". `@p0` WAIT-3: panel shot, navigate away from the dialog, reopen the palette: the awaiting row shows; tap reopens the dialog with the proposal; "Confirmar" creates the block. `@p1`: still-reading note after 120 s (clock) with polling continuing; arrival toast "Ver" opens the dialog. Add any spec timing a tap against a render to `SERIAL_SPECS`.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- strike the state of the display-retry row (~l.1074) and the panel-orphan row (~l.1093) as closed by this batch, dated 2026-10-07, per the strike-through convention.

**Acceptance Criteria:**
- Given the Photo viewer opened from the gallery or from a crop, when the user pinches, double-taps or presses "Ampliar", then the picture scales up to its native resolution and pans while zoomed, a crop-opened viewer still lands on its crop first, and Escape/"Fechar"/Anterior/Próxima/Editar legenda/Remover behave as before, with no swipe navigation.
- Given the inline plate crop with suggestions, when the user pinches it, then it zooms and pans in its box, a tap still opens the viewer, and focusing another field shows that field's region again.
- Given a 390 px phone, when the viewer opens, then the same gestures work and every control's hit area is at least 48x48 px.
- Given a plate or display reading pending for 10 s, when the line renders, then it reads "Lendo… 10 s" (ticking) with "Cancelar"; when tapped, the line goes, the photo stays, and every suggestion that reading produces is discarded through `discardSuggestionOp` without an arrival toast.
- Given a reading still running after 120 s, then the line keeps its elapsed time plus the authored still-reading note and the engine keeps cycling every 60 s until the result or failure lands.
- Given a failed display reading on an empty cell, then the cell offers "Tentar novamente" (disabled offline with "Sem conexão") and "Digitar", exactly as the plate failure does.
- Given a panel photo whose dialog was left by navigation, when the palette of its location reopens or the arrival toast's "Ver" is tapped, then the pending or arrived proposal is shown again and can be confirmed or cancelled.

## Design Notes

- Elapsed start: `reading_status_at` is the `client_ts` the server stamped on the newest pulled `file/{id}/reading_status` op (server clock); clamp negative ages so a skewed tablet clock reads 0 s, never negative. Before any status op is pulled, `captured_at` is the start.
- Cancel is device-local by design (no contract change): the discard ops it produces sync, so other devices see the suggestions discarded. Sync status "Leituras" keeps counting the photo while the server still runs it (narrowing, see below).
- Zoom math: `maxScale = max(1, naturalWidth / renderedWidth)` of the picture shown (original, print or thumb); for the crop SVG use the viewBox width in image px over the rendered width. Transform origin at the pinch midpoint; pan clamp keeps the picture covering its stage.

## Open questions and narrowings (for the PR body)

- Panel dialog keeps its 9.2 "Cancelar" (removes the photo); it gets the elapsed text only. Caption and NC-draft readings show no "Lendo…" line today and are untouched.
- "Leituras" in Sync status still counts a cancelled photo until the server finishes it.
- The inline plate crop has pinch/pan only; its stylus/desktop path is its tap into the viewer, which carries the buttons.
- The failed line hides on a cell once it holds a value (conservative reading of "where it happened").

## Verification

**Commands (inside the tools container, `podman compose --profile tools run --rm --user root tools ...`):**
- `pnpm lint` and `pnpm static` -- expected: clean.
- `pnpm test:unit -- packages/domain apps/web/src/sync apps/web/src/db apps/web/src/surfaces/ficha apps/web/src/surfaces/photos` -- expected: green.
- `pnpm exec tsx scripts/e2e.ts e2e/reading-wait.spec.ts e2e/photo-zoom.durability.spec.ts e2e/plate.spec.ts e2e/read-display.spec.ts e2e/panel-capture.spec.ts --project desktop-chrome --project durability-desktop-chrome` -- expected: green.
- `pnpm exec tsx scripts/e2e.ts e2e/photo-zoom.durability.spec.ts --project durability-android-chrome --project durability-webkit` -- expected: green.

**Host (macOS with podman, batch tag e13c):**
- `docker` is not on PATH: use `podman compose ...`; the tools container runs as root: `podman compose --profile tools run --rm --user root tools <cmd>`. Never run pnpm or node on the host.
- The stack (`podman compose up -d`) is already up for this worktree (project `fasor-e13c`, web on host port 4073, api 4030). After changing `packages/domain`, run `podman compose restart api` before api or e2e runs; Vite may serve stale modules: `podman compose restart web` if a change does not show.
- Wrap every Playwright run in the host lock: `lockf /tmp/fasor-verify.lock sh -c '<command>'`, redirecting output to a log under `test-results/` and reading its tail. Never run the full `pnpm verify` (the orchestrator runs the gate).
- Known host failures that are not regressions: `theme.test.tsx`; `ficha.durability` E5-A2-E2E-002/003 at 390 px; `export-dialog.test.tsx` and `points` 6.6-E2E-011 under load.
