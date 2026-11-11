---
title: 'e24a: seed v14 opens, the v13 layout is locked, out of criterion gives Reprovado only, section 10 names the finding (Stories 24.2 to 24.4)'
type: 'feature'
created: '2026-11-11'
status: 'in-review'
baseline_revision: '8bddd986ca9c5187e11f415d3a64431dabe12658'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: max
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-24-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-e24f-retro-fixes.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_reason: 'Epic 24 wave 1 "conclusion lane" (epic-24-context.md § Batch plan): 24.2 opens the seed v14 gate the other two read, and 24.3 and 24.4 change the same conclusion and parecer kernel; one spec, one review, one gate, one PR. Effort: 24.2 high (phase A), 24.3 max and 24.4 high (phase B, run at max).'
deferred: []
---

<intent-contract>

## Intent

**Problem:** Bruno's answers of 2026-11-10 change how a ficha concludes (a reading out of its criterion gives Reprovado and nothing else; "Com restrições" is the technician's choice) and what section 10 says (it names the finding), but every relatório already issued must conclude and print exactly as before (decision 5), and Bruno's current layout is protected.

**Approach:** Phase A (Story 24.2, alone in the first commit): seed v14 = v13, an optional seed-level `rules` object read through one kernel reader, and a v13 layout lock pinning a synthetic v13 relatório that covers every delta. Phase B (Stories 24.3 and 24.4): each rule change sits behind a flag of the v14 `rules`, so v1 to v13 return today's bytes.

## Boundaries & Constraints

