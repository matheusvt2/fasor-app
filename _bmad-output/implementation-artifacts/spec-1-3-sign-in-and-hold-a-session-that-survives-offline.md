---
title: 'Sign in and hold a session that survives offline'
type: 'feature'
created: '2026-09-21'
status: 'done'
baseline_commit: '7789990ad903049765d2d92a7ef09fb98eaa64f9'
baseline_revision: '7789990ad903049765d2d92a7ef09fb98eaa64f9'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-fasor-2026-09-21/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-1-run-the-whole-stack-with-one-command.md'
  - '{project-root}/AGENTS.md'
dev_model: 'opus'
dev_effort: 'medium'
warnings: ['oversized']
deferred:
  - summary: >-
      Extend the cross-tenant sweep (1.3-API-002) over the stream, file, generate and revision routes as each lands.
    evidence: |-
      The intent's matrix row "Cross-tenant call" is asserted only over the two routes this story ships (GET /api/account, PUT /api/account/registration) plus the repository layer and the compile-time proof; no route accepts a client-supplied company id yet, so the 403 half of "Refused (403) or empty" has no surface to run against. The spec's Design Notes asked for this extension to be recorded as deferred.
    location: >-
      apps/api/src/auth/auth.integration.test.ts (1.3-API-002)
    severity: low
  - summary: >-
      Convert the registration save from the named server action PUT /api/account/registration to a user/{id}/{field} op once Story 1.4's op log lands.
    evidence: |-
      AD-1/AD-3 say the web writes only ops; the op log is Story 1.4 and was not merged, so the save is a named server action allowed by AD-9. Design Notes call the conversion a deferred item, not a redesign.
    location: >-
      apps/web/src/api/auth-client.ts (saveRegistration), apps/api/src/http/account.ts
    severity: low
  - summary: >-
      Restore the sign-out Confirm dialog's pending-sync wording and the count in the "Sair" button reason once Story 1.5 provides the unsynced counts.
    evidence: |-
      90-account.html shows "Sair com envios pendentes?" with "31 fotos e 3 fichas ainda nao foram enviadas" and a pending-sync sentence in the .btn-reason; those numbers need the sync engine. The dialog keeps the mock's structure and action labels with a neutral title until then (copy/pt-br.ts marks the strings as authored).
    location: >-
      apps/web/src/surfaces/account/sign-out-dialog.tsx, apps/web/src/copy/pt-br.ts
    severity: low
  - summary: >-
      revokeSessions filters on session.company_id, which only the better-auth session hook fills; a session row inserted by any other path with a null company_id would survive a password reset.
    evidence: |-
      session.company_id is nullable because better-auth inserts the row; the databaseHooks.session.create.before hook stamps it and user.company_id is NOT NULL, so the null path is unreachable today, and 1.3-API-001 proves the real reset path revokes the session. It becomes a hole only if something inserts sessions outside better-auth.
    location: >-
      apps/api/src/db/seed.ts (revokeSessions), apps/api/src/auth/auth.ts (session hook)
    severity: low
---

<intent-contract>

## Intent

**Problem:** The stack boots but has no identity: `apps/api` exposes only `GET /api/health`, has no Drizzle schema, no migrations and no auth; `apps/web` is a nine-line shell with no router, no Dexie database and no screens. Nothing scopes data to a company, so the moment a second company exists a cross-tenant read is possible, and a field user cannot sign in at all, let alone keep working in a basement with no signal.

**Approach:** Add the Drizzle `company`/`user` schema with forward-only SQL migrations applied at api boot; a repository layer whose every function takes `companyId` as a required typed argument; better-auth email+password at `/api/auth/*` with an httpOnly `SameSite=Lax; Secure` 30-day sliding cookie and sign-up disabled; a `scripts/seed-users.ts` provisioning CLI with a two-company test mode; and, on the web, React Router in library mode with a Login surface, a per-user Dexie database `releng-{user_id}`, a single banner slot carrying the re-auth banner on 401, and an Account surface with the "Registro profissional" Form dialog and a sign-out that never drops the local database.

## Boundaries & Constraints

**Always:** Same origin, no CORS; API routes under `/api/*` (AD-9). Cookie is httpOnly, `SameSite=Lax`, `Secure`, 30-day sliding. Sign-in requires connectivity; an established session continues offline indefinitely. Dexie database name is exactly `releng-{user_id}`; sign-out never deletes it. Every Drizzle table carries `company_id`; the API resolves `company_id` from the session once per request and every repository function takes it as a required typed argument so a query without it does not compile (AD-10). DB `snake_case` via Drizzle mapping, TS `camelCase`, files `kebab-case`. All UI copy is pt-BR verbatim from the mockups, through one copy module; code, comments and commits are English; the product name comes from the `PRODUTO` constant; `relatorio` never `laudo`; no emoji. Screens use the mockups' own class names from the already-copied `tokens.css`/`components.css`. `fetch` only in `apps/web/src/{sync,files,api}`. Everything runs in Docker; `docker compose up` still starts the whole stack.

