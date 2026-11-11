# Sprint change proposal: Bruno's 33 improvements, Epic 25 (2026-11-11)

Prepared in the correct-course workflow on 2026-11-11, in batch mode. Bruno answered the Epic 24 questions on 2026-11-11 and sent a document of 33 improvements, M01 to M33. Matheus decided the scope the same day: he said "ok" to the coordinator's list of eleven decisions. This proposal records them and turns them into Epic 25. Where a point is still undecided it is listed as an open item (section 6), never guessed. Status: **the decisions are Matheus's; the story list, the waves and the batches wait for his approval (M-1)**. The stories are written in `epics.md` § Epic 25 with John (`bmad-agent-pm`) and built by Amelia (`bmad-agent-dev`). Nothing is built before the planning PR is merged.

**Sources (gitignored, pt-BR, absent on other machines).** Bruno's words stay in these files. This document cites them by item (M01 to M33) and by answer number, in its own words. It names no client and no site: the two relatórios Bruno reviewed are "the relatório reviewed on 2026-11-10" and "the second relatório".

- `docs/context/epic-25/melhorias-identificadas-bruno-2026-11-11.txt`: the 33 improvements, with his own status table.
- `docs/context/epic-24/respostas-bruno-2026-11-11.md`: his answers to the 13 questions of Epic 24, three extra answers and the sentences he corrected.
- `docs/context/epic-25/levantamento-m01-m18-2026-11-11.md` and `levantamento-m19-m33-2026-11-11.md`: two read-only investigations of every item against main, with file paths.
- `docs/context/epic-23/respostas-bruno-produto-2026-11-10.md`: his answers of the day before.
- `_bmad-output/implementation-artifacts/deferred-work.md`: the rows Epic 24 left, in the sections of batches e24p and e24s and of fix batch e24x.

## 1. Issue summary

**Trigger.** Bruno reviewed two relatórios in production and the questions Epic 24 left for him. He found two things that lose work, and a list of points where the ficha, the document and the registries do not agree with what he does in the field.

1. **Saving and sync** (M02, M03, M17, M01). A value, a manufacturer or a conclusion text can show on the screen and never reach the server. Edits can stay pending for minutes. The store keeps a parecer and a result older than the ones the document prints.
2. **Rules of the ficha** (M05, M06, M07, M14, M20, M26, and his answer 1). A sheet with nothing measured concludes Aprovado. A text can contradict its result. A cell cannot be marked not applicable. The test voltage cannot be changed on the sheet. A point names one of three failed poles. A deadline can be past on the day of issue.
3. **Sheets** (M19, M21, M22, M23, M29, M30, M11). The No-break needs its tests. The TC needs an item on its secondary. The thermography needs a "not done" with its reason and points by type. The ground grid needs more points. The insulating medium has two names.
4. **The document** (M09, M10, M12, M13, M24, M31). The cover takes the wrong field. Fixed texts carry errors he corrects by hand in every revision. Measured tables should print their criterion and result on each row. The variation note is too long.
5. **Registries and the AI check** (M18, M25, M27, M32, M16). Instruments with no calibration data, instruments ticked that were not used, a test base that cannot be updated, sheets left in a removed local, and a check that shows old alerts.

**Category.** New requirements and corrections from the domain expert, and two defects that lose data (M02, M03).

**Evidence.** Each item was checked against main by a read-only investigation, and the facts each story depends on were read again on main `76c74711` while the stories were written. Three causes were confirmed in code:
- a field that unmounts drops its pending value (`apps/web/src/input/use-field-commit.ts`), and drafts are saved only when the tab is hidden;
- a sheet edit asks for no sync cycle, cycles are single-flight behind the photo uploads, and file transfers have no time limit (`apps/web/src/sync/engine.ts`, `apps/web/src/sync/client.ts`);
- the stored pair and the stored parecer are written only by a tap, while every reader derives the effective one (`relatorio/conclusion.ts`, `relatorio/parecer.ts`).

**State of the product.** Production runs `1528183f` (seed v13 and the hotfix that stopped automatic points). Main `76c74711` holds Epic 24, built and not deployed: seed v14 is open and freezes at the Epic 24 deploy; the sync contract is 47. Fix batch e24y is in build.

### The 33 items against main

"Done" means built on main. "Production" is said where it is already deployed.

