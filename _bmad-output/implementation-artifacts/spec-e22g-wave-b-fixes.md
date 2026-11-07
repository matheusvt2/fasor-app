---
title: 'e22g: Epic 22 wave B fixes, the integrated review and Bruno''s test base'
type: 'bugfix'
created: '2026-11-07'
status: 'done'
baseline_revision: '538062a4'
review_loop_iteration: 1
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-22-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-22-wave-b-integrated-review-2026-11-07.md'
warnings: ['batched']
batched_reason: 'The fix batch of wave B: the integrated review B1, S1 to S6 and N1 to N9 and the three corrections from Bruno''s test base rev03 share section-9.ts, the over-range module and seed v12; one gate, one PR.'
deferred: ['N6', 'N8', 'N9 (accepted)', 'R8LAY app side (open question)']
---

# e22g: Epic 22 wave B fixes

## Intent

Close the wave B integrated review (`epic-22-wave-b-integrated-review-2026-11-07.md`, copied as is) on main
`538062a4` and take Bruno's test base rev03 answers to the coordinator's readings of Stories 22.8 and 22.9. Seed v12 is
not deployed: it changes in place (no v13), `V12_HASH` re-pinned. No contract bump: contract 32 is not deployed either;
its note gains the S4 refusal. Dev model opus, effort high; the orchestrator implemented it itself (token economy).
Layout protection (Bruno likes the document): print changes only by the asked delta.

## Decisions of record (coordinator, 2026-11-07, launch brief) and the dated narrowings

1. **B1.** TENSÃO and MANUT. ANTERIOR stay (Stories 22.8, 22.12). (i) N1: MANUT. ANTERIOR is decided per table.
   *Narrowing (2026-11-07, implementation): the two halves of a side-by-side pair (seccionadora and disjuntor contato
   aberto and fechado) decide together, so the pair still prints as one table.* (ii) A reading table whose columns'
   minimum widths exceed the page prints that table one step smaller: the largest of 8,5, 8, 7,5, 7 pt
   (`TABLE_TEXT_STEPS_HALF_POINTS`) at which every word is whole, 7 pt the floor; the kernel decides
   (`fittedColumns` -> `PrintTable.textHalfPoints`), the DOCX renderer applies it on the runs. No column dropped or
   abbreviated. *Narrowing (2026-11-07, measured): the kernel's word measure is conservative; the transformer
   insulation table of every seed v1 to v11 measures 59,8 em against the 58 em page and printed every word whole on the
   wave A PDF. A strict 58 em trigger would step every transformer sheet of every old relatório (Bruno's v5 included)
   down to 8,5 pt. The step-down decides at `READING_FIT_WIDTH_EM` = 60 em, so v1 to v11 without a previous visit print
   exactly as before (test-proved); the column distribution keeps the 58 em measure, so no weight changes.* (iii) The
   22.3 fit test covers every reading table of every seed version (v1 to v12), with and without a previous visit, one
   unit and mixed units with an over-range reading; a word wider than its column (at the calibrated width) fails.
   Goldens: the Porto Seguro goldens do not change (v1, no previous visit; the api golden test is green unchanged).
2. **S1.** The instrument range unit is normalised on read (`instrumentRangeOf`) and on Cadastros' commit
   (`normalizeOhmUnit`: µ U+00B5, μ U+03BC, "u", "micro"; "T", "TOhm", "tΩ", "tera"; m milli and M mega by case; a bare
   prefix is its Ω unit; the ohm sign and "ohm" are Ω). Unreadable: the cell says the limit's unit is unreadable
   (`overRangeMissingLimitText`), and Cadastros shows a helper in `.helper[data-tone="red"]`. Free text stays, no
   migration.
3. **S2.** The unit carry-over (Story 5.5 AC2) skips an `over_range` row in both evaluations (seeded tables and
   measurement tests): the last measured row's unit, else the column's.
4. **S3.** No non-outlier `.mf-helper` tone exists (`components.css` draws the base rule and `[data-tone="outlier"]`
   in `--fora-do-limite`). The "Anterior" line takes the default field helper's look, `.helper` (`components.css:80`,
   `--ink-secondary`), mirrored in `app.css` as `.mf-helper[data-tone="previous"]`, the comment naming the rule.
5. **S4.** A new value rule `plain_cell` (`ops/value-limits.ts`) on `sheet/nameplate` and `sheet/test/value`: any JSON as
   before (caps, open-value size) and never `state: 'over_range'`. Api tests through the sync route for each; the
   contract 32 note says so.
6. **S5 / R8LAY-E2E-001.** The experiment ran first (two `--repeat-each 10` runs under the lock, red 2 and 6 times, every
   red -33,03 px). Evidence: no scroll at any resize, blur or focus in 20 runs; the red is decided at 1280 by where the
   Enter run's last focus (the Sticky action bar's "Próxima ficha", a +399 px scroll from wherever the page stands)
   leaves the page, 200 px apart with or without the last capture's focus scroll before it. Neither review hypothesis
   holds. *Narrowing (2026-11-07, the fix the evidence supports): the test only; it places the title row 120 px under the
   viewport top and waits two still frames before its "a focus that arrives now" check (10 of 10 green). The app change
   (`onLayout` skipping a viewport resize) is not taken: nothing proves it. The question whether the run's end should
   focus the bar's primary with `preventScroll` goes to `deferred-work.md` (owner Matheus).*
