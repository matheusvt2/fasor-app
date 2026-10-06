---
title: 'Story 11.6: Structure readings and write prose through Bedrock Converse'
type: 'feature'
created: '2026-10-05'
status: 'done'
baseline_commit: '3ab9a9249d90bda219aeec4e456222836f431f24'
route: 'dispatch'
review_loop_iteration: 1
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-11-7-textract-cloud-ocr.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `LLM_PROVIDER=bedrock` is a stub that fails permanently, so plate and panel structuring, vision captions and NC drafts only ever run on fixtures. On 2026-10-05 the account got Bedrock quota and Matheus made Claude Haiku 4.5 the reference model (`source-deltas.md`, last row).

**Approach:** Implement one Bedrock Converse adapter behind the existing `StructuringProvider` and `ProseProvider` interfaces. The model ids come from config, and the default is `global.anthropic.claude-haiku-4-5-20251001-v1:0`. Each run logs tokens and USD. Add a manual evaluation script that compares the candidates, and raise `MIN_CONTRACT_VERSION` to 14. Nothing in `pnpm verify` reaches AWS.

## Boundaries & Constraints

**Always:**
- Use Converse only, through `@aws-sdk/client-bedrock-runtime`, pinned exact at the same `3.1134.0` as the other `@aws-sdk` clients. Credentials come from the SDK default chain only. Set `maxAttempts: 1`, because pg-boss owns retries.
- Structured output goes through Converse tool use. The tool's input JSON Schema is derived from the field definitions, and the result is validated with `structuringResultSchema` / `proseResultSchema`. A schema failure is permanent.
- The model only cites `ocr_token_ids`. Boxes and trust stay server side (`build.ts`, `assess.ts`), unchanged.
- `prompt_version` constants live in the adapter, one for structuring and one for prose. USD is computed from a per-model price table in code, using the 2026-10-05 us-east-1 list prices.
- Defaults stay `fake`. The `AI_FEATURES=off` short-circuit stays first in the factory.

**Never:**
- No `anthropic` Console-key provider and no stored keys. Do not write the strings `ANTHROPIC_API_KEY`, `AWS_ACCESS_KEY` or `claude.ai` anywhere in `apps/api/src` (the `fake.test.ts` scan).
- No change to the `ocr.ts` / `prose.ts` contract shapes or to the exported OCR JSON Schema.
- No `terraform apply`, no deploy, and no production flag flip in this story.
- No client photos committed.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Plate happy path | image + OCR tokens + nameplate fields, injected client returns a tool_use block | `StructuringResult` with the model id, `prompt_version`, usage `{input_tokens, output_tokens, usd}` | N/A |
| Model cites an unknown token or key | tool input with `t999` or an extra key | Adapter passes it through; `build.ts` drops it as `unknown_token` / `unknown_key` | N/A |
| No tool_use / invalid JSON | text-only reply or schema mismatch | `PermanentReadingError`, run `failed` in one attempt | permanent |
| Throttling / 5xx / timeout | `ThrottlingException`, `ServiceUnavailableException`, abort | `ProviderError` / `ProviderTimeoutError` | transient, pg-boss retries |
| Access denied / bad model id | `AccessDeniedException`, `ValidationException`, `ResourceNotFoundException` | `PermanentReadingError` with the AWS error name | permanent |
| Caption / NC draft | image + kind + context | `ProseResult` `{text}` in pt-BR, or null when nothing applies | as above |

## Decisions (Matheus, 2026-10-05)

