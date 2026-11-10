# Epic 23 Context: Bruno's test base as the product's criteria

<!-- Compiled inline by the coordinator on 2026-11-08 from the correct-course run (sprint-change-proposal-2026-11-08.md), Matheus's decisions of 2026-11-08 and a read of main fb09ee55. Edit freely. -->

## Goal

Bruno's "Base de Ensaios MT" rev08 becomes what the app judges by. On seed v13, for new relatórios only:
- criteria come from versioned NETA tables, with the manufacturer's value prevailing and temperature correction;
- a reading has three levels, and the previous visit's value judges;
- the nameplate decides which tests apply;
- each test carries "Como ensaiar" on screen;
- decision I's wave 1 tests join the current types, and a new Malha de aterramento type is added.

Every relatório on v1 to v12 keeps its verdicts and prints byte-identical. Bruno likes the current relatório, and its layout is protected.

**Sources, gitignored, pt-BR:**
- `docs/context/epic-23/decisoes-epic-23.md`: groups A to N, and § 5, Matheus's binding decisions;
- `docs/context/epic-23/respostas-bruno-rev08-2026-11-08.md`: what is still open with Bruno;
- `docs/context/epic-23/divergencias-base-x-produto.md` and `literatura-criterios.md`;
- the base itself, `docs/context/Fasor_Base_Ensaios_MT_rev08.json`, the same as its `.xlsx`.

Cite the base by row ID and table name. Never copy its values, procedures or recommendations into a tracked file, a PR body or a commit message. Its map is `docs/kbs/project/test-base.md`.

## Stories

The text of each, with its DoR, ACs and DoD, is in `epics.md` § Epic 23. The overridden records are the fourteen `source-deltas.md` rows of 2026-11-08.

| Story | Title | Dev model · Effort | Depends on |
| --- | --- | --- | --- |
| 23.1 | The Epic 23 sheet frames in the mocks | opus · medium | none |
| 23.2 | Seed v13 opens, older layouts locked, insulation by the NETA tables | opus · high | e23f merged |
| 23.3 | The manufacturer's value on each test (absorbs 14.13) | opus · high | 23.1, 23.2 |
| 23.4 | A reading above the instrument's limit under the table criteria | opus · medium | 23.2 |
| 23.5 | Temperature correction (20 °C, 75 °C) | opus · high | 23.2, 23.7 |
| 23.6 | Three levels, comparisons, the previous visit judges | opus · max | 23.1, 23.4, 23.5, 23.7, e23f |
| 23.7 | Seed v13 nameplate fields (decision K) | opus · high | 23.2's first commit |
| 23.8 | The TTR has one row per tap | opus · high | 23.7 |
| 23.9 | Applicability from the nameplate, NA and override | opus · max | 23.1, 23.7, e23f |
| 23.10 | "Como ensaiar" on each test | opus · high | 23.1, 23.2 |
| 23.11 | The recommendation as the derived point's initial text | opus · medium | 23.10, e23f |
| 23.12 | The base's help and recommendation texts in the seed | opus · medium | 23.10, 23.11, 23.13 to 23.21, Matheus's M-1 |
| 23.13 | Test-voltage defaults on every insulation row (D) | opus · medium | 23.7 |
| 23.14 | Contact resistance: manufacturer, default, pole deviation (L) | opus · medium | 23.3, 23.6 |
| 23.15 | Winding resistance on the transformer | opus · high | 23.5, 23.6, 23.7, 23.9 |
| 23.16 | The polarization index judged | opus · medium | 23.4, 23.6 |
| 23.17 | The insulating liquid and oil sampling (H) | opus · high | 23.7, 23.9 |
| 23.18 | TC and TP: polarity, function, S classes (E) | opus · high | 23.7, 23.9 |
| 23.19 | HH fuse resistance on the seccionadora | opus · medium | 23.6, 23.7, 23.9 |
| 23.20 | Thermography on the eight types | opus · high | 23.6, 23.9 |
| 23.21 | A new type: Malha de aterramento | opus · high | 23.2, 23.9 |

## Decisions (Matheus, 2026-11-08)

Groups A to N, § 5 of the decisions file. Each is summarized in `epics.md` § Epic 23 and carried by a `source-deltas.md` row.

- **Method.** "Epic 23. Planejar e já construir, em lotes paralelos."
- **What depends on Bruno stays pending:** vague terms, TTR, oil A/B, TP insulation, the high-voltage notice, and contact against the previous visit.
- **The editor of types** is an office tool (tablet and desktop). On a phone it must only not break: nothing overflows its width, and tables scroll sideways. This binds Stories 23.10 and 23.11's editor fields.

## Facts the batches share

- **Current versions** on main `fb09ee55`:
  - `SEED_VERSION = 'v12'` (`seed/definitions.ts:63`);
  - `CONTRACT_VERSION = 33` (`contract/version.ts:372`) and `MIN_CONTRACT_VERSION = 33` (`:582`).
  - e23f takes no contract or seed number. If its spec needs one, it takes 34, and the coordinator shifts every number below by one before wave 1 launches.
- **Criteria.**
  - `seed/criteria.ts` `SEEDED_CRITERIA` (three seeded criteria, source "aceitável na ficha").
  - `seed/schema.ts`:
    - `testDefSchema` (line 218; `key` is a closed enum of `isolacao`, `resistencia_contato`, `relacao_transformacao`);
    - `criterionBandsSchema` (line 197, the v6 Quadro bands);
    - `criterion_class_field` (v12);
    - `tableDefSchema.voltage_rows` (line 154).
  - `relatorio/reading-evaluation.ts`: `bandCriterion` (75), `effectiveCriterion` (108, which applies `criterion_override`), `evaluateTest` (403).
- **Reading cells.**
  - `relatorio/reading-cells.ts`: `ReadingVerdict = 'within' | 'out'` (line 42).
  - Story 22.10's `over_range`, with the limit from the instrument registry (`range_isolacao`, `range_resistencia_contato`).
  - `parse/pt-br-number.ts`.
