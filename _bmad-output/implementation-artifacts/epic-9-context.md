# Epic 9 Context: More assists: display reading, equipment identity, vision captions, dictation, NC drafts

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Each story adds one `reading_kind` or one input path to the reading pipeline Epic 8 built, so the engineer types less while nothing unconfirmed is ever written, counted or printed. "Ler visor" reads the instrument display: with signal it fills the next empty cells, without signal it only checks what was typed, and it is what brings a conforme seccionadora down to at most 20 taps and 15 keystrokes. "Fotografar equipamento" creates a block from a photo of the panel. Photos taken with no context get vision captions. Dictation fills captions, observations and readings. An NC row's photo gets a one-sentence observation draft. The whole epic is post-slice and off-cloud: the `fake` providers, the local `services/ocr` sidecar, no cloud account and no paid key.

## Stories

- Story 9.1: Read the instrument display with "Ler visor" (opus, high; DoR not complete, see Conflicts)
- Story 9.2: Create a block by photographing the equipment (opus, medium)
- Story 9.3: Caption context-less photos by vision, confirmed in batch (opus, medium)
- Story 9.4: Dictate a caption, an observation or a reading (opus, high)
- Story 9.5: Draft the NC observation from the row's photo (opus, medium)

## Requirements & Constraints

- **Confirm contract, all kinds.** Nothing unconfirmed is written, counted or printed. Typing discards that field's suggestion only. A filled field is never overwritten. No verdict and no NC row is ever suggested.
- **Low confidence.** A field with a known shape (a measurement cell, type/column/TAG) shows its best guess flagged Verificar. Prose (a caption, an observation, an NC draft, unparsed speech) is **never guessed**: it arrives as `suggested` or not at all. A caption the job cannot write stays "Sem legenda" and is listed at export.
- **Display (FR-36/37).** Each shot is one photo: `reading_kind: display`, `reading_target: {block_id, table_key, start_cell}`. Values fill the next empty cells in reading order from `start_cell`, one Suggestion per cell, each with its crop. Digit coverage applies. The unit is read from the display, or defaulted from the previous row.
  - Burst: one shot per row until "Concluir", with the count shown as "Ler visor · 3".
  - Offline: each target cell shows "Foto guardada — leitura quando houver sinal" and stays typeable.
  - Typed first: an equal value auto-confirms and attaches the crop silently. A different value shows "Visor: 147 GΩ · digitado 14,7 GΩ — Conferir" with a one-tap pick and is never overwritten.
  - The display path runs through `ocr-svc` (a seven-segment path in `services/ocr`). The story requires a spike, recorded in `docs/`, before building it.
- **Identity (FR-38).** One confirmation, "Criar SEC-C09-2 · Chave seccionadora · Coluna 9?", has a chip row to correct the type. One tap creates `equipment` + `block` in one batch, and the same photo becomes the block's plate with a `plate` reading queued. Offline, the block is created from the type list (type plus column gives the TAG) and the photo still becomes its plate.
- **Captions (FR-39, NFR-11).** A photo with no `block_id` and an empty caption is read as `caption`; the Suggestion targets `file/{id}/caption`.
  - A photo marked "Pessoas na foto" is never sent. The user sets the mark (no face detection) as a chip on the tile and in the import batch; the photo still prints with its context or typed caption.
  - Gallery: the tile shows the suggested caption in `meta` (amber fill, "Sugerido"). The composer shows it as a Suggestion with "Usar". The header offers "12 legendas sugeridas — Confirmar todas" as one batch, and `preIssue` lists the same count (a warning, never a block).
- **Dictation (FR-40, UX-DR18).** The engine sits behind one interface: the Web Speech API in pt-BR, or backend transcription, chosen by config.
  - Surfaces, in order: the caption field of the import batch and the Caption composer first, then Observation fields and Measurement tables.
  - The mic is 48 px, round and outlined, with "Ouvindo…" beside it while listening. The result is always a Suggestion.
  - The kernel parses a table utterance into row + value + unit ("Fase A, 147 giga" becomes Fase A: 147 GΩ). Unparsed speech lands in the observation as a suggestion.
  - No engine, or offline: the button is hidden, not disabled. No platform offers offline pt-BR recognition, so dictation is online-only.
