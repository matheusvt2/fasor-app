---
title: 'e23x: the base''s help and recommendation texts through a private import (Story 23.12, decision M-1 (b), no contract)'
type: 'feature'
created: '2026-11-09'
status: 'done'
baseline_revision: '4a0ef642c82707892d490f8b362b149bbb2ac28a'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'medium'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-23-context.md'
warnings: ['batched', 'oversized']
batched_reason: 'One story (23.12) in its own wave 3 batch; marked batched because it runs under the epic batch orchestrator beside e23e.'
deferred:
  - summary: >-
      A company that imported the base never gets texts for tests a later seed adds: held copies are skipped, never updated.
    evidence: |-
      planTestBaseImport lists a held copy (same seeded block type and name, not removed) as already imported and plans nothing for it, so a re-import after a new seed adds no text to its new tests. Updating would overwrite the office's edits; that is a product choice (Matheus). v13 deploys once with e23e's tests, so the first production import already sees termografia and the malha.
    location: >-
      packages/domain/src/types/test-base-import.ts alreadyHeld
    severity: medium
  - summary: >-
      GE-01 (TODOS, termografia) and AT-01/AT-02 have no positive attach assertion until e23e's seed lands.
    evidence: |-
      The kernel test asserts GE-01 attaches iff the seed has termografia; on main fc0aa508 no v13 type has it. Closes when e23x merges e23e and adds the explicit assertions.
    location: >-
      packages/domain/src/types/test-base-import.test.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** Stories 23.10 and 23.11 ship `help` ("Como ensaiar") and `recommendation` on a test definition, but no v13 test carries Bruno's texts, and Matheus's M-1 (b) forbids them in git: the office loads Bruno's rev08 JSON once, through the app, as that company's data.

**Approach:** An office action on Modelos > Tipos de equipamento, "Importar base de ensaios", reads the JSON file in the browser, and a pure kernel planner turns it into company type copies of the v13 seeded types (the "Duplicar" draft, `duplicateSeededType`), one per base equipment and seeded type, with each mapped test's `help` and `recommendation` filled from its base row, published as version 1. It writes only the two existing company-scope ops (`equipment_type/{id}` create, `equipment_type_version/{id}` create): no route, no op family, no schema key, so no contract. Copies stay editable in the type editor afterwards.

## Boundaries & Constraints

