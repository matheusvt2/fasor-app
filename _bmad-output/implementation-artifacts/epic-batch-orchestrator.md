# Epic batch orchestrator instructions

Shared by every batch orchestrator of an epic delivery. Written 2026-09-26 for Epic 8 from the Epic 5, 6 and 12
instruction files, which lived in session scratchpads; this tracked copy folds in the standing process rules of
E4-A8, E5-A6, E5-A7, E6-A2, E6-A7, E12-A5 and E12-A6. The launch prompt of each batch names the epic `<N>`, the
batch tag `<tag>`, the port base `<P>`, the branch, the stories or items, the Dev model and effort, the PR title and
the epic specifics. The launch prompt wins over this file where they differ.

You are the orchestrator of ONE batch, running unattended inside your own git worktree (your current working
directory). The coordinator (the parent session) merges PRs, edits `sprint-status.yaml` and `epics.md` (unless the
launch prompt hands you `epics.md` explicitly), and runs the integrated review. You build, self-review, verify and
open the PR.

Token economy is a hard requirement (Matheus: batched stories, fewer and shorter agents). Every rule marked (TOKEN)
exists to cut cost; follow it even when a workflow step suggests more.

## 1. Worktree setup (before any compose command)

Create, git-ignored:

- `.env`:
  ```
  COMPOSE_PROJECT_NAME=fasor-<tag>
  COMPOSE_FILE=docker-compose.yml:compose.local.yml
  CADDY_HTTP_PORT=<P>080
  CADDY_HTTPS_PORT=<P>443
  API_PROD_PORT=<P>001
  ```
- `compose.local.yml` (add `compose.local.yml` to `.git/info/exclude`); ports stay below 65535:
  ```yaml
  services:
    postgres:
      ports: !override
        - '127.0.0.1:<P>032:5432'
    minio:
      ports: !override
        - '127.0.0.1:<P>090:9000'
        - '127.0.0.1:<P>091:9001'
    install:
      image: app-api-<tag>
    api:
      image: app-api-<tag>
      ports: !override
        - '127.0.0.1:<P>030:3000'
    web:
      image: app-api-<tag>
      ports: !override
        - '<P>073:5173'
    migrate:
      image: app-api-<tag>
    api-prod:
      image: app-api-<tag>
      ports: !override
        - '127.0.0.1:<P>001:3000'
    tools:
      image: app-tools-<tag>
  ```
  A service your batch adds to `docker-compose.yml` with a host port gets its `!override` here too.
- `_bmad/custom/config.user.toml`:
  ```
  [core]
  communication_language = "Portugues-BR"
  user_skill_level = "intermediate"
  ```
- Branch: `git fetch origin`, then `git switch -c <branch> origin/main`. Your worktree must contain the commit the
  launch prompt names.

Everything runs in Docker. Never run pnpm, node, python or a service on the host.

## 2. Run bmad-build-auto

Run exactly once, from your worktree root (absolute path of the worktree as `{project-root}`):

```
uv run --no-cache "<worktree>/_bmad/scripts/render_skill.py" --project-root "<worktree>" --skill "<worktree>/.claude/skills/bmad-build-auto"
```

Read and follow the one `workflow.md` it prints, with the intent given in your launch prompt, and with these
overrides (they win over the workflow text):

### Model policy (the auto workflow does not load `_bmad/custom/bmad-build.toml`)

- The spec frontmatter gets `dev_model`, `dev_effort` from your launch prompt and `warnings: ['batched']` plus one
  line saying why the stories were batched.
- Step 3 launches the implementation subagent with `subagent_type` = `bmad-dev-<dev_model>-<dev_effort>` and
  `model` = `<dev_model>`, with the standard prompt ("Read {spec_file} fully and implement it...") plus "report in
  under 300 words".
- Fable and sonnet are retired: every subagent runs on opus. Effort floor is medium.

### (TOKEN) Planning

- Step 1: `epic-<N>-context.md` is valid; load it as the planning context. Do not load the PRD, the architecture
  spine, EXPERIENCE.md or DESIGN.md whole. Read only the story sections of `epics.md` named in your launch prompt,
  and grep the named rules (FR-*, AR-*, AD-*, UX-DR*) when you need their exact text.
- Mockups: never read a mock HTML whole. `grep -n` the class names and headings you need, then read those line
  ranges only. `tokens.css` and `components.css` are already in `apps/web/src/styles`; read rules there by grep.
- Step 2: at most one investigation subagent, model `opus`, with a precise question. Prefer targeted reads
  yourself (`grep -rn`, `sed -n 'a,bp'`).
- Write one spec for the whole batch at `_bmad-output/implementation-artifacts/spec-<batch-slug>.md`, at most about
  250 lines: I/O matrix, code map, tasks, ACs in Given/When/Then; cite paths instead of pasting passages.
- Numeric AC targets (taps, keys, times, counts) are recomputed against the decisions of their source document
  before the spec is marked ready; a mismatch is an open question, not a silent change (E12-A5).
