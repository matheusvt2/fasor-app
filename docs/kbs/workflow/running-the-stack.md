---
type: Runbook
title: Running the stack
description: Docker compose commands, ports, health endpoint and the tools container. Open before starting services or running any pnpm script.
tags: [workflow, docker, runbook]
timestamp: 2026-10-15T00:00:00Z
sources: [AGENTS.md, docker-compose.yml]
---
# Running the stack

- `docker compose up -d` starts web (Vite, :5173), api (Hono on Node 24, :3000), PostgreSQL 18 (:5432), MinIO (:9000, console :9001), the one-shot `install`, and `mkcert`/`caddy` (HTTPS origin for tablets, `docs/tablet-https-setup.md`).
- `GET /api/health` returns `{status, db, queue, storage, libreoffice}`.
- Every pnpm script runs in the tools container, never on the host: `docker compose --profile tools run --rm tools pnpm <script>`.
- OCR sidecar is opt-in: [ocr-service](/code/ocr-service.md).
- Parallel worktrees need isolated compose projects (own `COMPOSE_PROJECT_NAME`, host ports below 65535).
- Never install or run a service natively. `test-results/` is generated output.
- 2026-10-15 (Story 14.10 part 1): the `web` service runs Vite with `--configLoader runner`, so it never writes `apps/web/node_modules/.vite-temp` and a root-owned one left by a `--user root` tools run cannot crash-loop it. The `tools` service mounts the engine socket (`${ENGINE_SOCKET_HOST:-/var/run/docker.sock}` at `/var/run/engine.sock`, SELinux label separation off for that one-off container) and receives `COMPOSE_PROJECT_NAME` for the gate preflight, which only reads it ([merge-gate](/workflow/merge-gate.md)).
- Local users are provisioned with `pnpm seed:users`; there is no signup ([sync](/architecture/sync.md)).
