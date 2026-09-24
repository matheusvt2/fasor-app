---
title: 'Stories 5.5-5.8: readings judged against the criterion, the continuous run, the instrument and the conclusion'
type: 'feature'
created: '2026-09-24'
status: 'done'
baseline_revision: 'b6511e3b423f38207bf56fb7f0a38722b7f7f16c'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-1-5-4-sheet-shell-cabine-nameplate-checklist.md'
warnings: ['batched', 'oversized']
deferred:
  - summary: >-
      Draft recovery ("Rascunho encontrado — Recuperar") of a typed but uncommitted reading has no e2e test.
    evidence: |-
      number-input.test.tsx and generated-text-field.test.tsx stub useDraftSource; the only draft e2e (5.1-E2E-004) covers a checklist observation.
    location: >-
      apps/web/src/components/number-input.tsx
    severity: medium
  - summary: >-
      A 5.8-E2E-001 run failed once at the Editar outbox poll during the fix pass; cause not found, later reruns green.
    evidence: |-
      Reproduced once more in the gate ("confirmed" read as the last text_status op); the likely cause is that outbox rows come back in op_id key order, not commit order, within one millisecond. The assertion now checks for the presence of the "edited" op; 3/3 green on repeat. Root cause not proven.
    location: >-
      e2e/ficha.spec.ts
    severity: low
---

