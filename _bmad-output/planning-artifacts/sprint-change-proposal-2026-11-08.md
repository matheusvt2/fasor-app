# Sprint change proposal: Bruno's test base as the product's criteria, Epic 23 (2026-11-08)

Prepared in the correct-course workflow on 2026-11-08, non-interactively and in batch mode. Matheus took the decisions the same day in four rounds of questions, after Bruno's test base rev08 arrived. This proposal records them and turns them into Epic 23. It decides nothing new: where a point is still undecided, it is listed as an open item for Bruno or Matheus (section 6), never guessed. Status: **approved by Matheus's decisions of 2026-11-08** ("Planejar e já construir, em lotes paralelos"); the open items of section 6 stay open.

**Sources (gitignored, pt-BR, absent on other machines).** The values, procedures and recommendations of Bruno's base stay in these files. This document cites the base by row ID ("Base rev08 TR-OL-02") and by table name.

- `docs/context/epic-23/decisoes-epic-23.md`: decision groups A to N (§ 2), the proposed fronts 23-A to 23-E (§ 3) and Matheus's decisions of 2026-11-08 (§ 5, the binding part).
- `docs/context/epic-23/respostas-bruno-rev08-2026-11-08.md`: rev08 mapped against the 37 questions sent to Bruno on 2026-11-07, and what is still open with him.
- `docs/context/epic-23/divergencias-base-x-produto.md`: rev03 against seed v12, row by row, with `file:line` evidence. rev08 changed some rows; see the respostas file § 1.
- `docs/context/epic-23/literatura-criterios.md`: the public sources for each criterion.
- `docs/context/Fasor_Base_Ensaios_MT_rev08.json` (same content as the `.xlsx`): 44 tests, the reference tables and the per-row `regra` objects. Map: `docs/kbs/project/test-base.md`.

## 1. Issue summary

**Trigger.** Bruno sent his "Base de Ensaios MT" on 2026-11-07 (rev03) and rev08 on 2026-11-08, with the JSON he promised. He meant it as the source the app reads: the technician fills in the equipment's characteristics, and the app picks the tests and judges them. Compared with seed v12, none of the base's 42 rev03 tests matches the product exactly. 10 differ, 9 match in part and 23 are missing. The coordinator's reading of 2026-11-07 found five structural differences:

1. **Criterion.** The product uses one fixed criterion per test kind (`seed/criteria.ts`: > 400 MΩ, < 250 µΩ, ± 0,5 %). The base uses tables by voltage and medium, with temperature correction.
2. **Verdict.** The product has two levels per reading (`ReadingVerdict = 'within' | 'out'`, `relatorio/reading-cells.ts:42`). The base has three: Aprovado, Aprovado com restrições, Reprovado.
3. **Test choice.** In the product, tests are switched in the template (FR-11). In the base, the equipment's characteristics pick the tests ("Aplica-se quando").
4. **Field help.** The product has no procedure and no recommendation per test.
5. **Manufacturer value.** The kernel can already apply one (`criterion_override`, `relatorio/reading-evaluation.ts` `effectiveCriterion`), but there is no surface for it. Story 14.13 is in the backlog.

**Category.** New requirements from the domain expert. They change how the product judges a test. No defect, and no failed approach.

**Evidence.**
- The divergence file: each base row against `seed/v12.ts`, `seed/criteria.ts` and `relatorio/*`.
- The literature file: public confirmation for most rows, with six caveats. Three values have no public source and stay labelled PADRÃO FASOR.
- rev08 closes every pending point of rev03 inside its rows. Its Pendências sheet is empty.

## 2. Impact analysis

### Epic impact

- **Epic 22** is done and deployed (`ae3d37e0`, v0.7.0). Nothing in it is reopened.
  - Its seed v12 stays frozen (AD-21).
  - Story 22.10's over-range state, Story 22.12's `last_results` and Story 22.4's conclusion floor are the mechanisms Epic 23 extends.
