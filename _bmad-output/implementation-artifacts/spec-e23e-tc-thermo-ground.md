---
title: 'e23e: test-voltage defaults, TC and TP polarity and function, thermography on the eight types, the Malha de aterramento (Stories 23.13, 23.18, 23.20, 23.21; contract 39)'
type: 'feature'
created: '2026-11-09'
status: 'done'
baseline_revision: '9351c73bf0d5e6cedd33c71095c3e2589bcd46d0'
review_loop_iteration: 0
followup_review_recommended: true
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-23-context.md'
warnings: ['batched', 'oversized']
batched_reason: 'Epic 23 wave 3 lane e23e (epic-23-context.md batch plan): the other new grammar pieces (a failing choice, band tables, a design-value maximum), the per-type voltage defaults and the one new closed-enum type share seed v13, SUB_BLOCK_KEYS, EQUIPMENT_BLOCK_TYPES and one contract bump (39).'
deferred: []
---

<intent-contract>

## Intent

**Problem:** On seed v13 (the version every new relatório takes) the disjuntor, seccionadora, TC, TP, para-raio and cables' insulation rows start at the instrument's voltage instead of decision D's default; the TC and TP ratio test records no polarity, the TC has no FUNÇÃO and no S classes, and nothing says a ratio check is not an accuracy test; no base type has a thermography test; there is no grounding-grid sheet.

**Approach:** Four v13-only additions, each reached through a v13 definition key (AD-21), in one fenced `// --- e23e: Stories 23.13, 23.18, 23.20, 23.21 ---` section of `seed/v13.ts` applied after e23t's: a table key for voltage defaults; a seeded-table choice column that fails (polarity) plus the TC's FUNÇÃO, S classes, a faturamento notice and a printed note; a measurement test `termografia` judged by a band table, NA by a test value; a library type `malha_aterramento` with two measurement tests, one judged by a design-value maximum. Contract 39 and MIN 39; plate prompt `bedrock-structuring-8`.

## Boundaries & Constraints

**Always:**
- Base: this branch is stacked on batch e23t (`7424771d`, contract 38, not yet on main). Build on its measurement-grammar three levels (`phase_deviation`, `verdict: 'restricted'`, `restrictedMeasurements`, `sheet-run.ts`) instead of re-creating them.
- AD-21: v1 to v12 parse, evaluate, print and hash to the same bytes; `V12_HASH` and older pins hold; re-pin `V13_HASH` only. Every new seed or grammar key is optional and never defaulted.
- Layout lock: `apps/api/src/jobs/generate/golden/layout-lock-{v5,v11,v12}/`, `packages/domain/fixtures/porto-seguro/` and `apps/api/src/jobs/generate/golden/porto-seguro-skeleton.json` stay byte-equal (`git diff 7424771d --name-status -- apps/api/src/jobs/generate/golden packages/domain/fixtures` shows additions only). If one would move, STOP and report: a defect, not a golden update. A v13 sheet prints only the deltas named here.
- AD-1/AD-13: every default, verdict, level, NA reason, notice, helper and printed text is computed in `packages/domain`; `apps/web` renders and writes ops only. Strings per AGENTS.md "Where a new user-facing string goes"; mark each invented one `// authored (Story 23.x, listed for Bruno)` and keep the list for the PR.
- Base rows cited by ID only (`Base rev08 GE-01`); never copy a procedure, recommendation or "como ensaiar" text. Numbers are the named rows' thresholds and NETA MTS-2023 Table 100.18 (a public standard). Fixtures synthetic.
- Shared lists append after e23t's entries: `SUB_BLOCK_KEYS` gains `termografia`, `resistencia_malha`, `continuidade_malha` (in that order, after `resistencia_fusiveis`); `EQUIPMENT_BLOCK_TYPES` gains `malha_aterramento` after `inspecao_qgbt`.
- A company copy ("Duplicar", `types/duplicate.ts`) of a v13 type carries every new key; the company schema (`types/definition.ts` `companyMeasurementCriterionSchema`, `companyTypeVersionDefinitionSchema`) accepts them; `removeDraftEntry` (`types/draft-edit.ts`) prunes a key naming a removed field (the e23g R2-2 pattern).
- Specs read type and sub-block lists from the kernel (`e2e/support/palette.ts`, E14-A3); a new `@p0` spec asserts the committed outbox/store state, not only the screen (E12-A6).

