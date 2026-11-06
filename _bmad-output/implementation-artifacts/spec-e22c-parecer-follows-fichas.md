---
title: 'e22c: Stories 22.4 to 22.6, the conclusion, the points and the parecer follow the fichas (contract 31)'
type: 'feature'
created: '2026-11-06'
status: 'in-progress'
baseline_revision: '186caceed5856f0dd6bb657d5841e27678ffcd80'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-22-context.md'
warnings: ['batched', 'oversized', 'multiple-goals']
batched_reason: 'Stories 22.5 and 22.6 read the effective conclusion pair Story 22.4 introduces; one kernel rule, one contract bump (31), one gate.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** A ficha can print Aprovado · Sem restrições over an NC, an observation or a failed test; NCs and failed tests reach PONTOS DE ATENÇÃO only by hand; the relatório's CONCLUSÃO verdict is tapped and its summary is free text, so section 10 can contradict the fichas (Bruno, 2026-11-06, item 26; Matheus "Seguir o Bruno inteiro").

**Approach:** The kernel derives a conclusion floor per sheet and an effective pair (stricter of floor and stored), then derives section 8 entries for every NC row, failed test and Reprovado sheet, and a relatório verdict from the effective pairs (stricter only), with the summary always kernel-composed. Every reader (ficha, Sumário, Pontos, Etapa 6, print, pre-issue, counts) reads the kernel's effective values (AD-1, AD-13). Contract 31, minimum 31.

## Boundaries & Constraints