- **Measurement grammar** (Story 14.5): `seed/measurement.ts`, with number and choice cells and four criteria (absolute, relative to the lowest of a column, equality of two columns, a passing choice). New tests use it, extended with "deviation between phases %" (Story 23.15), "a choice that fails" (Story 23.18) and band tables (Story 23.20).
- **Sub-blocks and types.**
  - `schemas/block-config.ts`:
    - `SUB_BLOCK_KEYS` (line 119), append-only;
    - `EQUIPMENT_BLOCK_TYPES` (line 38: the eight, plus `chave_transferencia_automatica`, `quadro_eletrico`, `inspecao_qgbt`).
  - Specs read both lists from the kernel (`e2e/support/palette.ts`, E14-A3).
- **Ops.** `ops/path.ts` `TEST_FIELDS = ['instrument', 'criterion_override']` (line 46). Value caps are in `ops/value-limits.ts` (Story 20.9), and conflicts in `merge/conflicts.ts`.
- **Conclusion and points.**
  - `relatorio/conclusion.ts`: `conclusionFloor` (129), `effectiveConclusionPair` (201), `printedConclusionPair` (236).
  - `points/derived.ts`: `derivedPoints` (249), `resolvedOriginPoints` (267), `possibleDuplicatePoints` (315).
  - Point origins: `schemas/entities.ts:689`.
  - `relatorio/parecer.ts`.
- **Previous visit:** `print/last-results.ts`, the `equipment/{id}/last_results` projection (AD-25 note of Story 22.12).
- **Oil:** `relatorio/oil-rule.ts`, the `oil_rule.oil_values` of a definition (`seed/schema.ts:261`), and `seed/legacy-options.ts`.
- **Voltages and classes:** `relatorio/row-voltage.ts` `rowTestVoltage` and `relatorio/accuracy-class.ts` `parseAccuracyClass`.
- **Print.**
  - `print/section-9.ts`: `fittedColumns` with `READING_FIT_WIDTH_EM`, the 60 em rule of e22g.
  - `print/section-8.ts` and `print/group-for-print.ts` ("Outros equipamentos").
  - Goldens: `apps/api/src/jobs/generate/golden/porto-seguro-skeleton.json` (v1) and `packages/domain/fixtures/porto-seguro/*.golden.json`.
- **Company types** (Stories 14.6 to 14.8):
  - `packages/domain/src/types/` (`definition.ts`, `draft-edit.ts`, `duplicate.ts`);
  - `apps/web/src/surfaces/templates/type-editor.tsx`;
  - the company type version schema (`companyTypeVersionDefinitionSchema`, structural read).
  - "Duplicar" carries a seeded type's v12 keys; a new v13 key must be carried too.
