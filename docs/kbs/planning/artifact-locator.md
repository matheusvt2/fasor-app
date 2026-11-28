---
type: Planning Map
title: Planning artifact locator
description: Path and purpose of each planning, UX, test and implementation artifact. Open to find where a fact is recorded.
tags: [planning, locator]
timestamp: 2026-11-28T00:00:00Z
---
# Artifact locator

All under `_bmad-output/` unless stated. Layout as of 2026-11-28 (the repository clean-up: records in one folder per epic, closed epics in `epics-archive.md`).

## Specs and architecture

- `specs/spec-fasor/`: `SPEC.md` (build contract, CAP-1..28, constraints, non-goals, assumptions), `glossary.md`, `delivery-slice.md`, `source-deltas.md` (overrides; its "Index by topic" at the top groups the rows).
- `planning-artifacts/architecture/architecture-fasor-2026-09-21/ARCHITECTURE-SPINE.md`: AD-1..30, stack, structural seed, capability map, deferred. Summaries: [architecture](/architecture/index.md).

## Epics, stories and change proposals

- `planning-artifacts/epics.md`: the requirements inventory, the model and effort guide, the definitions of ready and done, the epic list, the epics in work (31 and 32, with their stories) and the backlog of deferred stories. A closed epic keeps only its heading here.
- `planning-artifacts/epics-archive.md`: Epics 1 to 30 with every story, text unchanged, same headings (`### Story N.M:`). Map of both: [epics-map](/planning/epics-map.md).
- `planning-artifacts/sprint-change-proposals/`: one `sprint-change-proposal-<date>.md` per course correction. 2026-09-24: the Epic 12 reorder. 2026-10-08: Epic 14 (locals, the site checklist, office-created types). 2026-11-04: test speed (chores T2 to T4). 2026-11-08: Epic 23 (Bruno's test base as the product's criteria), with its open items for Bruno and Matheus. 2026-11-10: Epic 24. 2026-11-11: Epic 25 (Bruno's 33 improvements, M01 to M33), with the table of each item against main, the waves, and the open items for Bruno (B-1 to B-17) and Matheus (M-1 to M-10). 2026-11-26: Epic 31 (voice input).
- `planning-artifacts/prds/prd-fasor-2026-09-19/`: `prd.md` (outdated in places), `addendum.md` (section 9 holds the seed content of the eight block types, decoded from FO.SERV-03 in gitignored `docs/context/`).
- `planning-artifacts/briefs/`, `research/`: early inputs and research notes.

## UX

- `planning-artifacts/ux-designs/ux-fasor-2026-09-18/`: `EXPERIENCE.md`, `DESIGN.md`, `mockups/`, `imports/extract-fo-serv-03.md` (structural extraction), reviews and reconcile notes. See [ux](/ux/index.md).

## Tests

- `test-artifacts/`: `test-design-architecture.md`, `test-design-qa.md`, `test-design-progress-system.md`, `test-design/`, the integrated review reports, and `manual/`: device scripts for iPad and Android and the dated browser pass reports, among them `behaviour-pass-e23-2026-11-10.md` (Epic 23, findings F1 to F20), `ux-pass-2026-11-21.md` (findings F1 to F41, the source of Epic 27) and `hands-on-pass-2026-11-23.md`.

## Implementation records

At the root of `implementation-artifacts/`:

- `sprint-status.yaml` (live keys and open action items), `sprint-status-archive.yaml` (done action items and the full original status comments).
- `deferred-work.md` (open, partially closed and in-progress carry-over rows) and `deferred-work-archive.md` (the closed rows, moved verbatim under the same section headings when they close).
- `epic-batch-orchestrator.md` (the delivery playbook), `open-work-audit-2026-11-24.md` (the audit behind Epic 30).
- `reviews/`: the written reviews and QA reports of each epic with the screenshots their text cites by name. `reviews/README.md` says how to get back one of the 770 uncited screenshots removed on 2026-11-28 (they are in the git history).
- The `spec-*.md` of a story in an epic still in work; it moves into the epic's folder when the epic closes.

In folders:

- `epic-NN/` (`epic-01` to `epic-31`): the records of one epic. `epic-N-context.md` (the short context its batches read, with the wave and deploy records), `spec-*.md` per story or batch, `epic-N-retro-*.md`. Examples: `epic-25/epic-25-context.md`, `epic-27/epic-27-context.md`, `epic-28/epic-28-context.md`, `epic-30/epic-30-context.md`. Epic 29 has only its retrospective.
- `general/`: records of no single epic: review-fix batches (`spec-review-fixes-*.md`), production-pass fixes, the test-speed chores (`spec-test-speed.md`, `spec-t3-serial-split.md`, `spec-t4-api-suite-speed.md`), backlogs, `release-notes-v0.5.0.md`.

## Outside `_bmad-output`

- `docs/concorrentes/` (competitor reading, cite by path only), `docs/archive/display-reading-spike.md`, `docs/nc-chip-phrases.md`, `docs/tablet-https-setup.md`, `docs/observability.md`, `docs/ai-quality-rubric.md`, `docs/DEVELOPMENT.md`, `docs/TESTING.md`.
- Gitignored, absent on other machines, cite by path only: `docs/context/` (among it `docs/context/epic-25/respostas-bruno-2026-11-22.md`, the answers behind Epic 28) and `docs/media/`.

Status of every epic and story is in `sprint-status.yaml` only. On 2026-11-28 Epics 1 to 32 are delivered; production runs v0.17.0 (`c06428e0`).