**Never:** No signup route, no outbound e-mail, no roles, no password reset by e-mail. No Home content beyond a placeholder (Story 1.6). No op log, `applyOp`, outbox semantics or sync engine (Stories 1.4/1.5) — this story only declares the Dexie object stores. No service worker (Story 1.8). No HTTPS proxy (Story 1.7). No "Instalar na tela inicial" surface anywhere — removed by `source-deltas.md` (web only, no install), even though `90-account.html` still shows it. No shared component library build-out (Story 1.2). No row-level security. No cloud account or paid API key. Never modify `apps/web/src/styles/tokens.css` or `components.css` — `styles.test.ts` locks them byte-identical to the mockups.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Sign in online | valid e-mail + password | 200; httpOnly `SameSite=Lax; Secure` cookie set; Dexie `releng-{user_id}` opened; navigates to Home | No error expected |
| Bad credentials | wrong password | Stays on Login; `.login-error` with `role="alert"` reads "Senha incorreta"; the password `.input` gets `.is-invalid` and `aria-describedby` to the error | Non-2xx from `/api/auth/*` is mapped to that one message; never leaks which field failed |
| Login offline, no session | `navigator.onLine === false` | `.login-offline` `role="status"` line shown; "Entrar" `aria-disabled="true"` with `.btn-reason` "Entrar precisa de conexão" beside it, still focusable; no spinner, no request | Submit is a no-op while offline |
| Cold open offline with session | cookie present, network down | App boots from the cookie and the local database straight to Home; no sign-in prompt | Storage evicted with cookie present is out of scope (Story 1.8) |
| 401 during a network call | session expired mid-use | Re-auth banner in the single banner slot; local Dexie data and every store untouched | Banner offers "Entrar de novo"; never clears the database |
| Sign out | tap "Sair", confirm | Session cookie cleared, back to Login; the `releng-{user_id}` database still exists with its contents | Confirm dialog is `role="dialog" aria-modal`, initial focus "Cancelar" |
| Edit registro profissional | Conselho CREA/CRT, number, title | Saved to the user's account; the settings row re-reads "CREA ⟨número⟩ · Eng. Eletricista" (CRT equivalent for CRT); changing the conselho swaps the number label and the default title without clearing a typed number | Offline: the dialog's save button is `aria-disabled` with a `.btn-reason`; server failure shows the error in the dialog and keeps it open |
| Cross-tenant call | user of company A asks for company B's id | Refused (403) or empty; never a row of the other company | One automated test with two seeded companies |
| Sign-up attempt | `POST /api/auth/sign-up/email` | Non-2xx, no user created | Route disabled at the better-auth config |
| Seed CLI outside compose | run on the host | Refuses, exits non-zero, names the requirement | Same guard as `scripts/test-reset.ts` |
| Seed CLI test mode | `--test` | Provisions two companies with one user each in one call, idempotently | Re-running does not duplicate rows |

</intent-contract>

## Code Map

Server:
- `apps/api/src/config.ts` — zod env schema (`configSchema`), `loadConfig` collects issues and names offending variables, `loadConfigOrExit` prints and `process.exit(1)`. `SESSION_SECRET: z.string().min(32)` already exists and is consumed by nothing — this story wires it into better-auth. Add any new variable here, to `.env.example` and to the `x-app-env` anchor in `docker-compose.yml`.
- `apps/api/src/main.ts` — boots: `loadConfigOrExit()`, `createDb`, `createS3`, `withRetry('queue', startQueue)`, `createApp({db, queue, storage, libreoffice})`, `serve({fetch: app.fetch, port})`. Migrations must run here, after the db retry and before `serve`.
- `apps/api/src/db/client.ts` — `createDb(url) => postgres(url, {max: 5})` (postgres.js). Wrap with `drizzle()`; keep the raw client for the `select 1` health probe.
- `apps/api/src/db/` — otherwise only `.gitkeep`. No schema, no migrations, no SQL anywhere in the repo today.
- `apps/api/src/http/app.ts` — `createApp` registers only `app.get('/api/health', ...)`. Mount auth and the account route here.
- `apps/api/src/http/health.ts` / `health.test.ts` — probe pattern (`Promise.race` 3 s timeout) and its test style.
- `apps/api/src/boot.integration.test.ts` — the pattern for an api test hitting the live container: `process.env.API_URL ?? 'http://api:3000'`. Reuse it for `1.3-API-001` / `1.3-API-002`; these run under `pnpm test:api` → `vitest run -t '^(?!.*@slow)'`.
- `apps/api/package.json` — deps to add: `drizzle-orm` 0.45, `better-auth` 1.7; dev: `drizzle-kit` 0.31. `postgres` 3.4 and `zod` 4.6 already present.

