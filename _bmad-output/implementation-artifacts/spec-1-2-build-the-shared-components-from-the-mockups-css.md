---
title: "Build the shared components from the mockups' CSS"
type: 'feature'
created: '2026-09-21'
status: 'done'
baseline_commit: '7789990'
baseline_revision: '7789990ad903049765d2d92a7ef09fb98eaa64f9'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-fasor-2026-09-21/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/mockups/MOCK-GUIDE.md'
  - '{project-root}/apps/web/src/styles/tokens.css'
  - '{project-root}/apps/web/src/styles/components.css'
  - '{project-root}/AGENTS.md'
dev_model: 'sonnet'
dev_effort: 'high'
warnings: ['oversized']
deferred:
  - summary: >-
      Toggle, Checkbox, SegmentedControl and the grouped FilterChipGroup never visually show
      their selected/on fill in a real browser.
    evidence: |-
      components.css keys the "on"/checked/selected look to a DOM shape where the styled,
      visible element itself carries aria-checked/aria-pressed. React Aria Components
      correctly puts that state on a hidden native input nested inside the styled label
      instead (verified with axe: putting aria-checked/aria-pressed on the styled element
      directly is an aria-allowed-attr violation once role=switch/radio is set). All four
      controls are keyboard- and screen-reader-correct and pass a zero-violation axe scan,
      but their fill never engages. Resolving it needs a components.css/DESIGN.md decision
      (new selectors for this DOM shape, e.g. targeting the sibling native input's state, or
      accepting the current data-selected-driven look as canonical) that is outside this
      story's authority (Boundaries: no new classes in components.css).
    location: >-
      apps/web/src/components/toggle.tsx, checkbox.tsx, segmented-control.tsx, chip.tsx
    severity: medium
  - summary: >-
      The ≥48px/56px hit-area and the 14px typography-floor acceptance criteria are verified
      only against CSS custom-property values and class-name presence, not a measured
      rendered box size or computed font-size.
    evidence: |-
      jsdom has no layout engine and does not resolve var() through getComputedStyle, so no
      test in this diff can read an actual rendered pixel size. A components.css regression
      that shrinks a shared control's hit area or a typography class's font-size below the
      stated floor would not be caught by pnpm verify today. Settling it needs a real-browser
      (Playwright) component-level layout test tier for apps/web, which does not exist yet.
    location: >-
      apps/web/src/components/gallery.test.tsx, button.test.tsx
    severity: medium (unverified)
  - summary: >-
      _bmad/custom/config.toml gained [core] communication_language and [modules.bmm]
      user_skill_level keys, unrelated to this story's application code.
    evidence: |-
      This is an orchestration-level fix, not a code change for the story: render_skill.py
      HALTed with "missing config value `communication_language`" before any planning could
      start, blocking this and every future build-auto run in this repo. Left in place
      deliberately; reverting it would re-break the pipeline for the next story too.
    location: >-
      _bmad/custom/config.toml
    severity: low
---

<intent-contract>

## Intent

**Problem:** `apps/web/src/styles/{tokens.css,components.css}` exist (Story 1.1) but no React component built on them exists yet. Every future UI story would otherwise restyle from scratch, drifting from the mockups.

**Approach:** Build the shared component library in `apps/web/src/components` on top of the existing CSS classes, with React Aria Components supplying accessible behavior and one `className`/render-prop mapping helper per component translating React Aria state into the mockups' `.is-*` classes and `[data-state]`/`[aria-*]` selectors — never a second styling vocabulary. Also scaffold the shared touch/stylus input layer (`apps/web/src/input`) and the minimal pt-BR copy these components need (`apps/web/src/copy`).

## Boundaries & Constraints

**Always:** Build only from the exact classes already in `tokens.css`/`components.css` (never invent a class or inline style for anything the CSS already covers). Disabled controls use `aria-disabled` + a mandatory adjacent reason wired by `aria-describedby` — never React Aria's `isDisabled` (it strips tab order and hides the reason). Destructive actions are always outline red (`.btn-destructive`, `--nao-conforme` border), never a red fill. `data-theme` is read/set only on `<html>` (the root) — every alias token lives under the `:root, [data-theme]` selector already, so nothing may re-declare a component alias scoped to an inner element. Every tappable element ≥48×48px, field controls ≥56px (already true of the CSS; components must not shrink the hit area with wrapper padding/margins). State glyphs are `aria-hidden`; the word is always the accessible text. `lang="pt-BR"` stays on `<html>` (already set). No emoji, no product logo, no Tailwind, no themed component kit.

