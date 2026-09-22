---
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-09-21'
workflowType: 'testarch-test-design'
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-fasor-2026-09-19/prd.md
  - _bmad-output/planning-artifacts/prds/prd-fasor-2026-09-19/addendum.md
  - _bmad-output/planning-artifacts/architecture/architecture-fasor-2026-09-21/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/specs/spec-fasor/delivery-slice.md
  - _bmad-output/specs/spec-fasor/source-deltas.md
  - AGENTS.md
  - _bmad/tea/config.yaml
  - .claude/skills/bmad-testarch-test-design/resources/knowledge/risk-governance.md
  - .claude/skills/bmad-testarch-test-design/resources/knowledge/probability-impact.md
  - .claude/skills/bmad-testarch-test-design/resources/knowledge/test-levels-framework.md
  - .claude/skills/bmad-testarch-test-design/resources/knowledge/test-priorities-matrix.md
  - .claude/skills/bmad-testarch-test-design/resources/knowledge/nfr-criteria.md
  - .claude/skills/bmad-testarch-test-design/resources/knowledge/adr-quality-readiness-checklist.md
  - .claude/skills/bmad-testarch-test-design/resources/knowledge/test-quality.md
  - .claude/skills/bmad-testarch-test-design/resources/knowledge/playwright-utils-mandate.md
  - .claude/skills/bmad-testarch-test-design/resources/knowledge/confidence-gate.md
---

# Test Design for Architecture: Releng MVP (fasor), system level

**Purpose:** Architectural concerns, testability gaps and NFR requirements for review by the architect and the developer. This is the contract between test design and engineering on what the architecture must provide before test development starts. The companion `test-design-qa.md` holds the scenarios, tooling and execution recipe.

**Date:** 2026-09-21
**Author:** TEA Master Test Architect (Murat) with Matheus
**Status:** Architecture Review Pending
**Project:** fasor (product working title Releng, UI placeholder PRODUTO)
**PRD Reference:** `_bmad-output/planning-artifacts/prds/prd-fasor-2026-09-19/prd.md` and `addendum.md`
**ADR Reference:** `_bmad-output/planning-artifacts/architecture/architecture-fasor-2026-09-21/ARCHITECTURE-SPINE.md` (AD-1 to AD-27)
**Precedence when sources disagree:** `_bmad-output/specs/spec-fasor/source-deltas.md`, then the spine, then the UX spines, then the PRD.

---

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

## Executive Summary

**Scope:** the whole MVP as the spine defines it, from browser capture on a tablet to the generated FO.SERV-03 relatório as DOCX and PDF. The two-week slice (`delivery-slice.md`, due 2026-10-03) orders delivery; it does not shrink the product. Eleven epics, about sixty stories, no code yet. The MVP runs 100 % locally in docker-compose; AWS is Epic 11.

**Business context** (PRD §1 to §3, addendum §3):

- **Problem:** the engineer fills every sheet twice (paper on site, Word in the office), the write-up lags about fifteen days, and delivery gates billing. The delivered sample had every C/NC/NA cell blank and values above their printed criterion with no NC.
- **Impact:** SM-4, the design partner recognizes the generated document as his FO.SERV-03; the slice's only testable metric on 2026-10-03.
- **Date:** slice 2026-10-03 on Porto Seguro data re-entered by hand; no real job scheduled.

**Architecture** (spine):

- **AD-1, AD-3:** local-first client over IndexedDB; every change is a typed op in one log; `applyOp` is the only reducer on device and server.
- **AD-2:** a pure domain kernel (`packages/domain`) computes every status, count, text, order and verdict once.
- **AD-15:** one server-side renderer over a frozen kernel-typed snapshot; DOCX built with `docx`, PDF by LibreOffice in the same job; two-pass static TOC.
- **AD-12, AD-14:** camera assists are a Suggestion entity with provenance; the reading pipeline runs behind `OcrProvider` and LLM interfaces with `fake` fixture providers by default.
- **AD-27:** containers everywhere; Node 24, Hono, Drizzle, PostgreSQL 18, pg-boss, React 19, Dexie, Vitest 5, Playwright 1.63.

