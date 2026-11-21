---
title: 'Epic 26, batch e26c: e-mail seam, password links and the Admin user routes (Stories 26.6 api, 26.8)'
type: 'feature'
created: '2026-11-21'
status: 'ready-for-dev'
baseline_revision: 'bca24cc8'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-26-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-e26a-roles-kernel-api.md'
warnings: ['batched']
deferred:
  - 'Story 26.6 web half (Login "Esqueci minha senha", the set-password page /definir-senha) and its e2e specs 26.6-E2E-001/-002: batch e26d (owner), they need the approved frames.'
---

<!-- batched: 26.8 needs 26.6's seam, links and fake store, and both edit auth.ts, app.ts, config.ts, errors.ts and the same test fixtures. The coordinator's launch prompt batches them. -->

<intent-contract>

## Intent

**Problem:** No e-mail leaves the app and the Admin has no way to add, change, pause or remove a user. Epic 26 needs both before any screen can exist.

**Approach:** One `EMAIL_PROVIDER` seam (`fake` default stores messages in a table the tests read; `ses` sends through SESv2, client faked in tests). Password links are better-auth verification rows (`reset-password:<token>`, value = user id): the invitation's 72 h and the reset's 1 h differ only in `expires_at`; `POST /api/auth/request-password-reset` and `POST /api/auth/reset-password` are opened in `AUTH_ROUTES`. The Admin's routes under `/api/admin/users` each run as one `applyServerBatch` transaction: `before(tx)` (under the company lock) does the last-Admin check, the `user`/`account`/`verification`/`session` table writes, then the server-only ops are applied.

## Boundaries & Constraints

