---
title: 'e23t: winding resistance, the judged IP, the insulating liquid and oil sampling, HH fuses (Stories 23.15, 23.16, 23.17, 23.19; contract 38)'
type: 'feature'
created: '2026-11-09'
status: 'in-progress'
baseline_revision: 'f59c9bd65d28af4bfa433d47fe1dd3562e5e5cf4'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-23-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-e23v-three-levels.md'
warnings: ['batched', 'oversized']
batched_reason: 'One data set (epic-23-context.md "Why these groupings"): the transformer and switching tests and their new grammar criterion "deviation between phases", which 23.15 adds and 23.19 reuses; 23.16 and 23.17 are transformer data on the same seed v13 delta, one contract (38), one review, one gate.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** On seed v13 the transformer has no winding-resistance test, its polarization index (IP) is an unjudged print column fed only by the off-by-default `ia_ip_display`, its plate cannot say which insulating liquid it holds (v12's TIPO DO ÓLEO A/B is mineral-only) and nothing records whether an oil sample was taken; the seccionadora has no HH fuse test.

**Approach:** Four v13 additions, each reached only through a v13 definition key (AD-21): two new measurement tests (winding resistance on the transformador de força, HH fuse resistance on the chave seccionadora) judged by a new measurement criterion "deviation between phases %" with up to three levels; the transformer insulation table's ABSORÇÃO and POLARIZAÇÃO become typed index columns, the IP judged by a v13 test key; "NATUREZA DO LÍQUIDO" and "TIPO (ANP)" replace TIPO DO ÓLEO with TIPO DE ISOLAÇÃO's oil option renamed "ÓLEO ISOLANTE" (M-4), plus an oil-sampling measurement test on the transformer and the disjuntor; the plate prompt names both fields (`bedrock-structuring-7`). Contract 38 and MIN 38.

## Boundaries & Constraints

**Always:**
- AD-21: v1 to v12 parse, evaluate, print and hash to the same bytes; `V12_HASH` and older pins hold; re-pin `V13_HASH` only. Each new seed or grammar key is optional and never defaulted.
- Layout lock: `apps/api/src/jobs/generate/golden/layout-lock-{v5,v11,v12}/` and the Porto Seguro goldens (`packages/domain/fixtures/porto-seguro/`, `apps/api/src/jobs/generate/golden/porto-seguro-skeleton.json`) stay byte-equal: `git diff origin/main --name-status -- apps/api/src/jobs/generate/golden packages/domain/fixtures` shows additions only. If one would move, STOP and report it to the orchestrator: it is a defect, not a golden update. Only v13 fixtures may gain goldens. A v13 sheet prints only the deltas named here.
- AD-1/AD-13: every deviation, correction, level, applicability, NA reason, helper, hidden or excused field and printed text is computed in `packages/domain`; `apps/web` renders and writes ops only. Strings per AGENTS.md "Where a new user-facing string goes"; mark each invented one `// authored (Story 23.x, listed for Bruno)` and keep the list for the PR.
- Base rows are cited by ID only (`Base rev08 TR-OL-05`); never copy a procedure, recommendation or "como ensaiar" text. Fixtures synthetic. Numbers below are the named rows' thresholds.
- Seed v13 grows in place in `seed/v13.ts`, in a fenced `// --- e23t: Stories 23.15 to 23.17 and 23.19 ---` section applied after e23v's. `SUB_BLOCK_KEYS` gains, appended in this order: `resistencia_enrolamento`, `coleta_oleo`, `resistencia_fusiveis` (batch e23e appends after them).
- New measurement tests are `switchable` (an authored `off_note`), not `initial_off`: on in the v13 standard template; NA by `applies_when` where stated. Their titles on a FO.SERV-03 type carry no `E{n} ·` prefix (the CTA keeps its numbering). The test keys differ from the seeded `tests` keys (shared `sheet.test` namespace).
- The 75 °C correction reuses `windingResistanceTo75` (`relatorio/temperature-correction.ts:54`); the `VisitContext` (ambient, previous visit) is threaded into measurement evaluation and every caller of `evaluateSheetMeasurements` / `sheetMeasurements`, default `NO_VISIT_CONTEXT`, so the floor, points, parecer, progress, pre-issue, sections 8 and 9 agree.
- Parallel fix batch e23w (port 57, merges first) edits seed v13 (a TP TIPO DE ISOLAÇÃO field), the v13 insulation print (8 pt, TEMPERATURA to the instrument header row), `last_results` ordering, restricao points, the parecer, contact against the previous visit and reading-wait polling. Keep this batch's edits in those files small and in commented blocks.