**Expected scale** (NFR-8): one tenant, one active device per relatório, 94 equipment sheets, about 82 photographs (design capacity 500), pushes of at most 500 ops, a 124-page document.

**Risk summary:**

- **Total risks:** 23
- **High priority (score >= 6):** 10, one at score 9 (seed transcription)
- **Test effort:** about 103 planned scenarios, 115 to 190 hours embedded in the stories (there is no separate QA team)

---

## Quick Guide

### BLOCKERS: decide before the stories they gate

1. **B-1 Clock injection (TC-1):** every kernel function that reads time (`calibrationCheck`, the 5-day unsynced banner, `deadlineFromPriority`, photo `captured_at` fallback, session sliding) takes `now` as an argument; both apps pass it from one clock module. Owner: architect, Story 1.4.
2. **B-2 Deterministic ids and fixtures (TC-2):** id generation behind one injectable `newId()`; the fixture op log ships with fixed ids and timestamps; the DOCX layout spec confines generation time to maskable fields (revision line, date). Owner: architect, Stories 1.4, 3.7, 4.8.
3. **B-3 Fault injection for the two jobs (TC-3):** `fake` providers accept per-photo outcome fixtures (`ok`, `error`, `timeout`); the generate job honours a `GENERATE_FAULT` flag present only in the docker-compose api image, never in production config. Owner: developer, Stories 4.8, 8.4.
4. **B-4 Sync trigger for tests (TC-4):** decided 2026-09-21: a visible "Sincronizar agora" button on Sync status runs one cycle; tests use it instead of the 60 s timer. Owner: developer, Story 1.5.
5. **B-5 Seed gate (R-009):** seed tests against `addendum.md` §9 and the partner's review of the rendered skeleton must exist before Story 4.1 instantiates anything. Owner: Story 3.1 developer and Matheus.
6. **B-6 Seeding and reset path (TC-9):** the seed CLI provisions test users for two companies; a docker-only reset script truncates one company's ops, files and jobs between suites; seeding itself goes through `POST /api/sync/ops`. Owner: developer, Stories 1.1, 1.3.
7. **B-7 Fixture material (R-023):** waived 2026-09-21 by Matheus: the fixture and goldens use the real client data without restriction; AGENTS.md amended. No test work remains.

**Status:** all seven blockers decided on 2026-09-21 (see Decisions of record); B-1, B-2, B-3, B-6 are acceptance criteria in `epics.md`.

### HIGH PRIORITY: validate the recommendation

1. **R-001 Field durability:** three FR-54 scenarios on Chromium and WebKit plus a manual iPad checklist whose evidence is saved under `test-artifacts/manual/`; the 500 MB storage-low threshold stays provisional until that check (C-3). Approve: Matheus.
2. **R-002 Kernel identity:** both `toSnapshot()` adapters and the replay byte-equality test land in Epic 1; the fixture op log is built in parallel in Epic 3, not after Epic 7. Approve: architect.
3. **R-004 Document fidelity:** golden comparison at unpacked DOCX XML level with a mask list; PDF compared by extracted text and outline, never bytes; the TOC pass-2 assertion is a job result the test reads (TC-7). Approve: architect.
4. **R-006 Sync semantics:** the sync API suite is part of Story 1.5, before any surface depends on sync.
5. **R-011 No CI by policy:** `pnpm verify` (lint, kernel unit, api integration, Playwright `@p0`) is the documented, mandatory pre-merge gate from Story 1.1; a GitHub Actions story goes into Epic 11. Approve: Matheus.
6. **TC-6 Health endpoint content** `{status, db, queue, storage, libreoffice}`; **TC-8** only two E2E tests generate the full fixture, everything else uses a small fixture; **TC-12** iPadOS eviction and camera are manual evidence, WebKit desktop is the automated proxy.
7. **Performance thresholds are UNKNOWN** (C-1 generation time, C-2 "immediate" latencies): measure on the fixture first, then the PM sets numbers; no value is guessed.

### INFO ONLY: solutions provided

