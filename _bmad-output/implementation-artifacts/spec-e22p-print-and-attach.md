---
title: 'e22p: Stories 22.1 to 22.3, attach a photo file to a reading and a cleaner printed ficha'
type: 'feature'
created: '2026-11-06'
status: 'done'
baseline_revision: 'b71b9075'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-22-context.md'
warnings: ['batched', 'multiple-goals', 'oversized']
# batched: 22.2 and 22.3 share print/section-9.ts and its api renderer; 22.1 is small and web-only (epic-22-context.md batch plan).
deferred:
  - summary: >-
      The LibreOffice page-placement proof of 22.3 (ACs 3 and 4) is skipped by the tools container's test:api; it runs only where soffice is on the path (the api container).
    evidence: |-
      page-placement.integration.test.ts describe.skipIf(!sofficeOnPath), the Story 20.5 pattern; the batch ran it in the api container and records the output in the PR body.
    location: >-
      apps/api/src/jobs/generate/page-placement.integration.test.ts
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Bruno's 2026-11-06 review: the printed ficha carries four authored internal lines and a doubled unit, a sheet can split from its CONCLUSÃO, nameplate words break inside themselves, and repeated photo captions read the same. Matheus: a photo file on the computer cannot be attached where the app asks for a plate, display or panel reading.

**Approach:** Kernel print changes in `packages/domain/src/print/` (drop four lines, one N/A, unit once, keep flags, minimal column widening, caption ordinals) drawn by the api renderer; one "Anexar arquivo" action beside each reading opener that commits the picked file through the import path with the opener's `CaptureTarget` (reading included). No contract bump, no seed change.

## Boundaries & Constraints