Tooling:
- `pnpm-lock.yaml` — no `drizzle`, no `better-auth`, no `dexie`, no `react-router` anywhere. The `install` compose service runs `pnpm install --frozen-lockfile` and every other service `depends_on` it, so the lockfile **must** be regenerated (inside the container) and committed or nothing starts.
- `docker-compose.yml` — `x-app-env` anchor; only the `web` service sets `API_PROXY_TARGET: http://api:3000`. The `tools` service (profile `tools`, `depends_on: api healthy`) does **not**, so the Playwright-started Vite on port 5199 would proxy `/api` to `http://localhost:3000` and every auth e2e would fail. Add `API_PROXY_TARGET: http://api:3000` to `tools`.
- `package.json` (root) — `verify: lint && static && test:unit && test:api && test:e2e`; `test:unit` = domain + web vitest then root vitest (`scripts/**/*.test.ts`); `test:e2e` = `playwright test --grep @p0`.
- `playwright.config.ts` — `testDir: 'e2e'`, `baseURL: http://localhost:5199`, one project `desktop-chrome`, `webServer` starts Vite on 5199.
- `eslint.config.js` — import-direction rules plus the fetch rule whose `ignores` is exactly `apps/web/src/{sync,files,api}/**`. An `apps/web/src/auth/` directory would be **blocked** from calling `fetch`; put the auth client in `apps/web/src/api/`.
- `scripts/test-reset.ts` — `assertInCompose()` checks `RUNNING_IN_COMPOSE === '1'` **and** `/.dockerenv`; reuse it verbatim in the seed CLI. `TABLES = ['ops','files','revisions','generation_jobs','reading_runs']`, each deleted `where company_id = ...` — confirms the column convention.
- `scripts/tooling.test.ts` — asserts the eslint rules via `eslint.lintText`, plus a walk of `apps/web/src` forbidding the codename `fasor` in web strings. New web files must keep that green.
- `tsconfig.base.json` — `strict`, `noUncheckedIndexedAccess`, `moduleResolution: "Bundler"`, `allowImportingTsExtensions`; every import carries an explicit `.ts`/`.tsx` extension.

Web:
- `apps/web/src/app.tsx` (9 lines) and `main.tsx` (14 lines, sets `document.title = PRODUTO`) are the whole app. `src/{db,sync,files,api,state,input,surfaces}` are `.gitkeep` only.
- `packages/domain/src/product.ts` — `export const PRODUTO = 'PRODUTO'`, re-exported from `index.ts`. `contract.ts` holds `healthResponseSchema` — the pattern for shared zod contracts (user/company/registration schemas belong here).
- `apps/web/vite.config.ts` — `server.host true`, port 5173, `proxy['/api'].target = process.env.API_PROXY_TARGET ?? 'http://localhost:3000'`, `changeOrigin: false`.
- `apps/web/src/styles/components.css` (read-only) — classes this story uses: `.login-screen`, `.login-form`, `.login-wordmark`, `.login-error`, `.login-offline`, `.login-foot`, `.input`, `.input.is-invalid`, `.input-suffix-btn`, `.field`, `.field-label`, `.helper`, `.echo`, `.btn` + `.btn-primary|.btn-secondary|.btn-destructive|.btn-text|.btn-block`, `.btn-reason`, `.banner` + `.banner-text` + `.banner-actions` + `.banner-slot`, `.dialog-scrim`, `.confirm-dialog`, `.form-dialog`, `.dialog-title`, `.dialog-actions`, `.segmented` + `.seg` + `.check`, `.settings-list`, `.settings-row` + `.sr-label` + `.sr-value`, `.section`, `.section-head`, `.section-note`. `.reg-grid` and `.account-name` are screen-scoped in the mockup, not in `components.css`.
- `e2e/shell.spec.ts` — `@p0` asserting an `<h1>` of `PRODUTO` at `/`; the Login wordmark is `<h1 class="login-wordmark">PRODUTO</h1>`, so it keeps passing.

Mockups (authoritative markup and pt-BR strings), under `_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/mockups/`:
- `prototype/screens/10-login.html` and `key-login.html` (3 frames: default, error, offline).
- `prototype/screens/90-account.html` and `key-account.html`.

## Tasks & Acceptance

