---
name: fasor
description: Field tool for medium-voltage substation maintenance reports (relatório de cabine primária). Sober, sunlight-readable, tablet-first. Product name chosen as Releng in the brief (availability unchecked) — UI shows the literal placeholder PRODUTO until confirmed.
version: 0.8.0
status: draft
updated: 2026-09-21
sources:
  - _bmad-output/planning-artifacts/briefs/brief-fasor-2026-09-18/brief.md
  - _bmad-output/planning-artifacts/briefs/brief-fasor-2026-09-18/addendum.md
  - _bmad-output/planning-artifacts/research/market-laudos-eletricos-em-campo-2026-09-18/research.md
  - _bmad-output/planning-artifacts/research/domain-manutencao-preventiva-e-laudo-de-cabine-2026-09-18/research.md
  - _bmad-output/planning-artifacts/research/competitive-laudos-cabine-primaria-2026-09-18/research.md
  - docs/context/FO.SERV-03 Laudo Técnico de Cabine Primária.docx
  - docs/context/Planejamento_ Protótipo de sistema para relatórios técnicos em campo-transcript.txt
  - "docs/context/WhatsApp Image 2026-09-18 *.jpeg"
  - docs/concorrentes/extract-media-reference-tool.md
colors:
  # Light theme — used when the device prefers light. The theme follows the system preference; manual override in Account (see Colors).
  surface-base: '#F4F5F7'
  surface-raised: '#FFFFFF'
  surface-sunken: '#E6E9ED'
  ink-primary: '#15181D'
  ink-secondary: '#454B54'
  border-strong: '#5C6470'
  border-hairline: '#C9CED6'
  primary: '#1F4E79'
  primary-foreground: '#FFFFFF'
  focus: '#1F4E79'
  focus-fill: '#DCE8F5'
  # Checklist tri-state
  conforme: '#1B6B36'
  conforme-fill: '#DDF3E4'
  nao-conforme: '#B42318'
  nao-conforme-fill: '#FBE3E0'
  nao-aplica: '#5C6470'
  nao-aplica-fill: '#E6E9ED'
  # Sheet conclusion
  aprovado: '#1B6B36'
  reprovado: '#B42318'
  # Measured value outside the acceptance limit (suggestion, never a verdict)
  fora-do-limite: '#8A4B00'
  fora-do-limite-fill: '#FDEBD0'
  # Equipment that exists but was not tested
  nao-ensaiado: '#4A4374'
  nao-ensaiado-fill: '#E9E6F5'
  # Sync states
  sync-ok: '#1B6B36'
  sync-pending: '#8A4B00'
  sync-offline: '#454B54'
  sync-error: '#B42318'
  sync-conflict: '#4A4374'
  # Toast action: the opposite theme's primary, because the toast inverts its surface
  toast-action: '#86B6E8'
  # Dialog scrim: ink-primary at 45% over the page (dialogs, capture sheet, palette on phone)
  scrim: 'rgba(21,24,29,0.45)'
  # Dark theme — used when the device prefers dark; same sunlight contrast rules apply
  surface-base-dark: '#121417'
  surface-raised-dark: '#1C2027'
  surface-sunken-dark: '#2A2F37'
  ink-primary-dark: '#F3F4F6'
  ink-secondary-dark: '#B6BCC6'
  border-strong-dark: '#8A93A0'
  border-hairline-dark: '#343A44'
  primary-dark: '#86B6E8'
  primary-foreground-dark: '#0B1B2B'
  focus-dark: '#86B6E8'
  focus-fill-dark: '#203247'
  conforme-dark: '#6FD08F'
  conforme-fill-dark: '#173324'
  nao-conforme-dark: '#F59288'
  nao-conforme-fill-dark: '#3D1E1B'
  nao-aplica-dark: '#A9B1BC'
  nao-aplica-fill-dark: '#2A2F37'
  aprovado-dark: '#6FD08F'
  reprovado-dark: '#F59288'
  fora-do-limite-dark: '#F2B85C'
  fora-do-limite-fill-dark: '#3A2A10'
  nao-ensaiado-dark: '#BDB4E6'
  nao-ensaiado-fill-dark: '#2A2740'
  sync-ok-dark: '#6FD08F'
  sync-pending-dark: '#F2B85C'
  sync-offline-dark: '#B6BCC6'
  sync-error-dark: '#F59288'
  sync-conflict-dark: '#BDB4E6'
  toast-action-dark: '#1F4E79'
  scrim-dark: 'rgba(0,0,0,0.6)'
typography:
  # Self-contained stack (UI system TBD by architecture). Inter is the target; the fallbacks are what tablets ship with.
  display:
    fontFamily: "Inter, Roboto, 'Segoe UI', system-ui, sans-serif"
    fontSize: 28px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: '-0.01em'
  title:
    fontFamily: "Inter, Roboto, 'Segoe UI', system-ui, sans-serif"
    fontSize: 22px
    fontWeight: '600'
    lineHeight: '1.25'
  heading:
    fontFamily: "Inter, Roboto, 'Segoe UI', system-ui, sans-serif"
    fontSize: 18px
    fontWeight: '600'
    lineHeight: '1.3'
  body:
    fontFamily: "Inter, Roboto, 'Segoe UI', system-ui, sans-serif"
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  field-input:
    fontFamily: "Inter, Roboto, 'Segoe UI', system-ui, sans-serif"
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.4'
  value:
    fontFamily: "Inter, Roboto, 'Segoe UI', system-ui, sans-serif"
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.3'
    note: 'font-variant-numeric: tabular-nums. Measured readings and calculated indices only.'
  label:
    fontFamily: "Inter, Roboto, 'Segoe UI', system-ui, sans-serif"
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.4'
  meta:
    fontFamily: "Inter, Roboto, 'Segoe UI', system-ui, sans-serif"
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.4'
rounded:
  sm: 4px
  md: 8px
  lg: 12px
  full: 9999px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 24px
  '6': 32px
  '7': 48px
  touch-min: 48px
  touch-field: 56px
  gutter-phone: 16px
  gutter-tablet: 24px
  gutter-desktop: 32px
  content-max: 880px
  breakpoint-tablet: 768px
  breakpoint-desktop: 1280px
  rail-width: 320px
  thumb-inline: 64px
  thumb-grid: 96px
