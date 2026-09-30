---
type: Architecture Rule
title: Sync, offline shell, session and tenancy
description: AD-8, AD-9, AD-10, AD-24. Open for sync engine, service worker, auth, rejected ops, or any query that touches company data.
tags: [architecture, sync, offline, auth, ad-8, ad-9, ad-10, ad-24]
timestamp: 2026-09-30T00:00:00Z
sources: [ARCHITECTURE-SPINE.md#ad-8, ARCHITECTURE-SPINE.md#ad-9, ARCHITECTURE-SPINE.md#ad-10, ARCHITECTURE-SPINE.md#ad-24]
---
# Sync, session, tenancy

- **Cycle (AD-24)**: push ops, upload files, pull company, pull each relatório. `POST /api/sync/ops` takes up to 500 ops and answers `{applied, rejected, superseded}`; one rejected op never blocks the rest. The server rejects only for shape (`op_invalid`, `op_path_unknown`), server-only family (`op_server_only`), tenant, or ownership (`op_forbidden`); never for a domain rule. Duplicate TAG, unknown location, edit on a tombstone are applied and reported by the kernel `integrity` check.
- A rejected op becomes `outbox.status = dead` with its code, is excluded from materialized state, keeps its value for "Reenviar", and is listed by pre-issue. Retry: network and 5xx with backoff; 4xx never, except `401` (re-auth banner, outbox intact) and `409 file_row_missing`.
- Pull returns `{ops, seq, summary?}`. The relatório stream is a query (ops with that `relatorio_id` plus project-scope ops of its project, `seq > since`), never a stored fan-out. Rebase: after a pull, pending outbox ops are re-applied on top.
- **Offline (AD-8)**: a service worker precaches the shell so a cold open works offline. No install prompt, no Background Sync, no reliance on `persist()`. The engine runs only while the tab is open: on launch, on `online`, every 60 s. Automatic pull: every relatório in Rascunho or Em campo, company scope, `thumb` variants; Em revisão and Emitido on open. Banner when outbox items are older than 5 days; warning under 500 MB free storage. A visible "Sincronizar agora" action exists (decision 2026-09-21); tests use it instead of the timer.
- **Session (AD-9)**: the api serves the built web bundle same-origin, no CORS. better-auth email plus password, httpOnly `SameSite=Lax; Secure` cookie, 30-day sliding. Sign-in needs connectivity; the session continues offline. Dexie database is `releng-{user_id}`; sign-out never drops it. Users are provisioned by a seed CLI (`pnpm seed:users`); no signup, no outbound email.
- **Tenancy (AD-10)**: `company_id` on every Drizzle table; every repository function takes it as a required typed argument. The kernel schemas carry it only on `op` and `file`.
- Contract skew: a push is accepted from any client at or above the server's minimum `CONTRACT_VERSION`; a pull answers `426 contract_outdated` to older clients.

Code: `apps/web/src/sync/`, `apps/api/src/sync/`, `packages/domain/src/sync/`, `packages/domain/src/merge/`. Multi-device merge and conflicts (Epic 10) live in `merge/` and `apps/api/src/sync/merge*.ts`.
