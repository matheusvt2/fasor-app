---
title: 'Nothing captured is lost when the tab closes, the network drops or storage is scarce'
type: 'feature'
created: '2026-09-22'
status: 'done'
baseline_commit: '49605d0f1f2921e338e1f422875ba8792163f293'
baseline_revision: '49605d0f1f2921e338e1f422875ba8792163f293'
route: 'freeform'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-fasor-2026-09-21/ARCHITECTURE-SPINE.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Story 1.5's outbox retention item stays open: acked rows are never pruned and the
      service worker's activation gate reads the whole outbox table to count the backlog.
    evidence: |-
      `outboxBacklog(db)` counts pending + sent rows through the `status` index, so this
      story does not make retention worse, but `remote_ops` and acked outbox rows still grow
      without bound (Story 1.5 deferred entries). Only noted here, as the orchestrator directed.
    location: 'apps/web/src/db/sync-store.ts (outboxRows); apps/web/src/db/schema.ts (remote_ops)'
    severity: 'low'
  - summary: >-
      FR-54 scenario 2 covers the op push only; the photo-upload half (`acked = false`,
      exactly one object on the server) lands with the uploader in Story 6.2.
    evidence: |-
      test-design 1.8-E2E-002 is written against a file upload, and epics.md Story 1.8 writes
      the same scenario as "the network dropped mid-push". No file entity, uploader or MinIO
      object path exists before Epic 6, so the scenario is staged on the op push, which is the
      durability path that exists. Story 6.2 extends the same spec file with the blob half.
    location: 'e2e/durability.spec.ts (1.8-E2E-002); apps/web/src/files/'
    severity: 'medium'
  - summary: >-
      The 500 MB storage-low banner of AD-8 is not published; only the refusal path (error
      toast on a rejected write) ships here.
    evidence: |-
      AD-8's threshold is marked provisional and "the number is set after the iPadOS test"
      (ARCHITECTURE-SPINE.md:413), which is this story's manual script and has not run. The
      banner has a mock (`mockups/key-sync-status.html:294`) but no slot in the seven-kind
      `BANNER_PRIORITY`, so publishing it would need a spine change. `storageHeadroom()` and
      its kernel check ship and are unit-tested, so the banner is one candidate away.
    location: 'apps/web/src/device/storage-estimate.ts; apps/web/src/state/banner-slot.tsx'
    severity: 'medium'
  - summary: >-
      Draft sources are registered per surface by the capture screens; only the fixture route
      registers one today.
    evidence: |-
      `useDraftSource` is the registration API and the `/__fixture/field` dev-only route is its
      single caller, because no sheet, dialog or field surface exists before Epic 5. Recovery of
      a draft whose surface is not mounted shows the toast and keeps the row; applying it needs
      the owning surface. Epic 5 stories register their own sources with no change to the store.
    location: 'apps/web/src/state/drafts.tsx (useDraftSource); apps/web/src/surfaces/fixtures/'
    severity: 'low'
  - summary: >-
      The offline cold open is asserted on the two Chromium projects only. On the WebKit
      project the precache list is asserted but the offline reopen is not: Playwright's
      WebKit cuts the network below the service worker.
    evidence: |-
      `context.setOffline(true)` in Playwright 1.63 WebKit makes the navigation fail with
      "WebKit encountered an internal error" before the worker's `fetch` handler is asked,
      so a cached shell can never answer it there (reproduced with a probe spec; the worker
      itself installs, activates, controls the page and fills its cache on WebKit, which the
      test still asserts). The offline reopen on Safari is step 4 of the manual iPad script,
      which is what that script exists to prove. The test carries the annotation
      `not-covered-here` on WebKit rather than passing silently.
    location: 'e2e/durability.spec.ts (1.8-AC-001)'
    severity: 'medium'
  - summary: >-
      The durability projects sign in through `/api/auth/*` and re-add the session cookie
      without `Secure`, instead of driving the Login form, because the preview origin is
      plain http.
    evidence: |-
      Story 1.3's session cookie is `httpOnly; Secure; SameSite=Lax` (AD-9). Chromium stores
      such a cookie on `http://localhost`; WebKit drops it, so on the WebKit project the form
      path cannot hold a session at all and every scenario failed at sign-in. The helper
      `signInForDurability` posts to the same route the form calls and re-adds the cookie
      without that one attribute, which changes nothing the server sees, then presses through
      the one-time recovery screen the way a user would (this browser genuinely has no
      database yet); Story 1.3's own form test still drives the real form on `desktop-chrome`. On Story 1.7's HTTPS origin — the
      one a real tablet and the manual script use — the form works everywhere. Serving the
      preview over HTTPS instead would need the mkcert leaf key to be readable by the `node`
      user and `https://localhost:*` added to `TRUSTED_ORIGINS`, both outside this story.
    location: 'e2e/support/durability.ts (signInForDurability); apps/api/src/auth/auth.ts'
    severity: 'medium'
  - summary: >-
      Scenarios 1.8-E2E-002 and 1.8-E2E-005 run with the service worker disabled, because
      Playwright cannot intercept requests through a service worker outside Chromium.
    evidence: |-
      With the shell worker controlling the page, `page.route` is ignored on WebKit, so both
      scenarios silently ran with the network up and neither the mid-push drop nor the
      5-day banner could be produced. `withoutServiceWorker(page)` makes `register` reject
      for those two contexts; both scenarios are about the outbox and the network, and the
      shell has its own scenario. Revisit if Playwright gains cross-browser service-worker
      interception.
    location: 'e2e/support/durability.ts (withoutServiceWorker)'
    severity: 'low'
  - summary: >-
      `persistAll` writes one draft per source with a sequential `await`; an iOS tab
      discarded mid-`pagehide` could drop the later sources of the loop.
    evidence: |-
      The sequential-await pattern is in `state/drafts.tsx` and is real, but whether iOS
      Safari freezes the page before those writes commit cannot be decided from the code or
      from Playwright — WebKit desktop does not evict or discard the way the device does.
      What would settle it: step 4 of the pending manual iPad script, with more than one
      registered draft source on the page. If it does drop them, the fix is one `bulkPut`
      inside a single transaction (a new `saveDrafts` in `db/drafts.ts`). Only one source
      exists today, so nothing is reachable before Epic 5.
    location: 'apps/web/src/state/drafts.tsx (persistAll); apps/web/src/db/drafts.ts'
    severity: medium (unverified)
dev_model: 'opus'
dev_effort: 'high'
---

<intent-contract>

## Intent

**Problem:** The app has an op log, a sync engine and Home, but nothing survives the three failures the product is sold on: there is no service worker, so a cold open with no signal shows a browser error page; the `drafts` table declared in Story 1.4 has no writer, so anything typed but not yet committed dies with the tab; a rejected IndexedDB write is an unobserved promise rejection; an evicted origin signs the user straight back in with an empty database and no explanation; and the two banner kinds Story 1.6 left unpublished (`draft-found`, `unsynced-5-days`) have no publisher. Every capture story of Epics 5 and 6 is built on top of this.

**Approach:** Ship the offline vehicle of AD-8/AR-7 end to end: `apps/web/public/sw.js` precaching the built shell only, with a Vite plugin that stamps the hashed asset list into it and an activation gate that promotes a waiting worker only when the outbox backlog is empty; a draft store (`saveDraft`/`readDraft`/`dropDraft`) written from one `visibilitychange`/`pagehide` listener over registered draft sources and offered back through the existing persistent Toast; the `unsynced-5-days` banner published from the kernel's `unsyncedForDays`; a one-time eviction-recovery surface shown when a boot-resolved session opens a database that was created fresh; an error toast on a refused write classified by a new kernel check; and the three FR-54 scenarios named in `e2e/durability.spec.ts`, running on three Playwright projects against the built bundle, with the manual iPad and Android script written for Matheus and marked pending.

## Boundaries & Constraints

**Always:** `packages/domain` stays pure zod-only TypeScript and computes every status, count, text and verdict once: the draft key, the 5-day check (`unsyncedForDays`, already there), the write-error classification and the storage headroom check live there and take `now: Date` explicitly. `apps/web` renders only from IndexedDB through `useLiveQuery` and writes only ops through `commitOps`; `fetch` stays inside `src/{sync,files,api}` and `dexie` inside `src/db` (existing lint rules, asserted by `scripts/tooling.test.ts`). Dexie versions are append-only, each with an `upgrade()` that ends in `stamp(version)`. The service worker precaches the app shell only — `/`, the hashed build assets, the self-hosted Inter woff2 and `/sprite.svg` — and nothing else; it never caches `/api/*`, never uses the Background Sync API, `navigator.storage.persist()` or a web app manifest, and it promotes a waiting worker only on a later launch at which the outbox holds no pending or sent row. `components.css` and `tokens.css` stay byte-identical (`src/styles/styles.test.ts`). Copy is pt-BR from `src/copy/`, each invented string carrying an `// authored:` note; the banner text is exactly "Alterações sem envio há 5 dias" and the toast is exactly "Rascunho encontrado" with the action "Recuperar". Banner priority is the spine's seven-kind order, unchanged. `pnpm verify` keeps running `@p0` on desktop Chrome only and stays under 15 minutes. English identifiers, no emoji, no codename in `apps/web/src`, `PRODUTO` only. Everything runs through `docker compose` with the project from `{WT}/.env`.

