---
title: 'Story 13.8: the emission audit, one AI pass before Emitir that points and never writes'
type: 'feature'
created: '2026-10-07'
status: 'ready-for-dev'
baseline_revision: 'a0a02d7'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-13-context.md'
  - '{project-root}/AGENTS.md'
warnings: ['batched', 'oversized']
batched_reason: 'Epic 13 batch E: one story (13.8) in its own batch, run beside batches A to D under the batched playbook; it owns the Export dialog, the Sumario findings rows and the new audit job.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** Between "field done" and "Emitido" nothing reads the assembled relatório for contradictions rules cannot see
(review-field-ux-2026-10-06.md AI-3); the F-03 confirmation only counts empties.

**Approach:** One optional tap "Conferir antes de emitir" in the Export dialog posts one audit request; a server job on
the existing pg-boss instance builds the relatório's assembled text from the kernel's print layout (no photos), sends
it once to the LLM with a versioned prompt, validates the findings against the references it sent, and returns them as
a server-only `audit_run` entity through the relatório's sync stream. The device renders the findings from IndexedDB
as information rows with "Ver" in the dialog and on the Sumário. Nothing else reads them.

## Boundaries & Constraints

**Always:**
- The tap is optional and never automatic; it never blocks: "Gerar relatório", "Emitir mesmo assim", the F-03 count
  (`issueConfirmText`), the pre-issue rows and the Sumário statuses are byte-for-byte what they are without an audit.
- With `useAiFeatures()` false the button, the findings block in the dialog and the findings block on the Sumário are
  not rendered (no disabled look); with `AI_FEATURES=off` the route answers `409 ai_features_off` and the provider
  refuses permanently.
- One tap = at most one run and one LLM call: pg-boss `retryLimit` 0; while a run is active the button is disabled and
  the route answers `409 audit_running` with the active run's id (no enqueue).
- The input is text and values only (section texts, sheet tables with verdicts, readings and observations, conclusion,
  parecer, restrições, photo captions, point rows); never image bytes, file keys or URLs.
- The prompt is a versioned constant (`AUDIT_PROMPT_VERSION`); it asks the model to point at contradictions with one
  pt-BR sentence each, citing only the refs it was given, and never to rewrite, correct or propose text (a unit test
  asserts no rewrite/suggest instruction). It names the four finding kinds: `conclusion_vs_nc` (a conclusion that
  disagrees with its NC items), `reading_out_of_family` (a reading far out of family across phases or units without a
  mark), `parecer_vs_restricoes` (a parecer that disagrees with the restrições it summarizes), `caption_equipment`
  (a caption naming an equipment the relatório does not carry).
- Each run logs one structured line `audit run` with company, relatório, run id, model, prompt_version, input and
  output tokens, `usd` (`usdFor` of bedrock.ts; 0 on fake), finding count, dropped count and duration. The assembled
  text is capped (kernel constant, about 48k characters, truncated with a marker) so one run stays around one US cent
  on Haiku 4.5, inside the USD 100/month ceiling.
- The screen says the pass is AI (authored note); each finding names its sheet, row or section via a kernel-composed
  target label.
- Derived text (kind labels, target labels, counts/plurals, "Conferido às HH:MM") lives in `packages/domain`; static
  copy in `apps/web/src/copy/pt-br.ts` under an `audit:` block marked `// authored:`.

**Never:**
- A finding is never written into a sheet, block, relatório field, suggestion, pre-issue row, count, status, snapshot
  or document. `audit_run` is not part of `RelatorioSnapshot`, `layoutSpec`, `preIssue` or `sumarioRows`.
- No edit to `apps/api/src/jobs/reading/providers/fake.ts`, `providers/fixtures/`, `jobs/reading/fixtures/` (batch D)
  nor to camera-view, use-photo-capture, photo-encode, capture-rescue (batch A).
- No change to the device-composed conclusion or parecer text (NFR-12 stays deterministic for those).
- No `ReadingKind` enum member: the reading framework requires a photo (payload `photo_id`, `reading_runs.photo_id
  NOT NULL`, failure writes `file/{id}/reading_status`). The audit is a sibling queue on the same pg-boss instance,
  modelled on `jobs/generate` (narrowing).
