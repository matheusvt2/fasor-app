---
title: 'e23g: the four findings of the Epic 23 wave 1 integrated review (display reading on tap rows, draft pruning, the group count, the tap line)'
type: 'bugfix'
created: '2026-11-09'
status: 'done'
baseline_revision: '740660838c202fcff874932069d87dce9b524b7b'
review_loop_iteration: 1
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-23-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-e23f-fixes.md'
warnings: ['batched', 'oversized']
batched_reason: 'Four findings (R2-1 to R2-4) of the second pass of the Epic 23 wave 1 integrated review on 6be0a5ec, all on the v13 TTR tap rows or the company type that carries them; one fix batch, one gate, one PR, as the coordinator launched it.'
deferred:
  - summary: >-
      MeasurementTable still draws its tap rows by branching on `row.tap !== null` (the position cell, the plate inputs as text, the tap card), e23b's own render choices; only the count and the two predicates moved to the kernel.
    evidence: |-
      ensaios-section.tsx:552, 554, 592, 624; five occurrences on main 6be0a5ec before this batch. Which markup to draw, not a status or a count; line 592 (`cell.role === 'input'` on a tap row) partly mirrors `tapCellTyped`, whose off-plate reading differs, so moving it would change e23b's off-plate rendering.
    location: >-
      apps/web/src/surfaces/ficha/ensaios-section.tsx:592
    severity: low
---

<intent-contract>

## Intent

**Problem:** The second pass of the wave 1 review (code read of `6be0a5ec`) confirmed four defects around Story 23.8's tap rows
(rows keyed by the tap in whole V, e.g. 13800) and Story 23.7's v13 keys on company types:
R2-1 "Ler visor" on a v13 TTR with TAPS drops every value as `no_cell`, and "Confirmar todos" and its verify count see no tap
row, because the display kernel and `measurement-suggestions.ts` resolve rows against the seeded one-row geometry;
R2-2 removing a nameplate field from a company copy of the v13 transformer leaves `oil_rule.dry_fields`, `pick_from`,
`rows_from` or `applies_when` naming it, an invalid draft the editor cannot repair;
R2-3 the "waiting for the vector group" missing count adds every row of the table, unmarked and off-plate taps included;
R2-4 the tap count above the TTR is computed in `apps/web` (ownership rule AD-1/AD-13).

**Approach:** Resolve a table's rows through `tapRowsOf` (`relatorio/tap-rows.ts`, THE rule of those rows) wherever the
display reading and its suggestions walk or bound rows; prune every v13 key that cites a removed field, the way e22h S1
pruned `oil_rule.fields` (decision of this batch: prune, not refuse, see Design Notes); count only required rows
(`tapRowRequired`) for a missing group; move the tap line's count (and the row predicates the table reads) into the kernel.

## Boundaries & Constraints

**Always:** v1 to v12 sheets behave byte-for-byte as before (a table without `rows_from`, or with TAPS empty, keeps its
seeded rows; every existing display, suggestion and progress test stays green unchanged). The goldens of layout-lock v5,
v11, v12 and Porto Seguro stay byte-equal. `LLM_PROVIDER` and `OCR_PROVIDER` stay `fake`. Every count and predicate the
web shows comes from `packages/domain`. English code and comments; no emoji; no material from `docs/context/`.

