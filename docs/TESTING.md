# Testing

There is no CI: every check runs locally, inside the `tools` container, never on the host. The stack must be up first (`docker compose up -d`; see [DEVELOPMENT.md](DEVELOPMENT.md)).

Every command below has this shape:

```sh
docker compose --profile tools run --rm tools pnpm <script>
```

On a machine with podman the same commands run as `podman compose`. Run gate commands as the `node` user (`run --rm --user node tools ...`), so the run leaves no root-owned file in the workspace. The lock tool is `flock` on Linux and `lockf` on macOS (see "The host lock").

## The stages

| Script | What it runs |
| --- | --- |
| `pnpm lint` | ESLint over the repository |
| `pnpm static` | the typecheck of every package, then the root `tsc` |
| `pnpm test:unit` | one Vitest run over the kernel, web and tooling projects of the root `vitest.config.ts`; no database |
| `pnpm test:api` | the api's Vitest suite, including `*.integration.test.ts`, against the compose PostgreSQL and MinIO, in four lanes (below) |
| `pnpm test:e2e` | the Playwright tests tagged `@p0` on the `desktop-chrome` and `durability-desktop-chrome` projects |
| `pnpm test:e2e:full` | every test of those two projects, whatever its tag (so also `@p1` and `@p2`) |
| `pnpm test:e2e:matrix` | the durability suite on `durability-desktop-chrome`, `durability-android-chrome` and `durability-webkit` |

`lint`, `static`, `test:unit` and `test:api` start with the preflight (`scripts/preflight.ts`), and so do `verify` and every e2e command. It reads the container engine and stops the run when a compose container is restarting in a loop, naming it.

## The full gate: `pnpm verify`

```sh
flock /tmp/fasor-verify.lock docker compose --profile tools run --rm tools pnpm verify
```

`scripts/verify.ts` runs five stages in three phases. The stages of a phase run at the same time, and a phase starts only when the one before passed.

| Phase | Stages |
| --- | --- |
| 1 | `lint`, `static` and `test:api` together |
| 2 | `test:unit` alone |
| 3 | `test:e2e` alone |

The first failure stops the other stages of its phase and every later phase. Each stage's output is written to `test-results/verify/{stage}.log` (`lint.log`, `static.log`, `test-api.log`, `test-unit.log`, `test-e2e.log`), and the run ends with one line per stage (verdict and wall time) and the total.

## What runs when

Decided 2026-11-12 (`AGENTS.md`, "Decisions of record").

**A batch, before its pull request,** runs these and pastes their output in the pull request:

1. `pnpm lint`, `pnpm static`, `pnpm test:unit`.
2. The api suite in its batch form (`pnpm test:api:batch`, below).
3. The Playwright specs the batch touched (below).
4. Only when the batch changes the op fold, the commit path or a live query on the ficha: its touched durability specs on the three matrix projects.

A batch does not run the full `@p0` stage.

**Once per wave, on the integrated branch,** after the wave's pull requests are merged, the coordinator runs one full gate: `lint`, `static`, `test:unit`, the plain `pnpm test:api` (every lane), `pnpm test:e2e:full` and `pnpm test:e2e:matrix`. The same runs again at the epic QA. A red wave gate becomes a fix batch before the next wave. A failure called a flake still needs its failing state explained and a passing isolated run on the same commit.

Load rules on a shared machine: at most two batch stacks up at a time, no Playwright run outside the host lock, and the main checkout's stack stopped (`docker compose stop`, never `down -v`) while batches run.

## The api suite

`pnpm test:api` goes through `scripts/api-suite.ts`. It runs the four lanes of `apps/api/src/test-lanes.ts` (four Vitest projects) in two phases:

| Phase | Run | Vitest projects | How |
| --- | --- | --- | --- |
| 1 | `solo` | `api-solo` | one file at a time, with nothing beside it: a timing budget, the boot upgrades over every company, the legacy test companies |
| 2 | `parallel` | `api` | every test file not listed in another lane, on `PARALLEL_WORKERS` = 4 workers; each worker seeds its own pair of test companies (`apps/api/src/test-setup/test-pair.ts`) |
| 2 | `queue` | `api-serial`, then `api-print` | one file at a time on the fixed pair, beside the parallel run: the files that share the api's one document queue or the fixed-id Porto Seguro fixture, then the print locks and the LibreOffice print checks |

