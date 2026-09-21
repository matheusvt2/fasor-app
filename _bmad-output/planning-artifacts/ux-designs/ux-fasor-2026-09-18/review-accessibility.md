# Accessibility Review — fasor

Scope: `DESIGN.md` and `EXPERIENCE.md` (UX spine pair, v0.1.0, 2026-09-18), reviewed against WCAG 2.2 AA plus field ergonomics (gloves, one hand, sunlight/dim cubicles, no signal, pt-BR). Contrast ratios recomputed from the frontmatter hex values with a WCAG relative-luminance script; thresholds 4.5:1 for text, 3:1 for UI boundaries and state indicators.

## Overall verdict

The palette is unusually solid: every ratio the prose claims is numerically correct, every semantic ink passes 4.5:1 on white, on its own fill, and in the dark theme, and the "word next to every color" rule is honoured by almost every component. The gaps are behavioral rather than chromatic: the photo pending-upload dot is color-only and fails 3:1, the tri-state "retap to clear" is incompatible with the radio semantics the spine promises (and is a glove hazard), reorder has no single-pointer alternative (WCAG 2.5.7), several tap targets (drag handle, palette "+", sync badge, tree chevrons, unit control) have no size, and the decimal-dot conversion rule can silently turn "3.700" into 3,7 MΩ. None of these needs a palette change; all need a sentence or two in the spine before the components are built.

## Contrast table (pair · claimed · computed · pass/fail)

All values computed with `contrast.py` (WCAG 2.x formula). "UI" = non-text boundary/indicator, threshold 3:1; everything else is text, threshold 4.5:1.

### Claims in the prose (all verified)

| Pair | Claimed | Computed | Result |
|---|---|---|---|
| ink-primary `#15181D` on surface-raised `#FFFFFF` | 17.8:1 | 17.79:1 | PASS |
| ink-primary-dark `#F3F4F6` on surface-raised-dark `#1C2027` | 14.8:1 | 14.85:1 | PASS |
| ink-secondary `#454B54` on surface-raised | 8.8:1 | 8.80:1 | PASS |
| border-strong `#5C6470` on surface-raised (UI) | 6.0:1 | 5.98:1 | PASS |
| primary-foreground `#FFFFFF` on primary `#1F4E79` | 8.7:1 | 8.66:1 | PASS |
| primary-foreground-dark `#0B1B2B` on primary-dark `#86B6E8` | 8.2:1 | 8.18:1 | PASS |
| ink-primary on focus-fill `#DCE8F5` | 14.3:1 | 14.32:1 | PASS |
| conforme `#1B6B36` on white | 6.6:1 | 6.56:1 | PASS |
| conforme on conforme-fill `#DDF3E4` | 5.6:1 | 5.62:1 | PASS |
| nao-conforme `#B42318` on white | 6.6:1 | 6.57:1 | PASS |
| nao-conforme on nao-conforme-fill `#FBE3E0` | 5.4:1 | 5.37:1 | PASS |
| nao-aplica `#5C6470` on white | 6.0:1 | 5.98:1 | PASS |
| fora-do-limite `#8A4B00` on white | 6.8:1 | 6.80:1 | PASS |
| nao-ensaiado `#4A4374` on white | 9.0:1 | 8.95:1 | PASS |

No claim in the prose is numerically wrong.

### Load-bearing pairs the prose does not claim — light theme

