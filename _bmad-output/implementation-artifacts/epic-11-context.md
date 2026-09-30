# Epic 11 Context: Completions after the slice and the dated post-MVP items

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Finish what the slice deferred and put the product where the design partner can reach it. The office gets the closed PDF beside the DOCX, can move a misplaced block without retyping, can save a finished relatório as the next visit's template, and can format section boilerplate. The engineer controls the coordinates printed under photos. For NR-10 10.7.11 (before 2027-06-01), a point's priority suggests its deadline, and section 8 prints the action-plan table. The same images run in one lean AWS production environment, under USD 100 per month, reached over HTTPS from the tablets. Textract becomes the cloud OCR, and last, once the Bedrock quotas open, a real model structures readings. That model is picked by measured accuracy and cost, not by brand.

## Stories

- Story 11.1: Download the PDF beside the DOCX (opus, medium)
- Story 11.2: Move a block to another location (opus, medium)
- Story 11.3: Save a relatório as a template (opus, medium)
- Story 11.4: Edit section boilerplate in a rich text editor (opus, medium)
- Story 11.5: Turn the photo location stamp on or off (opus, medium)
- Story 11.6: Structure readings with a Bedrock model (story title still says "Claude through a paid API key") (opus, medium)
- Story 11.7: Use Amazon Textract as the cloud OCR (opus, medium)
- Story 11.8: Deploy the same images to AWS (opus, high)
- Story 11.9: Let the priority suggest the deadline on a point of attention (opus, medium)
- Story 11.10: Print the action-plan table in section 8 (opus, medium)

Story text: `_bmad-output/planning-artifacts/epics.md:2335-2491`. The dated notes under 11.6 and 11.8 override their ACs. The epic's order and gates are at `epics.md:494`. The generic DoR and DoD apply (`epics.md:400-425`). DoR 7 exempts Epic 11 from the no-cloud rule. Sprint keys are `sprint-status.yaml:132-143`, all `backlog`.

## Requirements & Constraints

- **PDF (FR-62, FR-74).** `GET /api/revisions/{id}/pdf` serves the stored `pdf_file_id`. Two places use it: the Export dialog's "PDF — enviar ao cliente" row with its share button, and the PDF button on each past revision. Mobile offers a share sheet. The draft-equals-issued test covers the PDF too. The route needs a cross-tenant test.
- **Move a block (FR-20).**
  - "Mover para…" appears on the Block card, on a tree row and in the Sumário expansion. It emits `block/{id}/location_id`.
  - Photos, checks, measurements and observations move with the block.
  - "Sugerir TAG para Coluna 9?" offers a new TAG. The move is announced and undoable.
- **Template from a relatório (FR-14).** "Salvar como template" sits in the Sumário header Overflow. It creates `template/{id}` carrying:
  - the locations;
  - each cabine's `agrupar_por_tipo`;
  - each block's `BlockConfig` with its sub-block and subtype overrides;
  - the quantity per column.

  TAGs are regenerated at instantiation. Filled data, photos and points are never carried.
- **Rich text (FR-12, UX-DR69).**
  - The editor exists only in the Template composer. Toolbar: Negrito · Itálico · Lista · Numeração · Variável, as 48 px buttons with words, plus Ctrl+B and Ctrl+I.
  - Formatting is limited to what the DOCX and PDF renderers share. Paste is stripped to plain text plus lists.
  - Variable chips behave as in Story 3.6.
  - The per-relatório Section text surface stays plain text.
- **Location stamp (FR-8, UX-DR65).**
  - Account's Toggle "Localização nas fotos" (default on) writes `user/{id}/photo_location_enabled`. When off, photos carry date and time only.
  - When the OS denies location, the sub-line reads "Permissão negada no aparelho" with the OS path, and the switch stays on.
  - Capture is never blocked.
- **LLM (FR-33, FR-36, FR-39, AR-13, NFR-12), as overridden.**
  - Only `LLM_PROVIDER=bedrock` exists, through the Converse API. The model is configuration, and no Console key is ever created.
  - Inputs: the image, the OCR tokens and the field definitions. Each value must cite its `ocr_token_ids`, and coordinates are never taken from the model.
  - Each run logs tokens and USD. Prompts carry a `prompt_version`.
  - An evaluation over the Porto Seguro fixture photos picks the default model. A low-confidence reading retries on a larger model. The role allows only the chosen models.
