# Epic 1 code review (opus)

Reviewer: opus, one of three independent reviewers (fable, sonnet, opus). Scope: everything Epic 1 delivered on `main` at `00de851` (PRs #1 to #8). Read-only; the only commands run against the stack were `docker compose run --rm tools pnpm lint`, `pnpm static` and `pnpm test:unit` (three runs), plus `git`, `gh pr view` and `docker image ls`.

## Executive summary

1. The core invariants hold: one reducer (`packages/domain/src/ops/apply.ts:245`) used by Dexie (`apps/web/src/db/commit.ts:54`) and Drizzle (`apps/api/src/sync/apply.ts:156`), a replay golden, and per-op push atomicity with origin, tenant and dedupe checks (`apps/api/src/sync/apply.ts:50-73,132-141`).
2. Lint rules for `fetch` and Dexie boundaries and the import direction are real and tested (`eslint.config.js:94-114`, `scripts/tooling.test.ts:17-59`). The kernel imports only zod (grep, test files aside).
3. The biggest defect is a seam between Story 1.3 and Story 1.4: identity user ids are text slugs (`apps/api/src/db/seed.ts:38-40`), while the kernel `user` entity and every user reference expect uuidv7 (`packages/domain/src/schemas/entities.ts:141-147,184`, `ops/path.ts:123`). No user row ever reaches a device, so Sync status shows raw ids and `user/{id}/{field}` ops cannot address a real user.
4. The service worker's "hold-shell" flag, added by the PR #8 independent review, lives only in worker memory (`apps/web/public/sw.js:37,119`). When the browser stops an idle worker the flag is lost, and the next launch navigates network-first, which is the version flip the patch was meant to stop.
5. `epic-1: done` is recorded while the PRD Q0 manual proof, which gates Epics 5 and 6 and chooses the slice's platform line, is still PENDING (`_bmad-output/test-artifacts/manual/offline-proof-script.md:3`).
6. Seven of the 13 Story 1.2 shared components have no production caller. Surfaces hand-roll dialogs and a radiogroup with no arrow keys (`apps/web/src/surfaces/account/registration-dialog.tsx:103-118`), which is the same bug class as the PR #7 high finding. The shared `ConfirmDialog` claims `aria-modal` but never sets it (`apps/web/src/components/confirm-dialog.tsx:20-49`).
7. AD-2 leaks in small ways: status words are defined twice (`copy/ui.ts:26-31` and `domain/src/status/table.ts:16`), plurals and counts are built in `apps/web` (`copy/pt-br.ts:139,142,185`, `eviction-recovery-surface.tsx:26-27`, `state/banner-slot.tsx:134`).
8. The merge gate is fast (238 s in PR #8) but not deterministic. Two of my three unit runs failed on 5 s timeouts in different files (web `overflow-menu.test.tsx`, then `scripts/tooling.test.ts`), and the third was green. `test:unit` also writes to the database (`scripts/tooling.test.ts:91`), and every e2e test is tagged `@p0`.
9. The review process caught real bugs at every layer. The independent pass still found one high issue per UI story that the 4-layer internal review had patched wrongly or missed. PR #1 had no independent review.
10. Verdict: a solid foundation, fit to start Epic 2 after four small blockers: the user identity decision, `device_id` in `CommitDeps`, running the manual iPad proof, and an AGENTS.md refresh plus a gate-flakiness fix.

## 1. Acceptance criteria and NFR conformance per story

Legend: MET, PARTIAL, DEFERRED (met only by a recorded deferral), UNMET.

### Story 1.1 Run the whole stack with one command

- `docker compose up` starts web, api, postgres:18, minio; health `{status, db, queue, storage, libreoffice}`: MET (`docker-compose.yml:36-117`, `apps/api/src/http/health.ts`). The clean-boot matrix row is covered by `apps/api/src/boot.integration.test.ts`.
- Import-direction lint and the `fetch` rule: MET (`eslint.config.js:44-104`, `scripts/tooling.test.ts:17-46`).
- Config fails fast and names the variable: MET (`apps/api/src/config.ts:190-211`, `config.test.ts`).
- One `PRODUTO` constant; tokens and components CSS byte-identical; Inter self-hosted: MET (`packages/domain/src/product.ts`, `apps/web/src/styles/styles.test.ts`, `apps/web/src/styles/fonts/inter-latin-wght-normal.woff2`).
- `pnpm verify` under 15 min, named in AGENTS.md: PARTIAL. Verify exists and ran in 238 s (PR #8 body). AGENTS.md "Running and verifying" still says "TODO until Story 1.1 lands" and cites `pnpm test`, a script that does not exist (`AGENTS.md:30`, `package.json:9-21`). `test-design-qa.md:449` also puts `pnpm audit` and kernel coverage floors in verify; neither exists (`package.json:21`), a deliberate narrowing recorded in `spec-1-1` Design Notes.
- Compose-only reset script: PARTIAL. `scripts/test-reset.ts:11` still guesses `files, revisions, generation_jobs, reading_runs`, skips `sync_device_push`, and no suite calls it: the real reset is `resetTestCompanyData` (`apps/api/src/db/seed.ts:172-179`), which has no compose guard. That makes two reset mechanisms.

### Story 1.2 Shared components

- Tokens resolve by `data-theme`, dark amber contrast of at least 4.5:1: MET for base tokens. The independent review noted that jsdom does not resolve the `var()` alias chain (PR #4 comment).
- Hit area 48/56 px, 14 px floor: DEFERRED (checked on tokens and class names only; `spec-1-2` deferred #2).
- `aria-disabled` plus reason for disabled controls: MET for Button, TextButton, Combobox (`components/button.tsx:47-60`). The Combobox fix came from the independent review (PR #4, "Alto").
- Toggle, Checkbox and grouped FilterChip on-state: DEFERRED. The fill never engages (`spec-1-2` deferred #1). SegmentedControl was fixed in 1.6. None of the three has a production caller yet.
- Confirm dialog `role="dialog"` plus `aria-modal`: PARTIAL. `confirm-dialog.tsx:20-21` documents `aria-modal="true"`, but the `Dialog` at `:44-49` never sets it; the surfaces needed a separate `useAriaModal` hook (`surfaces/use-aria-modal.ts:9-15`). No test asserts it (`grep aria-modal components/*.test.tsx` is empty).
- One shared input layer sets `touch-action` and press-and-hold: PARTIAL. `src/input/touch-action.ts` and `use-press-and-hold.ts` exist and are unit-tested, but nothing outside tests imports them.
- Strings from one pt-BR copy module: PARTIAL. There are two modules (`copy/ui.ts`, `copy/pt-br.ts`) plus kernel texts; see section 3.

### Story 1.3 Sign in and hold a session offline

- `company` and `user` with `company_id`; repositories take a branded `CompanyId`: MET for `db/repositories/*` (`company-id.ts:7-19`). Not applied to `sync/apply.ts:172-176` or `sync/snapshot.ts:15`, which take `string` (see section 2).
- Seed CLI and no signup: MET (`auth/auth.ts:227`; live-verified in the PR #5 review).
- Cookie httpOnly, `SameSite=Lax`, `Secure`, 30-day sliding: MET (`auth/auth.ts:191-236`). Sliding is asserted as a constant only (triage log).
- Offline login state with `aria-disabled` Entrar: MET (1.3-E2E-001b).
- Session continues offline; a 401 raises re-auth with data intact: MET in session. At boot, a 401 also clears the `releng.last-session` pointer (`state/session.tsx:281-290`), so the next offline cold open lands on Login and the local database becomes unreachable until there is signal. This is a second, inconsistent 401 path; see section 5.
- Registro profissional Form dialog: MET, but hand-rolled (see section 3). Saved through REST, not ops: DEFERRED (`spec-1-3` deferred #2).
- Cross-tenant test: MET for the routes that exist (1.3-API-002, 1.5-API-004 "pull de B nao ve nada de A"). Extension: DEFERRED.
- `--test` seeds two companies: MET.

### Story 1.4 Ops applied locally first

- `Op` schema and `OpPath` union, `parsePath`/`formatPath` round trip: MET (`ops/op.ts:27-103`, `ops/path.ts`, `path.test.ts`).
- `applyOp` semantics and derived columns: MET (`ops/apply.ts:245-268`, `76-83`).
- Dexie stores, append-only versions with `upgrade()`, one transaction per commit: MET (`db/schema.ts:108-151`, `db/commit.ts:85-89`). Upgrade tests are pairwise v1 to v2, v2 to v3, v3 to v4 (`db/schema.test.ts:22,41,82`); there is no direct v1-to-latest test.
- Coalescing rule: MET (`ops/outbox.ts:128-138`, `commit.ts:60-74`).
- Batch and undo: MET (`commit.ts:92-111`).
- Replay byte-equality across Dexie and Drizzle: MET on the small fixture, transitively through a committed golden (`fixtures/replay-small/snapshot.golden.json`, `apps/api/src/sync/replay.integration.test.ts`). Porto Seguro: DEFERRED to 3.7.
- Injectable `now` and `newId`: MET (`clock.ts`, `ids.ts`, determinism source scan).

### Story 1.5 Sync

- Push contract, per-op atomicity, rejection codes only for shape, origin and tenant: MET (`sync/apply.ts:50-73`, `sync.integration.test.ts`, 22 live probes in the PR #6 review). The tenant-scoped dedupe came from the independent review.
- Streams, 404, 426 on pull only: MET (`sync/routes.ts:295-322`, `sync/pull.ts:55-78`).
- Rebase, dead-op exclusion, Reenviar, cross-stream dedupe: MET, through one function (`ops/materialize.ts:222-228`, `db/sync-store.ts:193-241`).
- Engine triggers, retry table, `sync_state`: MET (`sync/engine.ts:232-324`, `sync/policy.ts:336-343`).
- `last_push_at` per user and device: MET on the server. On the client, "Este aparelho" is unreliable until committed ops carry the minted device id (DEFERRED). The fixture even falls back to the user id as device id (`surfaces/fixtures/field-fixture-surface.tsx:58`).
- Summary `progress`: DEFERRED.
- Contract examples per route: MET (`contract/examples.ts`, used by `sync/client.test.ts`).

### Story 1.6 Home and Account

- Status table in the kernel, sole decider, no emitter yet: MET (`status/table.ts`).
- App bar, four tiles with live counts, `aria-pressed` filter: MET.
- Shortcut cards "open Templates and Registries": PARTIAL by design. They render `aria-disabled` because no destination exists (Design Notes). The same applies to Continuar, Ver sumário and Novo relatório.
- Card lines and device availability: PARTIAL. "Baixando… n de m" and the progress counter are DEFERRED (need `progress`).
- Auto-pull of Rascunho and Em campo; Em revisão and Emitido on open: MET (`sync/engine.ts:210-230,289-293`).
- Badge words, live region, banner priority, Toast: MET. `syncCounts(snapshot, outbox)` keeps its `(outbox)` signature: DEFERRED.
- Account Tema, storage, no Instalar: MET. The Tema keyboard path was fixed by the independent review (PR #7, "Alto").
- Offline cold-open toast once: MET (1.6-E2E-003).

### Story 1.7 HTTPS from a tablet

- Caddy plus mkcert over one origin, no CORS: MET (`docker/caddy/Caddyfile`, `docker-compose.yml:93-118`). Ports were parametrized by the independent review.
- `prod` profile, migrate before api, JSON logs: MET (`docker-compose.yml:124-161`, `apps/api/src/log.ts`).
- Manual sign-in on iPad and Android: UNMET (manual, not run; documented in `docs/tablet-https-setup.md`).
- Image tagged per commit: DEFERRED. The tag's content does not vary by commit because the image has no COPY of source (`spec-1-7` deferred #1).

### Story 1.8 Nothing captured is lost

- Shell-only precache, no manifest, no Background Sync, no `persist()`: MET (`public/sw.js`, `src/sw/offline-vehicle.test.ts`).
- New shell only when the outbox is empty: PARTIAL. The promote gate is correct (`sw/register.ts:241-251`). The hold half is volatile (see section 5) and promotion can happen mid-session, not only "on the next launch" (`sw/use-shell-update.ts:281-298` reacts to a live backlog query).
- Drafts on `visibilitychange`/`pagehide`, offered and never applied silently: MET for the only source that exists, the dev fixture (`state/drafts.tsx`). Real sources: DEFERRED to Epic 5.
- 5-day banner and eviction screen: MET (`surfaces/app-shell.tsx`, `state/session.tsx:293-311`). The eviction screen's "what the server holds" always reports 0 users (see section 3).
- Three FR-54 scenarios on three projects: PARTIAL. On WebKit the offline reopen is annotated `not-covered-here`; E2E-002 and E2E-005 run with the SW disabled; scenario 2 covers ops only (all DEFERRED, `spec-1-8` deferred).
- Error toast on a refused write: MET (`input/use-field-commit.ts`, 1.8-E2E-003).
- Storage-low banner (AD-8): DEFERRED (kernel check exists, no publisher).
- Manual iPad and Android proof recorded: UNMET (script and template only, PENDING).

NFRs: NFR-18 (containers, env config) MET; NFR-13 (tenant isolation) MET for existing routes; NFR-4 accessibility PARTIAL (the axe gallery is green, but the hand-rolled radiogroup and the shared dialog without `aria-modal` escape it); NFR-9 offline PARTIAL until the device proof runs; NFR-17 durability PARTIAL (WebKit gaps).

## 2. Architecture conformance

- AD-1: `fetch` appears only in `src/sync/client.ts` and `src/api/auth-client.ts` (lint rule `eslint.config.js:94-99`). UI reads go through `db/live.ts`. One deviation: Account identity rows render from `session.user`, a localStorage-cached profile (`state/last-session.ts`), not from IndexedDB. That is acceptable only while identity sits outside the op log.
- AD-2 / AR-2: mostly honoured (`home/cards.ts`, `sync/counts.ts`, `device/storage.ts`). Leaks:
  - `apps/web/src/copy/ui.ts:26-31` re-declares the four status words that `packages/domain/src/status/table.ts:16-24` owns, keyed by hyphen instead of underscore.
  - `apps/web/src/copy/pt-br.ts:139,142,185` hold plural rules and count sentences (`rejected`, `superseded`, `holds`) built in the app.
  - `apps/web/src/surfaces/eviction-recovery-surface.tsx:26-27` counts relatórios and users in the surface.
  - `apps/web/src/state/banner-slot.tsx:134` computes the "+N" count, while the spine says `src/state` "renders kernel results, never counts".
  - `apps/web/src/surfaces/home/relatorio-card.tsx:37` composes an accessible name.
- AD-3: envelope, families, coalescing and replay conform (`ops/op.ts`, `ops/outbox.ts`, golden). The coalescing versus `first_edited_at` divergence is resolved by re-materializing on pull (option b, `spec-1-5` Design Notes); option (a) is still listed as open.
- AD-4: op, batch and device ids are uuidv7, but identity user ids (`seed.ts:38-40`, `seed-user-<slug>`) and account ids are not. That contradicts AD-4 and breaks every uuidv7 user reference in the kernel (`entities.ts:141-147,184`, `path.ts:123`).
- AD-7 / AD-8: the SW never touches `/api` (`public/sw.js:150,156`), install is all-or-nothing (`:65-72`), and `skipWaiting()` runs only on message (`:118`). Hold volatility: see section 5.
- AD-8 / AD-9: same origin (Hono serves dist, `http/app.ts:130-146`), cookie flags (`auth/auth.ts:232`), `releng-{user_id}` never deleted (`state/session.tsx:352-363`), `baseURL` pinned (`auth/auth.ts:218`).
- AD-10: every table carries `company_id` (`db/schema.ts`), and pulls take `CompanyId` (`sync/pull.ts:55-66`). `applyOps(db, companyId: string, …)` (`sync/apply.ts:172-176`) and `toSnapshot(db, companyId: string, …)` (`sync/snapshot.ts:15`) bypass the brand, so the "does not compile" guarantee does not cover the most important writer.
- AD-13: routes are typed in `contract/sync.ts`, and the error envelope enum is in `contract/errors.ts`. `auth-client.ts:44,140` still uses literal paths (DEFERRED). `http/account.ts:295,305-316` builds envelopes as untyped literals, while `routes.ts:229-242` types them as `ErrorResponse`.
- AD-22: the table exists with tests and no emitter. That is correct for the epic, and nothing exercises it end to end yet.
- AD-23 / AD-24: `aria-disabled` is the pattern everywhere except in Story 1.2 controls that are never used. Rejection semantics conform. The retry table matches the spine (`policy.ts:336-343`).

## 3. Cross-story seams

1. Two user models (1.3 against 1.4, 1.5, 1.8). The identity `user` table (text id, council, registrationNumber, title, `db/schema.ts:113-134`) and the kernel `userRowSchema` (uuidv7 id, a single `professional_registration`, `entities.ts:141-147`) have nothing in common. Nothing emits `user/*` creates, so on devices:
   - Sync status "Último envio" prints the raw id: `sync.userNames[push.user_id] ?? push.user_id` (`surfaces/sync/sync-status-surface.tsx:101`, names from `state/sync.tsx:125-129`).
   - The eviction screen always counts 0 users (`eviction-recovery-surface.tsx:27`).
   - `relatorio.setup.responsible_user_id` (`entities.ts:184`, uuidv7) can never reference a real user. Epic 4's Setup needs this.
2. Two ways to handle a 401: in session it raises the banner and keeps the pointer (`api/auth-client.ts:146-148`, `sync/engine.ts:263-265`); at boot it clears the pointer (`state/session.tsx:283`).
3. Shared components against hand-rolled markup:
   - `SignOutDialog` duplicates `ConfirmDialog` (`surfaces/account/sign-out-dialog.tsx:34-62`).
   - `RegistrationDialog` hand-rolls a `role="radiogroup"` with no roving tabindex or arrows (`registration-dialog.tsx:103-118`). This is the exact defect the PR #7 review fixed in `SegmentedControl`.
   - `LoginSurface` and `RelatorioCard` use raw `<button>` or `AriaButton` with the `btn` classes (`login-surface.tsx:102-127`, `relatorio-card.tsx:31,53-60`) instead of `Button`.
   - Production imports of shared components are limited to Button, TextButton, SegmentedControl, StatusPill, StatusTile, SyncBadge, SyncAnnouncer and Toast (grep of `surfaces`, `state`, `app.tsx`). ConfirmDialog, OverflowMenu, Tabs, Combobox, Checkbox, Toggle, Chip and FilterChipGroup are test-only.
4. Copy lives in three places: `copy/ui.ts` (components), `copy/pt-br.ts` (surfaces), and kernel strings (`home/cards.ts` "Relatório sem identificação", `sync/counts.ts` labels, `device/storage.ts`). The rule for where a new string goes is not written down, and status words are duplicated (section 2).
5. Two reset mechanisms: `scripts/test-reset.ts` against `apps/api/src/db/seed.ts:172`. Stale comments:
   - `http/account.ts:12-13` and `api/auth-client.ts:136-137` say the op conversion is "deferred to Story 1.4", which has landed.
   - `RECOVERY_NOTICE_PREF = 'recovery_notice_dismissed'` stores `pending|dismissed` (`db/schema.ts:86`).
   - `.gitkeep` files remain in populated directories (`apps/web/src/{api,state,surfaces,sync}/.gitkeep`, `apps/api/drizzle/.gitkeep`).
6. Dead code: the fallback `device_id: row.device_id || device` (`sync/engine.ts:155`) can never fire (deferred note); `dismissReAuth` has no caller.
7. Dexie evolution: v1 to v4 are append-only, each ending in `stamp()` (`db/schema.ts:108-151`); `populate` stamps fresh stores. Good.
8. Drizzle chain: `0000_sweet_solo`, `0001_identity`, `0002_sync_device_push`; the journal is coherent (`drizzle/meta/_journal.json`), and `migrations-match.test.ts` guards drift. Migrations run at api boot (`main.ts:243`) and also through the `migrate` service in `prod`: two paths, both forward-only.
9. Compose: postgres, minio and api are bound to 127.0.0.1. Only caddy and api-prod ports are parametrized (`docker-compose.yml:113-114,149`). Postgres 5432, MinIO 9000/9001, api 3000 and web 5173 are fixed, and worktrees relied on untracked `compose.local.yml` overrides (spec 1.6/1.8 Verification). `minio/minio` is unpinned. `docker compose run tools` depends on `api: service_healthy` (`:188-192`), so running the gate can recreate the dev api.
10. `Dockerfile.tools` adds WebKit (`Dockerfile.tools:5`). The image is 2.86 GB (`app-tools-s18`), against 2.18 GB for the main checkout's `app-tools:latest`, which predates PR #8. `pnpm test:e2e:matrix` cannot run on `main` until `docker compose build tools`. Eight worktree image sets (about 3.4 GB each) are still on disk (`docker image ls`).

## 4. Test quality

- Balance: 22 domain, 46 web and 9 api test files, 1 tooling test file, 6 e2e specs. About 10.9k lines of tests against 10.9k lines of source (`git ls-files … | xargs wc -l`). The kernel is well covered; Postgres gets real integration tests over HTTP (`sync.integration.test.ts`, `auth.integration.test.ts`).
- Gate determinism, measured on this checkout:
  - Run 1: web `overflow-menu.test.tsx` timed out at 5282 ms against the 5000 ms default.
  - Run 2: `scripts/tooling.test.ts > seed-users CLI > refuses outside docker-compose` timed out at 6584 ms.
  - Run 3 (`pnpm test:unit` alone, lighter load): green in 56 s (273 domain, 316 web, 13 root). One green run out of three.
  - The first test of each RAC-heavy web file costs 4-5 s (`confirm-dialog.test.tsx` first test 4635 ms in run 1), and the tooling tests spawn `tsx` processes. Under parallel load (three reviewers here, several worktrees during the build) the 5 s default is too tight.
- `test:unit` is not database-free: `scripts/tooling.test.ts:91` runs the seed CLI `--test` against the compose Postgres. It is idempotent, but it breaks the "unit" contract.
- Tags: every one of the 21 e2e tests is `@p0` (`grep "test(" e2e/*.spec.ts`), including 1.6-E2E-001, which the test design rates P1. The `--grep @p0` filter selects nothing.
- Fixed sleeps remain: `e2e/durability.spec.ts:285` (`waitForTimeout(1_000)` before a negative assertion), `e2e/support/durability.ts:121` (300 ms), `e2e/support/outbox.ts:141` (100 ms poll). Route throttles of 2.5 s and 4 s are intentional (`sync.spec.ts:175`, `home.spec.ts:158`).
- Determinism done right: "Sincronizar agora" instead of the 60 s timer (`sync.spec.ts:63`); global setup seeds and resets (`e2e/support/global-setup.ts`); `page.clock` for the 5-day banner.
- FR-54: the three scenarios are named and genuine on Chromium (PR #8 review). WebKit coverage has gaps (section 1).
- Missing from the test design: emoji and `laudo` static scans (STATIC-001; `tooling.test.ts:111-118` scans only for the codename), `pnpm audit`, kernel coverage floors (`test-design-qa.md:232,449`).
- Verify duration: 42 s of Playwright in PR #6, 59 s in PR #7, 238 s for the whole verify in PR #8. My lint, static and unit run took 2 min 37 s. The 15-minute budget is far away.

## 5. Security and durability

- better-auth:
  - Sign-up disabled (`auth/auth.ts:227`), telemetry off, `baseURL` pinned against Host forging (from the PR #5 review), trusted origins required (`config.ts:167`).
  - Cookie `HttpOnly; Secure; SameSite=Lax; Max-Age=2592000` (PR #5 live check).
  - Re-seeding a user revokes their sessions (`seed.ts:118-120`).
  - The default `SESSION_SECRET` (`change-me-change-me-change-me-32ch`) is in tracked `docker-compose.yml:23` and `.env.example`, and `api-prod` uses it too. Every verify log shows better-auth's low-entropy warning (PR #6/#7 logs). Local-only today; it must be refused outside dev before Epic 11.
- Tenant isolation:
  - Push: `company_id !== session` gives `op_tenant_mismatch` (`sync/apply.ts:63`).
  - Dedupe is scoped by company (`:136-140`).
  - The entities upsert conflict target includes `company_id` (`:164`).
  - Pulls filter by `company_id` (`pull.ts:56,74`).
  - A pushed op may name another tenant's `relatorio_id`; it only no-ops or creates a row inside the pusher's tenant (PK `company_id, entity, id`, `db/schema.ts:85`). No leak.
- Push validation: `op_server_only` covers server-only families, `device_id = server` and `system:*` actors; a forged `actor_id` gives `op_invalid` (`sync/apply.ts:64-71`). Gap: a client may push `user/{otherUserId}/{field}` for a colleague in the same company. Today that is unreachable only because user ids are not uuidv7.
- The SW never caches `/api` (`public/sw.js:150`), and `/sw.js` is `no-cache` (`http/app.ts:144`).
- The hold-shell flag is volatile (`public/sw.js:37,119`). Chromium stops idle workers after about 30 s and iOS is more aggressive. On the next launch the navigation request reaches a fresh worker with `holdShell = false` before any page code can post `hold-shell`, so `shellPlan` returns network-first (`:54`) and a newer deployed `index.html` is served while ops are pending. Persist the flag in Cache Storage (for example a sentinel entry) or IndexedDB that the worker reads in `fetch`. Also, `sw-plan.test.ts` covers the pure function, not the lifecycle.
- 401 at boot clears the pointer (`state/session.tsx:281-290`). A tablet whose session expired (30 days unused, or a password reset through re-seed) that briefly reaches the server and is then reopened offline lands on Login. Unsynced work cannot be reached, though it is not lost.
- Drafts are never applied silently: only the toast action applies (`state/drafts.tsx`, 1.8-E2E-001). Multiple sources persist in one Dexie transaction (from the PR #8 review). iOS `pagehide` durability is unverified (manual).
- Secrets and logs: no credentials are tracked beyond local defaults (`git ls-files | grep -iE "env|pem|key"`, `certs/` gitignored). The request log records path, status and `company_id` only (`http/app.ts:89-99`). The seed CLI prints the public test password (`scripts/seed-users.ts:79`) and takes `--password` on the command line, where it lands in shell history.

## 6. Deferred-debt triage

Classes: (a) must fix before Epic 2 starts, (b) before the 2026-10-03 slice, (c) later or never, or closed.

| # | Item (source) | Class | Reason |
| --- | --- | --- | --- |
| 1 | Refresh AGENTS.md "Running and verifying" (deferred-work.md) | a | Every agent run reads it; it cites `pnpm test`, which does not exist, and the host-pnpm pitfall is undocumented |
| 2 | `test-reset.ts` guessed tables, untested scoping (deferred-work.md; 1.1) | b | Unify with `resetTestCompanyData` when Story 2.2 creates `files`; delete one of the two |
| 3 | Toggle, Checkbox, FilterChipGroup on-state (1.2 #1, 1.6 #3) | a | The pattern is proven; Epic 2 registries and Epic 5 checklists are the first consumers; otherwise each story rediscovers it |
| 4 | Hit-area and 14 px floor measured only on tokens (1.2 #2) | b | Add one Playwright layout check on real screens before the slice UI freeze |
| 5 | `_bmad/custom/config.toml` keys (1.2 #3) | c (closed) | Reverted by the PR #4 review; keys moved to the untracked `config.user.toml` |
| 6 | Extend the cross-tenant sweep to new routes (1.3 #1) | b | Make it a DoD checkbox for every route story (2.2 files, 7.x generate) |
| 7 | Registration save as a `user/{id}/{field}` op (1.3 #2) | a (decision) | Blocked by the user id format and the two user models; decide the identity model before Epic 2 |
| 8 | Sign-out pending wording (1.3 #3) | c (closed) | Done in 1.5 |
| 9 | `revokeSessions` null `company_id` (1.3 #4) | c | Unreachable while only better-auth inserts sessions |
| 10 | Porto Seguro replay (1.4 #1) | b | Story 3.7; the slice claims the AD-3 test on real data |
| 11 | Seed-defined path segments validated (1.4 #2) | b | Story 3.1 |
| 12 | Origin check for `op_server_only` (1.4 #3) | c (closed) | Done in 1.5 |
| 13 | Dead-op re-materialization (1.4 #4) | c (closed) | Done in 1.5 |
| 14 | Coalescing (a) against (b) (1.4 #5, 1.5 #2) | c | Option (b) shipped and converges; close it with a spine note rather than keep it open |
| 15 | `progress` in the pull summary (1.5 #1) and "Baixando… n de m", progress counter (1.6 #1) | b | Epic 5 `progress`; required by FR-55 cards in the slice |
| 16 | Minted `device_id` into committed ops (1.5 #3) | a | Epic 2's first ops (instruments) would ship with caller-chosen device ids; the fixture already falls back to the user id (`field-fixture-surface.tsx:58`) |
| 17 | Outbox retention (1.5 #4, 1.8 #1) | c | Post-slice; counts are cheap at MVP volume |
| 18 | Request-log `relatorio_id` assertion (1.5 #5) | c | Diagnostic only |
| 19 | Account calls through contract routes (1.5 #6) | b | Fold into item 7 |
| 20 | Short badge word (1.5 #7) | c (closed) | Done in 1.6 |
| 21 | Re-auth dismiss must not resume at once (1.5 #8) | c | Only when a dismiss action is built |
| 22 | `remote_ops` retention and compaction (1.5 #9) | c | Measure with the Porto Seguro fixture in 3.7 first |
| 23 | Reenviar of a dead create with acked puts (1.5 #10) | b | Epic 4 relatório creation is the first multi-op batch |
| 24 | `syncCounts(snapshot, outbox)` signature (1.6 #2) | b | First story with a snapshot (Epic 5) |
| 25 | Pre-paint theme (1.6 #4) | c (closed) | Done in 1.8 |
| 26 | Five banner publishers (1.6 #5) | c | draft-found and unsynced-5-days done; the rest belong to Epics 7, 8, 10 |
| 27 | Tagged image not commit-pinned (1.7 #1) | c | Epic 11 production Dockerfile |
| 28 | `migrate.ts` untested (1.7 #2) | c | Boot migrator is covered by `boot.integration.test.ts`; the prod CLI path is manual only |
| 29 | FR-54 scenario 2 file half (1.8 #2) | b | Story 6.2 |
| 30 | Storage-low banner publisher and threshold (1.8 #3) | b | Needs the manual iPad figures, then one candidate in Epic 6 |
| 31 | Draft sources only on the fixture (1.8 #4) | b | Epic 5 surfaces register theirs |
| 32 | WebKit offline reopen not automated (1.8 #5) | a | Covered only by the manual script, which has not run (see item 36) |
| 33 | Durability sign-in over http without `Secure` (1.8 #6) | c | Harness shape; the HTTPS origin covers real devices |
| 34 | E2E-002/005 with the SW disabled (1.8 #7) | c | Playwright limitation |
| 35 | Sequential `pagehide` writes (1.8 triage, maybe-false) | c (closed in code) | Single transaction since the PR #8 review; confirm on the iPad |
| 36 | Manual PRD Q0 proof (1.7 AC3, 1.8 AC5; not a frontmatter item) | a | Gates Epics 5 and 6 and sets the slice platform line and the 500 MB threshold |

## 7. Process observations

- Spec size: 7 of 8 specs carry `warnings: ['oversized']` (all except 1.1). They run 189 to 436 lines, and code maps cite line numbers that drift as soon as a parallel story merges. The 1.3 spec needed a long post-hoc "Merge with main" section (`spec-1-3` Auto Run Result).
- Internal review volume: 1.1 had about 30 rows (3 layers only), 1.2 35, 1.3 51, 1.4 39, 1.5 39, 1.6 43, 1.7 30, 1.8 42. `followup_review_recommended: true` on 7 of 8. Every run patched in one pass (`review_loop_iteration: 0` everywhere).
- What only the independent review caught (PR comments):
  - PR #4: `aria-disabled` dropped by RAC on `ComboBox` (high), the press-and-hold timer not cleared, a tracked config edit.
  - PR #5: 5xx shown as "Senha incorreta" (the internal patch added `network` but kept 5xx as credentials), better-auth Host forging.
  - PR #6: cross-tenant `op_id` dedupe.
  - PR #7: the Tema keyboard (the internal patch introduced a keyup commit), a flaky `theme.test.tsx` with an assertion outside `waitFor`.
  - PR #8: SW hold-shell, sequential `pagehide`, the eviction screen with no exit.
  - PR #2: hard-coded ports.
  - PR #3: NUL bytes that made `op.test.ts` binary, `registry/field` accepting any string.
- Recurring failure modes:
  - Patches written by the same subagent that wrote the bug were wrong twice (1.3 5xx, 1.6 keyup).
  - Library semantics (React Aria props, SW lifecycle) are assumed rather than probed in a real browser.
  - "Documented but not done": the `ConfirmDialog` `aria-modal` docstring, AGENTS.md.
  - Cross-story contracts are not reconciled (user ids, device ids, two reset scripts, two dialogs).
- Model and effort fit:
  - fable/high for 1.4 and 1.5 fit well; the 1.5 independent review found one low.
  - opus/medium for 1.3 and 1.6 was too low for security and accessibility-heavy UI. Both had medium or high independent findings.
  - sonnet/high for 1.2 missed RAC semantics.
  - sonnet/medium for 1.7 was fine (its internal review caught its own three highs).
  - opus/high for 1.8 fit, but its SW fix still needed a lifecycle probe.
- Cost signals (iteration proxy): about 10.5 h wall clock for 8 PRs (merged 00:25 to 10:46 UTC on 2026-09-22), four stories in parallel worktrees. Each PR went through one internal pass, one independent pass and one fix commit (2-4 commits per PR, `gh pr view --json commits`). Leftovers from parallel worktrees: 8 image sets on disk and a stale main `app-tools`.
- Gap: PR #1 had no independent review (no PR comments, three internal layers only), and the epic was marked done with the manual proof pending.

## 8. Verdict

Top 5 strengths

1. One reducer, one log. `applyOp` is shared by both sides, and a golden replay, the rebase, dead-op exclusion and Reenviar all reduce to `materializeEntity` (`ops/materialize.ts:222`).
2. Server push validation is strict yet per-op: shape, origin, tenant, tenant-scoped dedupe and an advisory lock for monotonic `seq` (`sync/apply.ts`).
3. Architecture rules are enforced by lint and tests (`eslint.config.js`, `scripts/tooling.test.ts`, `styles.test.ts`, the determinism scan, the migrations drift test).
4. The durability work is honest: all-or-nothing precache, named FR-54 scenarios, limitations annotated rather than hidden, and a manual script that refuses to claim a result.
5. The merge gate runs in under 4 minutes, every PR carries its verify output, and every spec keeps a traceable triage log.

Top 5 weaknesses

1. The user identity seam (text ids against uuidv7; no user rows on devices).
2. SW hold-shell state is volatile, so the AD-8 version pinning does not survive a worker restart.
3. The epic is closed without the PRD Q0 device proof that its own context says gates what follows.
4. Shared components are built but bypassed, and the bespoke replacements repeat already-fixed accessibility bugs; `ConfirmDialog` lacks `aria-modal`.
5. Gate determinism: 5 s timeouts on heavy tests, a unit suite that writes to the database, tags that select nothing, and verify scope below the test design (no audit, coverage or emoji scan).

Action items (prioritized)

1. Decide the user identity model: uuidv7 user ids in identity, and a `user/{id}` create projected into the company stream by the seed or a system op. Migrate the test seeds and convert the registration save to ops. Owner: architecture, then the first Epic 2 story.
2. Run the manual iPad and Android offline proof, file `test-artifacts/manual/ipad-YYYY-MM-DD.md`, set the platform line and the storage threshold, and mark epic 1 "done pending Q0" until then. Owner: Matheus manual.
3. Add the minted `deviceId` to `CommitDeps` and remove the user-id fallback in the fixture. Owner: the next story, before any Epic 2 op emitter.
4. Persist the SW hold flag (Cache Storage sentinel or IndexedDB) and add a unit test that recreates the worker global. Owner: architecture, then a small follow-up story.
5. Stabilize the gate: raise `testTimeout` for the jsdom web project and `tooling.test.ts` (or move the CLI spawn tests to `test:api`), split DB-touching tests out of `test:unit`, retag e2e by real priority, add the emoji and `laudo` scan, and add `pnpm audit`. Owner: process.
6. Consolidate UI seams: rebuild `SignOutDialog` and `RegistrationDialog` on `ConfirmDialog` and `SegmentedControl`, make `ConfirmDialog` set `aria-modal` with a test, port Toggle, Checkbox and FilterChipGroup, and wire `src/input` into the first touch surface. Owner: next story (a 1.x hygiene story before Epic 2 UI).
7. Move status words, plurals and counts out of `copy/*` and surfaces into the kernel, and document the rule for where a string goes (kernel for derived text, `pt-br.ts` for static surface copy, `ui.ts` for component chrome). Owner: architecture.
8. Make the boot-time 401 keep the `last-session` pointer, so offline cold opens still reach local data behind the re-auth banner, matching the in-session 401 path. Owner: next story.
9. Refresh AGENTS.md (verify command, host-pnpm pitfall, `docker compose build tools` after `Dockerfile.tools` changes), delete one of the two reset mechanisms, fix stale "Story 1.4" comments, and prune worktree images. Owner: process and Matheus.
10. Require an independent review on every PR (PR #1 had none). For UI and SW stories, require one real-browser probe of any library-semantics patch before it merges. Owner: process.
