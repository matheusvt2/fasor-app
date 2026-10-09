---
title: 'Review fixes 2026-10-08: a dry transformer can be concluded (one tap marks the oil items NA)'
type: 'feature'
created: '2026-10-08'
status: 'in-review'
baseline_revision: 'f0adf337eda97a933a3881f29281dfd32be94141'
amendment_baseline: '8e3761a' # merge of origin/main f057f9b (#119) before the 2026-10-09 amendment
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/review-fixes-2026-10-08-context.md'
  - '{project-root}/AGENTS.md'
warnings: ['batched', 'oversized']
# batched: the coordinator cut one batch (r8dry) for Decision 2 of the 2026-10-08 review (findings H-4 and the subtype part of MKT-7); both change the same kernel rule and the same nameplate confirm paths.
deferred:
  - summary: >-
      An oil option for TIPO DE ISOLAÇÃO (seed v1 offers only EPÓXI and Á SECO and the field is required, so an oil-filled unit must pick a dry value) waits for a new seed version (owner: Matheus and Bruno).
    evidence: |-
      `packages/domain/src/seed/v1.ts:42`; independent review of PR #120 r8dry-decision-1; source-deltas row "Story 3.5 and FR-11", amended 2026-10-09; deferred-work.md entry.
    severity: medium
  - summary: >-
      Clearing or changing TIPO DE ISOLAÇÃO after the chip wrote the NA marks keeps those marks (the chip goes away, VOL. ÓLEO counts again); whether clearing should offer to unmark is an open question for Matheus.
    evidence: |-
      Independent review r8dry-decision-3; nothing in the decision says what clearing does to marks already written; deferred-work.md entry (class question).
    severity: low
---

<intent-contract>

## Amendment 2026-10-09 (Matheus; supersedes the marked parts below)

