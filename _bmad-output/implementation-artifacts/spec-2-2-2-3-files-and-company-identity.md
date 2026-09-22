---
title: 'Stories 2.2 and 2.3: certificate uploads and the company document identity'
type: 'feature'
created: '2026-09-22'
baseline_revision: 'dd15194f8a77ac615fbdcf579b08c4cf0fccc816'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
dev_model: 'opus'
dev_effort: 'medium'
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
warnings: ['multiple-goals', 'oversized']
deferred:
  - summary: >-
      Concurrent PUTs of the same file can still emit two uploaded_at ops in the narrow window
      between the re-read and the apply.
    evidence: |-
      The route re-reads the row immediately after storing the object and emits only while
      uploaded_at is null, which narrows but does not close the race; closing it needs a
      per-file advisory lock spanning the object store.
    location: >-
      apps/api/src/http/files.ts
    severity: low
  - summary: >-
      sync_state.files_pending is written by the upload phase and read by no surface.
    evidence: |-
      A grep over apps/web/src finds only the engine's writers; the badge that consumes it
      belongs to a later epic, so a failed upload is invisible to the user today.
    location: >-
      apps/web/src/sync/engine.ts
    severity: medium
  - summary: >-
      A permanent upload failure is remembered only in memory, so a reload re-queues the file.
    evidence: |-
      permanentlyFailed is an in-session Set; the Dexie files table has no dead state and
      widening it was outside this story.
    location: >-
      apps/web/src/sync/engine.ts
    severity: low
  - summary: >-
      Two devices creating the first Empresa row offline produce two empresa rows with no
      convergence rule.
    evidence: |-
      empresaRow picks the first row of kind empresa; empresa-tab.tsx mints a fresh id per
      mount until a row has been pulled. A singleton or lowest-uuid-wins rule belongs with
      Epic 7's consumer.
    location: >-
      apps/web/src/db/home-store.ts
    severity: medium
  - summary: >-
      MinIO's ListObjectsV2 hides variant keys because the {id} object shadows the {id}/ prefix.
    evidence: |-
      Reads by key work and are pinned by a test; only listing-based tooling (future backup,
      lifecycle or audit jobs) would miss variants. Real S3 does not behave this way.
    location: >-
      packages/domain/src/files/candidate.ts (objectKey)
    severity: low
  - summary: >-
      applyOp's create path does not re-check value.id against the path id; the invariant is
      enforced only by opSchema at the push boundary.
    evidence: |-
      packages/domain/src/ops/apply.ts:172 parses op.value without comparing ids. A future
      server-side emitter that bypasses opSchema would materialize a mismatched row; the file
      route now guards itself, but the kernel rule would be the general fix.
    location: >-
      packages/domain/src/ops/apply.ts:172
    severity: medium
---

<intent-contract>

## Intent

**Problem:** A calibration certificate, a company logo and a cover background have nowhere to live: the `file` entity has no kind rules, no device Blob write path, no upload route and no read route, so the Instrumentos certificate tile is a disabled placeholder and the Empresa tab is still a stub. Section 11 of every relatório and every cover/header/footer depends on both.

**Approach:** Story 2.2 builds the shared file plumbing once — kernel kind/size rules, a one-transaction local write (create op + owner `_file_id` op + Blob), an idempotent `PUT /api/files/{id}` over a MinIO storage adapter with sharp variants, an on-demand `GET /api/files/{id}/{variant}`, and an uploader phase that runs after push. Story 2.3 then builds the Empresa tab on top: per-field autosave ops, the logo/cover-background tiles, the CSS brand preview and two `preIssue` warning rows.

## Boundaries & Constraints

**Always:**
- Every new API route resolves `company_id` from the session (AD-10) and scopes every read and write by it; an id of another company answers exactly as a non-existent id.
- Local writes go through `commit.ts`'s transaction: the `file/{id}` create op, the owner's `_file_id` op and the Blob land together or not at all (AR-6).
- Object keys are immutable and never deleted: `company/{cid}/{kind}/{id}` for the original, `company/{cid}/{kind}/{id}/{thumb|print}` for variants.
- `PUT /api/files/{id}` is idempotent on `(id, sha256)`; `file/{id}/uploaded_at` and `file/{id}/variants` are `system:files` server ops (`device_id = server`), emitted through `applyOps(..., {origin: 'server'})`.
- Derived/pt-BR computed text (refusal reasons, preIssue rows, tile lines) lives in `packages/domain`; static surface copy in `apps/web/src/copy/pt-br.ts` (AGENTS.md "Where a new user-facing string goes").
- Registry fields autosave one op per field; no Save button anywhere.

