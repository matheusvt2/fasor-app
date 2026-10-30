---
title: 'Epic 18 batch o18a: usage events on the device (Story 18.1) and the api route with the CloudWatch sink (Story 18.2)'
type: 'feature'
created: '2026-10-29'
status: 'in-review'
baseline_revision: 'd180732acc549285ffa8494525776717a490a39b'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/AGENTS.md'
warnings: ['batched', 'oversized', 'multiple-goals']
batched_reason: 'Story 18.2 is the route and sink Story 18.1 flushes to; one kernel contract binds both, and the e2e of 18.1 needs the route (launch prompt: build 18.1 and 18.2 together). Implementation runs at the higher effort (18.1 high; 18.2 medium).'
deferred:
  - summary: >-
      The per-device telemetry limit keys on the client-chosen device_id, so one user can spread events over many ids.
    evidence: |-
      apps/api/src/http/telemetry.ts consumes `${userId}:${device_id}` per group; the DoR names a per-device limit; a per-user aggregate would close it.
    location: >-
      apps/api/src/http/telemetry.ts
    severity: low
  - summary: >-
      Keyboard activation through React Aria usePress may fire no native click, so the document listener records no action.
    evidence: |-
      apps/web/src/telemetry/instrument.ts listens to capturing click and pointerdown only; tablets tap, so the funnel is mostly covered.
    location: >-
      apps/web/src/telemetry/instrument.ts
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Nothing records how engineers use the app (navigation, cancels, retries, disabled taps, waits, errors), so the friction of the field workflow is guessed (Epic 18, AD-28). The op log must stay the record of changes only.

**Approach:** A strict kernel event contract (`contract/telemetry.ts`); a device queue (`ux_events`, Dexie v7) filled by a never-throwing `track()` and by `data-telemetry` attributes on the funnel's controls; a flush after each sync cycle and on tab hide; `POST /api/telemetry` that validates, stamps identity from the session and writes to a sink (`stdout` default, `cloudwatch` in production); Terraform for the log group, IAM and env; a Conta notice.

## Boundaries & Constraints

**Always:**
- Binding text: `epics.md` Epic 18 intro (event contract, minimum instrumentation), Stories 18.1 and 18.2 with their Definition of Ready; AD-28 in the spine. Contract stays 28: no `CONTRACT_VERSION` bump, no op, no seed, no SQL migration.
- Events never enter `outbox`, `remote_ops`, `entities`, `applyOp`, or any kernel status/count. `apps/web` derives nothing from an event.
- No free text in any event: every string field is from a closed list, a pattern (`target`, `app_version`), a uuid or an ISO instant. `track()` parses each built event with `uxEventSchema` and silently drops one that fails (so one bad event never poisons a 200-event batch).
- `track()` never throws, never returns a promise the caller must await (returns `void`), never logs to the console.
- Flush rules (DoR, binding): batches of at most `TELEMETRY_BATCH_MAX` (200); delete the batch on 2xx and on any 4xx; keep it on 5xx and on a network failure; one flush in flight at a time (a second call while one runs is a no-op). Beacon path on `visibilitychange` to `hidden`: `navigator.sendBeacon(TELEMETRY_ROUTE.path, new Blob([json], {type: 'application/json'}))`; delete the sent rows only when it returns `true`.
- Api: whole batch refused `400 telemetry_invalid` (new code appended last to `errorCodeSchema`) when the body is not an array, has more than 200 items, or any item fails `uxEventSchema`; nothing reaches the sink then. Before parsing, the route removes the server-stamped keys `received_at`, `user_id`, `company_id` from each item (Story 18.2 AC: a body value is ignored); then every item is parsed strictly. Valid: stamp `received_at` (server clock), `user_id`, `company_id` from the session, sink, answer `204`. A sink failure is logged once per batch (`logError('ux_event_sink_failed', {count})`) and the route still answers 204. The request log line stays as today (method, path, status, duration, company_id): no event content.
- Kernel owns every list and mapping (`screenOf`, names, kinds); pt-BR only for the Conta sentence, in `apps/web/src/copy/pt-br.ts`, marked `// authored (Epic 18, open for Bruno)`, product name through `PRODUTO`.
- Red first for every new test; mutation runs for the flush rules and for the schema's refusal of free text (report in the HANDOFF/PR notes).

