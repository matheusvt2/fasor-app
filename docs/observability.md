# Observability: reading how the app is used

Story 18.3 (2026-10-29), on the usage events of AD-28 (Epic 18). This runbook says where the funnel is read, what each view tells, how a new event name is added, what is kept and for how long, and how the monthly friction digest is made.

## Where the events are

Every device queues usage events in its own IndexedDB table (`ux_events`, Story 18.1) and ships them with the sync cycle to `POST /api/telemetry`. In production the api writes one JSON line per event to the CloudWatch Logs group `/fasor/production/ux-events` (Story 18.2). Each line holds only the event fields of the kernel contract (`packages/domain/src/contract/telemetry.ts`): `name`, `screen`, `target`, `kind`, `outcome`, `duration_ms`, `session_id`, `device_id`, `ts`, `app_version`, `relatorio_id`, `block_id`, plus `received_at`, `user_id` and `company_id` stamped by the api from the session. The events never enter the op log.

Locally and in the tests the sink is `stdout` (`TELEMETRY_SINK=stdout`): the events appear as `ux_event` lines in the api's own log, and there is no dashboard.

## Opening the dashboard and the saved queries

Both exist only after the production Terraform apply that follows the Epic 18 merges (`infra/production/observability.tf`). They exist since the deploy of `3b45e83c` on 2026-10-30, when the nine queries first ran to `Complete` over production events (`_bmad-output/implementation-artifacts/epic-18-context.md`).

1. Sign in to the AWS console with the `fasor-admin` login (passkey MFA; the same account `infra/bin/aws` uses), region **us-east-1**.
2. **Dashboard:** CloudWatch > Dashboards > `fasor-production-ux`. It opens on the last 7 days; the time picker widens it up to the 90 days the group keeps. Each widget runs its query when the page opens.
3. **Saved queries:** CloudWatch > Logs Insights > Saved queries, folder `fasor-production-ux`. Each one opens on the group `/fasor/production/ux-events`; change the window, add a `filter` (for example `filter app_version = '<sha>'` or `filter company_id = '<id>'`) and run.

The ~~nine~~ ten views *(2026-10-30, E18-A2: the `users` view joined the nine)* are the same text in the widget and in the saved query (the widget adds `SOURCE '/fasor/production/ux-events' |` in front). *(2026-11-03, E18-A2, batch e18fb: the group name comes from the group's own Terraform resource, the one the api writes to, and `scripts/telemetry-queries.test.ts` binds every name, kind, outcome, screen and field the queries read to the kernel's closed lists.)*

*(2026-11-03, E18-A2, batch e18fb.)* Two facts hold for every view below. **The smoke company is filtered out:** each query but `users` starts with `filter company_id != '<smoke company id>'` (`var.smoke_company_id`), so the production smoke that runs after every deploy is never counted as use; the `users` view keeps it and labels it `smoke`. **The window is receipt time:** the dashboard's time picker and a saved query's window select events by `@timestamp`, which is the batch's `received_at` (the api's clock when the device shipped the event, which can be hours after it happened on an offline device); only `sessions_per_day` groups by the device's own day (`ts`).

## The ~~nine~~ ten views and what a reader concludes

*(2026-11-03, batch e18fb: every view below leaves the smoke company out except `users`, which labels it `smoke`; see the paragraph above.)*

**`funnel`: screen views and sessions per screen (bar).** How many times each screen was opened and in how many sessions. Read it top to bottom as the path Home, relatório (`setup`, `sumario`), ficha, photos, export: a screen far below the one before it is where people stop or go around. A `sessions` count close to `views` means a screen is opened once per session; a much larger `views` means people come back to it, which may be work or may be getting lost.

**`actions`: actions, retries and undos by screen and target (table).** Which controls are pressed, where, and how often a `retry` or an `undo` follows them. A control with many `undo` beside it is being pressed by mistake or does something unexpected; many `retry` on `reading.retry` or `sync.now` point at a flow that fails. `home.shortcut_templates` and `home.shortcut_cadastros` per session are the Home navigation measure of the 2026-10-29 analysis.

