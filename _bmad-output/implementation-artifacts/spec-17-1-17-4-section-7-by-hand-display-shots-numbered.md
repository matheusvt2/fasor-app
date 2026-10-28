---
title: 'Stories 17.1 and 17.4: the REGISTRO FOTOGRÁFICO by hand, display shots numbered again'
type: 'feature'
created: '2026-10-27'
status: 'done'
baseline_revision: '2fa793381f9adc21e35bb0945c6d8d29cf36904b'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-17-context.md']
warnings: ['batched']
batched_reason: 'Stories 17.1 and 17.4 rewrite the one photo numbering (photos/numbering.ts) and the section 7 / section 9 print of photos; two branches would conflict on every line.'
deferred:
  - summary: >-
      A live photo the walk cannot place (its sheet deleted, its block definition unresolved, a site item the seed's list lacks) is numbered at the tail of the sequence but prints nowhere; before Story 17.1 it printed in section 7. The point editor's picker still offers it.
    evidence: |-
      documentPhotoOrder appends unplaced photos after every placed one, so no printed number is skipped, but a "conforme Imagem N" citing one points at nothing. Where such an orphan should print (section 7 again, nowhere, or unnumbered) is a product call for Bruno; settle also whether removing a block removes its photos.
    location: >-
      packages/domain/src/print/photo-order.ts:110
    severity: medium
  - summary: >-
      Sheet and local photos no longer print their full stamp (date, time, coordinates) or their item line anywhere in the document; before Story 17.1 they also printed in section 7 with both.
    evidence: |-
      Section 9 prints "Imagem N: legenda." only (printPhotos); section 7, which printed photoStampFull and photoItemLine, now holds Geral photos only. The account copy "Impressas na seção 7 com a data e a hora" now holds only for Geral photos. Open question for Bruno: should section 9 print the stamp and the item line under a photo.
    location: >-
      packages/domain/src/print/section-9.ts:806
    severity: medium
  - summary: >-
      The Sumário's row 7 counts every live photo ("10 fotos") while section 7 prints only the Geral photos (possibly none).
    evidence: |-
      sumario.ts l.232 photoCountText(livePhotos(snapshot).length); the row opens the gallery, which holds every photo, so counting all of them is consistent with its target; whether it should count the Geral photos is a product call.
    location: >-
      packages/domain/src/relatorio/sumario.ts:232
    severity: medium
  - summary: >-
      The gallery note's branch for a relatório without section 7 says "As fotos não saem no documento", false since Story 17.1 for sheet and local photos, which print in section 9; the present branch ties the provisional numbers to section 7 alone.
    evidence: |-
      copy/pt-br.ts gallery.note; authored copy, reword for Bruno with the stamp question above.
    location: >-
      apps/web/src/copy/pt-br.ts:924
    severity: low
  - summary: >-
      The gallery keeps its tiles in capture order while the badges now follow document order, so the grid and the viewer's previous and next read out of numeric order ("Foto 7 de 20" then "Foto 2 de 20").
    evidence: |-
      Spec Design Notes: kept deliberately ("Ordem cronológica de captura"), open question for Matheus whether the gallery sorts by number.
    location: >-
      apps/web/src/surfaces/photos/gallery-surface.tsx:118
    severity: low
  - summary: >-
      A relatório whose latest revision predates this change shows new-rule numbers under "Números da revisão N" until its next revision.
    evidence: |-
      A revision stores no numbers; the unchanged snapshot is what freezes them, so the screens recompute under the new rule. The issued DOCX and PDF keep their own numbers. Recorded in deferred-work.md.
    location: >-
      packages/domain/src/photos/gallery.ts:201
    severity: medium
  - summary: >-
      The viewer's remove confirm on a local's site-item photo ("…e das verificações do local…") is verified only by the kernel test, never through the viewer.
    evidence: |-
      VGR-1: the M12 kernel test covers all four sentences; e2e covers the sheet and Geral sentences through the viewer; the local sentence depends on the tile carrying location_id. Add a viewer-remove step to verificacoes-local 14.3-E2E-001 at its next change.
    location: >-
      apps/web/src/surfaces/photos/photo-viewer.tsx:123
    severity: low
---

<intent-contract>

## Intent

**Problem:** (17.1) Section 7 REGISTRO FOTOGRÁFICO prints every live photo, so a sheet's or a local's photo prints twice (section 7 and under its sheet or local in section 9), while Bruno wants section 7 to hold only the "Geral" photos of the general services. (17.4) Since Story 16.3 a "Ler visor" display shot takes no number, so a reader or a ponto de atenção cannot point at "Imagem N"; Bruno (answers 1 and 5 of 2026-10-27) wants display shots numbered like every other photo, under their test.

**Approach:** One kernel predicate `isGeralPhoto` selects section 7; one walk `documentPhotoOrder(snapshot)` gives the document order (Geral photos in capture order, then section 9's photos as the layout prints them) and both `numberPhotos` and section 9 read it, so every live photo, display shots included, holds one number in one sequence; `PrintPhoto.number` becomes `number` again and section 9 prints "Imagem N: ⟨legenda⟩." for a display shot. The web keeps rendering only the kernel's numbers; every caller passes the snapshot pieces `numberPhotos` now needs.

## Boundaries & Constraints

**Always:** every predicate, order, number, label and sentence lives in `packages/domain` (AD-1/AD-13); `apps/*` never re-derive "Geral", an order or a number. pt-BR copy verbatim or marked `// authored:`. The Porto Seguro goldens stay byte-identical (82 Geral photos in capture order, no display shot). Tests for every row of the matrix. English code and docs, no emoji.

**Never:** no new op, no contract or seed change, no second numbering in `apps/*`, no numbering kept by hand beside the section 9 walk, no edit to `sprint-status.yaml` or `epics.md`. Nothing else in section 9 changes for 17.1 (a sheet's photos print where they print today; the display shot's place after the tests stands). Do not touch Story 17.3's `NOT_APPLICABLE_TEXT` or `number-input.tsx` (batch e17b).

## I/O & Edge-Case Matrix

Capture order below is the order of the letters; L = local, S = sheet (block). "document order" = Geral in capture order, then section 9's walk.

| Scenario | Input / State | Expected Output / Behavior |
|----------|--------------|---------------------------|
| M1 Geral predicate | photo with `block_id`, `item_key`, `location_id`, `reading_kind` all null, live | `isGeralPhoto` true; any of the four set (a `location_id` alone, an `item_key` alone, `reading_kind: 'display'` with a block) false; a removed photo is never Geral (`livePhotos` first) |
| M2 section 7 | g2 (Geral), s1 (S1 burst), n1 (S1 NC item), p1 (S1 plate), d1 (S1 display), t1 (L1 site item), g1 (Geral, captured before g2) | `section7Photos` = [g1 "Imagem 1", g2 "Imagem 2"] only; a relatório with only sheet photos prints section 7 as the empty one prints today (`section7Layout` null) |
| M3 numbering, one cabine L1 with S1 (checklist printed) | same files; S1's photos print plate, items, other | numbers: g1 1, g2 2, t1 3 (local parts print before the sheets), p1 4, n1 5, s1 6, d1 7 (burst and display in capture order inside `other`) |
| M4 two locals, two sheets | L1: S1, S2; L2: S3; photos in reverse capture order | numbers follow `groupForPrint(snapshot)` subsections: L1 site photos, S1 photos, S2 photos, L2 site photos, S3 photos; "Agrupar por tipo" on reorders the sheets and the numbers follow (the stored `relatorio.export.scheme`) |
| M5 unplaced photos | a block photo whose block is in no subsection; a `location_id` photo whose `item_key` is not in the seed's site list or on a seed without one (v1-v3); a photo of a not-tested sheet or of a block with no definition | every one still holds a number: a block's photos in the block's walk position (whatever `sheetOf` then prints), the rest after every placed photo, in capture order; section 9 prints them exactly as today (that is, not at all) |
| M6 display line | d1 captioned "Leitura do megômetro"; d2 uncaptioned; d3 caption "Está oxidado?" | "Imagem 7: Leitura do megômetro."; d2 "Imagem 8: ⟨`photoStampFull`⟩." (never the bare "Imagem 8." of a plain uncaptioned photo); d3 "Imagem 9: Está oxidado?" (a closed caption is untouched) |
| M7 removed / restored | M3 with d1 captured before s1 (so d1 6, s1 7); d1 removed then restored | removed: s1 becomes 6 (the gap closes, as for any removed photo); restored: d1 6 and s1 7 again |
| M8 section 8 and audit | point text `[[foto:d1]]`, `[[foto:deleted]]` | "conforme Imagem 7"; the deleted one prints `REMOVED_PHOTO_REF_TEXT`; the audit's ref label of d1 is `photoRefLabel(7)` ("Imagem 7"), never "Foto" |
| M9 boundary | zero photos; one Geral only; display shots only; a removed photo cited | `numberPhotos` empty / {g:1} / {d1:1, d2:2} / the cited id absent and `REMOVED_PHOTO_REF_TEXT` |
| M10 frozen numbers | gallery with a latest revision and nothing edited since | `photoNumbersStatusText` says "Números da revisão N" and the badges are `numberPhotos(snapshot)` under the new rule (a revision stores no numbers: the snapshot being unchanged is what freezes them). A relatório whose latest revision predates this change shows new-rule numbers under that label until its next revision: the 16.3 deferred row, re-listed as known open |
| M11 screens | gallery, "Fotos da ficha" strip, caption dialog, viewer, point editor and picker on d1 | number badge "7", tile name "Foto 7, abrir", viewer "Foto 7 de N" with its count text, picker offers d1 as "Imagem 7, …", caption saved toasts "Legenda da foto 7 salva" |
| M12 remove confirm | viewer's "Remover" on a Geral photo with section 7 printing / absent; on a sheet photo; on a local's site-item photo | kernel sentence per kind (authored, listed for Bruno): Geral printing "A foto sai da galeria e da seção N. Dá para desfazer pelo aviso logo em seguida."; Geral absent "A foto sai da galeria. Dá para desfazer…"; sheet photo (any `block_id`, display shot included) "A foto sai da galeria e da ficha do equipamento. Dá para desfazer…"; local photo "A foto sai da galeria e das verificações do local. Dá para desfazer…" (QA G2 closed) |
| M13 Geral wording | capture sheet "De qual equipamento?" and the gallery camera | row "Geral — Registro fotográfico (serviços gerais)"; one `section-note` line under the gallery camera button: "Fotos tiradas aqui entram como Geral e saem no Registro fotográfico; as fotos de um equipamento ou de um local saem só na ficha ou no local." (authored, `copy/pt-br.ts`) |

</intent-contract>

## Code Map

Kernel (`packages/domain/src`):
- `photos/order.ts` -- `comparePhotos`, `livePhotos`, `photosOfBlock`, `SnapshotPhoto`. Add `isGeralPhoto(photo)` and `geralPhotos(snapshot)` (live, capture order) here: the ONE predicate (cross-story table).
- `photos/numbering.ts` -- `NumberableFile`, `numberPhotos(files)` (l.28, filters `reading_kind !== 'display'`), `photoRefLabel`. Rewrite: `numberPhotos(snapshot: NumberingSnapshot): Map<string, number>` = `documentPhotoOrder(snapshot).order` indexed from 1. Delete `NumberableFile` (no caller builds rows by hand any more) or keep it only if the api needs it (it does not: `apps/api` reads numbers through the layouts only).
- NEW `print/photo-order.ts` -- `NumberingSnapshot = Pick<RelatorioSnapshot, 'files' | 'relatorio' | 'locations' | 'blocks' | 'equipment'>` (what `groupForPrint` needs, `group-for-print.ts` l.100, plus `files`); `documentPhotoOrder(snapshot): { geral: SnapshotPhoto[]; locals: ReadonlyMap<cabineId, SnapshotPhoto[]>; sheets: ReadonlyMap<blockId, { plate: SnapshotPhoto[]; items: SnapshotPhoto[]; other: SnapshotPhoto[] }>; order: SnapshotPhoto[] }`. The walk: `groupForPrint(snapshot).subsections` in order; per subsection, the local's site-item photos once per cabine (first subsection seen, only on a seed with `site_checklist`, only photos whose `item_key` is in that list: mirror `section9Layout` l.907-935 and `localPartsOf` l.441-447), then per `blockId` the sheet's three groups in print order plate, items, other. Items vs other follows `checklistPrinted` exactly as `sheetOf` l.869-871 computes it (`enabledSubBlocksOf(block).has('checklist')`, `sheetSeedOf(seed_version) !== null`, `definition.checklist !== null`, `checklistPart` l.377): factor that predicate into one exported helper both files call. A display shot goes to `other` in capture order (today's l.833). Unplaced photos (M5) close the order in capture order.
- `print/section-9.ts` -- `Context` l.259 (`numbers`, `photos`, `sitePhotos`) and `contextOf` l.270: build from `documentPhotoOrder` (drop the two hand-made maps), `localPartsOf` l.441 and `sheetPhotos` l.830 read the walk's groups; `PrintPhoto.number` l.103 back to `number`; `displayShotLine` l.819 deleted, `photoLine(n, caption)` l.809 prints a display shot too, uncaptioned as `photoLine(n, photoStampFull(photo))` (M6, "Imagem N: ⟨full stamp⟩."). Keep `photoLine`'s `CLOSED_CAPTION` rule. Nothing else in section 9 moves.
- `print/section-7.ts` -- `section7Photos` l.55: iterate `geralPhotos(snapshot)`, number from `numberPhotos(snapshot)`; `Section7Snapshot` grows to `NumberingSnapshot` (and keeps `relatorio`/`locations` for `photoItemLine`). Rewrite the header comment (no "a photo linked to a sheet prints here too").
- `print/section-8.ts` l.236 -- `numberPhotos(snapshot)`; `Section8Snapshot` grows accordingly; `REMOVED_PHOTO_REF_TEXT` path unchanged.
- `audit/input.ts` l.126, l.168-176, l.209 -- `photoLine(fileId, number: number, …)`, the ref label `photoRefLabel(number)` always; drop the `captionPhotoLabel(null)` branch and the 16.3 comment.
- `points/refs.ts` -- no logic change; its test gains a cited display shot (through `resolveSection8` / the points surface label).
- `photos/gallery.ts` -- `captionSavedText`, `captionPhotoLabel`, `photoTileLabel`, `viewerLabel`, `photoRemovedText`, `captionPhotoMetaText` (l.181-240): keep `number | null` in the signatures (a tile can lag the snapshot for one render) but delete every "display shot" sentence from their comments. Add `photoRemoveDescription(photo, mention: SectionMention): string` for M12 (authored), beside `photoRemovedText`; `sectionMention` is `relatorio/section-position.ts` l.79.
- `index.ts` re-exports `photos/*` and `print/*` with `export *`: export the new file there.
- Tests: `photos/numbering.test.ts` (16.3-UNIT block l.17-60 rewritten to the new rule, not duplicated), `photos/order.test.ts` (Geral predicate), NEW `print/photo-order.test.ts` (M3, M4, M5, M9), `print/section-7.test.ts` l.119-140, `print/section-9.test.ts` l.1075-1130 (`number: null` rows become numbers, the "caption alone" expectations become "Imagem N: …"), `print/section-8.test.ts` l.215-250, `points/points.test.ts`, `audit/audit.test.ts` l.619-660, `print/layout.test.ts` and `apps/api/src/jobs/generate/docx.test.ts` (goldens: run, do not edit). Snapshot builders for tests: `section-9.test.ts` `photo()` l.159, `snapshotOf`, `cabine()`, `FULL_CHAVE`.

Web (`apps/web/src`), each passes `snapshot` to `numberPhotos` and shows the badge on every numbered tile:
- `surfaces/photos/gallery-surface.tsx` l.121-125 (`numberPhotos(snapshot)`; `snapshot` is l.117), l.335-346 (camera button and `camera.note`: the M13 note line goes right under them), `GERAL_TARGET` l.93 stays.
- `surfaces/photos/photo-viewer.tsx` l.106-141 (badge and count on every numbered photo), l.204-215 (`description` from `photoRemoveDescription(tile, sectionMention(snapshot, 7))`; `cited` suffix stays).
- `surfaces/photos/photo-caption-dialog.tsx` l.29; `surfaces/ficha/use-ficha-photos.ts` l.123; `surfaces/local/verificacoes-surface.tsx` l.234; `surfaces/ficha/sheet-photos-section.tsx` l.32 and the l.44 comment; `surfaces/ficha/nameplate-suggestions.tsx` l.125-128 (`snapshot` is a prop); `surfaces/points/point-editor.tsx` l.131 and the picker l.725-750 (`offered = tiles`, no `reading_kind` filter); `surfaces/points/points-surface.tsx` l.80.
- `copy/pt-br.ts` l.956-959 (`removeDescription` leaves for the kernel sentence; `removeTitle` stays), l.970 `captureSheet.general`, new `gallery.geralNote` (`// authored:`).
- Web tests beside them: `surfaces/ficha/sheet-photos-section.test.tsx`, `surfaces/photos/caption-composer.test.tsx`, `gallery-back.test.tsx`, `points/point-draft-recovery.test.tsx`; any that builds a snapshot for `numberPhotos` passes the five fields.

E2E (`e2e/`):
- NEW `section-7-by-hand.spec.ts` (`@p0`, serial): models `sheet-photos.spec.ts` l.17-20 (`test.use` fake media flags), `display-shots.spec.ts` (fixture `resetEmpresaBWithFixture`, `readStore` for the committed rows, `extractStructure` for the DOCX, `BLOCK_CHAVE_ID`), `export-visual.spec.ts` + `support/pdf-text.ts` `pdfTextItems` for the PDF text, `support/download.ts`.
- `display-shots.spec.ts` 16.3-E2E-001 l.75-186: amended (badges, picker, viewer count, "Imagem N:" line, toast), the section 7 count stays one Geral photo. `seed-v7.spec.ts` l.285-287 locators (`Foto, abrir` -> `/^Foto \d+, abrir$/`, dialog name `/^Foto \d+ de \d+$/`).
- `support/groups.ts` `SERIAL_SPECS` l.11 (add the new spec with its reason); `scripts/e2e.test.ts` stays green.

Docs (orchestrator, after the review): `_bmad-output/specs/spec-fasor/source-deltas.md` rows 128-129 (as built), `glossary.md` l.37 ("display shot" amended with strike-through) plus "Geral photo", `docs/kbs/log.md`, `docs/kbs/architecture/files-and-photos.md` and `rendering.md` where they describe numbering or section 7, `deferred-work.md` QA G2 row (l.2364-2368) closed.

## Tasks & Acceptance

**Execution (dependency order):**
- `packages/domain/src/photos/order.ts` -- add `isGeralPhoto`, `geralPhotos` -- the one predicate (M1).
- `packages/domain/src/print/photo-order.ts` (new) -- `NumberingSnapshot`, `documentPhotoOrder`, the shared `checklistPrinted` helper -- the one walk (M3-M5, M9).
- `packages/domain/src/photos/numbering.ts` -- `numberPhotos(snapshot)` over the walk; remove the display filter and `NumberableFile` -- 17.1 and 17.4 are one rewrite.
- `packages/domain/src/print/section-9.ts` -- context from the walk; `PrintPhoto.number: number`; display line "Imagem N: …" (M6) -- 17.4's print half.
- `packages/domain/src/print/section-7.ts` -- Geral photos only (M2) -- 17.1's print half.
- `packages/domain/src/print/section-8.ts`, `audit/input.ts` -- new signature, labels always numbered (M8).
- `packages/domain/src/photos/gallery.ts` -- `photoRemoveDescription` (M12), comments.
- Kernel tests listed in the Code Map, rewritten to the new rule; `print/photo-order.test.ts` new. Then the goldens: `pnpm test:unit -- packages/domain/src/print/layout.test.ts` and `pnpm test:api -- docx.test.ts` unchanged.
- Web call sites and copy (M11, M12, M13); their unit tests.
- `e2e/section-7-by-hand.spec.ts` (new): sign in, open the fixture relatório, on the chave's ficha take ONE sheet photo with the sticky bar's camera (as `sheet-photos.spec.ts` does), then in the gallery take ONE photo with the gallery camera (target Geral); assert the committed rows in the store (sheet photo `block_id: BLOCK_CHAVE_ID`; Geral photo with `block_id`, `item_key`, `location_id`, `reading_kind` null) and the captured file's size > 0 (E13-A7); assert the gallery badges: the Geral photo "1" and the sheet photo "2" although captured later (document order over capture order), the strip badge "2", the new note line under the camera; generate (as `display-shots.spec.ts` l.133-152), read the DOCX structure AND the PDF text (`pdfTextItems`): section 7 holds exactly "Imagem 1." (one image line between the section 7 heading and the next heading), "Imagem 2." appears exactly once in the whole document, after section 7, under the chave's sheet; "Imagem 3" nowhere. Add to `SERIAL_SPECS` (it generates a document).
- `e2e/display-shots.spec.ts` -- amend to M11 and M6: the display shot's strip and gallery badges, "Foto N, abrir", the composer label and badge, the toast "Legenda da foto N salva", the DOCX: section 7 still `['Imagem 1.']` among its lines, and section 9 prints `Imagem 2: ${CAPTION}.` once (the site photo captured after the display shot is Geral, so it is 1 and the display shot 2); the picker offers it as "Imagem 2, …"; the viewer shows badge "2" and "Foto 2 de 2"; the remove confirm reads the sheet-photo sentence (M12); after the remove the site photo stays "1".
- `e2e/seed-v7.spec.ts` l.285-287 -- locators.
- `e2e/support/groups.ts` -- `SERIAL_SPECS` entry.

**Acceptance Criteria (from epics.md):**
- (17.1) Given a relatório with "Geral" photos and photos on sheets, NC rows, plates, panels and site items, when the document prints, then section 7 lists the "Geral" photos only, in their numbered order, and every other photo prints only where it prints today (under its sheet or its local in section 9), never in section 7; a relatório with no "Geral" photo prints section 7 as an empty one prints today; the Porto Seguro golden documents still match (FR-68; AD-17).
- (17.1) Given the same relatório, when `numberPhotos` runs, then every live photo holds one number in one sequence: section 7's photos first in capture order, then section 9's photos in document order (local by local, sheet by sheet, each sheet's photos as section 9 orders them); section 8's "conforme Imagem N", the audit's references, the gallery's and the sheet strip's badges and the caption toast read the same numbers; the numbers frozen by a revision keep the rule in force when it was issued (AD-1; AD-15).
- (17.1) Given the gallery's "De qual equipamento?" batch and the gallery camera, when they name the "Geral" target, then the wording says where those photos print (authored: "Geral — Registro fotográfico (serviços gerais)" and one note line under the gallery camera), from `copy/pt-br.ts`, listed in the PR for Bruno.
- (17.4) Given a sheet with display shots among its photos, when `numberPhotos` runs and the document prints, then the display shots hold numbers in the single sequence (where they print, under their test), section 9 prints each as "Imagem N: ⟨legenda⟩." (uncaptioned: "Imagem N: ⟨full stamp⟩."), section 7 never lists them (they carry a `block_id`), section 8 and the audit resolve a cited display shot as "Imagem N", and the Porto Seguro goldens still match (AD-17; FR-68).
- (17.4) Given the gallery, the sheet strip, the caption dialog and the point editor, when they show a display shot, then it carries its number badge, the point editor's picker offers it, and a caption saved on it toasts with its number (`captionSavedText(n)`).
- (17.4) Given a display shot removed or restored, when the numbers recompute, then the later photos renumber as any removed photo makes them.

## Design Notes

- The walk and the numbering are one object so that no second ordering exists: section 9 prints `documentPhotoOrder(snapshot).sheets.get(blockId)` and `numberPhotos` indexes `.order`. `groupForPrint` is cheap (no reading evaluation); the walk never calls `sheetOf`.
- A photo the walk places but `sheetOf` does not print (not-tested sheet, unknown definition) keeps its number in position: section 9 prints as today and the number is stable; this is a narrowing listed in the PR (open question: should such a photo print somewhere).
- The gallery keeps its tiles in capture order ("Ordem cronológica de captura"); the badges may now read out of tile order. Open question for Matheus: whether the gallery should sort by number. Not changed here.
- `apps/web` numbers from `snapshot` everywhere (the gallery and the crop viewer numbered from the tiles until now); a tile not yet in the snapshot draws no badge for that render, as the sheet strip already behaves.

## Verification

**Commands** (tools container: `podman compose --profile tools run --rm --user root tools pnpm <cmd>`; restart `api` after the kernel change):
- `pnpm test:unit -- packages/domain/src/photos packages/domain/src/print packages/domain/src/audit packages/domain/src/points apps/web/src/surfaces` -- green, the layout golden untouched.
- `pnpm test:api -- docx` -- the structure golden untouched.
- `pnpm lint`, `pnpm static` -- green.
- Under `lockf -t 20000 /tmp/fasor-verify.lock`: `pnpm exec tsx scripts/e2e.ts e2e/section-7-by-hand.spec.ts e2e/display-shots.spec.ts e2e/photo-numbers.spec.ts e2e/gallery.spec.ts e2e/captions.spec.ts e2e/points.spec.ts e2e/sheet-photos.spec.ts e2e/read-display.spec.ts e2e/export-visual.spec.ts e2e/verificacoes-local.spec.ts e2e/seed-v7.spec.ts e2e/photos.spec.ts e2e/review-field-defects.spec.ts e2e/review-field-defects-2.spec.ts e2e/review-toasts-2026-10-08.spec.ts e2e/suggestions.spec.ts e2e/photo-zoom.durability.spec.ts --project desktop-chrome --project durability-desktop-chrome` -- green.

## Auto Run Result

- Summary: (17.1) section 7 holds the "Geral" photos only (`isGeralPhoto`/`geralPhotos` in `photos/order.ts`; `reading_kind` null or `'caption'`), every other photo prints once under its sheet or its local in section 9; one numbering in document order from `documentPhotoOrder(snapshot)` (`print/photo-order.ts`), read by `numberPhotos(snapshot)` and by section 9's `contextOf`, so section 8, the audit, the badges, the caption toast and the point picker share one map; the viewer's remove confirm is composed per photo kind in the kernel (`photoRemoveDescription`, QA G2). (17.4) display shots number in the one sequence and print "Imagem N: legenda." under their test; `PrintPhoto.number` is a `number` again; the badge returns on display shots everywhere. A Não ensaiada sheet prints its photos under it (review patch); a definition-less block is not placed and its photos number at the tail.
- Files: kernel `photos/{numbering,order,gallery}.ts`, `print/{photo-order,section-7,section-9}.ts`, `audit/input.ts`, `index.ts` and their tests; web `surfaces/photos/{capture-sheet,gallery-surface,photo-caption-dialog,photo-viewer}.tsx`, `photos.css`, `surfaces/ficha/{sheet-photos-section,use-ficha-photos,nameplate-suggestions}.tsx`, `surfaces/points/{point-editor,points-surface}.tsx`, `surfaces/local/verificacoes-surface.tsx`, `copy/pt-br.ts` and tests; e2e `section-7-by-hand.spec.ts` (new, `@p0`, serial), `display-shots`, `photo-numbers`, `gallery`, `captions`, `sheet-photos`, `seed-v7`, `verificacoes-local`, `dictation`, `review-toasts-2026-10-08`, `support/groups.ts`; docs `source-deltas.md` (rows 128, 129), `glossary.md`, `deferred-work.md`, `docs/kbs/log.md`, `docs/kbs/architecture/{files-and-photos,rendering}.md`.
- Review: 1 patch (medium: Não ensaiada and definition-less sheets), 8 deferred (orphan placement, picker offering unprinted photos, gallery order versus badge order, pre-17.1 revision numbers, viewer remove step on a site-item photo, Sumário row 7 count, gallery note copy, stamp and item line in section 9), 3 rejected (ECH-5 measured 0.33 ms per `numberPhotos` call on the Porto Seguro fixture; ECH-6 and ECH-7 rare wording cases folded into the deferred questions).
- Follow-up review recommended: false (one medium patch with boundary tests; the deferred items are product questions for Matheus and Bruno, listed in the PR body).
- Verification: pre-merge session on `8c71354c`: lint 0 errors (79 s), static green (145 s), test:api 684/684 (617 s), test:unit red on 17 load timeouts in 8 untouched files (635 s, batch e17b's gate on the same VM), superseded. Merge of origin/main `fd5efabf` as `a0724e6e`. Post-merge session on `a0724e6e`, alone on the VM: static green (38 s), test:unit 4528/4528 (263 s), the 18 touched specs plus e17b's 6 on desktop-chrome and durability-desktop-chrome 179/181 (`LOCKED_AFTER=0s`): the two failures in `verificacoes-local.spec.ts` (E14-CO-B-E2E-001 frame count 193 against 200, 14.3-E2E-005 setup POST at the 15 s timeout) during a window where the host lost its network and later rebooted; isolated rerun of that spec on `a0724e6e` 9/9 (86 s). The Porto Seguro goldens, `docx.ts` and `layout.ts` are untouched. No op fold, commit path or live query changed: no matrix run.
- Residual risk: an orphan photo (deleted sheet, off-list site item) prints nowhere until Matheus decides where (question 1 of the PR); the authored strings await Bruno.

## Spec Change Log

- 2026-10-27, implementation: the Geral predicate accepts `reading_kind: 'caption'` (narrowing of the 17.1 default; Story 9.3 gives that kind to every photo with no context, so the literal default emptied section 7).

## Review Triage Log

### 2026-10-27 — Review pass
- Layers: Edge Case Hunter and Verification Gap Reviewer (opus). Blind Hunter and Intent Alignment skipped: token economy; the integrated epic review covers them.
- verdicts: 13 findings — high 0, medium 7, low 5, false 1, maybe-false 0
- findings:
  - `[medium]` `[patch]` ECH-1 a Não ensaiada sheet's (or a definition-less sheet's) photos are numbered mid-sequence but print nowhere, so printed numbers skip them — patched: a Não ensaiada sheet prints its plate photos after the nameplate and its other photos after the reason band; a block whose definition does not resolve is not placed (its photos fall to the tail); boundary tests added.
  - `[medium]` `[defer]` ECH-2 an unplaced photo (deleted sheet, off-list site item) is numbered at the tail and prints nowhere — product call (where an orphan prints), deferred with evidence.
  - `[medium]` `[defer]` ECH-3 the picker offers photos the document never prints (same root cause as ECH-2).
  - `[low]` `[defer]` ECH-4 gallery tiles in capture order, badges in document order — kept by the spec's Design Notes, open question for Matheus.
  - `[false]` `[reject]` ECH-5 numberPhotos on the whole snapshot lags tablets — measured 0.33 ms per call on the full Porto Seguro fixture (94 sheets, 82 photos); the snapshot was already rebuilt on every state change before this change.
  - `[low]` `[reject]` ECH-6 the Geral note and label promise section 7 when the relatório lacks it — rare (section 7 removed from the Sumário) and the fix adds a branch to authored copy awaiting Bruno.
  - `[low]` `[reject]` ECH-7 remove confirm names the local's checks for a site photo that prints nowhere (removed local, off-list item) — rare orphan case; the fix needs the walk's placement in the viewer; folded into the ECH-2 question.
  - `[medium]` `[patch]` ECH-8 (claim) photos of Não ensaiada or definition-less sheets dropped out of the document — same root cause as ECH-1 for the placed sheets (patched); the orphan half shares ECH-2 (deferred).
  - `[medium]` `[defer]` ECH-9 (claim) no per-revision numbering: a pre-17.1 revision's label shows new-rule numbers — the issued files keep theirs; known open in deferred-work.md until each relatório's next revision.
  - `[low]` `[defer]` VGR-1 viewer remove confirm on a site-item photo verified only in the kernel — filed disposition defer; one viewer step in verificacoes-local at its next change.
  - `[medium]` `[defer]` VGR-other-1 Sumário row 7 counts every photo while section 7 prints the Geral ones — product call (the row opens the gallery, which holds all).
  - `[low]` `[defer]` VGR-other-2 the gallery note's absent branch and the account copy still say every photo prints in section 7 — authored copy, reword with Bruno.
  - `[medium]` `[defer]` VGR-other-3 sheet and local photos lose their stamp and item line in the document — open question for Bruno (should section 9 print them).