**Never:**
- No delete route, no object overwrite, no `removed_at` handling for files in this story.
- No certificate original is prefetched by the sync engine; originals are fetched only when a surface asks.
- No company brand in the app chrome: the `PRODUTO` wordmark stays everywhere but the Empresa preview (NFR-15).
- No watermark toggle, no client-logo field (source-deltas cut both) — the `watermark_file_id` column stays in the schema, unused and undrawn.
- Do not touch `clientes-tab.tsx`, `fabricantes-tab.tsx`, `classes-tensao-tab.tsx`, `criterios-tab.tsx` or the instrument panel beyond its certificate field: the parallel Stories 2.4-2.6 batch owns them. Keep the new `preIssue` module to the two company rows so both batches merge cleanly.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pick a certificate | 3 MB `application/pdf` on an instrument row | `file/{id}` create (`scope: company`) + `registry/instrument/{id}/certificate_file_id` in one batch, Blob in Dexie `files`, tile shows the file name at once | No error expected |
| Oversized file | 26 MB pdf | Refused before any op or Blob write, inline reason from the kernel | `checkFileCandidate` -> `{ok: false, reason: 'too_large'}` |
| Wrong type for kind | `image/gif` as `certificate`; `application/pdf` as `logo` | Refused inline, no op | `{ok: false, reason: 'mime'}` |
| Upload after push | acked create op, Blob present, `uploaded_at` null | `PUT /api/files/{id}` with bytes + sha256; object stored; `file/{id}/uploaded_at` appears on the next pull | No error expected |
| Row not applied yet | `PUT` before the create op reached the server | `409 file_row_missing`, nothing stored | Uploader leaves the file pending and retries next cycle |
| Retried identical upload | same id, same sha256, object already present | `200` with the same `uploaded_at`; exactly one object, one `uploaded_at` op | Idempotent no-op |
| sha256 mismatch | body hash != the row's `sha256` | `409 file_sha_mismatch`, nothing stored | Upload not retried by the uploader (permanent) |
| Body over the limit | 26 MB body | `413 file_too_large`, nothing stored | Request body never buffered whole past the limit |
| Cross-tenant PUT/GET | company B session, company A's file id (guessed or known) | `404 not_found`; never the bytes, never a stored object | Same answer as an unknown id |
| Variants | `logo` png or svg uploaded | sharp writes `thumb` and `print` (SVG rasterized), `file/{id}/variants` emitted | A sharp failure leaves `uploaded_at` set and no `variants`; logged, not fatal |
| One failed upload | 3 pending files, the middle one 500s | The other two still upload in the same cycle, two in flight at most | Failure recorded per file, queue never blocked |
| Empresa autosave | user types a razão social | one `registry/empresa/{id}/name` op, row visible at once, no Save button | No error expected |
| Empresa defaults | first Empresa row created | `form_title` "Relatório Técnico de Cabine Primária", `form_code` "FO.SERV-03", `form_revision` "Revisão 01" | No error expected |
| preIssue | empresa missing `name` and/or `logo_file_id` | warning rows "Razão social não cadastrada" and "Logo da empresa não cadastrado — Cadastrar"; nothing blocks | No error expected |

</intent-contract>

## Code Map