1. **Test strategy:** kernel-heavy pyramid. Business rules are asserted once at unit level in `packages/domain`; API tests assert wire semantics and persistence; E2E asserts the offline path and that kernel results reach the user. Three Playwright projects: desktop Chrome, Android Chrome emulation, WebKit for `src/db` and `src/sync`.
2. **Coverage:** about 102 scenarios, 43 P0, 54 P1, 5 P2, mapped to stories by id (`{epic}.{story}-{LEVEL}-{seq}`); see the QA doc.
3. **Tiers:** PR gate under 15 min, story full run, epic close, manual device check; details in the QA doc.
4. **Contract testing:** Pact is not applicable (one repository, one client, one server); the OCR sidecar contract is covered by an in-repo JSON Schema conformance test.
5. **Tooling and access:** in the QA doc.

---

## For Architects and Devs: Open Topics

### Risk Assessment

**Total risks identified:** 23 (10 high priority with score >= 6, 8 medium, 5 low). Scoring per `probability-impact.md`: P 1 unlikely, 2 possible, 3 likely; I 1 minor, 2 degraded, 3 critical.

#### High-Priority Risks (score >= 6): immediate attention

| Risk ID | Category | Description | P | I | Score | Mitigation | Owner | Timeline |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **R-009** | **TECH** | Seed data transcription errors (field lists, kinds and units, five checklists, four table grammars, criteria, boilerplate, template skeleton); every sheet and the document inherit them; the source document is gitignored | 3 | 3 | **9** | Seed tests against `addendum.md` §9; criterion without operator, type or source rejected at seed time; partner review of the rendered skeleton; seed versions append-only. Residual after mitigation 2 x 3 = 6 | Story 3.1 dev, Matheus, design partner | Epic 3, before Story 4.1 |
| **R-001** | **DATA** | Offline durability fails on the field device (Safari eviction, quota exhaustion, tab killed mid-write) | 2 | 3 | **6** | Three FR-54 scenarios on Chromium and WebKit; eviction-recovery screen; 5-day banner; manual iPad evidence | Story 1.8 dev, Matheus | Epic 1, before Epic 5 |
| **R-002** | **DATA** | Device and server kernels diverge (two `toSnapshot()`, Dexie vs Drizzle, coalescing) so the Sumário and the export disagree or `409 not_caught_up` never clears | 2 | 3 | **6** | Replay byte-equality on the fixture through both layers; Sumário/pre-issue identity test; coalescing unit tests; generate after flush returns 200 | Stories 1.4, 1.5, 3.7, 4.3 | Epics 1 to 4 |
| **R-003** | **BUS** | pt-BR parse, unit scaling or criterion direction wrong: a wrong value under a signature, or a failing value not flagged | 2 | 3 | **6** | Parsing only at the input boundary in `packages/domain/parse`; table-driven and property tests; echo before compare; E2E with the addendum §3 defect (251 µΩ against < 250 µΩ) | Stories 5.5, 5.6 | Epic 5 |
| **R-004** | **BUS** | The document is not FO.SERV-03: section 9 grouping or pairing wrong, numbering drift between preview and issue, sub-block omission wrong, TOC pages wrong | 2 | 3 | **6** | Kernel print-function tests; golden DOCX with masks; draft-equals-issued; TOC pass-2 assertion; partner read-through recorded | Stories 7.1 to 7.5 | Epic 7 |
| **R-006** | **DATA** | Sync semantics wrong: a rejected op blocks a batch, a dead op re-enters state, rebase clobbers pending edits, the cursor passes an unparseable op | 2 | 3 | **6** | Sync API suite (codes, per-op atomicity, idempotency, seq, pulls, 426); rebase unit tests; offline-edit round trip E2E | Story 1.5 | Epic 1 |
| **R-007** | **DATA** | Suggestion contract leaks: a pending value written, counted, printed or auto-confirmed wrongly | 2 | 3 | **6** | `applyOp` provenance tests; `progress`, `preIssue`, `syncCounts`, renderer ignore `pending`; `compareSuggestion` cases; client push of `suggestion` create refused with 403; Flow 2b E2E | Stories 8.1, 8.4, 8.6 | Epic 8 |
| **R-011** | **OPS** | No CI by policy; one developer; a merge can skip the suite | 3 | 2 | **6** | `pnpm verify` mandatory gate with output in the PR; full run at epic close; suite kept under 15 min; CI story post-MVP | Matheus | Story 1.1, ongoing |
| **R-013** | **DATA** | Photo upload queue: duplicate objects on retry, `409 file_row_missing` not retried, one failed file blocks the queue, priority order wrong | 2 | 3 | **6** | Files API tests (idempotency by `sha256`, 409, 413, mime); uploader unit tests with an injected transport; network-drop E2E | Stories 2.2, 6.2 | Epics 2, 6 |
| **R-023** | **SEC** | The Porto Seguro fixture and goldens carry client material (name, CNPJ, site, coordinates, serials, photos) into a public repository | 2 | 3 | **6** | **WAIVED 2026-09-21 by Matheus, no expiry:** real data used without restriction; AGENTS.md amended; exposure accepted | Matheus | Closed |

