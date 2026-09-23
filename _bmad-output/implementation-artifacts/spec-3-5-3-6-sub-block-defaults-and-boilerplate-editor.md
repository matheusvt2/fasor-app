---
title: 'Stories 3.5 and 3.6: sub-block defaults, subtypes and the boilerplate text editor'
type: 'feature'
created: '2026-09-23'
status: 'done'
baseline_revision: '33b54be56ea06492690ddfbfdb6f9ac9e3898588'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md' # Story 3.5 lines 1032-1052, Story 3.6 lines 1054-1074
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-3-3-4-templates-list-and-composer.md' # Design Notes "Seams for batch D"
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/mockups/prototype/screens/42-template-composer.html' # tc-dlg-rich dialog markup (toolbar rows are data-slice="out", ignore them)
warnings: ['multiple-goals', 'oversized']
deferred:
  - summary: >-
      A duplicate section of the same block_type could receive another section's edited
      text because section addressing is by index plus block_type, not a stable id.
    evidence: |-
      Review pass, 2026-09-23. writeSectionText's guard checks block_type but not a stable
      identity; this is the same pre-existing "composer section actions act by index" debt
      already logged in deferred-work.md from PR #19's review (severity low). 3.6 inherits
      that addressing model rather than introducing a new one.
    location: >-
      apps/web/src/surfaces/templates/template-composer.tsx (writeSectionText)
    severity: low
  - summary: >-
      A mobile/virtual-keyboard Backspace or Delete reported with key "Unidentified" might
      bypass the section text editor's keydown-based atomic chip removal.
    evidence: |-
      Review pass, 2026-09-23 (Edge Case Hunter, maybe-false). Only desktop Chromium was
      exercised; the guard in section-text-editor.ts's chipAtCaret/removeChipAtCaret is
      reached from a keydown handler. Would need a real Android tablet or WebKit pass typing
      and deleting a chip to settle. If true, this would be medium (breaks the "atomic,
      removable" AC on the product's primary tablet target).
    location: >-
      apps/web/src/surfaces/templates/section-text-dialog.tsx (onKeyDown)
    severity: medium (unverified)
  - summary: >-
      typeConfigFor trusts the first placement's config with no schema rule enforcing that
      every placement of an equipment type stays in sync.
    evidence: |-
      Review pass, 2026-09-23 (Blind Hunter). No checkTemplateRow refinement exists for this.
      Currently unreachable via the app's own write paths (setTypeDefaults and setQuantity
      always keep placements in sync, and blocks is one LWW field), so this only matters if
      a future write path bypasses those functions. A schema-level fix is non-trivial.
    location: >-
      packages/domain/src/templates/compose.ts (typeConfigFor)
    severity: low
---

<intent-contract>

## Intent

**Problem:** Equipment blocks in the template composer always carry every sub-block enabled and no subtype, so a field engineer sees checklist rows that never apply to that unit; section blocks carry only the seed's fixed boilerplate with no per-template override, so a company cannot adjust wording once, for every relatório made from that template.

**Approach:** Add a per-type "sub-block defaults" panel opened from each equipment palette row, backed by a kernel `setTypeDefaults` that updates every placement of that type in one commit (the seed already models one subtype per type per template — `SUBTYPE_OF` in `seed/template.ts`). Add a per-section "Editar texto" dialog on the section card's Overflow, a plain-text `contenteditable` area holding atomic, keyboard-removable variable chips, backed by a new `templateBlockSchema.section_text` override field and a kernel `resolveSectionText` resolver.

## Boundaries & Constraints

