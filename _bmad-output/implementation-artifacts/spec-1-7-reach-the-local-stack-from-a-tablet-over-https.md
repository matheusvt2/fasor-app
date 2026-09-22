---
title: 'Reach the local stack from a tablet over HTTPS'
type: 'feature'
created: '2026-09-21'
status: 'done'
baseline_revision: '7789990ad903049765d2d92a7ef09fb98eaa64f9'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-fasor-2026-09-21/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-1-run-the-whole-stack-with-one-command.md'
  - '{project-root}/AGENTS.md'
warnings: ['oversized']
deferred:
  - summary: >-
      scripts/build-tagged-image.sh tags whatever `docker compose build api` produces as
      app-api:<commit-sha>, but apps/api/Dockerfile never COPYs application source (bind-mount
      only), so the tagged image's content is identical across commits that don't touch the
      Dockerfile or dependencies.
    evidence: |-
      Verified by reading apps/api/Dockerfile end to end: it installs Node 24, LibreOffice and
      pnpm, with no COPY of app code; all app/api/web services rely on the `.:/workspace` bind
      mount at runtime. A commit-pinned artifact needs a self-contained multi-stage build (COPY
      + frozen install + web build baked in), which is disproportionate to add now since nothing
      in the MVP consumes these tags (no registry, no automated promotion). Revisit when Epic 11
      builds the real production Dockerfile for AWS deployment.
    location: >-
      scripts/build-tagged-image.sh, apps/api/Dockerfile
    severity: medium
  - summary: >-
      apps/api/src/db/migrate.ts (the one-shot forward-only migration runner) has no automated
      test and is never invoked by `pnpm verify`.
    evidence: |-
      grep across the repo for `migrate.ts`/`db/migrate` shows no test imports or calls it; the
      `migrate` compose service is `profiles: ['prod']` and none of pnpm verify's steps run it.
      With zero migrations in apps/api/drizzle/ today, there is nothing meaningful to assert
      beyond "resolves without throwing against a real Postgres" (already exercised manually via
      `docker compose --profile prod up migrate`, confirmed exit 0). Worth a real test once the
      first .sql migration lands and there is an actual schema change to verify against.
    location: 'apps/api/src/db/migrate.ts'
    severity: low
dev_model: 'sonnet'
dev_effort: 'medium'
---

<intent-contract>

## Intent

**Problem:** The stack from Story 1.1 only answers on plain HTTP `localhost` ports. A tablet needs a secure-context HTTPS origin (service worker, camera, Geolocation) on the LAN, with web and `/api/*` on one origin (no CORS), and a `prod` profile approximating the future cloud image (built bundle, forward-only migrations, JSON logs) — none of which exist yet. There is no CI in the MVP (AGENTS.md, decided 2026-09-21); the "image tagged with the commit" AC becomes a local, docker-compose-only script.

**Approach:** Add a Caddy reverse proxy (always-on, `docker compose up`) terminating TLS with an mkcert-issued cert (both generated in containers, never natively) for a developer-set `TABLET_HOST`, proxying everything to `api`. Make `api` optionally serve the built web bundle (`apps/web/dist`, already bind-mounted) plus `/api/*`, so the same container works unmodified today and under a new `prod` profile. Add Drizzle migration plumbing (currently absent) as a one-shot `migrate` service and JSON stdout logging, plus a docker-compose-only build+tag script.

## Boundaries & Constraints

**Always:** mkcert and Caddy run only in containers (new `docker/mkcert/` Dockerfile, no `image:` tag so it never collides across compose projects per-worktree; Caddy uses stock `caddy:2-alpine`, no build). `TABLET_HOST` is a `.env`-provided hostname/IP (default `localhost`), never auto-detected from inside a container. Root CA and leaf cert live under a host-visible, gitignored `./certs` bind mount so the CA can be copied to a tablet. Existing `web`/`api`/`install`/`tools` services, their commands, ports and the default (no-profile) `docker compose up` behavior are unchanged — additions are new services or additive code, never edits that change today's dev behavior for the other three parallel worktrees. `migrate` and any new built service omit `image:` (bare `build:`) per the same cross-worktree isolation rule. Drizzle migrations run forward-only from an (initially empty) `apps/api/drizzle/` folder via `drizzle-orm`'s migrator — zero migrations today is a valid, successful run; later stories add `.sql` files. JSON logs (one line per event, `console.log(JSON.stringify(...))`) carry `company_id`/`relatorio_id` when known, `null` otherwise (no auth exists yet). The build/tag script runs `pnpm verify` first and refuses to tag on failure.