| Item | What it asks | On main `76c74711` | Goes to |
| --- | --- | --- | --- |
| M01 | The ficha's conclusion never looser than what its readings require | Done as a rule: every reader shows the effective pair, and on v14 a reading out of its criterion gives Reprovado. The stored pair can be older | Done; the stored half is Story 25.4 |
| M02 | Edits that show on screen and are not saved | Not done. Three fields drop a pending value | Story 25.2 |
| M03 | Sync that waits until the Sync screen is opened | Partly. Main adds a time limit to JSON requests; nothing else | Story 25.3 |
| M04 | An observation must not force a restriction | Done, in production (fix batch e24h, item H9) | Done |
| M05 | N/A on a reading cell and on a row | Partly. A whole test goes N.A. by the plate since v13 | Story 25.9 |
| M06 | The test voltage editable on the sheet and per row | Partly. Per row since v12; the header's value is fixed | Story 25.11 |
| M07 | A sheet with no measurement must not be approved | Not done | Story 25.6 |
| M08 | A free text in the relatório's conclusion | Bruno marks it done. The ficha's observation is free, and on v14 section 10 names findings and reasons. Etapa 6 still takes no text of its own | Done by his table; question B-15 |
| M09 | The cover's city from the obra, not from the setup's Local | Not done | Story 25.22 |
| M10 | "TCs" and "TPs" in the ratio tables | Not done | Story 25.22 |
| M11 | "A SECO" | Not done | Story 25.19 |
| M12 | A measurement TP labelled as protection | Not done. Screen only | Story 25.22 |
| M13 | The fixed texts of sections 1 to 6 and 10 | Not done | Story 25.22 |
| M14 | A point that names every failed reading, with a suggested priority and action | Partly. Points exist only by a tap (production); on v14 the recommendation fills the action | Story 25.10; the priority is question B-8 |
| M15 | False "possible duplicates" among the points | Done, in production: the detector left with the automatic points | Done; B-16 asks him to confirm |
| M16 | An AI check that is current, and three checks as fixed rules | Not done | Story 25.24 |
| M17 | The stored parecer differs from the shown one | By design: readers derive it. The store is never rewritten | Story 25.4 |
| M18 | Instruments with no calibration data | Not done. Nothing is said when the date is missing | Story 25.12 |
| M19 | The No-break's tests | Partly. The v14 type has its plate and items, and no test | Story 25.17; questions B-1 and B-2 |
| M20 | A conclusion text that contradicts the result | Partly. The text does not know a Reprovado by hand nor a test left unmeasured; a stale text only warns | Story 25.7; the observation against the checklist in Story 25.24 |
| M21 | The oil transformer's items | Done under the form's own labels. He did not recognise them | Story 25.18, hints only; question B-5 |
| M22 | The TC's item on its secondary | Not done | Story 25.18 |
| M23 | A thermography "not done" with its reason; points by type; a point added | Partly. One test with four fixed points; a "no" is stored and not printed | Stories 25.14 and 25.15 |
| M24 | Criterion and result per row; "(corrigido)"; the tolerance's form; the QGBT title | Not done. The last two are fix batch e24y's | Story 25.20; e24y |
| M25 | The instruments of a relatório taken from its sheets | Partly. Section 11 already prints the union | Story 25.13 |
| M26 | Deadlines already past at issue | Not done | Story 25.12 |
| M27 | The test base updated without a new import | Not done | Story 25.23 |
| M28 | A range criterion on company types | Done, in production; "nominal ± %" is on main | Done |
| M29 | One name for the insulating oil, and a vegetable option | Not done | Story 25.19; question B-4 |
| M30 | More continuity points on the ground grid | Not done | Stories 25.14 and 25.16 |
| M31 | A shorter variation note | Partly. It names what three rules flag, in long sentences | Story 25.21; question B-7 |
| M32 | Sheets left in a removed local | Done in code: they are removed with the local, and a leftover is hidden. No warning | Story 25.12; question B-10 |
| M33 | Seven interface sentences | In fix batch e24y, except one | e24y; question B-3 |

### His answers to the Epic 24 questions

| Answer | About | What it means | Goes to |
| --- | --- | --- | --- |
| 1 | A rise of exactly 50 % | Not Reprovado. It is "com restrição"; above 50 % stays Reprovado | Story 25.8 |
| 2 | Criterion and verdict per row in print | Yes | Story 25.20 |
| 3 | The criterion on measured tables | Yes. "Tipo da empresa" stays inside the app | Story 25.20 |
| 4 | The thermography | A sheet may conclude without it, with "Não realizada" and a reason, printed. Points by type, and a point added | Stories 25.14, 25.15 |
| 5 | The "20 °C" header | "20 °C (corrigido)", and the same for 75 °C | Story 25.20 |
| 6 | The ground grid's points | The five are a minimum | Stories 25.14, 25.16 |
| 7 | The polarization index's help text | Its own text | Story 25.23 |
| 8 | The oil's name | One name, with a vegetable option | Story 25.19; B-4 |
| 9 | The tolerance's written form | "220 V ± 5 %" and "≥" | Fix batch e24y |
| 10 | The base's new revision | He sends it; it should enter as an update | Story 25.23 |
| 11 | The TC's secondary | Yes, with his wording | Story 25.18 |
| 12 | A reproved ficha asks for an observation | Yes: as built (Story 24.3) | Nothing to build |
| 13 | An NC item and a restricted reading give Aprovado com restrições | Yes: as built (Story 24.3) | Nothing to build |
| extra | The variation note | Only the relevant ones; one line per equipment when many | Story 25.21; B-7 |
| extra | The QGBT thermography's title | Like the other types | Fix batch e24y |
| extra | The No-break | The six items are right; BATERIAS should say more; the tests are missing | Story 25.17; B-1, B-2, B-13 |
| sentences | Seven corrections | Six are e24y's. One reverses the meaning of its band | e24y; B-3 |