- **Textract (FR-33, AR-13, NFR-11).**
  - `OCR_PROVIDER=textract` sits behind `OcrProvider` and calls `DetectDocumentText`. WORD blocks become tokens with boxes normalized to the original image space, with `preprocessing_applied: false`.
  - A per-`reading_kind` routing sends plates to Textract and displays to `ocr-svc`.
  - The AI opt-out policy is already applied by the bootstrap.
- **Deploy (AR-26, NFR-18), as overridden.**
  - Terraform covers the whole infrastructure in `infra/`. A shell deploy script deploys every later story after its merge.
  - One environment, `production`, with no staging and no CI.
  - A domain later changes `infra/` only.
- **Priority and deadline (FR-50, UX-DR55).**
  - The Priority picker has five rows, "P0 · Imediata" to "P4 · Próxima manutenção". The kernel's `deadlineFromPriority(priority, createdAt, next intervention)` gives:

    | Priority | Suggested deadline |
    |---|---|
    | P0 | that day |
    | P1 | +30 days |
    | P2 | +90 days |
    | P3 | +180 days |
    | P4 | the relatório's next recommended intervention, never a hard-coded year |

  - The suggestion never overwrites a typed date. A different suggestion offers "Substituir".
  - The pill shows text first and tone second. Responsável is free text.
- **Action-plan table (FR-52, AR-25).**
  - It prints beneath section 8's bullets, with these columns: Nº · Ponto de atenção · Local/TAG · Prioridade · Prazo · Ação recomendada · Responsável · Imagens.
  - Manual rows come first, then derived rows, numbered continuously. A missing value prints "—". Images print as the same resolved numbers.
  - `preIssue` counts "pontos sem prazo" as information.
- **Policy.** This epic is the only one that may touch a cloud account.
  - Access goes through the `aws login` session of `fasor-admin`, or the `fasor-app` role. Never access keys, never the root profile.
  - Terraform and the AWS CLI run in containers.
  - `LLM_PROVIDER` and `OCR_PROVIDER` still default to `fake`. `pnpm verify` never reaches AWS.
  - The repo is public: no account secrets, state files or plans in git (`*.tfstate`, `tfplan` and `secrets/` are already ignored).
  - No emoji. No Fasor branding in user-visible strings.

## Technical Decisions

- **Ownership (AD-1 to AD-3, AD-13).** These are computed in `packages/domain`: `deadlineFromPriority`, the action-plan rows and their numbering, the "pontos sem prazo" pre-issue row, the template-from-relatório projection, and the move's TAG re-suggestion (`suggestTag`, `relatorio/tag.ts:79`). The web writes ops only.
- **Undo.** Batches invert through `invertBatch` (`ops/outbox.ts:54`), and an inverse op sets `prev_op_id = op.op_id`.
- **Merge.** Since Epic 10, a `block/field` put merges last-writer-wins by `seq`, with an info row; `mergePolicy` is in `packages/domain/src/merge/policy.ts`. A move on one device and a sheet edit on another must stay a rule-merge, not a conflict.
- **Contract.** `CONTRACT_VERSION = 13` and `MIN_CONTRACT_VERSION = 13` (`contract/version.ts:83,129`). A batch that changes an op family, the reducer or a row shape bumps to main + 1 with a dated note. MIN follows when an older `applyOp` would materialize differently.
- **Existing slots.**
  - `apps/api/src/config.ts:25-26` already has `LLM_PROVIDER: fake|anthropic|bedrock` and `OCR_PROVIDER: fake|textract|ocr-svc`.
  - `jobs/reading/providers/index.ts:48-84` picks one OCR provider per process. `textract`, `anthropic` and `bedrock` return the permanent-failure stubs of `unimplemented.ts`.
  - The prose step (captions, NC drafts, Stories 9.3/9.5) is chosen by the same `LLM_PROVIDER`.
  - The factory already receives `reading_kind`, so 11.7's routing lives there.
  - 11.6 drops the `anthropic` enum value.
