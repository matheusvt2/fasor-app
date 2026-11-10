# Sprint change proposal: test-suite speed after Epic 20 (2026-11-04)

Prepared in the correct-course workflow at Matheus's request ("faca um course correction"), after the test-architect (TEA) investigation of the same day. Mode: batch, the way Matheus ran the session. Status: ~~**proposed**, awaiting Matheus's approval.~~ *(2026-11-04, Matheus: **approved** as written ("aprovo"); the direct pushes of section 4.3 were a one-off ("so agora").)*

## 1. Issue summary

**Trigger.** Matheus, 2026-11-04: "os testes demoram muito, investigue a necessidade de todos eles". No story triggered it. The suite grew with Epics 13 to 20. The epic retrospectives run `test:e2e:full` as the wave and deploy gate, and it now takes 39 minutes.

**Category.** A technical limitation of the test infrastructure. No product requirement changes.

**Evidence.** All figures below come from the run artifacts.

| Measure | Value | Source |
| --- | --- | --- |
| `test:e2e:full` on `10e87157` | 570 tests, 2360 s wall (39 min) | the e20h deploy gate, `test-results/e2e-report/summary.json` |
| Parallel group | 403 tests, 17.3 min on 2 workers (32.7 min summed) | `timings-parallel.json` |
| Serial group | 167 tests, 22.0 min on 1 worker | `timings-serial.json` |
| `pnpm verify` `@p0` stage | parallel 248 tests 669 s, serial 91 tests 713 s | an Epic 20 batch's `test-results/verify/test-e2e.log` |
| `test:unit` | 5020 tests, 198 s | same batch |
| `test:api` | 809 tests, 327 s | same batch |

Unit and api are healthy, at about 40 ms per test. The e2e groups carry the time. The serial group runs on one worker, so its 167 tests cost more wall time than the 403 parallel ones.

**What the investigation found, test by test.**

1. **Real-time waits on the 60 s sync tick.** This breaks decision C-4 (2026-09-21).
   - Five tests waited for `data-pending="0"` with `SYNC_CYCLE_TIMEOUT` until the automatic cycle drained the outbox, 58 to 59 s each: templates 3.4-E2E-001, 15.5-E2E-001 and 15.5-E2E-002; local-painel-coluna 14.2-E2E-001 and 14.2-E2E-002.
   - **Fixed on main `8dda538c`.**
2. **Real-time waits on reading ages.**
   - 13.5-E2E-004 spent 128 s of real time to cross the 120 s fast-poll window and one 60 s cycle.
   - 13.5-E2E-001, -003, -006 and R8CAP-E2E-005 each spent about 10 s waiting for the 10 s "Cancelar" point; R8CAP-E2E-005 did it twice.
   - These now install `page.clock` and fast-forward, as a tablet lid closed and reopened would.
   - **Fixed on main `8dda538c` and `aa5bfff2`.**
3. **The serial group is mostly bound for a real reason.** Each serial test was classified by what it calls (documents, fixture, timed taps, reading jobs):

   | Kind | Tests | Summed time | Serial needed? |
   | --- | --- | --- | --- |
   | Generate a document (one pg-boss queue, one LibreOffice) or time a tap against a render | 59 | 660 s | Yes |
   | Real reading jobs (`*-pipeline`, `plate-every-type`) | about 16 | about 215 s | Yes; 9.2-E2E-004 waits 65 s on purpose, to prove the flow with no tap |
   | Layout measured at fixed viewports (`review-layout-copy-3`, `review-layout-interaction-2026-10-08`) | 30 | 76 s | Doubtful; a fixed-viewport box does not depend on CPU load, only a timed tap does |
   | Tests in serial files that touch neither the queue nor the fixture | about 45 | about 130 s | No, but moving them saves about 1 min |