7. **S6.** `selectOptionFor` reads through the class parser only on the field `ACCURACY_CLASS_FIELD` ('exatidao'), the
   constant `reading/build.ts` already keyed on, never on the options' shape.
8. **Bruno's test base rev03 (2026-11-07).** (a) TC 5P ± 1 % (IEC 61869-2), 10P ± 3 %, class 3 stays. (b) TP EXATIDÃO
   gains 3P (± 3 %) and 6P (± 6 %), "CONFERIR NA NORMA" in the seed comment. (c) The class reader takes the old NBR
   notation ("0,6C25", "10B100", "0,3P75") and the IEC one ("25VA 5P20", "12,5VA 0,3", "10P20"): a burden in VA is
   dropped anywhere, a P after 3, 5, 6 or 10 is a protection class, an A or B after 5 or 10 the NBR protection class of
   that error, a P after a measurement class a burden. (d) The transformer's high-voltage insulation rows default by
   TENSÃO NOMINAL AT: 601 V to 5000 V -> 2,5 kV, above 5000 V -> 5 kV (`ratingDefaultKv`). *Narrowing (2026-11-07): "unknown
   -> null as today" read as "no rating default, so the instrument's TENSÃO ENSAIO applies as today"; a rating at most
   600 V is read the same way (the brief names no band for it). The rule keys on a row with no seeded default and a
   winding, which in v12 is only those two rows; the SECUNDÁRIO row keeps its seeded 1 kV.*
