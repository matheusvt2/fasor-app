---
type: Process
title: Story delivery
description: Readiness, branch and PR rules, review and merge steps, story and epic metadata. Open before starting or closing a story.
tags: [workflow, stories, bmad]
timestamp: 2026-11-03T00:00:00Z
sources: [AGENTS.md, _bmad-output/implementation-artifacts/epic-batch-orchestrator.md, _bmad/custom/bmad-build.toml]
---
# Story delivery

- A story is ready only with acceptance criteria, definition of ready and definition of done in `_bmad-output/planning-artifacts/epics.md`. Implementation stays inside what the story says. Every story carries `**Dev model:** ... · **Effort:** ...`; `_bmad/custom/bmad-build.toml` reads it to pick the subagent `bmad-dev-<model>-<effort>`. Add the line to every new story.
- One branch (`story/<sprint-status-key>`) and one PR per story, self-approved (record the review verdict as a PR comment), squash-merged with subject `Story N.M: <title> (#PR)`. Main receives only merged story PRs. Never force-push a story branch; merge origin/main into it.
- Flow: build (`bmad-build-auto`), PR with verify output, independent review in a fresh context, fixes, gate ([merge-gate](/workflow/merge-gate.md)), merge, then flip the story to `done` in `sprint-status.yaml`.
- Per epic: stories are batched by shared surface, run with isolated worktrees and compose projects, then one integrated QA, one fix PR, a retrospective (`epic-N-retro-*.md`). Playbook: `_bmad-output/implementation-artifacts/epic-batch-orchestrator.md`. Carry-over items go to `deferred-work.md`.
- Definition of Ready capability check (2026-10-14, E14-A4): every verb a criterion asks of a surface (remove, move, restore) is checked against what the surface does today and the open `deferred-work.md` rows; a missing capability becomes named scope with its own criteria before the build. Test rules (2026-10-14, E13-A7): a browser API with a fallback gets an e2e stubbing it to reject and to hang (`e2e/plate-shot-fallback.spec.ts`); a capture e2e asserts a property of the captured file. Both in the playbook, sections 4 and 6.
- Cross-batch merge rule (2026-10-15, Story 14.10 part 2): before the second batch PR of a wave merges, the first batch's branch (or main after it merged) is merged into it and both batches' touched specs run on the result; only then does it merge. PRs #137 and #133 were green alone and together turned 14.2-E2E-002 red (fixed in #138). Playbook section 6.
- Retro rules in the playbook (2026-10-28 and 2026-11-03): § 7 carries the Epic 15 to 17 rules (seed-bump literal grep, a red-under-load stage re-run alone with both runs in the PR, restart the api after a kernel change, lint and static after review patches, gate logs in `.scratch-<tag>/`, a batch's last steps as a script, "facts the batches share"); § 8 the Epic 18 ones: a residual risk that changes how a view or document is read is a runbook sentence in the same PR, every wave gate record carries the host load line, and `test:e2e:full` green on an integrated main is recorded before its deploy ([merge-gate](/workflow/merge-gate.md)). Ledger rows owned by "the next epic's carry-over batch" are read when that batch is cut (§ 6, E6-A7).
- Built record of each story: `_bmad-output/implementation-artifacts/spec-<n>-<m>-*.md`; epic context files `epic-N-context.md`.
- Pitfalls: the coordinator must not pull into the owner's main checkout without care (uncommitted edits); `gh pr merge` needs the owner's go-ahead when the classifier denies it; push branches before long gates.
