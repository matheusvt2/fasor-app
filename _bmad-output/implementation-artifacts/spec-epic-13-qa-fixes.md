---
title: 'Epic 13 fixes: integrated review findings'
type: 'bugfix'
created: '2026-10-08'
status: 'in-progress'
baseline_revision: '092ca04a9e7ac3da2ebadf26a4137db99604c75d'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context: []
warnings: ['batched', 'multiple-goals']
batched_reason: 'The Epic 13 fix batch: F-01 to F-14 of the integrated QA (reviews/epic-13-review-qa.md) with the decisions of Matheus of 2026-10-08, one PR by coordinator decision.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The Epic 13 QA (`_bmad-output/implementation-artifacts/reviews/epic-13-review-qa.md`, read its section 2 for each finding's evidence) found a lost plate shot when `takePhoto()` fails or is slow (F-01, High), a toast race that drops "Revisão N pronta" and turns photo-numbers 7.2/7.3 red (F-03/F-04), and eleven Low/Medium defects (F-02, F-05 to F-14).

**Approach:** Fix each finding as the report proposes, with Matheus' decisions of 2026-10-08: a plate shot is never lost; toasts queue behind a job outcome; a cancelled reading offers "Ler de novo"; "Ajustar à tela" always shows the whole photo; F-14 as the smallest safe tooling change.

## Boundaries & Constraints

