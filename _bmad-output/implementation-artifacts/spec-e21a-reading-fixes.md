---
title: 'e21a: Epic 21 retrospective reading fixes (E21-A1: R-1, R-2, R-3, R-4, R-9), the P-4 re-read of e21g, the "Dyn I" parse, records'
type: 'bugfix'
created: '2026-11-06'
status: 'in-progress'
baseline_revision: '5673ded5127305b46ac8f58a4f4f157c78a35b56'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-21-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-21-retro-2026-11-06.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-e21f-diagram-vector-group.md'
warnings: ['batched', 'oversized']
batched_reason: 'One retrospective fix batch (E21-A1, E21-A3, E21-A4): R-1 to R-4 and R-9 touch the same fold, kernel rule and providers; the P-4 re-read, the Dyn I parse and the records are small and share the gate.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The Epic 21 retrospective (`epic-21-retro-2026-11-06.md` R-1 to R-4, R-9) found, in fix batch e21f's code: the fold replaces a model's group entry with a composed one that cites nothing usable, which is then dropped (R-1); the "this cited run prints that group" rule lives three times (kernel, api fold, eval) and the eval's copy disagrees with what the job stores (R-2); the fold's outcome is never logged (R-3); the fake fixture schema lost the unique-key check and the fake imports the Bedrock module (R-4); the printed-plus-facts AC is tested only at the fold (R-9). The real-set eval also showed a plate printing "Dyn I" (letter I for 1), which `parseVectorGroup` reads as nothing.

**Approach:** Red-first, a failing test before each fix. One kernel function classifies a structured vector-group value the way `buildReadingSuggestions` stores it, and the build, the fold and the eval all use it. The fold keeps the model's own entry when the composed value would cite nothing, and returns its outcome for one log line. `withoutUncitedValues` moves to a provider-neutral module. The parser accepts a single trailing letter I or l as clock 1. No prompt change, no prompt version bump, no contract change.

## Boundaries & Constraints

**Always:**
- Red-first: each item's test is written first and seen failing on the baseline (record the failing assertion in the commit or the spec); R-9 is test-only and is proven by a mutation run instead (revert printed-wins, see it red, restore).
- `LLM_PROVIDER` and `OCR_PROVIDER` stay `fake` in every test; Bedrock is a stubbed Converse client. No paid call.
- Every verdict lives in `packages/domain` (AD-1, AD-13); `apps/api` only folds and logs.
- The log line carries no OCR text: only the outcome, the composed code, the five facts and counts.
- English code and comments; no emoji.