**Never:**
- No band from a vague term (B-1): no IP history rule ("queda acentuada"), no TR-SE-05 "valor incompatível". No winding-resistance comparison with the factory (no per-phase manufacturer value). Tipo (ANP) judges nothing (B-3, Bruno 2026-11-09 "ok"). No criterion differs by liquid (tan δ is out). The app computes no index from timed readings.
- No change to TP/TC TIPO DE ISOLAÇÃO (they keep ÓLEO MINERAL), to v1 to v12 readers, to `formatCriterionValue`, or to the CTA's output. No paid provider: `LLM_PROVIDER`/`OCR_PROVIDER` stay `fake`; the paid eval is the coordinator's, before the deploy.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Winding, oil Cu 30 °C | v13 TF ÓLEO ISOLANTE, MATERIAL Cu, TEMPERATURA DO ÓLEO 30; AT tap atual A 1,000 B 1,010 C 1,030 Ω | each cell corrected (R x (235+75)/(235+30)); deviation over the row's lowest: B 1 % within, C 3 % restricted (oil bands: within ≤ 2 %, restricted ≤ 5 %, out > 5 %); floor Aprovado · Com restrições, one `restricao` entry naming the test and the cell | none |
| Winding, oil bounds | deviation exactly 2 % / 2,01 % / exactly 5 % / 5,01 % | within / restricted / restricted / out (floor Reprovado) | none |
| Winding, dry | v13 TF EPÓXI: deviation 4 % | restricted (dry band: within ≤ 2 %, restricted above; no out band) | none |
| Winding, medium unknown | TIPO DE ISOLAÇÃO empty, deviation 8 % | deviation not judged, helper asks for TIPO DE ISOLAÇÃO; an over-range cell still out | none |
| Winding, open circuit | v13 dry TF, one phase over range ("OL" with a micro-ohmmeter picked, or "> 2000") | that cell out, floor Reprovado; the other phases' deviation over the measured cells only | none |
| Winding, no material | MATERIAL DO ENROLAMENTO empty | no correction (no corrected values), the deviation still judged, the helper asks for the material | none |
| Winding, temperature | oil unit: TEMPERATURA DO ÓLEO; dry: TEMPERATURA DO ENROLAMENTO; empty or medium unknown: the cabine's ambient; none: no correction, helper asks for the temperature | as e23v's sources and texts, 75 °C | outside -10..110 °C: no correction |
| Winding, history | previous v13 visit corrected 1,000 Ω, current corrected 1,025 Ω (2,5 %) on a cell otherwise within | restricted, helper names the previous revision and value; previous on v12 or uncorrected: shown, not judged | none |
| Winding, optional rows | the two extreme-tap rows empty | not missing (row `optional`); tap atual and BT rows required | none |
| Fuses | v13 SC SOB CARGA COM FUSÍVEIS, fuses 10, 10, 12 mΩ | 12 is 20 % over the lowest: out (> 15 %), floor Reprovado; exactly 15 % within | none |
| Fuses NA | TIPO DE SECCIONADORA SEM CARGA | test NA with its reason ("sem fusíveis" as the frame), not missing, absent from the DOCX; "Aplicar este ensaio" applies it; empty type: applies | none |
| IP dry | v13 TF EPÓXI, row 1 min 5 GΩ, IP 0,8 | out, floor Reprovado; IP 1,0 restricted; IP 1,9 restricted; IP 2,0 within | none |
| IP required | dry unit, 1-min measured, IP empty | missing; oil unit or medium unknown: optional (never missing) | none |
| IP over range | row's 1 min over the instrument limit | IP cell shows N/A "não aplicável", not typed, not missing; prints N/A | a stored IP there is ignored |
| DAR | ABSORÇÃO typed | captured and printed, never judged, never missing | none |
| v12 IP | v12 TF with `ia_ip_display` on | nothing judged, prints as before | none |
| Liquid, silicone | v13 TF ÓLEO ISOLANTE, NATUREZA SILICONE | oil items answerable; TIPO (ANP) hidden (not drawn, never missing, prints "-"); `coleta_oleo` applies | none |
| Liquid, mineral | NATUREZA MINERAL | TIPO (ANP) shown and required (A, B, NÃO INFORMADO); empty NATUREZA: shown | none |
| Dry unit | TIPO DE ISOLAÇÃO EPÓXI | NATUREZA and TIPO (ANP) excused, print "-"; `coleta_oleo` NA with its reason, absent from the DOCX | none |
| Old spelling | stored ÓLEO MINERAL or ÓLEO on a v13 copy | read as ÓLEO ISOLANTE (alias) | none |
| Sampling | Amostra NÃO COLETADO | Motivo shown and required (Equipamento energizado, Sem ponto de coleta, Outro); floor unchanged; COLETADO: no Motivo | none |
| Disjuntor oil | v13 DJ MEIO DE EXTINÇÃO Óleo | its `coleta_oleo` applies; Vácuo: NA | none |
| Plate | fake plate printing "Tipo óleo isolante B" on a v13 TF | suggestions TIPO (ANP) B, NATUREZA DO LÍQUIDO MINERAL and TIPO DE ISOLAÇÃO ÓLEO ISOLANTE (composed by the kernel, citing the oil words) | v12 plate: as before |
| Contract | config enabling `resistencia_enrolamento`; cell op on it | accepted at contract 38; a v37 client refused 426 | unknown sub-block refused |
| v12 / v5 | any of the above | nothing changes; goldens byte-equal | none |

