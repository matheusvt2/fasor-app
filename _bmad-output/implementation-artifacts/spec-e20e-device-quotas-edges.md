---
title: 'Stories 20.11, 20.12 and 20.13: signing out clears the device, paid work has a ceiling, and the edges are closed (plus the deferred home.search target of 20.2)'
type: 'feature'
created: '2026-11-04'
status: 'in-progress'
baseline_revision: 'e1d60e368e205a98f6a4e4988aeb24fb77e53e4c'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-20-context.md'
  - '{project-root}/_bmad-output/test-artifacts/manual/security-pass-2026-11-03.md'
warnings: ['batched', 'oversized']
batched_because: 'the edge lane of wave B (security findings S2, S6, S7, S8): the three stories share apps/api/src/http/app.ts, copy/pt-br.ts and the sign-in/sign-out specs; the home.search target is a one-line deferral of 20.2 that e20s owned the file of'
deferred: []
---

<intent-contract>

## Intent

**Problem:** A signed-out device still opens and writes the previous user's data (S2); readings, audits and image decoding have no ceiling (S6); better-auth answers paths the app never uses, mutating `/api` routes accept a `text/plain` body with no `Origin`, the telemetry limiter is keyed by a client-chosen id, removed files are still served, the domain Caddy block sends no HSTS, `/api/health` starts LibreOffice on every call, and the login says "Senha incorreta" for an unknown e-mail (S7, S8).

**Approach:** Sign-out flushes, confirms with the unsent count, then deletes the user's Dexie database; an online boot answered 401 goes to `/login` without opening it. A per-company daily counter in Postgres gates every reading start and audit, a reread of a done photo spends nothing, and every `sharp` decode of uploaded bytes carries a 120 MP limit. `app.ts` gains an auth path allowlist and an origin and content-type guard; the smaller edges are closed one by one. Contract 29 (already on main) carries `quota_exceeded` and `forbidden_origin`; no contract bump.

## Boundaries & Constraints

**Always:**
- Coordinator readings are decided: no roles; the sign-out confirm text "N alterações ainda não foram enviadas. Sair apaga-as deste aparelho." (kernel-composed, singular "1 alteração ainda não foi enviada. Sair apaga-a deste aparelho."); an online boot with a 401 goes to `/login`; quotas default to 400 readings (rereads included) and 30 audits per company per day, env-configurable; 120 megapixels.
- Every derived pt-BR sentence is a kernel export (`packages/domain`), marked `// authored: 2026-11-04, Story 20.x`; static copy goes in `apps/web/src/copy/pt-br.ts` (AGENTS.md three homes).
- `LLM_PROVIDER`/`OCR_PROVIDER` stay `fake`; no paid key anywhere. Terraform only under `infra/`, `terraform fmt` and `validate` in the container; never `plan`/`apply`, never AWS.
- Storage identifiers stay (`releng-{user_id}`, `releng.*`, `releng-shell-*`, cookie prefix). A new localStorage key, if any, uses the `releng.` prefix.
- Every finding reproduced by `test-results/adhoc-sec/` (copies in `.scratch-e20e/adhoc/`) becomes a test that fails on `e1d60e36` and passes here.