**Never:**
- Never change `BEDROCK_STRUCTURING_PROMPT_VERSION` (`bedrock-structuring-4`), the prompt text, the tool schema or `VECTOR_DIAGRAM_TOOL_SCHEMA` wording (R-5, R-6 belong to E21-A2).
- Never change `packages/domain/src/contract/ocr.ts`, the committed OCR schema, `CONTRACT_VERSION` or `MIN_CONTRACT_VERSION`, any seed, any PNG or fixture JSON.
- Never run `apps/api/src/scripts/bedrock-eval.ts`.
- Out of scope: R-5 to R-8 (R-8's duplicate-entry collapse is not built), E21-A2, E21-A5, the four P-3 flaky tests.

## I/O & Edge-Case Matrix

Kernel classification `vectorGroupReadOf(field, entry, tokens)` (the field is the v11 LIGAÇÃO SECUNDÁRIA select, or the v9/v10 text):

| Scenario | Entry / tokens | Kind | Stored by the job |
|---|---|---|---|
| printed | "Dyn1" citing t1 "Dyn1" (or "Dyn" "1", or "Dyn" "I") | `printed`, Dyn1 | `suggested` or `verify` by the digit rule, cited box |
| other group | "Dy1" citing "Dyn1" | `other_group`, Dy1 | `verify`, citations kept |
| diagram | "Dy1" citing "H1" | `diagram`, Dy1 | `verify`, `ocr_token_ids: []`, whole image, note |
| unknown id | "Dyn1" citing t1 and t99 | `dropped` (`unknown_token`) | nothing |
| no citation | `ocr_token_ids: []` | `dropped` (`unknown_token`) | nothing |
| bad shape | v11 select value naming no option ("Y") | `dropped` (`invalid_shape`) | nothing |
| unparsed text | v9/v10 text "Y" | `unparsed` | the text as read |

The fold `withVectorDiagram` (plus `withoutUncitedValues` after it), the group field set:

| Scenario | Tool input | Result | Outcome logged |
|---|---|---|---|
| R-1 | "Dy1" citing "H1" (t2), facts Yyn0 citing only t98, t99 | the "Dy1" entry kept; the job stores it as a diagram read (`verify`, note) | `uncited` |
| R-1, no entry | no group entry, facts citing only unknown ids | no group entry (as before: nothing to keep) | `uncited` |
| printed wins | "Dyn1" citing its word, facts Yyn0 | unchanged | `printed_wins` |
| composed | no entry or a non-printed one, facts Yyn0 citing known labels | the composed "Yyn0" entry (as today) | `composed` |
| no facts | `vector_diagram` absent / null | unchanged but stripped | `absent` / `null` |
| bad facts | malformed / uncomposable | unchanged but stripped | `malformed` / `uncomposable` |
| no group key | panel, other block types | stripped, nothing logged | none |

Parser, a single trailing letter "I" or "l" after a connection letter reads as clock 1:

| Text | Reads |
|---|---|
| "Dyn I", "DynI", "Dynl", "dyn l", "Dy I", "YNd l", "Yd I" | Dyn1, Dyn1, Dyn1, Dyn1, Dy1, YNd1, Yd1 |
| "Dyn II", "Dyn ll", "Dyn 1I", "Dyn lI", "Dyn i", "DynL", "Yyn I" (no Yyn1 row), "I", "l" | null |
| every canonical code, upper and lower case | itself (unchanged) |

</intent-contract>

## Code Map

- `packages/domain/src/reading/build.ts:64-147` -- `buildReadingSuggestions`: per field, the cited-token check (unknown or none -> `unknown_token`), `normalizeReadingValue`, then the Story 21.2 group branch (lines 100-112: `parseVectorGroup(normalized.value)`, `printedVectorGroups(ordered)`, `diagram`, `otherGroup`). `printedVectorGroups` at 150-162 stays exported. Add the exported classification here, built from the same internal steps the loop uses, and make the loop's group branch call the shared step (one rule).
- `packages/domain/src/reading/value.ts:205` -- `normalizeReadingValue(field, value, cited)`; `ReadingField` = `Pick<FieldDef, 'kind' | 'unit' | 'options' | 'option_aliases'>`. `seed/select-option.ts:29` maps a vector-group select through `parseVectorGroup`.
- `packages/domain/src/reading/index.ts:7` re-exports `build.ts`; `packages/domain/src/index.ts:85` re-exports `relatorio/vector-group.ts`.
- `apps/api/src/jobs/reading/providers/vector-diagram.ts:86-131` -- `printsItsGroup` (private copy of the rule: delete it), `withVectorDiagram(input, key, tokens)`, `vectorGroupKeyOf`. R-1: when the known ids left in the facts are none, return the stripped input with the model's entry untouched. R-2: printed-wins asks the kernel classification (`kind === 'printed'`), which needs the field definition: take it from `StructuringInput.fields` by the group key. R-3: return or expose the outcome (`absent`, `null`, `malformed`, `uncomposable`, `printed_wins`, `uncited`, `composed`; plus the facts and the known-id count) and add one helper that logs `reading vector diagram` through `apps/api/src/log.ts` `log`, with `model`, `outcome`, `code`, `hv_shape`, `hv_neutral`, `lv_shape`, `lv_neutral`, `x1_hours`, `cited` (count), `replaced` (bool); never token text. Logged only when the group key is set.
- `apps/api/src/jobs/reading/providers/bedrock.ts:245-255` -- `withoutUncitedValues`: move it to a new provider-neutral module (e.g. `providers/uncited.ts`) and re-export it from `bedrock.ts` (tests import it from there). `:262-277` the structure call: fold, log, `withoutUncitedValues`, parse.
- `apps/api/src/jobs/reading/providers/fake.ts:20,48-57,193-209` -- import `withoutUncitedValues` from the neutral module, never `./bedrock.ts`; `fakeStructuringFixtureSchema` regains the contract's "each field key appears at most once" refine (`contract/ocr.ts:167-173`; reuse the message); the structure call folds, logs and drops like bedrock.
- `apps/api/src/jobs/reading/providers/vector-diagram.test.ts` -- existing rows; lines 65-69 and 102-104 assert today's uncited replacement and change with R-1. Its `KEY` and minimal tokens may become the v11 field def (`getDefinition('v11', 'cabine_primaria', 'transformador_forca').nameplate`) and full tokens if the signature needs them.
- `apps/api/src/jobs/reading/providers/fake.test.ts:47-68` -- the committed-fixtures test; add the duplicate-key case and the import case.
- `apps/api/src/jobs/reading/providers/bedrock.test.ts:440-500` -- the e21f bedrock cases (`structurer`, `replying`, `toolUse`, `withGroup`, `yyn0`); add the R-1 and log cases here.
- `apps/api/src/jobs/reading/job.integration.test.ts:340-366,1108-1131` -- the 21.2 fake test and the e21f bedrock-path test (`converse({ [HAIKU]: answer })`, `bedrockDeps(client, '')`, `fixtureOf(sha)`, `suggestions(relatorioId)`); copy its shape for R-1 and R-9.
- `apps/api/src/scripts/bedrock-eval.ts:254-261,333` -- `groupRead`; the script runs `run()` on import, so move `groupRead` to a new `apps/api/src/scripts/eval-group-read.ts` (pure, takes the field def) with `eval-group-read.test.ts` (the api vitest project picks up `src/**/*.test.ts`), and import it from the script. Output: printed -> the code; diagram -> "<code> (diagram)"; other group -> "<code> (other group)"; unparsed -> the stored text JSON-quoted; dropped -> "- (dropped)"; no entry -> "-". Update the script's header comment lines 62-70 that describe the table.
- `packages/domain/src/relatorio/vector-group.ts:118-148` -- `parseVectorGroup`; `IGNORED`, `CLOCK`. Apply the trailing-I/l rule on the compact text before upper-casing; doc comment updated. Tests `vector-group.test.ts:135-180`.
- `packages/domain/src/relatorio/reading-cells.ts:245-252` -- `ratioGroupOf` `blank` (P-4 item, below).

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/reading/build.ts` (+ `reading/build.test.ts` or the existing reading test file) -- R-2: export `vectorGroupReadOf(field, entry: { value: unknown; ocr_token_ids: readonly unknown[] }, tokens)` returning `{ kind: 'printed' | 'other_group' | 'diagram', code } | { kind: 'unparsed' } | { kind: 'dropped', reason: ReadingDropReason }`, using the loop's own citation and normalization steps; the loop's group branch reads the same shared step. Tests: every row of the kernel matrix; `buildReadingSuggestions` output is unchanged (existing tests stay green).
- `apps/api/src/jobs/reading/providers/vector-diagram.ts` (+ test) -- R-1, R-2, R-3 as in the Code Map. Red tests first: R-1 (an existing "Dy1" entry and facts citing only unknown ids: the fold plus `withoutUncitedValues` keeps "Dy1"); R-2 (an entry the kernel keeps as printed but the old private copy did not, or the reverse, e.g. a v11 select value whose normalization differs from the raw text; if no such input exists, assert the fold calls the kernel rule by a case only the kernel's `dropped`/`invalid_shape` decides); R-3 (each outcome of the matrix, and one test spying `console.log` that the line has `msg: 'reading vector diagram'` and no token text).
- `apps/api/src/jobs/reading/providers/uncited.ts` (new), `bedrock.ts`, `fake.ts` (+ tests) -- R-4: the move and re-export; the refine; red tests: a fixture with two entries of one key fails `fakeReadingFixtureSchema`; `fake.ts`'s source imports nothing from `./bedrock.ts` (read the file, check its import specifiers).
- `apps/api/src/jobs/reading/job.integration.test.ts` -- R-1 job test: the drawn Yyn0 plate answered "Dy1" citing "t19" with the Yyn0 facts citing only ids the OCR did not return: the stored suggestion is "Dy1", `verify`, `ocr_token_ids: []`, the note "Lido do diagrama — confira" (red on the baseline: no suggestion). R-9 job test: the printed Dyn1 plate (`plate-transformador-dyn1.png`, its fixture's OCR and values) answered through the stubbed bedrock client with its "Dyn1" entry plus Yyn0 facts citing real labels: the stored suggestion is "Dyn1", `suggested`, citing its word, no note; mutation run on printed-wins recorded.
- `apps/api/src/scripts/eval-group-read.ts` (new, + test), `bedrock-eval.ts` -- R-2 for the eval, red test first: an entry citing an unknown id reads "- (dropped)" (the baseline `groupRead` read "Dyn1" or "(diagram)").
- `packages/domain/src/relatorio/vector-group.ts` (+ test) -- the "Dyn I" rule, red tests first from the parser matrix, plus a property test: for every one of the 47 codes, the code with its clock "1" written "I" or "l" reads the code only when the clock is exactly 1, and no code with clock 11 or 10 is read from an I/l spelling.
- `packages/domain/src/relatorio/reading-cells.ts` (+ `readings.test.ts`) -- P-4 finding 1: `blank` is `!isCellFilled(cell)` of the LIGAÇÃO SECUNDÁRIA cell (`relatorio/sheet-state.ts:33`), so a cell holding `{ state: 'empty' }` is blank as the comment says; red test first (that cell today reads blank false).

**Acceptance Criteria:**
- Given a transformer plate the model answered with its own "Dy1" and diagram facts whose labels the OCR did not return, when the plate reading job runs, then LIGAÇÃO SECUNDÁRIA is suggested "Dy1" in `verify` with the note "Lido do diagrama — confira", not lost.
- Given the printed Dyn1 plate answered with "Dyn1" citing its word and Yyn0 diagram facts, when the job runs, then "Dyn1" is stored `suggested` citing its word.
- Given any structured group value, when the job stores it and when the eval prints it, then both read the same kernel classification (an entry citing an unknown id is nothing in both).
- Given a transformer plate reading, when the fold runs, then one `reading vector diagram` log line gives its outcome and facts and no OCR text.
- Given a fake fixture with two values of one key, when the committed-fixtures test runs, then it fails.
- Given a plate printing "Dyn I" or "Dynl", when the cited run is read, then it prints Dyn1.

## Spec Change Log

## Review Triage Log

## Design Notes

- **R-1 reading.** "Cannot be cited" means: after keeping only the fact ids the OCR returned, none is left. Then the facts are ignored entirely (outcome `uncited`), so a model entry stays and goes through the existing path: a code citing words that print no group is a diagram read (`reading/build.ts`), `verify` with the note. A model entry that the kernel would drop anyway (unknown ids) stays dropped; no worse than before.
- **R-2 shape.** The classification is the kernel's statement of what the job stores for one value; the fold asks only "printed?", the eval prints the kind. `printedVectorGroups` stays exported for the parser-level tests.
- **"Dyn I" safety.** The connection letters are Y, N, D, Z, so a trailing I or l can never be a connection letter; today every such text reads null. Turning one trailing I or l (after a letter other than I or l) into "1" therefore changes no text the parser reads today and maps only to clock 1, never 11 or 10. Lower-case "i" and upper-case "L" stay null (not how plates print 1). The digit rule (`reading/assess.ts`) still sees no "1" in "Dyn I", so such a printed read is `verify` with its box: printed, not "Lido do diagrama".
- **P-4 re-read of e21g (`138ce5e1`, the three "Patched, not re-reviewed").** Read with the edge-case and verification-gap lenses:
  - D6 (`conclusion.ts:105`, nameplate enabled): the clause is the same predicate `ensaiosCounts` uses (`sheet-progress.ts:197`), tested with the plate off. No defect. Open reading for Matheus: with the plate sub-block off, a v11 ratio table that can never get its group no longer withholds "Aprovado · Sem restrições", although no VAL CALCULADO judges it (before the patch the suggestion was withheld, which the reviewer read as a dead end; the engineer can still pick the conclusion).
  - The jump's `:not(.ficha-suggestion)` (`use-ficha-steps.ts:81`): correct, and the excluded element cannot coexist with the target in the state D7 reaches (the field holds a value naming no group, so a pending group suggestion renders as a `ReplaceLine` tray inside the field, `nameplate-section.tsx:414-415`); verification gap: no test, none added (unreachable state). No defect.
  - `blank` (`reading-cells.ts:248`): its comment says "the `isCellFilled` rule", but the code differs on a cell value object `{ state: 'empty' }` (filled false, blank false). `sheet/nameplate` values are not shape-checked per field kind (`ops/apply.ts:392-395`, `value-limits.ts:138`), so an op can store it; the app's own writes never do. One defect, low; fixed red-first by using `isCellFilled`.
  - Count: 1 defect found and fixed; 1 open reading; 1 verification gap left (unreachable).

## Verification

**Commands** (inside the `fasor-e21a` stack from the worktree, `podman compose --profile tools run --rm --user root tools ...`; restart `api` after domain or api changes):
- `pnpm exec vitest run packages/domain/src/relatorio/vector-group.test.ts packages/domain/src/reading packages/domain/src/relatorio/readings.test.ts` -- green.
- `pnpm --filter @app/api exec vitest run src/jobs/reading/providers src/scripts` -- green.
- `pnpm --filter @app/api exec vitest run src/jobs/reading/job.integration.test.ts` -- green.
- `pnpm lint`, `pnpm static` -- clean.

**Red-first record (2026-11-06, the tests written before each fix, run on the baseline code):**
- Parser: the 8 "reads" rows of `e21a parseVectorGroup` (`"Dyn I" reads Dyn1`: expected undefined to be 'Dyn1') and the property test.
- Kernel: the 6 `vectorGroupReadOf` tests (`TypeError: vectorGroupReadOf is not a function`).
- P-4: `blank is the isCellFilled rule` (`vector_group {"state":"empty"}: expected false to be true`).
- R-1 provider: `expected undefined to deeply equal { key: 'ligacao_secundaria', ... }` (the "Dy1" entry dropped). R-1 job: `expected undefined to match object { value: 'Dy1', trust: 'verify', ... }` (no suggestion).
- R-2 provider: the accented "Dýn1" entry was replaced by the composed "Yyn0" (the old private rule skipped normalization). R-2 eval: `eval-group-read.test.ts` failed to load (no module; the baseline `groupRead` read "Dyn1" for an entry citing t99).
- R-3: `composed: expected [] to have a length of 1 but got +0` (no log line).
- R-4: the duplicate-key fixture parsed (`expected true to be false`); `fake.ts` imported `['./bedrock.ts']`.
- R-9 (test only): green on the baseline; mutation run with printed-wins disabled (`index >= 0 && false && isPrinted(...)`): red, `expected { ... } to match object { value: 'Dyn1', ... }`; restored, green.
- Note: `vectorGroupReadOf`'s `unparsed` kind carries the stored `value` (the eval prints it JSON-quoted); the spec's type listed `{ kind: 'unparsed' }` alone.