- **Evaluation data:** the script runs now on the synthetic plate and panel. The default stays Haiku 4.5. Choosing a cheaper default waits for real nameplate photos, which the script already accepts as a local folder of images plus expected-values files (gitignored, never committed).
- **Escalation:** a plate reading whose suggestions are more than half `verify` is retried once on `BEDROCK_ESCALATION_MODEL_ID` (default `us.amazon.nova-pro-v1:0`; empty disables it), and the better of the two results is kept: ~~fewer `verify`, ties go to the first~~ the one with more `suggested` values wins and a tie keeps the first (Matheus, 2026-10-05, review pass 1). A first reading with no suggestions at all also escalates (Matheus, 2026-10-05). A failed escalation call keeps the first reading. The predicate lives in `packages/domain`. The run row records the model that produced the kept result, with usage summed over both calls. Panel, caption and NC draft do not escalate.
- **Infra:** add the Bedrock model variables to the api env in `infra/production`, and narrow `infra/bootstrap/iam.tf` to Haiku 4.5, Nova Pro and the evaluation candidates by exact ARN. `terraform apply`, the deploy and `ai_features = "on"` are a post-merge step Matheus runs.
- **Uncited values (Matheus, 2026-10-05, after the live evaluation):** a value the model returns with an empty or missing `ocr_token_ids` is dropped by the adapter before validation and the rest of the reading continues; this narrows the matrix row "No tool_use / invalid JSON" for that one case. Evidence: the live run on the synthetic panel, where Textract found one word and Haiku 4.5 and Mistral Large 3 returned the block type uncited, so the whole reading failed.
- **Size:** the spec stays whole, about 2,100 tokens, accepted.

</frozen-after-approval>

## Code Map

- `apps/api/src/jobs/reading/providers/index.ts:47-113` -- `ReadingProviderOptions` and `createReadingProviders`. The `bedrock` branches at `:96-97,106-107` return stubs today. Add a `bedrock?: {client?, timeoutMs?, createClient?}` option, mirroring `textract`, with a lazily built shared client.
- `apps/api/src/jobs/reading/providers/textract.ts` -- the pattern to copy: the `TextractLike` seam `:31`, `create*Client` with `maxAttempts: 1` `:45`, the AbortController timeout `:157-167`, `classifyTextractError` `:126-137`, and the zod check on output `:172`.
- `apps/api/src/jobs/reading/providers/unimplemented.ts:11-26` -- remove the structuring and prose stubs, and drop the `'anthropic'` type.
- `apps/api/src/jobs/reading/providers/errors.ts` -- reuse `PermanentReadingError`, `ProviderError`, `ProviderTimeoutError`. Add no new classes.
- `packages/domain/src/contract/ocr.ts:132-194`, `contract/prose.ts:14-44` -- the input and output schemas, read only. `structuringValueSchemaFor(kind)` gives the per-kind value shape; field kinds are listed at `seed/schema.ts:17`.
- `apps/api/src/jobs/reading/kinds/{plate,panel,caption,nc-obs}.ts` -- the callers. Only `plate.ts` changes, for the escalation. `packages/domain/src/reading/assess.ts:53-64` sets each suggestion's `trust`, and `shouldEscalate` reads it.
- `apps/api/src/jobs/reading/job.ts:170-189,236-238` -- run row writes. Do not change.
- `apps/api/src/config.ts:43-54`, `config.test.ts:22-42` -- the `LLM_PROVIDER` enum; add the Bedrock settings here.
- `apps/api/src/main.ts:56-66` -- builds the factory and logs the providers.
- `packages/domain/src/contract/version.ts:91,105-141` and `contract.test.ts:88-90` -- the MIN bump and its dated rationale.
- `apps/api/src/jobs/reading/providers/fake.test.ts:214-221,305-313,315-328` and `job.integration.test.ts:498-520` -- tests that assert the stubs. The secret scan must keep passing.
- `apps/api/src/scripts/textract-read.ts` -- the pattern for a live script, including the credential flow in its header.
- `services/ocr/tests/fixtures/plate-transformador.{jpg,md,tokens.json}`, `apps/api/src/jobs/reading/fixtures/images/panel-seccionadora.png` and `fixtures/README.md:69,85` -- synthetic inputs with known values.
- `infra/bootstrap/iam.tf:17-50`, `infra/production/{variables.tf:41-66,ecs.tf:32-46}`, `docker-compose.yml:29`, `.env.example:17` -- wiring.

## Tasks & Acceptance