## 2. Impact analysis

### Epic impact

- **Epic 24** is built and not deployed. Its deploy is not held (decision 1). Nothing in it is reopened. Its seed v14 freezes at that deploy. Fix batch e24y finishes first; Epic 25 does not repeat what it changes.
- **Epic 25** is new: 24 stories in six waves. Wave 1 needs no seed and is deployed alone. Waves 2 to 4 are on one seed v15, for new relatórios only. Wave 5 needs no seed.
- **Epic 24's decision 4** ("the No-break's tests stay out") is reversed for seed v15 by decision 4 of this proposal, pending Matheus's alignment with Bruno.
- **Not planned:** how automatic points should work (Epic 24, decision 12).

### Story impact

No story is in progress. Epic 24's stories are in review until its integrated gate. Future stories: Epic 25 in full (section 4.1).

### Artifact conflicts

| Artifact | Conflict | Resolution |
| --- | --- | --- |
| Story 5.3's carry-over and AD-8 as built: a field that leaves mid-typing drops its value and the draft store keeps it | The draft is saved only when the tab is hidden, so an in-app move loses the value | The three fields commit on unmount; the conclusion text also commits while typing. Every seed (Story 25.2) |
| The 2026-09-21 decision C-4 and the sync engine: a cycle runs on launch, on `online`, every 60 s and on "Sincronizar agora" | A sheet edit asks for nothing and waits behind uploads | A commit, a return to the app and the Sync screen ask for a cycle; edits go between two files; transfers get a limit; an alert after one minute (Story 25.3) |
| Story 7.4 and Story 22.6: the parecer is stored only by the engineer's tap; AD-25: a revision keeps its files | The store holds verdicts older than the printed ones | The revision keeps the verdicts it printed. The stored choices are not written over (Story 25.4) |
| Story 5.5: a "Não medido" fills its cell; Story 22.4: the floor comes from the checklist and the readings | A sheet with nothing measured concludes Aprovado | On v15 it does not accept Aprovado and offers "Marcar não ensaiado" (Story 25.6) |
| Story 7.5: "exactly one row may be blocking" | A stale conclusion text only warns, and prints an empty conclusion | It blocks, on every seed. On v15 the paragraph names a Reprovado by hand and the tests left unmeasured (Story 25.7) |
| Fix batch e23w (B-6): a contact rise above 50 % is out; at 50 % it is within | Bruno: exactly 50 % is "com restrição" | On v15 (Story 25.8) |
| Story 5.5 and the reading cell's states | No N/A on a cell | On v15 a cell and a row take "Não se aplica", printed "N/A" (Story 25.9) |
| Story 24.17: a point started from a test names its worst reading | It hides the other readings out of criterion | On v15 it names each one (Story 25.10) |
| Story 5.7 and AR-18: the header's test parameter is the instrument's default, by value | It cannot be changed on the sheet | It is a field of the sheet's header. Every seed (Story 25.11) |
| Story 7.5's list of rows before generating | No row for an overdue deadline, an instrument with no calibration date, a sheet under a removed local | Three `pending` rows (Story 25.12) |
| Story 4.2's Etapa 4: the instruments are ticked by hand | Ticked and unused, used and unticked | Etapa 4 marks what the sheets use and warns on the rest; Cadastros warns on shared certificates (Story 25.13) |
| Story 14.5's measurement table: a test's rows are its definition's; `deferred-work.md` § e23e (no added row, accepted 2026-11-10) | Bruno: the listed points are a minimum | A test may allow rows the technician adds (Story 25.14) |
| Story 23.20: one thermography with four points, not applicable until "Equipamento em carga" is Sim, a "Não" never printed | Bruno: "Não realizada" with a reason, printed; points by type | On v15 (Story 25.15) |
| Story 24.13 and Epic 24's decision 4: the No-break de comando has no test | Bruno and Matheus: the tests enter | On v15, once B-1 and B-2 are answered (Story 25.17) |
| Story 24.10: the TC has no item on its secondary (B-11) | Bruno gave the wording | On v15 (Story 25.18) |
| The 2026-11-08 row on Story 23.17: the transformer's oil option reads ÓLEO ISOLANTE; TP and TC read ÓLEO MINERAL; "Á SECO" | Bruno: one name, a vegetable option, "A SECO" | "A SECO" on v15; the oil's name after B-4 (Story 25.19) |
| Story 22.2 (Bruno, 2026-11-06): the criterion line is removed from measured tables; Story 24.18's narrowing | Bruno now wants the criterion and the result on each row | On v15, two columns (Story 25.20) |
| Story 24.16: the note names each flagged cell with the kernel's full reason | Bruno: only the relevant ones, shorter | On v15, once B-7 is answered (Story 25.21) |
| `seed/sections-v1.ts`, the cover's `{obra}`, the validity line, the ratio tables' headers, the names "TP — proteção" and "TC — proteção" | Errors he corrects by hand | On v15; the names on every seed (Story 25.22) |
| `deferred-work.md` § e23x: a second import never updates (accepted 2026-11-10) | Bruno sends a new revision | An update that keeps the office's edits (Story 25.23) |
| Story 13.8: the AI check runs on a tap and shows its last run | It shows alerts about values already corrected | A mark when it is out of date, and three fixed rules (Story 25.24) |
| `EXPERIENCE.md`, `DESIGN.md`, mocks | No frame for any of the new controls | Story 25.1 draws them first (E14-A4), in two parts; dated amendments to both documents |

