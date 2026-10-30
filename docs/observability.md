# Observability: reading how the app is used

Story 18.3 (2026-10-29), on the usage events of AD-28 (Epic 18). This runbook says where the funnel is read, what each view tells, how a new event name is added, what is kept and for how long, and how the monthly friction digest is made.

## Where the events are

Every device queues usage events in its own IndexedDB table (`ux_events`, Story 18.1) and ships them with the sync cycle to `POST /api/telemetry`. In production the api writes one JSON line per event to the CloudWatch Logs group `/fasor/production/ux-events` (Story 18.2). Each line holds only the event fields of the kernel contract (`packages/domain/src/contract/telemetry.ts`): `name`, `screen`, `target`, `kind`, `outcome`, `duration_ms`, `session_id`, `device_id`, `ts`, `app_version`, `relatorio_id`, `block_id`, plus `received_at`, `user_id` and `company_id` stamped by the api from the session. The events never enter the op log.

Locally and in the tests the sink is `stdout` (`TELEMETRY_SINK=stdout`): the events appear as `ux_event` lines in the api's own log, and there is no dashboard.

## Opening the dashboard and the saved queries

Both exist only after the production Terraform apply that follows the Epic 18 merges (`infra/production/observability.tf`).

1. Sign in to the AWS console with the `fasor-admin` login (passkey MFA; the same account `infra/bin/aws` uses), region **us-east-1**.
2. **Dashboard:** CloudWatch > Dashboards > `fasor-production-ux`. It opens on the last 7 days; the time picker widens it up to the 90 days the group keeps. Each widget runs its query when the page opens.
3. **Saved queries:** CloudWatch > Logs Insights > Saved queries, folder `fasor-production-ux`. Each one opens on the group `/fasor/production/ux-events`; change the window, add a `filter` (for example `filter app_version = '<sha>'` or `filter company_id = '<id>'`) and run.

The nine views are the same text in the widget and in the saved query (the widget adds `SOURCE '/fasor/production/ux-events' |` in front).

## The nine views and what a reader concludes

**`funnel`: screen views and sessions per screen (bar).** How many times each screen was opened and in how many sessions. Read it top to bottom as the path Home, relatório (`setup`, `sumario`), ficha, photos, export: a screen far below the one before it is where people stop or go around. A `sessions` count close to `views` means a screen is opened once per session; a much larger `views` means people come back to it, which may be work or may be getting lost.

**`actions`: actions, retries and undos by screen and target (table).** Which controls are pressed, where, and how often a `retry` or an `undo` follows them. A control with many `undo` beside it is being pressed by mistake or does something unexpected; many `retry` on `reading.retry` or `sync.now` point at a flow that fails. `home.shortcut_templates` and `home.shortcut_cadastros` per session are the Home navigation measure of the 2026-10-29 analysis.

**`dialogs`: dialogs opened against cancelled (table).** Per dialog (`capture_sheet`, `move_block`, `rename_tag`, `export`, `not_tested`, `conflict`), opens and cancels. A dialog cancelled most of the times it opens is either reached by mistake or asks something people cannot answer there.

**`disabled_taps`: taps on disabled controls (bar).** A control pressed while disabled is a control people expect to work. The top of this list is where the app does not say why something is unavailable, or says it too far from the control.

**`waits`: waits p50 and p95 by kind (table).** How long people wait for a `reading`, a `sync`, a `generate`, a `preview` and an `upload`. The p95 is what the slowest one in twenty felt; a p95 several times the p50 means the wait is unpredictable, which hurts more than a steady slow one.

**`readings`: readings by kind and outcome (table).** Per reading kind (`plate`, `display`, `caption`, `panel`, `nc_obs`), how many ended `ok`, `fail`, `cancel`, `refused`, `timeout` or `offline`. A kind that fails often is where people type instead (compare with the op-log friction read below).

**`syncs`: sync cycles by result (bar).** `ran` against `offline`, `contract_outdated`, `unauthorized` and `failed`. Many `offline` is the field reality; `contract_outdated` after a deploy means devices are slow to update; `failed` or `unauthorized` need a look at the api log.

**`sessions_per_day`: sessions and devices per day (bar).** How many app loads and how many distinct devices a day. It is the denominator of the other views: a drop in a count on a day with few sessions is not a change of behaviour.

**`errors`: errors by screen and kind (table).** The kernel error codes users saw, by screen. A code that repeats on one screen is a bug or a missing guard there; read the api log of the same window for the cause.

## Adding an event name

The vocabulary is closed on purpose, so a new event or target is a code change in three places, in this order:

1. **Kernel first:** add the name, the `kind` or the `screen` to the closed lists in `packages/domain/src/contract/telemetry.ts`, with its red-first kernel test. The schema refuses anything else, so nothing the device sends can carry it before this step.
2. **The control:** give the control a `data-telemetry="<surface>.<control>"` attribute (the pattern `^[a-z0-9][a-z0-9_.-]{0,63}$`), or call `track()` where the event happens (a wait, a result). The attribute is the one source of a control's `target`.
3. **The query:** add or extend a query in `local.ux_queries` of `infra/production/observability.tf` (a new key adds a widget and a saved query; append the key to `local.ux_query_order`), then `infra/bin/check` offline and the production apply after the merge.

## Retention and cost

The group keeps events **90 days** (`var.ux_events_retention_days`), then CloudWatch deletes them. Ingestion is about 50 MB a month (USD 0.50 per GB: about USD 0.03 to 0.10, booked on the group's row of `infra/README.md` § Cost). The dashboard (one of the three free ones) and the saved queries are free; each opening of the dashboard scans the window at USD 0.005 per GB, cents a month.

## LGPD

The events describe how employees use a work tool, not what they type: ids are opaque UUIDs, screens, controls, kinds and outcomes come from closed lists the schema enforces, and no free text (no typed value, caption, TAG, name, local or photo) can pass the schema. Users are told in Conta, under "Uso do aplicativo" (Story 18.2), that the device records screens, taps, waits and errors without typed texts, kept 90 days, to improve the product.

## The op-log friction read

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
3. Run the friction read for each company in use and fill its section from the `friction relatorio` and `friction company` lines (ids only; never paste a value from elsewhere).
4. Write the decisions proposed, each tied to a number of the digest, and take them to Matheus (and to Bruno for anything on the screens) before any story is written.
