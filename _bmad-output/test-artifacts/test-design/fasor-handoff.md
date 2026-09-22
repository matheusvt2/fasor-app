---
title: 'TEA Test Design to BMAD Handoff Document'
version: '1.0'
workflowType: 'testarch-test-design-handoff'
inputDocuments:
  - _bmad-output/test-artifacts/test-design-architecture.md
  - _bmad-output/test-artifacts/test-design-qa.md
  - _bmad-output/test-artifacts/test-design-progress-system.md
  - _bmad-output/planning-artifacts/epics.md
sourceWorkflow: 'testarch-test-design'
generatedBy: 'TEA Master Test Architect'
generatedAt: '2026-09-21'
projectName: 'fasor'
---

# TEA to BMAD Integration Handoff

## Purpose

This document bridges the system-level test design with BMAD's epic and story work. `epics.md` already exists with eleven epics and story acceptance criteria, so the consumer here is a **revision** of those stories (`bmad-create-epics-and-stories` in edit mode, or `bmad-correct-course`), not a first decomposition: the blockers below become acceptance criteria of the named stories, and the P0 scenarios become the ATDD input per story.

## Decisions of record (2026-09-21, Matheus)

| Item | Decision | Effect |
| --- | --- | --- |
| C-4 / B-4 sync trigger | Visible "Sincronizar agora" button on Sync status | Story 1.5 acceptance criterion; EXPERIENCE.md updated; no test-only hook |
| R-023 / B-7 fixture material | **Waived without restriction**: the Porto Seguro fixture and goldens use the real client data | AGENTS.md policy amended; STATIC-002 withdrawn; R-023 status WAIVED (owner Matheus, no expiry) |
| R-011 merge gate | `pnpm verify` mandatory, output pasted in the PR; CI stays post-MVP | Story 1.1 acceptance criterion; AGENTS.md policy line |
| R-009 seed gate | Matheus reviews the seed against FO.SERV-03 before Story 4.1; Bruno reviews the first DOCX in Story 4.8 | Stories 3.1 and 4.8 acceptance criteria |
| B-1, B-2, B-3, B-6 blockers | Added as acceptance criteria in `epics.md` (Stories 1.1, 1.3, 1.4, 1.5, 3.7, 4.8, 8.4) with the 2026-09-21 mark | Handoff applied; no `bmad-correct-course` run needed |
| C-1, C-2, C-3 thresholds | Measure first (Stories 5.1, 7.5, iPad check), then fix numbers | Stay UNKNOWN; `nfr-assess` treats them as CONCERNS until then |
| TC-12 manual iPad check | Matheus runs it in Story 1.8 and at the close of Epics 5, 6 and 8 | Story 1.8 acceptance criterion; evidence in `test-artifacts/manual/` |

## TEA Artifacts Inventory

| Artifact | Path | BMAD Integration Point |
| --- | --- | --- |
| Architecture test design | `_bmad-output/test-artifacts/test-design-architecture.md` | Blockers B-1 to B-7 (all decided 2026-09-21); risk register; NFR testability requirements |
| QA test design | `_bmad-output/test-artifacts/test-design-qa.md` | Coverage matrix with test IDs per story; dependencies; execution tiers; effort |
| Progress checkpoint | `_bmad-output/test-artifacts/test-design-progress-system.md` | Full working record of steps 1 to 5 |
| Risk assessment | embedded in both documents (R-001 to R-023) | Epic risk classification, story priority |
| Coverage strategy | embedded in the QA document (102 scenarios, `{epic}.{story}-{LEVEL}-{seq}`) | Story test requirements and ATDD input |

## Epic-Level Integration Guidance

### Risk References

