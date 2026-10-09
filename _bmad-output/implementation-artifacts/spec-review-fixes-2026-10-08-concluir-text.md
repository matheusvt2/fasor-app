---
title: 'Review fixes 2026-10-08: Concluir ficha confirms the composed conclusion text'
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
# batched: the coordinator cut one batch (r8conc) for Decision 1 of the 2026-10-08 review: JRN-V1 (the fold) and AIB-1's stale row ship together, because the fold makes every concluded sheet carry a confirmed text, which is exactly what can later go stale.
deferred:
  - summary: >-
      The conclude composes with the project's equipment row even when it is removed (as the ficha's text field and Story 5.8's "Confirmar" do), while section 9 and pre-issue read only live equipment rows, so a live block whose equipment row is removed would get a text that reads stale at once.
    evidence: |-
      `use-ficha-actions.ts` conclude reads `rows.equipment` (project equipment, removed included, `relatorio-editor.ts:70-80`); `useProjectEquipment` feeds the ficha's `tag`; `buildSnapshot` keeps only live equipment rows (`schemas/snapshot.ts:132-133`) for `print/section-9.ts` and `preIssue`. Pre-existing divergence shared with the separate "Confirmar"; reaching it needs a live block whose equipment row was removed (a merge state). Settle by choosing one TAG source for the ficha, section 9 and pre-issue.
    location: >-
      apps/web/src/surfaces/ficha/use-ficha-actions.ts conclude; packages/domain/src/schemas/snapshot.ts buildSnapshot
    severity: low
---

<intent-contract>

## Intent

**Problem:** "Concluir ficha" and "Concluir e avançar" write the D-4 instruments and `concluded_by` but not the conclusion text, so a sheet concluded without the separate text "Confirmar" prints no conclusion paragraph (JRN-V1, about 94 hidden taps per job). And once a confirmed text goes stale (a value or the TAG changed after the confirm), section 9 silently drops it while the pre-issue list still counts it printable (AIB-1, stale-row part).

**Approach:** Per the binding source-deltas row of 2026-10-08 ("Story 5.8: the composed conclusion text …"), the conclude batch also writes `conclusion/text`, `text_status = confirmed` and `text_basis` composed from the fresh rows, when the pair is set and no text was stored yet; a new kernel pre-issue row `conclusion_stale` on section 9 names the TAGs of concluded sheets whose stored text is stale, so the Sumário row and the Export dialog's pre-issue list say it.

## Boundaries & Constraints

**Always:**
- The decision ("confirm the text or not") is a kernel rule (AD-1/AD-13): a new function in `packages/domain/src/relatorio/conclusion.ts`; `use-ficha-actions.ts` only turns its result into ops.
- One batch: D-4 instrument ops, the three text ops and `concluded_by` share one `batch_id` (one `api.edit`).
- The text and its basis come from ONE `composeConclusion` call on the fresh block inside the edit (the same fresh-rows rule Story 12.1 set for completeness), with the tag from the fresh equipment row (`rows.equipment`, `fresh.equipment_id`, `''` when none: the same tag the ficha and `print/section-9.ts` use). A text is never stored under a basis it was not composed from (E5-A4).
- Fold only when ALL hold on the fresh block: `not_tested === null`, the `conclusion` sub-block is enabled (`enabledSubBlocksOf`), `conclusionPairComplete`, and `conclusionTextStatusOf === null`. A `confirmed` or `edited` text (stale or not) is never written by the conclude.
- The stale row uses the existing rule only (`conclusionTextState(...) === 'stale'`, which covers confirmed and edited texts); no print rule changes: `print/section-9.ts`, `conclusionTextForPrint` and the goldens stay as they are.
- New pt-BR copy lives in the kernel and is marked `// authored:`; no emoji; English code and comments.
- Concluding stays the same number of taps (J1, J3 budgets unchanged in `TAP_BUDGET`).

