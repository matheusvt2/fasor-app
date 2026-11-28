---
type: Code Map
title: Monorepo layout
description: Top-level directories and which one a change belongs in.
tags: [code, layout]
timestamp: 2026-11-26T00:00:00Z
sources: [package.json, pnpm-workspace.yaml, docker-compose.yml]
---
# Monorepo layout

| Path | Holds |
| --- | --- |
| `packages/domain` | pure kernel: [domain-package](/code/domain-package.md); `fixtures/porto-seguro` (golden fixture), `fixtures/replay-small` |
| `apps/web` | [web-app](/code/web-app.md) |
| `apps/api` | [api-app](/code/api-app.md) |
| `services/ocr` | [ocr-service](/code/ocr-service.md) |
| `e2e/` | Playwright specs (about 50), `support/groups.ts` (parallel vs serial groups), `fixtures/` |
| `scripts/` | `verify.ts`, `e2e.ts`, `regen-goldens.ts`, `seed-users.ts`, `test-reset.ts`, `export-ocr-schema.ts`, `render-skeleton.ts`, deploy helpers |
| `infra/` | Terraform: [infra-aws](/architecture/infra-aws.md) |
| `docker/` | `caddy`, `mkcert` for tablet HTTPS (`docs/tablet-https-setup.md`) |
| `docs/` | `kbs/` (this KB), `DEVELOPMENT.md`, `TESTING.md`, `tablet-https-setup.md`, `observability.md`, `ai-quality-rubric.md`, `nc-chip-phrases.md`, `archive/` (the display-reading spike); `concorrentes/`, `context/`, `media/` see [rules](/project/rules.md) |
| `_bmad/`, `_bmad-output/` | BMAD installer output and all planning: [planning](/planning/index.md) |

Root scripts (`package.json`): `lint`, `static`, `test:unit`, `test:api`, `test:api:batch` (2026-11-26, chore T4: the api suite without its print lane when the batch touched no print path), `test:e2e`, `test:e2e:full`, `test:e2e:matrix`, `test:reset`, `schema:ocr`, `db:generate`, `seed:users`, `verify`. All run inside the tools container: [running-the-stack](/workflow/running-the-stack.md).

Test placement: unit tests sit beside the source as `*.test.ts(x)`; api integration tests are `*.integration.test.ts` against compose Postgres and MinIO; end-to-end specs are in `e2e/`, tagged `@p0`, `@p1`, `@p2`.
