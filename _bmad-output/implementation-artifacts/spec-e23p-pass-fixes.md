---
title: 'e23p: the behaviour-pass fixes (copied temperatures, the v13 insulation table in print, the previous value shown corrected, dry-only fields on an oil unit, the ground grid criterion)'
type: 'bugfix'
created: '2026-11-10'
status: 'done'
baseline_revision: 'b307ced129f855dfc6759d5f1d246a1ff3d94577'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-23-context.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_reason: 'The five fixes Matheus approved on 2026-11-10 from the Epic 23 hands-on behaviour pass (F2, F3, F4 screen half, F5, F7), before the release v0.8.0: one fix batch, one gate, one PR, as the coordinator launched it.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The Epic 23 behaviour pass on `47be2638` (report `scratchpad/e23-pass/report.md`, F-numbers its own) found: "Copiar da última visita" copies the transformer's oil and winding temperatures, measured on the day, so the second visit is corrected and judged with the first visit's temperature (F2); the v13 transformer insulation table breaks "SECUNDÁRIO" and "22,6" in the PDF in all three shapes, because fix batch e23w measured the "20 °C" column outside the 60 em budget and the renderer squeezes every column (F3); the "Anterior: …" line shows the measured previous value while the history rule judges the corrected ones, and the derived point names no values (F4, screen half); the dry-only fields of an oil transformer stay editable and keep a value that prints "-" (F5); the Malha's design value is never stated as a number outside the row helper (F7).

**Approach:** Kernel fixes in `packages/domain`, each with a test that fails first; the web reads the new kernel answers; one api integration test proves F3 on the real PDF. No contract number, no new op or route, no seed data change (`V13_HASH` unchanged).

## Boundaries & Constraints

**Always:**
- Every item gets a test that fails before its fix (unit first, then the e2e of its surface, `@p0` for the main path, asserting the outbox or the store, not only the screen).
- AD-1/AD-13: every text, verdict, list and width is the kernel's. Derived pt-BR text goes in `packages/domain`, surface copy in `apps/web/src/copy/pt-br.ts`; every new string is marked `// authored (e23p, listed for Bruno)`.
- Layout protection: v1 to v12 print byte-identical. `git diff origin/main --name-status -- apps/api/src/jobs/generate/golden packages/domain/fixtures` shows no `M` on a golden; layout-lock v5/v11/v12 and Porto Seguro green. On v13 only the transformer's insulation table (P2) and the Malha's criterion text with a design value (P5) change in section 9; the disjuntor's and seccionadora's paired tables print as today (F13 is reported, not fixed).
- `LLM_PROVIDER`/`OCR_PROVIDER` stay `fake`. Repo is public: no text from `docs/context/`.
- Every container run: `podman compose ... run --rm --user root tools ...`; every unit, api or Playwright run under `lockf -t 20000 /tmp/fasor-verify.lock`, started with nohup, logged in `.scratch-e23p/`, polled with bounded loops of at most 55 s. Restart the api (`podman compose restart api`) after any change under `packages/domain` or `apps/api` before `test:api` or an e2e.

**Never:**
- Never take a contract number, add an op family, a route, a seed key or a seed value.
- Never touch F1, F6, F8 to F20, nor the print half of F4 (the 10/20/12 GΩ row in section 9).
- Never change a v1 to v12 code path's output; never regenerate a golden (if one would move, STOP and report).
- Never use docker; never touch the main checkout or its stack; never `down -v`.

## I/O & Edge-Case Matrix

