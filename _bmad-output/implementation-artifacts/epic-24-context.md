# Epic 24 Context: Bruno's answers on the product

<!-- Compiled by John (bmad-agent-pm) on 2026-11-10 from the correct-course run (sprint-change-proposal-2026-11-10.md), Matheus's decisions of 2026-11-10 and a read of the product code of main f89b787a (worktree e24-planning, dbcdb720). Edit freely. -->

## Goal

Bruno's answers of 2026-11-10 become how the product concludes a ficha, names equipment, lists its checks and compares visits.

On seed v14, for new relatórios only:
- a reading out of its criterion makes the ficha Reprovado and nothing else, an observation makes no restriction, and "Com restrições" is the technician's choice;
- section 10 names the finding;
- the TP, the TC, the transformer and the Inspeção de QGBT carry Bruno's lists, and a No-break de comando sheet exists, with no tests;
- the print shows the previous visit's date and names the drops and rises under their table.

On every seed, on screen only:
- the suggested conclusion reads as a preview;
- the automatic NC phrase follows its item, and an edited one is kept with a warning;
- the app asks before it removes a point of attention;
- a new sheet is suggested the TAG TYPE-NN;
- a company type may take a "nominal ± %" criterion, and a published copy hides its original.

Every relatório on v1 to v13 keeps its verdicts and prints byte-identical. Bruno likes the current relatório, and its layout is protected.

**Sources, gitignored, pt-BR:**
- `docs/context/epic-23/respostas-bruno-produto-2026-11-10.md`: Bruno's answers, and a table comparing each request with the code;
- `docs/context/epic-23/perguntas-bruno-2026-11-07.md`: the questions.

Cite Bruno by question number. Never copy his sentences into a tracked file, a PR body or a commit message. Item, field and prefix names that become product labels are product content.

## Stories

The text of each, with its DoR, ACs and DoD, is in `epics.md` § Epic 24. The overridden records are the eleven `source-deltas.md` rows of 2026-11-10.

| Story | Title | Dev model · Effort | Applies to | Depends on |
| --- | --- | --- | --- | --- |
| 24.1 | The Epic 24 frames in the mocks | opus · medium | n/a | none |
| 24.2 | Seed v14 opens and the v13 layout is locked | opus · high | v14 | the planning PR merged |
| 24.3 | Out of criterion gives Reprovado only; a restriction is the technician's choice; an observation gives none | opus · max | v14 | 24.1, 24.2 |
| 24.4 | Section 10 names the finding | opus · high | v14 | 24.2, 24.3 |
| 24.5 | The suggested conclusion reads as a preview | opus · medium | all | 24.1 |
| 24.6 | The NC phrase follows its item, and warns when it was edited | opus · high | all | 24.1 |
| 24.7 | An item back to Conforme: the app asks about its point | opus · high | all | 24.1, 24.6 (the same row component) |
| 24.8 | The TAG: the plate's first, else type and a two-digit number | opus · high | new sheets | 24.1 |
| 24.9 | Small screen fixes from the hands-on pass | opus · medium | all | 24.1 |
| 24.10 | TP and TC with their own checklists | opus · medium | v14 | wave 1 merged |
| 24.11 | The transformer: oil items and dry items | opus · high | v14; the read-only oil fields on every seed with an oil rule | 24.1, 24.10 |
| 24.12 | Inspeção de QGBT: retightening, function test, optional thermography | opus · medium | v14 | 24.10 |
| 24.13 | A new type: No-break de comando, with no tests | opus · high | v14 | 24.1, 24.8 (the prefix NB), 24.10 |
| 24.14 | Two small sheet fixes: the oil sampling's "Outro" and the ground grid's plate block | opus · medium | v14 | 24.1, 24.10 |
| 24.15 | The previous visit's date in the table header | opus · high | the date kept on every seed; the header on v14 | 24.1, wave 1 merged |
| 24.16 | Drops and rises as a note line under the table | opus · high | v14 | 24.1, 24.15 |
| 24.17 | The test's recommendation fills "Ação recomendada" | opus · medium | v14 | 24.1, wave 1 merged |
| 24.18 | A "nominal ± %" criterion on company types | opus · high | company types | 24.1 |
| 24.19 | A copied type hides its original in the field | opus · medium | company types, every seed | 24.1 |
| 24.20 | A company type that cannot compute its ratio is not published | opus · medium | company types | none |