| Epic | High-priority risks (score >= 6) owned here | Medium and low risks touching the epic |
| --- | --- | --- |
| Epic 1 Sign in and work on the device | R-001 durability, R-002 kernel identity, R-006 sync semantics, R-011 no CI | R-008, R-014, R-017, R-022 |
| Epic 2 Registries and company identity | R-013 upload queue (files route) | none |
| Epic 3 Seed data and Templates | R-009 seed transcription (score 9); R-023 waived | none |
| Epic 4 Projects, setup, Sumário and tree | R-002 (identity test), R-004 (renderer skeleton) | R-005, R-015, R-018, R-020 |
| Epic 5 Fill the equipment sheet | R-003 parse and criteria | R-018 |
| Epic 6 Photos and points of attention | R-013 upload order and durability | R-012 |
| Epic 7 Generate the relatório | R-004 document fidelity | R-010, R-015 |
| Epic 8 Nameplate from a photo | R-007 suggestion contract | R-016, R-021 |
| Epics 9 to 11 (post-slice, post-MVP) | none in the MVP gate | R-021 (sidecar), CI story for R-011 |

### Quality Gates

| Epic | Gate before the epic closes |
| --- | --- |
| Epic 1 | Replay byte-equality (1.4-INT-001), sync API suite (1.5-API-001..004), three FR-54 scenarios on Chromium and WebKit (1.8-E2E-001..003), two-company test (1.3-API-002), `pnpm verify` documented and used; manual iPad evidence file present |
| Epic 2 | Files API suite (2.2-API-001) green; criterion comparison tests (2.6-UNIT-001) |
| Epic 3 | **R-009 gate:** seed tests (3.1-UNIT-001..004) green and the partner review recorded before Story 4.1; full and small fixtures present (real data, R-023 waiver) |
| Epic 4 | Sumário/pre-issue identity (4.3-UNIT-001, 4.3-E2E-001); skeleton generation with fault flag (4.8-API-001..004) |
| Epic 5 | Parse, compare and conclusion tests (5.5-UNIT-001..002, 5.8-UNIT-001..002); Flow 2 E2E (5.1-E2E-001); first latency measurement for C-2 |
| Epic 6 | Import path E2E (6.4-E2E-001); uploader ordering tests |
| Epic 7 | Golden DOCX on the small fixture and the full fixture (4.8-API-004, 7.5-API-002), draft-equals-issued (7.5-API-001), Export dialog E2E (7.5-E2E-001); `duration_ms` recorded for C-1; partner read-through recorded |
| Epic 8 | Reading job with fake providers (8.4-API-001), suggestion kernel tests (8.1-UNIT-001..002), Flow 2b E2E (8.6-E2E-001) |
| Every epic | P0 100 %, P1 >= 95 %; kernel coverage floors (90 % on `checks/`, `ops/`, `parse/`, `format/`, `print/`); axe on the surfaces touched |

## Story-Level Integration Guidance

### Blockers to add as acceptance criteria

| Story | Acceptance criterion to add | Source |
| --- | --- | --- |
| 1.1 Run the whole stack | `pnpm verify` exists and is documented as the merge condition; `GET /api/health` returns `{status, db, queue, storage, libreoffice}`; a per-company reset script exists for docker-compose only | B-6, TC-6, R-011 |
| 1.3 Sign in | The seed CLI provisions users for two companies; sign-in cookie is `httpOnly; SameSite=Lax; Secure` | B-6, R-008 |
| 1.4 Every change is an operation | Every time-reading kernel function takes `now`; id generation is one injectable `newId()`; the replay test runs the fixture through both layers | B-1, B-2, R-002 |
| 1.5 Sync | A visible "Sincronizar agora" action on Sync status runs one cycle (decided C-4); example op batches and error responses ship in `packages/domain/contract` | B-4, improvement 4 |
| 1.8 Nothing captured is lost | The three FR-54 scenarios run on Chromium and WebKit; the iPad checklist and its evidence file exist | R-001, TC-12 |
| 3.1 Seed the eight block types | Seed tests assert `addendum.md` §9 counts, labels, grammars and criteria completeness; the partner review of the rendered skeleton is recorded | R-009 |
| 3.7 Porto Seguro fixture | The fixture uses the delivered relatório's real data (R-023 waiver) with fixed ids and timestamps; a small one-cabine fixture exists | B-2, TC-8 |
| 4.8 DOCX skeleton | `GENERATE_FAULT` flag in the compose image only; the job records TOC pass results; dates confined to maskable fields | B-3, TC-7 |
| 8.4 Reading job | `fake` providers accept per-photo outcome fixtures (`ok`, `error`, `timeout`) | B-3 |

