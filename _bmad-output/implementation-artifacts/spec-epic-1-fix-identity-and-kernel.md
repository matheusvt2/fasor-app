---
title: 'Epic 1 fixes: identity ids, device_id stamping, kernel status words and boot-time 401'
type: 'bugfix'
created: '2026-09-22'
status: 'done'
baseline_commit: '88a6664eb5a57069a5b706f08e0103ad7a548fa7'
baseline_revision: '88a6664eb5a57069a5b706f08e0103ad7a548fa7'
route: 'freeform'
dev_model: 'opus'
dev_effort: 'high'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-retro-2026-09-22.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-fasor-2026-09-21/ARCHITECTURE-SPINE.md'
warnings: ['multiple-goals', 'oversized']
deferred:
  - summary: >-
      Migration 0003 drops the identity registration columns without copying them into a user entity.
    evidence: |-
      Every user provisioned before this change has a slug id that no kernel row can name, so it has to be
      re-keyed by a re-seed, which re-applies the CLI registration. Only values edited through the removed
      PUT route on a local dev volume are lost. No production data exists (the MVP runs locally, AD-27).
    location: >-
      apps/api/drizzle/0003_user_registration_to_entity.sql
    severity: medium
  - summary: >-
      Pre-change devices of a re-keyed slug user are stranded: the releng-{slug} database, its pointer and outbox.
    evidence: |-
      userProfileSchema.id is now uuidv7, so a slug pointer is unreadable and the cold open goes to Login; the
      re-keyed user's device database is named after the new id; pending ops carry the slug actor. Only local
      dev devices exist before the MVP; the transition is a sign-in again after the re-seed.
    location: >-
      apps/web/src/state/last-session.ts; apps/web/src/db/schema.ts (databaseName); apps/api/src/db/seed.ts (dropLegacyUser)
    severity: medium
  - summary: >-
      Parallel api integration seeds on a brand-new volume can each append a user/{id} create before the entity exists.
    evidence: |-
      projectUser checks for the entity outside the per-company advisory lock; the second create is a no-op for
      state but the seed test's exactly-one-create assertion could fail on the very first run of a fresh volume.
      A concurrent re-seed could also put back company B's title while the sync test briefly changes it.
    location: >-
      apps/api/src/db/seed.ts (projectUser); apps/api/src/db/seed.integration.test.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** Epic 1 retro items A2, A4, A7, A8 (F-SPEC-3, F-SPEC-4, F-SPEC-5, F-DUP-2, F-DUP-4, AD-10 gap). Identity user ids are slugs and the seed CLI accepts v4 company ids while the kernel requires uuidv7, so no `user` entity ever reaches a device (Sync status prints raw ids, eviction says "0 pessoas da equipe", a CLI-provisioned company can never sync); the registration save is a raw `PUT` outside the op log so it cannot work offline; `device_id` is chosen by callers; status words, plurals and the auto-pull rule are duplicated in `apps/web`; `applyOps`/`toSnapshot` take a plain string company id; and a boot-time 401 wipes the last-session pointer, stranding the next offline cold open on Login.

**Approach:** Make user and company ids uuidv7 everywhere identity is born (seed CLI, `seedUser`, test seeds), have the server project each provisioned user into the company stream as a server-only `user/{id}` create op, make the kernel `user` entity carry the CAP-6 registration fields, and turn the registration save into `user/{id}/{field}` ops committed locally. Stamp `device_id` inside `commitBatch`. Move status words, count/plural phrases and the auto-pull predicate into `packages/domain` and brand the two server functions. Keep the pointer on a boot-time 401.

## Boundaries & Constraints

**Always:**
- `applyOp` stays the only reducer; the web writes only ops (AD-1); new server-authored ops go through `applyOps(..., { origin: 'server' })` with `device_id: SERVER_DEVICE_ID` and a new `system:identity` actor.
- The registration fields have exactly one home after this change: the kernel `user` entity (materialized `entities` row). The identity `user` table keeps only what better-auth needs plus `company_id`.
- A client may write `user/{id}/{field}` only for its own user id (`id === actor`); any other user id is rejected per op (AD-24 per-op code, e.g. `forbidden`), same company or not.
- Every changed API route keeps or gains a cross-tenant test (company A cannot read or write company B).
- pt-BR strings stay verbatim; derived text (status words, counts, plurals) is computed in the kernel.
- Deterministic test ids are fine but must pass `z.uuidv7()`.

