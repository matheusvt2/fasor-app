---
title: 'e25x: wave 1 review fixes for saving and sync (Stories 25.2 and 25.3, batch e25a)'
type: 'fix'
created: '2026-11-11'
status: 'done'
baseline_revision: '132ad4a1'
review_loop_iteration: 0
followup_review_recommended: true
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-25-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-e25a-saving-and-sync.md'
warnings: ['batched']
batched_reason: 'The ten items come from one review (the wave 1 integrated review of batch e25a, PR #328, read on 132ad4a1), touch the same files (the sync engine and provider, the draft store, the sheet fields) and ship with the wave 1 deploy, so they run as one fix batch with one gate.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The wave 1 integrated review of batch e25a found, with no high item: a refused write of the conclusion text is never seen by its field (A1); every commit nudge runs a whole sync cycle, up to 30 a minute while typing (A2); a draft answered by typing or by "Fechar" comes back on every load, and a saved value keeps an older draft that "Recuperar" would write over it (A3, A4); "Envio atrasado" flashes for one render on reconnect (A5); the late timer can overflow and reads the corrected clock for a duration (A7); a refused file answer's body is read with no bound (A8); a refused or overtaken clear of the manufacturer blocks a later clear (A9); and the tests named in A10 are missing.

**Approach:** Web only. Each fix is red first (a test that fails on `132ad4a1`). A commit nudge becomes a push-only pass of the engine; the draft provider learns two narrow drops; the late clock is computed in render on a duration clock; small bounded fixes for the rest. No kernel change at all (the kernel's late rule and sentences are used as they are).

## Boundaries & Constraints

**Always:**
- `AGENTS.md` and `epic-batch-orchestrator.md` bind. Ownership (AD-1, AD-13): `apps/web` renders and writes ops only; the late rule stays the kernel's (`lateOpCount`, `syncLateAt`, `syncBadgeState`).
- Phase A (now): code and tests are written and read, nothing is run: no container, no pnpm, no vitest, no Playwright, no podman, until the orchestrator says the machine is free. Write every test so it would fail on `132ad4a1`, and say in your report which ones you could not check by reading.
- A changed or rewritten existing test gets one line of reason in your report ("Changed tests"). Before you finish, grep `e2e/` and `apps/web/src/**/*.test.*` for what this batch changes (`nudge`, `requestSyncCycle`, `followCommits`, `serverAnswers:` in a hand-built `EngineStatus`, `persistOne`, `offerOnReturn`, `Rascunho encontrado`, `canSendSince`, `useLateOpCount`, `clearedFrom`, a spec that waits for a pull, a thumb or an upload after an edit with no `syncNow`) and report the command and every hit, fixed or not.
- English in code and comments; pt-BR UI copy. No new user-facing sentence is expected; if one proves necessary it is marked `// authored (e25x, listed for Bruno)` and listed.

**Never:**
- Do not touch `packages/domain/` (another batch, e25r, works in it), `apps/api/`, a contract, a schema, a seed, a golden, a fixture, the op fold or any printed text. If one proves necessary, stop and report.
- Out of scope: the 60 s tick, the retry table, the order of a cycle's phases, the 2 s window, the Etapa 6 parecer text, the look of the late alert, A6 (ledger only).
- Never touch the main checkout or another compose project; never `git add` `.env`, `compose.local.yml` or `.scratch-e25x/`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Notes |
|---|---|---|---|
| A1 refused text | conclusion text typed, 500 ms pause, `api.edit` rejects | the field is dirty again; the next blur or flush calls `api.edit` again; the draft source reads the text | through `ConclusaoSection`, real `confirmText` |
| A1 confirm | "Confirmar" or "Substituir", `api.edit` rejects | nothing thrown, nothing unhandled (as today) | only the `'edited'` path returns the promise |
| A2 commit | one commit, online, idle engine | 2 s later one push request; no pull, no thumb, no eviction, prune or sweep; no `sync_result` event; `running` never true | `pushing` true while the request is open |
| A2 burst | ten commits in one second | one push request | the 2 s window is unchanged |
| A2 empty | commit nudge with no `pending` row (already pushed by a cycle) | no request, no status change | a photo capture's own cycle already sent it |
| A2 during a cycle | commit nudge while a full cycle runs | no second cycle; one push-only pass after the cycle ends, silent when nothing is pending | `nudge()` from a capture still asks one more cycle, as today |
| A2 cycle during a pass | tick, `online`, visible, Sync status or "Sincronizar agora" while a pass has a push open | the cycle starts only after the pass ends; it is never dropped as `busy` | one push at a time, ops in `client_ts` order |
| A2 401 / 426 | the pass's push answers 401, or 426 | 401: `paused`, `onReAuth` once; 426: `outdated`, `onOutdated` once | as `runPhase` does for a cycle's push |
| A2 failed pass | the pass's push fails (retries run out, 5xx, 429, 400) | `lastFailure` set; a network or 5xx one runs the health probe; no more passes until a full cycle has started | going offline mid-pass records nothing |
| A2 clean pass | the pass's push is answered while `lastFailure` says the server was unreachable | `lastFailure` and `serverAnswers` cleared; any other `lastFailure` is left for the next cycle | the server answered |
| A3 typed answer | reading draft on offer; a valid value typed in that field and committed | the row is dropped, the key leaves the offer, the toast goes when no key is left; no offer on the next load | the number input only |
| A3 "Fechar" | draft offered on return (this session), its field on screen and not dirty; "Fechar" | that row is dropped; rows from an earlier launch are kept (retro U7) | |
| A4 older row | a draft row of the field exists (a tab-hide while typing), then a valid value is committed (blur, Enter, unmount) | the row is dropped after the commit succeeds | reading and conclusion text |
| A4 refused | the commit is refused | the row stays | |
| A5 reconnect | op committed offline 10 min ago; the device goes online | no render reads `late`; nothing announced; `late` at 60 001 ms after the reconnect | provider level |
| A7 far `client_ts` | a waiting row stamped 30 days ahead | one timer of at most 60 001 ms, no render loop | |
| A8 stalled refusal | a file answer 413 whose body never ends | `{kind:'http', status: 413}` (no code) after `SYNC_REQUEST_TIMEOUT_MS` | |
| A9 refused clear | clear through `onChange` refused, then cleared again | the second clear is written | |
| A9 clear, pick, clear | clear of X, pick Y before the store read null, later X again, then clear | the last clear is written | |
| A10 stepper | reading, manufacturer and conclusion text typed, then a stepper tap that moves no focus | each value is in the outbox with no other action | e2e |

</intent-contract>

## Code Map

- `apps/web/src/surfaces/ficha/conclusao-section.tsx:365-392` `confirmText` (returns nothing, swallows the rejection); the caller `:540` `onEdit`.
- `apps/web/src/components/generated-text-field.tsx:84-121` `committer` and `typed` (the E2 fix that waits for a rejected promise), `:138-152` `useDraftSource` (its return value is not kept today).
- `apps/web/src/sync/engine.ts` `EngineStatus` :67, `SyncEngine` :131, `pushPhase` :302, `pushBetweenFiles` :392, `cycle` :672, `runPhase` :745, `probeServer` :729, `nudge` :872, `stop` :877.
- `apps/web/src/sync/nudges.ts` `followCommits`, `followVisible`; `apps/web/src/state/sync.tsx` `IDLE` :230, the engine wiring :337-343, `canSendSince` :409-419, `requestOpen` :423, `requestSyncCycle` :267 (callers: photo capture, reading line, capture sheet, Sync status).
- `apps/web/src/telemetry/sync-observer.ts:24` `observeCycle` emits `sync_result` on `running` true to false.
- `apps/web/src/state/late-ops.ts` `useLateOpCount`; `apps/web/src/clock.ts` `now`, `rawNowMs`, `elapsedNowMs` (monotonic, "for durations only").
- `apps/web/src/state/drafts.tsx` `register` :95, `persistAll` :113 (the "row on offer is protected" rule :125-129), `persistOne` :143, `recover` :200, the toast effect :228 (`onDismiss`), `useDraftSource` :261; `state/toast.tsx` `withdrawToast`; `db/drafts.ts`.
- `apps/web/src/components/number-input.tsx` `settle` :172, the unmount cleanup :200-214, `useDraftSource` :226, `persistDraft` :241.
- `apps/web/src/sync/client.ts` `readBounded` :222, `send` :300-333.
- `apps/web/src/surfaces/ficha/ficha-fields.tsx:761-812` `WordField` (`clearedFrom` :774, `onChange` :793, `onClear` :806).
- `apps/web/src/surfaces/ficha/section-stepper.tsx` (plain `<button>`), `use-ficha-steps.ts:75-93` `goTo` (after three frames `land()` gives the focus to `#ficha-step-*`, `tabIndex={-1}`).
- Tests: `sync/engine.test.ts` (2063 lines; read the 25.3-WEB block and its helpers only), `sync/nudges.test.ts`, `sync/client.test.ts`, `state/sync.test.tsx`, `state/late-ops.test.tsx`, `state/drafts.test.tsx`, `components/generated-text-field.test.tsx`, `components/number-input.test.tsx`, `surfaces/ficha/conclusao-section.test.tsx`, `surfaces/ficha/ficha-fields.test.tsx`, `surfaces/ficha/measurement-field-unmount.test.tsx`, `e2e/typed-values-kept.spec.ts`, `e2e/sync-by-itself.spec.ts`.

## Tasks & Acceptance

**A1, the refused conclusion text.**
- `conclusao-section.tsx` `confirmText`: on the `'edited'` path return the `api.edit(...).then(...)` promise, rejection included; on the `'confirmed'` path keep `void` and the swallowed rejection.
- Test in `conclusao-section.test.tsx` ("e25x A1"), through `ConclusaoSection` with the real `confirmText` and an `api.edit` that rejects once: type, wait the 500 ms pause, see the rejection; a blur calls `api.edit` again with the same text; a tab-hide (`persistAll`) writes a draft row of the text. No mock `onEdit`.
- AC A1: Given a typed conclusion text whose write is refused, When the field is blurred or the sheet is left, Then the same text is written again, and meanwhile it is a draft.

**A2, a commit nudge is a push-only pass (coordinator's decision).**
- `engine.ts`: `EngineStatus.pushing: boolean` (false outside a pass). `SyncEngine.pushNow(): void`, the commit nudge:
  - returns at once when not started, stopped, paused, offline, or held (below);
  - while a full cycle runs: sets `pushAfterCycle`; at that cycle's end, when no further cycle was asked (`onlineWhileRunning`), one pass runs on a zero timer;
  - while a pass runs: sets `pushAgain`; at its end, unless it failed, one more pass runs on a zero timer (a full cycle waiting for the pass goes first: its continuation is a microtask);
  - otherwise the pass: when `hasPendingOps` is false it ends with no request and no `emit`; else `pushing = true`, `emit`, `pushPhase()`, `pushing = false`, `emit`.
  - Pass verdicts: a `PhaseEnd` `reauth` sets `paused` and calls `onReAuth`; `outdated` sets `outdated` and calls `onOutdated` once; any failure but the `OFFLINE` one sets `status.lastFailure`, holds later passes (`pushHold`) and, when unreachable, runs `probeServer`; a store error is `{kind:'apply'}`, logged. A clean pass that sent a request clears an unreachable `lastFailure` and `serverAnswers`, nothing else. It never touches `running`, `lastResult`, `cycleFailure` or `cycleWentOffline`.
  - `cycle()`: after the `running` check, `while (pushPass !== null) await pushPass`, then the `running`, paused, stopped and online checks again; a cycle start clears `pushHold`. `stop()` clears the three flags.
- `state/sync.tsx`: `followCommits(() => engine.pushNow(), browserTimers)`; `requestSyncCycle` and `followVisible` keep `engine.nudge()`; `IDLE` gains `pushing: false`; `requestOpen = (status.running || status.pushing) && online && reachable`. `nudges.ts`: the header comment says which moment asks for what.
- What the screen shows during a pass (stated here as asked): the badge keeps the state its counts give ("N pendentes", then "Sincronizado" as the acks land; `late`, `offline`, `retrying` by their own rules); "Sincronizando…" is not shown and "Sincronizar agora" stays enabled, because both read `running`, a full cycle; tapped during a pass, the cycle starts when the pass ends; on Sync status a `sent` sheet row reads "Enviando…" while the pass's request is open.
- A file commit (`commitFileBatch`, a certificate) now has its op pushed within the window and its bytes sent by the next full cycle, as before e25a; a photo keeps its own `requestSyncCycle`.
- Tests "e25x A2": `engine.test.ts`: one pass makes one `pushOps` call and no pull, thumb, eviction, prune or sweep call, and no status with `running: true`; nothing pending, no call and no `onChange`; a pass held open while the tick fires: no pull starts before the push answered, then the cycle runs (and the reverse: `pushNow` during a cycle runs one pass after it, none when `nudge` already asked a cycle); ops of two passes and a cycle arrive in `client_ts` order, each once; 401 and 426 rows; a failed pass holds the next `pushNow` until a cycle started; a clean pass clears an unreachable `lastFailure` only; stop mid-pass publishes nothing more. The request count: 20 followed streams, 30 commit nudges in 60 s of fake time, the requests counted with `nudge()` (the baseline wiring) and with `pushNow()`, both numbers asserted and printed for the PR body. `state/sync.test.tsx`: a commit announcement calls the engine's `pushNow` once after 2 s and never `nudge` (red on the baseline); `observeCycle` gets no `running` change from a pass, so no `sync_result` (assert in `sync-observer`'s test or the provider's).
- AC A2-1: Given an edit committed online, When 5 s pass with no tap, Then its op has left the outbox by one push request and no pull was sent. AC A2-2: ten edits in one second make one push. AC A2-3: Given a pass with its push open, When a full cycle is due, Then the two never overlap and no op is sent twice or out of order. AC A2-4: a 401 pauses and a 426 flags outdated, as in a cycle. AC A2-5: a photo capture runs one cycle, not two.

**A3 and A4, drafts.**
- `state/drafts.tsx`:
  - `PersistOptions.committed?: boolean` and `answersOffer?: boolean`. `persistOne(target, value, {committed: true})` means "this source has just committed a value through its own commit path, and the write succeeded". With a non-empty `value` (the field is dirty again) it does nothing. With an empty one it drops the row; when the key is on offer it drops only with `answersOffer`, and then the key leaves the offer and `returnOffers`, and the "Rascunho encontrado" toast is withdrawn (`withdrawToast(copy.draft.foundText)`) once no key is left.
  - The provider keeps the keys that may hold a row (the launch list, every non-empty write of this session): a committed drop of a key outside that set touches no store; until the launch list has been read every committed drop goes to the store.
  - "Fechar" (`onDismiss`): besides `setDeclined(true)`, each key on offer that was offered on return in this session (a set filled in `register`), whose source is mounted and reads empty, is dropped from the store and from the offer. Rows of an earlier launch are untouched.
  - `persistAll`'s rule, `persistOne` without `committed`, `recover` and the E5 rule are unchanged, so G1 (the point editor's last draft write) behaves as today.
- `number-input.tsx`: the `useFieldCommit` commit wraps the caller's: after it returns, or its promise fulfils, call `persist({committed: true, answersOffer: true})` (it reads `dirty` then); a rejection drops nothing and is passed on unchanged. This covers blur, Enter, idle, `commitValue` and the unmount flush.
- `generated-text-field.tsx`: keep `useDraftSource`'s function; after a typed commit succeeds, `persist({committed: true})` (no `answersOffer`).
- Why the new rules cannot drop a draft the person still wants (Design Notes D2).
- Tests "e25x A3" and "e25x A4": `drafts.test.tsx` (the provider: each row of the matrix, the untouched source on offer still protected at a tab-hide, a launch row kept on "Fechar", a committed drop outside the known keys touching no store, the toast withdrawn); `number-input.test.tsx` or `measurement-field-unmount.test.tsx` with the real `DraftProvider` (a row written at a tab-hide, a valid value committed on blur and at unmount, no row left; a refused commit keeps it; the return offer answered by typing, then a remount of the provider offers nothing); `generated-text-field.test.tsx` (the older row dropped after the typed commit; an offered row kept). `e2e/typed-values-kept.spec.ts` 25.2-E2E-002 extended: after the unparseable reading is offered on return, type a valid value and blur, reload: no toast, no `drafts` row; and a second case with "Fechar".
- AC A3: Given a reading's draft on offer, When the technician types a valid value in that field and it is saved, or closes an offer made on return with that field on screen, Then the draft is gone and no later load offers it. AC A4: Given an older draft row of a field, When a valid value of that field is saved (blur, Enter, the sheet left), Then the row is gone; When the save is refused, Then it stays.

**A5 and A7, the late clock.**
- `state/late-ops.ts`: a duration clock `lateClockMs()` = a constant origin plus `elapsedNowMs()` (monotonic). `useCanSendSince(canSend): number`, computed during render with a ref: the first render and every false-to-true change take `lateClockMs()`; no state, no effect. `useLateOpCount(rows, sinceMs)` (rows carry `op_id`): each waiting row's wait start is fixed the first time the hook sees it, `lateClockMs() - max(0, now() - Date.parse(client_ts))`, kept in a ref map by `op_id` and pruned with the rows; the kernel is called with those starts as ISO instants, `lateClockMs()` as `nowMs` and `sinceMs`; a `client_ts` that cannot be read is passed as it is (the kernel counts it not late). The timer's delay is `min(max(0, turns - lateClockMs()), SYNC_LATE_AFTER_MS + 1)`.
- `state/sync.tsx`: `const canSendSince = useCanSendSince(canSend)`; the state and the effect go.
- Tests "e25x A5", "e25x A7": `state/sync.test.tsx` at the provider, recording `badgeState` of every render: the reconnect row of the matrix; paused (a 401) past 60 s is never `late`, and resumed it is `late` only 60 001 ms later; the server unreachable likewise. Each must fail when `late`, `paused` or the since-instant is not wired (say in the report which line each guards). `late-ops.test.tsx`: the far `client_ts` row arms one timer of at most 60 001 ms (spy on `setTimeout`); a jump of the corrected clock (`learnServerClock`, or a mocked `now`) after a row was seen does not change when it turns late.
- AC A5: Given work done offline, When the device reconnects, Then no render and no announcement says "Envio atrasado" before 60 s of being able to send. AC A7: Given any `client_ts`, Then the late timer never fires in a loop, and a learned clock offset does not move a wait already counted.

**A8.** `client.ts` `send`: the non-2xx body is read with `readBounded(() => response.json(), SYNC_REQUEST_TIMEOUT_MS, controller)`; a stalled or broken body gives the `http` failure with its status and no code. Test in `client.test.ts` ("e25x A8", fake timers). AC A8: a refused file answer never holds its worker past the bound.

**A9.** `ficha-fields.tsx` `WordField`: the `onChange` clear resets `clearedFrom` when its `commit` rejects (as `onClear` does); a picked name resets it; and the render resets it when the stored name is no longer the cleared one. Tests in `ficha-fields.test.tsx` ("e25x A9"), the two rows of the matrix. AC A9: a clear the technician makes is written, whatever happened to an earlier clear.

**A10, tests.**
- `engine.test.ts` "e25x A10", a push between files that: answers 401 (paused, `onReAuth` once, no pull, the ops stay `sent`, sent again by the cycle after `resume`); answers 426 (`outdated` once); meets `pause()` and `stop()` during the uploads (no push between files after it, nothing published after `stop`); runs out of retries on the network (recorded, no more pushes between files, the uploads go on, the next cycle sends the ops once, in order). A test that shows a defect is reported with its fix, not weakened.
- `e2e/typed-values-kept.spec.ts` "25.2-E2E-003": on the tablet viewport, a reading, FABRICAÇÃO and the conclusion text are each typed and left by a stepper tap sent with `dispatchEvent('click')`; each op is in the outbox with no other action. Reading on the code: the tap gives no blur by itself, but `goTo` focuses the step's host three frames later, which blurs the field, and the blur commits. If the spec is red in phase B, the fix is in `goTo`: blur the focused field of the sheet before the jump.
- The provider tests of A5 and A1's real caller are the other two A10 rows.

**A6, not fixed.** A `deferred-work.md` row (orchestrator): the late alert shows during slow photo uploads that work as designed; a question for the field engineer after field use.

## Definition of Ready

1. Baseline `132ad4a1` (PR #328 merged); the review findings read with file and line. Done.
2. A2's shape decided by the coordinator (push-only pass); what the badge shows is stated above. Done.
3. Capability check: `withdrawToast` exists; `elapsedNowMs` exists; `readBounded` exists; `hasPendingOps` counts `pending` rows. Done.
4. No kernel, api, contract, seed or print change needed. Checked on the code.

## Definition of Done

1. Every item A1 to A5 and A7 to A10 has its red-first test and its fix; A6 has its ledger row.
2. The story gate is green on the final head with origin/main merged in: lint, static, test:unit, test:api, the touched specs on `desktop-chrome` and `durability-desktop-chrome`, the touched durability specs on the three matrix projects.
3. Mutation runs for the mechanism fixes (A2's exclusion, A3 and A4's drops, A1): the fix reverted, the test red, restored.
4. The request count before and after is in the PR body; so are the grep and its hits, the changed tests, and the "patched, not re-reviewed" list.
5. Story 25.3's criteria still hold (25.3-E2E-001 to 003 green; an edit leaves the outbox within 5 s; ten edits make one push).
6. Records: this spec's Auto Run Result, `deferred-work.md` § e25x, `docs/kbs` and its log where a concept changed, a dated comment on sprint-status rows 25.2 and 25.3.

## Spec Change Log

- 2026-11-12 (coordinator, phase B): a file commit asks for one full cycle (Q2). The wave gate's four e2e reds on `132ad4a1` are this batch's to explain (Auto Run Result).
- 2026-11-12 (phase B): the telemetry flush posts nothing inside the 60 s window of a 429 (`telemetry/flush.ts`; before, only the beacon held). Story 25.3 made cycles come seconds apart (Sync status opening, then "Sincronizar agora"), and each one posted against the limiter: 18.1-E2E-002 saw four refused posts for one sync. This changes E18-A1 R-A1's "the next cycle resumes" to "the first cycle after the window resumes"; `docs/observability.md` says so.
- 2026-11-12 (phase B): A9's `onChange` clear has no test: no gesture on the manufacturer reaches it (React Aria reports no null while the field keeps the focus); its reset is the same line as `onClear`'s. The clear, pick, clear row is tested through the leave.

## Review Triage Log

- 2026-11-12: no review loop in this batch (Matheus's word of 2026-11-11, token economy); the coordinator reads the final diff once.

## Design Notes

- **D1, why a pass does not take the cycle's `running`.** `running` is read as "a full cycle is in flight" by the Sync status word and button, the relatório gate, the reading arrivals, the storage reading and the `sync_result` event. A pass under it would make each of them react to every edit. `pushing` is read by one line only (`requestOpen`).
- **D2, why the draft drops are safe.** The protection rule exists for a surface that shows the committed value because the person has not answered the offer yet: its source reads empty without anyone having typed. The new drops need more than an empty read. (1) A commit drop needs the field's own typed value to have been saved just now: a row of that field is then older uncommitted text of the same field, and "Recuperar" would write it over the newer saved value. A row on offer is dropped this way only by the number input, whose commit is one whole value given by a blur, an Enter or a leave; the conclusion text commits on every 500 ms pause, which is no answer to an offer, so its offered row still goes only by "Recuperar" or by a newer draft. (2) "Fechar" drops only a draft offered on return in this session, which is always a reading that did not parse, with its field on screen and holding nothing typed: the person saw the offer beside the field and closed it. Rows from an earlier launch keep retro U7 (dismissing keeps the row). Open question Q1 below.
- **D3, the wait on a duration clock.** `client_ts` is an instant of the corrected clock, so the wait cannot be read from the raw clock alone. The hook reads the corrected clock once per row, when it first sees it, and counts on from there with the monotonic clock: a learned offset or a set clock does not move a wait already counted, and a device asleep is not counted as able to send (the monotonic clock may stop then; waking runs a full cycle).
- **Q1, open for Matheus.** Should "Fechar" also drop a draft offered at launch (retro U7 keeps it, so it is offered at every launch until "Recuperar")? And should a saved conclusion text drop its offered draft? Kept as they are.
- ~~**Q2, open for Matheus.** A certificate or another non-photo file committed now has its bytes sent by the next full cycle (up to 60 s), as before e25a. Ask for a full cycle on a file commit?~~ *(2026-11-12, decided by the coordinator: yes. `commitFileBatch` announces `'file'`, and a window that saw one asks for one full cycle instead of a pass.)*

## Verification

**Commands (after "machine free", stack `fasor-e25x`, each under the host lock, logged in `.scratch-e25x/`):**
- `pnpm lint`, `pnpm static`, `pnpm test:unit`, `pnpm test:api` -- green.
- `pnpm exec tsx scripts/e2e.ts <touched specs> --project desktop-chrome --project durability-desktop-chrome` -- green.
- `pnpm exec tsx scripts/e2e.ts <touched durability specs> --project durability-desktop-chrome --project durability-android-chrome --project durability-webkit` -- green.

## Auto Run Result

*(Phase A, 2026-11-11: written before any command ran.)*

*(Phase B, 2026-11-12, stack `fasor-e25x`, every run under the host lock, batch e25r's stack beside it.)*

- A1 fixed: `confirmText` returns the write's promise on the typed path; `conclusao-section-refused-text.test.tsx` through the real caller (red on the baseline).
- A2 fixed: a commit window asks `engine.pushNow`, a push-only pass (`EngineStatus.pushing`); `engine.test.ts` "e25x A2" (11 tests), `sync.test.tsx` "e25x A2". Requests in 60 s with 20 followed streams and 30 commit nudges: 712 with the e25a wiring, 52 with the pass. A window that saw a file commit asks one full cycle (`nudges.test.ts`).
- A3 and A4 fixed: `drafts.tsx` (`committed`, `answersOffer`, the "Fechar" drop of a return offer), `number-input.tsx`, `generated-text-field.tsx`; `drafts.test.tsx`, `number-input-drafts.test.tsx`, `generated-text-field.test.tsx`, 25.2-E2E-002 extended.
- A5 fixed: `useCanSendSince` computed in render; `sync.test.tsx` "e25x A5" (three provider tests). A7 fixed: the wait runs per op on the monotonic clock, the timer's delay is clamped to 60 001 ms; `late-ops.test.tsx` "e25x A7".
- A8 fixed: `send` reads a refused body within `SYNC_REQUEST_TIMEOUT_MS`; `client.test.ts` "e25x A8". A9 fixed: `clearedFrom` reset on a refused `onChange` clear, on a pick and when the stored name moves; `ficha-fields.test.tsx` "e25x A9" (the clear, pick, clear row; the `onChange` refusal has no test, see the change log).
- A10 tests: `engine.test.ts` "e25x A10" (401, 426, pause, stop, retries run out between files), green with no defect found. The stepper: `e2e/typed-values-kept.spec.ts` 25.2-E2E-003 green with no fix: the tap does not blur the field, `goTo` focuses the step three frames later, which blurs it, and the blur commits the reading, the manufacturer and the text.
- A6 not fixed: `deferred-work.md` § e25x.
- The wave gate's four reds on `132ad4a1`. 18.1-E2E-002: cause found, Story 25.3 runs a cycle when Sync status opens and another on the button, and each cycle's flush posted against the limiter (four refused posts); the pass does not remove it; fixed in the product (no flush inside a 429's 60 s window) with the spec's count rewritten. 21.1-E2E-002, 12.3-E2E-004 and 24.10-E2E-005: cause not established from the gate log (an Escape that did not close the Export dialog two seconds after "Marcar como enviado"; a plate field's centre covered while the plate was typed); each sits two seconds after a commit, where e25a ran a whole cycle with its pulls and re-renders and this batch runs one push, which is the likely cause, not a proven one. All four: 3 of 3 green with `--repeat-each 3` on `d46f1d6c`, and green again in the gate.
- Mutation runs (the baseline file put back, the tests, the file restored): A1 1 red, A2 wiring and A5 4, the draft store 5, the number input 4, the text 1, A7 3, A8 1, A9 1, the telemetry window 1, the cycle not waiting for a pass 1; restored: 447 of 447.
- Changed tests: `late-ops.test.tsx` (rows carry `op_id`), `sync.test.tsx`, `sync-telemetry.test.tsx`, `sync-observer.test.ts` (the engine double gains `pushNow` and `pushing`), `measurement-field-unmount.test.tsx` "548" (expects the draft drop after the commit), `generated-text-field.test.tsx` (the drafts double records persist calls), `flush.test.ts` E18-A1 R-A1 (the next flush resumes after the window), `e2e/usage-events.spec.ts` 18.1-E2E-002 (at most one more refused post for one sync; a reload before the shipping half).
- Story gate on `061af9d8` (origin/main `132ad4a1`, not moved): lint 0 errors (28 warnings, all older), static green, test:unit 440 files, 6717 passed (354 s), test:api 132 files, 1003 passed, 6 skipped (522 s), the nine touched specs on `desktop-chrome` and `durability-desktop-chrome` 58 of 58 (241 s), `durability.spec.ts` and `keyboard-salvo.durability.spec.ts` on the three matrix projects 41 passed, 7 skipped (126 s). Load 12.81 at the start, 5.64 at the end; lock wait 320 s; batch e25r's stack and runs beside it. The lint stage of that run was red on one unused test import, fixed in `061af9d8` and rerun alone green (lock wait 1219 s).
- No new user-facing sentence. Follow-up review: recommended (no review loop ran in this batch).