## Decisions (Matheus, 2026-11-10)

1. A Reprovado ficha prints both restriction boxes empty. "Com restrições" exists only with Aprovado.
2. When an item goes back to Conforme, the app asks whether to remove the point of attention.
3. A ficha already concluded keeps its stored pair.
4. Three waves: the rules, then the seed beside the print and company types. The No-break's tests stay out.
5. The new conclusion rules apply to new relatórios only (seed v14). Screen-only behaviour applies to all. Older relatórios print byte-identical.
6. The previous visit's date is the service date, stored at issue from now on. Older visits fall back to the issue date.
7. Drops and rises print as a note line under the table. The table itself does not change.
8. The story list and the batches are approved.
9. The four low findings of the pass (F10, F15, F18, F20) are fixed in this epic, and the ledger was swept for rows that fit.
10. The stories are written with John and built by Amelia.

Folded in the same day from the open Epic 23 rows: the arrester's hidden prerequisite (24.3), the cable's fake plate fixture (24.13), the publish issue for a company type with no vector-group field (24.20), and the read-only oil fields on a dry unit (24.11).

## Facts the batches share

Verified on 2026-11-10 in worktree `e24-planning` (`dbcdb720`, product code of main `f89b787a`). Paths are under `packages/domain/src/` unless they name another package.

- **Current versions.**
  - `SEED_VERSION = 'v13'` (`seed/definitions.ts:64`); `SEED_VERSIONS` holds v1 to v13 (`:128`).
  - `V13_HASH` is `ff1737055c046a1f8a3fb9099bae3306b338b8af50be5502b347837602bd30ff` (`seed/seed.test.ts:2155`). Seed v13 is deployed and frozen.
  - `CONTRACT_VERSION = 40` (`contract/version.ts:469`) and `MIN_CONTRACT_VERSION = 40` (`:738`).
- **The seed v14 gate.**
  - A verdict or a printed page changes on v14 only. The change is reached through a key of the v14 seed, never through a version number.
  - Story 24.2 adds one optional seed-level key, `rules`, to `reportSeedSchema` (`seed/schema.ts:999`). It is absent on v1 to v13, as `recurring_findings` and `site_checklist` are absent on the seeds before them, so every shipped hash holds.
  - A flag is read through `findSeed(seed_version)`. A block's `seed_version` is its relatório's, for a company block too (`relatorio/instantiate.ts:173-178`, `relatorio/tree.ts:888-898`). The parecer and sections 8 and 10 read the relatório's.
  - Proposed flags (the batch may rename them in its spec; the mechanism is fixed):

    | Flag | Story | What it turns on |
    | --- | --- | --- |
    | `conclusion_restriction_by_choice` | 24.3 | Reprovado with no restriction; the observation floors nothing |
    | `prerequisite_needs_nameplate` | 24.3 | the arrester's prerequisite read only with the nameplate block on |
    | `parecer_names_finding` | 24.4 | section 10's Reprovado sentence with the findings |
    | `nc_clause_on_one_line` | 24.4 | an NC observation's lines joined in the conclusion |
    | `results_reference_across_runs` | 24.4 | "nos itens 8 e 9" replaced across formatted runs |
    | `previous_visit_date` | 24.15 | the dated MANUT. ANTERIOR header and history texts |
    | `history_note` | 24.16 | the note line under a table |
    | `recommendation_as_action` | 24.17 | the recommendation in "Ação recomendada"; rows kept whole; spaced photo references |

  - The existing version-number gates stay as they are: `RISE_FROM_SEED` (`relatorio/restriction.ts:189`), `isLegacySeed` (`relatorio/reading-evaluation.ts:192-196`), `MANUFACTURER_CHECK_FROM` (`ops/apply.ts:511-532`).
  - A company type is not tied to a seed: `findDefinitionIn` ignores the seed for a `type:` key (`seed/definitions.ts:383-389`). Its sheets follow the flags of the relatório they sit in.