- **Deploy topology (source-deltas 2026-09-29/30 and coordinator decision 2).** Region `us-east-1`. One Graviton EC2 instance in an ECS cluster runs the api (with its in-process worker, `WORKER=1`), `ocr` and Caddy. The Stack table below also lists RDS, S3, SSM Parameter Store, CloudWatch and Budgets.
  - The spine's Fargate/ALB/Secrets Manager/`sa-east-1`/staging lines (`ARCHITECTURE-SPINE.md:271,307,374`) are overridden and not yet struck.
- **Stack already in place.**
  - `infra/bin/tf <stack> <args>` runs pinned Terraform 1.16.4 and aws-cli 2.37.6 in containers.
  - `infra/bootstrap/` is applied: the Organization with the AI opt-out policy, the state bucket `fasor-tfstate-673409896745` with S3-native locking, `fasor-admin`, the `fasor-app` role (Bedrock `InvokeModel` on the evaluation candidates, Textract `DetectDocumentText`, one-hour sessions), and the `fasor-monthly` budget (alerts at 50/80/100 % actual and 100 % forecast). There is **no budget action yet**.
  - The application stack gets its own state key.
  - Locally, the api uses short-lived `fasor-app` credentials; on AWS, the instance role carries the same policy (`infra/README.md`).

## UX & Interaction Patterns

