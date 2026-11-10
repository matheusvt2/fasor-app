---
title: 'Chore T3: split the e2e serial group by resource, with per-worker fixture copies'
type: 'chore'
created: '2026-11-09'
status: 'in-review'
baseline_revision: '4992dd8877017be75f50ff976a2cd3f1ce69649c'
route: 'auto'
dev_model: 'opus'
dev_effort: 'high'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-04.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The e2e serial group runs 187 tests on one worker: 30.6 min of the 53.6 min `test:e2e:full` of the 2026-11-09 wave 3 gate. Only 5.9 min of it is generation job time (AD-15 serializes it); the rest is UI work that a second worker could overlap. Two things keep it on one worker: eleven specs load the small Porto Seguro fixture under fixed ids that one company at a time can hold, and the eleven timing specs must not share the CPU.

**Approach:** Chore T3, `sprint-change-proposal-2026-11-04.md` § 4.4 (approved by Matheus 2026-11-09). Each e2e worker company gets its own copy of the fixture under ids derived from the company. The serial group becomes two lanes run after the parallel group: `queue` (document, reading and network-held specs) on two workers with `fullyParallel`, then `solo` (the timing specs) on one worker with nothing beside it.

## Boundaries & Constraints

**Always:**
- AD-15 unchanged: no api, queue, worker or LibreOffice change. Only `e2e/`, `scripts/e2e*.ts`, `playwright.config.ts`, the api's test-support modules under `apps/api/src/db/` (test fixtures, sample remap) and docs change.
- Order is `parallel`, then `queue`, then `solo`; all three always run; the command exits 1 when any lane failed, none ran a test, or a spec path matched no test (TST-V1 stays).
- `--workers=N` reaches the parallel group only. `PARALLEL_WORKERS` stays 2. `queue` always runs on `QUEUE_WORKERS = 2`, `solo` on 1.
- The api suite's `TEST_SEED` companies keep the fixture's fixed ids (`seedPortoSeguroSmall`, `removePortoSeguroSmall`, `generation-time.integration.test.ts` and the other `test:api` callers behave as today).
- A copy's ids are deterministic per company and never equal another company's copy, the fixed ids, or the developer sample's (`sample-relatorio.ts` `sampleId`): use a distinct salt, reusing that file's remap walk (extract a shared helper rather than duplicating it).
- Every assertion the touched specs make is kept; only where an id comes from changes.
- Code, comments and docs in English; no emoji; planning docs and AGENTS.md change by strike-through plus a dated line.

**Never:**
- No spec moves from serial to the parallel group, and no test is removed or skipped.
- No change to the leak check's rule (it must keep failing a write outside the writer's own pair).
- No `down -v`, no docker (podman only), no Playwright run outside `lockf -t 20000 /tmp/fasor-verify.lock`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fixture copy on worker 0 and worker 1 at once | two queue workers each call `resetEmpresaBWithFixture(b)` for their own Empresa B | each company holds its own copy; neither removal touches the other copy | a copy held by a non-test company makes removal throw, as today |
| Copy ids | `smallFixtureCopy(companyId)` | relatório, project, block, cabine, equipment and op ids derived from `companyId`; the fixture's own user id kept; company id = `companyId` | same input, same ids |
| `pnpm test:e2e --workers=3` | | parallel on 3, queue on 2, solo on 1 | |
| Bare `playwright test` with `--workers=2` | no `E2E_GROUP` | refused before seeding | message names the lane rule |
| `E2E_GROUP=queue` with 3 workers, or `E2E_GROUP=solo` with 2 | | refused before seeding | |
| `E2E_GROUP=serial` (old name) | | `readGroup` throws naming the three lanes | |
| A spec path that is only in `solo` | `pnpm test:e2e e2e/tap-budget.spec.ts` | parallel and queue run no test, solo runs it, exit 0 | |

</intent-contract>

## Code Map