**Always:**
- Map rows by base row ID (`TEST_BASE_ROW_TESTS`, the table below) and equipment by base equipment ID (`TEST_BASE_EQUIPMENT_TYPES`); a row attaches only when the mapped test key exists in that seeded type's current-seed definition (`tests` or `measurement_tests`), so e23e's rows (GE-01 `termografia`, AT-01 `resistencia_malha`, AT-02 `continuidade_malha`, type `malha_aterramento`) attach by themselves once its seed lands. Keep the block-type values as strings checked at runtime (`isEquipmentBlockType` + `findDefinition`), so the file compiles before and after e23e merges.
- Texts are kept byte-for-byte as the file has them (no trim, no case change, no truncation). A value that is empty, only whitespace, or only a dash (`—`, `–`, `-`) after trimming is the base's "no value" and is left out. A text over `TEST_TEXT_MAX_LENGTH` is never cut: that heading is left out and its row listed as refused in the preview.
- The import is idempotent and tenant-scoped: a copy is planned only when the company holds no non-removed type with the same `derived_from.block_type` and the same name (`typeNameOf`); otherwise it is listed as "já importado" and nothing is written for it (the office's later edits are never overwritten). Ops are company scope with the signed-in author, like "Duplicar".
- A copy whose draft has `validateTypeDraft` issues is created as a draft only (no version), and the preview says so.
- Derived text (counts, plurals, lists of row IDs) lives in the kernel; static words in `apps/web/src/copy/pt-br.ts` under `copy.types`. No emoji. pt-BR UI copy, English code.
- Tests use a synthetic fixture written for this batch: same shape as rev08, its row and equipment IDs, invented text only.

**Never:**
- Never copy a word of the rev08 JSON's prose (procedures, recommendations, criteria, names, norms, instruments) into a tracked file, a test, a commit message or the PR body. Row IDs (DJ-02, ...) and equipment IDs (DJ, TR-OL, ...) may appear.
- No seed change, no `V13_HASH` change, no print change: no section of the document reads `help`; the layout-lock-v5/v11/v12 and Porto Seguro goldens stay byte-equal. If one would move, stop.
- No api route, no new op family, no new schema key, no `CONTRACT_VERSION` bump. If one turns out necessary, stop and report.
- No company "help table" overlaying the seeded library types (not built by 23.10/23.11; would need a contract).
- Do not edit `sprint-status.yaml` or `epics.md`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First import | Synthetic fixture, company has no imported copies | Preview lists N copies and M tests with texts; on confirm, N `equipment_type` creates + N version creates in one commit; toast with the count | none |
| Re-import | Same file after the first import synced | Preview says every type is already imported; confirm is absent or disabled; zero ops written | none |
| Partial re-import | One copy discarded (`removed_at`) or renamed | Only that copy is planned again | none |
| Unmapped rows | CM-*, CP-*, TR-OL-03, DJ-04, ... | Listed by row ID as "sem ensaio no app"; no copy for an equipment with no attached row | none |
| TODOS row | GE-01 | Attached to `termografia` on every planned copy whose definition has it; unattached before e23e merges | none |
| Placeholder | A column holding only "—" | That heading is absent (meta shows "N de 8") | none |
| Over cap | A text longer than 1000 code units | That heading absent; row listed as refused in the preview | never truncated |
| Not a base | Invalid JSON, or missing `ensaios` array of rows with `id` | Nothing written; an error line under the action | `role="alert"` text |
| Other company | Company B after A imported | B's plan is full (B never sees A's copies); A's pull never carries B's | server scoping |

</intent-contract>

## Code Map