**Never:** No native mkcert/openssl/certbot on the host. No change to `apps/web`'s dev server, its port, or Vite proxy. No GitHub Actions or any CI YAML (AGENTS.md, no CI in the MVP). No real company/relatório data plumbing — logging fields are wired but legitimately `null` until Story 1.3/epic 2+ exist. No production-grade cert renewal, HSTS preload, or rate limiting — one static mkcert leaf is sufficient for a LAN dev proof.

</intent-contract>

## Code Map

- `docker-compose.yml` -- add `mkcert` (build, no image), `caddy` (image `caddy:2-alpine`), `migrate` and `api-prod`-or-equivalent for the `prod` profile (`profiles: ['prod']`); postgres/minio already unprofiled so they run under `--profile prod` too; do not touch existing `install`/`api`/`web`/`tools` blocks except additive `depends_on`/env if unavoidable.
- `apps/api/src/http/app.ts` -- currently only mounts `/api/health`; add static-file serving of `apps/web/dist` (Hono `serveStatic` from `@hono/node-server/serve-static`) with an SPA fallback to `index.html`, skipped/404 gracefully when `dist` absent (dev-before-first-build case), plus a request-logging middleware.
- `apps/api/src/main.ts` -- replace raw `console.log`/`console.error` with the new JSON logger; call migrator readiness is separate (`migrate` service), not inline here.
- `apps/api/src/config.ts` -- current zod schema (`DATABASE_URL`, `S3_*`, `PORT`, `SESSION_SECRET`, `LLM_PROVIDER`, `OCR_PROVIDER`); extend only if a new env var is strictly required (e.g. `STATIC_DIR`), keep fail-fast behavior.
- `apps/api/Dockerfile` -- current base installs Node 24 + LibreOffice, bind-mount only (no `COPY` of source); reused as-is by dev services; decide whether `migrate`/prod api need a self-contained variant (baked-in source + `pnpm install` + built web) vs. reusing the bind-mounted dev image — document the choice in Design Notes.
- `apps/api/package.json` -- add `drizzle-orm`, `drizzle-kit` (versions per architecture spine Stack table: 0.45 / 0.31) and a `migrate`/`start` script (`start` already runs `tsx src/main.ts`, confirm it fits prod use).
- `docs/` -- new file documenting: setting `TABLET_HOST`, running `docker compose up`, extracting `./certs/.../rootCA.pem`, installing it on iPadOS and Android once, then opening `https://$TABLET_HOST`; and the manual sign-in/Home check on both devices (this AC is a manual step for Matheus, never claim it was executed).
- `.gitignore` -- add `certs/`.

## Tasks & Acceptance

**Execution:**
- `docker/mkcert/Dockerfile`, `docker/mkcert/entrypoint.sh` -- generate the local CA (`mkcert -install`, `CAROOT=/certs/ca`) and a leaf cert/key for `$TABLET_HOST` + `localhost`/`127.0.0.1`, one-shot, output to bind-mounted `/certs` -- AC1
- `docker/caddy/Caddyfile` -- one site block on `$TABLET_HOST` (and `localhost`) with `tls` pointing at the generated leaf cert/key, reverse-proxying everything to `api:3000` -- AC1
- `docker-compose.yml` -- `mkcert` + `caddy` services (always-on, ports `80`/`443`), `migrate` + prod api service (`profiles: ['prod']`, no `image:` on newly built ones), `TABLET_HOST` env plumbed through -- AC1, AC2
- `apps/api/src/db/schema.ts`, `apps/api/drizzle.config.ts`, `apps/api/drizzle/` -- Drizzle wired up with zero tables/migrations for now -- AC2
- `apps/api/src/db/migrate.ts` + `migrate` package.json script -- runs the forward-only migrator once against `DATABASE_URL`, exits 0 on an empty migration set -- AC2
- `apps/api/src/log.ts` -- JSON stdout logger (`company_id`, `relatorio_id`, `job_id` optional fields) -- AC2
- `apps/api/src/http/app.ts` -- static bundle serving + SPA fallback + request-logging middleware using `log.ts` -- AC1, AC2
- `scripts/build-tagged-image.sh` (or a root `package.json` script) -- runs `pnpm verify`, then builds and tags the api image with `git rev-parse HEAD` (local only, no registry push) -- AC4
- `docs/tablet-https-setup.md` -- CA install + manual sign-in check steps for Matheus on iPad/Android -- AC3
- `.gitignore` -- ignore `certs/`

