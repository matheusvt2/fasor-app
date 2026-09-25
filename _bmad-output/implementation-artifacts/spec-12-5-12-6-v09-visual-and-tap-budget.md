---
title: 'Stories 12.5 and 12.6: the v0.9 visual direction and the tap budget as a test'
type: 'feature'
created: '2026-09-25'
status: 'in-review'
baseline_revision: '66fe4107fc45df8dd6fd5b1936be8c63784129ae'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-12-context.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_reason: '12.6 measures taps and target sizes on the final UI that 12.5 restyles (shared surfaces: sheet, Sumário, Home); one batch for token economy.'
deferred:
  - summary: >-
      The Sheet header sentence (and the stepper) name a step whose sub-block is off, e.g. "Verificações prontas" on a sheet with no checklist.
    evidence: |-
      STEPPER_STEPS is all four SHEET_STEPS; the stepper already showed "Placa ✓" on a sheet with no nameplate before this change (journey review § 3, app against mock). Settle by deriving the shown steps from the block's enabled sub-blocks for both the stepper and sheetSummaryText.
    location: >-
      apps/web/src/surfaces/ficha/section-stepper.tsx STEPPER_STEPS
    severity: low
  - summary: >-
      The promoted rule `.sticky-action-bar .bulk-action-bar.is-compact.is-done { display: none }` never fires: the app never sets `is-done`.
    evidence: |-
      BulkActionBar sets no is-done class; the disabled compact bulk bar stays in the sticky bar as before (pre-existing behavior, not in 12.5's component list).
    location: >-
      apps/web/src/styles/components.css (.bulk-action-bar.is-compact.is-done)
    severity: low
  - summary: >-
      Two sentence-case rules for seed labels coexist: kernel readingLabelText/sentenceCase (Measurement table) and screenLabel (fields, checklist, cabine).
    evidence: |-
      They disagree on some headers (TTR "TAP Nº" reads "Tap Nº" in the table, screenLabel gives "TAP nº"). Unifying them touches conclusion.ts, which reads evaluated tables; check the generated conclusion text before delegating readingLabelText to screenLabel.
    location: >-
      packages/domain/src/relatorio/readings.ts readingLabelText
    severity: low
---

<intent-contract>

## Intent

**Problem:** The app still wears the v0.8 skin: boxed fields, caps seed labels (J-13), three progress indicators in the sheet header (J-14), "Sumário" as the Sumário's App bar title (J-17), a squeezed Sumário row at 390 px (J-18). The v0.9 rules sit in `mockups/tokens-v09.css`/`components-v09.css` beside the locked files. Nothing measures the tap budget or the 48/56 px targets on merge.

**Approach:** 12.5 promotes the v0.9 CSS into the locked files, copies them to the app, adds kernel `screenLabel` and `sheetSummaryText`, and moves the listed components to the new markup/state hooks. 12.6 adds two `@p0` Playwright tests: 5.1-E2E-001 (tap and keystroke budget through a page-level listener) and ERGO-E2E-001 (hit areas at 390 and 768 px). Sources: `epics.md` Stories 12.5 (l.2464) and 12.6 (l.2496); `DESIGN.md` § v0.9 direction (l.728-752); review J-13/14/17/18 (`review-journey-2026-09-24.md` l.62-72).

## Boundaries & Constraints

**Always:**
- Byte-identical rule: after folding, `apps/web/src/styles/tokens.css` and `components.css` equal `mockups/tokens.css` and `mockups/components.css` (`styles.test.ts`). Every `.frame-*` rule of the promoted `components.css` (the three `.frame-phone .sum-row…` rules included) has its translation in `app.css` with a comment naming the mock rule (AGENTS.md "Mock container selectors"; `app-css.test.ts` must stay green).
- AD-1/AD-13: `screenLabel` and `sheetSummaryText` live in `packages/domain` and are exported from its index; `apps/web` only calls them. Stored labels and the DOCX/PDF renderer keep the seed caps (no change under `apps/api/src/render*` or golden files).
- Planning-doc edits (DESIGN.md prose, MOCK-GUIDE.md) strike old sentences `~~…~~` and add the new one with the date 2026-09-25; YAML frontmatter values change in place with a `# 2026-09-25 v0.9: was …` comment.
- Keep 12.1's press path and `e2e/lost-taps.durability.spec.ts` green; keep batch C's `cabineLineText`/`cabineMissingText` (`packages/domain/src/relatorio/cabine.ts`), `.cabine-line` block and tree `metaMissing`: restyle, never rebuild.
- Mock class names from `mockups/key-equipment-sheet-v09.html` (sheet header l.49-56, cabine line l.59-63) and `mockups/key-relatorio-overview-v09.html` (app bar l.27-35, rows l.46-73, phone frame l.90-120). Grep them; never read a mock whole.
- New tests: 5.1-E2E-001 and ERGO-E2E-001 tagged `@p0`, run in `pnpm verify` within the 15-minute gate.

**Never:** Tailwind or a component kit; editing `epics.md`, `sprint-status.yaml`, `source-deltas.md`; changing seed data, op paths, section-collapse timing or any journey behavior; lowering a threshold above batch C's measured values; Playwright MCP browser passes; screenshots outside the P- capture spec.

## I/O & Edge-Case Matrix

| Scenario | Input | Expected |
|---|---|---|
| screenLabel caps | `'TENSÃO PRIMÁRIA'` | `'Tensão primária'` |
| acronyms kept | `'TIPO DE SE'`, `'TENSÃO NOMINAL AT'`, `'Nº SÉRIE'`, `'TAG'`, `'MEIO DE EXTINÇÃO'` | `'Tipo de SE'`, `'Tensão nominal AT'`, `'Nº série'`, `'TAG'`, `'Meio de extinção'` |
| already sentence case | `'Cabos de entrada'` | unchanged |
| digits / units | a token with a digit (`SF6`, `30 SEGUNDOS` → `'30 segundos'`), `kV` | token with a letter+digit kept; `KV`/`kV` renders `kV` |
| sheetSummaryText mixed | placa 0, verificações 0, ensaios 9, conclusão 2 | `'Placa e verificações prontas · faltam 9 leituras e a conclusão'` |
| one done, one missing | placa 0, others missing | `'Placa pronta · faltam 14 verificações, 9 leituras e a conclusão'` |
| singular | only ensaios 1 missing, rest done | `'Placa, verificações e conclusão prontas · falta 1 leitura'` |
| nothing done | every step missing | `'Faltam 3 campos da placa, 14 verificações, 9 leituras e a conclusão'` |
| complete | every step 0 | `'Ficha completa'` (authored) |
| steps not shown | `shown` omits `placa` (no nameplate) | placa never named |

Wording rules: done steps named "placa", "verificações", "leituras", "conclusão" in stepper order, first word capitalised, joined "a, b e c", adjective "pronta" for one singular noun (placa, conclusão) else "prontas"; missing parts "N campo(s) da placa", "N verificação(ões)", "N leitura(s)", "a conclusão"; verb agrees with the first missing part ("falta" for a count of 1 or "a conclusão", else "faltam"); `plural()` from the kernel for every count.

</intent-contract>

## Code Map

- `_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/mockups/{tokens,components}{,-v09}.css` -- fold: each v09 token replaces its value inside the same selector block of `tokens.css` (`:root,[data-theme="light"]`, the dark `@media` block, `[data-theme="dark"]`, the `:root,[data-theme]` ramp block), new tokens appended there; each v09 rule is merged into the `components.css` rule with the same selector (v09 declarations win, overridden v0.8 declarations removed) or appended to that component's section; the header comments drop the "loaded after" wording. Delete both `-v09.css` files.
- `mockups/key-equipment-sheet-v09.html` l.5, `mockups/key-relatorio-overview-v09.html` l.5 -- remove the `-v09.css` `<link>` line (the promoted files carry the rules).
- `mockups/MOCK-GUIDE.md` l.134-139 -- strike the "ficam em tokens-v09.css" sentence; add the dated promotion note (pt-BR, the file is Portuguese).
- `ux-fasor-2026-09-18/DESIGN.md` l.4 `version: 0.8.0` -> `0.9.0`, `updated`, frontmatter token values (surface-base, surface-sunken, title 24 / -0.01em, value 22, btn radius 10, new component tokens) so `tokens.css` stays 1:1 with it; § v0.9 heading "(2026-09-24, proposed)" and the "Tokens and rules live beside…" / "The frontmatter above still lists v0.8" sentences struck with a dated "promoted by Story 12.5" line.
- `apps/web/src/styles/{tokens,components}.css` -- copies. `styles.test.ts` compares bytes; `app-css.test.ts` (l.14-114) parses `.frame-*` rules.
- `apps/web/src/styles/app.css` -- l.534-551 mirror `.cabine-line` (now in components.css: delete the duplicate, keep only app-only rules such as the Sumário `.cl-missing` reuse at l.549 if still needed); l.74-100 `.input` focus additions must not re-add side borders; add the three `.frame-phone .sum-*` translations in the phone media block (l.~130-210).
- `apps/web/src/surfaces/relatorio/relatorio.css` (210 lines) -- page CSS copied from `40-relatorio-overview.html` for `.sum-*`; remove rules the promoted components.css now owns or that fight it (grid columns, `.sum-pos`, `.sum-ctrls`), keep app-only ones; app.css l.193-206 `[data-route="/relatorio/:id"] .sum-ro { max-width:72px }` etc. are the J-18 squeeze: replace with the v09 phone layout.
- `packages/domain/src/relatorio/sheet-progress.ts` l.183-208 -- add `sheetSummaryText(p: Pick<SheetProgress,'steps'>, shown?: readonly SheetStep[])` beside `sheetProgressText` (keep the old one only if still used).
- new `packages/domain/src/relatorio/screen-label.ts` -- `screenLabel(label: string): string` and `SCREEN_LABEL_ACRONYMS` (at least SE, kV, TAG, RBC, AT, BT, MT, TP, TC, TPS; add any other seed acronym found); export from `packages/domain/src/index.ts`.
- seed labels on screen (wrap with `screenLabel`): `apps/web/src/surfaces/ficha/ficha-fields.tsx` l.149-325 (`label ?? field.label`), `cabine-block.tsx`, `ensaios-section.tsx` l.162-248 (test titles, table titles, column heads, `t.cellLabel`), `checklist-section.tsx` l.209-271, `nameplate-section.tsx`, subtype chips, `instrument-picker.tsx` test names; option values (`AR`, `SF6`, `SIMPLIFICADA - POSTE`) are data and stay verbatim.
- `apps/web/src/surfaces/ficha/ficha-header.tsx` (65 lines) -- replace the `.progress-counter` with `<p className="sheet-summary">` from `sheetSummaryText`, the missing counts wrapped in `.n-missing` only if the kernel exposes parts (else plain text); not-tested sheet keeps today's header behavior.
- `apps/web/src/surfaces/ficha/section-stepper.tsx` l.21-32 -- already `data-missing`, `.step-name`, `.step-count`; check the markup meets the v09 `::after` rule; pass `shown` steps to the header.
- `apps/web/src/components/tri-state-control.tsx` l.39-98 -- `.seg[data-value][aria-checked]` already; verify the solid look, no inline overrides.
- Sumário: `apps/web/src/surfaces/relatorio/sumario-surface.tsx` (+ `relatorio-tree.tsx` l.~495-510 rows) -- `usePageTitle` (`apps/web/src/state/page-title.tsx`) with the relatório name the Sumário's `.sheet-title` already shows; `app.tsx` l.133 keeps `copy.sumario.title` only as fallback; row markup to `.sum-row > .sum-pos|.sum-pos-empty, button.sum-open(.sum-title,.sum-status), .sum-ctrls` per mock l.46-73.
- Home: `surfaces/home/relatorio-card.tsx` (`is-current`), `components/status-tile.tsx` -- CSS only unless markup differs from the mock.
- Tests to update for sentence-case names and the header sentence: e2e `ficha.spec.ts`, `sheet-knows-12-3-12-4.spec.ts`, `journeys-12-3-12-4.spec.ts`, `journey-taps.spec.ts`, `lost-taps.durability.spec.ts`, `durability.spec.ts`, `tree.spec.ts`, `templates.spec.ts`, `ui-hygiene.spec.ts` (grep `getByLabel('[A-Z…]`, `obrigatórios faltando`); web unit tests under `surfaces/ficha`.
- Tap counting today: `e2e/support/taps.ts` (`humanTap`, `tapCounter` counts through wrappers) and `e2e/journeys-12-3-12-4.spec.ts` (J1/J3 scaffolding: `newRelatorioDrafts`, `pushDrafts`, `instrumentDraft`, `pickInstruments`, `readings`, `confirmPair`, `conclude`). "Copiar da última visita" needs `equipment/last_nameplate` pushed as an op (`packages/domain/src/ops/path.ts` l.230; `nameplate-copy.ts` `lastNameplateCopy` l.103). `e2e/ficha.spec.ts` l.86 already uses the id "5.1-E2E-001" for another test.
- Batch C baseline (768 px): J1 new plate 21 taps / 83 keys; J3 7 taps / 47 keys. Review baseline: J1 24 + 1 lost / 87; J3 9 + 2 lost / 36.

## Tasks & Acceptance

**Execution:**
- `mockups/*.css`, the two v09 mocks, `MOCK-GUIDE.md`, `DESIGN.md` -- fold, delete, repoint, bump -- 12.5 AC1.
- `apps/web/src/styles/*` + `relatorio.css` -- copy, translate `.frame-*`, drop duplicates/conflicts -- AC1, J-18.
- `packages/domain/src/relatorio/screen-label.ts` + test -- `screenLabel` with a unit test listing every distinct seed label of v1 and v2 (fields, cabine, tests, tables, columns, rows, subtypes, checklist items) and its screen form -- AC3.
- `packages/domain/src/relatorio/sheet-progress.ts` + test -- `sheetSummaryText` covering every matrix row -- AC4.
- web surfaces listed in the Code Map -- apply `screenLabel`, header sentence, Sumário title and rows -- AC2-AC5.
- `e2e/v09-visual.spec.ts` (`@p0 12.5-E2E-001`, `@p1` extras) -- at 768 light: header shows the kernel sentence and no `.progress-counter`; label "Tensão primária" in the cabine block and "Identificação" on the plate; after marking C the chosen `.seg` background equals the computed `--conforme` and its letter `--tri-state-selected-foreground`; a complete step shows no `.step-count`; a field `.input` has `border-left-width: 0px` and a 2px bottom rule; Sumário App bar `h1` equals the relatório name; at 390 `.sum-open` width >= 60 % of `.sum-row`; dark theme (`page.emulateMedia({colorScheme:'dark'})`) the chosen segment letter is `rgb(11, 27, 43)`.
- `apps/web/src/styles/contrast.test.ts` -- parse `tokens.css` and assert the DESIGN.md § v0.9 contrast table pairs (ink-primary/secondary on surface-sunken light and dark, selected foreground on the three solids light and dark) at or above the stated ratios -- 12.5 DoD.
- rename the existing `ficha.spec.ts` l.86 test to the next free `5.1-E2E-0nn` id -- frees 5.1-E2E-001 for the budget test (test-design-progress-system.md l.294).
- `e2e/tap-budget.spec.ts` (`@p0 5.1-E2E-001`) -- page-level listener installed with `page.addInitScript` counting trusted `pointerdown` (one per tap, immune to label-forwarded clicks) and trusted `keydown` of one-character keys plus Enter/Tab/Backspace; reset after arriving on the sheet (navigation not counted); every tap a `humanTap` whose effect is awaited; the context goes offline (`context.setOffline(true)`) after seeding and sync; J1 = SEC-ENEL with `last_nameplate` seeded and cabine data complete: "Copiar da última visita", bulk "Marcar os restantes como Conforme", instruments as the UI then requires, nine typed readings, suggested conclusion "Confirmar", "Concluir ficha"; J3 = next seccionadora: "Igual à", its two per-unit fields, "Repetir", suggested instruments, nine readings, confirm, conclude. Thresholds in one exported constant `TAP_BUDGET` beside the test with comments giving the review baseline, batch C's numbers and the story targets; values = the measured post-12.5 numbers, J3 at most 7 taps and 47 keys, J1 at most 21 taps and 83 keys; each count also written as an annotation and printed -- 12.6 AC1.
- `e2e/ergonomics.spec.ts` (`@p0 ERGO-E2E-001`) -- at 390x844 and 768x1024: Home, the Sumário with section 9 open, `/arvore` at 390, and a sheet (cabine block expanded, scrolled end to end): every visible interactive element (`button, a[href], input:not([type=hidden]), select, textarea, [role=button|radio|checkbox|switch|tab|combobox|spinbutton|link|menuitem], [tabindex="0"]`, not `aria-hidden`, not visually hidden) has a hit area >= 48x48, where the hit area is the element's box or, for a control inside a `label`, `.input`, `.measurement-field` or date-field group that receives the tap, that wrapper's box; `.tri-state .seg`, `.measurement-field`, conclusion `.seg`, and tree rows (`.s9-eq-open`, `.sum-open`, tree-surface rows) >= 56 px tall. A failure is fixed in CSS/markup, not excluded; any exclusion goes in one commented constant with its reason and is listed in the PR -- 12.6 AC2.
- `e2e/p-screens.capture.spec.ts` -- skipped unless `CAPTURE_P=1`; writes `P-{home,sumario,ficha-SEC-ENEL}-{390x844,768x1024,1280x800}-{light,dark}.png` (18 files) into `_bmad-output/implementation-artifacts/reviews/journey-review-2026-09-24/`; run once and commit the PNGs -- 12.5 DoD.

**Acceptance Criteria:**
- Given the repository after the change, when `pnpm test:unit` runs, then `styles.test.ts`, `app-css.test.ts` and `contrast.test.ts` pass, and no file named `*-v09.css` remains.
- Given the SEC-ENEL sheet at 768 px, when it renders, then labels read in sentence case with acronyms kept, the header shows `sheetSummaryText`'s sentence and the stepper keeps the counts, while the generated DOCX for the Porto Seguro fixture still matches its golden (caps).
- Given the Sumário at any width, when it renders, then the App bar title is the relatório name; at 390 px the row text column is at least 60 % of the row.
- Given `pnpm verify`, when it runs, then 5.1-E2E-001 and ERGO-E2E-001 pass as `@p0` and the gate stays under 15 minutes.

## Spec Change Log

## Review Triage Log

### 2026-09-25 — Review pass
- verdicts: 10 findings — high 0, medium 3, low 5, false 2, maybe-false 0
- layers run: Edge Case Hunter, Verification Gap; Blind Hunter and Intent Alignment skipped (token economy; the integrated Epic 12 review covers them)
- findings:
  - `[medium]` `[patch]` ECH: Sumário chevron moved outside `button.sum-open` is a dead tap target — the chevron span now calls the row's open action (pointer-events restored in relatorio.css); 12.5-E2E-001 taps it.
  - `[low]` `[defer]` ECH: sheetSummaryText names a disabled step "pronta(s)" — pre-existing stepper behavior (all four steps drawn); deferred.
  - `[false]` `[reject]` ECH: a `shown` omitting a missing step reads "Ficha completa" — the only caller passes STEPPER_STEPS = SHEET_STEPS, so no step is ever omitted.
  - `[medium]` `[patch]` ECH: ERGO measures nested buttons by their wrapper — grouped with VG 1; wrapper box used only for input/select/textarea/spinbutton; re-run 0 misses.
  - `[low]` `[defer]` ECH: `.bulk-action-bar.is-compact.is-done` never set — pre-existing behavior, bulk bar not in 12.5's component list.
  - `[false]` `[reject]` ECH: outlier helper shows caps row labels — markOutliers reads EvaluatedRow.label, already `readingLabelText`-cased ("Fase A", "Massa").
  - `[low]` `[reject]` ECH: removed hover/focus cue on the Sumário position box — cosmetic; the v0.9 mock draws no hover state and focus-visible stays.
  - `[medium]` `[patch]` VG: ERGO wrapper rule lets undersized nested buttons pass — see the grouped ECH row.
  - `[medium]` `[patch]` VG: checklist sentence case not pinned — exact radiogroup name assertion added to 12.5-E2E-001.
  - `[low]` `[patch]` VG: Measurement table strings double-formatted (kernel rule then screenLabel, "Tap nº") — screenLabel wrapping removed from ensaios-section.tsx (kernel already formats); unifying the two rules deferred.

## Design Notes

Narrowings (PR body; the coordinator records them): J3 thresholds exceed the story's 5 taps / 40 keys because D-3 forbids copying IDENTIFICAÇÃO and Nº SÉRIE (coordinator decision: measured post-12.5 values, J3 at most 7 taps and 47 keys, never above batch C); the P- capture is 390/768/1280 in both themes (18 files, not the A- set's 1024 landscape frame); the existing ficha.spec "5.1-E2E-001" is renamed to free the test-design id. Open questions: the complete-sheet sentence "Ficha completa" and the missing-part nouns ("campos da placa") are authored copy for Bruno/Matheus; mocks that draw "before" frames (`key-equipment-sheet.html`) now render with the promoted v0.9 rules.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:unit` -- expected: green.
- `docker compose --profile tools run --rm tools pnpm exec playwright test e2e/v09-visual.spec.ts e2e/tap-budget.spec.ts e2e/ergonomics.spec.ts e2e/lost-taps.durability.spec.ts` -- expected: green; budget counts printed.
- `docker compose --profile tools run --rm tools pnpm verify` -- expected: green.
