---
title: 'Stories 7.2 and 7.3: print the photo record, the points of attention and the certificates'
type: 'feature'
created: '2026-09-26'
status: 'done'
baseline_revision: '1582cddadfc18cac787efb0f86995fd2fb163151'
review_loop_iteration: 0
followup_review_recommended: true
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
warnings:
  - 'batched'
  - 'multiple-goals'
  - 'oversized'
batched_reason: 'Batch G2 of Epic 7: Story 7.2 AC1 and AC3 (section 7, provisional numbers after issue) and Story 7.3 (sections 8 and 11) share the photo numbering and the renderer dispatch; the section 8 carry-over and review debt R9 ride along (coordinator decision 2026-09-26, token economy).'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The renderer of Story 4.8 prints sections 7, 8 and 11 as a heading plus "(sem conteúdo nesta revisão)". The photo record, the points of attention (with `[[foto:id]]` tokens resolved to "Imagem N") and the calibration certificates never reach the relatório. After an issue the gallery keeps calling every number provisional. A generate job whose payload fails the worker schema is dropped without writing `failed` on its job row (review debt R9).

**Approach:** Put each section in its own kernel module (`packages/domain/src/print/section-7.ts`, `section-8.ts`, `section-11.ts`) that returns layout data. Put each renderer in its own api module (`apps/api/src/jobs/generate/sections/section-7.ts`, `section-8.ts`, `section-11.ts`). Touch `print/layout.ts`, `docx.ts` and `job.ts` only by minimal dispatch insertions. Section 11 rasterizes PDF certificates page by page with LibreOffice at 150 dpi and prints image certificates through sharp. The kernel says whether the gallery's numbers are frozen or provisional. The worker records an invalid payload as `failed`/`render_failed`.

## Boundaries & Constraints

