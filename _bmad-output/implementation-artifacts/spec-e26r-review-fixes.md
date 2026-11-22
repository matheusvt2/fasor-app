---
title: 'e26r: fixes from the integrated review of Epic 26 (2026-11-22)'
type: 'bugfix'
status: 'ready-for-dev'
dev_model: 'opus'
dev_effort: 'high'
warnings: ['batched']
---

# e26r review fixes

Batched: six small items of one review, all in the users, roles and sessions surface (AD-29), one PR. No contract
number (Epic 27 holds 57), no migration expected (report before writing one). Context: `epic-26-context.md`.
Rules: English code and docs, pt-BR UI copy, no emoji, never "laudo", never delete a planning sentence (strike and
add dated). Do not edit what a pre-Epic-26 test asserts; if the permission system denies an edit, stop and report the
file and message. You cannot start containers: the orchestrator runs every gate; run nothing on the host.

## Items

1. **Reactivate ends the user's sessions.** `apps/api/src/admin/users.ts`: `endAccess` (pause, remove) keeps sessions
   (owner's decision, do not change). `setStatus` to `active` (reactivate) deletes the user's `session` rows in the
   same transaction (a `write` in the plan, like `endAccess`; scope by `userId` and the company). The user signs in
   again with the same password; the device's outbox survives through the re-auth path. Also stop an inert session's
   expiry from sliding: `apps/api/src/http/session.ts` calls `auth.api.getSession`; better-auth 1.7.5
   (`dist/api/routes/session.mjs` ~170-183) refreshes `expiresAt` when `updateAge` elapsed unless `query.disableRefresh`
   is set. Make the lookup for a user who is not active not refresh: call with `query: { disableRefresh: true }` first;
   when the user is active and a refresh is due (compute with `SESSION_EXPIRES_IN_SECONDS` / the update age, exported
   from `auth/auth.ts`), call again normally (or equivalent); keep one auth lookup in the common case. The get-session
   guard in `http/app.ts` ~311-320 uses the same middleware; check it. Tests: update `26.11-API-001`
   (`apps/api/src/http/admin-users.integration.test.ts` ~148-165, ~288+) and the paused e2e spec
   (`e2e/paused-user-unsent.durability.spec.ts`) to the new rule: after reactivate the old session answers 401 and the
   Login appears; signing in again sends the unsent work. Add an api test that a request with a paused user's session
   does not move `session.expires_at` (mutation run: revert the disableRefresh and see it red). These are this epic's
   own tests: change their expectation and say so. Fix the stale comment of `endAccess` ("A reactivation makes the
   kept sessions work again").
2. **Reactivate needs a live role.** In `setStatus` to `active`, call `liveRole(state, target.kernel.role_id)` and
   answer `role_not_found` when the role was removed or absent (same error as create/edit). Api integration test
   through the route. The Usuários screen (`apps/web`, the user row / dialog of Story 26.9) then asks the Admin to pick
   a role: find how the screen shows a route error today and use an existing refusal text or a kernel sentence; list
   any authored sentence in your report. A web test and, if a spec already drives reactivate in `e2e/users-screen.spec.ts`,
   a case for it (a user whose custom role was removed, reactivate refused with the sentence; after editing the role,
   reactivate works).
3. **Production refuses the fake mailer.** `apps/api/src/config.ts` superRefine: `NODE_ENV === 'production'` with
   `EMAIL_PROVIDER=fake`, or `ses` with `EMAIL_FROM === DEFAULT_EMAIL_FROM`, fails the boot the way `SESSION_SECRET`
   does (a `custom` issue, path, message). Remove or keep the `main.ts` ~110 log accordingly (it becomes unreachable;
   remove it). CAREFUL: production has neither variable in `infra/production/ecs.tf` today, so in the same PR add
   `EMAIL_PROVIDER = "ses"` and `EMAIL_FROM = local.email_from` (display name stays "Conforme" in code) to
   `api_environment`, only when `local.email_enabled` (the `for` over a map: merge a conditional map, keep terraform
   fmt style). With `email_domain` null the api would refuse to boot: say so in a comment, and in `infra/README.md`
   "E-mail" and the `email.tf` header (strike the "Not here on purpose" sentence, add the dated line). Do NOT run
   terraform. Existing tests that load a production config with the default mailer (`apps/api/src/config.test.ts`
   ~88, ~163, ~168, ~190, others: grep `NODE_ENV: 'production'` over `apps/api` and `scripts`) must still load: add
   `EMAIL_PROVIDER: 'ses', EMAIL_FROM: 'no-reply@example.com'` to those inputs only (never their assertions) and
   list each. Check `api-prod` in `docker-compose.yml` (NODE_ENV production, the app-env anchor): set the two
   variables there so the local prod profile still starts, EMAIL_PROVIDER=ses would fail without credentials only at
   send time (check `apps/api/src/email/`: the ses provider must not call AWS at boot); report what you set. Grep
   `infra/bin/*`, `scripts/` and `README.md` ("Running the prod profile") for other boots with NODE_ENV=production.
   New config tests: production + fake refused, production + ses + placeholder refused, production + ses + real
   address accepted, non-production + fake accepted.
4. **First pull at sign-in.** `apps/web/src/sync/first-pull.ts` and `engine.ts`: the throwaway engine consumes the
   "merged by rule" pairs (`queuePulledPairs` in `pullStream` when `downloaded_at !== null`) and moves the cursor, so
   the app's real engine never sees them. Pick the smaller change: run the first pull only when the company stream was
   never downloaded (`readSyncState(db, COMPANY_STREAM)?.downloaded_at` null/absent; return false, nothing else, when
   it was). Test it (a downloaded stream is skipped and its ops are left for the app's engine; a never-downloaded one
   pulls). Also in `pullStream` check `stopped` before `writeSyncState` (and before `applyPulled` if cheap) so the
   10 s cut cannot move a cursor back; unit test with a stopped engine (cursor unchanged). Both are in
   `apps/web/src/sync/*.test.ts`; do not change what the pre-26.10 sync tests assert.
5. **Stale comments** saying a pause deletes sessions: `apps/web/src/state/session.tsx` (`onReAuthRequired`),
   `apps/web/src/api/auth-client.ts` (sign-out). Grep `apps` and `packages` for any other ("pause" near "session"
   in comments, `docs/kbs`, AD-29 line "only pause and remove end sessions (Story 26.8)": strike it, add the dated
   line: pause and remove keep inert sessions; reactivate ends them).
6. **Trace and report (fix only if broken, with a test).** (a) After a reactivation, with no reload, does the
   device's sync engine resume after the new sign-in? Read `state/session.tsx`, `sync/engine.ts` (`onReAuth`, `paused`,
   start/resume), the Login flow after a re-auth, and say which function resumes the engine and what clears the
   paused state; the paused e2e spec's "signing in again sends the unsent work" assertion is the proof (no reload
   between). (b) How the outbox treats `op_forbidden`: the op is kept and shown (where, which sentence), never retried
   forever, no lost work; cite `sync/policy.ts`, the engine's push phase and the outbox statuses, and the existing
   tests that pin it. If any link is broken, fix it with a test and say so.