**Never:** No contract bump, no seed change, no new op or schema key (if one turns out to be needed, STOP and report to the
orchestrator: contracts 36 to 39 are reserved). No new user-facing string unless unavoidable (if one is, it goes in its
AGENTS.md home and is listed with `// authored:`). No change to the printed document. Do not touch dictation, the run
order or any surface outside the files below.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| R2-1 display on a tap row | v13 transformer, TAPS `13.8;13.2;12.6;12;11.4` kV, target `relacao_transformacao` start `{row: 13800, col: first capture}`, one value | one pending `fill` suggestion at `sheet/{b}/test/relacao_transformacao/cell/13800/{col}` | none |
| R2-1 several values from a tap row | same, start at 13200, values > captures left on that row | values walk the captures in TABLE order (plate order, not ascending volts): rest of 13200, then 12600, ... ; past the last tap row `no_cell` | none |
| R2-1 plate order descending/ascending | TAPS `11.4;12;12.6` (ascending) and `13.8;13.2` (descending) | the walk follows the plate order in both | none |
| R2-1 start row not a plate row | start row 12345, or an off-plate row (a tap removed from TAPS after the shot) | every value `no_cell` (the fold refuses an off-plate write) | none |
| R2-1 unit fallback | no printed unit, the previous TABLE row's stored unit | the previous row in table order, not `row - 1` | none |
| R2-1 TAPS empty / v12 | seeded row 0 | exactly today's behavior | none |
| R2-1 company copy | api passes the version's `tests` and `nameplate` | same placement as the seeded type | nameplate absent: the seed's (as `tests` today) |
| R2-1 Confirmar todos | pending `suggested` fills on 13800, 13200, 12600 | `measurementConfirmAllCandidates` returns 3, `measurementTableVerifyCount` counts `verify` fills on tap rows; a pending fill on an off-plate row is in neither | none |
| R2-2 remove TAPS | company copy of v13 `transformador_forca` | the TTR table loses `rows_from`, TAP ATUAL loses `pick_from`; `validateTypeDraft` returns [] | none |
| R2-2 remove a dry field | remove TEMPERATURA DO ENROLAMENTO, then CLASSE TÉRMICA | `dry_fields` loses each; empty -> the key is deleted (schema takes min 1) | none |
| R2-2 remove a field an `applies_when` names | a draft whose seeded-grammar test and measurement test carry `applies_when` on field X | both `applies_when` deleted (the test applies always, as with no condition); `initial_off` kept | none |
| R2-2 remove TAP ATUAL | the picker itself | nothing else changes; still valid | none |
| R2-3 group missing | v13 TTR, no LIGAÇÃO SECUNDÁRIA, five taps, TAP ATUAL the 3rd | `steps.ensaios.group` = 3 (rows 1, 3, 5) | none |
| R2-3 no TAP ATUAL / off-plate row | five taps, no TAP ATUAL; plus an off-plate row with readings | group = 2; the off-plate row adds 0 | none |
| R2-3 v11/v12 | seeded rows | unchanged: one per row | none |
| R2-4 tap line | evaluated TTR table | the kernel returns the line ("Taps da placa" + count of on-plate taps) or null on a table with no on-plate tap | none |

</intent-contract>

## Code Map

