# Friction digest, <YYYY-MM>

Template (Story 18.3, 2026-10-29). Copy to `friction-digest-<YYYY-MM>.md` and fill each section from the dashboard `fasor-production-ux`, its saved queries and the op-log friction read (`docs/observability.md` § The monthly digest). Numbers and ids only; never paste a typed value, a caption, a name, a TAG, a local or an atividade.

## 1. Window and versions

- Window: <first day> to <last day> (America/Sao_Paulo).
- `app_version` values seen, with their event counts:
- Sessions and devices over the window (`sessions_per_day`):
- Anything that skews the month (a deploy, an outage, a training day):

## 2. First questions: Home navigation

The measures the 2026-10-29 analysis (`implementation-artifacts/backlog-2026-10-29-home-nav-and-telemetry.md` § 1) asked for, before and after any Home change:

- Taps on `home.shortcut_templates` and `home.shortcut_cadastros` per session (`actions`, divided by `sessions_per_day`):
- Time from the Home `screen_view` to the first navigation out of Home, p50 and p95 (Logs Insights over `session_id` and `ts`):
- Scroll depth before the shortcut tap: not an event yet (no `scroll` name in the vocabulary); say so here until one is added.

## 3. Funnel

Screen views and sessions per screen (`funnel`), in the path order Home, `setup`, `sumario`, `ficha`, `photos`, `export`; where the count drops most:

## 4. Top cancels

Dialogs by cancels against opens (`dialogs`), the top five with their ratio:

## 5. Top disabled taps

Controls pressed while disabled (`disabled_taps`), the top five by screen and target:

## 6. Waits

`wait` p50 and p95 per kind (`waits`): reading, sync, generate, preview, upload; compare with the previous digest:

## 7. Reading outcomes

`reading_result` by kind and outcome (`readings`); the failure share per kind:

## 8. Sync results

`sync_result` by kind (`syncs`): ran, offline, contract_outdated, unauthorized, failed:

## 9. Errors

Errors by screen and kind (`errors`), the top five, each with the api log entry it matches when there is one:

## 10. Op-log friction read

From `friction-read-cli.ts --company <id>` for each company in use (ids only):

- Sheet spans: median and longest `span_ms` per `block_type`:
- Fields edited more than once: total, and the block types where it concentrates:
- Typed after a failed reading: total, against the display readings that failed in § 7:

## 11. Decisions proposed

Each tied to a number above, for Matheus (and Bruno for anything on the screens) before any story is written:

1.
