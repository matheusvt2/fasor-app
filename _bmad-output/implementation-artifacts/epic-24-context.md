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
- *(2026-11-10, evening)* a point of attention exists only when the technician creates it (fix batch e24h, first and alone), and a failed test offers the create action (Story 24.17);
- *(2026-11-10, evening)* an equipment keeps its history when its TAG is renamed (Story 24.21);
- a new sheet is suggested the TAG TYPE-NN;
- a company type may take a "nominal ± %" criterion, and a published copy hides its original.

Every relatório on v1 to v13 keeps its verdicts and prints byte-identical. Bruno likes the current relatório, and its layout is protected.

**Sources, gitignored, pt-BR:**
- `docs/context/epic-23/respostas-bruno-produto-2026-11-10.md`: Bruno's answers, and a table comparing each request with the code;
- `docs/context/epic-23/perguntas-bruno-2026-11-07.md`: the questions.

Cite Bruno by question number. Never copy his sentences into a tracked file, a PR body or a commit message. Item, field and prefix names that become product labels are product content.

## Stories

The text of each, with its DoR, ACs and DoD, is in `epics.md` § Epic 24. The overridden records are the eleven `source-deltas.md` rows of 2026-11-10. *(2026-11-10, evening: and two more rows of the same date, on automatic points and on the reuse key.)*

| Story | Title | Dev model · Effort | Applies to | Depends on |
| --- | --- | --- | --- | --- |
| 24.1 | The Epic 24 frames in the mocks | opus · medium | n/a | none |
| 24.2 | Seed v14 opens and the v13 layout is locked | opus · high | v14 | the planning PR merged *(2026-11-10, evening: and fix batches e24h and e24f merged)* |
| 24.3 | Out of criterion gives Reprovado only; a restriction is the technician's choice; an observation gives none | opus · max | v14 | 24.1, 24.2 |
| 24.4 | Section 10 names the finding | opus · high | v14 | 24.2, 24.3 |
| 24.5 | The suggested conclusion reads as a preview | opus · medium | all | 24.1 |
| 24.6 | The NC phrase follows its item, and warns when it was edited | opus · high | all | 24.1 |
| 24.7 | An item back to Conforme: the app asks about its point | opus · high | all *(2026-11-10, evening: stored points only)* | 24.1, 24.6 (the same row component) *(2026-11-10, evening: and fix batch e24h merged)* |
| 24.8 | The TAG: the plate's first, else type and a two-digit number | opus · high | new sheets | 24.1 |
| 24.9 | Small screen fixes from the hands-on pass | opus · medium | all | 24.1 |
| 24.10 | TP and TC with their own checklists | opus · medium | v14 | wave 1 merged |
| 24.11 | The transformer: oil items and dry items | opus · high | v14; the read-only oil fields on every seed with an oil rule | 24.1, 24.10 |
| 24.12 | Inspeção de QGBT: retightening, function test, optional thermography | opus · medium | v14 | 24.10 |
| 24.13 | A new type: No-break de comando, with no tests | opus · high | v14 | 24.1, 24.8 (the prefix NB), 24.10 |
| 24.14 | Two small sheet fixes: the oil sampling's "Outro" and the ground grid's plate block | opus · medium | v14 | 24.1, 24.10 |
| 24.15 | The previous visit's date in the table header | opus · high | the date kept on every seed; the header on v14 | 24.1, wave 1 merged |
| 24.16 | Drops and rises as a note line under the table | opus · high | v14 | 24.1, 24.15 |
| 24.17 | The test's recommendation fills "Ação recomendada" | opus · ~~medium~~ high *(2026-11-10, evening)* | ~~v14~~ *(2026-11-10, evening)* the create action on every seed; the recommendation in the action, the whole row and the photo references on v14 | 24.1, wave 1 merged *(2026-11-10, evening: and fix batch e24h merged)* |
| 24.18 | A "nominal ± %" criterion on company types | opus · high | company types | 24.1 |
| 24.19 | A copied type hides its original in the field | opus · medium | company types, every seed | 24.1 |
| 24.20 | A company type that cannot compute its ratio is not published | opus · medium | company types | none |
| 24.21 | An equipment keeps its history when its TAG is renamed *(2026-11-10, evening, Matheus on M-5; batch e24b, after 24.8)* | opus · high | every equipment created from now on, on any seed | 24.8 |

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
11. *(2026-11-10, evening.)* One more story, 24.21: an equipment keeps its history when its TAG is renamed (M-5 of the proposal). The equipment stores, at its creation, the key the reuse matches on. Equipment created before the story keeps matching by its TAG.
12. *(2026-11-10, evening; Bruno through Matheus, in chat, urgent.)* No point of attention is automatic. A point exists only when the technician creates it. All five automatic kinds stop (`not_tested`, `nc`, `reading`, `reprovado`, `restricao`), for every relatório on every seed. It is built now as fix batch e24h and deployed alone, before the rest of the epic. How automatic points should work is thought through later and is not built. It overrides Bruno's earlier answer to question 28.

Folded in the same day from the open Epic 23 rows: the arrester's hidden prerequisite (24.3), the cable's fake plate fixture (24.13), the publish issue for a company type with no vector-group field (24.20), and the read-only oil fields on a dry unit (24.11).

## Facts the batches share

Verified on 2026-11-10 in worktree `e24-planning` (`dbcdb720`, product code of main `f89b787a`). Paths are under `packages/domain/src/` unless they name another package.

- **Current versions.**
  - `SEED_VERSION = 'v13'` (`seed/definitions.ts:64`); `SEED_VERSIONS` holds v1 to v13 (`:128`).
  - `V13_HASH` is `ff1737055c046a1f8a3fb9099bae3306b338b8af50be5502b347837602bd30ff` (`seed/seed.test.ts:2155`). Seed v13 is deployed and frozen.
  - `CONTRACT_VERSION = 40` (`contract/version.ts:469`) and `MIN_CONTRACT_VERSION = 40` (`:738`). *(2026-11-10, evening: 41 and 41 once fix batch e24h merges, before any story batch starts.)*
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
    | `recommendation_as_action` | 24.17 | the recommendation in "Ação recomendada" *(2026-11-10, evening: of a point the technician creates from a test)*; rows kept whole; spaced photo references |

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
  - *(2026-11-10, evening.)* **These lines are those of main `72ed1f51`, before fix batch e24h.** e24h removes the list of automatic entries and what only that list read (by its spec: `derivedPoints`, `derivedPointSeed`, the grouping, the "Possível duplicado" pairs, the "automático" part of the two summary texts). It keeps the findings inside the kernel for the parecer and for `resolvedOriginPoints`. Every batch reads this file again on the main it starts from.
  - *(2026-11-10, evening.)* **Where a point can be created by a tap today:** an NC row of a sheet and of a local (`apps/web/src/surfaces/ficha/checklist-section.tsx:560`, shared `ChecklistRow`), the band of a sheet marked Não ensaiado (`not-tested-band.tsx:65`), and "Adicionar" on the Pontos screen. **Nowhere on a reading.** Story 24.17 adds that.
  - **Both wave 1 batches edit `points/derived.ts`**: e24a for the prerequisite and the v14 pair, e24b for the question ~~and the heading~~ *(2026-11-10, evening: the heading is e24h's)*. e24b merges second and merges main first. *(2026-11-10, evening: fix batch e24h edits the file first, and batch e24p edits it last, for Story 24.17's create action.)*
