---
title: 'Fix batch fx15q: four one-screen corrections of Epic 15 after the v0.3.0 QA'
type: 'bugfix'
created: '2026-10-23'
status: 'in-progress'
baseline_revision: 'be4b442305962b0a18e08f052c337183bb62dda1'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'medium'
context: []
warnings: ['batched'] # coordinator's cut: four one-screen corrections of Epic 15 after the v0.3.0 QA
deferred: []
---

<intent-contract>

## Intent

**Problem:** Four small gaps after Epic 15 (v0.3.0): (1) from 1024 px a coluna's "Adicionar equipamento" releases the coluna and closes its row (deferred-work row of Story 15.5, Matheus decided idempotent on 2026-10-23); (2) Sumário row 8 reads "0 pontos + N automáticos" when there are only automatic points (Story 15.2 open question, Matheus decided "N automáticos" on 2026-10-23); (3) the composer's local card sub-line omits the mock's "Verificações do local: 19 itens, respondidos uma vez neste local" part (QA gap G1, `_bmad-output/test-artifacts/manual/qa-e15-2026-10-23.md`); (4) the Home "Cadastros" shortcut sub-line lists six tabs, missing "Frases de NC" (QA gap G2, UX-pass F3).

**Approach:** Four localized fixes, kernel first for derived text (items 2, 3, 4 live in `packages/domain`), one `apps/web` behaviour change (item 1), each with a test that is red before the fix.

## Boundaries & Constraints

**Always:** every derived text stays in `packages/domain`, `apps/web` only renders; tests red before the fix; e2e expected strings for lists or counts read the kernel (`siteItems(SEED_VERSION).length`), never a literal 21; code and comments in English, UI copy pt-BR.

**Never:** no seed, op, contract or `CONTRACT_VERSION` change; `tokens.css`/`components.css` and mocks unchanged; the local's "Adicionar equipamento" keeps its toggle from 1024 px; do not change the Points surface heading ("Pontos de atenção (0 + 1 automático)" stays, out of scope); do not add the mock's "alvenaria: ..." part of the sub-line; do not change the Cadastros default tab (F-20 decision in `registries-surface.tsx`: a registered company opens on Instrumentos or the remembered tab; not a one-line default); do not edit `epics.md`, `sprint-status.yaml`, `source-deltas.md`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Coluna press, inline palette (>=1024 px) | coluna open and current | stays current, row stays open, no dialog, focus stays on the pressed button, palette target unchanged | none |
| Coluna press, inline, not current | another node current | coluna becomes target (unchanged) | none |
| Local press, inline | local current | released (toggle, unchanged) | none |
| Coluna press <1024 px | any | target + drawer/sheet opens (unchanged) | none |
| Row 8, 0 manual + 1 auto | total 1, derived 1 | "1 automático" | none |
| Row 8, 0 manual + 2 auto | derived 2 | "2 automáticos" | none |
| Row 8, 1 manual + 1 auto | | "1 ponto + 1 automático" (unchanged) | none |
| Row 8, 0 manual + N auto + sem ação/untested-live parts | | "N automáticos · ..." other parts unchanged | none |
| Local sub-line, seed v9 | Função primária, agrupar on | "Função: primária · Verificações do local: 21 itens, respondidos uma vez neste local · Agrupar por tipo: ativado" (count from `siteItems`) | none |
| Local sub-line, no Função, v9 | | "Verificações do local: 21 itens, respondidos uma vez neste local · Agrupar por tipo: desativado" | none |
| Local sub-line, seed v1-v3 | `siteItems(v).length === 0` | no Verificações part | none |
| Home Cadastros sub-line | | "Empresa · Clientes · Instrumentos · Fabricantes · Frases de NC · Classes de tensão · Critérios" | none |

</intent-contract>

## Code Map