- No new SQL table or migration: `audit_run` rows live in the generic `entities` table like `generation_job`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Happy path | AI on, online, idle dialog, tap | 202 `{audit_run_id}`; run `queued`, `running`, `done` with findings; rows render in dialog and Sumário | none |
| No findings | model returns `[]` | `done`; one line "Nenhum ponto encontrado" (domain text) | none |
| Bad refs | model cites a ref not sent, unknown kind, empty or over-long text | that finding dropped, counted in `dropped` in the log; others kept | none |
| Provider fails | Bedrock error, timeout, invalid tool output | run `failed`; dialog says it could not check; button tappable again (new run) | logged with error class |
| Stale run | `queued`/`running` older than the kernel age limit (same rule shape as `isJobActive`) | device reads it as failed; route allows a new tap | none |
| Double tap | active run exists | button disabled; route 409 `audit_running` with the id; no second job | none |
| Offline | `online` false | button disabled with authored reason "Sem conexão: a conferência precisa do servidor." | none |
| Unflushed ops | outbox has unsent ops | same flush and `not_caught_up` barrier as the preview, then POST | 409 handled like preview |
| AI off | `features.ai=false` / `AI_FEATURES=off` | no button, no findings blocks; route 409 `ai_features_off`, no job, no entity | none |
| Old findings | relatório edited after the run | findings stay with meta "Conferido às HH:MM" (domain); never block | none |

</intent-contract>

## Code Map

