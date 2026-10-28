---
title: 'Fix batch fx17r: Epic 17 QA gaps G1 and G2, review findings R4, R5, R11, R18 (E17-A1)'
type: 'bugfix'
created: '2026-10-28'
status: 'in-progress'
baseline_revision: '23cdcfa52d2e58282238e25dea0322afa9ec5f33'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'medium'
context: []
warnings: ['batched'] # coordinator's cut: six one-place corrections of Epic 17 after its QA pass and integrated review (E17-A1)
deferred: []
---

<intent-contract>

## Intent

**Problem:** Six small gaps left by Epic 17 (QA report `_bmad-output/test-artifacts/manual/qa-e17-2026-10-28.md` § Gaps; retro `epic-17-retro-2026-10-28.md` § Diff-scope review): (G1) the "N/A" control is offered beside an oil field the oil rule already excuses (Vol. óleo on an EPÓXI or Á SECO unit), so a tap stores `not_applicable` while the document prints "-"; (G2) the Ensaio de relação cells' accessible names start with a comma while TAP atual is blank (`", V primário"`); (R4) `restrictionWarning` composes its combined sentence by slicing `'Há '.length` off an authored sentence; (R5) `failedRatioRows` names a blank-label row "TAP" on the TAP branch only, so a blank connection label on another table yields "insatisfatória em " with nothing after; (R11) the exhausted-target guard of the camera falls back to the save-failure toast when a caller passes no `shotHint`; (R18) the gallery's Geral note and the capture sheet's "Geral" radio promise the Registro fotográfico unconditionally while the gallery's first note and `photoRemoveDescription` branch on `sectionMention(snapshot, 7).prints`.

**Approach:** Six localized fixes, kernel first: every predicate and derived text lives in `packages/domain`, `apps/web` renders it; each with a test red before the fix (R4 is a pure recomposition whose two existing assertions are the guard). No seed, op, contract or document change.

## Boundaries & Constraints

**Always:** derived text and rules in `packages/domain` (`apps/web` never decides which field accepts N/A nor composes a row name); static surface copy in `apps/web/src/copy/pt-br.ts` with new sentences marked `// authored (fx17r, open for Bruno)`; every string the standard template renders today stays byte-identical (the e2e specs listed in the Code Map assert them); code and comments in English, UI copy pt-BR; no emoji; tests red before the fix, run in the tools container.

**Never:** no seed, op, contract or `CONTRACT_VERSION` change; `tokens.css`, `components.css`, the mocks, `docx.ts`, `layout.ts` and the Porto Seguro goldens untouched; do not change the `cameraApp &&` condition of the guard (`camera-session.tsx:161`, ledger row R1, not this batch); do not touch `sprint-status.yaml`, `epics.md`, `source-deltas.md`; do not change the visible ratio table or its cards (the fix is the accessible name only); do not change the cabine number fields' or the altitude's N/A control (no oil rule there); do not copy material from `docs/context/`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| G1 kernel, excused field | v6+ TC/TP/transformer with `tipo_de_isolacao` EPÓXI or Á SECO (typed or by `config.subtype`), field `vol_oleo` (any key of `oil_rule.fields`) | `nameplateAcceptsNotApplicable(block, 'vol_oleo') === false`; `isNameplateFieldExcused(...) === true`; `nameplateMissingKeys` still omits it | none |
| G1 kernel, oil or unknown unit | same block on ÓLEO, or nothing stored and no subtype | `nameplateAcceptsNotApplicable === true` for every nameplate field | none |
| G1 kernel, non-oil field | EPÓXI unit, `potencia_nominal` | `true` | none |
| G1 kernel, v1-v5 dry block | v1-v5 block `isDryBlock`, `vol_oleo` | excused, `false` (the same skip `nameplateMissingKeys` applies today); other fields `true` | none |
| G1 web, excused | NameplateSection on a dry v6 transformer | no "Marcar Vol. óleo como não aplicável" button and no `.field-na-row` under `[data-field-key="vol_oleo"]`; the control stays beside Potência nominal | typed "n.a" in the excused field is refused as in any number field without the flag (helper, no commit): one predicate, one line |
| G1 web, back to oil | the same sheet picks ÓLEO | the control is back beside Vol. óleo on the next render | none |
| G2, blank TAP | transformer ratio table, `tap_atual` empty or N/A | cell names "V primário", "H1-H3 / X1-X0" (the column alone); `measurementCellName('', 'V primário') === 'V primário'`, also for `'  '` | none |
| G2, typed TAP | `tap_atual` "5" | "5, V primário" (unchanged); a TP row "Fase R, V primário" (unchanged) | none |
| R4, both forms | NC row + failed ratio on Sem restrições / failed ratio alone | "Há itens não conformes e relação de transformação insatisfatória em Fase R" / "Há relação de transformação insatisfatória em Fase R" (byte-identical to today) | none |
| R5, blank non-TAP label | a failed ratio row whose `label` is '' or '  ' on a table whose first header is not TAP | `label: 'Linha N'`, N the row's 1-based index (`row.row + 1`) | none |
| R5, TAP branch | blank / "5" | "TAP" / "TAP 5" (unchanged) | none |
| R11, no hint | `useCamera(..., { shotTarget: () => null })`, "Câmera do aparelho" on, press | toast `copy.photos.noTargetToast` (authored); never `failedToast`; no picker click | none |
| R11, hint | `shotTarget: () => null, shotHint: () => 'X'` | toast "X" (unchanged) | none |
| R18, section 7 present | standard template | gallery `.gallery-geral-note` and the "Geral" radio read today's strings byte-identical | none |
| R18, section 7 absent | compact snapshot without `section_7` | note: 'Fotos tiradas aqui entram como Geral e ficam só na galeria (o relatório não tem a seção "Registro fotográfico"); as fotos de um equipamento ou de um local saem só na ficha ou no local.'; radio: 'Geral — só na galeria (serviços gerais)' | none |

