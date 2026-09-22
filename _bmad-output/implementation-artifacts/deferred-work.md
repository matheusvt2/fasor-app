# Deferred work ledger

Every deferred item from the eight Epic 1 story specs (`spec-1-1` through `spec-1-8`), rebuilt
2026-09-22 per Epic 1 retrospective action item A10
(`_bmad-output/implementation-artifacts/epic-1-retro-2026-09-22.md`, finding F-DEBT-1). Every
item from every source spec is represented; a cross-spec duplicate gets one entry under each
spec it originated from, each cross-referencing its sibling rather than repeating the full
evidence twice. Every "closed" or
"partially closed" state below was verified against the current code and git history as part of
this rebuild, not copied from the retrospective's estimate (dates below are 2026-09-22 unless a
commit's own date differs). Also carries forward the deferred items from PR #9's own remediation
spec (`spec-epic-1-fix-identity-and-kernel.md`, action items A2/A4/A7/A8), merged in when
`origin/main` was merged into this ledger's own PR.

Fields: `source_spec` (one or two spec files), `summary`, `evidence`, `class` (`bug`, `debt`,
`test-gap`, `docs`, `post-mvp`), `state` (`open`, `closed (commit <short-sha> "<subject>")`, or
`partially closed: ...`).

---

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-whole-stack-with-one-command.md`
  summary: Test-reset guesses table names and only clears `pgboss.job`, with company/S3-prefix scoping untested.
  evidence: Before this PR, `scripts/test-reset.ts` deleted from a guessed `TABLES` list (`ops`, `files`, `revisions`, `generation_jobs`, `reading_runs`), most of which do not exist in `apps/api/src/db/schema.ts`, and missed `sync_device_push`, which does. Fixed by rewriting the script to call `resetTestCompanyData` (`apps/api/src/db/seed.ts:172`), guarding it against a non-test company id, and covering both with `apps/api/src/db/test-reset.integration.test.ts`.
  class: test-gap
  state: closed (branch fix/epic-1-gate-docs-ledger, this file's own PR)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-whole-stack-with-one-command.md`
  summary: AGENTS.md "Running and verifying" still showed host `pnpm` commands that fail on this host (no such `pnpm test` script exists, and Docker is mandatory).
  evidence: `AGENTS.md:28-32` said "TODO until Story 1.1 lands" and named a nonexistent `pnpm test`. Fixed: the section now lists the real scripts (`test:unit`, `test:api`, `test:e2e`, `test:e2e:full`, `test:e2e:matrix`, `verify`) and the `docker compose --profile tools run --rm tools ...` invocation form.
  class: docs
  state: closed (branch fix/epic-1-gate-docs-ledger, this file's own PR)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-build-the-shared-components-from-the-mockups-css.md`
  summary: Toggle, Checkbox, SegmentedControl and FilterChipGroup never showed a visible selected/on fill.
  evidence: `SegmentedControl` was fixed by commit `3395035` ("Story 1.6: Home and Account show what is on this device (#7)"), which ported the Tema control onto the working pattern (`apps/web/src/components/segmented-control.tsx`). `Toggle` still only sets `aria-checked` for accessibility with a documented gap against `components.css`'s `.toggle[aria-checked="true"] .track` selector (`apps/web/src/components/toggle.tsx:13-22`), and `Checkbox`/`FilterChipGroup` are unchanged since the spec landed. Duplicate of `spec-1-6` item 3 (Toggle/Checkbox/FilterChipGroup port), cross-referenced there.
  class: bug
  state: "closed: SegmentedControl in commit `3395035`; Toggle, Checkbox and grouped FilterChipGroup on states in branch fix/epic-1-ui-hygiene (PR #12, retro A5 F-SPEC-6), checked in light and dark by e2e A5-E2E-006"

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-build-the-shared-components-from-the-mockups-css.md`
  summary: Hit-area and typography acceptance criteria are verified only via jsdom class/CSS-variable presence, not rendered pixels.
  evidence: No visual-regression or bounding-box test tier exists in the repo (`apps/web/src/components/*.test.tsx` assert class names and `getComputedStyle`, not layout). `1.2-CMP-003` and `ERGO-E2E-001` in `_bmad-output/test-artifacts/test-design-qa.md` plan real bounding-box assertions but are not yet implemented.
  class: test-gap
  state: open (no component-level visual test tier exists)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-build-the-shared-components-from-the-mockups-css.md`
  summary: `_bmad/custom/config.toml` was expected to gain `[core]`/`[modules.bmm]` keys.
  evidence: No such file exists in the repository (`_bmad/custom/` holds only `bmad-build.toml`); this described transient local BMAD orchestration state that was never committed as described.
  class: debt
  state: closed (not applicable — describes transient local orchestration state never actually committed as described)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-sign-in-and-hold-a-session-that-survives-offline.md`
  summary: Extend the cross-tenant sweep (1.3-API-002) to stream/file/generate/revision routes as they land.
  evidence: Only the sync and account routes exist today (`apps/api/src/sync/`, `apps/api/src/auth/`); file, generate and revision routes belong to later epics. This PR adds a standing Definition of Done clause (`epics.md`, "Every new API route is exercised by a cross-tenant test") so the sweep keeps extending automatically as those routes land.
  class: test-gap
  state: open (those routes do not exist yet; covered going forward by this PR's new DoD clause)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-sign-in-and-hold-a-session-that-survives-offline.md`
  summary: Convert the registration save to a `user/{id}/{field}` op once the op log lands.
  evidence: `apps/web/src/api/auth-client.ts:139-144` (`saveRegistration`) still does a bare `fetch('/api/account/registration', { method: 'PUT', ... })`, not one of AD-1's five named op actions. Verified unchanged in the current tree. The op log shipped in Story 1.4, but this conversion was never done (tracked as Epic 1 retrospective A2, an architecture decision needed before Epic 2).
  class: debt
  state: open (`auth-client.ts:139-144` still does a bare PUT fetch; op log shipped in 1.4 but this conversion was never done)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-sign-in-and-hold-a-session-that-survives-offline.md`
  summary: Restore the sign-out dialog's pending-sync wording and count once Story 1.5 provides sync counts.
  evidence: `apps/web/src/surfaces/account/sign-out-dialog.tsx` reads `syncCounts` from `packages/domain/src/sync/counts.ts`, shipped in commit `3395035` ("Story 1.6: Home and Account show what is on this device (#7)"). Verified: the dialog surfaces the pending count in its confirmation copy.
  class: debt
  state: closed (commit `3395035` "Story 1.6: Home and Account show what is on this device (#7)")

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-sign-in-and-hold-a-session-that-survives-offline.md`
  summary: `revokeSessions` filters on `session.company_id`, theoretically bypassable by a null-`company_id` row inserted another way.
  evidence: `apps/api/src/db/seed.ts:126-131` (`revokeSessions`) still deletes `where(and(eq(session.companyId, companyId), eq(session.userId, userId)))`; no additional guard was added. Verified unchanged since commit `be86c65` ("Story 1.3: Sign in and hold a session that survives offline (#5)"). Remains a theoretical edge case: better-auth's own hook is what stamps `company_id` on every session it creates, so the bypass needs a row inserted outside that hook.
  class: bug
  state: open (unverified, theoretical edge case, unchanged since `be86c65`)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-every-change-is-an-operation-applied-locally-first.md`
  summary: Replay byte-equality test on the Porto Seguro fixture, once Story 3.7 ships it.
  evidence: `packages/domain/fixtures/` holds only `replay-small/`; the Porto Seguro fixture is Epic 3 (Story 3.7), still backlog per `sprint-status.yaml`.
  class: test-gap
  state: open (Epic 3 still backlog)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-every-change-is-an-operation-applied-locally-first.md`
  summary: Validate seed-defined path segments against `getDefinition` once Story 3.1 ships.
  evidence: `getDefinition` (the seed template resolver) does not exist yet; Story 3.1 is Epic 3, still backlog.
  class: test-gap
  state: open (Epic 3 still backlog)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-every-change-is-an-operation-applied-locally-first.md`
  summary: `applyOps` must reject server-only families and spoofed `device_id`/`actor_id` on client pushes.
  evidence: `apps/api/src/sync/apply.ts:64-68` rejects with `op_server_only` when `isServerOnly(op.path)` and the op's `device_id` is not `SERVER_DEVICE_ID`, and symmetrically when a client claims a server-only path or a `system:`-prefixed actor. Verified present in the current tree.
  class: bug
  state: closed (commit `60f11fe` "Story 1.5: What I did on the tablet reaches the office by itself (#6)")

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-every-change-is-an-operation-applied-locally-first.md`
  summary: Re-materialize entities excluding dead ops (AD-24).
  evidence: `packages/domain/src/ops/replay.ts` and `materialize.ts` take a `deadOpIds` set and exclude them from the replayed state; `apps/api/src/sync/replay.integration.test.ts` and `packages/domain/src/ops/replay.test.ts` assert the exclusion. Verified present and tested.
  class: bug
  state: closed (commit `60f11fe` "Story 1.5: What I did on the tablet reaches the office by itself (#6)")

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-every-change-is-an-operation-applied-locally-first.md`
  summary: Coalescing option (a) (client-side, pre-push) vs (b) (server-side, re-materialize on pull) architecture decision.
  evidence: Option (b) (re-materialize on pull) is implemented (`packages/domain/src/ops/materialize.ts`, `apps/api/src/sync/apply.ts`) and is the decision of record (Epic 1 retrospective, "Accepted deviations"). Option (a) remains a documented future alternative, not a blocking open item. Duplicate of `spec-1-5` item 2, cross-referenced there.
  class: debt
  state: "closed (decision made: option (b), commit `60f11fe`; option (a) remains a documented future alternative, not a blocking open item)"

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-what-i-did-on-the-tablet-reaches-the-office-by-itself.md`
  summary: Per-relatório progress in the company pull summary, once the kernel's `progress(snapshot)` exists.
  evidence: No `progress(snapshot)` function exists in `packages/domain/src/` yet; it is an Epic 4+ kernel function. Duplicate of `spec-1-6` item 1, cross-referenced there.
  class: post-mvp
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-what-i-did-on-the-tablet-reaches-the-office-by-itself.md`
  summary: Coalescing option (a) stays open for the architect to reconsider.
  evidence: Duplicate of `spec-1-4` item 5, cross-referenced there. Option (b) is the decision of record; option (a) is a non-blocking documented alternative.
  class: debt
  state: open (soft, non-blocking; duplicate of `spec-1-4` item 5, cross-reference)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-what-i-did-on-the-tablet-reaches-the-office-by-itself.md`
  summary: Feed the minted `device_id` into every committed op once a capture surface calls `commitBatch`.
  evidence: `apps/web/src/db/commit.ts:27-30` (`CommitDeps`) is still `{newId, now}`, no `deviceId` field; verified unchanged in the current tree. No production capture surface calls `commitBatch` yet (only the dev-only field fixture).
  class: post-mvp
  state: open (`CommitDeps` in `apps/web/src/db/commit.ts:27-30` still `{newId, now}`)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-what-i-did-on-the-tablet-reaches-the-office-by-itself.md`
  summary: Define outbox retention (acked rows never pruned).
  evidence: No pruning job or retention policy exists for acked `outbox` rows in `apps/web/src/db/`. Duplicate of `spec-1-8` item 1, cross-referenced there.
  class: debt
  state: open (duplicate of `spec-1-8` item 1, cross-reference)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-what-i-did-on-the-tablet-reaches-the-office-by-itself.md`
  summary: Assert the request log carries `relatorio_id` for the relatório stream route.
  evidence: No structured-logging assertion for `relatorio_id` on `GET /api/sync/relatorios/{id}` was found in `apps/api/src/sync/*.test.ts`. Unverified either way beyond that absence.
  class: test-gap
  state: open (unverified)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-what-i-did-on-the-tablet-reaches-the-office-by-itself.md`
  summary: Move Story 1.3 account calls onto contract route definitions.
  evidence: `apps/web/src/api/auth-client.ts` still calls literal path strings (`/api/account`, `/api/account/registration`); `packages/domain/src/contract/index.ts:28-34` documents the shapes but defines no `ACCOUNT_ROUTES` path constants the way other contract routes are defined. Verified unchanged in the current tree.
  class: debt
  state: open (`auth-client.ts` still calls literal paths; no `ACCOUNT_ROUTES` in the contract)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-what-i-did-on-the-tablet-reaches-the-office-by-itself.md`
  summary: Add the sync badge's short word for every state.
  evidence: `packages/domain/src/sync/counts.ts` (`syncBadgeShortLabel`) and its test `packages/domain/src/sync/counts.test.ts:99` cover `'conflict'` and every other `SyncBadgeState`. Verified present and tested.
  class: bug
  state: closed (commit `3395035` "Story 1.6: Home and Account show what is on this device (#7)")

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-what-i-did-on-the-tablet-reaches-the-office-by-itself.md`
  summary: Re-auth banner dismiss must not fire a sync cycle at once.
  evidence: `dismissReAuth` exists at `apps/web/src/state/session.tsx:225` (added in commit `3395035`), but no UI surface calls it yet, and `apps/web/src/state/sync.tsx:120` still calls `engine.resume()` unconditionally on the online-status effect. Verified both facts in the current tree.
  class: bug
  state: "open, partially advanced (`dismissReAuth` now exists, `apps/web/src/state/session.tsx:225`, added in `3395035`, but no UI surface calls it yet and `sync.tsx:120` still calls `engine.resume()` unconditionally)"

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-what-i-did-on-the-tablet-reaches-the-office-by-itself.md`
  summary: Define retention/compaction for `remote_ops`.
  evidence: No retention or compaction policy exists for the `remote_ops` Dexie store in `apps/web/src/db/`.
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-what-i-did-on-the-tablet-reaches-the-office-by-itself.md`
  summary: Decide whether "Reenviar" of a dead create must re-send later acked puts on the same entity.
  evidence: Not reachable with the current single-op batches; needs Epic 5's multi-op batches to construct the scenario.
  class: post-mvp
  state: open (not reachable until Epic 5 multi-op batches)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-6-home-and-account-show-what-is-on-this-device.md`
  summary: Home card counted forms ("Baixando… n de m") once the company summary carries `progress(snapshot)`.
  evidence: Duplicate of `spec-1-5` item 1, cross-referenced there. No `progress(snapshot)` kernel function exists yet.
  class: post-mvp
  state: open (duplicate of `spec-1-5` item 1, cross-reference)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-6-home-and-account-show-what-is-on-this-device.md`
  summary: Decide whether `syncCounts` takes the snapshot beside the outbox.
  evidence: `packages/domain/src/sync/counts.ts` (`syncCounts`) still takes only the outbox array; no snapshot parameter. Verified unchanged in the current tree; no snapshot exists before Epic 5 (an accepted deviation recorded in the Epic 1 retrospective).
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-1-6-home-and-account-show-what-is-on-this-device.md`
  summary: Port Toggle, Checkbox and FilterChipGroup onto the ToggleButtonGroup/SegmentedControl fix pattern.
  evidence: Duplicate of `spec-1-2` item 1, cross-referenced there. `apps/web/src/components/toggle.tsx` and `checkbox.tsx` are unchanged; only `SegmentedControl` was ported.
  class: bug
  state: closed (branch fix/epic-1-ui-hygiene, PR #12; duplicate of `spec-1-2` item 1)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-6-home-and-account-show-what-is-on-this-device.md`
  summary: Apply the stored theme before first paint.
  evidence: `apps/web/index.html:17-19` sets `document.documentElement.setAttribute('data-theme', stored)` (or removes it) in an inline script that runs before the app bundle, ahead of first paint. Verified present.
  class: bug
  state: closed (commit `38ca1d3` "Story 1.8: Nothing captured is lost when the tab closes, the network drops or storage is scarce (#8)")

- source_spec: `_bmad-output/implementation-artifacts/spec-1-6-home-and-account-show-what-is-on-this-device.md`
  summary: Publish the remaining five banner kinds as their conditions become real.
  evidence: `apps/web/src/state/banner-slot.tsx` publishes `'re-auth'`, `'draft-found'` (`:95`) and `'unsynced-5-days'` (`:107`), plus `'offline'` (`:114`), added in commit `38ca1d3`. `'suggestions-ready'` (Epic 8), `'relatorio-exported'` (Epic 7) and `'conflict'` (Epic 10) are not published yet — their conditions do not exist. Verified: only four `kind` values are constructed in the file.
  class: post-mvp
  state: "partially closed: `unsynced-5-days` added, commit `38ca1d3`; `draft-found` added there and withdrawn again in branch fix/epic-1-ui-hygiene (PR #12, retro U7: the persistent toast is the only offer); `suggestions-ready`/`relatorio-exported`/`conflict` remain, gated on Epics 8/7/10, still backlog"

- source_spec: `_bmad-output/implementation-artifacts/spec-1-7-reach-the-local-stack-from-a-tablet-over-https.md`
  summary: `build-tagged-image.sh` should produce byte-identical tags (no `COPY`, bind-mount only).
  evidence: `scripts/build-tagged-image.sh` runs `pnpm verify` then `docker compose build api` and tags the result with the commit SHA — a real build step, not a byte-identical bind-mount reuse. Explicitly deferred to Epic 11 (image promotion pipeline) per the spec.
  class: post-mvp
  state: open (explicitly deferred to Epic 11)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-7-reach-the-local-stack-from-a-tablet-over-https.md`
  summary: `apps/api/src/db/migrate.ts` has no automated test and is not invoked by `pnpm verify`.
  evidence: No `migrate.test.ts` or `migrate*.integration.test.ts` exists under `apps/api/src/db/`. Migrations now exist (`apps/api/drizzle/0000_sweet_solo.sql`, `0001_identity.sql`, `0002_sync_device_push.sql`), but the `migrate()` function that applies them is still untested. Verified absence.
  class: test-gap
  state: open (migrations now exist, but still untested)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-8-nothing-captured-is-lost-when-the-tab-closes-the-network-dro.md`
  summary: Outbox retention (acked rows never pruned).
  evidence: Duplicate of `spec-1-5` item 4, cross-referenced there. No pruning job exists.
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-1-8-nothing-captured-is-lost-when-the-tab-closes-the-network-dro.md`
  summary: FR-54 scenario 2 covers op push only; the photo-upload half lands with Story 6.2's uploader.
  evidence: `apps/api/src/files/` (the file upload route) does not exist yet; Story 6.2 is Epic 6, still backlog.
  class: post-mvp
  state: open (Epic 6 backlog)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-8-nothing-captured-is-lost-when-the-tab-closes-the-network-dro.md`
  summary: The 500 MB storage-low banner has no publisher.
  evidence: `packages/domain/src/checks/storage.ts` computes the 500 MB threshold decision (per AD-8, provisional pending the iPad calibration, action item A1), but `apps/web/src/state/banner-slot.tsx` does not construct a `storage-low` (or equivalent) banner candidate. Verified: no such `kind` is published. Deliberately incomplete pending the manual iPad calibration (A1).
  class: post-mvp
  state: open (deliberately incomplete pending manual iPad calibration, A1)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-8-nothing-captured-is-lost-when-the-tab-closes-the-network-dro.md`
  summary: Draft sources are registered per-surface only by capture screens; only the fixture route registers one today.
  evidence: `apps/web/src/surfaces/dev/field-fixture-surface.tsx` is the only surface calling the draft-registration hook; no production capture surface (sheet, checklist, etc.) exists yet to register one.
  class: post-mvp
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-1-8-nothing-captured-is-lost-when-the-tab-closes-the-network-dro.md`
  summary: Offline cold open is asserted on Chromium only; WebKit's offline reopen is not covered.
  evidence: `e2e/durability.spec.ts:92-120` (`1.8-AC-001`) explicitly branches on `browserName === 'webkit'` and records a `not-covered-here` annotation, because Playwright's WebKit cuts the network below the service worker (an offline navigation fails before the worker is asked). Verified present; mitigated by the manual iPad script (`_bmad-output/test-artifacts/manual/offline-proof-script.md`).
  class: test-gap
  state: open (known Playwright/WebKit limitation, mitigated by the manual iPad script)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-8-nothing-captured-is-lost-when-the-tab-closes-the-network-dro.md`
  summary: Durability projects sign in via `/api/auth/*` instead of the Login form, because WebKit drops `Secure` cookies on an http origin.
  evidence: `e2e/support/durability.ts:33-45` (`signInForDurability`) posts directly to `/api/auth/sign-in/email` and re-adds the cookie without `Secure`, with a comment explaining the WebKit limitation. Verified present.
  class: test-gap
  state: open (same tool-limitation category as the item above)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-8-nothing-captured-is-lost-when-the-tab-closes-the-network-dro.md`
  summary: Scenarios 1.8-E2E-002 and 1.8-E2E-005 run with the service worker disabled, because Playwright cannot intercept through a service worker outside Chromium.
  evidence: `e2e/durability.spec.ts` (the network-drop and 5-day-banner scenarios) target the `durability-desktop-chrome` project specifically for this reason, per the file's own comments.
  class: test-gap
  state: open (tooling limitation)

- source_spec: A9 investigation for this PR (epic-1-gate-docs-ledger), not from any spec's `deferred:` list
  summary: A "sample-relatorio" seed flag for `scripts/seed-users.ts`, so a developer can seed a relatório with data instead of an empty one.
  evidence: Investigated while writing this PR's README/AGENTS.md usage sections. Seeding a relatório needs new op-log-replay plumbing through `applyOp`, sourced from `packages/domain/fixtures/replay-small/op-log.ts`-style fixtures — not a flag flip on the existing `--test`/`--company-id` CLI, which only provisions identity rows.
  class: post-mvp
  state: open

- source_spec: A6 investigation for this PR (epic-1-gate-docs-ledger), no source spec of its own
  summary: `pnpm audit --prod` reports one moderate advisory in a transitive dev-tooling dependency chain, unrelated to this epic's scope.
  evidence: "`docker compose --profile tools run --rm tools pnpm audit --prod`" runs reliably (the tools container has registry access) but exits non-zero on `esbuild <=0.24.2` (GHSA-67mh-4wv8-2f99) via `better-auth > drizzle-kit > @esbuild-kit/esm-loader > @esbuild-kit/core-utils > esbuild`, present in both `apps/api` and `apps/web`'s dependency trees. `drizzle-kit` is a dev-only CLI tool (migration generation), never shipped to production. Fixing it (bumping `drizzle-kit` or overriding the transitive `esbuild`) is outside this remediation spec's scope, so `pnpm audit --prod` is not added to `pnpm verify` yet (per this spec's own escape valve for a step that would break the gate); `AGENTS.md`'s gate description says why.
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-1-fix-identity-and-kernel.md`
  summary: Migration 0003 drops the identity registration columns without copying them into a user entity.
  evidence: Pre-change users have slug ids and must be re-keyed by a re-seed, which re-applies the CLI registration; only values edited through the removed PUT on a local dev volume are lost. No production data exists before the MVP.
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-1-fix-identity-and-kernel.md`
  summary: Pre-change devices of a re-keyed slug user are stranded (releng-{slug} database, unreadable slug pointer, outbox with the slug actor).
  evidence: userProfileSchema.id is uuidv7 now; the transition is signing in again after the re-seed. Local dev devices only.
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-1-fix-identity-and-kernel.md`
  summary: projectUser checks the entity outside the per-company lock, so parallel seeds on a brand-new volume can log two user creates; a concurrent re-seed can put back a title a sync test changed.
  evidence: State is unaffected (second create is a no-op); the exactly-one-create assertion or the sync title test could flake on a fresh volume.
  class: test-gap
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-1-fix-identity-and-kernel.md`
  summary: commitBatch looks up prev_op_id outside the commit transaction with per-op sequential queries over unpruned history; byClientTsThenOpId is defined twice.
  evidence: Overlapping commits on one path or a pull in between can name a stale prev_op_id (false "mescladas" row). Revisit with the first debounced field emitter.
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-1-fix-identity-and-kernel.md`
  summary: Parallel api integration beforeAll re-seeds revoke the shared test users' sessions, so another file's push can get a 401 mid-test.
  evidence: Seen once in pnpm verify (1.5-API-002); re-run green. Pre-existing revocation, wider window now; belongs with retro A6. Likely closed by this PR's own fix for a related race -- `apps/api/vitest.config.ts`'s new `fileParallelism: false` (added to stop `resetTestCompanyData` from wiping a sibling file's rows) also serializes every `apps/api` integration file, which removes the interleaving this item describes. Left open rather than marked closed: no dedicated regression test proves this specific flake is gone, only that its root cause (file-level parallelism in that suite) no longer exists.
  class: test-gap
  state: open (probably resolved as a side effect of this PR's fileParallelism fix; unverified by a dedicated test)

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-1-fix-ui-hygiene.md`
  summary: Grouped FilterChipGroup arrow keys move focus but not the selection (APG radiogroup expects selection to follow focus).
  evidence: Independent review of PR #12 measured aria-checked unchanged after ArrowRight; pre-existing (React Aria ToggleButtonGroup), no production caller yet. Fix with the first surface that renders filter chips, reusing the SegmentedControl keyboard contract.
  class: bug
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-1-fix-ui-hygiene.md`
  summary: Esc on the draft toast leaves focus on body; on a cold load with the api down the badge reads "Sincronizado" for about 2 s until the first cycle ends.
  evidence: Independent review of PR #12. The toast has no opener to return focus to; the first-cycle window needs a "not yet confirmed" badge input the kernel does not have. Both low; revisit with the Epic 5 sheet toasts and the badge.
  class: bug
  state: open
