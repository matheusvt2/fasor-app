---
title: 'Stories 17.2 and 17.7: the device''s camera app takes the photos, "Salvar no aparelho"'
type: 'feature'
created: '2026-10-28'
status: 'done'
baseline_revision: '1a2f0b0f2a56872166008bf6c628366a9380323a'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-17-context.md']
warnings: ['batched']
batched_reason: 'Stories 17.2 and 17.7 share the photo viewer, the Conta surface and the camera copy lines; two branches would conflict on the same files.'
deferred:
  - summary: >-
      With "Câmera do aparelho" on, two quick "Ler visor" taps (the second before the first photo's row landed in the snapshot) compute the same start cell from the snapshot, so both display photos target row 0; the viewfinder burst counts its shots locally and never does.
    evidence: |-
      read-display.tsx `target()` recomputes `displayBurstStart(stops, photosOf(snapshot), ...)` at every press; the picker path has no per-session counter. Unverified whether a user can tap again before the commit lands (the camera app round trip plus the encode is 1-3 s, the commit lands in the same transaction as the encode). Settled by a timed two-tap run on a tablet; a guard would advance `start.current` locally after each pick.
    location: >-
      apps/web/src/surfaces/ficha/read-display.tsx:614
    severity: medium (unverified)
  - summary: >-
      The viewer fetches the server's original of every uploaded photo it lands on when this device holds no original (spec M12, so the share runs inside the press's activation on iPadOS), so paging through evicted photos on mobile data downloads every original even when "Salvar no aparelho" is never pressed.
    evidence: |-
      photo-viewer.tsx `useSaveFile` runs `photoSaveFile` on landing; the viewer already fetches the `print` variant for its picture, so the original adds a second, larger download per photo. Product choice for Matheus: keep the prefetch (share inside the activation), fetch on the press (a share after the await may fall back to a download on iPadOS), or serve the picture and the save from one fetched original.
    location: >-
      apps/web/src/surfaces/photos/photo-viewer.tsx:98
    severity: medium
  - summary: >-
      A touch-screen laptop or desktop (`navigator.maxTouchPoints > 0`) defaults to the camera app, where `capture` is ignored and a file picker opens instead of the webcam viewfinder.
    evidence: |-
      The default rule is the one Matheus decided on 2026-10-27 (`epic-17-context.md`, touch points); the Conta switch is the remedy on such a machine. Listed as a decision, not changed.
    location: >-
      packages/domain/src/prefs/camera.ts:16
    severity: low
---

<intent-contract>

## Intent

**Problem:** (17.2) On a phone or tablet every camera button opens the app's own `getUserMedia` viewfinder, so Bruno never gets his phone's lenses, flash modes, HDR and focus; the device's camera app is reached only as the fallback when no camera API exists. The copy "salva(s) neste aparelho" says the photo is in the phone, while it is in the browser's store and the upload queue (AD-7, AD-8). (17.7) No photo ever leaves the browser store but through the upload; Bruno wants a copy in his gallery on request.

**Approach:** (17.2) A device-local preference "Câmera do aparelho" (`local_prefs`, AR-27), on by default when the device has touch points, makes every opener take the existing hidden `capture="environment"` input (one photo per tap) instead of the viewfinder; the preference is read in one place (`useCamera`), the viewfinder stays as the off state and on desktops, the pipeline after the file is untouched, and the words say "no relatório". (17.7) The photo viewer gains a secondary action "Salvar no aparelho" that hands the JPEG (this device's original, else the server's original fetched through the existing file route) to `shareFile` from `surfaces/export/revision-file.ts` (the share sheet where the browser shares files, else a download), named by the photo's stamp; Conta gains the honest sentence under the camera switch.

## Boundaries & Constraints

**Always:** the capture pipeline from the file on (EXIF, `encodePhoto`, coordinates, rescue, outbox, upload) is untouched; a camera-app photo is committed as the fallback shot is today (same op, same `reading_kind`, same `CaptureTarget`); the preference's schema, default rule and every derived text live in `packages/domain` (AD-1/AD-13); static Conta and viewer copy in `copy/pt-br.ts` marked `// authored:`; `shareFile`/`saveFile` are reused, never duplicated; `navigator.share` is called inside the press's activation whenever the file is already in hand; the Porto Seguro goldens, `docx.ts` and `layout.ts` are untouched; English code and docs, no emoji; no edit to `epics.md` or `sprint-status.yaml`.