#### Medium-Priority Risks (score 4 to 5)

| Risk ID | Category | Description | P | I | Score | Mitigation | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R-005 | TECH | LibreOffice in the container: fonts, timeout, profile leak, TOC non-convergence | 2 | 2 | 4 | Skeleton story 4.8 first; fault flag test; font presence asserted in the image | Story 4.8 |
| R-010 | PERF | Generation time for 124 pages / 82 photos UNKNOWN; certificate rasterization; concurrency 1 | 2 | 2 | 4 | Measure `duration_ms` on the fixture, then a threshold (C-1); progress and failure state in the Export dialog | Story 7.5, PM |
| R-012 | TECH | Camera, geolocation, EXIF and HEIC paths hard to automate and browser-specific | 2 | 2 | 4 | Import path automated with EXIF fixtures; Chromium fake media; `setGeolocation`; manual iPad camera | Stories 6.1, 6.4 |
| R-014 | TECH | UTC storage vs America/Sao_Paulo display, date windows, photo sort key; flaky without clock control | 2 | 2 | 4 | B-1 clock injection; TZ pinned in containers and Playwright | Story 1.4 |
| R-015 | BUS | Status table or `editedSince` family set wrong: stale revision returned, Emitido never returns to Em revisão | 2 | 2 | 4 | Table-driven unit tests; generate twice without edits returns the same revision | Stories 4.6, 7.5 |
| R-018 | PERF | Client performance on 94 blocks with `useLiveQuery`; "immediate" UNKNOWN | 2 | 2 | 4 | Playwright timings on the fixture; PM sets the number (C-2) | Stories 4.3, 5.1, PM |
| R-019 | TECH | Accessibility and ergonomics regressions (React Aria mapping, contrast, target size, keyboard reorder) | 2 | 2 | 4 | axe-core per surface; bounding-box assertions; waiver for the disabled 2.04:1 residual | Story 1.2 onward |
| R-021 | TECH | OCR sidecar contract drift and bbox pixel-space mapping (post-slice) | 2 | 2 | 4 | In-repo schema conformance test on fixture images; normalization unit test | Story 8.3 |

#### Low-Priority Risks (score 1 to 3)

| Risk ID | Category | Description | P | I | Score | Action |
| --- | --- | --- | --- | --- | --- | --- |
| R-008 | SEC | Cross-tenant read, 401 dropping queued work, weak cookie flags | 1 | 3 | 3 | Document; tested as P0 regardless (two-company test, 401 outbox test, cookie flags) |
| R-017 | TECH | Contract skew and Dexie upgrades: outbox lost on upgrade, 426 treated as a generic error | 1 | 3 | 3 | Document; outbox-survives-upgrade test is mandated by NFR-17 |
| R-016 | SEC | A real reading provider enabled locally by misconfiguration (LGPD, post-MVP) | 1 | 2 | 2 | Document; config default test |
| R-020 | DATA | Tombstones counted, printed or blocking a TAG | 1 | 2 | 2 | Document; kernel tests |
| R-022 | OPS | Local HTTPS for tablets and manual device checks undocumented | 2 | 1 | 2 | Document; health smoke over the HTTPS origin; written checklist |