**Never:**
- No UI styling changes beyond what these items require (A5 is a separate story). No redesign of the registration dialog beyond enabling offline save.
- Do not touch `LEGACY_TEST_COMPANY_IDS` / `LEGACY_USER` fixtures that deliberately test the old shape.
- No client-authored `user` create family; no change to AD-8 pull policy semantics (only its location).
- No rebase or force-push; no new runtime dependency (the `uuid` package is already present).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| CLI v4 company | `seed-users --company-id <v4 uuid>` | exits non-zero, message names uuidv7 and shows a v7 example | no rows written |
| CLI new user | valid v7 company id | user row with a uuidv7 id; a `user/{id}` create op in the company stream | - |
| Re-seed same email | user exists | same id kept; projection not duplicated (create is idempotent) | - |
| asCompanyId | v4 uuid / v7 uuid | throws / returns brand | - |
| Offline registration edit | device offline, dialog saved | ops `user/{me}/council|registration_number|title` in outbox, Account row text updates from local entity; pushed on reconnect; server entity and `GET /api/account` reflect it | - |
| Foreign user write | push `user/{other}/title` (same or other company) | that op rejected per op; others in the batch apply | 200 body with per-op code |
| commitBatch device | caller passes any `device_id` or none | every op carries the minted device id | - |
| Boot 401, pointer set | cookie gone, cached profile | Home with local data + re-auth banner; pointer still in localStorage; a second cold open offline reaches Home again | - |
| Boot 401, no pointer | no cached profile | Login | - |

</intent-contract>

## Code Map

