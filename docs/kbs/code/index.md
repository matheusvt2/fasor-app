---
type: Directory Index
title: Code map
description: Where things live in the monorepo: packages, apps, services, infra, scripts, e2e.
tags: [code, index]
timestamp: 2026-11-28T00:00:00Z
---
# Code map

- [monorepo](/code/monorepo.md) top-level layout, tooling, tests per layer. Open when you do not know which directory to touch.
- [domain-package](/code/domain-package.md) subfolders of `packages/domain/src` and what each owns. Open before adding kernel logic; the rules behind it start at [kernel-and-seed](/architecture/kernel-and-seed.md).
- [web-app](/code/web-app.md) `apps/web/src` folders, surfaces per screen, components, the sync engine, the usage-event queue, the audio recorder.
- [api-app](/code/api-app.md) `apps/api/src` folders, routes, jobs (reading, generate, transcription, audit), sync, db, e-mail, the AI providers and records.
- [ocr-service](/code/ocr-service.md) the Python sidecar (`services/ocr`, compose profile `ocr`), its build and tests.

Infrastructure (`infra/`, Terraform) is in [infra-aws](/architecture/infra-aws.md); tests and scripts in [merge-gate](/workflow/merge-gate.md) and [e2e-testing](/workflow/e2e-testing.md).