**Never:** No manifest, no `beforeinstallprompt`, no home-screen or install affordance, no Background Sync API, no `persist()`, no Workbox or any new service-worker dependency. No product screen beyond the acceptance criteria: the only new user-facing surface is the eviction-recovery screen the AC names; the field surface used by the durability scenarios is a dev-only fixture route that is absent from a production build. Do not publish the 500 MB storage-low banner (its threshold is provisional until the manual check runs) and do not add an eighth banner kind. Do not execute the manual iPad or Android script or claim a result for it. Do not touch `apps/api` behavior beyond a cache header for the service-worker script. Do not fold the three-project matrix into `pnpm verify`. Do not change AD-3 coalescing, the sync contract, or `syncCounts`' signature.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Cold open offline, shell cached | Signed-in user, service worker active with the shell precached, network down | The document, its hashed JS/CSS, the Inter woff2 and `/sprite.svg` are served from the cache; React boots, Home renders from IndexedDB; the `offline` badge and toast appear | Navigation falls back to the cached `/` when the network request rejects |
| Cold open offline, nothing cached | No service worker registered yet, network down | Ordinary browser failure; no partial or blank shell is claimed to work | Out of scope by design (the first load needs a network) |
| New shell built while work is pending | A new `sw.js` installs, outbox holds 3 pending ops | The new worker stays in `waiting`; the page keeps running the old shell; `outboxBacklog(db) === 3` is the reason | None; no message is posted to the waiting worker |
| New shell, nothing pending | A new `sw.js` waits, outbox holds only `acked` rows | On this launch the page posts `{type: 'activate-shell'}`; the worker calls `skipWaiting()` then claims clients | If the post fails the old shell keeps serving; the gate retries next launch |
| `/api/*` request while offline | Any sync request with the worker active | The worker does not handle it; it reaches the network and fails as before | The sync engine's existing retry table applies unchanged |
| Draft written on hide | A registered draft source holds uncommitted text, `visibilitychange` fires with `document.hidden` | One `drafts` row per source, key `draftKey({surface, entity_id, field})`, `saved_at` from `now()` | A rejected Dexie write is swallowed (the page is going away) and logged once |
| Draft offered on reopen | A `drafts` row exists for this user at boot | Persistent toast "Rascunho encontrado" with action "Recuperar"; nothing is applied to any row | Dismissing the toast keeps the row; the toast returns on the next launch |
| Draft recovered | "Recuperar" pressed, the owning surface is mounted | The value is handed to the source's `apply`, the row is dropped, one op is committed by the ordinary field-commit path | If no source is mounted the row is kept and the toast stays |
| Draft equals committed value | Source's current value equals the draft on hide | No row is written (nothing was uncommitted) | None |
| Outbox older than 5 days | `oldestPendingClientTs(db)` is 6 days before `now()` | `unsynced-5-days` warning banner "Alterações sem envio há 5 dias" in the single slot, below `offline` in priority | None |
| Outbox older than 5 days, dead ops only | Oldest non-acked row is `dead` | No banner: `oldestPendingClientTs` reads `pending` and `sent` only | None |
| Eviction recovery | Boot resolves a server session with no local pointer and `openDatabase` created the store fresh | One-time full-surface screen naming what the server holds (relatórios and users from the company pull) with a primary action that runs one cycle, then the ordinary shell; a `local_prefs` flag makes it one-time | If the pull fails the screen stays with the failure text and the action retries |
| First sign-in through the form | User types credentials on `/login` | No recovery screen: the form path never sets the flag | None |
| Refused write (quota) | `commitOps` rejects with a `QuotaExceededError` | Error toast "Não foi possível salvar neste aparelho. Libere espaço e tente de novo."; the committer keeps the value pending so a retry commits it | The rejection is caught at the commit site; never an unhandled rejection |
| Refused write (other) | `commitOps` rejects with any other error | Error toast "Não foi possível salvar. Tente de novo."; same retention | Same |
| `navigator.storage` missing | WebKit or a privacy mode without `storage.estimate` | `storageHeadroom()` returns null and no check runs; capture is unaffected | Never throws |

</intent-contract>

## Code Map

Kernel (`packages/domain`, zod only; `src/index.ts` barrels every module):
- `src/checks/unsynced.ts` -- `UNSYNCED_WARNING_DAYS = 5` (L2), `unsyncedForDays(oldestPendingClientTs: string | null, now: Date, days?): boolean` (L11-20). Already exported from `src/index.ts:14`. **Ready to use; this story only publishes it.**
- `src/sync/counts.ts` -- `OutboxLike`, `SyncCounts {pending, sent, dead, sheets_pending, photos_pending}`, `syncCounts`, `syncBadgeState`, `pendingSummaryText/Count`, `syncBadgeLabel/ShortLabel`. Signature stays as is (Story 1.6 deferred the snapshot parameter).
- `src/prefs/theme.ts` -- `THEME_PREFERENCES`, `themePreferenceSchema`, `themeAttribute(pref)` returning `null` for `'system'` (L21-23). The boot script must reproduce exactly this mapping.
- `src/clock.ts`, `src/ids.ts` -- `Clock`, `NewId`, `isoTimestampSchema`, `SERVER_DEVICE_ID`. `src/test-support.ts` -- `opFactory`, `TEST_*`, `T0`/`T1`, `atMinutes` for the new kernel tests.
- `src/ops/path.ts` (`parsePath`, `PathFamily`), `src/schemas/entities.ts` (`ENTITIES`, `entityRowSchemas`) -- the vocabulary a draft key's `surface`/`entity_id` must not contradict.
- **No `src/drafts/`, no write-error check and no storage check exist.** `package.json` `exports` needs nothing new.

