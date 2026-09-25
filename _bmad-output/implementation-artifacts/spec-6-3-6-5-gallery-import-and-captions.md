---
title: 'Stories 6.3 to 6.5: the gallery, adding photos later, and captions from chips'
type: 'feature'
created: '2026-09-25'
status: 'done'
baseline_revision: '324d8c31ed87d03266220c4cd9b72dc6d1b10154'
review_loop_iteration: 0
followup_review_recommended: true
dev_model: opus
dev_effort: medium
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_reason: 'Stories 6.3, 6.4 and 6.5 all build the gallery surface on the photo entity (tiles, viewer, import sheet, caption composer); batched for token economy (Epic 6 orchestrator rules).'
deferred: []
---

<intent-contract>

## Intent

**Problem:** Photos exist (Stories 6.1/6.2) but only as NC-row tiles: there is no gallery, no provisional number, no stamp, no viewer, no way to add photos from files or another phone, and no way to change a caption. Sumário row 7 says "disponível em uma próxima etapa".

**Approach:** Kernel first (`packages/domain/src/photos/`: numbering and order, stamp and gallery texts, cabine filter, caption parts and composition, section 7 pre-issue rows), then the web gallery route `/relatorio/:id/fotos` (tiles, filter chips, viewer, camera and "Adicionar fotos" in its Sticky action bar, drop zone), the import path (Photo capture sheet, "De qual equipamento?" step, HEIC and EXIF on the device) reused from every sheet, and a Caption composer modal opened by "Legendar" / "Editar legenda" that writes one `file/{id}/caption` op.

## Boundaries & Constraints

**Always:**
- Reuse P1's contracts: photo = `file/{id}` row (`photoFileRowSchema`, scope `relatorio`); edits only through `fileFieldPath(id, 'caption'|'block_id'|'item_key'|'removed_at')` (`packages/domain/src/ops/path.ts`). Imports commit through `commitPhotoCapture` / `commitPhotoBatch` (original + device thumb + `photo_seq` in one transaction). No new op family, no `CONTRACT_VERSION` bump, no new seed version, no schema column.
- Order and numbering are the kernel's (AD-13): `comparePhotos` sorts by `(captured_at, local_seq, id)`; `numberPhotos(snapshot)` numbers live photos 1..n in that order. Decision closing the deferred tie-breaker: the photo row carries no `device_id`, and only one device fills a relatório (source-deltas row 14), so AD-17's device component collapses and the UUIDv7 `id` is the final deterministic tie-breaker. `photoTilesOfBlock` switches to `comparePhotos`.
- Display time zone America/Sao_Paulo (`format/datetime.ts` `DISPLAY_TIME_ZONE`); coordinates 4 decimals, pt-BR comma, Unicode minus "−", omitted when `coords` is null.
- Every count, plural, stamp, status line and composed caption is a kernel function; static copy in `apps/web/src/copy/pt-br.ts` (verbatim from the mocks, else `// authored:`); shared-component words in `copy/ui.ts`. Mock class names; any `.frame-*` rule first rendered here gets its `app.css` translation; mock-only `<style>` rules the screens need are copied into a surface CSS file with a comment naming the mock line.
- Caption agreement follows `contextCaption` (6.1): refactor it onto a shared `composeCaption(parts)` so the composer's preview and the context caption are one grammar; existing `caption.test.ts` cases stay green unchanged.
- A removed photo is a tombstone (`removed_at`), recoverable via the toast's "Desfazer" (clears `removed_at`); counters, numbers and the gallery ignore it.
- Photos never block "Gerar": the new section 7 pre-issue rows are `pending` (sem legenda) and `info` (aguardando envio), never `blocking`.

