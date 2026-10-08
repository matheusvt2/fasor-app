---
title: 'Review fixes 2026-10-08: plate reading units and bare years, one AWS error and timeout layer (batch r8read)'
type: 'bugfix'
created: '2026-10-08'
status: 'in-progress'
baseline_revision: 'e48774182082e511099a1f1365f99958ae8350d8'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/review-fixes-2026-10-08-context.md'
warnings: ['batched', 'multiple-goals']
batched_reason: 'The coordinator cut the plate-reading findings of the 2026-10-08 review into one batch (r8read): AIR-1, AIR-V1, PLN-13 in the kernel reading rules and AIR-17/API-1 with the C4 AWS layer (API-3, API-V2) in apps/api, fixed together for one story gate.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** (AIR-1) A plate number printed in another unit of the field's quantity is stored under the field's unit with its raw digits: "13.800 V" on the kV field `tensao_nominal_at` becomes `{raw: 13800, unit: kV}` (`packages/domain/src/reading/value.ts:81-86`), Verificar when the model names the unit, and trusted `suggested` when it gives `unit: null`, because the digit rule passes. (AIR-V1) A bare-year plate date ("2012", 20 of 32 plates of the delivered job) is dropped as `invalid_shape` (`value.ts:88-89`, `value.test.ts:62`) and the Bedrock prompt asks for `YYYY-MM` (`apps/api/src/jobs/reading/providers/bedrock.ts:210`), inviting an invented month. (PLN-13) A typed year over a suggested date is refused (`packages/domain/src/relatorio/suggestion-group.ts:155-158`) while the empty field accepts it (`parsePlateDateText`). (AIR-17/API-1) Textract classes `CredentialsProviderError` and `ExpiredTokenException` permanent (`textract.ts:50-62`) while Bedrock retries them (`bedrock.ts:254-264`), so a credential hiccup fails a plate reading for good; the timeout and the classifier exist twice, the audit imports `reading/providers` internals (`apps/api/src/jobs/audit/provider.ts:6-7`), builds a second Bedrock client (`apps/api/src/main.ts`), and records a denied or misconfigured call as `invalid_output` (`audit/job.ts:53-58`, API-V2).

**Approach:** Kernel: an SI unit layer (`parseSiUnit`, `convertReadingUnit`) that moves a printed value into the field's unit by decimal shift; `normalizeReadingValue` reads the unit printed in the cited tokens, converts, cross-checks the model raw against the pt-BR parse of the printed number, and returns the printed text so the digit rule still reads what the plate prints; dates go through the plate-date parse so a bare year is kept as printed. Server: a new `apps/api/src/ai/` module (`classifyAwsError`, `callWithTimeout`, the error classes, the Converse client layer) used by Bedrock, Textract and the audit, credential errors transient everywhere, one Bedrock client per process, and a `ProviderRefusedError` the audit records as `provider_refused`.

## Boundaries & Constraints

**Always:**
- Verify each finding against the code before fixing (all five reproduced in planning, see Design Notes); every fix gets a test that fails before it.
- Kernel functions are pure and live in `packages/domain`; `apps/api` and `apps/web` call them, never re-derive a unit, a factor or a date rule.
- The digit rule (Story 8.5 AC 1) keeps reading the printed raw text: a converted value is never checked against its converted digits.
- A bare year is stored as the string `"YYYY"`, exactly the shape the typed path stores (Story 13.4, `parsePlateDateText`); the sheet and the document already print it as is (`dateFieldText`, `ficha.ts:264`).
- `reading/providers/errors.ts` and `reading/providers/bedrock.ts` keep re-exporting the moved names, so reading code, scripts and tests keep compiling; the audit imports only from `apps/api/src/ai/`.
- The 11-6 and 11-7 spec rows that the classification change contradicts are struck through with a dated note (`~~...~~ *(2026-10-08, r8read: ...)*`), never deleted; the KB concept `docs/kbs/architecture/suggestions-and-reading.md` and `docs/kbs/log.md` are updated in the same change.

