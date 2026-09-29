---
title: 'Story 9.2: Create a block by photographing the equipment'
type: 'feature'
created: '2026-09-28'
status: 'done'
baseline_revision: '2abf8db19201f12c644b89ce4b2f707dff33b163'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: medium
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
warnings: ['batched', 'oversized']
batched_reason: 'Batch P of Epic 9 (one story): the panel reading kind, the client re-target contract bump and the palette camera row ship together because the create batch needs all three.'
deferred:
  - summary: >-
      "Desfazer" after a photo-backed create is untested, and what it should do is open (it reverts the batch, so the photo goes back to a panel photo and a panel reading is re-queued).
    evidence: |-
      tree-actions.ts createPair appends panelRetargetOps and the suggestion status put to the undoable batch; no spec clicks "Desfazer" after a panel confirm. Owner: Epic 9 integrated review (product question for Matheus).
    location: >-
      apps/web/src/surfaces/relatorio/tree-actions.ts
    severity: medium
  - summary: >-
      A client may put any of the five reading kinds on its own company's photo and so re-queue or re-read it; only plate is needed.
    evidence: |-
      apps/api/src/sync/apply.ts clientReadingPutIsValid accepts every kind in READING_KINDS; no cross-tenant effect (tenant check runs first). Hardening (plate only, or a kind with a handler and a matching target) left to the integrated review.
    location: >-
      apps/api/src/sync/apply.ts
    severity: medium
---

<intent-contract>

## Intent

**Problem:** An equipment missing from the drawing costs a palette pass plus a separate plate shot; the reading pipeline has no `panel` kind, and a photo's `reading_kind`/`reading_target` are create-only, so a panel photo cannot become the new block's plate.

**Approach:** Add the `panel` reading kind (type + column from a panel-front photo, one pending suggestion on the photo), make `reading_kind`/`reading_target` client-writable file fields (contract 7; a `reading_kind` put re-queues the reading and the server enqueues it), and give the field Block palette a first row "Fotografar equipamento" whose result dialog composes, in the kernel, "Criar SEC-C09-2 · Chave seccionadora · Coluna 9?" with a type chip row; one tap commits equipment + block + the photo re-targeted to `plate`. Offline, the same dialog offers the type chips only.

## Boundaries & Constraints

**Always:**
- Kernel owns every derived value and text (AD-1/AD-13): panel value parse, the proposal (type, location, TAG via `suggestTag`, trust), the "Criar …?" line, the chip order, the provenance lines, the re-target ops. `apps/web` renders from IndexedDB and writes ops only. Fixed copy in `copy/pt-br.ts` (verbatim from the mock, or marked `// authored:`).
- Nothing unconfirmed is written: the block exists only after the tap; the panel suggestion never counts anywhere (its target `file/{id}/block_id` is not a `sheet/*`/`location/env` path, so `suggestionTarget` returns null; keep it so).
- One batch per confirm: `equipment` create, `block` create, `file/{photo}/block_id`, `file/{photo}/caption` (= `PLATE_CAPTION`), `file/{photo}/reading_target` (`plateReadingTarget(block)`), `file/{photo}/reading_kind` = `plate`, and, when a panel suggestion exists, `suggestion/{id}/status` (`confirmed` when the chosen type and location are the suggested ones, else `discarded`).
- `applyOp` (both sides): a `file/{id}/reading_kind` put with a non-null value on a photo also sets `reading_status: 'queued'` (the `template/field` version-bump precedent in `ops/apply.ts`). No client write of `reading_status` ever.
- Mock classes from `40-relatorio-overview.html` (grep, never read whole): `.pal-camera` > `.camera-capture-tile` + `.camera-sub` (288-300); `.form-dialog.detect-dialog`, `.detect-result`, `.suggestion-field` (`.crop-thumb`, `.sv`/`.sv-main`/`.sv-sub`, `.confirm-btn`, `.suggested-pill`), `.prov-list`, `.chip-row.chips-recent` + `.chip-other`, `.helper`, `.btn-reason`, `.dialog-actions` (383-437); page-local CSS lines 25-27 and 39-60 go into `relatorio.css`, `.frame-phone` rules translated per AGENTS.md in `app.css` (or the surface CSS with the same media query and a comment).
- Everything in Docker; `OCR_PROVIDER`/`LLM_PROVIDER` stay `fake`.