- Every AC that crosses batches names its wiring owner in the spec: this batch, or the named later batch with a
  `deferred-work.md` entry (E4-A8).

### (TOKEN) Review (step 4)

- Run only two review layers: **Edge Case Hunter** and **Verification Gap Reviewer**, with `model` =
  `<dev_model>`. Announce Blind Hunter and Intent Alignment as skipped: "token economy; the integrated epic review
  covers them".
- At most ONE review-fix loop. Findings left after that go into the spec's deferred list and the PR body as
  "known open", not into another loop.

### (TOKEN) Commands and output

- Never let full test or build output into your context. Redirect to a log and read the tail.
- The machine runs ONE gate at a time (E6-A2): wrap every `pnpm verify`, `pnpm test:e2e:full` and
  `pnpm test:e2e:matrix` in the host lock. ~~Run it in the foreground.~~ *(2026-09-29, E9-A3: agents blocking a
  stream on `flock` were killed by the 600 s watchdog.)* Never block a tool call on the lock or the gate. Start the
  gate with `run_in_background: true`, writing the lock wait and the exit code into a tagged log:
  `(t0=$(date +%s); flock /tmp/fasor-verify.lock sh -c 'echo LOCKED_AFTER=$(( $(date +%s) - '$t0' ))s; docker compose --profile tools run --rm tools pnpm verify'; echo EXIT=$?) > /tmp/verify-<tag>.log 2>&1`
  then poll with short foreground calls of at most 60 s each (`timeout 55 sh -c 'until grep -q EXIT= /tmp/verify-<tag>.log; do sleep 5; done'; tail -3 /tmp/verify-<tag>.log`),
  repeated until the EXIT line appears, and read `tail -60` of the log. Run
  `grep -n -E 'FAIL|failed|Error' /tmp/verify-<tag>.log | head -40` only when it failed. Never end your turn to wait.
- (E9-A3) Every helper script, log or scratch file of a batch carries the batch tag in its name
  (`/tmp/verify-<tag>.log`, `<worktree>/.scratch-<tag>/`, excluded in `.git/info/exclude`); never write a shared
  name. *(2026-10-28, E17-A5: ~~`/tmp/verify-<tag>.log`~~ every log, including the gate's, lives inside
  `<worktree>/.scratch-<tag>/`, never in `/tmp`: a macOS update rebooted the machine during the Epic 17 wave A
  rerun and wiped `/tmp` with the gate log and the orchestrator outputs.)* Reports go only to your parent. Record the lock wait (`LOCKED_AFTER`) and the gate time in the PR body.
- (E9-A2) Never open a PR, and the coordinator never merges one, with a red or partial gate pasted. A failure called
  a flake needs its failing state explained and a green full `verify` on the same commit. A PR that merges main after
  its gate re-runs the full `verify` before the merge.
- While iterating, run the narrowest suite (`pnpm test:unit -- <path>`, one Playwright spec with `--grep`), not the
  whole gate. Run the full `pnpm verify` once at the end, and once more only if you merged a changed main.
- ~~A batch that touches the sheet, an overlay or shared layout also runs `pnpm test:e2e:full` (under the lock)
  before its PR, and so does the epic's last story PR (E6-A2).~~ *(2026-09-30, Matheus, split gate E10-A1: a batch
  runs `pnpm verify` plus the Playwright specs it touched, targeted; `test:e2e:full` and the full matrix run once per
  wave on the integrated main, launched by the coordinator, and at the epic QA.)*
- (2026-10-08, Matheus, E11-A1, story gate) The batch gate is lint, static, test:unit, test:api and the Playwright
  specs the batch touched (plus its touched durability specs on the matrix projects under the E10-A4 condition); the
  batch does NOT run the full `@p0` stage. Wherever this file says "the full `pnpm verify`" for a batch, read "the
  story gate". The coordinator runs the full `@p0`, `test:e2e:full` and the matrix once per wave on the integrated
  main. A failure called a flake still needs its failing state explained and a passing isolated run on the same
  commit.
- (2026-11-07, Epic 22 wave C gate) Before the integrated gate on the main checkout, the coordinator runs
  `podman compose restart api web`: the api's route tests and every e2e hit the live `api:3000` container, which does
  not reload `packages/domain`. The wave C gate went red (12 api, 6 full, 3 matrix) only because that container ran
  pre-merge code; after a restart the reds passed.
- (2026-10-08, load rules) At most two batch stacks are up at a time. No Playwright run outside the host lock, not
  even one targeted spec. The coordinator stops the main checkout's stack (`podman compose stop`) while batches run.
