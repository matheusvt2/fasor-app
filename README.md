# Fasor

Sistema para relatórios técnicos de inspeção elétrica em campo: um aplicativo
web tablet-first e offline-first que captura fichas de ensaio de subestação
de média tensão em campo e gera o relatório final (FO.SERV-03) em DOCX e PDF.
O nome visível no produto é o placeholder `PRODUTO`; o codename interno do
projeto nunca aparece em texto voltado ao usuário.

## Estrutura

- `packages/domain` — kernel puro em TypeScript (zod apenas): status, cálculos, regras de negócio.
- `apps/web` — cliente React 19 + Vite 8 + Dexie, offline-first, service worker.
- `apps/api` — Hono 4 + Drizzle + PostgreSQL 18 + pg-boss, na porta `3000`.
- `docker-compose.yml` — todo o stack local (web, api, PostgreSQL 18, MinIO, Caddy/mkcert para HTTPS).
- `docs/` — documentação operacional (este arquivo, `docs/tablet-https-setup.md`).
- `_bmad-output/planning-artifacts/` — brief, pesquisas, PRD, épicos e UX.
- `_bmad/` e `.claude/skills/` — configuração do BMAD e skills do Claude Code.

Os arquivos brutos do cliente (`docs/context/`, `docs/media/`) ficam fora do repositório.

## Running the stack

Everything runs in Docker through docker-compose; nothing is installed or run
natively on the host.

```
docker compose up -d
```

This starts `web` (Vite dev server, `:5173`), `api` (Hono, `:3000`),
`postgres` (`:5432`) and `minio` (`:9000`/`:9001`), plus the one-shot
`install` step (`pnpm install`) and the `mkcert`/`caddy` services that give
the stack an HTTPS origin for tablets (see
[`docs/tablet-https-setup.md`](docs/tablet-https-setup.md)). Health:

```
curl http://localhost:3000/api/health
```

returns `{status, db, queue, storage, libreoffice}`, each `up`.

## Verifying (the merge gate)

There is no CI by policy; `pnpm verify` is the merge gate, run inside the
`tools` container and pasted into every PR:

```
docker compose --profile tools run --rm tools pnpm verify
```

`verify` runs, in order: `lint`, `static` (typecheck), `test:unit` (kernel
and web Vitest, plus this repo's own tooling tests), `test:api` (the api's
Vitest suite, including its `*.integration.test.ts` files against the
compose Postgres and MinIO), and `test:e2e` (Playwright, tagged `@p0`, on
`desktop-chrome` and `durability-desktop-chrome`). Each step can also be run
on its own the same way, for example:

```
docker compose --profile tools run --rm tools pnpm test:unit
docker compose --profile tools run --rm tools pnpm test:api
docker compose --profile tools run --rm tools pnpm test:e2e
docker compose --profile tools run --rm tools pnpm test:e2e:matrix
```

`test:e2e:matrix` runs the full durability suite across desktop Chrome,
Android Chrome emulation and WebKit; it is not part of `verify` and is run
at epic close. `pnpm audit --prod` is not part of `verify` today: it runs
reliably in the `tools` container, but as of this writing it reports one
moderate advisory in a transitive dev-tooling dependency
(`better-auth > drizzle-kit > ... > esbuild`) that is unrelated to this
epic's scope; it is tracked in
`_bmad-output/implementation-artifacts/deferred-work.md` rather than
silently gating every merge on it.

## Seeding test users

There is no signup route and no outbound e-mail: `scripts/seed-users.ts`
(run through the `tools` container, never on the host) is how a company and
its users are provisioned, and how a password is reset.

```
docker compose --profile tools run --rm tools pnpm exec tsx scripts/seed-users.ts --test
```

`--test` provisions the two companies every automated suite seeds itself
with. To provision a real company, pass its fields explicitly (a company id,
a company name, an e-mail, a password, a full name, a council — `crea` or
`crt` — and a registration number; an optional printed title):

```
docker compose --profile tools run --rm tools pnpm exec tsx scripts/seed-users.ts \
  --company-id <uuid> --company "<nome da empresa>" --email <email> \
  --password "<senha>" --name "<nome completo>" --council <crea|crt> \
  --number "<número de registro>" [--title "<título impresso>"]
```

## Running the `prod` profile

The `prod` profile approximates the future cloud image: one container serves
the built web bundle and `/api/*`, migrations run forward-only before it
starts, and logs are JSON lines on stdout. It is Docker-only, like
everything else — build the web bundle inside the `tools` container first:

```
docker compose --profile tools run --rm tools pnpm --filter @app/web build
docker compose --profile prod up migrate
docker compose --profile prod up -d
```

`curl http://localhost:3001/api/health` should return the health JSON.

## Trusting the local HTTPS certificate

Tablets, and a desktop browser that wants the same no-warning origin, need
the mkcert CA installed once. See
[`docs/tablet-https-setup.md`](docs/tablet-https-setup.md) for the full
setup (`TABLET_HOST`, per-device trust steps for iPadOS, Android and
desktop).

## Conventions

- Everything runs in Docker through docker-compose; never install or run a service natively on the machine.
- No emoji anywhere in UI, documents or code comments.
- The user-visible product name is the placeholder `PRODUTO`; the project's internal codename never appears in a user-visible string.
- The backend never uses a personal Claude subscription; local reading providers default to `fake`.
- See `AGENTS.md` for the full set of policies and pointers agents and contributors work from.