- **NC draft (FR-75).** It applies to a checklist row marked NC that carries a photo: `reading_kind: nc_obs`, `reading_target: {block_id, item_key}`. The draft is one sentence, shown above the Observation field with "Usar". Typing keeps the engineer's text and discards the draft. It is last in the assist queue and first to be cut.
- **SM-3.** A fully conforme seccionadora with a copied plate, filled with signal, costs at most 20 taps and 15 keystrokes, measured by the Playwright walk. Offline it stays at about 36 keystrokes (the readings are typed).
- **Testing.** Every AC is automated. E8-A6 (pipeline e2e): at least one `@p1` e2e per pipeline feature goes from the UI entry point through the real job under `fake` providers, with no server-op seeding; display reading is the first user. Every new route gets a cross-tenant test. A PR touching `contract/ocr.ts`, the schema or `services/ocr` builds the sidecar and runs `pytest` under `flock /tmp/fasor-verify.lock`, and pastes the output.

## Technical Decisions

- Photo row (spine): `reading_kind?: plate|display|caption|panel|nc_obs` and `reading_target?: {block_id, block_type, table_key?, start_cell?, item_key?}` are set on the device at capture. `reading_status` is written only by `system:reading`.
- Jobs: one pg-boss `reading` job per `(photo_id, reading_kind)`. The LLM never emits coordinates. Env: `OCR_PROVIDER ∈ {fake, ocr-svc, textract}` and `LLM_PROVIDER ∈ {fake, anthropic, bedrock}`; compose and every test use `fake`. The `display` kind routes to `ocr-svc`. Textract and real Claude are Epic 11.
- Suggestions stay server-emitted rows (`suggestion` create is `serverOnly`). Suggestions the device computes itself are derived on read and are never rows. `RelatorioSnapshot` keeps only cell-referenced (confirmed) suggestions. Pending counts come from the device's rows, passed as explicit kernel input.
- Derived texts (counts, "Conferir" lines, "N legendas sugeridas") go in the kernel. Fixed copy goes in `copy/pt-br.ts` or `copy/ui.ts`.

## UX & Interaction Patterns

- **Ler visor.** Current reference: `prototype/screens/60-ficha.html`.
  - `.read-display-btn` is on each table title row (lines 516, 550, 564, 594, 699, 728) and in `.ficha-amb-actions` for the thermo-hygrometer (line 299).
  - Viewfinders are at lines 900-947: `.ficha-viewfinder` > `.vf-top`, `.vf-frame` > `.vf-display`, `.vf-bottom` > `.vf-stage[data-visor]` (`.vf-hint`, `.vf-shutter`, `.vf-done`), and "Concluir". Page-style state CSS is at lines 187-195.
  - Queued cell: `.field.suggestion-field.ficha-typed` holds `.measurement-field`, `.mf-unit.unit-cycle`, `.confirm-btn`, `.suggested-pill` and `.queued-banner` (lines 521 and 527).
  - The mock's burst runs one pass over three tables (contato aberto → fechado → resistência), where one photo fills three cells. The "Visor … Conferir" line is in no mock; `EXPERIENCE.md` gives its copy.
  - Older frames: `key-equipment-sheet.html` has no "Ler visor" at all, although the epic header cites it, and `key-sheet-states.html` is "to be reworked". Do not build from either.
- **Fotografar equipamento.** `prototype/screens/40-relatorio-overview.html`.
  - Palette: `.pal-camera` > `.camera-capture-tile` + `.camera-sub` (lines 288-300).
  - Viewfinder dialog: `.form-dialog.detect-dialog`, `.viewfinder`, `.vf-actions` with `.camera-capture-btn`, "Escolher o tipo" and the offline `.btn-reason` (lines 383-399).
  - Result: `.detect-result` with `.suggestion-field` (`.sv-main`/`.sv-sub`, `.crop-thumb`, `.confirm-btn`), `.prov-list`, the type chips `.chip-row.chips-recent[role=radiogroup]` + "Outro…", and "Fotografar de novo" (lines 400-437).
  - `key-relatorio-overview.html` lacks the field variant.
- **Captions.** `prototype/screens/70-fotos.html`.
  - Counter: line 110.
  - Banner: `.banner.sug-banner[data-variant=info]` + `.fotos-confirm-all` (lines 126-133).
  - Tiles: `.suggestion-field` block variant `.suggestion-block` (lines 140-250).
  - Composer: `71-legenda.html` lines 76-84, `.vision-line` with `.sv-kicker` "Sugerida pela foto".
  - `73-exportar.html` / `40-relatorio-overview.html` row 7 carry the count. "Pessoas na foto" appears in no mock.