components:
  app-bar:
    background: '{colors.surface-raised}'
    foreground: '{colors.ink-primary}'
    border-bottom: '1px solid {colors.border-hairline}'
    height: '{spacing.touch-field}'
  sync-badge:
    radius: '{rounded.full}'
    typography: '{typography.label}'
    ok: '{colors.sync-ok}'
    pending: '{colors.sync-pending}'
    offline: '{colors.sync-offline}'
    error: '{colors.sync-error}'
    conflict: '{colors.sync-conflict}'
  toast:
    background: '{colors.ink-primary}'
    foreground: '{colors.surface-raised}'
    action: '{colors.toast-action}'
    radius: '{rounded.md}'
  banner:
    # warning variant (default)
    background: '{colors.fora-do-limite-fill}'
    foreground: '{colors.fora-do-limite}'
    border-left: '4px solid {colors.fora-do-limite}'
    # conflict variant
    conflict-background: '{colors.nao-ensaiado-fill}'
    conflict-foreground: '{colors.sync-conflict}'
    conflict-border-left: '4px solid {colors.sync-conflict}'
    # info variant
    info-background: '{colors.focus-fill}'
    info-foreground: '{colors.primary}'
    info-border-left: '4px solid {colors.primary}'
    radius: '{rounded.sm}'
  conflict-view:
    background: '{colors.surface-raised}'
    column-divider: '2px solid {colors.border-strong}'
    changed-cell-background: '{colors.nao-ensaiado-fill}'
    column-title: '{typography.label}'
  button-primary:
    background: '{colors.primary}'
    foreground: '{colors.primary-foreground}'
    radius: '{rounded.md}'
    min-height: '{spacing.touch-min}'
  button-secondary:
    background: '{colors.surface-raised}'
    foreground: '{colors.primary}'
    border: '2px solid {colors.primary}'
    radius: '{rounded.md}'
    min-height: '{spacing.touch-min}'
  button-destructive:
    background: '{colors.surface-raised}'
    foreground: '{colors.nao-conforme}'
    border: '2px solid {colors.nao-conforme}'
    radius: '{rounded.md}'
    min-height: '{spacing.touch-min}'
  sticky-action-bar:
    background: '{colors.surface-raised}'
    border-top: '1px solid {colors.border-hairline}'
    padding: '{spacing.3} {spacing.4}'
  camera-capture-button:
    size: '{spacing.touch-field}'
    background: '{colors.primary}'
    foreground: '{colors.primary-foreground}'
    radius: '{rounded.md}'
    glyph-size: '28px'
    tile-min-height: '96px'
    tile-border: '2px dashed {colors.border-strong}'
    tile-typography: '{typography.body}'
  dictation-button:
    size: '{spacing.touch-min}'
    foreground: '{colors.primary}'
    border: '2px solid {colors.primary}'
    radius: '{rounded.full}'
    listening-background: '{colors.focus-fill}'
    listening-typography: '{typography.label}'
  combobox:
    background: '{colors.surface-raised}'
    border: '2px solid {colors.border-strong}'
    focus-border: '3px solid {colors.focus}'
    focus-background: '{colors.focus-fill}'
    radius: '{rounded.sm}'
    min-height: '{spacing.touch-field}'
    typography: '{typography.field-input}'
  status-pill:
    radius: '{rounded.full}'
    typography: '{typography.label}'
    border: '1.5px solid currentColor'
  relatorio-card:
    background: '{colors.surface-raised}'
    border: '1px solid {colors.border-hairline}'
    radius: '{rounded.lg}'
    padding: '{spacing.4}'
  block-card:
    background: '{colors.surface-raised}'
    border: '1px solid {colors.border-strong}'
    radius: '{rounded.md}'
    padding: '{spacing.3} {spacing.4}'
    min-height: '{spacing.touch-field}'
    handle-color: '{colors.ink-secondary}'
    handle-hit-area: '{spacing.touch-min}'
  overflow-menu:
    trigger-hit-area: '{spacing.touch-min}'
    background: '{colors.surface-raised}'
    border: '1px solid {colors.border-strong}'
    radius: '{rounded.md}'
    item-min-height: '{spacing.touch-min}'
    item-typography: '{typography.body}'
  block-palette:
    background: '{colors.surface-base}'
    border-left: '1px solid {colors.border-hairline}'
    item-min-height: '{spacing.touch-field}'
  quantity-stepper:
    button-size: '{spacing.touch-min}'
    border: '2px solid {colors.border-strong}'
    radius: '{rounded.md}'
    value-typography: '{typography.value}'
  relatorio-tree:
    row-min-height: '{spacing.touch-field}'
    indent: '{spacing.5}'
    chevron-hit-area: '{spacing.touch-min}'
    selected-background: '{colors.focus-fill}'
    selected-rule: '4px solid {colors.primary}'
  sheet-header:
    background: '{colors.surface-base}'
    border-bottom: '2px solid {colors.border-strong}'
    title: '{typography.title}'
    meta: '{typography.meta}'
  progress-counter:
    pending-color: '{colors.fora-do-limite}'
    complete-color: '{colors.conforme}'
    typography: '{typography.label}'
  section-stepper:
    height: '{spacing.touch-min}'
    background: '{colors.surface-raised}'
    step-typography: '{typography.label}'
    step-foreground: '{colors.ink-secondary}'
    current-foreground: '{colors.primary}'
    current-rule: '3px solid {colors.primary}'
    missing-count-color: '{colors.fora-do-limite}'
    complete-color: '{colors.conforme}'
  bulk-action-bar:
    background: '{colors.surface-base}'
    border: '1px solid {colors.border-hairline}'
    radius: '{rounded.md}'
    min-height: '{spacing.touch-field}'
    action-typography: '{typography.body}'
    action-foreground: '{colors.primary}'
  tri-state-control:
    segment-min-width: '{spacing.touch-field}'
    segment-min-height: '{spacing.touch-field}'
    border: '2px solid {colors.border-strong}'
    radius: '{rounded.md}'
    letter-typography: '{typography.heading}'
    c-selected: '{colors.conforme-fill}'
    c-foreground: '{colors.conforme}'
    nc-selected: '{colors.nao-conforme-fill}'
    nc-foreground: '{colors.nao-conforme}'
    na-selected: '{colors.nao-aplica-fill}'
    na-foreground: '{colors.nao-aplica}'
  checklist-row:
    min-height: '{spacing.touch-field}'
    divider: '1px solid {colors.border-hairline}'
    label: '{typography.body}'
  measurement-field:
    typography: '{typography.value}'
    unit-typography: '{typography.label}'
    border: '2px solid {colors.border-strong}'
    radius: '{rounded.sm}'
    min-height: '{spacing.touch-field}'
    out-of-limit-background: '{colors.fora-do-limite-fill}'
    out-of-limit-border: '2px solid {colors.fora-do-limite}'
    unit-control-min-width: '{spacing.touch-min}'
    unit-control-divider: '2px solid {colors.border-strong}'
    outlier-helper-color: '{colors.fora-do-limite}'
  measurement-table:
    header-background: '{colors.surface-base}'
    header-typography: '{typography.label}'
    cell-typography: '{typography.value}'
    row-divider: '1px solid {colors.border-hairline}'
    calculated-foreground: '{colors.ink-secondary}'
  read-display-button:
    min-height: '{spacing.touch-min}'
    foreground: '{colors.primary}'
    border: '2px solid {colors.primary}'
    radius: '{rounded.md}'
    typography: '{typography.label}'
  instrument-picker:
    code-typography: '{typography.value}'
    detail-typography: '{typography.meta}'
    expired-color: '{colors.fora-do-limite}'
  conclusion-control:
    aprovado-selected: '{colors.conforme-fill}'
    aprovado-foreground: '{colors.aprovado}'
    reprovado-selected: '{colors.nao-conforme-fill}'
    reprovado-foreground: '{colors.reprovado}'
    restricoes-selected: '{colors.fora-do-limite-fill}'
    restricoes-foreground: '{colors.fora-do-limite}'
    sem-restricoes-selected: '{colors.nao-aplica-fill}'
    sem-restricoes-foreground: '{colors.nao-aplica}'
    segment-min-height: '{spacing.touch-field}'
    radius: '{rounded.md}'
  observation-field:
    typography: '{typography.field-input}'
    border: '2px solid {colors.border-strong}'
    required-border: '2px solid {colors.nao-conforme}'
    radius: '{rounded.sm}'
    min-height: '96px'
  suggestion-field:
    suggested-background: '{colors.fora-do-limite-fill}'
    suggested-border: '2px solid {colors.fora-do-limite}'
    verify-border: '2px dashed {colors.fora-do-limite}'
    pill-typography: '{typography.label}'
    pill-color: '{colors.fora-do-limite}'
    crop-size: '48px'
    crop-radius: '{rounded.sm}'
    crop-border: '1px solid {colors.border-strong}'
    confirm-min-height: '{spacing.touch-min}'
    plate-crop-max-height: '160px'
  chip:
    min-height: '{spacing.touch-min}'
    background: '{colors.surface-raised}'
    border: '2px solid {colors.border-strong}'
    radius: '{rounded.full}'
    typography: '{typography.label}'
  not-tested-chip:
    background: '{colors.nao-ensaiado-fill}'
    foreground: '{colors.nao-ensaiado}'
    radius: '{rounded.full}'
    typography: '{typography.label}'
  photo-tile:
    radius: '{rounded.md}'
    border: '1px solid {colors.border-strong}'
    number-badge-background: '{colors.ink-primary}'
    number-badge-foreground: '{colors.surface-raised}'
    caption-typography: '{typography.meta}'
    thumb-size: '96px'
    thumb-inline: '{spacing.thumb-inline}'
    pending-pill-background: '{colors.fora-do-limite-fill}'
    pending-pill-foreground: '{colors.fora-do-limite}'
    error-pill-border: '2px solid {colors.nao-conforme}'
    error-pill-foreground: '{colors.nao-conforme}'
  photo-viewer:
    background: '{colors.ink-primary}'
    foreground: '{colors.surface-raised}'
    caption-typography: '{typography.body}'
    control-min-height: '{spacing.touch-min}'
  photo-capture-sheet:
    background: '{colors.surface-raised}'
    radius: '{rounded.lg} {rounded.lg} 0 0'
    option-min-height: '{spacing.touch-field}'
  caption-composer:
    select-min-height: '{spacing.touch-field}'
    preview-typography: '{typography.body}'
    preview-background: '{colors.surface-base}'
  point-of-attention-card:
    background: '{colors.surface-raised}'
    border: '1px solid {colors.border-strong}'
    radius: '{rounded.md}'
    title: '{typography.heading}'
  registry-row:
    min-height: '{spacing.touch-field}'
    divider: '1px solid {colors.border-hairline}'
    primary-text: '{typography.body}'
    secondary-text: '{typography.meta}'
  export-dialog:
    background: '{colors.surface-raised}'
    radius: '{rounded.lg}'
    option-min-height: '{spacing.touch-field}'
  confirm-dialog:
    background: '{colors.surface-raised}'
    radius: '{rounded.lg}'
    title: '{typography.heading}'
  login-form:
    field-min-height: '{spacing.touch-field}'
    max-width: '400px'
  text-button:
    foreground: '{colors.primary}'
    destructive-foreground: '{colors.nao-conforme}'
    typography: '{typography.body}'
    min-height: '{spacing.touch-min}'
    padding: '0 {spacing.3}'
  tabs:
    background: '{colors.surface-raised}'
    border-bottom: '1px solid {colors.border-hairline}'
    tab-min-height: '{spacing.touch-field}'
    tab-typography: '{typography.label}'
    tab-foreground: '{colors.ink-secondary}'
    selected-foreground: '{colors.primary}'
    selected-rule: '3px solid {colors.primary}'
  toggle:
    track-size: '52px 32px'
    track-border: '2px solid {colors.border-strong}'
    knob-size: '20px'
    knob-off: '{colors.border-strong}'
    on-background: '{colors.primary}'
    knob-on: '{colors.primary-foreground}'
    word-typography: '{typography.label}'
    hit-area: '{spacing.touch-min}'
  checkbox:
    box-size: '28px'
    border: '2px solid {colors.border-strong}'
    radius: '{rounded.sm}'
    checked-background: '{colors.primary}'
    checked-foreground: '{colors.primary-foreground}'
    row-min-height: '{spacing.touch-field}'
  section-band:
    background: '{colors.surface-raised}'
    border: '1px solid {colors.border-hairline}'
    radius: '{rounded.lg}'
    number-size: '32px'
    number-background: '{colors.primary}'
    number-foreground: '{colors.primary-foreground}'
    title: '{typography.heading}'
    note: '{typography.meta}'
    body-padding: '{spacing.5}'
  status-board:
    tile-background: '{colors.surface-raised}'
    tile-border: '1px solid {colors.border-hairline}'
    tile-radius: '{rounded.lg}'
    tile-min-height: '{spacing.touch-field}'
    count-typography: '{typography.display}'
    zero-count-foreground: '{colors.ink-secondary}'
    gap: '{spacing.3}'
  shortcut-card:
    background: '{colors.surface-raised}'
    border: '1px solid {colors.border-strong}'
    radius: '{rounded.md}'
    min-height: '{spacing.touch-field}'
    title-typography: '{typography.body}'
    sub-typography: '{typography.meta}'
  relatorio-row:
    min-height: '{spacing.touch-field}'
    divider: '1px solid {colors.border-hairline}'
    title-typography: '{typography.body}'
    meta-typography: '{typography.meta}'
    chevron-hit-area: '{spacing.touch-min}'
    header-typography: '{typography.label}'
  form-dialog:
    background: '{colors.surface-raised}'
    radius: '{rounded.lg}'
    max-width: '640px'
    title: '{typography.heading}'
    option-min-height: '{spacing.touch-field}'
    option-border: '2px solid {colors.border-strong}'
    option-selected-border: '2px solid {colors.primary}'
    option-selected-background: '{colors.focus-fill}'
  segmented-control:
    border: '2px solid {colors.border-strong}'
    radius: '{rounded.md}'
    segment-min-height: '{spacing.touch-min}'
    segment-typography: '{typography.body}'
    selected-background: '{colors.focus-fill}'
    selected-foreground: '{colors.primary}'
  settings-row:
    min-height: '{spacing.touch-field}'
    divider: '1px solid {colors.border-hairline}'
    label-typography: '{typography.label}'
    value-typography: '{typography.body}'
  sync-status-row:
    min-height: '{spacing.touch-field}'
    divider: '1px solid {colors.border-hairline}'
    primary-typography: '{typography.body}'
    secondary-typography: '{typography.meta}'
    state-typography: '{typography.label}'
    pending-color: '{colors.sync-pending}'
    ok-color: '{colors.sync-ok}'
    progress-height: '4px'
    progress-track: '{colors.border-hairline}'
    progress-fill: '{colors.primary}'
    progress-width: '120px'
  read-only-field:
    background: '{colors.surface-base}'
    border: '2px solid {colors.border-hairline}'
    typography: '{typography.field-input}'
  data-table:
    background: '{colors.surface-raised}'
    border: '1px solid {colors.border-strong}'
    header-background: '{colors.surface-base}'
    header-typography: '{typography.label}'
    cell-typography: '{typography.body}'
    criterion-typography: '{typography.value}'
    row-divider: '1px solid {colors.border-hairline}'
  filter-chip:
    min-height: '{spacing.touch-min}'
    border: '2px solid {colors.border-strong}'
    radius: '{rounded.full}'
    typography: '{typography.label}'
    selected-background: '{colors.focus-fill}'
    selected-border: '2px solid {colors.primary}'
    selected-foreground: '{colors.primary}'
  priority-pill:
    radius: '{rounded.full}'
    typography: '{typography.label}'
    border: '1.5px solid currentColor'
    p0-foreground: '{colors.nao-conforme}'
    p0-background: '{colors.nao-conforme-fill}'
    p1-foreground: '{colors.fora-do-limite}'
    p1-background: '{colors.fora-do-limite-fill}'
    neutral-foreground: '{colors.ink-primary}'
    neutral-background: '{colors.surface-base}'
    min-height: '28px'
  priority-picker:
    option-min-height: '{spacing.touch-field}'
    option-border: '2px solid {colors.border-strong}'
    option-selected-border: '2px solid {colors.primary}'
    option-selected-background: '{colors.focus-fill}'
    option-radius: '{rounded.md}'
    label-typography: '{typography.body}'
    hint-typography: '{typography.meta}'
    hint-foreground: '{colors.ink-secondary}'
    gap: '{spacing.2}'
  generated-text-field:
    background: '{colors.fora-do-limite-fill}'
    border: '2px solid {colors.fora-do-limite}'
    radius: '{rounded.sm}'
    typography: '{typography.field-input}'
    title-typography: '{typography.label}'
    pill-typography: '{typography.label}'
    pill-color: '{colors.fora-do-limite}'
    min-height: '96px'
    action-min-height: '{spacing.touch-min}'
  criteria-line:
    typography: '{typography.meta}'
    foreground: '{colors.ink-secondary}'
    value-typography: '{typography.label}'
    separator: '·'
    padding: '{spacing.2} 0 0'
  photo-stamp:
    typography: '{typography.meta}'
    foreground: '{colors.ink-secondary}'
    pin-glyph-size: '16px'
    viewer-typography: '{typography.body}'
    viewer-foreground: '{colors.surface-raised}'
  brand-preview:
    background: '{colors.surface-base}'
    border: '1px solid {colors.border-strong}'
    radius: '{rounded.md}'
    padding: '{spacing.4}'
    page-background: '{colors.surface-raised}'
    page-border: '1px solid {colors.border-hairline}'
    placeholder-fill: '{colors.border-hairline}'
    label-typography: '{typography.label}'
    min-height: '160px'
  doc-control:
    background: '{colors.surface-raised}'
    border: '1px solid {colors.border-strong}'
    radius: '{rounded.sm}'
    title-typography: '{typography.heading}'
    key-typography: '{typography.label}'
    key-foreground: '{colors.ink-secondary}'
    key-column-width: '200px'
    value-typography: '{typography.body}'
    row-min-height: '{spacing.touch-min}'
    row-divider: '1px solid {colors.border-hairline}'
  parecer-box:
    border: '2px solid currentColor'
    radius: '{rounded.md}'
    padding: '{spacing.4}'
    title-typography: '{typography.heading}'
    body-typography: '{typography.body}'
    apto-foreground: '{colors.aprovado}'
    apto-background: '{colors.conforme-fill}'
    restricoes-foreground: '{colors.fora-do-limite}'
    restricoes-background: '{colors.fora-do-limite-fill}'
    nao-apto-foreground: '{colors.reprovado}'
    nao-apto-background: '{colors.nao-conforme-fill}'
  rich-text:
    background: '{colors.surface-raised}'
    border: '2px solid {colors.border-strong}'
    radius: '{rounded.sm}'
    toolbar-background: '{colors.surface-base}'
    toolbar-border-bottom: '1px solid {colors.border-hairline}'
    toolbar-button-size: '{spacing.touch-min}'
    typography: '{typography.field-input}'
    min-height: '160px'
    variable-chip-background: '{colors.focus-fill}'
    variable-chip-foreground: '{colors.primary}'
    variable-chip-radius: '{rounded.sm}'
