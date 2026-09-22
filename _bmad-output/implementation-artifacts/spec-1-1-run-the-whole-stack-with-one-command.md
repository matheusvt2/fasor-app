---
title: 'Run the whole stack with one command'
type: 'chore'
created: '2026-09-21'
status: 'done'
baseline_commit: '18ae45f53160c4cf54cc34b48297d5075eb05386'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-fasor-2026-09-21/ARCHITECTURE-SPINE.md'
  - '{project-root}/AGENTS.md'
dev_model: 'sonnet'
dev_effort: 'medium'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** No application code exists yet (no `package.json`, `pnpm-workspace.yaml`, `docker-compose.yml` or tsconfig anywhere in the repo). Every developer environment would otherwise differ, and nothing enforces the architecture's boundaries before feature work begins.

**Approach:** Scaffold a pnpm workspace monorepo (`packages/domain`, `apps/web`, `apps/api`, plus empty `services/ocr` and `infra/` with one README each), wired into one `docker-compose.yml` (web, api, postgres:18, minio). Lock tool versions from the architecture spine's Stack table, enforce import-direction and fetch-location lint rules, validate api config via a zod schema that fails fast on a missing/malformed variable, expose `GET /api/health`, copy the mockups' CSS unchanged into `apps/web/src/styles`, and wire `pnpm verify` (lint + static + Vitest unit/integration + api tests except `@slow` + Playwright `@p0` desktop Chrome, under 15 minutes) as the local merge gate, plus a docker-compose-only test-reset script.

## Boundaries & Constraints

**Always:** Everything runs only via `docker compose up`, nothing native on the dev machine (NFR-18). Config enters only through env vars validated by zod at boot; a missing/malformed var names itself and exits the process. `packages/domain` is pure TS with zero dependency on `apps/*`, enforced by `eslint no-restricted-imports` (domain never imports `apps/*`; `apps/web` and `apps/api` never import each other). `fetch` restricted to `apps/web/src/{sync,files,api}` via lint rule. `tokens.css`/`components.css` copied byte-identical from the mockups into `apps/web/src/styles`; Inter self-hosted. Naming: TS camelCase, DB snake_case via Drizzle mapping, files kebab-case; visible product name reads from one `PRODUTO` constant, codename `fasor` never user-visible. `GET /api/health` returns `{status, db, queue, storage, libreoffice}`. `pnpm verify` is the merge gate (no CI), under 15 minutes, output pasted into the PR.

**Never:** No CI config (Epic 11, post-MVP). No HTTPS reverse proxy (Story 1.7). No auth, sync engine or domain logic beyond one smoke test each (later stories). No AWS/CDK code in `infra/`, no implementation in `services/ocr` — README only for both. No document-generation logic; the api's LibreOffice install exists only so health can report its presence.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Clean boot | `docker compose up`, clean checkout | web/api/postgres/minio start; `/api/health` all fields `up` | N/A |
| Missing/malformed env var | api boots, a required var unset or invalid | Process exits, names the variable | Zod error in logs |
| Forbidden import | `domain` imports `apps/web`, or `web`/`api` import each other | `pnpm lint` fails that file | Names the rule and file |
| Fetch outside allowed dirs | `fetch(...)` outside `apps/web/src/{sync,files,api}` | `pnpm lint` fails that file | Names the rule and file |
| Reset outside compose | reset script run directly on host | Refuses, exits non-zero | Message names the requirement |
| Merge gate | `pnpm verify` on the scaffold | lint+static+Vitest+api(no `@slow`)+Playwright `@p0` all pass, <15 min | Any failing step blocks the run |

</frozen-after-approval>

## Code Map

_Greenfield repo — nothing to reuse. Versions: Node 24, TS 6.0, pnpm 12, Vite 8.3, React 19.3, react-aria-components 1.21, Hono 4.13, Drizzle 0.45, pg-boss 12, LibreOffice 26.2 TDF (per the Stack table in the architecture spine, loaded via `context`)._

## Tasks & Acceptance

