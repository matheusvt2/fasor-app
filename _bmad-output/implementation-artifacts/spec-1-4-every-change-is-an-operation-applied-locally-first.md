---
title: 'Every change is an operation applied locally first'
type: 'feature'
created: '2026-09-21'
status: 'done'
baseline_commit: '7789990ad903049765d2d92a7ef09fb98eaa64f9'
baseline_revision: '7789990ad903049765d2d92a7ef09fb98eaa64f9'
route: 'freeform'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-fasor-2026-09-21/ARCHITECTURE-SPINE.md'
warnings: ['oversized']
deferred:
  - summary: 'Run the replay byte-equality test on the Porto Seguro op-log fixture once Story 3.7 ships it.'
    evidence: 'The AC names the Porto Seguro fixture (Story 3.7) and the small fixture; only the small fixture can exist now. The replay harness in this story takes any Op[] log, so 3.7 only adds the second input.'
    location: 'packages/domain/fixtures/replay-small/'
    severity: 'medium'
  - summary: 'Validate seed-defined path segments (nameplate fieldKey, checklist itemKey, testKey, cell row/col) against getDefinition(seed_version, block_type) once Story 3.1 ships the seed.'
    evidence: 'AD-11/AD-21 resolve those keys through the seed, which does not exist yet; this story validates them structurally only.'
    location: 'packages/domain/src/ops/path.ts'
    severity: 'low'
  - summary: >-
      Make applyOps reject server-only families, device_id "server" and actor_id "system:*" for client-origin pushes once the push route exists.
    evidence: |-
      validate() in apps/api/src/sync/apply.ts checks only isServerOnly(path) against device_id, so a client op that sets device_id "server" passes; nothing in this story calls applyOps from a client, so the check belongs to the Story 1.5 push route, which knows the origin. Settled by an origin argument (or a client entry point) plus an integration test that pushes a spoofed server-only op and expects op_server_only.
    location: >-
      apps/api/src/sync/apply.ts:46-62
    severity: medium
  - summary: >-
      Re-materialize an entity on the device when the server marks one of its ops dead (AD-24), excluding dead ops from entities and toSnapshot.
    evidence: |-
      apps/web/src/db/commit.ts applies every committed op; nothing consults outbox.status = dead when reading entities, so the Dexie replay test filters dead ops itself. The rejection arrives only through the push response of Story 1.5, which must re-run applyOp over the entity's log minus dead ops. Settled by a test that marks a committed op dead and expects toSnapshot to drop its effect.
    location: >-
      apps/web/src/db/commit.ts
    severity: medium
  - summary: >-
      Architect decision: coalescing keeps the last client_ts, so a server that only sees the merged op materializes a later first_edited_at than the device; choose (a) or (b) below.
    evidence: |-
      Confirmed empirically on the full small fixture through commitOps: the device block holds first_edited_at 2026-09-20T10:26:00.000Z while a replay of the pushed (coalesced) outbox yields 10:27:00.000Z; 64 live ops become 63 outbox rows. The AD-3 coalescing rule and the AD-18 materialization rule are each followed and disagree by construction. Options: (a) do not coalesce when last.client_ts equals the block's first_edited_at (one condition in apps/web/src/db/commit.ts, needs a source-deltas.md row); (b) re-materialize the block on pull in Story 1.5. The test "coalescing vs first_edited_at (deferred hand-off)" in apps/web/src/db/commit.test.ts pins the current divergence so it cannot change silently; whichever option lands flips that assertion.
    location: >-
      packages/domain/src/ops/outbox.ts:25; apps/web/src/db/commit.ts:57-63
    severity: medium
dev_model: 'fable'
dev_effort: 'high'
---

<intent-contract>

## Intent

**Problem:** Nothing under `packages/domain/ops`, `apps/web/src/db` or a Postgres materializer exists yet, so no write in the product has a durable, replayable, device-first form; every later story (sync, screens, generation) depends on this invariant being right.

**Approach:** Build the operation log as the architecture's core invariant: the `Op` and `OpPath` zod schemas with `parsePath`/`formatPath`, the single reducer `applyOp` with its derived-column and tombstone semantics, the Dexie 4 store `releng-{user_id}` whose commit writes the op to `outbox` and applies it in the same transaction, a Drizzle/Postgres materializer that calls the same `applyOp`, an injectable clock and id convention on both sides, and a replay test proving the two layers produce byte-equal `RelatorioSnapshot`s from one log.

## Boundaries & Constraints

