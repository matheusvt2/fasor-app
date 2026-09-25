---
title: 'Stories 12.3 and 12.4: the sheet repeats nothing, the plate and the NC in fewer taps'
type: 'feature'
created: '2026-09-25'
status: 'in-review'
baseline_revision: 'f027678e9915a39a06b0af0640c2e6e3823bd8ad'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-12-context.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_reason: 'Both stories change the equipment sheet surface and the seed (new seed v2); one batch for token economy.'
deferred:
  - summary: >-
      The prefilled nameplate TAG is derived, never written, so a consumer reading sheet.nameplate directly sees no TAG.
    evidence: |-
      nameplateTagPrefill returns the block TAG while the cell is absent; print does not read the nameplate yet. Settle when Epic 7 prints the plate (it must read nameplateTagPrefill) and by checking whether the issue-time last_nameplate projection reads sheet.nameplate.
    location: >-
      packages/domain/src/relatorio/nameplate-copy.ts nameplateTagPrefill
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** The sheet asks again what the cabine and the relatório already know (J-02, J-03, J-07, J-08, J-09, J-10, J-16): "Igual à" copies serials and TAG, cabine fields are not required and repeat on every sheet, the instrument is picked per test per sheet, the plate hides behind "Digitar", "Outro…" needs a second tap, the NC observation is typed twice, and "Não ensaiado" preselects a reason.