**Never:** No theme-switcher UI or persisted theme preference (Account, Story 1.6) — only prove tokens resolve correctly when `data-theme` is set. No sign-in, sync, or domain logic. No screen assembly (Home/Login/etc. — later stories); this story only builds the parts and a component-gallery test harness. No new class names in `components.css`/`tokens.css` — if a state this story needs has no existing selector, use the closest existing one and note the gap in Design Notes rather than inventing CSS. No drag-to-reorder behavior in the input layer (that is Block card, a later epic) — only `touch-action`, pointer-type branching and a `usePressAndHold` primitive.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Dark theme token resolution | `<html data-theme="dark">`, render a component using a `--suggestion-field-*` alias | Computed style resolves the dark hex chain (e.g. `--fora-do-limite`/`--fora-do-limite-fill` dark values), contrast of ink vs. its own fill ≥ 4.5:1 | Test fails loudly if resolved color is the light value or contrast < 4.5:1 |
| Button disabled | `Button` rendered with `isDisabled`-equivalent prop + `reason` text | Renders `aria-disabled="true"`, `.is-disabled`/40% opacity, stays in tab order, a sibling reason node linked via `aria-describedby` | Omitting `reason` on a disabled button throws in dev (component-level invariant) |
| Overflow menu open/close | Trigger tapped, then Esc | Menu opens with `aria-expanded="true"`, destructive item last inside its `.menu-group`, Esc closes and returns focus to the trigger | N/A |
| Confirm dialog open | Dialog opened via trigger | `role="dialog" aria-modal="true"`, labelled + described, initial focus on the Cancelar action, Esc/back closes and returns focus | N/A |
| Status pill unknown status | `StatusPill` given a status outside rascunho/em-campo/em-revisao/emitido | Component throws at the type level (TypeScript union), no silent fallback ink | Compile-time only |
| Chip row overflow | Many chips in one `.chip-row` | Wraps to multiple lines with 8px gaps, never `overflow-x: scroll` | N/A |
| Reduced motion | `prefers-reduced-motion: reduce` | Any animation this story touches (e.g. dictation-style pulses, if reused) is disabled per the existing `components.css` media rule | N/A |
| Text zoom 200% | Browser zoom to 200% | No component clips or truncates its text irrecoverably; the gallery test asserts no `overflow: hidden` clipping on label text nodes | N/A |

</intent-contract>

## Code Map

- `apps/web/src/styles/tokens.css` -- read-only source of truth: typography ramp classes `.t-display/.t-title/.t-heading/.t-body/.t-field-input/.t-value/.t-label/.t-meta` (14px floor on label/meta), base color tokens under `:root, [data-theme="light"]` + `[data-theme="dark"]` + `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])`, component alias tokens (`--suggestion-field-*`, `--fora-do-limite*`, etc.) under `:root, [data-theme]` so they re-resolve wherever `data-theme` is set.
- `apps/web/src/styles/components.css` -- read-only source of truth for every component class below (`.btn*`, `.status-pill`, `.overflow-*`, `.menu-*`, `.confirm-dialog`, `.dialog-*`, `.chip*`, `.toggle*`, `.checkbox`, `.segmented`, `.seg`, `.tabs`, `.tab`, `.combobox*`, `.field`, `.input`, focus rules on `.input`/`:focus-visible`).
- `apps/web/src/app.tsx`, `apps/web/index.html` -- root already has `<html lang="pt-BR">`; no `data-theme` attribute exists yet -- read for how to wire a gallery route without touching real screens.
- `apps/web/package.json`, `apps/web/vite.config.ts` -- add `@testing-library/react`, `@testing-library/dom`, `jsdom` and an axe runner (e.g. `axe-core` + a thin wrapper, or `vitest-axe` if compatible with Vitest 5) to devDependencies; add `test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'] }` to `vite.config.ts` (currently has no `test` block, so Vitest 5 defaults to node env, which cannot render React components: DOM APIs are absent).
- `docker-compose.yml` `install` service -- runs `pnpm install --frozen-lockfile`; after editing `package.json`, run `docker compose run --rm install pnpm install` (not `--frozen-lockfile`) once to regenerate `pnpm-lock.yaml`, then it stays frozen again.
- `apps/web/src/input/` -- new: shared touch/stylus layer (AD-23). Two files: `touch-action.ts` (small helpers/constants for `touch-action` per interactive element) and `use-press-and-hold.ts` (pointer-type-aware press-and-hold hook, ~300ms threshold, no swipe, no hover-only trigger). Not wired into any component's drag behavior this story (no drag exists yet) — only exported and unit-tested in isolation, ready for later stories.
- `apps/web/src/copy/ui.ts` -- new: the minimal pt-BR strings the shared components themselves own (Toggle "Ativado"/"Desativado"/"Sempre", default Confirm dialog Cancelar label, Overflow menu `aria-label` template "Mais opções de {name}"). Every other screen's copy is out of scope (later stories own their own strings from this same module going forward).
- `apps/web/src/components/*.tsx` -- new, one file per component (see Tasks). Each wraps the matching `react-aria-components` primitive, has zero inline styles, and maps state to the exact classes/attributes from `components.css` via one local `className`/render-prop helper.
- `apps/web/src/components/index.ts` -- new barrel export.
- `apps/web/src/components/*.test.tsx` -- new, one test per component file (render + state-to-class mapping + hit-area + disabled/reason wiring where applicable).
- `apps/web/src/components/gallery.test.tsx` -- new: renders every component once in both `data-theme="light"` and `data-theme="dark"`, runs axe against the rendered tree (0 WCAG 2.2 AA violations), and asserts the Suggestion amber contrast ≥ 4.5:1 in both themes.