- `apps/web/src/surfaces/templates/template-composer.tsx` ~L251-268 -- `onAddEquipamento(node, onReleased?)`: `inline` = palette's first section has an `offsetParent`; today `inline && currentRef === node.ref` releases any node. Change: release only when `node.kind` is the local's (cabine); a coluna is always set as target (no release, no `onReleased`). Update the doc comment.
- `apps/web/src/surfaces/templates/skeleton-list.tsx` L45 (prop type), L288 (local button, `aria-pressed`), L429 (coluna button passes `() => restoreFocus(() => headButton.current)`) -- drop the coluna's `onReleased` callback and, if then unused, the optional parameter and `restoreFocus` usage there (keep it if the local or another path uses it). L240 `sub={localSubText(cabine)}` -> pass the template's seed version; `SkeletonList` gets a `seedVersion: string` prop (template-composer.tsx ~L541 passes `row.seed_version`, as it already does for other children at L604/L644).
- `apps/web/src/surfaces/templates/template-composer-palette.test.tsx` L307-370 -- `describe('15.5 composer ...')`; test at L358 expects the coluna release from 1024 px: rewrite to idempotent (stays current, row open, no dialog, focus on the button, palette target still the coluna). L282 local toggle test stays.
- `e2e/templates.spec.ts` L744-773 -- `@p1 15.5-E2E-002`: the 1280 px half expects release; change title and assertions: after the press the row keeps `is-open`, no dialog, `.pal-target` still "Toque para adicionar em: Coluna 1 · Painel 1", focus on the button; then a second press, same state (idempotent).
- `packages/domain/src/points/summary.ts` L111-129 -- `pointsSummaryText`: when `live === 0` and `derived > 0` the first part is `plural(derived, 'automático', 'automáticos')`; update doc comment. Tests: `packages/domain/src/points/points.test.ts` (grep "0 pontos +"), `apps/web/src/surfaces/relatorio/sumario-surface.test.tsx` L281 expects '0 pontos + 1 automático' -> '1 automático'. `apps/web/src/surfaces/relatorio/sumario.ts`/`packages/domain/src/relatorio/sumario.ts` L222 appends "pontos sem prazo" separately; leave it.
- `e2e/points.spec.ts` L621-632 (6.6-E2E-005) -- row 8 via `row8(page).locator('.sum-status')`; add one assertion of the 0-manual shape ("N automáticos") in an existing points spec state with untested sheets and no manual point (e.g. before the manual points are added in 6.6-E2E-005, if the flow passes there), reading the count, not guessing.
- `packages/domain/src/templates/text.ts` L180-191 -- `localSubText(cabine)`: add `seedVersion: string` parameter; insert between Função and Agrupar the part `Verificações do local: ${plural(n, 'item', 'itens')}, respondidos uma vez neste local` where `n = siteItems(seedVersion).length`, omitted when 0. Mock: `_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/mockups/prototype/screens/42-template-composer.html` `.block-sub` of local cards (grep "Verificações do local:"). `siteItems` is in `packages/domain/src/seed/definitions.ts` L235; `plural` already used in text.ts. Update comment ("without the 14.3 part" goes).
- `packages/domain/src/templates/text.test.ts` L188-189 -- current expectations; add v9 (with/without Função), and a v1-v3 seed (no part).
- `apps/web/src/surfaces/templates/template-composer-local.test.tsx` L109, L130, L433, L477 -- sub-line assertions; update to the new text (`toHaveTextContent` substring checks may still pass; make at least one assert the full line with the Verificações part, count from `siteItems`).
- `e2e/local-painel-coluna.spec.ts` L218, L538, L619, L621 -- exact `toHaveText` sub-lines; update using `siteItems(SEED_VERSION).length` (or the template's actual seed version) from `@app/domain`.
- `packages/domain/src/home/cards.ts` L328 `CADASTROS_SUBLINE` -- add "Frases de NC" after "Fabricantes" (tab order in `apps/web/src/surfaces/registries/registries-surface.tsx` L108-122). Deriving from the tab list is not adopted: the tabs live in `apps/web` copy and the sub-line abbreviates "Critérios de aceitação" to "Critérios" per the mock. Tests: `packages/domain/src/home/cards.test.ts` L405, `apps/web/src/surfaces/home/home-surface.test.tsx` L468.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/points/summary.ts` + `points.test.ts` -- "N automáticos" with 0 manual; unit test 0+1, 0+2, 1+1 (write tests first, see them red).
- `packages/domain/src/templates/text.ts` + `text.test.ts` -- `localSubText(cabine, seedVersion)` with the Verificações part.
- `packages/domain/src/home/cards.ts` + `cards.test.ts` -- seven-tab sub-line.
- `apps/web/src/surfaces/templates/template-composer.tsx`, `skeleton-list.tsx` -- coluna idempotent; seedVersion prop for the sub-line.
- `apps/web/src/surfaces/templates/template-composer-palette.test.tsx`, `template-composer-local.test.tsx`, `apps/web/src/surfaces/relatorio/sumario-surface.test.tsx`, `apps/web/src/surfaces/home/home-surface.test.tsx` -- updated expectations.
- `e2e/templates.spec.ts`, `e2e/local-painel-coluna.spec.ts`, `e2e/points.spec.ts` -- updated/added assertions as in the Code Map.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- under the 15.5 coluna-toggle row add `state: done (2026-10-23, fix batch fx15q: idempotent from 1024 px, Matheus)` replacing nothing (strike the old `state: open` line with `~~...~~`).
- `docs/kbs/log.md` -- one dated line for the batch.

**Acceptance Criteria:**
- Given the composer at 1280 px with an open coluna as target, when its "Adicionar equipamento" is pressed once or twice, then the coluna stays the palette target, its row stays open, no dialog opens and the focus stays on the button; a local's button still toggles.
- Given a relatório with untested sheets and no manual point, when the Sumário renders, then row 8 reads "N automáticos" (or "1 automático"), never "0 pontos + ...".
- Given a template on seed v9 in the composer, when a local card renders, then its sub-line includes "Verificações do local: 21 itens, respondidos uma vez neste local" between the Função and Agrupar parts; on a seed without the site checklist that part is absent.
- Given Home, when the shortcut row renders, then the Cadastros sub-line lists the seven tabs in tab order.

## Spec Change Log

## Review Triage Log

## Verification

**Commands (all in the tools container, `podman compose --profile tools run --rm --user root tools ...`):**
- `pnpm test:unit -- <touched test paths>` while iterating -- green
- `pnpm lint`, `pnpm static` -- green
- Playwright is run by the orchestrator under the host lock; the implementer does not run Playwright.
