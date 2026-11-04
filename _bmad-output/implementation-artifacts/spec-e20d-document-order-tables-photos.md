---
title: 'Batch e20d: Stories 20.3, 20.5 and 20.6 (tests section before the points, tables kept whole, each equipment on its own page with its photos at its end)'
type: 'feature'
created: '2026-11-03'
status: 'in-progress'
baseline_revision: 'db38ffa0d8d9449944e9e1f4877a8526921e9cc0'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-20-context.md'
warnings: ['batched', 'multiple-goals']
batched_because: 'The three stories share apps/api/src/jobs/generate/docx.ts, sections/section-9.ts, packages/domain/src/print/* and the layout golden; each changes where something lands on the printed page, so they are proven together on one LibreOffice PDF.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** Field feedback of 2026-11-03 (epics.md Epic 20 preamble, Stories 20.3, 20.5, 20.6): on a new relatório the points of attention (section 8) print before the test reports (section 9); the nameplate and verification tables can break between two body rows across a page; a ficha prints its photos between its tables (plate photos under the nameplate, item/NC photos under the checklist), and nothing proves on the PDF that each equipment starts a page.

**Approach:** (20.3) `instantiateTemplate` gives new relatórios RELATÓRIOS DOS ENSAIOS at position 8 and PONTOS DE ATENÇÃO at 9; the renderer breaks the page before the points section. (20.5) The kernel marks the three tables to keep whole; the renderer keeps every row of them with the next and repeats their leading band/header rows, proven on the LibreOffice PDF, with the section 10 one-row `cantSplit` wrapper as fallback only if LibreOffice drops the keep. (20.6) `sheetOf` and the Não ensaiada branch print one photo part, last; every ficha and every local block starts a page; photo numbers unchanged. A per-page read in `e2e/support/pdf-text.ts` proves page placement.

## Boundaries & Constraints

