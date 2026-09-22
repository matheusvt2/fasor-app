---
runScope: 'system-level'
runKey: 'system'
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-09-21'
---

# Step 1: Detect Mode & Prerequisites

## Mode

**System-Level Mode.**

Rationale:
- No `sprint-status.yaml` exists under `_bmad-output/` (file-based detection defaults to system-level).
- PRD and Architecture Spine both exist; `epics.md` also exists, and the rule "PRD/ADR + Epic/Stories -> prefer System-Level first" applies.
- No prior test-design artifacts exist in `_bmad-output/test-artifacts/`.

## Prerequisites located

- PRD: `_bmad-output/planning-artifacts/prds/prd-fasor-2026-09-19/prd.md` (+ `addendum.md`)
- Architecture: `_bmad-output/planning-artifacts/architecture/architecture-fasor-2026-09-21/ARCHITECTURE-SPINE.md`
- Epics/stories: `_bmad-output/planning-artifacts/epics.md`
- UX: `_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/{DESIGN.md,EXPERIENCE.md}`
- Brief: `_bmad-output/planning-artifacts/briefs/brief-fasor-2026-09-18/brief.md`

## Run identity

- run_scope: system-level
- run_key: system
- Output targets (Step 5): `_bmad-output/test-artifacts/test-design-architecture.md`, `_bmad-output/test-artifacts/test-design-qa.md`

# Step 2: Load Context & Knowledge Base

## Configuration (`_bmad/tea/config.yaml`)