**Acceptance Criteria (from epics.md Story 1.7, verbatim intent):**
- Given `docker-compose.yml` gains Caddy terminating TLS with an mkcert-issued cert for the LAN hostname/IP, when the developer runs `docker compose up` and installs the root CA on the tablets once, then `https://⟨host⟩.local` serves the built web app and `/api/*` from the api container on one origin, as a secure context, with no CORS.
- Given the api image and the Vite-built web bundle, when the `prod` profile runs, then api serves the static bundle and `/api/*` like the future cloud image, Postgres/MinIO run beside it, Drizzle migrations run forward-only as a one-shot container before api starts, and JSON logs with `company_id`/`relatorio_id` go to stdout.
- Given the local HTTPS origin, when a seeded user opens it on an iPad and an Android device, then they can sign in and see Home with `lang="pt-BR"` — this check is manual (Matheus); the spec only ships the documented steps, never a claim it ran.
- Given a commit lands, when the build/tag script runs, then it gates on lint+tests and produces one locally tagged image per commit, no cloud push.

## Spec Change Log

## Review Triage Log

### 2026-09-21 — Review pass

- verdicts: 30 findings — high 3, medium 8, low 15, false 8, maybe-false 1 (routes: patch 16, defer 3, reject 11)
- findings:
  - `[high]` `[patch]` Blind hunter: no automated test exercises the new static-serving/SPA-fallback/path-traversal logic in `apps/api/src/http/app.ts` — verified: none of `health.test.ts`, `boot.integration.test.ts` or the Playwright e2e spec ever request a non-`/api/health` path through `createApp`; `pnpm verify` doesn't build `apps/web/dist` first, so the whole route is unregistered during the merge gate. Action: added `apps/api/src/http/app.test.ts` covering SPA fallback, `/api/*` passthrough and the traversal guard.
  - `[high]` `[patch]` Verification-gap: same root cause (regression gap) — `createApp` is called from exactly 3 sites, all only hitting `/api/health`; confirmed `apps/web/dist` is gitignored so a clean checkout has no dist during `pnpm verify`. Same action as above.
  - `[high]` `[patch]` Intent-alignment: same root cause from a different lens — the diff's evidence for AC1/AC2's serving mechanism lives entirely at the docs/manual-command surface, not the test-suite surface. Same action as above.
  - `[medium]` `[patch]` Blind hunter: request-logging middleware in `app.ts` has no try/finally — if a downstream handler throws, `next()` rejects and the `log('http_request', ...)` call after it never runs, so the exact requests an operator most wants logged (failures) are silently dropped. Action: wrapped in `try { await next() } finally { log(...) }`, with a `status` fallback for the thrown-error case.
  - `[medium]` `[patch]` Edge-case hunter: same defect, independently found by path tracing (`app.ts:38-51`). Same action.
  - `[medium]` `[patch]` Edge-case hunter (+claim variant): `api-prod` has no `depends_on` on `migrate`, so `docker compose --profile prod up -d` can start `api-prod` against an unmigrated database; the AC's "migrations run... before api starts" is only a documented two-step manual sequence, not enforced. Verified both services already share `profiles: ['prod']`, so an added `depends_on: { migrate: { condition: service_completed_successfully } }` cannot affect the unprofiled default services. Action: added the dependency.
  - `[medium]` `[patch]` Edge-case hunter, claim variant of the same finding (AC2 ordering not enforced by compose). Same action.
  - `[medium]` `[patch]` Edge-case hunter: `existsSync(STATIC_DIR)` is checked once when `createApp()` runs, so building `apps/web/dist` after `api` has already started leaves it 404ing until a manual restart — reproduced live during this review's own verification (`docker compose restart api` was needed after building). Action: moved the check inside the request handler so it's re-evaluated per request; the documented `docker compose up` -> `pnpm --filter @app/web build` workflow now needs no restart.
  - `[medium]` `[patch]` Blind hunter: `apps/api/src/config.ts`'s `loadConfigOrExit` still calls raw `console.error(error.message)`, not the new JSON logger, so a misconfigured `migrate`/`api-prod` container (both introduced by this story) emits a non-JSON line, inconsistent with this story's own JSON-logging work. Action: switched to `logError` from `log.ts`.
  - `[low]` `[patch]` Edge-case hunter: `c.req.path.startsWith('/api/')` doesn't match the exact path `/api` (no trailing slash), which falls through to the SPA handler instead of 404ing. Action: also match the exact `/api` path.
  - `[low]` `[patch]` Edge-case hunter: if `apps/web/dist` exists but `index.html` is missing (a partial/interrupted build), `readFile` throws and the request 500s instead of the intended graceful-absence 404. Action: also require `index.html` to exist before registering/serving the static route.
  - `[low]` `[patch]` Edge-case hunter: in `log.ts`, `...fields` is spread after the `?? null` normalization, so a field explicitly passed as `undefined` would remove that key from the JSON line instead of emitting `null` — no current call site triggers it, but it's a latent contract break. Action: reordered so the normalized keys are applied after the spread.
  - `[low]` `[patch]` Edge-case hunter: `apps/api/drizzle.config.ts` uses `process.env.DATABASE_URL ?? 'default'`, which doesn't fall back on an explicit empty string. Action: switched to `||`.
  - `[low]` `[patch]` Blind hunter: `migrate`/`api-prod` have no healthcheck, and `docs/tablet-https-setup.md`'s prod-profile steps `curl` immediately after `up -d` with no readiness wait. Action: added a healthcheck to `api-prod` matching the existing `api` service's.
  - `[low]` `[patch]` Blind hunter: `docs/tablet-https-setup.md` step 1 doesn't give an actual command for finding the LAN IP. Action: added `ip addr` / `ipconfig` hints.
  - `[low]` `[patch]` Blind hunter: `MIME_TYPES` in `app.ts` omits `.map`, `.wasm`, `.ttf`, `.webp`, `.avif`. Action: added them.
  - `[medium]` `[defer]` Blind hunter: `scripts/build-tagged-image.sh` tags whatever `docker compose build api` produces, but `apps/api/Dockerfile` never `COPY`s source (bind-mount only), so the tag's content is identical across commits that don't touch the Dockerfile/deps — verified by reading the Dockerfile end to end. Recorded in frontmatter `deferred` (a self-contained multi-stage build is disproportionate to add now; nothing in the MVP consumes these tags; revisit at the real Epic 11 production Dockerfile).
  - `[medium]` `[defer]` Edge-case hunter, claim variant of the same finding. Same disposition.
  - `[low]` `[defer]` Verification-gap: `apps/api/src/db/migrate.ts` has no automated test and isn't reached by `pnpm verify`; with zero migrations today there's nothing meaningful to assert beyond "resolves without throwing," already exercised manually (`docker compose --profile prod up migrate` exits 0). Recorded in frontmatter `deferred`, to revisit once the first `.sql` migration lands.
  - `[low]` `[reject]` Blind hunter: `docker/mkcert/Dockerfile` hardcodes `linux/amd64`. Not worth the added arch-detection complexity — the same class of finding (arm64 support) was rejected in Story 1.1's own review for the same reason: the team machine is x86_64.
  - `[low]` `[reject]` Blind hunter: `api-prod` (the `prod` profile) is never reachable through Caddy/TLS — only `api` (dev) is proxied. Nothing in AC2's literal text requires the prod profile to sit behind HTTPS (that's AC1's concern, for the dev-profile `api`); fixing it would need dual TLS termination or a conditional Caddyfile, disproportionate for an occasional manual profile.
  - `[false]` `[reject]` Blind hunter: Caddy's ports (`80:80`, `443:443`) are published on all interfaces, unlike Postgres/MinIO's `127.0.0.1` binding. Refuted: Caddy is intentionally the tablet-facing entry point — AC1 requires LAN reachability from an iPad/Android on the same network, unlike Postgres/MinIO, which are internal-only backing services with no reason to be LAN-exposed.
  - `[false]` `[reject]` Blind hunter: `apps/api/drizzle/meta/_journal.json` was hand-authored instead of generated via `drizzle-kit generate`. Refuted: verified empirically twice — `docker compose --profile prod up migrate` ran successfully against real Postgres using this exact file (exit 0, "migrations applied" logged) both times, including a second, idempotent run in this review.
  - `[false]` `[reject]` Edge-case hunter: a symlink under `apps/web/dist` could escape `STATIC_DIR` since only string-prefix checking is done, no `realpath` resolution. Refuted: `apps/web/dist` is exclusively produced by a trusted local `vite build` from source under our control; no attacker-controlled content or symlinks are ever placed there, so there is no demonstrated reachable path.
  - `[maybe-false]` `[reject]` Edge-case hunter: in `migrate.ts`, if `migrate()` throws and the `finally` block's `sql.end()` also throws, the connection-close error could mask the original migration failure. Whether `postgres.js`'s `sql.end()` throws on an already-broken connection was not checked either way; even if true, the effect is a masked log message in a one-shot container a developer would simply re-run — at most low severity, so rejected per the "maybe-false, if-true-only-low" rule rather than deferred.
  - `[false]` `[reject]` Edge-case hunter, claim: `logError` writes to `console.error` (stderr), which the claim reads as contradicting AC2's "JSON logs ... go to stdout." Refuted: splitting error-level output to stderr while info goes to stdout is standard container/12-factor practice and is still captured by `docker compose logs`; the AC's intent (structured, collectible container logs) is met either way.
  - `[false]` `[reject]` Edge-case hunter, claim: adding a separate `api-prod` compose service contradicts the spec's Approach text ("the same container works unmodified"). Refuted: that sentence describes the shared app code/image (same Dockerfile, same `app.ts` logic) working for both profiles, not compose topology; this spec's own Code Map already anticipated a distinct "`api-prod`-or-equivalent" service.
  - `[false]` `[reject]` Intent-alignment: AC4's literal "when a commit lands" (an automatic, git-triggered event) versus the diff's manually-invoked `build-tagged-image.sh`. Refuted: this reinterpretation is explicitly pre-authorized — AGENTS.md's recorded "no CI in the MVP" decision (2026-09-21) and this build's own orchestration intent both call for "a local, docker-compose-only way to build and tag the image with the commit sha," not a CI pipeline.
  - `[false]` `[reject]` Intent-alignment: AC1's literal `https://⟨host⟩.local` versus the diff's arbitrary `TABLET_HOST` (hostname or raw IP). Refuted: `TABLET_HOST` is a strict superset — a developer can set it to a `.local` mDNS name too if their network supports it — and a raw LAN IP is more reliable across mixed iOS/Android networks than mDNS.
  - `[false]` `[reject]` Intent-alignment: AC2's "exactly as the future cloud image will" versus reusing the bind-mounted dev image for `migrate`/`api-prod` rather than a `COPY`-based build. Refuted for AC2 specifically: that phrase describes serving *behavior* (one process, one origin, static+API together), which is achieved regardless of packaging mechanism; the packaging-fidelity concern is real but belongs to AC4's tagged-image requirement, already captured and deferred separately above.

