---
title: 'Story 8.3: Run a local OCR service in Docker behind the OcrProvider contract'
type: 'feature'
created: '2026-09-26'
status: 'in-progress'
baseline_revision: '8c9527cd48e45d6b0c0e79febac21138b78e2125'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: medium
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
warnings: ['batched', 'oversized']
batched_reason: 'Batch O of the Epic 8 delivery: one story (8.3) plus the fixture plate the coordinator decisions assign to this batch, run in parallel with carry-over batch C.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The reading pipeline (Stories 8.4-8.6) needs a real, off-cloud OCR layer and one typed contract that both the api and a Python sidecar speak; today `services/ocr` holds only a README and the kernel has no OCR or structuring contract.

**Approach:** Declare the OCR read result and the LLM structuring interface as zod in `packages/domain/src/contract/ocr.ts`, export a JSON Schema from it into `services/ocr/contract/`, guarded by a kernel drift test. Build a stateless FastAPI sidecar (Python 3.13, uv) that runs PP-OCRv5 detection + PARSeq word recognition on CPU with weights baked at build time, returns one token per word in the received image's pixel space, and ships under the `ocr` compose profile with a deterministic synthetic transformer plate as its test fixture.

## Boundaries & Constraints

**Always:**
- Contract path follows the repo convention: `packages/domain/src/contract/ocr.ts`, re-exported from `contract/index.ts` (the story's `packages/domain/contract/ocr` names this folder).
- `OcrReadResult = {image: {width, height}, tokens: [{id: "t{index}", text, bbox: [x0,y0,x1,y1], confidence}], preprocessing_applied}`; bbox in integer-or-float pixels of the decoded received bytes, `0 <= x0 < x1 <= width`, same for y; `id` is `t` + the token's index in `tokens`; the array order is reading order (lines top to bottom, words left to right). `confidence` in [0, 1] is an addition the story's shape does not forbid (Textract has it too).
- Structuring interface (TypeScript only for the call, zod for the output): input `{image: {bytes: Uint8Array, mime}, ocr: OcrReadResult, fields: FieldDef[]}` (reuse `FieldDef` from `packages/domain/src/seed/schema.ts`); output `{values: [{key, value, ocr_token_ids: string[] (min 1), confidence}]}` where `value` has its kind's shape: `number` -> `numberValueSchema`, `date` -> `dateValueSchema`, every other kind a non-empty string (reuse both schemas from `schemas/entities.ts`); plus a result wrapper `{output, model, prompt_version, usage: {input_tokens, output_tokens, usd}}` matching the `reading_run` fields of the epic context. Export `structuringValueSchemaFor(kind)` so the job can validate a value against its field.
- The model never emits coordinates: the structuring output schema has no bbox.
- The sidecar decodes with OpenCV ignoring EXIF orientation (`IMREAD_COLOR | IMREAD_IGNORE_ORIENTATION`): `image.width/height` and every bbox are in that pixel grid. Any internal geometric preprocessing (downscale of a side > 4000 px, deskew when the median text-line angle is >= 1 degree) is mapped back to that grid and sets `preprocessing_applied: true`; with none, `false`. Photometric-only steps do not count.
- Stateless: no disk writes, no cache across requests, no DB. Nothing downloads at runtime (weights, dictionaries, fonts baked in the image; set the libraries' offline switches).
- Heavy commands (image build, pytest in the container, `pnpm verify`) run under `flock /tmp/fasor-verify.lock`.
- No client material: the fixture plate is synthetic.

**Never:**
- No api adapter (`ocr-svc` provider), no reading job, no pg-boss queue, no route in `apps/api` (batch R owns them). `OCR_PROVIDER`/`LLM_PROVIDER` stay `fake` everywhere.
- No change to `CONTRACT_VERSION` (the sidecar contract is not the device-server sync contract).
- No `ocr` service started by a plain `docker compose up -d`; no dependency of `api`/`tools` on `ocr`.
- No Python run on the host.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fixture plate | `POST /read` body = committed plate JPEG, `Content-Type: image/jpeg` | 200, `OcrReadResult` valid against the schema; tokens match the expected JSON within tolerance; `preprocessing_applied: false` | none |
| Rotated plate | the plate rotated 4 degrees (expanded canvas, generated in the test) | 200, `preprocessing_applied: true`; boxes match the expected boxes pushed through the same rotation (axis-aligned bounds), in the rotated image's pixel space | none |
| PNG | plate re-encoded as PNG, `image/png` | same tokens as JPEG within tolerance | none |
| Blank image | uniform white 800x600 JPEG | 200, `tokens: []` | none |
| Not an image | random bytes or empty body | 422 `{error: "invalid_image"}` | never 500 |
| Too large | body > 20 MB | 413 `{error: "too_large"}` | checked before decoding |
| Health | `GET /health` | 200 `{status: "up", detection: "<model name>", recognition: "<model name>"}` after models load | container healthcheck uses it |
| Schema drift | zod source changed, JSON not regenerated | kernel test fails in `test:unit` naming the regenerate command | - |

</intent-contract>

## Code Map

- `packages/domain/src/contract/index.ts` -- barrel; add `export * from './ocr.ts'`. Siblings `generate.ts`/`sync.ts` show the style (zod + route consts + doc comments naming the AD/FR).
- `packages/domain/src/contract/contract.test.ts` -- existing contract tests; new tests go in a new `ocr.test.ts` beside it.
- `packages/domain/src/schemas/entities.ts:24-32` -- `numberValueSchema` (`raw` decimal with `.`), `dateValueSchema` (`YYYY-MM[-DD]`); `:449` `suggestionRowSchema` (bbox tuple, `ocr_token_ids`) the job will fill from this contract.
- `packages/domain/src/seed/schema.ts:17-43` -- `fieldKindSchema` (six kinds), `fieldDefSchema`/`FieldDef`.
- `packages/domain/src/seed/v1.ts:28-108` -- transformer nameplate = `instrumentTransformerFields('kVA')`: 12 fields, keys `identificacao, fabricacao (manufacturer), n_serie, tipo, tipo_de_isolacao (select EPÓXI|Á SECO), vol_oleo (number L), potencia_nominal (number kVA), tap_atual, data_fabricacao (date), tensao_nominal_at (number kV), tensao_nominal_bt (number V), ligacao_secundaria`.
- Domain tests may use `node:fs` (precedent `packages/domain/src/schemas/entities.test.ts`, `ops/replay.test.ts`); eslint bans only `apps/*` imports from the domain.
- `package.json` (root) -- scripts; add `"schema:ocr": "tsx scripts/export-ocr-schema.ts"`. `tsx` is already a root devDependency; `scripts/*.ts` are typechecked by the root `tsconfig.json`.
- `docker-compose.yml` -- `x-app-env` anchor (lines 13-38) carries `LLM_PROVIDER`/`OCR_PROVIDER`; `tools` (line 180) shows a profiled service. Add `OCR_SERVICE_URL: ${OCR_SERVICE_URL:-http://ocr:8000}` to the anchor and the `ocr` service.
- `apps/api/src/config.ts:25-26` + `apps/api/src/config.test.ts:21` -- add `OCR_SERVICE_URL: z.string().url().default('http://ocr:8000')` and assert its default and an override.
- `apps/api/src/storage/variants.ts:12,36-44` -- the `print` variant the job will send: <= 2000 px, re-encoded by sharp with metadata stripped (no EXIF orientation), JPEG or PNG.
- `services/ocr/README.md` -- today a two-line English placeholder; rewrite it in English.
- `AGENTS.md` "Running and verifying" -- add one bullet (see tasks). Batch C also edits this section: on a merge conflict keep both.
- `.gitignore` -- add Python artifacts (`__pycache__/`, `.pytest_cache/`, `.venv/`) and the build-generated `services/ocr/app/contract_models.py`.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/contract/ocr.ts` -- zod: `ocrBboxSchema`, `ocrTokenSchema`, `ocrReadResultSchema` (refine: ids are `t{index}` in order, boxes inside the image), `ocrHealthResponseSchema`, `ocrErrorResponseSchema` (`error: invalid_image|too_large|internal`), `structuringValueSchemaFor(kind)`, `structuringValueSchema`, `structuringOutputSchema`, `structuringResultSchema`; TS `interface OcrProvider { read(image: {bytes: Uint8Array; mime: string}): Promise<OcrReadResult> }`, `interface StructuringProvider { structure(input: StructuringInput): Promise<StructuringResult> }`, `StructuringInput`; `OCR_SERVICE_ROUTES = {read: POST /read, health: GET /health}`, `OCR_READ_MAX_BYTES = 20 * 1024 * 1024`; `ocrContractJsonSchema()` returning one draft 2020-12 document with `$defs` `OcrReadResult`, `OcrToken`, `OcrHealthResponse`, `OcrErrorResponse`, `StructuringOutput` (via `z.toJSONSchema`, zod 4). Refinements that JSON Schema cannot express are documented in the schema `description` and enforced by the sidecar's own code.
- `scripts/export-ocr-schema.ts` -- writes `JSON.stringify(ocrContractJsonSchema(), null, 2) + '\n'` to `services/ocr/contract/ocr-contract.schema.json`.
- `services/ocr/contract/ocr-contract.schema.json` -- the committed export.
- `packages/domain/src/contract/ocr.test.ts` -- (1) the committed JSON file equals `ocrContractJsonSchema()` serialized the same way, with a failure message naming `docker compose --profile tools run --rm tools pnpm schema:ocr`; (2) schema accept/reject cases: id sequence, box order and bounds, empty tokens, structuring value per kind (number needs `{raw, unit, state}`, date needs `YYYY-MM[-DD]`, text non-empty string), `ocr_token_ids` non-empty, no bbox key accepted in structuring output (strict object).
- `services/ocr/pyproject.toml` + `uv.lock` -- Python 3.13, uv-managed; runtime deps (fastapi, uvicorn, pydantic, numpy, opencv-python-headless, onnxruntime, pillow, plus the detection runtime chosen below); a `dev` group with pytest, httpx, datamodel-code-generator. CPU wheels only.
- `services/ocr/Dockerfile` + `.dockerignore` -- multi-stage. Builder: fetch and convert weights (PARSeq exported to ONNX with CPU torch that lives only in the builder; PP-OCRv5 detection weights). Runtime: `python:3.13-slim-bookworm` (pinned tag), `fonts-dejavu-core` (the fixture font), the uv venv, ONNX/inference files, `app/`, `contract/`, `tests/`; generate `app/contract_models.py` from the schema with `datamodel-codegen` (pydantic v2 output) at build time; run as a non-root user; `CMD uvicorn app.main:app --host 0.0.0.0 --port 8000`. Offline switches set (e.g. `PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True`, `HF_HUB_OFFLINE=1`).
- `services/ocr/app/` -- `main.py` (FastAPI: `POST /read` raw body `image/jpeg|image/png|application/octet-stream`, size check before decode, responses built through the generated pydantic models; `GET /health`; models loaded once at startup), `pipeline.py` (decode, preprocessing with map-back, detection, word split, recognition, reading order, token ids), small modules as needed.
- Recognition decision (record in the README and the spec Design Notes result): PARSeq (pretrained `baudm/parseq` weights, ONNX in onnxruntime) on word crops. PP-OCRv5 detection yields line polygons; split each rectified line crop into words by the column ink-profile gaps (a gap wider than about 0.3 x line height), and recognize each word crop with PARSeq; word bbox = the word segment mapped back to the image grid. Detection runtime: PaddleOCR + paddlepaddle CPU in the runtime image if paddlepaddle has a cp313 CPU wheel, else PP-OCRv5 det converted to ONNX in the builder (paddle2onnx, any Python there) with the DB post-processing (bitmap threshold, contours, unclip via pyclipper) in `app/`. Fallback, recorded as a narrowing: if PARSeq cannot be exported or run on CPU, or the runtime image would exceed about 3 GB because of it, use PP-OCRv5 recognition (the latin model, which keeps Portuguese accents) with word boxes.
- `services/ocr/tests/fixtures/make_plate.py` -- deterministic generator (Pillow, `/usr/share/fonts/truetype/dejavu/DejaVuSans*.ttf`, no randomness): writes `plate-transformador.jpg` (about 1600 x 1100, light metal-grey plate, dark text, a border, quality 90, no EXIF) and `plate-transformador.tokens.json` (`{image: {width, height}, tokens: [{text, bbox}]}` one per printed word, bbox = Pillow `textbbox` of that word at its drawn position, reading order). Content: a header line `TRANSFORMADOR DE FORÇA` and one `LABEL value` row per transformer field, using the seed labels: IDENTIFICAÇÃO `TR-01`; FABRICAÇÃO `Celtta`; Nº SÉRIE `240815-07`; TIPO `TSE-500/15`; TIPO DE ISOLAÇÃO `EPÓXI`; VOL. ÓLEO `0 L`; POTÊNCIA NOMINAL `500 kVA`; TAP ATUAL `3`; DATA FABRICAÇÃO `08/2024`; TENSÃO NOMINAL AT `15 kV`; TENSÃO NOMINAL BT `380 V`; LIGAÇÃO SECUNDÁRIA `Dyn1`. Run: `docker compose --profile ocr run --rm -v ./services/ocr/tests/fixtures:/app/tests/fixtures ocr python tests/fixtures/make_plate.py`.
- `services/ocr/tests/fixtures/plate-transformador.jpg`, `.tokens.json`, `plate-transformador.md` -- committed outputs; the `.md` lists every printed row (label, value, field key, kind), the regenerate command, the JPEG sha256, and states it is synthetic with no client material.
- `services/ocr/tests/` (pytest, `httpx`/FastAPI `TestClient`) -- `test_fixture_plate.py`: tokens vs expected: every expected token matched to one returned token by best IoU; text equality after NFC; box IoU >= 0.5 and each edge within max(6 px, 0.2 x token height); pass when >= 95% of expected tokens match and 100% of the value tokens (the right-hand values) match; print the measured accuracy (exact text, accent-insensitive text, mean IoU) with `-s`-independent reporting (write it to the test output via a final summary line); ids `t0..tn` in order; output valid against the JSON Schema (`jsonschema` dev dep or the generated models). If PARSeq is the recognizer, its ASCII charset loses accents: then label tokens compare accent-insensitively (NFKD, drop combining marks, `º` -> `o`), value tokens still exactly except `EPÓXI` accent-insensitive; state the rule in the test. `test_generator.py`: re-running the generator into a temp dir reproduces the committed JSON exactly and the JPEG byte for byte. `test_api.py`: the matrix rows (rotated, PNG, blank, not-an-image, empty body, too large, health, statelessness: two identical requests give identical responses).
- `services/ocr/README.md` -- what the sidecar is, endpoints, build/test commands, the recognition decision, image size, measured accuracy.
- `docker-compose.yml` -- `ocr` service: `profiles: ['ocr']`, `build: {context: services/ocr}`, `image: app-ocr`, `ports: ['127.0.0.1:8000:8000']`, healthcheck on `/health` via Python urllib; `OCR_SERVICE_URL` in `x-app-env`.
- Worktree-local `compose.local.yml` (git-excluded) -- `ocr: {image: app-ocr-s8o, ports: !override ['127.0.0.1:32800:8000']}`.
- `apps/api/src/config.ts`, `apps/api/src/config.test.ts` -- `OCR_SERVICE_URL` as above.
- `AGENTS.md` -- one bullet under "Running and verifying": the sidecar (`services/ocr`, port 8000, `OCR_SERVICE_URL`) builds with `docker compose --profile ocr build ocr` and tests with `docker compose --profile ocr run --rm ocr pytest`; both stay outside `pnpm verify` and run (under the host lock) only for stories touching `services/ocr` or its contract; regenerate the schema with `pnpm schema:ocr` in the tools container.
- `.gitignore` -- Python artifacts and the generated models file.

**Acceptance Criteria:**
- Given the zod contract in `packages/domain/src/contract/ocr.ts`, when `pnpm test:unit` runs, then `ocr.test.ts` passes and fails if the committed `services/ocr/contract/ocr-contract.schema.json` differs from `ocrContractJsonSchema()`.
- Given a clean checkout, when `docker compose --profile ocr build ocr` runs, then the image builds with weights baked in, and `docker run --network none app-ocr` (or the compose service with networking cut) answers `GET /health` 200 (no runtime download).
- Given `docker compose up -d` without a profile, when `docker compose ps` runs, then no `ocr` container exists; with `--profile ocr up -d ocr` it becomes healthy.
- Given the fixture plate, when `docker compose --profile ocr run --rm ocr pytest` runs, then every test passes, one token per word comes back in the received image's pixel space, and the run prints the measured accuracy.
- Given the api config, when `OCR_SERVICE_URL` is unset, then it is `http://ocr:8000`; `OCR_PROVIDER` and `LLM_PROVIDER` still default to `fake`.

## Spec Change Log

## Review Triage Log

## Design Notes

- Why the JSON Schema lives under `services/ocr/contract/`: the sidecar's build context is `services/ocr`, so the image generates its pydantic models from a file inside the context; the kernel test keeps it equal to the zod source, so drift fails `test:unit`.
- Why words are split before recognition: PARSeq is a word-crop recognizer (no space in its charset, 25-char limit), and the digit-coverage rule of Story 8.5 cites tokens per word.
- Orientation: the api's `print` variant carries no EXIF orientation and is not rotated by sharp; a sideways photo is out of scope here (deferred to batch R: auto-orientation belongs with the job's image choice).
- Open questions: none blocking. The plate's `VOL. ÓLEO 0 L` on a dry transformer is a synthetic value chosen so every seed field has one printed value.

## Verification

**Commands:**
- `flock /tmp/fasor-verify.lock docker compose --profile tools run --rm tools pnpm test:unit > /tmp/unit-s8o.log 2>&1; echo EXIT=$?` -- expected: EXIT=0.
- `flock /tmp/fasor-verify.lock docker compose --profile ocr build ocr > /tmp/ocr-build-s8o.log 2>&1; echo EXIT=$?` -- expected: EXIT=0; then `docker image ls app-ocr-s8o` reports the size.
- `flock /tmp/fasor-verify.lock docker compose --profile ocr run --rm ocr pytest -q > /tmp/ocr-test-s8o.log 2>&1; echo EXIT=$?` -- expected: EXIT=0 with the accuracy line.
- `flock /tmp/fasor-verify.lock docker compose --profile tools run --rm tools pnpm verify > /tmp/verify-s8o.log 2>&1; echo EXIT=$?` -- expected: EXIT=0 (run once at the end by the orchestrator).
