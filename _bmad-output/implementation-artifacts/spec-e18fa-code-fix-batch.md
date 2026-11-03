---
title: 'E18-A1: the Epic 18 code fix batch (device flush, api limits, friction read, tests)'
type: 'bugfix'
created: '2026-11-03'
status: 'in-review'
baseline_revision: '0fede8ac813fa77e856cf26e976c9c199ebab709'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-18-retro-2026-10-30.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_because: 'E18-A1 is one retrospective action item (one branch, one PR, red-first) covering the device, api and friction-read findings of the Epic 18 retro; the coordinator planned it as lane 1 of the 2026-11-03 follow-up delivery.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The Epic 18 retrospective (`epic-18-retro-2026-10-30.md`, action E18-A1) confirmed code defects in the usage-event pipeline: a 429 deletes queued batches (R-A1), a stalled telemetry fetch freezes the queue (R-A4/R-E5), the beacon misses `pagehide` (R-A6), the reading watcher scans every photo every cycle (R-A14), one session id spans two users (R-A15), registry undo toasts are not counted (R-V10), and several kinds are misread (R-E2, R-E3, R-E7, R-E6), the telemetry route sits under the 16 MB body cap (R-A7), and the friction read inflates or misattributes its numbers (R-A16, R-A17, R-E1) and leaks a refused argument (R-A18, R-E8). The verification lens found the wire, the cycle observer and several hooks unexercised (R-V2 to R-V9, R-V11, R-V12, A2).

**Approach:** Fix each finding in place, red-first: write the failing test, then the fix. Add the tests R-V2 to R-V9, R-V11, R-V12 (unit part) and A2's route-table test, and promote `e2e/usage-events.spec.ts` to `@p0` with a 429 scenario beside it. No new event name, kind, target or screen.

## Boundaries & Constraints

**Always:**
- Red-first: each fix lands with a test that fails without it. Three mechanism fixes (429 keep, fetch timeout, `pagehide`) are named for a mutation run by the orchestrator: keep each fix a small, revertible hunk.
- `track()` stays fire-and-forget (never throws, never awaits, never logs). An event is never worth a failure.
- The vocabulary in `packages/domain/src/contract/telemetry.ts` (`UX_EVENT_NAMES`, kinds, `UX_ACTION_TARGETS`, `UX_DIALOG_TARGETS`, `SCREENS`) is frozen: read it, never append to it.
- The friction read stays SELECT-only and its report carries ids, closed keys and numbers only.
- Code, comments and tests in English; no emoji; pt-BR copy untouched (no new user-facing string).
- `apps/web` calls `fetch` only under `src/{sync,files,api}` (AR-1).

**Never:**
- Do not edit `docs/observability.md` (lane e18fb owns it), `sprint-status.yaml`, `epics.md`, `infra/**`, `scripts/**` outside a test you add under `apps/` or `e2e/`, or any other lane's files. Runbook and KB sentences the fixes need go to the "Runbook sentences for the coordinator" list in the Auto Run Result, not into `docs/`.
- No engine change in `apps/web/src/sync/engine.ts` and no change to `apps/web/src/db/commit.ts` or the op fold.
- No new Dexie version, no contract version bump, no new api route.
- Do not change the 4xx-other-than-429 deletion rule, the limiter, the batch size or the beacon byte cap.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 429 mid-drain | 600 queued, api answers 204, then 429 | first 200 deleted, the 429 batch and the rest kept; no third post in that flush | next `ran` cycle resumes |
| 4xx other than 429 | api answers 400 | batch deleted (unchanged) | none |
| Stalled post | `fetch` never settles | aborted after `TELEMETRY_POST_TIMEOUT_MS` (15 000); rows kept; a later `flushTelemetry` starts a new drain | rejection swallowed |
| Page hide | `pagehide` on the window (no `visibilitychange`) | one `beaconTelemetry` | none |
| Second user, same tab | `configureTelemetry` with a database whose `name` differs from the last non-null one | new session id for later events and for events held while no target was set | first configure of a load keeps the load's id; same database name again keeps it |
| Read-only tri-state | press inside `[aria-readonly="true"]` | `disabled_tap` on pointerdown, no `action` on click | none |
| Non-primary pointer | `pointerdown` with `isPrimary === false` or `button !== 0` on a disabled control | nothing tracked | none |
| Sincronizar agora, network | cycle ends with `lastFailure.kind === 'network'` | `wait` kind `sync` outcome `offline` | none |
| Telemetry body | over 256 KiB on `TELEMETRY_ROUTE.path` | 413 `body_too_large`, nothing written | largest valid 200-event batch still 204 |
| stdout sink | one event | `ux_event` line keeps the log's own `ts`; the device instant is `event_ts` | none |
| Structural block put | `block/{id}/location_id|order_key|removed_at|feeds_block_id` | not in the span, not in re-edits; still in `device_op_count` | none |
| Typed while reading ran | device put on the armed cell with `client_ts` <= the failure op's `received_at` | not counted, photo stays armed | none |
| Photo restored | `file/{id}/removed_at` put null after a non-null one | the photo can arm again | none |
| Bad CLI argument | `--company not-a-uuid-SECRET` or `--SECRET` | stderr names the expected shape only; the value never appears; exit 1 | none |
| `sql.end` fails | read throws, then `end()` throws | the read's error is the one logged; exit 1 | end failure swallowed |

