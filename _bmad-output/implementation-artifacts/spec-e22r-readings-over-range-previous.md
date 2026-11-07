---
title: 'e22r: Stories 22.10 and 22.12, readings above range and the previous visit value (contract 32)'
type: 'feature'
created: '2026-11-06'
status: 'in-review'
baseline_revision: 'd7a77dea9cc7d4bed9af260d69a35c793cdc0feb'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-22-context.md'
warnings: ['batched', 'oversized']
# batched: 22.10 and 22.12 are both reading-cell and projection work on the same evaluation, print table and sheet cell, with no seed change (epic-22-context.md batch plan).
deferred: []
---

<intent-contract>

## Intent

**Problem:** A megger or micro-ohmmeter that shows OL cannot be recorded: ">", "OL" and "0L" are refused (`parse/pt-br-number.ts` `parseReadingPtBr`), so the technician types a guessed number. And nothing of a previous visit's readings reaches a later relatório (only `equipment.last_nameplate`, AD-25), though section 2 promises the comparison.

**Approach:** (22.10) A reading cell gains the stored state `over_range` (`{raw: limit, unit, state: 'over_range'}`), entered by typing ">2T", "> 2 TΩ", "OL", "0L" or by a "> limite" menu action; "OL" takes the picked instrument's new registry range for that test type; the kernel judges it (> criterion: within iff limit >= criterion; < criterion: out; ± and the relative/equals criteria refuse it). (22.12) The generate job writes `equipment/{id}/last_results` beside `last_nameplate`; the sheet shows "Anterior: …" under each capture cell and section 9 prints a MANUT. ANTERIOR column when the equipment has a previous value from another relatório.

## Boundaries & Constraints

