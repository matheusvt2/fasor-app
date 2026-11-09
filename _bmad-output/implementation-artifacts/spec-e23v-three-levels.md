---
title: 'e23v: temperature correction, three levels and the previous visit judging, contact pole deviation (Stories 23.5, 23.6, 23.14; contract 36)'
type: 'feature'
created: '2026-11-09'
status: 'in-review'
baseline_revision: '41454a6b7f541e6a472847854f2dda0f53b0b59b'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: max
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-23-context.md'
warnings: ['batched', 'oversized']
batched_reason: 'One verdict level (epic-23-context.md "Why these groupings"): 23.5 gives the corrected value 23.6 judges and compares, and 23.14 pole rule is the level first consumer; one seed delta, one contract (36), one review, one gate.'
deferred:
  - summary: >-
      The parecer names an arrester Reprovado only by its failed prerequisite (DESLIGADOR ÍNTEGRO NÃO) in the reasonless group, as if the engineer had chosen Reprovado.
    evidence: |-
      parecer.ts groups Reprovado sheets by ratio, out reading and defect; a prerequisite failure is none of them and lands in byReason.other ("Reprovado (PR-1)."). A fix needs a new reason group, an authored word and a parecer-basis key present only when used.
    location: >-
      packages/domain/src/relatorio/parecer.ts:341-347
    severity: medium
  - summary: >-
      The transformer's insulation table with the 20 °C column prints at 7,5 pt, not the 8 pt of the approved frame.
    evidence: |-
      fittedColumns measures 61,6 em at 8 pt against READING_FIT_WIDTH_EM 60; the batch left e22g's rule as is and pinned 7,5 pt (three-levels.test.ts). Matheus decides: accept 7,5 pt, or a rule change for v13.
    location: >-
      packages/domain/src/print/section-9.ts fittedColumns
    severity: medium
---

<intent-contract>

## Intent

**Problem:** On seed v13 an insulation reading is judged raw whatever the equipment's temperature; a reading has only two levels (within, out), so a cable phase far below the others, a transformer whose insulation halved since the last visit, an arrester whose disconnector operated or an uneven breaker pole never restricts the sheet; and the previous visit (`last_results`) is only shown.

**Approach:** New optional v13 test keys (`temperature_correction`, `restriction`, `criterion_status`) carry the base's numeric rules as seed data. The kernel corrects a measured capture to 20 °C, judges the corrected value, and adds a third verdict `restricted` (inside the criterion, flagged by a rule) that raises the floor to Aprovado · Com restrições and derives one point per test (stored origin `restricao`, contract 36). The ambient temperature and the previous visit are not on the block, so every evaluation reader takes an explicit `VisitContext` resolved from the cabine and the equipment row. `last_results` gains the corrected value so the next v13 visit can judge by it.

## Boundaries & Constraints

**Always:**
- AD-21: every new behaviour hangs on a v13 definition key; a v1 to v12 definition evaluates, prints and hashes (conclusion `text_basis`, parecer basis) to the same bytes with or without a context. `V12_HASH` and older pins hold; re-pin `V13_HASH` only.
- Layout lock: `apps/api/src/jobs/generate/golden/layout-lock-{v5,v11,v12}/` and the Porto Seguro goldens stay byte-equal (`git diff origin/main -- apps/api/src/jobs/generate/golden packages/domain/fixtures` shows additions only). If one would move, STOP and report to the orchestrator: a defect, not a golden update. Only v13 fixtures may gain goldens.
- AD-1/AD-13: the correction, the temperature source, every level, rule, reason, helper, point text, floor reason and printed text are computed in `packages/domain`; `apps/web` renders and writes ops only. Strings per AGENTS.md "Where a new user-facing string goes"; mark each invented one `// authored (Story 23.x, listed for Bruno)` and keep the list for the PR.
- Fixtures synthetic; cite base rows by ID only (`Base rev08 TR-OL-02`), never their texts. "PADRÃO FASOR" is a data status only: Fasor branding never appears in a user-visible string.
- Print delta only where the story names it; Bruno's layout is protected. Approved print (Story 23.1 dated line, Matheus 2026-11-08): the corrected column is headed `20 °C` inside the VALORES group, the table at 8 pt under the 60 em rule; the instrument header line gains TEMPERATURA (`40 °C (ÓLEO)`, `32 °C (ENROLAMENTO)`, `25 °C (AMBIENTE)`, `-`). A restricted row prints like any other (CONDIÇÕES SATISFATÓRIO, B-8); the restriction prints in the conclusion and in section 8.
- Screens from `mockups/prototype/screens/60-ficha.html` lines 255-258 (restricted state) and 891-925 (TR1 v13 insulation: `.v13-line` temperature line, the "Corrigido a 20 °C" `cell-calc` column with `calc-mark`, the card line "A 20 °C: <b class="t-value">…</b> calc.", `measurement-field[data-state="restricted"]`, `mf-helper[data-tone="restricted"]` with a bold "Com restrição:" lead). Translate the mock's `[data-route]` rules into `apps/web/src/surfaces/ficha/ficha.css` or `apps/web/src/styles/app.css` (comment naming the mock rule, declarations verbatim); `tokens.css`/`components.css` untouched.
- Parallel fix batch e23g edits `relatorio/sheet-progress.ts`, `types/draft-edit.ts`, `surfaces/ficha/ensaios-section.tsx`, `reading/display.ts`: keep this batch's edits there small and in their own commented blocks.