**Kernel (`packages/domain`)**
- `src/schemas/entities.ts:317-368` -- `fileBase`, `fileVariantsSchema`, `otherFileKindSchema` (already has `certificate`, `logo`, `cover_background`) and the `fileRowSchema` discriminated union: no change needed for 2.2's kinds. `registryRowSchemas.empresa:79-88` -- add `phone`, `email`, `form_title`, `form_code`, `form_revision` (all `nullableString`); keep `watermark_file_id` untouched and undrawn.
- `src/ops/path.ts:224-227` -- `file` (create), `file/field` and `file/server` (`FILE_SERVER_FIELDS = ['uploaded_at','variants','reading_status']`, `serverOnly: true`) families already exist; `REGISTRY_FIELD` accepts any mutable key of the kind, so the new empresa fields need no path change.
- `src/contract/errors.ts:24-34` -- append `file_row_missing`, `file_sha_mismatch`, `file_too_large`, `file_kind_invalid` to `errorCodeSchema` (append-only enum).
- `src/contract/sync.ts:84-90` -- `SYNC_ROUTES` table; add a sibling `FILE_ROUTES` (`put(id)`, `get(id, variant)`) plus `fileVariantSchema = z.enum(['original','thumb','print'])` and the `x-file-sha256` header name constant, exported from `contract/index.ts`.
- **new** `src/files/candidate.ts` (+ test) -- `MAX_FILE_BYTES = 25 * 1024 * 1024`, `FILE_KIND_MIME` (`certificate`: pdf/jpeg/png, `logo`: png/svg+xml, `cover_background`: jpeg/png), `checkFileCandidate({kind, mime, size})` -> `{ok: true} | {ok: false, reason: 'too_large'|'mime', text: string}` with the pt-BR reason text, and `objectKey(companyId, kind, id, variant?)`. Both apps import it; the key is built in exactly one place.
- **new** `src/checks/pre-issue.ts` (+ test) -- `PreIssueRow {id, severity: 'warning', text, action?}` and `companyPreIssues(empresa: EmpresaRow | null): PreIssueRow[]` returning only the two company rows (Stories 2.4-2.6 append their own rows in their own module).
- `src/index.ts` -- barrel-export the two new modules and the contract additions.

**API (`apps/api`)**
- `src/storage/s3.ts` -- `createS3`/`ensureBucket` exist; add `putObject(s3, bucket, key, body, contentType)`, `getObject` (returns body stream + content-type + length) and `headObject` (idempotency probe). No delete helper.
- **new** `src/storage/variants.ts` -- sharp `thumb` (max 480 px) and `print` (max 1600 px) PNG/JPEG renderers; `image/svg+xml` is rasterized by sharp's `density` path; `application/pdf` produces no variants.
- **new** `src/http/files.ts` -- `createFileRoutes(db, s3, config, {now})`: `PUT /api/files/:id` and `GET /api/files/:id/:variant`. Mount in `src/http/app.ts:115-118` after `createSyncRoutes` (so it sits behind `sessionMiddleware('/api/*')`). Read the row with `select ... from entities where company_id = session.companyId and entity = 'file' and id = :id` — `src/db/repositories/company-id.ts` mints the typed id, `src/sync/apply.ts:96-120` is the transaction pattern. Emit the server ops with `applyOps(db, companyId, [op], {now, origin: 'server'})` (`src/db/seed.ts:114` is the call model) using `actor_id: 'system:files'`, `device_id: SERVER_DEVICE_ID`.
- `src/config.ts` -- `S3_*` vars already parsed; add nothing unless a bucket-prefix knob is needed.
- `src/sync/sync.integration.test.ts:1-60` -- the two-company harness (`TEST_SEED`, `call()`, cleanup by id) to copy into **new** `src/http/files.integration.test.ts`.
- `apps/api/package.json` -- add `sharp` (runtime dep; the `node:24-bookworm-slim` image takes the prebuilt linux-x64 binary). Regenerate the lockfile inside the container so `install --frozen-lockfile` keeps working.

