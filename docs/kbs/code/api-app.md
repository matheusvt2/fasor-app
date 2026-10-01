---
type: Code Map
title: apps/api/src folders
description: Where routes, sync apply/pull, jobs, db and storage live on the server.
tags: [code, api, hono]
timestamp: 2026-09-30T00:00:00Z
sources: [apps/api/src]
---
# apps/api/src

- `http/` Hono routes: `app.ts`, `files.ts`, `generate.ts`, `reading.ts`, `account.ts`, `health.ts` (`GET /api/health` returns status, db, queue, storage, libreoffice), `session.ts`.
- `sync/` `routes.ts`, `apply.ts` (applyOp over Drizzle), `pull.ts`, `snapshot.ts` (toSnapshot), merge/conflict handling; many `*.integration.test.ts`.
- `jobs/` pg-boss `queue.ts`; `generate/` (docx, toc, libreoffice, watermark, sections, golden); `reading/` (job, kinds, providers, fixtures, worker).
- `db/` Drizzle `schema.ts`, `repositories/`, migrations, seed CLIs, e2e worker seed and leak check.
- `auth/` better-auth. `storage/` object-storage adapter (MinIO locally, S3 on AWS). `config.ts`, `main.ts`, `log.ts`, `scripts/`.

Every repository function takes `company_id`. Context: [sync](/architecture/sync.md), [rendering](/architecture/rendering.md), [suggestions-and-reading](/architecture/suggestions-and-reading.md).