**Never:**
- No vision/suggested captions, "Confirmar todas", "Legenda ao sincronizar" banner, gallery day headers, Dictation control, priority controls, points surface or Sumário row 8 (batch P3 owns `pontos`, row 8 and `derivedPoints`; keep edits to shared files (`pre-issue.ts`, `sumario.ts`, `app.tsx`, `sumario-surface.tsx`) additive and local to section 7).
- The composer never opens by itself and never changes `block_id`/`item_key`; it writes the caption only.
- Do not refactor `setup-surface.tsx`, seed v1/v2, or the uploader beyond what import needs. No Playwright MCP pass.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Numbering | photos t2(seq 5), t1(seq 9), t1(seq 3), removed t0 | order t1/3 -> 1, t1/9 -> 2, t2 -> 3; removed has no number | none |
| Same instant + seq | two photos equal `captured_at` and `local_seq` | lower UUIDv7 `id` first | none |
| Tile stamp | `captured_at` 2026-09-06T17:32Z, coords set | "06/09 14:32" + pin glyph, accessible text "GPS" | coords null -> time only, no pin |
| Viewer stamp | same, coords -23.55052,-46.63331 | "06/09/2026 14:32 · −23,5505, −46,6333" | coords null -> "06/09/2026 14:32" |
| Item line | photo with `item_key` whose checklist value is NC, item 8 "CONTATOS" | "Item 8 · Contatos · NC" (NC in `.stamp-nc`) | unanswered item -> "Item 8 · Contatos" |
| Filter | chip "Cubículo Enel" pressed, 4 photos of blocks in that cabine | 4 tiles, status "Mostrando 4 fotos do Cubículo Enel"; "Todas" -> "Mostrando 20 fotos" | photo with no block shows under "Todas" only |
| Empty gallery | no live photo | "Nenhuma foto. Tire fotos a partir da ficha do equipamento para já sair com legenda." | none |
| Header counter | 3 pending, 1 error, 1 uncaptioned | "3 fotos aguardando envio · 1 com erro · 1 sem legenda" (`.progress-counter`) | all zero -> no counter |
| Sumário row 7 | 82 live photos, 1 caption null/blank, 3 `uploaded_at` null | "82 fotos · 1 sem legenda · 3 aguardando envio", row `has-pend` | 0 photos -> "Nenhuma foto" |
| Import from a sheet | 2 JPEGs picked/dropped on sheet B | 2 photos, `block_id` B, `item_key` null, caption = sheet context caption, EXIF time/GPS kept (`coords.source: 'exif'`) | EXIF absent -> `lastModified` then device clock, coords null |
| Import from gallery | 3 files, "De qual equipamento?" -> SEC-C05 | caption field prefilled with that block's context caption; "Adicionar 3 fotos" commits 3 photos with that `block_id` and the field's text | "Geral" -> `block_id` null, field empty (caption null if left empty) |
| HEIC | `.heic`/`image/heic` file | converted to JPEG on device (`heic-to`, lazy import) before encode | conversion fails -> file skipped, toast names the count |
| Non-image | `.pdf` dropped | skipped, toast | none |
| Composer prefill | NC-row photo on chave seccionadora in Cubículo Enel | Atividade "verificação de contatos", Equipamento "chave seccionadora", Local "Cubículo Enel" pressed; preview = stored caption | stored caption differs from preview -> opens in "Editar texto" mode with stored text |
| Composer chips | 2 recents used in this relatório on this device | Atividade row: recents (max 5) then seed `atividades` (deduped), then "Outro…" | "Outro…" -> text input; typed word agreement from registry/seed by name, else m singular |
| Editar texto | user taps "Editar texto", types | chip changes no longer regenerate the text; "Salvar legenda" writes typed text | blank text saves `caption: null` |

</intent-contract>

## Code Map