**Web (`apps/web`)**
- `src/db/schema.ts:47-53,109-153` -- `FileBlobRow {id, variant, blob, acked, created_at}` and the `files: 'id, acked'` store already exist in version 1; no new Dexie version unless an index is required (prefer none).
- `src/db/commit.ts:88-101` -- `commitOps` transaction (`rw` over `entities`, `outbox`); add a sibling `commitFileBatch(db, {ops, blob, fileId})` that includes `db.files` in the same `rw` transaction. `commitBatch`/`undoBatch` stay as they are.
- **new** `src/db/file-store.ts` -- `putLocalBlob`, `readLocalBlob`, `pendingUploads(db)` (file rows with `uploaded_at === null` whose create op is `acked`), and the `GET`-on-demand cache fill used by the tiles.
- `src/sync/client.ts:67-105` -- `createSyncClient`'s `request` helper; add `uploadFile(id, blob, sha256)` and `fetchFile(id, variant)` built from `FILE_ROUTES`, mapping failures to the same `SyncFailure` shape.
- `src/sync/engine.ts:180-195,265-295` -- `pushPhase` and `runCycle`; add `uploadPhase()` run through `runPhase` immediately after `pushPhase` and before `pullPhase`, two uploads in flight (a small worker pool), one file's failure recorded and skipped, `sync_state.files_pending` updated.
- `src/sync/policy.ts:10-19` -- `classifyFailure`; add the upload-specific rule: `409 file_row_missing` is retry-next-cycle (not dead), `409 file_sha_mismatch` and `413` are permanent.
- **new** `src/components/upload-tile.tsx` (+ test) + export from `src/components/index.ts` -- the shared tile: hidden `<input type="file">` with the kind's `accept`, `checkFileCandidate` refusal rendered inline, the file name/state line, sha256 via `crypto.subtle.digest`. Markup from `key-registries.html:154-172` (`.input.file-input`, `.file-name`, `.helper`) and `80-cadastros.html:135-145` (`.brand-tiles`/`.brand-tile`).
- `src/surfaces/registries/instrument-panel.tsx:197-203` -- replace the `aria-disabled` certificate placeholder with `<UploadTile kind="certificate">`, committing the create + `registry/instrument/{id}/certificate_file_id` batch. Nothing else in this file changes.
- `src/surfaces/registries/empresa-tab.tsx` -- replace the placeholder with the real tab: sections Empresa / Marca no documento / Formulário from `key-registries.html:118-205`, every field through `useFieldCommit` -> `commitBatch` on `registry/empresa/{id}/{field}`, the two `UploadTile`s, and the preview.
- **new** `src/surfaces/registries/brand-preview.tsx` -- three `aria-hidden` miniature pages using the existing `components.css:829-848` `.brand-preview`/`.bp-*` rules: cover (logo slot + cover-background box), header strip, footer strip with "Página X de Y". No watermark element.
- `src/surfaces/registries/registries.css` (+ `src/styles/app.css` for the `.frame-*` variants, per AGENTS.md) -- translate `.empresa-form`, `.group-title`, `.file-input`, `.brand-tile`/`.brand-tiles` and `.empresa-layout` (`key-registries.html:47-62`, `80-cadastros.html:59-78`); drop the watermark rules.
- `src/copy/pt-br.ts:206-266` -- add `registries.empresa.*` (section titles, field labels, helpers, preview labels) and update `instrumentos.certificateHelper`/`certificatePlaceholder` (the "indisponível aqui" wording is now false).
- `src/db/home-store.ts` -- add an `empresaRow` live-query source next to `instrumentRows`.
- `e2e/cadastros.spec.ts` -- extend with the Empresa flow; **new** `e2e/files.spec.ts` for the upload flow (`@p0` core, `@p1`/`@p2` edges), tagging convention as in `e2e/durability.spec.ts:48`.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/files/candidate.ts` (+ `.test.ts`) -- kind/mime table, 25 MB limit, `checkFileCandidate`, `objectKey`; pt-BR refusal text -- the single source both apps validate against (I/O rows 2-3).
- `packages/domain/src/schemas/entities.ts` -- extend `registryRowSchemas.empresa` with `phone`, `email`, `form_title`, `form_code`, `form_revision`; regenerate `fixtures/replay-small/snapshot.golden.json` if the fixture materializes an empresa row.
- `packages/domain/src/contract/{errors.ts,sync.ts,index.ts}` -- the four new error codes, `FILE_ROUTES`, `fileVariantSchema`, `FILE_SHA256_HEADER`.
- `packages/domain/src/checks/pre-issue.ts` (+ `.test.ts`) -- `companyPreIssues` with the two warning rows only.
- `packages/domain/src/index.ts` -- barrel exports.
- `apps/api/package.json` + lockfile -- add `sharp`; verify `docker compose --profile tools run --rm tools pnpm install` succeeds in the image.
- `apps/api/src/storage/s3.ts`, `apps/api/src/storage/variants.ts` -- put/get/head helpers and the sharp thumb/print renderers (SVG rasterized, pdf skipped).
- `apps/api/src/http/files.ts` -- both routes: session, company-scoped row lookup, 25 MB body cap, sha256 verification, idempotent store, `system:files` `uploaded_at` and `variants` ops, on-demand `GET` streaming with the stored content-type.
- `apps/api/src/http/app.ts` -- mount `createFileRoutes`; `apps/api/src/main.ts` -- pass the existing `S3Client`.
- `apps/api/src/http/files.integration.test.ts` -- happy path, idempotent retry, `409 file_row_missing`, `409 file_sha_mismatch`, `413` body cap, variants emitted, and the cross-tenant cases: company B cannot `PUT` or `GET` company A's file id (known or guessed) and gets the same answer as for an unknown id.
- `apps/web/src/db/commit.ts`, `apps/web/src/db/file-store.ts` (+ tests) -- the one-transaction ops+Blob write and the pending-upload query.
- `apps/web/src/sync/{client.ts,policy.ts,engine.ts}` (+ tests) -- `uploadFile`/`fetchFile`, the upload failure classification, and the `uploadPhase` after push with two in flight and per-file isolation.
- `apps/web/src/components/upload-tile.tsx` (+ `.test.tsx`, `index.ts`) -- the shared tile with inline refusals.
- `apps/web/src/surfaces/registries/instrument-panel.tsx` -- certificate tile wired to the batch commit (only this field changes).
- `apps/web/src/surfaces/registries/{empresa-tab.tsx,brand-preview.tsx}` (+ tests) -- the real Empresa tab and the three-page `aria-hidden` preview.
- `apps/web/src/surfaces/registries/registries.css`, `apps/web/src/styles/app.css` -- the Empresa/tile mock translations (base rules in the surface CSS, `.frame-*` variants in `app.css`).
- `apps/web/src/copy/pt-br.ts`, `apps/web/src/db/home-store.ts` -- Empresa copy, corrected certificate helper, the `empresaRow` live query.
- `e2e/files.spec.ts`, `e2e/cadastros.spec.ts` -- Playwright: `@p0` attach a certificate and see it upload after a sync cycle; `@p1` 25 MB refusal, Empresa autosave + preview updates; `@p2` offline attach queues and uploads on reconnect.

**Acceptance Criteria:**
- Given an instrument row, when a certificate is picked, then the tile shows the name immediately, the outbox holds exactly the create op and the `certificate_file_id` op in one `batch_id`, and the Blob is readable from Dexie `files` even after a reload (AC 2.2-1).
- Given the file's create op has been acked, when a sync cycle runs, then the upload happens after the push and before the pull, and after the next pull the row carries `uploaded_at` (AC 2.2-2).
- Given the certificate exists on the server, when another device opens it, then the original is fetched only at that moment — a full sync cycle on a device that never opens it downloads no certificate bytes (AC 2.2-3).
- Given a logo (png or svg) or a cover background, when it is uploaded, then the server emits `file/{id}/variants` with `thumb` and `print` keys that both `GET` successfully (AC 2.2-4).
- Given the Empresa tab, when each field is edited, then one `registry/empresa/{id}/{field}` op is committed per field with no Save button on the surface, and reopening the tab shows the stored values (AC 2.3-1).
- Given the brand preview, when a field or an upload changes, then the three miniature pages re-render from the current values, show `border-hairline` "Logo"/"Fundo" placeholders while the assets are missing, and the whole card is `aria-hidden` (no preview text in the accessibility tree) (AC 2.3-2).
- Given razão social or logo missing, when `companyPreIssues` runs, then it returns those warning rows and no surface blocks or requires a field; with both present it returns none (AC 2.3-3).
- Given a company logo is set, when any surface other than the Empresa preview renders, then the `PRODUTO` wordmark is what is drawn (AC 2.3-4).

## Design Notes

**Two stories, one spec, one PR.** 2.3's tiles are 2.2's component; splitting them would mean shipping a tile with no upload path. The `multiple-goals` warning records this.

**Address stays one field.** epics.md says "address lines" but both mocks (`key-registries.html:143`, `80-cadastros.html`) draw a single "Endereço" input feeding the footer line, and the schema already has one `address`. One field, kept as free text; the footer composes it with phone and e-mail.

**Three preview pages, not the mock's two.** AC 2.3-2 names a cover, a header strip and a footer strip. The mock draws cover + inner page (header and footer inside it). The AC wins: cover, header strip, footer strip, all with the existing `.bp-*` rules, no watermark (cut by source-deltas).

**Variant keys.** `variants` is `{thumb, print}` of object keys, so the immutable-key rule extends by suffix (`.../{id}/thumb`), never by overwriting the original.

**409 vs 404.** `file_row_missing` is a *retryable* 409 for the device's own file whose create op has not been applied yet. A file id belonging to another company is not distinguishable from a non-existent one and answers `404 not_found` on both routes.

## Review Triage Log

### 2026-09-22 — Review pass (one combined layer: adversarial + edge cases + AC verification, LEAN MODE)

- verdicts: 15 findings — high 2, medium 9, low 4, false 0, maybe-false 0
- findings:
  - `[high]` `[patch]` `apps/api/src/http/files.ts` built the object key from the create op's client-supplied `row.kind`/`row.id` instead of the URL id, so a row whose JSON id names another file could overwrite that file's object — fixed: `readFileRow` refuses a row whose `id` is not the URL id and both routes key off the URL/record id. (The push path was already covered upstream: `opSchema` refuses a create whose `value.id` is not the path id; the route guard is defence in depth, and the new test proves both layers, including a row inserted directly into `entities`.)
  - `[high]` `[patch]` `GET /api/files/{id}/original` served an attacker-supplied `image/svg+xml` logo inline from the app's own origin with no `nosniff` and no `Content-Disposition` — stored XSS with the session cookie — fixed: `x-content-type-options: nosniff` on both routes and `content-disposition: attachment` on `original` (variants stay inline for `<img>`), asserted by `2.2-API-006`.
  - `[medium]` `[patch]` A non-uuid `:id` reached `eq(entities.id, id)` on a uuid column and answered `500`, distinguishable from an unknown id — fixed: the id shape is validated first, PUT answers `409 file_row_missing`, GET `404 not_found`, both tested.
  - `[medium]` `[patch]` A row whose stored `size` was over the limit answered `400 file_kind_invalid` whenever the body had no `content-length`, leaving the streaming 413 path unreachable and untested — fixed: `reason: 'too_large'` answers `413`, and a chunked `ReadableStream` body exercises `readCappedBody`'s `BodyTooLargeError` branch.
  - `[medium]` `[patch]` `uploaded_at` was a read-modify-write, so two concurrent PUTs of the same file could emit two `uploaded_at` ops with different timestamps — fixed: the row is re-read immediately after the store and the op is emitted only while it is still null. Residual window recorded in `deferred`.
  - `[medium]` `[patch]` `getObject`/`headObject` swallowed every error, turning a MinIO outage into `404 not_found` and letting a failed idempotency probe re-`putObject` over an immutable key — fixed: only NoSuchKey/NotFound/404 is caught, everything else rethrows.
  - `[medium]` `[patch]` A per-file permanent upload verdict called `recordFailure`, which set the cycle's `lastFailure` and kept `eviction-recovery-surface.tsx:56` from dismissing although push and pull succeeded — fixed: a permanent per-file verdict is logged, not recorded as a cycle failure; the exhausted-retries path still records.
  - `[medium]` `[patch]` `files_pending` dropped permanently-failed files from the count, reporting 0 while their blobs sat unacked in Dexie — fixed: they are counted.
  - `[medium]` `[patch]` `ensureLocalBlob` ignored the requested variant, so the Empresa preview's `thumb` request got the full-size original and a cached thumb could later be served as `original`/`print` — fixed: the cache is used only on a variant match, plus a `previewBlob` helper that keeps the just-picked asset visible before the upload lands.
  - `[medium]` `[patch]` All three `UploadTile` call sites discarded the promise, so `busy` was a no-op and a failed commit (an IndexedDB quota error on a 25 MB blob) became an unhandled rejection with no visible reason — fixed: the call sites return the promise and the tile renders an inline failure.
  - `[medium]` `[patch]` `aria-describedby` sat on the hidden `tabIndex={-1}` input and the helper span had no id, so a screen-reader user on the visible button heard neither the accepted formats nor the refusal — fixed: the button is described by helper + refusal; a tab test asserts it is the tile's only tab stop.
  - `[low]` `[reject]` The `email` key moved from the global `IMMUTABLE_KEYS` to a `user`-only exclusion, so a future registry kind gaining an `email` column would be op-writable with no explicit decision — speculative: no such kind exists, and `path.test.ts` 2.3-UNIT-005 pins both halves of today's rule.
  - `[medium]` `[reject]` `PUT` answers `409 file_row_missing` for another company's id while this spec's Design Note says `404` — the two states are indistinguishable by construction under AD-10 (the lookup is company-scoped), the retryable 409 is what the uploader needs, and the test asserts a known foreign id and an unknown id get byte-identical answers. The only fix would edit this build's spec, which triage rejects.
  - `[low]` `[reject]` `companyPreIssues` has no consumer — by design: the spec and the epic context place it in Epic 7's Sumário/Export dialog.
  - `[low]` `[reject]` The first Empresa field commits a `create` carrying the row rather than a `registry/empresa/{id}/{field}` put — this is the AD-3 create convention Story 2.1's instrument panel already uses; the matrix row's wording, not the code, is what is loose.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm verify` -- expected: lint, static, test:unit, test:api (including `files.integration.test.ts` and its cross-tenant cases) and Playwright `@p0` all green.