**Never:**
- No row-adding capability (none exists: `ops/apply.ts` `assertMeasurementCell` and `assertCellGeometry` accept seeded rows only); AT-02's "the technician can add a row" is a narrowing (see Design Notes).
- No change to the transformador de força's voltage rows, to the high-voltage notice (B-5 closed as built), to v12's accuracy-class behaviour or option matching, to FR-68 (photos never print between tables), to the CTA's `cta_termografia`, or to the type editor's offered criterion kinds (the new criteria are seed and copy only).
- No help or recommendation texts on the new tests (Story 23.12, M-1). No concessionaire registry. No paid provider: `LLM_PROVIDER`/`OCR_PROVIDER` stay `fake`; the paid eval is the coordinator's before the deploy.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| D, disjuntor | v13 DJ, TENSÃO NOMINAL class 15 kV, no typed voltage | every insulation row (both tables) defaults 5 kV, `source: 'default'`; prints 5 in TENSÃO | none |
| D, bands | rating 600 V / 601 V / 5000 V / 5001 V (each type's rating field) | 1 / 2,5 / 2,5 / 5 kV | empty or unreadable rating: the instrument's TENSÃO ENSAIO as before |
| D, TC and TP | v13 TC TENSÃO NOMINAL AT 13,8 kV; v13 TP "13,8/√3" | 5 kV (the TP's class voltage N, read as e23w's B-4 reads it) | none |
| D, para-raio | MCOV 4,99 kV / 5 kV / empty | 2,5 / 5 kV / instrument (no default) | none |
| D, cable | CLASSE U0/U "8,7/15 kV" / "3,6/6 kV" | 5 kV / 5 kV (by U) | none |
| D, typed | a typed TENSÃO cell | the typed value wins; the default never judges; the notice as v12 (rows name no winding, so none) | none |
| D, v12 | v12 DJ | instrument's voltage as before | none |
| Polarity | v13 TC ratio FASE R polarity INVERTIDA | that row out, CONDIÇÕES NÃO SATISFATÓRIO, floor Reprovado, a derived point naming "polaridade invertida" and the row; screen helper row "Polaridade invertida: a ficha fica Reprovado e gera um ponto de atenção." (mock copy) | none |
| Polarity OK / empty | OK; empty | OK passes (no effect on the ratio verdict); empty counts missing (1 per row) | a value outside the options is refused by the fold |
| FUNÇÃO | v13 TC FUNÇÃO FATURAMENTO | screen-only notice under the insulation test (authored), never printed, never blocks; MEDIÇÃO/PROTEÇÃO/empty: no notice | none |
| S class | EXATIDÃO 0,3S, ratio error 0,25 % | within; ACEITÁVEL "± 0,3 %"; 0,35 % out | none |
| P class | EXATIDÃO 5P20 / 10P20 | ± 1 % / ± 3 % (as v12's 5P/10P) | none |
| Plate class | a plate read "0,3S" on v13 / on v12 | suggests 0,3S / 0,3 (v12 has no S option, as today); "5P20" or "5P10" on v13 suggests 5P20 | none |
| Print note | v13 TC or TP sheet | under the ratio table: "Verificação de relação (não substitui ensaio de exatidão)." ; the POLARIDADE column before CONDIÇÕES; v12 prints as before | none |
| Thermography in load | v13 PR, EQUIPAMENTO EM CARGA SIM, Conexões ΔT similares 20 °C | out (> 15), floor Reprovado, derived point names "Termografia, Conexões" | none |
| Thermography bands | similares 3 / 3,1 / 15 / 15,1; ambiente 10 / 10,1 / 20 / 20,1 / 40 / 40,1 | within / restricted / restricted / out; within / restricted / restricted / restricted / restricted / out | a negative ΔT is within |
| Lowest class | similares 2 °C | within, no restriction, no observation (B-7 confirmed) | none |
| Two columns | similares 2, ambiente 25 | the row takes the worse: restricted (ambient class "monitorar") | none |
| Not in load | EM CARGA NÃO | NA with reason, cells hidden, the EM CARGA control still shown, nothing missing, absent from the DOCX; "Aplicar este ensaio" applies it | none |
| Load unknown | EM CARGA empty | NA ("needs_value"), reason asks for the load; nothing missing | none |
| Thermal photo | a photo taken from the thermography test | a sheet photo whose caption context names the test; prints in the sheet's photo block, right after the thermography table (the sheet's last) as "Imagem N: …" | none |
| Every type | palette adds each of the eight on v13 | sheet carries `termografia` (switchable, on); a v12 sheet carries none | none |
| Grid, above design | v13 Malha at a local, VALOR DE PROJETO 2 Ω, resistance 3 Ω | out, floor Reprovado, parecer follows, DOCX prints the sheet under "Outros equipamentos" after the run's other library types | none |
| Grid, no design | VALOR DE PROJETO empty, 4 Ω / 5,1 Ω | judged ≤ 5 Ω: within / out; helper says the default applies (authored) | none |
| Continuity | a point 0,6 Ω | out (> 0,5 Ω, NETA 7.13); 0,5 within | none |
| v12 palette | v12 relatório | Malha not offered; the fold refuses its block | none |
| Contract | config naming `termografia`, a Malha block create, a polarity cell | accepted at 39; a v38 client's pull answers 426 | none |

</intent-contract>

## Code Map

- `packages/domain/src/seed/v13.ts` -- fenced sections per batch; `appended()`, `withNameplateFields`, e23t's `withSubBlocks` (pattern for appending measurement tests to base types); `cabinePrimariaV13()` applies sections in order. Add the e23e section last.
- `packages/domain/src/seed/v12.ts:80-100,140-165` -- `TC_CLASSES`, `TP_CLASSES`, `exatidao()`, `classRatio`, `VOLTAGE_COLUMN`, `withVoltageColumn`; `seed/v1.ts:425-480` `ratio()`, `TP_RATIO`, `TC_RATIO` (rows FASE R/S/T; cols input, input, derived, capture, derived); `seed/v5.ts:339-395` `cta_termografia` and the CTA definition (library type shape).
- `packages/domain/src/seed/schema.ts` -- `columnDefSchema` (:120, roles, `options` refine at :150), `tableDefSchema` (:154, `voltage_rows`), `testDefSchema` (e23v/e23h keys at its end), `checkSeedV6Definition`/`checkSeedV13Definition` (reference checks per path), `blockDefinitionSchema` (`library`, `print_title`).
- `packages/domain/src/seed/measurement.ts` -- criteria union (e23t's `phaseDeviationCriterionSchema`), `appliesWhenSchema` (nameplate only today), `measurementTestShape`, `checkMeasurementTest`, `checkMeasurementDefinition`.
- `packages/domain/src/schemas/block-config.ts:38,119` -- `EQUIPMENT_BLOCK_TYPES`, `SUB_BLOCK_KEYS`.
- `packages/domain/src/relatorio/row-voltage.ts` -- `rowTestVoltage` (precedence), `ratingDefaultKv` (e22g bands: ≤600 gives null), `ratedVoltsOf`; the voltage-class and "N/√3" readers used by `reading-evaluation.ts` `rowCriterion` (e23a/e23w).
- `packages/domain/src/relatorio/accuracy-class.ts` -- `parseAccuracyClass`, `accuracyClassDeviation`; the select option matching of a read class (`seed/select-option.ts`, `reading/value.ts`, `reading/build.ts`).
- `packages/domain/src/relatorio/reading-evaluation.ts` -- `evaluateTable` (value columns loop :681 skips `print`/`voltage`), `failedRatioRows`, CONDIÇÕES; `reading-cells.ts` (`VisibleColumn.role`, `EvaluatedCell`); readers of cell verdicts: `relatorio/conclusion.ts`, `points/derived.ts`, `relatorio/parecer.ts`, `relatorio/sheet-progress.ts`, `relatorio/pre-issue.ts`, `relatorio/tap-rows.ts` `writableTableRows`, `relatorio/measurement-suggestions.ts`, `reading/display.ts`, `merge/conflicts.ts`, `ops/value-limits.ts`.
- `packages/domain/src/relatorio/measurement-evaluation.ts` -- `mark`, e23t's restricted marking (:683-735), `evaluate`, `evaluateSheetMeasurements`, `restrictedMeasurements`, run helpers; `relatorio/applicability.ts` (`testApplicability`, `outcomeOf`, reason texts).
- `packages/domain/src/ops/apply.ts:427-599` -- `assertBlockType`, `assertMeasurementCell`, `assertCellGeometry`, the seeded cell value rule; `ops/path.ts`.
- `packages/domain/src/print/section-9.ts` -- seeded table columns (:600-613 voltage column), the instrument-limit note under a table (the precedent for the print note), `measurementParts`, `sheetOf` (:1350, photos block last); `print/group-for-print.ts:296-332` (`afterFullQuadros`, library to `outros`).
- Type literals to extend: `relatorio/tag.ts:13-28` (`TAG_PREFIX`, MA), `templates/text.ts:30,55`, `types/duplicate.ts:32`, `relatorio/conclusion.ts:355`, `photos/caption.ts:26`, `apps/web/src/copy/pt-br.ts` (`composer.equipmentNames`, `subBlockLabels`), `apps/api/src/jobs/reading/kinds/plate.ts:58-77`, `apps/api/src/scripts/make-plate-fixtures.ts:81`, `jobs/reading/fixtures/README.md`.
- `packages/domain/src/contract/version.ts` -- 38's paragraphs (:423, :684); append 39 to both.
- `apps/api/src/jobs/reading/providers/bedrock.ts:74-80,220-260` -- version comment list, `plateFieldNotes`; `providers/bedrock.test.ts`; `scripts/bedrock-eval.ts` SYNTHETIC.
- Web: `apps/web/src/surfaces/ficha/ensaios-section.tsx` (seeded tables, the voltage select cell precedent), `measurement-test-section.tsx` (NA band, values, table/cards), `use-ficha-photos.ts:96` (`targetFor`, ensaios-step photo context), `nameplate-section.tsx`, `apps/web/src/styles/app.css`. Mock: `ux-designs/ux-fasor-2026-09-18/mockups/prototype/screens/60-ficha.html` lines 279-292 (`.v13-choice`, `.segmented .seg[data-value="invertida"]`, `.ficha-ttr-pol`, `.pol-helper`, `.pol-note`) and 880-888 (`#/ficha/TP-C16` TTR with the Polaridade column); MOCK-GUIDE.md § 2026-11-08 row "Choice result, Polaridade".
- e2e: `e2e/support/{palette,outbox,relatorio-seed,e23t-flow,groups}.ts`; literal holders to update: `e2e/plate-every-type.spec.ts:154` (`LIBRARY_PLATES`), `e2e/tree.spec.ts:209`, `e2e/qgbt-inspecao.spec.ts:46,123`, `e2e/relatorio.spec.ts:662`, `e2e/cta.spec.ts`, `e2e/qgbt.spec.ts`.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/seed/schema.ts` -- (23.13) `tableDefSchema.voltage_default?: { field, rule: 'rating' | 'mcov' }` (refine: only on a table with a voltage column; reference check: `rating` names a number field in V/kV, a voltage class or a select whose options read as "U0/U kV"; `mcov` a number field in kV). (23.18) `columnDefSchema.role` gains `'choice'` with `options` and `fails_on` (⊆ options), `options` allowed on `voltage` or `choice`; appended after every other value column so stored indices hold. `testDefSchema` gains `notice_when?: { field, values, text }` (reference-checked select) and `print_note?: string`. -- one v13 key per new behaviour.
- `packages/domain/src/seed/measurement.ts` -- (23.20) criterion `bands`: `{ column, bands: [{ up_to?, level: 'within'|'restricted'|'out', class, action? }], text, source, status? }` (bands ascend, last has no `up_to` and only it; inclusive `up_to`). (23.21) criterion `max_field`: `{ field, default, unit, text, default_status, source, status? }` (judged ≤ the field's number, else ≤ `default`). `appliesWhenSchema` gains a test-value form (`value: seedKey` instead of `field`, `in` over the value's option keys, `needs_value`, `unmet`, and an `empty` phrase) checked by `checkMeasurementTest` against the test's own values. Add both criteria to `companyMeasurementCriterionSchema`. -- grammar for 23.20/23.21.
- `packages/domain/src/schemas/block-config.ts` -- append `termografia`, `resistencia_malha`, `continuidade_malha` and `malha_aterramento`, with a comment naming Stories 23.20/23.21 and contract 39.
- `packages/domain/src/seed/v13.ts` -- e23e section: `voltage_default` on the insulation tables of DJ (`tensao_nominal`), SC (`tensao_de_placa`), TC and TP (`tensao_nominal_at`), cables (`classe_cabo`) with `rating`, PR (`mcov_kv`) with `mcov`; v13 TC EXATIDÃO options `0,3 | 0,3S | 0,6 | 0,6S | 1,2 | 3 | 5P20 | 10P20`; TC FUNÇÃO DO TC `funcao_tc` select `MEDIÇÃO | PROTEÇÃO | FATURAMENTO` (required, appended); the polarity column `POLARIDADE` (`OK | INVERTIDA`, `fails_on: ['INVERTIDA']`) and `print_note` on the TC and TP ratio tests; `notice_when` FATURAMENTO on the TC insulation test; `termografia` on the eight (sub-block before `observations`, last measurement test); the `malha_aterramento` library type (label "Malha de aterramento", nameplate VALOR DE PROJETO `valor_projeto_ohm` number Ω optional, MÉTODO DE MEDIÇÃO and CONDIÇÃO DO SOLO required selects with the base's options in caps, no checklist, `resistencia_malha` (row "Malha", column RESISTÊNCIA Ω required, `max_field` default 5 Ω, Base rev08 AT-01 status CONFIRMADO) and `continuidade_malha` (authored point rows following AT-02, each optional, column RESISTÊNCIA Ω, absolute ≤ 0,5 Ω, NETA MTS-2023 7.13), observations, conclusion, `library: true`). Thermography: switchable (authored `off_note`), value `em_carga` "Equipamento em carga" (`sim`/`nao`), `applies_when` on that value (`in ['sim']`, `needs_value`), rows following GE-01's points (Conexões, Terminações, Contatos, Buchas; optional), columns ΔT ENTRE SIMILARES and ΔT SOBRE O AMBIENTE (°C, optional), two `bands` criteria per Design Notes (source NETA MTS-2023 Table 100.18, status CONFIRMADO).
- `packages/domain/src/relatorio/row-voltage.ts` -- after the winding default and before the instrument: the table's `voltage_default` (decision D bands, ≤ 600 V gives 1 kV here; MCOV rule); export a pure `decisionDDefaultKv(volts)` for the band tests.
- `packages/domain/src/relatorio/accuracy-class.ts` (+ option matching) -- "0,3S"/"0,6S" parse keep the S and judge as 0,3/0,6; option matching prefers the exact option, else the same class without S, else the same P class ("5P" family to "5P20" on v13, "5P" on v12).
- `packages/domain/src/relatorio/reading-evaluation.ts` + `reading-cells.ts` + every reader above -- a `choice` column cell: missing while empty, `fails_on` makes it and its row out (CONDIÇÕES NÃO SATISFATÓRIO), named by the conclusion, the points (authored "polaridade invertida"), parecer, progress and pre-issue; never a number to readers that parse captures (display reading, suggestions, value caps, conflicts keep working).
- `packages/domain/src/relatorio/measurement-evaluation.ts` -- `bands` (per-cell level, the class/action as the restriction reason) and `max_field` (with the helper text when the default applies) on e23t's level machinery; `relatorio/applicability.ts` reads the test-value form (NA reason and applied text, authored).
- `packages/domain/src/relatorio/*` new domain texts -- the faturamento notice (`notice_when`), the default-design helper, the NA reasons, the band reasons; each authored and listed.
- `packages/domain/src/ops/apply.ts`, `ops/value-limits.ts`, `merge/conflicts.ts` -- accept a `choice` column cell only with one of its options (and null to clear); accept a Malha block on v13 only.
- `packages/domain/src/print/section-9.ts`, `print/group-for-print.ts` -- POLARIDADE column before CONDIÇÕES in the v13 TC/TP ratio table (inside the 60 em fit rule), the print note under it, the thermography table last, the Malha sheet under "Outros equipamentos" after the run's other library types (a reorder like `afterFullQuadros`).
- Type literals (`tag.ts` MA, `templates/text.ts`, `duplicate.ts`, `conclusion.ts`, `caption.ts`, `copy/pt-br.ts`, `plate.ts`, plate fixtures) -- the Malha entries; `subBlockLabels` for the three new keys.
- `packages/domain/src/types/duplicate.ts`, `types/draft-edit.ts` -- carry and prune the new keys.
- `packages/domain/src/contract/version.ts` -- CONTRACT_VERSION 39 and MIN 39, a paragraph each (what a v38 bundle refuses or misjudges).
- `apps/api/src/jobs/reading/providers/bedrock.ts` -- `bedrock-structuring-8` (comment line 8: FUNÇÃO DO TC and the S/5P20 classes); `plateFieldNotes` names `funcao_tc` and the S and xPyy notation; tests, a synthetic v13 TC plate fixture (function + 0,3S), README, `bedrock-eval.ts` SYNTHETIC entry (not run).
- `apps/web/src/surfaces/ficha/*` -- the polarity Segmented control per mock (`.ficha-ttr-pol`, `.pol-helper`, phone card `.pol-note`); the faturamento notice under the TC insulation test; the thermography NA band keeping the EM CARGA control visible and a "Foto térmica" action that opens the existing sheet photo capture with the test's context (`use-ficha-photos.ts` `targetFor`); new mock translations in `app.css` per AGENTS.md.
- `apps/api/src/sync/*.integration.test.ts` -- contract 39 through the sync route: a v13 config with `termografia`, a Malha block create and a polarity cell accepted; a v38 pull 426; a v12 Malha create refused; a polarity cell outside its options refused.
- Tests: kernel tests for the D bands at 600/601/5000/5001 V per type and the MCOV edges; the class parser (0,3S, 0,6S, 5P20, 10P20, every e22g notation unchanged); polarity; the band bounds of both columns; `max_field` at, above and with the default; applicability by value (SIM, NÃO, empty, override); seed tests (V13 re-pin, the eight carry `termografia`, Malha shape, v12 unchanged); company copy and prune; composer/palette tests. e2e: `e2e/voltage-defaults.spec.ts` (23.13 through the DOCX), `e2e/tc-polarity.spec.ts` (23.18 ACs through the DOCX), `e2e/thermography.spec.ts` (two types, a thermal photo with an asserted file property, NA by NÃO, through the DOCX), `e2e/ground-grid.spec.ts` (palette at a local to the DOCX), each `@p0` on the main AC; update the literal holders listed in the Code Map and every spec asserting v13 TC/TP counts or Enter runs.
- Docs: `_bmad-output/specs/spec-fasor/SPEC.md` Non-goals line (strike "grounding measurement" and "thermography" as seeded types with a dated note), `source-deltas.md` rows for 23.18 and 23.21 (and 23.20's Non-goal), `docs/kbs/log.md` and the matching `docs/kbs` concept, `deferred-work.md` rows under "Epic 23 batch e23e".

**Acceptance Criteria:**
- Given a v13 disjuntor of class 15 kV, a v13 TC, a v13 para-raio with its MCOV and a v13 cable 8,7/15 kV, when their insulation tables render, then each row starts at its decision D default and the DOCX prints it in TENSÃO; a v12 disjuntor takes the instrument's voltage as before.
- Given a v13 TC, when a ratio row's polarity is set to Invertida, then the row is out, the floor is Reprovado, the derived point names the polarity, and the outbox holds the polarity cell op.
- Given FUNÇÃO faturamento, when the insulation test renders, then the notice shows and the test can still be filled.
- Given EXATIDÃO 0,3S and a ratio error of 0,25 %, when it evaluates, then it is within and ACEITÁVEL prints "± 0,3 %".
- Given a v13 TC sheet, when it prints, then the note prints under the ratio test; a v12 TC prints as before.
- Given a v13 para-raio in load, when a point's ΔT is in the serious class, then it fails, the floor is Reprovado and the derived point names the point; in the lowest class it is within with no restriction; with "Equipamento em carga" NÃO the test is NA with its reason.
- Given each of the eight types on v13, when the palette adds it, then its sheet carries the thermography test; a v12 sheet carries none.
- Given a v13 relatório, when the engineer adds "Malha de aterramento" at a local and types a resistance above its design value, then the sheet is Reprovado by floor, the parecer follows and the DOCX prints the sheet under "Outros equipamentos"; with the design value empty the 5 Ω default applies and the helper says so; a v12 palette does not offer the type.
- Given the layout-lock and Porto Seguro goldens, when the api suite runs, then they match byte for byte.

## Spec Change Log

## Review Triage Log

### 2026-11-09 — Review pass
- layers: Edge Case Hunter and Verification Gap Reviewer; Blind Hunter and Intent Alignment skipped (token economy; the integrated epic review covers them).
- verdicts: 7 findings — high 0, medium 3, low 4, false 0, maybe-false 0
- findings:
  - `[low]` `[patch]` VG: the conflict label of a POLARIDADE cell (`merge/conflicts.ts` `?? choiceHeader`) has no test — added a 23.18 case beside the 22.8 voltage case in `conflicts.test.ts`.
  - `[medium]` `[patch]` VG: the phone card's polarity Segmented and `.pol-note` (`ensaios-section.tsx`) are never exercised — `e2e/tc-polarity.spec.ts` gains a 390 px step (pick Invertida, outbox put, the note's kernel text).
  - `[medium]` `[patch]` EC: a ΔT cell stored over range is skipped by `applyBands` (`!judged`), so a hot spot over the camera's range is never judged — judged above every bound (out), with a boundary test.
  - `[low]` `[reject]` EC: a plate's 5P10/10P10 lands on the v13 option 5P20/10P20 — the spec's I/O row says so (v13 offers only 5P20 and 10P20, judged the same); whether other limit factors need options goes to Bruno as an open question in the PR.
  - `[low]` `[patch]` EC: the `max_field` default helper is pushed for a test that is off or NA — moved inside `if (live)`, with a unit test.
  - `[low]` `[reject]` EC: a picked polarity cannot be cleared, only flipped — every polarity row is required, so no answered-by-mistake optional row exists; a clear action would add UI the mock does not draw.
  - `[medium]` `[patch]` EC: a TC/TP whose ratio rows fail by POLARIDADE alone is named "relação de transformação insatisfatória" by the conclusion and the parecer — named by the choice text ("polaridade invertida") when every failed row fails by its choice alone; a deviation failure keeps today's words; v12 unchanged.

## Design Notes

- **Readings taken (open to Bruno, listed in the PR):** polarity required (missing while empty; TC-03 and TP-03 are "Obrigatório"); FUNÇÃO DO TC required (base `obrigatorio` Sim); thermography NA until "Equipamento em carga" is SIM (GE-01 "Aplica-se: Equipamento em carga" read as needing the value), its rows and ΔT cells optional (a point the equipment lacks stays "-"); the para-raio with MCOV empty takes the instrument's voltage; the Malha's continuity rows optional.
- **Narrowings (for the coordinator's dated lines):** TC and TP secondaries at 1 kV apply to no row (the seeded tables hold FASE R/S/T × MASSA only; no secondary row is added); polarity is a choice column of the seeded ratio table (the mock's shape), "a choice that fails" living on that grammar, not the measurement grammar; thermal photos are sheet photos taken from the test with its caption context and print in the sheet's photo block right after the thermography table (FR-68, Story 20.6), no new photo kind and no reading job; AT-02's added row is not built (no capability exists; a `deferred-work.md` row for Matheus); the Malha prints after the run's other library types.
- **Thermography bands (NETA MTS-2023 Table 100.18; authored pt-BR class and action words):** ΔT entre similares: ≤ 3 °C within ("possível deficiência", no observation), ≤ 15 restricted ("provável deficiência, reparar quando possível"), above out ("discrepância grave, reparar imediatamente"). ΔT sobre o ambiente: ≤ 10 within, ≤ 20 restricted (provável), ≤ 40 restricted ("monitorar até a correção"), above out. A row takes the worse of its two cells.
- **Voltage precedence (23.13):** typed > seeded `default_kv` > the winding's e22g rating default > the table's `voltage_default` > the instrument's TENSÃO ENSAIO. Bands: rating ≤ 600 V 1 kV, ≤ 5000 V 2,5 kV, above 5 kV; MCOV < 5 kV 2,5 kV else 5 kV.

## Verification

**Commands** (in the worktree, tools container with `--user root`; e2e only under `lockf -t 20000 /tmp/fasor-verify.lock`; restart the api after domain changes):
- `podman compose --profile tools run --rm --user root tools pnpm lint` and `pnpm static` -- expected: 0.
- `podman compose --profile tools run --rm --user root tools pnpm test:unit -- packages/domain` (iterating) then `pnpm test:unit` -- expected: green.
- `podman compose restart api && podman compose --profile tools run --rm --user root tools pnpm test:api` -- expected: green, goldens unchanged.
- `pnpm exec tsx scripts/e2e.ts e2e/voltage-defaults.spec.ts e2e/tc-polarity.spec.ts e2e/thermography.spec.ts e2e/ground-grid.spec.ts --project desktop-chrome --project durability-desktop-chrome` (under the lock) -- expected: green.
- `git diff 7424771d --name-status -- apps/api/src/jobs/generate/golden packages/domain/fixtures` -- expected: no M or D lines.

## Auto Run Result

- **Status:** done (review loop 1 of 1; story gate recorded in the PR body).
- **Summary.** On seed v13 only (one fenced e23e section of `seed/v13.ts`, contract 39 and MIN 39, `bedrock-structuring-8`):
  - 23.13: a table key `voltage_default` gives the disjuntor, seccionadora, TC, TP, cable and para-raio insulation rows their decision D default after the row's and winding's own (`row-voltage.ts` `decisionDDefaultKv`, `mcovDefaultKv`).
  - 23.18: a seeded-table column role `choice` with `fails_on` (POLARIDADE OK/INVERTIDA on the TC and TP ratio tables); FUNÇÃO DO TC with the faturamento notice (`notice_when`); the classes 0,3S, 0,6S, 5P20, 10P20 (`accuracyClassOption`); the print note under the ratio table (`print_note`).
  - 23.20: the measurement test `termografia` on the eight types, judged by the new `bands` criterion (NETA Table 100.18), NA by a condition over its own value "Equipamento em carga" (`needs_value`); "Foto térmica" opens the sheet photo capture.
  - 23.21: the library type `malha_aterramento` (TAG MA) with `resistencia_malha` (the new `max_field` criterion, 5 Ω default) and `continuidade_malha` (≤ 0,5 Ω), printed last under "Outros equipamentos".
- **Files.** Kernel: `seed/{v13,schema,measurement,select-option}.ts`, `schemas/block-config.ts`, `relatorio/{row-voltage,accuracy-class,reading-evaluation,reading-cells,measurement-evaluation,applicability,conclusion,parecer,readings,sheet-progress,tag}.ts`, `ops/apply.ts`, `merge/conflicts.ts`, `print/{section-9,group-for-print}.ts`, `points/derived.ts`, `types/{definition,duplicate,draft-edit}.ts`, `contract/version.ts`, type literals. Web: `surfaces/ficha/{ensaios-section,measurement-test-section,applicability-band,photo-openers}.tsx`, `copy/pt-br.ts`, `styles/app.css`. API: `bedrock.ts`, plate fixtures, `bedrock-eval.ts`, `sync/tc-thermo-ground.integration.test.ts`. e2e: `voltage-defaults`, `tc-polarity`, `thermography`, `ground-grid` (serial group) and updated literal holders. Docs: `SPEC.md`, `source-deltas.md`, `docs/kbs`, `deferred-work.md`.
- **Review.** 7 findings: 5 patched (2 medium tests, 1 medium wording, 1 medium over-range, 1 low note placement), 2 rejected (the 5P ALF question goes to Bruno; a clear action for a required choice). Patched, not re-reviewed: `applyBands` over range, the `max_field` note under `if (live)`, `choiceOnlyFailureText` and the parecer's `choice` group.
- **Follow-up review recommended:** true — two or more medium entries were patched; the unverified risk is the parecer's new `choice` group (its basis keys and sentences) read only by its own unit tests.
- **Residual risks.** `op-log.test.ts` (a test file under `fixtures/porto-seguro/`) gains `malha_aterramento: 0`, the goldens stay byte-equal; the applied band reads "Seguir a placa" on a value condition; the paid eval of `bedrock-structuring-8` is the coordinator's.
