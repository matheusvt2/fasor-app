# Sprint change proposal: Bruno's answers on the product, Epic 24 (2026-11-10)

Prepared in the correct-course workflow on 2026-11-10, in batch mode. Bruno answered questions 18, 19, 22 to 30 and 32 to 34 of the 2026-11-07 list on 2026-11-10. Matheus took seven decisions the same day. This proposal records them and turns them into Epic 24. Where a point is still undecided it is listed as an open item (section 6), never guessed. Status: **story list approved by Matheus on 2026-11-10** ("sim"), with two additions he asked for the same day: the four low findings of the hands-on pass go into Epic 24, and the ledger of deferred work was swept for rows that fit its batches (section 4.1). The stories are written in `epics.md` with John (`bmad-agent-pm`) and built by Amelia (`bmad-agent-dev`). Nothing is built before the planning PR is merged.

**Sources (gitignored, pt-BR, absent on other machines).** Bruno's words stay in these files. This document cites them by question number.

- `docs/context/epic-23/respostas-bruno-produto-2026-11-10.md`: Bruno's answers and, at its end, a table comparing each request with main.
- `docs/context/epic-23/perguntas-bruno-2026-11-07.md`: the questions.
- `_bmad-output/test-artifacts/manual/behaviour-pass-e23-2026-11-10.md` (tracked): the hands-on pass on seed v13, findings F1 to F20.
- `_bmad-output/implementation-artifacts/deferred-work.md`: the rows Matheus folded into Epic 24 on 2026-11-10.

## 1. Issue summary

**Trigger.** Bruno reviewed how the product concludes a ficha, names equipment, lists its checks and compares visits. He agrees with part of it and corrects the rest. His answers fall into five groups:

1. **How a ficha concludes** (questions 24 to 28).
   - The suggested conclusion must read as a preview until the technician concludes.
   - A reading out of its criterion makes the ficha Reprovado only. "Com restrições" exists only together with Aprovado.
   - An observation does not make a restriction. The restriction is the technician's explicit choice, with a justification.
   - The automatic NC phrase goes away when the item changes, but only while it is still the automatic text. If the technician edited it, the app warns.
   - When an item goes back to Conforme, its point of attention is removed or the app asks.
   - The finding must be cited in section 10. No positive conclusion with a reproved ficha.
2. **Names** (question 29). The TAG is the one on the plate, the single-line diagram or the one used on site. With none, the app suggests the type and a two-digit number (TR-01, DJ-01, QGBT-01).
3. **Checklists and sheets** (questions 18, 19, 22, 34).
   - TP and TC need their own lists.
   - The oil transformer and the dry transformer each need items the other does not have.
   - The QGBT inspection lacks retightening, a function test and an optional thermography.
   - A new sheet: No-break de comando, with its plate, its battery bank and its checks, and no tests for now.
4. **The previous visit in print** (question 23). The date of the previous visit in the header, and the relevant drops and rises marked.
5. **Company types** (questions 30, 32, 33). A criterion "nominal ± %", and hiding the original type once it was copied.

**Category.** Corrections and new requirements from the domain expert. Two built rules are wrong by his reading (out of criterion and the observation), so a ficha concludes "Com restrições" far more often than it should.

**Evidence.**
- The comparison table at the end of the answers file, each row checked against main.
- Checked in code on 2026-11-10: a reproved ficha already forces "Não apto" in section 10, but the text cites only the ficha's TAG and a reason category. It does not name the finding.
- The conclusion rules have no seed gate today. They apply to every relatório.
- The hands-on pass of 2026-11-10 found twenty points on seed v13. Five were fixed before the release v0.8.0 (fix batch e23p). The rest are placed in this proposal or in the questions for Bruno.

## 2. Impact analysis

### Epic impact

- **Epic 23** is done, deployed (`9add87b5`) and released (v0.8.0). Nothing in it is reopened. Its seed v13 is frozen (AD-21).
- **Epic 22**'s conclusion rules (Stories 22.4 to 22.6) are the ones Bruno corrects. They stay as they are for every relatório on seed v13 or older.
- **Epic 24** is new: 20 stories, on one seed v14, for new relatórios only.
- **Out of Epic 24.** The No-break's tests: Bruno puts them in a later module.

