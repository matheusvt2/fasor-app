---
title: 'Fix batch fxrm: relatório tombstone op family (contract 28) and the one-shot tombstone CLI to remove the 2026-10-15 test data from production'
type: 'feature'
created: '2026-10-29'
status: 'done'
baseline_revision: '94ca957ad1d79dd646800936f78aad8853a05cfe'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'medium'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/prod-pass-fix-context.md'
warnings: ['batched', 'oversized']
# batched: one coordinator item (remove the 2026-10-15 test data) in its own batch; kernel, api CLI and runbook ship together because the CLI needs the new family.
deferred: []
---

<intent-contract>

## Intent

**Problem:** A hand-run production check on 2026-10-15 left test data in Bruno's company: a client "TESTE v0.2.0 — apagar", a project "TESTE Obra v0.2.0 — apagar" and a relatório (76 sheets, 2 filled) whose Home card Bruno's tablet still shows. The app has no "Remover" for a relatório or a project, and no op path writes a relatório's `removed_at` (`relatorio/{id}` is create-only; the other relatório families are `setup/*`, `status`, `export/scheme`, `preview_file_id`).

**Approach:** Matheus's decision of 2026-10-29, the coordinator's option (a): a new op family `relatorio/removed_at` (contract 28, minimum 28) handled by `applyOp`, and a one-shot server CLI (`apps/api/src/db/tombstone-cli.ts`) that finds the rows read-only and, after a dry run, tombstones relatório, project and client in ONE `applyServerBatch` with actor `system:cleanup`. Devices learn the removal only through those ops (AD-13). The production run is a command override on the `migrate` task, documented in `infra/README.md`; nothing runs against AWS in this batch.

## Boundaries & Constraints

**Always:**
- `applyOp` is the only reducer: the CLI writes ops through `applyServerBatch` (`SERVER_DEVICE_ID`, `system:cleanup`), never an `entities` update.
- The family is appended at the END of both `opPathSchema` and `FAMILIES` (append-only), `entity: 'relatorio'`, `implicitRelatorio: true`, segments `[lit('relatorio'), lit('removed_at')]`, put (ISO or null) and remove; not `serverOnly`.
- Every check passes before any write; any failing check writes nothing and exits 1 with its reason.
- `CONTRACT_VERSION` and `MIN_CONTRACT_VERSION` become 28, each with a dated paragraph in `version.ts` in the 15.7 style.
- English code and docs, no emoji, no client material; the CLI prints ids and names to the operator's log only.

**Never:**
- No `apps/web` behavior change (no "Remover relatório/projeto" surface; product question goes to the ledger).
- No Terraform change, no deploy, no AWS call, nothing under `infra/production/*.tf`.
- No purge: rows stay as tombstones, reversible by a put of null.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| find | `--find "TESTE v0.2.0"` | Lists live client registry rows and projects whose `name` contains the text (case-insensitive), and live relatórios whose `setup.local` or `setup.atividade` contains it or whose project matched; each line: company id and name, entity, id, name, and for a relatório status and project id | No match prints `no match`, exit 0 |
| dry run | `--company C --relatorio R --project P --client K` | Prints the plan (three ops in order) and every check with its result; writes nothing | A failed check: reason printed, exit 1 |
| apply | same plus `--apply` | One `applyServerBatch` under the company lock: `remove` `relatorio/removed_at` (scope relatorio, `relatorio_id` R), put `project/P/removed_at` = now (scope company), put `registry/client/K/removed_at` = now (scope company); one shared `batch_id`; exit 0 | A refused batch: nothing written, exit 1 |
| partial | any of R, P, K omitted | The omitted target is skipped; the given ones are still checked against each other | — |
| inconsistent | R not of P, P not of K, any not in C | Refused | exit 1, nothing written |
| client in use | another LIVE project (not P) references K | Refused | exit 1 |
| project in use | another LIVE relatório (not R) belongs to P | Refused (conservative, see Design Notes) | exit 1 |
| emitido | R has status `emitido` | Refused | exit 1 |
| missing / removed | an id not found in C, or already removed | Refused | exit 1 |
| restore | a put of null on `relatorio/removed_at` | `applyOp` clears `removed_at` | — |
| create refused | `create` on `relatorio/removed_at` | `opSchema` refuses (not a create family) | `op_invalid` |

</intent-contract>

## Code Map

