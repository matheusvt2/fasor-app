---
title: 'Story 5.9: mark an equipment as not tested, plus the cabine tree row and Repetir fixes'
type: 'feature'
created: '2026-09-24'
status: 'in-progress'
baseline_revision: 'b6511e3b423f38207bf56fb7f0a38722b7f7f16c'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
warnings: ['batched', 'oversized']
deferred: []
---

<!--
Dev model: sonnet · Effort: medium. Batched: Story 5.9 plus two PR #30 (Stories 5.1-5.4)
review leftovers that touch the same sheet shell and tree files -- one PR keeps the shared
surface coherent and saves a second worktree/verify cycle (Epic 5 token budget).
-->

<intent-contract>

## Intent

**Problem:** An equipment that cannot be tested has no way to be marked so; PR #30 left two
known-open gaps: the cabine's tree row (AC2) has no e2e proof it reads live SE/env data, and
"Repetir da ficha anterior do mesmo tipo" overwrites rows the engineer already answered.

**Approach:** Build the not-tested action (sheet header Overflow + tree Block card Overflow),
its reason picker, the persistent Not-tested band with a sync-aware "Desfazer", and read-only
rendering of nameplate/checklist (tests/conclusion are Batch B/C's own sections, gated behind
a new shared `useSheetReadOnly()` context those sections must honor once built). Fix
`repeatChecklistPattern` to skip already-answered rows. Add e2e proof that `cabineMetaText`
(kernel, already DESIGN.md-compliant: "SE · 13,8 kV · 19 °C · 67 %") updates live in both tree
presentations once "Da cabine" is filled -- no code change there, DESIGN.md's literal format
already excludes tensão secundária/potência (source of the AC2 ambiguity).

## Boundaries & Constraints