</intent-contract>

## Code Map

- `packages/domain/src/seed/v13.ts` -- fenced sections per batch; e23b's `TRANSFORMER_AFTER_GROUP`, `SECCIONADORA_FIELDS` (`tipo_seccionadora` options), `TEMPERATURA_DO_OLEO/ENROLAMENTO`, `material_enrolamento` (Cu, Al); e23v's `withCorrectionAndRestrictions`; `cabinePrimariaV13()` applies sections in order.
- `packages/domain/src/seed/v12.ts:30-70` -- `TIPO_DE_ISOLACAO_OPTIONS`, aliases, `TIPO_DO_OLEO` (an oil-rule field), `oilInsulation`. `seed/v7.ts:25-42` DJ MEIO DE EXTINÇÃO ('Óleo' is the oil value). `seed/v1.ts:355-372` `singleInsulation` (ABSORÇÃO, POLARIZAÇÃO are `print` columns).
- `packages/domain/src/seed/measurement.ts` -- grammar: criteria union (:206), `measurementRowSchema` (:85), `measurementValueSchema` + `whenValueSchema` (:52), `checkMeasurementTest` (:290), `instrumentOfSchema` (:257).
- `packages/domain/src/seed/schema.ts` -- `columnDefSchema.role` (:130), `testDefSchema` (:254, e23v keys at the end), `checkSeedV13Definition` (:497), `oilRuleSchema` (:386), `FieldDef` (:40-90).
- `packages/domain/src/schemas/block-config.ts:119` `SUB_BLOCK_KEYS`; `seed/template.ts:35-110` (`DEFAULT_OFF_SUB_BLOCKS`, `startsOff`); `seed/seed.test.ts` (V13 pins at ~2150-2177, `SUB_BLOCK_KEYS.slice(-6)` at ~1060); `relatorio/library-type.test.ts:127`.
- `packages/domain/src/relatorio/measurement-evaluation.ts` -- `mark` (:453, within/out only), `markOverRange` (:426), `markPositiveOnly` (:544), `evaluate` (:745, title `E${number}` at :784), `evaluateSheetMeasurements` (:811), `worstMeasurements` (:946), `liveTests` (:895).
- `packages/domain/src/relatorio/reading-evaluation.ts:568-765` `evaluateTable` (typed columns, verdict loop, `applyRestrictions`); `relatorio/reading-cells.ts` (`ReadingVerdict`, `EvaluatedCell.restriction`, `corrected`); `relatorio/restriction.ts` (e23v rules); `relatorio/temperature-correction.ts` (`testTemperature` :99, `temperatureView` :194, texts :175-180); `relatorio/visit-context.ts`.
- Readers that must see measurement restrictions and the visit context: `relatorio/sheet-evaluation.ts:51` (`sheetMeasurements`, no visit today), `relatorio/conclusion.ts` (floor :166-185, `tableCells` absent at :178, `restrictedClause` :512, `restrictedItems` :451, basis `tables` :584-591, `measurementClause` :466), `points/derived.ts:150-207` (`restricao` loop seeded only), `relatorio/sheet-progress.ts:208-221`, `relatorio/parecer.ts`, `relatorio/pre-issue.ts`, `print/section-8.ts`, `print/section-9.ts` (`measurementParts` ~1150-1195, `printColumnText` :723, `fittedColumns`), `print/last-results.ts:85-92` + `print/reading-slots.ts:48-73` (measurement keys `${test}|${row}|${col}`, no `corrected` yet), `merge/conflicts.ts:304`, `merge/info.ts:348,410`, `templates/text.ts:391`.
- `packages/domain/src/relatorio/applicability.ts` (`applies_when` grammar, unmet texts); `relatorio/oil-rule.ts:98` `isOilFieldExcused` (the one excusal hook, used by `relatorio/dry-insulation.ts:106` and `print/section-9.ts:397`).
- `packages/domain/src/reading/build.ts:75-130` `composedInsulation` (v12 `tipo_do_oleo` -> TIPO DE ISOLAÇÃO); `reading/display.ts:291` (drops `print` columns from display reading); `relatorio/measurement-suggestions.ts:38`.
- `packages/domain/src/types/definition.ts:100-145` (`companyMeasurementCriterionSchema`, `RESERVED_TEST_KEYS`, `IA_IP_COLUMNS`), `types/duplicate.ts:97-108`, `types/draft-edit.ts` (`removeDraftEntry` prunes keys naming a removed field).
- `packages/domain/src/contract/version.ts:423,665` + `contract/contract.test.ts`; `ops/path.ts:276-281`; `apps/api/src/sync/*.integration.test.ts` (426 precedent).
- `apps/api/src/jobs/reading/providers/bedrock.ts:74-79,210-250` (`BEDROCK_STRUCTURING_PROMPT_VERSION`, `plateFieldNotes`); `providers/fake.ts` `DEFAULT_FIXTURE_BY_BLOCK_TYPE`; `jobs/reading/fixtures/`; `scripts/make-plate-fixtures.ts:240-260`; `scripts/bedrock-eval.ts:150-165`; `jobs/reading/job.integration.test.ts:384` (v12 precedent).
- Web: `apps/web/src/surfaces/ficha/ensaios-section.tsx:115-244`, `measurement-test-section.tsx` (NA band :134, table/cards :315), `measurement-field.tsx` (restricted tone), `corrected-value` component, `nameplate-section.tsx`, `copy/pt-br.ts:471-488` (`subBlockLabels`), `apps/web/src/styles/app.css`. Mock frames: `ux-designs/ux-fasor-2026-09-18/mockups/prototype/screens/60-ficha.html` lines 517 (v13 TR1 plate: Natureza do líquido, Tipo (ANP) helper "Só para líquido mineral"), 977-985 (Coleta de óleo: `.v13-choice`, segmented Coletado / Não coletado, `.v13-reason` chips), 966-985 (fuses NA band, table Fusível / Resistência mΩ).
- e2e: `e2e/temperature-correction.spec.ts`, `e2e/three-levels.spec.ts`, `e2e/previous-visit-judges.spec.ts`, `e2e/test-applicability.durability.spec.ts`, `e2e/plate-reading.spec.ts`, `e2e/plate-every-type.spec.ts`, `e2e/support/{relatorio-seed,outbox,groups,palette}.ts`.