- **Dictation.** `.dictation` > `.dictation-btn[aria-pressed]` + `.listening-word` "Ouvindo…" appears in `71-legenda.html` 155-157 (`.caption-dictation`), `70-fotos.html` 419, `72-pontos.html` 198-201 and `60-ficha.html` 384. Accessible names: "Ditar a legenda" and "Ditar observação do item N".
- **NC draft.** There is no frame on the sheet. The nearest pattern is `72-pontos.html:157` (`.sv` > `.sv-kicker` "Rascunho pela foto").
- **Mock-only markers.** `data-slice="out"` and `.slice-inline` are mock markers and are never rendered. These classes are in `components.css`: `.dictation-btn`, `.read-display-btn`, `.queued-banner`, `.listening-word`. These are page-local in the mocks and go into surface CSS: `.ficha-viewfinder`, `.detect-dialog`, `.sug-banner`, `.vision-line`.

## Code facts

- **Job:** `runReadingJob(deps, payload, attempt)` in `apps/api/src/jobs/reading/job.ts:148`.
  - It is plate-only: line 185 throws a permanent error for any other kind. It parses `plateReadingTargetSchema`, loads the nameplate `FieldDef`s, orients `print`, calls `providers.ocr.read` and then `providers.structuring.structure({image, ocr, fields})`, and runs `buildReadingSuggestions` (`packages/domain/src/reading/build.ts:58`, which hard-codes `sheetNameplatePath`).
  - It then commits one `applyServerBatch`: discard the photo's previous pending suggestions, create the new ones, and set `reading_status = done`.
  - Each new kind needs a per-kind branch (target schema, field defs, build).
- **Enqueue:** file receipt enqueues only `reading_kind === 'plate' && reading_status === 'queued'` (`apps/api/src/http/files.ts:335`, payload hard-coded `'plate'` at line 207). Reread: `apps/api/src/http/reading.ts`. Queue: `READING_QUEUE`, `enqueueReading` and the singleton `${photo_id}:${reading_kind}` (`worker.ts`). The `payload.ts` `readingKindSchema` already lists all five kinds.
- **Providers:** `createReadingProviders(config)` returns `(ctx: {photo_sha256, block_type}) => {ocr, structuring, ocr_name}` (`providers/index.ts:27-61`). The fake fixture is `fixtures/<sha256>.json` with `{outcome: ok|error|timeout, ocr, structuring}`. A photo with no fixture of its own falls back through `DEFAULT_FIXTURE_BY_BLOCK_TYPE` (`providers/fake.ts:45`; only `transformador_forca`), and `scaleOcrRead` fits the boxes to the re-encoded size. A device re-encode never matches a committed sha, so each new kind needs a default keyed by kind (and by test).
- **Contract** (`packages/domain/src/contract/ocr.ts`):
  - `OcrProvider.read(OcrImage{bytes, mime}) → OcrReadResult`.
  - `StructuringProvider.structure({image, ocr, fields: FieldDef[]}) → {output: {values: [{key, value, ocr_token_ids (min 1), confidence}]}, model, prompt_version, usage}`.
  - `OCR_SERVICE_ROUTES` = `POST /read`, `GET /health` (`services/ocr/app/main.py:61,88`; `pipeline.read_image`).
  - `CONTRACT_VERSION = 6` and `MIN_CONTRACT_VERSION = 6` (`contract/version.ts:32,51`): bump with a dated note.
- **Suggestion row** (`schemas/entities.ts:475`): `{id, relatorio_id, target_path, value, trust, mode, source: {photo_id, bbox tuple, ocr_token_ids, reading_run_id}, status, prompt_version, hint}`. Its only hint is `create_registry_entry` (manufacturer). There is no allowed-target whitelist, but the kernel helpers only understand `sheet/*` paths:
  - `suggestionBlockId`, `blocksWithPendingSuggestions` and `pendingByNameplateField` (`relatorio/suggestions.ts`).
  - Device auto-confirm `autoConfirmPending` handles only `sheet/nameplate` (`apps/web/src/db/suggestion-store.ts:45`, filter around line 70).
  - `compareSuggestion(cellValue, suggestionValue, fieldDef) → 'equal'|'different'` (line 165); `suggestionView` returns fill/replace/none.
