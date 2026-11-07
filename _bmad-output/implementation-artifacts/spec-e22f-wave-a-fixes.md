---
title: 'e22f: Epic 22 wave A fixes, the floor''s gate reds and the integrated review'
type: 'bugfix'
created: '2026-11-06'
status: 'in-progress'
baseline_revision: 'b883c587'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-22-context.md'
  - '{project-root}/.claude/worktrees/agent-a77b397be223202ff/_bmad-output/implementation-artifacts/epic-22-wave-a-integrated-review-2026-11-06.md'
warnings: ['batched']
batched_reason: 'The fix batch of wave A: the three integrated-gate reds and the integrated review items S1 to S7, N1, N3, N4, N8 share conclusion.ts, parecer.ts and derived.ts; one gate, one PR.'
deferred: ['N5', 'N6', 'N7']
---

# e22f: Epic 22 wave A fixes

## Intent

Close the three deterministic reds of the wave A integrated gate on `b883c587` and the integrated review's should-fix
items and the notes the launch prompt names, without changing any document layout. No contract bump: no op shape,
no new op family and no new rule a client must read beyond the kernel it ships with (every change is a kernel
reader or a web surface; a 31 client reads the same rows). Dev model opus, effort high; the orchestrator implements
itself (token economy, the investigation already holds the code map).

## Findings that drive the fixes

- **R1 (R8DRY-E2E-001, 14.2-E2E-001).** Probe on the kernel: the fixtures' ratio rows type `100` in the AT and BT
  voltage columns (read as kV and V) and `100` in the three captures, so the calculated ratio is 1.000 and every
  capture deviates 90 %: `conclusionFloor` = Reprovado · Com restrições, reason `ratio` (Story 22.4 names it). The
  kernel is right; the fixtures held an out-of-criterion reading. Fix the fixtures (captures `1000`, within
  criterion) so the specs keep their intent ("Ficha completa", then Concluir); no assertion is loosened.
- **R2 (12.5-E2E-001).** A sheet with every row C and no reading gets the floor Aprovado · Sem restrições
  (`anyAnswered`), and `conclusaoMissing` reads the effective pair, so the open sheet's line says
  "Verificações e conclusão prontas". Coordinator reading: the floor is a floor, not a conclusion.

## Code map

| File | Change |
|---|---|
| `packages/domain/src/relatorio/conclusion.ts` | `chosenConclusionPair`, `printedConclusionPair`, `conclusionAdjustWrites`, `printedConclusionText`, memoized floor |
| `packages/domain/src/relatorio/sheet-evaluation.ts` (new) | WeakMap memo of `evaluateSheetReadings` / `evaluateSheetMeasurements` per block row and definition |
| `packages/domain/src/relatorio/sheet-progress.ts` | `conclusaoMissing` from the chosen pair; option `{ floorFills }` |
| `packages/domain/src/relatorio/parecer.ts` | `derivedParecer` null with no concluded sheet; N1 summary; memo per snapshot |
| `packages/domain/src/relatorio/pre-issue.ts` | `parecer_missing` back (blocking); `points_possible_duplicate` (pending) |
| `packages/domain/src/print/section-9.ts`, `section-10.ts`, `relatorio/sumario.ts` | printed pair and text; `[Parecer]` back while no verdict |
| `packages/domain/src/points/derived.ts`, `points/checks.ts` | N4 suppression and flag; S4 `ncRowPointText`; N3 `clearsNcObservation` |
| `apps/web/src/surfaces/ficha/*` | conclude gate on `{ floorFills }`; adjusted Confirmar; S4 seed; N3 clear |
| `apps/web/src/surfaces/local/verificacoes-surface.tsx` | S4 seed, N3 clear on site rows |
| `apps/web/src/surfaces/relatorio/setup/etapa6-parecer.tsx`, `export/export-dialog.tsx` | no verdict; blocked reason; duplicate row link |
| `apps/web/src/styles/app.css`, `copy/pt-br.ts` | S6 disabled segments; S3/N8 notes; S2 link word |
| `e2e/dry-transformer.durability.spec.ts`, `e2e/local-painel-coluna.spec.ts` | ratio fixture within criterion |

## Tasks and acceptance criteria

