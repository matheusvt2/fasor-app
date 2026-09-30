# Epic 11: integrated review and human-style QA

Date: 2026-09-30. Branch `qa/epic-11-review` from `origin/main` 79995e2 (PRs #67, #69 to #77). Isolated compose `fasor-e11q`, port base 61. Story 11.6 is blocked and out of scope.

What this pass covered, beyond the integrated gate recorded on PR #67 ("Integrated Epic 11 gate": `pnpm verify` and `test:e2e:full` 314/316, both failures fixed and re-run green), which was not redone:

1. **Code review.** The diffs of #69 to #75 and #77 (`gh pr diff`), read through two lenses: cross-batch seams and edge cases.
2. **`pnpm test:e2e:matrix`**, run once under the host lock:
   - Log: `/tmp/verify-e11q-matrix.log`.
   - Result: 69 tests, 60 passed, 1 failed, 8 skipped by design.
   - The failed test, re-run on all three projects (`/tmp/verify-e11q-matrix-rerun.log`), passed 3 of 3. See E11-Q7.
3. **Playwright MCP pass.** It ran on the local dev stack, seeded as `qa@e11q.test` with the standard template and the sample relatório.
   - A new relatório was made from Home: "Cliente QA · Obra QA".
   - Sizes: 1280, 768 and 390 px, plus the Move dialog in dark mode at 390 px.
   - One run had the api started with `AI_FEATURES=off`.
   - The revision's PDF was downloaded through the UI and read with pdfjs in the `tools` container.
   - Screenshots are in `_bmad-output/implementation-artifacts/reviews/epic-11-qa/`.

## Findings

Counts: 0 high, 2 medium, 6 low.

### E11-Q1 (medium): "Compartilhar PDF" shares a link the client cannot open

- **What happens.** The Export dialog's PDF row is worded "PDF — enviar ao cliente". On a device with `navigator.share`, its share button shares the absolute `/api/revisions/{id}/pdf` URL, not the file (`apps/web/src/surfaces/export/export-dialog.tsx:74`, `sharePdf`).
- **Why it fails.** That route needs a session. Without a cookie it answers `401`: `curl http://localhost:61073/api/revisions/01a0f300-…/pdf` returned 401. The client who receives the link cannot open the relatório.
- **How it got here.** The spec copied the DOCX precedent and ruled out a file share (`spec-11-1-download-the-pdf-beside-the-docx.md:34,40`). For the DOCX row that is harmless, because it is an internal "abrir no Word". For the row whose whole purpose is sending to the client, it defeats the story's "a share sheet is offered on mobile" (`epics.md:2351`).
- **Proposed fix (a product call for Matheus).**
  - Fetch the PDF as a `Blob` and share `new File([blob], 'relatorio-rev-N.pdf', { type: 'application/pdf' })` through `navigator.share({ files })` when `navigator.canShare({ files })` allows it (Android Chrome and iPadOS Safari do). Keep the URL share only as the fallback.
  - Add a unit test with a stubbed `canShare`.

### E11-Q2 (medium): DEPLOY-SMOKE and 11.8-ROLE were never asserted live

- **State.** `sprint-status.yaml:140` reads: "11-8 … in-progress # PR #74 merged; first deploy pending". No batch ran `infra/bin/deploy`:
  - `DEPLOY-SMOKE-{tag}` has no evidence for D, T, B, E or P.
  - The live half of 11.7 (a real `DetectDocumentText` call) also waits (`sprint-status.yaml:139`).
- **What the code shows.** The budget action attaches a deny on `bedrock:InvokeModel*` and `textract:*` to both app roles at 100 % actual (`infra/production/budget.tf:6-16,52-75`). The ECS task role takes the bootstrap Bedrock/Textract policy by name (`infra/production/iam.tf:58-67`). Nothing has proved either of them against the account.
- **Proposed fix.** Run the first deploy (Matheus logs in `fasor-admin`) and record DEPLOY-SMOKE once for the whole wave: the migration task exit 0, and `GET /api/health` over HTTPS with every component up. Record 11.8-ROLE with:
  - one `DetectDocumentText` through the task role;
  - one Converse call on a model outside the allow list, which must be denied;
  - `aws iam simulate-principal-policy` for both roles with `fasor-production-deny-bedrock-textract` attached.

  Close 11.8 only then.

### E11-Q3 (low): three named seam assertions exist only as this manual pass

- **What is missing.** `11.4-TEMPLATE-FORMAT`, the UI half of `11.4-PRINT-BOTH` (the PDF downloaded from the Export dialog) and `11.10-PDF` have no automated test. They are ledger entries `deferred-work.md:1182`, `:1188` and `:1206`, owned by this QA.
- **They pass here.** See the seam table.
- **Proposed fix.** Close the three ledger entries with this report as evidence, and add one cheap regression test:
  - Extend `e2e/action-plan.spec.ts` 11.10-E2E-001 so that it also downloads "PDF — enviar ao cliente" and reads the text of page 7. The pdfjs helper already exists in `apps/api/src/jobs/generate/rich-text.integration.test.ts:100-110`.
  - Give 11.4-TEMPLATE-FORMAT one kernel assertion in `packages/domain/src/templates/from-relatorio.test.ts`: `**x**` in `section_text` survives `templateFromRelatorio`.

### E11-Q4 (low): action-plan table headers break inside words in the PDF

- **What happens.** In the issued PDF (page 7 of rev 1), the header cells read `"Responsá" / "vel"` and `"Imag" / "ens"` (pdfjs text items, `test-results/qa/pdf-check.mjs` output). LibreOffice breaks the word without a hyphen.
- **Cause.** The two columns get 10 % and 6 % of the width at 9 pt (`apps/api/src/jobs/generate/sections/section-8.ts:20`, `WEIGHTS = [5, 25, 15, 11, 10, 18, 10, 6]`).
- **Proposed fix.** Rebalance the weights so that the longest header word fits, for example `[5, 22, 14, 11, 10, 17, 12, 9]`. Assert in `docx.test.ts` that no header cell is narrower than its word at 9 pt, then regenerate the goldens.

### E11-Q5 (low): markup inside `section_text` leaks into the plain per-relatório surface

- **What happens.**
  - A relatório born from a formatted template shows the raw markup (`A **manutenção** caracteriza-se`) in the plain Section text surface (`e2e/rich-text-print.spec.ts:94-96`).
  - An engineer who types paired asterisks there, or a line starting with `- ` or `N. `, now gets formatting or a list in print.
  - In this pass, a line typed after Enter in section 2 printed as a bullet ("●" before "Nota QA com", PDF page 4). Those are Story 3.6's flat-text semantics.
- **Status.** This is the recorded trade-off of markup-in-string (`spec-11-4-11-5-rich-text-and-location-stamp.md:17-19,56`). It is not a regression, but the engineer has no cue.
- **Proposed fix.** A retro item: either render the plain surface's markup as a read-only "Como imprime" preview line, or escape `*` and leading markers typed there through the kernel serializer.

### E11-Q6 (low): with AI features off, the Add block palette opens with an orphan "Ou"

- **What happens.** With `AI_FEATURES=off` the "Fotografar equipamento" row (`.pal-camera`) is hidden, but the next heading still reads "Ou escolha o tipo · TAG sugerida por tipo + coluna". Observed at 768 px. Sources: `apps/web/src/copy/pt-br.ts:675` and `apps/web/src/surfaces/relatorio/block-palette-field.tsx:124`.
- **Proposed fix.** Add a second static string, "Escolha o tipo · TAG sugerida por tipo + coluna" (authored), used when the camera row is absent. Update `e2e/ai-features-off.spec.ts`, which currently pins the "Ou" text.

### E11-Q7 (low): a matrix cold-start flake on the first parallel test

- **What happens.** `durability-desktop-chrome` `e2e/durability.spec.ts:61` (1.8-E2E-001) failed in the matrix after 31.6 s. `signInForDurability` (`e2e/support/durability.ts:74`) hit "Protocol error (Runtime.callFunctionOn): Internal server error, session closed". It was the first test after the bundle build.
- **Reproduction.** The re-run passed on all three projects (3/3, 94 s). No app defect was reproduced.
- **Proposed fix.** Record it in the flake ledger. If it recurs, add a warm-up navigation in the global setup, or `retries: 1` on the durability projects' first spec only.

### E11-Q8 (low): a ledger entry owned by this review is unreachable today

- **The entry.** `deferred-work.md:1200` (owner: Epic 11 integrated review) says a `block/{id}/location_id` put is not checked against live locations, so a target removed concurrently hides the block.
- **What the code shows.** A relatório has no location-removal op: `apps/web/src/surfaces/relatorio/relatorio-ops.ts:47-57` offers only the `location/{id}` create, `name`/`order_key` puts and `agrupar_por_tipo`. The only location removal is in the Template composer. No UI path can produce the state.
- **Proposed fix.** Re-own the entry to Matheus as "latent until a relatório can remove a location", with this evidence. No code change.

## Cross-story seam table (epic-11-context.md "Cross-Story Dependencies")

| Named assertion | Result | Evidence |
|---|---|---|
| 11.2-UNDO | pass | `e2e/move-block.spec.ts:179` (@p0; device and server after a sync); `apps/api/src/sync/move-block.integration.test.ts`. MCP: SEC-C05 moved to Oxigênio renamed SEC-OXIGENIO-2, and "Desfazer" put it back in Coluna 5 as SEC-C05 |
| 11.2-MERGE | pass | `e2e/move-block.spec.ts:342` (@p1, green in the integrated `test:e2e:full`) |
| 11.3-AFTER-MOVE | pass | `e2e/save-template.spec.ts:115`; `packages/domain/src/templates/from-relatorio.test.ts`. MCP: after SEC-C05 moved to Coluna 9, "Salvar como template" created "Modelo QA movido", listed in /templates |
| 11.3-UNDO | pass | `e2e/save-template.spec.ts:95` |
| 11.4-TEMPLATE-FORMAT | pass (manual only, E11-Q3) | MCP: section 2 of the relatório set to `Nota QA com **negrito** e *italico*.`, saved as "Modelo QA formatado". The composer's rich editor then holds `<li>Nota QA com <strong>negrito</strong> e <em>italico</em>.</li>`. Printing from a template is covered by `e2e/rich-text-print.spec.ts:60` |
| 11.4-UNDO | pass | `e2e/templates.spec.ts:987,1012`. MCP at 768 px: Numeração turned the `<ul>` into an `<ol>`, and Ctrl+Z restored the `<ul>`. Negrito and Lista read `aria-pressed="true"` on the caret |
| 11.4-PRINT-BOTH | pass | Renderer: `apps/api/src/jobs/generate/rich-text.integration.test.ts:174`. UI (manual): in the PDF downloaded from the Export dialog, "negrito" and "italico" are drawn in fonts `g_d0_f2` and `g_d0_f3`, distinct from the run's `g_d0_f1` (page 4) |
| 11.5-OFF-STAMP | pass | `e2e/photos.spec.ts:384` (coords null, no geolocation request, stamp date/time only). Section 7 prints through the same `photoStampFull` (`packages/domain/src/print/section-7.ts:58`, `gallery.test.ts:103`) |
| 11.5-DENIED | pass | `e2e/photos.spec.ts:448` |
| 11.5-UNDO | pass (no undo by design) | `e2e/photos.spec.ts:407`. MCP at 390 px: the switch off shows the helper-off text and no toast, and a second tap restores it |
| 11.9-UNDO | pass | `e2e/action-plan.spec.ts:180` (priority and deadline both restored) and `:149` (a typed date survives a later pick; "Substituir"). MCP: typed 15/12/2026, then P2, showed "Sugerido: 29/12/2026 · Substituir" |
| 11.10-TABLE-FROM-PICKER | pass | `e2e/action-plan.spec.ts:337`. MCP: a P1 point shows 30/10/2026 and Cliente QA; a point without a deadline shows "—" in every cell; the Sumário row 8 reads "1 ponto sem prazo" |
| 11.10-PDF | pass (manual only, E11-Q3) | Downloaded PDF page 7: headers "Nº · Ponto de atenção · Local/TAG · Prioridade · Prazo · Ação recomendada · Responsável · Imagens", row 1 "P1 · Curto prazo · 30/10/2026 · Trocar isolador · Cliente QA", row 2 all "—" |
| 11.6-TEXTRACT-TOKENS | n/a | Story 11.6 is blocked (Bedrock quotas) |
| 11.7-ROUTING | pass | `apps/api/src/jobs/reading/providers/index.ts:79-83` (display goes to ocr-svc, every text kind to Textract); `providers/fake.test.ts`; `fake` is the default in `config.ts` |
| DEPLOY-SMOKE-{tag} | fail (not executed) | E11-Q2 |
| 11.8-ROLE | open (code only) | E11-Q2; `infra/production/budget.tf:52-75`, `iam.tf:58-67` |

## Human-style pass per story

- **11.1**
  - After "Gerar relatório", the dialog shows "DOCX — abrir no Word" and "PDF — enviar ao cliente", and each revision row gets "DOCX · PDF". Screenshot: `epic-11-qa/01-export-pdf-rows-1280.png`.
  - The PDF downloads as `relatorio-rev-1.pdf`, `application/pdf`, `attachment`.
  - An unknown id and a malformed id both answer 404. A request without a session answers 401.
  - There is no share button on desktop (as designed).
- **11.2**
  - The Overflow order is "Adicionar abaixo, Descer, Mover para…, Duplicar, …".
  - The Move dialog lists every live location except the block's own, asks "Sugerir TAG para Oxigênio?" with "Renomear para SEC-OXIGENIO-2", and the toast offers "Desfazer".
  - At 390 px in dark mode no element scrolls sideways inside the dialog, and "Mover" is 48 px tall. Screenshot: `epic-11-qa/03-move-dialog-390-dark.png`.
- **11.3.** "Salvar como template" sits in "Mais opções do relatório". The name is prefilled with the obra ("Obra QA"). A blank name disables "Salvar" with the reason "Salvar: falta o nome". The toast reads "Template ⟨nome⟩ salvo" with "Desfazer".
- **11.4.** At 768 px the toolbar holds Negrito, Itálico, Lista, Numeração and Variável, each 48 px tall, and the page does not scroll sideways.
- **11.5.** At 390 px the Account switch shows "Ativado" and "Desativado" with the matching helper text. Screenshot: `epic-11-qa/02-account-location-off-390.png`.
- **11.9 and 11.10.** The picker's rows read "P0, Imediata, hoje" to "P4, Próxima manutenção, próxima intervenção". A typed Prazo is kept and "Substituir" is offered. Screenshot: `epic-11-qa/05-priority-typed-prazo-substituir-1280.png`.
- **11.8, `AI_FEATURES=off`**
  - The api was recreated with `AI_FEATURES: 'off'`, and the web cached `releng.ai-features = off`.
  - At 768 px:
    - no plate camera group in the nameplate section;
    - no "Fotografar equipamento" row in the Add block palette (E11-Q6);
    - no panel entry in the Sumário.
  - "Ler visor" stays.
  - Nº SÉRIE typed by hand ("QA-OFF-123") commits and survives a reload. Screenshot: `epic-11-qa/04-ai-off-nameplate-manual-768.png`.

## Went well

- Every cross-story pair got a named, greppable assertion (E10-A3 worked). 13 of the 17 rows point at a spec line.
- Two deferred seams (11.4-TEMPLATE-FORMAT and 11.10-PDF) were written into the ledger with an owner, so none was forgotten, and this QA could close them in one session.
- The AI flag (#77) is enforced at three levels:
  - the web hides the entry points;
  - the photo create stops asking for LLM readings (`apps/web/src/db/file-commit.ts:121-123`);
  - the api refuses them (409 `ai_features_off`, and `sendReading` marks the photo `failed`) without ever losing a photo.
- The deploy script waits for the migration task itself instead of `ecs wait`, avoiding a double migration on a rerun (`infra/bin/deploy:153-161`).

## Went badly

- Story 11.8 merged and the epic moved on without a single live deploy, so every DEPLOY-SMOKE row of the plan is empty (E11-Q2).
- The Story 11.1 spec reused the DOCX URL share for the one row meant to reach the client (E11-Q1). Copying a precedent without re-reading the row's purpose.
- The Playwright MCP resolves relative screenshot paths against the main checkout, not the agent worktree. The first screenshot also landed, untracked, at `/home/matheus/Documentos/fasor/_bmad-output/implementation-artifacts/reviews/epic-11-qa/01-export-pdf-rows-1280.png`, which the coordinator should delete (the agent's guard blocks deletes under `Documentos`). Later QA prompts should require absolute worktree paths.
- The dev stack's navigations sometimes failed with `net::ERR_NETWORK_CHANGED` (a blank page until reload), probably from other compose projects creating Docker networks on the host. It was environmental, not an app defect, but it costs QA retries.