**Always:**
- F-01: a single shot ("Fotografar placa" and every `singleShot` camera) is never lost when `takePhoto()` rejects or exceeds `TAKE_PHOTO_TIMEOUT_MS` (2 s). Do BOTH: (a) the fallback frame is taken from a live frame at the tap: start `createImageBitmap(video)` synchronously in `fire` before awaiting `takePhoto`, use it when `takePhoto` fails or times out, `close()` it when the photo wins (and on every other exit, no leaked bitmap); (b) remove the remount: `PlateCaptureTile` must keep `camera.element` at the same tree position in both branches (the `shot` branch and the tile branch), so the `CameraView` and its `<video>` are not replaced at `burst > 0`.
- Q-1 (F-03/F-04): toasts QUEUE. A job outcome toast ("Revisão N pronta", `readyToast` in `generate-watcher.tsx`) is shown with a new `ShowToastOptions` flag (e.g. `outcome: true`) and holds the slot for its full `TOAST_TIMEOUT_MS` (or until the user dismisses it); any toast asked for meanwhile waits in a FIFO queue and shows after it. A job outcome arriving while an action toast (the reading-arrival toast with "Ver") is showing takes the slot and the action toast goes back to the head of the queue, shown after it: nothing is replaced unseen. A queued toast with the same text as one already queued is not queued twice. Plain toasts among themselves keep today's replace semantics (bursts stay fast). `showOnce` and `onDismiss` keep working. EXPERIENCE "one at a time" still holds: one visible toast.
- Q-3 (F-07): after "Cancelar" the reading's row (plate row and each display line) shows "Ler de novo" (authored, `copy` home per AGENTS.md); offline it is disabled with the same reason as "Tentar novamente" (`t.retryOffline`). Pressing it clears the device-local cancel (`clearReadingCancelled`) and calls the existing `sync.rereadPhoto` (`POST /api/photos/{id}/reread`), then `requestSyncCycle()`. A 409 `reading_running` or `not_caught_up` answer is success (the reading is on its way: the wait line returns); any other failure re-records the cancel and shows `t.retryFailed`. The note "Os campos continuam digitáveis…" (`t.fieldsNote`, `nameplate-section.tsx:213`) is hidden once the reading is cancelled. While AI features are off and the kind needs AI, no "Ler de novo" (as `canRetry`).
- Q-5 (F-05): opened from a crop, "Ajustar à tela" is enabled and leaves the crop for the whole photo at fit (the viewer drops its zoom region; "Anterior/Próxima" unchanged). At the crop view's own fit, "Reduzir" is disabled with the authored reason "Recorte na tela"; at the whole photo's fit the reason stays "Foto inteira na tela". When two reasons show at once they are separated (" · " or one element each with a visible separator), never run together.
- F-02: below 768 px `.cam-context` shrinks and ellipsizes (`min-width: 0; overflow: hidden; text-overflow: ellipsis`) and `.cam-torch` and the close button are `flex: none`; declarations marked `/* authored: */` in `app.css` (never edit `tokens.css`/`components.css`). 13.2-E2E-001 gains a 390 px assertion with a long context: torch and "Fechar a câmera" fully inside the viewport, no horizontal scroll of `.cam-top`.
- F-06: the ticking age stays visible but outside any live region; the `role="status"` region carries a text that changes only at the transitions (under 10 s, the 10 s "Cancelar" point, the 120 s still-reading point). The announced texts are derived in the kernel (`readingWait` gains the field, authored pt-BR), not in web.
- F-08: one wait/failed/cancelled line per photo: the thermo-hygrometer photo shows its line once, under the first environment field that would show it (definition order), not under Temperatura and Umidade both. "Digitar" still focuses that field's input.
- F-09: `storageRefusedBannerText` drops the MB figure when forced by a refusal: authored "Este aparelho recusou guardar a foto. Sincronize para liberar espaço." The camera's burst status line (`packages/domain/src/photos/text.ts:10-13`) does not say "salva/salvas" while a shot is refused and held in memory: authored variant, e.g. "1 foto nesta rajada · aguardando espaço neste aparelho".
- F-10: in `packages/domain/src/audit/input.ts:120-122`, a first cell that is only placeholder dashes ("-", "–", "—", whitespace) counts as empty and the label falls back to "linha N".
- F-11: the dialog's audit "Ver" to a sheet or the gallery navigates with `?volta=exportar` (the precedent is `setup-surface.tsx:164`); the sheet's and the gallery's app-bar "Voltar" go to `/relatorio/{id}?exportar=1` when it is present (the Export dialog reopens), unchanged otherwise. The Sumário findings block's own "Ver" does not add it. Correct the comment at `generate-action.tsx:66-68`.
- F-12: the "Hoje" chip's accessible name is a template in `apps/web/src/copy/ui.ts` ("Hoje em {campo}", e.g. "Hoje em Início do serviço"); visible text stays "Hoje".
- F-13: the row-text choice of `panelAwaitingRows` (`panel-capture.tsx:94`) moves into a kernel function `panelAwaitingRowText` in `packages/domain` (same output), with a kernel unit test; web calls it.
- F-14: `scripts/seed-users.ts --sample-relatorio` no longer plants the test fixture's fixed ids: it seeds the sample with ids derived per company (deterministic: keep each UUIDv7's first 12 hex digits plus version nibble so op order is kept, derive the rest from a hash of company id + original id, keep variant bits valid), re-seeding the same company replaces its own copy; `removePortoSeguroSmall` and the test seeding are unchanged. Update the header comment and `USAGE` (they claim test runs delete the sample; they no longer touch it). Add a test: after seeding the sample on a non-test company, `removePortoSeguroSmall(db)` does not throw and the sample's rows survive.
- Ownership AD-1/AD-13: derived text in `packages/domain`; static copy in `apps/web/src/copy/pt-br.ts` (`// authored:`), component chrome in `ui.ts`. No emoji. Product name never "fasor".
- Buttons stay `aria-disabled` with a reason (TextButton `isDisabled` + `disabledReason`), 48 px hit areas.

**Never:** no new op family, no `CONTRACT_VERSION` bump, no new endpoint, no new dependency, no edit to `tokens.css`/`components.css`, `epics.md`, `sprint-status.yaml`, EXPERIENCE.md or `docs/kbs/` (the orchestrator does those); no change to the number-input test timers (QA check (b), out of scope); no AWS.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected |
|---|---|---|
| F-01 reject | plate tile, `ImageCapture.prototype.takePhoto` rejects | photo saved from the tap's frame; tile then shows the plate row; no "Não foi possível salvar a foto" |
| F-01 slow | `takePhoto` resolves after 5 s | the 2 s timeout takes the tap's frame; the late blob is ignored; one photo, not two |
| F-01 wins | `takePhoto` resolves a blob in time | the blob is saved, the early bitmap is closed |
| Toast queue | "1 leitura pronta" showing, then "Revisão 1 pronta" | revision toast shows now for 6 s; then the reading toast (with "Ver") |
| Toast queue | "Revisão 1 pronta" showing, reading arrives | reading toast waits; shows after 6 s or after dismiss |
| Ler de novo offline | cancelled reading, offline | button `aria-disabled`, reason "Tentar novamente"'s offline reason |
| Ler de novo 409 running | server still reading | cancel cleared, wait line back, no error toast |
| Crop viewer | opened from plate crop, press "Ajustar à tela" | whole photo at fit, reason "Foto inteira na tela"; before it, "Reduzir" disabled with "Recorte na tela" |
| Audit label | first printed cell "-" | "<sheet> · linha N" |
| Sample seed | `seed-users --sample-relatorio`, then `test:api` | test:api green; sample still in the developer company |