Web store and state (`apps/web/src`):
- `src/db/schema.ts` -- `DraftRow {key, surface, entity_id, value: unknown, saved_at}` (L39-45, doc-comment already cites AD-1), store `drafts: 'key, surface'` in v1 (L112) — **no index on `entity_id`**, so a v4 adding `[surface+entity_id]` is this story's Dexie change. `VERSIONS` (L106-142) is append-only, each entry `{version, stores, upgrade}` ending in `stamp(version)` (L92-94); `LATEST_VERSION = 3` (L144); `AppDatabase` (L146-166) with a `populate` hook that stamps `db_version` for a brand-new database — **the populate hook is where "this database was created now" is observed**; `LocalPrefRow {key, value}`, `DEVICE_ID_PREF = 'device_id'` (L83), `THEME_PREF = 'theme'` (L84), `COMPANY_STREAM = 'company'` (L82); `databaseName(userId)` = `releng-${userId}` (L168); `openDatabase(userId, {upToVersion})` (L173-175) constructs but does not open.
- `src/db/commit.ts` -- `CommitDeps {newId, now}` (L27-30), `commitOps(db, ops)` (L85-89, one `rw` transaction, **no try/catch — a `QuotaExceededError` rejects the returned promise**), `commitBatch` (L92-102), `undoBatch` (L105-111), `oldestPendingClientTs(db)` (L114-116) — the exact input for the 5-day check.
- `src/db/sync-store.ts` -- `deviceId`, `takePending`, `markSent/markAcked/markDead`, `applyPulled`, `rematerialize`, `readSyncState`, `writeSyncState`, `resendDead`, `outboxRows`, `syncStateRows`, `localUsers`, `remoteOpRows`. `sync_state` rows are keyed by `COMPANY_STREAM` or a relatório id. **Add the backlog count and the draft accessors here or in a sibling `src/db/drafts.ts`; both are inside the Dexie boundary.**
- `src/db/prefs.ts` (25 lines) -- `readTheme(db)` (L14-21, self-heals to `'system'`), `writeTheme(db, pref)` (L23-25, Dexie only, **no localStorage mirror**). `src/db/live.ts` -- the single `useLiveQuery` re-export.
- `src/input/field-commit.ts` -- `createFieldCommitter<T>({commit, idleMs = 500, timers})` (L42-88); `settle()` (L52-64) re-queues the value and rethrows on a **synchronous** throw, but an async rejection from `commit` is unobserved and an idle-timer throw is an unhandled exception (L70). **This is the gap the error toast closes; wrap `commit`, do not change the controller's contract.**
- `src/state/session.tsx` -- `SessionStatus 'booting'|'signed-out'|'signed-in'` (L24), `SessionState` (L26-36), `attachDatabase(userId)` (L57-70, swallows an `open()` failure with a `console.warn`; its doc-comment at L52-56 says "Story 1.8 owns what a missing store means for capture"), the cold-open flow (L75-122: `readLastSession()` first, then `authClient.readSession()`; the branch at L113-117 is "no local pointer but the server confirms a session" — **the eviction signal**), `doSignOut` (L156-166) never deletes the database.
- `src/state/last-session.ts` -- `KEY = 'releng.last-session'` (L14), `readLastSession`/`writeLastSession`/`clearLastSession`, all swallowing errors.
- `src/state/sync.tsx` -- `SyncState {counts, badgeState, pendingText, pendingCount, online, running, outdated, lastResult, lastSyncAt, lastPushAt, supersededCount, deviceId, userNames, summaryRelatorios, syncNow, syncRelatorio, resendDead}` (L30-52); the engine is created in an effect keyed on `session.database` (L84-106); `syncNow()` (L124).
- `src/state/banner-slot.tsx` -- `BANNER_PRIORITY` (L17-25) already carries `draft-found` and `unsynced-5-days` with a comment naming this story; `Banner {kind, variant, text, actions?, role?}` (L31-39); `pickBanner` (L42-54); `bannerCandidates(conditions: BannerConditions)` (L73-87) where `BannerConditions {reAuthRequired, online, reAuthAction?, extra?}` (L56-63) — **`extra` is the sanctioned entry point and `app-shell.tsx` never passes it**; the "+N" chip is L105 and L121-131.
- `src/state/toast.tsx` -- `TOAST_TIMEOUT_MS = 6_000` (L11), `showToast(text, {action})` (L53-67) — **a toast carrying an action is already persistent: no timer is set**; `showOnce(key, …)` (L69-76) is in-memory per page session; `ToastOutlet` (L92-97). `src/components/toast.tsx` -- `.toast[role="status"][data-testid="toast"]` with `.toast-action` (L19-35); the action button dismisses after `onPress`.
- `src/state/theme.tsx` -- `applyTheme(theme)` writes `data-theme` on `document.documentElement` (L22-27); `ThemeProvider` (L29-77) mounts only inside `RequireSession`, so the attribute lands 121-145 ms after first paint (Story 1.6 deferred entry naming this story).
- `src/device/storage-estimate.ts` (21 lines) -- `estimateStorageUsage(): Promise<number | null>` reading `navigator.storage.estimate().usage`, never throws; only caller is `src/surfaces/account/account-surface.tsx:15`. **Extend with the free-space reading; keep the existing export and its caller working.**
- `src/app.tsx` -- `Booting` (L15-25), `SessionShell` (L28-32, `sync.outdated ? ContractOutdatedSurface : AppShell`), `RequireSession` (L35-48, `SyncProvider > ThemeProvider > ToastProvider > SessionShell`), the router (L62-86) with `/login`, `/`, `/account`, `/sync` and a catch-all. `src/surfaces/contract-outdated-surface.tsx` -- **the precedent for a full-surface replacement state** (plain elements, `.btn` primary, authored copy).
- `src/surfaces/app-shell.tsx` -- `IconSprite()` (L18-38) with symbols `i-check`, `i-chev-right`, `i-layers`, `i-book`, mounted at L77; `bannerCandidates({reAuthRequired, online, reAuthAction})` at L59-73 and `<BannerSlot banners={banners} onOpenSync={…}/>` at L95; `<ToastOutlet/>` at L97.
- `src/main.tsx` (14 lines) -- `createRoot(...).render(<StrictMode><App/></StrictMode>)`, imports `./styles/index.css`, sets `document.title = PRODUTO`. **No service-worker registration anywhere in the repo** (`grep -rn 'serviceWorker\|sw.js'` is empty).
- `src/copy/pt-br.ts` -- top-level keys `login` (L13), `account` (L26), `home` (L87), `banner` (L113: only `reAuthText`, `reAuthAction`, `offlineText`, `moreLabel`), `sync` (L125), `outdated` (L151), `common` (L158); the `// authored:` convention is the module doc-comment (L1-11). `src/copy/ui.ts` -- component copy (`toggle`, `confirmDialog`, `overflowMenu`, `statusPill`, `statusTile`, `syncBadge`, `combobox`).
- `src/styles/components.css` / `tokens.css` -- **read-only**, byte-compared by `src/styles/styles.test.ts`; `src/styles/app.css` is the project's own sheet and the place for anything the mock has no selector for (precedent `.sync-badge-btn`). `src/styles/fonts.css` (7 lines) has one `@font-face` pointing at `./fonts/inter-latin-wght-normal.woff2`.

Build, server and container:
- `apps/web/vite.config.ts` (18 lines) -- `plugins: [react()]`, `server {host, port 5173, proxy '/api'}`, `test {environment: 'jsdom', setupFiles: ['./src/test-setup.ts']}`. **No `build` block, no `preview` block, no `public/` directory exists.** Vite 8.3; default output `dist/` with hashed `assets/`.
- `apps/api/src/http/app.ts` -- `DEFAULT_STATIC_DIR = apps/web/dist` (L17), `MIME_TYPES` (L19-36, `.js → text/javascript; charset=utf-8`, `.svg`, `.woff2` present), `resolveStaticTarget` (L58-63, falls back to `index.html` only when the file is absent, so a real `dist/sw.js` is served as itself), the catch-all at L127-137 setting **only** `content-type` — no `Cache-Control` anywhere.
- `docker/caddy/Caddyfile` (11 lines) -- `auto_https off`, one site block, `tls /certs/leaf/*`, a bare `reverse_proxy api:3000`; no headers added or stripped, so it does not interfere with a worker scoped at `/`.
- `docker-compose.yml` -- `web` runs Vite dev on 5173 with `API_PROXY_TARGET: http://api:3000`; `api-prod` and `migrate` are `profiles: ['prod']` and `api-prod` serves the bind-mounted `apps/web/dist`, which must be built first; `tools` is `profiles: ['tools']`, image `app-tools`, env `API_PROXY_TARGET: http://api:3000`, and runs the merge gate.
- `Dockerfile.tools` (12 lines) -- `FROM node:24-bookworm`, `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`, `npx --yes playwright@1.63.0 install --with-deps chromium` on L5 (**chromium only — WebKit is not in the image; the install must be extended on that same line, before `USER node` on L10**), then `USER node`, `corepack prepare pnpm@12.5.1`.
- `eslint.config.js` -- ignores `**/dist/**` but not `apps/web/public/**`; `{languageOptions: {globals: globals.node}}` is the base and `apps/web/**/*.{ts,tsx}` adds browser globals — **a plain `.js` service worker needs its own block with `globals.serviceworker`**. The `fetch` rule and the Dexie rule are scoped to `apps/web/src/**/*.{ts,tsx}` only.
- Root `package.json` -- `test:e2e: "playwright test --grep @p0"` (**must gain an explicit `--project` list once new projects exist, or `verify` runs `@p0` once per project**), `verify` chains lint, static, test:unit, test:api, test:e2e. `tsconfig.json` includes `scripts`, `e2e`, `*.config.ts` with `lib: ES2023, DOM, DOM.Iterable`, so `e2e/**` is typechecked by `pnpm static`; `eslint .` lints it with base rules only.
- `vitest.config.ts` -- root run covers `scripts/**/*.test.ts` only; `apps/web` and `packages/domain` run their own.

Playwright harness:
- `playwright.config.ts` (17 lines) -- `testDir: 'e2e'`, `reporter: 'list'`, `workers: 1` (the specs share the two seeded users), `globalSetup: './e2e/support/global-setup.ts'`, `use: {baseURL: 'http://localhost:5199'}`, one project `desktop-chrome`, `webServer` running `vite --port 5199 --strictPort`, `reuseExistingServer: false`.
- `e2e/support/merged-fixtures.ts` -- `test`/`expect`, `seed` fixture, `signIn(page, email)` (L21, waits for the "Relatórios por status" group), `syncBadge` (L35), `syncWord` (L40), `deviceDatabaseName(userId)` (L45), `writeLocalMarker` (L50) / `readLocalMarker` (L71) / `readStoreNames` (L103) over raw IndexedDB in `page.evaluate`.
- `e2e/support/outbox.ts` -- `clientCreateOp`, `projectCreateOp`, `relatorioCreateOp`, `serverOnlyOp`, `seedOutbox(page, database, ops)` (L111, raw IndexedDB writes; **the page must be reloaded afterwards because Dexie live queries do not see raw writes**), `readDeviceId` (L136, polls `local_prefs`), `readStore` (L152), `pullAll(request, path)` (L172).
- `e2e/*.spec.ts` -- flat `test()` calls, every title prefixed `@p0`; `auth.spec.ts` cuts the network with `page.route(isApiRequest, route => route.abort('internetdisconnected'))` (L17, L44) and its comment at L40-43 says this predates the service worker; `sync.spec.ts` drives `getByRole('button', {name: 'Sincronizar agora'})` (L63) and polls `readStore`.