- **How v13 was opened** (the model for v14): commit `027d916c` created `seed/v13.ts` equal to v12, set `SEED_VERSION`, added the bundle to `SEED_VERSIONS`, pinned `V12_HASH` and `V13_HASH`, and took the layout lock. Each later batch added a fenced section to `v13.ts` and a strip helper to `seed.test.ts` (`withoutE23b` and its siblings), and re-pinned `V13_HASH`.
- **Tests that pin the current seed** and must move with it: `merge/conflicts.test.ts:159`, `relatorio/section-position.test.ts:115`, `templates/from-relatorio.test.ts` (~278-286). Tests that name v13: `reading/build.test.ts:86`, `seed/template.test.ts:50,58,85`, and the `layoutLockSnapshot('v13')` callers.
- **A test that asserts a v13 verdict or print is pinned to v13**, by an addition (`newRelatorioDrafts(account, { seedVersion: 'v13' })`, `e2e/support/relatorio-seed.ts:144`). It is not rewritten to v14.
- **The layout lock.**
  - Fixture: `packages/domain/fixtures/layout-lock/op-log.ts` (`LAYOUT_LOCK_VERSIONS` `:40`, `layoutLockFixture` `:165`, `layoutLockSnapshot` `:211`). It builds through `instantiateTemplate`.
  - Goldens: `apps/api/src/jobs/generate/golden/layout-lock-{v5,v11,v12}/`. Tests: `docx-layout-lock.test.ts`, `layout-lock.integration.test.ts`. Regeneration needs `GOLDEN_UPDATE=1`.
  - Porto Seguro: `golden/porto-seguro-skeleton.json`, `packages/domain/fixtures/porto-seguro/*.golden.json`.
  - The lock fixture holds no `last_results`. Story 24.2's v13 fixture adds a second visit.
  - A batch that needs to regenerate a v5, v11, v12 or (after 24.2) v13 golden stops and asks the coordinator. That is a defect against the protection.
- **Conclusion** (`relatorio/conclusion.ts`): `computeFloor` (`:162-203`), `anyObservation` (`:111-116`), `effectiveConclusionPair` (`:228`), `chosenConclusionPair` (`:247`), `printedConclusionPair` (`:263`), `conclusionAdjusted` (`:272`), `isLooserThanFloor` (`:281`), `conclusionFloorReasonText` (`:309`), `conclusionSuggestion` (`:324`), `observationRequired` (`:355`), `ncClauseText` (`:394`), `composeConclusion` (`:536`), `conclusionPairComplete` (`:711`), `conclusionAdjustWrites` (`:747`).
  - Progress: `relatorio/sheet-progress.ts` `conclusaoMissing` (`:228-240`).
  - The screen: `apps/web/src/surfaces/ficha/conclusao-section.tsx`; "Concluir ficha" in `use-ficha-actions.ts:146-200`; "Marcar Com restrições" in `measurement-field.tsx:297` and `measurement-test-section.tsx:563`.
  - Print: `print/section-9.ts` `CONCLUSION_BOXES` (`:219-224`), `conclusionParts` (`:1333-1347`).
- **Prerequisite:** `relatorio/restriction.ts` `failedPrerequisites`, read by the floor, the points, the conclusion text and the parecer.
- **Parecer and section 10:** `relatorio/parecer.ts` (`derivedParecer`, `parecerCounts`, `reprovadoSentence`, `composeParecer`, its basis), `print/section-10.ts` (`section10Layout`, `FIXED_RESULTS_REFERENCE`, `validityLine`).
- **Points:** `points/derived.ts` (`derivedPoints` `:372`, `resolvedOriginPoints` `:390`, `derivedPointSeed` `:559`), `points/summary.ts` (`pointsSummaryText` `:126`, `pointsHeadingText` `:152`), `points/checks.ts` (`ncRowPointPositions` `:186`), `relatorio/ops.ts` `removePointOp` (`:59`). The screen: `apps/web/src/surfaces/points/points-surface.tsx`.
  - **Both wave 1 batches edit `points/derived.ts`**: e24a for the prerequisite and the v14 pair, e24b for the question and the heading. e24b merges second and merges main first.