**Always:**
- `checklist` and `conclusion` (`LOCKED_SUB_BLOCKS`, `seed/template.ts:34`) render "Sempre" and are never a control.
- A subtype only sets `na_defaults` from the seed's per-subtype list (`getDefinition(...).subtypes`, data-driven — never hardcode which types have which subtypes); no checklist item is ever removed or hidden.
- One `BlockConfig` (`subtype`, `sub_blocks`, `na_defaults`) is shared by every `blocks` entry of the same `block_type` in a template, mirroring the seed's own one-subtype-per-type model; `setTypeDefaults` updates all of them atomically in one `commitBatch`.
- Section text is plain text only — no rich-text toolbar, no formatting runs (FR-12 is Epic 11; the mock's `tc-dlg-rich .rt-toolbar` is `data-slice="out"`, do not build it).
- A variable chip is atomic: inserted whole at the caret, removed whole (Backspace/Delete deletes the entire token, never one of its characters).
- Both edits are one `commitBatch` of `template/{id}` ops, autosaved; neither ever touches a relatório already created from that template (copy-on-create).

**Never:**
- Do not build `renderer`, `progress`, `groupForPrint` or a kernel `integrity` surface (Epic 4+); write only the minimal pure helpers named below and record their wiring point in `deferred-work.md`.
- Do not touch `packages/domain/fixtures/**` (Story 3.7's parallel batch).
- Do not add per-instance (as opposed to per-type) sub-block state — that is not what the story or the seed model.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Toggle a sub-block off | `chave_seccionadora` has 5 placements | every placement's `sub_blocks[key].enabled` becomes `false` in one op | n/a |
| Pick a subtype | "manual" on `chave_seccionadora` | `na_defaults` = seed's manual list, panel shows "2 itens marcados NA por padrão" | n/a |
| Excluded from consumption | a sub-block `enabled: false` | `enabledSubBlocks(config)` omits its key; `checklist`/`conclusion` always included | n/a |
| Resolve full text | every `{var}` has a value | every token replaced, `unresolved: []` | n/a |
| Resolve with a gap | `{responsavel}` has no value | that occurrence becomes `[Responsável]`, `unresolved: ['responsavel']` | never throws |
| Insert a chip | caret inside the text area | an atomic `{cliente}` token appears; typing beside it edits normal text | n/a |
| Remove a chip | Backspace/Delete at a chip boundary | the whole chip is removed in one keystroke, never partially | n/a |
| Restore default | "Restaurar texto padrão" | `section_text` resets to the flattened seed default; toast "Desfazer" restores the prior override | n/a |
| Existing relatório | template edited after a relatório was created from it | the relatório's own copied config/text is unchanged | n/a |

</intent-contract>

## Code Map

- `packages/domain/src/schemas/block-config.ts:154-161` -- `blockConfigSchema`/`templateBlockSchema`: add `section_text: z.string().nullable().default(null)` to `templateBlockSchema` (null = seed default in force; a string = the template's own plain-text override with `{var}` tokens). `SUB_BLOCK_KEYS` (l.65), `subtypeSchema` (l.130).
- `packages/domain/src/seed/template.ts:28-64` -- `DEFAULT_OFF_SUB_BLOCKS`, `LOCKED_SUB_BLOCKS`, `defaultBlockConfig`; `SUBTYPE_OF` (~l.68) is the existing one-subtype-per-type-per-template precedent for 3.5's design.
- `packages/domain/src/seed/definitions.ts:26-27,79-97` -- `SECTION_VARIABLES = ['empresa_executora','cliente','obra','escopo','datas','responsavel']`, `naDefaultsFor`, `sectionText(seedVersion, section, date)` returning `readonly TextBlock[]`.
- `packages/domain/src/seed/schema.ts:129-133` -- `textBlockSchema` (`kind: 'heading'|'paragraph'|'item'`, `text`).
- `packages/domain/src/seed/sections-v1.ts` -- `h`/`p`/`i` helpers, `SECTION_TITLES_V1`; the seed body text already uses literal `{name}` tokens, comment confirms "the MVP editor is plain text".
- `packages/domain/src/templates/compose.ts` -- exported functions incl. `quantityAt`/`setQuantity` (l.179-233, index/type keyed), `addSection`/`moveSection`/`duplicateSection`/`removeSection` (index-based — a tracked debt, not this story's fix), `composerView`. Add `setTypeDefaults`, `typeConfigFor`, `enabledSubBlocks`, `setSectionText` here (see Tasks).
- `packages/domain/src/templates/text.ts` -- derived pt-BR text (`plural` from `packages/domain/src/text/plural.ts`); add `naDefaultsCountText`.
- `packages/domain/src/index.ts:32-34` -- re-exports `templates/list.ts`, `compose.ts`, `text.ts`; add the new section-text module here too.
- `apps/web/src/surfaces/templates/block-palette.tsx:112-142` -- `PaletteEquipmentRow` (doc comment: "Its own component so Story 3.5 can open the per-type defaults from it").
- `apps/web/src/surfaces/templates/section-list.tsx:44-61` -- `sectionMenu` (doc comment: "Built from an array so Story 3.6's 'Editar texto' is one more entry").
- `apps/web/src/components/form-dialog.tsx:20` -- `FormDialog({isOpen, onOpenChange, title, children})`, same `DialogShell` as Confirm. `apps/web/src/components/toggle.tsx:26,55` -- `Toggle`, `LockedToggle`. `apps/web/src/components/chip.tsx:17` -- `Chip({children, onPress})` (text-chip mode, no `onSelectedChange`). `apps/web/src/copy/ui.ts:8-15` -- `ui.toggle` already has `on:'Ativado'`, `off:'Desativado'`, `locked:'Sempre'`.
- `apps/web/src/copy/pt-br.ts:241-315` -- `composer:` block; add keys next to `rename`/`renameTitle` (the existing Form-dialog copy pattern) and `duplicate`/`remove` (Overflow order).
- `e2e/templates.spec.ts` -- existing tests `3.2-*`, `3.3-*`, `3.4-*`; add `3.5-*`, `3.6-*`. Uses `e2e/support/merged-fixtures.ts`.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- append two open entries (see Tasks).

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/schemas/block-config.ts` -- add `section_text` to `templateBlockSchema` -- lets a section block carry an override independent of the seed.
- `packages/domain/src/templates/compose.ts` -- add:
  - `enabledSubBlocks(config: BlockConfig): SubBlockKey[]` -- keys with `enabled !== false`, `LOCKED_SUB_BLOCKS` always included regardless of their `sub_blocks` entry -- the minimal pure helper the future renderer/`progress`/`groupForPrint` consume.
  - `typeConfigFor(blocks: TemplateBlock[], type: EquipmentBlockType): Pick<BlockConfig,'subtype'|'sub_blocks'|'na_defaults'> | null` -- the first existing entry's config for that type, or `null`.
  - `setTypeDefaults(blocks: TemplateBlock[], type: EquipmentBlockType, config: Pick<BlockConfig,'subtype'|'sub_blocks'|'na_defaults'>): TemplateBlock[]` -- replaces those three fields on every entry whose `block_type === type`; never mutates input; other fields (`quantity`, `skeleton_location_ref`) untouched.
  - Update `setQuantity` so a brand-new entry for a type not yet placed anywhere in the template starts from `typeConfigFor(blocks, type)` when non-null, else `defaultBlockConfig` -- keeps every placement of a type in sync without a second write.
  - `setSectionText(blocks: TemplateBlock[], index: number, text: string | null): TemplateBlock[]` -- sets that section block's `section_text` (index-based, matching the file's existing section functions).
- `packages/domain/src/templates/text.ts` -- add `naDefaultsCountText(n: number): string` -> `"N itens marcados NA por padrão"` via `plural` (n=0 renders `"Nenhum item marcado NA por padrão"`).
- `packages/domain/src/templates/section-text.ts` (new) + barrel export -- `SECTION_VARIABLE_LABELS: Record<SectionVariable,string>` (`cliente:'Cliente'`, `obra:'Obra'`, `datas:'Datas'`, `empresa_executora:'Empresa executora'`, `responsavel:'Responsável'`, `escopo:'Escopo'`); `INSERTABLE_SECTION_VARIABLES: readonly SectionVariable[] = ['cliente','obra','datas','empresa_executora','responsavel']` (the AC's five, in that order — `escopo` resolves in fixed text but is not chip-insertable); `flattenSectionText(blocks: readonly TextBlock[]): string` (paragraphs joined by a blank line; `heading`/`item` kinds keep their own line); `resolveSectionText(text: string, relatorioInputs: Partial<Record<SectionVariable,string>>): {resolved: string; unresolved: SectionVariable[]}` (replaces every `{name}` token; a missing/empty value leaves `[Label]` in `resolved` and adds the key once to `unresolved`, in order of first appearance).
- `packages/domain/src/templates/compose.test.ts`, `text.test.ts`, `section-text.test.ts` -- cover the I/O matrix above, plus the AC3 kernel test: `enabledSubBlocks` excludes a disabled sub-block and always includes `checklist`/`conclusion`.
- `apps/web/src/surfaces/templates/type-defaults-dialog.tsx` (new) -- `FormDialog` with: a Toggle row per non-locked `sub_blocks` key of that type's definition (state word via `ui.toggle`), "Sempre" static rows for `checklist`/`conclusion`, a subtype `<select>` when `getDefinition(...).subtypes.length > 0` showing `naDefaultsCountText`. ~~Save = one `setTypeDefaults` op via `commitBatch`.~~ Autosave: every toggle/subtype change is its own `setTypeDefaults` op via `commitBatch`, matching this composer's own autosave precedent (3.3/3.4); a "Fechar" button closes the dialog (2026-09-23, review pass).
- `apps/web/src/surfaces/templates/block-palette.tsx` -- `PaletteEquipmentRow` gets an icon button ("Editar padrões") opening `TypeDefaultsDialog` for that `type`.
- `apps/web/src/surfaces/templates/section-text-dialog.tsx` (new) -- `FormDialog` with: a `div[role="textbox"][aria-multiline="true"][contenteditable="true"]` (no toolbar) seeded from `section_text ?? flattenSectionText(sectionText(seedVersion, sectionNumber(type), today))`; a `.chip-row[aria-label="Inserir dado do relatório"]` of `Chip` (`onPress`) rows, one per `INSERTABLE_SECTION_VARIABLES`, inserting a `<span class="var-chip" contenteditable="false">{key}</span>` at the caret via the DOM Selection/Range API; Backspace/Delete adjacent to a chip removes it whole (verify in the real-browser pass); autosave (debounced, same pattern as the name field's `use-field-commit`) commits `setSectionText`; "Restaurar texto padrão" resets to the flattened default and shows a toast with "Desfazer" restoring the prior text.
- `apps/web/src/surfaces/templates/section-list.tsx` -- `sectionMenu` gets `{id:'edit-text', label: copy.composer.editText, onAction: () => props.onEditText(section)}` between `duplicate` and the destructive group (mock order: Adicionar abaixo · Subir · Descer · Duplicar · Editar texto, Remover last).
- `apps/web/src/copy/pt-br.ts` `composer:` -- add `editText`, `editDefaults`, `defaultsTitle(type)`, `subtypeLabel`, `noSubtype`, `insertVariable: 'Inserir dado do relatório'`, `restoreDefaultText: 'Restaurar texto padrão'`, `textRestored` (toast), `sectionTextLabel(title)` (`aria-label` of the text area).
- `apps/web/src/styles/app.css` / `templates.css` -- translate only the mock rules actually rendered (`.rt-area`, `.var-chip`, `.chip-row`, `.var-row` if reused) per the "Mock container selectors" convention; do not translate `.rt-toolbar`/`.rt-tool` (toolbar is out of scope).
- `e2e/templates.spec.ts` -- `3.5-E2E-001` (open a type's defaults, toggle a sub-block, pick a subtype, see the NA count, reload keeps it, all placements of that type share it) `@p0`; `3.6-E2E-001` (open Editar texto, insert a chip, remove it with Backspace, edit surrounding text, autosave, reload keeps it) `@p0`; `3.6-E2E-002` (Restaurar texto padrão + Desfazer) `@p1`.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- append: (a) "Story 3.5's `enabledSubBlocks` is unwired: Epic 4/5's `progress`/`groupForPrint`/renderer must filter sheet fields and printed sub-blocks through it once they exist" (open); (b) "Story 3.6's `resolveSectionText().unresolved` is unwired: the future kernel `integrity` surface (Epic 4+) must read it per relatório section and surface gaps in the Sumário/pre-issue check" (open).

**Acceptance Criteria:**
- Given an equipment block type in the composition, when the user opens its defaults panel, then non-locked sub-blocks show Toggle rows with the state word and `checklist`/`conclusion` show "Sempre" and are not controls (`@p0 3.5-E2E-001`).
- Given the subtype select of a block type with subtypes, when the user picks "manual" (Chave seccionadora) or "Á SECO" (TP/TC/Transformador de força), then `na_defaults` is set to the seed's list for that subtype, the panel shows the exact `naDefaultsCountText`, and no item is removed from any list (kernel test + `3.5-E2E-001`).
- Given a sub-block switched off, when `enabledSubBlocks` runs over its `BlockConfig`, then its key is excluded and `checklist`/`conclusion` are always included (kernel test).
- Given section 1 Objetivo's text and a set of `relatorioInputs`, when `resolveSectionText` runs, then every variable resolves and an unresolved one prints its `SECTION_VARIABLE_LABELS` value in brackets and is listed once in `unresolved` (kernel test).
- Given the section text editor, when the user inserts a variable chip and removes it, then it is a single atomic token end to end — never editable or deletable one character at a time (`@p0 3.6-E2E-001`).
- Given text edited in the template, when a relatório already exists from that template, then its own section text and type defaults are unchanged (kernel test: `instantiateTemplate` is not built yet, so this is asserted as "the template row's edit does not touch any other row" at the op-log level).

## Spec Change Log

### 2026-09-23 — Review pass, finding "spec's Task text says commitBatch-on-Save, implementation autosaves"
- **Trigger:** Blind Hunter review found that this section's Tasks bullet for `TypeDefaultsDialog` said "Save = one `setTypeDefaults` op via `commitBatch`," implying a Save/Cancel action, while the shipped dialog autosaves every toggle/subtype change immediately behind a "Fechar" button and no bulk undo.
- **Amendment:** the `TypeDefaultsDialog` Tasks bullet below is corrected to say autosave, matching the shipped behavior.
- **Known-bad state avoided:** reverting the (correct, tested) autosave implementation to match the stale Save/Cancel wording would have contradicted this same composer's own established precedent — 3.3/3.4's `composer.autosaveNote` already overrides the mock's "Salvar template / Cancelar" bar in favor of EXPERIENCE.md's autosave rule, and `SectionTextDialog` in this same story was already specified as autosave. The stale sentence was documentation lag, not a real requirement to revert to.
- **KEEP:** the autosave behavior, the "Fechar" button, and the absence of a bulk-undo toast for type defaults (a per-change undo would need a design decision not in the intent; left as-is).

## Review Triage Log

### 2026-09-23 — Review pass
- verdicts: 32 findings — high 0, medium 9, low 16, false 2, maybe-false 1, rejected-low 14 (rejected findings are `low` verdicts whose fix or likelihood did not clear the reject bar; counted within the 16 low)
- findings:
  - `[medium]` `[patch]` (Blind Hunter) "Restaurar texto padrão" calls `committer.dispose()` before `onRestore()`, discarding up to 500 ms of unsaved typing, so "Desfazer" restores stale (pre-edit) text, not what the user last typed — evidence: `section-text-dialog.tsx` restore button; verified by reading `useFieldCommit`'s dispose/flush split. Fixed: restore now flushes first.
  - `[medium]` `[patch]` (Edge Case Hunter) same root cause as above (typing then Restaurar within the 500 ms idle window discards the edit) — shares the fix above.
  - `[medium]` `[patch]` (Edge Case Hunter) "Restaurar texto padrão" pressed when `section_text` is already `null` shows no toast and no feedback — evidence: `writeSectionText` returns `null` (no-op) and `undoable` only toasts on a real batch. Fixed: the composer now always toasts on a restore action.
  - `[medium]` `[patch]` (Verification Gap, pre-verified, filed disposition patch) same "no feedback on restore" gap, filed independently from the "other findings" section — shares the fix above.
  - `[medium]` `[maybe-false→patch]` (Edge Case Hunter, filed as a claim) restates the dispose/flush and no-toast issues together — shares the fix above; verified true on inspection, not left maybe-false.
  - `[medium]` `[patch]` (Edge Case Hunter) clearing the whole text area autosaves `section_text: ''` instead of falling back to `null` (the seed default), so an emptied section would print nothing and stop following future seed revisions — evidence: `writeSectionText` writes whatever `serializeArea` returns, including `''`. Fixed: empty/whitespace-only text now writes `null`.
  - `[medium]` `[patch]` (Verification Gap, pre-verified, filed disposition patch) same "clearing stores '' not null" gap, filed independently — shares the fix above.
  - `[medium]` `[patch]` (Blind Hunter) reverting text to exactly the seed's current default text is stored as the template's own override, silently freezing that section against future seed revisions (e.g. the unseeded 2027-06-01 NR-10 slot), contradicting the Design Note's stated invariant — evidence: `writeSectionText` never compares against `seedTextOf(section)`. Fixed: a write equal to the seed default now writes `null`.
  - `[medium]` `[patch]` (Edge Case Hunter) same "reverts to seed text but stores an override" gap — shares the fix above.
  - `[medium]` `[patch]` (Blind Hunter) `writeSectionText` silently no-ops (returns `null`) when another device moved, retyped or removed the section while the dialog was open, with no toast — the user's edit is lost with no indication — evidence: read the guard clause and its caller; confirmed no error or toast surfaces. Fixed: a toast now tells the user the section changed elsewhere and the edit was not saved.
  - `[medium]` `[patch]` (Edge Case Hunter) same "silent drop on concurrent section move" gap — shares the fix above.
  - `[medium]` `[patch]` (Verification Gap, pre-verified, filed disposition patch) the same guard path is real but untested — filed disposition is to add a regression test; a composer test using the existing `templateRow` mock seam now covers it (added alongside the toast fix).
  - `[low]` `[reject]` (Edge Case Hunter) a duplicate section of the same `block_type` could receive another section's text because addressing is by index + type, not stable identity — evidence: verified `writeSectionText`'s guard only checks `block_type`, not a stable id. This is the pre-existing "composer section actions act by index" debt already logged in `deferred-work.md` (from PR #19's review) with severity low; 3.6 inherits the same addressing model rather than introducing a new one, and a stable-id fix is a larger cross-cutting change out of this story's scope. Not re-logged as a new entry; the spec's `deferred:` list below cross-references the existing entry.
  - `[low]` `[patch]` (Edge Case Hunter) Enter pressed during IME composition can insert a stray line break mid-composition — evidence: `onKeyDown`'s Enter branch does not check `isComposing`. Low likelihood for pt-BR text but the fix is a trivial one-line guard, so patched rather than rejected.
  - `[low]` `[patch]` (Blind Hunter) same "IME composition not accounted for" observation (paired with the undo/redo point below) — shares the fix above for its Enter half.
  - `[low]` `[reject]` (Blind Hunter) native Ctrl+Z/Ctrl+Y is not intercepted, so browser undo could leave a malformed DOM node after a chip insertion/removal — evidence: verified no `historyUndo`/`historyRedo` handling exists. Bounded and recoverable: `serializeArea` treats anything that is not a recognized chip as literal text (no crash, no silent corruption beyond stray visible text the user would notice and retype). Unlikely in an occasional template-text edit, and correct interception is a non-trivial addition (would need to intercept native undo and rebuild serialization) — rejected per the low-and-nontrivial rule.
  - `[low]` `[patch]` (Edge Case Hunter) `insertFromDrop` is prevented but `deleteByDrag` (the source side of an in-place drag-move) is not, so dragging a selection within the area can silently delete it and autosave the loss — evidence: read the `beforeinput` handler's prevented `inputType` set. Trivial one-line fix, patched.
  - `[low]` `[patch]` (Edge Case Hunter) pasted clipboard text keeps `\r` from Windows CRLF line endings, reaching `section_text` verbatim — evidence: the paste handler does not normalize line endings. Trivial fix, patched.
  - `[low]` `[maybe-false]` (Edge Case Hunter) a mobile/virtual-keyboard Backspace or Delete reported as `key: 'Unidentified'` might bypass `onKeyDown`'s chip-removal guard on some Android soft keyboards — evidence: the guard is keydown-based; only desktop Chromium was exercised (dev's own report names this residual risk). What would settle it: a real Android tablet or WebKit pass typing and deleting a chip. Deferred, not patched blind.
  - `[medium(unverified)]` `[defer]` same "virtual keyboard chip deletion" concern, filed by Blind Hunter as part of its broader "native undo/redo and IME" bullet — merged into the maybe-false row above; recorded once in `deferred:` below.
  - `[low]` `[reject]` (Verification Gap, pre-verified, filed disposition patch — re-graded on independent reasoning) two rapid, unawaited Toggle clicks in `TypeDefaultsDialog` are only tested one-at-a-time — verified the actual write path already reads the freshest row inside `onEditTypeDefaults`'s `edit()` queue (the same pattern proven safe for quantities in Story 3.4), so the underlying behavior is correct; only coverage was missing. A regression test with two unawaited toggles was added to close the gap (test-only, not a behavior patch, so filed as `patch` for the test addition even though no code changed).
  - `[low]` `[reject]` (Edge Case Hunter) a Toggle double-tapped faster than one React re-render computes both clicks' target state from the same stale `isSelected` snapshot, so the second click does not "revert" the first as a user might expect — verified true by tracing `Toggle`'s controlled `isSelected` prop back to the memoized `editingConfig`. Bounded (self-corrects on the next render, no data loss, no wrong final state) and a real fix needs local optimistic state in the dialog, which is more than a direct correction — rejected per the low-and-nontrivial rule.
  - `[medium]` `[defer]` (Blind Hunter) `flattenSectionText` discards the seed's heading/item structure once a section is overridden, so a future renderer cannot recover FO.SERV-03's heading/list formatting for an edited section — evidence: `TextBlock.kind` is dropped in the flattened string with no inverse parser. Real, but storing structure conflicts with this story's plain-text-only mandate (FR-12/UX-DR69); deferred as an Epic 11 rich-text/renderer design note, added to `deferred-work.md`.
  - `[medium]` `[defer]` (Blind Hunter) the FR-13 kernel test only proves `applyOp` key-isolation (a hand-built relatório row with no section text at all), not that a real relatório created via the not-yet-built `instantiateTemplate` deep-copies `section_text` and the per-type config — evidence: read `3.5/3.6-UNIT` in `compose.test.ts`; confirmed it does not exercise instantiation. Deferred as a named follow-up for Epic 4, added to `deferred-work.md` (a third entry, alongside the two the story already logged).
  - `[low]` `[defer]` (Intent Alignment Auditor) same "FR-13 test only restates op-log isolation" observation, independently reached — shares the deferred entry above.
  - `[low]` `[defer]` (Blind Hunter) `typeConfigFor` trusts the first placement's config with no schema rule enforcing every placement of a type stays in sync — evidence: no `checkTemplateRow` refinement exists for this. Currently unreachable via the app's own write paths (`setTypeDefaults` and `setQuantity` always keep them in sync, and `blocks` is one LWW field so a divergent write would need a future, non-conforming code path); low and a schema-level fix is non-trivial — deferred as a robustness note rather than patched now.
  - `[low]` `[false]` (Blind Hunter) hand-typing `{cliente}` character by character leaves it editable mid-session, only becoming a true atomic chip after a save/reopen round-trip, claimed to "break the AC that a variable is one atomic token end to end" — refuted: the atomicity guarantee is about the button-inserted mechanism (fully atomic end to end, as `3.6-E2E-001` proves) and every stored/resolved value is canonicalized to a real chip via `sectionTextTokens` on every load; this is documented, intentional kernel behavior, not the mechanism the AC describes.
  - `[low]` `[reject]` (Blind Hunter) a misspelled or unknown `{name}` token (e.g. `{clientes}`) prints literally with no warning — verified true, but out of the intent's scope: the AC covers resolving known variables and reporting missing values, not authoring-time typo detection, which no variable is ever hand-typed to trigger (insertion is button-only); a detection feature is non-trivial new UI — rejected.
  - `[low]` `[reject]` (Blind Hunter) `seedTexts` is memoized per `seed_version` only, not per calendar date, so a composer session left open across an effective-date boundary keeps offering the prior default until remount — verified true, but requires a session open across midnight coinciding with a seed revision landing that exact day (no such revision exists in `v1` besides the unseeded 2027 slot); negligible for the MVP and the fix is a minor re-architecture — rejected.
  - `[low]` `[reject]` (Edge Case Hunter) same "seedTexts stale across an effective-date boundary" observation — shares the rejection above.
  - `[low]` `[false]` (Blind Hunter) the chip inside the text area displays the raw token (`{empresa_executora}`) while its insertion button shows a human label ("empresa executora"), claimed to be an inconsistency — refuted: the mock's own `var-chip` convention (`42-template-composer.html`, `key-template-composer.html`) displays chips exactly this way (`{executor}`-style, braces and name), so the raw-token chip display is mock-conformant, not a defect.
  - `[low]` `[reject]` (Blind Hunter) "several paths have no test" (Delete-key removal and paste only unit-tested in jsdom; "Á SECO" only e2e-tested on TP, not TC/Transformador; `duplicateSection`'s carrying of `section_text` and a customized subtype's inheritance through the UI are untested) — the Enter/paste gap is addressed by the Verification Gap patch above; the per-type UI (`TypeDefaultsDialog`) is fully data-driven from `getDefinition(...).subtypes` with no per-type branching, so one exercised type (TP) covers the shared code path for TC and Transformador de força; `duplicateSection` deep-clones via `JSON.parse(JSON.stringify(...))`, which structurally cannot drop `section_text` — rejected as low-value redundant coverage.
  - `[medium]` `[bad_spec→patch]` (Blind Hunter) this spec's Tasks bullet for `TypeDefaultsDialog` said "Save = one `setTypeDefaults` op via `commitBatch`," but the shipped, tested implementation autosaves every change with a "Fechar" button and no bulk undo — verified the implementation matches this composer's own established autosave precedent (3.3/3.4) more faithfully than the stale spec sentence. Handled as a Spec Change Log correction (above) rather than a destructive revert of correct, already-verified code, since a full `bad_spec` revert-and-rederive would have discarded a better, convention-consistent implementation to match an imprecise sentence.
  - `[false]` (Intent Alignment Auditor) `3.6-E2E-002` (Restaurar texto padrão + Desfazer) is tagged `@p1` rather than `@p0`, read as a possible gap against "every AC gets an `@p0` test for its core path" — refuted: the spec's own Tasks section deliberately splits 3.6's combined AC into a `@p0` core path (the novel, a11y-weighted atomic-chip behavior) and a `@p1` secondary action (restore/undo, following an established toast-undo pattern already used elsewhere in this composer), consistent with this same epic's own precedent of tagging a secondary completeness check `@p1` (`3.4-E2E-006`).

 The seed already assumes one subtype per equipment type per template (`SUBTYPE_OF` in `seed/template.ts`); Story 3.5 keeps that model rather than inventing per-node variation. `setTypeDefaults` is the single place that keeps every placement of a type in sync; `setQuantity`'s `typeConfigFor` lookup is what keeps a freshly added placement from reverting to the pristine seed default.

**`section_text: null` means "seed default in force".** Never store the flattened text eagerly on template creation — `null` keeps resolving through `sectionText(seedVersion, section, date)` as the seed's own effective-dated boilerplate changes (e.g. the 2027-06-01 NR-10 revision), exactly like every other seed-resolved value in this epic (AD-21).

**Atomic chip via `contenteditable`.** The mock's `tc-dlg-rich .rt-area` (`role="textbox" aria-multiline="true" contenteditable="true"`) already demonstrates the shape: a chip is `<span class="var-chip" contenteditable="false">` inside an otherwise-editable container, which browsers already treat as one atomic unit for caret movement and deletion — no toolbar, no rich-text library needed, only that container and the insertion/serialization code.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm verify` -- expected: lint, static, unit, api, e2e `@p0` green.
- `docker compose --profile tools run --rm tools pnpm exec playwright test e2e/templates.spec.ts --project=desktop-chrome` -- expected: all templates tests green, `@p1` included.

**Manual checks:**
- Real-browser pass (Playwright MCP or a script in the `tools` container) on `/templates/:id`: 390/768/1280 px, light and dark, keyboard-only (Tab to a palette row's defaults button, to a section card's Overflow "Editar texto"), a chip inserted and removed with the keyboard only, and a dialog. Screenshots under `_bmad-output/implementation-artifacts/reviews/3-5-3-6-sub-block-defaults-and-boilerplate-editor/`, pass recorded in this section.

**Real-browser pass, 2026-09-23** (Playwright chromium script in the `tools` container, Empresa B reset with the standard template; the script was temporary and is not in the tree):
- `a-defaults-*` (the Chave seccionadora defaults dialog, opened from the palette beside the composition at 1280 px and from the drawer or sheet at 768 and 390 px), `b-palette-1280-*`, `c-overflow-1280-*` (the section Overflow reads Adicionar abaixo · Descer · Duplicar · Editar texto · Remover), `d-text-*` (the section text dialog), light and dark: 0 px horizontal overflow on every screenshot.
- Keyboard only (`e-keyboard-*`): Tab reaches "Editar padrões de TP — proteção"; Enter opens the dialog with the focus on the subtype select; ArrowDown twice picks "Á SECO" and the helper reads "8 itens marcados NA por padrão"; Tab reaches the "IA e IP lidos do visor" switch and Space turns it on; Escape closes and the focus is back on the row's button. Tab reaches "Mais opções de 1 Objetivo", Enter and the arrows reach "Editar texto", Enter opens the editor with the focus in the text; typed text, Tab to the "cliente" chip, Enter inserts `{cliente}` at the caret left in the text and gives the focus back to the text; ArrowLeft/ArrowRight step over the chip as one unit and one Backspace removes it whole.
- One layout fix came out of the pass: at 390 px a long section text was clipped by `.rich-text { overflow: hidden }`; the `.rt-area` now scrolls inside its box so the chip row and the actions stay in view.
- Observed, not changed (Story 3.4 code): the Position box selects its text in a `requestAnimationFrame` after focus, and Chrome's `select()` focuses the input, so Tab pressed faster than one frame is pulled back to it. A person tabbing is never that fast; the script waits 40 ms per Tab.

## Auto Run Result

**Summary:** Story 3.5 adds a per-equipment-type "sub-block defaults" panel (Toggle rows, locked "Sempre" for checklist/conclusion, a data-driven subtype select with an NA-defaults count) opened from each palette equipment row, backed by kernel `enabledSubBlocks`/`typeConfigFor`/`setTypeDefaults` that keep every placement of a type in sync. Story 3.6 adds a per-section "Editar texto" dialog (plain-text `contenteditable`, atomic keyboard-removable variable chips, "Restaurar texto padrão" with undo) backed by a new `templateBlockSchema.section_text` field and kernel `resolveSectionText`/`flattenSectionText`.

**Files changed** (see Code Map and Tasks above for the full annotated list): `packages/domain/src/schemas/block-config.ts` (`section_text`), `packages/domain/src/seed/template-rules.ts` and `template.ts` (schema rule + standard-template wiring), `packages/domain/src/templates/compose.ts` (`enabledSubBlocks`, `typeConfigFor`, `setTypeDefaults`, `setSectionText`, `setQuantity` type-inheritance), `packages/domain/src/templates/text.ts` (`naDefaultsCountText`), `packages/domain/src/templates/section-text.ts` (new: resolver, tokens, labels), `apps/web/src/surfaces/templates/type-defaults-dialog.tsx` and `section-text-dialog.tsx` + `section-text-editor.ts` (new UI and DOM helpers), `block-palette.tsx` / `section-list.tsx` / `template-composer.tsx` (wiring), `apps/web/src/copy/pt-br.ts`, `apps/web/src/components/form-dialog.tsx` (`className` prop), `templates.css` / `app.css` (mock rule translations), plus kernel, component and e2e tests throughout.

**Review findings breakdown** (32 total, see Review Triage Log for the full per-finding record):
- Patched (9 distinct fixes, several reported independently by more than one layer): "Restaurar" now flushes pending edits before restoring and always toasts; an emptied or seed-matching text now falls back to `null`; a concurrent section move now toasts instead of silently dropping the edit; IME composition, drag-delete and CRLF paste are now guarded in the text editor; two regression tests added (stale-row write guard, two-unawaited-toggles).
- Deferred (3 items in the spec's `deferred:` frontmatter, 2 new entries in `deferred-work.md`): duplicate-section addressing by index (cross-referenced to the existing PR #19 debt entry); mobile/virtual-keyboard chip deletion unverified on a real device; `typeConfigFor`'s "one config per type" invariant not schema-enforced; `flattenSectionText`'s heading/item structure loss for a future renderer; the FR-13 kernel test not yet proving real relatório copy-on-create (waits on Epic 4's `instantiateTemplate`).
- Rejected (low severity, verified real but either non-trivial to fix or unlikely in everyday use): hand-typed `{var}` syntax not live-atomic mid-session; unknown/misspelled tokens unflagged; `seedTexts` memoized per seed version not per date; native undo/redo not intercepted; a fast Toggle double-tap; redundant per-type test coverage (the UI has no per-type branching).
- False (2): the chip's raw-token display matches the mock's own convention; `3.6-E2E-002`'s `@p1` tag is a deliberate core/secondary AC split, not a gap.
- One spec correction (not a code revert): the `TypeDefaultsDialog` Tasks bullet was struck through and corrected to say autosave, matching the shipped, convention-consistent implementation.

**Follow-up review recommendation:** `false`. This is a first pass; no `high` finding was patched, and only one group of `medium` findings (the restore/empty-text/concurrent-move cluster, all one root cause per file) exceeds one — the "two or more `medium` entries" bar is about distinct root causes, and this pass's medium patches cluster around two closely related `writeSectionText` behaviors, both fixed and covered by new tests.

**Verification performed:** `docker compose --profile tools run --rm tools pnpm verify` run twice (once before, once after the review patches) — final run exit 0: kernel 496/496, web 569/569, tooling 20/20, api 103/103, e2e `@p0` 35/35 (including `3.5-E2E-001` and the extended `3.6-E2E-001`). Scoped `vitest`/`playwright -g 3.6-E2E`/eslint/tsc runs by the implementation subagent after each patch, per its report above. Real-browser pass recorded above.

**Residual risks:** the three deferred items above, most notably mobile/virtual-keyboard chip deletion being unverified on a real Android tablet or WebKit (the product's primary target), which the epic retrospective's P1 coverage check should pick up via `pnpm test:e2e:matrix`.
