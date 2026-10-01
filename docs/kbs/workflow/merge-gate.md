---
type: Runbook
title: Merge gate
description: What must be green before a story PR merges, the split gate, and host locking.
tags: [workflow, verify, gate]
timestamp: 2026-09-30T00:00:00Z
sources: [AGENTS.md, scripts/verify.ts]
---
# Merge gate

- Command on a shared machine: `flock /tmp/fasor-verify.lock docker compose --profile tools run --rm tools pnpm verify`; paste its output in the PR. Budget under 15 minutes. Source: `scripts/verify.ts`.
- `verify` runs three phases: (`lint`, `static`, `test:api`) together, then `test:unit` alone, then `test:e2e` (Playwright `@p0` on `desktop-chrome` and `durability-desktop-chrome`) alone. First failure stops its phase and later ones. Logs: `test-results/verify/`. `test:unit` has no database access; `test:api` uses compose Postgres and MinIO.
- **Split gate (decided 2026-09-30)**: a story PR runs `verify` plus the specs it touched, plus the durability specs on `test:e2e:matrix` when it changes the op fold, the commit path or a live query on the ficha. `test:e2e:full` and the full matrix run once per wave on integrated main and at epic QA.
- Never merge on a red or partial verify, even for flakes.
- On a shared machine one gate at a time: wrap `verify`, `test:e2e:full`, `test:e2e:matrix` and multi-worker runs in `flock /tmp/fasor-verify.lock`.
- `pnpm audit --prod` is not part of verify; its known advisory is tracked in `_bmad-output/implementation-artifacts/deferred-work.md`.
- No CI. AWS Budget and deploy are separate: [infra-aws](/architecture/infra-aws.md).
