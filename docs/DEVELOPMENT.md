# Development

How to run the stack locally, provision users and work on the code. Testing has its own guide, [TESTING.md](TESTING.md); publishing to AWS is [infra/PUBLISHING.md](../infra/PUBLISHING.md).

## Rules that shape everything below

- Everything runs in Docker through docker-compose. Never run `pnpm`, `node`, Python or a database on the host; use the `tools` container.
- Client material in `docs/context/` and `docs/media/` is git-ignored. Never copy it into a tracked file. The repository is public.
- Planning documents decide behaviour. When they disagree, `source-deltas.md` wins, then the architecture spine, then `EXPERIENCE.md` and `DESIGN.md`, then the PRD (`AGENTS.md`).

## Start the stack

```sh
docker compose up -d
```

| Service | Address | Notes |
| --- | --- | --- |
| `web` | http://localhost:5173 | Vite dev server with hot reload; bound to loopback |
| `api` | http://localhost:3000 | Hono under `tsx watch`; reloads on save |
| `postgres` | 127.0.0.1:5432 | user, password and database `app` |
| `minio` | 127.0.0.1:9000, console 9001 | `minioadmin` / `minioadmin` |
| `caddy` | https://localhost | HTTPS origin for tablets; proxies to the api |
| `install` | one-shot | `pnpm install` into named volumes before the others start |

Check it:

```sh
curl http://localhost:3000/api/health
```

The api serves the web bundle only when it has been built (`pnpm --filter @app/web build`). Without a build, `https://localhost/` answers 404 while `/api/*` works; use http://localhost:5173 for development.

Stop it with `docker compose down`; add `-v` to drop the database, the files and the installed dependencies.

## Configuration

`docker-compose.yml` carries working defaults, so `.env` is optional. Copy `.env.example` to `.env` only to override:

| Variable | Default | When to set it |
| --- | --- | --- |
| `SESSION_SECRET` | a public development value | always for the `prod` profile, which refuses the default; changing it signs everyone out, passwords are unaffected |
| `RATE_LIMIT` | off outside production | `on` to try the sign-in and push limits locally |
| `TABLET_HOST` | `localhost` | the LAN address a tablet types, for the HTTPS certificate |
| `LLM_PROVIDER`, `OCR_PROVIDER` | `fake` | keep `fake` locally; no story may need a cloud account |
| `VITE_SPEECH_ENGINE` | `none` | `webspeech` to try dictation (audio goes to the browser vendor) |
| `CADDY_HTTP_PORT`, `CADDY_HTTPS_PORT`, `API_PROD_PORT` | 80, 443, 3001 | a second stack on the same machine |

`.env` is git-ignored. Never commit a secret.

## Users and sample data

There is no sign-up route and no outbound e-mail. `scripts/seed-users.ts` provisions companies and users and resets passwords.

Test users, the ones every automated suite seeds:

```sh
docker compose --profile tools run --rm tools pnpm exec tsx scripts/seed-users.ts --test
```

| E-mail | Password | Company | Notes |
| --- | --- | --- | --- |
| `a@teste.local` | `senha-de-teste-123456` | Empresa A de Teste | has the "Cabine primária — padrão" template; use it to try the app |
| `b@teste.local` | `senha-de-teste-123456` | Empresa B de Teste | no template; the second tenant for isolation tests |

A real company:

```sh
docker compose --profile tools run --rm tools pnpm exec tsx scripts/seed-users.ts \
  --company "<company name>" --email <email> --password "<password>" \
  --name "<full name>" --council <crea|crt> --number "<registration number>" \
  [--company-id <uuidv7>] [--title "<printed title>"] \
  [--standard-template] [--sample-relatorio]
```

- Leave `--company-id` out for a new company; the script mints a uuidv7 and prints it. Pass it with the company's next users.
- `SEED_USER_PASSWORD` in the environment replaces `--password`, so the password stays out of shell history and process listings.
- Re-running for an existing e-mail resets the password and the name, never the registration.
- `--standard-template` gives the company the standard template once.
- `--sample-relatorio` gives it the small Porto Seguro relatório. Its ids are fixed, so it lives in one company at a time. The test suites reclaim it only from test companies: while it sits in a company of yours, the export tests on that stack fail at setup with "the small fixture is held by ...". Run those tests on an isolated stack (below) or re-seed the sample into a test company.

## The `prod` profile

One container serves the built web bundle and `/api/*` with `NODE_ENV=production`, close to the AWS image.

```sh
docker compose --profile tools run --rm tools pnpm --filter @app/web build
docker compose --profile prod up migrate
docker compose --profile prod up -d
curl http://localhost:3001/api/health
```

It refuses the public `SESSION_SECRET`: put your own (32 characters or more) in `.env` first. The sign-in and push rate limits are on; `RATE_LIMIT=off` turns them off.

## A tablet on the local network

Set `TABLET_HOST` to the machine's LAN address, recreate `mkcert` and `caddy`, and trust the generated CA once per device. The full steps per platform are in [tablet-https-setup.md](tablet-https-setup.md).

## The OCR sidecar

The `fake` OCR provider answers from fixtures, so the sidecar is optional. To run it:

```sh
docker compose --profile ocr build ocr
docker compose --profile ocr up -d ocr
```

Then set `OCR_PROVIDER=ocr-svc` in `.env` and recreate the api. The image downloads its models at build time (several GB) and needs about 6 GB of memory while testing. See [services/ocr/README.md](../services/ocr/README.md).

## Code ownership

- `packages/domain` computes every status, count, order, verdict and derived pt-BR text, once. `apps/*` never derives a status or count from a sheet.
- `apps/web` renders from IndexedDB and writes only ops to its outbox. `applyOp` is the only reducer, on both sides.
- `apps/api` applies ops and renders documents.
- A new user-facing string has one home: derived text in `packages/domain`, static surface copy in `apps/web/src/copy/pt-br.ts`, shared component chrome in `apps/web/src/copy/ui.ts`.
- Screens follow the mockups in `_bmad-output/planning-artifacts/ux-designs/`. `tokens.css` and `components.css` stay byte-identical; translations of mock container rules go in `apps/web/src/styles/app.css`.

## Working in parallel

Each git worktree can run its own stack. Give it an untracked `.env` and `compose.local.yml` with its own project name and host ports below 65535; the template is section 1 of `_bmad-output/implementation-artifacts/epic-batch-orchestrator.md`. Add `compose.local.yml` to `.git/info/exclude`. Run `docker compose down -v` in a worktree before removing it.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| The api stops answering after a merge or a rebase | `tsx watch` reloaded a file with conflict markers and exited. Fix the file, then `docker compose restart api`. |
| `api-prod` exits at boot about `SESSION_SECRET` | the `prod` profile refuses the public default; set your own in `.env`. |
| Every session dropped after editing `.env` | `SESSION_SECRET` changed; sign in again. Passwords are not affected. |
| Export tests fail with "the small fixture is held by ..." | the Porto Seguro sample sits in a non-test company of this stack; see "Users and sample data". |
| `https://localhost/` answers 404 | no web build; use http://localhost:5173 or build the web bundle. |
| `invalid hostPort` from compose | a host port above 65535 in `compose.local.yml`. |
| The OCR pytest is killed with exit 137 | out of memory; give Docker at least 8 GB and run it on a quiet machine. |