- `packages/domain/src/photos/caption.ts` -- `contextCaption`, `CAPTION_EQUIPMENT_WORDS`, `activityOf`/`localOf`/`article`: extract `CaptionParts`, `composeCaption`, `contextCaptionParts`.
- `packages/domain/src/photos/text.ts` -- `photosPendingText`, `photoUploadState`, `uploadPillText` (reuse; add gallery texts beside).
- `packages/domain/src/photos/exif.ts` -- `parseExif(bytes)`, `capturedAtFrom(exif, nowIso, offset)` for imports.
- `packages/domain/src/schemas/snapshot.ts:84` -- `buildSnapshot` drops tombstoned files; `snapshot.files` is the numbering input.
- `packages/domain/src/relatorio/pre-issue.ts` -- `PreIssueKind`, `preIssue`: append the section 7 family.
- `packages/domain/src/relatorio/sumario.ts:150` -- `metaOfSection`: section 7 meta = photo count + its pre-issue texts (like section 9's counter).
- `packages/domain/src/relatorio/cabine.ts` `cabineOf`, `relatorio/tree.ts` (tree order for the equipment picker), `relatorio/ficha.ts` / `sheet-progress.ts` (checklist item value for the item line), `relatorio/tag.ts` (TAG text), `format/datetime.ts`.
- `packages/domain/src/seed/v1.ts:621-645` -- `ATIVIDADES`/`LOCAIS` (via `getSeed(seed_version,'cabine_primaria')`); registry `atividade`/`local` rows carry `gender`/`number`.
- `apps/web/src/db/photo-store.ts` -- `PhotoTile`, `photoTilesOfBlock` (own `byCapture`: replace), `useBlockPhotoTiles`, `useLocalWordRows`; add relatório-wide tiles hook and caption recents (`local_prefs`).
- `apps/web/src/db/file-commit.ts` -- `commitPhotoCapture`, `photoCreateDraft`; `apps/web/src/db/commit.ts` `commitBatch` for field ops; `apps/web/src/db/file-store.ts` `readLocalBlob`, `ensureLocalBlob(db,id,'print',deps)`, `clearUploadError`.
- `apps/web/src/files/photo-encode.ts` -- `encodePhoto(blob)`; add HEIC conversion before it. `apps/web/src/surfaces/ficha/use-photo-capture.ts` -- `CaptureTarget`, commit flow and user/company lookup to reuse for imports.
- `apps/web/src/surfaces/ficha/photo-openers.tsx` -- `useSheetCamera`, `RowPhotoAction` (denied note), `RowPhotoList`; `sticky-action-bar.tsx` (camera slot, `.bar-buttons.has-camera`); `ficha-surface.tsx:260-285` (seed words, `contextCaption` target) and `:533` (bar mount); `checklist-section.tsx` (row tiles).
- `apps/web/src/components/photo-row.tsx` -- `PhotoRow`, `UploadPill`: extend (number badge, stamp, open button, "Legendar"); `chip.tsx` `FilterChipGroup`, `Chip`; `confirm-dialog.tsx`; `combobox.tsx`; `state/toast.tsx` (action "Desfazer"); `components/gallery.test.tsx` (register new shared components).
- `apps/web/src/app.tsx:133-165` -- add `/relatorio/:id/fotos` (title "Fotos", back to `/relatorio/:id`). `apps/web/src/surfaces/relatorio/sumario-surface.tsx:180` `openable` and `sumario-actions.ts:165` `onOpen`: row `section_7` opens the gallery.
- Mocks (grep, never read whole; `_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/mockups/`): `prototype/screens/70-fotos.html` 104-125 (gallery head, filter), 275-290 (tile row), 366-372 (sticky bar with camera + "Adicionar fotos" + "ou arraste para cá"), 395-426 (capture sheet, "De qual equipamento?"), 428-465 (viewer); `prototype/screens/71-legenda.html` 58-170 (composer, "Voltar sem alterar" / "Salvar legenda", "Ao editar, a legenda deixa de ser regenerada"); `key-photos.html` 100-135 (gallery), 314-400 (tablet composer chip rows); `DESIGN.md` 853-857 (tile, viewer, stamp, capture sheet, composer); `apps/web/src/styles/components.css` 608-645, 925-940.
- `e2e/photos.spec.ts` (P1 fixtures: fake media stream, geolocation) and `e2e/tap-budget.spec.ts`, `e2e/lost-taps.durability.spec.ts` must stay green.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/photos/order.ts` (+test) -- `comparePhotos(a,b)`, `livePhotos(snapshot)`, `numberPhotos(snapshot): Map<string, number>` per the Always rule.
- `packages/domain/src/photos/gallery.ts` (+test) -- `photoStampShort(captured_at)`, `photoStampFull({captured_at, coords})`, `photoItemLine(photo, snapshot): {text, nc: boolean} | null`, `photoCabineId(photo, snapshot)`, `galleryCabineOptions(snapshot)` (cabines holding photos' blocks, tree order, "Todas" first), `galleryFilterText(n, cabine|null)`, `galleryHeadingText(n)` "Registro fotográfico (n)", `galleryCounterText({pending,error,uncaptioned})`, `viewerCountText(i,n)` "4 de 20 · nº provisório", `photoTileLabel(n)` "Foto n, abrir", `photoCountText(n)`, `photoRemovedText(n)` "Foto n removida do relatório", import texts (`addPhotosButtonText(n)` "Adicionar n fotos", `batchScopeText(n)` "— vale para as n fotos", `batchCaptionLabel(n)` "Legenda das n fotos", `photosAddedText(n)` "n fotos adicionadas — legenda aplicada", skipped-files toast), `photoEquipmentOptions(snapshot, equipment)` ({blockId, text "SEC-C05 · Chave seccionadora · 1° Subsolo › Coluna 5"} in tree order). Plurals via the kernel `plural` helper.
- `packages/domain/src/photos/caption.ts` (+test) -- `CaptionWord`, `CaptionParts {atividade, equipamento, local}`, `composeCaption(parts): string | null`, `contextCaptionParts(photo, snapshot, meta)`, `captionWordFor(name, kind: 'atividade'|'local', words, registry)`, `captionChipOptions(prefill, recents, seed): string[]` (prefill, then 5 recents, then seed names, case-insensitive dedupe; the UI appends "Outro…"), `equipmentChipOptions(snapshot, blockId)`; `contextCaption` delegates to `composeCaption`.
- `packages/domain/src/relatorio/pre-issue.ts`, `sumario.ts` (+tests) -- kinds `photos_uncaptioned` (pending, "1 sem legenda") and `photos_pending_upload` (info, "3 aguardando envio") on row `section_7`; section 7 meta = `photoCountText(n)` joined with those rows. Export everything new from `packages/domain/src/index.ts`.
- `apps/web/src/db/photo-store.ts` (+test) -- `useRelatorioPhotoTiles(db, relatorioId)` (every live photo with thumb, local `upload_error`, `block_id`, `coords`, ordered by `comparePhotos`); `readCaptionRecents`/`pushCaptionRecents(db, relatorioId, {atividade?, local?, equipamento?})` in `local_prefs` key `caption_recents:{relatorioId}` (most recent first, max 5 each).
- `apps/web/src/surfaces/photos/photo-ops.ts` -- `setPhotoCaption`, `removePhoto`, `restorePhoto`, `setBatchPlacement` via `commitBatch` + `fileFieldPath` (scope `relatorio`).
- `apps/web/src/files/photo-import.ts` (+test) -- `importPhotoFiles(files, target, deps)`: filter images (jpeg/png/webp/heic/heif by type or extension), HEIC -> JPEG via dynamic `import('heic-to')` (add `heic-to` to `apps/web/package.json` inside the tools container), `parseExif` on the source bytes, `capturedAtFrom` (fallback `file.lastModified`, then now), coords `{lat,lng,accuracy_m:null,source:'exif'}`, `encodePhoto`, `commitPhotoCapture` per file; returns `{saved, skipped}`.
- `apps/web/src/surfaces/photos/capture-sheet.tsx` -- `PhotoCaptureSheet` bottom-sheet modal (`.photo-capture-sheet`, "Escolher arquivos" opening a hidden `<input type="file" accept="image/*,.heic,.heif" multiple>`, `.capture-reason` text, "Cancelar"); mode `sheet` (commit at once with the sheet's context caption and `block_id`) or `gallery` (then the "De qual equipamento?" step: `photoEquipmentOptions` rows + "Geral (sem equipamento)", selected row `focus-fill`, caption field prefilled via `contextCaption({block_id,item_key:null}, snapshot, {step:null,testKey:null,...})`, "Legendar" opening the composer that returns text to the field, primary "Adicionar N fotos"); `useDropZone(ref, onFiles)` showing the dashed `primary` outline and "Solte para adicionar" while dragging files.
- `apps/web/src/surfaces/photos/caption-composer.tsx` -- full-screen React Aria modal `.caption-composer` (heading "Legenda", rows Atividade · Equipamento · Local as `.chip-row.chips-recent` of `Chip`s ending "Outro…" below 1280 px, the existing `ComboBox` (custom values) at >= 1280 px; `.caption-preview` `role="status"`; "Editar texto" (`aria-pressed`) swapping to a textarea with `.btn-reason` "Ao editar, a legenda deixa de ser regenerada"; "Voltar sem alterar" / "Salvar legenda"); `onSave(text|null)`; pushes recents on save; focus returns to the opener.
- `apps/web/src/surfaces/photos/gallery-surface.tsx`, `photo-viewer.tsx`, `photos.css` -- gallery per `70-fotos.html`/`key-photos.html`: `.section-head` h2 `galleryHeadingText`, `.progress-counter`, `.section-note` (key-photos line 105 verbatim), `FilterChipGroup` "Filtrar por cabine" + visually hidden `role="status"` filter text, `.photo-row` list with `PhotoRow` (96 px tile button "Foto n, abrir", number badge, stamp line, caption in `.photo-meta` 2-line clamp, upload pill with retry, "Legendar"), empty state; Sticky action bar with the camera (`useSheetCamera` with target `{block_id:null,item_key:null,caption:null}`) and "Adicionar fotos" + `.btn-reason` "ou arraste para cá"; drop zone on the surface. Viewer: modal on `.photo-viewer` (`viewer-top` close "Fechar" + number badge + `viewerCountText`; `viewer-photo` = local original, else `ensureLocalBlob(...,'print')`, thumb meanwhile; `viewer-bottom`: `.photo-stamp.is-full` full stamp and item line, caption in body, "Editar legenda" (btn-secondary), "Remover" (btn-destructive -> `ConfirmDialog` -> `removePhoto` + toast `photoRemovedText` with "Desfazer"), `.viewer-nav` "Anterior"/"Próxima" walking the filtered order, disabled at the ends); Esc and "Fechar" return focus to the tile.
- `apps/web/src/components/photo-row.tsx` -- optional `number`, `stamp {text, gps}`, `onOpen`, `onCaption`; sheet tiles keep working; register the variants in `gallery.test.tsx`.
- `apps/web/src/surfaces/ficha/sticky-action-bar.tsx`, `photo-openers.tsx`, `ficha-surface.tsx`, `checklist-section.tsx` -- "Adicionar fotos" (`btn btn-secondary`, `i-image`) beside the camera in `.bar-buttons` opening `PhotoCaptureSheet` mode `sheet`; drop zone on the sheet; the NC row's denied note gains "Adicionar fotos" (row context incl. `item_key`); NC-row tiles get "Legendar" -> composer; bar must not overflow at 390 px.
- `apps/web/src/app.tsx`, `sumario-surface.tsx`, `sumario-actions.ts` -- gallery route; row 7 openable.
- `apps/web/src/copy/pt-br.ts`, `apps/web/src/styles/app.css` -- static copy and translations.
- `apps/api/src/sync/*.integration.test.ts` -- one test: push a photo create, then `file/{id}/caption` and `file/{id}/removed_at` ops through the sync route; both apply and pull back.
- `e2e/gallery.spec.ts` -- Playwright per the ACs; import fixtures under `e2e/fixtures/photos/` (a small JPEG with EXIF DateTimeOriginal + GPS, one without, one PNG) generated synthetically, no client material.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- close the three P1 entries (gallery camera/header count, tie-breaker, "Adicionar fotos" beside a denied camera) and mark `files_pending` entry progress; add entries for the narrowings below.

**Acceptance Criteria:**
- Given three photos shot on two sheets in two cabines, when the user opens Sumário row 7, then the gallery shows them in capture order with badges 1..3, "dd/mm hh:mm" stamps with the GPS pin, captions and pills; pressing a cabine chip shows only its photos and announces "Mostrando N fotos do ⟨cabine⟩" (`@p0`).
- Given a gallery tile, when tapped, then the viewer opens with "n de N · nº provisório", the full stamp and (for an NC-row photo) the item line; "Próxima"/"Anterior" walk the order; Esc returns focus to the tile (`@p0`).
- Given the viewer, when "Remover" is confirmed, then the photo leaves the gallery, the remaining numbers redraw, and "Desfazer" brings it back with its number (`@p0`, reload keeps the result).
- Given an NC-row photo, when its caption is changed in the composer from the sheet tile, then the gallery shows the same new caption after reload, and vice versa (`@p0`).
- Given the gallery, when "Adicionar fotos" > "Escolher arquivos" picks two JPEGs (one with EXIF time and GPS), an equipment is chosen and "Adicionar 2 fotos" pressed, then both photos carry that caption and sheet, the EXIF one sorts by its EXIF time with coords, and numbers redraw (`@p0`).
- Given a sheet, when files are added through "Adicionar fotos" (and, on desktop, dropped on the sheet with "Solte para adicionar" shown while dragging), then they save at once with the sheet's context caption and `block_id` (`@p1` for the drop).
- Given "Legendar" on a tile, when the composer opens, then the rows are prefilled, a chip change rebuilds the preview with agreement, "Outro…" accepts a typed word, "Editar texto" stops regeneration, and "Salvar legenda" writes one caption op; the composer never opens by itself (`@p0`; desktop Combobox `@p1`).
- Given Sumário row 7 with photos, one uncaptioned and some unsent, when it renders, then its status reads "N fotos · 1 sem legenda · M aguardando envio" (`@p1` + kernel unit tests).
- Given `e2e/tap-budget.spec.ts` and the lost-tap specs, when run, then they stay green.

## Spec Change Log

## Review Triage Log

### 2026-09-25 — Review pass
Skipped layers: Blind Hunter and Intent Alignment (token economy; the integrated Epic 6 review covers them). Reviewed diff: `origin/main..HEAD` after merging PR #42 (Story 6.6).
- verdicts: 24 findings — high 0, medium 6, low 17, false 1, maybe-false 0
- findings:
  - `[medium]` `[patch]` Edge: HEIC imports lose EXIF time and GPS (`parseExif` reads JPEG APP1 only) — `parseExif` falls back to the `Exif\0\0` + TIFF header in non-JPEG bytes; kernel case added.
  - `[low]` `[patch]` Edge: a mixed drop counts non-images ("Adicionar 3 fotos" for 2), an all-PDF drop still asks for the equipment — files filtered before the step; all non-image -> toast only.
  - `[low]` `[reject]` Edge: db or user null when files are picked drops them silently — the surfaces only render signed in; the fix adds a branch.
  - `[low]` `[patch]` Edge: `photoLocationEnabled` read failure keeps EXIF GPS — `.catch(() => false)`.
  - `[low]` `[patch]` Edge: turning "Outro…" off keeps the hidden typed word in the caption — deselect clears the part.
  - `[low]` `[patch]` Edge: a `caption: null` photo with a context opens in "Editar texto" — editing starts only for a non-null stored caption that differs from the preview.
  - `[low]` `[reject]` Edge: toggling "Editar texto" off then on replaces the custom text by the generated one — the user chose chip mode; rare, and the fix adds state.
  - `[low]` `[patch]` Edge: saving free text pushes chip words to recents — remember only in chip mode.
  - `[low]` `[reject]` Edge: a rejected `commitBatch` in remove/restore/caption is unhandled — IndexedDB write failures are rare; the fix adds catch branches.
  - `[low]` `[patch]` Edge: tiles and snapshot numbers can briefly disagree ("Foto 0") — the gallery numbers the tiles it renders.
  - `[low]` `[reject]` Edge: the viewed photo vanishing while open leaves `viewing` set — needs a second writer on a one-device relatório; the fix adds an effect.
  - `[low]` `[reject]` Edge: Sumário "aguardando envio" includes photos the gallery counts "com erro" — the upload error is device-local and the kernel reads the snapshot; noted as known open.
  - `[false]` `[reject]` Edge: `captured_at` null changes numbering — `photoFileRowSchema` requires `captured_at`, and only photos reach the sort.
  - `[low]` `[patch]` Edge + Verification (other): `setBatchPlacement` has no caller — deleted.
  - `[medium]` `[patch]` Edge (claim): HEIC import never gets EXIF — same root cause as the first row.
  - `[low]` `[patch]` Edge (claim): button and toast counts disagree on a mixed batch — same root cause as the second row.
  - `[medium]` `[patch]` Verification: caption recents never tested — `photo-store.test.ts` case (order, dedupe, cap 5, per relatório).
  - `[medium]` `[patch]` Verification: the denied NC row's "Adicionar fotos" never exercised — Playwright case asserting `item_key` and the NC caption.
  - `[medium]` `[patch]` Verification: `withLocation: false` never tested — `photo-import.test.ts` case.
  - `[medium]` `[patch]` Verification: the viewer's "Editar legenda" never exercised — step added to a gallery @p0 test.
  - `[low]` `[patch]` Verification: a drop on the gallery never tested — `@p1` case.
  - `[low]` `[reject]` Verification: which picture the viewer shows (original vs print vs thumb) is untested — a thumb fallback still shows the photo; known open.
  - `[low]` `[patch]` Verification (other): `atividadeWordRows` returns atividade and local rows under an atividade name — renamed with its doc.

## Design Notes

Narrowings (coordinator records them): the composer is a modal, not a route (one component serves the tile, the viewer and the gallery batch); caption recents are device-local per relatório (`local_prefs`), since one device fills a relatório and the row stores text only; the composer's Equipamento choice changes the text, never `block_id`; gallery camera shots are "Geral" (`block_id` and caption null; the mock's "local from the gallery filter" needs a location column); a removed photo is recovered by the toast's "Desfazer" only (no restore list); the gallery-batch files commit on "Adicionar N fotos", sheet imports commit at once; no gallery day headers; HEIC conversion is unit-tested with the converter mocked (no HEIC fixture in Playwright).

Open questions (conservative choice taken): tie-breaker `(captured_at, local_seq, id)`; an uncaptioned photo is `pending`, an unsent one `info`; a composer opened on a caption that differs from the regenerated preview starts in "Editar texto" mode.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:unit -- packages/domain/src/photos` -- green
- `docker compose --profile tools run --rm tools pnpm exec playwright test e2e/gallery.spec.ts e2e/photos.spec.ts e2e/tap-budget.spec.ts --project=desktop-chrome` -- green
- `docker compose --profile tools run --rm tools pnpm verify > /tmp/verify-s6p2.log 2>&1` -- green (once, at the end)

## Auto Run Result

Status: done. Stories 6.3, 6.4 and 6.5 implemented on top of merged PR #41 (6.1/6.2) and PR #42 (6.6).

- Kernel `packages/domain/src/photos/`: `order.ts` (`comparePhotos`, `livePhotos`), one `numberPhotos(files)` in `numbering.ts` (PR #42's signature, sorted by `comparePhotos`), `gallery.ts` (stamps, filter, counters, viewer and import texts, `photoEquipmentOptions`), `caption.ts` (`CaptionParts`, `composeCaption`, `contextCaptionParts`, `captionWordFor`, `captionChipOptions`; `contextCaption` delegates), `exif.ts` (Exif TIFF fallback for HEIC and other non-JPEG bytes); section 7 pre-issue family and Sumário row 7 meta.
- Web: gallery route `/relatorio/:id/fotos` (`surfaces/photos/gallery-surface.tsx`, `photo-viewer.tsx`, `capture-sheet.tsx`, `caption-composer.tsx`, `photo-caption-dialog.tsx`, `photo-ops.ts`, `use-caption-sources.ts`, `photos.css`), `files/photo-import.ts` (`heic-to` lazily), "Adicionar fotos" and drop zone on every sheet, "Legendar" on NC-row tiles, `PhotoRow` extended, caption recents in `local_prefs`, Sumário row 7 opens the gallery.
- Api: sync integration test for `file/{id}/caption` and `file/{id}/removed_at`.
- Tests: kernel units, `photo-import.test.ts`, `photo-store.test.ts`, `e2e/gallery.spec.ts` (4 @p0, 4 @p1) with synthetic fixtures.

Review: 24 findings; 14 patch rows applied as 12 fixes (5 medium entries, 7 low), 9 rejected (8 low, 1 false), 0 deferred. Follow-up review recommended: true (five medium entries patched); the named unverified risk is the HEIC Exif fallback, checked only on synthetic bytes, never on a real iPhone HEIC.

Verification: `pnpm verify` green on the second run (unit 1127, web 842, tooling 20, api 151, Playwright 106 @p0). The first run failed only 6.1-E2E-002 (focus back on "Adicionar foto" after "Concluir fotos"), which passed 3 of 3 alone and in the second full run: known load flake.

Residual risks: Sumário "aguardando envio" also counts photos the gallery shows as "com erro" (the error is device-local); the viewer's original/print/thumb choice is untested; no real HEIC file in Playwright.
