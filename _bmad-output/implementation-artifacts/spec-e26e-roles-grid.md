---
title: 'Batch e26e: Papéis e permissões, the grid and the roles the Admin creates (Story 26.10)'
type: feature
status: ready-for-dev
dev_model: opus
dev_effort: high
warnings: ['batched: one story, api and web, one batch']
context:
  - _bmad-output/implementation-artifacts/epic-26-context.md
  - _bmad-output/implementation-artifacts/epic-batch-orchestrator.md
---

# Batch e26e: Story 26.10

Source of truth: `_bmad-output/planning-artifacts/epics.md` "Story 26.10" (grep the heading, read with offset and limit) and the frame
`_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/mockups/prototype/screens/93-papeis.html` (its `<style data-screen="papeis">`
block names every class; read its markup lines 93-246 with offset and limit, never grep the whole mock into context), plus
`mockups/MOCK-GUIDE.md` § "2026-11-21 — The Epic 26 frames" (the approved answers below win over the frame where they differ).
AGENTS.md rules apply: English code and docs, pt-BR UI copy, no emoji, "relatorio" never "laudo", product "Conforme", no role name in a
condition outside `isAdminRole`, `apps/web` derives no status, count, label or verdict (kernel text), `tokens.css` and `components.css` byte-identical.
The subagent cannot start containers: write the code and the tests, run nothing; the orchestrator runs the gate and sends reds back.

## Approved answers (owner, 2026-11-21) that change the frame

1. The module of `template.edit` reads **"Templates"** (module line "A lista de templates e o compositor", key "Editar templates").
2. A new role starts with `relatorio.view` ("Ver relatórios") only.
3. With **8 or more roles** the tablet also shows one role at a time (chips "Papel", as on a phone); up to 7, every role is a column. Reading
   (open to the owner): "tablet" = every width below 1280 px (portrait and landscape); at 1280 and above every role is a column.