- `packages/domain/src/seed/test-help.ts` -- `testHelpSchema`, `TEST_HELP_KEYS` (objective, instrument, voltage, connections, procedure, criterion, standard, nr10), `TEST_TEXT_MAX_LENGTH` = 1000, `testRecommendationSchema`. Reuse for validation.
- `packages/domain/src/types/duplicate.ts:79` -- `duplicateSeededType(seedVersion, blockType)`: the copy draft (label + " (cópia)", tests carried whole); `newEquipmentTypeRow`, `typeVersionRow`, `nextTypeVersion`. The import starts from it and replaces the label.
- `packages/domain/src/types/list.ts:32` -- `typeNameOf` (the idempotency name); `packages/domain/src/types/validate.ts` -- `validateTypeDraft`.
- `packages/domain/src/seed/definitions.ts` -- `SEED_VERSION` ('v13'), `findDefinition`, `DefinitionContext` (`ctx.types`, `ctx.versions`).
- `packages/domain/src/schemas/block-config.ts` -- `EQUIPMENT_BLOCK_TYPES`, `isEquipmentBlockType`, `companyBlockType`.
- `apps/web/src/surfaces/templates/type-list.tsx` -- `TypeListSection`: the Tipos section, `commit(drafts)`, `duplicate()`; the import action goes in its `section-head`. `type-ops.ts`: `createTypeOp`, `createVersionOp`. `type-editor.tsx:131` shows the publish op shape.
- `apps/web/src/components/index.ts` -- `ConfirmDialog`, `TextButton`; `state/toast.tsx` `showToast`.
- `apps/web/src/copy/pt-br.ts:559` -- `copy.types` (static words).
- `apps/web/src/surfaces/ficha/ficha.css:398-403` -- the "Como ensaiar" list renders `white-space: pre-line`, so a composed criterion may use `\n`.
- `apps/api/src/sync/company-types.integration.test.ts` -- `routeHarness`, `companyA`/`companyB`, `h.clientOp`, `h.push`, pull and snapshot helpers: the pattern for the api test.
- `e2e/test-recommendation.spec.ts` -- the 23.11 flow to copy: a company type block born by office ops (`newEquipmentBlock` with `companyBlockType`, `pushDrafts`), the sheet reading, Pontos `.poa-list` auto card starting with the recommendation, `readStore` for committed state. `e2e/test-help.durability.spec.ts` -- the "Como ensaiar" dialog locators. `e2e/points-derived.spec.ts:85` -- a v13 disjuntor insulation cell address (`cellAddressesOf`). `e2e/support/company-type.ts` -- `openTypeList`, `companyRow`, `typeRows`.
- Base rev08 shape (gitignored `docs/context/Fasor_Base_Ensaios_MT_rev08.json`, read for shape only, by the orchestrator): top keys `versao` (string), `equipamentos[]` `{id, nome, campos[]}`, `ensaios[]` with string fields `id, equipamento, ensaio, grandeza, unidade, obrigatorio, status, aplica_se, objetivo, instrumento, tensao_corrente_ensaio, pontos_medicao, procedimento, criterio_aprovado, criterio_restricao, criterio_reprovado, norma, recomendacao_reprovado` and an object `regra`; also `tabelas`, `normas`, `campos_comuns`, `resultados_possiveis`, `status_legenda`, `pendencias`. `equipamento` of a row is an equipment ID or `TODOS`.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/types/test-base-import.ts` (new) -- (1) `testBaseFileSchema`: zod, loose (unknown keys pass), requiring `ensaios` as an array of objects with string `id` and `equipamento`, every text column optional string; (2) `TEST_BASE_EQUIPMENT_TYPES: Record<string, readonly string[]>` = `TR-OL`, `TR-SE` -> `transformador_forca`; `DJ` -> `disjuntor_mt`; `SC` -> `chave_seccionadora`; `TC` -> `tc`; `TP` -> `tp`; `PR` -> `para_raio`; `CB` -> `cabos_entrada`, `cabos_saida`; `AT` -> `malha_aterramento`; (3) `TEST_BASE_ROW_TESTS: Record<string, string>` = `TR-OL-02`, `TR-SE-02`, `DJ-02`, `SC-02`, `TC-02`, `TP-02`, `PR-02`, `CB-02` -> `isolacao`; `TR-OL-04`, `TR-SE-04`, `TC-03`, `TP-03` -> `relacao_transformacao`; `DJ-03`, `SC-03` -> `resistencia_contato`; `TR-OL-05`, `TR-SE-05` -> `resistencia_enrolamento`; `TR-OL-07`, `DJ-07` -> `coleta_oleo`; `SC-04` -> `resistencia_fusiveis`; `AT-01` -> `resistencia_malha`; `AT-02` -> `continuidade_malha`; `GE-01` -> `termografia` (its `equipamento` is `TODOS`: every planned copy); (4) `testBaseHelpOf(row)`: objective <- `objetivo`, instrument <- `instrumento`, voltage <- `tensao_corrente_ensaio`, connections <- `pontos_medicao`, procedure <- `procedimento`, criterion <- the present ones of `criterio_aprovado`, `criterio_restricao`, `criterio_reprovado` as lines `Aprovado: …`, `Com restrições: …`, `Reprovado: …` joined by `\n`, standard <- `norma`, nr10 left out (no column); `testBaseRecommendationOf(row)` <- `recomendacao_reprovado`; (5) `planTestBaseImport(file, ctx, seedVersion = SEED_VERSION)`: returns `{ copies: { equipmentId, blockType, label, duplicate: TypeDuplicate, publishable: boolean, rows: { rowId, testKey }[] }[], alreadyImported: string[] (labels), unattached: string[] (row IDs), refused: string[] (row IDs) }`; label = `${seededLabel} (${equipmentId})`; (6) derived texts: `testBaseImportPreviewText(plan)`, `testBaseImportedText(n)` (toast), `testBaseInvalidText(reason?)`, with plurals via `text/plural.ts` and every authored sentence marked `// authored (Story 23.12, listed for Bruno)`. Export from `packages/domain/src/index.ts`.
- `packages/domain/fixtures/test-base/base-ensaios-sintetica.json` (new) -- synthetic file with rev08's top-level shape: `versao`, `equipamentos` (the 11 IDs, invented `nome`), and `ensaios` with every row ID listed above plus CM-02, CP-02, TR-OL-03 and DJ-04 (unmapped), every text column filled with invented pt-BR text that names its row (e.g. "Procedimento sintético DJ-02 ..."), TC-02's `tensao_corrente_ensaio` as "—", SC-04's `procedimento` over 1000 code units (neither touches DJ-02, which the e2e reads whole), and a `regra` object on each row. No rev08 prose.
- `packages/domain/src/types/test-base-import.test.ts` (new) -- the matrix rows above at kernel level: each wave 1 row (TR-OL-02, TR-OL-04, TR-SE-02, TR-SE-04, DJ-02, DJ-03, SC-02, SC-03, TC-02, TC-03, TP-02, TP-03, PR-02, CB-02) lands its procedure heading and its recommendation verbatim on the mapped test of its copy; the copy's draft passes `companyTypeDefinitionSchema` and `validateTypeDraft`; re-planning over a ctx holding the published copies plans none; placeholder, over-cap, unmapped, TODOS and invalid-file cases; a row whose test key is absent from the definition is unattached (assert by reading the kernel definition, so it holds before and after e23e). After the e23e merge, add explicit assertions that GE-01 and AT-01/AT-02 attach.
- `apps/web/src/surfaces/templates/type-list.tsx` -- "Importar base de ensaios" `TextButton` (icon `i-book`; the sprite has no upload symbol) in the Tipos `section-head`, a visually hidden `<input type="file" accept="application/json,.json">`; on a file: read text, `JSON.parse`, `planTestBaseImport(..., ctx)`; open `ConfirmDialog` titled "Importar base de ensaios" with `testBaseImportPreviewText(plan)`; confirm (only when the plan has copies) commits ONE batch: per copy `createTypeOp(user, newEquipmentTypeRow(newId(), duplicate))` then, if publishable, `createVersionOp(user, typeVersionRow({ ... version 1 }))`; toast `testBaseImportedText(n)`. An invalid file shows `testBaseInvalidText` in a `role="alert"` `section-note` and writes nothing. Shown wherever the Tipos section already shows (the same role gate as "Duplicar"). At 390 px nothing overflows.
- `apps/web/src/copy/pt-br.ts` -- `copy.types.importBase` ("Importar base de ensaios"), `importConfirm` ("Importar"), and any static word the dialog needs.
- `apps/web/src/surfaces/templates/templates-surface.test.tsx` or a new `type-list-import.test.tsx` -- the action renders, an invalid file shows the alert, a valid one opens the preview.
- `apps/api/src/sync/test-base-import.integration.test.ts` (new) -- through `POST /api/sync/ops`: company A pushes the ops of a plan built from the synthetic fixture (all applied, versions carry the help and recommendation); A's state re-planned gives no copies (idempotent); company B's pull carries none of A's types and B's own plan is full; B's push applies and A's type count is unchanged (tenant-scoped).
- `e2e/test-base-import.spec.ts` (new, `@p0`, parallel group, Empresa B of the worker as `test-recommendation.spec.ts` does) -- at 1280 px: `openTypeList`, `setInputFiles` with the synthetic fixture via the import action's file chooser, the preview dialog text, "Importar", the toast; the copies appear under "Da empresa" and their versions in the store (`typeRows`) carry the fixture's texts (committed state, E12-A6); a second import shows the already-imported preview and writes no op (outbox count unchanged); then a relatório with one sheet of the imported disjuntor copy (office ops, as 23.11-E2E-001), the sheet's insulation "Como ensaiar" dialog lists the fixture's headings (Objetivo, Procedimento, Critério with its three lines) and the meta "7 de 8 tópicos preenchidos"; an insulation reading below the criterion is typed; Pontos' auto entry text starts with the fixture's DJ-02 recommendation and a period. A 390 px check that the Tipos section with the action and the preview dialog do not scroll sideways.
- `docs/kbs/project/test-base.md` -- a dated section: M-1 (b) as built, the import's place, the row map, how to import locally and in production. `docs/kbs/log.md` -- one line.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- a heading "Epic 23 batch e23x" with the rows the orchestrator lists (narrowings, authored texts).

