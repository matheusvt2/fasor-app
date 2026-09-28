---
title: 'Stories 8.4 and 8.5: Run the reading job end to end, accept a digit only when the OCR saw it'
type: 'feature'
created: '2026-09-27'
status: 'in-progress'
baseline_revision: '842bb34c25ddeb5cfa47fd4cc40cbac35f76f52c'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
warnings: ['batched', 'oversized']
batched_reason: 'Batch R of the Epic 8 delivery: 8.5 (digit coverage, registry check) is the verdict step inside 8.4 job emission; one server-side surface, one fixture, one integration test.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** A plate photo with `reading_kind` reaches the server and nothing reads it: there is no `reading` queue, no provider switch, no `reading_run` record, no reread route, and no server rule that stops a digit the OCR never saw from being offered as `suggested`.

**Approach:** On file receipt (and on `POST /api/photos/{id}/reread`) enqueue one pg-boss `reading` job and mark the photo `running`. The job orients the `print` variant, calls the env-selected OCR and structuring providers, turns every value into a pending `suggestion` whose trust and hint come from pure kernel rules (digit coverage, registries), and records each attempt as a `reading_runs` row. Fixture-driven `fake` providers keep every test off-cloud.

## Boundaries & Constraints

**Always:**
- Kernel owns every verdict (AD-1/AD-13). The new folder `packages/domain/src/reading/` holds digits, value normalization, trust/hint, box normalization, the plate target schema and the pure suggestion builder. `apps/api` only fetches, calls providers, writes ops and rows.
- Server ops go through `applyOps(db, companyId, ops, {origin: 'server', now})`, actor `system:reading`, `device_id: SERVER_DEVICE_ID`, scope `relatorio`. The discards, creates and final `reading_status` op of one successful run are ONE `applyOps` call sharing one `batch_id`.
- Reading status transitions, written only by `system:reading`: device create `queued` → `running` (receipt or reread) → `done` | `failed`; a reread from `done`, `failed` or `running` goes to `running` again.
- Digit rule (Story 8.5 AC 1), for every kind, even a value without digits: `digitsOf(readingValueText(field, value)) === digitsOf(cited tokens' text joined in token-array order)`, where `digitsOf` keeps `0-9` only. Otherwise the trust is `verify`. The rule runs on the server and ignores any trust or confidence the model sends.
- `readingValueText`: `number` gives its `raw`; `date` gives the pt-BR display (`formatCalendarDate`, e.g. `2024-08` → `08/2024`); `voltage_class` gives its kV text (`15`, `17,5`); everything else gives the string.
- Value normalization (`normalizeReadingValue(field, value)`, after `structuringValueSchemaFor(kind)`). An invalid value is dropped and logged, never emitted:
  - `number`: `raw` must match `/^-?\d+(\.\d+)?$/` and is kept as given. The unit becomes `field.unit ?? null`, and a model unit that differs from it (case-insensitive) makes the value `verify`. The state becomes `measured`.
  - `date`: a valid ISO month or day.
  - `select`: an option, matched by `normalizeRegistryName`, and stored as the option.
  - `voltage_class`: `parseVoltageClassKv` is not null.
  - `text` and `manufacturer`: whitespace collapsed, not empty.
- Registries (Story 8.5 AC 2) use the company's live `registry` entities (`removed_at` null):
  - A `voltage_class` value with no registry row of equal kV gives `verify`. A match stores the registry row's `name`.
  - A `manufacturer` value that `wordRowByName` does not find gives `suggested` (unless the digit rule says `verify`) plus `hint = {create_registry_entry: {kind: 'manufacturer', name: value}}`. A match stores the registry name and sets `hint: null`.