### P0 and P1 test scenarios that must be acceptance criteria

The full list with IDs is the QA document's Test Coverage Plan. The P0 scenarios per story are:

- **1.3:** 1.3-API-001, 1.3-API-002, 1.3-E2E-001, 1.3-E2E-002
- **1.4:** 1.4-UNIT-001..004, 1.4-INT-001
- **1.5:** 1.5-UNIT-001..002, 1.5-API-001, 1.5-API-002, 1.5-API-004, 1.5-E2E-001
- **1.8:** 1.8-E2E-001..003
- **2.2:** 2.2-API-001
- **2.6:** 2.6-UNIT-001
- **3.1:** 3.1-UNIT-001, 3.1-UNIT-002
- **3.4:** 3.4-UNIT-001
- **4.1:** 4.1-E2E-001
- **4.3:** 4.3-UNIT-001, 4.3-UNIT-002, 4.3-E2E-001
- **4.8:** 4.8-API-001, 4.8-API-004
- **5.1:** 5.1-E2E-001
- **5.5:** 5.5-UNIT-001, 5.5-UNIT-002, 5.5-E2E-001
- **5.8:** 5.8-UNIT-001, 5.8-UNIT-002
- **7.1:** 7.1-UNIT-001
- **7.5:** 7.5-API-001, 7.5-API-002, 7.5-E2E-001
- **8.1:** 8.1-UNIT-001, 8.1-UNIT-002
- **8.4:** 8.4-API-001
- **8.6:** 8.6-E2E-001

### Data-TestId Requirements

The UI system maps React Aria state onto the mockups' class names (`.is-*`, `[data-state]`), so tests prefer roles and pt-BR labels. Stable hooks are still needed where labels repeat or are dynamic:

| Surface | Attribute | Purpose |
| --- | --- | --- |
| Every surface | `data-testid="sync-badge"` with `data-pending`, `data-dead` counts | Sync assertions with `recurse` instead of hard waits |
| Sumário | `data-testid="sumario-row"` with `data-section` and `data-status`; `data-testid="sumario-count-<kind>"` with kind one of fichas, nc, nao-ensaiadas, sugestoes | Row status and header counts equal the kernel result |
| Tree and Block card | `data-testid="block-row"` with `data-block-id`, `data-tag`, `data-sheet-state` | Reorder, restore and state assertions |
| Equipment sheet | `data-testid="cell"` with `data-path` (the op path) and `data-source-suggestion` | Parse echo, criterion hint and provenance glyph assertions |
| Suggestion field | `data-testid="suggestion"` with `data-trust` (suggested or verify) and `data-mode` (fill or replace) | Flow 2b assertions |
| Checklist row | `data-testid="checklist-item"` with `data-item-key` and `data-result` | Tri-state and bulk actions |
| Banner slot | `data-testid="banner"` with `data-kind` | Banner priority assertions |
| Export dialog | `data-testid="export-outstanding"` rows with `data-blocking`; `data-testid="generation-status"` | Pre-issue list and job progress |
| Gallery | `data-testid="photo"` with `data-photo-id`, `data-provisional-number`, `data-upload-state` | Numbering and durability assertions |
| Home | `data-testid="relatorio-card"` with `data-status` and `data-availability` | Status board and card states |

## Risk-to-Story Mapping