- `e2e/support/groups.ts` -- `SERIAL_SPECS` (54 entries, each `{file, why}`), `E2eGroup`, `PARALLEL_WORKERS`, `SERIAL_SPEC_PATTERN`, `NON_SERIAL_SPEC_PATTERN`, `readGroup`, `assertWorkersAllowed`. The lane is `solo` for the 8 files of the `times a tap against a render` spread plus `tap-budget-signal.spec.ts`, `review-layout-interaction-2026-10-08.spec.ts`, `usage-events-documents.spec.ts`; `queue` for every other entry.
- `playwright.config.ts` -- `group`, `groupIgnore`, `label` (report file names `${label}.json`, `timings-${label}.json`), `outputDir`, `workers`, `fullyParallel` (parallel only today).
- `scripts/e2e.ts` -- `groupArgs` (serial gets `withoutWorkers` + `--workers=1`), `runBothGroups`, `combine` (already generic over a list), `main` (calls `runBothGroups`, prints one line per group).
- `scripts/e2e.test.ts` -- `scripts/e2e.ts arguments`, `combining the groups` (`runBothGroups` order test), `the e2e run guards` (`assertWorkersAllowed`), `the e2e groups` (L473-507: shared-resource regex and tap regex must imply serial membership), `tap-timing specs arrange their sync` (L443, filters `SERIAL_SPECS` by `why` text).
- `e2e/support/global-setup.ts` -- calls `assertWorkersAllowed(readGroup(E2E_GROUP), config.workers)`, seeds `max(workers, MIN_WORKER_PAIRS)` pairs.
- `e2e/support/export-fixture.ts` -- `EXPORT_RELATORIO_ID` (fixed), `resetEmpresaBWithFixture(b)`.
- `apps/api/src/db/test-fixtures.ts` -- `seedPortoSeguroSmall`, `removePortoSeguroSmall` (deletes by fixed op ids, relatório id, project id, entity ids, across holder companies; refuses a foreign holder).
- `apps/api/src/db/sample-relatorio.ts` -- `FIXTURE_ID` regex, `sampleId`, `remapText`, `remapValue`, `sampleRelatorioLog`: the remap to reuse with a salt.
- `apps/api/src/db/test-fixtures.integration.test.ts` -- existing coverage of the fixture seed/removal; extend it for copies.
- `packages/domain/fixtures/porto-seguro/small/op-log.ts` -- `fixedId`, `RELATORIO_ID`, `CABINE_ID`, `EQUIPMENT_CHAVE_ID`, `BLOCK_CHAVE_ID`, `BLOCK_TRANSFORMADOR_ID`, `portoSeguroSmall.log` (no `file` ops). Read-only.
- The 11 fixture specs: `display-shots`, `export-visual`, `export`, `na-number-field`, `parecer-export`, `photo-numbers`, `photo-order`, `review-field-defects-2`, `section-7-by-hand`, `status-flow-2026-10-10`, `usage-events-documents` (`.spec.ts`). They use `EXPORT_RELATORIO_ID` and, five of them, `BLOCK_CHAVE_ID`, `BLOCK_TRANSFORMADOR_ID`, `CABINE_ID`, `EQUIPMENT_CHAVE_ID`, `portoSeguroSmall.log` from the domain fixture.
- No serial spec uses `describe.serial`, `describe.configure` or `beforeAll` (checked 2026-11-09), so `fullyParallel` is safe in `queue`; every test resets its own worker's pair.
- `apps/api/src/db/e2e-leak-check.ts`, `e2e/support/global-teardown.ts` -- unchanged; must pass with two queue workers.
- Docs: `AGENTS.md` "Running and verifying" (the `scripts/e2e.ts` paragraph names the serial group and `SERIAL_SPECS`), `docs/kbs/workflow/e2e-testing.md`, `docs/kbs/log.md`.

## Tasks & Acceptance