4. **Generation itself is the floor of the serial group.**
   - AD-15 fixes generate concurrency at 1 per api instance: `libreoffice.ts` chains every soffice run.
   - ~~A generating test spends about 9.5 s between "Gerar relatório" and the "Revisão N pronta" toast. Across the serial suite that is most of the 660 s.~~ *(2026-11-04, spike `_bmad-output/test-artifacts/generation-timing-2026-11-04.md`: 9.5 s is the p90, read off the slow tail; the device's own press-to-ready median over 110 generations is 3.4 s, so the generations are about 3 min of the serial group's 22.)*
   - The 9.5 s includes at least:
     - the DOCX build;
     - two or three soffice spawns per job; the profile is kept warm (A-17), but the process is not;
     - the device's 3 s poll of the job (`GenerateWatcher`, `pollMs = 3000`).
   - ~~Nobody has measured the breakdown.~~ *(2026-11-04, T2 review: wrong. The job already logs one `generate timing` line with `stages_ms` (`apps/api/src/jobs/generate/job.ts`, Story 14.10 part 4), `job-timing.test.ts` covers it and `generation-time.integration.test.ts` asserts per-stage targets from it. What is unmeasured is the device side after the job (the 3 s poll and the pull) and the soffice spawn inside the conversion stage.)*

**What changed in the recommendation during the analysis.** The TEA reading first named "per-worker ids for the Porto Seguro fixture, so the document specs run on two workers" as the remaining big lever (5 to 6 min). It is not, because of AD-15. Two workers would overlap only the UI part of each document test; the generations would still queue one after the other. ~~The honest estimate is 1 to 2 min, with the flakiness history `e2e/support/groups.ts` records for every raise in load.~~ *(2026-11-09, chore T3 § 4.4: measured wrong. The generations are 5.9 min of job time in a 30.6 min serial group; the other 24 min are UI work that two workers overlap. The estimate is 9 to 13 min.)* The real lever is the time of one generation, and it needs measuring before it is changed.

## 2. Impact analysis

**Epics and stories.** No product epic changes, and no merged story is reopened. Epic 20 is done, with its optional retrospective pending. The work below is a test-infrastructure chore, like batch T (`spec-test-speed.md`, 2026-09-27).

**PRD, `SPEC.md`, `EXPERIENCE.md`, `DESIGN.md`.** No conflict.

**Architecture.**
- **AD-15 (generate concurrency 1 per instance).** It stays. The spike in section 4.2 may propose a warm soffice process inside the same rule (still one conversion at a time). That would change how a conversion runs, not how many run at once. Any such change is costed and proposed on its own, never folded into a test chore.

**Other artifacts.**

| Artifact | Impact |
| --- | --- |
| `docs/kbs/workflow/e2e-testing.md` line 14 | Stale since 2026-10-08: it says `PARALLEL_WORKERS` is 1; it is 2 (`e2e/support/groups.ts`) |
| `scripts/e2e.test.ts` | Has no guard against a spec waiting for the 60 s tick (the pattern decision C-4 forbids); one is added |
| `e2e/support/groups.ts` | The two `review-layout-*` entries move out, if the validation in section 4.1 holds |
| `AGENTS.md` Policy | "main receives only merged story PRs": the two fixes of 2026-11-04 went to main directly, on Matheus's word ("nao precisa criar historia e branch, como eh um fix pode fazer tudo aqui"). Recorded below; Matheus decides whether it is a standing rule |
| `_bmad-output/implementation-artifacts/deferred-work.md` | One row for the spike's outcome, if the spike is deferred |

**Technical impact.** Only test code and test documentation, plus a measurement of the api's generate job. No production behavior changes under this proposal.

## 3. Recommended approach

**Direct adjustment:** one small chore batch (T2) and one measured spike. Nothing is rolled back and the MVP scope is unchanged.

| Option | Verdict | Why |
| --- | --- | --- |
| Direct adjustment (T2 chore and generation spike) | **Recommended** | Low effort, low risk, keeps every behavior tested end to end |
| Per-worker fixture ids, document specs on two workers | ~~Not now~~ *(2026-11-09, Matheus: approved as chore T3, § 4.4, "pode fazer 1 e 2 ja")* | ~~1 to 2 min, because AD-15 serializes the generations; adds load-sensitive flakiness~~ *(2026-11-09: the wave 3 gate measured 5.9 min of generation in 30.6 min of serial wall time, so 9 to 13 min; the tap-timing specs keep one worker to themselves)* |
| Drop the DOCX tails of the per-type specs (`cta`, `qgbt`, `seed-v9`, `seed-v10`, `action-plan`, …) | Rejected | The api `docx-*.test.ts` files cover the content, but this saves only 1 to 2 min, and each tail is its story's end-to-end proof, which `AGENTS.md` requires ("Nothing ships untested") |
| Move the ~45 queue-free tests out of serial files | Rejected | About 1 min for a split of eleven spec files |
| Retag `@p0` (322 tests, 63 % of the suite) | Not now | The story gate (E11-A1) already runs only the touched specs; `@p0` runs once per wave |

