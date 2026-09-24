---
title: 'Stories 4.4 and 4.5: Walk the location tree; add, remove, restore, duplicate and reorder equipment blocks'
type: 'feature'
created: '2026-09-24'
status: 'done'
baseline_revision: 'e7d273bc9b164e520090ef61570424ce8deea9a8'
review_loop_iteration: 0
followup_review_recommended: true
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-1-4-3-project-relatorio-and-sumario.md'
warnings: ['batched', 'oversized']
deferred:
  - summary: >-
      Narrowings of Stories 4.4/4.5 recorded in this spec but not yet struck through with the
      date beside the ACs in epics.md.
    evidence: |-
      Office palette sub-block toggles inside a sheet deferred to Epic 5; phone rows indented
      16 px per the mock's .frame-phone rule; Confirm title "Remover ficha SEC-C05?" (the AC)
      where EXPERIENCE.md Flow 3 adds "e seus dados"; "Agrupar por tipo" as a menuitemcheckbox
      in the cabine Overflow; /relatorio/:id/arvore reachable by address only until Epic 5; the
      portrait rail opens inline rather than as an overlay; the field palette creates on one tap
      and "Adicionar bloco em cabine" targets the current coluna without the mock's "Trocar".
      Planning documents are the coordinator's in this parallel run (independent review F-12).
    location: >-
      _bmad-output/planning-artifacts/epics.md (Stories 4.4 and 4.5)
    severity: low
  - summary: >-
      The office palette's "Local" is a native select, not a React Aria Select.
    evidence: |-
      Accessible and axe clean; no mock draws the office confirm; a shared React Aria Select is
      a component-library change outside this story (independent review F-8).
    location: >-
      apps/web/src/surfaces/relatorio/block-palette-field.tsx
    severity: low
  - summary: >-
      An undone creation (palette tap or Duplicar, then Desfazer) is listed by "Restaurar ficha
      removida".
    evidence: |-
      undoBatch tombstones the created block and equipment, so the restore list offers them,
      as it does for batch A's sections; restoring brings a valid empty sheet back
      (independent review F-11).
    location: >-
      packages/domain/src/relatorio/sumario.ts (restorableBlocks)
    severity: low
---

<intent-contract>

## Intent

**Problem:** Section 9 of the Sumário is a stub (`apps/web/src/surfaces/relatorio/section-9.tsx`: one row per cabine, nothing under it), so the engineer cannot see the colunas and equipment in walking order, their sheet states, nor add, remove, restore, duplicate, rename or reorder a block; the rail Epic 5 mounts inside a sheet does not exist.

**Approach:** Add a kernel location-tree view model (cabine › coluna › equipment in `order_key` order with `sheetState`, glyph, word, meta, counters, `firstInTree`, TAG texts) and render it through ONE tree component in two presentations: the Sumário's section 9 expansion (editable: chevrons, Left/Right, cabine/coluna/equipment Overflow, Position box, drag, Alt+arrows, block palette, remove/undo/restore, Duplicar, Renomear TAG, location add/rename/reorder, Agrupar por tipo) and the rail (320 px `.rail` / 48 px `.rail-collapsed` strip, cabines and fichas, `aria-current`), shown at `/relatorio/:id/arvore` (its own surface on phone, the rail at 768 px and up until Epic 5 mounts it inside a sheet).

## Boundaries & Constraints

**Always:** the kernel computes every order, state, glyph, word, count, meta, TAG suggestion, TAG verdict and composed sentence (`packages/domain`); `apps/web` reads Dexie and writes only through `commitBatch`/`undoBatch`, ids from `newId`; reuse batch A's kernel (`suggestTag`, `isTagTaken`, `normalizeTag`, `integrityFindings`, `orderKeyForMove`, `orderKeyAfter`, `orderKeyBetween`, `sheetState`, `sheetStateLabel`, `cabineProgress`, `cabineMetaText`, `restorableBlocks`, `moveAnnouncement`, `defaultCabineName`, `defaultColunaName`, `defaultBlockConfig`) and web pieces (`useReorder`, `PositionBox`, `DragHandle`, `restoreFocus`, `LIST_FOCUS_WATCH_FRAMES`, `OverflowMenu`, `ConfirmDialog`, `FormDialog`, `DialogShell`, `Toggle`, `RestoreDialog`, `relatorio-ops.ts`, the Sumário's `edit`/`undoable`/`announce` queue) instead of duplicating them; mock class names verbatim (`40-relatorio-overview.html` for section 9 and `#lo-palette`, `prototype/shell-head.html`/`shell-foot.html` for the rail, `key-sheet-states.html` frames (e)/(e′) for the remove Confirm and toast); DESIGN.md wins over a mock on conflict (56 px rows, 24 px indent per level, 48×56 chevron hit area); every `.frame-*` rule first rendered here (the `40-relatorio-overview.html` `.frame-phone … .s9-*` rules, `.frame-phone .block-palette` if not yet translated, rail visibility per width) gets its `app.css`/`relatorio.css` media-query translation with a comment naming the mock rule; phone vs office behaviour switches by CSS only (the `registry-picker-field.tsx` pattern), never a JS `matchMedia`; every destructive action (Remover, Desfazer, Restaurar) moves focus deliberately and a test asserts the focused element afterwards (E3-A8); every move is announced in the Sumário's `role="status"` region and undoable from a toast; copy in exactly one home (derived in the kernel, surface copy in `pt-br.ts` verbatim or `// authored:`, chrome in `ui.ts`); no emoji (the state glyphs ✓ ● ○ ⊘ are the text characters DESIGN.md names, `aria-hidden`), no `laudo`, no client material outside the Porto Seguro fixture.

