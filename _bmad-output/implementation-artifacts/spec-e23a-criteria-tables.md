---
title: 'e23a: criteria as data: seed v13, the NETA tables, the manufacturer value, the instrument limit (Stories 23.2, 23.3, 23.4; contract 34)'
type: 'feature'
created: '2026-11-08'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-23-context.md'
  - '{project-root}/AGENTS.md'
warnings: ['batched', 'oversized']
# batched: the three stories share one data set (the criterion a reading is judged by): 23.3's manufacturer value replaces the criterion 23.2 picks, and 23.4's limit rule compares the instrument limit with it (epic-23-context.md "Why these groupings").
deferred: []
---

<intent-contract>

## Intent

**Problem:** Every insulation reading is judged against one number (> 400 MΩ, `seed/criteria.ts`) whatever the equipment; the sheet has no place for the manufacturer's value (`criterion_override` exists in the kernel with no surface and no validation); and an over-range reading on a healthy winding prints with no note. Bruno's base rev08 asks for the NETA tables, the manufacturer's value prevailing, and the standard instrument-limit observation.

**Approach:** Seed v13 (opened equal to v12 in commit `027d916c`, already pushed; never rewrite it) gains optional test keys that pick a per-row criterion from the NETA Tables 100.1 and 100.5 carried as seed data, and flag the instrument-limit note. The kernel judges each row by its own criterion, a well-formed `criterion_override` (the manufacturer's value) prevails on every row of its test and is validated in `applyOp` (contract 34), and the ficha gets the approved "Valor do fabricante" control. v1 to v12 definitions read and print exactly as before.

## Boundaries & Constraints

**Always:**
- Every new behaviour is reached through a v13 definition key; a v1-v12 definition gives today's result in every reader (AD-21). The layout-lock goldens (`apps/api/src/jobs/generate/golden/layout-lock-{v5,v11,v12}/`, tests `docx-layout-lock.test.ts`, `layout-lock.integration.test.ts`) and the Porto Seguro goldens stay byte-equal. If anything would move them, STOP and report: never regenerate them.
- Ownership (AD-1/AD-13): the criterion picked, the texts (helper, source, note, refusal, manufacturer notes), the per-row ACEITÁVEL and the IP N/A are computed in `packages/domain`; `apps/web` renders and writes ops only. New pt-BR strings per AGENTS.md "Where a new user-facing string goes"; mark every authored one `// authored (Story 23.x, listed for Bruno)`.
- Standard values only from public NETA MTS-2023 Tables 100.1 and 100.5, each row with its limits, source `{name: 'ANSI/NETA MTS', edition: '2023'}` and status `'CONFIRMADO'` (the base's four statuses: `CONFIRMADO`, `CONFERIR NA NORMA`, `FABRICANTE`, `PADRÃO FASOR`). Cite base rows by ID in comments (e.g. "Base rev08 TR-SE-02"); never copy procedure or recommendation texts. The one base text taken is decision F's standard observation (below).
- Screens built from `mockups/prototype/screens/60-ficha.html` (#/ficha/TR1, lines 893-940) with its class names (`.v13-mfr`, `.mfr-op`, `.mfr-note`, `.mf-value`, `.mf-unit`, `.btn-text`); its `[data-route="/ficha/:tag"] .v13-mfr` rules (lines 245-251) are translated into `apps/web/src/surfaces/ficha/ficha.css` with a comment naming the mock rule, declarations verbatim.
- Shared with batch e23b (stacked on `027d916c`): keep edits to `seed/v13.ts`, `seed.test.ts`, `seed/schema.ts`, `relatorio/reading-evaluation.ts`, `print/section-9.ts`, `ficha/ensaios-section.tsx`, `contract/version.ts` additive and in their own clearly commented blocks.

**Never:**
- No temperature correction (23.5), no restriction bands or comparisons (23.6), no applicability (23.9), no TP table judging (TP-02, open item B-4: the v13 TP keeps > 400 MΩ), no cable table (CB-02 keeps > 400 MΩ), no per-row measurement-test manufacturer value (14.13 OQ1), no reference-to-manual field (14.13 OQ2).
- No change to `formatCriterionValue`'s output for an existing criterion, nor to `withPreviousColumn`'s output.
- No limit is seeded for the instrument (the limit stays the picked instrument's registry value).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Dry TF, 100.5 | v13 TF, TIPO DE ISOLAÇÃO EPÓXI, AT 13,8 kV, BT 380 V | rows 0-1 (winding AT) `>= 25000 MΩ`; row 2 (BT) `>= 500 MΩ`; helpers name "Tabela 100.5 (ANSI/NETA MTS-2023)", seco | none |
| Oil TF | same, ÓLEO MINERAL | AT `>= 5000 MΩ`, BT `>= 100 MΩ` | none |
| Bound | winding 5000 V / 5001 V / 600 V / 601 V | 5000 V takes the 5000 row; 5001 V the next; same at 600 | none |
| Missing rating | v13 TF with AT empty or not a positive number | rows 0-1 judged by the v12 criterion (> 400 MΩ, "aceitável na ficha"), helper asks for the rating | none |
| Missing medium | v13 TF/TC, TIPO DE ISOLAÇÃO empty | every row by the v12 criterion, helper asks for TIPO DE ISOLAÇÃO | none |
| TC | v13 TC, Á SECO, AT 13,8 kV | every row `>= 25000 MΩ` (100.5 seco, primary voltage) | none |
| DJ/SC/PR | v13 disjuntor TENSÃO NOMINAL 15 (kV class) | every row `>= 5000 MΩ` (100.1 row up to 15000 V); 24,2 kV → 10000; 36,2 kV → 100000 | none |
| TP, cables, QGBT | v13 | as v12 (> 400 MΩ; QGBT bands) | none |
| Manufacturer | v13 DJ contact, `criterion_override {raw:'80', unit:'µΩ'}` | every row `< 80 µΩ`, source "Fabricante"; header ACEITÁVEL `<80 µΩ (fabricante)` | none |
| Manufacturer on a table test | v13 dry TF, override `{raw:'5', unit:'GΩ'}` | every row `>= 5 GΩ`; the table minimum shows beside it as a reminder | none |
| Refused value | override raw '-3', '0', 'abc', or unit 'V' on an MΩ test | `applyOp` throws `SeedPathError` (api `op_invalid`); the control shows the authored refusal, writes nothing | inline message |
| Clear | put `null` | the table / seeded criterion again | none |
| Over range, limit meets | v13 dry TF min 25000 MΩ, instrument limit 2 TΩ, "OL" | within; note "Valores de resistência de isolamento superiores a 2 TΩ, limite de leitura do instrumento." under the table (screen and print); floor Sem restrições; that row's POLARIZAÇÃO prints "N/A" | none |
| Over range, limit below | limit 1 GΩ, min 5000 MΩ | out, as PR #268; no note for that cell | none |
| v12 sheet | any of the above on v12 | unchanged (no note, no N/A, no table); the manufacturer control works on v12 too (Story 23.3 DoR) and prints nothing new while empty | none |

</intent-contract>

## Code Map

- `packages/domain/src/seed/v13.ts` -- v13 = v12 today; add the keys per type here (derive, never retype).
- `packages/domain/src/seed/schema.ts:218` `testDefSchema` -- add optional `criterion_table` and `instrument_limit_note` (never defaulted, so v1-v12 parse byte-equal); `checkSeedV6Definition` (~271) -- add reference checks for them.
- `packages/domain/src/seed/criteria.ts` -- `criterionSeedSchema` (add optional `text`, see Design), `formatCriterionValue` (returns `text` when present, nothing else changes), `compareCriterion`.
- new `packages/domain/src/seed/criteria-tables.ts` -- the two tables as data (zod schema + constants `NETA_100_1`, `NETA_100_5`), exported from `src/index.ts`.
- `packages/domain/src/relatorio/reading-evaluation.ts` -- `criterionOf` (43), `voltsOf` (52), `effectiveCriterion` (108, the override path), `evaluateTable` (180), `evaluateTest` (403), `outHelperText` (140).
- `packages/domain/src/relatorio/reading-cells.ts` -- `EvaluatedRow`, `TestEvaluation` types (add optional fields only).
- `packages/domain/src/relatorio/oil-rule.ts` -- read the oil rule to pick oil/dry; `relatorio/row-voltage.ts` -- `voltage_rows[r].winding`; `registry/word-row.ts` `parseVoltageClassKv` -- a voltage_class value ('13,8', '15') to kV.
- `packages/domain/src/relatorio/over-range.ts` `overRangeVerdict` -- unchanged rule (limit >= criterion within, below out); the note composes the limit text from the cell's raw/unit.
- `packages/domain/src/relatorio/reading-run.ts:120` `worstReadings`, `relatorio/conclusion.ts:160-412`, `points/derived.ts:143` -- consumers of `test.criterion` / `criterionText`; must use the row's criterion where rows carry one.
- `packages/domain/src/print/section-9.ts` -- `instrumentPart` (482, ACEITÁVEL), `testParts` (926), `withPreviousColumn` (897, generalize behind it without changing its output), `printColumnText` (644, POLARIZAÇÃO), paragraph `SheetPart` (151).
- `packages/domain/src/ops/apply.ts:451` `assertSeedPath` -- validate a `sheet/test` `criterion_override` put on a seeded test; `ops/over-range-ops.test.ts` is the refusal-test precedent.
- `packages/domain/src/merge/conflicts.ts:305` -- the existing "Critério" conflict; check the two values read as manufacturer text (e.g. `<80 µΩ`), not JSON.
- `packages/domain/src/types/duplicate.ts`, `types/draft-edit.ts` (~226, ~334), `types/validate.ts` (~143) -- a company copy carries the v13 keys; a removed nameplate field drops the `criterion_table` that names it; validation message in pt-BR.
- `packages/domain/src/contract/version.ts:372,582` and `contract/contract.test.ts:102` -- 34/34.
- `apps/web/src/surfaces/ficha/ensaios-section.tsx` -- `TestSection` (261), `MeasurementTable` (346; `notice` slot right under `.mt-title-row`, `.mt-criterion` 419, `.mt-source` 427). `ReadingCell`/`measurement-field` input patterns live beside it (reuse the existing number entry and unit cycle).
- `apps/web/src/copy/pt-br.ts` (`copy.ficha.ensaios`) -- static label "Valor do fabricante", "Limpar".
- `apps/api/src/sync/sync.integration.test.ts` -- the refused-value integration test pattern (search "op_invalid").
- e2e: `e2e/over-range.spec.ts` (22.10), `e2e/seed-v12.spec.ts` (pinned to v12), `e2e/support/relatorio-seed.ts` (`newRelatorioDrafts`), `e2e/support/groups.ts` (`SERIAL_SPECS`).

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/seed/criteria-tables.ts` -- schema `criterionTableSchema` and the data: 100.1 rows (up_to_v 250, 600, 1000, 2500, 5000, 8000, 15000, 25000, 34500, null) with test_voltage_v (500, 1000, 1000, 1000, 2500, 2500, 2500, 5000, 5000, 5000) and min_mohm (25, 100, 100, 500, 1500, 2500, 5000, 10000, 100000, 100000); 100.5 rows (600, 5000, null) with test_voltage_v (1000, 2500, 5000), oil (100, 1000, 5000) and dry (500, 5000, 25000). Every row: unit 'MΩ', source, status. -- NFR-14: the numbers live in the seed module only.
- `packages/domain/src/seed/schema.ts` -- `criterion_table: { table: CriterionTable (rows inline, so the seed hash covers them and a company copy is self-contained), voltage: 'winding' | { field: seedKey }, medium?: 'oil_rule' }` and `instrument_limit_note?: true`; refinements: medium needs rows with oil and dry, no medium needs `min`; `voltage: 'winding'` needs `voltage_rows` on every table; `voltage.field` is a number (V or kV) or voltage_class field; medium needs an `oil_rule`. -- schema change optional only.
- `packages/domain/src/seed/v13.ts` -- TF isolacao `{100.5, 'winding', 'oil_rule'}` (rev08 TR-OL-02, TR-SE-02); TC isolacao `{100.5, {field:'tensao_nominal_at'}, 'oil_rule'}` (TC-02); disjuntor_mt `{100.1, {field:'tensao_nominal'}}` (DJ-02), chave_seccionadora `{100.1, {field:'tensao_de_placa'}}` (SC-02), para_raio `{100.1, {field:'tensao_nominal'}}` (PR-02); `instrument_limit_note: true` on the insulation test of the eight base types (cabos_entrada, para_raio, chave_seccionadora, disjuntor_mt, tp, tc, cabos_saida, transformador_forca; not the QGBT types). -- Stories 23.2, 23.4.
- `packages/domain/src/seed/seed.test.ts` -- the v13 describe: strip each v13 key and `toBe(JSON.stringify(v12))`; re-pin `V13_HASH`; every table row has source, edition and one of the four statuses; v1-v12 hashes unchanged. -- DoD 23.2.
- `packages/domain/src/relatorio/reading-evaluation.ts` -- export `rowCriterion(block, definition, test, row)`; `evaluateTable` judges each row by it; `EvaluatedRow` gains optional `criterion`, `criterionText`, `criterionHelper` (present only on a test with `criterion_table` or a manufacturer value); `TestEvaluation` gains optional `perRow: true` (rows differ), `manufacturer` view (below) and `limitNote: string | null` (only with `instrument_limit_note`). `TestEvaluation.criterion`/`criterionText` = the common row criterion when uniform, else the first row's criterion and the authored text `por linha`. Rows of a fallback get v12's criterion. -- Stories 23.2, 23.3, 23.4.
- `packages/domain/src/relatorio/reading-run.ts`, `conclusion.ts`, `points/derived.ts` -- where a row carries `criterion`, rank and name by it (worst = lowest ratio reading/minimum for `>`/`>=`, highest for `<`); unchanged when absent. -- correct worst reading text on v13.
- `packages/domain/src/print/section-9.ts` -- ACEITÁVEL: uniform → row text; manufacturer → `${text} (fabricante)`; per row → header `POR LINHA` (authored) and an `ACEITÁVEL` column appended to each table (before MANUT. ANTERIOR) through a generalized helper that `withPreviousColumn` also uses (its output unchanged); `limitNote` → a paragraph part after the test's last table; POLARIZAÇÃO prints `N/A` on a row whose 1 MINUTO capture is `over_range` when the test has `instrument_limit_note`. -- Stories 23.2-23.4 print.
- `packages/domain/src/ops/apply.ts` -- `assertSeedPath`: a `sheet/test` `criterion_override` put on a seeded test is refused (`SeedPathError`) unless its value is null or `{raw, unit}` with `raw` a positive dot-decimal and `unit` (string or null) that `scaleToUnit` converts to the test's criterion unit (the table unit 'MΩ' for a table test). Kernel `parseManufacturerValue(test, typed, unit)` gives the same answer to the screen with the authored refusal text. -- Story 23.3 "refused, never ignored".
- `packages/domain/src/types/*` -- duplicate carries `criterion_table`/`instrument_limit_note`; removing the named field drops `criterion_table`; validate names it in pt-BR.
- `packages/domain/src/contract/version.ts` -- 34 and MIN 34 with the dated paragraphs (a v33 bundle cannot resolve seed v13; the fold now refuses a malformed criterion override). `contract.test.ts` updated.
- `packages/domain/src/**/*.test.ts` -- kernel tests: each table at its bounds (600/601, 5000/5001, 15000/15001, null last row), missing rating, missing medium, each type of the matrix, manufacturer on each grammar (insulation table, contact, ratio ±, the QGBT band test), clear, refusal (negative, zero, malformed, wrong unit), limit equal to the criterion, one unit below it, missing limit, IP N/A, the note; section 9 print tests on v13 sheets (uniform, per row, manufacturer, note, N/A) and a v12 sheet unchanged.
- `apps/web/src/surfaces/ficha/ensaios-section.tsx` (+ `ficha.css`, `copy/pt-br.ts`) -- per seeded test (every seed version), a `.v13-mfr` block in the first table's notice slot: label "Valor do fabricante", operator sign (`.mfr-op`, aria-hidden), the number entry with the criterion's units (`.mf-unit`, the Ω cycle where the unit is Ω-scale), the kernel's `.mfr-note`, a "Limpar" `.btn-text` while set; the refusal as the field's helper (`data-tone="red"`), nothing written; one op `sheetTestPath(block, test, 'criterion_override')` on commit (blur/Enter), `null` on Limpar. `.mt-criterion` and `.mt-source` show the kernel's texts (source details list the per-row helpers on a v13 table test). The limit note as `p.helper[data-limit-note]` under the table. Not hidden under the Sticky action bar at 768 px (e23f pitfall: scroll into view on focus as the existing fields do). Read-only sheet: shows the value, no input.
- `apps/api/src/sync/*.integration.test.ts` -- a malformed override pushed through the sync route answers `op_invalid`; a well-formed one and a null clear are accepted; a v33 client pull answers 426.
- `e2e/manufacturer-value.spec.ts` (new, `@p0`) -- v13 disjuntor: type 80 µΩ offline, reload, sync, contact rows judged `< 80 µΩ` (assert the outbox op value), DOCX ACEITÁVEL `<80 µΩ (fabricante)`; clear brings the default; a refused value shows the message and writes no op; 390 px fit of the control. `e2e/criteria-tables.spec.ts` (new, `@p0`) -- v13 dry TF 13,8 kV / 380 V: AT and BT rows judged by 100.5 seco (one out, one within), helper names the table and edition, DOCX prints per-row ACEITÁVEL; "OL" with a 2 TΩ instrument: within, note on screen and in DOCX, POLARIZAÇÃO N/A, conclusion Sem restrições; a 1 GΩ limit against 5000 MΩ is out. Both read every number from the kernel. Specs that time taps go in `SERIAL_SPECS`.
- Existing specs that type a voltage or a criterion on a v13 sheet (list in Verification) -- run; where a v13 verdict changes by design, assert the kernel's value or pin the spec to v12 with a comment, never weaken.
- Docs -- `ARCHITECTURE-SPINE.md` dated note under AD-21 (a criterion picked from a seed table carries edition and status); `source-deltas.md` rows of 23.2, 23.3 (14.13) and 23.4: "planned" → built record (strike-through + dated text); `docs/kbs/architecture/kernel-and-seed.md` and `docs/kbs/log.md`; `deferred-work.md` under "Epic 23 batch e23a".

**Acceptance Criteria:**
- Given the layout-lock and Porto Seguro goldens, when the batch's head runs `test:api`, then `docx-layout-lock.test.ts`, `layout-lock.integration.test.ts` and `docx.test.ts` pass with no golden file changed (`git diff 027d916c -- apps/api/src/jobs/generate/golden` empty).
- Given a new relatório (v13) with a dry TF AT 13 800 V / BT 380 V, when its insulation evaluates, then AT rows use 100.5 seco for 13 800 V, BT the 600 V row, each row's helper names the table and its edition; with ÓLEO MINERAL the oil column applies.
- Given a v13 disjuntor of class 15 kV, when its insulation evaluates, then 100.1's 15 000 V row applies; a v13 TP and cable are judged at > 400 MΩ.
- Given a v13 disjuntor, when 80 µΩ is typed on the contact test, then one `applyOp` op stores it, every reading is judged by < 80 µΩ, the helper names "Fabricante", and clearing it brings < 250 µΩ back; on a dry TF a manufacturer value replaces every row's minimum and the table's shows beside it.
- Given a malformed, negative or unconvertible value, when typed, then it is refused inline and through the sync route (`op_invalid`), never stored.
- Given two devices with different manufacturer values on one test, when they sync, then the "Critério" conflict asks for the single-cell choice and its two values read as criterion texts.
- Given generation of a sheet with a manufacturer value, then ACEITÁVEL prints it followed by " (fabricante)" under both section 9 schemes.
- Given a v13 dry TF (minimum above 5 GΩ) and a 2 TΩ instrument, when "OL" is typed, then the row is within, the note shows under the table on screen and in print, the IP prints N/A and the floor stays Sem restrições; with a 1 GΩ limit against 5 GΩ the row is out.
- Given a v12 or v5 sheet, when it evaluates and prints, then nothing changes and the layout lock holds.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Row criterion.** `rowCriterion` order: manufacturer value (well formed) → table row (rating and medium readable) → v12 criterion (`criterionOf(test)`, with `criterionHelper` = fallback text). Table row as a `CriterionSeed`: `{key: seeded.key, label: seeded.label, operator: '>=', value: min, unit: 'MΩ', type: 'absolute_min', source: {name: 'ANSI/NETA MTS-2023, Tabela 100.5', edition: '2023'}, usedBy: seeded.usedBy, text: '≥ 25.000 MΩ'}` (NETA: approved at the minimum; `text` grouped pt-BR). Medium: the oil rule's field value in `oil_values` → oil; any other option → dry; empty → fallback. Manufacturer on a table test: operator `>=`, else the seed's (`effectiveCriterion`), source `{name: 'Fabricante', edition: null}`.
- **Authored texts (list each in the PR):** fallback helpers `Sem a tensão nominal na placa, vale {crit}. Informe-a para julgar pela {Tabela 100.x}.` and `Sem o tipo de isolação na placa, vale {crit}. Informe-o para julgar pela Tabela 100.5.`; row helper `{Tabela 100.5} (ANSI/NETA MTS-2023), {seco|óleo}, {voltage}: {crit}`; `por linha` / `POR LINHA`; manufacturer notes from the mock (`Prevalece sobre a tabela, que pede {crit}.`, `Prevalece sobre o critério do ensaio, {crit}.`, `Opcional. Vazio, vale {crit}, o critério do ensaio.`, `Opcional. Vazio, vale a tabela ({crit}).`); source line `Fabricante — digitado nesta ficha, vale para todas as linhas deste ensaio.`; refusal `Valor do fabricante inválido: digite um número maior que zero.` and `Unidade incompatível com o critério ({unit}).`; print suffix ` (fabricante)`; IP `N/A`. The note text is the base's (decision F) with the limit from the cell: `Valores de resistência de isolamento superiores a {2 TΩ}, limite de leitura do instrumento.`
- **Why no shape change for `criterion_override`:** every filled override is the manufacturer's (decision G, one per test), so `{raw, unit}` stays; the source is named from the field. Contract 34 is the fold refusal plus seed v13 (a v33 bundle cannot resolve it), hence MIN 34.

## Verification

**Commands (tools container, `--user root`; restart the api first after domain changes):**
- `pnpm lint`, `pnpm static` -- 0.
- `pnpm test:unit` and `pnpm test:api` -- green; layout-lock and Porto Seguro goldens unchanged.
- Touched specs under the host lock (`lockf -t 20000 /tmp/fasor-verify.lock`): `pnpm exec tsx scripts/e2e.ts e2e/manufacturer-value.spec.ts e2e/criteria-tables.spec.ts e2e/over-range.spec.ts e2e/over-range.durability.spec.ts e2e/seed-v12.spec.ts e2e/ficha.spec.ts e2e/points-derived.spec.ts e2e/conflicts.spec.ts e2e/merge.spec.ts e2e/oil-dry.spec.ts e2e/dry-transformer.durability.spec.ts e2e/sheet-knows-12-3-12-4.spec.ts e2e/journeys-12-3-12-4.spec.ts e2e/journey-taps.spec.ts e2e/review-field-defects.spec.ts e2e/review-field-defects-2.spec.ts e2e/review-layout-interaction-2026-10-08.spec.ts e2e/plate.spec.ts e2e/plate-units-years.spec.ts e2e/keyboard-salvo.spec.ts e2e/company-type-sheet.spec.ts e2e/company-type.durability.spec.ts e2e/type-editor.spec.ts e2e/previous-visit.spec.ts e2e/document-pages.spec.ts e2e/review-concluir-text.spec.ts e2e/suggestions.spec.ts --project desktop-chrome --project durability-desktop-chrome`.
- Durability specs touched by a live query on the ficha (`over-range.durability`, `dry-transformer.durability`, `ficha.durability`) also on `pnpm test:e2e:matrix` with the spec paths.
