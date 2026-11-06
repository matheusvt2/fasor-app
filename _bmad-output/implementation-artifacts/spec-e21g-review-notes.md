---
title: 'Epic 21 follow-up fix batch e21g: review notes N-1 to N-5 and the two e21r deferred rows'
type: 'bugfix'
created: '2026-11-06'
status: 'in-progress'
baseline_revision: 'ac9ca7ddd2e7af8cf72835be1cc2a9dacddb3a5e'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'medium'
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-21-context.md'
warnings: ['batched']
batched_reason: 'Seven small coordinator decisions (D1 to D7) on the same two stories (21.1, 21.3) and the same kernel files; one PR keeps one gate.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The Epic 21 integrated review (`epic-21-integrated-review-2026-11-05.md`, N-1 to N-5) and two e21r deferred rows left small defects: a v11 transformer with no LIGAÇÃO SECUNDÁRIA shows and prints the Dyn1 terminal pairs as capture headers (N-1); a v9/v10 empty LIGAÇÃO SECUNDÁRIA is called "não reconhecida" (N-2); the gallery note still says "Ordem cronológica de captura" though Geral photos can now be moved (N-3); the conclusion suggestion can offer "Aprovado · Sem restrições" while a ratio table waits for its group (e21r row); "Concluir ficha" can land on Ensaios with nothing focused when the missing group is the only gap (e21r row).

**Approach:** Build exactly the coordinator's decisions D1 to D7 (2026-11-06, under Matheus's "revise usando sua inteligencia"): neutral capture headers while the group is missing, a distinct empty-field helper on v9/v10, a reworded gallery note, no "Sem restrições" suggestion over a missing group, and a Concluir jump to the LIGAÇÃO SECUNDÁRIA field. D4 and D5 change nothing and are recorded below.

## Boundaries & Constraints

**Always:**
- Derived text lives in `packages/domain` (`// authored:` comment); static surface copy in `apps/web/src/copy/pt-br.ts` (`// authored:`). AGENTS.md "Where a new user-facing string goes".
- v9/v10 behaviour stays as today apart from D2's helper text: an empty or unparsed LIGAÇÃO SECUNDÁRIA still computes as Dyn1 and keeps the Dyn1 pairs.
- Storage stays addressed by column index; no op, path, contract or seed change. `CONTRACT_VERSION` stays 30.
- No emoji. Code and comments English; UI copy pt-BR.

**Never:**
- No change to counts: `sheetProgress` missing totals per step stay what they are today (D7 adds a share, never a count).
- No change for D4 (`geralPhotoMoveKey` end bound) or D5 (unmapped plate value dropped on v11).
- Do not touch `services/ocr`, `contract/ocr.ts`, goldens, seeds or `docx.ts`/`layout.ts`.
- No new mock look; no new component.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| D1 v11 no group | v11 transformer, LIGAÇÃO SECUNDÁRIA empty (or a value naming no group, e.g. "Y") | capture `VisibleColumn.label` and `EvaluatedCell.column` read "Fase 1", "Fase 2", "Fase 3"; section 9 prints "FASE 1", "FASE 2", "FASE 3"; `groupHelper` still `VECTOR_GROUP_MISSING_TEXT` | none |
| D1 v11 group set | v11, "Yyn0" | the group's pairs as today | none |
| D1 v9/v10 empty | v10, empty | Dyn1 pairs (unchanged) | none |
| D2 v9/v10 empty | v9 or v10, LIGAÇÃO SECUNDÁRIA null, '' or whitespace only | `groupHelper` = "LIGAÇÃO SECUNDÁRIA vazia: calculado como Dyn1"; still 62,90 and Dyn1 pairs | none |
| D2 v9/v10 unparsed | v9 or v10, "Y", "DYN", "estrela-estrela" | `groupHelper` = "Ligação não reconhecida: calculado como Dyn1" (unchanged) | none |
| D6 missing group | v11 transformer, group missing, everything else within and answered, no NC | `suggestConclusionPair` = null | none |
| D6 missing group + restriction | same plus an NC row or a reading out | `{ aprovado, com_restricoes }` (unchanged) | none |
| D6 group set | v11 "Yyn0", all within | `{ aprovado, sem_restricoes }` | none |
| D7 group only gap | v11, every field complete except: the ratio tables wait for the group because LIGAÇÃO SECUNDÁRIA holds a value naming no group ("Y") | kernel jump target = step `placa`, field `ligacao_secundaria`; the app lands on Placa with that select focused | none |
| D7 empty field | v11, LIGAÇÃO SECUNDÁRIA empty and the only plate gap, rest complete | lands on Placa with LIGAÇÃO SECUNDÁRIA focused (already true today: Placa counts the empty field; pinned by test) | none |
| D7 other gap | an empty reading cell besides the group | today's behaviour: Ensaios, the first missing cell focused | none |

