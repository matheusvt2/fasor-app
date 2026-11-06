---
title: 'e21r: the transformer ratio follows its vector group, read from the plate too (21.1, 21.2)'
type: 'feature'
created: '2026-11-05'
status: 'done'
baseline_revision: '80f2f9f74df6d726844c278efc16d3ee8eb41ac4'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-21-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/research/ttr-vector-groups-2026-11-05/research.md'
warnings: ['batched', 'oversized']
batched_reason: '21.2 reads 21.1 group table and parser; both touch the transformer LIGACAO SECUNDARIA, seed v11 and the plate fixtures (epic-21-context.md batch plan).'
deferred:
  - summary: >-
      suggestConclusionPair can offer Aprovado / Sem restricoes over a v11 ratio with no vector group (captures unjudged).
    evidence: |-
      conclusion.ts suggestConclusionPair does not read groupMissing; parity with a ratio row missing V PRIMARIO today.
    location: >-
      packages/domain/src/relatorio/conclusion.ts:79
    severity: low
  - summary: >-
      Concluir ficha lands on Ensaios with no focused field when only the v11 missing group remains.
    evidence: |-
      ensaios-section.tsx firstMissing reads evaluatedCells only; groupMissing has no cell; the missing-group helper is visible there.
    location: >-
      apps/web/src/surfaces/ficha/ensaios-section.tsx:99
    severity: medium
  - summary: >-
      A drawn-only diagram whose terminal labels the OCR did not return is dropped as uncited.
    evidence: |-
      bedrock.ts withoutUncitedValues and structuringValueSchema min(1) drop a value citing no token; changing it touches contract/ocr.ts (spec Never). The paid eval before the deploy settles how often it happens.
    location: >-
      apps/api/src/jobs/reading/providers/bedrock.ts:238
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** The transformador de força's ratio table (seed v9/v10, `ratio_factor: 'sqrt3'`) computes VAL CALCULADO = U1 · √3 / U2 and prints the Dyn1 pairs whatever the transformer's connection, so a star-star (Yy0/Yyn0) unit reads ~1.73x too high and INSATISFATÓRIO. The plate reading fills LIGAÇÃO SECUNDÁRIA with free text and never reads the drawn vector diagram.

**Approach:** One kernel table of the 47 IEC vector groups (pairs, shorts, k) plus a tolerant parser in `packages/domain`; the ratio evaluation, screen labels, helpers and print headers read the group from LIGAÇÃO SECUNDÁRIA on seed v9+ ratio tables. Seed v11 (from v10) makes that field a select of the 47 codes and marks the table `ratio_factor: 'vector_group'`. Contract 30. The plate reading's prompt lists the codes and asks for the drawn diagram; a group read only from the drawing is `verify` with the note "Lido do diagrama — confira".

## Boundaries & Constraints

**Always:**
- The group table transcribes `research.md` § The table exactly: 47 rows, canonical IEC-case code ("Dyn1", "YNyn0", "ZNy11"), manual row number, three phases each with H pair text and X pair text as printed (e.g. `H1-(H3+H2)` / `X1-X2`, `H1-(H3-H2)` for the Dy rows), the shorted winding per phase or null, and k as one of five named factors (`1`, `sqrt3`, `inv_sqrt3`, `sqrt3_half`, `two_inv_sqrt3`). Dyn3, Dyn9, Dy3, Dy9 ship as transcribed (flagged for Bruno).
- The parser ignores case, spaces, slashes, hyphens (and dots/underscores); "DYN1", "Dyn 1", "D/yn1", "dyn-1" -> Dyn1; "YYN0", "yy0", "Y/yn0" -> Yyn0 / Yy0 / Yyn0. The HV prefix is read greedily but must leave a valid LV+clock: "YNyn0" (not "Y"+"Nyn0"), "ZNy5", "Yzn1", "YNzn11". A clock outside the group's row, letters left over, empty, "Y", "DYN" -> null.
- Capture labels: column i of a group table's three capture columns is `${H} / ${X}` of phase A/B/C, in the seed's column order. Storage stays addressed by column index; seed column labels (`H1-H3 / X1-X0`...) never change in v11.
- Dyn1 on v10 and v11 renders byte-identical to today's v10 sheet (screen helper "Calculado: U1 · √3 / U2", headers, print). v1..v8 (no `ratio_factor`) are untouched; the Porto Seguro goldens do not move.
- Every status/count/text is computed in `packages/domain` (AD-13). New pt-BR strings: derived ones in the domain, authored with `// authored:` comments. No emoji. English code and comments.
- `CONTRACT_VERSION` = 30 with a paragraph in `contract/version.ts`; `MIN_CONTRACT_VERSION` = 30 with its paragraph (a 29 bundle cannot resolve seed v11, and on a v9/v10 transformer whose LIGAÇÃO SECUNDÁRIA parses to a non-Dyn1 group it would compute √3 where the server's kernel does not). Write the 30 paragraphs as the first of possibly two (batch e21p appends its own under 30; do not touch e21p's files: `photos/order.ts`, `photos/numbering.ts`, `print/photo-order.ts`, `print/section-7.ts`, `ops/path.ts`, `surfaces/photos/*`).
- Fakes only: `LLM_PROVIDER`/`OCR_PROVIDER` = fake in every test; no paid call.

