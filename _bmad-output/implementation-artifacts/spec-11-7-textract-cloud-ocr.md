---
title: 'Story 11.7: Use Amazon Textract as the cloud OCR'
type: 'feature'
created: '2026-09-30'
status: 'done'
baseline_revision: 'd7beb605ccc7cc22c1537c05cac945e78e799650'
review_loop_iteration: 0
followup_review_recommended: true
dev_model: opus
dev_effort: medium
context: []
warnings: ['batched']
# batched: Epic 11 batch e11t runs this one story as its own unattended batch (playbook epic-batch-orchestrator.md); no AWS login tonight.
deferred: []
---

<intent-contract>

## Intent

**Problem:** `OCR_PROVIDER=textract` exists in `apps/api/src/config.ts:26` but returns the permanent-failure stub of `providers/unimplemented.ts`, so nameplates cannot be read by a managed OCR once the AWS account is live (Story 11.7, `epics.md:2429-2441`; context `epic-11-context.md` "Textract", assertion **11.7-ROUTING**).

**Approach:** Add a `textract` `OcrProvider` that calls `@aws-sdk/client-textract` `DetectDocumentText` with the image bytes and maps WORD blocks to contract tokens in the pixel grid of the received image, and route by `reading_kind` in `createReadingProviders`: with `OCR_PROVIDER=textract`, `display` goes to `ocr-svc`, the text kinds (`plate`, `panel`) go to Textract. Everything is proven with hand-built `DetectDocumentText` responses through an injected client; nothing calls AWS.

## Boundaries & Constraints

**Always:**
- `fake` stays the default for `OCR_PROVIDER` and `LLM_PROVIDER`; `pnpm verify` never reaches AWS (no test builds a real `TextractClient` that sends).
- Credentials come only from the AWS SDK default provider chain (env session vars from `aws configure export-credentials --profile fasor-app`, or the instance role on AWS). Never read or store access keys in code, config or fixtures.
- Region: new config `TEXTRACT_REGION`, default `us-east-1` (Textract has no `sa-east-1` endpoint).
- Tokens satisfy `ocrReadResultSchema` (`packages/domain/src/contract/ocr.ts:65`): ids `t0..tn` in array order, `[x0,y0,x1,y1]` pixel boxes with `x0<x1`, `y0<y1`, inside `image.width/height`, confidence 0..1, reading order, `preprocessing_applied: false`. `image` is the width/height of the bytes sent (sharp metadata, the same values `readingImage` reports), so `readOcr`'s size check (`kinds/shared.ts:51`) holds.
- Error classes of `providers/errors.ts`: permanent = `PermanentReadingError`, transient = `ProviderError`/`ProviderTimeoutError`.
- The AI services opt-out policy is already attached by `infra/bootstrap/organization.tf:9-26` (cite it in a code comment; do not recreate it).
- One `TextractClient` per process (built once in the factory closure, lazily on first textract read), SDK retries off (`maxAttempts: 1`, pg-boss retries transient failures), a per-call timeout through `abortSignal`.