**Always:** every status/count/verdict/text lives once in `packages/domain` (AD-1/AD-13);
`not_tested` writes go through `block/{id}/not_tested` (`applyOp`'s `block/field` case already
applies it, E3-A3 already validates `sheet/*` paths, nothing to change in `apply.ts`); reuse
`sheetState`/`notTestedReasonText`/`SHEET_STATE_GLYPH` (already wired into the tree/rail by
Story 4.4/4.5 -- do not touch `tree.ts`'s tree-building code); the 3 seed reasons
(`getSeed(seedVersion,'cabine_primaria').not_tested_reasons`) are the only source of reason
labels, never a hardcoded list; mock markup verbatim (`key-sheet-states.html` frame (a):
`.not-tested-chip`, `.not-tested-band` > `.band-text`/`.band-reason` + `btn btn-text`
"Desfazer"; `60-ficha.html` header Overflow item and toast text
"Marcada como não ensaiada — entra na seção 8"); DESIGN.md's Block card row overrides a
literal mock gap: "Marcar não ensaiado" goes right after "Duplicar" in the equipment
Overflow; DESIGN.md's Read-only field row ("Overflow trigger hidden") -- `components.css`
already has `.is-readonly .overflow-trigger{display:none}`, `.is-readonly .tri-state
{pointer-events:none}`, `.not-tested-chip`, `.not-tested-band` -- no new CSS, no `.frame-*`
rule.

**Never:** do not build the Measurement table / Conclusion control / Suggestion field /
Generated text field (Batch B's `ensaios-section.tsx`/`conclusao-section.tsx`, still stubs on
this branch -- render nothing, just read `useSheetReadOnly()` is NOT yet possible since they
take no props/context read today; instead wrap the new context provider around the whole
`.content` block so it is available the moment Batch B's sections start calling the hook, and
record the contract in `deferred-work.md`). Do not touch `cabine-block.tsx`'s `editable` logic
(cabine data is not in the AC2/AC-2-of-5.9 read-only list). Do not add a humidity/secondary-kv
field to `cabineMetaText` (DESIGN.md's literal format wins over the epics.md AC's looser
"tensions, power" paraphrase). Do not edit `sprint-status.yaml` or `epics.md`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Mark not tested, reason picked | Sheet header Overflow "Marcar não ensaiado" -> chip row, pick "Solicitação do cliente" | `block/{id}/not_tested={reason,text:null,at,by}` put; toast "Marcada como não ensaiada — entra na seção 8"; band renders; nameplate/checklist go read-only | none |
| Mark not tested, "Outro" | Chip "Outro" picked, text typed | Same put with `text` set to the typed string (trimmed; empty stays null) | none |
| Desfazer, unsynced | Not-tested op still `pending`/`sent` in the outbox, or no local outbox row and this device wrote it this session | Tapping "Desfazer" puts `not_tested=null` at once, no dialog | none |
| Desfazer, synced | The not-tested op's outbox row is `acked` | Tapping "Desfazer" opens a Confirm dialog; only on confirm does it put `not_tested=null` | Cancel leaves the band as is |
| Repetir, mixed rows | Target has `contatos=NC` (answered) and `motor` unset; source has `contatos=C`, `motor=NC` | Only `motor` is written (`NC`); `contatos` untouched | none |
| Repetir, NA default | Target's `na_defaults` shows `motor=NA` with no cell; source has `motor=C` | `motor` untouched (na_defaults counts as answered, same rule as "Marcar Conforme") | none |
| `sheetProgress`, not tested | `block.not_tested !== null`, nameplate/checklist empty | Every step `missing=0`, `complete=true`, `firstIncompleteStep=null` | none |

</intent-contract>

## Code Map

- `packages/domain/src/relatorio/sheet-progress.ts` `sheetProgress` -- add an early return right after `block`/`definition` are resolved: `if (block.not_tested !== null) return { steps: <all-zero>, complete: true, firstIncompleteStep: null }`.
- `packages/domain/src/relatorio/ficha.ts` `repeatChecklistPattern` (currently: copies any item whose source value differs from the target's current value) -- change the loop to skip an item when `checklistResultOf(target, item.key) !== null` (already answered or `na_defaults`), matching `checklistUnsetItems`'s rule. Add `lastNotTestedReason(blocks: readonly Pick<BlockRow,'not_tested'|'removed_at'>[]): string | null` (latest `not_tested.at` among live blocks, by reason key) beside `notTestedReasonText` usage patterns.
- `packages/domain/src/seed/definitions.ts` `getSeed(seedVersion,'cabine_primaria').not_tested_reasons` -- the 3 reasons (reuse, do not hardcode).
- `apps/web/src/surfaces/ficha/ficha-ops.ts` -- add `notTestedOp(author, relatorioId, blockId, value: {reason,text,at} | null): OpDraft` (`put` on `block/{blockId}/not_tested`; value spreads `{...value, by: author.id}` or null).
- `apps/web/src/surfaces/ficha/sheet-read-only.tsx` (NEW) -- `SheetReadOnlyProvider`/`useSheetReadOnly()`, a plain boolean context (see `apps/web/src/state/back-target.tsx` for the shape to copy).
- `apps/web/src/surfaces/ficha/ficha-surface.tsx` -- wrap `<div className="content">...</div>`'s children in `<SheetReadOnlyProvider value={block.not_tested !== null}>`; header menu gains `{ id: 'nao-ensaiado', label: copy.sumario.tree.markNotTested, onAction: () => setNotTestedDialogOpen(true) }` when `block.not_tested === null`; render `<NotTestedBand>` (new) right above `#ficha-step-placa` when `block.not_tested !== null`; pass a not-tested flag to `FichaHeader` for the `.not-tested-chip`; suppress the Sticky bar's `BulkActionBar` mirror when read-only (`checklistOnScreen && definition.checklist !== null && block.not_tested === null`).
- `apps/web/src/surfaces/ficha/ficha-header.tsx` -- accept `notTested?: boolean`; render `{notTested ? <span className="not-tested-chip">{t.notTestedChip}</span> : null}` right after the TAG button, inside `.sheet-title` (mock: `key-sheet-states.html` line ~82).
- `apps/web/src/surfaces/ficha/not-tested-band.tsx` (NEW) -- `.not-tested-band[role=status]` > `.band-text` (with `.band-reason` wrapping the reason text, via `notTestedReasonText`) + `btn btn-text` "Desfazer"; on press, `notTestedSynced(db, blockId)` (new, `db/sync-store.ts`) decides direct undo vs `ConfirmDialog` first; the actual undo is `api.edit((_blocks, by) => [notTestedOp(by, relatorioId, blockId, null)])`.
- `apps/web/src/db/sync-store.ts` -- add `notTestedSynced(db, blockId): Promise<boolean>`: `db.outbox.where('path').equals(\`block/${blockId}/not_tested\`).toArray()`; empty -> `true` (nothing local to wait on); else the row with the latest `client_ts` has `status==='acked'`.
- `apps/web/src/surfaces/ficha/nameplate-section.tsx` -- `const readOnly = useSheetReadOnly();`; when `readOnly`, force `showFields = true` and render `ReadOnlyField` (not `SheetField`) per `definition.nameplate` entry, skipping the copy-chip/"Digitar" branch entirely.
- `apps/web/src/surfaces/ficha/checklist-section.tsx` -- `ChecklistSection`: `const readOnly = useSheetReadOnly();` section className `readOnly ? 'section is-readonly' : 'section'`; section-head gets `{readOnly ? <span className="btn-reason">{t.readOnlyReason}</span> : null}` beside the `<h2>`; skip `<BulkActionBar>` when `readOnly`; pass `readOnly` to each `ChecklistRow`. `ChecklistRow`: `TriStateControl readOnly={readOnly}`; textarea gets `readOnly={readOnly}`; hide the NC chip row when `readOnly`; `required = !readOnly && nc && empty`. The Overflow trigger needs no JS change -- `components.css`'s `.is-readonly .overflow-trigger{display:none}` already hides it once the ancestor section carries the class.
- `apps/web/src/components/tri-state-control.tsx` -- add `readOnly?: boolean` to `TriStateControlProps`; when true, set `aria-disabled="true"` on the radiogroup div and make `moveTo`/`onKeyDown`'s Delete branch/`onClick` no-ops (CSS already blocks pointer events; this covers keyboard).
- `apps/web/src/surfaces/relatorio/not-tested-dialog.tsx` (NEW) -- shared by the sheet header and the tree's Block card: `FormDialog` (`../../components/index.ts`) titled `copy.sumario.tree.markNotTested`, a `FilterChipGroup` (`components/chip.tsx`, `disallowEmptySelection`) over the seed's 3 reasons (`selectedId` defaults to `lastReason ?? reasons[0].key`), a text field shown only when the selected id is `'outro'` (same literal-key convention as `notTestedReasonText` in `tree.ts`), Cancelar/`copy.sumario.tree.markNotTested`(as the primary's label) buttons; `onSubmit(reasonKey, text)`.
- `apps/web/src/surfaces/relatorio/tree-actions.ts` -- add `markNotTested: (node: TreeEquipmentNode, reason: string, text: string | null) => void` to `TreeActions`, built like `renameTag` (one `edit` batch writing `notTestedOp`, `showToast` the mock's toast text on success, no undo — the band gives it once the sheet is opened).
- `apps/web/src/surfaces/relatorio/relatorio-tree.tsx` -- `Dialog` union gains `{ kind: 'not-tested'; node: TreeEquipmentNode }`; `equipmentMenu` inserts `{ id: 'not-tested', label: copy.sumario.tree.markNotTested, onAction: () => shared.openDialog({ kind: 'not-tested', node }) }` right after the `duplicate` push, only when `node.state !== 'nao_ensaiada'`; render `<NotTestedDialog>` beside the other `dialog?.kind===` blocks, `lastReason={lastNotTestedReason(snapshot.blocks)}`, `onSubmit={(reason,text) => { setDialog(null); actions.markNotTested(dialog.node, reason, text); }}`.
- `apps/web/src/copy/pt-br.ts` -- `ficha.notTestedChip: 'Não ensaiado'`; `ficha.notTestedToast: 'Marcada como não ensaiada — entra na seção 8'` (verbatim, `60-ficha.html`); `ficha.notTestedBandText(reason: string): {before,reason,after}`-shaped or a plain sentence-composer matching `"Não ensaiado — {reason}. Os campos ficam somente leitura; a ficha imprime com os dados de placa e o motivo, e entra na seção 8 automaticamente."` (verbatim, `key-sheet-states.html`); `ficha.desfazer: 'Desfazer'`; `ficha.notTestedConfirmTitle`/`notTestedConfirmDescription`/`notTestedConfirmAction` (`// authored:`, the sync-gated Confirm dialog); `ficha.checklist.readOnlyReason: 'Somente leitura — equipamento não ensaiado'` (verbatim); `ficha.nameplate` needs no read-only string (`ReadOnlyField` has its own copy already); `sumario.tree.markNotTested: 'Marcar não ensaiado'` (verbatim, DESIGN.md Block card row / `60-ficha.html` header Overflow) -- used as both entry points' action label and both dialogs' title/primary.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- append one entry: the `useSheetReadOnly()` contract (`apps/web/src/surfaces/ficha/sheet-read-only.tsx`) Batch B's `ensaios-section.tsx`/`conclusao-section.tsx` must read once built, rendering their own fields via `ReadOnlyField` the same way this spec does for the nameplate; note the current split (Batch B = Stories 5.5-5.8) supersedes the stale "owner: 5.5-5.7" wording on the two existing stub entries.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/relatorio/sheet-progress.ts` + `.test.ts` -- the not-tested early return; unit test: a block with `not_tested` set and every field empty still reports `complete:true`.
- `packages/domain/src/relatorio/ficha.ts` + `.test.ts` -- `repeatChecklistPattern` fix; extend the existing "repeats the pattern" test with a target row already answered (`contatos=C` on the target, source `contatos=NC`) asserting `contatos` is absent from the pattern; add `lastNotTestedReason` + its unit test (no marked blocks -> null; two marked blocks -> the later `at` wins).
- `apps/web/src/surfaces/ficha/ficha-ops.ts` -- `notTestedOp`.
- `apps/web/src/surfaces/ficha/sheet-read-only.tsx` (NEW).
- `apps/web/src/surfaces/ficha/ficha-surface.tsx`, `ficha-header.tsx`, `not-tested-band.tsx` (NEW), `nameplate-section.tsx`, `checklist-section.tsx` -- per Code Map.
- `apps/web/src/components/tri-state-control.tsx` -- `readOnly` prop; if a `.test.tsx` exists beside it, add a case asserting `aria-disabled` and that `onChange` never fires on click/Delete when `readOnly`.
- `apps/web/src/db/sync-store.ts` + its `.test.ts` -- `notTestedSynced`: empty outbox -> true; one `pending` row -> false; one `acked` row -> true; two rows (older `acked`, newer `pending`) -> false (latest wins).
- `apps/web/src/surfaces/relatorio/not-tested-dialog.tsx` (NEW), `tree-actions.ts`, `relatorio-tree.tsx` -- per Code Map.
- `apps/web/src/copy/pt-br.ts` -- the new keys.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- the contract entry.
- `e2e/ficha.spec.ts` -- extend, `@p0` unless noted: mark not tested from the sheet header (chip row, "Outro" reveals the text field, toast, band renders with the right reason, chip in the title, "Concluir ficha" absent from the menu and Progress reads "Completa"); nameplate/checklist render `aria-readonly`/`aria-disabled` with no Overflow trigger and no bulk bar; "Desfazer" while unsynced clears it at once (seed the relatório fully offline, as the file's existing tests already do -- everything starts unsynced); "Repetir" no longer overwrites an already-answered row (seed a concluded same-type sheet plus a target with one row already answered differently, tap Repetir, assert the answered row is unchanged and the previously-unset row took the source's value). `@p1`: "Desfazer" after sync opens the Confirm dialog (seed an `acked` outbox row directly, as the file's durability-style tests do for outbox status).
- `e2e/tree.spec.ts` -- extend `@p0`: "Marcar não ensaiado" from a Block card Overflow, reason chip picked, row shows the Not-tested state/chip in both the Sumário row and the rail; extend the existing cabine-meta assertions (around the `.s9-cab-meta`/`.tree-meta` checks already in the file) to fill `TIPO DE SE` + `TENSÃO PRIMÁRIA` + `TEMPERATURA` + `UMIDADE` on the cabine's first sheet and assert both `.s9-cab-meta` and the rail's `.tree-meta` update to `cabineMetaText`'s format live (no reload) -- this is the AC2 leftover: proof only, `cabineMetaText` itself is unchanged.

**Acceptance Criteria:** epics.md `## Epic 5` Story 5.9 (`_bmad-output/planning-artifacts/epics.md:1560-1577`), Given/When/Then as written. Story 5.2 AC2 (`epics.md:1386-1411`) is satisfied by the existing `cabineMetaText`/`node.meta` (DESIGN.md § Relatório tree: "Cabine rows show `meta` 'SE · 13,8 kV · 19 °C · 67 %' read-only") -- this spec only adds the missing e2e proof. Story 5.4 AC4's "Repetir" sentence (`epics.md:1462-1464`), narrowed by this spec's launch prompt to "only the unset rows, same rule as Marcar os restantes como Conforme."

## Design Notes

- **Why no labeled fields in the tree row (AC2):** epics.md's Story 5.2 AC2 parenthetical ("TIPO DE SE, tensions, power, temperature, humidity ... under the same label") reads broader than what ships. DESIGN.md's Relatório tree row is explicit and literal: `meta` "SE · 13,8 kV · 19 °C · 67 %" -- type, primary voltage, temperature, humidity only, no tensão secundária/potência, no per-field labels. AGENTS.md: DESIGN.md wins over a looser AC paraphrase. `cabineMetaText` (`packages/domain/src/relatorio/sumario.ts`, shipped since PR #26) already matches this exactly and is already unit-tested; PR #30's reviewer flagged "no tree-row surface reads se/env" without finding it. This spec closes the gap with e2e proof, not a behavior change.
- **`useSheetReadOnly()` as a context, not a prop:** `EnsaiosSection`/`ConclusaoSection` currently take no props and Batch B owns their real content; threading a `readOnly` prop through call sites Batch B will also edit risks a merge conflict for no benefit. A context read with `useSheetReadOnly()` inside Batch B's own future component body needs no signature change to `<EnsaiosSection />`/`<ConclusaoSection />` in `ficha-surface.tsx`.
- **Desfazer's sync gate is per-write, not per-outbox:** `notTestedSynced` reads only the `block/{id}/not_tested` path's own outbox rows (indexed), not the whole relatório's backlog -- a sheet's not-tested mark can be synced while other edits on the same relatório are still pending, and the gate must reflect that one write, not the Sync badge's global state.
- **OPEN QUESTION:** whether "Marcar não ensaiado" from the tree's Block card should stay available on an already-concluded sheet (AR-17 precedence allows not_tested to override concluded_by; epics.md AC1 states no restriction). Kept available whenever `node.state !== 'nao_ensaiada'`, the most literal reading of the AC.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:unit -- sheet-progress ficha.test tri-state-control sync-store` -- expected: new + existing kernel/web unit tests green.
- `docker compose --profile tools run --rm tools pnpm exec playwright test e2e/ficha.spec.ts e2e/tree.spec.ts --grep @p0` -- expected: green.
- `docker compose --profile tools run --rm tools pnpm verify` -- expected: green, full output pasted in the PR body (final run of the batch).