</intent-contract>

## Code Map

- `packages/domain/src/relatorio/reading-evaluation.ts:163-308` -- `evaluateTable`: `resolution`, `group`, `groupMissing`, `labelOf` (174-178) feeds both `VisibleColumn.label` (182) and `EvaluatedCell.column` (210); `groupHelper` at 304. D1 and D2 land here.
- `packages/domain/src/relatorio/reading-cells.ts:228-248` -- `RatioGroupResolution` (`group`, `assumed`) and `ratioGroupOf`; the field value is `block.sheet.nameplate[VECTOR_GROUP_FIELD]?.value`. D2 needs to know "blank" (null, non-string, or `trim() === ''`, the `isCellFilled` rule of `relatorio/sheet-state.ts:33`). Also the `EvaluatedTable.groupHelper` doc comment at ~126-130.
- `packages/domain/src/relatorio/vector-group.ts:224-243` -- `vectorGroupCaptureLabel`, `VECTOR_GROUP_MISSING_TEXT`, `VECTOR_GROUP_UNRECOGNIZED_TEXT`. Add the new authored text and the neutral label here; export through the same barrel the existing ones use (check `packages/domain/src/index.ts` / `relatorio/readings.ts`).
- `packages/domain/src/print/section-9.ts:504-510` -- headers read `evaluated.columns[].label` through `printLabel` (caps), so D1 prints with no change here.
- `packages/domain/src/relatorio/conclusion.ts:79-102` -- `suggestConclusionPair`; `unjudged` at 99. D6: a table with `groupMissing` makes the sheet unjudged (`if (!restricted && unjudged) return null`).
- `packages/domain/src/relatorio/sheet-progress.ts:85-110,191-243` -- `SheetStepProgress` (has optional shares `cabine`, `observation`), `ensaiosCounts` (computes the `groupMissing` rows, 195-199), `sheetProgress`, `firstIncompleteStep`. D7 adds an optional ensaios share and a pure jump-target function.
- `apps/web/src/surfaces/ficha/use-ficha-actions.ts:131-178` -- `conclude`: `firstMissing = freshProgress.firstIncompleteStep ?? 'placa'`, then `goTo(firstMissing, true)`; props type `goTo` at 104.
- `apps/web/src/surfaces/ficha/use-ficha-steps.ts:31-33,71-131` -- `goTo(step, missing)`: lands on the first visible `[data-missing-field]` of `#ficha-step-{step}`, then a watch loop re-focuses it. D7 extends it with an optional field key (`[data-field-key="…"]` inside the step host, `focusableIn`).
- `apps/web/src/surfaces/ficha/ficha-fields.tsx:652-700` -- `SelectField`: the `<select>` inside `.field[data-field-key]`; a stored value outside the options renders as its own option.
- `apps/web/src/surfaces/ficha/use-ficha-actions.test.tsx:~122` -- mocks `goTo: vi.fn()`; keep compiling.
- `apps/web/src/copy/pt-br.ts:959-970` -- `gallery.note(m: Mention)`, the two variants (`m.prints` true/false). D3. The substring "Os números são provisórios até a exportação (… do relatório)." is asserted by `apps/web/src/surfaces/compact-template-sections.test.tsx:142`; keep it.
- `packages/domain/src/photos/order.ts:203-213` -- `galleryTileOrder`: Geral tiles fill their capture-order slots in section 7's order; sheet, item and local photos keep capture order. This is what the D3 note must say.
- Tests to extend: `packages/domain/src/relatorio/readings.test.ts:722-777` (v11 no group, v9/v10 empty/unparsed), `packages/domain/src/print/section-9.test.ts:1139-1140` (v11 null prints `DYN1_HEADER` today), `packages/domain/src/relatorio/conclusion.test.ts` (`5.8-UNIT suggestConclusionPair` at 73), `packages/domain/src/relatorio/sheet-progress*.test.ts` or `readings.test.ts` for the jump target, `e2e/ficha.spec.ts:687-727` (21.1-E2E-001: no-group state, add headers), `e2e/photo-order.spec.ts:206-260` (three widths, add the note), e2e seeding pattern for a complete transformer sheet: `e2e/dry-transformer.durability.spec.ts:60-145` (`seedCabines`, `seedReadings`, checklist and conclusion drafts, `newRelatorioDrafts`, `emCampoDraft`, `pushDrafts`).

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/relatorio/vector-group.ts` -- add `// authored: e21g D2` `VECTOR_GROUP_EMPTY_TEXT = 'LIGAÇÃO SECUNDÁRIA vazia: calculado como Dyn1'` and `// authored: e21g D1` `vectorGroupNeutralCaptureLabel(phase: number): string` returning `Fase ${phase + 1}`; export both like the existing constants.
- `packages/domain/src/relatorio/reading-cells.ts` -- `RatioGroupResolution` gains `blank: boolean` (the LIGAÇÃO SECUNDÁRIA value is null, not a string, or blank after trim); set it in every branch of `ratioGroupOf`; update the `groupHelper` doc comment.
- `packages/domain/src/relatorio/reading-evaluation.ts` -- `labelOf`: while `groupMissing` and the column is a capture, return the neutral label of its capture index; `groupHelper`: missing -> MISSING; assumed and blank -> EMPTY; assumed -> UNRECOGNIZED; else null.
- `packages/domain/src/relatorio/conclusion.ts` -- D6: `unjudged` is also true when any evaluated table has `groupMissing`; update the doc comment.
- `packages/domain/src/relatorio/sheet-progress.ts` -- D7: `SheetStepProgress.group?: number` on `ensaios` only, the share of `missing` that is ratio rows waiting for the vector group (present only when > 0, like `cabine`); new exported pure function `sheetJumpTarget(progress: Pick<SheetProgress, 'firstIncompleteStep' | 'steps'>): { step: SheetStep; fieldKey: string | null } | null`: null when complete; `{ step: 'placa', fieldKey: VECTOR_GROUP_FIELD }` when the first incomplete step is `ensaios` and its `missing` equals its `group`; else `{ step: firstIncompleteStep, fieldKey: null }`. Export through the domain barrel.
- `apps/web/src/surfaces/ficha/use-ficha-steps.ts` -- `goTo(step, missing, fieldKey?: string | null)`: with a field key, the land and the watch target `[data-field-key="{key}"]` inside the step host (visible), focused through `focusableIn`; otherwise unchanged. Update the interface doc.
- `apps/web/src/surfaces/ficha/use-ficha-actions.ts` -- `conclude` reads `sheetJumpTarget(freshProgress)` (fallback `{ step: 'placa', fieldKey: null }`) and calls `goTo(target.step, true, target.fieldKey)`; widen the `goTo` prop type.
- `apps/web/src/copy/pt-br.ts` -- D3: add `// authored: e21g D3` key `gallery.orderNote: 'Fotos gerais na ordem do relatório (mude com Subir e Descer); fotos das fichas na ordem de captura.'` and make both `note` variants start with it in place of "Ordem cronológica de captura.", the rest of each sentence unchanged.
- `packages/domain/src/relatorio/readings.test.ts` -- D1: v11 with null, '' and 'Y' gives capture labels and cell `column` "Fase 1".."Fase 3"; D2: v9/v10 with null, '' and '   ' give the EMPTY text, 'Y', 'DYN', 'estrela-estrela' keep UNRECOGNIZED (split the existing loop at 769-778); `blank` asserted on `ratioGroupOf`.
- `packages/domain/src/print/section-9.test.ts` -- D1: `ratioTable('v11', null)` prints `header(['FASE 1', 'FASE 2', 'FASE 3'])` with `row('-', '-')`; `ratioTable('v10', null)` keeps `DYN1_HEADER`.
- `packages/domain/src/relatorio/conclusion.test.ts` -- D6: v11 transformer, all checklist C, ratio captures measured, group missing -> null; with an NC -> com_restricoes; with "Yyn0" and captures within -> sem_restricoes.
- `packages/domain/src/relatorio/` test for D7 (in `readings.test.ts` next to the missing-group tests, or the sheet-progress test file) -- `steps.ensaios.group` equals the ratio rows on a v11 'Y' sheet and is absent with a group; `sheetJumpTarget` gives placa/ligacao_secundaria when the group is the only Ensaios gap, ensaios/null when a cell is also missing, null when complete, and the first incomplete step otherwise.
- `e2e/ficha.spec.ts` -- extend `@p0 21.1-E2E-001`: before the group is chosen, the table headers read `['TAP nº', 'V primário (kV)', 'V secundário (V)', 'Calculado', 'Fase 1', 'Fase 2', 'Fase 3', 'Condição']` at 1280 and 768, and at 390 the card labels read "Fase 1".."Fase 3"; no "X1-X0" anywhere in the table; then restore 1280 and continue the test as it is. Add `@p0 21.1-E2E-004` (D7): a v11 transformer sheet seeded complete by office drafts (plate, cabines, checklist, readings, conclusion pair Aprovado · Sem restrições) except LIGAÇÃO SECUNDÁRIA; case A, LIGAÇÃO SECUNDÁRIA empty; case B, LIGAÇÃO SECUNDÁRIA "Y" by office draft (a stored value naming no group): in each, from the Ensaios step, the sheet Overflow "Concluir ficha" announces the incomplete text, makes Placa the current step and focuses the `select` of `[data-field-key="ligacao_secundaria"]`, and nothing is concluded; choosing "Yyn0" then reads "Ficha completa". At 1280 and 390.
- `e2e/photo-order.spec.ts` -- in the three-width test, assert the gallery `.section-note` contains `copy.gallery.orderNote` and not "Ordem cronológica" (import `copy` from `../apps/web/src/copy/pt-br.ts`, as `e2e/cadastros.spec.ts` does).
- `_bmad-output/implementation-artifacts/deferred-work.md` -- under "Deferred from: Epic 21 batch e21r", the two review rows (`suggestConclusionPair` and "Concluir ficha" lands on Ensaios) gain a `state:` line "closed (2026-11-06, fix batch e21g, D6 / D7, PR #PR)".
- `_bmad-output/planning-artifacts/epics.md` -- a dated italic line under Story 21.1 (after its 2026-11-05 note) naming D1, D2, D4 (none), D5 (none), D6, D7, and under Story 21.3 naming D3 and D4; PR number placeholder `#PR` filled after opening. Strike nothing; add only.
- `docs/kbs/architecture/kernel-and-seed.md` and `docs/kbs/log.md` -- one dated sentence each: neutral headers while the group is missing, the empty-field helper, the jump target.