#### Risk Category Legend

TECH technical and architecture; SEC security and data exposure; PERF performance and capacity; DATA data integrity; BUS business logic and user-visible harm; OPS deployment, configuration and process.

---

### NFR Testability Requirements

Planning guidance for later automated validation; final PASS/CONCERNS/FAIL belongs to `nfr-assess` once evidence exists.

| NFR Category | Threshold / Requirement | Design Support | Gap / Decision Needed | Planned Evidence |
| --- | --- | --- | --- | --- |
| Security (NFR-13, AD-9, AD-10, AD-3) | Zero cross-tenant reads; client push of a server-only family is 403; cookie `httpOnly; SameSite=Lax; Secure`, 30-day sliding; 25 MB file limit and mime allowlist; no signup | Supported | RLS deferred until the second company (accepted) | API tests; `pnpm audit` in `pnpm verify` |
| Performance (NFR-7) | Sheet open, checklist tap and photo capture "immediate"; generation time for 124 pages | **UNKNOWN** | C-1, C-2: measure on the fixture, PM sets numbers | Playwright timing JSON; job `duration_ms` in structured logs |
| Reliability (NFR-1, NFR-2, AD-8, AD-24, AD-14) | Zero loss in the three FR-54 scenarios; retry table; reading 3 attempts then `failed`; health up | Supported, minus B-3 fault hooks and TC-6 health content | B-3, TC-6 | Playwright scenarios with traces; API fault tests; manual iPad evidence file |
| Capacity (NFR-8) | 94 sheets, 82 photos (500 design), <= 500 ops per push, 1,100 queued readings post-slice | Supported | none; k6 not planned for one tenant | Fixture runs; push-splitting unit test; 500-photo API test |
| Maintainability (AD-2, AD-13, NFR-17) | Kernel purity; `fetch` only in three modules; dependency direction; mandated tests present | Supported by lint rules named in the spine | none | eslint output; Vitest coverage on `packages/domain` |
| Compliance (NFR-10, NFR-14, NFR-5) | No criterion without operator, type, source; never "annual"; app never suggests Reprovado or Não apto; exactly one blocking pre-issue row; pt-BR verbatim labels | Supported | none | Kernel tests |
| Accessibility and ergonomics (NFR-3, NFR-4, AD-23) | WCAG 2.2 AA; 7:1 and 4.5:1 contrast; 48/56 px targets; no hover-only; no swipe; keyboard reorder | Supported; one accepted residual (disabled 2.04:1 with adjacent reason) | none | axe-core per surface; bounding boxes; waiver record |
| Design fidelity and naming (NFR-15, NFR-16) | `tokens.css` and `components.css` unchanged; no codename or emoji in user-visible strings and documents | Supported | none | Static diff and grep tests |
| Privacy (NFR-11) | No consent gate in the POC; purge never precluded | Deferred by decision | none for the MVP | Config default test |

**Unknown thresholds:** C-1 generation time tolerance; C-2 "immediate" latency budget on a mid-range Android tablet; C-3 storage-low threshold (500 MB provisional). Each is a clarification item, not a guessed value.

**ADR Quality Readiness summary (29 criteria):** 13 covered, 11 gaps, 5 not assessed because they are post-MVP (disaster recovery, zero-downtime deploy, rollback, SLA, throttling). The gaps that act inside the MVP are the seven blockers above plus: no sample op batches in the contract documentation (add examples to `packages/domain/contract`), no dynamic log-level toggle, no metrics endpoint (accepted), tracing by ids only (accepted).

---

### Testability Concerns and Architectural Gaps

**ACTIONABLE CONCERNS: the architecture must address these.**

#### 1. Blockers to Fast Feedback