</intent-contract>

## Code Map

- `apps/web/src/telemetry/flush.ts` -- `drain` (status handling line 64), `flushTelemetry`, `beaconTelemetry`. R-A1.
- `apps/web/src/api/telemetry-client.ts` -- `postTelemetry` (no timeout), `beaconTelemetryBody`. R-A4, R-V2.
- `apps/web/src/telemetry/instrument.ts` -- `isDisabled`, `onClick`, `onPointerDown`, `installTelemetryListeners` (visibility only), `startTelemetry` (`installed` guard). R-A6, R-E3, R-E7, R-V8, R-V11. `tri-state-control.tsx:94` renders `aria-readonly` on the radiogroup.
- `apps/web/src/telemetry/track.ts` -- `SESSION_ID` const (line 22), `configureTelemetry`, `pending` buffer, `appVersionOf`. R-A15, R-V12. Call sites of `SESSION_ID`: `track.test.ts` only.
- `apps/web/src/db/ux-events-store.ts` `photoReadingStates` + `apps/web/src/telemetry/readings.ts` `observeReadingResults` -- full `file` scan per cycle. R-A14. `remote_ops` is indexed by `seq` and multi-entry `*targets` (`schema.ts:231`); a pulled op's targets are `targetKeysOf(op)` (`schema.ts:164`, kernel `targetsOf`/`ref` in `packages/domain/src/ops/apply.ts:50,119`; verify the key format there). The device's own ops come back through the pull (`applyPulled`, `apps/web/src/db/sync-store.ts:89`), so a photo shot here enters `remote_ops` once pushed.
- `apps/web/src/state/sync.tsx` -- `observeCycle` (257), `failureOutcome`, `syncWaitOutcome` (283), dead-op `trackError` effect (~385), `syncNow`, `generate`, `preview`, `rereadPhoto`. R-E2, R-V3, R-V4, R-V5. Existing harness: `apps/web/src/state/sync-telemetry.test.tsx`.
- `apps/web/src/telemetry/hooks.ts` -- `routeIdsOf`, `TelemetryRoutes`, `useScreenView`, `useDialogTelemetry`. R-V6, R-V7. `useScreenView` callers: `surfaces/contract-outdated-surface.tsx` (`update`) and `surfaces/eviction-recovery-surface.tsx` (`recovery`).
- `apps/web/src/app.tsx:118-214` -- the router table, inline in `createBrowserRouter`; `fixtureRoutes` (DEV only). A2.
- `packages/domain/src/contract/telemetry.ts:176-198` -- `SCREEN_ROUTES`, `screenOf` (read only).
- `apps/web/src/surfaces/registries/{client-panel.tsx:102,frases-nc-panel.tsx:60,word-registry-panel.tsx:129,instrument-panel.tsx:218}` -- undo toasts without `undo: true`. R-V10. Precedent: `apps/web/src/state/use-undoable-edits.ts:136`, `components/toast.tsx:9`.
- Prop-fed `data-telemetry`: `components/status-tile.tsx:29`, `components/tri-state-control.tsx:102`, `components/not-applicable-button.tsx:19`, `components/sticky-action-bar.tsx:49` with `surfaces/ficha/use-ficha-actions.ts:284`. R-V9. Name-presence guard: `telemetry/targets.test.ts`.
- Dialogs (`useDialogTelemetry`): `surfaces/ficha/ficha-dialogs.tsx:35` (`rename_tag`), `surfaces/relatorio/not-tested-dialog.tsx:27` (`not_tested`), `surfaces/relatorio/move-block-dialog.tsx:31`, `surfaces/sync/conflict-dialog.tsx:55`, `surfaces/export/export-dialog.tsx:89` (`data-telemetry-screen="export"`), `surfaces/photos/capture-sheet.tsx:200` (already covered by the e2e). R-V7, R-V8.
- `apps/api/src/http/app.ts:127-183` -- `bodyTooLarge`, the shared `/api/*` JSON limit. R-A7. `TELEMETRY_ROUTE` from `@app/domain`.
- `apps/api/src/telemetry/sink.ts` -- `stdoutSink` (line 21; `log()` in `apps/api/src/log.ts:18` writes `ts` first, then spreads fields), `createCloudWatchSink` (`new CloudWatchLogsClient({})`). R-E6, R-A4 (api half).
- `apps/api/src/db/friction-read.ts` -- `foldFriction`, `blockOfPath`, `readOps` (add `received_at`), `FrictionOp`. `BLOCK_FIELDS` in `packages/domain/src/ops/path.ts:36`. R-A16, R-A17, R-E1. Tests: `friction-read.integration.test.ts`.
- `apps/api/src/db/friction-read-cli.ts` (`parseArgs` 41-55, `finally { await sql.end() }` 71-73) and its twin `apps/api/src/db/users-read-cli.ts:40-53` (same echo). R-A18, R-E8.
- `e2e/usage-events.spec.ts` (`@p1 18.1-E2E-001`), `e2e/ficha.durability.spec.ts` (`E5-A2-E2E-004`, read-only checklist tap after reload), `e2e/support/outbox.ts` `readStore`.