**Always:** Story text in `epics.md` wins (grep `### Story 26.6` and `### Story 26.8`, read with offset/limit; never whole). The kernel owns every derived text (the two messages, the link life, the password length rule, the action list); `apps/api` calls it. Every authored pt-BR sentence is marked `// authored (Story 26.6)`. The product name in messages is `PRODUTO` ("Conforme"); neither the codename nor "Fasor" appears in a message, a default sender or a log line. No address in any log line. Nothing is deleted: remove is a status. Every write to `entities` goes through `applyServerBatch`. Existing tests keep what they assert; a count or list this batch legitimately extends (error codes, `AUTH_ROUTES`, `PERMISSION_ROUTES`, the schema's table list) is edited and listed in the PR.

**Never:** Any `apps/web` change (only a compile fix, minimal), a contract bump (new error codes and a route list do not change the op stream; CONTRACT stays 55; if you believe one is needed STOP and report), the web half of 26.6, e2e specs of 26.6, a real AWS call or credential, `epics.md`, `sprint-status.yaml`, `pnpm test:e2e*` (except a spec you wrote or touched, probably none), anything in `docs/context/` or `docs/media/`. No pnpm/node on the host: everything in the tools container under `lockf /tmp/fasor-verify.lock`.

## Spike (Story 26.6 first task, done by the orchestrator 2026-11-21, better-auth 1.7.5 read in the container)

better-auth 1.7.5 fits; no token of our own is needed.
- `POST /api/auth/request-password-reset {email, redirectTo?}`: unknown e-mail answers `{status:true,message:'If this email exists...'}` with a simulated lookup (same answer); known: inserts a `verification` row `identifier = reset-password:<generateId(24)>`, `value = user id`, `expires_at = now + emailAndPassword.resetPasswordTokenExpiresIn` (default 3600 s), then awaits `emailAndPassword.sendResetPassword({user, url, token})` through `runInBackgroundOrAwait` (without `advanced.backgroundTasks.handler` it AWAITS the send, so an SES round trip would leak whether the address exists by timing: set the handler).
- `POST /api/auth/reset-password {token, newPassword}`: checks `minPasswordLength` (8) and `maxPasswordLength` (128), `consumeVerificationValue('reset-password:<token>')` (deletes the row, returns null when absent OR expired, so a used, unknown and expired link all answer `400 INVALID_TOKEN`), updates the credential account's password (creates one when missing), calls `onPasswordReset`, and deletes every session of the user when `revokeSessionsOnPasswordReset: true`.
- Expiry is per row, so the 72 h invitation is the same row with a longer `expires_at` that we insert ourselves (the same insert the Admin routes make). The `GET /reset-password/:token` callback is not used: our link is `{origin}/definir-senha#{token}` (the token in the fragment, frames 96 and 97).
- The password rule of today's seed is better-auth's default (no CLI check): 8 to 128 characters; the kernel names it (`PASSWORD_MIN_LENGTH`, `PASSWORD_MAX_LENGTH`) and `createAuth` sets both explicitly.
- Record this paragraph in your Auto Run Result and in AD-9's dated line.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error |
|---|---|---|---|
| Forgot, user exists active or invited | `POST /api/auth/request-password-reset {email}` | 200 same body; one stored `reset` message, link `{origin}/definir-senha#token`, 1 h | none |
| Forgot, unknown address | same | 200 identical body; nothing stored | none |
| Forgot, paused or removed | same | 200 identical body; nothing stored | none |
| Sixth request, one address, one minute | 6 posts | 5 answer 200, the 6th `429 rate_limited` + `retry-after`; keyed by sha256 of the lower-cased address; also per client address (default 20/min) | `429` |
| Set password | `POST /api/auth/reset-password {token,newPassword}` | 200; the user signs in with it; his other sessions are gone | none |
| Link used twice, expired, unknown | second post, token older than its life, junk | `400 {code:'INVALID_TOKEN'}` | 400 |
| Password too short or long | 7 or 129 chars | `400` `PASSWORD_TOO_SHORT` / `PASSWORD_TOO_LONG`, the link survives | 400 |
| Invited user first sign-in | status `invited`, password set | sign-in succeeds and `user/{id}/status` = `active` is written before the session exists | none |
| Create user | Admin POST name, e-mail, role | 201; user born `invited` with the role; `user` + credential `account` (random unusable password hash) + `user/{id}` create (`council`,`registration_number`,`title` null, `photo_location_enabled` true, `role_id`, `status:'invited'`) + one 72 h link + one stored `invitation` message | `user_email_taken`, `role_not_found`, `invalid_request` |
| Duplicate e-mail | any user, any company, a removed user's address | 409 `user_email_taken`; no message, no row; `details` carries `{user_id,status}` only for a user of the caller's company | 409 |
| Edit | name and/or role | name updates the `user` table and puts `user/{id}/name`; role puts `user/{id}/role_id`; unchanged field writes nothing | `user_not_found`, `role_not_found`, `last_admin`, `user_state_invalid` (removed) |
| Pause / remove | active user (remove: also invited or paused) | status put; that user's sessions and password links deleted in the same transaction; next request 401 `user_inactive` | `last_admin`, `user_state_invalid` |
| Reactivate | paused or removed | status `active`; same password works | `user_state_invalid` |
| Resend invitation | status `invited` only | old links purged, new 72 h link, new message | `user_state_invalid` |
| Send password reset | status active or invited | new 1 h link, message | `user_state_invalid` (paused, removed) |
| Last Admin | `lastAdminVerdict` over the company's users read under the lock; pause, remove or role change of the target | refused `409 last_admin`; two simultaneous requests cannot both pass (company lock) | 409 |
| Tenant | Admin of A names a user of B | `404 user_not_found`, nothing changes | 404 |
| Role | any role but one holding `users.manage` (every route) | `403 forbidden`; inactive actor `401 user_inactive` | 403 |
| Rate limit | create + resend + reset share one per-actor window (default 30 per 600 s) | the over-limit one `429 rate_limited` | 429 |
| Removed user in history | a removed user's name in a relatório's responsável and the history | unchanged (row, name, `actor_id` stay) | none |

## Code Map

Kernel (`packages/domain/src`):
- NEW `email/links.ts`: `SET_PASSWORD_PATH = '/definir-senha'`, `INVITATION_LINK_HOURS = 72`, `RESET_LINK_HOURS = 1`, `PASSWORD_MIN_LENGTH = 8`, `PASSWORD_MAX_LENGTH = 128`, `setPasswordLink(origin, token)` (`${origin}${path}#${token}`), `tokenFromFragment(hash)`.
- NEW `email/messages.ts`: `invitationEmail({name, inviter_name, company_name, role_name, email, link})` and `passwordResetEmail({name, link})` returning `{subject, text, html}`. Text from the frames of branch `origin/docs/e26-frames` (`git show origin/docs/e26-frames:_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/mockups/prototype/screens/96-email-convite.html` and `97-email-redefinicao.html`): subject "Convite para o Conforme" / "Crie uma senha nova no Conforme"; brand line, "Olá, {name}.", the sentence, the button label ("Criar minha senha" / "Criar senha nova") as a link in HTML and the written-out link in both bodies, the 72 horas / 1 hora sentence, the footer. HTML is simple (inline, no CSS file), every interpolated value escaped, subject and names stripped of line breaks. `EMAIL_SENDER_NAME = PRODUTO`. A kernel test asserts: link, hours, escaping of `<script>`, no `fasor` (case-insensitive) in any output, no newline in a subject.
- `permissions/map.ts`: add route name `'admin.users'` to `PERMISSION_ROUTES`, need `users.manage` (update the map tests that enumerate routes).
- `permissions/user.ts`: `passwordLinkAllowed(user)` (false for `paused` and `removed`, true otherwise, absent counts as active).
- NEW `contract/admin-users.ts` (export from `contract/index.ts`): `ADMIN_USER_ROUTES` (method + path of each route, see "Route shapes"), zod schemas of every request and response (`adminUserViewSchema {id,name,email,role:{id,name}|null,status,last_sign_in:iso|null}`), `ADMIN_USER_ACTIONS = ['create','edit','pause','reactivate','remove','resend_invitation','send_reset']`, `AdminUserEvent`.
- `contract/errors.ts`: append to `errorCodeSchema` (append-only, dated comment, AD-29): `user_email_taken`, `last_admin`, `role_not_found`, `user_state_invalid`. Edit the kernel tests that count the codes.

Api (`apps/api/src`):
- `config.ts`: `EMAIL_PROVIDER` (`fake` default | `ses`), `EMAIL_FROM` (default a placeholder showing neither name, e.g. `nao-responda@example.invalid`), `SES_REGION` (default `us-east-1`), `PASSWORD_RESET_RATE_LIMIT_MAX` (5) and `_WINDOW_SECONDS` (60) per address, `PASSWORD_RESET_IP_RATE_LIMIT_MAX` (20) per client address, `ADMIN_EMAIL_RATE_LIMIT_MAX` (30) and `_WINDOW_SECONDS` (600). All always on (not tied to `RATE_LIMIT`). `config.test.ts` gets cases.
- NEW `email/`: `types.ts` (`EmailMessage {to, subject, text, html, purpose: 'invitation'|'reset'}`, `EmailProvider {send(message): Promise<void>}`); `fake.ts` (`createFakeEmailProvider(db)` inserts into `fake_email`, logs one `email_sent` line with `provider:'fake'` and `purpose` only); `ses.ts` (`createSesEmailProvider({client, from, senderName})`: `SendEmailCommand` of `@aws-sdk/client-sesv2` with `FromEmailAddress: "Conforme <from>"`, `Destination.ToAddresses`, `Content.Simple` Subject, Body Text and Html, UTF-8; `SesClientLike {send}`; no credentials in code, the SDK default chain); `index.ts` (`emailProviderOf(config, db)`, builds the real client only for `ses`); `fake-store.ts` (the shared test helper: `readFakeEmails(db, {to?, purpose?, since?})`, `waitForFakeEmail(db, {to, purpose?, since?, timeoutMs?})`, `fakeEmailLink(message)`, `fakeEmailToken(message)`, `clearFakeEmails(db, {to?})`); NEW `background.ts` (a tracker: the auth's `backgroundTasks.handler` records each promise, logs a rejection without the address, and `settleEmailTasks()` awaits them, used by the api tests). Add `@aws-sdk/client-sesv2` at the exact version of the other `@aws-sdk/*` (3.1134.0) with `pnpm add` in the container (updates `pnpm-lock.yaml`); if the container has no network, STOP and report.
- `db/schema.ts` + a drizzle migration `0007_fake_email.sql` generated in the container (`pnpm --filter ./apps/api db:generate` or the repo's script; `migrations-match.test.ts` must stay green): table `fake_email(id uuid pk, created_at timestamptz default now(), to_email text, purpose text, subject text, text_body text, html_body text)`; add it to `schema` only if the drizzle adapter needs it. NOTE for the PR: another epic's batch may also take 0007; the second to merge renumbers.
- `auth/auth.ts` (edit only: `AuthOptions.email?: EmailProvider`, default `createFakeEmailProvider(options.db)`): `emailAndPassword` gets `sendResetPassword` (reads the user's kernel status; `passwordLinkAllowed` false sends nothing; otherwise deletes the user's older `reset-password:*` verification rows except `token`, builds `setPasswordLink(origin, token)` with the configured base URL, `passwordResetEmail`, sends; a provider error is logged without the address and swallowed), `resetPasswordTokenExpiresIn: RESET_LINK_HOURS * 3600`, `revokeSessionsOnPasswordReset: true`, `minPasswordLength`/`maxPasswordLength` from the kernel; `advanced.backgroundTasks.handler` from `email/background.ts`. In the existing `session.create.before` hook: when the kernel status is `invited`, write `user/{id}/status` = `active` (server op via the helper of `db/roles.ts`, decided under the company lock) before returning. Keep the paused/removed refusal exactly as it is.
- NEW `admin/password-links.ts`: `issuePasswordLink(tx|db, {companyId, userId, hours, now, newId?})` purges the user's `reset-password:*` rows, inserts one (`identifier reset-password:<randomBytes(24).base64url>`, `value` user id, `company_id`, `expires_at = now + hours`) and returns the token; `purgePasswordLinks(tx, userId)`.
- NEW `admin/users.ts` (the service; deps `{db, auth, email, events, now, newId, appOrigin}`): `listUsers`, `createUser`, `editUser`, `pauseUser`, `reactivateUser`, `removeUser`, `resendInvitation`, `sendPasswordReset`; typed `AdminUserError(code, httpStatus, details?)`. Each state change is one `applyServerBatch(db, companyId, ops, {now, before})` whose `before(tx)` reads the company's users (kernel rows plus roles, `readCompanyUsers`) for `lastAdminVerdict`, validates the target belongs to the company, performs the table writes (user, account with the hash of a 32-byte random secret from `auth.$context`, session deletes, link rows) and throws `AdminUserError` to roll back. Ops: `user/{id}` create and `user/{id}/name` as `system:identity` (copy `provisioningOp` from `db/seed.ts` into a shared exported helper rather than duplicating), `user/{id}/role_id` and `user/{id}/status` through `roleOp` of `db/roles.ts`; several ops share a `batch_id`. A unique-violation on `user_email_unique` is `user_email_taken`. E-mails are sent AFTER the commit; a provider error leaves the user and answers `invitation:'failed'` (never rolls back). Usage events: one `admin_user_event` log line per action through `deps.events` (default `log`), fields `{action, actor_id, company_id, target_user_id, role_id?}`, ids only, never a name or address (AD-28 reading: the device event schema needs session and device uuids, so server actions use their own ids-only line; recorded in `docs/kbs/architecture/usage-events.md`).
- NEW `http/admin-users.ts`: `createAdminUsersRoutes(deps)` mounted in `http/app.ts` after the session middleware; every handler starts with `requirePermission(c, permissionForRoute('admin.users'))`, then the rate limit (create, resend, reset share one `FixedWindowLimiter` keyed by actor id), then parses with the kernel schemas (bad body `400 invalid_request`), then calls the service and maps `AdminUserError` to `{code, message, details?}`.
- `http/app.ts`: `AUTH_ROUTES` gains `POST /api/auth/request-password-reset` and `POST /api/auth/reset-password` (append; the test that lists it is edited); a new limiter for the first (per sha256 of the lower-cased e-mail, per client address; non-JSON `415` like sign-in; reuse the helpers of `http/rate-limit.ts`: add `passwordResetRateLimit({address, email, trustProxy, now})`, do not copy-paste) and a per-address one for the second; new `AppOptions` fields for the email provider, the limits and the events sink, all optional with the config defaults (`rateLimits` stays optional as today).
- `main.ts`: one `emailProviderOf(config, db)` shared by `createAuth` and `createApp`; a boot log line when `NODE_ENV=production` and the provider is `fake`.
- `db/test-fixtures` / seed helpers: only if a test needs a user with a role (e26a's `seedUser({role})`, `seedRoleUser`, `workerRoleUser`).
- NEW `e2e/support/fake-email.ts`: thin wrapper (`createDb(loadConfig().DATABASE_URL)`) over `fake-store.ts`: `waitForEmail(to, purpose?)` returning `{subject, link, token}`. No spec uses it in this batch; it typechecks and has an api-side test through `fake-store.ts`.

Route shapes e26d calls (state them verbatim in the PR body): `GET /api/admin/users`; `POST /api/admin/users {name,email,role_id}`; `PATCH /api/admin/users/:id {name?,role_id?}`; `POST /api/admin/users/:id/{pause|reactivate|remove|resend-invitation|password-reset}` with body `{}` (the origin guard wants `application/json` on every POST); `POST /api/auth/request-password-reset {email}`; `POST /api/auth/reset-password {token,newPassword}`; the link is `{origin}/definir-senha#{token}`.

KB and docs: `ARCHITECTURE-SPINE.md` (AD-9's line dated; AD-29 gets an "e26c" paragraph: the seam, the link rows, the routes, the open readings; grep `AD-9` and `AD-29`; never read whole), `source-deltas.md` (one dated built line under the Epic 26 row), `docs/kbs/architecture/sync.md` (session: inactive refusal, password links), `docs/kbs/architecture/usage-events.md` (the admin line), `docs/kbs/architecture/roles-and-permissions.md` (the routes), `docs/kbs/code/api-app.md`, `docs/kbs/code/domain-package.md`, `docs/kbs/log.md`. Update only those; merge `origin/main` before the PR and keep both sides of any conflict in append-only files.

## Tasks & Acceptance

**Execution:** 1. Kernel: links, messages, route name, `passwordLinkAllowed`, contract file, codes, tests (`pnpm test:unit -- packages/domain`). 2. Config, `email/` seam with fake store and SES, migration, dependency; api tests of the seam ("26.6-API-001a"). 3. `auth.ts` changes, `password-links.ts`, `AUTH_ROUTES`, limiters; tests "26.6-API-001b" through `app.request()` against the compose Postgres. 4. `admin/users.ts` and `http/admin-users.ts`; tests "26.8-API-001" (each route, happy path and state errors), "26.8-API-002" (last Admin: single, two simultaneous requests with `Promise.all`, self-lowering; paused user 401 then reactivate and sign in again with the same password), "26.8-API-003" (Gestor and Consulta 403 on every route, tenant 404 for every route, duplicate e-mail incl. a removed user's, rate limit, a removed responsável's name still in the relatório read). 5. `main.ts`, docs and KB, spec Auto Run Result.

**Acceptance Criteria:** the Given/When/Then of Story 26.6 (api rows: stored message holds a link and the link sets a password; used link refused; an invitation older than 72 h refused; same sentence for existing and unknown address and only the first stores a message; paused user gets none; sixth request rate-limited; `ses` call carries sender and the two bodies) and of Story 26.8 (all seven), plus: the whole existing unit and api suites pass with no assertion edited except the listed extended counts; `git diff origin/main --stat` shows no golden, seed v14-v16, `docx` or `layout` file.

## Spec Change Log

## Design Notes (open readings, list each in the PR)

- Usage events for server actions are `admin_user_event` log lines, not `uxEventSchema` events.
- `reactivate` always returns the user to `active`; a user removed while still `invited` who is reactivated holds a random password: the Admin sends a reset (`password-reset` allows `invited` and `active`). Pause is allowed from `active` only; an invitation is cancelled by remove.
- The "Convite pendente" word of the AC is the screen's: the kernel's word for `invited` is `Convidado` (`userStatusLabel`); e26d decides.
- A forgot-password request invalidates the user's older reset and invitation links.
- A role the Admin picks must be a live `role/{id}` row of the caller's company (a removed one is `role_not_found`).
- Migration 0007 may collide with another epic's batch.

## Verification

Commands (tools container, `--user root`, under `lockf /tmp/fasor-verify.lock`, logs in `.scratch-e26c/`): `pnpm test:unit -- packages/domain`, `pnpm lint`, `pnpm static`, `pnpm test:unit`, `pnpm test:api`. Restart the api container after changes under `packages/domain` or `apps/api` (`podman compose restart api`) before `test:api`.

## Auto Run Result