## Tasks & Acceptance

**Execution:**
- `seed/measurement.ts` -- (a) criterion `{ type: 'phase_deviation', across: 'columns' | 'rows', within_max_pct, restricted_max_pct?, above: 'out' | 'restricted', medium?: 'oil' | 'dry', text, source, status? }`: per group (a row's number cells when `across: 'columns'`, a column's cells when `'rows'`) each measured cell's deviation = (cell - lowest measured positive cell of the group) / lowest x 100, compared in one unit (`scaleToUnit`); <= `within_max_pct` within; with `restricted_max_pct`, <= it restricted and above it out; without it, above `within_max_pct` is `above`. `medium` makes the criterion apply only when the definition's oil rule reads that medium (`mediumOf`); with the medium unknown no medium criterion judges the deviation and the helper asks for TIPO DE ISOLAÇÃO. An over-range cell is out (open circuit) whatever the medium, and leaves the group; a group with fewer than two measured cells judges no deviation. (b) row `optional: true` (its cells never missing). (c) `whenValueSchema` accepts `{ cell: { row, column }, equals }` besides `{ value, equals }` (a value shown under a choice cell). (d) test keys `winding_correction: { to_c: 75, material_field, oil_field?, dry_field? }` and `history_deviation_pct` (0..100) needing `winding_correction`. All optional; `checkMeasurementTest` checks every reference. -- Story 23.15/23.17 grammar.
- `seed/schema.ts` -- `columnDefSchema.role` += `'index'` (a typed unitless number, never the capture column); TestDef `polarization_index: { column: label, min: 1, restricted_below: 2, required_on: 'dry', dar_column?: label, status }` (only on a table with those index columns); FieldDef `excused_unless: { field, in: string[] }` (a select of the nameplate; unmet: hidden, never missing, prints "-"; empty field: shown). Reference checks in `checkSeedV13Definition`. -- 23.16, 23.17.
- `schemas/block-config.ts` -- append the three keys; contract paragraph. -- shared fact.
- `seed/v13.ts` e23t section -- **transformador_forca**: TIPO DE ISOLAÇÃO options `['EPÓXI', 'Á SECO', 'ÓLEO ISOLANTE']`, aliases `ÓLEO` and `ÓLEO MINERAL` -> `ÓLEO ISOLANTE`, oil_values `['ÓLEO ISOLANTE']`; `tipo_do_oleo` replaced in place by `natureza_liquido` 'NATUREZA DO LÍQUIDO' (MINERAL, ÉSTER NATURAL (VEGETAL), ÉSTER SINTÉTICO, SILICONE) and `tipo_anp` 'TIPO (ANP)' (A, B, NÃO INFORMADO; `excused_unless: { field: 'natureza_liquido', in: ['MINERAL'] }`), both oil-rule fields; insulation table's ABSORÇÃO and POLARIZAÇÃO become `index` columns + `polarization_index` (TR-OL-03, TR-SE-03, table IP_CLASSIFICACAO: < 1,0 out; 1,0 to < 2,0 restricted; >= 2,0 within); `ia_ip_display` leaves this type's v13 `sub_blocks`; measurement tests `resistencia_enrolamento` 'Resistência ôhmica dos enrolamentos' (`instrument_of: 'resistencia_contato'`, row_header 'Enrolamento', columns Fase A/B/C, rows 'AT, tap atual' (Ω), 'AT, primeiro tap' and 'AT, último tap' (Ω, optional), 'BT' (mΩ); two `phase_deviation` criteria across columns: `medium: 'oil'` within 2, restricted_max 5 (TR-OL-05), `medium: 'dry'` within 2, `above: 'restricted'` (TR-SE-05); `winding_correction` material `material_enrolamento`, oil `temperatura_oleo_c`, dry `temperatura_enrolamento_c`; `history_deviation_pct: 2`) then `coleta_oleo` 'Coleta de óleo' (row 'Amostra', column 'Resultado' choice Coletado / Não coletado, criterion `choice_pass` both; value `motivo` 'Motivo' choice Equipamento energizado / Sem ponto de coleta / Outro, `when: { cell: { row: 'amostra', column: 'resultado' }, equals: 'nao_coletado' }`; `applies_when: { field: 'tipo_de_isolacao', op: 'in', values: ['ÓLEO ISOLANTE'] }`; TR-OL-07). **disjuntor_mt**: `coleta_oleo` with `applies_when` MEIO DE EXTINÇÃO in ['Óleo'] (DJ-07). **chave_seccionadora**: `resistencia_fusiveis` 'Resistência dos fusíveis HH' (row_header 'Fusível', rows Fase A/B/C, column 'Resistência' mΩ, `phase_deviation` across rows, within 15, `above: 'out'`, `applies_when` TIPO DE SECCIONADORA in ['SOB CARGA COM FUSÍVEIS'], `unmet` 'sem fusíveis'; SC-04). Each new sub-block added to the type's `sub_blocks`. -- data.
- `seed/seed.test.ts` -- strip the e23t delta to get the pre-e23t v13 bytes; re-pin `V13_HASH`; refusals for each bad reference; the sub-block slice. -- AD-21.
- `relatorio/measurement-evaluation.ts` -- `restricted` verdict with `restriction: { reason, text }` (authored deviation texts naming the percentage and the reference cell); `markOverRange` lets a `phase_deviation` cell take over range; `markPositiveOnly` keeps `restricted`; corrected 75 °C value per cell (`corrected`, as e23v) and the test's temperature view (line, print text) when `winding_correction`; material missing helper; history rule against `previousReadingsByAddress` when both carry `corrected`; take `visit`; no `E{n}` on a definition with `tests`. -- 23.15, 23.19.
- Readers -- `sheet-evaluation`, `conclusion` (floor `tableCells` restriction, clause, basis key only when present), `points/derived` (`restricao` entries from measurement tests, one per test), `sheet-progress`, `parecer`, `pre-issue`, `section-8`, `merge/*`, `templates/text.ts` -- read measurement restrictions and pass `visit`. -- 23.6 parity.
- `print/last-results.ts`, `print/reading-slots.ts` -- measurement cells write `corrected` when they carry one. -- history.
- `relatorio/reading-evaluation.ts` + `reading-cells.ts` -- index cells (role `index`): IP verdict by `polarization_index` (restricted carries `restriction`), DAR never judged; required per `required_on` and the medium; N/A when the row's capture is over range; never in `applyRestrictions`. -- 23.16.
- `print/section-9.ts` -- POLARIZAÇÃO/ABSORÇÃO print the typed index value on v13 (N/A rule of Story 23.4 kept); measurement tests: `resistencia_enrolamento` prints its table, a `75 °C` group repeating the phase columns ("-" without a corrected value) and a TEMPERATURA line in e23v's print text; fuses and sampling print with the grammar's printer; an NA test is absent. Tables fit at 8 pt under `READING_FIT_WIDTH_EM`. -- print.
- `relatorio/oil-rule.ts` -- `isOilFieldExcused` also excuses an `excused_unless` field whose select holds another value; a kernel `isFieldHidden` (or the same flag) for the sheet. -- 23.17.
- `reading/build.ts` + `providers/bedrock.ts` -- v13: the model reads `tipo_anp` (the class letter) and `natureza_liquido` (when printed); the kernel composes TIPO DE ISOLAÇÃO ÓLEO ISOLANTE and NATUREZA MINERAL from a kept A/B, citing its tokens (P-2); index columns accepted by the display reading as Suggestions (`reading/display.ts`); prompt `bedrock-structuring-7` with its history line; synthetic set gains one v13 silicone plate and one v13 type-B plate (`make-plate-fixtures.ts`, `bedrock-eval.ts` cases, fake fixtures); the default transformer fixture keeps working on v12 and v13 blocks. -- 23.17, 23.16.
- `types/*` -- company schemas accept the new criterion, row/value/test keys, `index` role, `polarization_index` and `excused_unless`; Duplicar carries them; `removeDraftEntry` prunes what names a removed field. -- shared fact.
- `contract/version.ts` -- 38/38 with a dated paragraph. -- contract.
- Web -- render the new measurement tests (NA band, override, corrected line "A 75 °C:", restricted tone, the `.v13-choice` segmented Amostra and `.v13-reason` Motivo chips from the frame), index cells in the insulation table and cards, hidden TIPO (ANP), `subBlockLabels` for the three keys; `.frame-*` translations in `app.css`. -- screens.
- Kernel tests -- every matrix row; deviation bounds (exactly at each band, one step past, zero/negative lowest, one cell only); IP at 0,99 / 1,0 / 1,99 / 2,0; over range; 75 °C Cu/Al; liquids x oil rule; agreement of floor/points/parecer/sections 8 and 9 on one v13 snapshot; v12 and v5 unchanged with a non-empty visit; section 9 at the 8 pt fit. -- DoD.
- `apps/api` -- sync integration: config with the three keys and a cell op accepted at 38, v37 refused 426; reading job: the v13 "Tipo óleo isolante B" plumbing test (fake) and a display-reading fixture test filling an IP. -- DoD.
- e2e (`@p0`, committed outbox/store asserted, numbers from the kernel): `e2e/winding-resistance.spec.ts` (oil Cu 30 °C restricted then out, dry over range Reprovado, DOCX table), `e2e/polarization-index.spec.ts` (dry IP 0,8 Reprovado, 1,5 restricted, over-range N/A, DOCX), `e2e/oil-liquid-sampling.spec.ts` (silicone hides TIPO (ANP), sampling Não coletado + Motivo with floor unchanged, EPÓXI excused and sampling NA absent from DOCX, DJ Óleo applies), `e2e/fuse-resistance.spec.ts` (out and Reprovado; SEM CARGA NA, absent from DOCX, override). A spec that issues goes in `SERIAL_SPECS`. -- DoD.
- Docs -- `source-deltas.md` rows of 23.15, 23.16, 23.17, 23.19 (strike "planned" + dated built text; 23.16's row new); spine AD-21 dated note (measurement grammar keys); `docs/kbs/architecture/kernel-and-seed.md`, `docs/kbs/log.md`; `deferred-work.md` under "Epic 23 batch e23t". -- DoD.

**Acceptance Criteria:**
- Given a v13 oil transformer with copper windings at 30 °C, when the AT phases are typed on the current tap, then each is corrected to 75 °C, the deviation between phases is computed, a deviation in the restriction band restricts and one above it fails, on screen, in the floor, the points and the DOCX.
- Given a v13 dry transformer with a phase over range, when it evaluates, then the floor is Reprovado.
- Given a v13 dry transformer, when an IP below the minimum is typed, then the row is out and the floor Reprovado; an IP in the restricted class restricts; with the 1-minute reading over range the IP shows N/A, needs no value and prints N/A.
- Given a v13 transformer with ÓLEO ISOLANTE and silicone, then the oil items are answerable, TIPO (ANP) is hidden and the sampling test applies; an EPÓXI unit excuses both liquid fields ("-") and makes the sampling NA with its reason; a v13 disjuntor with oil applies its sampling test; Não coletado asks for a reason and does not raise the floor.
- Given a fake plate printing "Tipo óleo isolante B" on a v13 transformer, when the reading completes, then NATUREZA DO LÍQUIDO is suggested MINERAL and TIPO (ANP) B.
- Given a v13 seccionadora with fuses and one fuse far from the others, then that row fails and the floor is Reprovado; a type without fuses makes the test NA with its reason and absent from the DOCX.
- Given a v12 or v5 relatório (with `ia_ip_display` on), when it evaluates and prints, then nothing changes and the layout-lock and Porto Seguro goldens are byte-equal.

## Design Notes

- **Why measurement tests.** The story names the measurement grammar and its new criterion; its rows are fixed, so the winding table carries the current tap and the two extremes as rows (extremes optional) rather than one row per tap of TAPS. Readers already order a block's `tests` before its measurement tests, which puts the winding table after the TTR and the fuses after the contact test.
- **Deviation reference** is the group's lowest measured cell, as the pole deviation of e23v (Story 23.14); a reading for Bruno. Correcting a row's phases to 75 °C scales them alike, so the deviation is the same raw or corrected; the corrected value matters for print and the history rule.
- **IP as index columns.** ABSORÇÃO and POLARIZAÇÃO already print in FO.SERV-03's insulation table (QUALIDADE ISOLAÇÃO), so the IP is typed where it prints and no width changes. "Opcional on oil, Obrigatório on dry" reads as optional or required by the medium, not a switch, because the medium is known only from the plate.
- **Readings listed for Bruno (narrowings):** deviation over the lowest; dry winding has no out band but open circuit; IP mapping (< 1,0 out, 1,0 to < 2,0 restricted, >= 2,0 within) on both media; no IP history; DAR captured on both media, unjudged; the sampling reason is a closed choice (free text goes in Observações); silicone applies the sampling (the AC) though TR-OL-07 names mineral or vegetal; empty TIPO DE SECCIONADORA applies the fuse test (Story 23.9's rule); no factory comparison for the winding.

## Verification

**Commands (tools container: `podman compose --profile tools run --rm --user root tools …`; logs in `.scratch-e23t/`; restart the api after any domain change):**
- `pnpm lint`, `pnpm static` -- 0 errors.
- `pnpm test:unit` -- green, `seed.test.ts` pins included.
- `pnpm test:api` -- green; goldens unchanged (`git diff origin/main --name-status -- apps/api/src/jobs/generate/golden packages/domain/fixtures` additions only).
- Targeted Playwright only under `lockf -t 20000 /tmp/fasor-verify.lock` (the orchestrator runs the full touched set): `pnpm exec tsx scripts/e2e.ts <specs> --project desktop-chrome --project durability-desktop-chrome`.

## Spec Change Log

## Review Triage Log