**Always:** `packages/domain` stays pure TypeScript with zod as its only dependency; it never mints ids or reads the clock (`newId()` and `now: Date` are passed in). `applyOp` is the only code that turns an op into state, on both sides; adapters only load rows, call it and write rows back. Op shape, families, coalescing, batch/undo and tombstone rules follow AD-3, AD-12, AD-17, AD-18 and AD-20 of the spine verbatim; the family list is append-only. `apps/web` writes only through `commitOps` (one Dexie `rw` transaction covering `entities` and `outbox`) and reads only through `useLiveQuery`; no module outside `src/{sync,files,api}` calls `fetch` (existing lint rule). Dexie versions are append-only, each with an `upgrade()`. Every timestamp is UTC ISO 8601; derived timestamps (`first_edited_at`, `last_modified_at`) come from the op's `client_ts` so both layers agree byte for byte. Postgres table names match `scripts/test-reset.ts` (`ops`) and the new `entities` table is added to its list. Everything runs through `docker compose` (project from `{WT}/.env`); versions from the spine Stack table (Dexie 4.x, drizzle-orm 0.45, drizzle-kit 0.31, uuid v7 11+). English identifiers; no emoji; no `fasor` in user-visible strings.

**Never:** No sync HTTP routes, push/pull engine, rebase, `seq` cursors or `POST /api/sync/ops` (Story 1.5). No screens, hooks bound to React components, banners or Home (Stories 1.2, 1.6); the field-commit timing lives in a pure controller. No seed definitions, `getDefinition`, block field lists or the Porto Seguro fixture (Epic 3). No session/auth (Story 1.3): `user_id` for the store name is a parameter. No renderer, `groupForPrint`, `progress`, `preIssue`, `integrity`. No merge policy; `prev_op_id` is recorded, never interpreted. No wildcard paths, no second encoding of a path, no raw Dexie table writes outside `src/db`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Round trip | Every client and server-only family fixture path | `formatPath(parsePath(p)) === p`, family and typed segments returned | N/A |
| Unknown family | `sheets/abc/nameplate/x` | `parsePath` rejects | Error names the family segment |
| Unknown field | `location/{id}/colour` | Rejected: not a key of the location schema | Error names entity and field |
| Server-only family | `file/{id}/uploaded_at` pushed with `device_id != server` | `isServerOnly(path)` is true; the api materializer rejects with `op_server_only` | Code returned, op not stored |
| Duplicate create | Second `create` on an existing id | State unchanged, op still logged | N/A |
| Remove and restore | `remove` then `put removed_at = null` | `removed_at` set then cleared; snapshot excludes then includes the row | N/A |
| Provenance | `put` with `meta.source_suggestion_id`, then plain `put` | Cell `source_suggestion_id` set, then `null`; cell `op_id` is the last op | N/A |
| Attribution | Ops under `sheet/{b}/*`, `block/{b}/not_tested`, photo `file` with `block_id = b` | Block `first_edited_at` (first only), `last_modified_by/at` from op `actor_id`/`client_ts`; `created_by` from the create op | N/A |
| Coalesce | Two consecutive pending `put` on one path, same device, no `meta`/`batch_id` | One outbox row: last `op_id`, `value`, `client_ts`, first `prev_op_id` | N/A |
| No coalesce | Either op has `meta` or `batch_id`, or a different path intervenes | Two outbox rows | N/A |
| Batch and undo | N changes committed as one batch | N ops share `batch_id`; `undoBatch` writes N inverse ops in a new `batch_id` | N/A |
| Atomic commit | `applyOp` throws mid-batch | Neither `entities` nor `outbox` changed | Error propagates |
| Upgrade | Outbox rows written at Dexie version 1, database reopened at version 2 | Rows intact, `upgrade()` ran | N/A |
| Replay | Small fixture log in `seq` order through pure `replay`, Dexie and Drizzle; dead op ids excluded | Three identical `serializeSnapshot` strings, equal to the golden | Diff printed |
| Dedupe | Same `op_id` applied twice to Postgres | Second apply returns the existing `seq`, state unchanged | N/A |
| Determinism | Every time-reading kernel function called with two fixed dates | Different, expected results; no `Date.now`/`new Date()` in `packages/domain/src` | Source scan test fails otherwise |

</intent-contract>

## Code Map

Greenfield for this story; the scaffold from Story 1.1 is the only code.