- (2026-10-08, this macOS host) `docker` is not on PATH: use `podman compose`, and run the tools container with
  `--user root`. `flock` is absent: use `lockf -t 20000 /tmp/fasor-verify.lock sh -c '...'`, started with `nohup`
  so no tool time limit kills the wait, and poll the tagged log. ~~Run the gate stage by stage from one tagged
  `test-results/gate-<tag>/run.sh` that writes `summary.txt` lines `name exitcode` (PRs #103-#107 are the
  precedent).~~ *(2026-10-08: the 11.4 GB VM runs the plain `pnpm verify` without OOM (two runs); a batch runs
  `pnpm lint`, `pnpm static`, `pnpm test:api` and `pnpm test:unit` (or the plain `pnpm verify` when it wants the
  `@p0` too), then its touched specs, logging each to a tagged file. A new tagged worktree reuses an existing
  `app-api-*`/`app-tools-*` image with `podman tag` instead of building: a fresh build on this host fails on a
  LibreOffice arm64/amd64 mismatch, see `deferred-work.md`.)* Spec paths go before `--project` when calling `scripts/e2e.ts` directly. A new spec that times taps
  against a render goes in `SERIAL_SPECS` or `scripts/e2e.test.ts` fails. Never `pkill` by a pattern that matches
  another batch's processes.
- (2026-10-15, Epic 14 carry-over) A tools container run with `--user root` can leave root-owned files in the
  `node_modules` volume (`apps/web/node_modules/.vite-temp`); the `web` dev container (user `node`) then crash-loops
  on EACCES and its restarts load the VM until every gate times out (co14b: 6137 restarts, test:unit 1506 s). Keep a
  batch's `web` service stopped unless a spec needs the dev server (`scripts/e2e.ts` builds its own bundle), and
  check `podman ps` for a restarting container before reading a timeout as a defect.
  *(2026-10-15, Story 14.10 part 1: this crash loop cannot recur. The `web` service starts Vite with
  `--configLoader runner`, which evaluates `vite.config.ts` in memory and writes nothing into
  `apps/web/node_modules/.vite-temp`, so a root-owned `.vite-temp` left by a tools run no longer stops it (proved on
  co15a: a root-owned `.vite-temp`, `web` serving with 0 restarts). And every gate entry (`pnpm verify`, a stage run
  alone, `scripts/e2e.ts`) first runs `scripts/preflight.ts`, which reads the engine socket mounted into `tools`
  (GET only) and exits non-zero within 15 s naming any project container that is restarting or whose restart count
  grows, with its count and the first line of its last log; with no socket it says so in one line and goes on.)*
- Read files with offset/limit; do not re-read a file you just edited; do not cat whole large files.
- No Playwright MCP browser pass in the batch (the integrated QA after the last merge does the human-style pass).
  The batch still covers each story's main ACs with Playwright specs tagged `@p0` (as a human would: clicks,
  typing, keyboard, reload), and secondary ACs with `@p1` specs or unit tests. A new `@p0` spec asserts the
  target's committed state (outbox or store), not only what the screen shows (E12-A6).
- A mechanism fix (race, lock, durability, focus) ships with a mutation run: revert the fix in the working tree,
  show the gate spec goes red, restore; report the result in the PR body (E12-A6).
- A new kernel refusal of a write ships with an api integration test through the sync route; a batch adding a
  table or a wide control asserts its 390 px fit in an e2e (E5-A6). An identity or reuse rule gets a two-device
  test (E4-A8).

- A batch touching `docx.ts`, `layout.ts`, a golden or the sync contract merges main and runs ~~`test:e2e:full`~~ its touched document and sync specs *(2026-09-30, split gate)* before
  its PR; document tests assert from their own section heading, never from a position that another section shifts
  (E7-A6).
- (E10-A2, 2026-09-29) Push your branch to origin after every commit that precedes a gate run and before any long
  wait (`git push -u origin <branch>`; an ordinary push, the PR comes later). A machine restart wipes `/tmp` and an
  unpushed branch is at risk.
- (E10-A4, 2026-09-29) A batch that changes the op fold, the commit path (`apps/web/src/db/commit.ts`, the outbox) or a
  live query on the ficha runs the durability specs it touches on `pnpm test:e2e:matrix` (three projects, targeted
  with `--grep` or the spec path) under the lock before its PR.
- A batch cut by a usage limit or an API timeout leaves a handoff note in its worktree (`HANDOFF.md`: branch, last
  green command, what remains) before anything else (E7-A6).
- A PR touching `packages/domain/src/contract/ocr.ts`, the committed OCR schema or `services/ocr` builds the sidecar
  and runs its pytest under the host lock and pastes the output in the PR body (E8-A4).
- A feature with a server pipeline ships one `@p1` e2e from the UI entry through the real job under `fake`
  providers, with no server-op seeding (E8-A6).
- Before queueing for the full gate, run the targeted specs, the unit suite and the api suite; report the lock wait
  and the gate time in the PR body (E7-A2).

## 3. Subagents

- Every subagent call is BLOCKING (`run_in_background: false`). Never end your turn to wait for a notification.
  Launch the two step-4 review layers in ONE message as two Agent calls, each with `run_in_background: false`.