- Suggestion row: `mode` is `replace` when the target cell `isCellFilled`, else `fill`. `source.bbox` is the union of the cited tokens' boxes divided by the width and height of the image sent, clamped to [0,1] and rounded to 4 decimals. `source.ocr_token_ids` holds the cited ids in array order. `prompt_version` comes from the structuring result. The row validates against `suggestionRowSchema`.
- Values are dropped and logged when they cite a token id absent from the OCR result, use a key not among the target's nameplate fields, or have an invalid shape. A field without a value gets no suggestion.
- Before emitting, the job discards (`suggestion/{id}/status = discarded`) every suggestion of that relatório with `status = pending` and `source.photo_id = photo.id`.
- Image: fetch the `print` variant from storage. When the original's EXIF orientation (sharp `metadata().orientation`) is 2 to 8, apply that orientation to the print bytes, re-encoding in the same format with no EXIF. The OCR provider and the structuring step receive the same bytes, and boxes normalize over their width and height. Close the 8.3 deferred orientation entry.
- Attempts: pg-boss queue `reading`, policy `stately`, `singletonKey = readingSingletonKey(photoId, kind)` = `${photo_id}:${reading_kind}`, `retryLimit: 2`, `retryBackoff: true`, `retryDelay: 5`, `retryDelayMax: 60`, `expireInSeconds: 300`. The worker takes these as options so tests can shrink them.
  - A transient error on attempt `retryCount < retryLimit` rethrows, and pg-boss retries.
  - On the last attempt, or on a permanent error, the job emits `reading_status = failed` and returns without throwing.
- Permanent errors: `ProviderNotImplementedError`, no fake fixture for the sha, a sidecar 413 or 422, a missing print variant, and a photo, relatório or block that is missing, removed or mismatched.
- Every attempt, successful or failed, inserts one `reading_runs` row. Each log line carries `company_id`, `relatorio_id` and `job_id`, the pg-boss id.
- Providers by env. Both default to `fake` and compose keeps `fake`. `createReadingProviders(config)` returns `(ctx: {photo_sha256}) => {ocr: OcrProvider, structuring: StructuringProvider, ocr_name}`:
  - `OCR_PROVIDER`: `fake` or `ocr-svc`. `textract` is an unimplemented stub.
  - `LLM_PROVIDER`: `fake`. `anthropic` and `bedrock` are stubs whose `structure()` throws `ProviderNotImplementedError`.
  - No code reads an Anthropic or AWS credential.
- Fake fixtures: `apps/api/src/jobs/reading/fixtures/<photo sha256>.json` = `{outcome?: 'ok'|'error'|'timeout' (default ok), ocr?: OcrReadResult, structuring?: StructuringOutput}`, validated by a zod schema. `error` throws a transient provider error and `timeout` a transient `ProviderTimeoutError`, both at once, never sleeping. The fake structuring result is `model: 'fake'`, `prompt_version: 'fake-1'`, zero usage. The fixtures directory is a constructor option; the default resolves from `import.meta.dirname`.
- `ocr-svc` adapter:
  - Sends a `POST` to `OCR_SERVICE_URL + OCR_SERVICE_ROUTES.read.path` with the raw bytes and `content-type` set to the mime.
  - Refuses a body over `OCR_READ_MAX_BYTES` before sending.
  - Aborts after 60 s (an injectable timeout) with `ProviderTimeoutError`.
  - A 200 is parsed by `ocrReadResultSchema`. A 413 or 422 is permanent. A 5xx, a network error or a body that does not parse is transient.
- Cross-tenant: every lookup is scoped by the session's or the payload's `company_id`. Another company's photo id answers exactly like an unknown id.

