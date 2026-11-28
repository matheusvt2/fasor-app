---
title: 'Story 7.1 (+ 7.2 AC2, E12-A2): section 9 equipment sheets as native tables grouped as FO.SERV-03'
type: 'feature'
created: '2026-09-26'
status: 'in-review'
baseline_revision: '1582cddadfc18cac787efb0f86995fd2fb163151'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'max'
context: []
warnings: ['batched', 'oversized']
batched_reason: 'Epic 7 batch G1 (coordinator decision 2026-09-26): Story 7.1, Story 7.2 AC2 (photos inside their sheet) and carry-over E12-A2 (TAG prefill prints) all render the one section 9 sheet, so they ship as one change.'
deferred:
  - summary: >-
      A hanging MinIO getObject for one of the in-sheet photos could stall the generate job before LibreOffice's timeout applies.
    evidence: |-
      job.ts loads each photo through printVariant sequentially; the same path already loads the logo and the cover. Settle by checking the S3 client's request timeout and adding a per-photo timeout if none applies.
    location: >-
      apps/api/src/jobs/generate/job.ts
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** Section 9 of the generated relatório prints only its heading and `EMPTY_SECTION_NOTE`. The 94 equipment sheets must print as native, Word-editable tables in FO.SERV-03's grouping, with the photos linked to a sheet inside it and the nameplate TAG prefill when the TAG cell is empty.

**Approach:** Two new kernel modules compute everything. `groupForPrint(snapshot, scheme)` orders and groups the sheets, with `ordem_de_campo` as the base case and `por_local_e_tipo` built on it. `section9Layout` turns each sheet into a generic printable table model with every string composed. A new api module `sections/section-9.ts` draws that model with the `docx` library. `layout.ts`, `docx.ts` and `job.ts` change only by a minimal dispatch insertion (coordinator decision).

## Boundaries & Constraints

**Always:**
- Kernel ownership (AD-1/AD-13). Every order, title, label, value text, unit, mark, "-", VAL CALCULADO, SATISFATÓRIO, conclusion text and photo number comes from `packages/domain`. `apps/api/src/jobs/generate/sections/section-9.ts` never composes a printed string. Its only jobs are case-neutral drawing: widths, borders, shading, spans, images and page breaks.
- Labels: the seed string, uppercased at print (`toLocaleUpperCase('pt-BR')`) in the kernel section-9 layout. Values print as stored and are never uppercased.
- Tree order is never changed. Grouping only filters and pairs; within a group, sheets follow tree order (`sheetOrder` in `relatorio/ficha.ts`).
- Existing kernel rules are reused, not re-implemented: `evaluateSheetReadings`/`evaluateTest` (readings, VAL CALCULADO, CONDIÇÕES, criterion and source), `enabledSubBlocksOf`, `composeConclusion`/`conclusionTextState`/`conclusionPairComplete`, `nameplateTagPrefill`, `notTestedReasonText`, `numberPhotos`/`photoRefLabel`, `livePhotos`/`comparePhotos`, `storedInstrumentHeader`, `fieldValueText`, `blockTypeLabel`, `formatDateTime`, `LOCATION_HEAD_NOUNS`.
- New pt-BR strings live in the kernel. Strings not verbatim from FO.SERV-03, the AC or EXPERIENCE.md get `// authored:` comments. That covers the role words, the attribution wording and the Não ensaiado band wording.
- Each sub-block with `enabled = false` is omitted. The four uncaptured grid columns (30 SEGUNDOS, ESTAB./10MIN, ABSORÇÃO, POLARIZAÇÃO) are grid columns, not sub-blocks, and always print, "-" when not captured. ABSORÇÃO and POLARIZAÇÃO print typed values only when `ia_ip_display` is enabled and the cells hold them.
- No emoji, English code and comments, public-repo rule (nothing copied from `docs/context/`).