**Acceptance Criteria:**
- Given the synthetic base imported through the Tipos section, when a sheet of the imported disjuntor copy opens and the technician taps "Como ensaiar" on its insulation test, then the dialog shows the base row's headings, and an out-of-criterion reading's derived point starts with the row's recommendation.
- Given the same file imported a second time, when the preview opens, then it says every type is already imported and confirming is not offered; no op is written.
- Given the generated document of any relatório, when it generates, then no help text prints and every layout-lock and Porto Seguro golden is byte-equal (no print code changes; `test:api` goldens green).
- Given company B, when company A imports, then B's types, pulls and plan are unaffected.

## Spec Change Log

## Review Triage Log

### 2026-11-09 — Review pass
- Layers: Edge Case Hunter, Verification Gap. Blind Hunter and Intent Alignment skipped (token economy; the integrated epic review covers them).
- verdicts: 19 findings — high 0, medium 3, low 13, false 0, maybe-false 3
- findings:
  - `[low]` `[patch]` EC1 empty or fully unmapped base previews "Todos os tipos ... já foram importados" — the no-copies branch now distinguishes nothing-attached from all-held; kernel test.
  - `[low]` `[patch]` EC2 a `null` text column refuses the whole file — text columns `.nullish()`, null is no value; kernel test.
  - `[low]` `[reject]` EC3 a row whose ID prefix disagrees with its `equipamento` lands on the other copy — the row's own `equipamento` is the base's statement; not met in a real export; a guard adds a branch.
  - `[low]` `[reject]` EC4 two rows with one ID: the last wins — not met in a real export; dedupe adds a branch.
  - `[low]` `[patch]` EC5 multi-dash placeholders ("--", "——") stored as text — `isNoValue` reads whitespace-and-dashes only; test extended.
  - `[medium]` `[defer]` EC6 a company that imported under an older seed never gets texts for tests a later seed adds (held copies are skipped, never updated) — a text-update path is a product decision (overwrite vs keep office edits); v13 deploys once with e23e's tests, so the first production import sees them.
  - `[low]` `[reject]` EC7 a newline inside a row ID or label splits the preview — not met; IDs are short codes.
  - `[low]` `[patch]` EC8 `file.text()` rejection unhandled — caught, invalid-file alert shown.
  - `[low]` `[reject]` EC9 a very large file read whole — the office picks a JSON on purpose; a size cap adds a branch and a number to decide.
  - `[medium]` `[patch]` EC10 the plan is computed at read time and committed as is; a type list changed under the open preview writes duplicate copies — the parsed file is kept and re-planned on the current ctx at "Importar".
  - `[maybe-false]` `[reject]` EC11 a null commit after the dialog closed is silent — would need the edit queue's failure path read; if true only low (the queue owns its own error report).
  - `[low]` `[reject]` EC12 the api test indexes versionIds by plan position — every fixture copy is publishable, so the index is right; test-only.
  - `[low]` `[patch]` EC13 the tenant pull check passes vacuously when A holds no type — asserts A holds types first.
  - `[low]` `[reject]` EC14 DialogShell instead of ConfirmDialog — ConfirmDialog cannot omit its confirm; the spec allows "absent or disabled"; same shell and classes.
  - `[medium]` `[defer]` EC15 claim "a test a later seed adds attaches by itself" holds only for a company that has not imported yet — same root as EC6, deferred with it.
  - `[maybe-false]` `[patch]` VG1 the preview's refused line and partial "Já importado" line are never asserted — assertions added (pre-verified gap).
  - `[maybe-false]` `[patch]` VG2 no test of an over-cap recommendation or composed criterion — two kernel cases added (pre-verified gap).
  - `[maybe-false]` `[defer]` VG3 GE-01's attach path (TODOS) has no positive assertion until e23e's `termografia` lands — tracked in `deferred-work.md`; closes on the e23e merge.
  - `[low]` `[reject]` VG4 the draft-only path (`publishable === false`) is unreachable with the current seed — defensive; noted, not a gap.