- **NC phrase:** `relatorio/ficha.ts` `clearsNcObservation` (`:223`), `insertPhrase` (`:233`), `recentChecklistObservations` (`:192`); `registry/nc-phrase-row.ts` `ncChipPhrases` (`:39`), `typedPieces` (`:124`); the row in `apps/web/src/surfaces/ficha/checklist-section.tsx` (`ChecklistRow`, shared by a sheet and a local).
- **TAG:** `relatorio/tag.ts` (`TAG_PREFIX` `:13`, `suggestTag` `:98`). Callers: `relatorio/instantiate.ts:337,346`, `relatorio/tree.ts:699,828`, `relatorio/move.ts:68`, `relatorio/panel.ts:238`, `apps/web/src/surfaces/relatorio/tree-actions.ts:333`, `block-palette-field.tsx:277`.
  - **The TAG reuse constraint.** `instantiateTemplate` binds a template position to the obra's live equipment whose TAG equals the TAG suggested for that position, same type (`instantiate.ts:337-338`). Story 24.8 keeps the old rule as a frozen function, matches by the old TAG first and the new one second, and its tests cover an obra whose equipment carries the old TAGs.
  - The layout-lock, Porto Seguro and replay fixtures and `e2e/support/relatorio-seed.ts` get their TAGs from `suggestTag`. They pass the old rule, so no golden moves.
  - A renamed TAG is not found by the reuse today (ledger row at line 647). Story 24.8 does not change that.
- **Checklists** (as resolved on v13):
  - TP and TC: seven items each, the same list (`seed/v10.ts:39-50`, `seed/v12.ts:143`). No item names an open secondary or short-circuit terminals.
  - Transformador de força: 14 items, seven of them oil items (`seed/v1.ts:256-320`, `seed/v9.ts:27-54`). No dry-only item. `oil_rule` keys: `field`, `oil_values`, `items`, `fields`, `full_values`, `dry_fields` (`seed/schema.ts:487-512`); helpers in `relatorio/oil-rule.ts`.
  - Inspeção de QGBT: ten items, no test (`seed/v12.ts:170-202`). The Quadro's REAPERTO GERAL is `reaperto_geral` (`seed/v6.ts:132`).
  - Item keys, sub-block keys and equipment types are closed enums: `ITEM_KEYS`, `SUB_BLOCK_KEYS`, `EQUIPMENT_BLOCK_TYPES` (`schemas/block-config.ts:163`, `:125`, `:39`). Appending needs a contract.
  - An item's NC phrases are three or four (`seed/schema.ts:106`). Every seeded phrase must be in `docs/nc-chip-phrases.md` (`scripts/nc-chip-phrases.test.ts`).
- **Tests on v13 the stories reuse:** `coleta_oleo` (`seed/v13.ts:374-418`), `TERMOGRAFIA` (`:600-657`, on the eight types only, `:725`), `MALHA_ATERRAMENTO` (`:660-716`). Measurement value kinds are number and choice only (`seed/measurement.ts:31`).
- **A new closed-enum type** touches: `EQUIPMENT_BLOCK_TYPES`, `TAG_PREFIX`, `NOUNS` (`relatorio/conclusion.ts:362-378`), `print/group-for-print.ts`, `photos/caption.ts`, `types/duplicate.ts`, `templates/text.ts`, `copy.composer.equipmentNames` (`apps/web/src/copy/pt-br.ts:543-560`). The palette is data-driven (`relatorio/tree.ts:792`).
- **Plate reading:** `apps/api/src/jobs/reading/providers/bedrock.ts` (prompt `bedrock-structuring-8`), `jobs/reading/kinds/plate.ts` `fakeDefaults`, `jobs/reading/fixtures/README.md`, `apps/api/src/scripts/make-plate-fixtures.ts`. The eval is `apps/api/src/scripts/bedrock-eval.ts`.
- **A fixture named like the new type.** `packages/domain/fixtures/company-types/op-log.ts` holds a company type "No-break de comando". The v5, v11 and v12 layout-lock goldens print it, so it is not renamed.
- **Previous visit:** `print/last-results.ts` (`lastResults` `:113`, `previousHelperText` `:162`), `print/reading-slots.ts` `previousResultsFor` (`:100`), the entry's schema in `schemas/entities.ts:351-378`, the issue job `apps/api/src/jobs/generate/job.ts` `commitRevision` (`:465`). The entry keeps the issue instant only.
  - Print: `print/section-9.ts` `PREVIOUS_HEADER` (`:1086`), `withPreviousColumn` (`:1097`), the note parts of a test (`:1174-1178`), the fit rule (`READING_FIT_WIDTH_EM` `:813`, the type steps `:821-834`).
  - The three history rules: `seed/v13.ts:233` (insulation drop), `:238-242` (contact rise), `:370` (winding variation).