**Never:**
- No vague-term band (B-1: "ligeiramente acima", "muito acima", "queda acentuada"); no contact rule against the previous visit (B-6); no TP table (B-4); no change to the TTR (B-2).
- No 75 °C wiring (Story 23.15 wires it), no winding-resistance test, no IP judging (23.16), no restricted level in the measurement grammar (23.15 adds its first rule there).
- No change to `formatCriterionValue`, `withPreviousColumn`'s output, or any v1 to v12 reader result. No paid provider; `LLM_PROVIDER`/`OCR_PROVIDER` stay `fake`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Oil TF, plate temp | v13 TF ÓLEO, TEMPERATURA DO ÓLEO 40, AT row 2 GΩ | corrected 8 GΩ (2 x 2^((40-20)/10)) judged against the row criterion; helper/card "A 20 °C: 8 GΩ"; line "Temperatura 40 °C · do óleo, na placa…"; print TEMPERATURA `40 °C (ÓLEO)`, `20 °C` column `8` | none |
| Dry TF | TIPO DE ISOLAÇÃO EPÓXI, TEMPERATURA DO ENROLAMENTO 32 | factor 2^((32-20)/15); print `32 °C (ENROLAMENTO)` | none |
| Ambient fallback | TF plate temp empty, cabine TEMPERATURA 25; any DJ/SC (ambient only) | 25 °C used, source "AMBIENTE"; DJ/SC use the solid factor (/15) | none |
| No temperature | neither | raw judged; helper asks for the temperature; print `-` and corrected `-` | none |
| Bounds | 20 °C; 27,5 °C; -10; 110; -10,5; 111 | factor 1; fractional ok; both ends corrected; outside: raw judged, helper says out of the table | none |
| Medium unknown | TF TIPO DE ISOLAÇÃO empty | no correction (raw), helper asks for TIPO DE ISOLAÇÃO | none |
| Over range | "OL" on a corrected row | not corrected (Story 23.4 rules it); corrected column `-` | none |
| No correction | v13 cable, TC, TP, PR | no line, no column, raw judged as before | none |
| Cable phases | v13 cable A 5, B 5, C 1,5 GΩ (all > 400 MΩ) | C restricted (below 50 % of the largest other row); floor Aprovado · Com restrições; one `restricao` entry naming the test and "Fase C"; parecer Apto com restrições | none |
| Cable boundary | C exactly 50 % of the largest / one step below | within / restricted | none |
| History | v13 TF AT corrected 4 GΩ, previous v13 corrected 10 GΩ (drop 60 %) | restricted; helper names "rev. N, dd/mm/aaaa" and the previous corrected value | none |
| History boundary | drop exactly 50 % / just past | within / restricted | none |
| History not judged | previous on v12 (no `corrected`), current uncorrected, previous missing | no history verdict; "Anterior: …" shown as Story 22.12 | none |
| Arrester units | v13 PR A 10, B 10, C 4 GΩ | C restricted (below 50 % of the largest unit) | none |
| Prerequisite | v13 PR DESLIGADOR ÍNTEGRO = NÃO, readings within or none | floor Reprovado · Com restrições, the test's `reading` entry names the disconnector | SIM or empty: no effect |
| Poles | v13 DJ contact 40, 42, 70 µΩ, no manufacturer value | all within < 250; 70 restricted ((70-40)/40 = 75 % > 50 %); floor Com restrições | none |
| Pole boundary | 40 / 60 (exactly 50 %) / 60,01 | within / restricted | none |
| Manufacturer | same + manufacturer 60 µΩ | 70 out (Story 23.3), floor Reprovado | none |
| Over range in a comparison | one row "OL" | an over-range row enters a comparison at its limit as a lower bound; it is never restricted itself; a restriction is given only when certain | none |
| Stored point | point create origin `restricao`, test_key `isolacao` | accepted; suppresses the derived entry; a v35 client is refused 426 | unknown origin refused |
| v12 / v5 | any of the above on v12 or v5 | nothing changes; layout-lock goldens hold | none |