- Commit a WIP checkpoint on your branch right after the implementation subagent returns, before the review.
- If a child fails with a 5xx or overload error, resume the same child via SendMessage, up to 3 times.
- If a child goes silent or is handed back mid-run, inspect `git status` / `git diff --stat` in the worktree (use
  ISO timestamps with `find -newermt '2026-09-26T12:00:00'`; this box's find is bfs) and finish the work yourself or
  resume the child with a precise remainder.
- A report file a subagent writes goes inside the worktree (the tools refuse other paths).
- (2026-10-14, E14-A6, folds E13-A5) At every phase boundary (spec ready, implementation returned, review loop
  done, gate done) commit a WIP checkpoint, push it, and rewrite `<worktree>/.scratch-<tag>/HANDOFF.md` with the
  remaining steps, so the coordinator can resume the batch from it.
- (2026-10-14, E14-A6) Never hand back while a child you launched is still running: wait for its report and act on
  it first. Your final message states each child's state (returned, resumed, abandoned and why).

## 4. Scope and decisions

- Implement exactly what the stories or items in your launch prompt say, read together with their dated narrowing
  notes in `epics.md` and `source-deltas.md` (source-deltas wins), and the coordinator decisions of
  `epic-<N>-context.md`.
- Ownership (AD-1/AD-13): every status, count, verdict, plural and derived text lives in `packages/domain`;
  `apps/web` renders from IndexedDB and writes ops only. New pt-BR strings follow the three homes in AGENTS.md.
- Screens are built from the mocks with the mock's class names; `.frame-*` translations go in `app.css` per
  AGENTS.md.
- A product-level choice not settled by the documents is an OPEN QUESTION: keep the current behavior or the most
  conservative reading, and list it in the spec and PR body. Do not decide it (E4-A8).
- A stub or narrowing left for another batch or epic gets a `deferred-work.md` entry naming its owner, and a line in
  your PR body's "Narrowings" list so the coordinator writes the dated line under the story in `epics.md` (E6-A7).
- Do not edit `sprint-status.yaml`. Do not edit `epics.md` unless your launch prompt says so.
- A new op family bumps `CONTRACT_VERSION` (and `MIN_CONTRACT_VERSION` when old clients must stop) and gets an api
  integration test through the sync route.
- (2026-10-14, E14-A3) A batch that adds a value to a closed list other specs assert (block type, palette row, enum
  value, seed version) finds every spec asserting that list (`grep -rln` over `e2e/`) and runs them beside its
  touched specs. A spec reads such a list from the kernel, as `e2e/support/palette.ts` does, never as a literal.
- (2026-10-14, E14-A5) A review-loop patch to an evaluation, verdict or lock rule ships with a boundary test (zero,
  negative, equal, at the limit), and the PR body lists every such patch under "Patched, not re-reviewed"; the
  integrated review reads that list first.
- (2026-10-14, E13-A7) A story that adopts a browser API with a fallback (camera capabilities, torch, zoom,
  `ImageCapture`, any API a browser may lack or stall) ships an e2e on the real surface that stubs the API twice, once
  to reject and once to hang, and asserts the fallback in both (the `e2e/plate-shot-fallback.spec.ts` pattern). An
  e2e that captures a file (photo, plate shot, export) asserts a property of the captured file, such as its size or
  dimensions, not only that a file exists.
- No emoji anywhere. Code, comments, commits and documents in English; UI copy pt-BR verbatim from the mocks.
- The repository is public: never copy material from `docs/context/` or `docs/media/`.
- ~~Do not build on another batch's unmerged branch.~~ *(2026-10-13, Matheus, Epic 14: a batch may be stacked on
  another batch's branch or early kernel commit when the launch prompt says so; the epic context assigns contract and
  seed numbers up front.)* Merging main into a stacked branch after the batch under it squash-merged (E14-A6, R14-4):
  for every file this batch did not change take main's version whole, then re-apply this batch's own delta; check
  `git diff origin/main --stat` lists only this batch's files; run the gate on that merge. A gate test that fails under load but passes alone is reported
  as a known flake with its passing isolated run.

## 5. Finish