- `packages/domain/package.json` -- `@app/domain`, `exports: {".": "./src/index.ts"}`, deps `zod ^4.6.5` only; add an export for the fixture module. `packages/domain/src/index.ts` re-exports `product.ts` (`PRODUTO`) and `contract.ts` (`healthResponseSchema`); add the new modules here.
- `apps/web/package.json` -- deps react 19.3, react-aria-components 1.21, vite 8.3, vitest 5; no dexie, uuid or fake-indexeddb yet. Tests run in Node (no jsdom); `apps/web/src/db/.gitkeep`, `src/input/.gitkeep` are placeholders to replace. `apps/web/src/styles/styles.test.ts` shows the test style.
- `apps/api/package.json` -- hono 4.13, `postgres ^3.4.9` (postgres.js), pg-boss 12, zod; no drizzle yet. `apps/api/src/db/client.ts` `createDb(url) -> postgres(url, {max: 5})`; `apps/api/src/main.ts` boots config, S3 bucket, pg-boss, then Hono (insert `migrate()` after `createDb`). `apps/api/src/boot.integration.test.ts` is the pattern for tests that hit the compose stack (reads `process.env`, runs inside `tools`). `apps/api/src/config.ts` zod env schema (`DATABASE_URL` etc.).
- `docker-compose.yml` -- `x-app-env` anchor (`RUNNING_IN_COMPOSE=1`, `DATABASE_URL=postgres://app:app@postgres:5432/app`) is shared by `install`, `api`, `web` and `tools`; `tools` (profile `tools`) runs `pnpm verify` against live `postgres`/`api`. `pnpm-workspace.yaml` has `allowBuilds: {esbuild: true}` and `minimumReleaseAgeExclude`; new packages that need build scripts or are too fresh must be listed there.
- Root `package.json` scripts: `lint` (eslint .), `static` (per-package `typecheck` then root tsc), `test:unit` (domain + web vitest + root `scripts/**`), `test:api` (`vitest run -t '^(?!.*@slow)'` in `apps/api`, so every `*.test.ts` there runs), `test:e2e` (Playwright `@p0`), `verify` chains them. `tsconfig.base.json`: ES2023, `moduleResolution: Bundler`, `strict`, `noUncheckedIndexedAccess`, `allowImportingTsExtensions` (imports carry `.ts`).
- `eslint.config.js` -- import-direction `no-restricted-imports` per package and the fetch-location rule (`apps/web/src/**` except `src/{sync,files,api}`); test files are linted; `scripts/tooling.test.ts` lints synthetic snippets and scans `apps/web/src` for the codename.
- `scripts/test-reset.ts` -- `TABLES = ['ops','files','revisions','generation_jobs','reading_runs']`, deletes `where company_id = $1`; add `entities`.
- Spine anchors (loaded via `context`): AD-3 lines 67-74 (op shape, family list, coalescing, replay test), AD-9 line 115 (`releng-{user_id}`), AD-12 line 133 (`source_suggestion_id` from `meta`, cell `{value, source_suggestion_id, op_id}`), AD-15 line 151 (`RelatorioSnapshot` contents), AD-17 line 163 (UTC ISO timestamps), AD-18 line 169 (attribution columns), AD-20 line 181 (tombstones), AD-24 line 205 (dead ops excluded, `outbox.status = dead`), Consistency Conventions lines 229-233, Stack lines 239-273, Structural Seed lines 286-300.
- Test ids to name in `describe` blocks (`_bmad-output/test-artifacts/test-design-qa.md` lines 300-304, 354-355): 1.4-UNIT-001 path round trip, 1.4-UNIT-002 applyOp semantics, 1.4-UNIT-003 coalescing, 1.4-UNIT-004 provenance and attribution, 1.4-UNIT-005 schema-reference (no company/project-scope schema references a relatorio-scope row), 1.4-UNIT-006 clock injection, 1.4-INT-001 replay byte-equality.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/ids.ts`, `packages/domain/src/clock.ts` -- `NewId`/`Clock` types, `uuidV7Schema` (`z.uuidv7()`), `isoTimestampSchema`; no minting, no `Date.now` -- TC-1, TC-2
- `packages/domain/src/schemas/entities.ts` -- zod row schemas for project, relatorio (`setup`, `status`, `export.scheme`), location (`se`/`env`/`agrupar_por_tipo` only on `kind = cabine`), block (with `sheet` sub-object of cells `{value, source_suggestion_id, op_id}`, `not_tested`, `concluded_by`, derived `created_by`, `first_edited_at`, `last_modified_by`, `last_modified_at`), equipment, file (AD-7 union, minimal), point, suggestion, registry rows per kind (`empresa|client|instrument|manufacturer|voltage_class|atividade|local|criterion`), template, user, generation_job, revision; `ENTITY_SCOPE` map and `entityKeys(entity)` -- AD-5, AD-10, AD-18
- `packages/domain/src/schemas/snapshot.ts` -- `relatorioSnapshotSchema` (AD-15 contents, tombstones excluded), `buildSnapshot(rows)` and `serializeSnapshot()` (canonical JSON: sorted object keys, arrays ordered by `order_key` then `id`) -- AD-15
- `packages/domain/src/ops/op.ts` -- `opSchema` exactly as the AC, refinements for `project_id`/`relatorio_id` by scope, `seq` optional non-negative int, `makeOp(input, {newId, now})` -- AD-3
- `packages/domain/src/ops/path.ts` -- `OpPath` discriminated union over every AD-3 client and server-only family, `parsePath`, `formatPath`, `isServerOnly`, `targetOf(path)`; `{field}` checked against `entityKeys`; seed-defined segments checked structurally (`^[a-z0-9_]+$`, ints for row/col) -- AR-3
- `packages/domain/src/ops/apply.ts` -- `targetsOf(op): EntityRef[]` and `applyOp(state, op): state` over a `ReadonlyMap<entityKey, row>` of the touched rows; AC semantics plus AD-12 provenance and AD-18 attribution; pure and total -- AR-3, AR-17
- `packages/domain/src/ops/outbox.ts` -- `coalesce(prev, next)` rule, `invertBatch(ops, before, {newId, now})`; `packages/domain/src/ops/replay.ts` -- `replay(log, {deadOpIds})` reference reducer in `seq` order -- AD-3, AD-24
- `packages/domain/src/checks/unsynced.ts` -- `unsyncedForDays(oldestPendingClientTs, now, days = 5)`; the one time-reading kernel function this story owns -- TC-1
- `packages/domain/fixtures/replay-small/op-log.ts` + `snapshot.golden.json` -- one relatorio, one cabine, three blocks, fixed uuidv7 ids and timestamps, every op kind, a batch, a tombstone plus restore, a `meta` provenance put, a photo file with `block_id`, one dead op id; exported as `@app/domain/fixtures/replay-small` -- 1.4-INT-001
- `packages/domain/src/**/*.test.ts` -- 1.4-UNIT-001..006 plus matrix rows; a source-scan test asserting no `Date.now`, `new Date()` without argument, `Math.random` or `crypto.randomUUID` in `packages/domain/src` -- TC-1, TC-2
- `apps/web/package.json` -- add `dexie`, `dexie-react-hooks`, `uuid`; devDependency `fake-indexeddb` (latest 4.x Dexie the registry allows under the pnpm release-age rule; note the chosen versions in Implementation Notes) -- Stack table
- `apps/web/src/clock.ts`, `apps/web/src/ids.ts` -- `now()` and `newId()` (uuid v7); the only places `apps/web` reads the clock or mints ids -- TC-1, TC-2
- `apps/web/src/db/schema.ts` -- Dexie `AppDatabase` named `releng-{user_id}` with `entities` (`[entity+id]`, indexes `relatorio_id`, `project_id`, `entity`), `outbox` (`op_id`, `status pending|sent|acked|dead`, `error_code?`, indexes `status`, `path`, `client_ts`), `drafts`, `files`, `sync_state`, `local_prefs`; versions 1 and 2, each with `upgrade()`; `openDatabase(userId)` -- AD-9, Conventions
- `apps/web/src/db/commit.ts` -- `commitOps(db, ops)` in one `rw` transaction over `entities` + `outbox`: load `targetsOf`, `applyOp`, write rows, append or coalesce outbox rows; `commitBatch(db, inputs, deps)`, `undoBatch(db, batchId, deps)` -- FR-32, FR-54, AR-1
- `apps/web/src/db/snapshot.ts` -- `toSnapshot(db, relatorioId)` via `buildSnapshot`; `apps/web/src/db/live.ts` -- re-export `useLiveQuery` (the one import of dexie-react-hooks) -- AD-15, AD-1
- `apps/web/src/input/field-commit.ts` -- pure `createFieldCommitter({commit, idleMs: 500, timers})` with `change`, `blur`, `enter`, `immediate`; whichever fires first commits once -- AD-1
- `apps/web/src/db/*.test.ts`, `apps/web/src/input/field-commit.test.ts` -- fake-indexeddb tests for the matrix rows (atomic commit, coalescing, batch/undo, upgrade survival, Dexie replay equals `replay()` and the golden); fake timers for the committer -- 1.4-UNIT-003, 1.4-INT-001
- `apps/api/package.json` -- add `drizzle-orm`; devDependency `drizzle-kit`; `apps/api/drizzle.config.ts`; `apps/api/drizzle/` generated migrations (`docker compose run --rm tools pnpm --filter @app/api exec drizzle-kit generate`) -- Stack table
- `apps/api/src/db/schema.ts` -- Drizzle tables `ops` (`seq bigserial` PK, `op_id uuid` unique, `company_id`, `scope`, `project_id`, `relatorio_id`, `kind`, `path`, `value jsonb`, `prev_op_id`, `batch_id`, `meta jsonb`, `actor_id`, `device_id`, `client_ts timestamptz`, `received_at`) and `entities` (PK `company_id, entity, id`; `relatorio_id`, `project_id`, `row jsonb`, `removed_at`, `updated_seq`); `apps/api/src/db/client.ts` -- also return the drizzle instance; `apps/api/src/db/migrate.ts` -- `migrate()` from `drizzle/`, called in `main.ts` before the queue starts -- AD-10, AD-3
- `apps/api/src/sync/apply.ts` -- `applyOps(db, companyId, ops)`: validate with `opSchema` + `parsePath`, reject `op_invalid|op_path_unknown|op_server_only`, per-op transaction: insert op (existing `op_id` returns its `seq`), load `targetsOf`, `applyOp`, upsert `entities`; returns `{applied, rejected}`; `apps/api/src/sync/snapshot.ts` -- `toSnapshot(db, companyId, relatorioId)` -- AD-3, AD-4, AD-24
- `apps/api/src/clock.ts`, `apps/api/src/ids.ts` -- server `now()`/`newId()` -- TC-1, TC-2
- `apps/api/src/sync/replay.integration.test.ts` -- migrates, uses a fresh `company_id`, applies the small fixture, asserts `serializeSnapshot` equals `replay()` and the golden, asserts duplicate `op_id` dedupe and the rejection codes, cleans its rows -- 1.4-INT-001
- `scripts/test-reset.ts` -- add `entities` to `TABLES` -- deferred-work item from Story 1.1
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- change only `1-4-every-change-is-an-operation-applied-locally-first: backlog` to `review` -- workflow

**Acceptance Criteria:**
- Given the op log module, when `parsePath` receives any AD-3 path, then it returns family and typed segments, rejects unknown families and unknown `{field}` keys, and `formatPath(parsePath(p)) === p` for every fixture path.
- Given `applyOp`, when create/put/remove ops are applied, then a second create is a no-op, remove sets `removed_at`, `put removed_at = null` restores, and `first_edited_at`, `last_modified_by`, `last_modified_at`, `source_suggestion_id` are materialized only by `applyOp`.
- Given the Dexie store `releng-{user_id}`, when `commitOps` runs, then the op is written to `outbox` and applied through `applyOp` in the same transaction, coalescing consecutive plain puts on one path from the same device, and a failure leaves both tables untouched.
- Given a bulk commit of N changes, when committed and undone, then N ops share one `batch_id` and undo writes N inverse ops in a new batch.
- Given the small fixture log, when replayed in `seq` order through `replay()`, the Dexie layer and the Drizzle layer against the compose Postgres, then the three `serializeSnapshot` strings are byte-equal and match the golden, with dead op ids excluded on every side; and outbox rows written at Dexie version 1 survive reopening at version 2.
- Given the kernel, when any function reads time or needs an id, then it takes `now: Date` or `newId` explicitly, `apps/web` and `apps/api` each pass them from one clock and one id module, and a kernel test calls every time-reading function with two fixed dates and gets the expected different results.
- Given the merge gate, when `docker compose run --rm tools pnpm verify` runs, then lint, static, unit, api and Playwright `@p0` pass in under 15 minutes.

## Spec Change Log

## Review Triage Log

Layers: BH = Blind Hunter, EC = Edge Case Hunter, VG = Verification Gap, IA = Intent Alignment.

### 2026-09-21 — Review pass
- verdicts: 39 findings — high 0, medium 21, low 16, false 2, maybe-false 0
- findings:
  - `[medium]` `[patch]` BH: catch-all in applyOps turns infrastructure failures into permanent op_invalid — verified (any throw was mapped); patched: only a zod ZodError from applyOp is op_invalid, everything else rethrows.
  - `[medium]` `[patch]` BH: concurrent applyOne calls on one entities row lose updates — verified (read, apply, upsert without a lock); patched: pg_advisory_xact_lock(hashtext(company_id)) opens every applyOne transaction.
  - `[medium]` `[patch]` BH: bigserial seq allocated at insert, not commit, so it is not a safe per-company cursor — verified; patched by the same per-company lock (insert order equals commit order per company), schema comment updated.
  - `[medium]` `[defer]` BH: op_server_only check bypassed by a client op with device_id "server" — verified; no client caller exists before the Story 1.5 push route, which knows the origin; deferred with the settling test.
  - `[low]` `[reject]` BH: coalescing and undo order derive from client_ts, which can tie or step backwards — ties resolve by the op_id primary key, a monotonic uuidv7 minted in commit order, and batch ops never coalesce; a clock step backwards is rare and the fix adds a new index and column.
  - `[low]` `[reject]` BH: no way to apply an op without appending it to the outbox (applyRemote) — real only for the pull path, which Story 1.5 owns; the replay test's use of commitOps for server ops is test-only.
  - `[medium]` `[patch]` BH: store boundary (dexie only in src/db) not lint-enforced — verified; patched: no-restricted-imports for dexie, dexie/*, dexie-react-hooks outside apps/web/src/db, with a tooling test.
  - `[medium]` `[patch]` BH: isoTimestampSchema accepts no-millis and 6-digit fractions, breaking byte-equality for foreign ops — verified; patched: z.iso.datetime({ precision: 3 }) plus negative tests.
  - `[medium]` `[patch]` BH: timestamptz mode string reads back Postgres text, not canonical ISO — verified; patched: customType with fromDriver toISOString, round-trip asserted in the integration test.
  - `[low]` `[patch]` BH: Dexie v2 adds the unused [entity+relatorio_id] index — verified; patched by removing it before the version ships.
  - `[low]` `[patch]` BH: three private sortKeys copies for the golden comparison — verified; patched: tests compare with serializeSnapshot(relatorioSnapshotSchema.parse(golden)).
  - `[false]` `[reject]` BH: 1.4-UNIT-002 mislabel on batch and undo — test-design-qa.md line 301 lists batch_id grouping and undo under 1.4-UNIT-002, so the label is right.
  - `[low]` `[patch]` BH: interface Partial shadows the global Partial<T> — verified; renamed Step.
  - `[low]` `[reject]` BH: parsePath runs several times per op — negligible cost for the op sizes involved; the fix threads a pre-parsed path through public signatures.
  - `[low]` `[patch]` BH: determinism scan misses process.env, performance.now, Buffer, dynamic node imports and has a false-positive quote pattern — verified; patterns added and the import pattern fixed.
  - `[medium]` `[patch]` BH: derived field lists make user/email, point/origin, template/version and seed_version writable — verified; IMMUTABLE_KEYS extended with tests.
  - `[low]` `[patch]` BH: stray export of entityKey and toIso from commit.ts — verified; removed.
  - `[medium]` `[patch]` EC: opPathSchema.parse inside parsePath can throw a ZodError that is not a PathError, aborting the whole batch in validate — verified; patched: safeParse rethrown as PathError, test with a huge cell index.
  - `[medium]` `[patch]` EC: applyOne non-schema errors reported as permanent op_invalid — same root cause as the first BH finding; patched with it.
  - `[medium]` `[patch]` EC: concurrent applyOne on the same row loses an update — same root cause as the BH lost-update finding; patched with the advisory lock.
  - `[medium]` `[defer]` EC: client op spoofing device_id "server" writes server-only families — same as the BH bypass finding; deferred to the Story 1.5 push route.
  - `[medium]` `[patch]` EC: a create whose value carries foreign relatorio_id, project_id or company_id lands in another stream — verified; patched: the create refinement requires the row ids to equal the envelope (documented exception: relatorio/{id} owner project_id when the envelope leaves it unset), with op.test.ts.
  - `[medium]` `[patch]` EC: U+0000 in a value passes zod and Dexie but Postgres jsonb rejects it — verified; patched: value refinement rejects it, with tests.
  - `[low]` `[patch]` EC: rejection entry op_id becomes "[object Object]" for a non-string op_id — verified; patched: string or empty.
  - `[low]` `[reject]` EC: last-by-client_ts coalescing with ties or a clock step backwards — same reasoning as the BH ordering finding: uuidv7 primary key breaks ties in commit order.
  - `[low]` `[reject]` EC: commitOps with an op_id already sent, acked or dead resets it to pending — no caller re-commits an existing op; pulled-op dedupe by op_id is the sync engine's job (Story 1.5) and the guard adds a branch for an unreachable case today.
  - `[low]` `[reject]` EC: undoBatch with an unknown batch returns an empty list — the empty result is the documented contract; throwing is new behavior for a caller that does not exist yet.
  - `[medium]` `[patch]` EC: undoBatch inverts dead rows, sending the inverse of a never-applied op — verified; patched: dead rows filtered before invertBatch, with a test.
  - `[low]` `[reject]` EC: invertBatch puts null for a non-nullable field when the row was absent at commit and present at undo — requires a put that was a no-op at commit (row absent) followed by the row's creation before the undo; speculative, and readPath at undo time changes the undo contract.
  - `[medium]` `[patch]` EC: a throwing commit callback drops the typed value while pending reads false — verified; patched: the value is restored as pending and the error rethrown, with a test.
  - `[medium]` `[patch]` EC: a fresh database fires populate, not upgrade(), so db_version is never stamped on new devices — verified; patched: on('populate') stamps the opened version, with a test.
  - `[false]` `[reject]` EC (claim): applyOp is not total because a bad value throws — the intent-contract matrix row "Atomic commit" requires applyOp to throw so the Dexie transaction rolls back; the "pure and total" wording in the task list describes purity over valid input.
  - `[low]` `[reject]` EC (claim): undo of a batch holding a relatorio create yields fewer than N inverses — verified and documented in Implementation Notes: AD-3 defines no removed_at family for relatorio, so its create has no inverse; template instantiation undo is not a slice action.
  - `[medium]` `[defer]` EC (claim): the Dexie layer never excludes dead ops itself; the replay test filters them — verified; re-materialization on rejection is the push response handling of Story 1.5; deferred with the settling test.
  - `[low]` `[reject]` EC (claim): {field} lists for location, block, equipment, file and generation_job are hand-written, not schema-derived — those families' fields are enumerated verbatim by AD-3, so the explicit lists are the rule; schema derivation applies to the open {field} families only, and the only fix would edit this spec's wording.
  - `[medium]` `[patch]` VG: boot-time migrate() in main.ts observed by no test because the replay test migrates itself — pre-verified gap; patched: replay test no longer migrates, boot.integration.test.ts asserts ops and entities exist once the api is healthy.
  - `[medium]` `[patch]` VG: oldestPendingClientTs status filter never distinguished from "oldest of any status" — pre-verified gap; patched with an acked-then-pending test.
  - `[medium]` `[patch]` VG (other): catch-all in applyOps — same root cause as the first BH finding; patched with it.
  - `[low]` `[reject]` IA: AC3 is phrased at the screen surface while the diff stops at commitOps and an unbound field-commit controller — the epic itself places every screen in Stories 1.2, 1.3 and 1.6, so no screen can exist here; the controller plus commitOps are the contract those stories bind, and the new dexie lint rule enforces the store boundary for them.

## Design Notes

- **Porto Seguro fixture (Story 3.7) does not exist.** The AC's replay on it cannot run yet; this story ships the replay harness (`replay()`, Dexie replay, Drizzle replay, `serializeSnapshot`) parameterized on any `Op[]` log and proves it on the small fixture only. Recorded in `deferred`; Story 3.7 adds the second input without changing the harness.
- **Byte-equality across processes.** Dexie tests run in `apps/web` vitest and the Drizzle test in `apps/api` vitest; the lint boundary forbids importing one app from the other. Each layer is compared with the kernel's pure `replay()` serialization and with the committed golden, which is transitive equality; the golden also catches silent reducer changes.
- **`applyOp` state granularity.** `state` is the map of rows named by `targetsOf(op)` (the target row, plus the block row when a photo `file` op carries `block_id`), so both adapters load a handful of rows per op instead of a whole snapshot; `applyOp` returns the new map and adapters write back only rows that changed. Attribution timestamps use `op.client_ts`, the only time both layers share.
- **Seed-defined segments.** `sheet/{b}/nameplate/{fieldKey}`, checklist `itemKey`, `testKey` and cell `row/col` resolve through the seed (AD-11, AD-21, Story 3.1); until then `parsePath` validates them structurally and the value is any JSON. Entity `{field}` keys are derived from the entity zod schemas, so later stories extend a schema and `parsePath` follows.
- **Field-commit timing is a pure controller.** No screen exists yet and Story 1.2 is adding React test tooling concurrently; the controller (`change`/`blur`/`enter`/`immediate`, 500 ms idle) is unit-tested with fake timers and the first screen story binds it to a hook.
- **`seq` is a global bigserial**, monotonic per company as AD-3 requires; per-company numbering adds locking for no benefit before multi-tenant sync exists.
- **Migrations run at api boot** (`migrate()` before pg-boss), forward-only; the integration test calls the same function so `pnpm verify` needs no extra step.

## Implementation Notes

- Versions chosen by `pnpm add` under the release-age rule (2026-09-21): `apps/web` dexie 4.4.6, dexie-react-hooks 4.4.0, uuid 14.0.2, fake-indexeddb 6.2.5 (dev); `apps/api` drizzle-orm 0.45.2, uuid 14.0.2, drizzle-kit 0.31.10 (dev); `packages/domain` @types/node 24.13.6 (dev, for the fs-reading tests only; the source-scan test forbids Node built-ins in kernel sources).
- `remove` ops carry the `{entity}/{id}/removed_at` path (the field the family list enumerates) so remove and restore share one path for `prev_op_id` and last-writer-wins; `removed_at` is set to the op's `client_ts`.
- A `put` or `remove` on a row that does not exist is a no-op on both layers (the op is still logged); a create or put whose value breaks the row schema throws inside `applyOp`, which aborts the Dexie transaction and makes the api reject the op with `op_invalid` without storing it.
- Undo needs the value each op replaced: `commitOps` stores it as `prev_value` on the outbox row (from the kernel's `readPath`), and `undoBatch` feeds those to `invertBatch`. A create is undone by a `remove`; `relatorio/{id}` has no `removed_at` family and is skipped.
- Dexie version 2 adds the `batch_id` index on `outbox` (undo) and `[entity+relatorio_id]` on `entities`; `openDatabase(userId, {upToVersion})` exists only for the upgrade-survival test.
- The api boots with `migrate()` from `apps/api/drizzle` before the queue; the replay integration test calls the same function and uses a fresh `company_id`, so `pnpm verify` needs no extra step.

## Verification

**Commands:**
- `docker compose up -d` -- expected: postgres, minio, api and web healthy (api logs show migrations applied)
- `docker compose run --rm tools pnpm lint` -- expected: clean
- `docker compose run --rm tools pnpm static` -- expected: clean
- `docker compose run --rm tools pnpm test:unit` -- expected: domain (1.4-UNIT-001..006, matrix rows), web (fake-indexeddb, committer) green
- `docker compose run --rm tools pnpm test:api` -- expected: replay integration test green against the compose Postgres
- `docker compose run --rm tools pnpm verify` -- expected: green, under 15 minutes, output kept for the PR

## Auto Run Result

Status: done

**Summary.** The operation log is in place as the architecture's core invariant: `Op` and `OpPath` zod schemas with `parsePath`/`formatPath` over the 38 AD-3 families, the single reducer `applyOp` with tombstone, provenance and attribution semantics, the Dexie store `releng-{user_id}` whose `commitOps` appends to the outbox and applies in one transaction (coalescing, batch and undo included), a Drizzle materializer over `ops` and `entities` with boot-time migrations and per-company serialization, the injectable clock and id convention on both sides, and the replay harness proving pure replay, Dexie and Drizzle byte-equal against a committed golden on the small fixture.

**Files changed.**
- `packages/domain/src/{ids,clock}.ts` -- NewId/Clock types, uuidv7 and canonical ISO schemas
- `packages/domain/src/schemas/{entities,snapshot}.ts` -- entity row schemas, RelatorioSnapshot, buildSnapshot, serializeSnapshot
- `packages/domain/src/ops/{path,op,apply,outbox,replay}.ts` -- OpPath families, Op schema, applyOp, coalesce/invertBatch, reference replay
- `packages/domain/src/checks/unsynced.ts` -- unsyncedForDays(now)
- `packages/domain/fixtures/replay-small/` -- fixed-id op log and golden snapshot
- `packages/domain/src/**/*.test.ts`, `src/test-support.ts` -- 1.4-UNIT-001..006, replay reference, tombstone snapshot, determinism scan
- `apps/web/src/db/{schema,commit,snapshot,live}.ts`, `apps/web/src/input/field-commit.ts`, `apps/web/src/{clock,ids}.ts` -- device store, atomic commit, field-commit controller, one clock and id module
- `apps/web/src/**/*.test.ts` -- fake-indexeddb tests for commit, coalescing, batch/undo, upgrade survival, Dexie replay
- `apps/api/src/db/{schema,migrate,client}.ts`, `apps/api/drizzle/`, `apps/api/drizzle.config.ts` -- ops and entities tables, migrations at boot
- `apps/api/src/sync/{apply,snapshot}.ts`, `apps/api/src/{clock,ids}.ts`, `apps/api/src/main.ts` -- server materializer, server toSnapshot, boot wiring
- `apps/api/src/sync/replay.integration.test.ts`, `apps/api/src/boot.integration.test.ts` -- Drizzle replay against compose Postgres, rejection codes, dedupe, boot migration check
- `eslint.config.js`, `scripts/tooling.test.ts` -- dexie import boundary rule
- `scripts/test-reset.ts` -- `entities` table added
- `apps/web/package.json`, `apps/api/package.json`, `packages/domain/package.json`, `pnpm-lock.yaml` -- dexie 4.4.6, dexie-react-hooks 4.4.0, uuid 14.0.2, fake-indexeddb 6.2.5, drizzle-orm 0.45.2, drizzle-kit 0.31.10, @types/node (domain tests)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- story 1.4 to review

**Review findings.** 39 findings from four layers. Patched: 22 rows (medium 16, low 6) in 19 fixes, all applied by the implementation subagent and verified. Deferred: 4 rows in 2 items (op_server_only origin check for the Story 1.5 push route; device re-materialization when an op goes dead). Rejected: 13 rows -- 2 false (UNIT-002 label matches test-design; applyOp must throw for the atomic-commit matrix row) and 11 low (client_ts ties resolved by the uuidv7 key, applyRemote belongs to the pull path, repeated parsePath cost, re-commit of an existing op_id unreachable, empty undo result is the contract, speculative null put on undo, relatorio create has no inverse by AD-3, explicit AD-3 field lists, AC3 screen surface belongs to Stories 1.2/1.3/1.6). Every rejected row carries its reason in the triage log.

**Follow-up review recommendation:** true. Patched counts by verdict: medium 16, low 6, high 0. Named unverified risk: the per-company advisory lock and the ZodError-narrowed rejection path in `apps/api/src/sync/apply.ts` were patched without a concurrency test; a follow-up pass should exercise two parallel `applyOps` calls on one block and a simulated connection failure.

**Verification.** `docker compose run --rm tools pnpm verify` green after the patches (lint, static, domain 9 files, web 4 files, root tooling, api 4 files including the Drizzle replay against Postgres, Playwright `@p0`), about 1 minute; log kept at `/tmp/verify-s14.log`. Matrix audit: every intent-contract row is covered by a test that ran in that output (the tombstone snapshot row by `packages/domain/src/schemas/snapshot.test.ts`, added during the audit).

**Residual risks.** Coalescing keeps the last `client_ts` while `first_edited_at` is materialized from the first op applied on the device, so a server that only sees the merged op materializes a later `first_edited_at` than the device; the replay test runs over an already-coalesced log and cannot see it (spine-level, flagged for Story 1.5). New dependencies in `apps/web` and `apps/api` will conflict with the parallel Story 1.2 and 1.3 pull requests in `package.json` and `pnpm-lock.yaml`. Story 1.5 must pass the op origin to `applyOps` and handle dead-op re-materialization (both deferred above).
