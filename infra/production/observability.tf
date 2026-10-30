# Story 18.3 (2026-10-29): the usage dashboard over the usage events of AD-28.
#
# One CloudWatch dashboard `fasor-production-ux` with nine Logs Insights widgets, and the same
# nine queries as saved query definitions (CloudWatch > Logs Insights > Saved queries). Both
# read the log group `/fasor/production/ux-events` by its literal name; the group itself is
# declared elsewhere (Story 18.1) and never referenced from here, so this file plans on its
# own. Queries use only the event fields of AD-28 (`name`, `screen`, `target`, `kind`,
# `outcome`, `duration_ms`, `session_id`, `device_id`, `ts`, `app_version`, `relatorio_id`,
# `block_id`) and the server's `received_at`, `user_id`, `company_id`.
#
# Cost: dashboards (three of up to 50 metrics free a month) and query definitions are free;
# the Logs Insights scans (USD 0.005 per GB) run only when the dashboard is opened.
# `docs/observability.md` says how to read each view.

locals {
  ux_events_log_group = "/fasor/production/ux-events"

  ux_queries = {
    funnel = {
      title = "Funnel: screen views and sessions"
      view  = "bar"
      query = "filter name = 'screen_view' | stats count(*) as views, count_distinct(session_id) as sessions by screen | sort views desc"
    }
    actions = {
      title = "Actions, retries and undos by screen and target"
      view  = "table"
      query = "filter name in ['action', 'retry', 'undo'] | stats count(*) as taps by name, screen, target | sort taps desc | limit 100"
    }
    dialogs = {
      title = "Dialogs opened and cancelled"
      view  = "table"
      query = "filter name in ['dialog_open', 'dialog_cancel'] | stats sum(strcontains(name, 'dialog_open')) as opens, sum(strcontains(name, 'dialog_cancel')) as cancels by target | sort cancels desc"
    }
    disabled_taps = {
      title = "Taps on disabled controls"
      view  = "bar"
      query = "filter name = 'disabled_tap' | stats count(*) as taps by screen, target | sort taps desc | limit 50"
    }
    waits = {
      title = "Waits p50 and p95 (ms)"
      view  = "table"
      query = "filter name = 'wait' | stats count(*) as waits, pct(duration_ms, 50) as p50_ms, pct(duration_ms, 95) as p95_ms by kind"
    }
    readings = {
      title = "Readings by kind and outcome"
      view  = "table"
      query = "filter name = 'reading_result' | stats count(*) as readings by kind, outcome | sort kind, outcome"
    }
    syncs = {
      title = "Sync cycles by result"
      view  = "bar"
      query = "filter name = 'sync_result' | stats count(*) as cycles by kind | sort cycles desc"
    }
    sessions_per_day = {
      title = "Sessions and devices per day"
      view  = "bar"
      query = "stats count_distinct(session_id) as sessions, count_distinct(device_id) as devices by bin(1d)"
    }
    errors = {
      title = "Errors by screen and kind"
      view  = "table"
      query = "filter name = 'error' | stats count(*) as errors by screen, kind | sort errors desc"
    }
  }

  # The dashboard order; every key of ux_queries appears once.
  ux_query_order = ["funnel", "actions", "dialogs", "disabled_taps", "waits", "readings", "syncs", "sessions_per_day", "errors"]
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
