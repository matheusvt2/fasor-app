---
title: 'Epic 18 batch o18b: the funnel dashboard, saved queries, runbook and the op-log friction read (Story 18.3)'
type: 'feature'
created: '2026-10-29'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: medium
context:
  - '{project-root}/AGENTS.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Usage events (AD-28, Stories 18.1/18.2, batch o18a in parallel) will land in the CloudWatch group `/fasor/production/ux-events`, but nothing reads them, and the op log can already answer "how long did a sheet take", "what was re-edited" and "what was typed after a failed reading" with SQL nobody has written (Story 18.3, `epics.md` § Epic 18).

**Approach:** Terraform one free CloudWatch dashboard `fasor-production-ux` with nine Logs Insights widgets plus the same nine queries as saved query definitions, over the literal group name; a runbook `docs/observability.md` and a digest template; and a read-only api CLI `friction-read-cli.ts` over the `ops` table, run in production as a migrate-task command override like `tombstone-cli.ts`.

## Boundaries & Constraints

**Always:**
- Queries use only the epic's event fields (`name`, `screen`, `target`, `kind`, `outcome`, `duration_ms`, `session_id`, `device_id`, `ts`, `app_version`, `relatorio_id`, `block_id`) and the server's `received_at`, `user_id`, `company_id`; every query starts `SOURCE '/fasor/production/ux-events' |` in the widget and is the same text (minus the SOURCE prefix) in its `aws_cloudwatch_query_definition`.
- The log group is named only through `local.ux_events_log_group = "/fasor/production/ux-events"`; never reference o18a's `telemetry.tf` resource.
- The friction read is read-only (SELECTs only, no transaction that writes), takes `--company <uuidv7>` checked before the database opens, and prints JSON lines via `log()` from `apps/api/src/log.ts` carrying ids, closed keys and numbers only: never an op `value`, a caption, a name, a TAG, a local or an atividade.
- Red first: the friction-read integration test is written and seen failing (module missing) before the implementation.
- English code, comments and documents; no emoji; every file under 400 lines where practical.

**Never:**
- No `terraform plan`/`apply`, no AWS CLI call, no network to AWS. Offline `fmt -check`, `init -backend=false`, `validate` only.
- No app code in `apps/web` or `packages/domain`; no op family, no contract bump, no Playwright spec, no change to `telemetry.tf` or to o18a's files.
- No paid CloudWatch feature (no metric filters, no alarms, no fourth dashboard, no Contributor Insights).
- Never copy client material from `docs/context/` or `docs/media/`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy read | company with 2 live relatórios, blocks with device ops | one `friction sheet` line per live block, one `friction relatorio` line per relatório, one `friction company` line; exit 0 | none |
| Removed block / relatório | a block or relatório with `removed_at` set | not printed, not counted | none |
| Re-edit | the same sheet path put by devices 3 times, another once | `fields_reedited` = 1 for that block | none |
| Typed after failed reading | photo with `reading_target` naming block B, test T, `start_cell` (r,c); server op `file/{photo}/reading_status` = `failed`; later a device put on `sheet/B/test/T/cell/r/c` | `typed_after_failed_reading` = 1 for B | a device put BEFORE the failure, or a failure never followed by a put, counts 0 |
| Block with no device op | a live block created by the server only | line printed with `device_op_count: 0`, `first_op_at`/`last_op_at`/`span_ms` null | none |
| Empty company | company id with no relatório | only the company line, totals 0; exit 0 | none |
| Bad argument | missing `--company`, non-uuidv7, unknown flag | `refused: ...` on stderr via `logError`; exit 1; database never opened | UsageError |
| Other company | ops of a neighbour company | never read (every query filters `company_id`) | none |

</intent-contract>

## Code Map

