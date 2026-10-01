# Releng

A tablet-first, offline-first web app that captures medium-voltage substation test sheets on site and generates the FO.SERV-03 relatório as DOCX and PDF. The engineer fills each equipment's ficha on a tablet, with or without signal; the office receives every change through sync and issues numbered revisions of the document.

The product name users see is the placeholder `PRODUTO`, defined once in `packages/domain`. The internal codename never appears in a user-visible string, document or file name.

Status: MVP, release `v0.1.0`. Everything runs locally in Docker; one AWS production stack exists (`infra/`).

## Quick start

You need Docker with the Compose plugin. Nothing else is installed on the host: Node, pnpm, Playwright, LibreOffice and Terraform all run in containers.

```sh
docker compose up -d
docker compose --profile tools run --rm tools pnpm exec tsx scripts/seed-users.ts --test
curl http://localhost:3000/api/health
```

Open http://localhost:5173 and sign in as `a@teste.local` with the password `senha-de-teste-123456`. Health answers `{status, db, queue, storage, libreoffice}`, each `up`.

## Documentation

| Document | Read it to |
| --- | --- |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | run the stack, seed users, use the `prod` profile, reach it from a tablet, work in parallel worktrees, fix common problems |
| [docs/TESTING.md](docs/TESTING.md) | run the merge gate (`pnpm verify`), single suites, targeted Playwright tests, the durability matrix and the OCR sidecar tests |
| [infra/PUBLISHING.md](infra/PUBLISHING.md) | publish a release: Terraform, the deploy script, the checks after it, rollback |
| [infra/README.md](infra/README.md) | what the AWS stack contains, its cost and its runbook |
| [docs/tablet-https-setup.md](docs/tablet-https-setup.md) | trust the local HTTPS certificate on iPadOS, Android and desktop |
| [services/ocr/README.md](services/ocr/README.md) | the OCR sidecar (FastAPI, PaddleOCR and PARSeq) |
| [AGENTS.md](AGENTS.md) | the project's policies and conventions, for people and coding agents |
| [docs/kbs/index.md](docs/kbs/index.md) | a map of the planning documents and code for agents |

## Repository layout

| Path | What it holds |
| --- | --- |
| `packages/domain` | The pure TypeScript kernel (zod only): op schemas, `applyOp`, every status, count, verdict and derived pt-BR text. |
| `apps/web` | React 19, Vite 8 and Dexie: the offline-first client. It renders from IndexedDB and writes only ops to its outbox. |
| `apps/api` | Hono 4, Drizzle, PostgreSQL 18 and pg-boss: applies ops, serves sync, stores files in S3 or MinIO and generates the documents with LibreOffice. |
| `services/ocr` | The OCR sidecar, under the `ocr` compose profile. |
| `e2e/` | Playwright end-to-end and durability tests. |
| `scripts/` | The gate (`verify.ts`, `e2e.ts`), user seeding, test resets and golden regeneration. |
| `infra/` | Terraform for AWS (`bootstrap`, `production`), the production Caddy image and the deploy scripts. |
| `docker/`, `docker-compose.yml` | The local stack: web, api, PostgreSQL, MinIO, Caddy and mkcert, plus the `tools`, `prod` and `ocr` profiles. |
| `docs/` | Operational guides and the knowledge base. Client material in `docs/context/` and `docs/media/` is git-ignored and never committed. |
| `_bmad-output/` | Planning: the spec, PRD, architecture, UX, epics, sprint status, retrospectives and reviews. |
| `_bmad/`, `.claude/` | BMAD configuration and Claude Code skills. |

## Conventions

- Everything runs in Docker through docker-compose; never install or run a service natively on the host.
- One branch and one pull request per story, merged after a green `pnpm verify`. There is no CI.
- No emoji anywhere: UI, documents, code, commits.
- The deliverable is a relatório: code, routes and UI say `relatorio`, never `laudo`.
- The backend never uses a personal Claude subscription; the reading providers default to `fake`.

`AGENTS.md` has the full set.