**`dialogs`: dialogs opened against cancelled (table).** Per dialog (`capture_sheet`, `move_block`, `rename_tag`, `export`, `not_tested`, `conflict`), opens and cancels. A dialog cancelled most of the times it opens is either reached by mistake or asks something people cannot answer there.

**`disabled_taps`: taps on disabled controls (bar).** A control pressed while disabled is a control people expect to work. The top of this list is where the app does not say why something is unavailable, or says it too far from the control.

**`waits`: waits p50 and p95 by kind (table).** How long people wait for a `reading`, a `sync`, a `generate`, a `preview` and an `upload`. The p95 is what the slowest one in twenty felt; a p95 several times the p50 means the wait is unpredictable, which hurts more than a steady slow one. *(2026-10-30, first production read: `preview` and `generate` time the request that enqueues the document, not the wait until it opens; the first preview took 26.8 s on the screen and 176 ms here. Read those two kinds as request latency until the device times them to the document; `reading` and `sync` are the wait the user felt. Ledger row in `deferred-work.md` § Epic 18 batch o18a.)* *(2026-11-03, batch e18fb: a `reading` wait counts from the shot (`captured_at`), not from the moment the reading was asked, so time the device spent offline and a failed first attempt before a retry both inflate it; read a long `reading` p95 beside the `syncs` view's `offline` share and the `actions` view's `reading.retry`.)*

**`readings`: readings by kind and outcome (table).** Per reading kind (`plate`, `display`, `caption`, `panel`, `nc_obs`), how many ended `ok`, `fail`, `cancel`, `refused`, `timeout` or `offline`. A kind that fails often is where people type instead (compare with the op-log friction read below).

**`syncs`: sync cycles by result (bar).** `ran` against `offline`, `contract_outdated`, `unauthorized` and `failed`. Many `offline` is the field reality; `contract_outdated` after a deploy means devices are slow to update; `failed` or `unauthorized` need a look at the api log. *(2026-11-03, batch e18fb: the device records one `sync_result` per cycle it ran, and it runs one every 60 s while the app is visible and every 5 s while a reading is pending, so the raw counts measure how long the app stayed open more than how often people synced; read the view as ratios between the results, never as a count of syncs.)*

**`sessions_per_day`: sessions, devices and users per day (bar).** How many app loads, how many distinct devices and *(2026-10-30, E18-A2)* how many distinct users a day. It is the denominator of the other views: a drop in a count on a day with few sessions is not a change of behaviour. *(2026-11-03, E18-A2, batch e18fb: ~~the day is the receipt day (`bin(1d)` over `@timestamp`)~~ the day is the device's day, the first ten characters of the event's `ts` (`device_day`, UTC), so a session queued offline on Monday and shipped on Tuesday counts on Monday; the window still selects by receipt time, so a day at the window's left edge can be short.)*

**`errors`: errors by screen and kind (table).** The kernel error codes users saw, by screen. A code that repeats on one screen is a bug or a missing guard there; read the api log of the same window for the cause.

**`users`: sessions, devices, events and last activity by user and company (table).** *(2026-10-30, E18-A2, Matheus: "controlar os usuários logados".)* Who used the app in the window: one row per user and company with its sessions, devices, events, first and last activity, most recent first. The events carry the opaque id (as Conta says); the view labels it with the short name the operator keeps for that id in the untracked `infra/production/terraform.tfvars` (`user_names = { "<user id>" = "<name>" }`, applied with `infra/bin/tf production apply`; the smoke company reads `smoke`), so a user not yet in that map shows as an id until the map is updated (the CLI of the section "Mapping user ids to people" below gives the id, name and e-mail). The names live in the operator's AWS account only, never in the repository (it is public) and never in the events. With three engineers, a friction pattern in another view is often one person's habit or one device's problem: read this view first, then filter the others with `filter user_id = '<id>'`. *(2026-11-03, batch e18fb: this is the one view that keeps the smoke company, so the deploys' smoke runs show here as the `smoke` row and nowhere else.)*