**Always:**
- Stories 22.1, 22.2, 22.3 in `_bmad-output/planning-artifacts/epics.md` (lines 5680-5821) are the contract; read them.
- Coordinator constraint (Matheus, 2026-11-06), wins over any reading below: Bruno liked the document and the photo grouping. Photo grouping, order, numbering, sizes, the per-sheet photo block (Story 20.6) and section 7 (Story 21.3) stay exactly as they are. 22.3's caption change is only the ordinal suffix; its keep-together only adds keep-with-next flags (no page break beyond what keeping a sheet with its CONCLUSÃO and a part whole needs); fitted columns only widen a value column where a word would break, label columns and table structure unchanged. 22.2 removes only the four lines and the duplicated unit.
- Every printed string and every keep/width decision is composed in `packages/domain` (AD-1/AD-13); the renderer only draws flags.
- The screen is unchanged by 22.2 and 22.3 (attribution, criterion line, criteria line, item line and captions stay on screen).
- Kernel and print changes reach every relatório, seed v1 to v11 (Bruno's v5 one included).
- 22.1 reuses the import path (`importPhotoFiles`, HEIC conversion, EXIF DateTimeOriginal else `lastModified`) and the shot's `CaptureTarget`, so the reading job, suggestions, the retake's cancel of older plates (CAPT-V1) and the quota behave as for a shot.
- New pt-BR strings: "Anexar arquivo" (authored) in `apps/web/src/copy/pt-br.ts`; the ordinal " (2)" composed in the kernel. No emoji.

**Never:**
- No contract or seed bump, no new op. No edit of `relatorio/conclusion.ts` or `relatorio/parecer.ts` (e22c owns them); in `print/section-9.ts` do not change the CONCLUSÃO boxes or the conclusion text logic beyond removing the criteria line.
- No change to "Câmera do aparelho", to the camera itself, or to the gallery's "Adicionar fotos".
- No golden regeneration beyond the diffs these stories cause (removed item lines, bare cells under a unit header, caption ordinals).
- No new visual look: use existing mock classes (`btn btn-text` or `read-display-btn`, sprite `i-image`); a `.frame-*` translation, if any, goes in `app.css` with the mock rule named.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Attach plate | sheet, no plate photo, pick plate JPEG via "Anexar arquivo" | photo stored with `reading.kind='plate'`, pending row, fake suggestions arrive, accept fills nameplate | none |
| Attach retake | plate photo exists, attach a file | new photo id minted up front; older plate readings cancelled (`cancelOlderPlates`) | none |
| Attach display | "Ler visor" on insulation cell | photo with that cell's `display` target, suggestion lands in the cell; prints under its test | none |
| HEIC / large / non-image | HEIC; 6000 px JPEG; .pdf | HEIC converted and read; large re-encoded to the original cap like any import (no client size message exists: narrowing); non-image not offered (`PHOTO_ACCEPT`), and skipped with the import's toast if forced | skipped toast |
| AI off | company AI features off | "Anexar arquivo" hidden wherever the shot's reading opener is hidden | none |
| N/A text | nameplate/config text "na", "N.A.", "n/a", "NA", "N.A" | prints "N/A"; "-" prints "-" | none |
| Unit once | readings 4,9/3/2 GΩ | header "VALORES (GΩ)", cells "4,9" | mixed units: "VALORES", cells with unit (today) |
| Caption repeat | three photos of one block, same printed caption | "…TR-1.", "…TR-1 (2).", "…TR-1 (3)."; numbers unchanged | uncaptioned photos never get a suffix |

</intent-contract>

## Code Map

- `packages/domain/src/print/section-9.ts` -- the print model. Attribution: `CONCLUDED_BY`/`FILLED_BY` (210-211), `attributed`/`attributionOf` (329-341), `PrintSheet.attribution` (128-135), set in `sheetOf` (864). "CRITÉRIO:" paragraph: `CRITERION_PREFIX` (205-206), pushed in `testParts` (657). Measurement "ACEITÁVEL: … · fonte" row: `measurementTestPart` (741). Criteria line: `conclusionParts` (795). Item line: `printPhotos(…, withItemLine)` (826-841), `PrintPhoto.itemLine` (109-124), `sheetPhotos` (843-847). Text values: `storedValueText` (256-273), `configPart` (679-686). Unit: `readingText` (527-532), `valoresHeader` (494-503), `measurementHeader` (505-525), `measurementTable` (617-633); library tables already drop the cell unit (`sharedUnit`/`measurementText`, 709-725). Widths: `emWidth`, `CONTENT_WIDTH_EM`, `fittedColumns` (562-614); pair tables `nameplatePart` (365-383) and `pairsTable` (665-676) use `[1.6,1.7,…]`; `cabineParts` (351-362) and `instrumentPart` (463-485) use equal weights. Keep: `PrintTable.keepWhole` (96-107), `wholeTable` (243).
- `apps/api/src/jobs/generate/sections/section-9.ts` -- renderer: `drawRow` keepNext (128-145), `drawTable` (161-174), `drawPhotos` item line (178-202), `sheetChildren` attribution (209-225), `partsChildren` gap and paragraph (237-248). Every sheet already starts a page (`section9Children`, 271-288).
- `packages/domain/src/print/section-7.ts` -- `section7Photos`, `captionSentence` (49-73): ordinal applies here; `itemLine` stays (a Geral photo has none).
- `packages/domain/src/parse/pt-br-number.ts` (178-207) -- number N/A; `NOT_APPLICABLE_TEXT` used by `storedValueText`.
- `packages/domain/src/photos/caption.ts` -- `contextCaption` (317-324); captions stay as stored.
- `apps/api/src/jobs/generate/page-layout.test-support.ts` (line 54 pinned weights), `page-placement.integration.test.ts` (LibreOffice proof, Story 20.5), `docx.test.ts` (golden, `GOLDEN_UPDATE=1`), `docx-qgbt.test.ts` (199 asserts "CRITÉRIO:"), `docx-cta.test.ts` (323-391 ACEITÁVEL rows), `golden/porto-seguro-skeleton.json`.
- `packages/domain/src/print/section-9.test.ts` (236-242 item lines, 291-292 CRITÉRIO, 420 and 629-634 attribution, 1027), `measurement-print.test.ts` (ACEITÁVEL rows), `section-7.test.ts`, `apps/api/src/sync/attribution.integration.test.ts` (196 asserts the printed attribution: flip to absence, keep the screen/route part).
- `apps/web/src/surfaces/ficha/photo-openers.tsx` -- `PlateCaptureTile` (68-160), `useDirectPicker` (174-196, `multiple`); `camera-single-shot.tsx` `useCameraPicker` (109-170).
- `apps/web/src/surfaces/ficha/nameplate-section.tsx` -- `plateTarget` (211-216), `cancelOlderPlates`/`retakeTarget` (224-240), AI gate `aiFeatures`.
- `apps/web/src/surfaces/ficha/read-display.tsx` -- display openers (303, 614, 633 `read-display-btn`, 739); `apps/web/src/surfaces/relatorio/panel-capture.tsx` -- panel capture.
- `apps/web/src/files/photo-import.ts` -- `importPhotoFiles`, `ImportTarget` (53-61, no `fileId` yet), `PHOTO_ACCEPT`; `apps/web/src/surfaces/photos/capture-sheet.tsx` `usePhotoImport` (71-105).
- e2e: `document-pages.spec.ts` (244-246 item line), `cta.spec.ts` (556), plate/display specs (`plate-reading.spec.ts`, `read-display.spec.ts`, `display-shots.spec.ts`, `camera-app.durability.spec.ts`), caption readers (`photo-numbers`, `section-7-by-hand`, `photo-order`, `photos`, `points`, `review-field-defects*`, `verificacoes-local`).

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/print/section-9.ts` -- 22.2: remove `attribution` from `PrintSheet` (and `attributionOf`), the CRITÉRIO paragraph, the measurement ACEITÁVEL row, the criteria line and `itemLine` from section 9 photos; ACEITÁVEL header cell stays. N/A: a text value of a nameplate, cabine or configuration field whose trimmed value matches /^(n\.?a\.?|n\/a)$/i prints `NOT_APPLICABLE_TEXT` via a new exported kernel `printNotApplicable(text)` (also used by the number path). Unit once: a seeded table's capture/input cell drops its unit when its column's printed header carries that one unit (`valoresHeader` single-unit case, grouped headers included).
- `packages/domain/src/print/section-9.ts` -- 22.3 keep: add `PrintTable.keepRows?: true` (every row but the last keeps with the next, no header repeat) and `keepWithNext?: true` on each `SheetPart` variant. Set `keepRows` on every table of a sheet from the first part to CONCLUSÃO and on a local's tables (`keepWhole` tables unchanged). Set `keepWithNext` on: the cabine SE and environment tables; a test's instrument header and every test table but its last; the part right before CONCLUSÃO; the plate before a Não ensaiado reason band; a local's SE and environment tables. Photo blocks carry neither. Rationale: every sheet already starts a page (Story 20.6), so these joints keep a fitting sheet whole and let a taller one break only between parts, with CONCLUSÃO kept with the part before it (narrowing of the DoR's "every row … keep-with-next" chain, which would break mid-table on a two-page sheet).
- `packages/domain/src/print/section-9.ts` -- 22.3 widths: a kernel `widenToFit(base, rows, valueColumns)` keeps the base weights and widens only a value column whose longest word (`emWidth` + `CELL_ALLOWANCE_EM`) exceeds its share of `CONTENT_WIDTH_EM`, taking the width from the other value columns' slack (never below their own longest word); label columns unchanged. Apply to `nameplatePart` and `pairsTable` (value columns 1, 3, 5) and to `cabineParts` and `instrumentPart` (every column is a value column there; header labels count as words).
- `packages/domain/src/print/caption-ordinal.ts` (new, exported from the index) -- `withCaptionOrdinals` over a block's printed captions: a caption equal (trimmed, final "." ignored) to an earlier one in the same block gets " (n)" before the closing period ("… TR-1 (2)."); uncaptioned photos and display stamps of no caption are untouched. Apply in section 9 per photo block (`sheetPhotos` whole, a local's photos, a Não ensaiado block) and in `section7Photos` over the section; numbers unchanged. Kernel tests.
- `apps/api/src/jobs/generate/sections/section-9.ts` -- draw `keepRows` (keepNext on every row but the last), `keepWithNext` (keepNext on the part's last row or paragraph and on the gap after it); drop the attribution paragraph and the item line paragraph. Update the header comment.
- `apps/api/src/jobs/generate/*.test.ts`, `page-layout.test-support.ts`, `page-placement.integration.test.ts` -- XML tests for the flags on every row, gap and paragraph of a sheet; LibreOffice placement for a seccionadora whose CONCLUSÃO used to fall alone and a two-page transformer (break between parts, CONCLUSÃO with the part before); update docx-qgbt/docx-cta/docx assertions; regenerate the golden with `GOLDEN_UPDATE=1` and check the diff holds only removed item lines, bare cells under unit headers and ordinal suffixes.
- `packages/domain/src/print/*.test.ts`, `apps/api/src/sync/attribution.integration.test.ts` -- update to the four absences; a width test that measures every seeded nameplate/config option (every seed version) and every typed value of the Porto Seguro fixture against its printed column after `widenToFit` (no word wider than its column, when the row's value columns have the slack).
- `apps/web/src/files/photo-import.ts` -- `ImportTarget.fileId?` (one file only) so the retake can mint the id up front.
- `apps/web/src/surfaces/ficha/attach-file.tsx` (new) -- `AttachFileAction({ relatorioId, target, onSaved })`: a single-file hidden input (`accept={PHOTO_ACCEPT}`, no `multiple`, opened inside the press) and an `AriaButton` "Anexar arquivo" with a 44 px target; saves through `usePhotoImport` with the `CaptureTarget` mapped to `ImportTarget` (reading, caption, fileId); calls `onSaved` after a save (the retake's `cancelOlderPlates`).
- `apps/web/src/surfaces/ficha/photo-openers.tsx`, `nameplate-section.tsx`, `read-display.tsx`, `apps/web/src/surfaces/relatorio/panel-capture.tsx` -- render the action beside every opener that asks a reading (plate tile and retake, each Ler visor opener, panel capture), hidden with AI off where the reading opener is.
- `apps/web/src/copy/pt-br.ts` -- `attachFile: 'Anexar arquivo' // authored:`.
- `e2e/attach-file.spec.ts` (new, `@p0`) -- at 390, 768 and 1280 px attach a plate JPEG (then accept the suggestion and assert the nameplate cell's committed value in the store) and a display JPEG on an insulation cell (assert the photo row's `reading_kind`/target and the accepted cell); a HEIC case and a large-file case asserting the stored original's long edge ≤ the encode cap; a retake case asserting the older plate's reading cancelled. Use the fake provider fixtures the plate/display specs use.
- `e2e/document-pages.spec.ts` (or the spec reading section 9 text) -- assert on the DOCX text the four absences, "VALORES (GΩ)" with bare cells, and a repeated caption's " (2)"; update `cta.spec.ts` (no ACEITÁVEL row) and every caption-asserting spec the ordinals change.
- `_bmad-output/planning-artifacts/source-deltas.md` -- one row dated 2026-11-06 amending FR-68's attribution and criterion-and-source, Story 7.1 AC2, UX-DR47's "printed under the Conclusão row", `EXPERIENCE.md` line 172 and Story 20.6's item line in print (strike-through rule).
- `docs/kbs/log.md` and the matching concept file -- one entry for the batch. `_bmad-output/implementation-artifacts/deferred-work.md` -- e22p heading for any narrowing.

**Acceptance Criteria:**
- Given a concluded transformador de força sheet with an NC photo, a criteria line and an attribution, when the relatório generates, then section 9 prints none of the attribution, "CRITÉRIO:" line, criteria line and item line, the screen still shows all four, and the ACEITÁVEL header cell still prints the criterion.
- Given a CTA sheet with E1 to E6, when it prints, then no "ACEITÁVEL: … · fonte" row prints.
- Given a seccionadora sheet whose CONCLUSÃO would fall alone on the next page, when the PDF renders, then CONCLUSÃO is on the same page as the part before it and no table splits; the photo block may follow on the next page.
- Given a transformador de força sheet taller than one page, when it renders, then the break falls between two parts, never inside a table.
- Given "TRANSFORMADOR TRIFÁSICO" in DADOS DO EQUIPAMENTO, when it prints, then no word breaks inside itself, label columns keep their weights; same for CONFIGURAÇÃO, the cabine tables and the instrument header.
- Given the Porto Seguro fixture, when the golden compares, then the only differences are removed item lines, bare cells under a unit header and ordinal suffixes, regenerated and named in the PR.
- Given 390, 768 and 1280 px, when each reading opener renders, then "Anexar arquivo" is reachable with a 44 px target and an accessible name.

## Spec Change Log

## Review Triage Log

### 2026-11-06 — Review pass
- layers: Edge Case Hunter and Verification Gap Reviewer; Blind Hunter and Intent Alignment skipped (token economy; the integrated epic review covers them).
- verdicts: 8 findings — high 0, medium 4, low 4, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` VG: the AI-off empty plate never asserted "Anexar arquivo" absent — assertion added to the AI-off case of `plate-photo.test.tsx`.
  - `[medium]` `[patch]` VG: the thermo-hygrometer and empty-display-retake attach sites were never pressed — `22.1-E2E-007` and `22.1-E2E-008` added, asserting `reading_kind` and `reading_target` of the create.
  - `[medium]` `[defer]` VG: the LibreOffice placement proof is skipped by test:api in the tools container — deferred (Story 20.5 pattern); run in the api container and recorded in the PR.
  - `[low]` `[reject]` EC: a second press during a slow HEIC import can queue two plate photos — needs a deliberate second pick within the import's seconds; the fix adds in-flight state.
  - `[medium]` `[patch]` EC: a cancelled or skipped palette pick left the focus on body and a phantom shot — `useAttachFile` gains `onAbandon` (native `cancel`, empty or skipped pick); `panel-capture.tsx` clears the shot and restores the focus to `focusAfter(target)`; unit tests in `attach-file.test.tsx`.
  - `[low]` `[reject]` EC: the opener unmounting while the picker is open drops the file — needs a sync arrival during the open picker; the fix moves the input's host.
  - `[low]` `[reject]` EC: a caption ending in "!" or "?" prints "X! (2)." and a stored "X (2)" can collide — the first is the spec's chosen form; the collision needs a typed caption equal to a printed ordinal.
  - `[low]` `[patch]` EC: CLASSE DE TENSÃO typed "na" printed as typed — `storedValueText` applies `printNotApplicable` before the voltage-class branch; kernel test added.

## Verification

**Environment (this host):** the CLI is `podman compose` (never docker), run from the worktree root; the stack `fasor-e22p` is up (postgres, minio, api). Never build images. Never run pnpm, node or Playwright on the host or outside the tools container; never run Playwright at all (the orchestrator runs the e2e specs under the host lock) — write and typecheck the specs only. Restart the api (`podman compose restart api`) after changes under `packages/domain` or `apps/api` before api tests. Redirect long output to `.scratch-e22p/*.log` and read the tail.

**Commands (inside the tools container, `podman compose --profile tools run --rm --user root tools …`):**
- `pnpm lint` and `pnpm static` -- clean.
- `pnpm exec vitest run --project @app/domain packages/domain/src/print` and `pnpm exec vitest run --project @app/web <touched files>` -- green while iterating.
- `pnpm exec vitest run apps/api/src/jobs/generate` (api project, compose Postgres up; restart api first) -- green, golden diff reviewed.
- Touched e2e (under the host lock, by the orchestrator): `pnpm exec tsx scripts/e2e.ts e2e/attach-file.spec.ts e2e/document-pages.spec.ts … --project desktop-chrome --project durability-desktop-chrome`.

## Auto Run Result

- Summary: 22.2 drops the attribution, the CRITÉRIO line, the measurement ACEITÁVEL row, the criteria line and the section 9 item line from print, prints one "N/A" for typed N/A spellings (`printNotApplicable`) and the unit once under a single-unit VALORES header. 22.3 adds `keepRows`/`keepWithNext` flags (`keptTogether`), minimal value-column widening (`widenToFit`) and caption ordinals (`withCaptionOrdinals`, section 9 photo blocks and section 7). 22.1 adds "Anexar arquivo" (`attach-file.tsx`) beside the plate tile and retake, every "Ler visor" opener and the palette panel capture, through the import path with the opener's `CaptureTarget`.
- Golden: `porto-seguro-skeleton.json` 431 lines changed, all explained by script: 397 bare cells under a unit header, 34 section 7 ordinal suffixes; nothing else.
- Review: 8 findings; 4 patched (medium 3, low 1), 1 deferred, 3 low rejected (see the triage log).
- Follow-up review recommended: false (no high patched; the medium patches are test additions and one focus return covered by unit tests).
- Verification: lint and static clean; domain print 256 of 256; api generate/attribution/audit green; LibreOffice placement 6 of 6 in the api container; touched specs and the story gate recorded in the PR body.
- Residual risks: see `deferred-work.md` § "Deferred from: Epic 22 batch e22p".