- **Mocks per story** (MOCK-GUIDE's out-of-slice table, `mockups/MOCK-GUIDE.md:103-116`):

  | Story | Mock and location |
  |---|---|
  | 11.1 | `prototype/screens/73-exportar.html:143` (the `.result-row` with "PDF — enviar ao cliente" plus the `icon-btn` "Compartilhar PDF") and `:154-155` (the `.rev-files` PDF buttons, `data-slice="out"`) |
  | 11.2 | `60-ficha.html:834` (the Overflow `menu-item` "Mover para…") |
  | 11.3 | `40-relatorio-overview.html:285` (the header Overflow "Salvar como template") |
  | 11.4 | `42-template-composer.html:69-77,281` (`.rich-dialog`, `.rich-text`, `.rt-tool`, `.var-row .var-chip`) and `key-template-composer.html` |
  | 11.5 | `90-account.html:15-20,67-70` (the `#acc-loc-row` Toggle with `.helper-on` / `.helper-off`) |
  | 11.9 | `72-pontos.html` (`.priority-pill[data-p]`, and Prazo as a Suggestion field at `:48`) and `key-points-of-attention.html` |

  - When a story ships, remove its `data-slice="out"` marks from the prototype (MOCK-GUIDE: keep the drawing, change the mark).
  - The Export dialog and the Sumário are built from `73-exportar` and `40-relatorio-overview`, not `key-export` or `key-relatorio-overview` (MOCK-GUIDE v0.8).
- **Overflow menu.** One level, no submenus. "Mover para…" sits beside "Subir · Descer" wherever a location can change (`EXPERIENCE.md:294`). A move is announced through the announcer and offers undo, like the Epic 5 undo toast.
- **Priority picker.** A `radiogroup` of five rows with accessible names like "P1, Curto prazo, 30 dias". Arrow keys move, and one tap selects and writes the Prazo suggestion. There is no default (`EXPERIENCE.md:328-329`).
- **Photo stamp.** It is recorded at capture and never edited (`EXPERIENCE.md:324`). Never write "Erro de GPS", and never let the switch silently stay on (`EXPERIENCE.md:246`).
- **Real-browser pass.** Check 390, 768 and 1280 px plus each new dialog (move, template name, rich text), in light and dark. At 390 px, assert the scroll containers themselves.

## Code facts

- **11.1.**
  - `GET /api/revisions/:id/docx` (`apps/api/src/http/generate.ts:360-384`) is the pattern to copy: an id check, a company-scoped entity lookup, and an `objectKey(session.companyId, 'docx', …)` that never reads a key from the row.
  - `revisionRowSchema.pdf_file_id` is at `schemas/entities.ts:593`, written by `jobs/generate/job.ts:396`. `PDF_MIME` is at `contract/generate.ts:79`.
  - The copy comment at `apps/web/src/copy/pt-br.ts:436-440` still says the PDF row is out of slice. The export keys (`openDocx`, `revisionDocx`) sit beside it.
- **11.2.**
  - `block.location_id` is nullable (`entities.ts:417-423`): sections 1-6 and 9 have no location.
  - `suggestTag` suffixes `-2`, `-3`… from the base TAG.
  - The TAG lives on `equipment/{id}/tag`, not on the block.
- **11.3.** `instantiateTemplate` (`relatorio/instantiate.ts:147`) is the inverse the new projection must round-trip. The template's `blocks: z.array(templateBlockSchema)` is at `entities.ts:210`, and `agrupar_por_tipo` at `:352`.
- **11.4.**
  - `section_text` is a bare `string | null`.
  - `flattenSectionText`, `sectionTextTokens` and `resolveSectionText` are in `templates/section-text.ts:52,97,139`.
  - The renderer re-derives paragraphs and items from line shape (`print/layout.ts` `ownParagraphs`).
  - Stored formatting is a row-shape change, so it needs a contract bump.
- **11.5.**
  - `photo_location_enabled` already exists on the user row (`entities.ts:233`). It is read in `apps/web/src/db/photo-store.ts:181-185` (default true) and used by `files/geolocation.ts`.
  - The OS denial is already the device-local pref `geolocation_denied` (`photo-store.ts` `writeGeolocationDenied`; ledger `deferred-work.md:737-740`, owner Epic 11). The switch reads it.
- **11.9 / 11.10.**
  - `point.priority`, `deadline` and `owner` already exist, with no UI (`entities.ts:506,523-525`). This is the source-deltas row that dated them post-MVP.
  - The relatório field is `next_intervention_date` (`entities.ts:300`); the story says `next_intervention`.
  - Section 8 prints from `packages/domain/src/print/section-8.ts` and `apps/api/src/jobs/generate/sections/section-8.ts`. Goldens are regenerated with `scripts/regen-goldens.ts`.
- **11.6 / 11.7.**
  - The providers are in `apps/api/src/jobs/reading/providers/`: `fake.ts`, `ocr-svc.ts`, `unimplemented.ts` and `errors.ts`, with the `OcrProvider`, `StructuringProvider` and `ProseProvider` types in `@app/domain`.
  - Integration tests: `job.integration.test.ts`, `job-display.integration.test.ts` and `job-prose.integration.test.ts`.
  - Ledger `deferred-work.md:1131` (import-batch photos can reach the prose provider before the people/equipment re-check) **must close before a cloud LLM is wired**.
- **11.8.** The current images are dev images and do not fit a cloud host as they are:
  - `apps/api/Dockerfile` installs the **x86-64** LibreOffice 26.2.6 `.deb` (`:11`) and runs on a bind-mounted workspace. `api-prod` in `docker-compose.yml:168` reuses that bind mount and serves the built web bundle plus `/api/*`.
  - A Graviton host needs an **arm64**, self-contained (COPY) image. `services/ocr/Dockerfile` pins paddlepaddle 3.3.1, torch 2.5.1 and onnxruntime 1.20.1; the arm64 wheels must be verified, not assumed.
  - `config.ts:6-9` requires `S3_ENDPOINT`, `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`, and `storage/s3.ts:17-18` sets `forcePathStyle` with static credentials. The instance role needs these to become optional. This is an app change that 11.8 owns once; after it, switching services changes `infra/` only.
  - `scripts/build-tagged-image.sh` and its ledger entry (`deferred-work.md:195-199`, "deferred to Epic 11") are superseded by the deploy script.
  - `docker/caddy/Caddyfile` is the local HTTPS precedent.
  - Memory: api + LibreOffice + PaddleOCR + Caddy must fit a t4g.medium (4 GB); measure before choosing t4g.large.

## Cross-Story Dependencies

Per E10-A3, each shared item has its own named assertion, owned by the batch named in the last column. Where two batches share a pair, the later of them owns it.

| Pair | Shared item | Named assertion (owner) |
|---|---|---|
| 11.2 × Epic 5 undo | The move batch, which also carries the optional TAG re-suggestion put | **11.2-UNDO**: "Desfazer" after a move restores `location_id`, the old TAG (if re-suggested) and the block's photos/sheet under the old location, in IndexedDB and on the server (B) |
| 11.2 × Epic 10 merge | A `block/{id}/location_id` put on one device against a sheet edit on the other | **11.2-MERGE**: two contexts, move on A, edit a cell on B, sync both; the block is in the new location with B's cell, one info row, no contradiction (B) |
| 11.2 × 11.3 | The location skeleton read by the template projection | **11.3-AFTER-MOVE**: save a template after a move; the template's quantity per column reflects the moved block (B) |
| 11.3 × Epic 5 undo | The `template/{id}` create batch | **11.3-UNDO**: undo of "Salvar como template" removes the template from the list (B) |
| 11.3 × 11.4 | `section_text` format carried into a template | **11.4-TEMPLATE-FORMAT**: a template saved from a relatório keeps formatted section text and prints it (E) |
| 11.4 × Epic 5 undo | Formatting ops in the composer | **11.4-UNDO**: undo of a Negrito/Lista edit restores the prior stored text (E) |
| 11.4 × renderer / 11.1 | Formatting printed in DOCX and PDF | **11.4-PRINT-BOTH**: bold, italic and a list print in the DOCX and the PDF of one revision (E, after A merges) |
| 11.5 × Epic 6 capture | `photo_location_enabled` read at capture; `geolocation_denied` pref | **11.5-OFF-STAMP**: with the switch off a new photo's stamp and section 7 carry date/time only; **11.5-DENIED**: denied OS shows "Permissão negada no aparelho", switch stays on, capture works (E) |
| 11.5 × Epic 5 undo | `user/{id}/photo_location_enabled` put | **11.5-UNDO**: if the toggle offers undo, it restores the value; else the assertion states no undo by design (E) |
| 11.9 × Epic 5 undo | Priority put and the batched Prazo suggestion put | **11.9-UNDO**: undo of a priority pick restores both priority and deadline; a typed date survives a later pick (P) |
| 11.9 × 11.10 | `priority`, `deadline`, `owner` and the pre-issue "pontos sem prazo" | **11.10-TABLE-FROM-PICKER**: a point prioritized in the UI prints its row with Prioridade and the suggested Prazo; a point without a deadline shows "—" and counts in pre-issue (P) |
| 11.10 × 11.1 | The same revision's DOCX and PDF | **11.10-PDF**: the action-plan table is in the downloaded PDF (P, after A merges) |
| 11.7 × 11.6 | `OcrProvider` tokens feeding structuring citations | **11.6-TEXTRACT-TOKENS**: a live Converse run over Textract tokens cites valid `ocr_token_ids` (L) |
| 11.7 × Epic 8/9 routing | Per-`reading_kind` choice of plate vs display OCR | **11.7-ROUTING**: plate goes to `textract`, display to `ocr-svc`, and `fake` stays the default in `verify` (T) |
| 11.8 × every wave-2 story | The deploy script and the production stack | **DEPLOY-SMOKE-{tag}**: after each merge, the deploy runs, the migration task exits 0, and `GET /api/health` over the HTTPS address returns every component ok (each wave-2 batch) |
| 11.8 × 11.6 / 11.7 | The instance role's Bedrock/Textract policy and the budget action | **11.8-ROLE**: the instance role can call `DetectDocumentText` and the allowed models only; the 100 % budget action denies both (D; re-asserted by T and L live) |

Other epics:

- The outbox and `remote_ops` retention entries (`deferred-work.md:124,154,208`) and the savepoint overflow (`:1173`, "owner: Epic 11, sync performance and retention") have **no Epic 11 story**.
- R10-12 expected "Epic 11's sync retention story" to split `engine.ts` and `apply.ts`.

## Conflicts to resolve

1. **Mock citations in the epic preamble** (`epics.md:2337`). It names `key-export.html`, `key-relatorio-overview.html` ("Mover para…") and `key-points-of-attention.html`. However:
   - "Mover para…" is only in `60-ficha.html:834`.
   - `key-export` and `key-relatorio-overview` are superseded.

   *Conservative:* build from the prototype screens in the mock table above.
2. **The P4 deadline.** `EXPERIENCE.md:130` says "+365 dias (the next annual visit)". Story 11.9 (`epics.md:2477`) and the source-deltas row on section 8 ("no interval is ever encoded as annual") say the next recommended intervention. *Story and source-deltas win.* When the relatório has no next intervention, the P4 suggestion is empty.
3. **Story 11.8's AC** (`epics.md:2455`: Fargate, ALB, Secrets Manager, `sa-east-1`, staging, CI promotion). This is overridden by its own dated notes (`:2461,2463`) and by `source-deltas.md:58-62`. The coordinator's SSM Parameter Store, night schedule, budget action and ECR/S3 lifecycle choices have **no source-deltas row yet**. *Conservative:* batch D adds one dated row. It also strikes the stale spine lines (`ARCHITECTURE-SPINE.md:271,307,374`) and the epic's AR-26 line (`epics.md:492`) with dated replacements.
4. **Profile name.** The 11.8 note at `epics.md:2459` says "the account `fasor` (profile `--profile fasor`)". The coordinator and `infra/README.md` say `fasor-admin`, and never the root profile. *`fasor-admin` wins.* D strikes the sentence with a dated note.
5. **The `anthropic` provider.** Story 11.6's AC and title, the Epic 8 decision (`epics.md:476`) and the Epic 11 decision (`:493`) still say Console key and then Bedrock. `source-deltas.md:60-61` says Bedrock Converse only. *Source-deltas wins.* L removes the `anthropic` enum value and strikes the AC text.
6. **"The tablets' PWA"** (`epics.md:2463`) versus `source-deltas.md:25` (web only, no install). *Conservative:* the requirement is a secure context trusted by Android Chrome and iPadOS Safari with no manual certificate install. D records the HTTPS mechanism (for example Let's Encrypt for the Elastic IP through Caddy) in `infra/README.md` and `docs/tablet-https-setup.md`.
7. **Wave-2 deploys before D merges.** *Conservative:* a wave-2 batch that merges first deploys once D is on main. D itself runs the first deploy of everything merged before it.
8. **`next_intervention` vs `next_intervention_date`.** The story's name is shorthand. *Use the schema field.*

## Carry-over (batch C, first)

The agent-closable Epic 10 items are done: E10-A2 to E10-A5 (`sprint-status.yaml:764-786`). E10-A1 (gate decision), E10-A6 and E10-A7 stay with Matheus. The open ledger entries that name Epic 11 need routing:

| Entry | What it is | Routing |
|---|---|---|
| `:740` | Geolocation denial pref | Batch E (11.5 surface) |
| `:1131` | Import batch vs prose provider | **Batch C**, so it no longer blocks L; else L closes it before wiring Bedrock |
| `:195-199` | Tagged image | Batch D (superseded by the deploy script) |
| `:1065` | Env provenance glyph, row shape plus bump | C fixes it if small, else re-owns it to Matheus with a reason |
| `:1077` | Display retry UI | C fixes it if small, else re-owns it to Matheus with a reason |
| `:1173` | Savepoint overflow | C re-owns it, with a note for `bmad-correct-course`: Epic 11 has no retention story |
| `:124`, `:154`, `:208` | Retention | C re-owns them, with the same note |
| `:373` | Empresa singleton | Matheus |
| `:1095` | Abandoned panel photo | Matheus |
| `:1179` | Third merge-fold limit | Matheus |

Proof: no open entry says "owner: Epic 11" without a batch or a reason.

## Coordinator decisions (Matheus, 2026-09-29/30, before the batches)

1. **Order and gates.**
   - **Entry gate G0:** the Epic 10 retro is closed (done); AWS bootstrap PR #67 is merged green; the USD 100 budget is active (done). PR #67 is **still open** on `chore/aws-bootstrap` at context time.
   - **Wave 1, in parallel:**
     - **C**, the carry-over. It is likely tiny, since the agent-closable Epic 10 items are already done. It includes open `deferred-work.md` entries whose owner is an agent and that touch Epic 11 surfaces.
     - **D**, Story 11.8 (opus, high).
     - **A**, Story 11.1 (opus, medium).
   - **Wave 2**, all opus, medium, each deployed to AWS after its merge with the deploy script:
     - **T**, Story 11.7;
     - **B**, Stories 11.2 + 11.3;
     - **E**, Stories 11.4 + 11.5;
     - **P**, Stories 11.9 + 11.10.
   - **Last: L**, Story 11.6, behind its Definition of Ready gate: the AWS support case resolved, and a real Converse call through the `fasor-app` role succeeding. If the gate is still closed at the end, the epic closes with 11.6 blocked.
2. **AWS (Story 11.8).**
   - Account and access:
     - Account 673409896745, `us-east-1`.
     - Profiles: `fasor-admin` (admin, `aws login` with a passkey) and `fasor-app` (a role with `source_profile fasor-admin`). Never the root profile `fasor`, never access keys.
   - Already in place:
     - `infra/bootstrap` is applied: the organization with the AI opt-out policy, the state bucket `fasor-tfstate-673409896745` with S3-native locking, `fasor-admin`, the `fasor-app` role, and the `fasor-monthly` budget.
     - `infra/bin/tf` runs Terraform 1.16.4 and aws-cli 2.37.6 in containers.
   - Scope:
     - Total AWS spend stays below USD 100/month.
     - Production only, no staging.
   - Lean topology for at most 10 concurrent users:

     | Area | Decision |
     |---|---|
     | Compute | One Graviton EC2 instance (t4g.medium; t4g.large only if memory proves short and the budget still fits) in an ECS cluster, running the api (with its in-process worker), `ocr` and Caddy |
     | Network | No ALB, no NAT; a public subnet with security groups |
     | Database | RDS `db.t4g.micro` in a private subnet |
     | Files | S3 with versioning and a gateway endpoint; noncurrent versions expire in 30 days |
     | Secrets | SSM Parameter Store SecureString instead of Secrets Manager |
     | Logs | CloudWatch logs kept 14 days, without Container Insights |
     | Images | An ECR lifecycle keeping the last images |
     | Night schedule | The instance scales to zero and RDS stops from 00:00 to 05:00 America/Sao_Paulo, via EventBridge Scheduler |
     | Budget | A budget action at 100 % denies Bedrock and Textract to the app role |

   - Deliverables:
     - Terraform for the whole infrastructure in `infra/`.
     - A shell deploy script: build the images in containers, push to ECR, run migrations as a one-shot task, roll the services.
     - HTTPS on a free temporary AWS-provided address (for example, a Let's Encrypt certificate for the Elastic IP through Caddy). The builder verifies what the tablets' PWA accepts and records it.
   - On AWS, the instance role replaces the `fasor-app` role, with the same Bedrock/Textract policy.
3. **Bedrock state.**
   - Every Bedrock model quota is applied at 0 for this new account (support case open).
   - Marketplace agreements for Claude Sonnet 5.5, Haiku 4.5 and Opus 5.5 are active.
   - Textract works in `us-east-1` and has no `sa-east-1` endpoint.
   - Story 11.6 uses the Bedrock Converse API. An evaluation over the Porto Seguro fixture photos compares Nova 2 Lite, Qwen3 VL 235B, Mistral Large 3, Claude Haiku 4.5 and Claude Sonnet 5.5. It picks the cheapest model within 1-2 accuracy points of Sonnet 5.5 (not limited to Anthropic). No Anthropic Console key.
4. **Process** (playbook `_bmad-output/implementation-artifacts/epic-batch-orchestrator.md`).

   | Batch tag | Port base |
   |---|---|
   | e11c | 52 |
   | e11d | 53 |
   | e11a | 54 |
   | e11t | 55 |
   | e11b | 56 |
   | e11e | 57 |
   | e11p | 58 |
   | e11l | 59 |

   - Port base 51 is the coordinator's.
   - One gate at a time, through `flock /tmp/fasor-verify.lock`.
   - E10-A2: push before every gate. E10-A4: a targeted matrix for fold, commit-path or ficha live-query changes.
5. **Cross-Story Dependencies table.** Per E10-A3, every item a pair shares gets its own named assertion. The undo of every new op kind against the Epic 5 inverse is a listed pair: the move-block op of 11.2, the template create of 11.3, the formatting of 11.4, the location toggle of 11.5, and the priority/deadline of 11.9. The table above follows this.
