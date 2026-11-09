---
title: 'e23b: seed v13 nameplate fields, the TTR per tap, applicability from the nameplate (Stories 23.7, 23.8, 23.9; contract 35)'
type: 'feature'
created: '2026-11-08'
status: 'in-progress'
baseline_revision: '5f86c8215957dae2a72ac290fa78c4308a3f0dee'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: max
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-23-context.md'
warnings: ['batched', 'oversized']
batched_reason: 'One data set (the v13 nameplate): 23.8 builds its rows from 23.7 TAPS and 23.9 reads 23.7 fields; one seed delta, one contract (35), one review and one gate (epic-23-context.md "Why these groupings").'
deferred: []
---

<intent-contract>

## Intent

**Problem:** On seed v13 the tests Bruno's base asks for depend on plate characteristics the product lacks (taps, winding material, temperatures, switch type, MCOV, cable plate...), the TTR has one typed row, and nothing reads the plate to decide whether a test applies.

**Approach:** Add decision K's fields to the v13 definitions (definition data, AD-21), let the v13 transformer ratio table take one row per tap of TAPS, and give v13 tests an `applies_when` condition the kernel evaluates into an NA state with a reason, revertible by a stored per-test override (`sheet/{b}/test/{k}/applicability`, contract 35). Everything new is reached only through v13 definition keys.

## Boundaries & Constraints

