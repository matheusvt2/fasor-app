---
title: 'Epic 13 batch A: capture at full resolution, torch and zoom, and a quota-refused shot that survives'
type: 'feature'
created: '2026-10-07'
status: 'in-progress'
baseline_revision: 'b1c2c6b1a411a41d783bfa7ef50834cb94c68380'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-13-context.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_reason: '13.1, 13.2 and 13.6 all change camera-view.tsx and use-photo-capture.ts, which batch A owns (epic-13-context.md coordinator decision).'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The viewfinder asks `getUserMedia` for no resolution and grabs shots from the `<video>` element, so plates
are read from 640x480/720p frames (CAP-1); there is no torch, zoom or tap-to-focus for the dark cubicle (CAP-2); and a
shot the browser refuses for quota while offline is held in memory only, silently lost with the tab (CAP-4). Sources:
`ux-designs/ux-fasor-2026-09-18/review-field-ux-2026-10-06.md` CAP-1, CAP-2, CAP-4; `epics.md` Stories 13.1
(line ~2753), 13.2 (~2777), 13.6 (~2873).

**Approach:** Ask for ideal 3840x2160 on every camera session and take single shots through `ImageCapture.takePhoto()`
where it exists; expose torch, zoom and tap-to-focus only when the track's capabilities offer them; on a quota refusal
evict acked originals and retry once, and when the shot is still refused, block the next shot with a camera-surface
message and force the storage banner.

## Boundaries & Constraints

**Always:**
- Batch A owns `camera-view.tsx`, `use-photo-capture.ts`, `files/photo-encode.ts`, `files/capture-rescue.ts`. Small
  edits are allowed in unowned shared files named in the Code Map (`file-store.ts`, `banner-slot.tsx`,
  `app-shell.tsx`, `state/storage-reading.ts`, `copy/pt-br.ts` (append to the `photos` block), `public/sprite.svg`,
  `styles/app.css`, `packages/domain`).
- Derived text and sizing live in `packages/domain` (AD-1/AD-13); static copy in `copy/pt-br.ts` marked `// authored:`
  (no mock draws torch, zoom or the refusal message).
- Every new control is at least 48 px, hidden (not rendered) when its capability is absent, never over the shutter or
  "Concluir fotos"; the visible zoom control is the stylus path for pinch.
- The `<input capture>` fallback (no camera API, NotFoundError) and the e2e fake-camera path keep working unchanged.
- Torch is off at the start of every camera session.
- No emoji; code and comments in English.

**Never:**
- Do not edit `photo-viewer.tsx`, `plate-photo.tsx`, `read-display.tsx`, `panel-capture.tsx`, `sync/engine.ts`,
  `ficha-fields.tsx`, `number-input.tsx`, `date-field.tsx` (other batches own them). The openers keep using
  `useCamera` as they do; the new behavior lives inside the hook and `CameraView`.
- Do not change the encode cap: 2560 px / 0.85 stays (see Design Notes, narrowing).
- Do not make the shutter wait for a save (tap budget): a refusal blocks the shots after it arrives.
- No new op kind, no contract bump, no change to `evictionPlan`'s rules.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Stream start | any `useCamera` open | `getUserMedia({ video: { facingMode: 'environment', width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false })` (plus whatever 13.2 needs to expose zoom, see Design Notes); `track.getSettings()` logged once per session via `console.info` | getUserMedia errors keep today's denied / fallback routing |
| Single shot with ImageCapture | `singleShot: true`, `ImageCapture` defined | shot is `takePhoto()`'s Blob, handed to `capture.shoot` (EXIF/encode path for Blobs) | takePhoto rejects or exceeds a short timeout (about 2 s) -> video-frame grab, same tap, no extra toast |
| Single shot, no ImageCapture | iPadOS Safari, WebKit | video-frame grab as today | as today |
| Burst | no `singleShot` | video-frame grab at the stream's real size | as today |
| Capabilities absent | default fake camera, Safari | no torch, zoom or focus control in the DOM | none |
| Torch offered | `capabilities.torch === true` | 48 px toggle (`aria-pressed`) in `.cam-top`; press applies `{ advanced: [{ torch }] }`; new session starts off | applyConstraints rejects -> state stays as it was |
| Zoom offered | `capabilities.zoom` {min,max,step} | visible "−"/"+" 48 px buttons plus readout, and two-pointer pinch on `.cam-finder`, both clamped to min..max | rejected constraint ignored |
| Focus offered | `capabilities.focusMode` includes `single-shot` (or `manual`/`continuous` with points of interest) | tap on the preview applies `pointsOfInterest` at the tapped normalized point and the focus mode; a brief focus ring marks the point | rejected constraint ignored |
| Quota, eviction frees room | commit throws QuotaExceededError once | `freeSpace(neededBytes)` runs `runEviction` with pressure at least the shot's bytes, then the commit is retried: `saved` | non-quota errors keep today's `failedToast` |
| Quota, online, still refused | retry also refused, online | existing `sendDirect`: `sent` | send fails -> `held` |
| Quota, offline, still refused | retry also refused, offline | `held`; the refused state turns on: shutter disabled, `.cam-hint` shows the refusal sentence, refusal toast, storage-low banner shown | none |
| Open while refused | refused state on, opener pressed | live path: retry held (with eviction) first; if cleared, open normally; else no camera, refusal toast. Fallback path (sync gesture): no picker while refused, refusal toast, async retry kicked | none |
| Refusal cleared | a retry saves or sends every held shot | refused state off, shutter and opener work again | none |