- `packages/domain/src/reading/display.ts:222-276` -- `tableOf`, `captureSlots`, `slotsFor`: walk `table.rows.length`; `slotsFor`'s `findIndex(slot.row > start.row ...)` assumes ascending rows. `buildDisplaySuggestions:349` reads `previous` as `slot.row - 1`. `testOf:300` gets the seed definition (has `nameplate`). Input `tests?` at `:175`.
- `packages/domain/src/relatorio/tap-rows.ts:184` -- `tapRowsOf(block, {nameplate}, table, testKey)` -> `TapRowPlan[] | null` (null: seeded rows stand); `kind: 'off_plate'` rows are refused by the fold (`tapRowAccepted:216`); `tapRowRequired:259`; `tapsLine:295`. Reuse pattern: `cellAddressesOf` in `relatorio/reading-evaluation.ts:517` (filters `off_plate`, adds `offset`).
- `packages/domain/src/relatorio/measurement-suggestions.ts:68-98` -- `tableRows` returns a `[from, to)` range from seeded rows; `tableFills` filters by it. `blockDefinitionIn(ctx, block)` there gives the full definition (nameplate included); `tableFills`' block has `sheet`.
- `packages/domain/src/relatorio/measurement-suggestions.ts:181` -- `displayBurstStops` already uses evaluated rows (the correct reference: skips off-plate rows).
- `apps/api/src/jobs/reading/kinds/display.ts:47-66` -- passes `tests = definition.tests`; must pass `definition.nameplate` too.
- `apps/api/src/jobs/reading/job-display.integration.test.ts` -- the job's integration tests (add one v13 TTR case if its helpers allow it cheaply).
- `packages/domain/src/types/draft-edit.ts:212-240` -- `removeDraftEntry`, part `nameplate`: prunes `criterion_class_field`, bands, `voltage_rows.winding`, `criterion_table`, `oil_rule.field`/`fields` (e22h S1). Add the v13 keys here.
- `packages/domain/src/seed/schema.ts:441-480` -- `checkSeedV13Definition` (what must hold after the prune); `seed/schema.ts:346` `dry_fields` min 1; `seed/measurement.ts:279` measurement `applies_when`.
- `packages/domain/src/seed/v13.ts:82-88,154,159` -- keys `taps`, `tap_atual_kv` (`pick_from: 'taps'`), `temperatura_enrolamento_c`, `classe_termica`, TTR `rows_from: 'taps'`, `dry_fields`. No seeded test carries `applies_when` (`v13.ts:71`): test it on a hand-built draft.
- `packages/domain/src/types/e22h-copies.test.ts:195-250` -- S1 prune tests (`duplicateSeededType`, `removeDraftEntry`, `validateTypeDraft`): the pattern for the new kernel tests.
- `packages/domain/src/relatorio/sheet-progress.ts:207-213` -- `groupMissing` adds `table.rows.length`.
- `apps/web/src/surfaces/ficha/ensaios-section.tsx:466-471` -- `tapRows`, `onPlate` count, `tapsLine(onPlate)`, `optional` predicate: derived in the web.
- `packages/domain/src/relatorio/seed-v13-e23b.test.ts:263-360` -- 23.8 kernel tests and their v13 block builders; `packages/domain/src/reading/display.test.ts:163-275` -- the display I/O matrix tests.
- `e2e/ttr-per-tap.spec.ts` -- 23.8-E2E-001, `transformerRelatorio()`, `typeIn`, `tapRow`, `stepMissing`, `blockRow`; serial group (`e2e/support/groups.ts:215`).
- `e2e/read-display-pipeline.spec.ts:24-62` -- the no-camera init script and `shootDisplay` (file chooser); the api's fake picks the table's default fixture (`relacao_transformacao` -> 34.512, no unit, `kinds/display.ts:27`), `services/ocr/tests/fixtures/display-ttr.jpg`.
- `e2e/type-editor.spec.ts`, `e2e/support/company-type.ts` -- editor helpers (`duplicateLibraryType`, `editorTab`, `publishButton`, `reason`), the row menu "Remover" (`type-editor-parts.tsx:293`).

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/reading/display.ts` -- the slots of a test come from its table's rows as the sheet has them: per table, `tapRowsOf` without `off_plate` entries (row = `offset + entry.row`), else the seeded indices; the walk from `start_cell` is by position in that order (a start row not in it drops every value `no_cell`); the group fill (`count > 1` on a group column) uses the same home lookup; `previous` is the prior row in that order within the same table. Add `nameplate?: readonly FieldDef[]` to `BuildDisplaySuggestionsInput` (absent: the seed definition's). -- R2-1.
- `apps/api/src/jobs/reading/kinds/display.ts` -- pass `nameplate: definition.nameplate` beside `tests`. -- R2-1 on company copies.
- `packages/domain/src/relatorio/measurement-suggestions.ts` -- `tableRows` returns the table's row set as the sheet has it (same rule as above, off-plate rows excluded; seeded range otherwise); `tableFills` filters by membership. -- R2-1 "Confirmar todos" and the verify count.
- `packages/domain/src/types/draft-edit.ts` -- in `removeDraftEntry` part `nameplate`: drop the key from `oil_rule.dry_fields` (delete the key when empty); delete `pick_from` on every field naming it; delete `rows_from` on every test table naming it; delete `applies_when` on every `tests` and `measurement_tests` entry whose `applies_when.field` is it. Update the function's doc comment. -- R2-2.
- `packages/domain/src/relatorio/sheet-progress.ts` -- `groupMissing` adds, per table, the count of rows with `tapRowRequired(row)`. -- R2-3.
- `packages/domain/src/relatorio/tap-rows.ts` -- add a kernel view of a tap table for the screen: e.g. `tapTableLine(rows): TapsLine | null` (count of on-plate tap rows, null at 0), `isTapTable(rows)` and `tapRowOptional(row)` (on plate and not required); export through the domain index as the other tap helpers are. -- R2-4.
- `apps/web/src/surfaces/ficha/ensaios-section.tsx` -- `MeasurementTable` reads those kernel functions; no count or predicate left in the web. -- R2-4.
- Tests (kernel) -- `packages/domain/src/reading/display.test.ts` (or a new `packages/domain/src/relatorio/e23g-wave1-fixes.test.ts`): every R2-1 row of the matrix through `buildDisplaySuggestions`, including a company-copy input (`tests` + `nameplate`), plus `measurementConfirmAllCandidates`/`measurementTableVerifyCount` on tap rows and an off-plate pending fill; R2-2 rows through `removeDraftEntry` + `validateTypeDraft` on `duplicateSeededType(SEED_VERSION, 'transformador_forca')` and a hand-built `applies_when` draft; R2-3 rows through `sheetProgress`; R2-4 the new tap-rows functions (0, 1, five taps, off-plate rows not counted).
- `apps/api/src/jobs/reading/job-display.integration.test.ts` -- one case: a v13 transformer block with TAPS, a display photo on a tap row, the job writes the suggestion on that row (skip only if the file's fixtures cannot build a v13 block without a seed change; say so).
- `e2e/ttr-per-tap.spec.ts` -- new `@p0 23g-E2E-001`: the transformer relatório, TAPS five taps, TAP ATUAL the third, NO LIGAÇÃO SECUNDÁRIA first: the stepper's "Ensaios, N faltando" equals the kernel's `sheetProgress` of the device's block row and its `group` is 3 (R2-3); then online, with the no-camera init script, three "Ler visor" shots on the TTR opener (each one shot, the system picker, `display-ttr.jpg`): suggestions arrive on tap rows 13800, 13200, 12600 (first capture), "Confirmar todos (3)" commits three puts at `cell/{volts}/{col}` with `source_suggestion_id` in one batch, and the stepper count drops to the kernel's value. The tap line's count still reads the kernel's (R2-4).
- `e2e/type-editor.spec.ts` -- new `@p0 23g-E2E-002`: duplicate the library transformer, remove TAPS, TEMPERATURA DO ENROLAMENTO and CLASSE TÉRMICA through the row menu "Remover": no reason in the sticky bar, "Publicar versão 1" enabled, the stored draft (IndexedDB) has no `rows_from`, no `pick_from`, no `dry_fields`, and `validateTypeDraft` of it is [].
- docs -- `_bmad-output/implementation-artifacts/deferred-work.md` (a heading "Epic 23 fix batch e23g" with any row left), `docs/kbs/log.md` one line.

**Acceptance Criteria:**
- Given a v13 transformer with five taps on the plate, when "Ler visor" is read on any tap row, then the value lands on that tap row's capture, "Confirmar todos" confirms it, and the step's missing count drops by the required rows it filled (23g-E2E-001 and the kernel tests).
- Given a company copy of the v13 transformer, when any nameplate field is removed, then the draft still validates (`validateTypeDraft` []) and the editor offers "Publicar" with no reason (23g-E2E-002 and the kernel tests).
- Given a v13 TTR waiting for its vector group, when progress is counted, then only the current tap and the two extremes count, an off-plate or unmarked row adds nothing, and v11/v12 counts are unchanged.
- Given the TTR on screen, when the tap line is drawn, then its count comes from a `packages/domain` function and `ensaios-section.tsx` holds no row count or tap predicate of its own.
- Given every v1-v12 relatório and the Porto Seguro and layout-lock fixtures, when the gate runs, then the existing display, suggestion, progress and golden tests pass unchanged.

## Spec Change Log

- 2026-11-09, late finding (coordinator, wave 1 behavior pass, outside the wave's scope, folded in by the
  coordinator's word): the TTR's missing-group helper read "Informe a LIGAÇÃO SECUNDÁRIA na placa para calcular" on a
  v12/v13 transformer, whose `ligacao_secundaria` field is labelled DESLOCAMENTO ANGULAR (Story 22.7). Amended: the
  constant became `vectorGroupMissingText(label)` with `vectorGroupFieldLabel(definition)` (`relatorio/vector-group.ts`),
  read by `evaluateTable`; the wording is gender-neutral ("Informe o campo {label} na placa para calcular", authored, for
  Bruno), so v11 reads "Informe o campo LIGAÇÃO SECUNDÁRIA ...". On the sheet only (`groupHelper`), never printed: no
  golden moves. Tests: `readings.test.ts` (v11, v12, v13, a relabelled copy, no field), `e2e/ficha.spec.ts` 21.1-E2E-001
  reads the kernel's text and the plate label. KEEP: the v9/v10 helpers (`VECTOR_GROUP_EMPTY_TEXT`,
  `VECTOR_GROUP_UNRECOGNIZED_TEXT`) stay, their seeds label the field LIGAÇÃO SECUNDÁRIA.

## Review Triage Log

### 2026-11-09 — Review pass
- verdicts: 2 findings — high 0, medium 1, low 1, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` (Verification Gap) the api's `nameplate` forwarding in `kinds/display.ts` has no test on a company-type block: the e23g api case uses a seeded transformer, where the kernel's seed fallback hides a dropped forward — patched: a `job-display.integration.test.ts` case on a published copy of the v13 transformer (`type:<id>` block, TAPS, a `display-ttr` shot on tap row 13200, col 3) asserts `[target_path, value, mode]`; 11 of 11; mutation (the nameplate spread removed from the handler) turns only the new case red (1 failed, 10 passed), handler restored.
  - `[low]` `[defer]` (Edge Case Hunter) `ensaios-section.tsx` still branches on `row.tap !== null` (552, 554, 592, 624) — pre-existing e23b render branches (five on main), which markup to draw rather than a status or count; moving line 592 onto `tapCellTyped` would change the off-plate rendering. Deferred (frontmatter, ledger row).

