---
type: Architecture Rule
title: Containers and AWS
description: AD-27. Open for Docker, compose, Terraform, deploy, cost, or any external service choice.
tags: [architecture, aws, terraform, docker, ad-27]
timestamp: 2026-09-30T00:00:00Z
sources: [ARCHITECTURE-SPINE.md#ad-27, infra/README.md, AGENTS.md]
---
# Containers and AWS

- Local: docker-compose only (web dev server, api, Postgres 18, MinIO, OCR sidecar under profile `ocr`, `mkcert` and `caddy` for tablet HTTPS). Nothing runs natively.
- Cloud is AWS only: ECS Fargate behind an ALB with images in ECR (api plus in-process worker as one service), RDS for PostgreSQL 18, S3 with versioning, Secrets Manager, CloudWatch Logs, Bedrock for Claude, Textract for cloud OCR. Region `sa-east-1` for data at rest.
- Infrastructure is Terraform in `infra/` (`production/`, `bootstrap/`, `caddy/`, `bin/`), run in containers. Files in `infra/production`: network, compute, ecs, rds, storage, cloudfront, iam, ssm, schedule, budget. CDK was dropped (2026-09-29).
- Cost ceiling USD 100 per month for everything; `infra/production/budget.tf` alerts before it. Cost every infrastructure choice first.
- One image built once and promoted unchanged; configuration only through environment variables and Secrets Manager. Every external call goes through an adapter (`src/storage`, `OcrProvider`, the LLM client), so switching a service changes `infra/`, not app code.
- Profile `fasor-admin` for the AWS CLI, never stored keys. Deploy story: Story 11.8 (`_bmad-output/implementation-artifacts/spec-11-8-deploy-the-same-images-to-aws.md`).
