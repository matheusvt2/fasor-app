---
title: 'Story 14.10 lane B: honest emission audit, sync retry wording, focus after a plate shot, Hoje on Proxima intervencao'
type: 'bugfix'
created: '2026-10-15'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-14-context.md'
warnings: ['batched', 'multiple-goals']
# batched: Story 14.10 is one carry-over story cut into two lanes; lane B carries four small field-and-audit parts (3, 5, 7, 9) that share no code with lane A.
deferred: []
---

<intent-contract>

## Intent

**Problem:** Four production findings of 2026-10-15: (3) the emission audit cut a 76-sheet relatório at `AUDIT_INPUT_MAX_CHARS`, dropped the only filled sheets, and then flagged a CTA photo caption as naming an equipment "que não consta", with no word on screen that the check was partial; (5) a slow or failing sync against a server that still answers reads "Sem conexão"; (7) after a one-shot "Fotografar placa" the focus falls on `BODY`; (9) "Próxima intervenção recomendada" lacks the "Hoje" chip the service dates have.

**Approach:** (3) the kernel's `auditInput` sends filled sheets before empty ones, carries each sheet's screen label beside its printed title, and reports sheets sent and total; the job stores that on the run (`audit_run/{id}/coverage`, contract 20) and the audit summary shows "Conferidas N de M fichas". (5) after an unreachable cycle the engine probes `GET /api/health`; when it answers, the kernel badge state is `retrying` ("Tentando de novo"). (7) the plate camera's single-shot close hands the focus to the plate row's reading line. (9) pass `today` to the Etapa 5 DateField.

## Boundaries & Constraints

**Always:** Every count, plural and status word is derived in `packages/domain` (AD-2); new static copy goes in `apps/web/src/copy/pt-br.ts` in ONE new block commented `// Story 14.10 lane B (co15b)` (lane A adds its own block in the same file). Section order of `AUDIT_SECTION_ORDER` and the existing ref ids stay. Contract 20 is documented in `packages/domain/src/contract/version.ts` beside 19 in the same style, `MIN_CONTRACT_VERSION` goes to 20 (a v19 bundle's `opSchema` refuses the new field), with an api integration test through the sync route. New pt-BR strings marked `// authored:`.

**Never:** Do not change `packages/domain/src/print/` (layout, section 9 titles: lane A), `apps/api/src/` render or generation jobs, `scripts/verify.ts`, `scripts/e2e.ts`, `docker-compose.yml`, the playbook. Do not touch part 11's suggestion buttons, part 10's Home count, or the fabrication dates (no "Hoje" there). No new client request timeout on sync calls. No new mock class: a new badge state mirrors an existing mock rule's declarations in `app.css`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Audit under the cap | 12-sheet fixture | `sheetsSent === sheetsTotal`; text unchanged except the sheet line suffix | - |
| Audit cut | 76 sheets (v5), 2 filled incl. a CTA with a captioned photo, cap hit | both filled sheets' `[sheet:]` lines sent before any empty one; `sheetsSent < 76`, `sheetsTotal === 76`; `truncated` | marker line as today |
| Audit, no sheets | layout with no section 9 sheet | `sheetsTotal === 0`; screen shows no coverage line | - |
| Coverage text | (1,1) (2,76) (0,3) | "Conferida 1 de 1 ficha", "Conferidas 2 de 76 fichas", "Conferidas 0 de 3 fichas" | `null` coverage or total 0 -> '' |
| Old run | `audit_run` row without `coverage` | parses with `coverage: null`; summary as today | - |
| Sync ok | server answers | `ok` / `pending` as today | - |
| Sync retrying | last cycle ended unreachable (network or 5xx), health probe answered 2xx | badge `retrying`, long "Tentando de novo", announcement "Tentando de novo" | the next 60 s cycle or "Sincronizar agora" retries |
| Sync offline | browser offline, or unreachable cycle and probe failed or not yet answered | "Sem conexão" as today | - |
| Plate one shot | "Fotografar placa", shutter, camera closes | focus on the plate row's reading line (pending row, then the stored row's), never `BODY` while the reading is waiting | user-moved focus is never stolen |
| Hoje | Etapa 5 Próxima intervenção empty | "Hoje" chip writes today (America/Sao_Paulo) through `next_intervention_date`; filled field shows no chip (13.4 rule) | - |

</intent-contract>

## Code Map