## Design Notes

- **R2-2: prune, not refuse.** e22h S1 made `removeDraftEntry` take with a removed field everything that names it
  (`oil_rule.field` drops the rule, `oil_rule.fields` loses the key, bands, class field, criterion table) so a copy stays
  publishable; refusing would add a new editor state and pt-BR reasons for a removal the S1 path already accepts. The v13
  keys follow the same rule: `dry_fields` and `pick_from` lose the field, `rows_from` goes (the table falls back to its
  seeded row, exactly as with TAPS empty), `applies_when` goes (the test applies always, the schema's "absent" meaning).
- **Rows in table order.** Taps are keyed by volts and listed in plate order, which may descend. Any walk "from the start
  row onward" must use the position in the table's row list, never a numeric comparison of row keys. One helper per file
  is fine; keep `tapRowsOf` the only rule of which rows exist.

## Verification

**Commands** (inside the worktree, `podman compose --profile tools run --rm --user root tools ...`; e2e only under
`lockf -t 20000 /tmp/fasor-verify.lock`, the orchestrator runs the gate):
- `pnpm test:unit -- packages/domain/src/reading packages/domain/src/relatorio packages/domain/src/types` -- expected: green.
- `pnpm lint` and `pnpm static` -- expected: exit 0.
- `pnpm exec tsx scripts/e2e.ts e2e/ttr-per-tap.spec.ts e2e/type-editor.spec.ts --project desktop-chrome --project durability-desktop-chrome` -- expected: green (orchestrator).

## Auto Run Result

- **Implemented** by `bmad-dev-opus-high` (R2-1 to R2-4, kernel and api tests, 23g-E2E-001 and -002). The orchestrator
  folded in the late finding of the coordinator's behavior pass (the missing-group helper names the type's field).
