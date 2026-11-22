---
title: 'Epic 26, batch e26d: the Usuarios screen, the paused user keeps the unsent work, the web half of the password by e-mail (Stories 26.9, 26.11, 26.6 web)'
type: 'feature'
created: '2026-11-22'
status: 'ready-for-dev'
baseline_revision: '1c69862c'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-26-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-e26c-email-and-admin-routes.md'
warnings: ['batched']
---

<!-- batched: 26.9, 26.11 and the web half of 26.6 share the Login, the set-password page, the invitation e-mail of the 26.9 e2e and the app shell routes. The coordinator's launch prompt batches them. Two implementation subagents run in parallel on disjoint files (lanes A and B below). -->

## Intent

**Problem:** The Admin routes (e26c) and the kernel (e26a) exist, but nothing in the app calls them: no Usuarios screen, no "Esqueci minha senha", no page that sets a password, and a paused user is shown the same banner as an expired session.

**Approach:** Build the frames of Story 26.1 (`mockups/prototype/screens/92-usuarios.html`, `10`, `11`, `12`, `13`, `14`, `94`; `MOCK-GUIDE.md` § 2026-11-21 holds the owner's answers) with the mock's class names, over the routes in `packages/domain/src/contract/admin-users.ts`. The kernel owns every derived word; `apps/web` renders from IndexedDB and the routes.

## Boundaries

**Always:** Story text in `epics.md` (grep `### Story 26.9`, `26.11`, `26.6`; read with offset and limit) and the dated e26c line under 26.6 win. Frames: grep class names and read line ranges, never a whole mock. `tokens.css`/`components.css` stay byte-identical; each `.frame-*` rule used gets its translation in `app.css` under a comment naming the mock rule (AGENTS.md "Mock container selectors"). Copy homes: derived text in `packages/domain`, static copy in `apps/web/src/copy/pt-br.ts`, chrome in `copy/ui.ts`. Every authored sentence is marked `// authored (Story 26.x)`. No emoji, never "laudo", product name `PRODUTO` ("Conforme"), never the codename. The server is the authority: the screen hides and disables as a courtesy. Every network call lives in `apps/web/src/api/` (lint forbids `fetch` elsewhere).
**Never:** a contract bump (if you believe one is needed STOP and report), a new migration, `/usuarios/papeis` and anything of Story 26.10 (a sibling batch owns it), `epics.md`, `sprint-status.yaml`, editing what an existing test asserts (report the test and your narrowing instead), `tokens.css`/`components.css` edits, `pnpm test:e2e*` (the orchestrator runs the specs).

## Facts already on main (reuse, do not rebuild)

- Routes and schemas: `ADMIN_USER_ROUTES`, `adminUserRoutePath(route, id)`, `adminUserListResponseSchema`, `adminUserResponseSchema` (`invitation`/`reset` = `'sent'|'failed'`), `adminUserCreateRequestSchema` (`name`, `email`, `role_id` uuid), `adminUserEditRequestSchema`. Every POST carries `content-type: application/json` and body `{}`. Error body is the contract envelope (`errorResponseSchema`: `{code, message, details?}`): `user_email_taken` (409, `details {user_id,status}` only for a user of the caller's company), `last_admin` (409), `role_not_found` (404), `user_state_invalid` (409), `user_not_found` (404), `forbidden` (403), `rate_limited` (429), `user_inactive` (401), `invalid_request` (400).
- `POST /api/auth/request-password-reset {email}` always 200 (429 `rate_limited`); `POST /api/auth/reset-password {token,newPassword}` 200, or 400 `INVALID_TOKEN` | `PASSWORD_TOO_SHORT` | `PASSWORD_TOO_LONG`. Kernel `email/links.ts`: `tokenFromFragment`, `PASSWORD_MIN_LENGTH` 8, `PASSWORD_MAX_LENGTH` 128, `SET_PASSWORD_PATH`. A sign-in of a paused or removed user answers `401` with `code: 'user_inactive'` (better-auth error `.code`); `/api/sync/*` and `/api/account` answer `401 {code:'user_inactive'}`; `SyncFailure.code` carries it (`sync/client.ts`).
- Web: `state/permissions.tsx` (`useCan`, `useCanFn`, `RequirePermission` already maps `/usuarios` to `users.manage`), `useShortcuts` in `surfaces/home/shortcut-row.tsx`, components `Tabs`, `Chip`, `Combobox`, `OverflowMenu`, `StatusPill`, `FormDialog`, `ConfirmDialog` (Cancelar is auto-focused), `Toast`, `Button` (`disabledReason`), `ReadOnlyBanner`. Kernel: `userStatusLabel` (Convidado: DO NOT change, `user.test.ts` asserts it), `lastAdminVerdict`, `systemRoleRows`, `isAdminRole`, `permissionRefusalText`.
- Test helpers: `e2e/support/fake-email.ts` `waitForEmail(to, purpose?)` -> `{subject, link, token}`; `workerRoleUser`, `seedRoleUser`, `asRole` pattern in `e2e/roles-screens.spec.ts`; `resetEmpresaBWithFixture`, `withSeedDb`, `waitForCompanyPull`, `signIn`, `deviceDatabaseName` (`e2e/support/`).

## Lane A: Story 26.9, the Usuarios screen (route `/usuarios`, frames `92-usuarios.html`)

Kernel (new `packages/domain/src/permissions/user-list.ts`, exported, with unit tests): `userStatusPillLabel(status)` returning the frame's words (Ativo, Convite pendente, Pausado, Removido) beside the untouched `userStatusLabel`; `USER_STATUS_FILTERS` with their labels ("Todos" leaves removed users out); `filterUserList(entries, {status, roleId})`; `userListCountText(...)` (plural and the removed variant, from the frame's count line); the row menu's items by status (`userRowActions(status, {isSelf})`: which of Editar, Pausar, Reativar, Reenviar convite, Enviar redefinição de senha, Remover, in the frame's order); the sentence of when a change takes effect. Web derives none of these.
Web (`apps/web/src/surfaces/users/`, `apps/web/src/api/admin-users-client.ts`):
- Route `/usuarios` in `app.tsx` (handle title "Usuários"), a third Home shortcut "Usuários" ("Pessoas, papéis e permissões", sprite symbols `i-users`, `i-lock`, `i-mail` added to `public/sprite.svg` if absent) only with `users.manage` (`useShortcuts` gains `usuarios`); the Tabs row (Usuários, "Papéis e permissões" as links to `/usuarios/papeis`, the second only with `roles.manage`; the route belongs to batch e26e: name your tabs component `UsersTabs` in `surfaces/users/users-tabs.tsx` and say so in the PR).
- The list: rows from IndexedDB (the `user` and `role` rows the pull brings: find the live queries other surfaces use) overlaid by the route's views (`GET /api/admin/users`, called on open when online: the last sign-in, the fresher status and role name; an id the route lacks keeps the IndexedDB row). After each action the answer's `user` replaces its row at once and one `sync.syncNow()` is asked. Filters Situação (chips, radiogroup, "Todos" default) and Papel (Combobox; roles from the role rows, custom ones included), empty state with "Limpar filtros", the count line, the row's Avatar, name, "(você)" for the signed-in user, e-mail, role, last access, Status pill (`data-status`), Overflow menu.
- The dialogs and confirmations exactly as the frames: new user (Nome, E-mail with the 72-hour helper, Papel as Option rows naming the modules, "Enviar convite"), edit (e-mail read-only), pause, reactivate, remove, "Enviar redefinição de senha", "Reenviar convite" (Cancelar first). Errors: duplicate e-mail (red field and helper, the frame's wording, "Enviar convite" disabled until the e-mail changes), last Admin (the frame's Banner and refusal dialog; the route's 409 is the authority, the kernel `lastAdminVerdict` over the loaded rows may pre-empt it), `role_not_found`, `user_state_invalid`, `forbidden`, `rate_limited`, `invitation: 'failed'` / `reset: 'failed'` ("the user was saved, the e-mail did not leave; use Reenviar convite"), no connection. Each success Toast says when it takes effect (the device's next contact with the server).
- Offline (`session.online` false, or the route unreachable): the list shows from IndexedDB, "Novo usuário" and every row menu are `aria-disabled` with the frame's Banner line; no request is sent.
- `.usr-*`, `.status-pill[data-status]` and the dialogs' page CSS of the frame move into `apps/web/src/styles/app.css` in one block headed "Story 26.9 (Usuarios)", with `.frame-phone` rules as `@media (max-width: 767.98px)`.
- Tests: web unit tests of the list, the filters, the dialog and each error (`users-surface.test.tsx`, `user-dialog.test.tsx`, client test), the kernel tests; `e2e/users-screen.spec.ts` "26.9-E2E-001 @p0" as a person would: the Admin of this worker's Empresa B opens Home, taps "Usuários", creates a user (the row reads "Convite pendente" with its role), `waitForEmail` for the link, opens it, sets a password on the page of Lane B, signs in as that user in a second context, the Admin changes his role (Admin tab view shows the new role), pauses (pill "Pausado", menu offers "Reativar"), reactivates, removes (row leaves the "Todos" list, appears under "Removido"). Plus "26.9-E2E-002 @p1": the last Admin removing himself shows the sentence and nothing changes; duplicate e-mail; offline shows the list with actions disabled; 390, 768 and 1280 px with a dialog open: no horizontal overflow, axe clean (reuse `test-axe`/the axe helpers other specs use), every action reachable by keyboard.