**Effort and risk.**
- **T2:** low effort, low risk. It is a guard, a doc fix, and one group move behind a five-run validation.
- **Spike:** low effort, because it only measures. Any change it proposes is costed on its own.

**Expected gain.**
- **Already on main:** about 6.3 min off `test:e2e:full`, about 3.5 min of them in the wave's `@p0`.
- **T2:** about 1 min off the serial group, and no regression of the C-4 pattern.
- **Spike:** unknown until measured. If a warm soffice and a shorter device poll saved 3 to 4 s per generation, the serial group would lose 3 to 4 min.

## 4. Detailed change proposals

### 4.1 Chore batch T2: keep the suite from waiting on real time

**Dev model:** opus · **Effort:** medium

Proposed spec file: `_bmad-output/implementation-artifacts/spec-test-speed-2.md`, built with `bmad-build`.

**Acceptance criteria.**

1. **C-4 guard.** A `test:unit` test in `scripts/e2e.test.ts` fails when an ~~`e2e/*.spec.ts` file~~ e2e source *(2026-11-04, T2 review: every `e2e/**/*.ts` but `support/sync.ts` and the production smoke)* waits for the sync badge's `data-pending` with `SYNC_CYCLE_TIMEOUT`, or with any timeout of 30 s or more. The failure message names the file and line and says to use `syncNow` or `syncNowAndReturn`. `e2e/support/sync.ts` stays exempt.
2. **Layout specs out of the serial group, only if they hold.**
   - Each of `review-layout-copy-3.spec.ts` and `review-layout-interaction-2026-10-08.spec.ts` runs five times in the parallel group on two workers (`--repeat-each 5`), on the idle VM under the host lock.
   - Five green runs of each: its `SERIAL_SPECS` entry is removed, with a dated comment naming the runs.
   - Any red run: the entry stays, and its `why` gains the failing test and the date.
3. **KB.** `docs/kbs/workflow/e2e-testing.md` line 14 reads `PARALLEL_WORKERS` 2, with the 2026-10-08 validation and the date. `docs/kbs/log.md` gains the entry.
4. **Gate.** `lint`, `static`, `test:unit` and the moved specs pass, and their output goes into the PR.

**Definition of ready:** this proposal approved.

**Definition of done:**
- AC 1 to 4 met.
- The serial and parallel group times of the next `test:e2e:full` are recorded in the PR or the wave record, against this proposal's baseline (serial 22.0 min, parallel 17.3 min).

### 4.2 Spike: where a generation's 9.5 s goes

**Dev model:** opus · **Effort:** high

**Goal.** Measure one generation of the small Porto Seguro fixture, phase by phase. No product code change.

