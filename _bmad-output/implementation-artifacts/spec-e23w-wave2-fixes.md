---
title: 'e23w: the Epic 23 wave 2 fixes (re-issue ordering, prerequisite off, standing restriction, confirm tests, parecer reason, 8 pt, TP-02, contact rise, the 60 s poll)'
type: 'bugfix'
created: '2026-11-09'
status: 'done'
baseline_revision: 'efc4e1a9a63207f6dbe9956202a2f2a7633b2eb5'
review_loop_iteration: 0
followup_review_recommended: true
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-23-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-e23v-three-levels.md'
warnings: ['batched', 'oversized']
batched_reason: 'The second pass of the Epic 23 wave 2 integrated review (W2-1 to W2-4, W2-K1, W2-K2), the wave 2 gate red W2-G1, and Bruno''s 2026-11-09 answers B-4 and B-6, which land on the same kernel files (restriction, conclusion, points, last_results); one fix batch, one gate, one PR, as the coordinator launched it.'
deferred:
  - summary: >-
      A v13 arrester whose nameplate sub-block is switched off while it still stores DESLIGADOR ÍNTEGRO NÃO stays Reprovado by a plate value the sheet no longer shows.
    evidence: |-
      `failedPrerequisites` reads the stored field whatever the sub-blocks (W2-2's "unconditionally", Story 23.6's AC). Whether a hidden plate value may fail the sheet is a product choice for Matheus with Bruno: keep it, or read the prerequisite only while the nameplate sub-block is on.
    location: >-
      packages/domain/src/relatorio/restriction.ts failedPrerequisites
    severity: medium
---

<intent-contract>

## Intent