| Concern | Impact | What Architecture Must Provide | Owner | Timeline |
| --- | --- | --- | --- | --- |
| **No clock injection (TC-1)** | Date-window and banner tests depend on wall clock | `now` argument on every time-reading kernel function; one clock module per app | Architect | Story 1.4 |
| **Non-deterministic ids and timestamps (TC-2)** | Byte-equality and golden tests cannot be written | Injectable `newId()`; fixed-id fixture; maskable date fields in the layout spec | Architect | Stories 1.4, 3.7, 4.8 |
| **No fault injection for jobs (TC-3)** | Failure paths of generate and reading untestable | Outcome fixtures for `fake` providers; `GENERATE_FAULT` in the compose image only | Developer | Stories 4.8, 8.4 |
| **60 s sync timer only (TC-4)** | Every sync E2E becomes a hard wait | Decided: visible "Sincronizar agora" on Sync status | Developer | Story 1.5 |
| **No seeding or reset path (TC-9)** | Suites cannot isolate or parallelize | Two-company seed CLI; per-company reset script for docker-compose | Developer | Stories 1.1, 1.3 |
| **Health endpoint content undefined (TC-6)** | Cannot tell DB, queue, storage, LibreOffice apart | `{status, db, queue, storage, libreoffice}` | Developer | Story 1.1 |
| **Fixture carries client material (R-023)** | Public repository exposure | Waived by Matheus 2026-09-21; nothing to provide | Matheus | Closed |

#### 2. Architectural Improvements Needed

1. **Comparable document output (TC-7).** Problem: PDF bytes vary per LibreOffice run and DOCX embeds dates. Change: the generate job returns TOC pass results in `generation_job` status; the layout spec confines dates to named fields; tests compare unpacked DOCX XML with masks and PDF text and outline. Impact if not fixed: R-004 has no automated proxy. Owner: architect. Timeline: Story 4.8.
2. **Small fixture beside the Porto Seguro fixture (TC-8).** Problem: generate concurrency is 1 and the full document is 124 pages; every generation test would serialize on it. Change: a one-cabine, three-block fixture relatório for all API-level generation checks; only two E2E tests use the full fixture. Owner: developer. Timeline: Story 3.7.
3. **Manual evidence path (TC-12).** Problem: iPadOS eviction and camera cannot be automated. Change: a checklist with recorded evidence under `test-artifacts/manual/`, run in Story 1.8 and once per epic touching capture or sync. Owner: Matheus. Timeline: Story 1.8.
4. **Sample requests in the contract (ADR 1.4).** Problem: the contract has zod schemas but no example op batches or error responses. Change: `packages/domain/contract` ships one valid and one invalid example per route, reused as test fixtures. Owner: developer. Timeline: Story 1.5.

---

### Testability Assessment Summary

**CURRENT STATE, FYI.**

#### What Works Well

- One log, one reducer (AD-3): every state is a replayable op log; fixtures are op logs and seeding is a push.
- Pure kernel (AD-2): every status, count, text, order and verdict is a pure function testable in Vitest with no I/O; UI tests only need to assert that a kernel result is rendered.
- Provider selection by environment (AD-14): `fake` providers make the reading pipeline runnable with no cost or network.
- Explicit error envelope and codes (AD-13, AD-24): `{applied, rejected, superseded}` and enumerated codes make API assertions exact.
- Same origin and cookie session (AD-9): one auth surface, no CORS.
- Containers everywhere (AD-27): the test environment is the shipped api image, LibreOffice and fonts included.
- Mandatory tests already named by the architecture (NFR-17): replay byte-equality, Sumário/pre-issue identity, cross-tenant, seed, renderer golden, draft-equals-issued, outbox-survives-upgrade, the three FR-54 scenarios.
- Structured logs with `company_id`, `relatorio_id`, `job_id` and per-run `reading_run` rows.

#### Accepted Trade-offs (no action required)

- WebKit desktop is the automated proxy for iPadOS Safari; eviction and camera are manual.
- No metrics endpoint, no tracing beyond ids, no APM in the MVP.
- Row-level security deferred until the second company; application scoping is tested instead.
- No CI by policy; compensated by the `pnpm verify` gate and epic-close runs.
- No load testing (k6): one tenant, one active user; revisit before the second company.
- Pact contract testing not applicable to a single repository.