</intent-contract>

## Code Map

- `apps/web/src/surfaces/ficha/camera-view.tsx` -- `useCamera` (open at :152, getUserMedia at :168, grab at :203) and
  `CameraView` (:342, video at :414, `fire` at :389, `grabFrame` at :325). All 13.1 and 13.2 UI and 13.6 shutter block.
  `onGrab` takes `Promise<ImageBitmap>` today; widen to `Promise<Blob | ImageBitmap>` (capture.shoot already accepts both).
- `apps/web/src/surfaces/ficha/use-photo-capture.ts` -- `shoot` (:112), `settle` (:168), `rescueDeps` (:87). Add
  `freeSpace` to the deps and a `retryHeld`/refused accessor for `useCamera.open`.
- `apps/web/src/files/capture-rescue.ts` -- `createCaptureRescue` (:46), `attempt` (:49). Add evict-then-retry before
  the online/offline split; add `subscribe(listener)` so the refused state (`heldCount() > 0`) is observable.
- `apps/web/src/files/photo-encode.ts` -- caps at :9-12; update the header comment with the 2026-10-07 re-measure
  narrowing; no number changes.
- `apps/web/src/db/file-store.ts` -- `runEviction(db, reading)` (:189); add optional third argument (minimum bytes)
  combined through the kernel.
- `packages/domain/src/photos/eviction.ts` -- `storagePressureBytes` (:26); add `refusalPressureBytes(reading, neededBytes)`
  = the larger of the reading's pressure and the bytes needed. Export from `packages/domain/src/index.ts`.
- `packages/domain/src/photos/text.ts` -- `storageLowBannerText` (:64); add a reading-or-null variant for the forced banner
  ("Pouco espaço neste aparelho. Sincronize para liberar." when there is no reading; authored).
- `apps/web/src/state/banner-slot.tsx` -- `bannerCandidates` (:83); add `storageRefused?: boolean` so the `storage-low`
  candidate also shows while a shot is refused.
- `apps/web/src/surfaces/app-shell.tsx` -- passes `storage` and `storageAction` (:124); pass the refused flag.
- `apps/web/src/state/storage-reading.ts` -- home for a `useCaptureRefused()` hook (`useSyncExternalStore` over
  `sessionCaptureRescue.subscribe`/`heldCount`).
- `apps/web/src/device/storage-estimate.ts` -- `storageHeadroom()` reading used by `freeSpace`.
- `apps/web/src/copy/pt-br.ts` -- `photos` block (:748-786): add torch, zoom, focus labels and the refusal sentences;
  rewrite `refusalToast` (it promises a retry "no próximo disparo", which is no longer true).
- `apps/web/public/sprite.svg` -- add a torch symbol (e.g. `i-flash`) and, if needed, minus; `i-plus` exists.
- `apps/web/src/styles/app.css` -- camera rules at :593-638; add authored rules for the new controls (comment: no mock).
- Tests to extend: `camera-view.test.tsx`, `files/capture-rescue.test.ts`, `files/photo-encode.test.ts`,
  `state/banner-slot.test.tsx`, `packages/domain/src/photos/eviction.test.ts`; e2e `e2e/photos.spec.ts` (6.2-E2E-004 is
  the refused-write precedent, `IDBObjectStore.prototype.put` override), `e2e/durability.spec.ts` (6.2-E2E-003 is the
  precedent for the fallback-input path and for the WebKit Blob annotation), helpers `e2e/support/photos.ts`
  (`shoot`, `expectCameraOpen`, `jpegSize`, `devicePhotos`), `e2e/support/durability.ts`.