| Item | Input / State | Expected |
|---|---|---|
| P1 | v13 transformer, equipment `last_nameplate` holds TEMPERATURA DO ÓLEO 40 and TEMPERATURA DO ENROLAMENTO 45 among N filled fields; tap "Copiar da última visita" | the batch writes no op on `temperatura_oleo_c`/`temperatura_enrolamento_c`; both stay empty; the toast counts N-2 ("… campos copiados") |
| P1 | "Igual à ⟨TAG⟩?" from another v13 transformer of the relatório with both temperatures filled | neither temperature copied, count excludes them |
| P1 | same on the disjuntor (CONTADOR DE OPERAÇÕES), the para-raio (DESLIGADOR ÍNTEGRO) and the Malha (CONDIÇÃO DO SOLO) | not copied by either chip (the day-measured list, Design Notes) |
| P1 | v12 or older sheet, any field | copies exactly as today (none of the five keys exists before v13) |
| P1 | a plate reading (fake provider) on a v13 transformer | unchanged: a photo fills only what it reads today |
| P2 | v13 oil transformer, manufacturer's value (one criterion), 1 MINUTO 8 / 9 / 0,6 GΩ at 35 °C of oil ("20 °C" column 22,6 / 25,5 / 1,7) | the real PDF holds every cell word whole; the kernel's size is 7,5 pt (15 half points) |
| P2 | same plate with TENSÃO NOMINAL AT 13,8 kV and BT 380 V (per-row ACEITÁVEL, 11 columns) | every word whole in the PDF; 7 pt (14) |
| P2 | per-row plus MANUT. ANTERIOR (12 columns; a v13 previous visit with corrected readings) | every word whole in the PDF; 6 pt (12) |
| P2 | one criterion plus MANUT. ANTERIOR (11 columns) | every word whole; 7 pt (14) |
| P2 | v13 disjuntor and seccionadora (paired open/closed tables with "20 °C"), any v1 to v12 table | widths and size exactly as on `b307ced1` |
| P3 | v13 transformer, previous v13 visit stored `{raw:'12', unit:'GΩ', corrected:{raw:'30', unit:'GΩ'}}` on a cell | the cell's line reads "Anterior: 12 GΩ, 30 GΩ a 20 °C (rev. 1, dd/mm/aaaa)" |
| P3 | the winding resistance's previous corrected value (75 °C) | "Anterior: 2,1 Ω, 2,3 Ω a 75 °C (rev. …)" |
| P3 | previous reading with no `corrected` (v12 visit, an uncorrected test such as contact) | the line is byte-equal to today |
| P3 | a cell restricted by the insulation drop (corrected 30 → 10 GΩ) | the derived `restricao` point's text names both: "…: queda de mais de 50 % desde a manutenção anterior (de 30 GΩ para 10 GΩ, a 20 °C)" |
| P3 | the winding's variation rule | "…: variação de mais de N % desde a manutenção anterior (de 2,3 Ω para 3,5 Ω, a 75 °C)" |
| P3 | the contact rise (out) | its point already names both values (`64 µΩ em … (alta de … sobre 40 µΩ …)`): unchanged, asserted |
| P3 | the conclusion clause, the parecer, section 9 | byte-equal (the restriction's `reason` is unchanged; only the point reads the new comparison) |
| P4 | v13 transformer, TIPO DE ISOLAÇÃO ÓLEO ISOLANTE | TEMPERATURA DO ENROLAMENTO and CLASSE TÉRMICA drawn read-only, "—", with the kernel's reason under them; never missing; no N/A (as today) |
| P4 | same with a value already stored in a dry field (typed before, or copied) | the value is kept in the store, the screen shows "—" and the reason, print "-" as today; it shows again if the unit becomes dry |
| P4 | a dry unit (EPÓXI / Á SECO) with CLASSE TÉRMICA filled, switched to ÓLEO ISOLANTE | one batch puts null on every filled dry field (with the oil items as today), the toast names what it cleared and offers "Desfazer", which restores them |
| P4 | an unknown unit (TIPO DE ISOLAÇÃO empty), or a v6 to v12 transformer | unchanged (no `dry_fields` before v13; an unknown unit excuses nothing) |
| P5 | Malha with VALOR DE PROJETO 3 Ω | the test's criterion line, the out helper's criterion, the derived point, the suggested conclusion and the printed conclusion state "≤ 3 Ω, valor de projeto" |
| P5 | Malha with VALOR DE PROJETO empty | "≤ valor de projeto (sem ele, ≤ 5 Ω)" everywhere, as today |

</intent-contract>

## Code Map

- `packages/domain/src/relatorio/nameplate-copy.ts` -- `nameplateCopyFields` :52 ("Igual à"), `lastNameplateCopy` :110 ("Copiar da última visita"), `camposCopiadosText`. Web caller `apps/web/src/surfaces/ficha/nameplate-section.tsx` :164-212, :373 (no change expected).
- `packages/domain/src/seed/v13.ts` :91-92 (temperatures), :108 `contador_operacoes`, :129 `desligador_integro`, :663 `condicao_solo`; read-only for this batch (frozen, `V13_HASH`).
- `packages/domain/src/print/section-9.ts`:
  - `emWidth` :783, `CELL_ALLOWANCE_EM` :806, `CONTENT_WIDTH_EM` :811 (58), `READING_FIT_WIDTH_EM` :818 (60);
  - `fittedColumns` :851 (`outsideBudget`, e23w W2-K2), `longestWords`, `wordsWiderThanColumns` :943, `readingFitWidthEm` :1026;
  - `measurementTable` :960 (`outside` at :998-1001), `CORRECTED_COLUMNS` :1012, `sideBySide` :1038, `withAppendedColumn` :1069;
  - `testParts` :1099 (`pairShape` :1104; per-row ACEITÁVEL and MANUT. ANTERIOR :1121-1127).
  - Renderer: `apps/api/src/jobs/generate/sections/section-9.ts` (`CELL_MARGINS` 70 twips each side, `columnWidths` proportional over `CONTENT_WIDTH_TWIPS` 10466, `TableLayoutType.FIXED`). Font: Liberation Sans in the api container (`fc-match Arial`), metric-compatible with Arial.
- `packages/domain/src/print/last-results.ts` -- `previousHelperText` :155, `previousHelpers` :163 (web: `ensaios-section.tsx` :203). `LastResultReading.corrected` (`schemas/entities.ts` :351).
- `packages/domain/src/relatorio/restriction.ts` -- `historyFinding` :64, `historyOf` :106, `applyRestrictions` :128 (sets `cell.restriction = {reason, text}`); `applyHistoryRise` :191 (already names both values).
- `packages/domain/src/relatorio/measurement-evaluation.ts` -- `markRestricted` :702, `applyHistory` :912 (winding, 75 °C), `maxFieldLimit` :831, `applyMaxField` :843, `criterionTextOf` :432, `mark` :515, `evaluate` :1115 (the `lines` of the criteria :1180), `restrictedMeasurements` :1414.
- `packages/domain/src/relatorio/conclusion.ts` -- `restrictedItems` :465 and `restrictedClause` :472 (print, keep); `points/derived.ts` :224-255 (the `restricao` entries, the only reader of the new comparison). `print/section-8.ts` :210 prints an unwritten derived entry's text.
- `packages/domain/src/relatorio/oil-rule.ts` -- `isOilFieldExcused` :99 (already excuses `dry_fields` on an oil unit), `oilCrossingPuts` :137, `oilCrossingClearedCount` :172, `oilItemsClearedText` :186. Web: `nameplate-section.tsx` :186-196 (`commitOilField`, toast), :408-470 (field rendering, `ReadOnlyField` from `ficha-fields.tsx` :830), `ficha-ops.ts` `withOilCrossing`.
- Tests to extend: `relatorio/nameplate-copy.test.ts`, `relatorio/three-levels.test.ts` :585-650 (pins 16 half points), `print/criteria-tables-print.test.ts` :156-168 (pins 13), `relatorio/oil-rule.test.ts`, `relatorio/e23t-transformer-tests.test.ts`, the Malha tests (`grep -rln malha_aterramento packages/domain/src`). Api PDF pattern: `apps/api/src/jobs/generate/layout-lock.integration.test.ts` (fixture applied with `applyOps`, preview, pdfjs text); `last_results` seeded as a server put like `apps/api/src/sync/three-levels.integration.test.ts` :51-75.
- E2e: `e2e/v13-nameplate.spec.ts`, `nameplate-values.spec.ts`, `oil-dry.spec.ts`, `oil-dry.durability.spec.ts`, `previous-visit-judges.spec.ts`, `previous-visit.spec.ts`, `ground-grid.spec.ts`, `temperature-correction.spec.ts`, `winding-resistance.spec.ts`.

## Tasks & Acceptance

**Execution:**
- `relatorio/nameplate-copy.ts` -- (P1) export `DAY_MEASURED_NAMEPLATE_KEYS: ReadonlySet<string>` = `temperatura_oleo_c`, `temperatura_enrolamento_c`, `contador_operacoes`, `desligador_integro`, `condicao_solo` (by key, so company copies of the base types follow), and `isDayMeasuredField(key)`. `nameplateCopyFields` and `lastNameplateCopy` skip them. Unit tests per chip and per type, and the count.
- `print/text-metrics.ts` (new) -- (P2) `printTextEm(text, bold)`: the advance width in ems of Arial/Liberation Sans, regular and bold, from a per-character table (A-Z, a-z, digits, space and the punctuation `.,:;/()-%`, Á À Â Ã É Ê Í Ó Ô Õ Ú Ç and lower-case accents as their base letter, `°` 0.400, `Ω` 0.780, `µ` 0.580, `≥`/`≤` 0.550, `·` 0.340); any other character falls back to `emWidth`'s class estimate (bold × 1.07). Unit test: a few words against hand sums.
- `print/section-9.ts` -- (P2) a "whole" fit for a single (not side-by-side) reading table that carries a corrected "20 °C" column: `fittedColumns` takes an option that measures words with `printTextEm`, counts EVERY column (the corrected one included) against `CONTENT_WIDTH_EM`, and steps through the given steps; when the floor still does not fit, it keeps stepping one half point at a time down to 10 (5 pt). Record such tables (a `WeakSet`, as `CORRECTED_COLUMNS`); `withAppendedColumn` re-fits a recorded table the same way and records the result; `sideBySide` never does (the disjuntor's and seccionadora's pairs keep the e23w rule). `readingFitWidthEm` returns `CONTENT_WIDTH_EM` for a recorded table and `wordsWiderThanColumns` measures it with `printTextEm`. `testParts` passes the flag only when `!pairShape`. Same columns, headers, order and texts.
- `relatorio/three-levels.test.ts`, `print/criteria-tables-print.test.ts` -- (P2) the pins move to the new sizes (15 and 12) with the new word check, and new cases for shapes (b) 14 and (d) 14; the disjuntor/seccionadora case still `undefined`; a pin that the v12 transformer table's columns and size are unchanged.
- `apps/api/src/jobs/generate/v13-insulation-print.integration.test.ts` (new) -- (P2) one synthetic v13 relatório (fixed ids in a range no other test uses, Empresa A, invented values) with four transformer sheets (shapes a, b, c, d of the matrix; c and d get an `equipment/{id}/last_results` server put with corrected readings), applied with `applyOps`, previewed through the api; with pdfjs, group text items into lines (same page, baseline within 0,5 pt, items adjacent), and assert for each table that every expected word appears whole the expected number of times (`SECUNDÁRIO` 3, `PRIMÁRIO` 3, `MASSA` 3, `22,6`, `25,5`, `1,7`, `SEGUNDOS`, `MINUTO`, `ESTAB./10MIN`, `ABSORÇÃO`, `POLARIZAÇÃO`, `TENSÃO`, plus `ACEITÁVEL` and `ANTERIOR` where present) and that no line holds a strict fragment of them (`SECUNDÁRI`, `22,`). With `E23P_PDF_OUT=<path>` set it also writes the PDF there (for the PR crops). Fails on `b307ced1`.
- `print/last-results.ts` -- (P3) `previousHelperText` takes the test's reference temperature (null when uncorrected); with a reading's `corrected` and a reference, "Anterior: {prev}, {corrected} a {ref} °C (rev. {n}, {date})". `previousHelpers` reads the reference by test key: a table test's `temperature_correction.to_c`, a measurement test's `winding_correction.to_c`.
- `relatorio/restriction.ts`, `relatorio/measurement-evaluation.ts` -- (P3) the history findings gain `compared` ("de {before} para {now}, a {ref} °C", both corrected values in their own units via `correctedText`); the cell's `restriction` carries it optional (merged with "; " like `reason`). `reason` and `text` unchanged.
- `relatorio/conclusion.ts` / `measurement-evaluation.ts` / `points/derived.ts` -- (P3) a points-only item list (`restrictedPointItems`, and a `pointItems` on `RestrictedMeasurement`) appends " ({compared})" to the reason; the two `restricao` entries use it; `restrictedItems`/`restrictedClause` unchanged.
- `relatorio/oil-rule.ts` -- (P4) `oilCrossingPuts` also puts null on every filled `dry_fields` cell when the write crosses to an oil unit (after = oil); `dryFieldExcusedReason(block, fieldKey, ctx): string | null` gives, for a dry field the unit excuses, "Não se aplica: {label of the rule's field} é {stored value}." (authored); `oilCrossingToastText(puts, snapshot): string` keeps `oilItemsClearedText`'s output when no dry field is cleared and otherwise names both parts ("{n} itens de óleo apagados e {m} campos de unidade a seco apagados", each part only when its count is above 0; authored, plurals via `plural`).
- `apps/web/src/surfaces/ficha/nameplate-section.tsx` -- (P4) a field with a `dryFieldExcusedReason` renders `ReadOnlyField` with value null and the reason as helper (never the stored value, not editable); the oil-field crossing toast uses `oilCrossingToastText`.
- `relatorio/measurement-evaluation.ts` -- (P5) for a `max_field` criterion with a plate value, the criterion line and the out cell's `criterionText` read `{limit.text}, valor de projeto` (authored, e.g. "≤ 3 Ω, valor de projeto"); without one the seed's text, as today.
- E2e -- (P1) in `v13-nameplate.spec.ts` (or `nameplate-values.spec.ts`): a v13 transformer whose equipment has a last plate with both temperatures: the chip copies the rest, the outbox holds no temperature op, the toast count excludes them; (P4) in `oil-dry.spec.ts` or `v13-nameplate.spec.ts`: ÓLEO ISOLANTE shows the two dry fields read-only with the reason; EPÓXI with CLASSE TÉRMICA filled, then ÓLEO ISOLANTE, clears it in one batch with the toast and "Desfazer" restores it (store asserted); (P3) in `previous-visit-judges.spec.ts`: the "Anterior:" line names the corrected value and the `restricao` point's text both values; (P5) in `ground-grid.spec.ts`: with VALOR DE PROJETO 3 the header, the point and the suggested conclusion read "≤ 3 Ω, valor de projeto"; empty, the default wording.
- Docs -- `deferred-work.md` § "Deferred from: Epic 23 fix batch e23p (2026-11-10)"; strike and close the e23w row "No PDF was checked by eye" and the e23a row "11 columns" with what the PDF now shows; `docs/kbs/architecture/kernel-and-seed.md` dated paragraph; `docs/kbs/log.md` line.

**Acceptance Criteria:**
- Given each matrix row, when its test runs on `b307ced1`, then it fails, and after the fix it passes.
- Given the four-shape v13 relatório, when the api previews it through LibreOffice, then no word of any insulation table cell is split across lines in the PDF.
- Given the goldens, when the gate runs, then layout-lock v5/v11/v12 (DOCX and PDF text) and Porto Seguro are byte-equal and the golden diff shows no `M`.
- Given the gate, when it runs, then lint, static, test:unit, test:api and the touched specs on `desktop-chrome` and `durability-desktop-chrome` are green.

## Spec Change Log

## Review Triage Log

### 2026-11-10 — Review pass
- layers: Edge Case Hunter and Verification Gap ran; Blind Hunter and Intent Alignment skipped (token economy; the integrated epic review covers them).
- verdicts: 13 findings — high 0, medium 1, low 11, false 0, maybe-false 1
- findings:
  - `[medium]` `[patch]` VG: the history comparison is untested where a cell carries two restrictions (`markRestricted`'s merge, `applyRestrictions`' join) — action: one unit case per path (insulation drop plus below-largest; winding phase band plus history), with the placement fix below.
  - `[low]` `[patch]` VG other / EC: with two findings the comparison follows the whole joined reason, so it reads as the other rule's values — action: each comparison attached to its own reason in the point text; `reason` and the print unchanged. Grouped with the row above (same root: how `compared` is joined).
  - `[maybe-false]` `[reject]` VG other: the paired disjuntor/seccionadora tables are pinned by size and whole words, not columns — the pair path passes `single = false`, so `fittedColumns` runs the unchanged branch (`wholeFit` false); a column pin would settle it, and if true it would be low.
  - `[low]` `[reject]` EC: a dry field typed while TIPO DE ISOLAÇÃO is empty, then ÓLEO ISOLANTE, is not cleared (no crossing from an unknown unit) — the value is kept and hidden, as the spec states for a value already stored, and mirrors the oil fields (an unknown unit never crosses); the fix adds a branch to the crossing rule.
  - `[low]` `[reject]` EC: a copy chip can bring a stale dry value onto an oil sheet — the value is hidden and prints "-"; a crossing clears dry fields before they are issued, so a stale one is rare; the fix adds a new guard.
  - `[low]` `[reject]` EC: `pairShape` true with unequal column counts prints a lone corrected table under e23w's rule — both halves share one definition and one appended-column decision, so the counts never differ on the seeded types.
  - `[low]` `[reject]` EC: a whole-fit table that still overflows at 5 pt gives no signal — the four shapes fit at 6 pt or above, pinned by unit tests and the PDF test.
  - `[low]` `[reject]` EC: `referenceOf` could label a previous corrected value with another seed's temperature — only v13 stores `corrected` and its references are fixed (20 °C, 75 °C).
  - `[low]` `[reject]` EC: `maxFieldCriterionText` says "valor de projeto" for a company copy whose field is renamed — the e23e out helper already uses the same literal; a renamed field is an editor case outside the pass.
  - `[low]` `[defer]` EC: a pending plate-reading suggestion on a dry field of an oil unit is not drawn and "Confirmar todos" could write it hidden — already a `deferred-work.md` row of this batch (the value prints "-").
  - `[low]` `[reject]` EC: the PDF test identifies the four tables by position — the fixture's tree order is fixed (no "Agrupar por tipo"), the test passes, and section 9 never reorders the tree (AD-16).
  - `[low]` `[reject]` EC: the fragment check misses a suffix break such as "S" + "ECUNDÁRIO" — the count check of every expected word catches any break.
  - `[low]` `[patch]` EC: the same misplaced comparison, reported from the edge-case side (`applyRestrictions`, `markRestricted`) — patched with the VG rows above (same root cause).

## Design Notes

- **P1 list (decision for Matheus to confirm).** The two temperatures are the launch's. CONTADOR DE OPERAÇÕES (read on the day), DESLIGADOR ÍNTEGRO (the arrester's state at the visit, and the prerequisite that reproves it: a copied SIM would pass it unseen) and CONDIÇÃO DO SOLO (the soil on the day the grid is measured) are the other v13 fields that describe the visit, not the plate. MÉTODO DE MEDIÇÃO, TAP ATUAL and every plate field keep copying.
- **P2 sizes.** By Arial's advance widths the 10-column table's words alone take 446,6 pt of the 523,3 pt line at 8 pt, plus 10 × 7,5 pt of margins and rules: 1 pt to spare, so no width split holds 8 pt safely and the table steps to 7,5 pt; the per-row table to 7 pt (today's size, now with widths that hold), with MANUT. ANTERIOR to 6 pt. The extra columns' headers are the "30 SEGUNDOS"/"ESTAB./10MIN"/"ABSORÇÃO"/"POLARIZAÇÃO" ones the old estimate over-sized (bold upper case about 10 % wide); the new metric gives their slack to the connection columns and "20 °C".
- **P3 print.** The point's text is also section 8's bullet while the point is not written (`derivedGroupText`), so that bullet names the two values on a v13 sheet; section 9 and the conclusion are unchanged.
- **P4 reading.** On main an oil field on a dry unit is not missing, has no N/A and is cleared at the crossing, but it stays editable (the launch described it as not editable). This batch draws the dry fields of an oil unit read-only with a reason and clears them at the crossing; the oil fields of a dry unit keep today's screen (open: align them the same way).

## Verification

- Iterate with narrow runs: `podman compose --profile tools run --rm --user root tools pnpm exec vitest run --project <kernel project> <file>`, one Playwright spec with `pnpm exec tsx scripts/e2e.ts e2e/<spec>.ts --project desktop-chrome --project durability-desktop-chrome`, the api file with `pnpm --filter @app/api exec vitest run <file>` (check the repo's script names), each under `lockf -t 20000 /tmp/fasor-verify.lock`.
- The orchestrator runs the story gate.

## Auto Run Result

- **Status:** done. Branch `e23p-pass-fixes` from main `b307ced1` (main unchanged since).
- **Implemented:** P1 (`DAY_MEASURED_NAMEPLATE_KEYS`, neither copy chip copies the five day-measured keys); P2 (`print/text-metrics.ts` `printTextEm` and `WHOLE_FIT_TABLES` in `print/section-9.ts`: the v13 transformer's insulation table, printed alone with its "20 °C" column, fits every column against the page by Arial's widths; 7,5 pt one criterion, 7 pt per-row ACEITÁVEL or MANUT. ANTERIOR, 6 pt both; paired tables and v1 to v12 unchanged); P3 (`previousHelperText` with the previous corrected value; `restriction.pointReason`, read only by the `restricao` points); P4 (`dryFieldExcusedReason`, the dry fields of an oil unit drawn read-only with the reason; `oilCrossingPuts` clears them on a crossing to oil, toast `oilCrossingToastText` with "Desfazer"); P5 (`maxFieldCriterionText`, "≤ N Ω, valor de projeto").
- **Files:** kernel `relatorio/nameplate-copy`, `print/text-metrics` (new), `print/section-9`, `print/last-results`, `relatorio/restriction`, `relatorio/reading-cells`, `relatorio/conclusion`, `relatorio/measurement-evaluation`, `relatorio/oil-rule`, `points/derived`; web `nameplate-section`, `nameplate-suggestions`, `ficha-ops`; api test `v13-insulation-print.integration.test.ts` (new); unit tests `nameplate-copy`, `text-metrics`, `three-levels`, `criteria-tables-print`, `oil-rule`, `e23t-transformer-tests`, `e23e-tc-thermo-ground`; e2e `v13-nameplate`, `oil-dry`, `previous-visit-judges`, `ground-grid`; docs `deferred-work.md`, KB `architecture/kernel-and-seed.md`, `log.md`; PDF crops in `e23p-pdf-crops/`.
- **Review:** 13 findings (Edge Case Hunter 10, Verification Gap 3): 1 medium entry patched (the history comparison placed after its own reason, with two-rule tests; three rows of one root cause), 1 low deferred (already a ledger row), 9 rejected (see the triage log).
- **Follow-up review:** not recommended (one medium entry patched, no high).
- **Verification:** story gate on `1d41b639`, lock wait 0 s, load `{ 3.86 5.25 7.33 }` to `{ 5.25 6.77 7.09 }`: lint 0, static 0, test:api 959 passed / 6 skipped, test:unit 6133 of 6136 (the three reds in `telemetry/flush.test.ts` and `setup-surface.test.tsx`, untouched files, passed alone under the lock 69 of 69, load `{ 4.32 6.48 6.98 }`), 21 touched specs 108 of 108 (parallel 76, queue 28, solo 4). Goldens: no `M`. The PDF test fails on `b307ced1`'s `section-9.ts` ("SECUNDÁRI"/"O", "22,"/"6").
- **Residual risks:** the P1 list and the P4 reading (Design Notes) await Matheus; the derived point's new comparison also prints in section 8 while the point is unwritten; F13 (paired tables) reported, not fixed.
