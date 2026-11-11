---
title: 'e24p, print: the previous visit''s date in the table header, drops and rises as a note line, the recommendation under "Ação recomendada" with the create action on a reading (Stories 24.15 to 24.17)'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_revision: 'ea6676d2794b2859d5780b4d06bd155aef12e53e'
review_loop_iteration: 0
followup_review_recommended: true
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-24-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-e24a-conclusion-rules.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-e24h-points-on-click.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_reason: 'Epic 24 wave 3, the print half of the planned batch e24p (the company-types half merged as e24c): 24.15 and 24.16 change the same previous-visit print of section 9, and 24.17 the points and section 8 of the same seed-v14 print; one spec, one review, one gate, one PR.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** Bruno compares a reading with the last visit's without knowing that visit's date; the relatório shows nothing under a table whose readings dropped or rose since then; and after fix batch e24h (no automatic point) a failed test reaches section 8 only by a point typed by hand, its recommendation reaching no point at all (Bruno's question 23, decisions 6, 7, 9 and 12, pass finding F15).

**Approach:** Build Stories 24.15, 24.16 and 24.17 as `epics.md` § Epic 24 writes them (read each story whole: `### Story 24.15` :8590, `24.16` :8670, `24.17` :8732; a dated note wins over the text it amends, struck text no longer holds). Every v14 print and text change is reached through three new seed-level `rules` flags on v14 (`previous_visit_date`, `history_note`, `recommendation_as_action`), read by `seedRule`; the stored service date, the visit order, the "Anterior" helper's date and the create action apply on every seed. The kernel composes every text; the web renders and writes existing ops.

## Boundaries & Constraints

**Always:**
- v1 to v13 print byte-identical: `git diff origin/main --name-status -- apps/api/src/jobs/generate/golden packages/domain/fixtures` shows additions only; the v5, v11, v12, v13 layout-lock goldens and Porto Seguro goldens are never regenerated. The v13 lock fixture's `last_results` entries carry no `service_date`, and v13 reads no new flag.
- No point is created without a tap (fix batch e24h): the create action only opens the editor; nothing lists, counts or prints a finding with no stored point.
- AD-1/AD-13: kernel composes the finding text, the action, the helper, the note line, the dated header and the visit order; `apps/web` renders them. Strings in their AGENTS.md home; every new pt-BR sentence marked `// authored (e24p, listed for Bruno)`.
- New v14 data is a fenced section `withE24pRules` in `seed/v14.ts` (flags only), with `withoutE24p` in `seed.test.ts` and `V14_HASH` re-pinned; `24.2-UNIT-SAME` stays green with v14's flags read off.
- Tests use invented recommendations and invented data only (public repository).

