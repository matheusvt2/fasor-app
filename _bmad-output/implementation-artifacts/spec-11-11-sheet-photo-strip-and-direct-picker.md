---
title: 'Story 11.11: See a sheet''s photos on the sheet, and pick files in one tap'
type: 'feature'
created: '2026-10-06'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_revision: '21e217deb09fb45ed24d6d7a52b66e4cf4331c67'
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
- [ ] `packages/domain/src/photos/order.ts` + `order.test.ts` -- `photosOfBlock(snapshot, blockId): PhotoFileRow[]` (live, this block, `comparePhotos` order); `photos/text.ts` + test -- `sheetPhotosHeading(n)` -> "Fotos da ficha (n)"; exports.
- [ ] `apps/web/src/surfaces/ficha/sheet-photos-section.tsx` (new) + `ficha-surface.tsx` -- `<section aria-labelledby>` with the heading, the mock's `section-note`, `.photo-list` of `PhotoRow` (thumb via `useObjectUrl`, number, pill, caption, stamp); `onOpen` opens the sheet's `PhotoViewer` on that id; nothing rendered when the list is empty.
- [ ] `apps/web/src/surfaces/photos/capture-sheet.tsx` -- `preselectBlockId?` on sheet mode; sheet mode runs `EquipmentStep` (preselected, "Adicionar" enabled at once) instead of saving immediately; `initialFiles` skips the chooser; chooser body = `btn btn-secondary` 56 px "Escolher arquivos" + disabled "Tirar foto" with `capture-reason` = denied copy.
- [ ] `apps/web/src/surfaces/ficha/photo-openers.tsx`, `gallery-surface.tsx`, `ficha-dialogs.tsx` -- `AddPhotosButton` opens a hidden `<input type=file multiple accept="image/*">` when `denied` is false and hands the files to the capture sheet as `initialFiles`; opens the capture sheet when denied.
- [ ] `apps/web/src/copy/pt-br.ts` -- section note (verbatim), denied reason reuse; `app.css`/`ficha.css` -- the 56 px rule with the mock reference comment.
- [ ] `DESIGN.md:856` -- strike-through with "(2026-10-06, Story 11.11: …)" and the new sentence; `docs/kbs/log.md` one line.
- [ ] `e2e/sheet-photos.spec.ts` (new) -- the ACs below; `e2e/gallery.spec.ts` `pickFiles` and the six specs listed -- pick through the direct picker (`waitForEvent('filechooser')` on the opener click).
- [ ] `apps/web/src/surfaces/ficha/sheet-photos-section.test.tsx` -- renders the rows from kernel ids in order, hides when empty.

**Acceptance Criteria:**
- Given a sheet with a plate photo and two imported photos, when it opens, then "Fotos da ficha (3)" lists them in capture order with number badges equal to the gallery's provisional numbers, and tapping the second opens the viewer on it (11.11 AC 1).
- Given the camera is available, when the user taps "Adicionar fotos" on a sheet, then the file chooser fires with no dialog before it, "De qual equipamento?" opens with the sheet's block preselected, and after "Adicionar" the strip and `/fotos` show the photos with the context caption (AC 2).
- Given the same on `/fotos`, when the user picks files, then the step opens with nothing preselected (AC 2, gallery).
- Given `getUserMedia` denied, when the user taps "Adicionar fotos", then the capture sheet opens, Tab reaches "Escolher arquivos" (role button, 56 px) and "Tirar foto" (disabled, reason beneath), and "Escolher arquivos" fires the chooser (AC 3).
- Given the Playwright suite, when `@p0` runs at 1280 and `@p1` at 768 and 390, then the strip, the picker and the denied sheet pass as a human would, and every existing photo spec stays green (AC 4).

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

Strike-through target, DESIGN.md "Photo capture sheet" (D:856), verbatim: "The import path (from the "Adicionar fotos" button, a drop on a computer, or when the camera is denied)." and "One 56px option "Escolher arquivos" (and "Tirar foto" only when reached from a denied camera, with the reason in `label` beneath it)." Replacement: "Adicionar fotos" opens the system file picker directly; the sheet remains for the denied camera only, with "Escolher arquivos" as a 56 px secondary Button and "Tirar foto" under it with the reason. EXPERIENCE.md E:325 already says the picker opens directly; no change there.

Decisions: the mock's "Legendar" and the section-head "Adicionar fotos" are left out (viewer and sticky bar own them); the sheet import now runs the equipment step, as the story text says, which changes the 6.3/6.4 "saves at once" behaviour; the e2e `@p1` viewport tests set `page.setViewportSize` inside the `desktop-chrome` project.

## Verification

**Commands:**
- `podman compose --profile tools run --rm tools pnpm test:unit -- packages/domain/src/photos apps/web/src/surfaces/ficha apps/web/src/components` -- green.
- `podman compose --profile tools run --rm tools pnpm test:e2e -- e2e/sheet-photos.spec.ts e2e/gallery.spec.ts e2e/photos.spec.ts e2e/photo-numbers.spec.ts e2e/captions.spec.ts e2e/suggestions.spec.ts e2e/dictation.spec.ts e2e/review-field-defects.spec.ts` -- green.
- `flock /tmp/fasor-verify.lock podman compose --profile tools run --rm tools pnpm verify` -- green; output pasted in the PR.
- Hands-on pass in the Playwright MCP browser at 390, 768 and 1280, light and dark, keyboard only on the denied sheet.