**Problem:** The wave 2 code read of `8c097ffa` confirmed that a re-issue judges against a later visit and a re-issue overwrites a newer `last_results` (W2-1), that the arrester's failed disconnector prerequisite vanishes when its test is switched off (W2-2), that a stored `restricao` point reads "Origem resolvida" while its rule still flags the test (W2-3), and that the conclusion's two visit-context confirms are untested (W2-4). The parecer files a prerequisite-only Reprovado as reasonless (W2-K1); the v13 transformer insulation table prints at 7,5 pt, not the approved 8 pt (W2-K2). Bruno answered B-4 (the TP judged by Table 100.5 by its medium) and B-6 (a contact pole more than 50 % above the previous visit's is Reprovado). `@p1` 13.5-E2E-004 is red on main (W2-G1).

**Approach:** Kernel fixes in `packages/domain` with boundary tests, the two seed additions in `seed/v13.ts` (re-pin `V13_HASH`), one print rule for the corrected table, and e2e coverage per item. No contract bump (38 and 39 are reserved for e23t and e23e): every change rides existing paths, ops and row shapes.

## Boundaries & Constraints

**Always:**
- v1 to v12 relatórios and Porto Seguro keep their verdicts and print byte-equal: the layout-lock goldens (v5, v11, v12) and the Porto Seguro goldens are never regenerated. If one would change, stop and report.
- Every new behaviour is reached through a v13 definition key or a v13-only path (AD-21). Statuses, verdicts, counts and texts live in `packages/domain` (AD-1, AD-13).
- New pt-BR strings are marked `// authored (e23w, listed for Bruno)` and listed in the Auto Run Result.
- The base (`docs/context/Fasor_Base_Ensaios_MT_rev08.json`, gitignored; on this machine only at the main checkout `/Users/matheusvilella/Documents/estudos/fasor-app/docs/context/`) is cited by row ID only (TP-02, DJ-03, SC-03); never copy its text or values into a tracked file.
- Run every command in the `tools` container: `podman compose --profile tools run --rm --user root tools <cmd>`; Playwright only under `lockf -t 20000 /tmp/fasor-verify.lock`. Restart the api (`podman compose restart api`) after changing `packages/domain` or `apps/api`, before api tests or e2e.

**Never:**
- No `CONTRACT_VERSION`/`MIN_CONTRACT_VERSION` change, no new op path, no change to `lastResultsSchema` (no nested `prior`). If a fix cannot be done without one, stop and report.
- No change to the 60 em rule or the step lists for any table without a corrected column; no change to section 9's layout beyond W2-K2.
- No vague term (B-1) becomes a rule; no history rule on cables, TC or TP.

## I/O & Edge-Case Matrix

| Item | Input / State | Expected |
|---|---|---|
| W2-1 read | `last_results` top = A (this relatório) | previous = top.prior (unchanged) |
| W2-1 read | top = B, B.prior = A (A re-issued after B was issued) | previous = null: the visit before A is no longer stored, a later one is never taken; MANUT. ANTERIOR "-", no history judgement |
| W2-1 read | top = B, prior not A | previous = B as today (the chain cannot tell; known open) |
| W2-1 write | issue of A, existing top = B with B.prior = A | top stays B; B.prior becomes A's new entry (without prior) |
| W2-1 write | re-issue of A (revision > 1), top = B unrelated to A, B.issued_at after A's first issue | nothing written for that equipment (B is a later visit) |
| W2-1 write | first issue of A over B | A on top, prior = B (as today) |
| W2-2 | v13 para-raio, DESLIGADOR ÍNTEGRO = NÃO, "Ensaio de isolação" switched off (or NA by applicability) | floor Reprovado · Com restrições (reason `prerequisite`), one `reading` point for `isolacao` with the prerequisite clause, the conclusion paragraph names it, parecer not Apto |
| W2-2 | SIM, empty, or v12 arrester | no effect |
| W2-3 | stored `restricao` point; its test's rule still flags a row whose reading is now out | point not in `resolvedOriginPoints` |
| W2-3 | stored `restricao` point; no rule flags any row any more | point resolved (as today) |
| W2-K1 | Reprovado only by the prerequisite | parecer sentence "… por pré-requisito do ensaio não atendido (PR-1)."; basis gains `prerequisite` only when non-empty |
| W2-K2 | v13 transformer insulation with the 20 °C column, one criterion | `textHalfPoints` 16 (8 pt) |
| B-4 | v13 TP, AT 13,8 kV, TIPO DE ISOLAÇÃO EPÓXI / Á SECO | TP-02 rows judged by Table 100.5's dry minimum for 13 800 V, helper names the table |
| B-4 | same, ÓLEO MINERAL | oil minimum |
| B-4 | medium empty | v12's > 400 MΩ with the existing "Sem o tipo de isolação na placa…" helper |
| B-4 | AT typed "13,8/√3" | judged by 13 800 V (the class voltage) |
| B-6 | v13 disjuntor, previous v13 visit pole A 40 µΩ, now 61 µΩ (+52,5 %) | pole A out, test failed, floor Reprovado, `reading` point naming the pole and the rise |
| B-6 | now 60 µΩ (exactly +50 %) or 59 µΩ | not out by this rule |
| B-6 | previous pole missing, previous ≤ 0, previous or current over range, previous visit on v12 | no judgement by this rule |
| B-6 | pole both deviation-restricted and risen > 50 % | out |

</intent-contract>

## Code Map

- `packages/domain/src/print/reading-slots.ts:94` `previousResultsFor` -- W2-1 read side. Consumers: `relatorio/visit-context.ts:70`, `print/section-9.ts:1035`, `print/last-results.ts:157` `previousHelpers` (web `ensaios-section.tsx:196`).
- `packages/domain/src/print/last-results.ts:102` `lastResults(snapshot, {revisionNumber, issuedAt})` -- W2-1 writer; the prior chain is in its doc comment.
- `apps/api/src/jobs/generate/job.ts:500` -- calls `lastResults`; has `deps.db`, `liveRevisions` (used at :521) to read the relatório's first issue instant.
- `packages/domain/src/schemas/entities.ts:359-379` -- `lastResultsSchema` (read only: do not change).
- `packages/domain/src/relatorio/restriction.ts` -- `applyRestrictions` (:124, skips non-`within` cells at the `cell.verdict !== 'within'` guard), `prerequisiteFailure` (:168). W2-2, W2-3 and B-6 live here.
- `packages/domain/src/relatorio/reading-evaluation.ts:840` `evaluateTest` (the `judging.previous` is built only for `history_drop_pct`), :889 prerequisite, :909 `evaluateSheetReadings` filters switched-off and NA tests.
- `packages/domain/src/relatorio/conclusion.ts:129` `conclusionFloor`/`computeFloor` (:176 prerequisite from evaluations), :427 `readingClause`, :442 `prerequisiteClause`, :505 paragraph.
- `packages/domain/src/points/derived.ts:123` `sheetEntries` (:153 prerequisite map from evaluations; :194 `restricao` only without a `reading` entry), :297 `resolvedOriginPoints`.
- `packages/domain/src/relatorio/parecer.ts` -- `REPROVADO_REASONS`, `reprovadoSentence`, the `byReason` loop and the basis (`reprovadoBy`).
- `packages/domain/src/relatorio/reading-run.ts:129` `WorstReading`, :150 `worstReadings` (B-6's out text).
- `packages/domain/src/relatorio/reading-cells.ts:42-140` `ReadingVerdict`, `EvaluatedCell` (`restriction?` optional field precedent for a new optional field).
- `packages/domain/src/seed/schema.ts:265` `restrictionSchema` (+ its refine), :350 doc; `seed/v13.ts:27` `CRITERION_TABLES` (TC's entry is the TP's model), :221 `E23V_KEYS`; `seed/seed.test.ts` `V13_HASH`.
- `packages/domain/src/types/validate.ts:191`, `types/draft-edit.ts:302-304` -- every restriction key list; a new key must be carried (Duplicar, prune, validation).
- `packages/domain/src/print/section-9.ts:790` `READING_FIT_WIDTH_EM`, :830 `fittedColumns`, :938 `measurementTable` (has `corrected`), :632 `printedCorrectedOf`.
- `packages/domain/src/relatorio/three-levels.test.ts:585` -- the 7,5 pt pin (W2-K2) and the e23v kernel fixtures to reuse.
- `apps/web/src/surfaces/ficha/conclusao-section.tsx:282` `confirmAdjusted`, :327 `confirmText`; test file `conclusao-section.test.tsx`.
- e2e templates: `e2e/previous-visit-judges.spec.ts` (two relatórios of one obra through the DOCX), `e2e/contact-pole-deviation.spec.ts`, `e2e/temperature-correction.spec.ts`, `e2e/criteria-tables.spec.ts`, `e2e/three-levels.spec.ts`; serial specs in `e2e/support/groups.ts` `SERIAL_SPECS`.
- `e2e/reading-wait.spec.ts:384` 13.5-E2E-004 (W2-G1).

## Tasks & Acceptance

**Execution:**
- `print/reading-slots.ts`, `print/last-results.ts`, `apps/api/src/jobs/generate/job.ts` -- W2-1 per the matrix. Order is first-issue order: a relatório is before another when it was first issued earlier. Read side: chain only (top = X -> prior; top.prior = X -> null; else top). Writer: `lastResults` takes an optional `firstIssuedAt` (the job passes the relatório's earliest revision `created_at`, `issuedAt` for revision 1); top linked to X by `prior` -> refresh that prior and keep top; top unrelated and issued after `firstIssuedAt` on a re-issue -> no entry; otherwise as today. Kernel tests for each row; one api integration test (`apps/api/src/http/generate.integration.test.ts` or `sync/three-levels.integration.test.ts`) issuing A, then B, then A rev 2 and reading `equipment/{id}/last_results` (top B, prior A rev 2).
- `relatorio/restriction.ts` (or a sibling) + `conclusion.ts` + `points/derived.ts` -- W2-2: one kernel reader of failed prerequisites over every test of the definition carrying `restriction.prerequisite`, whatever its sub-block or applicability; the floor, the points (a `reading` entry keyed `reading:{block}:{testKey}`, its text as today's prerequisite text), the conclusion paragraph and the parecer read it. With the test on, the result is unchanged from today.
- `relatorio/restriction.ts` + `reading-cells.ts`/`reading-evaluation.ts` + `points/derived.ts` -- W2-3: the rules are also evaluated on measured captures already `out` (verdict unchanged), and the test records that its restriction stands (a new optional field, absent on v1 to v12); `resolvedOriginPoints` counts a `restricao` source as standing when its test has a restricted row or a standing rule. `derivedPoints` output is unchanged.
- `apps/web/src/surfaces/ficha/conclusao-section.test.tsx` -- W2-4: a v13 sheet corrected from the cabine's ambient (e.g. a disjuntor, the ambient making a reading out only at 20 °C); tapping "Confirmar" of "Conclusão ajustada" writes the floor the corrected reading gives, and "Confirmar" of the text writes the basis composed under the visit context; each test fails when the confirm uses `NO_VISIT_CONTEXT` (mutation run, recorded).
- `relatorio/parecer.ts` -- W2-K1: group `prerequisite` after `reading` (reprovado by prerequisite and by no ratio or reading); authored "pré-requisito do ensaio não atendido" (the floor's existing word); basis keys only when non-empty, so every existing basis keeps its bytes.
- `print/section-9.ts` -- W2-K2: TEMPERATURA already prints in the instrument header row (Story 23.1's frame, e23v); the delta is the fit. A reading table carrying the corrected column is fitted with that column measured outside the 60 em budget (the approved "20 °C" column rides on v12's table), so the transformer's table prints at 8 pt; every other table fits as before. Update the 7,5 pt pin in `three-levels.test.ts` to 16 half points with the measure stated; report any DJ/SC size change.
- `seed/v13.ts` -- B-4: `tp` gains the TC's `criterion_table` (Table 100.5, `voltage: { field: 'tensao_nominal_at' }`, `medium: 'oil_rule'`); confirm `tipo_de_isolacao` (EPÓXI, Á SECO, ÓLEO MINERAL, required) is on the v13 TP and pin it; a "N/√3" AT judges by N. Update the file's comments (TP no longer open), `seed.test.ts` (`V13_HASH` and the v13-vs-v12 difference).
- `seed/schema.ts`, `seed/v13.ts`, `relatorio/restriction.ts`, `reading-evaluation.ts`, `reading-run.ts`, `conclusion.ts`, `points/derived.ts`, `types/validate.ts`, `types/draft-edit.ts` -- B-6: a new optional restriction key (e.g. `history_rise_out_pct`, in (0,100)) on the v13 disjuntor's and seccionadora's `resistencia_contato` (50, status PADRÃO FASOR or as the base row gives); a measured pole whose value, in the previous one's unit, is more than the share above the same cell's previous measured value (`visit.previous`, previous entry on seed v13 or later) becomes `out` with a reason naming the pole and the rise; the floor, the `reading` point, the conclusion clause and section 9's CONDIÇÕES follow the existing out chain. Applied before the restriction rules, so a pole both risen and deviating is out.
- `e2e/reading-wait.spec.ts` -- W2-G1: the test waits for the cycle to end before the 65 s jump (Design Notes); the product is not changed.
- e2e: B-4 spec (fill a v13 TP plate, helper + verdict on screen, the row's minimum in section 9 of the DOCX); B-6 spec (two relatórios of one obra, one disjuntor, the second pole > 50 % higher: section 9 verdict and the point Reprovado); W2-4 spec (both confirms tapped on the corrected sheet, the committed ops asserted); W2-2 spec or a case in `three-levels.spec.ts` (arrester NÃO with the test switched off: Reprovado and the point). New DOCX-issuing specs go in `SERIAL_SPECS`.
- Docs: `docs/kbs/architecture/kernel-and-seed.md` and `docs/kbs/log.md` lines; the AD-25 note in the spine (W2-1 order rule) under the existing dated e23v note.

**Acceptance Criteria:**
- Given relatório A issued over P, then B issued, when A is re-issued, then A's sheets read no previous visit (never B), and `last_results` keeps B on top with prior = A's re-issue.
- Given a v13 arrester with DESLIGADOR ÍNTEGRO NÃO and its insulation test switched off, when the sheet evaluates, then the floor is Reprovado, section 8 lists the prerequisite point, and the parecer names the sheet "por pré-requisito do ensaio não atendido".
- Given a stored `restricao` point whose test's rule still flags a row now out, when the Pontos screen renders, then it does not show "Origem resolvida".
- Given the v13 transformer insulation table with the 20 °C column, when section 9 is laid out, then it prints at 8 pt, and the v5/v11/v12 and Porto Seguro goldens are byte-equal.
- Given a v13 TP with TIPO DE ISOLAÇÃO and AT filled, when it evaluates, then TP-02 judges each row by Table 100.5 for that medium, and section 9 prints the row's minimum.
- Given two visits of one v13 disjuntor where pole A rose from 40 to 61 µΩ, when the second evaluates and prints, then pole A is out, the floor and section 9 read Reprovado, and the point names the pole and the rise.
- Given main with this batch, when 13.5-E2E-004 runs alone under the lock (`--repeat-each 5`), then it passes 5 of 5.

## Spec Change Log

## Review Triage Log

### 2026-11-09 — Review pass
- layers: Edge Case Hunter and Verification Gap (opus); Blind Hunter and Intent Alignment skipped (token economy; the integrated epic review covers them).
- verdicts: 12 findings — high 0, medium 3, low 5, false 4, maybe-false 0
- findings:
  - `[medium]` `[patch]` VG: the job's `firstIssuedAt` wiring and `firstIssuedAtOf` are unobserved (the one revision-2 case short-circuits on the `prior` branch) — integration case A, B over A, C over B, A rev 2 through `firstIssuedAtOf`: no put, C stays on top; unit case of the earliest `created_at`; both red with `firstIssuedAtOf` returning `issuedAt` (mutation run).
  - `[medium]` `[patch]` VG: no `textHalfPoints` pin on a corrected table after `withAppendedColumn` or `sideBySide` — size assertions added: the per-row transformer with MANUT. ANTERIOR pinned at 13 half points (red at 12 without the `withAppendedColumn` carry); DJ/SC side by side pinned at 9 pt, which stays green without the `sideBySide` carry because those tables fit at 9 pt either way (the carry has no seeded effect).
  - `[low]` `[reject]` ECH: corrected columns sit outside the budget with no upper bound — only the transformer steps (DJ/SC print at 9 pt); a cap is a new guard for a table no seed has.
  - `[low]` `[reject]` ECH: `readingFitWidthEm` widens the measure by the corrected column, so the word-whole check is the rule as built — the size pins (patch above) catch a regression; the real fit at 8 pt is a PDF check at the integrated QA (residual risk).
  - `[low]` `[reject]` ECH: a `PrintTable` copy outside `withCorrectedColumns` would lose the record — every copying site in `section-9.ts` carries it today; the size pins catch a future loss.
  - `[low]` `[patch]` ECH: a rise of 50,04 % printed "alta de 50 % … acima do limite de 50 %" — the shown rise is rounded up to one decimal (`Math.ceil(rise * 10 - EPSILON) / 10`); 40 to 60,016 µΩ reads "alta de 50,1 %".
  - `[medium]` `[defer]` ECH: the prerequisite fails the sheet with the nameplate sub-block off — a product choice (frontmatter `deferred`, ledger).
  - `[false]` `[reject]` ECH: `liveRevisions` empty on a revision > 1 makes `firstIssuedAt` now — `nextRevisionNumber(liveRevisions)` gives the number, so a revision > 1 always has a live earlier revision.
  - `[false]` `[reject]` ECH: `history_rise_out_pct` on a corrected test of a company copy compares raw values — the seed sets it on the contact tests only (never corrected) and the type editor has no control that writes a restriction key; a copy carries the seed's.
  - `[low]` `[patch]` ECH: 13.5-E2E-004's listeners are attached after the first syncs, so a request already in flight is not in `open` — the listener block moved before the sheet opens; `open` now tracks only `/api/sync/` and `/api/files/` requests and ignores beacons (a `sendBeacon` at pagehide never reports finished and held the quiet wait 3 of 3); alone `--repeat-each 3`, 3 of 3.
  - `[false]` `[reject]` ECH: the parecer basis changes for a prerequisite-only Reprovado — only v13 sheets carry a prerequisite and v13 is not deployed, so no confirmed basis exists to go stale; every v1 to v12 basis keeps its bytes (unit pins).
  - `[false]` `[reject]` ECH: no contract bump while v13 judging changes — v13 is undeployed (M-2, one deploy after wave 3), and wave 3's contracts 38 and 39 move MIN past 37 before any deploy; stated in the PR.

## Design Notes

- **W2-G1 bisect (orchestrator, 2026-11-09, logs in `.scratch-e23w/bisect-*.log`).** 13.5-E2E-004 alone under the lock, `--repeat-each`: `967d898a` (e23v merged) 6 of 6 green; `8c097ffa` (e23h merged) 1 of 2, then 4 of 4: red only intermittently, load 4.4 to 5.7. Not a 60 s regression: `apps/web/src/sync/engine.ts` `schedule` arms the next tick only when a cycle ends (`fireCycle().finally(schedule)`), so when the cycle fired by the `02:05` jump is still running (real time) at the `01:05` jump, its 60 s timer is armed after the jump on the page's naturally flowing clock and no pull comes within the 20 s poll. Fix the test: before `past` and the `01:05` jump, wait until the cycle the `02:05` jump fired has ended (its pull finished and the engine idle, through what the page shows or the request events), so the 60 s timer is armed; keep the assertion that one pull follows one 65 s jump. Run it `--repeat-each 5` under the lock; the mutation check is the old wait, which may stay green alone (say so).
- **W2-1 why chain-only on the read side.** `lastResultsSchema` holds two entries; once B was written over A the visit before A is gone. Taking none is the conservative reading ("never a later one"); a deeper chain needs a projection shape change (contract) and goes to the ledger with the two-later-visits case.
- **W2-K2 measure.** At 8 pt the table's longest words sum to 61,6 em (v12's table 58,9 em plus the 20 °C column, about 2,6 em with its margins) against the 60 em budget; measured without the corrected column it is 58,9 em, so 8 pt is the first step that fits. The rule stays e22g's for every other table.

## Verification

**Commands:**
- `podman compose --profile tools run --rm --user root tools pnpm lint` / `pnpm static` -- exit 0
- `podman compose --profile tools run --rm --user root tools pnpm test:unit -- packages/domain/src/relatorio packages/domain/src/points packages/domain/src/print packages/domain/src/seed apps/web/src/surfaces/ficha` -- green
- `podman compose restart api` then `... tools pnpm test:api` -- green, goldens unchanged
- `lockf -t 20000 /tmp/fasor-verify.lock podman compose --profile tools run --rm --user root tools pnpm exec tsx scripts/e2e.ts <new and edited specs> e2e/reading-wait.spec.ts --project desktop-chrome --project durability-desktop-chrome` -- green

## Auto Run Result

Status: done (orchestrator e23w, 2026-11-09).

- **Implemented.** W2-1 (first-issue order: `previousResultsFor` reads none when the top's `prior` is this relatório; `lastResults` refreshes a later top's `prior` or writes nothing on a re-issue under a later visit; `firstIssuedAtOf` in the issue job). W2-2 (`failedPrerequisites`, read by the floor, the points, the conclusion and the parecer whatever the test's switch or applicability). W2-3 (`TestEvaluation.restrictionStands`; `resolvedOriginPoints` reads it). W2-4 (unit and e2e of both confirms under the cabine's ambient, mutation run). W2-K1 (parecer group `prerequisite`). W2-K2 (the "20 °C" column outside the 60 em budget: the transformer table at 8 pt). B-4 (TP-02 by Table 100.5 and the medium; "N/√3" by N). B-6 (`history_rise_out_pct: 50` on the v13 contact tests, `EvaluatedCell.rise`). W2-G1 (test fix; product unchanged; bisect in Design Notes). `V13_HASH` re-pinned.
- **Files.** Kernel: `print/reading-slots.ts`, `print/last-results.ts`, `print/section-9.ts`, `relatorio/restriction.ts`, `reading-evaluation.ts`, `reading-cells.ts`, `reading-run.ts`, `conclusion.ts`, `parecer.ts`, `points/derived.ts`, `seed/schema.ts`, `seed/v13.ts`, `types/draft-edit.ts`; api `jobs/generate/job.ts`; tests (`relatorio/e23w-wave2-fixes.test.ts`, `last-results.test.ts`, `three-levels.test.ts`, `criteria-tables-print.test.ts`, `print-fit.test.ts`, `criteria-tables.test.ts`, `seed.test.ts`, `sync/three-levels.integration.test.ts`, `conclusao-section.test.tsx`); e2e (`contact-rise`, `tp-insulation-table`, `conclusion-visit-context` new; `three-levels`, `reading-wait`, `support/groups.ts`); docs (spine AD-25 note, KB concept and log).
- **Review.** 12 findings: 4 patched (2 medium, 2 low), 1 deferred (medium, decision), 7 rejected (3 low, 4 false), reasons in the triage log. Patched, not re-reviewed: the W2-1 integration case, the size pins, the rise rounding, the 13.5-E2E-004 listener scope.
- **Follow-up review recommended:** true by the rule (two medium patched); the named risk is the 8 pt fit, measured 61,6 em by the conservative measure and never checked by eye in a PDF.
- **Verification.** Implementer: lint 0, static 0, test:api 934 passed / 6 skipped, the domain and ficha units green, 17 e2e specs green after one own-test fix, 13.5-E2E-004 5 of 5 then 3 of 3 after the patch. The story gate's results are in the PR body and the epic context's e23w record.
- **Residual risks.** The 8 pt table needs a PDF look at the integrated QA; a re-issue after two later visits still reads the top (the chain holds two entries); the prerequisite fails a sheet whose nameplate sub-block is off (deferred decision).

