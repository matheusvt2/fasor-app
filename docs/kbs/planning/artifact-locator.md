---
type: Planning Map
title: Planning artifact locator
description: Path and purpose of each planning, UX, test and implementation artifact. Open to find where a fact is recorded.
tags: [planning, locator]
timestamp: 2026-09-30T00:00:00Z
---
# Artifact locator

All under `_bmad-output/` unless stated.

- `specs/spec-fasor/`: `SPEC.md` (build contract, CAP-1..25, constraints, non-goals, assumptions), `glossary.md`, `delivery-slice.md`, `source-deltas.md` (overrides).
- `planning-artifacts/architecture/architecture-fasor-2026-09-21/ARCHITECTURE-SPINE.md`: AD-1..27, stack, structural seed, capability map, deferred. Summaries: [architecture](/architecture/index.md).
- `planning-artifacts/epics.md`: epics and stories ([epics-map](/planning/epics-map.md)). `sprint-change-proposal-2026-09-24.md`: Epic 12 reorder. `sprint-change-proposal-2026-11-08.md`: Epic 23 (Bruno's test base as the product's criteria), with its open items for Bruno and Matheus.
- `planning-artifacts/prds/prd-fasor-2026-09-19/`: `prd.md` (outdated in places), `addendum.md` (section 9 holds the seed content of the eight block types, decoded from FO.SERV-03 in gitignored `docs/context/`).
- `planning-artifacts/ux-designs/ux-fasor-2026-09-18/`: `EXPERIENCE.md`, `DESIGN.md`, `mockups/`, `imports/extract-fo-serv-03.md` (structural extraction), reviews and reconcile notes. See [ux](/ux/index.md).
- `planning-artifacts/briefs/`, `research/`: early inputs.
- `test-artifacts/`: `test-design-architecture.md`, `test-design-qa.md`, `test-design-progress-system.md`, `test-design/`, `manual/` (device scripts for iPad and Android). *(2026-11-10: `manual/` also holds the dated browser pass reports, among them `behaviour-pass-e23-2026-11-10.md`, the Epic 23 behaviour pass with findings F1 to F20.)*
- `implementation-artifacts/`: `sprint-status.yaml`, `epic-N-context.md`, `epic-N-retro-*.md`, `spec-*.md` per story or batch, `deferred-work.md`, `epic-batch-orchestrator.md`, `reviews/`.
- Outside `_bmad-output`: `docs/concorrentes/` (competitor reading, cite by path only), `docs/display-reading-spike.md`, `docs/nc-chip-phrases.md`, `docs/tablet-https-setup.md`.
- *(2026-11-11)* `planning-artifacts/sprint-change-proposal-2026-11-11.md`: Epic 25 (Bruno's 33 improvements, M01 to M33), with the table of each item against main, the waves, and the open items for Bruno (B-1 to B-17) and Matheus (M-1 to M-10). `implementation-artifacts/epic-25-context.md`: the short context the Epic 25 batches read.
- *(2026-11-21)* `planning-artifacts/epics.md` Epic 26: users, roles and permissions (five seeded roles, twelve permission keys, custom roles, e-mail through SES), 11 stories in four waves, with Matheus's seven decisions; overrides the SPEC's "no roles" through the `source-deltas.md` row of the same date. Planned, not built.
- *(2026-11-21)* `planning-artifacts/epics.md` Epic 27: the fixes of the manual pass of 2026-11-21, 14 stories in three waves, seed v17; the pass report with findings F1 to F41 is `test-artifacts/manual/ux-pass-2026-11-21.md`. ~~Planned, not built.~~ *(2026-11-22: wave 1, Stories 27.1 to 27.7, merged and not deployed; wave 2 in progress; the wave's records are in `implementation-artifacts/epic-27-context.md`.)*
- *(2026-11-22)* `planning-artifacts/epics.md` Epic 28: Bruno's answers of 2026-11-22 to B-1..B-17, 10 stories in three waves on seed v18, with the questions Q-1 to Q-7 at its end; `implementation-artifacts/epic-28-context.md`: the short context its batches read. Bruno's words stay in the gitignored `docs/context/epic-25/respostas-bruno-2026-11-22.md`. Planned, not built.