| Risk ID | Category | P x I | Recommended Story | Test Level |
| --- | --- | --- | --- | --- |
| R-009 | TECH | 3 x 3 = 9 | 3.1 (seed), reviewed at 4.8 | UNIT, manual review |
| R-001 | DATA | 2 x 3 = 6 | 1.8 | E2E (Chromium, WebKit), manual |
| R-002 | DATA | 2 x 3 = 6 | 1.4, 1.5, 3.7, 4.3 | INT, UNIT |
| R-003 | BUS | 2 x 3 = 6 | 5.5, 5.6 | UNIT, E2E |
| R-004 | BUS | 2 x 3 = 6 | 7.1 to 7.5 | UNIT, API golden, E2E |
| R-006 | DATA | 2 x 3 = 6 | 1.5 | API, UNIT, E2E |
| R-007 | DATA | 2 x 3 = 6 | 8.1, 8.4, 8.6 | UNIT, API, E2E |
| R-011 | OPS | 3 x 2 = 6 | 1.1, Epic 11 CI story | process |
| R-013 | DATA | 2 x 3 = 6 | 2.2, 6.2 | API, UNIT, E2E |
| R-023 | SEC | 2 x 3 = 6 | waived 2026-09-21 | none |
| R-005 | TECH | 2 x 2 = 4 | 4.8 | API |
| R-010 | PERF | 2 x 2 = 4 | 7.5 | API measurement |
| R-012 | TECH | 2 x 2 = 4 | 6.1, 6.4 | E2E, UNIT |
| R-014 | TECH | 2 x 2 = 4 | 1.4 | UNIT |
| R-015 | BUS | 2 x 2 = 4 | 4.6, 7.5 | UNIT, API |
| R-018 | PERF | 2 x 2 = 4 | 4.3, 5.1 | E2E measurement |
| R-019 | TECH | 2 x 2 = 4 | 1.2 and every surface story | CMP, E2E |
| R-021 | TECH | 2 x 2 = 4 | 8.3 | API |
| R-008 | SEC | 1 x 3 = 3 | 1.3, 1.5 | API, E2E |
| R-017 | TECH | 1 x 3 = 3 | 1.5 | UNIT, E2E |
| R-016 | SEC | 1 x 2 = 2 | 8.4 | API |
| R-020 | DATA | 1 x 2 = 2 | 4.5 | UNIT |
| R-022 | OPS | 2 x 1 = 2 | 1.7 | API smoke |

## Recommended BMAD to TEA Workflow Sequence

1. **TEA Test Design** (this run) produces this handoff.
2. **BMAD epics revision** (`bmad-create-epics-and-stories` edit mode or `bmad-correct-course`) already applied on 2026-09-21: blockers added to the named stories in `epics.md`, C-4 decided.
3. **TEA Framework** (`bmad-testarch-framework`) in Story 1.1 scaffolds Playwright with the merged fixtures, the auth provider and `pnpm verify`.
4. **TEA ATDD** (`bmad-testarch-atdd`) per story generates the red-phase tests from the P0 scenarios.
5. **BMAD build** (`bmad-build`) implements each story with its tests.
6. **TEA Automate** (`bmad-testarch-automate`) widens coverage to P1 and P2 at epic close.
7. **TEA Trace** (`bmad-testarch-trace`) produces the traceability matrix and gate decision before 2026-10-03; **TEA NFR** (`bmad-testarch-nfr`) once measurements for C-1 and C-2 exist.

## Phase Transition Quality Gates

| From Phase | To Phase | Gate Criteria |
| --- | --- | --- |
| Test design | Epics revision | All ten high-priority risks have a mitigation with owner and story, or a signed waiver (R-023); C-4 decided. Met 2026-09-21 |
| Epics revision | ATDD | The named stories carry the blockers and P0 scenarios as acceptance criteria |
| ATDD | Implementation | Failing acceptance tests exist for every P0 scenario of the story |
| Implementation | Story merge | `pnpm verify` green; P0 100 %; playwright-utils deviations listed in the PR |
| Epic close | Next epic | Epic gate in the table above met; P1 >= 95 %; manual evidence recorded where required |
| Epic 7 close | Slice gate 2026-10-03 | Trace matrix shows every P0 and P1 scenario of Epics 1 to 7 covered; R-009 residual accepted; partner read-through recorded |