**Execution:**
- `apps/api/src/db/sample-relatorio.ts` -- extract the remap walk into an exported `remapFixtureLog(companyId, deriveId)` (or equivalent); `sampleRelatorioLog` keeps its exact output -- one walk for both.
- `apps/api/src/db/test-fixtures.ts` -- add `smallFixtureCopy(companyId)` returning `{ relatorioId, projectId, cabineId, equipmentChaveId, blockChaveId, blockTransformadorId, id(original), log }` with ids derived by a salted hash distinct from `sampleId`; `seedPortoSeguroSmall` and `removePortoSeguroSmall` take an option to work on the company's copy (removal scoped to that company and that copy's ids), defaulting to today's fixed-id behavior for `test:api`.
- `apps/api/src/db/test-fixtures.integration.test.ts` -- two worker companies seeded with copies at once; each removal leaves the other copy whole; copy ids differ from the fixed and sample ids.
- `e2e/support/export-fixture.ts` -- `resetEmpresaBWithFixture(b)` seeds `b`'s copy and returns its `smallFixtureCopy`; drop `EXPORT_RELATORIO_ID`.
- The 11 fixture specs -- take every fixture id from the returned copy (module-level helpers get it as a parameter); no fixed fixture id left in `e2e/`.
- `e2e/support/groups.ts` -- each serial entry gets `lane: 'queue' | 'solo'`; `E2eGroup = 'parallel' | 'queue' | 'solo'`; `QUEUE_WORKERS = 2`; per-lane spec patterns plus a non-serial pattern; `readGroup` accepts the three names; `assertWorkersAllowed(group, workers)` allows parallel any, queue up to `QUEUE_WORKERS`, solo and undefined 1. Rewrite the header and the `why` texts that say "one worker" only where now false; add a dated comment (2026-11-09, chore T3) with the measurement.
- `playwright.config.ts` -- per-lane `groupIgnore`, `workers`, `fullyParallel` (parallel and queue), `outputDir`, report names by lane.
- `scripts/e2e.ts` -- `runGroups` runs the three lanes in order (always all); `groupArgs` per lane; `main` and the header comment updated; `summary.json` lists the three lanes.
- `scripts/e2e.test.ts` -- lane order (a failed lane does not skip later ones), per-lane args with and without `--workers`, `assertWorkersAllowed` per lane and the old `serial` name refused, every tap-timing spec in `solo`, every generate/fixture spec in `queue` or `solo`, a spec in exactly one lane, and no e2e file importing the domain fixture's fixed id constants for navigation (or naming `EXPORT_RELATORIO_ID`).
- `AGENTS.md`, `docs/kbs/workflow/e2e-testing.md`, `docs/kbs/log.md` -- describe the lanes; strike the old sentences and add dated lines.

**Acceptance Criteria:**
- Given two queue workers running fixture specs at once, when both have loaded their Empresa B's copy, then each spec sees only its own relatório and the run's global teardown leak check passes.
- Given `pnpm test:e2e:full`, when it runs, then the log shows the parallel, queue (2 workers) and solo (1 worker) Playwright runs in that order, and `summary.json` and `timings-{parallel,queue,solo}.json` name each lane with its tests and duration.
- Given a lane that fails, when the run ends, then the later lanes still ran and the command exits 1.
- Given `test:api`, when it runs, then the fixed-id fixture tests pass unchanged.

## Design Notes

Measured baseline (wave 3 gate, main `ef099d41`): serial 187 tests 30.6 min; queue-lane candidates 145 tests (document 124, reading 18, network-held 3) summing 24.9 min with 5.9 min of generation jobs; solo 42 tests 5.2 min. A longest-first schedule on two workers gives a queue lane of 12.5 to 16.2 min.

Copy id derivation, shape only:

```ts
const copyId = (companyId: string, original: string) => derive(`e2e-copy:${companyId}:${original}`, original); // keeps the uuidv7 shape
```

## Verification

**Commands (inside the worktree, `podman compose`, tools container with `--user root`):**
- `podman compose --profile tools run --rm --user root tools pnpm lint` -- expected: clean
- `podman compose --profile tools run --rm --user root tools pnpm static` -- expected: clean
- `podman compose --profile tools run --rm --user root tools pnpm test:unit` -- expected: green, `scripts/e2e.test.ts` included
- `lockf -t 20000 /tmp/fasor-verify.lock podman compose --profile tools run --rm --user root tools pnpm exec vitest run --project api apps/api/src/db/test-fixtures.integration.test.ts` (or the api suite's equivalent filter) -- expected: green
- `lockf -t 20000 /tmp/fasor-verify.lock podman compose --profile tools run --rm --user root tools pnpm exec tsx scripts/e2e.ts <the 11 fixture specs> --project desktop-chrome --project durability-desktop-chrome` -- expected: green on the queue lane's two workers, leak check clean
