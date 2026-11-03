---
title: 'E18-A2 remainder, E15-A10 and tooling: smoke-free views, device-day sessions, the query binding test, the telemetry smoke step, resumable deploy'
type: 'chore'
created: '2026-11-03'
status: 'in-progress'
baseline_revision: '0fede8ac813fa77e856cf26e976c9c199ebab709'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-18-context.md'
  - '{project-root}/docs/observability.md'
  - '{project-root}/infra/README.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_reason: 'Coordinator lane 2 of the follow-up delivery of 2026-11-03 (epic-18-context.md): six agent-closable infra, tooling and docs items that share infra/ and the runbook, one branch to keep the stacks at two.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The usage dashboard counts the smoke company, bins `sessions_per_day` by receipt time and names its log group by a literal; nothing binds its ten queries to the kernel vocabulary; a deploy cannot tell that production events still land; `infra/bin/deploy` dies with no hint when the AWS endpoint drops after the roll (v0.3.0: `aws ecs wait services-stable` exit 255 under `set -e`, before the tag record); `infra/bin/check` is red on initialized stacks; the smoke's step 6 flakes on a closed preview tab; two composer unit files time out under load; the runbook carries stale or missing sentences.

**Approach:** Six items, one PR, each closed with an offline test or a dated ledger line: Terraform locals and IAM edits, a tooling test that reads the kernel, a read-only telemetry step in the deploy's smoke, retries and a `--resume` path in the deploy, a separate data dir for the offline check, one retry around the preview tab, load-independent composer tests, and the doc sentences.

## Boundaries & Constraints

**Always:**
- Offline only: no AWS call, no `terraform apply`, no `infra/bin/deploy` real run, no `infra/bin/tf ... apply`. Terraform checks run through `infra/bin/check` (TF_OFFLINE). Deploy behaviour is tested through `--dry-run` and stubs (`scripts/deploy.test.ts`).
- Everything in containers (`podman compose --profile tools run --rm --user root tools ...`); logs in `.scratch-e18fb/`; long runs under `lockf -t 20000 /tmp/fasor-verify.lock` started with `nohup`. Never touch the e18fa stack (port base 41) or its processes.
- The tooling test reads the closed lists from `@app/domain` (`packages/domain/src/contract/telemetry.ts`), never a copy.
- The telemetry step is read-only (`logs filter-log-events` only), prints counts only (never an event body, id or email), and is a WARNING, never a failure, in this release.
- The smoke keeps its eight steps, their names and every assertion; the only retry is around opening the preview tab.
- No event name, kind, target or screen is added or removed (vocabulary frozen until Story 18.4).
- Ledger: close resolved rows with a dated note (strike through with `~~`, never delete); new rows go under a new heading `## Deferred from: batch e18fb (2026-11-03)` at the end of `deferred-work.md`.
- No emoji; English in code, comments and docs.

**Never:** edit `sprint-status.yaml` or `epics.md`; edit e18fa's files (`apps/web/src/telemetry/*`, `apps/api/src/telemetry/*`, `apps/api/src/db/friction-read*`, `e2e/usage-events.spec.ts`); add a test hook that changes a real (non dry-run) deploy's behaviour; put a retry around an assertion; build images.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Lost endpoint after roll | an AWS CLI call after the roll fails with exit 255 and `Could not connect to the endpoint URL` | the call is retried (bounded, with a pause) and the deploy goes on | after the last attempt the deploy exits non-zero and prints `infra/bin/deploy --resume --tag <sha>` |
| Non-network AWS error | exit 255 with any other message (waiter max attempts, AccessDenied) | no retry | fails as before, plus the resume hint when the roll already ran |
| Resume | `--resume --tag <sha>` | build, push, migrate and roll are printed as skipped; a read-only check that every service in `service_names` runs task definitions whose images end with `:<sha>`; then the stable wait, health, record, smoke, telemetry | a service on another tag: exit 1 naming the service and its tag, nothing recorded |
| Telemetry green | after the suite | `session_start` events with `app_version = <tag>` since the deploy start in the ux-events group: N >= 1; `ux_event_sink_failed` in the api group since the start: 0; one count line each | none |
| Telemetry red | N = 0 after the poll, or failures > 0, or a read error | `deploy: warning: ...` naming the count; deploy exit unchanged | ledger row: make it a failure after the first green production run |
| Check on initialized stack | `<stack>/.terraform/terraform.tfstate` with the S3 backend, no credentials | init and validate green | none |
| Preview tab closes early | the tab opened by "Pré-visualizar" closes before the preview request is seen | the step records the device's failure line and console errors, closes the dialog, reloads the Sumário and presses once more; the same assertions then run | a second close fails the step as today |

