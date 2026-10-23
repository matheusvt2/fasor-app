# Epic 15 Context: Bruno's first production feedback (document of 2026-10-22)

<!-- Compiled 2026-10-22 from epics.md Epic 15, Bruno's "Melhorias produto.docx" (seven items, phone screenshots of
v0.2.4), the 2026-10-22 hands-on pass report, source-deltas.md rows of 2026-10-22, spine AD-1/2/13/15/21/26.
Current decisions only. Edit freely. -->

## Goal

Seven corrections Bruno asked for after using v0.2.4 on a phone, landed as six stories: the tree reads its levels
without counting indentation (15.1 mocks, 15.2 build), the transformer list asks about the oil level once and the TC
asks for no power and the local's checklist gains paint and the condition of grades and doors (15.3, seed v9), "Voltar"
from a sheet returns to the Sumário row at every width (15.4), a coluna in the composer offers "Adicionar equipamento"
below 1024 px (15.5), and the transformer ratio is U1·√3/U2 (15.6, seed v9). Success signal: Bruno's next relatório
from the phone needs none of the seven workarounds.

## Stories, waves and lanes

| Wave | Batch | Story | Dev model | Seed / contract | Base |
|---|---|---|---|---|---|
| A | e15a | 15.4 "Voltar" lands on the Sumário at every width | opus · medium | none | main (6e5d8aee or later) |
| A | e15a | 15.5 "Adicionar equipamento" on a coluna below 1024 px (+F10) | opus · medium | none | same branch as 15.4 |
| A | e15b | 15.3 Seed v9: one oil item, TC without POTÊNCIA NOMINAL, two site items | opus · high | **v9, contract 25, minimum 25** | main |
| A | e15b | 15.6 Transformer ratio with √3 | opus · high | v9, contract 25 (same batch) | same branch as 15.3 |
| B | e15c | 15.1 Mocks for the tree levels | opus · medium | none | main, after wave A's gate |
| B | e15d | 15.2 The tree levels built (+F50, F19, F37, F34) | opus · high | none | after Matheus approves 15.1 |

Two batch stacks at a time (E11-A1 load rule): e15a and e15b run in parallel as two worktrees; e15c starts when one
of them merges. Numbers are fixed here: no other batch takes seed v9 or contract 25.

Defaults taken on 2026-10-22 (Matheus) while Bruno's seven questions are out; an answer that differs becomes a
dated line under its story before the batch merges, or a later seed version:

