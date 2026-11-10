---
title: 'e23z: the final Epic 23 fixes (W3-1 to W3-7, Bruno 6 and 7, DESLOCAMENTO ANGULAR kept, the eval synthetic set)'
type: 'bugfix'
created: '2026-11-09'
status: 'in-review'
baseline_revision: '45323676fa82706ada3d6297e3b10f20881b2095'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-23-context.md'
warnings: ['batched', 'oversized', 'multiple-goals']
batched_reason: 'The second pass of the Epic 23 wave 3 integrated review (W3-1 to W3-7), Bruno''s 2026-11-09 answers 6 and 7, the DESLOCAMENTO ANGULAR decision and the coordinator''s eval fix: the final fix batch, one gate, one PR, as the coordinator launched it.'
deferred:
  - summary: >-
      A company draft that lost ligacao_secundaria before e23z can still publish a ratio table read by vector group.
    evidence: |-
      removeDraftEntryRefusal guards removals from e23z on; validateTypeDraft raises no issue for a draft already missing the field (e23g's prune). Matheus decides whether publish refuses it.
    location: >-
      packages/domain/src/types/validate.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** The wave 3 code read of `ef099d41` found seven defects (W3-1 to W3-7, `scratchpad/wave3-gate/review-pass2.md`, paraphrased below). Bruno answered on 2026-11-09 that a Reprovado chosen by hand takes the recommendation (Story 23.11) and that a tap reading off the plate can be cleared (Story 23.8). Matheus decided that a company copy may not remove DESLOCAMENTO ANGULAR while its ratio test reads it (the e23g ledger row). The paid eval's synthetic set aborts on one image's key mismatch.

**Approach:** Kernel fixes in `packages/domain` with a failing-first unit test each. Then the editor, sheet and band wiring in `apps/web`, the api eval script, and the Playwright specs those surfaces touch. No new op, route or contract number: every change is an optional key in an existing schema, or a fold acceptance narrower than a write.

## Boundaries & Constraints

**Always:**
- Every item gets a test that fails before its fix.
- AD-1/AD-13: every status, verdict, text and group is the kernel's. New pt-BR strings go in their AGENTS.md home and are marked `// authored (e23z, listed for Bruno)`.
- Seeded types (v1 to v13) print, judge and derive exactly as today. Only company copies that carry `base_block_type`, and v13 `phase_deviation` tests, change.
- The goldens stay byte-equal: `apps/api/src/jobs/generate/golden/**` (layout-lock-v5/v11/v12, Porto Seguro) and `packages/domain/fixtures/porto-seguro/*.golden.json`. Before the PR, `git diff origin/main --name-status -- apps/api/src/jobs/generate/golden packages/domain/fixtures` shows no M line on a golden. If one would move, STOP and report.
- `V13_HASH` stays as it is. No seed data changes, except comments in `seed/v13.ts`.
- `LLM_PROVIDER`/`OCR_PROVIDER` stay `fake`. The repo is public: never copy text from `docs/context/`. Read the base JSON only for row IDs.

**Never:**
- Never take a contract number.
- Never change `print/section-9.ts` layout code for seeded types.
- Never add Bruno's prose.
- Never run Playwright or a gate outside `lockf -t 20000 /tmp/fasor-verify.lock`.
- Never use docker; use `podman compose`, and run the tools container with `--user root`.

## I/O & Edge-Case Matrix

| Item | Input / State | Expected |
|---|---|---|
| W3-1 | v13 transformer: a stored `restricao` point on `resistencia_enrolamento` (Fase C restricted 3 %); later a BT phase goes out by 6 % while Fase C stays restricted | the point is NOT in `resolvedOriginPoints` |
| W3-1 | same, with a cell restricted by the history rule (`applyHistory`) or by a thermography band, then another cell out | not resolved |
| W3-1 | a cell that was restricted is now out, by its band (`phase_deviation` with a restricted band, `bands` with a restricted level) or by the history rule's move | not resolved (`restrictionStands`, as the seeded W2-3) |
| W3-1 | no restricted cell, and no restriction rule flags any cell | resolved, as today |
| W3-2 | v13 transformer, TIPO DE ISOLAÇÃO empty (medium unknown), insulation off, winding AT 10/10/20 Ω | `conclusionFloor` null (no Aprovado · Sem restrições) |
| W3-2 | v13 seccionadora, fuses A = 0, B = 10, C = 10 mΩ | floor null |
| W3-2 | a phase group with one positive cell only | floor null |
| W3-2 | every measured cell judged within | Aprovado · Sem restrições, as today. Also, out and restricted floors still come before the guard |
| W3-3 | relatório grouped by type; company copies (Duplicar or import) of `transformador_forca`, `tc`, `tp`, `cabos_saida` (alimentação), `malha_aterramento` | each prints in its base type's group with that group's pairing (TP/TC pairs, cables before their transformer) and order (Malha last in Outros). Measurement tests unnumbered as the base (no "E1 ·") |
| W3-3 | a copy published before this change (no `base_block_type`), or a new type | "Outros equipamentos", as today |
| W3-3 | `ordem_de_campo`, or a cabine without "Agrupar por tipo" | unchanged |
| W3-4 | copy of the v13 seccionadora (with the base), one fuse out | conclusion clause reads "…fusíveis HH fora do critério…" |
| W3-5 | `seed/v13.ts` comments | no 5-word run matching the base JSON. The TC-02 and GE-01 quotes are paraphrased in English |
| W3-6 | v13 thermography, "Equipamento em carga" Não, "Aplicar este ensaio" tapped | the applied band's button and its toast name no plate. The NA band's sub-line drops "Pela placa." for a value condition |
| W3-6 | plate condition (seccionadora fuses) | "Seguir a placa", as today |
| W3-7 | import of a base whose TR-OL-03 / TR-SE-03 rows exist | those rows attach to `isolacao` as its IP row: the test gains `index_recommendation` from that row. They are no longer listed "Sem ensaio no app" |
| W3-7 | an imported TR-SE copy, IP out of class, every 1-minute reading within | the derived point starts with `index_recommendation` |
| W3-7 | IP out and a reading out | `recommendation`, then `index_recommendation` when different (each once) |
| item 2 | engineer concludes Reprovado by hand (floor not Reprovado) on a sheet whose in-force tests carry recommendations | the `reprovado` entry text = those recommendations (only the restricted tests' when any test is restricted, else all in-force tests'), distinct, in definition order, each terminated, then the existing text ("Concluído como Reprovado na ficha" or the observation) |
| item 2 | no in-force test carries a recommendation (every seeded type) | text byte-equal to today |
| item 3 | v13 TTR, a tap with a reading dropped from TAPS (row "Fora da placa") | the row shows "Apagar leitura". Tapping it writes `put null` on each filled cell of the row, with "Desfazer". The fold accepts null puts and removes on that row. The row leaves the table |
| item 3 | a non-null put on an off-plate row | refused by the fold, as today |
| item 4 | company copy draft with a table `ratio_factor: 'vector_group'`; Remover on its `ligacao_secundaria` field | draft unchanged; a toast gives the kernel's reason |
| item 4 | the ratio test removed first, or a type with no such table | removal works as today |
| item 6 | `bedrock-eval.ts` synthetic set | the oil plate is scored on `seed_version: 'v12'`. A sample whose expected keys miss its seed's fields is skipped with one logged line, and the others run. No AWS call in tests |

</intent-contract>

## Code Map

- `packages/domain/src/points/derived.ts`:
  - `sheetEntries` :206-213, where `standing` is filled;
  - the `restricao` measurement loop :229;
  - the `reprovado` entry :242-252;
  - the reading entry's `recommendedPointText` :187-191.
  - W3-1, W3-7 and item 2.
- `packages/domain/src/relatorio/measurement-evaluation.ts`:
  - `MeasurementTestEvaluation` :278;
  - `applyPhaseDeviation` :720;
  - `applyBands` :772;
  - `applyHistory` :887, which runs only on `within`;
  - `evaluate` :1080-1180, with the criteria loop and `named`;
  - `measurementTestsUnnumbered` :854;
  - `restrictedMeasurements` :1366.
  - Add optional `restrictionStands?: true` and `unjudged?: true`, absent on v1 to v12.
- `packages/domain/src/relatorio/conclusion.ts`:
  - `computeFloor` :163; put the new guard beside the Q-3 `toCheck` guard :188;
  - `measurementClause` keepCase :492.
- `packages/domain/src/relatorio/restriction.ts` :117-170 -- the seeded W2-3 pattern to mirror.
- `packages/domain/src/print/group-for-print.ts`:
  - `byType` :324, the company short-circuit :342;
  - `tpTcPairs` :244, `afterFullQuadros` :296, `malhasLast` :311;
  - `byTypeRuns` :391 (cabineTransformers);
  - `GroupSnapshot` :100, which gains `equipment_types`.
  - Callers: `print/section-9.ts:1460`, `print/photo-order.ts:103`.
- `packages/domain/src/types/definition.ts` -- `companyTypeDefinitionShape` :273, `companyTypeVersionDefinitionSchema` :312 and `companyTypeDraftSchema` each gain `base_block_type` (an `equipmentBlockTypeSchema` value, optional).
- `packages/domain/src/types/duplicate.ts`:
  - `duplicateSeededDefinition` :90 sets `base_block_type: blockType`;
  - `duplicateCompanyType` clones it whole (already).
- `packages/domain/src/types/block-definition.ts` `asBlockDefinition` -- passes `base_block_type` through. The `BlockDefinition` type in `seed/schema.ts` gains it optional, next to `type_id`.
- `packages/domain/src/schemas/block-config.ts` -- `BASE_EQUIPMENT_BLOCK_TYPES`, the eight.
- `packages/domain/src/types/test-base-import.ts`:
  - `TEST_BASE_ROW_TESTS` :72;
  - the `planTestBaseImport` loop :240-275.
  - Synthetic fixture: `packages/domain/fixtures/test-base/base-ensaios-sintetica.json`. A synthetic file; it may gain TR-OL-03/TR-SE-03 rows with synthetic text.
- `packages/domain/src/seed/schema.ts` :439 `testDefSchema.recommendation` -- add `index_recommendation: testRecommendationSchema.optional()`. Also mirror the cap in `ops/value-limits.ts` if it lists `recommendation`.
- `packages/domain/src/seed/test-help.ts` -- `testRecommendationOf` :98, `recommendedPointText` :114.
- `packages/domain/src/relatorio/applicability.ts` -- `TestApplicability.value` :44, `valueApplicability` :177.
- `apps/web/src/surfaces/ficha/applicability-band.tsx` :55-95, `apps/web/src/copy/pt-br.ts` :1618 -- W3-6.
- `packages/domain/src/relatorio/tap-rows.ts`:
  - `tapRowAccepted` :228;
  - `storedRows` :170, where a cleared row drops out.
  - `packages/domain/src/ops/apply.ts` `assertCellGeometry` :578-592 (item 3).
  - Web: `apps/web/src/surfaces/ficha/ensaios-section.tsx` :474, the off-plate row's `ReadOnlyMeasurementField`; `ficha-ops.ts` `testCellOp` :121 (null clears).
- `packages/domain/src/types/draft-edit.ts` `removeDraftEntry` :212; `relatorio/vector-group.ts` `VECTOR_GROUP_FIELD` :280, `isVectorGroupField`; `seed/schema.ts` :197 `ratio_factor`; web `apps/web/src/surfaces/templates/type-editor-parts.tsx` `rowMenu` :298 plus the templates toast (item 4).
- `apps/web/src/surfaces/templates/type-editor-parts.tsx` :330 shows "Grupo na impressão", static `printGroupValue`. A copy with a base of the eight shows the kernel's group words instead (W3-3).
- `apps/api/src/scripts/bedrock-eval.ts` -- SYNTHETIC :112, oil sample :158, abort :385-394; the pattern is `eval-group-read.ts` (item 6).
- `packages/domain/src/seed/v13.ts` :515 and :520 -- base quotes (W3-5).

## Tasks & Acceptance

**Execution:**
- `measurement-evaluation.ts` -- (W3-1) set `restrictionStands` when a restriction rule flags a cell now out:
  - `applyHistory` also reads cells `out` by their criterion; their verdict stays;
  - `applyPhaseDeviation`: a deviation out past a restricted band (`restricted_max_pct` defined);
  - `applyBands`: out on a criterion holding a `restricted` band.
  - Open circuits never count.
  - (W3-2) set `unjudged` on a live test with a `phase_deviation` criterion among its `criteria` when a number cell (not fixed, state `measured`) ends with `verdict === null` and `toCheck === false`.
  - `measurementTestsUnnumbered` is also true for a definition whose `base_block_type` is one of the eight, with seeded `tests`.
- `points/derived.ts` -- (W3-1) `standing` takes every `restrictedMeasurements` test whatever `hasOut`, plus every measurement test with `restrictionStands`.
  - (W3-7) the reading entry's recommendations: `recommendation` when an out reading, prerequisite or choice fails; `index_recommendation ?? recommendation` when `indexOut` holds; distinct, joined.
  - (item 2) the `reprovado` entry, per the matrix.
  - Generalize `recommendedPointText` to take a list, keeping its single-text output byte-equal.
- `conclusion.ts` -- (W3-2) `computeFloor` returns null when a live measurement test is `unjudged`, after the failure and restriction returns, as the Q-3 guard does.
- `types/definition.ts`, `seed/schema.ts`, `block-definition.ts`, `duplicate.ts` -- (W3-3) the `base_block_type` key end to end.
  - Add a kernel helper `printBlockTypeOf(definition, blockType)`: the seeded type, else the copy's base, else the company key.
  - Add a kernel text for the editor's "Grupo na impressão": the base's group words for a base of the eight, else null, where the web keeps its static copy. Use `GROUP_WORDS` words without the cabine part.
- `print/group-for-print.ts` -- (W3-3) resolve each node's print type through `snapshotDefinitionContext(snapshot)` and `blockDefinitionIn`:
  - a base of the eight → its switch case;
  - every other company or library type → `outros`;
  - `tpTcPairs`, cables, `cabineTransformers`, `afterFullQuadros` and `malhasLast` read the print type.
- `types/test-base-import.ts` -- (W3-7) a second map, `TEST_BASE_INDEX_ROWS`: `TR-OL-03` and `TR-SE-03` to `isolacao`.
  - An IP row attaches when the copy's test has `polarization_index`. It fills `index_recommendation` only (its help is not merged: a narrowing) and counts as attached in the preview.
  - Row IDs only; no text from the JSON.
- `seed/schema.ts` (+ `ops/value-limits.ts`) -- `index_recommendation` optional on `testDefSchema`, the same cap as `recommendation`.
- `seed/v13.ts` -- (W3-5) paraphrase the TC-02 quote (:515) and the GE-01 quote (:520) in English.
  - Then run a throwaway 5-gram overlap check of `seed/v13.ts` and of the whole diff against `docs/context/Fasor_Base_Ensaios_MT_rev08.json` (script in `.scratch-e23z/`, not committed). Expect 0 hits.
- `relatorio/applicability.ts` + `applicability-band.tsx` + `copy/pt-br.ts` -- (W3-6) for `applicability.value !== undefined`:
  - the applied band's button reads `t.undoApply`, authored "Desfazer a aplicação";
  - its toast reads `t.undoneToast`, authored "Aplicação desfeita — não se aplica";
  - the NA band's sub-line reads `t.bandSubValue`, authored "Não conta como faltando e não sai no relatório.".
- `ops/apply.ts` + `tap-rows.ts` -- (item 3) on a `rows_from` table, an off-plate row that holds a filled cell accepts a `remove` or a `put` of null on any column. A non-null put stays refused.
  - Add `tapRowClearable(...)` in the kernel.
  - Web: the off-plate row draws a `TextButton` "Apagar leitura" (authored, `pt-br.ts`) when not read-only. It writes `testCellOp(..., null)` for each filled cell of the row in one batch, with undo toast "Leitura apagada" (authored).
- `types/draft-edit.ts` + `type-editor-parts.tsx` -- (item 4) add `removeDraftEntryRefusal(draft, part, index): string | null`.
  - It returns the reason for a nameplate field keyed `VECTOR_GROUP_FIELD` while a draft test's table has `ratio_factor: 'vector_group'`. Authored: "O campo {label} não pode ser removido: a relação de transformação calcula por ele. Remova antes o ensaio."
  - `removeDraftEntry` returns the draft unchanged then.
  - `rowMenu`'s Remover shows the reason in the templates toast and writes nothing.
- `apps/api/src/scripts/` -- (item 6) move SYNTHETIC, `fieldsOf` and the key check into a new module `eval-samples.ts`, importable without running the script.
  - Add `seed_version: 'v12'` to the oil sample.
  - Replace the throw with a partition that skips a mismatched sample and logs it.
  - Test `eval-samples.test.ts`: every SYNTHETIC sample resolves against its seed; a fabricated bad sample is skipped while the good ones remain.
- Specs (Playwright, `@p0` for the main path, each asserting the committed store or outbox):
  - extend `e2e/ttr-per-tap.spec.ts` (item 3);
  - extend `e2e/thermography.spec.ts` (W3-6);
  - extend `e2e/test-recommendation.spec.ts` (item 2);
  - extend `e2e/test-base-import.spec.ts` (W3-3 through the DOCX section 9 grouping);
  - add a type-editor case for item 4 in `e2e/company-type.durability.spec.ts` or the type-editor spec.
  - Update every unit or e2e assertion that expects a copy of the eight in "Outros equipamentos" (`grep -rln "Outros equipamentos" e2e packages apps`), and keep those for new types.
- api integration through the sync route: item 3's null put accepted and non-null refused on an off-plate row. Add W3-3 to the generate job's section 9 test, if one covers company types.

**Acceptance Criteria:**
- Given each matrix row, when its kernel test runs, then it fails on `ef099d41` and passes after the fix.
- Given the goldens, when the gate runs, then each is byte-equal.
- Given the gate, when it runs, then lint, static, test:api, test:unit and the touched specs (desktop-chrome, durability-desktop-chrome) are green. The `ttr-per-tap` durability spec also runs on the matrix projects, since item 3 changes the fold.

## Design Notes

- Item 2 reading (open for Bruno): the restricted tests are the sheet's identifiable reason, and with none, every in-force test's recommendation, because Bruno edits the text down.
- W3-3 narrowing: only copies created after this change carry `base_block_type`. Older copies keep printing in "Outros equipamentos" until duplicated again. The key is never editable.
- W3-7 narrowing: the IP row's help is not merged into "Como ensaiar". `index_recommendation` is not shown in the editor. The rev08 IP rows carry the same recommendation as the 1-minute rows today.
- Item 4 narrowing: only removal is refused. Changing the field's kind or options is not.

## Verification

- `podman compose --profile tools run --rm --user root tools pnpm test:unit -- <path>` while iterating, after GATE_DONE only.
- Final: lint, static, test:api, test:unit, then `pnpm exec tsx scripts/e2e.ts <specs> --project desktop-chrome --project durability-desktop-chrome`, and the ttr durability spec on the matrix. Each runs under `lockf -t 20000 /tmp/fasor-verify.lock`.

**Load rule (binding).**
- Another gate holds `/tmp/fasor-verify.lock`. Until `/private/tmp/claude-502/-Users-matheusvilella-Documents-estudos-fasor-app/4b366af1-2a1f-4c68-adfe-40511ad7328a/scratchpad/wave3-gate/gate.log` contains `GATE_DONE`:
  - do not run `podman compose up`;
  - do not run any container, test or typecheck;
  - implement and reason from the code.
- Once it contains `GATE_DONE`, run `podman compose up -d postgres minio api` in the worktree (env and override already in place, images `app-api-e23z`/`app-tools-e23z`) and stop with `podman compose stop`, never `-v`.
- Wrap every unit, api or e2e run in `lockf -t 20000 /tmp/fasor-verify.lock` and log it under `.scratch-e23z/`.
- Any wait is a bounded loop of at most 55 s per tool call.
- If the gate is still running when the code is written, report "not run: load rule" for the commands; the orchestrator runs them.

## Spec Change Log

- 2026-11-10, implementation return: item 3's "Desfazer" would write the readings back, a non-null put the fold refuses. The orchestrator settled it on Bruno's "só apagar; nada novo é escrito": the clear toasts "Leitura apagada" with no "Desfazer" (commit e02a07bf). KEEP: the one-batch null puts and the fold's null-only acceptance.
- 2026-11-10, review: contract 40 and MIN 40 taken, as the launch allowed. On 39, an old bundle derives the points and the floor differently and its fold refuses the off-plate clear (contract 37 precedent). This replaces the spec's "no contract number".

## Review Triage Log

### 2026-11-10 — Review pass
- verdicts: 7 findings: high 0, medium 3, low 4, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` VG: "Apagar leitura" on the 390 px card, the only surface on a phone, was never exercised. Action: e23z-E2E-002 now clears an off-plate card at 390x844 and asserts the three null puts, the store and the card leaving.
  - `[low]` `[patch]` VG: an IP-only failure on a copy with no `index_recommendation` (falls back to `recommendation`) was untested. Action: added a unit case.
  - `[low]` `[patch]` VG: the over-cap refusal of an IP row in the import was untested. Action: added a unit case (refused, no key, still publishable).
  - `[low]` `[reject]` EC: the spec says the clear has an undo toast and the code has none. The difference is deliberate (Spec Change Log); the fix would only edit this build's spec.
  - `[medium]` `[patch]` EC: `printGroupWordsOf('cabos_saida')` named the Transformadores group, which a company block (no role) never prints in. Action: it returns the seccionadoras words, with a unit assertion.
  - `[low]` `[defer]` EC: a draft that lost `ligacao_secundaria` before this change can still publish a vector-group ratio table. The state predates this story; it goes to the ledger (`deferred-work.md` § e23z, Matheus).
  - `[medium]` `[patch]` EC: the fold widening and the derivation changes leave a version-39 bundle disagreeing with the server. Action: contract 40 and MIN 40, with an api integration case (a 39 pull answered 426) and the pins updated.
