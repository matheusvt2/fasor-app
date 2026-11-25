*(Copied unchanged on 2026-11-25 by batch e30d, Story 30.5, from the coordinator session's scratchpad `audit/unstable-tests.md`, written 2026-11-24 from reading the code at main `9d174967`.)*
# Unstable end-to-end tests: likely causes (static half, 2026-11-24)

I only read code for this. Nothing was run, edited or started. Line numbers are for the main checkout at `9d174967`.
The failure messages come from the gate logs in this session's scratchpad (`gate-e28/test-e2e-full.log`, `gate-e28-final/test-e2e-full.log`, `e2e1.log`, `e2e3.log`). The ledger rows and retro findings are cited as I found them. The `error-context.md` snapshots of the failed runs are gone: no `test-results/parallel/*` folder for these tests is left in any checkout. So for some tests the screen state at the moment of failure is inferred, not seen.

Two React Aria facts carry much of this report:

- **A press is cancelled when its target moves.** React Aria fires `onPress` on pointer-up only if the pointer is still inside the target's bounding box at that moment, and only if the target is still attached. So if a layout shift or a re-mount happens between pointer-down and pointer-up, the press is silently dropped. Playwright checks the hit target only for the first event of a click, so it reports the click as done.
- **The gap is wider for a person.** For Playwright it is a few milliseconds. A finger on a tablet holds 50 to 150 ms between touch-down and touch-up, so a person meets this more often than the test does.

---

## 1. `e2e/photos.spec.ts` 6.2-E2E-001 (retry pill stays)

- **Observed:** `gate-e28-final/test-e2e-full.log:1018-1045`, on an idle machine (load 3.3 to 4.1, `gate-final/run.out`). At `photos.spec.ts:214`, `.upload-pill` was still there 60 s after the click on "Erro — Tentar novamente" (122 polls, count 1). The pill's text at the end was not logged, so we cannot tell whether it still read "Erro" or "Aguardando envio".
- **Product path:**
  - The click goes `photo-openers.tsx:332-338` `RowPhotoList` → `UploadPill`, an AriaButton (`components/photo-row.tsx:50`) → `use-ficha-photos.ts:115` → `state/sync.tsx:526-540` `retryUpload` → `sync/engine.ts:1014-1017`: `clearUploadError` then `runFreshCycle`, which waits out the cycle in flight.
  - The pill disappears only when the server's `uploaded_at` comes back in a pull (`packages/domain/src/photos/text.ts:67-71`; `file-store.ts:51` sets only `acked`). The server writes `uploaded_at` synchronously in the PUT (`apps/api/src/http/files.ts:277-281`). The cycle order is push, upload, pull (`engine.ts:812-819`).
  - So once the press lands, the pill clears in the same cycle. I found no engine path that leaves a cleared file unsent for 60 s.
- **Hypotheses:**
  1. **The press is lost to a layout shift from the row's NC draft.** Confidence medium.
     - Both photos are taken on an NC row, so each asks for an `nc_obs` reading (`use-ficha-photos.ts:92-94`). The fake provider always gives a sentence (`apps/api/src/jobs/reading/kinds/nc-obs.ts:18`).
     - Photo 2 was uploaded in the test's `syncNow` (`photos.spec.ts:195`). Its reading job ends after that cycle's pull, so its draft arrives in a later pull. That is the reload's launch cycle, about 1 to 2 s later, which is when the test clicks (`:207-213`).
     - The draft is drawn as a `SuggestionBlock` inside `.row-expand` (`checklist-section.tsx:661-671`). That block sits above `RowPhotoList` (`:748-755`) in the same `li`, so the whole photo list moves down by the block's height.
     - Interleaving: the test sees the error pill (drawn straight from IndexedDB after the reload) → Playwright checks the hit target and sends pointer-down → the launch pull's live query commits and the draft block appears → pointer-up lands about 100 px above the pill's new box → React Aria cancels the press. Playwright reports the click done. The file stays `dead`, nothing retries it on its own (`engine.ts:602`), and the pill stays "Erro" for good.
  2. **The press lands while the engine is not built yet, and nothing runs a cycle.** Confidence low.
     - `retryUpload` with `engineRef.current === null` only clears the error (`sync.tsx:530-533`). The engine is built only once `session.settled` (`sync.tsx:310-312`).
     - When the engine then starts, its first cycle should still upload the file, so this explains a stall only if something else delays that first cycle.
     - It is cheap to rule out with the experiment below.
  3. **The cleared file is uploaded but `uploaded_at` misses that cycle's pull.** Confidence low. I found no code path for it. If it happens, the next pull is the 60 s tick, which is exactly the test's window (`engine.ts:196`).
- **Cheapest experiment:**
  - **(a)** On failure, log the pill's text, `photos[0].upload_error`, and whether `.nc-draft` exists in the row, with `--repeat-each 30` on 2 workers. "Erro" plus `.nc-draft` present means H1. "Aguardando envio" means H2 or H3.
  - **(b)** Force H1: hold the relatório pull response with `page.route` until the page reports a `pointerdown` on the pill (through `exposeBinding`), then release it. If the press is lost every time, H1 is confirmed.
- **Proposed fix:**
  - Test: before the retry click, wait for what the reading will draw, so the screen is still: `.nc-draft` visible on the row, or photo 2's `reading_status` final in the device store. Then assert the pill goes through "Aguardando envio", which proves the press landed.
  - Product: draw the NC draft so it does not push existing controls under the finger. One way is to place the draft after the photo list. Another is to hold its insertion while a pointer is down in the row.
- **Product or test:** both. The test clicks before the screen has settled. The product moves a control under a pending press.

## 2. `e2e/sheet-photos.spec.ts` 11.11-E2E-001 (wrong toast)

- **Observed:** `gate-e28/test-e2e-full.log:1004-1034`. Expected "2 fotos adicionadas — legenda aplicada". The polls saw "Foto salva — enviando" 5 times, then "1 legenda sugeridaVerFechar" 38 times. The import's own toast was never sampled.
- **Product path:**
  - The import toast is a plain toast (`surfaces/photos/capture-sheet.tsx:347`).
  - "1 legenda sugerida — Ver" is the caption arrival, from `state/reading-arrivals.tsx:220-222`. It is shown with `action` and `arrival: true` (`:204-210`).
  - The test first takes a "Geral" photo in the gallery (`sheet-photos.spec.ts:103-108`). That photo asks for a caption reading, so its suggestion is pulled some seconds later. The timing is set by the 5 s reading-poll cadence (`engine.ts:205`, `observeReadings` `:933-949`) and by how busy the reading worker is, not by the test.
  - In `ToastProvider.showToast` (`state/toast.tsx:160-198`), an arrival over a plain toast is none of the queued cases, so it reaches `slot.display(entry)` at `:195` and replaces the toast at once.
- **Hypotheses:**
  1. **The caption arrival replaces the import toast within one poll interval.** Confidence high.
     - Interleaving: "Adicionar 2 fotos" → plain toast "2 fotos adicionadas…" → a cycle pulls the Geral photo's caption suggestion → `ReadingArrivals` waits for the cycle's end (`arrivalStep`, `:74-89`), then calls `showToast(arrival)` → `toast.tsx:195` shows it over the import toast. That takes less than Playwright's 0.5 to 1 s poll step, so the import text is never seen.
     - Load moves the reading's arrival into exactly this step: the job and the 5 s cadence come later, and the steps in between take longer.
- **Cheapest experiment:** before "Adicionar 2 fotos", add a `MutationObserver` on `[data-testid=toast]` that records every text with `performance.now()`, then run `--repeat-each 20` on 2 workers. A failure will show "2 fotos adicionadas…" followed by "1 legenda sugerida" within a few hundred ms. To make it red on purpose: hold the Geral photo's PUT with `page.route` and release it right before the "Adicionar" click.
- **Proposed fix:**
  - Product: an `arrival` toast never takes the slot from a toast on screen. It waits in the queue like a status toast (`toast.tsx:165-169`).
  - Also the reverse case (section 9, item 1): a plain toast over an arrival currently drops the arrival for good. It should put it back at the head of the queue, as `:191-194` already does for outcomes.
  - Test: wait for the Geral photo's caption reading to finish (or for its arrival) before the import, or take the Geral photo with AI features off. Then the import step has nothing arriving on its own.
- **Product or test:** product first. The user's own confirmation is replaced in milliseconds, against the toast contract's "nothing disappears unread". The test also leaves a reading in flight during an assertion on a short-lived toast.

## 3. `e2e/typed-values-kept.spec.ts` 25.2-E2E-002 and 25.2-E2E-001

- **Observed:**
  - 25.2-E2E-002 in #374: the committed value was `raw "5"` for `"548"` (`epic-28-retro-2026-11-24.md:47`).
  - Both red in `e2e1.log:545-599`: `page.goBack()` landed on Home "/". That red was deterministic, not flaky. #377's N2 changed "Voltar" to step back in history, and the helper was then rewritten (`typed-values-kept.spec.ts:55-62`, goForward then goBack). Those two reds are not part of the flake.
- **Product path:**
  - `firstReading` (`typed-values-kept.spec.ts:65-71`) taps the stepper's "Ensaios", waits for the cell to be visible, clicks it and types.
  - The stepper calls `goTo(step, false)` (`surfaces/ficha/ficha-surface.tsx:293`). `goTo` (`use-ficha-steps.ts:75-93`) runs `afterFrames(land)` three animation frames later.
  - `land` (`:85-92`) always runs `host.scrollIntoView` and `landed.focus()` on the step host. Only the second, 12-frame land checks where the focus is (`:97-100`).
  - The number input commits on blur (`components/number-input.tsx:186-207`).
- **Hypotheses:**
  1. **The stepper's delayed land takes the focus from the cell mid-typing.** Confidence high.
     - Interleaving: tap "Ensaios" → the Ensaios step expands, a long render that delays frames → the input is visible → click focuses the cell → "5" is typed → frame 3 → `land()` focuses `#ficha-step-ensaios` → the blur commits "5" → "4" and "8" go to the host and are lost → Tab moves on → the last value is `raw "5"`.
     - The same race hits `typeMaker` after "Placa" (`:74-83`): a half-typed manufacturer could be committed and created in the registry. It also hits `typeConclusionText` after "Conclusão" (`:86-104`).
     - The ledger's 24.10-E2E-005 red is a neighbour: a tap after "Criar" found the page still inert (`deferred-work.md:1868`).
- **Cheapest experiment:** in one copy of the test, slow frames down: an init script that wraps `requestAnimationFrame` to fire after 150 ms. Then run `firstReading` plus `pressSequentially('548')`. I expect "5" every time. Without the wrapper, `--repeat-each 30` while another worker runs the parallel group.
- **Proposed fix:**
  - Product: in `use-ficha-steps.ts:85-93`, run the first land only if the focus is still where the tap left it (the stepper button, body or the host). Skip `scrollIntoView` when a `pointerdown` or `keydown` happened after `goTo`. The capture-listener pattern of `:109-114` already exists and can be reused. Cover it with a unit test using a fake rAF.
  - Test: after a stepper tap, wait until the host has received the land (focus on `#ficha-step-*` once), then click the field.
- **Product or test:** product, and a user can meet it. On a slow tablet three frames can last 100 to 500 ms. A technician who taps "Ensaios" and then the first cell straight away gets "5" saved for "548".

## 4. `e2e/ficha.spec.ts` 12.1-E2E-012

- **Observed:** `e2e3.log:491-516`. At `ficha.spec.ts:1335`, "Marcar os restantes como Conforme" was "inactive" for 5 s after the test's `toPass` focus loop and a 2-rAF wait. The comment at `:1327-1328` already records "red once in three".
- **Product path:** the stepper tap on "Verificações" at `:1319`, then the same `goTo` and `afterFrames(land)` path as in item 3 (`use-ficha-steps.ts:93`). The bar is drawn once, at the head of the list (`checklist-section.tsx:256`).
- **Hypotheses:**
  1. **The same 3-frame land fires after the test's focus.** Confidence medium-high.
     - The test waits 2 frames after its own `focus()` (`:1334`). The land fires 3 frames after the stepper click.
     - When frames are starved (fewer than 1 frame between the click and the end of `toPass`), the land fires during or after the 2-rAF wait. It focuses the host, and nothing gives the focus back: the 12-frame land runs only when the focus is on body.
  2. **The bulk bar re-mounts.** Confidence low.
     - `{readOnly ? null : <BulkActionBar/>}` (`checklist-section.tsx:256`): a read-only flip would drop the focus to body.
     - I found nothing that flips it in this flow.
- **Cheapest experiment:** the rAF-delay init script from item 3. Or log `document.activeElement` on every `focusin` with a timestamp and compare with the stepper click: the host's `focusin` will follow the test's `focus()`.
- **Proposed fix:**
  - The product guard from item 3 fixes both tests.
  - Test: wait for the land (the host focused once) before `markRest.focus()`. Drop the `toPass` plus 2-rAF workaround.
- **Product or test:** product, same race as item 3. A keyboard user who Tabs into the bar right after a tap loses the focus.

## 5. `e2e/home.spec.ts` 1.6-E2E-001

- **Observed:** `e2e3.log:518-545`. "Test timeout of 30000ms exceeded" while waiting for the "Sumário do relatório" list (`home.spec.ts:220`, whose own wait is 40 s), after "Baixando o relatório…" had shown.
  - The test declares no `test.setTimeout`, so it runs on the default 30 s. Its siblings declare 120 to 300 s.
  - It runs `resetEmpresaB`, `signIn`, two `syncNow` (each with a 60 s bound), a 30 s poll, and a route that sleeps 4 s on the Emitido stream (`:211-215`).
  - The green runs read 2.5 to 2.9 s in the list reporter (all four full gates). That does not fit a 4 s sleep on the path, so the reported duration needs checking against `timings-parallel.json` before anyone trusts it.
- **Product path:**
  - The card tap → `home-surface.tsx:217-221` `syncRelatorio` → `engine.ts:961-965`. This calls `runCycle()`, not `runFreshCycle()`: a tap while a cycle is in flight answers `busy` and asks for nothing more.
  - The gate (`surfaces/relatorio/relatorio-gate.tsx:28-41`) makes up for it: it waits for `sync.running` false and asks again. So the relatório is pulled, but only after the cycle in flight, plus the 4 s held stream.
- **Hypotheses:**
  1. **Test budget.** Confidence medium-high.
     - Under load, setup (reset, sign-in, two first-device cycles) eats most of the 30 s. The last wait (the in-flight cycle, then the 4 s held stream, then the pull) is cut off by the test timeout, not by its own 40 s bound.
     - The error text says so directly: the test timeout fired inside a 40 s expect.
  2. **The pull-on-open waits behind a cycle in flight.** Confidence medium as a contributor.
     - Under load the 60 s tick or a follow-up cycle can be running at the tap, so the gate's own pull starts only after it ends.
     - The product works, but the wait grows with load. Compare `syncProject`, which uses `runFreshCycle` for exactly this reason (`engine.ts:968-979`).
  3. **`page.unroute` while the handler sleeps leaves the request unanswered.** Confidence low. In the Playwright behaviour I know, a running handler keeps going and its `continue()` still works.
- **Cheapest experiment:** read `test-results/e2e-report/timings-parallel.json` for this test in the next full gate: where its setup steps spent their time, and whether the 4 s sleep is on the path. Then run it with `--repeat-each 10` while a second stack runs a gate.
- **Proposed fix:**
  - Split the test in two: the board and the three device lines, then the pull on open.
  - Replace the 4 s sleep with a held route that the test releases once "Baixando…" is seen.
  - Make `syncRelatorio` a fresh cycle (`runFreshCycle`), as `syncProject` already is, so a tap is never answered `busy`.
  - Give the remaining test a declared budget equal to the sum of its own bounded waits. This is the budget it already implies, not a longer wait for a signal.
- **Product or test:** mainly the test (an undeclared budget below its own waits). The product makes the wait longer under load but is not wrong.

## 6. The "Novo relatório" press lost while Home re-renders (R8LAY-E2E-008, e20f-DUR-001, with 1.6 in the audit)

- **Observed:**
  - `deferred-work.md:1621-1625`: the dialog never opened in load reds. The test now repeats the press (`review-layout-interaction-2026-10-08.spec.ts:739-746`).
  - `deferred-work.md:1868`: e20f-DUR-001 on WebKit, where the press opened no dialog while the launch pull was drawing the list.
  - `groups.ts:110-113`: red once in 5 on two workers.
- **Product path:**
  - `home-surface.tsx:285-298` renders two different trees: `canCreate ? <Button/> : <div className="home-new"><Button isDisabled/>…</div>`.
  - `canCreate` and the shortcut row (`:93`, `:255-262`) depend on `PermissionsProvider` being `ready`, which needs the role row or a completed cycle (`state/permissions.tsx:65-82`).
  - The status board appears when `relatoriosPending` turns false (`home-surface.tsx:119`, `:243-249`).
  - The dialog opens on `creating && canCreate` (`:345`). `creating` is local state of `HomeSurface`.
- **Hypotheses:**
  1. **Re-mount or layout shift between pointer-down and pointer-up.** Confidence medium.
     - The button is swapped for a new DOM node when `canCreate` flips. Content can also be inserted above it: the shortcut row (permission-gated), the status board, or a banner. Either way React Aria cancels the press.
     - This is the same mechanism as item 1, and as R8CAP-E2E-010 ("element was detached", `deferred-work.md:1616-1620`).
  2. **`HomeSurface` re-mounts after the press and loses `creating`.** Confidence low-medium. The e24f comment's "the shell swap" points this way. A re-mount above `AppShell` (`app.tsx:64-71`, `:95-125`) would reset `creating`, so the dialog never opens although the press registered.
  3. **Since Epic 29, overlay history.** Confidence low. A launch navigation or replace landing just after the dialog pushed its entry could close it. This cannot explain the reds from before 2026-11-23.
- **Cheapest experiment:**
  - Add capture listeners for `pointerdown` and `pointerup` that log the target, `isConnected` and the button's rect at each event.
  - Add a mount counter on `HomeSurface` (a `data-mount` attribute set from a ref).
  - Run R8LAY-E2E-008 without its repeat loop, `--repeat-each 20`, with a second worker busy.
  - A different node or rect at pointer-up means H1. A new mount count after a press that called `setCreating` means H2.
- **Proposed fix:**
  - Product: render one stable button whose `isDisabled` follows `canCreate`, never two trees. Keep `creating` across the shell swap, or stop the swap from re-mounting Home. Reserve the shortcut row's space while permissions load.
  - Test: wait for the permissions-ready state (the shortcut row present), then press once. Remove the press repeat.
- **Product or test:** product. A person tapping "Novo relatório" in the first second after opening the app can lose the tap.

## 7. API `e24y-paired-tables` (`apps/api/src/jobs/generate/e24y-paired-tables.integration.test.ts`)

- **Observed:** "a preview job past its 170 s under load" (#370, `epic-28-retro-2026-11-24.md:47`). The green runs take 10.7 to 12.6 s for two previews (`gate*/test-api.log`), so the red run was more than 15 times slower.
- **Product path:**
  - The test calls the stack's real api (`:31`, `http://api:3000`) and polls the job row every 1.5 s, up to a fixed 170 s (`:81-89`).
  - The api renders on one generate worker with `batchSize: 1` (`jobs/generate/worker.ts:108`) and one LibreOffice at a time (AD-15).
  - About 20 integration files call the same api (grep of `API_URL ?? 'http://api:3000'`). `test:api` runs in phase 1 beside `lint` and `static`, which load the CPU.
- **Hypotheses:**
  1. **The job waits in the shared generate queue.** Confidence medium.
     - Jobs left by earlier files (a 202-only test that does not wait for its job, or a job with retries) sit ahead of this one.
     - LibreOffice is also slow under phase 1's CPU load, or under another batch stack on the same VM (two stacks are allowed).
     - The 170 s is a bound on queue time plus render time together, unrelated to the queue's depth.
  2. **The api's worker stopped consuming for a while.** Confidence low. The api can exit when Postgres restarts (E24-A4, the audit's L4008), and a podman VM restart happened in #374.
- **Cheapest experiment:** on timeout, dump the job row (created, started and finished times) and the `pgboss.job` rows of the generate queue (state, `created_on`, `started_on`). "Created, never started, with others ahead" means H1. "Nothing active and nothing ahead" means H2.
- **Proposed fix:** wait for the job to be picked up (status `running`), with a bound on pickup. Then wait for completion with the api's own render bound, read from its config, and report which phase overran. Make the files that enqueue without waiting wait for their own job, or cancel it.
- **Product or test:** test (the bound and the isolation). If H2 is confirmed, the product's worker recovery.

## 8. Points 6.6-E2E-011 and WebKit `ficha.durability` F-11 (recorded as closed)

- **6.6-E2E-011:**
  - Recorded cause: `Escape` was pressed right after "Cancelar", before React Aria gave the focus back to the viewer, so it landed on body. It failed 20 to 80 % alone (`deferred-work-archive.md:1163`).
  - Closed by `escapeDialog` (`e2e/support/dialogs.ts:10-14`, used at `points.spec.ts:627`).
  - Same family as items 3 and 4: keyboard input sent before the app's own deferred focus move. No new red recorded. Confidence it is fixed: high.
- **WebKit F-11:**
  - A product defect: WebKit's focus scroll ignores `scroll-padding-bottom`. Closed by `keepClearOfStickyBar` (`components/toast.tsx:426-484`; `deferred-work-archive.md:1265-1268`).
  - Leftover risk, test side: `walkReadings` (`ficha.durability.spec.ts:243-266`) measures 3 frames after the key. A row that grows from the blur commit's echo later than 3 frames is cleared again by `onLayout` only within `LAYOUT_SETTLE_MS`. Under load the measure can catch that brief state. Confidence low.
  - Experiment: the rAF-delay script from item 3 on `durability-webkit`.
  - The iPad keyboard inset (`visualViewport`) remains unmeasured.

---

## Common causes

1. **Late content shifts or re-mounts a control while it is being pressed, and React Aria cancels the press.**
   - A press is dropped when its target moves out from under the pointer, or is detached, between down and up. The click looks fine to Playwright.
   - Sources found:
     - an NC draft drawn above a row's photo list (item 1);
     - Home's two-tree "Novo relatório" button and the permission-gated shortcut row and board (item 6);
     - the combobox list re-mounted under sync re-renders in R8CAP-E2E-010 (`deferred-work.md:1616-1620`);
     - the inert page while a list closes in 24.10-E2E-005 (`deferred-work.md:1868`).
   - What triggers the shift is nearly always a Dexie live query committing after a pull, so it comes with the cycle's timing, not the test's.
2. **Reading results land on their own clock.**
   - Every photo on an NC row asks for an `nc_obs` reading, every "Geral" photo for a caption reading, and every plate photo for a plate reading. The fake provider always answers.
   - Their suggestions come back in a pull timed by the 5 s reading-poll cadence (`engine.ts:205`, `:933-949`), by the reading worker the two parallel workers share, and by machine load.
   - The specs that wait on readings are in the `queue` lane (`groups.ts:272-283`). But `photos.spec.ts` and `sheet-photos.spec.ts` make readings without waiting for them, from the parallel lane. Their screens then change mid-step: a toast replaced (item 2), a block inserted (item 1).
   - This is the "photo and toast pattern" the audit suspects. The shared mechanism is "a reading arrives during a step that asserts something short-lived".
3. **The stepper jump's focus and scroll, deferred by 3 frames and not checked against where the focus is.**
   - `use-ficha-steps.ts:85-93` takes the focus (and scrolls) 3 frames after the tap, even when the user (or test) has moved it since.
   - That explains 25.2-E2E-002's "5" for "548" (item 3), 12.1-E2E-012 (item 4), and fits 24.10's "tap right after" family.
   - Starved frames under load stretch the window.
4. **Fixed bounds and budgets that do not follow the product's own bound.** 1.6-E2E-001 runs on the default 30 s budget under waits that sum past it (item 5). `e24y` uses a fixed 170 s for queue plus render (item 7).

Two of the four (1 and 3) are product races, and they explain most of the "red once under load" list. Cause 2 is the trigger behind cause 1 on the photo screens.

## Product races a user could meet

1. **Toast queue: an arrival replaces the answer to the user's own press, and the reverse drops the arrival.**
   - An arrival toast takes the slot from a plain toast at once (`state/toast.tsx:195`). "2 fotos adicionadas — legenda aplicada" vanishes in milliseconds.
   - The reverse: a plain toast over an arrival ("N leituras prontas — Ver") drops the arrival for good. It is not requeued; only outcomes requeue (`:191-194`).
2. **Stepper jump takes the focus from the field being typed in.** The first digit is committed alone and the rest is lost (`use-ficha-steps.ts:85-93`). On a slow tablet a reading "548" is saved as "5", or a half-typed manufacturer is created in the registry.
3. **A tap lost when content arrives above it mid-press.**
   - An NC draft pushes a row's photo list down, so "Erro — Tentar novamente" or a photo tile does nothing (`checklist-section.tsx:661-671` above `:748-755`).
   - Home's "Novo relatório" is re-mounted or pushed down during launch (`home-surface.tsx:255-262`, `:285-298`).
   - A finger's 50 to 150 ms press is a wider window than Playwright's.
4. **A tap on a relatório that is not on the device while a cycle runs waits for that cycle.** `syncRelatorio` uses `runCycle`, not `runFreshCycle` (`engine.ts:961-965`). The gate makes up for it, but "Baixando o relatório…" lasts as long as the cycle in flight. Minor.