- **NC phrase:** `relatorio/ficha.ts` `clearsNcObservation` (`:223`), `insertPhrase` (`:233`), `recentChecklistObservations` (`:192`); `registry/nc-phrase-row.ts` `ncChipPhrases` (`:39`), `typedPieces` (`:124`); the row in `apps/web/src/surfaces/ficha/checklist-section.tsx` (`ChecklistRow`, shared by a sheet and a local).
- **TAG:** `relatorio/tag.ts` (`TAG_PREFIX` `:13`, `suggestTag` `:98`). Callers: `relatorio/instantiate.ts:337,346`, `relatorio/tree.ts:699,828`, `relatorio/move.ts:68`, `relatorio/panel.ts:238`, `apps/web/src/surfaces/relatorio/tree-actions.ts:333`, `block-palette-field.tsx:277`.
  - **The TAG reuse constraint.** `instantiateTemplate` binds a template position to the obra's live equipment whose TAG equals the TAG suggested for that position, same type (`instantiate.ts:337-338`). Story 24.8 keeps the old rule as a frozen function, matches by the old TAG first and the new one second, and its tests cover an obra whose equipment carries the old TAGs. *(2026-11-10, evening: Story 24.21, next in the batch, moves the match to a stored key and retires the second candidate. The batch may build the match once, in 24.21's form.)*
  - The layout-lock, Porto Seguro and replay fixtures and `e2e/support/relatorio-seed.ts` get their TAGs from `suggestTag`. They pass the old rule, so no golden moves.
  - A renamed TAG is not found by the reuse today (ledger row at line 647). Story 24.8 does not change that. *(2026-11-10, evening: Story 24.21 does, for equipment created from then on.)*
  - *(2026-11-10, evening.)* **The reuse key (Story 24.21).**
    - The equipment row (`schemas/entities.ts:381-390`) gains one optional, write-once key. Its value is the TAG the frozen old rule gives the placement: prefix, local code, place.
    - Equipment is created in two places, and both write it: `instantiateTemplate` (`instantiate.ts:345-350`) and `newEquipmentBlock` (`relatorio/tree.ts:879`; the palette, "Duplicar" and "Fotografar equipamento" through `createPair`, `apps/web/src/surfaces/relatorio/tree-actions.ts:310-350`).
    - The match, per placement: a stored key first; then, for a row with no key, its TAG (today's match); else a new equipment.
    - A template block has no id, and "Salvar como template" gives each node a new ref (`templates/from-relatorio.ts`). So the key cannot be a reference to the template.
    - A device can put only `tag` and `removed_at` on an equipment (`EQUIPMENT_FIELDS`, `ops/path.ts:49`). The key gets no put path.
    - The Porto Seguro snapshot golden holds equipment rows. Fixtures pass the old TAG rule, and under it no key is written, so no golden moves.
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
- **24.8.** "The plate's TAG first" is the technician's typing, prompted by the helper. Only SEC becomes SC. ~~A renamed TAG is still not found by the next relatório of the obra.~~ *(2026-11-10, evening, Matheus: decided; Story 24.21.)*
- **24.9.** With unreadable templates and none readable, "Criar template padrão" stays hidden.
- **24.10.** The TC gains no item on its secondary (B-11). The TP's fuse wording is a hint.
- **24.11.** Forced ventilation is item 5, renamed and made a dry item. The new items are appended. Nothing is printed about the laboratory's report.
- **24.12.** The function test is one item with a hint. The thermography keeps its four points.
- **24.13.** Six checklist items. "Potência (VA/W)" is two fields. The battery fields carry "BATERIAS:" in their labels.
- **24.14.** The "Outro" text is required while it shows. The grid's block is "Dados da malha".
- **24.15.** The service date kept is `service_end`, else `service_start`.
- **24.16.** "Relevant" is what the three v13 rules flag.
- **24.17** *(2026-11-10, evening)*. A test that fails, a reading in its restriction band and a ficha the technician reproved offer "Criar ponto de atenção". Nobody decided this action; without it a failed test reaches section 8 only by a point typed by hand. One action per test. A restricted reading's point starts with no recommendation. The action exists on every seed. The story stays in wave 3, so a failed reading has no create action between the deploy of e24h and the deploy of the epic.
- **24.18.** The nominal is typed in the criterion. Both ends are within.
- **24.19.** The original is hidden in the composer's palette too. The copy takes the original's place.
- **24.21** *(2026-11-10, evening)*.
  - The key is the old rule's TAG of the placement, not a reference to the template's block.
  - An equipment from before the story gets no key, not even when a new relatório binds it. Renaming it later still loses its history. This covers every obra that exists today, and it is the next decision if those obras matter.
  - Story 24.8's second candidate is retired, so nothing is bound on a guess.
  - With two equipment on one key, the oldest binds, and nothing reports the other.
  - An equipment added from the palette gets a key too.
  - The key cannot be seen or corrected by hand.

## Where the code changed a story

- **24.6** carries contract 42 in the proposal. The code shows no fold change in it. The number stays reserved for batch e24b. *(2026-11-10, evening: the batch's number is 43, and Story 24.21 takes it.)*
- **24.11** was planned with two more oil items. The second, the oil sampling, already exists as the v13 test `coleta_oleo`. The story adds one oil item and keeps the test.
- **24.16** was offered row 3191, which is in `print/section-8.ts`. Story 24.17 edits that file in the same batch and takes the row, on v14 only.
- **24.8** found that the fixtures and the goldens also take their TAGs from the suggestion. They pass the old rule.
- **24.20** found that the editor cannot recreate the vector-group field (a new field gets a new key). The issue's sentence names the two ways out the editor has.
- *(2026-11-10, evening)* **24.17** found that no reading has a create action. After fix batch e24h the only way a failed test reached a stored point ("Editar" on its automatic entry) is gone. The story now builds the action, and its effort is high.
- *(2026-11-10, evening)* **24.21** found that a template block has no id and that "Salvar como template" renames every node. So the key is the old rule's TAG of the placement, which is what the reuse compares today.
- *(2026-11-10, evening)* **24.21** found that the approved direction leaves out every equipment that exists today: none has a key, and the story gives it none. A later rename of those still loses the history (its second reading).
- *(2026-11-10, evening)* **Decision 12** found that the parecer gives Apto com restrições when any point exists, the automatic ones included (`relatorio/parecer.ts:177`). Fix batch e24h keeps every verdict by reading the findings there, with no point listed. Its spec says how.

## Open items

- **Bruno: B-1 to B-10** (`sprint-change-proposal-2026-11-10.md` § 6), sent in one message after the epic is built. None blocks a story.
- **B-11, raised while writing the stories:** should the TC's list ask an item on its secondary (never open, the short-circuit terminals)? The product has none today (Story 24.10).
- **Authored sentences.** Every story lists its authored pt-BR sentences in its PR. They go to Bruno with B-7.
- **Matheus: M-2** ("Agrupar por tipo" stays off on a new local) and **M-4** (the blank ART prints "[ART]") keep their defaults. **M-3:** the AD-25 note is written in Story 24.15's PR.
- **Matheus: the readings above**, chiefly ~~the renamed TAG (24.8)~~ *(2026-11-10, evening: decided, Story 24.21)* and the composer's palette (24.19). *(2026-11-10, evening: and, new, the create action on a reading (24.17; M-6 of the proposal) and the equipment from before the story (24.21; M-7).)*
- *(2026-11-10, evening)* **Matheus: the open questions of fix batch e24h** (M-8 of the proposal), as its spec stood on the evening of 2026-11-10: whether an NC row with no point is named again before issuing, a confirmed parecer text that reads stale after the update, and the Porto Seguro golden.
- *(2026-11-10, evening)* **Later, not planned:** how automatic points should work (decision 12).
- *(2026-11-11)* **Decided by Matheus on 2026-11-11** (decisions 16 to 18 of the proposal): the create action on a reading (24.17, M-6) is built as the story says; equipment from before Story 24.21 gets no key (M-7); an NC row with no point is not named again before issuing (M-8); the readings of 24.3, 24.18 and 24.19 stand as built.
- *(2026-11-11)* **Still open to Matheus:** a release for the hotfix `1528183f`; whether a measurement table prints its criterion (the 24.18 narrowing; until he decides, it does not); a confirmed parecer text that reads stale after e24h (M-8); M-2 and M-4 keep their defaults.
- *(2026-11-11)* **For Bruno, added to the one message:** the tolerance's printed form "220 V ±5 %" (with B-9); the sentences batches e24a, e24b and e24c authored, listed in PRs #310, #311 and #312; and that issuing again a relatório from before e24h prints it without its automatic points (finding H1 of the e24h pass).

- *(2026-11-11, later)* **Closed:** the release for the hotfix (v0.8.1, published on Matheus's word). **Moved to Bruno** on Matheus's word ("2. ok"): whether a measurement table prints its criterion (the 24.18 narrowing); until he answers, it does not.
- *(2026-11-11, later)* **New, open to Matheus:** D3 of the integrated review taken as a defect (an older visit issued late); the readings batch e24s built (listed under "Batches built"); the oil fields read-only on a non-oil unit on every seed; the sentence case of two labels; the note line's length (24.16); a reading back within its criterion asks nothing (24.17); E3, the inspection's thermography title in print.

## Fix batch e24h

*(2026-11-10, evening, coordinator, on Matheus's decision 12.)* Bruno reported on 2026-11-10, through Matheus and in chat, that points of attention appear when an NC is entered although nobody tapped "Criar ponto de atenção". He asks for an urgent correction: a point exists only when the technician creates it. There is no file with his words.

Matheus decided the same day: all five automatic kinds stop (`not_tested`, `nc`, `reading`, `reprovado`, `restricao`, `points/derived.ts`), for every relatório on every seed. How automatic points should work is thought through later and is not built now.

It is a fix batch, not a story:

- **Name and place.** "Points on click", branch `e24h-points-on-click`, spec `spec-e24h-points-on-click.md`. It runs first and alone, and it is deployed alone, on Matheus's word, before the rest of Epic 24.
- **Contract 41, with minimum 41.** A bundle on 40 would still list, count and print automatic points that the server no longer prints.
- **What it does.** Nothing lists, counts, flags or prints an automatic point: the Pontos screen, the Sumário, the pre-issue checks, the site checklist, section 8, and the points count of section 10.
- **What stays.** "Criar ponto de atenção" on an NC row and on a Não ensaiado band, and "Adicionar" on the Pontos screen, work as today. Verdicts and the parecer do not change. No data is deleted: a point already stored keeps its origin and its "Origem resolvida" flag. No new button and no new screen.
- **What it overrides.** The automatic "Não ensaiado" entry (Story 6.6, and its count in Story 15.2, finding F34), Story 22.5, the automatic point of a restricted reading (Story 23.6) and the automatic half of Story 23.11. Each has a dated note in `epics.md`, and `source-deltas.md` has the row.
- **A second item, H9, added the same night.** *(2026-11-10, coordinator, on Matheus's decision.)* Bruno reported, through Matheus, that he could not write "Observações" on a ficha Aprovado · Sem restrições, and that the same holds for the relatório's conclusion. Matheus decided it is fixed at once, for every relatório on every seed. Text in OBSERVAÇÕES, or in the observation of a row that is not NC, no longer sets the conclusion floor (`relatorio/conclusion.ts`, the `observation` reason retired). Choosing Com restrições still requires OBSERVAÇÕES. A stored pair stays. The parecer follows the fichas, so a relatório with observations and nothing else derives Apto. No golden moved by it. This was half of Story 24.3, which keeps the rest.
- **Old print changes once, here.** Section 8 of an older relatório loses its automatic entries. The spec names the goldens that move and carries their diff. From then on the rule "older relatórios print byte-identical" is measured from main after e24h.

**Built and gated** *(2026-11-10, coordinator)*:

- **PR #307**, head `a49e74db`, merged as `1528183f` on 2026-11-10. Contract 41, minimum 41. Spec and gate record: `spec-e24h-points-on-click.md`.
- **Goldens.** The layout-lock goldens of v5, v11 and v12 lost their automatic entries and one sentence each ("Foram registrados N pontos de atenção"). The Porto Seguro golden went from 25 points to 7, on Matheus's word: the 18 automatic rows left and nothing else changed. H9 moved no golden.
- **Story gate** on `86c98108`: lint and static clean; test:api 959 passed, 6 skipped; test:unit 6150 of 6150; 39 touched specs, 180 of 180.
- **Full run.** `test:e2e:full` on `a49e74db`, the same tree as `1528183f`: 660 tests, 656 passed, 0 failed, 4 skipped, 2466,7 s. Load `{ 2.67 4.22 5.17 }` at the start and `{ 4.53 4.47 5.12 }` at the end. An earlier full run on `d58d8be7`, before H9, had one red (12.2-E2E-002) while the machine slept; it passed alone.
- **Matrix** on `1528183f`: 168 tests, 150 passed, 2 failed, 16 skipped, 1295,5 s. Lock wait 482 s, load `{ 11.19 11.24 9.71 }` at the start, with two batch stacks beside the main one. The reds were 14.5-E2E-003 and R8DRY-E2E-002 on `durability-webkit`, each a 5 s wait. Their two spec files passed alone under the lock with `--repeat-each 2`, 12 of 12, at load `{ 3.15 4.10 5.48 }`.
- **Hands-on pass** on `1528183f`: every check of the two rules passed. Report: `_bmad-output/test-artifacts/manual/behaviour-pass-e24h-2026-11-10.md`. Its finding H1 is the rule itself seen from the user's side: a relatório issued before the change prints without its automatic points when it is issued again.
- **Load rule broken once.** The main stack stayed up for the pass while e24f and e24b ran, three stacks in all. The main stack's Postgres restarted three times, and the matrix's two reds came at that load. The main stack is stopped while batches run.
- **Deploy.** `1528183f` went to production on 2026-11-10 (2026-11-11 02:27 UTC) through `infra/bin/deploy`, on Matheus's word ("quando terminar já pode fazer o deploy"). Health was up on every component. The smoke passed 8 of 8. The usage-event check found 6 `session_start` with the new `app_version` and 0 `ux_event_sink_failed`. The image tag before it was `9add87b5`. ~~No release was published; it waits for Matheus's word.~~ *(2026-11-11: release v0.8.1 was published on `1528183f` on Matheus's word, "pode publicar a v0.8.1".)*

What it means for the stories (each has its dated note in `epics.md`):

| Story | What changed |
| --- | --- |
| 24.1 | Three more frames: the Pontos screen with stored points only, the create action on a reading, the editor it opens. The UX documents strike every sentence that says a point enters by itself. |
| 24.2 | Contract 42 over 41. The v13 lock is taken after e24h. Its fixture carries a stored point where it needs section 8 to print a recommendation. |
| 24.3, 24.4, 24.11, 24.12, 24.13, 24.16 | No row and no reading "derives" a point. Each criterion now says what the row offers, or that section 8 holds the finding only in a point someone created. |
| 24.7 | The question and the remove action concern stored points only. The heading fix (row 2352) is e24h's. The browser walk of a local's NC item is of a point created by the tap. |
| 24.17 | It now builds the create action on a failed test, on a restricted reading and on a ficha the technician reproved. On v14 the recommendation fills the action of the point that tap starts. Effort high. |

## Fix batch e24f

*(2026-11-10, coordinator, on Matheus's "yes" to the retrospective's proposal.)* The Epic 23 retrospective (`epic-23-retro-2026-11-10.md`) left seven review findings (E23-A1) and a list of tests that go red under load (E23-A4). They run as one fix batch beside wave 0, the way e23f ran beside Story 23.1. It is built red-first and passes the story gate plus the specs it touches. *(2026-11-10, evening: it starts after fix batch e24h merges, because both touch the same texts. It still runs beside Story 24.1 and merges before e24a starts.)*

From E23-A1:

- **R-1.** The conclusion paragraph says the values are within the criteria when one measured reading was judged by no criterion. It must treat that reading as one to check, and the cell gets a helper. This is the main item: it is a wrong sentence in a document the engineer signs.
- **R-3.** ~~Changing a test's recommendation in the type editor clears the imported recommendation of the polarization index, which today prints with no way to see or edit it.~~ *(2026-11-10, evening, reworded after decision 12.)* The imported recommendation of the polarization index can be neither seen nor edited in the type editor. After e24h it no longer prints by itself: it reaches section 8 only inside a point someone created, either one written before e24h from an automatic entry, or the point Story 24.17's create action will start. The fix is the same: changing a test's recommendation in the type editor clears the imported index recommendation, so that no new point starts with a text nobody can see.
- **R-4.** The test of a cable copy printing before its transformer asserts what the product really does, and the row is written as a narrowing.
- **R-5.** A second "Apagar leitura" on the same row from another device is accepted, not left as dead outbox rows. One api case with two devices.
- **R-7.** One Playwright case: "Atualizar" with unsynced work while the pull answers 426.
- **R-8.** The PDF test of the insulation table gains a sheet with every capture column filled and long values.
- **R-9.** One end-to-end case for "Igual à" between two v13 transformers, for the day-measured fields.

From E23-A4, the tests red under load in two or more gates: 21.1-E2E-002, R8CAP-E2E-010, 4.8-E2E-005 (first find why the device sent no request for 150 s after the job finished), `setup-surface.test.tsx`, `reading-arrivals.test.tsx`, `home-surface.test.tsx`, R8LAY-E2E-008 and `relatorio-tree-edges.test.tsx`.

Rules for the batch:

- It changes seed v13 behaviour only where the finding is a defect (R-1, R-3, R-5). The v13 layout lock of Story 24.2 is taken after it merges, so the lock holds the corrected print.
- If its spec finds a fold change (R-5 may be one), it takes contract ~~41~~ 42 *(2026-11-10, evening: e24h has 41)*, and the reserved numbers of e24a to e24p move up by one *(2026-11-10, evening: to 43, 44, 45 and 46)*.
- The deferred half of R-9 (a hidden dry value kept in the store, a swallowed commit error) stays in the ledger.

## Batches built (2026-11-11)

*(2026-11-11, coordinator.)* Matheus said "siga até o final" and asked for the rest to run in parallel. So the batches ran two at a time, each from the main of the moment, and the two wave gates became one integrated gate at the end (see "Batch plan" and "Gates"). Each batch's spec holds its own gate record and design notes.

| Batch | PR | Merged as | Contract | Stories | Story gate |
| --- | --- | --- | --- | --- | --- |
| e24f | #309, head `2bfd64cb` | `8bddd986` (2026-11-10) | 42, minimum 42 | none (R-1, R-3, R-4, R-5, R-7, R-8, R-9 and the tests red under load) | `spec-e24f-retro-fixes.md` § Auto Run Result |
| e24b | #310 | `1c63235e` (2026-11-11) | 43, minimum 43 | 24.5, 24.6, 24.7, 24.8, 24.21, 24.9 | lint and static clean; test:unit 6243 of 6243; test:api 962 passed; touched specs 244 passed; touched durability specs on the three matrix browsers, 59 passed |
| e24a | #311, head `1bd82b67` | `dee6d567` (2026-11-11) | 44, minimum 44 | 24.2, 24.3, 24.4 | lint and static clean; test:unit 6322 of 6322; test:api 973 passed, 6 skipped; 46 touched specs, 170 of 170 |
| e24c | #312, head `e9be454d` | `ea6676d2` (2026-11-11) | 45, minimum 45 | 24.18, 24.19, 24.20 | lint and static clean; test:unit 6360 of 6361 (the red is e24b's `verificacoes-surface.test.tsx`, under load; it passed alone twice); test:api 977 passed, 6 skipped; 33 touched specs, 166 passed, 0 failed, 3 skipped |
| e24p | #314, head `f306c042` | `e5fdde82` (2026-11-11) | 46, minimum 46 | 24.15, 24.16, 24.17 | lint and static clean; test:unit 6415 of 6415; test:api 983 passed, 6 skipped; 23 touched specs, 102 of 102 |
| e24s | #315, head `5698d3e4` | `716e26b8` (2026-11-11) | 47, minimum 47 | 24.10, 24.11, 24.12, 24.13, 24.14 | lint and static clean; test:api 993 passed, 6 skipped; test:unit 6489 passed and 5 failed under load (the 4 files alone, 108 of 108); 54 spec files, 224 of 227 (the 3 reds alone, 3 of 3); 3 durability specs on the matrix, 21 of 21 |

What each one left for the integrated review and for the people:

- **e24f.**
  - R-5 changed the fold (`ops/apply.ts`), so the batch took contract 42.
  - The likely cause of the 150 s silence of 4.8-E2E-005 was that a JSON sync request had no time limit. `apps/web/src/sync/client.ts` now aborts a request whose headers do not arrive in time. The cause was not reproduced.
  - Read first in the integrated review: that time limit, and R-1's branch for the vector group.
- **e24b.**
  - The unit column's alignment (decision 15) applies from 768 px up. At 390 px it pushed the table out of the screen.
  - A new equipment stores a write-once `reuse_key`. The fixtures and the goldens pass the frozen TAG rule (`tagRule: 'legacy'`). No golden moved.
  - Read first in the integrated review, patched and not re-reviewed: the effect that closes the point question, the pending-text rule, `learnedBefore`, the `reuse_key` schema.
- **e24a.**
  - Seed v14 is open, as v13 plus five flags of the seed-level `rules` object: `conclusion_restriction_by_choice`, `prerequisite_needs_nameplate`, `parecer_names_finding`, `nc_clause_on_one_line`, `results_reference_across_runs`. They are read by `seedRule(version, flag)`.
  - The v13 lock was taken on main `8bddd986`: seven files under `golden/layout-lock-v13/`. The v5, v11, v12 and Porto Seguro goldens did not move.
  - There is no v14 golden yet. It is due at the deploy.
  - For the hands-on pass: a restriction stored under a v14 Reprovado shows "Conclusão ajustada" until it is confirmed.
  - Read first in the integrated review, patched and not re-reviewed: the test of the v14 parecer basis, the header's count of what is missing under a v14 Reprovado, the punctuation of joined NC lines.
- **e24c.** It is the company-types half of the planned e24p, started early because it needs no seed.
  - **24.18, narrowed in print.** A measurement table has printed no ACEITÁVEL line since Story 22.2. So a "nominal ± %" row of such a table shows its criterion on the sheet and in the editor, and nothing in print. Where a criterion does print it reads "220 V ±5 %", as the ratio's "±0,5 %" prints today (B-9 decides the spacing). Whether those tables print the criterion is open to Matheus.
  - **24.20, built in another place.** The refusal is in the server's push route (`op_invalid`), not in the strict schema. A new device runs every version it pulls through that schema and stops on a refusal, so a version already published in the broken state would block its sync.
  - A library type hidden by a copy gets a second grey line in Tipos de equipamento. In the composer it loses its only "Editar padrões" entry while a template still places it: this goes to the fix batch (below).
  - A residual risk, with no ledger row: any later tightening of `companyTypeDefinitionSchema` can block the sync of a new device.
  - No golden moved and no seed data changed.
- **e24p** *(added 2026-11-11)*. The print half: Stories 24.15 to 24.17.
  - The service date is kept in each `last_results` entry on every seed, and the visits are ordered by it. On v14 the previous column's header carries the date, and one note line after a test's table names the drops and rises.
  - Three v14 flags: `previous_visit_date`, `history_note`, `recommendation_as_action`.
  - "Criar ponto de atenção" on a failed test, a restricted reading and a ficha the technician reproved. On v14 the test's recommendation fills the action of the point that tap starts.
  - Crops of the printed pages: `e24p-pdf-crops/`.
  - Left open to Matheus by the batch: the note line's length (the kernel's reasons are longer than the frame's sample), and a reading back within its criterion asks nothing (the point keeps "Origem resolvida").
- **e24s** *(added 2026-11-11)*. Seed v14's sheets: Stories 24.10 to 24.14.
  - No new `rules` flag: every delta is data of the v14 seed or an optional definition key (`oil_rule.dry_items`, the value kind `text`, `nameplate_title`, `nameplate_photo`), stripped by `withoutE24s` in `seed.test.ts`.
  - The plate prompt is now `bedrock-structuring-9`. Reading a No-break plate from a photo is proven with the fake provider only. The paid eval is due before the deploy, on Matheus's word (what it checks: "Integrated review" below).
  - On every seed with an oil rule an oil field of a non-oil unit is read-only on screen, with its reason. Print is unchanged.
  - A new acronym rule lowers "Torque conforme o fabricante" and "Trincas na resina" to sentence case on screen.
  - Crops: `e24s-pdf-crops/`. No golden moved: `layout-lock/op-log.ts` gained the option `withoutTypes`, and the Porto Seguro test its type-count map.
  - Ledger rows it left: the Conflict view and the sheet stepper still say "Dados de placa" / "Placa" on the v14 Malha; the inspection's thermography prints as "E1 · TERMOGRAFIA"; the job test "a photo with no fixture fails permanently" reads a cable.
  - The coordinator's readings it built as written, open to Matheus: the TC gets no item on its secondary (B-11); forced ventilation is item 5, renamed; the function test is one item with a hint; the No-break has six items, VA and W as two fields and the battery fields labelled "BATERIAS:"; the "Outro" text is required while it shows; "Dados da malha" on v14 only.

## Fix batch after the integrated review (planned)

*(2026-11-11, coordinator, on Matheus's decisions 17 and 18 of the proposal.)* One fix batch follows the integrated gate and review. Besides what the review finds, it carries:

- An observation the technician typed is always treated as edited: when its item goes back to Conforme or N.A. it is kept and the warning shows, even when the text equals a phrase typed on another sheet (Story 24.6, batch e24b).
- In the template composer, a library type hidden by a published copy keeps a way to "Editar padrões" while a template still places it (Story 24.19, batch e24c).

## Integrated review (2026-11-11)

*(2026-11-11, coordinator.)* The review ran as read-only passes on fixed commits while the last batches were still building, so its findings could go to one fix batch: three reviewers on `b07d3397` (e24f, e24b, e24a, e24c), one on `e5fdde82` (e24p's diff) and one on `52ddc91a` (e24s's diff). Each read with three lenses (adversarial, edge cases, verification gaps) and checked every finding against the code.

What they found sound: no path of a v1 to v13 relatório reaches a v14 branch; the contract comments of 42 to 47 say what changed; no golden and no fixture op moved; every v14 delta is seed data, a `rules` flag read by `seedRule`, or an optional key.

| Id | Level | Where | What fails | Goes to |
| --- | --- | --- | --- | --- |
| D1 | high | `apps/web/src/surfaces/ficha/point-place.tsx` | The point editor opened by Story 24.17's "Criar ponto de atenção" closes itself at the first autosave. The typed text is kept. The batch's tests tapped "Concluir" without typing. | e24x |
| A1 | medium | `packages/domain/src/registry/nc-phrase-row.ts` (`learnedBefore`) | A hand-typed observation is cleared with no warning after a later chip tap or on a fast tablet clock. It is decision 17's item. | e24x |
| B1 | medium | `apps/web/src/sync/client.ts` | The headers time limit aborts every push on an uplink under 8 KB/s. No op is lost or doubled. | e24x |
| C1 | medium | `packages/domain/src/relatorio/over-range.ts` | A reading above the instrument's limit on a `between` or "nominal ± %" row gets no verdict. | e24x |
| D2 | medium | `packages/domain/src/points/derived.ts` | A recommendation over the 1,000 cap is stored as the action on the device and refused by the server at sync. | e24x |
| D3 | medium | `packages/domain/src/print/reading-slots.ts` | An older visit issued late prints the later visit as MANUT. ANTERIOR. The batch had left it to Matheus; the coordinator took it as a defect, for him to confirm. | e24x |
| E1 | medium | `packages/domain/src/relatorio/conclusion.ts` | The v14 Inspeção de QGBT says ", sem valores medidos registrados" when its thermography is off, not applicable or unanswered. v13 does not. | e24x |
| A2 | low | `apps/web/src/surfaces/ficha/checklist-section.tsx` | A chip's text still being saved is neither cleared nor warned when the item goes to Conforme. | e24x |
| A3 | low | `relatorio/conclusion.ts` | "com leitura a conferir" with an empty ratio table. | e24x |
| A4 | low | `relatorio/conclusion.ts` | The v14 line join leaves ":;". | e24x |
| A5 | low | `checklist-section.tsx` | "Observação mantida" is lost on leaving the ficha. | e24x |
| B2 | low | `apps/web/src/surfaces/relatorio/tree-actions.ts` | Two live equipment on one `reuse_key` after remove, add and restore. | e24x (it reports why it stopped) |
| B3 | low | `packages/domain/src/ops/value-limits.ts` | `reuse_key` has no cap of its own. | e24x |
| B4 | low | `packages/domain/src/relatorio/instantiate.ts` | A company copy never binds its base type's equipment, and Story 24.19 makes the copy the only placeable type. | e24x (it reports why it stopped) |
| C2 | low | `relatorio/reading-run.ts` | On a two-sided criterion the worst reading is always the highest. | e24x |
| C3 | low | `apps/web/src/surfaces/templates/block-palette.tsx` | A company type with nothing to summarize gets no "Tipo da empresa" mark; the field palette doubles a separator. | e24x |
| C4 | low, test | `e2e/pass-screen-fixes.spec.ts` | The unit column's alignment is asserted at 1280 px only. | e24x |
| D4 | low | `print/visit-date.ts`, `print/last-results.ts` | With entries from before Story 24.15 a newer visit can be filed as the prior of an older one. | ledger |
| D5 | low | `points/derived.ts` | A test can get a second point. | e24x |
| E2 | low, record | `source-deltas.md` | Two rows said contract 45 for what shipped on 47. | corrected in this change |
| E3 | low | print | The inspection's thermography prints as "E1 · TERMOGRAFIA". | ledger; Matheus or Bruno |

Test gaps sent to e24x: the effect that closes the point question and the pending-text branch (24.6, 24.7); the tap on "Criar ponto de atenção" of REAPERTO GERAL (24.12); the "every seeded type duplicates to a valid draft" loops on v14; a template holding an Inspeção de QGBT or a dry transformer moved from v13 to v14; the oil and dry durability specs on the matrix.

Gaps not sent, kept here: no test presses "Ditar o motivo" (24.14); with the No-break in, the layout lock compares only the list of block types (24.13); two types named "No-break de comando" is covered by a selector change only.

**The paid plate eval of `bedrock-structuring-9`** (not run; it needs Matheus's word). On the sample `plate-no-break-comando` in `apps/api/src/scripts/eval-samples.ts`: the 15 printed values come back; the battery maker, model and date stay empty, with no leak of the unit's own maker and model; the battery quantity is 10 from "10 x 12 V 7 Ah", with 12 V and 7 Ah in their fields; 3000 VA and 2700 W are not swapped; the input and output types read "Vca" and "Vcc". Every other sample scores as under prompt 8.

*(2026-11-11, later: done; see "Fix batches, the integrated gate and the passes" below.)* **What follows.** Fix batch e24x (`spec-e24x-review-fixes.md`, in build on 2026-11-11) merges main and takes contract 48 if it needs a number. Then: the integrated gate on main, a read of e24x's patches, the hands-on pass in the browser with its report under `_bmad-output/test-artifacts/manual/`, the paid eval and the v14 golden, and the deploy on Matheus's word. An early hands-on pass on `716e26b8` runs beside the fix batch; its findings go to e24x or to a second fix batch.

## Fix batches, the integrated gate and the passes (2026-11-11)

*(2026-11-11, coordinator.)* What happened after the integrated review, in order.

| Step | PR | Merged as | Contract | What it is |
| --- | --- | --- | --- | --- |
| Fix batch e24x | #317, head `7331e624` | `76c74711` | none (47 stays) | The integrated review's findings A1 to E1 and the gaps G1 to G4; its own review (X1 to X7). B4 was stopped and B2 is a ledger row. |
| Fix batch e24y | #319, head `c2243c43` | `7773aafa` | none | The early hands-on pass's findings (P1 to P7), Bruno's corrected sentences, the QGBT thermography title and the tolerance's form (P8 to P10); its own review (Y1 to Y8). |
| Fix batch e24z | #322, head `e3a275bf` | `ee0859cc` | none | The integrated gate's reds: tests only. |

**Seed v14 after the fix batches.** Three more `rules` flags, all from e24y: `paired_tables_fit_whole`, `history_needs_like_with_like`, `empty_steps_hidden`; and one definition key on the Inspeção de QGBT, `measurement_tests_unnumbered`. `V14_HASH` is re-pinned and `withoutE24y` strips them. No golden and no fixture op moved in any of the three batches.

**The integrated gate** ran three times on main, each as `lint`, `static`, `test:api`, `test:unit`, `test:e2e:full` and `test:e2e:matrix` under the host lock.

| Run | Main | Result |
| --- | --- | --- |
| 1 | `76c74711` | No result. It ran beside a building batch: the load reached 32, the stack's Postgres restarted and the api did not come back. Lint and static were clean. |
| 2 | `7773aafa` | lint and static clean; test:api 995 passed; test:unit 6592 of 6593; test:e2e:full 707 of 716 with 5 failed; matrix 152 passed, 0 failed. Three reds were specs that still asserted the behaviour from before e24s and e24y (`review-concluir-text`, `sheet-knows-12-3-12-4`, `seed-v7`); two specs and the unit test passed alone. They became fix batch e24z. |
| 3 | `ee0859cc` | **Accepted.** lint 0 errors; static clean; test:api 995 passed, 6 skipped; test:unit 6593 of 6593; test:e2e:full 711 of 716, 4 skipped and 1 failed (`cta.spec.ts` 14.5-E2E-001: the download did not start within 30 s in the queue lane; alone it passed 3 of 3); matrix 152 passed, 0 failed, 16 skipped. |

`origin/main` after run 3 differs from `ee0859cc` by documentation only (the Epic 25 frames).

**What the gate taught.** A batch's list of touched specs misses the specs that assert the old behaviour of what it changes. From Epic 25 on, a batch greps `e2e/` and the web tests for the strings, op paths and behaviours it changes before its gate. And the integrated gate never runs beside a building batch.

**The hands-on passes.** `_bmad-output/test-artifacts/manual/behaviour-pass-e24-2026-11-11.md` holds both: the early pass on `716e26b8`, whose findings F1 to F17 fed fix batch e24y, and the final pass on `ee0859cc`. It found no High defect and nothing that should stop a deploy; its three Medium findings are G1 (a deadline typed by hand in the point editor leaves a draft behind, so "Rascunho encontrado" shows on the next load; sent to batch e25a of Epic 25), G2 (a TAG rename is not carried to the conclusion text of the same equipment in another open relatório of the obra; ledger row of e24y, and Story 25.7 will block issuing with a stale text) and G3 (an NC row offers a second point; Matheus decided an item may carry several).

**Matheus's words of 2026-11-11 on what the coordinator had built on its own reading:** an older visit issued late must not print a later visit as the previous one (D3) and the correction of a reading above the instrument's limit applies on every seed (X7), both "pode mergear e seguir"; an NC item may carry several points (F4), nothing changes.

**Still open to Matheus from the fix batches** (each has its ledger row): the "Marcar como …?" form for the other preview pills (only "Reprovado" changed); the seeded criteria keep "±" and ">=" as they print today; another open relatório of the same obra keeps the old TAG's text after a rename (Y6); the helper "Sugestão do app. Troque pela TAG da placa…" stays after a rename typed in the plate's field; the band "Aplicado por você. Equipamento fora de carga." was not changed, because Bruno's replacement reverses its meaning (a question for him); B4, a company copy never binds its base type's equipment.

**Ledger rows added here** (`deferred-work.md` § "Epic 24 integrated gate"): the api process exits when its database restarts and does not come back in compose; `cta.spec.ts` 14.5-E2E-001 is sensitive to the load of the document queue.

**Before the deploy:** the paid plate eval of `bedrock-structuring-9` and the v14 golden, then the deploy and the release, each on Matheus's explicit word.

## Deploy (2026-11-11)

*(2026-11-11, coordinator.)* Matheus's word: "pode seguir com os testes e deploy. O achado não atrasa o deploy mas precisamos corrigir". The finding is G1 of the final hands-on pass (a deadline typed by hand in the point editor leaves a draft behind); its fix is in batch e25a of Epic 25.

- **The paid plate eval** of `bedrock-structuring-9`, on `2009fa30`, with Haiku 4.5 and Nova Pro (`apps/api/src/scripts/bedrock-eval.ts`, OCR Textract):
  - Synthetic, 16 plates: Haiku 97,9 % of the fields (95 of 97), Nova Pro 97,9 % (95 of 97); a second run with per-plate detail gave Nova Pro 94 of 97. No reading failed; every citation was valid.
  - The No-break plate (`plate-no-break-comando`): 15 of 15 fields on both models, with 15 cited values, so nothing was invented for the battery maker, model or date.
  - Six real plates: Haiku 5 of 6, Nova Pro 5 of 6. The sixth reads no vector group on either model; it is the plate of E21-A2. On prompt 8 (2026-11-10) the figures were Haiku 5 of 6 and Nova Pro 6 of 6, and 97,6 % and 98,8 % on 15 synthetic plates. The older plates' prompt text did not change.
- **The deploy.** `2009fa30` (the gated `ee0859cc` plus documentation) went to production on 2026-11-11 (23:26 to 23:52 UTC) through `infra/bin/deploy`. Health was up on every component. The smoke passed 8 of 8. The usage-event check found 6 `session_start` with the new `app_version` and 0 `ux_event_sink_failed`. The api logged "template seeds upgraded" once and no error event in the 40 minutes after the roll. The image tag before it was `1528183f`.
- **Seed v14 is frozen from here.** Contract 47, minimum 47. A change to seed content or to printed text now needs seed v15 (Epic 25, Story 25.5), and the v14 layout lock is taken from `2009fa30`.
- **Tag** `v0.9.0` is on `2009fa30`. The release page waits for Matheus's word.

*(2026-11-11, coordinator, after the retrospective `epic-24-retro-2026-11-11.md`: the records of E24-A2 and E24-A6.)*

- **The v14 golden was taken after the deploy, not before it.** This file puts it at the deploy or before it: "There is no v14 golden yet. It is due at the deploy" and "Before the deploy: the paid plate eval … and the v14 golden". That is not what happened: `2009fa30` went to production with no v14 golden. Batch e25b of Epic 25 took it afterwards, on the coordinator's ask: commit `7a8c7aa6`, PR #325, merged as `2b299da1` on 2026-11-11 (2026-11-12 00:28 UTC), 36 minutes after the deploy ended. The seven files under `apps/api/src/jobs/generate/golden/layout-lock-v14/` were generated from the product code of `2009fa30`, and `LAYOUT_LOCK_VERSIONS` holds `v14`. Story 25.5 keeps them byte-equal and adds its second fixture (the dated line under the story in `epics.md`).
- **The "before the deploy" rows of `deferred-work.md`, by name.**
  - The v14 layout lock (batch e24a's row): closed, with what the golden covers of the retrospective's R-3 list and what it does not.
  - The paid eval of `bedrock-structuring-9` (batch e24s's row): closed with the result above.
  - The optional production count of the fichas whose confirmed conclusion text goes stale (fix batch e24h's row, owner Matheus): no run is on record. The row stays open.
- **`sprint-status.yaml`:** the rows of Stories 24.2 to 24.21 said "done on main, not deployed". They now say deployed as `2009fa30`.
- **Still open from E24-A6. Each waits for Matheus.**
  - Item 3: the dated line under the "byte-identical" rule in `epics.md` § Epic 24 (what changed on older seeds, and on whose word) is not written. He approves `epics.md` lines.
  - Item 4: whether Nova Pro's 5 of 6 real plates on prompt 9 is run-to-run variation is not known. One more run of the real set needs his AWS login.
  - Item 5: the read-only preview of Bruno's v5 relatório after the deploy has no run on record, in Epic 23 or in Epic 24. It is run and recorded, or dropped with the reason, on his word.

## Batch plan

There are at most two batch stacks up at a time (the 2026-10-08 load rules). Each batch runs `bmad-build-auto` in its own worktree, following `epic-batch-orchestrator.md`. The coordinator hands out a free port base before each launch (`podman ps --filter name=fasor-`).

| Wave | Tag | Branch | Stories | Dev model · Effort | Contract (reserved) | Base |
| --- | --- | --- | --- | --- | --- | --- |
| *(2026-11-10, evening)* first | e24h | `e24h-points-on-click` | none: the fix batch "points on click" (decision 12) | opus · high | 41, minimum 41 | main `72ed1f51`; alone; deployed alone on Matheus's word |
| 0 | coordinator | `docs/e24-frames` | 24.1 | opus · medium (`bmad-ux`) | none | main after the planning PR |
| 0 | e24f | `e24f-retro-fixes` | none: the Epic 23 retrospective's fix batch (E23-A1, E23-A4) | opus · high | ~~none expected~~ *(2026-11-11: 42, taken; R-5 changed the fold)* | main after the planning PR, beside Story 24.1 *(2026-11-10, evening: and after e24h has merged)* |
| 1 | e24a | `e24a-conclusion-rules` | 24.2, 24.3, 24.4 | opus · high, max, high | ~~41~~ ~~42~~ *(2026-11-10, evening)* 44 *(2026-11-11, taken at its merge)* | main after 24.1 is approved and e24f has merged |
| 1 | e24b | `e24b-screen-lane` | 24.5, 24.6, 24.7, 24.8, *(2026-11-10, evening)* 24.21, 24.9 | opus · medium, high, high, high, *(2026-11-10, evening)* high, medium | ~~42~~ 43 *(2026-11-10, evening: Story 24.21 takes it)* | main after 24.1 is approved |
| 2 | e24s | `e24s-seed-v14-sheets` | 24.10, 24.11, 24.12, 24.13, 24.14 | opus · medium, high, medium, high, medium | ~~43~~ ~~44~~ *(2026-11-10, evening)* main's number plus one at its merge, if it takes one *(2026-11-11)* | ~~main after wave 1's gate and fix batch~~ *(2026-11-11)* main `dee6d567`, right after e24a merged |
| 3 | e24p | ~~`e24p-print-company-types`~~ *(2026-11-11)* `e24p-print` | 24.15, 24.16, 24.17, ~~24.18, 24.19, 24.20~~ *(2026-11-11: built as batch e24c, the next row)* | opus · high, high, ~~medium~~ high *(2026-11-10, evening)*~~, high, medium, medium~~ | ~~44~~ ~~45~~ *(2026-11-10, evening)* main's number plus one at its merge, if it takes one *(2026-11-11)* | ~~main after wave 1's gate and fix batch, beside e24s~~ *(2026-11-11)* main `ea6676d2`, right after e24c merged, beside e24s |
| *(2026-11-11)* 3, early | e24c | `e24c-company-types` | 24.18, 24.19, 24.20 | opus · high, medium, medium | 45, taken at its merge | main `1c63235e`, right after e24b merged, beside e24a |

### Merge order

1. The planning PR, then Story 24.1's frames and fix batch e24f side by side. e24f merges before e24a starts: both edit the conclusion text. *(2026-11-10, evening: fix batch e24h comes before all of them. It merges and is deployed alone. This planning change merges beside it; e24h does not edit the planning files. e24f starts after e24h merges.)*
2. e24a, then e24b. e24b merges main first: both edit `points/derived.ts`. *(2026-11-10, evening: inside e24b, Story 24.21 is built right after 24.8.)*
3. ~~Wave 1's gate, its two-pass review and its fix batch.~~ *(2026-11-11: folded into step 5.)*
4. ~~e24s, then e24p. e24p merges main first and re-pins `V14_HASH`.~~ *(2026-11-11: e24s and e24p run side by side. The one that opens its PR second merges main first and re-pins `V14_HASH`.)*
5. ~~The gate of waves 2 and 3, its review and its fix batch.~~ *(2026-11-11: one integrated gate on main after e24s and e24p merge, then one two-pass review, then one fix batch.)*
6. The paid plate eval, the hands-on pass, then the deploy on Matheus's word.

*(2026-11-11, coordinator: the order that happened.)* e24h (#307), e24f (#309), Story 24.1's frames, e24b (#310), e24a (#311), e24c (#312). Matheus asked for the rest to run in parallel, so each batch started as soon as a slot was free, on the main of the moment, and no gate ran between the waves. The risk taken is that a defect of wave 1 is found only at the end; the integrated review reads wave 1's patched parts first.

### Coordinator decisions

- **Seed v14.**
  - e24a creates `seed/v14.ts`, derived from v13 with `V13_HASH` pinned as shipped. Its first commit holds only v14 = v13, the `rules` key and the v13 layout lock.
  - Every later batch adds to v14 in place, in its own fenced section, with its strip helper in `seed.test.ts`. This is safe because v14 is not deployed until the epic's single deploy. `V14_HASH` is re-pinned by each batch, and the PR that merges second re-pins it on the merged main.
  - e24b adds nothing to the seed.
- **Contracts.**
  - Numbers are reserved in merge order: ~~e24a 41, e24b 42, e24s 43, e24p 44~~ *(2026-11-10, evening)* ~~e24h 41 (taken), e24a 42, e24b 43, e24s 44, e24p 45.~~ *(2026-11-11: numbers are no longer reserved. A batch that needs one takes main's number plus one when it merges main before its PR. Taken so far: e24h 41, e24f 42, e24b 43, e24a 44, e24c 45.)*
  - A batch whose spec finds no fold change takes no number, and the coordinator renumbers the unlaunched batches down. ~~Planning found none in e24b.~~ *(2026-11-10, evening: Story 24.21 adds a key to the equipment row, so e24b takes its number.)*
  - `MIN_CONTRACT_VERSION` follows each bump unless a PR shows a reason not to. Each bump has an api integration test through the sync route.
- **Shared files and expected conflicts.**
  - `points/derived.ts`: e24a and e24b (wave 1). e24b merges second. *(2026-11-10, evening: e24h first, before any of them; e24p last, for Story 24.17.)*
  - `relatorio/conclusion.ts`: e24a (the v14 rule, the NC clause) and e24b (the preview's kernel answer, "Critérios usados"). e24b merges second.
  - `apps/web/src/surfaces/ficha/conclusao-section.tsx`: e24a (no restriction under Reprovado) and e24b (the preview state).
  - `apps/web/src/surfaces/ficha/checklist-section.tsx`: Stories 24.6 and 24.7, both in e24b, in that order.
  - `seed/v14.ts`, `seed/seed.test.ts`, `seed/schema.ts`: e24a, then e24s and e24p side by side. The second PR of the pair takes the other's keys whole and re-pins.
  - `schemas/block-config.ts`: e24s appends item keys and the type.
  - `print/section-9.ts`: e24a (the boxes), e24s (the reason line, the new sheets), e24p (the header and the note line).
  - `print/section-8.ts`: e24p only (Story 24.17).
  - `relatorio/tag.ts`: e24b (the rule), then e24s (the prefix NB).
  - *(2026-11-10, evening)* `relatorio/instantiate.ts`, `relatorio/tree.ts` `newEquipmentBlock` and `schemas/entities.ts` (the equipment row): Stories 24.8 and 24.21, both in e24b, in that order.
  - *(2026-11-10, evening)* `apps/web/src/surfaces/ficha/measurement-field.tsx`, `measurement-test-section.tsx` and `conclusao-section.tsx`: e24a ("Marcar Com restrições", no restriction under Reprovado), e24b (the preview), then e24p (Story 24.17's create action).
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
- **After each wave.** *(2026-11-11: once, after the last batch merges; see "Merge order".)*
  - First `podman compose restart api web`.
  - Then one integrated gate on main: `pnpm test:e2e`, `test:e2e:full` and the matrix, with the host load line.
  - Then the two-pass integrated review, then one fix batch if needed.
- **Before the deploy.**
  - The paid plate eval, its table recorded.
  - The hands-on pass in the browser on the integrated main, on a v14 relatório and on a v13 one, its report tracked under `_bmad-output/test-artifacts/manual/`.
  - The "before the deploy" rows of `deferred-work.md`.
- **Deploy.** Once, on Matheus's word. Seed v14 freezes there. *(2026-11-10, evening: fix batch e24h has its own deploy before it, alone, on Matheus's word, after its own gate.)*