- `infra/production/locals.tf` -- `local.region` ("us-east-1"), `local.name` ("fasor-production"), `local.ssm_prefix`; add nothing here (the new local lives in `observability.tf`).
- `infra/production/storage.tf:130` -- existing `aws_cloudwatch_log_group.this` per service; pattern only, do not touch.
- `infra/production/versions.tf` -- provider pins; `aws_cloudwatch_dashboard` and `aws_cloudwatch_query_definition` exist in every AWS provider 5.x/6.x.
- `infra/bin/tf`, `infra/bin/check` -- offline Terraform runner (`TF_OFFLINE=1`); `check` also runs tflint (`infra/.tflint.hcl`), run it if the image is present, else the three tf commands.
- `infra/README.md` -- table "The production stack" (lines ~35-50, add an "Observability" row), "Cost" table (lines ~131-148, add a USD 0.00 row, total unchanged), "Runbook" (add the friction-read entry right after "Remove test data from a company", same `ecs run-task` override shape, and a "Usage dashboard" line).
- `apps/api/src/db/tombstone-cli.ts` -- the CLI precedent: `parseArgs` throwing `UsageError` before `loadConfigOrExit()`, `createDb`, `log`/`logError`, `sql.end()` in `finally`, exit codes. Copy its shape.
- `apps/api/src/db/tombstone.integration.test.ts` -- test precedent: `loadConfig()`, `createDb`, `newId()` company ids, `company` insert, `dropCompany` in `afterAll`, the CLI through `spawnSync('pnpm', ['exec','tsx','apps/api/src/db/...-cli.ts', ...])` with `cwd: root` (line ~272).
- `apps/api/src/db/schema.ts:49` -- `ops` (`seq`, `company_id`, `relatorio_id`, `kind`, `path`, `value`, `actor_id`, `device_id`, `client_ts`, `received_at`); `:90` `entities` (`entity`, `id`, `relatorio_id`, `row` jsonb, `removed_at`). Raw inserts into both are fine for this read-only test.
- `apps/api/src/sync/apply.ts:212-215` -- server actors are `system:*` (`system:reading`, `system:cleanup`, `system:registry`); `SERVER_DEVICE_ID` from `@app/domain`.
- `packages/domain/src/ops/path.ts` -- `parsePath(path)` (exported from `@app/domain`); sheet families `sheet/{block_id}/nameplate/{field_key}`, `sheet/{block_id}/checklist/{item_key}/{result|observation}`, `sheet/{block_id}/test/{test_key}/{instrument|criterion_override}`, `sheet/{block_id}/test/{test_key}/cell/{row}/{col}`, `sheet/{block_id}/test/{test_key}/value/{value_key}`, `sheet/{block_id}/conclusion/{field}`, `sheet/{block_id}/observations`; block families `block/{id}` (create) and `block/{id}/{field}`; file `file/{id}` (create, value carries `reading_kind`, `reading_target`), `file/{id}/reading_target` (device put), `file/{id}/reading_status` (server `file/server` family, value `none|queued|running|done|failed`).
- `packages/domain/src/reading/target.ts` -- `displayCellTargetSchema` (`block_id`, `block_type`, `table_key` = test key, `start_cell {row,col}`); parse the photo's latest `reading_target` (create value or put) with it.
- `apps/api/src/log.ts` -- `log(msg, fields)` prints one JSON line with `company_id`, `relatorio_id`, `job_id` always present.
- `docs/kbs/architecture/infra-aws.md`, `docs/kbs/log.md` -- one line each.
- `_bmad-output/implementation-artifacts/sprint-status.yaml:211` -- the 18.3 line (the coordinator's launch prompt hands it to this batch).

## Tasks & Acceptance

**Execution:**
- `apps/api/src/db/friction-read.integration.test.ts` -- FIRST, red: seed a company and a neighbour by raw inserts (company row, `entities` rows for 2 relatórios incl. one removed, blocks incl. one removed, a photo; `ops` rows with paths/values/actors/`client_ts` per the matrix, values holding marker strings like `SECRET-VALUE-<id>`, a TAG and a caption), then assert `readFriction(db, companyId)` results (spans in ms from `client_ts`, `fields_reedited`, `typed_after_failed_reading`, removed rows absent, neighbour absent), and run the CLI via `spawnSync`: exit 0, every stdout line `JSON.parse`s, no line contains any marker string, a bad id exits 1 with nothing on stdout. Run it red once and keep the red output for the PR.
- `apps/api/src/db/friction-read.ts` -- `readFriction(db: Db, companyId: string): Promise<FrictionReport>` returning `{ company: {...totals}, relatorios: [{ relatorio_id, status, sheets: [{ block_id, block_type, first_op_at, last_op_at, span_ms, device_op_count, fields_reedited, typed_after_failed_reading }] }] }`; reads live `relatorio` and `block` entities of the company, then the company's ops (filtered by `company_id`, ordered by `seq`) and classifies each path with `parsePath` (skip paths that fail to parse); pure helper(s) exported for unit tests if useful.
- `apps/api/src/db/friction-read-cli.ts` -- `--company <id>` only; prints `log('friction sheet', {...})` per sheet, `log('friction relatorio', {...})` per relatório (sheet count, sum of spans, re-edit and typed-after-failure totals), `log('friction company', {...})`; header comment with the local and the production command (tombstone-cli shape, `--company`).
- `infra/production/observability.tf` -- `locals { ux_events_log_group = "/fasor/production/ux-events"; ux_queries = { <key> = { title, query, view } x9 } }`, one `aws_cloudwatch_dashboard.ux` (`dashboard_name = "fasor-production-ux"`, `dashboard_body = jsonencode({ start = "-P7D", widgets = [...] })`, widgets `type = "log"`, 12 wide x 6 high on a two-column grid, `properties = { query = "SOURCE '${local.ux_events_log_group}' | ${q.query}", region = local.region, title, view }`), and `aws_cloudwatch_query_definition.ux` with `for_each = local.ux_queries`, `name = "fasor-production-ux/<key>"`, `log_group_names = [local.ux_events_log_group]`, `query_string = q.query`. Queries per Design Notes.
- `infra/README.md` -- stack row, cost row (USD 0.00), runbook entries (dashboard, friction read).
- `docs/observability.md` -- per the story: open the dashboard and each saved query with the `fasor-admin` login (console, region us-east-1, CloudWatch > Dashboards / Logs Insights > Saved queries), one paragraph per view saying what a reader concludes, how to add an event name (kernel `contract/telemetry.ts` first, then `data-telemetry` on the control, then a query in `observability.tf`), retention 90 days, LGPD stance (opaque ids, closed lists, no free text, the Conta "Uso do aplicativo" notice of Story 18.2), the friction-read CLI, and the monthly digest procedure.
- `_bmad-output/test-artifacts/friction-digest-template.md` -- sections the monthly read fills: window and versions; first questions = the Home navigation measures of the analysis § 1 (taps on `home.shortcut_templates`/`home.shortcut_cadastros` per session, time from Home `screen_view` to the first navigation; scroll depth is not an event yet, say so); funnel; top cancels; top disabled taps; waits p50/p95; reading outcomes; sync results; errors; op-log friction read (spans, re-edits, typed after failed reading); decisions proposed.
- `docs/kbs/architecture/infra-aws.md`, `docs/kbs/log.md` -- one dated line each.

**Acceptance Criteria:**
- Given the production stack, when `TF_OFFLINE=1 infra/bin/tf production fmt -check`, `init -backend=false` and `validate` run, then all three pass and the dashboard holds exactly nine `log` widgets whose queries begin `SOURCE '/fasor/production/ux-events' |`, matched one to one by nine query definitions on that group.
- Given a seeded company, when `friction-read-cli.ts --company <id>` runs, then it exits 0 and prints JSON lines whose spans, re-edit counts and typed-after-failure counts match the seed, and no stdout line carries any seeded value, caption, name or TAG.
- Given `docs/observability.md`, when Matheus opens it, then it names the dashboard, the nine saved queries with what each tells, the add-an-event steps, the 90-day retention, the LGPD sentence and the monthly digest procedure pointing at the template.

## Design Notes

Decisions open for the coordinator's veto (the story is silent):
- D1 Span = first to last `client_ts` (device clock, the time of the edit) of DEVICE ops (actor not `system:*`) whose path targets the block (`block/{id}`, `block/{id}/*`, `sheet/{id}/*`); server ops (reading suggestions, cleanups, seed moves) would stretch spans with times nobody worked.
- D2 A "field edited more than once" = a sheet or block field path (not the `block/{id}` create) with two or more device ops of any kind.
- D3 "Typed after a failed reading" = per failed `display` photo whose latest `reading_target` parses as `displayCellTargetSchema`, 1 when a device put on exactly its `start_cell` path lands after (by `seq`) the failure op; plate and nc_obs failures and the cells a multi-value reading would have walked to are not counted (literal reading of the launch prompt).
- D4 Lines carry `block_type` and the relatório `status` (closed seed and status keys, not free text) beside ids, so the digest can group by equipment type.
- D5 The actions view folds `retry` and `undo` in (`by name, target`) so the funnel shows retries beside taps; still nine widgets.
- D6 No epic-18-context.md was compiled: the launch prompt names the reading list, and the epic text is short.

The nine queries (the widget prefixes `SOURCE '/fasor/production/ux-events' | `):
1. funnel (bar): `filter name = 'screen_view' | stats count(*) as views, count_distinct(session_id) as sessions by screen | sort views desc`
2. actions (table): `filter name in ['action', 'retry', 'undo'] | stats count(*) as taps by name, screen, target | sort taps desc | limit 100`
3. dialogs (table): `filter name in ['dialog_open', 'dialog_cancel'] | stats sum(strcontains(name, 'dialog_open')) as opens, sum(strcontains(name, 'dialog_cancel')) as cancels by target | sort cancels desc`
4. disabled taps (bar): `filter name = 'disabled_tap' | stats count(*) as taps by screen, target | sort taps desc | limit 50`
5. waits (table): `filter name = 'wait' | stats count(*) as waits, pct(duration_ms, 50) as p50_ms, pct(duration_ms, 95) as p95_ms by kind`
6. readings (table): `filter name = 'reading_result' | stats count(*) as readings by kind, outcome | sort kind, outcome`
7. syncs (bar): `filter name = 'sync_result' | stats count(*) as cycles by kind | sort cycles desc`
8. sessions per day (bar): `stats count_distinct(session_id) as sessions, count_distinct(device_id) as devices by bin(1d)`
9. errors (table): `filter name = 'error' | stats count(*) as errors by screen, kind | sort errors desc`

Cost: CloudWatch gives three dashboards of up to 50 metrics each free a month and query definitions are free; Logs Insights scans (USD 0.005 per GB) run only when the dashboard is opened, over at most ~50 MB a month: cents, booked as USD 0.00 (the o18a ingestion row carries the group's cost).

## Verification

**Commands:**
- `podman compose --profile tools run --rm --user root tools pnpm test:api -- apps/api/src/db/friction-read` -- red before the module exists, green after.
- `TF_OFFLINE=1 infra/bin/tf production fmt -check && TF_OFFLINE=1 infra/bin/tf production init -backend=false -input=false && TF_OFFLINE=1 infra/bin/tf production validate` -- all pass.
- Gate (orchestrator, under `lockf -t 20000 /tmp/fasor-verify.lock`, logs in `.scratch-o18b/`): `lint`, `static`, `test:unit`, `test:api` -- green.
