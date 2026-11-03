# Security and edge-case pass, 2026-11-03

Hands-on pass against the local main stack (`fasor-api-1`, web bundle rebuilt from `cf468e3d`), driven by curl and a Playwright (Chromium 1.63) script run in the `tools` container. A read-only static audit of `apps/api` and `packages/domain` ran alongside. All writes went to the test company Empresa A (`a@teste.local`), which every e2e run resets. Empresa Local Dev was only read.

Scripts (gitignored): `test-results/adhoc-sec/` (`attack.mjs`, `online.mjs`, `inject.mjs`, `render.mjs`, `lib.mjs`, `proxy.mjs`). Each needs the localhost proxy in `proxy.mjs`: the session cookie is `Secure`, so Chromium only keeps it on `localhost`.

## Findings

Severity is how bad the outcome is. Every finding below was reproduced on the running stack, except those marked "static".

### S1 High: the server accepts any relatório status from the client

- **What happened:**
  - One op set Empresa A's relatório from `rascunho` straight to `emitido`. It had no revision, no parecer, and nothing passed the generate barrier. Home then counted it under "Emitido".
  - A `relatorio/{id}` create with `status: "emitido"` in its row was applied the same way.
  - The server does check the pre-issue rows, but only on `POST /api/relatorios/:id/generate`, which answered `409 pre_issue_blocked`. The status op never goes through that route.
- **Where:**
  - `packages/domain/src/ops/path.ts`: `relatorio/status` is not `serverOnly`.
  - `packages/domain/src/ops/apply.ts`: the status write checks only the enum.
  - The status moves exist only in the web (`status-advance.ts`).
- **Also applied:**
  - Edits to a relatório after it reached `emitido`.
  - `relatorio/removed_at` (tombstoning a whole relatório).
  - `relatorio/setup/responsible_user_id` set to an id that is no user.
- **There are no roles.** Every member of a company can do all of the above.

### S2 High: a signed-out device still shows, and still writes, the previous user's data

- **Reading:**
  - Sign-out keeps the `releng-{user_id}` IndexedDB (AD-9, by design).
  - After an explicit "Sair", put the old profile JSON back into `localStorage['releng.last-session']`. The user id is in the database name, and the profile shape is public. Then reload.
  - The app boots into that user's Home, cadastros and relatórios without a password. This works online too: it shows only the "Sua sessão expirou" banner.
- **Writing:**
  - In that state, a new client, project and relatório were created on the device.
  - When the real user signed in again on that device, the outbox pushed those ops to the server with `actor_id` = the victim (`inject.mjs`).
- **The risk:** a shared or lost field tablet.

### S3 Medium: attribution in values is client-chosen

- `block/{id}/concluded_by` was applied with `{actor_id: <someone else>, at: "2020-01-01"}`. This is the sheet's "concluded by" line in section 9.
- `client_ts` of 2099 was applied.
- Static: `not_tested.by` and `meta.restore.removed_by` behave the same way.

### S4 Medium: value size and type are not bounded per field

- A 5 MB string in `relatorio/setup/additional_info` was applied.
- After that, the preview job ran LibreOffice for about 2 minutes and failed `libreoffice_timeout`. One push makes a relatório impossible to generate and burns CPU on the single production instance.
- Also applied:
  - `sheet/{id}/observations` as an object.
  - `site_altitude_m = -99999`.
- Static: no string in the row schemas has a `.max`, and the JSON body cap is 16 MB.

### S5 Medium: puts are not checked against the row they target

- A put whose `relatorio_id` is a relatório the company does not have was applied. It is stored as an orphan op in that company's log. It does not leak across tenants.
- A put on a block id that does not exist was applied.
- A put on relatório R1's block filed under R2's `relatorio_id` was applied. R1's devices never pull it, and the "edited since" check of generate misses it (static: `http/generate.ts`).

### S6 Medium (static): paid AI work and image decoding have no quota

- Readings: a photo create may carry `reading_status: "queued"`. The reread route can be repeated on photos that are already `done`.
- Audits: the only check is that no audit is already running.
- None of these routes has a quota per company or a rate limit. One user can spend the USD 100 ceiling.
- Image decoding: `sharp()` has no `limitInputPixels`, and it decodes inside the upload request (`storage/variants.ts`).

### S7 Low: better-auth endpoints beyond sign-in, sign-out and get-session are mounted

- `POST /api/auth/update-user {"name": ...}` renamed the signed-in user. The name is meant to be identity-owned, and the relatório prints it.
- `revoke-other-sessions` and `list-sessions` answer. `list-sessions` returns every session's raw token. The tokens are unusable without the cookie signature, which was checked.
- Already refused: `companyId`, e-mail change, password reset and user deletion.

### S8 Low

- **CSRF:** `POST /api/sync/ops` with `content-type: text/plain` and no `Origin` was accepted. `SameSite=Lax` covers other sites, but not sibling subdomains of the same site.
- **Telemetry:** its limiter is keyed by the client's `device_id` (static).
- **Removed files:** they are still served (static).
- **HSTS:** the Caddy `{$APP_DOMAIN}` block sets no `Strict-Transport-Security`, while the IP and CloudFront blocks do (`infra/caddy/Caddyfile`).
- **Login copy:** an unknown e-mail shows "Senha incorreta". The server answers generically (`INVALID_EMAIL_OR_PASSWORD`), so there is no enumeration. The copy is only misleading.
- **Per-account lockout:** any client can keep a known e-mail locked out of sign-in in production with 10 attempts every 5 minutes. A device with a 30-day session is not affected.

## Checked and holding

- **Unauthenticated access:**
  - Every `/api` data route answers 401.
  - Every deep link lands on `/login`, and no data API answers 200.
  - Sign-up, password reset and e-mail change are disabled.
- **Session cookie:**
  - It is `HttpOnly; Secure; SameSite=Lax` and signed.
  - Unsigned or tampered values, a bearer header and a `?token=` query are all refused.
  - Sign-out revokes the session on the server.
  - A foreign `Origin` on sign-in gets `403`.
- **Login form:**
  - Wrong, empty, malformed, 25 KB and SQL-shaped inputs all stay on `/login` with no query string.
  - The password field is `type=password`.
  - Wrong-password and unknown-user timing is the same (about 0.12 to 0.15 s).
- **URLs:** 312 URLs from a full session carry only uuids and the query keys `since` and `etapa`. None carries an e-mail, name, password or token.
- **Storage:** no token is in `localStorage` or `sessionStorage`, and `document.cookie` is empty.
- **Tenant isolation:**
  - Another company's relatório, project, files, preview, revision PDF and DOCX all answer 404, and the UI shows "Relatório não encontrado".
  - Cross-company `company_id`, a forged `actor_id`, `device_id: server`, `system:` actors, server-only families (`variants`, `revision`), another user's `user/field` and path traversal are all refused.
- **Stored XSS:** client and site names holding `<img onerror>` and `<svg onload>` render as text.
- **Files and static serving:**
  - S3 keys are derived from the session.
  - The original is served as `attachment` with `nosniff`, including SVG.
  - Static path traversal falls back to `index.html`.
- **Production network:** only ports 80 and 443 are open, and the api port 3000 is not exposed.

## Test data left behind (Empresa A)

- Two relatórios: one forced to `emitido`, one born `emitido`.
- One tombstoned relatório.
- An `INJECTED-*` client and project.
- One orphan op.

The user name was restored. The next e2e global setup wipes all of it.