**Never:**
- No UI and no `apps/web` change: "Criar ⟨nome⟩?", the `verify` rendering, "Tentar novamente" and the plate tile belong to batch P.
- No new op family and no `CONTRACT_VERSION` bump. A new error code is avoided too; the existing ones are reused.
- No edit to the Playwright or Vitest config, `scripts/e2e.ts` or `e2e/support` (batch T).
- No real model call, no network access in tests except the stub server, and no Python run on the host.
- No reading of kinds other than `plate`. Receipt enqueues only `plate`, and other kinds stay `queued` (narrowing).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error handling |
|---|---|---|---|
| Plate receipt | device photo create `reading_kind: plate`, `reading_status: queued`, `reading_target: {block_id, block_type}`; first `PUT /api/files/{id}` | job sent; `file/{id}/reading_status = running`, then `done`, with 11 pending suggestions (fixture README) | none |
| Idempotent PUT retry | same PUT again after `running` or `done` | no second job, no status op | none |
| No reading | photo `reading_kind: null` or a non-plate kind | no job, no status op | none |
| Enqueue unavailable | route built without a queue | upload succeeds, status stays `queued`, a log line is written | never 500 |
| Typed first | target cell filled before the run | that suggestion has `mode: replace` | none |
| Fixture `error` / `timeout` | fake outcome | 3 attempts, 3 `reading_runs` rows, `failed`, no suggestion | transient |
| No fixture / stub provider / no print variant | - | 1 attempt, `failed` | permanent |
| Reread | `POST /api/photos/{id}/reread`, own uploaded plate photo | `202 {photo_id, reading_status: 'running'}`, a new run; previous pending rows of the photo discarded | - |
| Reread, not ours or unknown | other company's id, unknown id, bad uuid, non-photo | `404 not_found`, byte-identical bodies, nothing enqueued | - |
| Reread, not readable | photo without `reading_kind` | `400 invalid_request` | - |
| Reread, not uploaded | `uploaded_at` null | `409 not_caught_up` | retry after sync |
| Sidecar | 200 / 422 / 413 / 500 / hang / garbage | parsed / permanent / permanent / transient / timeout / transient | - |

</intent-contract>

## Code Map