## Design Notes

No production Postgres/MinIO hardening is in scope — they already run unprofiled from Story 1.1 and are reused as-is under `--profile prod`. Prefer reusing the bind-mounted dev image for `migrate`/prod-api if it keeps the story to a medium scope; only add a self-contained `COPY`-based build stage if serving the static bundle or running migrations genuinely requires source baked into the image rather than the bind mount (it usually does not, since `<<: *workspace` already mounts the whole repo into `api`). `api-prod` depends on `migrate` completing successfully (both are `profiles: ['prod']`-only, so this cannot affect the unprofiled default services); the docs still document the two-step sequence (`docker compose --profile prod up migrate` then `up -d`) as the recommended, explicit order to run it in.

`scripts/build-tagged-image.sh` tags whatever `docker compose build api` produces; since `apps/api/Dockerfile` never `COPY`s source (bind-mount only), that tag's content does not actually vary by commit. This is a known, deferred limitation (see frontmatter `deferred`) rather than a silent gap — a genuinely commit-pinned artifact needs a self-contained multi-stage build, which is disproportionate to add now since nothing in the MVP consumes these tags; revisit at the real production Dockerfile work in Epic 11.

## Verification

**Commands:**
- `docker compose up -d` -- web/api/postgres/minio/caddy/mkcert start; `mkcert`/`migrate` exit 0
- `curl -vk https://$TABLET_HOST/api/health` -- TLS handshake succeeds, JSON health body returned
- `curl -vk https://$TABLET_HOST/` -- serves the built web app (after `pnpm --filter @app/web build`)
- `docker compose --profile prod up migrate` then `docker compose --profile prod up -d` -- migrate exits 0, prod api serves `/api/*` and the bundle, stdout shows JSON lines
- `docker compose run --rm tools pnpm verify` -- still green, under 15 minutes

