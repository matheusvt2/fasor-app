# Story 18.3 (2026-10-29): the usage dashboard over the usage events of AD-28.
#
# One CloudWatch dashboard `fasor-production-ux` with ten Logs Insights widgets (nine of Story
# 18.3 and, since 2026-10-30 (E18-A2, Matheus: "controlar os usuários logados"), the users
# view), and the same ten queries as saved query definitions (CloudWatch > Logs Insights >
# Saved queries). Both read the group the api writes to, `aws_cloudwatch_log_group.ux_events`
# of `telemetry.tf` (2026-11-03, E18-A2: no longer by its literal name, so a renamed group
# moves the dashboard, the saved queries and the api's TELEMETRY_LOG_GROUP together). Queries
# use only the event fields of AD-28 (`name`, `screen`, `target`, `kind`, `outcome`,
# `duration_ms`, `session_id`, `device_id`, `ts`, `app_version`, `relatorio_id`, `block_id`)
# and the server's `received_at`, `user_id`, `company_id`; `scripts/telemetry-queries.test.ts`
# binds every name, kind, outcome, screen and field they read to the kernel's closed lists
# (`packages/domain/src/contract/telemetry.ts`).
#
# 2026-11-03 (E18-A2): every view but `users` leaves the production smoke's company out
# (`var.smoke_company_id`; the `users` view labels it `smoke`), and `sessions_per_day` counts
# by the device's day (`ts`, the device clock) instead of the receipt time.
#
# Cost: dashboards (three of up to 50 metrics free a month) and query definitions are free;
# the Logs Insights scans (USD 0.005 per GB) run only when the dashboard is opened.
# `docs/observability.md` says how to read each view.

locals {
  ux_events_log_group = aws_cloudwatch_log_group.ux_events.name

  # Every view but `users` starts with it: the production smoke runs after each deploy and
  # would otherwise count as a user (E18-A2, 2026-11-03).
  ux_smoke_filter = "filter company_id != '${var.smoke_company_id}' | "

  # E18-A2 (2026-10-30): the users view shows names, not ids. The events carry the opaque id;
  # the label is computed in the query with one nested replace() per entry of var.user_names
  # (the operator's untracked tfvars), so an unknown user shows its id, and the smoke company
  # reads "smoke".
  ux_user_label    = "${join("", [for id in keys(var.user_names) : "replace("])}user_id${join("", [for id, name in var.user_names : ", '${id}', '${name}')"])}"
  ux_company_label = "replace(company_id, '${var.smoke_company_id}', 'smoke')"

  ux_queries = {
    funnel = {
      title = "Funnel: screen views and sessions"
      view  = "bar"
      query = "${local.ux_smoke_filter}filter name = 'screen_view' | stats count(*) as views, count_distinct(session_id) as sessions by screen | sort views desc"
    }
    actions = {
      title = "Actions, retries and undos by screen and target"
      view  = "table"
      query = "${local.ux_smoke_filter}filter name in ['action', 'retry', 'undo'] | stats count(*) as taps by name, screen, target | sort taps desc | limit 100"
    }
    dialogs = {
      title = "Dialogs opened and cancelled"
      view  = "table"
      query = "${local.ux_smoke_filter}filter name in ['dialog_open', 'dialog_cancel'] | stats sum(strcontains(name, 'dialog_open')) as opens, sum(strcontains(name, 'dialog_cancel')) as cancels by target | sort cancels desc"
    }
    disabled_taps = {
      title = "Taps on disabled controls"
      view  = "bar"
      query = "${local.ux_smoke_filter}filter name = 'disabled_tap' | stats count(*) as taps by screen, target | sort taps desc | limit 50"
    }
    waits = {
      title = "Waits p50 and p95 (ms)"
      view  = "table"
      query = "${local.ux_smoke_filter}filter name = 'wait' | stats count(*) as waits, pct(duration_ms, 50) as p50_ms, pct(duration_ms, 95) as p95_ms by kind"
    }
    readings = {
      title = "Readings by kind and outcome"
      view  = "table"
      query = "${local.ux_smoke_filter}filter name = 'reading_result' | stats count(*) as readings by kind, outcome | sort kind, outcome"
    }
    syncs = {
      title = "Sync cycles by result"
      view  = "bar"
      query = "${local.ux_smoke_filter}filter name = 'sync_result' | stats count(*) as cycles by kind | sort cycles desc"
    }
    # 2026-11-03 (E18-A2): by the device's day, the first ten characters of its ISO `ts`; the
    # dashboard's window still selects by the receipt time (`@timestamp` is `received_at`).
    sessions_per_day = {
      title = "Sessions, devices and users per day"
      view  = "bar"
      query = "${local.ux_smoke_filter}fields substr(ts, 0, 10) as device_day | stats count_distinct(session_id) as sessions, count_distinct(device_id) as devices, count_distinct(user_id) as users by device_day | sort device_day"
    }
    errors = {
      title = "Errors by screen and kind"
      view  = "table"
      query = "${local.ux_smoke_filter}filter name = 'error' | stats count(*) as errors by screen, kind | sort errors desc"
    }
    # E18-A2 (2026-10-30): who used the app. The user stays an opaque id in the events (the Conta
    # sentence stands); `apps/api/src/db/users-read-cli.ts` maps the ids to people for the digest.
    users = {
      title = "Users: sessions, devices, events and last activity by user and company"
      view  = "table"
      query = "fields ${local.ux_user_label} as usuario, ${local.ux_company_label} as empresa | stats count_distinct(session_id) as sessions, count_distinct(device_id) as devices, count(*) as events, earliest(received_at) as first_seen, latest(received_at) as last_seen by usuario, empresa | sort last_seen desc"
    }
  }

  # The dashboard order; every key of ux_queries appears once.
  ux_query_order = ["funnel", "actions", "dialogs", "disabled_taps", "waits", "readings", "syncs", "sessions_per_day", "errors", "users"]
}

resource "aws_cloudwatch_dashboard" "ux" {
  dashboard_name = "fasor-production-ux"

  dashboard_body = jsonencode({
    start = "-P7D"
    # Two columns of 12 x 6 on the 24-unit grid.
    widgets = [
      for index, key in local.ux_query_order : {
        type   = "log"
        x      = (index % 2) * 12
        y      = floor(index / 2) * 6
        width  = 12
        height = 6
        properties = {
          query  = "SOURCE '${local.ux_events_log_group}' | ${local.ux_queries[key].query}"
          region = local.region
          title  = local.ux_queries[key].title
          view   = local.ux_queries[key].view
        }
      }
    ]
  })
}

resource "aws_cloudwatch_query_definition" "ux" {
  for_each = local.ux_queries

  name            = "fasor-production-ux/${each.key}"
  log_group_names = [local.ux_events_log_group]
  query_string    = each.value.query
}
