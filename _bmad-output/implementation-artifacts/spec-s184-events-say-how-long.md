---
title: 'Story 18.4: the events say how long, in what order, on what and for whom'
type: 'feature'
created: '2026-11-03'
status: 'in-review'
baseline_revision: '8f0911a4bb4bb8617a52c412162eb5301a52dfa2'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-18-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/backlog-2026-10-30-ux-data-sufficiency.md'
  - '{project-root}/docs/observability.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_because: 'Wave 2 of the 2026-11-03 follow-up delivery: Story 18.4 whole plus three items that touch its files (E16-R1 in use-generate.ts beside the re-timed generate wait, the e18fa open question 2 on the session rotation, the e18fa runbook sentences in docs/observability.md, which this wave owns).'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The usage events find where friction is and how often, not how long a screen stayed open, which screen came before, on what kind of device, which typed values were refused, which Home tile or page size was pressed, or how long the engineer waited for a preview or a generated document (`backlog-2026-10-30-ux-data-sufficiency.md` § 2). Beside that: an `unchanged` ready can show the "anterior às alterações" banner over an older revision (ledger E16-R1), and a session rotated by another user's sign-in queues no `session_start` (e18fa open question 2).

**Approach:** Kernel first (`packages/domain/src/contract/telemetry.ts`, append-only), then the device writes the new fields (one view tracker for `screen_view`, a device-context helper for `session_start`, `input_refused` at each refusal point, per-tile and per-size targets), the `preview` and `generate` waits move from the request to the press with the `sync.tsx` observer extracted, seven new Terraform views bound by the tooling test, and the runbook, KB and digest template.

## Boundaries & Constraints

**Always:**
- Red-first kernel tests before the kernel change. Lists are append-only: keep every existing name, kind, target and screen (`home.status_chip`, `home.page_size` stay so old bundles pass).
- No free text and no typed value in any event: targets are constants written in code, kinds come from closed kernel lists. The e2e asserts a refused typed value never appears in the queued events.
- `track()` stays fire-and-forget. New fields are optional on the wire (old bundles send none of them); the schema refuses each new field on any name but its own and refuses on `input_refused` anything but the base keys, `target` and `kind` (both required).
- Ownership (AD-1/AD-13): a refusal reason derived from a kernel parse is mapped in `packages/domain` where the kernel already decides the refusal; `apps/web` only reports it.
- Every new view but `users` starts with `${local.ux_smoke_filter}`; `scripts/telemetry-queries.test.ts` binds every new field and literal to the kernel (it is extended, not loosened).
- Touch Home only for the `data-telemetry` names: `status-board.tsx` (tiles) and, for the size chips, the `PAGE_SIZE_OPTIONS` line and the `telemetry=` prop in `home-surface.tsx` plus an option-level name in `components/chip.tsx`. Batch f19 edits `home-surface.tsx`, `chip.tsx` and `sync.tsx` in parallel: keep those hunks minimal.
- Code, comments, docs in English; no emoji; no new user-visible string.

