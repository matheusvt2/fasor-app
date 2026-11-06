---
title: 'e21f: the drawn vector diagram is described by the model and composed by the kernel (Story 21.2 fix)'
type: 'bugfix'
created: '2026-11-05'
status: 'done'
baseline_revision: 'fdc1992455b328f255c6876207f9db4f97b7c668'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-21-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-e21r-ratio-vector-group.md'
warnings: ['batched']
batched_reason: 'One fix batch for the Epic 21 integrated review: the coordinator paid eval found the drawn Yyn0 plate read as Dy1 3 of 3; prompt, kernel, providers and fixtures change together.'
deferred:
  - summary: >-
      The eval's "(diagram)" marker in bedrock-eval.ts groupRead has no test.
    evidence: |-
      groupRead is not exported and no test imports apps/api/src/scripts/; the script runs only as the paid eval, read by a person.
    location: >-
      apps/api/src/scripts/bedrock-eval.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** With prompt `bedrock-structuring-3` and the production model (`global.anthropic.claude-haiku-4-5-20251001-v1:0`) the drawn plate `apps/api/src/jobs/reading/fixtures/images/plate-transformador-yyn0.png` (two stars, X0 at the LV centre, no H0, X1 aligned with H1: Yyn0) was read as "Dy1" 3 of 3 (coordinator's paid eval, 2026-11-05). Direct probes show the model perceives the diagram right but composes the code wrong; asked for structured facts it gave `{hv_shape: star, hv_neutral: false, lv_shape: star, lv_neutral: true, x1_hours: 0}` 5 of 5. Story 21.2's AC "the reading identifies the group also from the drawn diagram" is not met.

**Approach:** The model describes the drawing (`vector_diagram` facts in the structuring tool input) and a pure kernel function composes the code; the provider folds the composed code into the group field's structured value before the contract parse, so the existing diagram path of `reading/build.ts` (verify, "Lido do diagrama — confira", full-image box) is unchanged. Prompt `bedrock-structuring-4`.

## Boundaries & Constraints

**Always:**
- `composeVectorGroup(facts)` in `packages/domain/src/relatorio/vector-group.ts` (exported through `index.ts`): HV letter star Y, delta D, zigzag Z; LV y, d, z; N/n only on a star or zigzag whose neutral is drawn; then `x1_hours`; returns the code only when it is one of the 47 `VECTOR_GROUP_CODES`, else null. A delta with a neutral, an hour outside 0-11 or a non-integer, an unknown shape, a combination not in the table: null.
- Tool schema (only when `vectorGroupKey` is set and names one of the fields): a top-level `vector_diagram` of type `["object","null"]` with `hv_shape`, `lv_shape` (enum star | delta | zigzag), `hv_neutral`, `lv_neutral` (boolean: H0 / X0 printed at that winding's centre), `x1_hours` (integer 0-11: with H1 at 12 o'clock, the hour X1 points to), `ocr_token_ids` (array of `^t\d+$`: the diagram's terminal labels), all six required inside the object. Wording follows the probe that worked (Design Notes). With no `vectorGroupKey` the schema is byte-identical to today's.
- Prompt: the 21.2 paragraph keeps the 47 codes and the printed-code sentence; the drawn-diagram sentence becomes "When no code is printed, leave <key> out of values and fill vector_diagram instead: describe what is drawn, never compose the code." `BEDROCK_STRUCTURING_PROMPT_VERSION = 'bedrock-structuring-4'` with its comment line; every test pinning `bedrock-structuring-3` moves to 4.
- The fold (api side, one function used by both the bedrock and the fake structuring providers, before `withoutUncitedValues` and the contract parse): strips `vector_diagram` from the tool input always (`structuringOutputSchema` is strict); a group entry already in `values` whose value parses (`parseVectorGroup`) and whose cited OCR tokens print a group (the kernel's `printedVectorGroups` rule of `reading/build.ts`) wins and the diagram is ignored; otherwise, when the diagram validates and composes, the group entry becomes `{key, value: <code>, ocr_token_ids: <diagram ocr_token_ids>, confidence: 0.5}` (replacing a non-printed entry); a null, malformed or uncomposable diagram changes nothing else.
- The composed value goes through the existing path: cited terminal labels print no group, so `buildReadingSuggestions` makes it `verify`, `ocr_token_ids: []`, bbox `[0,0,1,1]`, note "Lido do diagrama — confira". A diagram citing no token is dropped by `withoutUncitedValues` as today (the e21r deferred row stays open).
- `LLM_PROVIDER`/`OCR_PROVIDER` fake in every test; no paid call; no emoji; English code and comments.

**Never:**
- Never change `packages/domain/src/contract/ocr.ts`, the committed OCR schema, `CONTRACT_VERSION` or `MIN_CONTRACT_VERSION` (StructuringOutput is unchanged; the facts never leave the provider).
- Never run `apps/api/src/scripts/bedrock-eval.ts` (paid).
- Never change the seed, the web UI, the printed plate fixtures' (`plate-transformador-dyn1.png`, the default transformer plate) structuring answers, or any PNG.
- Out of scope: the integrated review's notes N-1 to N-5.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| drawn Yyn0 (fake) | fixture `values` without the group, `vector_diagram` star/false/star/true/0 citing the 7 terminal labels | suggestion "Yyn0", `verify`, `ocr_token_ids: []`, bbox full, note | - |
| printed Dyn1 + diagram | `values` "Dyn1" citing token "Dyn1", diagram composes Yyn0 | "Dyn1" kept, `suggested`, diagram ignored | - |
| composed by the model + diagram | `values` "Dy1" citing "H1", diagram Yyn0 | entry replaced by "Yyn0" citing the diagram labels -> `verify` | - |
| unparsed entry + diagram | `values` "Y" (v9/v10 text), diagram Yyn0 | replaced by "Yyn0" | - |
| diagram null / absent | `vector_diagram: null` | tool input unchanged but for the stripped key | - |
| diagram uncomposable | delta with `hv_neutral: true`, or `x1_hours: 4` on star/star | no group entry added; an existing entry kept | - |
| diagram malformed | `x1_hours: 12`, missing key, wrong type | ignored like null | never a permanent failure |
| diagram uncited | `ocr_token_ids: []` | entry added then dropped by `withoutUncitedValues` (no suggestion) | - |
| no vectorGroupKey | panel or other plate, `vector_diagram` present | stripped, ignored | - |
| compose | each of the 47 codes from its facts | that code | - |

</intent-contract>

## Code Map

- `packages/domain/src/relatorio/vector-group.ts:104-150` -- `VECTOR_GROUP_CODES`, `BY_CODE`, `parseVectorGroup` (HV letters YN/ZN/D/Y/Z, LV lowercased); add `composeVectorGroup` and its facts type (`WindingShape`, `VectorDiagramFacts`) next to the parser. Tests in `vector-group.test.ts` (describe blocks `21.1-UNIT`, `21.2-UNIT`).
- `packages/domain/src/reading/build.ts:139-151` -- private `printedVectorGroups(ordered)`; export it (and from the domain index if `reading/build.ts` is reached through another barrel, check how `buildReadingSuggestions` reaches `@app/domain`) for the fold and the eval. Do not change its behavior.
- `apps/api/src/jobs/reading/providers/bedrock.ts:66-70,111-140,174-199,237-265` -- prompt version, `structuringToolSchema(fields)` (gains the optional `vectorGroupKey` argument), `PlateStructuringInput`, `vectorGroupPrompt`, `structuringPrompt`, `withoutUncitedValues`, `bedrockStructuringProvider.structure` (call order: fold, then `withoutUncitedValues`, then `structuringResultSchema.safeParse`).
- `apps/api/src/jobs/reading/providers/vector-diagram.ts` (new) -- the fold (e.g. `withVectorDiagram(input: unknown, key: string | undefined, tokens: readonly OcrToken[]): unknown`), its zod facts schema (lenient: unknown extra keys stripped, never strict-failing the reading), the JSON schema fragment for the tool, and `PlateStructuringInput` if moving it avoids a cycle (re-export from `bedrock.ts`, tests import from there).
- `apps/api/src/jobs/reading/providers/fake.ts:42-50,183-194` -- `fakeReadingFixtureSchema.structuring` is `structuringOutputSchema` (strict): accept `vector_diagram` (`values` + optional nullable `vector_diagram`), then `structure(input)` folds with `(input as PlateStructuringInput).vectorGroupKey` and `input.ocr.tokens` and parses with `structuringOutputSchema`; a fixture that fails is a `PermanentReadingError`.
- `apps/api/src/jobs/reading/kinds/plate.ts:94-99` -- already passes `vectorGroupKey`; no change expected.
- `apps/api/src/scripts/make-plate-fixtures.ts:30-37,59-66,206-219,286-297` -- the Yyn0 row `citeDiagram: ['H1']` with value 'Yyn0': write the fixture's `vector_diagram` (star/false/star/true/0, citing every diagram label H1 H2 H3 X1 X2 X3 X0) instead of a group entry in `values`; update the header comment. Regenerate only `transformador_forca_yyn0` in the tools container and check the PNG and its sha are unchanged (only `fixtures/2a69ba085bdcb89951e4a36353ed0d5d542e0e234816a18fa8252514476c3ebd.json` changes). If the PNG bytes change, keep the committed PNG and hand-edit the JSON to match the script's output instead.
- `apps/api/src/jobs/reading/fixtures/README.md` -- the Yyn0 fixture line: it carries `vector_diagram`, no group value.
- `apps/api/src/jobs/reading/job.integration.test.ts:340-362,1024-1125,1209,1225-1226` -- the 21.2 fake test (drawn plate now through `vector_diagram`; assert the fixture's `values` has no `ligacao_secundaria`); the bedrock-path tests' prompt pins; the converse stub (`converse(byModel)`, line 1036) for a new bedrock-path case.
- `apps/api/src/jobs/reading/providers/bedrock.test.ts:256-287` -- prompt version and 21.2 prompt tests.
- `apps/api/src/scripts/bedrock-eval.ts:62-67,246-251` -- comment to `bedrock-structuring-4`; `groupRead` marks a group whose cited tokens print no group as `<code> (diagram)`.
- `_bmad-output/implementation-artifacts/deferred-work.md:2950-2966` -- e21r rows; the eval row names `bedrock-structuring-3`.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/relatorio/vector-group.ts`, `vector-group.test.ts` -- `composeVectorGroup`; tests: all 47 codes round-trip from facts derived in the test (decompose each code: HV letter and N, LV letter and n, hour); delta with `hv_neutral` or `lv_neutral` true -> null; hours -1, 12, 1.5, NaN -> null; star/star hour 1 (not a table row) -> null; unknown shape -> null.
- `packages/domain/src/reading/build.ts` -- export `printedVectorGroups` unchanged.
- `apps/api/src/jobs/reading/providers/vector-diagram.ts` (new) + `vector-diagram.test.ts` -- the fold and schemas; unit tests for every matrix row that does not need the job.
- `apps/api/src/jobs/reading/providers/bedrock.ts`, `bedrock.test.ts` -- schema gains `vector_diagram` with `vectorGroupKey`; prompt sentence; version 4; the provider folds before `withoutUncitedValues`. Tests: the schema has `vector_diagram` only with the key; the prompt paragraph; a Converse answer with `values` lacking the group and a Yyn0 `vector_diagram` returns a StructuringResult whose group entry is "Yyn0" citing the labels and no `vector_diagram` key; printed wins; null diagram.
- `apps/api/src/jobs/reading/providers/fake.ts` -- fixture schema and fold as in the Code Map.
- `apps/api/src/scripts/make-plate-fixtures.ts`, the Yyn0 fixture JSON, `fixtures/README.md` -- as in the Code Map.
- `apps/api/src/jobs/reading/job.integration.test.ts` -- 21.2 fake test asserts the fixture path; one bedrock-path test: the converse stub answers the drawn plate's tool input with a Yyn0 `vector_diagram` (and a wrong "Dy1" entry citing "H1") -> the stored suggestion is "Yyn0", `verify`, `ocr_token_ids: []`, `prompt_version: 'bedrock-structuring-4'`; every `bedrock-structuring-3` pin -> 4.
- `apps/api/src/scripts/bedrock-eval.ts` -- as in the Code Map; do not run it.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- the e21r eval row: strike `bedrock-structuring-3` and write `bedrock-structuring-4` beside it, dated; a new heading "Deferred from: Epic 21 fix batch e21f (2026-11-05)" with the row "before the deploy: the coordinator reruns `bedrock-eval.ts` with `bedrock-structuring-4`; the drawn Yyn0 plate must read Yyn0" plus any narrowing. `docs/kbs/architecture/kernel-and-seed.md`: append to the 21.1/21.2 note one dated sentence (the model describes the diagram, `composeVectorGroup` composes it); `docs/kbs/log.md` one line.

**Acceptance Criteria:**
- Given the drawn Yyn0 plate's fake fixture (facts, no group value), when the plate reading job runs, then LIGAÇÃO SECUNDÁRIA is suggested "Yyn0" in `verify`, citing no token over the whole image, with the note "Lido do diagrama — confira".
- Given a Bedrock answer carrying a wrong composed "Dy1" and the Yyn0 facts for the drawn plate, when the job runs through the bedrock provider (stubbed client), then the stored suggestion is "Yyn0" in `verify` with `prompt_version` `bedrock-structuring-4`.
- Given the printed Dyn1 plate, when it is read with or without diagram facts, then "Dyn1" stays `suggested` citing its word.
- Given any of the 47 codes, when its facts are composed, then the code comes back; impossible facts give null and suggest nothing.

## Spec Change Log

## Review Triage Log

### 2026-11-05 — Review pass
- layers: Edge Case Hunter and Verification Gap Reviewer (opus); Blind Hunter and Intent Alignment skipped (token economy; the integrated epic review covers them).
- verdicts: 9 findings — high 0, medium 0, low 8, false 1, maybe-false 0
- findings:
  - `[low]` `[patch]` EC: diagram facts citing an id the OCR did not return made the composed entry drop as `unknown_token` (and replace a model entry first) — the fold now cites only the labels the OCR returned (deduplicated); none left is uncited and dropped next; tests.
  - `[low]` `[patch]` EC: `printsItsGroup` skipped unknown cited ids, so a printed entry the kernel then drops beat a composable diagram — any unknown cited id makes it not printed; test.
  - `[low]` `[reject]` EC: the plate prints a group but the model leaves it out of values and fills the diagram — against the prompt, still `verify` with the note, and the fix adds a whole-OCR scan branch.
  - `[low]` `[patch]` EC: an entry whose words print another group ("Dy1" citing "Dyn1") was kept over the diagram — printed now means the cited words print the entry's own code (the kernel's `printed.has(code)`); test.
  - `[low]` `[patch]` EC: the fake failed permanently on a fixture diagram citing no token where bedrock drops it — the fake applies `withoutUncitedValues` after the fold; `fake.test.ts` case.
  - `[false]` `[reject]` EC claim: "impossible facts suggest nothing" while a model's own entry survives — the spec's matrix row "diagram uncomposable: an existing entry kept" and Design Notes define exactly this; the AC speaks of the composition.
  - `[low]` `[defer]` VG: the eval's "(diagram)" marker has no test — the script has no harness and runs only as the paid eval; `deferred-work.md` row.
  - `[low]` `[patch]` VG other: same root cause as the second EC row (unknown ids in printed-wins), grouped.
  - `[low]` `[patch]` VG other: same root cause as the fake uncited row, grouped.

## Design Notes

- The tool schema follows the 5-of-5 probe (`req-facts.json` of the coordinator's scratchpad): `vector_diagram` sits in the top-level `required` list with type `["object","null"]`, so the model always answers it, null when a code is printed. The launch prompt says "optional"; required-nullable is the shape that was measured, and the fold accepts it absent too. Descriptions, verbatim from the probe: object "Only when the plate prints no vector group code and draws the winding diagrams; null otherwise. Describe what is drawn; do not compose the code."; `hv_shape` "The high-voltage (H1 H2 H3) diagram: star = three arms from one centre point; delta = a closed triangle; zigzag = a star whose arms bend."; `hv_neutral` "true only when H0 is printed at the high-voltage star centre."; `lv_shape` "The low-voltage (X1 X2 X3) diagram, same shapes."; `lv_neutral` "true only when X0 is printed at the low-voltage centre."; `x1_hours` "With the H1 arm (or corner) at 12 o'clock, the clock hour the X1 arm (or corner) points to: same direction 0, opposite 6, each 30 degrees clockwise one hour."; `ocr_token_ids` "The OCR ids of the diagram's terminal labels."
- Why the fold lives in the provider and not in `buildReadingSuggestions`: `StructuringOutput` is a contract type (strict, exported as the OCR JSON Schema); carrying the facts past the provider would change `contract/ocr.ts` and drag in the sidecar gate (E8-A4). The fold produces an ordinary structured value, so build, assess, the hint, the escalation choice and the device are unchanged.
- Confidence 0.5 for a composed value is inert: the server ignores the model's confidence (`reading/digits.ts` header).
- A model-composed entry with no diagram facts keeps today's handling (a diagram read, `verify`): conservative, listed in the PR.

## Verification

**Commands (inside the batch stack from the worktree; `podman compose --profile tools run --rm --user root tools ...`):**
- `pnpm exec vitest run packages/domain/src/relatorio/vector-group.test.ts packages/domain/src/reading` -- green.
- `pnpm --filter @app/api exec vitest run src/jobs/reading/providers` -- green (the provider unit files).
- `pnpm --filter @app/api exec vitest run src/jobs/reading/job.integration.test.ts` -- green (needs the batch stack's Postgres and MinIO up; restart `api` first).
- `pnpm lint`, `pnpm static` -- clean.
- The orchestrator runs `podman compose restart api`, then test:unit, test:api and the touched e2e specs under the host lock.

## Auto Run Result

Status: done (orchestrated fix batch e21f; the PR is opened by the orchestrator, not merged).

- **Change:** the structuring tool asks a transformador de força plate for the drawn diagrams' facts (`vector_diagram`: shapes, neutrals, X1's hour, terminal labels; prompt `bedrock-structuring-4`); `composeVectorGroup` (kernel) composes the code; `withVectorDiagram` (api) folds it into the group's structured value before the contract parse in both the bedrock and the fake providers, so the e21r diagram path (`verify`, no token, whole image, "Lido do diagrama — confira") is unchanged. A printed code citing words that print that same group wins. No contract change.
- **Files:** `relatorio/vector-group.ts` (+ test), `reading/build.ts` (`printedVectorGroups` exported), `providers/vector-diagram.ts` (new, + test), `providers/bedrock.ts` (+ test), `providers/fake.ts` (+ test), the Yyn0 fixture JSON and `make-plate-fixtures.ts` (PNG unchanged), fixtures README, `job.integration.test.ts`, `bedrock-eval.ts` ("(diagram)" marker), `deferred-work.md`, KB note and log, the Epic 21 integrated review report.
- **Review:** 9 findings (8 low, 1 false): 6 patched in one loop by the orchestrator (4 distinct fixes: diagram cites only known labels; an unknown cited id makes an entry not printed; printed means its words print its own code; the fake drops uncited values), 1 deferred (the eval marker has no test harness), 2 rejected (a printed group the model leaves out of values against the prompt stays `verify` with the note; the "suggest nothing" claim is the matrix's defined behavior).
- **Follow-up review:** false (no high or medium patched; patched counts: low 4 fixes).
- **Verification:** story gate on `a8f22c0b` under the host lock (wait 1120 s, load 5.15 at the start, 3.99 at the end; the coordinator's integrated gate ran on the main stack before it): lint, static green; test:unit 361 files, 5204 tests; test:api 108 files (1 skipped), 865 tests (4 skipped); e2e `plate`, `plate-reading`, `plate-every-type`, `seed-v11` on desktop-chrome and durability-desktop-chrome 22 of 22; total 817 s.
- **Residual risks:** the fix is exercised on stubbed Converse answers and the fake fixture only; the coordinator's paid eval with `bedrock-structuring-4` decides it ("before the deploy" row).