- Read-only users of `useCamera`: `photo-openers.tsx` (:23, :68, :238), `read-display.tsx` (:483 burst, :596 single),
  `panel-capture.tsx` (:121 single). Their existing specs must stay green.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/photos/eviction.ts`, `text.ts`, `index.ts` + tests -- `refusalPressureBytes`, the null-safe banner
  text -- the kernel owns sizing and wording.
- `apps/web/src/db/file-store.ts` + test -- optional minimum-bytes argument to `runEviction` -- eviction sized to the shot.
- `apps/web/src/files/capture-rescue.ts` + test -- `freeSpace` dep called once before the retry; retry once; then the
  existing online send / offline hold; `subscribe` notifies on every held-count change; a `freeSpace` that throws is
  ignored -- CAP-4.
- `apps/web/src/surfaces/ficha/use-photo-capture.ts` -- wire `freeSpace` (storageHeadroom + runEviction with the shot's
  original+thumb bytes); expose `retry()` for open -- CAP-4.
- `apps/web/src/state/storage-reading.ts`, `banner-slot.tsx`, `app-shell.tsx` + banner test -- `useCaptureRefused`, the
  forced `storage-low` candidate -- "with the storage banner".
- `apps/web/src/surfaces/ficha/camera-view.tsx` + test -- 13.1 constraints, settings log, takePhoto with fallback; 13.2
  torch/zoom/focus from capabilities, reset per session, pinch plus visible control; 13.6 refused state blocks the
  shutter and open, shows the hint sentence -- CAP-1, CAP-2, CAP-4.
- `apps/web/src/copy/pt-br.ts`, `public/sprite.svg`, `styles/app.css` -- copy, icon, authored layout.
- `apps/web/src/files/photo-encode.ts` -- dated comment: 2560 px / 0.85 kept, the fixture plates cannot be scored under
  `fake` providers.
- `e2e/camera-capture.spec.ts` (new, fake-device launch args like `photos.spec.ts`) -- `@p0` 13.1: the recorded
  `getUserMedia` constraints and the stored original's JPEG size equal `fitWithin(track settings, 2560)` (larger than
  640x480 when the fake device honors the ideal); `@p0` 13.2: with a capability stub (init script wrapping
  `getUserMedia` to patch the track's `getCapabilities`/`applyConstraints` and record applied constraints), torch press
  -> `aria-pressed=true` and `torch: true` recorded, close and reopen -> torch off; "+" -> zoom recorded, clamped; tap
  on the preview -> points of interest recorded; without the stub no torch/zoom control renders; `@p0` 13.6 live
  camera: offline, `files` puts refused -> after one shot the shutter is disabled, the refusal sentence is in
  `.cam-hint`, and the storage banner is visible after closing; a second variant refused once -> saved (row in Dexie).
- `e2e/durability.spec.ts` -- `@p0 13.6-E2E-001` on the three durability projects, fallback-input path as in
  6.2-E2E-003: offline, every `files` put refused -> one shot -> refusal toast and banner, next opener press opens no
  picker; the tab is killed (page closed, new page) -> after reload no photo row and the earlier refusal was shown;
  variant refused once -> after the kill the photo is in Dexie. WebKit: annotate `not-covered-here` with the
  6.2-E2E-003 reason (ephemeral contexts refuse Blobs) if the store cannot hold the shot there.

**Acceptance Criteria:**
- Given any capture surface, when the stream starts, then `getUserMedia` was called with facingMode environment and
  ideal 3840x2160, the track settings were logged once, and a unit test asserts the constraints and the bitmap size the
  shot produced.
- Given a single-shot capture where `ImageCapture.takePhoto()` resolves, when the shutter is pressed, then the saved
  shot comes from the photo Blob; where it is missing or fails, then the frame grab is used and the shot still saves.
- Given a track whose capabilities offer torch, zoom or focus, when the camera opens, then the matching 48 px controls
  render outside the shutter row, act through `applyConstraints`, and torch starts off in every session; given none,
  then none renders and every existing camera spec stays green.
- Given a quota refusal while offline, when the rescue path runs, then evictable acked originals are freed and the
  write retried before anything is held; when still refused, then the next shot is blocked with the camera message,
  the refusal toast and the storage banner.
- Given a tab killed after a refused shot, when the app reloads, then the shot is in Dexie or the refusal was shown
  before the camera allowed another shot (durability projects).

## Spec Change Log

- 2026-10-07, implementation (zoom exposure finding). web.dev "Control camera pan, tilt, and zoom": Chrome lists
  `zoom` in `getCapabilities()` only for a stream requested with `zoom: true`; on a PTZ-capable camera that turns the
  prompt into one combined camera-and-PTZ prompt, and on a camera without PTZ it "falls back to a regular camera
  prompt" (getUserMedia does not fail). So `zoom: true` is sent as a bare, non-required value in
  `CAMERA_CONSTRAINTS` (a browser that does not know it ignores it) and the zoom control stays hidden when the track
  lists no zoom range. Checked in the tools container: Chromium's fake device with `zoom: true` streams 3840x2160 and
  lists no zoom, torch or pointsOfInterest (so no control renders there without the stub).
- 2026-10-07, implementation (4K fake frames finding). The e2e bundle is a development build (`build:e2e`), so React
  StrictMode unmounts and remounts `CameraView` once per session; its "stop the stream when the view goes" cleanup
  stopped the live track on that remount, and every e2e shot was the ended track's 2x2 placeholder frame (true before
  this batch too; nothing asserted the pixel size). The stop is now deferred one task and cancelled by a remount with
  the same stream; production (no StrictMode double effects) is unchanged, and close/finish still stop the tracks at
  once through `end()`. 13.1-E2E-001 asserts the viewfinder plays the stream's own size before it shoots.

## Review Triage Log

## Design Notes

- **Encode cap (13.1, narrowing).** Reading accuracy cannot be scored under `fake` providers (the fake OCR returns
  canned values whatever the pixels), so 2560 px / 0.85 is kept, as the story allows. Recorded in `photo-encode.ts`,
  here and in the PR body; the coordinator writes the dated line under 13.1 in `epics.md`.
- **Zoom exposure.** Chrome exposes `zoom` in `getCapabilities()` only when the stream was requested with `zoom: true`
  (pan-tilt-zoom permission). Check the current behavior (context7 / MDN) before adding it: if adding `zoom: true` changes
  the permission prompt or fails on browsers without PTZ, request it only as a non-required constraint and keep the
  control hidden when absent. Record the finding in the Spec Change Log.
- **takePhoto timeout.** A takePhoto that never settles must not hang the single shot; race it against a short timer
  (about 2 s) and fall back to the grab. Keep the first frame's `grabFrame` wait as it is.
- **4K fake frames.** The fake device may now stream larger frames; run the camera specs (`photos`, `plate`,
  `read-display`, `panel-capture`, `tap-budget-signal`, `gallery`, `captions`, `sheet-photos`) and say in the report
  whether timings moved.
- **Refused state** is `sessionCaptureRescue.heldCount() > 0` (per tab, in memory). After a tab kill it is gone with
  the held shot, which is why the refusal must be shown at capture time.
- **Open questions (keep conservative, list in the PR):** (Q1) how the camera unblocks after a refusal -- built as a
  retry at the next open; no "Tentar de novo" button on the camera; (Q2) torch, zoom and refusal copy and layout are
  authored, no mock exists; (Q3) eviction-then-retry also runs online before the direct send.

## Verification

**Commands (inside the tools container, never on the host):**
- `podman compose --profile tools run --rm --user root tools pnpm test:unit` -- green.
- `podman compose --profile tools run --rm --user root tools pnpm lint` and `pnpm static` -- green.
- `podman compose --profile tools run --rm --user root tools pnpm exec tsx scripts/e2e.ts e2e/camera-capture.spec.ts e2e/photos.spec.ts e2e/plate.spec.ts --project desktop-chrome` -- green.
- `podman compose --profile tools run --rm --user root tools pnpm exec tsx scripts/e2e.ts e2e/durability.spec.ts --grep 13.6 --project durability-desktop-chrome --project durability-android-chrome --project durability-webkit` -- green or the WebKit annotation.

**Environment (this host):** macOS with podman; `docker` and `flock` are absent. The worktree's compose stack
(`COMPOSE_PROJECT_NAME=fasor-e13a`, api on `127.0.0.1:2030`) is already up. Every pnpm/node command runs in the tools
container with `--user root`; never on the host. Wrap every Playwright run in the host lock and never block a tool call
on it longer than a few minutes: start it in the background writing to `.scratch-e13a/<name>.log`
(`(lockf /tmp/fasor-verify.lock sh -c '<cmd>'; echo EXIT=$?) > .scratch-e13a/<name>.log 2>&1`) and poll its tail.
After a change in `packages/domain`, `podman compose restart api` before api tests. Read only log tails.
