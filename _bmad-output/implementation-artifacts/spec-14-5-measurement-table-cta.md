---
title: 'Story 14.5: the measurement table and the Chave de transferência automática (seed v5)'
type: 'feature'
created: '2026-10-13'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-14-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-08.md'
warnings: ['batched', 'oversized']
deferred: []
---

Batched: one story, built in two phases (kernel first with no stack, then api, web and Playwright), stacked on
batch e14b's kernel slice `fbcf432` (seed v4, contract 18) because both batch stacks were taken at launch.

<intent-contract>

## Intent

**Problem:** A chave de transferência automática (CTA) has no sheet, so the next real job would record it beside
the relatório. Its tests need what the four seeded grammars cannot hold: several typed columns, choice cells, a
limit relative to a column and equality between two cells.

**Approach:** Add a generic measurement-table grammar to the kernel and ship ONE library type on it as seed v5
(v4 plus `chave_transferencia_automatica`), captured on the existing sheet surface and printed in section 9 under
"Outros equipamentos" after Transformadores. Contract 19.

## Boundaries & Constraints

**Always:**
- Seed v1 to v4 parse to the bytes they shipped with (`V1_HASH` to `V3_HASH` hold; pin `V4_HASH` from the base
  commit BEFORE touching a schema). Every schema addition is `.optional()`, never `.default()`. The Porto Seguro
  goldens match with no regeneration; a relatório on v1 to v4 reads, captures and prints unchanged.
- `applyOp` stays the only reducer; replay of an existing log is byte-equal on both layers.
- Every criterion of the new grammar names its source; the kernel schema rejects one without it (tested).
- Progress, counts, verdicts, helper texts, the E5 method line, print parts, palette lists and labels are computed
  once in `packages/domain`; `apps/web` renders from IndexedDB and writes ops only; the renderer reads the frozen
  snapshot through its live blocks and locations (no filter of its own for removed locations).
- The CTA sheet reuses the existing sheet components and kernel functions (nameplate, checklist with bulk bar and
  NC chips, conclusion suggestion and text, Não ensaiado, photos, points, TAG); new components only for what the
  seeded sheet has no equivalent of (configuration, measurement test, test values).
- Authored pt-BR (NC phrases, labels with no FO.SERV-03 source, criteria wording, option labels) is marked
  `// authored:`. The brand name ASCO never appears in a string; write "fabricante".
- Mock class names; page CSS of `63-ficha-cta.html` goes to `apps/web/src/surfaces/ficha/ficha.css` and each
  `.frame-*` rule first rendered gets its translation in `app.css`; `components.css` and `tokens.css` unchanged.

**Never:**
- No company-type machinery (registry, resolver context, open enum, editor). No `fonte_auxiliar_protecao`, no rows
  added on site, no derived column, no `between` or average-relative criterion.
- No edit of `epics.md`, `sprint-status.yaml`, a frozen seed version, or the two known reds owned by other batches
  (`apps/api/src/sync/sync.integration.test.ts` about lines 1061-1071; `relatorio-tree-edges.test.tsx`).
- No template seed-upgrade step of this batch's own: e14b's `upgradeTemplateSeeds` (through the kernel
  `templateSeedUpgrade`) carries templates to `SEED_VERSION`; v5 is a superset of v4, so it needs no change.
- No new instrument-registry field, no change to the Critérios de aceitação tab (`SEEDED_CRITERIA` unchanged).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| CTA on an old seed | block create or sheet op of type CTA on a v1 to v4 relatório | refused by the kernel; `getDefinition` throws, `findDefinition` answers null | sync answers `op_invalid`, never a 500 |
| Palettes by seed | relatório or template on v4 / on v5 | v4 lists the eight; v5 lists the eight then "Outros equipamentos" with the CTA, offline | none |
| Relative limit | E1 column values 38, 41, 36, 52 µΩ; then 40, 39, 63, 42 | first column all `ok`; 63 is `out` (62 % above 39, limit 50 %); the lowest of each column is exposed as the reference | fewer than two measured cells in a column: no verdict |
| Equality | E4 row, Projeto 5 min, Deixado 30 min; then Deixado 5 min | `out` on Deixado, then `ok`; a choice row compares option keys | either cell empty: no verdict |
| Absolute | E2 with config tensão BT / MT; E3; E5 "Até carga" | BT `>= 100 MΩ`, MT the seeded `isolacao` criterion (`> 400 MΩ`); E3 `>= 2 MΩ`; E5 row `<= 10 s`; GΩ scales through the Ω table | incompatible unit: no verdict, never a throw into the surface |
| Choice result | E6 Classe = Normal / any other | `ok` / `out` | unknown option key reads as unanswered |
| Config rows | polos 2, 3, 4 | rows C hidden at 2; rows N (Polo N, N-T) only at 4; hidden rows are not shown, counted, judged or printed; their stored cells stay and row indexes never shift | none |
| Fixed cells | E2 Linha-carga under the two closed columns; E5 Ajuste of "Até carga" and "Falha da Emergência" | drawn as `.cell-dim` text, never typed, never required | a put to a fixed cell is refused |
| E5 options | método, carga, fonte dos tempos; carga = com carga | `%` and V, Hz, A show only with "com carga"; método "não realizado" makes the E5 table not required and not printed | a value key the test does not declare is refused |
| Test switched off | E1, E2, E3 or E6 switch off on the sheet | `block/{id}/config` put (`sub_blocks[key].enabled = false`); body hidden, off note shown, cells not required, not printed | none |
| Status flow | first CTA cell or test value on Rascunho; on Emitido | same batch carries the Em campo status op; on Emitido it reopens as Em revisão | undo inverts the value and the status op |