**Always:**
- AD-1/AD-13: every parse, verdict, refusal, text and match lives in `packages/domain`; `apps/web` renders from IndexedDB and writes ops; `applyOp` stays the only reducer. New pt-BR strings follow AGENTS.md's three homes.
- Kernel and print rules reach every seed v1 to v11 (Bruno's v5 relatório included) and v12 when e22s merges; no seed file changes.
- A relatório whose equipment has no previous value from another relatório prints and shows exactly as today (Porto Seguro goldens unchanged; layout skeleton weights unchanged).
- New schema keys are optional and never defaulted (existing rows parse to the same bytes, replay byte-equal, AD-2/AD-3).
- `CONTRACT_VERSION` 32 and `MIN_CONTRACT_VERSION` 32 with this batch's own paragraphs in `contract/version.ts` (e22s also sets 32; the later merge keeps one bump and both paragraphs).
- Print changes in `print/section-9.ts` live in small named functions (`withPreviousColumn`, the over-range branch of the text helpers) so the merge after e22s (which owns the insulation table's columns) is mechanical.

**Never:**
- No plate or display reading (OCR/LLM contract `contract/ocr.ts`) proposes `over_range`; no change to `contract/ocr.ts`.
- No previous value is ever copied into a cell; no equipment history screen.
- No reorder, regroup, resize or renumber of sections, photos or existing tables; MANUT. ANTERIOR is appended as the last column of a reading table, nothing else moves.
- No seed version, no golden regeneration (unless the fixture turns out to carry `last_results`, then explained line by line).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error handling |
|---|---|---|---|
| OL with range | insulation cell, picked instrument `range_isolacao` = 2 TΩ, types "OL" | stores `{raw:'2',unit:'TΩ',state:'over_range'}`; shows "> 2" + unit slot TΩ; verdict within (> 400 MΩ); print "> 2 TΩ" (bare "> 2" when the VALORES header names TΩ) | - |
| OL without range | no instrument, or its range null, or range unit not convertible to the cell's units | nothing stored | refusal (authored): `Instrumento sem limite cadastrado: digite > e o limite (ex.: > 2 TΩ)`, the example unit the cell's default unit |
| Typed limit | ">2T", "> 2 TΩ", ">2000" on µΩ, "> 2,5 g" | over_range with that raw (canonical) and unit (suffix on insulation family, else the slot unit) | ">" alone, "> 0", "> -1", "> abc", "> 147 mΩ" (milliohm rule E5-Q7) refused as today's invalid text |
| Limit vs > criterion | limit 400 MΩ vs > 400 MΩ; 399 MΩ; 0,4 GΩ | within; out; within | units not comparable: no verdict |
| < criterion | resistencia_contato "> limite" with range 2 000 µΩ | out; floor (Story 22.4) Reprovado · Com restrições | - |
| ± criterion | any relacao_transformacao cell (capture or input) types "OL" or ">5" | nothing stored | refusal (authored): `O ensaio de relação de transformação não aceita valor acima do limite: informe o valor medido.`; no "> limite" menu item there |
| Measurement tests | number cell under an `absolute` criterion | same as seeded > / < rules | cell judged by `relative_to_lowest` or `equals_column`: refused with `Este valor é comparado com outros: informe o valor medido.` (authored); choice cells never offer it |
| Stored over_range where refused | an op written by hand/old path on a ± or relative cell | read as `invalid` (shows "> 2", no verdict) | never throws |
| Unit change | unit slot cycled on an over_range cell | rewritten with the same raw, new unit, still over_range | - |
| Previous value present | TR-1 issued rev 1 in relatório A with isolacao 4,9 GΩ; relatório B of the same obra opens TR-1 | cell empty; helper `Anterior: 4,9 GΩ (rev. 1, dd/mm/aaaa)` | - |
| Previous over_range | previous value over_range 2 TΩ | `Anterior: > 2 TΩ (rev. …)`; print "> 2 TΩ" | - |
| Re-issue of the same relatório | B rev 2 after B rev 1 wrote `last_results` | B still shows and prints A's values (the entry's `prior`) | - |
| No previous visit | equipment `last_results` absent/null, or only from this relatório with no `prior` | no helper, no MANUT. ANTERIOR column | - |
| Seed changed rows | previous row key not in this definition | that row's previous cell prints "-", no helper | - |
| Other block type | `last_results.block_type` differs from the block's | treated as no previous value | - |

</intent-contract>

## Code Map

- `packages/domain/src/parse/pt-br-number.ts` -- `parseReadingPtBr` (130-146) refuses ">"/"OL"; add the over-range parse beside it (`parseOverRangePtBr`), keep `parseReadingPtBr`'s signature.
- `packages/domain/src/schemas/entities.ts` -- `numberValueSchema` (31-35) state enum gains `over_range`; `registryRowSchemas.instrument` (174-193) gains optional `range_isolacao`, `range_resistencia_contato` (`instrumentTestDefaultSchema.optional()`); `equipmentRowSchema` (295-302) gains optional nullable `last_results` (new `lastResultsSchema`, shape in Design Notes).
- `packages/domain/src/relatorio/reading-cells.ts` -- `ReadingState` (38), `readStored` (306-317): read `over_range` with a positive DECIMAL raw; `EvaluatedCell` gains `overRange: { allowed: true } | { allowed: false; refusal: string }`.
- `packages/domain/src/relatorio/reading-evaluation.ts` -- `evaluateTable` cell build (207-245) displayText "> 2"; verdict loop (260-274) over-range rule; ratio test refuses; `markOutliers` keeps measured only.
- `packages/domain/src/relatorio/measurement-evaluation.ts` -- `readStored` reuse (281-292), `displayOf`, `applyAbsolute` (398-417) over-range rule; `parseMeasurementReadingPtBr` / `measurementReadingRefusal` (745-770) are THE input parse the web field calls: extend them to return an over_range value and take the instrument range.
- `packages/domain/src/seed/criteria.ts` -- `compareCriterion` (124-149), `scaleToUnit`; reuse, do not change.
- Readers of `state === 'measured'` that must also take `over_range`: `relatorio/conclusion.ts` 140, 146, 376 (floor, unjudged); `relatorio/reading-run.ts` 84, 128-141 (`worstReadings` text "> 2 TΩ"); `relatorio/ficha.ts` 104; `merge/conflicts.ts` 660 and `relatorio/measurement-suggestions.ts` 135 (display "> 2 TΩ"); `print/section-9.ts` 509 (`valoresUnit`), 570-577 (`readingText`), 838-844 (`measurementText`). Grep again for `'measured'` before finishing.
- `packages/domain/src/relatorio/instrument-pick.ts` -- `storedInstrumentHeader` gives the picked `instrument_id`; add `instrumentRangeOf(row, testKey | instrumentOf)` near `instrumentHeaderOf`.
- `packages/domain/src/ops/value-limits.ts` -- `'sheet/test/cell'` (141, shortStrings): add a check refusing a value with `state: 'over_range'` whose `raw` is not a positive plain decimal or whose `unit` is not a short string (op_invalid); `'equipment/last_results': SERVER_ONLY` beside 149.
- `packages/domain/src/ops/path.ts` (137, 279-282) -- new family `equipment/last_results`, same shape as `equipment/last_nameplate`; `ops/apply.ts` (577, 674) get/set; `ops/targets.ts` 139 and `ops/attribution.ts` 76 pointers for `last_results.relatorio_id`, `.issued_at` and the `prior` ones; `status/edited-since.ts` 70 `never(...)`; the family guard tests list it.
- `packages/domain/src/print/last-nameplate.ts` -- the model for new `print/last-results.ts` (projection from the frozen snapshot, which already carries the equipment rows, `schemas/snapshot.ts` 51).
- `apps/api/src/jobs/generate/job.ts` (488-498) -- add the `last_results` puts in the same batch after `lastNameplateOps`.
- `packages/domain/src/print/section-9.ts` -- `measurementTable` (736-754), `sideBySide` (761-764), `testParts` (766-781), `measurementTestPart` (851-878), `fittedColumns` (643); `Context` from `contextOf(snapshot)` (304) for the equipment rows.
- `packages/domain/src/contract/version.ts` -- `CONTRACT_VERSION` (~291) and `MIN_CONTRACT_VERSION` (488) to 32 with paragraphs.
- `apps/web/src/surfaces/ficha/measurement-field.tsx` -- the one number cell for seeded and measurement cells: parse/commit (120-150), Overflow `items` (251, "Não medido"), helper lines (279-296), read-only view (445-458).
- `apps/web/src/surfaces/ficha/ficha-ops.ts` 126 -- `testCellOp` value type gains `over_range`.
- `apps/web/src/surfaces/ficha/measurement-test-section.tsx` -- how measurement number cells reach `MeasurementField`; choice cells untouched.
- `apps/web/src/surfaces/ficha/nameplate-section.tsx` 157 -- how the sheet gets its equipment row (`own`); reuse for the previous values.
- `apps/web/src/surfaces/registries/instrument-panel.tsx` 389-406 -- `TestDefaultField` reused for the two range fields; copy in `apps/web/src/copy/pt-br.ts` / `ui.ts` (`testDefaultLabel`).
- `e2e/support/push-server-ops.ts` (`pushLastNameplate`), `e2e/nameplate-values.spec.ts` 40-66, `e2e/parecer-export.spec.ts`, `e2e/support/download.ts`, `e2e/support/relatorio-flow.ts` -- patterns for issuing, a second relatório of one obra, and reading the DOCX.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/parse/pt-br-number.ts` -- add `parseOverRangePtBr(input, {units, defaultUnit})` returning `{kind:'limit', raw, unit}` | `{kind:'ol'}` | `'invalid'` | null (not over-range syntax); "OL"/"0L" any case and whitespace; ">" then a reading parsed by `parseReadingPtBr` rules, raw > 0 -- one parse home (AR-10).
- `packages/domain/src/relatorio/over-range.ts` (new) -- `OVER_RANGE_TEXT_PREFIX = '> '`, `overRangeDisplay(raw)`, `overRangeText(raw, unit)`, `overRangeVerdict(limit, unit, criterion)` (> / >=: within iff scaled limit >= value; < / <=: out; null when not comparable), the two refusal texts and the no-range text, `isReadingValue(state)` (measured or over_range) -- one rule for both evaluations.
- `packages/domain/src/schemas/entities.ts`, `relatorio/reading-cells.ts`, `relatorio/reading-evaluation.ts`, `relatorio/measurement-evaluation.ts` -- state, read, display, verdict, `overRange` per cell, input parse taking `range: {raw, unit} | null` (the web passes it), as in the Code Map.
- Every reader in the Code Map's "Readers" bullet -- take `over_range` as a reading value; texts print "> 2 TΩ".
- `packages/domain/src/relatorio/instrument-pick.ts`, `schemas/entities.ts` -- `range_isolacao`, `range_resistencia_contato` and `instrumentRangeOf`; the range converts to the cell's units with `scaleToUnit` when its unit is not one of them, else none.
- `packages/domain/src/ops/value-limits.ts` -- the over_range value check and the server-only family.
- `packages/domain/src/print/last-results.ts` (new) + `ops/path.ts`, `ops/apply.ts`, `ops/targets.ts`, `ops/attribution.ts`, `status/edited-since.ts` -- the projection, keys, match and texts (Design Notes); export from the package index as `last-nameplate` is.
- `apps/api/src/jobs/generate/job.ts` -- write the puts.
- `packages/domain/src/print/section-9.ts` -- over-range text; `withPreviousColumn(table, texts)` appends a header "MANUT. ANTERIOR" (top header row gets an empty shaded cell where the table has two) and one cell per data row; band rows span one more; columns re-fitted by `fittedColumns`. Paired tables get it on both halves. Applied to seeded test tables and measurement tests when `previousResultsFor` answers an entry for the block.
- `packages/domain/src/contract/version.ts` -- 32/32 with a self-contained paragraph each for `over_range` + instrument ranges and for `equipment/last_results`.
- `apps/web/src/surfaces/ficha/measurement-field.tsx`, `ficha-ops.ts`, `measurement-test-section.tsx` -- write over_range; Overflow "> limite" beside "Não medido" when `cell.overRange.allowed` (with a range: writes it; without: puts "> " in the input, focuses it, shows the no-range text as the helper); the previous helper line under the cell (class `mf-helper`, never `role="status"`), from the kernel text; read-only view shows both.
- `apps/web/src/surfaces/registries/instrument-panel.tsx` + copy -- two fields "Limite de medição (Isolação)" and "Limite de medição (Resistência de contato)" (authored), committed like the test defaults.
- Spine AD-25 (strike + dated addition: `last_results` is the second projection that reaches a device), `SPEC.md` 174 non-goal struck with date, `source-deltas.md` rows 156 and 157 marked "(built, batch e22r)" with the narrowings, `docs/kbs/architecture/data-model.md` + `decisions.md` + `docs/kbs/log.md`, `deferred-work.md` under a "## e22r" heading -- the record.
- Tests: parser (every I/O row), evaluation boundary tests (limit equal, below, above the criterion; zero, negative; < criterion; ±; relative), `applyOp` of an over_range cell and of `equipment/last_results` (replay byte-equal), value caps; `last-results.test.ts` (projection, prior chain, key match on v5 and v11 definitions, other type, seed-changed row); section-9 print tests (column present / absent, paired tables, measurement test, over-range text with and without header unit, Porto Seguro golden untouched); api integration: generate writes `last_results`, company B pull never sees company A's projection, an over_range op with a bad raw refused through the sync route; web unit tests for the field and the panel.
- `e2e/over-range.spec.ts` (`@p0`, serial if it generates) and `e2e/over-range.durability.spec.ts` (`@p0`: type "OL", reload, the outbox/store holds the over_range value) -- AC 1 to 3 as a human (Cadastros range, pick, type, menu, DOCX text); `e2e/previous-visit.spec.ts` (`@p0`, in `SERIAL_SPECS`: generates) -- relatório A issued through the real generate job, relatório B of the same obra, helper + empty cell asserted in the store, B's DOCX holds MANUT. ANTERIOR with the value, an equipment with none prints no column.

**Acceptance Criteria:**
- Given an insulation cell whose picked 10 kV megger has `range_isolacao` 2 TΩ, when the technician types "OL", then the store holds `{raw:'2',unit:'TΩ',state:'over_range'}`, the cell shows "> 2" with TΩ, the row is within > 400 MΩ, and the DOCX prints "> 2 TΩ" (or "> 2" under a "VALORES (TΩ)" header).
- Given a contact resistance cell, when "> limite" is chosen with the instrument's range 2 000 µΩ, then the row is out of criterion and the sheet's effective conclusion (Story 22.4 floor) is Reprovado · Com restrições.
- Given a ratio cell, when "OL" is typed, then nothing is committed and the authored refusal shows; the Overflow offers no "> limite".
- Given an obra whose TR-1 was issued in revision 1 of relatório A with 4,9 GΩ on an insulation row, when relatório B of that obra opens TR-1's sheet, then the row shows "Anterior: 4,9 GΩ (rev. 1, dd/mm/aaaa)" and the cell stays empty in the store.
- Given B generates, when section 9 prints TR-1, then its insulation table has MANUT. ANTERIOR with "4,9 GΩ" on that row, and an equipment with no previous visit prints no such column.
- Given a revision is issued, when the job commits, then each equipment of the snapshot with readings holds `last_results` of that revision, company B never pulls company A's projection, and replaying the op log gives the same rows byte for byte.

## Spec Change Log

## Review Triage Log

### 2026-11-06 — Review pass
- layers: Edge Case Hunter and Verification Gap ran; Blind Hunter and Intent Alignment skipped (token economy; the integrated epic review covers them).
- verdicts: 10 findings — high 0, medium 3, low 4, false 0, maybe-false 3
- findings:
  - `[medium]` `[patch]` VG: the dictated cell's over-range write has no test — added a `dictation-surfaces.test.tsx` case (OL with and without a range).
  - `[medium]` `[patch]` VG: `instrumentRangeFor`'s measurement-test branch never runs — added a CTA case to `over-range.test.ts`.
  - `[medium]` `[patch]` EC: "> limite" with no range leaves "> " that commits as invalid on blur — the field clears a lone ">" on blur.
  - `[maybe-false]` `[defer]` EC: re-issuing an older relatório X after a newer Y makes X the top entry with Y as its prior (X shows Y's later values as "previous"; Z then sees X) — unverified medium; settled by ordering the chain by the visit's service date; `deferred-work.md` e22r.
  - `[maybe-false]` `[reject]` EC: two issues racing between freeze and commit lose a prior — the generate queue runs with concurrency 1 (`job.ts` header), so a later job freezes after the earlier commit; would be low.
  - `[low]` `[reject]` EC: a unitless over-range-allowed cell commits `unit: null` and the server refuses it — latent, every seeded and measurement number column carries a unit; the fix adds guards.
  - `[low]` `[patch]` EC: an entry whose keys match nothing prints a column of dashes — no column when no key matches (`last-results.test.ts`).
  - `[maybe-false]` `[reject]` EC: `focusAfterMenu` may not focus when another overflow menu is open — no surface keeps two menus open; would be low.
  - `[low]` `[patch]` EC: `over_range` is accepted on any AD-11 number path (nameplate, cabine) by a crafted op — the `number_value` rule refuses the state, with a boundary test.
  - `[low]` `[patch]` EC: the AC "no previous visit prints no such column" read against an entry with no match — same root cause and fix as the dashes row.

## Design Notes

**Projection shape** (`lastResultsSchema`): `{ relatorio_id, revision_number, issued_at, seed_version, block_type, readings: Record<string, {raw, unit, state}>, prior: <same without prior> | null }`. Key `${testKey}|${rowKey}|${colKey}`. Seeded tests: rowKey `${table.key}:${seed connection cells trimmed, joined '/'}`, `#${indexInTable}` when every connection cell is blank (typed TAP), `~${n}` appended to a repeated key; colKey the seed column label of a `capture` column. Measurement tests: `row.key`, `column.key`, number cells only. Only `measured` and `over_range` captures of enabled tests and printed rows; a block marked not tested, removed, or with no equipment gives no entry; an entry with no readings is not written (the older one stays, as `last_nameplate` does).

**Prior chain** (re-issues): writing for relatório X over the snapshot's existing value E: `prior = E === null ? null : E.relatorio_id === X ? E.prior : strip(E)`. Readers for relatório R (`previousResultsFor(equipment, block, relatorioId)`): the top entry when its `relatorio_id !== R`, else `prior`; then null unless `block_type` matches.

**Open questions, conservative reading taken (listed in the PR for Matheus/Bruno):** a limit below a > criterion is out (it cannot prove the criterion); MANUT. ANTERIOR is the table's last column, not inside the VALORES group; measurement tests carry number cells only; the instrument range is per test type in the registry (AR-18's pattern), read live from the registry at entry and stored by value in the cell.