### Story impact

No story is in progress. Future stories: Epic 24 in full (section 4.1).

### Artifact conflicts

| Artifact | Conflict | Resolution |
| --- | --- | --- |
| Stories 22.4 and 22.5 (built), `SPEC.md` Non-goals "A decision-maker" as amended on 2026-11-06 and 2026-11-08 | A reading out of its criterion gives "Reprovado · Com restrições"; an observation on a Conforme item or on the ficha gives "Com restrições" | On v14: out of criterion gives Reprovado only, and a Reprovado ficha prints both restriction boxes empty. An observation gives nothing. "Aprovado · Com restrições" is the technician's choice, with a justification. A reading in a restriction band (Story 23.6) still suggests it. |
| Story 22.4 (built): the NC phrase | Removed only on NC to C, and only when the text is exactly the phrase | Also on NC to N.A.; when the text was edited, the app warns and keeps it. All seeds: it is screen behaviour. |
| Story 22.5 (built): the derived point | A point whose origin is resolved stays, marked "Origem resolvida" | The app asks whether to remove it. All seeds. |
| Story 22.6 (built): section 10 | Cites the ficha's TAG and a reason category | On v14 it names the finding. |
| TAG suggestion (`relatorio/tag.ts`) | PREFIX-CODE of the local ("QG-ENEL"), then -2, -3 | The plate's TAG first; with none, TYPE-NN. Always editable. For every sheet created from now on. |
| Seed v12 and v13: the TP's checklist | A copy of the TC's | On v14 each has its own list. |
| Seed v13: the transformer | One list; oil items go N.A. on a dry unit | On v14: two more oil items, three dry items that go N.A. on an oil unit. |
| Seed v12: Inspeção de QGBT | Ten visual items, no test | On v14: retightening, a function test and an optional thermography. |
| Story 22.12 (built), AD-25 | `last_results` keeps the issue date only; the previous column has a fixed header | From now on the service date is kept at issue. On v14 the header shows the previous visit's date (the issue date for older visits) and a note line under the table names the drops and rises. |
| Stories 14.6 to 14.8 (built): company types | Criteria: a limit or a range; a copy sits beside its original | A "nominal ± %" criterion; a copied type hides its original in the field. |
| `EXPERIENCE.md`, `DESIGN.md`, mocks | No frame for: the preview wording, the question about the point, the warning on an edited NC phrase, a Reprovado ficha with no restriction choice, the No-break sheet, the hidden original, the "nominal ± %" criterion | Story 24.1 draws them first (E14-A4); dated amendments to both documents. |

### Technical impact

- **Seed gate.** Everything that changes a verdict or a printed page applies to relatórios on seed v14 only. Every relatório on v1 to v13 concludes and prints as today. Screen-only behaviour (the preview wording, the point question, the NC phrase warning, the TAG suggestion) applies to all.
- **Layout lock.** Seed v13 has relatórios in production. Story 24.2 adds v13 goldens to the lock (v5, v11, v12 and Porto Seguro stay), and every later story keeps them.
- **Seed v14** derives from v13 (`V13_HASH` pinned) and freezes at its first deploy.
- **Contract.** One bump per batch that changes the fold: numbers 41 to 44 reserved in merge order.
- **Stored pair.** A ficha already concluded keeps the pair it stored. Nothing is recomputed.
- **Plate reading.** The No-break's plate and battery fields change the Bedrock prompt. The paid eval runs on Matheus's login before the deploy (E21-A4).
- **Deploy.** Once, after the last wave gate, its integrated review and the hands-on pass, on Matheus's word.

## 3. Recommended approach

**Direct adjustment**: a new epic inside the current plan. No rollback, and no MVP review.

