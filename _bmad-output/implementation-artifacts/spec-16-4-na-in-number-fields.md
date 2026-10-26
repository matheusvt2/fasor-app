---
title: 'Story 16.4: "N.A" in a nameplate or cabine number field (contract 26)'
type: 'feature'
created: '2026-10-26'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-16-context.md']
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** A nameplate or cabine number field accepts digits only; Bruno wants to type "N.A" when the plate carries no such value, so the printed sheet says so instead of "-" and the field stops reading as unfilled (`epics.md` Story 16.4, lines 4294-4330).

**Approach:** The AD-11 number value gains a fourth state, `not_applicable`, stored `{ raw: '', unit: null, state: 'not_applicable' }`. `numberFieldValue` answers it for the accepted spellings; the kernel composes "N.A" once (`NOT_APPLICABLE_TEXT`) and every reader of the shape reads `state` before `raw`; contract 26, minimum 26. The OCR contract keeps its own three-state schema so the exported JSON Schema is unchanged.

## Boundaries & Constraints

**Always:** defaults of `epic-16-context.md` (Matheus 2026-10-23) bind: nameplate fields of kind `number` and the cabine's `se`/`env` number fields only; spellings `N.A`, `NA`, `N/A`, `N.A.` in any case, whitespace ignored anywhere (`" n . a "`); shown and printed exactly `N.A` (no unit); commit through the existing `sheet/{id}/nameplate/{key}` and `location/{id}/se|env/{field}` puts; undo is the existing put inverse. AD-1: the "N.A" text and the spelling rule live only in `packages/domain`. Porto Seguro goldens byte-identical. pt-BR UI copy; English code and docs; no emoji.

**Never:** no new op family, no seed change, no change to measurement cells (`measurement-field.tsx`, `reading-cells.ts` `readStored`, test cells keep refusing letters), no change to the suggestion "editable guess" parse (`suggestion-group.ts` `parseFieldInput`), no change to `services/ocr` nor the committed OCR schema, no free text in number fields, no edit to `epics.md` or `sprint-status.yaml`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Parse | `numberFieldValue(t, 'kVA')` for t in `N.A`, `na`, `n/a`, `N.A.`, ` n . a ` | `{ raw: '', unit: null, state: 'not_applicable' }` | none |
| Not a spelling | `N`, `N.A.A`, `NAO`, `n-a`, `N.A 5` | `'invalid'` (as today) | "Número não reconhecido" |
| Number / blank | `1.500` / `''` | measured `{raw:'1500', unit:'kVA'}` / `null` (unchanged) | none |
| Field at rest | stored N.A | input text `N.A`, no `.mf-unit`, no `.mf-echo` | none |
| Sheet print | nameplate POTÊNCIA NOMINAL = N.A | DADOS DO EQUIPAMENTO cell `N.A` (no " kVA") | none |
| Cabine line / Sumário meta | `primary_kv` = N.A | `cabineLineText` and `cabineMetaText` show `N.A` in the value's place (no " kV") | none |
| Filled | N.A cell | `isCellFilled` true; `cabineProgress` not missing; no missing-field cursor; no dry-insulation gap; `emptySheetCount` does not count the sheet empty | none |
| Calculations | N.A on a ratio/voltage/band input | `nameplateNumber`, `nameplateFirstNumber`, `voltsOf` null; `identityPart` skips; criterion bands absent | none |
| Plate reading | measured suggestion on N.A cell | `suggestionView` `'replace'`; `compareSuggestion` `'different'`; Confirmar writes the measured value | none |
| Conflict view | a side holding N.A | `conflictValueText` `N.A` | none |
| Copy previous cabine env | previous cabine temp or humidity N.A | `previousCabineEnv` null (not offered) | OPEN QUESTION 2 |
| Old client | contract-25 pull | 426 `contract_outdated` | client reloads |

</intent-contract>

## Code Map