**Never:**
- No `MIN_CONTRACT_VERSION` raise. No `CONTRACT_VERSION` raise either: a suggestion value is any JSON and a cell already holds `"2012"` since Story 13.4, so no sync shape changes (if implementation finds a shape that does change, stop and report it as an open question).
- No change to `packages/domain/src/contract/ocr.ts` or the committed OCR JSON Schema (the date and unit rules live in `reading/value.ts`); so no sidecar build.
- No plausibility ranges (AIR-2), no "380/220" handling (waits for Bruno), no label-anchor A/kA swap (AIR-3), no usage-on-billed-failures or `InvalidOutputError` split beyond `ProviderRefusedError` (rest of report 3.6), no change to what a reading with zero suggestions stores (r8cap's contract).
- Do not edit `e2e/support/**`, `playwright.config.ts`, `scripts/` (r8gate's files), `sprint-status.yaml` or `epics.md`. No `.only`.
- Never build container images.

## I/O & Edge-Case Matrix

Number fields (`normalizeReadingValue`, then `assessReadingValue`); "tokens" are the cited tokens' texts in token order.

| Scenario | Field unit; model value; tokens | Stored value; trust |
|---|---|---|
| V on a kV field | kV; `{raw:'13800', unit:'V'}`; `13.800` `V` | `{raw:'13.8', unit:'kV'}`; suggested |
| Model drops the unit | kV; `{raw:'13800', unit:null}`; `13.800` `V` | `{raw:'13.8', unit:'kV'}`; suggested (unit read from the tokens) |
| Model copies pt-BR thousands | kV; `{raw:'13.800', unit:'V'}`; `13.800` `V` | `{raw:'13.8', unit:'kV'}` (the printed pt-BR number wins); verify |
| MVA on a kVA field | kVA; `{raw:'1.5', unit:'MVA'}`; `1,5` `MVA` | `{raw:'1500', unit:'kVA'}`; suggested |
| kVA on a VA field | VA; `{raw:'0.5', unit:'kVA'}`; `0,5` `kVA` | `{raw:'500', unit:'VA'}`; suggested |
| kA on an A field | A; `{raw:'1.25', unit:'kA'}`; `1,25` `kA` | `{raw:'1250', unit:'A'}`; suggested |
| Same unit, other case | kVA; `{raw:'500', unit:'KVA'}`; `500` `KVA` | `{raw:'500', unit:'kVA'}`; suggested |
| Other quantity | kVA; `{raw:'500', unit:'V'}`; `500` `V` | `{raw:'500', unit:'kVA'}`; verify (today's rule) |
| Unknown unit text | kV; `{raw:'15', unit:'kVef'}`; `15` `kVef` | `{raw:'15', unit:'kV'}`; verify |
| Model and print disagree on unit | kV; `{raw:'13.8', unit:'kV'}`; `13.800` `V` | `{raw:'13.8', unit:'kV'}`; verify |
| Unit stuck to the number | kV; `{raw:'13800', unit:'V'}`; `13.800V` | `{raw:'13.8', unit:'kV'}`; suggested |
| No unit anywhere | kV; `{raw:'15', unit:null}`; `15` | `{raw:'15', unit:'kV'}`; suggested (unchanged) |
| Wrong digit after conversion | kV; `{raw:'13900', unit:'V'}`; `13.800` `V` | converted `13.9`; verify (digit rule on the printed raw) |
| Two numbers in the tokens | A; `{raw:'200', unit:'A'}`; `200-5` `A` | no pt-BR cross-check (ambiguous); digit rule as today |
| Voltage class in V | voltage_class kV; `'13.800 V'`; `13.800` `V` | `'13,8'`, then the registry rule (verify unless registered); the digit rule reads `13.800 V` |

Dates (`normalizeReadingValue`, `parseFieldInput`):

| Scenario | Input | Result |
|---|---|---|
| Bare year from the model | `'2012'`, token `2012` | `'2012'`; suggested |
| Month and year as printed | `'08/2024'` or `'2024-08'` | `'2024-08'` (unchanged) |
| Year out of shape | `'12'`, `'20120'`, `'agosto de 2012'` | `invalid_shape` (dropped, as today) |
| Typed year over a suggestion (PLN-13) | field text `2019` with `{now}` | `{ok: true, value: '2019'}`; a typed `1850` or next year + 2 is `{ok: false}` (F-22 range, `plateDateAccepted`) |
| Digit runs typed over a suggestion | `15032019`, `032019` | `'2019-03-15'`, `'2019-03'` (same as the empty field) |

AWS errors (`classifyAwsError`):

| Error | Bedrock | Textract |
|---|---|---|
| `CredentialsProviderError` (no `$fault`), `ExpiredTokenException` | transient `ProviderError` | transient `ProviderError` (was permanent) |
| Throttles, quotas, `$fault: 'server'`, network, unknown non-client | transient | transient |
| `AccessDeniedException`, `UnrecognizedClientException`, `InvalidSignatureException`, `ValidationException`, `ResourceNotFoundException`, any other non-retryable client fault | `ProviderRefusedError` (permanent) | `ProviderRefusedError` (permanent) |
| Textract document faults (`InvalidParameterException`, `UnsupportedDocumentException`, `BadDocumentException`, `DocumentTooLargeException`, `InvalidS3ObjectException`) | n/a | `PermanentReadingError` |
| Bedrock model-side transients (`ModelNotReadyException`, `ModelErrorException`, `ModelTimeoutException`, `ServiceQuotaExceededException`) | transient | n/a |
| No answer within the timeout | `ProviderTimeoutError` | `ProviderTimeoutError` |

</intent-contract>

## Code Map

- `packages/domain/src/reading/value.ts` -- `normalizeReadingValue(field, value)` (number branch :81-86, date :88-89, `isValidIsoDate`); `readingValueText`. Callers: `reading/build.ts:84-90`, `apps/api/src/scripts/bedrock-eval.ts:154` (`isRight`), `reading/escalate.ts` (doc only).
- `packages/domain/src/reading/assess.ts:53-59` -- digit rule `digitCoverage(readingValueText(field, value), cited)`; `verify` input.
- `packages/domain/src/reading/digits.ts` -- `digitsOf`, `digitCoverage`, `inTokenOrder`.
- `packages/domain/src/relatorio/reading-cells.ts:170-192` -- `shiftDecimal(raw, exp)` (exact decimal move; reuse, import from here or move it into the new units module and re-export it here), `convertRatioUnit` (leave as is).
- `packages/domain/src/parse/pt-br-number.ts` -- `parseDecimalPtBr` (pt-BR thousands and decimal rules) for the printed-number cross-check.
- `packages/domain/src/format/datetime.ts:144-171` -- `parsePlateDateText` (accepts `YYYY`, `mm/aaaa`, `dd/mm/aaaa`, ISO, digit runs); `packages/domain/src/checks/plate-date.ts` -- `plateDateAccepted(value, now)` F-22 range.
- `packages/domain/src/relatorio/suggestion-group.ts:147-170` -- `parseFieldInput(field, text)`; date branch uses `parseCalendarDate` (PLN-13). Tests in `relatorio/suggestions.test.ts:300-319`.
- `apps/web/src/surfaces/ficha/nameplate-suggestions.tsx:237-241` -- `type()` calls `parseFieldInput`; `apps/web/src/clock.ts` `now()` is the app clock (see `ficha-fields.tsx:23,321`). `read-display.tsx:611` also calls `parseFieldInput` (number targets only; no change needed).
- `apps/api/src/jobs/reading/providers/bedrock.ts` -- prompt `STRUCTURING_SYSTEM` (:200-213), `BEDROCK_STRUCTURING_PROMPT_VERSION`, pricing/`usdFor`/`assertPricedModel` (:64-91), `BedrockLike`/`bedrockClientSource`/`BedrockProviderOptions` (:93-130), classifier (:250-277), `ConverseCall`/`converseTool` (:286-330).
- `apps/api/src/jobs/reading/providers/textract.ts` -- classifier sets (:49-65), `classifyTextractError` (:125-138), timeout (:157-168).
- `apps/api/src/jobs/reading/providers/errors.ts` -- error classes; re-exported by `providers/index.ts:10`.
- `apps/api/src/jobs/reading/providers/index.ts:62-119` -- `ReadingProviderOptions.bedrock`, one `bedrockClientSource` per factory.
- `apps/api/src/jobs/audit/provider.ts` -- imports `reading/providers` (:6-7); `createAuditProvider` builds its own source (:119-135). `apps/api/src/jobs/audit/job.ts:27,53-58` -- `AUDIT_ERROR_CODES`, `errorCodeOf` (r8emit owns this file in wave 2: touch only the import, the new code and its branch).
- `apps/api/src/main.ts:60-86` -- `createReadingProviders(config)` and `createAuditProvider(config)`: two Bedrock clients.
- Tests: `providers/bedrock.test.ts`, `providers/textract.test.ts:193-215` (permanent table incl. the two credential rows to flip), `audit/audit.test.ts`, `http/audit.integration.test.ts:39-40` (imports), `reading/value.test.ts`, `reading/assess.test.ts`, `reading/build.test.ts`.
- Fixtures: `apps/api/src/scripts/make-plate-fixtures.ts:95-110` (tp plate rows; generator, run in the tools container), `apps/api/src/jobs/reading/kinds/plate.ts:64-65` (tp sha), `apps/api/src/jobs/reading/fixtures/README.md` (tp row of the synthetic plates table), `providers/fake.test.ts:147-175`, `job.integration.test.ts:289-311`.
- E2E pattern: `e2e/plate-every-type.spec.ts` (tp: cabine `Geradores`, `openSheetOfType`, import through "Fotografar placa" with `getUserMedia` rejected), `e2e/plate-reading.spec.ts`; the suggested field is `#ficha-nameplate [data-field-key=K] .field.suggestion-field` with `data-state="suggested|verify"` (`nameplate-suggestions.tsx:377`).
- Docs: `_bmad-output/implementation-artifacts/spec-11-7-textract-cloud-ocr.md:55` (Client fault row lists "a credentials-provider error"), `spec-11-6-structure-readings-on-bedrock.md:179`; `docs/kbs/architecture/suggestions-and-reading.md:17,21`; `docs/kbs/log.md`.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/reading/units.ts` (new, exported through `reading/index.ts`) -- `parseSiUnit(text): {prefix: number; base: string} | null` for the bases the seed uses (`V`, `A`, `VA`, `Ω`/`ohm`, `L`, `%`; base matched ignoring case, `Ω`/`ohm` and `µ`/`μ`/`u` variants) and the prefixes `µ m k M G T` (`k`/`K` kilo; `M` mega; `m` milli; trailing `.` ignored); `convertReadingUnit(raw, from, to): string | null` (same base, decimal shift by the prefix difference via `shiftDecimal`, `raw` unchanged for an equal factor, null when either unit is unknown or the bases differ) -- the SI conversion of AIR-1, one kernel home.
- `packages/domain/src/reading/value.ts` -- `normalizeReadingValue(field, value, cited = [])`: number: read the printed number and unit from the cited tokens' texts (exactly one number run -> `parseDecimalPtBr`; the unit is the non-number remainder when it parses with `parseSiUnit`); source unit = printed unit, else the model unit; a model unit that parses and differs from a printed one, a model raw that differs numerically from the printed pt-BR number (then the printed number is used), or an unconvertible differing unit ask for `verify`; convert into `field.unit`; return `printedText` (the text the digit rule must read: the model raw before conversion, or the voltage text as given). Voltage class: accept `<number> <volt unit>` and convert to kV before `parseVoltageClassKv`. Date: `YYYY` kept as is, else `parseCalendarDate` as today (no digit runs from the model). Update the header comment. -- AIR-1, AIR-V1.
- `packages/domain/src/reading/assess.ts` -- `AssessReadingInput.printedText?: string`; the digit rule reads it when present, else `readingValueText(field, value)`. `reading/build.ts` -- pass `cited` (in token order) to `normalizeReadingValue` and `printedText` to `assessReadingValue`. -- keep the digit rule on the printed raw.
- `packages/domain/src/relatorio/suggestion-group.ts` -- `parseFieldInput(field, text, options?: {now?: Date})`: date via `parsePlateDateText`, refused when `options.now` is given and `plateDateAccepted` fails; update the doc comment. `apps/web/src/surfaces/ficha/nameplate-suggestions.tsx` -- pass `{ now: now() }` from `../../clock.ts`. -- PLN-13 (closes `deferred-work.md` entry at ~:1366: mark it closed with the date and this batch).
- Kernel unit tests: `reading/units.test.ts` (every row of the matrix's conversions, unknown units, case, `µ` variants), `reading/value.test.ts` (every number and date row; the old `'2012'` invalid case becomes valid), `reading/assess.test.ts` / `reading/build.test.ts` (a converted value stays `suggested` with printed digits; `13900` on printed `13.800` is `verify`), `relatorio/suggestions.test.ts` (PLN-13 rows).
- `apps/api/src/ai/errors.ts` (new) -- the error classes moved from `reading/providers/errors.ts` (which re-exports them) plus `ProviderRefusedError extends PermanentReadingError` (`name = 'ProviderRefusedError'`).
- `apps/api/src/ai/aws.ts` (new) -- `classifyAwsError(service: string, error: unknown, rules?: {permanent?: ReadonlySet<string>; transient?: ReadonlySet<string>}): Error` per the AWS matrix (shared refused and credential/throttle sets, service extras through `rules`, message `${service}: ${name}: ${message}`, `cause` kept); `callWithTimeout<T>(label, timeoutMs, call: (signal: AbortSignal) => Promise<T>, classify: (error: unknown) => Error): Promise<T>` (abort -> `ProviderTimeoutError(`${label}: no answer within ${timeoutMs} ms`)`, timer always cleared).
- `apps/api/src/ai/bedrock.ts` (new) -- the Converse client layer moved from `reading/providers/bedrock.ts`: `BEDROCK_PRICES`, `usdFor`, `assertPricedModel`, `BEDROCK_DEFAULT_REGION`, `BEDROCK_TIMEOUT_MS`, `BedrockConverseOutput`, `BedrockLike`, `createBedrockClient`, `BedrockClientSource`, `bedrockClientSource`, `BedrockProviderOptions`, `ConverseCall`, `converseTool` (through `callWithTimeout` and `classifyAwsError('bedrock', ...)`), `classifyBedrockError`. `reading/providers/bedrock.ts` keeps prompts, tool schemas, `imageBlock` and the providers, and re-exports the moved names.
- `apps/api/src/jobs/reading/providers/bedrock.ts` -- prompt: date line "exactly as precise as printed: YYYY for a year alone, YYYY-MM for a month and year, YYYY-MM-DD for a day; never add a month or a day the plate does not print"; number line adds "a plate's 13.800 is 13800 and 1,5 is 1.5"; bump `BEDROCK_STRUCTURING_PROMPT_VERSION` to `bedrock-structuring-2`. -- AIR-V1 prompt.
- `apps/api/src/jobs/reading/providers/textract.ts` -- `classifyTextractError` = `classifyAwsError('textract', error, {permanent: TEXTRACT_INPUT_ERRORS})`; the read uses `callWithTimeout`. -- AIR-17/API-1.
- `apps/api/src/jobs/reading/providers/index.ts`, `apps/api/src/jobs/audit/provider.ts`, `apps/api/src/main.ts` -- `ReadingProviderOptions.bedrock.source?` and `AuditProviderOptions.bedrock.source?` (a given `BedrockClientSource` is used as is); `main.ts` builds one source when `LLM_PROVIDER=bedrock` and AI features are on and passes it to both; the audit imports only `../../ai/*`. -- API-3.
- `apps/api/src/jobs/audit/job.ts` -- import errors from `../../ai/errors.ts`; add `'provider_refused'` to `AUDIT_ERROR_CODES` and `if (error instanceof ProviderRefusedError) return 'provider_refused'` before the `PermanentReadingError` branch. -- API-V2.
- Server tests: `apps/api/src/ai/aws.test.ts` (the AWS matrix for both services, `callWithTimeout` timeout/clear/classify); `textract.test.ts` flip the two credential rows to transient and assert `ProviderRefusedError` on the refused rows; `bedrock.test.ts` prompt version and date/number prompt lines, refused rows; `audit/audit.test.ts` an `AccessDeniedException` run records `provider_refused`; a test that `createReadingProviders` and `createAuditProvider` given one source build one client; update moved imports in `audit.test.ts` and `http/audit.integration.test.ts`.
- Fixture: `apps/api/src/scripts/make-plate-fixtures.ts` tp rows -> `tensao_nominal_at` tokens `['13.800', 'V']`, value `num('13800', 'V')`; `data_fabricacao` tokens `['2020']`, value `'2020'`; regenerate in the tools container (`podman compose --profile tools run --rm --user root tools pnpm exec tsx apps/api/src/scripts/make-plate-fixtures.ts`), keep only the tp image and JSON changes (restore any other regenerated file byte-for-byte with git if its sha moved), update the tp sha in `kinds/plate.ts`, the README tp row, and add to `job.integration.test.ts` an assertion that the tp fallback reading stores `tensao_nominal_at` `{raw:'13.8', unit:'kV', state:'measured'}` `suggested` and `data_fabricacao` `'2020'` `suggested`.
- `e2e/plate-units-years.spec.ts` (new, `@p1`, parallel group) -- tp sheet (cabine `Geradores`), import `plate-tp.png` through "Fotografar placa" (camera rejected), no "Sincronizar agora", no server-op seeding; wait for the reading; assert TENSÃO NOMINAL AT shows `13,8` with `data-state="suggested"` and DATA FABRICAÇÃO shows `2020` `suggested`; Confirmar on AT writes an outbox nameplate put `{raw:'13.8', unit:'kV', state:'measured'}`; typing `2019` + Enter over the date suggestion writes the put `'2019'` and discards the suggestion (PLN-13); reload keeps both values. -- E8-A6.
- Docs: strike the credentials clause of `spec-11-7-textract-cloud-ocr.md:55` and amend `spec-11-6-structure-readings-on-bedrock.md:179` with a dated note; update `docs/kbs/architecture/suggestions-and-reading.md` (the `ai/` layer, credential errors transient, units and bare years, prompt version 2) and append a line to `docs/kbs/log.md`.

**Acceptance Criteria:**
- Given a tp plate printing "13.800 V" for TENSÃO NOMINAL AT and "2020" for DATA FABRICAÇÃO, when it is read under the fake providers, then the sheet shows "13,8" kV and "2020", both Sugerido, and confirming writes `{raw:'13.8', unit:'kV'}` and `'2020'`.
- Given the Textract or Bedrock SDK throws `CredentialsProviderError` or `ExpiredTokenException`, when a reading attempt runs, then the attempt fails transient and pg-boss retries it.
- Given the audit's Bedrock call is denied (`AccessDeniedException`), when the audit runs, then the run is `failed` with `error: 'provider_refused'`.
- Given `LLM_PROVIDER=bedrock`, when the api boots, then reading and audit share one lazily built Bedrock client, and `apps/api/src/jobs/audit/` imports nothing from `jobs/reading/providers/`.
- Given a pending date suggestion, when the engineer types "2019", then the field stores "2019"; when they type "1850", then the invalid helper shows and nothing is written.

## Spec Change Log

## Review Triage Log

## Design Notes

Reproduced in planning on `e487741`: `normalizeReadingValue({kind:'number',unit:'kV'}, {raw:'13800',unit:'V',state:'measured'})` returns `{raw:'13800',unit:'kV'}` with `verify: true` (with `unit: null`, `verify: false`, and `digitCoverage('13800', ['13.800','V'])` is true, so trusted); `value.test.ts:62` pins `'2012'` as `invalid_shape`; `parseFieldInput(date, '2012')` is `{ok:false}`; `textract.test.ts:200-202` pins both credential errors permanent while Bedrock's `TRANSIENT_CLIENT_ERRORS` holds `ExpiredTokenException` and `CredentialsProviderError` (no `$fault`) falls through to transient; `errorCodeOf` maps every `PermanentReadingError` to `invalid_output`.

Why the printed pt-BR number wins over the model raw on a disagreement: the model is told to drop thousands separators, but "13.800" copied as raw `13.800` is a valid dot decimal (13.8) that would convert to 0.0138 kV and still pass the digit rule. The kernel parses the printed run with the same pt-BR rule the typed path uses; on disagreement it keeps the printed number and marks Verificar.

PLN-13 was a product call in `deferred-work.md` (~:1366); the coordinator's launch prompt settles it with AIR-V1 (a bare year is a valid suggestion, so a typed bare year over one is valid too).

Cross-batch: `r8emit` (wave 2) imports `classifyAwsError`, `callWithTimeout`, the error classes and the Converse layer from `apps/api/src/ai/`; `AUDIT_ERROR_CODES` gains `provider_refused`.

## Verification

**Commands:**
- `podman compose --profile tools run --rm --user root tools pnpm test:unit -- packages/domain/src/reading packages/domain/src/relatorio/suggestions.test.ts` -- green
- `podman compose --profile tools run --rm --user root tools pnpm --filter @app/api exec vitest run src/ai src/jobs/reading/providers src/jobs/audit` -- green (the api suite needs the compose Postgres and MinIO up for integration files)
- Story gate: `pnpm lint`, `pnpm static`, `pnpm test:unit`, `pnpm test:api`, then under the host lock `pnpm exec tsx scripts/e2e.ts e2e/plate-units-years.spec.ts e2e/plate-every-type.spec.ts e2e/plate-reading.spec.ts --project desktop-chrome --project durability-desktop-chrome`.