- **Paths** (`ops/path.ts`): `sheetTestCellPath(blockId, testKey, row, col)` (the path says `test_key`, the spine says `table_key`), `sheetChecklistPath(blockId, itemKey, 'observation')`, `sheetObservationsPath`, `locationEnvPath(id, field)` (thermo-hygrometer, not a `sheet/*` path) and `fileFieldPath(id, 'caption')`.
  - `FILE_FIELDS = ['caption','block_id','item_key','removed_at']`: there is no people mark, and `reading_kind`/`reading_target` are create-only. `FILE_SERVER_FIELDS` holds `reading_status`.
  - Seed columns: `30 SEGUNDOS` and `ESTAB./10MIN` are `role: 'print'` (`seed/schema.ts:55-66`, `v1.ts:365-367`); only `1 MINUTO` is a capture cell.
- **Device capture:** `CaptureTarget {blockId, itemKey, caption, reading?}` (`surfaces/ficha/use-photo-capture.ts:27`). `PhotoCaptureInput.reading?: {kind, target}` and `photoCreateDraft` are in `db/file-commit.ts:65-107`. The camera is `useCamera` (`camera-view.tsx`). Import: `importPhotoFiles(files, ImportTarget, deps)` (`files/photo-import.ts:84`), with `usePhotoImport`/`PhotoCaptureSheet` (`surfaces/photos/capture-sheet.tsx`). `orderUploads` ranks queued readings first.
- **UI components:**
  - `SuggestionField({label, children, onConfirm, crop?, state: suggested|verify|confirmed, announcement, combobox, bare, after, confirmLabel})` in `components/suggestion-field.tsx`; `CropThumb` in `components/crop-thumb.tsx`.
  - Tables: `MeasurementField` (`surfaces/ficha/measurement-field.tsx`) in `EnsaiosSection`. `ChecklistSection` is in `checklist-section.tsx`, and `cabine-block.tsx` writes `location/{id}/env/*`.
  - Photos: `PhotoRow` (`components/photo-row.tsx`), `GallerySurface` and `CaptionComposer` + `LegendarButton` (`surfaces/photos/`).
  - There is no speech code at all; only the `tokens.css:229` dictation tokens exist.
- **Block creation:** `FieldPalette({target, seedVersion, locations, blocks, equipment, onCreate, onClose})` in `surfaces/relatorio/block-palette-field.tsx:59`. `useTreeActions` builds `newEquipmentBlock(...)` (`relatorio/tree.ts:400`) and commits `[createEquipmentOp, createBlockOp]` as one batch (`tree-actions.ts:234-248`).
- **Kernel:**
  - `preIssue(snapshot, progress, context)`, where `context.pendingSuggestions` feeds `suggestions_pending` (section 9 only; `pre-issue.ts:275-278`). There is no caption row yet (section 7 has `photos_uncaptioned`, `photos_pending_upload` and `photos_upload_error`).
  - `syncCounts(outbox, {suggestions, photos})` (`sync/counts.ts:54`).
  - Parse: `parseReadingPtBr(input, options)`, `parseDecimalPtBr` and `INSULATION_UNITS` (`parse/pt-br-number.ts`); no utterance parser yet.
- **E2E helpers:**
  - `pushSuggestion(companyId, relatorioId, {targetPath, value, trust?, photoId?...})` (`e2e/support/push-server-ops.ts:93`).
  - `pushReadingStatus` and `pushPlateSuggestions` in `e2e/support/reading-ops.ts:37,106`, along with `holdPhotoBytes` and `openTransformerSheet`.
  - Specs force the file-input camera fallback by rejecting `getUserMedia` (`e2e/plate-reading.spec.ts:40-45`).
  - Taps and keys: `tapCounter` and `humanTap` (`e2e/support/taps.ts`). `TAP_BUDGET` (offline J1 9 taps/36 keys) is at `e2e/tap-budget.spec.ts:34`.

## Cross-Story Dependencies

- **Build order** (delivery wait order): 9.1 first; then 9.3 (with caption dictation from 9.4, which source-deltas makes the first dictation surface); then 9.2; then 9.5 and the rest of 9.4. If time runs short, cut 9.5, then 9.2, then 9.3, then 9.1.
- **Shared contract:** 9.1, 9.2, 9.3 and 9.5 all touch `job.ts`, the file-receipt enqueue and the fake fixture fallback. One batch should generalize the job per kind (and bump the contract once) before the per-kind stories.
- **Other epics:** Epic 9 builds on Epic 8 (the pipeline, the Suggestion UI, the E78 narrowings), Story 6.x (capture, import, the composer) and Story 5.5 (measurement cells). Epic 10 owns the multi-device merge; Epic 11 owns Textract, real Claude and the purge.