## Tasks & Acceptance

**Execution:**
- `apps/web/package.json`, `apps/web/vite.config.ts`, `pnpm-lock.yaml` -- add jsdom + React Testing Library + an axe runner as devDependencies and a jsdom Vitest environment -- component tests need a DOM
- `apps/web/src/test-setup.ts` -- Testing Library `cleanup` + `@testing-library/jest-dom`-equivalent matchers (or Vitest's own `expect.extend` if that dependency is skipped) -- shared test setup
- `apps/web/src/input/touch-action.ts` -- per-element `touch-action` constants/helpers -- AD-23 shared input layer
- `apps/web/src/input/use-press-and-hold.ts` -- pointer-type-aware press-and-hold hook, ~300ms, no swipe/hover-only -- AD-23, UX-DR5/NFR-3
- `apps/web/src/copy/ui.ts` -- Toggle/Confirm-dialog/Overflow-menu pt-BR strings -- UX-DR75, single copy module
- `apps/web/src/components/button.tsx` -- `Button` (primary/secondary/destructive via `react-aria-components` `Button`) + `TextButton` (`.btn-text`, optional `tone="red"`) -- UX-DR3, disabled+reason contract
- `apps/web/src/components/status-pill.tsx` -- `StatusPill` mapping `rascunho|em-campo|em-revisao|emitido` to `.status-pill[data-status]` ink -- UX-DR4
- `apps/web/src/components/overflow-menu.tsx` -- `OverflowMenu` on React Aria `MenuTrigger`/`Menu`, `.overflow-trigger`/`.overflow-menu`/`.menu-item`/`.menu-group`, destructive item last, Esc returns focus -- UX-DR9
- `apps/web/src/components/confirm-dialog.tsx` -- `ConfirmDialog` on React Aria `Dialog`/`Modal`, `.confirm-dialog`/`.dialog-actions`, verb-labeled confirm button, initial focus on Cancelar, destructive variant uses `.btn-destructive` -- UX-DR14
- `apps/web/src/components/chip.tsx` -- `Chip` and `FilterChip` on `.chip`/`aria-pressed`, chip row wraps with 8px gap, filter group keeps exactly one pressed -- UX-DR15/UX-DR32
- `apps/web/src/components/toggle.tsx` -- `Toggle` on React Aria `Switch`, `.toggle`/`.track`/`.knob`, `.toggle-word` carries the accessible state text, `locked` variant reads "Sempre" -- UX-DR5
- `apps/web/src/components/checkbox.tsx` -- `Checkbox` on React Aria `Checkbox`, 56px full-row hit area, `.box`/`.ico` -- NFR-3
- `apps/web/src/components/segmented-control.tsx` -- `SegmentedControl` on React Aria `RadioGroup`/`Radio`, `.segmented`/`.seg[aria-checked]` -- NFR-3
- `apps/web/src/components/tabs.tsx` -- `Tabs` on React Aria `Tabs`/`TabList`/`Tab`, `.tabs` wraps to a second line, never horizontal-scroll -- UX-DR59
- `apps/web/src/components/combobox.tsx` -- `Combobox` shell on React Aria `ComboBox`, `.field.combobox`/`.input`/`.combobox-chevron`/`.combobox-list`/`.combobox-option`, trailing "Criar…" option last -- shell only, no domain wiring
- `apps/web/src/components/index.ts` -- barrel export of all of the above
- `apps/web/src/components/gallery.test.tsx` -- renders the whole set under `data-theme="light"` and `data-theme="dark"`, axe scan (0 AA violations), Suggestion-amber contrast assertion ≥ 4.5:1 both themes, typography ramp assertion (computed `font-size` per `.t-*` class, none below 14px)

**Acceptance Criteria:**
- Given `tokens.css`/`components.css` and DESIGN.md, when the shared components render, then light and dark token sets resolve via `data-theme` on `<html>`, the Suggestion amber test passes contrast ≥ 4.5:1 in both themes, the typography classes apply with nothing below 14px, and units render in a separate slot beside numeric values (verified on `Chip`/`StatusPill` or a `.t-value` usage in the gallery).
- Given Button, Text button, Status pill, Overflow menu, Confirm dialog, Chip/Filter chip, Toggle, Checkbox, Segmented control, Tabs and Combobox shell, when they render, then every tappable element measures ≥48×48px (≥56px for field controls), disabled controls carry `aria-disabled` + a linked reason and remain focusable, destructive controls are outline red never filled, the Overflow menu keeps the destructive item last with Esc/arrow navigation, the Confirm dialog states one sentence with initial focus on Cancelar, Status pill inks match rascunho/em-campo/em-revisao/emitido exactly, and chip rows wrap without horizontal scroll.
- Given focus and input handling, when a control is focused, then inputs show `focus-fill` + 3px `focus` border and non-inputs show a 3px ring with 2px offset, and `apps/web/src/input` exposes `touch-action` handling and a press-and-hold primitive with no hover-only affordance and no swipe.
- Given the accessibility floor, when the gallery is audited, then `lang="pt-BR"` holds, dialogs are `role="dialog"`/`aria-modal` with trapped/returned focus, state glyphs are `aria-hidden`, `prefers-reduced-motion` disables the animations this story touches, and axe reports zero WCAG 2.2 AA violations.
- Given the mockup reference rule, when any shared component is built, then it uses the mockups' own class names verbatim (cited above) and its fixed strings come from `apps/web/src/copy/ui.ts`.

## Spec Change Log

## Review Triage Log

### 2026-09-21 — Review pass
- verdicts: 35 findings — high 0, medium 15, low 12, false 3, maybe-false 0
- findings:
  - `[medium]` `[defer]` Toggle/Checkbox/SegmentedControl/grouped-FilterChip never visually show their selected/on fill: `components.css` has no selector for React Aria's correct DOM shape (state on a hidden native input, not the styled label) (Blind Hunter) — real, verified against `toggle.tsx`/`checkbox.tsx`/`segmented-control.tsx`/`chip.tsx`; fixing it needs a `components.css`/DESIGN.md change outside this story's authority (Boundaries forbid new classes); tracked in `deferred` below.
  - `[low]` `[reject]` Spec's Design Notes didn't originally mention the Toggle/Checkbox/SegmentedControl gap (Blind Hunter) — fix is a spec-prose edit only; corrected directly as documentation hygiene (see Design Notes above), no code or process change needed.
  - `[low]` `[reject]` Spec's Design Notes text about the FilterChip gap read as if `.chip[aria-pressed]` covered the grouped case too, contradicted by `chip.tsx`'s own comment (Blind Hunter) — fix is a spec-prose edit only; corrected directly above.
  - `[medium]` `[defer]` The CSS gaps above weren't tracked anywhere machine-readable (Blind Hunter) — grouped with the finding above; resolved by the `deferred` entry below.
  - `[medium]` `[patch]` `OverflowMenu` passes React Aria's real `isDisabled` into `MenuItem`, violating the story's own "never `isDisabled`" rule, with no reason wiring (Blind Hunter) — verified at `overflow-menu.tsx:41,53`; not required by the AC (no mockup shows a disabled overflow-menu item), so the smallest correct fix is to drop the unrequested `isDisabled` field from `OverflowMenuAction` rather than build a new reason-adjacent pattern for menus. Applied: `isDisabled` removed from `OverflowMenuAction` and both `MenuItem` renders.
  - `[medium]` `[patch]` `Combobox`'s disabled reason (`.btn-reason` span) isn't wired via `aria-describedby`, unlike `Button`/`TextButton` (Blind Hunter) — verified at `combobox.tsx:90`; fix: give the span an `id` and reference it from the field. Applied: `useId()` reason id added, `Input` now carries `aria-describedby` pointing to it.
  - `[low]` `[reject]` `Combobox`'s "Criar…" option shows even when the typed text exactly matches an existing option (Blind Hunter) — the spec explicitly scopes `Combobox` as "shell only: neither writes the registry nor filters," which covers this too; not a defect against the stated intent.
  - `[medium]` `[patch]` `Combobox`'s disabled-without-reason invariant (mirrors `Button`'s) has no test (Blind Hunter) — grouped with the Verification Gap layer's equivalent finding below; one patch covers both. Applied: throw-test added to `combobox.test.tsx`.
  - `[medium]` `[patch]` `gallery.test.tsx`'s hit-area and label-clipping loops, and the axe scans, never open `OverflowMenu`'s menu or `ConfirmDialog`'s dialog, so those components' actual overlay content is never exercised — the loops vacuously pass (Blind Hunter) — verified: neither is triggered open anywhere in `Gallery`, and neither `overflow-menu.test.tsx` nor `confirm-dialog.test.tsx` runs axe on its open state either. Applied: `gallery.test.tsx` now opens the Overflow menu and the Confirm dialog (one at a time) and re-runs the axe/hit-area/clipping checks against each open state.
  - `[medium]` `[patch]` `usePressAndHold` never tracks `pointerId` or calls `setPointerCapture`, so a second pointer down mid-hold silently overwrites the first session (no `onCancel`), and a mouse/pen hold-then-drag outside the element's bounds never receives further events, leaving `isHolding` stuck `true` (Blind Hunter) — verified at `use-press-and-hold.ts:61-101`; grouped with the Edge Case layer's matching finding. Applied: `startRef` now stores `pointerId`, all handlers ignore events from a non-matching pointer, and `setPointerCapture`/`releasePointerCapture` are called (best-effort, try/catch) on down/up-cancel-leave; two new tests in `use-press-and-hold.test.ts`.
  - `[low]` `[reject]` `@types/jest-axe` alongside the hand-written `src/jest-axe.d.ts` (Blind Hunter) — no functional conflict (different matcher namespaces, Jest's global vs. Vitest's module augmentation); harmless redundancy, not worth a patch cycle.
  - `[low]` `[reject]` Acceptance Criteria states disabled+reason coverage as if it applied to all eleven listed components, but only `Button`/`TextButton`/`Combobox` implement it (Blind Hunter) — fix is a spec-wording edit; the current scoping (only components where the mockups show a disabled variant) is a reasonable, deliberate reading, not a code defect.
  - `[low]` `[patch]` `Button`/`TextButton` overwrite a caller-supplied `aria-describedby` instead of merging it with the reason id when `isDisabled`+`disabledReason` (Edge Case Hunter) — verified at `button.tsx:47,88` (a ternary, not a merge); trivial one-line fix in both places. Applied: a `mergeDescribedBy()` helper joins both ids.
  - `[low]` `[patch]` `Button`/`TextButton`, same finding restated for the second call site (Edge Case Hunter) — same fix as above. Applied: same `mergeDescribedBy()` helper covers both.
  - `[low]` `[reject]` `Chip` silently ignores `onPress` when both `onPress` and `onSelectedChange` are supplied (Edge Case Hunter) — the two props are documented as mutually exclusive roles (toggle mode vs. tap mode); no caller in this diff combines them, and enforcing exclusivity needs a discriminated-union type change beyond a trivial fix.
  - `[low]` `[patch]` `FilterChipGroup`'s `onSelectionChange` calls `Array.from(keys)` without checking for React Aria's special `'all'` Selection value first (Edge Case Hunter) — unreachable in `selectionMode="single"` today, but a one-line guard is free insurance. Applied: `if (keys === 'all') return;` guard added, with the handler's parameter typed as the library's own `Selection` union.
  - `[low]` `[reject]` `Combobox`'s sentinel id `'__create__'` could collide with a real option id (Edge Case Hunter) — real option ids come from registries (UUID/db ids), never a hand-typed sentinel string; avoiding the theoretical collision needs a non-trivial key scheme.
  - `[medium]` `[patch]` `Combobox`'s `isDisabled` sets `aria-disabled` but never actually blocks `onSelectionChange`/`onInputChange`, so a "disabled" combobox still accepts typing and selection (Edge Case Hunter) — verified at `combobox.tsx:45-66`; fix: guard the handlers the same way `Button.onPress` does, without switching to React Aria's real `isDisabled`. Applied: both handlers now `if (isDisabled) return;` before doing anything; new tests assert typing while disabled never calls `onInputChange` and the field stays focusable.
  - `[false]` `[reject]` `ConfirmDialog`'s `onConfirm` closes immediately without awaiting it, risking a premature close if the caller passes an async/throwing function (Edge Case Hunter) — refuted: `onConfirm: () => void` is typed sync-only by design (an explicit shell component); no type-correct caller can trigger the described failure.
  - `[low]` `[reject]` `OverflowMenu`'s `items`/`destructiveItems` sharing an id makes the internal action lookup `Map` silently keep only one (Edge Case Hunter) — caller-supplied id uniqueness is an ordinary list-key precondition; no caller in this diff violates it and guarding against a hypothetical caller mistake is more than a trivial fix.
  - `[medium]` `[defer]` (claim) Toggle's selected fill never visually engages (Edge Case Hunter) — duplicate of the Blind Hunter finding above; grouped there.
  - `[low]` `[reject]` (claim) Four of the eleven AC-listed components (`Chip`/`Toggle`/`SegmentedControl`/`Tabs`) expose no `isDisabled`/`disabledReason` (Edge Case Hunter) — duplicate of the Blind Hunter finding above; same disposition.
  - `[medium]` `[patch]` (claim) `combobox.tsx` hardcodes `aria-label="Abrir lista"` and the "Criar…" template, and `status-pill.tsx` hardcodes `STATUS_LABEL`, contradicting the AC's "fixed strings come from `apps/web/src/copy/ui.ts`" (Edge Case Hunter) — verified; fix: move both into `copy/ui.ts` following the existing `toggle`/`confirmDialog`/`overflowMenu` pattern. Applied: added `ui.statusPill.label` and `ui.combobox.{openList, create}`; both components now import from `../copy/ui`.
  - `[medium]` `[defer]` (claim) `gallery.test.tsx`'s typography-floor test reads `--t-*-size` tokens directly rather than a rendered element's computed `font-size` (Edge Case Hunter) — same root cause as the Verification Gap layer's hit-area finding below (jsdom cannot resolve `var()` in computed styles); grouped there.
  - `[medium]` `[defer]` The ≥48/56px hit-area AC is verified only by class-name presence, not a measured rendered box size, because jsdom has no layout engine and cannot resolve CSS custom properties through `getComputedStyle` (Verification Gap Reviewer, pre-verified) — real and unverified by any test in this diff; needs a real-browser (Playwright) component-layout test tier that doesn't exist yet for `apps/web`.
  - `[medium]` `[patch]` The mandatory disabled+reason invariant is tested only for `Button`, not `TextButton` or `Combobox`, which implement the identical contract (Verification Gap Reviewer, pre-verified) — verified: `button.test.tsx` has the throw-test only for `Button`; add the equivalent for `TextButton` and `Combobox`. Applied: throw-tests added for both in `button.test.tsx` and `combobox.test.tsx`.