**Approach:** Kernel first (seed v2 with `per_unit` and a third Não ensaiado reason; `suggestedInstrument`, `cabineProgress`, TAG prefill, suggested sheet observation), then the sheet renders those rules. Source: `epics.md` Stories 12.3 and 12.4 (12.4's Não ensaiado criterion dated 2026-09-24, not the struck one); `source-deltas.md` rows 49-52 and 56 (they win).

## Boundaries & Constraints

**Always:**
- AD-1/AD-13: every rule, count and derived text lives in `packages/domain`; `apps/web` renders and writes ops only. Strings follow the three homes of AGENTS.md; authored copy marked `// authored:`.
- AR-20: `packages/domain/src/seed/v1.ts` untouched (pinned by `seed.test.ts`). New `seed/v2.ts` derived from v1; `SEED_VERSIONS` gains `v2`; `SEED_VERSION = 'v2'`. A relatório/template keeps its `seed_version`; v1 relatórios keep v1 behavior.
- Nothing unconfirmed is written: the suggested instrument is written only by "Concluir ficha" (same batch as `concludedByOp`) or by a pick; the suggested observation only by its "Confirmar" or by the conclusion text's confirm (same batch).
- Keep 12.1's press path (`apps/web/src/input/press-hold.ts` `useHeldWhilePressed`) and `stepMayCollapse`; `e2e/lost-taps.durability.spec.ts` stays green.
- `tokens.css`/`components.css` stay byte-identical. `.cabine-line` and `.cl-missing` exist only in `mockups/components-v09.css`: mirror them in `apps/web/src/styles/app.css` with a comment naming the v09 rule, v09 tokens resolved to their v0.8 values (`--touch-min`, `--surface-sunken`, `--r-md`).
- Mock class names: `cabine-line`, `cl-name`, `cl-values`, `cl-missing`, `btn-text`, `suggestion-field[data-state=suggested]`, `suggested-pill` (`mockups/key-equipment-sheet-v09.html` lines 59-116).

**Never:** Tailwind or new kits; editing `v1.ts`, `epics.md`, `sprint-status.yaml`; touching the printed OBSERVAÇÕES rule or status on generate (J-19); changing section-collapse timing; regenerating the Porto Seguro golden (fixture stays v1, values unchanged).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected |
|---|---|---|
| Igual à, v2 | source plate full | copies every filled field except `per_unit` (identificacao, n_serie, tag); toast "Copiado de ⟨TAG⟩" + Desfazer |
| Copiar da última visita | equipment `last_nameplate` | copies all fields incl. per-unit (source-deltas row 50: same equipment) |
| Igual à, v1 block | v1 has no `per_unit` | copies as today (AR-20) |
| Instrument suggestion | test instrument cell empty, instrument X last used for that test key in the relatório, X live | header shows X as Suggestion; Concluir ficha writes it with `concludedByOp` |
| No suggestion | cell filled, or no prior use, or X removed, or sheet not tested | picker as today |
| Cabine first sheet | cabine field empty (altitude excluded, it is setup's) | counts in `placa` missing and "obrigatórios faltando"; block expanded; Concluir ficha jumps to it |
| Cabine other sheet, complete | all cabine fields filled | one `cabine-line` + "Editar"; tap expands the editable fields |
| Cabine other sheet, incomplete | field empty | expanded, editable, not counted in that sheet |
| TAG prefill | block equipment TAG "SEC-2", nameplate `tag` cell absent | TAG field shows "SEC-2", helper "Do bloco · editável", not missing; rename block TAG updates it; a typed/cleared cell stops following |
| NC observation | NC item 7 with observation "conexão frouxa", sheet observation empty | Suggestion "Item 7: conexão frouxa" (one line per NC item with observation, checklist order, number = row number); missing until confirmed |
| Não ensaiado dialog | opens (sheet menu or tree row) | four chips from seed (3 standard + Outro), none selected, primary disabled with reason; Outro needs non-empty text |

</intent-contract>

## Code Map

- `packages/domain/src/seed/schema.ts` (`fieldDefSchema` l.23) -- add optional `per_unit: z.literal(true)`.
- `packages/domain/src/seed/v1.ts` -- read-only; `NOT_TESTED_REASONS` l.604, `CABINE` l.587, `IDENTIFICACAO`/`N_SERIE`/`TAG` l.35-38.
- `packages/domain/src/seed/definitions.ts` -- `SEED_VERSION` l.24, `SEED_VERSIONS` l.53; `NOT_TESTED_REASON_KEYS` derives keys automatically.
- `packages/domain/src/relatorio/nameplate-copy.ts` -- `nameplateCopyFields` (Igual à) skips `per_unit`; `lastNameplateCopy` unchanged.
- `packages/domain/src/relatorio/sheet-progress.ts` -- `sheetProgress(snapshot, blockId)` takes `Pick<RelatorioSnapshot,'blocks'> & Partial<Pick<RelatorioSnapshot,'relatorio'|'locations'|'equipment'>>`; `placaMissing` treats a prefilled TAG as filled and adds `cabineProgress` missing on the cabine's first sheet (`isCabineFirstSheet`, `ficha.ts` l.61); `conclusaoMissing` unchanged (observation still counts until written).
- `packages/domain/src/relatorio/instrument-pick.ts` -- `lastInstrumentIdFor` l.116, `instrumentHeaderOf` l.30: build `suggestedInstrument` and `suggestedInstruments(snapshot, blockId)` (every enabled test of the block with a suggestion) here.
- `packages/domain/src/relatorio/sumario.ts` `cabineMetaText` l.106 / `measure` l.95; `tree.ts` l.227 cabine node `meta` -- add `metaMissing: string | null`.
- `packages/domain/src/relatorio/pre-issue.ts` l.81 -- add kind `cabine_incompleta`, severity `pending`, row `section_9`.
- `packages/domain/src/relatorio/conclusion.ts` -- add `suggestedSheetObservation(block, definition): string | null`.
- `packages/domain/src/index.ts` -- export every new function.
- `apps/web/src/surfaces/ficha/cabine-block.tsx` -- today editable only when `cabineFirst`; becomes line + expandable editable block on every sheet.
- `apps/web/src/surfaces/ficha/ficha-surface.tsx` -- `revealed` state l.230 and `goTo` l.264 (drop `setRevealed`); `conclude()` l.310 builds on fresh `blocks` (the edit's build receives blocks only; take locations/equipment/instruments from the render snapshot); `NotTestedDialog` l.571 `lastReason` prop goes.
- `apps/web/src/surfaces/ficha/nameplate-section.tsx` -- drop "Digitar"/`revealed`/`onReveal`; chips above the always-visible grid while empty.
- `apps/web/src/components/registry-picker-field.tsx` l.73 -- "Outro…" sets `showCombobox`; focus the combobox input after it renders.
- `apps/web/src/surfaces/ficha/instrument-picker.tsx` -- closed state renders the suggestion when there is one.
- `apps/web/src/surfaces/ficha/conclusao-section.tsx` l.168-235 -- observation field; `confirmText` l.192 gains the observation op when suggested.
- `apps/web/src/components/suggestion-field.tsx` -- shared Suggestion field (reuse, add an optional helper if needed).
- `apps/web/src/surfaces/relatorio/not-tested-dialog.tsx`, `relatorio-tree.tsx` l.383 (dialog) and l.495 (`.s9-cab-meta`).
- `apps/web/src/copy/pt-br.ts` (`ficha.cabine` l.630, `ficha.nameplate`, `ficha.ensaios`, `sumario.tree`) -- new strings.
- `apps/api/src/db/standard-template.integration.test.ts` l.70 expects `'v1'` -- becomes `SEED_VERSION`; check whether the standard-template seeder inserts only when missing.
- Tests: `packages/domain/src/seed/seed.test.ts`, `nameplate-copy.test.ts`, `sheet-progress.test.ts`, `instrument-pick.test.ts`, `pre-issue.test.ts`, `conclusion.test.ts`; `e2e/ficha.spec.ts` (helpers `openRelatorio`, `openEnel`, `openSheet`, `field`, `checklistRow`, `stepper`, `instrumentDraft`; Digitar and preselection uses must be updated), `e2e/tree.spec.ts`.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/seed/{schema.ts,v2.ts,definitions.ts}` -- `per_unit` flag; `CABINE_PRIMARIA_V2` = v1 deep copy with `per_unit: true` on nameplate keys `identificacao`, `n_serie`, `tag` of every block type, and reasons `impossibilidade_desligamento`, `solicitacao_cliente`, `equipamento_inacessivel` (label "Equipamento inacessível", justification `// authored:` "Os ensaios não foram realizados devido à impossibilidade de acesso ao equipamento."), `outro`; register v2, `SEED_VERSION='v2'`.
- `packages/domain/src/relatorio/*` -- `suggestedInstrument(snapshot: Pick<RelatorioSnapshot,'blocks'|'instruments'>, blockId, testKind: TestKey): InstrumentHeader | null`; `suggestedInstruments(snapshot, blockId): {testKey, header}[]`; `cabineProgress(snapshot: Pick<RelatorioSnapshot,'relatorio'|'locations'>, cabineId): {missing: {group:'se'|'env'; key: string; label: string}[]; complete: boolean}` (altitude excluded); `cabineLineText(location)` ("Alvenaria · 13,8 kV · 380 V · 1.500 kVA · 25 °C · 65 %" shape, stored values, `measure` formatting); `cabineMissingText(p)`: one → "falta ⟨a/o campo⟩" (authored short names with article: o tipo de SE, a tensão primária, a tensão secundária, a potência instalada, a temperatura, a umidade — mock "falta a umidade"), two or more → "faltam ⟨n⟩ campos" (authored), none → null; `nameplateTagPrefill(snapshot: Pick<RelatorioSnapshot,'blocks'|'equipment'>, blockId): string | null` (equipment TAG when the definition has `tag` and the cell is absent); `sheetProgress` widening above; `suggestedSheetObservation`; `preIssue` row text `// authored:` "⟨cabine⟩: ⟨cabineMissingText⟩"; tree `metaMissing`.
- Kernel unit tests -- seed v2 vs v1 diff is exactly flags + reason; Igual à over each of the eight block types never copies a `per_unit` key present in it and copies the rest; last-visit copies per-unit; `suggestedInstrument` matrix rows; `cabineProgress`/texts; first-sheet counting; TAG prefill counting and rename; observation lines and ordering; preIssue severity `pending`.
- `apps/web/src/surfaces/ficha/cabine-block.tsx` + `app.css` -- expanded (today's two sections, editable, missing fields marked `data-missing-field` on the first sheet) when first sheet, incomplete, or "Editar" tapped (per-visit state); otherwise `.cabine-line` `role="group"` `aria-label="Da cabine"`: `.cl-name` cabine name, `.cl-values` line text, `.btn-text` "Editar" (48 px). ~~Read-only on a not-tested sheet as today's non-first rendering.~~ (2026-09-25, review: the cabine is not the sheet's data; it stays editable on a not-tested sheet, as the first sheet was before 12.3.)
- `nameplate-section.tsx`, `ficha-surface.tsx`, `registry-picker-field.tsx` -- fields always visible; TAG shows the prefill as its value with helper "Do bloco · editável"; editing writes a normal nameplate op; "Outro…" focuses the combobox input.
- `instrument-picker.tsx`, `ficha-surface.tsx` -- suggestion: `.field.suggestion-field[data-state=suggested]` with the instrument text, `.suggested-pill` "Sugerido", helper "Último usado neste relatório · confirmado ao concluir a ficha, ou toque para trocar" (mock verbatim); a tap opens the picker as today; `conclude()` appends `testInstrumentOp` per `suggestedInstruments` of the fresh blocks in the same batch as `concludedByOp`.
- `conclusao-section.tsx` -- with the observation empty and a suggestion: the observation field is `.suggestion-field[data-state=suggested]` showing the suggestion, pill, "Confirmar" (writes it), helper "Montada dos itens NC · confirmada com o texto da conclusão" (mock verbatim); typing replaces it (focus+blur without a change writes nothing); the red "required" helper is not shown while the suggestion stands (the jump lands on its Confirmar); confirming the conclusion text writes the suggested observation in the same batch.
- `not-tested-dialog.tsx`, callers -- no preselection; primary disabled with a `btn-reason` (`// authored:` "Escolha um motivo"; with Outro and empty text "Descreva o motivo"); Outro text required.
- `relatorio-tree.tsx` -- `.s9-cab-meta` appends `<span class="cl-missing">` when `metaMissing`.
- `e2e/sheet-knows-12-3-12-4.spec.ts` (`@p0`) -- as a human (clicks, typing, reload) at 768 px: Igual à keeps own serial/TAG and toast Desfazer; instrument suggested on the second sheet, Concluir ficha writes it (reload shows it stored); cabine line on a later sheet, Editar, edit a value, it shows on the first sheet; cabine missing counted on the first sheet and "falta …" on the Sumário cabine row; nameplate fields visible without Digitar, TAG prefilled; Outro… then typing lands in the combobox and "Criar" works; NC observation suggested and confirmed with the conclusion text, zero typing; Não ensaiado from sheet menu and tree menu with no preselection, third reason, Outro requires text.
- `e2e/journeys-12-3-12-4.spec.ts` (`@p1`) -- J1 (SEC-ENEL new plate), J2 (one NC), J3 (second seccionadora) per `review-journey-2026-09-24.md` § 6, counting taps (clicks/presses) and keystrokes; assert J3 taps <= 5 and J2 one chip and 0 typed characters for the observation; attach counts via `test.info().annotations`.
- Update existing unit/e2e tests broken by the new behavior (Digitar, preselection, optional Outro text, cabine read-only, v1 expectations); do not rewrite unrelated specs.

**Acceptance Criteria:**
- Given a relatório on seed v2, when "Igual à ⟨TAG⟩?" is tapped, then IDENTIFICAÇÃO, Nº SÉRIE and TAG are not copied and the toast reads "Copiado de ⟨TAG⟩" with Desfazer.
- Given an instrument used for a test kind earlier in the relatório, when another sheet with that test opens, then its header shows it as "Sugerido" and "Concluir ficha" stores it in the conclusion batch; with "Próxima ficha" nothing is stored.
- Given a cabine with an empty field, when its first sheet opens, then the header counts it, "Concluir ficha" jumps to it, the Sumário cabine row shows "falta …", and preIssue has a non-blocking row.
- Given any later sheet of a complete cabine, when it renders, then only the `cabine-line` shows, and "Editar" opens editable fields whose change reaches every sheet.
- Given an empty nameplate, when the sheet opens, then all fields show with the chips above, no "Digitar", TAG prefilled from the block.
- Given an NC item with an observation and Com restrições, when the conclusion text is confirmed, then the sheet observation holds the suggestion and the sheet is concludable with nothing typed.
- Given the Não ensaiado dialog, when it opens, then nothing is selected and the primary stays disabled with its reason until a reason (and text for Outro) is given.
- Given `pnpm verify`, when run in the tools container, then it is green, including `e2e/lost-taps.durability.spec.ts`.

## Spec Change Log

### 2026-09-25 — review pass 1
- Trigger: edge-case finding "a cabine whose sheets are all not tested can never be filled" (cabine-block read-only on a not-tested sheet).
- Amended: the cabine-block task line (read-only on a not-tested sheet struck; the block stays editable).
- Known-bad state avoided: a pending "falta …" row no surface can clear; the pre-12.3 editable first sheet regressing to read-only.
- KEEP: everything else in the diff; applied as a patch instead of a re-derivation (one review-fix loop, token economy).

## Review Triage Log

### 2026-09-25 — Review pass
- verdicts: 18 findings — high 0, medium 7, low 8, false 1, maybe-false 2
- layers run: Edge Case Hunter, Verification Gap; Blind Hunter and Intent Alignment skipped (token economy; the integrated Epic 12 review covers them)
- findings:
  - `[medium]` `[patch]` VG: fresh-row cabine check in `conclude()` never tested with an otherwise complete first sheet — @p0 case added.
  - `[medium]` `[patch]` VG: concluding with a prefilled unwritten TAG only covered by @p1 — 12.3-E2E-002 pushes the plate without `tag`.
  - `[medium]` `[patch]` VG: the observation's own "Confirmar" never clicked — step added to 12.4-E2E-001.
  - `[medium]` `[patch]` VG: typing into the suggested observation never exercised — grouped with the two ECH typing findings; typing step added.
  - `[low]` `[patch]` VG: cabine block on a not-tested sheet unpinned — assertion added (now: still editable).
  - `[low]` `[patch]` VG other: journeys `of('observation').keys` can never fail — interactions tagged.
  - `[false]` `[reject]` VG other: TAG prefill also on v1 relatórios — the prefill is a kernel UI rule, not seed data; the matrix row does not condition it on the seed version.
  - `[medium]` `[patch]` ECH: mouseup after the rAF select collapses the selection, typing mixes into the suggestion — typing now replaces the whole suggestion.
  - `[medium]` `[patch]` ECH: keystroke before the rAF select inserts into the suggestion — same root cause and fix as above.
  - `[medium]` `[patch]` ECH: all sheets of an incomplete cabine not tested leaves the cabine unfillable — cabine block editable regardless of the sheet's not-tested state (spec line amended, see change log).
  - `[low]` `[reject]` ECH: first sheet not tested counts the cabine on no sheet — after the patch the fields are editable on every sheet while incomplete and preIssue names them; a not-tested sheet has no "Concluir ficha" to block.
  - `[low]` `[reject]` ECH: no `data-missing-field` marker when the first sheet is not tested — same reason; the block is expanded and preIssue names the fields.
  - `[low]` `[patch]` ECH: Sumário "faltam N campos" on a cabine with no equipment — `metaMissing` null there.
  - `[low]` `[patch]` ECH: "— · faltam 6 campos" — no "—"/separator before the missing text.
  - `[low]` `[reject]` ECH: "Outro…" focus rAF may pull focus back within two frames — a move within ~33 ms is not everyday use; the fix adds cancellation plumbing.
  - `[maybe-false]` `[defer]` ECH: prefilled TAG never written, so a printer or `last_nameplate` projection reading `sheet.nameplate` sees no TAG — settle when Epic 7 prints the plate (it must read `nameplateTagPrefill`) and by checking the issue-time `last_nameplate` projection.
  - `[low]` `[reject]` ECH: instrument removed between render and "Concluir ficha" still written — sub-second race, the header is a copy by value (AR-18) of an instrument the engineer saw suggested.
  - `[maybe-false]` `[patch]` ECH claim: not-tested sheet of a complete cabine shows the line, not read-only sections — resolved by the cabine-editable patch (the line with "Editar" is the intended rendering).

## Design Notes

- Narrowings (PR body): "Copiar da última visita" carries per-unit fields (source-deltas row 50 over the epics AC wording); v1 relatórios and existing v1 templates keep v1 behavior (AR-20), so a template created before this change keeps producing v1 relatórios; cabine missing fields count in the first sheet's `placa` step (the cabine block renders inside it); the sheet observation stays required until confirmed (one tap, no typing) instead of being written by "Concluir ficha"; cabine line shows the mock's full value list (adds V and kVA to the AC's list).
- Open questions for Bruno/Matheus: the "Equipamento inacessível" justification; "falta ⟨campo⟩" short names and "faltam ⟨n⟩ campos"; the preIssue row text; the dialog's disabled reasons; whether existing v1 templates should move to v2.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:unit` -- expected: green.
- `docker compose --profile tools run --rm tools pnpm exec playwright test e2e/sheet-knows-12-3-12-4.spec.ts e2e/journeys-12-3-12-4.spec.ts e2e/lost-taps.durability.spec.ts` -- expected: green; journey counts printed.
- `docker compose --profile tools run --rm tools pnpm verify` -- expected: green.