## Design Notes

Why copies and not an overlay: 23.10/23.11 store the texts on a test definition, of a seed or of a company type; a company overlay on seeded types would need an entity and an op family (a contract). The copies are the existing "Duplicar" path, so they judge and print as their source (e22h S1, e23v), and the office edits them in the type editor. Consequence, listed as a narrowing: the texts show on sheets of the imported company types, not on the library's seeded types.

Two copies for the transformer (TR-OL, TR-SE) and for CB (entrada, saída): one test carries one help, and the base has distinct rows per equipment.

Example label set from the synthetic file: "Transformador de força (TR-OL)", "Transformador de força (TR-SE)", "Disjuntor MT (DJ)", "Chave seccionadora (SC)", "TC (TC)", "TP (TP)", "Para-raio (PR)", "Cabos de entrada (CB)", "Cabos de saída (CB)", and after e23e "… (AT)".

## Verification

**Commands (tools container, `--user root`, each gate stage under `lockf -t 20000 /tmp/fasor-verify.lock`):**
- `pnpm test:unit -- packages/domain/src/types/test-base-import.test.ts` -- green
- `pnpm test:api -- src/sync/test-base-import.integration.test.ts` -- green (restart the api container first)
- `pnpm exec tsx scripts/e2e.ts e2e/test-base-import.spec.ts --project desktop-chrome --project durability-desktop-chrome` -- green
- `pnpm lint && pnpm static` -- clean