| Pair | Computed | Result |
|---|---|---|
| ink-primary on surface-base `#F4F5F7` | 16.31:1 | PASS |
| ink-secondary on surface-base | 8.06:1 | PASS |
| ink-secondary on focus-fill | 7.08:1 | PASS |
| primary on surface-raised (secondary button text, links, "create new" row) | 8.66:1 | PASS |
| primary on surface-base | 7.94:1 | PASS |
| focus border `#1F4E79` on surface-raised (UI) | 8.66:1 | PASS |
| focus border on focus-fill (UI) | 6.97:1 | PASS |
| primary / conforme / nao-ensaiado on focus-fill (selected tree row glyph+word) | 6.97 / 5.28 / 7.20:1 | PASS |
| nao-aplica on nao-aplica-fill `#E6E9ED` | 4.91:1 | PASS (thinnest text margin in the palette) |
| fora-do-limite on fora-do-limite-fill `#FDEBD0` (banner text, out-of-limit helper, Com restrições segment) | 5.82:1 | PASS |
| fora-do-limite on surface-base (status pill Em revisão, progress counter on sheet header) | 6.24:1 | PASS |
| fora-do-limite border on white (UI, out-of-limit field) | 6.80:1 | PASS |
| nao-ensaiado on nao-ensaiado-fill `#E9E6F5` (chip) | 7.29:1 | PASS |
| sync-ok / pending / offline / error / conflict on white | 6.56 / 6.80 / 8.80 / 6.57 / 8.95:1 | PASS |
| status pills Rascunho / Em campo / Em revisão / Emitido on white | 8.80 / 8.66 / 6.80 / 6.56:1 | PASS |
| toast text surface-raised on ink-primary | 17.79:1 | PASS |
| toast action primary-dark `#86B6E8` on ink-primary | 8.36:1 | PASS |
| photo number badge white on ink-primary | 17.79:1 | PASS |
| **photo pending dot fora-do-limite `#8A4B00` on ink-primary badge (UI)** | **2.62:1** | **FAIL** |
| border-hairline `#C9CED6` on surface-raised (UI) | 1.58:1 | FAIL as a boundary (spec says never sole boundary of an interactive element — see F-08) |
| border-hairline on surface-base (UI) | 1.45:1 | same |
| focus-fill vs surface-raised (fill alone as focus indicator, UI) | 1.24:1 | FAIL alone; carried by the 3px border (8.66:1) |
| conforme-fill / nao-conforme-fill / nao-aplica-fill / fora-do-limite-fill vs white (fill alone as selected/state indicator, UI) | 1.17 / 1.22 / 1.22 / 1.17:1 | FAIL alone; carried by the 2px ink ring / border (see F-02, F-10) |
| **disabled primary button at 40% opacity: text vs fill** | **1.36:1** | exempt under WCAG 1.4.3 but invisible in sun (see F-11) |
| disabled primary button fill vs white (UI) | 2.04:1 | same |
| disabled secondary button text (primary at 40%) on white | 2.04:1 | same |

### Load-bearing pairs — dark theme

| Pair | Computed | Result |
|---|---|---|
| ink-primary-dark on surface-base-dark `#121417` | 16.77:1 | PASS |
| ink-secondary-dark `#B6BCC6` on surface-raised-dark / surface-base-dark | 8.56 / 9.66:1 | PASS |
| border-strong-dark `#8A93A0` on surface-raised-dark (UI) | 5.26:1 | PASS |
| border-hairline-dark `#343A44` on surface-raised-dark (UI) | 1.43:1 | FAIL as boundary (same caveat as light) |
| primary-dark on surface-raised-dark / surface-base-dark | 7.68 / 8.67:1 | PASS |
| focus-dark border on surface-raised-dark (UI) | 7.68:1 | PASS |
| ink-primary-dark / ink-secondary-dark / primary-dark on focus-fill-dark `#203247` | 11.86 / 6.84 / 6.14:1 | PASS |
| conforme-dark `#6FD08F` on raised-dark / on conforme-fill-dark `#173324` | 8.63 / 7.23:1 | PASS |
| nao-conforme-dark `#F59288` on raised-dark / on fill-dark `#3D1E1B` | 7.27 / 6.68:1 | PASS |
| nao-aplica-dark `#A9B1BC` on raised-dark / on fill-dark `#2A2F37` | 7.55 / 6.22:1 | PASS |
| fora-do-limite-dark `#F2B85C` on raised-dark / on fill-dark `#3A2A10` | 9.17 / 7.76:1 | PASS |
| nao-ensaiado-dark `#BDB4E6` on raised-dark / on fill-dark `#2A2740` | 8.43 / 7.41:1 | PASS |
| sync-*-dark on surface-raised-dark | 8.63 / 9.17 / 8.56 / 7.27 / 8.43:1 | PASS |
| selected fills vs surface-raised-dark (fill alone, UI) | 1.09–1.25:1 | FAIL alone; carried by ring/border |
| toast (dark): text surface-raised-dark on ink-primary-dark background | 14.85:1 | PASS |
| **toast action (dark): "primary-dark tone" `#86B6E8` on ink-primary-dark `#F3F4F6` toast** | **1.93:1** | **FAIL** (see F-05) |
| photo number badge (dark): surface-raised-dark on ink-primary-dark | 14.85:1 | PASS |
| **photo pending dot (dark): fora-do-limite-dark on ink-primary-dark badge (UI)** | **1.62:1** | **FAIL** (see F-01) |

