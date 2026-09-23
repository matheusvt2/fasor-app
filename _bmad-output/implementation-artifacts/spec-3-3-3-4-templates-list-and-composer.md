---
title: 'Stories 3.3 and 3.4: list, duplicate and archive templates; compose the location skeleton and quantities per column'
type: 'feature'
created: '2026-09-22'
status: 'in-review'
baseline_revision: 'b6e9dbf2197c5cc8b80ad9f33424ce66b2ad8431'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/mockups/prototype/screens/41-templates.html'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/mockups/prototype/screens/42-template-composer.html'
warnings: ['multiple-goals', 'oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 3.2 left `/templates` as a name-only list. An office user cannot yet start, duplicate, archive or remove a template, or build a site's cabines and columns with equipment quantities per column. Separately, the `templateRowSchema` superRefine ties `blocks` to `skeleton`, and these are two last-writer-wins fields. Once edits happen, two devices can fold into a row that breaks the schema: `applyOp` throws and the company pull stops. This is the deferred medium from PR #18.

**Approach:**
- Kernel: pure template edit functions and a composer view model in `packages/domain/src/templates/`, a nullable `archived_at` on the template row, and derived pt-BR text.
- Concurrency: the one rule that concurrent edits can break (block ref must exist in the skeleton) moves out of parsing. The view model ignores orphan blocks, and the next `blocks` write drops them.
- Web: the Templates list completed per `41-templates.html`, plus a composer route `/templates/:id` per `42-template-composer.html`. Every edit autosaves as `template/{id}/*` put/remove ops through `commitBatch`.

## Boundaries & Constraints

**Always:**
- Ownership (AD-1 to AD-3):
  - Every count, total, order, announcement text and the rule "which templates are pickable" live in `packages/domain`.
  - `apps/web` renders from IndexedDB and writes only `template/{id}` creates and `template/{id}/{name|blocks|skeleton|archived_at|removed_at}` ops.
  - Nothing else is written: no `relatorio`, `location` or `block` op.
- Composer edits autosave. EXPERIENCE.md wins over the mock's "Salvar template / Cancelar" sticky bar, which is not built. In its place a `section-note` reads `Alterações são salvas automaticamente e não alteram relatórios já criados deste template.` (`// authored:`).
- Conflict resolutions:
  - The stepper shows "—" at zero (DESIGN.md and UX-DR30 win over the mock's "0").
  - Composer Block cards and skeleton rows carry the Position box `.pos-box` (EXPERIENCE/DESIGN win over the mock that lacks it).
  - Duplicate name is `⟨nome⟩ — cópia` (story AC wins over the mock toast's "(cópia)").
  - "Novo template" creates an empty composition (story AC wins over the prototype, which jumps to a seeded copy).
  - Palette layout:
    - ≥1024 px: side by side, as in the mock.
    - 768–1023 px: a right drawer.
    - <768 px: a bottom sheet (DESIGN.md Block palette).
    - The drawer and the sheet are opened by a `Blocos` button in the composer head and are a React Aria `Modal` (dialog).
- Reorder paths are the same for skeleton nodes (cabines among cabines, colunas within their cabine) and section blocks:
  - press-and-hold 300 ms plus drag (mouse drag too);
  - Overflow "Subir · Descer";
  - Alt+↑/↓ on the focused row;
  - the Position box (type a number, then blur or Enter).
  - Every move is announced politely: `Coluna 5 movida para a posição 3 de 17`. Nodes and sections are feminine, hence `movida`.
- Removal of a cabine, coluna or section block and removal of a template all go through `ConfirmDialog`, then a persistent toast with `Desfazer` built on `undoBatch`. Follow the `word-registry-panel.tsx` pattern.
- Strings follow the AGENTS.md "Where a new user-facing string goes" homes:
  - derived text goes in `packages/domain`;
  - surface copy goes in `pt-br.ts`, verbatim from the mocks or marked `// authored:`;
  - shared component chrome goes in `ui.ts`.
- Mock class names apply. `.frame-*` rules that get rendered are translated in `app.css` per AGENTS.md.
- No emoji. Identifiers are English.

**Never:**
- Do not touch `packages/domain/fixtures/**`. A parallel batch owns it, so schema additions must stay fixture-compatible (`archived_at` uses `.default(null)`).
- Stay out of later stories:
  - no sub-block default toggles or subtype picking (Story 3.5);
  - no section text editing or "Editar texto" menu item (Story 3.6);
  - no "Mover para…", "Marcar não ensaiado" or TAG suggestions (`.qty-tag`);
  - no relatório creation picker UI (Epic 4).
- Leave no placeholder or stub for 3.5/3.6 in the UI. Keep the seams as described in Design Notes.
- No contract version bump and no DB migration: template rows are one `entities.row` jsonb, and the new field is additive and defaulted.
- Server logic stays generic: no template-specific code in `apps/api` beyond tests.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Concurrent skeleton/blocks | Device 1 removes coluna X. Device 2 sets 1 disjuntor on X. Both sync in either order. | `applyOp` never throws. Both devices and the server hold identical rows. The disjuntor on X is an orphan: excluded from totals and the view, and dropped by the next `blocks` write. The company pull cursor reaches the head. | none |
| Stepper at zero | Quantity 1 to 0 via "−" | That type's entries at the node are removed. The count shows "—". | none |
| Stepper typed | Types `25` and blurs; or types `abc` or `-3` | Sets 25. Invalid input restores the previous value, with no op. The maximum is 99, clamped. | inline, no toast |
| Several entries same type at a node | Standard template Enel: para_raio entrada 1 + saida 1 | Stepper shows 2. "+" increments the last entry of that type at the node. "−" decrements the last entry and removes it at 0. | none |
| Remove coluna with blocks | Coluna 5 holds 4 blocks | Confirm, then one batch puts `skeleton` and `blocks` (node and its blocks gone). `Desfazer` restores both. | none |
| Remove cabine | Cabine with colunas | Removes its colunas and every block on any of them, in one batch. | none |
| Template referenced | The company summary (`sync_state` company row `relatorios[]`) has a relatório whose `template_id` is this template. | The Overflow offers no "Remover". Only "Arquivar" and "Duplicar" are offered. | none |
| Archive / restore | Arquivar, then Restaurar | `archived_at` set to now, then null. The template moves to "Arquivados (n)" and back. `pickableTemplates` excludes archived and removed templates. | none |
| Duplicate | "Cabine primária — padrão" | A new id with name `Cabine primária — padrão — cópia`. `blocks`, `skeleton` and `seed_version` are deep-equal. `version: 1`, `archived_at: null`. | none |
| Novo template | click | Creates `{name: 'Novo template', blocks: [], skeleton: [], seed_version: SEED_VERSION, version: 1}` and navigates to `/templates/{id}`. | button disabled while committing |
| Unknown id | `/templates/<missing or removed id>` | The empty sentence `Template não encontrado.` (`// authored:`) and a link back to `/templates`. | none |

</intent-contract>

## Code Map

- `packages/domain/src/schemas/entities.ts:162` -- `templateRowSchema`:
  - Add `archived_at: nullableIso.default(null)`. `TEMPLATE_FIELDS` (`ops/path.ts:52`) picks it up automatically.
  - Fixture-safe: `replay-small` creates a template without the key, and `snapshot.golden.json` holds no template row.
- `packages/domain/src/seed/template-rules.ts:47` -- `checkTemplateRow`:
  - Delete only the `!nodes.has(block.skeleton_location_ref)` half of the equipment check. Keep "equipment block has a non-null ref", which is intra-field.
  - Keep the duplicate refs rule, the coluna-under-cabine rule and every per-block definition rule. Each is intra-field, so one LWW value is always self-consistent.
  - Update the file comment and the tests that asserted a dangling ref is rejected.
- `packages/domain/src/seed/template.ts` -- `defaultBlockConfig(seedVersion, blockType, options)` (l.46) builds the config for a new block. `LOCKED_SUB_BLOCKS` (l.34). `templateTotals(template)` (l.237) must become orphan-aware: take `Pick<TemplateRow,'blocks'|'skeleton'>` and update its callers and tests.
- `packages/domain/src/templates/list.ts` -- `templatesHeading` and `sortTemplates` exist. Extend this file per the tasks.
- `packages/domain/src/checks/references.ts` -- the `isInstrumentReferenced` shape. Model the template usage count on it, over `RelatorioSummary[]` (`contract/sync.ts:49`, which has `template_id`).
- `packages/domain/src/text/plural.ts` -- `plural` helper for counts.
- `apps/web/src/sync/engine.ts:332` -- the company `sync_state` row keeps `relatorios` (the summaries). Read it through `apps/web/src/db/sync-store.ts`, adding a reader if none exists.
- `apps/web/src/db/home-store.ts:77` -- `templateRows(db)` via `rows<T>` (skips removed, `safeParse`). Consumed with `useLiveQuery` (`db/live.ts`) in `templates-surface.tsx:36`.
- `apps/web/src/db/commit.ts:138` -- `commitBatch(db, drafts, {newId, now})` returns `{batch_id, ops}`. `undoBatch(db, batch_id, deps)` is at l.210.
- `apps/web/src/surfaces/registries/word-registry-panel.tsx:~78-188` -- the pattern for ConfirmDialog, remove, and a toast with an undo action (`state/toast.tsx` `showToast`).
- `apps/web/src/components/` -- `OverflowMenu`, `ConfirmDialog`, `FormDialog` (rename), `Toggle`, `Button`/`TextButton`, `SyncAnnouncer` (live-region pattern), all exported from `index.ts`.
- `apps/web/src/input/use-press-and-hold.ts` -- `usePressAndHold({onHold, thresholdMs=300})` fires once and has pointer handlers. It is the base for touch drag start and for stepper repeat.
- `apps/web/src/surfaces/templates/templates-surface.tsx`, `templates.css`, `templates-surface.test.tsx`; `apps/web/src/app.tsx` (routes with `handle.title`); `apps/web/src/copy/pt-br.ts` `templates:` block; `apps/web/src/styles/app.css`.
- `apps/api/src/sync/sync.integration.test.ts` -- two devices of one company: `idsA` and `idsA2` (built inline ~l.457/612), `op(ids, input)` l.137, `pushOk`. The normalized-name merge test at ~l.664 is the convergence template.
- `e2e/templates.spec.ts` -- the 3.2 tests. Use `e2e/support/merged-fixtures.ts` (`test`, `expect`, `TEST_SEED`, `signIn`); "Sincronizar agora" drives sync.
- `_bmad-output/implementation-artifacts/deferred-work.md:406` -- the entry "Story 3.4 must handle concurrent template edits", to be closed.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/schemas/entities.ts`, `seed/template-rules.ts`, `seed/template.ts` (+ tests) -- make the changes described in the Code Map.
- `packages/domain/src/templates/compose.ts` (+ `compose.test.ts`) -- pure functions returning new `blocks`/`skeleton` arrays:
  - Skeleton: `addCabine(skeleton, ref, name)`, `addColuna(skeleton, cabineRef, ref, name)`, `renameNode`, `setAgruparPorTipo(skeleton, cabineRef, value)`, `moveNode(skeleton, ref, toIndex)` (among siblings), `removeNode(template, ref)`, which returns both arrays without the node, its colunas and their blocks.
  - Quantities: `quantityAt(template, ref, type)` and `setQuantity(template, ref, type, n)`, with the multi-entry rule from the I/O matrix and new entries from `defaultBlockConfig`.
  - Sections: `addSection(blocks, type)` (appends), `moveSection(blocks, index, toIndex)` (among section blocks only), `duplicateSection`, `removeSection`, `addSectionBelow`.
  - `composerView(template)` returns cabines, then their colunas in order, each with the quantities per type for that node, plus sections in order with their FO.SERV-03 number. Orphans are excluded.
  - Every function never mutates its input and never produces a row that fails `templateRowSchema`.
- `packages/domain/src/templates/list.ts` (+ tests):
  - `activeTemplates(rows)` and `archivedTemplates(rows)`, both name-sorted.
  - `pickableTemplates(rows)` (live and not archived), for Epic 4.
  - `templateUseCount(id, summaries)`.
  - `duplicateTemplate(row, id)`.
  - `emptyTemplate(id, seedVersion)`.
  - `archivedHeading(n)`, which returns `Arquivados (n)`.
- `packages/domain/src/templates/text.ts` (+ tests) -- derived pt-BR text:
  - `templateSummaryText(row, useCount)` returns `Semente v1 · 9 seções · 6 cabines · 26 colunas · 94 blocos de equipamento · usado em 3 relatórios`. Zero parts are omitted except seções. Use `plural`. `usado em 1 relatório`; the use part is omitted at 0.
  - `totalsText(totals)` returns `25 seccionadoras · 21 disjuntores · 11 TP · 11 TC · 8 trafos · 4 cabos de entrada · 9 cabos de saída · 5 para-raios` in that type order, with zeros omitted and singular forms.
  - `skeletonHeading(view)` returns `Esqueleto de locais · 6 cabines · 26 colunas · 94 blocos`.
  - `nodeSummaryText` returns the mock's `.col-sum` and `.cabine-flag` text.
  - `quantityLabel(type, n)` returns `Seccionadoras, 25`.
  - `moveAnnouncement(name, position, total)` returns `Coluna 5 movida para a posição 3 de 17`.
  - `defaultCabineName(n)` returns `Cabine 1`, and `defaultColunaName(n)` returns `Coluna 1`.
  - Export everything via `packages/domain/src/index.ts`.
- `apps/web/src/components/quantity-stepper.tsx` (+ test, export) -- a shared UX-DR30 component (mock `.quantity-stepper[role=group]`):
  - −/+ `button.step` at 48 px, with a typeable `span.count` → input showing "—" at 0 and `.is-zero`.
  - Group `aria-label` is `quantityLabel`.
  - Holding −/+ repeats: after 300 ms, one step every 100 ms. The local value updates while held, and one commit happens on release.
  - Typed input commits on blur or Enter.
  - Announces the new label politely after each commit.
  - Clamped 0..99.
- `apps/web/src/surfaces/templates/templates-surface.tsx` (+ test) -- complete per `41-templates.html`:
  - `.section-head` holds `Templates (n)` plus the `Novo template` primary button.
  - `tpl-row` rows have `button.rr-text` (opens `/templates/{id}`), `.rr-primary` name, `.rr-secondary` = `templateSummaryText`, `.rr-actions` with `Duplicar` and `Arquivar`, and an Overflow (`Remover` only when unreferenced; the menu is omitted when it would be empty).
  - The section `Arquivados (n)` with the mock note has `.is-archived` rows whose actions are `Restaurar` plus the same Overflow rule.
  - Keep the 3.2 empty state and gate.
- `apps/web/src/surfaces/templates/template-composer.tsx` (+ split components: `skeleton-list.tsx`, `block-palette.tsx`, `section-list.tsx`, `use-reorder.ts`; tests) -- composer at `/templates/:id` per `42-template-composer.html`:
  - The `.field.name-field` commits the name on blur (existing `use-field-commit`). The composer head shows the `totalsText` meta, and below 1024 px a `Blocos` button.
  - Skeleton section (`skeleton-list`):
    - `cabine-card` shows its name and `nodeSummaryText`, a Toggle `Agrupar por tipo`, and an Overflow `Renomear · Subir · Descer · Remover`.
    - Inside it, the `column-list` of `column-row` entries (`col-head` / `col-name` / `col-sum`) has an Overflow `Renomear · Subir · Descer · Remover`.
    - The open node's `.col-body .qty-grid` lists its types with quantity > 0 as `.qty-row` with a stepper.
    - `.skeleton-actions` holds `Adicionar coluna` (to the current cabine) and `Adicionar cabine`.
    - Clicking a cabine body or a col-head makes that node current.
  - Palette (`aside.block-palette.composer-palette`):
    - Headed `Blocos`.
    - `palette-group` `Seções` lists the 9 section types by number and title; a tap appends one.
    - `Equipamentos · quantidade em ⟨node name⟩` (`// authored:` adaptation of the mock label) lists 8 rows, each with a stepper for the current node. With no current node the steppers are disabled and the note reads `Selecione uma cabine ou coluna.` (`// authored:`).
  - Section list: `block-card` rows with drag handle (`aria-label` `Reordenar ⟨nome⟩`), `.pos-box`, `.block-tag` section number, `.block-name` title, and an Overflow `Adicionar abaixo · Subir · Descer · Duplicar · Remover` (Remover last, in its red group).
  - Every action is one `commitBatch` of template ops.
  - Moves announce through one polite live region owned by the composer.
- `apps/web/src/app.tsx`, `pt-br.ts`, `app.css`, `templates.css` -- the route `/templates/:id` (title `Template`), copy, and CSS translations (`.composer-layout` side by side ≥1024 px; drawer and sheet styles).
- `apps/api/src/sync/sync.integration.test.ts` (or a sibling `template-convergence.integration.test.ts`) -- `3.4-API-001`. It must prove all of the following:
  - Device A pushes a skeleton without coluna X.
  - Device A2, based on the old row, pushes blocks with a block on X.
  - Both pushes are accepted (none rejected).
  - Both devices pull, and every pulled template row parses.
  - The server row equals the row folded on each device.
- `packages/domain/src/templates/convergence.test.ts` -- `applyOp` folds the two conflicting puts in both orders without throwing and ends at the same row.
- `e2e/templates.spec.ts` -- the Playwright tests below. Each test resets or creates its own template so the file is re-runnable.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- set the line-406 entry to `state: closed (branch story/3-3-3-4-templates-list-and-composer: cross-field ref rule moved out of parsing, orphan blocks ignored by the view; 3.4-API-001, 3.4-E2E-005)`.

**Acceptance Criteria (each automated; e2e IDs in parentheses):**
- Given Empresa A with the standard template, when `/templates` renders from the Home shortcut, then the list shows `Templates (1)`, its secondary line `Semente v1 · 9 seções · 6 cabines · 17 colunas · 94 blocos de equipamento` (the standard template has 17 colunas; the 133 and 135 examples are format samples from the mock), `Novo template`, `Duplicar` and `Arquivar` (`@p0 3.3-E2E-001`).
- Given a template, when the user duplicates it, then a `⟨nome⟩ — cópia` row appears. When opened in the composer, its skeleton heading and totals equal the source's, and the op in the outbox is a single `template/{id}` create (`@p0 3.3-E2E-002`).
- Given an unreferenced template, when archived, then it moves under `Arquivados (1)`. `Restaurar` brings it back. Overflow `Remover` opens a Confirm dialog whose focus starts on `Cancelar`; confirming hides the template, and `Desfazer` restores it. This holds after reload (`@p0 3.3-E2E-003`). Given a template referenced in the company summary, the Overflow has no `Remover` (web component test). `pickableTemplates` excludes archived and removed templates (kernel test).
- Given `Novo template`, when the user adds a cabine and three colunas and renames Coluna 3 to `Coluna 5`, then moves it with Alt+↑ to position 1, with Overflow `Descer`, with the Position box, and with a mouse drag, then each move reorders the list and the live region reads the `moveAnnouncement` text. The reload keeps the order (`@p0 3.4-E2E-001`).
- Given the current node Coluna 1, when the user sets quantities with the palette stepper ("+" clicks, a typed `3`, press-and-hold "+" for ≥1 s, "−" to 0 showing "—"), then the column body lists each quantity, the head shows `totalsText`, and the stepper label reads `Seccionadoras, N` (`@p0 3.4-E2E-002`). Given 17 colunas with 1 seccionadora, 1 disjuntor, 1 TP and 1 TC each, `templateTotals` is 17 of each (kernel test). Blocks placed directly on a cabine with no coluna count and display (e2e step and kernel test).
- Given section blocks added from `Seções`, when the user moves one with `Subir`/`Descer`, duplicates it and removes it via Confirm plus `Desfazer`, then the cards show the FO.SERV-03 section numbers in the new order (`@p0 3.4-E2E-003`).
- Given a cabine, when *Agrupar por tipo* is toggled, then the skeleton cabine stores the value, and it survives reload and sync (`3.4-E2E-003`). The seam for `instantiateTemplate` is the stored flag.
- Given every edit above, when the IndexedDB outbox is inspected, then every op path starts with `template/` (`@p0 3.4-E2E-004`, final step of 001–003 or a dedicated test).
- Given two browser contexts on Empresa A, when context 1 is offline and removes a coluna while context 2 sets quantities on it and syncs, and then context 1 goes online and syncs, then neither shows a sync failure, both composers show the same skeleton and totals, and the orphan quantities are absent (`@p0 3.4-E2E-005`). The API-level and kernel convergence tests pass.
- Layout: the side-by-side palette appears at 1280 and 1024 px, the right drawer at 768 px, and the bottom sheet at 390 px, with no horizontal overflow at 390/768/1280 px (`3.4-E2E-006`, `@p1`).

## Design Notes

**Concurrency choice.** `blocks` and `skeleton` stay separate fields; changing their shape would touch fixtures owned by the parallel batch. The only rule a pair of independent LWW values can break is the cross-field reference. Every other rule is judged within one field's value, which a single device always writes whole. So parsing never rejects an orphan. `composerView`, `templateTotals` and (later) `instantiateTemplate` ignore orphans. Every composer `blocks` write starts from the view, so the orphan is dropped on the next edit. Edits to the same field from two devices are last-writer-wins, which is accepted for the office-only template surface.

**Seams for batch D (3.5, 3.6) — no stubs.**
- 3.5 opens the per-type equipment defaults. Make the palette equipment row a component (`PaletteEquipmentRow`) and keep the section list's card a `SectionCard` whose Overflow actions are built from an array, so "Editar texto" (3.6) is one entry.
- `compose.ts` functions take and return whole `blocks`, so 3.5 adds `setTypeDefaults(blocks, type, config)` beside them.

**Refs.** New cabine and coluna refs are fresh UUID v7 strings from the web's `newId`. The kernel receives them as arguments and never generates ids.

**Stepper multi-entry rule example:** Enel para_raio `[{role:'entrada',q:1},{role:'saida',q:1}]` shows 2. "+" gives `[entrada 1, saida 2]`. "−" twice gives `[entrada 1]`, then `[]`.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm verify` -- expected: lint, static, unit, api, e2e `@p0` green.
- `docker compose --profile tools run --rm tools pnpm exec playwright test e2e/templates.spec.ts --project=desktop-chrome` -- expected: all templates tests green, `@p1` included.

**Manual checks:**
- A real-browser pass on `/templates` and `/templates/:id` (Playwright MCP or a script in the `tools` container):
  - 390/768/1280 px, light and dark;
  - keyboard only: Tab through the list, the composer, Alt+↑/↓, the stepper keys and the Position box;
  - a Confirm dialog, and the drawer at 768 px and the sheet at 390 px;
  - an offline edit, then a reload.
- Screenshots go in `_bmad-output/implementation-artifacts/reviews/3-3-3-4-templates-list-and-composer/`, and the pass is recorded in this section.

**Real-browser pass, 2026-09-23** (Playwright chromium script in the `tools` container, Empresa B reset with the standard template):
- `a-list-*`, `b-composer-*` (1280, 1024, 768, 390), `c-drawer-768-*`, `c-sheet-390-*`, `d-confirm-768-*`, light and dark: no horizontal overflow at any width (every screenshot measured 0 px). The palette sits beside the composition at 1280 and 1024 px, opens as a right drawer at 768 px and as a bottom sheet at 390 px.
- The Confirm dialog opens with the focus on "Cancelar" in both themes.
- Keyboard only (`e-keyboard-*`): Tab on the list reaches Novo template, the row's "Abrir template", its Overflow, Duplicar and Arquivar in order. In the composer, Alt+Up on the focused coluna row moves it, announces "Coluna 5 movida para a posição 4 de 17" and keeps the focus on the row. Enter on the stepper's "Mais um" and ArrowUp in its count step and commit ("Seccionadoras, 3"). The Position box moves on Enter.
- An offline edit (`f-offline-edit-*`): "Disjuntores, 1" to "Disjuntores, 2" with the context offline; after going back online and reloading (before any sync), the count still reads "Disjuntores, 2" (`f-after-reload-*`).
- Two layout fixes came out of the pass: a cabine card with no coluna and no own blocks open no longer draws an empty `.block-expand`, and below 768 px a coluna row's `.col-sum` wraps under its name.

## Spec Change Log

- 2026-09-23, planning correction (no loopback): the 3.3-E2E-001 AC quoted the mock's `26 colunas`; the Story 3.2 standard template has 17 colunas (only 1° Subsolo holds colunas). The AC now reads `17 colunas`; code and tests already computed 17. KEEP: the kernel-computed text.

## Review Triage Log