Both phases always run. The command fails when any run failed or when no run had a test file. Each run's output lands in `test-results/api-suite/{run}.log` (`solo.log`, `parallel.log`, `queue.log`), and the command ends with one line per run and the total.

A new api test file that reaches a shared resource (a preview or generate route, a fixed-id fixture, a golden, a boot upgrade) must be listed in a lane of `test-lanes.ts`; `scripts/api-suite.test.ts` fails otherwise.

### The batch form

`pnpm test:api:batch` leaves the `api-print` lane out when the batch changed no path a print can depend on. It reads the changed files from `API_CHANGED_FILES`, which the host fills from git, because a worktree's git directory is not mounted in the container. Run it from the worktree:

```sh
docker compose --profile tools run --rm --user node \
  -e API_CHANGED_FILES="$(git diff --name-only origin/main...HEAD; git diff --name-only HEAD; git ls-files --others --exclude-standard)" \
  tools pnpm test:api:batch
```

The print lane runs whenever a changed path is under `PRINT_TRIGGERS` (`scripts/api-suite.ts`: the render code, the whole kernel, the api modules the print reaches, the api image, the manifests, the lane machinery), and also when `API_CHANGED_FILES` is unset or empty. The first line of the output says which way it went.

### One api file

Any other argument goes to every Vitest run, so a file path (relative to `apps/api`) narrows the suite to that file in whichever lane holds it:

```sh
docker compose --profile tools run --rm tools pnpm test:api src/http/files.integration.test.ts
```

## Playwright

Every `test:e2e*` command goes through `scripts/e2e.ts`. It builds the web bundle once (a development-mode build served by `vite preview` on port 5200), then makes three Playwright runs in order. All three always run, and the command fails when any failed or when no test ran.