**Never:**
- No version-number comparison for a new rule; no edit of `epics.md`, `epic-24-context.md` or the proposal; no v14 golden; no ACEITÁVEL line on a measurement table (e24c's narrowing, waiting for Matheus).
- No question when a reading goes back within its criterion (Story 24.17 does not ask for it; its point keeps the "Origem resolvida" flag and the card's "Remover ponto" of Story 24.7).
- No change to the table's cells, columns or type sizes on any seed (24.15, 24.16); no change to how a stored point prints on v1 to v13.

## I/O & Edge-Case Matrix

| Story | Input / State | Expected Output |
|---|---|---|
| 24.15 | issue of a relatório with `setup.service_end` 2026-03-14 (any seed) | each `last_results` entry it writes carries `service_date: '2026-03-14'` beside `issued_at`; `service_end` null → `service_start`; both null → no key |
| 24.15 | `visitDateOf(entry)` | `service_date`, else the issue instant's calendar day (America/Sao_Paulo); `visitDateText` prints dd/mm/aaaa, a month-only date mm/aaaa |
| 24.15 | B (service 2026-09) on top, A (service 2026-03) issued after | B stays top, `prior` = A (when B's prior is null or older than A; else nothing written); B's sheet reads A, a later C reads B |
| 24.15 | two visits with no `service_date`, and the e23w re-issue cases | `lastResults` output byte-equal to today's; dates compared only when at least one side carries `service_date`; a month and a day of that month compare equal (today's order) |
| 24.15 | v14 table with MANUT. ANTERIOR | header cell "MANUT. ANTERIOR\n14/03/2026" (second line the visit date); column weights and `textHalfPoints` equal to v13's for the same table (the date is never the longest word) |
| 24.15 | v14 history texts (insulation drop, contact rise, winding variation) | name the visit date (`previousVisitDateText`); v13 and older keep the issue date |
| 24.15 | "Anterior" helper, every seed | "(rev. N, ⟨visit date⟩)" |
| 24.16 | v14 table with ≥ 1 cell flagged by one of the three history rules | one paragraph after the test's other notes: "Em relação à manutenção anterior: ⟨onde⟩, ⟨motivo⟩; ⟨onde⟩, ⟨motivo⟩." in row order; kept with the table |
| 24.16 | v14 no flagged cell, no previous visit, or previous visit on v12 (not judged); any v1-v13 | no line |
| 24.17 | test that fails (reading out, ratio INSATISFATÓRIO, measurement cell out, IP out, choice out, failed prerequisite), any seed, no live point of that origin+test | "Criar ponto de atenção" under the test (the `.e24-point-place` of `60-ficha.html` `#ficha-dj01-rc-point`) |
| 24.17 | restricted test, no failure; Reprovado chosen with no failed test | the action under the restricted test; on the Conclusão step under the pair |
| 24.17 | live point with that origin, test and equipment | the place reads "Ponto de atenção N" (section 8 position), no action; removing the point brings it back |
| 24.17 | tap on v14 | editor opens: Texto = the finding alone, Ação recomendada = recommendation(s) joined, helper "Da recomendação do ensaio · editável" (one) / "Das recomendações dos ensaios · editável" (two or more); "Concluir" stores one point (`origin`, `test_key`, `equipment_id`) |
| 24.17 | tap on v1-v13 | Texto = recommendation first then the finding (Story 23.11, `recommendedPointText`), action empty, no helper |
| 24.17 | restricted test's point (any seed) | text = restricted rows with reasons; action empty |
| 24.17 | read-only sheet (Não ensaiado), or nothing failed/restricted/chosen | no action anywhere |
| 24.17 | v14 action plan row that fits a page | not split across pages (body rows `cantSplit`); v1-v13 unchanged |
| 24.17 | v14 point text "ver[[foto]]texto" | bullet and cell print "ver Imagem 1 texto"; removed photo the same; v13 prints as today |

</intent-contract>

## Code Map

Paths under `packages/domain/src/` unless named.

- `schemas/entities.ts:351-378` -- `lastResultsEntryShape`: add `service_date: dateValueSchema.optional()` (never defaulted). `print/reading-slots.ts:77` `withoutPrior` copies fields one by one: copy `service_date` when present.
- `print/last-results.ts` -- `lastResults` `:113` (own entry `:126`, e23w rules `:134-142`): write `service_date` from `snapshot.relatorio.setup.service_end ?? service_start`; add the date order (I/O rows 3-4) after the "E's prior is X" rule and before the e23w re-issue skip. `previousHelperText` `:162`: visit date. Add `visitDateOf`, `visitDateText`, `compareVisits`, `previousVisitDateText(entry, seedVersion)` (here or `print/visit-date.ts`, exported from `index.ts`). `format/datetime.ts` `formatCalendarDate`, `calendarDateOfInstant` (`:244`, takes a Date).
- `apps/api/src/jobs/generate/job.ts:510` -- calls `lastResults`; no change expected (the kernel reads the snapshot's setup). `ops/attribution.ts:81-83` lists instant pointers of the entry; `service_date` is a date, check its walk test.
- `print/section-9.ts` -- `PREVIOUS_HEADER` `:1086`, `withPreviousColumn` `:1097`, `withAppendedColumn` `:1106` (header string → parameter), `previousReadingsOf` `:1129` (return the entry too, for its date), `testParts` `:1139` (notes `:1174-1178`), `measurementTestPart` `:1261` (returns one table; gains the note paragraph, the table `keepWithNext`), `fittedColumns` `:859` (splits on `\s+`: "14/03/2026" narrower than "ANTERIOR", so the fit is unchanged; prove it by test on the four insulation shapes). The api renderer splits a cell on `\n` (`apps/api/src/jobs/generate/sections/section-9.ts:122`).
- History texts: `relatorio/restriction.ts` `historyFinding` `:66` (detail) and `applyHistoryRise` `:203` (reason `:222`); `RestrictionPrevious` `:85` built at `relatorio/reading-evaluation.ts:1035` (block known: add a `dateText`); `relatorio/measurement-evaluation.ts:941-972` (winding variation; `context` has the block). For 24.16 mark which restriction came from a history rule: add `history?: string` (the reason with both corrected values, as `pointReason` names it) on the cell's `restriction` in `restriction.ts:160-180` and `measurement-evaluation.ts` `markRestricted` `:700-720`; a risen cell has `cell.rise.reason`. The place of a cell: as the conclusion names it (`worstReadings` `where`, `measurementWhere`). Note text composer in the kernel (`print/` or `relatorio/`).
- Seed: `seed/schema.ts:1005` `seedRulesSchema` (add the three flags with doc comments), `seed/v14.ts` (`withE24pRules` fenced section), `seed/definitions.ts:214` `seedRule`; `seed/seed.test.ts:2190-2270` (`E24A_FLAGS`, `withoutE24a`, the "names the five flags" and "turns on ... nothing else" tests: extend for the e24p flags, add `withoutE24p`, re-pin `V14_HASH`).
- Points, 24.17: `points/derived.ts` `sheetEntries` `:119` (the `reading` `:177-191`, measurement `:194-208`, `restricao` `:221-249`, `reprovado` `:251-262` entries; split each into `finding` and `recommendations`, `text` = `recommendedPointText(recommendations, finding)` byte-equal), `reprovadoRecommendations` `:273`, `pointSource` `:338`, `entrySource` `:353`, `allDerivedPoints` `:284` (tree walk; the one-sheet path walks `treeNodes(locationTree(snapshot))` to the block's node only). `seed/test-help.ts:128` `recommendedPointText` (add the join of the recommendations alone). `points/checks.ts` `livePoints`, `ncRowPointsText` `:257`. New export, e.g. `sheetPointFindings(snapshot, block): { origin, testKey, place: 'test' | 'conclusao', text, action, actionHelper, positions }[]`: `place` 'test' when the test's section renders (`sheetTestSections` keys: sub-block on, evaluated or NA band) or it is a measurement test, else 'conclusao' (a failed prerequisite whose sub-block is off); `reprovado` always 'conclusao'.
- Web, 24.17: `apps/web/src/surfaces/points/create-point-action.tsx` (reuse), `points/point-editor.tsx` (`PointSeed` `:95` gains `action?` and `actionHelper?`; `action` state `:157`, `values` `:177` start from the seed; helper under the action field, `.helper` as the mock `#ficha-dlg-ponto-editor`), `ficha/ensaios-section.tsx` (`TestSection` `:312`, after the notes `:407-418`), `ficha/applicability-band.tsx:41` `NotApplicableTest`, `ficha/measurement-test-section.tsx:64` `MeasurementTests`, `ficha/conclusao-section.tsx` (under the pair), `ficha/sheet-read-only.tsx` `useSheetReadOnly` (no action when true), `ficha/ficha.css:220` (`.nc-point-ref`; add `.e24-point-place` from `60-ficha.html:359-363`, dated comment). Copy: the action word is `copy.points.createFromRow`.
- Section 8: `print/section-8.ts` `resolvePhotoTokens` `:83`, `resolveBulletPhotoTokens` `:117`, `resolveSection8` `:162`, `resolveActionPlan` `:195`, `section8Layout` `:209`, `LayoutSectionPoints` `:54` (add optional `keepRowsWhole?: true`); `apps/api/src/jobs/generate/sections/section-8.ts` `row` `:38` (`cantSplit` on body rows when set).
- Contract: `contract/version.ts:525` (45 → 46), `:833` (MIN 45 → 46), a paragraph before each in the file's style; `contract/contract.test.ts`; `grep -rln 'toBe(45)' apps packages`.
- Fixtures and print tests: `packages/domain/fixtures/layout-lock/op-log.ts` (v13 and v14 already carry a previous visit with a contact rise out, an insulation drop restricted, and a stored point holding a recommendation; do not change a v5/v11/v12/v13 op), `apps/api/src/jobs/generate/e24a-v14-print.integration.test.ts` (the pattern: v14 twin's DOCX and PDF text, PDF to `test-results/`), `apps/api/src/jobs/generate/docx-layout-lock.test.ts` (`24.2-UNIT-SAME`).
- e2e: `e2e/previous-visit.spec.ts`, `e2e/previous-visit-judges.spec.ts` (pin to v13 with `newRelatorioDrafts(account, { seedVersion: 'v13' })`, `e2e/support/relatorio-seed.ts:144`; adjust the helper's date where asserted), `e2e/test-recommendation.spec.ts` (pin to v13), `e2e/action-plan.spec.ts`, `points*.spec.ts`, `point-question.spec.ts`, `e2e/support/groups.ts` (new issuing specs in the `queue` lane of `SERIAL_SPECS`).

## Tasks & Acceptance

Two implementation parts, in order, each ending with lint, static, its unit tests and its e2e specs green under the host lock, and a WIP commit.

**Part A, Stories 24.15 and 24.16:**
- entry schema + `withoutPrior` + `lastResults` + the visit-date functions + helper -- `24.15-UNIT` in `print/last-results.test.ts` (or `print/visit-date.test.ts`): the visit date over the three cases; every order of two and three visits with and without service dates, the e23w cases unchanged; `previousHeaderText`; `fittedColumns` of the four insulation shapes on v14 equal to v13's with every word whole (`wordsWiderThanColumns` empty).
- `seed/schema.ts`, `seed/v14.ts`, `seed/seed.test.ts` -- the three flags, `withoutE24p`, `V14_HASH`.
- section 9 dated header (v14) and the history texts' date (v14) -- unit tests on v14 and v13.
- the history marker on restricted cells, the note composer, the note paragraphs in `testParts` and `measurementTestPart` -- `24.16-UNIT`: each rule, several rows, a table with none, a previous visit on v12, a limit note and a flagged row (limit first, both kept with the table), the measurement slot.
- contract 46/46 -- `contract.test.ts`, every `toBe(45)`, `24.15-API-001` (an api integration test through the sync route: a client on 45 refused, an equipment row with `service_date` pulled on 46).
- `24.15-INT` (issue job projection: the entry keeps the service date; a cross-tenant check) and `24.16-INT` + `24.15` print (`apps/api/src/jobs/generate/e24p-v14-print.integration.test.ts`: the v14 twin's DOCX parts and PDF text: dated header, note lines; a v14 variant with a `service_date` entry and a month-only one).
- e2e: `e2e/previous-visit-date.spec.ts` (24.15-E2E-001 @p0: two relatórios of one obra, the header's date read in the second one's DOCX and the helper on its sheet; 24.15-E2E-002: the older visit issued late), `e2e/previous-visit-note.spec.ts` (24.16-E2E-001 @p0: a contact rise and an insulation drop, the lines in the second DOCX); pin `previous-visit.spec.ts` and `previous-visit-judges.spec.ts` to v13.

**Part B, Story 24.17:**
- `points/derived.ts` refactor + `sheetPointFindings` + the recommendations join -- `24.17-UNIT` (`points/test-point-findings.test.ts`): per finding kind (a reading out, a ratio row, a measurement cell, an IP, a choice, a prerequisite with the test on and with its sub-block off, a restricted test, a chosen Reprovado) on v14 and on v13: text, action, helper, origin, key, place; offered and not offered; the one-point rule (and removal brings it back); the existing derived texts byte-equal (`hasPointSource`, `resolvedOriginPoints` unchanged).
- section 8 on v14: `keepRowsWhole`, the spaced references (before and after, bullet and cell, a removed photo) with v13's output pinned -- unit tests in `print/section-8.test.ts`; the renderer's `cantSplit` in its test.
- web: the place under a seeded test, a measurement test, an NA band (failed prerequisite), the Conclusão step; the editor's seeded action and helper -- web unit tests (the three places, the state once the point exists, a read-only sheet).
- `24.17-INT` in `e24p-v14-print.integration.test.ts`: section 8's table and bullet of a v14 point written from a test, and a PDF whose long row starts the next page whole.
- e2e: `e2e/recommendation-action.spec.ts` (24.17-E2E-001 @p0: a company type with an invented recommendation, a reading out of its criterion, nothing on the Pontos screen, the tap, the editor's two fields, Concluir, the stored point in the outbox/store, the DOCX section 8; 24.17-E2E-002: the restricted reading and the chosen Reprovado); pin `e2e/test-recommendation.spec.ts` to v13.

**Acceptance Criteria** (the stories' own, summarized; the I/O matrix covers the rest):
- Given a relatório whose service ended 2026-03-14, issued 2026-04-02, when it is issued, then each `last_results` entry keeps 2026-03-14 beside `issued_at`.
- Given a v14 relatório whose previous visit is that one, when its DOCX is generated, then every MANUT. ANTERIOR header prints "14/03/2026" under the title and the rest of each table is as on v13; a pre-story entry prints its issue date; a month-only service date prints mm/aaaa.
- Given a v14 breaker whose pole rose from 40 to 61 µΩ and a v14 transformer whose corrected insulation fell by more than half, when the DOCX is generated, then one line under each table names the cell, the reason and the values, and the conclusion names the same rise.
- Given a v14 company-type sheet with a reading out carrying an invented recommendation, when the technician taps "Criar ponto de atenção" and "Concluir", then one point of origin `reading` is stored with the finding as text and the recommendation as action, the place names it, and section 8 prints the action under "Ação recomendada" and the bullet finding then action.
- Given a v13 relatório with the same sheet, when the technician taps the action, then the point starts with the recommendation then the finding in its text and an empty action; the layout-lock goldens hold.

## Design Notes

- **D1, three flags, one per story.** `previous_visit_date` (the dated header and the dated history texts), `history_note` (the note line), `recommendation_as_action` (the seeded action, `keepRowsWhole`, the spaced references). The stored service date, the visit order, the helper's date and the create action are every seed (the stories say so), so they read no flag.
- **D2, the note's words.** The story fixes the form and says the line "uses the kernel's reasons as they stand"; the approved frame's sample ("subiu 53 % (40 µΩ)") is shorter. Built as the story says: ⟨motivo⟩ is the reason a point names (drop and variation: the reason with both corrected values, `pointReason`'s history part; rise: `rise.reason`, its date the visit date on v14). Listed for Bruno and Matheus.
- **D3, the header.** A second line in the header cell, so the column weights and the type size stay v13's for every shape (the longest word stays "ANTERIOR"). Proven by a unit test over every table shape that prints MANUT. ANTERIOR on v14.
- **D4, the order.** Dates decide only when at least one of the two entries carries `service_date`, so data from before the story orders as today (the coordinator's reading: an older visit is compared by its issue date).
- **D5, a reading back within its criterion.** Story 24.17 does not say the row asks about its point, so nothing asks: the point gets "Origem resolvida" and the card's "Remover ponto" (Story 24.7). Recorded for Matheus.
- **D6, a failed prerequisite with its test's sub-block off** has no test section to hold the action: it sits on the Conclusão step's place (the smallest reading that keeps "one action per test").
- **D7, contract.** 46 with MIN 46: the entry's new key is part of a synced row (as e24b's `reuse_key` took 43); a bundle on 45 would show the issue date in the helper.

## Verification

**Commands** (in the e24p stack; tools container with `--user root`; every Playwright run under `lockf -t 20000 /tmp/fasor-verify.lock`):
- `pnpm lint`, `pnpm static` -- clean.
- `pnpm exec vitest run packages/domain/src/print packages/domain/src/points packages/domain/src/seed packages/domain/src/relatorio` -- green.
- `podman compose restart api` then `pnpm test:api` -- green; layout-lock v5/v11/v12/v13 byte-equal.
- `pnpm exec tsx scripts/e2e.ts <new and touched specs> --project desktop-chrome --project durability-desktop-chrome` -- green.

## Spec Change Log

No bad_spec loopback.

## Review Triage Log

### 2026-11-11 — Review pass
- layers: Edge Case Hunter and Verification Gap Reviewer (model opus); Blind Hunter and Intent Alignment skipped (token economy; the integrated epic review covers them).
- verdicts: 5 findings — high 0, medium 2, low 2, false 0, maybe-false 0 (one claim row grouped with its finding: same root cause)
- findings:
  - `[low]` `[reject]` the v14 seeded action joins several recommendations and can exceed the action's 1000-character cap, so the create is refused until shortened — real but needs several long recommendations on one sheet (not seen in the base); the editor shows the count over the cap and the refusal toast; the fix (truncate or fall back) adds a branch. Recorded in `deferred-work.md` (e24p).
  - `[low]` `[reject]` a re-issue whose service dates were edited after its first issue is not re-ordered against its prior (self re-issue, and the e23w "E's prior is X" path) — reached only by editing an issued relatório's dates and issuing again; the fix adds branches to both paths. Recorded in `deferred-work.md` (e24p).
  - `[medium]` `[patch]` a reading out of its criterion that the insulation-drop or winding-variation rule also flags carries no history marker, so the v14 note leaves it out although the rule flagged it — patched (`87d6a58d`): an optional history field on the evaluated cell, read only by the note's collectors; 24.16-UNIT cases for both rules on v14 and none on v13.
  - `[medium]` `[patch]` (claim, grouped with the row above) the note's header comment says it names what the three rules flag while out cells were missed — fixed by the same patch.
  - `[medium]` `[patch]` no test asserts the focus after "Concluir" on the new place (to the point's name) — patched: `toBeFocused` on `.nc-point-ref` after the create in 24.17-E2E-001 and after the Conclusão-step create in 24.17-E2E-002.

## Auto Run Result

Status: done. Branch `e24p-print`, on main `ea6676d2` (unchanged at the PR).

**Summary.**
- Story 24.15 (`a2bce7f3`): `last_results` entries keep `service_date` (every seed); `lastResults` orders visits by `compareVisits` (row 3087); the helper names the visit's date (every seed); on v14 (`previous_visit_date`) MANUT. ANTERIOR carries the date on a second line and the three history texts name it. Contract 46, minimum 46.
- Story 24.16 (`a2bce7f3`, `87d6a58d`): on v14 (`history_note`) one note line under a table names each cell a previous-visit rule flagged, an out one included (`historyOut`), the measurement test given the slot.
- Story 24.17 (`d58825b0`, `cfd7f27a`): `sheetPointFindings` and `ficha/point-place.tsx`: "Criar ponto de atenção" under a failed or restricted test (the NA band for a failed prerequisite) and on the Conclusão step, every seed, one per test; on v14 (`recommendation_as_action`) the finding in the text and the recommendations in the action with the frame's helper, action-plan rows kept whole, glued references spaced (row 3191).

**Files (main ones).** Kernel: `print/visit-date.ts` (new), `print/history-note.ts` (new), `print/last-results.ts`, `print/reading-slots.ts`, `print/section-9.ts`, `print/section-8.ts`, `points/derived.ts`, `seed/test-help.ts`, `relatorio/restriction.ts`, `relatorio/measurement-evaluation.ts`, `relatorio/reading-cells.ts`, `schemas/entities.ts`, `seed/schema.ts`, `seed/v14.ts` (`withE24pRules`), `seed/seed.test.ts` (`withoutE24p`, `V14_HASH`), `contract/version.ts`. Api: `jobs/generate/sections/section-8.ts` (`cantSplit`), `e24p-v14-print.integration.test.ts`. Web: `ficha/point-place.tsx` (new), `ensaios-section.tsx`, `measurement-test-section.tsx`, `conclusao-section.tsx`, `ficha-surface.tsx`, `ficha.css`, `points/point-editor.tsx`. e2e: `previous-visit-date.spec.ts`, `previous-visit-note.spec.ts`, `recommendation-action.spec.ts` (new); `previous-visit*.spec.ts` and `test-recommendation.spec.ts` pinned to v13; `equipment-history.spec.ts`, `tag-suggestion.spec.ts` (the helper's date).

**Review.** One pass, two layers, 5 findings: 2 medium patched (`87d6a58d` the out reading in the note, with boundary tests on v14 and v13; `cfd7f27a` the focus assertions), 1 claim grouped with the first, 2 low rejected and written to the ledger (an over-cap joined action; a re-issue with edited dates). Patched counts: high 0, medium 2, low 0. Follow-up review recommended: true, because the `historyOut` field the review patch added to the evaluated cells was not re-reviewed (no other reader is expected to read it; the integrated review reads the patched list).

**Verification.** Story gate on `a2d631c8` (code of `cfd7f27a`): lint 0 errors (26 old warnings), static clean, test:api 983 passed / 6 skipped (layout-lock v5, v11, v12, v13 byte-equal), test:unit 6415 of 6415, 23 touched specs on desktop-chrome and durability-desktop-chrome 102 of 102 (parallel 40, queue 57, solo 5). Load `{ 9.82 10.43 7.68 }` at the start, `{ 5.58 6.54 7.28 }` at the end; lock wait about 6 min (batch e24s's test:unit ahead); e24s's stack up beside. No matrix run: no op fold, commit path or live query on the ficha changed (the ficha reads a kernel function over the snapshot it already holds). No golden or fixture file changed. PDF crops in `e24p-pdf-crops/`.

**Residual risks.** The `deferred-work.md` section "Epic 24 batch e24p": an open relatório reads a later visit before its issue; a re-issue with edited dates; an over-cap joined action; the note's wording (D2) and its wrap between a value and its unit; "GUARD" broken in the seccionadora's side-by-side tables (pre-existing on v13); D5 and the coordinator's readings for Matheus. Contract 46 is also claimed by batch e24s's branch: the second to merge takes 47.