**Acceptance Criteria:**
- Given a v11 transformador de força with no LIGAÇÃO SECUNDÁRIA, when its Ensaios step renders at 1280, 768 or 390 px, then the three capture headers (cards at 390) read "Fase 1", "Fase 2", "Fase 3" and no Dyn1 terminal pair is shown; once "Yyn0" is chosen the Yyn0 pairs show.
- Given the same sheet, when the relatório's section 9 is laid out, then the ratio table's capture headers print "FASE 1", "FASE 2", "FASE 3".
- Given a v10 transformer whose LIGAÇÃO SECUNDÁRIA is empty, when its ratio table evaluates, then it computes U1 · √3 / U2 with the Dyn1 pairs and the helper reads "LIGAÇÃO SECUNDÁRIA vazia: calculado como Dyn1"; with "Y" it reads "Ligação não reconhecida: calculado como Dyn1".
- Given the gallery of a relatório with section 7, when it opens at 390, 768 or 1280 px, then its note starts "Fotos gerais na ordem do relatório (mude com Subir e Descer); fotos das fichas na ordem de captura." and never says "Ordem cronológica de captura".
- Given a v11 transformer whose ratio waits for its group and nothing else restricts it, when the Conclusão step renders, then no "Aprovado · Sem restrições?" suggestion is offered.
- Given a v11 transformer whose only gap is the vector group, when the engineer taps "Concluir ficha" in the sheet Overflow, then Placa becomes the current step and the LIGAÇÃO SECUNDÁRIA select holds the focus, and nothing is concluded.