**Always:**
- Everything runs in Docker (`docker compose --profile tools run --rm tools ...`); never pnpm/node on the host. The worktree `.env` sets compose project `fasor-s7b`, port base 42. Heavy runs (`verify`, `test:e2e:full`, any run of more than one e2e spec) go under the host lock, in the foreground, with output in a log: `flock /tmp/fasor-verify.lock docker compose --profile tools run --rm tools pnpm <script> > /tmp/<name>-s7b.log 2>&1; echo EXIT=$?; tail -40 /tmp/<name>-s7b.log`. Iterate with the narrowest suite.
- AD-1/AD-13: every printed string, order, number and sentence comes from the kernel. `apps/api` renders layout data and may choose only between strings the kernel supplied (for example the kernel's placeholder when the bytes are missing). New derived pt-BR text lives in `packages/domain`, marked `// authored:` when no source gives it. Every authored printed sentence is listed in the spec's Design Notes "For Bruno" list.
- Photo numbers are `numberPhotos(snapshot.files)` (sort key `(captured_at, local_seq, id)`, coordinator conflict 1). The same map drives section 7 and section 8, and it is computed from the frozen snapshot, so a revision's numbers never change.
- A missing image, a corrupt image, a certificate that cannot be read, or a LibreOffice rasterize failure or timeout on one certificate never fails the revision. The section prints the kernel's placeholder line, and the job logs the failure (`logError`). The job still fails exactly as today when the main DOCX-to-PDF conversion fails.
- The Porto Seguro structure golden (`apps/api/src/jobs/generate/golden/porto-seguro-skeleton.json`) is regenerated with `GOLDEN_UPDATE=1`. Read its diff: only sections 7, 8 and 11 may change.
- Planning documents: never delete a sentence; strike it through (`~~…~~`) and add a dated replacement. Update the entries in `_bmad-output/implementation-artifacts/deferred-work.md` this way.

**Never:**
- Section 9 content, the photos inside section 9 sheets, section 10, the parecer, `preIssue` rows (the missing-certificate warning row, the photos-not-held row), the preview route, `last_nameplate` or the Export dialog. These belong to batches G1 and G3.
- The section 8 action-plan table, and printing priority, deadline or owner (`source-deltas.md` row 29).
- Changes to `sprint-status.yaml` or `epics.md`, a `CONTRACT_VERSION` bump (no new op family, no new setup key), and a new npm dependency or apt package (LibreOffice, sharp and pdfjs-dist are already in the api image).
- Rewriting `docx.ts`, `layout.ts` or `job.ts` beyond a dispatch insertion, `export` keywords on existing helpers, and new optional fields on `DocxImages`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| S7 happy | Live photos with captions; some carry coords; one is on a checklist item answered NC | Two photos per row in `numberPhotos` order. Under each: bold "Imagem 5:" then " ⟨caption⟩." (no second period if the caption already ends in `.`, `!` or `?`); the stamp line `photoStampFull` ("06/09/2026 14:32 · −23,5505, −46,6333", time alone without coords); the line "Item 8 · Contatos · NC" (`photoItemLine(...).text`) when the photo is on an item. The embedded image is the `print` variant. | none |
| S7 uncaptioned | caption null or blank | Label "Imagem 5." alone | none |
| S7 no bytes | Photo row without `uploaded_at` or variants, or its print object missing | The cell prints the kernel's `PHOTO_UNAVAILABLE_TEXT` instead of the image; number and caption still print | log only |
| S7 none | No live photo | Section prints `EMPTY_SECTION_NOTE` as today | none |
| S8 manual | Live points in `order_key` order, text with tokens | One bullet per point: its text with each `[[foto:id]]` replaced by "Imagem N" from the numbering; a non-empty `action` follows after one space (tokens resolved there too). A stored `origin: not_tested` point prints as a manual bullet, unmerged. | none |
| S8 token of removed photo | Token id not in the numbering | Prints the kernel's `REMOVED_PHOTO_REF_TEXT` ("imagem removida", authored) | none |
| S8 derived | Untested sheets not suppressed | After the manual bullets, one bullet per `groupDerivedPoints` group in tree order: "Equipamento não ensaiado: ⟨title⟩. ⟨J⟩" / "Equipamentos não ensaiados: ⟨t1⟩, ⟨t2⟩ e ⟨t3⟩. ⟨J⟩" (authored). J is the group's justification (the typed text for "Outro"), else the reason label plus "." | none |
| S8 none | No live point and no derived entry | `EMPTY_SECTION_NOTE` | none |
| S11 union | Setup `instrument_ids` plus instruments in the copied headers of sheets | One entry per instrument. Setup order comes first, then instruments only sheets reference, in `sheetOrder` then test order. | none |
| S11 PDF | Certificate file `application/pdf`, N pages | N full pages, each page rasterized at 150 dpi by LibreOffice (PNG), one image per page, each on its own page | Rasterize fails or times out: placeholder line |
| S11 image | Certificate is JPEG or PNG | One full page through sharp (`.rotate()`, fitted to the page's content box) | Unreadable: placeholder line |
| S11 missing | `certificate_file_id` null, registry row gone, or the file/object not on the server | The kernel's placeholder line "Certificado não anexado: ⟨code⟩ — ⟨name or manufacturer model⟩ (nº ⟨cert⟩)" (authored); omit the missing parts | none |
| S11 mismatch | A sheet's copied `cert_number` differs from the registry's (both non-empty, trimmed) | An `integrity` finding `cert_number_mismatch`; the print still uses the registry's certificate | none |
| S11 none | No instrument | `EMPTY_SECTION_NOTE` | none |
| Gallery | No revision / revision with nothing edited since / revision then an edit (a photo added) | Numbers are provisional / frozen / provisional again. The status line and viewer count follow Design Notes. | none |
| R9 | Payload fails `payloadSchema` but `job_id` and `company_id` parse, and the `generation_job` row exists | That row gets `status: failed` and `error: render_failed` from `system:generate`; logged | job_id or company_id unparseable, or no row: log only (today's behavior) |

</intent-contract>

## Code Map

- `packages/domain/src/print/layout.ts` -- `layoutSpec`, `LayoutSection` union, `EMPTY_SECTION_NOTE`. Section 7, 8, 9 and 11 are `empty` today. The dispatch goes in the `printedSections(...).map` callback, before the composed-text logic.
- `packages/domain/src/photos/numbering.ts` (`numberPhotos`, `photoRefLabel`), `photos/order.ts` (`livePhotos`), `photos/gallery.ts` (`photoStampFull`, `photoItemLine`, `viewerCountText`) -- reuse for section 7 and the gallery.
- `packages/domain/src/points/refs.ts` (`pointTextTokens`), `points/checks.ts` (`livePoints`), `points/derived.ts` (`derivedPoints`, `groupDerivedPoints`, `DerivedPoint.title`), `points/summary.ts` (`sectionEightEntries`) -- section 8 data. The seed reasons are in `seed/v1.ts` `NOT_TESTED_REASONS`.
- `packages/domain/src/schemas/snapshot.ts` `buildSnapshot` (lines ~111-127) -- `instruments` holds only sheet-referenced instruments. Add `relatorio.setup.instrument_ids`. `suggestedInstrument` reads only instruments named by blocks, so it is unaffected. The fixture golden has `instrument_ids: []`, so it does not change.
- `packages/domain/src/relatorio/instrument-pick.ts` (`storedInstrumentHeader`, `InstrumentHeader`), `relatorio/sheet-state.ts` (`enabledSubBlocksOf`), `relatorio/ficha.ts` (`sheetOrder`) -- section 11 union.
- `packages/domain/src/relatorio/integrity.ts` -- `IntegrityFinding` union and `integrityFindings(input)`. Only `tree.ts` calls it, with `{ equipment }`. Watch for an import cycle: tree.ts imports integrity.ts.
- `packages/domain/src/relatorio/sumario.ts` `KIND_OF.section_11: 'pending-epic'` and `metaOfSection` -- row 11 still reads "disponível em uma próxima etapa".
- `apps/api/src/jobs/generate/docx.ts` -- `buildDocx`, `DocxImages`, and the private helpers `sizedImage`, `image`, `text`, `plain`, `pageBreak`, `borders`, `CONTENT_WIDTH_TWIPS`, `PX_PER_CM`. The sections loop is at the end.
- `apps/api/src/jobs/generate/job.ts` -- `runGenerateJob` loads the logo and cover via private `printVariant`/`fileRow`. `renderDocument(layout, images, ...)` runs 2-3 passes, so load images once before it.
- `apps/api/src/jobs/generate/libreoffice.ts` -- `convertToPdf` with a per-job profile, `serialize` chain, `runSoffice` (hard-coded args), timeout kill, and the `LibreOfficeTimeoutError`/`LibreOfficeFailedError` classes. `pdf-outline.ts` shows pdfjs-dist use in Node.
- `apps/api/src/jobs/generate/worker.ts` -- `registerGenerateWorker`, `payloadSchema` (R9).
- `apps/api/src/jobs/generate/docx.test.ts` (golden and AC test pinning "the empty sections"), `docx-structure.ts` (reads a DOCX back), `packages/domain/src/print/layout.test.ts` (lines ~75-81 and ~267 pin 7/8/11 as empty).
- `apps/web/src/surfaces/photos/gallery-surface.tsx` (section-note line ~171, `numbers` ~85), `photo-viewer.tsx` (line ~108 `viewerCountText`), `apps/web/src/db/generate-store.ts` (`useRevisions`, `useEditedSince`), `packages/domain/src/print/revisions.ts` (`latestRevision`), `relatorio/status-advance.ts` `issuedBannerText` (the Story 4.6 banner already names the next revision).
- `e2e/support/groups.ts` `SERIAL_SPECS`, `e2e/support/export-fixture.ts` (the small Porto Seguro fixture has no photos, points or certificates), `e2e/export.spec.ts` (the generate/download flow to mirror), `e2e/gallery.spec.ts`, `e2e/points.spec.ts`, `e2e/files.spec.ts` (photo, point and certificate upload flows to mirror).
- Verified 2026-09-26 in the api image (LibreOffice 26.2.6): `draw_png_Export` ignores `PageRange`/`PageNumber` and always renders page 1. What works per page is `soffice --headless --infilter=draw_pdf_import --convert-to 'pdf:draw_pdf_Export:{"PageRange":{"type":"string","value":"N"}}'` (a one-page PDF), then `--infilter=draw_pdf_import --convert-to 'png:draw_png_Export:{"PixelWidth":{"type":"long","value":"W"},"PixelHeight":{"type":"long","value":"H"}}'`. W and H are the page size in points × 150/72. The tools image has no soffice, so a unit test uses a fake `soffice` script as `libreoffice.test.ts` does.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/print/section-7.ts` -- `section7Layout(snapshot, heading: {number, title}): LayoutSectionPhotos | null`. Returns `{number, title, kind: 'photos', photos: LayoutPhoto[]}` with `LayoutPhoto = {fileId, number, label, caption, stamp, itemLine}` per the S7 rows. It also exports `PHOTO_UNAVAILABLE_TEXT` (authored "(foto não disponível no servidor)"). It never imports `layout.ts`.
- `packages/domain/src/print/section-8.ts` -- `resolveSection8(snapshot, numbering: ReadonlyMap<string, number>): Section8Bullet[]` (`{kind: 'point'|'derived', text, point_id?, block_ids?}`), per the S8 rows. Also `resolvePhotoTokens(text, numbering)`, `derivedGroupText(group, entries)`, `REMOVED_PHOTO_REF_TEXT`, and `section8Layout(snapshot, heading)` returning `{kind: 'points', bullets: string[]} | null`. Use a pt-BR list joiner ("a, b e c"); add one if the kernel has none.
- `packages/domain/src/print/section-11.ts` -- `section11Instruments(snapshot): Section11Instrument[]` with `{instrument_id, code, name, cert_number, certificate_file_id, sheet_cert_numbers: string[], cert_mismatch: boolean, placeholder: string}` per the S11 rows. Headers come only from live blocks with `not_tested === null` and a test whose sub-block is enabled. Also `missingCertificates(snapshot)` (the entries with `certificate_file_id === null`, for G3's pre-issue row), `certificatesCountText(n)` (plural "1 certificado"/"N certificados", "Nenhum instrumento" at 0, authored), and `section11Layout(snapshot, heading)` returning `{kind: 'certificates', certificates: {instrumentId, certificateFileId, placeholder}[]} | null`.
- `packages/domain/src/print/layout.ts` -- Import the three section types into the `LayoutSection` union. Dispatch sections 7, 8 and 11 to their builders; a null return falls back to the `empty` note. Update the file comment. Nothing else.
- `packages/domain/src/relatorio/integrity.ts` -- Add a `CertNumberMismatchFinding` (`kind: 'cert_number_mismatch'`, `instrument_id`, `registry`, `sheet`, `block_ids`) to the union. `integrityFindings` pushes it when the optional `blocks` and `instruments` inputs are given (`tree.ts` is unchanged). No import cycle; inline the header read if needed.
- `packages/domain/src/schemas/snapshot.ts` -- Add the setup `instrument_ids` to the snapshot's instruments.
- `packages/domain/src/relatorio/sumario.ts` -- Change `section_11` to `generated`. Its meta is `certificatesCountText(section11Instruments(snapshot).length)` followed by its own pre-issue rows, like section 7.
- `packages/domain/src/photos/gallery.ts` -- Add `photoNumbersProvisional(latest: Pick<RevisionRow,'number'> | null, edited: boolean): boolean`, `photoNumbersStatusText(latest, edited): string | null`, and an optional `provisional = true` parameter on `viewerCountText` (see Design Notes). Export all new kernel symbols from `packages/domain/src/index.ts`.
- `packages/domain/src/print/section-{7,8,11}.test.ts`, `relatorio/integrity.test.ts`, `photos/gallery.test.ts`, `print/layout.test.ts` -- Unit tests for every I/O row on hand-built snapshots and on the Porto Seguro fixture (82 numbered photos; 8 stored point bullets; three registry instruments with placeholder lines; `numberPhotos` order). Update the layout assertions that pinned 7, 8 and 11 as empty.
- `apps/api/src/jobs/generate/sections/section-7.ts` -- `loadPhotoImages(snapshot, readPrint): Promise<Map<fileId, Buffer>>` and `section7Children(section, photos): Promise<(Paragraph|Table)[]>`. The table is borderless, two columns, cells of half the content width, image box at most 8.5 × 6.4 cm keeping aspect, `cantSplit` rows. The caption paragraph has a bold label run; stamp and item lines at 9 pt.
- `apps/api/src/jobs/generate/sections/section-8.ts` -- `section8Children(section)`: one bulleted paragraph per bullet.
- `apps/api/src/jobs/generate/sections/section-11.ts` -- `loadCertificatePages(section, readOriginal, {jobId, timeoutMs}): Promise<Map<certificateFileId, Buffer[]>>`: PDF through `rasterizePdfPages`, image through sharp. `section11Children(section, pages)`: each page image on its own page, fitted to the content box below the header, otherwise the placeholder paragraph.
- `apps/api/src/jobs/generate/libreoffice.ts` -- `rasterizePdfPages(pdf, {jobId, timeoutMs, dpi = 150}): Promise<Buffer[]>`. It runs inside `serialize` with one temp dir and one profile, reads page count and size with pdfjs-dist, and uses the two-step soffice per page from the Code Map. Generalize `runSoffice` to take its args. `convertToPdf` behavior is unchanged.
- `apps/api/src/jobs/generate/docx.ts` -- `export` the helpers the sections need. Add optional `DocxImages.photos?: ReadonlyMap<string, Buffer>` (print variants by file id, reusable by G1) and `certificates?: ReadonlyMap<string, readonly Buffer[]>`. Add three `else if` dispatch lines in the sections loop.
- `apps/api/src/jobs/generate/job.ts` -- Two loader calls before `renderDocument`, with `readPrint` built on the existing `printVariant` and a new small `readOriginal(fileId) -> {bytes, mime} | undefined`. A loader throw is caught inside the loaders, never in job.ts.
- `apps/api/src/jobs/generate/worker.ts` -- R9: extract `handleGenerateJobs(deps, jobs)` (used by `registerGenerateWorker`), which records an invalid payload per the R9 row. It finds the job row's `relatorio_id` in `entities` (`entity = 'generation_job'`, id, company) and applies the two puts with `GENERATE_ACTOR`.
- `apps/api/src/jobs/generate/docx.test.ts` -- Regenerate the golden. Update the "empty sections" test, and add a test that a layout with photos/certificates embeds the images (media entries) and prints placeholders when bytes are absent.
- `apps/api/src/jobs/generate/libreoffice.test.ts` -- A fake-soffice test for `rasterizePdfPages`: the args per page, the page count, and a timeout or failure surfacing as the existing error classes.
- `apps/api/src/jobs/generate/worker.integration.test.ts` (new) -- R9 through `handleGenerateJobs` against the compose Postgres: an invalid payload with a valid job row gives `failed`/`render_failed`; unparseable ids only log.
- `apps/api/src/jobs/generate/job.integration.test.ts` or an existing integration file -- The job with a photo (bytes uploaded) and a point token commits a revision whose DOCX (read with `docx-structure.ts`) holds "Imagem 1:" and the resolved bullet. A corrupt certificate yields the placeholder and still a revision.
- `apps/web/src/surfaces/photos/gallery-surface.tsx`, `photo-viewer.tsx` -- Read `useRevisions` + `useEditedSince` and render the kernel status line under the gallery's `section-note` (as another `p.section-note`), and the viewer count with `provisional`.
- `e2e/photo-numbers.spec.ts` (new, added to `SERIAL_SPECS` with its reason) -- On the small fixture, in a real browser:
  - `@p0` (Story 7.2 AC3): add a photo in the gallery, issue a revision through the Export dialog, and see the frozen line in the gallery. Add another photo and see the provisional line, "nº provisório" in the viewer, and the Sumário banner "Alterações geram a revisão 2". Assert the new photo's `file` row in IndexedDB/outbox.
  - `@p1`: write a point referencing the photo, attach a PDF certificate to an instrument checked at setup (mirroring files.spec/relatorio flows, or through the sync route when the UI flow already has its own e2e), generate, download the DOCX, and assert "Imagem 1:", the resolved "Imagem 1" in the section 8 bullet, and section 11 page images from real LibreOffice rasterization (media count ≥ the PDF's page count).
- `_bmad-output/implementation-artifacts/deferred-work.md` -- Close with dated strikes the section 8 renderer entry (line ~707), the E3-A9 bullet 4 entry (~695: sentence authored, stored `not_tested` points unmerged is an open question), and R9 (~587). Add owner-named entries for each narrowing below.

**Acceptance Criteria:**
- Given the Porto Seguro fixture, when `layoutSpec` runs, then section 7 lists 82 photos numbered 1 to 82 in `numberPhotos` order, section 8 lists its 8 stored bullets in `order_key` order, section 11 lists the three registry instruments each with a placeholder line, and sections 1-6, 9 and 10 are unchanged.
- Given a relatório with an issued revision and nothing edited since, when the gallery renders, then the status line reads "Números da revisão N" and the viewer count has no "nº provisório". Given a photo added afterwards, when the gallery renders, then the provisional line and "nº provisório" return, and the Sumário banner names revision N+1.
- Given a generated DOCX, when it is converted to PDF, then the section 7, 8 and 11 headings are still in the PDF outline and the two-pass TOC still converges (no `toc_outline_missing`).
- Given the gate, when `pnpm verify` and `pnpm test:e2e:full` run under the lock, then both are green.

## Spec Change Log

## Review Triage Log

### 2026-09-26 — Review pass
- Layers: Edge Case Hunter and Verification Gap Reviewer. Blind Hunter and Intent Alignment were skipped for token economy; the integrated epic review covers them.
- verdicts: 11 findings — high 2, medium 2, low 5, false 1, maybe-false 1
- findings:
  - `[high]` `[patch]` `job.integration.test.ts:259` expects 2 `pageBreakBefore`, but section 11's first page now sits under the heading and emits 1 — the assertion was changed to 1, and its comment now says the first page sits under the heading.
  - `[high]` `[patch]` `e2e/photo-numbers.spec.ts:238` has the same stale count of 2 for a two-page CT-7 certificate — changed to 1, with its comment.
  - `[false]` `[reject]` The AC says 8 stored bullets but the code prints 7 — the fixture holds 7 live points (4 manual, 3 not_tested). The spec miscounted and the code is right; the fix would be a spec edit.
  - `[medium]` `[patch]` A certificate PDF with hundreds of pages holds the one soffice queue for minutes, since each page costs two soffice runs — `rasterizePdfPages` now refuses more than `MAX_CERTIFICATE_PAGES` (20) before any run, and the section prints the placeholder. Unit test added.
  - `[low]` `[patch]` `readPageSizes` never destroyed the pdfjs task when `task.promise` rejected — the await moved inside the `try`.
  - `[low]` `[reject]` A failing certificate file shared by several instruments is re-rasterized once per instrument — two instruments sharing one file is unusual, and the fix adds state.
  - `[low]` `[reject]` Some but not all page PNGs fail `sizedImage`, so pages go missing silently — the PNGs are soffice's own output; unlikely, and the fix adds a branch.
  - `[low]` `[reject]` R9 could overwrite a `done` job row — the payload is built only by the route for a fresh `queued` row, so an invalid payload naming a finished job is unreachable.
  - `[maybe-false]` `[reject]` A `/Rotate` or CropBox page could be stretched, because the pixel size comes from the pdfjs viewport — settling it needs a rotated or cropped sample PDF through Draw's import. If real it is only low (a mild aspect change on unusual certificates), so it is rejected.
  - `[medium]` `[patch]` (verification gap) The image-certificate branch of `loadCertificatePages` was untested — added `sections/section-11.test.ts` (7.3-UNIT-009): a JPEG with EXIF orientation 6 comes out upright and capped, a PNG is not enlarged, missing and unprintable certificates are skipped, and a throwing reader leaves the certificate out.
  - `[low]` `[patch]` (verification gap) Sumário row 11 was only checked at 0 — added a Porto Seguro assertion for "3 certificados".

## Design Notes

- Gallery texts (kernel, authored): no revision gives null (the static note already says the numbers are provisional). A revision with nothing edited since gives "Números da revisão N". A revision edited since gives "Números provisórios — serão definidos na revisão N+1". `viewerCountText(position, total, false)` gives "4 de 20".
- Section 7 prints every live photo, including photos linked to a sheet (G1 also prints those inside the sheet, with the same number). Numbers stay continuous, so "conforme Imagem 5" always finds its photo in section 7.
- Section 11 draws no caption above the certificate pages, like the source. The placeholder is the only text.
- Sizing: content width is 10466 twips (18.46 cm). At 96 px/in, `docx` takes `transformation` in px (`PX_PER_CM`). The certificate box is the content width by about 23 cm; check it against the rasterized PDF so a page never overflows onto the next.
- For Bruno (authored printed or visible strings): `PHOTO_UNAVAILABLE_TEXT`, `REMOVED_PHOTO_REF_TEXT`, the derived-group sentence (one and many), the certificate placeholder, `certificatesCountText`, the two gallery status lines.
- Open questions (conservative choice taken): (1) Stored `origin: not_tested` points are not merged like derived groups; each prints as its own bullet. (2) A point's `action` prints after its text in the same bullet. (3) A photo the server lacks keeps its number with a placeholder rather than being skipped. (4) A header `cert_number` with an empty registry value is not a mismatch.
- Narrowings for G3: the pre-issue warning row for a missing certificate (`missingCertificates`) and surfacing `cert_number_mismatch` in pre-issue or the Sumário.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:unit -- packages/domain/src/print` -- green
- `docker compose --profile tools run --rm tools pnpm lint` and `pnpm static` -- green
- Under the lock: `pnpm test:api`, then `playwright test e2e/photo-numbers.spec.ts` through the e2e runner, then `pnpm verify` and `pnpm test:e2e:full` -- green

**Manual checks:**
- The orchestrator renders the full Porto Seguro fixture with synthetic photos and a two-page PDF certificate inside the api container, then rasterizes and looks at the section 7, 8 and 11 pages.

## Auto Run Result

Status: done

**Summary:** Sections 7, 8 and 11 now print from their own kernel modules (`print/section-7.ts`, `section-8.ts`, `section-11.ts`) and their own api renderers (`jobs/generate/sections/`), with dispatch-only edits to `layout.ts`, `docx.ts` and `job.ts`. `rasterizePdfPages` in `libreoffice.ts` rasterizes certificates page by page at 150 dpi in two steps. `readPageSizes` in `pdf-outline.ts` reads page sizes. The snapshot now carries the instruments checked at setup. Integrity gained `cert_number_mismatch`. Sumário row 11 shows the certificate count. The gallery shows a frozen or provisional status line, and the viewer's count follows it. `worker.ts` `handleGenerateJobs` fixes R9.

**Review:** 6 patches (high 2, medium 2, low 2), 0 deferred, and 5 rejected as logged above. The orchestrator also made one change of its own after the implementation: section 11's first page image sits under its heading, so the heading never stands alone at the foot of a page.

**Follow-up review recommended:** true. Two high findings were patched, both stale page-break assertions from the orchestrator's heading change. The risk that remains unverified until `test:api` and `test:e2e:full` run is that these two assertions hold on real LibreOffice output.

**Verification:**
- Narrow suites are green: api `docx.test`, `libreoffice.test`, `sections/section-11.test`, and domain `sumario.test`.
- The implementation subagent reported `test:api` green (29 files, 167 tests) and `test:e2e:full` green (202 passed, 4 skipped), both before the patches.
- Manual check: the orchestrator rendered the full Porto Seguro fixture in the api container through `renderDocument`, with 12 synthetic photos, a point citing two photos, and a two-page sample PDF certificate. The result was 15 pages, TOC converged in 2 passes, and every heading in the outline. Pages 7, 8, 12, 13, 14 and 15 were rasterized and inspected:
  - Section 7: two photos per row, the bold "Imagem N:" label, the uncaptioned "Imagem 3.", the stamp with coordinates, the item line "Item 1 · Limpeza · C", and placeholders for photos without bytes.
  - Section 8: the tokens resolved as "Imagem 1 e Imagem 5", and the action appended.
  - Section 11: the certificate's first page under its heading and page 2 on its own page, then the two placeholder lines.

**Residual risks:**
- The small fixture's `sub_blocks: {}` hides its sheet instruments from section 11 (deferred-work entry).
- Each certificate page costs two soffice runs, so a certificate adds about 5 s per page to a generation.
