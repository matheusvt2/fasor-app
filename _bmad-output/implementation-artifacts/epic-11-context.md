# Epic 11 Context: Completions after the slice and the dated post-MVP items

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Finish the product scope the slice deferred and move the product from a local-only MVP to one lean AWS production environment. The office gets the PDF beside the DOCX, can move a misplaced block, can save a relatório as a template and can format section boilerplate. The engineer controls the photo location stamp. For NR-10 10.7.11 (before 2027-06-01), a point's priority suggests its deadline and section 8 prints an action-plan table. The same images now run on AWS under USD 100 per month, Textract is available as the cloud OCR, and a real Bedrock model structures readings. As of 2026-10-05, every story is done except Story 11.6. Its Definition of Ready gate opened that day, so this context mainly serves 11.6.

## Stories

- Story 11.1: Download the PDF beside the DOCX (done)
- Story 11.2: Move a block to another location (done)
- Story 11.3: Save a relatório as a template (done)
- Story 11.4: Edit section boilerplate in a rich text editor (done)
- Story 11.5: Turn the photo location stamp on or off (done)
- Story 11.6: Structure readings with a Bedrock model (backlog; the title still says "Claude through a paid API key")
- Story 11.7: Use Amazon Textract as the cloud OCR (done)
- Story 11.8: Deploy the same images to AWS (done)
- Story 11.9: Let the priority suggest the deadline on a point of attention (done)
- Story 11.10: Print the action-plan table in section 8 (done)

## Requirements & Constraints

- **Provider: Bedrock only, through the Converse API.**
  - There is no `anthropic` provider and no Anthropic Console key. The backend never uses a personal Claude subscription credential.
  - The model is configuration and is not limited to Anthropic.
- **Structuring step inputs and outputs.**
  - It receives the image, the OCR tokens and the field definitions.
  - It returns values in each field kind's shape, and each value cites `ocr_token_ids`.
  - Coordinates from the model are never accepted. Every box comes from the OCR layer.
  - Digit coverage and the registry cross-check still decide whether a value is a Suggestion or "Verificar".
- **Logging.** Each run records the model, the `prompt_version`, input and output tokens, USD cost and duration on its `reading_run` row.
- **Model choice by evaluation.**
  - An evaluation runs over the Porto Seguro fixture photos: nameplates and displays with known values.
  - It measures field accuracy, how often citations point to valid OCR tokens, and cost.
  - Candidates: Amazon Nova 2 Lite, Qwen3 VL 235B, Mistral Large 3 and Claude Haiku 4.5.
  - **The reference model is Claude Haiku 4.5** (`global.anthropic.claude-haiku-4-5-20251001-v1:0`). The default is the cheapest candidate within 1-2 accuracy points of Haiku 4.5.
  - A low-confidence reading is retried on a larger model.
  - Sonnet 5.5 is denied to the account (0 TPM). It rejoins as the reference and escalation model only when AWS enables it. Sonnet 4.6 is not used.
  - The `fasor-app` role and the ECS task role allow only the chosen models.
- **Scope of the switch.** The same `LLM_PROVIDER` selects the prose step: vision captions and NC drafts.
- **Cost ceiling.** All AWS spend stays below USD 100 per month at list price, including Bedrock and Textract. The deployed stack is estimated at about USD 79 per month before AI use.
- **Defaults and tests.**
  - `LLM_PROVIDER` and `OCR_PROVIDER` default to `fake`.
  - `pnpm verify` never reaches AWS. A live call is evidence recorded in the PR, not a gate test.
- **Credentials.**
  - Access goes only through the `fasor-admin` login and the `fasor-app` role (account 673409896745, `us-east-1`). Never use access keys or the root profile.
  - The AWS CLI and Terraform run in containers.
  - The repo is public: no state, plans or secrets in git.

## Technical Decisions

- **Overridden spine text.** The architecture spine still describes the reading pipeline with `@anthropic-ai/bedrock-sdk`, `anthropic.claude-opus-5` and `anthropic.claude-sonnet-5` as the cost fallback, plus a Console-key fallback. The dated decisions above override all of it.
- **Unchanged pipeline rules.** These still hold:
  - one pg-boss `reading` job per `(photo_id, reading_kind)`;
  - the OCR provider and the LLM see the same bytes;
  - the job deletes its previous pending suggestions before emitting new ones;
  - three attempts with backoff, then `failed`;
  - `reread` creates a new `reading_run`.
- **OCR routing.** Textract handles plates (and currently `panel`), and `ocr-svc` handles displays. `display` is OCR only and never calls the LLM.
- **Contract version.** Before a cloud LLM is wired, Story 11.6 must raise `MIN_CONTRACT_VERSION` to 14 or later. A version-13 client still queues the caption reading when photos are picked. Version 14 queues it only after the user answers or closes the import batch.
- **Production AI flag.** Production runs with `AI_FEATURES=off`.
  - While off, the web hides the plate, equipment, NC-draft and caption assists, and the api refuses AI reading kinds with 409 `ai_features_off`.
  - Turning it on is an `infra/` change: `llm_provider = "bedrock"` and `ai_features = "on"`. Terraform refuses `on` with `llm_provider = "fake"`.
  - No boot-time guard yet stops `fake` from running under `NODE_ENV=production`. The fake provider invents readings, so it must never run in production.
- **AWS identity.** On AWS, the api gets credentials from the ECS task role `fasor-production-app` through the SDK default chain. Locally, it uses short-lived `fasor-app` credentials.
- **Topology.**
  - One x86-64 `t3a.medium` EC2 instance in ECS runs the api with its in-process worker, `ocr` and Caddy.
  - Caddy serves HTTPS with a Let's Encrypt IP certificate.
  - RDS `db.t4g.micro`, versioned S3 and SSM Parameter Store.
  - The instance and RDS are stopped at night.
  - `infra/bin/deploy` deploys each merge.

## Cross-Story Dependencies

- **11.6 × 11.7, assertion 11.6-TEXTRACT-TOKENS.** A live Converse run over Textract tokens must cite valid `ocr_token_ids`.
- **11.6 × 11.8, assertion 11.8-ROLE.** The task role may call `DetectDocumentText` and the allowed models only. The budget action at 100 % denies both Bedrock and Textract.
  - The live evidence for this is still open (retro item E11-A2), together with DEPLOY-SMOKE as the post-merge check.
  - After 11.6 merges, it is deployed with `infra/bin/deploy`, then the AI flag is switched in `infra/`.
- **11.6 × Epics 8/9.** The plate structuring, the vision caption and the NC draft all change provider with this story. Their integration tests stay on `fake`.
- **Open product questions from earlier stories.** These are with Matheus (retro item E11-A6) and are not for the 11.6 builder:
  - the per-relatório rich editor versus 11.4's plain-text acceptance criterion;
  - Graviton versus x86-64;
  - routing `panel` to Textract or to `ocr-svc`;
  - the remaining narrowings of 11.2, 11.3, 11.9 and 11.10.
- **Unresolved in the sources.** Two parameters of the low-confidence retry are not given:
  - which model is the "larger model" now that Sonnet 5.5 is unavailable;
  - the confidence threshold that triggers the retry.

  The evaluation and the builder must set both and record them.