- `docker compose --profile tools run --rm tools pnpm test:e2e:full` -- expected: the `@p1`/`@p2` file and Empresa cases pass (evidence for the PR body, not gating).

**Manual checks (if no CLI):**
- Real-browser pass on `/cadastros` (Empresa and Instrumentos), 390/768/1280 px, light and dark, keyboard only and offline: tiles reachable and operable by keyboard, refusal reason announced, no sideways overflow, the preview absent from the accessibility tree, the app bar still reading `PRODUTO`.
- `mc`/`aws s3 ls` against MinIO on `127.0.0.1:23090`: exactly one object per uploaded file plus its two variants, under `company/{cid}/{kind}/{id}`.

## Auto Run Result

Status: done

**Summary.** Story 2.2's file plumbing and Story 2.3's Empresa tab ship together. The kernel gained the file candidate rules (25 MB, per-kind mime allow-list, one `objectKey` spelling), the file contract routes and error codes, the two company `preIssue` rows and five new `empresa` fields; `packages/domain/src/ops/path.ts` also lost a real bug (`email` was globally immutable, so `registry/empresa/{id}/email` never parsed). The api gained a MinIO storage adapter (`putObject`/`getObject`/`headObject`, no delete), sharp `thumb`/`print` variants with SVG rasterized, and the two routes `PUT /api/files/:id` (idempotent on id+sha256, retryable `409 file_row_missing`, emitting `file/{id}/uploaded_at` and `file/{id}/variants` as `system:files` server ops) and `GET /api/files/:id/:variant` (on demand, never prefetched). The web gained a one-transaction ops+Blob commit, an upload phase between push and pull with two uploads in flight and per-file isolation, the shared `UploadTile`, the certificate tile on the instrument row, and the Empresa tab with per-field autosave and the three-page `aria-hidden` CSS brand preview.