- **Section 8:** `print/section-8.ts` (`ACTION_PLAN_COLUMNS` `:52`, the derived row `:256-259`, the photo tokens `:85-161`), `seed/test-help.ts` `recommendedPointText` (`:128`), the api renderer `apps/api/src/jobs/generate/sections/section-8.ts` (only the header row is kept whole, `:38-40`).
- **Company types:** `types/definition.ts` (`COMPANY_CRITERION_OPERATORS` `:52`, `companyCriterionSchema` `:77`, `criterionRulesFor` `:203`), `types/draft-edit.ts` (`updateDraftField` `:104`, `removeDraftEntryRefusal` `:206`, `CRITERION_RULE_WORDS` `:630`), `types/validate.ts` (`validateTypeDraft` `:282`), `types/duplicate.ts` (`base_block_type` `:115`), `seed/criteria.ts` `formatCriterionValue` (`:122`), `relatorio/vector-group.ts` (`VECTOR_GROUP_FIELD` `:280`, `isVectorGroupField` `:290`).
  - Palettes: `relatorio/tree.ts` `paletteTypeGroups` (`:792`), `seed/definitions.ts` `offeredTypes` (`:431`); `apps/web/src/surfaces/templates/block-palette.tsx`, `apps/web/src/surfaces/relatorio/block-palette-field.tsx`.
  - The editor: `apps/web/src/surfaces/templates/type-editor.tsx` and `type-editor-parts.tsx` (`CriteriaPanel` `:799`). It is an office tool: on a phone it must only not break.
- **Shared dialog:** `apps/web/src/components/confirm-dialog.tsx` (two buttons, the cancel focused first).
- **Copy:** `apps/web/src/copy/pt-br.ts` (`ficha.conclusao` `:1681-1700`, `ficha.nameplate` `:1488-1511`, `points` `:1324-1357`, `typeEditor` `:612-690`), `apps/web/src/copy/ui.ts` (`suggestionField` `:117-123`).
- **Tap budgets:** the four journey specs are pinned to v12 by `seedVersion: 'v12'`. The v13 numbers Matheus accepted are J1 11 taps and SM-3 22 taps (`deferred-work.md` row 3262).
- **Test data.** The test company is Empresa A, `a@teste.local`. `LLM_PROVIDER` and `OCR_PROVIDER` stay `fake`. Fixtures are synthetic.

## Coordinator's readings (open to Matheus)

Each is written under its story in `epics.md`.