Planning anchors (quoted where the wording is contractual):
- `ARCHITECTURE-SPINE.md:105-109` AD-8 (= AR-7 in `epics.md:163`): precache list, "no manifest install prompt, no Background Sync API, no reliance on `persist()`", the 5-day banner, "If the origin's storage was evicted (session cookie present, database absent), the app shows a one-time screen naming what the server holds and re-pulls", the 500 MB warning marked `[ASSUMPTION]`, the PRD Q0 failure branch.
- `ARCHITECTURE-SPINE.md:59` (AD-2): "Uncommitted field text and unsaved dialog state are persisted to a per-user `drafts` table (keyed by surface and entity) on `visibilitychange`/`pagehide` and offered on reopen as 'Rascunho encontrado — Recuperar', never applied silently; the outbox itself is not a draft."
- `ARCHITECTURE-SPINE.md:232`: "the service worker activates a new shell on the next launch only when the outbox is empty". `:231`: the seven-kind banner priority. `:233`: the three Playwright projects and the three FR-54 scenarios by name. `:296`: `public/sw.js  # app-shell precache only (AD-8)`. `:413`: the 500 MB threshold is provisional.
- `epics.md:111` FR-61, `:142` NFR-9, `:150` NFR-17, `:724-752` the story, `:407-419` the Definition of Done (item 1 exempts the physical-device criterion and requires its evidence under `_bmad-output/test-artifacts/manual/`).
- Test ids (`test-design-qa.md:334-336, 388-389`; `test-design-progress-system.md:278-282`): **1.8-E2E-001** tab closed mid-sheet, reopen offers "Rascunho encontrado — Recuperar", committed values present, nothing applied silently; **1.8-E2E-002** network dropped mid-push, resumes without duplicates; **1.8-E2E-003** `storage.estimate` mocked low plus a forced `QuotaExceededError`, error toast shown; **1.8-E2E-004** eviction recovery; **1.8-E2E-005** unsynced > 5 days banner with `page.clock` and the outbox-empty activation rule. `test-design-progress-system.md:88` fixes the manual evidence filename `test-artifacts/manual/ipad-YYYY-MM-DD.md`.
- Mockups: `key-sheet-states.html:400` is the authoritative draft-recovery markup — `<div class="toast" role="status"><span>Rascunho encontrado</span><button class="toast-action">Recuperar</button></div>`. `prototype/screens/60-ficha.html:207` renders the same condition as a dismissible banner and is **stale**: EXPERIENCE.md:368, MOCK-GUIDE.md:70 and the story AC all say persistent toast. **No mock exists** for the 5-day banner or the eviction screen; model the screen on `contract-outdated-surface.tsx`. `EXPERIENCE.md`'s banner order (L263, L382) predates the re-auth and unsynced slots and is superseded by the spine (`source-deltas.md:25`).

## Tasks & Acceptance

**Execution:**