### Technical impact

- **Seed gate.** Everything that changes a verdict, seed content or a printed page applies to relatórios on seed v15 only. Every relatório on v1 to v14 concludes and prints as today. Screen-only behaviour applies to all.
- **Layout lock.** Story 25.5 adds v14 goldens to the lock (v5, v11, v12, v13 and Porto Seguro stay), and every later story keeps them.
- **Seed v15** derives from v14 (`V14_HASH` pinned as shipped) and freezes at its first deploy. It cannot open before the Epic 24 deploy.
- **Contract.** One number per batch that changes the fold, a synced row or the seed, taken in merge order. Main is at 47. The next free number is 48 unless fix batch e24y takes it.
- **The fold** changes in one place only: the rows the technician adds (Story 25.14).
- **Tests.** After Story 25.3 an edit is sent by itself. Every spec that asserts a pending op goes offline or pauses the engine first.
- **Paid checks** on Matheus's AWS login before the last deploy: the plate eval if Story 25.19 changes the options the prompt reads, and the audit prompt of Story 25.24.
- **Deploys.** Wave 1 alone, after the Epic 24 deploy. Then one deploy after the last wave, where seed v15 freezes. Each on Matheus's word.

## 3. Recommended approach

**Direct adjustment**: a new epic inside the current plan. No rollback, and no MVP review.

- **Why.** Every item extends or corrects a built mechanism. Matheus's decisions settle the scope. What is still open is listed and is not built.
- **Effort.** Nine build batches in five waves, plus the frames first. Two lanes run side by side in waves 1 to 4.
- **Risk.**
  - High on saving and sync. They touch every commit and the sync engine, so wave 1 ships alone with its own pass.
  - High on the added row. It is the only change to the fold, and every reader of a test must read it.
  - High on print. Bruno likes the current relatório, and the corrected column is the tightest of the document. Print changes on v15 only, from a frame measured against the page.
  - Medium on the conclusion path: two more rules must live beside those of v13 and v14.
  - Low on data: new relatórios only, no relatório migrates, no stored choice is rewritten.
- **What waits for Bruno.** Three stories do not start before he answers (25.17, 25.21 and the oil half of 25.19). The others carry authored sentences and readings listed for him.

## 4. Detailed change proposals

### 4.1 Stories (new, `epics.md` § Epic 25)

The full text of each story, with its Definition of Ready, acceptance criteria and Definition of Done, is in `epics.md` § Epic 25.