**Manual checks (if no CLI):**
- Root CA extracted from `./certs` and installed on an iPad and an Android device once; `https://$TABLET_HOST` opens without a certificate warning (Matheus, not simulated here).

## Auto Run Result

**Summary:** Added a Caddy reverse proxy (always-on, `docker compose up`) terminating TLS with an mkcert-issued certificate (both generated in containers, no host installs) for a developer-set `TABLET_HOST`, fronting the `api` container so a tablet on the LAN reaches web + `/api/*` on one secure-context origin with no CORS. Made `api` serve the built web bundle (`apps/web/dist`) with an SPA fallback and a path-traversal guard, always re-checked per request. Added Drizzle migration plumbing (previously absent in the repo) as a one-shot `migrate` service and a `prod` compose profile (`migrate` + `api-prod`) approximating the future cloud image, with `api-prod` depending on `migrate` completing first. Added structured JSON stdout/stderr logging (`company_id`/`relatorio_id`/`job_id`, `null` until auth/jobs exist) via a new `log.ts`, wired into request logging (fail-safe via try/finally) and boot/config errors. Added a local, docker-compose-only build+commit-tag script standing in for the "no CI in the MVP" AC. Documented the tablet CA-install and manual sign-in check (left unperformed, as instructed) in `docs/`.

