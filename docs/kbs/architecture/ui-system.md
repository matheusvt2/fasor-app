---
type: Architecture Rule
title: UI system
description: AD-23. Open before writing any React component, style, or input handling.
tags: [architecture, ui, react-aria, ad-23]
timestamp: 2026-11-28T00:00:00Z
sources: [ARCHITECTURE-SPINE.md#ad-23]
---
# UI system

- `tokens.css` (1:1 with DESIGN.md) and `components.css` are copied unchanged into `apps/web/src/styles` and are the styling layer. React components use the mock's class names. No Tailwind, no component kit with its own theme.
- Behavior comes from React Aria Components, unstyled; state maps through render-prop `className` onto the CSS `.is-*` and `[data-state]` selectors, one mapping helper per component.
- Disabled controls use `aria-disabled` plus an `aria-describedby` reason, never React Aria's `isDisabled` (it takes the control out of the tab order and hides the reason). The shared components expose their own `isDisabled` prop and map it to `aria-disabled`; `Button` throws when it is disabled with no reason (`apps/web/src/components/button.tsx`).
- One shared input layer `apps/web/src/input` sets `touch-action` (`touch-action.ts`), pointer gestures (`pointer-gesture.ts`), press-and-hold (`use-press-and-hold.ts`), pinch zoom, the field commit (`use-field-commit.ts`) and the screen wake lock. No hover-only affordance, no swipe. Inter is self-hosted (`apps/web/src/styles/fonts/`, `fonts.css`) and precached by the service worker.

Code: `apps/web/src/styles/` (`tokens.css`, `components.css`, `app.css`, `fonts.css`, `index.css`, the icon sprite `sprite.svg`; `styles.test.ts` and `app-css.test.ts` guard the copies and the translations), `apps/web/src/components/` (shared components, `index.ts`), `apps/web/src/input/`, `apps/web/src/surfaces/`. Mock-to-app CSS translation and copy placement: [mockups-and-css](/ux/mockups-and-css.md), [copy-homes](/ux/copy-homes.md).

Canonical: AD-23 in `_bmad-output/planning-artifacts/architecture/architecture-fasor-2026-09-21/ARCHITECTURE-SPINE.md` (`grep -n '### AD-23'`); `DESIGN.md` and `EXPERIENCE.md` under `_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/`; `AGENTS.md` "Mock container selectors".