**Never:**
- Never edit seed v1..v10 files' content or their pinned hashes; never change `contract/ocr.ts` (that drags the OCR sidecar gate in, E8-A4): a diagram read still cites at least one OCR token in the structuring answer (`structuringValueSchema` min(1); `bedrock.ts` `withoutUncitedValues` drops uncited values).
- Never change `suggestionHintSchema` (a 29 client would fail to parse a new hint shape).
- Never run `apps/api/src/scripts/bedrock-eval.ts` (paid); only prepare it.
- No drag/reorder, no TP/TC change: TP and TC keep LIGAÇÃO SECUNDÁRIA as text and U1/U2.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| v11 Yyn0 | U1 13,8 kV, U2 380 V, group "Yyn0", captures 36,3 | VAL CALCULADO 36,32; row SATISFATÓRIO; captures "H1-H3 / X1-X3", "H2-H1 / X2-X1", "H3-H2 / X3-X2" screen and print; helper "Calculado: U1 / U2" | - |
| v11 Dyn1 | same, "Dyn1" | 62,90; today's labels; byte-identical to v10 Dyn1 | - |
| v11 empty group | no LIGAÇÃO SECUNDÁRIA | VAL CALCULADO and CONDIÇÕES empty; captures typeable; helper asks for the group; each ratio row counts +1 missing in Ensaios (Sumário, stepper, pre-issue) | - |
| v9/v10 parsed | text "YYN0" / "yy0" / "Y/yn0" | group factor and pairs apply as on v11 | - |
| v9/v10 unparsed | empty, "Y", "DYN", free text | exactly today's √3 and Dyn1 pairs; helper adds "Ligação não reconhecida: calculado como Dyn1" (authored) | - |
| shorted group | "Yd1" | label "H1-(H3+H2) / X1-X2" etc.; k √3/2; short helper names H3-H2, H1-H3, H2-H1 per phase | - |
| plate printed Dyn1 (v11) | OCR token "Dyn1" cited | suggestion "Dyn1", `suggested`; accepted -> k √3 | - |
| plate drawn Yyn0 | structuring "Yyn0" citing only tokens whose joined text does not parse to Yyn0 | suggestion "Yyn0", `verify`, `ocr_token_ids: []`, `bbox` full image; note "Lido do diagrama — confira"; never auto-accepted; confirm -> k 1 | - |
| plate unmapped v11 | structuring "Y" on the select | no suggestion row (dropped `invalid_shape` as any select today): the field stays empty and the empty-group helper asks for it | open reading O-3 |
| plate unmapped v9/v10 | "Y" on the text field | offered as today ("Y") | - |
| plate parsed v9/v10 | "DYN1" | offered as canonical text "Dyn1" | - |

</intent-contract>

## Code Map

