---
title: 'Epic 11 fixes: integrated review findings and loading states'
type: 'bugfix'
created: '2026-09-30'
status: 'done'
baseline_revision: 'a99e0978f1ee738528367b11adc99617ce9446ce'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: medium
context: []
warnings: ['batched', 'multiple-goals']
batched_reason: 'The Epic 11 fix batch: every finding of the integrated QA (epic-11-review-qa.md) plus Matheus loading-state rule of 2026-09-30, one PR by coordinator decision.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The Epic 11 QA (`_bmad-output/implementation-artifacts/reviews/epic-11-review-qa.md`) found: the DOCX/PDF share sends an authenticated URL a client cannot open (Q1); three seam checks exist only as a manual pass (Q3); PDF action-plan headers break mid-word (Q4); raw `**` markup shows in the per-relatório section text surface (Q5); an orphan "Ou" in the block palette with AI off (Q6); two ledger items (Q7, Q8). Matheus (2026-09-30): a loading screen must never look frozen (EXPERIENCE.md:240 "Blank screen or spinner with no words" is forbidden).

**Approach:** Fetch the revision file as a Blob and download or share the file itself; add the missing automated checks; rebalance section 8 column weights; put the per-relatório section text surface on the same rich editor as the template composer; drop "Ou" when the camera row is absent; add a worded boot splash, one shared loading-note component on every route surface, and waiting labels on server-bound buttons.

## Boundaries & Constraints