- `apps/api/src/http/files.ts` -- `PUT /api/files/:id`. After the variants block, when `row.kind === 'photo' && row.reading_kind === 'plate' && row.reading_status === 'queued'` (read from `stored`, the re-read row), call `deps.enqueueReading?.(payload)`, then emit the `running` op as `system:reading`. `emitServerOp` is hardwired to `FILES_ACTOR` and to the `uploaded_at | variants` fields: generalize it with an actor parameter or share a helper with the new route.
- `apps/api/src/http/app.ts` -- mirrors `enqueueGenerate` (`AppOptions.enqueueGenerate`, `boss`); add `enqueueReading`, and mount the new reading routes.
- `apps/api/src/jobs/generate/worker.ts` -- the pattern for an idempotent `ensure…Queue`, `send` and `work({batchSize: 1})`. Use `includeMetadata: true` to read `retryCount` and `retryLimit` (pg-boss 12.33, `JobWithMetadata`). A `send` that returns null means a job is already queued for the key; treat it as success.
- `apps/api/src/main.ts` -- registers the generate worker when `WORKER=1`; the reading worker registers there too, with providers built from `config`.
- `apps/api/src/config.ts:25-28` -- `LLM_PROVIDER` (fake, anthropic, bedrock), `OCR_PROVIDER` (fake, textract, ocr-svc), `OCR_SERVICE_URL`; keep the enums.
- `apps/api/src/storage/s3.ts` (`getObject`), `packages/domain` `objectKey(company, kind, id, variant, relatorioId)` -- the print and original keys, derived exactly as `files.ts` derives them.
- `apps/api/src/db/schema.ts` -- add a `reading_runs` table, then `pnpm db:generate` → `apps/api/drizzle/0004_*.sql` (guarded by `migrations-match.test.ts`). Also delete its rows in `db/seed.ts` `resetTestCompanyData` and in `db/test-cleanup.ts` `dropCompany`.
- `apps/api/src/db/reset-company-jobs.ts` -- already matches `data->>'company_id'`, so the payload uses `company_id`.
- `apps/api/src/log.ts` -- `log` and `logError` take `company_id`, `relatorio_id` and `job_id`.
- `packages/domain/src/contract/ocr.ts` -- `OcrProvider`, `StructuringProvider`, `structuringOutputSchema`, `structuringValueSchemaFor`, `OCR_SERVICE_ROUTES`, `OCR_READ_MAX_BYTES`, `ocrContractJsonSchema()`.
- `packages/domain/src/relatorio/suggestions.ts` -- the device rules: `compareSuggestion`, `parseFieldInput` (the date and select patterns to mirror), `suggestionValueText`.
- `packages/domain/src/registry/word-row.ts` (`parseVoltageClassKv`), `registry/instrument-row.ts:88` (`wordRowByName`), `text/normalize-name.ts`, `relatorio/sheet-state.ts` (`isCellFilled`), `seed/definitions.ts` (`getDefinition(seed_version, 'cabine_primaria', block_type).nameplate`), `ops/path.ts` (`suggestionPath`, `suggestionStatusPath`, `sheetNameplatePath`, `filePath`).
- `packages/domain/src/schemas/entities.ts:388-408,449-475` -- the photo reading fields (`reading_target` is untyped JSON), `suggestionRowSchema`, `suggestionHintSchema`. Registry rows: entity `registry` with `row.kind` set to `manufacturer` or `voltage_class`.
- `apps/api/src/sync/suggestion.integration.test.ts` -- how an api integration test signs in, pushes a standard-template relatório (`instantiateTemplate`, `standardTemplate`) and reads `entities`; copy its helpers. `http/files.integration.test.ts` has the cross-tenant pattern and the PUT helpers.
- `services/ocr/tests/fixtures/plate-transformador.{jpg,tokens.json,md}` -- the plate is 1600 x 1100 (its print variant keeps that size) with 43 tokens `t0..t42`. The value tokens: t4 `TR-01`, t6 `Celtta`, t9 `240815-07`, t11 `TSE-500/15`, t15 `EPÓXI`, t18 `0`, t19 `L`, t22 `500`, t23 `kVA`, t26 `3`, t29 `08/2024`, t33 `15`, t34 `kV`, t38 `380`, t39 `V`, t42 `Dyn1`.
- `services/ocr/app/main.py:25-26,54` and `services/ocr/tests/test_api.py` -- `READ_MAX_BYTES` and the route literals the deferred 8.3 entry assigns here. The Dockerfile copies `contract/` into the runtime image.
- `_bmad-output/implementation-artifacts/deferred-work.md:814-830,884-890` -- the 8.3 literals and orientation entries (close them), and the "Criar ⟨nome⟩?" entry (move its owner to batch P, which renders it).

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/reading/{digits,value,assess,boxes,target,build}.ts` + `index.ts` (export from the domain barrel) -- `digitsOf`, `digitCoverage(valueText, citedTokens)`, `readingValueText`, `normalizeReadingValue`, `assessReadingValue({field, value, cited, registry: {manufacturers, voltageClasses}}) → {value, trust, hint}`, `normalizeBox`, `unionBox`, `plateReadingTargetSchema` (`{block_id: uuidV7, block_type: string}`, passthrough), `plateReadingTarget(blockId, blockType)` (the builder batch P uses), `readingSingletonKey`, `buildReadingSuggestions({relatorioId, photoId, runId, block, ocr, image, output, promptVersion, registry, newId}) → {rows: SuggestionRow[], dropped: {key, reason}[]}` -- the pure core of 8.4 and 8.5.
- `packages/domain/src/reading/*.test.ts` -- Story 8.5's three-case test (an extra digit, a missing digit and an exact match, each on a text value and a number value); date and voltage-class digit text; token order independent of cite order; each normalization rule; the voltage class in and out of the registry; the manufacturer in and out of it (the hint and the canonical name); `mode` replace; bbox union and rounding; each drop reason. Plus `buildReadingSuggestions` over the committed fixture, asserting the README table.
- `packages/domain/src/contract/ocr.ts` + `scripts/export-ocr-schema.ts` output -- add a top-level `"x-ocr-service": {routes: {read: '/read', health: '/health'}, read_max_bytes: OCR_READ_MAX_BYTES}` to `ocrContractJsonSchema()`, then regenerate `services/ocr/contract/ocr-contract.schema.json` with `pnpm schema:ocr`.
- `services/ocr/app/main.py`, `services/ocr/tests/test_api.py` -- read the max bytes and both paths from `contract/ocr-contract.schema.json` instead of literals. This closes deferred 8.3 #1.
- `apps/api/src/db/schema.ts` + migration -- `reading_runs(id uuid pk, company_id uuid not null, photo_id uuid not null, relatorio_id uuid, reading_kind text not null, job_id text, attempt int not null, outcome text not null ('ok'|'error'), error text, ocr_provider text not null, ocr_result jsonb (normalized boxes; null on failure), model text, prompt_version text, llm_usage jsonb, duration_ms int not null, created_at timestamptz not null)`, indexed on `(company_id, photo_id)`. Also the test-reset and dropCompany deletes.
- `apps/api/src/jobs/reading/providers/{errors,fake,ocr-svc,unimplemented,index}.ts` -- as in Boundaries.
- `apps/api/src/jobs/reading/image.ts` -- `readingImage({print, printMime, orientation}) → {bytes, mime, width, height}`.
- `apps/api/src/jobs/reading/job.ts` -- `runReadingJob(deps, payload, {jobId, attempt, lastAttempt})`. Payload: `{company_id, photo_id, reading_kind}`.
  - Load the photo, relatório and block (`plateReadingTargetSchema`, `block.relatorio_id === photo.relatorio_id`, not removed) and the registries.
  - Build the image, call both providers, check `ocr.image` against the sent width and height (a mismatch is transient), and call `buildReadingSuggestions`.
  - Apply one batch: the discards, the creates and `reading_status = done`. Insert the run row, then log.
- `apps/api/src/jobs/reading/worker.ts` -- `READING_QUEUE`, `ensureReadingQueue`, `enqueueReading(boss, payload, options)`, `registerReadingWorker(boss, deps, {queue?, queueOptions?, workOptions?})`.
- `apps/api/src/jobs/reading/fixtures/` -- `a1eac9106f186a29ca82e896741922794eda7f86a231c4dcf942031d14dc26ac.json`: the ocr is the 43 tokens of `plate-transformador.tokens.json`, ids `t{index}`, confidence 0.99, `preprocessing_applied: false`. The structuring output follows the README table.
- `apps/api/src/jobs/reading/fixtures/images/` -- two tiny committed PNGs made once with sharp in the tools container, `plate-error.png` and `plate-timeout.png`, each with a fixture keyed by its sha and `outcome` set to `error` or `timeout`. A test asserts every fixture file's name is a sha that exists: the plate JPEG or an image in `images/`.
- `apps/api/src/jobs/reading/fixtures/README.md` -- the fixture format, how to add one, the field-by-field table below, the error and timeout images, and a note that the target must be a `transformador_forca` block.
- `apps/api/src/http/reading.ts` -- `POST /api/photos/:id/reread` (session company). Answers per the matrix, sends the job and emits `running`. Export `READING_REREAD_PATH` and `readingRereadResponseSchema` from a new `packages/domain/src/contract/reading.ts` so batch P shares them.
- `apps/api/src/http/files.ts`, `app.ts`, `main.ts` -- wire receipt, the route and the worker.
- Tests (`test:api`):
  - `jobs/reading/providers/ocr-svc.test.ts`: a stub `node:http` server on port 0 covering the matrix row, the request method, path, content-type and body bytes, and the over-limit refusal.
  - `jobs/reading/providers/fake.test.ts`.
  - `jobs/reading/image.test.ts`: a JPEG with orientation 6 comes out with swapped dimensions, orientation 1 passes the bytes through.
  - `jobs/reading/job.integration.test.ts`: the worker on its own `PgBoss`, a unique queue name, `retryDelay: 0`, no backoff and polling 0.5 s, with a temporary fixtures dir. It covers `error` and `timeout` (3 attempts, 3 run rows, `failed`), a permanent error (1 attempt), the registry verdicts on a `chave_seccionadora` (voltage class in and out of the registry), and the discard of previous pending rows on a second run.
  - `http/reading.integration.test.ts`, over the compose api (default wiring: env fake, committed fixtures). The whole plate flow: push a relatório with a transformer block and the photo create, PUT the plate JPEG, poll the pull for `done`, then assert the 11 suggestions (trust, hint, bbox, token ids, mode, `prompt_version`) against the README and the `reading_runs` row. Idempotent PUT. Reread with a new run id, the old rows discarded and cross-tenant 404 bodies equal. PUT of the plate by the other company answers 409 with no job and no status change. Reread 400 and 409.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- close the two 8.3 entries and re-own the "Criar" entry to P with a dated strike. Add entries for the non-plate reading kinds (owner: the story that introduces each kind) and for thumb and print variants that are not auto-oriented for tiles and documents (owner: none).

**Fixture field table (transformador_forca, empty cells, nothing in the registries):**

| Field | Value emitted | Cited | Trust | Hint |
|---|---|---|---|---|
| identificacao | `TR-01` | t4 | suggested | - |
| fabricacao | `Celtta` | t6 | suggested | create_registry_entry manufacturer `Celtta` |
| n_serie | `240815-07` | t9 | suggested | - |
| tipo | `TSE-500/15` | t11 | suggested | - |
| tipo_de_isolacao | `EPÓXI` | t15 | suggested | - |
| vol_oleo | none (the model omits it) | - | - | - |
| potencia_nominal | `{raw: 500, unit: kVA, state: measured}` | t22 t23 | suggested | - |
| tap_atual | `5` (the plate prints 3) | t26 | **verify** | - |
| data_fabricacao | `2024-08` | t29 | suggested | - |
| tensao_nominal_at | `{raw: 15, unit: kV}` | t33 t34 | suggested (`replace` when typed first) | - |
| tensao_nominal_bt | `{raw: 380, unit: V}` | t38 t39 | suggested | - |
| ligacao_secundaria | `Dyn1` | t42 | suggested | - |

**Acceptance Criteria:**
- Given a plate photo create and its first upload, when the compose api stores it, then exactly one `reading` job runs. `file/{id}/reading_status` goes `running` then `done`, both as `system:reading`, and the pull carries the 11 `suggestion/{id}` creates of the table, all `status: pending`, `reading_run_id` naming an existing `reading_runs` row with `model: fake`, `prompt_version: fake-1` and zero usage.
- Given a fixture with `outcome: error` or `timeout`, when the job runs, then three attempts are made, each leaves a `reading_runs` row, the status ends `failed`, and no suggestion is created.
- Given a value with an extra digit, a missing digit and an exact match, when the kernel assesses it, then the first two are `verify` and the third is `suggested`.
- Given a `voltage_class` value absent from the registry, when the job emits it, then the trust is `verify`. Given an unknown manufacturer, then it is `suggested` with `hint.create_registry_entry.name` equal to the value.
- Given company B and company A's photo id, when B posts a reread or PUTs the bytes, then B gets the unknown-id answer and A's photo, jobs and suggestions are unchanged.
- Given `LLM_PROVIDER=anthropic|bedrock` or `OCR_PROVIDER=textract`, when a reading runs, then it fails permanently with `ProviderNotImplementedError`, and a repository grep for `ANTHROPIC_API_KEY|AWS_ACCESS_KEY|claude.ai` in `apps/api/src` finds nothing.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Why the retry lives in pg-boss:** it also covers a worker that dies mid-job (expiry counts as an attempt), and `stately` with the singleton key keeps one queued and one active job per `(photo, kind)`, so a reread during a run queues exactly one more.
- **Digits of a value with none:** a value without digits that cites tokens with digits (`Dyn` for `Dyn1`) is the "missing digit" case, so the rule applies to every value. A date compares through its pt-BR display, the order the plate prints it, so `2024-08` against `08/2024` is `suggested`. A plate printing `08.24` gives `verify`, the conservative outcome.
- **`mode` on the server:** the device decides the view (`suggestionView`), but no op family lets it write `mode`, so the server records `replace` when the target was filled at emission.
- **Cross-batch wiring owners:** batch P writes the plate photo create with `reading_target = plateReadingTarget(block.id, block.block_type)`, calls `READING_REREAD_PATH` for "Tentar novamente" and renders the `hint` and `verify` states; the deferred-work entries name P. This batch owns everything on the server.
- **Open question (kept conservative):** Flow 2b's "seven grounded fields" describes a disconnector. On the transformer fixture "Confirmar todos" takes 9 or 10 fields, depending on whether batch P counts the Celtta row (suggested with a hint). The table is the contract.

## Verification

**Commands** (all under `flock /tmp/fasor-verify.lock`, output to a log file):
- `docker compose --profile tools run --rm tools pnpm test:unit` -- expected: EXIT=0 (kernel reading tests and the schema drift test).
- `docker compose --profile tools run --rm tools pnpm test:api` -- expected: EXIT=0 (with the api container restarted so it loads the worker).
- `docker compose --profile ocr build ocr && docker compose --profile ocr run --rm ocr pytest -q` -- expected: EXIT=0 (the sidecar reads its literals from the schema).
- `docker compose --profile tools run --rm tools pnpm lint && … pnpm static` -- expected: EXIT=0.