## Conflicts to resolve

1. **9.1, megôhmetro unit and range.** The DMG10Ki shows no unit or range, so "unit read from the display" is impossible for it (E8-A3 is open with Matheus).
   - Options: take the unit from the table cell's unit slot or the previous row; the engineer picks the range in the viewfinder; or the test header gives it.
   - Conservative: never infer a unit the display does not print. Take it from the previous row or the column default, and flag `verify` when the magnitude is ambiguous.
2. **9.1, spike data.** The spike base set sits in `docs/media/display-spike/`, which is gitignored client material (and absent from other checkouts), and the repo is public. The DoR still lacks real tablet photos and a decision on 2 ambiguous crops (E8-A8).
   - Conservative: record the spike method and numbers in a tracked doc that cites the path. Commit only synthetic seven-segment fixtures, generated by a script (as `make_plate.py` does). Never commit the web references. Do not start 9.1 until Matheus marks the DoR ready.
3. **9.1, "30 s, 1 min and 10 min fill three cells".** The seed makes `30 SEGUNDOS`/`ESTAB./10MIN` print-only, and the mock's "three cells" are three phases.
   - Conservative: fill capture cells only, in reading order from `start_cell`. Drop and log the extra stored values.
4. **9.1, target naming and families.** The story/spine say `table_key` while paths use `test_key`. The thermo-hygrometer targets `location/{id}/env/*`, which the `sheet/*`-only helpers and auto-confirm ignore.
   - Conservative: store `table_key` holding the test key. Extend `suggestionBlockId`, auto-confirm and the counts to test cells and env fields in the kernel.
5. **SM-3 walk.** The measured budget exists only offline (J1 9/36). With signal, the walk needs default display fixtures by kind, because device re-encoding breaks sha keying.
   - Conservative: a new walk under `fake`, with arrival via "Sincronizar agora", asserting ≤ 20 taps and ≤ 15 keys. Keep the offline budget as is.
6. **9.2, panel under fake providers and a single `reading_kind`.** The photo row holds one create-only `reading_kind`. The structuring contract is keyed by nameplate `FieldDef`s. A block that does not exist yet has no target path.
   - Options: make `reading_kind`/`reading_target` client file fields (contract bump) so confirming re-targets the photo to `plate`, and the server enqueues on that op; or make a new photo row (duplicate bytes; rejected).
   - Conservative: the first option. Emit the panel suggestion on an existing path (for example `file/{id}/block_id` with `{type, column, tag}`), and let the device compose the create batch.
   - Copy differs three ways: the story says "Criar SEC-C09-2 · … ?", the mock says "Sugestão: … · SEC-C09" + Confirmar, and `EXPERIENCE.md` says "Criar SEC-C09 em Coluna 9?". The story follows FR-38; use it.
7. **9.3, "Pessoas na foto" and timing.** No mock, no field and no op path exist for the mark. `reading_kind` is fixed at create, but the mark, a typed caption or "De qual equipamento?" can arrive later.
   - Conservative: a new client file field (contract bump), rendered with the existing `.chip[aria-pressed]`. The device sets `caption` at create. The job re-checks at run time (people mark, caption, `block_id`) and ends `done` with no suggestion.
8. **9.3/9.5, prose vs the contract.** The structuring output requires `ocr_token_ids` (min 1) and a bbox; prose has neither. The `70-fotos.html` photo 5 shows a caption "Verificar", which contradicts "prose never guessed". The composer mock says "Confirmar" where the story says "Usar".
   - Conservative: a prose output shape `{text} | null`, no OCR call, a full-image bbox, empty token ids, `trust` always `suggested`. Drop the mock's Verificar caption. Follow the story's "Usar".