---

### Risk Mitigation Plans (high-priority risks, architecture and backend owned)

Test-owned mitigations are in the QA doc; the plans below are production code and process changes.

#### R-009: Seed transcription (score 9), BLOCK

1. Story 3.1 encodes `addendum.md` §9 as the only seed source; kernel seed tests assert counts, verbatim labels, grammars and criteria completeness.
2. The seed rejects any criterion without operator, type and source at load time.
3. The design partner reviews the rendered skeleton (Story 4.8 output) against FO.SERV-03; the review is recorded in the story.
4. Seed versions are append-only; a correction is a new version and existing relatórios keep theirs.

**Owner:** Story 3.1 developer, Matheus, design partner. **Timeline:** Epic 3, before Story 4.1. **Status:** Planned. **Verification:** seed tests green; review recorded; residual score 6.

#### R-001: Field durability (score 6)

1. Story 1.8 implements drafts on `visibilitychange`/`pagehide`, the eviction recovery screen, the storage-low warning and the immediate-upload fallback exactly as AD-8 states.
2. The Blob write and the `file/{id}` create op share one IndexedDB transaction (AD-7).
3. WebKit is a Playwright project for `src/db` and `src/sync`; the iPad checklist runs in Story 1.8 with evidence saved.
4. If Safari fails, the slice ships desktop and Android only (PRD Q0 branch).

**Owner:** Story 1.8 developer, Matheus. **Timeline:** Epic 1, before Epic 5. **Status:** Planned. **Verification:** three FR-54 scenarios green on two engines; evidence file present.

#### R-002: Kernel identity (score 6)

1. Both `toSnapshot()` adapters and the replay test land in Story 1.4 and 1.5; the fixture op log (Story 3.7, real data under the R-023 waiver) is built in parallel.
2. Outbox coalescing follows the AD-3 rule verbatim and is unit tested.
3. `applyOp` is the only materializer on both sides; lint forbids a second one.

**Owner:** architect, Stories 1.4, 1.5, 3.7, 4.3. **Timeline:** Epics 1 to 4. **Status:** Planned. **Verification:** byte-equal snapshots on the fixture; identity test green.

#### R-003: Parse and criterion comparison (score 6)

1. Parsing exists only in `packages/domain/parse` and runs at the input boundary; the UI echoes the parsed value before comparison (AD-11).
2. Number values are `{raw, unit, state}` decimal strings; no floats in storage.
3. Unit scaling and operator direction are one comparison function with a source-carrying criterion.

**Owner:** Stories 5.5, 5.6. **Timeline:** Epic 5. **Status:** Planned. **Verification:** kernel table and property tests green; the addendum §3 defect reproduced and flagged in E2E.

#### R-004: Document fidelity (score 6)

1. Story 4.8 proves the renderer path (cover, document control, TOC, section text) before Epic 7 adds sections 7 to 11.
2. The job records TOC pass results; the layout spec isolates dates (TC-7).
3. `groupForPrint`, `numberPhotos`, `resolveSection8`, `derivedPoints` are kernel functions with no renderer-side ordering.

**Owner:** Stories 7.1 to 7.5. **Timeline:** Epic 7. **Status:** Planned. **Verification:** golden DOCX and draft-equals-issued tests green; partner read-through recorded.

#### R-006: Sync semantics (score 6)

1. Story 1.5 implements AD-24 verbatim: per-op atomicity, shape-only rejection, dead-op exclusion and retry, rebase, cursor rule, `superseded`.
2. Example op batches and error responses ship in the contract (improvement 4).

**Owner:** Story 1.5. **Timeline:** Epic 1. **Status:** Planned. **Verification:** sync API suite and offline round-trip E2E green.

#### R-007: Suggestion contract (score 6)

1. `suggestion/{id}` create is server-only; confirm and discard are single batches; `compareSuggestion` runs on the device (AD-12).
2. `RelatorioSnapshot` carries only suggestions referenced by a current cell.

**Owner:** Stories 8.1, 8.4, 8.6. **Timeline:** Epic 8. **Status:** Planned. **Verification:** kernel and API tests green; Flow 2b E2E green.

