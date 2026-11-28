# Epic 8 Context: Nameplate from a photo (the reading pipeline)

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

A field engineer photographs an equipment nameplate with one shutter; the photo is kept and queued offline, uploaded first at the first signal, read in the backend by an OCR layer plus an LLM structuring step, and every nameplate field comes back as an amber Suggestion with its source crop, grounded by digit coverage and cross-checked against the registries. Nothing the app proposes is written, counted or printed until the engineer taps, so a signed relatório never carries an unchecked value. The whole pipeline runs off-cloud in the MVP: `LLM_PROVIDER=fake` replays fixtures and the `services/ocr` PaddleOCR sidecar is the local `OcrProvider`; the real Claude call and Textract are Epic 11.

## Stories

- Story 8.1: A Suggestion is an entity nobody can write without a tap (opus, high)
- Story 8.2: Photograph the plate and keep the photo until there is signal (opus, medium)
- Story 8.3: Run a local OCR service in Docker behind the OcrProvider contract (opus, medium)
- Story 8.4: Run the reading job end to end with fixture-driven structuring (opus, high)
- Story 8.5: Accept a digit only when the OCR saw it, and check names against the registries (opus, high)
- Story 8.6: Confirm the plate in one tap with the crop in view (opus, medium)

## Requirements & Constraints

- Confirm contract: nothing unconfirmed is written, counted by progress, counted as filled, or printed. Typing into a suggested field discards that field's suggestion only. A field the engineer filled is never overwritten; a differing suggestion shows beside it with "Substituir". No verdict is ever suggested.
- Low confidence on a field with a known shape shows the best guess flagged "Verificar" (never blank); "Confirmar todos" skips every Verificar field, which confirms only by its own tap.
- Wrong-digit protection: a value containing a digit is `suggested` only if `digits(value) === digits(concat(cited tokens in reading order))` (`digits` keeps 0-9), for every kind; else `verify`. Computed on the server, never taken from the model.
- Registries: a voltage class absent from the company registry is `verify`; an unknown manufacturer is `suggested` plus a `create_registry_entry` hint rendering "Criar ⟨nome⟩?", which creates the manufacturer offline as an op and confirms the field in one batch.
- Offline queue: the plate photo is a normal sheet photo (caption "placa de identificação"), kept and queued; reading photos upload before all other photos; the fields stay typeable meanwhile and a field typed first is excluded from incoming suggestions. A failed reading keeps the photo, writes nothing, offers "Tentar novamente" (`POST /api/photos/{id}/reread`) and "Preencher manualmente".
- Sync status counts "leituras na fila" and "sugestões por confirmar"; the Sumário header counts pending suggestions and blocks with pending suggestions are not counted as filled. Pre-issue: "N fichas com sugestões por confirmar" is a warning that never blocks (only an unset parecer blocks).
- AI cost/control: all AI runs in the backend through the one pg-boss queue; the LLM never emits coordinates (every bbox comes from OCR, the model cites `ocr_token_ids`); every run logged with tokens and USD; the backend never uses a personal Claude subscription; `anthropic` and `bedrock` provider slots exist behind the switch but are not implemented. No cloud account or paid key in any Epic 8 story.
- No consent gate or LGPD text for sending photos to the reading provider in the POC; do not preclude a later per-photo purge.
- Testing: every AC automated (kernel/api by Vitest, UI by a Playwright walk of the whole feature); every new API route (reread, file receipt) gets a cross-tenant test; `docker compose build ocr` runs as part of `pnpm verify` for stories touching `services/ocr`; manual device evidence at epic close (TC-12). The fake provider fixture declares `outcome: ok | error | timeout` (default `ok`); error/timeout exhaust three attempts and end `failed`.

## Technical Decisions