9. **9.4, engine and policy.** Chrome's Web Speech API sends audio to Google, and WebKit lacks it. Backend transcription would be a new service. Playwright cannot speak. The spirit of the policy is no cloud dependency before Epic 11. Suggestions are server-only rows, yet the story wants device-produced Suggestions.
   - Conservative: an engine interface in `apps/web` with `webspeech` and `fake`, selected by config and hidden when absent. Tests use `fake`. Matheus confirms sending audio to Google before `webspeech` defaults on.
   - The dictated result is component state rendered as a SuggestionField (derived, never a row). Confirming writes a plain value op. The kernel parses utterances in `packages/domain/parse`.
10. **9.5, NC state drift.** A photo taken before the row turns NC gets no `nc_obs`. A row may turn C, or be typed into, before the job runs.
    - Conservative: set `nc_obs` only on a photo taken from an NC row. The job re-checks that the row is still NC with an empty observation, and otherwise emits nothing.

## Carry-over from earlier epics (one agent batch, first)

- **E7-A1/E8-A1 (gate time).**
  - What: surfaces run `buildSnapshot(state, relatorioId)` in a `useMemo` over the whole live state (for example `ficha-surface.tsx:67`; `db/snapshot.ts` `toSnapshot`). Make it incremental while keeping AD-13.
  - Proof: a before/after of commit-to-render on the standard relatório (~223 ops); `verify` ≤ 900 s in two consecutive runs; `@p0` ≤ 600 s; 3 green `test:e2e:full --workers=3` runs before `PARALLEL_WORKERS` (in `e2e/support/groups.ts`) goes above 1.
- **E7-A7/E8-A2 (no download at gate start).**
  - What: `Dockerfile.tools:4-12` already does `corepack enable` + `prepare pnpm@12.5.1`, yet a gate start still reached registry.npmjs.org.
  - Proof: a gate started with the network off gets past install.
- **E7-A2 dev part.** Give load-independent waits to `apps/web/src/surfaces/templates/template-composer-undo.test.tsx`, `surfaces/relatorio/setup-surface.test.tsx` and `surfaces/relatorio/relatorio-tree-edits.test.tsx`. Target: 0 timeouts across the epic's gates.
- **E7-A3 dev part.** In the Porto Seguro fixture TTR, change `tap_atual: '13200'` and `ratio.p: '13200'` to `13.2` (`packages/domain/fixtures/porto-seguro/data.ts:355,363,374`), then regenerate the affected goldens.
- **E7-A4.** Fix or re-own each open row, and close the stale missing-certificate entry (`deferred-work.md:845`), which `pre-issue.ts:362` `certificate_missing` already builds. The rows:
  - the calibration row over `section11Instruments` (`deferred-work.md:838`)
  - `cert_number_mismatch` (851)
  - the small fixture's `sub_blocks: {}` (863)
  - `unpaired_cable` (869)
  - the ÍNDICE 9.x entries (881)
  - the section 9 first-sheet page split (893)
- **E8-A5.**
  - E78-R1 (1019): an outline outside the bbox with a minimum height, or zoom to the focused field (`plateCropRegion`/`padCropToAspect`, `plate-photo.tsx`).
  - EXIF orientation of `thumb`/`print` (959): `renderVariants`, `apps/api/src/storage/variants.ts:51`.
  - Crop-blob eviction (929): `runEviction`, `db/file-store.ts:178`.
  - Re-download (947): `cropSourceBlob`, `db/file-store.ts:276`.
  - Close the stale "tile stays queued" entry (977) with the QA refutation.
  - Each item ends with a test or a reason.
- **Home layout (1031, decided by Matheus 2026-09-26).**
  - What: an `app.css` rule puts `.app-bar-right` in grid column 3, with a comment naming the `key-home.html` defect; add a centering rule for the capped column on surfaces without a rail. Add a dated line in `DESIGN.md`, make the same fix in `key-home.html`'s `<style>`, and add a `@p0` test on Home and `/cadastros` at 390/768/1280/1906.
  - Proof: a real-browser pass in light and dark plus a dialog.

**Triage of the other open `deferred-work.md` entries (by line).**

- (a) closable now by an agent: 41
- (b) stale: 10
- (c) needs Matheus, Bruno or a device: 29
- (d) later epic: 13

