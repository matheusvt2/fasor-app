---
type: Architecture Rule
title: Local-first, ops, ids and soft delete
description: AD-1, AD-3, AD-4, AD-20. Open when adding a write path, entity, op family, or removing data.
tags: [architecture, ops, offline, ad-1, ad-3, ad-4, ad-20]
timestamp: 2026-09-30T00:00:00Z
sources: [ARCHITECTURE-SPINE.md#ad-1, ARCHITECTURE-SPINE.md#ad-3, ARCHITECTURE-SPINE.md#ad-4, ARCHITECTURE-SPINE.md#ad-20]
---
# Local-first and ops

- **AD-1**: every screen renders from IndexedDB via `useLiveQuery`. Every committed write becomes an op in the outbox and is applied locally through `applyOp` first. No component awaits HTTP to render or persist. Commit granularity: one op per field commit (blur, Enter or 500 ms idle); tri-state, chips, pickers commit immediately. Unsaved text goes to a per-user `drafts` table and is offered back as "Rascunho encontrado - Recuperar", never applied silently.
- **AD-3**: an op is `{op_id, kind create|put|remove, scope company|project|relatorio, company_id, project_id?, relatorio_id?, path, value, prev_op_id?, batch_id?, meta?, actor_id, device_id, client_ts, seq?}`. `seq` is set only by the server; last writer wins by `seq`. `OpPath` is a zod union in `packages/domain/src/ops/path.ts`, read and written only via `parsePath`/`formatPath`; families are append-only. Server-only families (`system:*` actors: files, reading, generate, sync, identity) are rejected from clients with `403 op_server_only`. No wildcard paths: bulk = N ops sharing a `batch_id`; undo = inverse ops. Reorder is a `put` on fractional `order_key`. Test: the same log replayed in `seq` order through Dexie and Drizzle layers gives byte-equal snapshots.
- **AD-4**: ids are UUIDv7 minted where the row is born. The server mints ids only for rows it creates (suggestions, generation jobs, revisions, identity users and companies).
- **AD-20**: removal is a `remove` op setting `removed_at`; "Restaurar" clears it; snapshot, renderer and counters ignore tombstones; purge is a deferred server policy.

To add a new writable field: extend the entity zod schema, add the path family (append-only), handle it in `applyOp`, emit it from web, never from a component's fetch. Code: `packages/domain/src/ops/`, `apps/web/src/db/commit.ts`.

Code: `packages/domain/src/ops/` (`path.ts` OpPath families, `apply.ts` applyOp, `materialize.ts`, `replay.ts`, `outbox.ts`, `order-key.ts`); web write path `apps/web/src/db/commit.ts` and Dexie `schema.ts`; server apply `apps/api/src/sync/apply.ts`.