---

## Brand & Style

The product was named *Releng* in the brief (availability unchecked) and has no visual identity. Wherever the name would appear, the UI shows the literal placeholder **PRODUTO** until the name is confirmed (decision recorded in `.memlog.md`, the decision log cited as "memlog" throughout). What it does have is a job: replace the handwritten A4 sheet that a field engineer fills out inside a de-energized medium-voltage substation, and produce the company's own report (FO.SERV-03) the same day.

The identity created here follows one constraint the user set: **sober colors, chosen for readability under direct sunlight** — high contrast, no reliance on mid-tones to carry meaning. The look is a well-printed test sheet, not a consumer app: white paper, black ink, one deep blue for actions, and a small set of semantic colors that mean exactly one thing each (conforme / não conforme / não se aplica; aprovado / reprovado; fora do limite; não ensaiado; sync state). Every semantic color is paired with a text label or icon, so the meaning survives a washed-out screen.

GroundPRO's dark-green theme is a reference the design partner admires; it is not a direction (memlog). **The theme follows the device's system preference** (light or dark), with a manual override in Account — Sistema / Claro / Escuro (memlog). Both themes are required, and both obey the same sunlight contrast rules: a tablet set to dark is still carried outdoors, and a light screen at full brightness is itself glare inside a dim cubicle.

**The Fasor Engenharia brand (orange triangle logo, wordmark, header/footer) appears only inside the generated document, never in the application.** The app is being built as a SaaS MVP for a design partner, not as Fasor's tool. The company brand is edited in one place only, **Registries › Empresa** (razão social, CNPJ, address lines, logo, cover background, watermark, form title, form code and form revision), where a Brand preview shows the cover, the header and the footer as they will print; the app chrome keeps PRODUTO whatever the profile holds [ASSUMPTION — reference tool 2026-09-18].

→ Visual anchor for what the app replaces: `imports/fichas-fo-serv-03/` (94 rendered sheets; for example `image83.png` = incoming cables with substation characteristics block, `image100.png` = disconnector with open/closed insulation + contact resistance, `image120.png` = TC with ratio test and dropped labels, `image160.png` = generator-bus disconnector). Structural inventory: `imports/extract-fo-serv-03.md`. UX references the user admires: `docs/concorrentes/extract-fotos-whatsapp.md`. Research-derived constraints: `.working/extract-research.md`. High-fidelity static mocks of every surface: `mockups/index.html` (gallery; `mockups/tokens.css` and `mockups/components.css` are derived 1:1 from this file); `status: draft` remains until the design partner has reviewed them. **The spines win on conflict with any import or mock** — where a mock and this file disagree, the mock is corrected.

→ Mock: `mockups/index.html` (the whole set at a glance), `mockups/key-home.html` (the look on the first screen: wordmark, status board, relatório cards).

## Colors

The active theme follows the device preference (`prefers-color-scheme`) unless the user overrides it in Account; dark tokens carry the `-dark` suffix and every light token has a dark pair. Ratios are WCAG contrast ratios computed for this palette, light / dark where both were measured.

| Token | Light | Dark | Ratio (light / dark) | Used for |
|---|---|---|---|---|
| `surface-base` | `#F4F5F7` | `#121417` | — | The page. |
| `surface-raised` | `#FFFFFF` | `#1C2027` | — | Cards, bottom sheets, dialogs, inputs. |
| `surface-sunken` | `#E6E9ED` | `#2A2F37` | — | Neutral chips and pills that must read as "not a status": Priority pill P2–P4, Criteria line background [ASSUMPTION — reference tool 2026-09-18]. |
| `ink-primary` | `#15181D` | `#F3F4F6` | 17.8:1 / 14.8:1 on raised | All body text and values. |
| `ink-secondary` | `#454B54` | `#B6BCC6` | 8.8:1 on raised (light) | Labels, meta, calculated values. |
| `border-strong` | `#5C6470` | `#8A93A0` | 6.0:1 on raised (light) | Input borders, block cards, table rules. |
| `border-hairline` | `#C9CED6` | `#343A44` | — | List dividers only. |
| `primary` | `#1F4E79` | `#86B6E8` | White on primary 8.7:1 / dark foreground on primary-dark 8.2:1 | The only chromatic action color: primary buttons, selected tree row, links. |
| `focus` + `focus-fill` | `#1F4E79` + `#DCE8F5` | `#86B6E8` + `#203247` | Ink on focus fill 14.3:1; ring 8.7:1 / 7.7:1 | Active field border + background; ring on non-inputs. |
| `toast-action` | `#86B6E8` | `#1F4E79` | 8.4:1 on the dark toast / 7.9:1 on the light toast | Toast action text (`{components.toast.action}`). |
| `scrim` | `rgba(21,24,29,0.45)` | `rgba(0,0,0,0.6)` | — | Layer under dialogs, the Photo capture sheet and the phone Block palette (`{colors.scrim}`). |
| `conforme` + fill | `#1B6B36` / `#DDF3E4` | `#6FD08F` / `#173324` | 6.6:1 on white; 5.6:1 on fill | C segment; Aprovado; `sync-ok`; Parecer box *Apto*. |
| `nao-conforme` + fill | `#B42318` / `#FBE3E0` | `#F59288` / `#3D1E1B` | 6.6:1 on white; 5.4:1 on fill | NC segment; Reprovado; `sync-error`; Priority pill P0; Parecer box *Não apto*. |
| `nao-aplica` + fill | `#5C6470` / `#E6E9ED` | `#A9B1BC` / `#2A2F37` | 6.0:1 on white; 4.9:1 on fill | NA segment; Sem restrições. |
| `fora-do-limite` + fill | `#8A4B00` / `#FDEBD0` | `#F2B85C` / `#3A2A10` | 6.8:1 on white; 5.8:1 on fill | Out-of-limit values; Com restrições; "Sugerido" and "Verificar" (Suggestion field); the conclusion suggestion; the outlier helper; `sync-pending`; warning Banner; Priority pill P1; Parecer box *Apto com restrições*; Generated text field until confirmed. |
| `nao-ensaiado` + fill | `#4A4374` / `#E9E6F5` | `#BDB4E6` / `#2A2740` | 9.0:1 on white | Not-tested chip and band; `sync-conflict`; conflict Banner and changed cells. |