**Never:**
- No change to `packages/domain/src/contract/ocr.ts`, the OCR schema or `services/ocr` (the panel uses the existing text OCR + structuring with its own `FieldDef[]`).
- No new photo row for the plate (Conflict 6), no auto-created column, no navigation to the ficha after the create (keep the palette's reveal + toast + "Desfazer").
- No edit of `sprint-status.yaml` or `epics.md`. No `PARALLEL_WORKERS` change.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Panel read ok | fake default fixture: type `chave_seccionadora` conf .93, column `C09` conf .95; cabine has live "Coluna 9"; `SEC-C09` taken | one pending suggestion `file/{photo}/block_id` = `{block_type:'chave_seccionadora', column:9, column_text:'C09'}`, `suggested`; dialog: "Criar SEC-C09-2 · Chave seccionadora · Coluna 9?", chip "Chave seccionadora" pressed | - |
| Low confidence | type conf < 0.5 (`PANEL_MIN_CONFIDENCE`) | same row, `trust: verify`; dialog shows the guess with the "Verificar" pill, chips to correct | - |
| Unknown type | type not one of the eight, or absent; column read | value `block_type: null`; dialog: no chip pressed, no "Criar" line until a chip is tapped | - |
| Nothing read | neither type nor column | `done`, zero suggestions; dialog stays on the chips | - |
| Column not in cabine | read column 9, no live "Coluna 9" under the palette location's cabine | location = the palette's location, the proposal is `verify` | - |
| Chip correction | suggestion SEC; user taps "Outro…" then "Transformador" | line re-composes (`TR-n`, "Transformador", location); confirm discards the suggestion | - |
| Offline | no signal at the shot | photo `reading_kind: panel`, `queued`, target `{location_id}`; dialog shows `.btn-reason` offline line and all eight chips; tap chip + Confirmar commits the batch; photo row now `plate`/`queued`/`block_id` new block | upload later enqueues `plate` (file receipt reads the row) |
| Re-target while panel job pending | `reading_kind` put lands before/while the panel job runs | panel job ends without writing `failed` or `done` (superseded, logged, run row `error: superseded`); plate job runs | - |
| Bad panel target | target does not parse, location gone or of another relatório | permanent failure, `failed` | as plate |
| Client put invalid | `file/{id}/reading_kind` value not one of the five kinds, or `reading_target` not an object | push answers `op_invalid` for that op | - |
| Cancel / "Fotografar de novo" | after the shot | the unconfirmed photo is removed (`file/{id}/removed_at`) and its pending suggestion discarded, in one batch; "Fotografar de novo" reopens the camera | - |

</intent-contract>

## Code Map

- `apps/api/src/jobs/reading/kinds/{types,index,plate,display,shared}.ts` -- handler contract (Story 9.1); add `panel.ts` + one line in `READING_KIND_HANDLERS`. `display.ts` shows the cabine-location lookup pattern (env target) to mirror for the panel's `location_id`.
- `apps/api/src/jobs/reading/job.ts:158` -- kind mismatch throws permanent (writes `failed`): change to superseded (no status write); `before` hook (~208) re-reads pending only: also re-read the photo's `reading_kind` inside the tx and abort as superseded when it moved.
- `apps/api/src/jobs/reading/providers/fake.ts` + `fixtures/README.md` + `providers/fake.test.ts` -- defaults by kind; committed images live in `fixtures/images/` (the test checks every fixture names a committed image).
- `apps/api/src/http/files.ts:195-220,335` -- `queueReading` (startReading + `writeReadingFailed` on `ReadingSendError`); extract to a shared helper (e.g. `jobs/reading/send.ts`) reused by the sync route. `http/app.ts:145-161` -- `sendReading` wiring; pass it to `createSyncRoutes` too.
- `apps/api/src/sync/routes.ts:67-97` -- push route; after `applyOps`, for each applied client `file/{id}/reading_kind` put, send the reading when the row is a live photo with `uploaded_at` set and `reading_status === 'queued'`.
- `apps/api/src/sync/apply.ts:76-127` -- client validation (`clientReadingFieldsAreValid` pattern): add the put checks for `reading_kind`/`reading_target`.
- `apps/api/src/sync/suggestion.integration.test.ts:163-260` -- `photoCreate` helper and client-refusal cases to mirror; `http/files-reading.integration.test.ts` -- upload + enqueue pattern.
- `packages/domain/src/ops/path.ts:48,113,238,460` -- `FILE_FIELDS` gains `reading_kind`, `reading_target`; `fileFieldPath` type follows. `ops/apply.ts:292-296` -- `file/field` write (side effect here).
- `packages/domain/src/contract/version.ts` -- `CONTRACT_VERSION` 6 -> 7 and `MIN_CONTRACT_VERSION` 6 -> 7 with dated notes (a v6 bundle cannot parse the new `file/{id}/reading_kind` path in a pull); fix any test pinning the number.
- `packages/domain/src/reading/{target,build,boxes,index}.ts` -- `plateReadingTarget`, `buildReadingSuggestions` (row shape, bbox via `unionBox`/`normalizeBox`, `ocr_token_ids`) to mirror in `reading/panel.ts`.
- `packages/domain/src/relatorio/{tag,tree,suggestions}.ts` -- `suggestTag`, `locationCode`, `TAG_PREFIX`, `blockTypeLabel` (via `paletteItems`), `newEquipmentBlock`, `PLATE_CAPTION`, `platePhotoOf`, `discardSuggestionOp`, `suggestionTarget`.
- `apps/web/src/surfaces/relatorio/block-palette-field.tsx` -- `FieldPalette`; add the `.pal-camera` first row (prop `onPhotograph`); `copy.sumario.palette.chooseType` becomes the mock's "Ou escolha o tipo · TAG sugerida por tipo + coluna" (line 303).
- `apps/web/src/surfaces/relatorio/relatorio-tree.tsx:321-333` -- mounts `FieldPalette`; the camera and result dialog must live here (the palette unmounts when the tile closes it).
- `apps/web/src/surfaces/relatorio/tree-actions.ts:214-275` -- `createPair` (TAG recomputed on fresh equipment at write, `newEquipmentBlock`, reveal + toast + undo): extend with an optional `photo` input that appends the kernel's re-target ops to the same batch.
- `apps/web/src/surfaces/ficha/{camera-view,photo-openers,use-photo-capture}.tsx|ts` -- `useCamera(..., {singleShot:true})` as `PlateCaptureTile` uses it; `shoot` mints `fileId` inside (`use-photo-capture.ts:~128`): add an optional preminted `CaptureTarget.fileId` so the caller knows the photo id. `db/file-commit.ts:65-139` -- `PhotoCaptureInput.reading`.
- `apps/web/src/components/{suggestion-field,crop-thumb}.tsx`, `components/dialog-shell.tsx` -- reuse; `surfaces/photos/caption-composer.tsx:257` -- a `.chip-row.chips-recent` chip group to mirror.
- E2E: `e2e/plate-reading.spec.ts` (getUserMedia rejected -> file-input fallback, `devicePhotos`, `readStore` outbox), `e2e/tree.spec.ts` (opening the palette), `e2e/support/push-server-ops.ts:93` `pushSuggestion`, `e2e/support/groups.ts` `SERIAL_SPECS`.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/reading/panel.ts` (+ `index.ts`, tests) -- `panelReadingTargetSchema` (`{location_id}` loose), `panelReadingTarget(locationId)`, `PANEL_FIELDS: FieldDef[]` (`block_type` select of the eight types, `column` text), `PANEL_MIN_CONFIDENCE = 0.5`, `panelSuggestionValueSchema` `{block_type: EquipmentBlockType|null, column: number|null, column_text: string|null}`, `buildPanelSuggestion(input)` -> `{rows, dropped}`: type kept only if one of the eight, column = first integer 1-99 in the value ("C09", "9", "Coluna 9"), no row when both null, `verify` when a kept value's confidence < 0.5, bbox = union of cited tokens normalized, target `fileFieldPath(photoId,'block_id')`, `mode: 'fill'`.
- `packages/domain/src/relatorio/panel.ts` (+ tests) -- `panelSuggestionOf(pending, photoId)` (newest pending on `file/{photoId}/block_id`), `panelLocation(locations, paletteLocationId, column)` (the palette location's cabine = itself or its parent; its live child coluna whose `locationCode` is `C` + two digits of column; else the palette location, `matched: false`), `panelTypeChips(seedVersion, first, expanded)` (collapsed: `first` then the next three in seed order, wrapping, plus "Outro…"; expanded or `first` null: all eight in seed order), `panelProposal({seedVersion, locations, equipment, paletteLocationId, suggestion, pickedType})` -> `{type, typeLabel, location, tag, trust: 'suggested'|'verify'|null, text, suggestionStatus}` (`pickedType` wins; TAG = `suggestTag(type, location, equipment)`; trust null when the type was picked by hand; `verify` when the suggestion is verify or the column did not match), `panelCreateText(tag, typeLabel, locationName)` = `Criar ${tag} · ${typeLabel} · ${locationName}?`, `panelProvenance(...)` (three `.prov-list` items), `panelRetargetOps(author, relatorioId, photoId, block)` (the four file puts), `panelCancelOps(author, relatorioId, photoId, suggestion|null)`.
- `packages/domain/src/ops/{path,apply}.ts`, `contract/version.ts` (+ tests) -- the two new `FILE_FIELDS`; the `reading_status: 'queued'` side effect; version 7 / min 7 notes dated 2026-09-28.
- `apps/api/src/jobs/reading/kinds/panel.ts`, `kinds/index.ts` -- `prepare`: parse target (else permanent), live cabine/coluna location of the photo's relatório (else permanent); `fixture {block_type:null, table_key:null}`; `run`: `readOcr(..., {mode:'text'})`, `structure({fields: PANEL_FIELDS})`, `buildPanelSuggestion`. `fakeDefaults: [{sha256: <panel fixture>}]`.
- `apps/api/src/jobs/reading/fixtures/images/panel-seccionadora.png` + `<sha256>.json` + README row -- a synthetic panel front made with sharp from an SVG (label "C09", text "SECCIONADORA"; record the one-off command in the README), OCR tokens with boxes, structuring values `block_type` `chave_seccionadora` (.93) and `column` `C09` (.95).
- `apps/api/src/jobs/reading/job.ts` -- superseded handling (start and inside `before`): log `reading superseded`, run row `error`, no status write.
- `apps/api/src/jobs/reading/send.ts` (new), `http/files.ts`, `http/app.ts`, `sync/routes.ts`, `sync/apply.ts` -- shared send; enqueue on the re-target op; validation.
- Api tests: `apps/api/src/sync/panel-retarget.integration.test.ts` -- through `POST /api/sync/ops`: an uploaded panel photo re-targeted in one batch with equipment + block -> row `plate`/`queued` then `running`, enqueue called once with `{photo_id, reading_kind:'plate'}`; a not-yet-uploaded photo -> no enqueue, then `PUT /api/files/:id` enqueues `plate`; invalid values -> `op_invalid`; cross-tenant photo -> refused. `job.integration.test.ts` (new cases only) -- panel emits one suggestion on `file/{id}/block_id`; superseded writes no `failed`; bad target fails.
- `apps/web/src/surfaces/relatorio/{block-palette-field,panel-capture,relatorio-tree,tree-actions}.tsx|ts`, `relatorio.css`, `copy/pt-br.ts` -- the tile, the camera (single shot, the real viewfinder stands in for the mock's simulated one; its hint is the mock's "Enquadre a frente do painel com a etiqueta da coluna. Uma foto basta."), the result dialog opening once the photo row exists: title "Fotografar equipamento"; while the job is out and online, a waiting line (`// authored:` "Lendo a foto…") with the chips already usable; the `.suggestion-field` row with the "Criar …?" line in `.sv-main`, location path in `.sv-sub`, crop, pill, `.confirm-btn` "Confirmar"; `.prov-list` when a suggestion exists; chip label "Tipo errado? Toque no certo" (with a suggestion) or `// authored:` "Toque no tipo do equipamento"; helper "A foto entra na ficha como placa de identificação e na fila de leitura."; offline `.btn-reason` verbatim from the mock; actions "Fotografar de novo" and "Cancelar".
- E2E: `e2e/panel-capture.spec.ts` -- `@p0` online (shot via the fallback input, `pushSuggestion` of the panel value, "Sincronizar agora", line text, one tap, outbox batch asserted: one `batch_id` over the equipment/block creates, the four file puts and the suggestion status; store photo row `plate`/`queued`/`block_id`); `@p0` offline (context offline, chips, TAG from type + column, same outbox/store asserts); `@p0` 390 px: the result dialog and its chip row fit with no horizontal overflow. `e2e/panel-capture-pipeline.spec.ts` -- `@p1` real job under `fake`, no server-op seeding: tile -> shot -> suggestion arrives -> "Outro…" -> "Transformador" -> Confirmar -> the transformer plate's nameplate suggestions arrive on the new sheet (the plate job the server enqueued on the op). Add it to `SERIAL_SPECS`.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- entries for the narrowings in Design Notes.

**Acceptance Criteria:**
- Given the field Block palette, when it opens, then its first row is the full-width "Fotografar equipamento" tile with the `.camera-sub` line, above "Ou escolha o tipo · TAG sugerida por tipo + coluna" and the eight types.
- Given a shot online and the panel job done under `fake`, when the result shows, then it reads "Criar SEC-C09-2 · Chave seccionadora · Coluna 9?" (with `SEC-C09` already taken) and one tap commits equipment + block + the photo's `block_id`, caption, `reading_target`, `reading_kind: plate` in one batch, the photo reads `reading_status: queued` on the device, and the server enqueues its `plate` reading on that op.
- Given no connectivity, when the tile is used, then the block is created from the type chips with type plus column giving the TAG, and the photo still becomes its plate (`plate`, `queued`, the new `block_id`), read when the upload lands.
- Given a v6 client, when it pulls a stream with a `file/{id}/reading_kind` put, then it gets `426 contract_outdated`.
- Given every earlier reading test (plate, display), then they pass unmodified.

## Design Notes

Decisions taken here (conservative readings, listed as open questions in the PR): the app's single-shot camera view replaces the mock's simulated in-dialog viewfinder, so "Escolher o tipo" is not a viewfinder action (the type chips are always in the result dialog); the create keeps the palette's reveal + undo toast instead of the mock's jump to the ficha; the tile shows at every palette width; a read column with no matching live coluna falls back to the palette's location flagged Verificar (no column is created); "Desfazer" reverts the whole batch, which puts `reading_kind` back to `panel` and so re-queues a panel reading.

Narrowings (deferred-work entries, owner): a panel photo whose dialog is left by navigation stays a live "Geral" photo with its pending suggestion [Epic 9 integrated review]; the `@p1` pipeline e2e runs only in `test:e2e:full` [same].

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:unit -- packages/domain/src/reading packages/domain/src/relatorio packages/domain/src/ops packages/domain/src/contract` -- green
- `docker compose --profile tools run --rm tools pnpm test:api` -- green, earlier reading cases untouched
- `docker compose --profile tools run --rm tools pnpm exec tsx scripts/e2e.ts --project desktop-chrome e2e/panel-capture.spec.ts e2e/panel-capture-pipeline.spec.ts e2e/plate-reading.spec.ts e2e/tree.spec.ts` (stack up: `docker compose up -d`) -- green
- `docker compose --profile tools run --rm tools pnpm lint` and `pnpm static` -- green

## Spec Change Log

## Review Triage Log

### 2026-09-28 — Review pass

Layers run: Edge Case Hunter, Verification Gap Reviewer. Skipped: Blind Hunter, Intent Alignment (token economy; the integrated epic review covers them).

- verdicts: 15 findings — high 0, medium 9, low 4, false 2, maybe-false 0
- findings:
  - `[medium]` `[patch]` VG: the in-transaction superseded check of `job.ts` (`before` hook) runs in no test — job integration cases added (re-target inside the stub structuring; re-target then permanent error).
  - `[medium]` `[patch]` VG: "Fotografar de novo" is not exercised — e2e step added to `panel-capture.spec.ts` (first photo tombstoned, camera reopens, new shot is the dialog's photo).
  - `[medium]` `[defer]` VG: "Desfazer" on a photo-backed create is untested; what undo should do (re-queue a panel reading) is an open question — deferred.
  - `[low]` `[patch]` VG: the `op_invalid` refusal of a `remove` on `file/{id}/reading_kind|reading_target` is untested — cases added.
  - `[medium]` `[patch]` VG other / ECH: `sendRetargetedReading` is awaited without try/catch in the push route, so a DB error answers 500 after the ops committed — wrapped and logged.
  - `[medium]` `[patch]` ECH: a panel job re-targeted mid-run that then fails still writes `failed` over the plate status — the failure path re-reads the kind and ends superseded.
  - `[low]` `[reject]` ECH: `createPair` refusing after the confirm (location removed between the tap and the write) leaves an orphan panel photo — rare race, the fix adds a reopen/cancel branch; the orphan case is the deferred "dialog left" narrowing.
  - `[low]` `[reject]` ECH: online with the panel reading `failed` (or `done` with nothing) the dialog shows no status line — the chip row with "Toque no tipo do equipamento" still carries the flow; a failure line needs new copy, left to the integrated review.
  - `[medium]` `[patch]` ECH (duplicate of the VG-other row): the push answers 500 when the send lookup throws — same fix.
  - `[medium]` `[defer]` ECH: a client may put any of the five kinds (caption, nc_obs, the same kind) and re-queue a reading of its own company's photo — hardening (allow only `plate`, or only kinds with a handler and a matching target) deferred to the integrated review; no cross-tenant effect.
  - `[medium]` `[patch]` ECH: focus falls to the page body when the camera closes without a shot or the dialog is cancelled (the `opener` ref is never assigned, the palette tile unmounts) — focus returns to the palette location's row.
  - `[false]` `[reject]` ECH: `discard` while the photo row is not loaded — the dialog renders only when the row exists (`isOpen`), and "Fotografar de novo" runs from the open dialog.
  - `[false]` `[reject]` ECH: a queued photo with a null kind now never leaves `queued` — unreachable: a client create with `queued` requires a kind and a client `reading_kind` put of null is `op_invalid`.
  - `[low]` `[reject]` ECH: the `@p0` online spec triggers the sync by going offline and back instead of "Sincronizar agora" — that action lives on the `/sync` route and leaving the page closes the dialog; the reconnect is the same sync cycle.
  - `[medium]` `[patch]` ECH claim: the failure path still writes `failed` for a superseded job — same fix as the failure-path row.
  - Patch results: all six patch entries applied by the implementation subagent; the new "Fotografar de novo" e2e step also exposed a remount of the camera's fallback file input when the dialog closed (the re-shot file was lost), fixed by rendering the same fragment shape in both branches of `panel-capture.tsx`.

## Auto Run Result

Status: done

- Summary: the `panel` reading kind (type + column into one pending suggestion on `file/{photo}/block_id`); `reading_kind`/`reading_target` client file fields (contract 7, min 7) with the `applyOp` re-queue and the push route sending the re-targeted reading; superseded handling in the reading job (start, in-transaction, failure path); the field palette's "Fotografar equipamento" row, camera and result dialog with the kernel's "Criar …?" proposal, chips and provenance; one create batch (equipment + block + photo re-target + suggestion status).
- Files: `packages/domain/src/reading/panel.ts` (panel build), `packages/domain/src/relatorio/panel.ts` (proposal, texts, ops), `packages/domain/src/ops/{path,apply}.ts` (fields, re-queue), `packages/domain/src/contract/version.ts` (7/7), `apps/api/src/jobs/reading/kinds/panel.ts` (handler), `apps/api/src/jobs/reading/job.ts` (superseded), `apps/api/src/jobs/reading/send.ts` (shared send), `apps/api/src/sync/{routes,apply}.ts` (send on re-target, validation), `apps/api/src/http/{files,app}.ts` (wiring), `apps/api/src/jobs/reading/fixtures/*` (synthetic panel image and fixture), `apps/web/src/surfaces/relatorio/{panel-capture,block-palette-field,relatorio-tree,tree-actions}.ts(x)`, `relatorio.css`, copy files, `CropThumb` panel source, `use-photo-capture.ts` pre-minted id; tests: kernel, job and sync integration, `e2e/panel-capture.spec.ts` (3 `@p0`), `e2e/panel-capture-pipeline.spec.ts` (`@p1`, serial).
- Review: 15 findings; 6 patch entries applied (medium 5, low 1), 2 deferred (medium), 5 rejected (3 low with reasons, 2 false).
- Follow-up review recommended: false (no high patched; the medium patches carry their own tests).
- Verification: domain suites 742 passed; `test:api` green (41 files); targeted e2e green; `static` and `lint` clean; full gate run by the orchestrator before the PR.
- Residual risks: "Desfazer" after a photo-backed create untested; any reading kind is client-writable on the company's own photos.