**Files changed:**
- `docker-compose.yml` -- new `mkcert` (one-shot, no `image:` tag), `caddy` (image `caddy:2-alpine`, ports 80/443), and `prod`-profile `migrate` + `api-prod` (depends on `migrate`, has a healthcheck); existing `install`/`api`/`web`/`tools` blocks unchanged.
- `docker/mkcert/{Dockerfile,entrypoint.sh}` -- generates the local CA and a leaf cert for `$TABLET_HOST` + localhost/127.0.0.1 under bind-mounted `./certs`.
- `docker/caddy/Caddyfile` -- TLS termination with the mkcert leaf, reverse-proxying everything to `api:3000`.
- `apps/api/src/http/app.ts` -- request-logging middleware (try/finally-safe), static bundle serving + SPA fallback + path-traversal guard (`resolveStaticTarget`, exported and unit-tested), re-checked per request, injectable `staticDir` for tests, exact-`/api` 404 handling, extended `MIME_TYPES`.
- `apps/api/src/http/app.test.ts` -- new: 7 Vitest cases covering SPA fallback, static file serving, `/api/*` and bare `/api` 404s, partial-build 404, late-appearing dist with no restart needed, and the traversal guard.
- `apps/api/src/log.ts` -- new JSON stdout/stderr logger (`log`/`logError`), field-ordering fixed so an explicit `undefined` never drops a contract key.
- `apps/api/src/main.ts` -- uses the new logger instead of raw `console.*`.
- `apps/api/src/config.ts` -- `loadConfigOrExit`'s error path now uses `logError` (JSON) instead of raw `console.error`.
- `apps/api/src/db/{schema.ts,migrate.ts}`, `apps/api/drizzle.config.ts`, `apps/api/drizzle/` -- Drizzle wired up with zero tables/migrations today; one-shot forward-only migrator, empty-set run is a valid success (verified twice against real Postgres).
- `apps/api/package.json` -- `drizzle-orm`/`drizzle-kit` deps, `migrate` script.
- `scripts/build-tagged-image.sh` -- runs `pnpm verify` then tags the built api image with the commit SHA, local only, no registry push.
- `docs/tablet-https-setup.md` -- new: `TABLET_HOST` setup, CA extraction/install steps for iPadOS/Android, opening the HTTPS origin, running the `prod` profile, and the manual sign-in check explicitly flagged as not run.
- `.env.example`, `.gitignore` -- `TABLET_HOST` documented; `certs/` ignored.
- `pnpm-lock.yaml` -- regenerated inside the `install` container for the new deps.

