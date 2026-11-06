---
title: 'e22s: Stories 22.7 to 22.9 and 22.11, seed v12 (contract 32)'
type: 'feature'
created: '2026-11-06'
status: 'in-progress'
baseline_revision: 'b883c5875f9d4dcdab67f2d6c8596ad1f44014e2'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-22-context.md'
warnings: ['batched', 'oversized', 'multiple-goals']
batched_reason: 'Stories 22.8, 22.9 and 22.11 extend the seed/v12.ts Story 22.7 creates; one frozen seed version, one contract bump (32), one gate.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** Bruno's 2026-11-06 review: an oil transformer can only be filed as dry, its oil class lands in TIPO, a TP is judged on the power transformer's checklist, a sheet "not tested because of a defect" has no reason that says so, the insulation table has one test voltage for all rows (a 220 V winding printed at 10 kV), TC and TP ratios are judged at a fixed ± 0,5 % whatever their accuracy class, and the QGBT photos have no short sheet to belong to.

**Approach:** Seed v12, derived from v11 (`V11_HASH` pinned), carries every content change; the kernel gains the per-row test voltage, the accuracy-class criterion and the plate-reading composition; contract 32 (`MIN_CONTRACT_VERSION` 32). Only relatórios created after the deploy use v12 (AD-21); kernel and print rules still hold on v5 and v11 relatórios, which render as today.

## Boundaries & Constraints

**Always:**
- Seed v12 is `packages/domain/src/seed/v12.ts`, derived from v11 like `v11.ts` from `v10.ts`; `SEED_VERSION = 'v12'`; `seed.test.ts` pins `V11_HASH` (compute it from the current v11 before any change), the v12 hash, and v12's difference from v11 field by field.
- Every new seed-schema key is optional and never defaulted, so v1 to v11 parse to the bytes they shipped with (their pinned hashes stay green).
- AD-1/AD-13: every default, notice, criterion, class parse and composed value is a kernel function in `packages/domain`; `apps/web` renders it and writes ops only. New pt-BR: derived text in the kernel, static copy in `apps/web/src/copy/pt-br.ts`, each authored string marked `// authored (Story 22.x, listed for Bruno)`.
- Playbook § 10 P-1/P-2: the model reports what the plate prints; a kernel function composes the stored value. Fake providers only; the fake-provider tests of the plate ACs are named "plumbing tests" in this spec and the PR.
- Layout protection: the document changes only by the asked deltas (the TENSÃO column on v12 insulation tables, the new fields, the new sheet type). Never reorder, regroup, resize or renumber photos or sections; a v11 or v5 sheet prints byte-identical to main.
- No edit to the Porto Seguro v1 fixture; no golden regenerates (if one would, stop and explain each line in the PR).