(a) Closable now by an agent:
- 51 cross-tenant sweep for later routes
- 69 `revokeSessions` null company
- 129 log `relatorio_id` assert
- 135 account calls on contract routes
- 147 re-auth dismiss fires sync
- 201 `migrate.ts` test
- 249 sample-relatório seed flag
- 273 projectUser lock
- 279 `prev_op_id` lookup
- 285 parallel reseed 401
- 291 FilterChipGroup arrows
- 297 draft-toast Esc and early "Sincronizado"
- 303 registries component tests
- 315 SW pin per user
- 321 build stamp
- 327 register.ts chunk
- 339 registry merge O(n)
- 351 double `uploaded_at`
- 381 create id re-check
- 387 two PreIssueRow shapes
- 411 dropped template row
- 417 seed idempotency
- 423 `companyDownloaded` to kernel
- 429 annotate `extract-raw-sources.md`
- 459 fixture `dataQueue` zip
- 465 `'2T'` raw cells (4 left)
- 477 archived template count
- 489 composer index actions
- 495 QuantityStepper guard
- 513 `flattenSectionText`
- 525 PR #21 notes
- 549 `unchanged` short-circuit
- 555 blind `not_caught_up` retry
- 567 logo header line
- 573 generate watcher
- 579 job expiry clock
- 652 sheet removal tombstones equipment
- 826 sidecar drift check (E8-A4)
- 953 only plate readings (closed by Stories 9.1-9.5)
- 1007 retry after reload
- 1013 `reading-dead` letter

(b) Stale, with the evidence checked in code:
- 57: the registration commits `user/{id}/{field}` (`registration-dialog.tsx:32`).
- 117: `commit.ts:103` stamps `device_id`.
- 171: `syncCounts(outbox, reading)` was decided without a snapshot.
- 225: drafts are registered by `ficha-fields.tsx` and `generated-text-field.tsx`.
- 453: VAL CALCULADO is built in `readings.ts`; the TAP part lives on in 670.
- 501: `enabledSubBlocks` is used in `print/section-9.ts` and `readings.ts`.
- 507: `pre-issue.ts:229` reads `unresolved`.
- 615: `etapa6-parecer.tsx` exists.
- 724: `plate-photo.tsx` exists.
- 730: `pre-issue.ts:251` has `photos_pending_upload`.

(c) Needs Matheus, Bruno or a device:
- 39 visual test tier
- 111 coalescing (architect)
- 231, 237, 243 WebKit limits (iPad script)
- 255 upstream audit advisory
- 261 migration 0003 history
- 267 re-keyed slug devices
- 345 two close controls
- 393 Empresa phone chrome
- 399 `:has()` browser target
- 435 section 8 bullet wording
- 441 no CNPJ in source
- 447 calibration data source
- 633 office palette inside a sheet
- 646 Q4 TAG reuse
- 670 "Adicionar TAP"
- 754, 760, 766, 772, 784 photo narrowings (766, the "Geral" gallery shot, feeds 9.3)
- 778 HEIC on a device
- 857 points questions
- 875 who writes `feeds_block_id`
- 887 not-tested photos
- 995 virtual Sumário rows
- 1001 plate tile on other types
- 1025 E78-R2 "concluída"

(d) Later epic:
- Epic 10: 105 and 165 (progress in the pull summary), 159 dead-create resend, 309 stale instrument panel, 333 merged registry ids, 369 two empresa rows, 682 E12-R1 template upgrade.
- Epic 11: 123, 207 and 153 (retention of outbox and `remote_ops`), 195 image tags, 375 MinIO/S3 key shadowing, 736 geolocation denial op.

## Coordinator decisions (2026-09-28, before the batches)

Matheus asked (2026-09-28) for Epic 9 end to end with strict token economy, parallel where possible, the carry-overs of earlier epics settled, then one integrated review and human-style Playwright QA, fixes, and the retrospective. Every agent runs on opus. The 9.1 DoR gaps (E8-A8) and the product questions below stay open for Matheus; each batch takes the conservative reading and lists it as an open question in its PR (E4-A8).

