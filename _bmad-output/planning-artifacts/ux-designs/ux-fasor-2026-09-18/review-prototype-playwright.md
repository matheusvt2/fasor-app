# Review — Playwright sweep of the navigable prototype (v0.8.0)

**Date:** 2026-09-21 · **Reviewer:** Sally (UX) · **Target:** `mockups/prototype/index.html`

## Method

- 19 routes × 4 devices (tablet portrait, tablet landscape, phone, desktop) = 76 loads, system Chrome driven by Playwright.
- Per load: console and page errors, routes falling to the "Em construção" placeholder, content beyond the device frame (split into real clipping vs. contained horizontal scroll), interactive elements under 44 px, buttons with no behavior, `data-open` targets that do not exist, emoji in visible text.
- axe-core 4.10 (WCAG 2.1 A/AA) on tablet light, tablet dark and phone — 57 runs.
- Every `data-go` / `#/` target in the build resolved against the router (26 targets).
- Tall tablet capture of every route plus targeted captures of each clipping case, reviewed by eye.

## Clean

- **No script errors** in 76 loads. (The only console errors came from axe itself failing to preload CSS over `file://`.)
- All 19 routes resolve; **no dead buttons**; **no emoji**; **no page-level horizontal scroll** on any screen.
- **Light theme: zero contrast violations.**

## Findings, most severe first

1. **Dark theme makes every suggestion unreadable** (axe, 35 nodes, contrast 1.06). Component tokens alias colors on `:root` (`--suggestion-field-suggested-background: var(--fora-do-limite-fill)`), but the prototype applies the theme with `data-theme` on `.frame`; the alias resolves once at `:root` with the light value and is inherited. Hits the Suggestion field, the generated-text field, the P1 priority pill and the parecer box — the product's central amber pattern. **Fix:** declare the component-token block on `:root, [data-theme]` so aliases re-resolve where the theme is set; **note for architecture:** put the theme attribute on the root element. Dark captures in the Bruno proposal PDF likely show the same defect.
2. **Content clipped at the frame edge (no scroll, it simply disappears):** TP sheet on tablet — the TTR table loses 130 px, i.e. the "H1-H2 / X1-X2" and "Condição" columns, the result the engineer is there to read; sheet on desktop — the second of the side-by-side contact tables loses 42 px; not-tested breaker (DJ-C14) on phone — the reason chip row pushes 288 px; sheet on phone — "Marcar os restantes como Conforme" cut by 28 px; Export on phone — "Simular preenchido" cut; **Sumário on phone (new in v0.8)** — section 9 tree squeezed, names wrapping in three lines, "Adicionar bloco em 1° Subsolo" 75 px off-screen.
3. **Sumário rows 1–6 open "Em construção"** — no section-text screen exists. And sections 1 and 3 are already edited in Relatório setup › "Etapa 2 — Objetivo e escopo", so the v0.8 structure has two homes for the same text. **Fix:** rows 1 and 3 open the setup's Etapa 2; one plain-text screen serves 2, 4, 5 and 6.
4. **Touch targets under the 48 px floor on field surfaces:** the plate/display crop thumbnail is 24×24 (28 occurrences on sheets); on the new Sumário the section and cabine chevrons are 20 px, the Position box 40 px, the header summary links 36 px. Office-only: the Template composer C/NC/NA segments at 40 px.
5. **"Outro…" falls off the end of horizontally scrolling chip rows** (observations, not-tested reasons, clients, photo filters) and the Registries tabs hide "Critérios de aceitação" with no cue. The escape hatch is the chip a gloved user can least afford to hunt for. **Fix:** wrap chip rows, or pin "Outro…" first.
6. **"Confirmar todas" in the gallery lost its button style** — a duplicate `class` attribute introduced by the MVP-slice marking (`70-fotos.html`); the browser keeps the first one.
7. **Technical accessibility:** `aria-readonly` on role-less divs in the not-tested sheet (23 fields); Caption composer comboboxes without `aria-expanded` / `aria-controls`; the NC observation field and the parecer control without an accessible name.
8. **The gallery shows the full product:** every photo carries a "Sugerido" vision caption (FR-39, post-MVP); only the batch button is marked. In the MVP these photos would show context captions.

Findings 2 (Sumário on phone), 4 (Sumário controls) and 6 were introduced in this session's v0.7–v0.8 work.

## Fixed (2026-09-21) — verified by a second full sweep

Second sweep: 21 routes × 4 devices = 84 loads (the new section-text route added), axe on 63 runs.

| Before | After |
| --- | --- |
| 119 axe violations (35 dark contrast, 69 ARIA attribute, 9 required ARIA, 6 missing names) | **0** |
| Content clipped at the frame edge on 9 route/device pairs | **0** |
| 6 navigation targets falling to "Em construção" | **0** |
| 192 interactive elements under 44 px | **0 real** — what remains is 32 invisible scroll anchors (not tap targets) and 28 crop thumbnails drawn at 24 px whose tap area now extends to ≥ 44 px (verified with hit tests 18–20 px around the thumbnail) |
| Script errors, dead buttons, emoji | still **0** |

What changed: component tokens re-resolve on `[data-theme]` (dark contrast); chip rows and tabs wrap instead of scrolling; the TTR table uses fixed column widths and every table sits in a box that scrolls as a last resort; a sheet's tests stack at every width; bulk actions and export actions wrap on phone; the Sumário's chevrons (48×56), Position box (48) and summary links (44) meet the floor and its section-9 tree fits a phone; the Template composer C/NC/NA back to 48 px; rows 1 and 3 open Relatório setup › Etapa 2 and a new **Section text** screen serves rows 2, 4, 5 and 6; ARIA roles, states and names added; the duplicate `class` removed; the gallery's vision-caption banner marked post-MVP as a whole. Rules that implementation must keep are now in the spines (Tabs, Chip, Measurement table, Suggestion field, the theming note in Handed to architecture, the Section text surface).