**Always:**
- Every rule lives in `packages/domain`; `apps/web` only renders kernel values and writes existing op shapes. Kernel rules are seed-independent (a v5 relatório gets the floor, the derived points and the derived verdict); only the `defect` reason flag is read from the seed.
- Stricter-only, per dimension: result `reprovado` > `aprovado` > unset; restriction `com_restricoes` > `sem_restricoes` > unset; verdict `nao_apto` > `apto_com_restricoes` > `apto`.
- Coordinator constraint (Matheus, 2026-11-06): change the generated relatório as little as possible. Section 8 keeps its layout and order (manual points first, then derived entries in tree order, printed like today's Não ensaiado bullets and action-plan rows). Section 10 keeps its structure (Parecer box, summary, fixed bullets, validity, signature); only the verdict source, the summary clauses, the third bullet's condition and the section reference change. Never touch photo grouping, photo numbering or section 7/9 photo blocks. Any Porto Seguro golden diff is justified in the PR body or reverted.
- New pt-BR strings follow AGENTS.md's three homes; every authored string carries `// authored (Story 22.x, open for Bruno)`, and the PR lists them.
- `print/section-9.ts` is owned by batch e22p this wave: touch only `conclusionParts` (the CONCLUSÃO boxes read the effective pair). Keep edits in `contract/version.ts`, `copy/pt-br.ts`, `deferred-work.md` (own heading `## Deferred from: e22c (2026-11-06)`) append-only to ease the merge.

**Never:**
- No seed v12 and no new seed version; the `defect` flag is an optional field of `notTestedReasonSchema` that no shipped seed sets (shipped hashes unchanged), exercised by a test seed.
- No new op family for the conclusion (Concluir writes the existing `conclusion/result` and `/restriction` puts). No change to photo captions, numbering or section 7.
- Do not edit `sprint-status.yaml` or `epics.md`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Clean sheet | all rows C, readings in criterion, pair unset | floor Aprovado·Sem; Concluir writes result+restriction with `concluded_by` | none |
| NC or observation | one NC row, or sheet obs / a row obs holds text | floor Aprovado·Com; Sem disabled + reason line; Reprovado selectable; observation still required for Com | Concluir jumps to the empty observation |
| Out reading | insulation 300 MΩ vs > 400, contact out, ratio INSATISFATÓRIO, or measurement cell out | floor Reprovado·Com; Aprovado and Sem disabled | none |
| Defect Não ensaiado | `not_tested.reason` whose seed reason has `defect: true` (test seed) | effective Reprovado·Com; counted Reprovado by parecer; still its Não ensaiado derived entry | none |
| Group missing / to-check / unjudged | v11 ratio waiting for group, zero/negative to-check cell, measured with no criterion | no Sem floor (null) unless a restriction or failure applies | pair stays required |
| Later correction | stored Aprovado·Sem, a reading then edited out | effective Reprovado·Com everywhere; ficha shows "Conclusão ajustada pela ficha" with Confirmar writing the effective pair | none |
| NC entry edit | derived NC entry → "Editar" | point `origin:'nc'`, `item_key`, equipment/location id replaces it; removing it restores the entry | api refuses an unknown origin from a < 31 client by the min contract |
| Old manual NC point | `origin:'manual'` point on same equipment/local as an NC entry | both show "Possível duplicado" on Pontos | none |
| Source resolved | `origin:'nc'` point whose row went back to C | entry gone; point stays, flagged "Origem resolvida" | none |
| Parecer | one effective Reprovado | verdict Não apto; Apto, Apto com restrições disabled; third bullet omitted | none |
| Old typed summary | `text_status:'edited'` | composed summary prints, then "Observações do responsável" paragraph with the typed text; can be cleared, not added | none |

</intent-contract>

## Code Map

- `packages/domain/src/relatorio/conclusion.ts` -- `suggestConclusionPair` (l.80) becomes `conclusionFloor(block)`; `restrictionWarning` (l.129) replaced by the adjusted note; `composeConclusion` (l.284-286 `recommend`, l.307 basis) and `conclusionPairComplete`/`conclusionTextForPrint`/`conclusionTextOnConclude` must read the effective pair (they take `Pick<'sheet'>` today; widen to `BlockRow`). Reuse `ncItems`, `evaluateSheetReadings`, `failedRatioRows`, `measurementCells`.
- `packages/domain/src/relatorio/sheet-progress.ts` l.213-222 `conclusaoMissing` -- count missing from the effective pair (a floor fills an unset pair), observation required when the effective restriction is Com.
- `packages/domain/src/seed/schema.ts` l.421 `notTestedReasonSchema` -- optional `defect: z.boolean().optional()`.
- `packages/domain/src/relatorio/parecer.ts` -- `restricted()` l.92, `suggestParecer` l.135, `parecerHintText` l.152, `parecerCounts` l.188, `composeParecer` l.221, `parecerTextForPrint` l.312, `parecerWithText` l.342: derived verdict, effective verdict, reason text, new clauses (Reprovado sheets, out readings), own-text ("Observações do responsável").
- `packages/domain/src/points/derived.ts` -- `DerivedPoint` gains `kind: 'not_tested'|'nc'|'reading'|'reprovado'` plus `text` and source keys; suppression by `origin`+source; tree order incl. locals (site NC rows, `relatorio/site-checklist.ts` `siteResultOf`/`siteObservationOf`, `sitePointTitle` l.336). `groupDerivedPoints` groups only consecutive `not_tested`.
- `packages/domain/src/schemas/entities.ts` l.602 `pointRowSchema` -- `origin` enum adds `nc`, `reading`, `reprovado`; optional `item_key`, `test_key` (absent = none, same bytes for old rows, like `location_id`). `ops/path.ts` l.78 `POINT_FIELDS` derives from the schema; check `points/checks.ts` `newPointRow`, `hasNotTestedPoint`.
- `packages/domain/src/points/summary.ts` (`sectionEightEntries`, `pointsSummary` "N automáticos", `naoEnsaiadas` must count only `not_tested` derived), `print/section-8.ts` l.156-234 (`derivedGroupText`, action-plan rows: one bullet/row per non-not_tested entry).
- `packages/domain/src/relatorio/pre-issue.ts` -- retire `site_checklist_nc_without_point` (l.463-466) and `parecer_missing` (l.471-472; derived verdict always exists); keep the kinds in the union only if other code needs them, else remove with their texts. `conclusion_stale`/`conclusion_unconfirmed` read the effective pair.
- `packages/domain/src/print/section-10.ts` -- `parecer.title` = effective verdict label, `parecer.text` = composed text, new `parecer.ownText`; bullets: drop the third (identified by its seed prefix "Apesar dos resultados dos testes serem positivos") under Não apto; replace the literal "nos itens 8 e 9" by `resultsItemsText` (`relatorio/section-variables.ts` l.56) in section 10 paragraphs (v1-v7 seed text and a template's own text). `apps/api/src/jobs/generate/sections/section-10.ts` renders `ownText` as one more paragraph in the box, "Observações do responsável: …".
- `packages/domain/src/print/section-9.ts` l.783-788 `conclusionParts` -- X marks from the effective pair. Nothing else in this file.
- `packages/domain/src/contract/version.ts` l.291, l.462 -- 31/31 with a paragraph each; `contract/contract.test.ts` l.103-104.
- `apps/web/src/surfaces/ficha/conclusao-section.tsx` -- radiogroups (`ConclusionPair` l.61) show the effective value, disable looser segments (React Aria `isDisabled`), one reason line; suggestion row from the floor while the pair is unset; adjusted note + Confirmar replaces the warning (l.185, l.375).
- `apps/web/src/surfaces/ficha/use-ficha-actions.ts` l.137-170 `conclude` -- on the fresh block add `conclusionOp` result/restriction puts when stored ≠ effective, before the text ops (text composed from the effective pair).
- `apps/web/src/surfaces/ficha/checklist-section.tsx` l.328 -- NC row "Criar ponto" writes `origin:'nc'` with `item_key`; site NC equivalent in the Verificações do local surface (grep `pointSeed`).
- `apps/web/src/surfaces/points/points-surface.tsx` -- render every derived kind as today's derived card (`derivedPointReasonText` l.391 generalised by a kernel text), "Editar" on a derived entry opens the point editor seeded with its text and origin/source, flags "Possível duplicado" and "Origem resolvida".
- `apps/web/src/surfaces/relatorio/setup/etapa6-parecer.tsx` -- verdict segments show the effective verdict, disable looser ones with the reason; summary read-only composed text; Confirmar/Editar/Substituir removed; an existing own text shown under "Observações do responsável" with a clear action (writes `parecerWithText`-like value with text null, status null).
- `apps/api/src/sync/` -- 20.9 caps cover `item_key`/`test_key` (strings); 20.10 target rule unchanged (ids only). Integration test through the sync route for a point create with `origin:'nc'`.
- `e2e/ficha.spec.ts`, `e2e/points.spec.ts`, `e2e/parecer-export.spec.ts`, `e2e/ratio-feeds-conclusion.spec.ts`, `e2e/support/relatorio-flow.ts` -- extend; every spec from `grep -rlE "Sem restrições|Com restrições|Reprovado|Apto com|Não apto|parecer|PONTOS DE ATENÇÃO|automátic|Criar ponto|CONCLUSÃO" e2e` runs in the gate.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/seed/schema.ts` -- optional `defect` on a not-tested reason; a helper `isDefectReason(seedVersion, key)` beside the seed lookup -- Story 22.4 floor source; v12 owns the real reason.
- `packages/domain/src/relatorio/conclusion.ts` -- `conclusionFloor(block): { pair, reasons } | null`, `effectiveConclusionPair(block)` (per-dimension stricter of floor and stored; null dimension when both null), `conclusionAdjusted(block)` (stored pair complete and looser than effective), `conclusionFloorReasonText(block)` (one authored line naming the sources), `isLooserThanFloor(block, value)` for the segments; rewire `composeConclusion`, `conclusionPairComplete`, `conclusionTextForPrint`, `conclusionTextOnConclude`; remove `suggestConclusionPair`/`restrictionWarning` (update `measurement-evaluation.ts`, `reading-cells.ts` callers) -- Story 22.4.
- `packages/domain/src/relatorio/sheet-progress.ts` -- effective pair in `conclusaoMissing` -- Concluir with a floor needs no tap.
- `packages/domain/src/relatorio/parecer.ts` -- `derivedParecer(snapshot)`, `effectiveParecer(snapshot)`, `parecerLooser(snapshot, verdict)`, `parecerReasonText`, counts from effective pairs (Reprovado list, out-reading list), `composeParecer` clauses for Reprovado sheets and out readings, `parecerOwnText(snapshot)` (stored text when `text_status === 'edited'`), `parecerWithoutOwnText` -- Story 22.6.
- `packages/domain/src/points/derived.ts`, `summary.ts`, `checks.ts`, `schemas/entities.ts`, `print/section-8.ts` -- the three new kinds, suppression, duplicate and resolved flags (`possibleDuplicatePoints`, `resolvedOriginPoints`), section 8 bullets and action-plan rows -- Story 22.5.
- `packages/domain/src/relatorio/pre-issue.ts` -- retire the two rows -- Stories 22.5, 22.6.
- `packages/domain/src/print/section-10.ts`, `print/section-9.ts` (`conclusionParts` only), `apps/api/src/jobs/generate/sections/section-10.ts` -- print rules -- Stories 22.4, 22.6.
- `packages/domain/src/contract/version.ts` -- 31/31; one paragraph per constant naming 22.4 to 22.6 and why old clients stop (new point origins fail their `pointRowSchema`, a 30 client shows a looser pair) -- contract.
- `apps/web/...` (four surfaces above, `copy/pt-br.ts` static words only) -- UI per Code Map.
- Tests: kernel `conclusion.test.ts` (each floor source on v5 and v11 blocks, the defect reason through a test seed, group missing, effective pair, adjusted), `sheet-progress` (Concluir with floor), `apply-op`/fold test for the Concluir batch, `points.test.ts` (each kind, order, suppression, restore on removal, duplicate, resolved), `parecer.test.ts` (derived verdict, stricter-only, clauses, own text), `section-8.test.ts`, `section-10` print tests (third bullet, position reference on a compact template and on v5), `docx-section-10.test.ts`; api sync integration for `origin:'nc'`; e2e `@p0`: ficha (disabled segments, floor on Concluir asserting the stored pair in IndexedDB, adjusted note), points (NC entries → Editar → DOCX section 8), parecer-export (Não apto, third bullet absent in the DOCX/PDF text) -- DoD.
- `_bmad-output/specs/spec-fasor/source-deltas.md` -- the three 2026-11-06 rows already exist; append " *(built, batch e22c)*" notes only; `docs/kbs/log.md` and the matching KB concept -- DoD.

**Acceptance Criteria:**
- Given a sheet with every row C and readings within criterion, when "Concluir ficha" is tapped with no pair chosen, then the sheet concludes Aprovado · Sem restrições and the store holds both conclusion cells.
- Given an NC row or observation text, when the conclusion renders, then Sem restrições is disabled with the reason line and Reprovado remains selectable.
- Given 300 MΩ against > 400 MΩ or a ratio INSATISFATÓRIO, when the sheet concludes, then its effective result is Reprovado, Aprovado is disabled and section 9 prints REPROVADO.
- Given a sheet concluded Aprovado · Sem restrições before a reading was corrected out, when the ficha, the Sumário and the preview render, then each shows Reprovado and the ficha shows "Conclusão ajustada pela ficha".
- Given a v5 relatório, when it renders, then the floor, the derived entries and the derived verdict apply as on v11.
- Given two NC rows on TR-1, one NC on a local and an out insulation on DJ-01, when Pontos and section 8 render, then four derived entries follow the manual points in tree order and "automáticos" counts 4 more.
- Given an NC derived entry, when Editar saves a new action and deadline, then a point `origin:'nc'` with the row's `item_key` replaces it, and removing that point brings the entry back.
- Given one sheet effectively Reprovado, when Etapa 6 and section 10 render, then the verdict is Não apto, looser segments are disabled with the reason, the summary names the sheet and the third bullet does not print.
- Given one sheet Com restrições and none Reprovado, then the verdict is Apto com restrições, Apto disabled, Não apto choosable, the third bullet prints.
- Given a summary replaced by typed text before this batch, then the composed summary prints followed by "Observações do responsável" with the typed text.
- Given a template whose own Conclusão text says "nos itens 8 e 9", when section 10 prints, then the reference reads the printed positions of RELATÓRIOS DOS ENSAIOS and PONTOS DE ATENÇÃO.

## Spec Change Log

## Review Triage Log

## Design Notes

- Floor precedence: failure sources (out reading, ratio, measurement out, defect reason) give `{reprovado, com_restricoes}` (Com kept, as the old suggestion did for an out reading; open for Bruno); else NC/observation gives `{aprovado, com_restricoes}`; else, only when something was measured or answered and nothing is to-check, unjudged or waiting for its group, `{aprovado, sem_restricoes}`; else null.
- Effective pair per dimension, so an unset stored dimension reads the floor's value (an open sheet with a floor prints its floor marks in a draft).
- `composeParecer`'s basis keeps its existing keys byte-identical when the new clauses are empty (add keys only when non-empty), as Story 17.5 did.
- Suppression keys: `nc` → (equipment_id ?? location_id, item_key); `reading` → (equipment_id, test_key); `reprovado` → equipment_id. A block with no equipment is never suppressed (as Story 6.6).

## Verification

**Commands (inside `podman compose --profile tools run --rm --user root tools ...`):**
- `pnpm lint && pnpm static` -- clean.
- `pnpm exec vitest run --project @app/domain <files>` then `pnpm test:unit` -- green.
- `podman compose restart api` then `pnpm test:api` -- green.
- `pnpm exec tsx scripts/e2e.ts <touched specs> --project desktop-chrome --project durability-desktop-chrome` under `lockf -t 20000 /tmp/fasor-verify.lock` -- green.
