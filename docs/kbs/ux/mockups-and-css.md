---
type: UX Rule
title: Mockups and CSS translation
description: Build screens from the mockups with their class names; how bezel-scoped selectors translate to the app.
tags: [ux, css, mockups]
timestamp: 2026-09-30T00:00:00Z
sources: [AGENTS.md, _bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/mockups/MOCK-GUIDE.md]
---
# Mockups and CSS translation

- Mocks: `_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/mockups/` with `prototype/screens/*.html`, `key-*.html`, `tokens.css`, `components.css`, `MOCK-GUIDE.md` (how mocks are built, what is out of the slice). `DESIGN.md` (visuals) and `EXPERIENCE.md` (behavior) win over a mock on conflict. Current screens: `40-relatorio-overview.html`, `73-exportar.html`; `key-*-v09.html` for the v0.9 direction.
- `tokens.css` and `components.css` are copied unchanged into `apps/web/src/styles`. Every translation goes in `apps/web/src/styles/app.css` with a comment naming the mock rule, declarations copied verbatim.
- Translations: `.frame, .frame *` -> `:root` scope (so React Aria portals inherit); `.frame-phone X` -> `@media (max-width: 767.98px)`; `.frame-tablet X` -> `(min-width: 768px) and (max-width: 1279.98px)`; `.frame-tablet-landscape X` -> `(min-width: 1024px) and (max-width: 1279.98px)`; `.frame-desktop X` -> `(min-width: 1280px)`.
- Never translate: `.frame--crop`, `.mock-*`, bezel sizes, `.browser-chrome`, `.frame-desktop .screen`, static `.is-focus-ring`. Media queries already in `components.css` apply as is.
- ARIA state lives on the element the mock CSS styles. If a valid ARIA shape cannot carry the mock attribute (`role="radio"` and `aria-pressed`), `app.css` mirrors the declarations for the attribute it does carry. No invented look.
- A new `.frame-*` rule gets its translation in the same change that first renders it; the real-browser pass checks 390, 768 and 1280 px plus a dialog.
- Behavior and components: [ui-system](/architecture/ui-system.md).
