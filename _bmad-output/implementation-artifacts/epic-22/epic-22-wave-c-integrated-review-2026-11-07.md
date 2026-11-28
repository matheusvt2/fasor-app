# Epic 22 wave C: integrated review (2026-11-07)

Reviewer: integrated reviewer subagent. Main at `1fdea0d7` (PR #274, batch e22t), wave base `8d8edd41`; the net diff `git diff 8d8edd41 1fdea0d7` is 124 files, +7845 / -647. Wave C is Stories 14.6, 14.7 and 14.8 (company equipment types, contract 33, MIN 33).

The review ran in two passes, per `epic-batch-orchestrator.md` § 9 P-1 and the coordinator's brief:

- **Pass 1, the code read**, ran first without any stack, with the verification-gap and edge-case lenses. Its scope is below.
- **Pass 2, the behavior pass**, started after the coordinator's `gate.done` marker, on the review's own stack.

**The integrated gate on `1fdea0d7`** (coordinator, `wave-c-gate/gate.log`) had lint 0, static 0 and unit 0, with three reds:

- api: rc 1;
- `test:e2e:full`: 602 of 612 passed, 4 skipped, 6 failed;
- matrix: 143 of 162 passed, 16 skipped, 3 failed.

Every red came from a stale server, not from wave C code (N8). The coordinator's rerun after an api restart (`rerun.log`) was green:

- `test:api`: 905 passed, 6 skipped;
- the six red specs: 19 of 19;
- `company-type.durability` on the three matrix projects: 3 of 3.

The behavior pass started after `rerun.done`, so the review stack and browser stayed down while the gate's `test:unit` and `test:e2e*` stages ran (E21-A4 P-3).

**Review stack.**

- Compose project `fasor-e22w`, port base 65.
- Images `localhost/app-api-e22w` and `localhost/app-tools-e22w`, tagged from `d945b9b5cf54` and `5c74d6294643`, with no build.
- `LLM_PROVIDER` and `OCR_PROVIDER` were `fake`.
- Users seeded with `seed-users --test`. I browsed as `a@teste.local` (Empresa A) and checked isolation as `b@teste.local` (Empresa B).
- I stopped the stack with `podman compose -p fasor-e22w stop` (no `-v`) and closed the Playwright MCP browser.

**Evidence** is in the ignored `.playwright-mcp/e22w/` of the main checkout:

- screenshots 01 to 13;
- `r1-preview.pdf` (the preview of relatório R1), its text `r1.txt`, and the render `r1-p18-018.png` of the company sheet's page.

**Relatórios on the `fasor-e22w` volume**, in obra "Obra Revisao":

- R1 is `01a1b63e-b9f0-7515-8865-e3015a1525c2`;
- R2 is `01a1b647-295d-71e4-b2b4-cb5d0585efd6`;
- the company type is "QGBT da empresa" (`01a1b63b-042f-7498-a76a-d6351e9671cf`), a copy of the library Quadro elétrico. Its v1 was renamed "Quadro de baixa tensao" in v2.

## Summary verdict

**Not accepted: 2 blockers, 4 should-fix, 13 notes.**

- **Most of the wave works as written.** Seen in the browser:
  - the type list, Duplicar, the six-tab editor with inline kernel issues and "Publicar" held by the first issue;
  - publish v1, edit to v2, Aposentar behind its Confirm;
  - the composer and field palettes offering the published type after the library types, and hiding it once retired;
  - instantiation at the latest version, with R1 keeping v1's name and criterion after v2;
  - the company sheet with its checklist, NC chips, photo, point, readings, conclusion floor, composed text, Não ensaiado and conclude;
  - the PDF printing the sheet with its plate, items, readings, observation, conclusion marks and photo caption, and section 10 counting it.

  Company B sees none of A's types: not in its list, not in its company stream, and the editor URL says "Este tipo não está neste aparelho". A contract 32 pull answers 426.
- **B1: on a company sheet, every web call site that leaves out the definition context reads no definition.** "Marcar os restantes como Conforme" is disabled on a sheet with 17 unanswered items, with the false reason "Todos os itens já estão marcados" (seen). By the same code, the plate and display reading suggestions, "Repetir da ficha anterior", the SELV notice and the conflict value text resolve nothing. This breaks Story 14.8 AC2 (bulk actions, and the AI readings of Epics 9 and 21).
- **B2: an edit typed in the type editor is lost when the user taps another tab** (seen twice). The field commits on blur, and the tab change unmounts it first. This breaks Story 14.7 AC2 ("each edit autosaves as ops") on the editor's main gesture.
- **S1 is the wave B interaction:** a copy of the Quadro elétrico judges insulation at > 400 MΩ instead of NBR 5410's 0,5 MΩ. Seen end to end: a healthy 380 V board reading 45 to 60 MΩ printed Reprovado · Com restrições and made the relatório Não apto.
- **S2:** the deferred medium is confirmed by reading.
- **S3:** the 768 px DoD gap of 14.7, and the 14.8 AC2 e2e gap that let B1 through.
- **S4:** the type list scrolls sideways at 390 px.

## Pass 1: code read (verification-gap and edge-case lenses)

**Scope.**

- **PR #274's "Patched, not re-reviewed" list, read first:**
  - `criterionRulesFor` and the strict schema's grammar/rule pairing (`types/definition.ts:159-239`): read; finding N1;
  - Duplicar stripping `criterion_bands` and `criterion_class_field` (`types/duplicate.ts:79-86`): read; finding S1;
  - `enabledSubBlocks` for a company type with `checklist: null` (`templates/compose.ts:390-399`): no finding;
  - `removeDraftEntry` deleting an empty `measurement_tests` (`types/draft-edit.ts`): no finding (the strict schema's `min(1).optional()` holds);
  - switching a criterion to `pass_fail` writes value 1 (`types/draft-edit.ts:468`): no finding on its own; the rule it writes judges nothing (N1);
  - `print/last-results.ts` and `instrumentRangeFor` through the context (`relatorio/instrument-pick.ts:93-104`, caller `ensaios-section.tsx:175`): no finding; the picker's order helper is left on the empty context (N6);
  - the added tests (instantiation when v2 drops keys, seeded-only snapshot byte-equality, photos, parecer and pre-issue, `newEquipmentBlock`, the api plate job, the field-palette add step): read; gaps under S3.
- **The batch's deferred medium** (a block names its version by number): confirmed by reading, two concrete outcomes (S2).
- **Every AC of 14.6, 14.7 and 14.8** against the code (table below).
- **Kernel ownership (AD-1 to AD-3, AD-13)** over every changed file in `apps/web` (N2).
- **Contract 33**, old seeds v1 to v12, the replay pins and the Porto Seguro goldens.
- **Wave B interaction**: the fields a company copy drops (S1, N9).
- **Tenant isolation** of company types in the api.

### Acceptance criteria against the code

| Story / AC | Result | Where |
|---|---|---|
| 14.6 AC1: draft with label, TAG prefix, noun and gender, nameplate of the six kinds, items with NC phrases, tests, criteria; publish freezes; a used version refuses every change; retire keeps it resolvable; company-scoped; cross-tenant test | Met. `equipment_type_version` has no put or remove family (`ops/path.ts:389-396`), so no version changes by construction; retirement is a type-row put that no lookup reads (`seed/definitions.ts:359-366`); `ENTITY_SCOPE` is company for both (`schemas/entities.ts`); cross-tenant test `company-types.integration.test.ts:237` | `ops/apply.ts:789-892` |
| 14.6 AC2: every lookup resolves through the context; replay byte-equal with company types on both layers; seeded types as before | Met. `applyOp` builds the context from the state (`definitionContextOf`); `replay`, `materializeEntity`, the device commit (`db/commit.ts:77`) and the api (`sync/apply.ts:532-537`) add the version rows of the types an op meets (`definitionTypeIdsOf`, `withDefinitionRows`). The remaining `findDefinition`/`getDefinition` calls in `apps/` and `packages/domain/src` are seed-only, or throw/answer null on a `type:` key by design (`relatorio/conclusion.ts:46-50`). Replay tests on Dexie (`apps/web/src/db/company-types.test.ts:33-51`) and Drizzle (`company-types.integration.test.ts:128-150`) | `seed/definitions.ts:276-412` |
| 14.6 AC3: four grammars or the measurement table; `compareCriterion` implements `>=`, `<=`, `between`, `±`, `pass_fail`; a criterion without a source is refused | Met in the kernel function (`seed/criteria.ts:137-167`) and the schema (`types/definition.ts:73-90`); but `pass_fail` judges no reading of any grammar (N1) | |
| 14.6 AC4: conclusion suggestion, conclusion text, captions, TAG, template totals and the print group from the type's data in the kernel | Met (`relatorio/conclusion.ts:417-421` noun and gender; `relatorio/tag.ts:34-39`; `print/group-for-print.ts:329-334`; `templates/compose.ts`); web keeps a few small derivations (N2) | |
| 14.6 AC5: the snapshot carries every referenced version | Met; optional and absent with no company block (`schemas/snapshot.ts:69-107`), both adapters load the company's version rows (`apps/api/src/sync/snapshot.ts:45-47`, `apps/web/src/db/snapshot.ts:27-29`) | |
| 14.6 DoD: contract bump and MIN decision in the PR; touched durability specs on the matrix | Met (PR body; `contract/version.ts`) | |
| 14.7 AC1: list of library types read-only with Duplicar, company types with status and version, reached only from Templates | Met in code (`surfaces/templates/type-list.tsx`); walked in pass 2 | |
| 14.7 AC2: Duplicar opens a draft, every part editable, autosave as ops, inline kernel issues, preview | Met in code (`type-editor.tsx:110-121`, `types/validate.ts`); narrowings listed in the PR (no column editing, preview is markup) | |
| 14.7 AC3: Publicar freezes; a later edit opens N+1; Aposentar confirms, hides, keeps blocks working | Met in code (`type-editor.tsx:127-148`, `seed/definitions.ts:401-412`) | |
| 14.7 AC4 (rename): new name after publish, earlier relatórios keep the version's name, print follows, TAG prefix unchanged | Met in code (`blockTypeLabelIn` with the block's `type_version`, `use-ficha-data.ts`, `print/section-9.ts:346`) | |
| 14.7 DoD: Playwright spec copies, publishes, edits to v2 and retires, at 768 and 1280 px | Partly: 14.7-E2E-001 runs the whole flow at 1280 only; 14.7-E2E-002 at 768 runs only the discard (S3) | `e2e/type-editor.spec.ts:65`, `:257` |
| 14.8 AC1: palettes offer published non-retired types after the seeded ones, stepper and TAG; template records `type_version`; retired not offered | Met in code (`offeredTypes`, `block-palette.tsx`, `block-palette-field.tsx`) | |
| 14.8 AC2: the company sheet with bulk actions, criteria evaluation, suggested conclusion and text, Não ensaiado, photos and points, offline | Met in kernel code and kernel tests; no e2e on a company sheet exercises bulk actions, Não ensaiado, photos, points or the conclusion text (S3); walked in pass 2 | |
| 14.8 AC3: an edited type leaves an existing relatório on its version; a new one takes the new version | Met (`relatorio/instantiate.ts:122-141`; nothing upgrades a block); e2e `company-type.durability.spec.ts:108` | |
| 14.8 AC4: section 9 under "Outros equipamentos" after Transformadores; Sumário and pre-issue count it | Met in code (`print/group-for-print.ts`, `relatorio/sheet-state.ts` `isEquipmentBlock`, `relatorio/pre-issue.ts:420`); DOCX read in the e2e | |
| 14.8 DoD (2026-10-09 re-slice): duplicate the CTA, change one criterion and one item, publish, template, fill offline, generate; an earlier CTA relatório unchanged | Met (`company-type.durability.spec.ts:108`, in `SERIAL_SPECS`) | |

### Contract 33, old seeds and goldens

- **Contract 33, MIN 33** (`contract/version.ts`): one bump after wave B's 32; the families, the `type:` block type and `equipment_types` cannot be parsed by a 32 bundle, so MIN follows. The api test `company-types.integration.test.ts:267` asserts a 32 pull answers 426 and its push is still accepted.
- **Old seeds and goldens**: no file under `packages/domain/src/seed/v*.ts` and no fixture changed (the only fixture is the new `fixtures/company-types/op-log.ts`). `blockConfigSchema` moved its closed key checks from `z.partialRecord` and `z.array(itemKeySchema)` into `checkConfigKeys` (`schemas/block-config.ts:313-327`): the same configs pass and fail, and `type_version` is optional and never defaulted, so a seeded config parses to the same bytes. `equipment_types` is spread only when non-empty (`schemas/snapshot.ts:240`, `:407-411`). Bruno's v5 relatório holds no company block, so every reader takes the seeded branch it took before.

### Tenant isolation (api)

Every query that reads a company type is scoped by `company_id`:

- the fold's version rows: `typeVersionRows` (`apps/api/src/sync/apply.ts:459-464`), loaded for the type ids of a block create, a config put or a sheet write; a block naming another company's type finds no version row and is refused `op_invalid` (`ops/apply.ts:865-876`);
- the target rows `targetsOf` names (`sync/apply.ts:520-528`), and the reference check of `equipment_type_version.type_id` (`ops/targets.ts:138-141`, `op_target_missing`);
- the snapshot (`sync/snapshot.ts:28-48`) and the reading jobs (`jobs/reading/kinds/shared.ts:63-76`);
- the pull: both entities are company-scope ops of the company stream.

A template naming another company's `type:{id}` is accepted structurally (a PR narrowing) and instantiates nothing on the other company (no version row resolves), so it reveals nothing. No finding.

### Findings of pass 1

The findings are written once, in the Findings section below:

- **Pass 1 (code read):** S1, S2, S3 and N1 to N9, so 3 should-fix and 9 notes. S3 predicted the verification gap that B1 fell through.
- **Pass 2 (behavior):** B1 and B2 (B1's full call-site list was then traced in the code), S4 and N10 to N13. S1 was also confirmed in the browser and in the PDF.

## Pass 2: behavior (browser)

| AC | Viewport | Result | Evidence |
|---|---|---|---|
| 14.7 AC1: library types read-only with Duplicar; company types with status and version; reached only from Templates | 1280, 390 | Pass. 11 library types (v12) with Duplicar only. "QGBT da empresa · Publicado · versão 1", then "versão 2", then retired. No field surface links to `/templates/tipos`. At 390 the company row's actions overflow by 12 px (S4) | 01, 11 |
| 14.7 AC2: Duplicar, edit every part, autosave as ops, inline issues, preview | 1280, 768, 390 | Pass with B2. Duplicar opens the draft "Quadro elétrico (QGBT/QD) (cópia)". A TAG prefix "QD-X" shows its sentence inline and "1 aviso antes de publicar: Identificação › prefixo da TAG" with "Publicar" disabled. The preview renders the plate, 17 items and the test. **A name typed and followed by a tap on another tab is not saved (B2)**; the same edit followed by Tab is saved. At 390 the editor tabs fit, but the preview of the CTA copy scrolls the page to 676 px (N12) | 02, 03, 13 |
| 14.7 AC3: Publicar freezes, a later edit opens N+1, Aposentar confirms, hides, keeps blocks working | 1280, 768, 390 (dialog) | Pass. v1 published ("Nada a publicar…", "Publicar versão 2" disabled). An edit opened "Editando o rascunho da versão 2". v2 published. Aposentar asked "Aposentar Quadro de baixa tensao?" and the type left the field palette, while R1's and R2's blocks still open and print | 09, 12 |
| 14.7 AC4 (rename): new relatórios show the new name, earlier ones the old; print follows; TAG prefix unchanged | 1280, 390 | Pass. R1's sheet stays "QGBT da empresa" with "Aceitável >400 MΩ". R2, created after v2, is "Quadro de baixa tensao" with "Aceitável >=0,5 MΩ" (N10 for ">="). The TAG prefix QG is unchanged | 10 |
| 14.8 AC1: palettes offer the type after the seeded ones with stepper and TAG; template records `type_version`; retired not offered | 1280, 768 (dialog) | Pass. The composer's "Outros equipamentos" lists "QGBT da empresa · 17 itens · até 1 ensaio", and once placed "· versão 1". The node shows "QGBT da empresa · versão 1". The field palette lists it last with "QG-ENEL-2" and creates the block. After Aposentar it is gone from the field palette. The company stepper's group is named "Quadros elétricos, 0" like the library type's (N13) | 04, 07 |
| 14.8 AC2: the company sheet with bulk actions, evaluation, suggested conclusion and text, Não ensaiado, photos and points | 1280, 768 (dialog) | **Fail on bulk actions (B1).** The rest passes: NC chips from the definition; a photo with the caption "Detalhe da verificação de limpeza interna e externa realizada no quadro elétrico QG-ENEL…"; a point; readings judged ("Abaixo do aceitável (>400 MΩ)"); the floor "Reprovado · Com restrições" with Aprovado disabled; the composed text "O quadro elétrico QG-ENEL (380 V) apresentou…"; "Concluir e avançar"; Não ensaiado "Equipamento inacessível" on QG-ENEL-2 | 05, 06, 08 |
| 14.8 AC3: R1 keeps its version after v2; R2 takes v2 | 1280, 390 | Pass. Dexie holds R1's two blocks at `type_version` 1 and R2's at 2 | browser read |
| 14.8 AC4: the generated document prints company sheets; Sumário and pre-issue count them | PDF | Pass. Page 18 prints "QGBT/QD's QG-ENEL" with the plate, the 17 items (item 1 NC with its observation), the insulation table, observations, the conclusion marks and Imagem 1. Page 19 prints QG-ENEL-2 "NÃO ENSAIADO — Equipamento inacessível". Section 9 lists the point, the derived out-of-criterion entry and the not-tested entry. Section 10 says "Não apto … 96 fichas … 1 ficha foi reprovada … (QG-ENEL)". The Sumário says "0 de 95". R1's Cubículo Enel is not grouped by type, so the sheet prints inside its local, which is right for that template; the "Outros equipamentos after Transformadores" group is covered by 14.8-E2E-001 | `r1-preview.pdf`, `r1-p18-018.png` |
| Tenant isolation | 390 | Pass. As `b@teste.local`: "Da empresa (0)"; `/templates/tipos/<A's id>` says "Este tipo não está neste aparelho"; B's `/api/sync/company` carries no `equipment_type` op, where A's carries 11 | browser; curl |
| Contract 33 | api | Pass. A pull with `x-contract-version: 32` answers 426 | curl |
| The deferred medium (S2) | n/a | Not walked: it needs two devices and an offline publish | n/a |

## Findings

### Blockers

**B1. On a company sheet, the web hands company blocks to kernel helpers without the definition context, so they read no definition: the bulk "Marcar os restantes como Conforme" is dead, and the plate and display reading suggestions are hidden.**

- **Where.** Each helper takes `ctx: DefinitionContext = EMPTY_DEFINITION_CONTEXT` and answers empty for a `type:` block without it. Call sites that leave it out:
  - `apps/web/src/surfaces/ficha/checklist-section.tsx:120` and `:131`: `checklistUnsetItems(block)`, so `unset` is 0 and `markRest` writes nothing;
  - `checklist-section.tsx:146`: `repeatChecklistPattern(from, fresh)` ("Repetir da ficha anterior" copies nothing);
  - `nameplate-suggestions.tsx:187`, `:189`, `:260`, `:262`: `nameplateSuggestions`, `suggestionGroupCounts` and `confirmAllCandidates`, so a plate photo's suggestions never list, and their banner count and "Confirmar todos" are empty;
  - `ficha-surface.tsx:152`: `suggestionGroupCounts`;
  - `read-display.tsx:183`: `measurementSuggestions`, so "Ler visor" suggestions on a company test never show;
  - `apps/web/src/db/suggestion-store.ts:128` and `:137`: `measurementSuggestions` and `suggestionFieldDef`, on the accept path;
  - `nameplate-section.tsx:192`: `selvNoticeFieldOf`, so the SELV/PELV notice is missing on a Quadro elétrico copy;
  - `ficha-fields.tsx:715`: `nameplateWordRecents`;
  - inside the kernel, `packages/domain/src/merge/conflicts.ts:731`: `conflictValueText(cell, side.value, block)` without its `ctx`.
- **Seen:** on R1's QG-ENEL with 17 unanswered items, "Marcar os restantes como Conforme" is disabled with "Todos os itens já estão marcados" (`06-qgbt-copy-sheet-1280.png`, the head of Verificações gerais). A seeded sheet resolves its definition without a context, so its bulk action is unaffected.
- **Why the gate missed it:** no e2e on a company sheet touches the bulk action or a reading suggestion (S3). The api test `job.integration.test.ts` proves only that the server builds plate suggestions for a company block; the screen that lists them was never exercised. ECH-1 of the batch review found the same class at `use-ficha-actions.ts:172`; only that call was patched.
- **Proposed fix:**
  - pass `snapshotDefinitionContext(snapshot)` (or `useDefinitionContext()`) at every call site above;
  - in the kernel, make the context argument required on every helper that can meet a block, removing the `= EMPTY_DEFINITION_CONTEXT` defaults, so `static` finds the next omission;
  - add an e2e step on a company sheet: "Marcar os restantes como Conforme", "Repetir", a plate photo whose fake suggestions list, and "Confirmar todos".

**B2. An edit typed in the type editor is lost when the user taps another tab.**

- **Where:**
  - `apps/web/src/surfaces/templates/type-editor-parts.tsx:104-130`: `TextInput` commits only `onBlur` (or Enter);
  - `type-editor.tsx:172-180`: the React Aria `Tabs` switch the panel on press, which unmounts the focused input before a blur reaches React, so `leave()` never runs.
- **Seen, twice:**
  1. In "Identificação" I typed the name "QGBT da empresa", then tapped "Critérios": the head kept "Quadro elétrico (QGBT/QD) (cópia)".
  2. After a reload, the field held the old name. I repeated it with real keystrokes (click, select all, type), tapped "Critérios" and returned: the old name again.
  3. The same edit followed by the Tab key was saved at once.

  A value changed in Critérios and followed directly by "Publicar versão 1" was published (the button takes focus first), so the loss is specific to the tab change.
- **Why it matters:** the editor is six tabs, and "type, then tap the next tab" is its main gesture, also on a tablet. Story 14.7 AC2 says each edit autosaves.
- **Why the gate missed it:** `e2e/support/company-type.ts` `typeInto` blurs (or presses Enter) before the next action.
- **Proposed fix:** commit on change with the outbox coalescing it (AD-3's note already says the draft is written whole and coalesced), or commit the focused field in `onSelectionChange` before switching. Add an e2e that types and then taps another tab.

### Should-fix

**S1. "Duplicar" of a seeded type with plate-picked criteria changes the verdict silently: a Quadro elétrico copy judges insulation at > 400 MΩ, a TC or TP copy judges every accuracy class at ± 0,5 %.**

- **Where:**
  - `packages/domain/src/types/duplicate.ts:79-86` deletes `criterion_bands` and `criterion_class_field` and materializes the seed's base criterion (`:57-70`, `SEEDED_CRITERIA`);
  - `seed/criteria.ts:47-77`: the base rows are `isolacao` "> 400 MΩ" and `relacao_transformacao` "± 0,5 %", both sourced "aceitável na ficha";
  - what the copy loses: the Quadro elétrico's NBR 5410 bands (`seed/v6.ts:142-150`: ≥ 0,25 MΩ SELV/PELV, ≥ 0,5 MΩ up to 500 V, ≥ 1,0 MΩ up to 1000 V), and the TC/TP class tolerance of seed v12 (`seed/v12.ts:92`, Story 22.9 and fix batch e22g: 5P ± 1 %, 10P ± 3 %, 3P ± 3 %, 6P ± 6 %, measurement classes at their own value).
- **Scenario:** the office wants the Quadro elétrico named "QGBT". AD-21 item 7 allows that only through "Duplicar". It duplicates, renames, publishes without opening Critérios, and places the copy. In the field FASE A of a 380 V board reads 50 MΩ:
  - the library type: ≥ 0,5 MΩ, Conforme;
  - the copy: "Abaixo do aceitável (>400 MΩ)", so the 22.4 floor forces Reprovado · Com restrições (the technician cannot pick a looser pair), 22.5 adds a point of attention and 22.6 makes the relatório Não apto.

  **Seen end to end:**
  - I duplicated the Quadro elétrico, renamed it "QGBT da empresa" and published it untouched;
  - its Critérios tab shows "maior que 400 MΩ · aceitável na ficha" (`02-qgbt-copy-criterios-1280.png`);
  - on a 380 V board, readings of 50, 60, 55 and 45 MΩ each read "Abaixo do aceitável (>400 MΩ)", the floor disabled Aprovado, and the composed text says "critério: >400 MΩ, aceitável na ficha";
  - the PDF prints ACEITÁVEL ">400 MΩ", REPROVADO · COM RESTRIÇÕES, and section 10 "Não apto" (`r1.txt` lines 662 and 4711-4715).

  The library type would have judged all four readings Conforme (≥ 0,5 MΩ up to 500 V).

  A TC copy of a 10P protection TC reading 2 % fails where the library TC passes. A 0,3 TC copy reading 0,4 % passes where the library TC fails: a false approval.
- **Stated?** Only in the PR body ("Narrowings") and the cross-batch merge comment. It is not in `epics.md` under 14.6, not in `source-deltas.md`, and the editor shows no notice on such a copy. Its Critérios tab shows "> 400 MΩ · aceitável na ficha", with nothing to say that the library type judged otherwise.
- **Why the gate missed it:** `company-types.test.ts:608-624` asserts the strip and that an edited row judges, which is the intent. No test compares a copy's verdict with its source's verdict on the same readings.
- **Proposed fix (a decision for Matheus):**
  - (a) carry `criterion_bands` and `criterion_class_field` into `companyTypeDefinitionSchema` as data: the kernel already evaluates them (`reading-evaluation.ts:108-130`, `effectiveCriterion`). The Critérios tab shows the bands and classes read-only, and editing a band's value becomes a later story;
  - (b) or, at the least: materialize the band's own NBR 5410 row (for example ≥ 1,0 MΩ, source NBR 5410) instead of > 400 MΩ; show a banner on a copy whose source picked its criterion from the plate ("A biblioteca escolhia o critério pela classe de exatidão; a cópia usa um critério único: confira a aba Critérios"); and add a kernel test that a copy published untouched gives the same verdicts as its source on the source's own fixtures.

  In both cases, write the narrowing as a dated line under Story 14.6 and as a `source-deltas.md` row.

**S2. Confirmed: a block names its company type version by number, so after a refused publish the losing device's blocks are lost or silently re-bound to the winning device's definition (the batch's deferred medium).**

- **Where:**
  - `seed/definitions.ts:359-366`: `findDefinitionIn` keys `{type_id}@{version}`;
  - `ops/apply.ts:865-876` (`assertCompanyBlockCreate`) and `:801-815` (`assertVersionCreate`);
  - `seed/definitions.ts:381-388` and `:401-412`: `latestTypeVersion` and `offeredTypes` read the device's own unconfirmed version row;
  - `apps/web/src/db/type-store.ts:49-74`;
  - `relatorio/instantiate.ts:122-125`.
- **Scenario (two devices, type T at version 1 on both):**
  1. Device Z publishes v2, Dz: the insulation minimum raised to 1000 MΩ. It syncs, and the server holds `latest_version` 2.
  2. Device Y is offline and has not pulled. It publishes its own v2, Dy, which adds a measurement test `medicao_2`. Y's fold accepts it (`latest_version` 1 locally), so Y's palette offers T at v2, which is Dy.
  3. On Y, the technician adds a block B of T (`type_version: 2`, `sub_blocks` from Dy) to an open relatório and fills it.
  4. Y syncs. The server refuses the version create (2 is not 2 + 1) and the op goes dead. Then:
     - **Outcome 1, Dy changed parts.** B's create is checked against Dz, the server's T@2. `medicao_2` is not a sub-block of Dz, so B is refused `op_invalid`, and every sheet op of B lands on a missing block. The whole filled sheet is lost. The device shows only the refusal count.
     - **Outcome 2, Dy changed only values, labels or items present in both.** B is accepted bound to Dz. Sheet writes whose keys exist in Dz apply; the others are refused. After the pull Y's context holds only Dz at T@2 (`buildContext` keeps one row per number), so B now shows and prints Dz's name and criteria (1000 MΩ) under readings the technician typed while seeing Dy's.
  5. Y's draft stays open and it publishes again as v3, but B is never upgraded (AD-21 item 5).
- **Likelihood and impact:** this needs two users publishing the same type while one is offline, and a block created on the losing device before its next pull. That is rare in a small office, but the loss is a whole sheet with no clear message (outcome 1), or a wrong verdict (outcome 2).
- **Proposed fix:**
  - (a) without a contract change: on the device, `offeredTypes`, `latestTypeVersion` and the instantiation take only version rows the server has acknowledged (pulled, or acked in the outbox), so a block is never born on an unconfirmed publish. The editor says "Versão N publicada neste aparelho; disponível nas fichas após sincronizar";
  - (b) with contract 34: the config also records the version row's id (`type_version_id`), the server refuses a block whose id differs from its own T@N row, and the refusal names the cause.

  Add the two-device test the spec deferred, with a block created at the refused number.

**S3. Verification gaps against the DoD and the "nothing ships untested" rule.**

- **Where:**
  - `e2e/type-editor.spec.ts:257`: at 768 px only the discard of a never-published copy runs. The 14.7 DoD asks for copy, publish, v2 and retire at 768 and 1280;
  - `e2e/company-type.durability.spec.ts:108`: the company sheet is filled with one item and one reading. Story 14.8 AC2 lists bulk actions ("Confirmar todos"), criteria evaluation, the suggested conclusion and its text, Não ensaiado, photos and points on a company sheet. These have kernel tests only (`company-types.test.ts`, photos, parecer and pre-issue), and AGENTS.md asks that a feature with a front end runs through Playwright as a human would, covering the whole feature.
- **Scenario:** a regression in, for example, `use-ficha-actions.ts:170` (where the review's ECH-1 already found a missing context) or in the Não ensaiado dialog's company path would pass the gate.
- **What it let through:** B1 (bulk actions and reading suggestions dead on a company sheet) and B2 (an edit lost on a tab tap).
- **Proposed fix:** parametrize 14.7-E2E-001 over 768 and 1280. Extend 14.8-E2E-001, or add a 14.8-E2E-002, with "Marcar os restantes como Conforme" and "Repetir" on the copy's checklist, a plate photo whose fake suggestions list and confirm, a photo on an NC item, a point, the suggested conclusion confirmed with its text, and a second block marked Não ensaiado; assert the DOCX prints each.

**S4. At 390 px the Tipos de equipamento list scrolls sideways.**

- **Where:** `apps/web/src/surfaces/templates/type-list.tsx:118-150`. A published company row has three text buttons in `.rr-actions` (Editar · Duplicar · Aposentar), which end at x = 403 on a 390 px viewport. `document.scrollWidth` is 402.
- **Seen:** `11-tipos-list-overflow-390.png`.
- **Why it matters:** the mock-container rule (AGENTS.md) asks the real-browser pass to check 390 px, and a page that scrolls sideways is a layout defect.
- **Proposed fix:** below 768 px, wrap `.rr-actions` under the row text, or fold Duplicar and Aposentar into the row's overflow menu as other registry rows do. Assert `scrollWidth <= innerWidth` at 390 in 14.7-E2E-002.

### Notes

**N1. `pass_fail` (and `±` on a choice row) judges no reading of any grammar.**

- **Where:**
  - `relatorio/measurement-evaluation.ts:471`: `applyAbsolute` skips every cell that is not a number;
  - `types/definition.ts:192-199`: `criterionRulesFor` offers `pass_fail` only where every use is a choice cell, and refuses it on readings and number cells;
  - the editor makes number rows only (`types/draft-edit.ts:281-292`, `:356-369`).

  So "aprovado ou reprovado" is never offered on a real row. If it is reached (a choice row of a duplicated table under an absolute criterion), it marks nothing: `compareCriterion`'s `pass_fail` branch (`seed/criteria.ts:142`) runs only in kernel tests.
- **Proposed fix:** either evaluate `pass_fail` on choice cells (a stated option key passes), or drop it, and `±` for choice uses, from `criterionRulesFor` until a grammar judges it. Record the AC3 reading.

**N2. Small derivations in `apps/web` that belong to the kernel (AD-13 spirit).**

- `type-editor.tsx:90` and `type-list.tsx:108` read `ctx.versions.get(`${type.id}@${type.latest_version}`)`, the kernel's private key format;
- `block-palette.tsx:90` slices `'type:'` by hand (the kernel's `companyTypeIdOf` exists; `types/list.ts:242` and `:256` do the same inside the kernel);
- `type-editor.tsx:152` computes `type.latest_version + 1` for the banner;
- `template-composer.tsx` builds the "version each type's placements record" map;
- `type-editor-parts.tsx:199` and `:421` apply the NC-phrase limit in the view.

None derives a sheet status or count, so this is not a violation of the rule as written. Each is a one-line kernel helper (`latestVersionRow(ctx, typeId)`, `nextTypeVersion(type)`, `recordedTypeVersions(blocks)`).

**N3. A published version is parsed with today's strict schema on every read, so a later tightening of that schema would unpublish history.**

- **Where:** `schemas/entities.ts:303-310`: `equipmentTypeVersionRowSchema.definition` is `companyTypeDefinitionSchema`, the same schema `criterionRulesFor`'s pairing rule was added to during the batch review.
- **Scenario:** a future contract adds a rule. A version published before it no longer parses: `db/type-store.ts:57-60` drops it silently, its blocks stop resolving, and `use-ficha-data.ts` (`getDefinitionIn`) throws on the ficha.
- **Proposed fix:** store versions under a frozen shape (or the loose draft shape), and apply the strict rules only in `applyOp`'s version create (AD-21 item 9 already puts the check there).

**N4. `instantiateTemplate` silently leaves out a company block whose version does not resolve on the device** (`relatorio/instantiate.ts:311`). A new relatório is created missing that equipment, with no sentence. This is rare (AD-24 pulls the company stream first). Proposed fix: return the omission so "Novo relatório" can say it.

**N5. `published_by` in a version row is client-written and not bound to the pushing actor** (`schemas/entities.ts:308`; `sync/apply.ts` checks only `op.actor_id`). It is display-only today. Bind it on the server if a screen or the print ever shows it.

**N6. The instrument picker's "last used" order ignores company measurement tests** (`apps/web/src/surfaces/ficha/instrument-picker.tsx:91`, `lastInstrumentIdFor(blocks, kind)` without the context). It is ordering only.

**N7. The api's `toSnapshot` loads every version row of the company for every snapshot and generate** (`apps/api/src/sync/snapshot.ts:45-47`), and `buildSnapshot` keeps the referenced ones. This is fine at today's scale. Filter by the referenced type ids when a company holds many versions.

**N8. Gate observation (not a code finding).**

- **What:** the integrated gate's `test:api` ran against `fasor-api-1`, which had been up 5 hours. It was started before #273 (e22g) and #274 merged, so it served contract 32 code without the `equipment_type` families.
- **Its reds, all from that stale server:**
  - test:api, 12: every route test of `company-types.integration.test.ts` answered `op_path_unknown`; the contract 33 skew test; and the two e22g S4 `over_range` refusals;
  - `test:e2e:full`, 6: `type-editor`, `company-type.durability`, `seed-v12`, `qgbt-inspecao`, `previous-visit` and `plate-every-type` (tc);
  - the matrix: `company-type.durability` on all three projects.
- **The rerun:** after a restart, all of these were green.
- **Proposed fix:** a gate script restarts `api` (`podman compose restart api`, then waits for `/api/health`) before `test:api`, as the batch spec's machine notes say. Record that step in `epic-batch-orchestrator.md` § 6.

**N10. A company criterion's `>=` and `<=` show as ASCII.**

- **Where:** `formatCriterionValue` (`packages/domain/src/seed/criteria.ts:122`) prints the operator as stored.
- **Seen:** R2's sheet reads "Aceitável >=0,5 MΩ". The measurement grammar's own criteria print "≥" through `OPERATOR_SIGN`.
- **Proposed fix:** map `>=` and `<=` to "≥" and "≤" in `formatCriterionValue`. Seeded criteria use only `>`, `<` and `±`, so no golden moves.

**N11. A company sheet's header carries the pill "Tipo da biblioteca"** (`ficha-surface.tsx:184` passes `library={definition.library === true}`; `asBlockDefinition` sets `library: true` so that the sheet prints in "Outros equipamentos"). The office's own type is labelled as the library's. Proposed fix: no pill, or "Tipo da empresa", for a `type:` block.

**N12. The editor's Pré-visualização of a CTA copy scrolls the page to 676 px at 390** (`type-editor-parts.tsx:713`, `PreviewPanel`'s `.measurement-table`; `13-editor-preview-overflow-390.png`). The other five tabs fit. The phone frame of the editor is an open question in the PR; until it is settled, wrap the preview's tables in a horizontal scroller as the ficha does.

**N13. The composer stepper of a copy has the same accessible name as its source type's.** Both are named "Quadros elétricos, 0", because a copy keeps the noun, and `quantityLabel` names a stepper by its plural noun. A screen-reader user cannot tell the two rows apart, and a test locating `role=group[name="Quadros elétricos, 0"]` meets two. Proposed fix: name a company type's stepper by its label ("QGBT da empresa, 0").

**N9. The narrowings are not yet in the planning documents, and one is missing from the PR list.**

- PR #274 lists its narrowings "for dated lines under the stories". `epics.md` 14.6 to 14.8 carry none yet, and `source-deltas.md` has no row.
- The list also omits that a copy of the transformador de força loses the vector-group composition of a plate reading: `isVectorGroupField` is keyed on `block_type === 'transformador_forca'` (`relatorio/vector-group.ts:270-272`, used at `reading/build.ts:157` and `jobs/reading/kinds/plate.ts:95`).
- Proposed fix: the coordinator writes the dated lines, with S1's decision.

## Open questions for Matheus or Bruno

1. **S1, for Matheus:** should a copy of a seeded type keep the plate-picked criteria as data (the voltage bands, the accuracy class) or carry one editable row? If one row, should Duplicar of the Quadro elétrico, TC and TP say so in the editor? Until this is decided, renaming a library type through Duplicar changes verdicts.
2. **S2, for Matheus:** prevent a block from being born on an unconfirmed publish (device side, no contract change), or record the version row's id (contract 34)?
3. **TAG, open in the PR, for Bruno:** the kernel suggests PREFIX-CODE (seen: "QG-ENEL", "QG-ENEL-2"), while the mock draws "NB-01". Which one stands?
4. **`±` with a nominal value, open in the PR, for Bruno:** and should `pass_fail` stay offered while no grammar judges it (N1)?
5. **The editor's phone frame, open in the PR, for Matheus:** today the list overflows at 390 (S4), and so does the preview of a measurement table (N12).
6. **Hiding library types from the palettes, open in the PR, for Bruno:** after a rename by Duplicar, both the library type and the copy are offered, with the same noun (N13).
7. **For Bruno:** should a company sheet be badged as the company's type, not "Tipo da biblioteca" (N11)?
8. **Bruno's no-break de comando content:** still not given. The e2e uses the CTA copy.

## What this review did not cover

- **S2 in the browser:** it needs two devices, an offline publish and a block created at the refused number. It is confirmed by reading only.
- **The offline fill of a company sheet:** I filled it online. Offline, reload and sync are covered by 14.8-E2E-001 on the three matrix projects (green in the rerun).
- **A DOCX download:** I read the preview PDF. The DOCX table is read by 14.8-E2E-001.
- **Copies of a TC or TP in the browser:** their ± 0,5 % judgement under S1 is from the code (`duplicate.ts:84-85`, `criteria.ts:65-74`) and the kernel test `company-types.test.ts:608-624`.
- **The fake plate reading on a company block:** B1's hidden suggestions are from the code (`nameplateSuggestions` with the empty context answers `[]`). The api side is covered by `job.integration.test.ts`.
- **Bruno's v5 relatório:** checked by reading only. It holds no company block, every reader takes the seeded branch, and no seed file or golden changed. The gate's api goldens were green in the rerun.