#### R-011: No CI (score 6)

1. Story 1.1 ships `pnpm verify` and documents it in AGENTS.md as the merge condition; its output is pasted in every PR.
2. Epic 11 gains a GitHub Actions story.

**Owner:** Matheus. **Timeline:** Story 1.1, ongoing. **Status:** Planned. **Verification:** every merged PR shows the gate output.

#### R-013: Upload queue (score 6)

1. Story 2.2 implements `PUT /api/files/{id}` idempotent by `sha256` with `409 file_row_missing` and `413`; Story 6.2 implements the AD-7 order, two in flight, failed file skipped.
2. The uploader takes an injected transport so faults are unit-testable.

**Owner:** Stories 2.2, 6.2. **Timeline:** Epics 2 and 6. **Status:** Planned. **Verification:** files API tests and network-drop E2E green; one object per file on MinIO.

#### R-023: Fixture material (score 6), WAIVED

Waived by Matheus on 2026-09-21 without restriction: the fixture and goldens carry the delivered relatório's data as is. Recorded in AGENTS.md "Decisions of record". No mitigation work; the risk is accepted, not reduced.

---

### Assumptions and Dependencies

#### Assumptions

1. One active device fills a relatório at a time (source-deltas, 2026-09-21); multi-device merge is out of the MVP test scope.
2. The `fake` providers reproduce the real providers' response shapes exactly as `contract/ocr` and the LLM structured-output schema define them.
3. The `[ASSUMPTION]` values in the spine (500 ms commit idle, 60 s sync tick, 500 MB storage-low, 25 MB file limit, 2560 px re-encode, two uploads in flight, 5-day banner) are the tested values until the PM or the iPad check changes them.
4. WebKit desktop approximates iPadOS Safari for IndexedDB and service-worker behaviour except storage eviction.
5. LibreOffice 26.2 layout is stable within the slice; the 26.8 move (before 2026-11-30) re-baselines the goldens.
6. The Porto Seguro fixture reproduces the delivered relatório with its real data (R-023 waiver), so the goldens are the document Bruno signed.

#### Dependencies

1. Seed data and seed tests (Story 3.1) before Story 4.1.
2. Synthetic Porto Seguro fixture and small fixture (Story 3.7) before the identity, golden and full-fixture E2E tests.
3. api image with LibreOffice and fonts in docker-compose (Story 4.8) before any generation test.
4. Two-company seed CLI and reset script (Stories 1.1, 1.3) before the API suites.
5. An iPad and an Android tablet on the local HTTPS origin (Story 1.7) for Story 1.8's manual check.
6. PM numbers for C-1 and C-2 after the first measurements in Stories 5.1 and 7.5.

#### Risks to Plan

- **Risk:** the slice slips and assists retreat in the cut order. **Impact:** Epic 8 tests move out of the 2026-10-03 gate. **Contingency:** the plan is ordered by story; nothing in Epics 1 to 7 depends on Epic 8 tests.
- **Risk:** the full fixture (Story 3.7) lands late. **Impact:** R-004 proxy arrives late. **Contingency:** the small fixture carries the golden harness first; the full fixture only adds scale.
- **Risk:** iPadOS Safari fails the offline proof. **Impact:** WebKit tests become the only Safari evidence. **Contingency:** PRD Q0 branch, desktop and Android only; the zero-loss guarantee is unchanged.
- **Risk:** the 15-minute PR gate is exceeded and stops being run. **Impact:** R-011 materializes. **Contingency:** move `@slow` and axe suites to epic close; keep `@p0` under 10 minutes.

---

**End of Architecture Document.**

**Next steps for the architect and developer:** build Stories 1.1 to 1.5 with the added acceptance criteria; assign the numbers C-1 to C-3 after the first measurements.

**Next steps for test design:** the scenarios, tooling and execution recipe are in `test-design-qa.md`; the BMAD handoff is in `test-design/fasor-handoff.md`; `bmad-testarch-atdd` can start from the P0 scenarios once Story 1.1 lands.
