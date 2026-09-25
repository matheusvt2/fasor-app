# Epic 5 integrated review and QA

- **Commit:** `62d9b1cb087a0c15956fb48d13845440b12c217a` (origin/main); review range `d1d6aba..62d9b1c`, PRs #29, #30, #31, #32.
- **Stack:** isolated compose project `fasor-qa5` (web `:25073`, api `:25030`, Postgres `:25032`, MinIO `:25090/25091`), dev web server (no service worker), Node 24 in the `tools` container. The stack is left up for the re-check.
- **Reviewer:** independent reviewer and QA, 2026-09-24. It reviewed and tested only and changed no product code.

## What ran

| Run | Result |
|---|---|
| `pnpm verify` | **EXIT 0.** lint and static clean. Unit: 805 tests in 67 files and 750 in 83 files (kernel and web), plus 20 tooling tests. api: 142 tests in 25 files. e2e `@p0`: 69 passed in 8.4 min. |
| `pnpm test:e2e:full` | **EXIT 1.** Of 117 tests, 113 passed, **1 failed** and 3 were skipped (the touch tests). The failure is `@p1 4.2-E2E-002`. It failed again **2 of 2** when run alone with `--repeat-each 2`, so it is a **deterministic defect, not a flake** (E5-Q1). |
| `pnpm test:e2e:matrix` | **EXIT 0.** Of 30 tests, 23 passed and 7 were skipped. The 3 touch tests ran only on android. No Epic 5 test is a touch test. |
| Kernel probe | `parseReadingPtBr` and `compareCriterion` were probed at their boundaries in the tools container (E5-Q6, E5-Q7). |
| Browser pass | Playwright MCP, Empresa A, through the UI: a relatório from the standard template, then sheets CE-ENEL, PR-ENEL, PR-ENEL-2 and TP-ENEL. Widths 1280, 768 and 390, light and dark, a short viewport of 470 px, keyboard-only use of the tri-state and Conclusion radiogroups, offline, "Sincronizar agora" and a dead-tab draft. 13 screenshots are in `reviews/qa-epic-5/`. |

The only console errors were expected ones:

- 401 responses before sign-in;
- `sprite.svg` failing to load while offline, because the dev server registers no service worker.

## Findings