## Lane B: Story 26.6 web half and Story 26.11 (Login, set-password page, paused user)

26.6 web (`surfaces/login/`, `api/auth-client.ts`):
- Login: "Esqueci minha senha" Text button under "Entrar" (class `login-forgot`), to `/login/esqueci` (frame 11): the request (E-mail, "Enviar link", "Voltar ao login"), then the sent state ("Confira o seu e-mail", the same answer for any address, "Usar outro e-mail"); `429` says so with its own sentence and marks no field; offline disabled with the Login's reason; typed e-mail carried from Login.
- Page `/definir-senha` (frame 13, route outside `RequireSession`, inside `SessionProvider`): reads the token with `tokenFromFragment(location.hash)` and removes it from the address (`history.replaceState`) once read; Senha and "Repita a senha" with "Mostrar", the rule "Pelo menos 8 caracteres." from the kernel constants (also a maximum message), a mismatch sentence, "Salvar senha"; success lands on `/login` with the frame's notice "Senha criada. Entre com o seu e-mail e a senha nova." (Login has no ToastProvider: carry it in `location.state` and render it as a `role="status"` line); `400 INVALID_TOKEN` or no token renders the expired page (frame 14: "Este link não vale mais", "Pedir um link novo" to `/login/esqueci`, "Voltar ao login"; the same page serves a used link and an expired invitation); the other 400 codes show their sentence and keep the link usable. The frame's "Olá, Fernanda", the readonly e-mail and the "vale até" line need data the link route does not give (no lookup endpoint exists): leave them out and list it as a narrowing.
- `api/auth-client.ts`: `requestPasswordReset(email)`, `resetPassword(token, newPassword)` results as unions (`ok`, `rate-limited`, `invalid-link`, `too-short`, `too-long`, `offline`, `server`).
26.11 (`state/session.tsx`, `state/last-session.ts`, `state/banner-slot.tsx`, `sync/engine.ts`, `app-shell.tsx`, `surfaces/account/`):
- Cause: `onReAuth` gains the failure; a `401` whose `code` is `user_inactive` sets `reAuthCause: 'paused'` (any other 401 is `'expired'`), remembered beside the re-auth flag in `last-session.ts` (readers of the old `'1'` value stay valid) and cleared by a sign-in, a confirmed session or a sign-out as the flag is. `SessionState` exposes it.
- Banner: kind `paused` first in `BANNER_PRIORITY`, replaces the `re-auth` one, no action, the frame's words ("Conta pausada." and "O que você preencher fica salvo neste aparelho e é enviado quando o administrador reativar a sua conta."), role `status`. The sync engine pauses as for any 401; filling goes on, offline as today; the outbox is never touched.
- Sign-in: `signIn` maps the `user_inactive` code to a new failure reason `'inactive'` with "Conta pausada. Fale com o administrador." shown under the password field (frame 12), fields keep their values, nothing on the device is deleted; a removed user reads the same line.
- "Sair" while paused (frame 94): Conta shows the storage row and the Sessão note "N alterações aguardando envio. Com a conta pausada, elas só podem ser enviadas depois da reativação."; with `reAuthCause === 'paused'` and unsent work the Confirm dialog is "Sair e apagar o que não foi enviado?" with the kernel sentence for N (plural; new kernel function in `permissions/paused.ts`), confirm label "Sair e apagar", Cancelar the default; cancelling keeps everything. VERIFY (it is the risk of this lane): `session.signOut()` when the server session is already gone (`authClient.signOut()` after the pause deleted it); if it throws today for an expired session too, a paused user must still be able to sign out after confirming (treat a 401 as signed out, change nothing else, and add a test). Reactivation: after a reload the boot lands on Login with the pointer and the database kept (Story 20.11); signing in again on the same device sends the queue in order (existing behavior: assert, do not rebuild); ops his role no longer allows are rejected one by one (existing, Story 26.4).
- Tests: web tests of the banner, the Login reasons, the Sair dialog and the new pages; unit tests for the cause storage; `e2e/password-by-email.spec.ts` "26.6-E2E-001 @p0" (invitation to first sign-in: an Admin creates a user through the route with the Admin's session, `waitForEmail`, opens the link, sets the password, signs in) and "-002 @p1" (forgot password for a known and an unknown address: the same sentence; only the first stores a message; the link sets a new password; a used link shows the expired page); `e2e/paused-user-unsent.spec.ts` "26.11-E2E-001 @p0" on `durability-desktop-chrome` (see how `*.durability.spec.ts` and `e2e/support/durability.ts` run on that project; the file name must match that project's pattern): a field engineer offline with five unsent readings, paused through the Admin route; the device comes back: the paused banner shows, five ops still in the outbox (assert the store with `readStore`, not the screen), "Sair" names five and cancelling keeps them; reactivate; he signs in again and the five reach the server and the banner is gone; reload and browser restart keep the five. And the Login "Conta pausada. Fale com o administrador." for a paused user on a device with no data of his. Narrow: the matrix projects are not run in this batch (owner's decision); say so.

## Shared files and ownership

`app.tsx` (A adds `/usuarios`, B adds `/login/esqueci`, `/definir-senha`), `copy/pt-br.ts` (A: `copy.users`, B: `copy.login` additions and `copy.setPassword`, `copy.forgot`, `copy.pausedAccount`), `app.css` (own blocks), `permissions/index.ts` (one export line each), `public/sprite.svg`. Edit with small `Edit` calls only (never rewrite a shared file); the other lane edits the same files at the same time.

## Acceptance Criteria

The Given/When/Then of Stories 26.9 and 26.11 and the web rows of 26.6 (invited user opens the link and sets a password; the used link says it is no longer valid; an invitation older than 72 hours is refused the same way; Login's "Esqueci minha senha" shows one sentence for an existing and an unknown address; a paused user's request stores nothing, the screen still shows that sentence), in the frames' words.

## Verification

Tools container (`--user root`), under `lockf /tmp/fasor-verify.lock`, logs in `.scratch-e26d/`: `pnpm lint`, `pnpm static`, `pnpm test:unit`, `pnpm test:api`, then the touched specs. Restart the api after changes under `packages/domain` or `apps/api` before `test:api`.

## Design Notes (open readings, list each in the PR)

- Kernel word "Convidado" kept; the screen's pill word "Convite pendente" is a new kernel function.
- The set-password page omits the invitee's name, e-mail and the expiry line.
- The Tabs row shows "Papéis e permissões" for `roles.manage`; its route arrives with e26e.
- A removed user and a paused one read the same sentence at Login (owner's answer 7).

## Auto Run Result

(written when the batch ends)