**Never:**
- No edit to `sprint-status.yaml`, `epics.md`, `packages/domain/src/home/cards.ts`, the Conta sentence (`copy.account.usageNote`), `apps/web/src/db/commit.ts`, the op fold, `apps/web/src/telemetry/flush.ts` drain or beacon rules, `apps/web/src/sync/engine.ts`.
- No Dexie version bump, no contract version bump, no new api route, no new op.
- No `terraform apply`, no `infra/bin/deploy`, no AWS call; Terraform only through `infra/bin/check` offline.
- Out on purpose (DoR): per-keystroke events, pointer movement, scroll depth, any value or text.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Route change | Home for 4 s, then Sumário | one `screen_view` `screen: home`, `duration_ms` about 4000, `from` the screen before Home (absent on the session's first view) | none |
| Tab hidden / `pagehide` | on a ficha | the ficha's `screen_view` is written with its duration before the beacon; shown again, a new view of the same screen starts with `from` equal to it | none |
| Full-surface screen | 426 `update`, eviction `recovery` | enter and leave through the same tracker | none |
| App load | 390 px, browser tab, online | `session_start` with `viewport: phone`, `standalone: false`, `online: true` | `matchMedia` missing: `standalone: false` |
| Breakpoints | width 767 / 768 / 1279 / 1280 | `phone` / `tablet` / `tablet` / `desktop` | none |
| Another user, same tab | `configureTelemetry` with a different database name | a `session_start` with the new id and the three fields is queued, then the held events | first configure of a load queues none (the load's own came from `startTelemetry`) |
| Typed value refused | `abc` typed in a number field, blur | one `input_refused`, `target` the field's constant, `kind: not_a_number`; no event carries `abc` | the same refusal on the next blur is a new event; keystrokes queue nothing |
| Tile / size chip | press Emitido, press 50 | `action` with `home.status_chip_emitido`, `home.page_size_50` | none |
| Preview | press "Pré-visualizar", PDF opens 20 s later | one `wait` `kind: preview` `outcome: ok`, `duration_ms` about 20 000 | failure `fail`/`offline`/`refused` by `failureOutcome`; dialog closed mid-press `cancel`; dead op blocked `refused` |
| Generate | press "Gerar relatório", revision held 25 s later | one `wait` `kind: generate` `outcome: ok` when the revision the phase names is on the device (the download can start) | failed phase: its outcome; unmount before ready: `cancel`; `not_caught_up` retries stay inside one wait |
| E16-R1 | `unchanged` ready whose revision is not pulled yet, edits since the older one | no "anterior às alterações" banner and no row tags until the revision is held | none |
| Bad event | `from` on `action`, `viewport` on `screen_view`, `input_refused` without `kind`, with `outcome`, or `viewport: 'watch'` | refused by `uxEventSchema` | the device drops it (existing `write` rule) |

</intent-contract>

## Code Map

- `packages/domain/src/contract/telemetry.ts` -- `UX_EVENT_NAMES` (append `input_refused`), `KINDS_BY_NAME` (add `input_refused: INPUT_REFUSAL_KINDS`), `UX_ACTION_TARGETS` (append 8), `uxEventSchema` (strict; add `from: z.enum(SCREENS)`, `viewport`, `standalone: z.boolean()`, `online: z.boolean()`, then per-name refinement in `superRefine`). Tests `telemetry.test.ts` (line ~196 lists targets). `RELATORIO_STATUSES` in `packages/domain/src/status/table.ts:14`; `HOME_PAGE_SIZES` in `home/cards.ts:328` (read only, f19 edits that file: write the size targets as literals).
- `apps/web/src/telemetry/hooks.ts` -- `TelemetryRoutes` (one `screen_view` per pathname change today), `useScreenView` (callers `surfaces/contract-outdated-surface.tsx`, `surfaces/eviction-recovery-surface.tsx`), `startWait`, `trackError`.
- `apps/web/src/telemetry/instrument.ts` -- `installTelemetryListeners` (visibility + `pagehide` beacon), `startTelemetry` (`track({ name: 'session_start' })`), `onClick` (a click on any `[data-telemetry]` becomes an `action`).
- `apps/web/src/telemetry/track.ts` -- `configureTelemetry` rotation (lines ~85-100), `resetTelemetryForTests`; `whenTelemetryWritten`.
- `apps/web/src/telemetry/flush.ts:120` `beaconTelemetry` reads the queue asynchronously (read only).
- `apps/web/src/state/sync.tsx` -- `observeCycle` 257, `failureCode` 271, `failureOutcome` 276, `syncWaitOutcome` 287, dead-op `trackError` effect ~385, `syncNow` wait ~474, `generate` 516 and `preview` 532 (request-level `startWait`), `rereadPhoto`. Test `state/sync-telemetry.test.tsx` (276 lines). Ledger rows at `deferred-work.md:2709` (A3) and `:2577` (request-timed waits), `:2706` area (reread timing, owner 18.4 "if it leaves it").
- `apps/web/src/surfaces/export/use-preview.ts` -- `start` (tap), `run` ends with `tab.location.href = url` / `window.open(url)` (the document opens), failure, `cancel`, `blocked`.
- `apps/web/src/surfaces/export/use-generate.ts` -- `start` 435 (tap, `flushing`), `request` 251 (`sync.generate` inside a `not_caught_up` loop), phases `failed`/`ready`, `readyHeld` 453, `beforeEdits` 456, `beforeEditsBanner` 458 (E16-R1). Tests `export-dialog.test.tsx`.
- `apps/web/src/surfaces/export/export-dialog.tsx` -- download buttons disabled while `revision === null` (304, 329): "the download can start" = the ready revision is held.
- Refusal points (investigation, all under `apps/web/src`): shared `components/number-input.tsx:136` `useNumberInput` settle (covers `surfaces/ficha/ficha-fields.tsx:331` `NumberField`, `surfaces/ficha/measurement-field.tsx:127` grid cell, `surfaces/relatorio/setup/etapa5-local.tsx:212` altitude); `ficha-fields.tsx:484-498` `DateTextField`, `:600/:609` `DatePickerField` (helper on blur); `measurement-field.tsx:349-366` `DictatedMeasurementField`; `surfaces/ficha/read-display.tsx:206/:509` `SuggestedCell`, `:707/:814` `EnvSuggestionFill`; `surfaces/ficha/nameplate-suggestions.tsx:272/:366/:378` `SuggestionFill`; `surfaces/registries/cnpj-field.tsx:44` `CnpjField`; `surfaces/registries/word-registry-panel.tsx:307` `KvField`. Kernel reasons: `numberFieldValue`, `parseMeasurementReadingPtBr`, `measurementReadingRefusal`, `parsePlateDateText`, `plateDateAccepted`, `parseReadingPtBr`, `parseFieldInput`, `isValidCnpjFormat`, `parseVoltageClassKv`.
- `apps/web/src/telemetry/targets.test.ts` -- guard that surfaces' `data-telemetry` names are in the kernel lists; `telemetry/rendered-targets.test.tsx:25-30` (tiles named `home.status_chip`).
- Home: `surfaces/home/status-board.tsx:26`, `surfaces/home/home-surface.tsx:62` (`PAGE_SIZE_OPTIONS`) and `:261`, `components/chip.tsx:62-63,88,120`; tests `components/chip.test.tsx:50-78`, `surfaces/home/home-surface.test.tsx:469,487`, `e2e/home.spec.ts:251,259`.
- `infra/production/observability.tf` -- `local.ux_queries` (10 entries), `local.ux_query_order`; `scripts/telemetry-queries.test.ts` (expects 10 queries; `CLOSED` lists; `referencedFields`, `comparedLiterals`, `kindAllowed` built from `uxEventSchema.shape`).
- `_bmad-output/test-artifacts/friction-digest-template.md` -- 11 sections; § 2 asks for Home to first navigation "by hand".
- `docs/observability.md`, `docs/kbs/architecture/usage-events.md`, `docs/kbs/log.md`; Conta sentence `apps/web/src/copy/pt-br.ts:127` (read only).
- E2E: `e2e/usage-events.spec.ts` (`readStore` on `ux_events`, offline then "Sincronizar agora"), `e2e/support/groups.ts` `SERIAL_SPECS` (a spec that generates or previews goes there), `e2e/export.spec.ts`, `e2e/parecer-export.spec.ts`.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/contract/telemetry.ts` + `telemetry.test.ts` -- red first: `INPUT_REFUSAL_KINDS = ['not_a_number', 'not_positive', 'not_applicable', 'not_a_date', 'out_of_range', 'bad_format']`; `VIEWPORTS = ['phone', 'tablet', 'desktop']` with `viewportOf(widthPx)` (below 768 phone, 768 to 1279 tablet, from 1280 desktop); `UX_INPUT_TARGETS` (`ficha.number`, `ficha.measurement`, `ficha.reading`, `ficha.suggestion`, `ficha.date`, `setup.altitude`, `cadastros.cnpj`, `cadastros.voltage_class`); `input_refused` appended to `UX_EVENT_NAMES`; the 8 targets appended to `UX_ACTION_TARGETS` with typed helpers `homeStatusTileTarget(status)` and `homePageSizeTarget(size)`; schema fields `from`, `viewport`, `standalone`, `online`; `superRefine`: `from` only on `screen_view`, the three only on `session_start`, `input_refused` requires `target` and `kind`, may carry `relatorio_id` and `block_id` (ids, not values), and carries no `outcome`, no `duration_ms` and none of the new fields. Tests: each accept, each refusal in the matrix's last row, the old shared targets still valid, an old-bundle `session_start` with no fields still valid.
- `apps/web/src/telemetry/views.ts` (new) + test -- one module-level view tracker: `enterScreen(screen, ids)` writes the open view's `screen_view` (its `screen`, ids, `duration_ms` since it opened, `from` the screen before it when there was one) and opens the new one; `leaveScreen()` writes the open view and remembers its screen; `resumeScreen()` opens a view of the remembered screen with `from` equal to it. Monotonic clock (`performance.now`). `hooks.ts` `TelemetryRoutes` and `useScreenView` call `enterScreen`; `instrument.ts` calls `leaveScreen()` on hidden and `pagehide` before the beacon (beacon after `whenTelemetryWritten()`), `resumeScreen()` on visible. Reset export for tests.
- `apps/web/src/telemetry/context.ts` (new) + test -- `deviceContext()` returns `{ viewport: viewportOf(innerWidth), standalone, online }` (`matchMedia('(display-mode: standalone)')` or `navigator.standalone === true`; `navigator.onLine`), never throws. `startTelemetry` and the `configureTelemetry` rotation queue `session_start` with it (rotation: the new session's `session_start` first, then the held events). Update `track.test.ts` and `instrument.test.tsx`.
- `apps/web/src/telemetry/hooks.ts` -- `trackInputRefused(target: UxInputTarget, kind: InputRefusalKind)`.
- Refusal points (listed in the Code Map) -- give each refusing input `data-telemetry="<its UX_INPUT_TARGETS name>"` and call `trackInputRefused` once where the refusal is decided (blur, Enter, Confirmar, the `useNumberInput` settle through an optional `onRefuse` option), never on a keystroke. `instrument.ts` `onClick` and `onPointerDown` ignore `input`, `textarea` and `select` controls so a click into a field queues no `action`. Extend `targets.test.ts` so input names are checked against `UX_INPUT_TARGETS`. Unit tests on `useNumberInput`, one date field, `CnpjField`.
- Home -- `status-board.tsx`: `telemetry={homeStatusTileTarget(status)}`; `chip.tsx`: optional per-option `telemetry` winning over the group's; `home-surface.tsx`: `PAGE_SIZE_OPTIONS` carry `homePageSizeTarget(size)` (drop the group prop). Update `rendered-targets.test.tsx`, `chip.test.tsx`, `home-surface.test.tsx`, `e2e/home.spec.ts` (assert names from the kernel helpers and one queued `action` per tile and size pressed).
- `apps/web/src/telemetry/sync-observer.ts` (new) -- move `observeCycle`, `failureCode`, `failureOutcome`, `syncWaitOutcome` out of `sync.tsx` as pure functions (`observeCycle` keeps taking its db); move their cases from `state/sync-telemetry.test.tsx` into `telemetry/sync-observer.test.ts(x)`; `sync.tsx` imports them. `sync.tsx` `generate` and `preview` lose their `startWait` (keep `trackError`).
- `apps/web/src/surfaces/export/use-preview.ts` -- `startWait('preview', { relatorio_id })` in `start` after the dead-op check; `ok` right after the tab is pointed at the PDF; `failureOutcome(error)` on failure (session expired `refused`); `cancel` on abort; a dead op found mid-drain `refused`.
- `apps/web/src/surfaces/export/use-generate.ts` -- `startWait('generate', { relatorio_id })` in `start`; one finish per press: `ok` when `phase.kind === 'ready'` and `readyHeld`; the failure's outcome (`failureOutcome` of the error, `refused` for `blocked`, missing files and session expired); `cancel` on unmount before either. E16-R1: `beforeEdits` and `beforeEditsBanner` also require `readyHeld`. Tests in `export-dialog.test.tsx`: red first, a job delivered before its revision shows no banner and no row tags, then the revision lands and they show; wait tests for both hooks with fake timers (duration covers the whole press, one `wait` per press across `not_caught_up` retries).
- `infra/production/observability.tf` -- seven views appended to `ux_queries` and `ux_query_order` (see Design Notes); `scripts/telemetry-queries.test.ts` -- 17 queries; `CLOSED` gains `from: SCREENS`, `viewport: VIEWPORTS`; backticked field names (`` `from` ``) are read as fields; a bad-query case for each new field.
- `_bmad-output/test-artifacts/friction-digest-template.md` -- a section "Five questions" (time per screen, Home to first navigation, cancels by preceding screen, sessions by user and viewport, the document wait), each naming its view and what a reader concludes; § 2's "by hand" line points at the view (dated note, old text struck).
- `docs/observability.md` -- dated 2026-11-03 notes: the new vocabulary (fields, `input_refused`, targets, the view tracker semantics), each new view with what a reader concludes, the runbook sentences of batch e18fa (Design Notes), the `ts` correction at line 7 (strike, not delete); `docs/kbs/architecture/usage-events.md` mirrored; `docs/kbs/log.md` one line.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- close with a dated note: E16-R1 (`:2727`), the per-tile row (`:2594`), the request-timed waits part of `:2577`, the A3 extraction (`:2709`), the reread row stays open (its owner text names the next carry-over batch when 18.4 leaves it; add a dated line saying 18.4 left it); new heading `## Deferred from: batch s184 (2026-11-03)` for every narrowing.
- `e2e/usage-events.spec.ts` -- extend or add `@p0` tests: after two route changes the queue holds `screen_view` rows with `duration_ms` and `from`; `session_start` has `viewport: 'desktop'`, `standalone: false`, `online`; a typed `abc` refused in a ficha number field queues one `input_refused` with its constant and `not_a_number`, and `JSON.stringify` of the whole queue never contains the typed text.
- New `e2e/usage-events-documents.spec.ts` (registered in `SERIAL_SPECS` with its reason) -- `@p0`: "Pré-visualizar" queues one `wait` `preview` `ok` whose `duration_ms` is at least the measured tap-to-PDF-tab interval minus 1 s; "Gerar relatório" queues one `wait` `generate` `ok` after the download buttons enable, with `duration_ms` at least the measured interval minus 1 s.

**Acceptance Criteria:**
- Given the kernel contract, when an event is parsed, then `screen_view` accepts `duration_ms` and `from`, `session_start` accepts `viewport`, `standalone`, `online`, `input_refused` needs a `target` and a closed `kind`, the eight targets are in `UX_ACTION_TARGETS`, and anything else on those events is refused.
- Given a device on the new bundle, when the user leaves a screen, opens the app, has a typed value refused, presses a tile or a size chip, or waits for a preview or a generation, then the queue holds the event with the new fields and nothing more, and no queued event contains the refused text.
- Given `infra/bin/check` offline and `scripts/telemetry-queries.test.ts`, when they run, then every view validates and names only kernel fields and literals, 16 of the 17 (all but `users`) start with the smoke filter, and `SOURCE` is the group.
- Given the runbook and the digest template, when the next digest is written, then each of the five questions names a view and what a reader concludes.

## Review Triage Log

### 2026-11-03 — Review pass
- layers: Edge Case Hunter and Verification Gap Reviewer (opus); Blind Hunter and Intent Alignment skipped (token economy; the integrated epic review covers them)
- verdicts: 14 findings — high 0, medium 7, low 6, false 1, maybe-false 0
- findings:
  - `[medium]` `patch` VG-1 six refusal sites (grid cell, dictated cell, `SuggestedCell`/`EnvSuggestionFill`, `SuggestionFill`, `KvField`, altitude, `DatePickerField`) had no test of their `trackInputRefused` call — one case each added (`surfaces/ficha/input-refusals.test.tsx`, `word-registry-panel.test.tsx`, `setup-surface.test.tsx`, `ficha-fields.test.tsx`)
  - `[medium]` `patch` VG-2 the generate wait's `fail` (job failed after the answer), `timeout` and missing-files `refused` branches untested — three cases added to the Story 18.4 block of `export-dialog.test.tsx`
  - `[medium]` `patch` VG-O1 Enter on a refused grid cell reported twice (Enter settles, the focus move's blur settles again) — `useNumberInput` skips the blur report of the text an Enter already reported; red-first test
  - `[low]` `reject` ECH-1 a route change while the tab is hidden opens a view `resumeScreen` cannot reopen — rare (a programmatic navigation on a hidden tab) and the fix is a new guard; ledger row (accepted)
  - `[low]` `reject` ECH-2 a full surface unmounting in the same commit as a route change writes a near-zero view of the cached route — rare and the fix is a new branch; ledger row (accepted)
  - `[low]` `patch` ECH-3 a signed-out load of `/` writes a few-ms Home view with no `from`, read as a landing by `home_first_nav` — runbook sentence beside the view (E18-A3 rule)
  - `[medium]` `patch` ECH-4 the hooks stay mounted while the Export dialog is closed, so closing it mid-generate left the wait open and a later `ok` counted the closed time — `useGenerate.cancelWait` called by the dialog's close effect; test
  - `[low]` `patch` ECH-5 a ready revision that never reaches the device leaves the wait open until it reads `cancel` — runbook sentence (no timer added)
  - `[low]` `patch` ECH-6 an expired preview reads `fail` while an expired generate reads `timeout` — runbook sentence (no new error type)
  - `[false]` `reject` ECH-7 waiting for the write chain before the beacon loses the beacon on unload — the beacon already read the queue asynchronously, and rows not beaconed stay queued and ship with the next flush
  - `[low]` `patch` ECH-8 a bfcache restore may fire `pageshow` without a `visibilitychange`, so no view reopens — `pageshow` with `persisted` calls `resumeScreen`; test
  - `[medium]` `patch` ECH-9 the rotated session's `session_start` was stamped after the held events it precedes — it takes the earliest held `ts`; red-first test. The previous user's held events taking the new id is e18fa's design: ledger row
  - `[medium]` `patch` ECH-10 the provider tests of the `observeCycle` and "Sincronizar agora" wiring were removed with the extraction — two `SyncProvider` tests restored
  - `[medium]` `patch` ECH-11 AC 1 ("anything else on those events is still refused"): `target` and `outcome` passed on `screen_view`, the base optional keys on `session_start` — refused now, red-first kernel tests (no producer sends them)

## Design Notes

**Views (keys, all starting with `${local.ux_smoke_filter}`; write `` `from` `` backticked):**
- `screen_time`: `screen_view` with `duration_ms`, count, p50, p95 by `screen`.
- `home_first_nav`: `screen_view`, `screen = 'home'`, `from` absent or `login` (a session landing), p50 and p95 of `duration_ms`: the time on Home before the first move (a hidden tab also ends it).
- `paths`: `screen_view`, `dialog_open`, `dialog_cancel`, `disabled_tap`, `error`, `input_refused` rows with `session_id, ts, name, screen, from, target, kind, duration_ms`, sorted by `ts`, limit 1000: the per-session sequence where a cancel's preceding screen is read (a `screen_view` is written when the screen is left, so its row follows what happened on it). An aggregated "cancels by preceding screen" count would need `from` on dialog events: open question, not built.
- `bounces`: `screen_view` with `duration_ms < 10000` and `from` present and not equal to `screen`, count by `from`, `screen`: "A to B, left within 10 s"; `paths` confirms the return to A.
- `viewports`: `session_start` with `viewport`, sessions and devices by `${local.ux_user_label}` as user, `viewport`, `standalone`, `online` (sessions by user and viewport).
- `refusals`: `input_refused` count and sessions by `screen`, `target`, `kind`.
- `document_waits`: `wait` with `kind in ['preview', 'generate']`, count, p50, p95 by `kind`, `outcome`, `app_version` (events of bundles before this story time the request; the version column tells them apart).

**Runbook sentences from batch e18fa (dated 2026-11-03):** a 429 on the telemetry post keeps the batch and ends the flush, the next `ran` cycle resumes, no beacon within 60 s of a 429, a 401 still drops the batch; the device aborts a telemetry post after 15 s and the CloudWatch client makes at most two attempts of 3 s per command; the body cap is 256 KiB (413 `body_too_large`); the stdout `ux_event` line's `ts` is the log instant and the device instant is `event_ts` (correct line 7); the beacon also fires on `pagehide`, one at a time; reading waits: the watcher reads pending, pulled and locally written photos only after its first look per database; friction read: structural block fields stay out of spans and re-edits but count in `device_op_count` (the e18fb "until the E18-A1 fix batch lands" note is struck as done), typed-after-failure compares `client_ts` with the failure's `received_at`, a restored photo arms again; the read CLIs never echo a refused argument or value.

**Conta sentence verdict:** `viewport`, `standalone` and `online` describe the device and its connection, a category beyond "telas, toques, esperas e erros"; `input_refused` says a typed value was refused, never the value. The sentence is NOT changed: open question for Matheus and Bruno, and the deploy waits on it (DoD).

## Verification

**Commands (tools container, `--user root`, from the worktree):**
- `podman compose --profile tools run --rm --user root tools pnpm exec vitest run <paths>` while iterating -- green.
- `podman compose restart api` after any change under `packages/domain` or `apps/api`, then `pnpm test:api`.
- `pnpm lint`, `pnpm static`, `pnpm test:unit` -- green. Playwright runs are the orchestrator's, under the host lock.
- `infra/bin/check` -- all passed.
