---
title: 'Registries: one-row tab selector on phone'
type: 'bugfix'
created: '2026-09-22'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: '231eb2ce0ed58cdd13fbdb9eeaeff653e34aa844'
dev_model: 'sonnet'
dev_effort: 'medium'
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      The CSS `:has()` selector this fix relies on (`.registry-main:has(.registry-list,
      .home-empty) > .section-note`) has no documented minimum browser target for the
      project.
    evidence: |-
      Pre-existing pattern, not introduced by this story: `apps/web/src/styles/components.css:238`
      already uses `:has()`. Support is broad but not universal (Safari 15.4+, Chrome 105+,
      Firefox 121+); on an unsupported browser the rule simply does not match and
      `.section-note` falls back to DOM order (before the toolbar/list) with no visible
      error. Settling this needs a project-wide browserslist/minimum-support decision,
      which is outside this story's scope.
    location: >-
      apps/web/src/styles/app.css:174
    severity: low (unverified)
---

<intent-contract>

## Intent

**Problem:** On phone (<768px) the Registries six-tab strip (`apps/web/src/components/tabs.tsx`, used only by `apps/web/src/surfaces/registries/registries-surface.tsx`) wraps to three rows, and each list tab (Instrumentos, Clientes, Fabricantes, Classes de tensão) stacks a "Novo X" button, a `.section-note` helper paragraph, then the list — together leaving almost no room for the list itself. Story 2.1's AC only required wrap-never-scroll; it never required all six tabs visible at once.

**Approach:** Below 768px, replace the wrapping `tablist` with a one-row selector: a button showing the current tab's name (its accessible name too) that opens a menu of the six tabs (arrow keys, Esc closes and returns focus, selection announced) built from the same `react-aria-components` primitives `OverflowMenu` already uses (`MenuTrigger`/`Menu`/`Popover`) — never a JS `matchMedia` breakpoint switch (Boundaries, see `registry-picker-field.tsx` comment); both the existing `TabList` and the new selector stay mounted, CSS (`display:none` in the matching `@media` block) shows exactly one, so assistive tech only ever sees one. At 768px+, the existing `tablist`/`tab`/`tabpanel` is untouched. Separately, reorder `.section-note` after `.registry-list`/`.home-empty` at phone width with a pure CSS flex `order` change scoped to `.registry-main`, so it applies once to every tab using that shared class structure (no per-tab-file edits).

## Boundaries & Constraints

**Always:** Selection still goes through the existing `onSelectionChange`/`writeRegistryTab` (Dexie `local_prefs`) path unchanged. The phone selector's trigger accessible name equals the current tab's visible label (`copy.registries.tab*`), matching visible text. Reuse `MenuTrigger`/`Menu`/`Popover`/`Button` from `react-aria-components` (already a project dependency, same library `tabs.tsx`, `overflow-menu.tsx`, `combobox.tsx` use) — no new dialog/overlay primitive. Breakpoint is the project's `768px` convention (`@media (max-width: 767.98px)` / `(min-width: 768px)`, see `app.css` header comment).

**Never:** Do not touch `apps/web/src/surfaces/registries/empresa-tab.tsx` or any instrument-certificate code in `instrument-panel.tsx`/`instrumentos-tab.tsx` beyond what this fix needs (parallel Stories 2.2/2.3 own those). Do not add a JS `matchMedia`/`resize` listener for the breakpoint switch. Do not change the >=768px tab strip's markup, classes, or behavior. Do not rewrite `.section-note` copy or move it in per-tab `.tsx` files — the reorder is CSS-only via the shared `.registry-main`/`.registry-toolbar`/`.registry-list`/`.home-empty`/`.section-note` classes already common to `instrumentos-tab.tsx`, `clientes-tab.tsx`, `word-registry-tab.tsx` (fabricantes/classes-tensao).

</intent-contract>

## Code Map