- **Files.**
  - `reading/display.ts`: the walk goes in table order, a start row the sheet lacks drops every value as `no_cell`, the
    unit fallback reads the previous row in table order, and the input gains `nameplate?`.
  - `relatorio/tap-rows.ts`: adds `writableTableRows`, `isTapTable`, `tapRowOptional` and `tapTableLine`.
  - `relatorio/measurement-suggestions.ts`: a table is bounded by its row set, in table order.
  - `relatorio/sheet-progress.ts`: the group count takes only required rows.
  - `types/draft-edit.ts`: prunes the v13 keys.
  - `relatorio/vector-group.ts` and `relatorio/reading-evaluation.ts`: add `vectorGroupMissingText` and
    `vectorGroupFieldLabel`.
  - `apps/api/.../kinds/display.ts`: passes the nameplate.
  - `ensaios-section.tsx`: reads the kernel.
  - Tests: `e23g-wave1-fixes.test.ts`, `readings.test.ts`, `job-display.integration.test.ts`, `ttr-per-tap.spec.ts`,
    `type-editor.spec.ts`, `ficha.spec.ts`.
  - Docs: `deferred-work.md`, `docs/kbs/log.md`.
- **Review.** Edge Case Hunter and Verification Gap Reviewer, opus, one loop. Blind Hunter and Intent Alignment were
  skipped (token economy; the integrated epic review covers them).
  - Findings: 2. One medium patch: the api case on a company copy, with a mutation run that turns only that case red
    without the forward. One low deferral: `MeasurementTable`'s e23b render branches. Nothing rejected.
  - Patched by verdict: high 0, medium 1, low 0.
  - Follow-up review recommended: false.
- **Gate.** Story gate on `03307e4c` under the host lock. Lock wait 0 s; load 1.98 at the start and 3.99 at the end.
  Only the e23g stack was up at the start; e23v's stack (wave 2) was up by the end.
  - lint 0 (23 s) and static 0 (31 s).
  - test:api 926 passed, 6 skipped (378 s); the goldens are unchanged.
  - test:unit 5837 of 5837 (243 s).
  - 8 touched specs, 57 of 57 (parallel 52, serial 5; 226 s): `ttr-per-tap`, `type-editor`, `ficha`,
    `read-display-pipeline`, `read-display`, `dry-transformer.durability`, `company-type-sheet` and
    `test-applicability.durability`.
  - Matrix not run: no fold, commit path or live-query change.
  - Main `606177fe` (#288, docs only) was merged after the gate; the gate stays valid.
- **Residual risks.**
  - `measurementSuggestions` orders a block's fills by numeric row (ledger note).
  - A copy that removes DESLOCAMENTO ANGULAR keeps a TTR read by vector group (ledger decision row, Matheus).
  - Dictation on a v13 tap row was not examined: a tap row's connection text is empty, so it may name no row. This
    is unverified and outside this batch.