- **24.1.** The printed frame and the small controls are added to the proposal's frame list.
- **24.3.** An NC row and a restricted reading keep flooring Aprovado · Com restrições on v14. The technician's justification is OBSERVAÇÕES. The observation is required under any Reprovado on v14. Row 3344 applies on v14 only.
- **24.6.** Several tapped chips count as automatic. The warning is a line on the row, not a dialog.
- **24.7.** The question is asked for N.A. as for Conforme. A point resolved by a reading or a verdict gets a remove action on its card, not a question while typing.
- **24.8.** "The plate's TAG first" is the technician's typing, prompted by the helper. Only SEC becomes SC. A renamed TAG is still not found by the next relatório of the obra.
- **24.9.** With unreadable templates and none readable, "Criar template padrão" stays hidden.
- **24.10.** The TC gains no item on its secondary (B-11). The TP's fuse wording is a hint.
- **24.11.** Forced ventilation is item 5, renamed and made a dry item. The new items are appended. Nothing is printed about the laboratory's report.
- **24.12.** The function test is one item with a hint. The thermography keeps its four points.
- **24.13.** Six checklist items. "Potência (VA/W)" is two fields. The battery fields carry "BATERIAS:" in their labels.
- **24.14.** The "Outro" text is required while it shows. The grid's block is "Dados da malha".
- **24.15.** The service date kept is `service_end`, else `service_start`.
- **24.16.** "Relevant" is what the three v13 rules flag.
- **24.18.** The nominal is typed in the criterion. Both ends are within.
- **24.19.** The original is hidden in the composer's palette too. The copy takes the original's place.

## Where the code changed a story

- **24.6** carries contract 42 in the proposal. The code shows no fold change in it. The number stays reserved for batch e24b.
- **24.11** was planned with two more oil items. The second, the oil sampling, already exists as the v13 test `coleta_oleo`. The story adds one oil item and keeps the test.
- **24.16** was offered row 3191, which is in `print/section-8.ts`. Story 24.17 edits that file in the same batch and takes the row, on v14 only.
- **24.8** found that the fixtures and the goldens also take their TAGs from the suggestion. They pass the old rule.
- **24.20** found that the editor cannot recreate the vector-group field (a new field gets a new key). The issue's sentence names the two ways out the editor has.

## Open items

- **Bruno: B-1 to B-10** (`sprint-change-proposal-2026-11-10.md` § 6), sent in one message after the epic is built. None blocks a story.
- **B-11, raised while writing the stories:** should the TC's list ask an item on its secondary (never open, the short-circuit terminals)? The product has none today (Story 24.10).
- **Authored sentences.** Every story lists its authored pt-BR sentences in its PR. They go to Bruno with B-7.
- **Matheus: M-2** ("Agrupar por tipo" stays off on a new local) and **M-4** (the blank ART prints "[ART]") keep their defaults. **M-3:** the AD-25 note is written in Story 24.15's PR.
- **Matheus: the readings above**, chiefly the renamed TAG (24.8) and the composer's palette (24.19).

## Batch plan

There are at most two batch stacks up at a time (the 2026-10-08 load rules). Each batch runs `bmad-build-auto` in its own worktree, following `epic-batch-orchestrator.md`. The coordinator hands out a free port base before each launch (`podman ps --filter name=fasor-`).

| Wave | Tag | Branch | Stories | Dev model · Effort | Contract (reserved) | Base |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | coordinator | `docs/e24-frames` | 24.1 | opus · medium (`bmad-ux`) | none | main after the planning PR |
| 1 | e24a | `e24a-conclusion-rules` | 24.2, 24.3, 24.4 | opus · high, max, high | 41 | main after 24.1 is approved |
| 1 | e24b | `e24b-screen-lane` | 24.5, 24.6, 24.7, 24.8, 24.9 | opus · medium, high, high, high, medium | 42 | main after 24.1 is approved |
| 2 | e24s | `e24s-seed-v14-sheets` | 24.10, 24.11, 24.12, 24.13, 24.14 | opus · medium, high, medium, high, medium | 43 | main after wave 1's gate and fix batch |
| 3 | e24p | `e24p-print-company-types` | 24.15, 24.16, 24.17, 24.18, 24.19, 24.20 | opus · high, high, medium, high, medium, medium | 44 | main after wave 1's gate and fix batch, beside e24s |

### Merge order

1. The planning PR, then Story 24.1's frames.
2. e24a, then e24b. e24b merges main first: both edit `points/derived.ts`.
3. Wave 1's gate, its two-pass review and its fix batch.
4. e24s, then e24p. e24p merges main first and re-pins `V14_HASH`.
5. The gate of waves 2 and 3, its review and its fix batch.
6. The paid plate eval, the hands-on pass, then the deploy on Matheus's word.