### 2026-09-22 — Matrix Test Audit (step 3 self-check, not a review-layer finding)
- Two I/O & Edge-Case Matrix rows ("Chip row overflow", "Reduced motion") had no covering test. Added `gallery.test.tsx` tests: chip rows resolve `flex-wrap: wrap` and never `overflow-x: scroll` (gap verified against the `--sp-2` token, since jsdom does not resolve `var()` in the `gap` shorthand); and no rendered component in the gallery has an active `animation-name` (this story's 11 components define none, so the row is currently satisfied vacuously — the test's real value is guarding a future regression). Both pass; full `pnpm --filter @app/web run test` (67/67) and `pnpm verify` re-run green afterward.
  - `[low]` `[reject]` Toggle/Checkbox/SegmentedControl gap not documented in Design Notes (Verification Gap Reviewer) — duplicate of the Blind Hunter finding; fix is a spec-prose edit, corrected directly.
  - `[low]` `[defer]` `_bmad/custom/config.toml` gained `communication_language`/`user_skill_level` keys, unrelated to this story's application code (Verification Gap Reviewer) — an orchestration-level fix: `render_skill.py` HALTed with "missing config value `communication_language`" without it, blocking this and every future build-auto run; left in place, it edits an agent-context/tooling config file, not story behavior.
  - `[low]` `[reject]` Visual/frame-fidelity clauses (contrast, wrap/scroll, frame match at 768/390/1280) are verified at the CSS-custom-property/DOM level, not by rendering in a real browser at named breakpoints (Intent Alignment Auditor) — the spec's own Verification section already scopes this to a manual/mental check given jsdom's lack of a layout engine; an accepted, documented trade-off, not a new gap.
  - `[false]` `[reject]` The "units render in a separate slot" test hand-composes two `<span>`s in the test itself rather than a dedicated component enforcing the split (Intent Alignment Auditor) — no "Value/Measurement" component was ever in this story's Tasks; demonstrating the typography classes compose correctly via an existing component (`Chip`) satisfies the AC as scoped.
  - `[medium]` `[defer]` Toggle fails literal mockup class-name/visual parity for its "on" state (Intent Alignment Auditor) — duplicate of the Blind Hunter finding above; grouped there.
  - `[low]` `[reject]` The mockup-citation AC clause is satisfied only at the spec-document level (`context:`/Design Notes), not inside any component source file, and its own Verification step is manual (Intent Alignment Auditor) — already the documented, accepted verification approach in this spec; no component-level mockup citation was ever part of the Tasks list.
  - `[low]` `[defer]` Diff also rewrites `epic-1-context.md` and edits `_bmad/custom/config.toml`, neither called for by the story text (Intent Alignment Auditor) — both are expected orchestration-level actions (mandatory epic-context cache refresh per the build-auto workflow's freshness rule; the tooling fix noted above), not story-scope violations.
  - `[low]` `[reject]` Story 1.2's opening sentence names six components while its second AC block names eleven, and the diff builds the eleven (Intent Alignment Auditor) — already resolved deliberately at spec-writing time: the AC block is the more specific, itemized source and was chosen as authoritative; not a code defect.

## Design Notes

Filter chip's *ungrouped* value-chip role reuses `.chip[aria-pressed="true"]` correctly. The *grouped* `FilterChipGroup`, however, is a real `role="radio"`/`aria-checked` group (React Aria's `ToggleButtonGroup` in single-selection mode) — `aria-pressed` is not an allowed attribute once the role is `radio` (verified with axe), so it cannot reuse that same selector. This is one instance of a broader gap also affecting `Toggle`, `Checkbox` and `SegmentedControl`: `components.css` keys its "on"/checked/selected fill to a DOM shape (state on the visible, styled element) that React Aria never produces for these controls (state lives on a hidden native input inside the styled label, which is the correct, accessible shape). All four render correctly and pass an axe scan, but their selected/on fill does not visually engage until `components.css` gains selectors for this DOM shape — out of this story's authority to add (Boundaries: no new classes in `components.css`). Tracked in this spec's `deferred` list rather than resolved here. The app-wide pt-BR copy module EXPERIENCE.md's Voice and Tone table implies is not fully designed yet; `apps/web/src/copy/ui.ts` seeds it with only what this story's components need — later UI stories extend the same module rather than starting a second one.