**Never:**
- No contract bump, no new error code, no new op path or row field (stop and report if one proves necessary). No seed bump.
- Do not touch `docx.ts` layout, `print/*`, `sections/section-9.ts` or the layout golden (adding `limitInputPixels` to an existing `sharp(` call in `docx.ts`, `section-7.ts`, `section-11.ts` is allowed and changes no output).
- Do not change AD-9's offline behavior: an offline boot with a live pointer and an existing database still reaches Home behind the re-auth banner.
- Do not change the mid-use 401 (the banner only). Do not fix "Reenviar re-sends a clock-skew op unchanged" (e20s deferral; report only).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected |
|---|---|---|
| 20.11 sign-out synced | online, nothing pending, press Sair, confirm | engine flush runs; server sign-out; `releng-{id}` gone from `indexedDB.databases()`; pointer gone; `/login` |
| 20.11 sign-out pending | online, 3 unsent ops after the flush (e.g. server refusing writes) | confirm says "3 alterações ainda não foram enviadas. Sair apaga-as deste aparelho."; Cancelar keeps db, pointer, outbox |
| 20.11 S2 read | after Sair, restore the old pointer, reload, online and offline | `/login`, no relatório text; no `releng-{id}` database recreated |
| 20.11 S2 write (inject) | after Sair, restore pointer, try to create a relatório, then sign in | no Home to write from; after sign-in the server holds no op of the attacker's tag |
| 20.11 expired online | cookie cleared, pointer and db kept, network up | boot lands on `/login`, db not opened, nothing shown; same user signs in, outbox ops reach the server |
| 20.11 expired offline | same, network down | Home behind "Sua sessão expirou…" banner (unchanged) |
| 20.11 slow server | online, session read takes longer than `BOOT_SESSION_WAIT_MS` (3 s) | Home from the cached pointer after the wait; a later 401 closes the db and goes to `/login` |
| 20.11 delete blocked | another tab holds the db | sign-out still completes (pending-wipe record, retried at next boot before any open) |
| 20.12 reading quota | company at 400 today, nameplate photo uploaded | no job enqueued; photo kept, `reading_status = failed`; the upload answer carries `reading: 'quota_exceeded'`; the sheet shows "Limite diário de leituras atingido. Tente amanhã ou fale com o administrador." |
| 20.12 reread over quota | company at 400, "Tentar novamente" | 429 `quota_exceeded`; the reading line shows the same sentence |
| 20.12 next day | counter row of yesterday at 400 | first reading runs (day = `America/Sao_Paulo` date) |
| 20.12 reread done | photo `reading_status = done`, reread | 200 `{reading_status: 'done'}`, provider not called, counter unchanged |
| 20.12 audit quota | company at 30 audits today | 429 `quota_exceeded`, no `audit_run`; Export shows the audit sentence "Limite diário de conferências atingido. Tente amanhã ou fale com o administrador." |
| 20.12 pixels | crafted PNG/JPEG header claiming 20000×10000 (200 MP), small file | upload refused 413 `file_too_large` with `details: {limit: 'pixels', max_pixels: 120000000}` before any decode; `/api/health` answers meanwhile; device upload row shows "A imagem passa de 120 megapixels e não pode ser enviada." |
| 20.13 auth allowlist | session calls `update-user`, `list-sessions`, `revoke-other-sessions`, `change-password`, any other `/api/auth/*` | 404 `not_found`; name and sessions unchanged. `sign-in/email`, `sign-out`, `get-session` work |
| 20.13 cross-site | POST/PUT/PATCH/DELETE under `/api` with foreign `Origin`, or no `Origin` and no `Sec-Fetch-Site: same-origin`, or a body whose content-type is not `application/json` | 403 `forbidden_origin`, nothing applied. Exempt from the content-type rule only: `PUT /api/files/:id`, `POST /api/telemetry` (beacon), and requests with no body |
| 20.13 app requests | the web's own fetches and beacons, Chromium and WebKit | pass |
| 20.13 telemetry | one session rotating `device_id` | limited per session user (`TELEMETRY_USER_RATE_LIMIT`, 2000/min) and per user+device (1000/min, unchanged) |
| 20.13 removed file | file row or lookup tombstoned | `GET /api/files/:id/:variant` 404; `/api/revisions/:id/docx|pdf` unchanged |
| 20.13 health | 10 calls within 60 s | LibreOffice probed once (cached 60 s) |
| 20.13 login copy | wrong password or unknown e-mail | "E-mail ou senha incorretos." |
| 20.13 Caddy | `{$APP_DOMAIN}` block | `Strict-Transport-Security "max-age=31536000"`, `-Server` |
| e20s note | an early 413 from the api behind Caddy | relayed as the api's JSON 413, not a 502 (check; fix the Caddyfile only if not) |
| 20.2 deferred | user types into the Home search | one `action` event `target: 'home.search'` per search started (empty to non-empty), never the text |

</intent-contract>

## Code Map

