---
title: 'Stories 6.1 and 6.2: burst photos captioned from context, and no photo is ever lost'
type: 'feature'
created: '2026-09-25'
status: 'in-progress'
baseline_revision: '3f2893b1a7c6307b808e4345f3131b6d100fdb8b'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_reason: 'Stories 6.1 and 6.2 share one surface (the photo entity, the capture write path and the uploader); batched for token economy (Epic 6 orchestrator rules).'
deferred: []
---

<intent-contract>

## Intent

**Problem:** No photo can be taken today: there is no camera, no relatório-scoped photo write path, no context caption, and the uploader neither orders photos, nor keeps a failure across reloads, nor warns on low storage. The server accepts no `photo` kind and makes 480/1600 px variants instead of the spine's 512/2000.

**Approach:** Kernel first (`packages/domain/src/photos/`: `contextCaption`, EXIF parser, upload order, eviction plan, pt-BR derived texts), then an in-app burst camera (getUserMedia viewfinder from `70-fotos.html` `.camera-view`) opened from the sheet's Sticky action bar and from an NC row, on-device re-encode plus device thumb, one Dexie transaction per shot, then the Story 2.2 uploader extended (order, persistent error state, retry pill, eviction, storage banner) and the server variants reconciled.

## Boundaries & Constraints

**Always:**
- The photo reuses the existing `file/{id}` create and `file/{id}/{caption|block_id|item_key|removed_at}` families; no new op family, no `CONTRACT_VERSION` bump. Create op: `scope: 'relatorio'`, value = full `photoFileRowSchema` row (`kind: 'photo'`, `relatorio_id` set, `mime: 'image/jpeg'`, `reading_kind: null`, `reading_target: null`, `reading_status: 'none'`), written with its original Blob and device thumb in ONE Dexie transaction.
- Original: JPEG, long edge <= 2560 px, quality 0.85, EXIF orientation applied (`createImageBitmap(..., {imageOrientation: 'from-image'})`). Device thumb: long edge <= 512 px. `captured_at` = EXIF DateTimeOriginal (+OffsetTimeOriginal) when present, else device clock; `tz_offset` = minutes east of UTC (Sao Paulo = -180, as the Porto Seguro fixture). `local_seq` = per-device counter in `local_prefs` key `photo_seq`, incremented inside the same transaction.
- Geolocation only when the user's `photo_location_enabled` is true: a fix is requested when the camera opens (the OS prompt shows at the first capture after sign-in) and each shot uses a fix no older than 60 s or waits for a pending request up to 5 s; `coords = {lat, lng, accuracy_m, source: 'geolocation'}`; denial or timeout leaves `coords: null`. The shot counter and badge update at once; "Concluir fotos" waits for pending commits.
- Every status word, count, plural, caption and banner text is a kernel function; static copy goes in `apps/web/src/copy/pt-br.ts` (marked `// authored:` when not verbatim from a mock). Camera view classes from `70-fotos.html` lines 50-78 and 374-392; its `[data-route=...]` and `.frame-phone` rules are translated into `apps/web/src/styles/app.css` per AGENTS.md "Mock container selectors".
- A never-acked original is never evicted. Photos never block "Gerar": `expectedFileIds` leaves out `kind === 'photo'` (coordinator decision 2026-09-25).
- Server: `photo` accepts `image/jpeg` only; object key `company/{cid}/relatorio/{rid}/photo/{id}` (variants suffixed `/thumb`, `/print`); variants thumb <= 512 px, print <= 2000 px, JPEG q85; PUT idempotent on `(id, sha256)`.