## Verification

**Commands:**
- `docker compose run --rm install pnpm install` -- regenerates the lockfile after the devDependency additions, exits 0
- `docker compose run --rm tools pnpm lint` -- passes with no new `no-restricted-imports`/fetch-location violations
- `docker compose run --rm tools pnpm --filter @app/web run test` -- all new component/gallery tests pass, including the axe scan and the dark-theme contrast assertion
- `docker compose run --rm tools pnpm verify` -- full merge gate green, under 15 minutes

**Manual checks (if no CLI):**
- Open the gallery test's rendered output mentally against `key-*.html`/`prototype/screens/*.html` mockups to confirm class-name parity (no re-styled equivalents).

## Auto Run Result

Status: done
Blocking condition: none

**Summary:** Built the shared component library in `apps/web/src/components` (Button, TextButton, StatusPill, OverflowMenu, ConfirmDialog, Chip, FilterChipGroup, Toggle, LockedToggle, Checkbox, SegmentedControl, Tabs, Combobox), the shared touch/stylus input layer in `apps/web/src/input` (`touch-action`, `usePressAndHold`), and the seed pt-BR copy module `apps/web/src/copy/ui.ts`, all built directly on the mockups' `components.css`/`tokens.css` classes with React Aria Components supplying accessible behavior. A `gallery.test.tsx` renders every component under both themes with a zero-violation axe scan, a dark-theme Suggestion-amber contrast check, a typography-floor check, a hit-area check, a label-clipping check, and (added during the Matrix Test Audit) a chip-row wrap/no-scroll check and a no-stray-animation check.