**Never:**
- No `plan`/`apply`/AWS call; Terraform is validated offline only (`TF_OFFLINE=1`).
- No analytics SDK, no cookie, no CloudWatch RUM, no new compose service, no rebuilt `app-api`/`app-tools` image (the new dependency installs into the mounted workspace).
- No text, caption, TAG, name, photo, typed value, route path or query string in an event; ids only from route params and only when they parse as uuid v7.
- No change to the op fold, the commit path (`db/commit.ts`, outbox), or a live query on the ficha.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid batch | 1..200 valid events, signed in | 204; sink gets each event + `received_at`, `user_id`, `company_id` | none |
| Invalid item | one event with unknown key / name / screen / kind / outcome, bad `target`, negative or fractional `duration_ms`, free-text string | 400 `telemetry_invalid`; sink untouched | device drops the batch (4xx) |
| Too many / not array | 201 events; `{}`; empty body | 400 `telemetry_invalid` | device drops |
| Empty array | `[]` | 204, sink not called | none |
| No session | any body | 401 (session middleware) | device drops (4xx rule; open question Q1) |
| Rate limit | > 1000 events in a minute for one device+user | 429 `rate_limited` with `retry-after`; next window accepted | device drops (4xx rule) |
| Sink failure | `cloudwatch`, PutLogEvents throws | logged once with `count`; 204 | none |
| Queue cap | 5000 rows, 1 more tracked | oldest row deleted, new one stored, no console output | swallow |
| Before device id | `track()` before the user's db and device id are known | in-memory buffer, max 50 (oldest dropped), moved into `ux_events` when configured | swallow |
| Flush 5xx / network | fetch rejects or answers 500 | rows kept | swallow |
| Flush in flight | second `flush()` while one runs | no second request; same rows never posted twice | none |

</intent-contract>

## Code Map