**Execution:**
- [x] `apps/api/package.json`, `pnpm-lock.yaml` -- add `@aws-sdk/client-bedrock-runtime@3.1134.0`, installing in the tools container only.
- [x] `apps/api/src/config.ts` and its test -- `LLM_PROVIDER` becomes `fake|bedrock`. Add `BEDROCK_REGION` (default `us-east-1`), `BEDROCK_MODEL_ID` (default the Haiku 4.5 global profile) `BEDROCK_PROSE_MODEL_ID` (defaults to `BEDROCK_MODEL_ID`) and `BEDROCK_ESCALATION_MODEL_ID` (default `us.amazon.nova-pro-v1:0`, empty disables).
- [x] `packages/domain/src/reading/escalate.ts` (new, exported) and its test -- `shouldEscalate(suggestions)` is true when more than half are `verify`; `betterReading(a, b)` keeps fewer `verify`, ties to `a`. Pure and kernel-owned (AD-1).
- [x] `apps/api/src/jobs/reading/kinds/plate.ts`, `providers/index.ts` -- the factory exposes an optional escalation structuring provider. The plate kind retries once through it when `shouldEscalate`, keeps `betterReading` and sums usage.
- [x] `apps/api/src/jobs/reading/providers/bedrock.ts` -- new. Contains `bedrockStructuringProvider` and `bedrockProseProvider`; the tool schema built from `FieldDef[]`; the prompts with `prompt_version`; `BEDROCK_PRICES` and `usdFor(modelId, usage)`; and the error classification per the matrix.
- [x] `apps/api/src/jobs/reading/providers/bedrock.test.ts` -- one test per matrix row, with an injected fake client. Assert the request carries the image bytes, the token list and the tool config, and that no real client is built.
- [x] `providers/index.ts`, `unimplemented.ts`, `fake.test.ts` -- route `bedrock`, drop the stubs, and replace the stub assertions with routing assertions.
- [x] `job.integration.test.ts` -- replace the stub rows with one `11.6-INT` test. `LLM_PROVIDER=bedrock` with an injected client reads a plate to `done` with suggestions and a run row carrying the model, `prompt_version` and usage. A permanent error ends `failed` in one attempt.
- [x] `packages/domain/src/contract/version.ts`, `contract.test.ts` -- set `MIN_CONTRACT_VERSION = 14` with a dated rationale.
- [x] `apps/api/src/scripts/bedrock-eval.ts` -- new manual script, never run by verify. For each model in `--models` and each image with an expected-values file, it runs OCR (Textract or the provider in config), then Converse. It prints per-model field accuracy, the share of valid citations, mean tokens and USD per reading. The header documents the credential flow.
- [x] `docker-compose.yml`, `.env.example` -- pass the Bedrock settings through; the defaults keep `fake`.
- [x] `infra/production/{variables.tf,ecs.tf,terraform.tfvars.example}` -- add `bedrock_model_id`, `bedrock_prose_model_id` and `bedrock_escalation_model_id` to `local.api_environment`, and drop the stale "anthropic" wording from the `llm_provider` message. `infra/bootstrap/iam.tf` -- replace the Bedrock wildcards with exact inference-profile and foundation-model ARNs for Haiku 4.5, Nova Pro, Nova 2 Lite, Qwen3 VL 235B and Mistral Large 3. `infra/README.md` -- the post-merge apply, deploy and flag steps. No apply.
- [x] `docs/kbs` concepts and `log.md` -- document the provider, the settings and the escalation.

**Acceptance Criteria:**
- Given `LLM_PROVIDER=bedrock` and an injected client, when a plate, panel, caption and NC-draft reading run, then each completes through the real adapter with usage and USD on its run row.
- Given a plate whose first Bedrock result is more than half `verify` and an escalation model configured, when the reading runs, then one escalation call is made, the result with fewer `verify` is kept, and the run row names that model with summed usage; with `BEDROCK_ESCALATION_MODEL_ID` empty no second call is made.
- Given `pnpm verify`, when it runs, then no test reaches AWS and the defaults stay `fake`.
- Given a `fasor-app` session, when Matheus runs the evaluation command printed in the PR body, then Haiku 4.5 and at least one cheaper candidate produce a comparison table (11.6-TEXTRACT-TOKENS: citations of Textract tokens are valid).

## Design Notes

