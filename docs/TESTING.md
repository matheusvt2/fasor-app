# Testing

Every command runs inside the `tools` container, never on the host. The stack must be up (`docker compose up -d`); see [DEVELOPMENT.md](DEVELOPMENT.md).

## The merge gate

There is no CI. A story merges only after `pnpm verify` passes, with its output pasted in the pull request.

```sh
flock /tmp/fasor-verify.lock docker compose --profile tools run --rm tools pnpm verify
```

`scripts/verify.ts` runs in three phases. The first failure stops its phase and every later one.

| Phase | Stages | What they check |
| --- | --- | --- |
| 1 | `lint`, `static`, `test:api` together | ESLint; TypeScript across every package; the api's Vitest suite, including `*.integration.test.ts` against the compose PostgreSQL and MinIO |
| 2 | `test:unit` | one Vitest run over the kernel, web and tooling projects; no database |
| 3 | `test:e2e` | Playwright tests tagged `@p0` on `desktop-chrome` and `durability-desktop-chrome` |

Each stage's log lands in `test-results/verify/`, and the run ends with one line per stage and the total. Expect 30 to 40 minutes on a quiet machine.

Wrap every gate in `flock /tmp/fasor-verify.lock`. Only one gate may run on a machine at a time: they share the CPU, and several tests time a tap against a render.

## One suite at a time

```sh
docker compose --profile tools run --rm tools pnpm lint
docker compose --profile tools run --rm tools pnpm static
docker compose --profile tools run --rm tools pnpm test:unit
docker compose --profile tools run --rm tools pnpm test:api
docker compose --profile tools run --rm tools pnpm test:e2e
```

While iterating, run the narrowest thing:

```sh
# One Vitest file
docker compose --profile tools run --rm tools pnpm exec vitest run packages/domain/src/ops/apply.test.ts
# One api test file
docker compose --profile tools run --rm -w /workspace/apps/api tools pnpm exec vitest run src/http/files.integration.test.ts
# Playwright tests by title, any tag
flock /tmp/fasor-verify.lock docker compose --profile tools run --rm tools pnpm test:e2e:full --grep "4\.8-E2E|11\.1-E2E"
```

Pass `--grep` alone to `test:e2e:full`. A spec path after it is read as a project name and nothing runs.

## Playwright

Every `test:e2e*` command goes through `scripts/e2e.ts`. It builds the web bundle once, then runs two groups and fails when either fails:

- **Parallel group:** test by test. Each worker works on its own pair of companies (`workerSeed(index)`), and a leak check at teardown fails the run when a worker wrote into a company not its own. The default is one worker (`PARALLEL_WORKERS` in `e2e/support/groups.ts`); `--workers=N` overrides it for one run.
- **Serial group:** one worker, for the specs in `SERIAL_SPECS`. These share the document queue, LibreOffice and a fixed-id fixture, or time a tap against a render.

`test-results/e2e-report/summary.json` has the counts per group and every test's outcome. `timings-{group}.json` says where each test spent its time. Playwright actions time out after 15 s and navigations after 30 s, so a missing control fails fast.

| Command | Scope | When |
| --- | --- | --- |
| `pnpm test:e2e` | tests tagged `@p0` | inside `verify` |
| `pnpm test:e2e:full` | every desktop test, any tag | once per wave on the integrated main, and at epic QA |
| `pnpm test:e2e:matrix` | the durability suite on desktop Chrome, Android Chrome emulation and WebKit | once per wave, and on a story that changes the op fold, the commit path or a live query on the ficha |

Tags: `@p0` covers a story's main acceptance criteria and gates the merge. `@p1` and `@p2` cover the secondary ones and run in `test:e2e:full`. A new `@p0` test asserts the committed state (the outbox or the store), not only the screen.

The export, preview and generation specs seed the small Porto Seguro fixture into a test company. If a developer seeded that sample into a company of their own on the same stack, those specs fail at setup. Run them on an isolated stack (DEVELOPMENT.md, "Working in parallel").

## The OCR sidecar

Outside `verify`. Run it, under the lock, for a change to `services/ocr` or to its contract:

```sh
flock /tmp/fasor-verify.lock docker compose --profile ocr build ocr
flock /tmp/fasor-verify.lock docker compose --profile ocr run --rm ocr pytest
```

The tests need about 6 GB of memory. The sidecar's JSON Schema is exported from `packages/domain/src/contract/ocr.ts` with `pnpm schema:ocr`, and a `test:unit` test fails when the committed schema drifts.

## Infrastructure

Offline, no AWS login:

```sh
infra/bin/check
```

It runs `terraform fmt`, `validate` for both stacks, tflint and ShellCheck, each in a pinned container.

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

The automated suites are necessary, not sufficient. Every feature with a screen is also driven in a real browser at 390, 768 and 1280 px, in dark mode and with the keyboard, before an epic closes. The QA reports and screenshots live in `_bmad-output/implementation-artifacts/reviews/`.