</intent-contract>

## Code Map

- `apps/web/src/surfaces/ficha/camera-view.tsx` -- `fire` (~620-631), `takePhotoOrGrab` (511-529), `grabFrame` (532-548), `grab` (280-309), `finish` (325-349); single shot calls `finish()` right after `onGrab`.
- `apps/web/src/surfaces/ficha/photo-openers.tsx:66-138` -- `PlateCaptureTile`: two return branches each render `{camera.element}` at a different position, so the camera remounts at `burst > 0` (F-01 root cause).
- `apps/web/src/surfaces/ficha/camera-view.test.tsx:336-375` -- existing fallback unit tests (isolated harness); extend with a mocked `ImageCapture` whose `takePhoto` rejects/hangs while the video element is detached after the tap.
- `e2e/camera-capture.spec.ts`, `e2e/plate-every-type.spec.ts` -- camera e2e patterns (fake device); new F-01 e2e on the plate tile stubs `ImageCapture.prototype.takePhoto` via `page.addInitScript` (reject, and a 5 s delay), asserts the photo row committed in Dexie.
- `apps/web/src/state/toast.tsx` -- single slot provider; `apps/web/src/state/generate-watcher.tsx:73` (`readyToast`), `apps/web/src/state/reading-arrivals.tsx:127` (arrival toast with action). `e2e/photo-numbers.spec.ts:78` -- 7.2/7.3 toast assertions (keep them asserting the toast).
- `apps/web/src/surfaces/ficha/reading-line.tsx` -- `ReadingWaitLine` (live region 82-95), `FailedReading` (reread mechanics to reuse for "Ler de novo"); `useReadingCancelled`; prefs helpers in `apps/web/src/db/prefs.ts`.
- `apps/web/src/surfaces/ficha/plate-photo.tsx:64-95` -- plate row, cancelled state; `apps/web/src/surfaces/ficha/nameplate-section.tsx:213` -- `fieldsNote`.
- `apps/web/src/surfaces/ficha/read-display.tsx:246-279` (`QueuedBanner`), `:663-680` (`envAfter`, per env field banner: F-08).
- `apps/web/src/sync/client.ts:254` (`rereadPhoto`, throws `SyncRequestError` with status/code), `apps/api/src/http/reading.ts` (409 `reading_running`, `not_caught_up`).
- `packages/domain` `readingWait` (grep `export function readingWait`) -- add the announcement text (F-06).
- `apps/web/src/surfaces/photos/photo-viewer.tsx:103-115` (crop `zoom`, `zoomBox`), `:258-290` (`ZoomControls`); `usePinchZoom`; copy `copy.viewerZoom` in `pt-br.ts:1551-1560`.
- `apps/web/src/styles/app.css:630-655` -- `.cam-context`, `.cam-torch` (F-02).
- `packages/domain/src/photos/text.ts:10-13` (burst line), `:63-77` (banners); `apps/web/src/state/banner-slot.tsx:109`; `camera-view.tsx` refused state (`useCaptureRefused`, 99-100, 690).
- `packages/domain/src/audit/input.ts:110-124` -- row label (F-10).
- `apps/web/src/surfaces/relatorio/generate-action.tsx:59-72`, `sumario-surface.tsx:313-325` (`seeAuditTarget`), `setup-surface.tsx:164` (`volta=exportar` precedent); the sheet's and gallery's app-bar back (grep `backTo`/`AppBar` in `surfaces/ficha/ficha-surface.tsx` and `surfaces/photos/`).
- `apps/web/src/copy/ui.ts:186-189` (`dateField.today`), the date field chip in `apps/web/src/components/date-field.tsx`.
- `apps/web/src/surfaces/relatorio/panel-capture.tsx:80-96` -- `panelAwaitingRows` (F-13).
- `scripts/seed-users.ts:38-66,205-217`, `apps/api/src/db/test-fixtures.ts:39-110` -- F-14.

