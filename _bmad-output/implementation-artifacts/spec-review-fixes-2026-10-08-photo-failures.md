---
title: 'Review fixes 2026-10-08: no photo fails silently (empty reading, visible camera failures, wake lock, camera return)'
type: 'bugfix'
created: '2026-10-08'
status: 'done'
baseline_revision: 'e2527c8e4ade1462d449d7c71c37e43875b625ba'
review_loop_iteration: 0
followup_review_recommended: true
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/review-fixes-2026-10-08-context.md'
  - '{project-root}/AGENTS.md'
warnings: ['batched', 'oversized']
# batched: the coordinator cut one batch (r8cap) for the photo-capture and reading-wait findings of the 2026-10-08 review; they share camera-view.tsx, plate-photo.tsx, reading-line.tsx and read-display.tsx.
deferred:
  - summary: >-
      A reread that reads nothing after an earlier run's (now discarded) suggestions reads `done`, not `empty`, on the plate and on a display target (E10, E11).
    evidence: |-
      `plateReadingView` and `targetLine` decide `empty` from any suggestion row citing the photo; after "Cancelar" (rows discarded) and "Ler de novo", a reread with zero rows still finds the first run's discarded rows and shows no line. Telling runs apart needs the photo's latest `reading_run_id`, which the photo row does not carry (a contract change, out of this round).
    location: >-
      packages/domain/src/relatorio/plate-suggestions.ts plateReadingView; packages/domain/src/relatorio/measurement-suggestions.ts targetLine
    severity: medium
---

<intent-contract>

## Intent

**Problem:** On a photo or a reading, several outcomes end silently or misleadingly (review `review-field-ux-and-code-2026-10-08.md`, "the report"): a reading that finds nothing ends as a blank "done" (CAPT-V1); a failed burst shot's toast sits under the opaque camera scrim (FLD-V1); the pending plate row trusts `navigator.onLine` (CAPT-V2); nothing keeps the screen awake (FLD-1); closing the camera scrolls the sheet (DE-2); a single shot keeps the camera up for seconds with no cue (DB-4); "está demorando" counts from before the upload (DG-4); a reading landing on typed nameplate values can only be accepted (DG-2). Two ticking clocks drift apart (CAPT-16).

**Approach:** Add the kernel "empty" reading view (plate, display cells, thermo-hygrometer) with "Nada foi lido nesta foto", "Fotografar de novo" and the type-instead action; route camera failures and saving state into the camera's own `.cam-hint` / `.cam-count`; one shared wake-lock hook behind a device-local "Manter a tela ligada" switch; `preventScroll` on the camera's focus return; a reading wait that counts only once the server holds the bytes; "Manter o digitado" beside "Substituir"; one `useNowIso` clock.

## Boundaries & Constraints

**Always:**
- AD-1/AD-13: the view, the wait start and the wake-lock rule are kernel functions in `packages/domain`; `apps/web` renders them. New pt-BR copy goes in `apps/web/src/copy/pt-br.ts` (or `ui.ts` for shared chrome), each string not from a mock marked `// authored:`; list every one in the PR body for Bruno.
- Writes go through the existing ops (`discardSuggestionOp`, `nameplateOp`, the photo capture path). No new op family, no `CONTRACT_VERSION` or `MIN_CONTRACT_VERSION` change.
- r8read's contract: what a reading with zero suggestions stores is unchanged; the empty view reads the stored state as it is (`reading_status = 'done'`, no suggestion row of any status with `source.photo_id` = the photo).
- Every fix ships a test that fails before it. Mechanism fixes (FLD-V1 hint, DE-2 focus, FLD-1 wake lock, DG-4 wait start) ship a mutation run: revert the fix in the working tree, show the named test red, restore; record it in the PR body.
- FLD-1 adopts a browser API with a fallback: an e2e stubs `navigator.wakeLock.request` to reject (E13-A7) and the sheet, camera and Conta keep working with no error shown and no `pageerror`.
- e2e ids unique across `e2e/` (pattern `R8CAP-E2E-NNN`); no `.only`; new tests tagged `@p0` for the main ACs, `@p1` for secondary ones; a new `@p0` asserts the committed state (outbox or IndexedDB), not only the screen (E12-A6).
- A rule added to `apps/web/src/styles/app.css` sits in one block commented "r8cap (review 2026-10-08)"; `tokens.css` and `components.css` stay byte-identical.