## Spec Change Log

## Review Triage Log

## Design Notes

- **D1 scope.** "Fase N" applies only while `groupMissing` (v11, `ratio_factor: 'vector_group'`, no parsed group), to capture columns, by capture index. v9/v10 never reach it (their unparsed group is Dyn1, assumed). The neutral label is pt-BR derived text, so it lives in the kernel beside `vectorGroupCaptureLabel`. `headerText("Fase 1")` and `printLabel` give "Fase 1" and "FASE 1".
- **D2.** "Blank" follows `isCellFilled`: null, missing, non-string or whitespace-only. A non-blank text the parser does not map keeps the old line.
- **D3 copy.** Authored by the coordinator's decision: the gallery shows the Geral tiles in section 7's order (`galleryTileOrder`), movable with Subir and Descer, while sheet, item and local photos keep capture order; both facts are said. "do relatório" rather than the section's number, because the absent-section variant has no printed section 7.
- **D4, accepted as designed.** `geralPhotoMoveKey` gives a photo moved to the end a key just above its new upper neighbour's capture instant; an import keeps its capture-time place among unmoved photos and a new capture lands last. That is the coordinator's reading of Story 21.3 ("a new photo lands last"); nothing changes. Mention it to Bruno in the release note if WhatsApp imports arrive after reordering.
- **D5, accepted as designed.** On v11 a plate value the parser does not map (such as "Y") is dropped (`reading/build.ts`, narrowing O-3 of PR #255): an ambiguous plate value is never guessed into a group; the empty field and the ratio helper ask for it.
- **D6 rule.** Treat a missing group as an unjudged ratio: it suppresses only the Sem restrições pass; a restriction (NC, out reading, failed ratio) still suggests Com restrições. No measured-capture condition: with the group missing the ratio cannot be judged whatever was typed.
- **D7 finding.** With LIGAÇÃO SECUNDÁRIA empty, Placa already counts the field missing and is the first incomplete step, so "Concluir ficha" already lands on it, focusing its first missing field (LIGAÇÃO SECUNDÁRIA when it is the only one). The e21r row's state (Ensaios, nothing focused) arises when the field holds a value that names no group (a stored text from outside the select's options, which `SelectField` keeps readable): Placa counts it filled, Ensaios counts the group missing. The jump target covers that case and the e2e pins both. The count stays where it is; only the landing changes.

## Verification

**Commands** (inside the tools container of compose project `fasor-e21g`, never on the host; Playwright only under the host lock):
- `podman compose --profile tools run --rm --user root tools pnpm exec vitest run packages/domain/src/relatorio packages/domain/src/print/section-9.test.ts` -- expected: green.
- `podman compose --profile tools run --rm --user root tools pnpm exec vitest run apps/web/src/surfaces/ficha apps/web/src/surfaces/compact-template-sections.test.tsx apps/web/src/surfaces/photos` -- expected: green.
- `podman compose --profile tools run --rm --user root tools pnpm lint` and `pnpm static` -- expected: clean.