**Never:** a new op path family (the per-row voltage uses the existing `sheet/{b}/test/{t}/cell/{row}/{col}` put); a seed migration of an existing relatório; a paid key or a real model call; editing `epics.md` or `sprint-status.yaml`; touching `relatorio/conclusion.ts` or `relatorio/parecer.ts` beyond the per-type noun map entry (e22c owns them); a MANUT. ANTERIOR column or over-range text (e22r).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Insulation options | v12 transformador_forca | TIPO DE ISOLAÇÃO = EPÓXI, Á SECO, ÓLEO MINERAL; TIPO DO ÓLEO = A, B after it; group select labelled DESLOCAMENTO ANGULAR (screen "Deslocamento angular"), options and value unchanged | - |
| Old ÓLEO value | a v11 "ÓLEO" copied onto v12 (last nameplate, "Igual à") | reads ÓLEO MINERAL (`option_aliases`) | - |
| Oil unit | v12 transformer, ÓLEO MINERAL | the oil items answerable, TIPO DO ÓLEO editable | - |
| Dry unit | v12 transformer, EPÓXI | oil items NA with no tap; TIPO DO ÓLEO excused, prints "-" | - |
| TP checklist | v12 TP | exactly the TC's v10 items (no VÁLVULA DE ALÍVIO, RELÉ DE GÁS, VENTILADORES); dry subtypes and the oil rule name `vasamento` only | - |
| Defect reason | v12 sheet Não ensaiado, "Defeito no equipamento" | `isDefectReason` true; floor Reprovado (22.4); its derived point prints the reason's justification | v11 has no such reason |
| Row voltage defaults | v12 transformer, instrument TENSÃO ENSAIO "10 kV" | PRIMÁRIO/MASSA and PRIMÁRIO/SECUNDÁRIO 10, SECUNDÁRIO/MASSA 1; each row changeable to 0,5 / 1 / 2,5 / 5 / 10 | instrument value not an option or absent: HV rows empty ("-"), never "missing" |
| Voltage notice | SECUNDÁRIO/MASSA at 10 kV, TENSÃO NOMINAL BT 220 V | screen-only notice naming the winding and "0,5 ou 1 kV"; saving and concluding still work | BT empty or unparsable: no notice |
| Voltage at the limit | the same row at 1 kV or 0,5 kV | no notice (see Design Notes, open question OQ-1) | - |
| Print voltage | v12 table prints | a TENSÃO (kV) column right after the connection columns, each row's effective value ("10", "1", "0,5"), "-" when none | v11 table prints as today |
| TC class | v12 TC, EXATIDÃO 1,2, ratio error 0,84 % | SATISFATÓRIO; ACEITÁVEL prints "± 1,2 %"; floor not raised | - |
| Protection class | EXATIDÃO 5P or 10P | judged at ± 3 % | - |
| No class | v12 TC/TP, EXATIDÃO empty | ± 0,5 %, and the screen helper asks for EXATIDÃO | - |
| Override | `criterion_override` well formed | still wins over the class | malformed: class (or ± 0,5 %) stands |
| Class parse | "0,6C25", "10P20", "1,2P75", "0.3", "5P10", "C25", "" | 0,6 · 10P · 1,2 · 0,3 · 5P · null · null | parser never throws |
| Plate oil (plumbing) | fake fixture: "Tipo óleo isolante B", "TIPO TRICAST", no insulation word | TIPO DO ÓLEO suggested B, TIPO suggested TRICAST, TIPO DE ISOLAÇÃO suggested ÓLEO MINERAL in `verify` trust citing the oil words | - |
| Plate class (plumbing) | fake fixture TC printing "0,6C25" | EXATIDÃO suggested 0,6 | an unparsable class is dropped |
| QGBT inspection | v12 painel, add "Inspeção de QGBT" | 4 fields (IDENTIFICAÇÃO, FABRICANTE, TENSÃO NOMINAL, CORRENTE NOMINAL), the visual checklist, observations, CONCLUSÃO; photos attach; floor applies; TAG prefix QGBT | absent from the palette on v11 and older |
| QGBT print | it prints | in "Outros equipamentos", after the relatório's full Quadro elétrico sheets, with its checklist and photos; section 3 counts it | - |
| Older seeds | v5 and v11 relatórios | seed bytes, screen and print unchanged (one voltage per test, ± 0,5 %) | - |

</intent-contract>

## Code Map