- `packages/domain/src/contract/index.ts` -- add `export * from './telemetry.ts'`; `ACCOUNT_ROUTES`/`ApiRoute` live here (put `TELEMETRY_ROUTE` in telemetry.ts typed `satisfies ApiRoute`, or beside `ACCOUNT_ROUTES`; avoid an import cycle).
- `packages/domain/src/contract/errors.ts` -- `errorCodeSchema`: append `'telemetry_invalid'` last; grep `contract.test.ts` for any test pinning the list.
- `packages/domain/src/ids.ts:9` -- `uuidV7Schema = z.uuidv7()`; reuse for `relatorio_id`, `block_id`.
- `apps/api/src/http/app.ts` -- `createApp`: mount telemetry routes after `sessionMiddleware` (line ~`app.use('/api/*', sessionMiddleware(...))`); add `AppOptions.telemetry?: { sink?: TelemetrySink; limit?: RateLimitRule }`. Request logger at the top already logs no body.
- `apps/api/src/http/rate-limit.ts` -- `FixedWindowLimiter.consume(key)` counts 1; extend to `consume(key, cost = 1)` (existing callers unchanged); reuse `tooMany` shape (`rate_limited` + `retry-after`): export it or replicate exactly.
- `apps/api/src/http/account.ts` -- pattern for a route module (`requireSession`).
- `apps/api/src/log.ts` -- `log('ux_event', fields)` is the stdout sink line; `logError` for the sink failure.
- `apps/api/src/config.ts` -- add `TELEMETRY_SINK: enum(['stdout','cloudwatch']).default('stdout')` (with `unsetWhenEmpty`), `TELEMETRY_LOG_GROUP` optional string; superRefine: `cloudwatch` requires `TELEMETRY_LOG_GROUP`. `config.test.ts` covers it.
- `apps/api/src/main.ts:106-116` -- build the sink from config (`cloudwatch`: `new CloudWatchLogsClient({})`, default credential chain, region from `AWS_REGION`) and pass it to `createApp`.
- `apps/api/package.json` -- add `"@aws-sdk/client-cloudwatch-logs": "3.1134.0"` (exact, like client-s3); update `pnpm-lock.yaml` with `pnpm install` inside the tools container (frozen lockfile in `Dockerfile.prod`).
- `apps/api/src/sync/*.integration.test.ts` -- pattern for an api integration test with a signed-in session against compose Postgres.
- `apps/web/src/db/schema.ts:165-232` -- `VERSIONS` append-only; add v7 `{ ux_events: '++id, ts' }`, `upgrade: stamp(7)`; add `ux_events!: Table<UxEventRow, number>`; `schema.test.ts` has the upgrade/"outbox survives upgrade" pattern.
- `apps/web/src/db/device-id.ts` -- `deviceId(db, newId)`; `SyncProvider` resolves it into `device` state (`state/sync.tsx:293`).
- `apps/web/src/state/sync.tsx` -- `SyncProvider`: `status.lastResult` goes `null` then `'ran'` per cycle (`sync/engine.ts:598-650`), `status.lastFailure` (kinds incl. re-auth), `status.outdated`; `syncNow`, `generate`, `preview` callbacks (~line 388-453) are the wait points for sync/preview/generate. Flush after a cycle whose `lastResult === 'ran'`; configure the telemetry sink (`db`, `device`) here and clear it on unmount/db change.
- `apps/web/src/surfaces/app-shell.tsx:63-70` -- `useLocation`/`useParams`: `screen_view` on pathname change; `session_start` once per app load (module-level guard, also in `main.tsx` if cleaner).
- `apps/web/src/app.tsx:127-211` -- route table, source for `screenOf` cases.
- Funnel controls (add `data-telemetry`): `surfaces/home/relatorio-card.tsx` (card open, continue, summary), `surfaces/home/home-surface.tsx` (new relatório), `surfaces/home/status-board.tsx` (status chip), `surfaces/home/shortcut-row.tsx` (templates, cadastros); Sumário open-sheet/preview/generate/export in `surfaces/relatorio/` (`generate-action.tsx`, tree rows); ficha in `surfaces/ficha/` (`read-display.tsx`, `ficha-header.tsx`, `checklist-section.tsx`, `ficha-surface.tsx`, `reading-line.tsx` for "Digitar"/"Tentar novamente"); "Sincronizar agora" in `surfaces/app-shell.tsx` and `surfaces/sync/sync-status-surface.tsx`; dialogs `surfaces/photos/capture-sheet.tsx`, `surfaces/relatorio/move-block-dialog.tsx`, `surfaces/ficha/ficha-dialogs.tsx` (rename TAG, not tested), `surfaces/export/export-dialog.tsx`, `surfaces/sync/conflict-dialog.tsx`; "Desfazer" in `state/toast.tsx`/`state/status-toaster.tsx`; reading arrival in `state/reading-arrivals.tsx`.
- `apps/web/src/surfaces/account/account-surface.tsx` (+ `account-surface.test.tsx`) and `apps/web/src/copy/pt-br.ts:42-121` -- the "Uso do aplicativo" section, same `<section className="section">` pattern as the others.
- `apps/api/Dockerfile.prod:35` and `infra/bin/deploy:164` -- `ARG VITE_APP_VERSION=dev` in the web build stage and `--build-arg VITE_APP_VERSION=$tag` on the api image build.
- `infra/production/ecs.tf:32-55` (`local.api_environment`), `iam.tf:66-90` (app role, `app_files` policy pattern), `storage.tf:130` (`aws_cloudwatch_log_group.this` pattern), `variables.tf`, `infra/README.md` § Cost (table at ~131) and runbook sections.
- `e2e/support/outbox.ts:188` -- `readStore(page, database, store)`; `e2e/support/sync.ts` for "Sincronizar agora"/offline helpers; `e2e/support/palette.ts` shows reading a kernel list in a spec.
- `docs/kbs/architecture/sync.md`, `docs/kbs/log.md` -- KB lines.

## Tasks & Acceptance