**Never:**
- No caption composer, no "Legendar", no gallery, no number badge, no viewer (6.3/6.5), no "Adicionar fotos" button, capture sheet, drop zone or import (6.4), no point creation (6.6), no nameplate "Fotografar placa" tile (Epic 8, `source-deltas.md` row 49), no Dictation control, no vision caption.
- Do not refactor `setup-surface.tsx`, `relatorio/sumario.ts` or the op-path builders in `ops/path.ts` (batch F runs in parallel). Do not edit seed v1/v2.
- Never evict thumbs, never rewrite `coords` or `captured_at` after create, never guess a caption (a missing part is left out, never invented).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sheet burst | Sticky bar "Tirar foto", 3 shutter taps, "Concluir fotos" | 3 photo rows (`block_id` = sheet, `item_key` null), badge "3" during burst, caption from sheet context | none |
| NC row shot | NC item "CONTATOS" on Chave seccionadora in cabine "Cubículo Enel" | caption "Detalhe da verificação de contatos realizada na chave seccionadora do Cubículo Enel", `item_key` set, tile row under the row's buttons | none |
| Test table on screen | ensaios step, test `isolacao` | activity = seed atividade "ensaios de resistência de isolação" (m, plural) -> "Detalhe dos ensaios de resistência de isolação realizados no ..." | none |
| Unknown part | no activity (placa/conclusao step) | "Detalhe d⟨o/a⟩ ⟨equipamento⟩ d⟨o/a⟩ ⟨local⟩"; all parts unknown -> `caption: null` | none |
| Camera denied / absent | `getUserMedia` rejects `NotAllowedError` / no `mediaDevices` | `.camera-denied` reason with OS path under the button, no dialog; no mediaDevices -> hidden `<input type="file" accept="image/*" capture="environment">` single shot | never a silent no-op |
| Upload order | pending: other kind, photo t2, photo t1, photo with `reading_status: queued` | order: queued-reading photo, t1, t2, other; 2 in flight | none |
| Permanent refusal | PUT 413/409 sha mismatch | blob row `upload_error: {state: 'dead', code, at}`, pill "Erro — Tentar novamente", survives reload, never auto-retried | pill press clears it and runs "Sincronizar agora" |
| Transient exhaustion | 5xx after MAX_ATTEMPTS | `upload_error.state: 'failed'`, error pill, retried next cycle; cleared on success | as today (`recordFailure`) |
| Network dropped mid-upload | PUT aborted, reconnect | resumes, same sha256 PUT idempotent, exactly one `uploaded_at`, no duplicate row | none |
| Storage low | estimate free < 500 MB | global banner "Pouco espaço neste aparelho (⟨n⟩ MB). Sincronize para liberar.", capture still attempted | none |
| Browser refusal | Dexie `QuotaExceededError` on commit | online: push the batch and PUT the bytes directly; offline: keep in memory, error toast, retry once on the next shot or "Concluir fotos" | toast text authored |
| Eviction | acked originals, pressure / relatório left rascunho+em_campo | oldest-acked originals deleted until pressure clears / wholesale for that relatório; unacked never | none |

</intent-contract>

## Code Map