**Files changed:**
- `apps/web/src/components/{button,status-pill,overflow-menu,confirm-dialog,chip,toggle,checkbox,segmented-control,tabs,combobox}.tsx` + matching `.test.tsx`, `index.ts`, `gallery.test.tsx` — new shared components and their tests.
- `apps/web/src/input/{touch-action,use-press-and-hold}.{ts,test.ts}` — new shared input layer.
- `apps/web/src/copy/ui.ts` — new seed pt-BR copy module.
- `apps/web/src/test-setup.ts`, `apps/web/src/jest-axe.d.ts` — new Vitest/jsdom/axe test infrastructure.
- `apps/web/package.json`, `apps/web/vite.config.ts`, `pnpm-lock.yaml` — jsdom + React Testing Library + jest-axe devDependencies, jsdom Vitest environment.
- `_bmad-output/implementation-artifacts/epic-1-context.md` — regenerated per the build-auto workflow's cache-freshness rule (orchestration, not story scope).
- `_bmad/custom/config.toml` — orchestration-level fix (`communication_language`/`user_skill_level`) required to unblock `render_skill.py` for this and every future story; not story scope.

**Review findings breakdown** (35 findings across 4 layers; full detail in Review Triage Log above):
- Patched (9, all applied and re-verified): OverflowMenu's forbidden `isDisabled` usage removed; Combobox's disabled reason wired via `aria-describedby`; Combobox's `isDisabled` now actually blocks selection/input; disabled-without-reason throw-tests added for `TextButton`/`Combobox`; the gallery's axe/hit-area/clipping checks now open the Overflow menu and Confirm dialog instead of only checking their closed state; `usePressAndHold` now tracks `pointerId` and uses pointer capture; `status-pill`/`combobox` hardcoded strings moved into `copy/ui.ts`; `Button`/`TextButton` now merge a caller's `aria-describedby` with the reason id instead of overwriting it; `FilterChipGroup` guards against the `'all'` Selection value.
- Deferred (3, in frontmatter `deferred`): Toggle/Checkbox/SegmentedControl/grouped-FilterChip's selected/on fill doesn't visually engage — `components.css` has no selector for React Aria's correct DOM shape, and adding one is outside this story's authority (medium); the ≥48/56px hit-area and 14px typography floor are verified via tokens/class-presence, not a real measured box, because jsdom cannot resolve `var()` or lay out a page — needs a future Playwright component-layout tier (medium, unverified); the `_bmad/custom/config.toml` orchestration fix (low).
- Rejected (23): duplicates of the items above (documentation-only asks routed as spec-prose edits, corrected directly in Design Notes instead), several low-confidence edge cases judged unreachable or already excluded by the spec's own "shell only" scoping (Combobox's create-sentinel collision, exact-match "Criar" suppression, OverflowMenu duplicate-id lookup), one false claim refuted by the type system (`ConfirmDialog.onConfirm` is sync-only by design), one accepted trade-off already documented in this spec's own Verification section (breakpoint/frame-fidelity checks are manual, not automatable in jsdom), and one accepted intentional design (`Chip`'s `onPress`/`onSelectedChange` are documented as mutually exclusive roles). Full reasoning for each is in the Review Triage Log.