**Always:**
- Matheus, 2026-09-30 (E11-Q1, both formats): the DOCX and the PDF rows (result block AND each revision row) save the actual file (`relatorio-rev-{n}.docx` / `.pdf`) on desktop, Android Chrome and iPadOS Safari: `fetch` the existing route with credentials, `blob()`, `new File([blob], name, {type})`, then an object URL on a temporary `<a download>` click (revoke after). "Compartilhar DOCX/PDF" shares the file via `navigator.share({ files: [file], title })` when `navigator.canShare?.({ files: [file] })` is true; otherwise it falls back to the download of the file, never to a URL share. The share button shows when `navigator.share` exists (as today). A failed fetch (offline, 401, 5xx) shows a worded line, never silence; AbortError from the share sheet (user cancel) is silent.
- The helpers live in one web module (e.g. `apps/web/src/surfaces/export/revision-file.ts`), unit-testable with stubbed `fetch`, `navigator.share`, `navigator.canShare`, `URL.createObjectURL`.
- New pt-BR strings are `// authored:` in `apps/web/src/copy/pt-br.ts` (surface copy) or `ui.ts` (the shared loading component's chrome); derived texts (plural/count) go to `packages/domain`.
- Buttons stay `aria-disabled` via the Button component (AD-23); never native `disabled`.
- Document tests assert from their own section heading (E7-A6). Regenerate goldens only if the weight change alters them; say so in the report.
- Product name comes from `PRODUTO` (`packages/domain`); no "fasor"/Fasor in any visible string.

**Never:** no URL share anywhere; no new op family or `CONTRACT_VERSION` bump; no new dependency; no change to `tokens.css`/`components.css`; no AWS; no edits to `epics.md` or `sprint-status.yaml`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected |
|---|---|---|
| Download | desktop, tap "PDF — enviar ao cliente" | file `relatorio-rev-N.pdf` saved, bytes start `%PDF`; DOCX saves `relatorio-rev-N.docx`, bytes start `PK` |
| Share with files | `share` + `canShare({files})` true | `navigator.share` called once with `files[0].name === 'relatorio-rev-N.pdf'`, type `application/pdf`, no `url` key |
| Share without files | `share` exists, `canShare` missing or false | no `navigator.share` call; file downloaded |
| Share cancelled | `share` rejects AbortError | nothing shown |
| Fetch fails | 401/5xx/offline | worded error line near the row; nothing downloaded |
| Busy | fetch pending | row label reads the authored waiting word (e.g. "Baixando…") |
| Boot | JS not yet mounted | `index.html` shows "Carregando PRODUTO…" (worded, role=status) until React replaces `#root` content |
| Pending query | route live query `undefined` | shared loading note names what loads, e.g. "Carregando relatórios…" |

</intent-contract>

## Code Map

- `apps/web/src/surfaces/export/export-dialog.tsx:54-78,165-210` -- `openDocx/shareDocx/openPdf/sharePdf` (URL based) and the result rows; revision rows further down use the same helpers. Replace with the file helpers.
- `apps/web/src/sync/client.ts:102-109` -- `revisionDocxUrl/revisionPdfUrl` (routes; same origin, cookie session).
- `apps/web/src/copy/pt-br.ts:459-505` -- export copy (`shareDocx`, `sharePdf`, `previewing: 'Gerando rascunho…'`, `generate`); `:17-24` login already has `signingIn`; `:1266-1269` `common.loading`; `:675` `chooseType` with "Ou".
- `e2e/export.spec.ts` -- existing Export dialog spec; add the @p0 download (both formats, bytes) and share-stub assertions. Stub via `page.addInitScript` defining `navigator.share`/`canShare` that record the call into `window`.
- `apps/api/src/jobs/generate/sections/section-8.ts:20` -- `WEIGHTS = [5, 25, 15, 11, 10, 18, 10, 6]`; QA proposal `[5, 22, 14, 11, 10, 17, 12, 9]`; ensure "Responsável", "Prioridade", "Imagens" fit at 9 pt bold within cell margins (`CELL_MARGINS` left/right 60 twips).
- `apps/api/src/jobs/generate/docx.test.ts` -- add the width assertion (estimate bold 9 pt glyph width conservatively, e.g. 0.6 em per char = 108 twips per char; tighten if the fixture proves it).
- `apps/api/src/jobs/generate/rich-text.integration.test.ts:100-110,174` -- pdfjs text-item helper; reuse for a PDF check that no section 8 header word is split across text items (from the section-8 heading, not a page number).
- `e2e/action-plan.spec.ts` 11.10-E2E-001 -- extend: download "PDF — enviar ao cliente" and assert the action-plan headers and row texts appear in the PDF text (11.10-PDF). The e2e runner may not have pdfjs; if not, cover 11.10-PDF by an api integration test that generates a revision with an action-plan row and reads the stored PDF.
- `packages/domain/src/templates/from-relatorio.test.ts` -- 11.4-TEMPLATE-FORMAT: `**x**` and `*y*` in a relatório block's `section_text` survive `templateFromRelatorio`.
- 11.4-PRINT-BOTH PDF half: `e2e/rich-text-print.spec.ts` or `rich-text.integration.test.ts`: the downloaded/stored PDF of a relatório whose section text carries bold/italic draws those words in distinct fonts (the integration test at :174 covers the template path; add the relatório-own-text path through the rich editor if cheap, else assert the stored PDF of a relatório with own formatted text).
- `apps/web/src/surfaces/relatorio/section-text-surface.tsx` + `use-section-text-area.ts` -- plain contenteditable area. `apps/web/src/surfaces/templates/section-text-dialog.tsx` + `apps/web/src/input/use-rich-text-area.ts` -- the rich editor (`.rich-text`, `.rt-toolbar`, `.rt-tool`, `.rt-area`). Extract the toolbar+area into one shared component and use it in both places; keep the surface's restore, autosave, undo and "Inserir dado do relatório" chip row behavior; update `autosaveNote` ("Texto simples; negrito e listas ficam para depois." no longer true; authored replacement) and `e2e/rich-text-print.spec.ts:94-96` which pins the raw markup.
- `apps/web/src/surfaces/relatorio/block-palette-field.tsx:124` -- heading; with the camera row absent use authored `chooseTypeOnly: 'Escolha o tipo · TAG sugerida por tipo + coluna'`; update `e2e/ai-features-off.spec.ts:113` and `block-palette-field.test.tsx`.
- `apps/web/index.html` -- add the splash inside `#root` (React's `createRoot().render` replaces it). Text "Carregando PRODUTO…" literal as the existing `<title>PRODUTO</title>`; add a unit test (e.g. next to `apps/web/src/sw/shell-version.test.ts`) that index.html contains `Carregando ${PRODUTO}…`. Inline minimal CSS or token variables only.
- Loading note: existing pattern `<p className="section-note" role="status">{copy.common.loading}</p>` in `app.tsx:36-45`, `relatorio-gate.tsx:44`, `templates-surface.tsx:206`, `setup-surface.tsx:62`, `section-text-surface.tsx:56`, `project-surface.tsx:86`, `template-composer.tsx:75`. Make one component (e.g. `components/loading-note.tsx`, `LoadingNote({ what })`) rendering that markup with "Carregando {what}…" and replace them; then audit every route surface in `app.tsx:129-184` (Home, Account, Sync, Cadastros, Templates, Composer, Project, Sumário, Setup, Árvore, Ficha, Fotos, Pontos, Seção) and wherever the main live query is still `undefined` and the surface renders blank or empty-state, render the note instead (Home must not flash its empty state while loading).
- Waiting labels: Generate button reads authored "Gerando…" while `phase.kind` is `flushing`, `requesting` or `working`; Login already "Entrando…"; Preview already "Gerando rascunho…"; "Sincronizar agora" (sync surface) reads authored "Sincronizando…" while running if it does not already; the file rows read "Baixando…" while fetching. Grep other buttons awaiting a server call and list what you changed.
- `_bmad-output/implementation-artifacts/deferred-work.md:1182,1188,1200,1206` -- strike the `state:` and add the dated new one: 1182/1188/1206 closed by this batch's tests (name them); 1200 re-owned "Matheus: latent until a relatório can remove a location" with the QA evidence (Q8). Add one entry for Q7 (flake ledger: matrix cold-start, durability.spec.ts:61, re-run 3/3 green; owner Epic 12 coordinator if it recurs) and one for Q2 (live deploy smoke, owner Matheus).

## Tasks & Acceptance

**Execution:**
- `apps/web/src/surfaces/export/revision-file.ts` (+ `.test.ts`) -- fetch/download/share helpers per the matrix.
- `apps/web/src/surfaces/export/export-dialog.tsx` -- wire result and revision rows; busy label; error line; Generate "Gerando…".
- `apps/web/src/copy/pt-br.ts`, `ui.ts` -- authored strings.
- `e2e/export.spec.ts` -- @p0: download both formats (Playwright `download` event, read bytes: `%PDF`, `PK`, filenames); @p0 share stub with `canShare` true (files recorded, no url) and with `canShare` false (download happens, share not called), both formats.
- `apps/api/src/jobs/generate/sections/section-8.ts`, `docx.test.ts` -- weights and width test; goldens only if required.
- Q3 tests as mapped above.
- Section text surface on the shared rich editor; tests updated.
- Palette heading fix.
- `apps/web/index.html` splash + unit test; `LoadingNote` + surface audit; @p1 e2e `e2e/loading-states.spec.ts`: delay the boot (route `**/src/main.tsx` or the bundle script with a delay) to observe the splash text; delay a query/fetch to observe one surface's "Carregando …" note; one @p0 assertion that the Generate button reads "Gerando…" while the generate request is held (route the generate POST with a delay) and that Entrar reads "Entrando…" while sign-in is held.
- `deferred-work.md` ledger edits.

**Acceptance Criteria:**
- Given a generated revision on desktop, when the user taps "DOCX — abrir no Word" or "PDF — enviar ao cliente" or a revision row's DOCX/PDF, then a file named `relatorio-rev-N.{docx,pdf}` downloads with the right bytes.
- Given a device whose `navigator.canShare({files})` is true, when "Compartilhar PDF" (or DOCX) is tapped, then the system share receives the file and no URL; given it is false, then the file downloads instead.
- Given the action plan in the issued PDF, when its text is read, then no header word of section 8 is split.
- Given a relatório section text with `**negrito**`, when the per-relatório section surface opens, then it shows bold text in the rich editor and no literal `**`.
- Given AI_FEATURES off, when the Add block palette opens, then the heading has no leading "Ou".
- Given a slow boot or a pending query, when the user looks at the screen, then a worded "Carregando …" is visible, never blank; given a server-bound button is waiting, then its label says so.

## Review Triage Log

2026-09-30, pass 1. Only the Edge Case Hunter ran; Blind Hunter, Verification Gap and Intent Alignment were skipped for token economy (the integrated epic review covers them). Verdicts: 9 patch, 1 defer.

- A stale fetch-failed alert survives a dialog close or a revision change. Patch: reset on close and on revision change.
- A second file press while one is busy is dropped silently. Patch.
- A share press reuses the download row's busy key, so the share icon gives no feedback. Patch: a separate key and a waiting label.
- iPadOS: after the awaited fetch the user activation is gone, so `navigator.share` may refuse. Patch: prefetch the File where a share sheet exists and share synchronously from the cache.
- Home tiles show zero counts while loading. Patch.
- Test: the section_8 `order_key` collides with the fixture's, and the header start index can be -1. Patch.
- Empresa, Account and Sync render default content while pending. Patch: LoadingNote.
- A 401 (expired session) is worded as a connection failure. Deferred, low: the offline line still tells the person something failed. The deferred-work entry is owned by Matheus.

## Verification

**Commands (inside the tools container, never on the host):**
- `docker compose --profile tools run --rm tools pnpm test:unit` -- green.
- `docker compose --profile tools run --rm tools pnpm test:api` -- green.
- `docker compose --profile tools run --rm tools pnpm test:e2e -- e2e/export.spec.ts e2e/loading-states.spec.ts ...` (check `scripts/e2e.ts` for how to pass specs and to include @p1) -- the touched specs green.