- `packages/domain/src/seed/v11.ts`, `v10.ts` -- the derive-from-previous pattern (`tcV10` is the TP's model: checklist `TC_CHECKLIST_V10`, `na_defaults: ['vasamento']`, `oil_rule.items: ['vasamento']`); v10 exports its TC list only via `CABINE_PRIMARIA_V10.blocks.tc.checklist`.
- `packages/domain/src/seed/v6.ts` -- `oilTransformer` (oil rule on `tipo_de_isolacao`, `oil_values ['ÓLEO']`, `fields ['vol_oleo']`), `QUADRO_CHECKLIST` (17 items), `QUADRO_ELETRICO` (library type, `print_title "QGBT/QD's"`).
- `packages/domain/src/seed/v1.ts:30-60,340-500` -- field builders, `TC_FIELDS` (`exatidao` text, last), `TP_FIELDS`, `singleInsulation`, `contactInsulation`, `TRANSFORMADOR_ROWS` (LINHA PRIMÁRIO, PRIMÁRIO, SECUNDÁRIO), `NOT_TESTED_REASONS` (justification style).
- `packages/domain/src/seed/schema.ts` -- `columnDefSchema` (role enum), `tableDefSchema`, `testDefSchema`, `fieldDefSchema.option_aliases`, `notTestedReasonSchema.defect` (Story 22.4, unset by every shipped seed).
- `packages/domain/src/seed/definitions.ts:53,103-115` -- `SEED_VERSION`, `SEED_VERSIONS`; `NOT_TESTED_REASON_KEYS` grows by itself. `seed/defect-reason.ts` -- `isDefectReason` (its comment says v12 adds the first one: update it).
- `packages/domain/src/seed/seed.test.ts:1875-1915` -- the v10 hash pin to copy for v11 and v12.
- `packages/domain/src/schemas/block-config.ts:36,103` -- `EQUIPMENT_BLOCK_TYPES` (append `inspecao_qgbt` last), `ITEM_KEYS` (reuse the quadro keys; no new key expected).
- Per-type `Record<EquipmentBlockType, …>` maps the compiler will flag: `relatorio/tag.ts:25`, `relatorio/conclusion.ts:286` (noun only), `templates/text.ts:46,63`, `photos/caption.ts:38`, `apps/web/src/copy/pt-br.ts:546`, `apps/api/src/jobs/reading/kinds/plate.ts:60-76` (fakeDefaults per type).
- `packages/domain/src/relatorio/oil-rule.ts` -- reads `oil_rule` from the seed; expect no code change, only tests with ÓLEO MINERAL.
- `packages/domain/src/relatorio/reading-cells.ts`, `reading-evaluation.ts:60-135,180-240` -- `EvaluatedTable`/`EvaluatedRow`, `typedColumns` (capture and input only), `effectiveCriterion` (+ `criterion_override`), `voltsOf`, `pickedBand`.
- `packages/domain/src/relatorio/test-voltage.ts` -- `testParameterVolts` (parses "10 kV", "5.000 V"), the notice pattern and its authored-string style.
- `packages/domain/src/relatorio/instrument-pick.ts:55-80` -- `storedInstrumentHeader(...).test_parameter`, the instrument default.
- `packages/domain/src/ops/apply.ts:438-458` -- `assertCellGeometry`: any non-derived `value_columns` index is writable, so the appended voltage column needs no fold change.
- `packages/domain/src/print/section-9.ts:469-500,545-615,736-756` -- `instrumentPart` (ACEITÁVEL from `evaluation.criterionText`), `measurementHeader`, `valueText` (exhaustive `switch (column.role)`), `measurementTable`, `fittedColumns`/`widenToFit`. e22r adds over-range text and MANUT. ANTERIOR here after this batch merges: keep the voltage column's code in one helper.
- `packages/domain/src/print/group-for-print.ts:296-345` -- `byType`: library types go to `outros` in tree order.
- `packages/domain/src/reading/build.ts:69-140` -- `buildReadingSuggestions`, the vector-group composition precedent (`groupReadOf`, `verify`).
- `apps/api/src/jobs/reading/providers/bedrock.ts:77,172-215` -- `BEDROCK_STRUCTURING_PROMPT_VERSION = 'bedrock-structuring-4'`, `STRUCTURING_SYSTEM`, `fieldLine`, `structuringPrompt`, `vectorGroupPrompt` (a per-field paragraph precedent).
- `apps/api/src/jobs/reading/providers/fake.ts`, `fixtures/*.json`, `fixtures/README.md`, `apps/api/src/scripts/make-plate-fixtures.ts`, `apps/api/src/scripts/bedrock-eval.ts` -- fake fixtures keyed by image sha256; the eval's synthetic set.
- `apps/web/src/surfaces/ficha/ensaios-section.tsx:228-489` -- `TestSection` (already renders `testVoltageCheck`), `MeasurementTable` (connection headers then `table.columns`), `formulaHelper` line.
- `e2e/seed-v11.spec.ts`, `e2e/oil-dry.spec.ts`, `e2e/qgbt.spec.ts`, `e2e/plate-every-type.spec.ts`, `e2e/support/palette.ts` -- patterns for the new specs; `e2e/support/groups.ts` `SERIAL_SPECS`.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/seed/seed.test.ts` -- FIRST pin `V11_HASH` (hash of today's v11) beside `V10_HASH`; later pin `V12_HASH` and a test listing v12's differences from v11.
- `packages/domain/src/seed/schema.ts` -- add, all optional: column role `'voltage'` and `options` (a select's pt-BR option texts, only on that role, refined); table `voltage_rows` (one `{ default_kv: string | null; winding: string | null }` per table row, refined to the row count, `winding` a number field of the nameplate); test `criterion_class_field` (a nameplate select key, refined to exist).
- `packages/domain/src/seed/v12.ts` (new) -- from v11: (a) transformador_forca, tp, tc: `tipo_de_isolacao` options `['EPÓXI', 'Á SECO', 'ÓLEO MINERAL']`, `option_aliases { 'ÓLEO': 'ÓLEO MINERAL' }`, `oil_rule.oil_values ['ÓLEO MINERAL']`; (b) transformador_forca: `tipo_do_oleo` select `['A', 'B']` right after `tipo_de_isolacao`, added to `oil_rule.fields`; `ligacao_secundaria` label `DESLOCAMENTO ANGULAR` (key, options, `ratio_factor` unchanged); (c) tp: TC v10 checklist, `na_defaults ['vasamento']`, `oil_rule.items ['vasamento']`; `exatidao` select `['0,3', '0,6', '1,2']` appended; (d) tc: `exatidao` becomes a select `['0,3', '0,6', '1,2', '3', '5P', '10P']`; both ratio tests get `criterion_class_field: 'exatidao'`; (e) every block's `isolacao` test tables: a voltage column `{ label: 'TENSÃO', unit: 'kV', role: 'voltage', derived: false, options: [...] }` APPENDED after the existing value columns (indices of existing columns unchanged), `voltage_rows` per row: transformer `[{null,'tensao_nominal_at'},{null,'tensao_nominal_at'},{'1','tensao_nominal_bt'}]`, every other row `{null,null}`; library measurement tests untouched; (f) `not_tested_reasons`: insert `{ key: 'defeito_no_equipamento', label: 'Defeito no equipamento', justification: <authored>, defect: true }` before "Outro"; (g) `inspecao_qgbt` (22.11): library type, label `Inspeção de QGBT`, `print_title "QGBT/QD's"`, nameplate `identificacao` and `fabricante` (the quadro's definitions), `tensao_nominal` (V), `corrente_nominal` (A); checklist = the quadro's visual items (Design Notes); `tests: []`; `sub_blocks ['nameplate', 'checklist', 'observations', 'conclusion']`; no subtypes.
- `packages/domain/src/seed/definitions.ts` -- register v12, `SEED_VERSION = 'v12'`; `defect-reason.ts` comment.
- `packages/domain/src/schemas/block-config.ts` and the per-type maps -- `inspecao_qgbt` (TAG `QGBT`, nouns `inspeção de QGBT` / `inspeções de QGBT` / `Inspeções de QGBT`, caption word `quadro geral de baixa tensão` m. sing., conclusion noun `A inspeção do QGBT`, web label `Inspeção de QGBT`), TOTALS_ORDER after `quadro_eletrico`.
- `packages/domain/src/relatorio/row-voltage.ts` (new, exported from `packages/domain/src/index.ts`) -- `TEST_VOLTAGE_OPTIONS_KV`, `rowTestVoltage(block, test, row)` -> `{ col, kv, source: 'typed' | 'default' | null, notice }` (typed cell `{raw, unit 'kV', state 'measured'}`; else the row's `default_kv`; else the instrument's `test_parameter` in kV when it is an option; else null), `rowVoltageNotice` (Design Notes); `evaluateSheetReadings` exposes it on `EvaluatedRow.voltage` and the column on `EvaluatedTable.voltageColumn`, never in `columns` nor `typedColumns` (never missing, never judged).
- `packages/domain/src/relatorio/accuracy-class.ts` (new) -- `parseAccuracyClass(text)`, `accuracyClassDeviation(cls)` (measurement: the class %; 5P, 10P: 3), `ACCURACY_CLASS_HELPER` (authored); `effectiveCriterion` reads the class when `criterion_class_field` is set (then `criterion_override` as today); the evaluation exposes the helper when the field is set and empty.
- `packages/domain/src/print/section-9.ts` -- a `voltageColumn` helper inserts header `TENSÃO (kV)` and each row's text right after the connection columns, only when the table has a voltage column; the voltage column never prints in its storage position.
- `packages/domain/src/print/group-for-print.ts` -- in `outros`, an `inspecao_qgbt` node moves after the run's last `quadro_eletrico` node (stable; no quadro: tree order).
- `packages/domain/src/reading/build.ts` -- (i) an `exatidao` select value passes `parseAccuracyClass` before option matching; (ii) when the output has `tipo_do_oleo` and no `tipo_de_isolacao`, and the definition's `tipo_de_isolacao` offers `ÓLEO MINERAL`, add a `tipo_de_isolacao` row ÓLEO MINERAL citing the `tipo_do_oleo` tokens, trust `verify`.
- `apps/api/src/jobs/reading/providers/bedrock.ts` -- prompt version `bedrock-structuring-5`; per-field lines: TIPO is the maker's type or model designation, never the oil; "Tipo óleo isolante B" is TIPO DO ÓLEO = B; TIPO DE ISOLAÇÃO is ÓLEO MINERAL when the plate names insulating oil; EXATIDÃO is the class exactly as printed ("0,6C25", "10P20") sent as text, not forced to an option. Update the prompt tests.
- `apps/api/src/jobs/reading/providers/fixtures/` + `make-plate-fixtures.ts` + `bedrock-eval.ts` -- one oil transformer plate (prints "Tipo óleo isolante B", "TIPO TRICAST", no insulation word) and one TC plate printing "0,6C25" with their fake answers; the oil plate joins the eval's synthetic set.
- `apps/web/src/surfaces/ficha/ensaios-section.tsx` (+ `copy/pt-br.ts`) -- a React Aria select per row for the voltage column (after the connection cells, mock class names of the existing selects), committing the existing cell put; the notice and the class helper as `helper` text; 390 px fit.
- `packages/domain/src/contract/version.ts` -- `CONTRACT_VERSION` 32 and `MIN_CONTRACT_VERSION` 32, each with a self-contained "32 (2026-11-06, Stories 22.7 to 22.9 and 22.11, batch e22s)" paragraph (a v31 bundle cannot resolve seed v12, parse an `inspecao_qgbt` block create or the new not-tested reason key).
- Tests: seed (v12 diff, every v12 insulation type has the column, TP checklist, QGBT definition, v5/v11 untouched), oil-rule with ÓLEO MINERAL, row-voltage and notice boundaries (0,5 / 1 / 2,5 kV on 220 V, empty BT, instrument "5.000 V", non-option), accuracy class (parser table, criterion at 0,84 % on 1,2 and at exactly 1,2 %, 5P, empty, override), section-9 print (v12 column, v11 identical), group-for-print, build.ts compositions (plumbing), api: reading job with the two fixtures (plumbing), a sync integration test pushing an `inspecao_qgbt` create and a voltage cell put on v12.
- `e2e/seed-v12.spec.ts` (new, `@p0`) -- through the UI on a new relatório: transformer nameplate options and labels; ÓLEO MINERAL vs EPÓXI checklist; TP checklist; per-row voltages (defaults, change one, notice at 10 kV on 220 V, conclude still works); TC EXATIDÃO 1,2 with 0,84 % SATISFATÓRIO; Não ensaiado "Defeito no equipamento"; asserting the outbox/store, then the DOCX text (TENSÃO column, "± 1,2 %", DESLOCAMENTO ANGULAR). `e2e/qgbt-inspecao.spec.ts` (new, `@p0`): palette to DOCX (group position, section 3 count, photo attached).
- Update every e2e spec that the v12 content changes (labels, ÓLEO, TP items, table columns, counts, plate fixtures): read seed values from the kernel, never as literals; specs pinned to an older seed stay.
- Docs: mark `source-deltas.md` rows 155 and 156 "(built, batch e22s)" for 22.7 to 22.9 (plus one sentence each for OQ-1 and the QGBT reading); `docs/kbs/architecture/kernel-and-seed.md` (seed v12) and `docs/kbs/log.md`; `_bmad-output/implementation-artifacts/deferred-work.md` under an `e22s` heading.

**Acceptance Criteria:**
- Given a new relatório, when it is created after this change, then its `seed_version` is v12, and a relatório already on v5 or v11 keeps its seed and prints as before.
- Given a v12 transformer with a 10 kV megger, when the operator changes SECUNDÁRIO/MASSA from 1 to 0,5 kV, then the store holds that cell `{raw '0.5', unit 'kV'}` at the voltage column's index and the DOCX row prints "0,5".
- Given a v12 painel, when "Inspeção de QGBT" is added from the palette, then its TAG reads QGBT-…, and the DOCX prints it under "Outros equipamentos" after the full QGBT sheets with its photo, and section 3 counts it.

## Design Notes

- **OQ-1, the notice limit.** The DoR says "above 0,5 kV is the limit for a winding of 220 V; the bands are the Quadro elétrico's", while Bruno writes "0,5 ou 1 kV na BT" and "Incluir o teste em BT de 1kV" and the AC wants the notice to suggest "0,5 or 1 kV". Under the 500 V band the 1 kV default itself would warn on every 220 V transformer. Reading taken (Bruno's words win; listed in the PR as an open question): a winding rated at most 1000 V (`voltsOf` of the row's `winding` field) warns when its row is above 1 kV; above 1000 V rated, no notice. Text (authored): `Tensão de ensaio acima do suportado pelo enrolamento {LINHA sentence case} ({rated text}): use 0,5 ou 1 kV.`
- **The voltage column's place.** Appending it keeps every stored cell index of v12's existing columns equal to v11's (23 test files address `isolacao/cell/{row}/1`); print and screen draw it right after the connection columns.
- **QGBT checklist reading.** The quadro's items an inspection judges by eye: LIMPEZA INTERNA E EXTERNA, PINTURA, CORROSÃO DA CAIXA, FUSÍVEIS, ATERRAMENTO, BARRAMENTOS, ISOLADORES, FIAÇÃO INTERNA, PLACAS DE SINALIZAÇÃO, ORGANIZAÇÃO INTERNA, IDENTIFICAÇÃO DE CIRCUITOS (keys and phrases reused). Out: the operational checks (resistência de aquecimento, iluminação interna, lâmpadas de sinalização, relés e contatores, disjuntores termomagnéticos with its LIGA/DESLIGA/TRIP hint, instrumentos de medição) and REAPERTO GERAL (a maintenance action). Listed for Bruno.
- **Defect justification (authored):** `Os ensaios não foram realizados devido a defeito constatado no equipamento.`
- **Class reading:** a leading 5 or 10 followed by P is a protection class; otherwise the leading number is the measurement class and the rest (C25, P75, B…) the burden, ignored.

## Verification

**Commands** (only after `/private/tmp/claude-502/-Users-matheusvilella-Documents-estudos-fasor-app/4b366af1-2a1f-4c68-adfe-40511ad7328a/scratchpad/wave-a-gate/gate.done` exists; stack `fasor-e22s` via `podman compose` from the worktree, images `localhost/app-api-e22s` / `app-tools-e22s` already built, never build, untag or rmi; tools as `podman compose --profile tools run --rm --user root tools …`; logs under `.scratch-e22s/`):
- `pnpm lint` and `pnpm static` -- clean.
- `pnpm exec vitest run --project @app/domain <files>` while iterating, then `pnpm test:unit` -- green.
- `podman compose restart api`, then `pnpm test:api` -- green.
- Under `lockf -t 20000 /tmp/fasor-verify.lock` (nohup, polled log): `pnpm exec tsx scripts/e2e.ts <touched specs> --project desktop-chrome --project durability-desktop-chrome` -- green; the touched durability specs also on the matrix projects.
