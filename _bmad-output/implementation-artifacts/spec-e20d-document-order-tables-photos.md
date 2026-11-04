---
title: 'Batch e20d: Stories 20.3, 20.5 and 20.6 (tests section before the points, tables kept whole, each equipment on its own page with its photos at its end)'
type: 'feature'
created: '2026-11-03'
status: 'done'
baseline_revision: 'db38ffa0d8d9449944e9e1f4877a8526921e9cc0'
review_loop_iteration: 0
followup_review_recommended: true
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
- [x] Kernel 20.3: `relatorio/instantiate.ts` sort + red-first tests.
- [x] Kernel 20.6/20.5: `print/section-9.ts` part order, `keepWhole`, `itemLine` + red-first `section-9.test.ts`; `photo-order.ts` comments.
- [x] Renderer: `docx.ts` points break; `sections/section-9.ts` keeps, header repeat, item line, page-break rule; `docx.test.ts` and sibling suites.
- [x] `page-placement.integration.test.ts` on the real PDF; decide keepNext vs wrapper from it.
- [x] `e2e/support/pdf-text.ts` `pdfPageTexts`; new `e2e/document-pages.spec.ts` (serial group); update the four named specs and any grep hit.
- [x] Golden: `GOLDEN_UPDATE=1` for the 20.6 move; diff summarized in Design Notes.
- [x] `source-deltas.md` rows 140-141 dated delivered; `docs/kbs/log.md` line.

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

### 2026-11-03 — Review pass

Layers run: Edge Case Hunter, Verification Gap Reviewer. Skipped: Blind Hunter and Intent Alignment (token economy; the integrated epic review covers them).

- verdicts: 14 findings — high 0, medium 6, low 6, false 1, maybe-false 1
- findings:
  - `medium` `patch` ECH-1 an empty points section (`kind: 'empty'`) gets no page break and runs on under the last ficha — fixed: the kernel's `layoutSpec` sets `startsPage: true` on section 8, whatever its variant, when section 9 precedes it; `docx.ts` breaks on it.
  - `medium` `patch` ECH-2 claim "points heading breaks wherever it prints" fails for the empty variant — same root and fix as ECH-1.
  - `medium` `patch` ECH-3 the audit input (`audit/input.ts` `partLines`) drops the new item line of a sheet photo, so an NC photo after CONCLUSÃO no longer names its item — fixed: the item line is appended as the section 7 branch does, with an audit test.
  - `false` `reject` ECH-4 `photoItemLine` resolves against `cabine_primaria` and can miss an items-group photo — the items group holds only photos whose `item_key` is in the printed checklist of the same seed definition (`sheetChecklistPrinted`), which `photoItemLine` resolves with the same `getDefinition`; section 7 uses the same function.
  - `low` `reject` ECH-5 an item photo of an unprinted checklist (group "other") gets no item line — the story's item reference belongs to the checklist the ficha prints; naming an item of a table that is not printed would point at nothing; adding it is new behavior, not a correction.
  - `medium` `defer` ECH-6 `page-placement.integration.test.ts` skips in the gate's tools container (no LibreOffice) — run in the api container for this batch and pasted in the PR; putting LibreOffice in the tools image is out of scope.
  - `medium` `defer` ECH-7 claim "proven on the LibreOffice PDF" rests in the gate on `document-pages.spec.ts` (VERIFICAÇÕES GERAIS only) — same root as ECH-6.
  - `low` `patch` ECH-8 `fichaStart` returns page -1 and an empty `before` when the title is not found, so a caller checking only `before` passes vacuously — fixed: it throws naming the tag.
  - `low` `reject` ECH-9 a kept table's last row has no keep-with-next, so a one-line part after it can open the next page alone — the story keeps the three tables whole, not what follows them; chaining the last row would drag the table onto the next page with the following part.
  - `low` `patch` VG-1 no test pins the changed branch "a painel band after a local drawn alone starts a page" — fixed: a `docx.test.ts` case with `{ localParts, sheets: [] }` then `{ painel: true }`.
  - `medium` `patch` VG-2 audit item line — same root and fix as ECH-3.
  - `low` `defer` VG-3 the keep-whole PDF proof sits in a skipped suite — same root as ECH-6.
  - `low` `patch` VG-4 empty points section — same root and fix as ECH-1.
  - `maybe-false` `patch` VG-5 the points break also changes the pagination of an existing relatório's reprint, which the 20.3 DoR excludes ("no reprint of an existing relatório changes") — reading corrected by the batch: the points section starts a page only when it prints after the tests section, so an old-order relatório reprints as before; old-fixture expectations restored.