- **Sheet surface:** `apps/web/src/surfaces/ficha/ensaios-section.tsx` (e23f's R8LAY focus change lands there) and `nameplate-section.tsx`.
- **Plate reading:** `apps/api/src/jobs/reading/providers/bedrock.ts` (prompt `bedrock-structuring-5` on main), with the eval in `apps/api/src/scripts/bedrock-eval.ts`.
- **Test data.** The test company is Empresa A, `a@teste.local`. `LLM_PROVIDER` and `OCR_PROVIDER` stay `fake`. Fixtures are synthetic: no client value enters a fixture other than Porto Seguro's (R-023).

## Coordinator's readings (open to Matheus or Bruno)

Each is marked in its story's DoR. The B and M numbers are those of `sprint-change-proposal-2026-11-08.md` § 6.

- **Restricted rows.** CONDIÇÕES prints SATISFATÓRIO for a restricted row (B-8).
- **The instrument-limit note** prints under the table, not in OBSERVAÇÕES, so the floor is not raised (B-9).
- **The previous value** judges only when both visits are corrected on v13 (Story 23.6).
- **NA by applicability.**
  - A test made NA by applicability is omitted from print, as a switched-off sub-block is (FR-11).
  - A condition over an empty field applies the test, unless the base row says the test needs the value (Story 23.9).
- **TIPO DE ISOLAÇÃO** reads "ÓLEO ISOLANTE" on v13 beside Natureza do líquido (M-4).
- **Corrected readings** print as a TEMPERATURA header line plus a CORRIGIDO column (M-5).
- **The Malha de aterramento** sits at a local and prints under "Outros equipamentos" (M-6).
- **No separate `bmad-architecture` run.** The dated spine notes under AD-21, AD-3 and AD-25 are written in the build PRs (M-3).
- **Authored wordings** are listed in each PR for Bruno.

## Open items

- **Bruno: B-1 to B-11** (sprint change proposal § 6).
  - DoR blockers or out-of-scope notes: B-1 vague terms, B-2 TTR instrument (Yd), B-3 oil A/B, B-4 TP insulation, B-5 the high-voltage notice, B-6 contact against the previous visit.
  - The rest are confirmations or the readings above.
- **Matheus: M-1 to M-6.** M-1 (the base's texts in a public repository) blocks Story 23.12. M-2 (one deploy after wave 3) is the default.

## Fix batch e23f

~~*(Placeholder; the coordinator fills this section when e23f's PR merges.)*~~ *(2026-11-08, filled by the e23f
orchestrator on the coordinator's word; the record is the list at the end of this section.)*

- **Branch** `e23f-fixes`, worktree `.claude/worktrees/e23f`, port base 65, from main `fb09ee55`. It runs in parallel with this planning.
- **Scope.**
  - The three print defects of `deferred-work.md` § "the production check of Bruno's relatório" (owner "the first Epic 23 fix batch"), in `print/section-8.ts`, `relatorio/conclusion.ts` and `points/derived.ts`.
  - The two tests that are unstable under load.
  - R8LAY: the focus at the end of an Enter sequence goes to the fixed bar's primary button with `preventScroll`, in `surfaces/ficha/ensaios-section.tsx`.
- **Contract and seed:** none.
- **Why Epic 23 waits for it.**
  - e23f changes the printed section 8 and the conclusion text of every relatório, so Story 23.2's layout lock is taken only on a main that holds e23f.
  - Stories 23.6, 23.9 and 23.11 touch e23f's files.
- **Deploy:** only on Matheus's word.
- **Record:** PR, merge sha, story gate, findings, narrowings, and what it leaves for Epic 23.
- **Record (2026-11-08).**
  - PR #283 (a merge commit on main; its sha is on the PR). Story gate on `95db1228` (main `66d1e466` merged in), under the lock, wait 0 s,
    load 4.38 at the start and 6.80 at the end:
    - lint 0, static 0, test:api 910 passed / 6 skipped (goldens unchanged), test:unit 5660 of 5660;
    - the composer file five runs 17 of 17; 23 touched specs 158 of 159;
    - R8LAY-E2E-001 10 of 10; `photo-order.durability` on the matrix 12 passed / 6 skipped.
    - The one red, the tap budget's 5.1-E2E-001, was e23f's own (below); fixed on `3acaaf51` (lint, static, the spec 3 of 3).
  - Main `0937f846` (#282, docs only) merged before the merge; the gate stays valid.
  - Changes: section 8 bullets and action-plan cells print line breaks as `<w:br/>` (`lineRuns`); the NC clause drops the
    observation's final period (`ncClauseText`); the action-plan cell spaces "Imagem N" (`GLUED_BEFORE_REF`); the
    readings', measurement tests' and plate runs end on the primary with `preventScroll` (`focusRunEnd`); the composer and
    photo-order tests wait on the rendered state.
  - Narrowings: the line-break fix serves every section 8 bullet and cell, so a point typed on several lines prints its
    lines too; "an Enter run" includes the plate run's end.
  - Finding (for Story 23.2's layout lock): with no scroll at the run's end, a control can sit half under the Sticky
    action bar, and the stepper's current mark grows the bar 1 px when the focus enters a step. The tap budget spec
    lost its tap there; the test now scrolls the suggestion into view (no tap added).
  - Left for Epic 23: three `deferred-work.md` rows (§ "Epic 23 fix batch e23f"): glued references the editor never
    writes, an NC observation with line breaks splitting the section 9 conclusion paragraph, and the confirmed texts
    row, closed 2026-11-08 (Matheus: kept as stored).

## Fix batch e23g

*(2026-11-09, filled by the e23g orchestrator on the coordinator's word.)*

- **Branch** `e23g-wave1-fixes`, worktree `.claude/worktrees/e23g`, port base 64, from main `6be0a5ec`.
- **Scope.** The four findings of the second pass of the wave 1 integrated review (R2-1 to R2-4), plus one late finding of
  the behavior pass, which came after the batch launched:
  - R2-1: "Ler visor" on a v13 TTR with tap rows;
  - R2-2: `removeDraftEntry` and the v13 keys;
  - R2-3: the vector-group missing count;
  - R2-4: the tap line's count in the web;
  - late: the TTR's missing-group helper named LIGAÇÃO SECUNDÁRIA on a transformer whose field is DESLOCAMENTO ANGULAR
    (since v12).
- **Contract and seed:** none. Goldens unchanged.
- **Record (2026-11-09).**
  - PR #289 (~~open, not merged; its head is on the PR~~ *(2026-11-10: merged as `982bebb9`)*). Story gate on `03307e4c` under the lock:
    - lock wait 0 s; load 1.98 at the start and 3.99 at the end; only the e23g stack up at the start, e23v's (wave 2) by
      the end;
    - lint 0, static 0, test:api 926 passed / 6 skipped (goldens unchanged), test:unit 5837 of 5837;
    - 8 touched specs 57 of 57 (`ttr-per-tap`, `type-editor`, `ficha`, `read-display-pipeline`, `read-display`,
      `dry-transformer.durability`, `company-type-sheet`, `test-applicability.durability`); matrix not run (no fold,
      commit path or live-query change).
  - Main `606177fe` (#288, docs only) merged after the gate; the gate stays valid.
  - Changes:
    - `writableTableRows` (`relatorio/tap-rows.ts`) is the one list of a table's writable rows in table order. The
      display kernel walks it by position, and "Confirmar todos" and its verify count bound a table by it. The display
      input gains `nameplate?`, which the api passes from the block's definition.
    - `removeDraftEntry` prunes `dry_fields`, `pick_from`, `rows_from` and `applies_when` naming a removed field. This
      is the prune of e22h S1, chosen over a refusal.
    - The group count adds only `tapRowRequired` rows.
    - The kernel gains `tapTableLine`, `isTapTable` and `tapRowOptional`.
    - The helper becomes `vectorGroupMissingText(vectorGroupFieldLabel(definition))`.
  - Authored wording, for Bruno: "Informe o campo {label} na placa para calcular". It replaces "Informe a LIGAÇÃO
    SECUNDÁRIA na placa para calcular"; "o campo" fits a label of either gender. It is on the sheet only and never
    printed.
  - Review (Edge Case Hunter, Verification Gap; one loop):
    - Patched: an api case for a company copy's display reading, with a mutation run (only that case red without the
      forward).
    - Deferred: one low finding, `MeasurementTable`'s `row.tap !== null` render branches from e23b.
  - Left for the epic: three `deferred-work.md` rows under § "Epic 23 fix batch e23g":
    - the order of `measurementSuggestions` (a note);
    - the TTR markup branches (a note);
    - a decision for Matheus: a copy that removes DESLOCAMENTO ANGULAR keeps a TTR read by vector group with nothing to
      read.

## Fix batch e23w

*(2026-11-09, filled by the e23w orchestrator on the coordinator's word.)*

- **Branch** `e23w-wave2-fixes`, worktree `.claude/worktrees/e23w`, port base 57, from main `32bd1845`.
- **Scope.** The second pass of the wave 2 integrated review on `8c097ffa` (W2-1 to W2-4, W2-K1, W2-K2), the wave 2 gate red W2-G1, and Bruno's 2026-11-09 answers B-4 (TP-02) and B-6 (contact rise).
- **Contract and seed:** no contract (37 stays). Seed v13 changed in place (the TP's Table 100.5 key, `history_rise_out_pct` on the contact tests); `V13_HASH` re-pinned to `91fe99b1…`. Goldens unchanged.
- **Record (2026-11-09).**
  - PR #293 (~~open, not merged; its head is on the PR~~ *(2026-11-10: merged as `6acf9ca7`)*).
  - Story gate on `49d1fdd7` (main `32bd1845`, unchanged since the branch), each stage under the lock:
    - load `{ 3.15 8.36 11.12 }` at the start and `{ 5.46 7.05 7.94 }` at the end, with a peak of 21 during the e2e stage (the host's `contactsd` at 127 % CPU besides the VM); the e23t stack was up throughout, and its gate and fix gate held the lock;
    - lock wait 0 s for lint, static, test:api and test:unit; 5144 s for the e2e stage (behind e23t's gate);
    - lint 0, static 0, test:api 936 passed / 6 skipped (goldens unchanged), test:unit 5946 of 5947;
    - the one unit red, `sumario-surface.test.tsx` "decision 2" (7,4 s, a file this batch does not touch), passed alone under the lock: 43 of 43 (E15-A4);
    - 59 touched specs (every spec asserting section 9, the conclusion, the points or the parecer, plus `reading-wait` and the three new ones): 282 of 284. The two reds are both `@p1`, both serial, both in specs this batch does not touch: `export.spec.ts` 4.8-E2E-005 (no "Revisão 1 pronta" within 150 s) and `journeys-12-3-12-4.spec.ts` 12.3-E2E-004 (the stepper's "Ensaios, 0 faltando" not within 5 s). Both passed alone under the lock with `--repeat-each 2`: 2 of 2 each (lock wait 1290 s, load `{ 4.23 5.90 7.11 }` to `{ 4.05 5.46 6.84 }`), so they are counted load-bound under E15-A4 with both runs recorded.
    - 13.5-E2E-004 passed in the gate; matrix not run (no fold, commit path or live-query change).
  - Changes:
    - W2-1: visits ordered by first issue (`firstIssuedAtOf` in the issue job). A re-issue whose top `last_results` entry is a later relatório with this one as `prior` reads no previous visit; its put refreshes that top's `prior` and keeps it on top; a re-issue over an unrelated top issued after its first issue writes nothing.
    - W2-2: `failedPrerequisites` (`relatorio/restriction.ts`) reads every test with a prerequisite whatever its switch or applicability; the floor, the points, the conclusion and the parecer read it.
    - W2-3: `TestEvaluation.restrictionStands`; `resolvedOriginPoints` reads it.
    - W2-4: unit and e2e of both conclusion confirms under the cabine's ambient, with a mutation run.
    - W2-K1: the parecer's `prerequisite` group.
    - W2-K2: TEMPERATURA was already in the instrument header row (e23v), so the delta was the fit: the "20 °C" column is measured outside the 60 em budget and the transformer's table prints at 8 pt.
    - B-4: the v13 TP takes the TC's Table 100.5 key; "N/√3" is judged by N.
    - B-6: a pole more than 50 % above the same pole at the previous v13 visit is out (`EvaluatedCell.rise`).
    - W2-G1: bisect alone under the lock, `967d898a` 6 of 6, `8c097ffa` 5 of 6: a race in the test (the engine arms the next tick when a cycle ends), not a 60 s regression. The test waits for the cycle to end; the product is unchanged.
  - Authored wording, for Bruno: "pré-requisito do ensaio não atendido" (parecer group); "alta de {N} % sobre {valor} da manutenção anterior, rev. {n} de {dd/mm/aaaa}, acima do limite de {pct} %"; "Acima do aceitável: {motivo}".
  - Review (Edge Case Hunter, Verification Gap; one loop): 12 findings, 4 patched (the W2-1 job-wiring case, the size pins, the rise's rounding, 13.5-E2E-004's listener scope), 1 deferred, 7 rejected.
  - Left for the epic: six `deferred-work.md` rows under § "Epic 23 fix batch e23w": the prerequisite with the nameplate sub-block off (Matheus with Bruno), the two-entry chain after two later visits, a PDF look at the 8 pt table (wave QA), the authored texts, the B-6 narrowings, and the contract note (MIN must follow wave 3's bump). Two e23v rows closed (the 7,5 pt decision, the parecer wording).

## Fix batch e23p

*(2026-11-10, coordinator.)*

- **Scope.** The five fixes Matheus approved on 2026-11-10 from the browser behaviour pass on `47be2638`. The pass report is `_bmad-output/test-artifacts/manual/behaviour-pass-e23-2026-11-10.md`, and the F numbers below are its own. The batch's record is `spec-e23p-pass-fixes.md`.
- **Branch** `e23p-pass-fixes`, from main `b307ced1`.
- **Contract and seed:** no contract change (40 stays, minimum 40). No seed change (`V13_HASH` unchanged). Goldens unchanged: v1 to v12 print as before.
- **Record (2026-11-10).**
  - PR #301, head `cc83df6c`, merged as `9add87b5` on 2026-11-10.
  - What it fixes:
    - P1 (F2): "Copiar da última visita" and "Igual à" no longer copy the fields measured on the day of the visit. These are the oil and winding temperatures, CONTADOR DE OPERAÇÕES, DESLIGADOR ÍNTEGRO and CONDIÇÃO DO SOLO.
    - P2 (F3): the v13 transformer insulation table prints every word whole. Its sizes are 7,5 pt with one criterion, 7 pt with ACEITÁVEL per row, 7 pt with one criterion and MANUT. ANTERIOR, and 6 pt with ACEITÁVEL per row and MANUT. ANTERIOR.
    - P3 (F4, the screen and the point's text): the "Anterior:" line shows the previous value measured and corrected, and the derived point names both compared values.
    - P4 (F5): on an oil unit the dry-only fields are read-only, with the reason under them. Switching a dry unit to oil clears them, with "Desfazer".
    - P5 (F7): with a design value, the ground grid criterion states its number ("≤ 3 Ω, valor de projeto").
  - PDF crops of the four table shapes: `_bmad-output/implementation-artifacts/e23p-pdf-crops/`.
  - Story gate on `1d41b639` (the head `cc83df6c` adds only the PDF crops and the spec's result), lock wait 0 s:
    - lint 0 errors, static clean, test:api 959 passed and 6 skipped;
    - test:unit 6133 of 6136. The three reds are in `telemetry/flush.test.ts` and `setup-surface.test.tsx`, files this batch does not touch, and they passed alone under the lock;
    - the touched Playwright specs: 21 specs, 108 of 108 tests.
  - `pnpm test:e2e:full` on `cc83df6c`, which is the same tree as `9add87b5` because main had not moved:
    - 658 tests, 652 passed, 2 failed, 4 skipped, in 4887,7 s;
    - the two reds were `review-photo-failures.spec.ts:349` (R8CAP-E2E-010, a click timeout) and `local-painel-coluna.spec.ts:466` (14.10-E2E-006, the revision toast not within 150 s);
    - both passed alone under the lock, and Matheus accepted them on 2026-11-10 as load-induced;
    - the matrix was not rerun.
  - Matheus accepted on 2026-11-10: the four type sizes of P2, the three fields P1 adds to the two temperatures, and the point's text naming both compared values. The matching `deferred-work.md` rows under § "Epic 23 fix batch e23p" are marked confirmed.
  - Left open in `deferred-work.md` § "Epic 23 fix batch e23p": whether the oil fields of a dry unit become read-only the same way (Matheus), and the batch's authored texts (Bruno).
- **Not in this batch.** They move to Epic 24 or to the next list of questions for Bruno:
  - F6 (section 9 prints no criterion and no verdict per row on four tests);
  - the print half of F4 (the row in section 9 shows the measured values);
  - the low findings F9 to F20;
  - F8 is a question for Bruno: is a rise of exactly 50 % already Reprovado?
  - F1 needs no change: it is local dev data only (§ Deploy, the read-only counts).

## Batch plan

There are two lanes per wave, so at most two batch stacks are up at a time (the 2026-10-08 load rules). Each batch runs `bmad-build-auto` in its own worktree, following `epic-batch-orchestrator.md`.

**Port bases.** A port base P must keep `<P>443` at or below 65535, so P is at most 65, and e23f holds 65. Epic 23 reuses the retired bases 57 to 64 of Epic 22, whose worktrees are gone (`git worktree list` on 2026-11-08 shows only main and e23f). Before each launch the coordinator checks `podman ps --filter name=fasor-` for a stack on the base it hands out.

| Wave | Tag | Port base | Branch | Stories | Dev model · Effort | Contract | Base |
|---|---|---|---|---|---|---|---|
| 0 | coordinator | n/a | `docs/e23-frames` | 23.1 | opus · medium (`bmad-ux`) | none | main, during e23f |
| 1 | e23a | 57 | `e23a-criteria-tables` | 23.2, 23.3, 23.4 | opus · high | 34 | main after e23f merges and 23.1 is approved |
| 1 | e23b | 58 | `e23b-nameplate-applicability` | 23.7, 23.8, 23.9 | opus · high, high, max | 35 | **stacked** on e23a's first commit (seed v13 = v12 and the layout lock) |
| 2 | e23v | 59 | `e23v-three-levels` | 23.5, 23.6, 23.14 | opus · high, max, medium | 36 | main after wave 1's gate and fix batch |
| 2 | e23h | 60 | `e23h-field-help` | 23.10, 23.11 | opus · high, medium | 37 | main after wave 1's gate and fix batch |
| 3 | e23t | 61 | `e23t-transformer-tests` | 23.15, 23.16, 23.17, 23.19 | opus · high, medium, high, medium | 38 | main after wave 2's gate and fix batch |
| 3 | e23e | 62 | `e23e-tc-thermo-ground` | 23.13, 23.18, 23.20, 23.21 | opus · medium, high, high, high | 39 | main after wave 2's gate and fix batch |
| 4 | e23x | 63 | `e23x-base-texts` | 23.12 | opus · medium | none | main after wave 3, once Matheus decides M-1 |

The integrated review's stack takes base 64. A fix batch takes the lowest base freed by a closed worktree (57 first).

### Why these groupings

- **e23a** owns the criteria tables (one data set):
  - 23.3's manufacturer's value replaces the criterion that 23.2 picks;
  - 23.4's instrument-limit rule compares the limit with that criterion.
  - It also owns seed v13, so the version and the layout lock land once.
- **e23b** owns the v13 nameplate (one data set):
  - 23.8 builds its rows from 23.7's TAPS;
  - 23.9's conditions read 23.7's fields.
- **e23v** owns the verdict level:
  - 23.5's corrected value is what 23.6 judges and compares;
  - 23.14's pole rule is the level's first consumer.
- **e23h** owns the test definition's text keys (`help`, `recommendation`) and the editor fields, with one version-schema change.
- **e23t** owns the transformer and switching tests and their new grammar criterion, "deviation between phases": 23.15 adds it and 23.19 reuses it. 23.16 and 23.17 are transformer data too.
- **e23e** owns the other new grammar pieces: a failing choice (23.18) and band tables (23.20). It also owns the per-type voltage defaults (23.13) and the one new closed-enum type (23.21).

### Coordinator decisions

- **Seed v13.**
  - e23a creates `seed/v13.ts`, derived from v12 with `V12_HASH` pinned. Its first commit holds only v13 = v12 and the layout lock, and is pushed at once; e23b launches stacked on it.
  - Every later batch adds to v13 in place. This is safe because v13 is not deployed until the epic's single deploy (M-2). `V13_HASH` is re-pinned by each batch, and the PR that merges second re-pins it on the merged main.
  - If Matheus asks for an earlier deploy, the waves after it take seed v14.
- **Contracts.**
  - Numbers are reserved in merge order: e23a 34, e23b 35, e23v 36, e23h 37, e23t 38, e23e 39; e23x none.
  - Within a wave the lane with the lower number merges first. If the higher one is ready first, it waits, or the coordinator swaps the two numbers before either merges.
  - A batch whose spec finds no fold change takes no number, and the coordinator renumbers the unlaunched batches down.
  - `MIN_CONTRACT_VERSION` follows each bump unless a PR shows a reason not to. Each bump has an api integration test through the sync route.
- **Layout lock.** Story 23.2 takes the goldens of synthetic v5, v11 and v12 relatórios on a main that holds e23f. Every later PR keeps them and the Porto Seguro goldens byte-equal.
  - A batch that needs to regenerate any of them stops and asks the coordinator. That is a defect against the protection, not a golden update.
  - Only v13 fixtures may gain goldens.
- **Shared files and expected conflicts.**
  - `seed/v13.ts`, `seed/seed.test.ts` (hash pins) and `seed/schema.ts` (each batch adds optional keys): every batch. The second PR of each wave merges main, takes the other lane's keys whole, and re-pins.
  - `schemas/block-config.ts` `SUB_BLOCK_KEYS` and `EQUIPMENT_BLOCK_TYPES`: e23t and e23e both append; e23t's entries come first.
  - `seed/measurement.ts`: e23t and e23e add different criterion kinds; expect a trivial conflict on the kind union.
  - `relatorio/reading-evaluation.ts`: e23a (criterion picking), e23b (applicability) and e23v (levels). e23v rebases on both wave 1 merges, as it starts after them.
  - `relatorio/conclusion.ts` and `points/derived.ts`: e23f first. In wave 2, e23v (the restricted floor and point) merges before e23h (the initial text), which then merges main.
  - `print/section-9.ts`:
    - wave 1: e23a (ACEITÁVEL per row) and e23b (tap rows, NA omission);
    - wave 2: e23v (the corrected column);
    - wave 3: e23t and e23e (new tables).
    - The second lane of each wave merges main first.
  - `apps/web/src/surfaces/ficha/ensaios-section.tsx`: e23f (focus), then e23a (the manufacturer's control), e23b (the NA row and override) and e23h (the "Como ensaiar" action).
  - `apps/api/src/jobs/reading/providers/bedrock.ts`: e23b (23.7), e23t (23.17) and e23e (23.18). Each bumps the prompt version once, and the second of a wave takes the next.
  - `contract/version.ts`: each batch appends its paragraph.
  - `deferred-work.md`: each batch writes under its own heading.
  - `copy/pt-br.ts`: different keys per batch.
- **Paid eval.** The prompt changes of 23.7, 23.17 and 23.18 run `bedrock-eval.ts` on Matheus's AWS login before the deploy (E21-A4), on the synthetic set and on the real set in `docs/media/`.
- **Bruno's v5 relatório.** After the deploy, a read-only preview (as on 2026-11-07) checks that his revisão on v5 prints as before.

## Gates

- **Each batch** runs the story gate: lint, static, test:unit, test:api and its touched specs.
  - Touched specs include every spec that asserts seed counts, the sub-block or type lists, the conclusion row, section 8 or section 10 (`grep -rln` over `e2e/`; E14-A3, E15-A3).
  - A batch that changes the op fold, the commit path or a live query on the ficha also runs its touched durability specs on the matrix projects (e23b, e23v, e23h, e23t and e23e at least).
- **Cross-batch merge rule** before the second PR of a wave merges (orchestrator § 6), and the stacked-branch rule for e23b (§ 4).
- **After each wave.**
  - First `podman compose restart api web`.
  - Then one integrated gate on main: `pnpm test:e2e`, `test:e2e:full` and the matrix, with the host load line.
  - Then the two-pass integrated review (§ 9), then one fix batch if needed.
- **Deploy.** Once, after wave 3's gate, review and fix batch (and e23x if M-1 is decided by then), on Matheus's word.
  - The deploy checklist of orchestrator § 8 and § 9 applies: `test:e2e:full` on the integrated main, the "before the deploy" rows of `deferred-work.md`, and the paid eval.
  - Seed v13 freezes there.

## Wave gates

### Wave 0 (Story 23.1)

~~*(Filled by the coordinator.)*~~ *(2026-11-09, coordinator.)* Story 23.1 is frames only (PR #284 merged as `e519f91d`, approval recorded in PR #285 as `a3b0ec0e`). It changed no code, so no gate ran.

### Wave 1

~~*(Filled by the coordinator.)*~~ *(2026-11-09, coordinator.)*

- **Merges.**
  - e23a, PR #286, head `b133f017`, merged as `17127590` (contract 34).
  - e23b, PR #287, head `70c97c2e`, merged as `6be0a5ec` (contract 35).
  - The cross-batch rule held: e23b merged main `17127590` in at `73762e5e` and re-pinned `V13_HASH` to `b7f5cfb3…`. It then ran both batches' 38 touched specs, 194 of 195. The red was 23.9-E2E-001, which counted e23a's manufacturer field as a reading cell. With its locator fixed it passed 1 of 1. The matrix durability specs gave 41 passed and 1 skipped.
  - Before each merge, `git diff --name-status` over the golden and fixture trees showed additions only: the new layout-lock-v5/v11/v12 goldens. The Porto Seguro goldens are untouched.
- **Integrated gate** on `6be0a5ec`, after `podman compose up -d` and `podman compose restart api web`.
  - Lock wait 0 s. Load `{ 2.97 3.48 4.02 }` at the start and `{ 5.33 5.02 4.40 }` at the end. Nothing else ran on the host: both batch stacks were stopped, and the second review pass was a code read with no stack.
  - `pnpm test:e2e:full` ran 2530 s. The parallel group had 456 tests: 451 passed, 1 failed, 4 skipped. The serial group passed 171 of 171.
  - The red was `@p1` 1.6-E2E-001 (`home.spec.ts:220`): the Sumário did not draw within the 30 s test timeout after the slowed stream pull. This is the same load-bound state recorded in `spec-e20w-web-conforme-search-relink.md`.
  - The red re-ran alone under the lock with `--repeat-each 3` at load 4.06 to 4.35 and passed 3 of 3. It is counted under E15-A4 with both runs recorded.
  - `pnpm test:e2e:matrix` ran 667 s and passed: 149 passed, 16 skipped, 0 failed.
  - `pnpm test:e2e` (`@p0`) was not run separately; `test:e2e:full` runs every `@p0` test.
- **Integrated review.**
  - The second pass, a code read over both batches' "patched, not re-reviewed" lists and the e23a/e23b seams, found 4 defects:
    - R2-1, medium: the display reading drops values on v13 tap rows.
    - R2-2, medium: `removeDraftEntry` leaves dangling e23b references on a company type.
    - R2-3, low: the vector-group missing count includes optional and off-plate taps.
    - R2-4, low: the web counts plate taps itself.
  - All four go to fix batch e23g. The behavior pass runs in parallel with e23g, and its findings join e23g.

### Wave 2

~~*(Filled by the coordinator.)*~~ *(2026-11-10, coordinator.)*

- **Merges.**
  - Fix batch e23g, PR #289, merged as `982bebb9` (no contract).
  - e23v, PR #290, head `842c5b9a`, merged as `967d898a` (contract 36).
  - e23h, PR #291, head `b3af9bf4`, merged as `8c097ffa` (contract 37). It merged main `967d898a` (e23v) in first and kept e23v's `V13_HASH`.
  - Docs PR #292 (Bruno's 2026-11-09 answers, B-1 to B-7) merged as `32bd1845` while the gate ran; it changes no code.
- **Integrated gate** on `8c097ffa`.
  - Lock wait 1 s. Load `{ 4.16 4.20 4.36 }` at the start and `{ 6.04 5.82 6.69 }` at the end.
  - `pnpm test:e2e:full` ran 7505 s and failed. The parallel group had 461 tests: 452 passed, 5 failed, 4 skipped. The serial group had 175: 174 passed, 1 failed. Total 636: 626 passed, 6 failed, 4 skipped.
  - The six reds re-ran alone under the lock. Five passed: `@p0` 4.2-E2E-001, `@p1` 4.2-E2E-002, `@p1` F-13, `@p1` F-21 and `@p0` 14.3-E2E-001. They are counted load-bound under E15-A4, with both runs recorded.
  - The sixth, `@p1` 13.5-E2E-004 (`reading-wait.spec.ts:384`), was red alone too. It went to fix batch e23w as W2-G1. The bisect found a race in the test (the engine arms the next tick when a cycle ends), not a 60 s poll regression. The test was fixed and the product left unchanged.
  - `pnpm test:e2e:matrix` ran 987 s and passed: 152 passed, 16 skipped, 0 failed.
  - `pnpm test:e2e` (`@p0`) was not run separately; `test:e2e:full` runs every `@p0` test.
- **Integrated review.** The second pass, a code read of `8c097ffa`, found W2-1 to W2-4 (three medium, one low) and carried W2-K1 and W2-K2 from the batches. All of them, with the gate red W2-G1, went to fix batch e23w (§ "Fix batch e23w").
- **Fix batch e23w**, PR #293, merged as `6acf9ca7` (no contract; `V13_HASH` re-pinned).

### Wave 3

~~*(Filled by the coordinator.)*~~ *(2026-11-10, coordinator.)*

- **Merges.**
  - e23t, PR #294, head `9f4caba7`, merged as `fc0aa508` (contract 38). It merged main `6acf9ca7` (e23w) in first, re-pinned `V13_HASH` and ran its merge gate (`spec-e23t-transformer-tests.md`).
  - e23e, PR #295, head `784bfee6`, merged as `7f29b243` (contract 39).
  - e23x (Story 23.12, M-1 (b)), PR #296, head `6a7e641e`, merged as `ef099d41` (no contract).
- **Integrated gate** on `ef099d41`.
  - Lock wait 1 s. Load `{ 5.19 7.02 7.28 }` at the start and `{ 5.44 5.36 5.64 }` at the end.
  - `pnpm test:e2e:full` ran 3216 s and failed on one test. The parallel group passed: 464 tests, 460 passed, 4 skipped. The serial group had 187: 186 passed, 1 failed. Total 651: 646 passed, 1 failed, 4 skipped.
  - The red was `@p0` 21.1-E2E-002 (`seed-v11.spec.ts:95`). It re-ran alone under the lock with `--repeat-each 2` and passed 2 of 2. The lock wait was 744 s, and the load was `{ 17.43 13.68 11.54 }` at the start. It is counted load-bound under E15-A4, with both runs recorded.
  - `pnpm test:e2e:matrix` ran 738 s and passed: 152 passed, 16 skipped, 0 failed.
  - `pnpm test:e2e` (`@p0`) was not run separately.
  - This run is the baseline of chore T3 (serial group 30.8 min, total 53.6 min; `spec-t3-serial-split.md`).
- **Integrated review.** The second pass, a code read, found W3-1 to W3-7: W3-1 and W3-3 medium confirmed, W3-2 medium plausible, W3-4 to W3-6 low confirmed and W3-7 low plausible. W3-3 is the seam between e23x's copies and print grouping. All seven went to fix batch e23z.
- **After the gate.**
  - Chore T3 (the serial group in two lanes), PR #297, merged as `e77885d7` (no contract).
  - Fix batch e23z, PR #298, merged as `47be2638` (contract 40). Its record is in `spec-e23z-final-fixes.md`.

### Final gate

*(2026-11-10, coordinator.)* This is the integrated gate on `47be2638`, which holds every Epic 23 merge, T3 and e23z.

- Lock wait 0 s. Load `{ 2.85 4.21 4.94 }` at the start and `{ 5.08 6.23 5.32 }` at the end.
- `pnpm test:e2e:full` ran 2411 s and passed, with T3's lanes:
  - parallel: 464 tests, 460 passed, 4 skipped;
  - queue: 150 of 150;
  - solo: 42 of 42;
  - total: 656 tests, 652 passed, 0 failed, 4 skipped.
- `pnpm test:e2e:matrix` ran 654 s and passed: 168 tests, 152 passed, 16 skipped, 0 failed.
- `pnpm test:e2e` (`@p0`) was not run separately.

### Deploy

~~*(Filled by the coordinator.)*~~ *(2026-11-10, coordinator.)*

- **First deploy.** `ef099d41` (contract 39, MIN 39) went to production on 2026-11-09 at 23:56, through `infra/bin/deploy`.
  - The smoke passed 8 of 8.
  - The usage-event check found 6 `session_start` with the new `app_version` and 0 `ux_event_sink_failed`.
  - The image tag before it was `ae3d37e0`.
  - It went out after wave 3's gate and before wave 3's fix batch. So the production bundle carries the W3 findings that e23z fixes.
- **Second deploy.** ~~`47be2638` (contract 40: e23z and T3) is not deployed. It waits for Matheus's word.~~ *(2026-11-10, coordinator.)* `47be2638` (contract 40: e23z and T3) went to production on 2026-11-10, through `infra/bin/deploy`.
  - `GET /api/health` returned every component up.
  - The smoke passed 8 of 8.
  - The usage-event check found 6 `session_start` with the new `app_version` since 2026-11-10T11:39:13Z, and 0 `ux_event_sink_failed`.
  - The image tag before it was `ef099d41`.
  - Bruno's base is imported in production only after it, because W3-3's print grouping of the copies lands with e23z.
- **Read-only production counts.** *(2026-11-10, coordinator.)* Two counts ran in production on 2026-11-10. Each was a command override on the migrate task, inside a read-only transaction, and returned counts only.
  - Company type versions: zero. So no company copy made before `base_block_type` exists in production (the e23z row of W3-3 in `deferred-work.md` is closed with this).
  - Templates on seed v13: 11, in 2 companies. None carries the sub-block `ia_ip_display` on a transformer block, and there is no stale transformer block.
  - So finding F1 of the behaviour pass is local dev data only.
- **Browser behaviour pass.** *(2026-11-10, coordinator.)* It ran on 2026-11-10 on the product code of `47be2638`. The report is `_bmad-output/test-artifacts/manual/behaviour-pass-e23-2026-11-10.md`.
  - Items 3 to 8 passed.
  - Items 1 and 2 failed: the v13 transformer insulation table in print.
- **PR #300** (`b307ced1`), 2026-11-10: tests only. It closes the Epic 23 verification rows of `deferred-work.md`.
- **Fix batch e23p**, PR #301, merged as `9add87b5` on 2026-11-10 (no contract change: still 40, minimum 40). It fixes the pass findings F2, F3, F4 (the screen and the point's text), F5 and F7. Its record and its gates are in § "Fix batch e23p".
- **Third deploy.** COORDINATOR-FILLS
- **Release v0.8.0.** COORDINATOR-FILLS
- **Paid plate eval** of `bedrock-structuring-8`, on Matheus's AWS login (profile `fasor-admin`), Textract, Bedrock `us-east-1`. The log is stamped 2026-11-10 05:50 to 05:54 UTC, which is after the first deploy.

  | Set | Haiku 4.5 | Nova Pro |
  | --- | --- | --- |
  | Synthetic, 15 plates | 97,6 % (80 of 82 fields), 0 failed | 98,8 % (81 of 82), 0 failed |
  | Real, 6 plates (`docs/media/real-plates-2026-11-06/`) | 5 of 6 | 6 of 6 |
  | Mean USD per reading, synthetic | 0.0062 | 0.0041 |
  | Mean USD per reading, real | 0.0097 | 0.0069 |

  - Citations were valid at 100 % on both models.
  - The vector group was read right on every synthetic plate by both models. On the real set, Haiku gives no group for tf3, the blurred, rotated photo, as it did on prompt 5; Nova Pro reads all six as Dyn1.
- **The "before the deploy" rows** of `deferred-work.md` are closed with dates:
  - the e23b eval row and the e23e row, by the eval above;
  - the e23w contract row, since MIN followed wave 3 to 39.
- **Matheus's decisions of 2026-11-10** on the open Epic 23 rows of `deferred-work.md`. *(2026-11-10, coordinator.)* Each decision is on its row's `state:` line.
  - Kept as built, no change: the malformed manufacturer's value on older sheets, the three readings of the manufacturer's value and the instrument limit, the tap reading dropped at sync, the re-issue after two later visits, the old spelling of TIPO DE ISOLAÇÃO, the Malha's five points, the base's texts on the imported types only, the re-import that does not update held copies, and the IP rows' "Como ensaiar" texts.
  - Three of those leave a question: the Malha's extra point and the IP texts go to Bruno, and the re-import is decided again when Bruno sends a new revision of the base.
  - Changed inside Epic 24, with no extra batch: the arrester's prerequisite read only while its nameplate block is on (wave 1), the cable's default fake plate fixture (wave 2), and a publish issue for a transformer type that lost its vector group field (wave 3).
  - Tap budgets: the limits measured on seed v13 are accepted (J1 11 taps, SM-3 22 taps). The budget documents are amended with seed v14 in Epic 24.
  - The Porto Seguro test line (e23e) was closed by the coordinator: it does not break the layout lock.
- **Moved to Epic 24 or to Bruno** from the behaviour pass: F6, the print half of F4 and the low findings F9 to F20. F8 is a question for Bruno: is a rise of exactly 50 % already Reprovado?
- **Still open** (handover of 2026-11-10):
  - ~~the second deploy;~~ *(2026-11-10, coordinator: done, see "Second deploy" above.)*
  - ~~the browser behavior pass, never run: the PDF of the v13 insulation table at 8 pt, the TP insulation, the contact rise, thermography, the Malha and the base import;~~ *(2026-11-10, coordinator: run, see "Browser behaviour pass" above.)*
  - the release v0.8.0, on Matheus's word;
  - ~~the optional read-only count, in production, of the company copies made before `base_block_type`;~~ *(2026-11-10, coordinator: run, zero company type versions, see "Read-only production counts" above.)*
  - the Epic 23 retrospective.
