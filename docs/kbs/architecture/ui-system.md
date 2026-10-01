---
type: Architecture Rule
title: UI system
description: AD-23. Open before writing any React component, style, or input handling.
tags: [architecture, ui, react-aria, ad-23]
timestamp: 2026-09-30T00:00:00Z
sources: [ARCHITECTURE-SPINE.md#ad-23]
---
# UI system

- `tokens.css` (1:1 with DESIGN.md) and `components.css` are copied unchanged into `apps/web/src/styles` and are the styling layer. React components use the mock's class names. No Tailwind, no component kit with its own theme.
- Behavior comes from React Aria Components, unstyled; state maps through render-prop `className` onto the CSS `.is-*` and `[data-state]` selectors, one mapping helper per component.
- Disabled controls use `aria-disabled` plus an `aria-describedby` reason, never `isDisabled`.
- One shared input layer `apps/web/src/input` sets `touch-action`, pointer handling and press-and-hold. No hover-only affordance, no swipe. Inter is self-hosted and precached.

Code: `apps/web/src/styles/` (`tokens.css`, `components.css`, `app.css`), `apps/web/src/components/` (shared components, `index.ts`), `apps/web/src/input/`, `apps/web/src/surfaces/`. Mock-to-app CSS translation and copy placement: [mockups-and-css](/ux/mockups-and-css.md), [copy-homes](/ux/copy-homes.md).
