# Full review 2026-09-30, front 3: security

Branch `fix/security-review-2026-09-30`, based on main `6b21909`. There were two parts: an evaluation, and mitigations committed on the branch. The branch has not been pushed, has no PR and is not merged.

Sources of evidence:

- The live shared stack, probed read-only with curl (api `http://localhost:3000`).
- An isolated compose project for this branch: `fasor-sec`, port base 62, api `http://127.0.0.1:62030`. It has its own Postgres, MinIO and two seeded companies:
  - Sec Review A (`sec-a@review.test`, company `01a0f3a3-1e2c-…`)
  - Sec Review B (`sec-b@review.test`, company `01a0f3a3-54b0-…`)
- Seeding the two companies on the shared stack was refused by the session's permission check. Every cross-tenant probe therefore ran against the isolated stack. On the probed paths, its code is main's code.

## Summary

| Severity | Found | Mitigated on the branch | Left as recommendation |
|---|---|---|---|
| High | 2 | 2 | 0 |
| Medium | 7 | 6 (M5 and M7 only partly) | 1 (M3), plus the rest of M5 and M7 |
| Low | 12 | 3 | 9 |
| **Total** | **21** | **11** | **10** |

Commits on the branch:

| Commit | Content |
|---|---|
| `7955f5d` | api: security headers, HTML CSP, body limits, rate limits, production secret check, Vite on loopback |
| `94046db` | sharp 0.34.5 to 0.35.5 (two high advisories) |
| `e9c92f3` | seed-users reads the password from `SEED_USER_PASSWORD` (E11-A4) |
| `46f73ec` | OCR sidecar: decode cap, admission slots, inference timeout, pinned weights |
| `4d098bb` | infra: TLS-only bucket policies, HSTS on the production Caddy |

### What held up under test (no finding)

- **Tenant isolation.** Every route scopes by the session's company, so another company's id answers exactly as an unknown one. Evidence is the probe below.
- **Ops that name another tenant.** A pushed op stamped with another company is rejected per op with `op_tenant_mismatch`. Server-only families, and a spoofed `actor_id` or `device_id`, are refused (`apps/api/src/sync/apply.ts` `validate`).
- **Object keys.** They are derived from the session's company and the row's own id, never read from client JSON (`files.ts`, `generate.ts`).
- **Path traversal.** None is possible: ids are uuidv7-validated before any key is built.
- **Sign-up and origin check.** Sign-up is disabled (`EMAIL_PASSWORD_SIGN_UP_DISABLED`). better-auth's origin check refuses a foreign `Origin` with 403 `INVALID_ORIGIN`.
- **Session cookie.** It is `HttpOnly; Secure; SameSite=Lax`, with a 30-day `Max-Age`.
- **CORS.** There is none: an `OPTIONS` from `https://evil.example` gets no `access-control-*` header.
- **User enumeration.** Response time does not reveal whether an account exists: unknown user 0.085 s, known user with a wrong password 0.092 s.
- **Uploaded originals.** They are served as `content-disposition: attachment` with `nosniff`, so an SVG logo carrying `<script>` never renders inline. The thumb and print variants are rasterized PNG or JPEG.
- **EXIF.** Location and other EXIF never reach a document: the device re-encodes photos through a canvas (`apps/web/src/files/photo-encode.ts:34,43`), variants are written without EXIF (`storage/variants.ts`), and the generator embeds only the `print` variant (`jobs/generate/job.ts:184`).
- **DOCX injection.** None: text goes through the `docx` library's escaping.
- **LibreOffice.** Each conversion gets its own temporary directory and profile, a process-group kill on timeout, and cleanup in every case (`jobs/generate/libreoffice.ts`).
- **SSRF and command injection.** No SSRF in the provider adapters: the URL is config plus a constant route. No command injection in `scripts/` or `infra/bin/`: argv arrays, no shell.
- **Logs.** No bodies, cookies, e-mails or passwords are logged.
- **Production OCR sidecar.** It listens on 127.0.0.1 (`infra/production/ecs.tf:94`).
- **Network and storage.** RDS is private and encrypted. The security group opens only 80 and 443. The S3 buckets are private, encrypted and versioned.

### Cross-tenant probe

The probe script is `sec-probe.sh`, run against the isolated stack. B creates a logo file row whose SVG contains `<script>alert(document.cookie)</script>` and uploads its bytes; A then attacks B's ids.