</intent-contract>

## Code Map

Kernel (`packages/domain/src`):
- `schemas/block-config.ts` -- `EQUIPMENT_BLOCK_TYPES` (append the ninth key), `SUB_BLOCK_KEYS` (append the six test keys), `ITEM_KEYS` (append 17), `blockConfigSchema` (add optional `options: Record<string, string>`).
- `seed/schema.ts:224` -- `blocks: z.record(equipmentBlockTypeSchema, ...)` is exhaustive in zod 4: make it a partial record; `blockDefinitionSchema`, `testDefSchema.key` enum (three keys, keep) and `criterionSeedSchema` are the neighbours of the new grammar.
- `seed/definitions.ts:94-140` -- `getDefinition` returns `undefined` for a type its version lacks: make it throw; `SEED_VERSION`, `SEED_VERSIONS`, `bundle()` criterion check. `seed/v4.ts` is the clone pattern for `seed/v5.ts`.
- `seed/seed.test.ts:601-784` -- hash pins and the "differs only by" assertion pattern; block-type loops at 92-796 run against old versions and must keep passing.
- `ops/path.ts:36-326, 508-520` -- `FAMILIES` (44), builders; `ops/path.test.ts:63`; `ops/apply.ts:319-437` -- `assertSeedPath`, `assertCellGeometry`, `putSheet` with `inShapeOrder(TEST_ENTRY_KEYS)` (a key missing from `sheetSchema.test` in `schemas/entities.ts:400-419` is dropped silently).
- `status/edited-since.ts:34-168` -- `FAMILY_DECISIONS` (compile-forced), `countsAsFieldContent` (switch, not forced); tests at `edited-since.test.ts:409-461` (22 edit, 22 never).
- `merge/conflicts.ts:286-304`, `schemas/snapshot.ts:70-108` (`live`, `cellsOf`) -- enumerate sheet cells; a new family must appear in both.
- `relatorio/reading-cells.ts`, `reading-evaluation.ts:35-290` -- `EvaluatedCell/Row/Table`, `TestEvaluation`, `evaluateSheetReadings`, `cellAddressesOf`; consumers `sheet-progress.ts:52,149` (`STEP_SUB_BLOCKS.ensaios`, `ensaiosCounts`), `sheet-state.ts:78`, `conclusion.ts:49-260` (`suggestConclusionPair`, `composeConclusion`, `NOUNS`, `TEST_WORDS`), `reading-run.ts:100-175` (`worstReadings`).
- Compile-forced maps: `relatorio/tag.ts:13`, `relatorio/conclusion.ts:131`, `photos/caption.ts:25`, `templates/text.ts:29` (+ `TOTALS_ORDER` :41, not forced), `print/section-9.ts:131`.
- Seed-blind lists: `relatorio/tree.ts:612` (`paletteItems`), `relatorio/panel.ts:180`, `reading/panel.ts:34`, `seed/template.ts:53`, `seed/template-rules.ts:68`.
- `print/group-for-print.ts:40-257` -- `PrintGroupKind`, `GROUP_WORDS`, `byType` (its `default` would drop the CTA into Seccionadoras); `print/section-9.ts:307-666` -- `nameplatePart`, `checklistPart`, `testParts`, `conclusionParts`, `sheetOf`.
- `contract/version.ts:119-215`, `contract/contract.test.ts:96`; `templates/from-relatorio.ts:86` (`templateSeedUpgrade`), tests list `['v1','v2','v3']`.

