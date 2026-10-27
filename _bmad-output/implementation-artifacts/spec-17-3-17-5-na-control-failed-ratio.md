---
title: 'Stories 17.3 and 17.5: the "N/A" control and spelling; a failed ratio feeds the conclusion suggestion, the pre-issue rows and the parecer count'
type: 'feature'
created: '2026-10-27'
status: 'ready-for-dev'
baseline_revision: '9f0df21b'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'medium'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-17-context.md']
warnings: ['batched']
# batched: Stories 17.3 and 17.5 share one gate and one PR (batch e17b, Epic 17 wave A); they share no file, so
# they are built as two independent lanes (Part A, Part B) inside one worktree.
deferred: []
---

<intent-contract>

## Intent

**Problem:** (17.3) "N.A" is Bruno's old spelling and cannot be typed on a tablet's decimal keypad (E16-A1); he wants a tap control beside the field and "N/A" printed everywhere. (17.5) A ratio row INSATISFATÓRIO reaches the screen and the printed sheet, but the "Sem restrições" warning, the parecer count and its Critérios line never read it, so a sheet can be concluded and summarised as if nothing failed (UX pass F42, E15-A2; Bruno's answer 6: "deve puxar a sugestão").

**Approach:** (A) `NOT_APPLICABLE_TEXT` becomes "N/A" (the one home; no contract: the stored state carries no spelling), and every `acceptsNotApplicable` field renders a small secondary "N/A" button at its trailing end that commits the existing `not_applicable` put. (B) One kernel reader of the ratio verdict, `failedRatioRows`, built on `condicao`, feeds `suggestConclusionPair`, `restrictionWarning`, `composeConclusion`, the pre-issue `conclusion_stale` row and `parecerCounts` / `composeParecer`.

## Boundaries & Constraints

**Always:** defaults of `epic-17-context.md` (Matheus, 2026-10-27, confirmed) bind. AD-1/AD-13: the spelling, the verdict reading, every count and text live in `packages/domain`; `apps/web` renders and writes the existing puts only. pt-BR copy in its three homes (AGENTS.md); authored strings marked `// authored:` and listed in the PR for Bruno. Porto Seguro goldens byte-identical (no N/A, no failed ratio in the fixture). No emoji; English code and docs. The two lanes never touch each other's files ("Lane files" below); a file both would need is assigned to one lane.

**Never:** no new op kind, no contract bump, no seed change; the accepted typings (`N.A`, `NA`, `N/A`, `N.A.`, any case) stay; measurement cells never accept N/A nor render the control; `inputMode` stays `decimal`; the undo rule of 16.4 unchanged (the N/A commit is the existing put); no change to the conclusion `basis` bytes of a sheet without a failed ratio, nor to the parecer basis of a relatório without one; no edit to `epics.md` or `sprint-status.yaml`; no edit to `tokens.css` / `components.css`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| A1 spelling | `NOT_APPLICABLE_TEXT` | `'N/A'`; `isNotApplicableText` unchanged for the four typings | none |
| A2 control tap | nameplate POTÊNCIA NOMINAL holding 1.000 kVA, tap "N/A" | put `{ raw: '', unit: null, state: 'not_applicable' }` on `sheet/{id}/nameplate/potencia_nominal`; input reads "N/A", no `.mf-unit`, no `.mf-echo`; control gone; focus not moved to the next missing field | none |
| A3 control hidden | field holds N/A (stored or just typed "n.a") | no control rendered | none |
| A4 number over N/A | type "1500" + blur on an N/A field | measured put; "1.500" + unit; control shows again | none |
| A5 cleared | clear an N/A field + blur | null put (empty); control shows | none |
| A6 measurement cell | a test value field | no control, "n.a" still "Número não reconhecido" | helper as today |
| A7 readers | stored `not_applicable` anywhere | screen, cabine line, Sumário meta, conflicts dialog, audit, DOCX/PDF print "N/A" (no unit) | none |
| A8 QA G1 | plate reading over an N/A field | keep button name "Manter o digitado em ⟨label⟩, N/A" | none |
| A9 tap with dirty text | input focused with "12" typed, tap "N/A" | blur commits 12 (as today), then the tap commits N/A; the field reads "N/A" | none |
| B1 failed ratio only | TP v1: inputs 13,8 kV / 115 V (VAL CALCULADO 120,00), capture 125 (4,17 %), no NC | `suggestConclusionPair` = `{aprovado, com_restricoes}`; `failedRatioRows` names "Fase R" | none |
| B2 Sem restrições over it | B1 concluded `sem_restricoes` | `restrictionWarning` = authored ratio sentence; with NC rows too, one sentence naming both | none |
| B3 composed text | B1 | text has the ratio clause (as today), `criteriaItems` has `RT Fase R 4,17 % · critério ±0,5 %`; basis differs from the within case | none |
| B4 stale | concluded + text confirmed over a within capture, then the capture turns out | `preIssue` holds `conclusion_stale` naming the sheet | none |
| B5 parecer | sheet concluded `com_restricoes` over B1 | `parecerCounts().withRestriction` names it; Critérios line has the authored ratio item; hint counts it | none |
| B6 no ratio table | seccionadora | `failedRatioRows` empty; everything as today | none |
| B7 no captures | ratio inputs only | empty; suggestion as today (null while nothing measured) | none |
| B8 at the limit | capture 120,6 (exactly 0,5 % of 120) | within (`compareCriterion` ± inclusive as today); not failed | none |
| B9 one out among several | TR v9: three captures, one out | row INSATISFATÓRIO; one failed row named once | none |
| B10 all within / unjudged | captures within, or no VAL CALCULADO | empty; suggestion as today | none |

</intent-contract>

## Verification finding (17.5, 2026-10-27, run in the tools container against `9f0df21b`)

A TP v1 ratio row with inputs 13,8 kV / 115 V and capture 125: `condicao` = INSATISFATÓRIO and the capture cell's `verdict` = `'out'`. `suggestConclusionPair` **already answers** `com_restricoes` (it reads `cells.some(verdict === 'out')` over `evaluatedCells(evaluateSheetReadings(...))`, where ratio captures are judged by `deviationPct` against the ± criterion); `composeConclusion` **already** writes "desvio de relação de transformação de 4,17 % em Fase R (critério: ±0,5 %, aceitável na ficha)" and the criteria item "RT Fase R 4,17 % · critério ±0,5 %", and its `basis` hashes every cell's `verdict`, so `conclusion_stale` already fires when a row turns out after the confirm. The deferred row's claim about the suggestion is therefore stale since F42 landed; the real gaps are: `restrictionWarning` (NC items only), `parecer.ts` `restricted()` (stored restriction, NC rows, not tested) and the parecer's Critérios line and text. Part B closes those and makes every reader go through one helper so the rule holds in one place.

## Code Map

### Part A, Story 17.3 (lane A)

- `packages/domain/src/parse/pt-br-number.ts:143` -- `NOT_APPLICABLE_TEXT = 'N.A'` -> `'N/A'`; comments l.145-146. `pt-br-number.test.ts` expects "N/A".
- Kernel reader tests expecting the literal "N.A" (grep `"N\.A"`): `relatorio/ficha.test.ts`, `cabine.test.ts`, `sumario.test.ts`, `print/section-9.test.ts`, `merge/conflicts.test.ts`, `reading/value.test.ts`, `reading/display.test.ts`, `relatorio/sheet-state.test.ts`, `suggestions.test.ts`, `quadro-eletrico.test.ts`. Prefer asserting `NOT_APPLICABLE_TEXT`; keep the typed-spelling tests. Comments in `ficha.ts`, `cabine.ts`, `sumario.ts`, `section-9.ts`, `conflicts.ts`, `suggestion-group.ts`, `reading/value.ts`, `schemas/entities.ts`, `contract/version.ts` may say "N/A"; do not touch `relatorio/conclusion.test.ts`, `readings.test.ts`, `pre-issue-export.test.ts` (lane B's).
- `packages/domain/src/relatorio/suggestion-ops.ts:46` `suggestionValueText` -- QA G1: `isNotApplicableNumber(value)` first -> `NOT_APPLICABLE_TEXT`; today `numberShape` answers raw '' and the unit is appended ("kVA"). Test in `suggestions.test.ts` (l.348 pattern).
- `apps/web/src/surfaces/ficha/ficha-fields.tsx:321-392` `NumberField` -- the control. Render it when `acceptsNotApplicable === true && !showsNotApplicable`: `<button type="button" className="btn btn-secondary btn-na" aria-label={ui.notApplicable.markLabel(label)} onClick={() => number.commitValue({ raw: '', unit: null, state: 'not_applicable' })}>{ui.notApplicable.control}</button>` beside the `.measurement-field`, both inside a new wrapper `div.field-na-row` (the `.measurement-field` keeps its selectors: e2e locates `[data-field-key] input`, `.mf-unit`, `.mf-echo`). `commitValue` (`components/number-input.tsx:150`) commits through the field's `commit` (the same `NOT_APPLICABLE_NUMBER` put as a typed spelling), formats the text to `NOT_APPLICABLE_TEXT` and marks the text clean. Do not call `focusNextMissingField`. `ReadOnlyField` (l.722) gets no control.
- `apps/web/src/components/number-input.tsx` -- comments only ("N.A" -> "N/A"); `NOT_APPLICABLE_STORED_RAW` unchanged.
- `apps/web/src/copy/ui.ts` (`suggestionField` block l.100-124 pattern) -- new `notApplicable: { control: 'N/A', markLabel: (label) => \`Marcar ${label} como não aplicável\` }`, both `// authored:` (no mock draws the control; Story 17.3 default: a small secondary Button, DESIGN.md l.802).
- `apps/web/src/styles/app.css` -- new rules with a comment naming the source (DESIGN.md secondary Button, no mock rule): `.field-na-row { display: flex; align-items: stretch; gap: var(--sp-2); }`, `.field-na-row > .measurement-field { flex: 1; min-width: 0; }`, `.btn-na { flex: none; min-width: var(--touch-min); min-height: var(--touch-min); padding: 0 var(--sp-3); }` (44 px target satisfied by `--touch-min` 48 px). Phone 390 px: the row must not overflow (the field shrinks, the button keeps its width).
- `apps/web/src/surfaces/ficha/ficha-fields.test.tsx` -- expectations "N.A" -> "N/A"; new cases: the control renders only with `acceptsNotApplicable`; a tap commits `NOT_APPLICABLE_NUMBER`, shows "N/A", hides the control, no focus move; typing "1500" + blur commits measured and the control is back; clearing + blur commits null; a measurement-kind field (no flag) has no control.
- `apps/api/src/sync/sync.integration.test.ts:1085,1636` -- comments / test names only; leave as is.
- `e2e/na-number-field.spec.ts` -- extend 16.4-E2E-001 (not duplicate): expectations "N.A" -> "N/A" (input value, cabine line regex `N\/A`, PDF regexes); then at 390 px (`page.setViewportSize({ width: 390, height: 844 })`) on a TP's POTÊNCIA NOMINAL (`openTransformer` opens the transformer; a TP sheet is another block of the fixture, or tap the transformer's own POTÊNCIA NOMINAL after restoring a number: the story says "a TP's POTÊNCIA NOMINAL", any `acceptsNotApplicable` nameplate field of the fixture satisfies the AC; name the sheet used in the test title) tap `getByRole('button', { name: /Marcar Potência nominal como não aplicável/ })`, assert input "N/A", no `.mf-unit`, control count 0, the outbox op equals `NA`, the button's box fits inside the viewport width; a cabine field ("Potência instalada") the same way; reload keeps "N/A"; the preview PDF text has "N/A" where it had "N.A" (keep one preview run). Keep the spec in `SERIAL_SPECS` (already).
- Docs (lane A writes none; the orchestrator writes `source-deltas.md`, `glossary.md`, `docs/kbs/log.md`, `deferred-work.md` after both lanes return).

**Lane A files:** `packages/domain/src/parse/pt-br-number.ts` + test; `relatorio/suggestion-ops.ts`; `relatorio/suggestions.test.ts`; the reader tests and comment-only files listed above (not `conclusion*.ts`, `readings.test.ts`, `pre-issue*.ts`, `parecer*.ts`, `reading-evaluation.ts`); `apps/web/src/surfaces/ficha/ficha-fields.tsx` + test; `apps/web/src/components/number-input.tsx`; `apps/web/src/copy/ui.ts`; `apps/web/src/styles/app.css`; `e2e/na-number-field.spec.ts`.

### Part B, Story 17.5 (lane B)

- `packages/domain/src/relatorio/reading-evaluation.ts:253-261` -- `condicao` (F42). Add and export `failedRatioRows(evaluations: readonly TestEvaluation[]): FailedRatioRow[]` with `FailedRatioRow = { testKey: 'relacao_transformacao'; label: string; deviationText: string }` (label = `row.label`, "Fase R" / the TAP; `deviationText` = the worst out capture's `deviationPct` formatted as `worstReadings` does, "4,17 %"); one entry per row whose `condicao === 'INSATISFATÓRIO'`, in table order. Re-export through `relatorio/readings.ts` (the barrel l.28 pattern).
- `packages/domain/src/relatorio/conclusion.ts` -- `suggestConclusionPair` (l.84-101): `restricted` reads `failedRatioRows(evaluations).length > 0` beside the NC items and the out verdicts (the ratio rule in one place; behavior unchanged, now explicit). `restrictionWarning` (l.113-117): with `sem_restricoes` stored, compute `ncs` and `ratio = failedRatioRows(evaluateSheetReadings(block, definition))`; return `'Há itens não conformes'` (NC only, as today), `ratioWarningText(ratio)` (ratio only) or `'Há itens não conformes e ' + lowercased ratio phrase` (both). Authored: `// authored (Story 17.5, open for Bruno):` `ratioWarningText = (rows) => \`Há relação de transformação insatisfatória em ${listPtBr(rows.map(r => r.label))}\``. `composeConclusion`: text and criteria already name the ratio (verification finding); add nothing to the text; the basis stays byte-identical (it already hashes every verdict). Doc comment of `suggestConclusionPair` says "or any ratio row INSATISFATÓRIO".
- `packages/domain/src/relatorio/parecer.ts:87-91` `restricted(block)` -- also true when `failedRatioRowsOf(block)` is non-empty (a local helper: `findDefinition` + `evaluateSheetReadings` + `failedRatioRows`; empty for a sheet whose seed is unknown or whose ratio sub-block is disabled). `composeParecer` (l.206-266): group the failed ratios by sheet name (`countedSheets` order, live sheets, `not_tested === null`): sentence `// authored (Story 17.5, open for Bruno):` `Relação de transformação insatisfatória em ${plural(n, 'ficha', 'fichas')} (${listPtBr(names)}).` after the "Itens não conformes" sentence; Critérios item `relação de transformação insatisfatória (${names.join(', ')})` after the NC items; basis key `ratio: names` added only when non-empty (the `site` precedent, l.265). `parecerCounts` gains nothing new in shape: `withRestriction` already lists restricted sheets.
- `packages/domain/src/relatorio/pre-issue.ts:211-222` `staleConclusionNames` -- unchanged (reads `conclusionTextState` over `composeConclusion`); test only.
- Tests: `relatorio/readings.test.ts` (`failedRatioRows`: B6-B10, exactly at the limit, one out among several on the TR v9 table with `ratio_factor` sqrt3), `conclusion.test.ts` (B1-B3; helpers `block`, `measured`, `cell` l.31-58; a TP via `getDefinition('v1', 'cabine_primaria', 'tp')`, cells `'0': { '0': measured('13.8','kV'), '1': measured('115','V'), '3': measured('125', null) }`; l.125 literal `'N.A'` -> `NOT_APPLICABLE_TEXT`), `pre-issue-export.test.ts` (B4, the `R8CONC-UNIT conclusion_stale` describe l.137 pattern: confirm the text over a within capture, then write the out capture, expect the row), `parecer.test.ts` (B5 with `withSheets`/`conclude` l.30-60; a sheet with a failed ratio concluded `sem_restricoes` is restricted like an NC row; basis unchanged for a relatório without one).
- `e2e/ratio-feeds-conclusion.spec.ts` (new, `@p0`, parallel group: `openTransformerSheet` of `e2e/support/reading-ops.ts:352` resets Empresa B with a fresh standard relatório, no fixed ids) -- as `e2e/ficha.spec.ts:630-672` fills the TR ratio (TAP ATUAL "5", then `cellInput(page, '5, V primário')`, values 13,8 / 380 / 62,8 / 36,3 / 62,8), then opens the Conclusão section (stepper button `/^Conclusão,/`) and reads the amber suggestion row "Aprovado · Com restrições?" (`conclusionSuggestionText`); taps "Sem restrições" + "Aprovado" (the `radiogroup`s "Resultado" / "Restrições", `ficha.spec.ts:451-452`) and reads the authored warning; switches to "Com restrições", types the observation, confirms the text ("Confirmar"), concludes; asserts the outbox holds `conclusion/restriction` = `com_restricoes` (E12-A6); opens the Sumário parecer band and reads the hint "1 com restrições" and the Critérios line with the ratio item. Add the spec to nothing in `groups.ts` unless it loads a fixed-id fixture (it does not).

**Lane B files:** `packages/domain/src/relatorio/reading-evaluation.ts`, `readings.ts`, `conclusion.ts`, `parecer.ts`, `pre-issue.ts` (if at all), `readings.test.ts`, `conclusion.test.ts`, `pre-issue-export.test.ts`, `parecer.test.ts`; `e2e/ratio-feeds-conclusion.spec.ts`; `e2e/support/groups.ts` (only if needed). Nothing under `apps/web` unless `conclusao-section.tsx` must change (it renders `restrictionWarning(block)` at l.181 as is).

## Tasks & Acceptance

**Execution, Part A:**
1. `packages/domain/src/parse/pt-br-number.ts` + `pt-br-number.test.ts` -- "N/A" -- the one home.
2. `packages/domain/src/relatorio/suggestion-ops.ts` + `suggestions.test.ts` -- QA G1.
3. Reader tests listed above -- "N/A" expectations (comments optional).
4. `apps/web/src/copy/ui.ts`, `styles/app.css`, `surfaces/ficha/ficha-fields.tsx`, `ficha-fields.test.tsx`, `components/number-input.tsx` -- the control and its tests.
5. `e2e/na-number-field.spec.ts` -- extended.

**Execution, Part B:**
1. `reading-evaluation.ts` + `readings.ts` + `readings.test.ts` -- `failedRatioRows`.
2. `conclusion.ts` + `conclusion.test.ts` -- suggestion, warning, composition tests.
3. `pre-issue-export.test.ts` -- the stale row test.
4. `parecer.ts` + `parecer.test.ts` -- restricted, sentence, Critérios item, basis.
5. `e2e/ratio-feeds-conclusion.spec.ts` -- the spec.

**Acceptance Criteria (epics.md Story 17.3):**
- Given a nameplate or cabine number field that accepts N/A, on a 390, 768 and 1280 px viewport, when the engineer taps its "N/A" control, then the field commits `{ raw: '', unit: null, state: 'not_applicable' }` through the same put as the typed spelling, shows "N/A" at rest, the control hides, the next missing field is not skipped nor focused, and the Desfazer rule of Story 16.4 is unchanged (FR-61; AD-11).
- Given a field holding N/A, when the engineer types a number, or clears it, then the number commits as today and the control shows again.
- Given any reader of `NOT_APPLICABLE_TEXT`, when the sheet, the cabine lines, the Sumário, the conflicts dialog, the audit and the document render, then they print "N/A" (no unit), including relatórios whose value was typed as "N.A" before; measurement cells still refuse it.
- Given a tablet soft keyboard, when the field is focused, then the decimal keypad still comes up (`inputMode` unchanged).

**Acceptance Criteria (epics.md Story 17.5):**
- Given a sheet whose ratio table has a row INSATISFATÓRIO and no other finding, when the suggestion row, the restriction warning and the composed conclusion render, then the suggestion is "Aprovado · Com restrições?", the warning names the ratio row (authored sentence), the composed conclusion's basis includes it, and a sheet with every row SATISFATÓRIO suggests as today (FR-71; AD-1).
- Given a sheet concluded "Aprovado · Sem restrições" whose ratio row later turns INSATISFATÓRIO, when the pre-issue question runs, then the existing `conclusion_stale` row names the sheet.
- Given the parecer band, when its counts and hint compose, then a sheet concluded with restriction over a failed ratio counts in `withRestriction` as any restricted sheet, and the Critérios line names the ratio among the items.

## Design Notes

- Open question 1 (Part B, default taken, listed in the PR): the parecer treats a failed ratio as it treats an NC row, a restriction whatever the sheet's conclusion says (`restricted()`); the conservative alternative, counting only sheets concluded Com restrições, would let a sheet concluded Sem restrições over a failed ratio summarise as clean, which is the F42 case Bruno rejected.
- Open question 2 (Part A, default taken): the control's accessible name is "Marcar ⟨label⟩ como não aplicável" and its visible text "N/A"; both authored, for Bruno.
- A9: a tap while the input holds uncommitted text first blurs the input (its typed value commits as today), then commits N/A; two puts, both the existing kind, both undoable.
- A device on contract 26 that has not reloaded shows "N.A" until it does (no contract bump; say so in the PR).

## Verification

**Commands (tools container, `podman compose --profile tools run --rm --user root tools pnpm ...`, logs under `/tmp/*-e17b.log`):**
- `test:unit -- packages/domain apps/web/src/surfaces/ficha` -- green while iterating (the filter may be ignored: read the tail only).
- `podman compose restart api` after any kernel change, then `test:api` -- green.
- `lint`, `static` -- green.
- Under the host lock: `pnpm exec tsx scripts/e2e.ts e2e/na-number-field.spec.ts e2e/ratio-feeds-conclusion.spec.ts e2e/ficha.spec.ts e2e/cta.spec.ts e2e/qgbt.spec.ts e2e/review-concluir-text.spec.ts e2e/verificacoes-local.spec.ts --project desktop-chrome --project durability-desktop-chrome`, then `e2e/na-number-field.spec.ts --project durability-android-chrome` -- green.

## Spec Change Log

## Review Triage Log