- Suggestion entity: `{id, relatorio_id, target_path, value, trust: suggested|verify, mode: fill|replace, source: {photo_id, bbox [x0,y0,x1,y1] normalized, ocr_token_ids, reading_run_id}, status: pending|confirmed|discarded, prompt_version}`. The server emits `suggestion/{id}` creates with `status = pending` only; pending is the stored status, never inferred.
- Cell shape `{value, source_suggestion_id, op_id}`; `applyOp` sets `source_suggestion_id` from `meta.source_suggestion_id` and nulls it on any later put without it. The confirmed glyph is "cell with `source_suggestion_id ≠ null`" and its crop is that suggestion.
- Batches: Confirmar = `suggestion/{id}/status = confirmed` + `{target_path} = value` with `meta.source_suggestion_id`; typing = value op + `status = discarded`; Confirmar todos = one batch skipping `verify`.
- Device-side comparison: on applying a `suggestion/{id}` create whose target is non-empty, run `compareSuggestion(cell.value, suggestion.value, fieldDef)`; equal emits the confirm batch as the current user with `meta.auto = true`; different stays pending with `mode = replace`.
- `RelatorioSnapshot` carries exactly the suggestions referenced by a current cell; progress, pre-issue, `syncCounts` and the renderer ignore anything not confirmed. Device-computed suggestions (conclusion, instrument pick, observation draft) are derived on read, never rows.
- Photo row: `reading_kind?: plate|display|caption|panel|nc_obs`, `reading_target?: {block_id, block_type, ...}` set on the device at capture, `reading_status: none|queued|running|done|failed` written by `system:reading` server ops.
- Reading job: file receipt with a `reading_kind` enqueues one pg-boss `reading` job, singleton key `(photo_id, reading_kind)`, and emits `file/{id}/reading_status = running` as `system:reading`. It sends the `print` variant to `OcrProvider.read(image) → {image: {width,height}, tokens: [{id: "t{index}", text, bbox}], preprocessing_applied}` and the same bytes to the structuring step (input: image, tokens, field definitions; output: values in their kind's shape each citing `ocr_token_ids`); normalizes boxes over that image; parses through `packages/domain/parse`; applies digit coverage and the registry check; deletes its own previous pending suggestions for the target; emits the creates. Three attempts with backoff, then `failed`. Contracts live in `packages/domain/contract/ocr` with a JSON Schema exported for the sidecar.
- Providers by env: `OCR_PROVIDER ∈ {fake, ocr-svc}` (textract later), `LLM_PROVIDER ∈ {fake}` (anthropic/bedrock stubs); `fake` replays `apps/api/src/jobs/reading/fixtures` keyed by photo sha256; compose default `fake` for both.
- `reading_run {id, photo_id, reading_kind, ocr_provider, ocr_result (normalized boxes), model, prompt_version, llm_usage {input_tokens, output_tokens, usd}, duration_ms}` per run so token ids resolve later; `reread` makes a new run; logs carry `company_id`, `relatorio_id`, `job_id`.
- OCR sidecar `services/ocr`: Python 3.13, uv, FastAPI, PaddleOCR PP-OCRv5 detection + PARSeq recognition, OpenCV preprocessing, onnxruntime, pydantic models generated from the schema; stateless; `POST /read` returns one token per word with boxes in the pixel space of the received bytes (preprocessing mapped back, or `preprocessing_applied: false`); `GET /health`; compose profile `ocr`; a fixture plate matches stored tokens within tolerance.
- Field kinds: `text, number, date, select, manufacturer, voltage_class`; `number` value `{raw: "3300", unit, state}`.

## UX & Interaction Patterns

- Nameplate group: fields visible from the start with copy chips above; the "Fotografar placa" tile (`.camera-capture-tile` in `.camera-group`) sits above the fields, not in place of them; no "Digitar" link.
- States (meta lines under the plate Photo tile): offline "Foto guardada — leitura quando houver sinal"; running "Lendo…"; failed "Não foi possível ler — Tentar novamente / Preencher manualmente"; ready: plate crop inline above the fields (full width, ≤ 160 px, zoomable), the focused field's `bbox` outlined on it.
- Suggestion field: amber fill + "Sugerido" pill; `verify` = dashed border + "Verificar" pill with the guess; 48 px source crop left of the value opens the Photo viewer zoomed on `bbox` (local original, else `GET …/original` cached as a `crop` blob); after confirm the crop shrinks to a 24 px glyph with ≥ 48 px hit area until export; replace line "Sugerido: 15 kV — Substituir"; announces "Sugerido, ⟨valor⟩, confirmar"; crop alt "Recorte da placa". Group head button "Confirmar N".
- Arrival: toast "3 leituras prontas para confirmar — Ver" opens the first sheet with pending suggestions; a sheet opened later shows the info banner "Sugestões prontas" (one banner slot; priority conflict › draft › suggestions ready › exported › offline).
- Flow 2b (fixture plate): seven grounded fields confirmed by one tap, one typed-first field shows the replace line and keeps its value, "Criar Celtta?" creates the manufacturer offline, the `verify` field is fixed with two keystrokes.
- Class names: `.section.nameplate-extraction`, `.nameplate-grid`, `.field.suggestion-field[data-state="suggested|verify|confirmed"]` (`.combobox` variant hides `.combobox-chevron`), `.input > .crop-thumb > .thumb-fake`, `.sv`, `.confirm-btn`, `.suggested-pill`, `.verify-pill`, `.suggestion-alt`, `.suggestion-group-head` (+ `.btn.btn-secondary` "Confirmar N", `.section-note`), `.plate-crop > .thumb-fake + .region`, `.reading-line`/`.extracting`, `.photo-row`/`.photo-tile`/`.photo-meta`, `.banner[data-variant="info"]`, Sync: `.sync-row`, `.sr-primary`, `.sync-badge`. Current reference: `prototype/screens/60-ficha.html` (nameplate at lines ~312-341); `key-sheet-states.html` frames b/b′/b″ are older ("Ler placa da foto" button, `.field.is-suggested` alias) and to be reworked; `85-sync.html` "Leituras" section.

## Code facts

- Paths: `packages/domain/src/ops/path.ts` has families `suggestion` (create, `serverOnly`) and `suggestion/status` (client); builders `sheetNameplatePath(blockId, fieldKey)`, `suggestionStatusPath(id)`, `filePath`, `fileFieldPath`; no `suggestionPath(id)` create builder yet. `FILE_SERVER_FIELDS = ['uploaded_at','variants','reading_status']` (family `file/server`); client `FILE_FIELDS` has no reading fields (set in the create). `isServerOnly()` guards pushes (`403 op_server_only`).
- `CONTRACT_VERSION = 4`, `MIN_CONTRACT_VERSION = 4` in `packages/domain/src/contract/version.ts` (bump with a dated note when a new family ships).
- `suggestionRowSchema` and `photoFileRowSchema` (with `reading_kind`, `reading_target: jsonValue`, `reading_status`) in `packages/domain/src/schemas/entities.ts`; cell `source_suggestion_id` there too; `apply.ts` already reduces `suggestion/status` and sets `source_suggestion_id` from `meta` (`ops/op.ts` meta has `source_suggestion_id`, `auto`). `web/src/db/file-commit.ts` creates photos with `reading_kind: null, reading_status: 'none'`.
- `syncCounts(outbox)` in `packages/domain/src/sync/counts.ts` reads the outbox only (`pending, sent, dead, sheets_pending, photos_pending`); readings queued and suggestions pending need new inputs.
- `progress(snapshot)` (`relatorio/progress.ts`) has `suggestions_pending` from `snapshot.suggestions` and `sugestoesText(n)`; `preIssue` (`relatorio/pre-issue.ts`) has no suggestion row yet; `sheetProgress` treats pending suggestions as empty by construction.
- `orderUploads` (`packages/domain/src/photos/upload-order.ts`) already ranks `reading_status` queued/running first.
- `apps/web/src/components/suggestion-field.tsx` (Story 5.8): `SuggestionField({label, children, onConfirm, crop?})`, suggested state only, copy in `ui.suggestionField`; `generated-text-field.tsx` and `instrument-picker.tsx` use the same classes. Nameplate: `apps/web/src/surfaces/ficha/nameplate-section.tsx` (no tile yet), ops in `ficha-ops.ts`.
- Server actors: `system:{files|reading|generate|sync|identity}` (`packages/domain/src/ids.ts`, `SERVER_DEVICE_ID = 'server'`); server ops go through `applyOps(db, companyId, ops, {origin: 'server'})` (`apps/api/src/sync/apply.ts`), pattern in `apps/api/src/http/files.ts` (`FILES_ACTOR`, variants via `storage/variants.ts`).
- pg-boss: `startQueue` in `apps/api/src/jobs/queue.ts`; `jobs/generate/worker.ts` shows the pattern (`GENERATE_QUEUE`, idempotent `createQueue`, `boss.send`, `boss.work(..., {batchSize: 1})`, zod payload with `company_id`); registered in `apps/api/src/main.ts`. `apps/api/src/jobs/reading/` exists empty; `config.ts` already has `LLM_PROVIDER` and `OCR_PROVIDER` enums defaulting `fake`; compose passes both. `services/ocr` holds only a README; no `ocr` compose service yet.
- E2E seeding: specs import from `e2e/support/merged-fixtures.ts` (per-worker company pair); `relatorio-seed.ts` pushes a standard relatório; `photos.ts` opens the first Chave seccionadora; server-only rows are written with `applyOps(..., {origin: 'server'})` in `e2e/support/push-server-ops.ts` (pattern for pushing `suggestion` creates). `scripts/test-reset.ts` deletes `pgboss.job` rows by `data->>'companyId'` (camelCase), while the generate payload uses `company_id`.

## Cross-Story Dependencies

- 8.1 precedes all UI work (8.2, 8.5 render, 8.6). 8.3 precedes the `ocr-svc` path of 8.4; 8.4 can run on `fake` alone. 8.5 extends 8.4's emission. 8.6 walks Flow 2b over 8.1 to 8.5.
- Builds on Story 6.1/6.2 (photo capture, uploader, variants), 5.3/12.4 (nameplate section, copy chips), 5.8 (Suggestion field), 3.x registries (manufacturer, voltage class), Sumário/Export pre-issue (Epic 4). Real Claude and Textract providers are Epic 11.

## Conflicts to resolve

- Story 8.2 says the fields stay typeable "via Digitar" and cites the tile "from Story 5.3"; source-deltas (2026-09-24, D-6) removed "Digitar" (fields always visible) and the code has no tile yet, so Story 8.2 builds it.
- Flow 2b shows the unknown manufacturer as "Celtta · Verificar"; Story 8.5 makes it `suggested` plus the create hint. Follow the story.
- The snapshot includes only cell-referenced (confirmed) suggestions, so `progress(snapshot).suggestions_pending` is always 0; pending counts (Sumário, sync, pre-issue) need the device's suggestion rows, not `RelatorioSnapshot`.
- The spine lists `ocr-svc` for displays and `textract` for plates; the epic uses `ocr-svc` for plates in the MVP.

## Carry-over from earlier epics (batch C, first)

Matheus asked (2026-09-26) that the agent-closable findings of earlier epics be settled before Epic 8 builds on them. Batch C owns: E6-A1 (sync push slowdown under overlap, the 3 serial vs 3 parallel full-run validation, the gate at 3 workers if it holds), E6-A3 (document the e2e runner in AGENTS.md), E6-A6 (E6-R1 point draft on each input, E6-R2 chips in "Editar texto", Sumário "aguardando envio" without "com erro" photos, a viewer-picture test), E6-A7 (split `ficha-surface.tsx`; dated narrowing lines for Epic 6 under Stories 6.1-6.6 in `epics.md`), E12-A7 (visual follow-ups), E4-A9 remainder (a shared SyncState test factory), the Epic 4 deferred bug "an equipment TAG rename never triggers Emitido to Em revisão" (`commit.ts` `buildBatch`), and the `scripts/test-reset.ts` pg-boss reset that misses `company_id` payloads. Product and device items stay with Matheus (E1-A1, E3-A1/A2/A5/A6, E4-A5/A6, E5-A3, E6-A4/A5, E12-A1/A3).

## Coordinator decisions (2026-09-26, before the batches)

- Batches and waves: C (carry-over) and O (8.3 OCR sidecar) in parallel; S (8.1) after C merges; R (8.4 + 8.5) after S and O merge; P (8.2 + 8.6) after R merges. Every agent on opus. Heavy commands (gate runs, `docker compose build ocr`, the sidecar test suite) take the host lock `flock /tmp/fasor-verify.lock`.
- Conflict 1: Story 8.2 builds the "Fotografar placa" tile (`.camera-capture-tile` in `.camera-group`) above the always-visible fields; there is no "Digitar" link (source-deltas D-6 wins).
- Conflict 2: the unknown manufacturer follows Story 8.5 (`suggested` plus the `create_registry_entry` hint, "Criar Celtta?"), not Flow 2b's "Verificar".
- Conflict 3: pending counts (Sumário header, a block not counted as filled while it holds pending suggestions, Sync "sugestões por confirmar", pre-issue "N fichas com sugestões por confirmar") are kernel functions over the device's suggestion rows passed as an explicit input; `RelatorioSnapshot` keeps only cell-referenced suggestions as the story says.
- Conflict 4: plates go to `ocr-svc` in the MVP; `textract` is Epic 11.
- Conflict 5: batch C fixes `scripts/test-reset.ts` to clear pg-boss jobs keyed by `company_id` as well as `companyId`.
- Contract: batch S makes the one contract change of the epic (`CONTRACT_VERSION` 5): a `suggestionPath(id)` create builder, an optional `hint: {create_registry_entry: {kind: 'manufacturer', name}} | null` on the suggestion row (so 8.5 adds no schema), and whatever the photo create needs to carry `reading_kind`, `reading_target` and `reading_status: queued` from the device. R and P add no op family unless a gap appears, and then say so in the PR.
- Tests seed pending suggestions through the server-op pattern of `e2e/support/push-server-ops.ts` (test-only); no production endpoint writes a suggestion except the reading job.
- Fixture plate (public repository): a synthetic transformer nameplate generated deterministically by a committed script in `services/ocr/tests/fixtures/` (Pillow, a font shipped in the image), committed as JPEG with its expected tokens JSON and a short `.md` listing what it prints: one value for each transformer nameplate field of the seed, manufacturer "Celtta" (absent from the seeded registry) and a 15 kV voltage. No client material. Batch O makes it; R builds the `fake` fixtures (keyed by its sha256, `outcome: ok|error|timeout`) from it, with one field whose value carries a digit its cited tokens lack (the `verify` field); P walks Flow 2b with it.
- OCR sidecar: PaddleOCR PP-OCRv5 detection with PARSeq recognition as the story says; if PARSeq cannot run on CPU inside a reasonable image, use PP-OCRv5 recognition and record the narrowing. Model weights are baked in at build time (the sidecar never downloads at runtime). The `ocr` service sits under the `ocr` compose profile, not started by default; the api reaches it through an `OCR_SERVICE_URL` env. `OCR_PROVIDER` and `LLM_PROVIDER` stay `fake` in compose and in every test; R proves the `ocr-svc` adapter with a stubbed HTTP server in `test:api` and one reported manual run against the real sidecar under the lock. Report the image size.
- Fake structuring writes `model: "fake"`, `prompt_version: "fake-1"`, `llm_usage` zeros.
- `POST /api/photos/{id}/reread` is batch R's (with a cross-tenant test); batch P wires "Tentar novamente".
- Derived texts ("3 leituras prontas para confirmar", "N fichas com sugestões por confirmar", "Confirmar N", sync counts) are kernel functions; fixed copy goes to `copy/pt-br.ts` or `copy/ui.ts`.
- S and P touch the sheet: both run `test:e2e:full` before their PR (E6-A2); P is the epic's last story PR.
