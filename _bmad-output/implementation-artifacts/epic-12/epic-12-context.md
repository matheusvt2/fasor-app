# Epic 12 Context: Field journey and visual refresh

<!-- Written by the coordinator from the journey review of 2026-09-24. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make filling a relatório in the field faster and safer than the paper FO.SERV-03: no tap is ever swallowed, the path always leads forward (Home to the sheet where the engineer stopped, setup to the Sumário, sheet to sheet), nothing the cabine or the relatório already knows is asked again (instrument, cabine data, NC observation, per-unit plate fields are never copied), and the screens take the DESIGN.md v0.9 skin while keeping every sunlight and glove rule. Source of every finding (J-01 to J-19) and decision (D-1 to D-11): `_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/review-journey-2026-09-24.md`; screenshots in `_bmad-output/implementation-artifacts/reviews/journey-review-2026-09-24/`.

## Stories

- Story 12.1: No tap is ever lost, and a section never collapses under the finger
- Story 12.2: Forward, never back: resume in one tap and no dead ends
- Story 12.3: The sheet repeats nothing the cabine or the relatório already knows
- Story 12.4: The plate and the NC in fewer taps
- Story 12.5: Apply the v0.9 visual direction
- Story 12.6: The tap budget is a test

## Requirements & Constraints

- Measured baseline on `main` at `d149a22` (tablet 768 px): J0 resume 2 taps; J1 seccionadora 24 taps and 87 keystrokes; J3 second seccionadora 9 taps and 36 keystrokes; four lost taps in one session. Targets: J0 1 tap, J3 at most 5 taps, J1 at most 12 taps with a copied plate (Story 12.6 thresholds).
- Rows of `source-deltas.md` dated 2026-09-24 win over `EXPERIENCE.md`, `DESIGN.md` and Stories 5.x: section collapse timing (D-2), nameplate fields visible with no "Digitar" (D-6), copy never carries IDENTIFICAÇÃO, Nº SÉRIE, TAG (D-3), instrument suggested and confirmed by "Concluir ficha" plus the one-line cabine block (D-4, D-5), sheet observation suggested from NC items (D-7), navigation (D-8), sentence-case labels on screen (D-9), v0.9 files beside the v0.8 ones until Story 12.5 (D-10), Não ensaiado with three standard reasons plus free text and nothing preselected (last row).
- Nothing unconfirmed is ever written or printed: the suggested instrument and the suggested sheet observation are Suggestion fields until a tap confirms them ("Concluir ficha" counts as that tap for the instrument; the conclusion text "Confirmar" for the observation).
- Seed changes (per-unit flag, third Não ensaiado reason) follow AR-20: `packages/domain/seed` is append-only by version and a relatório keeps its `seed_version`; add a new version rather than editing v1 in place, and regenerate the Porto Seguro golden snapshot only if the fixture's values change.
- `tokens.css` and `components.css` in `apps/web/src/styles` stay byte-identical to `mockups/`; v0.9 lives in `mockups/tokens-v09.css` and `mockups/components-v09.css` until Story 12.5 folds them in and copies them in the same PR (`app-css.test.ts`).
- Out of scope for this epic: the nameplate TAG field's final form beyond "prefilled, editable" (12.3), the printed OBSERVAÇÕES rule and the status on generate (J-19); leave current behavior.

## Technical Decisions

- Ownership (AD-1 to AD-3, AD-13): new rules live in `packages/domain`: `suggestedInstrument(snapshot, blockId, testKind)`, `cabineProgress(snapshot, cabineId)`, `screenLabel(label)`, `sheetSummaryText(progress)`, the suggested sheet observation text, the `per_unit` flag on field definitions. `apps/web` renders and writes ops only; pt-BR strings follow the three homes in AGENTS.md.
- The lost tap (J-01, Story 12.1): a blur or Enter commit rebuilds the snapshot in [ficha-surface.tsx](../../apps/web/src/surfaces/ficha/ficha-surface.tsx) (`useMemo(() => buildSnapshot(...))` near line 97) and the pressed control re-renders or unmounts between pointer down and pointer up. Fix once in the shared press path (`apps/web/src/components/` or `apps/web/src/input/`), prove it with a Playwright race test at 50, 200 and 400 ms.
- Section collapse (J-04): `ficha-surface.tsx` `setCurrent` and the collapse state near lines 228-261; collapse only on leaving, never with focus inside or an out-of-limit reading in it.
- Navigation (Story 12.2): Home card [relatorio-card.tsx](../../apps/web/src/surfaces/home/relatorio-card.tsx) lines 48-59; setup "Concluir dados do relatório" in `surfaces/relatorio/setup-surface.tsx` lines 152-163; back targets in [app.tsx](../../apps/web/src/app.tsx) lines 134-156 and `state/back-target.tsx`; `/arvore` is `surfaces/relatorio/tree-surface.tsx`; last sheet pointer via `openSheet` in `surfaces/relatorio/tree-actions.ts`; "você parou aqui" and section 9 expansion via `sumarioOpensExpanded` in the Sumário.
- Sheet (Stories 12.3, 12.4): `surfaces/ficha/cabine-block.tsx` (`isCabineFirstSheet` gate), `nameplate-section.tsx` (lines 123-155 hide fields behind "Digitar"), `instrument-picker.tsx`, `conclusao-section.tsx`, `not-tested-dialog.tsx` (in `surfaces/relatorio/`), kernel `packages/domain/src/relatorio/sheet-progress.ts` (lines 82-85 exclude cabine fields) and `ficha.ts`, seed `packages/domain/src/seed/v1.ts` (`NOT_TESTED_REASONS` near line 604).
- An unmerged WIP branch `fix/e2e-gate-stability` (E5-A1) touches `ficha-surface.tsx` and several e2e specs; do not build on it. The gate is known to flake under load (3.6-E2E-001, 4.1-E2E-002, 4.3-E2E-002, 1.6-E2E-001, 5.5-E2E-001): a flake that passes alone is reported, not chased.

## UX & Interaction Patterns

- Mocks: `mockups/key-equipment-sheet-v09.html` and `mockups/key-relatorio-overview-v09.html` (v0.9, after); `mockups/key-equipment-sheet.html`, `prototype/screens/40-relatorio-overview.html`, `prototype/screens/20-home.html` (current). Never read a mock whole; grep class names.
- Sheet header after 12.5: one kernel sentence ("Placa e verificações prontas · faltam 9 leituras e a conclusão"); stepper with a progress rule, counts only where missing; tri-state with the chosen segment solid.
- The cabine line: "⟨cabine⟩ · ⟨tipo⟩ · ⟨kV⟩ · ⟨V⟩ · ⟨kVA⟩ · ⟨°C⟩ · ⟨%⟩" with "Editar"; expanded on the first sheet or while a cabine field is missing.
- Every new tap path keeps the 48 px and 56 px targets and a toast with "Desfazer" for structural edits.

## Cross-Story Dependencies

- 12.1 and 12.2 touch different surfaces and run in parallel; 12.2's "Voltar from a sheet" changes one back target only.
- 12.3 and 12.4 share the sheet surface and the seed; they run as one batch after 12.1 merges.
- 12.5 restyles every surface the earlier stories changed and folds the v0.9 CSS; 12.6 counts taps on the final UI. They run as one batch last.
- Contracts to publish in each PR body: kernel function signatures, op paths, seed version.
