---
title: 'Epic 1 fix: persist the service worker hold-shell flag across worker restarts'
type: 'bugfix'
created: '2026-09-22'
status: 'done'
baseline_revision: '88a6664eb5a57069a5b706f08e0103ad7a548fa7'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-8-nothing-captured-is-lost-when-the-tab-closes-the-network-dro.md'
  - '{project-root}/_bmad-output/implementation-artifacts/reviews/epic-1-qa-playwright.md'
warnings: [oversized]
deferred:
  - summary: >-
      The pin is device-wide while the backlog is per user.
    evidence: |-
      User B with an empty outbox posts hold:false and releases user A's pin; PR #8's page promotion already did the same. Needs per-user pins or a hold while any user has a backlog.
    location: >-
      apps/web/src/sw/use-shell-update.ts
    severity: medium
  - summary: >-
      Identify the build by a version stamped into index.html, not only by the entry chunk name.
    evidence: |-
      cacheHolding picks the oldest cache holding the entry; a deploy changing only index.html, CSS or public/ keeps the entry name and can serve the older document after a reload (PR #11 review 2, L-1).
    location: >-
      apps/web/public/sw.js cacheHolding
    severity: low
  - summary: >-
      Build identity depends on register.ts living in the entry chunk.
    evidence: |-
      currentShellEntry uses import.meta.url; true today because the build emits one JS chunk. Code splitting into a shared chunk would reintroduce the wrong-shell pin (PR #11 review 2, L-2).
    location: >-
      apps/web/src/sw/register.ts currentShellEntry
    severity: low
---

<intent-contract>

## Intent

**Problem:** Story 1.8's AC "a new shell activates only on the next launch when the outbox is empty" fails (retro A3 / F-SPEC-2, QA D-1). The hold is a module variable (`holdShell`, `apps/web/public/sw.js:37`) that dies whenever the browser stops an idle worker, and — more fundamentally — once every tab closes the browser activates the waiting worker on its own, `skipWaiting` or not; the new worker then serves the new build and deletes the old cache while the outbox still says "1 pendente".

**Approach:** Make the hold durable and make it a *pin*: while the page reports a non-empty outbox, a sentinel in Cache Storage records the shell cache the job is running on. Every worker generation (old or new, fresh or restarted) reads the sentinel in `fetch` and `activate`, keeps the pinned cache alive and answers shell requests from it. The page clearing the backlog deletes the sentinel, and the next launch takes the new shell.

## Boundaries & Constraints

**Always:**
- Sentinel lives in a dedicated cache whose name does NOT start with `releng-shell-` (e.g. `releng-hold`, key `/__shell-hold`, JSON body `{ "shell": "<cache name>" }`), so existing shell-cache cleanup never touches it.
- The pin is written only if absent (first `hold:true` wins: it names the shell the job started on) and removed on `hold:false`. Writes/deletes happen inside `event.waitUntil` so a stopped worker cannot lose them.
- A fresh worker global scope (no messages received) must derive the hold from the sentinel alone. An in-memory mirror is allowed only as a cache of the sentinel, never as the source of truth.
- `activate` never deletes the pinned cache; it deletes every other `releng-shell-*` cache except its own.
- Wire protocol stays `{type:'hold-shell', hold:boolean}` and `{type:'activate-shell'}`. The page sends `hold = backlog > 0` to the active worker on every backlog change (no longer gated on `registration.waiting`, because after a browser-driven activation nothing is waiting yet the job must stay pinned).
- `shellPlan` stays a pure function extracted by tests; `/api/*` is never handled; no `/api` caching, no Background Sync, no manifest (AD-8/AR-7 as in the file header).
- PR #8's in-session behavior stays: while held, navigations are cache-first from the pinned shell; hold released → navigation network-first.

**Never:** Reading Dexie from the worker; calling `skipWaiting` on anything but `activate-shell`; unregistering the worker to "fix" state; broad refactors of `register.ts` / `use-shell-update.ts` beyond the hold rule.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Restarted worker, held | sentinel `{shell:A}`, worker A restarted (fresh scope), navigation | `/` from cache A | none |
| Browser-activated new worker, held | sentinel `{shell:A}`, worker B active after all tabs closed | B's `activate` keeps cache A; navigation and A's hashed assets served from A | missing asset in A → network |
| Drained | page posts `hold:false` | sentinel deleted; next navigation network-first; new shell served on the next launch | none |
| Old tab after drain | pin released, open tab asks for an old hashed asset | still answered from any surviving `releng-shell-*` cache before network | network fallback |
| Stale pin | sentinel names a cache that no longer exists | treated as no hold (network-first), sentinel deleted | none |
| Cleanup after drain | first navigation answered without a hold | caches other than own (and any pinned) deleted | failures swallowed |
| No new build, backlog > 0 | pin names own cache | same bytes as today; cache-first navigation | none |
| Sentinel read throws | Cache Storage error | behave as unheld (today's behavior) | `console.warn`, no throw |

</intent-contract>

## Code Map

- `apps/web/public/sw.js` -- the worker. `holdShell` module var (:37), `shellPlan` pure rule (:52), `install` + `dropOrphanShellCaches` (:58-94, "oldest surviving cache is the active one" assumption must now also respect the pin), `activate` cache purge (:96-106), `message` handler (:115-120), `fromCacheFirst`/`fromNetworkFirst` use `cacheName: CACHE_NAME` only (:122-138), `fetch` (:140-158). Copied verbatim to dist; `vite.config.ts` `shellPrecache()` stamps only `__PRECACHE_MANIFEST__` and `__SHELL_VERSION__` (tokens must survive).
- `apps/web/src/sw/register.ts` -- `shouldHoldShell` (:64, currently returns false with nothing waiting — the bug's page half), `holdShell` (:70), `promoteWaitingShell` (:83).
- `apps/web/src/sw/use-shell-update.ts` -- live backlog query drives hold + promote.
- `apps/web/src/sw/sw-plan.test.ts` -- extracts `shellPlan` from the real file via regex; its last `describe` asserts the old in-memory wiring and must be rewritten.
- `apps/web/src/sw/register.test.ts` -- page-side gate tests.
- `e2e/durability.spec.ts` (1.8-E2E-005 at :257) and `e2e/support/durability.ts` (`waitForShellCache` :78, `installWaitingShell` :171 which fakes `ready`) -- durability suite on `vite preview` :5200 over `build:e2e`, three projects (two Chromium, one WebKit).
- `playwright.config.ts` -- projects and web servers.

## Tasks & Acceptance

**Execution:**
- `apps/web/public/sw.js` -- replace the module flag with the Cache Storage sentinel (read helper, write-if-absent, delete); `activate` preserves the pinned cache; `fetch` resolves the pin per request (memoized per worker lifetime, refreshed by messages) and serves navigations from the pinned cache and non-API shell assets from pinned, own, then any `releng-shell-*` cache before network; drop stale caches on the first unheld navigation; `install` orphan cleanup never deletes the pinned cache. Update the header comment to describe the lifecycle truthfully -- this is the fix.
- `apps/web/src/sw/register.ts` -- `shouldHoldShell` becomes `backlog > 0` (keep the signature or simplify callers); update docs -- the page must keep the pin after a browser-driven activation.
- `apps/web/src/sw/sw-lifecycle.test.ts` (new) -- load the real `public/sw.js` into a fresh `vm` context per "worker generation" with fakes for `self`, `caches` (shared in-memory CacheStorage), `clients`, `registration`, `fetch`; cover every I/O-matrix row, including: gen A receives `hold:true` → gen A' (fresh scope, no message) serves `/` from cache A; gen B (new CACHE_NAME) activates with the pin → cache A survives and is served; `hold:false` → network-first and cleanup -- proves the restart lifecycle without a browser.
- `apps/web/src/sw/sw-plan.test.ts`, `apps/web/src/sw/register.test.ts` -- adjust to the new rule and wiring.
- `e2e/durability.spec.ts` + `e2e/support/durability.ts` -- new Chromium-only scenario (skip WebKit with a reason): real worker installed, op pending (api routed to fail), a "new build" simulated by routing `/sw.js` to a copy with a different `SHELL_VERSION` and `/` to the document with a marker; force a worker restart via CDP (`ServiceWorker.enable` + `ServiceWorker.stopAllWorkers`) and also close every page and open a new one; assert the old document (no marker) is served and old cache present; then let the push succeed, wait for the outbox to drain, close/reopen, assert the marker document is served -- the end-to-end AC.

**Acceptance Criteria:**
- Given a pending op and a new build installed and waiting, when the worker is stopped and the tab is reopened, then the old shell is still served (D-1 reproduction passes).
- Given every tab closed with a pending op and a new build, when the app is reopened, then the old shell is served even though the new worker is now active, and the old cache still exists.
- Given the outbox drains, when the app is next launched, then the new shell is served and older shell caches are deleted.
- Given no new build, when ops are pending, then behavior is unchanged from PR #8 (existing durability specs stay green on all three projects).

## Spec Change Log

## Review Triage Log

### 2026-09-22 — Review pass
- verdicts: 32 findings — high 0, medium 5, low 14, false 10, maybe-false 3
- findings:
  - `[medium]` `[defer]` (blind) The pin names the receiving worker's shell, not the shell the page runs; a tab that loaded a new build from the network, or an old tab under a browser-activated worker, can pin the wrong shell — pre-existing in PR #8's design (the page never reported its shell); fixing needs the page to report its shell identity, a protocol extension. Deferred.
  - `[low]` `[patch]` (blind) Stale-pin delete in `readPinStrict` runs outside `holdWrites` and can wipe a fresh pin — stale delete now goes through the queue and only when the sentinel still names the same missing cache.
  - `[low]` `[reject]` (blind) The pin has no expiry and no release on sign-out — the next sign-in of any user with an empty outbox releases it, and a never-draining outbox holding the shell is the AC by design; adding an expiry is new policy for an unlikely case.
  - `[medium]` `[defer]` (blind) Device-wide pin vs per-user backlog: user B with an empty outbox releases user A's pin — pre-existing (PR #8's page promotion already did this for B); per-user pins are a protocol change. Deferred.
  - `[low]` `[reject]` (blind) Old tab loses lazily loaded chunks after a mid-session drain and promote — the build emits a single JS chunk (`dist/assets/index-*.js`), so there is nothing lazily loaded to lose today.
  - `[medium]` `[patch]` (blind) E2E-006 does not prove the browser activated the new worker and the final cache check is not specific — polls for an active worker with nothing waiting/installing and the `-next` cache present; asserts the survivor is `-next`.
  - `[low]` `[patch]` (blind) `closeEveryTab` fixed 1 s wait — replaced by polling (same patch as above).
  - `[low]` `[patch]` (blind) `serveNextBuild` undo never unroutes `/` — undo now unroutes.
  - `[low]` `[reject]` (blind) `dist/sw.js` rewritten on disk may leak after a killed run — every Playwright run rebuilds `dist` first and `workers: 1`.
  - `[false]` `[reject]` (blind) Closing the `page` fixture breaks teardown — the scenario passes on both Chromium projects with fixture teardown intact.
  - `[low]` `[reject]` (blind) Every `/assets/*` GET is now intercepted and pays cache lookups — Vite emits only hashed files there and the extra lookups are a few Cache Storage matches; needed so an old document finds its assets under a newer worker.
  - `[low]` `[reject]` (blind) The documented "one extra orphan cache kept" case in `dropOrphanShellCaches` is untested — bounded at one cache and gone at the next activation; test adds little.
  - `[false]` `[reject]` (blind) Spec out of date (line numbers, `playwright.config.ts`, routing `/sw.js`) — fix edits this build's spec; the deviation is recorded in the Auto Run Result.
  - `[low]` `[reject]` (blind) Source-text regex assertions in `sw-plan.test.ts` are brittle — harmless; behavior is covered by `sw-lifecycle.test.ts`.
  - `[low]` `[reject]` (blind) (dup framing) Fixed wait flakiness on slow CI — covered by the polling patch.
  - `[low]` `[reject]` (blind) No test for dev mode where `ASSET_DIRS` is empty — dev never precaches `/assets`; `unregisterServiceWorkers` runs under HMR.
  - `[medium]` `[defer]` (edge) Unpinned tab loaded the new build from the network, then work becomes pending: pin names the older active cache — same root as the first row. Deferred.
  - `[medium]` `[defer]` (edge) Device-wide pin, per-user backlog — same root as the fourth row. Deferred.
  - `[maybe-false]` `[reject]` (edge) Pin set then user signs out and never signs in: navigations stay cache-first forever — the login page is still served from the pinned shell and works; the first sign-in releases. If true it is low.
  - `[low]` `[patch]` (edge) Stale-pin delete races a pin write — same patch as the second row.
  - `[low]` `[patch]` (edge) `activate` memoizes a null from a failed read — `activate` no longer memoizes a failed read.
  - `[low]` `[patch]` (edge) `setHold` memoizes null after a failed write/release — memo reset on failure.
  - `[false]` `[reject]` (edge) Stale bytes for a non-hashed file under an asset directory — Vite writes only content-hashed names under `/assets/`.
  - `[maybe-false]` `[reject]` (edge) `serveNextBuild` rewriting shared `dist` affects parallel tests — `workers: 1` in `playwright.config.ts`; projects run serially.
  - `[false]` `[reject]` (edge) The reviewed diff lacks the `durability.ts` helpers — the diff contains `serveNextBuild`, `closeEveryTab` and the rest (7 matches).
  - `[false]` `[reject]` (edge, claim) Spec says the sentinel records the shell the job runs on, code records the receiving worker's — true description gap, already covered by the deferred first row; not a separate defect.
  - `[false]` `[reject]` (edge, claim) "No new build" no longer matches PR #8 — navigations are cache-first from the worker's own cache whose bytes are the same; a deploy not yet seen staying unserved while ops are pending is exactly the AC.
  - `[false]` `[reject]` (edge, claim) `dropStaleShellCaches` runs on every unheld navigation, not once — after the first run there is nothing older to delete; it is a `caches.keys()` call.
  - `[false]` `[reject]` (edge, claim) Test simulation rewrites `dist/sw.js` instead of routing — documented deviation (the update check never reaches Playwright routing); behavior asserted is unchanged.
  - `[false]` `[reject]` (verification-gap) No verification gaps found — nothing to act on.
  - `[maybe-false]` `[reject]` (intent) The prod-profile D-1 browser re-run is not evidenced in the diff — performed after the patch as a manual check and in the independent review; not a code finding.
  - `[false]` `[reject]` (intent) Hold widened beyond PR #8 (cache-first whenever backlog > 0) breaks "keep the in-session behavior intact" — PR #8's in-session guarantee (no version flip mid-job) is preserved and strengthened; required because after a browser-driven activation nothing is waiting.

## Design Notes

Why a pin and not just a persisted boolean: the waiting worker's activation cannot be prevented once no client remains (the platform rule), so correctness must hold in the *new* worker too; only a name of the shell to keep serving makes that possible. Cache Storage over IndexedDB: same API the worker already uses, no schema, readable in a `vm` fake.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm verify` -- expected: green
- `docker compose --profile tools run --rm tools pnpm exec playwright test e2e/durability.spec.ts` -- expected: all pass (new scenario runs on the two Chromium projects)

**Manual checks (if no CLI):**
- QA D-1 re-run on the prod profile in a real browser (Playwright MCP): build, `--profile prod`, sign in, get "1 pendente", rebuild, close and reopen: old `index-*.js` served; drain; reopen: new one served.

## Auto Run Result

Status: done

**Summary.** The service worker hold is now a durable pin in Cache Storage (`releng-hold` / `/__shell-hold`, body `{"shell": "<cache name>"}`). Every worker generation, including one restarted with a fresh scope and one the browser activated after every tab closed, reads it, keeps the pinned cache and serves navigations and shell assets from it. The page reports `hold = backlog > 0`; an empty outbox deletes the pin and the next launch takes the new shell.

**Files.**
- `apps/web/public/sw.js` -- the pin (write-if-absent, release, stale-pin handling through the write queue, failed reads and writes never memoized), pin-aware `activate` and orphan cleanup, cross-cache shell asset lookup, older-cache cleanup on the first unheld navigation.
- `apps/web/src/sw/register.ts`, `apps/web/src/sw/use-shell-update.ts` -- `shouldHoldShell(backlog)` is `backlog > 0`.
- `apps/web/src/sw/sw-lifecycle.test.ts` (new, 23 tests) -- the real stamped `sw.js` in a fresh `vm` context per worker generation over a shared fake Cache Storage; every I/O-matrix row.
- `apps/web/src/sw/sw-plan.test.ts`, `apps/web/src/sw/register.test.ts` -- updated to the new rule.
- `e2e/durability.spec.ts`, `e2e/support/durability.ts` -- `@p0 1.8-E2E-006` (Chromium only): CDP worker stop, close every tab, drain, reopen.

**Review.** 32 findings: 6 patched (1 medium: E2E-006 proves activation and the surviving cache; 5 low: stale-pin race, activate and setHold memo on failure, polling instead of a fixed wait, route undo), 4 deferred (2 distinct medium items, see `deferred`), the rest rejected with reasons in the triage log.

**Deviation.** The spec asked to route `/sw.js`; Chromium's update check for a worker script never reaches Playwright routing, so `serveNextBuild` rewrites `apps/web/dist/sw.js` on disk (restored in `finally`, and every Playwright run rebuilds `dist`).

**Verification.**
- `docker compose --profile tools run --rm tools pnpm verify`: green (domain 273, web 340, scripts 13, api 54, Playwright @p0 22).
- `pnpm exec playwright test e2e/durability.spec.ts`: 20 passed, 1 skipped (E2E-006 on WebKit, by design).
- QA D-1 re-run on the prod profile in a real browser (Chromium via Playwright MCP, api-prod on :12001), twice. With "1 pendente", a new build installed and waiting, a CDP worker stop and every app tab closed: on reopen the new worker is active yet the old `index-*.js` is served and the old cache survives. After the outbox drains the pin is gone, and the next launch serves the new `index-*.js` with only the new shell cache left. Evidence: `reviews/epic-1-fix-sw-hold-persisted/`.

**Independent review (PR #11), fix applied.** The reviewer reproduced on the prod profile that the pin could name an older shell than the page ran (B active, C opened from the network, work captured: B pinned, a reload served B mid-job, and a Dexie version bump in C would strand the outbox). Raised from the deferred medium to high and fixed: the page now sends `shell` (the pathname of its own hashed chunk, `import.meta.url`) in `hold-shell`, the sentinel stores `{"entry": ...}`, and every worker resolves it at read time to the shell cache that holds that entry (installing, waiting or active); unresolved entries stay network-first and are kept; a message with no `shell` keeps the old own-cache pin. Lifecycle tests 28, E2E-006 now gives the next build a distinct entry chunk and asserts the pin equals the running entry.

**Second independent review (fix diff).** Confirmed the high fixed and D-1 intact in the browser; raised M-1: an `{entry}` pin whose build no cache holds any more was never replaced, so the job ran unheld until drain. Fixed: `pinIfAbsent` lets a hold that resolves (the page's cached entry, or the own cache for a legacy message) replace an unresolvable entry pin; a hold naming an equally unresolved build keeps the existing pin (it may still be installing). L-1 (same-entry deploys resolve to the oldest cache) and L-2 (entry identity relies on a single JS chunk) deferred as low.

**Follow-up review recommended:** false (patched: 0 high, 1 medium in the internal pass; the independent review's high was fixed and re-reviewed).

**Residual risks.** WebKit is covered by the `vm` lifecycle tests only; iPad behavior still needs the manual device pass (retro A1). The two deferred medium items above.