- **Batches and waves.** Wave 1, in parallel: C1 (named carry-over), D (Story 9.1 plus the per-kind job generalization), V (Story 9.4). Wave 2, after D merges, in parallel: K (Stories 9.3 + 9.5, the two prose kinds), P (Story 9.2), C2 (the (a) and (b) triage entries). Gates serialize through `flock /tmp/fasor-verify.lock`.
- **Job generalization (batch D owns it).** D turns `runReadingJob` into a dispatch over a per-kind handler registry (one module per kind under `apps/api/src/jobs/reading/kinds/`, each owning its target schema, its field definitions or prompt, and its suggestion build), generalizes the file-receipt enqueue from `plate` to every kind with `reading_status === 'queued'`, and replaces `DEFAULT_FIXTURE_BY_BLOCK_TYPE` with a fallback keyed by `(reading_kind, block_type?)`. Plate keeps its behavior byte for byte. D's PR names the handler interface so K and P add one module each.
- **Contract versions.** Each batch that adds or changes an op family bumps `CONTRACT_VERSION` to main's value + 1 with a dated note; a batch that merges a main that already moved re-bumps to the new main + 1. `MIN_CONTRACT_VERSION` follows only when old clients must stop.
- **Conflict 1 (9.1 unit and range).** Never infer a unit the display does not print. The unit comes from the display when printed (thermo-hygrometer), else from the cell's unit slot, the previous row or the column default; a value whose magnitude depends on an unseen range is `verify`. The range source stays an E8-A3 question for Matheus.
- **Conflict 2 (9.1 spike).** D runs the spike read-only against `/home/matheus/Documentos/fasor/docs/media/display-spike/` (absolute path in the main checkout, mounted read-only into the sidecar container; never copied into the worktree or a tracked file) and records method, accuracy per display family and the chosen approach in a tracked `docs/display-reading-spike.md` that cites the path and contains no images, client names or serials. Tests and fixtures use synthetic seven-segment and LCD images generated by a committed script (the `make_plate.py` pattern). The 2 ambiguous crops are excluded from the accuracy count and listed.
- **Conflict 3 (three stored values).** Fill capture cells only, in reading order from `start_cell`; values for print-only columns are dropped and logged in the run. Open question.
- **Conflict 4 (targets).** `reading_target.table_key` holds the seed test key; the kernel suggestion helpers, auto-confirm, counts and `compareSuggestion` extend to `sheet/*/tests/*` cells and `location/{id}/env/*` fields.
- **Conflict 5 (SM-3).** A new Playwright walk under `fake` with a default display fixture keyed by kind, arrival through "Sincronizar agora", asserting at most 20 taps and 15 keystrokes; the offline J1 budget stays as it is.
- **Conflict 6 (9.2).** `reading_kind` and `reading_target` become client-writable file fields (P's contract bump) so confirming re-targets the photo to `plate` and the server enqueues on that op; no duplicate photo row. The panel suggestion targets an existing path on the photo; the device composes the one create batch (equipment + block + photo re-target). Copy follows the story: "Criar SEC-C09-2 · Chave seccionadora · Coluna 9?".
- **Conflict 7 (9.3 people mark).** A client file field `people_in_photo: boolean` (K's contract bump), rendered as `.chip[aria-pressed]` "Pessoas na foto" on the tile and in the import batch. The job re-checks at run time (people mark, caption, `block_id`) and ends `done` with no suggestion when any is set.
- **Conflict 8 (prose).** Captions and NC drafts use a prose output `{text} | null` with no OCR call, a full-image bbox, empty `ocr_token_ids` (the suggestion row schema allows empty for prose kinds only), `trust` always `suggested`. The mock's "Verificar" caption is not built. The button says "Usar" as the story says.
- **Conflict 9 (dictation).** An engine interface in `apps/web` with `webspeech`, `fake` and `none`, chosen by a Vite env (`VITE_SPEECH_ENGINE`, default `webspeech`); the button is hidden when the engine is absent or the device is offline. Tests use `fake`. The dictated result is component state rendered as a SuggestionField (derived, never a row); confirming writes the plain value op. The utterance parser lives in `packages/domain/src/parse`. Sending audio to the browser vendor's service is an open question for Matheus (no consent text in the POC, as in Epic 8).
- **Conflict 10 (NC drift).** `nc_obs` is set only on a photo taken from a row marked NC; the job re-checks that the row is still NC with an empty observation and otherwise emits nothing.
- **Pipeline e2e (E8-A6).** Each pipeline story (9.1, 9.2, 9.3, 9.5) ships one `@p1` e2e from the UI entry through the real job under `fake` providers, with no server-op seeding.
- **Sidecar gate (E8-A4).** A PR touching `contract/ocr.ts`, the committed schema or `services/ocr` builds the sidecar and runs its pytest under the lock and pastes the output.
- **Test time.** C1 owns the gate-time work (E7-A1/E8-A1); feature batches do not raise `PARALLEL_WORKERS`. A batch touching the sheet, the gallery or the relatório overview runs `test:e2e:full` before its PR.