</intent-contract>

## Code Map

- `packages/domain/src/seed/schema.ts:254` `testDefSchema` (e23a/e23b keys at :277-306); `checkSeedV6Definition` (:363) and `checkSeedV13Definition` (:437) for reference checks -- add the three optional keys and their checks.
- `packages/domain/src/seed/v13.ts` -- add a fenced `// --- e23v: Stories 23.5, 23.6, 23.14 ---` section applied after e23b in `cabinePrimariaV13()`; field keys: TF `temperatura_oleo_c`, `temperatura_enrolamento_c`, oil rule on `tipo_de_isolacao`; PR `desligador_integro` (SIM | NÃO); contact test `resistencia_contato` on `disjuntor_mt` and `chave_seccionadora`.
- `packages/domain/src/seed/seed.test.ts` -- V13 pins; `seed/criteria-tables.ts:26` `CRITERION_ROW_STATUSES` (reuse for statuses).
- `packages/domain/src/relatorio/reading-cells.ts:42-215` -- `ReadingVerdict`, `EvaluatedCell`, `EvaluatedRow`, `TestEvaluation` (add optional fields only).
- `packages/domain/src/relatorio/reading-evaluation.ts` -- `rowCriterion` (375), `mediumOf` (345), `evaluateTable` verdict loop (~700-725), condicao (~727), `evaluateTest` (810), `evaluateSheetReadings` (867), `sheetTestSections` (887).
- `packages/domain/src/relatorio/sheet-evaluation.ts` -- `sheetReadings` memo (add the context level).
- `packages/domain/src/relatorio/over-range.ts:64` `overRangeVerdict`; `seed/criteria.ts` `compareCriterion`, `scaleToUnit`.
- `packages/domain/src/relatorio/cabine.ts:19` `cabineOf(locations, locationId)`; cabine `env.temperature_c` (`schemas/entities.ts:456`).
- `packages/domain/src/print/last-results.ts` -- `blockReadings` (113), `lastResults` (157), `previousResultsFor` (195), `previousReadingsByAddress` (217), `previousReadingText`; `schemas/entities.ts:345` `lastResultReadingSchema`.
- `packages/domain/src/relatorio/conclusion.ts` -- `DefinitionArg` wrappers (129-260, 279-330, 568-600), `computeFloor` (147), `ConclusionFloorReason` + `FLOOR_REASON_WORDS`, `composeConclusion` (440, basis keys only when present).
- `packages/domain/src/relatorio/reading-run.ts:119-198` `worstReadings` (verdict union, corrected value).
- `packages/domain/src/points/derived.ts` -- `DerivedPointKind`, `sheetEntries` (110), `pointSource`/`entrySource`, `resolvedOriginPoints`; `schemas/entities.ts:697` point `origin` enum.
- `packages/domain/src/relatorio/parecer.ts`, `relatorio/sheet-progress.ts:206,242`, `relatorio/pre-issue.ts`, `points/summary.ts`, `print/section-8.ts`, `print/section-9.ts` (`instrumentPart` 488, `measurementTable` 884, `testParts` 972, `fittedColumns` 777, `READING_FIT_WIDTH_EM`, `conclusionParts` 1147, `previousReadingsOf` 962) -- snapshot readers; resolve the context per block.
- `packages/domain/src/contract/version.ts:372,582` + `contract/contract.test.ts` -- 36/36.
- `packages/domain/src/types/definition.ts`, `types/duplicate.ts`, `types/draft-edit.ts`, `types/validate.ts` -- grep how `criterion_table` and `applies_when` are carried and pruned; mirror for the new keys.
- `apps/web/src/surfaces/ficha/ensaios-section.tsx:115-200` (`sheetTestSections`, `own`/`lastResults`), `measurement-field.tsx` (cell state and helper tone), `conclusao-section.tsx:210-320`, `use-ficha-actions.ts:150-175`, `use-ficha-data.ts:73`; `apps/web/src/surfaces/points/points-surface.tsx` (derived entry to point, origin mapping); `copy/pt-br.ts`.
- `apps/api/src/sync/*.integration.test.ts` (point create through the sync route, 426 precedent); `apps/api/src/jobs/generate/job.ts:501` (last_results puts).
- e2e: `e2e/previous-visit.spec.ts` (two relatórios of one obra, issue), `e2e/manufacturer-value.spec.ts`, `e2e/criteria-tables.spec.ts`, `e2e/test-applicability.durability.spec.ts`, `e2e/support/{relatorio-seed,outbox,groups}.ts`.