| Step | Request | Answer |
|---|---|---|
| 1 | B pushes the file row | `{"applied":[{"op_id":"01a0f3a3-fc8e-…","seq":5}],"rejected":[],…}` |
| 2 | B `PUT /api/files/{id}` | `{"uploaded_at":"2026-09-30T18:47:38.153Z","variants":{…}}` |
| 3 | B `GET /api/files/{id}/original` | `200`, `content-disposition: attachment`, `content-type: image/svg+xml`, `x-content-type-options: nosniff` |
| 4 | A `GET` B's original, then B's thumb | `{"code":"not_found","message":"No such file."} [404]`, twice |
| 5 | A `PUT` over B's file id | `{"code":"file_row_missing",…} [409]`: the same answer as a row not yet applied, so indistinguishable |
| 6 | A pushes an op with `company_id` = B | `{"rejected":[{…,"code":"op_tenant_mismatch"}]} [200]` |
| 7 | A replays B's `op_id` under A's own company | `{"rejected":[{…,"code":"op_invalid"}]} [200]` (see L5) |
| 8 | A pulls A's company stream | occurrences of B's file id: `0` |
| 9 | A on B's id: relatorio pull, revision docx, generate, reread | `404` on all four |
| 10 | No cookie on `/api/account`, `/api/sync/company`, `/api/files/{id}/original`, `POST /api/sync/ops` | `{"code":"unauthenticated",…} [401]` on all four |

## Findings

Severity reasoning is CVSS-like: attack vector and privileges needed (AV/PR), then impact on confidentiality, integrity and availability (C/I/A).

### H1. Unbounded request bodies, including before authentication (High, mitigated in `7955f5d`)

**Where.**
- `apps/api/src/http/app.ts:138` on main hands `/api/auth/*` straight to better-auth, which parses whatever it receives.
- `apps/api/src/sync/routes.ts:134`, `http/generate.ts` and `http/reading.ts` call `c.req.json()` with no cap.
- Nothing in the api or either Caddyfile limits body size.

**Evidence.** A 20 MB sign-in body sent to the live stack, with no session:

```
curl -s -o /dev/null -w "%{http_code} in %{time_total}s\n" -H 'content-type: application/json' \
  -H 'origin: http://localhost:5173' --data-binary @big-signin.json http://localhost:3000/api/auth/sign-in/email
401 in 0.612969s
```

The whole 20 MB was read and parsed before the password check.

**Impact.**
- AV:N/PR:N/A:H. One anonymous client with a few concurrent multi-hundred-MB bodies can exhaust the api's memory.
- The production instance has 4 GiB, shared by the api, LibreOffice and OCR.
- The op schema has no size bound on `value` (`jsonValueSchema`) or on `device_id` (`ids.ts:24`, stored in `sync_state`). So an authenticated push can also write arbitrarily large jsonb, which exhausts storage.

**Fix (`7955f5d`).**
- Hono `bodyLimit` on `/api/*`:
  - `API_BODY_LIMIT_BYTES` for the JSON routes (default 16 MiB, far above a 500-op push);
  - 64 KiB on `/api/auth/*`;
  - `PUT /api/files/:id` keeps its own streamed 25 MB cap.
- The answer is `413 {code: 'body_too_large'}`. The error code is new in `packages/domain/src/contract/errors.ts`.
- Branch evidence:
  - Same 20 MB sign-in body: `{"code":"body_too_large","message":"The request body is over the 65536 byte limit."} 413 in 0.005701s`.
  - A 20 MB push with B's cookie: `{"code":"body_too_large","message":"The request body is over the 16777216 byte limit."} 413`.
- Tests: `apps/api/src/http/security.test.ts` "body limits": declared length, streamed body with no content-length, under-limit pass-through, file upload exempt, 64 KiB auth cap.

### H2. sharp 0.34.5 carries two high advisories reachable from any upload (High, mitigated in `94046db`)

**Where.** `apps/api/package.json:25` (`"sharp": "^0.34.5"`).

**Evidence.** `docker compose --profile tools run --rm --no-deps tools pnpm audit --prod` on main:

```
high | sharp | <0.35.0 | GHSA-f88m-g3jw-g9cj | sharp inherited vulnerabilities in libvips: CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591
high | sharp | <0.35.4 | GHSA-rgj7-g3m4-5g8c | sharp: Vulnerabilities in libheif: GHSA-g89c-p67h-r497 and GHSA-2jg2-4ch7-h545
```

**Impact.**
- AV:N/PR:L. Any signed-in user can upload a file whose row says `image/jpeg` or `image/png`.
- `renderVariants` (`storage/variants.ts`) hands the bytes to sharp, which detects the format from content, not from the declared mime. So libheif and the affected libvips loaders are reachable with crafted bytes.
- The upload runs in the api process, so at minimum the api crashes (A:H). The worst case is decoder memory corruption.