## Design Notes

- ~~Open reading kept as the DoR says: the points page break applies to every relatório, old order included (it changes pagination, not order or numbers, of a regenerated old relatório; an issued revision's stored files never change).~~ *(2026-11-03, coordinator's batch decision after review: the points section starts a page only when it prints after the tests section, whatever its kind, empty included; in FO.SERV-03 order it runs on, so an existing relatório reprints unchanged. The kernel decides it: `layoutSpec` sets `startsPage: true` on that section and `docx.ts` breaks on it.)*
- Open reading: the item line is added to sheet checklist-item photos only; a local's site-item photos stay right under their table as today, so they get none.
- Risk to check first: the fixture already emits `pageBreakBefore` on every sheet after its subsection's first (`docx.test.ts` L202 `1 + 10 + 83`), yet the field report says fichas run on. Read `pdfPageTexts` of a generated fixture PDF before changing the rule; if LibreOffice drops `pageBreakBefore` on the shaded, bordered title paragraph after a table, put the break on a paragraph LibreOffice honors (e.g. an empty paragraph with `pageBreakBefore`, or a `PageBreak` run) and say so here.
- As built (2026-11-03, implementation): LibreOffice honors `pageBreakBefore` on the title bar after a table (`page-placement.integration.test.ts` case 3 and `e2e/document-pages.spec.ts`), so the break stays on the title paragraph. The run-on the field saw is the first ficha after a local block (seed v4 and later): the old rule broke a sheet only for `i > 0`, so a subsection's first ficha followed VERIFICAÇÕES DO LOCAL on the same page, and a painel band followed a local alone. The Porto Seguro fixture is on seed v1 (no local block), which is why its break count looked complete.
- Path shipped for 20.5: keep-with-next on every cell paragraph of every row but the last, `tblHeader` on the leading band and header rows, `cantSplit` kept. The PDF proof (`page-placement.integration.test.ts`) shows LibreOffice moves each of the three tables whole and splits a checklist taller than a page only at row boundaries with the band and header repeated; the same run with `keepWhole` ignored fails both cases (checked by hand), so the section 10 one-row wrapper fallback was not needed.
- Golden: `porto-seguro-skeleton.json` is unchanged and was not regenerated: it pins headings, table text, header and footer; the fixture's sheets carry no photos (no photo part moves) and keep-whole changes no text. `photo-order.test.ts` stays as it was except the M5 placement lines (they asserted the Não ensaiada plate photo before the reason band, which 20.6 moves after it); every numbering assertion of that test, and `numbering.test.ts`, is unchanged and green.
- Ripple of 20.3 beyond the named files: the Sumário and every surface speak positions, so on a new relatório the tests row is 8 ("Expandir ou recolher a seção 8", "Agrupar por tipo na seção 8", "Conclusão da ficha (seção 8)") and the points row 9 ("entra na seção 9", "na seção 9"). Unit tests over `instantiateTemplate` (kernel `section-position`, `sumario`, `parecer`, `layout`, `section-8`, `audit`; web `sumario-surface`, `relatorio-tree*`, `compact-template-sections`, `export-dialog`) and about 35 e2e specs and helpers that open section 9 by its chevron name or read sections by number were updated to the new numbers; the production smoke matches the chevron by a pattern, since prod holds relatórios of both orders. ~~A section printed empty (its note) takes no break, as before: only a points section with content (`kind: 'points'`) breaks, as only a tests section with sheets does.~~ *(2026-11-03: superseded by the `startsPage` line above.)*
- LibreOffice is in the api image only; the tools container that runs `pnpm test:api` has none. `page-placement.integration.test.ts` therefore skips itself where no `soffice` is on the PATH and is run in the api container: `podman compose exec api pnpm --filter @app/api exec vitest run src/jobs/generate/page-placement.integration.test.ts` (3 of 3 green). The real-pipeline proof inside the gate is `e2e/document-pages.spec.ts`.
- Seeded, not tapped, in `e2e/document-pages.spec.ts`: removing the 91 sheets outside three of Cubículo Enel (one office push of `remove` ops) and the point citing the NC photo (one office create); everything else (creation, Sumário checks and moves, the long plate, the three cameras, the parecer, the issue) goes through the UI.
- Not done: `e2e/sheet-photos.spec.ts` 11.11-E2E-001 gains no document check. It never generates; a per-page check there would issue a 94-sheet relatório and move the whole spec into the serial group. Its screen assertion (the strip after Conclusão) is unchanged, and the document placement of a plate photo, an item photo and other photos is proven by `e2e/document-pages.spec.ts`, 17.1-E2E-001 and 16.3-E2E-001.