</intent-contract>

## Code Map

- `infra/production/observability.tf` -- `local.ux_events_log_group` literal (l.18), `ux_queries` (ten), `ux_query_order`, dashboard `SOURCE` template and `aws_cloudwatch_query_definition.ux`.
- `infra/production/telemetry.tf` -- `aws_cloudwatch_log_group.ux_events` (`${local.ssm_prefix}/ux-events`), `aws_iam_role_policy.app_ux_events` with `logs:DescribeLogStreams` (l.21) and its comment (l.11-12).
- `infra/production/storage.tf:130` -- `aws_cloudwatch_log_group.this` (`api`, `ocr`, `caddy`, `migrate`, `smoke`); `ecs.tf:17-48` wires `awslogs-group` and `TELEMETRY_LOG_GROUP = aws_cloudwatch_log_group.ux_events.name`.
- `infra/production/outputs.tf` -- add `ux_events_log_group` and `api_log_group` outputs (pattern of `smoke_log_group`, l.90).
- `infra/production/variables.tf:185` -- `var.smoke_company_id`; `:224` `var.user_names`.
- `packages/domain/src/contract/telemetry.ts` -- `UX_EVENT_NAMES`, `WAIT_KINDS`, `READING_RESULT_KINDS`, `SYNC_RESULT_KINDS`, `UX_OUTCOMES`, `SCREENS`, `uxEventSchema` (strict object; `.shape` may sit behind `superRefine`, reach it the way zod 4 allows), `TELEMETRY_SERVER_KEYS`. The device's clock is the event's `ts` field (the launch prompt's `client_ts`); `@timestamp` of a line is the batch's `received_at` (`apps/api/src/telemetry/sink.ts:78`, read-only here).
- `scripts/nc-chip-phrases.test.ts` -- precedent of a tooling test that reads a document and the kernel; the tooling project includes `scripts/**/*.test.ts` (`vitest.config.ts`).
- `infra/bin/deploy` -- steps; `set -euo pipefail`; `run`/`capture` dry-run helpers; `run_one_shot`; l.256-258 roll and `ecs wait services-stable` (the v0.3.0 exit point: main checkout `.scratch-deploy/deploy-v0.3.0.log:762`, read-only); l.280-283 record; l.285-397 smoke; dry-run placeholders `DEPLOY_DRY_RUN_*_EXIT`.
- `infra/bin/lib.sh` -- shared helpers (sourced); home for a retry helper testable by sourcing.
- `scripts/deploy.test.ts` -- dry-run tests with stubs on PATH; `headers()`, `section()`, `SMOKE_STEPS` (asserts the smoke steps are the last three and follow `record`: update for the new step).
- `infra/bin/check` -- `init -backend=false` per stack (l.25-26); `infra/bin/tf` passes env through `--env-file`. Reproduced: a copy of `production/` with the main checkout's `.terraform/terraform.tfstate` fails init on credentials; with `TF_DATA_DIR=.terraform/check` init and validate are green (`.scratch-e18fb/check-repro/`). `.terraform/` is git-ignored at any depth.
- `e2e/production/production.smoke.ts:261-280` -- step 6; `apps/web/src/surfaces/export/use-preview.ts:164-183` -- the web closes its tab on any failure and shows a failure line; failed run artifacts (read-only): main checkout `.scratch-prodfix/smoke-fail-54b11947/` (`page.waitForRequest: Target page, context or browser has been closed`, 24 s in).
- `apps/web/src/surfaces/templates/template-composer-defaults.test.tsx`, `template-composer-local.test.tsx` -- `configure({ asyncUtilTimeout: 5000 })`, app `testTimeout: 15_000` (`apps/web/vite.config.ts:121`); timed out under load in PR #179, e16c, Epic 16 wave B, e17a (`epic-16-retro-2026-10-26.md` R16-7, `epic-17-retro-2026-10-28.md` F4).
- `docs/observability.md` (this lane owns it), `infra/README.md`, `docs/kbs/architecture/usage-events.md`, `docs/kbs/architecture/infra-aws.md`, `docs/kbs/log.md`.
- `_bmad-output/implementation-artifacts/deferred-work.md:2599-2611` -- the two rows this batch closes.

## Tasks & Acceptance

**Execution:**
- `infra/production/observability.tf` -- `ux_events_log_group = aws_cloudwatch_log_group.ux_events.name`; prefix `filter company_id != '${var.smoke_company_id}' | ` to every query except `users`; `sessions_per_day` groups by the device day, `substr(ts, 0, 10)` aliased (e.g. `fields substr(ts, 0, 10) as device_day | stats ... by device_day | sort device_day`); rewrite the header comment (no longer "by its literal name"). -- R-A8, R-A9, R-A10.
- `infra/production/telemetry.tf` -- drop `logs:DescribeLogStreams` and fix the comment. -- R-A11.
- `infra/production/outputs.tf` -- outputs `ux_events_log_group` and `api_log_group`. -- the telemetry step reads them.
- `scripts/telemetry-queries.test.ts` (new) -- parse `observability.tf` text: every `ux_queries` key is in `ux_query_order` once and back; every quoted literal compared with `name` (`=`, `in [...]`, `strcontains(name, ...)`) is in `UX_EVENT_NAMES`; any literal compared with `kind`, `outcome` or `screen` is in its kernel list; every bare field referenced in `filter`/`fields`/`stats`/`by`/`sort` is an event key (`uxEventSchema` shape), a server key or an alias the query defines; every query but `users` starts with the smoke filter on `var.smoke_company_id`; `sessions_per_day` bins on `ts`, not `bin(`; the dashboard's `SOURCE '${local.ux_events_log_group}'` and the query definitions' `log_group_names` use the local, the local is `aws_cloudwatch_log_group.ux_events.name` (`telemetry.tf`), `ecs.tf` sets `TELEMETRY_LOG_GROUP` from the same resource, and the resolved name (`locals.tf` `ssm_prefix` + `/ux-events`) equals the group `docs/observability.md` names. Red-first: show it fails on the current file (literal group, missing filter) before the Terraform edit. -- R-V1, P2.
- `infra/bin/lib.sh` -- `aws_retry` (name free): runs a command, retries only on exit 255 with a connection message on stderr (`Could not connect to the endpoint URL`, `Connect timeout on endpoint URL`, `Read timeout on endpoint URL`, `Connection was closed`), bounded attempts and pause overridable for tests (`DEPLOY_RETRY_ATTEMPTS`, `DEPLOY_RETRY_PAUSE_S`), passes stdout through and re-emits stderr. -- E15-A10.
- `infra/bin/deploy` -- (a) record the deploy start (epoch ms) at preflight; (b) wrap the post-roll idempotent AWS reads and writes (`ecs wait services-stable`, `ssm get-parameter`, `ssm put-parameter --overwrite`, the run_one_shot polls `list-container-instances`/`describe-tasks`) in the retry (never `run-task`); (c) an EXIT trap that, once the roll started and before the tag is recorded or the smoke finished, prints `deploy: to resume: infra/bin/deploy --resume --tag <tag>` (plus `--skip-smoke` when it was given); (d) `--resume` implies `--skip-build`, prints the build/push/migrate/roll steps as `skipped by --resume`, checks read-only (`ecs describe-services`, `describe-task-definition`) that every service runs images tagged `<tag>`, then waits stable, health, record, smoke; (e) a smoke step `smoke: check the usage events` after the suite and before the cleanup: reads the two new outputs (after the roll, so a first deploy carrying them has them), polls `logs filter-log-events --log-group-name <ux group> --start-time <start> --filter-pattern '{ ($.name = "session_start") && ($.app_version = "<tag>") }' --query 'length(events)'` up to about 2 minutes until >= 1, counts `"ux_event_sink_failed"` in the api group since the start, prints `telemetry: N session_start with app_version <tag> since <ISO start>; M ux_event_sink_failed`, and on N = 0, M > 0 or a read error prints `deploy: warning: ...` without failing; skipped with `--skip-smoke` and `not run` when the suite did not run; dry-run placeholders `DEPLOY_DRY_RUN_TELEMETRY_SESSIONS` (default 1) and `DEPLOY_DRY_RUN_TELEMETRY_SINK_FAILURES` (default 0), and `DEPLOY_DRY_RUN_STABLE_EXIT` (default 0) to exercise the trap; (f) help text and the header comment. -- E15-A10, R-A3, R-V12, R-V13.
- `scripts/deploy.test.ts` -- update the smoke-order tests for four smoke steps; add: the retry helper (source `lib.sh` with a stub command: retried on the endpoint message and succeeds; not retried on another 255; gives up after the bound with the stub's stderr), the resume hint on a failed stable wait (dry run), `--resume` (steps skipped, the describe-services check printed, record and smoke run), the telemetry step (filter pattern carries the tag and the start time; counts printed; warning paths exit 0; never prints a password or an event body).
- `infra/bin/tf`, `infra/bin/check` -- `tf` passes `TF_DATA_DIR` into the container when set; `check` runs init and validate with `TF_DATA_DIR=.terraform/check`, leaving the operator's `.terraform` untouched; a comment cites the ledger row. Prove on a copy of `infra/` with an S3-backend `.terraform/terraform.tfstate` (as in `.scratch-e18fb/check-repro/`) that the old check is red and the new one green; tflint unaffected. -- ledger, Epic 19 deploy.
- `e2e/production/preview-tab.ts` (new, or a name of your choice) and `production.smoke.ts` -- a helper that presses the preview and returns the observed preview request, retrying once (fresh `page.goto` of the Sumário, dialog reopened) only when the tab closed before the request was seen; before the retry it records the dialog's failure line and the page's console errors to `SMOKE_RESULTS_DIR` and the log; step 6's assertions unchanged after it. A unit test in `scripts/` (tooling project) drives the helper with fakes: closed then opened (one retry, request returned), closed twice (throws the original error), a non-close error (no retry). -- ledger, deploy of 2026-11-03.
- `apps/web/src/surfaces/templates/template-composer-defaults.test.tsx`, `template-composer-local.test.tsx` -- make the waits load-independent: no explicit short timeout anywhere in the two files; per-file `asyncUtilTimeout` and test timeouts wide enough for a loaded VM (waits end on their condition, so idle runs are unchanged); cut per-test cost where it is cheap (e.g. `userEvent.setup({ delay: null })`, shared fixtures); assertions unchanged. Record each file's duration before and after. -- E16-A10, E17-A8.
- `docs/observability.md` -- the ten views say the smoke company is filtered out (the `users` view labels it `smoke`); the window is receipt time (`received_at`) while `sessions_per_day` bins by the device day (`ts`); `waits`: a reading wait counts from the shot (`captured_at`), so offline time and a failed first attempt inflate it; `syncs`: one `sync_result` per ran cycle (every 60 s while visible, 5 s while a reading is pending), read it as ratios; friction read: structural block fields (`location_id`, `order_key`, `removed_at`, `feeds_block_id`) count in spans and re-edits until the E18-A1 batch; "Adding an event name": lists are append-only within a release (a removed name refuses a device batch, R-A2); LGPD: controls are named by `data-telemetry` attributes the kernel checks against `TELEMETRY_TARGET_PATTERN` only, with `UX_ACTION_TARGETS`/`UX_DIALOG_TARGETS` and `targets.test.ts` as the guard, and no typed value reaches `target`; digest: grep the api log group for `ux_event_sink_failed` over the month; the deploy's telemetry step. Dated italic notes, strike-through of replaced text, nothing deleted.
- `infra/README.md` -- lines for `--resume`, the retry, the telemetry step, the new outputs, the check's data dir; `docs/kbs/architecture/usage-events.md`, `docs/kbs/architecture/infra-aws.md` (dated lines) and one `docs/kbs/log.md` line.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- close the two rows (dated); new heading with: E15-A10 diagnosis and fix (the cause named); the telemetry step becomes a failure after its first green production run (owner: the next infra batch); anything left open.

**Acceptance Criteria:**
- Given the edited Terraform, when `infra/bin/check` runs offline in this worktree, then every step passes (fmt, init, validate, tflint, caddy, shellcheck).
- Given `scripts/telemetry-queries.test.ts`, when a kernel name is renamed or a query names an unknown event or field, then the test fails naming it; on the committed files it passes.
- Given `scripts/deploy.test.ts`, when the tooling project runs, then the existing dry-run tests and the new retry, resume, trap and telemetry cases pass.
- Given the two composer files, when `test:unit` runs in the gate, then both pass on the first run, and their before/after durations are in the PR body with the host load at gate start.
- Given the ledger, then the Epic 19 check row and the 2026-11-03 step 6 row carry dated closing notes and the new heading holds the rows above.

## Design Notes

The trap is the fallback that covers any unforeseen exit after the roll; the retry is what lets the next lost endpoint pass on its own. `--resume` skips the migrate because a rerun would start a second migrate task for an already migrated tag; the read-only service check keeps it from recording a tag that never rolled. The telemetry poll waits because a CloudWatch line appears seconds after the put.

## Verification

**Commands:**
- `podman compose --profile tools run --rm --user root tools pnpm exec vitest run scripts/telemetry-queries.test.ts scripts/deploy.test.ts <preview test>` -- green.
- `podman compose --profile tools run --rm --user root tools pnpm exec vitest run apps/web/src/surfaces/templates/template-composer-defaults.test.tsx apps/web/src/surfaces/templates/template-composer-local.test.tsx` -- green, 3 runs.
- `infra/bin/check` -- `all passed`.
- Story gate (coordinator-run by the orchestrator): `pnpm lint`, `pnpm static`, `pnpm test:api`, `pnpm test:unit` under the host lock.
