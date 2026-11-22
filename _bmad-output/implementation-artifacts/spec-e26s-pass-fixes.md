---
title: 'e26s: fixes from the hands-on pass of Epic 26 (2026-11-22)'
type: 'bugfix'
status: 'in-progress'
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

(Arrives by message from the coordinator; folded in below when it does.)

## Gate

`lint`, `static`, `test:unit`, `test:api`, and the specs `users-screen`, `roles-editor`, `roles-screens`,
`paused-user-unsent.durability`, `password-by-email`, `auth`, `home` plus any spec a Fix 2 item touches, on
`desktop-chrome` and `durability-desktop-chrome`, under `lockf /tmp/fasor-verify.lock`.

## Auto Run Result

(Written at the end of the batch.)