## Tasks & Acceptance

**Execution:**
- `relatorio/visit-context.ts` (new) -- `interface VisitContext { ambientC: number | null; previous: PreviousResults | null }`, `NO_VISIT_CONTEXT`, `visitContextOf(source: Pick<RelatorioSnapshot,'locations'|'equipment'>, block)`: ambient = the block's cabine (`cabineOf`) `env.temperature_c` when `measured` and a finite number; previous = `previousResultsFor(equipment, block, block.relatorio_id)`. Memoized so the same cabine row, equipment row and relatório give the same object (the memos key on it). -- the one source of the two outside inputs.
- `seed/schema.ts` -- TestDef optional, never defaulted: `temperature_correction: { to_c: 20, medium: 'oil_rule' | 'solid', oil_field?: seedKey, dry_field?: seedKey }` (fields: number °C of the nameplate; `oil_rule` needs the definition's oil rule); `restriction: { history_drop_pct?, below_largest_pct?, pole_deviation_pct?, prerequisite?: { field: seedKey, fails_on: string[] }, status: CriterionRowStatus }` (each pct in (0, 100); at least one rule; `history_drop_pct` needs `temperature_correction`; prerequisite names a select and only its options); `criterion_status?: CriterionRowStatus`. Document each "Seed v13 (Story 23.x)" with its base row. -- data, AD-21.
- `seed/v13.ts` -- e23v section: TF isolacao `temperature_correction {20, 'oil_rule', oil_field 'temperatura_oleo_c', dry_field 'temperatura_enrolamento_c'}` + `restriction {history_drop_pct 50, status 'PADRÃO FASOR'}` (TR-OL-02, TR-SE-02); DJ and SC isolacao `temperature_correction {20, 'solid'}` (DJ-02, SC-02); cabos_entrada and cabos_saida isolacao `restriction {below_largest_pct 50, status 'PADRÃO FASOR'}` (CB-02 between phases); para_raio isolacao `restriction {below_largest_pct 50, prerequisite {field 'desligador_integro', fails_on ['NÃO']}, status 'PADRÃO FASOR'}` (PR-02); DJ and SC resistencia_contato `restriction {pole_deviation_pct 50, status 'CONFIRMADO'}` + `criterion_status 'PADRÃO FASOR'` (DJ-03, SC-03; NETA MTS-2023 7.6.3/7.5.1). -- Stories 23.5, 23.6, 23.14.
- `seed/seed.test.ts` -- strip the e23v keys and get the pre-e23v v13 bytes; re-pin `V13_HASH`; load refusals for each bad reference. -- AD-21.
- `relatorio/temperature-correction.ts` (new) -- `insulationFactorTo20(tC, medium)` = 2^((t-20)/h), h 10 oil, 15 solid, null outside [-10, 110] °C (NETA 100.14's span); `windingResistanceTo75(r, tC, material 'Cu'|'Al')` = r x (K+75)/(K+t), K 235/225 (built and tested, not wired); `testTemperature(block, definition, test, visit)` -> `{ celsius, source: 'oil'|'winding'|'ambient', medium } | { missing: 'temperature'|'medium'|'range', celsius? }`; texts: screen line value/source, print cell, cell "A 20 °C: …", column header "Corrigido a 20 °C". -- Story 23.5.
- `relatorio/reading-cells.ts` -- `ReadingVerdict = 'within' | 'restricted' | 'out'`; `EvaluatedCell.corrected?: { raw: string; unit: string | null; text: string } | null` (present only on a corrected test; null without a temperature or on over range), `EvaluatedCell.restriction?: { reason: string; text: string } | null`; `TestEvaluation.temperature?` (line texts, print text, header) and `prerequisite?: { failed: true; text: string } | null`. -- additive only.
- `relatorio/reading-evaluation.ts` -- thread `visit: VisitContext = NO_VISIT_CONTEXT` through `evaluateTest`, `evaluateSheetReadings`, `sheetTestSections`; in `evaluateTable` judge a measured capture by its corrected value when one exists; then apply the test's `restriction` rules on cells already `within` (new module `relatorio/restriction.ts`: history against `previousReadingsByAddress` when both the cell and the previous reading carry `corrected`; below-largest over the other rows of the same table and column; pole deviation over the lowest measured row of the table and column; over-range handled as the matrix says); `condicao` treats `restricted` as within. Restricted cell helper `text` = the kernel's reason sentence (history names the previous revision and value like `previousHelperText`). -- Stories 23.5, 23.6, 23.14.
- `relatorio/sheet-evaluation.ts`, `conclusion.ts` and every wrapper taking `DefinitionArg`, `composeConclusion`, `conclusionBasisMatches`, `conclusionAdjustWrites`, `printedConclusionText`, `conclusionTextOnConclude` -- add a trailing `visit = NO_VISIT_CONTEXT` parameter and pass it down; floor reasons `restriction` (Aprovado · Com restrições) and `prerequisite` (failure, Reprovado); `FLOOR_REASON_WORDS` gain two authored words; the composed paragraph names a restricted reading (authored clause) and a failed prerequisite, judged values read corrected with " a 20 °C"; basis keys added only when present (v1 to v12 basis bytes unchanged, kernel test). -- 23.6 effects.
- `relatorio/reading-run.ts` `worstReadings`, `points/derived.ts`, `relatorio/parecer.ts`, `relatorio/sheet-progress.ts`, `relatorio/pre-issue.ts`, `points/summary.ts`, `print/section-8.ts`, `print/section-9.ts`, `print/last-results.ts` -- each snapshot reader resolves `visitContextOf(snapshot, block)` per block and passes it; derived kind `restricao` (one per test with a restricted cell and no out entry, key `restricao:${block}:${test}`, authored text `${título}: valor dentro do critério, com restrição (${motivos})` naming the rows); a failed prerequisite is the test's `reading` entry (one entry per test); `pointSource`/`entrySource`/`resolvedOriginPoints` take `restricao`. -- 23.6.
- `schemas/entities.ts` -- point `origin` += `restricao`; `lastResultReadingSchema` += optional `corrected: { raw, unit }`; `blockReadings` writes it for a cell that carries a corrected value. -- contract 36, AD-25 projection shape.
- `print/section-9.ts` -- on a test with `temperature_correction` (v13 only): TEMPERATURA cell before ACEITÁVEL in the instrument header; a `20 °C` column after the capture columns inside the VALORES group (on DJ/SC tables beside VALORES), values in the group's header unit, `-` without a corrected value; the TF table fits at 8 pt (16 half points) under `READING_FIT_WIDTH_EM`. Nothing else moves. -- 23.5 print.
- `contract/version.ts` -- `CONTRACT_VERSION = 36`, `MIN_CONTRACT_VERSION = 36`, dated paragraph (origin `restricao`, the v13 keys, `corrected` in `last_results`). -- contract.
- `types/*` -- duplicate carries the three keys; company-schema reference checks; removing a nameplate field a key names drops that key's part (a separate helper called from `removeDraftEntry` with one line). -- shared fact.
- Kernel tests -- every matrix row; factor bounds (20 gives 1, fractional, -10, 110, outside), 75 °C Cu and Al; each rule at the bound, one step past, missing previous, previous on another seed, over-range row in a comparison; floor/points/parecer/section 9/section 8 agreement on one v13 snapshot fixture where the context changes the verdict; v12 and v5 sheets unchanged with a non-empty context; section 9 print tests at the fit (TF 8 pt, DJ/SC). -- DoD.
- `apps/api` -- sync route integration tests: point create `origin: 'restricao'` accepted and suppressing; v35 client 426; `last_results` written at issue carries `corrected` for a v13 corrected reading and none for v12, with a cross-tenant read check. -- DoD.
- `apps/web` -- ensaios-section builds `visitContextOf(snapshot, block)` once (memo by the cabine and equipment rows) and passes it to `sheetTestSections`; conclusao-section, use-ficha-actions and use-ficha-data pass the same context; temperature `.v13-line` above a corrected table; "Corrigido a 20 °C" column (table) and card line; `data-state="restricted"` and the restricted helper tone with the bold "Com restrição:" lead (static copy) + kernel text; Pontos lists the `restricao` entry and writes a point with `origin: 'restricao'` and its `test_key`. -- screens.
- e2e (`@p0`, assert committed outbox/store state, E12-A6; read numbers from the kernel): `e2e/temperature-correction.spec.ts` (TF oil 40 °C, the line, the corrected value, judged corrected; empty plate temperature + cabine 25 °C names the ambient; cable shows no line; DOCX TEMPERATURA and `20 °C` column), `e2e/three-levels.spec.ts` (cable 5/5/1,5 restricted, conclusion floor and reason line, Pontos entry, write point -> outbox origin `restricao`, parecer Apto com restrições; arrester NÃO -> Reprovado floor; reload), `e2e/previous-visit-judges.spec.ts` (two relatórios of one obra: issue the first with a v13 TF at a known temperature, open the second, a 60 % drop restricts and names the previous revision; DOCX of the second; put in `SERIAL_SPECS` if it issues), `e2e/contact-pole-deviation.spec.ts` (40/42/70 restricted and Com restrições; manufacturer 60 -> out and Reprovado). -- DoD.
- Docs -- `SPEC.md` Non-goals "temperature correction to 20 °C" struck with its date; `source-deltas.md` rows of 23.5, 23.6, 23.14 "planned" -> built record (strike + dated text); spine AD-25 dated note (`last_results` carries the corrected value; the previous visit judges) and AD-21 note (correction and restriction rules are definition data); `docs/kbs/architecture/kernel-and-seed.md`, `docs/kbs/log.md`; `deferred-work.md` under "Epic 23 batch e23v". -- DoD.

**Acceptance Criteria:**
- Given a v13 oil transformer at 40 °C (oil, plate) with an AT reading of 2 GΩ, when the row evaluates, then the corrected value is computed by the base's factor and judged, the helper shows it, and the DOCX prints TEMPERATURA `40 °C (ÓLEO)` and the `20 °C` column; with the plate field empty and the cabine at 25 °C, 25 °C is used and the print names AMBIENTE; with no temperature the raw value is judged and the helper asks for it; a v13 cable or TC gets no correction.
- Given a v13 cable at 5, 5 and 1,5 GΩ, when the sheet evaluates, then the 1,5 GΩ phase is restricted, the floor is Aprovado · Com restrições, one derived point names the test and the phase, and the parecer is Apto com restrições.
- Given a v13 transformer whose previous v13 visit's corrected AT reading dropped past 50 %, when the row evaluates, then it is restricted and the helper names the previous revision and value; with a v12 previous visit it is shown and not judged.
- Given a v13 arrester with DESLIGADOR ÍNTEGRO NÃO, when the sheet evaluates, then the floor is Reprovado.
- Given a stored point written from a restricted entry, when it syncs, then it carries `origin: 'restricao'`, the derived entry is suppressed, and an older client is refused with 426.
- Given a v13 disjuntor with poles 40, 42, 70 µΩ, then 70 is restricted and the floor Com restrições; with a manufacturer value of 60 µΩ, 70 is out and the floor Reprovado.
- Given a v12 and a v5 relatório, when they evaluate and print, then nothing changes and the layout-lock and Porto Seguro goldens are byte-equal.

## Design Notes

- **Why a context, not the block.** The ambient lives on the cabine row and the previous visit on the equipment row; the block holds neither. Every reader that judges a v13 sheet must pass the same `VisitContext`, or two surfaces disagree; the agreement test over one snapshot guards it. Default `NO_VISIT_CONTEXT` keeps every existing call compiling and every v1 to v12 result identical.
- **Levels.** out > restricted > within; a rule runs only on a cell already within. `restricted` is "within the criterion" for CONDIÇÕES, `failedRatioRows`, the out-reading readers and progress; only the floor, the points, the conclusion clause and the cell's look read it as a restriction.
- **Rules as read (narrowings, PR "Narrowings").** Correction by the base's CORRECAO_TEMPERATURA formulas over NETA 100.14's span -10..110 °C; DJ/SC take the solid factor (the base names no medium); medium unknown on a TF means no correction; over range never corrected and prints `-`; CB-02 history not built (its only history term is "queda acentuada", B-1, and cables are never corrected); DJ-02/SC-02 "fases com diferença > 50 %" not built (no number in the rule, not in 23.6's list); the cable and arrester comparison is "below 50 % of the largest other row" (FASE RESERVA included); TR-OL-02's history serves TR-SE-02 too (one product type, same number); a failed prerequisite is the test's `reading` entry, no new derived kind; a test with an out reading derives no `restricao` entry; the TEMPERATURA cell and `20 °C` column also print on DJ/SC tables (Story 23.1 drew only the TF).

## Verification

**Commands (tools container: `podman compose --profile tools run --rm --user root tools …`; logs in `.scratch-e23v/`; restart the api after any domain change):**
- `pnpm lint`, `pnpm static` -- 0 errors.
- `pnpm test:unit` -- green, `seed.test.ts` pins included.
- `pnpm test:api` -- green; goldens unchanged.
- Touched specs under `lockf -t 20000 /tmp/fasor-verify.lock`: `pnpm exec tsx scripts/e2e.ts <specs> --project desktop-chrome --project durability-desktop-chrome`, the specs = the four new ones plus every `e2e/` spec asserting the conclusion row or its reason line, section 8, section 9, points, the parecer, v13 seeds, the previous visit or manufacturer/criteria/over-range verdicts (`grep -rlnE` over `e2e/`; list them in the PR); the touched durability specs also on the matrix projects.

## Spec Change Log

## Review Triage Log

### 2026-11-09 — Review pass
- layers: Edge Case Hunter and Verification Gap Reviewer; Blind Hunter and Intent Alignment skipped (token economy; the integrated epic review covers them).
- verdicts: 11 findings — high 0, medium 7, low 3, false 1, maybe-false 0
- findings:
  - `[low]` `[patch]` conclusao-section `confirmAdjusted` writes from the render-time visit context — rebuilt from the build's fresh rows.
  - `[low]` `[patch]` conclusao-section `confirmText` basis guard under the render-time context — rebuilt from the build's fresh rows.
  - `[low]` `[patch]` pole deviation: a lowest pole of 0 disables the rule for the column — reference is the lowest positive measured pole, boundary test added.
  - `[medium]` `[defer]` parecer names a prerequisite-only Reprovado in the reasonless group — needs a reason group, an authored word and a basis key; deferred (frontmatter, ledger).
  - `[false]` `[reject]` ensaios-section row one td short when the corrected capture cell is undefined — every evaluated row carries a cell for every typed column (`evaluateTable` loops over `typedColumns`), so the cell is never undefined there.
  - `[medium]` `[defer]` the TF table prints at 7,5 pt, not the approved 8 pt — the 60 em rule's own measure; a decision for Matheus (frontmatter, ledger).
  - `[medium]` `[patch]` (gap) the conclude batch under the visit context untested — use-ficha-actions test added.
  - `[medium]` `[patch]` (gap) the conflict view's composed conclusion under the context untested — conflicts test added.
  - `[medium]` `[patch]` (gap) pre-issue stale/unconfirmed rows under the context untested — pre-issue test added.
  - `[medium]` `[patch]` (gap) `pointDraftValue` with origin `restricao` unpinned — test line added.
  - `[medium]` `[patch]` (gap) the 390 px stacked corrected line untested — e2e step added.

## Auto Run Result
