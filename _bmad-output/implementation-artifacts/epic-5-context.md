# Epic 5 Context: Fill the equipment sheet offline

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

A field engineer fills an equipment sheet end to end with taps, not typing where a tap will do: cabine data entered once per cabine, nameplate by copy chip or by typing, checklist with bulk actions and per-item chips, measurements typed in one continuous run against sourced criteria with pt-BR parsing and outlier hints, a suggested conclusion with device-composed paragraph and its criteria line, a "Não ensaiado" path with a reason, and attribution and autosave throughout. This epic also builds the two shared field components used across the sheet — Suggestion field and Generated text field — for the derived conclusion; Epic 8 later wires the reading pipeline into the same components without changing their shape.

## Stories

- Story 5.1: Open a sheet and move through its four steps
- Story 5.2: Record the cabine's characteristics and test environment once
- Story 5.3: Fill the nameplate by copy or by typing
- Story 5.4: Mark the checklist with taps, not typing
- Story 5.5: Type a reading with its unit and see it judged against the criterion
- Story 5.6: Type all of a sheet's readings in one continuous run
- Story 5.7: Pick the instrument by its code
- Story 5.8: Conclude the sheet with one tap and a text the app wrote from its own values
- Story 5.9: Mark an equipment as not tested

## Requirements & Constraints

- Every committed field value is an op with no Save button; a visually hidden "Salvo" status announces at most every few seconds; reopening after a closed tab with uncommitted text offers "Rascunho encontrado — Recuperar" (FR-32, FR-61).
- `progress(snapshot, blockId)` counts unset checklist rows, required measurements, the conclusion and required observations, with unconfirmed suggestions counting as empty; it never blocks navigation. "Concluir ficha" only emits `concluded_by` at Progress = Completa; otherwise it jumps to the first missing field (FR-29, FR-32).
- Insulation is captured at **1 minuto only** (not 30 s/10 min); the app computes no absorção/polarização index — the instrument already does (source-deltas.md row 9). `VAL CALCULADO` for ratio tests stays computed by the kernel.
- Typing is the primary path for readings; "Ler visor" fills instantly only with signal, and never overwrites a typed value (source-deltas.md row 16). Budget: at most 20 taps and 15 keystrokes with signal, about 36 keystrokes offline.
- Nameplate field counts follow the decoded FO.SERV-03, not the PRD: para-raio 5, chave seccionadora 10, disjuntor 13, TP 12, TC 14, transformador 12, cabos 0 (source-deltas.md row 8; `addendum.md` §9).
- NC checklist chips ship pre-seeded with standard non-conformity phrases per item, plus the five most recently typed values for that item in this relatório (source-deltas.md row 30).
- Não ensaiado reasons are exactly Impossibilidade de desligamento, Solicitação do cliente, Outro (with text) — "Acesso" was never attested (source-deltas.md row 18).
- Sheets store created-by, last-modified-by and concluded-by; the document prints concluded-by falling back to last-modified-by (source-deltas.md row 22).
- "Copiar da última visita" appears only when the Equipment row has `last_nameplate ≠ null`; "Igual à ⟨TAG⟩?" means same block type and manufacturer within this relatório (source-deltas.md row 19).
- No criteria or checklist editing is in scope before the first real job (source-deltas.md row 33).
- The app calculates, compares, highlights and suggests; it never sets a verdict. Reprovado is never suggested. An expired calibration warns and never blocks (NFR-10).
- Conclusion text, the criteria line and every status/count/text/order/verdict are computed on the device, never by a model and never duplicated in `apps/web` (NFR-12, AD-1/AD-13 below).

## Technical Decisions

- **AD-1/AD-13 ownership.** `packages/domain` computes every status, count, text, order and verdict once; `apps/web` renders only from IndexedDB and writes only ops into the outbox; neither app contains a function that derives a status, count, text, order or verdict of its own.
- **AR-10 — Field kinds and value shapes.** Field definitions carry `kind`, `unit?`, `options?`; `number` values are `{raw: decimal string, unit, state: measured|not_measured|empty}`; dates ISO; path value schemas validate on both sides against `(seed_version, block_type, fieldKey)`; parsing happens only in `packages/domain/parse` at the input boundary; per-sheet `criterion_override = {operator, value, unit, source}`.
- **AR-11 — Suggestion entity and provenance.** Server emits `suggestion/{id}` creates with `status = pending` only; confirm/discard are batches; device-side `compareSuggestion` runs on non-empty targets; device-computed suggestions (like the conclusion pair and text) are derived on read, never rows, and carry `text_status` (`confirmed`/`edited`) plus `text_basis` (hash of inputs) so a later value change shows "Sugerido: texto atualizado — Substituir" without overwriting.
- **AR-17 — Sheet state precedence and attribution.** `block/{b}/not_tested = {reason, text?, at, by} | null`; `block/{b}/concluded_by = {actor_id, at} | null`; precedence is Não ensaiada › Concluída (kept through edits; integrity flags "concluída com pendências") › Em preenchimento › Vazia; values in disabled sub-blocks are retained but ignored by progress, pre-issue, conclusion text, integrity, sync counts and the renderer.
- **AR-18 — Registry references.** Clients and Instruments are referenced by id but the instrument header is copied by value at selection (`instrument_id, code, manufacturer, model, serial, cert_number, calibrated_at, valid_until, test_parameter`); Manufacturer and Voltage class are stored on sheets by value; `calibrationCheck` gives a 30-day "expiring" window after the service period end and never blocks.
- **AR-24 — Equipment as project scope and `last_nameplate` projection.** `equipment.last_nameplate` is written at issue by Epic 7; Story 5.3's "Copiar da última visita" reads it and copies only the keys present in the target block's current definition, never fetching over the network.
- Kernel functions this epic exercises directly: `progress`, `sheetState`, `suggestNameplateCopy`, `suggestConclusionPair`, `composeConclusion`, `compareCriterion`/outlier check, `parse`/`format`, `calibrationCheck` — all live once in `packages/domain` (AR-2).