**Always:**
- The gate: a rule is reached by a flag of `findSeed(seed_version).rules`, never by a version-number comparison. A block reads its own `seed_version` (a company block carries its relatório's); the parecer and section 10 read `snapshot.relatorio.seed_version`. Without the flag every function returns exactly what it returns on main.
- Flags (all `z.literal(true).optional()` inside `rules`, `.strict()`): `conclusion_restriction_by_choice` and `prerequisite_needs_nameplate` (24.3); `parecer_names_finding`, `nc_clause_on_one_line`, `results_reference_across_runs` (24.4). Phase A adds the schema key and the reader only; v14 carries no `rules` at the opening (so v14 stringifies equal to v13); phase B sets the five flags in `seed/v14.ts` in a fenced section with a strip helper `withoutE24a` in `seed.test.ts` and re-pins `V14_HASH`.
- A ficha already concluded keeps its stored pair; nothing writes to a ficha not being edited (decision 3). The pair stays derived on read; the fold gains no rule.
- AD-1/AD-13: every verdict, text, list and "may this action show" answer is the kernel's; `apps/web` renders it and writes ops. New pt-BR copy goes in its AGENTS.md home; every pt-BR sentence authored here carries `// authored (e24a, listed for Bruno)` and is listed in the Auto Run Result.
- A test that asserts a v13 verdict or print is pinned to v13 by an addition (`seedVersion: 'v13'`, `seed_version: 'v13'`), never rewritten to v14 behaviour.
- Commands in this worktree only: `podman compose --profile tools run --rm --user root tools pnpm ...` (compose project `fasor-e24a`). Every unit, api or Playwright run under `nohup lockf -t 20000 /tmp/fasor-verify.lock sh -c '...'`, logged in `.scratch-e24a/`, polled in bounded loops of at most 55 s. `podman compose restart api` after a change under `packages/domain` or `apps/api`, before `test:api` or an e2e. Narrowest suite while iterating. Spec paths before `--project` with `scripts/e2e.ts`. English code, no emoji, no story ids as new inline comments beyond the repository's "Batch e24a (Story 24.N):" kernel convention.

**Never:**
- Never regenerate or edit a v5, v11 or v12 layout-lock golden or a Porto Seguro golden (`apps/api/src/jobs/generate/golden/layout-lock-{v5,v11,v12}/`, `golden/porto-seguro-skeleton.json`, `packages/domain/fixtures/porto-seguro/*.golden.json`): `git diff origin/main --name-status -- apps/api/src/jobs/generate/golden packages/domain/fixtures` shows additions only (plus the fixture source file `layout-lock/op-log.ts` and the v13 golden directory). If one would move, stop and report.
- After phase A's commit, the v13 goldens never move either.
- Never touch the main checkout or another compose project; never `docker`; never `down -v`; never build an image.
- Never edit `epics.md`, `epic-24-context.md`, the sprint change proposal or `sprint-status.yaml` (the orchestrator does the records). Never change the bullets, M-4 (`[ART]`), the NC sentence of the parecer, the counts or the verdict rule.
- No automatic point of any kind (fix batch e24h): nothing derives, lists or counts a point.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected |
|---|---|---|
| A-1 | `SEED_VERSIONS`, `SEED_VERSION` | v1..v14, `'v14'`; `V13_HASH` = `ff1737…30ff` as shipped; `equipmentTypesOf('v14')` = v13's; `JSON.stringify(v14 report seed) === JSON.stringify(v13's)` at the opening |
| A-2 | `seedRule(version, flag)` on v1..v13, an unknown version, v14 at opening | `false` every time |
| A-3 | a template upgraded by the server, a relatório created after | born on v14; an existing relatório keeps its seed |
| A-4 | a client on the previous contract syncs | 426 with the update notice |
| B-1 | v14 cable, insulation 300 MΩ vs > 400 MΩ, nothing else wrong | floor `{ reprovado, restriction: null }`, reasons `['reading']`; reason line "A ficha exige no mínimo Reprovado: leitura fora do critério."; Aprovado looser; `observationRequired` true; no restriction offered |
| B-2 | B-1 with OBSERVAÇÕES, "Concluir ficha" | one batch: result `reprovado`, a remove (put null) of any stored restriction, text, concluded; section 9 prints X on REPROVADO, SEM and COM RESTRIÇÕES both empty |
| B-3 | v14, every row C, readings within, text in OBSERVAÇÕES and in a C row's observation | floor Aprovado · Sem restrições, no reason, Sem enabled (H9 already; asserted on v14) |
| B-4 | v14 clean floor, technician picks Aprovado + Com restrições | OBSERVAÇÕES required; conclude writes Aprovado · Com restrições; boxes X APROVADO + COM; parecer Apto com restrições |
| B-5 | v14 one NC row, or one restricted reading, no failure | floor Aprovado · Com restrições, as on v13 |
| B-6 | v14 NC row + reading out | Reprovado, restriction null; the NC row still offers "Criar ponto de atenção" when it has no point |
| B-7 | v14 technician taps Reprovado over a clean floor (a stored Com restrições) | the same batch clears the stored restriction; no restriction group; tapping Aprovado again leaves the restriction missing (progress counts it) |
| B-8 | v14 concluded Aprovado · Com restrições, a reading then corrected out | ficha, Sumário, preview show Reprovado with no restriction; "Conclusão ajustada pela ficha"; its "Confirmar" writes `reprovado` and clears the stored restriction |
| B-9 | v14 reading out of its criterion | no "Marcar Com restrições" (kernel `markRestrictionOffered(block)` false); v13 same reading: offered |
| B-10 | v14 arrester, DESLIGADOR ÍNTEGRO NÃO, nameplate on / off | on: floor Reprovado; off: `failedPrerequisites` and `prerequisiteFailure` empty/null, so floor, conclusion text, parecer and `resolvedOriginPoints` ("Origem resolvida") ignore it; v13 arrester off: still read |
| B-11 | v14 relatório with one Reprovado ficha | parecer Não apto, ficha under `reprovado`, never `withRestriction` |
| B-12 | v13/v12/v5 fichas stored Reprovado · Com restrições and Aprovado · Com restrições by choice | every pair, reason line, count, box and text as before; goldens hold |
| C-1 | v14 DJ-01 contact 310 µΩ vs < 250 µΩ | parecer text "1 ficha foi reprovada: DJ-01, por resistência de contato máxima de 310 µΩ em Polo A (critério: <250 µΩ, aceitável na ficha)." (the clause `readingClause` gives, whatever its exact criterion words); box Não apto; third bullet absent; section 8 holds nothing for it |
| C-2 | two reprovadas, one by two failed tests, one by a failed ratio row | "2 fichas foram reprovadas: A, por x e y; B, por z." tree order, each once |
| C-3 | v14 reprovada by a contact rise | its finding names the rise (`readingClause`'s rise branch) |
| C-4 | v14 ficha reproved by the technician, nothing out; a defect Não ensaiado | TAG alone; the defect: "TAG, por <reason>" |
| C-5 | v14 NC observation "linha um\nlinha dois" | conclusion clause "linha um; linha dois (item N, NC)"; section 9 prints it in one paragraph |
| C-6 | v14 template Conclusão own text, runs `nos itens ` + bold `8 e 9` + `...`, results at 4 and 5 | bullet text and runs read "nos itens 4 e 5", no "8 e 9"; the replaced phrase takes the start run's marks |
| C-7 | v13 with the same fichas, observation and template text | text, basis, stale state byte-equal to main; v13 golden holds |

</intent-contract>

## Code Map

Paths under `packages/domain/src/` unless named.

- `seed/definitions.ts` -- `SEED_VERSION` `:64`, `SEED_VERSIONS` `:128`, `findSeed` `:195`, `equipmentTypesOf`. Add `seedRule(seedVersion, flag)` (or `seedRules`) here, exported from `index.ts`.
- `seed/schema.ts` -- `reportSeedSchema` `:999`: add `rules` (optional, strict object of optional `true` flags), with a doc comment like `recurring_findings`'.
- `seed/v13.ts` (741 lines, frozen) -- model for `seed/v14.ts`: `export const CABINE_PRIMARIA_V14 = CABINE_PRIMARIA_V13` at opening; phase B adds `rules`. Commit `027d916c` is how v13 opened (pins, layout lock, tests named).
- `seed/seed.test.ts` -- `V12_HASH` `:1939`, `V13_HASH` `:2155`, the v13 block `:2155-2190`; add a "24.2-UNIT" describe with `V14_HASH`, the pins of A-1/A-2, and in phase B `withoutE24a` + re-pin.
- Tests pinning the current seed: `merge/conflicts.test.ts:159`, `relatorio/section-position.test.ts:115`, `templates/from-relatorio.test.ts` (~278-286); naming v13: `reading/build.test.ts:86`, `seed/template.test.ts:50,58,85`; find the rest with `grep -rn "SEED_VERSION\|'v13'" packages apps e2e`.
- `fixtures/layout-lock/op-log.ts` (`../fixtures` of `packages/domain`) -- `LAYOUT_LOCK_VERSIONS` `:40`, `sheetWrites` `:109`, `templateOf` `:136`, `layoutLockFixture` `:165`. v13 extras in a `version === 'v13'` branch only (v5/v11/v12 ops byte-identical). Company type ops: copy the shape of `fixtures/company-types/op-log.ts`. `last_results`: path family `equipment/last_results` (`ops/path.ts:146,385`), schema `schemas/entities.ts:351-378`, examples in `print/last-results.test.ts`, `relatorio/seed-v13-e23b.test.ts`.
- `apps/api/src/jobs/generate/docx-layout-lock.test.ts`, `layout-lock.integration.test.ts` -- run over `LAYOUT_LOCK_VERSIONS`; rename the describe ids to "24.2-UNIT-LOCK"/"24.2-INT-LOCK" (keep "23.2" in the title too). Goldens dir `golden/layout-lock-v13/`.
- `contract/version.ts` `:489` (42), `:774` (MIN 42), comment paragraphs before each; `contract/contract.test.ts`; `grep -rln 'toBe(42)'` (`apps/api/src/sync/*.integration.test.ts`, `apps/api/src/db/cli-run.test.ts`, `reading/assess.test.ts`, `relatorio/e23z-final-fixes.test.ts`). Take 43 with MIN 43 (the orchestrator renumbers at merge if needed).
- `relatorio/conclusion.ts` -- `ConclusionPair` `:36`, `computeFloor` `:155-197`, `effectiveConclusionPair` `:220`, `chosenConclusionPair` `:239`, `conclusionAdjusted` `:264`, `isLooserThanFloor` `:273`, `conclusionFloorReasonText` `:301`, `conclusionSuggestion(Text)` `:316-326`, `observationRequired` `:347`, `ncClauseText` `:386`, `composeConclusion` `:528` (its `outClauses` `:557` is the findings list), `conclusionPairComplete` `:718`, `conclusionAdjustWrites` `:754`. Read `spec-e24f-retro-fixes.md` D1 before touching the paragraph (the basis must not move on v13).
- `relatorio/sheet-progress.ts` `conclusaoMissing` `:228-240`.
- `relatorio/restriction.ts` `prerequisiteFailure` `:240`, `failedPrerequisites` `:269` (widen their block `Pick` to carry `config` and `seed_version`); callers `reading-evaluation.ts:1066`, `conclusion.ts:173,552`, `parecer.ts:369`, `points/derived.ts:151`.
- `relatorio/parecer.ts` -- `reprovadoSentence` `:309`, `composeParecer` `:332` (byReason loop `:362-372`, basis `:430-470`). The band on screen uses the same function.
- `print/section-9.ts` `CONCLUSION_BOXES` `:219-224`, `conclusionParts` `:1333-1347` (boxes from `printedConclusionPair`); `apps/api/src/jobs/generate/sections/section-9.ts` `cellParagraphs`.
- `print/section-10.ts` `section10Layout` (`positioned` replaces per run); `templates/rich-text.ts` `RichRun`; `relatorio/section-variables.ts` `resultsItemsText` `:56`.
- Web: `apps/web/src/surfaces/ficha/conclusao-section.tsx` (`:214-260` effective/looser/required, `:269-303` writes, `:350-455` the restriction group), `use-ficha-actions.ts` `conclude` `:145-200`, `measurement-field.tsx` `:297`, `:421-425`, `measurement-test-section.tsx` `:563`, `:612-617`; copy `apps/web/src/copy/pt-br.ts` `ficha.conclusao` (~`:1681-1700`). The frame: `mockups/prototype/screens/60-ficha.html` `#ficha-conc-dj01` (`:1220-1232`): no Restrições group under Reprovado; OBSERVAÇÕES helper "Obrigatória em ficha reprovada" (`data-tone="red"`). Batch e24b edits `conclusao-section.tsx` beside this (the preview, Story 24.5): keep the edit small and separate.
- e2e: `e2e/support/relatorio-seed.ts` `newRelatorioDrafts(account, { seedVersion })` `:144`. Specs that assert a pair, a box, the parecer or "Marcar Com restrições" (pin to v13 where they assert the v13 rule): `grep -rln 'Reprovado\|REPROVADO\|com_restricoes\|Com restrições\|COM RESTRIÇÕES\|Não apto\|reprovada' e2e/*.ts` (about 30 files). Seed literal specs: `grep -rln "v13\|SEED_VERSION" e2e`. PDF text reading pattern: `apps/api/src/jobs/generate/v13-insulation-print.integration.test.ts`.
- Records: `_bmad-output/specs/spec-fasor/SPEC.md` Non-goals "A decision-maker" bullet (dated line), `_bmad-output/specs/spec-fasor/source-deltas.md` (the 2026-11-10 rows of 24.3 and 24.4: "planned" to built), `_bmad-output/planning-artifacts/architecture/architecture-fasor-2026-09-21/ARCHITECTURE-SPINE.md` AD-21 (dated note), `docs/kbs/architecture/kernel-and-seed.md`, `docs/kbs/log.md` -- written by the orchestrator after the build, not by the implementer.

## Tasks & Acceptance

**Phase A (Story 24.2, opus high) -- nothing of phase B:**
- `seed/schema.ts`, `seed/definitions.ts`, `index.ts` -- the `rules` key and `seedRule`; unit "24.2-UNIT" (A-1, A-2, a test seed object with `rules` set answers true).
- `seed/v14.ts` (new), `seed/definitions.ts` -- v14 = v13, `SEED_VERSION = 'v14'`, appended to `SEED_VERSIONS`; `seed.test.ts` pins `V14_HASH`, keeps `V13_HASH`.
- Every test that pins the current seed or the version list -- updated to v14 or pinned to v13 per the rule above.
- `fixtures/layout-lock/op-log.ts` -- `'v13'` in `LAYOUT_LOCK_VERSIONS`; v13-only additions per Story 24.2's DoR: one sheet of every v13 type (already by rule); conclude writes (result, restriction, `concluded_by` path as the conclude batch writes) for: a ficha Reprovado by a reading out (stored Reprovado · Com restrições, as the conclude writes today), a ficha stored Aprovado · Com restrições by choice with its observation, a ficha Aprovado · Sem restrições carrying an observation; an extra arrester (second para_raio) with DESLIGADOR ÍNTEGRO NÃO stored then its nameplate sub-block switched off (stored Reprovado · Com restrições); `last_results` (a previous visit) on the insulation, contact and winding-resistance tables with a contact rise out and an insulation drop restricted; an NC observation typed in two lines; a company-type sheet with a reading out of its criterion and a stored point whose text holds the recommendation (Story 23.11's form); the template's own Conclusão text with "8 e 9" bold inside "nos itens 8 e 9". Check v5/v11/v12 goldens still pass.
- `docx-layout-lock.test.ts`, `layout-lock.integration.test.ts` -- run over v13 too (the orchestrator generates the goldens with `GOLDEN_UPDATE=1 ... -t v13`; the implementer does not).
- A unit "24.2-UNIT-SAME": `layoutSpec` of the v13 fixture and of `layoutLockFixture('v14')` equal after normalizing ids, op ids, version strings and dates.
- `contract/version.ts` + pins + `apps/api/src/sync/*` "24.2-API-001": 426 for the previous contract through the sync route, and a v14 relatório created through it.
- `e2e/seed-v14.spec.ts` "24.2-E2E-001 @p0": a new relatório on v14 (assert `seed_version` in the store), one sheet of each of the eight types filled, DOCX generated; a v13 relatório beside it still generates. Base it on `e2e/seed-v12.spec.ts`.

**Phase B (Stories 24.3 and 24.4, opus max):**
- `seed/v14.ts`, `seed.test.ts` -- the five flags, fenced; `withoutE24a`; re-pin `V14_HASH`.
- `relatorio/conclusion.ts` -- under `conclusion_restriction_by_choice`: `ConclusionPair.restriction` widened to `ConclusionRestriction | null` (null only with Reprovado on a flagged seed); a failure or defect floors `{reprovado, null}`; effective/chosen/printed restriction null when the effective result is Reprovado; `conclusionPairComplete` true on Reprovado alone; `observationRequired` true under Com restrições or Reprovado (observations sub-block on); reason line and suggestion text without " · …" when the restriction is null ("Reprovado?"); `conclusionAdjusted`/`conclusionAdjustWrites` report a stored restriction to clear (add `clearRestriction: boolean`, false on v1-v13); new `markRestrictionOffered(block)`; new `resultChoiceWrites(block, value)` (or equivalent) saying a Reprovado tap also clears the stored restriction. Under `nc_clause_on_one_line`: `ncClauseText` joins lines with "; ". Export `findingClauses(block, definition, visit)` = `outClauses` (the same strings), used by the parecer.
- `relatorio/sheet-progress.ts` -- `conclusaoMissing` counts no restriction under Reprovado on a flagged seed, and the required observation under Reprovado.
- `relatorio/restriction.ts` -- under `prerequisite_needs_nameplate`, `prerequisiteFailure` is null while the nameplate sub-block is off.
- `relatorio/parecer.ts` -- under `parecer_names_finding` (the relatório's seed): the Reprovado sentence per C-1..C-4 (authored); the basis gains a key only on the flagged seed with a reprovada.
- `print/section-10.ts` -- under `results_reference_across_runs`: replace the fixed reference across joined runs (C-6).
- Web: `conclusao-section.tsx` (no restriction group under effective Reprovado on a flagged seed; required observation with the helper; Reprovado tap via the kernel writes), `use-ficha-actions.ts` (the conclude clears a stored restriction under Reprovado), `measurement-field.tsx`, `measurement-test-section.tsx` (action only when `markRestrictionOffered`), `copy/pt-br.ts`. Web unit tests beside each.
- Kernel "24.3-UNIT" and "24.4-UNIT" covering every I/O row B-* and C-* on a v14 seed and on v13; section 9 box print tests on v14 and v13; "24.3-API-001" the conclude batch through the sync route; "24.4-INT" the DOCX of a v14 relatório (section 10 box text and bullets).
- PDF: an api integration test that reads the generated PDF text of a v14 relatório: the Reprovado ficha's CONCLUSÃO row with both restriction boxes empty, and section 10 naming the finding (pattern of `v13-insulation-print.integration.test.ts`); it also writes the PDF to `test-results/e24a-pdf/` for the crops.
- `e2e/conclusion-v14.spec.ts` (24.3-E2E-001 @p0, -002 @p0, -003, -004, -005 per Story 24.3's DoD, each through the DOCX) and `e2e/parecer-names-finding.spec.ts` (24.4-E2E-001 @p0, -002), asserting the stored pair in the store too (E12-A6).
- Pin to v13 every unit, web and e2e test that asserts a v13 verdict, box, reason line or the action on the default seed.

**Acceptance Criteria:**
- Given phase A's commit, when the layout-lock tests run, then v5, v11, v12 and v13 goldens match and the Porto Seguro goldens match; given phase B, the same holds unchanged.
- Given the full Story 24.2, 24.3 and 24.4 acceptance criteria in `epics.md` (read with their dated notes), when their named tests run, then each passes.
- Given the story gate (lint, static, test:unit, test:api, the touched specs on `desktop-chrome` and `durability-desktop-chrome`) under the host lock, then it is green.

## Spec Change Log

## Review Triage Log

### 2026-11-11 — Review pass
- layers: Edge Case Hunter and Verification Gap Reviewer (opus); Blind Hunter and Intent Alignment skipped (token economy; the integrated epic review covers them). Diff: baseline `8bddd986` to `c0ea0f62` plus the working tree, golden files excluded.
- verdicts: 4 findings — high 0, medium 2, low 1, false 1, maybe-false 0
- findings:
  - `[medium]` `[patch]` (verification gap) The v14 parecer basis key `reprovadoFindings` had no test: removing it passed every test, so a confirmed parecer naming a value would not read stale after the value changed — a C-1 sibling in `e24a-conclusion-rules.test.ts` pins the basis change on v14, the `stale` state, and an unchanged v13 basis.
  - `[medium]` `[patch]` (edge case) `conclusaoMissing` on a v14 sheet with nothing stored and a Reprovado floor counted two missing (the chosen result null made `restrictionApplies` true) while the screen hides the restriction group — the effective result decides `restrictionApplies` when the chosen result is null; unit test v14 1 missing, v13 2.
  - `[low]` `[patch]` (edge case) `ncObservationOnOneLine` printed doubled punctuation for a line ending in ";" or "," ("linha um;; linha dois") — trailing ";" and "," stripped per line; unit test. Kept although low: the fix is a direct correction.
  - `[false]` `[reject]` (edge case, claim) `observationRequiredBy` ignores the observations sub-block — the only reader is `conclusao-section.tsx:439-441`, inside the observation field rendered only while the sub-block is on, and `conclusaoMissing` checks the sub-block itself; the same holds for the v1 to v13 `observationRequired` it replaced.

## Design Notes

- **Why widen `ConclusionPair.restriction`** rather than keep a hidden `sem_restricoes`: a Reprovado on v14 has no restriction at all, so `null` is the truth every reader (progress, boxes, Sumário) already handles for an unset half; typing it makes each consumer state its v14 behaviour. On v1 to v13 no function returns `null` where it returned a value.
- **Stored restriction under Reprovado** is ignored on read (B-7, B-8) and cleared only by a write the technician makes (conclude, a Reprovado tap, "Confirmar" of the adjusted note), never by a migration (decision 3).
- **Findings for section 10** come from the conclusion's own clauses (`findingClauses`), not from stored points (fix batch e24h: a finding is not a point).
- **The fixture** grows only on its v13 branch so the three locked goldens keep their bytes; the v13 golden is taken by the orchestrator on the phase A code, which carries no rule change.

## Verification

**Commands:**
- `podman compose --profile tools run --rm --user root tools pnpm lint` / `pnpm static` -- clean.
- `... pnpm exec vitest run packages/domain/src/seed packages/domain/src/relatorio packages/domain/src/print` -- green.
- `... pnpm test:api` (after `podman compose restart api`) -- green, layout-lock v5/v11/v12/v13 included.
- `... pnpm exec tsx scripts/e2e.ts e2e/seed-v14.spec.ts e2e/conclusion-v14.spec.ts e2e/parecer-names-finding.spec.ts <touched> --project desktop-chrome --project durability-desktop-chrome` -- green.