- `packages/domain/src/audit/input.ts` -- `auditInput`, `sectionLines` case `'sheets'` (subsections, `localParts`, `sheetLines`), `sheetLabelOf` (screen label "Chave de transferência automática CTA-APAGAR"), cap loop at the end. `AuditInput` gains `sheetsSent`, `sheetsTotal`.
- `packages/domain/src/relatorio/sheet-state.ts:101` `sheetState(block) === 'vazia'` -- the "empty sheet" rule to reuse (also `emptySheetCount` in `relatorio/progress.ts:239`).
- `packages/domain/src/audit/text.ts` -- `auditSummaryText`, `auditCheckedAtText`; add `auditCoverageText(run)`; plural helper `text/plural.ts`.
- `packages/domain/src/audit/audit.test.ts` -- fixtures (`portoSeguroSmall`, `instantiateTemplate`, `standardTemplate`, `layoutSpec` draft); the 14.4 block at :329 shows building a v4/v5 relatório snapshot.
- `packages/domain/src/schemas/entities.ts:655` `auditRunRowSchema` -- add `coverage: {sent:int>=0, total:int>=0} | null`, default null.
- `packages/domain/src/ops/path.ts:59` `AUDIT_RUN_FIELDS` -- add `coverage`; `status/edited-since.ts:85` already decides the family (never an edit).
- `packages/domain/src/contract/version.ts:150,242` -- 20 and MIN 20 with dated paragraphs.
- `apps/api/src/jobs/audit/job.ts` -- put `coverage` in the done batch; log `sheets_sent`/`sheets_total`. Its integration test sits beside it (`*.integration.test.ts`); `apps/api/src/http/audit.ts:111` create value gains `coverage: null`.
- `apps/web/src/surfaces/export/audit-findings.tsx` -- `.audit-summary` line: add a `<span className="audit-coverage">` with `auditCoverageText(run)` when non-empty.
- `packages/domain/src/sync/counts.ts` -- `SyncBadgeState`, `SyncBadgeInputs`, `syncBadgeState`, `syncBadgeLabel`, `syncBadgeShortLabel`, `syncAnnouncementText`, `syncStatusWord`; `packages/domain/src/home/cards.ts` uses `SyncBadgeState` (exhaustive switches must compile).
- `apps/web/src/sync/engine.ts` -- `EngineStatus` (:67), `cycle()` finally block (:625) publishes `lastFailure`; add `serverAnswers: boolean | null` set by a health probe after a cycle whose failure `isUnreachableFailure` (online only), reset to null on a clean cycle. `apps/web/src/sync/client.ts` -- add `health()` (`GET /api/health`, 5 s abort, true on 2xx).
- `apps/web/src/sync/policy.ts:58` `unreachableCause`; `apps/web/src/state/sync.tsx:313,438,490` -- pass `retrying` into `syncBadgeState`; `isSyncReachable` keeps today's meaning.
- `apps/web/src/surfaces/sync/sync-status-surface.tsx:97` -- cause note: when retrying, a new `copy.sync.serverRetrying` note instead of `serverUnreachable`.
- `apps/web/src/components/sync-badge.tsx`, `sync-announcer.tsx`, `apps/web/src/test/sync-state.ts` -- render the new state; `apps/web/src/styles/components.css` `.sync-badge[data-state="pending"]` rules -> mirrored in `app.css` for `retrying`.
- `apps/web/src/surfaces/ficha/plate-photo.tsx` (`PlatePendingRow` :69, `PlatePhotoRow` :112 with its own retake camera and opener), `photo-openers.tsx` / `use-photo-capture.ts` (`PlateCaptureTile`, `useCamera(..., opener, {singleShot})`), `apps/web/src/input/focus-restore.ts` (`restoreFocus`, `until: 'moved'`, the co14b "Adicionar foto" watch is the precedent).
- `apps/web/src/surfaces/relatorio/setup/etapa5-local.tsx:134` DateField; `etapa1-capa.tsx:14` `today = () => calendarDateOfInstant(now())`.
- e2e: `e2e/emission-audit.spec.ts`, `e2e/sync-status.spec.ts`, `e2e/plate.spec.ts` / `plate-shot-fallback.spec.ts` (camera stubbing pattern), `e2e/keyboard-salvo.spec.ts:115` (13.4-E2E-002 Hoje pattern).

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/audit/input.ts` -- in the sheets section emit, per subsection, its heading, `localParts` and its non-empty sheets first; then, per subsection with empty sheets, its heading again and the empty sheets. The sheet line becomes `[sheet:<id>] <printed title> (<sheetLabelOf>)` when the label differs from the title case-insensitively, else unchanged. Count `sheetsTotal` (PrintSheets of the layout) and `sheetsSent` (sheet lines inside the cut). Update the header comment.
- `packages/domain/src/audit/text.ts` -- `auditCoverageText(run)`: '' for null coverage or total 0; `Conferida(s) N de M ficha(s)` (participle by N===1, noun by M===1). authored.
- `packages/domain/src/schemas/entities.ts`, `ops/path.ts`, `contract/version.ts` -- coverage field, path enum, contract 20 / MIN 20.
- `apps/api/src/jobs/audit/job.ts`, `apps/api/src/http/audit.ts` -- write and initialise coverage; api integration test: a run through the route + job (fake provider) pulls `audit_run/{id}/coverage` with the counts, and a client push of that path is refused as server-only.
- `apps/web/src/surfaces/export/audit-findings.tsx` -- render the coverage text.
- `packages/domain/src/sync/counts.ts` -- `retrying` state: inputs gain `serverAnswers?: boolean`; order conflict > error > offline(browser) > retrying (reachable false and serverAnswers true) > offline (reachable false) > pending > ok. Long and announcement "Tentando de novo"; short "Tentando" (authored); `syncStatusWord` treats it like `offline` (running -> "Sincronizando…").
- `apps/web/src/sync/client.ts`, `engine.ts`, `state/sync.tsx`, `sync-status-surface.tsx`, `copy/pt-br.ts`, `styles/app.css` -- the probe, the input, the cause note, the look mirror.
- `apps/web/src/surfaces/ficha/*` plate path -- on a single-shot close from "Fotografar placa" (and the retake), watch the focus with `restoreFocus(..., { mode: 'if-lost', frames: LIST_FOCUS_WATCH_FRAMES })` onto the plate row's reading line (give `.reading-line`/`.queued-banner` of the plate row `tabIndex={-1}`), falling back to the stored row's `.photo-tile`, then `.plate-crop-open` once the reading is ready. Never steal a focus the user moved.
- `apps/web/src/surfaces/relatorio/setup/etapa5-local.tsx` -- `today` prop on Próxima intervenção only.
- Tests: kernel tests in `audit.test.ts` (order, counts, CTA reproduction) and the sync counts test file (three states, labels); e2e as in the ACs; close the two `deferred-work.md` entries of 2026-10-15 (audit CTA, plate focus) with a dated `state` line; add a `deferred-work.md` entry for any narrowing.
- `docs/kbs/log.md` and the matching `docs/kbs/` concept -- dated notes (audit coverage, sync retrying, contract 20).

**Acceptance Criteria:**
- Given a v5 relatório of 76 sheets with 2 filled (one a CTA tagged `CTA-APAGAR` with a captioned photo) and a cap small enough to cut, when `auditInput` runs, then both filled sheets' lines and the photo line are sent, every empty sheet line comes after them, `sheetsTotal` is 76, `sheetsSent` counts the sent sheet lines, and the sent text contains the caption's equipment and TAG words as the caption writes them (case-insensitive). The test first fails on today's code (record the failing assertion in the PR).
- Given a done run with coverage (2, 76), when the Export dialog's audit section and the Sumário render, then they show "Conferidas 2 de 76 fichas"; an e2e (`emission-audit.spec.ts`, fake provider) asserts the line and the stored `audit_run.coverage`.
- Given the sync push route answering 503 (Playwright route, with a delay) while `/api/health` answers, when the engine finishes a cycle, then the badge and Sync status read "Tentando de novo", not "Sem conexão"; when the route is released and "Sincronizar agora" is tapped, then it returns to "Sincronizado"; with the browser offline it reads "Sem conexão". Kernel test covers the three states.
- Given "Fotografar placa" one shot at 390 and 768 px (camera stubbed as in `plate-shot-fallback.spec.ts`), when the camera closes, then `document.activeElement` is inside the plate row (the reading line or tile), never `BODY`, and stays off `BODY` until the reading settles; the assertion goes red with the fix reverted (mutation run).
- Given Etapa 5 with Próxima intervenção empty, when "Hoje em Próxima intervenção recomendada" is tapped and the page reloads, then the field shows today and the store holds `relatorio.setup.next_intervention_date` = today; the fabrication dates show no chip.

## Design Notes

Contract 20 is this batch's: a v19 bundle would fail the whole pulled page on the unknown `audit_run/field` value, so MIN goes to 20. Stories 14.9/14.11 take the next free number after it. The coverage is counted where the text is built, so the screen states what the model actually read.

Open questions (kept conservative, listed in the PR): whether a sync request still in flight but slow (no failure yet) should already read "Tentando de novo" (today: no client timeout, so it reads the previous state until it fails); whether the "Hoje" chip should also show on a filled Próxima intervenção (13.4's rule: empty only).

## Verification

**Commands:**
- `podman compose --profile tools run --rm --user root tools pnpm test:unit -- packages/domain/src/audit packages/domain/src/sync` -- green
- `podman compose --profile tools run --rm --user root tools pnpm test:api -- jobs/audit` -- green
- story gate: `pnpm lint`, `pnpm static`, `pnpm test:unit`, `pnpm test:api`, then `pnpm exec tsx scripts/e2e.ts e2e/emission-audit.spec.ts e2e/sync-status.spec.ts e2e/plate-shot-fallback.spec.ts e2e/plate.spec.ts e2e/keyboard-salvo.spec.ts --project desktop-chrome --project durability-desktop-chrome` under the host lock (the orchestrator runs it).