**Never:** no new op, no contract or seed change, no second place that reads the preference (the picker, the openers and the surfaces ask `useCamera`), no change to "Adicionar fotos" (the gallery picker without `capture`), no new share or download mechanism, no File System Access API, no manifest `share_target`, no toast that says a photo is "no aparelho" after a share. Do not touch `print/*`, `photos/numbering.ts`, `number-input.tsx`, `seed/definitions.ts`, `contract/version.ts` (batch e17c runs beside this one).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| M1 default rule | nothing stored; `touchPoints` 5 / 0 | `cameraAppOf(undefined, 5)` true, `cameraAppOf(undefined, 0)` false; a stored `false` with 5 touch points is false; a stored `true` with 0 is true; a stored non-boolean falls back to the default | no error |
| M2 opener with the preference on | "Tirar foto" (sticky bar), NC row "Adicionar foto", "Fotografar placa", "Ler visor", "Fotografar equipamento" (relatório tree panel), the gallery camera; `getUserMedia` present | `getUserMedia` is never called; the opener's hidden `camera-fallback-input` is clicked inside the press; no "Câmera" dialog; the returned file runs `capture.shoot` with the opener's target (the plate tile's `reading_kind` `plate`, "Ler visor"'s `display`, the panel's, the sticky bar's null, the NC row's `item_key`, the gallery's Geral target); the burst badge shows "1" while the shot is stored; the one-photo toast (M6) | a failed store keeps `copy.photos.failedToast` |
| M3 cancelled camera app | the input's change never fires (or a `cancel` event fires) | the opener stays at rest: no toast, no badge, no `denied`, no `opening` | no error |
| M4 HEIC answer | the file is HEIC by type or extension (`isHeic`) | converted with `heicToJpeg` (the import path's lazy `heic-to`), then `capture.shoot` as any file | a failed conversion toasts `copy.photos.failedToast` and clears the badge |
| M5 preference off, or a desktop | stored `false`, or 0 touch points and nothing stored | the viewfinder opens as today (burst, torch, zoom, focus, `singleShot`); the no-camera fallback (no `mediaDevices`, a `getUserMedia` that throws or rejects with anything but a denial) still takes the picker | denial still shows `.camera-denied` |
| M6 the words | the camera count line and the saved toasts, on every path | `burstCountText` "1 foto nesta rajada · salva no relatório com a legenda do contexto" / "N fotos nesta rajada · salvas no relatório com a legenda do contexto"; `copy.photos.hint` "Cada disparo é salvo no relatório com a legenda do contexto."; `doneToast` "Fotos salvas no relatório — entram na fila de envio"; `doneOneToast` "Foto salva no relatório — entra na fila de envio"; the online pair unchanged; the picker path always toasts the one-photo words (one file per pick), online or offline; the storage lines ("aguardando espaço neste aparelho", `refusedHint`, the Conta storage section) keep "neste aparelho" | no error |
| M7 held shot (13.6) with the preference on | `sessionCaptureRescue.heldCount() > 0` at the press | as the no-camera branch today: `refusalToast` and `capture.retry()`, the picker does not open | no error |
| M8 Conta switch | any device | a section "Câmera" (authored heading) after "Localização nas fotos": toggle row "Câmera do aparelho" (`Toggle`, `aria-labelledby`, `aria-describedby` the sub line), the sub line (authored, M12), and under the row the 17.7 sentence (M12); the switch shows `cameraAppOf(stored, navigator.maxTouchPoints)`; a tap writes `local_prefs` `camera_app` at once and the row shows the new state; a reload keeps it; the write is device-local (never an op) | a failed write logs `console.error`, the row keeps the tapped state |
| M9 save source | the viewer on a photo | `photoSaveSource({ hasLocalOriginal, uploaded_at })`: `'local'` when this device holds the original (`readLocalBlob` variant `original`), else `'server'` when `uploaded_at !== null`, else `'none'` | no error |
| M10 "Salvar no aparelho" shares | source local or server, the `File` in hand, `navigator.canShare({ files })` true | `shareFile(file, title)` with the JPEG `File` (`type: 'image/jpeg'`, name M11); the share sheet opens; nothing in the relatório changes (no op, no outbox row); a dismissed sheet (`AbortError`) is silent | a sheet that refuses the file saves it (shareFile's own rule) |
| M11 "Salvar no aparelho" downloads | no `navigator.share`, or `canShare` false for files | `saveFile(file)`: the same JPEG downloads as `photoFileName(photo)` = `foto-YYYY-MM-DD-HHMMSS.jpg` (the stamp's local date and time, filename-safe; the coordinates are not) | no error |
| M12 the viewer action's states | source `'none'`; source `'server'` and the fetch has not landed; the fetch failed (offline) | the `.viewer-actions` button "Salvar no aparelho" (`i-download` glyph) is disabled with its reason beside it (`disabledReasonId`, authored): none "O original ainda não foi enviado pelo aparelho que tirou a foto."; loading "Preparando a foto…"; failed "Não foi possível buscar a foto no servidor. Tente de novo com conexão."; a local original enables it at once; the server original is fetched when the viewer lands on the photo (so the press shares inside its activation) | a fetch error is the reason, never a broken share |
| M13 Conta sentences | Conta on any device | sub line "Cada toque abre a câmera do aparelho e tira uma foto. Desligado, a câmera abre aqui dentro, com rajada, lanterna e zoom."; note "As fotos ficam no relatório. Para guardar uma cópia na galeria, use Salvar no aparelho na foto." (authored, from `copy/pt-br.ts`, listed for Bruno) | no error |

</intent-contract>

## Code Map

Kernel (`packages/domain/src`):
- NEW `prefs/camera.ts` -- `cameraAppSchema = z.boolean()`, `type CameraApp`, `cameraAppDefault(touchPoints: number): boolean` (`> 0`), `cameraAppOf(stored: unknown, touchPoints: number): boolean` (M1); modelled on `prefs/wake-lock.ts`; export from `index.ts` beside `prefs/wake-lock.ts` (l.122); test `prefs/camera.test.ts`.
- `photos/text.ts` l.19-20 -- `burstCountText` words (M6); `photos/text.test.ts` adjusted.
- NEW `photos/save.ts` -- `photoSaveSource(input: { hasLocalOriginal: boolean; uploaded_at: string | null }): 'local' | 'server' | 'none'` (M9) and `photoFileName(photo: { captured_at: string }): string` (M11; reuse the local-time pieces `photoStampShort` in `photos/gallery.ts` l.28 builds from); export from `index.ts` (`photos/*` are `export *`); test `photos/save.test.ts`.

Web (`apps/web/src`):
- `db/prefs.ts` -- `readCameraApp(db, touchPoints): Promise<boolean>` through `cameraAppOf`, `writeCameraApp(db, on)` (key `camera_app`), beside `readKeepScreenOn` l.287-296; `db/prefs.test.ts` covers both and the non-boolean fallback.
- NEW `input/use-camera-app.ts` -- `touchPoints(): number` (`navigator.maxTouchPoints`, 0 without a navigator), `useCameraApp(): boolean` = `useLiveQuery(readCameraApp(db, touchPoints()))` with `cameraAppDefault(touchPoints())` until read; modelled on `useKeepScreenOn` (`input/use-screen-wake-lock.ts` l.200-204, `useDeviceDatabase`). Its own module so `camera-view.test.tsx` can mock it.
- `surfaces/ficha/camera-session.tsx` l.59 `useCamera` -- the ONE read: `const cameraApp = useCameraApp()`, passed to `useCameraOpen` (cross-story table).
- `surfaces/ficha/camera-stream.ts` l.63 `useCameraOpen` -- host gains `cameraApp: boolean`; `open()` l.125: `live = !cameraApp && media has getUserMedia` (M2, M5, M7); comments say the camera app is the first path on a touch device.
- `surfaces/ficha/camera-single-shot.tsx` l.106-153 `useCameraPicker` -- `onFallbackFile`: HEIC through `heicToJpeg` (`files/photo-import.ts` `isHeic`, `heicToJpeg`) before `capture.shoot`, `settle()` after the shoot (M4); the done toast is the one-photo pair whatever `single` says (M6); rename the comments (the input is the camera-app path, and the no-camera fallback).
- `surfaces/ficha/camera-view.tsx` -- header comment: the camera app on touch devices (Story 17.2).
- `surfaces/ficha/camera-view.test.tsx` -- new block: mock `../../input/use-camera-app.ts`; on → the fallback input is clicked and `getUserMedia` never called, a file on the input reaches `capture.shoot` with the target, a HEIC is converted first (mock `files/photo-import.ts`), the toast is the one-photo one; off → `getUserMedia` as the existing tests.
- `surfaces/account/account-surface.tsx` l.290-325 -- new section "Câmera" (M8, M13) after the photo-location section, modelled on the "Tela" row (`toggle-row`, `Toggle`, `useId`s, the tapped-state pattern `keepOnTapped`); `account-surface.test.tsx` gains the switch (default by touch points, tap writes, the sentences).
- `surfaces/photos/photo-viewer.tsx` -- NEW `surfaces/photos/photo-file.ts`: `photoSaveFile(db, tile, fetchFile): Promise<File | null>` (local original else `fetchFile(id, 'original')` when `photoSaveSource` says `'server'`; `File` named `photoFileName(tile)`, `type: 'image/jpeg'`), `savePhotoToDevice(file, title)` = `shareFile(file, title)` (M10, M11); the viewer: a hook `useSaveFile(tile)` with states `ready | loading | failed | none` (M12), the third `.viewer-actions` button, the reason span (`disabledReasonId`); `useSyncActions().fetchFile`; `readLocalBlob` is already imported. Test `photo-file.test.ts` with a fake `navigator.share`/`canShare` (the `surfaces/export/revision-file.test.ts` pattern) over M9-M11.
- `copy/pt-br.ts` l.879-883 (M6), `account` block l.89-112 (`cameraHeading` "Câmera", `cameraAppLabel` "Câmera do aparelho", `cameraAppSub`, `cameraPhotosNote`, M13), `viewer` block l.950-963 (`save` "Salvar no aparelho", `saveTitle` for the share sheet, `saveReasonNone`, `saveReasonLoading`, `saveReasonFailed`, M12); every new line `// authored:`.
- `surfaces/photos/photos.css` -- only if the third action needs a rule the mock's `.viewer-actions` does not give (three `block` buttons stack; check at 390 px).
- `apps/web/src/surfaces/ficha/ficha.css` / `app.css` -- nothing expected.

E2E (`e2e/`):
- `support/photos.ts` l.101-110 `shoot()` -- the M6 words. `e2e/production/production.smoke.ts` if it asserts the old words.
- NEW `camera-app.durability.spec.ts` (parallel group; every durability project; `withoutServiceWorker`, `signInForDurability`, `openChaveSheet`, `devicePhotos`, `jpegFromPage`, `jpegSize` from `support/photos.ts`; WebKit skips the photo-store assertions as `photo-zoom.durability.spec.ts` does, but still runs the Conta test and the chooser test):
  - 17.2-E2E-001 (touch projects only, `test.skip` when `navigator.maxTouchPoints === 0`): `getUserMedia` wrapped to count calls (never removed); on the chave sheet "Tirar foto", the NC row's "Adicionar foto" (`sheet-photos.spec.ts` shows the row), "Fotografar placa" (`photo-zoom.durability.spec.ts` l.56-62), "Ler visor" (`read-display.spec.ts` shows the row), then the relatório tree's "Fotografar equipamento" (`panel-capture.spec.ts`) and the gallery camera (`gallery.spec.ts`): each tap followed by `setInputFiles` on the opener's `camera-fallback-input`, no `dialog` "Câmera" ever visible, `getUserMedia` count 0, the store row count +1 with the expected `block_id`/`item_key`/`reading_kind`, the stored file's bytes > 0 and the JPEG's width 2560 at most (E13-A7), the toast "Foto salva…".
  - 17.2-E2E-002 (every project): Conta: the switch's default state follows the project's touch points ("Ativado" on Android emulation, "Desativado" on desktop and WebKit), the sub line and the note, a tap flips it, a reload keeps it, and the sheet's "Tirar foto" then takes the other path: desktop with the switch on opens the file chooser (`page.waitForEvent('filechooser')`, no "Câmera" dialog); Android with the switch off opens the "Câmera" dialog (`expectCameraOpen`).
  - 17.7-E2E-001 (Chrome projects): a sheet photo through the input, the gallery viewer on it: the "Salvar no aparelho" button enabled; without a share sheet the press downloads `foto-….jpg` (`support/download.ts` `downloadFrom`, `downloadBytes`: JPEG magic `FF D8`, size equal to the stored original's); with the `export.spec.ts` l.77-91 share stub installed (every project, so the share call is asserted on Android emulation and on desktop alike) the press records one share with `files: [{ name, type: 'image/jpeg', size }]` and nothing downloads; the outbox is unchanged after both (`support/outbox.ts`).
  - 17.7-E2E-002 (Chrome projects): a photo row written into the store with `uploaded_at: null` and no local blob (a colleague's photo: `support/push-server-ops.ts` or a direct Dexie write as `durability.spec.ts` does) shows the button disabled with the "O original ainda não foi enviado…" reason; after `uploaded_at` is set and the file route answers (route stub returning the JPEG), the button enables and the download carries those bytes; with the route failing, the "Não foi possível buscar…" reason.
- Touched specs to re-run (they reach the picker or assert the words): `camera-capture.spec.ts`, `sheet-photos.spec.ts`, `display-shots.spec.ts`, `gallery.spec.ts`, `photos.spec.ts`, `account.spec.ts`, `plate-shot-fallback.spec.ts`, `plate-reading.spec.ts`, `plate-every-type.spec.ts`, `plate-units-years.spec.ts`, `read-display.spec.ts`, `read-display-pipeline.spec.ts`, `panel-capture.spec.ts`, `panel-capture-pipeline.spec.ts`, `prose-reading-pipeline.spec.ts`, `reading-wait.spec.ts`, `qgbt.spec.ts`, `review-field-defects.spec.ts`, `review-field-defects-2.spec.ts`, `review-photo-failures.spec.ts`, `section-7-by-hand.spec.ts`, `durability.spec.ts`, `photo-zoom.durability.spec.ts`, `camera-app.durability.spec.ts`.

Docs (the orchestrator, after the review): `EXPERIENCE.md` "Camera capture button" row (l.274) and `DESIGN.md` "Camera capture button" row (around l.805) amended with strike-through and the date; `source-deltas.md` "as built" rows for 17.2 and 17.7 (the photo leaves the store on request only); `docs/kbs/log.md` line and `docs/kbs/architecture/files-and-photos.md` where it describes capture; `deferred-work.md` entries for the narrowings.

## Tasks & Acceptance

**Execution (dependency order):**
- `packages/domain/src/prefs/camera.ts` (new), `index.ts`, `prefs/camera.test.ts` -- the schema and the default rule (M1).
- `packages/domain/src/photos/text.ts`, `photos/text.test.ts` -- the words (M6).
- `packages/domain/src/photos/save.ts` (new), `photos/save.test.ts` -- `photoSaveSource`, `photoFileName` (M9, M11). Then `podman compose restart api` in the worktree and wait for `curl -s http://127.0.0.1:32030/api/health`.
- `apps/web/src/db/prefs.ts`, `db/prefs.test.ts`; `input/use-camera-app.ts` (new) -- the stored preference and its live read.
- `apps/web/src/surfaces/ficha/camera-stream.ts`, `camera-session.tsx`, `camera-single-shot.tsx`, `camera-view.tsx` -- the camera-app path (M2-M5, M7); `camera-view.test.tsx`.
- `apps/web/src/copy/pt-br.ts` -- every string (M6, M12, M13).
- `apps/web/src/surfaces/account/account-surface.tsx`, `account-surface.test.tsx` -- the switch and the sentences (M8, M13).
- `apps/web/src/surfaces/photos/photo-file.ts` (new), `photo-file.test.ts`, `photo-viewer.tsx` -- "Salvar no aparelho" (M9-M12).
- `e2e/support/photos.ts`, `e2e/production/production.smoke.ts` -- the words; `e2e/camera-app.durability.spec.ts` (new) -- the four tests above; `scripts/e2e.test.ts` stays green (a parallel spec, no `SERIAL_SPECS` entry).

**Acceptance Criteria (from epics.md):**
- (17.2) Given a phone or tablet with the preference on (the default there), when "Tirar foto", an NC row's "Adicionar foto", "Fotografar placa", "Ler visor", "Fotografar equipamento" or the gallery camera is tapped, then the device's camera app opens through the existing `capture="environment"` input with no chooser and no viewfinder dialog, the photo it returns runs the pipeline as a viewfinder shot does (same op, same `reading_kind`, same coordinates rule, same toast and badge), a HEIC answer takes the import path's conversion, and a cancelled camera app leaves the button at rest with no error (FR-43; AD-7).
- (17.2) Given a burst opener ("Tirar foto", the NC row, "Ler visor") on such a device, when the engineer wants several photos, then each tap opens the camera app once and returns to the sheet with the one-photo toast; nothing waits for "Concluir fotos".
- (17.2) Given the preference off, or a desktop, when any opener is tapped, then the in-app viewfinder opens as today, with burst, torch, zoom and focus unchanged, and the no-camera fallback stays as it is.
- (17.2) Given Conta, when it renders on any device, then a switch "Câmera do aparelho" (authored, with one description line) shows the device's current state and changes it on this device only, kept across reloads like the theme (`local_prefs`).
- (17.2) Given the camera count line and the saved toasts, when they render on any path, then they say "no relatório", never "neste aparelho" (`photos/text.ts`, `copy/pt-br.ts`), and `e2e/support/photos.ts` `shoot()` reads the new words.
- (17.7) Given a photo opened in the viewer on a phone that shares files, when "Salvar no aparelho" is tapped, then the OS share sheet opens with the JPEG (the local original, else the server's), the app changes nothing in the relatório, and a dismissed sheet leaves no error (FR-43; AD-7).
- (17.7) Given a device that cannot share files, when the action is tapped, then the same JPEG downloads, named "⟨stamp⟩.jpg" (`photoFileName`).
- (17.7) Given a photo whose original is neither local nor uploaded yet, when the viewer renders, then the action is disabled with the reason (authored), never a broken share.

## Design Notes

- The preference is "no live camera": `useCameraOpen` treats it exactly as a missing `mediaDevices`, so the picker, the held-shot rule (13.6), the gesture rule (the input is clicked inside the press) and every opener's badge and focus return are the code that already runs under the durability specs. Nothing new is wired per opener.
- The one-photo toast on the picker path is the reading of the AC's "1 foto salva no relatório…" (one file per pick; the burst words would lie). Listed in the PR as a reading, not a new string.
- `photoFileName` carries the stamp's date and time only: "⟨stamp⟩.jpg" cannot carry `/`, `:` or the coordinates' `,`. Listed in the PR as a narrowing.
- The server original is prefetched when the viewer lands on the photo so that `navigator.share` runs inside the press's activation (iPadOS refuses a share after an await); a press before the prefetch landed waits and then shares, and `shareFile` already saves the file when the sheet refuses it.
- E13-A7's reject-and-hang stub rule does not apply: the camera-app path adopts no new browser API (the `capture` input and `heic-to` are the import path's), and the viewfinder keeps its own fallback specs.

## Verification

**Commands** (tools container: `podman compose --profile tools run --rm --user root tools pnpm <cmd>`; logs under `.scratch-e17d/`; never Playwright from the implementation subagent):
- `pnpm test:unit -- packages/domain/src/prefs packages/domain/src/photos apps/web/src/db apps/web/src/input apps/web/src/surfaces/ficha apps/web/src/surfaces/account apps/web/src/surfaces/photos apps/web/src/surfaces/export scripts` -- green.
- `pnpm lint`, `pnpm static` -- green.
- Orchestrator, under `lockf -t 20000 /tmp/fasor-verify.lock`: `pnpm exec tsx scripts/e2e.ts <touched specs above> --project desktop-chrome --project durability-desktop-chrome` green; then `pnpm exec tsx scripts/e2e.ts e2e/camera-app.durability.spec.ts e2e/durability.spec.ts e2e/photo-zoom.durability.spec.ts --project durability-android-chrome --project durability-webkit` green.

## Auto Run Result

Status: done (batch e17d; the story gate runs after this record and its output goes to the PR body).

Summary: Story 17.2 — "Câmera do aparelho" (`prefs/camera.ts`, `local_prefs` `camera_app`, on by default with touch points) read once in `useCamera`; with it on, `useCameraOpen` treats the device as having no live camera, so every opener clicks its hidden `capture` input inside the press (one photo per tap, HEIC converted first, the one-photo toast); "Ler visor" with every cell read refuses the pick with the hint; Conta section "Câmera" with the switch, its sub line and the 17.7 note; the copy says "no relatório". Story 17.7 — the viewer's "Salvar no aparelho" (`photos/save.ts` `photoSaveSource`, `photoFileName`; `surfaces/photos/photo-file.ts` over `shareFile`) shares or downloads the JPEG, disabled with its reason while there is no original, while it is fetched, or when the fetch failed.

Files: `packages/domain/src/prefs/camera.ts` (+test), `photos/save.ts` (+test), `photos/text.ts` (+test), `index.ts`; `apps/web/src/db/prefs.ts` (+test), `input/use-camera-app.ts`, `surfaces/ficha/camera-session.tsx`, `camera-stream.ts`, `camera-single-shot.tsx`, `camera-view.tsx`, `camera-view.test.tsx`, `surfaces/account/account-surface.tsx` (+test, `account.css`), `surfaces/photos/photo-file.ts` (+test), `photo-viewer.tsx`, `photos.css`, `copy/pt-br.ts`; `e2e/camera-app.durability.spec.ts` (new), `e2e/support/photos.ts`, `e2e/production/production.smoke.ts`; docs by the orchestrator (EXPERIENCE.md, DESIGN.md, source-deltas.md, docs/kbs, deferred-work.md).

Review: 20 findings; 5 patched (ECH-6 medium, ECH-10 low, VGR-A/B/C medium), 3 deferred (ECH-7 maybe-false medium, ECH-9/VGR-E medium product decision, ECH-12 low decision), 12 rejected with their reasons in the triage log. Follow-up review recommendation: false (no high patched; the four medium patches are a guard, two test-coverage additions and one test restructuring, each re-verified by its own test).

Verification: narrow `test:unit` 81 files / 815 tests green, the full `test:unit` 4534 green, `lint` 0 errors, `static` green (implementation); after the patches `test:unit` on the edited files 5 files / 75 tests, `static` and eslint green (`.scratch-e17d/*-fix-e17d.log`). The story gate (lint, static, test:api, test:unit, the touched specs on desktop-chrome and durability-desktop-chrome, the durability specs on durability-android-chrome and durability-webkit) runs from `.scratch-e17d/gate-e17d.sh`; its summary is pasted in the PR.

Gate record (2026-10-28):

Two gate sessions, both from `.scratch-e17d/` scripts under `lockf /tmp/fasor-verify.lock`, tools container only.

**Gate 1 (pre-merge) on `2e65555d`, 15:06-15:32 UTC:**
```
STAGE lint exit=0 time=17s        (0 errors, 25 pre-existing warnings)
STAGE static exit=0 time=24s
STAGE test-api exit=0 time=351s   (92 files; Tests 684 passed (684))
STAGE test-unit exit=0 time=192s  (326 files; Tests 4556 passed (4556))
LOCKED_AFTER=160s
STAGE e2e-desktop exit=1 time=706s  146 tests: 141 passed, 2 failed, 3 skipped (desktop-chrome + durability-desktop-chrome)
STAGE e2e-matrix exit=1 time=103s   40 tests: 27 passed, 3 failed, 10 skipped (durability-android-chrome + durability-webkit)
```
The 5 failures were two assertions of the new spec itself, not the app: 17.2-E2E-001 expected the gallery's Geral photo with `reading_kind` null (Story 9.3 gives it `'caption'`, which `isGeralPhoto` accepts), and 17.2-E2E-002 navigated to `/ficha/{blockId}` instead of `/relatorio/{id}/ficha/{blockId}`. Fixed in `bdfc232f`; the spec alone on that commit, all four projects: `exit=0 time=54s`, 12 tests: 9 passed, 0 failed, 3 skipped (WebKit cannot store a photo Blob), `LOCKED_AFTER=0s`.

**Gate 2 (cross-batch, on the merge commit `6bb4e517` = this branch + main `6c28b886` with batch e17c), 15:35-15:55 UTC:**
```
STAGE static exit=0 time=29s
STAGE test-unit exit=0 time=168s  (326 files; Tests 4590 passed (4590))
LOCKED_AFTER=0s
STAGE e2e-desktop-both exit=0 time=826s  194 tests: 191 passed, 0 failed, 3 skipped, 0 flaky  (e17d's 24 specs + e17c's seed-v10, altitude-na, altitude-na.durability, seed-v9, na-number-field, na-control.durability, relatorio, oil-dry, oil-dry.durability, dry-transformer.durability, templates on desktop-chrome + durability-desktop-chrome)
STAGE e2e-matrix-both exit=0 time=128s   56 tests: 46 passed, 0 failed, 10 skipped, 0 flaky  (both batches' durability specs on durability-android-chrome + durability-webkit)
GATE EXIT=0
```
Lint and test:api were not re-run on the merge: this branch touches no `apps/api` file and the lockfile is unchanged. `git diff origin/main --stat` on the merge commit lists only this batch's 33 files.

Residual risks: 17.7-E2E-002's live transition waits for the app's own sync after an `online` event (up to 90 s); the camera-app path on a real iPad relies on the in-press input click (WebKit opens no chooser under Playwright); the deferred items above.

## Spec Change Log

## Review Triage Log

### 2026-10-28 — Review pass

Layers run: Edge Case Hunter (15 findings), Verification Gap Reviewer (3 gaps + 2 other findings). Blind Hunter and Intent Alignment skipped: token economy; the integrated epic review covers them.

- verdicts: 20 findings — high 0, medium 6, low 13, false 0, maybe-false 1
- findings:
  - `[low]` `[reject]` ECH-1 `use-camera-app.ts:33` the touch default answers until the `local_prefs` read lands, so a stored "off" is wrong for the first milliseconds — the ficha renders its openers after its own live queries, so a press inside that window does not happen in use; the guard (ignore presses until read) would make a press a silent no-op.
  - `[low]` `[reject]` ECH-2 `account-surface.tsx:196` a refused `local_prefs` put leaves the row on the tapped state — the "Manter a tela ligada" row behaves the same (spec M8 chose it); a refused put is a rare storage state, and the next read corrects the row.
  - `[low]` `[reject]` ECH-3 `account-surface.tsx:86` a tap before the stored value lands writes the shown default — same millisecond window as ECH-1; Conta's row cannot be tapped before its first paint settles.
  - `[low]` `[reject]` ECH-4 `camera-single-shot.tsx:125` a second pick while the first is converting or saving clears the badge early and may toast twice — pre-existing shape of the fallback picker; the camera app is modal on a phone, so the second tap lands only while the first file encodes; two identical toasts at worst.
  - `[low]` `[reject]` ECH-5 `camera-single-shot.tsx:125` a HEIC loses its EXIF in `heicToJpeg`, so `captured_at` is the device clock — `shoot` takes the device position first (`position ?? exifCoords`, the AC's "same coordinates rule"), and the camera app answers within seconds of the shot; reading EXIF out of a HEIC container is not a trivial fix.
  - `[medium]` `[patch]` ECH-6 `camera-stream.ts:141` "Ler visor" with every display cell read: the viewfinder disables its shutter, the camera-app path stores a plain photo with no reading — verified in `read-display.tsx:614-622` (`shotTarget(0) ?? targetFor(testKey)`). Patched: `useCamera` refuses the pick when `shotTarget(0) === null`, toasting `shotHint(0)` ("Nada mais a ler nesta ficha"); unit test added.
  - `[maybe-false]` `[defer]` ECH-7 `camera-stream.ts:141` two quick "Ler visor" taps target the same cell — deferred (frontmatter); settled by a timed two-tap run on a tablet. The sequential two-tap e2e (VGR-B) covers the normal pace.
  - `[low]` `[reject]` ECH-8 `photo-viewer.tsx:98` a 5xx with the server reachable keeps the button disabled until the viewer is reopened — "Anterior/Próxima" or a close and reopen refetch; a retry on a disabled button is new surface.
  - `[medium]` `[defer]` ECH-9 `photo-viewer.tsx:103` every landing on an evicted uploaded photo downloads its original — spec M12's choice; product decision for Matheus (frontmatter).
  - `[low]` `[patch]` ECH-10 `photo-viewer.tsx:117` `uploaded_at` set after the file is ready refetches it and flips the button to "Preparando a foto…" — patched: `readyFor` keyed by the photo id, so a ready file is kept; `none` and `failed` still re-run on `uploaded_at` and reachability.
  - `[low]` `[reject]` ECH-11 `save.ts:44` two photos in one second share a file name — one photo is saved at a time, the OS renames a duplicate download, the share sheet names its own copy; the AC names the stamp.
  - `[low]` `[defer]` ECH-12 `camera.ts:16` a touch-screen laptop defaults to the camera app — the rule is Matheus's decision; listed as a decision with the Conta switch as the remedy (frontmatter).
  - `[low]` `[reject]` ECH-13 claim: HEIC "takes the import path's conversion" reuses only `heicToJpeg` — the conversion is the import path's; the EXIF read of a HEIC is ECH-5's note.
  - `[medium]` `[patch]` ECH-14 claim: "Ler visor" has no per-shot target on this path — the no-cell-left case is ECH-6's patch; the per-tap row is VGR-B's e2e.
  - `[low]` `[reject]` ECH-15 claim: the switch "shows the device's current state" — ECH-1/2/3's windows; rejected with them.
  - `[medium]` `[patch]` VGR-A `camera-app.durability.spec.ts:160` 17.2-E2E-001 skips on both story-gate projects (`hasTouch` false) — patched: the test runs under `test.use({ hasTouch: true })` on every Chromium durability project, the `hasTouch` skip dropped.
  - `[medium]` `[patch]` VGR-B `camera-app.durability.spec.ts:188` the per-tap display row is never asserted — patched: two camera-app "Ler visor" taps, rows `[0, 1]` asserted as `read-display.spec.ts:168` does.
  - `[medium]` `[patch]` VGR-C `camera-app.durability.spec.ts:393` the viewer's live none → ready transition is only tested across remounts — patched: the viewer stays open while the photo is marked uploaded and synced, the button enables without a reopen; the failed state keeps its fresh mount.
  - `[low]` `[reject]` VGR-D the default-before-read window — ECH-1.
  - `[medium]` `[defer]` VGR-E the original fetched on every landing — ECH-9.
