---
type: Architecture Rule
title: Measurement table grammar and the library type Chave de transferência automática (seed v5)
description: Story 14.5. Open before touching the CTA sheet, a measurement test, a block's configuration, the `sheet/test/value` family, or before putting another type on this grammar.
tags: [architecture, kernel, seed, measurement-table, library-type, cta, ad-3, ad-15, ad-21]
timestamp: 2026-10-13T00:00:00Z
sources: [_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md, _bmad-output/planning-artifacts/sprint-change-proposal-2026-10-08.md, ARCHITECTURE-SPINE.md#ad-3, ARCHITECTURE-SPINE.md#ad-15, ARCHITECTURE-SPINE.md#ad-21, packages/domain/src/seed/measurement.ts, packages/domain/src/seed/v5.ts]
---
# Measurement table and the CTA library type

**What it is.** The four FO.SERV-03 table grammars hold one typed capture per row judged by one seeded criterion. Seed v5 adds a generic **measurement-table grammar** and ONE type on it, the Chave de transferência automática (CTA), the first **library type**: seeded code like the eight, offered after them under "Outros equipamentos" and printed in a group of that name after Transformadores. Seed v5 = v4 plus that type; contract 19 (minimum 19).

**Grammar** (`packages/domain/src/seed/measurement.ts`, only what the CTA uses). A measurement test has `key` (a sub-block key), `label`, `row_header`, `columns`, `rows`, optional `values`, `skip_when`, `instrument_of`, `switchable {off_note}` and `criteria`.
- Column: `kind` `number` (with `unit`) or `choice` (with `options`); `optional` means never counted as missing.
- Row: fixed and named; may override its columns' kind, unit and options; `fixed {columnKey: text}` makes a cell text that is never typed; `when {config, in}` shows the row only under a block configuration. A hidden row is not shown, counted, judged or printed, and keeps its index.
- Value: a field of the test outside the table (how it was run); `when {value, equals}` shows it under another value's option; `skip_when` names the value that says the test was not run.
- Criterion, four types: `absolute` (operator, value, unit, optional `rows`/`columns`, or `seeded: 'isolacao'` to reuse the firm's seeded criterion), `relative_to_lowest` (`max_percent` above the lowest measured cell of the column; no verdict under two measured cells), `equals_column` (`column` equals `reference` in the row), `choice_pass` (the options that pass). Every criterion names its `source {name, edition}`; the schema rejects one without it.
- A block definition gains optional `measurement_tests`, `config_fields` (closed choices with a default) and `library`. All additions are `.optional()`, so v1 to v4 keep their hashes.

**Keys (cross-batch contract).** Block type `chave_transferencia_automatica`, TAG prefix `CTA`.

| Test | Key | Switchable | Instrument picker |
| --- | --- | --- | --- |
| E1 Resistência de contato | `cta_resistencia_contato` | yes | resistência de contato |
| E2 Isolamento principal | `cta_isolamento_principal` | yes | isolação |
| E3 Isolamento do controle | `cta_isolamento_controle` | yes | isolação |
| E4 Ajustes do controlador | `cta_ajustes_controlador` | no | none |
| E5 Transferência | `cta_transferencia` | no | none |
| E6 Termografia sob carga | `cta_termografia` | yes | none |

Configuration, in `BlockConfig.options` (default first): `tensao` bt, mt; `polos` 3, also 2 and 4; `neutro` solido, chaveado, sobreposto; `transicao` aberta, retardada, fechada; `bypass` nao, sim. Polos hides the C rows at 2 and shows the N rows only at 4; tensão picks the E2 criterion. E5 values: `metodo`, `carga`, `carga_percentual`, `fonte_tempos`, `tensao`, `frequencia`, `corrente`; E6 value `temperatura_ambiente`.

**Ops (AD-3).**
- Table cell: the existing `sheet/{blockId}/test/{testKey}/cell/{row}/{col}`, `row` the index in the test's row list, `col` the column index.
- Test value: new put family `sheet/test/value`, path `sheet/{blockId}/test/{testKey}/value/{valueKey}`, builder `sheetTestValuePath` (`ops/path.ts`), stored at `sheet.test[testKey].values[valueKey]`.
- Value shape in both: number `{raw, unit, state}`; choice `{raw: optionKey, unit: null, state: 'measured'}` (`choiceValue`).
- Configuration and a test switched off: the existing `block/{id}/config` put, written whole (`blockConfigWithOption`, `blockConfigWithSubBlock`).
- `applyOp` refuses (`SeedPathError`, answered `op_invalid`): the type on a seed version that lacks it, an undeclared value key, a fixed cell, a cell outside the geometry, an instrument or criterion override the test does not hold.

**Status flow (AD-15, AD-22).** Every cell and test value is an edit and field content (`FAMILY_DECISIONS`, `countsAsFieldContent` in `status/edited-since.ts`): the first on a Rascunho relatório carries the Em campo status op, on an Emitido one it reopens as Em revisão. Block configuration is structure. The E5 options are sheet values, not config.

**Where it lives.**
- Kernel (`packages/domain/src`): `seed/measurement.ts`, `seed/v5.ts`, `seed/definitions.ts` (`SEED_VERSION`, `equipmentTypesOf`, `isLibraryType`; `getDefinition` throws for a type its version lacks, `findDefinition` answers null), `relatorio/measurement-evaluation.ts` (the view model: `evaluateSheetMeasurements`, `measurementCounts`, `worstMeasurements`, `configFieldsOf`, labels), `relatorio/tree.ts` (`paletteTypeGroups`, `LIBRARY_GROUP_LABEL`), `print/group-for-print.ts` (kind `outros`), `print/section-9.ts` (CONFIGURAÇÃO table, one table per enabled test with its ACEITÁVEL line), `contract/version.ts`.
- Web: `apps/web/src/surfaces/ficha/configuracao-section.tsx` and `measurement-test-section.tsx`, wired in `ensaios-section.tsx` and `ficha-surface.tsx`; `ficha-ops.ts` (`testValueOp`, `testChoiceCellOp`). A number cell is the sheet's own Measurement field; a choice cell is a Segmented control (two options) or a select (more); a table of more than two value columns stacks into cards below 768 px. The Enter run over a measurement test is the kernel's `measurementRunTarget`. Both palettes read `paletteTypeGroups` (`surfaces/relatorio/block-palette-field.tsx`, `surfaces/templates/block-palette.tsx`). The sheet reuses the seeded sheet's nameplate, checklist, conclusion, photos and points.
- Api tests: `apps/api/src/jobs/generate/docx-cta.test.ts`, `apps/api/src/sync/sync-cta.integration.test.ts`. Playwright: `e2e/cta.spec.ts` (serial group), `e2e/cta.durability.spec.ts`.

**Deliberately not built.** No company-type machinery (registry, resolver context, open enum, editor: Stories 14.6 to 14.8, behind the proposed AD-21 amendment). No rows added on site, no derived column (the E6 ΔT columns are typed), no `between` or average-relative criterion, no cross-test reference (E5's Ajuste is typed), no per-sheet criterion override, no instrument picker on E4 to E6, no CTA rows in the Critérios de aceitação tab, no configuration step in the Template composer. A merged seed version is frozen: a content change is a new version.

**Open next.** The story spec `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md` (I/O matrix, Design Notes); the content in `_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-08.md` § 8.4 and § 8.5 (lines 461-517); the spine's dated notes of 2026-10-13 on AD-3, AD-15 and AD-21; narrowings and questions for Bruno in `_bmad-output/implementation-artifacts/deferred-work.md` (section "Story 14.5"); authored NC phrases in `docs/nc-chip-phrases.md`. Related: [kernel-and-seed](/architecture/kernel-and-seed.md), [ops-and-local-first](/architecture/ops-and-local-first.md), [rendering](/architecture/rendering.md).