## Mapping user ids to people

*(2026-10-30, E18-A2.)* `apps/api/src/db/users-read-cli.ts` reads the `user`, `company` and `session` tables (read-only, one SELECT) and prints one JSON line per user with `company_id`, `company_name`, `user_id`, `name`, `email`, `created_at`, `sessions` (sign-ins ever) and `last_session_at`, then a closing count; `--company <id>` limits it to one company. *(2026-11-03, first production run: `sessions` counts the sign-ins still on record and `last_session_at` is when the newest of them was opened, not the last activity: a session lives 30 days with a daily refresh, so one can span weeks of use, and the smoke user always reads 0 because the smoke reset and cleanup revoke its sessions; for who was active when, read the dashboard's `users` view.)* The usage events keep the user as an id; this output is account data the administrator already holds, written to the migrate log group (kept 14 days) and never into the events group. In production it runs as a command override on the migrate task (`infra/README.md`, runbook "Map the user ids of the usage dashboard to people"; the image carries it from the first deploy after 2026-10-30). Locally:

```sh
podman compose --profile tools run --rm tools \
  pnpm exec tsx apps/api/src/db/users-read-cli.ts [--company <company id>]
```

## Adding an event name

The vocabulary is closed on purpose, so a new event or target is a code change in three places, in this order:

1. **Kernel first:** add the name, the `kind` or the `screen` to the closed lists in `packages/domain/src/contract/telemetry.ts`, with its red-first kernel test. The schema refuses anything else, so nothing the device sends can carry it before this step.
2. **The control:** give the control a `data-telemetry="<surface>.<control>"` attribute (the pattern `^[a-z0-9][a-z0-9_.-]{0,63}$`), or call `track()` where the event happens (a wait, a result). The attribute is the one source of a control's `target`.
3. **The query:** add or extend a query in `local.ux_queries` of `infra/production/observability.tf` (a new key adds a widget and a saved query; append the key to `local.ux_query_order`), then `infra/bin/check` offline and the production apply after the merge. *(2026-11-03, batch e18fb: start the query with `${local.ux_smoke_filter}` unless it is meant to show the smoke company, and run `scripts/telemetry-queries.test.ts`, which fails naming any event, kind, outcome, screen or field the kernel does not have.)*

*(2026-11-03, batch e18fb.)* **The lists are append-only within a release.** A name, kind, target or screen is never removed or renamed while devices may still hold events that carry it: the api validates every event of a batch against the kernel it was built with, so an event with a name the new kernel no longer has makes the whole device batch `400 telemetry_invalid`, and the device drops that batch (review R-A2). Retire a name by no longer emitting it, and remove it from the kernel only in a later release, once the old bundles are gone.

## Retention and cost

The group keeps events **90 days** (`var.ux_events_retention_days`), then CloudWatch deletes them. Ingestion is about 50 MB a month (USD 0.50 per GB: about USD 0.03 to 0.10, booked on the group's row of `infra/README.md` § Cost). The dashboard (one of the three free ones) and the saved queries are free; each opening of the dashboard scans the window at USD 0.005 per GB, cents a month.

## LGPD

The events describe how employees use a work tool, not what they type: ids are opaque UUIDs, screens, controls, kinds and outcomes come from closed lists the schema enforces, and no free text (no typed value, caption, TAG, name, local or photo) can pass the schema. *(2026-11-03, batch e18fb: precisely, `name`, `screen`, `kind` and `outcome` are closed lists; a control's `target` is the `data-telemetry` attribute the code gives it, which the kernel checks against `TELEMETRY_TARGET_PATTERN` only (lower-case letters, digits, `_`, `.` and `-`, at most 64 characters), not against a list. The guard that no typed value reaches `target` is in the code: targets are written as constants in `data-telemetry` attributes, `UX_ACTION_TARGETS` and `UX_DIALOG_TARGETS` name the instrumented ones, and `targets.test.ts` checks the surfaces against them.)* *(2026-10-30, E18-A2: the dashboard's `users` view labels the ids with names kept in the operator's untracked tfvars; the events and the repository stay without them.)* Users are told in Conta, under "Uso do aplicativo" (Story 18.2), that the device records screens, taps, waits and errors without typed texts, kept 90 days, to improve the product.

## The op-log friction read

*(2026-11-03, batch e18fb: until the E18-A1 fix batch lands, the device writes of a block's structural fields (`location_id`, `order_key`, `removed_at`, `feeds_block_id`: moving, reordering, removing or re-feeding a block) count like any field edit, so they lengthen `span_ms`, add to `device_op_count` and can show as `fields_reedited`; read a sheet with a large span and few value edits as possibly reorganised, not slow.)*

The usage events say where people go; the op log already says how long the work took. `apps/api/src/db/friction-read-cli.ts` reads one company's `ops` and live `entities` (read-only, SELECTs only) and prints JSON lines with ids, closed keys and numbers only:

- `friction sheet`, one per live block of a live relatório: `block_type`, the first and last device op times (`client_ts`, the device clock), `span_ms`, `device_op_count`, `fields_reedited` (sheet or block field paths written two or more times by devices) and `typed_after_failed_reading` (display readings that failed and were followed by a device put on the cell the reading targeted).
- `friction relatorio`, one per live relatório: its `status` and the totals of its sheets.
- `friction company`, the totals of the company.

Server ops (`system:*`: reading suggestions, cleanups, seed moves) never count in a span. In production it runs as a command override on the migrate task and its output lands in `/fasor/production/migrate` (`infra/README.md`, runbook "Read the op-log friction of a company"). Locally:

```sh
podman compose --profile tools run --rm tools \
  pnpm exec tsx apps/api/src/db/friction-read-cli.ts --company <company id>
```

## The monthly digest

Once a month (the first one a month after the Epic 18 deploy):

1. Copy `_bmad-output/test-artifacts/friction-digest-template.md` to `_bmad-output/test-artifacts/friction-digest-<YYYY-MM>.md`.
2. Set the dashboard's window to the month, note the `app_version` values seen (`stats count(*) by app_version` in Logs Insights) and fill each section from the matching view.
3. Run the friction read for each company in use and fill its section from the `friction relatorio` and `friction company` lines (ids only; never paste a value from elsewhere). *(2026-11-03, batch e18fb.)* Check also that the month lost no events: in Logs Insights over `/fasor/production/api` for the month, `filter @message like /ux_event_sink_failed/ | stats count(*) as failures by bin(1d)` (or `infra/bin/aws logs filter-log-events --log-group-name /fasor/production/api --start-time <month start, epoch ms> --filter-pattern '"ux_event_sink_failed"' --query 'length(events)'`); any failure is a day whose views undercount, noted in the digest.
4. Write the decisions proposed, each tied to a number of the digest, and take them to Matheus (and to Bruno for anything on the screens) before any story is written.

## The deploy's usage-events check

*(2026-11-03, E18-A2, batch e18fb.)* `infra/bin/deploy` runs a smoke step `smoke: check the usage events` after the production suite and before the cleanup. With the deploy's own login and read-only calls (`logs filter-log-events`), it reads the two groups from the Terraform outputs `ux_events_log_group` and `api_log_group`, waits up to about two minutes for at least one `session_start` with `app_version` equal to the deployed tag since the deploy started (the suite's own browser loads the new bundle), counts the `ux_event_sink_failed` lines of the api group in the same window, and prints one line, `telemetry: N session_start with app_version <tag> since <start>; M ux_event_sink_failed`. It prints counts only, never an event. N = 0, M > 0 or a read error print `deploy: warning: ...` and leave the deploy's exit unchanged in this release; a ledger row makes it a failure after its first green production run. It is skipped with `--skip-smoke` and says `not run` when the suite did not run.