## Auto Run Result

Status: done

- **Change.** "Importar base de ensaios" on Modelos > Tipos de equipamento reads the base JSON on the device. `planTestBaseImport` (kernel) turns it into company type copies of the v13 seeded types, one per base equipment and seeded type, named "⟨seeded label⟩ (⟨equipment ID⟩)", with each mapped test's `help` and `recommendation` filled. A preview dialog then shows what will be written, and "Importar" re-plans and writes one batch of the existing `equipment_type` and `equipment_type_version` creates (version 1). There is no route, no op family and no contract. Seed, print and goldens are untouched.
- **Files.**
  - `packages/domain/src/types/test-base-import.ts`: the schema, the row and equipment maps, the planner and the derived texts.
  - `packages/domain/fixtures/test-base/base-ensaios-sintetica.json`: synthetic, with rev08 IDs only.
  - `apps/web/src/surfaces/templates/type-list.tsx`: the action, the file input and the preview.
  - `apps/web/src/copy/pt-br.ts`: the static words.
  - Tests: `types/test-base-import.test.ts`, `type-list-import.test.tsx`, `apps/api/src/sync/test-base-import.integration.test.ts` and `e2e/test-base-import.spec.ts`.
  - Docs: `docs/kbs/project/test-base.md`, `docs/kbs/log.md` and `deferred-work.md`.
- **Review.** 19 findings:
  - 8 patched: EC1, EC2, EC5, EC8, EC10, EC13, VG1 and VG2.
  - 3 deferred: EC6 and EC15 (one root), and VG3.
  - 8 rejected, each with its reason in the triage log.
- **Patched counts by verdict.** 0 high, 1 medium (EC10), 7 low or maybe-false. `followup_review_recommended` is false.
- **Verification by the implementer.**
  - Kernel and web: 23 of 23.
  - Api: 3 of 3 for the new file. The api suite before the patches: 944 passed, 6 skipped, goldens unchanged.
  - Lint and static: clean.
  - e2e `test-base-import`: 1 of 1 under the lock.
  - Touched specs `type-editor`, `company-type-sheet` and `test-recommendation`: 10 of 10.
  - The batch gate follows.
- **Residual risks.**
  - The texts show only on the imported copies, not on the library's types (narrowing).
  - Copies held by a company are never updated by a re-import (EC6).
  - GE-01 and AT rows attach only after e23e merges.