**Never:**
- No changes to sections 7, 8, 10 or 11, the Export dialog, `preIssue` rows, `CONTRACT_VERSION`, web UI or the TOC/ÍNDICE (see Design Notes, narrowings).
- No suggestion-status code. Cells hold only confirmed values, so the renderer reads cells and never `snapshot.suggestions` (coordinator decision).
- No sheet printed as an image. No name-matching to pair cables with transformers: pairing is by `feeds_block_id` only.
- No editing of `epics.md` or `sprint-status.yaml`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior |
|---|---|---|
| Base case | `scheme = ordem_de_campo`, any flags | One subsection per cabine holding at least one equipment block, in tree order. Title is the cabine name, sheets in tree order, `agrupar_por_tipo` ignored. |
| Flag off | `por_local_e_tipo`, cabine `agrupar_por_tipo = false` | Exactly the base-case subsection for that cabine. |
| Flag on | `por_local_e_tipo`, flag on | Subsections in the fixed order Seccionadoras (chave_seccionadora, para_raio, cabos_entrada, and cabos_saida whose role is not `alimentacao`) › Disjuntores (disjuntor_mt) › TP's e TC's › Transformadores e Cabos de Alimentação. Empty groups are skipped. |
| TP/TC pairs | Flag on, a location holding TPs and TCs | Per location (coluna, or the cabine itself) in tree order: TP₁, TC₁, TP₂, TC₂…, pairing the n-th TP with the n-th TC of that location in tree order. Leftovers follow in tree order. |
| Transformer pairs | Flag on | For each transformer in tree order: the cables whose `feeds_block_id` is that transformer (same cabine, tree order), then the transformer. |
| Unpaired cable | Flag on, `cabos_saida` with role `alimentacao` whose `feeds_block_id` is null or not a live transformer of the same cabine | Printed at the end of the transformer group in tree order. `groupForPrint(...).warnings` gets `{kind:'integrity', code:'unpaired_cable', blockId, cabineId}`. |
| Titles | Flag on | `Seccionadoras dos Cubículos de MT do 1° Subsolo`, `Disjuntores dos Cubículos de MT dos Geradores`, `TP's e TC's dos Cubículos de MT d⟨o/a/os/as⟩ ⟨cabine⟩`, `Transformadores e Cabos de Alimentação do 1° Subsolo`. The article comes from the cabine name's head noun (`LOCATION_HEAD_NOUNS`, plus `geradores` as m/plural), with masculine singular as the fallback. |
| Subsection heading | Section at position N | `N.k ⟨title⟩` as Heading 2 (outline level 1), k counting from 1 across section 9. |
| First sheet of a cabine | The first block `groupForPrint` emits for each cabine | Prints `CARACTERÍSTICAS DA SE` and `AMBIENTE DE ENSAIO` from the cabine's `se`/`env` (seed `cabine` field labels, values with units, "-" when empty). |
| Não ensaiada | `block.not_tested` set | Title, attribution, the cabine block if it is the cabine's first sheet, nameplate (if enabled) and a reason band `NÃO ENSAIADO — ⟨reason text⟩`. The reason band adds `: ⟨justification⟩` when the seed or the typed text has one. Nothing else prints. |
| TAG prefill (E12-A2) | Nameplate TAG cell absent, equipment has a TAG | The TAG field prints `nameplateTagPrefill(snapshot, blockId)`. Nothing is written. |
| Conclusion text | `text_status = edited` | The stored text prints, with the current `composeConclusion(...).criteriaLine` beneath. |
| Conclusion text | `text_status = confirmed` and `text_basis` equals the current basis | Prints the same as edited. |
| Conclusion text | Confirmed but stale, unconfirmed, or the pair incomplete | The result pair row prints and the text does not. |
| Mixed units | A value column whose measured cells carry more than one unit | The column or group header reads `VALORES` with no unit. Each measured cell always prints `⟨number⟩ ⟨unit⟩`. With one unit the header reads `VALORES (GΩ)`. |
| Pending suggestion | `snapshot.suggestions` holds a `pending` row targeting a cell | `section9Layout` output is deep-equal to the output without that row. |
| Photos in sheet (7.2 AC2) | Live photos with `block_id = block.id` | Printed inside that sheet, two per row: a photo with `item_key` after the checklist table, one with `reading_kind = 'plate'` after the nameplate, the rest after the last test table (before OBSERVAÇÕES). Order is `comparePhotos`. Each photo has the line `⟨photoRefLabel(n)⟩: ⟨caption⟩.` beneath it, or `⟨photoRefLabel(n)⟩.` when uncaptioned. `n` comes from `numberPhotos(snapshot.files)`, the same numbers section 7 prints. |
| Photo bytes missing | Print variant not stored or unreadable | The caption line still prints, with an empty image cell. The job never fails for it. |
| No equipment | Snapshot with no equipment blocks | Section 9 keeps `kind: 'empty'` with `EMPTY_SECTION_NOTE`. |