**Wiring owner:** every AC is this batch's. e22s owns seed v12 and the insulation test-voltage column; the merge after e22s re-runs `section-9.test.ts`, `last-results.test.ts` and `previous-visit.spec.ts` on a v12 relatório.

**Texts:** cell text `overRangeText` "> 2 TΩ"; helper `Anterior: ${text} (rev. ${n}, ${formatDateOfInstant(issued_at)})`; a row with several captures prints its previous values in column order joined " · " ("-" for a missing one) in one MANUT. ANTERIOR cell, and each capture cell shows its own helper.

## Verification

**Commands:** (inside the `tools` container, `--user root`, after the api restart; see the launch prompt for the lock)
- `pnpm lint`, `pnpm static`, `pnpm test:unit`, `pnpm test:api` -- expected: green.
- `pnpm exec tsx scripts/e2e.ts e2e/over-range.spec.ts e2e/over-range.durability.spec.ts e2e/previous-visit.spec.ts e2e/ficha.spec.ts e2e/display-shots.spec.ts e2e/qgbt.spec.ts e2e/photo-numbers.spec.ts e2e/ratio-feeds-conclusion.spec.ts e2e/points-derived.spec.ts e2e/parecer-export.spec.ts e2e/document-pages.spec.ts e2e/nameplate-values.spec.ts e2e/cadastros.spec.ts --project desktop-chrome --project durability-desktop-chrome` -- expected: green (the orchestrator runs it under the host lock).
- `pnpm exec tsx scripts/e2e.ts e2e/over-range.durability.spec.ts e2e/ficha.durability.spec.ts e2e/lost-taps.durability.spec.ts --project durability-desktop-chrome --project durability-android-chrome --project durability-webkit` -- expected: green.
