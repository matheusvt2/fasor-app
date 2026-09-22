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

# Test Design for QA: Releng MVP (fasor) — system level

**Purpose:** Test execution recipe for the people who build and verify Releng. Defines what to test, how to test it, and what the test work needs from the architecture and the stories before it can start.

**Date:** 2026-09-21
**Author:** TEA Master Test Architect (Murat) with Matheus
**Status:** Draft
**Project:** fasor

**Related:** See Architecture doc (`test-design-architecture.md`) for testability concerns TC-1 to TC-12, ASR-1 to ASR-15 and the full risk register with owners and timelines.

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

**Scope:** The whole MVP as the architecture spine defines it (AD-1 to AD-27): the pure domain kernel in `packages/domain`, the offline-first tablet client in `apps/web`, the sync, file, generation and reading API in `apps/api`, and the docker-compose environment they run in. Work is ordered by the two-week delivery slice due 2026-10-03 (`delivery-slice.md`): the seed, the op log and sync, the Sumário, the sheets, the photos and the FO.SERV-03 relatório as DOCX and PDF come first; the reading pipeline runs on `fake` providers and the OCR sidecar is post-slice.

**Risk Summary:**

- Total Risks: 23 (10 high-priority score ≥ 6, of which one scores 9; 8 medium score 4 to 5; 5 low score 1 to 3)
- Critical Categories: DATA (five high risks: R-001, R-002, R-006, R-007, R-013), BUS (R-003, R-004), TECH (R-009, the only BLOCK), SEC (R-023, waived 2026-09-21), OPS (R-011)

**Coverage Summary:**

- P0 tests: ~43 (kernel invariants, sync semantics, durability, tenant isolation, the golden document)
- P1 tests: ~54 (surface E2E, component tests, accessibility, registry and template flows, fault paths and seed normalizations demoted from P0)
- P2 tests: ~5 (secondary flows, contract skew, static naming tests)
- P3 tests: ~0 (none planned)
- **Total**: ~102 scenarios, 115 to 190 hours of test work embedded in the stories.

P0 is applied strictly (critical data, safety, security or compliance impact with no workaround): seven scenarios that a golden test already covers or that have a manual workaround sit at P1. Each scenario expands to several test cases, so the P0 share of the executed suite is expected to be well under the scenario share.

Effort is stated in hours, not weeks, because there is no separate QA team: AGENTS.md says nothing ships untested, so the test work is embedded in each story and done by the same developer and the implementation subagents.

---

## Not in Scope

**Components or systems explicitly excluded from this test plan:**

| Item | Reasoning | Mitigation |
| --- | --- | --- |
| **Multi-device merge and Conflict view (FR-58, FR-59, FR-60)** | Post-slice; the slice runs one device per relatório | Sync rebase and `superseded` reporting are still tested (1.5-UNIT-001, 1.5-API-003); the Conflict view is planned with its story |
| **Real Claude and Textract providers, AWS deployment (Epic 11)** | Post-MVP by policy: no cloud account or paid API key before the AWS deploy; `LLM_PROVIDER` and `OCR_PROVIDER` default to `fake` | Provider contract shape tested now with `fake` fixtures (8.4-API-001, 8.4-API-002); config default asserted (8.4-API-003); GitHub Actions and real providers are Epic 11 stories |
| **OCR sidecar display reading (FR-36)** | Post-slice (`services/ocr`, Python sidecar) | Only the in-repo contract conformance test on fixture images (8.3-API-001) and bbox normalization (8.4-UNIT-001) are planned now |
| **Dictation and the rich text editor** | Not in the slice; mockups mark them out of scope (MOCK-GUIDE) | Nothing to mitigate; section text editing with variable chips is covered by 4.7-E2E-001 |
| **iPadOS Safari storage eviction and camera automation** | Cannot be driven headless; WebKit desktop is the only automated proxy (TC-12) | Manual device checklist with recorded evidence under `test-artifacts/manual/ipad-YYYY-MM-DD.md`; automated `quota exhausted` scenario mocks `navigator.storage.estimate` and `QuotaExceededError` (1.8-E2E-003) |
| **k6 load testing** | One tenant, one active user at a time; API latency under load is not an MVP concern | Capacity is asserted functionally on the Porto Seguro fixture (7.5-API-002) and the 500-photo relatório (`@slow`); revisit before the second company |
| **Pact contract testing** | Single monorepo, one client and one server, no Pact artifacts; the Pact MCP is unreachable | Contract skew is covered by 1.5-UNIT-004 and 1.5-API-005; the OCR contract by an in-repo JSON Schema test |

**Note:** Items listed here have been reviewed and accepted as out of scope by Matheus, who holds the developer, product owner and QA roles on this project.

---

## Dependencies & Test Blockers

**CRITICAL:** The test work cannot proceed without these items from the architecture and the stories that own them.

### Backend/Architecture Dependencies (Pre-Implementation)

**Source:** See Architecture doc "Quick Guide" for detailed mitigation plans.

1. **TC-1 Clock injection** - kernel (Story 1.4, before Story 2.1)
   - Every kernel function that reads time (`calibrationCheck` 30-day window, 5-day unsynced banner, `deadlineFromPriority`, photo `captured_at` fallback, 30-day sliding session, `client_ts`) takes `now: Date` or a `Clock`; `apps/web` and `apps/api` pass it from one clock module; Playwright uses `page.clock`.
   - Without it, kernel tests are wall-clock dependent and the 5-day banner and calibration scenarios are flaky (R-014).

2. **TC-2 Deterministic ids and masks** - kernel and fixtures (Stories 1.4, 3.7, 4.8)
   - Id generation behind one injectable `newId()`; the Porto Seguro op-log fixture ships with fixed ids and timestamps; the DOCX layout embeds generation time only in the fields the golden test masks (revision line, dates).
   - Without it, the replay byte-equality test (1.4-INT-001), the golden DOCX tests (4.8-API-004, 7.5-API-002) and draft-equals-issued (7.5-API-001) cannot compare.

3. **TC-3 Fault flags and fake provider outcome fixtures** - api (Stories 4.8, 8.4)
   - `fake` providers accept fixture files that declare `{outcome: ok | error | timeout}` per photo id; the generate job accepts a test-only env flag (`GENERATE_FAULT=libreoffice_timeout`) in the api image, never in production config.
   - Without it, 4.8-API-002 and 8.4-API-002 (three attempts then `failed`) cannot be written.

4. **TC-4 "Sincronizar agora" action** - web (Story 1.5; decided 2026-09-21)
   - Either `window.__releng.syncNow()` guarded by `import.meta.env.MODE === 'test'`, or a visible "Sincronizar agora" action on Sync status. Tests then use `recurse` on the sync badge or `sync_state`.
   - Without it, every sync E2E waits for the 60 s tick or uses a hard wait, which the mandate forbids.

5. **TC-6 Health shape** - api (Story 1.1)
   - `GET /api/health` returns `{status, db, queue, storage, libreoffice}`.
   - Without it, 1.1-API-001 cannot tell DB, queue and object storage health apart and the docker-compose smoke has nothing to assert.

6. **TC-9 Seeding via sync push, seed CLI and reset script** - api and test framework (Story 1.3, framework setup)
   - Test factories build op batches (project, relatório via `instantiateTemplate`, sheet values) and push them through `POST /api/sync/ops` with the auth fixture; the seed CLI provisions test users and a second company; a reset script truncates the op log per company between suites (docker-compose only).
   - Without it, there is no way to put a relatório into a known state; the sync push is the only seeding API by design (AD-24).

7. **R-009 Seed gate** - Story 3.1 developer, Matheus and the design partner (Epic 3, before Epic 4)
   - Seed tests 3.1-UNIT-001 to 3.1-UNIT-004 green and the design-partner review of the rendered skeleton recorded in Story 3.1 before Story 4.1 starts.
   - R-009 scores 9 (BLOCK): every sheet and the document inherit a seed transcription error, and the source document is gitignored (TC-11).

### QA Infrastructure Setup (Pre-Implementation)

1. **Merged fixtures** - Story 1.1
   - One `merged-fixtures.ts` under the project's `test_dir` support folder (`<test_dir>/support/merged-fixtures.ts`), composing `apiRequest`, `interceptNetworkCall`, `networkErrorMonitor`, `recurse` and the project auth fixture (playwright-utils mandate). Every spec imports `test` and `expect` from it, never from `@playwright/test`.

