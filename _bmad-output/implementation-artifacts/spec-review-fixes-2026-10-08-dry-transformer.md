---
title: 'Review fixes 2026-10-08: a dry transformer can be concluded (dry insulation marks the oil items NA)'
type: 'feature'
created: '2026-10-08'
status: 'in-progress'
baseline_revision: 'f0adf337eda97a933a3881f29281dfd32be94141'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/review-fixes-2026-10-08-context.md'
  - '{project-root}/AGENTS.md'
warnings: ['batched', 'oversized']
# batched: the coordinator cut one batch (r8dry) for Decision 2 of the 2026-10-08 review (findings H-4 and the subtype part of MKT-7); both change the same kernel rule and the same nameplate confirm paths.
deferred: []
---

<intent-contract>

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
