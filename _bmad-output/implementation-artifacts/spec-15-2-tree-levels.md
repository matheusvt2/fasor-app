---
title: 'Story 15.2: the tree levels built (bands, kicker, cards with state and NC badge, the site checklist as a card)'
type: 'feature'
created: '2026-10-22'
status: 'done'
baseline_revision: '02ae2b3dc4fc0ce59aeea78866ded82c66c4a124'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-15-context.md'
warnings: ['batched', 'oversized']
# batched: batch e15d of Epic 15 wave B carries this one story (the coordinator's cut); oversized: three presentations and four findings
deferred: []
---

<intent-contract>

## Intent

**Problem:** Section 9 of the Sumário, the rail (sheet rail and the phone "Árvore do relatório" page) and the composer skeleton draw every level as a similar row told apart only by indentation and a meta word; Bruno cannot read Local › Painel › Coluna › Equipamento on a phone. The 2026-10-22 hands-on pass adds F50 (phone counters one per line, list below the fold), F19 (type label missing at 1180 px), F37 ("N NC abertos" with no row showing an NC) and F34 (row 8 counts the automatic point twice).

**Approach:** Rebuild the three presentations from the approved Story 15.1 mocks (PR #158), class for class: a title band per local with the "Local" kicker, a sub-band per painel, coluna group headers with "N de M", every sheet a card (TAG + type label, glyph + state word, NC badge, Overflow at the corner), the Verificações do local as the first card of its local, "Adicionar …" last. Every new text is a kernel field; `apps/web` renders it.

## Boundaries & Constraints

**Always:**
- Reference, read by grep and line range only: `mockups/prototype/screens/40-relatorio-overview.html` (style block "Story 15.1" ~lines 152-240, section 9 markup ~lines 315-435), `shell-foot.html` (`rail-tree`, ~lines 41-130), `screens/60-ficha.html` (grep `#rail .`), `screens/42-template-composer.html` (grep `Story 15.1`, `level-kicker`, `qty-row eq-card`), `MOCK-GUIDE.md` § "Epic 15" (lines 166-215, the class table). `git show f31482e0 -- <mock>` shows exactly what the mocks changed.
- `tokens.css` and `components.css` byte-identical. The mocks' page rules go in `apps/web/src/surfaces/relatorio/relatorio.css` (Sumário, scope `[data-route="/relatorio/:id"]`), the rail rules in `apps/web/src/styles/app.css` or `relatorio.css` scoped to `.relatorio-tree` (the mock's `#rail`; both rail mounts, `ficha-rail.tsx` and `tree-surface.tsx`, must get them), the composer rules in `apps/web/src/surfaces/templates/templates.css` (scope `[data-route="/templates/:id"]`); every `.frame-phone`/`.frame-*` rule translated in `app.css` per AGENTS.md "Mock container selectors", each with a comment naming the mock rule. No new colour token.
- AD-1/AD-2: every text, count, plural, state word and "which word for which level" comes from `packages/domain`; no singular/plural or status choice in `apps/web`.
- Keep every behaviour and every app-bound class/ARIA name: expand/collapse and `aria-expanded` chevrons, `treeKeys` keyboard, drag handle, Position box (`.pos-box.s9-pos`), Overflow menus (names unchanged), `data-tree-open`, `data-tree-chevron`, `data-block-id`, `data-location-id`, `data-site-of`, `.s9-eq-open`, `.s9-verif`, `.s9-state[data-state]`, `.progress-counter`, `.overflow-trigger`, `.sum-here`, `.s9-dup`, `aria-current`, the panel capture, `focusBlockId`/`focusLocationId` focus and scroll on return (Story 15.4 uses them at every width), "Próxima ficha" walking sheets only (default; Bruno's open question).
- Accessible names stay as today where tests bind them: the site button keeps `copy.local.entryLabel(site.text, name)` in the Sumário ("Verificações do local · 0 de 19 — Cubículo Enel") and `entryLabel(SITE_CHECKLIST_LABEL, name)` in the rail; in the composer the new coluna kicker is `aria-hidden="true"` so `.col-head`'s name is unchanged.
- Existing unit tests and Playwright specs stay green unchanged except where the mocks changed the markup or a text (listed in the Code Map); each such edit says so in a comment or the PR body.

**Never:** no op, seed, contract or schema change (report a need to the coordinator in the PR body); no edit to `epics.md`, `sprint-status.yaml`, `source-deltas.md`, `DESIGN.md`, `EXPERIENCE.md`; no Tailwind, no new component kit; no Playwright MCP browser pass; no change to the restore dialog texts ("Painel · 2 colunas · 2 fichas", `removed-locations`), the Home/obra counters, or seeds v1-v9.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Local band | cabine root, open | `.s9-loc-row`: chevron, drag, Position box, `.s9-loc-body` › `.level-kicker` "Local" + `.s9-loc-name` + `.s9-loc-meta` (Função + SE data, `cl-missing` as today), counter, Overflow; no `.s9-verif` in the band | collapsed: band only, nothing under it |
| Site card | local with `site !== null`, open | first child `ul.s9-eqs.s9-site` › `li.s9-site-card.eq-card.block-card` › `button.s9-verif.eq-card-open`: `.eq-card-title` (check icon, `.s9-site-name` "Verificações do local", `.s9-site-count` "12 de 19"), `.eq-card-status` (`.s9-state[data-state]` glyph + Vazia / Em preenchimento / Concluída, `.nc-badge` when `site.nc > 0`) | seed without site list: no card |
| Painel sub-band | painel | kicker "Painel", `.s9-pnl-meta` "17 colunas" / "1 coluna" / "sem colunas" (no "Painel ·") | empty painel note and "Adicionar coluna" as today |
| Coluna header | coluna (or a `cabine` drawn under a location) | `.s9-col`: chevron, drag, Position box, `.level-kicker` "Coluna", `.s9-col-name`, `.s9-col-meta` "2 de 4", Overflow | — |
| Equipment card | block, NC on 1 item, current | `li.s9-eq.eq-card.block-card.is-current[aria-current]` › drag, Position box, `button.s9-eq-open.eq-card-open` › `.s9-eq-id.eq-card-title` (`.block-tag` + `.s9-eq-name`) + `.eq-card-status` (`.s9-state` glyph + `stateText`, `.nc-badge` "1 NC", `.sum-here`) ; Overflow; `.s9-dup` | no TAG: title shows the type only, no empty tag |
| Order in a local | site, direct sheets, colunas directly under it, painéis | site card, "Equipamentos no local" header + its cards, colunas, painéis, then the local's `.s9-add` last | painel's `.s9-add` after its last coluna |
| Rail rows | same tree | local `.tree-row.level-band` (kicker, `.tree-name`, `.tree-meta` "Entrada · 1 painel · 3 de 9 fichas"), painel `.level-subband` ("1 coluna · 3 de 9"), coluna `.level-group` ("3 de 9"), site `.tree-row.eq-card.site-card` (`.tree-meta` "19 de 19", `.tree-state` word), sheet `.tree-row.level-item.eq-card[.is-selected]` (`.tree-id` › `.tree-tag` + `.tree-name`; `.eq-card-status` › `.tree-state` word, `.nc-badge`, the not-tested reason as `.tree-meta`) | childless location keeps the inert chevron span |
| F37 | NC on 2 sheets + 1 site item | header "3 NC abertos"; badges "1 NC" ×3 (or "2 NC" on a sheet with two) and their numbers sum to `nc_open` | — |
| F34 | 1 live point + 1 derived | row 8 "1 ponto + 1 automático"; 4 + 1 with one without action: "4 pontos + 1 automático · 1 sem ação"; 0 + 1: "0 pontos + 1 automático"; no derived: as today | live point from an untested sheet still adds "1 não ensaiada" |

</intent-contract>

## Code Map

- `packages/domain/src/relatorio/tree.ts` -- `TreeLocationNode`, `TreeSiteNode`, `TreeEquipmentNode`, `locationMetaTexts` (l.292: drop "Painel · " from `meta`; drop "Local" from the local `railMeta` and "Painel" from the painel `railMeta`; coluna `railMeta` = counter only), `buildLocationTree` (`siteNode`, `equipmentNode`). Add fields: location `kicker` ("Local" for a cabine at level 0, "Painel", else "Coluna"; kernel fn `levelKickerText`), equipment `nc` (`ncCount(block)`), `ncBadge: string | null`, `reason: string | null` (`notTestedReasonText`), site `stateWord`, `sumarioStateAttr`, `ncBadge`. Keep `railMetaText`/`railMetaRest` only if still read.
- `packages/domain/src/relatorio/progress.ts` -- `ncCount` (l.39), `ncAbertosText`; add `ncBadgeText(n)` → "1 NC", "2 NC" (null at 0 on the node). Export through the package index like its siblings.
- `packages/domain/src/points/summary.ts` -- `PointsSummary` gains `derived`; `pointsSummaryText` (l.110) leads with `plural(live) + " + " + plural(derived,'automático','automáticos')` when `derived > 0`, and its "não ensaiadas" part counts only the live points from untested sheets (`naoEnsaiadas - derived`). `pointsHeadingText` (l.130) is the wording precedent.
- `packages/domain/src/relatorio/*.test.ts`, `points/*.test.ts` -- tree, progress, summary tests to extend/update.
- `apps/web/src/surfaces/relatorio/relatorio-tree-sumario.tsx` -- `SumarioLocation` (local/painel/coluna branches) and `SumarioEquipment`: new markup per the matrix; the site card leaves `.s9-loc-body`; `addButton` for the local moves after the painéis.
- `apps/web/src/surfaces/relatorio/relatorio-tree-rail.tsx` -- `RailLocation`, the site row, `RailEquipment`: new classes and inner markup; the card body stays the `button.tree-body[data-tree-open]`.
- `apps/web/src/surfaces/relatorio/relatorio-tree.tsx` -- `siteRowButton` (l.121) selector moves to the card (`li[data-location-id=…] > ul.s9-site .s9-verif`); the `focusLocationId` seeding (l.232) must now `reveal(focusLocationId)` because the card is drawn only while the local is open.
- `apps/web/src/surfaces/relatorio/relatorio-tree-shared.tsx` -- `sameRow` memo compare: make sure the new node fields re-render (it compares node content).
- `apps/web/src/surfaces/relatorio/sumario-surface.tsx` -- header `.sum-summary` (l.438), unchanged markup; F50 is CSS.
- `apps/web/src/surfaces/relatorio/relatorio.css` -- current s9 rules l.100-170 and the F-07 block l.320-344 (`.sum-s9 .s9-eq-open` grid override): reconcile with the card rules (the title must wrap, F19).
- `apps/web/src/styles/app.css` -- phone block l.210-290 (`.s9-*` translations; `.s9-loc-row > .drag-handle` hidden on phone), rail F-07 rules l.878-894 (`data-level="3"` indent, `:has(> .tree-state)` wrap: re-check for the new card markup).
- `apps/web/src/surfaces/templates/skeleton-list.tsx` -- `CardBody` (l.197), coluna `.col-head` (l.402: add `<span className="level-kicker" aria-hidden="true">`), `QtyGrid` `.qty-row` (l.164: add `eq-card`); `copy.composer.levelColuna` beside `levelLocal`/`levelPainel` in `apps/web/src/copy/pt-br.ts` (~l.357). The composer's Verificações stays a text line.
- `apps/web/src/surfaces/templates/templates.css` -- l.38 `.level-kicker`, l.61 `.qty-row`: add the 42-mock rules.
- Unit tests bound to changed markup/text: `relatorio-tree.test.tsx` (l.391-405 rail meta and `.tree-body > span`), `relatorio-tree-painel.test.tsx` (l.169 "Painel · 2 colunas"), `relatorio-tree-edges/edits/removal.test.tsx`, `sumario-surface.test.tsx`, `local/entry-points.test.tsx` (l.199 rail site meta), `local/verificacoes-surface.test.tsx`, `templates/template-composer*.test.tsx`.
- E2E bound to changed markup/text: `e2e/verificacoes-local.spec.ts` (`siteButton` l.111 under `.s9-loc-row`, texts "Verificações do local · N de 19" l.304/447/652, `.s9-verif` count l.935/951 on collapsed locals, rail meta l.685), `verificacoes-local.durability.spec.ts`, `local-painel-coluna.spec.ts` (painel meta "Painel · …" l.291/657/663/767/816/950/996/1078, `.s9-verif` l.1162/1220), `tree.spec.ts` (rail meta l.453/500/526/537), `ficha.spec.ts`, `ergonomics.spec.ts`, `seed-v9.spec.ts`, specs asserting row 8 "· N não ensaiada(s)"; helpers `e2e/support/tree.ts` (`section9Chevron`, `expandLocation`), `e2e/support/local.ts`. Watch any Sumário spec that queries `.block-card` (the cards now carry it).
- `docs/kbs/log.md` -- one dated line.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/relatorio/tree.ts`, `progress.ts`, `points/summary.ts` (+ index exports, tests) -- the new fields and texts per the Code Map, unit-tested: kicker per kind (incl. a cabine under a location → "Coluna"), painel meta and rail metas, `ncBadgeText` 0/1/2, equipment `ncBadge`/`reason`, site `stateWord` at 0/some/all and `ncBadge`, F34 texts (1+1, 4+1 with sem ação, 0+1, 0 derived, live from untested sheet), and an F37 test: on a snapshot with NC on two sheets and one site item, the sum of the badge numbers over `treeNodes` plus the site nodes equals `progress(snapshot).nc_open`.
- `relatorio-tree-sumario.tsx`, `relatorio-tree-rail.tsx`, `relatorio-tree.tsx`, `relatorio-tree-shared.tsx` -- markup per the matrix; site focus reveal.
- `relatorio.css`, `app.css`, `templates.css` -- the mock rules and `.frame-*` translations (F50: phone `.sum-summary` 2×2 grid, `.header-side` row-reverse; F19: `.eq-card-title` wraps, `.s9-eq-name` `flex: none`).
- `skeleton-list.tsx`, `copy/pt-br.ts` -- coluna kicker, `qty-row eq-card`, local-card sunken head per the 42 mock.
- Update the unit tests and e2e specs listed in the Code Map where the mocks changed markup or text (site card reached by expanding its local first; `expandLocation` may gain that).
- `e2e/tree-levels.spec.ts` (new, `@p0`, viewport 390×844) -- a relatório whose local holds a painel with two colunas and one direct equipment (build it as the other specs do, UI or `e2e/support` seeding): assert the band's kicker "Local", name and Função line, the site card first ("Verificações do local", "0 de N", "Vazia"), the "Painel" kicker and "2 colunas", both coluna headers' "Coluna" kicker and "N de M", the direct card under "Equipamentos no local", the local's "Adicionar equipamento no local" last; answer one checklist item NC on a sheet, return, and assert the header "1 NC aberto" equals the one `.nc-badge` "1 NC" on that card, and that IndexedDB (the block row or the outbox op) holds the NC (E12-A6); open a sheet from its card, "Voltar", and assert that card is focused (`.s9-eq-open` of the same `data-block-id`); F50: the four counters sit in two rows of two and the first Sumário row (`.sum-row`) has its top above 844 px without scrolling. Add a 1180 px test (F19): every visible card shows `.s9-eq-name` with a non-zero width beside its TAG. Add the spec to `SERIAL_SPECS` only if it times a tap against a render.
- `docs/kbs/log.md` -- dated line: Story 15.2 built the tree levels; cite the 15.1 amendments of `DESIGN.md`/`EXPERIENCE.md`.

**Acceptance Criteria:**
- Given the Sumário with section 9 open, the rail on a sheet and the phone tree page, and the composer, when they render at 390, 768 and 1280 px, then they carry the mocks' classes and structure (band, sub-band, group header, `.eq-card` cards, `.s9-site-card` first in its local, kicker on every non-equipment level, "Adicionar …" last) and every text on them is a kernel field.
- Given F50/F19/F37/F34, when this story lands, then: at 390×844 the counters are a 2×2 grid and the first row is visible unscrolled; at 1180 the type label renders beside the TAG; the header's NC count equals the sum of the badges; row 8 counts the automatic point once; each pinned by a test.
- Given the existing tree behaviour, when the rows are restyled, then every `relatorio-tree*.test.tsx`, `sumario-surface.test.tsx` and Playwright tree spec passes, changed only where the mocks changed markup or text.
- Given "NC abertos" landing on a local's NC site item, or "Voltar" from a local's Verificações, when the Sumário opens, then that local expands and its site card's `.s9-verif` is scrolled into view and focused.

## Spec Change Log

## Review Triage Log

### 2026-10-22 — Review pass
- layers: Edge Case Hunter, Verification Gap Reviewer (Blind Hunter and Intent Alignment skipped: token economy; the integrated epic review covers them)
- verdicts: 8 findings — high 0, medium 2, low 6, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` VG: the rail sheet card's `.nc-badge` is never asserted — unit test added in `relatorio-tree.test.tsx` (NC sheet shows "1 NC", others none).
  - `[low]` `[patch]` VG: composer coluna kicker and `qty-row.eq-card` untested — assertions added in `template-composer-local.test.tsx`.
  - `[medium]` `[patch]` ECH: the Sumário site card lost tree arrow keys when it left the band row — `treeKeys` handler on the card `li`, unit-tested.
  - `[low]` `[patch]` ECH: the site button's aria-label hides its NC badge — the badge text is appended to the label when present; unchanged without NC.
  - `[low]` `[patch]` ECH: the rail card's left padding strip is outside the `.tree-body` button — inset moved onto the button.
  - `[low]` `[patch]` ECH: `TreeSiteNode.railMeta` computed but never drawn — field removed.
  - `[low]` `[reject]` ECH: with locals collapsed no badge is visible while the header counts NC — the approved mocks draw no indicator on bands; the header tap ("NC abertos", F-24 finder) opens the path to the sheet; listed as known open in the PR.
  - `[low]` `[reject]` ECH: the composer's "Coluna" kicker is web copy, not the kernel's `levelKickerText` — the composer's "Local"/"Painel" kickers already live in `copy.composer` (static surface copy home); the tree's is kernel-derived because a `cabine` drawn under a location reads as a coluna.

## Design Notes

- Open questions (kept conservative, listed in the PR): the site card carries an `.nc-badge` when its items hold NC (the mocks draw none, but F37 needs the header to equal the badges); "N NC abertos" equals the **sum** of badge numbers (one per sheet in the mock), not the number of badged rows when a sheet has two NC; row 8 with only derived entries reads "0 pontos + 1 automático" (the Points heading's pattern); the rail card keeps a not-tested sheet's reason as a `.tree-meta` line (review F-1) although the mock draws the word alone.
- Owner of cross-batch items: this batch for all ACs. The DoD real-browser pass at 390/768/1280 light and dark is the coordinator's integrated QA (orchestrator: no MCP pass in a batch).

## Verification

**Commands (tools container, `podman compose --profile tools run --rm --user root tools …`, logs to `.scratch-e15d/`):**
- `pnpm lint`, `pnpm static`, `pnpm test:unit`, `pnpm test:api` -- expected: green.
- Under the host lock: `pnpm exec tsx scripts/e2e.ts e2e/tree-levels.spec.ts <touched specs> <specs from grep -rln "s9-\|Locais do relatório\|Em preenchimento\|Verificações do local" e2e/*.spec.ts> --project desktop-chrome --project durability-desktop-chrome` -- expected: green.

## Auto Run Result

- Summary: section 9 of the Sumário, the rail (sheet rail and the phone tree page) and the composer skeleton rebuilt from the approved 15.1 mocks: local title band, painel sub-band, coluna group header with "N de M", level kicker, every sheet a card (TAG + type label, glyph + state word, NC badge), the Verificações do local as the first card of its local, "Adicionar …" last; F50 (phone counters 2×2), F19 (type label at every width), F37 (NC badges whose numbers sum to the header), F34 (row 8 "1 ponto + 1 automático").
- Files: `packages/domain/src/relatorio/tree.ts`, `progress.ts`, `site-checklist.ts`, `points/summary.ts` (kernel fields and texts) with tests; `apps/web/src/surfaces/relatorio/relatorio-tree-{sumario,rail}.tsx`, `relatorio-tree.tsx` (site focus reveals its local), `relatorio.css`, `styles/app.css`, `templates/skeleton-list.tsx`, `templates.css`, `copy/pt-br.ts`; unit tests; e2e `tree-levels.spec.ts` (new) and the specs bound to changed markup; `docs/kbs/log.md`.
- Review: 6 patches applied (2 medium, 4 low), 0 deferred, 2 rejected (reasons in the triage log).
- Follow-up review recommended: false (no high patched; the two medium patches are a test and a key handler, both now covered by tests).
- Verification: lint, static, test:unit, test:api in the tools container; the touched and tree-text Playwright specs under the host lock (results in the PR body).
- Residual risks: badges are visible only under expanded locations (mocks draw no band indicator); the 390×844 fold check and the 1180 type label are pinned only by Playwright.