- tea_use_playwright_utils: true
- tea_use_pactjs_utils: true (contract testing not relevant: single monorepo, one client + one server, no Pact artifacts; pactjs fragments not loaded)
- tea_pact_mcp: mcp -> pact_mcp_reachable: false (no SmartBear/Pact MCP tools in this session's tool list; probe is tool-list only, no broker call)
- tea_browser_automation: auto (browser exploration is epic-level only; nothing to explore, no code exists)
- test_stack_type: auto -> detected_stack: fullstack (inferred from the Architecture Spine: React 19 + Vite web client, Hono API; no package.json exists yet)
- test_artifacts: _bmad-output/test-artifacts
- Playwright Utils profile: no test files exist; design docs use the Full UI+API shapes (merged fixtures, apiRequest, interceptNetworkCall, recurse)

## Project artifacts loaded

- PRD: prd.md (headings, sections 7, 9, 12, 13) + addendum.md (sections 1 to 9)
- Architecture Spine: ARCHITECTURE-SPINE.md (AD-1 to AD-27, conventions, stack, structural seed, deferred)
- Epics: epics.md (NFR-1 to NFR-18, AR-1 to AR-29, FR coverage map, 11 epics, 60+ stories with Dev model lines)
- AGENTS.md (policy: 100% local Docker MVP, no CI, fake providers by default, no emoji, one PR per story)

## Knowledge fragments loaded

- risk-governance.md, probability-impact.md, test-levels-framework.md, test-priorities-matrix.md
- nfr-criteria.md, adr-quality-readiness-checklist.md, test-quality.md (headings + checklist)
- playwright-utils-mandate.md, overview.md (headings), confidence-gate.md

## Extracted: tech stack, integration points, NFR thresholds

- Stack: pnpm 12 monorepo; packages/domain (pure TS + zod 4, Vitest 5); apps/web (React 19.3, Vite 8.3, React Router 8.4, react-aria-components 1.21, Dexie 4.4, service worker); apps/api (Hono 4.13, Drizzle 0.45, postgres.js, PostgreSQL 18, pg-boss 12, better-auth 1.7, docx 9.7, sharp 0.35, LibreOffice 26.2 in image); services/ocr (post-slice, Python 3.13 FastAPI PaddleOCR); docker-compose (web, api, postgres, minio, ocr profile, Caddy + mkcert for tablet HTTPS); Playwright 1.63.
- Integration points: sync API (POST /api/sync/ops, GET /api/sync/company, GET /api/sync/relatorios/{id}), files (PUT/GET /api/files), generate/preview jobs (pg-boss + LibreOffice + MinIO/S3), reading job (OcrProvider fake|textract|ocr-svc, LLM fake|anthropic|bedrock), better-auth cookie session, Dexie IndexedDB store, service worker shell.
- NFR thresholds present: 500 ops per push batch; 25 MB file limit; 500 photos per relatório design capacity; 5-day unsynced banner; 500 MB storage-low warning; 30-day sliding session; 48/56 px hit targets; 7:1 and 4.5:1 contrast; 200% text enlargement; reading job 3 attempts; generate concurrency 1; sync tick 60 s; field commit 500 ms idle.
- NFR thresholds missing (questions for the PM/architect): generation time tolerance for the 124-page / 82-photo document (NFR-7 says "measured, no number"); sheet-open and photo-capture latency budget ("immediate", no ms); sync push/pull latency; API p95 under a single tenant; storage-low threshold final value (500 MB provisional); photo re-encode numbers (provisional).

# Step 3: Testability & Risk Assessment

## 3.1 Testability Review (system-level)

### Testability Concerns (actionable)

| # | Concern | Dimension | Evidence | Required action | Owner / when |
| --- | --- | --- | --- | --- | --- |
| TC-1 | Kernel functions that depend on "now" (`calibrationCheck` 30-day window, 5-day unsynced banner, `deadlineFromPriority`, photo `captured_at` fallback, session 30-day sliding, `client_ts`) have no stated clock injection. Tests would be wall-clock dependent. | Controllability | AD-8, AD-17, AD-19; spine lists the functions but no `now` argument | Every kernel function that reads time takes `now: Date` (or a `Clock`) as an explicit argument; `apps/web` and `apps/api` pass it from one clock module; Playwright uses `page.clock`. | Story 1.4 (kernel), before Story 2.1 |
| TC-2 | Byte-equal snapshot and golden-document tests need deterministic ids and timestamps. UUIDv7 embeds time; `numberPhotos` sorts by `(captured_at, device_id, local_seq)`; revision rows carry `created_by/at`. | Reliability (reproducibility) | AD-3 replay test, AD-4, AD-15 draft-equals-issued test | Id generation behind one injectable `newId()` in kernel; fixtures (Porto Seguro op log) ship with fixed ids and timestamps; the DOCX layout spec must not embed generation time except in the fields the test masks (revision line, date). | Story 1.4, Story 3.7, Story 4.8 |
| TC-3 | Fault injection for the two pg-boss jobs is not designed: how does a test make `generate` fail (LibreOffice crash, timeout, invalid DOCX) or make `reading` fail 3 times then `failed`? `fake` providers only "replay fixtures". | Controllability | AD-14 (three attempts then failed), AD-15 (`generation_job/{id}/error`) | `fake` providers accept fixture files that declare `{outcome: ok | error | timeout}` per photo id; generate job accepts a test-only env flag (`GENERATE_FAULT=libreoffice_timeout`) in the api image, never in production config. | Story 4.8, Story 8.4 |
| TC-4 | The sync engine runs on launch, on `online`, and every 60 s. E2E tests cannot wait 60 s and must not rely on hard waits. | Controllability | AD-8 | Expose a test hook: `window.__releng.syncNow()` guarded by `import.meta.env.MODE === 'test'`, or a visible "Sincronizar agora" action on Sync status (the UX may want it anyway). Tests then use `recurse` on the sync badge / `sync_state`. | Story 1.5 |
| TC-5 | Photo capture (`getUserMedia`), geolocation and HEIC import are hard to drive headless; camera capture is the primary field path. | Controllability | AD-7, AD-17; FR-43 | Automated path is the file-input import ("Adicionar fotos") with JPEG/HEIC fixtures carrying EXIF; camera path runs with Chromium `--use-fake-device-for-media-stream --use-file-for-fake-video-capture`; geolocation via `context.setGeolocation`; EXIF parsing unit-tested on fixtures. Real camera on iPad is a manual check. | Story 6.1, 6.4 |
| TC-6 | `GET /api/health` is named but its content is not: tests and operators cannot tell DB, queue and object storage health apart. | Observability | AD-13, AD-27 | Health returns `{status, db, queue, storage, libreoffice}`; an API test asserts the shape and that each is `up` in docker-compose. | Story 1.1 |
| TC-7 | PDF output is not byte-deterministic (LibreOffice); DOCX contains dates. The draft-equals-issued test and the Porto Seguro snapshot test need a comparison strategy. | Observability (deterministic assertions) | AD-15 | Compare DOCX at the unpacked XML level with a mask list (revision line, RASCUNHO watermark part, dates); compare PDF by extracted text per page and by outline (heading pages), not bytes; keep the TOC pass-2 assertion inside the job and assert it fired in the test. | Story 4.8, 7.5 |
| TC-8 | Generate concurrency is 1 per instance; the fixture document is 124 pages. E2E tests that generate serialize and are slow. | Reliability (parallel safety) | AD-15, NFR-7 | Only two E2E tests generate the full fixture (issue, preview); all other generation checks run at API level against a small fixture relatório (1 cabine, 3 blocks) and poll `generation_job` with `recurse`. Mark full-fixture tests `@slow` and run them in the nightly/pre-merge full run. | Test framework setup |
| TC-9 | State seeding: no test-data endpoint is planned. The sync push is the seeding API, which is right, but it needs a signed-in user and a company. | Controllability | AD-24, AD-9 | Test factories build op batches (project, relatorio via `instantiateTemplate`, sheet values) and push them through `POST /api/sync/ops` with the `authToken` fixture; the seed CLI provisions test users and a second company for the tenant test; a reset script truncates the ops log per company between suites (docker-compose only). | Test framework setup, Story 1.3 |
| TC-10 | No CI exists by policy (AGENTS.md); tests run locally before merge. Burn-in, flake detection and a gate that cannot be skipped are absent. | Reliability | AGENTS.md § Policy | A single `pnpm verify` script (lint, kernel unit, api integration, Playwright smoke) is the pre-merge gate and its output is pasted in the PR; the full Playwright suite runs before each epic closes. Record as risk R-011. | Matheus |
| TC-11 | The decoded FO.SERV-03 source is gitignored; seed tests on other machines cannot read the original. | Reliability (reproducibility) | AGENTS.md § Policy, addendum §9 | Seed tests assert against the counts and verbatim labels in `addendum.md` §9 (tracked); the partner review of the seed is a manual checklist recorded in the story. | Story 3.1 |
| TC-12 | WebKit desktop is the only automated proxy for iPadOS Safari; storage eviction and the camera cannot be automated. | Controllability | AD-8, NFR-17 | Manual device checklist with recorded evidence (screenshots, `storage.estimate()` values) in `test-artifacts/manual/ipad-YYYY-MM-DD.md`; the automated `quota exhausted` scenario mocks `navigator.storage.estimate` and `QuotaExceededError` on the Dexie write. | Story 1.8 |

### Testability Assessment Summary (strong points)

- **One log, one reducer (AD-3).** Every state is a replayable op log. Fixtures are op logs, seeding is a push, and the kernel can be exercised in Vitest with no I/O. This is the single strongest testability property of the design.
- **Pure kernel (AD-2).** Status, counts, texts, orders and verdicts exist once as pure functions over `RelatorioSnapshot`. Unit tests carry most of the business-rule coverage; UI tests only need to assert that a kernel result is rendered.
- **Provider selection by environment (AD-14).** `LLM_PROVIDER=fake` and `OCR_PROVIDER=fake` make the reading pipeline runnable in tests with no cost and no network.
- **Explicit error envelope and codes (AD-13, AD-24).** `{applied, rejected, superseded}` and enumerated error codes make API assertions exact.
- **Same origin, cookie session (AD-9).** No CORS, one auth surface at `/api/auth/*`; playwright-utils `auth-session` fits with a cookie-based provider.
- **Containers everywhere (AD-27).** The test environment is docker-compose; the api image with LibreOffice and fonts is the same image tests run against.
- **Named mandatory tests (NFR-17).** The architecture already commits to the replay byte-equality test, the Sumário/pre-issue identity test, the cross-tenant test, the seed tests, the renderer snapshot and draft-equals-issued tests, the outbox-survives-upgrade test and the three FR-54 scenarios by name.
- **Structured logs with ids** (`company_id`, `relatorio_id`, `job_id`) and per-run `reading_run` rows give observability for job assertions without a metrics stack.

### Architecturally Significant Requirements (ASRs)

| ASR | Source | Why it is significant for testing | Type |
| --- | --- | --- | --- |
| ASR-1 Device and server materialize the same op log to byte-equal snapshots | AD-2, AD-3, NFR-17 | The Sumário, the pre-issue list and the document all depend on it; a divergence is silent. Needs the Porto Seguro op-log fixture and both adapters early. | ACTIONABLE |
| ASR-2 Nothing unconfirmed is written, counted or printed | AD-12, NFR-10 | The product's safety claim; touches `applyOp`, `progress`, `preIssue`, `syncCounts`, renderer and the UI batch. | ACTIONABLE |
| ASR-3 One renderer over a frozen snapshot; preview equals issue except watermark and revision line; two-pass TOC | AD-15 | The slice's pass/fail test (SM-4) rests on it; determinism (TC-2, TC-7) must be designed in. | ACTIONABLE |
| ASR-4 Local durability at capture and zero photo loss across tab close, network drop and quota exhaustion | AD-7, AD-8, NFR-2, FR-54, FR-56 | Three named Playwright scenarios plus a manual iPad check; needs fault hooks (TC-5, TC-12). | ACTIONABLE |
| ASR-5 Sync is idempotent, per-op atomic, retry-classified, and rebase never clobbers pending work | AD-24 | Wrong semantics leave device and server divergent or the generate barrier stuck. | ACTIONABLE |
| ASR-6 pt-BR parsing, unit scaling and criterion comparison are exact | AD-11, FR-27, NFR-5 | A wrong parse is a wrong signed value; the manual process already failed here (addendum §3). | ACTIONABLE |
| ASR-7 Seed data reproduces the decoded FO.SERV-03 and every criterion carries operator, type and source | AD-21, NFR-14, addendum §9 | Every sheet and the document derive from it; the source document is gitignored (TC-11). | ACTIONABLE |
| ASR-8 Tenant scoping on every read; server-only families rejected from clients | AD-10, AD-3 | Security floor for the SaaS-ready model; one test each is already mandated. | ACTIONABLE |
| ASR-9 Session survives offline; a 401 never drops the outbox | AD-9 | Data loss path disguised as an auth error. | ACTIONABLE |
| ASR-10 Kernel purity and dependency direction enforced by lint | AD-2, AD-13 | Keeps the unit-test strategy valid over time; cheap to automate. | ACTIONABLE |
| ASR-11 WCAG 2.2 AA with glove/stylus ergonomics (48/56 px targets, no hover, no swipe) | NFR-3, NFR-4, AD-23 | Automatable with axe-core and bounding-box assertions; one accepted residual (disabled 2.04:1). | ACTIONABLE |
| ASR-12 Contract skew: append-only families, `426` on pull only, cursor never past an unparseable op | AD-13 | Matters after the first deployed client; cheap unit and API tests now. | FYI |
| ASR-13 Status table has one home and the server never writes it | AD-22 | Table-driven unit test; provisional content may change. | FYI |
| ASR-14 Reading pipeline: LLM never emits coordinates, digit coverage on the server, singleton job key, idempotent suggestion emission | AD-14 | Off-cloud in the MVP via fake providers; the contract shape is tested now, real providers post-MVP. | ACTIONABLE |
| ASR-15 Product naming and no-emoji policy | NFR-15, AGENTS.md | A grep test prevents the codename leaking into user-visible strings and documents. | FYI |

## 3.2 Risk Assessment

Scoring per `probability-impact.md`: P 1 unlikely, 2 possible, 3 likely; I 1 minor, 2 degraded, 3 critical. Score = P x I. 9 = BLOCK, 6 to 8 = MITIGATE, 4 to 5 = MONITOR, 1 to 3 = DOCUMENT.

| ID | Category | Risk | P | I | Score | Action | Mitigation (tests and design) | Owner | Timeline |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R-001 | DATA | Offline durability fails on the field device (iPadOS Safari eviction, quota exhaustion, tab killed mid-write): sheet values or photos lost before sync | 2 | 3 | 6 | MITIGATE | Three FR-54 Playwright scenarios on Chromium + WebKit (tab closed mid-sheet, network dropped mid-upload, quota exhausted via mocked `storage.estimate` and forced `QuotaExceededError`); eviction-recovery screen E2E; 5-day banner test with `page.clock`; manual iPad checklist with evidence (TC-12) | Story 1.8 dev + Matheus (device) | Epic 1, before Epic 5 |
| R-002 | DATA | Device and server kernels diverge (two `toSnapshot()`, Dexie vs Drizzle materialization, coalescing rule) so the Sumário and the export disagree or `409 not_caught_up` never clears | 2 | 3 | 6 | MITIGATE | AD-3 replay byte-equality test on the Porto Seguro op log through both layers (fake-indexeddb in Vitest + real Postgres in docker); AD-2 identity test (Sumário rows on Dexie = pre-issue list on Postgres); outbox coalescing unit tests; API test that generate after a full flush returns 200 not 409 | Story 1.4, 1.5, 3.7, 4.3 | Epic 1 to 4 |
| R-003 | BUS | pt-BR parse, unit scaling (MΩ/GΩ, µΩ, kV) or criterion operator direction wrong: a value printed under a signature is wrong or a failing value is not flagged | 2 | 3 | 6 | MITIGATE | Table-driven kernel tests for `parse`/`format` (comma decimal, point thousands, `147G` suffix, echo-back), `compare` per operator and unit, `VAL CALCULADO`, outlier check, per-sheet `criterion_override`; property-based round trip `format(parse(x)) == canonical(x)`; E2E: type `251` µΩ against `< 250 µΩ` and see NC hint (addendum §3 defect) | Story 5.5, 5.6 | Epic 5 |
| R-004 | BUS | The generated document is not FO.SERV-03: section 9 grouping or `feeds_block_id` pairing wrong, photo numbering drifts between preview and issue, sub-block omission wrong, TOC pages wrong; SM-4 fails on 2026-10-03 | 2 | 3 | 6 | MITIGATE | Kernel tests for `groupForPrint` (both schemes, `agrupar_por_tipo`, unpaired cable warning), `numberPhotos`, `resolveSection8`, `derivedPoints`; Porto Seguro golden test at DOCX XML level with masks (94 sheets, 11 subsections, 82 photos, section order); draft-equals-issued test; TOC pass-2 assertion; manual read-through by the design partner recorded as evidence | Story 7.1 to 7.5 | Epic 7 |
| R-005 | TECH | LibreOffice in the container: fonts missing, conversion timeout, per-job profile leak, two-pass TOC non-convergent | 2 | 2 | 4 | MONITOR | Skeleton story (4.8) proves the container path early; API test with `GENERATE_FAULT=libreoffice_timeout` asserts `generation_job/{id}/error` op and no revision allocated (TC-3); font presence asserted in the image build test | Story 4.8 | Epic 4 |
| R-006 | DATA | Sync semantics wrong: a rejected op blocks the batch, a dead op re-enters state, rebase clobbers pending edits, pull advances the cursor past an unparseable op, `superseded` misreported | 2 | 3 | 6 | MITIGATE | API integration tests for `POST /api/sync/ops` (≤ 500, order, per-op atomicity, `400 op_invalid`, `op_path_unknown`, `403 op_server_only`, tenant 403, idempotent re-push returns same `seq`); pull tests (`since`, project-scope union, dedupe across streams, 426 does not advance cursor); kernel rebase unit tests; E2E offline edit → online → server snapshot equals device snapshot; dead op listed by `preIssue` and "Reenviar" | Story 1.5 | Epic 1 |
| R-007 | DATA | Suggestion contract leaks: a pending value is written, counted, printed or auto-confirmed wrongly; confirm and discard batches not atomic | 2 | 3 | 6 | MITIGATE | Kernel tests: `applyOp` sets and clears `source_suggestion_id`; `progress`, `preIssue`, `syncCounts`, renderer ignore `pending`; `compareSuggestion` equal → auto-confirm with `meta.auto`, different → `mode = replace`; snapshot includes only referenced suggestions; API test: client push of `suggestion/{id}` create → 403; E2E Flow 2b "Confirmar todos" skips `verify` | Story 8.1, 8.4, 8.6 | Epic 8 |
| R-008 | SEC | Cross-tenant read, or session handling that drops queued work (401), or cookie without `httpOnly; SameSite=Lax; Secure` | 1 | 3 | 3 | DOCUMENT (test as P0) | Two-company seed + no-cross-read test on every stream and file route; 401 mid-sync keeps the outbox and raises the banner (E2E); cookie flags asserted on sign-in response; no signup route exists (404) | Story 1.3, 1.5 | Epic 1 |
| R-009 | TECH | Seed data transcription errors (field lists, kinds and units, five checklist lists, four table grammars, criteria, boilerplate, template skeleton): every sheet and the document inherit the error; the source document is gitignored | 3 | 3 | 9 | BLOCK | Seed tests assert counts and verbatim labels against `addendum.md` §9 (para-raio 5, seccionadora 10, disjuntor 13, TP 12, TC 14, transformador 12 + conclusion; checklists 5/5/14/15/15; grammars; criteria with operator, type and source; `EPÓXI`/`EPOXI` normalized; one column order); criterion-without-source rejected at seed time; design-partner review of the rendered skeleton against FO.SERV-03 recorded in Story 3.1; seed version is append-only so a fix is a new version. Residual after mitigation: P 2 × I 3 = 6 | Story 3.1 dev + Matheus + design partner | Epic 3, before Epic 4 |
| R-010 | PERF | Generation time of the 124-page / 82-photo document is UNKNOWN; certificate PDFs rasterized page by page; concurrency 1 | 2 | 2 | 4 | MONITOR | Measure on the Porto Seguro fixture in Story 7.5 and record `duration_ms` from the job log; then set the tolerance as a threshold test; the Export dialog shows progress and a failure state (E2E with fault flag) | Story 7.5 + PM for the number | Epic 7 |
| R-011 | OPS | No CI by policy: one developer, tests run locally, no burn-in, a merge can skip the suite | 3 | 2 | 6 | MITIGATE | `pnpm verify` as the documented pre-merge gate (lint, kernel unit, api integration, Playwright smoke `@p0`); full Playwright run at each epic close, recorded in the PR; keep the suite < 15 min so it is actually run; propose a GitHub Actions workflow as a post-MVP story in Epic 11 | Matheus | Story 1.1, ongoing |
| R-012 | TECH | Camera, geolocation, EXIF and HEIC paths are untested by automation and differ per browser | 2 | 2 | 4 | MONITOR | Import path automated with EXIF fixtures; camera via fake media stream in Chromium; `context.setGeolocation` and denied-permission case; `exifr` and re-encode unit tests on fixtures; manual iPad camera check (TC-5, TC-12) | Story 6.1, 6.4 | Epic 6 |
| R-013 | DATA | Photo upload queue: duplicate objects on retry, `409 file_row_missing` not retried, one failed file blocks the queue, reading-priority ordering wrong, thumb replaced before upload | 2 | 3 | 6 | MITIGATE | API tests: `PUT /api/files/{id}` idempotent by `sha256`, 409 before the create op, 413 over 25 MB, wrong mime refused; uploader unit tests with an injected transport (ordering: pending reading first, capture time, other kinds; two in flight; failed file skipped); E2E FR-54 scenario 2 (network dropped mid-upload, resume) | Story 2.2, 6.2 | Epic 2, 6 |
| R-014 | TECH | Time and timezone: UTC storage vs America/Sao_Paulo display, calibration 30-day window, 5-day banner, photo sort key; tests flaky without clock control | 2 | 2 | 4 | MONITOR | TC-1 clock injection; TZ pinned in containers and Playwright (`timezoneId: 'America/Sao_Paulo'`); kernel tests at DST-free and boundary dates | Story 1.4 | Epic 1 |
| R-015 | BUS | Status table or `editedSince` family set wrong: revision guard returns a stale revision, Emitido never returns to Em revisão, system ops counted as edits | 2 | 2 | 4 | MONITOR | Table-driven unit tests for `statusTable` and `editedSince`; API test: generate twice without edits returns the same revision; edit after Emitido emits the status op in the same batch | Story 4.6, 7.5 | Epic 4, 7 |
| R-016 | SEC | Reading providers receive client photographs with no LGPD gate (post-MVP); a misconfiguration could enable a real provider locally | 1 | 2 | 2 | DOCUMENT | Config test: providers default to `fake` when unset; a docker-compose test asserts no outbound provider call (fake provider logs only) | Story 8.4 | Epic 8 |
| R-017 | TECH | Contract skew and Dexie upgrades: outbox lost on upgrade; 426 handled as a generic error | 1 | 3 | 3 | DOCUMENT | Outbox-survives-upgrade test (mandated); E2E: server minimum version bumped → full-screen "Atualizar", pushes still accepted, cursor unchanged | Story 1.5 | Epic 1 |
| R-018 | PERF | Client performance on the fixture (94 blocks, hundreds of cells, `useLiveQuery` re-renders): sheet open and Sumário not "immediate"; threshold UNKNOWN | 2 | 2 | 4 | MONITOR | Playwright timing on the Porto Seguro fixture: measure sheet open, Sumário render, checklist tap latency; PM sets a number after the first measurement; then an assertion with a generous ceiling | Story 4.3, 5.1 + PM | Epic 4, 5 |
| R-019 | TECH | Accessibility and ergonomics regressions (React Aria mapping, contrast, keyboard reorder, target size) | 2 | 2 | 4 | MONITOR | axe-core in Playwright on every surface (WCAG 2.2 AA rules); bounding-box assertions ≥ 48 px (56 px field controls); keyboard-only reorder E2E; the disabled 2.04:1 residual documented as a waiver with the adjacent-reason assertion | Story 1.2 + each surface story | Epic 1 onward |
| R-020 | DATA | Tombstones: a removed block still counted, printed or blocking a TAG; restore after export | 1 | 2 | 2 | DOCUMENT | Kernel tests: `integrity`, `progress`, renderer and snapshot exclude `removed_at`; restore is `put removed_at = null`; TAG uniqueness ignores tombstones | Story 4.5 | Epic 4 |
| R-021 | TECH | OCR sidecar contract drift (JSON Schema → pydantic) and bbox pixel-space mapping (post-slice) | 2 | 2 | 4 | MONITOR | In-repo contract test: sidecar response validated against `contract/ocr` schema on fixture images; bbox normalization unit test; not Pact (single repo) | Story 8.3 | Epic 8 |
| R-022 | OPS | Local HTTPS for tablets (Caddy + mkcert) and manual device checks are fragile and undocumented | 2 | 1 | 2 | DOCUMENT | Smoke test: `GET /api/health` over the HTTPS origin from the compose network; a written device checklist | Story 1.7 | Epic 1 |
| R-023 | SEC | The Porto Seguro fixture (Story 3.7) and golden documents would carry client material (client name, CNPJ, site, coordinates, serials, photos) into a public repository; AGENTS.md forbids copying `docs/context/` content into tracked files | 2 | 3 | 6 | MITIGATE | The fixture keeps the structure of the reference job (11 subsections, 94 sheets in the documented distribution, 82 photos) with synthetic identities, serials, coordinates and placeholder photos; a static test greps the fixture and goldens for the client's name, CNPJ and coordinates from a gitignored denylist; the manual read-through uses the real data only on Matheus's machine | Story 3.7 dev + Matheus | Epic 3, before 4.8-API-004 |

**High risks (score ≥ 6):** R-009 (9, BLOCK until the seed tests and partner review exist), R-001, R-002, R-003, R-004, R-006, R-007, R-011, R-013, R-023.

## 3.3 NFR Planning Assessment

| NFR category | In scope from | Threshold | Status | Planned evidence |
| --- | --- | --- | --- | --- |
| Security | NFR-13, AD-9, AD-10, AD-3 server-only families, AD-7 file validation | Cross-read: zero; client push of server-only family: 403; cookie `httpOnly; SameSite=Lax; Secure`; 30-day sliding; file limit 25 MB / mime allowlist; no signup | Defined | Two-company API test on every stream and file route; API tests for 403/413/415 codes; sign-in response header assertion; `pnpm audit` in `pnpm verify` |
| Performance | NFR-7, AD-15 | Sheet open, checklist tap, photo capture "immediate"; generation time for 124 pages / 82 photos | **UNKNOWN** (no numbers) | Measure on the Porto Seguro fixture (Playwright timings, job `duration_ms`), report to the PM, then encode thresholds. Clarification items C-1, C-2. k6 is not planned: one tenant, one user at a time; API latency under load is not an MVP concern |
| Reliability | NFR-1, NFR-2, AD-8, AD-24 retry table, AD-14 three attempts, `GET /api/health` | Zero data loss in the three FR-54 scenarios; retries: network and 5xx with backoff, 4xx never except 401 and 409 `file_row_missing`; reading: 3 attempts then `failed`; health up | Defined (qualitative) | FR-54 Playwright scenarios (Chromium + WebKit); uploader and sync retry classification unit tests with injected transport; reading job fault fixtures; health shape test (TC-6) |
| Scalability / capacity | NFR-8 | 94 sheets, 82 photos (design 500), ≤ 500 ops per push, 1,100 queued readings (post-slice) | Defined | Porto Seguro fixture E2E and API runs; push batch splitting unit test at 501 ops; 500-photo relatório API-level capacity test (thumb prefetch count, gallery render time) marked `@slow` |
| Maintainability | AD-2, AD-13, NFR-17, test-quality DoD | Kernel purity (no I/O), `fetch` only in three modules, dependency direction, mandatory test list present | Defined | eslint `no-restricted-imports` and a `no-fetch-outside-sync` rule in CI-less `pnpm verify`; Vitest coverage report on `packages/domain` (floor proposed: 90 % lines on `checks/`, `ops/`, `parse/`, `format/`, `print/`); test DoD checklist in review |
| Compliance / regulatory | NFR-14, NFR-10, NFR-5, NFR-11 | No criterion without operator, type, source; never "annual"; NR-10 text by `effective_from`; app never suggests Reprovado; exactly one blocking pre-issue row; pt-BR verbatim labels; photos with people skip vision (post-slice) | Defined | Seed tests; `suggestConclusionPair` and `suggestParecer` never return Reprovado / Não apto; `preIssue` blocking count test; grep test for forbidden claims in boilerplate |
| Accessibility and ergonomics (project-specific) | NFR-3, NFR-4, AD-23 | WCAG 2.2 AA; 7:1 ink, 4.5:1 semantic; 48/56 px targets; no hover-only; no swipe; reorder by keyboard; live regions | Defined with one accepted residual | axe-core per surface; bounding-box assertions; keyboard reorder E2E; `prefers-reduced-motion` and 200 % zoom smoke; waiver recorded for disabled 2.04:1 |
| Design fidelity and naming (project-specific) | NFR-15, NFR-16 | `tokens.css` and `components.css` byte-identical to mockups; no `fasor`, `Fasor`, `laudo` or emoji in user-visible strings and documents | Defined | File-diff test; grep test over `apps/web/src` strings, seed boilerplate and generated DOCX text |
| Privacy | NFR-11 | No consent gate in the POC; purge never precluded | Defined (deferred) | Config default test (R-016); no automated LGPD evidence in the MVP |

**Clarification items (thresholds to obtain, not guess):**

- C-1 Generation time tolerance for the 124-page fixture (PM/architect; measured first in Story 7.5).
- C-2 "Immediate" latency budget for sheet open, checklist tap and photo capture on a mid-range Android tablet (PM; measured first in Story 5.1).
- C-3 Storage-low threshold final value (500 MB provisional; after the iPad check).
- C-4 Whether a visible "Sincronizar agora" action is acceptable in the UX (else a test-only hook, TC-4).

## 3.4 Summary of risk findings

1. **Seed correctness (R-009) is the only BLOCK-level risk** and the cheapest to retire: seed tests against the addendum plus one partner review, before Epic 4 instantiates anything.
2. **Six DATA/BUS risks at score 6** share one root: the design puts every guarantee in the kernel and the op log, so the mandated kernel and replay tests (ASR-1, ASR-2, ASR-5, ASR-6) are the backbone of the plan and must exist by the end of Epic 1 and Epic 3, not at the end of the slice.
3. **The document (R-004) is the slice's pass/fail test.** Golden DOCX comparison with masks and the draft-equals-issued test are the automated proxy for SM-4; the design partner's read-through is the human one.
4. **Durability (R-001, R-013)** is proven by three named scenarios on two engines plus a manual iPad checklist with evidence; nothing else on the field path is trusted until they pass.
5. **Operational risk (R-011)** is a policy choice; the plan compensates with a fast, mandatory local gate and a full run per epic.

# Step 4: Coverage Plan & Execution Strategy

## 4.1 Coverage Matrix

Test ID format `{epic}.{story}-{LEVEL}-{seq}` maps every scenario to the story in `epics.md` that owns it. Levels: UNIT (Vitest, `packages/domain`, no I/O), INT (Vitest or Playwright runner against docker-compose Postgres and MinIO, no browser), API (Playwright runner, `apiRequest`, no browser), CMP (component, Playwright CT on the shared components), E2E (Playwright browser). Duplicate-coverage rule: business rules are asserted once at UNIT; API asserts wire semantics and persistence; E2E asserts that a kernel result reaches the user and that the offline path holds.

### A. Kernel (`packages/domain`) — UNIT and INT

| ID | Scenario | Level | Priority | Risk / ASR |
| --- | --- | --- | --- | --- |
| 1.4-UNIT-001 | `parsePath`/`formatPath`: every client and server family round-trips; unknown family, unknown field key and `se`/`env` on a `coluna` node are rejected | UNIT | P0 | ASR-1, R-002 |
| 1.4-UNIT-002 | `applyOp`: second `create` on the same id is a no-op; `remove` sets `removed_at`; `put removed_at = null` restores; `order_key` put reorders; `batch_id` groups N ops; undo is inverse ops | UNIT | P0 | ASR-1, R-020 |
| 1.4-UNIT-003 | Outbox coalescing: consecutive `put` on one path coalesce only when neither has `meta` or `batch_id`; keeps last `op_id`, `value`, `client_ts` and first `prev_op_id` | UNIT | P0 | R-002 |
| 1.4-UNIT-004 | `applyOp` materializes provenance and attribution: `source_suggestion_id` set from `meta`, cleared on a later plain `put`; `created_by`, `first_edited_at`, `last_modified_by/at` from `sheet/*`, `not_tested` and photo files | UNIT | P0 | ASR-2, AD-18 |
| 1.4-UNIT-005 | Schema-reference test: no company- or project-scope schema references a relatório-scope row | UNIT | P1 | AD-5 |
| 1.4-UNIT-006 | Clock injection: every time-dependent kernel function accepts `now`; a test calls each with two fixed dates and gets different, expected results | UNIT | P1 | TC-1, R-014 |
| 1.4-INT-001 | Op replay byte-equality: the Porto Seguro op log replayed in `seq` order through the Dexie layer (fake-indexeddb) and the Drizzle layer (Postgres in docker) yields byte-equal `RelatorioSnapshot`s; dead ops excluded on both | INT | P0 | ASR-1, R-002 |
| 1.5-UNIT-001 | Rebase: after a pull, pending outbox ops re-apply on top of pulled values; `prev_op_id` untouched; dead ops stay excluded | UNIT | P0 | ASR-5, R-006 |
| 1.5-UNIT-002 | Retry classification: network and 5xx retry with backoff and jitter; 4xx never except 401 (banner, outbox intact) and 409 `file_row_missing` | UNIT | P0 | ASR-5, R-006, R-013 |
| 1.5-UNIT-003 | Push batching: 501 pending ops split into two requests in apply order | UNIT | P1 | NFR-8 |
| 1.5-UNIT-004 | Pull cursor: an unparseable op stops the cursor before it; `426` never advances it | UNIT | P1 | ASR-12, R-017 |
| 1.6-UNIT-001 | `statusTable` `(state, event) → state` per AD-22, including manual backward moves and "edit after Emitido → Em revisão"; `editedSince` counts only the named families and never system, suggestion, status, registry, template or user ops | UNIT | P1 | R-015 |
| 1.6-UNIT-002 | `syncCounts(snapshot, outbox)` and banner priority order | UNIT | P1 | AD-24, AR-27 |
| 2.6-UNIT-001 | Criterion comparison honours operator direction with unit scaling (MΩ vs GΩ, µΩ, kV); `± 0,5 %` relative criterion | UNIT | P0 | ASR-6, R-003 |
| 2.6-UNIT-002 | `calibrationCheck`: expired before period end, expiring within 30 days after it, valid; never returns a blocking status | UNIT | P1 | AD-19, NFR-10 |
| 3.1-UNIT-001 | Seed counts and labels equal `addendum.md` §9: nameplate fields per type (0/5/10/13/12/14/12), five checklist lists (5/5/14/15/15) verbatim, four table grammars, conclusion block on Transformador de força | UNIT | P0 | ASR-7, R-009 |
| 3.1-UNIT-002 | Seed criteria carry operator, value, unit, type and source; a criterion missing any is rejected at seed time; edition nullable; source "aceitável na ficha" allowed | UNIT | P0 | ASR-7, NFR-14 |
| 3.1-UNIT-003 | Normalizations: one checklist column order; `EPÓXI`/`EPOXI` one value; `not_tested_reason` list is exactly the three attested reasons with justification text | UNIT | P1 | R-009 |
| 3.1-UNIT-004 | `getDefinition(seed_version, report_type, block_type)` resolves every shipped version; boilerplate keyed by `(section, effective_from)`; no "anual"/"annual" string in any boilerplate; forbidden marketing claims absent | UNIT | P1 | NFR-14 |
| 3.2-UNIT-001 | Subtype `na_defaults`: manual seccionadora → Motor and Fusíveis NA; dry-type TP/TC/transformer → oil rows NA; items never removed; disabled sub-block values retained but ignored by `progress`, `preIssue`, `composeConclusion`, `integrity`, `syncCounts` | UNIT | P1 | AD-18, AD-21 |
| 3.4-UNIT-001 | `instantiateTemplate`: every block born inside its column with a suggested TAG; `BlockConfig` copied; `template_id`, `template_version`, `seed_version` recorded; the batch contains no op that targets an existing relatório | UNIT | P0 | AD-5, R-002 |
| 3.4-UNIT-002 | Seeded "Cabine primária — padrão" instantiates to 94 equipment blocks in the documented skeleton with `agrupar_por_tipo` on for 1° Subsolo and Geradores only | UNIT | P1 | R-009 |
| 4.1-UNIT-001 | `suggestTag`: type plus column ("SEC-C05", "SEC-C05-2"); ignores tombstoned equipment; uniqueness over `(project_id, tag)` | UNIT | P1 | AD-25 |
| 4.3-UNIT-001 | `preIssue` rows equal the Sumário rows for the same snapshot; exactly one blocking row (parecer); razão social and logo warn only; dead ops listed as "N alterações rejeitadas" | UNIT | P0 | ASR-1, NFR-10 |
| 4.3-UNIT-002 | `progress` and `sheetState` precedence: Não ensaiada › Concluída › Em preenchimento › Vazia; blocks with pending suggestions are not filled; "concluída com pendências" flagged by `integrity` | UNIT | P0 | ASR-2, AD-18 |
| 4.5-UNIT-001 | `integrity`: duplicate TAG names where the existing one lives; unknown location; edit on a tombstone; unpaired cabos de saída; cert_number mismatch | UNIT | P1 | AD-24, AD-19 |
| 5.5-UNIT-001 | `parse`: comma decimal, point thousands, unit suffix (`147G`), whitespace, rejects letters; result is `{raw decimal string with '.', unit, state}`; `format` is the inverse; property test `format(parse(x))` canonical | UNIT | P0 | ASR-6, R-003 |
| 5.5-UNIT-002 | Echo-before-compare: the compared value is the parsed echo, not the keystrokes; `not_measured` prints "-" and is excluded from comparison | UNIT | P0 | R-003 |
| 5.5-UNIT-003 | Magnitude outlier hint and `VAL CALCULADO` from nameplate; derived cells never stored | UNIT | P1 | FR-28, AD-11 |
| 5.8-UNIT-001 | `suggestConclusionPair` never returns Reprovado; `composeConclusion` text with criteria line; `text_basis` hash changes when an input changes; renderer prints text only when `edited` or hash equals current | UNIT | P0 | NFR-10, ASR-2 |
| 5.8-UNIT-002 | `suggestParecer`/`composeParecer` never return Não apto; summary lists untested equipment | UNIT | P0 | NFR-10 |
| 5.3-UNIT-001 | `suggestNameplateCopy` (same type and manufacturer in this relatório) and "Copiar da última visita" key filtering by the target block's seed version, "N campos copiados" | UNIT | P1 | AD-25 |
| 6.3-UNIT-001 | `numberPhotos` sort key `(captured_at, device_id, local_seq)`; provisional before export; frozen with the revision | UNIT | P1 | AD-17, R-004 |
| 6.6-UNIT-001 | `extractPhotoRefs`, `resolveSection8` ("Imagem NN" in first-appearance order), `derivedPoints` (untested blocks after manual points, suppressed by a point with `origin: not_tested`), tombstoned photo token flagged | UNIT | P1 | AD-26 |
| 6.1-UNIT-001 | `contextCaption` gender and number from registry metadata; EXIF time and GPS parsed from fixtures; re-encode parameters | UNIT | P1 | AD-7, AD-17 |
| 7.1-UNIT-001 | `groupForPrint`: `por_local_e_tipo` with and without `agrupar_por_tipo`, `ordem_de_campo` as base; pairing by `feeds_block_id` only; unpaired cable at the end with warning; para-raios and cabos inside Seccionadoras when grouped | UNIT | P0 | R-004 |
| 7.1-UNIT-002 | Sub-block with `enabled = false` omitted from print; four uncaptured Bloco C columns print "-"; tombstones excluded | UNIT | P1 | R-004, R-020 |
| 7.4-UNIT-001 | `section11Instruments` resolves certificate files by `instrument_id`; council switches CREA/ART vs CRT/TRT labels | UNIT | P1 | FR-6, FR-70 |
| 8.1-UNIT-001 | Digit coverage: `digits(value) === digits(concat(cited tokens))` on every kind; failing → `verify`; `compareSuggestion` equal → auto-confirm batch with `meta.auto`, different → `mode = replace` | UNIT | P0 | ASR-2, ASR-14, R-007 |
| 8.1-UNIT-002 | `RelatorioSnapshot` includes exactly the suggestions referenced by a current cell; `progress`, `preIssue`, `syncCounts` and renderer ignore `pending` | UNIT | P0 | R-007 |
| 8.4-UNIT-001 | bbox normalization over the `print` image; `preprocessing_applied: false` skips mapping; token ids `t{index}` | UNIT | P1 | R-021 |

### B. Server (`apps/api`) — API and INT, no browser

| ID | Scenario | Level | Priority | Risk / ASR |
| --- | --- | --- | --- | --- |
| 1.1-API-001 | `GET /api/health` shape `{status, db, queue, storage, libreoffice}` all `up` in docker-compose; reachable over the Caddy HTTPS origin | API | P1 | TC-6, R-022 |
| 1.3-API-001 | Sign-in sets `httpOnly; SameSite=Lax; Secure` cookie; sign-out; protected routes 401 without cookie; no signup route (404); seed CLI provisions and resets a user | API | P0 | ASR-9, R-008 |
| 1.3-API-002 | Cross-tenant: two seeded companies; every stream, file, generate and revision route refuses the other company's ids (403 or empty), including `PUT /api/files/{id}` | API | P0 | ASR-8, R-008 |
| 1.5-API-001 | `POST /api/sync/ops`: ≤ 500 ops applied in array order; per-op atomicity (one `400 op_invalid` does not block the rest); `op_path_unknown`; `403 op_server_only` for every server-only family; tenant 403; response `{applied[{op_id, seq}], rejected[{op_id, code}], superseded[]}` | API | P0 | ASR-5, R-006 |
| 1.5-API-002 | Idempotency: re-pushing the same `op_id` returns the same `seq`, no duplicate row; `seq` monotonic per company across two users | API | P0 | R-006 |
| 1.5-API-003 | `superseded`: an op whose `prev_op_id` is not the server's current op on that path is applied and reported | API | P1 | AD-24 |
| 1.5-API-004 | Pulls: `GET /api/sync/company?since` returns company scope only plus per-relatório `summary` from `progress`; `GET /api/sync/relatorios/{id}?since` returns relatório ops ∪ project-scope ops ordered by `seq`; a relatório created later receives the project's whole history; `last_push_at` per `(user_id, device_id)` in summary | API | P0 | ASR-5, R-006 |
| 1.5-API-005 | Contract skew: `CONTRACT_VERSION` below minimum → pull `426 contract_outdated`, push still accepted | API | P2 | ASR-12 |
| 2.2-API-001 | `PUT /api/files/{id}`: idempotent by `sha256`; `409 file_row_missing` before the create op is applied; `413 file_too_large` over 25 MB; mime allowlist per kind; emits `file/{id}/uploaded_at` and `variants` system ops; `thumb ≤ 512`, `print ≤ 2000` long edge; `GET /api/files/{id}/{original|thumb|print}`; object key layout; adapter has no delete | API | P0 | ASR-4, R-013 |
| 2.5-API-001 | Registry dedupe: "Schneider" and "SCHNEIDER" pushed from two devices converge to one row; sheet values untouched | API | P1 | AD-19 |
| 4.8-API-001 | `POST /api/relatorios/{id}/generate` with `{last_op_id, file_ids_expected}`: `409 not_caught_up` until applied and stored; then `generation_job` create, status ops, revision op `{number, snapshot_seq, docx_file_id, pdf_file_id}` in one transaction; `last_nameplate` projection ops emitted; polled with `recurse` | API | P0 | ASR-3, R-004 |
| 4.8-API-002 | Fault: `GENERATE_FAULT=libreoffice_timeout` → `generation_job/{id}/error` op, no revision allocated, no file rows; next generate succeeds | API | P1 | TC-3, R-005 |
| 4.8-API-003 | Revision guard: generate twice with no `editedSince` edits returns the last revision; a `sheet/*` edit produces revision n+1; a `registry/*` edit does not | API | P1 | R-015 |
| 4.8-API-004 | Small-fixture golden DOCX (1 cabine, 3 blocks): unpacked XML equals golden with masks (dates, revision line); TOC pass-2 pages equal pass-1 (job log assertion); PDF page count and outline headings match | API | P0 | ASR-3, TC-7 |
| 7.5-API-001 | Preview: identical job with RASCUNHO watermark; new `file` row `kind: preview`, `relatorio/preview_file_id` system op, served at `preview.pdf`; preview and issued DOCX differ only by watermark part and revision line | API | P0 | ASR-3 |
| 7.5-API-002 | Porto Seguro golden: full fixture generates; DOCX XML equals golden with masks; 94 sheets, 11 section-9 subsections, 82 photos numbered without repeats, section 8 with derived untested entries, section 11 certificates; `duration_ms` recorded (`@slow`) | API | P0 | R-004, R-010 |
| 8.4-API-001 | Reading job with `fake` providers: file receipt with `reading_kind` enqueues one job (singleton `(photo_id, reading_kind)`), `reading_status` ops queued → running → done; `suggestion/{id}` creates with `pending` only; `trust` from digit coverage; registry cross-check on `manufacturer` and `voltage_class`; `reading_run` row with tokens, model, prompt version, usage USD | API | P0 | ASR-14, R-007 |
| 8.4-API-002 | Reading faults: fixture `outcome: error` → three attempts then `failed`; `POST /api/photos/{id}/reread` creates a new run and deletes previous pending suggestions; client push of `suggestion/{id}` create → 403 | API | P1 | TC-3, R-007 |
| 8.4-API-003 | Provider config: `LLM_PROVIDER`/`OCR_PROVIDER` unset → `fake`; boot fails on an unknown value (zod env schema) | API | P1 | R-016 |
| 8.3-API-001 | OCR sidecar conformance (post-slice): response on fixture images validates against `contract/ocr` JSON Schema; bbox within image bounds | API | P1 | R-021 |

### C. Shared components (`apps/web/src/components`) — CMP

| ID | Scenario | Level | Priority | Risk / ASR |
| --- | --- | --- | --- | --- |
| 1.2-CMP-001 | Tri-state row, Suggestion field (amber, crop, Confirmar, Substituir, Verificar), Generated text field (Confirmar/Editar), Position box (clamped), Quantity stepper, Overflow menu: React Aria state mapped onto `.is-*` and `[data-state]`; `aria-disabled` plus `aria-describedby` reason; no `isDisabled` | CMP | P1 | AD-23, ASR-11 |
| 1.2-CMP-002 | Input layer: press-and-hold triggers drag; no action bound to swipe; `touch-action` set; stylus pointer type handled | CMP | P1 | NFR-3 |
| 1.2-CMP-003 | axe-core on each component in light and dark theme; hit area ≥ 48 px (56 px field controls) | CMP | P1 | ASR-11, R-019 |

### D. End to end (`apps/web` + `apps/api` in docker-compose) — E2E

Projects: `chromium-desktop`, `android-chrome` (Pixel emulation, touch), `webkit` (only `src/db` and `src/sync` suites plus the FR-54 scenarios). Import path is the automated capture path; camera uses Chromium fake media.

| ID | Scenario | Level | Priority | Risk / ASR |
| --- | --- | --- | --- | --- |
| 1.3-E2E-001 | Sign in online; go offline; reload; app opens from the service-worker shell and the relatório is usable; sign-out never drops the Dexie database | E2E | P0 | ASR-9, AD-8 |
| 1.3-E2E-002 | Session expired while offline: 401 during sync → re-auth banner, outbox count unchanged, re-sign-in flushes it | E2E | P0 | ASR-9, R-008 |
| 1.5-E2E-001 | Edit a sheet offline, go online, trigger sync (TC-4 hook): badge goes to zero, server snapshot equals device snapshot (compared through the API) | E2E | P0 | ASR-5, R-006 |
| 1.5-E2E-002 | A dead op (server returns `op_invalid` via a fixture path) appears in the Sumário pre-issue list as "N alterações rejeitadas — Reenviar" and is excluded from state | E2E | P1 | R-006 |
| 1.6-E2E-001 | Home status board counts per status; relatório Em campo on this device first with `is-current` and "Continuar: TAG · n de N"; card states "No aparelho", "Baixando… n de m", "Não está neste aparelho" | E2E | P1 | FR-21, FR-55 |
| 1.8-E2E-001 | FR-54 scenario 1: tab closed mid-sheet (uncommitted text in a field) → reopen offers "Rascunho encontrado — Recuperar"; committed values present; nothing applied silently | E2E | P0 | ASR-4, R-001 |
| 1.8-E2E-002 | FR-54 scenario 2: network dropped mid-upload → the file stays local and `acked = false`; reconnection resumes; server holds exactly one object | E2E | P0 | ASR-4, R-013 |
| 1.8-E2E-003 | FR-54 scenario 3: `storage.estimate` mocked under 500 MB → warning; forced `QuotaExceededError` on the Blob write → photo uploaded immediately when online, else kept in memory for one retry, error toast shown | E2E | P0 | ASR-4, R-001 |
| 1.8-E2E-004 | Eviction recovery: cookie present, database absent → one-time screen naming what the server holds, then re-pull | E2E | P1 | R-001 |
| 1.8-E2E-005 | Unsynced > 5 days banner with `page.clock`; service worker activates a new shell only when the outbox is empty | E2E | P1 | AD-8 |
| 2.1-E2E-001 | Instrument registry: create with calibration record, derived validity, certificate PDF upload reaches the server; expired instrument sorts first with "Calibração vencida" in the picker and never blocks | E2E | P1 | FR-3 |
| 2.3-E2E-001 | Empresa identity autosaves each field; brand preview updates; form title prints later in headers (asserted in 7.x) | E2E | P1 | FR-1 |
| 2.5-E2E-001 | Manufacturer created inline from a nameplate field while offline, available immediately | E2E | P1 | FR-4 |
| 2.6-E2E-001 | Acceptance criteria table read-only with source | E2E | P2 | FR-5 |
| 3.4-E2E-001 | Template composer: duplicate the seeded template, add a cabine and columns, set quantities, toggle a sub-block and a subtype, reorder; archive removes from picker without touching relatórios | E2E | P1 | FR-9 to FR-11, FR-13 |
| 4.1-E2E-001 | Create project and relatório from the seeded template: Sumário shows 94 blocks in their columns with suggested TAGs; a duplicate TAG typed is refused inline naming where it lives | E2E | P0 | AD-5, R-009 |
| 4.2-E2E-001 | Setup page bands autosave; prefill of client, site, responsável; "Concluir dados do relatório" moves Rascunho → Em campo | E2E | P1 | FR-16, FR-21 |
| 4.3-E2E-001 | Sumário rows show the kernel pre-issue status; header counts navigate; section 9 expands to the tree; the same rows drive the Export dialog list | E2E | P0 | ASR-1 |
| 4.5-E2E-001 | Add a block in the field from a tree row and from a sheet; remove with confirm and undo toast; restore from Overflow; duplicate asks a new TAG; reorder by drag, Overflow, Alt+arrows and Position box; every move announced and undoable; no swipe performs an action | E2E | P1 | FR-18, FR-19, ASR-11 |
| 4.6-E2E-001 | Status transitions and the "relatório emitido" banner after an edit; manual backward move through confirm | E2E | P1 | R-015 |
| 4.7-E2E-001 | Section text edit with variable chips, "Restaurar texto do template" with undo; template unchanged | E2E | P2 | FR-12 |
| 5.1-E2E-001 | Flow 2 on a fully conforme sheet with a copied plate: cabine data once, nameplate copy, checklist bulk "Todos C", instrument by code, readings typed in one run, conclusion suggested and confirmed in one tap; sheet Concluída; tap count asserted ≤ 19 | E2E | P0 | Core journey, SM-3 proxy |
| 5.5-E2E-001 | Type `251` with unit µΩ against `< 250 µΩ`: value echoed as `251 µΩ`, NC hint shown, criterion and source printed beside; `3.300` and `3,300` parse as documented | E2E | P0 | ASR-6, R-003 |
| 5.6-E2E-001 | Continuous keyboard run across tables; not-measured cell; calculated ratio cell not editable | E2E | P1 | FR-27 |
| 5.4-E2E-001 | Checklist tri-state taps, NC expansion with pre-seeded chips, bulk action with undo | E2E | P1 | FR-25, FR-26 |
| 5.9-E2E-001 | Não ensaiado with a reason: fields read-only, row state, derived section 8 entry later | E2E | P1 | FR-31 |
| 6.4-E2E-001 | "Adicionar fotos" import (JPEG with EXIF, HEIC) with one "De qual equipamento?" answer: context captions, stamps, chronological gallery, provisional numbers | E2E | P1 | R-012, FR-43 to FR-48 |
| 6.1-E2E-001 | Camera burst with Chromium fake media; geolocation granted and denied; stamp with and without coordinates | E2E | P1 | R-012 |
| 6.5-E2E-001 | Caption from chips and free text; batch caption on import | E2E | P2 | FR-46 |
| 6.6-E2E-001 | Point of attention from an NC row with a photo token chip; token to tombstoned photo flagged at pre-issue; derived untested entries listed | E2E | P1 | AD-26 |
| 7.5-E2E-001 | Export dialog: outstanding list equals Sumário rows; parecer is the one blocking row; "Enviando…" flush then "Gerando…"; preview PDF with RASCUNHO; issue creates revision 1; revision history lists it; DOCX downloaded and unpacked (`handleDownload` + `readZIP`) contains the form title, cover client and 94 sheets on the fixture (`@slow`) | E2E | P0 | ASR-3, R-004 |
| 7.5-E2E-002 | Edit after Emitido: banner names issue date and revision; next generate is revision 2 | E2E | P1 | R-015 |
| 8.6-E2E-001 | Flow 2b: import a plate photo offline → queued state line; go online → sync → "Sugestões prontas" toast; Suggestion fields amber with crop and region outline; `verify` fields excluded from "Confirmar todos"; typing into a pending target discards it; nothing pending counted as filled | E2E | P0 | ASR-2, R-007 |
| A11Y-E2E-001 | axe-core WCAG 2.2 AA on every surface (Login, Home, Project, Setup, Sumário, Composer, Templates, Sheet, Gallery, Points, Registries, Export, Sync status, Account) in light and dark; known residual (disabled 2.04:1) excluded by rule id with a waiver note | E2E | P1 | ASR-11, R-019 |
| A11Y-E2E-002 | Keyboard-only reorder in Sumário and tree; dialogs trap focus, close on Esc, return focus; live region announces transitions | E2E | P1 | ASR-11 |
| ERGO-E2E-001 | Bounding boxes of interactive controls ≥ 48 px, field controls ≥ 56 px on `android-chrome`; no hover-only affordance (assert every action reachable by tap) | E2E | P1 | NFR-3 |
| STATIC-001 | Grep tests: no `fasor`, `Fasor`, `laudo` in `apps/web` user-visible strings, seed boilerplate or generated document text; no emoji code points; `tokens.css` and `components.css` byte-identical to the mockups | static | P2 | NFR-15, NFR-16 |
| STATIC-002 | Fixture and golden hygiene: no client name, CNPJ, coordinates or serials from a gitignored denylist appear in `fixtures/`, goldens or `test-artifacts/` | static | P0 | R-023 |
| LINT-001 | eslint: `fetch` only in `src/sync`, `src/files`, `src/api`; `no-restricted-imports` for dependency direction; `packages/domain` imports zod only | static | P1 | ASR-10 |

### Scenario counts by priority (planned)

P0 is applied strictly (critical data, safety, security or compliance impact with no workaround); seven scenarios that a golden test already covers or that have a manual workaround were demoted to P1. Each scenario expands to several test cases, and the P0 share of the executed suite is expected to be well under the scenario share.

| Priority | UNIT/INT | API | CMP | E2E/static | Total |
| --- | --- | --- | --- | --- | --- |
| P0 | 20 | 11 | 0 | 12 | 43 |
| P1 | 21 | 8 | 3 | 22 | 54 |
| P2 | 0 | 1 | 0 | 4 | 5 |
| P3 | 0 | 0 | 0 | 0 | 0 |

## 4.2 NFR Coverage and Evidence Plan

| NFR category | Validation scenarios | Level / tool | Evidence artifact for `nfr-assess` | Gap or assumption |
| --- | --- | --- | --- | --- |
| Security | 1.3-API-001, 1.3-API-002, 1.5-API-001 (403 server-only, tenant), 2.2-API-001 (413, mime), 1.3-E2E-002 | Playwright API + E2E; `pnpm audit` | Playwright HTML report; `pnpm audit --json` in `pnpm verify` output | RLS deferred by design; single tenant in the MVP |
| Performance | 7.5-API-002 `duration_ms`; timing probes in 4.3-E2E-001 and 5.1-E2E-001 (sheet open, Sumário render, checklist tap) | Job log; Playwright `performance.now()` timings written to a JSON attachment | `test-artifacts/perf/porto-seguro-YYYY-MM-DD.json` | Thresholds UNKNOWN (C-1, C-2): first run measures, PM sets numbers, then assertions |
| Reliability | 1.8-E2E-001..005, 1.5-UNIT-002, 2.2-API-001, 4.8-API-002, 8.4-API-002, 1.1-API-001 | Playwright E2E (Chromium + WebKit), API, Vitest | Playwright report with traces on failure; manual iPad checklist file | iPadOS eviction and camera are manual evidence only |
| Scalability / capacity | 7.5-API-002 (94 sheets, 82 photos), 1.5-UNIT-003 (501 ops), CAP-API-001 500-photo relatório thumb prefetch and gallery render (`@slow`) | API + E2E `@slow` | Same perf JSON | No k6: one tenant, one active user; revisit before the second company |
| Maintainability | LINT-001, Vitest coverage on `packages/domain`, test DoD in review | eslint, `vitest --coverage` | `coverage/coverage-summary.json` | Floor: 90 % lines on `checks/`, `ops/`, `parse/`, `format/`, `print/`; 80 % overall on the kernel |
| Compliance / regulatory | 3.1-UNIT-002..004, 5.8-UNIT-001..002, 4.3-UNIT-001 | Vitest | Vitest JSON report | NR-10 2027 text: data-model only |
| Accessibility and ergonomics | A11Y-E2E-001..002, ERGO-E2E-001, 1.2-CMP-003 | axe-core in Playwright, bounding boxes | axe JSON per surface; waiver record for disabled contrast | Manual stylus session on a tablet for feel |
| Design fidelity and naming | STATIC-001 | static tests | `pnpm verify` output | none |
| Privacy | 8.4-API-003 | API | Playwright report | LGPD basis post-POC |

## 4.3 Execution Strategy

No CI exists by policy, so the tiers are local commands and a written cadence.

| Tier | Trigger | Content | Budget |
| --- | --- | --- | --- |
| **PR gate** (`pnpm verify`) | Before every story merge, output pasted in the PR | lint + static tests; all UNIT and INT; all API except `@slow`; Playwright `@p0` on `chromium-desktop` | < 15 min |
| **Story full run** | Before merging a story with a front end | Playwright suites of the surfaces the story touches on `chromium-desktop` and `android-chrome`; `webkit` when `src/db` or `src/sync` changed | < 30 min |
| **Epic close** ("nightly" equivalent) | Before the epic retrospective | Full Playwright on three projects; `@slow` Porto Seguro golden and capacity; axe on every surface; perf JSON refreshed | < 60 min |
| **Manual device check** ("weekly") | Story 1.8, then once per epic touching capture or sync | iPad Safari and Android tablet checklist: offline reload, photo capture, storage eviction, HTTPS origin; evidence saved under `test-artifacts/manual/` | 1 to 2 h |

Selective execution by tag: `@p0`, `@p1`, `@slow`, `@webkit`; `runBurnIn` is not applicable without CI and is listed as a post-MVP addition with the GitHub Actions story.

## 4.4 Resource Estimates (ranges)

Test work is embedded in each story (AGENTS.md: nothing ships untested); the ranges below are the testing share, for planning the slice.

| Priority | Estimate | Notes |
| --- | --- | --- |
| P0 | 55 to 85 h | Kernel fixtures (Porto Seguro op log, small fixture), golden DOCX harness, three FR-54 scenarios, sync API suite dominate |
| P1 | 40 to 65 h | Surface E2E, component tests, axe, registry and template flows |
| P2 | 8 to 15 h | Secondary flows and static tests |
| P3 | 0 to 3 h | none planned |
| Test framework and fixtures (one-off) | 12 to 20 h | merged fixtures, auth provider, factories, docker reset script, fake provider fixtures, fault flags |
| **Total** | **115 to 190 h** | Spread across Epics 1 to 8; the P0 kernel and sync suites must exist by the end of Epic 1 and Epic 3 |

## 4.5 Quality Gates

- P0 pass rate 100 % on every PR gate; P1 pass rate ≥ 95 % at epic close with every failure ticketed.
- R-009 gate: seed tests (3.1-UNIT-001..004) green and the partner review recorded before Story 4.1 starts.
- High-risk mitigations (R-001, R-002, R-003, R-004, R-006, R-007, R-013) have their listed tests implemented and green before the slice's 2026-10-03 gate; R-011 has `pnpm verify` documented and used from Story 1.1.
- Kernel coverage: ≥ 90 % lines on `checks/`, `ops/`, `parse/`, `format/`, `print/`; ≥ 80 % on `packages/domain` overall.
- Every in-scope NFR category has an evidence artifact named above; PASS/CONCERNS/FAIL is decided by `nfr-assess` once evidence exists; the two UNKNOWN thresholds (C-1, C-2) become CONCERNS by default until numbers exist.
- No committed `.only`, no skip without a reason, no `waitForTimeout`, no raw `page.route` on application calls (playwright-utils mandate); deviations listed under "Playwright Utils deviations" in the PR.

# Step 5: Generate Outputs & Validate

## Execution mode

Requested `auto`; capability probe: subagents available, agent teams not available; resolved mode **subagent**. The QA document was generated by one subagent from this checkpoint; the architecture document and the BMAD handoff were written by the orchestrator in parallel; the three were reconciled afterwards.

## Outputs

- `_bmad-output/test-artifacts/test-design-architecture.md` (architecture contract: blockers B-1 to B-7, 23 risks, NFR testability requirements, testability concerns, mitigation plans, assumptions)
- `_bmad-output/test-artifacts/test-design-qa.md` (test recipe: dependencies, 103 scenarios by priority, NFR evidence plan, execution tiers, effort, tooling, code examples)
- `_bmad-output/test-artifacts/test-design/fasor-handoff.md` (BMAD handoff: blockers as acceptance criteria per story, P0 scenarios per story, data-testid hooks, risk-to-story map, phase gates)

## Reconciliation

- Scenario counts corrected to the row count of the matrix: P0 44, P1 54, P2 5, P3 0, total 103 (the step 4 table had 45 / 52 / 6 before correction).
- Risk register: 23 risks (R-023 added in step 5 from the ADR test-data criterion 2.2); 10 high (R-009 at 9), 8 medium, 5 low; identical ids in all three documents.
- Priority tightening: seven scenarios demoted from P0 to P1 (3.1-UNIT-003, 3.4-UNIT-002, 7.1-UNIT-002, 3.2-UNIT-001, 4.8-API-002, 8.4-API-002, 6.4-E2E-001); STATIC-002 added as P0 for R-023.
- No emoji in any output (project policy); the template's emoji markers were replaced by words. No "laudo" outside quoted source deltas.
- Table cells containing literal pipes reworded in the handoff and the QA document.

## Checklist deviations, stated

- The architecture document is 344 lines against the checklist's 150 to 200 target: ten high-priority risks each need a mitigation plan and the ADR checklist summary was requested by the knowledge fragment; no test code or recipe sections are present.
- P0 is 43 % of scenarios against the "under 10 %" best practice: at system level each scenario groups several test cases and the product's guarantees are data-integrity guarantees for a signed document; the P0 set was tightened once and the share of P0 in executed test cases is expected to be well under the scenario share.
- No CI tiers: the execution strategy uses the project's own tiers (PR gate, story full run, epic close, manual device check) because AGENTS.md forbids CI in the MVP; k6 and chaos tiers are marked not applicable with reasons.
- No browser exploration and no Pact loading: system-level mode with no code; `pact_mcp_reachable = false` recorded in step 2.

## Open assumptions carried into the documents

- One active device per relatório in the MVP (source-deltas).
- Spine `[ASSUMPTION]` values are the tested values until changed (500 ms, 60 s, 500 MB, 25 MB, 2560 px, two uploads, 5 days).
- WebKit desktop approximates iPadOS Safari except eviction.
- The Porto Seguro fixture can be synthetic without losing the structure the goldens need.

## Clarification items for the PM and architect

- C-1 generation time tolerance (after Story 7.5 measurement)
- C-2 "immediate" latency budget (after Story 5.1 measurement)
- C-3 storage-low threshold (after the iPad check)
- C-4 visible "Sincronizar agora" vs a test-only hook

## on_complete

Resolved `workflow.on_complete` is empty; no hook executed.

# Decisions taken with Matheus after generation (2026-09-21)

| Item | Decision | Effect |
| --- | --- | --- |
| C-4 / B-4 sync trigger | Visible "Sincronizar agora" button on Sync status | Story 1.5 acceptance criterion; EXPERIENCE.md updated; no test-only hook |
| R-023 / B-7 fixture material | **Waived without restriction**: the Porto Seguro fixture and goldens use the real client data | AGENTS.md policy amended; STATIC-002 withdrawn; R-023 status WAIVED (owner Matheus, no expiry) |
| R-011 merge gate | `pnpm verify` mandatory, output pasted in the PR; CI stays post-MVP | Story 1.1 acceptance criterion; AGENTS.md policy line |
| R-009 seed gate | Matheus reviews the seed against FO.SERV-03 before Story 4.1; Bruno reviews the first DOCX in Story 4.8 | Stories 3.1 and 4.8 acceptance criteria |
| B-1, B-2, B-3, B-6 blockers | Added as acceptance criteria in `epics.md` (Stories 1.1, 1.3, 1.4, 1.5, 3.7, 4.8, 8.4) with the 2026-09-21 mark | Handoff applied; no `bmad-correct-course` run needed |
| C-1, C-2, C-3 thresholds | Measure first (Stories 5.1, 7.5, iPad check), then fix numbers | Stay UNKNOWN; `nfr-assess` treats them as CONCERNS until then |
| TC-12 manual iPad check | Matheus runs it in Story 1.8 and at the close of Epics 5, 6 and 8 | Story 1.8 acceptance criterion; evidence in `test-artifacts/manual/` |


Applied to: `epics.md` (Stories 1.1, 1.3, 1.4, 1.5, 1.8, 3.1, 3.7, 4.8, 8.4), `AGENTS.md` (policy lines and a Decisions of record section outside the managed block), `EXPERIENCE.md` (Sync status surface), the three test-design documents. Scenario totals after withdrawing STATIC-002: P0 43, P1 54, P2 5, total 102.