**Files changed.** Kernel: `src/files/{candidate,tile}.ts`, `src/checks/pre-issue.ts`, `src/registry/empresa.ts`, `src/contract/{errors,sync}.ts`, `src/ops/path.ts`, `src/schemas/entities.ts` (+ tests and the replay fixture). Api: `src/http/files.ts` (+ an 18-case integration test), `src/storage/{s3,variants}.ts`, `src/http/app.ts`, `src/main.ts`, `package.json` (sharp). Web: `src/components/upload-tile.tsx`, `src/db/{commit,file-store,file-commit,home-store}.ts`, `src/sync/{client,policy,engine}.ts`, `src/state/sync.tsx`, `src/surfaces/registries/{empresa-tab,brand-preview,instrument-panel}.tsx`, `registries.css`, `src/styles/app.css`, `src/copy/{pt-br,ui}.ts`. Tests: `e2e/files.spec.ts` and new Empresa cases in `e2e/cadastros.spec.ts`.

**Review findings.** One combined internal layer (LEAN MODE): 15 findings — 11 patched (2 high, 9 medium), 4 rejected (2 by design, 1 speculative, 1 whose only fix would edit this spec). Details in the Review Triage Log.

**Follow-up review recommendation:** true — two `high` entries were patched in this pass. Named unverified risk: both highs live in the same new API surface (`apps/api/src/http/files.ts`), which one combined layer reviewed once; the mandatory independent review must re-examine that file's tenant isolation, idempotency and the new header and id guards specifically.

**Verification.** `docker compose --profile tools run --rm tools pnpm verify` green before the patches and again after them: lint, static, test:unit (domain + web), test:api (87 tests, including the 18 file-route cases and the cross-tenant set) and Playwright `@p0` 17/17. `pnpm test:e2e:full` 39 passed before the patches; every suite touched by the patches (files, cadastros, upload-tile, file-store, engine/policy, registries) was re-run green after them.

**Residual risks.** The concurrent-PUT `uploaded_at` window is narrowed, not closed. `files_pending` has no consumer surface yet. MinIO's listing hides variant keys (reads by key are fine). A permanent upload failure is remembered only in memory. Two devices creating the first Empresa row offline would produce two rows. `applyOp`'s create path still does not re-check `value.id` against the path id (enforced by `opSchema` at the push boundary only). All are recorded in the frontmatter `deferred` list.
