---
type: Architecture Rule
title: Rendering, revisions, print order and section 8
description: AD-15, AD-16, AD-26. Open for DOCX/PDF generation, TOC, revisions, preview, grouping for print, photo numbering in text, or untested entries.
tags: [architecture, rendering, docx, pdf, ad-15, ad-16, ad-26]
timestamp: 2026-09-30T00:00:00Z
sources: [ARCHITECTURE-SPINE.md#ad-15, ARCHITECTURE-SPINE.md#ad-16, ARCHITECTURE-SPINE.md#ad-26]
---
# Rendering

- **One renderer (AD-15)**, server-side, over `RelatorioSnapshot`, a kernel zod schema built by `toSnapshot()` on web and api; a replay test asserts both are byte-equal. `POST /api/relatorios/{id}/generate` carries `{last_op_id, file_ids_expected}`; the server answers `409 not_caught_up` until caught up; the Export dialog flushes sync first.
- The job freezes the snapshot, builds the DOCX with the `docx` library, converts to PDF with LibreOffice headless inside the same job. The TOC is static, in two passes (placeholder numbers, read heading pages from the PDF outline, write them, assert equal, third pass if not). Generate concurrency is 1 per instance.
- Revisions: `revision/{id}` is emitted in the transaction that stores both files, so a failed job consumes no number. `editedSince(snapshot_seq)` gates it: a generate with nothing edited returns the last revision. Preview is the identical job with a RASCUNHO watermark and no revision number; one test asserts preview and issued output differ only by watermark and revision line. The FR-1 brand preview is CSS, not a render.
- **Print order (AD-16)**: tree order is the engineer's; the renderer never reorders the tree. `groupForPrint(snapshot, scheme)` with scheme `por_local_e_tipo` (default) or `ordem_de_campo`, stored by `relatorio/export/scheme`. The scheme is not exposed in the Export UI at present.
- **Section 8 (AD-26)**: `point.text` is plain text whose only markup is `[[foto:<photo_id>]]`; there is no `photo_ids` field. `resolveSection8` turns tokens into "Imagem NN". Untested entries come from `derivedPoints(snapshot)`, printed after manual points, never stored; a point created from an untested sheet carries `origin: not_tested` and suppresses the derived one.

Code: server `apps/api/src/jobs/generate/` (`job.ts`, `docx.ts`, `toc.ts`, `pdf-outline.ts`, `libreoffice.ts`, `pdf-raster.ts` (certificate PDFs to 150 dpi PNG with poppler `pdftoppm`, 30 s per run, 300 s budget), `certificate-cache.ts` (pages cached at `company/{id}/certificate-pages/v1/{sha256}`), `watermark.ts`, `sections/`, `golden/`), `apps/api/src/http/generate.ts`, `apps/api/src/sync/snapshot.ts`; web `apps/web/src/db/snapshot.ts` and `generate-store.ts`; kernel `packages/domain/src/print/` (`group-for-print.ts`, `section-7.ts`..`section-11.ts`, `layout.ts`, `revisions.ts`, `document-control.ts`), `photos/order.ts` (numberPhotos), `status/edited-since.ts`. Goldens regenerate with `scripts/regen-goldens.ts`. The fixture and goldens may carry the real Porto Seguro data (see [rules](/project/rules.md)).