**Execution (in order):**
- `packages/domain/src/contract/telemetry.ts` (+ `telemetry.test.ts`, red first) -- `UX_EVENT_NAMES`, `SCREENS`, `WAIT_KINDS`, `READING_RESULT_KINDS`, `SYNC_RESULT_KINDS`, `UX_OUTCOMES`, `TELEMETRY_TARGET_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,63}$/`, `uxEventSchema` (strict; `v: z.literal(1)`, `ts: z.iso.datetime()`, `session_id`/`device_id: z.uuid()`, `app_version` `^(dev|[0-9a-f]{7,40})$`, `duration_ms` int >= 0, `relatorio_id`/`block_id` uuid v7; `kind` checked per `name` with a refinement: `wait`/`reading_result`/`sync_result` from their lists, `error` from `errorCodeSchema.options`, any other name carries no `kind`), `UxEvent` type, `screenOf(pathname)`, `TELEMETRY_ROUTE`, `TELEMETRY_BATCH_MAX = 200`, `telemetryBatchSchema` (array, max 200). Export from `contract/index.ts`; `telemetry_invalid` in `errors.ts`.
- `apps/api/src/telemetry/sink.ts` (+ `sink.test.ts` with a fake client) -- `TelemetrySink` interface `write(events: StampedUxEvent[]): Promise<void>`; `stdoutSink` (one `log('ux_event', event)` per event); `cloudWatchSink({client, logGroup, now, pid})`: stream `api/<start ISO>/<pid>` created lazily once (`CreateLogStreamCommand`; an "already exists" error counts as created), one `PutLogEventsCommand` per batch with one JSON line per event (`timestamp` = event `ts` ms, events sorted by timestamp as PutLogEvents requires); a failed put/create is logged once with `count` and swallowed.
- `apps/api/src/http/telemetry.ts` (+ `telemetry.integration.test.ts`, red first) -- route per Boundaries; limiter `new FixedWindowLimiter({max: 1000, windowMs: 60_000})` consumed with cost = events per `device_id` group, key `${userId}:${device_id}`; registered in `http/app.ts`; config + main wiring; `rate-limit.ts` `cost` param with a unit test.
- `apps/web/src/db/schema.ts` -- v7 `ux_events`; upgrade test (v6 db with outbox rows opens at v7, rows intact, `ux_events` empty).
- `apps/web/src/telemetry/track.ts` (+ test) -- `configureTelemetry({db, deviceId} | null)`, `track(partial)` builds `{v:1, ts, session_id, device_id, app_version, ...partial}`; `app_version` from `import.meta.env.VITE_APP_VERSION ?? 'dev'`; session id minted once per module load; writes fire-and-forget with all errors swallowed; cap 5000 oldest-dropped; pre-config buffer 50.
- `apps/web/src/telemetry/flush.ts` (+ test with fake `fetch` and fake `sendBeacon`) -- `flushTelemetry(db)` and `beaconTelemetry(db)` per Boundaries; beacon payload also capped at 60 000 bytes (sendBeacon's 64 KiB quota), taking the oldest events that fit.
- `apps/web/src/telemetry/instrument.ts` (+ component test) -- one document-level capturing `click` listener: `closest('[data-telemetry]')` enabled -> `action` (or the name in `data-telemetry-event`, `retry` or `undo`), with `screen` from `screenOf(location.pathname)`; one capturing `pointerdown` listener: on a `[data-telemetry]` that is `disabled` or `aria-disabled="true"` -> `disabled_tap`. Installed once from the shell. `visibilitychange` hidden -> `beaconTelemetry`.
- Instrumentation -- `session_start` on boot, `screen_view` per pathname change (ids from params only); `data-telemetry` on every minimum-list control and dialog; `dialog_open`/`dialog_cancel` for the six dialogs; `wait` (reading, sync, preview, generate) with `duration_ms` and `outcome`; `sync_result` per finished cycle; `reading_result` (`kind`, `outcome`) when a reading lands; `error` with the code when an api error code reaches the user (dead op, failed generate/preview/reread).
- `apps/web/src/copy/pt-br.ts` + `account-surface.tsx` (+ test) -- section "Uso do aplicativo", sentence `usageNote: (produto) => 'Este aparelho registra as telas abertas, os toques, as esperas e os erros, nunca o que é digitado, e os guarda por 90 dias para melhorar o ${produto}.'` marked `// authored (Epic 18, open for Bruno)`.
- `infra/production/telemetry.tf`, `variables.tf`, `ecs.tf`, `infra/README.md`; `apps/api/Dockerfile.prod`, `infra/bin/deploy` -- per launch prompt (group, retention var 90, IAM statement on group ARN and `${arn}:*`, env entries, cost row about USD 0.10, runbook line; app version build arg).
- `e2e/usage-events.spec.ts` (`@p1`) -- offline: Home, a relatório, a sheet, mark an item, open and cancel the capture sheet; `readStore(..., 'ux_events')` holds `session_start`, `screen_view`s, `action`, `dialog_open`, `dialog_cancel`; online, tap "Sincronizar agora"; record every `POST /api/telemetry` (request body + response status) via `page.on('requestfinished')`; assert every response 204, every posted event parses with `uxEventSchema` (imported from the kernel), the posted set covers the queued ids' events, and `ux_events` is empty after.
- Docs -- `docs/kbs/architecture/usage-events.md` (new concept) linked from `docs/kbs/architecture/index.md`, `docs/kbs/log.md` line; `deferred-work.md` entry for anything narrowed.

**Acceptance Criteria:**
- Given the kernel, when `uxEventSchema` parses, then it accepts the epic's shape and refuses each case in the matrix; `screenOf('/relatorio/<id>/ficha/<id>') === 'ficha'`, `screenOf('/') === 'home'`, unknown -> `other`.
- Given the app boots and the user navigates, then `ux_events` holds one `session_start` with `app_version` and one `screen_view` per route change carrying only `relatorio_id`/`block_id` from params.
- Given a `data-telemetry` control disabled, when tapped, then a `disabled_tap` with its target is queued (component test).
- Given queued events online, when a cycle ends `ran` or the tab hides, then batches of at most 200 go to `/api/telemetry` and rows follow the delete/keep rules; never posted twice concurrently.
- Given a signed-in POST, then 204 / 400 / 429 per the matrix and the stdout sink line carries the stamped fields; `TELEMETRY_SINK=cloudwatch` puts once per batch on the named group and stream.
- Given Conta, then the "Uso do aplicativo" row shows the authored sentence with `PRODUTO`.
- Given `infra/`, then `fmt -check`, `init -backend=false`, `validate` pass offline.

## Spec Change Log

## Review Triage Log

### 2026-10-29 — Review pass
- layers: Edge Case Hunter, Verification Gap Reviewer (Blind Hunter and Intent Alignment skipped: token economy; the integrated epic review covers them)
- verdicts: 19 findings — high 0, medium 9, low 8, false 2, maybe-false 0
- findings:
  - `[medium]` `[patch]` ECH-1 CloudWatch batch spanning more than 24 h refused whole after a 204 — sink timestamps every log event with the batch's `received_at`; the device `ts` stays in the message.
  - `[medium]` `[patch]` ECH-2 events older than 14 days or over 2 h ahead dropped silently — same fix as ECH-1.
  - `[low]` `[patch]` ECH-3 stream gone after creation leaves every later put failing — `ResourceNotFoundException` resets the created flag.
  - `[low]` `[defer]` ECH-4 a client can spread events over many `device_id` values to pass the per-device limit — the DoR names a per-device limit; only signed-in users can post; deferred-work row.
  - `[low]` `[reject]` ECH-5 a refused multi-device batch still spends the first device's window — a device posts its own id only; no real client sends two ids.
  - `[medium]` `[patch]` ECH-6 readings captured and landed between two looks never tracked — a photo absent from the last look and captured after it counts as pending.
  - `[medium]` `[patch]` ECH-7 Export dialog closed after a successful generate tracked as `dialog_cancel` — cancel not tracked once the generate succeeded.
  - `[low]` `[patch]` ECH-8 "Sincronizar agora" wait on a 426 cycle reads `ok` — `refused` when the engine is outdated.
  - `[false]` `[reject]` ECH-9 deploy with a custom `--tag` maps the version to `dev` — `infra/bin/deploy` refuses a build whose tag is not HEAD's sha (line 95), so a built image always gets the sha.
  - `[medium]` `[defer]` ECH-10 keyboard presses through React Aria `usePress` may fire no native click, so no `action` — narrowing already recorded by the implementation; tablets tap; deferred-work row.
  - `[false]` `[reject]` ECH-11 `sync_result` offline tracked only on the transition — Design Notes D7 decides it.
  - `[medium]` `[patch]` VG-1 SyncProvider waits, errors and offline transition untested — component test added.
  - `[medium]` `[patch]` VG-2 per-surface `data-telemetry` names unguarded — a unit test asserts every `UX_ACTION_TARGETS`/`UX_DIALOG_TARGETS` name occurs in the web sources; per-surface press tests stay with the e2e's sample.
  - `[low]` `[patch]` VG-3 Toast "Desfazer" undo wiring untested — case added to `toast.test.tsx`.
  - `[medium]` `[patch]` VG-4 production sink choice in `main.ts` untested — `telemetrySinkOf(config)` extracted and tested.
  - `[medium]` `[patch]` VG-5 (other) CloudWatch limits — duplicate of ECH-1/2.
  - `[low]` `[reject]` VG-6 (other) refused multi-device batch spends the limit — duplicate of ECH-5.
  - `[low]` `[reject]` VG-7 (other) stale `lastFailure` after a cycle cut offline makes the sync wait `fail` — rare (offline mid-cycle right after a failed one) and the fix needs the engine to publish the cycle's own failure, more than a direct correction.
  - `[low]` `[patch]` VG-8 (other) orphaned doc comment above `failureCode` — moved.

## Design Notes

Decisions where the stories are silent (listed in the PR for the coordinator's veto):
- D1 e2e evidence: no test-only route or in-memory sink. The spec observes the device's own `POST /api/telemetry` requests and their 204 answers (the route answers 204 only after every event parsed and the sink was called), parses each posted event with the kernel schema, and checks the queue emptied. The api integration tests prove what the sink receives.
- D2 the telemetry limit is always on (1000 events a minute per `user:device`, cost = event count), not gated by `RATE_LIMIT`, since it is a story AC and a gate cannot hit it.
- D3 Story 18.1 says the schema refuses any unknown key; Story 18.2 says a `user_id`/`company_id` in the body is ignored. Both hold: the route strips the three server-stamped keys from each item, then parses strictly (any other unknown key still refuses the batch).
- D4 `kind` is checked per `name`; `error`'s kind is an `errorCodeSchema` code.
- D5 `screenOf`: `/login` login, `/` home, `/project/:id` project, `/relatorio/:id` and `/arvore` sumario, `/setup` setup, `/ficha/:blockId` ficha, `/local/:id/verificacoes` local, `/fotos` gallery, ~~`/pontos` photos (section 8)~~ `/pontos` points (2026-10-29, coordinator: `points` added to `SCREENS`, section 8 is a funnel step of its own), `/secao/:blockId` other, `/templates` templates, `/templates/:id` composer, `/cadastros`, `/sync`, `/account`; `recovery` and `update` are tracked by those surfaces when shown; anything else `other`. `export` is the export dialog's screen when tracked from it.
- D6 `retry`/`undo` events come from `data-telemetry-event` on the control; `reading.retry` emits `retry` (not also `action`).
- D7 `sync_result` `offline` is tracked only on a transition into offline (the 60 s tick would otherwise write one row a minute); `busy`/`paused` cycles track nothing.
- D8 beacon payload capped at 60 000 bytes.
- D9 `app_version` injected through `Dockerfile.prod` and `infra/bin/deploy` (`VITE_APP_VERSION=$tag`); `dev` elsewhere.
- D10 no `epic-18-context.md` was compiled (token economy); the launch prompt, `epics.md` Epic 18 and AD-28 are the context.

Open questions: Q1 a `401`/`429` drops the batch (DoR: every 4xx); keeping on 401 would lose nothing on an expired session. Q2 the Conta sentence wording, for Bruno.

## Verification

**Commands (tools container, under the host lock, logs in `.scratch-o18a/`):**
- `podman compose --profile tools run --rm --user root tools pnpm lint` / `static` / `test:unit` / `test:api` -- expected: green
- `podman compose --profile tools run --rm --user root tools pnpm exec tsx scripts/e2e.ts e2e/usage-events.spec.ts <touched specs> --project desktop-chrome --project durability-desktop-chrome` -- expected: green
- `TF_OFFLINE=1 infra/bin/tf production fmt -check`, `init -backend=false`, `validate` -- expected: success

**Host rules (this macOS host, batch o18a; binding for every command):**
- Worktree `/Users/matheusvilella/Documents/estudos/fasor-app-o18a`; never run pnpm/node/terraform on the host. `docker` is absent: `podman compose`. Stack `fasor-o18a` (postgres, minio, api) is up; restart the api after any change under `packages/domain` or `apps/api` (`podman compose restart api`) before `test:api` or an e2e. Keep `web` stopped.
- Tools container: `podman compose --profile tools run --rm --user root tools pnpm <stage>`. New dependency: `podman compose --profile tools run --rm --user root tools pnpm install` (never rebuild an image).
- Every stage run and every Playwright run goes under the host lock, started with `nohup` in the background and polled (another batch shares the host): `nohup sh -c 'lockf -t 20000 /tmp/fasor-verify.lock sh -c "podman compose --profile tools run --rm --user root tools pnpm test:unit -- <path>"; echo EXIT=$?' > .scratch-o18a/<name>.log 2>&1 &`, then poll `grep EXIT= .scratch-o18a/<name>.log` in short calls (at most 60 s each) and read only the tail. Narrow runs while iterating (`pnpm test:unit -- <path>`, one api test file, one spec with `--grep`). Never `pkill` by pattern. Logs only in `.scratch-o18a/`.
- Commits: WIP commits allowed, message trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Do not push, do not open a PR, do not edit `sprint-status.yaml` or `epics.md`.