Web (`apps/web/src`): `surfaces/ficha/ficha-surface.tsx:61-96`, `ensaios-section.tsx:52-377`, `measurement-field.tsx:95`, `ficha-ops.ts:85-126`, `use-ficha-data.ts:36`, `checklist-section.tsx`, `conclusao-section.tsx`; palettes `surfaces/relatorio/block-palette-field.tsx:88`, `surfaces/templates/block-palette.tsx:111`, `template-composer.tsx:408`; `copy/pt-br.ts:417,470`; `components/segmented-control.tsx`; `db/commit.ts:218-266` (`buildBatch` appends the status op once `countsAsFieldContent` says so).

Api (`apps/api/src`): `jobs/generate/sections/section-9.ts:120-200` draws any `PrintTable` (no renderer change expected); `jobs/generate/docx.test.ts:263-390` structure-test pattern; `sync/apply.ts:145,535`; `sync/sync.integration.test.ts:392-426, 1215-1300` patterns (helpers hardcode `seed_version: 'v1'`); `jobs/reading/kinds/plate.ts:57` fake plate fixtures per type; `db/seed.ts:397` `upgradeStandardTemplate`.

E2E: `e2e/local-painel-coluna.spec.ts:134-357` (sheet filled, generation, DOCX structure), `e2e/status-flow-2026-10-10.spec.ts:135`, `e2e/keyboard-salvo.durability.spec.ts:74`, `e2e/support/groups.ts:11` (`SERIAL_SPECS`), `e2e/plate-every-type.spec.ts:68`, `e2e/relatorio.spec.ts:654`.

Content: `sprint-change-proposal-2026-10-08.md` § 8.4; mocks `63-ficha-cta.html` (grep classes, never whole), `42-template-composer.html:186-188, 283`, `40-relatorio-overview.html:299-304, 470-476`, `key-print-section-9.html:171-226`.

## Tasks & Acceptance

**Execution, phase 1 (kernel, no stack; tools container with `--no-deps`):**
- `packages/domain/src/seed/seed.test.ts` -- pin `V4_HASH` first, from the untouched tree -- the freeze of v4.
- `packages/domain/src/seed/measurement.ts` (new) + `seed/schema.ts` -- the grammar as zod schemas and types, see Design Notes; `blockDefinitionSchema` gains optional `measurement_tests`, `config_fields`, `library`; `blocks` becomes a partial record -- one generic grammar, old versions byte-equal.
- `packages/domain/src/schemas/block-config.ts`, `schemas/entities.ts` -- the keys above; `sheet.test[k].values` optional -- closed enums gain the keys.
- `packages/domain/src/seed/v5.ts` (new), `seed/definitions.ts` -- `CABINE_PRIMARIA_V5`, `SEED_VERSION = 'v5'`, `getDefinition` throwing for an absent type, `equipmentTypesOf(seedVersion)`; every seed-blind list in the Code Map reads it -- CTA only on v5.
- `packages/domain/src/ops/path.ts`, `ops/apply.ts`, `status/edited-since.ts`, `merge/conflicts.ts`, `schemas/snapshot.ts` -- family `sheet/test/value`; geometry and refusals of the matrix; `'edit'` and field content -- the op contract.
- `packages/domain/src/relatorio/measurement-evaluation.ts` (new) and the evaluation consumers -- verdicts, references, helper texts, required counts, worst readings and the conclusion text for measurement tests through the SAME exported functions the surfaces call today -- no fork of sheet logic.
- `packages/domain/src/relatorio/tag.ts`, `conclusion.ts`, `photos/caption.ts`, `templates/text.ts`, `relatorio/tree.ts` -- prefix `CTA`, nouns, totals, palette group `LIBRARY_GROUP_LABEL = 'Outros equipamentos'` -- derived text in the kernel.
- `packages/domain/src/print/group-for-print.ts`, `print/section-9.ts` -- kind `outros` after `transformadores`; the CTA's parts: nameplate, CONFIGURAÇÃO table, checklist, one native table per enabled test with its instrument and ACEITÁVEL line (criterion and source), the lowest-of-column row on E1, the E5 MÉTODO line and "NA EMERGÊNCIA, COM CARGA" row, conclusion -- section 9.
- `packages/domain/src/contract/version.ts` -- `CONTRACT_VERSION = 19`, `MIN_CONTRACT_VERSION = 19` with the dated reason (a contract-18 client cannot parse `sheet/.../value/...`, the ninth type or seed v5, and would stall on pull).
- Kernel tests beside each file: grammar schema (criterion without source rejected), v5 differs from v4 only by the CTA type (17 items, 13 nameplate fields plus the identity fields the eight carry, six tests), matrix rows, family count 45 and decisions 23 edit / 22 never, replay byte-equal of a pre-v5 log, `templateSeedUpgrade` over v1 to v4 answering `v5`, `groupForPrint` (a local with no CTA emits exactly the pre-change parts; `outros` last), section 9 parts of a filled CTA, undo pair of a cell and a value with the status op.
- Commit and push the kernel slice when `lint`, `static` and the kernel Vitest paths are green.