### Self-imposed 7:1 target for load-bearing text

`DESIGN.md` § Do's and `EXPERIENCE.md` § Accessibility Floor both say load-bearing text targets 7:1. The most load-bearing text in the app — the C / NC / NA letters and the out-of-limit helper — sits between 4.91:1 and 6.80:1: conforme 6.56 / 5.62 on fill, nao-conforme 6.57 / 5.37, nao-aplica 5.98 / 4.91, fora-do-limite 6.80 / 5.82. Passes AA, misses the document's own bar (see F-13).

## Findings

**F-01 [critical]** Photo pending-upload state is color-only and fails 3:1 in both themes (`DESIGN.md` § Components › Photo tile: "Pending upload: amber dot on the badge"; `EXPERIENCE.md` § Component Patterns › Photo tile, § State Patterns › Photo pending upload; Flow 6 failure path reuses the same amber dot for a *rejected* upload with "Tentar novamente"). The dot has no word, no glyph, and computes 2.62:1 (light) / 1.62:1 (dark) against the number badge — it disappears under sun, is indistinguishable for a deuteranope, and is silent to a screen reader. This is the one state the spine calls the acceptance bar ("never lose a photo"), yet it is the one state that breaks the "never color-only" rule. *Fix:* render pending as a small pill under or over the tile with icon + word ("↑ Aguardando" / "Erro — Tentar novamente"), with `fora-do-limite-fill` + `fora-do-limite` ink (5.82:1) for pending and `nao-conforme` outline for error; give the tile `aria-describedby` to that pill. If a dot is kept as a secondary cue, ring it with 2px `surface-raised` (17.8:1 on the badge) and use `sync-error` red, not amber, for rejected uploads. Also state the pending count in the gallery header ("3 fotos aguardando envio") so the state is readable without inspecting tiles.

**F-02 [critical]** Tri-state "tap a selected segment again to clear" contradicts the promised radio-group semantics and is a glove hazard (`EXPERIENCE.md` § Component Patterns › Tri-state control; § Accessibility Floor: "tri-state segments are radio-group semantics (arrow keys)"; § Interaction Primitives). A native or ARIA radio cannot be unchecked by re-activating it, so keyboard and screen-reader users have no way to clear, while touch users clear by an undiscoverable gesture. In the field, a leather-glove double-registration on a 56px segment silently un-marks a row the engineer believes is marked; nothing is announced and the only trace is the Progress counter changing. *Fix:* keep `role="radiogroup"` per row (accessible name = item number + text) with three radios whose accessible names are the full words ("Conforme", "Não conforme", "Não se aplica"); expose "clear" as a real, discoverable control — a fourth "Limpar" item in the row's overflow menu (48px) and the Delete/Backspace key on the focused group — and drop retap-to-clear, or if the product insists on it, debounce the second tap by ≥ 400 ms and show an undo toast "Item 8 desmarcado — Desfazer". Apply the same rule to the two Conclusion pairs, which the spine never gives semantics.

**F-03 [high]** Reordering has no single-pointer, non-drag alternative (WCAG 2.2 SC 2.5.7 Dragging Movements) (`EXPERIENCE.md` § Interaction Primitives: "Press-and-hold 300 ms + drag … keyboard Alt+↑/↓ on desktop"; § Component Patterns › Block card, Laudo tree, Point of attention card "Reorderable"). Alt+↑/↓ is desktop-only by the spine's own wording; a tablet user with a screen reader (TalkBack/VoiceOver, no keyboard), a tremor, or a stylus cannot reorder blocks, tree rows or points of attention, and Point of attention cards have no alternative at all. *Fix:* add "Mover para cima · Mover para baixo · Mover para…" to every reorderable item's overflow menu (Block card already has an overflow; give tree rows and Point of attention cards one), make Alt+↑/↓ work wherever a keyboard is attached (not "on desktop"), and announce the result via a polite live region ("SEC-09 movido para a posição 3 de 5"). Document the drag handle's `aria-label` ("Reordenar SEC-09") and keep it `role="button"`.