**Fix (`94046db`).**
- sharp `^0.35.5`. The lockfile diff touches only the `sharp` and `@img/sharp-*` entries, and the supply-chain policy check passed.
- Re-ran the sharp-dependent suites on the isolated stack, all green: `storage/*`, `jobs/reading/image.test.ts`, the reading providers, `files*.integration`, `generate*.integration`, `jobs/generate/job.integration`, docx section tests.
- Recommendation beyond this fix: restrict sharp to the declared format (`sharp(buf, { ... })` with a format check on `metadata().format` against `row.mime`), so an unexpected decoder is never reached. Not done here because it changes the variants behavior for mislabeled files.

### M1. Sign-in brute force: no per-account limit, and no limit at all outside production (Medium, mitigated in `7955f5d`)

**Where.**
- `apps/api/src/auth/auth.ts:44-50` has no `rateLimit` configuration.
- better-auth 1.7.5 enables its own limiter only when `NODE_ENV=production` (`node_modules/better-auth/dist/context/create-context.mjs:172`, `enabled: options.rateLimit?.enabled ?? isProduction`). That limiter is keyed on the client IP only.

**Evidence.** On the live dev stack, 12 wrong sign-ins in a row:

```
401 401 401 401 401 401 401 401 401 401 401 401
```

**Impact.**
- AV:N/PR:N/C:H, but high attack complexity. In production, better-auth's default IP rule slows one address.
- Nothing limits guesses at one e-mail spread across many addresses.
- Nothing limits pushes.

**Fix (`7955f5d`).** `apps/api/src/http/rate-limit.ts`:

- **Algorithm.** Fixed-window, in-memory counters. This is enough for the single api task.
- **Sign-in.**
  - Counted per client address and per lower-cased e-mail: `SIGN_IN_RATE_LIMIT_MAX` = 10 attempts per `SIGN_IN_RATE_LIMIT_WINDOW_SECONDS` = 300 s.
  - The client address is the last `X-Forwarded-For` entry behind Caddy (`TRUST_PROXY=1`, the default), else the socket address.
- **Pushes.** Counted per user: `PUSH_RATE_LIMIT_MAX` = 120 per `PUSH_RATE_LIMIT_WINDOW_SECONDS` = 60 s.
- **Answer.** `429 {code: 'rate_limited'}` with `retry-after`.
- **When it runs.** `RATE_LIMIT` unset means on in production and off elsewhere. The gates sign in and push far faster than a person. The isolated integration run with `RATE_LIMIT=on` failed exactly on the sign-in-heavy tests, which confirms the default must stay off for them. `RATE_LIMIT=on|off` overrides the default.
- **Branch evidence** (isolated api started with `RATE_LIMIT=on`):

```
12 wrong sign-ins for sec-a:  401 401 401 401 401 401 401 401 401 401 429 429
HTTP/1.1 429 Too Many Requests / retry-after: 299 / {"code":"rate_limited","message":"Too many requests; try again later."}
125 empty pushes by B:  120 x 200, 5 x 429
```

- **Tests.** `security.test.ts` "rate limits": per address, per e-mail across addresses (case-insensitive), get-session never limited, limits off by default, per-user push, window reset, `X-Forwarded-For` trust. `config.test.ts` covers the defaults, the overrides and the production default.
- **Residual.** A person who is locked out sees the web's "wrong e-mail or password" message, because `apps/web/src/api/auth-client.ts:100` treats every 4xx as a credential rejection. See L10.

### M2. No security headers, no CSP and no HSTS anywhere (Medium, mitigated in `7955f5d` and `4d098bb`)

**Where.** On main, `apps/api/src/http/app.ts` sets no headers except `nosniff` on file routes. `docker/caddy/Caddyfile` and `infra/caddy/Caddyfile` have no `header` block.

**Evidence.** On the live stack, `curl -s -D - -o /dev/null http://localhost:3000/api/health` returns only `HTTP/1.1 200 OK`, with none of X-Frame-Options, CSP, Referrer-Policy, Permissions-Policy or HSTS.

**Impact.** Clickjacking of the signed-in app. No script-execution backstop if an XSS ever lands: the shell is served from the same origin as `/api`, with a 30-day session. API answers (photos, documents) can sit in the HTTP cache of a shared tablet.

**Fix.** `apps/api/src/http/security-headers.ts`:

- **On every answer, better-auth's included:** `x-content-type-options: nosniff`, `referrer-policy: no-referrer`, `x-frame-options: DENY`, `permissions-policy` (camera, microphone and geolocation for self only), `cross-origin-resource-policy: same-origin`.
- **On `/api/*`:** `cache-control: no-store`, unless a route sets its own.
- **On the HTML shell, a CSP:** `default-src 'self'`, `script-src 'self'` plus the sha256 of the exact inline theme script of `index.html` (computed at serve time), `style-src 'self' 'unsafe-inline'` (boot splash `<style>`, React Aria inline positioning), `img-src`/`media-src` with `blob:` and `data:`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`.
- **HSTS** (`max-age=31536000`) and `-Server` are set in the production Caddyfile only (`4d098bb`). Sent from the api, HSTS would pin `localhost` to HTTPS in a developer's browser. Validated with `caddy validate`.
- **Browser check.** Headless Chromium in the isolated tools container loaded the built bundle with the CSP. It signed in as `sec-b`, rendered Home ("Relatórios por status … Templates 1 template"), `/cadastros`, `/conta` and `/modelos`, and the inline theme script ran (`data-theme=dark`). The only CSP report was zod's feature probe `Function('')` at `index-*.js:9:52956`, which zod catches, falling back to its non-JIT path. See L11.
- **Tests.** `security.test.ts` "security headers": base headers on `/api`, 404 and auth answers; a route's own header kept; CSP hash equals the inline script's; no CSP on assets.

### M3. A signed-out shared tablet keeps every relatório, photo and pending op (Medium, recommendation)

**Where.**
- `apps/web/src/state/session.tsx:283`: "The handle is closed, the database is kept: `Dexie.delete` is never called".
- `apps/web/src/db/schema.ts:5`: "one Dexie database per user, `releng-{user_id}`, never dropped on sign-out".
- The pt-BR copy tells the user so: `apps/web/src/copy/pt-br.ts:64`.

**Impact.**
- Anyone with the unlocked tablet can open DevTools on the origin after sign-out and read the previous user's IndexedDB: entities, photos and file blobs, and the outbox. None of it is encrypted.
- A different user signing in does not see it in the UI, because each user has their own database.
- The service worker caches only the app shell, never `/api` (`apps/web/public/sw.js:108,451,463`).

**Options** (a product decision, AD-9):

- (a) Keep the current behavior, and document that a tablet is single-user or relies on its OS lock.
- (b) Add a "Remover dados deste aparelho" action on sign-out, enabled once the outbox is empty.
- (c) Always call `Dexie.delete(releng-{user_id})` after a successful sign-out with an empty outbox. Refuse sign-out, or keep the data, while ops are pending.
- (d) Also expire the local database after N days without a session.

Recommendation: (b) now, (c) if tablets are shared between engineers.

### M4. The public development `SESSION_SECRET` is accepted in production (Medium, mitigated in `7955f5d`)

**Where.** `apps/api/src/config.ts:24` on main checks only `min(32)`. The default `change-me-change-me-change-me-32ch` is committed in the public repository (`docker-compose.yml:22`, `.env.example`).

**Impact.** A deployment that forgets its secret would accept forged session cookies from anyone who reads this repository: AV:N/PR:N/C:H/I:H. Production is not exposed today, because it uses a 64-character random value from SSM (`infra/production/ssm.tf`). The risk is misconfiguration.

**Fix.**
- `config.ts` refuses any value in `KNOWN_DEV_SESSION_SECRETS` when `NODE_ENV=production`, and names the variable.
- The local `prod` compose profile (`api-prod`, `NODE_ENV=production`) therefore now needs a `SESSION_SECRET` in `.env`, as the README "Running the prod profile" section now says.
- Test: `config.test.ts`.

### M5. The production admin password was exposed through command-line and ECS overrides (Medium, partly mitigated in `e9c92f3`, rest recommended)

**Where.**
- `scripts/seed-users.ts:177` on main takes the password only as `--password`.
- The production image has no `scripts/` (`apps/api/Dockerfile.prod.dockerignore`), so the production seed ran as an ECS one-shot task with an environment override. That stores the value in the task description, readable by anyone with `ecs:DescribeTasks`.
- Sources: `epic-11-retro-2026-09-30.md` R11-13, `sprint-status.yaml` E11-A4.
- Nothing in `infra/` holds the password: it is not a Terraform variable, not an SSM parameter and not in `infra/bin/*`.

**Impact.** C:H on the admin account for anyone with ECS read access, or with access to the chat logs where it surfaced.

**Fix on the branch.** `seed-users` reads `SEED_USER_PASSWORD` when `--password` is left out. Giving both is a usage error, and neither the value nor the error text ever echoes the password. Test: `scripts/tooling.test.ts` "reads the password from --password or SEED_USER_PASSWORD".

**Recommended SSM-based seed** (not done: it changes the production image and needs an apply):

1. Rotate the exposed password first (E11-A4).
2. Create the new one only in SSM, from a shell that does not echo it:

   ```
   infra/bin/aws ssm put-parameter --name /fasor/production/seed-password --type SecureString --value file:///dev/stdin
   ```

3. Ship `scripts/seed-users.ts` in the production image. It needs `scripts/` plus the `packages/domain` fixtures it imports; alternatively, add a dedicated `apps/api/src/db/seed-cli.ts` entry point.
4. Add a Terraform `aws_ecs_task_definition "seed"`. It should reuse `local.api_environment`, `api_secrets`, and `{ name = "SEED_USER_PASSWORD", valueFrom = <that parameter ARN> }` in `secrets`. The execution role already reads `/fasor/production/*`.
5. Run it with `--overrides` that carry only non-secret flags (`--company`, `--email`, `--name`, …).

The password then never appears in a task description, the shell history or the chat. Delete or overwrite the parameter after the seed.

### M6. PP-OCRv5 detection weights downloaded with no pin (Medium, mitigated in `46f73ec`)

**Where.** `services/ocr/Dockerfile:36-39` on main downloads from Hugging Face through `TextDetection(...)`, with no revision and no checksum. PARSeq, by contrast, is pinned with `ADD --checksum` (`:15-18`).

**Impact.** Supply chain. A changed or poisoned upstream model enters the next image build unreviewed, and a model file is parsed by the Paddle runtime in the sidecar.

**Fix.**
- The build now checks the four kept files (`inference.json`, `inference.pdiparams`, `inference.yml`, `config.json`) with `sha256sum -c`. The sums were taken from the current `app-ocr` image, built 2026-09-28, whose tests pass.
- A changed upstream fails the build.
- The image was not rebuilt here: the build is heavy and downloads models. The first `docker compose --profile ocr build ocr` verifies it.
- Still recommended: pin the base images and `uv` by digest (`Dockerfile:7,10,29`). See L9.

### M7. An authenticated push has no volume control (Medium, partly mitigated in `7955f5d`)

**Where.**
- `sync/routes.ts` accepts up to 500 ops per push with no rate and, on main, no size cap.
- `value`, `path` segments and `device_id` have no length bounds (`packages/domain/src/ops/op.ts`, `ids.ts:24`).
- Every push inserts into `ops` and upserts `entities`, which are append-only and never deleted.

**Impact.** A:M/PR:L. A signed-in user, or a stolen session, can grow the database without bound. That costs money under the USD 100 ceiling and degrades every tenant.

**Fix.** The 16 MiB body cap and the per-user push limit bound the rate (H1, M1).

**Recommended.**
- Cap `deviceIdSchema` (for example `max(128)`) and the size of a single op's `value` in the kernel. This changes the contract, so it needs a contract version.
- Add a per-company storage quota alarm (op count and bytes).

### L1. Vite dev server published on every interface (Low, mitigated in `7955f5d`)

**Where.** `docker-compose.yml:118` on main (`'5173:5173'`), with `apps/web/vite.config.ts:104,112` `host: true`.

**Impact.** Anyone on the office LAN reaches the dev server, and through its proxy the api. This combines with the esbuild dev-server advisory (L8).

**Fix.**
- The compose port is `127.0.0.1:5173:5173`.
- `host: true` stays: it is needed inside the container for the published port to work at all.
- Tablets use Caddy (HTTPS, `docs/tablet-https-setup.md`), which proxies `api:3000`, never the dev server.
- `preview.host` (5200) is only used inside the tools container and is not published.

### L2. Every host-network container can reach the instance metadata service (Low, recommendation)

**Where.** `infra/production/compute.tf:68` (`http_put_response_hop_limit = 1`) combined with `network_mode = "host"` for all three tasks (`ecs.tf:58,85,113`).

**Impact.** A hop limit of 1 does not isolate containers in host mode. A code-execution bug in the OCR sidecar or Caddy yields the instance role, which carries `AmazonEC2ContainerServiceforEC2Role` and `AmazonSSMManagedInstanceCore`. The files bucket and SSM secrets are on the task roles, not the instance role, which keeps the blast radius moderate.

**Options.**
- Move the OCR and Caddy tasks to `bridge` or `awsvpc` networking with an IMDS block. This costs memory and needs port changes.
- Or accept, and document, the moderate blast radius.

### L3. S3 buckets accept plain-HTTP requests (Low, mitigated in `4d098bb`)

**Where.** `infra/production/storage.tf` and `infra/bootstrap/state.tf` on main have no bucket policy. The state bucket holds the generated database password and `SESSION_SECRET`.

**Fix.** A `DenyInsecureTransport` bucket policy on both buckets. `infra/bin/check` passes (fmt, validate and tflint on both stacks, ShellCheck).

**Needs.** `infra/bin/tf bootstrap apply` and a production apply by Matheus. This is AWS work, not done here.

### L4. OCR sidecar availability (Low, mitigated in `46f73ec`)

**Where** (`services/ocr` on main):
- `app/main.py:43,87,105`: one global `threading.Lock`, no timeout, no admission cap. Up to 40 threadpool requests can each read a 20 MiB body (`read_max_bytes`) and decode it before waiting on the lock.
- The api aborts at 60 s and retries (`apps/api/src/jobs/reading/providers/ocr-svc.ts:14,32`), while the sidecar thread keeps the lock.
- The pixel cap exists only as the Dockerfile `ENV OPENCV_IO_MAX_IMAGE_PIXELS` (`Dockerfile:76`). A run outside that image decodes a small PNG that declares 30000 x 30000 pixels into about 2.7 GB (`app/pipeline.py:62-63`).
- Compose sets no memory limit for the sidecar.

**Severity.** Low. The sidecar is not reachable from outside: it is loopback-only in production, and compose publishes it on `127.0.0.1` only. The api sends it only its own re-encoded print variant, at most 2000 px.

**Fix.**
- `app/__init__.py` sets `OPENCV_IO_MAX_IMAGE_PIXELS` before any `cv2` import, and `decode()` refuses anything over `MAX_IMAGE_PIXELS`.
- A bounded semaphore (`OCR_MAX_IN_FLIGHT`, default 2) is taken before the body is read. It is released only when the inference thread ends, even if the request was cancelled. A request that finds no free slot gets 503 `{error: internal}` with `retry-after`.
- An inference past `OCR_INFERENCE_TIMEOUT_SECONDS` (default 55, below the api's 60) answers 504. Its slot stays taken until the thread ends.
- 503 and 504 stay inside the contract's error enum, and the api's provider already retries non-200 answers as `ProviderError`.
- Tests: `services/ocr/tests/test_admission.py` covers the cap env, decode refusal, 503 with no slot, slot returned on 422, and 504 with the slot freed after the thread ends. It ran together with `test_api.py` in the existing `app-ocr` image, with the branch files mounted: 18 passed, in 214 s.

### L5. `op_id` is globally unique: a cross-tenant existence oracle and squatting (Low, recommendation)

**Where.** `apps/api/src/sync/apply.ts`, `insertOp` / `ForeignOpIdError`.

**Evidence.** Probe step 7: A's push that reuses B's `op_id` answers `op_invalid`, where a fresh id would apply. So the answer reveals that the id exists in another company. A company that learns another's future `op_id` could also make that op fail.

**Impact.** Negligible in practice: uuidv7 ids carry 74 random bits and are never shown across tenants.

**Option.** Make the ops primary key `(company_id, op_id)`. This needs a migration and a check of the dedupe semantics.

### L6. Certificate opened in a new tab without `noopener` (Low, recommendation)

**Where.** `apps/web/src/surfaces/registries/instrument-panel.tsx:152,160` (`window.open('', '_blank')` and then `window.open(url, '_blank')`).

**Impact.** The URL is a same-origin blob, so the risk is small. The export preview already does it right (`surfaces/export/use-preview.ts:36-41,104`).

**Fix.** Set `opened.opener = null`, or pass `'noopener'`.

### L7. LLM prose output has no length bound (Low now, Medium once Bedrock ships)

**Where.** `packages/domain/src/contract/prose.ts:14` (`{text: z.string()}`), and `reading/prose.ts:23` trims only.

**Impact.** When Story 11.6 turns a real model on, prompt-injected photo text can yield an arbitrarily long suggestion. It is still a pending suggestion a person must accept, and it is rendered as text, never HTML.

**Fix.** Add a `max()` to the schema before Story 11.6.

### L8. esbuild <=0.24.2 dev-server advisory (Low, known)

**Where.** Moderate GHSA-67mh-4wv8-2f99, through `better-auth > drizzle-kit > @esbuild-kit/* > esbuild`.

**Impact.** Dev-only: `drizzle-kit` never runs in production. It is already tracked in `deferred-work.md` (the `pnpm audit --prod` entry).

**Fix.** A pnpm `overrides` of the transitive esbuild, or a drizzle-kit that drops `@esbuild-kit`.

### L9. Mutable image tags and unpinned base images (Low, recommendation)

**Where.**
- `infra/production/storage.tf:103` has `image_tag_mutability = "MUTABLE"`. The deploy re-pushes a SHA tag when it redeploys HEAD, so moving to `IMMUTABLE` needs a skip-if-present step in `infra/bin/deploy`.
- The base images of `apps/api/Dockerfile*`, `services/ocr/Dockerfile` and `infra/caddy/Dockerfile` are pinned by tag, not digest.

**Fix.** Pin by digest, and make the ECR tags immutable once the deploy skips existing tags.

### L10. A rate-limited sign-in reads as "wrong e-mail or password" (Low, product copy)

**Where.** `apps/web/src/api/auth-client.ts:100` treats every 4xx as a credential rejection.

**Option.** Map 429 to its own pt-BR sentence, for example "Muitas tentativas. Tente novamente em alguns minutos.". The sentence needs an owner in `apps/web/src/copy/pt-br.ts`, and a decision from Matheus on the wording.

### L11. zod's eval probe triggers a CSP report (Low, informational)

**Where.** zod v4 tests `Function('')` once to decide on JIT, and catches the failure. Under the new CSP this produces a `securitypolicyviolation` event at `index-*.js:9:52956` with no functional effect.

**Option.** Set `z.config({ jitless: true })` once in the web entry point to silence it.

### L12. Behind the CloudFront fallback, every user shares CloudFront's address (Low, recommendation)

**Where.** `infra/caddy/Caddyfile`, the fallback site, when `enable_cloudfront_fallback` is on. Caddy does not trust CloudFront, so the last `X-Forwarded-For` entry is the edge's address.

**Impact.** The per-address sign-in limit is shared by all CloudFront users. The per-e-mail limit still holds.

**Fix.** Configure Caddy `trusted_proxies` with the CloudFront origin-facing ranges on that site, only if the fallback is ever enabled.

## Dependency audit

Each command below was run from the worktree, in the isolated `tools` container.

- `pnpm audit --prod` on main: 3 findings.
  - high: sharp `<0.35.0`, GHSA-f88m-g3jw-g9cj
  - high: sharp `<0.35.4`, GHSA-rgj7-g3m4-5g8c
  - moderate: esbuild `<=0.24.2`, GHSA-67mh-4wv8-2f99, dev-only path
- `pnpm audit` (all dependencies) on main: the same 3.
- After `94046db`, `pnpm audit --prod` and `pnpm audit` leave only the moderate esbuild advisory (L8).
- The Python sidecar, from `services/ocr/uv.lock`:
  - Locked versions: fastapi 0.141.1, starlette 1.7.0, pillow 12.3.0, uvicorn 0.54.0, h11 0.16.0, anyio 4.15.1, numpy 2.3.5, opencv-contrib-python 4.10.0.84, onnxruntime 1.30.0, pydantic 2.13.5, paddleocr 3.7.0, paddlex 3.7.2, paddlepaddle 3.3.1, requests 2.34.2, urllib3 2.8.0. python-multipart is absent, since the sidecar reads a raw body.
  - starlette, pillow, h11 and urllib3 are past their known advisory thresholds.
  - opencv-contrib-python 4.10.0.84 is the oldest pin and bundles libwebp, libpng and libtiff decoders. `pip-audit` was not run: it needs network inside a throwaway container. Recommended as a follow-up: `docker compose --profile ocr run --rm ocr python -m pip install pip-audit && pip-audit`, or bump opencv to the latest 4.x wheel.

## Audit cross-check

Source: `reviews/audit-2026-09-30-stories-vs-code.md`, rows E11-A5 / A12 and E11-A4.

| Item | Verdict | Evidence | Disposition |
|---|---|---|---|
| Rate limit on `/api/auth/*` | Confirmed, with one correction | No limiter in the api (`auth.ts:44-50`), and 12 wrong sign-ins all 401 on the live stack. Correction: better-auth's own IP limiter is on in production (`create-context.mjs:172`), so production was not entirely unlimited; it had no per-account limit. | Mitigated `7955f5d` (M1) |
| Rate limit on the push route | Confirmed | `sync/routes.ts` has no limiter | Mitigated `7955f5d` (M1, M7) |
| Caddy security headers | Confirmed | Neither Caddyfile has a `header` block, and the live `/api/health` has no security header | Mitigated: headers in the api for every edge (`7955f5d`), HSTS and `-Server` in the production Caddy (`4d098bb`) (M2) |
| Push body limit | Confirmed, and wider than stated | No `bodyLimit` anywhere. The unauthenticated `/api/auth/*` also parsed a 20 MB body (`401 in 0.61s`). | Mitigated `7955f5d` (H1) |
| Refuse the default `SESSION_SECRET` outside dev | Confirmed | `config.ts:24` only checks `min(32)`. Production's SSM secret is random, so this is a misconfiguration risk, not a live exposure. | Mitigated `7955f5d` (M4) |
| Vite on 127.0.0.1 instead of `host: true` | Confirmed, with a different fix | `host: true` is required inside the container for the published port to work, and the exposure came from compose `'5173:5173'`. Tablets go through Caddy (`docs/tablet-https-setup.md`). | Mitigated at compose level (`127.0.0.1:5173:5173`), `7955f5d` (L1) |
| E11-A4, password exposure | Confirmed | Exposure path: `seed-users --password` (`scripts/seed-users.ts:177`), the production image has no `scripts/`, and the seed ran as an ECS task with an environment override (`ecs:DescribeTasks`). Nothing in `infra/` stores it. | Partly mitigated (`SEED_USER_PASSWORD`, `e9c92f3`). Rotation plus the SSM seed task are recommended (M5). |

## Recommendations that need a decision

1. **What a signed-out shared tablet keeps** (M3): options (a) to (d) above. The recommendation is (b), a "Remover dados deste aparelho" action once the outbox is empty.
2. **Session lifetime.** AD-9 sets 30 days sliding, refreshed daily (`auth.ts:8-10`), so a tablet left signed in stays signed in indefinitely.
   - Options: keep it; shorten to 7 days sliding; or add an absolute cap (for example 90 days) plus a server-side "sign out all devices" in Conta.
   - A shorter life costs re-sign-ins in the field, where the tablet may be offline.
3. **Rate limit sizes.** The defaults are 10 sign-ins per 5 min per address and per e-mail, and 120 pushes per minute per user. Confirm them against real field use (several devices per engineer after a day offline), and decide whether 429 gets its own pt-BR message (L10).
4. **Retention.** `ops`, `entities` and S3 objects are append-only with no deletion (AD-7), and noncurrent S3 versions expire after 30 days. Decide on a retention period for a company that leaves, and on a per-company quota alarm (M7).
5. **Production seed and rotation** (M5): rotate the exposed password, and adopt the SSM-based seed task.
6. **IMDS exposure in host mode** (L2): accept it, or move the sidecar and Caddy off host networking.

## How to verify the branch before it becomes a PR

The branch was checked in the isolated project `fasor-sec`, port base 62, with `.env` plus `compose.local.yml` as in `epic-batch-orchestrator.md` §1. The full gates were not run, per the review brief.

**Already run, all green:**

- `docker compose --profile tools run --rm --no-deps tools pnpm lint` and `pnpm static`.
- `-w /workspace/apps/api tools pnpm exec vitest run` on:
  - unit: `src/http/security.test.ts`, `src/config.test.ts`, `src/http/app.test.ts`;
  - integration: `src/http/files.integration.test.ts`, `src/http/request-log.integration.test.ts`, `src/auth/auth.integration.test.ts`, `src/sync/sync.integration.test.ts`, `src/http/generate.integration.test.ts`, `src/boot.integration.test.ts`;
  - the sharp-dependent suites listed under H2.
- `tools pnpm exec vitest run packages/domain/src/contract`.
- `tools pnpm exec vitest run scripts/tooling.test.ts -t "seed-users CLI"`.
- The OCR tests, `tests/test_admission.py` plus `tests/test_api.py`, in the existing `app-ocr` image with the branch's `app/__init__.py`, `app/main.py`, `app/pipeline.py` and the new test mounted: 18 passed.
- `infra/bin/check`: all passed. `caddy validate` of `infra/caddy/Caddyfile`: valid.

**Still to run, on a free machine:**

1. `flock /tmp/fasor-verify.lock docker compose --profile tools run --rm tools pnpm verify`, with `RATE_LIMIT` unset (it must stay off for the gates).
2. `docker compose --profile ocr build ocr`. This proves the pinned PP-OCRv5 checksums match a fresh download. Then run `flock /tmp/fasor-verify.lock docker compose --profile ocr run --rm ocr pytest`.
3. A human pass in a real browser over the built bundle, served by the api (Caddy, `https://<TABLET_HOST>`), at 390, 768 and 1280 px:
   - sign-in, photo capture (camera and geolocation under the new `Permissions-Policy`), export preview in a new tab, and certificate open;
   - confirm no CSP violation other than zod's probe (L11).
4. `RATE_LIMIT=on` in `.env`, restart `api`, then:
   - 11 wrong sign-ins answer 429 with `retry-after`;
   - the web's sign-in form shows its refusal message (L10);
   - a sync after 120 pushes in a minute resumes after the window.
5. After merge, before any deploy: `infra/bin/tf bootstrap apply`, a production `apply` (bucket policies), and a deploy (HSTS Caddy). Rotate the admin password first (M5).