**Never:**
- Do not edit `packages/domain/src/contract/ocr.ts`, the committed OCR schema, `services/ocr/`, `infra/`, `docker-compose.yml`, `epics.md` or `sprint-status.yaml`.
- Do not touch `LLM_PROVIDER` values (Story 11.6 owns dropping `anthropic`), nor the structuring or prose providers.
- No call to AWS, no AWS login, no new e2e surface (no UI changes).
- No emoji; no client material from `docs/context/`/`docs/media/` in tracked files; fixture words are the synthetic plate's (`services/ocr/tests/fixtures/plate-transformador.*`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Plate, upright | Response with PAGE, LINE blocks (CHILD ids to WORDs), WORD blocks with normalized `BoundingBox` | One token per WORD, in LINE order then CHILD order; `x0=floor(Left*W)`, `y0=floor(Top*H)`, `x1=ceil((Left+Width)*W)`, `y1=ceil((Top+Height)*H)` clamped to `[0,W]`/`[0,H]`; `confidence=Confidence/100` | none |
| Round trip | The synthetic plate's expected tokens (`plate-transformador.tokens.json`, 1600x1100) converted to normalized WORD blocks | Mapped boxes equal the expected pixel boxes within 1 px, texts and order equal | none |
| Rotated 90/180/270 | WORD `BoundingBox` axis-aligned in input-image space, `Polygon` rotated, LINE order is text order | Boxes come from `BoundingBox` (never Polygon), in the received image's grid; order follows LINE/CHILD, not a geometric sort | none |
| Small skew | `Polygon` corners differ from the box | Same: `BoundingBox` only | none |
| Box off the edge | `Left` < 0 or `Left+Width` > 1 | Clamped into the image | none |
| Degenerate word | Empty/whitespace `Text`, no `BoundingBox`, or zero area after clamping | Word dropped; ids stay contiguous | none |
| WORD not under any LINE | Orphan WORD block | Appended after the LINE-ordered words, in block order | none |
| No text | Only a PAGE block | `tokens: []` | none |
| Too large | bytes > 10 MiB (Textract sync limit, 10485760) | Not sent | `PermanentReadingError` |
| Client fault | `InvalidParameterException`, `UnsupportedDocumentException`, `BadDocumentException`, `DocumentTooLargeException`, `AccessDeniedException` (also the budget action's deny), `InvalidS3ObjectException`, a credentials-provider error | Attempt fails | `PermanentReadingError` naming the error |
| Throttle / server fault | `ThrottlingException`, `ProvisionedThroughputExceededException`, `LimitExceededException`, `InternalServerError`, any `$fault: 'server'`, network error | Attempt fails | `ProviderError` (transient) |
| Timeout | No answer within the timeout | Aborted | `ProviderTimeoutError` |
| Routing, textract | `OCR_PROVIDER=textract`; `reading_kind` `plate` / `panel` / `display` | `plate`, `panel` -> Textract, `ocr_name='textract'`; `display` -> `ocr-svc` adapter on `OCR_SERVICE_URL`, `ocr_name='ocr-svc'` | none |
| Routing, others | `OCR_PROVIDER=fake` or `ocr-svc` | Unchanged for every kind | none |

</intent-contract>

## Code Map

- `apps/api/src/jobs/reading/providers/index.ts:48-84` -- `createReadingProviders`; the `textract` case returns the stub today; add routing and `ReadingProviderOptions.textract` (an injectable client, `timeoutMs`).
- `apps/api/src/jobs/reading/providers/unimplemented.ts:11-17` -- `unimplementedOcrProvider('textract')`; remove it (keep the structuring/prose stubs).
- `apps/api/src/jobs/reading/providers/ocr-svc.ts` -- the adapter to mirror (timeout, error classes, schema parse of the result).
- `apps/api/src/jobs/reading/providers/errors.ts` -- error classes; `ProviderNotImplementedError` stays for `anthropic`/`bedrock`.
- `apps/api/src/jobs/reading/image.ts:31` -- `readingImage`, sharp metadata; the provider reads width/height the same way.
- `apps/api/src/jobs/reading/kinds/shared.ts:51` -- `readOcr`, size check; `kinds/plate.ts:54`, `kinds/panel.ts:32` (mode `text`), `kinds/display.ts:66` (mode `display`).
- `apps/api/src/config.ts:26` -- add `TEXTRACT_REGION`; `config.test.ts:20` for the default.
- `apps/api/src/main.ts:56` -- builds the factory from config; pass the region through.
- `apps/api/package.json:15` -- add `"@aws-sdk/client-textract": "3.1134.0"` (same pin as client-s3); lockfile via `pnpm install` in the tools container.
- `apps/api/src/jobs/reading/providers/fake.test.ts:240-262` -- `8.4-API provider switch`; its textract-stub assertion changes.
- `apps/api/src/jobs/reading/job.integration.test.ts:498-520` -- `8.4-INT provider stubs`; the `['textract','fake']` row leaves it.
- `services/ocr/tests/fixtures/plate-transformador.tokens.json` and `.md` -- synthetic plate (1600x1100) expected tokens, source of the round-trip fixture.
- `infra/bootstrap/organization.tf:9-26`, `infra/bootstrap/iam.tf:42-44`, `infra/README.md:14-26` -- opt-out policy, `textract:DetectDocumentText` on `fasor-app`, the profile (read only).

## Tasks & Acceptance

**Execution:**
- `apps/api/package.json` + `pnpm-lock.yaml` -- add `@aws-sdk/client-textract@3.1134.0` (install inside the tools container only).
- `apps/api/src/config.ts` -- `TEXTRACT_REGION: z.string().min(1).default('us-east-1')`; unit test the default.
- `apps/api/src/jobs/reading/providers/textract.ts` -- new: `textractProvider(options: { client?: TextractLike; region: string; timeoutMs?: number })` returning `OcrProvider`; a pure exported `textractTokens(blocks, width, height)` mapping; error classification per the matrix; result validated with `ocrReadResultSchema` before return. Header comment: Story 11.7, us-east-1 only, opt-out policy in `infra/bootstrap/organization.tf`, credentials from the default chain.
- `apps/api/src/jobs/reading/providers/fixtures/textract/*.json` (or beside the test) -- hand-built `DetectDocumentText` responses: `plate-upright` (derived from the synthetic plate's tokens), `rotated-90`, `rotated-180`, `rotated-270`, `skewed`, `edge-and-degenerate` (off-edge, empty text, missing box, orphan WORD), `empty`. A short README states they are hand-built, not recorded, and how the plate one was derived.
- `apps/api/src/jobs/reading/providers/textract.test.ts` -- unit tests for every matrix row with an injected fake client (asserts the command input carries `Document.Bytes` and nothing else, and that no real client is built).
- `apps/api/src/jobs/reading/providers/index.ts` -- routing by `reading_kind`; lazily built shared client; `ocr_name` names the provider actually used.
- `apps/api/src/jobs/reading/providers/unimplemented.ts` -- drop the OCR stub.
- `apps/api/src/jobs/reading/providers/fake.test.ts` -- replace the textract stub assertion with routing assertions (**11.7-ROUTING**): textract config gives `ocr_name` `textract` for plate and panel, `ocr-svc` for display; `fake` default unchanged.
- `apps/api/src/jobs/reading/job.integration.test.ts` -- remove the textract stub row; add one `11.7-INT` test: `OCR_PROVIDER=textract`, `LLM_PROVIDER=fake`, injected Textract client, a plate photo reads to `done` with suggestions whose boxes come from the Textract tokens and a run row `ocr_provider='textract'`; and a permanent Textract error (`AccessDeniedException`) ends `failed` in one attempt.
- `apps/api/scripts/textract-read.ts` (or `apps/api/src/scripts/`, following repo convention) -- manual live-call script, never run by `verify`: reads an image path, makes it upright with sharp `.rotate()` and re-encodes JPEG the way the print variant is (reuse the existing variant helper if one exists server side, else document the difference), runs `textractProvider`, prints token count, image size and the first 20 tokens; exits non-zero on error. Excluded from test globs.

**Acceptance Criteria:**
- Given `OCR_PROVIDER=textract` and a hand-built `DetectDocumentText` response, when a plate reading runs, then WORD blocks become tokens with boxes in the received image's pixel grid (normalized boxes scaled and clamped), `preprocessing_applied: false`, and the result parses with `ocrReadResultSchema`.
- Given `OCR_PROVIDER=textract`, when the factory builds providers for `plate`, `panel` and `display`, then plate and panel use Textract and display uses `ocr-svc`; given no `OCR_PROVIDER`, then `fake` is used (**11.7-ROUTING**).
- Given `pnpm verify`, when it runs, then no test sends a request to AWS and the default providers stay `fake`.
- Given the live script and a `fasor-app` session, when Matheus runs the command in the PR body's "Waits for AWS", then a real plate photo returns tokens (not run tonight).

## Spec Change Log

## Review Triage Log

## Design Notes

- Routing is keyed by kind, not by mode, because the factory is what the job uses and 11.7-ROUTING names kinds. `panel` reads printed text (`mode: 'text'`), so it follows the plate. Open question for Matheus: panel to Textract or to `ocr-svc`.
- Textract's `BoundingBox` is axis-aligned in the input image's frame whatever the text orientation; `Polygon` carries the rotation. The print variant has no EXIF orientation (job.ts:210 comment), so Textract's frame is the received pixel grid.
- Floor/ceil keeps the box covering the word on integer pixels; a word that clamps to zero area is dropped rather than widened.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm --filter @app/api exec vitest run src/jobs/reading/providers src/config.test.ts` -- expected: green.
- `docker compose --profile tools run --rm tools pnpm test:api` -- expected: green (needs compose Postgres and MinIO up).
- `docker compose --profile tools run --rm tools pnpm lint` and `pnpm static` -- expected: green.

### 2026-09-30 — Review pass
- layers: Edge Case Hunter and Verification Gap Reviewer; Blind Hunter and Intent Alignment skipped (token economy; the integrated epic review covers them).
- verdicts: 10 findings — high 0, medium 3, low 5, false 2, maybe-false 0
- findings:
  - `[medium]` `[patch]` TEXTRACT_REGION never verified from factory to client builder — `createClient` passthrough on `ReadingProviderOptions.textract` plus a us-west-2 routing test.
  - `[low]` `[patch]` Four permanent error names untested — added to the permanent table.
  - `[low]` `[defer]` The compose env anchor does not pass TEXTRACT_REGION to api/tools — `docker-compose.yml` is out of this batch (batch D owns the deploy env); the script header says to pass `-e TEXTRACT_REGION`; default us-east-1 is the intended region.
  - `[medium]` `[patch]` An unlisted SDK client fault (e.g. SignatureDoesNotMatch) was classed transient — `$fault === 'client'` is permanent unless `$retryable` or a throttle/limit name.
  - `[medium]` `[patch]` A mapped read failing the schema was transient — now `PermanentReadingError`.
  - `[low]` `[patch]` Non-finite Confidence gave NaN and rejected the whole read — non-finite becomes 0.
  - `[low]` `[reject]` `createClient` throwing escapes unclassified — the SDK constructor does not throw on a region string; unlikely, and a guard adds a branch.
  - `[low]` `[reject]` TEXTRACT_REGION accepts an invalid region — operator config with a correct default; a regex adds surface for no everyday case.
  - `[false]` `[reject]` Duplicate WORD Ids shift order — Textract block Ids are unique UUIDs per response; the hand-built fixtures are the only other source.
  - `[false]` `[reject]` EXIF orientation 5-8 swaps width/height — the job sends the print variant, already upright with no EXIF orientation (`job.ts:210`, `renderVariants` `.rotate()`), and `readOcr` checks the size against `readingImage`'s own metadata read.

## Auto Run Result

Status: done

- Summary: `OCR_PROVIDER=textract` now reads through Amazon Textract `DetectDocumentText` (`providers/textract.ts`), WORD blocks to contract tokens in the received pixel grid, `preprocessing_applied: false`; the factory routes `display` to `ocr-svc` and every other kind to Textract, `ocr_name` naming the provider used; `TEXTRACT_REGION` (default `us-east-1`); a manual live script `apps/api/src/scripts/textract-read.ts`.
- Files: `apps/api/package.json`, `pnpm-lock.yaml` (client-textract 3.1134.0); `config.ts`/`config.test.ts` (region); `main.ts` (log); `providers/index.ts` (routing, injected client/createClient); `providers/unimplemented.ts` (OCR stub removed); `providers/textract.ts` + `textract.test.ts` (adapter, mapping, error classes); `providers/fixtures/textract/` (seven hand-built responses + README); `fake.test.ts` (11.7-ROUTING); `job.integration.test.ts` (11.7-INT, stub row removed); `scripts/textract-read.ts`.
- Review: 5 patches applied (medium 3, low 2), 1 deferred as known open (compose anchor lacks TEXTRACT_REGION), 4 rejected with reasons in the triage log.
- Follow-up review recommended: true. Named risk: the error classification relies on the SDK's `$fault`/`$retryable`/`name` shapes, exercised only with hand-built errors; the first live call (PR "Waits for AWS") and the integrated epic review should confirm them.
- Verification: provider tests 60/60, lint, api typecheck green in the tools container; full gate in the PR body.
- Residual risk: no live Textract call has been made; the fixtures are hand-built from the API reference, not recorded. Panel routing (Textract) is an open question for Matheus.