</intent-contract>

## Code Map

- `packages/domain/src/print/layout.ts` -- `layoutSpec`. Sections map over `printedSections`, and section 9 is currently `kind: 'empty'`, because `sectionType(9)` is null. The insertion point: add `LayoutSectionSheets` to the `LayoutSection` union and branch `section === 9` to `section9Layout`.
- `packages/domain/src/schemas/snapshot.ts` -- `relatorioSnapshotSchema`/`buildSnapshot`. `responsible` already reads a `user` row from state. Add `actors`, as below.
- `packages/domain/src/relatorio/ficha.ts` -- `sheetOrder(snapshot)` is the tree order of equipment nodes (`TreeEquipmentNode`), and `fieldValueText` gives values in pt-BR.
- `packages/domain/src/relatorio/tree.ts` -- `locationTree`, `blockTypeLabel`, `notTestedReasonText`.
- `packages/domain/src/relatorio/cabine.ts` -- `cabineOf(locations, locationId)`. `relatorio/progress.ts` -- `cabineLocationIds`.
- `packages/domain/src/relatorio/readings.ts` -- `evaluateSheetReadings(block, definition)` gives `TestEvaluation` (title, `criterionText`, `sourceName`, tables, rows, `calculated`, `condicao`, cells with `raw`/`unit`/`state`). Its `VisibleColumn` excludes `print` columns, so the print grid reads the seed `TableDef.value_columns` for the full column list and `cellAt` for values. `print` cells print "-", except ABSORÇÃO/POLARIZAÇÃO under `ia_ip_display`.
- `packages/domain/src/relatorio/conclusion.ts` -- `composeConclusion(block, definition, tag)` returns `{text, criteriaLine, basis}`. Also `conclusionTextState`, `conclusionResultOf`, `conclusionRestrictionOf`, `conclusionPairComplete` and `conclusionStoredText`.
- `packages/domain/src/relatorio/sheet-state.ts` -- `enabledSubBlocksOf`.
- `packages/domain/src/relatorio/nameplate-copy.ts:126` -- `nameplateTagPrefill`.
- `packages/domain/src/relatorio/instrument-pick.ts` -- `storedInstrumentHeader(test.instrument.value)`: manufacturer, model, serial, `cert_number` (prints under `RBC`), `test_parameter` (TENSÃO ENSAIO / CORRENTE).
- `packages/domain/src/relatorio/sheet-progress.ts:337-347` -- screen attribution helpers (`dd/mm HH:mm`). The print uses the full `formatDateTime` (`format/datetime.ts`).
- `packages/domain/src/photos/{numbering,order,caption}.ts` -- `numberPhotos`, `photoRefLabel`, `livePhotos`, `comparePhotos`, and `LOCATION_HEAD_NOUNS` (add `geradores: { gender: 'm', number: 'plural' }`).
- `packages/domain/src/seed/v1.ts`, `seed/schema.ts` -- block definitions (nameplate `FieldDef` with `unit`, checklist items, `TestDef.tables`, `columnDefSchema.role` capture/input/derived/print), `checklist_columns` `['ÍTEM','C','NC','NA','OBSERVAÇÕES']`, `cabine.se/env` fields.
- `packages/domain/src/schemas/block-config.ts` -- `roleSchema` (entrada/saida/alimentacao), `SUB_BLOCK_KEYS`.
- `packages/domain/src/seed/template.ts:113-176` -- standard skeleton. 1° Subsolo (flag on, 5 transformers plus 5 `cabos_saida` role `alimentacao` at cabine level, colunas 1-17). Geradores (flag on, 7 seccionadoras, 4 disjuntores, 4 TP, 4 TC directly on the cabine).
- `packages/domain/fixtures/porto-seguro/op-log.ts` (`feeds_block_id: null` at :478) plus `snapshot.golden.json` -- the fixture. The op path `block/{id}/feeds_block_id` exists (`ops/path.ts:40`, used by `fixtures/replay-small/op-log.ts:288`).
- `apps/api/src/jobs/generate/docx.ts` -- `buildDocx`. The sections loop at :225-229 is the insertion point. `DocxImages`, `sizedImage` and `image` are local helpers (export what the section module needs, or pass them in).
- `apps/api/src/jobs/generate/job.ts:224-231` -- builds `layout` and `images`. `printVariant(deps, companyId, fileId)` at :165 loads a `print` variant.
- `apps/api/src/jobs/generate/docx.test.ts` plus `docx-structure.ts` plus `golden/porto-seguro-skeleton.json` -- the 4.8-UNIT-006 structure golden (`GOLDEN_UPDATE=1` regenerates).
- `_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/imports/extract-fo-serv-03.md:83-256` -- section 9 per-model block order and tables T3-T13. Read by line range.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/schemas/snapshot.ts` -- add `actors: z.array(userRowSchema).default([])`: the live `user` rows named by any block's `concluded_by.actor_id` or `last_modified_by`, sorted by id. Update fixture goldens (`fixtures/porto-seguro/snapshot.golden.json` and any other) deliberately -- the attribution line needs a name.
- `packages/domain/src/photos/caption.ts` -- add `geradores` (m, plural) to `LOCATION_HEAD_NOUNS`. Update caption tests only if they change.
- `packages/domain/src/print/group-for-print.ts` (new) -- `PrintScheme`, `PrintGroupKind = 'cabine'|'seccionadoras'|'disjuntores'|'tps_tcs'|'transformadores'`, `PrintSubsection {cabineId, kind, title, blockIds}`, `PrintGroupWarning`, `PrintGrouping {scheme, subsections, warnings}`, `groupForPrint(snapshot, scheme = snapshot.relatorio.export.scheme)` per the matrix. `por_local_e_tipo` maps the `ordem_de_campo` result and splits only flagged cabines.
- `packages/domain/src/print/section-9.ts` (new) -- a generic print model (`PrintTable {columns: number[] weights; rows: PrintRow[]}`, `PrintRow {cells: PrintCell[]; header?: boolean; band?: boolean}`, `PrintCell {text; span?; bold?; shade?; align?}`, `PrintPhoto {fileId, number, caption}`, `SheetPart = table | photos | paragraph`), `PrintSheet {blockId, title, attribution|null, parts}`, `LayoutSectionSheets {number, title, kind:'sheets', subsections:{heading, sheets}[], warnings}`, `section9Layout(snapshot, number, title): LayoutSectionSheets | null` (null when no sheets), and `layoutPhotoIds(layout): string[]`. Sheet part order follows FO.SERV-03: title bar, attribution, [SE + AMBIENTE], DADOS DO EQUIPAMENTO (3 label/value pairs per row), [plate photos], VERIFICAÇÕES GERAIS (`checklist_columns`, `⟨n⟩. ⟨LABEL⟩`, `X` in the chosen C/NC/NA column, observation), [checklist photos], then one block per enabled test: its instrument header row (INSTRUM./FABRIC. · TIPO · Nº SÉRIE · RBC · TENSÃO ENSAIO or CORRENTE (omitted for relação) · ACEITÁVEL), the criterion line `CRITÉRIO: ⟨criterionText⟩ · ⟨sourceName⟩` and its tables with the two-level header where the seed has `connection_group`/`group`. Then [other photos], OBSERVAÇÕES (enabled and non-empty) and CONCLUSÃO (APROVADO · REPROVADO · SEM RESTRIÇÕES · COM RESTRIÇÕES (VER OBSERVAÇÕES), with `X` on the chosen ones) plus the text and criteria line per the matrix. Titles are type + role + TAG (see Design Notes), uppercased. Attribution: `Concluída por ⟨name⟩ · ⟨dd/mm/aaaa HH:mm⟩`, else `Preenchido por ⟨name⟩ · ⟨…⟩` from `last_modified_by`/`last_modified_at`, else null (unknown actor or no timestamp).
- `packages/domain/src/print/layout.ts` -- minimal insertion only: the union member, and in the sections map `if (section === 9) return section9Layout(snapshot, number, title) ?? emptySection`.
- `packages/domain/src/index.ts` -- export the two new modules.
- `packages/domain/src/print/group-for-print.test.ts` (new) -- 7.1-UNIT-001: base case (one subsection per cabine, tree order), `por_local_e_tipo` equal to the base case when every flag is off (built on it), flag-on groups and fixed order, empty groups skipped, para-raios and cabos inside Seccionadoras, TP/TC pairing per location, `feeds_block_id` pairing (cable before transformer), unpaired cable last with warning, titles with do/da/dos, removed blocks ignored. Also run the Porto Seguro fixture: 11 subsections with the FO.SERV-03 titles and counts 9, 13, 14, 12, 10, 5, 6, 6, 7, 4, 8.
- `packages/domain/src/print/section-9.test.ts` (new) -- every matrix row on small hand-built snapshots. That includes the deep-equality test with a pending suggestion row, and E12-A2 (prefill printed, stored TAG wins, an empty stored cell prints "-"). Also the NFR-17 check on the Porto Seguro fixture: the sheets printed equal `progress(snapshot).sheets_total`, and the reason bands printed equal the `not_tested` count behind `preIssueRowsFor(preIssue(snapshot), 'section_9')`.
- `packages/domain/fixtures/porto-seguro/op-log.ts` -- emit five `block/{cable}/feeds_block_id` puts pairing the 1° Subsolo `cabos_saida` (role `alimentacao`) n with `transformador_forca` n in tree order, as the delivered 9.5 pairs them. Regenerate `snapshot.golden.json` and adjust any op-count assertion.
- `apps/api/src/jobs/generate/sections/section-9.ts` (new) -- `section9Children(section, photos: ReadonlyMap<string, Buffer>): Promise<(Paragraph|Table)[]>`: Heading 2 per subsection (page break before every subsection after the first), each sheet on a new page, `PrintTable` into `docx` `Table`s over the content width (weights to DXA, `columnSpan`, grey `shade` for title bars and header rows, `cantSplit` rows, 9 pt table text), photo rows two per row at half width through `sizedImage`, caption paragraph beneath.
- `apps/api/src/jobs/generate/docx.ts` -- minimal insertion: `DocxImages.photos?: ReadonlyMap<string, Buffer>`, and in the sections loop `else if (section.kind === 'sheets') children.push(...await section9Children(section, images.photos ?? new Map()))`. Add a Heading 2 paragraph style (outline level 1, `keepNext`) beside Heading 1.
- `apps/api/src/jobs/generate/job.ts` -- minimal insertion after the cover image: load `print` variants for `layoutPhotoIds(layout)` into `images.photos` through `printVariant`.
- `apps/api/src/jobs/generate/docx.test.ts` -- regenerate the 4.8-UNIT-006 golden (it now carries section 9). Keep it reviewable: serialize each table row on one line if the file grows past about 300 KB. Add tests for the Porto Seguro headings `9.1 Cubículo Enel` … `9.11 TP's e TC's dos Cubículos de MT dos Geradores`, for sheet tables present as native `w:tbl`, and for a block-linked photo embedded inside its sheet with `Imagem N: ⟨caption⟩.` beneath.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- close E12-A2 and add the entries listed under Design Notes › Narrowings.

**Acceptance Criteria:**
- Given the Porto Seguro fixture, when the generate job renders the DOCX, then section 9 holds 11 subsections titled and filled as FO.SERV-03 9.1-9.11 (counts above), every sheet is native tables, and the structure golden matches.
- Given `groupForPrint` under `ordem_de_campo` and `por_local_e_tipo`, when the kernel tests run, then the base case yields one subsection per cabine in tree order, and `por_local_e_tipo` equals that base case for every unflagged cabine.
- Given a sheet with a disabled `resistencia_contato` and `observations`, when it prints, then neither appears, while the insulation grid still prints all five value columns with "-" outside `1 MINUTO`.
- Given a photo linked to a block, when the DOCX renders, then the image and `Imagem N: ⟨caption⟩.` sit inside that block's sheet, and N equals that photo's `numberPhotos` number.
- Given the full gate, when `pnpm verify` and `pnpm test:e2e:full` run (under the host lock), then both are green.

## Design Notes

**Sheet title (authored role words):** `blockTypeLabel` plus a role suffix, then the TAG. The suffix is `de entrada`/`de saída` when the role is `entrada`/`saida` and the label does not already end with that role ("Cabos de entrada" stays as it is). `cabos_saida` with role `alimentacao` prints `Cabos de alimentação`, and any other type with `alimentacao` gets `de alimentação`. For example, `CHAVE SECCIONADORA DE ENTRADA SEC-C01` and `CABOS DE ALIMENTAÇÃO CB-S01`.

**Why `actors` joins the snapshot:** the renderer reads only the frozen snapshot (AD-15). User names for attribution are rows of the same state `responsible` is read from.

**Narrowings (deferred-work entries plus the PR body list):**
- `unpaired_cable` warnings are returned by `groupForPrint` but not yet surfaced as a pre-issue or Export row. Owner: G3 (pre-issue shape).
- No UI writes `feeds_block_id`, so every alimentação cable of a new relatório prints unpaired. Owner: none (open question for Matheus: a pairing control, or pairing at instantiation).
- The printed ÍNDICE lists sections only. FO.SERV-03 also lists 9.1-9.11, while the PDF outline carries them as level 2. Owner: Epic 7 integrated fix batch.
- Não ensaiada sheets print no photos.

**Open questions:**
- TP/TC ordinal pairing inside a location with no colunas (Geradores): this is the chosen reading of "per-column pairs".
- The AC's `Cubículos de MT` versus the source ÍNDICE's `Cubículos de Média Tensão`. The AC is followed.
- The attribution line's wording is authored.

## Verification

**Commands (inside `tools`, never on the host):**
- `docker compose --profile tools run --rm tools pnpm test:unit -- packages/domain/src/print` -- expected: green.
- `docker compose --profile tools run --rm tools pnpm test:api -- src/jobs/generate` -- expected: green (golden regenerated once with `GOLDEN_UPDATE=1`, then green without it).
- `docker compose --profile tools run --rm tools pnpm lint` and `pnpm static` -- expected: clean.

**Manual checks:**
- Render the Porto Seguro fixture to DOCX and PDF in the stack, rasterize two section 9 pages (a flagged-cabine page and an Enel page), and confirm the tables, the grid "-", the units and the titles by eye.

## Spec Change Log

## Review Triage Log

### 2026-09-26 — Review pass
- layers: Edge Case Hunter and Verification Gap Reviewer ran; Blind Hunter and Intent Alignment skipped (token economy; the integrated epic review covers them).
- verdicts: 11 findings — high 0, medium 4, low 6, false 0, maybe-false 1
- findings:
  - `[medium]` `[patch]` (VG-1) `buildSnapshot` `actors` and the api `toSnapshot` user query are untested (goldens hold `[]`) — added a kernel `buildSnapshot` actors test and an api `toSnapshot` assertion for a non-responsible user.
  - `[medium]` `[patch]` (VG-2, grouped with EC-1) device `toSnapshot` (`apps/web/src/db/snapshot.ts`) loads only the responsible's user row, breaking AD-15 byte-equality once another user edits a sheet — device now loads the user rows; byte-equality case added.
  - `[medium]` `[patch]` (VG-3) the job's in-sheet photo loading is never exercised with stored bytes — `generate.integration.test.ts` stores a real `print` variant and asserts the embedded image.
  - `[low]` `[patch]` (VG-4) page breaks, `cantSplit` and spans are untested — XML counts added to `docx.test.ts`.
  - `[low]` `[patch]` (VG-5) the checklist-off fallback of an `item_key` photo is untested — test added (`checklist` is a locked sub-block, so the fallback is reached only by a config that enables none; the test covers both).
  - `[medium]` `[patch]` (EC-1) same root cause as VG-2 — fixed with it.
  - `[maybe-false]` `[defer]` (EC-2) a hanging MinIO `getObject` for one of many photos could stall the job before LibreOffice's timeout — the same `printVariant` path already loads the logo and cover; settling it needs the S3 client's request timeout checked. Deferred (medium, unverified).
  - `[low]` `[patch]` (EC-3) a cabine name opening with an ordinal ("2ª Cabine") took its article from the ordinal ("do 2ª Cabine") — `ofCabine` skips a leading ordinal token; test added.
  - `[low]` `[patch]` (EC-4) a caption ending in `?`, `!` or `…` got a second period — any closing punctuation now counts; test added.
  - `[low]` `[reject]` (EC-5) a nameplate value stored as a bare JSON number prints unformatted — number fields are stored as `{raw, unit, state}` by every writer; only a malformed op could store a bare number, and the fix adds a branch.
  - `[low]` `[patch]` (EC-6) side-by-side contato tables were fitted per half as if each had the whole page — the joined rows are re-fitted with `fittedColumns`.

## Auto Run Result

Status: done

**Summary:** Section 9 prints the equipment sheets as native Word tables grouped as FO.SERV-03. The kernel computes the grouping (`groupForPrint`) and every sheet (`section9Layout`), and the api draws them (`sections/section-9.ts`). Photos linked to a block print inside their sheet (7.2 AC2), and the nameplate TAG prefill prints when the cell is empty (E12-A2).

**Files:**
- `packages/domain/src/print/group-for-print.ts`: new. `groupForPrint` (base case plus type groups, TP/TC and cable/transformer pairing, unpaired-cable warnings).
- `packages/domain/src/print/section-9.ts`: new. Print model, `section9Layout`, `layoutPhotoIds`.
- `apps/api/src/jobs/generate/sections/section-9.ts`: new. Draws the model: Heading 2 per subsection, one sheet per page, fixed-width ruled tables, photo rows.
- `packages/domain/src/print/layout.ts`, `apps/api/src/jobs/generate/docx.ts`, `job.ts`: minimal dispatch insertions (section 9 branch, Heading 2 style, photo `print` variants).
- `packages/domain/src/schemas/snapshot.ts`, `apps/api/src/sync/snapshot.ts`, `apps/web/src/db/snapshot.ts`: `actors` (user rows of sheet concluders and editors), loaded the same on both sides.
- `packages/domain/src/photos/caption.ts`: `geradores` head noun, `headNounAgreement` exported.
- `packages/domain/fixtures/porto-seguro/*`: the five 1° Subsolo cable-to-transformer pairs, instrument headers copied through `instrumentHeaderOf`, goldens regenerated.
- Tests: `group-for-print.test.ts`, `section-9.test.ts`, `snapshot.test.ts`, `docx.test.ts`, `generate.integration.test.ts`, `replay.integration.test.ts`, `commit.test.ts`.

**Review:** 11 findings. 9 patched (medium 4, low 5; the grouped EC-1 counted with VG-2), 1 deferred (EC-2, medium unverified), 1 rejected (EC-5). Follow-up review recommended: false. No `high` finding was patched. The medium patches were missing tests plus one real device/server snapshot divergence, which is now covered by a byte-equality test.

**Verification:** narrow suites green after each fix. The Porto Seguro fixture was rendered to DOCX and PDF in the api container (102 pages, TOC converged in 2 passes, about 30 s), and pages 8, 17, 44, 56 and 57 were rasterized and inspected. That check found the fixture's descriptive `test_parameter` printing under TENSÃO ENSAIO; it is fixed. The gate results are in the PR body.

**Residual risks:** generation of 94 sheets takes about 30 s for two passes. The first sheet of section 9 can split across pages (deferred). No UI writes `feeds_block_id` (open question).