**Questions to answer.** *(2026-11-04, T2 review: start from the job's existing `generate timing` line and `generation-time.integration.test.ts`; the spike adds the device-side wait and the spawn share.)*
- From the press to the "Revisão N pronta" toast, how much time goes to each phase? The phases are: the generate request, the queue pickup, the DOCX build, each soffice conversion, certificate rasterization, the storage upload, the job's status op, and the device's poll and pull.
- Use the api's job log timestamps and the `timings-*.json` steps.
- What would a persistent soffice process (one conversion at a time, AD-15 unchanged) save per conversion? What would it cost in memory on the AWS instance, against the USD 100 per month ceiling?
- Would a shorter `GenerateWatcher` poll, or a nudge on the job's status op, shorten the device-side wait without load on the api?

**Output.** A short findings note in `_bmad-output/test-artifacts/`. *(2026-11-04: done, `_bmad-output/test-artifacts/generation-timing-2026-11-04.md`. Median press to ready 3.4 s: queue pickup about 1.0 s (pg-boss polls every 2 s), job 1.3 s, device poll about 1.1 s (3 s interval). A persistent soffice is not worth it. A pickup of 0.5 s or NOTIFY plus a 1 s device poll would bring it to about 1.7 s; that is a product story for Matheus to decide.)* If a change is worth making, a story proposal in `epics.md` with its own acceptance criteria and its cost line. Because a faster generation helps every field user as well as the suite, that story belongs to the product backlog, not to a test chore.

### 4.3 Record of the direct pushes (AGENTS.md)

`AGENTS.md`, "Decisions of record", one new line:

*(2026-11-04: superseded by the line as committed to `AGENTS.md`, which adds "a one-off exception to the Policy, not a standing rule" and "Everything after them goes through a branch and a PR".)*

> - 2026-11-04, Matheus: two test-only fixes went to main without a story or PR ("nao precisa criar historia e branch, como eh um fix pode fazer tudo aqui"): `8dda538c` (five tests on the 60 s sync tick, 13.5-E2E-004 on real time) and `aa5bfff2` (four 10 s reading-age waits). Each ran its touched specs green (33 of 33; 32 of 32 with `--repeat-each 2`), with lint and static clean, before the push. Source: `sprint-change-proposal-2026-11-04.md`.

~~**Open decision for Matheus:** is this a standing rule?~~ *(2026-11-04, Matheus: a one-off, "so agora". The Policy is unchanged; T2 and anything after it go through a branch and a PR. The struck text below is kept for the record.)*

~~For example: "a change limited to `e2e/` test code, which removes no assertion, may go to main directly after its touched specs pass." Or was it a one-off? If it is standing, the Policy line "One branch and one pull request per story" gains it beside the date, struck-through style per the planning-document rule.~~

### 4.4 Chore T3: split the serial group by resource (added 2026-11-09)

**Dev model:** opus · **Effort:** high

Approved by Matheus on 2026-11-09 ("pode fazer 1 e 2 ja"). Spec: `_bmad-output/implementation-artifacts/spec-t3-serial-split.md`, built with `bmad-build-auto` on branch `t3-serial-split`.

**Why the 1 to 2 min estimate of § 3 was wrong.** It assumed the generations were most of a document test. The wave 3 gate of 2026-11-09 (main `ef099d41`, `test:e2e:full`, 651 tests, 53.6 min wall, load 5 to 7) says otherwise. Its serial group ran 187 tests in 30.6 min on one worker; each test was matched to the api's `generate timing` lines and the device's `ux_event` waits inside its window:

| Class | Spec files | Tests | Time | Share | Generation job time |
| --- | --- | --- | --- | --- | --- |
| Issue or preview a document (queue and LibreOffice; 10 also load the fixed-id fixture, the 11th is `usage-events-documents`) | 46 | 124 | 20.9 min | 69 % | 5.9 min (78 jobs) |
| Time a tap against a render, or measure the CPU (8 tap specs, `tap-budget-signal`, `review-layout-interaction-2026-10-08`, `usage-events-documents`) | 11 | 42 | 5.2 min | 17 % | 0.04 min |
| Real reading jobs (`*-pipeline`, `plate-every-type`) | 4 | 18 | 3.9 min | 13 % | none (3.1 min of reading waits) |
| Hold the generate request at the network (`loading-states`) | 1 | 3 | 0.1 min | 0.3 % | none |

So a document test is about 28 % generation and 72 % UI work (sign-in 1.6 min, pushed drafts 0.9 min, sync 0.9 min across the group, then the screens). AD-15 still serializes the 5.9 min of jobs; two workers overlap the rest. A longest-first schedule of the 145 tests that need no quiet CPU on two workers gives 12.5 min at the measured speed and 16.2 min with every test 30 % slower under the extra load. The 42 timing tests add 5.2 min alone. The estimate is a serial phase of 18 to 21 min against 30.6 min: **9 to 13 min saved**, above the 5 min bar set before building.

**Lanes.** The serial group becomes two lanes, run after the parallel group in this order:

1. `queue`: the document, reading and network-held specs on two workers, `fullyParallel` (no serial spec uses `describe.serial` or `beforeAll`). Each worker works on its own pair and on its own copy of the small Porto Seguro fixture. Generation stays at concurrency 1 (AD-15 unchanged); the queue orders the jobs while the UI work overlaps.
2. `solo`: the eleven timing specs on one worker, after the `queue` lane has ended, so nothing runs beside them.

**Acceptance criteria.**

1. **Per-worker fixture copies.** Given an e2e worker company, when its spec loads the small Porto Seguro fixture, then it gets a copy whose every id (op, entity, relatório, project, block, cabine, equipment) is derived from that company, and loading or removing it never touches another company's copy. The api suite's `TEST_SEED` companies keep the fixed ids. The specs take the copy's ids from one helper, never from the fixture's constants.
2. **Lanes.** `e2e/support/groups.ts` names each serial spec's lane and resource. `scripts/e2e.ts` runs `parallel`, then `queue` on two workers, then `solo` on one worker, always all three, and fails when any failed. `--workers=N` still reaches the parallel group only, and `PARALLEL_WORKERS` stays 2.
3. **Guards.** The global setup refuses a run that would put a `queue` spec beside more than the lane's workers, or a `solo` spec beside any other worker. The `test:unit` guards still keep every spec that generates, previews or loads the fixture out of the parallel group, and every tap-timing spec in `solo`.
4. **Leak check.** The global teardown's leak check still fails a run where a worker's user wrote outside its own pair, and it passes on the two-worker `queue` lane.
5. **Reports.** `summary.json` holds one entry per lane (tests, outcomes, duration, start time), and each lane writes its own `timings-{lane}.json` and JSON report.
6. **Unit coverage.** `scripts/e2e.test.ts` covers the lane order, each lane's worker count with and without `--workers`, the combined exit code, the setup refusal and the fixture id derivation.
7. **Docs.** `AGENTS.md` "Running and verifying", `docs/kbs/workflow/e2e-testing.md` and `docs/kbs/log.md` describe the lanes, struck through and dated where they change.

**Definition of ready:** this section approved (2026-11-09) and the wave 3 baseline recorded above.

**Definition of done:**
- AC 1 to 7 met; `lint`, `static` and `test:unit` green, output in the PR.
- Two `pnpm test:e2e:full` runs on the branch under the host lock, each recorded in the PR with the `queue` and `solo` wall times, the whole run's wall time and the load line, against this baseline (serial 30.6 min, total 53.6 min).
- A test red under the new lanes and green alone is fixed, or its spec goes back to `solo` with a dated `why`.

## 5. Implementation handoff

**Scope: Minor.** The Developer agent implements directly. No backlog reorganization and no PM or Architect replan.

| Item | Owner | Done when |
| --- | --- | --- |
| 4.1 Chore T2 | Developer (`bmad-build`, opus · medium) | AC 1 to 4 met, gate output in the PR |
| 4.2 Generation spike | Developer or TEA (opus · high) | Findings note written; a costed story proposal only if worth it |
| 4.3 Decision-of-record line | Coordinator | The line added to `AGENTS.md` (2026-11-04, a one-off; no Policy amendment) |
| 4.4 Chore T3 (added 2026-11-09) | Developer (`bmad-build-auto`, opus · high) | AC 1 to 7 met, two `test:e2e:full` runs recorded in the PR |

**Success criteria.**
- No spec waits for the sync tick again; the guard proves it in `test:unit`.
- The next `test:e2e:full` records its group times against the baseline.
- No assertion is removed and no behavior is left without its end-to-end test.

## Checklist record

| Item | Status | Note |
| --- | --- | --- |
| 1.1 Trigger | [x] | Matheus's request, 2026-11-04; no story |
| 1.2 Problem | [x] | Technical limitation of the test infrastructure |
| 1.3 Evidence | [x] | Run artifacts, section 1 |
| 2.1 to 2.5 Epics | [N/A] | No product epic changes; Epic 20 done |
| 3.1 PRD | [N/A] | No conflict |
| 3.2 Architecture | [x] | AD-15 bounds the parallelization; kept |
| 3.3 UX | [N/A] | No conflict |
| 3.4 Other artifacts | [!] | KB stale; C-4 guard missing; decision-of-record line |
| 4.1 Direct adjustment | Viable | Recommended |
| 4.2 Rollback | Not viable | The fixes on main are kept |
| 4.3 MVP review | Not needed | Scope unchanged |