- `packages/domain/src/schemas/entities.ts:388` -- `photoFileRowSchema` (complete; no device_id: AD-17's `device_id` tie-breaker is left to 6.3 (the create op's `device_id`, or the UUIDv7 `id`); do not add a column here).
- `packages/domain/src/ops/path.ts:48` -- `FILE_FIELDS`, `file`/`file/field`/`file/server` families already exist. Read only.
- `packages/domain/src/files/candidate.ts` -- `FILE_KIND_MIME`, `objectKey`, `checkFileCandidate` (both apps import it). Add `photo: ['image/jpeg']`; `objectKey` gains an optional `relatorioId` used for `photo`.
- `packages/domain/src/seed/v1.ts:621-645` -- `ATIVIDADES`/`LOCAIS` words with gender/number; `registry` kinds `atividade`/`local` carry the same `wordMetadata` (`entities.ts:74`).
- `packages/domain/src/relatorio/sheet-progress.ts:40` -- `SheetStep` (`placa|verificacoes|ensaios|conclusao`), the "section on screen" input.
- `packages/domain/src/checks/storage.ts` -- `storageLow`, `STORAGE_LOW_FREE_BYTES` (provisional 500 MB; update its comment: the banner now ships on it per Story 6.2).
- `packages/domain/src/print/revisions.ts:173` -- `expectedFileIds`; test `revisions.test.ts:119`.
- `apps/web/src/db/file-commit.ts` -- `commitFilePick` (company scope); add sibling `commitPhotoCapture`.
- `apps/web/src/db/commit.ts:228` -- `commitFileBatch` (ops + Blob in one transaction); extend or add a variant that also writes the thumb and bumps `photo_seq` in the same transaction.
- `apps/web/src/db/schema.ts` -- `FileBlobRow`, `VERSIONS` (append-only). Add version 5 with table `thumbs: 'id'` (`{id, blob, source: 'device'|'server', created_at}`); `FileBlobRow` gains optional `acked_at`, `upload_error`.
- `apps/web/src/db/file-store.ts` -- `pendingUploads` (unordered), `markBlobAcked`; `ensureLocalBlob` note "Epic 6 widens the key" is answered by the `thumbs` table.
- `apps/web/src/sync/engine.ts:216-305` -- `uploadOne`, `uploadPhase`, in-memory `permanentlyFailed` (replace by the persisted `upload_error`), `setFilesPending`; the cycle at ~line 395 (push, upload, pull).
- `apps/web/src/sync/policy.ts:31` -- `classifyUploadFailure`.
- `apps/web/src/device/storage-estimate.ts` -- estimate reader; `apps/web/src/state/banner-slot.tsx` -- `BANNER_PRIORITY`, `bannerCandidates` (add `storage-low` right after `re-auth`).
- `apps/web/src/surfaces/ficha/sticky-action-bar.tsx` -- empty camera slot; add `.has-camera` and the 56 px `.camera-capture-btn` (`aria-label` "Tirar foto", `.cam-word` "Foto", `data-count`).
- `apps/web/src/surfaces/ficha/checklist-section.tsx:31` -- NC row slot; add the `.row-wrap` with "Adicionar foto" (`btn-secondary`, camera glyph) + `.btn-reason` "Recomendada para não conforme" (from `60-ficha.html` line 384) and the `.photo-row` tiles under it (markup `key-photos.html:121-127`, caption in `.photo-meta`, `.upload-pill`).
- `apps/web/src/surfaces/ficha/ficha-surface.tsx:233,533` -- `current` step state and the StickyActionBar mount.
- `apps/api/src/http/files.ts` -- PUT/GET, `objectKey` calls at lines 223, 240, 288 (pass `row.relatorio_id`).
- `apps/api/src/storage/variants.ts` -- `THUMB_MAX_PX`, `PRINT_MAX_PX`, quality 82.
- `apps/web/src/components/gallery.test.tsx` -- register new shared components (axe gallery).
- `e2e/durability.spec.ts`, `e2e/tap-budget.spec.ts`, `e2e/lost-taps.durability.spec.ts`, `playwright.config.ts` -- durability scenarios; tap budget must stay green.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/photos/caption.ts` -- `contextCaption(photo: {block_id, item_key}, snapshot: RelatorioSnapshot, meta: {step: SheetStep | null; testKey: string | null; words: {atividades: SeedWord[]; locais: SeedWord[]}; registry: RegistryRow[]}): string | null` composing "Detalhe d⟨o/a⟩(s) ⟨atividade⟩ realizad⟨o/a⟩(s) n⟨o/a⟩(s) ⟨equipamento⟩ d⟨o/a⟩(s) ⟨local⟩" (no trailing period); activity: `item_key` -> "verificação de ⟨item label lowercased pt-BR⟩" (f, singular), `ensaios` step -> seed atividade mapped from the key of the test table on screen (the web passes the table nearest the viewport top via `use-on-screen`, else the block's first test) (`isolacao`, `resistencia_contato`, `relacao_transformacao`), else absent; equipment: a kernel table `CAPTION_EQUIPMENT_WORDS: Record<EquipmentBlockType, SeedWord>` (lowercase noun phrase + gender/number per block type, e.g. "chave seccionadora" f sg, "cabos de entrada" m pl); local: the block's cabine name, gender/number from a `local` registry row or seed `locais` word of the same name (case-insensitive), else m singular. Plus `cameraContextText(caption)` for `.cam-context`.
- `packages/domain/src/photos/exif.ts` -- pure `parseExif(bytes: Uint8Array): {dateTimeOriginal: string|null; offsetMinutes: number|null; gps: {lat, lng}|null; orientation: number|null}` (JPEG APP1 TIFF, both endians); `capturedAtFrom(exif, deviceNowIso, deviceOffset)`.
- `packages/domain/src/photos/upload-order.ts` -- `orderUploads<T extends {kind; reading_status?; captured_at?; id}>(items): T[]` (queued/running reading first, photos by `captured_at` then id, then others).
- `packages/domain/src/photos/eviction.ts` -- `evictionPlan({blobs, relatorioStatus, pressure}): string[]`.
- `packages/domain/src/photos/text.ts` -- `burstCountText(n)` ("1 foto nesta rajada · salva neste aparelho com a legenda do contexto" / plural), `photosPendingText(n)` ("3 fotos aguardando envio", for 6.3's header), `uploadPillText(state)` ("Aguardando envio" / "Erro — Tentar novamente"), `photoUploadState({uploaded_at, localError})`, `storageLowBannerText(reading)` (MB = floor(free / 1 MiB)). Export all from `packages/domain/src/index.ts`; unit tests beside each, covering every matrix row that is kernel logic.
- `packages/domain/src/files/candidate.ts`, `packages/domain/src/print/revisions.ts` -- photo kind/mime and relatório key; photos out of `expectedFileIds`; update tests.
- `apps/web/src/files/photo-encode.ts` -- `encodePhoto(source: Blob | ImageBitmap): Promise<{original: Blob; thumb: Blob; sha256: string}>` (canvas/OffscreenCanvas, 2560/0.85, 512 thumb).
- `apps/web/src/files/geolocation.ts` -- `positionAtCapture()` per the Always rule; denial stores local pref `geolocation_denied` (device-local stand-in for "marks the account row", read by Epic 11).
- `apps/web/src/db/schema.ts`, `commit.ts`, `file-commit.ts`, `file-store.ts` -- version 5 (`thumbs`), `commitPhotoCapture(db, {companyId, relatorioId, actorId, fileId, blockId, itemKey, caption, capturedAt, tzOffset, coords, original, thumb, sha256}, deps)`, `readThumb`, `putServerThumb`, ordered `pendingUploads`, persisted `upload_error`, `clearUploadError`, `acked_at` in `markBlobAcked`, `runEviction(db, estimate)`; outbox-survives-upgrade test for v5.
- `apps/web/src/files/capture-rescue.ts` -- the quota-refusal path of the matrix.
- `apps/web/src/surfaces/ficha/camera-view.tsx` (+ `use-photo-capture.ts`) -- full-screen React Aria modal `.camera-view` (close "Fechar a câmera sem concluir", `.cam-context`, `<video>` in `.cam-finder`, shutter `aria-label` "Disparar", "Concluir fotos", `.cam-count` `role="status"`); stops the stream on close; focus returns to the opener. Denied reason in `.camera-denied` under the opener.
- `apps/web/src/surfaces/ficha/sticky-action-bar.tsx`, `checklist-section.tsx`, `ficha-surface.tsx` -- wire both openers; NC row tiles read photos by `block_id` + `item_key` from IndexedDB, thumb from `thumbs`, pill from `photoUploadState`; the error pill is a >= 48 px button that clears the error and runs the "Sincronizar agora" action.
- `apps/web/src/sync/engine.ts` -- ordered queue, persisted error states (drop `permanentlyFailed`), thumb refresh after pull (photos with `variants` whose local thumb is missing or `source: 'device'`; thumb only, never originals), eviction pass after the cycle.
- `apps/web/src/state/banner-slot.tsx` (+ publisher hook) -- `storage-low` candidate, estimate read on mount, after each capture and after each cycle.
- `apps/web/src/styles/app.css`, `apps/web/src/copy/pt-br.ts` -- camera view translations; static copy (denied reason "A câmera está bloqueada para este site. Para liberar: Configurações do navegador › Permissões do site › Câmera." `// authored:`, done toast "Fotos salvas neste aparelho — entram na fila de envio" from the mock, refusal toast `// authored:`).
- `apps/api/src/storage/variants.ts`, `apps/api/src/http/files.ts` -- 512/2000, q85, photo key; api integration test through the sync route: push the photo create, PUT, assert key, `uploaded_at` + `variants` ops, variant dimensions, idempotent second PUT (one `uploaded_at`), 409 before the create is applied.
- `e2e/photos.spec.ts` + `e2e/durability.spec.ts` -- Playwright (fake media stream via file-level `test.use` launch args `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`, `permissions: ['camera','geolocation']`, `geolocation`), per the ACs below.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- close "Photos can block Gerar" and the FR-54 scenario 2 photo half; add entries for the narrowings owned by 6.3/6.4/Epic 7.

