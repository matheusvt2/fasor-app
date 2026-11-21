---
title: 'Epic 26, batch e26a: roles in the kernel and the api (Stories 26.2, 26.3, 26.4)'
type: 'feature'
created: '2026-11-21'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-26-context.md'
warnings: ['batched']
deferred: []
---

<!-- batched: three stories of one wave share one contract number, one set of files (ops/path.ts, contract/*, sync/rules.ts, session.ts, seed.ts) and are strictly dependent (26.3 needs 26.2, 26.4 needs both). The coordinator's launch prompt batches them. -->

<intent-contract>

## Intent

**Problem:** The product has no roles. Every user may write every op and call every route. Epic 26 adds five seeded roles, twelve permission keys and custom roles; this batch is the part that decides and enforces: the kernel verdict (26.2), the data and the migration (26.3), the server refusals (26.4). No screen, no Admin route, no e-mail (later batches).

**Approach:** `packages/domain/src/permissions/` holds the keys, the seeded role sets, `can`, `permissionForPath`, `permissionForRoute`, `activeUser`, `lastAdminVerdict`. Roles and a user's `role_id` and `status` are company data that travel as server-only ops in the sync log. The server reads the actor's role once per push and refuses with `op_forbidden`; routes answer `403 forbidden`; a not-active user gets `401`.

## Boundaries & Constraints

**Always:** The text of Stories 26.2, 26.3, 26.4 in `_bmad-output/planning-artifacts/epics.md` (grep `### Story 26.2`; read with offset/limit, never the whole file) and the Epic 26 header (`## Epic 26`) are the requirements: read them first, they win over this spec's summaries. The kernel is the only place that knows a key, a role set or an "Admin" condition (AD-1, AD-13); `apps/api` and `apps/web` call it. No role name in a condition outside the kernel's Admin rule. Nothing is deleted. No relatório, seed (template seed), fold of a sheet, golden or printed page changes. Every existing test user is Admin; never edit what an existing test asserts (setup helpers and fixtures may seed an Admin role for an actor; an assertion never changes). If an existing test goes red because of a role in a way a setup change cannot fix, STOP and report it to the orchestrator in your report; do not alter the assertion. No emoji. English code and comments; every authored pt-BR sentence marked `// authored (Story 26.x)`. Keep the permission check in `checkClientOp` self-contained (one early block that calls one helper), because Epic 27 adds another rule to `sync/rules.ts` after this merges. Strike-through rule of AGENTS.md for any planning sentence that is changed.

**Never:** Any screen, route of the Admin, e-mail, SES, web change (`apps/web` only if a kernel type change forces a compile fix, and then minimal). Do not touch `sprint-status.yaml` or `epics.md`. Do not run `pnpm test:e2e`, `test:e2e:full` or the matrix. No Playwright run outside the host lock. Do not copy anything from `docs/context/` or `docs/media/`. Do not run pnpm/node on the host: everything in the `tools` container (`podman compose --profile tools run --rm --user root tools pnpm ...`), under `lockf /tmp/fasor-verify.lock` for any gate or Playwright run.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error |
|---|---|---|---|
| Table | each seeded role x each of the 12 keys | `can` equals the epic's table | none |
| Locked Admin | Admin role stored with empty set | `can` yes for every key | none |
| Unknown role | no role resolved (absent `role_id`, missing row) | `can` false for every key (server fails closed) | none |
| Map coverage | every family of `FAMILIES`, sample path | one of the 12 keys or `'none'`, never throws | a new family with no entry fails the kernel test |
| Last Admin | one active Admin; change = pause, remove, other role | refused; allowed with a second active Admin | `lastAdminVerdict` returns a refusal |
| Server-only | client op `role/{id}` create, `role/{id}/{field}`, `user/{id}/role_id`, `user/{id}/status`, `user/field` naming `role_id` or `status` | `op_server_only` (parse gives a server-only family) | per op |
| Client op by role | Engenheiro de Campo pushes a sheet put, a `template/field` put and a `registry/field` put in one batch | first applied, the other two `op_forbidden`, each alone | per op |
| Routes | Gestor calls generate; Consulta downloads an issued PDF; RT generates | 403 `forbidden` and no job; served; works | `403 {code:'forbidden'}` |
| Inactive | paused or removed user with a valid cookie pushes or reads | 401 (code readable by the device), nothing applied; sign-in refused | 401 |
| Tenant | Admin of company A acts on company B | refusal unchanged (`op_tenant_mismatch` / 404) | unchanged |
| Contract | bundle on 54 pulls from a 55 server | `426 contract_outdated` | unchanged mechanism |
| Migration | two companies, five users, migrated twice | 5 system roles per company, every user active Admin, counts unchanged on the second run | none |

</intent-contract>

## Code Map

Kernel (`packages/domain/src`):
- `ops/path.ts` -- `FAMILIES` (append-only list, ~60), `opPathSchema`, `USER_FIELDS` (derived from `entityKeys('user')`, so new user fields leak into `user/field` unless excluded), `isServerOnly`, `userFieldPath`. Add families at the END of both the union and `FAMILIES`.
- `schemas/entities.ts` -- `entityRowSchemas` (append `role`), `ENTITY_SCOPE` (`role: ['company']`), `userRowSchema` (add optional `role_id` and `status`; optional because a row born before contract 55 lacks them until the migration), `rowIndexColumns`; grep for exhaustive `Record<Entity, ...>` the compiler will name (budget, materialize, pull).
- `contract/errors.ts` -- `opRejectCodeSchema` (append-only; reuse `op_forbidden`), `errorCodeSchema` (append `forbidden` and the inactive-user code, e.g. `user_inactive`; name them in AD-29).
- `contract/version.ts` -- `CONTRACT_VERSION` line 648, `MIN_CONTRACT_VERSION` ~1030: both to 55 with a dated block comment (2026-11-21, Story 26.2, batch e26a: a 54 bundle's path enum lacks the `role` families and `user/{id}/role_id|status`, so a pulled op fails to fold; its pull answers 426, its pushes are still accepted). Epic 27 takes 56 after this.
- New `permissions/` (index exported from `src/index.ts`): `keys.ts` (closed zod enum of the 12 keys, module of each, pt-BR module names and key labels as derived text), `roles.ts` (`roleRowSchema {id, name, permissions[], system?, removed_at?}`, `SYSTEM_ROLE_IDS` = `admin|engenheiro_de_campo|gestor_do_projeto|responsavel_tecnico|consulta`, seeded sets as data = the epic's table, one constant uuidv7-shaped row id per system role so every company gets the same ids, `systemRoleRows(...)`), `can.ts` (`can(role, key)`, Admin system role answers yes to every key whatever is stored: the one "Admin" condition in the codebase; `keysOf(role)`), `map.ts` (`permissionForPath(path, op)` -> key or `'none'`; `permissionForRoute(name)`), `user.ts` (`activeUser(user)`: status `active`, absent counts as active; `invited`, `paused`, `removed` do not act; status words), `last-admin.ts` (`lastAdminVerdict(users, change)`).
- Tests next to the code: `permissions/*.test.ts` named "26.2-UNIT ...": the table cell by cell, locked Admin, full coverage over `FAMILIES` (build a sample path per family, fail when a family has no entry), last-Admin cases, status words, server-only parse, contract number.

Api (`apps/api/src`):
- `sync/rules.ts` -- `checkClientOp` (line ~99), `ClientCheckCache`/`clientCheckCache()`; called from `sync/apply.ts:565` for `origin === 'client'` only, inside the push transaction. Add the role check as the FIRST block after the existing equipment_type_version early line (or first of all), reading the actor (`op.actor_id`) user row and its role row once per push into the cache; refuse `op_forbidden` when `permissionForPath(path, op)` is a key the role lacks. A refused op never blocks the rest of its batch (already so).
- `sync/apply.ts` -- `validate` (line ~200-235: server-only and `user/field` refusals; `user/field` for `role_id`/`status` must be `op_server_only`), `applyServerBatch` (server ops), the entity upsert at line ~623.
- `http/session.ts` -- `SessionContext {userId, companyId}`, `sessionMiddleware`, `requireSession`. Add the actor's `role` (the row resolved from `role_id`) to the context; add `requirePermission(c, key)` answering 403 `forbidden`; a user who is not `activeUser` gets 401 with the inactive code, on every request (so the device's re-auth path keeps its outbox). Sign-in refusal for `paused`/`removed`: find the better-auth sign-in path in `apps/api/src/auth/auth.ts`; refuse in a hook with a code the Login can name (do not change `auth.ts` beyond that hook; Epic 26 batch e26c edits it later).
- Routes to guard (grep `app.post|app.get` in `http/` and `sync/routes.ts`): `/api/relatorios/:id/generate`, `preview`, `preview.pdf`, audit POST, reread POST need `relatorio.issue`; `/api/revisions/:id/docx|pdf` need `export.download`; `/api/files` upload needs `relatorio.fill`; a file read needs `relatorio.view`. Sync pull/push, account, telemetry stay open to an active user.
- `db/seed.ts` -- `seedUser` (line ~168), `projectUser` (line ~106, applies the `user/{id}` create via `applyServerBatch`), `seedAccount`, `seedTestCompanies`, `seedE2eWorkerPairs`; `db/e2e-worker-seed.ts` (`workerSeed`, ids `e2e00000-00XX-7000-8000-{index}`, `E2E_WORKER_USER_REGEXP`, `E2E_WORKER_USER_LIKE`), `db/test-seed.ts` (`TEST_SEED`), `db/smoke-seed.ts`, `db/sample-relatorio.ts`, `db/e2e-leak-check.ts` (treats a worker pair as one unit; the new users must be inside the pair and match the regexp). Add `role` to `seedUser` input (default Admin) and `scripts/seed-users.ts --role <system id>` (usage text, validation, test in `scripts/` or `seed-cli.integration.test.ts`).
- Migration: a data step like `db/template-seed-upgrade.ts`, called from `main.ts` (line ~48) and `db/migrate-cli.ts` after `upgradeTemplateSeeds`: for each company, write the five system roles as server-only ops (`system:admin`) when absent, then every user row without a role gets `user/{id}/role_id` = Admin and `user/{id}/status` = `active`. Idempotent (second run writes nothing); decided and written under the company lock like `projectUser`.
- No other function may insert/update `entities` directly: all through `applyServerBatch` (the coordinator asked: do not add a direct write).
- Pull: roles and user role/status are company-scope ops, so `pullCompany` already ships them; assert it in a test, do not add an endpoint.

KB and docs: `_bmad-output/planning-artifacts/architecture/architecture-fasor-2026-09-21/ARCHITECTURE-SPINE.md` (append AD-29 after AD-28; grep `AD-28`; do not read the whole file), `_bmad-output/specs/spec-fasor/source-deltas.md` (the row of 2026-11-21 says "planned": strike through and add the built record beside it with the date), `docs/kbs/architecture/roles-and-permissions.md` (new concept; follow the front matter of a sibling), `docs/kbs/architecture/index.md`, `docs/kbs/architecture/sync.md` (session and tenancy lines), `docs/kbs/code/domain-package.md`, `docs/kbs/code/api-app.md`, `docs/kbs/log.md`. Update only those.

## Tasks & Acceptance

**Execution:** Work in two phases.

PHASE 1 (Story 26.2, the kernel slice). Do first:
1. AD-29 and the `source-deltas.md` built record (decisions: transport as server-only ops; optional `role_id`/`status` on the user row; `user/role_id` and `user/status` as their own server-only families and excluded from `USER_FIELDS`; `role` and `role/field` families; constant system role ids; Admin computed never stored; absent role = no keys; the new codes; the one verdict in the kernel; Amelia's alternative not taken, per the story text).
2. The `permissions/` module, the entity and families, error codes, contract 55 with its dated reason, exports from `src/index.ts`, and every compile fix the compiler asks for in `apps/api` and `apps/web` (minimal).
3. The mapping rules (the coordinator's readings of Story 26.2): moving a relatório to `Em revisão` (a `relatorio/status` put whose value is that status) needs `relatorio.fill`; to `Emitido` needs `relatorio.issue`; any other status value (for example back to `Rascunho`) needs `relatorio.fill`. Project, relatório creation and `relatorio/setup`, `relatorio/export/scheme`: see the epic's module table (create keys: `relatorio.create`; the export scheme belongs to the issuing step: `relatorio.issue`). `relatorio/removed_at` (any op kind): `relatorio.delete`. Location, block, sheet, equipment (create, field), file (create, field), point, `location/funcao`, `location/checklist`: `relatorio.fill`. `suggestion/status`: `relatorio.fill` (a reading suggestion is confirmed in the ficha; `suggestion.review` is kept for the Cadastros side; record this as an open reading in AD-29 and the PR). `registry`, `registry/field`: `registry.edit`, EXCEPT the registry kinds the ficha writes from a field surface (read `apps/web/src/surfaces/ficha/ficha-ops.ts` and the callers of `registryPath`): those kinds map to `relatorio.fill` and the exception and its list are written in AD-29 (coordinator's reading, open to Matheus). `template`, `template/field`: `template.edit`. `equipment_type`, `equipment_type/field`, `equipment_type_version`: `equipment_type.edit`. `user/field`: `'none'` (own profile; the owner rule stays in `validate`). `user/role_id`, `user/status`: `users.manage`; `role`, `role/field`: `roles.manage`. Pure server families (`file/server`, `generation_job*`, `revision`, `audit_run*`, `equipment/last_*`, `template/seed_version`, `relatorio/preview_file_id`, `suggestion`, `user` create): `'none'`.
4. Unit tests "26.2-UNIT-*" green with `pnpm test:unit -- packages/domain/src/permissions` (and the contract/path tests: update the contract number assertions only where they assert the NUMBER, which is the intended change; list each such edit in your report), then `pnpm lint` and `pnpm static` for the slice.
5. Commit the slice, `git push -u origin e26a-roles-kernel-api`, then STOP and report the sha to the orchestrator (a short message: sha, what the slice exports). The orchestrator notifies the coordinator and tells you to continue. Do not start Phase 2 before that message.

PHASE 2 (Stories 26.3 and 26.4):
6. `user` row: `seedUser`/`projectUser` write `role_id` and `status` in the create (default Admin, `active`); a re-seed with another `--role` puts `user/{id}/role_id` when it changed (server op). A new company gets its five system roles with its first user (`ensureCompany` path, in the same company lock). `TEST_SEED` and every e2e worker user stay Admin; `workerSeed` gains, inside each worker's Empresa A pair, one user per other seeded role (`engenheiro_de_campo`, `gestor_do_projeto`, `responsavel_tecnico`, `consulta`) with deterministic uuidv7-shaped ids and e-mails, updating `E2E_WORKER_USER_REGEXP`/`LIKE` and `workerIndexOfUser` so the leak check passes. Put them in company A only (the pair is the unit); document the ids and e-mails in the file header and `docs/kbs/code/api-app.md`.
7. The data migration step and its call sites (boot and `migrate-cli`); `scripts/seed-users.ts --role`.
8. `checkClientOp` role check and `validate` change; `SessionContext.role`; `requirePermission`; guards on the routes listed; inactive-user 401 and sign-in refusal; the kernel text for `op_forbidden` "your role does not allow this" (a derived text in `packages/domain`, distinct from the two causes the device names today: find where the web maps `op_forbidden` to a reason, grep `op_forbidden` in `apps/web/src` and `packages/domain/src`, and add the third case there with the smallest web change; the reason sentence is authored pt-BR, listed in the PR).
9. Tests: "26.3-API-001" (migration on a copy of the fixture database or two seeded companies, twice; CLI flag; the pull carries the role rows and the user's role and status), "26.4-API-001" (matrix: for each of the 12 keys, a role lacking only that key is refused on one action of that key, a role holding it is accepted), "26.4-API-002" (routes), "26.4-API-003" (inactive user, last), the one-batch scenario of the epic (applied + two `op_forbidden`), a client write of `role/*`, `user/{id}/role_id|status` refused `op_server_only` through the sync route, tenant refusal unchanged, 426 for a 54 header on pull. e2e `e2e/roles-server.spec.ts` "26.4-E2E-001 @p0": an Engenheiro de Campo's refused op shows as rejected in Sync status with the new reason (sign in as the seeded field user, make the refused edit, open Sync status). Check whether a new spec that does not time a tap must go in `SERIAL_SPECS` (`scripts/e2e.test.ts` fails otherwise).
10. Existing-test sweep: `grep -rn` over `apps/api/src` and `e2e/` and `apps/web/src` for places that build a user row or push as an actor without a seeded user; fix helpers (never assertions). Restart the api container after changing `packages/domain`/`apps/api` before `test:api` (`podman compose restart api`).
11. KB files and `docs/kbs/log.md`.

**Acceptance Criteria:** the Given/When/Then of Stories 26.2, 26.3 and 26.4 in `epics.md` (all of them), plus:
- Given the whole existing api and unit suites, where every user is Admin, when they run, then they pass with no change to what they assert.
- Given a `git diff origin/main --stat`, then no golden, no seed v14-v16 file and no `docx`/`layout` file changed.

## Spec Change Log

## Review Triage Log

## Design Notes

- Absent `role_id` on a user row is "no role": the server grants nothing (fail closed). Absent `status` is active. Both only occur between the deploy and the migration, which runs at the api's boot and in `migrate-cli` before traffic.
- `permissionForPath(path, op)` takes the op because `relatorio/status` depends on its value. It returns a single key, never a set.
- Admin: the stored Admin row's `permissions` is ignored by `can`; the migration/seed write it with all 12 keys anyway so a reader that lists a role's keys sees them.
- Open readings to list in the PR: `suggestion/status` -> `relatorio.fill`; the ficha-written registry kinds -> `relatorio.fill`; `relatorio/export/scheme` -> `relatorio.issue`; `role/field` carries `removed_at` for a later story's custom-role removal; role change takes effect on the user's next request.

## Verification

**Commands (inside the tools container, under the host lock for the gate):**
- `pnpm test:unit -- packages/domain/src/permissions` -- expected: green (Phase 1).
- `pnpm lint`, `pnpm static`, `pnpm test:unit`, `pnpm test:api`, then `pnpm exec tsx scripts/e2e.ts e2e/roles-server.spec.ts --project desktop-chrome` -- expected: all green, logs under `.scratch-e26a/`.