- **Why.** Every change is a correction or an extension of a built mechanism: the conclusion floor, the derived points, the TAG suggestion, the seed checklists, `last_results` and company types. Matheus's decisions settle every product question.
- **Effort.** Four build batches in three waves, plus a mock story first. Waves 2 and 3 run side by side.
- **Risk.**
  - Medium-high on the conclusion path. A wrong pair reaches the signed document, and two sets of rules (v13 and older, v14) must live together.
  - High on layout protection: Bruno likes the current relatório. Print changes only the asked delta, on v14 only.
  - Low on data: new relatórios only, no relatório migrates, stored pairs stay.
- **A process change taken from Epic 23.** The hands-on pass in the browser runs before the deploy, not after it.

## 4. Detailed change proposals

### 4.1 Stories (new, `epics.md` § Epic 24)

The full text of each story, with its Definition of Ready, acceptance criteria and Definition of Done, is written in `epics.md` § Epic 24 once Matheus approves this list.

| Story | Title | Bruno | Applies to | Dev model · Effort |
| --- | --- | --- | --- | --- |
| 24.1 | The Epic 24 frames in the mocks | all | n/a | opus · medium |
| 24.2 | Seed v14 opens and the v13 layout is locked (contract 41) | n/a | v14 | opus · high |
| 24.3 | Out of criterion gives Reprovado only; a restriction is the technician's choice; an observation gives none | 25, 26 | v14 | opus · max |
| 24.4 | Section 10 names the finding | 28 | v14 | opus · high |
| 24.5 | The suggested conclusion reads as a preview until the technician concludes | 24 | all | opus · medium |
| 24.6 | The NC phrase follows its item, and warns when it was edited (contract 42) | 27 | all | opus · high |
| 24.7 | An item back to Conforme: the app asks whether to remove its point of attention | 28 | all | opus · high |
| 24.8 | The TAG: the plate's first, else type and a two-digit number | 29 | new sheets | opus · high |
| 24.9 | Small screen fixes from the hands-on pass | n/a | all | opus · medium |
| 24.10 | TP and TC with their own checklists (contract 43) | 18 | v14 | opus · medium |
| 24.11 | The transformer: oil items and dry items | 19 | v14 | opus · high |
| 24.12 | Inspeção de QGBT: retightening, function test, optional thermography | 22 | v14 | opus · medium |
| 24.13 | A new type: No-break de comando, with no tests | 34 | v14 | opus · high |
| 24.14 | Two small sheet fixes from the pass: the oil sampling's "Outro" reason and the ground grid's plate block | n/a | v14 | opus · medium |
| 24.15 | The previous visit's date in the table header (contract 44) | 23 | v14 | opus · high |
| 24.16 | Drops and rises against the previous visit, as a note line under the table | 23 | v14 | opus · high |
| 24.17 | The test's recommendation fills "Ação recomendada" | n/a | v14 | opus · medium |
| 24.18 | A "nominal ± %" criterion on company types | 30 | company types | opus · high |
| 24.19 | A copied type hides its original in the field | 32 | company types | opus · medium |
| 24.20 | A company type that cannot compute its ratio is not published | n/a | company types | opus · medium |

**What each story carries beyond its title.** "Row" means a row of `deferred-work.md`, cited by the line of its `state:` on main `f89b787a`.

- **24.3**
  - Matheus's decisions 1 and 3: a Reprovado ficha prints both restriction boxes empty, and a concluded ficha keeps its stored pair.
  - The folded row on the arrester (3344): the "Desligador íntegro" prerequisite is read only while the nameplate block is on.
  - The button "Marcar Com restrições" on a reading out of its criterion (row at 3019): on v14 the kernel says when it may show, since out of criterion is Reprovado only. On v13 and older it stays.
- **24.4**
  - Row 3196: an NC observation typed with line breaks no longer breaks the sentence of the conclusion. On v14 only, because the text is built for every seed.
  - Row at 3125: section 10 replaces "nos itens 8 e 9" also when part of the phrase is in bold. On v14 only.
- **24.6** also stops offering the same NC phrase twice, once with the final period and once without (row 2552).
- **24.7**
  - The Points heading with only automatic points reads as the Sumário already does (row 2352).
  - A browser test walks a local's NC item as an automatic point (row at 3025). The story says whether a site item also gets the question.