**Execution:**
- `apps/api/package.json`, `pnpm-lock.yaml` -- add `drizzle-orm` 0.45, `better-auth` 1.7, dev `drizzle-kit` 0.31; regenerate the lockfile with `docker compose run --rm tools pnpm install --lockfile-only` (or `pnpm install` in the container) -- `--frozen-lockfile` in the `install` service fails otherwise
- `apps/api/src/db/schema.ts` -- Drizzle tables `company` and `user` (better-auth's `session`, `account`, `verification` alongside), `company_id` on every non-company table, user carrying `name`, `email`, `council` (`crea|crt`), `registration_number`, `title` -- AD-10, FR-6, CAP-6
- `apps/api/src/db/migrations/` + `apps/api/drizzle.config.ts` + root `db:generate` script -- forward-only SQL generated by drizzle-kit and committed -- the repo has no migration mechanism yet
- `apps/api/src/db/migrate.ts`, `apps/api/src/main.ts` -- run migrations at boot after the db retry, before `serve` -- `docker compose up` must stay one command (DoD 3)
- `apps/api/src/db/repositories/*.ts` -- every exported function takes `companyId: CompanyId` as a required first argument; `CompanyId` is a branded type so a bare string or an omitted argument does not compile -- AD-10
- `apps/api/src/auth/auth.ts` -- better-auth with the Drizzle adapter, `emailAndPassword` enabled with sign-up disabled, `secret` from `SESSION_SECRET`, cookie httpOnly/`SameSite=Lax`/`Secure`, session `expiresIn` 30 days with sliding refresh -- AD-9, B-6
- `apps/api/src/http/app.ts` -- mount `/api/auth/*`; add session middleware resolving `{userId, companyId}` once per request and a `requireSession` guard returning 401 -- AD-9, AD-10
- `apps/api/src/http/account.ts` -- authenticated `GET`/`PUT` of the signed-in user's professional registration, validated by a shared zod schema, scoped through the repository -- UX-DR22
- `packages/domain/src/contract.ts` (or a sibling) -- zod schemas for the user profile and the professional registration, plus the pure `registrationRowText(user)` and `defaultTitleForCouncil(council)` helpers -- AD-1: text is computed in the kernel, never in an app
- `apps/api/src/db/seed.ts` + `scripts/seed-users.ts` -- provisioning library plus a thin CLI (company name, e-mail, password, name, council, registration number, title) with a `--test` flag seeding two companies with one user each, idempotent, reusing `assertInCompose` -- TC-9, B-6
- `docker-compose.yml` -- add `API_PROXY_TARGET: http://api:3000` to the `tools` service -- without it every auth e2e in `pnpm verify` proxies to nowhere
- `apps/web/package.json` -- add `dexie` 4.4, `dexie-react-hooks`, `react-router` 8.4 (library mode), `better-auth` client -- Stack table
- `apps/web/src/db/database.ts` -- open Dexie `releng-{user_id}` at version 1 declaring `entities`, `outbox`, `drafts`, `files`, `sync_state`, `local_prefs` with a mandatory `upgrade()`; expose open/close; never `delete()` -- AD-9; Story 1.4 fills the semantics
- `apps/web/src/api/auth-client.ts` -- the only place calling `fetch` for sign-in, sign-out, session read and the registration save; every non-2xx `401` publishes a re-auth event -- AR-1/AD-9
- `apps/web/src/state/session.tsx` -- session context: boot from the cookie, expose user, online state and the re-auth flag; hold the Dexie handle -- AD-8
- `apps/web/src/state/banner-slot.tsx` -- one banner slot rendering the highest-priority banner; only `re-auth` is populated here, priority list from the spine (`conflict › re-auth › draft found › suggestions ready › relatório exported › offline › unsynced > 5 days`) -- Story 1.6 extends it
- `apps/web/src/copy/pt-br.ts` -- one module holding every pt-BR string of Login and Account, verbatim from the mockups -- UX-DR75
- `apps/web/src/surfaces/login/*` -- the Login surface: wordmark, two 56 px inputs, "Mostrar", primary block button, footer, error and offline states, all with the mock's class names -- UX-DR61
- `apps/web/src/surfaces/account/*` -- Account: identity rows, the "Registro profissional" settings row and its "Editar" Form dialog (Conselho segmented, number, title defaulted by council and editable), and the destructive "Sair" with its pending-sync Confirm dialog -- UX-DR22, UX-DR65
- `apps/web/src/surfaces/home/*` -- placeholder Home behind the session guard, app bar with the `PRODUTO` wordmark and the avatar opening Account -- Story 1.6 replaces it
- `apps/web/src/app.tsx`, `main.tsx` -- React Router in library mode: `/login`, `/`, `/account`; unauthenticated routes redirect to `/login`, authenticated `/login` redirects to `/` -- AD-9
- `apps/api/src/**/*.test.ts` -- `1.3-API-001` (cookie flags, sign-out, 401 without cookie, sign-up refused, seed CLI provisioning) and `1.3-API-002` (two companies, no cross-read) against the live container -- R-008, NFR-13
- `packages/domain/src/*.test.ts`, `apps/web/src/**/*.test.ts` -- unit tests for `registrationRowText`, `defaultTitleForCouncil` and the banner-priority pick; a Dexie test proving sign-out leaves the database and its rows intact -- AD-1
- `e2e/support/merged-fixtures.ts` + `e2e/auth.spec.ts` -- `1.3-E2E-001` (sign in, go offline, reload, still usable; sign-out keeps the Dexie database) and `1.3-E2E-002` (401 mid-call raises the re-auth banner, local data intact, re-sign-in clears it), both `@p0`, every spec importing `test`/`expect` from the fixtures module -- handoff P0 list

**Acceptance Criteria:**
- Given two companies seeded by `scripts/seed-users.ts --test`, when a user of one company calls every route the api exposes with the other company's id, then no row of the other company is ever returned, and the same test proves a repository call without `companyId` does not typecheck.
- Given a signed-in session, when the user opens Account, taps "Editar" on "Registro profissional", switches Conselho and saves, then the number field's label and the default printed title follow the council, an already-typed number is not cleared, and the settings row re-reads "CREA ⟨número⟩ · Eng. Eletricista" or the CRT equivalent.
- Given a signed-in user, when "Sair" is confirmed, then the session cookie is gone, the app is on Login, and the `releng-{user_id}` Dexie database and all its object stores still exist with their rows.
- Given a user who signed in online, when the tab is reopened days later with the network down, then the app reaches Home from the cookie and the local database with no sign-in prompt and no network wait.
- Given the whole change, when `docker compose run --rm tools pnpm verify` runs, then lint, static, unit, api and Playwright `@p0` are green in under 15 minutes and `docker compose up` still starts the stack.

## Spec Change Log

### 2026-09-21 — Verification command corrected

- Triggering finding: the implementation subagent reported that `docker compose run --rm tools tsx scripts/seed-users.ts --test` does not run (the node image's entrypoint turns a bare `tsx` into `node tsx`).
- Amended: the `## Verification` command now reads `docker compose run --rm tools pnpm exec tsx scripts/seed-users.ts --test`. No other section changed; no code was re-derived.

## Review Triage Log

### 2026-09-21 — Review pass

- verdicts: 51 findings — high 0, medium 15, low 34, false 2, maybe-false 0
- findings:
  - `[false]` `[reject]` (blind-hunter) drizzle-kit snapshot missing from `migrations/meta/` — `apps/api/src/db/migrations/meta/0000_snapshot.json` exists in the tree and is committed; it was only filtered out of the review diff file for size.
  - `[medium]` `[patch]` (blind-hunter) `revokeSessions` dead; re-seeding a password leaves sessions valid — patched: `seedUser` calls `revokeSessions` after the account upsert when the user already existed; 1.3-API-001 gained "old cookie gets 401 after re-seed".
  - `[medium]` `[patch]` (blind-hunter) every sign-in failure rendered as "Senha incorreta" with `.is-invalid` — patched: `SignInResult` carries `reason: 'credentials' | 'network'`; transport failures show the offline text in the `role="alert"` span without marking the password field.
  - `[medium]` `[patch]` (blind-hunter) sign-out failure silent, unhandled rejection, user stays signed in with no feedback — patched: `auth-client.signOut` throws `ApiError` on `result.error`, `doSignOut` clears nothing on throw, AccountSurface shows `signOutFailed` in a `role="alert"` span and keeps the session.
  - `[low]` `[reject]` (blind-hunter) mock's `.echo` preview absent from the registration dialog — EXPERIENCE.md's Form dialog pattern (which wins over the mock) lists Conselho, number and title only; the settings row already shows the composed text; adding the preview needs new copy and a new element, more than a direct correction.
  - `[low]` `[patch]` (blind-hunter) authored pt-BR strings not marked as such — patched: module comment corrected, each authored string carries an `// authored:` note, `signOutNote` quotes the mock's full sentence.
  - `[low]` `[reject]` (blind-hunter) sign-out gated offline although the matrix row has no connectivity condition — the cookie is httpOnly, so clearing it is inherently a server call; the gate applies the same `aria-disabled` + `.btn-reason` pattern the intent uses for every server write; a local-only sign-out would add a new mode and state, more than a direct correction.
  - `[low]` `[patch]` (blind-hunter) pt-BR message in an API error envelope — patched: `account.ts` message is English; the web maps by `code`.
  - `[low]` `[reject]` (blind-hunter) `last-session.ts` is an undeclared localStorage layer with no unit coverage — the cookie is unreadable to JS, so a local pointer is the only reading that satisfies "reaches Home from the cookie and the local database with no network wait"; `local_prefs` lives inside the per-user database that cannot be opened before the user is known; it holds no secret and is exercised by 1.3-E2E-001 and 1.3-E2E-002b; a unit test would need a jsdom setup `apps/web` does not have.
  - `[low]` `[reject]` (blind-hunter) `deferred: []` contradicts Design Notes — the fix is to edit this build's spec; the deferred list is populated by this pass's triage anyway.
  - `[low]` `[patch]` (blind-hunter) `drizzle.config.ts` outside every tsconfig program — patched: added to `apps/api/tsconfig.json` `include`.
  - `[low]` `[reject]` (blind-hunter) `TRUSTED_ORIGINS` validated only as non-empty — a typo'd origin fails loudly at the first sign-in from that origin in local development only (production is same-origin); per-entry URL validation is added complexity for an operator-only path.
  - `[low]` `[reject]` (blind-hunter) sliding refresh (`updateAge`) not exercised — proving the refresh needs server clock control inside the container; the config literal plus the asserted `Max-Age` is the practical evidence; a regression would show as a 30-day fixed session, tolerable.
  - `[medium]` `[patch]` (blind-hunter) a 400 `registration_invalid` shown as retryable, `details` discarded — patched: the dialog validates with `registrationSchema` before sending and maps an `ApiError` 400 to `registrationIncomplete`.
  - `[medium]` `[patch]` (edge-case) IndexedDB open rejecting at boot leaves the app on "Carregando…" forever — patched: `attachDatabase` catches, warns and leaves `database` null; boot still resolves `signed-in`.
  - `[medium]` `[patch]` (edge-case) `attachDatabase` rejecting after accepted credentials reads as a wrong password — patched with the same guard; sign-in resolves `signed-in` with `database` null.
  - `[medium]` `[patch]` (edge-case) sign-out request failure while online is silent — same root cause as the blind-hunter sign-out finding; patched as above.
  - `[low]` `[reject]` (edge-case) `GET /api/account` 500 or 404 read as offline / removed user stays signed in — a server 500 keeping the cached session is the intended fail-open behavior for a field device; a removed user's sessions are deleted by the `on delete cascade` FK, so the next call is a 401 that raises the banner, and the 404 branch is not shown reachable.
  - `[medium]` `[patch]` (edge-case) thrown sign-in request or null profile read reported as "Senha incorreta" — same root cause as the blind-hunter mapping finding; patched with `reason: 'network'`.
  - `[low]` `[reject]` (edge-case) empty e-mail or password round-trips to the server — the server answers with the same credential rejection and the mock defines exactly one inline message; a client-side guard adds a new string and branch.
  - `[medium]` `[patch]` (edge-case) blank number or title surfaces as a generic error — same root cause as the blind-hunter 400 finding; patched with client-side validation and `registrationIncomplete`.
  - `[low]` `[patch]` (edge-case) two e-mails slugging to one `idFor` id overwrite each other — patched: before inserting a new user the seed looks the id up and throws naming both e-mails.
  - `[medium]` `[patch]` (edge-case) `revokeSessions` never called on password reset — same root cause as the blind-hunter finding; patched.
  - `[false]` `[reject]` (edge-case) session hook silently stores a null `company_id` when the user has none — `user.company_id` is `NOT NULL` with a FK, and the hook runs for an existing user row, so the `undefined` branch is unreachable.
  - `[low]` `[reject]` (edge-case) `TRUSTED_ORIGINS` of whitespace or separators reaches better-auth as an empty list — same root cause as the blind-hunter validation finding; rejected for the same reason.
  - `[low]` `[reject]` (edge-case) a sign-in racing the boot read can open two Dexie handles — both handles target the same database name; the overwritten handle is released on unload and Dexie tolerates duplicate opens; serializing opens adds a promise queue for a window of milliseconds.
  - `[low]` `[reject]` (edge-case) blocked localStorage sends a cookie-valid user to Login offline — the matrix marks evicted storage with a cookie present as out of scope (Story 1.8); online, the boot read restores the pointer.
  - `[low]` `[patch]` (edge-case) unmatched `/api/*` returns Hono's plain-text 404 — patched: `app.notFound` returns the `ErrorResponse` envelope; covered by a new 1.3-API-001 case.
  - `[low]` `[reject]` (edge-case) `TEST_SEED.userId` hardcoded instead of derived from `idFor` — the e2e reads the store list of exactly that database name and would fail visibly on drift; the derivation is deterministic and documented beside the constant.
  - `[low]` `[patch]` (edge-case, claim) schema.ts says the repository layer is the only reader while the auth hook and the seed query tables directly — patched: header reworded to route handlers only, naming the two out-of-request exceptions.
  - `[low]` `[reject]` (edge-case, claim) `asCompanyId` is exported and accepts any string, so provenance is by convention — the intent's guarantee is presence ("a query without it does not compile"), which the brand enforces; no route handler mints a `CompanyId` (only `session.ts` and the seed do); enforcing provenance needs a lint rule.
  - `[low]` `[reject]` (edge-case, claim) boot reads localStorage, not the cookie — same root cause as the blind-hunter `last-session` finding; rejected for the same reasons.
  - `[medium]` `[patch]` (verification-gap) "api healthy" does not prove migrations ran (`select 1` passes on an empty database) — patched: 1.3-API-001 asserts `to_regclass('public.user')` is non-null and `drizzle.__drizzle_migrations` has rows against the live container.
  - `[medium]` `[patch]` (verification-gap) boot re-auth branch (cached pointer, cookie gone, reload) untested — patched: new `@p0 1.3-E2E-002b` reloads after `clearCookies` and expects Home, the re-auth banner and the marker row.
  - `[medium]` `[patch]` (verification-gap) `titleEdited` rule exercised only with the council default title — patched: 1.3-E2E-003 saves "Eng. Eletricista Sênior", reopens, switches council and asserts the title is kept.
  - `[medium]` `[patch]` (verification-gap) no check that committed migrations match `schema.ts` — patched: `apps/api/src/db/migrations-match.test.ts` regenerates into a scratch copy and asserts no new `.sql` (asserts on stderr too, since drizzle-kit exits 0 on failure); proven to fail with a probe column.
  - `[medium]` `[patch]` (verification-gap, other) `revokeSessions` has no caller and the hook has a silent null path — caller and test added with the password-reset patch; the null path is unreachable (see the `false` row above) and the latent hole is recorded in `deferred`.
  - `[low]` `[patch]` (verification-gap, other) `readAccount`'s `publishOn401` true branch is dead and the module comment overstates — patched: option removed, comment says only `saveRegistration` publishes.
  - `[low]` `[patch]` (verification-gap, other) `drizzle.config.ts` never typechecked — same root cause as the blind-hunter finding; patched.
  - `[low]` `[reject]` (verification-gap, other) `e2e/shell.spec.ts` now passes on the Login wordmark — it still asserts the product name renders at `/`, which is the intent; renaming the test is cosmetic.
  - `[low]` `[defer]` (intent-alignment 3.1) cross-tenant test runs at the repository/type surface, not as an HTTP 403 — no route accepts a client-supplied company id, so "or empty" is the only reachable reading; the Design Notes direct the sweep's extension to be deferred; recorded in `deferred`.
  - `[low]` `[reject]` (intent-alignment 3.2) `localStorage['releng.last-session']` is a third client surface — same root cause as the blind-hunter `last-session` finding; rejected for the same reasons.
  - `[low]` `[reject]` (intent-alignment 3.3) offline sign-out gate not in the matrix and untested — same root cause as the blind-hunter sign-out gate finding; rejected for the same reason.
  - `[low]` `[patch]` (intent-alignment 3.4) a save 401 shows both the dialog error and the banner; `signIn` maps every failure to "Senha incorreta" — the compound 401 behavior satisfies both matrix rows at once (dialog stays open with its error, banner raised, data intact); the sign-in mapping half shares the root cause with the blind-hunter finding and is patched.
  - `[low]` `[patch]` (intent-alignment 3.5) compile-time tenancy covers the repositories only; seed and auth hook query directly — same root cause as the schema.ts claim finding; patched by rewording the guarantee's scope; better-auth's adapter is out of the intent's reach by design.
  - `[low]` `[reject]` (intent-alignment 3.6) `session.company_id` write-only; middleware resolves from the user row — resolving the tenant from the session's user once per request satisfies AD-10; after the patch `revokeSessions` reads the column; `/api/auth/*` and `/api/health` are public by design.
  - `[low]` `[patch]` (intent-alignment 3.7) seed CLI `--test` success path never run through the CLI — patched: `scripts/tooling.test.ts` runs the CLI with the container env and asserts exit 0 and both "seeded" lines.
  - `[low]` `[reject]` (intent-alignment 3.8) "sliding" asserted as a constant only — same root cause as the blind-hunter sliding finding; rejected for the same reason.
  - `[low]` `[patch]` (intent-alignment 3.9) `account.css` overrides a locked component rule app-wide; `app.css` duplicates the `.frame` base — patched: `.dialog-scrim { position: fixed }` and `.dialog-modal { display: contents }` moved to `app.css` with the rationale; the `.app-root` copy is required because `components.css` scopes its base to the mock's `.frame` bezel and may not be edited.
  - `[low]` `[reject]` (intent-alignment 3.10) `TRUSTED_ORIGINS` is a required, origin-enumerating variable — it is better-auth's CSRF allowlist, not CORS; the compose default covers every local origin and production lists only its own; making it optional would silently disable the check.
  - `[low]` `[reject]` (intent-alignment 3.11) `workers: 1`, `globalSetup`, `shell.spec` semantics, `health.test` retargeted so app composition has no unit coverage — the composition (auth mount, middleware order, `onError`, `notFound`) is covered by the live-container suite (1.3-API-001: 401 without cookie, 404 envelope, sign-out), and `workers: 1` is required by the shared seeded users.

## Design Notes

**Numbering.** `epics.md` writes AR-8/AR-9 and the test-design docs write ASR-8/ASR-9 for the spine's **AD-8** (offline vehicle) and **AD-9** (session, origin, per-user store). The story attaches "AR-9" to the repository-layer rule, but that rule is textually **AD-10** (tenant scoping). Cite AD-9 for session/cookie/Dexie and AD-10 for `company_id`.

**Registro profissional is a Form dialog, not the inline fields of the mockup.** `90-account.html` renders it inline; EXPERIENCE.md's Settings row pattern and the story's own AC both say the row reads "CREA ⟨número⟩ · Eng. Eletricista" and "Editar" opens a Form dialog. AGENTS.md: EXPERIENCE.md wins over a mock on conflict. Build the row plus a `.dialog-scrim` › `.form-dialog` using the mockup's `.segmented`, `.field`, `.input` and `.helper` markup verbatim inside it.

**"Instalar na tela inicial" is stale.** It is still in `90-account.html` and in EXPERIENCE.md's IA table, and `source-deltas.md` removes it (web only, no install). Do not build it. The same row is why the banner priority list in EXPERIENCE.md is stale; use the spine's Consistency Conventions list.

**The registration save is a named server action, not an op.** AD-3 defines a `user/{id}/{field}` op family and AD-1 says the web writes only ops, but the op log is Story 1.4 and is not merged. Save through the authenticated `PUT /api/account/registration` (AD-9 explicitly allows a short list of named server actions), update the cached profile locally on success, and when offline disable the dialog's save with a `.btn-reason` — the same pattern Login already uses for "Entrar precisa de conexão". Converting this to a `user/{id}/{field}` op once Story 1.4 lands is a deferred item, not a redesign.

**Parallel stories.** 1.2 (shared components), 1.4 (op log) and 1.7 (HTTPS) are being built concurrently and must not be depended on. Build Login and Account from plain elements plus React Aria Components behavior and the mock's class names; keep each screen's markup local so 1.2's components can replace it mechanically. Declare the Dexie object stores only — no outbox semantics. Do not add a reverse proxy.

**`Secure` cookie on http.** Until Story 1.7 the stack is plain http; Chromium (the only `@p0` project) accepts `Secure` cookies on `localhost`, so keep `Secure` on as the spine requires rather than making it conditional.

**Cross-tenant coverage is bounded by the routes that exist.** `1.3-API-002` in the test design sweeps stream, file, generate and revision routes; none exist yet. Assert it over every route this story ships plus the repository layer directly, and record the sweep's extension as deferred.

## Verification

**Commands:**
- `docker compose run --rm tools pnpm install` -- lockfile regenerated inside the container; never run pnpm on the host
- `docker compose up -d` -- api becomes healthy, meaning migrations ran at boot
- `docker compose run --rm tools pnpm test:reset` guard and `docker compose run --rm tools pnpm exec tsx scripts/seed-users.ts --test` (the node image's entrypoint turns a bare `tsx` into `node tsx`) -- two companies with one user each; refuses outside compose
- `docker compose run --rm tools pnpm verify` -- lint, static, unit, api, Playwright `@p0` green in under 15 minutes

## Auto Run Result

Status: done

**Summary.** Identity for the stack: Drizzle `company`/`user` schema (with better-auth's `session`/`account`/`verification` carrying `company_id`) and a forward-only migration applied at api boot; a repository layer whose every function takes a branded `CompanyId` first; better-auth e-mail + password at `/api/auth/*` with sign-up disabled and an httpOnly `SameSite=Lax; Secure` 30-day sliding cookie; a session middleware resolving `{userId, companyId}` once per request; `GET /api/account` and `PUT /api/account/registration`; a guarded, idempotent `scripts/seed-users.ts` with `--test`. On the web: React Router (`/login`, `/`, `/account`) with both redirects, the Login surface with error and offline states, a per-user Dexie database `releng-{user_id}` (stores declared only, never deleted), a session context that boots from a local pointer plus the cookie, one banner slot carrying the re-auth banner, and the Account surface with the "Registro profissional" Form dialog and the "Sair" Confirm dialog.

**Files changed.**
- `apps/api/package.json`, `apps/web/package.json`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` -- drizzle-orm/drizzle-kit/better-auth/dexie/dexie-react-hooks/react-router/fake-indexeddb; root `db:generate` and `seed:users` scripts.
- `apps/api/drizzle.config.ts`, `apps/api/tsconfig.json` -- drizzle-kit config, typechecked.
- `apps/api/src/db/schema.ts`, `migrate.ts`, `migrations/0000_big_kulan_gath.sql` + `meta/` -- schema and the boot migrator.
- `apps/api/src/db/client.ts` -- `createSql` (raw, health probe and migrations) and `createDb` (drizzle).
- `apps/api/src/db/repositories/{company-id,companies,users,index}.ts` -- branded `CompanyId`, tenant-scoped queries.
- `apps/api/src/db/seed.ts`, `test-seed.ts`, `scripts/seed-users.ts` -- provisioning library, the two test companies, the CLI (compose guard reused from `test-reset.ts`, whose message gained a command hint).
- `apps/api/src/auth/auth.ts`, `trusted-origins.ts`, `apps/api/src/config.ts`, `.env.example`, `docker-compose.yml` -- better-auth instance, new `TRUSTED_ORIGINS`, `API_PROXY_TARGET` on `tools`.
- `apps/api/src/http/{app,session,account,health}.ts`, `main.ts` -- routes, session middleware, error/404 envelopes, migrations before `serve`.
- `packages/domain/src/registration.ts`, `contract.ts`, `index.ts` -- council/registration/profile schemas and the pure text helpers.
- `apps/web/src/{app.tsx,api/auth-client.ts,copy/pt-br.ts,db/database.ts,state/{session.tsx,banner-slot.tsx,last-session.ts},styles/{app.css,index.css},surfaces/**}` -- the web app described above.
- Tests: `apps/api/src/auth/auth.integration.test.ts` (1.3-API-001/002), `apps/api/src/db/migrations-match.test.ts`, `apps/api/src/http/health.test.ts`, `apps/api/src/config.test.ts`, `packages/domain/src/registration.test.ts`, `apps/web/src/db/database.test.ts`, `apps/web/src/state/banner-slot.test.ts`, `scripts/tooling.test.ts`, `e2e/auth.spec.ts` (1.3-E2E-001/001b/001c/002/002b/003/003b), `e2e/support/{merged-fixtures,global-setup}.ts`, `e2e/shell.spec.ts`, `playwright.config.ts`, `tsconfig.json`, `.gitignore`.

**Review findings.** 51 findings from four layers: 15 medium, 34 low, 2 false. Patched: 9 medium entries (password reset revokes sessions; sign-in transport failures no longer read as a wrong password; sign-out failure surfaces and keeps the session; registration validation before send and 400 mapping; guarded Dexie open at boot and sign-in; migrator-ran assertion; boot re-auth e2e; custom-title e2e; migrations-vs-schema drift test) and 9 low entries (copy provenance comments, English API message, `drizzle.config.ts` typechecked, seed slug-collision guard, JSON 404 envelope, schema comment scope, dead `publishOn401` removed, CLI `--test` run in a test, dialog CSS overrides moved to `app.css`). Deferred: 4 items in the frontmatter (cross-tenant sweep extension, registration save as an op after Story 1.4, pending-sync sign-out wording after Story 1.5, `revokeSessions` null-tenant latent hole). Rejected: 2 false (snapshot present; session hook null path unreachable) and the low rows marked `reject` in the triage log with their reasons (mock `.echo` preview, offline sign-out gate, `last-session` pointer, spec-edit finding, `TRUSTED_ORIGINS` validation, sliding refresh not exercised, 500/404 boot read, empty form guard, Dexie open race, blocked localStorage, `TEST_SEED.userId`, `asCompanyId` provenance, `shell.spec` semantics, `session.company_id` reader, required `TRUSTED_ORIGINS`, Playwright/test-suite shape).

**Follow-up review recommendation: true** (first pass; 9 medium entries patched, 0 high). Specific unverified risk: the new Login `network` branch and the Account `signOutFailed` branch are not exercised by any test (both need mid-test request interception), and the credential-vs-network split relies on better-auth's client error shape exposing a numeric `status`.

**Verification.** `docker compose run --rm tools pnpm install` (lockfile regenerated in the container); `docker compose up -d --wait` healthy with `migrations applied` logged before `api listening`; seed CLI refuses with `RUNNING_IN_COMPOSE` unset (exit 1, names the command) and `--test` run twice leaves 2 companies, 2 users, 2 accounts; `docker compose run --rm tools pnpm verify` exit 0 after the review patches: lint, static (4 tsc programs), unit (domain 12, web 12, root 11), api 22 (incl. 1.3-API-001/002, migrator-ran, drift), Playwright `@p0` 8/8, about 1 min 40 s wall clock.

**Residual risks.** Offline cold open is exercised by cutting `/api/*` only (the document still comes from the dev server until Story 1.8's service worker). "Network down" boot relies on the `releng.last-session` localStorage pointer; a browser that blocks localStorage lands on Login offline. `Secure` cookies work on `localhost` in Chromium only until Story 1.7's HTTPS lands. better-auth logs a base-URL warning on every boot because `baseURL` is deliberately unset for the multi-port local setup.