**Never:**
- No change to Story 5.8's separate text "Confirmar", "Substituir" or "Editar", to the `conclusion_unconfirmed` rule, to `EXPLICIT_KINDS`, to section 10 or the parecer (no `parecer_stale`), to `CONTRACT_VERSION`/`MIN_CONTRACT_VERSION`, or to AIB-16's single print rule.
- The conclude never writes the D-7 sheet observation suggestion (open question below), never overwrites a stored text, never adds a toast or a tap.
- Do not edit files owned by r8dry (`nameplate-section.tsx`, `nameplate-suggestions.tsx`, `checklist-section.tsx`, `packages/domain/src/seed/`, `schemas/block-config.ts`) or r8emit's toast files, `sumario-surface.tsx`, `apps/web/src/copy/pt-br.ts`; never `.only`; test ids unique.

## I/O & Edge-Case Matrix

| Scenario | Fresh block at the Concluir tap | Conclude batch | Notes |
|---|---|---|---|
| Unconfirmed text, pair set | `text_status` null, result + restriction set | instruments + `text` (composed) + `text_status`=`confirmed` + `text_basis` (same composition) + `concluded_by` | JRN-V1 fixed |
| Value typed right before the tap | the last reading's commit landed after this render | text/basis composed from the fresh rows (include the last reading); field reads `confirmed`, not stale, after reopening | 12.1 race |
| Edited text | `text_status` = `edited` | instruments + `concluded_by` only | edited untouched |
| Already confirmed (fresh or stale) | `text_status` = `confirmed` | instruments + `concluded_by` only | stale shows stale |
| Conclusion sub-block off | `enabled` lacks `conclusion` | no text ops | |
| Incomplete sheet | progress not complete | nothing written (jump, as today) | unchanged |
| Undo of the conclude batch | `undoBatch`/`invertBatch` of that batch | text, text_status, text_basis, instruments, concluded_by back to their prior values (null) | exact restore |
| Stale after conclude | concluded; TAG renamed or a reading changed | sheet: "Sugerido: texto atualizado — Substituir"; Sumário row 9 and pre-issue: `Texto de conclusão desatualizado: <TAG>` | "Substituir" clears the row |

</intent-contract>

## Code Map