## Docs

AD-29 dated lines in `_bmad-output/planning-artifacts/architecture/architecture-fasor-2026-09-21/ARCHITECTURE-SPINE.md`
(strike the old sentence with `~~...~~`, add the new one with the date 2026-11-22); `docs/kbs/architecture/roles-and-permissions.md`,
`docs/kbs/architecture/sync.md`, `docs/kbs/code/api-app.md`, `docs/kbs/code/web-app.md` wherever they describe sessions on
pause/reactivate; one entry in `docs/kbs/log.md`. Do not edit `epics.md` or `sprint-status.yaml`.

## Acceptance (Given/When/Then, one line each)

- Given a paused user with a kept session, when the Admin reactivates him, then the old session answers 401 and a new
  sign-in works with the same password.
- Given a paused user's request, when it arrives after the update age, then `session.expires_at` is unchanged.
- Given a user whose role was removed, when he is reactivated, then `role_not_found` and no change.
- Given NODE_ENV=production with the fake mailer or the placeholder sender, then boot fails; with ses and a real
  sender it boots; ecs.tf carries both variables when `email_enabled`.
- Given a company stream already downloaded, when the user signs in, then the first pull does not run.
- Given a stopped engine mid-pull, then the stored cursor does not change.

## Report (under 400 words)

Per item: what changed (files), tests added or changed and why (list any test input edited), authored sentences,
what in item 6 you traced (function names), anything that did not hold or not done, and every grep you ran over `e2e/`
and the web tests for strings, op paths and behaviours changed, with hits (names of specs the orchestrator must run).