**Never:** no "Mover para…" (hidden until Epic 11, not rendered, never disabled) and no `block/{id}/location_id` writes; no swipe gesture; no removal of cabines or colunas (not in these ACs); no sheet surface, no ficha route and no sub-block toggles "inside a sheet" (Epic 5); no "Fotografar equipamento" row (Epic 9); no Dexie schema version; no change to `tokens.css`/`components.css`; no persisted expand state; do not touch the Sumário's other rows, the setup stub, the section text surface or `generate-action.tsx` (batches C and D); no ARIA `role="tree"` (rows hold inputs and buttons; lists with `aria-expanded` chevrons, see Design Notes).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tree order | snapshot with cabines A, B; B has coluna 4 and 5 and one block attached directly to B | `locationTree(snapshot)` → cabines by `order_key`; under B its direct blocks first, then colunas by `order_key`, each with its blocks by `order_key`; removed rows absent; deeper locations nest generically (levels past 2 indent as 2) | No error expected |
| Equipment row | block with `not_tested` set / `concluded_by` set / one filled enabled cell / nothing | state `nao_ensaiada` glyph `⊘` word "Não ensaiada" plus the seed reason label / `concluida` `✓` "Concluída" / `em_preenchimento` `●` "Em preenchimento" / `vazia` `○` "Vazia"; a pending Suggestion never makes a block filled | No error expected |
| Cabine meta | `se.type` "SE", `primary_kv` 13.8, `env.temperature_c` 19, `env.humidity_pct` 67, `agrupar_por_tipo` true / everything null and false | "SE · 13,8 kV · 19 °C · 67 % · agrupar por tipo" / "—" (extend `cabineMetaText`) | No error expected |
| firstInTree | cabine with one direct block and colunas / cabine with no live equipment | first equipment block in depth-first tree order / `null` (the Overflow item is then not rendered) | No error expected |
| Field palette one tap | palette opened from Coluna 9 of 1° Subsolo, a Chave seccionadora tapped, no SEC-C09 yet | ONE batch: `equipment/{id}` create (scope project, `tag` "SEC-C09", `type`) + `block/{id}` create (`location_id` Coluna 9, `equipment_id`, `block_type`, `config` = `defaultBlockConfig(relatorio.seed_version, type)`, `seed_version` = the relatório's, `order_key` after the anchor block or last in the location); palette closes; toast "SEC-C09 criada na Coluna 9" + Desfazer; focus on the new row; works offline | Write failure: the existing write-error toast |
| Office palette | at ≥1280 px a type chosen | its `.type-confirm` asks "TAG" (prefilled `suggestTag`) and "Local" (prefilled current location, options = live locations as "1° Subsolo › Coluna 9"); changing Local re-suggests unless the TAG was edited; "Confirmar" creates as above | TAG empty or taken: inline error on blur, "Confirmar" `aria-disabled` with the reason |
| TAG taken inline | "sec-c05 " typed where live SEC-C05 sits in 1° Subsolo › Coluna 5 | on blur: "TAG já existe nesta obra — SEC-C05 em 1° Subsolo › Coluna 5"; holder outside this relatório: "TAG já existe nesta obra — SEC-C05"; the row's own TAG is not "taken" when renaming | Refused, no op |
| Duplicate by sync | two live equipment rows of the project share a TAG | each of their rows shows "TAG SEC-C05 duplicada" with a "Renomear" button (`integrityFindings`); renaming one clears both | Never a server rejection |
| Renomear TAG | Overflow › "Renomear TAG" → "SEC-C05A" | one `equipment/{id}/tag` put; `equipment_id` and the block unchanged | Taken/empty as above |
| Remover, empty block | `sheetState` `vazia` | no Confirm; one batch `block/{id}/removed_at` + `equipment/{id}/removed_at`; toast "Ficha removida" + Desfazer, persistent until dismissed or the Sumário is left; focus on the row now in that slot in the same location, else the previous row, else the parent location's chevron | No error expected |
| Remover, block with data | `sheetState` ≠ `vazia` | Confirm "Remover ficha SEC-C05?" with the description of `key-sheet-states.html` (e), "Cancelar" (initial focus) / "Remover ficha"; confirm → as above; cancel → focus back on the Overflow trigger | No error expected |
| Desfazer / Restaurar | toast Desfazer, or header Overflow › "Restaurar ficha removida" › the TAG | `undoBatch` / one batch clearing both `removed_at`; ancestors expand; focus on the restored row's Overflow trigger | Restored TAG now taken by another live row: restored anyway, the duplicate line appears |
| Restore list names (F-5) | two removed "2 Definições" sections; a removed SEC-C05 | names unique: equipment "SEC-C05 — 1° Subsolo › Coluna 5", identical names get " (2)", " (3)" in list order; `aria-label` "Restaurar ⟨name⟩" unique | No error expected |
| Reorder a block | SEC-C09 3rd of 5 in its coluna; Position box "1", "9", "", "x"; Overflow Subir/Descer; Alt+ArrowUp/Down; drag (touch: press and hold 300 ms) | one `block/{id}/order_key` put among live siblings of the same location; "9" clamps to 5; empty/NaN no-op; announced and toasted "SEC-C09 movido para a posição 1 de 5" + Desfazer; focus stays on the control used | Row removed elsewhere: toast `sumario.gone`-style sentence, no op |
| Duplicar | SEC-C09 → Overflow › Duplicar | dialog "Duplicar SEC-C09" with "TAG" prefilled `suggestTag` (SEC-C09-2), "Duplicar" creates equipment + block right after the source with the source's `config` copied (never its `sheet`, `not_tested`, `concluded_by`) | Taken/empty as above |
| Locations | cabine Overflow › "Adicionar coluna" / "Renomear" / Subir / Descer / Alt+arrows; foot "Adicionar cabine" | `location/{id}` create ("Coluna ⟨n+1⟩" last under the cabine; "Cabine ⟨n+1⟩" last at root with null `se`/`env`, `agrupar_por_tipo: false`) / `location/{id}/name` put / `location/{id}/order_key` put among same-parent siblings, announced with `moveAnnouncement('cabine'|'coluna', …)`, undo toast; every block keeps its `location_id` | Empty name: "Salvar" `aria-disabled` with reason |
| Agrupar por tipo | cabine Overflow item (a `menuitemcheckbox`, `aria-checked` = current value) | one `location/{id}/agrupar_por_tipo` put of the negation; meta line updates; announced | No error expected |
| Keyboard | focus on a row's chevron or body | ArrowRight expands a collapsed node, ArrowLeft collapses an expanded one, ArrowLeft on a leaf or collapsed node focuses the parent's chevron; inside the Position box arrows move the caret only | No error expected |

</intent-contract>

## Code Map

Kernel (`packages/domain/src`):
- `relatorio/sumario.ts:91` `cabineMetaText` (extend with `env.temperature_c`/`humidity_pct`, "—" when empty; update its callers' tests); `:226-245` `RestorableBlock`/`restorableBlocks(blocks, equipment)` (F-5: add `detail` from the block's location path and the " (n)" disambiguation; it needs the relatório's locations incl. removed); `:382` `sectionMovedText` (pattern for new texts).
- `relatorio/sheet-state.ts:69` `sheetState(block)`, `:22` `sheetStateLabel`, `:77` `isEquipmentBlock`; `schemas/entities.ts:283` `notTestedSchema` (`reason` is a seed `not_tested_reasons` key; label via the seed, see `seed/definitions.ts`).
- `relatorio/progress.ts:54-77` `cabineLocationIds`, `cabineProgress`, `progressCounterText`, `progressCounterState` (coluna counters: add `locationProgress(snapshot, locationId)` or generalise).
- `relatorio/tag.ts:34-79` `normalizeTag`, `isTagTaken`, `suggestTag(type, {kind, name}, equipment)`; `relatorio/integrity.ts:27` `integrityFindings({equipment})`.
- `ops/order-key.ts:67-124` `orderKeyBetween`, `sortByOrderKey`, `orderKeyForMove(siblings, id, toIndex)` (null = no-op), `orderKeyAfter(siblings, id)`.
- `templates/text.ts:130-158` `itemPhrase`, `moveAnnouncement(kind: 'cabine'|'coluna'|'section', …)`, `defaultCabineName`, `defaultColunaName`.
- `ops/path.ts:27-40` `LOCATION_FIELDS` (`name|parent_id|order_key|removed_at`), `location/agrupar_por_tipo` family (`:77`, `:188`, no field segment), `BLOCK_FIELDS`, `EQUIPMENT_FIELDS` (`tag|removed_at`); `ops/apply.ts:175` `createRow` (a block create gets `sheet: emptySheet()` and derived columns forced).
- `schemas/entities.ts:212` `equipmentRowSchema`, `:249-280` `locationRowSchema` (cabine carries `se`, `env`, `agrupar_por_tipo`), `:332` `blockRowSchema`; `schemas/snapshot.ts:58-104` `buildSnapshot` (live rows only; tombstones are read from `state`, as `sumario-surface.tsx:175-186` does).
- `relatorio/instantiate.ts` -- the exact equipment/block/location draft shapes (scope, `project_id`) to reproduce for single creates.
- `seed/v1.ts:499-583` block `label`s via `getDefinition(seedVersion, reportType, blockType).label` (palette and row names); `seed/template.ts:46` `defaultBlockConfig`.
- `index.ts` -- `export *` for each new module.

Web (`apps/web/src`):
- `surfaces/relatorio/section-9.tsx` -- the stub to replace (props today `{snapshot, lastSheetId, id}`, `ul.s9-tree[aria-label=copy.sumario.s9TreeLabel]`, `.is-current` + `sumario.here`); keep `4.3-E2E-002`'s locators working (list "Locais do relatório", `.s9-cabine.is-current`, "você parou aqui").
- `surfaces/relatorio/sumario-surface.tsx` -- `edit` `:237-267` (serialised queue, fresh `blockRowsOf`), `announce` `:269`, `undoable` `:275-294`, `focusAfterRemoval`/`rowFocusTarget`/`focusWhenRendered` `:125-164` (lift into a shared module rather than copy), `insertBelow` `:304-337`, `onRestore` `:403-415`, `equipment`/`allBlocks` `:175-186`, `<Section9Tree>` `:472`. `edit`'s builder reads blocks only: extend it (or add a sibling) so a builder also gets fresh locations and project equipment.
- `surfaces/relatorio/sumario-row.tsx:8-68` `RowActions`, `rowMenu` (menu-building pattern), `Section9Row` (renders `children(treeId)`).
- `surfaces/relatorio/restore-dialog.tsx` -- generic over `RestorableBlock`; show `detail`; restoring an equipment block also clears its equipment's `removed_at`.
- `surfaces/relatorio/relatorio-ops.ts` -- `envelope`, `putBlockOp`, `removeBlockOp`, `createBlockOp`; add location (`create`, `name`/`order_key` put, `agrupar_por_tipo` put) and equipment (`create` scope project, `tag` put, `removed_at` remove/put) builders.
- `surfaces/templates/use-reorder.ts:121-253` `useReorder` (`rowProps` handles Alt+arrows with `stopPropagation`, `handleProps` mouse-immediate / touch 300 ms hold, `moveTo(index, focus)`), `:86-113` `restoreFocus`, `LIST_FOCUS_WATCH_FRAMES`; `reorder-controls.tsx:7,38` `DragHandle`, `PositionBox`.
- `surfaces/templates/block-palette.tsx` -- `PaletteDrawer` (`DialogShell` with `overlayClassName="palette-drawer"`): reuse the shell and its drawer/bottom-sheet CSS; the field palette content is new (`BlockPaletteContent` is the template's stepper palette).
- `components/overflow-menu.tsx` (`items`, `destructiveItems`; add an optional checkable item rendered as `menuitemcheckbox` for "Agrupar por tipo"), `confirm-dialog.tsx` (controlled `isOpen`), `form-dialog.tsx`, `toggle.tsx`, `button.tsx` (`disabledReason`), `components/registry-picker-field.tsx:29` (CSS-only breakpoint switch precedent).
- `state/toast.tsx` -- an action toast never expires; dismiss the tree's undo toast when the Sumário unmounts (navigation) if the surface does not already.
- `db/home-store.ts:123-143` `locationRows`, `blockRowsOf`, `equipmentRows(projectId)`, `relatorioState`; `db/prefs.ts:105-110` `readLastSheet`/`writeLastSheet`.
- `app.tsx:96-133` routes (add `/relatorio/:id/arvore`, title "Árvore do relatório", back to the Sumário); `copy/pt-br.ts:417-470` `sumario` keys (add `tree`, `palette`, `rail` groups); `copy/ui.ts` (`overflowMenu.triggerLabel`, `reorder.*`).
- `surfaces/relatorio/relatorio.css:81-103` (`.s9-*` placeholders marked "Story 4.4") and `styles/app.css:137-138,190-198` (existing phone translations to extend, not replace).

Mocks: `prototype/screens/40-relatorio-overview.html:1-127` (page styles incl. `.frame-phone` rules), `:200-238` (section 9 markup), `:260-286` (menus), `:292-386` (`#lo-palette`); `prototype/shell-head.html:80-121` and `shell-foot.html:42-105` (rail, collapsed strip, tree rows); `key-sheet-states.html:424-475` (Confirm, toast, duplicated row); `components.css:330-369` (`.block-palette`, `.rail*`, `.relatorio-tree`).

Tests: `apps/web/src/surfaces/relatorio/sumario-surface.test.tsx:85-103` (`portoSeguroSmall` via `applyPulled` plus section blocks, mocked session/sync, `jest-axe`); `e2e/relatorio.spec.ts` (`resetEmpresaB`, `announcer`, the `@p0`/`@p1` tag convention, the API op push of `4.3-E2E-002`), `e2e/support/merged-fixtures.ts`, `e2e/durability.spec.ts` (`4.3-E2E-003` touch precedent), `playwright.config.ts` (`verify` runs `@p0` on `desktop-chrome` + `durability-desktop-chrome`).

## Tasks & Acceptance

**Execution (kernel):**
- `packages/domain/src/relatorio/tree.ts` (new) + `tree.test.ts` -- `locationTree(snapshot, equipment?)` returning typed nodes (`cabine` with `meta`, counter text/state; `coluna` (any non-cabine location) with counter; `equipment` with `blockId`, `equipmentId`, `tag`, `typeLabel`, `state`, `glyph`, `stateText`, `position`, `siblings`, `duplicate: boolean`, `level`), `firstInTree(snapshot, cabineId)`, `SHEET_STATE_GLYPH`, `locationPathText(locations, id)` ("1° Subsolo › Coluna 5"), `railHeadText(n)` ("Árvore do relatório · 94 blocos", "1 bloco"), `blockHoldsData(block)` (= `sheetState !== 'vazia'`); matrix rows 1-4 as tests.
- `packages/domain/src/relatorio/block-texts.ts` (new, or inside `tree.ts`) + tests -- `blockMovedText(tag, position, total)` ("SEC-C09 movido para a posição 3 de 5"), `blockCreatedText(tag, locationName)` ("SEC-C09 criada na Coluna 9"), `tagTakenText(tag, path | null)`, `duplicateTagText(tag)` ("TAG SEC-C05 duplicada"), `tagVerdict(tag, equipment, selfId?)` → `null | 'empty' | 'taken'` plus the holder, `agruparToggledText(name, on)` (authored: "Agrupar por tipo ativado em ⟨nome⟩" / "desativado"), `removeBlockTitle(tag)` ("Remover ficha SEC-C05?").
- `packages/domain/src/relatorio/sumario.ts` -- extend `cabineMetaText`; F-5 in `restorableBlocks` (signature gains locations; update the Sumário call site and tests).
- `packages/domain/src/index.ts` -- exports.

**Execution (web):**
- `apps/web/src/surfaces/relatorio/relatorio-tree.tsx` (new; `section-9.tsx` becomes a thin wrapper or is deleted with its import updated) -- the ONE tree component, `presentation: 'sumario' | 'rail'`. Sumário presentation: the mock's `.s9-tree` › `.s9-cabine` (`.s9-cab-row`: `.tree-chevron` with `aria-expanded`/`aria-controls` and label "Expandir ⟨nome⟩"/"Recolher ⟨nome⟩", `.s9-cab-body` name + `.s9-cab-meta`, `.progress-counter`, Overflow "Abrir primeira ficha (dados da cabine)" [only when `firstInTree`] · "Agrupar por tipo na seção 9" [checkable] · "Adicionar bloco" · "Adicionar coluna" · "Renomear" · "Subir" · "Descer"), coluna rows (chevron, name, `.s9-col-meta` counter, Overflow "Adicionar bloco" · "Renomear" · "Subir" · "Descer"), equipment rows `.s9-eq` (`PositionBox` among location siblings, `.s9-eq-open` button with `.block-tag`, `.s9-eq-name`, `.s9-state[data-state]` = aria-hidden glyph + word, the duplicate line + "Renomear", `DragHandle`, Overflow "Adicionar abaixo" · "Subir" · "Descer" · "Duplicar" · "Renomear TAG" | "Remover"), `.is-current`/`aria-current` + "você parou aqui" on the last-sheet row, `.s9-add` "Adicionar bloco em ⟨cabine⟩" under each open cabine, foot `btn btn-text` "Adicionar cabine" (authored). Expand state is local: on open, only the path to the last sheet is expanded when section 9 opens by status, else cabines collapsed; colunas open when their cabine opens. Left/Right per the matrix. Rail presentation: `ul.relatorio-tree` `.tree-row[data-level]` (`.tree-chevron`, `.tree-body` + `.tree-meta`, `.tree-state[data-state=concluida|em-preenchimento|vazia|nao-ensaiada]`), `is-selected` + `aria-current="true"` on the current block, cabine Overflow limited to "Abrir primeira ficha (dados da cabine)" and "Agrupar por tipo na seção 9", no Position box, drag or equipment Overflow.
- `apps/web/src/surfaces/relatorio/tree-actions.ts` (new) -- the tree's writes through the Sumário's queue (create block from palette, reorder block/location, remove/undo/restore with the focus rules, duplicate, rename TAG, add/rename location, agrupar), each announcing and toasting via `undoable`; the equipment row's `.s9-eq-open` press and "Abrir primeira ficha" call one `openSheet(blockId)` hook: expand the path, focus the row, `writeLastSheet`, toast "Abrir a ficha: disponível na próxima etapa" (authored; tracked stub, owner Epic 5 Story 5.1).
- `apps/web/src/surfaces/relatorio/block-palette-field.tsx` (new) -- `.block-palette` in the `PaletteDrawer` shell (bottom sheet below 768 px, right drawer from 768 px, `.sheet-grip`), `.palette-head` "Adicionar bloco" + close, `.palette-group` "Em: ⟨path⟩", `.palette-group` "Escolha o tipo · TAG sugerida por tipo + coluna" (authored from the mock's "Ou escolha…", the camera tile is out of slice), eight `.palette-item` rows (`i-block` icon, `.pi-text` label + `.pi-meta` suggested TAG, `.plus`); below 1280 px a tap creates at once; from 1280 px each type is a `.lo-type` whose tap opens its `.type-confirm` (TAG input, Local select, "Confirmar"), switched by CSS; `.office-note` verbatim from the mock.
- `apps/web/src/surfaces/relatorio/tag-dialogs.tsx` (new) -- "Duplicar ⟨TAG⟩" and "Renomear TAG ⟨TAG⟩" `FormDialog`s and the location "Renomear ⟨nome⟩" dialog ("Nome"), each field refusing on blur with the kernel sentence and the primary `aria-disabled` with a visible reason.
- `apps/web/src/surfaces/relatorio/tree-surface.tsx` (new) + `app.tsx` -- `/relatorio/:id/arvore`: loads like the Sumário (pull on open when absent); below 768 px the tree (rail presentation, full width) is the surface; from 768 px the `.rail` (head `railHeadText` + "Recolher árvore") beside a `.section-note` "Abra uma ficha na árvore." (authored; tracked stub, owner Epic 5), collapsing to `.rail-collapsed` (toggle "Abrir árvore do relatório", `aria-expanded`, vertical label "Árvore do relatório") by default in portrait (768-1023 px) and on "Recolher árvore".
- `apps/web/src/surfaces/relatorio/sumario-surface.tsx`, `restore-dialog.tsx`, `relatorio-ops.ts`, `components/overflow-menu.tsx` -- wiring per the Code Map; header "Restaurar ficha removida" lists equipment blocks too and restores block + equipment.
- `apps/web/src/copy/pt-br.ts`, `copy/ui.ts` -- the static strings above, verbatim or `// authored:`.
- `apps/web/src/surfaces/relatorio/relatorio.css`, `styles/app.css` -- tree rows (56 px, 24 px per level, chevron 48×56), rail and strip, palette `.lo-type`/`.type-confirm`/`.office-note` page rules, the `.frame-phone` translations of `40-relatorio-overview.html`, the CSS switch between field and office palette rows; `components.css` untouched.
- `apps/web` unit tests -- `relatorio-tree.test.tsx` (portoSeguroSmall + section blocks: expand/collapse by chevron and Left/Right, states and glyphs `aria-hidden`, cabine meta, menus per row kind, "Abrir primeira ficha" hidden when empty, agrupar op, Position box/Alt+arrow ops and announcement, remove with and without Confirm and focus after remove/undo/restore, duplicate line and rename, rail `aria-current` and strip), `block-palette-field.test.tsx` (one batch of two creates with `seed_version`, suggested TAG meta, office confirm refusal), `tag-dialogs.test.tsx`, axe on each.
- `e2e/tree.spec.ts` (new; seed a relatório by pushing the `project` create and `instantiateTemplate` drafts through `/api/sync/ops` after `resetEmpresaB`, then open `/relatorio/:id`) -- `@p0 4.4-E2E-001` section 9 at 1280: chevrons and Left/Right, coluna and equipment rows with states, cabine meta, "Abrir primeira ficha" focuses the row, Agrupar toggle survives a reload, "Adicionar coluna" + "Renomear" + Subir announced, "Adicionar cabine"; `@p0 4.5-E2E-001` at 768: palette from a coluna row (drawer), one tap creates "⟨TAG⟩" with the context offline, reload offline keeps it, online + "Sincronizar agora" clears the badge; Position box, Overflow Subir/Descer, Alt+ArrowUp and a mouse drag each move a block with the announcement; Duplicar with a taken TAG refused inline then a new one; Renomear TAG; Remover an empty block (focus asserted), Desfazer (focus asserted); a block made non-empty by an API `block/{id}/not_tested` put: Remover asks "Remover ficha ⟨TAG⟩?", confirm, focus asserted, header "Restaurar ficha removida" brings it back (focus asserted); `@p0 4.5-E2E-002` at 1280: office confirm with TAG and Local prefilled, an existing TAG refused on blur with the full sentence; `@p1 4.5-E2E-003` a duplicate TAG pushed through the API shows "TAG ⟨TAG⟩ duplicada" and "Renomear" clears it; `@p1 4.4-E2E-002` `/arvore` at 390 (surface), 768 (strip, opens), 1280 (rail, `aria-current` on the last sheet).
- `e2e/durability.spec.ts` -- `@p1 4.5-E2E-004` on `durability-android-chrome`: at phone width the palette opens as a bottom sheet and a tap creates a block; a press-and-hold (300 ms, CDP touch events) drag moves a block (E3-A8 touch rule).
- `_bmad-output/implementation-artifacts/deferred-work.md` -- resolve the `Section9Tree` stub entry; add `class: stub` entries for the `openSheet` toast and the `/arvore` tablet placeholder (owner Epic 5 Story 5.1) and for the office palette's sub-block toggles inside a sheet (owner Epic 5).

**Acceptance Criteria:**
- Given section 9 expanded, when it renders, then cabine › coluna › equipment rows are unnumbered, 56 px tall, indented 24 px per level, under the note "Organizados por local aqui; no documento, agrupados como no FO.SERV-03.", each chevron a 48×56 px target separate from the row body, and Left/Right expand and collapse (`4.4-E2E-001`).
- Given equipment rows, when they render, then each shows the glyph (`aria-hidden`) plus word of its `sheetState`, "Não ensaiada" with its reason, and a pending Suggestion never counts as filled (kernel and unit tests).
- Given a cabine row, when it renders, then its meta shows the cabine data read-only or "—" and its Overflow offers "Abrir primeira ficha" and the Agrupar por tipo toggle writing `location/{id}/agrupar_por_tipo` (`4.4-E2E-001`).
- Given a cabine or coluna, when it is added, renamed or reordered from the tree, then `location/{id}` ops are emitted, moves are announced and undoable, and every block keeps its `location_id` (`4.4-E2E-001`, unit test).
- Given `/relatorio/:id/arvore`, when it opens, then at 390 px the tree is its own surface; at 768-1023 px the rail shows as the 48 px strip labelled "Árvore do relatório" and opens to 320 px; at 1280 px the 320 px rail lists cabines and fichas with `aria-current` on the current sheet (`4.4-E2E-002`, unit test).
- Given the field palette, when opened from a tree row or "Adicionar bloco em ⟨cabine⟩", then it lists the eight equipment types with the suggested TAG in `meta`, no sections and no sub-block toggles, and one tap creates `equipment` + `block` in one batch with the relatório's `seed_version`, offline, placed in tree order (`4.5-E2E-001`, `4.5-E2E-004`).
- Given the office palette at 1280 px, when a type is chosen, then TAG and Local are asked prefilled with the suggestion and the current location (`4.5-E2E-002`).
- Given a taken TAG, when the field is left, then it is refused inline with "TAG já existe nesta obra — ⟨TAG⟩ em ⟨caminho⟩"; duplicates arriving by sync read "TAG ⟨TAG⟩ duplicada" with "Renomear"; renaming keeps `equipment_id` (`4.5-E2E-002/003`, unit tests).
- Given a block with data, when "Remover" is chosen, then a Confirm names the TAG, the tombstone is written, the persistent toast "Ficha removida" offers Desfazer, the focus lands per the matrix, and "Restaurar ficha removida" lists and restores it (`4.5-E2E-001`).
- Given a block, when moved by drag (press and hold 300 ms on touch), Overflow Subir/Descer, Alt+↑/↓ or the Position box, then one `block/{id}/order_key` op is emitted, out-of-range clamps and "⟨TAG⟩ movido para a posição n de N" is announced with Desfazer; "Duplicar" copies the `BlockConfig` and asks a new TAG; "Mover para…" is absent (`4.5-E2E-001/004`).

## Spec Change Log

## Review Triage Log

### 2026-09-24 — Review pass
- verdicts: 41 findings — high 0, medium 4, low 34, false 3, maybe-false 0
- findings (Blind Hunter):
  - `[false]` `[reject]` a restore or Desfazer brings back a TAG a new row took meanwhile, with no check — the matrix row "Desfazer / Restaurar" defines exactly this outcome: restored anyway, the duplicate line and "Renomear" appear.
  - `[low]` `[reject]` a sheet whose location was removed elsewhere comes back invisible; `restorableBlocks` gets live locations only — no path removes a cabine or coluna in this epic (Never list), on any device, so the state is unreachable.
  - `[low]` `[reject]` `newLocation` can repeat a name ("Coluna 3" beside a coluna renamed "Coluna 3") — needs a rename to the next default name; the fix adds a search loop for a case nobody meets in everyday use, and a rename fixes it.
  - `[medium]` `[patch]` Desfazer after a palette/Duplicar creation or "Adicionar coluna/cabine" drops the focus to `<body>` (no focus target) — E3-A8; focus targets passed (anchor row, location chevron, "Adicionar cabine").
  - `[low]` `[patch]` wrong or missing sentence when the target is gone: Duplicar of a vanished sheet says the location changed; Renomear TAG/Renomear location say nothing — `t.gone`/`t.locationGone` toasted like the other actions. The `RangeError` swallow in `edit` is batch A's pre-existing behaviour, moved unchanged (not this story's).
  - `[medium]` `[patch]` shipped paths never exercised (Adicionar abaixo, `.s9-add` press, Desfazer after move/creation/add with focus, rail Left/Right) — tests added.
  - `[medium]` `[patch]` the web decides kernel rules (`state === 'vazia'` while `blockHoldsData` is unused, the Duplicar TAG suggestion, the `.s9-state` vocabulary) — moved into `packages/domain` with tests (AD-2).
  - `[low]` `[patch]` `treeContext` memo defeated by a new editor object each render — editor object memoized.
  - `[low]` `[reject]` the palette open on a location removed elsewhere renders nothing and stays set — locations cannot be removed; the palette is modal, so an undo of the add cannot land while it is open.
  - `[low]` `[patch]` copy homes: two more "Cancelar" in `pt-br.ts` (component chrome in `ui.ts`), three rail keys with one string, two "Renomear" keys — one key per string, Cancelar from `ui.ts`.
  - `[low]` `[patch]` `toggleAgrupar` has no undo toast though the task says every tree write toasts via `undoable` — toast added.
  - `[low]` `[patch]` the rail and phone bottom sheet run only in `@p1` tests — `4.4-E2E-002` (rail widths) promoted to `@p0`; `4.5-E2E-004` stays `@p1` on `durability-android-chrome` (the touch rule's project is outside `verify` by design, as `4.3-E2E-003`).
- findings (Edge Case Hunter):
  - `[low]` `[patch]` Renomear TAG after the equipment row left says nothing — same entry as the Blind Hunter's gone-sentence row.
  - `[low]` `[patch]` Renomear location after removal elsewhere says nothing — same entry.
  - `[low]` `[patch]` Duplicar of a removed source toasts the location sentence — same entry.
  - `[low]` `[reject]` restore into a removed location — unreachable, as above.
  - `[low]` `[reject]` `restorableBlocks` given live locations only — unreachable consequence, as above.
  - `[low]` `[reject]` an orphan location drawn as a root gets root siblings for its moves — needs a location whose parent is removed or absent, which no path creates (the relatório stream carries every location).
  - `[low]` `[reject]` `newLocation` name collision — same as the Blind Hunter row.
  - `[low]` `[reject]` palette target removed while open — same as the Blind Hunter row.
  - `[low]` `[reject]` the office confirm's prefilled TAG goes stale when a sync adds that TAG while it is open — the inline refusal names it and the field is editable; a refresh effect adds state handling for a rare race.
  - `[low]` `[patch]` the rail draws an interactive `aria-expanded` chevron on a location with no children — a non-interactive chevron span when empty.
  - `[low]` `[reject]` `edit` swallows every `RangeError` as "gone" — batch A's code moved unchanged (pre-existing); no new builder throws a `RangeError` of its own.
  - `[low]` `[patch]` a collapsed cabine holding the last sheet lost batch A's row highlight — rule restored for the collapsed current cabine.
  - `[low]` `[patch]` `toggleAgrupar` not undoable — same entry as the Blind Hunter row.
- findings (Verification Gap):
  - `[medium]` `[patch]` the tree's gone and write-time TAG refusal branches run in no test — tests added (tombstone then Descer; TAG claimed before Duplicar's write; rename after removal).
  - `[low]` `[patch]` the rail width modes and the phone bottom sheet are checked only by `@p1` specs — `4.4-E2E-002` promoted to `@p0`; the bottom sheet stays in the `@p1` touch test.
  - `[low]` `[patch]` (other) rename silent when the target is gone — same entry as the gone-sentence row.
  - `[low]` `[patch]` (other) Duplicar's vanished source toasts the location sentence — same entry.
- findings (Intent Alignment, descriptive; graded by the harm a reader of the ACs would meet):
  - `[low]` `[reject]` a. the rail and the phone tree live at an unlinked `/relatorio/:id/arvore`, portrait as the 768-1023 px band — the spec's recorded decision until Epic 5 mounts the rail in a sheet and links the phone surface; now in the `@p0` gate.
  - `[low]` `[reject]` b. phone indent 16 px instead of 24 px — the verbatim translation of the mock's own `.frame-phone … .s9-eqs` rule; 24 px holds from 768 px.
  - `[false]` `[reject]` c. cabine meta appends "agrupar por tipo" — the mock's cabine rows print it and the matrix row "Cabine meta" specifies it.
  - `[low]` `[reject]` d. "office rule, field exception" offered at every width — the spec's recorded reading (the exception makes it available in the field).
  - `[low]` `[reject]` e. office palette as the ≥1280 px layout; toggles inside a sheet deferred — spec decisions (EXPERIENCE.md: desktop; the sheet is Epic 5), recorded in `deferred-work.md`.
  - `[low]` `[patch]` f. the toast "until next navigation" has no test — unit test of the dismissal on unmount added; the empty-block path without Confirm is the matrix row.
  - `[low]` `[reject]` g. touch press-and-hold only in `@p1` on the Android project — E3-A8's touch rule names that project, which `verify` does not run by design.
  - `[low]` `[patch]` h. "unconfirmed Suggestions never count" holds only by construction — the kernel fixture now carries a real pending suggestion row.
  - `[low]` `[reject]` i. the e2e rename asserts the block id, the unit test the `equipment_id` — the unit test is the proof; the e2e covers the flow.
  - `[false]` `[reject]` j. "prints in tree order" untested in a document — the renderer is Story 4.8/Epic 6; this story places the `order_key` in tree order, asserted by `newBlockOrderKey` tests.
  - `[low]` `[patch]` k. the e2e "Mover para" absence runs with no menu open — asserted inside an open equipment Overflow.
  - `[low]` `[reject]` l. `4.3-E2E-002` assertions changed — the tree now opens on the path to the last sheet, so the scroll assertion measures that row; the AC (scrolled to the last sheet) is asserted more precisely.

## Design Notes

- Batching exception (E3-A7): Stories 4.4 and 4.5 ship in one PR because the block operations of 4.5 live on the tree rows of 4.4 (palette opened from a tree row, reorder by drag/Alt+arrows/Position box on the same rows); one component, one PR, decided by the coordinator 2026-09-23.
- Parallel-story checklist (P6): compose project `fasor-e4b`; ports 16030 (api), 16073 (web), 16032 (postgres), 16090/16091 (minio), 16080/16443 (caddy), 16001 (api-prod). Stub removed here: `Section9Tree` (batch A's, owner this batch). Stubs added here: the `openSheet` toast and the `/arvore` tablet placeholder (owner Epic 5 Story 5.1). Batches C and D also touch the Sumário: this batch changes only the section 9 row's children, the tree, the palette, the block/location Overflow, the restore list and the ops builders. Merge-back: `git merge origin/main` into this branch, conflicts resolved here, `pnpm verify` re-run.
- Reconciliations (recorded, no planning sentence rewritten): "unnumbered" (4.4) means no document numbering; the Position box 4.5 requires shows the block's position among its location's siblings. Confirm title follows the AC ("Remover ficha SEC-C05?"), its description the `key-sheet-states.html` (e) sentence without the item/photo counts that only exist from Epic 5. The field palette creates on one tap (AC and EXPERIENCE.md) instead of the mock's type-then-Confirmar step; the edit happens afterwards through "Renomear TAG"; the mock's "Trocar" is not drawn (the palette opens from the row where the block goes). Tree rows are lists with `aria-expanded` chevrons rather than ARIA `tree`/`treeitem`, because each row holds a Position box, buttons and a menu; Left/Right follow the AC. Location reorder offers Subir/Descer and Alt+arrows (the four block paths are 4.5's). Removing a block tombstones its equipment row too (one equipment per block in this MVP) so its TAG is freed; restore clears both. The office variant is the ≥1280 px layout (EXPERIENCE.md: desktop), switched by CSS.
- Deferred narrowing (Epic 5): "inside a sheet (office) it lists the block's sub-blocks with on/off toggles" needs the sheet surface; recorded in `deferred-work.md`.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm verify` -- expected: lint, static, unit, api, Playwright `@p0` green.
- `docker compose --profile tools run --rm tools pnpm exec playwright test e2e/tree.spec.ts --project=desktop-chrome` -- expected: all `4.4-*`/`4.5-*` green, `@p1` included.
- `docker compose --profile tools run --rm tools pnpm exec playwright test e2e/durability.spec.ts --project=durability-android-chrome --grep 4.5-E2E-004` -- expected: green.
- `docker compose --profile tools run --rm tools pnpm exec playwright test e2e/relatorio.spec.ts --project=desktop-chrome` -- expected: batch A's tests still green.

**Manual checks:**
- Scripted real-browser pass against `http://localhost:16073` at 390/768/1280 px, light and dark, keyboard only (chevrons, Left/Right, Position box, Overflow, Alt+arrows, palette, dialogs), offline create; screenshots under `_bmad-output/implementation-artifacts/reviews/qa-epic-4-B/`, compared with `40-relatorio-overview.html`, `shell-head.html`/`shell-foot.html` and `key-sheet-states.html`; 0 px horizontal overflow.

## Auto Run Result

Status: done (branch `story/4-4-4-5-tree-and-blocks`; the batch orchestrator opens the PR, the coordinator merges).

**Summary:** Stories 4.4 and 4.5 in one PR. Kernel: `relatorio/tree.ts` (`locationTree` with states, glyphs, words, counters, positions, duplicates, `holdsData` and the Sumário state value; `firstInTree`, `treePathTo`, `paletteItems`, `locationChoices`, `newEquipmentBlock`, `newBlockOrderKey`, `newLocation`, `duplicateTagSuggestion`, `railHeadText`), `block-texts.ts` (move, creation, TAG taken/duplicated, rename, agrupar and remove-title sentences, `tagVerdict`), `location-path.ts`, `locationProgress`, `cabineMetaText` with temperature/humidity and "—", `restorableBlocks` with unique labels and the sheet's place (F-5). Web: `relatorio-tree.tsx` replaces the `Section9Tree` stub (one tree, Sumário and rail presentations), `tree-actions.ts`, the field/office Block palette (`block-palette-field.tsx`, CSS switch at 1280 px), `tag-dialogs.tsx` (Duplicar, Renomear TAG, location rename), `/relatorio/:id/arvore` (`tree-surface.tsx`: surface on phone, 48 px strip in portrait, 320 px rail), the Sumário's write path, focus helpers and pull gate lifted into `relatorio-editor.ts`, `relatorio-focus.ts`, `relatorio-gate.tsx`; `OverflowMenu` gains a checkable item. Tests: kernel `tree.test.ts`, `block-texts.test.ts`, `sumario.test.ts`; web `relatorio-tree.test.tsx`, `block-palette-field.test.tsx`, `tag-dialogs.test.tsx`, `tree-actions.test.ts`; e2e `e2e/tree.spec.ts` (`4.4-E2E-001/002`, `4.5-E2E-001/002` `@p0`, `4.5-E2E-003` `@p1`) and `4.5-E2E-004` (`@p1`, `durability-android-chrome`, touch).

**Files changed:** see the PR diff; notable: `packages/domain/src/relatorio/{tree,block-texts,location-path}.ts` (new), `progress.ts`, `sumario.ts`, `templates/text.ts` (`addedText`, `renamedText`); `apps/web/src/surfaces/relatorio/{relatorio-tree,tree-actions,block-palette-field,tag-dialogs,tree-surface,relatorio-editor,relatorio-focus,relatorio-gate}.ts(x)` (new), `sumario-surface.tsx`, `restore-dialog.tsx`, `relatorio-ops.ts`, `relatorio.css`, `section-9.tsx` (deleted); `apps/web/src/components/overflow-menu.tsx`; `apps/web/src/copy/pt-br.ts`; `apps/web/src/styles/app.css`; `apps/web/public/sprite.svg` (`i-tree`); `apps/web/src/app.tsx`; `e2e/tree.spec.ts`, `e2e/support/relatorio-seed.ts` (new), `e2e/durability.spec.ts`, `e2e/relatorio.spec.ts` (4.3-E2E-002 follows the tree's opened path); `deferred-work.md`.

**Review findings:** 41 rows in the Review Triage Log: 4 medium and 12 low patched (undo focus after creations and location adds; gone sentences for rename and Duplicar; kernel ownership of `holdsData`, the Sumário state value and the Duplicar suggestion; editor memo; copy homes; agrupar undo; rail chevron on empty nodes; collapsed current cabine highlight; tests for the gone/refusal branches, Adicionar abaixo, `.s9-add`, undo focus, rail Left/Right, toast on unmount, a real pending suggestion, "Mover para" inside an open menu; `4.4-E2E-002` promoted to `@p0`); 0 deferred; 3 false and 22 low rejected with their reasons in the log. After the patches the matrix audit found the row "restored anyway when the TAG was taken" without a test: `tree-actions.test.ts` added. The first `verify` run failed once in `4.5-E2E-001`: Alt+ArrowUp pressed before the previous move's re-render read the old position (the same stale-position tick batch A recorded); the test now waits for the new order before the next key, as a person reads it.

**Follow-up review recommendation:** true (first pass, 4 medium entries patched). Named risk: two new jsdom tests (tombstone-then-Descer, TAG-claimed-before-Duplicar) write a competing row and click in the same tick before the live query re-renders; they are timing-dependent and should be watched in the gate. Also the Alt+Arrow stale-position tick (a key pressed inside the frame between a move's commit and the re-render uses the previous position) is shared with batch A's rows and remains.

**Verification:** `docker compose --profile tools run --rm tools pnpm verify` green after the patches: lint clean; static clean; unit kernel 54 files / 628 tests, web 74 files / 645 tests, tooling 2 / 20; api 18 files / 107 tests; Playwright `@p0` 43 passed (`desktop-chrome` + `durability-desktop-chrome`). Then `e2e/tree.spec.ts` + `e2e/relatorio.spec.ts` on `desktop-chrome`: 9 passed (`@p1` included); `4.5-E2E-004` on `durability-android-chrome`: passed; `tree-actions.test.ts` 2 passed, `pnpm lint` and `pnpm static` clean after it. The human-style browser pass is the orchestrator's (section 4), recorded in `reviews/epic-4-B-review.md`.

**Residual risks:** the Sumário and tree rebuild `locationTree` over the whole snapshot on each live-query tick (fine at 94 sheets); the `/relatorio/:id/arvore` route is reachable by address only until Epic 5 links it from the sheet; phone rows indent 16 px per the mock's `.frame-phone` rule while DESIGN.md says 24 px.

### 2026-09-24 — Independent review pass (PR #26, fresh context, model opus)
- verdict: changes-requested (0 must-fix, 3 should-fix, 6 nits, 4 notes); every should-fix and five nits fixed and re-verified; F-8 left and F-11/F-12 recorded in `deferred`; the record is `reviews/epic-4-B-review.md`.
- F-1: the rail's "Não ensaiada · ⟨reason⟩" overflowed the 320 px rail — reason moved to the rail meta line (`railMetaText`), rail width asserted in `4.4-E2E-002`.
- F-2: focus after "Desfazer" of a Restaurar fell to `<body>` — the header Overflow trigger takes it.
- F-3: "Adicionar bloco em ⟨cabine⟩" created on the cabine — kernel `paletteLocationFor` targets the current coluna.
- Nits fixed: creation toast article per location kind, duplicated copy keys, the duplicate line's "Renomear" named with TAG and place, the landing index clamp moved into the kernel (`moveLandingIndex`), the palette's initial focus on the first type row.

