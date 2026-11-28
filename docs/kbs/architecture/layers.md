---
type: Architecture Rule
title: Layers and dependency direction
description: The four layers, allowed import arrows, and what apps may never compute. Open before adding imports or derived logic.
tags: [architecture, layers, ad-13, ad-2]
timestamp: 2026-11-28T00:00:00Z
sources: [AGENTS.md, ARCHITECTURE-SPINE.md#design-paradigm]
---
# Layers

| Layer | Path | Holds |
| --- | --- | --- |
| Domain kernel | `packages/domain` | zod schemas, ops and `applyOp`, merge policy, integrity and pre-issue checks, progress and sheet state, text templates, parse/format, status table, print functions, seed data by version (v1 to v19), the permission verdict (`permissions/`), the audio and AI-answer rules (`audio/`, `ai-answers/`), the route contract. Pure TypeScript: no I/O, no framework. |
| Client | `apps/web` | React UI over Dexie. Reads only local store; writes only ops into the outbox. Sync engine, file store, service worker, the usage-event queue. |
| Server | `apps/api` | Hono API serving the web bundle and `/api/*`, Drizzle/Postgres, pg-boss jobs (reading, generate, transcription, audit), storage adapter, auth, e-mail, the usage-event sink, the AI providers. Applies ops, emits system ops, renders documents, refuses what a role does not allow. |
| OCR sidecar | `services/ocr` | Stateless Python FastAPI behind the `OcrProvider` contract. |

Arrows: `web -> domain`, `api -> domain`, `web -> api` only through routes typed in `domain/contract`, `api -> ocr` only through the OcrProvider contract. Enforced by package boundaries and `eslint.config.js` (`no-restricted-imports`).

Hard rules an agent must not break:
- Nothing in `apps/*` derives a status, count, text, order or verdict from a sheet, relatório or outbox. Add the function to `packages/domain`; apps render its result. See [kernel-rules](/architecture/kernel-rules.md) (entry: [kernel-and-seed](/architecture/kernel-and-seed.md)).
- `applyOp` is the only reducer on both sides; see [ops-and-local-first](/architecture/ops-and-local-first.md).
- `fetch` is allowed only in `apps/web/src/sync`, `src/files` and `src/api` (lint-enforced by `no-restricted-syntax` in `eslint.config.js`). Raw Dexie tables and `useLiveQuery` are reached only through `apps/web/src/db` (same file).
- `domain` imports only zod.

Canonical: `AGENTS.md` "Conventions that differ from defaults" (ownership, AD-1 to AD-3, AD-13); the design paradigm and AD-13 in `_bmad-output/planning-artifacts/architecture/architecture-fasor-2026-09-21/ARCHITECTURE-SPINE.md`; `eslint.config.js`.