**20.11 (web)**
- `apps/web/src/state/session.tsx` -- `doSignOut` (l.291-304): after `authClient.signOut()` succeeds: `configureTelemetry(null)` (after a best-effort `flushTelemetry`), close handle, `setDatabase(null)`, record pending wipe, `Dexie.delete(databaseName(id))` raced against a timeout, clear the wipe record on success, `clearLastSession()`. Server sign-out failure still throws and clears nothing (current contract). Cold open (l.151-238): when `cached !== null`, check `Dexie.exists(databaseName(cached.id))`; if online (`navigator.onLine`), wait for `readSession()` up to `BOOT_SESSION_WAIT_MS` before attaching; a 401 with a cached pointer → no attach (or close if attached after the wait), `writeReAuthRequired(true)` and keep the pointer and the db, `status = 'signed-out'`; offline or unreachable → today's path, but only if the db exists (absent db + offline → `signed-out`, pointer kept so AD-8's online recovery still works). Update the header comment (l.30-38).
- `apps/web/src/state/last-session.ts` -- the pending-wipe key (`releng.pending-wipe`, list of db names) read/write/clear; the boot deletes listed dbs first.
- `apps/web/src/surfaces/account/account-surface.tsx` (l.209-220, 437-483) -- press Sair: "Saindo…" while the flush runs (`sync.syncNow()`, as `surfaces/export/server-job.ts` `drainForServerJob` l.80 drives it, one round); then count unsent = outbox `pending`+`sent`+`dead` + `pendingUploadCount(db)` (server-job.ts); open the confirm: count 0 → "Sair desta conta?" with a new authored body saying the device data of this account is removed; count > 0 → "Sair com envios pendentes?" with the kernel sentence. Confirm → `session.signOut()`.
- `packages/domain/src/sync/counts.ts` -- `signOutUnsentText(count)` beside `pendingNotSentText` (l.198); `pendingNotSentText` stays exported if still used elsewhere, else remove with its tests.
- `apps/web/src/copy/pt-br.ts` l.73-86 -- `signOutNote`, `signOutNotePending`, `signOutDialogBody` no longer say "nada é apagado" (authored, dated).
- Tests: `state/session.test.tsx` (or the existing session tests) for sign-out order, pending wipe, boot 401 online/offline/slow; `account-surface.test.tsx` for the flush, both confirm variants and Cancelar; kernel test for the sentence.
- e2e: `e2e/security-device.spec.ts` (new, `@p0`): S2 read (attack.mjs step 6: restore pointer, reload online, then `context.setOffline(true)` reload) and S2 write (inject.mjs) as Playwright tests, plus the pending confirm (use `installRefusedWrites`/`setWritesRefused` from `e2e/support/durability.ts`) asserting the committed state (`indexedDB.databases()`, outbox rows). `e2e/auth.spec.ts` 1.3-E2E-001 (l.44, now asserts the db is deleted), 1.3-E2E-002b (l.178: first reload online now lands on `/login`; the offline half keeps Home + banner, done in the reverse order: offline first, then online), `e2e/ui-hygiene.spec.ts` l.120, `e2e/durability.spec.ts` 1.8-E2E-007 (l.290, must stay green).