**F-04 [high]** Decimal-dot conversion can silently mis-scale a reading (`EXPERIENCE.md` § Component Patterns › Measurement field: "decimal comma accepted, dot converted"; § Voice and Tone: pt-BR formatting). In pt-BR the dot is the thousands separator. An engineer typing "3.700" (as the paper sheet shows 3.700 MΩ) gets 3,700 → 3,7 MΩ, which the app then flags amber against >400 MΩ and suggests *Com restrições* — a 1000× error dressed as a helpful hint. Conversely a device set to en-US shows a dot-only keypad. *Fix:* use `<input type="text" inputmode="decimal">` (not `type="number"`, whose comma handling differs by browser/locale), accept both separators but treat a dot followed by exactly three digits and no comma as a thousands separator, echo the parsed value in pt-BR beside the field ("= 3.700 MΩ") before blur-comparison, and make the unit slot the place to change scale (GΩ) rather than expecting long digit strings.

**F-05 [high]** Toast action colour is undefined for the dark theme and fails at 1.93:1 (`DESIGN.md` § Components › Toast: "optional action in `primary-dark` tone"; `components.toast` maps background to `ink-primary` and foreground to `surface-raised` with no `-dark` variant). In the dark theme the toast inverts to a light `#F3F4F6` background, and `primary-dark #86B6E8` on it is 1.93:1. The persistent "Rascunho encontrado — Recuperar" and "Ficha removida — Desfazer" actions become unreadable. *Fix:* add `toast.action` = `{colors.primary-dark}` in light, `{colors.primary}` in dark (7.87:1 on `#F3F4F6`), and state the rule that a toast's action colour is the opposite theme's primary.

**F-06 [high]** Several interactive elements have no size, or a stated size below the tokens (`DESIGN.md` § Components; `EXPERIENCE.md` § Component Patterns). Specifically: Block card drag handle ("six dots") and overflow menu — no size, and `block-card` has no `min-height` token at all; Block palette "small '+' at right" — explicitly small, while the behaviour says "Tap '+' adds"; Laudo tree expand/collapse chevrons — no size, and the row tap is already consumed by "selecting a row opens its sheet"; Sync badge — a `label`-sized pill that is a tap target opening Sync status; App bar back button and avatar; Measurement field unit control (MΩ / GΩ / TΩ) inside the 56px field; Checklist row overflow (optional observation); quick-observation chips; "Editar texto" and Banner text buttons; Toast action; Sheet header "Tap TAG to edit"; tablet-portrait rail toggle. *Fix:* add `min-height: {spacing.touch-min}` to `block-card` and make its handle and overflow 48×48; make the whole 56px palette row the target and the "+" decorative; give tree chevrons a 48×56 hit area on the left of the row and Left/Right arrow keys; give the Sync badge, back, avatar and every text button a 48px hit area even if the visible pill is smaller (padding or pseudo-element); size the unit control ≥ 48×56 and separate it from the numeric input by a 2px `border-strong` rule; make chips 48px tall. Add one sentence to § Layout: "Any element with a tap behaviour in EXPERIENCE.md has a ≥ 48px hit area, whether or not its visible box is smaller."

**F-07 [high]** Dialog and overlay semantics are not specified beyond "Esc closes" (`EXPERIENCE.md` § Component Patterns › Confirm dialog, Export dialog, Photo capture sheet, Block palette; § Accessibility Floor). No focus trap, initial focus, focus return, `role="dialog"`/`aria-modal`, `aria-labelledby` (title) or `aria-describedby` (sentence). The Photo capture sheet and Block palette drawer/bottom sheet are modals in all but name and get no Esc/back rule. Confirm dialogs default focus matters: with gloves, a mis-tap on "Remover ficha" as the initially focused button destroys data (Undo covers 10 s only). *Fix:* one paragraph in § Accessibility Floor: all overlays (Confirm, Export, Photo capture sheet, Block palette, Sync status, full photo view) are `role="dialog" aria-modal="true"` with `aria-labelledby` = title, initial focus on the least destructive control ("Cancelar"), focus trapped, Esc/system back closes, focus returns to the invoking element; background inert.