Decision (independent review of PR #120, r8dry-decision-1): seed v1 offers only EPÓXI and Á SECO for TIPO DE ISOLAÇÃO and the field is required, so an oil-filled unit is forced to pick a dry value; confirming a dry insulation must therefore **no longer write the NA marks by itself**. Instead:

- A one-tap chip "Marcar N itens de óleo como NA" (N from the kernel; `// authored:`) is offered on a block with no subtype whose **stored** TIPO DE ISOLAÇÃO is EPÓXI or Á SECO, whatever wrote it ("Confirmar", "Substituir", "Confirmar todos", typed, picked, a copy chip, the auto-confirm sweep, another device), while at least one of the dry subtype's oil items has no value yet and the chip was not used on this block on this device. Its tap writes the NA marks on the fresh block's oil items with no value yet, in one batch, with "Desfazer" (toast `oilItemsNaText(n)`).
- The chip goes away once used (and stays away after its "Desfazer"), when the insulation is no longer dry, or when no oil item is left without a value; it never counts an item already answered. "Used" is a device flag per block in `local_prefs` (like `reading_cancelled`); the kernel decides the offer from the block and that flag.
- `VOL. ÓLEO` still stops counting as missing on a block whose subtype or stored insulation is dry. The template subtype works as before (its `na_defaults` display NA; no chip on a block with a subtype).
- Superseded below: every sentence that makes a confirm, "Confirmar todos", a typed value or a hand pick write NA marks or raise an undo toast (Approach; Always bullets 3-4; matrix rows "Confirm dry", "Confirmar todos", "Item already answered", "Every oil item answered", "Picked by hand", "Typed over a fill", "Undo"; Never bullet on copy chips; ACs R8DRY-E2E-001..005 as written). Those paths write exactly what they wrote before this batch, with today's toasts. The matrix rows "Not dry", "Block with subtype", "Missing rule" and "Two devices" stand, read with the chip in place of the confirm.
- The "never mark on a disabled checklist" guard is dropped: `checklist` is a locked sub-block (`LOCKED_SUB_BLOCKS`, `seed/template.ts:34`; `templates/compose.ts:263`), so a stored config cannot disable it.

| Scenario | Input / State | Expected Output / Behavior |
|----------|--------------|---------------------------|
| Confirm dry | no subtype, any dry write path | only that path's own ops and toast; the chip appears under TIPO DE ISOLAÇÃO with N = oil items with no value |
| Chip tap | chip shown, fresh block has `valvula_de_alivio` = C | one batch of 7 `NA` puts (none on that item); toast "7 itens de óleo marcados NA" with "Desfazer"; chip gone; flag set |
| Undo of the chip | "Desfazer" | the marks back to unset; the chip stays gone (flag) |
| Not dry any more | insulation cleared or changed to a non-dry value | chip gone; marks already written stay (open question, deferred) |
| All answered | every oil item has a value | no chip |
| Subtype | config.subtype set | no chip; VOL. ÓLEO not missing |
| Copy chip / auto-confirm | stored EPÓXI written by "Igual à ⟨TAG⟩?" or the sweep | VOL. ÓLEO not missing and the chip offered, as for a confirm |

## Intent

**Problem:** On a transformador de força, TP or TC whose template has no subtype, `VOL. ÓLEO` always counts as a missing nameplate field, so a dry unit (TIPO DE ISOLAÇÃO offers only EPÓXI and Á SECO) cannot be concluded without a made-up value, and its eight oil checklist items stay to be answered by hand (review 2026-10-08 H-4, MKT-7).

**Approach:** Binding decision: `source-deltas.md` row "Story 3.5 and FR-11" (2026-10-08). On a block with no subtype, confirming a nameplate `TIPO DE ISOLAÇÃO` of EPÓXI or Á SECO (one "Confirmar", "Substituir", "Confirmar todos", a value typed over the suggestion, or the select picked by hand) writes, in the same batch, the matching dry subtype's `na_defaults` as `NA` result cells on the oil items that have no value yet; that batch offers "Desfazer". `VOL. ÓLEO` stops counting as missing on a block whose subtype is dry or whose stored insulation is dry. Every rule lives in the kernel; `apps/web` only builds the ops the kernel names.

## Boundaries & Constraints

**Always:**
- The dry rule is one kernel module, `packages/domain/src/relatorio/dry-insulation.ts` (new), exported from `packages/domain/src/index.ts`. The items come from the block's own seed definition (`definition.subtypes[*].na_defaults` of the subtype whose `label` equals the stored value, key `epoxi` or `a_seco`); never a second list.
- "No value yet" means the item's `result` cell is not filled (`isCellFilled`): a cell holding C, NC or NA is never written; a cleared cell (null) is.
- Marks are computed on the fresh rows inside the edit (`api.edit((blocks, by) => …)`), so a C tapped just before is seen.
- Marks are plain `sheet/{blockId}/checklist/{itemKey}/result = 'NA'` puts (`checklistResultOp`) in the same batch as the confirm or the put; no new op family, no `CONTRACT_VERSION` change, no op `meta` key.
- Every "missing" reads one rule: `sheetProgress` (header counter, header sentence, stepper, "Concluir ficha") and the nameplate field's `data-missing-field` marker both read `nameplateMissingKeys`.
- New pt-BR text is derived text (counts) in the kernel, marked `// authored:` and listed in the PR body for Bruno.

**Never:**
- Never change `OIL_RELATED_ITEMS`, the subtypes or any frozen seed (`seed/v1.ts`, `v2.ts`, `v3.ts`); the eight items stay flagged for R-009.
- Never write marks when the block has a subtype (its `na_defaults` already display NA), when its checklist sub-block is disabled, or on a block type without `tipo_de_isolacao`.
- Never edit r8conc's files (`apps/web/src/surfaces/ficha/{use-ficha-actions.ts,conclusao-section.tsx}`, `packages/domain/src/relatorio/conclusion.ts`), `sprint-status.yaml` or `epics.md`; a change needed there is a `deferred-work.md` entry.
- No new print for VOL. ÓLEO: an empty nameplate cell keeps printing `DASH` (`print/section-9.ts:299-305`).
- No marks from the copy chips ("Igual à ⟨TAG⟩?", "Copiar da última visita"), the device auto-confirm sweep or another device's put (open question 1); the VOL. ÓLEO rule still applies to whatever the cell holds.
- No `.only`; unique test ids; no Playwright run outside the host lock.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Confirm dry, fresh sheet | TF, no subtype, oil items unset; "Confirmar" on EPÓXI | one batch: suggestion confirm pair + 8 `NA` puts; toast "…— confirmado · 8 itens de óleo marcados NA" with "Desfazer" | refused write: the editor's write-error toast, nothing half-written |
| Confirmar todos | same, insulation among the picked | one batch: every confirm pair + 8 `NA`; toast `withOilItemsNaText(confirmedAllToastText(…), 8)` with "Desfazer" | as above |
| Item already answered | `valvula_de_alivio` = C (or NC, or NA) | that item untouched; 7 `NA` puts; text says 7 | — |
| Every oil item answered | all 8 filled | no `NA` put; plain confirm toast, no "Desfazer" (today's behaviour) | — |
| Picked by hand | select changed to Á SECO | one batch: nameplate put + `NA` puts; toast "8 itens de óleo marcados NA" with "Desfazer" | no unhandled rejection from `void commit(...)` |
| Typed over a fill | combobox fill EPÓXI, engineer commits Á SECO | one batch: put + discard + `NA` puts; undo toast | — |
| Not dry / cleared | value null, '' or not a subtype label | today's ops, no marks | — |
| Block with subtype | config.subtype `epoxi` | no marks; VOL. ÓLEO not missing | — |
| Undo | "Desfazer" on any batch above | inverse batch: results back to null, insulation back to its previous value, suggestion back to `pending`; VOL. ÓLEO missing again when the insulation is no longer dry | inverse ops sync and are accepted (none `dead`) |
| Missing rule | TF/TP/TC with dry subtype or stored EPÓXI/Á SECO, VOL. ÓLEO empty | `vol_oleo` not in `nameplateMissingKeys`; no marker; Placa count excludes it | — |
| Two devices | B writes C on an oil item while A's `NA` is in flight | existing `mergePolicy`: NA vs NA `same_value`, NA vs empty `filled_over_empty`, NA vs C or NC `contradiction` (seq-later shown, `conflict` kept for "Aplicar") | no silent loss |

</intent-contract>

## Code Map

- `packages/domain/src/seed/v1.ts:41-43,88-108,324-343` -- READ-ONLY. `TIPO_DE_ISOLACAO` select ['EPÓXI','Á SECO'], `VOL_OLEO` (`vol_oleo`), `instrumentTransformerFields` (TP, TC, TF), `OIL_RELATED_ITEMS`, `DRY_SUBTYPES` (labels equal the select options).
- `packages/domain/src/seed/definitions.ts:113-145` -- `findDefinition(seedVersion, blockType)` (non-throwing), `naDefaultsFor`.
- `packages/domain/src/schemas/block-config.ts:139-160` -- `subtypeSchema` ('manual','epoxi','a_seco'), `config.subtype` optional.
- `packages/domain/src/relatorio/sheet-progress.ts:121-135` -- `placaMissing`: the one Placa count (TAG prefill rule via `nameplateTagPrefill`); its doc block at :19-37 states the rule; `checklistResultOf`, `naDefaultsOf`.
- `packages/domain/src/relatorio/sheet-state.ts:32` -- `isCellFilled`; `enabledSubBlocksOf`.
- `packages/domain/src/relatorio/suggestion-ops.ts:25-73` -- `confirmSuggestionOps`, `discardSuggestionOp`, `confirmedAllToastText`, `confirmedFieldToastText`.
- `packages/domain/src/relatorio/ficha.ts:124` -- `itensMarcadosConformeText`: the plural pattern to mirror.
- `packages/domain/src/merge/policy.ts:81-102` -- `mergePolicy` rule order (two-device statement and its test).
- `apps/web/src/surfaces/ficha/nameplate-section.tsx:300-345` -- field loop: `missing={!prefilled && !isCellFilled(stored)}` at :324 (replace with the kernel set); `commit` at :333-338 (`api.commit([nameplateOp…])`).
- `apps/web/src/surfaces/ficha/nameplate-suggestions.tsx:188-275` -- `confirmed`, `sayWhenDrawn` (F-25: say once drawn), `confirm`, `confirmAll`, `type`.
- `apps/web/src/surfaces/ficha/ficha-ops.ts:37-46` -- `nameplateOp`, `checklistResultOp`.
- `apps/web/src/surfaces/ficha/ficha-api.ts`, `apps/web/src/surfaces/relatorio/relatorio-editor.ts:164-178`, `apps/web/src/state/use-undoable-edits.ts` -- `api.edit` (fresh rows, batch id, refused write toasted), `api.undoable(text, batch)` ("Desfazer" → `undoBatch`, generic inverse of every put).
- `apps/web/src/surfaces/ficha/ficha-fields.tsx:447-480` -- `SelectField` calls `void commit(value)` on change.
- `apps/web/src/surfaces/ficha/use-ficha-actions.ts:122-160` -- READ-ONLY (r8conc): "Concluir ficha" decides on `sheetProgress` of the fresh rows, so it follows the kernel rule with no edit.
- `packages/domain/src/relatorio/conclusion.ts:66` -- READ-ONLY (r8conc): `anyAnswered` counts any filled result, so these marks count as answered (deferred entry).
- `e2e/support/reading-ops.ts` -- `transformerPlateFields()` (EPÓXI, no VOL. ÓLEO; TAP ATUAL `verify`, Celtta with a create hint), `pushPlateSuggestions`, `holdPhotoBytes`, `openTransformerSheet(page, account, database, {signIn})` (standard template TF, no subtype).
- `e2e/lost-taps.durability.spec.ts:55-85` -- seeding pattern: `newRelatorioDrafts`, `officeDraft`, `pushDrafts`, `cellAddressesOf`; `signInForDurability` (`e2e/support/durability.ts`), `readStore` (`e2e/support/outbox.ts`), `syncNow` (`e2e/support/sync.ts`).
- `e2e/plate.spec.ts:216-227` -- 8.6-E2E-001 asserts the "Confirmar todos (8)" batch holds 16 ops; with this change it holds 24 (the 8 `NA` puts).

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/relatorio/dry-insulation.ts` (new) -- `INSULATION_FIELD_KEY = 'tipo_de_isolacao'`, `OIL_VOLUME_FIELD_KEY = 'vol_oleo'`; `drySubtypeOfInsulation(definition, value): SubtypeDef | null`; `isDryBlock(block): boolean` (config.subtype `epoxi`/`a_seco`, or the stored insulation maps to one); `dryInsulationNaItems(block, value): string[]` (item keys to mark, definition checklist order, empty per the Never list); `isInsulationTarget(blockId, targetPath): boolean` or an equivalent helper so the web finds the insulation suggestion among picked ones without parsing paths itself; `nameplateMissingKeys(snapshot: {blocks, equipment?}, blockId): ReadonlySet<string>`; texts `oilItemsNaText(n)` ("1 item de óleo marcado NA" / "8 itens de óleo marcados NA") and `withOilItemsNaText(text, n)` (`${text} · ${oilItemsNaText(n)}`, `text` unchanged for 0), both `// authored:`. Export from `index.ts`.
- `packages/domain/src/relatorio/dry-insulation.test.ts` (new) -- the matrix rows above at kernel level for TF, TP and TC: marks per value, subtype, filled C/NC/NA, null cell, disabled checklist, non-transformer type; `nameplateMissingKeys` with and without dry insulation or subtype, TAG prefill kept; texts; the three `mergePolicy` outcomes for a `NA` put against C, NA and an empty cell from another device.
- `packages/domain/src/relatorio/sheet-progress.ts` -- `placaMissing` counts `nameplateMissingKeys(...).size` when the nameplate is enabled; update the rule comment; extend `sheet-progress.test.ts` (Placa 0 on a dry TF with VOL. ÓLEO empty, header sentence and `complete`).
- `apps/web/src/surfaces/ficha/nameplate-section.tsx` -- `missing={missingKeys.has(field.key)}` from `nameplateMissingKeys({blocks: snapshot.blocks, equipment}, block.id)`; for the insulation field, when `drySubtypeOfInsulation(definition, next) !== null` and the block has no subtype, commit through `api.edit` (fresh block: nameplate put + `checklistResultOp(… 'NA')` per `dryInsulationNaItems`) and, when marks were written, `api.undoable(oilItemsNaText(n), batch)`; otherwise today's `api.commit`. The returned promise never rejects unhandled.
- `apps/web/src/surfaces/ficha/nameplate-suggestions.tsx` -- `confirm`, `confirmAll` and `type` append the marks of the insulation value they write (fresh block, inside the build); when marks were written the drawn confirmation shows `api.undoable(withOilItemsNaText(text, n), batch)` (and announces as today) instead of the plain toast; `type` gets the same undo toast. Keep F-25 (said once drawn) and the in-flight guard.
- `e2e/dry-transformer.durability.spec.ts` (new; durability so it runs on the matrix) -- tests R8DRY-E2E-001..004 below, `signInForDurability`, reload checks; seed by office ops only what an AC does not exercise (tests' cells, non-oil checklist items, conclusion pair, plate fields other than the insulation where convenient).
- `e2e/plate.spec.ts` and any other spec that confirms or picks a dry insulation on a no-subtype block (grep `transformerPlateFields`, `Confirmar todos`, `tipo_de_isolacao`, and progress counts on TP/TC/TF sheets) -- update the assertions the new ops change (8.6-E2E-001: 24 ops, the 8 `NA` puts in the batch); no other behaviour change.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- append two entries (owner: coordinator): (1) `conclusion.ts` `anyAnswered` counts these `NA` marks as answers, so a sheet whose only answers are the marks offers the amber conclusion pair (r8conc's file); (2) open question 1 below.

**Acceptance Criteria:**
- Given a transformador de força of the standard template (no subtype) with a plate reading carrying EPÓXI and no VOL. ÓLEO, when the engineer taps "Confirmar todos", fills what remains of the plate except VOL. ÓLEO and taps "Concluir ficha", then the outbox holds one batch with the confirm pairs and exactly 8 `checklist/{oil item}/result = 'NA'` puts (same `batch_id`), then a `block/{id}/concluded_by` op; no `nameplate/vol_oleo` op exists; VOL. ÓLEO never shows `data-missing-field`; after a reload the sheet reads concluded with the 8 rows NA (`@p0 R8DRY-E2E-001`).
- Given the same sheet, when the engineer taps "Confirmar" on the insulation alone, then the toast reads `… — confirmado · 8 itens de óleo marcados NA` with "Desfazer"; when "Desfazer" is pressed, then one inverse batch puts the 8 results to null, the insulation cell to null and the suggestion to `pending`; the field shows the suggestion again, the 8 rows read unset, VOL. ÓLEO is marked missing again; after `syncNow` no outbox row is `dead` (`@p0 R8DRY-E2E-002`).
- Given a no-subtype transformador with `valvula_de_alivio` tapped C, when the engineer picks Á SECO in TIPO DE ISOLAÇÃO by hand, then one batch holds the insulation put and 7 `NA` puts, none on `valvula_de_alivio`; the toast "7 itens de óleo marcados NA" offers "Desfazer"; after a reload `valvula_de_alivio` still reads C (`@p0 R8DRY-E2E-003`).
- Given a pending EPÓXI fill, when the engineer commits Á SECO typed over it, then one batch holds the put, the discard and 8 `NA` puts, with "Desfazer" (`@p1 R8DRY-E2E-004`).
- Given any TF, TP or TC whose subtype is dry or whose stored insulation is EPÓXI or Á SECO, when its progress is computed, then VOL. ÓLEO adds nothing to Placa, the header counter, the stepper or "Concluir ficha", and the field shows no missing marker; without either it counts as before (kernel unit tests).
- Given device A's `NA` mark and device B's concurrent put on the same item, when both reach the server, then `mergePolicy` gives `same_value` for NA, `filled_over_empty` for an empty side and `contradiction` for C or NC (kernel unit test; E4-A8).

**Amendment 2026-10-09 — execution (supersedes the write-path tasks above):**
- `packages/domain/src/relatorio/dry-insulation.ts` -- drop `dryInsulationNaItems`'s value argument in favour of `oilNaChipItems(block, { used }): string[]` (the oil items the chip would mark: no subtype, stored insulation dry via `drySubtypeOfInsulation`, the subtype's `na_defaults` whose result cell is not filled, definition checklist order; `[]` when `used`); remove the unreachable disabled-checklist guard; add `oilNaChipText(n)` "Marcar 1 item de óleo como NA" / "Marcar 8 itens de óleo como NA" (`// authored:`); keep `oilItemsNaText` for the undo toast; remove `withOilItemsNaText` and `isInsulationTarget` if nothing uses them. Tests: offer per TF/TP/TC, subtype, used, all answered, C/NC/NA kept, cleared cell, a config claiming the checklist off still offers (locked), whatever wrote the insulation; texts.
- `apps/web/src/db/prefs.ts` -- `oil_na_used:{blockId}` read/write (pattern of `reading_cancelled`), and a live hook where the chip renders.
- `apps/web/src/surfaces/ficha/nameplate-suggestions.tsx` -- back to its baseline behaviour (no marks, no undo toast; keep #119's changes from the merge).
- `apps/web/src/surfaces/ficha/nameplate-section.tsx` -- the select commits through `api.commit` again (no marks); keep `missingKeys` and `fillManually`; under TIPO DE ISOLAÇÃO (its `after` slot, beside a replace line when there is one) render a `Chip` with `oilNaChipText(n)` while `oilNaChipItems(block, {used})` is non-empty and the sheet is not read-only; its tap writes `checklistResultOp(… 'NA')` for `oilNaChipItems(fresh, {used: false})` of the fresh block inside `api.edit`, sets the device flag once the batch is written, raises `api.undoable(oilItemsNaText(n), batch)` and moves the focus to the TIPO DE ISOLAÇÃO select (the chip unmounts).
- `apps/web/src/surfaces/ficha/nameplate-dry-insulation.test.tsx` -- rewrite: no write path (select, "Confirmar", "Substituir" on a replace line, "Confirmar todos", typed over the guess) builds a checklist op or calls `undoable`; the chip is offered for TF, TP and TC with a stored dry insulation however written (a copy-chip-like stored cell with no `source_suggestion_id`), not with a subtype, not once used; its tap against a fresh block with `valvula_de_alivio` = C builds 7 marks and none on that item (mutation run: rendered block instead of fresh, red).
- `e2e/dry-transformer.durability.spec.ts` -- R8DRY-E2E-001..005 rewritten to the chip (ACs below); `e2e/plate.spec.ts` back to its baseline 8.6-E2E-001 assertions (16 ops, plain toast).
- `_bmad-output/implementation-artifacts/deferred-work.md` -- on the two r8dry entries of 2026-10-08, strike the state through and add a dated 2026-10-09 line (the `anyAnswered` entry: the marks are now the engineer's own tap, so they are an answer; the copy-chip question: resolved, the chip follows the stored value); add the two entries of the frontmatter `deferred` list (oil seed option, owner Matheus and Bruno; clearing keeps the marks, class question).

**Amendment 2026-10-09 — acceptance (supersedes the ACs above where they differ):**
- Given a no-subtype transformador de força with a plate reading carrying EPÓXI and no VOL. ÓLEO, when the engineer taps "Confirmar todos", then the batch holds only the confirm pairs (no checklist op) and the chip "Marcar 8 itens de óleo como NA" shows under TIPO DE ISOLAÇÃO; when the chip is tapped, then one batch holds exactly 8 `checklist/{oil}/result = 'NA'` puts and the chip is gone; when the rest is filled and "Concluir ficha" tapped, then `concluded_by` is committed with no `nameplate/vol_oleo` op, and after a reload the sheet reads concluded with the 8 rows NA and no chip (`@p0 R8DRY-E2E-001`).
- Given the chip applied after "Confirmar" on EPÓXI, when "Desfazer" is pressed, then one inverse batch puts the 8 results back to null, the insulation stays EPÓXI, the chip does not come back (also after a reload), and after `syncNow` no outbox row is `dead` (`@p0 R8DRY-E2E-002`).
- Given `valvula_de_alivio` tapped C, when Á SECO is picked by hand, then that batch holds the insulation put alone and the chip reads "Marcar 7 itens de óleo como NA"; its tap writes 7 marks, none on `valvula_de_alivio`; "Desfazer" puts the 7 back to null and `valvula_de_alivio` stays C after a reload (`@p0 R8DRY-E2E-003`).
- Given a no-subtype TP (or TC) whose plate is copied with "Igual à ⟨TAG⟩?" from a sheet holding EPÓXI, then VOL. ÓLEO shows no missing marker and the chip is offered (`@p1 R8DRY-E2E-004`).
- Given every oil item already answered, when EPÓXI is confirmed, then no chip shows, the batch is the 2 confirm ops and the toast has no "Desfazer" (`@p1 R8DRY-E2E-005`).
- Given the chip shown, when the insulation is cleared, then the chip is gone and VOL. ÓLEO is marked missing again (unit or e2e).

## Spec Change Log

### 2026-10-09 — Matheus's decision after the independent review of PR #120
- Trigger: r8dry-decision-1 (an oil-filled unit forced to pick a dry insulation would get its eight oil items marked NA by the confirm).
- Amended: the "Amendment 2026-10-09" block at the head of the intent contract (chip instead of automatic marks; the disabled-checklist guard dropped as unreachable); title; frontmatter `deferred`.
- Known-bad state avoided: a forced dry pick on an oil-filled unit silently hiding its oil checklist.
- KEEP: the kernel module and `nameplateMissingKeys` as the one "missing" rule (header, stepper, "Concluir ficha", field marker, "Preencher manualmente"); the fresh-block read inside the edit for whatever writes the marks; R8DRY e2e ids and the durability spec file; the plate.spec.ts assertions return to the baseline batch of 16 ops and the plain toast.

## Review Triage Log

### 2026-10-08 — Review pass
- layers: Edge Case Hunter and Verification Gap Reviewer; Blind Hunter and Intent Alignment skipped (token economy; the integrated review covers them).
- verdicts: 9 findings — high 0, medium 1, low 5, false 3, maybe-false 0
- findings:
  - `[medium]` `[patch]` (VG gap 1) The fresh-block read of the oil marks (`commitDryInsulation`, `oilMarks` in `confirm`/`confirmAll`/`type`) is not pinned: swapping it for the rendered `block` keeps every test green, and a C or NC tapped just before would be overwritten by NA — pre-verified gap; fix: a web unit test with a fake `FichaApi` running the captured `Build` against a fresh block that differs from the render.
  - `[low]` `[patch]` (VG gap 2) The "nothing marked" branch (plain toast, no "Desfazer") is not pinned at the web level; a dropped `marked > 0` guard would put "0 itens de óleo" and an undo on every confirm or typed correction — pre-verified gap; fix: `@p1 R8DRY-E2E-005` (all oil items answered, one Confirmar: 2-op batch, plain toast, no "Desfazer") plus unit asserts that `undoable` is not called.
  - `[low]` `[reject]` (VG other 1) A deferred "Desfazer" (raised once the confirm is drawn, F-25) is not retired by a batch written in the gap before it appears; pressing it would reset a newer answer — real but the gap is one live-query render (tens of ms) and the fix needs a write counter on the editor (new surface); listed as known open in the PR.
  - `[low]` `[patch]` (VG other 2) "Preencher manualmente" (`fillManually`) uses its own "empty" predicate and can focus VOL. ÓLEO on a dry block — fix: first key of the kernel `missingKeys`, else the first field.
  - `[low]` `[reject]` (ECH 1) Same root cause as VG other 1 (late "Desfazer" after a newer edit) — same verdict and route.
  - `[low]` `[reject]` (ECH 2) Clearing TIPO DE ISOLAÇÃO after a dry write leaves the NA marks — the specified behaviour (Design Notes: marks are never removed later); the batch's own "Desfazer" reverts them, and the decision asks for no unmarking; adding it would be a product change.
  - `[false]` `[reject]` (ECH 3) A legacy "EPOXI" or other spelling would not match — every write path stores the exact option (`SelectField` options, `parseFieldInput` and `normalizeReadingValue` normalize to EPÓXI / Á SECO, `seed.test.ts:169-183`), and the Porto Seguro fixture holds only "EPÓXI" (22) and "Á SECO" (9).
  - `[false]` `[reject]` (ECH 4) A dry pick on a block with a subtype goes through `api.edit` instead of `api.commit` — it writes the same single put; both paths retire the toast standing when the value is committed (`use-undoable-edits.ts` `commit` and `write`), and the select ignores the promise (`void commit(...)`), so no observable difference.
  - `[false]` `[reject]` (ECH 5) VOL. ÓLEO shows missing while EPÓXI is still a pending suggestion — that is the decision ("confirmed insulation"; a pending suggestion is a row, never a cell); the AC's "never" reads after the confirm, which R8DRY-E2E-001 asserts.

## Design Notes

- Why marks and not a config op: the binding decision says "writes … NA marks … on items that have no value yet"; MKT-7's config-op proposal is superseded by it.
- The undo is the generic `undoBatch` inverse (`ops/outbox.ts` `invertBatch`): a mark's `prev_value` is null or absent, so the item reads unset again, as after every bulk-mark undo in the app; the suggestion status goes back to `pending`.
- Clearing or changing the insulation later never removes marks already written; VOL. ÓLEO counts again only when the stored insulation stops being dry and the block has no dry subtype.
- Open question 1 (kept conservative, PR body and deferred entry): should a copy chip that writes a dry insulation also write the marks? Today it does not.

## Verification

**Commands (worktree root; tools container; e2e only under the host lock, nohup + tagged log `/tmp/gate-r8dry-<stage>.log`, polled):**
- `podman compose --profile tools run --rm --user root tools pnpm test:unit -- packages/domain/src/relatorio` -- expected: green.
- `podman compose --profile tools run --rm --user root tools pnpm lint` and `pnpm static` -- expected: green.
- `nohup sh -c "lockf -t 20000 /tmp/fasor-verify.lock sh -c 'podman compose --profile tools run --rm --user root tools pnpm exec tsx scripts/e2e.ts e2e/dry-transformer.durability.spec.ts e2e/plate.spec.ts --project desktop-chrome --project durability-desktop-chrome'; echo EXIT=\$?" > /tmp/gate-r8dry-dev-e2e.log 2>&1 &` -- expected: EXIT=0.

## Auto Run Result

Status: done

**Summary:** On a transformador de força, TP or TC with no subtype, a dry TIPO DE ISOLAÇÃO (EPÓXI or Á SECO) written by "Confirmar", "Substituir", "Confirmar todos", a value typed over the suggestion or the select picked by hand writes, in the same batch, `NA` on the dry subtype's oil items that hold no value yet (read from the fresh block inside the edit), with "Desfazer" when any mark was written. VOL. ÓLEO no longer counts as missing on a block whose subtype or stored insulation is dry; the Placa count, header, stepper, "Concluir ficha", the field's missing marker and "Preencher manualmente" all read the kernel's `nameplateMissingKeys`.

**Files changed:**
- `packages/domain/src/relatorio/dry-insulation.ts` -- new kernel rule: `drySubtypeOfInsulation`, `isDryBlock`, `dryInsulationNaItems`, `isInsulationTarget`, `nameplateMissingKeys`, texts `oilItemsNaText`, `withOilItemsNaText` (authored).
- `packages/domain/src/relatorio/dry-insulation.test.ts` -- kernel matrix for TF, TP, TC, texts, two-device `mergePolicy` outcomes.
- `packages/domain/src/relatorio/sheet-progress.ts` (+ test) -- Placa count reads `nameplateMissingKeys`.
- `packages/domain/src/index.ts` -- export.
- `apps/web/src/surfaces/ficha/nameplate-section.tsx` -- kernel missing marker, dry pick through `api.edit` with the marks and an undo toast, `fillManually` on the kernel set.
- `apps/web/src/surfaces/ficha/nameplate-suggestions.tsx` -- `confirm`, `confirmAll`, `type` carry the marks; undo toast when marks were written.
- `apps/web/src/surfaces/ficha/nameplate-dry-insulation.test.tsx` -- web unit tests pinning the fresh-block read and the no-undo branches.
- `e2e/dry-transformer.durability.spec.ts` -- R8DRY-E2E-001..005.
- `e2e/plate.spec.ts` -- 8.6-E2E-001 expects the 8 marks in the confirm batch (24 ops) and the longer toast.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- `anyAnswered` entry and open question 1.

**Review:** 9 findings; patches applied 3 (1 medium, 2 low: fresh-block unit test, R8DRY-E2E-005 plus no-undo unit asserts, `fillManually`); deferred 0; rejected 6 (3 false; 3 low: the late "Desfazer" after a newer edit, twice, listed as known open in the PR; clearing the insulation keeps the marks, by design).

**Follow-up review recommended:** false (one medium patched, test-only; no unverified risk named).

**Verification:** lint and static clean; unit suite green (dev run 1935 tests, new web test 7/7); `e2e/dry-transformer.durability.spec.ts` and `e2e/plate.spec.ts` under the lock green; the dry spec on the three matrix projects green (12/12 before R8DRY-E2E-005); mutation runs: marks removed turns R8DRY-E2E-001..004 red; rendered-block read turns 6 of 7 web unit tests red. The story gate runs after this.

**Residual risks:** a "Desfazer" raised after the confirm is drawn (F-25) is not retired by a batch written in that one-render gap; `conclusion.ts` `anyAnswered` counts the marks (deferred, r8conc's file); copy chips write no marks (open question 1).