**Execution, phase 2 (stack up):**
- `apps/web/src/surfaces/ficha/` -- `configuracao-section.tsx`, `measurement-test-section.tsx` (table with `.is-multi`/`.is-compact`, phone cards, choice cells as Segmented control, fixed cells, reference row, test switch with off note, test values and the E5 option rows as a radiogroup), wired in `ensaios-section.tsx`/`ficha-surface.tsx`; `ficha-ops.ts` gains `testValueOp`; "Tipo da biblioteca" pill; CSS as the constraints say -- the sheet.
- `apps/web/src/surfaces/relatorio/block-palette-field.tsx`, `surfaces/templates/block-palette.tsx`, `template-composer.tsx`, `copy/pt-br.ts` -- the palette group after the eight with stepper and suggested TAG; names -- both palettes, offline.
- `apps/api/src/jobs/reading/kinds/plate.ts` (CTA fake fixture, invented maker), `apps/api/src/jobs/generate/docx-cta.test.ts` (new structure test from its own heading), `apps/api/src/sync/sync-cta.integration.test.ts` (new file: CTA create, cell and value through the route on v5; `op_invalid` for a CTA on v1, an undeclared value key and a fixed cell; server rows equal kernel replay), standard template stays without a CTA block -- api.
- `e2e/cta.spec.ts` (`@p0`, in `SERIAL_SPECS`), `e2e/cta.durability.spec.ts` (`@p0`), touched `plate-every-type.spec.ts`/`relatorio.spec.ts` -- see ACs.
- Documents: dated notes on AD-3, AD-15, AD-21 in the spine; `deferred-work.md` entries for every narrowing below; `docs/nc-chip-phrases.md` (CTA phrases); `docs/kbs/` concept and `log.md`.

**Acceptance Criteria:**
- Given a template on v5 in the composer, when the user adds one Chave de transferência automática from "Outros equipamentos" with the Quantity stepper, then the node shows it with the suggested TAG (`CTA-…` by the existing rule) and the template totals name it; given a relatório on v5 offline, when the field palette adds one, then the sheet opens and the block create is in the outbox.
- Given the CTA sheet offline on a Rascunho relatório, when the technician sets polos to 4, fills the nameplate, answers one item NC with a chip and "Marcar os restantes como Conforme", types E1 with one pole more than 50 % above the lowest of its side, sets an E4 Deixado different from Projeto and then equal, chooses the E5 método, "com carga" with its %, the fonte dos tempos and the times, then: the first value's batch carries the Em campo status op and the surface says "Relatório em campo"; the out cell is amber with its helper text; the counter of required fields falls to zero; the conclusion suggestion is "Aprovado · Com restrições?" and its text names the NC item and the out reading; every value is in the outbox/store (asserted, not only seen).
- Given that relatório synced and generated, when the DOCX is read, then section 9 holds the "Outros equipamentos" group after the Transformadores group of the same local with the CTA's nameplate, configuration, checklist (the NC row with its observation), the E1 and E5 tables (the method line beside the times) and the conclusion paragraph; and given a value typed on the issued relatório, then it reopens as Em revisão.
- Given a CTA cell and an E5 option typed and the page reloaded before sync (durability, also on the android-chrome and webkit projects), then both values are on the sheet and in the outbox.
- Given a 390 px viewport, when the E4 table shows, then it is drawn as cards with no horizontal page scroll.
- Given the Porto Seguro fixture (seed v1), when generated, then the golden documents match unchanged.

## Spec Change Log

## Review Triage Log

## Design Notes

**Keys (cross-batch contract).** Block type `chave_transferencia_automatica`. Test and sub-block keys
`cta_resistencia_contato` (E1), `cta_isolamento_principal` (E2), `cta_isolamento_controle` (E3),
`cta_ajustes_controlador` (E4), `cta_transferencia` (E5), `cta_termografia` (E6). Config (`BlockConfig.options`,
structure, written by `block/{id}/config`): `tensao` bt|mt, `polos` 2|3|4, `neutro` solido|chaveado|sobreposto,
`transicao` aberta|retardada|fechada, `bypass` sim|nao; defaults bt, 3, solido, aberta, nao (authored).

