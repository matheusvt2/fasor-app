---
type: Directory Index
title: Workflow
description: How to run, verify, test and deliver work, and how to edit planning documents.
tags: [workflow, index]
timestamp: 2026-11-28T00:00:00Z
---
# Workflow

- [running-the-stack](/workflow/running-the-stack.md) compose commands, ports, health check, tools container. Open before running anything.
- [merge-gate](/workflow/merge-gate.md) `pnpm verify`, the batch gate and the one full gate per wave, the api suite lanes, locks. Open before a PR or merge.
- [e2e-testing](/workflow/e2e-testing.md) Playwright groups (parallel, then the `queue` and `solo` serial lanes), tags, workers, reports, human-style pass.
- [story-delivery](/workflow/story-delivery.md) readiness, one batch and one PR per wave, review, merge, sprint-status, where the built records go (the per-epic folders).
- [editing-docs](/workflow/editing-docs.md) precedence of conflicting documents, the strike-through rule and its two exceptions (`AGENTS.md`, the closed epics).
- [maintaining-the-kb](/workflow/maintaining-the-kb.md) how to change this KB.