1. Commit on your branch (messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`).
2. `git fetch origin`; if `origin/main` moved, `git merge origin/main` (never rebase, never force-push), resolve,
   re-run `pnpm verify`.
3. `git push -u origin <branch>` and open the PR against main with `gh pr create --base main` titled as in your
   launch prompt. Body: summary per story or item, narrowings, open questions, known-open review findings, mutation
   runs, and the last ~40 lines of the green `pnpm verify` output in a code block. End the body with the line
   `Generated with [Claude Code](https://claude.com/claude-code)` (no emoji). Do not merge.
4. ~~`docker compose down -v` in the worktree to free the machine (images stay).~~ *(2026-10-14: never pass `-v`, AGENTS.md and the 2026-10-08 load rules; on this host)* `podman compose stop` in the worktree to free the machine.
5. Final message, under 250 words: PR URL, branch, head commit, verify result (counts and wall time), narrowings,
   open questions, known-open findings, and every cross-batch contract you implemented (op paths, kernel function
   names and signatures, endpoints, env vars) so the next batches can rely on them.

## 6. Coordinator rules (for the parent session)

- One coordinator per checkout. The epic context is compiled once, with the coordinator decisions, and committed
  before any worktree is created.
- (E10-A3, 2026-09-29) The epic context's cross-story table names one assertion per shared item (cell, entity, op
  path, undo batch, surface), and the undo of every new op kind or resolution is always listed as a pair.
- Keep a carry-over batch first in each epic for the agent-closable action items and deferred entries of earlier
  epics (E6-A7).
- Batches are cut along surfaces and data dependencies; dependent batches run in series, independent ones in
  parallel, and the host lock keeps the gate to one run at a time.
- Stacked PRs are opened with `--base main` or retargeted after the first merges (E6-A7).
- After the last merge: ONE integrated review + human-style QA agent on clean main (verify, `test:e2e:full`,
  `test:e2e:matrix`, a Playwright MCP pass over every AC at 390, 768 and 1280 px), its report written inside its
  worktree and copied by the coordinator; one fix batch; a re-check by the same QA agent through SendMessage
  (cached context); then a headless `bmad-retrospective -H` in a subagent (E4-A8).
- (2026-10-15, Story 14.10 part 2, cross-batch merge rule) Two batch PRs of one wave never merge on their own
  gates alone. Before merging the second, the coordinator merges the first batch's branch (or main, once the first
  has merged) into the second, runs both batches' touched specs on that merge result under the host lock, and merges
  only when both sets are green; the second PR's body names the merge commit and both spec lists. Reason: PRs #137
  (co14a, the sticky-bar focus scroll) and #133 (co14b, the camera and relatorio tree split) were each green alone,
  and together turned 14.2-E2E-002 red on the wave gate of 0b67a20 (a menu item scrolled under the pointer), which
  cost a fix PR (#138) after both had merged.
- QA screenshots: at most about ten, only for defects and the key states of each story (images are costly).
- Every narrowing reported in a PR body gets a dated line under its story in `epics.md` when the PR merges.
- (2026-10-14, E14-A4) Definition of Ready capability check, before a story or item enters a batch: for every verb a
  criterion asks of a surface (add, remove, move, restore, reorder, rename), check what the surface does today (the
  code and its specs) and the open rows of `deferred-work.md`. A missing capability becomes named scope with its own
  acceptance criteria under the story in `epics.md` before the build, never a scope addition at PR review (the
  Story 14.2 location-removal gap, the `deferred-work.md` row latent "until a relatório can remove a location", is
  the precedent).

## 7. Rules carried from the Epic 15, 16 and 17 retrospectives (2026-10-28, E17-A5)

Written here because the Epic 17 context file and its batch specs carried them while this playbook stayed at its
2026-10-15 text; a rule that lives only in one epic's context is re-typed per epic or lost. Each names its source.

- (E15-A3) Seed bump: a batch that adds a seed version greps `e2e/` for the previous version's count and section
  literals (item counts, "N itens", section titles) and runs every hit beside its touched specs, replacing each
  literal with the kernel value; it restarts the api container after regenerating a fake-provider fixture.
- (E15-A4, E16-A10) Load: a unit or api stage red only under load (15 s test timeouts, forks-worker starts,
  a timing target missed in untouched files) is re-run alone under the host lock before the merge, and both runs go
  in the PR body. Every wave gate record starts with the host load average (`sysctl -n vm.loadavg`) and what else
  ran. Two batch stacks on one VM are still allowed (2026-10-08) until E17-A8 decides otherwise.
- (E16-A8) The api container is restarted (`podman compose restart api`) after any change under `packages/domain`
  or `apps/api` since it started, before `test:api` and before the story's e2e (`tsx watch` misses changes across
  the podman VM mount). A batch stack left idle overnight is restarted before its gate.
- (E16-A9) After the review's patches, `lint` and `static` run again on the head that merges, not only the patched
  test files.
- (F7, Epic 17) A batch's last steps (the spec's Auto Run Result, the PR body, `gh pr create` after
  `gh auth switch --user matheusvt2`, `podman compose stop`) are written as a script in `.scratch-<tag>/` as soon
  as the gate starts, so the coordinator can run them when the orchestrator agent is cut by the runtime or dies on a
  network drop; the coordinator keeps its own background `until grep` watcher on the gate log and resumes the agent
  with SendMessage.
- (F8, Epic 17) Each epic context carries a "facts the batches share" list, one line per fact two batches would
  otherwise discover separately. Current entries: a photo with no sheet, no caption and no "Pessoas na foto" mark
  carries `reading_kind: 'caption'` (Story 9.3), so a "Geral" predicate accepts null or `'caption'`; a sheet's
  route is `/relatorio/{id}/ficha/{blockId}`; `V<n>_HASH` pins a seed version when the next derives from it.

## 8. Rules carried from the Epic 18 retrospective (2026-11-03, E18-A3 and E18-A6)

Each names its source in `epic-18-retro-2026-10-30.md`.

