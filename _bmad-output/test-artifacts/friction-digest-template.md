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
- Time from the Home `screen_view` to the first navigation out of Home, p50 and p95 (~~Logs Insights over `session_id` and `ts`~~ *(2026-11-03, Story 18.4: the `home_first_nav` view; see "Five questions" below)*):
- Scroll depth before the shortcut tap: not an event yet (no `scroll` name in the vocabulary); say so here until one is added.

## Five questions

*(2026-11-03, Story 18.4.)* The questions a month of data must answer (`implementation-artifacts/backlog-2026-10-30-ux-data-sufficiency.md` § 5), each with the view that answers it (`docs/observability.md` § The views) and what a reader concludes. Only events of bundles from Story 18.4 on carry the fields these views read: note the share of sessions on such a bundle (`app_version`) first.

1. **Time per screen** (`screen_time`): p50 and p95 per screen. A screen meant for work with a short p50 is opened and left; a screen meant for a choice with a long p95 makes people search:
2. **Home to first navigation** (`home_first_nav`): p50 and p95 of the Home views that began a visit. Seconds say people find their way at once; tens of seconds say Home makes them search; compare with the previous digest and with any Home change between:
3. **Cancels by preceding screen** (`paths`, filtered to the sessions with a `dialog_cancel`; `bounces` for the quick returns): for the top cancelled dialog of § 4, the screens the cancelling sessions came through, read from the `screen_view` rows around each cancel. A cancel that follows one path more than the others is a dialog reached by mistake on that path:
4. **Sessions by user and viewport** (`viewports`, labelled as `users`): sessions and devices per user by `viewport`, `standalone` and `online`. A pattern of another section that belongs to one viewport or one user is that device's or that person's, not the product's:
5. **The document wait** (`document_waits`): `preview` and `generate` p50 and p95 per outcome, only the versions from Story 18.4 on (older versions time the request). The p95 is what the slowest engineer in twenty waited; a `cancel` share says people give up waiting:

Typed values refused (`refusals`), the top five fields by refusals with their reason and sessions; a field at the top refuses what people type there:

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
