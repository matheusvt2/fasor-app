# Independent review: PR #26, Stories 4.4 and 4.5 (Epic 4 batch B)

- Branch: `story/4-4-4-5-tree-and-blocks`; head reviewed: `a14acb38011f891968094e041dca1b43d8c2df84` (two commits over `origin/main` `e7d273b`: `7fa6da9` the stories with the build workflow's review-layer patches, `a14acb3` the orchestrator's QA screenshots). The review-layer patches (undo focus targets, gone toasts, kernel-owned `holdsData`/`sumarioStateAttr`/`duplicateTagSuggestion`, editor memo, copy keys, agrupar undo, rail chevron, collapsed-cabine highlight, the new tests) were re-read as part of the diff.
- Reviewer: independent, model opus (worktree `agent-aa2e041279ba7ec5f`, compose project `fasor-e4b`). No source, test, spec or planning file edited; this file and the `R-*` screenshots are the only writes.
- Date: 2026-09-24.

## What I ran (all in the `tools` container of `fasor-e4b`)

| Command | Result |
|---|---|
| `pnpm --filter @app/domain exec vitest run src/relatorio src/templates` | 14 files, 138 tests, green |
| `pnpm --filter @app/web exec vitest run src/surfaces/relatorio src/components/overflow-menu.test.tsx src/styles` | 9 files, 95 tests, green |
| `pnpm --filter @app/web exec vitest run src/surfaces/relatorio/relatorio-tree.test.tsx -t "tree edge paths"` six times (the tombstone-then-Descer and TAG-claimed-before-Duplicar races) | 6/6 green (7 passed each) |
| `pnpm --filter @app/web exec vitest run src/surfaces/relatorio` three more times | 3/3 green (43 tests each) |
| `pnpm exec playwright test e2e/tree.spec.ts e2e/relatorio.spec.ts --project=desktop-chrome` | 9 passed (`4.4-E2E-001/002`, `4.5-E2E-001/002` `@p0`; `4.5-E2E-003`, `4.3-E2E-002` `@p1`; batch A's `4.1-E2E-001/002`, `4.3-E2E-001`) |
| `pnpm exec playwright test e2e/durability.spec.ts --project=durability-android-chrome --grep "4.5-E2E-004\|4.3-E2E-003"` | 2 passed (bottom sheet, press-and-hold drag, touch Position box) |
| Throwaway Playwright scripts `.bmad-loop/cache/qa-b/r-review.spec.ts`, `r2-review.spec.ts` (git-ignored; forwarder `127.0.0.1:16074 -> web:5173`; Empresa A; axe-core 4.12.1 injected, WCAG 2.0/2.1 A/AA tags) | geometry, Tab order, focus after every destructive action and its undo, toast persistence, phone CSS, rail; evidence for F-1 to F-3; screenshots `qa-epic-4-B/R-01..R-05` |
| Committed screenshots `qa-epic-4-B/01-22` compared with `40-relatorio-overview.html`, `shell-head.html`/`shell-foot.html`, `key-sheet-states.html` | see F-1 and "Checks with evidence" |

Greps over the whole diff: no emoji (the only non-ASCII symbols are DESIGN.md's text glyphs ✓ ● ○ ⊘, always `aria-hidden` where drawn), no `laudo`, no client name, CNPJ or address outside the Porto Seguro fixture (tests reference `portoSeguroSmall`; the QA screenshots show the standard template's skeleton names only). Planning documents untouched (`git diff --stat origin/main...HEAD -- _bmad-output/planning-artifacts/` empty). `deferred-work.md` closes the `Section9Tree` stub and opens three `class: stub` entries with owners.

## Findings

### F-1 (should-fix) The rail cannot fit "Não ensaiada · ⟨reason⟩": the row overflows the 320 px rail and the body collapses to 8 px

- Where: `apps/web/src/surfaces/relatorio/relatorio-tree.tsx:552-555` draws `node.stateText` (word plus the seed reason, kernel `tree.ts:195`) inside `.tree-state`, which `components.css:365` sets `white-space: nowrap`; `relatorio.css:173` gives `.rail` `overflow-y: auto`, which computes `overflow-x` to `auto` as well.
- Evidence (`r2-review.spec.ts`, a sheet made not tested by an API `block/{id}/not_tested` put, then `/arvore`): at 1280 and at 800 (rail opened) `aside.rail` has `clientWidth 319`, `scrollWidth 373`; the `.tree-state` ends at x=373 while the row ends at 319; `.tree-body` is 8 px wide, so "Chave seccionadora" spills over the state text and "SEC-C01" breaks as "SEC-" / "C01". At 390 (the phone surface) nothing scrolls but the body is 25 px wide and its text overprints "⊘ Não ensaiada". Screenshots `R-05-rail-nao-ensaiada-1280.png`, `-800.png`, `-390.png`; the orchestrator's own `21-arvore-1280-dark.png` shows the same clipped "Solicitação do" and was not flagged.
- Why no test caught it: `4.4-E2E-002` checks `horizontalOverflow(page)` (the document), and the rail scrolls inside itself; the only rail sheet it inspects is `Vazia`. The mock's rail (`shell-foot.html` template `rail-tree`) prints only the word "Não ensaiada", so the mock never met the longer text the AC asks for.
- Fix: keep the glyph and word in `.tree-state` (the kernel already exposes `stateWord`) and give the reason its own line, e.g. `.tree-meta` "SEC-C01 · Solicitação do cliente" (compose it in the kernel as a rail meta text), or let the rail's `.tree-state` wrap with an authored `relatorio.css` rule; add to `4.4-E2E-002` a not-tested sheet and the assertion `aside.rail` `scrollWidth <= clientWidth` at 1280 and 800, plus a body width floor at 390.

### F-2 (should-fix) "Desfazer" after restoring an equipment sheet drops the focus on `<body>`

- Where: `apps/web/src/surfaces/relatorio/sumario-surface.tsx:250` `undoable(t.tree.restored, batch)` passes no focus target, so the undo (which tombstones the sheet again) leaves nothing focused once its row and the toast are gone.
- Evidence (`r-review.spec.ts`): header Overflow > "Restaurar ficha removida" > "Restaurar SEC-C01 — 1° Subsolo › Coluna 1" puts the focus on "Mais opções de SEC-C01" (correct), then the toast's "Desfazer" leaves `document.activeElement === body`. Every other undo lands deliberately (measured: after Agrupar the cabine chevron; after Duplicar the source row's `.s9-eq-open`; after Adicionar cabine the "Adicionar cabine" button; after Adicionar coluna the cabine chevron; after Remover the restored row's Overflow).
- The spec's Boundaries require every destructive action and Desfazer to move the focus deliberately with a test asserting it (E3-A8); this is the one path of the tree that does not. The section path on the next line (`:254`, batch A) has the same gap; fixing both together is one helper.
- Fix: pass a focus target built like `removeBlock`'s: the row now in the restored row's slot, else the previous row, else the location chevron (capture the `li` before the undo in the `onUndo` callback and reuse `focusAfterRemoval`); add a unit assertion after Restaurar > Desfazer in `relatorio-tree.test.tsx`.

### F-3 (should-fix) "Adicionar bloco em ⟨cabine⟩" puts the new sheet on the cabine itself, with no field way to change it

- Where: `relatorio-tree.tsx:409` opens the palette with `{ locationId: node.id }` for the cabine; `block-palette-field.tsx:86` shows "Em: 1° Subsolo"; the TAGs become `SEC-SUBSOLO`, `DJ-SUBSOLO` (`r-review.spec.ts` log: `["CE-SUBSOLO","PR-SUBSOLO","SEC-SUBSOLO",...]`) and the block is drawn above the colunas. At 768 a tap on Disjuntor MT under Oxigênio toasted "DJ-OXIGENIO criada na Oxigênio" (`R-01-s9-add-on-cabine-768.png`).
- The mock's palette opened from that very button reads "Em: 1° Subsolo › Coluna 9 (última coluna aberta) · Trocar" (`40-relatorio-overview.html` `#lo-palette`), and EXPERIENCE.md › Block palette (field) says each type creates "one block in the current column". The spec dropped "Trocar" on the grounds that "the palette opens from the row where the block goes", which holds for a coluna row and "Adicionar abaixo" but not for this cabine-level button. Below 1280 px there is no Local field, block `location_id` writes are out until Epic 11 ("Mover para…"), so a seccionadora meant for Coluna 9 can only be removed and re-added from the coluna row.
- Fix: target the current coluna (the last sheet's location when it is under this cabine, else the cabine's last coluna, else the cabine when it has none) and say it in "Em:"; or record the narrowing in the spec's Design Notes and strike it beside the 4.5 AC in `epics.md` with the date, so the behaviour is a decision rather than an accident.

### F-4 (nit) "⟨TAG⟩ criada na ⟨local⟩" is ungrammatical for most cabine names

- `packages/domain/src/relatorio/block-texts.ts:17` hardcodes the feminine article: "DJ-OXIGENIO criada na Oxigênio", and it would read "criada na Cubículo Enel", "na Geradores", "na 1° Subsolo". Fine for "Coluna 9" (the mock's example). Suggest "criada em ⟨nome⟩" for every location, or the article only for a coluna, with a kernel test for a cabine name.

### F-5 (nit) Copy homes: strings duplicated inside the Sumário's own copy

- `apps/web/src/copy/pt-br.ts:485-491` `sumario.tree.{moveUp, moveDown, addBelow, duplicate, remove}` repeat `sumario.{addBelow, moveUp, moveDown, duplicate, remove}` at `:425-429`, the same surface; `sumario.tagDialogs.tagLabel` (`:515`) and `sumario.palette.tagLabel` (`:534`) are both "TAG"; `sumario.tagDialogs.duplicate` repeats `sumario.tree.duplicate`; `sumario.palette.close` (`:528`) repeats `sumario.close` (`:449`). The Triage Log says "one key per string" was patched; these remain. AGENTS.md "each string lives in exactly one" home; reuse the existing `sumario.*` keys (or move the menu words to one `sumario.menu` group used by both rows and tree).

### F-6 (nit) The duplicate line's "Renomear" has a name without context

- `relatorio-tree.tsx:483`: every duplicated row carries a button named just "Renomear"; with two duplicated TAGs (the normal case: both rows of the pair show the line) a screen reader's button list reads "Renomear, Renomear". An `aria-label` "Renomear TAG ⟨TAG⟩" (visible word unchanged, the label template in `pt-br.ts`) disambiguates; the e2e already scopes by row, so no locator breaks.

### F-7 (nit) The landing position of a move is clamped in the web app

- `apps/web/src/surfaces/relatorio/tree-actions.ts:146,178` `Math.min(total - 1, Math.max(0, toIndex))` decides the position the announcement names, next to the kernel's `orderKeyForMove`, which clamps the same index. Small, but it is an order rule outside `packages/domain` (AD-2); have the kernel return the landing index with the key (or export the clamp) so the two can never disagree.

### F-8 (nit) The office confirm departs from the mock and from React Aria

- `block-palette-field.tsx:175-203`: the `.type-confirm` is a TAG input, a native `<select>` for Local (`:190`) and a primary "Confirmar", where the mock draws the `.suggestion-field` "TAG e coluna" with the "Sugerido" pill, the inline `.confirm-btn` and "Editar". Asking TAG and Local is the AC and EXPERIENCE's office variant, so the fields are right; the native select is accessible (axe clean on the palette) but AGENTS.md takes behaviour from React Aria Components, and the app already has a Select/Combobox pattern. Either use the RAC select or record the native one as authored in the file's header.

### F-9 (nit) The palette opens with the focus on "Fechar"

- Measured: opening the palette from a coluna Overflow puts the focus on `button.icon-btn` "Fechar". EXPERIENCE.md › Accessibility: "initial focus lands on the non-destructive action ('Cancelar') or the first option". The first `.palette-item` (or the first visible one per width) is the expected target. Closing is right: Escape returns to the coluna's Overflow trigger, "Fechar" from `.s9-add` returns to that button.

### F-10 (note) The two racing jsdom tests are stable in practice; the reason is an implementation detail

- `relatorio-tree.test.tsx:479-502` write a competing row with `await database.entities.put(...)` and then `fireEvent.click` synchronously. The click always wins because Dexie's live query needs further IndexedDB round trips (fake-indexeddb macrotasks) before React re-renders; had the re-render come first, the menu item would be detached (Descer) or the "Duplicar" button `aria-disabled` (the kernel verdict re-runs), and the tests would fail rather than pass wrongly. 6/6 targeted runs and 4/4 whole-folder runs green here, plus the build's `verify`. Keep an eye on them if Dexie or the live-query hook changes; a deterministic variant would stub the write-time read (`Fresh`) instead of racing the render.

### F-11 (note) Undoing a creation leaves a restorable sheet

- `undoBatch` of the palette/Duplicar batch tombstones the new block and equipment, so "Restaurar ficha removida" then lists it (measured: after Duplicar > Desfazer the dialog offered "Restaurar SEC-C01-2 — 1° Subsolo › Coluna 1" beside the really removed SEC-C01). Consistent with batch A's sections and harmless (restoring brings a valid empty sheet back), but a user who undid a mistaken add may be surprised to meet it there; worth a line in the Design Notes, or a filter on blocks whose removal is the undo of their own create.

### F-12 (note) Narrowings and deviations recorded only in the spec

- Not yet struck through beside the ACs in `epics.md` (the coordinator's job, as in batch A's F-8): the office palette's sub-block toggles inside a sheet (deferred to Epic 5, in `deferred-work.md`); phone rows indented 16 px per the mock's `.frame-phone` rule where DESIGN.md says 24 px; the Confirm title "Remover ficha SEC-C05?" (the AC) where EXPERIENCE.md Flow 3 says "Remover ficha SEC-C09-2 e seus dados?"; "Agrupar por tipo" as a `menuitemcheckbox` in the Overflow where EXPERIENCE.md's Component table lists a `role="switch"` Toggle on the cabine row; `/relatorio/:id/arvore` reachable by address only until Epic 5 (the phone AC "when the tree is opened" has no entry point yet); the portrait rail opens inline beside the column (448-480 px left, `R-04-arvore-800-open.png`) where `prototype/proto.css:59-61` opens it as an overlay with a scrim.

### F-13 (note) Observed and fine

- Geometry at 1280 (`r-review.spec.ts`): cabine row 57 px, coluna row 56 px, equipment row 56 px; cabine chevron at x=65, coluna row at x=89, equipment row at x=113 (24 px per level); cabine and coluna chevrons 48x56; drag handle and Overflow 48x48; Position box 56x48. The phone translations in `app.css` win at 390 (`.s9-eqs` padding `0 8px 0 16px`, `.s9-eq-open` `flex-wrap: wrap`, gap `2px 8px`), 0 px horizontal overflow.
- Tab order through an equipment row: drag handle, Position box, row body, Overflow, then the next row. Alt+Arrow handling ignores events bubbling from portaled menus (`use-reorder.ts` `contains` check), so Alt+ArrowDown inside an open Overflow never moves the row.
- Focus: Renomear TAG Escape returns to the row's Overflow; Remover of a coluna's only sheet lands on the coluna chevron; "Agrupar" closes the menu and returns to its trigger; the "Ficha removida" toast is still up after 9.5 s and gone once the Sumário is left.
- axe clean: the Sumário with section 9 and 1° Subsolo open at 1280 and at 390, the office palette, the Duplicar and Restaurar dialogs, `/arvore` at 1280.
- Rail: cabine Overflow limited to "Abrir primeira ficha (dados da cabine)" and "Agrupar por tipo na seção 9"; ArrowRight on a rail chevron expands; no Position box, drag or equipment Overflow; strip 48 px, rail 320 px, "Recolher árvore" returns the focus to the strip toggle.
- Op shapes: equipment create, `tag` put and `removed_at` remove/put are project scope with `relatorio_id: null` (`relatorio-ops.ts:30-31,66-81`); block and location ops relatório scope; remove and restore write block + equipment in one batch (unit test asserts paths, kinds, scopes, one batch id). Offline create, reload offline, then "Sincronizar agora" clearing the badge are in `4.5-E2E-001`.
- Mock parity of section 9: `.s9-tree`, `.s9-cabine[.is-open][.is-current]`, `.s9-cab-row/-body/-name/-meta`, `.tree-chevron`, `.progress-counter`, `.s9-eqs`, `.s9-eq[.is-current]`, `.s9-eq-open`, `.block-tag`, `.s9-eq-name`, `.s9-state[data-state]`, `.sum-here`, `.s9-add`, `.s9-col`, `.s9-col-meta`; palette `.block-palette`, `.sheet-grip`, `.palette-head`, `.palette-group`, `.palette-item`, `.pi-text`, `.pi-meta`, `.plus`, `.lo-type[.is-open]`, `.type-confirm`, `.confirm-row`, `.office-note`; rail `.rail`, `.rail-head`, `.rail-collapsed`, `.rail-toggle`, `.rail-vlabel`, `.relatorio-tree`, `.tree-row[data-level]`, `.tree-body`, `.tree-meta`, `.tree-state[data-state]`, `.is-selected`. Authored classes (`.s9-cols`, `.s9-coluna`, `.s9-foot`, `.s9-dup`, `.pf-field`/`.pf-office`, `.field-palette`, `.palette-where`, `.arvore-*`) each carry an `authored` comment; DESIGN.md's 56 px rows win over the mock's compact `.s9-col` heading line, as recorded. Copy verbatim from the mocks where drawn ("Abrir primeira ficha (dados da cabine)", "Agrupar por tipo na seção 9", "Adicionar bloco em ⟨cabine⟩", the `.office-note`, the (e) description, "Remover ficha", "Ficha removida", "Recolher árvore", "Abrir árvore do relatório", "Árvore do relatório (recolhida)"), everything else marked `// authored:`.
- Kernel ownership: order, state, glyph, word, reason, counters, meta ("—" when empty), positions, duplicates, `holdsData`, both `data-state` vocabularies, TAG suggestion and verdict, the refusal and duplicate sentences, move/creation/agrupar/rename texts, rail head, restore labels (F-5 of batch A) all come from `packages/domain`; the leak is F-7.
- Regressions to 4.1/4.3: batch A's e2e and unit tests green; `4.3-E2E-002` and the Sumário unit test were adapted to the tree's opened path and assert more (the current equipment row, `aria-current`, the scroll target), not less; the lifted `relatorio-editor.ts`, `relatorio-focus.ts` and `relatorio-gate.tsx` keep batch A's queue, undo retirement, pull gate and focus rules.

## Per-AC table

Story 4.4

| AC | Verdict | Evidence |
|---|---|---|
| 1. Section 9 expands into Cabine › Coluna › Equipamento, 24 px per level, 56 px rows, unnumbered (document numbering), the note, 48x56 chevrons apart from the body, Left/Right expand and collapse | pass | `relatorio-tree.tsx:336-430`, `relatorio.css` tree block; `4.4-E2E-001` (48x56 chevron, >= 56 px row, Left/Right, Left on a leaf to the coluna chevron); my geometry at 1280; phone indent 16 px per the mock (F-12) |
| 2. Glyph (`aria-hidden`) plus word per `sheetState`, "Não ensaiada" with its reason, pending Suggestions never filled | pass on the Sumário; rail layout defect | kernel `tree.ts:174-201`, `tree.test.ts:137-170` (a real pending suggestion row); web unit test; `4.5-E2E-001` reads "⊘ Não ensaiada · Solicitação do cliente". On the rail the reason overflows the 320 px rail (F-1) |
| 3. Cabine meta read-only or "—"; Overflow "Abrir primeira ficha" (`firstInTree`) and the Agrupar toggle writing `location/{id}/agrupar_por_tipo` | pass | `sumario.ts:103-114`, `tree.ts:221,267-270`; `4.4-E2E-001` ("—", toggle survives a reload, announced); unit test (menuitemcheckbox, op, absent on an empty cabine) |
| 4. Cabine/coluna added, renamed, reordered with `location/{id}` ops, moves announced, every block keeps `location_id` | pass | `tree-actions.ts:160-184,322-372`; unit test (op list, no `block/` op); `4.4-E2E-001` (outbox all `location/`) |
| 5. Phone: tree is its own surface; tablet/desktop: 320 px rail of cabines and fichas, 48 px strip labelled "Árvore do relatório" in portrait | pass (narrowed: `/arvore` stands in for the sheet; F-12) | `tree-surface.tsx`, `relatorio.css:167-192`; `4.4-E2E-002` (`@p0`) at 390/800/1280; rail text overflow is F-1 |

Story 4.5

| AC | Verdict | Evidence |
|---|---|---|
| 1. Field palette (bottom sheet / right drawer) from a tree row or "+ Adicionar bloco": 8 types with the suggested TAG in `meta`, no sections, no sub-block toggles; one tap creates equipment + block in one batch, offline, relatório `seed_version`, in tree order | pass, with F-3 | `block-palette-field.tsx`, `tree-actions.ts:187-244`, kernel `newEquipmentBlock`/`newBlockOrderKey`; unit test (one batch, scopes, `seed_version`); `4.5-E2E-001` (drawer 320 px, offline, reload, sync); `4.5-E2E-004` (bottom sheet, touch). From the cabine's "Adicionar bloco em ⟨cabine⟩" the block lands on the cabine, not a coluna (F-3) |
| 2. Office palette at 1280: TAG and Local prefilled with the suggestion and the current location; inside a sheet the sub-block toggles | pass (sub-block toggles deferred to Epic 5, recorded) | `block-palette-field.tsx:148-207`; `4.5-E2E-002`; F-8 on the form's shape |
| 3. Taken TAG refused on blur "TAG já existe nesta obra — ⟨TAG⟩ em ⟨caminho⟩"; sync duplicates read "TAG ⟨TAG⟩ duplicada" with "Renomear"; renaming keeps `equipment_id` | pass | `block-texts.ts`, `tag-dialogs.tsx`; unit tests (verdict, self TAG, write-time refusal); `4.5-E2E-002` (full sentence), `4.5-E2E-003` (`@p1`), unit test asserts the `equipment/{id}/tag` put on the same id |
| 4. Block with data: Confirm names the TAG, tombstone written, persistent "Ficha removida" with Desfazer, focus per the matrix, "Restaurar ficha removida" lists and restores | pass, with F-2 | `relatorio-tree.tsx:194-198,247-264`, `tree-actions.ts:254-288`, `sumario-surface.tsx:230-256`; unit and `4.5-E2E-001` assert focus after Cancelar, Remover (with and without Confirm), Desfazer, Restaurar; the undo of a Restaurar drops the focus (F-2) |
| 5. Drag (300 ms hold on touch), Overflow Subir/Descer, Alt+Arrow, Position box: one `order_key` op, clamped, "⟨TAG⟩ movido para a posição n de N" announced with Desfazer; Duplicar copies the config and asks a TAG; no "Mover para…"; no swipe | pass | `tree-actions.ts:127-158`, `relatorio-tree.tsx:432-488`; unit test (three ops, clamp, announcement); `4.5-E2E-001` (box "9" clamps, Descer, Alt+ArrowUp, mouse drag, Duplicar refused then created, "Mover para" absent inside an open menu); `4.5-E2E-004` (touch hold drag) |

## Verdict

Verdict: changes-requested

- must-fix: none.
- should-fix: F-1 (the rail's "Não ensaiada · ⟨reason⟩" overflows the 320 px rail and collapses the row body; add a rail-width assertion), F-2 (focus falls to `<body>` after "Desfazer" of a restored sheet), F-3 ("Adicionar bloco em ⟨cabine⟩" creates on the cabine itself with no field way to move it; target the current coluna or record the narrowing).
- nits: F-4 ("criada na ⟨cabine⟩"), F-5 (duplicated copy keys), F-6 (context-free "Renomear"), F-7 (position clamp in the web), F-8 (office confirm shape, native select), F-9 (palette initial focus on "Fechar").
- notes: F-10 (racing tests stable, why), F-11 (undone creations appear in the restore list), F-12 (narrowings for the coordinator to strike in `epics.md`), F-13 (observed and fine).

## Fix status

(batch orchestrator, 2026-09-24; fixes by the implementation subagent, re-verified by the orchestrator)

- F-1 (should-fix) fixed: the kernel's `TreeEquipmentNode.railMetaText` carries "⟨TAG⟩ · ⟨reason⟩" for a sheet not tested (the TAG alone otherwise); the rail's `.tree-state` shows only the glyph and `stateWord`, `.tree-meta` the rail meta. `4.4-E2E-002` now makes the last sheet not tested through the API and asserts `aside.rail` `scrollWidth - clientWidth <= 0` at 800 and 1280, the state word, the reason on the meta line and a row body wider than 120 px.
- F-2 (should-fix) fixed: "Desfazer" after either Restaurar path (equipment sheet and section) gives the focus to the header's "Mais opções do relatório" once the row is gone; unit test.
- F-3 (should-fix) fixed: kernel `paletteLocationFor(snapshot, cabineId, lastSheetId)` picks the coluna of that cabine holding the last sheet, else the cabine's last live coluna, else the cabine itself (a cabine without colunas); used by `.s9-add` and the cabine Overflow's "Adicionar bloco"; coluna rows and "Adicionar abaixo" keep their own location. Kernel and unit tests; `4.4-E2E-001` asserts "Em: 1° Subsolo › Coluna 17".
- F-4 (nit) fixed: `blockCreatedText(tag, {kind, name})` reads "criada na ⟨coluna⟩" and "criada em ⟨cabine⟩"; tests.
- F-5 (nit) fixed: the tree's Subir/Descer/Adicionar abaixo/Duplicar/Remover use the existing `sumario.*` keys; `tagDialogs.duplicate`, `palette.tagLabel` and `palette.close` removed in favour of `sumario.duplicate`, `tagDialogs.tagLabel` and `sumario.close`.
- F-6 (nit) fixed: the duplicate line's button keeps the visible "Renomear" and is named "Renomear TAG ⟨TAG⟩ em ⟨caminho⟩" (template in `pt-br.ts`, path from the kernel's `locationPathText`); the unit test and `4.5-E2E-003` press it by that name.
- F-7 (nit) fixed: kernel `moveLandingIndex(total, toIndex)` is used by `orderKeyForMove` and by both move announcements; kernel test.
- F-8 (nit) left: the office confirm keeps the native `<select>` for "Local" (accessible, axe clean); no mock draws the office confirm, and a React Aria Select is a component-library change outside this story; recorded for the coordinator.
- F-9 (nit) fixed: the palette opens on the first type row the width draws (a field row below 1280 px, an office row from 1280 px); unit tests.
- F-10 (note): kept; the racing tests passed every run here as well (verify runs 2 and 4, the reviewer's 10 runs).
- F-11 (note): recorded in the spec's `deferred` list (an undone creation is listed by "Restaurar ficha removida", as batch A's sections are).
- F-12 (note): the narrowings are handed to the coordinator for the `epics.md` strike-through (spec `deferred`).
- The orchestrator's `21-arvore-1280-dark.png` showed the clipped reason and was not flagged by the orchestrator's pass: re-shot after the F-1 fix together with `19`/`20`.