| ID | Sev | Kind | AC | Where | Reproduction / evidence | Disposition |
|---|---|---|---|---|---|---|
| E5-Q1 | **high** | defect (regression, PR #30 E3-A3) | E3-A3, 1.8 contract "a refused write names itself" | `packages/domain/src/ops/apply.ts:102-150` (`assertSeedPath` / `assertCellGeometry` throw a plain `Error`); `apps/api/src/sync/apply.ts:418`, `:451` map only `ZodError`/`ForeignOpIdError` to a rejection | 1. Push an op whose seed key or cell is outside the block definition, for example `sheet/{sectionBlock}/test/t1/instrument`. 2. The api logs `unhandled route error ... has no equipment definition` and answers **500 `internal_error`**, where it should answer `rejected: op_invalid`. 3. The whole push fails. The client treats a 500 as transient and retries forever, so every later op in that device's outbox is stuck behind it. `@p1 4.2-E2E-002` fails on this (`e2e/relatorio.spec.ts:662`) in the full run and 2 of 2 times alone. | **Fix now.** Throw a typed error, for example `SeedPathError`, and map it to `op_invalid` in both `applyServerBatch` and `applyOps`. Add an integration test. Fix 4.2-E2E-002 to push a real equipment block and a real `test_key`. |
| E5-Q2 | medium | AC gap | 5.5 AC1 "real table at every width … nothing clipped" | `apps/web/src/surfaces/ficha/ficha.css` (`.ficha-mt` holds no narrow-width rule; `components.css:496 .measurement-table.is-wide` is never applied) | At 390 px, open TP-ENEL at Ensaios. The insulation table is 515 px wide inside a 343 px wrapper. The `1 minuto` input sits at x 236-417 in a 390 px viewport, so the unit tap-cycle and the cell Overflow ("Não medido") are off-screen. They can be reached only by scrolling the table sideways. The page itself does not scroll sideways, which is why `A5-E2E-001` stays green. See `10-ttr-cards-390.png`. | **Fix now.** Keep the value column visible, following the mock's narrow-table rule. Add a `@p1` assertion that the value input and the unit slot are inside the viewport at 390. |
| E5-Q3 | medium | ownership / seam (AR-17) | 5.1 AC3; spine AD-18 "kept through later edits; `integrity` flags 'concluída com pendências'" | `packages/domain/src/relatorio/sheet-state.ts:71`; `ficha-surface.tsx:284-312` | 1. Conclude CE-ENEL. 2. Clear one reading. 3. The header shows "Concluída por Ana Alves" and "1 obrigatório faltando" at once. The tree row and the Sumário still say "✓ Concluída" and count the sheet in "N de 94 concluídas". "Concluir ficha" has left the menu. No surface flags the missing field. See `07-concluded-with-missing.png`. | **Defer to Epic 7** (integrity and pre-issue), together with the open question below on whether an edit should clear `concluded_by`. |
| E5-Q4 | medium | defect (text truth, FR-30) | 5.8 AC3 | `packages/domain/src/relatorio/conclusion.ts:210-214` | `composeConclusion` writes "apresentou valores medidos dentro dos critérios de aceitação" whenever no reading is *out*. That includes sheets where nothing was measured: every capture "Não medido", every test sub-block disabled, or ratio rows with no VAL CALCULADO, such as the Porto Seguro transformer "380/220" (PR #32 OQ2). It writes "todos os itens verificados conformes" when the checklist is disabled or every row is NA. The signed paragraph then asserts measurements and conformities that do not exist. | **Fix now** in the kernel: assert "within the criteria" only when at least one capture was measured and judged, and "conformes" only with at least one C row. The replacement wording is a product question (OQ-3). |
| E5-Q5 | low | defect | 5.8 AC4 (AR-11 auditability) | `apps/web/src/surfaces/ficha/conclusao-section.tsx:262` | 1. Confirm the text while it reads 3,3 MΩ. 2. Change the reading to 2,5 MΩ. 3. The stored text still says 3,3 MΩ, but the Criteria line under it, which is its `aria-describedby`, now says "R_iso … 2,5 MΩ". The evidence contradicts the text it describes. See `05-stale-text-criteria-line-mismatch.png`. | **Fix now.** In the `stale` state, show the criteria line with the "Substituir" suggestion only, not as the evidence of the stored text. |
| E5-Q6 | medium | product question (safety) | 5.5 AC2 | `packages/domain/src/parse/pt-br-number.ts:19,40` | Per the AC rule, "120.001" typed in a TTR capture reads **120001**, and so does "62.873". The echo line shows "= 120.001", the same text that was typed, so the echo cannot reveal the thousands reading. The error is caught only because the cell turns amber and the outlier hint appears ("Fase S 100× acima de R e T"). See `08-ttr-ratio-1280.png`. Ratio and contact readings commonly carry 3 decimals. | **Product question for Matheus** (OQ-1). |
| E5-Q7 | low | defect | 5.5 AC2 | `pt-br-number.ts:106` (suffix regex with `/i`) | "147 mΩ" (milliohm) on an insulation cell is stored as 147 **MΩ**. The case-insensitive suffix turns an explicit milli into mega, a factor of 10^9. | **Fix now.** Accept m, g or t only without a following "Ω", or a lowercase m only when bare; refuse "mΩ". |
| E5-Q8 | low | defect (race) | 5.4 AC1, 5.8 AC1 | `apps/web/src/components/tri-state-control.tsx:81` (and the same guard in the Conclusion pair) | On a row with keyboard focus, press Space, ArrowRight and Delete in quick succession. The row stays **NC** in 1 of 3 runs. The Delete guard reads the rendered `value`, which is still one IndexedDB round trip old, so Delete is dropped. | **Fix now.** Clear without guarding on the stale prop, or track the pending value. |
| E5-Q9 | low | defect (visual vs mock) | 5.7 AC1 | `apps/web/src/surfaces/ficha/instrument-picker.tsx:166,198` | "Calibração vencida em 10/01/2026" renders in `ink-primary`. The mock rule `.instrument-picker .ip-expired` (`components.css:532`, color `fora-do-limite`) does not match because the host class is `instrument-picker-host`. Cadastros promises "Vencida = linha âmbar na ficha". See `11-sheet-1280-dark-readings.png`. | **Fix now.** Use the mock's class, or translate the rule in `app.css`. |
| E5-Q10 | low | AC gap | 5.9 AC2 "Read-only fields with `aria-readonly`" | `tri-state-control.tsx:89` | On a Não ensaiada sheet the checklist radiogroups carry `aria-disabled="true"` rather than `aria-readonly` (readings, instrument and conclusion do use `aria-readonly`). The behavior is correct: taps do nothing. | **Fix now** (`aria-readonly` on the radiogroup), or record a dated narrowing. |
| E5-Q11 | low | product question | 5.1 AC2 "completed steps collapse to their title once left" | `ficha-surface.tsx:237` | A step collapses once it is left with 0 missing, even when it holds an amber out-of-criterion reading and an outlier "Conferir?" hint. Both warnings disappear, and the collapsed title has no in-place expand; the stepper is the only way back. The cabine block also collapses together with a Placa step that has no nameplate. See `04-conclusion-text-com-restricoes-1280.png`, where Ensaio de isolação is collapsed. | **Product question** (OQ-4). |
| E5-Q12 | low | product question | 5.3 AC3 | `packages/domain/src/relatorio/nameplate-copy.ts:57` | "Igual à PR-ENEL?" copied every field, including **Nº SÉRIE** "PR123", which identifies one physical unit, onto PR-ENEL-2. The chip is also offered when the target's manufacturer is unknown. | **Product question** (OQ-5): exclude the serial and other per-unit identity keys? |
| E5-Q13 | low | product question | 5.9 AC1 "the last reason used in this relatório preselected" | `packages/domain/src/relatorio/ficha.ts` `lastNotTestedReason`; `not-tested-dialog.tsx` | With no reason used yet, "Impossibilidade de desligamento" is preselected, so one tap records a reason nobody chose. After "Desfazer", the reason used before is forgotten, because only live marks are read. | **Product question** (OQ-6). |
| E5-Q14 | nit | defect | 5.2 AC2 | `ficha.ts` `fieldValueText` (uses `formatDecimalPtBr`, ungrouped) | POTÊNCIA INSTALADA typed "1.500" shows as "1500" in the read-only cabine fields on the other sheets. | **Fix now** (use `formatDecimalGroupedPtBr`). |
| E5-Q15 | nit | defect | 5.5 AC4 | `readings.ts:400-403` | 3,3 MΩ against 3.300 and 3.200 MΩ, a gap of about 970×, reads "Fase C 100× abaixo". A value of 2,5 against 4.100 and 3.200 reads "1000×". Flooring to a power of ten understates the gap. | Defer, or round to the nearest power. |
| E5-Q16 | low | ownership (E4-A4) | E4-A4 "one `putBlockOp` for every … write" | `apps/web/src/surfaces/ficha/ficha-ops.ts:94-104` | `concludedByOp` and `notTestedOp` build `block/{id}/…` puts with a local `put` rather than the kernel's `putBlockOp`. | **Fix now** (small). |
| E5-Q17 | low | AC gap (EXPERIENCE) | EXPERIENCE › Conclusion control "Limpar … or the sheet Overflow menu" | `ficha-surface.tsx:315-317` | The sheet Overflow offers only "Renomear TAG" and "Marcar não ensaiado", with no "Limpar" for the conclusion. Delete and Backspace on the group work. | Fix with E5-Q8, or record a narrowing. |
| E5-Q18 | medium | test gap | 5.1 AC4, 5.3 AC4, 5.5 AC1, 5.7 AC2, 5.9 AC3, E4-A9 | `e2e/ficha.spec.ts` | These paths have no e2e test: (a) draft recovery of a typed reading (confirmed working in the browser); (b) "Copiar da última visita" (kernel only, unreachable until Epic 7 writes `last_nameplate`); (c) the 390 px table clipping (E5-Q2); (d) "Cadastrar instrumento" offline, then picking the new instrument (worked in the browser); (e) the Sumário's "não ensaiadas" count (worked in the browser); (f) the "Salvo" throttle; (g) Epic 5 touch tests in the matrix, such as tri-state taps and the M·G·T chips on android. | Add (a), (c) and (d) with the fixes. Defer (b) to Epic 7 and (g) to the next matrix pass. |

Counts by severity: **high 1**, **medium 5** (Q2, Q3, Q4, Q6, Q18), **low 10**, **nit 2**.

## Per-AC pass/fail

| AC | Result | Notes |
|---|---|---|
| 5.1 AC1 header, TAG button, rail, single column | pass | The TAG is a text button that renames; the rail shows at 768 and 1280, and none shows at 390. |
| 5.1 AC2 stepper and sticky bar | pass | Counts, current step and collapse work. The camera slot is empty. The bar unsticks at 470 px (`position: static`) and is sticky at 600. See E5-Q11. |
| 5.1 AC3 Concluir ficha | pass (seam E5-Q3) | Complete: `concluded_by` is written, the toast "Ficha concluída" shows, and the next sheet opens in tree order. Incomplete: the menu's "Concluir" jumps to the first missing field (e2e). |
| 5.1 AC4 autosave, Salvo, draft | pass | Draft recovery of a reading after the tab died was verified. The "Salvo" throttle is untested (E5-Q18). |
| 5.2 AC1 cabine block as location ops | pass | TIPO DE SE is a select and ALTITUDE is read-only "Do setup". |
| 5.2 AC2 read-only elsewhere and in the tree row | pass | The tree meta shows "ALVENARIA - CONVENCIONAL · 13,8 kV · 25 °C · 85 %". See the grouping nit E5-Q14. |
| 5.2 AC3 Copiar da cabine anterior | pass (e2e 5.2-E2E-001) | Not driven in the browser. |
| 5.2 AC4 humidity note | pass | 85 % shows "Chuva e umidade elevada". The 80 % threshold is an open question from PR #30. |
| 5.3 AC1 copy chips and Digitar | pass | The "Fotografar placa" tile is hidden. |
| 5.3 AC2 fields by kind | pass | Numbers use `inputmode="decimal"` and a unit suffix. Manufacturer and voltage class use the Story 2.5 combobox with "Criar". |
| 5.3 AC3 Igual à ⟨TAG⟩? | pass | Toast "Copiado de PR-ENEL — Desfazer". See E5-Q12. |
| 5.3 AC4 Copiar da última visita | partial | Covered by kernel tests only; not reachable before Epic 7 (E5-Q18). |
| 5.4 AC1 tri-state rows | pass | Mouse, arrows, Delete, Backspace and the Overflow "Limpar" all work. See the race E5-Q8. |
| 5.4 AC2 NC expansion | pass | Seed chips with no duplicate insert, the red required border and "Obrigatória em item não conforme" as `aria-describedby`. |
| 5.4 AC3 bulk Conforme | pass | "2 itens marcados Conforme — Desfazer". The Sticky bar mirrors the action while the checklist is on screen. |
| 5.4 AC4 Repetir and reasons | pass | Both reasons show beside `aria-disabled` actions. The enabled path is covered by e2e 5.4-E2E-002. |
| 5.5 AC1 table, caption, calc. cells | **fail at 390** | See E5-Q2. At 768 and 1280 it passes. |
| 5.5 AC2 parsing, echo, unit slot | pass | "3.300" gives 3300, "0.330" gives 0,33, "147G" gives 147 GΩ, and a row takes the previous row's unit. See E5-Q6 and E5-Q7. |
| 5.5 AC3 amber and Marcar Com restrições | pass | Never red. |
| 5.5 AC4 outlier hint | pass | `role="status"`. See the nit E5-Q15. |
| 5.6 AC1 Enter, Shift+Enter, Tab run | pass | The last cell's Enter focuses "Próxima ficha". |
| 5.6 AC2 Não medido "-" | pass | |
| 5.6 AC3 VAL CALCULADO and CONDIÇÕES | pass | 13,8 kV / 115 V gives 120,00 as the placeholder and the calc cell, and 120,1 gives SATISFATÓRIO. The single TAP row is a narrowing. |
| 5.7 AC1 pick by code, expired | pass | "2E — Megôhmetro" and "Calibração vencida em 10/01/2026", never blocked. See the color defect E5-Q9. |
| 5.7 AC2 none registered, offline | pass | "Nenhum instrumento cadastrado" and "Cadastrar instrumento" open `/cadastros` offline. An instrument created offline was picked and synced. |
| 5.8 AC1 suggestion row | pass | "Aprovado · Com restrições?". One tap sets both groups. |
| 5.8 AC2 Com restrições observation | pass | "Obrigatória com restrições". |
| 5.8 AC3 composed text and criteria line | pass (E5-Q4) | Composed offline with the criteria line. |
| 5.8 AC4 recompose, Confirmar, Editar, Substituir | pass (E5-Q5) | "Sugerido: texto atualizado — Substituir" shows and nothing is overwritten. |
| 5.9 AC1 reasons and Outro | pass (E5-Q13) | |
| 5.9 AC2 band, read-only, chip | partial | See E5-Q10. The band, the title chip and the tree chip work. Desfazer offline and unsynced needs no dialog; after sync it opens a Confirm dialog. |
| 5.9 AC3 progress and Sumário count | pass | "2 de 94 fichas concluídas · 1 não ensaiada". |
| E4-A1 generate and status seams | pass | `relatorioEditedSince` restricts to the stream, `issueOnRevision` issues after `snapshot_seq` and on unchanged, and setup uses `statusTable`. E4-E2E-001 is green. |
| E4-A2 project pull before Criar and offline refusal | pass | `equipmentReadyFor` with `syncProject`. E4-E2E-002 (two devices) is green. |
| E4-A3 undo hook, texto editado, exclusions | pass | Item 23 (template section 3 against setup exclusions) is still undecided. |
| E4-A4 single op builders, `projectLabel`, ART comment | partial | See E5-Q16. |

## Known-open items from the PR bodies

| PR | Item | Verdict |
|---|---|---|
| #29 | Offline readiness trusts a held relatório whose first download was cut | Confirmed still open. The trade-off was accepted. |
| #29 | Follow-up review for the unchanged path from Em campo | Partly covered. E4-E2E-001 covers the unchanged answer from Em revisão; the path from Em campo is still covered only by the jsdom test. |
| #30 | HIGH: nameplate number reformats mid-typing | **Refuted (fixed in #32).** "3.3", a 2.5 s pause, then "00" reads 3.300 while focused, after the blur and after a reload. |
| #30 | MEDIUM: Repetir overwrites answered rows | **Refuted (fixed in #31).** `repeatChecklistPattern` skips answered targets (5.4-E2E-002). |
| #30 | MEDIUM: 5.2 AC2 tree row | **Refuted (fixed in #31).** The tree meta shows the cabine values live. |
| #30 | MEDIUM: web and e2e coverage gaps | Partly confirmed. See E5-Q18. The Repetir enabled path and step jumps are now covered. |
| #30 | LOW items (draft on an unrevealed group, empty manufacturer, `cabineOf` on a removed cabine, the undo race, double "Concluir") | Not reproduced. Still open by code reading. |
| #31 | Rejected guards (`getSeed` try, undo re-check, `db === null`) | Agreed; low. |
| #32 | MEDIUM: no e2e for a reading's draft recovery | **Confirmed as a test gap.** The behavior works in the browser (E5-Q18a). |
| #32 | LOW: `criterion_override` ignored | Confirmed. `readings.ts:240` reads only the seeded criterion. |
| #32 | LOW: clearing the result after confirmation still prints the text | Confirmed by code (`conclusion.ts:263`). The sheet then counts as incomplete. |

## Open questions (for Matheus; not decided here)

1. **OQ-1 (E5-Q6):** Should the thousands-dot rule apply to ratio and contact-resistance captures, where readings like "120.001" or "62.873" are decimals? And should the echo line show a form that tells the two readings apart, for example "= 120 001" with a thin space?
2. **OQ-2 (E5-Q3):** Should any edit after "Concluir ficha" clear `concluded_by`, or should the sheet stay Concluída with an Epic 7 "concluída com pendências" flag, as the spine says?
3. **OQ-3 (E5-Q4):** What should the composed conclusion say when nothing was measured or checked? For example, "sem medições registradas" or "ensaios não realizados".
4. **OQ-4 (E5-Q11):** Should a completed step that holds an out-of-criterion reading or an outlier hint stay expanded once the engineer leaves it?
5. **OQ-5 (E5-Q12):** Should "Igual à ⟨TAG⟩?" skip per-unit keys (Nº SÉRIE, perhaps the fabrication date)?
6. **OQ-6 (E5-Q13):** With no reason used yet in the relatório, should the not-tested dialog preselect nothing?
7. Carried from the PR bodies and still undecided: Q15 (renaming a TAG shared with an Emitido relatório); item 23 (template section 3 against setup exclusions); the 80 % humidity threshold; CONDIÇÕES blank when a reading is out; the single TAP row; the Porto Seguro transformer fixture storing V PRIMÁRIO 13800 under **kV**.

## Re-check after #33

- **Head checked:** `fix/epic-5-qa` at `a5b3559`, on the same `fasor-qa5` stack. api and web were restarted. There is no schema or seed change.
- **`pnpm test:e2e:full`:** **EXIT 1.** 119 passed, 3 skipped (touch) and **1 failed**: `@p1 E5-Q8` (`e2e/ficha.spec.ts:1083`), on its Conclusão-pair half. The last `conclusion/result` op in the outbox was `"reprovado"`, not `null`. It passed **2 of 2** when re-run alone (`--repeat-each 2`). Load average was 2.3 to 2.5 before and after. Classified as a **flake under load**; see the residual risk E5-R1.
  - `4.2-E2E-002` (E5-Q1) now passes.
  - The new tests E5-Q2, Q9, Q17, Q18a and Q18d pass.
  - The api logged no `unhandled route error` in the whole window.
- **Browser (Playwright MCP):**
  - A new relatório was created through the UI.
  - SEC-ENEL was filled end to end at 768 px: nameplate by kind, bulk Conforme, 9 readings by Enter only ending on "Próxima ficha", the suggestion, Confirmar, then "Concluir ficha" moving to SEC-ENEL-2.
  - Also checked: 390 px in dark theme, 1280 px, the Não ensaiada path, and an expired instrument created in Cadastros and then picked.
  - The only console errors are one burst of `useSession must be used inside SessionProvider` and 502s, both at the moment of the api/web restart (Vite HMR on the old page). This is not a product error.

| Finding | Result | Evidence |
|---|---|---|
| E5-Q1 | **fixed** | 4.2-E2E-002 is green in the full run. No 500 was logged. Integration tests were added. |
| E5-Q2 | **fixed, with a new defect (E5-R2)** | At 390 px the value input, unit slot and Overflow now sit inside the viewport (input 236-294, unit 294-352, Overflow 236-284 of 390), with no sideways page scroll. But see E5-R2. Screenshot `14-recheck-q2-390-dark.png`. |
| E5-Q4 | **fixed** | With nothing recorded: "O TP TP-ENEL não apresentou valores medidos nem itens verificados registrados." With checklist only: "… apresentou todos os itens verificados conformes, sem valores medidos registrados." The wording is still OQ-3. |
| E5-Q5 | **fixed** | When the text is stale, the criteria line (250 GΩ) describes the "Substituir" button, not the stored text (330 GΩ). Screenshot `13-recheck-q5-stale-criteria.png`. |
| E5-Q7 | **fixed** | "147 mΩ" gives "Número não reconhecido" with `aria-invalid`. "147 m" reads 147 MΩ. |
| E5-Q8 | **fixed in the browser; the e2e is intermittent** | 6 of 6 fast Space, ArrowRight, Delete on a checklist row and 6 of 6 on Resultado end unset, also after a reload. The e2e failed once under load (E5-R1). |
| E5-Q9 | **fixed** | "Calibração vencida em 10/01/2026" draws in `rgb(138,75,0)`, which is `--fora-do-limite`, inside `.instrument-picker`. Screenshot `15-recheck-q9-expired-amber.png`. |
| E5-Q10 | **fixed** | On a Não ensaiada sheet the checklist radiogroup carries `aria-readonly="true"` and no `aria-disabled`. The unsynced Desfazer opens no dialog. |
| E5-Q14 | **fixed** | POTÊNCIA INSTALADA typed "1.500" on CE-ENEL reads "1.500 kVA" on PR-ENEL. |
| E5-Q15 | **fixed** | 3,3 against 3.300 and 3.200 (about 970×) now reads "Fase C 1000× abaixo de A e B". |
| E5-Q16 | **fixed** | `concludedByOp` and `notTestedOp` now use `putBlockOp` (checked in the diff). |
| E5-Q17 | **fixed** | The sheet Overflow has "Limpar conclusão". It clears both groups with the toast "Conclusão limpa — Desfazer", and Desfazer restores both. |
| E5-Q18 (a), (c), (d) | **fixed** | E5-Q18a `@p0`, E5-Q2 `@p1` and E5-Q18d `@p1` pass in the full run. Behavior (a) and (d) was also confirmed by hand in the first pass. |

The items still open (E5-Q3, Q6, Q11, Q12, Q13, Q18 b/f/g, and OQ-1 to OQ-6) are unchanged and stay as the PR lists them.

### New findings

| ID | Sev | Kind | Where | Reproduction | Disposition |
|---|---|---|---|---|---|
| E5-R1 | low | test flake / possible residual race | `e2e/ficha.spec.ts:1112`; `use-latest-choice.ts` | In `test:e2e:full` at load average 2.5, the Conclusão half of `@p1 E5-Q8` saw the UI unset while the last `conclusion/result` op was `"reprovado"`. It passed 2 of 2 alone, and 12 of 12 by hand. The edit queue serialises writes, so the cause is likely that the test reads the outbox before the `null` op lands. A dropped Delete, if it happened, would still show as a checked segment. | Defer. Make the poll wait for a `null` op after the `reprovado` one, or read the snapshot rather than the outbox's last row. Not a merge blocker. |
| E5-R2 | medium | defect (5.5 AC1 "nothing clipped") | `apps/web/src/surfaces/ficha/ficha.css` (the new `max-width: 767.98px` rule, `min-width: 128px`, flex-wrap) | At 390 px the insulation value input is **58 px wide**: "250" shows as "25", and a grouped "3.300" would be cut further. The cell Overflow wraps under the input. See `14-recheck-q2-390-dark.png`. The E5-Q2 e2e checks only that the controls are inside the viewport, not that the value is readable. | **Fix before or right after merge.** Give the input a readable minimum, for example the width of the Terra/Guard columns or `ch`-based, or stack the Terra and Guard columns under the Linha label on phone. Add a check that `input.scrollWidth <= input.clientWidth` for a 5-character value at 390. |
| E5-R3 | nit | defect | `generated-text-field.tsx` | With no reading and no NC, the Generated text field still shows the "Critérios usados" heading with an empty list. | Defer. Hide the heading when there are no items. |

**Verdict:** **merge**, with E5-R2 to be fixed in a small follow-up before the Epic 5 close; merge now only if that follow-up is scheduled. No finding regressed, E5-Q1 (high) is fixed, and the only full-run failure is a load flake that passes alone.