**Execution:**
- [x] `pnpm-workspace.yaml`, root `package.json`, `tsconfig.base.json` -- workspace (`packages/domain`, `apps/web`, `apps/api`) + shared TS config -- monorepo shape (AR-12)
- [x] `services/ocr/README.md`, `infra/README.md` -- empty folders, one README each -- explicit AC clause
- [x] `docker-compose.yml` -- web (Vite), api (Hono/Node 24), postgres:18, minio -- single-command local stack (NFR-18)
- [x] `apps/api/src/config.ts` -- zod schema for DB URL, MinIO/S3 creds, PORT, session secret (`LLM_PROVIDER`/`OCR_PROVIDER` default `fake`); fail-fast naming the offending var -- NFR-18
- [x] `apps/api/src/http/health.ts` + route -- `GET /api/health` -> `{status, db, queue, storage, libreoffice}` -- TC-6
- [x] `apps/api/Dockerfile` -- Node 24 + LibreOffice 26.2 TDF `.deb` + fonts -- health reports `libreoffice: up`
- [x] ESLint flat config -- `no-restricted-imports` boundary (domain/web/api) + custom fetch-location rule -- AR-1, AR-12
- [x] `apps/web/src/{db,sync,files,api,state,input,styles,surfaces}` scaffolding + `apps/web/src/styles/{tokens.css,components.css}` copied unchanged from the mockups, Inter self-hosted -- AR-22
- [x] One example Vitest unit/integration test and one example Playwright `@p0` test -- proves the pipeline runs through `pnpm verify`
- [x] `scripts/test-reset.ts` -- resets one company's ops/files/jobs/revisions; refuses outside docker-compose -- TC-9
- [x] Root `package.json` `verify` script -- lint, static, Vitest unit+integration, api tests except `@slow`, Playwright `@p0` desktop Chrome, <15 min -- R-011

**Acceptance Criteria:**
- Given a clean checkout with Docker and pnpm 12, when `docker compose up` runs, then web/api/postgres/minio start and `/api/health` returns all fields `up`, nothing native required.
- Given the workspace layout, when `pnpm lint` runs, then the import-direction and fetch-location rules fail a deliberately-violating probe file and pass otherwise.
- Given the api boots with a required env var missing/malformed, when it starts, then it exits naming that variable.
- Given the repository conventions, when code is written, then identifiers follow the naming table and the visible product name reads from `PRODUTO`.
- Given the quality gate, when `pnpm verify` runs, then all required steps pass in under 15 minutes, and the test-reset script refuses to run outside docker-compose.

## Implementation Notes

- Implemented by bmad-dev-sonnet-medium (sonnet). Verified independently by the orchestrator: `docker compose --profile tools run --rm tools pnpm verify` green in about 32 s; `/api/health` returns all fields `up` on api (3000) and through the Vite proxy (5173).
- The host pnpm is broken and its Node is 22, so every workspace command runs in the `tools` container. The PR paste form is `docker compose --profile tools run --rm tools pnpm verify`.
- Drizzle and drizzle-kit are not installed: no schema exists yet, the api uses postgres.js directly. Add them with the first schema story.
- `scripts/test-reset.ts` guesses the table names `ops, files, revisions, generation_jobs, reading_runs` and skips missing tables. Later stories that create these tables must align with that list.
- `test:api` excludes `@slow` by name pattern, but no `@slow` test exists yet.
- Containers run as uid 1000 to keep bind-mounted files owned by the host user.
- Matrix row "Clean boot" is covered by the health unit test (all probes up) plus a manual compose boot; there is no automated compose-level test.
- `.gitignore` also gained `.bmad-loop/` entries, `_bmad/render/`, `playwright-report/` and `test-results/`.

## Spec Change Log

## Review Triage Log

Layers: BH = blind hunter, EC = edge case hunter, VG = verification gap. Route in brackets.

