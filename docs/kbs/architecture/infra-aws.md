---
type: Architecture Rule
title: Containers and AWS
description: AD-27. Open for Docker, compose, Terraform, deploy, cost, or any external service choice.
tags: [architecture, aws, terraform, docker, ad-27]
timestamp: 2026-10-05T00:00:00Z
sources: [ARCHITECTURE-SPINE.md#ad-27, infra/README.md, AGENTS.md]
---
# Containers and AWS

- Local: docker-compose only (web dev server, api, Postgres 18, MinIO, OCR sidecar under profile `ocr`, `mkcert` and `caddy` for tablet HTTPS). Nothing runs natively.
- Cloud is AWS only: ECS Fargate behind an ALB with images in ECR (api plus in-process worker as one service), RDS for PostgreSQL 18, S3 with versioning, Secrets Manager, CloudWatch Logs, Bedrock for Claude, Textract for cloud OCR. Region `sa-east-1` for data at rest.
- Infrastructure is Terraform in `infra/` (`production/`, `bootstrap/`, `caddy/`, `bin/`), run in containers. Files in `infra/production`: network, compute, ecs, rds, storage, cloudfront, iam, ssm, schedule, budget. CDK was dropped (2026-09-29).
- The app is served at the Elastic IP (Let's Encrypt `shortlived` IP certificate) and, with `app_domain` in the untracked `terraform.tfvars`, at that host name too (regular certificate; A record at the domain's own DNS, not Route 53, created before the apply). Caddyfile: `infra/caddy/Caddyfile`; wiring: `local.primary_url` and `local.trusted_origins` in `infra/production/ecs.tf`.
- Cost ceiling USD 100 per month for everything; `infra/production/budget.tf` alerts before it. Cost every infrastructure choice first.
- One image built once and promoted unchanged; configuration only through environment variables and Secrets Manager. Every external call goes through an adapter (`src/storage`, `OcrProvider`, the LLM client), so switching a service changes `infra/`, not app code.
- Bedrock (Story 11.6): the api task gets `BEDROCK_REGION`, `BEDROCK_MODEL_ID`, `BEDROCK_PROSE_MODEL_ID` and `BEDROCK_ESCALATION_MODEL_ID` from `bedrock_model_id`, `bedrock_prose_model_id` and `bedrock_escalation_model_id` (`infra/production/variables.tf`, `ecs.tf`); `infra/bootstrap/iam.tf` allows `bedrock:InvokeModel` only on Claude Haiku 4.5, Nova Pro, Nova 2 Lite, Qwen3 VL 235B and Mistral Large 3 by exact ARN. The bootstrap apply, the deploy and `llm_provider = "bedrock"` plus `ai_features = "on"` are post-merge steps Matheus runs (`infra/README.md`, "AI features flag").
- Profile `fasor-admin` for the AWS CLI, never stored keys. Deploy story: Story 11.8 (`_bmad-output/implementation-artifacts/spec-11-8-deploy-the-same-images-to-aws.md`).
