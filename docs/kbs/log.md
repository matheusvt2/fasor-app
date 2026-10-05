---
type: Change Log
title: KB change log
description: Chronological record of changes to this knowledge base. Read only when checking freshness.
tags: [kb, log]
timestamp: 2026-09-30T00:00:00Z
---
# Log

- 2026-09-30: bundle created from AGENTS.md, SPEC, glossary, delivery slice, ARCHITECTURE-SPINE (AD-1 to AD-27) and the repository layout at commit 6b21909. Epic 11 was still in progress in sprint-status.yaml at that date.
- 2026-09-30: added verified `Code:` lines (real file paths, functions and constants) to the architecture, ux and workflow concepts, after the A/B test showed agents without KB reached exact code faster. sync.md now lists all five reject codes (`op_tenant_mismatch` was missing); merge-gate.md gives the full `flock` command.
- 2026-09-30: rendering.md and files-and-photos.md name the pdftoppm rasterizer (`pdf-raster.ts`), the sha256 page cache (`certificate-cache.ts`) and the certificate failure rule (Matheus 2026-09-30).
- 2026-10-01: infra-aws.md names the `app_domain` variable and the domain site in the Caddyfile (Matheus 2026-10-01: the app is served under a host name in the client's domain, DNS kept at the registrar).
- 2026-10-05: epics-map.md and suggestions-and-reading.md record that Story 11.6 is unblocked with Claude Haiku 4.5 as the reference model (Matheus 2026-10-05; Sonnet 5.5 still at 0 TPM).
- 2026-10-05: suggestions-and-reading.md and infra-aws.md describe the Story 11.6 Bedrock provider (Converse tool use, the `BEDROCK_*` settings, prices and error classes), the plate escalation (`shouldEscalate`, `betterReading`), the evaluation script and the narrowed IAM; `LLM_PROVIDER` no longer lists `anthropic`.
- 2026-10-05: suggestions-and-reading.md takes the Story 11.6 review-pass escalation rule (more `suggested` wins, an empty reading escalates, a failed escalation keeps the first) and when no Bedrock or escalation provider is built.
