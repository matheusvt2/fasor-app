---
title: 'Story 11.11: See a sheet''s photos on the sheet, and pick files in one tap'
type: 'feature'
created: '2026-10-06'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_revision: '21e217deb09fb45ed24d6d7a52b66e4cf4331c67'
baseline_commit: 'e604cbdbcd348ea522fc791fd13772574061c81d'
dev_model: opus
dev_effort: high
warnings: ['oversized']
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A photo added from an Equipment sheet goes to section 7 and shows nowhere on the sheet, and "Adicionar fotos" opens an intermediate sheet whose single "Escolher arquivos" option does not read as a button (Matheus, production, 2026-10-05; MVP review 2026-10-06 F-01: PR #92 carried no code).

**Approach:** A "Fotos da ficha" section at the end of the sheet lists the block's photos as the mock draws them (`60-ficha.html:779-795`), from one kernel function; "Adicionar fotos" opens the system file picker directly and then runs "De qual equipamento?" with the sheet's block preselected; the Photo capture sheet survives only for the denied camera, with "Escolher arquivos" drawn as a Button.

## Boundaries & Constraints

**Always:** the list and its order come from `packages/domain` (`photosOfBlock`, AD-1); the web joins device blobs by id only. Reuse `PhotoRow`, `PhotoViewer`, `PhotoCaptureSheet`, `useCamera` and the existing import path; no new photo write. pt-BR copy verbatim from `60-ficha.html` or marked `// authored:`; counts in the kernel. Every changed e2e helper keeps its tests green; the new spec runs as a human would (clicks, file picker event, reload). Strike the superseded DESIGN.md sentences through with the date; never delete them.

**Never:** no change to the camera burst, captions, numbering, the nameplate photo, sync or the api; no "Legendar" or second "Adicionar fotos" inside the strip (the viewer edits captions, the sticky bar adds photos); no Tailwind, no new CSS outside `app.css`/`ficha.css` rules that mirror the mock.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Strip | block with 3 live photos (plate, burst, import) | "Fotos da ficha (3)" after Conclusão; rows in `comparePhotos` order; badge = provisional number from `numberPhotos` over the relatório; pill from `uploadPillText`; caption text | removed photos excluded |
| No photos | block without live photos | no section at all | N/A |
| Tap a row | row 2 | Photo viewer opens on that photo, prev/next over the relatório's photos | N/A |
| Direct pick, sheet | camera not denied; "Adicionar fotos"; 2 files | no dialog before the picker; then "De qual equipamento?" with this block preselected; "Adicionar" saves with the sheet target and the context caption; strip and gallery show them | cancelled picker: nothing happens, no toast |
| Direct pick, gallery | same, from `/fotos` | picker, then the step as today (nothing preselected) | same |
| Denied camera | `getUserMedia` rejects `NotAllowedError`; "Adicionar fotos" | capture sheet opens: "Escolher arquivos" is a 56 px `btn btn-secondary`; "Tirar foto" under it, disabled, with the denied reason and OS path; both reachable by Tab, named for screen readers | Escape and "Cancelar" close it |

</frozen-after-approval>

## Code Map

- `packages/domain/src/photos/order.ts:26,35` -- `comparePhotos`, `livePhotos`; add `photosOfBlock(snapshot, blockId)` here; `photos/text.ts:43,50` `photoUploadState`, `uploadPillText`; `photos/numbering.ts:21` `numberPhotos`; `photos/gallery.ts:159` `photoTileLabel`. Add `sheetPhotosHeading(n)` in `photos/text.ts`. Export from `index.ts`.
- `packages/domain/src/print/section-9.ts:582` -- private `sheetPhotos`; leave as is (print groups differ).
- `apps/web/src/surfaces/ficha/ficha-surface.tsx:162-219` -- section order; mount the new section after `ConclusaoSection` (:218); `useFichaPhotos` (:109, `use-ficha-photos.ts:86` `useBlockPhotoTiles` is web-side filtering: replace its use in the strip by kernel ids joined to `photoTiles`).
- `apps/web/src/db/photo-store.ts:19,87,98` -- `PhotoTile`, `useRelatorioPhotoTiles`; join by id.
- `apps/web/src/components/photo-row.tsx:104` -- `PhotoRow` props (label, caption, thumb, state, onRetry, number, stamp, onOpen); renders `.photo-row` with `.photo-tile .thumb .number-badge` and `.photo-text`.
- `apps/web/src/surfaces/ficha/nameplate-suggestions.tsx:114-140` -- `PhotoViewer` already mounted on the sheet with relatório tiles and `numberPhotos`; reuse that mount (lift to the surface or share the state) so the strip opens it.
- `apps/web/src/surfaces/ficha/photo-openers.tsx:20,138` -- `useSheetCamera` (`denied`), `AddPhotosButton`; `camera-view.tsx:56,141-167,269` -- `useCamera`, denied detection, hidden `capture` input pattern to copy for the direct picker.
- `apps/web/src/surfaces/photos/capture-sheet.tsx:164,179,222,335-340,353,360,389,420` -- modes, `SheetBody`, sheet-mode immediate save (to replace by the step), `capture-option` button, hidden input, `EquipmentStep` (`chosen` starts `undefined`: add `preselectBlockId`).
- `apps/web/src/surfaces/photos/gallery-surface.tsx` -- "Adicionar fotos" `setImporting({files:null})`; drag-and-drop `initialFiles` path stays.
- `apps/web/src/surfaces/ficha/ficha-dialogs.tsx:49-53` -- `PhotoCaptureSheet mode={{kind:'sheet', target}}`.
- `apps/web/src/copy/pt-br.ts:731,808,993` -- `photos`, `captureSheet`, `ficha` titles; mock copy at `60-ficha.html:780-781`.
- `apps/web/src/styles/components.css:609-624,638-641` -- `.photo-tile`, `.photo-row`, `.photo-capture-sheet`; unchanged. `styles/app.css`, `surfaces/ficha/ficha.css` for the 56 px button translation.
- `_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/DESIGN.md:856` -- the two sentences to strike through (quoted in Design Notes).
- `e2e/gallery.spec.ts:90` `pickFiles`; `e2e/photos.spec.ts:146` denied pattern; `photo-numbers.spec.ts:55-64`, `captions.spec.ts:56-62`, `suggestions.spec.ts:344-348`, `dictation.spec.ts:46-62`, `review-field-defects.spec.ts:459-463` -- all click "Escolher arquivos" in the intermediate dialog; `e2e/support/photos.ts` helpers.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/photos/order.ts` + `order.test.ts` -- `photosOfBlock(snapshot, blockId): PhotoFileRow[]` (live, this block, `comparePhotos` order); `photos/text.ts` + test -- `sheetPhotosHeading(n)` -> "Fotos da ficha (n)"; exports.
- [x] `apps/web/src/surfaces/ficha/sheet-photos-section.tsx` (new) + `ficha-surface.tsx` -- `<section aria-labelledby>` with the heading, the mock's `section-note`, `.photo-list` of `PhotoRow` (thumb via `useObjectUrl`, number, pill, caption, stamp); `onOpen` opens the sheet's `PhotoViewer` on that id; nothing rendered when the list is empty.
- [x] `apps/web/src/surfaces/photos/capture-sheet.tsx` -- `preselectBlockId?` on sheet mode; sheet mode keeps saving the picked files at once with the sheet target (6.3/6.4, EXPERIENCE.md "saved locally at once"), then runs `EquipmentStep` preselected with the context caption, "as today" in the gallery: "Adicionar N fotos" re-points the batch through the existing batch put ops (another block, "Geral", caption, "Pessoas na foto"), and "Cancelar"/Escape keep the photos on the sheet and say so in a toast (authored, the gallery's "ficaram como Geral" pattern); no `File` is ever held in memory past the pick. `initialFiles` skips the chooser and the first render never flashes it (initialise from the prop, not in an effect). Chooser body = `btn btn-secondary` 56 px "Escolher arquivos" + disabled "Tirar foto" with `capture-reason` = denied copy.
- [x] `apps/web/src/surfaces/ficha/photo-openers.tsx`, `gallery-surface.tsx`, `ficha-dialogs.tsx` -- `AddPhotosButton` opens a hidden `<input type=file multiple accept="image/*">` when `denied` is false and hands the files to the capture sheet as `initialFiles`; opens the capture sheet when denied.
- [x] `apps/web/src/copy/pt-br.ts` -- section note (verbatim), denied reason reuse; `app.css`/`ficha.css` -- the 56 px rule with the mock reference comment.
- [x] `DESIGN.md:856` -- strike-through with "(2026-10-06, Story 11.11: …)" and the new sentence, and a dated note that a sheet batch also goes through the step, preselected; `EXPERIENCE.md:325` -- the same dated note beside "Into the gallery the sheet asks once" and beside the denied-camera sentence ("Tirar foto" disabled under "Escolher arquivos"); `docs/kbs/log.md` one line naming both.
- [x] `e2e/sheet-photos.spec.ts` (new) -- the ACs below, plus: Cancelar/Escape on the sheet step keeps the photos on the sheet (device rows and toast); re-pointing to "Geral" and to another block (`block_id`, `item_key: null`); "Pessoas na foto" from a sheet (`people_in_photo: true` on the row); a PDF plus a JPEG from a sheet (skipped toast, "Adicionar 1 foto"); the gallery's denied chooser (`@p1`); the "cancelled picker" case named for what Playwright can drive (an empty `change`), with the no-toast check given a settle wait. `e2e/gallery.spec.ts` 6.4-E2E-006 also asserts the NC row's create carries `reading_kind: 'nc_obs'` (the `nc-draft.spec.ts` assertion). `pickFiles` and the six specs listed -- pick through the direct picker (`waitForEvent('filechooser')` on the opener click).
- [x] `apps/web/src/surfaces/ficha/sheet-photos-section.test.tsx` -- renders the rows from kernel ids in order, hides when empty.

**Acceptance Criteria:**
- Given a sheet with a plate photo and two imported photos, when it opens, then "Fotos da ficha (3)" lists them in capture order with number badges equal to the gallery's provisional numbers, and tapping the second opens the viewer on it (11.11 AC 1).
- Given the camera is available, when the user taps "Adicionar fotos" on a sheet, then the file chooser fires with no dialog before it, "De qual equipamento?" opens with the sheet's block preselected, and after "Adicionar" the strip and `/fotos` show the photos with the context caption (AC 2).
- Given the same on `/fotos`, when the user picks files, then the step opens with nothing preselected (AC 2, gallery).
- Given `getUserMedia` denied, when the user taps "Adicionar fotos", then the capture sheet opens, Tab reaches "Escolher arquivos" (role button, 56 px) and "Tirar foto" (disabled, reason beneath), and "Escolher arquivos" fires the chooser (AC 3).
- Given the Playwright suite, when `@p0` runs at 1280 and `@p1` at 768 and 390, then the strip, the picker and the denied sheet pass as a human would, and every existing photo spec stays green (AC 4).

## Implementation Notes

- 2026-10-06, loop 0 (bmad-dev-opus-high): `photosOfBlock` and `sheetPhotosHeading` in the kernel; `SheetPhotosSection`/`SheetPhotos` after Conclusão on `useCropViewer` (the viewer the nameplate crops already mount); `useDirectPicker` and `AddPhotosButton {denied, onFiles, onOpenSheet}`; `useSheetCamera.denied`; sheet mode of the capture sheet with `preselectBlockId` and `initialFiles`; the denied chooser as two 56 px secondary Buttons; DESIGN.md strike-throughs; `sheet-photos.spec.ts` and seven specs moved to the direct picker. The orchestrator added the 64 px `thumb-inline` rule (`ficha.css`) and released the Porto Seguro fixture that the review company held.
- 2026-10-06, loop 1 (bad_spec): sheet picks save at once with the sheet target and the step re-points through `assignPhotoBatch` with the saved values (`block_id`, `item_key: null`, caption, `reading_kind` cleared on a move); Cancelar/Escape keep the photos on the sheet with `photosKeptOnSheetText`; no chooser flash; EXPERIENCE.md:325 struck through; E2E-007 to E2E-011 and the NC-row `nc_obs` assertion.
- Hands-on pass (orchestrator, Playwright MCP, real Chrome, dev server): the strip on SEC-ENEL-2 of the review relatório at 1280 (64 px tiles, numbers 1-3, no pills once uploaded), the direct picker with no dialog before it and the step preselected with the context caption, the photo landing as nº 3; the denied chooser reached by keyboard (Tab to "Escolher arquivos" 56 px, Tab to the disabled "Tirar foto" 56 px with the reason) at 1280 and 390 (no overflow), the strip at 390 and 768, and both in dark mode. Screenshots `reviews/mvp-review-2026-10-06/shots/90-97-11-11-*.png`. The Vite container had to be restarted once (its watcher missed the host edits through the podman bind mount).
- Environment facts: `docker` is absent on this host (podman, `podman compose`), the `tools` bind mount is not writable by uid 1000 under podman (e2e runs with `--user root`, node_modules chowned back afterwards), `flock` does not exist on macOS, and `pnpm verify`'s first phase is OOM-killed on the 4 GB podman VM, so the gate ran stage by stage (`test-results/gate/`). `src/db/seed-cli.integration.test.ts` (3 tests) fails on podman because `assertInCompose` requires `/.dockerenv`; pre-existing, not this story's.

## Spec Change Log

### 2026-10-06 — loop 1 (bad_spec)

- Trigger: review findings BH2/EC6/VG-other "Cancelar or Escape on the sheet's 'De qual equipamento?' discards the picked files silently", VG1 (untested branches), EC4 (one-frame chooser flash), BH1/BH14 (EXPERIENCE.md and the rest of the DESIGN.md row not amended).
- Amended: Tasks 3, 6 and 7 (save at once then the step, as the gallery does; the extra tests; the EXPERIENCE.md note) and the Design Notes decisions.
- Known-bad state avoided: `File` objects held in React state until "Adicionar N fotos", lost on Cancelar, Escape, a scrim tap or a tab kill; the first render of a sheet-mode sheet with `initialFiles` drawing the denied chooser for one frame.
- KEEP: everything else of loop 0 stands as built and reviewed: `photosOfBlock`/`sheetPhotosHeading` and their tests; `SheetPhotosSection`/`SheetPhotos` on `useCropViewer` (with the 64 px `thumb-inline` rule in `ficha.css`); `useDirectPicker`/`AddPhotosButton {denied, onFiles, onOpenSheet}`; `useSheetCamera.denied`; the `importing {target, files}` state; `preselect` on `EquipmentStep` with the lead row; the denied chooser as two 56 px secondary Buttons; `peopleInPhoto` on `ImportTarget`; the DESIGN.md strike-throughs; the seven updated specs and `sheet-photos.spec.ts` E2E-001 to E2E-006 (adjusted to the saved-at-once rule where they assert the step).

## Review Triage Log

### 2026-10-06 — loop 0 review (blind hunter BH1-15, edge cases EC1-8, verification gap VG1-5 + 2 other)

| Finding | Verdict | Evidence and route |
|---|---|---|
| BH2, EC6, VG-other-1: sheet step holds `File`s; Cancelar/Escape discard them silently | high | `capture-sheet.tsx` `held` state, `onCancel={onClose}`; the story says the step runs "as today", and today the gallery saves first and Cancelar keeps the batch with a toast. Route: bad_spec (Task 3). |
| VG1: peopleInPhoto, re-pointing and Cancelar from a sheet untested | medium | every sheet e2e presses "Adicionar N" on the preselected row. Route: bad_spec (Task 7, folded into loop 1). |
| VG2: NC row import no longer asserts `reading_kind: 'nc_obs'` | medium | 6.4-E2E-006 asserts block, item and caption only. Route: bad_spec (Task 7). |
| VG3: `holdForSheet` skipped-files branch untested | low | real, cheap: Task 7. |
| VG4, BH12: gallery denied chooser untested | low | `gallery-surface.tsx` ternary unexercised: Task 7 (`@p1`). |
| EC4: one-frame chooser flash with `initialFiles` | low | `held` set in a mount effect, first render draws the chooser: Task 3. |
| BH1, BH14: EXPERIENCE.md:325 and the rest of the DESIGN.md row not amended | medium | E:325 still says only the gallery asks; D:856 still says "A gallery batch is followed by one step": Task 6. |
| BH10, VG-other-2: the "cancelled picker" test drives an empty `change`, and `toHaveCount(0)` settles at once | low | true of Playwright; Task 7 (rename, settle wait). |
| BH6, EC1, EC8: strip row with no device tile cannot open the viewer | low | tiles and the snapshot are read from the same Dexie entity rows (`photo-store.ts:60`), so a row without a tile exists only for the live-query lag of one render. Rejected: unlikely in use, the fix adds a fallback. |
| BH7, EC2: strip and viewer number photos differently | false | both call `numberPhotos` over the same live rows (`removed_at === null` on both sides); they differ only during the same lag. |
| EC3: `void importFiles(...)` after the sheet closed, rejection unhandled | false as a new defect | the pre-11.11 sheet path was `void importFiles(list, target)` too, and `usePhotoImport` reports failures itself. Pre-existing; not this story's. |
| BH5, EC5: a drop on a sheet saves at once without the step | low | true; the story names only "Adicionar fotos"; with Task 3 the pick saves at once too, so the two paths agree on the saved rows. Rejected; recorded in Design Notes. |
| BH11, EC7: `denied` is sticky until reload; untried camera opens the picker | low | pre-existing `useCamera` per-mount state; the story defines denied by `getUserMedia` rejecting. Rejected; recorded in Design Notes. |
| BH8: extra relatório tile query and viewer instance on the sheet | low | real cost, same pattern as the nameplate and readings. Deferred to deferred-work.md. |
| VG5: strip retry pill wiring untested | low | one line on the shared `PhotoRow`; the pill is proven on the checklist row. Deferred. |
| BH9: `numbers.get(id) ?? 0` | false | `numberPhotos(snapshot.files)` numbers every live photo and the strip lists only live photos. |
| BH13: strip outside the section stepper | low | the mock draws it as a plain section after Conclusão; the stepper has four steps by design. Rejected. |
| BH15: spec not in the diff | false | the diff excludes the spec on purpose; the ACs are checked by the orchestrator. |
| (self) strip tile at 96 px, not `thumb-inline` | low | patched in loop 0 by the orchestrator (`ficha.css`, 64 px). |

### 2026-10-06 — loop 1 review (blind hunter BH1-12, edge cases EC1-7, verification gap VG1 + 2 other)

| Finding | Verdict | Evidence and route |
|---|---|---|
| VG-other-1, BH2, EC1: a batch saved from an NC row keeps its queued `nc_obs` reading after the step moves it to another block or "Geral" | medium | `assignPhotoBatch` puts `block_id`/`item_key` and leaves `reading_kind`; the draft would land on a row the photo left (or the server refuses the target). Route: patch (clear the reading on a move, through the saved values). |
| VG1: an item-level batch moved off its row is not driven end to end | medium | E2E-008 picks from the sticky bar (`itemKey` null already). Route: patch (NC-row move e2e asserting `block_id`, `item_key: null`, `reading_kind`). |
| BH3, EC6, VG-other-2: `ImportTarget.peopleInPhoto` has no producer | low | the people mark goes through `assignPhotoBatch`; dead field. Route: patch (delete; the loop-1 KEEP line about it is withdrawn). |
| BH4: EXPERIENCE.md:325 amended mid-sentence, two superseded sentences not struck through | low | AGENTS.md strike-through rule. Route: patch. |
| BH8, EC7: dead `openedWith` state, `mode.target()` read twice, the "no File kept past the save" comment and the `CaptureSheetMode` sheet-mode doc overstate | low | `importing.files` lives in React state until the dialog closes. Route: patch (remove the state, fix both comments). |
| BH11: `ficha.css` declares the strip tile selector twice | low | Route: patch (one rule). |
| BH12: no blank line between the two new deferred-work entries | low | fixed by the orchestrator. |
| BH-e2e: redundant `setViewportSize` in E2E-005 | low | Route: patch. |
| EC2: sheet mode with no session drops a re-point answer silently | low | the sheet mounts under `RequireSession`; `db`/`user` null is unreachable there. Rejected. |
| BH1, EC5: a drop on a sheet saves at once with no step | low | carried: decided in Design Notes (the story names only "Adicionar fotos"); EXPERIENCE.md "dragging onto a sheet" stays true. |
| BH5: the strip omits the mock's item line ("Item 8 · Contatos · NC") and "Enviada" | low | the story's AC names badge, pill and caption; the mock adds the row line. Deferred (deferred-work.md). |
| BH6: no e2e of the strip on a read-only (not tested) sheet | low | the strip has no write of its own; the viewer's actions are the gallery's. Deferred. |
| BH7: the step adds a tap to every sheet pick | false as a defect | the story AC says "after the pick the existing 'De qual equipamento?' step runs"; recorded in Design Notes. |
| BH9: `photosKeptOnSheetText` repeats `photosKeptGeneralText` | low | cosmetic; rejected. |
| BH10: `assignPhotoBatch` positional parameters | low | a refactor, not a defect; rejected. |
| BH-e2e: fixed 1 s settle, caption-only change and Escape-during-save not driven | low | a no-toast check needs a settle; the other two are covered by the unit tests. Rejected. |
| BH-e2e: `RowPhotoAction` never reaches the direct picker | false | the NC row's "Adicionar fotos" exists only after its camera was refused (Story 6.4). |
| EC3, EC4 (strip row without a tile, numbering): | low / false | carried from loop 0 (same evidence). |

## Design Notes

Strike-through target, DESIGN.md "Photo capture sheet" (D:856), verbatim: "The import path (from the "Adicionar fotos" button, a drop on a computer, or when the camera is denied)." and "One 56px option "Escolher arquivos" (and "Tirar foto" only when reached from a denied camera, with the reason in `label` beneath it)." Replacement: "Adicionar fotos" opens the system file picker directly; the sheet remains for the denied camera only, with "Escolher arquivos" as a 56 px secondary Button and "Tirar foto" under it with the reason. EXPERIENCE.md E:325 already says the picker opens directly; no change there.

Decisions: the mock's "Legendar" and the section-head "Adicionar fotos" are left out (viewer and sticky bar own them); the sheet import keeps saving at once (6.3/6.4) and the equipment step runs on top of it "as today", so no cancel path loses a photo; a drop on a sheet keeps saving at once with no step (the story names only "Adicionar fotos"); the strip's tile takes the 64 px `thumb-inline` width (DESIGN.md Photo tile wins over the mock's 96 px); `denied` is the existing per-mount `useCamera` state, known after a refused camera tap (no Permissions API probing); the e2e `@p1` viewport tests set `page.setViewportSize` inside the `desktop-chrome` project.

## Verification

**Commands:**
- `podman compose --profile tools run --rm tools pnpm test:unit -- packages/domain/src/photos apps/web/src/surfaces/ficha apps/web/src/components` -- green.
- `podman compose --profile tools run --rm tools pnpm test:e2e -- e2e/sheet-photos.spec.ts e2e/gallery.spec.ts e2e/photos.spec.ts e2e/photo-numbers.spec.ts e2e/captions.spec.ts e2e/suggestions.spec.ts e2e/dictation.spec.ts e2e/review-field-defects.spec.ts` -- green.
- `flock /tmp/fasor-verify.lock podman compose --profile tools run --rm tools pnpm verify` -- green; output pasted in the PR.
- Hands-on pass in the Playwright MCP browser at 390, 768 and 1280, light and dark, keyboard only on the denied sheet.

## Auto Run Result

Status: done (review loop 1, bad_spec once, then one patch pass).

**Summary:** the kernel lists a sheet's photos (`photosOfBlock`) and the sheet draws them as "Fotos da ficha (n)" after Conclusão, 64 px inline tiles with the relatório's numbers, pill and caption, a tap opening the viewer. "Adicionar fotos" opens the system picker directly on the sheet and in the gallery; a sheet's pick saves at once on the sheet and "De qual equipamento?" runs preselected to re-point the batch (Cancelar keeps the photos on the sheet with a toast). The denied camera keeps the capture sheet with two 56 px secondary Buttons. DESIGN.md and EXPERIENCE.md carry dated strike-throughs.

**Review findings:** loop 0: 30 findings, 1 high (held files lost on Cancelar) routed bad_spec with 6 folded into the amended tasks, 11 rejected, 2 deferred. Loop 1: 24 findings, 1 medium (the moved NC-row batch kept its `nc_obs` reading) and 6 low patched, 2 deferred, the rest rejected or carried. Triage rows above.

**Verification (gate stage by stage, `test-results/gate/`, 2026-10-06):**
- `lint`: green. `static`: green.
- `test:api`: 509 passed, 3 failed, all `src/db/seed-cli.integration.test.ts` (the CLI's `assertInCompose` wants `/.dockerenv`, which podman does not create; pre-existing on this host).
- `test:unit`: full run 2861 passed, 10 failed under load (five at the 880 s timeout); the eight failing files re-run with one worker: 158 passed, 2 failed, both pre-existing on this host (`scripts/tooling.test.ts` seed-users CLI, same `/.dockerenv` cause; `apps/web/src/state/theme.test.tsx` "sets the attribute at once", the baseline failure recorded in deferred-work.md on 2026-10-06).
- `test:e2e` (`@p0`, desktop-chrome and durability-desktop-chrome): 198 passed, 0 failed (parallel 163/163, serial 35/35, 751 s). A first run failed whole because the `api` container had stalled on a pg-boss error during the earlier stages; it was restarted and the stage re-run.
- Touched specs, all tags: `sheet-photos.spec.ts` 13/13 and `gallery.spec.ts` 16/16 (implementer's run after the patches); `photo-numbers` 7.3-E2E-001 (`@p1`) fails identically on the baseline.
- Hands-on pass: see Implementation Notes.

**Residual risks:** the `denied` state is known only after a refused camera tap (per-mount `useCamera` state); a drop on a sheet saves at once with no step; the strip omits the mock's checklist row line (deferred).