- `packages/domain/src/drafts/key.ts` + `key.test.ts` -- `DraftTarget {surface: string, entity_id: string, field?: string}`, `draftTargetSchema`, `draftKey(target): string` (stable, collision-free join over the three segments, segments validated `^[a-z0-9][a-z0-9_-]*$`), `parseDraftKey(key): DraftTarget | null` with `draftKey(parseDraftKey(k)) === k` round-trip. Pure, no clock. -- AD-2 "keyed by surface and entity", 1.8-UNIT-001
- `packages/domain/src/checks/write-error.ts` + test -- `WriteErrorKind = 'quota' | 'unknown'`, `writeErrorKind(name: string | null | undefined): WriteErrorKind` matching `QuotaExceededError` and Dexie's `QuotaExceededError`/`QuotaExceeded` aliases; pure, takes only the name so the kernel never touches a DOM object. -- AD-8 "never a silent refusal", 1.8-UNIT-002
- `packages/domain/src/checks/storage.ts` + test -- `STORAGE_LOW_FREE_BYTES = 500 * 1024 * 1024` (AD-8, marked provisional in a comment), `StorageReading {usage: number, quota: number} | null`, `storageLow(reading): boolean` returning false for null. Kernel-only: the banner is not published (see `deferred`), the check exists for Epic 6 and is unit-tested here. -- AD-8
- `packages/domain/src/index.ts` -- barrel the three new modules in the existing order. -- Conventions
- `apps/web/src/db/schema.ts` -- append Dexie version 4: `drafts: 'key, surface, [surface+entity_id]'` with an `upgrade()` that ends in `stamp(4)`; set `LATEST_VERSION` through the existing computation; add a public `createdFresh = false` field on `AppDatabase` set to `true` inside the existing `populate` hook, so a caller can tell a brand-new store from an existing one. Do not alter versions 1-3. -- AD-9, 1.8-E2E-004
- `apps/web/src/db/drafts.ts` + `drafts.test.ts` (fake-indexeddb) -- `saveDraft(db, target, value, now)`, `readDraft(db, target)`, `listDrafts(db)`, `dropDraft(db, target)`, `dropAllDrafts(db)`; `saveDraft` writes `{key: draftKey(target), surface, entity_id, value, saved_at: now.toISOString()}` and deletes the row when `value` is `null` or an empty string. -- FR-61
- `apps/web/src/db/sync-store.ts` -- add `outboxBacklog(db): Promise<number>` counting `pending` + `sent` rows through the `status` index (no full-table scan) and export it; it is the activation gate's only input. -- AD-8 activation rule
- `apps/web/src/db/prefs.ts` -- mirror the theme to `localStorage` under `releng.theme` inside `writeTheme` (wrapped in try/catch, never throwing) and read the mirror back in a new `readThemeMirror()`; `readTheme(db)` keeps Dexie as the source of truth. -- Story 1.6 deferred entry (theme flash)
- `apps/web/index.html` -- add one blocking inline `<script>` in `<head>` that reads `releng.theme`, validates it against the three literals and sets or removes `data-theme` on `document.documentElement` before first paint, mirroring `themeAttribute` exactly; it must be side-effect free on a missing or malformed value. -- Story 1.6 deferred entry
- `apps/web/public/sprite.svg` -- the four symbols currently inline in `app-shell.tsx` (`i-check`, `i-chev-right`, `i-layers`, `i-book`) as a standalone `<svg><symbol>` document; delete `IconSprite` from `app-shell.tsx` and change every `<use href="#i-…">` under `src/` to `<use href="/sprite.svg#i-…">`. Add a unit test asserting every `#i-` id referenced under `apps/web/src` exists in `sprite.svg`. -- AR-7 "SVG icon sprite" must be a precachable asset
- `apps/web/public/sw.js` -- the service worker: a `PRECACHE` constant written as the literal token `'__PRECACHE_MANIFEST__'` and a `SHELL_VERSION` token `'__SHELL_VERSION__'`; when the token is still a string (dev) it falls back to `['/', '/sprite.svg']`. `install` opens `releng-shell-{SHELL_VERSION}`, adds every precache URL and **does not call `skipWaiting()`**. `activate` deletes other `releng-shell-*` caches and calls `clients.claim()`. `message` handles `{type: 'activate-shell'}` by calling `skipWaiting()`. `fetch` handles only same-origin `GET`: a navigation is network-first with the cached `/` as fallback; a precached URL is cache-first; **anything under `/api/` and every other request is left to the network untouched**. No Background Sync, no `persist()`, no periodic sync. -- AR-7, NFR-9
- `apps/web/vite.config.ts` -- add a local plugin `shellPrecache()` (no new dependency) that, at `closeBundle`, reads the emitted bundle's entry and asset filenames plus `/` and `/sprite.svg`, computes a short hash of that list, and rewrites `dist/sw.js` replacing `'__PRECACHE_MANIFEST__'` with the JSON array and `'__SHELL_VERSION__'` with the hash; add a `preview` block mirroring `server`'s `/api` proxy on port 5200. -- AR-7 "hashed assets"
- `apps/web/src/sw/register.ts` + `register.test.ts` -- `registerServiceWorker(deps: {container?: ServiceWorkerContainer, log?})`: registers `/sw.js` at scope `/` when `navigator.serviceWorker` exists, swallowing every failure; `promoteWaitingShell(registration, backlog: () => Promise<number>)`: posts `{type: 'activate-shell'}` only when `registration.waiting` exists **and** `backlog()` resolves to `0`, returning what it did so the test can assert both branches. No Dexie import here — the backlog getter is injected. -- AD-8 activation rule, 1.8-E2E-005
- `apps/web/src/main.tsx` -- call `registerServiceWorker()` after `createRoot(...).render(...)`. -- AR-7
- `apps/web/src/sw/use-shell-update.ts` -- a hook that, once per mount with a database present, resolves `navigator.serviceWorker.ready` and calls `promoteWaitingShell(reg, () => outboxBacklog(db))`; mounted from `SessionShell` so it only runs for a signed-in user. -- AD-8
- `apps/web/src/state/drafts.tsx` + `drafts.test.tsx` -- `DraftProvider` (inside `ToastProvider`, needs `useToast` and `session.database`): holds a registry of sources; `useDraftSource({surface, entityId, field?, read, apply})` registers and unregisters one; one `visibilitychange` listener (acting only when `document.hidden`) and one `pagehide` listener persist every source whose `read()` differs from its last committed value; on mount, `listDrafts(db)` non-empty shows the persistent toast `copy.draft.foundText` with the action `copy.draft.recoverAction`, whose `onPress` hands the value to the matching mounted source's `apply` and drops the row, and which never writes an entity row itself. Dismissing keeps the row. -- FR-61, 1.8-E2E-001
- `apps/web/src/input/use-field-commit.ts` + test -- `useFieldCommit<T>({commit})` returning a committer built on `createFieldCommitter` whose `commit` awaits the caller's promise, catches a rejection, classifies it with `writeErrorKind(error?.name)` and shows `copy.write.quotaError` or `copy.write.unknownError` as a toast, keeping the value pending for a retry. This is the only place the refused-write toast is raised. -- AD-8, FR-54, 1.8-E2E-003
- `apps/web/src/state/banner-slot.tsx` -- extend `BannerConditions` with `unsyncedForDays: boolean` and `draftFound: boolean` (plus optional `draftAction`), and push the `unsynced-5-days` warning (`copy.banner.unsyncedText`, `role: 'region'`) and the `draft-found` info candidate from `bannerCandidates`, keeping `pickBanner`, the priority order and the "+N" chip untouched. The draft-found *action* stays on the toast; the banner kind exists so the "+N" chip counts the condition. -- AR-27, AD-8
- `apps/web/src/surfaces/app-shell.tsx` -- read `oldestPendingClientTs(db)` through `useLiveQuery`, pass `unsyncedForDays(oldest, now())` and the draft-found flag into `bannerCandidates`; drop `IconSprite`. -- AD-8
- `apps/web/src/surfaces/eviction-recovery-surface.tsx` + test -- a full-surface replacement modelled on `contract-outdated-surface.tsx`: a heading, a sentence naming what the server holds built from `sync.summaryRelatorios.length` and `sync.userNames` through a kernel-free copy function in `src/copy/pt-br.ts`, a primary `.btn` that runs `syncNow()` and then `dismiss()`, and the failure text when the cycle does not run. All strings `// authored:` (no mock exists). -- AR-7, 1.8-E2E-004
- `apps/web/src/state/session.tsx` -- set `recoveryNeeded: true` only on the cold-open branch where `readLastSession()` returned null, the server confirmed a session, and `attachDatabase` reports `createdFresh`; expose it and `dismissRecovery()` on `SessionState`; persist the dismissal in `local_prefs` under a new `RECOVERY_NOTICE_PREF` so it is one-time across reloads. The sign-in-form path never sets it. -- AR-7
- `apps/web/src/app.tsx` -- render `EvictionRecoverySurface` in `SessionShell` when `session.recoveryNeeded` and not `sync.outdated`; mount `DraftProvider` inside `ToastProvider`; add the dev-only fixture route. -- AR-7
- `apps/web/src/surfaces/fixtures/field-fixture-surface.tsx` -- a dev-only surface (`import.meta.env.DEV` guarded at the route level so it is absent from a production build) with one labelled text input bound to `useFieldCommit` committing a `relatorio/{id}/setup/{field}`-shaped op through `commitOps`, registered as a draft source with surface `fixture-field`, plus a visible readout of the committed value. No navigation entry points to it. -- orchestrator's staging rule for "mid-sheet" (no sheet UI before Epic 5)
- `apps/web/src/copy/pt-br.ts` -- add `banner.unsyncedText = 'Alterações sem envio há 5 dias'` (verbatim from the AC), `banner.draftFoundText`, a `draft` block (`foundText: 'Rascunho encontrado'`, `recoverAction: 'Recuperar'`, from `key-sheet-states.html:400`), a `write` block (quota and unknown error toasts) and a `recovery` block for the eviction screen; every invented string carries an `// authored:` note. -- DoD 5
- `apps/api/src/http/app.ts` -- send `Cache-Control: no-cache` for `/sw.js` (and keep every other response unchanged) so a new shell is discovered on the next launch; add a test asserting the header and the `text/javascript` content type. -- AD-8
- `Dockerfile.tools` -- install WebKit beside Chromium on the existing `npx playwright install --with-deps` line, before `USER node`. -- NFR-17
- `playwright.config.ts` -- keep `desktop-chrome` on the dev server with `testIgnore: /durability\.spec\.ts/`; add a second `webServer` that builds the bundle and runs `vite preview --port 5200 --strictPort`, and three projects `durability-desktop-chrome`, `durability-android-chrome` (a Playwright Android Chrome device descriptor) and `durability-webkit`, each `testMatch: /durability\.spec\.ts/` with `baseURL: 'http://localhost:5200'`. Keep `workers: 1`. -- NFR-17
- Root `package.json` -- `test:e2e` becomes `playwright test --grep @p0 --project desktop-chrome --project durability-desktop-chrome`; add `test:e2e:matrix` running the three durability projects with no `--grep`. `verify` is unchanged and never calls the matrix. -- DoD 2
- `e2e/durability.spec.ts` + `e2e/support/durability.ts` -- the five named scenarios, each title prefixed `@p0` and naming its id: `1.8-E2E-001` (type into the fixture field, fire `visibilitychange`, close the page, reopen: every committed op is still in the outbox, the persistent toast offers "Recuperar", the entity row is unchanged until it is pressed), `1.8-E2E-002` (seed pending ops, abort `/api/sync/ops` mid-cycle, restore the route, sync again: every op is `acked` exactly once and the server holds one row per `op_id`, read through `pullAll`), `1.8-E2E-003` (`page.addInitScript` overriding `navigator.storage.estimate` with a low reading and forcing a `QuotaExceededError` on the commit: the error toast is visible and the value is not lost), `1.8-E2E-004` (sign in, delete the device database and the `releng.last-session` pointer with the cookie intact, reload: the recovery screen names what the server holds, the action re-pulls, a second reload does not show it), `1.8-E2E-005` (`page.clock` fixed six days ahead over a seeded old op: the banner reads "Alterações sem envio há 5 dias"; and with a waiting worker the shell is promoted only once the backlog is zero). Support helpers go in `e2e/support/durability.ts`; reuse `seedOutbox`, `readStore`, `pullAll`. -- NFR-17, R-001
- `_bmad-output/test-artifacts/manual/offline-proof-script.md` -- the manual script for Matheus: preconditions (Story 1.7 HTTPS origin, root CA installed), the numbered steps of the AC (sign in, go offline, commit values, close Safari, wait, reopen; leave the tab unused for the eviction window; open the camera from a page), what to record per step, and the platform-line decision the outcome selects (all three browsers, or Android Chrome and desktop only with FR-56 unchanged). Header states **Status: PENDING — not executed; run by Matheus**, and that it repeats at the close of Epics 5, 6 and 8. -- AC 5, TC-12
- `_bmad-output/test-artifacts/manual/ipad-YYYY-MM-DD.template.md` -- the result template with date, device, iPadOS/Android version, per-step outcome, `storage.estimate()` values, screenshot references and the platform-line decision; marked as a template to copy under the dated filename. -- TC-12
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- change only `1-8-nothing-captured-is-lost-when-the-tab-closes-the-network-dro: backlog` to `review`. -- workflow

**Acceptance Criteria:**
- Given the built bundle and an active service worker, when a signed-in user cold-opens the tab with the network down, then the document, the hashed JS and CSS, the Inter woff2 and `/sprite.svg` are served from the shell cache, Home renders from IndexedDB, and no manifest, install prompt, Background Sync registration or `persist()` call exists anywhere in `apps/web` (asserted by a source scan test).
- Given a newer `sw.js` waiting to activate, when the page launches with pending or sent outbox rows, then the waiting worker is not promoted and the old shell keeps serving; when it launches with a backlog of zero, then the page promotes it and the new shell takes over.
- Given a registered draft source holding text that was never committed, when `visibilitychange` or `pagehide` fires, then one `drafts` row is written under `draftKey({surface, entity_id, field})`, and on the next launch a persistent toast offers "Rascunho encontrado — Recuperar" whose action is the only thing that applies the value; dismissing it leaves the row and the toast returns on the following launch.
- Given an outbox whose oldest pending op is more than five days old, when the app boots, then the single banner slot shows the warning "Alterações sem envio há 5 dias" in the spine's priority position, and the "+N" chip counts it when another condition holds at the same time.
- Given a valid session cookie and no local database, when the app boots without going through the sign-in form, then a one-time screen names what the server holds and its action re-pulls; after it is dismissed a reload goes straight to Home.
- Given a write the browser refuses, when it is committed through `useFieldCommit`, then an error toast names the failure, the value stays pending for a retry, and no unhandled promise rejection reaches the console.
- Given the three Playwright projects, when `pnpm test:e2e:matrix` runs, then the three FR-54 scenarios pass by name on desktop Chrome, Android Chrome emulation and WebKit against the built bundle, and `docker compose run --rm tools pnpm verify` stays green, runs `@p0` on desktop Chrome only, and finishes in under 15 minutes.
- Given the manual tablet criterion, when the story is delivered, then `_bmad-output/test-artifacts/manual/` holds the script and the result template, both marked pending and naming Matheus as the executor, and no automated test or document claims the device check ran.