</intent-contract>

## Code Map

**G1 (QA G1)**
- `packages/domain/src/relatorio/dry-insulation.ts` L95-125 `nameplateMissingKeys` -- holds the two excuse skips (v1-v5 `dry && field.key === OIL_VOLUME_FIELD_KEY`; v6+ `ruled && isOilFieldExcused(block, field.key)`). Extract them into `export function isNameplateFieldExcused(block: BlockRow, fieldKey: string): boolean` (needs `definitionOf(block)`; false with no definition) and read it from `nameplateMissingKeys`; add `export function nameplateAcceptsNotApplicable(block: BlockRow, fieldKey: string): boolean { return !isNameplateFieldExcused(block, fieldKey); }` with a doc comment naming Story 16.4/17.3 and QA G1 ("an excused field prints '-' whatever is stored, so it offers no N/A"). `isOilFieldExcused` stays in `oil-rule.ts` (section-9 reads it). Exported through `packages/domain/src/index.ts` L72-ish (`export *`).
- `packages/domain/src/relatorio/oil-rule.test.ts` (block builders L60-140, describe "matrix Dry from start" L182) -- add one `it` for the predicate: dry v6 transformer/TP/TC (typed and by subtype) `false` for every `oil_rule.fields` key and `true` for `potencia_nominal`; ÓLEO and unknown `true` for all; a v10 TC on EPÓXI (`getDefinition('v10', 'cabine_primaria', 'tc')`) `false` for its oil fields; a v1-v5 dry block `false` for `vol_oleo` (see `dry-insulation.test.ts` for a v1-v5 dry builder, or build via `isDryBlock`'s rule).
- `apps/web/src/surfaces/ficha/nameplate-section.tsx` L425 `acceptsNotApplicable` (unconditional) -- `acceptsNotApplicable={nameplateAcceptsNotApplicable(block, field.key)}`; import from `@app/domain` (import block L1-36). `cabine-block.tsx` L143 stays unconditional (no oil rule on the cabine).
- `apps/web/src/surfaces/ficha/ficha-fields.tsx` L250 (prop doc) -- one sentence: the flag is the kernel's `nameplateAcceptsNotApplicable` on the plate. No logic change (L385 already hides the row when false).
- `apps/web/src/surfaces/ficha/nameplate-oil-rule.test.tsx` (harness: `block(sheet, type, subtype)` L45, `snapshotOf`, describe "14.11 the oil rule on the nameplate" L184; the "dry unit ... VOL. ÓLEO is not missing" case L185) -- add one `it`: a dry unit renders no `button[name="Marcar Vol. óleo como não aplicável"]` and no `.field-na-row` under `[data-field-key="vol_oleo"]`, while `[data-field-key="potencia_nominal"]` has its control; an oil unit (`oilUnit()`) has the Vol. óleo control. (Spec label: `screenLabel('VOL. ÓLEO')` is what the button name carries; read the exact name from `not-applicable-button.tsx` in `apps/web/src/components/`.)
- `apps/web/src/surfaces/ficha/ficha-fields.test.tsx` L466 -- already covers "without the flag: no control, N.A refused"; add no duplicate. If a case is wanted there, drive `accepts` from `nameplateAcceptsNotApplicable` on a dry block built like `nameplate-oil-rule.test.tsx`'s.
- `e2e/oil-dry.spec.ts` 14.11-E2E-001 L114-124 (helpers `field`, `missingMarker` L47-50; the control's name pattern is `naControl` in `e2e/na-number-field.spec.ts` L43: `getByRole('button', { name: 'Marcar <Label> como não aplicável', exact: true })`) -- after `pick Á SECO`: the control for Vol. óleo has count 0 and the one for Potência nominal count 1; after `pick ÓLEO`: Vol. óleo's control count 1. Keep the spec's title; add a clause to it.

**G2 (QA G2)**
- `packages/domain/src/relatorio/reading-cells.ts` ~L171 (beside `readingLabelText`) -- add `export function measurementCellName(rowLabel: string, column: string): string`: `rowLabel.trim() === '' ? column : `${rowLabel}, ${column}``; doc: "the accessible name of a Measurement cell ('Fase A, 1 minuto'); a row with no label yet (the transformer's TAP Nº before TAP atual is typed) names the cell by its column alone (QA G2)". Re-export in `packages/domain/src/relatorio/readings.ts` L10-27.
- `apps/web/src/copy/pt-br.ts` L1341-1342 `cellLabel` -- delete (its only readers are the three below); the comment goes with it.
- `apps/web/src/surfaces/ficha/ensaios-section.tsx` L341, L346, L356 -- `measurementCellName(screenLabel(row.label), screenLabel(cell.column))` in place of `t.cellLabel(...)`; import from `@app/domain`.
- `packages/domain/src/relatorio/readings.test.ts` (describe near L414 `readingLabelText`) -- cases: '' and '  ' give the column; '5' gives "5, V primário"; 'Fase R' gives "Fase R, V primário".
- `e2e/ratio-feeds-conclusion.spec.ts` L36-49 (`cellInput(page, name)` L30 exact-name textbox) -- before `tap.fill('5')`, open Ensaios and assert `cellInput(page, 'V primário')` visible and `page.getByRole('textbox', { name: /^, / })` count 0, then return to the plate step (the stepper buttons, as L46) and continue; or do it in `e2e/ficha.spec.ts` UX-F42 L636-646 (`@p1`). One of the two, the `@p0` one preferred.

**R4**
- `packages/domain/src/relatorio/conclusion.ts` L112-132 -- `ratioWarningText` becomes `ratioRestrictionClause(rows)` = `relação de transformação insatisfatória em ${listPtBr(...)}` (no "Há "); `restrictionWarning` returns `Há ${clause}` or `Há itens não conformes e ${clause}`; no `.slice`. Keep the `// authored (Story 17.5, open for Bruno)` comments. Guard: `conclusion.test.ts` L571-581 (B2) asserts both forms verbatim; run it before and after (green both times; the diff is the composition).

**R5**
- `packages/domain/src/relatorio/reading-evaluation.ts` L387-396 -- one fallback for both branches: `const blank = row.label.trim() === ''; const label = tap ? (blank ? 'TAP' : `TAP ${row.label}`) : blank ? `Linha ${row.row + 1}` : row.label;` with `// authored (fx17r, R5): a connection row with no label is named by its 1-based position`. `row.row` is the 0-based row index (readings.test.ts L582-585 builds `[row, col, cell]` with 0 → "Fase R").
- `packages/domain/src/relatorio/readings.test.ts` describe '17.5-UNIT failedRatioRows' L581 -- add: evaluate the TP with a failed row, blank the rows' `label` (`'  '`) on the evaluation's tables, expect `['Linha 1']`; with two failed rows (L592) `['Linha 1', 'Linha 3']`; the TAP cases L631-635 unchanged.

**R11**
- `apps/web/src/copy/pt-br.ts` `photos` L876-911 -- add `noTargetToast: 'Nada mais a fotografar aqui: toda leitura desta ficha já tem foto.'` with `// authored (fx17r, R11, open for Bruno): a "Ler visor" press whose first target is gone when the caller gives no hint.` Keep `failedToast` for save failures only.
- `apps/web/src/surfaces/ficha/camera-session.tsx` L156-166 -- `showToast(shotHint?.(0) ?? copy.photos.noTargetToast)`; update the comment. `cameraApp &&` untouched. Callers for reference: `read-display.tsx` L621 (both), L733 (`shotTarget` alone, never null at 0), `panel-capture.tsx` L172 (`shotHint` alone).
- `apps/web/src/surfaces/ficha/camera-view.test.tsx` describe '17.2-UNIT' L1025-1066 (`AppHarness`, `renderApp`, `cameraApp.on = true` in `beforeEach`, picker spy pattern L1068) -- give `AppHarness` an `options` prop; add one `it`: `shotTarget: () => null` without hint → the toast reads `noTargetToast`, no `/Não foi possível/`, `HTMLInputElement.prototype.click` not called; with `shotHint: () => 'Próxima leitura: X'` → that text.

**R18**
- `apps/web/src/copy/pt-br.ts` `gallery.geralNote` L963 and `captureSheet.general` L999 -- both become `(m: Mention) => string` (type `Mention` L17): `m.prints` → today's string byte-identical; else the absent sentences of the I/O matrix. Comments: `// authored (fx17r, R18, open for Bruno): with section 7 absent the Geral photos stay in the gallery (vocabulary of gallery.note L940-943 and photoRemoveDescription)`.
- `apps/web/src/surfaces/photos/gallery-surface.tsx` L344 -- `{t.geralNote(sectionMention(snapshot, 7))}` (`sectionMention` already imported for L253; compute once as a `const mention7` if preferred).
- `apps/web/src/surfaces/photos/capture-sheet.tsx` L536 `EquipmentStep` -- `label={t.general(sectionMention(snapshot, 7))}`; `snapshot` is a prop (L449-457). Add `export` to `EquipmentStep` with `/** Exported for the unit test (fx17r, R18). */` if the test renders it directly.
- `apps/web/src/surfaces/compact-template-sections.test.tsx` (harness: `compactSectionBlocks()` L55-70, `compactDb()`, `renderAt`, the gallery case L135-140) -- add a `without7` variant (filter `section_7` too, as a parameter of `compactSectionBlocks`/`compactDb`); one `it` renders `GallerySurface` on it and asserts `.gallery-geral-note` has the absent sentence and the standard one does not appear; one `it` renders `EquipmentStep` (or the capture sheet) on a cast snapshot `{ relatorio: { id, status: 'em_campo', ... }, blocks: without7 blocks, equipment: [], locations: [], files: [], points: [], suggestions: [], instruments: [] }` (shape as `nameplate-oil-rule.test.tsx` `snapshotOf` L78-90; `useSession().database` null is tolerated by `useCaptionSources`, `photo-store.ts` L163-178) and asserts `getByRole('radio', { name: 'Geral — só na galeria (serviços gerais)' })`; and the present wording on the existing compact DB (which keeps section 7): the gallery note case L135 gains the `.gallery-geral-note` assertion with today's string, and a radio render with the full standard snapshot asserts today's label.
- Standard-template guards (no change expected, run them): `e2e/section-7-by-hand.spec.ts` L37/L89 (`GERAL_NOTE`), `e2e/gallery.spec.ts` L265/L591, `e2e/captions.spec.ts` L219/L260, `e2e/sheet-photos.spec.ts` L334/L347, `e2e/dictation.spec.ts` L63, `e2e/review-toasts-2026-10-08.spec.ts` L279.

**Ledger and log**
- `_bmad-output/implementation-artifacts/deferred-work.md` L2398-2409 (the two `scheduled` rows) -- append `done (2026-10-28, fix batch fx17r: <one clause of evidence>)` to each `state:` line by striking the `scheduled (...)` text with `~~...~~` and writing the new state beside it; never delete.
- `docs/kbs/log.md` -- one dated line for the batch (PR number unknown: say "fix batch fx17r, E17-A1").

## Tasks & Acceptance

**Execution (kernel first, each test red before its fix):**
- `packages/domain/src/relatorio/oil-rule.test.ts`, `dry-insulation.ts` -- `isNameplateFieldExcused`, `nameplateAcceptsNotApplicable`; `nameplateMissingKeys` reads the predicate.
- `packages/domain/src/relatorio/readings.test.ts`, `reading-cells.ts`, `readings.ts`, `reading-evaluation.ts` -- `measurementCellName` (G2); the `Linha N` fallback (R5).
- `packages/domain/src/relatorio/conclusion.ts` -- compose from parts (R4); `conclusion.test.ts` B2 green before and after.
- `apps/web/src/surfaces/ficha/nameplate-oil-rule.test.tsx`, `nameplate-section.tsx`, `ficha-fields.tsx` (doc) -- the plate reads the predicate (G1).
- `apps/web/src/surfaces/ficha/ensaios-section.tsx`, `apps/web/src/copy/pt-br.ts` (`cellLabel` removed) -- the kernel's cell name (G2).
- `apps/web/src/surfaces/ficha/camera-view.test.tsx`, `camera-session.tsx`, `pt-br.ts` (`photos.noTargetToast`) -- R11.
- `apps/web/src/surfaces/compact-template-sections.test.tsx`, `pt-br.ts` (`gallery.geralNote(m)`, `captureSheet.general(m)`), `gallery-surface.tsx`, `capture-sheet.tsx` -- R18.
- `e2e/oil-dry.spec.ts` (G1 clauses), `e2e/ratio-feeds-conclusion.spec.ts` or `e2e/ficha.spec.ts` (G2 clause) -- the implementer edits them and runs none (the orchestrator runs Playwright under the host lock).
- `_bmad-output/implementation-artifacts/deferred-work.md`, `docs/kbs/log.md` -- as in the Code Map.

**Acceptance Criteria:**
- Given a v6+ transformer, TP or TC on EPÓXI or Á SECO, when its Dados de placa render, then no "N/A" control stands beside Vol. óleo (nor any other `oil_rule.fields` key) while Potência nominal keeps its control; when the unit is set to ÓLEO, then Vol. óleo's control is back; `nameplateMissingKeys` is unchanged for every seed.
- Given a transformer sheet whose TAP atual is blank, when the Ensaio de relação table renders, then every cell's accessible name is its column alone (no name starts with ", "); given TAP atual "5", then the names read "5, V primário" as today; the visible table and the cards are unchanged.
- Given Sem restrições over a failed ratio row with and without an NC row, when the warning composes, then the two sentences are byte-identical to today's and no code slices an authored sentence.
- Given a failed ratio row with a blank label on a non-TAP table, when `failedRatioRows` names it, then the label is "Linha N" by its 1-based position; the TAP branch still reads "TAP" / "TAP 5".
- Given "Câmera do aparelho" on and a "Ler visor" opener whose first target is gone, when it is pressed with no caller hint, then the toast is the authored no-target sentence, never the save-failure one, and no picker opens; with a hint, the hint.
- Given a relatório without section 7, when the gallery and the capture sheet render, then the Geral note says the photos stay in the gallery only and the "Geral" radio drops the Registro fotográfico promise; given the standard template, then both read today's strings byte-identical.

## Spec Change Log

## Review Triage Log

## Verification

**Commands (in the tools container: `podman compose --profile tools run --rm --user root tools pnpm ...`; the implementer runs unit tests only, never Playwright):**
- `pnpm test:unit -- packages/domain/src/relatorio/oil-rule.test.ts packages/domain/src/relatorio/readings.test.ts packages/domain/src/relatorio/conclusion.test.ts packages/domain/src/relatorio/dry-insulation.test.ts apps/web/src/surfaces/ficha/nameplate-oil-rule.test.tsx apps/web/src/surfaces/ficha/ficha-fields.test.tsx apps/web/src/surfaces/ficha/camera-view.test.tsx apps/web/src/surfaces/compact-template-sections.test.tsx` -- green; each new case shown red on the unfixed source first (say so in the report).
- `pnpm lint`, `pnpm static` -- green.
- `grep -rn "cellLabel\|'Há '.length" apps/web/src packages/domain/src` -- no hits.

## Auto Run Result
