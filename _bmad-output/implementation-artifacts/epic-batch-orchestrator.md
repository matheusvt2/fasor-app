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
  `pnpm test:e2e:matrix` in the host lock, and run it in the foreground:
  `flock /tmp/fasor-verify.lock docker compose --profile tools run --rm tools pnpm verify > /tmp/verify-<tag>.log 2>&1; echo EXIT=$?; tail -60 /tmp/verify-<tag>.log`
  then `grep -n -E 'FAIL|failed|Error' /tmp/verify-<tag>.log | head -40` only when it failed. If the command would
  outlive the tool timeout, run it with `run_in_background: true` and then block on it with a Monitor until-loop
  on the log's EXIT line; never end your turn to wait.
- While iterating, run the narrowest suite (`pnpm test:unit -- <path>`, one Playwright spec with `--grep`), not the
  whole gate. Run the full `pnpm verify` once at the end, and once more only if you merged a changed main.
- A batch that touches the sheet, an overlay or shared layout also runs `pnpm test:e2e:full` (under the lock)
  before its PR, and so does the epic's last story PR (E6-A2).
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

## 3. Subagents

- Every subagent call is BLOCKING (`run_in_background: false`). Never end your turn to wait for a notification.
  Launch the two step-4 review layers in ONE message as two Agent calls, each with `run_in_background: false`.
- Commit a WIP checkpoint on your branch right after the implementation subagent returns, before the review.
- If a child fails with a 5xx or overload error, resume the same child via SendMessage, up to 3 times.
- If a child goes silent or is handed back mid-run, inspect `git status` / `git diff --stat` in the worktree (use
  ISO timestamps with `find -newermt '2026-09-26T12:00:00'`; this box's find is bfs) and finish the work yourself or
  resume the child with a precise remainder.
- A report file a subagent writes goes inside the worktree (the tools refuse other paths).

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
- No emoji anywhere. Code, comments, commits and documents in English; UI copy pt-BR verbatim from the mocks.
- The repository is public: never copy material from `docs/context/` or `docs/media/`.
- Do not build on another batch's unmerged branch. A gate test that fails under load but passes alone is reported
  as a known flake with its passing isolated run.

## 5. Finish

1. Commit on your branch (messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`).
2. `git fetch origin`; if `origin/main` moved, `git merge origin/main` (never rebase, never force-push), resolve,
   re-run `pnpm verify`.
3. `git push -u origin <branch>` and open the PR against main with `gh pr create --base main` titled as in your
   launch prompt. Body: summary per story or item, narrowings, open questions, known-open review findings, mutation
   runs, and the last ~40 lines of the green `pnpm verify` output in a code block. End the body with the line
   `Generated with [Claude Code](https://claude.com/claude-code)` (no emoji). Do not merge.
4. `docker compose down -v` in the worktree to free the machine (images stay).
5. Final message, under 250 words: PR URL, branch, head commit, verify result (counts and wall time), narrowings,
   open questions, known-open findings, and every cross-batch contract you implemented (op paths, kernel function
   names and signatures, endpoints, env vars) so the next batches can rely on them.

## 6. Coordinator rules (for the parent session)

- One coordinator per checkout. The epic context is compiled once, with the coordinator decisions, and committed
  before any worktree is created.
- Keep a carry-over batch first in each epic for the agent-closable action items and deferred entries of earlier
  epics (E6-A7).
- Batches are cut along surfaces and data dependencies; dependent batches run in series, independent ones in
  parallel, and the host lock keeps the gate to one run at a time.
- Stacked PRs are opened with `--base main` or retargeted after the first merges (E6-A7).
- After the last merge: ONE integrated review + human-style QA agent on clean main (verify, `test:e2e:full`,
  `test:e2e:matrix`, a Playwright MCP pass over every AC at 390, 768 and 1280 px), its report written inside its
  worktree and copied by the coordinator; one fix batch; a re-check by the same QA agent through SendMessage
  (cached context); then a headless `bmad-retrospective -H` in a subagent (E4-A8).
- QA screenshots: at most about ten, only for defects and the key states of each story (images are costly).
- Every narrowing reported in a PR body gets a dated line under its story in `epics.md` when the PR merges.
