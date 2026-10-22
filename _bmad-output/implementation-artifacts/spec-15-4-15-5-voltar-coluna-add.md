---
title: 'Stories 15.4 and 15.5: "Voltar" lands on the Sumário at every width; "Adicionar equipamento" on a coluna below 1024 px'
type: 'feature'
created: '2026-10-22'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'medium'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-15-context.md'
warnings: ['batched']
# batched: coordinator's cut: two small no-seed stories of Epic 15 wave A
deferred: []
---

<intent-contract>

## Intent

**Problem:** (15.4) On a phone, the App bar "Voltar" of a sheet and of a local's Verificações goes to the separate tree page `/relatorio/:id/arvore` (journey review D-8), not to the Sumário row as from 768 px; Bruno lands on "Árvore do relatório". (15.5) In the template composer below 1024 px a coluna offers no way to add equipment: its body shows only types already above zero, and the only entry is "Blocos" at the top of the page; the palette sheet also renames its "Blocos" head to the target, is cut at the viewport with no scroll cue, and wraps type names mid-name (UX pass F10).

**Approach:** (15.4) One back target with navigation state at every width for the ficha and Verificações routes: the Sumário, section 9 open, the sheet's row (or the local's "Verificações do local" button) scrolled into view and focused, reusing `RelatorioTree`'s existing `focusBlockId` / `focusLocationId`. (15.5) The open coluna's body ends with a text button "Adicionar equipamento" (plus a one-line note when empty) that runs the local button's target logic for the coluna; the drawer/sheet keeps "Blocos" as its head with the target under it, scrolls its list inside with a visible cue, and never wraps a type name.

## Boundaries & Constraints

**Always:**
- No op, no seed, no contract change. The route `/relatorio/:id/arvore` and `TreeSurface` stay (rail, deep links); its phone presentation is left reachable by address, with one `deferred-work.md` line if removal is wanted later.
- The `?volta=exportar` back (`useBackToExport`, a back-target override) still wins over the route back; the Verificações sticky bar ("Ver árvore", "Concluir verificações") and any "Voltar ao relatório" keep their current destinations.
- The coluna button sets the same target state the local button sets (`currentRef`) through one shared handler in `template-composer.tsx`; below 1024 px every press opens the drawer (tablet) or sheet (phone) on that coluna; from 1024 px (inline palette laid out) the handler keeps the local button's toggle: a press on the current target releases it. When that release closes the coluna row, the focus moves to the coluna's `.col-head` (never to `<body>`), with `restoreFocus` as `QtyGrid` does.
- New pt-BR: the empty-coluna note is authored in `apps/web/src/copy/pt-br.ts` under `copy.composer`, marked `// authored:` ("Nenhum equipamento nesta coluna."); the button reuses `copy.composer.addEquipamento` (mock verbatim).
- Mock class names; any `.frame-*` rule the mock adds is translated per AGENTS.md (mock-only scope rules into `templates.css` / `app.css` with a comment naming the mock rule). No new colour token.
- The inline palette (from 1024 px) keeps its head behaviour (headed by the current node, DESIGN.md › Block palette); only the drawer/sheet variant changes its head.
- New `@p0` specs assert committed state (outbox or IndexedDB rows), not only the screen (E12-A6).

**Never:** a JS breakpoint render switch for the palette (CSS decides; the press-time `offsetParent` check of `onAddEquipamento` is the precedent); a sibling next/previous shortcut inside a sheet; edits to `epics.md`, `sprint-status.yaml`, `source-deltas.md` (the D-8 reversal row is already there); tree restyling (Story 15.2); emoji.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Sheet back, any width | `/relatorio/R/ficha/B` at 390, 768 or 1280, App bar "Voltar" | `/relatorio/R`, section 9 expanded, row of B in view, its `.s9-eq-open` focused | B no longer in the tree: Sumário opens, section 9 open, nothing focused |
| Verificações back, any width | `/relatorio/R/local/L/verificacoes`, "Voltar" | `/relatorio/R`, section 9 expanded, L's `.s9-verif` in view and focused | L gone: Sumário, section 9 open, nothing focused |
| Export return | sheet opened with `?volta=exportar`, "Voltar" | `/relatorio/R?exportar=1` (unchanged) | n/a |
| Coluna button, palette hidden (<1024) | open coluna C, press its "Adicionar equipamento" | C stays target; drawer (tablet) / sheet (phone) opens, head "Blocos", target line "Toque para adicionar em: C · Painel" under it | n/a |
| Coluna button, palette inline (>=1024) | C current, press its button | target released (`currentRef` null), row closes, focus on C's `.col-head`, no drawer | n/a |
| Empty coluna | coluna just added (all quantities 0) | body: note "Nenhum equipamento nesta coluna." then the button | n/a |
| Sheet quantity | sheet open on C, "+" on two types | both land on C (`template/{id}/skeleton` op), C's `.col-sum` names them, its `qty-grid` lists them | node removed elsewhere: current behaviour (no write) |
| Long list on a phone | sheet at 390x844 | list scrolls inside the sheet; cue visible while content remains below, gone at the end; every type name on one line; no horizontal overflow | n/a |