| Finding | Verdict | Evidence |
|---|---|---|
| test-reset S3 delete loop ignores per-key `Errors`, can loop forever (BH, EC, VG) [patch] | medium | `DeleteObjects` result is never inspected and the loop only exits on an empty listing, so a failing delete repeats indefinitely. |
| test-reset main guard compares `import.meta.url` to `file://${argv[1]}` (BH, EC) [patch] | low | Breaks for paths with spaces or symlinks and then exits 0 without resetting. Direct one-line correction with `pathToFileURL`. |
| Health probe timeout branch has no test (BH, VG) [patch] | medium | Removing the `Promise.race` keeps every existing test green while a hung dependency would hang `/api/health`. |
| Clean-boot matrix row and bucket versioning only checked by hand; wiring in `main.ts` untested (BH, VG) [patch] | medium | No test in `pnpm verify` calls the running api or reads bucket versioning, so mislabeled probes or a dropped versioning call ship green. Matrix audit requires coverage. |
| Mockup byte-identity test uses `skipIf` when the mockups are absent (BH, EC, VG) [patch] | low | A skip reads as green in `verify`. Mockups are tracked in git so they are always present; failing loudly is a deletion of the guard. |
| Postgres, MinIO and api ports published on all interfaces with default credentials (BH, EC) [patch] | medium | `app:app` and `minioadmin` are reachable from the LAN. Tablets only need the web port, so binding the other three to 127.0.0.1 costs nothing. |
| HTML title hard-codes `PRODUTO` instead of reading the constant (BH, EC) [patch] | low | A second source of truth for the visible product name; a one-line `document.title` in `main.tsx` keeps the constant authoritative. |
| test-reset guesses table names and only clears `pgboss.job`; other tables untouched, prints success (BH, EC, VG) [defer] | medium unverified | Tables do not exist yet. Settling it needs the real schema and a two-company integration test against Postgres and MinIO. |
| test-reset scoping (`where company_id`, S3 prefix) has no integration test (VG) [defer] | medium unverified | Same dependency on the later schema story. |
| `ensureBucket` treats every `HeadBucket` error as missing bucket (BH, EC, VG) [reject] | low | Only misleads the error message on an auth failure; compose defaults match, and the fix adds branching. |
| Unpinned `minio/minio` image and `mc` healthcheck (BH, EC) [reject] | low | Works today and the fix needs a tag the Stack table does not name. |
| `web` waits for `api` `service_started` not healthy (BH, EC) [reject] | low | Only a transient proxy error at first load. |
| LibreOffice probe spawns `soffice` on every health call, may flap on slow hosts (BH, EC) [reject] | low | Observed healthy; caching adds complexity for a speculative slow-host case. |
| API healthcheck hard-codes port 3000 (EC) [reject] | low | The port mapping is also hard-coded, so overriding `PORT` is unsupported in this scaffold. |
| No SIGTERM handler; raw stack trace after retry exhaustion (BH, EC) [reject] | low | Dev-only, `compose down` just waits the kill timeout. |
| Weak placeholder `SESSION_SECRET` accepted; providers other than `fake` selectable (BH, EC) [reject] | false | The enum values are the intended post-MVP providers and default to `fake`; the secret is a local-dev default with no auth yet. |
| Empty-string env, empty issue path in config error (EC) [reject] | false | Compose `${VAR:-default}` never passes empty strings and the env is always an object, so the path is always set. |
| companyId argument not validated (EC) [reject] | low | SQL is parameterized and the S3 prefix ends with a slash; dev-only CLI. |
| Transaction and `pgboss.job` column drift in test-reset (EC, BH) [reject] | low | Speculative across pg-boss versions; the guessed-table issue is already deferred. |
| `db` probe leaves the query running after timeout (EC) [reject] | low | `select 1` cannot pile up. |
| Lint bypass via alias, bracket access, `import()`, `require` (EC) [reject] | low | Deliberate evasion; the rules meet the acceptance criteria. |
| Fetch rule applies to test files (EC) [reject] | false | No test in those directories uses fetch. |
| Dockerfile: arm64, no checksum, root Playwright install, duplicated block (BH, EC) [reject] | low | The team machine is x86_64 and the browser ran under the node user. |
| Playwright fixed port 5199 (BH, EC) [reject] | false | Free inside the tools container. |
| `lang="pt-BR"` with English copy; no favicon, theme-color, error boundary (BH) [reject] | false | The shell only renders `PRODUTO`; the language tag is the mandated baseline. |
| `test:unit` runs tests twice (BH) [reject] | false | Root vitest includes only `scripts/**`. |
| `@slow` exclusion untested (BH, EC) [reject] | low | No `@slow` test exists yet. |
| Postgres volume path for version 18 (EC) [reject] | false | `/var/lib/postgresql` is the layout postgres:18 expects. |
| `install` service race, stale lockfile (EC) [reject] | false | `install` runs once before the dependents and the frozen lockfile is current. |
| Spec Verification shows host `pnpm` commands that fail on this host (EC) [defer] | low | AGENTS.md running section is agent-context and must be refreshed by its own skill. |

## Design Notes

`pnpm verify` scope differs slightly between epics.md's AC (lint, static, Vitest unit+integration, api tests except `@slow`, Playwright `@p0`) and `test-design-qa.md` (adds audit/coverage). epics.md AC is authoritative; add audit/coverage only if the 15-min budget allows.

## Verification

**Commands:**
- `docker compose up` -- web/api/postgres/minio start; `/api/health` all fields `up`
- `pnpm lint` -- passes; a deliberately-added bad import/`fetch` fails it (then revert)
- `pnpm verify` -- green, under 15 minutes, output pasted into the PR
