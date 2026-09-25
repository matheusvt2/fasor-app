# Epic 12 coordinator notes: delivery shape, what went well, what went badly

Written by the coordinator session on 2026-09-25 as evidence for the Epic 12 retrospective. Epic 12 came from the journey review of 2026-09-24 (`planning-artifacts/ux-designs/ux-fasor-2026-09-18/review-journey-2026-09-24.md`), requested by Matheus to measure the field journey in taps and keystrokes and to modernize the look.

## Delivery shape

Epic 5 token-economy shape: one shared orchestrator instruction file (derived from Epic 5's), epic context written by the coordinator and committed with the planning (`144a558`), two review layers per batch (Edge Case Hunter, Verification Gap) with one fix loop, no per-batch independent review or MCP pass, one integrated review + QA on clean main, one fix batch, a targeted re-check by the same QA agent via SendMessage. Every agent on opus.

| Batch | Stories | PR | Orchestrator tokens | Duration | Verify | Tap counts |
|---|---|---|---|---|---|---|
| B | 12.2 | #35 | 256k | 108 min | green after merging main; 4.1-E2E-002 known flake, 12.2-E2E-002 fixed (navigation state cleared without a second router navigation) | J0 1 tap (was 2); J5 10 taps with the instrument registered (was 12 + forced Voltar), 13 when registering it from setup (was 12 + ~22 detour) |
| A | 12.1 | #36 | 216k | 169 min | green; 12.2 home-surface.test.tsx:338 flaked once, passes alone | 0 lost taps; J1 24, J3 9 (unchanged, as expected) |

Before Epic 12: E5-A1 (gate stability) merged as #34 by another session while wave 1 ran.

## Open items handed to the integrated review
- 12.2 open: with every sheet done "Continuar" opens the first sheet; with no sheet, the Sumário; counter only on cards whose relatório is on the device.
- 12.2 known open (low): "Continuar" pressed before its target loads (ms after Home renders) opens the Sumário.
- 12.2 narrowings: "Cadastrar instrumento" opens the new-instrument panel directly; `/arvore` still reachable by URL; "Próxima seção" is secondary.
- 12.1 root cause: pointer focus into the next section collapsed the section above (button moved under the finger); a field commit mid-tap re-rendered the sheet (Android click 100-160 ms after pointer up). Fix: `useHeldWhilePressed` holds the render until the click, at most 300 ms after pointer up.
- 12.1 open: a section left by a tap never collapses later; should a stepper tap collapse every complete section?
- 12.1 open: right after the last value the primary still reads "Próxima ficha" but concludes the sheet (stale label).
- 12.1 known open: gate does not fail if `useHeldWhilePressed` is removed (only the matrix covers it); no deterministic test for the stale label.

| C | 12.3 + 12.4 | #37 | 288k | 135 min | green; two template specs expected seed v1, now read SEED_VERSION | J1 21 taps / 83 keys (was 24+1 lost / 87); J2 one chip, 0 keys in the observation; J3 7 taps / 47 keys (was 9+2 lost / 36): the 5-tap target ignores the per-unit IDENTIFICAÇÃO and Nº SÉRIE that D-3 no longer copies (5/36 without them) |

## Batch C items for the integrated review
- Narrowings: "Copiar da última visita" still copies per-unit fields (source-deltas row wins over epics wording); v1 templates keep producing v1 relatórios (AR-20); empty cabine fields count in the Placa step of the cabine's first sheet; the suggested observation stays required until confirmed with one tap; the cabine block stays editable on a not-tested sheet.
- Open for Bruno: "Equipamento inacessível" justification; "falta ⟨campo⟩" / "faltam ⟨n⟩ campos"; pre-issue row text; the dialog's disabled reasons. Open for Matheus: move v1 templates to v2?
- Known open: the prefilled TAG is derived, never written; Epic 7 must read `nameplateTagPrefill` (deferred-work).
- Coordinator decision: J3 threshold for 12.6 counts the per-unit fields (target 5 was computed with a copied serial, which D-3 forbids).

| D | 12.5 + 12.6 | #38 | 241k | 109 min | green on the second run; 3.6-E2E-001 known flake (passes alone) | J1 with a copied plate 9 taps / 36 keys; J3 7 / 47; ERGO-E2E-001 0 misses |

## Batch D items for the integrated review
- Narrowings: J3 thresholds 7/47 (per-unit fields); P- captures at 390/768/1280 both themes, no 1024 landscape; DESIGN.md v0.9 contrast table overstated six pairs, measured values replaced them (dated strike), all above floors; old ficha test 5.1-E2E-001 renamed 5.1-E2E-005.
- Open: authored copy "Ficha completa", "N campos da placa"; the "before" mocks (key-equipment-sheet.html, 40-relatorio-overview) now render in v0.9 because components.css was promoted (the review's M-* screenshots keep the before).
- Known open: current stepper step shows two underlines (mock cascade); section 9 header row narrow at 390 px; deferred: a disabled step named in the header, unused `is-done` bulk-bar rule, two sentence-case rules; check the Sumário chevron opens the row on touch.

| QA | integrated review + gate + browser pass | review on main c0ce7b0 | 321k | 64 min | verify red on two new flaky 12.2 specs (E12-Q3); full and matrix green | J0 1; J5 14/44 no forced Voltar; J1 typed 21/72; J3 7/49; J2 2 taps 0 keys; J4 4 taps; J6 3 taps ~7 s |

QA findings: 1 high (E12-Q1 voltage class "Outro…/Criar" value erased by a second write, pre-existing), 5 medium (Q2 scroll/focus carry-over on forward navigation, Q3 flaky journey-forward spec, Q4 databases seeded before #37 keep the v1 template, Q5 J3 budget not recorded in stories - closed on main c0ce7b0, Q6 gate green without useHeldWhilePressed), 8 low (Q7-Q14). QA report written outside the main checkout (tool refused the path); coordinator copied it. Fix batch Q launched with coordinator decisions on Q2, Q4, Q6, Q10, Q11.

| Q | fixes E12-Q1..Q14 (Q5 on main) | #39 | 225k | 106 min | green; journey-forward --repeat-each 5 green | J1 copied 9/36; J3 7/47; J0 1; J5 11 |
| QA re-check | 7 items | report on main | +28k (cached, 349k total) | 8 min | all pass | new lows E12-R1, E12-R2 to deferred-work |

Fix batch accepted contract changes: server-only op family `template/{id}/seed_version` (39 -> 40 families), CONTRACT_VERSION and MIN to 3, kernel `sheetSummaryParts`, Cadastros returns `{registeredInstrumentId}`. Narrowings: voltage picker shows "15 kV" while storing "15"; only the panel's "Fechar" checks the new instrument; Q2 checked at 768 only (re-check did 390 and 768). Known open: focus after client "Criar" outside the tap, soft keyboard on the tablet unverified.

## What went well

- W-1 Measuring before building. The review's § 6 scripts gave each batch a baseline and each PR a before/after; the tap budget is now a `@p0` test (`e2e/tap-budget.spec.ts`), so a story can no longer add taps unnoticed. J1 with a copied plate went from 24 taps + 1 lost / 87 keys to 9 / 36; J0 from 2 taps to 1; J2 from the observation typed twice to 2 taps and no keys.
- W-2 The lost tap was proven red then green on desktop, Android emulation and WebKit before the fix, and the root cause (focus-driven collapse moving the target, a commit re-render between pointer up and a delayed click) was fixed once in the shared press path (`input/press-hold.ts`).
- W-3 Orchestrator cost fell again: 216-288k per batch (Epic 5: 269-498k, Epic 4: 450-600k); QA 321k plus a 28k cached re-check.
- W-4 The integrated pass paid for itself: it found a high pre-existing defect on the shortened path (E12-Q1, voltage class erased by a second write) and the seed-v2-never-reaches-existing-templates gap (E12-Q4) that no batch review saw.
- W-5 Waves by surface: 12.1 and 12.2 in parallel on disjoint files, 12.3+12.4 on the sheet and seed, 12.5+12.6 last on the final UI; no merge conflict needed manual resolution.
- W-6 Decisions were taken where the documents allowed (J3 budget counts per-unit fields; template upgrade only while unedited; photos never block Gerar for Epic 6) and recorded with dates, instead of stalling for Matheus.

## What went badly

- B-1 The review's J3 target (5 taps) was computed without the per-unit fields that the same review decided never to copy (D-3); two stories carried a target no implementation could meet until the coordinator narrowed it (E12-Q5).
- B-2 A seed version bump does not reach existing companies: the standard template stayed v1 on every database seeded before PR #37, so the J-02 P0 fix was invisible there (E12-Q4). The fix needed a new server-only op family and a contract bump to 3.
- B-3 New specs flaked in the gate (12.2-E2E-001/003 read a stale App bar title; E12-Q3) and the gate stayed green without the lost-tap fix until the fix batch (E12-Q6, E12-R2).
- B-4 Another session worked on E5-A1 in the same repository during Epic 12, edited the coordinator's uncommitted `epics.md`, and ran its own compose project; nothing broke, but two coordinators on one checkout is a hazard.
- B-5 The QA agent could not write its report to the main checkout (tool refused a path outside its worktree); the prompt must ask for the report inside the worktree.
- B-6 The QA agent waited on background commands and the coordinator received about twenty identical interim notifications; each costs coordinator tokens.
- B-7 Promoting the v0.9 CSS repainted the "before" mocks (`key-equipment-sheet.html`, `40-relatorio-overview.html`); the before exists only as screenshots now.
- B-8 Product questions still accumulate for Matheus and Bruno: "campos da cabine" wording, the printed OBSERVAÇÕES, the "Equipamento inacessível" justification, the nameplate TAG field, the status on generate (J-19), the soft keyboard after programmatic focus on a real tablet.
