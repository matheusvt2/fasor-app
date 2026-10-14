---
title: 'Epic 14 carry-over B: camera and relatorio tree split, camera focus return, pnpm probe files'
type: 'refactor'
created: '2026-10-14'
status: 'in-review'
baseline_revision: '0335616287d78c8348b452be13bdc7a91df727b0'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context: []
warnings: ['batched', 'multiple-goals']
batched_reason: 'Four agent-closable carry-over items (E13-A6, E14-A7 tree split and camera returnFocus row, E14-A13) on two surfaces and one tooling file, cut into one batch by the coordinator for token economy.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** `camera-view.tsx` (992 lines) mixes the stream session, capabilities, controls and the single-shot fallback, and its pointer handling duplicates `use-pinch-zoom.ts`; `relatorio-tree.tsx` (1057 lines) mixes the tree core with both presentations. The camera's `returnFocus` watch steals the focus from a point dialog closed within ~3 s of the camera closing (deferred-work.md, row near line 1928). pnpm 12.5.1's link probe leaves `_tmp_<pid>_*` files in the bind-mounted worktree root on every `install`.

**Approach:** Move code into smaller modules with no behavior change, sharing one pointer-gesture core between the photo zoom and the camera finder; end the camera's focus watch on the first deliberate focus move; stop the pnpm probe (or clean up after it) in the `install` path.

## Boundaries & Constraints

**Always:**
- Items 1 and 2 are pure moves/extractions: same DOM, class names, ARIA, timing constants, effect order and public exports. Every existing unit and e2e test stays green UNCHANGED. Keep `camera-view.tsx` and `relatorio-tree.tsx` exporting every symbol tests and other modules import today (`CAMERA_CONSTRAINTS`, `clampZoom`, `framePoint`, `TAKE_PHOTO_TIMEOUT_MS`, `useCamera`, `RelatorioTree`, `PANEL_PARAM`, `RelatorioTreeHandle`, `RelatorioTreeProps`, ...) by re-export, so no test import changes. `vi.mock('./use-photo-capture.ts')` in `camera-view.test.tsx` must still take effect (the module that imports `use-photo-capture.ts` may move; a vi.mock on a module path mocks it for every importer, so this holds).
- Targets: no non-test source file of the camera (`camera-*.ts(x)` and the new modules under `surfaces/ficha/` plus the gesture core) over 400 lines; no non-test tree surface file (`relatorio-tree*.tsx` and the new presentation modules) over 600 lines. Test files are out of the line targets.
- Item 3 is the only behavior change and is narrow: the camera's return watch ends once the focus was deliberately moved elsewhere. E6-Q6 (a re-render dropping the focus to `<body>` after it was returned to the opener) keeps working.
- English code and comments; no emoji; no new pt-BR strings.

**Never:**
- Do not touch `theme`, `export-dialog`, `number-input` unit tests, `quantity-stepper.test.tsx`, `e2e/points.spec.ts`, `e2e/parecer-export.spec.ts`, `e2e/ficha.durability.spec.ts` or `apps/api/src/jobs/reading/` (batch co14a owns them). If unavoidable, report it under "Cross-batch".
- Do not loosen an assertion, add a retry or raise a timeout in any existing test.
- Do not change `restoreFocus` defaults for its other callers; a new option is opt-in.
- No `infra/`, no AWS, no image builds, no host pnpm/node.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Camera closes, nothing else happens | Shot taken, "Concluir" in the camera | Focus on the opener ("Adicionar foto") with `preventScroll` | n/a |
| E6-Q6 re-render | Opener took the focus, then the live query re-render drops it to `<body>` within the watch | Opener takes it back (unchanged) | n/a |
| Point dialog within the window | Camera closed from a Checklist row, then "Criar ponto de atenção" opened and "Concluir" pressed < 3 s later | Focus returns to the button that opened the dialog, not "Adicionar foto" | Watch ended when the focus moved into the dialog |
| Focus moved by the user | After return, user focuses another control | Watch ends; focus stays where the user put it | n/a |
| Fresh worktree install | `podman compose run --rm install` in a clean checkout | No `_tmp_*` file in the worktree root (or any tracked dir) | Install still exits 0 with the frozen lockfile |

</intent-contract>

## Code Map