- **Story 14.13** (the manufacturer's criterion) is absorbed by Story 23.3. It stays in `epics.md` with a dated line and closes when 23.3 is done.
- **Epic 23** is new: 21 stories in five fronts, on one seed v13, for new relatórios only.
- **Fix batch e23f** runs in parallel. It fixes the three print defects of `deferred-work.md` (owner "the first Epic 23 fix batch"), the two tests that are unstable under load and R8LAY. It changes the printed section 8 and the conclusion text of every relatório. So Epic 23's layout lock (Story 23.2) is taken after e23f merges, and every Epic 23 batch that touches its files starts from that main.
- **Out of Epic 23** (decision I):
  - wave 2: breaker timing, coils, vacuum and SF6 (DJ-04 to DJ-06, DJ-08), PR-04, the switchgear (CM) and the capacitor bank (CP);
  - until Bruno asks: tan δ (TR-OL-06, TR-SE-07), TC excitation (TC-05), arrester leakage (PR-03), VLF (CB-03);
  - not in decision I's wave 1, so left for a later epic: the cable shield (CB-04), the TC and TP ohmic resistance (TC-04, TP-04) and the intrinsic protections (TR-OL-10, TR-SE-06).

### Story impact

There are no current stories in progress. Future stories: Epic 23 in full (section 4.1), plus the dated line under Story 14.13.

### Artifact conflicts

| Artifact | Conflict | Resolution |
| --- | --- | --- |
| `SPEC.md` Non-goals, last bullet | "Dedicated grounding measurement, … thermography, oil … sheets (as seeded types)"; "temperature correction to 20 °C" | Lifted for: a seeded Malha de aterramento type, a thermography test on the eight types, oil sampling, and temperature correction. Rows in `source-deltas.md`; the SPEC line is struck through in the build PRs. A concessionaire registry stays out: rev08 AT-01 judges by the design value with a default, nothing per concessionária. |
| `SPEC.md` Non-goals "A decision-maker" | Already amended on 2026-11-06 for the conclusion floor | Extended: a reading in a restriction band raises the floor to Com restrições. |
| `prd.md` FR-11 | Sub-blocks are switched in a Template | On v13 the kernel also makes a test NA from the nameplate, with a visible reason and a technician override. |
| `prd.md` FR-27 and the 2026-09-21 delta | The app computes no index; insulation is captured at 1 minute only | On v13 the IP is judged (TR-OL-03, TR-SE-03), typed or read from the display. |
| `seed/criteria.ts` (Story 2.6, NFR-14) | One seeded criterion per test kind, source "aceitável na ficha" | On v13 the criteria are seed tables with edition and validation status. NFR-14 holds: no criterion number lives outside the seed module. |
| Stories 22.7, 22.8, 22.9, 22.10, 22.12 (built) | TIPO DE ISOLAÇÃO and TIPO DO ÓLEO; per-row voltage defaults; classes; the over-range rule; the previous value only shown | On v13: the liquid fields (H); voltage defaults on every type (D); S classes, polarity and TC function (E); the base's instrument-limit rule (F); the previous value judges (C). v12 and older seeds are unchanged. |
| Seed v1 TTR grammar | "One default TAP row whose `TAP Nº` is typed" (`seed/v1.ts:480`) | On v13, one row per tap of the plate, with the current tap and the extremes pre-marked. |
| Architecture spine AD-21, AD-3, AD-25 | AD-21: a criterion is operator, value, unit, type and source. AD-3: the op families. AD-25: `last_results` is shown only. | Dated notes in the build PRs: criterion tables with edition and status (AD-21); a per-test applicability override field (AD-3, contract); `last_results` read for judging (AD-25). No separate `bmad-architecture` run is planned; this is the coordinator's reading, open to Matheus (section 6). |
| `EXPERIENCE.md`, `DESIGN.md`, mocks | No frame for: the manufacturer value, a restricted reading, an NA-by-applicability test with its override, "Como ensaiar", per-tap TTR rows, the corrected value | Story 23.1 draws them first (E14-A4); dated amendments to both documents. |

### Technical impact

- **Kernel** (`packages/domain`, AD-2): criteria tables, temperature correction, a third reading verdict, applicability, new test grammars and new criterion kinds. All of them are reached through the definition, so a v12 or older definition gives today's result.
- **Contract.** One bump per batch that changes the fold: numbers 34 to 39 reserved in merge order (`epic-23-context.md`).
- **Seed v13** derives from v12 (`V12_HASH` pinned) and freezes at its first deploy.
- **Print.** Only v13 sheets print anything new. Every older relatório prints byte-identical. Story 23.2 locks it with goldens taken after e23f, and every later story keeps them.
- **Plate reading.** The new nameplate fields (23.7), the liquid (23.17) and the TC function (23.18) change the Bedrock prompt. The paid eval runs on Matheus's login before the deploy (E21-A4).
- **Deploy.** Once, after the last wave gate, unless Matheus asks for an earlier one (section 6).

## 3. Recommended approach

**Direct adjustment**: a new epic inside the current plan. No rollback, and no MVP review.

- **Why.** Epic 22 left the mechanisms Epic 23 extends: the conclusion floor, derived points, `last_results`, the over-range state, per-row voltages, class-picked criteria and company types. Matheus's § 5 decisions settle every product question but the ones that wait for Bruno.
- **Effort.** Six build batches in three waves, plus a mock story first, and a small content batch whose start waits for Matheus.
  - Epic 22 took three waves of two lanes in two days, with one fix batch per wave.
  - Expect the same per wave; wave 2 (the three-level verdict) is the riskiest.
- **Risk.**
  - Medium-high on the verdict path. A wrong level reaches the signed document.
  - High on layout protection: Bruno likes the current relatório. That is why the lock comes first.
  - Low on data: new relatórios only, and no relatório migrates.
- **Timeline.**
  - Wave 1 starts when e23f has merged and Story 23.1's frames are approved.
  - Epic 23 deploys once, after wave 3's gate and its integrated review.

## 4. Detailed change proposals

### 4.1 Stories (new, `epics.md` § Epic 23)

The full text of each story, with its Definition of Ready, acceptance criteria and Definition of Done, is in `epics.md` § Epic 23.

| Story | Front | Title | Dev model · Effort | Depends on |
| --- | --- | --- | --- | --- |
| 23.1 | all | The Epic 23 sheet frames in the mocks | opus · medium | none |
| 23.2 | 23-A | Seed v13 opens, older layouts are locked, and insulation is judged by the NETA tables (contract 34) | opus · high | e23f merged |
| 23.3 | 23-A | The manufacturer's value on each test, optional (absorbs 14.13; contract 34) | opus · high | 23.1, 23.2 |
| 23.4 | 23-A | A reading above the instrument's limit under the table criteria | opus · medium | 23.2 |
| 23.5 | 23-A | Temperature correction: insulation at 20 °C, winding resistance at 75 °C | opus · high | 23.2, 23.7 |
| 23.6 | 23-A | Three levels per reading, the comparisons between phases and units, and the previous visit's value judges | opus · max | 23.1, 23.4, 23.5, 23.7, e23f |
| 23.7 | 23-B | Seed v13 nameplate fields (decision K; contract 35) | opus · high | 23.2's first commit |
| 23.8 | 23-B | The TTR has one row per tap of the plate | opus · high | 23.7 |
| 23.9 | 23-B | A test applies from the nameplate: automatic NA with its reason, and the technician's override (contract 35) | opus · max | 23.1, 23.7, e23f |
| 23.10 | 23-C | "Como ensaiar" on each test: on screen only, offline, editable in the type editor (contract 37) | opus · high | 23.1, 23.2 |
| 23.11 | 23-C | The test's recommendation is the initial text of its derived point (contract 37) | opus · medium | 23.10, e23f |
| 23.12 | 23-C | The base's help and recommendation texts in the seed | opus · medium | 23.10, 23.11, 23.13 to 23.21; **Matheus's decision** |
| 23.13 | 23-D | Test-voltage defaults on every insulation row (decision D) | opus · medium | 23.7 |
| 23.14 | 23-D | Contact resistance: the manufacturer's value, else the default, with the pole deviation as restriction (decision L) | opus · medium | 23.3, 23.6 |
| 23.15 | 23-D | Winding resistance on the transformer | opus · high | 23.5, 23.6, 23.7, 23.9 |
| 23.16 | 23-D | The polarization index judged | opus · medium | 23.4, 23.6 |
| 23.17 | 23-D | The insulating liquid and oil sampling (decision H) | opus · high | 23.7, 23.9 |
| 23.18 | 23-D | TC and TP: polarity, the TC's function and the S classes (decision E) | opus · high | 23.7, 23.9 |
| 23.19 | 23-D | HH fuse resistance on the seccionadora | opus · medium | 23.6, 23.7, 23.9 |
| 23.20 | 23-D | Thermography on the eight types | opus · high | 23.6, 23.9 |
| 23.21 | 23-E | A new type: Malha de aterramento | opus · high | 23.2, 23.9 |

**Batches** (detail and conflict files in `_bmad-output/implementation-artifacts/epic-23-context.md`):

| Wave | Batch | Stories | Contract (reserved) | Notes |
| --- | --- | --- | --- | --- |
| 0 | coordinator, `bmad-ux` | 23.1 | none | During e23f; Matheus approves the frames. |
| 1 | e23a | 23.2, 23.3, 23.4 | 34 | Owns `seed/v13.ts` and the layout lock. |
| 1 | e23b | 23.7, 23.8, 23.9 | 35 | Stacked on e23a's first commit (seed v13 and the lock). |
| 2 | e23v | 23.5, 23.6, 23.14 | 36 | The verdict lane. |
| 2 | e23h | 23.10, 23.11 | 37 | The help lane. |
| 3 | e23t | 23.15, 23.16, 23.17, 23.19 | 38 | Transformer and switching tests. |
| 3 | e23e | 23.13, 23.18, 23.20, 23.21 | 39 | Voltages, TC and TP, thermography, the ground grid. |
| 4 | e23x | 23.12 | none | Starts on Matheus's decision. |

**Story 14.13.** After its heading, a dated line: "absorbed by Story 23.3 (2026-11-08, decision G); its open questions are answered there". It stays `backlog` in `sprint-status.yaml` with that note and closes with 23.3.

### 4.2 `source-deltas.md`

Fourteen rows dated 2026-11-08, each with the stale statement, the decision and its group (A to N), marked "(planned, Story 23.x)". The build PRs replace "planned" with the built record, as the 2026-11-06 rows were.

### 4.3 PRD and SPEC

No inline edit in this PR. Each row of 4.2 is the record, and the build PR of the named story strikes the SPEC Non-goals line through with its date (the Story 22.12 precedent).

### 4.4 Architecture

No inline edit in this PR. Stories 23.2 (AD-21), 23.6 (AD-25) and 23.9 (AD-3) each carry "the spine gains a dated note under AD-n" in their Definition of Done.

### 4.5 UX

Story 23.1 draws the frames and amends `EXPERIENCE.md` and `DESIGN.md` with dated lines. `MOCK-GUIDE.md` lists the new frames.

### 4.6 Knowledge base

The KB gains:
- `project/test-base.md`: the dated Epic 23 note;
- `planning/epics-map.md`: the Epic 23 line;
- `architecture/kernel-and-seed.md`: the planning note on seed v13 and the reserved contracts;
- `log.md`: one line.

## 5. Implementation handoff

**Scope: Moderate.** It needs backlog reorganization: a new epic, the absorbed 14.13 and the batch plan. The PM or Architect replan is limited to the dated spine notes the stories carry. The coordinator runs the batches through `epic-batch-orchestrator.md`.

| Item | Owner | Done when |
| --- | --- | --- |
| Story 23.1 frames | Coordinator with `bmad-ux` | Matheus approves the frames in the browser at 390, 768 and 1280 px |
| Waves 1 to 3 | Batch orchestrators (`bmad-build-auto`, opus, the story's effort) | Story gate green and pasted in each PR; wave gate green; two-pass integrated review accepted |
| Story 23.12 | Batch e23x | Matheus's decision recorded under the story, then the gate |
| Paid plate eval | Coordinator on Matheus's AWS login | `bedrock-eval.ts` table recorded before the deploy |
| Open items (section 6) | Matheus; Bruno through Matheus | Each answer is recorded under its story with its date |

**Success criteria.**
- A new relatório on seed v13 judges insulation by the NETA tables and shows three levels per reading.
- Its tests apply from the nameplate, with an override.
- It shows "Como ensaiar" offline and takes a manufacturer's value.
- It carries the wave 1 tests of decision I and the Malha de aterramento type.
- Every relatório on v1 to v12 prints byte-identical to the layout-lock goldens and the Porto Seguro goldens.

## 6. Open items

### For Bruno (through Matheus)

None of these is guessed. Each one is a DoR blocker or an out-of-scope note in its story. The question numbers are those of the 2026-11-07 list.

| Item | Question | Where it binds | Until he answers |
| --- | --- | --- | --- |
| B-1 | Numbers for "ligeiramente acima", "muito acima" and "queda acentuada" (rows DJ-03, SC-03, PR-03, TR-OL-03, TR-SE-03, CB-02) | 23.6, 23.14, 23.16 | No restriction band is built from a vague term. Only the bands the base states in numbers exist. |
| B-2 | TTR instrument, single-phase or three-phase: this decides the Yd factor (decision N) | 23.8 | The product keeps √3/2 (Story 21.1) on every tap row. |
| B-3 | Mineral oil type A and B (ANP 900/2022) | 23.17 | The "Tipo (ANP)" field ships as Matheus decided (A, B, não informado). No criterion reads it. |
| B-4 | Does the TP need an insulation field? (TP-02 picks its column by "Seca" or "Óleo") | 23.2 | The v13 TP keeps v12's > 400 MΩ. TP-02's table judging is out of scope. |
| B-5 | The high-voltage notice: above 1 kV on a winding of up to 1000 V | 23.13 | The notice stays as built (Story 22.8, OQ-1). |
| B-6 | Contact resistance that rose against the previous visit beyond the threshold of question 14b: "com restrições" or "reprovado"? | 23.6, 23.14 | No previous-visit rule on contact resistance. Only the deviation between poles restricts. |
| B-7 | Confirmations, not blocking: VLF on IEEE 400.2-2024 (out of scope anyway); vegetable oil changes only the power factor (tan δ is out); thermography's lowest NETA 100.18 class approved with no observation (GE-01 as written); "Como ensaiar" and the recommendation as the point's text (questions 35 and 36) | 23.20, 23.10, 23.11 | Built as the base and Matheus's decisions say. A different answer becomes a fix. |
| B-8 | What CONDIÇÕES prints for a restricted row on v13. The coordinator's reading: SATISFATÓRIO, since the row is within its criterion; the restriction shows in the conclusion floor and in the derived point. | 23.6 | The reading is taken. |
| B-9 | Where the instrument-limit observation prints. The coordinator's reading: a kernel note under the test's table, not in OBSERVAÇÕES, because an observation would raise the floor. | 23.4 | The reading is taken. |
| B-10 | The product questions 18, 19 and 22 to 34, and the texts of question 37 | outside Epic 23 | Unchanged. |
| B-11 | Each story's authored wordings, listed in its PR | every story | Listed. |

### For Matheus

| Item | Decision needed | Where it binds | Default until he decides |
| --- | --- | --- | --- |
| M-1 | The base's procedure and recommendation texts in the **public** repository. AGENTS.md forbids copying client material from `docs/context/` into tracked files, and the only waiver is R-023 (the Porto Seguro fixture). Either a waiver like R-023 for these texts in seed v13, or a private load path (an import into company data that is never committed). | 23.12 (DoR blocker) | Stories 23.10 and 23.11 build the mechanism with no seeded text. "Como ensaiar" shows only what an office type's editor holds, and a derived point keeps the generic text. |
| M-2 | Deploy once after wave 3 (the default; seed v13 freezes there), or per wave, so that later waves take seed v14 | `epic-23-context.md` | Once after wave 3. |
| M-3 | No separate `bmad-architecture` run: the AD-21, AD-3 and AD-25 notes are written in the build PRs | 23.2, 23.6, 23.9 | As stated. |
| M-4 | How v13's TIPO DE ISOLAÇÃO (Bruno's "ÓLEO MINERAL" of 2026-11-06) sits beside "Natureza do líquido". The coordinator's reading: the option reads "ÓLEO ISOLANTE" on v13, Natureza do líquido names the liquid, and the oil rule reads both. | 23.17 | The reading is taken unless he corrects it before wave 3. |
| M-5 | The print of a temperature-corrected reading on v13. The coordinator's reading: the TEMPERATURA in the table's header line, and a CORRIGIDO column after the values, within the 60 em fit rule (e22g). | 23.5 | The reading is taken; Story 23.1 draws it for his approval. |
| M-6 | Where the Malha de aterramento sits in the tree. The coordinator's reading: at a local, like the library types, printed under "Outros equipamentos". | 23.21 | The reading is taken. |

## Matheus's decisions on the open items (2026-11-08)

| Item | Decision |
| --- | --- |
| M-1 | (b), the private load path: the office imports Bruno's JSON through the app; the texts are company data and never enter the repository. Story 23.12 is that import. |
| M-2 | One deploy after wave 3, with seed v13 frozen, on Matheus's word. |
| M-3 | No separate `bmad-architecture` run; the dated AD notes go in the build PRs, as planned. |
| M-4 | The coordinator's reading is taken: on v13 the TIPO DE ISOLAÇÃO oil option reads "ÓLEO ISOLANTE" beside "Natureza do líquido"; older relatórios keep "ÓLEO MINERAL". |
| M-5 | The coordinator's reading is taken; Story 23.1 draws it for his approval. |
| M-6 | The coordinator's reading is taken: at a local, printed under "Outros equipamentos". |

## Bruno's answers on the open items (2026-11-09, through Matheus)

The answers in his words and their full mapping are in `docs/context/epic-23/respostas-bruno-rev08-2026-11-08.md` § 5 (gitignored).

| Item | Answer | Effect |
| --- | --- | --- |
| B-1 | Keep the number beside the legend, to be improved later | No band is built from a vague term. Showing the measured number beside the legend is a later improvement, outside Epic 23 (the coordinator's reading). |
| B-2 | The Fasor TTR is single-phase | Closed. √3/2 stays (decision N). |
| B-3 | "ok" | The "Tipo (ANP)" field ships as decided, with no criterion (the coordinator's reading). |
| B-4 | The TP needs the insulation field on every model | In scope: a dated line with criteria under Story 23.2, built by the wave 2 fix batch. |
| B-5 | The notice is ok | Closed. It stays as built. |
| B-6 | A rise of 50 % is Reprovado | In scope: a dated line with criteria under Story 23.14, built by the wave 2 fix batch. |
| B-7 | VLF on IEEE 400.2-2024 and NETA 2023; vegetable oil, thermography and "Como ensaiar" confirmed | Closed, except question 36 (the recommendation), which he has not confirmed. |

## Checklist record

| Item | Status | Note |
| --- | --- | --- |
| 1.1 Triggering story | [x] | No story; Bruno's base rev03 (2026-11-07) and rev08 (2026-11-08) |
| 1.2 Core problem | [x] | New requirements from the domain expert: criteria as data, three levels, applicability, help, new tests |
| 1.3 Evidence | [x] | The divergence and literature files; the rev08 mapping |
| 2.1 Current epic | [N/A] | Epic 22 done and deployed; nothing reopened |
| 2.2 Epic-level changes | [x] | New Epic 23; Story 14.13 absorbed |
| 2.3 Remaining epics | [x] | Epic 14 keeps 14.13 as absorbed; no other epic is affected |
| 2.4 New or obsolete epics | [x] | Epic 23 new; decision I's wave 2 and the "until Bruno asks" tests go to a later epic |
| 2.5 Order and priority | [x] | Wave 0 to wave 4; starts after e23f |
| 3.1 PRD | [!] | FR-11 and FR-27 overridden by `source-deltas.md` rows; no inline PRD edit |
| 3.2 Architecture | [!] | AD-21, AD-3 and AD-25 dated notes in the build PRs (M-3) |
| 3.3 UX | [!] | Story 23.1 frames and dated amendments |
| 3.4 Other artifacts | [x] | SPEC Non-goals (rows), `sprint-status.yaml`, the KB, `epic-23-context.md` |
| 4.1 Direct adjustment | Viable | Recommended |
| 4.2 Rollback | Not viable | Nothing built needs undoing |
| 4.3 MVP review | Not needed | Post-MVP growth within the product's scope |
| 4.4 Path | [x] | Direct adjustment, in waves |
| 5.1 to 5.5 Proposal | [x] | Sections 1 to 6 |
| 6.1 to 6.5 Final review and handoff | [x] | Approved by Matheus's § 5 decisions; open items kept open |
