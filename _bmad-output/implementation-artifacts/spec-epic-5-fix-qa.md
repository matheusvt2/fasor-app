---
title: 'Epic 5 fixes: integrated review findings'
type: 'bugfix'
created: '2026-09-24'
status: 'in-progress'
baseline_revision: '253215ed63dad40aacad80eab75d871beaba827a'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'medium'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/reviews/epic-5-review-qa.md'
warnings: ['batched', 'multiple-goals', 'oversized']
# batched: every "Fix now" finding of the Epic 5 integrated review in one branch; they share the ficha surface and the kernel, and one batch saves tokens.
deferred: []
---

<intent-contract>

## Intent

**Problem:** The Epic 5 integrated review (`reviews/epic-5-review-qa.md`) found one high defect (a sheet op refused by the kernel's seed-path check answers 500 and blocks the device outbox forever, failing `@p1 4.2-E2E-002`) and a set of medium/low defects and test gaps on the equipment sheet.

**Approach:** Fix every row whose disposition is "Fix now" (E5-Q1, Q2, Q4, Q5, Q7, Q8, Q9, Q10, Q14, Q16, Q17), the cheap nit Q15 (its disposition allows "round to the nearest power"), and add the e2e paths (a), (c), (d) of Q18. Kernel first, then web, then tests.

## Boundaries & Constraints

**Always:** AD-1/AD-13 ownership (derived text, verdicts and counts only in `packages/domain`); new pt-BR strings in their AGENTS.md home, `// authored:` when not from a mock; `tokens.css`/`components.css` stay byte-identical, translations go in `app.css`/`ficha.css` with a comment naming the mock rule; run tests only in the `tools` container, output to a log, read the tail.

**Never:** Act on E5-Q3, Q6, Q11, Q12, Q13 (product questions or Epic 7 defers; they stay open). Never add a new op path family. Never change `applyOp`'s accepted set of paths (only how a refusal is typed). No emoji. Do not edit `epics.md` or `sprint-status.yaml`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Q1 push, unknown test key | `/api/sync/ops` batch with `sheet/{equipmentBlock}/test/nao_existe/instrument` plus one valid op | 200; the bad op in `rejected` with `op_invalid`, the valid op applied | never 500 |
| Q1 push, section block | `sheet/{sectionBlock}/test/isolacao/instrument` | `rejected: op_invalid` | never 500 |
| Q1 cell geometry | `sheet/{b}/test/{k}/cell/{row outside}/0` or a `derived` column | `rejected: op_invalid` | never 500 |
| Q1 server batch | `applyServerBatch` with such an op | `ServerBatchRejectedError` naming the op, `op_invalid` | transaction rolled back |
| Q4 nothing judged | every capture Não medido / sub-block disabled / ratio with no VAL CALCULADO | text never says "dentro dos critérios" | - |
| Q4 no C row | checklist disabled or all NA, no NC | text never says "todos os itens verificados conformes" | - |
| Q7 milliohm | "147 mΩ", "147 mohm" on an insulation cell | `'invalid'` | field shows its invalid state |
| Q7 mega | "147 MΩ", "147M", "147 m", "147 g" | 147 MΩ / MΩ / MΩ / GΩ as today | - |
| Q15 factor | 3,3 vs 3.300 and 3.200 | "1000× abaixo" (nearest power of ten in log scale, never below 100) | - |

</intent-contract>

## Code Map

- `packages/domain/src/ops/apply.ts:102-152` -- `assertSeedPath`/`assertCellGeometry` throw plain `Error` (the "no equipment definition" branch too).
- `packages/domain/src/ops/path.ts:285` -- `PathError`, the pattern for a typed error; export the new one from the package index.
- `apps/api/src/sync/apply.ts:418,451` -- `applyServerBatch` and `applyOps` map only `ZodError`/`ForeignOpIdError` to `op_invalid`.
- `apps/api/src/sync/sync.integration.test.ts:336` (1.5-API-001 "is atomic per op") and `apps/api/src/sync/apply-batch.integration.test.ts` -- where the new integration tests go.
- `e2e/relatorio.spec.ts:644-662` -- 4.2-E2E-002 pushes `sheet/${anyBlock}/test/t1/instrument`; `t1` is no test key and the first block is a section. Insulation test key is `isolacao` (`e2e/ficha.spec.ts:652`); equipment `block_type`s are in `packages/domain/src/seed/v1.ts:503-577`.
- `packages/domain/src/relatorio/conclusion.ts:55-66` (`ncItems`), `:198-235` (`composeConclusion`, text and `basis`) -- Q4.
- `packages/domain/src/relatorio/readings.ts:32,65` (`ReadingVerdict`, `EvaluatedCell.verdict`), `:400-403` `powerOfTenBelow`, `:418-436` `markOutliers` -- Q15.
- `packages/domain/src/parse/pt-br-number.ts:101-114` -- `parseReadingPtBr` suffix regex with `/i` -- Q7.
- `packages/domain/src/relatorio/ficha.ts:268` `fieldValueText` uses `formatDecimalPtBr`; `formatDecimalGroupedPtBr` at `pt-br-number.ts:65` -- Q14.
- `packages/domain/src/relatorio/ops.ts:40` `putBlockOp`; `apps/web/src/surfaces/ficha/ficha-ops.ts:94-104` `concludedByOp`/`notTestedOp` use a local `put` -- Q16.
- `apps/web/src/components/tri-state-control.tsx:81` (Delete guard on stale `value`), `:89` (`aria-disabled` on the radiogroup); `apps/web/src/surfaces/ficha/conclusao-section.tsx:43-91` `ConclusionPair` same guard -- Q8, Q10. `e2e/ficha.spec.ts:919` asserts `aria-disabled` and must move to `aria-readonly`.
- `apps/web/src/components/generated-text-field.tsx:83-120` -- criteria line is the `aria-describedby` of the stored text and renders in every state -- Q5.
- `apps/web/src/surfaces/ficha/instrument-picker.tsx:166-200` -- `<p className="ip-expired">` sits outside `.instrument-picker`, so `components.css:532` never matches -- Q9.
- `apps/web/src/surfaces/ficha/ficha-surface.tsx:313-316` -- sheet Overflow menu entries -- Q17. Copy in `apps/web/src/copy/pt-br.ts` (`menuConcluir` neighbours).
- `apps/web/src/surfaces/ficha/ficha.css:111` -- `.measurement-table td.cell-value { min-width: 300px }` (from the mock page rule) pushes the insulation table to 515 px at 390; `components.css:491,499` is the mock's narrow rule (`is-wide`: `width: auto; min-width: 128px`, field `flex-wrap: wrap; min-width: 0`). DESIGN.md:784: "the value column taking the remaining width on phone" -- Q2.
- `e2e/ficha.spec.ts:406` (5.1-E2E-004 dead-tab draft pattern), `:630` (Cadastrar instrumento) -- Q18 patterns.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/ops/apply.ts` (+ index export) -- add `export class SeedPathError extends Error` (name `'SeedPathError'`, carries the path string); every throw in `assertSeedPath`/`assertCellGeometry` uses it; unit tests in `apply.test.ts` assert `toThrow(SeedPathError)` -- Q1.
- `apps/api/src/sync/apply.ts` -- treat `SeedPathError` like `ZodError` in both `applyServerBatch` and `applyOps` (permanent `op_invalid`); integration tests for the four Q1 matrix rows (push route + server batch) -- Q1.
- `e2e/relatorio.spec.ts` -- 4.2-E2E-002 picks an equipment block (a `block_type` from the seed's equipment list) and pushes `sheet/{id}/test/isolacao/instrument`; it must pass in `pnpm test:e2e:full` -- Q1.
- `packages/domain/src/relatorio/conclusion.ts` -- readings clause "valores medidos dentro dos critérios de aceitação" only when at least one evaluated capture has a verdict and none is `out`; checklist clause "todos os itens verificados conformes" only when the enabled checklist has at least one `C` row and no NC; otherwise the sentence states only what exists, with the wording in Design Notes; `basis` covers the new input (presence of a judged reading and of a C row) so a change recomposes; unit tests for every branch incl. plural nouns -- Q4.
- `packages/domain/src/parse/pt-br-number.ts` -- a lowercase `m` followed by `Ω`/`ohm(s)` is `'invalid'`; everything else unchanged; unit tests -- Q7.
- `packages/domain/src/relatorio/readings.ts` -- factor = nearest power of ten in log scale (`10 ** Math.round(Math.log10(ratio))`), floor 100; update tests -- Q15.
- `packages/domain/src/relatorio/ficha.ts` -- `fieldValueText` uses `formatDecimalGroupedPtBr` ("1.500"); test -- Q14.
- `apps/web/src/surfaces/ficha/ficha-ops.ts` -- `concludedByOp`/`notTestedOp` built with the kernel's `putBlockOp` (add the fields to `BlockField` if missing), same op path and value -- Q16.
- `apps/web/src/components/tri-state-control.tsx`, `conclusao-section.tsx` -- Delete/Backspace guard reads the latest value including one just emitted (a ref updated on render and on `onChange`), so Space, ArrowRight, Delete in quick succession always clears; radiogroup read-only state uses `aria-readonly="true"` (not `aria-disabled`) in both controls; update `e2e/ficha.spec.ts:919` -- Q8, Q10.
- `apps/web/src/components/generated-text-field.tsx` -- in `stale`, the stored text has no `aria-describedby` to the criteria line; the criteria line renders with the "Sugerido: texto atualizado — Substituir" row as the evidence of the suggested replacement; other states unchanged -- Q5.
- `apps/web/src/surfaces/ficha/instrument-picker.tsx` -- move the `.ip-expired` line inside the `.instrument-picker` element (mock class match), so it renders `--fora-do-limite` -- Q9.
- `apps/web/src/surfaces/ficha/ficha-surface.tsx` + `copy/pt-br.ts` -- sheet Overflow gains "Limpar conclusão" (`// authored:`, EXPERIENCE › Conclusion control) when result or restriction is set and the sheet is not read-only; it clears both in one edit (undoable like other edits) -- Q17.
- `apps/web/src/surfaces/ficha/ficha.css` -- below 768 px, the value cell of the non-TTR table mirrors `components.css:491,499` (`width: auto; min-width: 128px`; field `flex-wrap: wrap; min-width: 0`), comment naming the mirrored rule; `min-width: 300px` stays at >= 768 -- Q2.
- `e2e/ficha.spec.ts` -- `@p1` Q2: at 390 x 844 the `1 minuto` input, its unit slot and its cell Overflow trigger are inside the viewport (bounding box within 0..390); `@p1` Q8: Space, ArrowRight, Delete fast leaves the row unset (repeat 3x in the test); `@p1` Q17: Overflow "Limpar conclusão" clears both groups; `@p0` Q18a: a typed, uncommitted reading survives a dead tab as "Rascunho encontrado — Recuperar" and Recuperar restores it; `@p1` Q18d: offline, "Cadastrar instrumento" opens `/cadastros`, a new instrument is created, back on the sheet it is picked and the outbox holds the `instrument` put; `@p1` Q9: the expired line's computed color equals `--fora-do-limite`.

**Acceptance Criteria:**
- Given a device outbox holding an op `assertSeedPath` refuses followed by a valid op, when it syncs, then the api answers 200 with the bad op rejected `op_invalid`, the valid op applied, and the client stops retrying the refused op and surfaces it as any refused write (Story 1.8).
- Given a sheet with every capture Não medido and the checklist all NA, when the conclusion text composes, then it contains neither "dentro dos critérios" nor "conformes".
- Given the stored text is stale, when the screen reader reads the stored text, then the criteria line is not announced as its description; it is shown beside "Substituir".
- Given a Não ensaiada sheet, when its checklist rows render, then each radiogroup has `aria-readonly="true"` and no `aria-disabled`.
- Given `pnpm verify` and `pnpm test:e2e:full` in the tools container, when run, then both exit 0 (3.6-E2E-001 may be re-run alone once as a known flake).

## Design Notes

Q4 wording (open question OQ-3 for Matheus; this is the literal, conservative placeholder). `apresentou` becomes `apresentaram` for plural nouns, as today; the recommendation sentence is appended as today.
- readings and checklist both present: unchanged sentence.
- readings present, no C/NC row: `{subject} apresentou {readings}, sem itens verificados registrados.`
- checklist present, no judged reading: `{subject} apresentou {checklist}, sem valores medidos registrados.`
- neither: `{subject} não apresentou valores medidos nem itens verificados registrados.`
An `out` reading or an NC row always counts as present (its clause lists it).

## Narrowings

- Q5: the stale state shows the recomposed text's criteria line beside "Substituir"; the criteria of the stored text are not reconstructed (no stored criteria snapshot exists; adding one would be a new op field).
- Q17: "Limpar conclusão" clears result and restriction; the stored text stays, hidden while the result is empty (as the Delete key does today).

## Open (not acted on here)

E5-Q3 (defer to Epic 7, OQ-2), E5-Q6 (OQ-1), E5-Q11 (OQ-4), E5-Q12 (OQ-5), E5-Q13 (OQ-6), E5-Q18 (b) (Epic 7) and (f)/(g) (next matrix pass), OQ-3 (Q4 wording above).

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm verify > /tmp/verify-e5q.log 2>&1; echo EXIT=$?; tail -60 /tmp/verify-e5q.log` -- expected: EXIT=0
- `docker compose --profile tools run --rm tools pnpm test:e2e:full > /tmp/e2efull-e5q.log 2>&1; echo EXIT=$?; tail -40 /tmp/e2efull-e5q.log` -- expected: EXIT=0 (4.2-E2E-002 passes)