**Review findings breakdown (30 findings across 4 layers; see the Review Triage Log above for full detail):**
- **Patched (12 entries: 1 high, 3 medium, 8 low):** missing tests for the static-serving/SPA-fallback/traversal-guard mechanism (high); the request-logging middleware dropping failed-request log lines; `api-prod` not depending on `migrate`; `existsSync(STATIC_DIR)` checked once instead of per request (all medium); `config.ts` boot errors not JSON; no healthcheck on `api-prod`; missing LAN-IP command in the docs; narrow `MIME_TYPES`; exact-`/api` path falling through to the SPA shell; a partial build 500ing instead of 404ing; a `log.ts` field-ordering footgun; `drizzle.config.ts` not handling an empty-string `DATABASE_URL` (all low). All applied by the original implementation subagent and independently re-verified (full `pnpm verify` green, plus a fresh `docker compose --profile prod up migrate && up -d` cycle and manual HTTPS curl checks).
- **Deferred (2, recorded in frontmatter `deferred`):** `scripts/build-tagged-image.sh` tags a bind-mount-only image, so the tag's content doesn't actually vary by commit (medium; revisit at the real Epic 11 production Dockerfile — nothing in the MVP consumes these tags yet); `migrate.ts` has no automated test (low; nothing meaningful to assert with zero migrations today, already exercised manually).
- **Rejected (16, with reasons in the Review Triage Log):** mkcert's hardcoded `linux/amd64` (low, same precedent as Story 1.1); `api-prod` not reachable through Caddy/TLS (low, not required by AC2's literal text); Caddy bound to all interfaces (false -- that is the point of a tablet-facing proxy, unlike Postgres/MinIO); the hand-authored `drizzle` journal file (false -- verified working against real Postgres twice); a theoretical symlink escape in static serving (false -- no untrusted content is ever placed in `apps/web/dist`); a `migrate.ts` `sql.end()` masking-error edge case (maybe-false, if-true only low); `logError` writing to stderr instead of stdout (false -- standard, still container-collectible); a separate `api-prod` compose service "contradicting" the spec's prose (false -- the spec's own Code Map anticipated it); and three intent-alignment observations already pre-authorized by this build's own framing or explained as a superset, not a gap (the manual CI-tag trigger, the `TABLET_HOST` vs `.local` hostname, and AC2's "exactly as the cloud image" behavioral reading).

**Follow-up review recommendation: true.** This pass patched one `high` entry (the previously-absent test coverage for the story's core serving mechanism) and three `medium` entries (the logging try/finally, the `migrate` ordering dependency, and the per-request static-dir check) in a single pass. Per the workflow's own rule this crosses the bar for recommending a further independent review pass, even though this orchestrator's own re-verification (full `pnpm verify`, a fresh prod-profile cycle, and manual HTTPS checks) came back green. The specific unverified risk to flag for that pass: the path-traversal guard (`resolveStaticTarget`) is unit-tested with a raw string bypassing Hono's own URL normalization, so its coverage is real but indirect; a fresh reviewer should independently confirm no request path can ever reach that function with an unnormalized `..` sequence in practice.

**Verification performed:**
- `docker compose up -d` -- postgres/minio/install/api/web/mkcert/caddy start; mkcert exits 0.
- `curl -vk https://$TABLET_HOST/api/health` and `.../` and `.../api` -- 200, 200, 404 respectively (TLS via the mkcert leaf, single origin, no CORS).
- `docker compose --profile prod up migrate` then `up -d api-prod` -- migrate exits 0 (idempotent, verified twice against real Postgres); `api-prod` now waits for it and reports `healthy`; `curl http://127.0.0.1:3001/api/health` and `.../` both 200; `docker compose logs api-prod` shows JSON lines including the `http_request` and `api listening` events.
- `docker compose run --rm tools pnpm verify` -- green (lint, static, unit/integration incl. the new `app.test.ts` 7 cases, api tests, Playwright `@p0`), well under 15 minutes; full output saved.
- `git status --ignored` -- confirms `certs/`, `apps/web/dist/`, `.env` and `compose.local.yml` all remain untracked/ignored; no isolation files leaked into the diff.

**Residual risks:**
- The commit-tagged image is not actually commit-pinned in content (deferred, documented above).
- `migrate.ts` has no automated test; safe today (zero migrations) but should gain one with the first real `.sql` migration.
- The manual iPad/Android sign-in check (AC3) has not been performed -- physical devices and LAN access are required; steps are documented in `docs/tablet-https-setup.md` for Matheus.
- `mkcert`'s own CLI output includes emoji in its stdout (a third-party tool's banner, not project-authored content); harmless but visible in `docker compose logs mkcert`.