Kernel (`packages/domain/src`):
- `schemas/entities.ts:27` -- `numberValueSchema` enum gains `'not_applicable'`. Used by the cabine `se`/`env` row schema (l.364-372) and by `contract/ocr.ts` (l.135 and l.147).
- `contract/ocr.ts:132-151` -- `structuringValueSchemaFor('number')` and `structuringValueSchema.value` switch to a local `ocrNumberValueSchema` (`raw`, `unit`, `state: enum(['measured','not_measured','empty'])`, `.strict()`), so `pnpm schema:ocr` emits the same bytes (`ocr.test.ts` / the kernel drift test).
- `contract/version.ts:205-217` and `:340-348` -- entry 26 in both doc blocks (why: a version-25 bundle's `numberValueSchema` refuses `not_applicable`, so a pulled cabine row or op with it fails its parse, and its readers would print "-" or a blank where the server prints "N.A"); `CONTRACT_VERSION = 26`, `MIN_CONTRACT_VERSION = 26`. `contract/contract.test.ts:102-103` asserts 26/26.
- `parse/pt-br-number.ts` -- leaf module, no kernel imports: add `NOT_APPLICABLE_TEXT = 'N.A'`, `isNotApplicableText(typed)` (strip all whitespace, uppercase, match `^(N\.A\.?|NA|N\/A)$`), `NOT_APPLICABLE_NUMBER` (frozen value) and `isNotApplicableNumber(value: unknown)` (object with `state === 'not_applicable'`). Every reader below imports from here (avoids the `ficha.ts` <-> `progress.ts` cycle `suggestion-group.ts:118` names).
- `relatorio/ficha.ts:253` `numberFieldValue` -- returns `NotApplicableNumber | {..measured} | null | 'invalid'`; N.A checked after blank, before `parseDecimalPtBr`. `:260` `fieldValueText` -- `N.A` for the state. `:67` `previousCabineEnv` -- null when either value is `not_applicable`. `:91` `humidityNoteSurfaced` -- false unless measured.
- `relatorio/suggestion-group.ts:123` `valueText` -- same rule as `fieldValueText` (`N.A`).
- `print/section-9.ts:237` `storedValueText` -- `N.A` without unit, before `fieldValueText`/`withUnit`. Nameplate cells reach it at l.360, cabine fields at l.342.
- `relatorio/cabine.ts:59` `cabineValueFilled` -- true for `not_applicable`; `:114` `lineMeasure` -- `N.A`.
- `relatorio/sumario.ts:113` `measure` -- `N.A` for the state (the Sumário's `.s9-loc-meta`), reading `state` before `raw`.
- `relatorio/conclusion.ts:167` `identityPart` -- already `continue`s on non-measured (l.180): test only.
- `relatorio/reading-cells.ts:272/290` `nameplateNumber`/`nameplateFirstNumber`, `relatorio/reading-evaluation.ts:46` `voltsOf` -- already measured-only: tests only.
- `relatorio/sheet-state.ts:33` `isCellFilled` -- already `state !== 'empty'`: test only (also covers `sheet-progress`, `dry-insulation.ts:115`, `reading/build.ts:106`, `reading/display.ts:336`, `merge/policy.ts:79`).
- `relatorio/suggestion-rows.ts:172/219` `compareSuggestion`/`suggestionView` -- already 'different'/'replace' through the state compare: tests only.
- `reading/value.ts:65` `readingValueText` -- answer `''` for `not_applicable` explicitly (state before raw).
- `merge/conflicts.ts:657` `conflictValueText` -- `N.A` before the measurement path.
- `relatorio/pre-issue.ts:620` `issueConfirmation` -- unchanged; test that an N.A-only sheet is not an empty sheet and adds no blank field.

Web (`apps/web/src`):
- `components/number-input.tsx` -- `ParsedNumber` may carry `state?: 'not_applicable'`; `echo` option may answer `null` (no echo line); `rawOf` must keep a stored N.A and a typed N.A equal (so a re-render does not reset the text) and different from a stored measured/blank (so an undo or remote put replaces it at rest). Measurement fields keep their own parse and never produce the state.
- `surfaces/ficha/ficha-fields.tsx:310-360` `NumberField` -- commit `NOT_APPLICABLE_NUMBER` when `parsed.state === 'not_applicable'`; `format` -> `NOT_APPLICABLE_TEXT`; echo null for it; `storedText` from `fieldValueText` (already). Hide the `.mf-unit` span while the shown value is N.A (at rest and once typed). Enter runs on (the `'invalid'` guard already lets it). The cabine block (`cabine-block.tsx`, `cabineSeOp`/`cabineEnvOp` in `ficha-ops.ts`) renders the same `NumberField`: confirm and widen the op helpers' value type if needed.
- `surfaces/ficha/ficha-fields.test.tsx` -- the four spellings plus one lower/space variant: commit value, `N.A` at rest, no `.mf-unit`, no `.mf-echo`, no "Número não reconhecido", Enter moves on, draft source cleared.

Api (`apps/api/src`):
- `sync/sync.integration.test.ts:1078` -- the contract test becomes 26 (add '25' to the refused list, pull at '26' answered). Add one test beside the Story 15.3 one (l.1607 pattern): a version-26 push of a `location/{id}/se/primary_kv` and a `sheet/{id}/nameplate/{key}` put holding `NOT_APPLICABLE_NUMBER` is applied and the stream carries it; a version-25 pull is 426. `sync-v6`/`sync-v7` use `toBeGreaterThanOrEqual`: untouched.

E2E:
- `e2e/na-number-field.spec.ts` (new, `@p0`, add to `SERIAL_SPECS` in `e2e/support/groups.ts` with its why; `scripts/e2e.test.ts` green) -- on a relatório with a TP (the fixed-id Porto Seguro fixture via `resetEmpresaBWithFixture`, `e2e/support/export-fixture.ts`, or a seeded relatório): type `n.a` in POTÊNCIA NOMINAL, blur, see `N.A` and no unit; assert the committed op in the outbox (`e2e/support/outbox.ts`) equals `{raw:'',unit:null,state:'not_applicable'}`; reload, still `N.A`; Pré-visualizar (`e2e/parecer-export.spec.ts:215` pattern), fetch `preview.pdf`, extract its text with `pdfjs-dist` (resolved from `apps/api`, as `apps/api/src/jobs/generate/rich-text.integration.test.ts:14` imports it; a small `e2e/support/pdf-text.ts`) and find `N.A`. Also type `NA` in a cabine number field and see `N.A` on the cabine line.

Docs: `_bmad-output/specs/spec-fasor/source-deltas.md` (row 125 exists: add an "as built" row with contract 26/26, the reader list and open questions), `glossary.md` ("N.A" entry), `docs/kbs/architecture/kernel-and-seed.md`, `docs/kbs/log.md`.

## Tasks & Acceptance

**Execution:**
1. `packages/domain/src/parse/pt-br-number.ts` -- the constant, the spelling test, the value and its guard -- one home (AD-1).
2. `packages/domain/src/schemas/entities.ts`, `contract/ocr.ts`, `contract/version.ts`, `contract/contract.test.ts` -- enum, OCR's own schema, entry 26/26 -- the contract.
3. Kernel readers listed in the Code Map, each with a `not_applicable` test in its existing `*.test.ts` (ficha, suggestion-group or suggestion-rows, section-9 or print tests, cabine, sumario, conclusion, reading-cells/ratio, reading-evaluation, sheet-state, value, conflicts, pre-issue) -- every reader reads `state` before `raw` and never throws.
4. Run `pnpm schema:ocr` in the tools container; `git status` shows no change to the committed OCR schema.
5. `apps/web/src/components/number-input.tsx`, `surfaces/ficha/ficha-fields.tsx` (+ `ficha-ops.ts` types if needed), `ficha-fields.test.tsx` -- the input.
6. `apps/api/src/sync/sync.integration.test.ts` -- contract 26 and the push/stream test.
7. `e2e/na-number-field.spec.ts`, `e2e/support/groups.ts`, `e2e/support/pdf-text.ts` -- the spec.
8. Docs listed above.

**Acceptance Criteria (epics.md Story 16.4):**
- Given a nameplate or cabine number field, when the engineer types one of the accepted spellings and leaves the field or presses Enter, then the field commits `{ raw: '', unit: null, state: 'not_applicable' }` through the existing `sheet/nameplate` or `location/se`/`location/env` put, shows "N.A" at rest (no unit, no echo line), Enter runs on to the next missing field, "Número não reconhecido" never shows, and the draft source is cleared as for a number.
- Given a field holding N.A, when the sheet, the cabine lines, the Sumário and the document render, then DADOS DO EQUIPAMENTO prints "N.A" (no unit), the cabine line prints "N.A" in the value's place, `isCellFilled` reads it as filled (no missing-field cursor, no dry-insulation gap), `identityPart` skips it, the ratio's `nameplateNumber` answers null, the voltage classes and criterion bands treat it as absent, and the pre-issue question does not count it.
- Given a plate reading (OCR) on a field holding N.A, when the suggestion arrives, then it shows the replace line (`suggestionView` 'replace'), "Confirmar" writes the measured value, and the OCR contract's exported JSON Schema is unchanged.
- Given a device on contract 25, when it pulls, then the server answers 426 so it reloads to 26 (AD-26); every reader reads `state` before `raw`.
- Given an undo of the N.A commit, when "Desfazer" runs, then the field returns to its previous value as for any put.

## Design Notes

Why a leaf module: `suggestion-group.ts` restates `fieldValueText` to dodge an import cycle; both now import `NOT_APPLICABLE_TEXT` from `parse/pt-br-number.ts`, which imports nothing of the kernel.

Open questions (keep the default, list in the PR body):
1. Bruno's question 2: "N.A" or "NA" printed. Default "N.A".
2. "Copiar da cabine anterior" when the previous cabine holds N.A in temperature or humidity: default not offered (an N.A is no reading to copy).
3. The plate suggestion's editable guess (`parseFieldInput`) keeps refusing N.A: a reading is a number by definition.

## Verification

**Commands (tools container, `podman compose --profile tools run --rm --user root tools pnpm ...`):**
- `test:unit -- packages/domain apps/web/src/surfaces/ficha` -- green while iterating.
- `schema:ocr` then `git status --short` -- no change.
- `podman compose restart api` before `test:api -- sync.integration` -- green.
- `lint`, `static` -- green.