- `packages/domain/src/ops/path.ts` -- `opPathSchema` (line ~97, last member `sheet/test/value` ~174) and `FAMILIES` (~218, last `sheet/test/value` ~352): append `relatorio/removed_at`; add helper `relatorioRemovedAtPath()` beside `relatorioStatusPath` (~528). `pathField` (~492) already returns the last literal, so `remove` validates (`op.ts` ~162). `targetOf` (~508) returns the implicit relatório.
- `packages/domain/src/ops/apply.ts` -- `readPath` switch (~548) and `writeRow` switch (~619): add the `relatorio/removed_at` case setting/reading `removed_at` (`writeRow` already maps a `remove` to `client_ts`). Check any other exhaustive switch over `PathFamily` (grep `case 'relatorio/preview_file_id'` across `packages/domain/src` and `apps/`) and add the case where TypeScript requires it.
- `packages/domain/src/schemas/entities.ts` -- `relatorioRowSchema.removed_at` exists (~367); `ENTITY_SCOPE.project = ['company']` (~757), so the project put is company scope.
- `packages/domain/src/contract/version.ts` -- both constants and their history comments; `contract.test.ts` line ~101 pins 27; `contract/examples.ts` may list one example per family (15.7 added a line there).
- `packages/domain/src/home/cards.ts` (~202) and `relatorio/project.ts` (38-57, 143-153) already skip a tombstoned relatório; `apps/web/src/db/home-store.ts` (51, 189, 277, 299) too. Verify every other reader of relatório rows (grep `'relatorio'` entity reads in `packages/domain/src` and `apps/web/src/db`) and add the filter only where one is missing.
- `apps/api/src/sync/pull.ts` -- the company summary lists live relatórios only (~163); `pullRelatorio` (~79) still answers a removed relatório's stream, so a device that followed it pulls the `remove`.
- `apps/web/src/sync/engine.ts` (~561-585) -- a device keeps following every stream with a `sync_state` row, so Bruno's tablet receives the remove; read-only here.
- `apps/api/src/sync/apply.ts` -- `applyServerBatch` (~563), `ServerBatchRejectedError`, `REGISTRY_MERGE_ACTOR` (~212): add `CLEANUP_ACTOR = 'system:cleanup'` beside it. `validate` (~150) with `origin: 'server'` accepts a non-server-only family from `SERVER_DEVICE_ID`.
- `packages/domain/src/status/edited-since.ts` (~105) -- `system:` actors already count as system.
- `apps/api/src/db/smoke-seed-cli.ts`, `smoke-seed.integration.test.ts` -- models for the CLI (`loadConfigOrExit`, `createDb`, `log`/`logError`, exit codes) and its integration test (neighbour company byte-identical, CLI spawned with `spawnSync`).
- `apps/api/src/db/sample-relatorio.ts` (`seedSampleRelatorio`, `sampleRelatorioIds`), `test-cleanup.ts` (`dropCompany`), `schema.ts` (`company` table with `name`, `entities`, `ops`).
- `apps/api/src/sync/sync.integration.test.ts` (~1082) -- "contract 27 ..." skew test pinning 27/26: move to 28/27.
- `e2e/support/push-server-ops.ts` -- pattern for an e2e that writes server ops against the compose Postgres.
- `e2e/sync.spec.ts` (127, 1.5-E2E-003) -- the 426 "Atualizar" path; stubs the 426, independent of the number.
- `infra/README.md` § Runbook (~154); `infra/production/ecs.tf` (~176) migrate command `./node_modules/.bin/tsx src/db/migrate-cli.ts`.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/ops/path.ts` -- append the family (schema member with a dated comment, `FAMILIES` entry) and `relatorioRemovedAtPath` -- the only write path for a relatório's tombstone.
- `packages/domain/src/ops/apply.ts` -- `readPath`/`writeRow` cases -- `applyOp` sets and clears `removed_at`.
- `packages/domain/src/ops/path.test.ts`, `apply.test.ts`, `home/cards.test.ts` (or the nearest existing test files) -- RED FIRST: parse/format round trip, put ISO, put null, remove accepted, create refused, scope other than `relatorio` refused, missing `relatorio_id` refused; `applyOp` remove sets `removed_at = client_ts`, put null restores; `homeCards` drops the removed relatório and the counts it fed.
- `packages/domain/src/contract/version.ts`, `contract.test.ts`, `contract/examples.ts` if it enumerates families -- 28/28 with dated paragraphs: a version-27 bundle cannot parse a `relatorio/removed_at` op (its `opSchema` fails the whole pulled page), so it updates.
- Every test or fixture pinning 27 (`grep -rn "27" ` over contract tests, `sync.integration.test.ts`, web tests asserting `CONTRACT_VERSION`) -- move to 28; add 27 to the refused versions list.
- `apps/api/src/sync/apply.ts` -- export `CLEANUP_ACTOR`.
- `apps/api/src/db/tombstone.ts` -- exported `findTombstoneCandidates(db, text)`, `planTombstone(db, input)` (checks, returns `{ ok, checks[], ops[] }` or the refusal reason), `applyTombstone(db, input, deps)` (re-runs the plan inside `applyServerBatch`'s `before` hook under the company lock and throws a `TombstoneRefused` there, so a race between plan and apply writes nothing), and `TombstoneRefused`.
- `apps/api/src/db/tombstone-cli.ts` -- argv parsing (`--find`, `--company`, `--relatorio`, `--project`, `--client`, `--apply`; ids validated as UUIDv7 before the database opens; `--find` exclusive with the others; `--company` and at least one target required otherwise), output through `log`/`logError`, exit 0/1; header comment with the local and production commands.
- `apps/api/src/db/tombstone.integration.test.ts` -- RED FIRST for apply: seed a company (client registry row, project naming it, `seedSampleRelatorio` or equivalent ops) and a neighbour; `find` lists them; dry run writes nothing; apply writes exactly three ops with actor `system:cleanup` and the three `entities.removed_at`; a pull of the relatório stream carries the `remove`; neighbour byte-identical; each refusal (inconsistent, client in use, project in use, emitido, not found, already removed) writes nothing; the CLI spawned once with `--find` (exit 0) and once refused (exit 1).
- `apps/api/src/sync/sync.integration.test.ts` -- one test through `POST /api/sync/ops`: a device push of `relatorio/removed_at` (remove, then put null) is applied and carried by the relatório stream; a version-27 pull is 426.
- `e2e/relatorio-tombstone.spec.ts` (`@p1`) -- a device that opened a relatório sees its Home card; the spec calls `applyTombstone` against the compose Postgres for that relatório (worker's own company); "Sincronizar agora"; the card is gone and the device's IndexedDB relatório row carries `removed_at`.
- `infra/README.md` -- runbook entry "Remove test data from a company": find, dry run, apply commands (Design Notes), log group `/fasor/production/migrate`, the rule "find, then dry run, then apply; the coordinator runs it, Matheus's word first", restore by a put of null.
- `docs/kbs/architecture/ops-and-local-first.md`, `docs/kbs/architecture/sync.md`, `docs/kbs/log.md` -- dated lines (family, contract 28, CLI).
- `_bmad-output/implementation-artifacts/prod-pass-fix-context.md` -- section "Batch fxrm (2026-10-29)" with the decisions and deviations; `deferred-work.md` -- heading "Deferred from: fix batch fxrm (2026-10-29)" with the row "no Remover relatório or projeto in the UI (product question for Bruno and Matheus; the op family now exists)".

**Acceptance Criteria:**
- Given the kernel, when `parsePath('relatorio/removed_at')` runs, then it yields family `relatorio/removed_at` and `formatPath` returns the same string; a `create` on it is refused.
- Given a relatório row, when a `remove` on `relatorio/removed_at` folds, then `removed_at = client_ts`; when a put null follows, then `removed_at` is null again.
- Given the compose Postgres, when the CLI runs with `--apply` on consistent ids, then the company's `ops` gains exactly three rows with actor `system:cleanup` in the order relatório, project, client, the three entity rows carry `removed_at`, and the company pull summary no longer lists the relatório.
- Given any failing check, when the CLI runs with `--apply`, then no `ops` row is added and the exit code is 1.
- Given a device that followed the relatório, when it syncs after the apply, then its Home no longer shows the card.
- Given a client on contract 27, when it pulls after the deploy, then the server answers 426 and the app shows "Atualizar" until it reloads.

## Spec Change Log

## Review Triage Log

### 2026-10-29 — Review pass
Layers: Edge Case Hunter and Verification Gap Reviewer (opus). Blind Hunter and Intent Alignment skipped: token economy; the integrated review covers them.
- verdicts: 10 findings — high 0, medium 4, low 4, false 0, maybe-false 0 (2 rejected as low and unlikely)
- findings:
  - `[medium]` `[defer]` ECH-1: `relatorio/removed_at` is not server-only, so a crafted contract-28 push could tombstone an emitido relatório — coordinator decision 1 keeps it device-writable; no app surface writes it; ledger row under "Deferred from: fix batch fxrm".
  - `[low]` `[reject]` ECH-2: a generate job in flight writes revision/file ops onto a tombstoned relatório — harmless (the tombstone hides the relatório; its ops stay valid) and the target relatório has no job.
  - `[low]` `[reject]` ECH-3: a device's unpushed outbox ops land on the tombstone — AD-20 by design (an edit on a tombstone is applied and kept); the target is abandoned test data.
  - `[low]` `[patch]` ECH-4: `flag in ID_FLAGS` accepted `constructor` and other prototype keys — now `Object.hasOwn`; spawned-CLI test added.
  - `[low]` `[patch]` ECH-5: `--find` given twice silently replaced the text — now refused; spawned-CLI test added.
  - `[low]` `[reject]` ECH-6: a `--find` text starting with `--` is refused as a missing value — no row name starts so; the operator quotes another fragment.
  - `[low]` `[patch]` ECH-7: the runbook implied a restore tool — `infra/README.md` now says the CLI has no restore mode and a restore is a reviewed one-off `applyServerBatch` of null puts.
  - `[medium]` `[patch]` VG-1: the in-transaction re-check had no test (removing the `before` hook stayed green) — `TombstoneDeps.afterPlan` test seam plus a test that marks the relatório emitido between plan and apply; mutation run (hook made a no-op) turned it red, restored green.
  - `[medium]` `[patch]` VG-2: the CLI's dry-run and apply branches were never spawned — test spawns a dry run (exit 0, "dry run", no op) and the same ids with `--apply` (exit 0, two ops, both rows removed).
  - `[medium]` `[patch]` VG-3: the `homeCards` stale-summary branch was unreachable from the app (`home-store.ts` `liveRows` drops tombstones before `homeCards`) — reverted `cards.ts` to main and the claims in the KB and coordinator context; the unit test now feeds the fresh summary a device holds after the cleanup (the company pull runs before the relatório streams in one cycle, and the e2e covers the device path).

## Design Notes

- **Deviation 1 (scope of the project put):** the coordinator wrote "scope project"; `ENTITY_SCOPE.project` is `['company']`, so `opSchema` would refuse it. The project put is scope `company` (it travels in the company stream, where the project rows live).
- **Deviation 2 (find on relatórios):** a relatório row has no `name`; its card title is "⟨cliente⟩ · ⟨local⟩". `--find` matches a relatório on `setup.local` or `setup.atividade`, and lists every live relatório of a matched project.
- **Addition (project in use):** the project tombstone is refused while another live relatório belongs to it, mirroring the client rule; a conservative check, listed for veto.
- Production commands (the image after this PR is deployed carries `src/db/tombstone-cli.ts`):
  ```
  infra/bin/aws ecs run-task --cluster fasor-production --launch-type EC2 --task-definition fasor-production-migrate --overrides '{"containerOverrides":[{"name":"migrate","command":["./node_modules/.bin/tsx","src/db/tombstone-cli.ts","--find","TESTE v0.2.0"]}]}'
  ... "command":["./node_modules/.bin/tsx","src/db/tombstone-cli.ts","--company","<id>","--relatorio","<id>","--project","<id>","--client","<id>"]   (dry run)
  ... same plus "--apply"
  ```

## Verification

**Commands:**
- `podman compose --profile tools run --rm --user root tools pnpm test:unit -- packages/domain/src/ops packages/domain/src/contract packages/domain/src/home` -- expected: green.
- `podman compose --profile tools run --rm --user root tools pnpm exec vitest run --project api apps/api/src/db/tombstone.integration.test.ts` (or the api suite's own filter) -- expected: green.
- Story gate under `lockf -t 20000 /tmp/fasor-verify.lock`: `pnpm lint`, `pnpm static`, `pnpm test:unit`, `pnpm test:api`, then `pnpm exec tsx scripts/e2e.ts e2e/relatorio-tombstone.spec.ts e2e/sync.spec.ts --project desktop-chrome --project durability-desktop-chrome`.