**Surfaces and ink.** Surface base is slightly off-white so raised cards read as cards, but close enough to white that a sunlit screen still has full luminance to spend. Ink secondary is deliberately dark; there is no "disabled gray" text tone — disabled controls use `border-hairline` and reduced opacity on the whole control, never a lighter ink. Border strong keeps a field edge visible outdoors; border hairline is never the sole boundary of an interactive element.

**Focus.** The active field changes its whole background to `focus-fill` and gets a 3px `focus` border, lifted from the GroundPRO screenshots (`docs/concorrentes/extract-fotos-whatsapp.md` §8): with gloves and glare the engineer must know without doubt which field is live. Non-input elements (buttons, tree rows, cards, tiles, chips, the Sync badge, dialog options) take a 3px `focus` ring with 2px offset around their full hit area.

**Toast action and scrim.** The toast inverts its surface (`ink-primary` background in light, `ink-primary-dark` in dark), so its action text uses the *opposite* theme's primary: `toast-action` = the `primary-dark` value in light and the `primary` value in dark. The scrim is ink-primary at 45% in light so the page stays legible behind a dialog, plain black at 60% in dark.

**Checklist tri-state** (the C / NC / NA columns of every sheet). NA is neutral on purpose: not a lesser "conforme".

**Sheet conclusion.** Aprovado reuses the conforme green, Reprovado the não-conforme red. The restrictions pair (Sem / Com restrições) uses `fora-do-limite` amber for *Com restrições* because a restriction is a flag, not a failure.

**Fora do limite.** A measured value outside the acceptance limit printed on the sheet (for example 330 MΩ against ">400 MΩ"). Amber, not red, on purpose: the app highlights and suggests *Com restrições*; the engineer decides (memlog: never auto-decided; criteria are data with a source). Red is reserved for what the engineer has declared non-conforming. [ASSUMPTION — Open Questions] The same amber is the one color of "proposed, not confirmed": every value the app read, copied or computed — plate fields, display readings, dictation, captions, the conclusion line — sits on `fora-do-limite-fill` with a text pill ("Sugerido", or "Verificar" with a dashed border for an ungrounded guess) until the engineer taps it (`EXPERIENCE.md` § Smart Input).

**Não ensaiado.** Equipment that exists in the relatório but was not tested, with a reason. Today these vanish into prose in section 8 (memlog). A muted violet keeps them visible without reading as pass or fail.

**Sync states.** `sync-ok` (green), `sync-pending` (amber, local changes waiting), `sync-offline` (dark gray, no connection, nothing lost), `sync-error` (red, upload failed and needs attention), `sync-conflict` (violet; a decision is pending: another user changed the same sheet, or a structure conflict — block removed vs. edited, duplicate TAG). The violet also carries the conflict Banner and the Conflict view's changed cells, on `nao-ensaiado-fill`. Always paired with a word; the badge is never color-only.

**Where the 7:1 target applies.** The ≥ 7:1 bar is for ink on surfaces — body, values, labels and meta in `ink-primary` (16.3–17.8:1), `ink-secondary` (8.1–8.8:1) and `primary` (7.9–8.7:1) on `surface-base` / `surface-raised`, in both themes. Semantic inks drawn on their own fills — the C / NC / NA letters on a selected segment, the out-of-limit helper, the *Com restrições* segment — meet at least 4.5:1 — 5.6 (conforme) / 5.4 (não conforme) / 4.9 (não se aplica) / 5.8 (fora do limite) in light, 6.2–7.8:1 in dark. The letter, set in `heading` weight, carries the state; the fill is secondary.

→ Mock: `mockups/key-home.html` (frame 2, the same Home in dark), `mockups/key-equipment-sheet.html` (frame 3, sheet in dark), `mockups/key-sync-status.html` (frame 3, the five Sync badge states side by side).

## Typography

One family, **Inter** (fallback Roboto → Segoe UI → system-ui), chosen for large x-height and unambiguous digits at small sizes. Numerals are always `tabular-nums` so columns of readings align, and measured values render in `value` (20px, 600) — larger and heavier than body text because the reading is the thing the engineer checks against the limit.

The ramp is deliberately larger than a desktop default: `body` 16px, `field-input` 18px, `value` 20px, `heading` 18px, `title` 22px, `display` 28px (display appears only on Home and the export result). `label` and `meta` are 14px, the floor; nothing in the app is set below 14px. No ALL-CAPS labels — the current sheets truncate uppercase Excel labels ("TENSÃO SECUNDÁ", "CAPACIDADE INTERRU", `imports/extract-fo-serv-03.md` §6.5); labels here are sentence case and wrap rather than clip.

Units are set in `label` next to the value, never inside the number string ("330" + "MΩ", not "330MΩ"), so the unit can be a control (MΩ / GΩ / TΩ) where the sheet needs one.

→ Mock: `mockups/key-equipment-sheet.html` (the ramp on one sheet: `value` readings with `label` units, sentence-case labels that wrap, `title` header).

## Layout & Spacing

4px base scale: 4 / 8 / 12 / 16 / 24 / 32 / 48. Touch targets: `touch-min` 48px for any tappable element, `touch-field` 56px for the controls used with gloves on — tri-state segments, measurement fields, conclusion segments, tree rows, palette items [ASSUMPTION — Open Questions].

**Hit areas.** Every element with a tap behavior in `EXPERIENCE.md` has a hit area of at least 48×48px (`touch-min`), whether or not its visible glyph or pill is smaller: drag handles, overflow buttons, tree chevrons, the Sync badge, App bar back and avatar, the unit control inside a Measurement field, quick chips, text buttons, toast actions, the "Tap TAG" affordance in the Sheet header, the rail toggle. Padding or a pseudo-element supplies the difference. Block cards are at least `touch-field` tall. Decorative marks (the palette "+", the photo number badge, state glyphs) are not interactive and carry no hit area of their own — the row or tile is the target.

Breakpoints: `breakpoint-tablet` 768px, `breakpoint-desktop` 1280px; the persistent Relatório tree rail is `rail-width` 320px (behavior in `EXPERIENCE.md` § Responsive & Platform). Measurement value cells are 200px wide at tablet/desktop (layout guidance, not a token): wide enough for "3.700" + a unit control, narrow enough for three readings per row on a 768px tablet. Gutters: 16px phone, 24px tablet, 32px desktop. Content column capped at `content-max` 880px; the equipment sheet is single-column at every width (one field per row, unit beside it, like the Mesh "Dados de placa" form in `docs/concorrentes/extract-fotos-whatsapp.md` §11). Desktop uses the extra width for a persistent Relatório tree on the left, not for wider forms.

**Collapsed rail** (tablet portrait): a 48px strip in `surface-raised` with a hairline right edge, the toggle (48×56px) at the top and the vertical label "Árvore do relatório" in `label` / `ink-secondary` beneath it — never an unlabeled icon.

Sticky bottom action bar on phone and tablet for the sheet's Next and camera: the Section stepper (48px) above a 56px button row with the Camera capture button at the left; keyboard, unstick and docking rules in § Components › Sticky action bar. **Source crops** (the region of a photo an OCR value came from) are 48px thumbnails (`{components.suggestion-field.crop-size}`, `{rounded.sm}`) beside the value, never larger inline — the full region opens in the Photo viewer. Modal stacks one level deep.

→ Mock: `mockups/key-relatorio-overview.html` (rail 320px in landscape, 48px collapsed strip in portrait, tree as its own surface on phone), `mockups/key-equipment-sheet.html` (single-column sheet at 768 and 390, sticky bar).

## Elevation & Depth

Depth is drawn with borders, not shadows. Cards sit on `surface-base` with a `border-hairline`; interactive cards (block cards, point-of-attention cards, photo tiles) use `border-strong`. The Relatório card keeps its hairline as decoration: its affordance is the title and a trailing chevron, not the edge. Shadows appear only on the two things that float above content: the Photo capture sheet and dialogs (`0 8px 24px rgba(0,0,0,0.24)`), always over the `{colors.scrim}` layer. Under sunlight a soft shadow disappears anyway; a 1–2px border does not.

→ Mock: `mockups/key-export.html` (dialog over scrim on tablet), `mockups/key-photos.html` (capture sheet on phone, the one shadow).

## Shapes

`{rounded.sm}` 4px for inputs and table cells (they should look like a form, not a chat bubble). `{rounded.md}` 8px for buttons, block cards, segmented controls, photo tiles. `{rounded.lg}` 12px for Relatório cards, dialogs and the Photo capture sheet. `{rounded.full}` only on status pills, sync badge, not-tested chip and photo number badges. Thumbnails follow their tile's corners.

→ Mock: `mockups/key-equipment-sheet.html` (4px inputs and cells, 8px buttons and block cards, 12px dialogs, full-round pills).

## Components

Visual spec only; behavior lives in `EXPERIENCE.md` § Component Patterns under the same names, in the same six groups and the same order.

**Shell & feedback**