- `packages/domain/src/seed/v1.ts:49,102,481-495` -- LIGAÇÃO SECUNDÁRIA text field shared by TP/TC/transformador (`instrumentTransformerFields`); `TRANSFORMADOR_RATIO` capture columns (Dyn1 pairs), `capture_column: 'H1-H3 / X1-X0'`.
- `packages/domain/src/seed/v9.ts:64-71` -- `ratio_factor: 'sqrt3'` on the transformer; pattern for v11's derivation. `seed/v10.ts` -- the derive-from-previous pattern to copy for `v11.ts`.
- `packages/domain/src/seed/schema.ts:116-122` -- `ratio_factor: z.enum(['sqrt3']).optional()`; add `'vector_group'` (optional, never defaulted).
- `packages/domain/src/seed/definitions.ts:32-52,102-113` -- `SEED_VERSION = 'v10'`, `SEED_VERSIONS` map; add v11 and move `SEED_VERSION` to `'v11'`.
- `packages/domain/src/seed/seed.test.ts` -- `V<n>_HASH` pins (`V10_HASH` must be pinned now, since v11 derives from it); add the v11 vs v10 difference test.
- `packages/domain/src/seed/select-option.ts` -- `selectOptionFor`: the one value->option mapping (plate reading, typed suggestion, "Igual à TAG", "Copiar da última visita"); fall back to the group parser when the field's options are the vector-group codes, so a v10 "DYN1" lands as "Dyn1" on a v11 select.
- `packages/domain/src/relatorio/reading-cells.ts:198-211` -- `RATIO_FORMULA_TEXT`, `ratioFormulaHelperText`, `ratioFactorValue`: replace with group-aware helpers (keep exported names working or update callers). `VisibleColumn`/`EvaluatedCell.column`/`EvaluatedTable` types (lines 41-114).
- `packages/domain/src/relatorio/reading-evaluation.ts:163-292` -- `evaluateTable`: columns, capture labels (`header`, `cell.column`), VAL CALCULADO (line 236), condição, `formulaHelper`. Add the group resolution here (read `block.sheet.nameplate.ligacao_secundaria` value, string).
- `packages/domain/src/relatorio/sheet-progress.ts:189-196` -- `ensaiosCounts`: count the v11 group-missing ratio rows. Find where the pre-issue check and the Sumário read Ensaios missing (`pre-issue.ts`, `sumario.ts`) and make sure the same count flows.
- `packages/domain/src/print/section-9.ts:504-522` -- `measurementHeader` prints `definition.value_columns` labels; for a ratio table with a group, print the group's pair for capture columns (read from the evaluated table, not the seed).
- `apps/web/src/surfaces/ficha/ensaios-section.tsx:440-487` -- renders column headers, cards (`cell.column`), and `table.formulaHelper` as `<p className="helper">`; add the short and missing-group helpers the same way (kernel strings).
- `packages/domain/src/reading/build.ts` -- `buildReadingSuggestions`: per-field normalize + assess; add the vector-group branch (transformador_forca `ligacao_secundaria`): canonical code, diagram classification, `ocr_token_ids: []` + full-image bbox (`FULL_IMAGE_BBOX`, used by `reading/prose.ts:54`).
- `packages/domain/src/reading/value.ts:205-238` -- `normalizeReadingValue` select/text branches; `reading/assess.ts` digit rule; `reading/digits.ts`.
- `apps/web/src/surfaces/ficha/nameplate-suggestions.tsx:~436` and `apps/web/src/components/suggestion-field.tsx` -- the verify pill; show the diagram note from a domain function.
- `apps/api/src/jobs/reading/kinds/plate.ts:80-92` -- builds `StructuringInput` with `fields`; knows `block.block_type`.
- `apps/api/src/jobs/reading/providers/bedrock.ts:66-68,173-185` -- `BEDROCK_STRUCTURING_PROMPT_VERSION` ('bedrock-structuring-2'), `structuringPrompt`.
- `apps/api/src/jobs/reading/providers/fake.ts` -- `DEFAULT_FIXTURE_BY_BLOCK_TYPE`; fixtures README `apps/api/src/jobs/reading/fixtures/README.md`.
- `apps/api/src/scripts/make-plate-fixtures.ts:~100-140,217-267` -- plate specs (`{key, tokens, value}`); the existing transformer plate (ligacao 'Y') stays.
- `apps/api/src/scripts/bedrock-eval.ts:~200-230` -- the report table; add a group column.
- `packages/domain/src/contract/version.ts:267,423` -- `CONTRACT_VERSION = 29`, `MIN_CONTRACT_VERSION = 29`, paragraph patterns for 27-29.
- `e2e/seed-v10.spec.ts:62` (`expect(SEED_VERSION).toBe('v10')`), `e2e/seed-v9.spec.ts`, `e2e/ficha.spec.ts`, `e2e/ratio-feeds-conclusion.spec.ts`, `e2e/review-layout-interaction-2026-10-08.spec.ts`, `e2e/plate*.spec.ts`, `e2e/nameplate-values.spec.ts`, `e2e/templates.spec.ts`, `e2e/legacy-options.spec.ts`, `e2e/support/relatorio-seed.ts` -- candidates asserting the seed version, counts, LIGAÇÃO SECUNDÁRIA or the ratio table.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/relatorio/vector-group.ts` (new, exported from the domain index) -- `VECTOR_GROUPS` (47 rows, manual order), `VECTOR_GROUP_CODES`, `parseVectorGroup(text: unknown): VectorGroup | null`, `vectorGroupFactor(k): number`, formula text by k ("Calculado: U1 / U2", "Calculado: U1 · √3 / U2", "Calculado: U1 / (U2 · √3)", "Calculado: U1 · √3 / (2 · U2)", "Calculado: 2 · U1 / (√3 · U2)"), capture label per phase, short helper text (authored, e.g. "Curto-circuitar H3-H2 na fase A, H1-H3 na B e H2-H1 na C"). Unit tests: `vector-group.test.ts` pins all 47 rows (a literal table copied from research.md, compared row by row), parser spellings and unmatched cases, greedy prefix cases.
- `packages/domain/src/seed/schema.ts`, `seed/v11.ts` (new), `seed/definitions.ts`, `seed/seed.test.ts` -- `ratio_factor` enum gains `vector_group`; v11 = v10 with the transformador_forca's `ligacao_secundaria` as `select` of `VECTOR_GROUP_CODES` (label unchanged) and its ratio table `ratio_factor: 'vector_group'`; TP/TC untouched; `SEED_VERSION = 'v11'`; pin `V10_HASH`; test v11's exact difference from v10. Check templates/new relatórios pick v11 the way v10 shipped (search the v10 upgrade path, e.g. template seed move in the api, and mirror it).
- `packages/domain/src/seed/select-option.ts` -- vector-group fallback as in the Code Map, with tests.
- `packages/domain/src/relatorio/reading-cells.ts`, `reading-evaluation.ts` -- group resolution for ratio tables with `ratio_factor` set: `vector_group` -> parsed group or none (no VAL CALCULADO, `groupMissing`, helper "Informe a LIGAÇÃO SECUNDÁRIA na placa para calcular" authored); `sqrt3` -> parsed group, else Dyn1 plus the "Ligação não reconhecida: calculado como Dyn1" helper line. `EvaluatedTable` gains what the screen needs (formula helper, short helper, missing-group helper; capture `header`/`label` and `cell.column` from the group). Tests in `readings.test.ts`: v8, v10, v11 with Dyn1, Yyn0, YNd11, Yd1, plus every one of the 47 groups at U1 13,8 kV / U2 380 V (VAL CALCULADO = U1·k/U2 formatted, labels = pairs).
- `packages/domain/src/relatorio/sheet-progress.ts` (+ pre-issue/sumário readers if separate) -- a v11 ratio row with no group counts one missing in Ensaios; test.
- `packages/domain/src/print/section-9.ts`, `section-9.test.ts` -- capture headers print the group's pairs; v8/v10/v11 x Dyn1/Yyn0/YNd11/Yd1 tests; Dyn1 v10==v11 bytes.
- `apps/web/src/surfaces/ficha/ensaios-section.tsx` -- render the extra kernel helpers as `<p className="helper">`, screen only.
- `packages/domain/src/reading/build.ts`, `value.ts` (+ tests in `build.test.ts`) -- for `block_type === 'transformador_forca'` and key `ligacao_secundaria`: map the value with `parseVectorGroup`; v11 select stores the code (unmapped -> dropped as today); v9/v10 text stores the canonical code when parsed, else the text as today. "Printed" = the cited tokens' joined text (token order) parses to the same group -> normal digit rule; otherwise a diagram read -> `trust: 'verify'`, `source.ocr_token_ids: []`, `source.bbox` full image. Domain function (e.g. `plateSuggestionNoteText(suggestion)`) returns "Lido do diagrama — confira" (authored) for a nameplate suggestion with empty `ocr_token_ids`; render it under the field in `nameplate-suggestions.tsx`. A diagram read is never auto-accepted (verify already confirms only by its own tap; assert it).
- `apps/api/src/jobs/reading/kinds/plate.ts`, `providers/bedrock.ts` (+ `bedrock.test.ts`) -- the plate kind marks the vector-group field for a transformador_forca (through an api-side argument or wrapper type; leave `contract/ocr.ts` unchanged); `structuringPrompt` adds a paragraph listing the 47 codes, asking for the printed code or, when none is printed, the group the drawn HV and LV diagrams show, citing the tokens nearest the diagram; bump to `bedrock-structuring-3`.
- `apps/api/src/scripts/make-plate-fixtures.ts`, fixtures, `providers/fake.ts` -- two new plates: a printed "Dyn1" transformer plate and a drawn Yyn0 plate (SVG draws HV and LV star diagrams with terminal labels; the structuring answer gives "Yyn0" citing a label token such as "H1" or "LIGAÇÃO"); regenerate only those (`make-plate-fixtures.ts <args>`), commit PNG + JSON; restart the api container after regenerating.
- `apps/api/src/scripts/bedrock-eval.ts` -- report column with the group read per plate (from `ligacao_secundaria` of a transformer reading, parsed). Do NOT run it.
- `apps/api` integration test through the sync route: a v11 relatório op round-trip (create on v11, put the select value) accepted at contract 30; a 29 header refused per `MIN_CONTRACT_VERSION` (follow the existing contract-bump tests).
- `contract/version.ts` -- 30 paragraphs for both constants.
- e2e: `e2e/ficha.spec.ts` gains (1) a v11 Yyn0 case typed by hand -> SATISFATÓRIO, asserting the committed op (outbox/store) and the screen labels; (2) a v10 relatório (seeded on v10) with "DYN1" changed to "YYN0" -> new VAL CALCULADO and the Story 16.2 staleness banner after an issue. The plate-reading spec covering the transformer plate runs the drawn Yyn0 case to the verify state, the note, then confirm -> ratio k 1. Update every spec asserting `SEED_VERSION`/'v10', seed counts or the ratio table (grep `e2e/` and list them in your report); read lists from the kernel, never as literals. `@p0` for main ACs.
- Docs: `_bmad-output/specs/spec-fasor/source-deltas.md` row amending Story 15.6's fixed √3 (dated 2026-11-05); `docs/kbs/architecture/kernel-and-seed.md` note and `docs/kbs/log.md` line; `_bmad-output/implementation-artifacts/deferred-work.md` new heading "Deferred from: Epic 21 batch e21r (2026-11-05)" with the row: "before the deploy: Matheus runs `bedrock-eval.ts` on the real plate set with prompt `bedrock-structuring-3`; record the group column per plate in the PR" plus any narrowing.

**Acceptance Criteria:**
- Given a v11 transformador de força with "Yyn0", 13,8 kV / 380 V, when its ratio row evaluates, then VAL CALCULADO is 36,32, a capture of 36,3 is SATISFATÓRIO and the three captures read H1-H3 / X1-X3, H2-H1 / X2-X1, H3-H2 / X3-X2 on screen and in print.
- Given each of the 47 groups, when the kernel test evaluates U1 13,8 kV / U2 380 V, then VAL CALCULADO = U1·k/U2 and the capture labels are that group's pairs; a shorted group prints e.g. "H1-(H3+H2) / X1-X2" and the screen names the winding to short per phase.
- Given a v9 or v10 sheet whose LIGAÇÃO SECUNDÁRIA reads "YYN0", when it renders or a new revision generates, then the group's factor and pairs apply; with it empty, "Y" or unmapped, the row computes as today and the helper says "Ligação não reconhecida: calculado como Dyn1".
- Given a v11 sheet with no group, when the ratio table renders, then VAL CALCULADO and CONDIÇÕES stay empty, captures can be typed, one helper asks for LIGAÇÃO SECUNDÁRIA, and the Sumário and pre-issue check count the row as incomplete.
- Given a group is set, when the formula helper renders, then it names that group's formula, screen only.
- Given a v11 plate printing "Dyn1" (fake), when the reading completes, then LIGAÇÃO SECUNDÁRIA is suggested "Dyn1" and the accepted ratio uses k = √3.
- Given a plate drawing Yyn0 with no printed code (fake), when the reading completes, then LIGAÇÃO SECUNDÁRIA is offered "Yyn0" in verify with "Lido do diagrama — confira", never auto-accepted; after confirm the ratio uses k = 1.
- Given the paid eval script, when Matheus runs it, then its report has a group column (prepared only; the run is a deferred "before the deploy" row).

## Spec Change Log

## Review Triage Log

### 2026-11-05 — Review pass
- layers: Edge Case Hunter and Verification Gap Reviewer (opus); Blind Hunter and Intent Alignment skipped (token economy; the integrated epic review covers them).
- verdicts: 13 findings — high 0, medium 7, low 5, false 0, maybe-false 1
- findings:
  - `[medium]` `[patch]` VG: the plate job's `vectorGroupKey` never asserted on the job path (dropping it keeps `bedrock-structuring-3` with no group prompt) — job.integration converse stub records the prompt text; transformer plate asserts the group paragraph, panel asserts its absence.
  - `[medium]` `[patch]` VG: `shortHelper` never rendered by a device test — `@p1` Yd1 test in `e2e/ficha.spec.ts` (formula + short helper + Yd1 headers from the kernel).
  - `[medium]` `[patch]` VG: `ReplaceLine` diagram note untested — unit case in `nameplate-field.test.tsx` (empty ids show `DIAGRAM_READ_NOTE`, cited ids none).
  - `[low]` `[defer]` VG other: `suggestConclusionPair` can offer "Sem restrições" over an unjudged v11 empty-group ratio — same as a ratio row missing V PRIMÁRIO today (parity); the fix is a new guard; deferred to the integrated review (deferred-work row).
  - `[low]` `[patch]` VG other: `bedrock.test.ts` title says version 2 — title corrected.
  - `[medium]` `[defer]` EC: Concluir lands on Ensaios with no focused field when only `groupMissing` remains (`ensaios-section.tsx` `firstMissing` reads cells only) — the missing-group helper is shown there; routing to Placa is new UI behavior; deferred (deferred-work row).
  - `[medium]` `[patch]` EC: nameplate sub-block disabled on v11 keeps every ratio row missing forever — `groupMissing` counted only while the nameplate sub-block is enabled, with a boundary test; open question O-6 for Matheus.
  - `[low]` `[defer]` EC: same as the conclusion-suggestion finding above (grouped, same root cause).
  - `[medium]` `[patch]` EC: punctuation around a printed code ("(Dyn1)", "Dyn1,") makes `printsVectorGroup` call it a diagram read — the parser ignores every non-letter, non-digit character; tests.
  - `[maybe-false]` `[defer]` EC: a drawn-only diagram whose labels OCR missed is dropped as uncited (`withoutUncitedValues`, `structuringValueSchema` min(1)) — by design (spec Never: no `contract/ocr.ts` change); if true medium (unverified); the paid eval run before the deploy settles it.
  - `[low]` `[patch]` EC: a cited token printing another group ("Dyn11" for "Dyn1") is labelled a diagram read — diagram only when no cited run parses to any group; another group keeps its citations and goes `verify`; build tests.
  - `[low]` `[reject]` EC: v1..v8 transformer plate readings now canonicalize the code and may emit a diagram read — harmless (the ratio ignores the group there, the read stays `verify`), and the fix is an added seed-version guard.
  - `[low]` `[reject]` EC: "Dyn01" or "Yy12" do not parse — not a spelling the plates or the fixture use; the fix adds clock normalization branches; an unparsed v9/v10 text says so on screen ("Ligação não reconhecida").

## Design Notes

- Open readings (coordinator's, ship as stated, list in the PR): O-1 v9/v10 unparsed keeps √3+Dyn1; O-2 v11 empty computes nothing and asks; O-3 an unmapped plate value on v11 is dropped (no suggestion), so "left empty with the verify state" is read as "left empty, the missing-group helper asks" since a suggestion row needs a value and a select takes none outside its options; O-4 a diagram read is detected server-side as "the cited tokens' joined text does not parse to the group", stored with no cited tokens (prose precedent), which is the device's signal for the note, so no hint or OCR contract change; O-5 the Story 16.2 banner: if staleness is edit-driven, an issued v9/v10 relatório whose text already reads a non-Dyn1 group shows no banner until edited (say which it is in your report).
- k values: `sqrt3_half` = √3/2 and `two_inv_sqrt3` = 2/√3 exactly as research.md; 13 800·k/380 for k=1 is 36,315... -> "36,32".

## Verification

**Commands (inside the batch stack, `podman compose --profile tools run --rm --user root tools ...` from the worktree; no Playwright outside `lockf -t 20000 /tmp/fasor-verify.lock`):**
- `pnpm lint`, `pnpm static` -- clean.
- `pnpm test:unit -- packages/domain/src/relatorio packages/domain/src/seed packages/domain/src/print packages/domain/src/reading` -- green while iterating; whole `pnpm test:unit` at the end.
- `podman compose restart api` then `pnpm test:api` -- green.
- Targeted e2e: `pnpm exec tsx scripts/e2e.ts <specs> --project desktop-chrome --project durability-desktop-chrome` under the lock -- the orchestrator runs the final gate; report the spec list.

## Auto Run Result

Status: done (orchestrated batch e21r; the PR is opened by the orchestrator, not merged).

- **Change:** Story 21.1, the transformador de força's ratio follows its vector group: the 47-group kernel table and parser (`relatorio/vector-group.ts`), seed v11 (LIGAÇÃO SECUNDÁRIA a select of the codes, `ratio_factor: 'vector_group'`), the evaluation, helpers and section 9 headers by group on v9 and later, the missing-group count, contract 30 (minimum 30). Story 21.2, the plate reading asks for the printed or drawn group (`bedrock-structuring-3`), stores it as its code, and a diagram read is `verify` with "Lido do diagrama — confira".
- **Files:** kernel (`vector-group.ts`, `seed/v11.ts`, `seed/schema.ts`, `seed/definitions.ts`, `seed/select-option.ts`, `reading-cells.ts`, `reading-evaluation.ts`, `readings.ts`, `sheet-progress.ts`, `print/section-9.ts`, `reading/build.ts`, `contract/version.ts`, `index.ts`); web (`ensaios-section.tsx`, `nameplate-suggestions.tsx`); api (`kinds/plate.ts`, `providers/bedrock.ts`, `scripts/make-plate-fixtures.ts`, `scripts/bedrock-eval.ts`, two plate fixtures); tests (kernel, api, e2e `ficha`, `plate`, `plate-reading`, `seed-v10`, new `seed-v11`, `ratio-feeds-conclusion`, `review-layout-interaction-2026-10-08`, `support/*`); docs (`source-deltas.md`, KB, `deferred-work.md`).
- **Review:** 13 findings; 7 patched (3 medium verification gaps, 2 medium edge cases, 2 low), 4 deferred (`deferred` list and `deferred-work.md`), 2 low rejected (v1..v8 canonicalization is harmless and needs a new guard; "Dyn01"/"Yy12" are not spellings in use).
- **Follow-up review:** false (no high patched; two medium patched are test-only gaps plus the parser and plate-off count, listed under "Patched, not re-reviewed" for the integrated review). Patched counts: medium 5, low 2.
- **Verification:** story gate on the pre-merge head: lint, static, test:api (834 passed) green; test:unit 358 of 360 files and e2e 174 of 175 under load 26 (two web unit files and R8DRY-E2E-005, none touched by the batch), all green alone under the lock (360 of 360 files, 5173 tests; R8DRY-E2E-005 2 of 2). The merged-head gate (with e21p's specs) is in the PR body.
- **Residual risks:** the paid eval has not run (a "before the deploy" row); the drawn plate's device e2e seeds the suggestion; the four flagged groups (Dyn3, Dyn9, Dy3, Dy9) await Bruno.