## Tasks & Acceptance

**Execution:**
- `apps/web/src/telemetry/flush.ts` -- in `drain`, a 429 keeps the batch and returns (ends the flush); update the header comment. Test in `flush.test.ts`: 204 then 429 over 600 rows leaves 400 rows and exactly two posts.
- `apps/web/src/api/telemetry-client.ts` -- export `TELEMETRY_POST_TIMEOUT_MS = 15_000`; abort the fetch after it (an `AbortController` with `setTimeout`, cleared in `finally`, so fake timers can drive it). New `telemetry-client.test.ts` (R-V2): stubbed `fetch` asserts method, path, `credentials: 'same-origin'`, content-type and contract headers, the bare-array JSON body, the returned status, a rejection on a network error, and the abort after the timeout; `beaconTelemetryBody` with and without `navigator.sendBeacon`. `flush.test.ts`: a never-settling post released by the timeout lets a second `flushTelemetry` start a new drain.
- `apps/web/src/telemetry/instrument.ts` -- (R-A6) beacon on the window's `pagehide` too (`doc.defaultView`), removed by the returned cleanup; (R-E3) a control inside `[aria-readonly="true"]` reads as disabled for both listeners; (R-E7) `onPointerDown` ignores `isPrimary === false` and `button !== 0` (guard with `in` checks: jsdom may lack `PointerEvent`). Tests in `instrument.test.tsx`: `pagehide` beacons; read-only segment gives `disabled_tap` and no `action`; secondary button and second finger give nothing; (R-V8) a press inside `[data-telemetry-screen="export"]` records `screen: 'export'`, an unknown screen value is ignored; (R-V11) `startTelemetry` twice installs once and queues one `session_start` (add a test-only reset export if needed).
- `apps/web/src/telemetry/track.ts` -- (R-A15) the session id becomes module state read through an exported `currentSessionId()`; `configureTelemetry(next)` rotates it when `next.db.name` differs from the last non-null database name, and re-stamps the held buffer with the new id; `resetTelemetryForTests` resets it. Update `track.test.ts` (replace `SESSION_ID`). Tests: rotation on a second database, none on the first configure or the same name again, held events take the new id; (R-V12 unit part) `appVersionOf` with a 40-hex sha, a short sha if the pattern allows it, `dev`, a malformed string, `undefined` and a number.
- `apps/web/src/db/ux-events-store.ts` + `apps/web/src/telemetry/readings.ts` -- (R-A14) the first look of a database reads every live photo once (the baseline); each later look reads only the photos pending at the last look (by key, `bulkGet`) plus the `file` entities named by `remote_ops` rows with `seq` above the highest seq seen at the last look; the module keeps only pending ids between looks. Existing `readings.test.ts` cases keep passing (their helper also writes a `remote_ops` row with a rising `seq`). New test: after the baseline, a later look issues no full `file` scan (spy on `db.entities.where`) and still tracks a pending photo that landed and a pulled one shot after the last look; a photo neither pending nor pulled is not read.
- `apps/web/src/state/sync.tsx` -- (R-E2) `syncWaitOutcome` returns `offline` when `lastFailure.kind === 'network'`. Extend `sync-telemetry.test.tsx`: (R-V3) a `running: true` then `running: false, lastResult: 'ran'` transition for each of `ran`, `failed`, `unauthorized`, `contract_outdated` queues its `sync_result` and calls the flush (spy or the transport); (R-E2) the network case of the wait; (R-V4) a dead outbox row written under the provider after boot queues one `error` with its code, a row dead at boot queues none; (R-V5) `preview` ok and failure `wait`s and `error`, `rereadPhoto` failure `error`. Export pure helpers only if the test needs them; no observer extraction (A3 is deferred).
- `apps/web/src/app.tsx` -- export the route table (`appRoutes`) and build the router from it, behavior unchanged. New `apps/web/src/telemetry/routes.test.tsx` (A2 + R-V6): walk `appRoutes` recursively, substitute each `:param` with a sample uuid v7 and assert `screenOf(path) !== 'other'` except `/relatorio/:id/secao/:blockId`, `/__fixture/field` and `*`; `routeIdsOf` keeps only uuid v7 ids and only `/relatorio/` ids; `TelemetryRoutes` in a memory router queues one `screen_view` per pathname change with the ids; `useScreenView('update')` and `('recovery')` queue their view.
- `apps/web/src/surfaces/registries/*-panel.tsx` (four files) -- `undo: true` on the four undo actions (R-V10). Guard in `targets.test.ts`: every `showToast(` action whose `label` reads an `.undo` copy key carries `undo: true` (source scan, same file walk).
- Prop-fed names (R-V9) -- render tests asserting the rendered `data-telemetry` of `StatusTile`, the Tri-state segments (`ficha.mark_c|_nc|_na`), `NotApplicableButton` and the Sticky action bar buttons fed by `use-ficha-actions.ts` (render the bar with the props the hook builds, or assert the hook's output), in the test file next to each component or one `telemetry/rendered-targets.test.tsx`.
- Dialogs (R-V7) -- one test per dialog `move_block`, `rename_tag`, `export`, `not_tested`, `conflict`: open it, cancel it (Cancelar), read `dialog_open` and `dialog_cancel` with its target from `ux_events` (component render with the test providers the existing tests of each dialog use; `export` also asserts `screen: 'export'`).
- `apps/api/src/http/app.ts` -- export `TELEMETRY_BODY_LIMIT_BYTES = 256 * 1024` and apply `bodyTooLarge` with it on `TELEMETRY_ROUTE.path` instead of the shared cap. Test in `telemetry.integration.test.ts`: a 200-event batch with every string field at its schema maximum answers 204 and is under the limit; a body one byte over answers 413 `body_too_large` and the sink saw nothing.
- `apps/api/src/telemetry/sink.ts` -- (R-E6) the stdout line carries the event's instant as `event_ts` and keeps the log's own `ts`; (R-A4 api half) `createCloudWatchSink` builds the client with `maxAttempts: 2` and a request timeout of 5 000 ms (`@smithy/node-http-handler` or the SDK's `requestHandler` options; check the installed SDK). Tests in `sink.test.ts`.
- `apps/api/src/db/friction-read.ts` -- (R-A16) a `block/field` op on `location_id`, `order_key`, `removed_at` or `feeds_block_id` stays out of the span and the re-edit counts (still counted in `device_op_count`); (R-A17) `readOps` selects `received_at`; arming records the failure op's `received_at`; a device put on the armed cell counts only when its `client_ts` is after it, else it neither counts nor disarms; (R-E1) a `file/{id}/removed_at` put with null clears `removed`. Fixtures in `friction-read.integration.test.ts` for each, plus the D1 header comment updated.
- `apps/api/src/db/friction-read-cli.ts` and `apps/api/src/db/users-read-cli.ts` -- (R-A18) refusals name the expected shape, never the argument or value; (R-E8) `sql.end()` failure is caught so the read's own error stays the one logged. CLI tests assert a refused value never appears on stderr or stdout.
- `e2e/usage-events.spec.ts` -- `18.1-E2E-001` tagged `@p0`; new `@p0 18.1-E2E-002`: with the queue holding events, `page.route` answers the first `POST /api/telemetry` 429; after "Sincronizar agora" the queue still holds every row it held and exactly one post was answered 429 in that flush; after the route is released the next "Sincronizar agora" empties the queue with 204s. Also assert, in 001 or 002, that removing a Cadastros client and pressing "Desfazer" queues an `undo` with target `toast.undo` (R-V10 end to end).
- `e2e/ficha.durability.spec.ts` -- in `E5-A2-E2E-004`, after the tap on the read-only checklist, `ux_events` holds a `disabled_tap` with a `ficha.mark_*` target and no `action` for it (R-E3 end to end).
- `_bmad-output/implementation-artifacts/deferred-work.md` -- append under a new heading `## Deferred from: batch e18fa (2026-11-03)` only: rows for anything narrowed here (see Design Notes), with owner.

**Acceptance Criteria:**
- Given a device with more than 1 000 queued events, when the api answers 429 mid-drain, then no queued row is deleted by that answer and the next `ran` cycle sends the rest (unit and `18.1-E2E-002`).
- Given a telemetry post that never settles, when 15 s pass, then the flush ends, the rows stay, and a later flush posts again.
- Given the tab is closed without a `visibilitychange`, when `pagehide` fires, then one beacon is attempted.
- Given a read-only checklist after "Marcar não ensaiado" and a reload, when the engineer taps a segment, then `ux_events` holds one `disabled_tap` and no `action` for it (durability spec, matrix projects).
- Given the four Cadastros panels, when "Desfazer" is pressed on their toast, then an `undo` is queued (guard test and e2e on Clientes).
- Given every route of the app's router table, when its path is mapped by `screenOf`, then none reads `other` except the section text, the dev fixture and the catch-all.
- Given the friction read over fixtures with a block move, a remove-and-restore, a value typed offline during a running reading and a restored display photo, when it runs, then spans and re-edits ignore the structural puts, the offline value is not counted, and the restored photo's later failure and typed cell are counted once.
- Given `pnpm lint`, `pnpm static`, `pnpm test:unit` and `pnpm test:api`, when run in the tools container, then all are green.

## Spec Change Log

## Review Triage Log

### 2026-11-03 — Review pass
- layers: Edge Case Hunter and Verification Gap Reviewer (opus); Blind Hunter and Intent Alignment skipped (token economy; the integrated epic review covers them)
- verdicts: 13 findings — high 0, medium 6, low 4, false 2, maybe-false 1
- findings:
  - `[medium]` `patch` VG-1 a photo committed here between a cycle's pull and its look, later pulled back finished, is never tracked (narrowed watcher) — each later look also reads the `file` entities named by outbox rows with `client_ts` after the last look; test added
  - `[low]` `reject` VG-2 the R-E3 AC is unmet in a real browser (`.is-readonly .tri-state { pointer-events: none }`, locked `components.css`) — same root as ECH-8; recorded as known open and a ledger row, the spec AC narrowed in the PR
  - `[low]` `reject` VG-3 `docs/observability.md:7` names `ts` as the stdout line's event field — the doc is lane e18fb's; carried as a runbook sentence for the coordinator
  - `[medium]` `patch` ECH-1 `visibilitychange` and `pagehide` back to back beacon the same batch twice — `beaconTelemetry` made single-flight; test added
  - `[medium]` `patch` ECH-2 two stalled CloudWatch commands at 2 x 5 s outlast the device's 15 s abort, so a retry duplicates — `requestTimeout` 3 000 ms
  - `[low]` `reject` ECH-3 device clock skew biases `client_ts` against `received_at` — the comparison is the one E18-A1 (R-A17) prescribes; noted as a residual risk
  - `[medium]` `patch` ECH-4 a lagging stream brings ops below the global seq high-water mark — same root as VG-1 (the read set misses files changed outside "pulled above the max"); pending photos are read by key and local shots now by the outbox, so only another device's photos remain unwatched, which is by design
  - `[low]` `patch` ECH-5 two overlapping looks track one landed reading twice — looks serialized; test added
  - `[maybe-false]` `reject` ECH-6 18.1-E2E-002 may flake when an automatic cycle flushes near "Sincronizar agora" — settled by the gate runs of the spec (pasted in the PR); if it ever flakes, the per-flush marker is the fix
  - `[false]` `reject` ECH-7 a status 0, 1xx or 3xx deletes rows — a same-origin `fetch` follows redirects and never surfaces 1xx or an opaque 0
  - `[medium]` `reject` ECH-8 R-E3 not verified in a real browser — see VG-2 (known open, ledger row; a tap on a read-only segment reaches no `[data-telemetry]` control, so it records nothing, neither `action` nor `disabled_tap`)
  - `[medium]` `patch` ECH-9 a hidden-tab beacon right after a 429 posts up to 200 events the limiter refuses and deletes them — no beacon for 60 s after a 429; test added
  - `[false]` `reject` ECH-10 a schema-valid `ts` with more sub-second digits than `toISOString` can exceed the 256 KiB bound — only a crafted client writes those, and a crafted batch refused with 413 is the intended answer

## Design Notes

- R-A14 narrowing keeps the existing semantics of "pending at the last look" and "shot after the last look": a photo first seen through a pull and captured before the last look was never waited for here. A photo whose only change reached this device by a snapshot download (not `remote_ops`) is not watched; record that as a ledger row if it holds.
- R-A15 rotation is by database name, not by instance, so React's effect re-runs (StrictMode, `settled` flips) and a same-user re-sign-in keep one session; no extra `session_start` is queued on rotation (the views count `count_distinct(session_id)`, `infra/production/observability.tf:31,66`). Open question for the PR: whether a rotated session should queue its own `session_start` (Story 18.4 territory).
- R-A16 keeps structural puts in `device_op_count` (the item names spans and re-edits only). Open question for the PR.
- A 401 on the telemetry post still deletes the batch (unchanged; only 429 is named). Open question for the PR, ledger row.
- R-A4's api half and the `users-read-cli.ts` twin of R-A18 are included because they are the same findings' other ends; both named in the PR as included extensions.

## Verification

**Commands (tools container, from the worktree, never on the host):**
- `podman compose --profile tools run --rm --user root tools pnpm lint` -- expected: exit 0
- `podman compose --profile tools run --rm --user root tools pnpm static` -- expected: exit 0
- `podman compose --profile tools run --rm --user root tools pnpm test:unit -- <paths>` while iterating, then whole -- expected: green
- `podman compose restart api` after any change under `packages/domain` or `apps/api`, then `podman compose --profile tools run --rm --user root tools pnpm test:api` -- expected: green
- Playwright runs only under the host lock and are run by the orchestrator: the implementer writes the e2e changes, runs `pnpm lint` and `pnpm static` over them, and leaves the runs to the orchestrator.