| Component | Visual spec |
|---|---|
| **App bar** | 56px, `surface-raised`, hairline bottom. Left: back or PRODUTO wordmark (plain `title` text, no logo). Center: surface title in `heading`. Right: Sync badge, then avatar initial. Never shows client or Fasor branding. |
| **Sync badge** | Pill, `label`, dot + word. Colors per state from `{components.sync-badge}`; word always present ("Sincronizado", "3 pendentes", "Sem conexão", "Erro", "Conflito"). Hit area ≥ 48×48px around the pill. Compact variant (Relatório card) = same dot + word in `meta`; never dot-only. The dot is decorative (`aria-hidden`). |
| **Status pill** | Outline pill in `label`, color = the state's ink: Rascunho `ink-secondary`, Em campo `primary`, Em revisão `fora-do-limite`, Emitido `conforme`. |
| **Toast** | Bottom-center, `ink-primary` background with `surface-raised` text (inverted in dark), `{rounded.md}`, one line of `body` + optional action in `{components.toast.action}` — the opposite theme's primary (see Colors). Action hit area ≥ 48px tall. Max one visible. |
| **Banner** | Full-width strip under the app bar or at top of a sheet; 4px left rule, text in `body`, actions as text buttons ≥ 48px tall. **One slot per surface**; when more conditions hold, a "+2" Chip at the right end of the strip opens Sync status. Three variants from `{components.banner}`: **warning** (amber; calibration expiry, storage, "relatório emitido"), **conflict** (violet `sync-conflict` on `nao-ensaiado-fill`; cell contradictions and structure conflicts), **info** (`primary` on `focus-fill`; install prompt, "Sugestões prontas"). Always starts with a word that names the condition. |
| **Conflict view** | Full-screen (phone) or dialog (tablet/desktop) listing **only the contradicting cells**, one 56px+ row each: the cell name in `label` ("Fase A, 1 minuto"), then two option rows drawn like Form dialog options (2px `border-strong`, selected = `primary` border + `focus-fill`, ≥ 56px): the value in `value` with author and time in `meta`, and the 48px source crop at the right when the value came from a reading. Rows that were merged by rule are not shown; a `meta` line at the top says "O resto da ficha já foi mesclado". Sticky action bar with "Aplicar". For structure conflicts (block removed vs. edited, duplicate TAG) the same layout shows one block card per side with "Manter" · "Remover". |
| **Sync status row** | 56px row, hairline divider. Left: optional 64px Photo tile or avatar; middle: item in `body` ("DJ-C13 — Coluna 13 · Disjuntor MT") + `meta` line (who · when · why; for a merge, the rule applied — "NC de Eduardo mesclado"); right: state word in `label` ("Enviando…", "Aguardando envio", "Leitura na fila", "Mesclado", "Contradição", a `<time>`) — `sync-pending` amber while in flight, `sync-ok` green when merged or sent, `sync-conflict` violet for a contradiction. Under it, when a percentage exists, a 4×120px progress line (`border-hairline` track, `primary` fill, `{rounded.full}`, decorative). Photo rows use the Photo tile's upload pill instead of the state word. Above all rows, the surface headline: state word in `title` + counts in `body` ("3 fichas e 12 fotos aguardando · 2 leituras na fila"); explanations only behind the "Como funciona" text button. |

**Actions & inputs**