## Tasks & Acceptance

**Execution:**
- `photo-openers.tsx`, `camera-view.tsx` -- F-01 (a)+(b); unit tests in `camera-view.test.tsx`; new e2e `e2e/plate-shot-fallback.spec.ts` tagged `@p0` (reject and slow, on one plate type) asserting the Dexie photo row and no failure toast.
- `state/toast.tsx`, `state/generate-watcher.tsx` -- Q-1 queue; unit tests in `state/toast.test.tsx` (fake `timers`) for every Toast-queue matrix row.
- `reading-line.tsx`, `plate-photo.tsx`, `nameplate-section.tsx`, `read-display.tsx`, `copy/pt-br.ts`, kernel `readingWait` -- F-06, F-07, F-08; unit tests; extend `e2e/reading-wait.spec.ts` (`@p0` for "Ler de novo": cancel, note hidden, offline disabled with reason, online press calls the reread route and the wait line returns; one line for the thermo-hygrometer photo).
- `photo-viewer.tsx`, `pt-br.ts` -- F-05; extend the 13.3 zoom e2e (`grep -l 13.3-E2E e2e/*.ts`).
- `app.css`, `e2e/camera-capture.spec.ts` (13.2-E2E-001) -- F-02 with the 390 px assertion.
- `packages/domain/src/photos/text.ts` (+ caller in camera view) -- F-09; kernel unit tests.
- `packages/domain/src/audit/input.ts` -- F-10; kernel unit test.
- `generate-action.tsx`, `sumario-surface.tsx`/`export-dialog.tsx`, sheet and gallery back -- F-11; extend `e2e/emission-audit.spec.ts`: dialog "Ver" to a sheet, app-bar "Voltar", dialog open again.
- `ui.ts`, `date-field.tsx` -- F-12; unit test of the accessible names.
- `packages/domain` (panel module next to `panelReadingLine`), `panel-capture.tsx` -- F-13; kernel unit test.
- `scripts/seed-users.ts`, `apps/api/src/db/test-fixtures.ts` (or a sibling) -- F-14; an api integration test.

**Acceptance Criteria:**
- Given the plate tile with `takePhoto` stubbed to reject or to hang, when the engineer taps the shutter, then the plate photo is committed in Dexie and its row shows; with the F-01 fix reverted in the working tree the new e2e goes red (mutation run, reported).
- Given an issue right after adding a captioned photo, when the revision finishes, then "Revisão 1 pronta — DOCX e PDF" shows and the reading toast follows it; photo-numbers 7.2-E2E-001 and 7.3-E2E-001 pass 5 of 5 alone (`--repeat-each=5`).
- Given a cancelled reading, when online, then "Ler de novo" restarts it through the reread route and the fields note is gone while cancelled.
- Given a screen reader on a running reading, when 30 s pass, then the live region changed at most twice.
- Given a 390 px viewport and a long camera context, when the camera opens, then torch and close are fully visible.
- Given every changed surface, the existing Epic 13 specs stay green.

## Design Notes

Toast queue sketch: `state = { current, queue[] }`; `showToast(text, {outcome})`: if `current?.outcome && !expired` -> push (dedupe by text); else if `outcome && current?.action` -> unshift current to queue, show new; else replace. On expiry/dismiss of an outcome toast, shift the queue. An action toast that is queued keeps its action when shown.

F-01: the early bitmap is a `Promise<ImageBitmap>` created before any `await`; `takePhotoOrGrab(track, video, early)` races `takePhoto` against the timeout and falls back to `early` (and only if `early` rejects, to `grabFrame(video)`).

## Verification

Run inside the tools container (`podman compose --profile tools run --rm --user root tools ...`), never on the host; narrowest first:
- `pnpm test:unit -- <paths>`; `pnpm test:api -- <path>` for F-14; `pnpm lint`; `pnpm static`.
- `pnpm exec tsx scripts/e2e.ts e2e/<spec> --project desktop-chrome` per touched spec; photo-numbers with `--repeat-each=5`.
- After a `packages/domain` change: `podman compose restart api web`.