- **24.8**
  - **A constraint found in the sweep.** A new relatório of an existing obra reuses its equipment by comparing each stored TAG with the suggested one (`relatorio/instantiate.ts`). If only the suggestion changed, the match would fail, the equipment would be created again and the previous visit would be lost. So the story keeps the reuse working: the match no longer depends on the new suggestion. Its tests cover an obra whose equipment carries the old TAGs.
  - It closes row 2051 (a CTA's TAG) and pass finding F14's odd suggestion on a copied transformer type.
  - Row 2727 (the "Blocos" drawer says its target to a screen reader) only if the story touches that drawer.
- **24.9** is screen only. From the pass:
  - the TAPS separator named before the error (F9);
  - a sign that the thermal photo was attached, and the repeated override text (F11, in part);
  - the TP hints (F16, in part);
  - the two helper wordings of the winding resistance (F17);
  - "Critérios usados" for a contact rise that reads as a pass (F19);
  - "Agrupar por tipo" can be switched where the local is set up, not only from the tree menu inside a sheet (F20). Its default stays as it is (M-2);
  - the template list that says "Nenhum template" when templates exist but cannot be read (F1).

  From the sweep: three copy keys shown nowhere are removed (row at 3022), and the shared `signIn` test helper waits longer than 5 s for Home (row 1439), since every Epic 24 spec signs in through it.
- **24.11** also makes the oil-only fields read-only on a dry unit, the mirror of e23p's fix (row 3487, decided with the approval of this list).
- **24.13** adds the cable's missing fake plate fixture (row 3237) with the No-break's own. The script that draws fake plates is corrected only if the new plates need it (row at 3007, third part).
- **24.14**
  - The oil sampling's reason "Outro" takes a text (F10).
  - The ground grid sheet stops offering "Fotografar placa" and stops calling its data "Dados de placa" (F18). The design value keeps working.
- **24.15** stores the service date at issue from now on, and orders the previous visits by it (row 3087). A visit with no stored service date uses its issue date, so nothing old changes.
- **24.16** leaves the table as it is and adds one line under it. It covers the print half of pass finding F4 and the contact table of F6. It takes row 3191 (two glued photo references in section 8) only if it touches that file.
- **24.17** puts the test's recommendation in the point's "Ação recomendada" and no longer in its text, on v14 (F15). The long row splitting across two pages is checked in the same story.
- **24.19** settles the row on the base's texts showing only on imported types (3418).
- **24.20** also refuses a vector group field whose kind or options were changed, not only a removed one (row 3464, item 4). It closes row 3441.
- **The tap budgets** (row 3262: J1 11, SM-3 22, accepted on v13 by Matheus on 2026-11-10) are amended with seed v14 in the seed batch.

**Left out after the sweep, and why.** The ledger has 315 open rows. Most wait for a decision of Matheus (about 115) or an answer of Bruno (about 50), or belong to infra and carry-over lists. Thirteen fit Epic 24's files and are above. These came close and stay out:

- A ficha with no equipment prints its automatic point twice after "Editar" (row 3037). The fix changes the print of every seed, and two batches of wave 1 edit the same file. It goes to wave 1's fix batch if the build leaves room.
- Section 10 prints "[ART]" when the ART is blank (row 1047): needs Matheus's wording (M-4).
- An automatic point linked to another equipment hides the wrong entry (row 3032): needs a rule choice.
- "±1,2 %" with no space and ">=" beside "≥" (rows 3100, 3153): Bruno's, and they change old print. Asked with B-9.

**Batches.**

| Wave | Batch | Stories | Contract (reserved) | Notes |
| --- | --- | --- | --- | --- |
| 0 | coordinator, `bmad-ux` | 24.1 | none | Matheus approves the frames in the browser. |
| 1 | e24a | 24.2, 24.3, 24.4 | 41 | Owns the opening of seed v14 and the v13 lock. The conclusion lane. |
| 1 | e24b | 24.5, 24.6, 24.7, 24.8, 24.9 | 42 | The screen lane. Needs no seed v14. It edits `points/derived.ts` beside e24a, so it merges second. |
| 2 | e24s | 24.10, 24.11, 24.12, 24.13, 24.14 | 43 | The seed lane. After wave 1's gate and fix batch. |
| 3 | e24p | 24.15, 24.16, 24.17, 24.18, 24.19, 24.20 | 44 | Print and company types. Side by side with e24s. |

Each wave ends with its gate on the integrated main, a two-pass integrated review and a fix batch. After the last one: the paid plate eval, the hands-on pass, then the deploy on Matheus's word.

### 4.2 `source-deltas.md`

One row per overridden statement of section 2, dated 2026-11-10, marked "(planned, Story 24.x)". The build PRs replace "planned" with the built record.

### 4.3 PRD and SPEC

No inline edit in the planning PR. Story 24.3's build PR adds a dated line to the SPEC Non-goals "A decision-maker" bullet.

### 4.4 Architecture

No inline edit in the planning PR. Story 24.15 carries "the spine gains a dated note under AD-25" (the service date kept in `last_results`) in its Definition of Done.

### 4.5 UX

Story 24.1 draws the frames and amends `EXPERIENCE.md` and `DESIGN.md` with dated lines. `MOCK-GUIDE.md` lists the new frames.

### 4.6 Knowledge base

`planning/epics-map.md` gains the Epic 24 line, `architecture/kernel-and-seed.md` the planning note on seed v14 and the reserved contracts, and `log.md` one line.

## 5. Implementation handoff

**Scope: Moderate.** A new epic and a batch plan. The coordinator runs the batches through `epic-batch-orchestrator.md`.

| Item | Owner | Done when |
| --- | --- | --- |
| The stories in `epics.md`, the `source-deltas.md` rows, `sprint-status.yaml`, the KB | John (`bmad-agent-pm`), with the coordinator | The planning PR is merged |
| Story 24.1 frames | Coordinator with `bmad-ux` | Matheus approves the frames in the browser at 390, 768 and 1280 px |
| Waves 1 to 3 | Amelia (`bmad-agent-dev`) through the batch orchestrators (`bmad-build-auto`, opus, the story's effort) | Story gate green and pasted in each PR; wave gate green; integrated review accepted |
| Paid plate eval | Coordinator on Matheus's AWS login | The table recorded before the deploy |
| Hands-on pass | QA agent in the browser | Its report tracked before the deploy |
| Deploy and release | Coordinator | Matheus's explicit word |

**Success criteria.**
- On a new relatório (seed v14), a reading out of its criterion concludes the ficha Reprovado with no restriction box marked, an observation changes nothing, and section 10 names the finding.
- The suggested conclusion reads as a preview, the app asks before it removes a point, and it warns before it drops an edited NC phrase.
- A new sheet takes the plate's TAG, else TYPE-NN.
- The v14 sheets carry Bruno's lists, and the No-break de comando exists.
- The v14 print shows the previous visit's date and names the drops and rises.
- Every relatório on v1 to v13 concludes and prints byte-identical to its goldens.

## 6. Open items

### For Bruno (through Matheus)

One message, sent after Epic 24 is built, so that he answers looking at the result. None of these blocks a story.

| Item | Question | From |
| --- | --- | --- |
| B-1 | Is a rise of exactly 50 % against the previous visit already Reprovado? The app reproves only above 50 %. | Pass F8 |
| B-2 | Should section 9 print the criterion and a verdict per row on the winding resistance, the thermography and the ground grid tables? | Pass F6 |
| B-3 | Thermography: is it right that a ficha concludes with no thermography and no notice? Should the points differ by type? | Pass F11, F12 |
| B-4 | Does the "20 °C" header need to say it is the corrected value? | Pass F13 |
| B-5 | Malha de aterramento: does a continuity point beyond the five make a difference? | `deferred-work.md` § e23e |
| B-6 | Does the polarization index need its own "Como ensaiar" text? | `deferred-work.md` § e23x |
| B-7 | The texts the coordinator authored in Epic 23 and the base readings still marked for him | `deferred-work.md` § e23z, § e23p |
| B-8 | TP and TC offer "ÓLEO MINERAL" where the transformer offers "ÓLEO ISOLANTE": one name for both? | Pass F16 |
| B-9 | How a tolerance is written in print: "±1,2 %" or "± 1,2 %", ">=" or "≥" | `deferred-work.md` rows 3100, 3153; Story 24.18 |
| B-10 | A company that already imported the base has no "Como ensaiar" text for the tests seed v14 adds. Does he send a new revision of the base? | `deferred-work.md` row 3433 |

### For Matheus

| Item | Decision needed | Default until he decides |
| --- | --- | --- |
| M-1 | ~~The story list of 4.1, with Story 24.9's small fixes and the batches~~ *(2026-11-10, Matheus: approved.)* | n/a |
| M-2 | ~~The rest of the low pass findings (F10, F15, F18, F20)~~ *(2026-11-10, Matheus: fix them with Epic 24 where they fit; they are in 24.14, 24.17, 24.14 and 24.9.)* One point stays his: whether "Agrupar por tipo" starts switched on for a new local. | It stays off; 24.9 only makes the switch easy to reach. |
| M-3 | No separate `bmad-architecture` run: the AD-25 note is written in the build PR | As stated. |
| M-4 | What section 10 prints when the ART is blank (today "[ART]"), since 24.4 edits that section | Left as it is. |

## Matheus's decisions (2026-11-10)

1. A Reprovado ficha prints both restriction boxes empty. "Com restrições" exists only with Aprovado.
2. When an item goes back to Conforme, the app asks whether to remove the point of attention.
3. A ficha already concluded keeps its stored pair.
4. Three waves: the rules, then the seed beside the print and company types. The No-break's tests stay out.
5. The new conclusion rules apply to new relatórios only (seed v14). Screen-only behaviour applies to all. Older relatórios print byte-identical.
6. The previous visit's date: the service date, stored at issue from now on; older visits fall back to the issue date.
7. Drops and rises print as a note line under the table. The table itself does not change.

8. The story list and the batches of section 4.1 are approved.
9. The four low findings of the hands-on pass left out of the first draft are fixed with Epic 24, and the ledger of deferred work is swept for rows that fit.
10. The stories are written with John and built by Amelia.

Folded in the same day, from the open Epic 23 rows: the arrester's hidden prerequisite (24.3), the cable's fake plate fixture (24.13) and the publish issue for a company type with no vector group field (24.20).

## Checklist record

| Item | Status | Note |
| --- | --- | --- |
| 1.1 Triggering story | [x] | No story; Bruno's answers of 2026-11-10 to questions 18 to 34 |
| 1.2 Core problem | [x] | Two conclusion rules corrected by the domain expert, plus new requirements on names, checklists, print and company types |
| 1.3 Evidence | [x] | The comparison table of the answers file; the code check of section 10; the hands-on pass |
| 2.1 Current epic | [N/A] | Epic 23 done, deployed and released; nothing reopened |
| 2.2 Epic-level changes | [x] | New Epic 24 |
| 2.3 Remaining epics | [x] | No other epic is affected |
| 2.4 New or obsolete epics | [x] | Epic 24 new; the No-break's tests go to a later module |
| 2.5 Order and priority | [x] | Wave 0 to wave 3; waves 2 and 3 side by side |
| 3.1 PRD | [!] | Overridden by `source-deltas.md` rows; no inline PRD edit |
| 3.2 Architecture | [!] | AD-25 dated note in the build PR (M-3) |
| 3.3 UX | [!] | Story 24.1 frames and dated amendments |
| 3.4 Other artifacts | [x] | SPEC Non-goals (row), `sprint-status.yaml`, the KB, `epic-24-context.md` |
| 4.1 Direct adjustment | Viable | Recommended |
| 4.2 Rollback | Not viable | Nothing built needs undoing; older relatórios keep the built rules |
| 4.3 MVP review | Not needed | Post-MVP growth within the product's scope |
| 4.4 Path | [x] | Direct adjustment, in waves |
| 5.1 to 5.5 Proposal | [x] | Sections 1 to 6 |
| 6.1 to 6.5 Final review and handoff | [x] | Story list approved by Matheus on 2026-11-10; M-2's default and M-4 stay open |
