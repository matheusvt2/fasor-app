---
title: 'Story 12.2: Forward, never back: resume in one tap and no dead ends'
type: 'feature'
created: '2026-09-24'
status: 'in-review'
baseline_revision: '144a55892a5b86c1ecb7b03ed91589bec03d6910'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'medium'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-12-context.md'
warnings: ['batched', 'oversized']
# batched: Story 12.2 runs as its own Epic 12 batch (s122) beside 12.1; one spec covers its six navigation items on shared surfaces (Home, setup, Sumário, section text) for token economy.
deferred: []
---

<intent-contract>

## Intent

**Problem:** The forward path of a field relatório has dead ends (journey review J-05, J-06, J-11, J-12): Home "Continuar" is disabled, "Concluir dados do relatório" stays on setup, "Voltar" from a sheet lands on `/arvore` ("Abra uma ficha na árvore."), the section text surface only goes back, new-relatório dates open empty, and setup Etapa 4 demands an instrument with no way to register one. Baseline (tablet 768): J0 resume 2 taps; J5 create to first sheet 12 taps with one forced "Voltar".

**Approach:** Every rule (which sheet resumes, the counter texts, the next section, today's date) goes in `packages/domain`; `apps/web` wires navigation with react-router state and reuses the existing `last_sheet` pref (`readLastSheet`/`writeLastSheet`), `sumarioOpensExpanded`, the tree's reveal-to-last-sheet, and `/relatorio/:id/setup?etapa=4`.

## Boundaries & Constraints

**Always:** AD-1/AD-13 ownership (derived text, counts, choices in the kernel; pt-BR static copy in `copy/pt-br.ts` with `// authored:` when not in a mock); mock class names (`.progress-counter`, `.card-continue`, `.tabular`, `.btn-reason`); 48/56 px targets; English code and comments; no emoji; tests as a human would (clicks, typing, keyboard, reload).

**Never:** touch `apps/web/src/components/`, `apps/web/src/input/`, or `surfaces/ficha/*` (Story 12.1 runs in parallel there) -- the sheet's back target changes only through the route handle in `app.tsx` and `surfaces/app-shell.tsx`; a JS `matchMedia` render switch (a press-time width check is allowed, commented); edits to `epics.md`, `sprint-status.yaml`, `tokens.css`, `components.css`; a redirect of `/arvore` (it stays reachable by URL).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior |
|---|---|---|
| Resume, pointer set | current Em campo card, `last_sheet` = live equipment block SEC-C05, 42 of 94 concluded | button "Continuar: SEC-C05 · 42 de 94" opens `/relatorio/:id/ficha/<SEC-C05 block>` |
| Resume, no pointer | no `last_sheet`, or it names a removed/unknown block | first equipment block in tree order (`treeNodes(locationTree(...))`) whose `sheetState` is `vazia` or `em_preenchimento` |
| Resume, nothing missing | no pointer, every sheet concluded or not tested | first equipment block in tree order |
| Resume, no sheet | relatório with no equipment block (or snapshot not loaded yet) | "Continuar" (no target text) opens the Sumário |
| Card counter | card whose relatório is on the device (`device.kind === 'on-device'`) | `.progress-counter[data-state]` "n de N fichas" (`fichasCountText`, `progressCounterState`); title aria-label gains it; summary-only cards show none |
| Voltar from a sheet, ≥768 px | App bar "Voltar" on `/relatorio/:id/ficha/:blockId` | Sumário with section 9 expanded whatever the status, path to that block revealed, its row's open button focused |
| Voltar from a sheet, <768 px | same, phone width | `/relatorio/:id/arvore` as today |
| Next section | section text of block B, a later Sumário row of kind `text` exists | sticky bar shows "Próxima seção" opening `/relatorio/:id/secao/<next>`; on the last one only "Voltar ao sumário" |
| Dates | "Novo relatório" opens | both dates = today (America/Sao_Paulo, `YYYY-MM-DD`); "Criar relatório" enabled once a template is set; typing a start still moves an untouched end |
| No instrument | setup Etapa 4, instrument registry empty | note "Nenhum instrumento cadastrado" + text button "Cadastrar instrumento" with `.btn-reason` "Abre Cadastros › Instrumentos"; press opens `/cadastros` on Instrumentos with a new-instrument panel open; "Fechar" (either close) returns to `/relatorio/:id/setup?etapa=4` (Etapa 4 heading focused); App bar "Voltar" there also returns |

</intent-contract>

## Code Map

- `packages/domain/src/home/cards.ts` -- `homeCards`; add optional `blocks` input and `HomeCard.counter: {text, state} | null`.
- `packages/domain/src/relatorio/progress.ts` -- `progress`, `fichasCountText`, `progressCounterText`, `progressCounterState` (reuse).
- `packages/domain/src/relatorio/tree.ts` -- `locationTree`, `treeNodes` (tree order, node `name` = TAG or type label, `state`); add `resumeTarget` here or in a new `relatorio/resume.ts`, exported from the package index.
- `packages/domain/src/relatorio/sumario.ts` -- `sumarioRows` row `kind: 'text'` (section 2/4/5/6); `sumarioOpensExpanded`; add `nextTextSection` (next block in Sumário order whose type is section_2, 4, 5 or 6, the set `section-text-surface.tsx` `EDITABLE_TYPES` opens).
- `packages/domain/src/format/datetime.ts` -- `DISPLAY_TIME_ZONE`; add `calendarDateOfInstant(now: Date): string` (`YYYY-MM-DD` in São Paulo).
- `apps/web/src/surfaces/home/relatorio-card.tsx` (lines 48-59 disabled Continuar), `home-surface.tsx` (loads rows via `useLiveQuery`, `openCard`); `db/home-store.ts` `blockRows`, `relatorioState`; `db/snapshot.ts`; `db/prefs.ts` `readLastSheet`.
- `apps/web/src/surfaces/relatorio/setup-surface.tsx` -- `onComplete` (~152), Etapa 4 (`Etapa4Instrumentos` ~569); `?etapa=` focus already handled (~104).
- `apps/web/src/surfaces/app-shell.tsx` (~81 `routeBack`, ~109 back press) and `apps/web/src/app.tsx` ficha route `handle.back` (`/arvore`).
- `apps/web/src/surfaces/relatorio/sumario-surface.tsx` (~115 `expanded`, `openedByStatus`, tree `expandToLastSheet`), `relatorio-tree.tsx` (~200-217 reveal + scroll, `blockRow`, `data-tree-open`, `RelatorioTreeHandle`).
- `apps/web/src/surfaces/relatorio/section-text-surface.tsx` (~201 sticky bar).
- `apps/web/src/surfaces/project/new-relatorio-dialog.tsx` (68-69 `start`/`end` null, 82-83 end follows start).
- `apps/web/src/surfaces/registries/registries-surface.tsx` (tab from pref), `instrumentos-tab.tsx` (`openId`, `InstrumentPanel onClose`).
- `apps/web/src/copy/pt-br.ts` -- `home.continue`, `home.notAvailableYet`, `setup.completeDone` ("Dados salvos"), `sectionText.voltarAoSumario`, `ficha.ensaios.noInstruments`/`registerInstrument`; mock copy for the band button: `mockups/prototype/screens/50-relatorio-setup.html:264`; card: `mockups/prototype/screens/20-home.html:41-53`.
- Tests to update: `e2e/home.spec.ts:122` (disabled Continuar), `apps/web/src/surfaces/home/home-surface.test.tsx`, `setup-surface.test.tsx`, dialog date tests; helper `e2e/support/relatorio-flow.ts` (`typeDate`, `createRelatorio`).

## Tasks & Acceptance

**Execution:**
- `packages/domain` -- add `resumeTarget(snapshot: Pick<RelatorioSnapshot,'locations'|'blocks'|'equipment'|'suggestions'>, lastSheetId: string | null): { blockId: string; text: string } | null` (text "⟨TAG or type⟩ · n de N" via `progressCounterText(progress(snapshot))`); `homeCards` `blocks?` input and `counter`; `nextTextSection(snapshot, blockId): string | null`; `calendarDateOfInstant`; unit tests for every matrix row.
- `relatorio-card.tsx` + `home-surface.tsx` -- live-read the current card's snapshot and `last_sheet`; render the counter; enabled "Continuar: <span class="tabular">…</span>" navigating to the target sheet (writing nothing new; the sheet writes the pref on mount), else the Sumário; drop the disabled reason and `notAvailableYet` if unused.
- `setup-surface.tsx` -- on a successful `onComplete` navigate to `/relatorio/:id` with state `{ openSection9: true }` and show toast "Dados salvos"; Etapa 4 empty-registry note and "Cadastrar instrumento" navigating to `/cadastros` with state `{ tab: 'instrumentos', newInstrument: true, returnTo: '/relatorio/:id/setup?etapa=4' }`.
- `registries-surface.tsx`, `instrumentos-tab.tsx` -- honour that state (tab selected, new panel open, `useBackTarget(returnTo)`, `onClose` navigates to `returnTo`).
- `app.tsx` + `app-shell.tsx` -- ficha route gains a wide-width back (`/relatorio/:id`, state `{ openSection9: true, focusBlockId }`), chosen at press time when `window.matchMedia('(min-width: 768px)').matches`; phone keeps `/arvore`.
- `sumario-surface.tsx` + `relatorio-tree.tsx` -- `openSection9` forces section 9 expanded and the reveal; `focusBlockId` reveals that block's path and focuses its `[data-tree-open]` after scroll.
- `section-text-surface.tsx` -- secondary "Próxima seção" (authored copy) before the primary "Voltar ao sumário" while `nextTextSection` is non-null.
- `new-relatorio-dialog.tsx` -- initial `start`/`end` = `calendarDateOfInstant(now())`.
- `e2e/journey-forward.spec.ts` (new) -- `@p0`: J0 at 768 (Continuar opens the last sheet in 1 tap; counter visible; after reload too); J5 at 768 from Home to the first sheet counting taps with no "Voltar" (dates prefilled, Etapa 4 "Cadastrar instrumento" round trip, Concluir lands on the Sumário with "Dados salvos" and section 9 open); Voltar from a sheet at 768 focuses the row, at 390 lands on the tree. `@p1`: no-pointer resume opens the first missing sheet; "Próxima seção" walks 2 → 4 → 5 → 6 and hides on the last. Each journey spec records its tap count with `test.info().annotations`. Update the existing tests listed in the Code Map.

**Acceptance Criteria:**
- Given an Em campo relatório on this device with a last sheet, when the user taps "Continuar: ⟨TAG⟩ · ⟨n⟩ de ⟨N⟩" on Home, then that sheet opens (J0 = 1 tap) and the card shows "⟨n⟩ de ⟨N⟩ fichas"; the disabled state and "Disponível em uma próxima etapa" are gone.
- Given setup with every gap filled, when the user taps "Concluir dados do relatório", then the Sumário opens with section 9 expanded and the toast "Dados salvos".
- Given a sheet at 768 or 1280 px, when the user taps App bar "Voltar", then the Sumário shows section 9 expanded with focus on that sheet's row; given 390 px, the tree surface opens.
- Given the section text of section 2, when it renders, then "Próxima seção" opens section 4, and on section 6 only "Voltar ao sumário" remains.
- Given the "Novo relatório" dialog, when it opens, then both dates show today and "Criar relatório" is enabled; typing another start moves the end.
- Given setup Etapa 4 with no instrument registered, when the user taps "Cadastrar instrumento", fills the code and taps "Fechar", then the app is back on Etapa 4 and the new instrument is listed.
- Given the whole J5 script at 768, when run by the spec, then it reaches the first sheet without any "Voltar" and records its tap count.

## Spec Change Log

## Review Triage Log

### 2026-09-25 — Review pass

Layers: Edge Case Hunter and Verification Gap Reviewer. Blind Hunter and Intent Alignment skipped (token economy; the integrated Epic 12 review covers them).

- verdicts: 14 findings — high 0, medium 6, low 6, false 2, maybe-false 0
- findings:
  - `[medium]` `[patch]` VG: `openSection9` arrival on a non-Em campo Sumário untested — add a Rascunho case in `sumario-surface.test.tsx`.
  - `[medium]` `[patch]` VG: Cadastros App bar "Voltar" back to setup untested — add the step to the journey spec.
  - `[low]` `[patch]` VG: "Próxima seção" covered only by an `@p1` e2e outside `verify` — add a surface unit case.
  - `[medium]` `[patch]` VG other / EC: `onPanelClose` fires on every instrument panel close (list rows, remove, archive) and bounces to setup — only the panel minted from `openNew` returns.
  - `[false]` `[reject]` VG other: uncommitted `relatorio-card.tsx` change — the orchestrator's own indentation fix, reviewed in the working-tree diff on purpose.
  - `[low]` `[patch]` EC: `openNew` re-mints a blank panel whenever the Instrumentos tab remounts — consume the entry once (grouped with the row above).
  - `[low]` `[reject]` EC: a changed `currentId` while the resume query is pending could keep the old target — needs two Em campo relatórios swapping the current card within one live-query tick; guard adds surface for a case not met in everyday use.
  - `[low]` `[patch]` EC: on-device cards flash "0 de 0 fichas" before the blocks query resolves — pass `blocks: undefined` until loaded.
  - `[low]` `[reject]` EC: "Continuar" pressed before the resume query resolves opens the Sumário — the window is one local IndexedDB read; a pending state adds complexity.
  - `[low]` `[reject]` EC: focus stays pending if the revealed row never renders — reveal renders the row in the same commit; only a collapse within that commit reaches it.
  - `[medium]` `[patch]` EC: arrival state persists in history (reload or browser back re-forces section 9 and focus; `/cadastros` reopens a new panel and bounces to setup) — clear it with a replace after reading.
  - `[medium]` `[patch]` EC: same root cause on `/cadastros` (grouped with the row above).
  - `[false]` `[reject]` EC: `resumeTarget`'s "n de N" counts blocks the tree does not draw — it is `progress(snapshot)`, the same count the Sumário header and Project row show; blocks under removed locations are removed with them.
  - `[medium]` `[patch]` EC: `onPanelClose` fires on every panel close (the same defect as the VG other row, reported by both layers; shares its route and fix).

## Design Notes

- Narrowings: "Cadastrar instrumento" opens the new-instrument panel directly (one tap fewer than the tab alone); `/arvore` stays routable at every width, it just stops being the sheet's back destination with a rail; "Próxima seção" is secondary so "Voltar ao sumário" keeps its primary place until Story 12.5 restyles the bar.
- Open questions (kept conservative): Continuar with every sheet done opens the first sheet; the counter appears only on cards whose relatório is on the device.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:unit` -- expected: green.
- `docker compose --profile tools run --rm tools pnpm exec playwright test e2e/journey-forward.spec.ts e2e/home.spec.ts --project=desktop-chrome` -- expected: green, J0 and J5 annotations printed.
- `docker compose --profile tools run --rm tools pnpm verify` -- expected: green.