2. **Cookie-based auth provider** - Story 1.3
   - `setAuthProvider` plus `createAuthFixtures` over the better-auth cookie session at `/api/auth/*` (same origin, no CORS).

3. **Op-batch factories** - Story 1.3 onward
   - Factories build op batches for a project, a relatório (through the kernel's `instantiateTemplate`) and sheet values, and push them through `POST /api/sync/ops`. Ids and timestamps are fixed through the injectable `newId()` and `now` (TC-2), not faker-randomized, because the byte-equality and golden tests need reproducible input.

4. **Fixtures** - Stories 3.7 and 4.8
   - The Porto Seguro op-log fixture (Story 3.7: 94 sheets, 82 photos, 11 section-9 subsections) and a small fixture relatório (1 cabine, 3 blocks) for every generation check that does not need the full document (TC-8).
   - The Porto Seguro fixture carries the delivered relatório's real data (R-023 waived by Matheus on 2026-09-21; AGENTS.md amended).
   - EXIF photo fixtures (JPEG with EXIF, HEIC) for the import path; fake-media video file for the Chromium camera path.

5. **Test environment** - Story 1.1
   - Local: `docker compose up` starts web (Vite), api (Hono on Node 24, LibreOffice and fonts in the image), PostgreSQL 18 and MinIO; Caddy with mkcert serves the HTTPS origin for tablets. This is the only environment.
   - CI/CD: Not applicable; there is no CI by policy (AGENTS.md), lint and tests run locally before each merge (R-011).
   - Staging: Not applicable; the whole MVP runs locally in docker-compose (AD-27), AWS comes after the MVP.
   - Chromium launched with `--use-fake-device-for-media-stream --use-file-for-fake-video-capture`; `timezoneId: 'America/Sao_Paulo'`; geolocation through `context.setGeolocation`.

**Example factory pattern** (illustration of the pattern; no code exists yet, names are fixed in Stories 1.1 to 1.5):

```typescript
import { test, expect } from '../support/merged-fixtures';
import { relatorioBatch } from '../support/factories/relatorio'; // wraps instantiateTemplate from packages/domain

const FIXED_NOW = new Date('2026-09-21T12:00:00-03:00');

test('@p0 seeds a relatório through the sync push', async ({ apiRequest, authToken }) => {
  const ops = relatorioBatch({
    projectId: 'proj_fixture_01',
    templateId: 'tpl_cabine_primaria_padrao',
    now: FIXED_NOW,
  });

  const { status, body } = await apiRequest({
    method: 'POST',
    path: '/api/sync/ops',
    body: { ops },
    headers: { Cookie: authToken }, // cookie-based provider (setAuthProvider) yields the session cookie
  });

  expect(status).toBe(200);
  expect(body.rejected).toEqual([]);
  expect(body.applied).toHaveLength(ops.length);
});
```

---

## Risk Assessment

**Note:** Full risk details, owners and timelines are in the Architecture doc. This section summarizes the risks relevant to test planning and lists the coverage-matrix IDs that validate each one.

### High-Priority Risks (Score ≥ 6)

| Risk ID | Category | Description | Score | QA Test Coverage |
| --- | --- | --- | --- | --- |
| **R-009** | TECH | Seed data transcription errors (field lists, kinds and units, five checklist lists, four table grammars, criteria, boilerplate, template skeleton); every sheet and the document inherit the error; the source document is gitignored | **9** (BLOCK; residual 6 after mitigation) | 3.1-UNIT-001, 3.1-UNIT-002, 3.1-UNIT-003, 3.1-UNIT-004, 3.4-UNIT-002, 4.1-E2E-001; design-partner review recorded in Story 3.1; seed version append-only |
| **R-001** | DATA | Offline durability fails on the field device (iPadOS Safari eviction, quota exhaustion, tab killed mid-write): sheet values or photos lost before sync | **6** | 1.8-E2E-001, 1.8-E2E-003, 1.8-E2E-004 (Chromium + WebKit); 1.8-E2E-005 banner with `page.clock`; manual iPad checklist with evidence (TC-12) |
| **R-002** | DATA | Device and server kernels diverge (two `toSnapshot()`, Dexie vs Drizzle materialization, coalescing rule) so the Sumário and the export disagree or `409 not_caught_up` never clears | **6** | 1.4-UNIT-001, 1.4-UNIT-003, 1.4-INT-001, 3.4-UNIT-001; 4.3-UNIT-001 identity test; 4.8-API-001 (200 after full flush) |
| **R-003** | BUS | pt-BR parse, unit scaling (MΩ/GΩ, µΩ, kV) or criterion operator direction wrong: a value printed under a signature is wrong or a failing value is not flagged | **6** | 2.6-UNIT-001, 5.5-UNIT-001, 5.5-UNIT-002, 5.5-E2E-001 |
| **R-004** | BUS | The generated document is not FO.SERV-03: section 9 grouping or `feeds_block_id` pairing wrong, photo numbering drifts between preview and issue, sub-block omission wrong, TOC pages wrong; SM-4 fails on 2026-10-03 | **6** | 6.3-UNIT-001, 7.1-UNIT-001, 7.1-UNIT-002, 4.8-API-001, 4.8-API-004, 7.5-API-001, 7.5-API-002, 7.5-E2E-001; design-partner read-through recorded as evidence |
| **R-006** | DATA | Sync semantics wrong: a rejected op blocks the batch, a dead op re-enters state, rebase clobbers pending edits, pull advances the cursor past an unparseable op, `superseded` misreported | **6** | 1.5-UNIT-001, 1.5-UNIT-002, 1.5-UNIT-004, 1.5-API-001, 1.5-API-002, 1.5-API-003, 1.5-API-004, 1.5-E2E-001, 1.5-E2E-002 |
| **R-007** | DATA | Suggestion contract leaks: a pending value is written, counted, printed or auto-confirmed wrongly; confirm and discard batches not atomic | **6** | 8.1-UNIT-001, 8.1-UNIT-002, 1.4-UNIT-004, 8.4-API-001, 8.4-API-002, 8.6-E2E-001 |
| **R-011** | OPS | No CI by policy: one developer, tests run locally, no burn-in, a merge can skip the suite | **6** | Process control, not a test: `pnpm verify` (lint, static, UNIT, INT, API, Playwright `@p0`) documented and used from Story 1.1, output pasted in every PR; full Playwright run at each epic close; suite kept under 15 min; GitHub Actions proposed as a post-MVP Epic 11 story |
| **R-013** | DATA | Photo upload queue: duplicate objects on retry, `409 file_row_missing` not retried, one failed file blocks the queue, reading-priority ordering wrong, thumb replaced before upload | **6** | 2.2-API-001, 1.5-UNIT-002, 1.8-E2E-002; uploader unit tests with an injected transport (Story 6.2) |
| **R-023** | SEC | The Porto Seguro fixture and goldens carry client material into a public repository | **6** | WAIVED 2026-09-21 by Matheus, no expiry; STATIC-002 withdrawn; no QA coverage |

### Medium/Low-Priority Risks

| Risk ID | Category | Description | Score | QA Test Coverage |
| --- | --- | --- | --- | --- |
| R-005 | TECH | LibreOffice in the container: fonts missing, conversion timeout, per-job profile leak, two-pass TOC non-convergent | 4 | 4.8-API-002 (fault flag, no revision allocated); 4.8-API-004 (TOC pass-2 assertion); font presence asserted in the image build test (Story 4.8) |
| R-010 | PERF | Generation time of the 124-page / 82-photo document is UNKNOWN; certificate PDFs rasterized page by page; concurrency 1 | 4 | 7.5-API-002 records `duration_ms` (`@slow`); threshold test after the PM sets the number (C-1); Export dialog progress and failure state in 7.5-E2E-001 |
| R-012 | TECH | Camera, geolocation, EXIF and HEIC paths are untested by automation and differ per browser | 4 | 6.4-E2E-001 (import with EXIF fixtures), 6.1-E2E-001 (Chromium fake media, geolocation granted and denied), 6.1-UNIT-001; manual iPad camera check |
| R-014 | TECH | Time and timezone: UTC storage vs America/Sao_Paulo display, calibration 30-day window, 5-day banner, photo sort key; tests flaky without clock control | 4 | 1.4-UNIT-006 (clock injection), 2.6-UNIT-002, 1.8-E2E-005; TZ pinned in containers and Playwright |
| R-015 | BUS | Status table or `editedSince` family set wrong: revision guard returns a stale revision, Emitido never returns to Em revisão, system ops counted as edits | 4 | 1.6-UNIT-001, 4.8-API-003, 4.6-E2E-001, 7.5-E2E-002 |
| R-018 | PERF | Client performance on the fixture (94 blocks, hundreds of cells, `useLiveQuery` re-renders): sheet open and Sumário not "immediate"; threshold UNKNOWN | 4 | Timing probes inside 4.3-E2E-001 and 5.1-E2E-001 written to the perf JSON; assertion with a generous ceiling after the PM sets the number (C-2) |
| R-019 | TECH | Accessibility and ergonomics regressions (React Aria mapping, contrast, keyboard reorder, target size) | 4 | 1.2-CMP-001, 1.2-CMP-003, A11Y-E2E-001, A11Y-E2E-002, ERGO-E2E-001; waiver for the disabled 2.04:1 residual |
| R-021 | TECH | OCR sidecar contract drift (JSON Schema to pydantic) and bbox pixel-space mapping (post-slice) | 4 | 8.4-UNIT-001, 8.3-API-001 (in-repo contract test, not Pact) |
| R-008 | SEC | Cross-tenant read, or session handling that drops queued work (401), or cookie without `httpOnly; SameSite=Lax; Secure` | 3 (tested as P0) | 1.3-API-001, 1.3-API-002, 1.3-E2E-002 |
| R-017 | TECH | Contract skew and Dexie upgrades: outbox lost on upgrade; 426 handled as a generic error | 3 | 1.5-UNIT-004, 1.5-API-005; the mandated outbox-survives-upgrade test and the "Atualizar" screen E2E named in the mitigation have no matrix row yet and are added with Story 1.5 |
| R-016 | SEC | Reading providers receive client photographs with no LGPD gate (post-MVP); a misconfiguration could enable a real provider locally | 2 | 8.4-API-003 (providers default to `fake`, boot fails on an unknown value) |
| R-020 | DATA | Tombstones: a removed block still counted, printed or blocking a TAG; restore after export | 2 | 1.4-UNIT-002, 7.1-UNIT-002, 4.1-UNIT-001 (TAG uniqueness ignores tombstones) |
| R-022 | OPS | Local HTTPS for tablets (Caddy + mkcert) and manual device checks are fragile and undocumented | 2 | 1.1-API-001 over the HTTPS origin; written device checklist (Story 1.7) |

---

## NFR Test Coverage Plan

**Purpose:** Map NFR requirements to planned validation work. This section defines what evidence the test work should create or collect; it does not assign final PASS/CONCERNS/FAIL status, which `nfr-assess` decides once evidence exists.

| NFR Category | Requirement / Threshold | Planned Validation | Tool / Level | Evidence Artifact | Priority |
| --- | --- | --- | --- | --- | --- |
| Security | Cross-read: zero; client push of a server-only family: 403; cookie `httpOnly; SameSite=Lax; Secure`; 30-day sliding session; file limit 25 MB and mime allowlist; no signup route (NFR-13, AD-9, AD-10, AD-3, AD-7) | 1.3-API-001, 1.3-API-002, 1.5-API-001 (403 server-only, tenant), 2.2-API-001 (413, mime), 1.3-E2E-002; `pnpm audit` in `pnpm verify` | Playwright API + E2E; static grep; `pnpm audit` | Playwright HTML report; `pnpm verify` output for; `pnpm audit --json` in the `pnpm verify` output. Assumption: RLS deferred by design, single tenant in the MVP | P0 |
| Performance | Sheet open, checklist tap, photo capture "immediate"; generation time for 124 pages / 82 photos (NFR-7, AD-15). Thresholds UNKNOWN | 7.5-API-002 `duration_ms`; timing probes in 4.3-E2E-001 and 5.1-E2E-001 (sheet open, Sumário render, checklist tap) | Job log; Playwright `performance.now()` timings written to a JSON attachment | `test-artifacts/perf/porto-seguro-YYYY-MM-DD.json`. First run measures, the PM sets numbers (C-1, C-2), then assertions | P1 |
| Reliability | Zero data loss in the three FR-54 scenarios; retries: network and 5xx with backoff, 4xx never except 401 and 409 `file_row_missing`; reading: 3 attempts then `failed`; health up (NFR-1, NFR-2, AD-8, AD-24, AD-14) | 1.8-E2E-001 to 1.8-E2E-005, 1.5-UNIT-002, 2.2-API-001, 4.8-API-002, 8.4-API-002, 1.1-API-001 | Playwright E2E (Chromium + WebKit), API, Vitest | Playwright report with traces on failure; manual iPad checklist file. iPadOS eviction and camera are manual evidence only | P0 |
| Scalability / capacity | 94 sheets, 82 photos (design capacity 500); ≤ 500 ops per push; 1,100 queued readings post-slice (NFR-8) | 7.5-API-002 (94 sheets, 82 photos), 1.5-UNIT-003 (501 ops split), CAP-API-001 500-photo relatório thumb prefetch and gallery render (`@slow`; named in the evidence plan, not yet a matrix row) | API + E2E `@slow` | Same perf JSON. No k6: one tenant, one active user; revisit before the second company | P1 |
| Maintainability | Kernel purity (no I/O), `fetch` only in three modules, dependency direction, mandatory test list present (AD-2, AD-13, NFR-17, test-quality DoD) | LINT-001; Vitest coverage on `packages/domain`; test DoD checklist in review | eslint (`no-restricted-imports`, `no-fetch-outside-sync`), `vitest --coverage` in `pnpm verify` | `coverage/coverage-summary.json`. Floor: 90 % lines on `checks/`, `ops/`, `parse/`, `format/`, `print/`; 80 % overall on the kernel | P1 |
| Compliance / regulatory | No criterion without operator, type and source; never "annual"; NR-10 text by `effective_from`; app never suggests Reprovado; exactly one blocking pre-issue row; pt-BR verbatim labels (NFR-14, NFR-10, NFR-5, NFR-11) | 3.1-UNIT-002 to 3.1-UNIT-004, 5.8-UNIT-001, 5.8-UNIT-002, 4.3-UNIT-001 | Vitest | Vitest JSON report. NR-10 2027 text is data-model only | P0 |
| Accessibility and ergonomics | WCAG 2.2 AA; 7:1 ink and 4.5:1 semantic contrast; 48 px targets, 56 px field controls; no hover-only; no swipe; keyboard reorder; live regions (NFR-3, NFR-4, AD-23); one accepted residual (disabled 2.04:1) | A11Y-E2E-001, A11Y-E2E-002, ERGO-E2E-001, 1.2-CMP-003 | axe-core in Playwright; bounding-box assertions | axe JSON per surface; waiver record for the disabled contrast. Manual stylus session on a tablet for feel | P1 |
| Design fidelity and naming | `tokens.css` and `components.css` byte-identical to the mockups; no codename, brand name, superseded document noun (per `source-deltas.md`) or emoji in user-visible strings and documents (NFR-15, NFR-16) | STATIC-001 | static tests | `pnpm verify` output | P2 |
| Privacy | No consent gate in the POC; purge never precluded (NFR-11) | 8.4-API-003 (config default, R-016) | API | Playwright report. LGPD basis post-POC; no automated LGPD evidence in the MVP | P2 |

**Missing thresholds or evidence sources** (to obtain, not guess):

- C-1 Generation time tolerance for the 124-page fixture (PM/architect; measured first in Story 7.5).
- C-2 "Immediate" latency budget for sheet open, checklist tap and photo capture on a mid-range Android tablet (PM; measured first in Story 5.1).
- C-3 Storage-low threshold final value (500 MB provisional; after the iPad check).
- C-4 decided 2026-09-21: visible "Sincronizar agora" action.

Until C-1 and C-2 have numbers, the Performance category is CONCERNS by default in `nfr-assess`.

---

## Entry Criteria

**Test work on a story cannot begin until ALL of the following are met:**

- [ ] The story has acceptance criteria, a definition of ready and a definition of done written in `epics.md` (AGENTS.md)
- [ ] `docker compose up` brings web, api, PostgreSQL 18 and MinIO to a healthy state and `GET /api/health` reports every dependency `up` (TC-6)
- [ ] The seed CLI has provisioned test users for two companies and the reset script truncates the op log per company (TC-9)
- [ ] The merged fixtures, the cookie-based auth fixture and the op-batch factories exist under the project `test_dir` (Story 1.1, 1.3)
- [ ] The fixtures the story needs are present: Porto Seguro op log (Story 3.7) for Epics 4 to 8, the small fixture relatório (1 cabine, 3 blocks) for generation checks, EXIF photo fixtures for Epic 6
- [ ] `pnpm verify` is green on `main` before the story branch is cut
- [ ] The testability hooks the story depends on are in place: clock and id injection (TC-1, TC-2) from Story 1.4, "Sincronizar agora" action (TC-4) from Story 1.5, fault flags and fake provider outcome fixtures (TC-3) from Stories 4.8 and 8.4
- [ ] For Story 4.1 onward: the R-009 seed gate is passed (3.1-UNIT-001 to 3.1-UNIT-004 green, partner review recorded in Story 3.1)

## Exit Criteria

**A story, an epic or the slice is complete when ALL of the following are met:**

- [ ] P0 pass rate 100 % on the PR gate (`pnpm verify`) for every story merge
- [ ] P1 pass rate ≥ 95 % at epic close, every failure ticketed
- [ ] High-risk mitigations (R-001, R-002, R-003, R-004, R-006, R-007, R-013) have their listed tests implemented and green before the 2026-10-03 slice gate; R-011 has `pnpm verify` documented and used from Story 1.1
- [ ] Kernel coverage floors met: ≥ 90 % lines on `checks/`, `ops/`, `parse/`, `format/`, `print/`; ≥ 80 % on `packages/domain` overall
- [ ] R-009 gate passed before Story 4.1 starts
- [ ] Manual iPad and Android tablet checklist recorded under `test-artifacts/manual/` for Story 1.8 and for every epic touching capture or sync
- [ ] Every in-scope NFR category has the evidence artifact named above
- [ ] No committed `.only`, no skip without a reason, no `waitForTimeout`, no raw `page.route` on application calls; deviations listed under "Playwright Utils deviations" in the PR
- [ ] Performance baselines: Not applicable until C-1 and C-2 have numbers; until then the measurement is recorded in the perf JSON and the category stays CONCERNS

---

## Project Team

| Name | Role | Testing Responsibilities |
| --- | --- | --- |
| Matheus | Developer, product owner and QA owner (all roles) | Test strategy, review of every story's tests, `pnpm verify` before every merge, full Playwright run at epic close, manual device checks, threshold decisions C-1 to C-4 with the PM hat on |
| Claude Code subagents | Implementers per story (selected by the story's Dev model line through `bmad-build.toml`) | Write the story's UNIT, INT, API, CMP and E2E tests alongside the code; testability hooks TC-1 to TC-9; keep the playwright-utils mandate and the test DoD |
| Bruno (Fasor Engenharia) | Design partner | Read-through of the generated relatório against FO.SERV-03 (R-004, R-009 evidence) only; no test authoring |

---

## Test Coverage Plan

**IMPORTANT:** P0/P1/P2/P3 = **priority and risk level** (what to focus on if time-constrained), NOT execution timing. See "Execution Strategy" for when tests run.

Test ID format `{epic}.{story}-{LEVEL}-{seq}` maps every scenario to the story in `epics.md` that owns it. Levels: UNIT (Vitest, `packages/domain`, no I/O), INT (Vitest or Playwright runner against docker-compose Postgres and MinIO, no browser), API (Playwright runner, `apiRequest`, no browser), CMP (Playwright component tests on the shared components), E2E (Playwright browser on `chromium-desktop`, `android-chrome` and, for `src/db`, `src/sync` and the FR-54 scenarios, `webkit`), static (grep and lint). Duplicate-coverage rule: business rules are asserted once at UNIT; API asserts wire semantics and persistence; E2E asserts that a kernel result reaches the user and that the offline path holds.

### P0 (Critical)

**Criteria:** Critical business, security, data-integrity, or compliance impact with no safe workaround. Risk score is supporting evidence and is not a required condition.

| Test ID | Requirement | Test Level | Risk Link | Notes |
| --- | --- | --- | --- | --- |
| **1.4-UNIT-001** | `parsePath`/`formatPath`: every client and server family round-trips; unknown family, unknown field key and `se`/`env` on a `coluna` node are rejected | UNIT | ASR-1, R-002 | Vitest, `packages/domain` |
| **1.4-UNIT-002** | `applyOp`: second `create` on the same id is a no-op; `remove` sets `removed_at`; `put removed_at = null` restores; `order_key` put reorders; `batch_id` groups N ops; undo is inverse ops | UNIT | ASR-1, R-020 | The only reducer on both sides (AD-3) |
| **1.4-UNIT-003** | Outbox coalescing: consecutive `put` on one path coalesce only when neither has `meta` or `batch_id`; keeps last `op_id`, `value`, `client_ts` and first `prev_op_id` | UNIT | R-002 | |
| **1.4-UNIT-004** | `applyOp` materializes provenance and attribution: `source_suggestion_id` set from `meta`, cleared on a later plain `put`; `created_by`, `first_edited_at`, `last_modified_by/at` from `sheet/*`, `not_tested` and photo files | UNIT | ASR-2, AD-18 | |
| **1.4-INT-001** | Op replay byte-equality: the Porto Seguro op log replayed in `seq` order through the Dexie layer (fake-indexeddb) and the Drizzle layer (Postgres in docker) yields byte-equal `RelatorioSnapshot`s; dead ops excluded on both | INT | ASR-1, R-002 | Needs TC-2 fixed ids; Story 3.7 fixture |
| **1.5-UNIT-001** | Rebase: after a pull, pending outbox ops re-apply on top of pulled values; `prev_op_id` untouched; dead ops stay excluded | UNIT | ASR-5, R-006 | |
| **1.5-UNIT-002** | Retry classification: network and 5xx retry with backoff and jitter; 4xx never except 401 (banner, outbox intact) and 409 `file_row_missing` | UNIT | ASR-5, R-006, R-013 | Injected transport |
| **2.6-UNIT-001** | Criterion comparison honours operator direction with unit scaling (MΩ vs GΩ, µΩ, kV); `± 0,5 %` relative criterion | UNIT | ASR-6, R-003 | Table-driven |
| **3.1-UNIT-001** | Seed counts and labels equal `addendum.md` §9: nameplate fields per type (0/5/10/13/12/14/12), five checklist lists (5/5/14/15/15) verbatim, four table grammars, conclusion block on Transformador de força | UNIT | ASR-7, R-009 | R-009 gate; asserts against the tracked addendum, not the gitignored original (TC-11) |
| **3.1-UNIT-002** | Seed criteria carry operator, value, unit, type and source; a criterion missing any is rejected at seed time; edition nullable; source "aceitável na ficha" allowed | UNIT | ASR-7, NFR-14 | R-009 gate |
| **3.4-UNIT-001** | `instantiateTemplate`: every block born inside its column with a suggested TAG; `BlockConfig` copied; `template_id`, `template_version`, `seed_version` recorded; the batch contains no op that targets an existing relatório | UNIT | AD-5, R-002 | Also the factory used for seeding (TC-9) |
| **4.3-UNIT-001** | `preIssue` rows equal the Sumário rows for the same snapshot; exactly one blocking row (parecer); razão social and logo warn only; dead ops listed as "N alterações rejeitadas" | UNIT | ASR-1, NFR-10 | AD-2 identity test |
| **4.3-UNIT-002** | `progress` and `sheetState` precedence: Não ensaiada › Concluída › Em preenchimento › Vazia; blocks with pending suggestions are not filled; "concluída com pendências" flagged by `integrity` | UNIT | ASR-2, AD-18 | |
| **5.5-UNIT-001** | `parse`: comma decimal, point thousands, unit suffix (`147G`), whitespace, rejects letters; result is `{raw decimal string with '.', unit, state}`; `format` is the inverse; property test `format(parse(x))` canonical | UNIT | ASR-6, R-003 | Property-based round trip |
| **5.5-UNIT-002** | Echo-before-compare: the compared value is the parsed echo, not the keystrokes; `not_measured` prints "-" and is excluded from comparison | UNIT | R-003 | |
| **5.8-UNIT-001** | `suggestConclusionPair` never returns Reprovado; `composeConclusion` text with criteria line; `text_basis` hash changes when an input changes; renderer prints text only when `edited` or hash equals current | UNIT | NFR-10, ASR-2 | |
| **5.8-UNIT-002** | `suggestParecer`/`composeParecer` never return Não apto; summary lists untested equipment | UNIT | NFR-10 | |
| **7.1-UNIT-001** | `groupForPrint`: `por_local_e_tipo` with and without `agrupar_por_tipo`, `ordem_de_campo` as base; pairing by `feeds_block_id` only; unpaired cable at the end with warning; para-raios and cabos inside Seccionadoras when grouped | UNIT | R-004 | |
| **8.1-UNIT-001** | Digit coverage: `digits(value) === digits(concat(cited tokens))` on every kind; failing gives `verify`; `compareSuggestion` equal gives auto-confirm batch with `meta.auto`, different gives `mode = replace` | UNIT | ASR-2, ASR-14, R-007 | |
| **8.1-UNIT-002** | `RelatorioSnapshot` includes exactly the suggestions referenced by a current cell; `progress`, `preIssue`, `syncCounts` and renderer ignore `pending` | UNIT | R-007 | |
| **1.3-API-001** | Sign-in sets `httpOnly; SameSite=Lax; Secure` cookie; sign-out; protected routes 401 without cookie; no signup route (404); seed CLI provisions and resets a user | API | ASR-9, R-008 | |
| **1.3-API-002** | Cross-tenant: two seeded companies; every stream, file, generate and revision route refuses the other company's ids (403 or empty), including `PUT /api/files/{id}` | API | ASR-8, R-008 | Two-company seed (TC-9) |
| **1.5-API-001** | `POST /api/sync/ops`: ≤ 500 ops applied in array order; per-op atomicity (one `400 op_invalid` does not block the rest); `op_path_unknown`; `403 op_server_only` for every server-only family; tenant 403; response `{applied[{op_id, seq}], rejected[{op_id, code}], superseded[]}` | API | ASR-5, R-006 | |
| **1.5-API-002** | Idempotency: re-pushing the same `op_id` returns the same `seq`, no duplicate row; `seq` monotonic per company across two users | API | R-006 | |
| **1.5-API-004** | Pulls: `GET /api/sync/company?since` returns company scope only plus per-relatório `summary` from `progress`; `GET /api/sync/relatorios/{id}?since` returns relatório ops together with project-scope ops ordered by `seq`; a relatório created later receives the project's whole history; `last_push_at` per `(user_id, device_id)` in summary | API | ASR-5, R-006 | |
| **2.2-API-001** | `PUT /api/files/{id}`: idempotent by `sha256`; `409 file_row_missing` before the create op is applied; `413 file_too_large` over 25 MB; mime allowlist per kind; emits `file/{id}/uploaded_at` and `variants` system ops; `thumb ≤ 512`, `print ≤ 2000` long edge; `GET /api/files/{id}/original`, `/thumb` and `/print`; object key layout; adapter has no delete | API | ASR-4, R-013 | |
| **4.8-API-001** | `POST /api/relatorios/{id}/generate` with `{last_op_id, file_ids_expected}`: `409 not_caught_up` until applied and stored; then `generation_job` create, status ops, revision op `{number, snapshot_seq, docx_file_id, pdf_file_id}` in one transaction; `last_nameplate` projection ops emitted; polled with `recurse` | API | ASR-3, R-004 | Small fixture (TC-8) |
| **4.8-API-004** | Small-fixture golden DOCX (1 cabine, 3 blocks): unpacked XML equals golden with masks (dates, revision line); TOC pass-2 pages equal pass-1 (job log assertion); PDF page count and outline headings match | API | ASR-3, TC-7 | Comparison strategy per TC-7 |
| **7.5-API-001** | Preview: identical job with RASCUNHO watermark; new `file` row `kind: preview`, `relatorio/preview_file_id` system op, served at `preview.pdf`; preview and issued DOCX differ only by watermark part and revision line | API | ASR-3 | Draft-equals-issued (AD-15) |
| **7.5-API-002** | Porto Seguro golden: full fixture generates; DOCX XML equals golden with masks; 94 sheets, 11 section-9 subsections, 82 photos numbered without repeats, section 8 with derived untested entries, section 11 certificates; `duration_ms` recorded | API | R-004, R-010 | `@slow`; epic-close tier |
| **8.4-API-001** | Reading job with `fake` providers: file receipt with `reading_kind` enqueues one job (singleton `(photo_id, reading_kind)`), `reading_status` ops queued, running, done; `suggestion/{id}` creates with `pending` only; `trust` from digit coverage; registry cross-check on `manufacturer` and `voltage_class`; `reading_run` row with tokens, model, prompt version, usage USD | API | ASR-14, R-007 | Fake providers only (policy) |
| **1.3-E2E-001** | Sign in online; go offline; reload; app opens from the service-worker shell and the relatório is usable; sign-out never drops the Dexie database | E2E | ASR-9, AD-8 | Chromium + WebKit |
| **1.3-E2E-002** | Session expired while offline: 401 during sync gives re-auth banner, outbox count unchanged, re-sign-in flushes it | E2E | ASR-9, R-008 | |
| **1.5-E2E-001** | Edit a sheet offline, go online, tap "Sincronizar agora": badge goes to zero, server snapshot equals device snapshot (compared through the API) | E2E | ASR-5, R-006 | Needs TC-4; `recurse` on the badge |
| **1.8-E2E-001** | FR-54 scenario 1: tab closed mid-sheet (uncommitted text in a field), reopen offers "Rascunho encontrado — Recuperar"; committed values present; nothing applied silently | E2E | ASR-4, R-001 | Chromium + WebKit |
| **1.8-E2E-002** | FR-54 scenario 2: network dropped mid-upload, the file stays local and `acked = false`; reconnection resumes; server holds exactly one object | E2E | ASR-4, R-013 | Chromium + WebKit |
| **1.8-E2E-003** | FR-54 scenario 3: `storage.estimate` mocked under 500 MB gives a warning; forced `QuotaExceededError` on the Blob write: photo uploaded immediately when online, else kept in memory for one retry, error toast shown | E2E | ASR-4, R-001 | Chromium + WebKit; threshold C-3 provisional |
| **4.1-E2E-001** | Create project and relatório from the seeded template: Sumário shows 94 blocks in their columns with suggested TAGs; a duplicate TAG typed is refused inline naming where it lives | E2E | AD-5, R-009 | After the R-009 gate |
| **4.3-E2E-001** | Sumário rows show the kernel pre-issue status; header counts navigate; section 9 expands to the tree; the same rows drive the Export dialog list | E2E | ASR-1 | Carries the timing probe for C-2 |
| **5.1-E2E-001** | Flow 2 on a fully conforme sheet with a copied plate: cabine data once, nameplate copy, checklist bulk "Todos C", instrument by code, readings typed in one run, conclusion suggested and confirmed in one tap; sheet Concluída; tap count asserted ≤ 19 | E2E | Core journey, SM-3 proxy | Carries the timing probe for C-2 |
| **5.5-E2E-001** | Type `251` with unit µΩ against `< 250 µΩ`: value echoed as `251 µΩ`, NC hint shown, criterion and source printed beside; `3.300` and `3,300` parse as documented | E2E | ASR-6, R-003 | Addendum §3 defect |
| **7.5-E2E-001** | Export dialog: outstanding list equals Sumário rows; parecer is the one blocking row; "Enviando…" flush then "Gerando…"; preview PDF with RASCUNHO; issue creates revision 1; revision history lists it; DOCX downloaded and unpacked (`handleDownload` + `readZIP`) contains the form title, cover client and 94 sheets on the fixture | E2E | ASR-3, R-004 | `@slow`; epic-close tier |
| **8.6-E2E-001** | Flow 2b: import a plate photo offline gives a queued state line; go online, sync, "Sugestões prontas" toast; Suggestion fields amber with crop and region outline; `verify` fields excluded from "Confirmar todos"; typing into a pending target discards it; nothing pending counted as filled | E2E | ASR-2, R-007 | Fake providers |

**Total P0:** 43 tests (20 UNIT/INT, 11 API, 12 E2E)

---

### P1 (High)

**Criteria:** Core, frequent, or complex behavior with material user reach and a limited workaround. Risk score is supporting evidence and is not a required condition.

| Test ID | Requirement | Test Level | Risk Link | Notes |
| --- | --- | --- | --- | --- |
| **1.4-UNIT-005** | Schema-reference test: no company- or project-scope schema references a relatório-scope row | UNIT | AD-5 | |
| **1.4-UNIT-006** | Clock injection: every time-dependent kernel function accepts `now`; a test calls each with two fixed dates and gets different, expected results | UNIT | TC-1, R-014 | |
| **1.5-UNIT-003** | Push batching: 501 pending ops split into two requests in apply order | UNIT | NFR-8 | |
| **1.5-UNIT-004** | Pull cursor: an unparseable op stops the cursor before it; `426` never advances it | UNIT | ASR-12, R-017 | |
| **1.6-UNIT-001** | `statusTable` `(state, event)` per AD-22, including manual backward moves and "edit after Emitido gives Em revisão"; `editedSince` counts only the named families and never system, suggestion, status, registry, template or user ops | UNIT | R-015 | Table-driven |
| **1.6-UNIT-002** | `syncCounts(snapshot, outbox)` and banner priority order | UNIT | AD-24, AR-27 | |
| **2.6-UNIT-002** | `calibrationCheck`: expired before period end, expiring within 30 days after it, valid; never returns a blocking status | UNIT | AD-19, NFR-10 | Needs TC-1 |
| **3.1-UNIT-004** | `getDefinition(seed_version, report_type, block_type)` resolves every shipped version; boilerplate keyed by `(section, effective_from)`; no "anual"/"annual" string in any boilerplate; forbidden marketing claims absent | UNIT | NFR-14 | R-009 gate |
| **3.1-UNIT-003** | Normalizations: one checklist column order; `EPÓXI`/`EPOXI` one value; `not_tested_reason` list is exactly the three attested reasons with justification text | UNIT | R-009 | R-009 gate; P1 in the checkpoint (golden coverage or manual workaround) |
| **3.2-UNIT-001** | Subtype `na_defaults`: manual seccionadora sets Motor and Fusíveis NA; dry-type TP/TC/transformer sets oil rows NA; items never removed; disabled sub-block values retained but ignored by `progress`, `preIssue`, `composeConclusion`, `integrity`, `syncCounts` | UNIT | AD-18, AD-21 | P1 in the checkpoint (golden coverage or manual workaround) |
| **3.4-UNIT-002** | Seeded "Cabine primária — padrão" instantiates to 94 equipment blocks in the documented skeleton with `agrupar_por_tipo` on for 1° Subsolo and Geradores only | UNIT | R-009 | P1 in the checkpoint (golden coverage or manual workaround) |
| **4.1-UNIT-001** | `suggestTag`: type plus column ("SEC-C05", "SEC-C05-2"); ignores tombstoned equipment; uniqueness over `(project_id, tag)` | UNIT | AD-25 | |
| **4.5-UNIT-001** | `integrity`: duplicate TAG names where the existing one lives; unknown location; edit on a tombstone; unpaired cabos de saída; cert_number mismatch | UNIT | AD-24, AD-19 | |
| **5.5-UNIT-003** | Magnitude outlier hint and `VAL CALCULADO` from nameplate; derived cells never stored | UNIT | FR-28, AD-11 | |
| **5.3-UNIT-001** | `suggestNameplateCopy` (same type and manufacturer in this relatório) and "Copiar da última visita" key filtering by the target block's seed version, "N campos copiados" | UNIT | AD-25 | |
| **6.3-UNIT-001** | `numberPhotos` sort key `(captured_at, device_id, local_seq)`; provisional before export; frozen with the revision | UNIT | AD-17, R-004 | |
| **6.6-UNIT-001** | `extractPhotoRefs`, `resolveSection8` ("Imagem NN" in first-appearance order), `derivedPoints` (untested blocks after manual points, suppressed by a point with `origin: not_tested`), tombstoned photo token flagged | UNIT | AD-26 | |
| **6.1-UNIT-001** | `contextCaption` gender and number from registry metadata; EXIF time and GPS parsed from fixtures; re-encode parameters | UNIT | AD-7, AD-17 | EXIF fixtures |
| **7.1-UNIT-002** | Sub-block with `enabled = false` omitted from print; four uncaptured Bloco C columns print "-"; tombstones excluded | UNIT | R-004, R-020 | P1 in the checkpoint (golden coverage or manual workaround) |
| **7.4-UNIT-001** | `section11Instruments` resolves certificate files by `instrument_id`; council switches CREA/ART vs CRT/TRT labels | UNIT | FR-6, FR-70 | |
| **8.4-UNIT-001** | bbox normalization over the `print` image; `preprocessing_applied: false` skips mapping; token ids `t{index}` | UNIT | R-021 | |
| **1.1-API-001** | `GET /api/health` shape `{status, db, queue, storage, libreoffice}` all `up` in docker-compose; reachable over the Caddy HTTPS origin | API | TC-6, R-022 | |
| **1.5-API-003** | `superseded`: an op whose `prev_op_id` is not the server's current op on that path is applied and reported | API | AD-24 | |
| **2.5-API-001** | Registry dedupe: "Schneider" and "SCHNEIDER" pushed from two devices converge to one row; sheet values untouched | API | AD-19 | |
| **4.8-API-002** | Fault: `GENERATE_FAULT=libreoffice_timeout` gives `generation_job/{id}/error` op, no revision allocated, no file rows; next generate succeeds | API | TC-3, R-005 | Needs the fault flag (TC-3); P1 in the checkpoint |
| **4.8-API-003** | Revision guard: generate twice with no `editedSince` edits returns the last revision; a `sheet/*` edit produces revision n+1; a `registry/*` edit does not | API | R-015 | |
| **8.4-API-002** | Reading faults: fixture `outcome: error` gives three attempts then `failed`; `POST /api/photos/{id}/reread` creates a new run and deletes previous pending suggestions; client push of `suggestion/{id}` create gives 403 | API | TC-3, R-007 | Needs outcome fixtures (TC-3); P1 in the checkpoint |
| **8.4-API-003** | Provider config: `LLM_PROVIDER`/`OCR_PROVIDER` unset gives `fake`; boot fails on an unknown value (zod env schema) | API | R-016 | |
| **8.3-API-001** | OCR sidecar conformance (post-slice): response on fixture images validates against `contract/ocr` JSON Schema; bbox within image bounds | API | R-021 | Post-slice; not Pact |
| **1.2-CMP-001** | Tri-state row, Suggestion field (amber, crop, Confirmar, Substituir, Verificar), Generated text field (Confirmar/Editar), Position box (clamped), Quantity stepper, Overflow menu: React Aria state mapped onto `.is-*` and `[data-state]`; `aria-disabled` plus `aria-describedby` reason; no `isDisabled` | CMP | AD-23, ASR-11 | |
| **1.2-CMP-002** | Input layer: press-and-hold triggers drag; no action bound to swipe; `touch-action` set; stylus pointer type handled | CMP | NFR-3 | |
| **1.2-CMP-003** | axe-core on each component in light and dark theme; hit area ≥ 48 px (56 px field controls) | CMP | ASR-11, R-019 | |
| **1.5-E2E-002** | A dead op (server returns `op_invalid` via a fixture path) appears in the Sumário pre-issue list as "N alterações rejeitadas — Reenviar" and is excluded from state | E2E | R-006 | |
| **1.6-E2E-001** | Home status board counts per status; relatório Em campo on this device first with `is-current` and "Continuar: TAG · n de N"; card states "No aparelho", "Baixando… n de m", "Não está neste aparelho" | E2E | FR-21, FR-55 | |
| **1.8-E2E-004** | Eviction recovery: cookie present, database absent, one-time screen naming what the server holds, then re-pull | E2E | R-001 | |
| **1.8-E2E-005** | Unsynced > 5 days banner with `page.clock`; service worker activates a new shell only when the outbox is empty | E2E | AD-8 | Needs TC-1 |
| **2.1-E2E-001** | Instrument registry: create with calibration record, derived validity, certificate PDF upload reaches the server; expired instrument sorts first with "Calibração vencida" in the picker and never blocks | E2E | FR-3 | |
| **2.3-E2E-001** | Empresa identity autosaves each field; brand preview updates; form title prints later in headers (asserted in 7.x) | E2E | FR-1 | |
| **2.5-E2E-001** | Manufacturer created inline from a nameplate field while offline, available immediately | E2E | FR-4 | |
| **3.4-E2E-001** | Template composer: duplicate the seeded template, add a cabine and columns, set quantities, toggle a sub-block and a subtype, reorder; archive removes from picker without touching relatórios | E2E | FR-9 to FR-11, FR-13 | |
| **4.2-E2E-001** | Setup page bands autosave; prefill of client, site, responsável; "Concluir dados do relatório" moves Rascunho to Em campo | E2E | FR-16, FR-21 | |
| **4.5-E2E-001** | Add a block in the field from a tree row and from a sheet; remove with confirm and undo toast; restore from Overflow; duplicate asks a new TAG; reorder by drag, Overflow, Alt+arrows and Position box; every move announced and undoable; no swipe performs an action | E2E | FR-18, FR-19, ASR-11 | |
| **4.6-E2E-001** | Status transitions and the "relatório emitido" banner after an edit; manual backward move through confirm | E2E | R-015 | |
| **5.6-E2E-001** | Continuous keyboard run across tables; not-measured cell; calculated ratio cell not editable | E2E | FR-27 | |
| **5.4-E2E-001** | Checklist tri-state taps, NC expansion with pre-seeded chips, bulk action with undo | E2E | FR-25, FR-26 | |
| **5.9-E2E-001** | Não ensaiado with a reason: fields read-only, row state, derived section 8 entry later | E2E | FR-31 | |
| **6.4-E2E-001** | "Adicionar fotos" import (JPEG with EXIF, HEIC) with one "De qual equipamento?" answer: context captions, stamps, chronological gallery, provisional numbers | E2E | R-012, FR-43 to FR-48 | Import is the automated capture path (TC-5); P1 in the checkpoint |
| **6.1-E2E-001** | Camera burst with Chromium fake media; geolocation granted and denied; stamp with and without coordinates | E2E | R-012 | Chromium only |
| **6.6-E2E-001** | Point of attention from an NC row with a photo token chip; token to tombstoned photo flagged at pre-issue; derived untested entries listed | E2E | AD-26 | |
| **7.5-E2E-002** | Edit after Emitido: banner names issue date and revision; next generate is revision 2 | E2E | R-015 | |
| **A11Y-E2E-001** | axe-core WCAG 2.2 AA on every surface (Login, Home, Project, Setup, Sumário, Composer, Templates, Sheet, Gallery, Points, Registries, Export, Sync status, Account) in light and dark; known residual (disabled 2.04:1) excluded by rule id with a waiver note | E2E | ASR-11, R-019 | Epic-close tier for the full sweep |
| **A11Y-E2E-002** | Keyboard-only reorder in Sumário and tree; dialogs trap focus, close on Esc, return focus; live region announces transitions | E2E | ASR-11 | |
| **ERGO-E2E-001** | Bounding boxes of interactive controls ≥ 48 px, field controls ≥ 56 px on `android-chrome`; no hover-only affordance (assert every action reachable by tap) | E2E | NFR-3 | `android-chrome` project |
| **LINT-001** | eslint: `fetch` only in `src/sync`, `src/files`, `src/api`; `no-restricted-imports` for dependency direction; `packages/domain` imports zod only | static | ASR-10 | Part of `pnpm verify` |

**Total P1:** 54 tests (21 UNIT, 8 API, 3 CMP, 22 E2E/static)

---

### P2 (Medium)

**Criteria:** Secondary behavior with narrower user reach and an acceptable workaround. Risk score is supporting evidence and is not a required condition.

| Test ID | Requirement | Test Level | Risk Link | Notes |
| --- | --- | --- | --- | --- |
| **1.5-API-005** | Contract skew: `CONTRACT_VERSION` below minimum gives pull `426 contract_outdated`, push still accepted | API | ASR-12 | |
| **2.6-E2E-001** | Acceptance criteria table read-only with source | E2E | FR-5 | |
| **4.7-E2E-001** | Section text edit with variable chips, "Restaurar texto do template" with undo; template unchanged | E2E | FR-12 | |
| **6.5-E2E-001** | Caption from chips and free text; batch caption on import | E2E | FR-46 | |
| **STATIC-001** | Grep tests: no codename `fasor`, no `Fasor` brand and no superseded document noun (the one `source-deltas.md` replaces with relatório) in `apps/web` user-visible strings, seed boilerplate or generated document text; no emoji code points; `tokens.css` and `components.css` byte-identical to the mockups | static | NFR-15, NFR-16 | Part of `pnpm verify` |

**Total P2:** 5 tests (1 API, 4 E2E/static)

---

### P3 (Low)

**Criteria:** Rare, cosmetic, or experimental behavior with minimal impact and an easy workaround. Risk score is supporting evidence and is not a required condition.

| Test ID | Requirement | Test Level | Risk Link | Notes |
| --- | --- | --- | --- | --- |
| Not applicable | No P3 scenario is planned in the checkpoint; exploratory checks happen inside the manual device tier | - | - | - |

**Total P3:** 0 tests

---

## Execution Strategy

**Philosophy:** Run everything before every merge unless it needs the full 124-page fixture or a physical device. There is no CI by policy (AGENTS.md), so the tiers below are local commands and a written cadence; "nightly" and "weekly" in the template map to the epic-close and manual-device tiers.

**Organized by tier:**

### Every story merge: PR gate `pnpm verify` (< 15 min)

- lint and static tests (LINT-001, STATIC-001); all UNIT and INT; all API except `@slow`; Playwright `@p0` on `chromium-desktop`; `pnpm audit`; Vitest coverage on `packages/domain`
- Output pasted in the PR before the author merges (R-011)
- Why here: it is the only gate that cannot be skipped by a process, so it must be fast enough to be run every time

### Story with a front end: story full run (< 30 min)

- Playwright suites of the surfaces the story touches on `chromium-desktop` and `android-chrome`; `webkit` when `src/db` or `src/sync` changed
- Every implemented feature runs through Playwright as a human would, covering the whole feature (AGENTS.md)

### Epic close ("nightly" equivalent, < 60 min)

- Full Playwright on the three projects; `@slow` Porto Seguro golden (7.5-API-002, 7.5-E2E-001) and the 500-photo capacity run; axe on every surface (A11Y-E2E-001); perf JSON refreshed
- Run before the epic retrospective and recorded in the closing PR

### Manual device check ("weekly" equivalent, 1 to 2 h)

- Story 1.8, then once per epic touching capture or sync
- iPad Safari and Android tablet checklist: offline reload, photo capture, storage eviction, HTTPS origin; evidence saved under `test-artifacts/manual/`

### Nightly k6 performance tests

Not applicable: k6 is not planned. The MVP serves one tenant with one active user at a time; API latency under load is not an MVP concern. Capacity is asserted functionally (7.5-API-002, `@slow` 500-photo run) and generation time is measured from the job log, not load-tested.

### Weekly chaos and long-running tests

Not applicable: there is no multi-region, no cloud fault injection and no backup restore before Epic 11. The long-running tier is the manual device check above.

**Selective execution by tag:** `@p0`, `@p1`, `@slow`, `@webkit`. `runBurnIn` is not applicable without CI and is listed as a post-MVP addition with the GitHub Actions story in Epic 11.

---

## QA Effort Estimate

**Test development effort only**, stated in hours because the work is embedded in each story (AGENTS.md: nothing ships untested) and done by the same developer and the implementation subagents; there is no separate QA engineer.

| Priority | Count | Effort Range | Notes |
| --- | --- | --- | --- |
| P0 | ~43 | 55 to 85 h | Kernel fixtures (Porto Seguro op log, small fixture), golden DOCX harness, three FR-54 scenarios, sync API suite dominate |
| P1 | ~54 | 40 to 65 h | Surface E2E, component tests, axe, registry and template flows |
| P2 | ~5 | 8 to 15 h | Secondary flows and static tests |
| P3 | 0 | 0 to 3 h | None planned |
| Test framework and fixtures (one-off) | - | 12 to 20 h | Merged fixtures, auth provider, factories, docker reset script, fake provider fixtures, fault flags, gitignored denylist |
| **Total** | ~103 | **115 to 190 h** | Spread across Epics 1 to 8; the P0 kernel and sync suites must exist by the end of Epic 1 and Epic 3 |

**Assumptions:**

- Includes test design, implementation, debugging and wiring into `pnpm verify`
- Excludes ongoing maintenance
- Assumes the testability hooks in "Dependencies & Test Blockers" land in the stories named there

**Dependencies:**

- See "Dependencies & Test Blockers" for what the test work needs from the kernel, the api and the fixtures

---

## Implementation Planning Handoff

**These items must be scheduled inside the stories that own them; there is no dedicated QA owner, so every item is assigned to Matheus with the story's dev subagent.**

| Work Item | Owner | Target Milestone | Dependencies/Notes |
| --- | --- | --- | --- |
| Test framework: Playwright 1.63 with playwright-utils merged fixtures under `test_dir/support`, Vitest 5 workspace, `pnpm verify` script (lint, static, UNIT, INT, API, `@p0` Playwright, audit, coverage), health shape (TC-6) | Matheus / dev subagent | Story 1.1 | Sets the PR gate for R-011; `test_dir` resolved from the project, not assumed |
| Cookie-based auth provider (`setAuthProvider` + `createAuthFixtures`), seed CLI users for two companies, reset script per company | Matheus / dev subagent | Story 1.3 | Enables 1.3-API-001, 1.3-API-002 and every seeded test (TC-9) |
| Clock injection (`now`/`Clock`) and injectable `newId()` in the kernel; TZ pinned to America/Sao_Paulo in containers and Playwright | Matheus / dev subagent | Story 1.4 | TC-1, TC-2; before Story 2.1 |
| "Sincronizar agora" action on Sync status | Matheus / dev subagent | Story 1.5 | TC-4; decision C-4 |
| Porto Seguro op-log fixture with fixed ids and timestamps (94 sheets, 82 photos, 11 subsections), real data under the R-023 waiver; plus the small one-cabine fixture | Matheus / dev subagent | Story 3.7 | TC-2, R-023; used by 1.4-INT-001, 7.5-API-002, 7.5-E2E-001 |
| `GENERATE_FAULT` flag in the api image (test only) and the golden DOCX harness (unpacked XML with masks, PDF text and outline comparison, small fixture relatório) | Matheus / dev subagent | Story 4.8 | TC-3, TC-7, TC-8 |
| Fake provider outcome fixtures (`outcome` set to `ok`, `error` or `timeout` per photo id) | Matheus / dev subagent | Story 8.4 | TC-3; enables 8.4-API-001, 8.4-API-002 |

---

## Tooling & Access

All tools run inside docker-compose or on the developer machine; nothing is provisioned in a cloud. Every row is pending until Story 1.1 creates the manifests.

| Tool or Service | Purpose | Access Required | Status |
| --- | --- | --- | --- |
| Playwright 1.63 with `@seontechnologies/playwright-utils` | API, component and E2E tests; `apiRequest`, `interceptNetworkCall`, `recurse`, `networkErrorMonitor`, auth fixtures | none (workspace dependency) | Pending until Story 1.1 |
| Vitest 5 | Kernel UNIT and INT tests, coverage report | none | Pending until Story 1.1 |
| axe-core (`@axe-core/playwright`) | WCAG 2.2 AA checks per component and surface | none | Pending until Story 1.1 |
| fake-indexeddb | Dexie layer in Vitest for the replay byte-equality test | none | Pending until Story 1.1 |
| docker-compose (PostgreSQL 18, MinIO, api image with LibreOffice and fonts, web, Caddy) | The only test environment | Docker on the developer machine | Pending until Story 1.1 |
| mkcert | Local HTTPS origin for the tablets through Caddy | none | Pending until Story 1.1 |
| iPad (iPadOS Safari) and Android tablet | Manual device checklist: offline reload, camera, storage eviction, HTTPS origin | Physical devices on the same network | Pending until Story 1.1 |

**Access requests needed:**

- Not applicable: everything is local by policy; the only physical need is the two tablets already in hand for the manual tier.

---

## Interworking & Regression

**Components impacted by the MVP:**

| Service/Component | Impact | Regression Scope | Validation Steps |
| --- | --- | --- | --- |
| **packages/domain** | Every status, count, text, order and verdict is computed here once; both adapters depend on it | All UNIT and INT tests on every story (`pnpm verify`); coverage floors | `pnpm verify`; 1.4-INT-001 replay byte-equality when any reducer or materialization changes |
| **apps/web** | Renders from IndexedDB, writes ops to the outbox, service-worker shell, sync engine | Playwright suites of the touched surfaces on every story; `webkit` when `src/db` or `src/sync` changed; full three-project run at epic close | Story full run; FR-54 scenarios on Chromium + WebKit; axe sweep at epic close |
| **apps/api** | Applies ops, serves files, runs generate and reading jobs | All API tests except `@slow` on every story; `@slow` golden at epic close | `pnpm verify`; 7.5-API-002 and 4.8-API-004 when the renderer, the seed or the job code changes |
| **docker-compose** | The environment every test runs against (Postgres, MinIO, LibreOffice image, Caddy) | 1.1-API-001 health and HTTPS smoke on every story | `docker compose up` then `pnpm verify`; manual HTTPS check on the tablets per epic |

**Regression test strategy:**

- `pnpm verify` is the regression gate on every story merge; the full Playwright run on the three projects is the regression gate at each epic close.
- No cross-team coordination is needed; one developer owns all four components. The design partner's read-through is the only external step and applies to the generated document (R-004, R-009).

---

## Appendix A: Code Examples & Tagging

Both examples follow the playwright-utils mandate: `test` and `expect` come from the project's merged fixtures, never from `@playwright/test`; network is observed with `interceptNetworkCall`, not raw `page.route`. They illustrate the pattern; route and payload names are fixed in Stories 1.5 and 4.3.

**API test (P0): a client may not push a server-only family**

```typescript
import { test, expect, log } from '../support/merged-fixtures';

test.describe('POST /api/sync/ops', () => {
  test('@p0 client push of a suggestion create is rejected with op_server_only', async ({ apiRequest, authToken }) => {
    await log.step('Push a suggestion create from the client side');

    const op = {
      op_id: 'op_test_0001',
      path: 'suggestion/sug_test_0001',
      kind: 'create',
      value: { target: 'sheet/blk_0001/nameplate/manufacturer', text: 'Schneider', state: 'pending' },
      client_ts: '2026-09-21T12:00:00-03:00',
    };

    const { status, body } = await apiRequest({
      method: 'POST',
      path: '/api/sync/ops',
      body: { ops: [op] },
      headers: { Cookie: authToken }, // cookie-based provider (setAuthProvider) yields the session cookie
    });

    expect(status).toBe(403);
    expect(body.applied).toEqual([]);
    expect(body.rejected).toEqual([{ op_id: 'op_test_0001', code: 'op_server_only' }]);
  });
});
```

**UI test (P0): the Sumário renders from the relatório pull**

```typescript
import { test, expect } from '../support/merged-fixtures';

test('@p0 Sumário shows the 94 seeded blocks after the pull', async ({ page, interceptNetworkCall }) => {
  const relatorioPull = interceptNetworkCall({ url: '**/api/sync/relatorios/**' });

  await page.goto('/relatorios/rel_fixture_porto_seguro');

  const { status } = await relatorioPull;
  expect(status).toBe(200);

  await expect(page.getByRole('heading', { name: 'Sumário' })).toBeVisible();
  await expect(page.getByRole('row', { name: /SEC-|DJ-|TP-|TC-|TR-|PR-/ })).toHaveCount(94);
});
```

**Run specific tags:**

```bash
# PR gate smoke: P0 only, chromium-desktop
npx playwright test --grep @p0 --project chromium-desktop

# P0 plus P1
npx playwright test --grep "@p0|@p1"

# Skip the full-fixture tests on a story run
npx playwright test --grep-invert @slow

# Epic close: everything, including the slow golden and the WebKit suites
npx playwright test
npx playwright test --grep @webkit --project webkit
```

---

## Appendix B: Knowledge Base References

- **Risk Governance**: `risk-governance.md` - Risk scoring methodology
- **Probability and Impact**: `probability-impact.md` - P x I scale used in the register
- **Test Priorities Matrix**: `test-priorities-matrix.md` - P0-P3 criteria
- **Test Levels Framework**: `test-levels-framework.md` - E2E vs API vs Unit selection
- **NFR Criteria**: `nfr-criteria.md` - NFR categories and evidence expectations
- **Test Quality**: `test-quality.md` - Definition of Done (no hard waits, ≤ 1000 lines, < 1.5 min)
- **Playwright Utils Mandate**: `playwright-utils-mandate.md` - merged fixtures, `apiRequest`, `interceptNetworkCall`, `recurse`, canonical shapes
- **Confidence Gate**: `confidence-gate.md` - when a plan or a gate decision may be emitted
- **ADR Quality Readiness Checklist**: `adr-quality-readiness-checklist.md` - testability review of architecture decisions

---

**Generated by:** BMad TEA Agent
**Workflow:** `bmad-testarch-test-design`
**Version:** 4.0 (BMad v6)