- `apps/web/src/components/tabs.tsx` -- add the phone selector as a sibling of the existing `TabList` inside `<AriaTabs>`; new component (in this file or a new `tab-select-menu.tsx` beside it) using `MenuTrigger`/`Button`/`Menu`/`MenuItem`/`Popover`, `selectionMode="single"` with `selectedKeys={new Set([selectedId])}` so the current item is marked (announced) inside the menu; `onAction` calls the existing `onSelectionChange` prop. Give the desktop `TabList` and the new wrapper distinct classes (e.g. `tabs-desktop` / `tabs-phone`) for the CSS switch.
- `apps/web/src/components/tabs.test.tsx` -- existing test asserts `tablist`/6 `tab`s; keep passing. Add a unit test for the phone selector: trigger's accessible name is the current tab label, opening it shows a menu/listbox with the six labels, arrow keys move, Esc closes and returns focus to the trigger, choosing an item calls `onSelectionChange` and the trigger's accessible name updates to the new label.
- `apps/web/src/styles/components.css` (near `.tabs`/`.tab`, ~L751-755) or `app.css` -- new rules: `@media (max-width: 767.98px) { .tabs-desktop { display: none; } }` and `@media (min-width: 768px) { .tabs-phone { display: none; } }`; style the phone trigger/menu with existing `.overflow-trigger`/`.overflow-menu`/`.menu-item`-style classes (reuse, don't invent new tokens) sized to occupy one row (`.touch-field`/`--touch-min` per existing conventions).
- `apps/web/src/styles/app.css` (Phone block, ~L116-117 section) -- add, scoped to `@media (max-width: 767.98px)`: `.registry-main { display: flex; flex-direction: column; }`, `.registry-toolbar { order: 1; }`, `.registry-list, .home-empty { order: 2; }`, `.registry-main > .section-note { order: 3; }`. Verify this doesn't visually disturb `criterios-tab.tsx` (note above a `<table>`, no toolbar/list -- default `order:0` on both keeps DOM order) or `registry-tab-placeholder.tsx` (heading + note only).
- `apps/web/src/copy/ui.ts` -- add a small copy key only if the trigger needs an `aria-haspopup`/description beyond the tab name itself (Boundaries: accessible name must still equal the tab label, not a generic string).
- `e2e/cadastros.spec.ts` (existing `@p0 2.1-E2E-001` at ~L141 already checks `tablist` + 6 `tab`s at default desktop viewport) -- add a new `@p2` test: `page.setViewportSize({ width: 390, height: 844 })`, navigate to `/cadastros`, assert `getByRole('tablist')` is not visible (or not present) and exactly one control exposing the current tab name is visible, open it, choose a different tab, assert the panel changes and the trigger's name updates. Add/extend a check at `width: 768` confirming the six-tab `tablist` is visible there (existing @p0 test already covers the default ~1280 case).

## Tasks & Acceptance

**Execution:**
- `apps/web/src/components/tabs.tsx` -- add phone `MenuTrigger` selector alongside `TabList`, both driven by the same `selectedId`/`onSelectionChange` -- delivers AC1-AC3.
- `apps/web/src/styles/components.css`/`app.css` -- `.tabs-desktop`/`.tabs-phone` breakpoint switch + one-row trigger styling -- delivers AC1, AC4.
- `apps/web/src/styles/app.css` -- `.registry-main` phone `order` rules for the toolbar/list/note stack -- delivers AC5.
- `apps/web/src/components/tabs.test.tsx` -- keyboard/screen-reader unit coverage -- delivers AC2, AC3.
- `e2e/cadastros.spec.ts` -- phone (390) one-row/one-control test and 768+ tablist test -- delivers AC1, AC4.

**Acceptance Criteria:**
- AC1: Given the Registries surface at <768px, when it renders, then no `tablist` is exposed and exactly one control (accessible name = current tab's label) is visible, occupying a single row.
- AC2: Given the phone selector is focused, when Enter/Space opens it, then a menu/listbox of the six tab labels appears; arrow keys move focus among them, Esc closes it and returns focus to the trigger control.
- AC3: Given the phone selector's menu is open, when a different tab is chosen, then the corresponding panel renders, `writeRegistryTab` persists the selection in Dexie `local_prefs` exactly as before, and the trigger's accessible name updates to the newly selected tab's label.
- AC4: Given the Registries surface at >=768px, when it renders, then the six tabs are exposed as a `tablist`/`tab`/`tabpanel` exactly as today (no visual or behavioral change).
- AC5: Given a phone-width list tab (Instrumentos/Clientes/Fabricantes/Classes de tensão) with its "Novo X" button, when the tab renders, then the button is followed immediately by the list (or its empty state), with the helper paragraph appearing after it, not between the button and the list.

## Review Triage Log

### 2026-09-22 — Review pass
- verdicts: 8 findings — high 0, medium 3, low 4, false 0, maybe-false 1
- findings:
  - `[medium]` `[patch]` AC5 (helper-paragraph reorder to after the list/empty-state on phone) has no automated proof, and the spec's own Code Map instruction to verify Critérios/Empresa placeholder are undisturbed is undischarged — action: add e2e assertions in `e2e/cadastros.spec.ts` proving DOM/visual order at 390px for a list tab and confirming Critérios keeps its current (unreordered) layout.
  - `[low]` `[patch]` same root cause as above, grouped — Empresa placeholder's order at phone width also unproven — action: covered by the same e2e addition above.
  - `[low]` `[patch]` AC2's "Enter/Space opens it" path is untested (existing test only opens the menu via mouse click) — action: add a keyboard-open case to `tabs.test.tsx`.
  - `[low]` `[patch]` AC3's Dexie `local_prefs` persistence for a phone-originated selection is not re-verified (only the panel/trigger-label update is asserted) — action: extend the new 390px e2e test with a page reload confirming the selection survived.
  - `[medium]` `[patch]` The phone trigger (`.tab-select-trigger`) has no visual disclosure affordance, unlike every other menu/combobox trigger in this codebase (`.overflow-trigger`'s dot icon, `.combobox-chevron`) — action: add a small chevron-down icon after the label.
  - `[low]` `[patch]` `.tab-select-trigger` lacks the `white-space: nowrap` guard `.tab` has, leaving AC1's "single row" claim undefended for a longer label/narrower device — action: add `white-space: nowrap` (trivial one-line fix).
  - `[maybe-false]` `[defer]` `:has()` selector browser support has no documented project minimum — pre-existing pattern already used at `components.css:238` before this diff, not introduced by this story; an app-wide browserslist decision is out of this story's scope.
  - `[low]` `[reject]` An empty `items` array would leave the phone trigger with no accessible name — currently unreachable: `Tabs` has exactly one caller (`RegistriesSurface`) passing a fixed 6-item array, and guarding it would add unused branching for a path nothing can reach today.

## Design Notes

The phone selector deliberately reuses `MenuTrigger`/`Menu`/`Popover` (the exact primitives behind `OverflowMenu`) rather than react-aria-components' `Select`, so the codebase keeps one menu/overlay idiom; `selectionMode="single"` on `Menu` renders `menuitemradio` items with `aria-checked`, giving "selected tab is announced" for free without extra live-region wiring. Both the `TabList` and the phone selector stay permanently mounted (CSS `display:none` hides one), consistent with `RegistryPickerField`'s existing chip-row/combobox CSS-only switch -- this project's established Boundary against JS `matchMedia` for responsive branching.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm --filter @app/web test -- tabs` -- expected: new/updated `tabs.test.tsx` cases pass.
- `docker compose --profile tools run --rm tools pnpm verify` -- expected: green (lint, typecheck, unit, build).
- `docker compose --profile tools run --rm tools pnpm exec playwright test cadastros --project desktop-chrome` (run from the repo root -- `playwright.config.ts`/`e2e/` live there, not under `apps/web`) -- expected: all `cadastros.spec.ts` tests, including the new phone/768 ones, pass.

**Manual checks (if no CLI):**
- Real-browser pass at 390, 768, 1280px, light and dark, keyboard-only: confirm one-row selector on phone, unchanged tablist at 768/1280, visible focus throughout, no sideways overflow, helper paragraph position per AC5.

## Auto Run Result

Status: done

**Summary:** Below 768px, `Tabs` (`apps/web/src/components/tabs.tsx`) now renders a one-row phone selector (`MenuTrigger`/`Menu`/`Popover`, same primitives as `OverflowMenu`) alongside the existing `tablist`, with CSS alone (`app.css`) showing exactly one per viewport — never a JS `matchMedia` switch. The trigger's accessible name is the current tab's label with a chevron disclosure icon (reusing `Combobox`'s chevron markup). On phone, `.registry-main`'s toolbar/list/empty-state/note are reordered via flex `order`, scoped with `:has()` so Critérios (table, no list) and the Empresa placeholder are unaffected.

**Files changed:**
- `apps/web/src/components/tabs.tsx` -- phone `MenuTrigger` selector, `tabs-desktop`/`tabs-phone` classes, chevron icon.
- `apps/web/src/styles/app.css` -- breakpoint switch CSS, `.tab-select-trigger` styling, `.registry-main` phone reorder rules.
- `apps/web/src/components/tabs.test.tsx` -- phone selector keyboard/menu/announce coverage, incl. Enter/Space open.
- `apps/web/src/components/gallery.test.tsx` -- added `tab-select-trigger` to the hit-area class allowlist.
- `e2e/cadastros.spec.ts` -- three new `@p2` tests: phone selector behavior + AC5 order + AC3 reload persistence (`tabs-phone-selector-001`), 768px tablist exposure (`tabs-phone-selector-002`), Critérios order unaffected (`tabs-phone-selector-003`); fixed one pre-existing assertion (`getByRole('menu', {name: 'Cadastros'})` -> `{name: 'Instrumentos'}`, matching React Aria's actual trigger-derived menu name).

**Review findings breakdown:** One combined internal review pass (lean mode), 8 findings triaged (0 high, 3 medium, 4 low, 1 maybe-false) -- see `## Review Triage Log`. 6 routed to `patch` (all applied: AC5/AC2/AC3 test-coverage gaps, missing chevron affordance, missing `white-space: nowrap`). 1 `defer` (pre-existing `:has()` browser-support gap, not introduced by this story). 1 `reject` (empty-`items`-array edge case, currently unreachable -- `Tabs` has one caller with a fixed 6-item array).

**Follow-up review recommendation:** false. All patched findings were medium/low, none high; no follow-up pass warranted.

**Verification performed:** `pnpm --filter @app/web test -- tabs` (464 unit tests green), full `pnpm verify` (lint, static, unit, api, e2e @p0 -- 20/20 e2e green) run twice (before and after patches), full `cadastros.spec.ts` suite run directly (16/16 green, including all three new phone-selector tests). One transient e2e flake (`2.5-E2E-002`, unrelated file) reproduced only under `--repeat-each 3` stress (shared-company IndexedDB state across repeats within one browser run) and not on any normal single-pass run -- pre-existing test-isolation characteristic, not a regression from this diff.

**Residual risks:** None blocking. The deferred `:has()` browser-support item is low severity and pre-existing.