**F-08 [medium]** Interactive cards use the hairline as their only boundary, contradicting the palette rule (`DESIGN.md` § Colors: "Border hairline … never the sole boundary of an interactive element"; § Components › Laudo card "hairline border" + `EXPERIENCE.md` "Tap opens Laudo overview"; Photo tile "hairline border" + "Tap opens full view"). Hairline is 1.58:1 on white, 1.43:1 in dark. WCAG 1.4.11 exempts boundaries not needed to identify the component, and both cards carry content, so this is a consistency finding rather than a failure — but under sun a Laudo card edge vanishes and adjacent cards merge. *Fix:* either promote Laudo card to `border-strong` (like Block card) or state that the card's affordance is its title + chevron and hairline is decorative; give Photo tile `border-strong` since the thumbnail itself may be a near-white wall.

**F-09 [medium]** Selected tree row is indicated by fill alone (`DESIGN.md` § Components › Laudo tree: "Selected row `focus-fill`"; `laudo-tree.selected-background`). Focus-fill is 1.24:1 against white; under sun the current sheet is not findable in the rail. *Fix:* add a 4px `primary` left rule and 600 weight to the selected row, `aria-current="page"` for assistive tech, and keep keyboard focus (3px `focus` ring) distinct from selection.

**F-10 [medium]** Conclusion control has an undefined selected state for "Sem restrições" and no inner ring (`DESIGN.md` § Components › Conclusion control: "Sem restrições | Com restrições (neutral / amber)"; `conclusion-control` tokens have no `sem-restricoes-selected`, and unlike `tri-state-control` no "2px inner ring of its ink"). A selected neutral segment on white may be indistinguishable from an unselected one. *Fix:* reuse `nao-aplica-fill` + `nao-aplica` ink for Sem restrições, and copy the tri-state rule verbatim: selected = fill + ink + 2px inner ring + a leading ✓ glyph. Also specify the "Obrigatório" hint and the required-missing reason as `aria-describedby` on both radiogroups and `aria-invalid` when counted missing.

**F-11 [medium]** Disabled buttons at 40% opacity vanish in sunlight (`DESIGN.md` § Components › Button: "Disabled: 40% opacity on the whole button, no color change"; `EXPERIENCE.md` § Component Patterns › Button: reason shown as `label` text beside it). The computed disabled primary button is a 2.04:1 pale block with 1.36:1 text — WCAG-exempt, but in the field the engineer cannot see that "Concluir ficha" exists, let alone why it is off, unless the reason text survives (its colour is unspecified). *Fix:* disabled = `surface-raised` fill, 2px `border-strong` outline, `ink-secondary` label (8.8:1), `aria-disabled="true"` (keeps it focusable so the reason is reachable), and the reason text in `ink-secondary` linked by `aria-describedby`. Never reduce opacity on a control that must be found outdoors.

**F-12 [medium]** Checklist row focus model is internally contradictory and produces 60+ tab stops per sheet (`EXPERIENCE.md` § Component Patterns › Checklist row: "row is a single focus stop, the segments are the tab stops inside"). A 15-item sheet would need 4 Tabs per row plus overflow. *Fix:* the row is not focusable; each row contributes one tab stop (the radiogroup, arrows move between C/NC/NA) plus one for its overflow button; the NC-expanded Observation and "Adicionar foto" follow in DOM order. Use the group's accessible name ("Item 8, Contatos") so the announcement in § Accessibility Floor ("Item 8, Contatos, Conforme, 1 de 3") actually results.