## Verification

**Commands** (host: podman; tools with `--user root`; Playwright and any e2e only under `lockf -t 20000 /tmp/fasor-verify.lock`, started with nohup, logs in `.scratch-e20d/`):
- `podman compose --profile tools run --rm --user root tools pnpm test:unit -- <path>` -- targeted kernel/api unit tests green.
- `podman compose restart api` after changes under `packages/domain` or `apps/api`, before `test:api` and e2e.
- `podman compose --profile tools run --rm --user root tools pnpm test:api` -- green, including `page-placement.integration.test.ts`.
- `podman compose --profile tools run --rm --user root tools pnpm exec tsx scripts/e2e.ts e2e/document-pages.spec.ts <touched specs> --project desktop-chrome --project durability-desktop-chrome` (under the lock) -- green.
- `pnpm lint` and `pnpm static` in the tools container -- green.

## Auto Run Result

Status: done

- **Summary:** 20.3: `instantiateTemplate` creates the tests section before the points section; the kernel's `layoutSpec` marks the points section `startsPage` when it prints after the tests (empty included), and `docx.ts` breaks on it. 20.5: the kernel marks DADOS DO EQUIPAMENTO, VERIFICAÇÕES GERAIS and VERIFICAÇÕES DO LOCAL `keepWhole`; the renderer keeps every row but the last with the next and repeats the leading band and header rows (`tblHeader`). 20.6: each ficha prints one photo block after CONCLUSÃO (plate, items with their item line, others), a Não ensaiada ficha after its reason band; every ficha and local block starts a page; photo numbers unchanged.
- **Files:** kernel `relatorio/instantiate.ts`, `print/section-9.ts`, `print/layout.ts`, `print/section-8.ts` (type), `print/photo-order.ts` (comments), `audit/input.ts`; api `jobs/generate/docx.ts`, `sections/section-9.ts`, new `page-placement.integration.test.ts` and `page-layout.test-support.ts`; e2e `support/pdf-text.ts` (`pdfPageTexts`, `fichaStart`), new `document-pages.spec.ts` (serial group), about 35 specs renumbered for the new Sumário positions, the production smoke; docs `source-deltas.md`, `docs/kbs/architecture/rendering.md`, `docs/kbs/log.md`.
- **Review:** 14 findings; 6 rows patched (points break including the empty variant and old order, audit item line, `fichaStart` throw, painel-band test); 3 rows deferred (the LibreOffice suite skips in the tools container; run in the api container, output in the PR); rejected ECH-4 (false: same predicate and definition as section 7), ECH-5 (an unprinted checklist has no table to refer to), ECH-9 (keeping the last row would drag the table with what follows).
- **Follow-up review recommended:** true. Patched at entry verdict: 2 medium (the `startsPage` rule, the audit item line), 2 low. Named risk: both were patched after review and are not re-reviewed; the integrated review reads them first.
- **Verification:** the story gate in the PR body (lint, static, test:unit, test:api, the touched specs) and page-placement 3/3 in the api container.
- **Residual risks:** keep-whole of DADOS DO EQUIPAMENTO and VERIFICAÇÕES DO LOCAL and the header repeat are proven on the PDF only by the api-container suite, not inside `pnpm test:api`.