- `packages/domain/src/ops/path.ts:181-287` -- `FAMILIES`; add `audit_run` (create, serverOnly) and `audit_run/field` (serverOnly, fields `status`, `findings`, `prompt_version`, `finished_at`, ...) mirroring `generation_job` at :259-271; entity in `schemas/entities.ts` (registry :605, `generationJobRowSchema` :576 is the model).
- `packages/domain/src/contract/version.ts:91,148` -- `CONTRACT_VERSION` 14 -> 15 with a changelog comment. Precedent (versions 6, 7, 8 in the MIN comment): an older bundle cannot parse a new family, so `MIN_CONTRACT_VERSION` goes to 15 unless the web apply path is shown to skip unknown families safely; record which in the comment.
- `packages/domain/src/contract/generate.ts:17-50`, `contract/reading.ts:14` -- precedents for a new `contract/audit.ts` (`AUDIT_ROUTE` `POST /api/relatorios/:id/audit`, request with the preview's barrier fields, response `{audit_run_id}`); add error code `audit_running` (reuse `ai_features_off`) in `contract/errors.ts`.
- `packages/domain/src/print/layout.ts:196` `layoutSpec(snapshot, inputs)` -- the assembled document; sections union :94-108; §9 sheets `section-9.ts` (`PrintSheet{blockId,title,parts}`), §10 parecer/bullets `section-10.ts:18`, §7 captions `section-7.ts`, §8 rows `section-8.ts`.
- New `packages/domain/src/audit/` (exported from the package index): `auditInput(layout) -> {text, refs: AuditRef[]}` with refs `section:<n>`, `sheet:<blockId>`, `row:<blockId>:<part>:<row>`, `photo:<fileId>`, each with kernel label and nav target (`{kind:'section', rowKey: SumarioRowKey}` | `{kind:'sheet', blockId}` | `{kind:'photos'}`); `AUDIT_FINDING_KINDS`, `auditFindingSchema`, `validateAuditFindings(raw, refs) -> {kept, dropped}` (kept carry resolved target and label); `auditRunActive(run, nowIso)`, `auditFindingRows(run)` (kind label, target label, text, nav), `auditSummaryText(run)`, `auditCheckedAtText(run)`.
- `apps/api/src/http/generate.ts:101-200` -- route precedent (`readRelatorio`, `activeJob`, `missing()` barrier); new `apps/api/src/http/audit.ts`, wired in `http/app.ts` with `aiFeatures` and an `enqueueAudit` dep (see `http/reading.ts:33,46` AI-off 409 precedent).
- `apps/api/src/jobs/generate/worker.ts` (whole file, 110 lines: `QUEUE_OPTIONS` retryLimit 0, `ensureGenerateQueue`, `enqueueGenerate`, `recordInvalidPayload` via `serverOp` + `applyOps(..., {origin:'server'})`, `registerGenerateWorker`), `jobs/queue.ts:21` (`createQueueOnce`), `sync/server-op.ts` (`serverOp`, the one envelope builder; actor `system:audit`) -- the pattern for new `apps/api/src/jobs/audit/` (`payload.ts`, `worker.ts`, `job.ts`, `provider.ts`, `prompt.ts`, `fixtures/fake-audit.json`), registered where the generate worker is (`main.ts`).
- `apps/api/src/sync/snapshot.ts:20,64` (`freezeSnapshot`/`toSnapshot`) and `jobs/generate/job.ts:232` -- how the job gets the snapshot and calls `layoutSpec` (use `draft: true` inputs as preview does).
- `apps/api/src/jobs/reading/providers/bedrock.ts` -- `converseTool` (~:299, not exported), `BEDROCK_PRICES` :69, `usdFor` :81, `assertPricedModel` :88, `bedrockClientSource` :112, `classifyBedrockError` :267. Export `converseTool` and its types (minimal edit, allowed: batch D owns only `fake.ts` and fixtures). Default model as the reading providers' config (Haiku 4.5).
- `apps/api/src/jobs/reading/providers/index.ts:76` `createReadingProviders`, `unimplemented.ts` -- the AI-off / fake / bedrock switch to mirror in `jobs/audit/provider.ts`. The fake reads `jobs/audit/fixtures/fake-audit.json`: canned findings, one per kind, whose refs are selectors (`first-sheet`, `first-row`, `section:10`, `first-photo`) resolved against the input refs (a selector with no match is skipped).
- `apps/web/src/surfaces/export/export-dialog.tsx:73,395-447` -- `ExportDialog`; the `precheck` list markup (`ul.precheck > li`, `pc-text`, `pc-meta`, `pc-actions` + `TextButton`) is the findings row look (mock `73-exportar.html` :69-72). The audit block goes after "Antes de emitir", before the document control. `onSeeInSumario` (:52) for section targets. The generate row and F-03 `issue-confirm` (:342-390) stay untouched.
- `apps/web/src/surfaces/export/use-generate.ts` (header :43-52: flush, barrier, 409 retry, poll), `db/generate-store.ts:144` -- the state-machine and live-query precedents for a new `db/audit-store.ts` `useLatestAuditRun(relatorioId)` and a `use-audit.ts` hook (flush, POST, poll until done/failed); POST through `sync/client.ts` (:241 precedent).
- `apps/web/src/surfaces/relatorio/sumario-surface.tsx:105-176,281-299,411` -- Sumário (`highlighted`/`setHighlighted` :136); add a findings block (shared component `surfaces/export/audit-findings.tsx`) after the rows from the latest `done` run; "Ver": sheet/row -> `/relatorio/:id/ficha/:blockId`, photo -> `/relatorio/:id/fotos`, section -> `setHighlighted(new Set([rowKey]))` and scroll into view. In the dialog a section "Ver" calls `onSeeInSumario([rowKey])`.
- `apps/web/src/state/ai-features.tsx:12` `useAiFeatures()`; test precedent `relatorio-tree.test.tsx:398-433` (`AiFeaturesContext`).
- `apps/web/src/copy/pt-br.ts:461` (`export:` block) -- add an `audit:` block, `// authored:`: button "Conferir antes de emitir", heading "Conferência por IA", note "Feita por IA: aponta pontos para você conferir. Nada é alterado no relatório.", running "Conferindo…", failure "Não foi possível conferir agora.", offline reason, "Ver".
- e2e: `e2e/prose-reading-pipeline.spec.ts:53-79` (`syncUntilVisible`, real fake job), `e2e/ai-features-off.spec.ts:42` (`aiFeaturesOff(page)`), `e2e/export.spec.ts` (opening the dialog), `e2e/support/outbox.ts` `readStore`.
- api tests: `apps/api/src/sync/caption-batch.integration.test.ts:63-107` (`signIn`, `appWith`, `push`, `relatorio`) -- sync-route integration helpers.
- `_bmad-output/specs/spec-fasor/SPEC.md` (`## Capabilities`, CAP-N entries with intent/success) -- append a new CAP entry for the emission audit dated 2026-10-07, never rewrite a sentence; if `docs/kbs/` summarizes the capability list, update that concept and `docs/kbs/log.md`.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/audit/*`, `ops/path.ts`, `schemas/entities.ts`, `contract/audit.ts`, `contract/errors.ts`, `contract/version.ts` -- entity, families, route contract, input builder, validator, row/text derivations, version bump -- kernel owns every label, count and validation.
- `packages/domain/src/audit/*.test.ts` -- refs and labels over a fixture snapshot's layout; no image/file key in `text`; truncation cap; validator drop cases; rows/plural/checked-at texts; `layoutSpec`, `preIssue` and `sumarioRows` equal with and without an `audit_run` entity in the store.
- `apps/api/src/jobs/audit/*` -- payload, queue (`retryLimit: 0`, singleton on run id), job (snapshot -> layout -> `auditInput` -> provider -> `validateAuditFindings` -> server ops; `audit run` log line), provider switch, Bedrock audit with prompt, fake with its fixture -- one run per tap, logged cost.
- `apps/api/src/jobs/reading/providers/bedrock.ts` -- export `converseTool` and `ConverseCall` only -- reuse without duplication.
- `apps/api/src/http/audit.ts`, `http/app.ts`, `main.ts` -- route and wiring (202, 409 `audit_running`, 409 `ai_features_off`, 404 unknown relatório, barrier).
- `apps/api/src/jobs/audit/*.test.ts` -- prompt version constant; prompt contains no rewrite/correct/suggest instruction and names the four kinds; tool schema; fake selector resolution; Bedrock audit with a stubbed client logs tokens and USD; AI off throws permanently.
- `apps/api/src/http/audit.integration.test.ts` -- through the sync route (header `x-contract-version: 15`): POST -> run the job inline under fake -> pull returns the `audit_run` create and its findings; no op other than `audit_run*` written by the job; second POST while active 409 with no second job; AI off 409, no job, no entity; a v14 pull handled as the MIN decision says.
- `apps/web/src/db/audit-store.ts`, `surfaces/export/use-audit.ts`, `surfaces/export/audit-findings.tsx`, `export-dialog.tsx`, `relatorio/sumario-surface.tsx`, `copy/pt-br.ts` -- button, states, rows with "Ver", Sumário block -- render from IndexedDB only.
- `apps/web/src/surfaces/export/*.test.tsx` -- button absent with AI off, present with AI on; running disables it; rows and "Ver" targets; "Gerar relatório" enabled while a run is running.
- `e2e/emission-audit.spec.ts` -- `@p0`: tap -> findings rows with "Ver" in the dialog (store holds the `audit_run`; outbox holds no op derived from a finding), a sheet "Ver" lands on the ficha; the Sumário shows the rows; with AI off the button and both blocks are absent. `@p1` (E8-A6): from the dialog through the real job under `fake` with no server-op seeding; findings rows fit at 390 px; "Gerar relatório" still issues with findings present. Add to `SERIAL_SPECS` (`e2e/support/groups.ts`) only if a test times a tap against a render.
- `_bmad-output/specs/spec-fasor/SPEC.md` -- append the dated capability entry.

**Acceptance Criteria:**
- Given the Export dialog with AI features on, when the user taps "Conferir antes de emitir", then exactly one `audit` job runs and the findings appear as information rows each naming its sheet, row or section with a "Ver" link, in the dialog and on the Sumário, under a note that says the pass is AI.
- Given findings are shown, when the user issues the relatório, then the document, the F-03 confirmation text, the pre-issue rows and the Sumário statuses are identical to a relatório with no audit.
- Given `LLM_PROVIDER=fake`, when the audit runs, then the fixture's canned findings (one per kind) come back without any cloud call.
- Given AI features off, when the Export dialog or the Sumário opens, then no audit button and no findings block render, and the route refuses with `ai_features_off`.
- Given a completed run, when the api logs it, then the line carries model, prompt_version, input/output tokens and `usd`.

## Spec Change Log

## Review Triage Log

## Design Notes

- Why not a reading kind: see Never. "Over the existing queue" is read as the same pg-boss instance; the coordinator writes the narrowing under 13.8.
- Ref design: the model may only cite refs it was sent; the server resolves each cited ref to a kernel label and target, so a finding can never point at something the relatório lacks. Row refs open the sheet (no in-sheet row anchor exists today; narrowing: "Ver" on a row opens its sheet, the row is named in the meta).
- Findings persist as the latest run per relatório; a new tap supersedes it (the device shows the newest `done` or active run).

## Open questions and narrowings (for the PR body)

- Narrowing: sibling `audit` queue, not a `ReadingKind` (framework is photo-bound).
- Narrowing: row "Ver" opens the sheet (no row anchor).
- Open question: the mock has no findings class; rows reuse `.precheck` markup. A dedicated look, if wanted, goes through DESIGN.md.
- Open question: the authored copy (note, heading, failure, offline) is a proposal for Matheus.

## Verification

**Commands** (host is macOS with podman; inside the tools container: `podman compose --profile tools run --rm --user root tools ...`; after a `packages/domain` change run `podman compose restart api` before api tests):
- `pnpm test:unit -- packages/domain/src/audit apps/web/src/surfaces/export` -- expected: green.
- `pnpm test:api -- src/http/audit src/jobs/audit` -- expected: green.
- `pnpm exec tsx scripts/e2e.ts e2e/emission-audit.spec.ts --project desktop-chrome` -- expected: green.
- The orchestrator runs the full stage-by-stage gate under the host lock; the implementer does not.