</intent-contract>

## Code Map

- `apps/web/src/app.tsx:160-185` -- ficha route (`back` to `/arvore`, `backWide` to Sumário + `{openSection9, focusBlockId}`) and Verificações route (`backWide` with `{openSection9}` only). Comments cite D-8; rewrite them.
- `apps/web/src/surfaces/app-shell.tsx:27-43, 104-114` -- `RouteHandle.back`, `backWide`, `WIDE_QUERY`, `goBack()`: `backWide` applies only when `backTarget === null` and `(min-width: 768px)` matches. Only these two routes use `backWide`.
- `apps/web/src/state/back-target.tsx` -- `useBackTarget` override and `useBackToExport` (`?volta=exportar`); read-only for this batch.
- `apps/web/src/surfaces/relatorio/sumario-surface.tsx:113-121` -- `arrivalOf(state)` reads `openSection9`, `focusBlockId`, `renameEquipmentId`; add `focusLocationId`. `:221` section 9 opens from `arrival.openSection9`. `:484-486` passes `focusBlockId` (arrival when `countFocus === null`) and `focusLocationId` (count focus only) to `RelatorioTree`.
- `apps/web/src/surfaces/relatorio/relatorio-tree.tsx:96-106, 218-260` -- `focusBlockId`, `focusLocationId` (wins), `focusToken`; seeding and focusing already implemented (Story 12.2, 14.3). Reuse, do not change behaviour.
- `apps/web/src/surfaces/relatorio/tree-surface.tsx` -- the `/arvore` surface; untouched.
- `apps/web/src/surfaces/local/verificacoes-surface.tsx:246` -- `goTree` (sticky bar); unchanged.
- Unit tests: `apps/web/src/surfaces/app-shell.test.tsx` (back button tests, line ~118), `apps/web/src/surfaces/relatorio/sumario-surface.test.tsx:425` (12.2 arrival with `focusBlockId`; add the `focusLocationId` twin), `apps/web/src/surfaces/relatorio/relatorio-tree.test.tsx` (DoD: the phone path), `apps/web/src/surfaces/local/verificacoes-surface.test.tsx:450-470` (sticky bar; must stay green).
- E2E: `e2e/journey-forward.spec.ts:140-168` `@p0 12.2-E2E-002` asserts `/arvore` at 390 (line 167) -- rewrite; `e2e/verificacoes-local.spec.ts` (`openSection9` helper line 124, `locals()` reads IndexedDB) -- add the Verificações back test. Specs that `goto('/arvore')` directly (`tree.spec.ts`, `ergonomics.spec.ts`, `review-toasts-2026-10-08.spec.ts`, `review-layout-copy-3.spec.ts`) stay valid.
- `apps/web/src/surfaces/templates/skeleton-list.tsx:26-45` props (`onAddEquipamento(local: ComposerCabine)`), `:154-176` `QtyGrid` (returns null with no type > 0), `:291-301` the local's `skeleton-actions` button (`variant="secondary"`, `aria-pressed={isCurrent}`), `:372-415` `ColunaRow` (`isOpen = currentRef === coluna.ref`, `.col-body` renders `QtyGrid` only).
- `apps/web/src/surfaces/templates/template-composer.tsx:249-265` `onAddEquipamento` (inline check `firstSection.current.offsetParent !== null`; toggle when inline, else `setPaletteOpen(true)`); `:486-497` `paletteProps` (`targetText` from `paletteTargetText`); `:569-576` `PaletteDrawer`.
- `apps/web/src/surfaces/templates/block-palette.tsx:72-90` `.palette-head` text (`current.name` or "Blocos"), `:111-121` `.pal-target` line in the Equipamentos group, `:184-211` `PaletteDrawer` (`DialogShell`, `aria-labelledby` = head id, so the dialog's name is the head text), `PaletteEquipmentRow` (`.pi-text` name span).
- `apps/web/src/styles/app.css:587-610` which palette shows; drawer/sheet rules (`.dialog-scrim.palette-drawer .block-palette { overflow-y: auto }`, phone `max-height: 85dvh`). `apps/web/src/styles/components.css:345-354` `.block-palette` base (read only, byte-identical). `apps/web/src/surfaces/templates/templates.css:110-161` composer palette rules.
- Mock: `_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/mockups/prototype/screens/42-template-composer.html` -- style block lines 17-150 (`.column-row`, `.col-body`, `.skeleton-actions` line 52, phone rules 142-149), open Coluna 5 `#tc-col-5` body lines 270-292, empty painel `#tc-pnl-novo` line 321, `.loc-none` line 221. `MOCK-GUIDE.md` (163 lines; Portuguese change notes near 147-158). Grep, never read whole.
- Composer tests: `apps/web/src/surfaces/templates/template-composer-palette.test.tsx:173-301` (head test; jsdom has no layout so the inline palette counts as hidden; `:281-301` spies `offsetParent` to stand in for >=1024).
- Composer e2e: `e2e/templates.spec.ts:85` (390 px viewport pattern), `:241-290` (building painel and colunas), `:582-620` (drawer at 768, sheet at 390, `dialog { name: 'Blocos' }`); `e2e/local-painel-coluna.spec.ts:540-550` opens the drawer as `dialog { name: 'Cabine primária' }` -- it becomes `'Blocos'` and must be updated; `.pal-target` text assertions in `cta.spec.ts`, `qgbt.spec.ts`, `local-painel-coluna.spec.ts`, `templates.spec.ts` must keep passing (the inline palette is unchanged; in the drawer the `.pal-target` text is unchanged).
- Planning docs: `_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/EXPERIENCE.md:259` (`**App bar**` row), `:293` (`**Relatório tree**` row, ends "Back from a sheet lands on its row."); `_bmad-output/implementation-artifacts/deferred-work.md` (append a `## Deferred from: Stories 15.4 and 15.5 (2026-10-22)` section); `docs/kbs/log.md` (dated line).

## Tasks & Acceptance

**Execution:**
- `apps/web/src/surfaces/app-shell.tsx` -- replace `backWide` by a width-independent `backWith?: (params) => { to: string; state: unknown }` (navigate with state whenever `backTarget === null`); drop `WIDE_QUERY` and the press-time `matchMedia`; update the doc comments (Story 15.4 revokes D-8's phone exception) -- one back target at every width.
- `apps/web/src/app.tsx` -- ficha route: `back` = `/relatorio/:id`, `backWith` = `{ to: /relatorio/:id, state: { openSection9: true, focusBlockId: blockId } }`; Verificações route: same with `state: { openSection9: true, focusLocationId: locationId }`; rewrite the D-8 comments; keep the `/arvore` route and its comment (rail, deep links).
- `apps/web/src/surfaces/relatorio/sumario-surface.tsx` -- `arrivalOf` reads `focusLocationId`; pass `focusLocationId={countFocus === null ? arrival.focusLocationId : (site count focus as today)}`; `focusBlockId` unchanged.
- `apps/web/src/surfaces/app-shell.test.tsx` -- with `matchMedia` narrow (390) and wide (1280): the ficha route's "Voltar" navigates to `/relatorio/R` with `{openSection9, focusBlockId}`; with a `useBackTarget` override (export return) the override wins.
- `apps/web/src/surfaces/relatorio/sumario-surface.test.tsx` -- arrival `{openSection9: true, focusLocationId: L}` opens section 9 and focuses L's `.s9-verif`.
- `apps/web/src/surfaces/relatorio/relatorio-tree.test.tsx` -- the phone path (DoD): the Sumário presentation with `focusBlockId` at a phone width reveals the collapsed path, scrolls and focuses the row's open button; and `focusLocationId` focuses `.s9-verif` (skip a case already covered elsewhere; say so in a comment).
- `e2e/journey-forward.spec.ts` -- rewrite `@p0 12.2-E2E-002`'s title and its 390 block: "Voltar" at 390 lands on `/relatorio/R` with section 9 expanded and the row's open button focused and in viewport (keep the 768 and 1280 parts).
- `e2e/verificacoes-local.spec.ts` -- new `@p0 15.4-E2E-001`: at 390 and at 1280, open a local's Verificações from the Sumário's "Verificações do local", press App bar "Voltar", assert `/relatorio/R`, section 9 expanded, that local's `.s9-verif` focused and in viewport; plus the committed state the spec already reads (the local row in IndexedDB unchanged, no op written by the navigation).
- `_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/EXPERIENCE.md` -- dated notes (append, no rewrite) at the end of the App bar row and after "Back from a sheet lands on its row." in the Relatório tree row: "*(2026-10-22, Story 15.4: at every width "Voltar" from a sheet or a local's Verificações returns to the Sumário, section 9 open, the row or the local's "Verificações do local" focused; the phone exception of journey review D-8 is revoked; `/relatorio/:id/arvore` stays for the rail and deep links.)*".
- `apps/web/src/surfaces/templates/template-composer.tsx` -- generalize `onAddEquipamento` to a node (local or coluna: `ComposerCabine | ComposerColuna`), same inline check, toggle and drawer logic; when an inline press releases a coluna, move the focus to that coluna's `.col-head` (find it by the row's `data-*`/ref, or have `ColunaRow` pass a focus callback); pass it to `SkeletonList`.
- `apps/web/src/surfaces/templates/skeleton-list.tsx` -- `onAddEquipamento` prop takes the node; `ColunaRow`'s `.col-body`: `QtyGrid` (as today), then, when the coluna holds nothing (`blockCount === 0` or all quantities 0), `<p className="section-note col-none">` with the authored note, then `<div className="skeleton-actions">` holding an `AriaButton` with `className="btn btn-text"` (the `PainelCard` precedent; `TextButton` takes no `aria-pressed`), `Plus`, `aria-pressed={isOpen}`, labelled `copy.composer.addEquipamento`, calling `onAddEquipamento(coluna)`.
- `apps/web/src/copy/pt-br.ts` -- `copy.composer.colunaNone` authored note.
- `apps/web/src/surfaces/templates/block-palette.tsx` -- drawer variant (`onClose` defined): `.palette-head` text stays "Blocos" (`copy.composer.paletteTitle`), so the dialog's accessible name is "Blocos"; the `.pal-target` line moves directly under the head (rendered once, not duplicated; the steppers keep `disabledReasonId` on it); the scrolling list (`.palette-items`) carries `data-more-below="true"` while `scrollTop + clientHeight < scrollHeight - 1` (updated on scroll, resize and content change) for the cue. Inline variant unchanged.
- `apps/web/src/styles/app.css` (drawer/sheet section, lines 597-610) -- the drawer/sheet `.block-palette` becomes a flex column (grip, head and target fixed; `.palette-items` `flex: 1; min-height: 0; overflow-y: auto`); an authored bottom cue (fade or shadow from existing tokens) shown on `[data-more-below="true"]`; equipment names `white-space: nowrap` with the row wrapping the stepper under the name when both do not fit (no ellipsis, no clipping); comment each rule as `authored:` F10 or with the mock rule it mirrors.
- `apps/web/src/surfaces/templates/templates.css` -- translate any mock rule added for `.col-body .skeleton-actions` / `.col-none` (mirroring the mock's `.loc-none` / `.skeleton-actions` declarations).
- `apps/web/src/surfaces/templates/template-composer-palette.test.tsx` -- coluna button: (a) inline hidden: press opens the drawer on the coluna, dialog named "Blocos", `.pal-target` "Toque para adicionar em: Coluna N · ..." under the head, "+" lands on that coluna (op path and the coluna's `qty-grid`); (b) inline shown (`offsetParent` spy): press releases the coluna, no drawer, focus on its `.col-head`; (c) an empty coluna shows the note and the button. Update "heads the palette with the current node" only if needed (inline unchanged).
- `e2e/templates.spec.ts` -- new `@p0 15.5-E2E-001` at 390x844: build local › painel › coluna, tap the coluna's "Adicionar equipamento", the sheet "Blocos" opens with the coluna target under its head, add two types, close, assert the coluna's `.col-sum` and `qty-grid`, and the committed skeleton (IndexedDB template row or outbox op) holds both counts on that coluna; assert in the sheet: the cue is shown, then gone after scrolling the list to its end, every `.pi-text` name is one line (height <= one line-height + 2 px), no horizontal overflow. `@p1 15.5-E2E-002` at 768: the coluna's button opens the right drawer on the coluna; at 1280 the coluna button releases the target and no dialog opens.
- `e2e/local-painel-coluna.spec.ts:543` -- the drawer's name becomes "Blocos" (its `.pal-target` assertion stays).
- `42-template-composer.html` -- draw at the end of `#tc-col-5`'s `.col-body` a `.skeleton-actions` with the text button "Adicionar equipamento" (prototype `data-toggle-class`/`data-toast` attributes as siblings do), and an empty coluna row (e.g. a "Coluna 1" in `#tc-pnl-novo` or a new row toggled open by the prototype) whose `.col-body` holds `<p class="section-note col-none">Nenhum equipamento nesta coluna.</p>` and the button; it renders in every frame including phone and tablet. `MOCK-GUIDE.md` -- one dated line under its change notes (Portuguese, as the neighbours) naming the coluna control and the empty note (Story 15.5, F10).
- `_bmad-output/implementation-artifacts/deferred-work.md` -- new section with: the `/arvore` phone presentation left reachable by address (remove later if wanted; owner: a later story); any narrowing found.
- `docs/kbs/log.md` -- one dated line for both stories; update the KB concept that summarizes EXPERIENCE.md's App bar or back behaviour if one names the phone exception (grep `docs/kbs` for `arvore`, `D-8`, `back`).

**Acceptance Criteria:**
- Given a sheet or a local's Verificações opened from anywhere, when the App bar "Voltar" is pressed at 390, 768 or 1280 px, then the Sumário opens with section 9 expanded and the sheet's row (or the local's "Verificações do local") scrolled into view and focused; `?volta=exportar` still returns to the Export dialog and the Verificações sticky bar keeps its destinations.
- Given the app after this change, when any phone surface is used, then nothing links to `/relatorio/:id/arvore`; the route still renders by address and in the rail.
- Given an open coluna in the composer, when it renders, then its body ends with "Adicionar equipamento" and, when empty, the note before it; below 1024 px the press opens the drawer (768) or sheet (390) on the coluna and a stepper change lands on that coluna; from 1024 px a press releases the target with the focus on the coluna's head.
- Given the palette as a drawer or sheet with a target, when it shows, then the head reads "Blocos", the target reads under it, the list scrolls inside with a visible cue while content remains below, and no type name wraps.
- Given `42-template-composer.html`, when opened, then the coluna's button and the empty-coluna note are drawn, and `MOCK-GUIDE.md` notes them.

## Spec Change Log

## Review Triage Log

## Design Notes

- Why `backWith` and not a phone check: the target is now the same at every width, so the press-time width check has nothing left to decide; a single route field keeps `back` (a plain path) for routes that need no state.
- The coluna button at >=1024 px follows the AC literally (the local button's toggle). Because a coluna's body shows only while it is the target, that press always releases it. Open question for the PR body: whether from 1024 px the button should instead keep the target (idempotent) or be hidden; the literal reading is built.
- The dialog's accessible name follows its head (`aria-labelledby`), so "Blocos" becomes the drawer's name in every state; tests that named the drawer after the target change with it.

## Verification

**Commands (all in the worktree, tools container, `podman compose --profile tools run --rm --user root tools pnpm ...`):**
- `pnpm lint`, `pnpm static` -- expected: exit 0.
- `pnpm test:unit -- apps/web/src/surfaces/app-shell.test.tsx apps/web/src/surfaces/relatorio apps/web/src/surfaces/templates apps/web/src/surfaces/local` while iterating; the whole `pnpm test:unit` and `pnpm test:api` once at the end -- expected: green.
- Under the host lock (`nohup lockf -t 20000 /tmp/fasor-verify.lock sh -c '...' > /tmp/e2e-e15a.log 2>&1 &`, polled): `pnpm exec tsx scripts/e2e.ts e2e/journey-forward.spec.ts e2e/verificacoes-local.spec.ts e2e/templates.spec.ts e2e/local-painel-coluna.spec.ts --project desktop-chrome --project durability-desktop-chrome` -- expected: green.