### Coordinator decisions

- **Seed v14.**
  - e24a creates `seed/v14.ts`, derived from v13 with `V13_HASH` pinned as shipped. Its first commit holds only v14 = v13, the `rules` key and the v13 layout lock.
  - Every later batch adds to v14 in place, in its own fenced section, with its strip helper in `seed.test.ts`. This is safe because v14 is not deployed until the epic's single deploy. `V14_HASH` is re-pinned by each batch, and the PR that merges second re-pins it on the merged main.
  - e24b adds nothing to the seed.
- **Contracts.**
  - Numbers are reserved in merge order: e24a 41, e24b 42, e24s 43, e24p 44.
  - A batch whose spec finds no fold change takes no number, and the coordinator renumbers the unlaunched batches down. Planning found none in e24b.
  - `MIN_CONTRACT_VERSION` follows each bump unless a PR shows a reason not to. Each bump has an api integration test through the sync route.
- **Shared files and expected conflicts.**
  - `points/derived.ts`: e24a and e24b (wave 1). e24b merges second.
  - `relatorio/conclusion.ts`: e24a (the v14 rule, the NC clause) and e24b (the preview's kernel answer, "Critérios usados"). e24b merges second.
  - `apps/web/src/surfaces/ficha/conclusao-section.tsx`: e24a (no restriction under Reprovado) and e24b (the preview state).
  - `apps/web/src/surfaces/ficha/checklist-section.tsx`: Stories 24.6 and 24.7, both in e24b, in that order.
  - `seed/v14.ts`, `seed/seed.test.ts`, `seed/schema.ts`: e24a, then e24s and e24p side by side. The second PR of the pair takes the other's keys whole and re-pins.
  - `schemas/block-config.ts`: e24s appends item keys and the type.
  - `print/section-9.ts`: e24a (the boxes), e24s (the reason line, the new sheets), e24p (the header and the note line).
  - `print/section-8.ts`: e24p only (Story 24.17).
  - `relatorio/tag.ts`: e24b (the rule), then e24s (the prefix NB).
  - `relatorio/tree.ts` `paletteTypeGroups`: e24s (the new type is data) and e24p (the hidden original).
  - `types/definition.ts`, `types/validate.ts`: e24s (`dry_items`, the text value, the two definition keys) and e24p (the operator, the publish issue).
  - `apps/api/src/jobs/reading/providers/bedrock.ts`: e24s only, one prompt version.
  - `contract/version.ts`: each batch appends its paragraph.
  - `deferred-work.md`: each batch writes under its own heading.
  - `copy/pt-br.ts`: different keys per batch.
- **The tap budgets** (row 3262) get their v14 run in e24s, in Story 24.10.
- **Paid eval.** The prompt change of Story 24.13 runs `bedrock-eval.ts` on Matheus's AWS login before the deploy (E21-A4).
- **Bruno's v5 relatório.** After the deploy, a read-only preview checks that his revisão on v5 prints as before.

## Gates

- **Each batch** runs the story gate: lint, static, test:unit, test:api and its touched specs.
  - Touched specs include every spec that asserts seed counts, the item, sub-block or type lists, the conclusion row, a suggested TAG, the palette's list, section 8 or section 10 (`grep -rln` over `e2e/`; E14-A3, E15-A3).
  - A batch that changes the op fold, the commit path or a live query on the ficha also runs its touched durability specs on the matrix projects.
- **Cross-batch merge rule** before the second PR of a wave merges (orchestrator § 6).
- **After each wave.**
  - First `podman compose restart api web`.
  - Then one integrated gate on main: `pnpm test:e2e`, `test:e2e:full` and the matrix, with the host load line.
  - Then the two-pass integrated review, then one fix batch if needed.
- **Before the deploy.**
  - The paid plate eval, its table recorded.
  - The hands-on pass in the browser on the integrated main, on a v14 relatório and on a v13 one, its report tracked under `_bmad-output/test-artifacts/manual/`.
  - The "before the deploy" rows of `deferred-work.md`.
- **Deploy.** Once, on Matheus's word. Seed v14 freezes there.