**Follow-up review recommendation:** true. Six `medium`-verdict findings were patched in one pass (OverflowMenu's disabled-item removal, Combobox's describedby wiring, Combobox's functional-disable guard, the gallery's open-overlay coverage, the pointer-capture rework in `usePressAndHold`, and the copy-module moves), which is well past the "two or more medium" threshold for recommending a fresh pass. Specific unverified risk: the pointer-capture/pointerId rework in `use-press-and-hold.ts` and the newly-functional Combobox disable-guard are non-trivial behavioral changes applied and unit-tested by the same subagent that wrote the original bug, without an independent reviewer re-examining the new code.

**Verification performed:** `docker compose run --rm install pnpm install` (lockfile regenerated, clean); `docker compose run --rm tools pnpm lint` (clean); `docker compose run --rm tools pnpm --filter @app/web run test` (67/67 passing, including the two Matrix Test Audit additions); `docker compose run --rm tools pnpm verify` (full merge gate: lint, static, unit, api, Playwright `@p0` — all green, well under 15 minutes) run twice, once after the review patches and once after the Matrix Test Audit additions.

**Residual risks:** the four-component visual-fill gap (deferred) will be visible the moment any later story wires Toggle/Checkbox/SegmentedControl/grouped-FilterChip into a real screen (e.g. Story 1.6's Account › Tema); the hit-area/typography floor has no real-browser measurement yet; the patch-pass code (see follow-up recommendation) has not had independent review.