| Story | Title | Items | Applies to | Contract | Dev model · Effort |
| --- | --- | --- | --- | --- | --- |
| 25.1 | The Epic 25 frames in the mocks | all | n/a | no | opus · medium |
| 25.2 | What is typed is saved: the conclusion text, the manufacturer and the readings | M02 | every seed | no | opus · high |
| 25.3 | A sheet edit is sent by itself | M03 | every seed | no | opus · high |
| 25.4 | The revision keeps the verdicts it printed | M17, M01 | every seed | yes | opus · high |
| 25.5 | Seed v15 opens and the v14 layout is locked | n/a | v15 | yes | opus · high |
| 25.6 | A sheet with no measurement does not accept Aprovado | M07 | v15 | the batch's | opus · high |
| 25.7 | A stale conclusion text blocks issuing, and the text names a Reprovado by hand and the tests left unmeasured | M20 | the block on every seed; the text on v15 | the batch's | opus · high |
| 25.8 | A contact rise of exactly 50 % is "com restrição" | answer 1 | v15 | the batch's | opus · medium |
| 25.9 | N/A on a reading cell and on a row, and the helper of a limit inside a range | M05 | the cell on v15; the helper on every seed | the batch's | opus · high |
| 25.10 | A point created from a test names every reading out of its criterion | M14 | v15, new points | the batch's | opus · high |
| 25.11 | The test's voltage in the instrument header can be changed on the sheet | M06 | every seed | none expected | opus · medium |
| 25.12 | Three warnings before generating: an overdue deadline, an instrument with no calibration data, a sheet under a removed local | M26, M18, M32 | every seed | no | opus · medium |
| 25.13 | The instruments of a relatório follow its sheets, and registry rows that share a certificate are warned | M25 | every seed | no | opus · medium |
| 25.14 | A row the technician adds in the field | M23, M30, M19 | v15 | yes | opus · max |
| 25.15 | The thermography: "Não realizada" with a reason, printed, and points by equipment type | M23 | v15 | the batch's | opus · high |
| 25.16 | The ground grid takes continuity points beyond the five | M30 | v15 | the batch's | opus · medium |
| 25.17 | The No-break de comando is tested | M19 | v15 | the batch's | opus · high |
| 25.18 | The TC asks about its secondary, and the oil transformer's items say what they mean | M22, M21 | v15 | yes | opus · medium |
| 25.19 | One name for the insulating medium, and "A SECO" | M29, M11 | v15 | the batch's | opus · high |
| 25.20 | The criterion and the result print on each row, and the corrected columns say so | M24 | v15 | yes | opus · max |
| 25.21 | The variation note names only what matters | M31 | v15 | the batch's | opus · high |
| 25.22 | The fixed texts, the cover and the headers | M09, M10, M12, M13 | v15; the names on screen on every seed | the batch's | opus · high |
| 25.23 | The test base is updated without importing it again | M27 | company types | yes, for the index's text | opus · high |
| 25.24 | The Conferência por IA says when it is out of date, and three checks stop depending on the model | M16, M20 | every seed | yes | opus · high |

**Ledger rows the stories close** (`deferred-work.md`, by section):
- § e23e, the AT-02 row (no added continuity point): Stories 25.14 and 25.16.
- § e23x, the re-import that never updates: Story 25.23.
- § e24s, the coordinator's reading "the TC gains no item on its secondary" (B-11): Story 25.18.
- § e24c and `epic-24-context.md`, Story 24.18 narrowed in print: Story 25.20.
- § e24p, the note line's length and its wrap: Story 25.21.
- § e24x, X6 (no helper on a limit inside a range) and its test gap: Story 25.9. The test gap on three hung push attempts: Story 25.3.
- The blank ART that prints "[ART]" (M-4 of the Epic 24 proposal): Story 25.22, on v15.