**Always:**
- Read Stories 20.3, 20.5, 20.6 in `_bmad-output/planning-artifacts/epics.md` (lines 4924-4951 and 4980-5035) and their DoRs; their readings are decided as written (coordinator, epic-20-context "Open readings": the photo block sits after CONCLUSÃO; a local's block starts on a new page).
- The kernel (`packages/domain`) decides every order, part and which tables keep whole; `apps/api` only draws (AD-1, AD-13).
- Photo numbers (`documentPhotoOrder`, `numberPhotos`) are unchanged: `photo-order.test.ts` and `numbering.test.ts` stay green unchanged.
- An existing relatório (stored section blocks) and one with no section blocks (`seedSectionNumbers` fallback) keep their order; only the instantiation sort changes.
- Prove page placement on the PDF LibreOffice makes, not only on the XML (`docx.ts` lines 340-342 note LibreOffice drops a keep-with-next in one case).
- Document tests assert from their own section heading or sheet title, never from a position another section shifts (E7-A6).
- Red-first: write each kernel test failing before the change.
- Layout golden (`apps/api/src/jobs/generate/golden/porto-seguro-skeleton.json`): regenerate with `GOLDEN_UPDATE=1` only for 20.6 (photo parts move) and for 20.5 only if its table text changes; 20.3 does not touch it (the Porto Seguro fixture is hand-built, not instantiated: `packages/domain/fixtures/porto-seguro/op-log.ts` line 202). Record every golden diff and its cause in the spec's Design Notes for the PR body.
- `source-deltas.md` rows 140 and 141 (FR-17, FR-68) exist as "(planned, Story 20.x)": strike "planned" through and add "delivered 2026-11-03, batch e20d" beside it (never delete text). Add a `docs/kbs/log.md` line (and update a concept file only if one summarizes section 9 print order: grep `docs/kbs` for "plate photos" / "sheetOf").
- No emoji; code, comments and docs in English; printed strings pt-BR verbatim.

**Never:**
- No contract bump, no seed bump, no new op. Do not touch `packages/domain/src/contract/*`, `apps/api/src/sync/apply.ts`, op validation or `e2e/security-ops.spec.ts` (owned by batch e20s). If a change seems to need one, stop and report.
- Do not change measurement tables' keep behavior (out of 20.5), photo numbering, section 7, or the Não ensaiado entries at the end of the points section (FR-51).
- Do not touch `state/session.tsx`, `http/*`, `storage/variants.ts`, `infra/caddy/Caddyfile` (batch e20e).
- No Playwright MCP browser pass; no run of the full `@p0`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior |
|----------|--------------|---------------------------|
| New relatório | `instantiateTemplate` on any template | section blocks ordered 1..7, section_9, section_8, 10, 11 by `order_key`; Sumário rows "8 Relatórios dos ensaios", "9 Pontos de atenção"; Subir/Descer still move both |
| Existing relatório | stored blocks in 8-then-9 order, or no section blocks | order and numbers unchanged on regenerate |
| Points page break | any relatório | the points section's Heading 1 carries `pageBreakBefore`, wherever it prints (DoR: "starts on a new page, as the tests section does") |
| Ensaiada ficha | plate photo, NC item photo, two test photos | parts: [cabine parts v1-v3 first sheet], nameplate, config, checklist, tests, measurements, OBSERVAÇÕES, CONCLUSÃO, then ONE photos part: plate, items, other; each item photo carries its item line ("Item 8 · Contatos · NC", `photoItemLine(...).text`) |
| Não ensaiada ficha | plate photo | parts: nameplate, reason band, then one photos part (plate, items, other) |
| Local block (v4+) | site list, site photos | localParts unchanged order (SE, AMBIENTE, VERIFICAÇÕES DO LOCAL, site photos); the local's heading starts a new page unless it directly follows the section heading or a heading drawn alone |
| Page breaks in section 9 | subsections and sheets | a subsection heading/band breaks when the previous subsection drew anything beyond its heading (sheets or localParts); a sheet breaks when anything but its subsection heading precedes it (i > 0, or localParts drawn); the first after the section's Heading 1 takes no second break; a heading drawn alone keeps with what follows on the same page |
| Table at a page foot | DADOS DO EQUIPAMENTO, VERIFICAÇÕES GERAIS or VERIFICAÇÕES DO LOCAL starting in the last third of a page | in the PDF, its band and all its rows move to the next page together |
| Table taller than a page | checklist with long observations | splits only at a row boundary; the band and header rows repeat on the next page |
| Photos missing bytes | photo with no file | caption and item line kept, empty image cell (unchanged rule) |

</intent-contract>

## Code Map

- `packages/domain/src/relatorio/instantiate.ts` L221-240 -- section blocks sorted by `number` then `order_key` assigned by index. Change the sort key so section 9 precedes 8 (e.g. a `PRINT_POSITION` map or a comparator); keep the others in number order. Comment cites Story 20.3.
- `packages/domain/src/relatorio/sumario.ts` L197-202 `seedSectionNumbers` -- fallback order; must NOT change. `SUMARIO_TITLES` L45-46 give the row titles.
- `packages/domain/src/print/layout.ts` L178-189 `printedSections` (block order), L222 `number = index + 1` -- positions; no change expected.
- `apps/api/src/jobs/generate/docx.ts` L336-347 -- sections loop; `pageBreakBefore: section.kind === 'sheets'` gains `|| section.kind === 'points'`. Update the E7-A4 comment.
- `packages/domain/src/print/section-9.ts`:
  - L94-120 `PrintTable`, `PrintPhoto` -- add `keepWhole?: true` to `PrintTable` (set by the kernel on the three tables) and optional `itemLine?: string` to `PrintPhoto` (sheet checklist-item photos only). Exported types reach `apps/api` through `@app/domain`; no contract involvement (layout types are not the sync contract).
  - L225 `table()` helper; L347-366 `nameplatePart`; L368-391 `checklistPart`; L402-430 `siteChecklistPart` -- mark these three `keepWhole`.
  - L432-440 `localPartsOf` -- order already table then photos; keep.
  - L803-832 `printPhotos`, `sheetPhotos`, `photosPart` -- items group gets `itemLine` via `photoItemLine` (`photos/gallery.ts` L86-110, as `print/section-7.ts` L69 does).
  - L834-865 `sheetOf` -- reorder: one `photosPart([...plate, ...items, ...other])` after CONCLUSÃO; Não ensaiada (L846-850): nameplate, reason band, one photos part.
  - L867-925 `section9Layout` -- no structural change expected.
- `packages/domain/src/print/photo-order.ts` L8-45 -- comments only ("after DADOS DO EQUIPAMENTO" etc. become "in the ficha's one photo block, after CONCLUSÃO"); no code change.
- `apps/api/src/jobs/generate/sections/section-9.ts`:
  - L112-129 `drawRow` -- for a `keepWhole` table: keepNext on every cell paragraph of every row but the last; `tableHeader: true` on the leading band/header rows (contiguous `band`/`header` rows at the top); `cantSplit` stays on every row. Other tables unchanged.
  - L131-141 `drawTable` -- passes `keepWhole`; fallback (only if the PDF proof shows LibreOffice ignores the row keeps): wrap a `keepWhole` table estimated under one page in a one-row `cantSplit` table as `sections/section-10.ts` L18-40 does, leaving taller ones unwrapped so they split at rows with the header repeated. Record which path shipped and why in Design Notes.
  - L143-171 `drawPhotos` -- draw `itemLine` (small, centred) under the caption when present.
  - L175-200 `sheetChildren`/`partsChildren`; L217-236 `section9Children` -- page-break rule of the matrix: `sheetChildren(sheet, photos, i > 0 || localPartsDrawn)`; subsection `newPage = previous !== null && (previous.sheets.length > 0 || (previous.localParts?.length ?? 0) > 0)`. Update the module header comment (Stories 20.5, 20.6).
- `e2e/support/pdf-text.ts` -- add `pdfPageTexts(pdf): Promise<string[][]>` (items per page, 1-based page = index + 1) beside `pdfTextItems` (unchanged signature).
- Tests to update/add:
  - `packages/domain/src/relatorio/instantiate.test.ts` (or the file testing `instantiateTemplate`; grep) -- red-first new order; a pre-existing relatório's Sumário rows / `printedSections` keep 8-then-9 (`sumario` or `layout.test.ts`).
  - `packages/domain/src/print/section-9.test.ts` -- red-first part order for ensaiada, Não ensaiada, local block; `keepWhole` on exactly the three tables; `itemLine` on item photos.
  - `apps/api/src/jobs/generate/docx.test.ts` L148-156 (E7-A4: only section 9 breaks -> section 9 and the points heading), L197-202 (`1 + 10 + 83` break count -> recomputed with the points break and the new sheet/local rule, stated in a comment), TOC order on a new-order layout; new XML asserts: keepNext on every row but the last of the three tables, `tblHeader` on their band/header rows, none on measurement tables; a page break before each ficha and none doubled after the section heading. Sibling suites (`docx-site-checklist.test.ts`, `docx-seed-v7.test.ts`, `docx-qgbt.test.ts`, `docx-cta.test.ts`, `docx-section-10.test.ts`, `toc.test.ts`, `pdf-outline.test.ts`) may assert part order or break counts: run them and update with a reason.
  - New `apps/api/src/jobs/generate/page-placement.integration.test.ts` (test:api, real LibreOffice through `libreoffice.ts` `convertToPdf`, pdfjs as `rich-text.integration.test.ts` L14 reads it) -- synthetic `DocumentLayout`s that put each of the three tables in the last third of a page (filler paragraph parts before it) and assert in the PDF that the band and the last row share the next page; a checklist taller than a page splits at a row and its band/header text reappears at the top of the next page; each ficha's title is the first sheet content of its page; the points heading starts a page.
  - e2e (new `e2e/document-pages.spec.ts`, `@p0`, add to `SERIAL_SPECS` in `e2e/support/groups.ts` with a `why`) -- through the UI: create a relatório from a template (`e2e/support/relatorio-flow.ts` `createRelatorio`), check the Sumário rows 8/9 (and that the store's section blocks hold that order), fill a sheet whose nameplate long text pushes VERIFICAÇÕES GERAIS to the page foot (values within 200 characters, the planned 20.9 cap), add a plate photo, an NC item photo and test photos as the epic's photo specs do (`e2e/support/photos.ts`), generate, and assert on `pdfPageTexts`: headings 8 RELATÓRIOS DOS ENSAIOS then 9 PONTOS DE ATENÇÃO (body and ÍNDICE), points on a new page after the last ficha, checklist band and last item on one page, each ficha title starts its page, its photos after CONCLUSÃO in order plate, NC (with item line), tests; every "conforme Imagem NN" of the points still names the same photo. Reuse helpers; if a step is impractical through the UI, seed ops through `e2e/support/push-server-ops.ts` and say so in Design Notes.
  - Existing e2e updated to the new placement plus a per-page "ficha starts a page" check: `e2e/photo-numbers.spec.ts`, `e2e/display-shots.spec.ts` 16.3-E2E-001, `e2e/section-7-by-hand.spec.ts` 17.1-E2E-001, `e2e/sheet-photos.spec.ts` 11.11-E2E-001; grep `e2e/` for other document asserts of photo position or section 8/9 order (`relatorio.spec.ts`, `points.spec.ts`, `point-relink-print.spec.ts`, `export*.spec.ts`, `parecer-export.spec.ts`, `na-number-field.spec.ts`) and include any hit in the touched list.

## Tasks & Acceptance

**Execution:**
- [ ] Kernel 20.3: `relatorio/instantiate.ts` sort + red-first tests.
- [ ] Kernel 20.6/20.5: `print/section-9.ts` part order, `keepWhole`, `itemLine` + red-first `section-9.test.ts`; `photo-order.ts` comments.
- [ ] Renderer: `docx.ts` points break; `sections/section-9.ts` keeps, header repeat, item line, page-break rule; `docx.test.ts` and sibling suites.
- [ ] `page-placement.integration.test.ts` on the real PDF; decide keepNext vs wrapper from it.
- [ ] `e2e/support/pdf-text.ts` `pdfPageTexts`; new `e2e/document-pages.spec.ts` (serial group); update the four named specs and any grep hit.
- [ ] Golden: `GOLDEN_UPDATE=1` for the 20.6 move; diff summarized in Design Notes.
- [ ] `source-deltas.md` rows 140-141 dated delivered; `docs/kbs/log.md` line.

**Acceptance Criteria:**
- Given a relatório created from any template after the change, when its Sumário opens, then the rows read "8 Relatórios dos ensaios" then "9 Pontos de atenção", and Subir/Descer still move either one.
- Given that relatório generated, when the DOCX and the PDF are read, then the headings print "8 RELATÓRIOS DOS ENSAIOS" then "9 PONTOS DE ATENÇÃO / SUGESTÃO DE CORRETIVAS COMPLEMENTARES", the ÍNDICE lists them in that order with pages, the points section starts on a new page after the last ficha, and every "conforme Imagem NN" in the points resolves.
- Given a relatório created before the change (issued or not), when regenerated, then its section order and numbers are those it had.
- Given a ficha whose VERIFICAÇÕES GERAIS would start in the last third of a page, when generated, then in the PDF the band and every row of that table are on the next page; likewise DADOS DO EQUIPAMENTO and VERIFICAÇÕES DO LOCAL.
- Given a checklist longer than one page, when generated, then it splits only at a row boundary and its header row repeats on the next page.
- Given three equipment, one with a plate photo, an NC photo and two test photos, when generated, then each equipment starts its own page and that equipment's four photos print together after its CONCLUSÃO: plate, then the NC photo with its item reference, then the test photos, with no photo between its tables.
- Given a Não ensaiada equipment with a plate photo, when generated, then it starts a new page with nameplate and reason band, and the plate photo prints after the band.
- Given the same relatório before and after the change, when photo numbers are compared, then every photo keeps its number and every "conforme Imagem NN" resolves to the same photo.

## Spec Change Log

## Review Triage Log

## Design Notes

- Open reading kept as the DoR says: the points page break applies to every relatório, old order included (it changes pagination, not order or numbers, of a regenerated old relatório; an issued revision's stored files never change).
- Open reading: the item line is added to sheet checklist-item photos only; a local's site-item photos stay right under their table as today, so they get none.
- Risk to check first: the fixture already emits `pageBreakBefore` on every sheet after its subsection's first (`docx.test.ts` L202 `1 + 10 + 83`), yet the field report says fichas run on. Read `pdfPageTexts` of a generated fixture PDF before changing the rule; if LibreOffice drops `pageBreakBefore` on the shaded, bordered title paragraph after a table, put the break on a paragraph LibreOffice honors (e.g. an empty paragraph with `pageBreakBefore`, or a `PageBreak` run) and say so here.

## Verification

**Commands** (host: podman; tools with `--user root`; Playwright and any e2e only under `lockf -t 20000 /tmp/fasor-verify.lock`, started with nohup, logs in `.scratch-e20d/`):
- `podman compose --profile tools run --rm --user root tools pnpm test:unit -- <path>` -- targeted kernel/api unit tests green.
- `podman compose restart api` after changes under `packages/domain` or `apps/api`, before `test:api` and e2e.
- `podman compose --profile tools run --rm --user root tools pnpm test:api` -- green, including `page-placement.integration.test.ts`.
- `podman compose --profile tools run --rm --user root tools pnpm exec tsx scripts/e2e.ts e2e/document-pages.spec.ts <touched specs> --project desktop-chrome --project durability-desktop-chrome` (under the lock) -- green.
- `pnpm lint` and `pnpm static` in the tools container -- green.
