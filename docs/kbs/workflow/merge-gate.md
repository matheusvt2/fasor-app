---
type: Runbook
title: Merge gate
description: What must be green before a story PR merges, the split gate, and host locking.
tags: [workflow, verify, gate]
timestamp: 2026-10-15T00:00:00Z
sources: [AGENTS.md, scripts/verify.ts]
---
# Merge gate

- Command on a shared machine: `flock /tmp/fasor-verify.lock docker compose --profile tools run --rm tools pnpm verify`; paste its output in the PR. Budget under 15 minutes. Source: `scripts/verify.ts`.
- `verify` runs three phases: (`lint`, `static`, `test:api`) together, then `test:unit` alone, then `test:e2e` (Playwright `@p0` on `desktop-chrome` and `durability-desktop-chrome`) alone. First failure stops its phase and later ones. Logs: `test-results/verify/`. `test:unit` has no database access; `test:api` uses compose Postgres and MinIO.
- **Split gate (decided 2026-09-30)**: a story PR runs `verify` plus the specs it touched, plus the durability specs on `test:e2e:matrix` when it changes the op fold, the commit path or a live query on the ficha. `test:e2e:full` and the full matrix run once per wave on integrated main and at epic QA.
- **Story gate (decided 2026-10-08, E11-A1; amends the split gate)**: a story PR runs `lint`, `static`, `test:unit`, `test:api` and the Playwright specs it touched (plus touched durability specs on the matrix projects under the same condition); the full `@p0`, `test:e2e:full` and the matrix run once per wave on integrated main. Load rules: at most two batch stacks up, no Playwright outside the lock, main checkout stack stopped while batches run. On the macOS podman host: `podman compose`, `lockf` instead of `flock`; since 2026-10-08 the plain `pnpm verify` fits the 11.4 GB VM again and the `@p0` parallel group runs on two workers. Source: AGENTS.md Decisions of record; `epic-batch-orchestrator.md`.
- **Gate preflight (2026-10-15, Story 14.10 part 1)**: `pnpm verify`, each stage run alone (`lint`, `static`, `test:unit`, `test:api`) and `scripts/e2e.ts` first run `scripts/preflight.ts`. It reads the compose project's containers through the engine socket the `tools` service mounts (`/var/run/engine.sock`, GET requests only) and exits 1 within 15 s with `preflight: <container> is restarting (restarts: N); last log: <line>` when a container restarts in a loop; no socket or an engine error is one line and the gate goes on. `verify` passes `GATE_PREFLIGHT_DONE=1` to its stages so the probe runs once. Source: `scripts/preflight.ts`, `docker-compose.yml`.
- Never merge on a red or partial verify, even for flakes.
- On a shared machine one gate at a time: wrap `verify`, `test:e2e:full`, `test:e2e:matrix` and multi-worker runs in `flock /tmp/fasor-verify.lock`.
- `pnpm audit --prod` is not part of verify; its known advisory is tracked in `_bmad-output/implementation-artifacts/deferred-work.md`.
- No CI. AWS Budget and deploy are separate: [infra-aws](/architecture/infra-aws.md).
