---
type: Process
title: Story delivery
description: Readiness, branch and PR rules, review and merge steps, story and epic metadata. Open before starting or closing a story.
tags: [workflow, stories, bmad]
timestamp: 2026-09-30T00:00:00Z
sources: [AGENTS.md, _bmad-output/implementation-artifacts/epic-batch-orchestrator.md, _bmad/custom/bmad-build.toml]
---
# Story delivery

- A story is ready only with acceptance criteria, definition of ready and definition of done in `_bmad-output/planning-artifacts/epics.md`. Implementation stays inside what the story says. Every story carries `**Dev model:** ... · **Effort:** ...`; `_bmad/custom/bmad-build.toml` reads it to pick the subagent `bmad-dev-<model>-<effort>`. Add the line to every new story.
- One branch (`story/<sprint-status-key>`) and one PR per story, self-approved (record the review verdict as a PR comment), squash-merged with subject `Story N.M: <title> (#PR)`. Main receives only merged story PRs. Never force-push a story branch; merge origin/main into it.
- Flow: build (`bmad-build-auto`), PR with verify output, independent review in a fresh context, fixes, gate ([merge-gate](/workflow/merge-gate.md)), merge, then flip the story to `done` in `sprint-status.yaml`.
- Per epic: stories are batched by shared surface, run with isolated worktrees and compose projects, then one integrated QA, one fix PR, a retrospective (`epic-N-retro-*.md`). Playbook: `_bmad-output/implementation-artifacts/epic-batch-orchestrator.md`. Carry-over items go to `deferred-work.md`.
- Built record of each story: `_bmad-output/implementation-artifacts/spec-<n>-<m>-*.md`; epic context files `epic-N-context.md`.
- Pitfalls: the coordinator must not pull into the owner's main checkout without care (uncommitted edits); `gh pr merge` needs the owner's go-ahead when the classifier denies it; push branches before long gates.