**Ops.** Table cells reuse `sheet/{blockId}/test/{testKey}/cell/{row}/{col}`: `row` is the index in the test's
fixed row list (hidden rows keep their index), `col` the column index. New family `sheet/test/value`, path
`sheet/{blockId}/test/{testKey}/value/{valueKey}`, builder `sheetTestValuePath(blockId, testKey, valueKey)`, a
Cell stored at `sheet.test[testKey].values[valueKey]`. Value shape, both families: a number is `{raw, unit,
state}` as today; a choice is `{raw: optionKey, unit: null, state: 'measured'}`.

**Grammar (only what the CTA uses).** A measurement test: `key`, `label`, optional `instrument_of` (`isolacao` |
`resistencia_contato`: whose registry instruments the picker offers; absent, no picker), `switchable` with its
off note, `row_header`, `columns` (key, label, kind number|choice, unit, options, `optional`), `rows` (key, label,
optional kind/unit/options override, `fixed: {columnKey: text}`, `when: {config, in}`), `values` (key, label, kind,
unit, options, `optional`, `when: {value, equals}`), `skip_when: {value, equals}`, and `criteria`: each
`{type, source: {name, edition}, text, when?: {config, in}}` with type `absolute` (operator, value, unit, optional
`rows`/`columns`, or `seeded: 'isolacao'`), `relative_to_lowest` (max_percent, per column), `equals_column`
(column, reference) or `choice_pass` (column, pass options). Content per § 8.4, with: E1 A, B, C, N × Lado Normal,
Lado Emergência (µΩ); E2 A-T, B-T, C-T, N-T, A-B, B-C, C-A, Linha-carga × Normal fechada, Emergência fechada,
Aberta (MΩ); E3 Fiação × terra (MΩ); E4 pickup and dropout of tensão and frequência for Normal and Emergência
(%), Falta de fase (Ligado|Desligado), TD 1C and TD 2B (s), TD 3A and TD 2E (min), Exercitador
(Desligado|Semanal|Quinzenal|Mensal) × Fábrica (optional), Projeto, Encontrado, Deixado; E5 the five steps ×
Ajuste (optional; fixed "limite 10 s" and "—"), Medido, values `metodo` (falta_real|botao_teste|nao_realizado),
`carga` (sem_carga|com_carga), `carga_percentual` (%), `fonte_tempos` (instrumento|registro_controlador),
`tensao` (V), `frequencia` (Hz), `corrente` (A); E6 Normal, Emergência, Carga × A, B, C with Temperatura (°C), ΔT
similares and ΔT ambiente (°C, typed, optional), Classe (Normal|Possível deficiência|Provável deficiência|Grave),
value `temperatura_ambiente`. E4 and E5 are not switchable.

**Narrowings (each gets a `deferred-work.md` entry and a PR line).** E6's ΔT columns are typed, not computed (the
mock draws them calculated; "no derived column" is the decision). E5's Ajuste is typed, not echoed from E4. The
`.cta-skip` row note is replaced by the method line. The E5 limit is the seeded 10 s (no per-sheet override).
Config is set on the sheet, not in the composer's type dialog (mock 42 draws none). E4 to E6 offer no instrument
picker (the registry has no flag for them). The CTA criteria do not appear in the Critérios de aceitação tab.

**Open questions (owner; conservative reading built).** N-T row of E2 comes from the mock, § 8.4 lists seven rows
(Bruno). E4 has the eight sensor rows of § 8.4, the mock draws five (Bruno). A switched-off test prints nothing,
as a disabled sub-block does today; § 8.4 says "marked NA" (Bruno). How an out cell prints: the existing
convention of the seeded tables, not the mock's "INVESTIGAR" word (Bruno).

## Verification

**Commands (inside the tools container, podman):**
- `pnpm exec vitest run packages/domain` -- expected: green, v1 to v4 hashes unchanged.
- `pnpm lint`, `pnpm static` -- expected: clean.
- `pnpm test:unit`, `pnpm test:api` (under the host lock) -- expected: green but the two reds owned by e14a/e14b until their branches are merged in.
- `pnpm exec tsx scripts/e2e.ts e2e/cta.spec.ts e2e/cta.durability.spec.ts <other touched specs> --project desktop-chrome --project durability-desktop-chrome`, then the durability spec on the android-chrome and webkit projects -- expected: green.