**Acceptance Criteria:**
- Given a sheet, when the user taps "Tirar foto" in the Sticky action bar, then the camera view opens with the live stream and no chooser or composer; each "Disparar" saves a photo at once, the button's badge and the status line count the burst, and "Concluir fotos" closes it with focus back on the button (`@p0`, reload keeps the photos with their context caption, `local_seq` increasing, `coords` from the mocked position).
- Given an NC row, when "Adicionar foto" shoots two photos, then two tile rows appear under the row's buttons with the context caption in meta and "Aguardando envio" until uploaded (`@p0`).
- Given the camera is denied, when "Tirar foto" is tapped, then the reason and OS path show under the button and no dialog opens (`@p0`).
- Given photos in the queue and the network dropped mid-upload, when the connection returns, then every photo uploads exactly once, the server holds each with `uploaded_at` and 512/2000 variants, and none is duplicated or lost (`@p0`, FR-54 scenario 2 photo half).
- Given one photo refused with 413, when the queue runs, then its pill reads "Erro — Tentar novamente" (>= 48 px) after reload too, other photos upload, and pressing the pill retries it (`@p1`).
- Given `storage.estimate` mocked under 500 MB free, when any surface renders, then the banner "Pouco espaço neste aparelho (⟨n⟩ MB). Sincronize para liberar." shows and a capture still saves (`@p1`).
- Given `e2e/tap-budget.spec.ts` and the lost-tap specs, when the sheet has the camera button, then J1/J3 counts are unchanged.

## Design Notes

Narrowings (coordinator records them): gallery-header camera and "3 fotos aguardando envio" header -> 6.3 (kernel text ships now); "Adicionar fotos" fallback beside a denied camera -> 6.4; nameplate single-shot tile -> Epic 8; the Export dialog's pre-issue warning row for unsent photos -> Epic 7 (photos do not print yet); geolocation denial is a device-local pref, not an account-row op.

Open questions (conservative choice taken): equipment caption words live in a kernel table, not a seed v3; composed captions carry no trailing period (mock and EXPERIENCE examples; the delivered relatório has one); `storage-low` ranks right after `re-auth`; the 500 MB threshold ships provisional before the iPadOS manual reading.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:unit` -- green
- `docker compose --profile tools run --rm tools pnpm test:api` -- green
- `docker compose --profile tools run --rm tools pnpm exec playwright test e2e/photos.spec.ts e2e/durability.spec.ts e2e/tap-budget.spec.ts` -- green
- `docker compose --profile tools run --rm tools pnpm verify` -- green (once, at the end)