**Always:**
- AD-21: every behaviour hangs on a new optional, never-defaulted definition key; v1 to v12 definitions parse to the same bytes (`V12_HASH` and older pins hold), and the layout-lock goldens (`apps/api/src/jobs/generate/golden/layout-lock-v5|v11|v12/`) and the Porto Seguro goldens stay byte-equal. If anything would move one, STOP and report to the orchestrator: it is a defect, not a golden update.
- `seed/v13.ts` is shared with batch e23a, which adds to it in parallel: put this batch's whole delta in one clearly fenced section (`// --- e23b: Stories 23.7 to 23.9 ---`) with its own functions, applied in `cabinePrimariaV13()` after any e23a step; re-pin `V13_HASH` in `seed.test.ts` with a test block of its own heading.
- AD-1/AD-13: `packages/domain` computes the tap rows, marks, VAL CALCULADO, applicability, NA reason and every derived text; `apps/web` renders and writes ops only; `applyOp` is the only reducer.
- Strings per AGENTS.md "Where a new user-facing string goes": derived texts in the kernel (mark words, NA reason, the taps line, the applied band's sentence), static copy in `apps/web/src/copy/pt-br.ts` under keys of this batch only, chrome in `copy/ui.ts`. Mark every invented wording `// authored (Story 23.x, listed for Bruno)` and keep a list for the PR.
- Screens follow `mockups/prototype/screens/60-ficha.html` (#/ficha/TR1 lines 510-518 and 932-960; #/ficha/SEC-C05 lines 966-984; CSS lines 236-305) with the mock's class names (`tap-cell`, `tap-mark`, `tap-optional`, `ficha-ttr-taps`, `v13-line`, `v13-na`, `v13-na-pill`, `v13-na-band`, `band-text`, `band-sub`, `v13-applied-band`, `v13-na-body`, `is-applied`). The mock's `[data-route]` rules are translated into `apps/web/src/styles/app.css` with a comment naming the mock rule; `tokens.css`/`components.css` stay byte-identical. React Aria for the controls.
- e23f pitfall: at 768 px a control at the end of an Enter run can sit half under the Sticky action bar; the e2e checks the NA band's button and the last tap row are fully above the bar.
- Fixtures are synthetic; never copy a value, procedure or recommendation of Bruno's base; cite base rows by ID only.

**Never:**
- No change to TIPO DE ISOLAÇÃO (M-4 "ÓLEO ISOLANTE" belongs to Story 23.17 with "Natureza do líquido"), no liquid fields, no TC function (23.18), no capacitor fields, no new tests (23.15-23.21), no temperature correction (23.5) or its field helper text.
- Do not change the TTR Yd factor (B-2: √3/2 stays) or the TP insulation criterion (B-4: > 400 MΩ stays).
- No default fake reading fixture of an existing type changes (the e2e plate specs read them); v13 plates are new fixtures.
- No kernel refusal of a cell write because the test is NA (offline/two-device safety): NA hides the body on screen only.
- Do not run the paid eval; providers stay `fake`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| TAPS typed | "13,8; 13,2; 12,6; 12; 11,4" (also `·` or spaces as separators) in TAPS (kV) | stored `{raw:'13.8;13.2;12.6;12;11.4', unit:'kV', state:'measured'}`; shows "13,8 · 13,2 · 12,6 · 12 · 11,4"; helper "Na ordem da placa · 5 taps" | a repeated value, a non-number, a value not whole in V, or one entry only: invalid, nothing written |
| TAP ATUAL | TAPS filled | combobox of "N — V kV" rows; picks write the tap voltage as the number cell | TAPS empty: a plain kV number field |
| TP √3 | TENSÃO NOMINAL BT (or AT) of a v13 TP typed "115/√3" ("115/V3", "115/raiz3", any case) | stored raw "115/√3" (canonical), shows "115/√3"; ratio input = 115/√3 | "/√3" alone or "x/√2": invalid |
| TC dash | v13 TC RELAÇÃO "200-5" | ratio inputs 200 and 5, VAL CALCULADO computed | v12 TC "200-5" unchanged (no VAL CALCULADO) |
| TTR rows | v13 TAPS = 5 taps, TAP ATUAL = the 3rd | 5 rows in plate order; row key = tap in V (13800...); rows 1, 3, 5 marked (Extremo, Atual, Extremo); each VAL CALCULADO from its tap and plate BT with the group factor | TAPS empty: v12's one typed row (row 0) |
| Progress | readings on rows 1, 3, 5 only | test complete; unmarked empty rows read "Não medido" and count nothing | marked row empty: its captures missing |
| List edited | a tap holding readings dropped from TAPS | the row stays with its reading, after the plate rows, marked "Fora da placa", still judged and printed | api refuses new writes to a row not on the plate |
| NA by plate | v13 test `applies_when {op:'in', field:'tipo_seccionadora', values:[...fused option]}`, plate says no fuses | section shows pill + band "Não se aplica: TIPO DE SECCIONADORA sem fusíveis." and "Aplicar este ensaio"; body hidden; nothing missing; no floor; omitted from section 9 | empty field: applies unless the condition says `needs_value` |
| Override | tap "Aplicar este ensaio" | one op `sheet/{b}/test/{k}/applicability` = `'applied'`; applied band + "Seguir a placa" (writes null); counts, judges and prints as any test; survives reload | value other than `'applied'`/null, or on a test with no `applies_when`: refused |
| Plate meets | plate changed so the condition holds | applies with no override; a stored `'applied'` stays harmless | none |
| v12 | any v12 sheet | no tap rows, no NA, prints byte-equal | none |

</intent-contract>

## Code Map

- `packages/domain/src/seed/v13.ts` -- e23a's file: v13 = v12 + story steps. Add the e23b section here.
- `packages/domain/src/seed/v12.ts`, `v1.ts:29-110` (field helpers, `instrumentTransformerFields`, `TAP_ATUAL` text, ACIONAMENTO `['MANUAL/PUNHO']`), `v1.ts:480` (`TRANSFORMADOR_RATIO`, one typed row) -- the shapes v13 derives from.
- `packages/domain/src/seed/schema.ts` -- `fieldDefSchema` (:29), `tableDefSchema` (:120), `testDefSchema` (:218), `oilRuleSchema` (:261), `checkSeedV6Definition` (:281, reference checks), `blockDefinitionSchema` (:328). New optional keys go here with their refines and reference checks.
- `packages/domain/src/seed/measurement.ts:240` -- `measurementTestShape`: the later stories' tests are measurement tests, so `applies_when` and `initial_off` go on both grammars.
- `packages/domain/src/seed/seed.test.ts` -- hash pins (`V12_HASH`, `V13_HASH`), per-type seed tests.
- `packages/domain/src/seed/template.ts:35,62-96` -- `DEFAULT_OFF_SUB_BLOCKS`, `defaultBlockConfig*`: where `initial_off` starts a sub-block off.
- `packages/domain/src/parse/pt-br-number.ts` -- `parseDecimalPtBr`, `parseVoltagePairPtBr`, `formatDecimalGroupedPtBr`: add the list and the √3 parse/format here (AR-10: parsing only at this boundary).
- `packages/domain/src/relatorio/ficha.ts:286` -- `numberFieldValue(typed, unit, {pair})`: extend options with `list`/`sqrt3`; `fieldValueText` (:298) shows them.
- `packages/domain/src/relatorio/cabine.ts:96` -- `acceptsVoltagePair`, the precedent flag pattern; add kernel flags read from the FieldDef for the nameplate.
- `packages/domain/src/relatorio/reading-cells.ts:372-433` -- `nameplateNumber`, `nameplateFirstNumber`, `nameplateTap`, `nameplateRatioInput` (TC split `/[/:]/`): v13 dash and √3 reading.
- `packages/domain/src/relatorio/reading-evaluation.ts` -- `evaluateTable` (:166, rows from `table.rows`), `cellAddressesOf` (:142), `evaluateTest` (:403), `evaluateSheetReadings` (:422, filters by `enabledSubBlocksOf`), `failedRatioRows` (:442). Shared with e23a: put tap logic in a new `relatorio/tap-rows.ts` and call it from here with minimal lines.
- `packages/domain/src/relatorio/measurement-evaluation.ts` -- the measurement grammar's evaluation; NA must gate it as it gates the seeded grammar.
- `packages/domain/src/relatorio/reading-run.ts` -- the Enter run (must skip unmarked tap rows and NA tests).
- `packages/domain/src/relatorio/progress.ts`, `conclusion.ts` (`conclusionFloor` :129), `parecer.ts`, `pre-issue.ts` -- readers that must see an NA test as absent; grep `enabledSubBlocksOf(` and `evaluateTest(` for every reader.
- `packages/domain/src/relatorio/dry-insulation.ts:103-150` -- `isNameplateFieldExcused`, `nameplateMissingKeys` (required by default; `optional: true` excludes).
- `packages/domain/src/relatorio/oil-rule.ts:94` -- `isOilFieldExcused` (print reads it too, `print/section-9.ts:390`): add the dry-only fields.
- `packages/domain/src/ops/path.ts:46` -- `TEST_FIELDS`; `ops/apply.ts:451-532` -- `assertSeedPath`, `assertCellGeometry` (row range), the measurement-test `sheet/test` field rule (:494); `ops/apply.ts:572` `putSheet`; `schemas/entities.ts:512` sheet test entry shape (`TEST_ENTRY_KEYS` order); `ops/value-limits.ts:152` per-field value caps; `merge/conflicts.ts:304,421` per-cell conflict lists.
- `packages/domain/src/contract/version.ts:372,582` -- `CONTRACT_VERSION`/`MIN_CONTRACT_VERSION` (33 on this base; e23a takes 34).
- `packages/domain/src/types/definition.ts`, `types/duplicate.ts` -- company type schema and "Duplicar": every new v13 key must survive a duplicate and the company schema's reference checks.
- `packages/domain/src/print/section-9.ts` -- `nameplatePart` (:383), the ratio rows (:863), test omission of a switched-off sub-block.
- `apps/web/src/surfaces/ficha/ficha-fields.tsx:296` (`SheetField` by kind, `NumberField` `acceptsPair`), `nameplate-section.tsx` -- the plate; `ensaios-section.tsx` (`TestSection` :261, `MeasurementTable` :346, rows :460-560) and `measurement-test-section.tsx` -- the tests; shared with e23a and e23h: new UI in new files (`applicability-band.tsx`, `tap-atual-field.tsx`) and small call sites.
- `apps/api/src/jobs/reading/providers/bedrock.ts:78,213` -- prompt version `bedrock-structuring-5` and `plateFieldNotes`; `apps/api/src/scripts/make-plate-fixtures.ts`, `jobs/reading/fixtures/README.md`, `apps/api/src/scripts/bedrock-eval.ts:107` (`SYNTHETIC`).
- `e2e/support/company-type.ts`, `e2e/support/outbox.ts`, `e2e/support/palette.ts` -- type editor driving, outbox reads, kernel lists in specs.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/seed/schema.ts`, `seed/measurement.ts` -- add optional keys, each documented "Seed v13 (Story 23.x)": FieldDef `list: true` (number field, the plate's values in order), `pick_from: <list field key>` (number field picked from that list), `over_sqrt3: true` (number field also takes "N/√3"), `dash_ratio: true` (text ratio also read "A-B"); TableDef `rows_from: <list field key>` (only on a test's single table with `connection_typed`); OilRule `dry_fields: string[]` (fields an oil unit shows excused); TestDef and measurement test `applies_when` (discriminated on `op`: `in` {field, values}, `filled` {field}, `above`/`below` {field, value}, each with optional `needs_value: true` and `unmet` phrase) and `initial_off: true`. Reference checks at seed load (and in the company schema): field exists, `in` names a select and its options, `above`/`below` a number field, `pick_from`/`rows_from` a `list` field; refuse at load otherwise. -- the definition data AD-21 asks for.
- `packages/domain/src/seed/v13.ts` -- the e23b section, from decision K and Base rev08 `equipamentos[].campos` (TR-OL, TR-SE, DJ, SC, TP, PR, CB). Transformador de força: replace v12's text `tap_atual` in place by TAPS (`taps`, kV, `list`) then TAP ATUAL (`tap_atual_kv`, kV, `pick_from: 'taps'`; a new key so the copy chips never carry v12's text into a number); append after DESLOCAMENTO ANGULAR: IMPEDÂNCIA (`impedancia_pct`, %, optional), MATERIAL DO ENROLAMENTO (`material_enrolamento`, select Cu | Al), TEMPERATURA DO ÓLEO (`temperatura_oleo_c`, °C, optional, an oil field), TEMPERATURA DO ENROLAMENTO (`temperatura_enrolamento_c`, °C, optional, `dry_fields`), CLASSE TÉRMICA (`classe_termica`, select from TR-SE, optional, `dry_fields`); its ratio table gets `rows_from: 'taps'`. Disjuntor MT: MONTAGEM, TENSÃO DE COMANDO (text, base type), ACIONAMENTO, CONTADOR DE OPERAÇÕES (optional), TEMPO DE ABERTURA DO FABRICANTE and TEMPO DE FECHAMENTO DO FABRICANTE (ms, optional). Chave seccionadora: TIPO DE SECCIONADORA (select, base options), CORRENTE DO FUSÍVEL (A, optional), ACIONAMENTO + MOTORIZADO. TP: GRUPO DE LIGAÇÃO (`grupo_ligacao_tp`, select of the three NBR 6855 groups); TENSÃO NOMINAL AT and BT `over_sqrt3`. TC: RELAÇÃO `dash_ratio`. Para-raio: MCOV (kV), INVÓLUCRO (select), DESLIGADOR ÍNTEGRO (select SIM | NÃO, required). Cabos de entrada and de saída: `nameplate` sub-block first, CLASSE U0/U, ISOLAÇÃO, SEÇÃO (mm²), COMPRIMENTO (m), TERMINAÇÃO, CONDIÇÃO (selects with base options, labels and options upper-case pt-BR as FO.SERV-03 prints). Required/optional follows the base's `obrigatorio`, except the two temperatures, optional because Story 23.5 falls back to the ambient (decision B). No test carries `applies_when` (all are "Sempre", Base rev08 TR-OL-02/04, DJ-02/03, SC-02/03, TC-02/03, TP-02/03, PR-02, CB-02). -- Story 23.7.
- `packages/domain/src/seed/seed.test.ts` -- per-type v13 field tests, the delta from v12 pinned, `V13_HASH` re-pinned, a load refusal per bad `applies_when`/`rows_from`/`pick_from` reference. -- DoD 23.7, 23.9.
- `packages/domain/src/parse/pt-br-number.ts` (+ tests) -- `parseNumberListPtBr` / format, `parseOverSqrt3PtBr` / format, a reader for a stored √3 raw; `relatorio/ficha.ts` `numberFieldValue` options and `fieldValueText`; kernel flags `nameplateFieldInput(field)` for the web. -- 23.7 parsers.
- `packages/domain/src/relatorio/reading-cells.ts` -- `nameplateRatioInput`: a `dash_ratio` field splits on "-" too; an `over_sqrt3` raw reads N/√3; v12 paths unchanged. -- 23.7 AC 3.
- `packages/domain/src/relatorio/oil-rule.ts` -- `dry_fields` excused on an oil unit (screen, missing and print). -- 23.7 AC 1.
- `packages/domain/src/relatorio/tap-rows.ts` (new) + `reading-evaluation.ts` -- with `rows_from` and a valid list: one row per tap in plate order, row index = tap voltage in whole V, TAP Nº = 1-based position, V PRIMÁRIO = the tap (fallback, source `nameplate`), V SECUNDÁRIO = plate BT; marks `atual` (first row equal to TAP ATUAL) and `extremo` (first and last); unmarked rows: captures never missing, empty CONDIÇÃO reads "Não medido"; stored rows not on the plate appended after (row 0 = the pre-TAPS typed row, with v12's fallbacks), marked off-plate, judged and never missing; `EvaluatedRow.tap` carries position, volts, mark and on-plate; `cellAddressesOf`, `failedRatioRows` ("TAP 3"), `reading-run.ts` follow. Kernel texts: `tapMarkText`, `tapsLineText(n)`. -- Story 23.8.
- `packages/domain/src/ops/apply.ts` -- `assertCellGeometry` on a `rows_from` table: accept a row only when it is a tap in V of the block's current list (or, list empty, the seeded rows); refuse otherwise. -- 23.8 DoD.
- `packages/domain/src/relatorio/applicability.ts` (new) -- `testApplicability(block, definition, testKey)` → `{state: 'always'|'met'|'na'|'applied', reason, phrase}` and `isTestInForce`; N/A on the field is filled and matches no value or bound; select values read through `seed/select-option.ts`; reason "Não se aplica: {LABEL} {unmet}" (fallbacks per operator, authored), applied sentence "A placa diz {unmet}." Gate every reader: `evaluateSheetReadings`, the measurement evaluation, progress, `conclusionFloor`, parecer, pre-issue, section 9 (omit an NA test), the run; the screen evaluates an NA test only to show its band. -- Story 23.9.
- `packages/domain/src/ops/path.ts`, `schemas/entities.ts`, `ops/apply.ts`, `ops/value-limits.ts`, `merge/conflicts.ts` -- `TEST_FIELDS` += `applicability`; the entry key; accepted only on a test (either grammar) whose definition has `applies_when`, value `'applied'` or null, else refused; one cell, one conflict ("Aplicação", authored). -- 23.9 contract.
- `packages/domain/src/seed/template.ts` -- `initial_off` tests start disabled in `defaultBlockConfig*` (the template switch still removes a test, FR-11). -- 23.9 initial state.
- `packages/domain/src/contract/version.ts` -- `CONTRACT_VERSION = 35`, `MIN_CONTRACT_VERSION = 35` (34 is e23a's, merged first), one paragraph. -- 23.9.
- `packages/domain/src/types/definition.ts`, `types/duplicate.ts` -- the company schema takes and checks the new keys; "Duplicar" of a v13 type carries them (test). -- shared fact.
- `packages/domain/src/print/section-9.ts` -- v13 DADOS DO EQUIPAMENTO in seed order (list " · ", √3 as typed, dry/oil excusal "-"); TTR prints every evaluated row (TAP Nº position or "-" off-plate, V PRIMÁRIO the tap); NA tests omitted; v1-v12 output byte-equal. -- 23.7, 23.8, 23.9 print.
- `apps/web/src/surfaces/ficha/ficha-fields.tsx`, `tap-atual-field.tsx` (new), `nameplate-section.tsx` -- list and √3 number fields, the TAP ATUAL combobox (React Aria), MATERIAL as the existing select rendering. -- 23.7.
- `apps/web/src/surfaces/ficha/ensaios-section.tsx`, `measurement-test-section.tsx`, `applicability-band.tsx` (new), `apps/web/src/styles/app.css`, `copy/pt-br.ts` -- tap rows (table and cards) with `tap-cell`/`tap-mark`/`tap-optional` and the `v13-line`; inputs of a tap row drawn as `cell-dim` text; the NA pill, band, "Aplicar este ensaio", the applied band and "Seguir a placa", body hidden while NA. -- 23.8, 23.9 screen.
- `apps/api/src/jobs/reading/providers/bedrock.ts` -- `bedrock-structuring-6` (comment line), `plateFieldNotes` lines for TAPS (every tap in plate order), TAP ATUAL, MATERIAL, the √3 secondary and "200-5" as printed; the kernel parses (AD-13, E21-A4 P-2). `make-plate-fixtures.ts` + README + `bedrock-eval.ts` `SYNTHETIC`: one new synthetic plate per type with the new printable fields (new image names, default fixtures untouched); the reading's suggestions for list/√3 values (`verify` when ambiguous) in the kernel's plate-suggestion path. -- 23.7 AC 4.
- Tests -- kernel unit tests for every matrix row; `applyOp` tests; api integration tests through the sync route (`apps/api/src/sync/*.integration.test.ts`): a tap-row cell accepted and one refused out of range, `applicability` applied/cleared/refused value/refused on a test without a condition; reading job test with the v13 fixtures; print tests (section 9, v13 nameplate, tap rows, NA omission) and the layout lock re-run. -- DoD.
- E2E (`@p0` main ACs, assert committed outbox/store state, E12-A6): `e2e/v13-nameplate.spec.ts` (each type's new fields typed, TAPS/TAP ATUAL, DESLIGADOR missing, "115/√3" and "200-5" giving VAL CALCULADO); `e2e/ttr-per-tap.spec.ts` (5 taps, marks, readings on 1/3/5 complete, a dropped tap kept flagged, DOCX through download); `e2e/test-applicability.durability.spec.ts` (fixture: a company type duplicated from the v13 Chave seccionadora whose draft's test gets `applies_when` over TIPO DE SECCIONADORA through a draft put, published in the UI; NA band, override offline, reload, sync, DOCX present/absent, "Seguir a placa", plate change; 390 px fit; 768 px band not under the bar). Grep `e2e/` for every spec that fills or counts a transformer, disjuntor, seccionadora, TP, TC, para-raio or cable sheet (missing counts, steps, "N itens", plate fields) and fix literals from the kernel (E14-A3, E15-A3); list them in the report. -- DoD.
- Docs -- `source-deltas.md` rows (23.7, 23.9) dated 2026-11-08; spine dated notes under AD-3 (the field) and AD-21 (condition and tap rows are definition data); `docs/kbs/architecture/kernel-and-seed.md`, `docs/kbs/log.md`; `deferred-work.md` under heading "Epic 23 batch e23b". -- DoD.

**Acceptance Criteria:**
- Given a new v13 relatório with a transformador de força, when its nameplate renders, then it shows TAPS, a TAP ATUAL picked from them, MATERIAL DO ENROLAMENTO, the temperature its insulation calls for, IMPEDÂNCIA and, on a dry unit, CLASSE TÉRMICA.
- Given a v13 para-raio with DESLIGADOR ÍNTEGRO empty, when the sheet's progress is computed, then the field counts as missing.
- Given a v13 TP secondary "115/√3" and a TC ratio "200-5", when the ratio test reads them, then both parse to their nominal values and VAL CALCULADO is computed.
- Given a v13 fake plate fixture of each type, when the reading completes, then each new printable field is suggested, as `verify` where the wording is ambiguous.
- Given a v13 transformer with five taps and TAP ATUAL the third, when its TTR opens, then five rows show in plate order, rows 1, 3 and 5 are marked, each VAL CALCULADO follows its tap, readings on 1, 3 and 5 complete the test, and a tap dropped from TAPS keeps its row and reading, flagged.
- Given a v13 test whose condition names TIPO DE SECCIONADORA and a plate with no fuses, when the sheet renders, then the test shows NA with the composed reason, counts nothing missing and is absent from the DOCX; "Aplicar este ensaio" writes one `'applied'` op that opens the cells, counts, prints and survives reload; a plate meeting the condition applies it with the override harmless; two devices disagreeing raise the single-cell conflict.
- Given any v12 relatório, when it renders and prints, then nothing changes and the layout-lock and Porto Seguro goldens are byte-equal.

## Design Notes

- **Tap row key = the tap's voltage in whole V** (13,8 kV is row 13800). Story 23.8 leaves "key or index" to this spec: a position index would move a reading to another tap when the list is reordered or a tap removed, against "keeps every reading on its tap value"; the voltage key keeps it, lets an off-plate row still show its V PRIMÁRIO, and never collides with the pre-TAPS row 0. Cells are keyed `String(row)` already (`putSheet`).
- **Applicability** mirrors a switched-off sub-block for every reader but the screen, which shows the band. The override is per test, one cell; the kernel never writes it.
- **Open with Bruno, kept as read (PR "Open questions"):** temperatures optional (base says required; B's ambient fallback); DESLIGADOR ÍNTEGRO SIM | NÃO per the story, the base's "sem desligador" being the field's N/A; print of unmeasured unmarked tap rows (printed "-"); B-2 and B-4 untouched.

## Verification

**Commands (tools container, `podman compose --profile tools run --rm --user root tools ...`, logs in `.scratch-e23b/`):**
- `pnpm lint`, `pnpm static` -- 0 errors.
- `pnpm test:unit` -- green, including `seed.test.ts` pins and the new kernel tests.
- `pnpm test:api` (api restarted first) -- green; layout-lock and Porto Seguro goldens unchanged.
- `pnpm exec tsx scripts/e2e.ts <touched specs> --project desktop-chrome --project durability-desktop-chrome` under `lockf -t 20000 /tmp/fasor-verify.lock` -- green; durability specs touched also on the matrix projects.
