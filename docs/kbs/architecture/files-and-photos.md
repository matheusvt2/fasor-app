---
type: Architecture Rule
title: Files, photo durability, variants, time and numbering
description: AD-7 and AD-17. Open for uploads, photo capture/import, thumbnails, stamps, coordinates, photo numbers or certificate files.
tags: [architecture, files, photos, ad-7, ad-17]
timestamp: 2026-09-30T00:00:00Z
sources: [ARCHITECTURE-SPINE.md#ad-7, ARCHITECTURE-SPINE.md#ad-17]
---
# Files and photos

- `file` is one zod union on `kind` in photo, certificate, logo, cover_background, watermark, cover_photo, preview, docx, pdf. Owners point at files, never the reverse. `file/{id}` create is a client op emitted in the same batch as the row that links it, and the Blob is written to IndexedDB in the same transaction. The uploader never PUTs a file whose create op is pending or dead.
- Photo original: re-encoded on the device at capture to JPEG, long edge at most 2560 px, quality 0.85, EXIF orientation applied, EXIF time and GPS parsed on the device. `PUT /api/files/{id}` is idempotent (sha256), over 25 MB is `413 file_too_large`, requires the create op applied (`409 file_row_missing` otherwise). The server emits `uploaded_at` and `variants` (thumb at most 512 px, print at most 2000 px JPEG q85, via `sharp`) as `system:files` ops. The renderer embeds `print`, never `original`.
- Object keys are immutable: `company/{cid}/{kind}/{id}` or `company/{cid}/relatorio/{rid}/{kind}/{id}`; versioned bucket; the adapter has no delete in the MVP.
- The local original is marked `acked` after upload and is the first eviction candidate under storage pressure. Upload order: files with pending reading, then photos by capture time, then others; two in flight; one failure never blocks the queue. Design capacity 500 photos per relatório.
- **AD-17 time**: wire timestamps UTC ISO 8601; display and document America/Sao_Paulo. Photo keeps `captured_at`, `tz_offset`, `local_seq`, optional `coords {lat, lng, accuracy_m, source geolocation|exif}` (printed at 4 decimals, omitted when absent). Sort key `(captured_at, device_id, local_seq)`. Numbers come from `numberPhotos` at generation and freeze with the revision; before export they are provisional.

Code: `apps/web/src/files/` (capture, encode, import, rescue), `apps/web/src/db/file-store.ts`, `apps/api/src/http/files.ts`.