| Component | Visual spec |
|---|---|
| **Button** (primary / secondary / destructive) | 48px min height, `{rounded.md}`, `heading` weight label. Primary = solid `primary`; secondary = 2px `primary` outline; destructive = 2px `nao-conforme` outline, never a red fill. <br>Disabled: 40% opacity on the whole button, no color change, **always accompanied by the reason in `label` / `ink-secondary` beside it** (behavior in `EXPERIENCE.md`) so opacity is never the only signal; the button stays focusable. |
| **Text button** | Label-only action: `body` 600 in `primary` (destructive variant in `nao-conforme`), no border, no fill, 12px horizontal padding, hit area ≥ 48px tall. Used inside Banners, Toasts, the Measurement field helper ("Marcar Com restrições"), Sheet header TAG, "Editar texto", "Ver todos", "Desfazer".<br>Disabled: 40% opacity + reason text, like Button. |
| **Sticky action bar** | `surface-raised`, hairline top, 12/16 padding. On the sheet: the Section stepper row (48px) above the button row; button row = Camera capture button (56×56px) at the left, then one primary + optional secondary button (the Bulk action bar's action while the checklist is in view). Elsewhere one primary + optional secondary. Buttons fill the remaining width on phone and tablet portrait, right-aligned on tablet landscape/desktop; on desktop the bar docks to the bottom of the content column.<br>Keyboard: sits above the on-screen keyboard, never under it. Unsticks (stepper and buttons remain at the end of the sheet) when the viewport is shorter than 480px. |
| **Camera capture button** | Primary-filled square 56×56px (`{components.camera-capture-button}`), `{rounded.md}`, camera glyph 28px in `primary-foreground`, `aria-label` "Tirar foto"; sits at the left of the Sticky action bar and in the gallery header. Burst state: the glyph gets a `label` count badge ("3") until "Concluir fotos". Beside it, **"Adicionar fotos"** as a secondary (outline) Button, not a Text button — adding photos after the visit is a primary need (decision 2026-09-21). On a computer, a sheet and the gallery also accept files dropped on them: while dragging, a 2px dashed `primary` outline and the `label` line "Solte para adicionar". **Tile variant** (empty nameplate group, "Fotografar equipamento"): full-width, ≥ 96px tall, 2px dashed `border-strong`, `{rounded.md}`, camera glyph + `body` 600 label ("Fotografar placa"), with the copy actions ("Copiar da última visita · Igual à SEC-C04?") as Chips above it and "Digitar" as a Text button under it. Permission denied: the reason in `label` under the button. |
| **Dictation button** | Round 48px (`{components.dictation-button}`), 2px `primary` outline, mic glyph in `primary`, `aria-label` "Ditar"; sits at the right end of an Observation field's chip row and in a Measurement table's action row. Listening: `focus-fill` background and the word "Ouvindo…" in `label` beside it (no pulsing color alone; `prefers-reduced-motion` respected). Hidden, not disabled, when unavailable. |
| **Combobox** | 56px, 2px `border-strong`, `field-input` text.<br>Focus: 3px `focus` border + `focus-fill` background. Option list below in `surface-raised` with 56px rows; the "create new" row sits last, in `primary`. On field surfaces it is reached from a Chip row's "Outro…" and opens full-screen on phone. |
| **Toggle** | Switch: 52×32px track, 2px `border-strong`, `{rounded.full}`, 20px knob in `border-strong`; on = `primary` track and `primary-foreground` knob. The state word ("Ativado" / "Desativado", or "Sempre" when locked) in `label` sits beside the track and takes `primary` when on — the word, not the color, carries the state. Hit area ≥ 48px. Sits inside a Toggle row (56px, hairline top: label in `body` + sub-line in `meta` at left, toggle at right). |
| **Checkbox** | 28px box, 2px `border-strong`, `{rounded.sm}`, on `surface-raised`; checked = `primary` fill with a `primary-foreground` check glyph (3px stroke). Always part of a 56px row whose whole width is the target; label in `body`, secondary line in `meta`. Used for multi-select lists (instruments used in Relatório setup). |
| **Segmented control** | One radiogroup drawn like a Conclusion pair: equal segments ≥ 48px tall in a 2px `border-strong` frame, `{rounded.md}`, 2px dividers; labels in `body` 600 `ink-secondary`; selected = `focus-fill` + `primary` + 2px inner ring + leading ✓ glyph. Neutral (never semantic) — Account › Tema: Sistema · Claro · Escuro; Relatório setup › Conselho: CREA · CRT (the choice relabels the two number fields beside it). |
| **Tabs** | Horizontal row on `surface-raised` with a hairline bottom, aligned to the surface gutter, **wraps to a second line on narrow widths, never scrolls sideways** (decision 2026-09-21, Playwright sweep: a scrolling row hid "Critérios de aceitação" with no cue). Each tab ≥ 56px tall, `label` in `ink-secondary`, 16px horizontal padding; selected tab in `primary` 600 with a 3px `primary` bottom rule. One selected at all times. |
| **Chip** | Pill ≥ 48px tall, 2px `border-strong`, `label` text, `{rounded.full}`; **the row wraps, with 8px gaps — it never scrolls sideways**, so the closing "Outro…" is always on screen (decision 2026-09-21: in a scrolling row the escape chip was the one a gloved hand had to hunt for). Text chips ("Observações rápidas", per-item NC phrases, Point of attention quick texts) stay outlined; value chips (recent manufacturers, activities, locations, Not-tested reasons, "Copiar da cabine anterior") take the Filter chip's pressed look when they hold the value, and the row ends with "Outro…" in `primary`. Not a state indicator (states use Status pill / Not-tested chip). |
| **Filter chip (selectable)** | The Chip with a pressed state (`aria-pressed`): selected = `focus-fill` background, 2px `primary` border, `primary` text; unselected as Chip. Same 48px height and scrolling row; exactly one selected in a filter group ("Todas" first). Gallery filter by cabine. |

**Relatório structure**

| Component | Visual spec |
|---|---|
| **Relatório card** | **Em andamento neste aparelho (`is-current`)** — 2px `primary` border instead of the hairline, title in `primary`, card first in the list; this is the Home hero and there is no separate hero card (decision 2026-09-19). `{rounded.lg}`, hairline border (decorative), 16px padding. Line 1 `heading`: client · site. Line 2 `meta`: dates · template name. Line 3: Status pill + progress counter + Sync badge (compact). Line 4 `meta`: device availability — "No aparelho · atualizado 21:40", or "Não está neste aparelho" with the card grayed to `ink-secondary` when offline and not downloaded. For a relatório *Em campo*: a full-width primary Button "Continuar: SEC-C06 · 42 de 94" as the last row, with "Ver sumário" as a Text button beside it. |
| **Relatório row** | Project list: the Relatório card as a 56px row with a hairline divider. Desktop: six columns under a `label` header row — Relatório (title `body` 600 + `meta` sub-line: responsável · device availability) · Status pill · dates (`body`, tabular) · template (`meta`) · Progress counter · 48px chevron. Tablet portrait and phone: the same row stacks into the Relatório card layout (title, dates, pills) with the chevron spanning the rows; the template column is hidden. |
| **Block card** | `{rounded.md}`, `border-strong`, min height 56px. Drag handle (six dots, `ink-secondary`, 48×48px hit area, `aria-label` "Reordenar ⟨TAG⟩") at left, block name in `body` 600, sub-block count in `meta`, Overflow menu trigger (48×48px) at right. Equipment blocks show the TAG in `value`; section blocks show the FO.SERV-03 section number. Not-tested blocks carry the Not-tested chip. Overflow menu items, in this order: "Adicionar abaixo · Subir · Descer · Duplicar · Remover" (equipment blocks add "Mover para…" after Descer and "Marcar não ensaiado" after Duplicar); "Remover" in `nao-conforme` [ASSUMPTION — reference tool 2026-09-18]. |
| **Block palette** | Right drawer (tablet/desktop) or bottom sheet (phone), `surface-base`. **Field variant** (inside a relatório on phone/tablet): the Camera capture button's tile "Fotografar equipamento" first (full width, 96px), then the 8 equipment rows only, each showing its suggested TAG in `meta` ("SEC-C09"). **Office variant:** two groups with `label` headers, "Seções" and "Equipamentos". Items are 56px rows: icon, name, decorative "+" at right — the whole row is the tap target. In the Template composer each equipment row carries a Quantity stepper, and the drawer is headed by the column of the location skeleton it fills ("Coluna 5"). |
| **Quantity stepper** | "−" and "+" buttons 48×48px, 2px `border-strong`, `{rounded.md}`, with the count in `value` between them (tabular). Zero shows "—" in `ink-secondary`. Press and hold repeats. |
| **Relatório tree** | **Sumário presentation** (the Relatório overview page, decision 2026-09-21): one 64px row per FO.SERV-03 part — at the left, **the number is the Position box** (56×40px, `value` 600, `ink-secondary`, borderless until hover or focus, when it shows the hairline field; an empty 56px slot for the cover and the document control, which are fixed), the title in `body` 600, and under it a status `meta` line in `ink-secondary` ("82 fotos · 1 sem legenda"); a status that blocks issuing ("parecer pendente") is set in `nao-conforme` with the same weight as the title, the only red on the page. At the right, the Overflow menu trigger; the whole row body opens the object. The cover and the document control rows show a `meta` note instead ("sempre no início", "montado sozinho"). Section 9's row carries the expand chevron and, when open, the location tree below it indented one level, unnumbered, with the one-line note "organizados por local aqui; no documento, agrupados como no FO.SERV-03" in `meta`. At the foot, "Pré-visualizar" (secondary Button) and "Gerar relatório" (primary Button) side by side. **Rail presentation** (inside a sheet): the location tree alone. **Both:** indented rows (24px per level), 56px tall: Cabine › Coluna/Cubículo › Equipamento; every block sits under its column from the start (no staging group). Expand/collapse chevron at the left with a 48×56px hit area, separate from the row body. Selected row: `focus-fill` + 4px `primary` left rule + `body` 600 (`aria-current`); keyboard focus keeps the 3px ring, distinct from selection. Cabine rows show `meta` "SE · 13,8 kV · 19 °C · 67 %" read-only and an Overflow menu ("Abrir primeira ficha", "Agrupar por tipo" toggle). Each equipment row ends with a state glyph + word: ✓ Concluída (`conforme`), ● Em preenchimento (`primary`), ○ Vazia (`ink-secondary`), ⊘ Não ensaiada (`nao-ensaiado`); glyphs are `aria-hidden`. |
| **Overflow menu** | Trigger: "⋯" glyph in `ink-secondary` with a 48×48px hit area and `aria-label` "Mais opções de ⟨nome⟩". Menu: `surface-raised`, `border-strong`, `{rounded.md}`, items ≥ 48px tall in `body`; destructive item in `nao-conforme`; "Adicionar abaixo · Subir · Descer" appear as a group (plus "Mover para…" on equipment blocks and tree rows); the destructive "Remover" is always last. Used by Block card, Relatório tree rows, Checklist row (observation, Limpar; "Criar ponto de atenção" is inline — `EXPERIENCE.md` › Checklist row), Point of attention card. |

**Sheet**

| Component | Visual spec |
|---|---|
| **Sheet header** | `surface-base` band, 2px `border-strong` bottom. Line 1 `title`: equipment type + TAG; the TAG is a text button with a 48px hit area and a pencil glyph. Line 2 `meta`: Cabine › Coluna. Line 3 `meta`: "Preenchido por Bruno · 07/09 14:32" once saved. Progress counter at right. No hint sentences anywhere on the sheet: what needs explaining sits behind a chevron (instrument details, criterion source) or shows once per session (checklist legend). |
| **Progress counter** | `label`, dot + text. Amber while fields are missing ("4 obrigatórios faltando"), green when complete ("Completa"). |
| **Section stepper** | 48px row (`{components.section-stepper}`) at the top of the Sticky action bar, four equal buttons: step name in `label` `ink-secondary` + its count — "Placa 2 · Verif. 0 · Ensaios 1 · Conclusão 1" — the count in `fora-do-limite` while > 0, a ✓ in `conforme` at 0. Current section in `primary` with a 3px `primary` bottom rule. Names abbreviate on phone ("Verif."), never wrap. |
| **Bulk action bar** | `surface-base` strip (`{components.bulk-action-bar}`), hairline border, `{rounded.md}`, ≥ 56px, at the head of the checklist under the (once-per-session) legend: two Text buttons in `body` 600 `primary` — "Marcar os restantes como Conforme" · "Repetir da ficha anterior" — stacked on phone, in a row on tablet; each shows its reason in `label` `ink-secondary` when disabled. The same first action appears as the Sticky action bar's secondary button while the checklist is in view. |
| **Tri-state control** | Three equal segments C · NC · NA, each ≥ 56×56px, 2px `border-strong` frame, `{rounded.md}`; a radiogroup. Letters in `heading` (18px/600) so the letter, not the fill, carries the state. Selected segment takes its fill + ink and a 2px inner ring of its ink; unselected segments are white with `ink-secondary` text; rows set by the Bulk action bar look exactly like tapped rows (no "auto" mark — they are the engineer's). Letters are always shown; long labels appear as helper text under the row on phone. |
| **Checklist row** | 56px min, hairline divider. Item number + name in `body` (wraps), Tri-state control right-aligned, Overflow menu trigger (48×48px: observation, Limpar) at the far right; on phone the control drops below the name. The legend "C Conforme · NC Não conforme · NA Não se aplica" in `meta` heads the first checklist of the session only; afterwards a 48px "?" Text button beside the first row reveals it. When NC is selected, the row expands (12px gap, same column) to show the item's chips (Chip row) with the Dictation button at its end, the Observation field with its required line "Obrigatória em item não conforme", then one row of two secondary Buttons "Adicionar foto" · "Criar ponto de atenção" (camera / plus glyph, ≥ 48px). The photo, once taken, appears as a Photo tile row under the buttons with its caption in `meta`. |
| **Measurement field** | 56px, `value` text right-aligned, unit in `label` in a suffix slot, 2px `border-strong`, `{rounded.sm}`. When the unit is a control (MΩ / GΩ / TΩ) it is a ≥ 48×56px **toggle** separated from the number by a 2px `border-strong` divider: the current unit in `label` 600 with a small cycle glyph, no chevron; on phone a suffix row M · G · T (three 48px Chips) sits above the keypad. A `meta` echo line under the field shows the parsed value in pt-BR ("= 3.700 MΩ") while typing.<br>A value from "Ler visor" or dictation is drawn as a Suggestion field with its 48px crop at the left of the number until confirmed; after confirmation a 24px crop glyph stays in the suffix slot (tap opens the viewer) until export.<br>Out of limit: amber fill + amber border + helper line in `label` ("Abaixo do aceitável (>400 MΩ)"). Magnitude outlier: neutral field, helper line in `label` `fora-do-limite` ("1000× abaixo de A e B. Conferir?"). Empty shows "—" placeholder in `ink-secondary`. |
| **Measurement table** | **Nothing is ever clipped:** a table sits in a box that scrolls horizontally as a last resort, and the wide variant (TTR, six columns) uses fixed column widths — point 13 %, the two voltages 14 % each, calculated 14 %, measured 27 %, condition 18 % — so the measured value and the condition stay on screen on a tablet; the tests of a sheet stack at every width, never side by side (decision 2026-09-21, Playwright sweep). Header row in `label` on `surface-base` (a real table with header cells at tablet/desktop; value cells 200px wide — see Layout & Spacing); the caption shows the acceptance value in `value` (">400 MΩ") with a 48px chevron that reveals its source in `meta`; the action row under the caption holds the Read display button and the Dictation button, right-aligned. Body cells are Measurement fields without their own borders, separated by hairlines; calculated cells (valor calculado, condição — absorção and polarização are never calculated; when the optional "IA e IP lidos do visor" columns are on they are ordinary Measurement fields) render read-only in `ink-secondary` with a small "calc." mark. **A table with one or two value columns stays a table at every width**, the value column taking the remaining width on phone; only the TTR tables stack into cards per row (Fase A, Fase B…), each field labeled row + column, the action row above the first card. The cell that will receive the next Enter after the last row of a table — the first empty cell of the next table on the sheet — shows no special mark; the continuous run is a keyboard behavior, not a visual one. |
| **Read display button** | Secondary outline Button ≥ 48px (`{components.read-display-button}`), camera glyph + "Ler visor" in `label` 600 `primary`, `{rounded.md}`; one per Measurement table (and beside the thermo-hygrometer pair in "Da cabine"). In burst it shows the count of shots taken ("Ler visor · 3") until "Concluir". A cell waiting for its reading shows the `meta` line "Foto guardada — leitura quando houver sinal" under it with a 24px photo glyph. |
| **Instrument picker** | A Combobox whose selected state shows code + short name in `value` ("2E — Megôhmetro") and a 48px chevron at the right that reveals manufacturer · type · serial · RBC · validade in `meta` on a second line (collapsed by default).<br>Expired calibration: amber "Calibração vencida em 28/08/2027" line under the picker, always visible, picker border stays neutral. |
| **Conclusion control** | Two segmented pairs stacked, each a radiogroup: Aprovado \| Reprovado (green / red fills when selected) and Sem restrições \| Com restrições (`nao-aplica-fill` neutral / amber). 56px segments, `{rounded.md}`. Selected = fill + ink + 2px inner ring of its ink + leading ✓ glyph, exactly as the Tri-state control. Empty state shows both pairs unselected and, under them, the **suggestion line**: a 56px full-width row on `fora-do-limite-fill` with a 2px `fora-do-limite` border, the "Sugerido" pill and the text in `body` 600 ("Aprovado · Com restrições?") — the whole row is the tap target; it disappears once any segment is set. No "Obrigatório" hint text (the Progress counter and the Section stepper carry the count). |
| **Observation field** | Multiline, 96px min, `field-input`, 2px `border-strong`. Required-and-empty: 2px `nao-conforme` border + `label` line naming the reason — "Obrigatória em item não conforme" inside an NC checklist row, "Obrigatória com restrições" on the sheet conclusion. Quick chips (Chip row) with the Dictation button at the end sit above the field; a vision draft appears as a Suggestion field block above the chips with "Usar". |
| **Suggestion field** | Any field carrying a value the engineer has not confirmed (`{components.suggestion-field}`). The field keeps its own layout and takes `suggested-background` + 2px `fora-do-limite` border, with a `label` pill at its top-right in `fora-do-limite` ink (5.8:1): **"Sugerido"**, or **"Verificar"** on a 2px *dashed* `fora-do-limite` border for an ungrounded guess. For OCR/vision values a **48px source crop** (`crop-size`, `{rounded.sm}`, 1px `border-strong`) sits at the left of the value; tap opens the Photo viewer on the region. A "Confirmar" Text button (≥ 48px) at the right of the field; a "Confirmar todos" secondary Button closes the group and visibly skips "Verificar" fields (its label counts: "Confirmar 7"). On confirm the field returns to the neutral filled style; the crop shrinks to a 24px glyph in the suffix slot until export. A differing suggestion beside an engineer-filled value renders as a `meta` line "Sugerido: 15 kV — Substituir".<br>**Nameplate group:** empty = the Camera capture button's tile "Fotografar placa" with the copy Chips above and "Digitar" under; pending = the plate photo as a Photo tile with the `meta` line "Foto guardada — leitura quando houver sinal"; ready = the plate crop inline above the fields (full width, ≤ `plate-crop-max-height` 160px, zoomable), each field's region outlined on the crop while that field is focused.<br>Reading in progress: `meta` line "Lendo…" under the photo; fields stay enabled. | **Crop thumbnail hit area:** the thumbnail may be drawn at 24px once the value is confirmed, but its tap area stays ≥ 48px (an invisible extension around it, never clipped by the thumbnail itself). **Dark theme:** the amber fill switches to its dark value together with the text — component tokens that alias a color must be re-resolved wherever the theme is applied (see EXPERIENCE › Handed to architecture).
| **Generated text field** | A Suggestion field variant (`{components.generated-text-field}`) for a paragraph the app composed from the sheet's own values, not read from a photo: the Conclusão step's "Texto da conclusão" and the relatorio-level parecer summary. Title in `label` above ("Texto da conclusão"), the paragraph in `field-input` on `fora-do-limite-fill` with a 2px `fora-do-limite` border and the "Sugerido" pill top-right, ≥ 96px; no source crop (the source is the Criteria line under it). Actions in one row under the paragraph, ≥ 48px each: "Confirmar" Secondary button, "Editar" and "Substituir" Text buttons, Dictation button at the right; confirmed state = `surface-base` fill, hairline border, the "Sugerido" pill and "Confirmar" disappear; after confirmation the field takes the Observation field's neutral style and keeps the Criteria line; when the sheet's values change afterwards, a `meta` line "Sugerido: texto atualizado — Substituir" appears under the confirmed text. The Dictation button sits at the field's right end while editing [ASSUMPTION — reference tool 2026-09-18]. |
| **Criteria line** | One `meta` line in `ink-secondary` (`{components.criteria-line}`) directly under a Generated text field, listing every value and criterion the text used, separated by "·": "R_iso A–B 330 MΩ · critério ≥ 400 MΩ · item 8 NC"; the numbers in `label` weight, tabular. Wraps, never truncates; printed under the Conclusão row of the sheet in section 9 in the same style. Not interactive [ASSUMPTION — reference tool 2026-09-18]. |
| **Not-tested chip** | Pill, violet fill/ink, `label`: "Não ensaiado". Shown in tree rows, block cards, and as a band at the top of the sheet with the reason in `body`; the reason is picked from a Chip row of the four reasons (value chips), the last used preselected. |
| **Read-only field** | A field that keeps its slot but cannot be edited: `surface-base` background, 2px `border-hairline` (not strong), same typography, no chevron on Comboboxes, tri-state segments grayed to hairlines, Overflow trigger hidden. Used on Não ensaiado sheets (with the Not-tested band explaining why); a confirmed nameplate suggestion returns to the normal filled style, not to this one. |

**Photos & findings**

| Component | Visual spec |
|---|---|
| **Photo tile** | Square thumbnail 96px (grid) or `thumb-inline` 64px (inline beside a sheet), `{rounded.md}`, `border-strong` (a thumbnail may be a near-white wall). Number badge top-left in `ink-primary` on white, `label`, non-interactive. Caption under the tile in `meta`, two lines max, ellipsis; above the caption, the Photo stamp line. Upload state as an icon + word pill **under the tile** (grid: below the 96px thumbnail, above the caption; inline row: at the end of the caption column), never a dot on the image: **pending** = "↑ Aguardando envio" in `fora-do-limite` on `fora-do-limite-fill` (5.8:1); **error** = "Erro — Tentar novamente" in `nao-conforme` with a 2px `nao-conforme` outline on white (6.6:1); the pill itself is the retry button (≥ 48px tall). |
| **Photo viewer** | Full-screen, `ink-primary` background, photo fit-to-width. Top bar: back (48px) and number badge; bottom: caption in `body` on the dark surface with "Editar legenda" and "Remover" (destructive outline) ≥ 48px. Swipe is not required — "Anterior / Próxima" buttons at the edges. The full Photo stamp sits in `body` above the caption. |
| **Photo stamp** | The capture record of a photo (`{components.photo-stamp}`): on the Photo tile, one `meta` line in `ink-secondary` above the caption, "06/09 14:32" plus a 16px pin glyph (`aria-hidden`; the word "GPS" is the accessible text) when coordinates exist; in the Photo viewer the full stamp in `body` on the dark surface, "06/09/2026 14:32 · −23,5505, −46,6333", with the linked checklist status line under it when the photo belongs to a row ("Item 8 · Contatos · NC"). When the device denied location the tile shows the time only, no placeholder pin. Printed under every photo in section 7 in the document's caption style [ASSUMPTION — reference tool 2026-09-18]. |
| **Photo capture sheet** | The import path (from the "Adicionar fotos" button, a drop on a computer, or when the camera is denied). Bottom sheet, `{rounded.lg}` top corners, shadow. One 56px option "Escolher arquivos" (and "Tirar foto" only when reached from a denied camera, with the reason in `label` beneath it). A gallery batch is followed by one step, "De qual equipamento?": the Relatório tree as a picker list plus a "Geral" row; the selected row takes the `focus-fill` background and reveals, under the list, a caption field for the whole batch prefilled with the context caption, with the Dictation button at its right end, and a full-width primary Button "Adicionar N fotos". Cancel as text button. |
| **Caption composer** | Opened from "Legendar" only. Three rows (Atividade · Equipamento · Local): on phone/tablet a Chip row of recent values ending in "Outro…" per row, on desktop three Comboboxes; then a preview block in `body` on `surface-base` showing the generated caption; an "Editar texto" text button unlocks free editing. A vision caption shows above the rows as a Suggestion field with "Usar". In the gallery, tiles with a vision caption show it in `meta` on `fora-do-limite-fill` with the "Sugerido" pill, and the header carries "12 legendas sugeridas — Confirmar todas" (primary Button). |
| **Point of attention card** | `{rounded.md}`, `border-strong`. Drag handle (48×48px) at left and Overflow menu trigger at right, like the Block card. Title in `heading`, body in `body`, then a row of Photo tiles (`thumb-inline`) it references, then four `label`/`body` pairs: Ação · Prazo · Prioridade · Responsável, the Prioridade value drawn as the Priority pill. Overflow menu items as the Block card: "Adicionar abaixo · Subir · Descer · Duplicar · Remover". |
| **Priority pill** | Outline pill in `label`, ≥ 28px tall, `{rounded.full}` (`{components.priority-pill}`), text always "P⟨n⟩ · ⟨nome⟩": "P0 · Imediata" in `nao-conforme` on `nao-conforme-fill`; "P1 · Curto prazo" in `fora-do-limite` on `fora-do-limite-fill`; "P2 · Médio prazo", "P3 · Longo prazo", "P4 · Próxima manutenção" in `ink-primary` on `surface-sunken`. The level letter and name carry the meaning, the tone is secondary. Not interactive; shown on the Point of attention card and printed in the section 8 action-plan table [ASSUMPTION — reference tool 2026-09-18]. |
| **Priority picker** | A `radiogroup` of five option rows (`{components.priority-picker}`), each ≥ 56px, 2px `border-strong`, `{rounded.md}`, 8px apart, drawn like Form dialog options (selected = `primary` border + `focus-fill` + a leading check glyph from the icon sprite): at the left the Priority pill of that level, at the right the suggested deadline in `meta` `ink-secondary` ("hoje", "30 dias", "90 dias", "180 dias", "365 dias"). Sits above the Prazo date field on the Point of attention card in edit mode; on desktop the five rows may stand in one row of equal segments [ASSUMPTION — reference tool 2026-09-18]. |

**Office surfaces**

| Component | Visual spec |
|---|---|
| **Registry row** | 56px, hairline divider. Primary text in `body` (for example "2E — Megôhmetro DMG10Ki"), secondary in `meta` (serial · RBC · validade · certificate file name). Expired calibration prefixes the word "Vencida" before the date, both in `fora-do-limite`. |
| **Data table (read-only)** | Registries › Critérios de aceitação: `surface-raised`, 1px `border-strong`, `{rounded.sm}`; header cells `label` on `surface-base` with a `border-strong` bottom; body cells `body`, 12px padding, hairline row dividers; the criterion cell ("> 400 MΩ") in `value` tabular, the source cell in `ink-secondary`. Read-only in the MVP — no row actions. |
| **Export dialog** | `{rounded.lg}`, shadow. Title `heading`. **At the top, only what the Sumário cannot say in a row** (decision 2026-09-21): one `body` line "7 avisos — estão nas linhas do sumário" with a "Ver no sumário" Text button, and, when present, the one blocking row. "Pré-visualizar" is a secondary Button beside "Gerar relatório"; while a draft is being produced it reads "Gerando rascunho…" in `meta`, and the draft opens in a new tab. The one blocking row ("Parecer não preenchido") is set in `nao-conforme` with a "Editar em Dados do relatório" Text button, and the primary Button repeats it as its disabled reason. Under the list, the **Document control table** as a read-only summary headed "Controle do documento" in `label`, with the same "Editar em Dados do relatório" link at its right [ASSUMPTION — reference tool 2026-09-18]. No "Opções" disclosure and no Seção 9 radio group — section 9 prints in the FO.SERV-03 grouping and the surface states it in one `meta` line (decision 2026-09-19). One primary Button "Gerar relatório" produces both files; the result block lists them as two 56px rows with download glyphs: "DOCX — abrir no Word" · "PDF — enviar ao cliente", each with a share button on mobile. Below, a `label`-headed list "Revisões" with one `meta` row per past revision (number · date · who · section-9 choice) and the same two download glyphs.<br>While generating: progress line "Gerando revisão 2…" in `meta`, buttons disabled with the reason. |
| **Confirm dialog** | `{rounded.lg}`, title in `heading`, one sentence in `body`, secondary "Cancelar" (initial focus) + primary or destructive action. Destructive action is outline red, never a red fill. |
| **Form dialog** | The Export dialog's shell with fields inside: `surface-raised`, `{rounded.lg}`, shadow over the scrim, ≤ 640px, 24px padding, 16px between fields. Title in `heading`; a `label`-headed option group of 56px radio rows (2px `border-strong`, selected = `primary` border + `focus-fill`) for the report type; Comboboxes and paired date fields (two-up, single column on phone); actions right-aligned (secondary "Cancelar" + primary), the primary carrying its reason while disabled. Full-screen on phone. |
| **Login form** | Centered column ≤400px, PRODUTO placeholder in `display` above, two 56px inputs, one primary button. No imagery, no brand. |
| **Section band** | Office-surface grouping: `surface-raised`, hairline border, `{rounded.lg}`, 24px between bands. Head row ≥ 56px: 32px round number badge (`primary` fill, `primary-foreground` `label` 600, decorative), title "Etapa n — ⟨nome⟩" in `heading`, optional note in `meta` at the right ("Capa do relatório", "Seções 1 e 3"). Body: 24px padding (16px on phone), fields stacked 16px apart. |
| **Status board** | Home, above the relatório list: one tile per Status pill state in a 4-column grid (2 columns on phone), 12px gaps. Tile = `surface-raised`, hairline border, `{rounded.lg}`, ≥ 56px, 12/16 padding; count in `display` (tabular; `ink-secondary` when zero) above its Status pill. The whole tile is the target (filters the list). |
| **Shortcut card** | Home: 2-up grid of 56px cards, `surface-raised`, `border-strong`, `{rounded.md}`, 12/16 padding; name in `body` 600 with a `meta` sub-line ("2 templates · padrão FO.SERV-03"; "Empresa · Clientes · Instrumentos · Fabricantes · Classes de tensão"), trailing chevron in `ink-secondary`. |
| **Settings row** | Account: 56px row, hairline divider; `label` in `ink-secondary` at left, value in `body` at right (storage figures in `value`), optional trailing Text button ("Instalar", "Ver status de sincronização", "Editar" on "Registro profissional", whose value reads "CREA ⟨número⟩ · Eng. Eletricista"). Never an input — editing opens a dialog or a surface; the one switch ("Localização nas fotos") is a Toggle row, with "Permissão negada no aparelho" in `label` `fora-do-limite` as its sub-line when the OS denied location. |
| **Brand preview** | Registries › Empresa: a card on `surface-base` with a 1px `border-strong`, `{rounded.md}`, 16px padding, labeled "Pré-visualização do documento" in `label` (`{components.brand-preview}`). Inside, three miniature pages on `surface-raised` with a hairline edge: the cover (logo slot top-left, cover background as a gray box when set, the title block as text lines), one header strip and one footer strip with the current razão social, address lines, form title, form code and form revision in `meta`, and the watermark as a diagonal `meta` line at 40% opacity when on. Logo and cover background render the uploaded file when present; otherwise a `border-hairline` placeholder box with the word "Logo" or "Fundo". Re-renders on every field change; never a live PDF. The only place the brand is drawn inside the app [ASSUMPTION — reference tool 2026-09-18]. |
| **Document control table** | Two-column key/value table (`{components.doc-control}`), `surface-raised`, 1px `border-strong`, `{rounded.sm}`; optional title "Controle do documento" in `heading`; key column 200px in `label` `ink-secondary`, values in `body` with tabular numerals, rows ≥ 48px with hairline dividers; on phone each row stacks key over value. Rows: Documento · Revisão do documento · Data de emissão · Contratante · Contratada · Responsável técnico · ART/TRT · Período do serviço. In the app it is read-only (Export dialog summary); in the document it prints as the page after the cover [ASSUMPTION — reference tool 2026-09-18]. |
| **Parecer box** | Relatório setup › "Conclusão e parecer" band and printed in section 10 (`{components.parecer-box}`): a box with a 2px border in the verdict's ink and its fill, `{rounded.md}`, 16px padding; title line in `heading` = the verdict word ("Parecer: Apto" in `aprovado` on `conforme-fill`; "Parecer: Apto com restrições" in `fora-do-limite` on `fora-do-limite-fill`; "Parecer: Não apto" in `reprovado` on `nao-conforme-fill`), then the summary paragraph in `body` `ink-primary`. In the app the verdict is chosen on a Conclusion-style segmented triple above the box and the paragraph is a Generated text field until confirmed; the box takes its tone only once the verdict is set, and stays neutral (`border-strong`, no fill, title "Parecer") while empty. Never colored by a suggestion [ASSUMPTION — reference tool 2026-09-18]. |
| **Rich text editor** | Template composer only, for the boilerplate of a section block (`{components.rich-text}`): `field-input` text on `surface-raised`, 2px `border-strong`, `{rounded.sm}`, ≥ 160px; a toolbar strip on `surface-base` with a hairline bottom holding 48px buttons Negrito · Itálico · Lista · Numeração · Variável (glyph + `label` word, never glyph-only). "Variável" inserts a chip drawn on `focus-fill` in `primary`, `{rounded.sm}`, reading "{cliente}" etc. Field surfaces and the Relatório setup never show this editor; a section block opened in a relatório shows its text with the variables substituted, read-only, and the exclusions list as plain fields [ASSUMPTION — reference tool 2026-09-18]. |

→ Mock: `mockups/components.css` draws every row above; `mockups/key-equipment-sheet.html` is the reference rendering (tablet, phone, dark) and `mockups/key-sheet-states.html` its alternate states.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Test every screen at full brightness under direct sun, in both themes; all text ≥ 4.5:1, ink on surfaces ≥ 7:1 | Rely on mid-tone grays, pastel fills or subtle shadows to carry meaning |
| Pair every semantic color with a word or glyph (C / NC / NA, "Sem conexão", "Não ensaiado") | Convey state by color only — a washed-out screen or a color-blind engineer loses it |
| Show the literal placeholder **PRODUTO** where the product name would go | Invent a name, logo or icon for the product |
| Keep the Fasor Engenharia brand (orange triangle, wordmark, header/footer, address) inside the generated DOCX/PDF only | Put any client or design-partner branding in the app; use orange as an accent |
| Edit the company brand (logo, cover background, watermark, header/footer lines, form code) in Registries › Empresa only, and draw it inside the app only in that tab's Brand preview | Show the logo or watermark on Login, in the App bar or on any other surface; hard-code the design partner's brand in the product |
| Use amber for "out of limit — suggestion"; red only for what the engineer marked NC / Reprovado | Auto-color a value red as if the app had decided the verdict |
| Use 56px controls for anything filled with gloves on; 48px minimum hit area for everything else, even when the glyph is smaller | Build dense desktop-style tables on the field surfaces; size tap targets only as big as their icon |
| Use an amber "Sugerido" fill for values the app proposes (plate reading, display reading, caption, conclusion, out-of-limit hint) until the engineer confirms | Write an AI-read value into the sheet without a confirmation tap |
| Offer a camera or copy path before a keyboard: an empty group opens with the "Fotografar" tile or a copy chip, "Digitar" as a text link | Pre-mark Conforme silently, or make the keyboard the first affordance of any field group |
| Show the source crop beside every OCR value (48px, tap to zoom) until export; flag an ungrounded guess "Verificar" on a dashed border | Accept an AI value the engineer has not tapped; hide the evidence behind a modal; show a blank where a guess exists |
| Use sentence-case labels that wrap | Use ALL-CAPS labels that truncate (the defect in the current Excel sheets) |
| Set units in a separate slot beside the value; use tabular numerals | Type units inside the number; set proportional digits in columns |
| Follow the device's theme preference; manual override (Sistema / Claro / Escuro) in Account; both themes pass the sunlight rules | Force one theme, or treat dark as exempt from the outdoor contrast bar; dark-green GroundPRO look as the direction (reference only) |
| Separate with borders; shadows only on floating sheets and dialogs | Use elevation as hierarchy |

## Open Questions

- [ASSUMPTION] Amber (not red) for out-of-limit values; the extraction proposed red. Confirm the engineer wants suggestion and verdict visually distinct. The same amber now marks every "proposed, not confirmed" value (Suggestion field: "Sugerido", and "Verificar" on a dashed border) and the conclusion suggestion line — confirm that one color reads correctly across all uses and that the dashed border is enough to separate "Verificar" from "Sugerido" under sunlight.
- The 48px source crop beside an OCR value: whether it is legible enough on a 390px phone to be worth its width in a 200px value cell, or should show only as the 24px glyph with the zoom on tap — decide on the first mock at phone width.
- [ASSUMPTION] 56px glove-sized controls and one-handed layout — glove/one-hand use unconfirmed.
- [ASSUMPTION] Inter as typeface — no brand or typography preference stated; any high-x-height sans with tabular numerals satisfies the rule. Either Inter is bundled for offline use or the fallback stack is accepted offline (architecture's call).
- Whether the semantic inks should be darkened so that the C / NC / NA letters reach 7:1 on their fills as well (today 4.9–5.8:1 in light; see Colors) — a palette change, not decided.
- UI system is TBD by architecture; these tokens are self-contained and must be mapped onto whatever system is chosen without changing hex values or sizes.
- Whether the client's logo (for example Porto Seguro) should appear on the generated cover alongside the company logo from Registries › Empresa. Not in the current FO.SERV-03; the reference tool prints only the provider's brand (`docs/concorrentes/extract-media-reference-tool.md` §4). Not decided.
- Watermark content (razão social vs. "Cópia controlada" vs. an image) and whether it prints on the DOCX as well as the PDF. Registries › Empresa offers the switch and the two input kinds; the printed rule is not decided [ASSUMPTION — reference tool 2026-09-18].
- [ASSUMPTION — reference tool 2026-09-18] Priority pill tones: P0 in the não-conforme red, P1 in the amber, P2 to P4 neutral ink on `surface-base` (no new color token). Confirm that a red P0 does not read as a verdict beside the amber "suggestion" convention; the level text carries the meaning either way.
- [ASSUMPTION] Dark scrim value `rgba(0,0,0,0.6)` — chosen by analogy, not measured against a dialog in dark under sunlight.