9. **Notes.** N2 "acima de <limite> (limite do instrumento)" in the conclusion's reading clause; N3 the inspection's
   `print_title` 'INSPEÇÃO DE QGBT'; N4 a Reprovado sheet Não ensaiado for a defect reason is grouped "por defeito no
   equipamento" in the parecer summary; N5 a definition with no tests drops "sem valores medidos registrados"; N7 the
   row's cells and voltage select are named by `readingRowLabel` ("Primário/Massa", "Primário/Secundário"). **Accepted,
   no change:** N6 (MANUT. ANTERIOR on each half of the pair, as the PR tested), N8 (a defaulted row voltage follows the
   instrument, stated here for Bruno), N9 (R1's export not blocked while R2's is: the e22f S5 rule, "no Apto without a
   judged sheet; a stricter derived verdict stands").

## Code map

| File | Change |
|---|---|
| `packages/domain/src/print/section-9.ts` | `fittedColumns` step-down, `READING_FIT_WIDTH_EM`, `TABLE_TEXT_STEPS_HALF_POINTS`, `PrintTable.textHalfPoints`, `wordsWiderThanColumns(table, pageEm)`, per-table MANUT. ANTERIOR |
| `apps/api/src/jobs/generate/sections/section-9.ts` | runs sized from `textHalfPoints`; no size otherwise |
| `packages/domain/src/relatorio/over-range.ts`, `instrument-pick.ts`, `measurement-evaluation.ts`, `seed/criteria.ts` | `normalizeOhmUnit`, `overRangeMissingLimitText`, `overRangeUnreadableUnitText`, `instrumentRangeHelperText`, `OHM_UNITS`; S2 in both evaluations |
| `packages/domain/src/relatorio/reading-evaluation.ts` | S2 |
| `packages/domain/src/ops/value-limits.ts`, `contract/version.ts` | `plain_cell`; the 32 note |
| `packages/domain/src/relatorio/accuracy-class.ts`, `seed/select-option.ts`, `reading/build.ts`, `seed/v12.ts` | classes, notations, `ACCURACY_CLASS_FIELD`, TP 3P/6P, N3 title |
| `packages/domain/src/relatorio/row-voltage.ts` | `ratingDefaultKv` |
| `packages/domain/src/relatorio/conclusion.ts`, `reading-run.ts`, `parecer.ts` | N2 (`WorstReading.overRange`), N5, N4 |
| `packages/domain/src/relatorio/reading-cells.ts`, `readings.ts` | `readingRowLabel` (N7) |
| `apps/web/src/surfaces/ficha/ensaios-section.tsx`, `measurement-field.tsx`, `styles/app.css` | N7 names; S1 hint; S3 tone |
| `apps/web/src/surfaces/registries/instrument-panel.tsx` | S1 commit and helper (`ohmUnit`) |
| `e2e/review-layout-interaction-2026-10-08.spec.ts` | S5 |
| docs | `source-deltas.md` row 156, `epic-22-context.md` readings, `deferred-work.md`, KB (`kernel-and-seed.md`, `test-base.md`, `log.md`) |

## Acceptance criteria (each with its test)

- **B1.** Given every seed v1 to v12, every reading filled, with and without a previous visit, one unit or mixed units
  with an over-range reading, When section 9 is laid out, Then no word of a reading table is wider than its column
  (`print-fit.test.ts`, 48 cases; mutation: no steps -> 28 red). Given v1 to v11, one unit, no previous visit, Then no
  table carries a size. Given the boundaries (59,1 em, 64,1 em, past 7 pt), Then 9 pt, 8 pt, the floor. Given a stepped
  table, When the DOCX renders, Then each of its runs carries the size and no other size count changes
  (`docx-table-size.test.ts`); the issued v12 DOCX carries a sized TENSÃO (kV) run (`seed-v12.spec.ts`).
- **N1.** A sheet whose previous visit holds only its contact readings prints no MANUT. ANTERIOR on its insulation tables;
  a pair decides together (`last-results.test.ts`, `previous-visit.spec.ts`).
- **S1.** Kernel table of spellings, "uΩ" filling "OL", "ohm?" saying so (`e22g-wave-b-fixes.test.ts`); Cadastros commits
  "T" as TΩ and "uΩ" as µΩ, shows and clears the helper (`over-range.spec.ts`).
- **S2.** OL then an empty row: the column's unit (kernel); "150" typed after "OL" is stored 150 GΩ (`over-range.spec.ts`).
- **S3.** The line's computed colour is `--ink-secondary`, not `--fora-do-limite` (`previous-visit.spec.ts`).
- **S4.** Kernel `opValueIssue` and the api through the sync route (`value-limits.integration.test.ts`,
  `sync-cta.integration.test.ts`): refused `op_value_invalid`, never logged; measured applies.
- **S5.** `--repeat-each 10` green on R8LAY-E2E-001; before the fix 2 and 6 red of 10.
- **S6, 8a to 8c.** `e22g-wave-b-fixes.test.ts`, `seed-v12.test.ts`, `seed.test.ts`.
- **8d.** Kernel bands and fallbacks (`e22g-wave-b-fixes.test.ts`, `seed-v12.test.ts`); the e2e transformer on a 13,8 kV
  plate shows 5, 5, 1 and prints them (`seed-v12.spec.ts`).
- **N2 to N5, N7.** Kernel (`e22g-wave-b-fixes.test.ts`); N3 in the DOCX (`qgbt-inspecao.spec.ts`); N7 accessible names
  (`seed-v12.spec.ts`).

## Authored pt-BR strings (for Bruno)

- `Limite do instrumento com unidade não reconhecida ("uΩ"): corrija em Cadastros ou digite > e o limite (ex.: > 2 µΩ)`,
  and `(sem unidade)` for a blank unit.
- Cadastros: `Unidade não reconhecida: use µΩ, mΩ, Ω, kΩ, MΩ, GΩ ou TΩ (ex.: 2 e TΩ).`
- Conclusion: `resistência de contato máxima acima de 2.000 µΩ (limite do instrumento) em …` (and `resistência de
  isolação mínima acima de 2 TΩ (limite do instrumento)`).
- Section 9 title: `INSPEÇÃO DE QGBT <TAG>`.
- Parecer summary reason: `por defeito no equipamento` ("1 ficha foi reprovada por defeito no equipamento (TR-3).").
- Inspection conclusion: `A inspeção do QGBT … apresentou acúmulo de poeira e sujeira (item 1, NC).` (clause dropped).

## Spec Change Log

- 2026-11-07, implementation: B1's trigger calibrated at 60 em (decision 1 narrowing); S5 test-only (decision 6); the
  pair rule of N1 (decision 1).
- 2026-11-07, review loop (Edge Case Hunter 1, 3, 4, 5, 7): a voltage the winding's rating chose never shows the
  "use 0,5 ou 1 kV" notice (an AT rated 601 V to 1000 V); a burden glued to the class ("25VA5P20"); an A or B after a
  measurement class falls through to the class ("0,6A", "2,5B100"); "megohm" and "kilohm"; the R8LAY scroll retried
  inside its poll. Verification gaps closed: N1 in `previous-visit.spec.ts`, the S2 measurement-test half.

## Auto Run Result

- Implemented by the orchestrator (opus, high). Review: Edge Case Hunter (8 findings: 5 patched, 3 notes) and
  Verification Gap Reviewer (no unupdated assertion; 2 gaps closed, 3 known open), opus, one loop; Blind Hunter and
  Intent Alignment skipped (token economy; the integrated epic review covers them).
- Story gate on `08637dc0`: lint 0, static 0, test:unit 5514 of 5515 (the red, `template-composer-local.test.tsx`,
  untouched, at load 11.8; 17 of 17 alone), test:api 892 passed / 6 skipped (goldens unchanged), touched specs 127 of 127,
  `over-range.durability` on the matrix 3 of 3, R8LAY-E2E-001 `--repeat-each 10` 10 of 10.
- Mutation: B1 with no steps, 28 red in `print-fit.test.ts`; S5 before the test fix, 2 and 6 red of 10.