- `apps/api/src/db/seed.ts` -- `idFor` (L38-40) used for user id (L69) and account id (L112); `seedUser` (L46-123) takes `companyId: string`; `resetTestCompanyData` (L172), `seedTestCompanies` (L181). Replace the user slug with a v7 id (keep existing id on re-seed), then project the user.
- `apps/api/src/db/test-seed.ts` -- `TEST_SEED.companies[].userId` are slugs (`seed-user-a-teste-local`); company ids already v7. Make user ids fixed valid v7 strings.
- `scripts/seed-users.ts` -- CLI; usage example L21-28 is v4-shaped; validate v7 and print a v7 example (optionally mint a company id when `--company-id` is omitted only if the CLI already supports company creation; otherwise require it).
- `apps/api/src/db/repositories/company-id.ts` -- `asCompanyId` hand-rolled any-uuid regex (L15-21); delegate to `uuidV7Schema`.
- `apps/api/src/db/schema.ts` -- `user` table L113-134 (`id text`, `council`, `registrationNumber`, `title`); drop the three registration columns with a forward Drizzle migration (next after `0002_sync_device_push`; `migrations-match.test.ts` guards drift).
- `apps/api/src/db/repositories/users.ts` -- `findUserProfile` (GET account), `updateUserRegistration` (dead after the route goes), `listUserProfiles`.
- `apps/api/src/http/account.ts` -- `GET /api/account` (L15-22, keep; compose registration from the materialized `user` entity), `PUT /api/account/registration` (L24-53, remove; nothing else calls it).
- `apps/api/src/sync/apply.ts` -- `ApplyDeps` already has `origin: 'server'` (L42-46, "no caller yet"); `validate` L50-73 (add own-user check for `user/field`); `applyOps` L172 `companyId: string` -> `CompanyId`; `applyOne` L89.
- `apps/api/src/sync/snapshot.ts` -- `toSnapshot(db, companyId: string, ...)` L15 -> `CompanyId`; callers only `replay.integration.test.ts`.
- `apps/api/src/sync/routes.ts` -- push L62-93 calls `applyOps` with `session.companyId`.
- `packages/domain/src/schemas/entities.ts` -- `userRowSchema` L141-147: replace `professional_registration` with `council` (nullable `councilSchema`), `registration_number`, `title` (nullable strings); keep `photo_location_enabled`.
- `packages/domain/src/ops/path.ts` -- `USER_FIELDS` L63 derived from the schema; `user/field` family L123/L242; add a server-only `user` create family modeled on the other `serverOnly` creates (L222-229).
- `packages/domain/src/ids.ts` -- actor doc L13; add `system:identity`.
- `packages/domain/fixtures/replay-small/op-log.ts` L379 -- uses `user/.../professional_registration`; update op and regenerate `snapshot.golden.json` (replay tests in domain, web `commit.test.ts`, api `replay.integration.test.ts`).
- `packages/domain/src/registration.ts` -- `registrationSchema` (camelCase), `userProfileSchema` (`id: z.string()`), `registrationRowText`; add a helper mapping a `Registration` to the three `user/{id}/{field}` put inputs and one reading the row fields back.
- `packages/domain/src/contract/*` -- sync routes typed here; add the account read (`GET /api/account`, response `userProfileSchema`) so `auth-client.ts` uses the contract path and schema, not a literal.
- `apps/web/src/api/auth-client.ts` -- `readAccount` L42-49 (literal path -> contract), `saveRegistration` L139-156 (remove).
- `apps/web/src/state/session.tsx` -- `doSaveRegistration` L208-212 (-> commit ops via `db/commit.ts`); boot 401 branch ~L120-133 calls `clearLastSession()` before checking `cached` (A8 bug).
- `apps/web/src/state/last-session.ts` -- pointer helpers, key `releng.last-session`.
- `apps/web/src/surfaces/account/registration-dialog.tsx` -- `save()` L61-62 bails when offline; `aria-disabled` tied to `props.online` L173-179: allow offline save.
- `apps/web/src/surfaces/account/account-surface.tsx` -- registration row reads `session.user.council...` (L82-85); read from the local `user` entity (fallback to the session profile while the row is absent).
- `apps/web/src/db/commit.ts` -- `CommitDeps {newId, now}` L27-30, `commitBatch` L92-102; add stamping of the minted id from `deviceId(db, newId)` (`db/sync-store.ts:22`); `OpInput` from `packages/domain/src/ops/op.ts:108` (callers of commitBatch must not supply `device_id`).
- `apps/web/src/surfaces/fixtures/field-fixture-surface.tsx` L45-62 -- hand-built op with `device_id: sync.deviceId ?? user.id`; move onto `commitBatch`.
- `apps/web/src/sync/engine.ts` -- auto-pull rule inline at `pullPhase` L214; dead fallback `row.device_id || device` L155; in-session 401 `runPhase` ~L262 (reference: never touches the pointer).
- `apps/web/src/state/sync.tsx` / `db/sync-store.ts` `localUsers` -- already read `user` entities; starved today.
- `packages/domain/src/status/table.ts` -- `statusLabel`, `StatusPillId`, `statusPillId`; add the auto-pull predicate here or in `sync/`.
- `packages/domain/src/sync/counts.ts:69` and `device/storage.ts:49` -- duplicated private `plural()`; export one.
- `apps/web/src/copy/ui.ts` -- `statusPill.label` L24-32 (duplicate words), `statusTile.label` L33-38 (inline plural).
- `apps/web/src/copy/pt-br.ts` -- inline plurals `sync.rejected` L139, `sync.superseded` L143, `recovery.holds` L184-188.
- `apps/web/src/components/status-pill.tsx:3` shadow `RelatorioStatus`; re-exported `components/index.ts:5`.
- Tests to update: `apps/web/src/surfaces/account/account-surface.test.tsx` L21/24, `apps/web/src/api/auth-client.test.ts` L15 (slug ids); `apps/api/src/auth/auth.integration.test.ts` (account route cross-tenant L219-252), `apps/api/src/sync/sync.integration.test.ts`, `scripts/tooling.test.ts`, `e2e/auth.spec.ts` (`1.3-E2E-002b` L148), `e2e/account*`/registration e2e, `e2e/sync.spec.ts`, eviction e2e.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/schemas/entities.ts`, `ops/path.ts`, `ids.ts`, `registration.ts`, `contract/*` -- user entity fields per CAP-6, server-only `user` create family, `system:identity`, registration<->ops helpers, `userProfileSchema.id` as uuidv7, account read in the contract -- kernel owns the shape.
- `packages/domain/fixtures/replay-small/*` -- update the user op and regenerate the golden -- replay stays byte-equal across kernel, web and api.
- `packages/domain/src/status/table.ts`, `sync/counts.ts`, `device/storage.ts` (+ new small module if cleaner) -- export `statusLabel` as the only words, one `plural` helper, count phrases (`relatoriosCount`, rejected/superseded, recovery holds, status tile label) and `isAutoPulled(status)` -- A7 single source.
- `apps/web/src/copy/ui.ts`, `copy/pt-br.ts`, `components/status-pill.tsx`, `components/index.ts`, `sync/engine.ts` -- consume the kernel; delete duplicate words, the shadow type and the inline rule; remove the dead `row.device_id || device` fallback.
- `apps/api/src/db/repositories/company-id.ts`, `sync/apply.ts`, `sync/snapshot.ts`, `sync/routes.ts` -- v7 `asCompanyId`; `CompanyId` on `applyOps`/`toSnapshot`/internal helpers; own-user check for `user/field` client ops.
- `apps/api/src/db/seed.ts`, `test-seed.ts`, `scripts/seed-users.ts`, `db/schema.ts` + new migration, `repositories/users.ts`, `http/account.ts` -- v7 ids, idempotent projection of the `user` create op (with any existing registration values) through `applyOps` origin server, drop registration columns and the PUT route, GET composes from the entity.
- `apps/web/src/db/commit.ts`, `surfaces/fixtures/field-fixture-surface.tsx` -- stamp minted device id; fixture uses `commitBatch`.
- `apps/web/src/api/auth-client.ts`, `state/session.tsx`, `surfaces/account/registration-dialog.tsx`, `account-surface.tsx` -- registration as ops, offline save, reads from the local entity; boot 401 keeps the pointer.
- `AGENTS.md` (outside the managed block, or a short paragraph in the spine) -- where a new user-facing string goes: kernel for derived text (status, counts, plurals, composed rows), `copy/pt-br.ts` for static surface copy, `copy/ui.ts` for component chrome.
- Tests: unit (asCompanyId, CLI validation, commitBatch stamping, kernel helpers, own-user rejection, session boot 401 keeping the pointer), api integration (projection on seed, re-seed idempotent, GET account after ops, cross-tenant on GET account and on `user/field` push), e2e (offline registration edit syncs; boot 401 then offline second cold open reaches Home with banner; eviction screen counts people; Sync status shows a name).

**Acceptance Criteria:**
- Given a fresh test reset, when the company stream is pulled, then it contains a `user/{id}` create for each seeded user with a uuidv7 id, and the Sync status "Último envio" row shows the user's name, not an id.
- Given the eviction recovery screen after a company pull, when it renders, then it reports the real number of people (at least 1), not "0 pessoas da equipe".
- Given the device is offline, when the user saves the registration dialog, then Account shows the new row text immediately, and after reconnect and a sync `GET /api/account` returns the new values; no request to `/api/account/registration` is made and that route returns 404.
- Given a push containing `user/{another user}/title`, when applied, then that op is rejected with a per-op code and the other user's row is unchanged; a user of company B cannot read company A's account data nor write its user rows.
- Given any caller of `commitBatch`, when ops are committed, then every op's `device_id` equals the device's minted id.
- Given `grep` over `apps/web/src`, when searching for the four pt-BR status words or `=== 1 ?` plural ternaries or the `'rascunho' || ... 'em_campo'` rule, then none remain outside imports from `@app/domain`.
- Given `applyOps` or `toSnapshot` called with a plain `string`, when typechecked, then it does not compile.
- Given a signed-in user whose cookie is gone, when the app is cold-opened twice (the second time offline), then both opens land on Home with local data and the re-auth banner, and the last-session pointer is still present.
- `pnpm verify` is green.

## Spec Change Log

## Review Triage Log

### 2026-09-22 — Review pass
- verdicts: 33 findings — high 0, medium 12, low 16, false 1, maybe-false 0 (4 intent-audit divergences folded as rows below)
- findings:
  - `[medium]` `[defer]` BH: migration 0003 drops registration columns with no copy — every pre-change user has a slug id and must be re-keyed by a re-seed (which now re-applies the CLI registration), so only values edited through the old PUT on a local dev volume are lost; no production data exists (MVP runs locally). Deferred with a note.
  - `[medium]` `[patch]` BH: re-seed ignores changed name/number/title — projectUser now applies server puts for differing fields; test added.
  - `[medium]` `[patch]` BH: client can write `user/{own}/name`, diverging from identity name — client `user/{id}/name` rejected `op_forbidden`; spine AD-3/AD-24 note.
  - `[medium]` `[defer]` BH: re-keying a slug user orphans the device db `releng-{slug}`, its pointer and outbox — pre-change devices are local dev only; recorded as transition note.
  - `[low]` `[reject]` BH: old outbox rows pushed without fallback device id — deviceIdSchema requires non-empty so every row already has one; the only odd value (user id from the dev fixture) is still a valid device id.
  - `[medium]` `[patch]` BH: commitOps still lets callers choose device_id — commitOps now stamps the minted id too.
  - `[low]` `[reject]` BH: deviceId opens its own transaction per commitBatch — no caller wraps commitBatch in an outer transaction; not worth caching complexity.
  - `[medium]` `[patch]` BH: session.user and pointer stale after registration save — optimistic update of user state and pointer after commit.
  - `[low]` `[patch]` BH: spine AD-24/AD-9/actor list not extended — dated sentences added.
  - `[low]` `[patch]` BH: ACCOUNT_ROUTES cast as SyncRoute — typed without the cast.
  - `[low]` `[patch]` BH: userProfileSchema.companyId not v7 — tightened.
  - `[medium]` `[patch]` BH: dismissReAuth clears persisted flag — dismiss is in-memory only.
  - `[low]` `[patch]` BH: account-surface test mutates shared fixture — per-test session object.
  - `[low]` `[patch]` BH: accountIdFor slug clash crashes on PK — account id minted with newId on insert.
  - `[false]` `[reject]` BH: spec not closed out — the workflow closes it at Finalize; not a code defect.
  - `[medium]` `[patch]` EC: re-seed ignores changed values (same root cause as BH re-seed) — see above.
  - `[medium]` `[defer]` EC: slug-id user sign-in fails on the v7 profile schema — same transition root cause as the re-key/device entry; re-seed required, recorded.
  - `[medium]` `[defer]` EC: slug pointer offline cold open lands on Login — same transition root cause.
  - `[medium]` `[defer]` EC: re-keyed user's pending outbox stranded — same transition root cause.
  - `[low]` `[reject]` EC: dropLegacyUser not atomic with the reinsert — failure mid-way is recovered by re-running the CLI; wrapping auth hashing and projection in one transaction adds complexity for an operator-only path.
  - `[low]` `[reject]` EC: concurrent seeds of the same new e-mail collide on unique email — operator CLI, one run crashes loudly and a re-run succeeds.
  - `[low]` `[patch]` EC: projection op_id = user id dedupes without materializing when the entity is gone — op id is now minted.
  - `[low]` `[patch]` EC: supplied userId can overwrite another user's row — clash check restored.
  - `[medium]` `[defer]` EC: migration 0003 data loss (claim) — same as BH row, deferred.
  - `[medium]` `[patch]` EC: offline save before the entity is pulled shows stale row — same root cause as the stale session entry; patched.
  - `[medium]` `[patch]` VG: persisted re-auth flag untested for the listener, sign-in and dismiss — three session tests added.
  - `[low]` `[patch]` VG: re-key test never plants push-register row or session — planted and asserted.
  - `[low]` `[reject]` VG other: v4 company silently gets 401 — no v4 company can be provisioned any more (CLI and asCompanyId refuse it).
  - `[medium]` `[patch]` IA: CLI does not mint a company id when none is supplied — minted and printed.
  - `[low]` `[patch]` IA: no test that company B's pull excludes company A's user create — assertion added.
  - `[low]` `[patch]` IA: nothing enforces A7's no-duplicate words in apps/web — tooling grep test added.
  - `[low]` `[patch]` IA: the branding @ts-expect-error may not be typechecked — confirmed or moved.
  - `[low]` `[reject]` IA: A8 persists a re-auth flag and changes the in-session path beyond the minimal reading — required by the scenario reading the spec's matrix row demands (second offline cold open shows the banner); kept.

## Design Notes

User entity field choice: SPEC.md CAP-6 says the account holds "name, council (CREA or CRT), registration number and title"; the kernel's single `professional_registration` string was never written by anything but the replay fixture, so it is replaced by `council`, `registration_number`, `title` (op paths `user/{id}/council` etc.), keeping `photo_location_enabled` (Epic 11 toggle). Registration values have one home, the entity; `GET /api/account` composes identity (name, email, company) with the entity row.

Projection: `seedUser` (the only user birth path, AD-9) mints/keeps the v7 id, then applies one server-origin create op `{ kind: 'create', scope: 'company', path: 'user/{id}', value: row }` via `applyOps(db, companyId, [op], { now, origin: 'server' })` only when the entity row does not exist yet. Spine delta to record (strike-through convention): AD-3 server-only families gain `user/{id}` (create); AD-4 server-minted exception list gains identity users and companies.

Offline edit before the user row is pulled: `applyOp` treats a put on a missing row as a no-op, so the Account row falls back to the session profile until the next pull; the ops still push.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm verify` -- expected: lint, static, unit, api, e2e all green.
- `docker compose --profile tools run --rm tools pnpm exec tsx scripts/seed-users.ts --company-id 8f3a2c1e-5b6d-4e7f-8a9b-0c1d2e3f4a5b ...` -- expected: non-zero exit naming uuidv7.

## Auto Run Result

Status: done

**Summary:** Epic 1 retro items A2, A4, A7 and A8. Identity user and company ids are uuidv7 (seed CLI mints and validates, asCompanyId refuses non-v7, test seeds use fixed v7 ids); each provisioned user is projected into the company stream as a server-only `user/{id}` create by `system:identity`, and a re-seed puts changed fields; the kernel user entity carries council, registration_number and title (CAP-6) and is the single home of the registration (migration 0003 drops the identity columns); the registration save is `user/{id}/{field}` ops committed locally and works offline; `PUT /api/account/registration` is removed (404) and `GET /api/account` is in the contract and composes identity with the entity; a client may write only its own user row and never `name` (`op_forbidden`). `commitOps`/`commitBatch` stamp the minted device id. Status words, plurals, count phrases and the auto-pull predicate live in `packages/domain`; `copy/ui.ts`, `copy/pt-br.ts`, `StatusPill` and the engine consume them, with a tooling guard. `applyOps`/`toSnapshot` take `CompanyId`. A boot-time 401 keeps the last-session pointer and a persisted re-auth flag keeps the banner on later offline cold opens. AGENTS.md says where a new string goes; the spine gains dated sentences in AD-3, AD-4, AD-9 and AD-24.

**Review:** 33 findings: 21 patched (medium 9, low 12), 6 deferred (grouped into the three `deferred` items), 6 rejected with reasons in the triage log.

**Follow-up review recommended:** true. More than two medium entries were patched (re-seed puts, name ownership, commitOps stamping, optimistic session update, dismiss flag, CLI company mint); the unverified risk is the re-seed put path interacting with concurrent test seeds.

**Verification:** `docker compose --profile tools run --rm tools pnpm verify` EXIT 0: domain 288, web 326, scripts 17, api 66, e2e 21 passed.

**Residual risks:** see `deferred`.