- `apps/web/src/surfaces/ficha/use-ficha-actions.ts:122-155` -- `conclude()`: the one path of the primary ("Concluir e avançar", `copy.ficha.concluir`) and the menu ("Concluir ficha"); its `api.edit` build returns `[...suggestedInstruments(...).map(testInstrumentOp), concludedByOp(...)]`. Build signature `(blocks, by, rows)` with `rows.equipment` (`apps/web/src/surfaces/relatorio/relatorio-editor.ts:22-30`). Needs `definition` as a new param.
- `apps/web/src/surfaces/ficha/ficha-surface.tsx:76-83, 119-134` -- `definition` (`getDefinition(block.seed_version, 'cabine_primaria', block.block_type)`) is in `FichaBody`'s props; pass it to `useFichaActions`.
- `apps/web/src/surfaces/ficha/ficha-ops.ts:100-108` -- `conclusionOp(author, relatorioId, blockId, 'text' | 'text_status' | 'text_basis', value)`: reuse.
- `apps/web/src/surfaces/ficha/conclusao-section.tsx:228-256` -- `confirmText`: the existing confirm (read only, the pattern; it also writes the D-7 observation, which the conclude must not).
- `packages/domain/src/relatorio/conclusion.ts` -- `composeConclusion` (191), `conclusionTextStatusOf` (267), `conclusionTextState` (278), `conclusionPairComplete` (288), `conclusionTextForPrint` (297); `enabledSubBlocksOf` from `./sheet-state.ts`. Add the fold rule here.
- `packages/domain/src/relatorio/pre-issue.ts:61-71, 183-187, 334-347` -- `PreIssueKind`, `conclusionUnconfirmedText`, the `conclusion_unconfirmed` row: add `conclusion_stale` beside it (r8emit's #119 edits plurals in this file; keep the edit local).
- `packages/domain/src/relatorio/ficha.ts:26` -- `sheetOrder(snapshot)` (tree order; `TreeEquipmentNode.name` is the TAG else the type label); `packages/domain/src/text/plural.ts:7` `listPtBr`.
- `packages/domain/src/relatorio/sumario.ts:182-185` -- section 9's meta joins its own pre-issue rows: a new `section_9` row shows on the Sumário row with no web change.
- `packages/domain/src/print/section-9.ts:543-555` -- the print rule (read only; drops a stale confirmed text, prints an edited one).
- `packages/domain/src/ops/outbox.ts:82` `invertBatch`, `ops/apply.ts:468` `applyOp`; `apps/web/src/db/commit.ts:344` `undoBatch`, its tests `apps/web/src/db/commit.test.ts:280-330` -- for the undo test.
- Tests to extend: `packages/domain/src/relatorio/conclusion.test.ts` (fixtures `SEC`, a block builder), `packages/domain/src/relatorio/pre-issue-export.test.ts:110-130` (the `conclusion_unconfirmed` cases), `apps/web/src/db/pre-issue-golden.test.ts` (check the golden still holds).
- E2E: `e2e/tap-budget.spec.ts` (`conclude()` helper, J1 and J3, offline: the ops sit in the outbox; `readStore(page, database, 'outbox')` in `e2e/support/outbox.ts:188`), `e2e/journey-taps.spec.ts:128-146` and `e2e/journeys-12-3-12-4.spec.ts:96-124` (J1/J3 conclude helpers; J2 already taps the text "Confirmar" at :226), `e2e/tap-budget-signal.spec.ts:205-231` (SM-3), `e2e/lost-taps.durability.spec.ts:238-264` (12.1-E2E-004, Concluir right after Enter), `e2e/ficha.spec.ts:700-780` (the text confirm tests, for patterns: `textbox 'Texto da conclusão'`, outbox paths `sheet/{id}/conclusion/text_status`).

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/relatorio/conclusion.ts` -- add `conclusionTextOnConclude(block: BlockRow, definition: BlockDefinition, equipmentTag: string): { text: string; basis: string } | null`: the composed text and basis the conclude confirms, null unless all four conditions of Boundaries hold. JSDoc cites the source-deltas row of 2026-10-08 and D-4. -- the rule lives in the kernel.
- `packages/domain/src/relatorio/pre-issue.ts` -- add kind `conclusion_stale` and `conclusionStaleText(names: readonly string[]): string` (`// authored:`; 1 name: `Texto de conclusão desatualizado: SEC-C05`; more: `Textos de conclusão desatualizados: SEC-C05 e TR-01` via `listPtBr`). In `preIssue`, right after the `conclusion_unconfirmed` row: the live equipment blocks with `sheetState === 'concluida'`, `conclusion` enabled, `conclusionTextForPrint(block) !== null`, a known definition (`findDefinition`; skip unknown seeds), and `conclusionTextState(block, composeConclusion(block, definition, tag)) === 'stale'` (tag from `snapshot.equipment` by `equipment_id`, `''` when none); compose only for those that pass the cheap checks first. Name them in `sheetOrder` order by the node's `name`; one row `{ id: 'conclusion_stale', row: 'section_9', severity: 'pending', kind: 'conclusion_stale' }`. A sheet is never in both rows (`conclusion_unconfirmed` keeps `conclusionTextForPrint === null`). -- AIB-1 stale row; Sumário and Export dialog draw it unchanged.
- `apps/web/src/surfaces/ficha/use-ficha-actions.ts` -- take `definition`; in `conclude()`'s build, after the completeness check, compute `conclusionTextOnConclude(fresh, definition, tagOf(fresh))` and, when non-null, add `conclusionOp(… 'text', text)`, `(… 'text_status', 'confirmed')`, `(… 'text_basis', basis)` between the instrument ops and `concludedByOp`. Update the JSDoc of `conclude` (Decision 1). -- the fold.
- `apps/web/src/surfaces/ficha/ficha-surface.tsx` -- pass `definition` to `useFichaActions`. -- wiring.
- `packages/domain/src/relatorio/conclusion.test.ts` -- unit-test every row of the I/O matrix for `conclusionTextOnConclude` (unconfirmed + pair → text/basis equal to `composeConclusion`; edited, confirmed, confirmed-stale, pair incomplete, conclusion off, not tested → null); after applying the conclude ops (`applyOp`) `conclusionTextState` reads `confirmed` and `conclusionTextForPrint` returns the composed text (section 9 prints it); and the undo: apply the conclude ops (`applyOp`) to a block, invert them (`invertBatch` with the prior values), apply → the block's `sheet.conclusion` and `concluded_by` deep-equal the original. -- kernel coverage.
- `packages/domain/src/relatorio/pre-issue-export.test.ts` -- `conclusion_stale`: one stale confirmed sheet named by TAG; two named in tree order with "e"; an edited stale text named; a fresh confirmed text, an unconcluded sheet and an incomplete pair produce no stale row; no sheet counted in both rows; `conclusionStaleText` singular and plural. -- AIB-1 coverage.
- `e2e/review-concluir-text.spec.ts` (new, ids `R8CONC-E2E-001`…): (001 `@p0`) a complete seccionadora, pair confirmed from the suggestion, text never confirmed: "Concluir e avançar" → outbox `sheet/{id}/conclusion/text` (starts `A seccionadora <TAG>`), `text_status` `confirmed`, `text_basis` (8 hex) in the same `batch_id` as `block/{id}/concluded_by`; back on the sheet the Generated text field shows the confirmed helper and no "Confirmar"; the Sumário row 9 meta has no "sem texto de conclusão confirmado". (002 `@p0`) "Editar", type, blur, then the menu's "Concluir ficha" → the conclude batch carries no `conclusion/text*` op and the last `text_status` op stays `edited`. (003 `@p0`) after 001's conclude, rename the TAG from the sheet menu ("Renomear TAG") → the sheet shows "Sugerido: texto atualizado — Substituir"; the Sumário row 9 reads `Texto de conclusão desatualizado: <new TAG>`; "Substituir" on the sheet → the row is gone. Not a tap-timing spec (parallel group). -- the user-visible ACs.
- `e2e/tap-budget.spec.ts` -- in `conclude()` (or right after it, for J1 and J3): the outbox holds `text`, `text_status` = `confirmed` and `text_basis` of the concluded block in the `concluded_by` batch; `TAP_BUDGET` unchanged; update the header comment (Decision 1, no added tap). -- launch prompt.
- `e2e/journey-taps.spec.ts`, `e2e/journeys-12-3-12-4.spec.ts`, `e2e/tap-budget-signal.spec.ts` -- the same assertion after each J1/J3/SM-3 Concluir (for J2, which taps the text "Confirmar" first, assert only that the last `text_status` op is `confirmed`). These are tap-timing specs: reads happen after the counted tap, never add a tap. -- journeys.
- `e2e/lost-taps.durability.spec.ts` -- in 12.1-E2E-004, after each Concluir: the conclude batch carries `text_status` `confirmed`; for the first delay, reopen the sheet and assert the Generated text field is confirmed, not stale (no "Sugerido: texto atualizado"), proving the text was composed from the fresh rows including the last reading. -- E10-A4 durability.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- append entries (format of the file, owner named): parecer stale row (AIB-1 parecer part, owner coordinator); Concluir and the D-7 observation (open question, owner Matheus); stale edited text print vs block (AIB-1, owner Matheus); the text helper copy now that Concluir confirms (owner Bruno). -- ledger.

**Acceptance Criteria:**
- Given a complete sheet whose pair is set and whose text was never confirmed, when the engineer taps "Concluir e avançar" or the menu's "Concluir ficha", then one batch holds the D-4 instruments, `conclusion/text`, `text_status = confirmed`, `text_basis` and `concluded_by`, and the sheet prints its conclusion paragraph with no extra tap.
- Given an edited or already confirmed text, when the sheet is concluded, then no `conclusion/text*` op is written.
- Given J1 and J3 of the tap budget, when they run, then they stay within `TAP_BUDGET` (9 and 7 taps) and assert `text_status = confirmed` in the conclude batch.
- Given a concluded sheet whose stored text no longer matches its values, when the Sumário or the Export dialog is opened, then section 9's row reads "Texto de conclusão desatualizado: <TAG>" (plural form naming every TAG), the sheet shows "Sugerido: texto atualizado — Substituir", and "Substituir" removes the row.
- Given the conclude batch, when it is undone through the commit path's undo, then every field it wrote is restored to its prior value.

## Spec Change Log

### 2026-10-09 — independent review of PR #121 (coordinator)
- Trigger: r8conc-consistency-1 (medium). Device B edits the conclusion text offline; device A, not having pulled it, concludes: A's composed `text` folds over B's under `latest_text` (B's text kept only in a session-only info entry) and the Conflict view cannot restore it. Amended: in the kernel merge (`packages/domain/src/merge/policy.ts` `mergePolicy`, fed by `ops/apply.ts` `cellOf`), a concurrent put on `sheet/{id}/conclusion/text` whose standing `text_status` cell reads `edited` is a `contradiction` (durable `conflict` carrying the displaced edited text; "Aplicar" restores it), not `latest_text`. No new op field, no new rule name, ~~no contract change~~. *(2026-10-09, focused review of 794757a: the reducer changed, so AD-13 needs a contract bump; see the third entry below.)* Two concurrent *edits* of the text therefore also make a durable decision instead of `latest_text` (stricter, nothing lost). Known-bad state avoided: an edited text silently replaced by a composed one. Covered by kernel tests (both seq orders) and a two-device e2e.
- Trigger: r8conc-consistency-2 (low). The Conflict view words `text_status` as raw tokens: `CONCLUSION_WORDS` gains `confirmed` "Confirmado" and `edited` "Editado" (authored). `text_basis` rows still show the hash (known open).
- Trigger: r8conc-tests-2 (low). Undo of the conclude batch through the commit path (`undoBatch`) with a D-4 instrument op in the batch, in `apps/web/src/db/commit.test.ts`.
- Trigger: r8conc-tests-3 (low). A deterministic web unit test runs `conclude`'s build on fresh rows that differ from the rendered block and asserts the text and basis follow the fresh rows; mutation run (swap `fresh` for `block`) turns it red.
- Trigger: r8conc-rules-1 (high, process). `origin/main` (#119) merged; the story gate re-runs on the merged head.
- r8conc-decision-2, r8conc-decision-1, r8conc-rules-2 (low): behaviour kept; open questions and comment/deferred-entry wording only.
- KEEP: `conclusionTextOnConclude` and its fresh-rows composition; the `conclusion_stale` row; every e2e and unit test of the first pass.

### 2026-10-09 — focused review of 794757a (coordinator; decision by Matheus, 2026-10-09)
- Trigger: the reducer changed without a contract bump (AD-13; `contract/version.ts` precedent at 9, 10, 12 and 13): a contract-15 bundle would fold the case as `latest_text` and diverge from the server. Matheus decided on 2026-10-09 to raise the contract for it: `CONTRACT_VERSION` and `MIN_CONTRACT_VERSION` go to 16 (dated note in `version.ts`; api integration test that a contract-15 pull gets 426; `contract.test.ts` pins updated). The round context's "No `MIN_CONTRACT_VERSION` raise" sentence is struck through with the dated decision (release train in an evening window, the field syncs first, G2-5), a source-deltas row records the merge rule, `docs/kbs/log.md` gains a line, and deferred-work.md a deploy entry (owner Matheus).
- Trigger: r8conc-merge-2 (narrow the rule). The contradiction is only a composed, confirmed text against a standing edited one: the device stamps `meta.composed = true` on a `conclusion/text` put it writes with `text_status = confirmed` (the conclude fold, and Story 5.8's "Confirmar" and "Substituir", which write the same composed text), and `mergePolicy` makes a concurrent flagged put over a standing `text_status = edited` a `contradiction`. Two concurrent edits (and an edited text arriving over a confirmed one) stay `latest_text` (FR-58, Story 10.1). Kernel tests: both seq orders of composed-vs-edited and of edited-vs-edited.
- Trigger: r8conc-merge-3 (one decision). The Conflict view shows `text`, `text_status` and `text_basis` as ONE "Texto da conclusão" row whenever any of the three holds a `conflict`; its two sides are (text, status, basis) triples, and "Aplicar" writes all three puts of the picked side (`applyPickOps`), so no resolution leaves an edited text marked confirmed or a composed text marked edited. A side whose status is `confirmed` but whose text has no durable `conflict` (an edited text that arrived later stood as `latest_text`) is the text the app composes now (`composeConclusion` on the block, its basis with it). Kernel test of each pick set; R8CONC-E2E-004 asserts the three cells after "Aplicar".
- KEEP: everything of the earlier entries except the broader contradiction rule.

## Review Triage Log

### 2026-10-08 — Review pass
- verdicts: 12 findings — high 0, medium 1, low 10, false 1, maybe-false 0
- findings:
  - `[medium]` `[patch]` (verification-gap) The stale row's off-tree fallback naming and its `removed_at` exclusion have no test; deleting either stays green — patch: a `conclusion_stale` unit case with a live stale sheet outside the tree (named last by its TAG) and the same sheet tombstoned (no row).
  - `[low]` `[patch]` (verification-gap, other) J2's `lastTextStatus === 'confirmed'` cannot show the conclude left the confirmed text alone — patch: assert the J2 conclude batch carries no `conclusion/text*` op.
  - `[low]` `[defer]` (edge-case) The conclude takes the TAG from project equipment, removed rows included, while section 9 and pre-issue use live rows only — pre-existing divergence shared with the ficha's text field and Story 5.8's "Confirmar"; needs a live block whose equipment row is removed; deferred (frontmatter).
  - `[low]` `[patch]` (edge-case) A stored text cell with a null `text_status` is overwritten by the conclude — the behavior is right (a null status is unconfirmed: the field shows the composed text and nothing prints), the JSDoc's "no text was stored yet" overstated it — patch: JSDoc reworded to "confirmed or edited".
  - `[low]` `[reject]` (edge-case) Two stale sheets sharing a TAG read "SEC-01 e SEC-01" — a duplicated TAG already has its own `duplicate_tag` row on section 9; disambiguating names adds branches for a state the engineer is already told to fix.
  - `[low]` `[reject]` (edge-case) The stale row's name list is unbounded — many concluded sheets going stale at once needs a change on each; a cap adds a branch and authored copy; listed as known open in the PR.
  - `[low]` `[patch]` (edge-case) J2's assertion passes whether or not the conclude rewrote the text — same defect as the verification-gap "other" row; same patch.
  - `[low]` `[patch]` (edge-case) R8CONC-E2E-003 never re-reads the Export dialog count after "Substituir" though its title says the dialog counts it "until it is tapped" — patch: the count equals the pre-rename count at the end.
  - `[low]` `[reject]` (edge-case, claim) `conclusion_stale` is not in `EXPLICIT_KINDS`, so the Export dialog counts it instead of naming the TAG — the conservative reading chosen in this spec (its twin `conclusion_unconfirmed` is summarized too; "Ver no sumário" leads to row 9, which names the TAGs); fixing it edits the spec's Never list; listed as an open question in the PR.
  - `[low]` `[patch]` (edge-case, claim) The comment above `tag` in `conclude` says it is the TAG section 9 composes with; section 9 reads live equipment only — patch: the comment names the ficha's own source (`useProjectEquipment`, as Story 5.8's "Confirmar").
  - `[false]` `[reject]` (edge-case, claim) The undo test does not deep-equal the original because the undone fields are null cells — refuted as a defect: every reader treats a null cell as absent (`isCellFilled`, `storedText`), so the restored state reads exactly as before; the test asserts the values.
  - `[low]` `[reject]` (edge-case, claim) No UI undo exists for the conclude batch — unchanged behavior (concluding never had an undo toast); the batch's inversion is covered by the kernel `invertBatch` test and the generic `undoBatch` tests; known open in the PR.

## Design Notes

- Fresh composition, not the render's basis: the Concluir tap often lands before the last value's render (Story 12.1, `lost-taps` 12.1-E2E-004); comparing with the render's basis would drop the fold exactly in that case. The tap is the confirmation of what the kernel composes at that moment (D-4 confirms the instrument it computes on the fresh rows the same way); text and basis from one composition keep E5-A4's invariant.
- Open questions (keep the conservative reading; list in the PR body): (1) the review's 14.3 lists "+ D-7 observation" in the conclude batch while the source-deltas row lists only text, status and basis: the conclude does not write the observation suggestion; (2) a stale edited text is named in the stale row but still prints (print vs block is Matheus's, AIB-1); (3) the text helper ("… Impresso na linha Conclusão da seção 9 depois de confirmar.") is mock copy and stays; Bruno may want "confirmado ao concluir a ficha" as the instrument picker says.
- r8dry deferral (`anyAnswered` counting dry-insulation NA marks, PR #120): taken only if #120 is on `origin/main` when the batch finishes; the orchestrator decides at merge time.

## Verification

**Commands (inside the tools container, `podman compose --profile tools run --rm --user root tools …`):**
- `pnpm lint`, `pnpm static` -- expected: no errors.
- `pnpm test:unit -- packages/domain/src/relatorio apps/web/src/db apps/web/src/surfaces/ficha` while iterating, then `pnpm test:unit` -- expected: green.
- `pnpm test:api` -- expected: green (no api change).
- Under the host lock only (the orchestrator runs it): `pnpm exec tsx scripts/e2e.ts e2e/review-concluir-text.spec.ts e2e/tap-budget.spec.ts e2e/tap-budget-signal.spec.ts e2e/journey-taps.spec.ts e2e/journeys-12-3-12-4.spec.ts e2e/lost-taps.durability.spec.ts e2e/ficha.spec.ts e2e/sheet-knows-12-3-12-4.spec.ts e2e/review-field-defects-2.spec.ts --project desktop-chrome --project durability-desktop-chrome`, and `e2e/lost-taps.durability.spec.ts` on the three durability projects -- expected: green. The implementation subagent never runs Playwright outside the lock.
- Mutation run (orchestrator, under the lock): drop the three text ops from `conclude()` → `e2e/tap-budget.spec.ts` and R8CONC-E2E-001 go red; restore.

## Auto Run Result

Status: done (2026-10-09, branch `fix/review-2026-10-08-concluir-text`).

**Summary.** "Concluir e avançar" and the menu's "Concluir ficha" now confirm the kernel-composed conclusion text in the conclude batch (`text`, `text_status = confirmed`, `text_basis`, composed once from the fresh rows) when the pair is set and no text was confirmed or edited yet; an edited or confirmed text is untouched. A new section 9 pre-issue row `conclusion_stale` names, in tree order, the concluded sheets whose stored text went stale; the Sumário row 9 shows it and the Export dialog counts it. No print rule, contract or copy file changed.

**Files.**
- `packages/domain/src/relatorio/conclusion.ts` -- `conclusionTextOnConclude` (the fold rule).
- `packages/domain/src/relatorio/pre-issue.ts` -- kind `conclusion_stale`, `conclusionStaleText` (authored), `staleConclusionNames`.
- `apps/web/src/surfaces/ficha/use-ficha-actions.ts`, `ficha-surface.tsx` -- the three text ops in the conclude batch; `definition` passed in.
- `packages/domain/src/relatorio/conclusion.test.ts`, `pre-issue-export.test.ts` -- the I/O matrix, apply and undo through `invertBatch`, the stale row (tree order, off-tree, removed, both rows exclusive).
- `e2e/review-concluir-text.spec.ts` (R8CONC-E2E-001..003), `e2e/support/conclude-batch.ts`; outbox assertions in `tap-budget`, `tap-budget-signal`, `journey-taps`, `journeys-12-3-12-4` and `lost-taps.durability` specs.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- eight entries (open questions and known open).

**Review.** Two layers (Edge Case Hunter, Verification Gap); Blind Hunter and Intent Alignment skipped for token economy. 12 findings: 6 patched (1 medium, 5 low), 1 deferred (low, EC-1 TAG source), 5 rejected (see the triage log). One review-fix loop; a re-check reviewer then read only the loop's patches: all five ok, two wording nits and one restored J2 assertion applied. Patched by verdict: high 0, medium 1, low 5. Follow-up review recommended: false (one medium patched, no high).

**Verification (story gate, head 5ff621e, under the host lock, LOCKED_AFTER 0 s).** lint 0 errors (24 existing warnings; the first lint run failed only on a mutation scratch file inside the worktree, removed and re-run green); static green; test:api 574 passed; test:unit 3185 passed; touched specs on desktop-chrome and durability-desktop-chrome 66 passed (240 s); `lost-taps.durability.spec.ts` on durability-android-chrome and durability-webkit 13 passed, 1 skipped by design (12.1-E2E-007 on webkit). Mutation run: with the three text ops dropped from `conclude`, 5.1-E2E-001 (J1) and R8CONC-E2E-001 fail on "the conclude batch confirms the text"; restored.

**Residual risks.** The conclude still has no UI undo (unchanged); the Export dialog counts the stale row rather than naming it (open question); the stale row's name list is uncapped; a live block with a removed equipment row composes with a TAG section 9 does not use (pre-existing).

### Second pass (2026-10-09, independent review of PR #121)

- `origin/main` f057f9b (#119) merged into the branch (merge fef4ba8; deferred-work.md resolved keeping every row of both sides).
- consistency-1 fixed in the kernel: `mergePolicy` (`packages/domain/src/merge/policy.ts`) makes a concurrent put on `sheet/{id}/conclusion/text` a `contradiction` while the standing `text_status` reads `edited` (`ops/apply.ts` `cellOf` passes the cell as `textStatus`). The edited text stays as the cell's durable `conflict` (or stands), and "Aplicar" in the Conflict view restores it. ~~No op field, rule name or contract version changed.~~ *(2026-10-09, focused review of 794757a: the reducer changed, so AD-13 needs a contract bump; see the third entry below.)* Covered by `merge/policy.test.ts` (both seq orders) and the two-device `R8CONC-E2E-004` in `e2e/conflicts.spec.ts`.
- consistency-2: `CONCLUSION_WORDS` reads `confirmed` "Confirmado" and `edited` "Editado" (authored); `text_basis` hashes stay (known open).
- tests-2: `apps/web/src/db/commit.test.ts` undoes a conclude-shaped batch (D-4 instrument, three text ops, `concluded_by`) through `undoBatch`.
- tests-3: `apps/web/src/surfaces/ficha/use-ficha-actions.test.tsx` runs the conclude's build on fresh rows that differ from the rendered block; mutation run in the PR body.
- rules-2, decision-1, decision-2: D-7 comments amended; open questions recorded in deferred-work.md (owners Matheus, Bruno).
- Gate note: the compose `api` dev server (`tsx watch`) does not reload `packages/domain` changes, so a first e2e run on the merged head met a server folding with the previous kernel (R8CONC-E2E-004 red, server cell `latest_text`). The api is restarted before every e2e run of the second gate.
- `origin/main` 9027abf (#120) merged too (merge 3390670); r8dry's `anyAnswered` deferral no longer applies (Matheus's 2026-10-09 amendment of Decision 2: the oil NA marks come from a one-tap chip), so `anyAnswered` is unchanged.
- Story gate on 3390670: lint, static, test:api 576, test:unit 3288, touched specs 82 passed (desktop-chrome and durability-desktop-chrome, api restarted first), matrix `lost-taps.durability.spec.ts` 13 passed and 1 skipped by design. Mutation runs (on 56e8df4, same mechanism files): fresh rows swapped for the rendered block turns `use-ficha-actions.test.tsx` red (12.1-E2E-004 stays green: timing-dependent, as the review predicted); the edited-text contradiction removed turns two `policy.test.ts` cases and R8CONC-E2E-004 red.
