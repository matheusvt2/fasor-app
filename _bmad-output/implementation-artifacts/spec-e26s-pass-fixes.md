---
title: 'e26s: fixes from the hands-on pass of Epic 26 (2026-11-22)'
type: 'bugfix'
status: 'done'
dev_model: 'opus'
dev_effort: 'high'
warnings: ['batched']
---

# e26s pass fixes

Batched: the owner's one fix (Fix 1) and the should-fix findings of the hands-on browser pass of the five roles
(Fix 2), all in the users, roles and sessions surface (AD-29), one PR on top of e26r (#358). No contract number
(57 stands), no migration (report before writing one). Context: `epic-26-context.md` § Record of 2026-11-22.
Rules: English code and docs, pt-BR UI copy, no emoji, never "laudo", never delete a planning sentence (strike and add
dated). Do not edit what a pre-Epic-26 test asserts. Gate: lint, static, test:unit, test:api and the specs named under
"Gate"; no full e2e, no matrix, no review loop (`epic-batch-orchestrator.md` § 12 and the launch prompt).

## Fix 1: a removed user whose role was removed can be reactivated (Matheus, 2026-11-22, "corrija")

Before: e26r made `reactivate` answer `role_not_found` for a user whose role is gone; the server refuses to edit a
removed user and his row offers only "Reativar", so the Admin had no way out.

I/O matrix (`POST /api/admin/users/:id/reactivate`, body `{ role_id? }`):

| Body | User state | Role | Result |
| --- | --- | --- | --- |
| `{}` | paused or removed | his role live | as before: status `active`, sessions ended |
| `{}` | paused or removed | his role gone or none | `404 role_not_found`, nothing changes |
| `{ role_id }` | paused or removed | `role_id` live, same company | one batch: `user/{id}/role_id` then `user/{id}/status`, both `system:admin`; sessions ended; event carries `role_id` |
| `{ role_id }` | paused or removed | `role_id` removed, absent or another company's | `404 role_not_found`, nothing changes |
| `{ role_id }` | active or invited | any | `409 user_state_invalid` |
| `{ role_id: 'x' }` | any | not a uuid | `400 invalid_request` |
| `{ role_id }` equal to his own live role | paused or removed | live | status op only |

Code map:
- `packages/domain/src/contract/admin-users.ts`: `adminUserReactivateRequestSchema` (`role_id` optional uuid).
- `apps/api/src/http/admin-users.ts`: the reactivate route parses it; `apps/api/src/admin/users.ts`: `setStatus` takes
  `newRoleId`; the plan holds the role op first and the status op second; `refuseLastAdmin` runs with the role.
- `packages/domain/src/permissions/user-list.ts`: `reactivateNeedsRole(roleId, localRoles)` (kernel rule: no role, or the
  device holds the role row as removed; a role the device does not hold is not judged, the route is the authority).
- `apps/web/src/api/admin-users-client.ts`: `adminUserAction(action, id, body = {})`.
- `apps/web/src/surfaces/users/reactivate-dialog.tsx` (new): the Form dialog (`.usr-dialog`) with the user dialog's
  `RoleOptions` (exported from `user-dialog.tsx`), the existing sentence under the rows, Cancelar and "Reativar" (disabled
  with the existing "Escolha um papel." until a role is picked). `users-surface.tsx`: `pick` opens it when
  `reactivateNeedsRole`; a plain "Reativar" answering `role_not_found` opens it too; confirming sends `role_id`.

Authored sentences: none new. Reused: "Esse papel não existe mais. Escolha outro." (`copy.users.errorRoleNotFound`),
"Escolha um papel." (`copy.users.roleMissing`), the title `copy.users.reactivateTitle`, the button
`copy.users.reactivateConfirm`, the label `copy.users.roleLabel`.

Acceptance:
- Given a removed user whose custom role was removed, when the Admin picks Reativar, then the dialog shows the Papel
  picker and the sentence; "Reativar" waits for a role; confirming sends `role_id`; the user is active with that role and
  signs in with his old password.
- Given the same user and a body with the removed role, another company's role or no role, then `404 role_not_found`
  and no op, no event, no session change.
- Given a live role of the user, then the plain confirmation as before, with no role in the body.

Tests: `e26s-API-001` (api, two cases: removed user and the four refused bodies, then the happy path with the ops and
the sign-in; paused user, same role, state refusal, paused Admin, tenant), `e26s-UNIT` in
`users-surface.test.tsx` (refusal opens the picker, then `role_id` goes; known-removed role opens it at once; Cancelar),
`e26s-UNIT reactivateNeedsRole` in the kernel, `@p1 e26s-E2E-001` in `e2e/users-screen.spec.ts`.

Tests changed (own-epic tests, expectation moved on purpose): the `e26r-UNIT` case in `users-surface.test.tsx`
("answered 404 role_not_found: a Toast, the row unchanged") now ends in the picker and the `role_id` call instead of a
Toast; `e26r-E2E-001` in `e2e/users-screen.spec.ts` (stopped at the refusal) is replaced by `e26s-E2E-001`, which goes on
to pick a role and sign the user in. `e26r-API-003` stays as it was (it pins the no-role body).

Greps over `e2e/` and the web tests for what Fix 1 changes: see the PR body.

## Fix 2: findings of the hands-on pass

~~(Arrives by message from the coordinator; folded in below when it does.)~~ *(2026-11-22: folded in from the
coordinator's message, findings F2-1 to F2-6; every one checked against the code before it was built.)*

Items:
- **F2-1 (blocker, held).** After "Reativar" the device stayed paused: the engine sends nothing while paused, the
  session listener kept a plain 401 as the pause, and only a reload reached Login. Now the account read tells
  `401 user_inactive` from any other 401 (`AccountRead` in `apps/web/src/api/auth-client.ts`), and while the paused cause
  stands `recheckAccount` (`apps/web/src/state/session.tsx`) makes one account read on "Sincronizar agora"
  (`state/sync.tsx` `syncNow`), every `PAUSED_RECHECK_MS` (= `SYNC_INTERVAL_MS`, 60 s), on `visibilitychange` and on
  `online`. Sync status of the ended session gains "Entrar de novo" in its `.sync-actions` (the shell banner's action).
- **F2-2 (held).** A paused user who reloaded saw a bare Login. The boot read `'inactive'` with the pointer and its
  database on the device opens it behind the paused banner (`reAuthCause: 'paused'`); with no database, or no pointer,
  Login as before. A plain boot 401 now remembers `expired` (the read tells the pause apart).
- **F2-3 (held).** `unreachableCause` gains `paused` (`apps/web/src/sync/policy.ts`); `syncBadgeState` gains the input
  `accountPaused` (`packages/domain/src/sync/counts.ts`; `homeCards` passes it through): the pill reads `pending` or
  `ok` (frame 94: "5 pendentes"); the Sync status line says the paused banner's sentence.
- **F2-4 (held).** The `.s9-foot` "Adicionar local" of `relatorio-tree.tsx` had no guard; it now draws only with
  `useFillAccess().canFill`, as its sibling "Adicionar …" rows. Controls checked (no other change needed): Sumário header
  Overflow (Restaurar, Salvar como template, back move), the numbered rows and section 9 row (Overflow, drag, Position
  box), "Marcar como enviado", "Pré-visualizar", "Gerar relatório"; tree rows on the Sumário and the rail (drag, Position
  box, Overflow, "Adicionar equipamento/bloco/coluna", the duplicate's "Renomear", palette and panel capture, reached only
  from those); ficha (header Overflow and rename, the api's `commit` and `edit`, camera, "Adicionar fotos", the bulk bar,
  the primary action, the drop target, the rail); Verificações do local; pontos ("Criar", rows); fotos (camera, import,
  caption, people mark, move, drop target, photo viewer); section texts; setup (every field through `allowed`, the
  Etapa fieldset, the cover photo picker inside it, "Concluir"); Home ("Novo relatório", "Continuar", F2-6).
- **F2-5 (held).** `SyncState.pullCompany` (the engine's `pullCompany`) and `useCompanyPull()`
  (`apps/web/src/state/sync-actions.ts`): `papeis-surface.tsx` pulls after an accepted create, rename, remove and
  permission save; `users-surface.tsx` pulls when the user dialog opens. No local write of a server-only row.
- **F2-6.** Home's current card draws "Continuar" only with `relatorio.fill` (`RelatorioCard` `fillShortcut`; "Ver
  sumário" stays). Login's set-password notice goes once a sign-in fails. "último acesso": **not built**. No column or op
  holds a sign-in that survives sign-out and reactivation (`user` has `createdAt`/`updatedAt` only, sessions are
  deleted, no usage-event table in the database); it needs a migration or a new op: a deferred-work row for the
  orchestrator.

I/O (the account read, `GET /api/account`, unchanged on the server):

| Device state | Answer | Result |
| --- | --- | --- |
| boot, pointer and its database here | `401 user_inactive` | signed in behind the paused banner, `reAuthCause: 'paused'` |
| boot, no pointer or no database | `401 user_inactive` | Login |
| boot, pointer | `401` other | Login, remembered cause `expired` |
| paused, a recheck | `401 user_inactive` | stays paused |
| paused, a recheck | `401` other, or `200` of another user | re-auth `expired`: re-auth banner, "Entrar de novo", outbox kept |
| paused, a recheck | `200` same user | resumes (flag cleared, engine resumes) |
| paused, a recheck | unreachable | nothing changes |

Authored sentences: none. Reused: `copy.pausedAccount.bannerText` (Sync status line of a paused account),
`copy.banner.reAuthAction` ("Entrar de novo" in Sync status).

Tests: kernel `e26s-UNIT syncBadgeState of a paused account` (`counts.test.ts`); `policy.test.ts` (paused cause);
`auth-client.test.ts` (the three 401s); `session.test.tsx` (`e26s a paused account at boot and its recheck`, five cases);
`state/sync-paused.test.tsx` (new: syncNow rechecks first, the cause and badge, `pullCompany`);
`sync-status-surface.test.tsx` (paused line, "Entrar de novo"); `relatorio-card.test.tsx` (no "Continuar");
`login-surface.test.tsx` (notice cleared); `roles-screens.test.tsx` (`e26s-UNIT` "Adicionar local" by role and on an
Emitido); `users-surface.test.tsx` and `papeis-surface.test.tsx` (company pull); e2e `e26s-E2E-002` (new, no reload) in
`e2e/paused-user-unsent.durability.spec.ts`; e2e `e2e/roles-screens.spec.ts` (`noAddLocal` at 1280 and 768 px as
Consulta, on an Emitido as Engenheiro de Campo, the Consulta's outbox empty after the walk).

Tests changed (own-epic tests, expectation moved on purpose): `session.test.tsx` 26.11 "a boot 401 keeps a remembered
pause" now ends in `expired`; `26.11-E2E-001` reload and restart now keep the paused banner (F2-2) instead of Login.
Shared test double: `test/sync-state.ts` gains a `pullCompany` default.

## Gate

`lint`, `static`, `test:unit`, `test:api`, and the specs `users-screen`, `roles-editor`, `roles-screens`,
`paused-user-unsent.durability`, `password-by-email`, `auth`, `home` plus any spec a Fix 2 item touches, on
`desktop-chrome` and `durability-desktop-chrome`, under `lockf /tmp/fasor-verify.lock`.

## Auto Run Result

Batch e26s, branch `e26s-pass-fixes` on `origin/main` 8f369015 (no merge needed: main had not moved).

- Orchestrator cuts: one. After Fix 1 the orchestrator handed back to wait for the pass findings (handoff: this spec,
  `.scratch-e26s/`); resumed with the findings, Fix 2 built by the `bmad-dev-opus-high` subagent (returned), Fix 1 by the
  orchestrator.
- Gate on the head `1de6efbf` (+ the deferred-work rows), host load 6.38 at the start, 9.07 at the end of stage 1, other
  stack up: `fasor-e27c` (its gate held the lock for the first waits): lint green (23 s), static green (66 s), test:api
  1172 passed, 6 skipped (705 s), test:unit first run 7701 of 7702 (1 red: `session.test.tsx` "the network coming back asks
  once while paused", `waitFor` timeout under load 9), second full run 7702 of 7702, 494 files, the red green (408 s the
  first run); touched specs 130 of 130 (parallel 102, queue 22, solo 6; 472 s; lock wait 477 s).
- Review: none inside the batch (§ 12). Verification gap read of the diff: none found beyond the open risks below.
- Open risks: at boot, `401 user_inactive` is applied to the pointer's user without proving the cookie is his (the
  device holds one user's database; the next real call corrects it). "último acesso" not built (needs a migration or an
  op): `deferred-work.md` row.
