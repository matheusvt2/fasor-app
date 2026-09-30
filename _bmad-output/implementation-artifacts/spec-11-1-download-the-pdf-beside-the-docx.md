---
title: 'Story 11.1: Download the PDF beside the DOCX'
type: 'feature'
created: '2026-09-30'
status: 'done'
baseline_revision: 'd7beb605ccc7cc22c1537c05cac945e78e799650'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'medium'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
warnings: ['batched']
batched_reason: 'Epic 11 batch e11a (wave 1) carries the single Story 11.1; the batch shape is the playbook default even for one story.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** Every revision already stores a PDF (`revision.pdf_file_id`, written by `apps/api/src/jobs/generate/job.ts:282,396`), but nothing serves it: the Export dialog only offers "DOCX — abrir no Word" and each past revision only a "DOCX" button, so the office cannot send the client the closed PDF (FR-62, FR-74).

**Approach:** Add `GET /api/revisions/{id}/pdf` as a copy of the DOCX route (company-scoped lookup, key derived from session company and the row's `pdf_file_id`), expose it through the kernel route table and the web client, and render the mock's PDF result row (with its share button where `navigator.share` exists) and the PDF button on each revision row. Extend the draft-equals-issued test to the PDF.

## Boundaries & Constraints

**Always:**
- Copy the DOCX route pattern at `apps/api/src/http/generate.ts:360-384`: uuid check -> 404, `entities` lookup with `company_id = session.companyId` and `entity = 'revision'`, `revisionRowSchema.safeParse`, `objectKey(session.companyId, 'pdf', revision.pdf_file_id)` (the kind the job writes at `job.ts:282`); never read an object key from a row. Headers: `content-type: PDF_MIME`, `content-disposition: attachment; filename="relatorio-rev-{n}.pdf"`, `x-content-type-options: nosniff`, content-length when known.
- UI built from `prototype/screens/73-exportar.html:143` (second `.result-row`: `rr-open` with `i-download` + `.rr-text` "PDF — enviar ao cliente", then `icon-btn` aria-label "Compartilhar PDF" with `i-share`) and `:154-155` (a second `btn btn-text` in `.rev-files` with `i-download` + "PDF"). Reuse the existing `TextButton`, `AriaButton` shapes and CSS classes already used for the DOCX row; no new CSS unless the mock needs it.
- Static strings go in `apps/web/src/copy/pt-br.ts` `export` block: `openPdf: 'PDF — enviar ao cliente'`, `sharePdf: 'Compartilhar PDF'`, `revisionPdf: 'PDF'`. Update the stale comment at `pt-br.ts:436-440` and the docblock of `ExportDialog` (`export-dialog.tsx:68-78`) and of `contract/generate.ts:4-10` that say the PDF is out of slice.
- The kernel's `readyToast` (`packages/domain/src/print/revisions.ts:203-206`) becomes the mock's verbatim `Revisão ${n} pronta — DOCX e PDF` (mock `73-exportar.html:123`); update its docblock and every test that asserts the old text (`revisions.test.ts:127`, `export-dialog.test.tsx`, `generate-watcher.test.tsx`, `e2e/export.spec.ts`, `e2e/parecer-export.spec.ts`, `e2e/photo-numbers.spec.ts`).
- The PDF result row follows the DOCX row's waiting rule: while `revision === null` its `rr-open` is `aria-disabled` and described by the same "Baixando a revisão…" reason; the share button shows only when `canShare()` and a revision is present.
- Share on mobile uses the DOCX precedent: `navigator.share({ title: readyTitle(n), url: <absolute revisionPdfUrl> })`, errors swallowed.
- Mocks: remove `data-slice="out"`, `data-slice-note` and the `slice-inline` class from the two PDF buttons at `73-exportar.html:154-155` (keep the drawing), and update the "PDF ao lado do DOCX" row of `mockups/MOCK-GUIDE.md` (around line 112) and its element count ("66 elementos") with a dated note, per MOCK-GUIDE's own rule.

**Never:**
- No op, row shape, reducer or `CONTRACT_VERSION` change (a GET route is not an op family).
- No conversion or rendering in the route; it serves the stored object only.
- No file-share (`navigator.share({ files })`) or new share mechanism; no Playwright MCP pass; do not edit `epics.md` or `sprint-status.yaml`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Download own | session of company A, revision of A | 200, `%PDF` bytes, `application/pdf`, attachment `relatorio-rev-1.pdf` | none |
| Other tenant | session of company B, revision of A | 404 `not_found` | same body as DOCX 404 |
| No session | no cookie | 401 | existing auth middleware |
| Bad id | `/api/revisions/not-a-uuid/pdf` | 404 | uuid check |
| Object missing | row exists, object absent in MinIO | 404 | `getObject` null |
| Revision not pulled yet | ready phase, `revision === null` | PDF row aria-disabled with "Baixando a revisão…" | press does nothing |
| No share sheet | desktop, no `navigator.share` | no "Compartilhar PDF" button | none |

</intent-contract>

## Code Map

- `apps/api/src/http/generate.ts:82-84` -- `docxFilename`; add `pdfFilename(number)` beside it (`relatorio-rev-{n}.pdf`).
- `apps/api/src/http/generate.ts:360-384` -- DOCX route to mirror; `PDF_MIME` already imported (line 13).
- `apps/api/src/jobs/generate/job.ts:282,396,409` -- PDF stored under `objectKey(companyId, 'pdf', pdfId)`; row field `pdf_file_id`.
- `packages/domain/src/schemas/entities.ts:593` -- `revisionRowSchema.pdf_file_id` (read only).
- `packages/domain/src/contract/generate.ts:17-28` -- `GENERATE_ROUTES`; add `revisionPdf`.
- `packages/domain/src/contract/contract.test.ts:23` -- route table test; add the PDF path.
- `apps/web/src/sync/client.ts:102-104` -- `revisionDocxUrl`; add `revisionPdfUrl`; test at `client.test.ts:128`.
- `apps/web/src/surfaces/export/export-dialog.tsx:55-66,155-181,337-344` -- open/share helpers, result block, `.rev-files`.
- `apps/web/src/surfaces/export/export-dialog.test.tsx:912-930` -- DOCX share unit test to mirror for PDF.
- `apps/web/src/copy/pt-br.ts:436-483` -- export copy block.
- `packages/domain/src/print/revisions.ts:203-206` -- `readyToast`.
- `apps/api/src/http/generate.integration.test.ts:420,593-605` -- DOCX download and cross-tenant tests to mirror.
- `apps/api/src/http/preview.integration.test.ts:202,256-360` -- `readPdf(buffer)` helper (per-page text + first-page image) and the preview/issue tests; the draft-equals-issued PDF test goes here.
- `apps/api/src/jobs/generate/docx-section-10.test.ts:79-95` -- the DOCX draft-equals-issued rule (body equal after `Rev. 1` -> `—` and date masking; watermark only in the draft).
- `e2e/export.spec.ts:54-160` -- `downloadFrom` helper and `@p0 4.8-E2E-001` (serial group, shares the document queue).

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/contract/generate.ts` -- add `revisionPdf: (id) => ({ method: 'GET', path: '/api/revisions/${id}/pdf' })`, fix the docblock -- one route table for both sides.
- `packages/domain/src/print/revisions.ts` (+ `revisions.test.ts`) -- `readyToast` -> "— DOCX e PDF" -- mock verbatim now that both ship.
- `apps/api/src/http/generate.ts` -- `pdfFilename` + the `GET /api/revisions/:id/pdf` route -- serve the stored PDF.
- `apps/api/src/http/generate.integration.test.ts` -- download test (200, headers, `%PDF`, filename, bytes are a PDF whose text contains "Rev. 1") and extend the cross-tenant test with PDF 404 for company B, 401 without session, 404 for a bad id -- tenant isolation.
- `apps/api/src/http/preview.integration.test.ts` -- new test `11.1-INT draft equals issued PDF`: after an issue (parecer set), press preview with nothing edited, wait for the job, fetch `preview.pdf` and `/api/revisions/{id}/pdf`; assert same page count, every page's text equal after replacing the revision label (`Rev. N` -> `—`) and masking dates the same way as the DOCX test, and the image rule (draft first page has the watermark image; issued does not) -- FR-62 identical content.
- `apps/web/src/sync/client.ts` (+ `client.test.ts`) -- `revisionPdfUrl`.
- `apps/web/src/copy/pt-br.ts` -- three keys + comment fix.
- `apps/web/src/surfaces/export/export-dialog.tsx` -- `openPdf`/`sharePdf` helpers, second `.result-row`, PDF `TextButton` in each `.rev-files`, docblock fix.
- `apps/web/src/surfaces/export/export-dialog.test.tsx` -- PDF row opens `revisionPdfUrl` (spy `window.open`), waits while the revision is unpulled, "Compartilhar PDF" shares the absolute PDF URL, each revision row's "PDF" opens its own URL; update toast text.
- `apps/web/src/state/generate-watcher.test.tsx` -- toast text.
- `e2e/export.spec.ts` -- extend `@p0 4.8-E2E-001` (rename to also carry `11.1-E2E-001`): install a recording `navigator.share` stub with `page.addInitScript` before the first navigation; after the DOCX steps, press "PDF — enviar ao cliente" -> download URL matches `/api/revisions/<uuid>/pdf`, suggested filename `relatorio-rev-1.pdf`, `page.request.get` answers 200 `application/pdf` with `%PDF` bytes; the Revisões row's "PDF" downloads the same URL; press "Compartilhar PDF" and assert the stub recorded `{ title: 'Revisão 1 pronta', url: <origin>/api/revisions/<id>/pdf }`; update the toast text.
- `e2e/parecer-export.spec.ts`, `e2e/photo-numbers.spec.ts` -- toast text only.
- Mocks `73-exportar.html:154-155` and `MOCK-GUIDE.md` -- slice marks removed, table and count updated with a dated note.

**Acceptance Criteria:**
- Given a generated revision 1 with `pdf_file_id`, when the user taps "PDF — enviar ao cliente" in the Export dialog, then the browser downloads `relatorio-rev-1.pdf` from `GET /api/revisions/{id}/pdf` with `application/pdf` bytes starting `%PDF`.
- Given the Revisões list, when the user taps a row's "PDF", then that revision's PDF downloads from the same route.
- Given a browser with `navigator.share` (mobile), when the user taps "Compartilhar PDF", then the system share sheet is called with the revision title and the absolute PDF URL; given no `navigator.share`, then no share button renders.
- Given company B's session, when it requests company A's revision PDF, then the api answers 404 `not_found`; without a session 401.
- Given an issued revision and a preview rendered from the same unedited snapshot, when both PDFs are read, then they have the same pages and the same text except the revision label, and only the draft carries the watermark image.
- Given a revision arrives, when the toast shows, then it reads "Revisão N pronta — DOCX e PDF".

## Spec Change Log

## Review Triage Log

### 2026-09-30 — Review pass

Layers run: Edge Case Hunter, Verification Gap Reviewer. Skipped: Blind Hunter and Intent Alignment (token economy; the integrated epic review covers them).

- verdicts: 5 findings — high 0, medium 0, low 2, false 3, maybe-false 0
- findings:
  - `[low]` `[patch]` The navigable prototype `mockups/prototype/index.html:3854-3855` still carried `data-slice="out"` on both revision PDF buttons, so MOCK-GUIDE's new count disagreed with the prototype — patched: the same edit applied to `index.html`; a `build.py` run in a `python:3-slim` container reproduces the edited file byte for byte.
  - `[false]` `[reject]` A leftover running job's worker could later overwrite `preview_file_id` in the 11.1-INT preview test — the leftovers are rows written by `fakeJob` (`preview.integration.test.ts:150`) with no worker behind them; every real job of the file is awaited to `done` by `waitForJob`.
  - `[false]` `[reject]` The leftover filter lacks a company predicate, so `endJob` could be rejected for another company's job — `RELATORIO_ID` is company A's; the only company B press on it answers 404 and queues no job (`preview.integration.test.ts:248`), so no other company's job row names it.
  - `[false]` `[reject]` The draft-equals-issued PDF comparison masks dates but not hh:mm times — the document prints no time: the DOCX rule (`docx-section-10.test.ts:52,79-95`) compares body and header with dates masked only and passes byte for byte.
  - `[low]` `[reject]` A revision whose PDF object is missing opens a tab with the JSON 404 — the DOCX button has the same pre-existing behavior; the object is written in the same job that creates the revision row, so the state is abnormal, and a guard would add a new error surface for both buttons.

## Design Notes

Open question (kept conservative, listed in the PR): the share sheet shares the authenticated URL, as the DOCX share already does (Story 7.5); a recipient without a session cannot open it. Sharing the file bytes (`navigator.share({ files })`) would change the DOCX share too and is left for Matheus.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:unit` -- expected: green.
- `docker compose --profile tools run --rm tools pnpm test:api` -- expected: green (needs `docker compose up -d postgres minio`).
- `docker compose --profile tools run --rm tools pnpm lint` and `pnpm static` -- expected: green.
- Targeted e2e under the host lock: `flock /tmp/fasor-verify.lock docker compose --profile tools run --rm tools pnpm test:e2e:full e2e/export.spec.ts e2e/parecer-export.spec.ts e2e/photo-numbers.spec.ts` (every tag of the touched specs) -- expected: green.

## Auto Run Result

Status: done

- **Summary:** `GET /api/revisions/{id}/pdf` serves the stored revision PDF (company-scoped, key derived from the session company and `pdf_file_id`, attachment `relatorio-rev-{n}.pdf`); `GENERATE_ROUTES.revisionPdf` and `revisionPdfUrl` expose it; the Export dialog renders the mock's "PDF — enviar ao cliente" result row with "Compartilhar PDF" where `navigator.share` exists, and a "PDF" button on each revision row; `readyToast` reads "Revisão N pronta — DOCX e PDF"; the draft-equals-issued rule covers the PDF (11.1-INT).
- **Files:** `packages/domain/src/contract/generate.ts` (route), `packages/domain/src/print/revisions.ts` (toast), `apps/api/src/http/generate.ts` (route + `pdfFilename`), `apps/web/src/sync/client.ts` (URL), `apps/web/src/copy/pt-br.ts` (three strings), `apps/web/src/surfaces/export/export-dialog.tsx` (rows and share); tests in `contract.test.ts`, `revisions.test.ts`, `generate.integration.test.ts`, `preview.integration.test.ts`, `client.test.ts`, `export-dialog.test.tsx`, `generate-watcher.test.tsx`, `e2e/export.spec.ts`, `e2e/parecer-export.spec.ts`, `e2e/photo-numbers.spec.ts`; mocks `73-exportar.html`, `prototype/index.html`, `MOCK-GUIDE.md` (slice marks removed, dated note).
- **Review:** 5 findings; 1 patch applied (prototype `index.html` slice marks); 0 deferred; rejected: 3 false (fake-job worker, company filter, time mask) and 1 low (JSON 404 tab on a missing object, pre-existing DOCX behavior). Patched counts: high 0, medium 0, low 1.
- **Follow-up review recommended:** false.
- **Verification:** `pnpm verify` green on 4e6058a (lint, static, test:api 325 tests, test:unit 2618 tests, test:e2e 164 @p0 tests including `11.1-E2E-001`), 2119.8 s after a lock wait of 8721 s.
- **Residual risks:** the share sheet shares the authenticated URL (open question for Matheus, same as the DOCX share).
