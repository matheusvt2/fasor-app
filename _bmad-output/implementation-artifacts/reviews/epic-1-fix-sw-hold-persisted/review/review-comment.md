## Independent review: PR #11 (persist the service worker hold-shell flag)

**Verdict: changes requested.** The fix works for the case it targets: QA D-1 no longer reproduces on the prod profile. But the pin is now durable, and it can name the wrong shell. A common deploy sequence then serves an *older* build to a job that started on a newer one, and it keeps doing so across launches. If the deploy also bumped the Dexie schema, the device stays stuck (see H-1). The spec deferred this as a medium item ("pin names the receiving worker's shell"). Browser evidence below shows it is reachable in normal use, and this PR makes it much worse, so it should be fixed here.

### What I verified

- `pnpm verify` (tools container): green. That covers lint, static checks, unit tests (22 + 47 + 1 + 9 files), api tests and Playwright @p0 (22 passed, including 1.8-E2E-006 on desktop-chrome).
- `playwright test e2e/durability.spec.ts`: 20 passed, 1 skipped (E2E-006 on WebKit, by design).
- No new API routes. The PR touches no file under `apps/api`. The worker still passes through every `/api/*` request (`sw.js` fetch handler, `isApi`).
- AD-8 / AR-7 constraints still hold. There is no manifest, no Background Sync, no `/api` caching, and `skipWaiting` runs only on `activate-shell`. The pin lives in `releng-hold`, outside the `releng-shell-` prefix.
- Internal review patches: I re-read all six (stale-pin delete through the queue with a same-name re-check, no memo of a failed read in `activate` or of a failed `setHold`, polling in `closeEveryTab`, `serveNextBuild` undo, E2E-006 activation proof). I found no defect in them.

### Real-browser pass (Chromium via Playwright MCP, api-prod on :12001, isolated context)

Builds: A = `build:e2e` (`index-YyQQjqnb.js`, `releng-shell-2ac46b047af9`), B = `build` (`index-CTbt6NIo.js`, `releng-shell-4aa10bcfd073`). Pushes were blocked by aborting POST `/api/*` (auth and account excluded), and one op was seeded into the outbox.

| Step | Observed | Result |
|---|---|---|
| Signed in on A, op pending | "1 pendente", pin `{"shell":"releng-shell-2ac46b047af9"}` | pass |
| B deployed, `registration.update()` | B waiting, caches A + hold + B | pass |
| In-session reload | `index-YyQQjqnb.js` (A) | pass |
| CDP `ServiceWorker.stopAllWorkers`, reload | A served, "1 pendente" (`review/01`) | pass |
| App tab closed, reopened | nothing waiting (B active), A served, A cache kept (`review/02`) | **D-1 fixed** |
| Offline (context offline), reload | boots from the pinned A shell, "Sem conexão" (`review/03`) | pass |
| Pushes unblocked, "Sincronizar agora" | "Sincronizado", pin deleted, open tab stays on A (`review/04`) | pass |
| Tab closed, reopened | `index-CTbt6NIo.js` (B), only the B cache left (`review/05`) | pass |
| 390 / 768 / 1280, light and dark | renders as before (`review/08-*`). The 120 px overflow at 390 is the existing D-2, not from this PR | pass |

Screenshots are in `_bmad-output/implementation-artifacts/reviews/epic-1-fix-sw-hold-persisted/review/` in the review worktree and are not committed.

### Findings

**H-1 (high): the durable pin can hold a job on an older shell than the one it started on, across launches. With a schema bump the device is stuck.**
`apps/web/public/sw.js:166-172` (`pinIfAbsent` writes `CACHE_NAME`, the receiving worker's shell) and `apps/web/src/sw/register.ts:77-83` (`hold-shell` carries no shell identity).

The problem comes from how a normal deploy is picked up. With no tab open, a new build is deployed. On the next launch the old active worker has nothing pinned, so it answers the navigation network-first and the page runs the **new** document. The update check then installs the new worker, which waits. The user captures work, the page posts `hold:true` to the **old** active worker, and that worker pins **its own, older** cache.

Reproduced on :12001 after the run above (active worker B, cache B, no pin). I deployed C (`build:e2e`) and opened the app:
- On open, the page runs `index-YyQQjqnb.js` (C, from the network) under active B, and C is waiting.
- After seeding one pending op and reloading, the pin is `{"shell":"releng-shell-4aa10bcfd073"}` (B) while the page runs C (`review/06`).
- An in-session reload serves `index-CTbt6NIo.js`, so the page went back from C to B in the middle of the job.
- After closing the tab and reopening, C is active and nothing is waiting, yet `index-CTbt6NIo.js` (B) is still served with "1 pendente" (`review/07`).

So the job flips C to B and later back to C. That is the version flip AD-8 forbids, and before this PR it could not outlive a worker restart or a tab close. Now it persists until the outbox drains.

Consequence with a schema change: `AppDatabase` registers versions only up to its build's `LATEST_VERSION` (`apps/web/src/db/schema.ts:171-177`). If C bumped the Dexie version and upgraded the DB on its first launch, the pinned older shell B fails `open()` with a VersionError. `attachDatabase` swallows that and leaves `db` null (`apps/web/src/state/session.tsx:78-85`). `useShellUpdate` then returns early (`use-shell-update.ts:34`), so `hold:false` is never sent, and the pending ops cannot be pushed without the DB. The pin is never released and the device is stuck on a shell that cannot open its own data. The only way out is clearing site data, which deletes the unsent work that the pin exists to protect.

The same root cause applies in the other direction. After a drain, an open tab on the old shell under the browser-activated new worker creates new work, the new worker pins itself, and the next reload moves the tab to the new shell mid-job.

Suggested direction: the page reports the shell it is running (stamp `SHELL_VERSION` into the bundle, or a `<meta>` in `index.html`) in `hold-shell`, and the worker pins `releng-shell-<that version>`. If that cache does not exist yet (a page loaded from the network under an older worker), it is the one being installed, so pin it by name and keep it out of the cleanups. Add a lifecycle test and an E2E for the "open after deploy, then capture" order. The existing E2E-006 cannot see this, because the "new build" there shares the same hashed assets and is installed *before* the work starts.

**M-1 (medium, agree with deferral): device-wide pin vs per-user backlog.** `apps/web/src/sw/use-shell-update.ts:33-41`. As described in the spec's `deferred`. User B's empty outbox releases user A's pin. This exists since PR #8 and is fine to track separately. With H-1's fix it would be natural to key the pin by user as well.

**L-1 (low, test coverage): E2E-006 never exercises the cross-cache asset lookup.** `e2e/support/durability.ts:289` (`serveNextBuild` only changes `SHELL_VERSION`), so both "builds" share `index-*.js`. Serving an old document's hashed assets from the pinned cache under a new worker, whose `dist` no longer has them, is covered only by `sw-lifecycle.test.ts` and by this manual pass, where it worked: `index-YyQQjqnb.js` was served under B while the server's `dist` held only `index-CTbt6NIo.js`. Consider a variant that also renames the asset in the rewritten worker's precache list.

**L-2 (low, test hygiene): E2E-006 rewrites `apps/web/dist/sw.js` in place.** That file is bind-mounted and served by `api-prod` too. In a worktree where prod-profile manual checks run next to the suite, a killed run leaves a `-next` worker on :12001. The internal review rejected this with reason. Noted only because the prod profile shares that `dist`.

### Environment note

`apps/web/dist` in the `fasor-r2` worktree is currently the `build:e2e` bundle (`index-YyQQjqnb.js`), left by the reviewer's last "deploy".