<!-- batched: Stories 5.5, 5.6, 5.7, 5.8 plus the Batch A carry-over (nameplate number field) share one
surface (the sheet's Ensaios and Conclusão steps) and one kernel reading evaluation; one PR for token economy. -->

<intent-contract>

## Intent

**Problem:** The sheet's "Ensaios" and "Conclusão" steps are empty stubs (`ensaios-section.tsx`, `conclusao-section.tsx`): no reading can be typed, judged, attributed to an instrument or concluded. The nameplate number field (Batch A, PR #30 known-open HIGH) rewrites the text while the user is still typing ("3.3" + pause + "00" becomes 3,300).

**Approach:** Add one kernel reading evaluation (parse, unit, state, criterion verdict, outlier, ratio calc) that the Measurement table, `sheetProgress`, `suggestConclusionPair` and `composeConclusion` all read; build one shared pt-BR number input (parse on commit, "= 3.300 MΩ" echo while typing, never rewrites focused text) used by measurement cells and nameplate numbers; build the Measurement table with the continuous Enter run, the Instrument picker, the Conclusion control, and the shared Suggestion field / Generated text field.

## Boundaries & Constraints

**Always:** AD-1/AD-13: every parse, verdict, outlier, calc, count, suggestion and text lives once in `packages/domain`; `apps/web` renders the evaluation and writes ops only. "Out of criterion" has exactly one rule: `evaluateReading`/`evaluateSheetReadings` (below); nothing else calls `compareCriterion` for a sheet. Red is never used for a reading. Nothing blocks navigation or "Concluir ficha" except `sheetProgress`. Screens use the mock class names (report below); static copy in `copy/pt-br.ts` (`ficha` namespace), chrome in `copy/ui.ts`, derived text in the kernel. No network call in any of this.

**Never:** no "Ler visor", Dictation, camera or crop UI (hidden, not disabled; the Suggestion field's crop slot is an empty prop). Do not edit `sheet-state.ts` `sheetState`, the tree row, the Block card Overflow or `checklist-section.tsx` (parallel Batch C owns them). Do not decide "Não ensaiado" behavior beyond: `suggestConclusionPair` returns null when `block.not_tested !== null`. No criteria editing, no `criterion_override` UI. Do not edit `sprint-status.yaml` or `epics.md`. Never suggest Reprovado; never write a conclusion value the user did not tap.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| pt-BR parse | "3.300" / "3.7" / "13,8" / "0.500" | raw "3300" / "3.7" / "13.8" / "0.5"; echo "= 3.300 MΩ" while typing | "abc" -> invalid, helper, no op |
| Unit suffix | "147G", "330M", "3.7T", "147 g" on an insulation cell | {raw "147", unit GΩ} etc.; suffix only on the MΩ/GΩ/TΩ family | "147G" on a µΩ cell -> invalid |
| Unit default | row 2 empty, row 1 stored in GΩ | row 2 unit slot shows GΩ | first row: the column's seed unit |
| Out of criterion | 330 MΩ vs `>400 MΩ`; 300 µΩ vs `<250 µΩ` | amber field, helper "Abaixo do aceitável (>400 MΩ)" / "Acima do aceitável (<250 µΩ)", "Marcar Com restrições" | never a block |
| Unit scaling | 147 GΩ and 3,7 TΩ vs `>400 MΩ` | within (GΩ, TΩ scaled) | add `TΩ: 1e12` to `OHM_SCALE` |
| Outlier | A 330 MΩ, B 350 MΩ, C 0,33 MΩ (same table/column) | C: neutral field, "Fase C 1000× abaixo de A e B. Conferir?" `role=status` on blur | needs >= 2 other measured rows |
| Not measured | Overflow "Não medido" | `{raw:'', unit, state:'not_measured'}`, shows "-"; empty shows "—" | counts as filled |
| Ratio | TP: V PRIM 13800 V, V SEC 115 V, measured 120,135 | VAL CALCULADO "120,00", CONDIÇÕES "SATISFATÓRIO" (0,11 % <= 0,5 %) | inputs missing -> "—", no verdict |
| Ratio fallback | TP inputs empty, nameplate AT 13,8 kV, BT 115 V | VAL CALCULADO from the nameplate (13800/115) | unparseable input ("380/220") -> "—" |
| Enter run | Enter on last row of table 1 | focus first empty cell of the next table of the sheet; last cell of last table -> sticky primary button | Shift+Enter back |
| Instrument | pick "2E" | one `sheet/{b}/test/{t}/instrument` op with the copied header; field "2E — Megôhmetro"; expired -> "Calibração vencida em dd/mm/aaaa", still selectable | no instruments -> "Nenhum instrumento cadastrado" + "Cadastrar instrumento" -> `/cadastros` |
| Suggested pair | all C/NA, all within | amber row "Aprovado · Sem restrições?"; one tap -> result + restriction ops | any NC or out -> "Aprovado · Com restrições?"; row gone once any segment set; none when not_tested |
| Text lifecycle | pair set, text unconfirmed | composed on read, recomposes on change; "Confirmar" -> text + text_status confirmed + text_basis | later change after confirm -> "Sugerido: texto atualizado — Substituir", never overwrites |

</intent-contract>

## Code Map

- `packages/domain/src/parse/pt-br-number.ts` -- extend (do not duplicate): `parseReadingPtBr(input, {units, defaultUnit})` -> `{raw, unit} | null | 'invalid'` (suffix M/G/T, case-insensitive, optional trailing `Ω`/`ohm`, only when `units` is the insulation family); `formatDecimalGroupedPtBr(raw)` ("3300" -> "3.300", "1234.5" -> "1.234,5"); `numberEchoText(raw, unit)` -> "= 3.300 MΩ". Keep `parseDecimalPtBr`/`formatDecimalPtBr` behavior.
- `packages/domain/src/seed/criteria.ts` -- add `TΩ: 1e12` to `OHM_SCALE`; `compareCriterion` stays the only comparator, called only from the new readings module.
- `packages/domain/src/relatorio/readings.ts` (NEW, the ONE evaluation) -- cell addressing (document it also in `ops/path.ts` header): `row` = row index across the test's tables in table order (contato_aberto 0-2, contato_fechado 3-5), `col` = index into that row's table `value_columns` (single insulation capture `1 MINUTO` is col 1; TP ratio inputs 0,1, capture 3). This matches `packages/domain/fixtures/porto-seguro/op-log.ts:357-420` exactly -- do not change the fixture. Exports: `cellAddressesOf(definition, testKey)`, `evaluateReading(...)`, `evaluateSheetReadings(block, definition): TestEvaluation[]` (enabled tests only, via `enabledSubBlocksOf`) giving per table: title, criterion (`SEEDED_CRITERIA` by `criterion_key`, caption text via `formatCriterionValue`, source name), visible columns (capture/input/derived; `print` columns are not rendered), rows with connection label and cells `{address, role, state: empty|measured|not_measured|invalid, raw, unit, displayText, source: typed|nameplate|derived|null, verdict: within|out|null, helperText, outlier: {text}|null}`, and for ratio rows `calculated {raw, text}` + `condicao: 'SATISFATÓRIO' | null`. Ratio: calc = primary / secondary in base units (kV x1000 -> V; A/A), input effective value = typed cell, else nameplate (TP/transformador: `tensao_nominal_at` kV -> V PRIMÁRIO, `tensao_nominal_bt` V -> V SECUNDÁRIO; TC: `relacao` text "200/5"); deviation % = |measured - calc| / calc x 100 compared through `compareCriterion` (`±0,5 %`); CONDIÇÕES "SATISFATÓRIO" only when every capture of the row is within; out -> the capture cell's helper "Fora do aceitável (±0,5 %)". Outlier: value in criterion units, >= 100x below (or above) every other measured cell of the same table+column with >= 2 others; factor = largest power of ten <= smallest ratio; text "{Row} {factor}× {abaixo|acima} de {others}. Conferir?" with row label = first connection cell sentence-cased ("FASE C" -> "Fase C"), others' shared "Fase " prefix dropped, pt-BR list join ("A e B", "A, B e D"). Also `unitDefaultFor(evaluation, address)` (previous row same column, else column unit) and `INSULATION_UNITS = ['MΩ','GΩ','TΩ']`, `nextUnit(unit)`.
- `packages/domain/src/relatorio/sheet-progress.ts` -- `ensaios` counts, per address of enabled tests, capture cells not filled plus input cells whose effective value (typed or nameplate) is missing (print/derived never); `conclusao` = result unset (1) + restriction unset (1) + (restriction `com_restricoes` and `sheet.observations` empty) (1). Update its header comment and tests.
- `packages/domain/src/relatorio/conclusion.ts` (NEW) -- values `result: 'aprovado'|'reprovado'`, `restriction: 'sem_restricoes'|'com_restricoes'` (the fixture's words, `op-log.ts:520`), `text_status: 'confirmed'|'edited'`. `suggestConclusionPair(block)` -> `{result:'aprovado', restriction} | null` (null when not_tested, or any segment set, or nothing measured and nothing answered); `conclusionSuggestionText(pair)` -> "Aprovado · Sem restrições?"; `composeConclusion(block, definition, equipmentTag)` -> `{text, criteriaLine, basis}` (fixed template per block type, see Design Notes); `conclusionTextState(block, composed)` -> `'unconfirmed'|'confirmed'|'edited'|'stale'` (stale = stored text_basis != composed.basis); `conclusionTextForPrint(block)` -> stored text only when text_status is confirmed|edited, else null ("not printable"); `restrictionWarning(block)` -> "Há itens não conformes" when sem_restricoes and any NC; `observationRequired(block)`.
- `packages/domain/src/relatorio/instrument-pick.ts` (NEW) -- `instrumentHeaderOf(row, testKey)` -> `{instrument_id, code, manufacturer, model, serial, cert_number, calibrated_at, valid_until (calibrationValidUntil), test_parameter (the row's `test_<testKey>` formatted "5 kV", or null)}`; `instrumentFieldText(header, name)` -> "2E — Megôhmetro" (store nothing extra: resolve `name` from the registry row by id, fall back to model); `instrumentExpiredText(header, serviceEnd, now)` -> "Calibração vencida em dd/mm/aaaa" | null (reuse `calibrationCheck` logic on `valid_until`; extract a `calibrationStatusOf(validUntil, serviceEnd, now)` in `checks/calibration.ts`); `lastInstrumentIdFor(blocks, testKey)` (the instrument cell with the greatest `op_id` among the relatório's blocks); `instrumentPickerOrder(instruments, lastId)` (last used first, then by code).
- `packages/domain/src/ops/apply.ts` `assertSeedPath` -- for `sheet/test/cell` also reject a row/col outside the geometry or a `derived` column (print columns stay writable: the fixture writes them `not_measured`).
- `packages/domain/src/index.ts` -- barrel the new modules.
- `apps/web/src/surfaces/ficha/ficha-fields.tsx` `NumberField` + `useTypedText` -- the carry-over bug: resync from the stored value only when the input is not focused AND the stored raw differs from the parse of the local text. Replace `NumberField`'s input with the new shared `apps/web/src/components/number-input.tsx` (local text, commit on blur/Enter only (no idle commit), draft source kept, `.mf-echo` echo "= 3.300 A" while focused and parseable, invalid helper as today).
- `apps/web/src/surfaces/ficha/measurement-field.tsx` (NEW) -- the cell: `NumberInput` + `.mf-unit.is-control.unit-cycle` tap-cycle button (>= 48x56, `aria-label` = spoken unit name from `copy/ui.ts`) only on the insulation family, fixed `.mf-unit` span otherwise; `data-state="out-of-limit"` + `.mf-helper[role=status]` + `btn btn-text` "Marcar Com restrições" (emits only `conclusion/restriction = com_restricoes`); `.outlier-helper[role=status]` rendered after blur; not-measured shows "-" ; Overflow (`OverflowMenu`) "Não medido"; phone `.unit-suffix-row` chips M · G · T shown while a cell of the insulation family is focused below 768 px.
- `apps/web/src/surfaces/ficha/ensaios-section.tsx` -- fill the stub: one `.section` per enabled test (stacked), per table `.mt-title-row` (`.mt-title`, `.mt-criterion` "Aceitável >400 MΩ", `<details class="ficha-details mt-source">` chevron revealing "aceitável na ficha"), Instrument picker in the test header, `<table class="measurement-table">` with `th scope=col` connection + visible value columns; `td.cell-calc` read-only with "calc." mark whose accessible text is "calculado"; ratio tables `measurement-table ficha-ttr is-wide`, below 768 px rendered as `.measurement-cards > .measurement-card` instead; continuous run keyboard (Enter/Shift+Enter/Tab, last cell -> sticky primary via a ref or `id` on `sticky-action-bar.tsx`'s primary button). Keep the anchor `id="ficha-step-ensaios"`.
- `apps/web/src/surfaces/ficha/instrument-picker.tsx` (NEW) -- `.field.combobox.instrument-picker`, closed `.ip-code` + `.ip-name`, `<details class="ficha-details">` detail (`Série, RBC e validade` summary), `.ip-expired` amber line always visible when expired; list from the local registry (`registry` instruments, non-removed) in `instrumentPickerOrder`; empty -> "Nenhum instrumento cadastrado" + button "Cadastrar instrumento" navigating to `/cadastros` (default tab is Instrumentos). Reuse an existing Combobox/listbox component if one fits (`apps/web/src/components/index.ts`), else React Aria.
- `apps/web/src/components/suggestion-field.tsx` (NEW, shared) -- `.field.suggestion-field[data-state=suggested]`, `.suggested-pill` "Sugerido", `.confirm-btn`/`Confirmar`, optional `crop` slot (unused). `apps/web/src/components/generated-text-field.tsx` (NEW, shared) -- `.suggestion-field.is-generated > .generated-text[role=textbox][aria-multiline][aria-describedby=criteria]`, `.criteria-line` (`.cl-label` "Critérios usados"), `.generated-actions` (Confirmar, Editar, Substituir), stale line "Sugerido: texto atualizado — Substituir"; Editar -> textarea committing `text` + `text_status=edited` + `text_basis`.
- `apps/web/src/surfaces/ficha/conclusao-section.tsx` -- fill the stub: `.conclusion-control` with two `.conclusion-pair[role=radiogroup]` (`seg[role=radio][data-value]`, check icon, arrows, Delete clears -> null op; copy `components/tri-state-control.tsx`'s keyboard contract), suggestion row via `SuggestionField` above it, the sheet Observation field (`sheet/{b}/observations`, `.observation-field[data-required]` + hint "Obrigatória com restrições" when required), warning "Há itens não conformes", the Generated text field. Keep `id="ficha-step-conclusao"`.
- `apps/web/src/surfaces/ficha/ficha-ops.ts` -- add `testCellOp(row, col)`, `testInstrumentOp`, `conclusionOp(field, value)` builders.
- `apps/web/src/surfaces/ficha/ficha-surface.tsx:404-437` -- pass `api`, `snapshot`, `block`, `definition`, registry instruments (live query like `manufacturerRows`) to the two sections; primary button ref for the run.
- `apps/web/src/styles/app.css` -- translate `.frame-phone .mt-title-row .mt-actions` and `.frame-phone .conclusion-pair.is-verdict` only if rendered (AGENTS.md mock container selectors); the TTR card/table switch is a media query at 767.98px.
- `e2e/ficha.spec.ts:92-102,367-376` -- `paraRaioCells` seeds col 0 (a print column under this addressing); seed the capture column and the restriction instead.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- close the two stub entries; add the transformer "Adicionar TAP"/typed `TAP Nº` deferral (owner: later Epic 5 follow-up).

## Tasks & Acceptance

**Execution:**
- Kernel: `pt-br-number.ts`, `criteria.ts`, `readings.ts`, `sheet-progress.ts`, `conclusion.ts`, `instrument-pick.ts`, `checks/calibration.ts`, `ops/apply.ts`, `ops/path.ts` header, `index.ts`, each with Vitest covering every I/O-matrix row, the fixture-shaped addresses (TP ratio from `porto-seguro/data.ts:508`), and "same evaluation" (a reading out of criterion drives the field helper, the Com restrições suggestion and the criteria line identically).
- Web: `number-input.tsx`, `measurement-field.tsx`, `ensaios-section.tsx`, `instrument-picker.tsx`, `suggestion-field.tsx`, `generated-text-field.tsx`, `conclusao-section.tsx`, `ficha-ops.ts`, `ficha-surface.tsx`, `ficha-fields.tsx`, `sticky-action-bar.tsx`, `copy/pt-br.ts`, `copy/ui.ts`, `app.css`; component tests where a unit test is cheaper than e2e.
- E2E `e2e/ficha.spec.ts` (new tests; fix the two seeds above): `@p0` 5.5 type "3.300", "147G", "330" into insulation cells of a seccionadora, see the echo while typing, the amber helper and "Marcar Com restrições" setting the restriction segment, the outlier helper, reload persists; `@p0` 5.6 nine seccionadora readings typed with Enter only across both isolação tables and contact resistance, Enter on the last cell lands on the primary button, "Não medido" prints "-", a TP ratio row shows VAL CALCULADO and SATISFATÓRIO live; `@p0` 5.7 pick an instrument by code (seed one instrument, one expired), header text, expired line, remembered first on the next sheet of the same test, empty state link to Cadastros; `@p0` 5.8 suggestion row one tap sets both pairs, text composed, Confirmar, change a reading -> "Sugerido: texto atualizado — Substituir", Com restrições requires the observation, then "Concluir ficha" concludes; `@p0` carry-over: type "3.3", wait 1 s, type "00", blur -> the nameplate field reads 3300 after reload. `@p1`: phone 390 px TTR cards and M·G·T row; Shift+Enter; Delete clears a conclusion pair.

**Acceptance Criteria:** `_bmad-output/planning-artifacts/epics.md:1465-1558` (Stories 5.5-5.8) Given/When/Then as written, narrowed only by the Narrowings below, plus:
- Given a nameplate number field, when the user types "3.3", pauses past the idle time and types "00", then the input still reads "3.300" while focused, and after blur the stored raw is "3300".
- Given any reading judged out of criterion on the Measurement table, when the Conclusão step renders, then the suggestion reads "Aprovado · Com restrições?" and the criteria line names that reading (one kernel evaluation).

## Spec Change Log

## Review Triage Log

### 2026-09-24 — Review pass

Layers run: Edge Case Hunter, Verification Gap Reviewer. Skipped: Blind Hunter, Intent Alignment (token economy; the integrated Epic 5 review covers them).

- verdicts: 21 findings — high 0, medium 10, low 10, false 1, maybe-false 0
- findings:
  - `[medium]` `[patch]` A "Não medido" cell's input holds "-", so typing "5" commits -5 — fixed: input empty with "-" as placeholder.
  - `[medium]` `[patch]` Ratio input 0 or negative gives calc 0, an Infinity/NaN deviation judged out — fixed: calc only when primary and secondary > 0 and finite.
  - `[low]` `[patch]` Same root: "Infinity %" could print in the conclusion — fixed by the same guard (worstReadings skips rows without a calc).
  - `[medium]` `[patch]` Negative readings accepted by `parseReadingPtBr` — fixed: a leading "-" is invalid for readings.
  - `[medium]` `[patch]` Unit tapped on a focused measured cell, blur without typing: slot shows the new unit, stored keeps the old — fixed: the tap writes the re-unitized value whenever the text parses.
  - `[low]` `[patch]` Stale `unitChoice` overrides a stored unit changed remotely/by undo — fixed: any stored change resets it.
  - `[medium]` `[patch]` "Editar" did not store text_status edited nor stop recomposition, and a blur without change left the field stuck — fixed: Editar commits the text as edited at once, then opens typing.
  - `[low]` `[reject]` A stored `criterion_override` is ignored by the evaluation — no surface writes one (source-deltas row 33, spec Never: no override UI); adding it is new behavior, not a correction.
  - `[low]` `[patch]` Instrument list stays open after focus leaves — fixed: closes on focus-out and outside pointerdown.
  - `[low]` `[reject]` Clearing the result after confirming the text leaves `conclusionTextForPrint` returning the text — the sheet is then incomplete (sheetProgress) and the text shows stale; the renderer is Epic 7's; unlikely and needs a new guard.
  - `[low]` `[reject]` Confirm built from render-time composed text can store a stale basis if the block changes in the same instant — self-corrects (shows "texto atualizado — Substituir"); rare.
  - `[false]` `[reject]` Criteria line/paragraph name one reading per test, not every out reading — by design: EXPERIENCE.md:129 phrases it as the test's minimum ("resistência de isolação mínima de 330 MΩ"), the spec's Design Notes take the worst reading per test.
  - `[low]` `[reject]` `assertCellGeometry` would refuse future added TAP rows — TAP rows are deferred (Narrowings); that story updates the check.
  - `[medium]` `[patch]` (gap) `useTypedText` sent-queue fix untested — added the "abc" + pause + "def" case to 5.4-E2E-001.
  - `[medium]` `[patch]` (gap) "Concluir ficha" landing on Ensaios/Conclusão untested — new `@p0 5.8-E2E-002`.
  - `[medium]` `[patch]` (gap) "Substituir", "Editar" and "Há itens não conformes" not exercised in the sheet — extended 5.8-E2E-001.
  - `[medium]` `[patch]` (gap) Unit change on an unfocused stored reading untested — extended 5.5-E2E-001.
  - `[medium]` `[defer]` (gap) Draft recovery of an unsaved reading untested — filed disposition defer; the shared draft machinery is covered by 5.1-E2E-004.
  - `[low]` `[patch]` Nameplate number shows "3.300" after blur but "3300" after reload — fixed: grouped both ways.
  - `[low]` `[reject]` Stricter cell geometry makes older local op logs with out-of-table addresses fail to replay — nothing shipped; noted in the PR body.
  - `[low]` `[reject]` (counted with the previous row's family) Fixture `replay-small` rewritten for the geometry check — test data only, kept consistent with the golden snapshot.

## Design Notes

- **Addressing** is the fixture's (row across the test's tables, col into `value_columns`); `print` columns are not shown nor required, but stay writable.
- **Conclusion template** (kernel, `// authored:` pt-BR, one per block type via a noun map with article: "A seccionadora", "O disjuntor", "O para-raio", "O TP", "O TC", "O transformador", "Os cabos de entrada", "Os cabos de saída"): `{Noun} {TAG} ({fabricação}, {tensão} kV, {corrente} {unit})` (missing parts dropped, parens dropped when empty) + ` apresentou ` + for each enabled test with readings, its worst reading ("resistência de isolação mínima de 330 MΩ em T1–T2 (critério: >400 MΩ, aceitável na ficha)", "resistência de contato máxima de …", "desvio de relação de transformação de 0,8 % …") -- only out-of-criterion ones named, else "valores medidos dentro dos critérios de aceitação" -- + NC items (" e {observation} (item N, NC)", N = 1-based checklist index) else " e todos os itens verificados conformes" + "." + when com_restricoes or reprovado: " Recomenda-se a correção dos pontos indicados antes da próxima manutenção." Criteria line: each worst reading "R_iso T1–T2 330 MΩ · critério >400 MΩ" (R_iso, R_cont, RT) and each "item N NC", joined " · ". `basis` = FNV-1a hex of the canonical JSON of every input used (pair, identity values, evaluated readings, NC items and observations).
- **Narrowings (record, do not build):** transformer ratio keeps the seed's single TAP row; `TAP Nº` is not typed and no "Adicionar TAP" (deferred). `test_parameter` is the instrument's per-test default formatted, not typed on the sheet. The unit tap-cycle exists only on insulation cells (µΩ, V, A and ratio cells have a fixed unit).
- **OPEN QUESTIONS (conservative choice taken, list in PR body):** (1) ratio inputs fall back to the nameplate when untyped (AC "computed from the nameplate") and are shown as the input's placeholder; (2) the fixture's transformer stores V PRIMÁRIO 13800 under unit kV and V SECUNDÁRIO "380/220" -- with unit normalization such rows compute nothing or a wrong calc; kept, flagged; (3) CONDIÇÕES when out of criterion prints nothing (only "SATISFATÓRIO" is attested); (4) the picker lists every registry instrument (last used first), not only the relatório's `instrument_ids`, and picking one does not add it to them; (5) conclusion recommendation sentence and noun map are authored copy; (6) the `conclusao` step counts result, restriction and the required observation separately.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:unit -- readings conclusion instrument-pick pt-br-number sheet-progress criteria apply` -- expected: green.
- `docker compose --profile tools run --rm tools pnpm exec playwright test e2e/ficha.spec.ts` -- expected: green.
- `docker compose --profile tools run --rm tools pnpm verify > /tmp/verify-e5b.log 2>&1` -- expected: exit 0 (the orchestrator runs this once at the end).

## Auto Run Result

Status: done

**Summary.** Stories 5.5-5.8 plus the Batch A carry-over: one kernel reading evaluation (`relatorio/readings.ts`: parse, unit, state, criterion verdict, outlier, ratio calc with nameplate fallback, the Enter run, worst readings) read by the Measurement table, `sheetProgress`, `suggestConclusionPair` and `composeConclusion`; the shared pt-BR `NumberInput` (commit on blur/Enter, "= 3.300 MΩ" echo, never rewrites focused text) used by measurement cells and nameplate numbers; the Ensaios step (tables, unit tap-cycle, M · G · T chips, "Não medido", calc cells, TTR cards on phone, continuous run), the Instrument picker, the Conclusão step (Conclusion control, suggestion row, sheet Observation, Generated text field with criteria line).

**Files.** Kernel: `parse/pt-br-number.ts` (reading parse, grouping, echo), `seed/criteria.ts` (TΩ, `scaleToUnit`), `checks/calibration.ts` (`calibrationStatusOf`), `relatorio/readings.ts`, `relatorio/conclusion.ts`, `relatorio/instrument-pick.ts` (new), `relatorio/sheet-progress.ts` (evaluation-based counts, conclusion pair + required observation), `ops/apply.ts` (cell geometry and derived-column checks), `ops/path.ts` (addressing header), `text/plural.ts` (`listPtBr`), `index.ts`; fixture `replay-small` (one out-of-table cell address moved into the table). Web: `components/number-input.tsx`, `suggestion-field.tsx`, `generated-text-field.tsx` (new, shared), `surfaces/ficha/measurement-field.tsx`, `instrument-picker.tsx` (new), `ensaios-section.tsx`, `conclusao-section.tsx` (filled), `ficha-fields.tsx`, `ficha-ops.ts`, `ficha-surface.tsx`, `sticky-action-bar.tsx`, `ficha.css`, `copy/pt-br.ts`, `copy/ui.ts`, `public/sprite.svg` (`i-cycle`). E2E: `e2e/ficha.spec.ts` (8 new tests, two seeds fixed). `deferred-work.md` (stub entries closed, TAP deferral added).

**Review.** Two layers (Edge Case Hunter, Verification Gap); Blind Hunter and Intent Alignment skipped (token economy). 21 findings: 13 patched in one fix loop (5 medium edge cases, 4 medium coverage gaps, 4 low), 1 deferred (draft recovery of a reading, untested), 7 rejected (see the triage log for each reason). One flaky assertion found by the final gate was stabilized (5.8-E2E-001: wait for the stepper's focus landing; read outbox ops by presence, not by IndexedDB key order).

**Follow-up review recommended:** false (no high patched; the medium patches are covered by the new e2e and unit tests and the integrated Epic 5 review follows).

**Verification.** `pnpm test:unit` green (domain, web, tooling); `e2e/ficha.spec.ts` 14 tests green, 5.8-E2E-001 3/3 on repeat; full `pnpm verify` green at f9445de: lint, static, unit (domain 803, web 745, tooling 20), api 142, e2e `@p0` 64 passed.

**Residual risks.** Open questions 1-6 of the Design Notes stand (ratio nameplate fallback, the fixture's transformer units, CONDIÇÕES when out, picker list scope, authored conclusion copy, conclusão counting). The stricter cell geometry refuses older local op logs with out-of-table addresses (nothing shipped).