| Order | Group | Workers | Specs |
| --- | --- | --- | --- |
| 1 | `parallel` | `PARALLEL_WORKERS` = 2, test by test | every spec not listed in `SERIAL_SPECS` |
| 2 | `queue` | `QUEUE_WORKERS` = 2, test by test | specs that issue or preview a document (the api's one document queue and one LibreOffice), wait on the reading queue, or hold the generate request |
| 3 | `solo` | 1, with nothing beside it | specs that time a tap or a wait against a render, or measure the layout under a quiet CPU |

The constants and `SERIAL_SPECS` are in `e2e/support/groups.ts`; each entry of `SERIAL_SPECS` names its lane and says why.

- `--workers=N` changes the parallel group only. The global setup refuses a run with more workers than a lane allows.
- Each worker works on its own pair of test companies (`workerSeed(index)` in `apps/api/src/db/e2e-worker-seed.ts`; the global setup seeds at least 3 pairs). In the `queue` lane each worker also has its own copy of the small Porto Seguro fixture.
- The leak check (`apps/api/src/db/e2e-leak-check.ts`) runs as the global teardown and fails the run when a worker's user wrote into a company outside its own pair.
- A Playwright action times out after 15 s, a navigation after 30 s and an `expect` after 5 s (`playwright.config.ts`), so a click on a disabled or missing control fails in seconds. A stray `test.only` fails the run.

Tags: `@p0` covers a story's main acceptance criteria. `@p1` and `@p2` cover the secondary ones and run in `test:e2e:full`. A new `@p0` test asserts the committed state (the outbox or the store), not only the screen.

### One spec, or a few

Call the script directly, with the spec paths before the `--project` options:

```sh
flock /tmp/fasor-verify.lock docker compose --profile tools run --rm tools \
  pnpm exec tsx scripts/e2e.ts e2e/auth.spec.ts --project desktop-chrome --project durability-desktop-chrome
```

Do not append a spec path to `pnpm test:e2e` or `pnpm test:e2e:full`: it lands after their `--project` options, and Playwright reads it as a project name. `--grep` can be appended to them:

```sh
flock /tmp/fasor-verify.lock docker compose --profile tools run --rm tools pnpm test:e2e:full --grep "4\.8-E2E|11\.1-E2E"
```

A spec path on which no test ran in any group (a typo, a spec whose every test was skipped) fails the command.

### The matrix

```sh
flock /tmp/fasor-verify.lock docker compose --profile tools run --rm tools pnpm test:e2e:matrix
```

It runs the `*.durability.spec.ts` files on desktop Chrome, Android Chrome emulation and WebKit. For the touched durability specs of a batch:

```sh
flock /tmp/fasor-verify.lock docker compose --profile tools run --rm tools \
  pnpm exec tsx scripts/e2e.ts <specs> --project durability-desktop-chrome --project durability-android-chrome --project durability-webkit
```

### Reports

All under `test-results/`:

| Path | What it holds |
| --- | --- |
| `e2e-report/summary.json` | per group and in total: tests, passed, failed, skipped, flaky, duration, and every test's title with its outcome |
| `e2e-report/{group}.json` | Playwright's JSON report of one group |
| `e2e-report/timings-{group}.json` | where each test spent its time, slowest first (setup helpers appear as `setup: …` steps) |
| `parallel/`, `queue/`, `solo/` | each group's own artifacts |

The automated suites reset the two test companies (`a@teste.local`, `b@teste.local`) and seed the small Porto Seguro fixture under its fixed ids. A sample relatório seeded into a company of your own (`seed-users.ts --sample-relatorio`) has ids derived for that company, so the suites never touch it.

## Unit tests while iterating

```sh
docker compose --profile tools run --rm tools pnpm exec vitest run packages/domain/src/ops/apply.test.ts
```

## The host lock

Only one gate may run on a machine at a time: the runs share the CPU, and several tests time a tap against a render. Wrap `verify`, `test:e2e:full`, `test:e2e:matrix`, any multi-worker run and every Playwright run in the lock:

```sh
# Linux
flock /tmp/fasor-verify.lock <command>
# macOS
lockf -t 20000 /tmp/fasor-verify.lock <command>
```

`infra/bin/deploy` takes the lock itself; do not wrap it.

## The OCR sidecar

The sidecar (`services/ocr`) is under the `ocr` compose profile and outside `verify`. Run its tests, under the lock, for a change to `services/ocr` or to its contract:

```sh
flock /tmp/fasor-verify.lock docker compose --profile ocr build ocr
flock /tmp/fasor-verify.lock docker compose --profile ocr run --rm ocr pytest
```

The image is `linux/amd64`. On an arm64 podman host `podman compose build` ignores that, so build with `podman build --platform linux/amd64 -t app-ocr services/ocr`. The service has an 8 GB memory limit as a bound on a runaway; the full pytest run last peaked at 1.69 GiB (2026-10-29). See [services/ocr/README.md](../services/ocr/README.md).

The sidecar's JSON Schema is exported from `packages/domain/src/contract/ocr.ts` with `pnpm schema:ocr`, and a `test:unit` test fails when the committed schema drifts.

## Infrastructure

Offline, no AWS login:

```sh
infra/bin/check
```

It runs `terraform fmt`, `init` and `validate` for both stacks, tflint and ShellCheck, each in a pinned container. The production smoke test (`pnpm smoke:production`) is part of a release; see [infra/PUBLISHING.md](../infra/PUBLISHING.md).

## Goldens

The Porto Seguro fixture has golden snapshots and documents. A change that alters a generated document regenerates them and explains the diff in the pull request:

```sh
docker compose --profile tools run --rm tools pnpm exec tsx scripts/regen-goldens.ts
```

## Dependency audit

```sh
docker compose --profile tools run --rm tools pnpm audit --prod
```

Not part of `verify`. Known advisories are tracked in `_bmad-output/implementation-artifacts/deferred-work.md`.

## Testing as a person would

The automated suites are necessary, not sufficient. Every feature with a screen is also driven in a real browser at 390, 768 and 1280 px, in dark mode and with the keyboard, before an epic closes. The QA reports and the screenshots they cite live in `_bmad-output/implementation-artifacts/reviews/` and in each epic's folder.
