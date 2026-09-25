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
  evidence: `packages/domain/fixtures/` holds only `replay-small/`; the Porto Seguro fixture is Epic 3 (Story 3.7), still backlog per `sprint-status.yaml`. Refreshed 2026-09-23 (Epic 3 review K9): Story 3.7 shipped the fixture (PR #20), and `apps/api/src/sync/porto-seguro.integration.test.ts` (3.7-INT-001 full log, 3.7-INT-002 small log) replays it through the Drizzle layer and compares byte for byte with the kernel's golden snapshot.
  class: test-gap
  state: closed (2026-09-23, `apps/api/src/sync/porto-seguro.integration.test.ts`, PR #20; ledger refreshed in branch fix/epic-3-kernel-fixture)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-every-change-is-an-operation-applied-locally-first.md`
  summary: Validate seed-defined path segments against `getDefinition` once Story 3.1 ships.
  evidence: `getDefinition` (the seed template resolver) does not exist yet; Story 3.1 is Epic 3, still backlog. Refreshed 2026-09-23 (Epic 3 review K9): Story 3.1 shipped `getDefinition` (`packages/domain/src/seed/definitions.ts`), but `packages/domain/src/ops/path.ts` still checks nameplate `field_key`, checklist `item_key`, `test_key` and cell `row`/`col` only structurally (`seedKey`, `cellIndex`); nothing rejects a key the block's definition does not have.
  class: test-gap
  state: partially closed (E3-A3, Epic 5 Batch A, branch story/5-1-5-4-sheet-shell-cabine-nameplate-checklist): `assertSeedPath` in `packages/domain/src/ops/apply.ts`, called from `writeRow` before every `sheet/*` write, rejects a `sheet/nameplate` `field_key`, `sheet/checklist` `item_key` or `sheet/test`/`sheet/test/cell` `test_key` the block's own `getDefinition(seed_version, 'cabine_primaria', block_type)` does not name. Cell `row`/`col` stay structural only (`cellIndex`): a `test_key` can carry more than one table (`contactInsulation`'s CONTATO ABERTO/FECHADO pair) and the path names no table, so geometry cannot be read from the path alone; bounding `row`/`col` against a table's shape is Epic 5's measurement stories' (5.5-5.7) concern once they define that addressing.

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
  state: ~~open (Epic 6 backlog)~~ closed (2026-09-25, Stories 6.1/6.2 batch: `e2e/durability.spec.ts` 6.2-E2E-003 `@p0` drops the answer of every photo PUT after the server stored it; each photo uploads exactly once, one `uploaded_at` and one `variants` op each, none duplicated or lost)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-8-nothing-captured-is-lost-when-the-tab-closes-the-network-dro.md`
  summary: The 500 MB storage-low banner has no publisher.
  evidence: `packages/domain/src/checks/storage.ts` computes the 500 MB threshold decision (per AD-8, provisional pending the iPad calibration, action item A1), but `apps/web/src/state/banner-slot.tsx` does not construct a `storage-low` (or equivalent) banner candidate. Verified: no such `kind` is published. Deliberately incomplete pending the manual iPad calibration (A1).
  class: post-mvp
  state: ~~open (deliberately incomplete pending manual iPad calibration, A1)~~ closed (2026-09-25, Story 6.2: `storage-low` candidate in `apps/web/src/state/banner-slot.tsx`, ranked right after `re-auth`, text `storageLowBannerText`; the 500 MB number itself stays provisional until the iPad reading, A1)

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

- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-register-a-test-instrument-with-its-calibration-record.md`
  summary: Component-level tests are missing for `registries-surface.tsx`, `instrumentos-tab.tsx`, `instrument-row.tsx` and the five placeholder tabs; coverage is kernel unit tests plus 4 e2e specs.
  evidence: Internal review pass 2026-09-22. `apps/web/src/surfaces/registries/instrument-panel.test.tsx` was added during triage for the most severe instance (the AC4 referenced/unreferenced branch); the remaining components have no `*.test.tsx`. Full coverage of every branch in the six new components was judged disproportionate for this pass under the story's token budget.
  class: test-gap
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-register-a-test-instrument-with-its-calibration-record.md`
  summary: A second device editing the same instrument while its panel is open on a first device shows stale text for untouched fields until that field is itself edited.
  evidence: Internal review pass 2026-09-22. `apps/web/src/surfaces/registries/instrument-panel.tsx`'s `TextField`/`NumberField`/`TestDefaultField` each seed local state once at mount (`useState(value)`) and never resync from the live row prop. Real but unconfirmed by any test; the same seed-once-never-resync pattern is already used by every other Epic 1 field editor (e.g. `RegistrationDialog`), so it predates and is not unique to this story.
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-1-fix-sw-hold-persisted.md`
  summary: Scope the shell pin per user, or hold while any user on the device has a backlog.
  evidence: The pin is one sentinel per origin while the outbox is per user (releng-{user_id}). User B signing in with an empty outbox posts hold:false and promotes the waiting worker, releasing user A's pin. PR #8's promotion already behaved this way. Severity medium.
  class: bug
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-1-fix-sw-hold-persisted.md`
  summary: Identify the page's build by a version stamped into index.html, not only by its entry chunk name.
  evidence: sw.js cacheHolding resolves an {entry} pin to the oldest shell cache holding that file. A deploy that changes only index.html, CSS or public/ keeps the entry name, so a job started on the newer document can be served the older one after a reload (PR #11 review 2, L-1, reproduced with a same-entry rebuild). Any JS change, including a Dexie schema bump, renames the entry, so the effect is limited to markup and styles. Severity low.
  class: bug
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-1-fix-sw-hold-persisted.md`
  summary: Keep the page's build identity correct if code splitting moves register.ts out of the entry chunk.
  evidence: register.ts currentShellEntry uses import.meta.url of the chunk that runs it, which is the entry only because the build emits one JS chunk today. A shared chunk would still be a precached hashed file of that build, but shared across builds it would reintroduce the wrong-shell pin (PR #11 review 2, L-2). Stamping a build version (item above) removes the dependency. Severity low.
  class: bug
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-2-5-2-6-registries-batch.md`
  summary: A device whose manufacturer/voltage_class create gets server-merged into another device's existing row keeps the merged-away id as a permanent, unreconciled duplicate row in its own local Dexie.
  evidence: Internal review pass 2026-09-22. The sync protocol has no "your create was superseded, rewrite to id X" signal, so the creating device's optimistic local row is never corrected by a later pull. The same pass's fix (an in-request id-redirect map in `apps/api/src/sync/apply.ts`) covers a put/remove arriving in the *same* push batch as the merging create, but not this client-side residue. Fixing it needs a sync-protocol extension (e.g. a redirect/tombstone instruction in the pull response). Severity medium.
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-2-5-2-6-registries-batch.md`
  summary: The manufacturer/voltage_class normalized-name merge scans every live registry row for the company (all kinds) on every create, an O(n) scan with no SQL-level kind filter.
  evidence: Internal review pass 2026-09-22. `apps/api/src/sync/apply.ts`'s merge check loads all live `registry` entities per create and filters by kind in JS. Fine at MVP registry scale (a handful of manufacturers/voltage classes per company); revisit if registries grow large. Severity low.
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-2-5-2-6-registries-batch.md`
  summary: The registry edit panels (Clientes, Fabricantes, Classes de tensão) offer two differently-labeled controls that both close the panel ("Fechar edição" icon button, "Fechar" footer button).
  evidence: Internal review pass 2026-09-22. A pre-existing pattern carried forward verbatim from `instrument-panel.tsx` (Story 2.1, already merged), not introduced by this diff. Severity low.
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-2-3-files-and-company-identity.md`
  summary: Concurrent PUTs of the same file can still emit two `file/{id}/uploaded_at` ops.
  evidence: Independent review + fix pass 2026-09-22. `apps/api/src/http/files.ts` re-reads the row immediately after storing the object and emits the op only while `uploaded_at` is still null, which narrows the window but does not close it; closing it needs a per-file advisory lock spanning the object store. Four concurrent PUTs in the review's probe all returned the same timestamp and produced exactly one op, so the window is hard to hit. Severity low.
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-2-3-files-and-company-identity.md`
  summary: `sync_state.files_pending` is written by the upload phase and read by no surface.
  evidence: Internal review pass 2026-09-22. A grep over `apps/web/src` finds only the engine writing it; the badge that consumes it belongs to a later epic, so a failed or pending upload is invisible to the user today. Severity medium.
  class: debt
  state: ~~open~~ partially closed (2026-09-25, Story 6.2: a pending or failed photo upload is now visible on its own tile, "Aguardando envio" / "Erro — Tentar novamente" from the kernel's `photoUploadState`; `files_pending` itself is still read by no surface, and the gallery header count `photosPendingText` is Story 6.3's)

- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-2-3-files-and-company-identity.md`
  summary: A permanent upload failure is remembered only in memory, so a reload re-queues the file.
  evidence: `apps/web/src/sync/engine.ts` keeps `permanentlyFailed` in an in-session Set. The Dexie `files` table has no dead state, and widening its schema was outside this story. Severity low.
  class: debt
  state: ~~open~~ closed (2026-09-25, Story 6.2: `FileBlobRow.upload_error` `{state: 'dead' | 'failed', code, at}` persists in Dexie; a `dead` file is never retried on its own, the tile's pill clears it and runs "Sincronizar agora"; the in-memory `permanentlyFailed` Set is gone)

- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-2-3-files-and-company-identity.md`
  summary: Two devices creating the first Empresa row offline produce two `empresa` rows, with no convergence rule.
  evidence: `apps/web/src/db/home-store.ts`'s `empresaRow` picks the first row of kind `empresa`, and `empresa-tab.tsx` mints a fresh id per mount until a row has been pulled. A singleton or lowest-uuid-wins rule belongs with Epic 7's consumer of the company profile. Severity medium.
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-2-3-files-and-company-identity.md`
  summary: MinIO's `ListObjectsV2` hides variant keys because the `{id}` object shadows the `{id}/` prefix.
  evidence: Reads by key work and are pinned by `apps/api/src/http/files.integration.test.ts`; only listing-based tooling (a future backup, lifecycle or audit job) would miss the variants. Real S3 does not behave this way, and the key scheme is what AD-7 mandates. Severity low.
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-2-3-files-and-company-identity.md`
  summary: `applyOp`'s create path does not re-check `value.id` against the path id; the invariant is enforced only by `opSchema` at the push boundary.
  evidence: Independent review 2026-09-22. `packages/domain/src/ops/apply.ts:172` parses `op.value` without comparing ids. Any future server-side emitter that bypasses `opSchema` would materialize a row whose JSON id differs from its key; `apps/api/src/http/files.ts` now guards itself against such a row, but the kernel rule would be the general fix. Severity medium.
  class: bug
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-2-3-files-and-company-identity.md`
  summary: Epic 2 ends with two different `PreIssueRow` shapes in the kernel (`checks/pre-issue.ts`'s `CompanyPreIssueRow` and `checks/pre-issue-client.ts`'s `PreIssueRow`).
  evidence: Merge reconciliation 2026-09-22 between this batch and the parallel Stories 2.4-2.6 batch: both landed an isolated warning-row helper with its own row shape (`{id, severity, text, action?}` vs `{key, text}`). They were kept separate so neither batch's tests had to change; Epic 7's real `preIssue(snapshot)` aggregator (AD-15) unifies them when it reads both. Severity low.
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-2-3-files-and-company-identity.md`
  summary: On phone the Empresa tab puts ~500 px of chrome above the first field, so only one of its eight fields is above the fold.
  evidence: Independent review 2026-09-22, measured at 390x664 with the session banner showing: app bar 56 px, banner 128 px, the (pre-existing) three-row tab strip 177 px, this story's own `.section-note` 78 px, first field at 500 px. The brand preview is not the cause -- it renders after the whole form at 390 and 768 px and becomes the right column only at 1280 px. The one lever this story owns is the note's length. Severity low.
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-registries-phone-tab-selector.md`
  summary: The `:has()` CSS selector the phone tab-strip fix relies on has no documented minimum browser target for the project.
  evidence: Internal review pass 2026-09-22. `apps/web/src/styles/app.css`'s `.registry-main:has(.registry-list, .home-empty) > .section-note { order: 3; }` follows a pre-existing pattern already used at `apps/web/src/styles/components.css:238`, not introduced by this diff. Support is broad but not universal (Safari 15.4+, Chrome 105+, Firefox 121+); on an unsupported browser the rule silently does not match and `.section-note` falls back to DOM order (before the toolbar/list) with no visible error. Settling this needs a project-wide browserslist/minimum-support decision. Severity low.
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-3-2-seed-and-standard-template.md`
  summary: Story 3.4 must handle concurrent template edits: the `templateRowSchema` superRefine links `blocks` and `skeleton`, which are last-writer-wins fields written independently, and `applyOp` throws on a row that breaks its schema.
  evidence: Independent review of PR #18, 2026-09-22 (`packages/domain/src/seed/template-rules.ts`, `ops/path.ts` template field puts, `ops/apply.ts` parse). Scenario: device 1 removes a coluna while device 2 places a block on it; the fold throws on device 1 and the company pull stops with its cursor unchanged. Unreachable today (nothing edits templates before Story 3.4). The 3.4 spec must write blocks and skeleton as one field, or make materialization tolerate and flag a dangling ref instead of throwing. Severity medium.
  class: bug
  state: closed (branch story/3-3-3-4-templates-list-and-composer: cross-field ref rule moved out of parsing, orphan blocks ignored by the view; 3.4-API-001, 3.4-E2E-005)

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-3-2-seed-and-standard-template.md`
  summary: A template row that fails the stricter schema is dropped silently by `home-store` `rows()`, so the Templates list can read empty and offer a second standard template.
  evidence: Independent review of PR #18. Only dev databases holding template rows written before Story 3.2 can hit it; no deployed data exists. Severity low.
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-3-2-seed-and-standard-template.md`
  summary: `seedStandardTemplate` is idempotent by template name only: a re-run after the seeded template was renamed seeds a second one; two concurrent runs can both create one.
  evidence: Internal and independent review of PR #18 (`apps/api/src/db/seed.ts`). Operator-only path, documented in the CLI usage. Severity low.
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-3-2-seed-and-standard-template.md`
  summary: `companyDownloaded` (the Templates empty-state gate) is a small rule living in `apps/web/src/db/sync-store.ts` rather than the kernel.
  evidence: Independent review of PR #18. It reads a sync_state column, not a sheet, so it does not break the AGENTS.md ownership rule outright; revisit when a second surface needs the same gate. Severity low.
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-3-7-porto-seguro-fixture.md`
  summary: `extract-raw-sources.md` §2.1's claim that all 94 FO.SERV-03 sheets carry zero C/NC/NA marks is false; the actual DOCX (read visually page by page, not text-extracted) shows real checkmarks throughout, uniform per block type. The fixture and its tests were built against the real marks, not the extract's claim; the extract itself is not corrected by this entry (out of this story's scope) but should be, so a future reader does not repeat the "zero marks" assumption.
  evidence: `packages/domain/fixtures/porto-seguro/data.ts` file header and `op-log.test.ts` file header record the finding and the resulting test-task deviation (no "zero checklist marks" assertion exists; instead the suite asserts the real, fixed-per-block-type NA/C pattern). Direct visual read of every one of the 94 converted DOCX pages in this story's session.
  class: docs
  state: open (extract-raw-sources.md itself not amended by this story; flagged for whoever next touches it)

- source_spec: `_bmad-output/implementation-artifacts/spec-3-7-porto-seguro-fixture.md`
  summary: Section 8 bullet 4 names "algumas seccionadoras específicas" and "o disjuntor TIE" as not tested, but every one of the 94 real sheets (including both "DISJUNTOR DE ACOPLAMENTO" bus-tie breakers, 1° Subsolo colunas 3 and 16) carries full, real measured values -- no sheet in the delivered document is actually blank.
  evidence: Direct visual read of all 13 seccionadora sheets (9.2), all 14 disjuntor sheets (9.3), all 7 seccionadora and 4 disjuntor sheets of the geradores subsections (9.9, 9.10): every one shows a real checklist and real test values. Since the story's AC/FR-22/FR-68/NFR-17 require the fixture to carry this documented not-tested condition, `data.ts` designates the clearest real match for "disjuntor TIE" (1° Subsolo Coluna 3's first "DISJUNTOR DE ACOPLAMENTO - REDE 1") and two seccionadora instances (1° Subsolo Coluna 1 and Coluna 17, the two single-quantity end columns) as `not_tested`, overriding their real sheet data. The real per-instance data these three sheets carried in the source is not lost -- it is simply not the data written for these three positions; see `data.ts`'s inline comments at each of the three instances.
  class: docs
  state: open (Matheus review requested: confirm or correct which specific 3 pieces of equipment section 8 bullet 4 actually refers to)

- source_spec: `_bmad-output/implementation-artifacts/spec-3-7-porto-seguro-fixture.md`
  summary: The delivered FO.SERV-03 prints no CNPJ anywhere (cover `DADOS DO CLIENTE` table has no CNPJ row, and no other page carries one), although the story's spec assumed one could be read "directly from the DOCX cover/page furniture".
  evidence: Direct visual read of the cover page and surrounding furniture; no CNPJ field exists in the printed document. `packages/domain/fixtures/porto-seguro/data.ts` `COVER.cnpj` is `null` rather than invented; `registry/client` row's `cnpj` field is `null` for the same reason.
  class: docs
  state: open (accepted as a genuine document gap; revisit only if a later, more complete copy of the report surfaces)

- source_spec: `_bmad-output/implementation-artifacts/spec-3-7-porto-seguro-fixture.md`
  summary: The three instruments' calibration date, calibration interval and accredited laboratory are not printed anywhere on the FO.SERV-03 sheets (only `Nº SÉRIE`, `RBC` and the acceptance value are); the fixture's three `registry/instrument` rows carry `calibrated_at`, `calibration_interval_months` and `laboratory` as `null`.
  evidence: Direct visual read of every instrument sub-header on all 94 sheets (`INSTRUM./FABRIC.`, `TIPO`, `Nº SÉRIE`, `RBC`, and the test parameter/acceptance row) -- none of them prints a calibration date or a laboratory name. `op-log.ts` `instrumentRow()` and `small/op-log.ts`'s inline instrument rows.
  class: debt
  state: open (no source value to transcribe; would need Bruno/Fasor's own instrument registry to fill)

- source_spec: `_bmad-output/implementation-artifacts/spec-3-7-porto-seguro-fixture.md`
  summary: The `ENSAIO DE RELAÇÃO DE TRANSFORMAÇÃO` grammar's `derived` columns (`VAL CALCULADO`, `CONDIÇÕES`) and the transformer ratio table's `connection_typed` `TAP Nº` value have no write path yet: no kernel function computes the derived columns, and no op-path family exists for a typed connection cell distinct from a measured value cell.
  evidence: `packages/domain/src/seed/schema.ts`'s own comment on `ColumnDef` ("derived: computed by the kernel, never typed"); `packages/domain/src/ops/path.ts`'s `sheet/test/cell` family addresses only `{row, col}` value cells, nothing for a row's own typed connection label. `op-log.ts` `tpTcRatioSteps`/`transformadorRatioSteps` write only the `input` and `capture` columns for this reason; the TAP number ("2 e 3" etc.) transcribed in `data.ts`'s comments is not written anywhere. Not a Story 3.7 gap to close (spec forbids touching `path.ts`/`schemas/entities.ts`); tracked for whichever Epic 5+ story adds the renderer and needs both.
  class: post-mvp
  state: open (blocked on a renderer/derived-value story; no op-path change belongs in this story)

- source_spec: `_bmad-output/implementation-artifacts/spec-3-7-porto-seguro-fixture.md`
  summary: The Porto Seguro fixture's `dataQueue` (`packages/domain/fixtures/porto-seguro/op-log.ts`) is zipped against `standardTemplate()`'s equipment blocks only by aggregate length (94 === 94), never validated per block-type/location segment.
  evidence: Edge Case Hunter review pass, 2026-09-23. A same-type reordering mistake in a future `data.ts` edit (e.g. during the not-tested-designation review already logged above) would not be caught by the total-count guard alone. A safe per-segment validation would need a tag-naming heuristic that does not exist today and risks false positives on real TAGs that don't follow a strict convention, so it is not a trivial fix to add now. Severity low.
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-3-7-porto-seguro-fixture.md`
  summary: Several `isoRows` entries in `packages/domain/fixtures/porto-seguro/data.ts` use the raw string `'2T'` for a `1 MINUTO` insulation capture cell (4 occurrences: `SUBSOLO_TRANSFORMERS` TR-1/2/4, both `COBERTURA_A`/`COBERTURA_B` TR-COB blocks), while the generator always tags that cell with unit `GΩ`, producing a composite that reads as neither a clean number nor a clear overflow marker.
  evidence: Blind Hunter review pass, 2026-09-23. Likely a field abbreviation for "> 2 TΩ" (an instrument overflow reading common on megohmmeters), but the correct value/unit representation is a domain judgment call, not a safely guessable code fix. Severity medium.
  class: debt
  state: open (Matheus/Bruno review requested, alongside the not-tested-designation item above)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-6-home-and-account-show-what-is-on-this-device.md`
  summary: The real client's full legal name, `'Porto Seguro Companhia de Seguros Gerais'`, appears in `apps/web/src/db/home-store.test.ts:65`, outside `packages/domain/fixtures/porto-seguro/` — the only path AGENTS.md's R-023 waiver permits real Porto Seguro client data.
  evidence: Independent review of PR #20 (Story 3.7), 2026-09-23, cross-checked against `git log`: the string was introduced by Story 1.6 (commit `3395035`, 2026-09-22), one day after the waiver was signed (2026-09-21), and predates this story; Story 3.7's own diff does not touch that file and its fixture keeps the same string correctly confined to `packages/domain/fixtures/porto-seguro/data.ts`. Not caught earlier because Story 1.6's own review was scoped before the waiver's client-data path restriction was exercised by a real fixture to compare against. A few other files use the bare word `Porto Seguro` (e.g. `apps/web/src/surfaces/home/home-surface.test.tsx:123`, `apps/web/src/surfaces/registries/client-panel.test.tsx:43`) which is lower concern, being also a common Brazilian place name. Severity medium.
  class: bug
  state: closed (2026-09-23, branch fix/epic-3-kernel-fixture, Epic 3 review K8: `home-store.test.ts` now uses the synthetic 'Seguradora Exemplo S.A.'; the same change replaced 'Porto Seguro' in `packages/domain/src/templates/list.test.ts` and 'Torres A e B' in `packages/domain/src/templates/section-text.test.ts`. The bare 'Porto Seguro' and 'Torres A e B' in other Epic 1 test files named above stay as they are.)

- source_spec: `_bmad-output/implementation-artifacts/spec-3-3-3-4-templates-list-and-composer.md`
  summary: The Home Templates shortcut count (`templatesSubline`) still counts archived templates, so it can disagree with the list's "Templates (n)".
  evidence: Implementation report and independent review of PR #19, 2026-09-23. Cosmetic; one kernel filter change when Home is next touched. Severity low.
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-3-3-3-4-templates-list-and-composer.md`
  summary: `templateUseCount` reads only the company pull summary, so a relatório created on this device from a template and not yet synced does not make that template "referenced"; Epic 4 (relatório creation) must count local relatório rows too before offering "Remover".
  evidence: Implementation report and independent review of PR #19 (`packages/domain/src/templates/list.ts`, `templates-surface.tsx`). Unreachable until Story 4.x creates relatórios. Severity low.
  class: debt
  state: closed (2026-09-23, branch story/4-1-4-3-project-relatorio-and-sumario: `templateUseCount(templateId, summaries, localRelatorios)` unites the summary with this device's relatório rows by id; `templates-surface.tsx` passes `relatorioRows`; kernel test `4.1-UNIT templateUseCount`, e2e `4.1-E2E-001` asserts "usado em 1 relatório" and no "Remover" before any sync)

- source_spec: `_bmad-output/implementation-artifacts/spec-3-3-3-4-templates-list-and-composer.md`
  summary: Composer section actions (Adicionar abaixo, Duplicar, Remover) and drag drops work by index captured at render or press time; a pull that reorders sections in between acts on the wrong section.
  evidence: Internal review layers and independent review of PR #19 (`packages/domain/src/templates/compose.ts` section functions, `use-reorder.ts` centres measured at press). Needs a concurrent pull while a dialog or drag is open on an office-only surface; undo restores. Resolve by stable identity if it is ever seen. Severity low.
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-3-3-3-4-templates-list-and-composer.md`
  summary: The QuantityStepper's in-flight guard (`inFlight > 0 && value !== target`) can keep showing a local count if a pulled value lands during a write and the row then settles on it without another change.
  evidence: Independent review of PR #19 (`apps/web/src/components/quantity-stepper.tsx` value effect), reasoned from code, not reproduced. Severity low.
  class: bug
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-3-6-sub-block-defaults-and-boilerplate-editor.md`
  summary: Story 3.5's `enabledSubBlocks` is unwired: Epic 4/5's `progress`/`groupForPrint`/renderer must filter sheet fields and printed sub-blocks through it once they exist.
  evidence: `packages/domain/src/templates/compose.ts` `enabledSubBlocks(config)` is the pure helper the story AC names ("a switched-off sub-block is omitted, never printed empty"); `progress`, `groupForPrint` and the renderer are Epic 4+ and do not exist yet. Kernel test `3.5-UNIT enabledSubBlocks` pins the rule.
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-3-6-sub-block-defaults-and-boilerplate-editor.md`
  summary: Story 3.6's `resolveSectionText().unresolved` is unwired: the future kernel `integrity` surface (Epic 4+) must read it per relatório section and surface gaps in the Sumário/pre-issue check.
  evidence: `packages/domain/src/templates/section-text.ts` `resolveSectionText(text, relatorioInputs)` returns `{resolved, unresolved}`; no `integrity` surface exists yet. Kernel test `3.6-UNIT resolveSectionText` pins the bracketed label and the once-per-variable list.
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-3-6-sub-block-defaults-and-boilerplate-editor.md`
  summary: `flattenSectionText` discards the seed's heading/item structure (`TextBlock.kind`) once a section's text is overridden in a template, so a future renderer cannot recover FO.SERV-03's heading/list formatting for an edited section from `section_text` alone.
  evidence: Review pass of PR (story/3-5-3-6), 2026-09-23. `packages/domain/src/templates/section-text.ts` `flattenSectionText` joins `TextBlock[]` into one plain string with no inverse parser; `section_text` on `templateBlockSchema` is a bare `string | null`. Storing structure conflicts with this story's plain-text-only mandate (FR-12/UX-DR69), so this is an accepted MVP tradeoff, not a defect to fix now; Epic 11's rich-text/renderer work must either re-derive structure from the flat text (headings/items inferred by line shape) or extend `section_text` to carry structure.
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-3-6-sub-block-defaults-and-boilerplate-editor.md`
  summary: The FR-13 kernel test ("a template edit never touches a relatório made from it") only proves `applyOp` key-isolation on a hand-built relatório row with no `section_text` or type config of its own; it does not prove that the future `instantiateTemplate` (Epic 4) deep-copies a template's `section_text` and per-type `BlockConfig` into a relatório's own Block rows at creation, which is what FR-13 actually requires.
  evidence: Review pass of PR (story/3-5-3-6), 2026-09-23. `packages/domain/src/templates/compose.test.ts`, describe block `3.5/3.6-UNIT a template edit never touches a relatório made from it (FR-13)`. `instantiateTemplate` does not exist yet (Epic 4). Epic 4's relatório-creation story must add the real copy-on-create test once instantiation exists.
  class: debt
  state: closed (2026-09-23, branch story/4-1-4-3-project-relatorio-and-sumario: `packages/domain/src/relatorio/instantiate.test.ts` `4.1-UNIT FR-13` instantiates the standard template, then edits the template's `section_text`, a type's `sub_blocks` and its name through `applyOp` (D-4 bumps `version` to 3) and asserts every relatório-side row is byte-identical, `template_version` stays 1 and the block configs are unchanged)

- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-3-6-sub-block-defaults-and-boilerplate-editor.md`
  summary: Three small, low-severity notes from PR #21's independent review, all accepted as-is rather than patched. (a) Dropping an equipment type's last placement to zero and re-adding it loses its customized subtype and sub-block toggles, reverting to the pristine seed defaults (`typeConfigFor` returns null when no placement exists) — intended by the "per-type config keyed by current placements" design, but nothing tells the user. (b) Clearing a section's whole text silently falls back to the seed default with no toast, unlike the explicit "Restaurar" action which does toast — consistent with the app's general silent-autosave pattern elsewhere, so left as-is. (c) `section-text-dialog.tsx` lowercases the domain's `SECTION_VARIABLE_LABELS` for chip button text in `apps/web`, a small presentational bend of the string-home rule (a capitalization choice, not new derived business text).
  evidence: Independent review of PR #21, 2026-09-23 (findings 6, 7, 8). Reviewer's verdict on the PR overall was "approve as-is"; these three were named as low and not blocking.
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-4-8-docx-skeleton-renderer.md`
  summary: The document control's ART/TRT row prints `—` until Story 4.2's setup field carries the typed number.
  evidence: `relatorioSetupSchema` has no ART/TRT field; `documentControlRows(snapshot, {art})` (`packages/domain/src/print/document-control.ts`) already takes the number as an input and labels the row by the responsible's council (`artLabel`), so the batch that lands Story 4.2 (or the Epic 4 retro) wires `setup.art_number` into `layoutSpec`. Pinned by `document-control.test.ts`.
  class: debt
  state: closed (2026-09-24, merge of branch story/4-2-4-6-4-7-setup-status-section-text into story/4-8-docx-skeleton-renderer's main history: `relatorioSetupSchema.art_trt_number` now exists; call sites of `documentControlRows` pass `snapshot.relatorio.setup.art_trt_number` instead of the placeholder)

- source_spec: `_bmad-output/implementation-artifacts/spec-4-8-docx-skeleton-renderer.md`
  summary: The Export dialog is mounted by the dev-only `/__fixture/export?relatorio=<id>` route, not by the Sumário's "Gerar relatório" (Story 4.3, another batch); `e2e/export.spec.ts` and `e2e/export-visual.spec.ts` drive that route.
  evidence: `apps/web/src/surfaces/fixtures/export-fixture-surface.tsx`, `apps/web/src/app.tsx` `fixtureRoutes`. After `git merge origin/main` brings Story 4.3, wire `ExportDialog` (`apps/web/src/surfaces/export/export-dialog.tsx`) to the Sumário button, re-point the two specs at it, and keep the fixture route only if the durability projects still need it (spec Design Notes, merge-back plan).
  class: debt
  state: closed (2026-09-24, branch story/4-8-docx-skeleton-renderer after merging Stories 4.1/4.3: `apps/web/src/surfaces/relatorio/generate-action.tsx` opens `ExportDialog` from the Sumário's foot, the `/__fixture/export` route and its surface are removed (no durability test used them), `e2e/export.spec.ts` 4.8-E2E-001/004 `@p0` and `e2e/export-visual.spec.ts` drive the Sumário; the batch A stub entry for the same wiring is closed with it)

- source_spec: `_bmad-output/implementation-artifacts/spec-4-8-docx-skeleton-renderer.md`
  summary: `expectedFileIds(snapshot)` lists every file of the snapshot, so a photo row another device pushed but never uploaded makes `POST /api/relatorios/{id}/generate` answer `409 not_caught_up` for every device until that upload lands.
  evidence: `packages/domain/src/print/revisions.ts` `expectedFileIds`; the full Porto Seguro fixture's 82 photo rows all carry `uploaded_at: null`, which is why the HTTP suite and the e2e use the small fixture. Decide before Epic 6 (photos) whether the barrier should list only the files this device holds locally (`pendingUploads`) or whether the dialog should name the files it waits for.
  class: debt
  state: ~~open~~ closed (2026-09-25, coordinator decision before Story 6.2 "Photos never block Gerar": `expectedFileIds` leaves out every `kind: 'photo'` row; the job renders with the photos the server holds. The Export dialog's warning row for unsent photos is Epic 7's, entry below)

- source_spec: `_bmad-output/implementation-artifacts/spec-4-8-docx-skeleton-renderer.md`
  summary: The `unchanged` short-circuit follows AD-15's family set, so a registry edit (client name or CNPJ, Empresa lines) or a `user` edit (the responsible's registration) after a revision does not count as an edit: a second "Gerar relatório" answers the old revision although the printed document control would differ.
  evidence: `apps/api/src/http/generate.ts` `editedAfter` over `editedSince` (`packages/domain/src/status/edited-since.ts`, families `relatorio/setup, location, block, sheet, file (photo), point, equipment`). A design decision for the architect (AD-15): widen the set, or let the dialog offer a forced regeneration.
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-4-8-docx-skeleton-renderer.md`
  summary: A `409 not_caught_up` whose `missing_files` name files this device holds no pending upload for is retried blindly (sync, 2 s, ten times) and then ends in the failed state without naming the files.
  evidence: `apps/web/src/surfaces/export/use-generate.ts` `request` loop (`MAX_NOT_CAUGHT_UP_RETRIES`); the 409 details (`notCaughtUpDetailsSchema`) are parsed by the contract but not shown. Related to the `expectedFileIds` entry above.
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-4-8-docx-skeleton-renderer.md`
  summary: Story 4.8's AC says `statusTable(Em campo, generate)` yields Em revisão "with a warning"; the dialog emits the status op, the warning banner is Story 4.6's (another batch).
  evidence: `apps/web/src/surfaces/export/use-generate.ts` `emitStatus('generate')`; no banner is drawn here (EXPERIENCE.md State Patterns › "Relatório exported, then edited" belongs to Story 4.6's Sumário banner).
  class: debt
  state: closed (2026-09-24, merge of branch story/4-2-4-6-4-7-setup-status-section-text: the Sumário's `issuedBannerText`/banner paragraph covers the Em campo -> Em revisão transition once a `revision` row exists; see that spec's I/O matrix row "Banner, em_revisao without a prior issue")

- source_spec: `_bmad-output/implementation-artifacts/spec-4-8-docx-skeleton-renderer.md`
  summary: With a company logo, the header's second line (form code and revision) sits under the image rather than beside both lines; the fixture has no logo, so the structure golden does not cover it.
  evidence: `apps/api/src/jobs/generate/docx.ts` header: the logo rides in the title paragraph a tab before the title, the form line is its own paragraph. Needs a real logo upload and Bruno's look at the rendered page (R-009 read); a two-cell header table is the likely fix.
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-4-8-docx-skeleton-renderer.md`
  summary: "pode fechar — o aviso chega quando terminar" holds while the user stays on that relatório's Sumário: the watcher (`useGenerate` inside the Sumário's `ExportDialog`) reconciles the device's `generate_awaiting:<id>` entry on mount, so a user who leaves for Home or another relatório gets the toast and the `issue` status op only when they come back to that Sumário (reload included).
  evidence: `apps/web/src/surfaces/export/use-generate.ts` resume effect, `apps/web/src/surfaces/relatorio/generate-action.tsx`; 4.8-E2E-004 proves the reload-and-return path. An app-level watcher beside `SyncProvider` iterating the `generate_awaiting:*` prefs is the fix; it belongs with the `relatorio-exported` notification already tracked for Epic 7 (Story 1.6 ledger entry, "`suggestions-ready`/`relatorio-exported`/`conflict` remain"). Independent review R4, 2026-09-24. Owner: Epic 7 (Export and notifications).
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-4-8-docx-skeleton-renderer.md`
  summary: A generate job's expiry counts from its `created_at` (queue time) while pg-boss's `expireInSeconds` counts from the job's start, so a job that waits more than 15 minutes behind others counts as dead to the route and the dialog, and a second press can queue a duplicate that later allocates an extra revision number.
  evidence: `packages/domain/src/print/revisions.ts` `isJobActive`/`jobExpiresAt`; `apps/api/src/jobs/generate/worker.ts` `QUEUE_OPTIONS`. Unlikely in the MVP (one company, concurrency 1, seconds per job); stamping a `started_at` in the `running` put and expiring from it is the fix. Independent review R7, 2026-09-24. Owner: Epic 7 or Epic 11 (queue under load).
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-4-8-docx-skeleton-renderer.md`
  summary: A pg-boss job whose payload fails the worker's schema is logged and skipped, and its `generation_job` row stays `queued` until the expiry makes it inactive.
  evidence: `apps/api/src/jobs/generate/worker.ts` `registerGenerateWorker`. Only the route sends this payload, so a failing one is a bug of this codebase; the expiry already unblocks the next press and the dialog now fails at the expiry. Writing `failed`/`render_failed` when `job_id` and `company_id` still parse is the fix. Independent review R9, 2026-09-24. Owner: Epic 7.
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-4-1-4-3-project-relatorio-and-sumario.md`
  summary: `Section9Tree` (`apps/web/src/surfaces/relatorio/section-9.tsx`) draws one `.s9-cabine` row per cabine with its meta, counter and "você parou aqui", and nothing under it: no colunas, no equipment rows, no chevron, no cabine Overflow ("Abrir primeira ficha", "Agrupar por tipo", "Adicionar bloco", Subir/Descer, Remover) and no block palette.
  evidence: Stories 4.1/4.3 (batch A) own the Sumário; the tree body is Stories 4.4 and 4.5 (batch B), which fill this component in place and reuse `suggestTag`, `isTagTaken`, `orderKeyBetween`, `sheetState` and `cabineProgress`.
  class: stub
  state: closed (2026-09-24, Stories 4.4/4.5, branch story/4-4-4-5-tree-and-blocks: `section-9.tsx` is replaced by `relatorio-tree.tsx`, the one tree in its Sumário and rail presentations, with the field palette, the TAG dialogs and `tree-actions.ts`)

- source_spec: `_bmad-output/implementation-artifacts/spec-4-1-4-3-project-relatorio-and-sumario.md`
  summary: `/relatorio/:id/setup?etapa=n` is `apps/web/src/surfaces/relatorio/setup-stub-surface.tsx`, a heading, one sentence and a link back to the Sumário; the Sumário's cover row and rows 1 and 3 open it.
  evidence: Story 4.2 (batch C) replaces the file and keeps the route and the `?etapa=` parameter; the Sumário's `onOpen` and the `preIssue` `setup_missing` rows are the contract it fills.
  class: stub
  state: closed (2026-09-24, spec-4-2-4-6-4-7-setup-status-section-text.md: `apps/web/src/surfaces/relatorio/setup-surface.tsx` replaces the stub with the five Etapa bands (Capa, Objetivo e escopo, Responsável, Instrumentos e certificados, Local) and the "Conclusão e parecer" placeholder band per epics.md's AC; every field autosaves as `relatorio/setup/{field}`, the altitude Suggestion field confirms `site_altitude_m`/`site_altitude_confirmed` in one batch, the instrument checkbox refuses to uncheck a sheet-referenced instrument, and "Concluir dados do relatório" gates on the new kernel `isSetupComplete`/`setupIncompleteReason`. Covered by `setup-surface.test.tsx`.)

- source_spec: `_bmad-output/implementation-artifacts/spec-4-1-4-3-project-relatorio-and-sumario.md`
  summary: `/relatorio/:id/secao/:blockId` is `apps/web/src/surfaces/relatorio/section-text-surface.tsx`, the resolved section text as read-only paragraphs (the block's `config.section_text`, else the seed's text in force, through `resolveSectionText`); the Sumário's text rows (2, 4, 5, 6) open it and read "texto padrão" / "texto do template".
  evidence: Story 4.7 (batch C) replaces the file with the editor, keeps the route, writes `block/{id}/config` `section_text` and refines the row meta once a relatório edits its own text.
  class: stub
  state: closed (2026-09-24, spec-4-2-4-6-4-7-setup-status-section-text.md: `apps/web/src/surfaces/relatorio/section-text-surface.tsx` replaces the read-only render with the plain-text editor (the shared `use-section-text-area.ts` hook, extracted from Story 3.6's `SectionTextDialog` with no behavior change), atomic variable chips, autosave to `block/{id}/config.section_text`, and "Restaurar texto do template" with "Desfazer". Covered by `section-text-surface.test.tsx`.)

- source_spec: `_bmad-output/implementation-artifacts/spec-4-1-4-3-project-relatorio-and-sumario.md`
  summary: Gerar relatório wiring: stub, owner batch D. `apps/web/src/surfaces/relatorio/generate-action.tsx` renders the foot's primary "Gerar relatório" described by `generateReason`; its press shows the toast "Gerar relatório: disponível na próxima etapa". "Pré-visualizar" beside it is `aria-disabled` with an authored reason.
  evidence: Story 4.8 (batch D) replaces the press handler with the generate job and the Export dialog and keeps the component's shape; `preIssue`'s `blocking` severity and `generateReason` are the contract it fills ("Parecer não preenchido" is the first blocking row, Story 4.6/4.8).
  class: stub
  state: closed (2026-09-24, branch story/4-8-docx-skeleton-renderer: `generate-action.tsx` opens `ExportDialog`, `aria-disabled` with the foot's `generateReason` while a `blocking` row stands; the stub toast and its copy are gone. "Pré-visualizar" stays `aria-disabled` with its authored reason until Epic 7's preview, FR-73)

- source_spec: `_bmad-output/implementation-artifacts/spec-4-2-4-6-4-7-setup-status-section-text.md`
  summary: The "Conclusão e parecer" band at the foot of `apps/web/src/surfaces/relatorio/setup-surface.tsx` (Etapa 6 in position, unnumbered in copy) is an unnumbered `.section-band` with one `.section-note` "Disponível na próxima etapa deste épico" and no fields -- a tracked stub, not the parecer verdict/generated-summary content epics.md's own AC draws for it (Story 7.4's segmented Apto/Apto com restrições/Não apto, `suggestParecer`, `composeParecer`, the Generated text field and the Parecer box preview).
  evidence: Story 4.2 (batch C) builds only the five Etapa bands the epics.md AC lists; the parecer band's real content is Epic 7 (Story 7.4)'s.
  class: stub
  state: open (owner: Epic 7, Story 7.4)

- source_spec: `_bmad-output/implementation-artifacts/spec-4-4-4-5-tree-and-blocks.md`
  summary: Opening a sheet from the tree is a stub. `openSheet(blockId)` in `apps/web/src/surfaces/relatorio/tree-actions.ts` (an equipment row's `.s9-eq-open` or the rail's `.tree-body`, and the cabine Overflow's "Abrir primeira ficha (dados da cabine)") expands the path, focuses the row, writes `last_sheet:{id}` and toasts "Abrir a ficha: disponível na próxima etapa" (authored).
  evidence: No sheet surface or ficha route exists before Epic 5; Story 5.1 replaces the toast with the navigation to the sheet and keeps the hook, so every caller already goes through it.
  class: stub
  state: closed (Epic 5 Batch A, branch story/5-1-5-4-sheet-shell-cabine-nameplate-checklist): `openSheet` writes `last_sheet:{id}` and navigates to `/relatorio/:id/ficha/:blockId`; the toast and its `openStub` copy are gone.

- source_spec: `_bmad-output/implementation-artifacts/spec-4-4-4-5-tree-and-blocks.md`
  summary: `/relatorio/:id/arvore` (`apps/web/src/surfaces/relatorio/tree-surface.tsx`) shows the rail presentation beside a `.section-note` "Abra uma ficha na árvore." (authored) where the sheet column will be; below 768 px the tree is the whole surface.
  evidence: EXPERIENCE.md mounts the rail inside a sheet on tablet and desktop; the sheet surface is Epic 5. Story 5.1 mounts `RelatorioTree presentation="rail"` in the sheet and decides whether this route stays as the phone's tree surface.
  class: stub
  state: partially closed (Epic 5 Batch A, branch story/5-1-5-4-sheet-shell-cabine-nameplate-checklist): the sheet (`apps/web/src/surfaces/ficha/ficha-surface.tsx`) mounts the rail at its left from 768 px. `/relatorio/:id/arvore` stays as the phone's tree surface and as the sheet's App bar back target; its `.section-note` beside the rail on tablet and desktop is still the authored stub.

- source_spec: `_bmad-output/implementation-artifacts/spec-4-4-4-5-tree-and-blocks.md`
  summary: The office Block palette opened from inside a sheet (EXPERIENCE.md › Block palette: "Inside a sheet (office) the palette lists that block's sub-blocks with on/off toggles") is not built; the field palette (`block-palette-field.tsx`) lists the eight equipment types only, and its ≥1280 px office rows ask TAG and Local but draw no sub-block toggles.
  evidence: The per-sheet sub-block override needs the sheet surface (Epic 5); recorded as a deferred narrowing in the Stories 4.4/4.5 spec's Design Notes.
  class: stub
  state: open (owner: Epic 5)

- source_spec: `_bmad-output/implementation-artifacts/spec-4-2-4-6-4-7-setup-status-section-text.md`
  summary: An equipment TAG rename (project-scoped, `relatorio_id: null`) never triggers the Emitido→Em revisão transition for a relatório that references the renamed equipment, even though `equipment`/`equipment/field` are in AD-22's `editedSince` family set.
  evidence: Found by the independent review of PR #27 (batch C), 2026-09-24 (`_bmad-output/implementation-artifacts/reviews/epic-4-C-review.md`, finding 9). `apps/web/src/db/commit.ts`'s `buildBatch` groups ops `byRelatorio` and skips any op with `relatorio_id == null` (`if (op.relatorio_id == null) continue;`), so `advanceOnEdit` is only ever evaluated for relatório-scoped ops. Every other family in `EDITED_SINCE_FAMILIES` is relatório-scoped and correctly covered; `equipment` alone is project-scoped by design (a TAG is shared across a project's relatórios, AD-19). Fixing it needs `buildBatch` to resolve, for a project-scoped equipment op, which of the project's relatórios have a block referencing that equipment id (no existing Dexie index supports this directly — blocks are indexed by `relatorio_id`, not `equipment_id` — so it would be a new cross-relatório scan inside `commitBatch`'s hot path, used by every write in the app). Recorded as a dated narrowing in `epics.md`'s Story 4.6 AC rather than risked as an unreviewed change to that shared path under this fix pass's time budget.
  class: bug
  state: open (owner: whichever story next touches `commit.ts`'s `buildBatch` or Epic 5's equipment work; a candidate fix is a `db.entities.where('relatorio_id').anyOf(projectRelatorioIds)` scan filtered to `entity === 'block' && row.equipment_id === id` in JS, gated behind an `emitido`-status check to keep the common case cheap)
  note: 2026-09-24, Epic 4 QA fixes (`spec-epic-4-fix-qa.md`, Q4). A later relatório of the obra now reuses the project's equipment, so this gap is no longer rare. A TAG rename made in relatório 2 changes what an Emitido relatório 1 prints, and relatório 1's status does not move. The rename dialog also gives no sign that the TAG is shared. The priority rises; the owner is unchanged.

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-4-fix-qa.md`
  summary: Q4 reuse matches only the base TAG the template position would get. An equipment renamed in an earlier relatório, or one that got a suffix at creation from a cross-type TAG collision, is not reused, and the next relatório mints a new row for that position.
  evidence: The coordinator fixed the key (base TAG plus type) on 2026-09-24. `instantiate.ts` compares `normalizeTag(row.tag)` with the base TAG computed over this run's TAGs only. A rename-aware key, or one keyed on location path and ordinal, needs a new product decision. Found by the review pass of 2026-09-24 (Blind Hunter and Edge Case Hunter).
  class: design
  state: open (owner: Epic 5's equipment work, when nameplates make an equipment's identity visible)

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-4-fix-qa.md`
  summary: Removing an equipment sheet frees (tombstones) its `equipment` row unless another live block this device holds references it (Epic 4 QA Q4, `removeSheetOps` over `projectBlockRows`). A later relatório of the obra now reuses the project's equipment, so an equipment shared with a relatório this device never pulled (another device's, not yet opened here) can still be tombstoned by a remove made here; the other relatório's block then points at a removed equipment row until someone restores it.
  evidence: `apps/web/src/surfaces/relatorio/tree-actions.ts` `removeBlock` reads only the blocks of the project's relatórios present in this device's Dexie (`projectBlockRows`); the company pull lists other relatórios by summary only, without their blocks (AD-8). Closing it needs either the server to answer "is this equipment referenced elsewhere" at remove time, a project-scope reference count, or the removal to stop tombstoning equipment altogether and leave TAG freeing to an explicit action; each is a design decision beyond the QA fix pass.
  class: bug
  state: open (owner: Epic 5's equipment work, or whichever story next touches equipment removal)

- source_spec: `_bmad-output/implementation-artifacts/spec-5-1-5-4-sheet-shell-cabine-nameplate-checklist.md`
  summary: The sheet's "Ensaios" step host `apps/web/src/surfaces/ficha/ensaios-section.tsx` renders only the step's empty anchor (`#ficha-step-ensaios`); the Measurement table, the continuous run and the Instrument picker are not drawn. `sheetProgress` already counts the step's missing cells, so a sheet cannot reach Completa through the UI until they are.
  evidence: Stories 5.1-5.4 build the shell and reserve the stepper's third step for Batch B; the spec forbids any placeholder for later stories' controls.
  class: stub
  state: closed (2026-09-24, spec-5-5-5-8-readings-instrument-conclusion.md: `ensaios-section.tsx` draws one section per enabled test with its Instrument picker (`instrument-picker.tsx`) and its Measurement tables of `measurement-field.tsx` cells, the continuous Enter run and the TTR cards below 768 px, all from the kernel's one evaluation `evaluateSheetReadings`; covered by `e2e/ficha.spec.ts` 5.5-E2E-001/002, 5.6-E2E-001, 5.7-E2E-001)

- source_spec: `_bmad-output/implementation-artifacts/spec-5-1-5-4-sheet-shell-cabine-nameplate-checklist.md`
  summary: The sheet's "Conclusão" step host `apps/web/src/surfaces/ficha/conclusao-section.tsx` renders only the step's empty anchor (`#ficha-step-conclusao`); the Conclusion control, the generated conclusion text and the sheet Observation field are not drawn (Story 5.9 has shipped "Não ensaiado" itself, above the anchor). `sheetProgress` counts the conclusion as missing until they are, and "Observações rápidas" (Story 5.2 AC 4) writes `sheet/{blockId}/observations` with no field showing it yet.
  evidence: Stories 5.1-5.4 build the shell and reserve the stepper's fourth step for Batch B; the spec forbids any placeholder for later stories' controls.
  class: stub
  state: closed (2026-09-24, spec-5-5-5-8-readings-instrument-conclusion.md: `conclusao-section.tsx` draws the sheet Observation field (required with Com restrições), the suggested pair as the shared `SuggestionField`, the Conclusion control and the shared `GeneratedTextField` with the device-composed paragraph and its Criteria line; covered by `e2e/ficha.spec.ts` 5.8-E2E-001. "Não ensaiado" stays Story 5.9's, not part of this entry's closing)

- source_spec: `_bmad-output/implementation-artifacts/spec-5-5-5-8-readings-instrument-conclusion.md`
  summary: The transformer ratio keeps the seed's single default TAP row: `TAP Nº` is not typed on the sheet and there is no "Adicionar TAP" (Story 5.6 AC 3 "per TAP for the transformer" is narrowed to that one row). Related open question: the Porto Seguro fixture's transformer stores V PRIMÁRIO 13800 under unit kV and V SECUNDÁRIO "380/220", so its ratio row computes nothing (the secondary does not parse) and would compute a wrong ratio if it did.
  evidence: the spec's Narrowings; `packages/domain/src/relatorio/readings.ts` evaluates the seed table as it stands (`connection_typed` is not honored by the Measurement table); `readings.test.ts` pins the fixture transformer's empty VAL CALCULADO ("open question 2").
  class: deferred
  state: open (owner: a later Epic 5 follow-up story on the transformer ratio)

- source_spec: `_bmad-output/implementation-artifacts/spec-5-9-not-tested-and-sheet-leftovers.md`
  summary: `useSheetReadOnly()` (`apps/web/src/surfaces/ficha/sheet-read-only.tsx`), a plain boolean context wrapped around the whole sheet `.content` block (true once `block.not_tested !== null`), is not yet read by `ensaios-section.tsx`/`conclusao-section.tsx` because they are still stubs (see the two entries above). Once Batch B builds their real content, each must read the context with `useSheetReadOnly()` inside its own component body and render its fields read-only through `ReadOnlyField` (`ficha-fields.tsx`), the same pattern this story used for the nameplate and the checklist -- no prop or signature change to `<EnsaiosSection />`/`<ConclusaoSection />` in `ficha-surface.tsx` is needed for this.
  evidence: Story 5.9 (`spec-5-9-not-tested-and-sheet-leftovers.md`, Design Notes) chose a context over threading a `readOnly` prop through call sites Batch B also edits, to avoid a merge conflict for no benefit.
  class: stub
  state: closed (2026-09-24, spec-5-5-5-8-readings-instrument-conclusion.md: `ensaios-section.tsx` and `conclusao-section.tsx` now read `useSheetReadOnly()`. On a Não ensaiada sheet each test section and the Conclusão section is `.section.is-readonly` with the reason line; `measurement-field.tsx` `ReadOnlyMeasurementField` draws each cell as an `aria-readonly` textbox with no input, unit cycle, "Não medido" or "Marcar Com restrições", so the continuous run never lands on one; `instrument-picker.tsx` shows the stored instrument as an `aria-readonly` textbox that never opens; the Conclusion control's radiogroups carry `aria-readonly` and ignore taps, arrows and Delete; no suggestion row; `components/generated-text-field.tsx` takes `readOnly` and offers no Confirmar, Editar or Substituir. The sheet Observation field stays editable (Story 5.9 AC 2). Covered by `e2e/ficha.spec.ts` 5.9-E2E-004)

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-12-fix-qa.md`
  summary: E12-R1. An offline edit of the standard template made on a device before the seed CLI upgraded that template to the current seed version, and synced after the upgrade, can write v1 content into the now-v2 template.
  evidence: `reviews/epic-12-review-qa.md` § Re-check (PR #39); the upgrade runs only from `scripts/seed-users.ts` inside one locked transaction and refuses an already edited template, so the window is a device offline across a reseed.
  class: deferred
  state: open (owner: the first story that lets a user trigger a template seed upgrade from the app)

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-12-fix-qa.md`
  summary: E12-R2. The lost-tap spec 12.1-E2E-007 alone can pass with `useHeldWhilePressed` removed (1 of 2 runs); the gate still goes red because 12.1-E2E-001 fails deterministically without the hold.
  evidence: `reviews/epic-12-review-qa.md` § Re-check (PR #39).
  class: deferred
  state: closed (2026-09-25, spec-epic-6-fix-carry-over.md: `e2e/lost-taps.durability.spec.ts` 12.1-E2E-007 now runs three rounds, one sheet each; in each the finger lifts 300 ms after the Enter commit reaches the outbox (at least 350 ms and never past 650 ms from the touch start, under the 800 ms hold cap), so the commit's render always lands while the finger is down, and the test fails with a clear message if no commit arrived before the lift. With `useHeldWhilePressed` replaced by identity it failed 4 of 4 runs (desktop Chrome and Android Chrome emulation); restored, it passed 4 of 4)

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-6-fix-carry-over.md`
  summary: E3-A9, section 8 bullet 4: the Porto Seguro fixture's three not-tested blocks give section 8 three per-block not-tested points, where the delivered document prints one merged bullet 4 ("algumas seccionadoras específicas" and "o disjuntor TIE"). How they merge into one bullet is a renderer decision, and there is no section 8 renderer yet.
  evidence: Epic 3 retrospective (`epic-3-retro-2026-09-23.md` § findings, E3-A9); `apps/api/src/jobs/generate/docx.ts` renders no section 8, and `derivedPoints` does not exist (Epic 6 context). Not buildable in the carry-over batch, whose boundaries forbid rendering section 8 or building `derivedPoints`.
  class: debt
  state: open (owner: ~~Story 6.6 for `derivedPoints` and the merge rule,~~ Epic 7 for the section 8 renderer). 2026-09-25, Story 6.6 (`spec-6-6-points-of-attention.md`): the data half landed. `derivedPoints(snapshot)` (`packages/domain/src/points/derived.ts`) lists every untested sheet after the manual points in tree order, suppressed by a live `origin: not_tested` point of the same equipment, and `groupDerivedPoints(entries)` merges consecutive entries with the same reason and justification into one group. The Porto Seguro fixture stores its three not-tested points, so it derives nothing; the printed sentence of a merged bullet 4 (and whether stored `not_tested` points merge the same way) stays open for the Epic 7 renderer.

- source_spec: `_bmad-output/implementation-artifacts/spec-6-6-points-of-attention.md`
  summary: Narrowing. The point editor saves on "Concluir" only; text typed and not yet concluded is not kept in the `drafts` store, so a tab discarded mid-edit loses it.
  evidence: `apps/web/src/surfaces/points/point-editor.tsx`; the spec's Design Notes allow the explicit save and ask for a note when the drafts store is not wired.
  class: deferred
  state: open (owner: Epic 6 follow-up, with the drafts reopen offer of FR-61)

- source_spec: `_bmad-output/implementation-artifacts/spec-6-6-points-of-attention.md`
  summary: Section 8 prints nothing yet: the renderer of the points (text with each `[[foto:<id>]]` resolved to its frozen "Imagem N", the action, then the derived untested entries grouped by `groupDerivedPoints`) and the no-UI `priority`, `deadline`, `owner` fields are for Epic 7 and post-MVP.
  evidence: `source-deltas.md` row 29; `apps/api/src/jobs/generate/docx.ts` renders no section 8.
  class: stub
  state: open (owner: Epic 7, section 8 renderer)

- source_spec: `_bmad-output/implementation-artifacts/spec-6-1-6-2-photo-capture-and-durability.md`
  summary: Narrowing, Story 6.3. The gallery header's Camera capture button and its "3 fotos aguardando envio" count are not built; the camera opens from the sheet's Sticky action bar and an NC row only.
  evidence: The kernel text ships (`photosPendingText` in `packages/domain/src/photos/text.ts`); the gallery surface does not exist yet.
  class: deferred
  state: open (owner: Story 6.3)

- source_spec: `_bmad-output/implementation-artifacts/spec-6-1-6-2-photo-capture-and-durability.md`
  summary: Narrowing, Story 6.4. A denied camera shows its reason and OS path, but no "Adicionar fotos" (import) beside it.
  evidence: `apps/web/src/surfaces/ficha/photo-openers.tsx` renders `.camera-denied` only; the import path, the capture sheet and the drop zone are Story 6.4's.
  class: deferred
  state: open (owner: Story 6.4)

- source_spec: `_bmad-output/implementation-artifacts/spec-6-1-6-2-photo-capture-and-durability.md`
  summary: Narrowing, Epic 8. The nameplate "Fotografar placa" single-shot tile is not built.
  evidence: `source-deltas.md` row 49; the camera's single-shot path exists only as the no-camera-API fallback (`camera-view.tsx`).
  class: deferred
  state: open (owner: Epic 8)

- source_spec: `_bmad-output/implementation-artifacts/spec-6-1-6-2-photo-capture-and-durability.md`
  summary: Narrowing, Epic 7. The Export dialog has no pre-issue warning row for photos the server does not hold yet; it drains pending uploads and generates with the photos the server holds.
  evidence: Coordinator decision 2026-09-25 (`epic-6-context.md`); photos do not print before Epic 7, so the warning row lands with the section 7 renderer. `pendingUploadCount` leaves `dead` files out so a refused photo never stalls the drain.
  class: deferred
  state: open (owner: Epic 7)

- source_spec: `_bmad-output/implementation-artifacts/spec-6-1-6-2-photo-capture-and-durability.md`
  summary: Narrowing, Epic 11. A geolocation denial is recorded as the device-local pref `geolocation_denied`, not as an op on the account row.
  evidence: `apps/web/src/db/photo-store.ts` `writeGeolocationDenied`; the location switch surface (FR-8) that would read it is Epic 11's.
  class: deferred
  state: open (owner: Epic 11)

- source_spec: `_bmad-output/implementation-artifacts/spec-6-1-6-2-photo-capture-and-durability.md`
  summary: AD-17's `device_id` tie-breaker is not a column of the photo row; Story 6.3's `numberPhotos` must take it from the create op's `device_id` (or the UUIDv7 `id`).
  evidence: `photoFileRowSchema` (`packages/domain/src/schemas/entities.ts`) carries `captured_at` and `local_seq` only, by the spec's Code Map.
  class: deferred
  state: open (owner: Story 6.3)

- source_spec: `_bmad-output/implementation-artifacts/spec-12-3-12-4-sheet-cabine-instrument-plate-nc.md`
  summary: The nameplate TAG field is prefilled from the block's TAG on screen but never written as a value; the kernel `nameplateTagPrefill({blocks, equipment}, blockId)` derives it. The section 9 renderer must print the prefill when the stored TAG cell is empty (E12-A2).
  evidence: batch C PR #37 "Known open"; `epic-12-retro-2026-09-25.md` E12-A2.
  class: stub
  state: open (owner: Epic 7 Story 7.1, print the equipment sheets)