**Never:**
- Do not touch `apps/web/src/state/toast.tsx`, the toast CSS (r8emit), `relatorio-tree.tsx` (r8lay), `conclusao-section.tsx` / `use-ficha-actions.ts` (r8conc), `checklist-section.tsx` (r8dry), `apps/api/src/jobs/reading/**` (r8read), `epics.md`, `sprint-status.yaml`.
- No "Manter os digitados" group action, no tree "Concluída · N sugestões" (DG-2's other parts), no persistent "Não salvo" (FLD-7), no change to the GPS wait that blocks a save (DB-4's "attach the fix later" needs a later coords op): list them as known open.
- No change of behaviour for other `restoreFocus` callers (the option is opt-in).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Plate read empty | plate photo `reading_status='done'`, zero suggestion rows of any status from it, not cancelled here | `.photo-row[data-reading="empty"]`: "Nada foi lido nesta foto", "Fotografar de novo", "Preencher manualmente" | read-only sheet: the text only; AI features off: no "Fotografar de novo" |
| Plate read, all confirmed/discarded | done, rows exist (any status) | today's `done` (no line) | — |
| Plate cancelled here then done empty | `reading_cancelled` set | the existing "Ler de novo" line only, never the empty line too | — |
| Retake | tap "Fotografar de novo" | single-shot camera, the plate target; the new photo is the plate photo; older plate photos of the block get the device-local cancel so any pending row they produce now or later is discarded | offline: the shot queues as usual |
| Display cell / thermo-hygrometer read empty | newest display photo of the target done with zero rows, target empty | the empty line under the cell/field with "Fotografar de novo" (single shot on that photo's target) and "Digitar" | a typed value hides it (as the failed line) |
| Burst grab or save fails, camera open | `createImageBitmap` rejects or the save throws | `.cam-hint[data-state="failed"]` visible with "Não foi possível salvar a foto. Tente de novo." until the next shot saves; no toast while the camera is open | camera already closed (burst "Fechar"): the toast, as today |
| Single shot saving | shutter tapped, single mode | `.cam-count` reads the authored saving text, shutter disabled, until the view closes | — |
| Burst "Concluir" saving | shots still saving | `.cam-count` saving text, "Concluir" disabled until close | — |
| Camera closes | any close (Concluir, X, single shot), sheet scrolled to y | `window.scrollY` stays y (±2 px) at 390 and 768 px | — |
| Reading wait before upload | queued, server reachable, `bytes_acked_at` and `uploaded_at` null, no status op, no reread | "Lendo…" with no age, no "Cancelar", no still-reading note | — |
| Reading wait after upload | bytes acked at t | age counts from t (existing thresholds) | — |
| Pending plate row | shot in flight, server unreachable but `navigator.onLine` true | the queued words, not "Lendo…" | — |
| Replace suggestion on a typed nameplate value | "Sugerido: X — Substituir" | also "Manter o digitado": one tap discards it (one batch) and the field keeps the typed value; a typed commit that changes the value also discards it in the same batch | identical retype writes nothing |
| Wake lock | ficha mounted, or camera open, or a reading wait shown; switch on; page visible; interaction within 10 min | one `screen` sentinel held | API absent or `request` rejects: nothing shown, retried only on the next interaction or visibility change |
| Wake lock idle / hidden / off | 10 min without pointerdown/keydown, or page hidden, or switch off, or no holder | released; re-acquired on the next interaction / on visible / switch on | — |

</intent-contract>

## Code Map

- `packages/domain/src/relatorio/plate-suggestions.ts:30-48` -- `PlateReadingView`, `plateReadingView(photo, pending)`: add `'empty'`; take all suggestion rows (it already filters `status === 'pending'` for `ready`).
- `packages/domain/src/relatorio/measurement-suggestions.ts:218-324` -- `DisplayQueuedState`, `targetLine`, `displayLineShown`, `displayQueuedCells`, `displayQueuedEnv`: add `'empty'` (newest photo done with no row read from it), shown like `failed` (only while the target is empty); the rows come in as an optional argument (omitted keeps today's output).
- `packages/domain/src/reading/wait.ts:24-31` -- `readingStartedAt`; add a sibling (e.g. `readingWaitStart`) returning null while the server does not hold the bytes. `panel-capture.tsx:258` keeps `readingStartedAt`.
- `packages/domain/src/prefs/theme.ts` -- pattern for a new `prefs/wake-lock.ts` (schema, default on, `WAKE_LOCK_IDLE_MS = 600_000`, pure `wakeLockWanted(...)`); export from `packages/domain/src/index.ts:107`.
- `packages/domain/src/schemas/entities.ts:455,558` -- `reading_status` and suggestion `status` enums.
- `apps/web/src/surfaces/ficha/nameplate-section.tsx:94-97,207-219,236-244` -- plate/view, `PlatePhotoRow` call, `fillManually`, `plateTarget` (retake reuses it), the field `commit` (DG-2 discard).
- `apps/web/src/surfaces/ficha/nameplate-suggestions.tsx:72-101,175-176,238-258,423-433` -- model (`rows` from `suggestionRowsOf` holds all statuses; expose them and a `keepTyped`), `type` (put + discard batch pattern), `ReplaceLine`.
- `apps/web/src/surfaces/ficha/plate-photo.tsx:42-121` -- `PlatePhotoRow`: F-13 `shown`, the lines; add the empty line and retake; render the pending variant (CAPT-16).
- `apps/web/src/surfaces/ficha/photo-openers.tsx:60-130` -- `PlateCaptureTile` pending row (`useSession().online` -> `useServerReachable`), keeps `camera.element` in one tree place (review F-01 precedent for any retake camera).
- `apps/web/src/surfaces/ficha/reading-line.tsx:45-52,64-110,197-263` -- `useNowIso` (move to one shared hook with an `active` flag), `ReadingWaitLine`, `FailedReading`, `DisplayFailedLine` (pattern for the empty line and "Digitar").
- `apps/web/src/surfaces/ficha/read-display.tsx:166,240-283,592` -- display queued map, `QueuedBanner` (DG-4 at 270; empty state), env line.
- `apps/web/src/surfaces/ficha/camera-view.tsx:166-180,279-350,576-736` -- `returnFocus` (DE-2), `grab` failure toast at 302 (FLD-V1), `finish` (DB-4), `CameraView` `.cam-hint` / `.cam-count`.
- `apps/web/src/surfaces/ficha/use-photo-capture.ts:124-178` -- `shoot` toasts its own failure at 170; let the camera receive the outcome.
- `apps/web/src/input/focus-restore.ts:50-69` -- `restoreFocus`: add opt-in `preventScroll`.
- `apps/web/src/surfaces/relatorio/panel-capture.tsx:139-149,221` -- `useTickingNow` -> the shared hook.
- `apps/web/src/surfaces/account/account-surface.tsx:245-284` -- the location `.toggle-row` pattern for the new switch; `apps/web/src/db/prefs.ts:1-40` -- device-local `local_prefs` read/write pattern (theme).
- `apps/web/src/surfaces/ficha/ficha-surface.tsx:58` -- `FichaSurface`, where the sheet takes the wake lock.
- `apps/web/src/styles/app.css:616,662` -- `.cam-hint` and its `refused` state (mirror for `failed`).
- `apps/web/src/copy/pt-br.ts:759-790,1074-1083` -- `copy.photos`, `copy.ficha.nameplate`; `:727` "Fotografar de novo" already exists for the panel.
- Tests: `e2e/read-display.spec.ts:140-153` (the toast assertion FLD-V1 replaces), `e2e/reading-wait.spec.ts` (holdPhotoBytes, pushReadingStatus patterns), `e2e/support/reading-ops.ts` (`pushReadingStatus`, `pushPlateSuggestions`, `holdPhotoBytes`, `openTransformerSheet`), `e2e/support/photos.ts`, `e2e/support/sync.ts` (`syncNow`), unit `plate-photo.test.tsx`, `camera-view.test.tsx`, `packages/domain/src/reading/wait.test.ts`.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/relatorio/plate-suggestions.ts`, `measurement-suggestions.ts`, `reading/wait.ts`, `prefs/wake-lock.ts` (+ index) -- the empty views, the wait start, the wake-lock vocabulary and rule -- with unit tests for every matrix row they decide.
- `apps/web/src/surfaces/ficha/{plate-photo.tsx,photo-openers.tsx,nameplate-section.tsx,nameplate-suggestions.tsx}` -- plate empty line + retake (device-local cancel of older plate photos through `writeReadingCancelled` + `discardCancelledReadings`), pending row through `PlatePhotoRow`'s pending variant with `useServerReachable`, DG-4 wait start, DG-2 "Manter o digitado" and discard-on-typed-commit.
- `apps/web/src/surfaces/ficha/{reading-line.tsx,read-display.tsx}` -- the shared empty line ("Fotografar de novo" single shot on the photo's own target and caption, "Digitar"), cells and thermo-hygrometer; DG-4 for display.
- `apps/web/src/surfaces/ficha/{camera-view.tsx,use-photo-capture.ts}` + `app.css` -- FLD-V1 hint, DB-4 saving status, DE-2 `preventScroll`.
- `apps/web/src/input/{focus-restore.ts,use-screen-wake-lock.ts}`, one shared `useNowIso(everyMs, active)` hook file, `panel-capture.tsx`, `ficha-surface.tsx`, `account-surface.tsx`, `db/prefs.ts`, `copy/pt-br.ts` -- the wake lock, the switch, the clock.
- `e2e/review-photo-failures.spec.ts` (new) and `e2e/read-display.spec.ts` -- the e2e below; unit tests for the wake-lock hook (fake timers, a fake `navigator.wakeLock`) and the components touched.

**Acceptance Criteria:**
- Given a transformer sheet whose plate shot's reading ends `done` with no suggestion, when the sheet shows it, then "Nada foi lido nesta foto" is visible with "Fotografar de novo" and "Preencher manualmente"; "Preencher manualmente" focuses the first empty plate field; "Fotografar de novo" opens the single-shot camera and, after the shutter, the outbox holds a new file create with `reading_kind = 'plate'` on that block and the empty line is gone (R8CAP-E2E-001, @p0).
- Given a display cell's "Ler visor" shot whose reading ends `done` empty, when the cell is empty, then the empty line shows under it with "Fotografar de novo" and "Digitar"; "Digitar" focuses the cell; a typed value hides the line; "Fotografar de novo" creates a display photo on the same target (outbox) (R8CAP-E2E-002, @p0).
- Given a burst camera open, when one grab fails, then `.cam-hint` is visible (`toBeVisible()`) with "Não foi possível salvar a foto. Tente de novo.", no toast is shown, and after the next good shot the hint is back to the next-row hint (the updated `read-display.spec.ts` test, @p0).
- Given the sheet scrolled to y at 768 and at 390 px, when the camera opened from the Sticky action bar closes by "Concluir fotos" and by the close button, then `window.scrollY` is y within 2 px and the opener holds the focus (R8CAP-E2E-003, @p0).
- Given a single plate shot, when the shutter is tapped, then the camera's status reads the saving text and the shutter is disabled until the view closes (R8CAP-E2E-004, @p1).
- Given the photo bytes held at the network while online, when the plate row shows its reading for more than 10 s, then it reads "Lendo…" with no age and no "Cancelar"; once the bytes are acked the age counts from the ack (R8CAP-E2E-005, @p1, plus unit tests).
- Given a nameplate field typed offline and a reading landing with another value, when "Manter o digitado" is tapped, then the outbox holds the suggestion's discard, the field keeps the typed value and the replace line is gone; a typed different value also discards it in its batch (R8CAP-E2E-006, @p0).
- Given a fake `navigator.wakeLock`, when a sheet opens, then one `screen` lock is held; leaving the sheet releases it; with "Manter a tela ligada" off in Conta (stored in IndexedDB) no lock is requested; on a fresh device the switch reads on (R8CAP-E2E-007, @p0). Given `request` rejects, when the sheet, the camera and Conta are used, then nothing errors and no toast or `pageerror` appears (R8CAP-E2E-008, @p0). The 10 min idle release, re-acquire on interaction and on `visibilitychange` are unit tests with fake timers.
- Given the pending plate row, when the api answers no request but the browser is online, then the row reads the queued words (component test or e2e).

## Spec Change Log

## Review Triage Log

### 2026-10-08 — Review pass
Layers: Edge Case Hunter and Verification Gap Reviewer (Blind Hunter and Intent Alignment skipped: token economy; the integrated review covers them). One review-fix loop.
- verdicts: 25 findings — high 0, medium 10, low 15, false 0, maybe-false 0 (the gap layer's 2 "other findings" included; one duplicates the picker-path gap)
- findings:
  - `medium` `patch` E1 wake lock: interactions tracked only while holders > 0, so a ficha opened >10 min after the last tracked touch holds no lock until the next touch — listeners kept for good once installed, unit case added.
  - `low` `reject` E2 wall-clock jump (NTP) skews the idle time — rare on a tablet; one early or late release; the fix would bypass the app's clock seam.
  - `low` `reject` E3 a refused `writeKeepScreenOn` leaves the switch showing the new value until reload — an IndexedDB write refusal is rare and a reload shows the stored truth; the fix adds an error branch.
  - `low` `reject` E4 the switch draws on for the first frames before a stored off is read — cosmetic; a tap there writes what the engineer saw; the location switch renders its default first the same way.
  - `medium` `patch` E5 close during "Salvando as fotos…" then reopen: the old `finish` ends the new session (pre-existing race, now inside the DB-4 window, file touched, minutes to fix) — `finish` ends only the session it started.
  - `low` `patch` E6 a shot of a closed session reporting into a reopened one — grouped with E5 (stale session callbacks); `cameraSays` speaks only to the shot's own session.
  - `low` `reject` E7 a held (refused) shot after a failed one leaves the failure under the refused hint — needs a failure followed by a storage refusal; the refused hint takes precedence while it lasts.
  - `medium` `patch` E8 `onShot` fires before the save, so a failed retake save cancels the older plate readings with no new photo — `onShot` moved to the `'saved'` report; the retake target pre-assigns its `fileId`, never cancelled.
  - `medium` `patch` E9 "Criar" under a replace line writes the word and the put but leaves the suggestion pending — `createWord` appends the discard on the same rule as `commit`.
  - `medium` `defer` E10 a reread that reads nothing after an earlier run's (now discarded) rows reads `done`, not `empty` (cancel, "Ler de novo", nothing read) — real; telling runs apart needs the photo's latest `reading_run_id`, which the photo row does not carry (a contract change).
  - `medium` `defer` E11 the same for a display photo — same root as E10.
  - `low` `reject` E12 a thermo-hygrometer retake whose line moves to another field unmounts the hosting banner and its camera as it closes — the photo is still saved; hosting the camera elsewhere is more than a direct fix; listed as known open in the PR.
  - `low` `reject` E13 the plate empty line stays after every plate field was typed — the line stays accurate and matches the plate's failed line, which does not hide either.
  - `low` `patch` E14 the failure text replaced the next-row hint after a failed burst grab (E9-Q7's row cue lost) — the hint shows the failure then the next-row hint; the T3 assertion is back.
  - `low` `reject` E15 the Sumário panel dialog's wait still counts from the capture — the spec scoped DG-4 to the sheet's lines; listed as known open in the PR.
  - `medium` `patch` E16 (claim) AC "a typed different value also discards it" fails through "Criar" — same root as E9.
  - `medium` `patch` V1 nothing asserts the plate row reads `done` (not `empty`) once every suggestion is resolved — assertions added to R8CAP-E2E-006.
  - `medium` `patch` V2 the thermo-hygrometer empty line and retake never run through `useEnvDisplay`/`envAfter` — new R8CAP e2e on the transformer sheet.
  - `low` `patch` V3 the save-failure half of FLD-V1 is tested only against a mocked capture — `renderHook` tests of `usePhotoCapture` with a throwing save.
  - `low` `patch` V4 wake-lock holders off the sheet (gallery or panel camera) are never observed — a step added to R8CAP-E2E-007.
  - `medium` `patch` V5 the system-picker path never calls `onShot`, so a picker retake cancels nothing — grouped with E8; a camera-view unit case covers it.
  - `low` `patch` V6 R8CAP-E2E-001 does not assert the new photo's reading is left alone — negative assertion added (grouped with E8).
  - `low` `patch` V7 DG-2's equal-value guard is unexercised — a field typed to the suggested value in R8CAP-E2E-006 (no discard; provenance after a sync).
  - `low` `patch` V8 R8CAP-E2E-005's ack half cannot fail (skipped on absence; the regex accepts a bare "Lendo…") — made a real check or narrowed to what it asserts.
  - `medium` `patch` V9 (other) the picker-path omission is also a behaviour defect — duplicate of V5, same patch.
- also patched (orchestrator): `pnpm lint` reported 27 warnings against main's 24, all three new `page.waitForTimeout` in `e2e/review-photo-failures.spec.ts`.

## Design Notes

- Empty view = `reading_status === 'done'` exactly (`none` stays `done`, no line) and no suggestion row of any status read from the photo; a server batch writes the rows and the `done` status together (`apps/api/src/jobs/reading/job.ts:241-262`), so the device never sees `done` before its rows.
- A retake camera hosted by a line that changes state when the new photo lands must keep `camera.element` mounted across the change (review F-01 precedent in `PlateCaptureTile`); host the camera in the component that stays mounted (`PlatePhotoRow` / `QueuedBanner`).
- Wake lock: one module-level manager owns the single `WakeLockSentinel`, counts holders, listens to `pointerdown`/`keydown` (capture) and `visibilitychange`, and asks the kernel rule each time; the browser releases the sentinel on hide (listen to its `release` event).
- DB-4 copy is chosen by mode (single vs burst), not by count, so it is static copy, not a kernel plural.
- Open questions (kept conservative, listed in the PR body): (1) DG-4: the report proposes "Enviando foto…" until the ack; EXPERIENCE.md's dated F-13 note says a reachable server reads "Lendo…", so the line keeps "Lendo…" and only drops the age and "Cancelar" until the server holds the bytes. (2) DG-2: an identical retype writes nothing (no discard); "Manter o digitado" is the one-tap path. (3) The retake is offered on the empty line only, not on the failed line.
- Narrowings (each gets a `_bmad-output/implementation-artifacts/deferred-work.md` entry, owner the coordinator): DG-2's "Manter os digitados" group action and the tree's "Concluída · N sugestões" (`relatorio-tree.tsx`, r8lay's file); DB-4's close before the GPS fix (needs a later coords op; measure on a real tablet first).

## Verification

**Host rules (this macOS host):** the worktree is `/Users/matheusvilella/Documents/estudos/fasor-app-r8cap` (compose project `fasor-r8cap`, already configured by `.env`). Use `podman compose`, never `docker`, never pnpm/node on the host, never build images. The tools container runs as `podman compose --profile tools run --rm --user root tools <cmd>`. Redirect long output to `.scratch-r8cap/<name>.log` and read its tail. Every Playwright run goes under the host lock, started detached and polled: `nohup sh -c "lockf -t 20000 /tmp/fasor-verify.lock sh -c 'podman compose --profile tools run --rm --user root tools pnpm exec tsx scripts/e2e.ts <spec paths> --project desktop-chrome --project durability-desktop-chrome'; echo EXIT=\$?" > .scratch-r8cap/e2e.log 2>&1 &`, then short polls (`grep -q EXIT= .scratch-r8cap/e2e.log`) of at most 60 s each; never block a tool call on the lock. Never stop, restart or touch containers, volumes, images or worktrees whose names lack `r8cap`. Do not commit; the orchestrator commits.

**Commands:**
- `pnpm lint`, `pnpm static`, `pnpm test:unit` (narrow with a path while iterating), `pnpm test:api` -- expected: green.
- `pnpm exec tsx scripts/e2e.ts e2e/review-photo-failures.spec.ts e2e/read-display.spec.ts <other touched specs> --project desktop-chrome --project durability-desktop-chrome` under the host lock -- expected: green.
- Mutation runs for FLD-V1, DE-2, FLD-1 and DG-4 (revert the fix, show the named test red, restore): record each command and outcome in the report.

## Auto Run Result

- **Summary:** the kernel "empty" reading view (plate, display cells, thermo-hygrometer) with "Nada foi lido nesta foto", "Fotografar de novo" (one shot of the same target; the plate retake cancels the older plate readings on this device once its shot is stored) and the type-instead action; a failed burst shot said in `.cam-hint` (with the next-row hint kept) instead of a toast under the scrim; "Salvando a foto…" / "Salvando as fotos…" with the shutter and "Concluir" disabled until the view closes; the camera's focus return with `preventScroll`; the reading wait counted only once the server holds the bytes (`readingWaitStart`); "Manter o digitado" beside "Substituir" and a discard on a typed (or "Criar") different value; the pending plate row as `PlatePhotoRow`'s pending variant on `useServerReachable`; one `useNowIso`; a screen wake lock (sheet, camera, reading waits, panel wait) with a 10 min idle cap behind the device-local "Manter a tela ligada" switch in Conta.
- **Files:** kernel `plate-suggestions.ts`, `measurement-suggestions.ts`, `reading/wait.ts`, new `prefs/wake-lock.ts`; web `camera-view.tsx`, `use-photo-capture.ts`, `plate-photo.tsx`, `photo-openers.tsx`, `nameplate-section.tsx`, `nameplate-suggestions.tsx`, `read-display.tsx`, `reading-line.tsx`, `panel-capture.tsx`, `ficha-surface.tsx`, `account-surface.tsx`, `db/prefs.ts`, `input/focus-restore.ts`, new `input/use-screen-wake-lock.ts`, new `state/now-iso.ts`, `copy/pt-br.ts`, `copy/ui.ts`, `styles/app.css` (one r8cap block); tests: new `e2e/review-photo-failures.spec.ts` (R8CAP-E2E-001 to 009), `read-display.spec.ts` 9.1-E2E-006 (now `@p0`, asserts the hint), `reading-wait.spec.ts` 13.5-E2E-001/006 (push a `queued` status op so the wait counts), unit tests for every kernel rule, the camera, the wake lock, the capture report and the components.
- **Review:** 25 findings; 17 patched in one loop (E1, E5, E6, E8, E9, E14, E16, V1-V9), 2 deferred (E10, E11: a reread that reads nothing after a discarded earlier run, needs the latest `reading_run_id` on the device), 6 rejected (E2, E3, E4, E7, E12, E13, E15 as logged above; E12 and E15 also listed as known open in the PR).
- **Follow-up review recommended:** true. Seven medium entries were patched. The specific unverified risk is the camera's session ownership, which was rewritten after the review and not reviewed again. It covers `finish` ending only its own session, `cameraSays` bound to the shot's session, and `onShot` moved to the `'saved'` report. New unit cases cover it, and so do R8CAP-E2E-001, 9.1-E2E-006 and the 22 gate specs.
- **Verification:** the story gate on d544a8a (pre-merge): lint 0 errors, 24 warnings (main's baseline), static clean, test:unit 3162/3162, test:api green, 22 touched specs on desktop-chrome + durability-desktop-chrome 133/133. It was re-run after merging origin/main (PR #117); the PR body carries the final output. Mutation runs (fix reverted, test red, restored): FLD-V1 (camera-view unit), DE-2 (camera-view unit and R8CAP-E2E-003), DG-4 (plate-photo unit), FLD-1 (wake-lock unit, 6 red).
- **Residual risks:** E10/E11 (deferred); a thermo-hygrometer retake whose line moves to the other field unmounts its camera as it closes (photo still saved); the Sumário panel dialog's wait still counts from the capture; DB-4's close still waits for the GPS fix (deferred-work entry).
