---
type: Architecture Rule
title: Layers and dependency direction
description: The four layers, allowed import arrows, and what apps may never compute. Open before adding imports or derived logic.
tags: [architecture, layers, ad-13, ad-2]
timestamp: 2026-09-30T00:00:00Z
sources: [AGENTS.md, ARCHITECTURE-SPINE.md#design-paradigm]
---
# Layers

| Layer | Path | Holds |
| --- | --- | --- |
| Domain kernel | `packages/domain` | zod schemas, ops and `applyOp`, merge policy, integrity and pre-issue checks, progress and sheet state, text templates, parse/format, status table, print functions, seed data by version. Pure TypeScript: no I/O, no framework. |
| Client | `apps/web` | React UI over Dexie. Reads only local store; writes only ops into the outbox. Sync engine, file store, service worker. |
| Server | `apps/api` | Hono API serving the web bundle and `/api/*`, Drizzle/Postgres, pg-boss jobs (reading, generate), storage adapter, auth. Applies ops, emits system ops, renders documents. |
| OCR sidecar | `services/ocr` | Stateless Python FastAPI behind the `OcrProvider` contract. |

Arrows: `web -> domain`, `api -> domain`, `web -> api` only through routes typed in `domain/contract`, `api -> ocr` only through the OcrProvider contract. Enforced by package boundaries and eslint `no-restricted-imports`.

Hard rules an agent must not break:
- Nothing in `apps/*` derives a status, count, text, order or verdict from a sheet, relatório or outbox. Add the function to `packages/domain`; apps render its result. See [kernel-and-seed](/architecture/kernel-and-seed.md).
- `applyOp` is the only reducer on both sides; see [ops-and-local-first](/architecture/ops-and-local-first.md).
- `fetch` is allowed only in `apps/web/src/sync`, `src/files` and `src/api` (lint-enforced).
- `domain` imports only zod.