- `apps/web/src/surfaces/ficha/camera-view.tsx` -- 992 lines. `useCamera` 110-477 (session, opener, `returnFocus` at ~198, `startStream`, burst/single-shot, `shotStored` 98); stream helpers `pendingStops`/`videoTrackOf`/`logTrackSettings` 478-493; capabilities `ZoomRange`/`CameraCapabilities`/`cameraCapabilities`/`clampZoom`/`zoomIncrement`/`framePoint` 494-575; single shot `ImageCaptureLike`/`frameAtTap` 576-649; `CameraView` component 650-831; `Pointers`/`spread`/`TAP_SLOP_PX`/`FOCUS_RING_MS`/`useCameraControls` 832-992 (own pinch + tap-to-focus pointer tracking).
- `apps/web/src/input/use-pinch-zoom.ts` -- 312 lines; `Gesture` pointer map, `startPinch`/`startPan`, `onPointerDown/Move`, `end`, setPointerCapture try/catch. Users: `surfaces/photos/photo-viewer.tsx`, `surfaces/ficha/plate-photo.tsx`; test `input/use-pinch-zoom.test.ts` (pure `clampZoom`, `maxZoomScale`, `zoomAbout`).
- `apps/web/src/input/focus-restore.ts` -- `restoreFocus(target, {mode, frames, once, preventScroll})`, `LIST_FOCUS_WATCH_FRAMES = 180`, `focusLost()`.
- `apps/web/src/components/dialog-shell.tsx` -- `useReturnFocus` (the dialog's own restore the camera watch races).
- Camera importers: `ficha/plate-photo.tsx`, `ficha/read-display.tsx`, `ficha/photo-openers.tsx`, `relatorio/panel-capture.tsx` (all `useCamera` from `./camera-view.tsx`; may stay as is via re-export).
- `apps/web/src/surfaces/relatorio/relatorio-tree.tsx` -- 1057 lines. Shared: `PANEL_PARAM`, handle/props types, `Dialog`, `Shared` 129, `COUNTS_ONLY`, `Chevron`, `sameData`, `siteRowButton`, `sameRow`, `focusParentChevron`, `treeKeys` (79-223); `RelatorioTree` 224-648; Sumário presentation `locationMenu` 649, `PlusIcon`, `SumarioLocation` 684, `equipmentMenu` 891, `SumarioEquipment` 910; rail presentation `RailLocation` 962, `RailEquipment` 1030. Importers: `ficha/ficha-rail.tsx`, `relatorio/tree-surface.tsx`, `sumario-actions.ts`, `sumario-surface.tsx`, five `relatorio-tree*.test.tsx`.
- `docker-compose.yml` `install` service (line ~110: `pnpm install --frozen-lockfile --trust-lockfile`), `x-workspace` volumes (`.:/workspace`, `pnpm_store:/pnpm-store`); `apps/api/Dockerfile`, `Dockerfile.tools` (pnpm via corepack); `pnpm-workspace.yaml`; `.gitignore:64` `_tmp_[0-9]*`. Retro: `epic-14-retro-2026-10-14.md` R14-11 (files are `_tmp_13_*`, pid 13, empty).
- E2E: `e2e/verificacoes-local.spec.ts` (14.3-E2E-001 at 269 drives the Checklist row with photo and point; 14.3-E2E-004 at 711 asserts point-dialog focus return on a row with no camera); `e2e/camera-capture.spec.ts` (fake camera setup to reuse).

## Tasks & Acceptance

**Execution:**
- `apps/web/src/input/pointer-gesture.ts` (new) -- extract the pointer core both users share: pointer map by id, capture with try/catch, tap-slop tracking, two-pointer spread/midpoint and pinch start/update, release/cancel bookkeeping. `use-pinch-zoom.ts` and the camera controls consume it; each keeps its own constants (`TAP_SLOP` 8 vs `TAP_SLOP_PX` 10, coordinate space: stage-local vs client) as parameters so behavior is identical. Add a small unit test for the core.
- `apps/web/src/surfaces/ficha/camera-*.ts(x)` (new modules) -- split `camera-view.tsx` into: stream/session (`useCamera` and stream helpers), capabilities/controls (capabilities, zoom math, `framePoint`, `useCameraControls` on the gesture core), single-shot (`ImageCaptureLike`, `frameAtTap`, `TAKE_PHOTO_TIMEOUT_MS` and the picker fallback path as far as it separates cleanly), and the `CameraView` component. `camera-view.tsx` re-exports the public API. If `useCamera` alone stays over 400 lines, move cohesive inner pieces (e.g. the burst/shot bookkeeping or `startStream`) into a helper hook in its own module; never change their order of effects.
- `apps/web/src/surfaces/relatorio/` (new modules, e.g. `relatorio-tree-shared.tsx`, `relatorio-tree-sumario.tsx`, `relatorio-tree-rail.tsx`) -- move the shared helpers/types and each presentation's row components and menus out of `relatorio-tree.tsx`; it keeps `RelatorioTree` and re-exports its public symbols. Keep `memo` comparators (`sameRow`) and component display names unchanged.
- `apps/web/src/input/focus-restore.ts` + camera `returnFocus` -- add an opt-in `if-lost` option (e.g. `until: 'moved'`) that ends the watch on the first tick where the focus sits on a connected element other than the target and not `<body>` (a deliberate move); the camera's `returnFocus` uses it. Unit test the option in the existing focus-restore test file (or a new one beside it): lost -> target takes it; target holds it then body -> retaken; other element holds it -> watch ends and later loss is not retaken.
- `e2e/verificacoes-local.spec.ts` (or `camera-capture.spec.ts`; one new `@p0` test) -- on the Checklist row: open the camera, take one shot, "Concluir"; assert the focus is on "Adicionar foto"; then within the 3 s window open "Criar ponto de atenção", fill what the dialog needs, "Concluir"; assert `document.activeElement` is the button that opened the dialog, and assert the point is in the committed store/outbox (E12-A6). Tag it with a new id (e.g. `E14-CO-B-E2E-001`). If it times taps against a render, register it in `SERIAL_SPECS`.
- Mutation run: revert only the camera's use of the new option, run the new e2e (inside the lock), confirm red, restore, confirm green. Record both in `.scratch-co14b/mutation.txt`.
- pnpm probe -- reproduce first in this worktree's stack (`podman compose run --rm install`, then `ls _tmp_*`), find which pnpm setting triggers it (likely the store-location/same-disk probe or the `package-import-method` auto probe), then fix in tracked config: preferred an explicit setting (`.npmrc`/`pnpm-workspace.yaml` `packageImportMethod`/absolute `storeDir`, or env in the `x-workspace` anchor) that skips the probe; else an install cleanup appended to the `install` command (`... && find . -maxdepth 1 -name '_tmp_[0-9]*' -delete`). Whatever is chosen must keep `--frozen-lockfile` green and not change installed contents. Update the `deferred-work.md` tooling row (~2176) with a dated strike-through closure.

**Acceptance Criteria:**
- Given the batch's diff, when counting lines, then no non-test camera source file exceeds 400 lines and no non-test relatorio tree source file exceeds 600 lines (`wc -l` in the PR body).
- Given the unchanged existing tests, when `lint`, `static`, `test:unit` and `test:api` run, then all pass except the co14a-owned failures, which are reported with names and are identical on origin/main.
- Given the camera, zoom, plate shot and tree/Sumario/Verificações e2e specs listed under Verification, when they run on desktop-chrome and durability-desktop-chrome, then all pass.
- Given a camera closed from the Checklist row, when a point dialog is opened and closed with "Concluir" within 3 s, then the focus is on the dialog's opener; with the fix reverted the same test fails.
- Given a clean worktree, when the `install` service runs, then `git status --porcelain --ignored | grep _tmp_` prints nothing.

## Design Notes

The watch must keep E6-Q6: the opener retakes the focus when a late re-render drops it to `<body>`. Ending on `once` would break that; ending on a deliberate move (focus held by a connected element that is not the target) fixes the dialog race because opening the point dialog moves the focus into the dialog before its close.

Gesture core sketch (shape, not prescription):
```ts
const g = usePointerGesture({ tapSlop, coords: (e) => ({x, y}), onTap, onPinchStart, onPinch, onPan, onEnd });
// returns { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, pointers }
```
A plain object/class without React state is acceptable; the zoom keeps its pan/double-tap logic on top.

## Verification

Environment (this host): work only in this worktree (`/Users/matheusvilella/Documents/estudos/fasor-app-co14b`); its `.env` sets compose project `fasor-co14b`, port base 32. `docker` is absent: use `podman compose`; run the tools container as `podman compose --profile tools run --rm --user root tools <cmd>`. Never run pnpm/node on the host, never build images (`app-api-co14b`/`app-tools-co14b` are pre-tagged), never touch containers not named `fasor-co14b-*`, never touch `infra/` or AWS, never commit on main. Every Playwright run goes under the host lock, started with nohup and polled: `nohup sh -c "lockf -t 20000 /tmp/fasor-verify.lock podman compose --profile tools run --rm --user root tools <cmd>; echo EXIT=\$?" > /tmp/<name>-co14b.log 2>&1 &`, then poll the log with short calls (at most 60 s each). Redirect long outputs to tagged logs and read their tail. Bring the stack up with `podman compose up -d` once before api/e2e runs.

**Commands:**
- `podman compose --profile tools run --rm --user root tools pnpm lint` / `static` / `test:unit` / `test:api` -- expected: exit 0 (co14a-owned reds excepted, named).
- `pnpm exec tsx scripts/e2e.ts e2e/camera-capture.spec.ts e2e/plate-shot-fallback.spec.ts e2e/plate-every-type.spec.ts e2e/plate.spec.ts e2e/plate-reading.spec.ts e2e/plate-units-years.spec.ts e2e/photo-zoom.durability.spec.ts e2e/photos.spec.ts e2e/sheet-photos.spec.ts e2e/gallery.spec.ts e2e/captions.spec.ts e2e/panel-capture.spec.ts e2e/panel-capture-pipeline.spec.ts e2e/review-photo-failures.spec.ts e2e/review-field-defects.spec.ts e2e/review-field-defects-2.spec.ts e2e/read-display.spec.ts e2e/read-display-pipeline.spec.ts e2e/reading-wait.spec.ts e2e/prose-reading-pipeline.spec.ts e2e/ficha.spec.ts e2e/durability.spec.ts e2e/ui-hygiene.spec.ts e2e/tree.spec.ts e2e/relatorio.spec.ts e2e/move-block.spec.ts e2e/move-block.durability.spec.ts e2e/local-painel-coluna.spec.ts e2e/verificacoes-local.spec.ts e2e/verificacoes-local.durability.spec.ts e2e/journeys-12-3-12-4.spec.ts e2e/sheet-knows-12-3-12-4.spec.ts e2e/review-layout-copy-3.spec.ts e2e/ai-features-off.spec.ts e2e/sync-status.spec.ts --project desktop-chrome --project durability-desktop-chrome` (in the tools container, under the lock) -- expected: all pass.
- Fresh install check: `git clean`-free check after `podman compose run --rm install` -- expected: no `_tmp_*` in `git status --porcelain --ignored`.

## Review Triage Log

### 2026-10-14 — Review pass
Layers run: Edge Case Hunter, Verification Gap Reviewer. Skipped: Blind Hunter, Intent Alignment (token economy; the integrated epic review covers them).
- verdicts: 5 findings — high 0, medium 3, low 1, false 1, maybe-false 0
- findings:
  - `[medium]` `[patch]` (VG) No test pins that a one-finger drag past 10 px on the camera finder is not a focus tap, though the slop check moved onto the gesture core — added `camera-view.test.tsx` "a one-finger drag past 10 px is not a focus tap; a move within 10 px still is" (11 px: no `pointsOfInterest`, no ring; 10 px: tap). Boundary test at the limit.
  - `[medium]` `[patch]` (ECH 1) `until: 'moved'` ends the watch on the first frame when React Aria's restore lands on a connected non-opener control, so a later drop to `<body>` is never recovered — `focus-restore.ts` now counts a move only after the target held the focus once (`held`); new unit test "does not end the watch on a control that holds the focus before the target ever held it".
  - `[medium]` `[patch]` (ECH 2) Focus on a soon-removed row at the first frame ends the watch — same root cause and fix as the row above.
  - `[low]` `[reject]` (ECH 3) `npm_config_store_dir` and the `pnpm_store` volume are left unused — the new compose comment says pnpm 12 ignores that line; removing the volume and the Dockerfile mount points is wider than this item and changes no behavior. Listed as known open in the PR.
  - `[false]` `[reject]` (ECH 4) Moving the store into the `node_modules_root` volume means wiping node_modules wipes the store — the store was already there: in `fasor-co14b-api-1`, `/workspace/node_modules/.pnpm-store/v11` exists and `/pnpm-store` is empty, so the setting names the store pnpm already used.