## UX & Interaction Patterns

- Mockups: `mockups/prototype/screens/60-ficha.html` (base sheet), `mockups/key-equipment-sheet.html` (tablet, phone, dark), `mockups/key-sheet-states.html` (Not tested, Suggestions pending, Draft found, Confirm dialog + Undo toast) — match at 390/768/1280 px per UX-DR0.
- UX-DR16 Sticky action bar: Section stepper row (missing counts, current step marked, tap to scroll/expand, completed steps collapse) above a button row with the Camera capture slot at the left (empty/hidden until Epic 6), primary action, and the bulk action mirrored while the checklist is in view; sits above the keyboard, unsticks below 480 px viewport height.
- UX-DR17 Camera capture button and the "Fotografar placa"/"Fotografar equipamento" tile variant are built by Epic 8 and stay hidden (never a disabled placeholder) until then.
- UX-DR33/34/35: Sheet header (type + TAG as a 48 px rename button, location line, attribution line, Progress counter with no hint sentences); Progress counter never blocks navigation; Section stepper is not a wizard.
- UX-DR36/37/38: Bulk action bar with reasons shown via `aria-disabled` when nothing applies; Tri-state control (56 px C/NC/NA radiogroup, arrow keys, Delete clears, re-tap never un-marks); Checklist row with NC expansion (chips, required Observation, "Adicionar foto"/"Criar ponto de atenção" slots reserved for Epic 6).
- UX-DR39/40: Measurement field (unit tap-cycle toggle, parsed echo line, amber out-of-criterion helper with "Marcar Com restrições", neutral outlier helper, never a block, red never used); Measurement table (real table at every width, calculated cells read-only with a "calc." mark, only TTR stacks into cards on phone, one continuous Enter run per sheet).
- UX-DR42: Instrument picker (code + short name, chevron detail, always-visible expired-calibration line, remembers last code per test type, empty-state "Cadastrar instrumento").
- UX-DR43/44: Conclusion control (two stacked radiogroups, suggestion row disappears once set); Observation field (required border + reason line when Com restrições).
- UX-DR45/46/47: Suggestion field and Generated text field shared components (built here, empty crop slot for Epic 8); Criteria line as a meta `aria-describedby` line printed under the Conclusão row.
- UX-DR48/49: Not-tested chip and band (violet, "Desfazer", fields become Read-only with `aria-readonly`, photos/observation stay editable); Read-only field pattern reused for cabine data on non-first sheets of the same cabine.
- UX-DR72: Autosave everywhere, no Save button; Enter down/Tab right on grids; tree order for next/previous sheet; undo via persistent toast; banned patterns include auto-verdicts, pre-marked Conforme, unconfirmed AI writes and color-only state.

## Cross-Story Dependencies

- Story 5.1 (sheet shell, stepper, sticky bar, `concluded_by`) is the frame every other story in this epic renders into.
- Story 5.3's "Copiar da última visita" chip depends on `equipment.last_nameplate`, populated by an Epic 7 story at issue — the chip renders correctly with no data pre-issue.
- Stories 5.5/5.6/5.7 (readings, continuous run, instrument picker) compose the Measurement table together; Story 5.8's suggested conclusion and composed text read the checklist (5.4) and measurement (5.5/5.6) results.
- Story 5.9 (not tested) overrides the read/write behavior of the nameplate, checklist and tests built in 5.3–5.8 via `sheetState` precedence.
- The Suggestion field and Generated text field components built in Story 5.8 (and referenced by 5.3's copy chips) are reused as-is by Epic 8, which only fills their crop/reading slots — no shape change expected there.
- Epic 4 retro carries nine open action items relevant to sheet/tree boundaries: see `_bmad-output/implementation-artifacts/epic-4-retro-2026-09-24.md`.