## Spec Change Log

## Review Triage Log

### 2026-09-22 — Review pass

- verdicts: 42 findings — high 3, medium 13, low 18, false 5, maybe-false 3
- findings:
  - `[high]` `[patch]` blind-hunter: a second tab-hide deletes the draft that is still on offer — verified in `state/drafts.tsx` persistAll + `db/drafts.ts` (a source holding the committed value reads null and `saveDraft` drops the offered row). Patched: persistAll never deletes a key in the current offer; `Offer` holds keys only and `recover` re-reads the row, with two new tests.
  - `[medium]` `[patch]` blind-hunter: a competing toast removes "Recuperar" for the rest of the session — verified: one toast slot, offer raised only on `offer` change, `draft-found` banner carries no action. Patched: the offer is re-raised when the slot frees while it stands; new test.
  - `[medium]` `[patch]` blind-hunter: the eviction "one-time" flag is dead code and the screen never returns — verified: `writeLastSession` runs before the gate, so `cached === null` is false on every later boot. Patched with the session-gate fix below.
  - `[low]` `[reject]` blind-hunter: the recovery screen almost never names what the server holds — `summaryRelatorios` is a live query and the engine pulls on launch, so `holdsUnknown` is a sub-second transient, not the normal case; the copy is the honest state before the first pull.
  - `[medium]` `[patch]` blind-hunter: a late rejection resurrects a stale value over a newer committed one — verified in `use-field-commit.ts` (no sequence guard). Patched: attempts are numbered and a superseded rejection is ignored; new test.
  - `[medium]` `[patch]` blind-hunter: `SHELL_VERSION` hashes only filenames, so a sprite-only or index.html-only change ships a byte-identical `sw.js` — verified against the built output. Patched: `dist/index.html` and the copied `public/` files are folded into the digest, checked by mutating `sprite.svg`.
  - `[low]` `[reject]` blind-hunter: nothing reacts to the shell being promoted (no `controllerchange` reload) — the bundle has no dynamic imports, so the running page never fetches a chunk the new build dropped; "activates on the next launch" is what AD-8 asks for, and a reload handler adds a loop risk for no reachable harm.
  - `[low]` `[reject]` blind-hunter: the navigation handler is network-first with no timeout, so lie-fi hangs — the AC and the I/O matrix are written for offline, where the fetch rejects at once; a timeout race is a new branch for a condition the intent does not cover.
  - `[medium]` `[patch]` blind-hunter: the manual script's steps 3-4 cannot be executed on the build its own precondition names — verified (no sheet before Epic 5; the fixture is `import.meta.env.DEV`-gated). Patched: precondition 4 names `build:e2e`, steps 3-4 name `/__fixture/field` and ask for an uncommitted value.
  - `[low]` `[patch]` blind-hunter: the script's gate/seven-day wait have no partial-result path and the template mismatches it — verified. Patched: a "Filing a partial run" section, a Status field, per-step dates, a row for step 8, and one `ipad-YYYY-MM-DD.md` per TC-12.
  - `[medium]` `[patch]` blind-hunter: nothing guards the fixture's absence from a production build — verified (only a source scan for PWA APIs existed). Patched: `fixture-route.test.ts` pins the module-scope `import.meta.env.DEV` branch and the absence of any other reference.
  - `[medium]` `[patch]` blind-hunter: the theme mirror key and `themeAttribute` are duplicated into `index.html` with no drift guard — verified. Patched together with the verification-gap finding below.
  - `[medium]` `[patch]` blind-hunter: 1.8-E2E-005 ends on an un-awaited negative assertion — verified: the gate is asynchronous and the assertion could pass vacuously. Patched: `installWaitingShell` counts reads of `serviceWorker.ready` and the test polls that first; mutation-checked.
  - `[false]` `[reject]` blind-hunter: the precache takes every emitted asset rather than AD-8's four — the emitted set *is* "hashed assets, the Inter woff2"; `/` and `/sprite.svg` are added explicitly and `/api` is excluded. No bad outcome.
  - `[low]` `[reject]` blind-hunter: external `<use>` on WebKit is never asserted — the icons are `aria-hidden` decoration, the sprite is same-origin and precached, and the matrix renders Home on WebKit; a rendering assertion for an SVG symbol is more than a direct correction.
  - `[high]` `[patch]` edge-case: a failed pull still returns `'ran'`, so the screen is dismissed forever with nothing downloaded — verified at `sync/engine.ts:244-253` (PhaseEnd swallowed into `lastFailure`). Patched: `SyncState` exposes `lastFailure` and the surface dismisses only on a clean cycle; two new tests.
  - `[medium]` `[patch]` edge-case: the recovery flag is persisted in the store that was just created, so it can never be read back — same root cause as the gate finding; patched by making `recovery_notice` (`pending`/`dismissed`) the real gate, read on every boot.
  - `[medium]` `[patch]` edge-case: a synchronous throw from `immediate()` drops the refused value — verified (`createFieldCommitter.immediate` never re-queues). Patched: the synchronous catch sets `refused.current`; new test.
  - `[high]` `[patch]` edge-case: one precache URL failing leaves a partial cache while `activate` deletes the old one — verified in `public/sw.js` install. Patched: install is all-or-nothing and deletes its partial cache before rethrowing.
  - `[low]` `[reject]` edge-case: "Recuperar" with no mounted source repeats the same toast with no explanation — only reachable while the fixture is the single source; the fix adds a branch and a new authored string for a state Epic 5 removes.
  - `[maybe-false]` `[defer]` edge-case: sequential awaited Dexie writes on `pagehide` may not commit before an iOS tab discard — the pattern is real but whether iOS drops it cannot be decided without the device; it is step 4 of the pending manual script. Deferred at medium (unverified).
  - `[medium]` `[patch]` edge-case: another toast replaces the draft offer — duplicate of the blind-hunter finding above; same patch.
  - `[medium]` `[patch]` edge-case: a late rejection re-commits a stale value — duplicate of the blind-hunter race finding; same patch.
  - `[medium]` `[patch]` edge-case: `'busy'` is reported as a failure while the launch cycle is downloading — verified. Patched: `'busy'` returns without dismissing or showing the failure text; new test.
  - `[low]` `[reject]` edge-case: removing the inline sprite leaves icons blank when `/sprite.svg` is not cached and the network is down — the sprite is in the precache list and installs all-or-nothing, so the only window is before the first install, where nothing else works either.
  - `[medium]` `[patch]` edge-case (claim): the `local_prefs` flag is not what makes the screen one-time — verified true; patched with the gate fix.
  - `[false]` `[reject]` edge-case (claim): the documented dismiss path does not exist in-session — the mock (`key-sheet-states.html:400`) draws no close control, so "dismissing" is the toast going away by any means and the row survives in every one of them; the re-raise patch removes the only case where it could not come back.
  - `[high]` `[patch]` edge-case (claim): a cycle whose phases failed is indistinguishable from a successful one — verified; same patch as the dismiss-on-failure finding.
  - `[medium]` `[patch]` verification-gap: the one-time flag is never exercised and 1.8-E2E-004's assertion passes for another reason — filed pre-verified. Patched: the flag is the gate, with four `prefs.test.ts` cases including reopen-while-pending.
  - `[medium]` `[patch]` verification-gap: nothing runs the `index.html` boot script — filed pre-verified. Patched: `theme-boot.test.ts` runs the extracted script in jsdom against every stored value and compares with `themeAttribute`; mutation-checked.
  - `[low]` `[patch]` verification-gap (other): `readThemeMirror` is tested but unused while the shipped copy is untested — same root cause as the boot-script gap; the new test covers the shipped copy.
  - `[medium]` `[patch]` verification-gap (other): the screen can be lost without being acted on — verified; the `recovery_notice` gate now survives a reload made before the action.
  - `[low]` `[reject]` intent-alignment 3.1: the durability tests run the `build:e2e` bundle, not the production one — the two differ only in the dev-only fixture and minification; the precache path is identical, and testing the production bundle would remove the surface the scenarios drive.
  - `[low]` `[reject]` intent-alignment 3.2: `/sw.js` cache headers are verified at the api and never in the e2e path — the header is tested where it is produced (`app.test.ts`), and `vite preview` is not the production server.
  - `[medium]` `[defer]` intent-alignment 3.3: the matrix signs in over plain http with a non-`Secure` cookie — already in `deferred`; the HTTPS origin is Story 1.7's and the manual script's.
  - `[low]` `[defer]` intent-alignment 3.4: the fixture is the only draft source and the only `useFieldCommit` caller — already in `deferred`; Epic 5 registers real sources.
  - `[medium]` `[defer]` intent-alignment 3.5: the SW and the three scenarios never coexist, and the WebKit offline reopen is annotated out — already in `deferred` with the Playwright limitation and the manual coverage.
  - `[medium]` `[defer]` intent-alignment 3.6: the AC names a mocked `storage.estimate` but the assertion rides on `QuotaExceededError` — the estimate mock is installed and the 500 MB banner it would feed is deferred with the provisional threshold; already recorded.
  - `[medium]` `[patch]` intent-alignment 3.7: the eviction condition is narrower than "database absent" — verified; patched by dropping the `cached === null` half.
  - `[low]` `[reject]` intent-alignment 3.8: `verify` runs two projects and a build, not literally "desktop Chrome only" — both projects are desktop Chrome, the build is 0.8 s and the gate finished in 238 s against a 15-minute budget.
  - `[false]` `[reject]` intent-alignment 3.9: the theme boot work sits outside the handed-off set — Story 1.6's `deferred` entry names Story 1.8's boot work as its owner, so it is handed off.
  - `[false]` `[reject]` intent-alignment 3.10: `oldestPendingClientTs` was widened to `sent` — the I/O matrix says so and a sent-but-unanswered op is unsynced work; reasoned in Implementation Notes and covered by an updated test.
  - `[false]` `[reject]` intent-alignment 3.5b: the activation rule is asserted against a stub and the worker half by regex — the page half is the rule AD-8 states (a worker cannot read the user's database), both branches are unit-tested, and 1.8-E2E-005 drives the real `promoteWaitingShell` over the real `outboxBacklog`.

## Design Notes

**The shell is precached from the real build, so the durability scenarios run against `vite preview`, not the dev server.** Under `vite dev` the document references `/src/main.tsx` and an unbounded module graph, so precaching `/` there would produce a shell that cannot boot offline — the test would assert a lie. The second `webServer` builds the bundle and previews it on 5200 with the same `/api` proxy, and the three durability projects point their `baseURL` at it. The existing suites stay on the dev server on 5199 so nothing already merged changes shape. The build is the only new cost in `pnpm verify`; measure it and record the number in Implementation Notes.

**The precache list is stamped into `dist/sw.js` at `closeBundle`, not generated at runtime.** Vite copies `public/sw.js` verbatim, so the plugin rewrites the copy in `dist/` after the bundle is emitted, replacing two quoted tokens. A file that still carries the token is the dev copy, and the worker detects that by `typeof PRECACHE === 'string'` and falls back to `['/', '/sprite.svg']`, which keeps the dev server usable without a second code path. The cache name carries the hash of the list, so a new build is a new cache and the old one is deleted on activate — no manual version bump to forget.

**Activation is gated in the page, not in the worker.** A worker cannot read the user's Dexie database (it is per-user and opened by the page), and AD-8's rule is about the user's pending work, not about the worker's lifecycle. So `install` deliberately omits `skipWaiting()`, the page resolves `navigator.serviceWorker.ready`, counts the backlog through the `status` index and posts one message when it is zero. "On the next launch" falls out of this for free: a worker that waits through a session is promoted by the first launch that finds an empty outbox.

**The sprite becomes a real file because the AC precaches it.** It is inline JSX today, which makes "precaches the SVG icon sprite" unsatisfiable as written — an inline sprite is already inside the hashed JS. Moving the four symbols to `public/sprite.svg` and switching to `<use href="/sprite.svg#id">` gives the worker something to cache, keeps the markup the mocks use, and is same-origin so WebKit resolves it. A unit test pins the referenced ids against the file so a new icon cannot be referenced without being added.

**"Mid-sheet" is staged on a dev-only fixture route.** No sheet, dialog or field surface exists before Epic 5, and inventing one would be product scope this story does not own. The fixture route mounts one input on the existing `createFieldCommitter` → `commitOps` path and registers one draft source, which is exactly the machinery the three scenarios must exercise; it is guarded by `import.meta.env.DEV` so it is tree-shaken out of the production bundle and has no navigation entry. Epic 5 replaces it with real surfaces by registering their own draft sources.

**Draft-found is a toast, not a banner, and the mock that says otherwise is stale.** `prototype/screens/60-ficha.html:207` renders the condition as a dismissible banner with "Recuperar / Agora não", while EXPERIENCE.md:368, MOCK-GUIDE.md:70, `key-sheet-states.html:400` and the story's own AC all say a persistent toast. The toast wins. The `draft-found` banner *kind* still gains a candidate so the "+N" chip counts the condition when something of higher priority holds the slot — that is what the seven-kind priority is for — but its text carries no action.

**The eviction signal is "the boot path resolved a session and the store was born now".** A genuine first sign-in always goes through the form, so the recovery screen can never fire on it. The cold-open branch that finds no `releng.last-session` pointer yet a live cookie is exactly AD-8's "session cookie present, database absent"; `AppDatabase.createdFresh`, set from the existing `populate` hook, is the durable way to observe it without probing `indexedDB.databases()`, which WebKit implements inconsistently. The one-time flag lives in `local_prefs`, so an evicted origin legitimately sees the screen again — which is the correct behavior, not a bug.

**The refused-write toast lives at the commit site, not in the store.** `commitOps` is a Dexie helper and `createFieldCommitter` is a pure controller with injected timers; neither may import a toast. `useFieldCommit` is the seam: it awaits the commit promise the controller does not await, catches the rejection, asks the kernel what kind of failure it was, and raises the toast — which also closes Story 1.4's unobserved-rejection gap for every later caller.

**The 500 MB banner is deliberately not published.** AD-8 marks the threshold `[ASSUMPTION]` and the spine says the number is set after the iPadOS test, which is this story's manual script and has not run. Publishing a banner on a number that the story itself is meant to calibrate would bake in a guess; the kernel check and the free-space reading ship and are unit-tested, so Epic 6 publishes it in one candidate once Matheus returns a number. Recorded in `deferred`.

## Implementation Notes

**The build's cost in `pnpm verify`, measured.** The second `webServer` builds the bundle
before `vite preview` comes up. The development-mode build takes **~1 s** of the run
(1655 modules; the production build is the same), and the whole `docker compose run --rm
tools pnpm verify` finished in **238 s** wall clock — lint, static, 581 unit tests, 54 api
tests and 21 Playwright `@p0` tests on `desktop-chrome` plus `durability-desktop-chrome`.
The 15-minute budget is not close to being at risk; the build is noise next to the suites.

**The e2e bundle is built in development mode.** `vite build --mode development` alone
still sets `import.meta.env.DEV` to false, because Vite pins `NODE_ENV=production` for a
build whatever the mode says, so the dev-only fixture route was tree-shaken out of the very
bundle the scenarios drive. `apps/web` therefore has `build:e2e` =
`NODE_ENV=development vite build --mode development`; `build`, which the `prod` profile and
`api-prod` run, is unchanged and its output carries no `__fixture/field` (checked against
both outputs).

**The `SHELL_VERSION` sentinel is not `typeof`.** The stamped value is a hash string, so
`typeof SHELL_VERSION === 'string'` is true both before and after the build and every cache
would have been named `releng-shell-dev`. The worker tests the token's own underscores
instead (`SHELL_VERSION.startsWith('__')`); `PRECACHE` keeps the `typeof` check, because a
stamped precache list is an array.

**`SHELL_VERSION` hashes content, not just filenames.** `/` and `/sprite.svg` are fixed
strings in the precache list and `public/` files are not content-hashed into their names,
so hashing the list alone made a sprite-only or `index.html`-only change produce a
byte-identical `dist/sw.js`: no update found, no new worker, the stale sprite served
cache-first forever. The plugin now folds `dist/index.html` and every copied `public/` file
except `sw.js` itself into the digest. Verified: appending a comment to `sprite.svg` moves
the hash, reverting it moves it back.

**The one-time eviction screen is durable, not a single launch.** `AppDatabase.createdFresh`
is true for exactly one open, so a reload made before the user pressed the action would have
lost the screen and the explanation with it. The fresh open records `recovery_notice =
pending` in `local_prefs`, every boot reads it, and the action records `dismissed` — which
is what makes `RECOVERY_NOTICE_PREF` load-bearing instead of dead. The gate itself is now
`createdFresh` alone: AD-8 says "session cookie present, database absent", and the earlier
`cached === null &&` half made it depend on the `localStorage` pointer, so an eviction that
took IndexedDB and left `localStorage` showed nothing.

**A shell precache is all or nothing.** `install` lets a failed URL fail the install and
throws the partial cache away, rather than swallowing it per URL: a cached `/` whose hashed
JS is missing boots into an empty page offline, which is worse than no cache at all. The
previously installed worker keeps serving until the next attempt.

**`oldestPendingClientTs` now reads `pending` and `sent`.** The I/O matrix says so, and it
is the honest input for the 5-day check: an op that was sent and never answered is still
unsynced work. `dead` and `acked` stay excluded, so "dead ops only" still shows no banner.

## Verification

**Commands:**
- `docker compose build tools` -- expected: the image rebuilds with WebKit beside Chromium (this is the one slow step; run it before anything else)
- `docker compose up -d --build` -- expected: postgres, minio, api and web healthy (project `fasor-s18`, api on 48000, web on 48173)
- `docker compose run --rm tools pnpm lint` -- expected: clean, including the new `apps/web/public/*.js` block with service-worker globals
- `docker compose run --rm tools pnpm static` -- expected: clean (`e2e/**` and the new config blocks typecheck)
- `docker compose run --rm tools pnpm test:unit` -- expected: domain (draft key round trip, write-error kinds, storage check) and web (drafts store, register/promote both branches, draft provider, field-commit toast, banner candidates, eviction surface, sprite ids, styles unchanged) green
- `docker compose run --rm tools pnpm test:api` -- expected: green, including the new `/sw.js` header test
- `docker compose run --rm tools pnpm verify` -- expected: green, `@p0` on `desktop-chrome` plus `durability-desktop-chrome` only, under 15 minutes, output kept for the PR
- `docker compose run --rm tools pnpm test:e2e:matrix` -- expected: the five named scenarios green on `durability-desktop-chrome`, `durability-android-chrome` and `durability-webkit`; output kept for the PR

**Manual checks (if no CLI):**
- `_bmad-output/test-artifacts/manual/` holds the script and the template, both stating the device check has not been executed; no PR sentence or test name claims otherwise.

## Auto Run Result

Status: done

**Summary.** The offline vehicle of AD-8/AR-7 ships end to end. `apps/web/public/sw.js` precaches the built shell only — `/`, the hashed JS and CSS, the self-hosted Inter woff2 and `/sprite.svg` — with a Vite `shellPrecache()` plugin that stamps the emitted list and a content digest into `dist/sw.js` at `closeBundle`; `install` is all-or-nothing and never promotes itself, and the page promotes a waiting worker only on a launch where the outbox backlog is zero. Uncommitted field text and dialog state are persisted to the per-user `drafts` table from one `visibilitychange`/`pagehide` listener over registered draft sources, offered back through the persistent toast "Rascunho encontrado — Recuperar", and never applied silently. The two banner kinds Story 1.6 declared now have publishers: "Alterações sem envio há 5 dias" from the kernel's `unsyncedForDays`, and `draft-found` so the "+N" chip counts the condition. An evicted origin (cookie alive, database absent) gets a one-time recovery screen that names what the server holds and re-pulls. A write the browser refuses raises an error toast through `useFieldCommit` instead of an unobserved rejection. The three FR-54 scenarios exist by name in `e2e/durability.spec.ts` and run on three Playwright projects against the built bundle, and the manual iPad and Android script is written for Matheus and marked pending.

**Files changed.**
- `packages/domain/src/drafts/key.ts`, `src/checks/write-error.ts`, `src/checks/storage.ts` (+ tests, barrelled) -- the draft key, the refused-write classification and the storage-headroom check, all pure
- `apps/web/public/sw.js`, `apps/web/public/sprite.svg` -- the precache-only worker and the sprite as a precachable file
- `apps/web/vite.config.ts` -- the `shellPrecache()` plugin and the `preview` block on 5200
- `apps/web/src/sw/{register,use-shell-update}.ts` (+ `register.test.ts`, `offline-vehicle.test.ts`) -- registration, the outbox-empty activation gate, and the source scan proving no manifest, install prompt, Background Sync or `persist()`
- `apps/web/src/db/{schema,drafts,prefs,sync-store,commit}.ts` (+ tests) -- Dexie v4 with the `[surface+entity_id]` index, `createdFresh`, the draft store, the theme mirror, `recovery_notice`, `outboxBacklog`, `oldestPendingClientTs` over pending and sent
- `apps/web/src/state/{drafts,session,sync,banner-slot}.tsx` (+ tests) -- the draft provider and `useDraftSource`, the eviction gate, `lastFailure`, the two new banner candidates
- `apps/web/src/input/use-field-commit.ts` (+ test) -- the refused-write toast, the attempt counter and the retained value
- `apps/web/src/surfaces/{eviction-recovery-surface,app-shell,fixtures/field-fixture-surface}.tsx`, `src/app.tsx`, `src/copy/pt-br.ts`, `index.html` -- the recovery screen, the banner wiring, the dev-only field fixture, the copy, the pre-paint theme script
- `apps/web/src/state/theme-boot.test.ts`, `src/styles/sprite.test.ts`, `src/surfaces/fixtures/fixture-route.test.ts` -- the boot script run in jsdom against `themeAttribute`, the sprite ids, and the guard that the fixture cannot reach a production bundle
- `apps/api/src/http/app.ts` (+ test) -- `Cache-Control: no-cache` for `/sw.js` only
- `Dockerfile.tools`, `playwright.config.ts`, `package.json`, `e2e/durability.spec.ts`, `e2e/support/durability.ts` -- WebKit in the image, the preview `webServer` and the three durability projects, `test:e2e:matrix`, the five named scenarios and their helpers
- `_bmad-output/test-artifacts/manual/{offline-proof-script,ipad-YYYY-MM-DD.template}.md` -- the manual script and the result template, both headed PENDING

**Review findings.** 42 findings across four layers: 3 high, 13 medium, 18 low, 5 false, 3 maybe-false. 11 entries were patched (3 high, 7 medium, 1 low): the draft deleted on a second tab-hide, the partial shell precache, the recovery screen dismissed on a failed pull, the eviction gate and its one-time flag, the offer lost to a competing toast, the refused-value race and the synchronous-throw hole in `useFieldCommit`, `SHELL_VERSION` ignoring content-only changes, the untested boot script, the vacuous activation assertion, the unguarded fixture route, and the manual script and template. 5 entries were deferred (the `pagehide` sequential writes at medium unverified, plus the four intent-alignment divergences already recorded: the http sign-in helper, the fixture as the only draft source, the service worker disabled in two scenarios with the WebKit offline reopen annotated out, and the inert `storage.estimate` mock behind the unpublished 500 MB banner). Rejected findings and their reasons are in the triage log above: the recovery screen's transient `holdsUnknown` (a live query fills it), the missing `controllerchange` reload (no dynamic imports, so nothing 404s), the lie-fi navigation timeout (outside the AC's "offline"), "Recuperar" with no mounted source (Epic 5 removes it), the blank-icon window (the sprite is precached all-or-nothing), the whole-bundle precache (that is what "hashed assets" means), the untested WebKit `<use>` (decorative, aria-hidden), the `build:e2e` bundle and the api-side `/sw.js` header (tested where each is produced), `verify` running two desktop-Chrome projects (238 s against a 15-minute budget), and the three false claims about the dismiss path, the theme hand-off and `oldestPendingClientTs`.