**20.12 (api)**
- New table (drizzle schema `apps/api/src/db/schema.ts` + generated migration `drizzle/0006_*.sql`, `migrations-match.test.ts` green): `ai_usage_daily(company_id uuid, day date, kind text check in ('reading','audit'), count int, primary key (company_id, day, kind))`. One helper `consumeDailyQuota(tx|db, companyId, kind, limit): Promise<boolean>` as a single `INSERT … ON CONFLICT DO UPDATE SET count = count + 1 WHERE count < limit RETURNING count`, day `(now() at time zone 'America/Sao_Paulo')::date`.
- `apps/api/src/config.ts` -- `READING_DAILY_QUOTA` (400), `AUDIT_DAILY_QUOTA` (30), `TELEMETRY_USER_RATE_LIMIT_MAX` (2000/60 s) with defaults; `main.ts` passes them to `createApp` options (`quotas`), tests pass small values in-process.
- `apps/api/src/jobs/reading/status.ts` `startReading` (l.138): consume before `deps.enqueue`; over quota → `QuotaExceededError`, nothing enqueued. `jobs/reading/send.ts` `sendReading` (l.31): on it, `writeReadingFailed(…, 'queued')` and return `'quota_exceeded'` to `http/files.ts` PUT (l.293, `queueReading` ~l.163), whose 200 body gains optional `reading: 'quota_exceeded'` (`FilePutResponse` schema in `packages/domain/src/contract/sync.ts`, optional field, no version bump). `sync/routes.ts` `sendRetargetedReading` (l.69) handles it like `sendReading`. Log `reading_started` / `quota_exceeded` lines with `company_id` and `kind` (`apps/api/src/log.ts`).
- `apps/api/src/http/reading.ts` (l.46): a photo whose `reading_status` is `done` answers 200 `{photo_id, reading_status: 'done'}` without `startReading` (widen `readingRereadResponseSchema`, `contract/reading.ts` l.21, to `running|done`); over quota → 429 `quota_exceeded`.
- `apps/api/src/http/audit.ts` (l.86): consume inside the `before` of `applyServerBatch` after `activeRun` (l.65), so a refused audit writes nothing; over quota → 429 `quota_exceeded`.
- Web: kernel `readingQuotaText` / `auditQuotaText` (or one `quotaExceededText(kind)`) in `packages/domain`; the upload queue (`apps/web/src/sync/` uploader, `FileBlobRow` in `db/schema.ts` l.69, a non-indexed optional field, no Dexie version) records `reading_refused: 'quota_exceeded'`; `surfaces/ficha/reading-line.tsx` `FailedReading` (l.210) and `plate-photo.tsx` (l.215-230) show the kernel sentence for such a photo and after a 429 on "Tentar novamente" (today a toast `t.retryFailed`); `surfaces/export/use-audit.ts` (l.96) maps `quota_exceeded` to the audit sentence shown by `export-dialog.tsx` l.524. Check `sync/client.ts` does not auto-retry a 429 on reread/audit.
- `apps/api/src/storage/variants.ts` l.43 -- `limitInputPixels: MAX_INPUT_PIXELS` (120_000_000, exported constant in the api) on every `sharp(` of uploaded bytes: also `jobs/reading/image.ts` l.32/37, `providers/textract.ts` l.139, `providers/fake.ts` l.166, `jobs/generate/docx.ts` l.126, `sections/section-7.ts` l.59, `sections/section-11.ts` l.63, `certificate-cache.ts` l.53. `http/files.ts` PUT: before storing, `sharp(bytes).metadata()` width×height (pages counted for animated images) over the limit → 413 `file_too_large` with the pixel details; the web's dead-upload reason shows the kernel pixel sentence.
- `infra/production/observability.tf` (or a new `infra/production/metrics.tf`): `aws_cloudwatch_log_metric_filter` on the api log group (`storage.tf` l.130) for `{ $.msg = "reading_started" }` (namespace `Conforme/Usage` or the existing naming, metric `Readings`, dimension `company_id = $.company_id`) and one for `quota_exceeded`; a dashboard widget only if `observability.tf` already has a fitting dashboard. Cost line in the PR (custom metrics, a handful of companies).
- Tests: `apps/api/src/http/quota.integration.test.ts` (new, in-process `createApp` with `quotas: {readings: 2, audits: 1}`, fake providers): create path, reread, audit, next day (seed yesterday's row), reread of done (spy provider not called), concurrent consumes never exceed the limit; `variants`/files integration test with the crafted headers (PNG IHDR and JPEG SOF) and `/api/health` answering. e2e: `e2e/photos.spec.ts` or `e2e/reading-quota.spec.ts` (`@p0`): set the worker company's counter to the limit through `e2e/support/push-server-ops.ts`-style DB access, take a nameplate photo, assert the sheet sentence and the photo kept (store row), then reset the row.

**20.13 (api, web, infra)**
- `apps/api/src/http/app.ts` l.195: route only `POST /api/auth/sign-in/email`, `POST /api/auth/sign-out`, `GET /api/auth/get-session` to `auth.handler`; every other `/api/auth/*` → 404 `notFoundBody`. Check nothing else in `apps/web` or better-auth's client calls another path (grep `apps/web/src/api/auth-client.ts`).
- `apps/api/src/http/app.ts` after l.192, before the auth routes: `originGuard` middleware for POST/PUT/PATCH/DELETE under `/api/*`: `Origin` matches the trusted origins (same patterns as better-auth, wildcards like `http://localhost:*`; a matcher in `apps/api/src/auth/trusted-origins.ts` beside `parseTrustedOrigins`, unit-tested), or no `Origin` with `Sec-Fetch-Site: same-origin`; content-type `application/json` (parameters allowed) unless exempt (table above); else 403 `{code: 'forbidden_origin'}`. `AppOptions.originGuard: {trustedOrigins: readonly string[]} | 'off'` is required, so every `createApp` call states it; `main.ts` passes `parseTrustedOrigins(TRUSTED_ORIGINS)` + `AUTH_BASE_URL` as better-auth gets them (`main.ts` l.104); in-process tests that do not test it pass `'off'`.
- Every test client that writes without a browser must now send `Origin`: `e2e/support/durability.ts` l.56, `e2e/support/relatorio-seed.ts` l.67, `e2e/relatorio.spec.ts` l.61/488, `e2e/auth.spec.ts` l.332, `e2e/status-flow-2026-10-10.spec.ts` l.121 (one helper in `e2e/support/` for the origin header); api live-server tests (`fetch(API_URL…)`) without an `origin` header (grep `apps/api/src`; `sync/rules.test-support.ts` l.67 already sends one). `apps/web/src/api/telemetry-client.ts` beacon may send a `Blob` typed `application/json`; either way telemetry is exempt from the content-type rule.
- `apps/api/src/http/telemetry.ts` l.51-70: a second `FixedWindowLimiter` keyed by `session.userId`.
- `apps/api/src/http/files.ts` l.301-311: `lookup.removedAt` or `row.removed_at` set → 404. Before, grep `apps/web/src` for a surface that fetches a removed file (restore or trash views); if one exists, keep it working and report.
- `apps/api/src/http/health.ts` + `main.ts` l.124: wrap `probeLibreOffice` in a 60 s cache (clock injectable, unit test).
- `apps/web/src/copy/pt-br.ts` l.26 `wrongPassword: 'E-mail ou senha incorretos.'` (authored, dated); every test asserting "Senha incorreta".
- `infra/caddy/Caddyfile`: the `{$APP_DOMAIN:localhost}` block gains the `header { Strict-Transport-Security "max-age=31536000"  -Server }` of the IP block. 413 check: run a throwaway `caddy:2.11.4-alpine` (the compose image) on the batch's compose network with a Caddyfile copy whose block is `:8080 { reverse_proxy api:3000 }`, then from `tools` POST a 1 MB body to `/api/auth/sign-in/email` (64 KiB cap) and a 20 MB body to `/api/sync/ops`; record status and body. Fix only if Caddy answers anything but the api's JSON 413.
- Tests: `apps/api/src/http/security.test.ts` (extend or create) and `apps/api/src/http/edges.integration.test.ts` (new): allowlist (update-user leaves the name unchanged, list-sessions 404), origin guard matrix (foreign, missing, `Sec-Fetch-Site`, text/plain, multipart, file PUT, telemetry, body-less POST), telemetry per user, removed file 404, health cache. `e2e/security-ops.spec.ts` gains a cross-site push test (`page.request.post` with `Origin: https://evil.example` and with `text/plain`: 403, nothing in the outbox/server). `auth.spec.ts` covers the login copy.

**20.2 deferred**
- `packages/domain/src/contract/telemetry.ts` l.121-157: append `'home.search'` to `UX_ACTION_TARGETS` with a dated comment. `apps/web/src/surfaces/home/home-surface.tsx` l.82, 241: emit `track({name: 'action', target: 'home.search', …})` (`telemetry/track.ts` l.120) when the query goes from empty to non-empty. `apps/web/src/telemetry/targets.test.ts` must find it (extend its scan if `track(` calls are not covered); a component test asserts one event per search and no text.

**Docs** -- `ARCHITECTURE-SPINE.md` AD-9 amended (struck-through, dated); `EXPERIENCE.md` § session states; `source-deltas.md` rows (sign-out wipe and boot 401; quotas and pixels; auth allowlist and origin guard); `docs/observability.md` the metric lines (and the E18-A3 runbook sentence if a residual risk changes how a view is read); `deferred-work.md` under "Epic 20 batch e20e" (the per-e-mail lockout as an accepted risk; anything left); `docs/kbs/` matching concept + `log.md`.

## Tasks & Acceptance

**Execution:**
1. Kernel: `signOutUnsentText`, quota and pixel sentences, `home.search`; red-first tests. Commit "e20e: kernel".
2. 20.11 web (session, last-session, account surface, copy) + unit/component tests.
3. 20.12 api (table, migration, quota helper, reading/audit/files/variants, config, logs) + integration tests; web sentences; Terraform metric (`terraform fmt`, `validate` in the container per `infra/bin/tf`).
4. 20.13 api (allowlist, origin guard, telemetry, files, health), login copy, Caddyfile + 413 check; update every non-browser writer in tests; integration tests.
5. 20.2 `home.search`.
6. e2e: `security-device.spec.ts` (new), the quota spec, `security-ops.spec.ts` cross-site test, updated `auth.spec.ts`, `ui-hygiene.spec.ts`, `durability.spec.ts`, `home.spec.ts`.
7. Prove the red: run `security-device.spec.ts` and the new integration tests against the baseline code (`git stash`-free: a temporary checkout of `e1d60e36` files in the working tree, or reverting the fix hunks) and record red, then green; this doubles as the mutation runs for the sign-out wipe and the origin guard.
8. Docs.

**Acceptance Criteria:**
- Given each row of the I/O matrix, when exercised through the real surface (UI for the device rows, HTTP for the server rows), then the outcome is as written, and the device rows assert the committed state (`indexedDB.databases()`, outbox, pointer), not only the screen.
- Given the S2 reproductions (`attack.mjs` step 6, `inject.mjs`) and the S7/S8 curl cases, when run on `e1d60e36`, then they succeed (red tests), and on this branch they fail (green tests).
- Given the full unit, api and touched e2e suites, when run, then all are green; every changed test assertion is listed in the PR body.

## Spec Change Log

## Design Notes

**Narrowings and open questions (also for the PR body).** (1) Unsent count = outbox ops not acked plus photo blobs not uploaded; a photo whose create op and bytes both wait counts twice. (2) `BOOT_SESSION_WAIT_MS` = 3 s online before Home from the pointer (authored); a later 401 still drops to `/login`. (3) Offline boot with a pointer but no database → `/login` (the AD-8 recovery screen still appears once online with a valid cookie). (4) Quota day is the `America/Sao_Paulo` calendar day. (5) A reading refused by quota leaves `reading_status = failed` (so "Preencher manualmente" and "Tentar novamente" show); the specific sentence shows on the device that uploaded it and on any device after a retry. (6) Quota answers are 429 with `quota_exceeded`; the pixel refusal reuses `file_too_large` 413 with details (no new code). (7) Telemetry per-user limit 2000/min (authored), telemetry and body-less requests exempt from the content-type rule. (8) The per-e-mail sign-in lockout stays, as an accepted risk.

## Verification

**Commands** (inside the worktree's `tools` container: `podman compose --profile tools run --rm --user root tools pnpm ...`; logs in `.scratch-e20e/`; restart `api` after any change under `packages/domain` or `apps/api`):
- `pnpm lint`, `pnpm static` -- clean.
- `pnpm test:unit`, `pnpm test:api` -- green.
- Under `lockf -t 20000 /tmp/fasor-verify.lock`: `pnpm verify` (the origin guard touches every spec's sign-in), then the touched `@p1` specs (`auth.spec.ts`, `durability.spec.ts`, `home.spec.ts`, `security-device.spec.ts`, the quota spec) on `desktop-chrome` and `durability-desktop-chrome`, then `security-device.spec.ts`, `auth.spec.ts` and `durability.spec.ts` on the matrix projects.