- 15.3: drop checklist item 5 `indicador_nivel_de_oleo`, keep item 13 `oleo_isolante_indicador_de_nivel` (its key is
  the Disjuntor MT's item and oil-rule item, so nothing else moves); POTÊNCIA NOMINAL leaves the TC only; two site
  items at the end of Ambiente, "Grades e portas: estado e fixação" and "Pintura e corrosão", authored labels and
  phrases.
- 15.6: `ratio_factor: 'sqrt3'` on `TRANSFORMADOR_RATIO` only, fixed, not switched by LIGAÇÃO SECUNDÁRIA; TP and TC
  tables unchanged.
- 15.4: the Sumário on the row at every width; the sibling-shortcut reading is a separate story if Bruno asks.
- 15.1: bands per local and painel, coluna headers with counts, level kicker, NC badge and type label on equipment
  rows, "Adicionar …" last; no new colour token.

Bruno's answers (2026-10-22, same day, relayed by Matheus): 1 to 4 confirm the defaults above (15.3, 15.4, 15.6
unchanged). 5 and 6 change 15.1 and 15.2: equipment rows become **cards** (TAG and type label, state word, NC badge,
Overflow at the corner) and the **Verificações do local is a card of the same kind, the first of its local**, with
"N de 19" as progress and the equipment state words; bands per local and painel and the level kicker stay; PR #158
is redrawn before Matheus approves. 7 adds Story 15.7 (the TC's own checklist, seed v10), backlog until Bruno sends
the list; Matheus asks for it at the next interaction. Open for Bruno next time: whether "Próxima ficha" walks the
checklist card (default: no).

## Cross-story table (one assertion per shared item)

| Shared item | Stories | Assertion |
|---|---|---|
| `seed/v9.ts` derived from v8; `SEED_VERSION`, `CONTRACT_VERSION`, `MIN_CONTRACT_VERSION` | 15.3, 15.6 | one batch, one seed file, one contract bump; `seed.test.ts` pins v9 vs v8 as exactly the 15.3 and 15.6 differences; `V8_HASH` pinned |
| `seed/schema.ts` `tableDefSchema.ratio_factor` (optional) | 15.6 | absent on v1 to v8, their hashes unchanged |
| `relatorio/reading-evaluation.ts` ratio rows (changed by PR #156, F42) | 15.6 | `condicao`, TAP Nº and the unit-named headers of PR #156 keep their tests green; only the calculated value and the plate fallback change |
| `relatorio/dry-insulation.ts`, `relatorio/oil-rule.ts` item counts | 15.3 | counts derive from the definition's subtype `na_defaults` and `oil_rule.items`; no literal 8 or 7 anywhere in `apps/*` |
| `print/section-9.ts` checklist rows, nameplate pairs, site table | 15.3 | v1 to v8 relatórios print as today; the Porto Seguro goldens (v1) unchanged |
| `apps/web/src/app.tsx` ficha and Verificações routes (`back`, `backWide`) | 15.4 | one back target at every width; the Export-dialog return (`?volta=exportar`) unchanged |
| `relatorio-tree.tsx` `focusBlockId`, `focusLocationId` on the Sumário | 15.4, 15.2 | 15.4 reuses the existing focus; 15.2 restyles rows without changing the focus and scroll behaviour |
| `skeleton-list.tsx` `ColunaRow`, `template-composer.tsx` `onAddEquipamento` | 15.5 | the coluna button sets the same target state the local button sets; the inline palette toggle from 1024 px unchanged |
| `42-template-composer.html`, `40-relatorio-overview.html`, `shell-foot.html` | 15.5, 15.1 | 15.5 adds the coluna control to the phone and tablet frames; 15.1 redraws the levels; both update `MOCK-GUIDE.md` |
| `docs/nc-chip-phrases.md` | 15.3 | lists the two site items' phrases and item 13's absorbed phrase |

Undo pairs: 15.3 and 15.6 add no op kind; 15.4 and 15.5 add no op; 15.2 adds no op.

## Gate

The 2026-10-08 story gate per PR: `lint`, `static`, `test:unit`, `test:api` and the Playwright specs the story
touched (`pnpm exec tsx scripts/e2e.ts <specs> --project desktop-chrome --project durability-desktop-chrome`), plus
the touched durability specs on the matrix projects for e15b (it changes the fold's seed reading and a live query on
the ficha). The full `@p0`, `test:e2e:full` and the matrix once per wave on the integrated main, by the coordinator.
Cross-batch merge rule (2026-10-15): before the second PR of wave A merges, merge the first into it and run both
spec lists on the result under the host lock. Tools run only in the `tools` container through `podman compose`;
worktree stacks remap ports through `compose.local.yml` (orchestrator § 1).

## Wave gates (coordinator)

- **Wave A gate, 2026-10-22, main `e8a144a6`** (after PRs #158, #162, #161, #163, #165): lint, static, api 682/682, unit 4429/4429, matrix 106/106; `@p0` 299/305 and `test:e2e:full` 504/520. Triage in PR #169 (merged as `b20a06e8`): three stale specs (ergonomics 19 site rows on seed v9, status-flow "seção 9" after a section removal, review-layout-interaction headers without units) and one layout regression from PR #156 (the Condição cell's uppercase word plus the calc mark made the transformer TTR scroll at 1280 px, DC-1; fixed by showing the mock's "Satisfatório"/"Insatisfatório" without the mark, the print unchanged); seven load flakes green alone on the same commit (R8CAP-E2E-010, templates 3.4-E2E-003/005/006 and 15.5-E2E-001, photos 6.2-E2E-001/005, plate-shot-fallback 14.10-E2E-003, suggestions 8.1-E2E-005).
- **Wave B gate, 2026-10-23, main `b20a06e8`** (after PRs #167, #168, #169): lint, static, api 682/682, matrix 106/106, `test:e2e:full` 517/522 (one red, `templates` 15.5-E2E-002, the sync badge still pending after 60 s under load; green alone, 1/1); `test:unit` 4433/4434 under load (`template-composer-local.test.tsx` "Adicionar painel" from a collapsed card's Overflow, a 1 s findByRole; green alone twice, 16/16), which stopped `verify` before its `@p0` stage, so the `@p0` stage ran on its own on the same commit: **307/307**. No fix batch needed. The epic's remaining steps: the integrated QA browser pass (390/768/1280, light and dark), Matheus's open decisions, the production deploy, Story 15.7 when Bruno's TC list arrives.

## Out of scope

The sibling next/previous shortcut inside a sheet (Bruno's question 4, other reading); a TC-specific checklist (F29,
Bruno's question 7); the unit hint when the insulation default differs from the previous sheet (F28, in
`deferred-work.md`); Stories 14.6 to 14.8 and 14.13; any change to seeds v1 to v8.