**F-13 [medium]** Self-imposed 7:1 target is missed by the most load-bearing text (`DESIGN.md` § Do's: "load-bearing text ≥ 7:1"; `EXPERIENCE.md` § Accessibility Floor: "load-bearing text targets 7:1 because of sunlight"). The C / NC / NA letters on their fills are 5.62 / 5.37 / 4.91:1 and the out-of-limit helper on its fill is 5.82:1 — the exact text the engineer reads under glare. *Fix:* either soften the claim to "≥ 4.5:1 everywhere, ≥ 7:1 for ink on surfaces" or darken the three inks (e.g. conforme `#155A2C` → 8.30:1 white / 7.12:1 fill; nao-conforme `#9E1F15` → 7.89 / 6.45; fora-do-limite `#7A4200` → 8.06 / 6.89; nao-aplica `#4F5661` → 7.40 / 6.08) and lighten the fills slightly if 7:1-on-fill is truly wanted. Also specify the tri-state letters' typography (currently absent; recommend `heading` 18px/600 so the letter, not the fill, carries the state).

**F-14 [medium]** Live-region strategy will chatter or stay silent at the wrong moments (`EXPERIENCE.md` § Accessibility Floor: "Sync badge is an `aria-live=polite` region"; § Interaction Primitives: autosave 500 ms, no Save button; § Component Patterns › Sheet header "filled-by/when (updated on every save)"; › Progress counter; › Measurement field out-of-limit on blur). A polite badge that counts down "5 pendentes … 4 … 3" during a photo upload, plus a header timestamp rewritten on every keystroke burst, will interrupt a screen-reader user on every field, while nothing ever says "salvo". *Fix:* announce badge state *transitions* only (ok ↔ pending ↔ offline ↔ error ↔ conflict), not counts; keep the Sheet header and Progress counter out of live regions and announce "Completa" once via `role="status"`; add a visually hidden `role="status"` "Salvo" debounced to ≥ 3 s; make the out-of-limit helper `aria-describedby` of the field *and* announce it once via `role="status"` on blur so the suggestion "Marcar Com restrições?" is heard without re-focusing; Toasts `role="status"`, conflict/sync-error Banner `role="alert"`.

**F-15 [medium]** Focus style is only defined for inputs (`EXPERIENCE.md` § State Patterns › Focus: "Inputs — whole field takes focus-fill + 3px border"; `DESIGN.md` § Colors › Focus). Buttons, tree rows, Laudo cards, Photo tiles, chips, the Sync badge and dialog options have no focus indicator specified; browser defaults on a custom UI system are often clipped or removed. *Fix:* add a global rule: non-input focus = 3px `focus` ring with 2px offset (8.66:1 light, 7.68:1 dark) on the element's full hit area; WCAG 2.4.13 target. Pair with `scroll-padding-bottom` = Sticky action bar height (+ keyboard inset) so the focused field is never hidden behind the bar or the numeric keypad (SC 2.4.11 Focus Not Obscured).

**F-16 [medium]** Sticky action bar reach and keypad interaction are under-specified for one-handed portrait use (`EXPERIENCE.md` § Component Patterns › Sticky action bar "Always reachable with the thumb"; `DESIGN.md` § Components: "buttons … right-aligned on tablet/desktop"). Right-aligned favours a right-hand grip; a left-handed engineer, or one holding a probe in the right hand, reaches across a 10" tablet. Nothing says whether the bar sits above the on-screen keypad or is covered by it while the measurement table is being filled. *Fix:* on tablet portrait, buttons fill the width (as on phone) or honour a handedness preference in Account; state that the bar sits above the virtual keyboard (`env(keyboard-inset-height)`/visualViewport) and that Enter on the last cell of a table focuses "Próxima ficha".

**F-17 [medium]** Measurement table has no accessible-structure spec, and the phone stacked-card layout loses the header relationship (`EXPERIENCE.md` § Component Patterns › Measurement table; § Responsive: "Measurement tables become stacked per-row cards"). Enter-moves-down-the-column is a reading-order rule that no longer holds when Fase A's three readings sit in one card; calculated cells have a visual "calc" mark only. *Fix:* keep a real `<table>` with `<th scope>` at tablet/desktop; on phone give each input an accessible name composed of row + column ("Fase A, 1 minuto") and keep Enter moving to the same column of the next row within a card; calculated cells `aria-readonly` with accessible name suffix "calculado" (and replace the English "calc" mark with "calc." expanded via `aria-label`); the acceptance value and its source are part of the table's `<caption>`.

**F-18 [medium]** Expired calibration in Registry rows is conveyed by sort position and amber date only (`DESIGN.md` § Components › Registry row: "Expired calibration shows the date in `fora-do-limite`"; `EXPERIENCE.md` › Registry row: "expired ones sort first with the date in amber"). *Fix:* prefix the word "Vencida" (or the Not-tested-style chip "Calibração vencida") before the date.

**F-19 [medium]** Error association is never made explicit (`EXPERIENCE.md` § Component Patterns › Observation field "label line 'Obrigatória com restrições'", › Login form "error inline under the field", › Measurement field helper; § State Patterns › Required missing). *Fix:* one rule in § Accessibility Floor: every helper, reason or error line is referenced by `aria-describedby` from its control; required-missing sets `aria-invalid="true"`; Login error additionally `role="alert"`.

**F-20 [medium]** Undo window and toast timing are tight for gloves and screen readers (`EXPERIENCE.md` § Interaction Primitives: "Undo … via Toast action for 10 s"; › Toast "6 s"). Ten seconds to find and hit a small text action, one-handed, after an accidental removal is short; a screen-reader user may not reach the toast in time. *Fix:* make undo toasts persistent until dismissed or until the next navigation (min 20 s), and list removed blocks in Laudo overview › overflow "Restaurar ficha removida" until export (the data is already kept recoverable until export, so this costs nothing).

**F-21 [low]** State glyphs will be read literally by screen readers (`DESIGN.md` § Components › Laudo tree "✓ Concluída, ● Em preenchimento, ○ Vazia, ⊘ Não ensaiada"; Progress counter and Sync badge dots). "●" reads as "círculo preto". *Fix:* glyphs and dots `aria-hidden="true"`; the word is the accessible text.

**F-22 [low]** Unit and date accessible names are unspecified (`DESIGN.md` § Typography "330 + MΩ"; § Accessibility Floor "330 megaohms"). "MΩ" may be read as "M ómega"; "07/09 14:32" as "sete barra nove". *Fix:* give the unit slot `aria-label` with the spoken unit (megaohms, gigaohms, microohms, quilovolts); wrap dates in `<time datetime>` with the year present in the attribute even if not shown.

**F-23 [low]** Abbreviations C / NC / NA have no visible expansion on tablet/desktop (`DESIGN.md` § Components › Tri-state control: "long labels appear as helper text under the row on phone"). AAA in WCAG, but a new hire or the office reviewer benefits. *Fix:* a one-line legend at the top of each checklist ("C Conforme · NC Não conforme · NA Não se aplica"), like the printed sheet header, and `aria-label` full words on each segment (covered by F-02).

**F-24 [low]** Reduced motion covers drag and toasts only (`EXPERIENCE.md` § Accessibility Floor). *Fix:* extend to bottom-sheet/drawer slides, row expand on NC, and the amber state transition on blur: `prefers-reduced-motion` → instant.

**F-25 [low]** Theme switch is buried for the dim-cubicle case (`EXPERIENCE.md` § IA › Account "theme (Claro / Escuro)"). A light screen at full brightness in a dark cubicle is itself glare. *Fix:* also honour `prefers-color-scheme` on first run and expose the toggle in Sync status or the App bar avatar menu (one tap from any sheet).

**F-26 [low]** Sync badge "compact" variant on Laudo card is undefined (`DESIGN.md` § Components › Laudo card: "Sync badge (compact)"). If compact drops the word, it becomes color-only. *Fix:* define compact = same dot + word in `meta`, or icon-only with `aria-label` and a visible word on the card's line 2.

**F-27 [low]** Reflow at 400% / 320 CSS px (SC 1.4.10) with app bar (56) + sticky bar (~72) + keypad can leave little content height. *Fix:* un-stick the action bar when viewport height < 480 CSS px; the buttons remain at the end of the sheet.

## What is already strong

- Every claimed contrast figure is correct; every semantic ink passes AA on white, on its own fill and in both themes; sync badge colours all ≥ 6.5:1. Text floor of 14px, no ALL-CAPS, tabular numerals, sentence-case labels that wrap.
- Whole-field focus (fill + 3px border) instead of a thin outline; focus border 8.66:1.
- "Word next to every colour" is honoured by Sync badge, Status pill, Progress counter, Not-tested chip, Banner, tree rows, out-of-limit helper; red reserved for the engineer's verdict, amber for suggestion.
- 56px field controls and 48px minimum, `lang="pt-BR"`, pt-BR numbers and dates, session persistence offline, no swipe gestures, no hover-only affordances, no tooltips-as-explanation, modal depth of one.
- Non-blocking design everywhere: calibration expiry, out-of-limit, missing required fields and offline state never block navigation — a real accessibility gain for cognitive load under pressure.
- Keyboard model exists (Tab = reading order, Esc closes, arrows in radio groups, Enter/Tab in tables) and just needs the completions above.