Tool use rather than free JSON: Converse `toolConfig` with `toolChoice: {tool: {name}}` forces one structured block on every candidate (Claude, Nova, Qwen3 VL, Mistral Large 3). The adapter maps `toolUse.input` straight into `structuringOutputSchema`. The OCR tokens go to the model as `t<n>: text` lines, never with coordinates.

## Verification

**Commands:**
- `flock /tmp/fasor-verify.lock docker compose -p fasor-11-6 --profile tools run --rm tools pnpm verify` (with the main checkout's stack stopped; on this host `docker` is a podman shim) -- expected: all stages green.
- Live: run the evaluation script with `fasor-app` credentials -- expected: a table with rows for Haiku 4.5 and at least one cheaper candidate, recorded in the PR.

## Implementation Notes

- Pass 1 (2026-10-05, bmad-dev-opus-high): every task done. The stages passed one at a time on podman: unit 2855, api 499, e2e 191 of 191, lint and static. A single `pnpm verify` run did not fit the 4 GiB podman VM. Host workarounds were not committed: `--user 0`, an empty `/.dockerenv` mount, and node_modules volumes chowned to 1000.

- Passes 2 and 3 (2026-10-05): the pass-2 patches; the live evaluation with Textract and Converse on five models; uncited values dropped (Matheus). Gate on the patched tree, one stage at a time on podman: lint ok, static ok, test:api 503 of 503, test:e2e 190 of 191 (the one failure passed alone), test:unit 2848 of 2856 (the web failures came from overlapping load; four files passed alone; `theme.test.tsx` fails on the baseline too).

## Spec Change Log

## Review Triage Log

Pass 1 (2026-10-05). Layers: blind-hunter (BH), edge-case-hunter (EC), verification-gap (VG).

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| BH1, EC3 | `betterReading` keeps an escalation with fewer rows (0 rows beats 11) | high | `escalate.ts` compares raw `verify` counts. `plate.ts` keeps `escalated` whenever `betterReading` returns it, which drops the first reading's fields. | intent_gap, resolved by Matheus 2026-10-05: more `suggested` wins; fixed in place on his instruction |
| BH2, EC4 | A first reading with 0 suggestions never escalates | medium | `shouldEscalate([])` evaluates `0 > 0`, which is false. A reading with every value dropped is the least confident case. | intent_gap, resolved by Matheus 2026-10-05: zero suggestions escalates |
| BH3, EC1, EC2, VG gap, VG other 1 | A failed escalation call fails the reading and discards the good first one. The first call's usage is lost, and no test covers this. | high | `plate.ts` awaits `providers.escalation.structure` unguarded. `job.ts` records facts only when `run` returns. | patch: fall back to the first reading on any escalation error, and add the 11.6-INT test |
| BH4, VG other 2 | Usage of a call that fails after billing (no tool call, schema refusal) is not recorded | medium | `converseTool` computes usage and then throws. `recordRun` reads null facts. | defer (needs `job.ts`, which the spec keeps unchanged) |
| BH5, EC6 | An unpriced or mistyped model id crashes the api at boot even with `AI_FEATURES=off` | medium | `createReadingProviders` builds the bedrock providers before the aiOff check, and `assertPricedModel` throws. | patch: build the bedrock providers only when AI features are on |
| BH6 | MIN 14 refuses version-13 clients before the LLM is on | false | The epic and the context require 11.6 to raise MIN before a cloud LLM is wired. The 426 refusal is the intended path. | rejected |
| BH7 | The evaluation on real photos, and narrowing IAM to the chosen model, are not recorded as deferred | low | Only the KB says so; there is no `source-deltas.md` row. | patch: add the row and a deferred-work entry |
| BH9 | `.env.example` lacks `BEDROCK_ESCALATION_MODEL_ID`; the defaults are duplicated | low | `.env.example` lists three of the four variables. | patch `.env.example` only; duplication rejected (no named divergence) |
| BH9b | `infra/README.md` and `variables.tf` still say the flag "waits for Story 11.6" | low | The old text sits beside the new paragraph. | patch: strike it through, with the date |
| BH8 | The eval script does not measure the escalation pipeline | low | True, but adding it is new script logic. | rejected (low, not a direct correction) |
| BH10 | `BEDROCK_REGION = local.region`, while IAM and prices assume us-east-1 | low | `ecs.tf` diff | patch: pin `"us-east-1"` |
| BH11 | IAM keeps `InvokeModelWithResponseStream` | low | The adapter only sends `ConverseCommand`. | patch: drop the action |
| BH12 | The NC-draft prompt sends the `block_type` code, not its pt-BR label | medium | `prosePrompt` interpolates `block_type` as is. | patch: use the definition's label when it is found |
| BH13 | Missing tests: prose timeout and AWS errors, prose with AI off, version-13 refusal | low | Gaps in tests only. | rejected (low; additions, not corrections) |
| EC5 | A `max_tokens` truncation is reported as a schema mismatch | low | 2048 tokens is far above what 13 fields need. | rejected |
| EC7 | One failing sample aborts the whole eval | low | Dev-only script. | rejected (adds guards) |
| EC8 | An unknown expected key is silently counted as a wrong answer | low | `bedrock-eval.ts` | patch: throw on an unknown key |
| EC9 | An escalation model equal to the main model doubles the cost | low | The factory builds it regardless. | patch: no escalation when the two are equal |

Pass 2 (2026-10-05, after the pass-1 patches and Matheus's escalation decision). Layers: BH, EC, VG. VG: no gaps.

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| BH2-1 | The forced tool schema (`anyOf`, nullable type, `pattern`, `minItems`) is never tried on a real model | maybe-false | Only fakes answer it. Settle it with a live `bedrock-eval` run on Haiku 4.5 and Nova Pro. | live eval before PR (evidence) |
| VG-o, BH2-2, EC2-3/4 | A billed call that fails (no tool, schema refusal), first or escalation, is not counted in `llm_usage` | medium | `converseTool` throws after `usdFor`. The plate catch keeps `first.usage` only. | defer (the error must carry usage, and `job.ts` must write it) |
| BH2-3, EC2-2 | An empty first reading escalates even when OCR found no words, so the second call can cite nothing | low | `shouldEscalate([])` is true; `structuringPrompt` sends "(no words)". | patch: no escalation when `ocr.tokens` is empty |
| BH2-4 | `bedrock-eval` leaves out the escalation model (Nova Pro) | low | `CANDIDATES` has no `us.amazon.nova-pro-v1:0`. | patch: add it |
| BH2-5, BH2-6 | Eval accuracy ignores failures; prose is not evaluated | low | Script scope. | rejected (new logic) |
| BH2-7 | The panel test cannot prove the panel never escalates | false | `kinds/panel.ts` never reads `providers.escalation`; only `plate.ts` does. | rejected |
| BH2-8 | A test name states the old fewer-verify rule | low | `job.integration.test.ts` test title | patch: rename |
| BH2-9 | The new deferred-work entries lack `class` and `state` | low | The ledger header requires both. | patch: add them |
| BH2-10 | `version.ts` keeps "Stays 13 at contract 14" above `MIN = 14` | low | Comment block | patch: mark it superseded on 2026-10-05; the v13 refusal was rejected in pass 1 (carried) |
| BH2-11 | Default ids are copied in five places | low | carried from pass 1 (BH9) | rejected (carried) |
| BH2-12, EC2-6 | The same model through another profile id (`us.` vs `global.`, bare vs `us.`) escalates to itself | low | String compare in `index.ts`. Needs a deliberately odd config. | rejected |
| BH2-13 | Terraform does not check the model variables against the priced and allowed list | medium | A typo in tfvars passes `plan` and crash-loops the api (`assertPricedModel`). | defer (a validation list in `variables.tf`, kept in step with `BEDROCK_PRICES` and `iam.tf`) |
| BH2-14 | The spec is not in the diff | false | The diff file excluded it on purpose. The file exists in the worktree and goes into the commit. | rejected |
| EC2-1 | A block type with an empty nameplate gives an empty key enum | low | No plate capture targets those blocks; this predates the story for `fake` too. | rejected |
| EC2-5 | A Converse answer without a usage block records 0 silently | low | Converse always returns usage. | rejected |
| EC2-7 | The boot log names an escalation model that is disabled because it equals the main one | low | Cosmetic `main.ts` log | rejected |
| EC2-8, EC2-9 | Whitespace escalation id; a non-us-east-1 `BEDROCK_REGION` locally | low | Needs deliberate misconfiguration. | rejected |
| EC2-10 | `bedrock-eval --models` with an unpriced model aborts the whole run | low | Dev-only script | rejected |
| EC2-11, EC2-12 | The spec's Tasks/AC text still says "fewer verify"; `shouldEscalate([])` is true | false | The frozen Escalation decision was amended by Matheus on 2026-10-05 and wins over the task text. The fix would be a spec edit. | rejected |
| LIVE-1 | Live eval: a value with empty `ocr_token_ids` fails the whole reading (Haiku and Mistral on the panel) | high | `eval-live` 2026-10-05: panel-seccionadora, 1 Textract token, `too_small` on `values[1].ocr_token_ids` | intent_gap, resolved by Matheus 2026-10-05: drop the uncited value; patch |
| LIVE-2 | Live eval: Nova 2 Lite omits the required `confidence` and fails both readings | low | `eval-live` plate: `invalid_type` on `confidence` | rejected (the model ignores the required field; the evaluation records it as failed) |
| GATE-1 | `theme.test.tsx` fails in `test:unit` | false (for this story) | It fails alone on the baseline `3ab9a92` too, and the story touches no web file. | defer (pre-existing) |
| GATE-2 | e2e `E5-A2-E2E-002` (a timed tap, serial group) failed once in the full run | false | It passed alone right after. The full run overlapped with a subagent test run on the same 4 GiB VM. | rejected (load) |

### Review Findings

Independent review of the merged PR #88 (commit 78214cc), 2026-10-06: four layers (blind-hunter, edge-case-hunter, verification-gap, acceptance-auditor) over `10fe436..78214cc`, code and infra only. Decisions and patches below are open; Matheus chooses.

- [ ] [Review][Decision] Panel reading is weak on the default model: Haiku 4.5 returns the panel's block type uncited (the live run showed it), the adapter drops it, and the panel never escalates, so the reading ends with fewer suggestions or none. Options: panel-specific prompt, a stronger panel model, or accept an uncited value as `verify` with no box. [`providers/bedrock.ts` `withoutUncitedValues`, `kinds/panel.ts`]
- [ ] [Review][Decision] Cross-Region inference for client photos: the default `global.` Haiku profile can route inference to any Region. Options: keep `global.` (cheapest), use the `us.` profile (US only, about 10 % dearer, already priced in `BEDROCK_PRICES`), or record an LGPD decision first. "Pessoas na foto" photos are already kept from every model by `captionSkipReason`. [`config.ts` `DEFAULT_BEDROCK_MODEL_ID`]
- [ ] [Review][Decision] `betterReading` ties on `suggested` count and keeps the first reading, so an empty first reading is kept over an escalation that returned only `verify` rows, and the paid call is discarded. Options: leave the rule, or break ties by total rows. [`packages/domain/src/reading/escalate.ts`]
- [ ] [Review][Decision] The escalation is skipped when the OCR found no word (`ocr.tokens.length === 0`), which the frozen "zero suggestions escalates" decision does not say, and the rule lives in `apps/api`, not in the kernel. Options: record the exception in the decisions of record, or move it into `escalate.ts`. [`kinds/plate.ts`]
- [ ] [Review][Patch] `CredentialsProviderError` and `ExpiredTokenException` are classed permanent; on ECS a task-role credential hiccup should retry like a throttle. Move both to transient. [`providers/bedrock.ts` `PERMANENT_ERRORS`]
- [ ] [Review][Patch] A value with `ocr_token_ids: null` is not dropped as uncited and fails the whole reading permanently. Treat `null` like missing or empty. [`providers/bedrock.ts` `withoutUncitedValues`]
- [ ] [Review][Patch] `.gitignore` ignores `tfplan` only; `infra/production/*.plan` files (which embed generated secrets) show as untracked in a public repo. Ignore `*.plan` and `*.tfplan`. [`.gitignore`]
- [ ] [Review][Patch] No test shows the panel kind never escalates: the only test answers with a confident reading, which never triggers an escalation. Add a panel case with `confidence: 0.3` on both values and the escalation model answering, expecting `client.models` equal to `[HAIKU]`. [`job.integration.test.ts` `11.6-INT`]
- [ ] [Review][Patch] No job-level test for an empty first reading with OCR words present (Haiku `{values: []}`, Nova Pro answering the plate): expect `[HAIKU, NOVA_PRO]`, 11 suggestions, run-row model Nova Pro with summed usage. [`job.integration.test.ts` `11.6-INT`]
- [ ] [Review][Patch] The USD 100 ceiling policy asks for a cost estimate before an infra choice lands, and the PR has none. Add to `infra/README.md` the measured cost (about USD 0.005 a plate on Haiku, up to USD 0.009 with an escalation) and the monthly figure for an assumed volume. [`infra/README.md`]
- [x] [Review][Defer] Usage of a billed call that fails (no tool call, schema refusal), including a failed escalation, is not counted on `reading_runs.llm_usage`. [`kinds/plate.ts`, `providers/bedrock.ts`] -- deferred: carried from passes 1 and 2, already in `deferred-work.md`.
- [x] [Review][Defer] An escalated run row names one model but sums two calls' usage, so model plus price no longer reproduces the stored USD; per-call usage is missing. [`kinds/plate.ts`] -- deferred: same accounting change as the entry above (error carries usage, the run row keeps per-call usage).
- [x] [Review][Defer] The production task role also holds the evaluation candidates (Nova 2 Lite, Qwen3 VL, Mistral Large 3) through the shared policy. [`infra/bootstrap/iam.tf`] -- deferred: carried; it narrows after the evaluation on real photos.
- [x] [Review][Defer] Terraform does not validate the three `bedrock_*` model ids against the priced and allowed list; a typo crash-loops the api at boot. [`infra/production/variables.tf`] -- deferred: carried, already in `deferred-work.md`.

#### Rejected

- false: "Escalation latency doubles in one attempt": the reading job expires at 300 s (`READING_QUEUE_OPTIONS.expireInSeconds`) and two calls plus OCR take about 130 s at most.
- false: "The image mime is silently coerced to jpeg": `OcrImage.mime` is typed `image/jpeg | image/png` in the contract, so nothing else reaches `imageBlock`.
- false: "MIN_CONTRACT_VERSION 14 is premature": carried from pass 1; the bump is required before a cloud LLM is wired, and production is now wired.
- false: "The KB, source-deltas row and deferred-work entries are missing": they are in the commit; the review diff excluded `_bmad-output` and `docs/kbs` on purpose.
- false: "The live-evaluation AC has no evidence": the table is in the PR #88 body, as the AC says.
- false: "`build(second)` outside the try can lose the first reading": `buildReadingSuggestions` is pure and fails only on a bug, the same as the first `build`; no reachable input was shown.
- low, rejected: "IAM uses a Region wildcard, not an exact ARN": the wildcard is needed for cross-Region profiles and is explained in `iam.tf`.
- low, rejected: "The tool schema is hand-built, not derived with `structuringValueSchemaFor`": the keys come from the fields and the result is checked by `structuringResultSchema` after the call.
- low, rejected: "Uncited drops leave no log": the fix needs a logger in the adapter; it folds into the panel decision above.
- low, rejected: "Defaults copied in five places; empty means off only for the escalation model": carried from pass 1.
- low, rejected: "OCR words go into the prompt unescaped": the tool choice is forced and the answer is validated; there is no action surface.
- low, rejected: "Empty `fields` gives `enum: []`", "missing `usage` or `max_tokens` is not flagged": carried from pass 2, no reachable case.
- rejected: "Infra wiring (`ecs.tf`, `docker-compose.yml`) has no test", "`bedrock-eval.ts` has no test": infrastructure as code and a manual script, by design.
