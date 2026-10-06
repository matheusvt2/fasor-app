# Epic 11 Context: Completions after the slice and the dated post-MVP items

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Finish the product scope the slice deferred and move the product from a local-only MVP to one lean AWS production environment. The office gets the PDF beside the DOCX, can move a misplaced block, save a relatório as a template and format section boilerplate. The engineer controls the photo location stamp. For NR-10 10.7.11 (before 2027-06-01), a point's priority suggests its deadline and section 8 prints an action-plan table. The same images run on AWS under USD 100 per month, Textract is the cloud OCR, and Bedrock models structure readings. Story 11.11, added on 2026-10-05 from field feedback in production, closes the gap where photos added from a sheet showed nowhere on that sheet. As of 2026-10-06 every story is merged except 11.11: its PR #92 changed only planning files (MVP review F-01), so it is still to build, and this context mainly serves it.

## Stories

- Story 11.1: Download the PDF beside the DOCX (done)
- Story 11.2: Move a block to another location (done)
- Story 11.3: Save a relatório as a template (done)
- Story 11.4: Edit section boilerplate in a rich text editor (done)
- Story 11.5: Turn the photo location stamp on or off (done)
- Story 11.6: Structure readings with a Bedrock model (done; the title still says "Claude through a paid API key")
- Story 11.7: Use Amazon Textract as the cloud OCR (done)
- Story 11.8: Deploy the same images to AWS (done; live evidence still open)
- Story 11.9: Let the priority suggest the deadline on a point of attention (done)
- Story 11.10: Print the action-plan table in section 8 (done)
- Story 11.11: See a sheet's photos on the sheet, and pick files in one tap (to build; web only)

## Requirements & Constraints

- **Sheet photo strip.** An Equipment sheet whose block has photos (camera burst, an import assigned to that block, the nameplate photo) shows a "Fotos da ficha" strip of inline Photo tiles in capture order. Each tile carries its provisional section 7 number badge, upload pill and caption, and a tap opens the Photo viewer on that photo. A sheet with no photo shows no strip.
- **One-tap picker.** With the camera available, "Adicionar fotos" (on a sheet and in the gallery) opens the system file picker directly, several images at once, with no intermediate sheet. The "De qual equipamento?" step then runs as today, preselecting the sheet's block when started from a sheet.
- **Denied camera.** This is the one path that still opens the Photo capture sheet. "Escolher arquivos" is a 56px secondary Button, with "Tirar foto" under it and the denied reason beneath. Both are keyboard and screen-reader reachable. The 2026-10-06 review saw this path already drawn as a Button; keep it and test it.
- **Tests.** Playwright, as a human would, at 390, 768 and 1280 px: add a photo from a sheet with "Adicionar fotos", answer "De qual equipamento?", and see the tile in that sheet's strip and in section 7. A second test checks the denied-camera Button. Nothing ships untested.
- **Copy and product rules.** pt-BR copy is verbatim from the mocks or marked as authored. Static surface copy goes in `apps/web/src/copy/pt-br.ts` and derived text in the kernel. No emoji. The product name is `PRODUTO`.
- **Merge gate.** `pnpm verify` runs inside the `tools` container, plus the specs the story touched, with the output pasted in the PR.

## Technical Decisions

- **The kernel owns the list.** The strip's photo list and its order come from `packages/domain`, never from `apps/web` (AD-1). A photo is a `file` row of `kind: photo` with optional `block_id` and `item_key`. Sort key is `(captured_at, device_id, local_seq)`. `numberPhotos` assigns section 7 numbers, which stay provisional until export (AD-17). The same photo object appears in the sheet and the gallery, so one edit updates both.
- **Writes are ops.** The web renders from IndexedDB and writes only ops: `file/{id}` create, and `file/{id}/{caption|block_id|item_key|removed_at}`. The uploader and thumbnail variants are unchanged (AD-7).
- **Changing the design doc.** `DESIGN.md` "Photo capture sheet" says "Adicionar fotos" opens the sheet with an "Escolher arquivos" option. The builder strikes that sentence through with the date and adds the new behavior beside it, never rewriting silently. No mock shows the strip. Draw it from the Photo tile spec (`thumb-inline` 64px, `rounded.md`, `border-strong`, number badge, upload pill under the tile and never over the image). A mock may be added under `mockups/` first. Related screens are `prototype/screens/60-ficha.html` and `70-fotos.html`.
- **Responsive and overlays.** Any `.frame-*` mock rule rendered for the first time gets its media-query translation in `app.css`. The Photo viewer is a modal dialog: Esc or back closes it, and focus returns to the tile.
- **Bedrock readings (Story 11.6, as built).** The Converse API sits behind the structuring and prose providers.
  - Default model: Claude Haiku 4.5 through the `global.` profile.
  - Panel fronts: Qwen3 VL 235B (`BEDROCK_PANEL_MODEL_ID`).
  - Plate escalation: Nova Pro. It runs when more than half of the plate's values are `verify`, or when there is none, and the OCR read words.
  - `MIN_CONTRACT_VERSION` is 14. Model ids come from config.
  - `LLM_PROVIDER` and `OCR_PROVIDER` default to `fake`. `pnpm verify` never reaches AWS.
- **Production.** One `t3a.medium` EC2 instance in ECS (api with its worker, `ocr`, Caddy) in `us-east-1`, with a Let's Encrypt IP certificate, RDS `db.t4g.micro`, versioned S3 and SSM Parameter Store.
  - The api takes its credentials from the ECS task role.
  - `infra/bin/deploy` deploys after each merge. All infrastructure is Terraform in `infra/`.
  - The AI features flag is turned on only in `infra/`. The `fake` provider must never run in production.

## UX & Interaction Patterns

- **Photo tile.** A tap opens the Photo viewer. The viewer shows the full Photo stamp, "Editar legenda", "Remover", and "Anterior / Próxima". The upload pill reads "Aguardando envio" or "Erro — Tentar novamente", and the error pill is itself the retry button.
- **Camera capture button.** It opens the camera directly in burst mode. "Adicionar fotos" sits beside it as a visible secondary Button and is never a modal choice in front of the camera. On a computer, files dropped on a sheet or the gallery are added ("Solte para adicionar").
- **"De qual equipamento?"** It shows the Relatório tree plus "Geral". The selected row reveals a batch caption field, prefilled with the context caption, with Dictation, then "Adicionar N fotos". Late photos slot into section 7 by capture time.

## Cross-Story Dependencies

- **11.11 and earlier epics.** It builds on the Epic 6 gallery, Photo tile, viewer and import flow, and on the Epic 8 nameplate photo, which must appear in the strip. The sprint status shows 11.11 as backlog. The review asks that it not read as resolved until it is built.
- **11.6 × 11.7 × 11.8.** After 11.6, the deploy and the `infra/` AI flag switch remain. The 11.8 live evidence is still open: DEPLOY-SMOKE, 11.8-ROLE through the task role, and the budget deny on Bedrock and Textract.
  - Open IAM item: narrow it to the models the real-photo evaluation picks.
- **Open product questions with Matheus.** These are not for builders: the per-relatório rich editor, Graviton versus x86-64, routing `panel` OCR to Textract or `ocr-svc`, and the narrowings of 11.2, 11.3, 11.9 and 11.10.