4. A tap on a **mixed** module switch turns all its keys on; a tap on an on one turns them all off; off turns all on.
5. "Restaurar permissões padrão" puts the seeded set back **in the grid, unsaved** (the frame's Toast: "Permissões padrão de volta na grade. Salve para aplicar."); it saves with "Salvar alterações".

## What is on main (reuse, do not rebuild)

- Kernel `packages/domain/src/permissions/`: `keys.ts` (`PERMISSION_KEYS`, `permissionModuleOf`, `permissionModuleName`, `permissionKeyLabel`, `permissionKeysOf`,
  `PERMISSION_MODULES`), `roles.ts` (`roleRowSchema`, `SYSTEM_ROLE_PERMISSIONS`, `systemRoleOfId`, `ADMIN_ROLE_ID`, `ROLE_FIELDS`), `can.ts` (`can`, `isAdminRole`, `keysOf`),
  `map.ts` (`PERMISSION_ROUTES`, `permissionForRoute`), `screens.ts` (`/usuarios/papeis` = `roles.manage`), `last-admin.ts`, `refusal.ts`.
- Ops: server-only families `role` (create), `role/field` with `name`, `permissions`, `removed_at`; helpers `rolePath`, `roleFieldPath` (`ops/path.ts`).
- API pattern: `apps/api/src/db/roles.ts` (`applyDecidedWrites(db, companyId, decide, what)`: decides outside the lock, applies one `applyServerBatch` and decides
  again under the lock, once more on a changed decision; `roleOp` actor `system:admin`), `apps/api/src/admin/users.ts` (`readCompanyUsers`, `AdminUserError`),
  `apps/api/src/http/admin-users.ts` (route shape, `answer`, `bodyOf`, `requirePermission(c, permissionForRoute(...))`), `apps/api/src/admin/admin.test-support.ts`
  (`adminHarness`: `seedPerson`, `signIn`, `json`, `company`, `cleanup`), `apps/api/src/http/admin-users.integration.test.ts` (test pattern), mounted in `http/app.ts`.
- Contract pattern: `packages/domain/src/contract/admin-users.ts`; error codes in `contract/errors.ts` (append only; 2026-11-21 block of Story 26.8).
- Web: `state/permissions.tsx`, `components/` (`FormDialog`, `ConfirmDialog`, `Button` with `disabledReason`, `Toggle` markup, `Chip`), `state/toast.tsx` (`useToast`),
  `api/` is the only folder besides `sync` and `files` where `fetch` is allowed (lint). Routes in `app.tsx` sit under `<RequirePermission />`.
- e2e: `e2e/roles-screens.spec.ts` and `e2e/roles-server.spec.ts` (pattern: `resetEmpresaBWithFixture`/`resetEmpresaB`, `withSeedDb`, `seedRoleUser`, `workerRoleUser`,
  `signIn`, `waitForCompanyPull`, `syncNow`, `horizontalOverflow`). A reset of Empresa B wipes its roles; the next seed puts the five back, so a spec may change roles freely.

## Code map and tasks

### K. Kernel (`packages/domain/src/permissions/`), tests `role-editor.test.ts` = "26.10-UNIT-001..n"
1. `keys.ts`: module name `modelos` reads "Templates"; key labels read as the frame's cell names: "Ver relatórios", "Criar relatório", "Remover relatório",
   "Preencher fichas, fotos e pontos", "Gerar e emitir relatório", "Baixar DOCX e PDF emitidos", "Editar templates", "Editar tipos de equipamento", "Editar cadastros",
   "Aceitar sugestões de cadastro", "Gerenciar usuários", "Gerenciar papéis e permissões". New `permissionModuleHelp(module)` (the frame's `.pp-mod-meta` lines, verbatim) and
   `permissionKeyHelp(key)` (the frame's `.pp-key-help`, only `users.manage` and `roles.manage`: "Quem tem esta permissão pode mudar usuários e papéis, inclusive os próprios."; else null).
   Mark each `// authored (Story 26.10)` or the frame file. Fix any existing test that pins an old label only if it asserts the label text itself (report which).
2. New `role-editor.ts`, exported from `index.ts`:
   - `ROLE_NAME_MAX_LENGTH = 60`; `NEW_ROLE_PERMISSIONS = ['relatorio.view']`; `ROLES_BESIDE_MAX = 7`; `rolesOneAtATime(count: number): boolean` (count > 7).
   - `normalizeKeys(keys)`: dedupe, catalog order. `roleNameIssue(name, roles, ownId?)`: null, or `'empty' | 'too_long' | 'taken'` (trim, collapse spaces; compare ignoring case
     and accents against every live role's name, the seeded names included, except `ownId`) and `roleNameIssueText(issue)` (derived text, pt-BR).
   - `orderRoles(rows)`: live roles only, seeded in the table's order, then custom by id.
   - `roleChangeVerdict(roles, users, change)`: `change` is `{kind:'permissions', role_id, permissions} | {kind:'rename', role_id, name} | {kind:'create', name} | {kind:'remove', role_id}`;
     answers `{ok:true}` or `{ok:false, reason, details?}` with reason `role_not_found` (no live role of the company), `role_locked` (the Admin role: every change; a seeded role: rename and remove;
     `details.system` true for the seeded case), `role_name_taken`, `role_name_invalid`, `role_in_use` (`details: {user_count, user_names}`; users counted: those whose status is not `removed`,
     reading open to the owner: a removed user cannot be edited, so counting him would make the role unremovable). `users` are `{id, name, role_id, status}`.
   - `restoredPermissions(role)`: the seeded set (catalog order) of a seeded non-Admin role, else null; `isAtSeededSet(role)`.
   - Grid derivations for the web (no logic in `apps/web`): `moduleState(permissions, module)` -> `{state:'on'|'off'|'mixed', held, total}`; `toggleModule(permissions, module)` (mixed or off -> all on; on -> all off, other
     modules untouched, result normalized); `toggleKey(permissions, key)`; `gridChanges(saved: RoleRow[], draft: Record<roleId, PermissionKey[]>)` -> ordered list `{role_id, role_name, key, on}`
     (roles in column order, keys in catalog order); `unsavedChangesText(changes)` ("1 alteração não salva: Engenheiro de Campo · Criar relatório." for one, "N alterações não salvas." for more, `null` for none);
     `managementGrantText(changes)` (non-null when a change turns `users.manage` or `roles.manage` ON: rule 4 of the story, "the screen says so before saving"); `roleHeadMeta(userCount, custom)`
     ("1 usuário", "2 usuários", "0 usuários", custom adds " · criado"); `roleInUseText({user_count, user_names})` (the frame's "1 usuário tem este papel: Marcos Teixeira. Mude o papel dele em Usuários e tente de novo.";
     plural "2 usuários têm este papel: A e B. Mude o papel deles ..."; names beyond five become "e mais N"); `roleLockedText(details)`; cell labels `keyCellLabel(keyLabel-> role name, locked)`
     ("Criar relatório — Engenheiro de Campo"; Admin: "... — Admin, sempre") and `moduleCellLabel` (with ", 2 de 3" when mixed); `rolesGridCopy`-style constants only where the text is derived.
   - Tests: every rule above with boundaries (empty, 60 and 61 characters, equal name with another case, own name on rename, Admin in every change, seeded rename/remove, in-use 0/1/2/6 users,
     removed user not counted, mixed/off/on module toggles, restore equals `SYSTEM_ROLE_PERMISSIONS`, `rolesOneAtATime(7|8)`, `gridChanges` with no change, one, a role removed from the draft).

### C. Contract (`packages/domain/src/contract/admin-roles.ts`, exported from the contract index), no `CONTRACT_VERSION` change
- `ADMIN_ROLE_ROUTES`: `list` GET `/api/admin/roles`; `set_permissions` PATCH `/api/admin/roles` body `{roles: [{id, permissions}]}` (1 to 50 items, the grid's one save, atomic);
  `create` POST `/api/admin/roles` body `{name}`; `rename` PATCH `/api/admin/roles/:id` body `{name}`; `remove` POST `/api/admin/roles/:id/remove` body `{}`; `adminRoleRoutePath`.
- `adminRoleViewSchema`: `{id, name, system: SystemRoleId|null, permissions (Admin: every key), locked: boolean (the Admin role), user_count}`; list answers `{roles}` in `orderRoles` order, live only; every write answers `{roles}` too
  (the whole list as it now is, so the grid redraws from one answer). `adminRoleEventSchema` (usage log line `admin_role_event`: action, actor_id, company_id, role_id; ids only).
- `errors.ts`: append `role_name_taken`, `role_locked`, `role_in_use`, `role_name_invalid` (409 for the first three, 409 for the last as the name is rejected by the kernel's rule; a body that fails the zod shape is 400 `invalid_request`).
- `map.ts`: `PERMISSION_ROUTES` gains `'admin.roles'` -> `roles.manage`; adjust `map.test.ts` coverage accordingly.

### A. API (`apps/api/src/admin/roles.ts`, `apps/api/src/http/admin-roles.ts`, mounted in `http/app.ts` beside the users routes)
- Every handler: `requirePermission(c, permissionForRoute('admin.roles'))` first (403 `forbidden`; inactive user 401), then body (400), then the service.
- Service via `applyDecidedWrites`, one `applyServerBatch` per request under the company lock, the decision (`roleChangeVerdict` over `readCompanyUsers` roles and users) re-taken under the lock,
  so two creates of one name at once give one 409 `role_name_taken`. Writes: create = `create` op at `rolePath(id)` with a `RoleRow` (`id` from `newId()`, name trimmed and collapsed, `permissions` `NEW_ROLE_PERMISSIONS`, no `system`, `removed_at: null`);
  rename = `put` `roleFieldPath(id,'name')`; permissions = `put` `roleFieldPath(id,'permissions')` with the normalized keys (a role whose set is unchanged writes nothing; several roles = one batch); remove = `put` `roleFieldPath(id,'removed_at')` an ISO instant.
  A request that changes nothing answers 200 with the list and writes no op. Another company's role id is `role_not_found` 404 (tenant). Emit the usage event after commit.
- Nothing is deleted: a removed role stays as a tombstone row; `can` already grants nothing to it.

### W. Web (`apps/web/src/`)
- `api/admin-roles-client.ts`: the five calls, zod-parsed, errors as `{code, details}`; the only `fetch` of the story.
- `surfaces/papeis/papeis-surface.tsx` (+ `papeis-grid.tsx` if the file passes 400 lines): route `/usuarios/papeis` in `app.tsx` (own block, `handle: {title: copy.papeis.title}` = "Usuários"), the markup and class names of the frame:
  head and "Novo papel"; the two section notes; phone/tablet chips "Papel" (`role="radiogroup"`, chips `role="radio"` with `aria-checked`; default the first role after Admin); the table `pp-grid` (roles as columns in `orderRoles` order,
  Admin column locked with `aria-disabled` and the lock glyph, modules as rows, a module of several keys opens into its keys with the chevron button, a module switch `role="checkbox"` with `aria-checked="mixed"` and "N de M", one-key modules carry the key's own switch);
  a changed cell carries `is-changed` and the hidden words "alterado, não salvo"; the role head's menu (`.pp-role-btn`, react-aria `MenuTrigger`/`Menu`/`Popover` as `components/tabs.tsx` does, item "Restaurar permissões padrão" for a seeded role plus the line "Papel do sistema: não pode ser renomeado nem removido.";
  "Renomear" and "Remover" (destructive group) for a custom role; the Admin head is a plain name with the lock, no menu); dialogs "Novo papel", "Renomear papel" (FormDialog; inline kernel `roleNameIssueText`, an input `.input`),
  the remove Confirm ("Remover o papel X?"), the refusal dialog when `role_in_use` ("Não é possível remover X", `roleInUseText`, "Ir para Usuários" as a link to `/usuarios`, "Entendi"); the sticky bar with `btn-reason` lines
  (`unsavedChangesText`, plus `managementGrantText` as a second sentence when non-null; after saving, "Permissões salvas. Cada aparelho passa a segui-las na próxima sincronização." with `role="status"`), "Descartar" and "Salvar alterações"
  (with nothing changed both are disabled through `Button`'s `disabledReason`, the line reading "Nenhuma alteração para salvar."; the frame draws only the dirty and saved states). Offline: "Novo papel", the menus' write items and "Salvar alterações" disabled with the
  existing offline reason sentence of the app (reuse one from `pt-br.ts`; do not author a new one if a fitting one exists; else authored and listed).
- State: the draft is a map roleId -> keys held in the component, seeded from the list answer; "Salvar alterações" sends only the changed roles in one `set_permissions`, redraws from the answer, clears the draft, Toast "Permissões salvas";
  a failed save keeps the draft and shows the error line (`role_locked`, `role_not_found` -> reload the list). "Descartar" resets the draft (no confirm; frame: Toast "A grade volta ao que estava salvo").
  Restore in the head menu sets that role's draft to `restoredPermissions` and Toasts the frame's sentence. A tap on the module switch uses `toggleModule`; a key switch `toggleKey`. All verdicts and texts come from the kernel.
- Tab strip: render the frame's `nav.tabs` with two `<a class="tab" role="tab">` links ("Usuários" -> `/usuarios`, "Papéis e permissões" selected). The Usuários tab is wired only once batch e26d's `/usuarios` is on main:
  until then leave the first link out (the orchestrator wires it after merging e26d; keep it in one small component `UsuariosTabs` inside `papeis/` so the swap is one line).
- Copy: static sentences in `copy/pt-br.ts` under one new key `papeis` (own block at the end of the object, marked `// authored (Story 26.10)` or "frame 93-papeis.html"); derived text in the kernel; component chrome none.
- `styles/app.css`: one block "Story 26.10: Papéis e permissões", the frame's `[data-route="/usuarios/papeis"]` rules translated per AGENTS.md "Mock container selectors": drop the route prefix (use a `.pp-*` scope, the root carries `.pp-root`),
  `.frame-phone` -> `@media (max-width: 767.98px)`, `.frame-tablet-landscape` -> `(min-width:1024px) and (max-width:1279.98px)`, `.frame-desktop` -> `(min-width:1280px)`, `.frame-tablet` -> `(min-width:768px) and (max-width:1279.98px)`;
  `[aria-disabled]` mirror for the mixed/locked toggle as drawn. "One role at a time": the root carries `data-picked` and the hidden columns carry `is-unpicked`; chips show below 768 px, and below 1280 px when the root carries `pp-many` (8 or more roles, `rolesOneAtATime`).
  Do not touch `tokens.css` or `components.css`.
- `app.tsx` additions in their own block; `telemetry/routes.test.tsx`: add `/usuarios/papeis` to its `OTHER_ON_PURPOSE` set with a one-line comment (the screen list is a telemetry contract; no contract number moves; report this edit).

## Tests to write (all by the subagent, run by the orchestrator)
- Unit: `role-editor.test.ts` (kernel); `apps/web/src/surfaces/papeis/papeis-surface.test.tsx` "26.10-WEB-001..n" with the client mocked: grid renders roles x modules, Admin column locked, module switch states and the three taps, one key change marks the cell and the bar,
  save sends only changed roles, restore, new role dialog (duplicate name inline), rename, remove refused with the count sentence, 8 roles carry `pp-many`.
- API `apps/api/src/http/admin-roles.integration.test.ts`: "26.10-API-001" each route happy path and its ops (paths, actor `system:admin`, values); refusals (Admin role on every change, seeded rename and remove, duplicate name in any case and with accents, empty and 61-char names -> 409/400 as specified,
  in-use with the count in `details`, unknown id 404, another company's id 404, unchanged request writes no op, restore = table); "26.10-API-002" a custom role "Estagiário" held by a user: a push of a fill op as that user is accepted, the Admin takes `relatorio.fill` away, the same kind of op pushed again is `op_forbidden`
  (the role's reason); give `relatorio.create` to Engenheiro de Campo and his create is accepted; two creates of one name at once -> one 201 and one 409; Gestor do Projeto and Consulta get `403 forbidden` on every route, an inactive Admin 401. Use `adminHarness` and the sync route helpers the users test uses.
- e2e `e2e/roles-editor.spec.ts`, new, in the worker's Empresa B, as the Admin of the pair signed in (reset first): "26.10-E2E-001 @p0": the Admin opens `/usuarios/papeis`, gives "Criar relatório" to Engenheiro de Campo, saves; a second browser CONTEXT (a field engineer seeded with `seedRoleUser`, signed in before the change) syncs (`syncNow`) and shows "Novo relatório" enabled with the same device not reloaded;
  the Admin creates "Estagiário", gives "Preencher fichas, fotos e pontos", saves, the roles list shows a column "Estagiário", the Admin removes it (no user holds it: Confirm) and the column is gone; the committed server state is asserted through the list route (or the DB) after each save, not only the screen.
  "26.10-E2E-002 @p1": the refused removal (a user holds the role: sentence names the count), the Gestor lands on Home with the Toast at `/usuarios/papeis`, the restore of a changed seeded role, and 390, 768, 1280 px with `horizontalOverflow <= 0`; at 390 one role shows at a time; with 8 roles at 768 one role shows at a time.
  Keep each spec under its timeout; avoid `waitForTimeout`; type and wait past autosave where a field is edited.

## Acceptance (Given/When/Then of the story, verbatim in `epics.md` under 26.10; each is covered by a test above)
- Give `relatorio.create` -> device shows "Novo relatório" after its next pull and the server accepts the create. Take `relatorio.fill` -> a reading written before is rejected with the role's reason and stays in the outbox with "Reenviar" (api test; the "Reenviar" part is Story 26.4's, asserted in `roles-server.spec.ts`).
- Admin line: every switch on and locked, the route refuses a change. "Estagiário" with view and fill: that user fills fichas and sees no Templates, Cadastros or Usuários (kernel `can` + screens map, api test; screens by role are Story 26.5's).
- Custom role held by one user: remove refused with a sentence naming the count. Seeded role restored: its keys are the epic's table. Gestor on the tab's address: Home with the Toast; routes 403.

## Cross-batch wiring
- The Usuários tab link and the "Ir para Usuários" target need `/usuarios` (batch e26d, merges first): wiring owner is this batch after e26d is on main, else a `deferred-work.md` entry owned by the coordinator. The users dialog's role list reads roles from e26d's own call; no shared module.
- No contract number, no migration, no seed change. `app.tsx`, `pt-br.ts`, `app.css`: this batch's additions are separate blocks.

## Authored sentences (list them in the PR) / open readings
- Authored: every `// authored (Story 26.10)` line, including "Nenhuma alteração para salvar.", the name-issue sentences, the `role_locked` sentences and the grant warning of `managementGrantText`.
- Readings open to the owner: tablet = below 1280 px for "8 or more roles"; removed users do not count as holders of a role; the grid renders from the list route (counts), online only; the grant warning is a second sentence in the sticky bar;
  the seeded roles cannot be renamed (the frame says so); old ops are judged by the new keys (the coordinator's reading in the story).