**Ledger rows read and left open**, with their owner unchanged: § e24x B2 (two equipment on one reuse key), B4 (a copy that binds its base type's equipment), D4 (a top entry from before Story 24.15); § e22c (a stricter parecer that stays after the fichas clear); § e24s, the inspection's thermography title, which is fix batch e24y's.

**Batches.**

| Wave | Batch | Stories | Contract | Notes |
| --- | --- | --- | --- | --- |
| 0 | coordinator, `bmad-ux` | 25.1 | none | Part A (two frames) first, then Part B. Matheus approves each in the browser. |
| 1 | e25a | 25.2, 25.3 | none | Saving and sync. Web only. |
| 1 | e25b | 25.4 | one | Beside e25a. Then wave 1's gate, review, pass and its own deploy. |
| 2 | e25c | 25.5, 25.6, 25.7, 25.8, 25.9, 25.10 | one | The rules lane. Owns the opening of seed v15 and the v14 lock. After the Epic 24 deploy. |
| 2 | e25d | 25.11, 25.12, 25.13 | none expected | The screen lane. No seed. Beside e25c. |
| 3 | e25r | 25.14, 25.15, 25.16, 25.17 | one | The added row, then its three users. 25.17 waits for B-1 and B-2. |
| 3 | e25s | 25.18, 25.19 | one | Seed data. Beside e25r. The oil half of 25.19 waits for B-4. |
| 4 | e25p | 25.20, 25.21, 25.22 | one | Print. 25.21 waits for B-7. |
| 4 | e25t | 25.23 | one, if the index's text needs a key | The test base. Beside e25p. Waits for the new revision's file for its production run. |
| 5 | e25q | 25.24 | one | The Conferência por IA, last. |

Each wave ends with its gate on the integrated main, a two-pass integrated review and a fix batch.

**What changed from the proposed waves, and why.**
- **M18, M25 and M32 moved from the last wave to a second lane of wave 2, with M26 and M06.** None needs a seed: they are rows of the checks before generating and marks on two screens. The rules lane of wave 2 is the only one that can work on seed v15 at that point, so the second lane would stand idle.
- **M27 moved beside the print wave.** The new revision of the base must also bring the texts of the tests wave 3 adds.
- **M11 is built with M29, not with the fixed texts.** Both rename options of the same select and need the same alias. Decision 11 lists M11 too; it is built once.
- **M17 and the stored half of M01 stay in wave 1, as one story with a contract number.** The code shows that a stored verdict also acts as the technician's choice, so the story keeps the printed verdicts on the revision and does not write them over the choice (M-3).
- **The frames have two parts.** Wave 1 has two new looks (the conclusion text that reads as text, and the alert of edits that waited). They are approved first, so the wave that stops data loss does not wait for the other frames.

### 4.2 `source-deltas.md`

One row per overridden statement of section 2, dated 2026-11-11, marked "(planned, Story 25.x)". The build PRs replace "planned" with the built record.

### 4.3 PRD and SPEC

No inline edit in the planning PR. Story 25.24's build PR adds a dated line to the SPEC's emission audit. Story 25.7's adds one to the pre-issue capability.

### 4.4 Architecture

No inline edit in the planning PR and no separate `bmad-architecture` run. Two build PRs carry a dated note in the spine: Story 25.4 under AD-25 (the revision keeps the verdicts it printed), and Story 25.14 under the measurement table's decision (a sheet may hold rows of its own).

### 4.5 UX

Story 25.1 draws the frames and amends `EXPERIENCE.md` and `DESIGN.md` with dated lines. `MOCK-GUIDE.md` lists the new frames.

### 4.6 Knowledge base

`planning/epics-map.md` gains the Epic 25 entry, `planning/artifact-locator.md` this proposal, `architecture/kernel-and-seed.md` the planning note on seed v15, and `log.md` one line.

## 5. Implementation handoff

**Scope: Moderate.** A new epic and a batch plan. The coordinator runs the batches through `epic-batch-orchestrator.md`.

| Item | Owner | Done when |
| --- | --- | --- |
| The stories in `epics.md`, the `source-deltas.md` rows, `sprint-status.yaml`, `epic-25-context.md`, the KB | John (`bmad-agent-pm`), with the coordinator | The planning PR is merged |
| Story 25.1 frames, Part A then Part B | Coordinator with `bmad-ux` | Matheus approves each part in the browser at 390, 768 and 1280 px |
| The message to Bruno with B-1 to B-17 | Matheus | Sent; B-1, B-2, B-4 and B-7 answered before their stories start |
| Waves 1 to 5 | Amelia (`bmad-agent-dev`) through the batch orchestrators (`bmad-build-auto`, opus, the story's effort) | Story gate green and pasted in each PR; wave gate green; integrated review accepted |
| Paid checks (plate eval, audit prompt) | Coordinator on Matheus's AWS login | Each table recorded before the last deploy |
| Hands-on passes | QA agent in the browser | A report tracked before each deploy |
| The two deploys and the releases | Coordinator | Matheus's explicit word |

**Success criteria.**
- A value, a manufacturer and a conclusion text typed on a tablet reach the server when the technician leaves the sheet without tapping outside the field, and nobody opens the Sync screen.
- Each issued revision keeps the parecer and the pairs it printed.
- On a new relatório (seed v15): a sheet with nothing measured is not Aprovado; a text never contradicts its result; a cell can be N/A; a rise of exactly 50 % is "com restrição"; a point names every failed reading.
- A relatório with a stale conclusion text cannot be issued.
- The technician adds a point to the thermography and to the ground grid, and one row per battery to the No-break.
- The v15 document prints the criterion and the result on each row of a measured table, "(corrigido)" on the corrected columns, the corrected fixed texts and the obra's site on the cover.
- Before generating, the app warns about an overdue deadline, an instrument with no calibration data and a sheet under a removed local.
- Every relatório on v1 to v14 concludes and prints byte-identical to its goldens.

## 6. Open items

### For Bruno (through Matheus)

One message. Each line can be answered by its number. B-1, B-2, B-4 and B-7 hold a story; the others do not.

| Item | Question | Holds |
| --- | --- | --- |
| B-1 | No-break: on 2026-11-10 the tests were for a later module, and M19 asks for them now. Do they enter the sheet now? | Story 25.17 |
| B-2 | No-break: what is the pass rule of each voltage (the output on mains and on battery, the bank's float voltage, each battery's)? | Story 25.17 |
| B-3 | The band "Aplicado por você. Equipamento fora de carga." shows on a test the technician chose to apply although the app had marked it N.A. (screen attached). The replacement he sent says the technician marked the N.A., which is the opposite. What should this band say? | nothing |
| B-4 | The oil: the transformer already has NATUREZA DO LÍQUIDO (mineral, natural ester or vegetable, synthetic ester, silicone). Should TIPO DE ISOLAÇÃO split into ÓLEO MINERAL and ÓLEO VEGETAL, and then does NATUREZA DO LÍQUIDO go away? On the TP and the TC, which have no such field, is ÓLEO VEGETAL added? | the oil half of Story 25.19 |
| B-5 | The oil transformer: his five checks exist under the form's labels. Are these hints enough: "nível de óleo", "vazamentos de óleo", "sílica gel do secador", "termômetro de óleo", "relé Buchholz, quando houver", "válvula de alívio de pressão, quando houver"? | nothing |
| B-6 | A reading above the instrument's limit, on a criterion that is a range: is this helper right? "Conferir: o limite do instrumento está dentro da faixa do critério; meça com outra escala." | nothing |
| B-7 | The variation note: in numbers, which variations are relevant? Does "change of level" mean a reading that went from within to restricted or out? From how many variations does the note become one line per equipment? | Story 25.21 |
| B-8 | A point of attention: which priority should it start with for a reading out of criterion, a restricted reading, an NC item, a sheet not tested, a ficha reproved by hand? Which action when the test has no recommendation? | the second half of Story 25.10 |
| B-9 | Thermography points of the cables and the arrester, which his list does not name: keep Conexões, Terminações, Contatos and Buchas? | nothing |
| B-10 | The two empty sheets in a removed local: on which screen did he see them (the tree, the Sumário, the dialog before generating, the document)? | nothing |
| B-11 | Words of the result on each printed row: "SATISFATÓRIO", "COM RESTRIÇÃO", "INSATISFATÓRIO"? | nothing |
| B-12 | Section 2: he asks to remove the paragraph on earth resistance. A relatório with a Malha de aterramento sheet measures it. Remove it always, or print it only with that sheet? | nothing |
| B-13 | No-break, the item BATERIAS: one item with its parts in the hint, the date of the exchange among them, or one item for each part? | nothing |
| B-14 | Section 1: is this the sentence? "… nas Cabines Primárias de Proteção, Distribuição e Transformação da ⟨cliente⟩, unidade ⟨local da obra⟩." | nothing |
| B-15 | M08, which he marked done: Etapa 6 still has no text box of its own. On new relatórios section 10 names each finding and each reason for not testing. Is that enough? | nothing |
| B-16 | M04 and M15 are in production since 2026-11-10. M06: every insulation row has its own voltage since seed v12. Which relatório showed him a fixed voltage, and does an editable value in the test's header solve it? | nothing |
| B-17 | The reasons of a thermography not done: "Equipamento fora de carga", "Sem acesso seguro ao equipamento", "Sem termovisor disponível", "Outro". Any to add or drop? | nothing |

With the message go the authored sentences of fix batch e24y and of every Epic 25 batch as it is built.

### For Matheus

| Item | Decision needed | Default until he decides |
| --- | --- | --- |
| M-1 | The story list of 4.1, the waves and the batches | Nothing is built. |
| M-2 | May an NC item carry more than one point of attention? Its row still offers "Criar ponto de atenção" after a point exists (the hands-on pass of 2026-11-11, finding F4) | As today. |
| M-3 | Story 25.4 keeps the printed verdicts on the revision, beside the technician's choice. The other way is to write them over the stored pair and the stored parecer; then an issued "Não apto" holds as a choice in the next revision | On the revision. |
| M-4 | A "Salvo às hh:mm" line per field, which Bruno suggests in M02 | Not built. |
| M-5 | N/A on a reading cell: seed v15 only, or every seed (it changes nothing unless tapped) | v15 only. |
| M-6 | Should the conclusion paragraph and section 10 also name every reading out of criterion, as the point will (finding F7 of the same pass)? | The worst one, as today. |
| M-7 | A restriction chosen by hand over a clean sheet prints a recommendation with nothing indicated (finding F12). Fix it with Story 25.7? | Not built. |
| M-8 | The AI check is marked out of date and never runs by itself, because each run is a paid call | As stated. |
| M-9 | A stale conclusion text blocks issuing on every seed, older relatórios included | As stated. |
| M-10 | Two deploys: wave 1 alone, then one after the last wave. Wave 5 may go with wave 4 or after it | As stated. |

## Matheus's decisions (2026-11-11)

Matheus said "ok" to the coordinator's list. Recorded as:

1. The Epic 24 deploy is not held for any of this.
2. Epic 25 starts with saving and sync (M02, M03, M17 and the stored half of M01), alone, with its own deploy. It is data loss and needs no new seed.
3. A row the technician adds in the field is built once, as a shared capability, with its own story before the three that use it: the thermography (M23), the ground grid's continuity points (M30) and the No-break's per-battery rows (M19).
4. The No-break's tests (M19) enter seed v15. Matheus aligns with Bruno that this changed since 2026-11-10.
5. Criterion and result per row in print (M24), with the headers "20 °C (corrigido)" and "75 °C (corrigido)": seed v15 only.
6. A sheet with no measurement (M07) does not accept Aprovado and suggests "Marcar não ensaiado".
7. A stale conclusion text (M20) blocks issuing, and the suggested text names a Reprovado chosen by hand and the tests left unmeasured.
8. Instruments (M18, M25): warn before generating when the calibration date, the validity or the certificate is missing, without blocking; tick the instruments from the sheets; warn on registry rows that share a model or a certificate.
9. Oil names (M29, with M11's "A SECO"): Bruno is asked first.
10. The Conferência por IA (M16) is the last wave.
11. Fixed texts, the cover and the headers (M09, M10, M11, M12, M13): seed v15, together.

Also in scope by his word: the 50 % edge; N/A per cell and per row (M05); the header's voltage (M06); the point that names every reading (M14); the overdue deadline (M26); the test base as an update (M27); the TC's item (M22); the transformer's hints (M21); the warning on a removed local (M32); the helper of a limit inside a range. Out of scope: M04, M08, M15 and M28, which are done, and whatever fix batch e24y is doing.

## Where the sources and the decisions do not agree

- **M19 against 2026-11-10.** The day before, Bruno put the No-break's tests in a later module. He also writes that the sheet came with inspection only, while main has its full plate. Decision 4 stands on Matheus's alignment (B-1).
- **M24 against 2026-11-06.** He asked then to remove the criterion line he now wants on each row. And no table prints a result per row today, so "as in the other tables" has no model.
- **M13 against seed v13.** He asks to remove the earth-resistance paragraph because the document has no such test. Since v13 the Malha de aterramento measures it (B-12).
- **M26.** He writes that deadlines count from the visit. They count from the day the point was created.
- **M21.** Nothing is missing from the list. He did not recognise the form's own labels.
- **M32.** The code removes a local's sheets with it and hides a leftover. What he saw is not explained (B-10).
- **M33.** One of the seven sentences would reverse the meaning of its band (B-3).
- **M08.** He marks it done. The text box he first asked for does not exist (B-15).
- **M11.** Decision 9 puts it with the oil names and decision 11 with the fixed texts. It is built once, in Story 25.19.

## Checklist record

| Item | Status | Note |
| --- | --- | --- |
| 1.1 Triggering story | [x] | No story; Bruno's document of 33 items and his answers of 2026-11-11 |
| 1.2 Core problem | [x] | Two data-loss defects, and new requirements and corrections from the domain expert |
| 1.3 Evidence | [x] | The two investigations; the code read on main `76c74711`; the ledger rows |
| 2.1 Current epic | [N/A] | Epic 24 built, not deployed; nothing reopened; its deploy is not held |
| 2.2 Epic-level changes | [x] | New Epic 25 |
| 2.3 Remaining epics | [x] | No other epic is affected; Epic 24's decision 4 is reversed for v15 |
| 2.4 New or obsolete epics | [x] | Epic 25 new; automatic points stay unplanned |
| 2.5 Order and priority | [x] | Wave 0 to wave 5; saving and sync first, the AI check last |
| 3.1 PRD | [!] | Overridden by `source-deltas.md` rows; no inline PRD edit |
| 3.2 Architecture | [!] | Dated notes under AD-25 and the measurement table, in the build PRs |
| 3.3 UX | [!] | Story 25.1 frames and dated amendments |
| 3.4 Other artifacts | [x] | `sprint-status.yaml`, the KB, `epic-25-context.md`; SPEC lines in the build PRs |
| 4.1 Direct adjustment | Viable | Recommended |
| 4.2 Rollback | Not viable | Nothing built needs undoing; older relatórios keep the built rules |
| 4.3 MVP review | Not needed | Post-MVP growth within the product's scope |
| 4.4 Path | [x] | Direct adjustment, in waves |
| 5.1 to 5.5 Proposal | [x] | Sections 1 to 6 |
| 6.1 to 6.5 Final review and handoff | [!] | The decisions are Matheus's; the story list waits for his approval (M-1); B-1, B-2, B-4 and B-7 hold three stories |