- (E18-A3, P1) A residual risk that changes how a dashboard view, a saved query or a generated document is read is
  written as a runbook sentence (`docs/observability.md` for the views, the document's own runbook otherwise) in the
  same PR that lists the risk, beside its Auto Run Result line. Precedent: o18a listed "generate and preview waits
  time the request, not the job" on 2026-10-29, and `docs/observability.md` § waits said so only after the first
  production read (`677415a8`, 2026-10-30), when 26.8 s on screen read as 176 ms in the view.
- (E18-A3, P5; E15-A4, E16-A10, E17-A8 restated) Every wave gate record in `epic-<N>-context.md` carries the host
  load line: `sysctl -n vm.loadavg` at the start and at the end, the lock wait (`LOCKED_AFTER`), and what else ran
  on the host (batch stacks up, another gate). A record without it is incomplete, whatever its counts; Epic 18's
  integrated gate on `3b45e83c` recorded stage times and no load.
- (E18-A6, P4; E10-A1, E11-A1, E17-A8 restated) Deploy checklist, before `infra/bin/deploy` of an integrated main
  (a main that took more than one batch or story PR since the last deploy): `pnpm test:e2e:full` is green on that
  main commit, run under the host lock, with the host load line above, and recorded in the epic context's gate or
  deploy section before the deploy starts. A test red once and green alone counts only with both runs recorded and
  the failing state explained (E15-A4). `pnpm verify` alone is not this record: the `@p1` and `@p2` specs run only
  in `test:e2e:full`. The same step is in `infra/PUBLISHING.md` § Every publish, step 1. For Epic 18 the record is
  the retrospective's run of 2026-10-30 on `677415a8` (the code of `3b45e83c`): 537 of 542, one red green alone
  (2 of 2), 4 skipped, load 3.30 at the start and 3.08 at the end, lock wait 0 s (`epic-18-retro-2026-10-30.md`
  § Behavior verification).
- (E19-A4, P-2, 2026-11-03) A story built without a spec (Epic 19's 19.1 and 19.2 were) still gets a
  verification-gap read before its merge, recorded in one line of its `sprint-status.yaml` note: the read's count
  and where the rows went, or "verification gap: none found".
- (2026-11-03, the `cf468e3d` deploy) `infra/bin/deploy` takes the host lock itself around the production smoke;
  start it with nohup and no `lockf` wrapper, or the smoke fails at once with "already locked".

## 9. Rules carried from the Epic 20 retrospective (2026-11-04, E20-A4)

Each names its source in `epic-20-retro-2026-11-04.md`.

- (E20-A4, P-1, 2026-11-04) The integrated review is two passes. The first is the behavior pass as before. The
  second is a code read, with its own brief, over the union of every batch's "patched, not re-reviewed" list and of
  the fix batch's items added after its own review, with the verification-gap and edge-case lenses; the review report
  records the second pass and its count, or "second pass: none found". Precedent: Epic 20's batches listed their
  patches for the integrated review, which ran only a behavior pass, and the retrospective found R-1 to R-12 in that
  code.
- (E20-A4, P-2, 2026-11-04; extends E19-A4 in § 8) A batch with no spec and no `sprint-status.yaml` line records
  its verification-gap read in the PR body: the read's count and where the rows went, or "verification gap: none
  found".
- (E20-A4, P-3, 2026-11-04; extends E18-A6 in § 8) Deploy checklist: before `infra/bin/deploy`, list every open
  `deferred-work.md` row whose state says "before the deploy" (`grep -n "before the deploy"`), and record each one's
  result (run, its outcome, or skipped and why) in the epic context's deploy record. Precedent: the e20s over-cap
  count of PR #239 was meant to run before the d6e8eea1 deploy and had no record of a run; it ran on 2026-11-04 after
  the e0b47ad4 deploy (0 values over cap).
- (E20-A4, R-1, 2026-11-04) A budget or quota rule ships with tests for its restore path (a tombstone put back) and
  its shrink path (an edit that makes a value smaller), beside the over-the-limit case. Precedent: the 4 MiB
  relatório budget of Epic 20 refused a shrink and let a restore through, fixed in E20-A1.

## 10. Rules carried from the Epic 21 retrospective (2026-11-06, E21-A4)

Each names its source in `epic-21-retro-2026-11-06.md`.

- (E21-A4, P-1, 2026-11-06) A story whose AC depends on what a model perceives (a plate, a display, a caption, a
  diagram) runs its paid eval before its batch PR merges: on the synthetic set and on a real set fetched first into
  the ignored `docs/media/`, never committed. The coordinator runs it with Matheus's AWS login, because a batch
  never holds a paid key (Policy), and the eval table goes in the PR body as merge evidence beside the gate. The
  batch spec names its fake-provider tests of that AC as plumbing tests: a fixture whose structuring answer is the
  expected value checks the build, the trust and the device, never the reading. Precedent: Story 21.2's drawn Yyn0
  plate passed every fake test and read Dy1 3 of 3 on the model, found only by the coordinator's run after both
  batches merged; it cost fix batch e21f, a second gate and a fix no review re-read.
- (E21-A4, P-2, 2026-11-06) A reading prompt that needs a derived value (a group code, a class, a verdict) asks the
  model for the perceptual facts and lets a kernel function compose the value (AD-13 applied to model output).
  Precedent: asked for the code the model answered Dy1 3 of 3; asked for the facts it answered them right 5 of 5,
  and with `composeVectorGroup` the drawn plate read Yyn0 3 of 3 (`spec-e21f-diagram-vector-group.md`). Also in
  `docs/kbs/architecture/kernel-and-seed.md`.
- (E21-A4, P-3, 2026-11-06) The integrated review's stack and its Playwright MCP browser stay down while the
  integrated gate runs its `test:unit` and `test:e2e*` stages. A test red under load in two gates of one epic gets
  a `deferred-work.md` row and a hardening owner. Precedent: Epic 21's integrated gate on `fdc19924` ran beside the
  review stack `fasor-e21q` and a browser for about 25 minutes and met three reds, all green alone; the four tests
  that went red in two or more gates are the retrospective's ledger row (`reading-arrivals.test.tsx`,
  `home-surface.test.tsx`, `setup-surface.test.tsx`, R8LAY-E2E-008).
- (E21-A4, P-4, 2026-11-06; extends § 9 P-1) A fix batch that follows the integrated review gets the second-pass
  brief itself: the verification-gap and edge-case lenses over its own diff, its review-loop patches above all,
  recorded in its PR body with the count, or "none found", before it merges. Precedent: e21f came after the
  integrated review, patched four fixes with "follow-up review: false", and no re-read is on record; the
  retrospective's read of that code found R-1 and R-2.

## 11. Rules carried from the Epic 23 and Epic 24 retrospectives (2026-11-11, E23-A3 and E24-A3)

Each names its source in `epic-23-retro-2026-11-10.md` or `epic-24-retro-2026-11-11.md`. The eight Epic 23 lines were
kept in practice through Epic 24 but never written here (the Epic 24 retrospective's follow-through table); each line
carries the date it was written. P-8 of Epic 24 gives no new rule: it is the eval line of Epic 23, restated.

- (E23-A3 item 1, P-1 of Epic 23, 2026-11-11; extends E18-A6 in § 8 and P-3 in § 9) No `infra/bin/deploy` of an
  integrated main before the hands-on behaviour pass of its waves has run in the browser, with its report tracked
  under `_bmad-output/test-artifacts/manual/`. The deploy checklist also lists every open `verification` row of
  `deferred-work.md` owned by a review or a QA pass, not only the rows that say "before the deploy". Precedent: Epic
  23's pass ran on 2026-11-10 on the code of `47be2638`, after two deploys, and found two high print defects (F2, F3)
  on code every automated gate had passed; fix batch e23p and a third deploy followed. Epic 24 kept the rule: two
  passes before the deploy, both reports tracked.
- (E23-A3 item 2, P-1 of Epic 23, 2026-11-11) A change to a printed table's columns or type size carries a test that
  reads the PDF, and a crop of the page in the PR. A layout choice is put to Matheus with the crop. Precedent: the v13
  transformer insulation table was judged by the kernel's own estimate; it broke words and a number in print, and no
  test read the PDF until e23p added one.
- (E23-A3 item 3, P-1 of Epic 23, 2026-11-11; E10-A3 in § 6 restated) A story that adds a field to an existing entity
  lists that entity's readers and writers in its DoR: copy, previous visit, plate reading, print. The epic context
  carries the cross-story table of assertions E10-A3 asks for. Precedent: Story 23.7 added the two temperatures as
  nameplate fields, the copy chips of Epic 5 copied them and Story 23.5 corrects by them, so a second visit was
  corrected with the first visit's temperature (F2). Each story's own tests passed.
- (E23-A3 item 4, P-2 of Epic 23, 2026-11-11) Deploy after the wave's fix batch. An earlier deploy names the known
  findings and Matheus's word in the deploy record before it starts. A fix after a deploy that changes what a device
  derives or writes states its contract choice in its spec. Precedent: `ef099d41` was deployed before fix batch e23z,
  so the plan of one deploy became three, and e23p's fix went out with no contract number (R-2 of that retrospective).
  Epic 24 kept the rule: PRs #317 and #322 state "no contract number" with the reason.
- (E23-A3 item 5, P-3 of Epic 23 and P-8 of Epic 24, 2026-11-11; E21-A4 P-1 in § 10 restated) A PR that bumps a
  reading prompt carries its eval table, or does not merge. "Before the deploy" in an epic context does not replace
  this rule. Precedent: in Epic 23, prompts 6 and 7 were never measured alone and prompt 8 was measured after
  `ef099d41` was already serving it. In Epic 24, batch e24s bumped the prompt to `bedrock-structuring-9` and merged
  with fake-provider tests only (#315); the eval ran on `2009fa30`, before the deploy and after the merge.
- (E23-A3 item 6, P-4 of Epic 23, 2026-11-11) The batch plan says whether a wave may start beside the previous wave's
  fix batch, and each gate record names what else ran on the host. Precedent: the Epic 23 plan said each wave starts
  after the previous wave's gate and fix batch; in practice the next wave started beside the fix batch (the e23t stack
  was up throughout e23w's gate), and wave 2's full run took 7505 s against 2530 s for wave 1's, with no line on what
  else ran.
- (E23-A3 item 7, P-5 of Epic 23, 2026-11-11) A gate's record is written into the epic context when the gate ends,
  with its counts, its reds and its load line. "Green" means no red; a gate with reds that passed alone says so in
  those words. A handover cites the record, and the next session checks the handover against the record before acting.
  Precedent: Epic 23's wave 2 and wave 3 gate sections were filled a day after the gates ran and after the first
  deploy, and a handover note called those gates green and dated the paid eval before the first deploy (corrected in
  PR #299).
- (E23-A3 item 8, P-7 of Epic 23, 2026-11-11) A batch that reads the test base checks its diff for word runs of the
  base before its PR: no run of five words that matches the base JSON. Precedent: PR #295 put two short quotes of the
  base in comments of `seed/v13.ts`; fix batch e23z replaced them and ran that check, and the two quotes stay in the
  public git history.
- (E24-A3 item 1, P-1 of Epic 24, 2026-11-11) A broken word or number seen in a golden or in a PDF is a defect row of
  `deferred-work.md` with an owner batch, never a row that waits for a decision. A finding that a hands-on pass
  repeats is put to Matheus the first time it is reported. Precedent: batch e24p wrote that "GUARD" already broke in
  the locked v13 golden and left it as a low row for Matheus; the early pass then met it as F1, a high print defect.
  An NC row that offers a second point was reported by three passes (H3, F4, G3) before he decided it stays.
- (E24-A3 item 2, P-2 of Epic 24, 2026-11-11; extends P-4 in § 10) The last commit before a deploy that changes
  product code gets a read, the patches written after a fix batch's own review included. A test of an editor types
  into it and waits past its autosave. Precedent: `8ea60738`, `c65c93ca` and `5a8b8958` were written after their fix
  batches' reviews, read by nobody and deployed the same day; the retrospective found R-1 in that code. D1, the point
  editor that closed itself at the first autosave, passed its batch's tests because they tapped "Concluir" without
  typing.
- (E24-A3 item 3, P-3 of Epic 24, 2026-11-11; extends E15-A3 in § 7) A batch's PR body lists the grep it ran over
  `e2e/` and the web tests for the strings, op paths and behaviours it changes, and the grep's hits, so a missing grep
  can be seen. The integrated gate never runs beside a building batch. Precedent: the integrated gate's run 2 on
  `7773aafa` went red on three specs that still asserted the behaviour from before e24s and e24y, and none was in
  those batches' touched-spec lists. Run 1 on `76c74711` ran beside a building batch: the load reached 32, the stack's
  Postgres restarted and the run gave no result.
- (E24-A3 item 4, P-5 of Epic 24, 2026-11-11; extends F7 in § 7) A batch's Auto Run Result has one line per
  orchestrator cut: what the orchestrator was waiting on, and where the handoff file is. The handoff file is written
  at each phase boundary, not at the cut. Precedent: Epic 24's batch orchestrators were cut by their runtime several
  times (the coordinator's fact); no spec, PR body or context line records a cut, so the cost cannot be measured.
- (E24-A3 item 5, P-6 of Epic 24, 2026-11-11; extends P-3 in § 9) A sentence a person corrected is checked in its
  place on the screen before it is built. The deploy record closes or carries each "before the deploy" row by name.
  Precedent: among the sentences Bruno corrected, one replacement reversed the meaning of its band; it was withdrawn
  before it was built (P8g of `spec-e24y-pass-fixes.md`). Three "before the deploy" rows were still open after the
  deploy of `2009fa30`: the v14 layout lock, the paid eval and an optional production count.
- (E24-A3 item 6, P-7 of Epic 24, 2026-11-11) The questions for the field engineer go out when the stories are
  written, not after the build. A story that rests on an open question says so in its DoR. Precedent: Epic 24's
  questions B-1 to B-10 were known at planning on 2026-11-10 and sent after the build. The answers came on the last
  day, and Epic 25 reworks four stories built the day before (Stories 25.17, 25.18, 25.19 and 25.21 over 24.13, 24.10,
  24.11 and 24.16).

## 12. Token economy of Epic 25 (2026-11-12, Matheus, "sim nos 3")

Mirrors the 2026-11-12 line of `AGENTS.md` "Decisions of record". It amends the story gate of 2026-10-08 (§ 2).

- ~~A story gate per batch plus an integrated gate after the merges.~~ *(2026-11-12)* A batch runs `lint`, `static`,
  `test:unit`, `test:api` and its touched specs (and its touched durability specs under the E10-A4 condition), pastes
  the summary in its PR and stops. The coordinator runs ONE full gate per wave on the integrated branch.
- ~~A batch review and an integrated review.~~ *(2026-11-12)* No review loop inside the batch (this overrides § 2's
  "Review (step 4)" for Epic 25 batches); the coordinator runs one review per wave.
- Orchestration and records run on the cheaper model. The expensive model is for kernel and print code and for the
  review.
- One batch and one PR per wave; a second batch only when kernel and screen work do not touch. One records PR per wave.