1. **R1.** Fixture fix in both specs. AC: Given the seeded sheet with readings within criterion, When "Confirmar
   todos" and the readings land, Then the line reads "Ficha completa" and Concluir concludes.
2. **R2 / N2 (counts and print follow the chosen pair).**
   - `chosenConclusionPair(block)`: per half, the stored value made stricter by the floor; an unset half is null.
   - `sheetProgress` counts the conclusion step from the chosen pair; `{ floorFills: true }` counts it from the
     effective pair. "Concluir ficha", its jump and the primary's "Concluir e avançar" use `floorFills` (Story 22.4
     AC1 still concludes with no pair chosen); the line, the stepper and the Sumário use the default.
   - `printedConclusionPair(block)`: the effective pair once concluded, the chosen pair before.
   - AC: Given an open sheet, every row C and no pair chosen, When the header renders, Then "Verificações prontas"
     and the conclusion counts as missing, while the radiogroups still show the floor and the reason line.
     Given that sheet in a draft, Then section 9 prints no X. Given it concluded, Then section 9 prints the floor.
3. **S1.** `conclusionAdjustWrites(block, definition, tag)`: the effective pair's halves that differ from the stored
   ones, and, when `text_status` is `confirmed` and the text is stale, the composed text and basis. The adjusted
   note's Confirmar writes them in one batch; an edited text is never written (it then reads stale, "Substituir").
   `printedConclusionText`: a `confirmed` text that is stale while the sheet is adjusted prints the composed text,
   so a Reprovado pair never prints with an empty paragraph where a confirmed suggestion existed. AC on seed v11
   and v5 (kernel), plus `ficha.spec.ts` 5.8-E2E-001 asserting the stored text after Confirmar.
4. **S2.** Pre-issue row `points_possible_duplicate` (row `section_8`, pending, explicit in the Export dialog with
   "Ver pontos", which opens Sumário row 8's surface): "1 par de pontos possivelmente duplicados" (authored). No
   automatic de-duplication.
5. **N4.** A live point with an `item_key` suppresses `nc:{owner}:{item_key}` whatever its origin. The flag pairs
   only points that predate contract 31's create shape: `newPointRow` now always writes `item_key` (null when
   none), and `possibleDuplicatePoints` pairs only `manual` points whose row has no `item_key` key at all.
6. **S3 / N8.** New Etapa 6 note and Pontos intro note (authored, listed in the PR).
7. **S4.** `ncRowPointText(snapshot, owner, itemKey)` composes the row's entry text (photo tokens included); the
   NC row's "Criar ponto de atenção" seeds it (sheet and local rows).
8. **S5.** `derivedParecer` returns null while no sheet is concluded; `effectiveParecer` null with no stored verdict
   either: `parecer_missing` blocks again (pre-wave text and reason), section 10 prints `[Parecer]`, Etapa 6 checks
   no segment and hides the box, the Sumário row names the pre-issue row.
9. **S6.** `.conclusion-pair .seg:disabled { opacity: .4 }` in `app.css`, mirroring `.btn.is-disabled`.
10. **S7.** `sheet-evaluation.ts` memo; `conclusionFloor` memoized per block; `derivedParecer`/`parecerCounts`/
    `pointsSummary` reads memoized per snapshot. Kernel test counts `evaluateSheetReadings` calls; the benchmark
    `parecer-bench.test.ts` logs before/after.
11. **N1.** The summary lists a Reprovado sheet once: "N fichas foram reprovadas: 3 por relação de transformação
    insatisfatória (...) e 15 por leituras fora do critério de aceitação (...)" (authored); the restriction, ratio and
    out-reading sentences and Critérios items leave the Reprovado sheets out.
12. **N3.** `clearsNcObservation(from, to, observation, chips)`: NC to C with an observation equal to one of the row's
    chip phrases clears it in the same batch; an edited observation stays.
13. **Deferred** (no code): N5, N6, N7 rows in `deferred-work.md` under "e22f".

## Golden

The Porto Seguro fixture has no concluded sheet and no stored parecer: `pre-issue.golden.json` regains its pre-wave
`parecer_missing` row, and the skeleton golden's section 10 box title goes back to `[Parecer]` (the composed summary
stays, N1-deduplicated). No section 9, photo, order, numbering or size change.

## Spec Change Log

## Auto Run Result