**Follow-up review recommended: true.** Patched by verdict: high 3, medium 7, low 1. The named unverified risk is the eviction gate: the patch changed product behaviour the spec did not spell out — `recovery_notice` in `local_prefs` is now the gate rather than the `releng.last-session` pointer, so a reload made before pressing "Baixar do servidor" shows the screen again, and an eviction that takes IndexedDB while leaving `localStorage` is now caught. Both read correct against AD-8's "session cookie present, database absent" and its "one-time screen", and `1.8-E2E-004` plus four `prefs.test.ts` cases cover them, but no test exercises the eviction shape where `localStorage` survives, and that reading was a judgement call rather than transcription.

**Verification performed.** All inside Docker, project `fasor-s18`: `docker compose build tools` (WebKit added beside Chromium), `docker compose up -d --build` (postgres, minio, api, web, caddy healthy), then `docker compose run --rm tools pnpm verify` green — lint, static, 581 unit tests (domain 273, web 295, scripts 13), 54 api tests and 21 Playwright `@p0` on `desktop-chrome` plus `durability-desktop-chrome` — in **238 s**, well inside the 15-minute gate. `docker compose run --rm tools pnpm test:e2e:matrix` green, **18 passed**, the six named scenarios on desktop Chrome, Android Chrome emulation and WebKit. Every I/O matrix row is covered by a test that ran and passed. Manual check: `_bmad-output/test-artifacts/manual/` holds the script and the template, both headed PENDING with Matheus named as the executor, and no test name or document sentence claims the device check ran.

**Residual risks.** The manual iPad and Android proof — the PRD Q0 gate that selects the slice's platform line — has not been run; until it does, AD-8's 500 MB storage-low threshold stays provisional and its banner unpublished. On the WebKit project the offline reopen is annotated `not-covered-here` because Playwright's WebKit cuts the network below the service worker, and two scenarios run with the worker disabled for the same class of reason, so Safari's offline cold open rests on that manual script. The durability projects sign in over plain http with the `Secure` attribute stripped from the session cookie, which is a harness shape, not a product change; Story 1.7's HTTPS origin is where a real device runs. `useDraftSource` and `useFieldCommit` have one caller each — the dev-only fixture — so Epic 5's surfaces are the first real exercise of both.
