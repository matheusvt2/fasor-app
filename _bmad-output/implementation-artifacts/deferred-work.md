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
  state: ~~open (those routes do not exist yet; covered going forward by this PR's new DoD clause)~~ closed (2026-09-28, `spec-epic-9-deferred-sweep.md`, batch C2, A1: every route now has a cross-tenant test; the last one missing, company B's `POST /api/relatorios/{id}/preview`, answers 404 and queues no job (`preview.integration.test.ts`). The DoD clause keeps later routes covered)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-sign-in-and-hold-a-session-that-survives-offline.md`
  summary: Convert the registration save to a `user/{id}/{field}` op once the op log lands.
  evidence: `apps/web/src/api/auth-client.ts:139-144` (`saveRegistration`) still does a bare `fetch('/api/account/registration', { method: 'PUT', ... })`, not one of AD-1's five named op actions. Verified unchanged in the current tree. The op log shipped in Story 1.4, but this conversion was never done (tracked as Epic 1 retrospective A2, an architecture decision needed before Epic 2).
  class: debt
  state: ~~open (`auth-client.ts:139-144` still does a bare PUT fetch; op log shipped in 1.4 but this conversion was never done)~~ closed (2026-09-28, stale: `state/session.tsx` `doSaveRegistration` commits `registrationPuts` as `user/{id}/{field}` ops (`registration-dialog.tsx:13`); `auth.integration.test.ts` "has no registration write route")

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-sign-in-and-hold-a-session-that-survives-offline.md`
  summary: Restore the sign-out dialog's pending-sync wording and count once Story 1.5 provides sync counts.
  evidence: `apps/web/src/surfaces/account/sign-out-dialog.tsx` reads `syncCounts` from `packages/domain/src/sync/counts.ts`, shipped in commit `3395035` ("Story 1.6: Home and Account show what is on this device (#7)"). Verified: the dialog surfaces the pending count in its confirmation copy.
  class: debt
  state: closed (commit `3395035` "Story 1.6: Home and Account show what is on this device (#7)")

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-sign-in-and-hold-a-session-that-survives-offline.md`
  summary: `revokeSessions` filters on `session.company_id`, theoretically bypassable by a null-`company_id` row inserted another way.
  evidence: `apps/api/src/db/seed.ts:126-131` (`revokeSessions`) still deletes `where(and(eq(session.companyId, companyId), eq(session.userId, userId)))`; no additional guard was added. Verified unchanged since commit `be86c65` ("Story 1.3: Sign in and hold a session that survives offline (#5)"). Remains a theoretical edge case: better-auth's own hook is what stamps `company_id` on every session it creates, so the bypass needs a row inserted outside that hook.
  class: bug
  state: ~~open (unverified, theoretical edge case, unchanged since `be86c65`)~~ closed (2026-09-28, `spec-epic-9-deferred-sweep.md`, batch C2, A2: `revokeSessions` also deletes the user's sessions whose `company_id` is null; `seed.integration.test.ts`)

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
  state: ~~open~~ ~~open (owner: Story 10.4 (batch S); 2026-09-29, E9-A5)~~ closed (2026-09-29, Story 10.4: the company pull summary carries an optional `progress: {sheets, photos}` per relatório (`relatorioProgressSchema`, contract 11, `apps/api/src/sync/pull.ts` `relatorioTotals`); Sync status "Baixando" reads it through `downloadProgress`)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-what-i-did-on-the-tablet-reaches-the-office-by-itself.md`
  summary: Coalescing option (a) stays open for the architect to reconsider.
  evidence: Duplicate of `spec-1-4` item 5, cross-referenced there. Option (b) is the decision of record; option (a) is a non-blocking documented alternative.
  class: debt
  state: open (soft, non-blocking; duplicate of `spec-1-4` item 5, cross-reference)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-what-i-did-on-the-tablet-reaches-the-office-by-itself.md`
  summary: Feed the minted `device_id` into every committed op once a capture surface calls `commitBatch`.
  evidence: `apps/web/src/db/commit.ts:27-30` (`CommitDeps`) is still `{newId, now}`, no `deviceId` field; verified unchanged in the current tree. No production capture surface calls `commitBatch` yet (only the dev-only field fixture).
  class: post-mvp
  state: ~~open (`CommitDeps` in `apps/web/src/db/commit.ts:27-30` still `{newId, now}`)~~ closed (2026-09-28, stale: `apps/web/src/db/commit.ts` stamps every op with `deviceId(db)` in `commitOps` and `buildBatch`, PR #9)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-what-i-did-on-the-tablet-reaches-the-office-by-itself.md`
  summary: Define outbox retention (acked rows never pruned).
  evidence: No pruning job or retention policy exists for acked `outbox` rows in `apps/web/src/db/`. Duplicate of `spec-1-8` item 1, cross-referenced there.
  class: debt
  state: ~~open (duplicate of `spec-1-8` item 1, cross-reference)~~ re-owned (owner: Matheus, via `bmad-correct-course`; 2026-09-30, Epic 11 batch C: Epic 11 has no sync retention story, so no batch can own it; a correct-course pass decides whether to add one (R10-12 also expected that story to split `engine.ts` and `apply.ts`) or to date it post-MVP)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-what-i-did-on-the-tablet-reaches-the-office-by-itself.md`
  summary: Assert the request log carries `relatorio_id` for the relatório stream route.
  evidence: No structured-logging assertion for `relatorio_id` on `GET /api/sync/relatorios/{id}` was found in `apps/api/src/sync/*.test.ts`. Unverified either way beyond that absence.
  class: test-gap
  state: ~~open (unverified)~~ closed (2026-09-28, `spec-epic-9-deferred-sweep.md`, batch C2, A3: `apps/api/src/http/request-log.integration.test.ts` asserts the `http_request` line of a relatório stream pull and of a generate press carries its `relatorio_id`)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-what-i-did-on-the-tablet-reaches-the-office-by-itself.md`
  summary: Move Story 1.3 account calls onto contract route definitions.
  evidence: `apps/web/src/api/auth-client.ts` still calls literal path strings (`/api/account`, `/api/account/registration`); `packages/domain/src/contract/index.ts:28-34` documents the shapes but defines no `ACCOUNT_ROUTES` path constants the way other contract routes are defined. Verified unchanged in the current tree.
  class: debt
  state: ~~open (`auth-client.ts` still calls literal paths; no `ACCOUNT_ROUTES` in the contract)~~ closed (2026-09-28, stale: `ACCOUNT_ROUTES` in `packages/domain/src/contract/index.ts:47`, read by `apps/web/src/api/auth-client.ts`; the registration is written as ops, so no account write route is left, PR #9)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-what-i-did-on-the-tablet-reaches-the-office-by-itself.md`
  summary: Add the sync badge's short word for every state.
  evidence: `packages/domain/src/sync/counts.ts` (`syncBadgeShortLabel`) and its test `packages/domain/src/sync/counts.test.ts:99` cover `'conflict'` and every other `SyncBadgeState`. Verified present and tested.
  class: bug
  state: closed (commit `3395035` "Story 1.6: Home and Account show what is on this device (#7)")

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-what-i-did-on-the-tablet-reaches-the-office-by-itself.md`
  summary: Re-auth banner dismiss must not fire a sync cycle at once.
  evidence: `dismissReAuth` exists at `apps/web/src/state/session.tsx:225` (added in commit `3395035`), but no UI surface calls it yet, and `apps/web/src/state/sync.tsx:120` still calls `engine.resume()` unconditionally on the online-status effect. Verified both facts in the current tree.
  class: bug
  state: ~~open, partially advanced (`dismissReAuth` now exists, `apps/web/src/state/session.tsx:225`, added in `3395035`, but no UI surface calls it yet and `sync.tsx:120` still calls `engine.resume()` unconditionally)~~ closed (2026-09-28, `spec-epic-9-deferred-sweep.md`, batch C2, B1: the unused `dismissReAuth` is removed, so only a new sign-in clears `reAuthRequired` and the paused engine never resumes on a dismissal; `session.test.tsx` "offers no dismissal")

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-what-i-did-on-the-tablet-reaches-the-office-by-itself.md`
  summary: Define retention/compaction for `remote_ops`.
  evidence: No retention or compaction policy exists for the `remote_ops` Dexie store in `apps/web/src/db/`.
  class: debt
  state: ~~open~~ re-owned (owner: Matheus, via `bmad-correct-course`; 2026-09-30, Epic 11 batch C: Epic 11 has no sync retention story, so no batch can own it; a correct-course pass decides whether to add one (R10-12 also expected that story to split `engine.ts` and `apply.ts`) or to date it post-MVP)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-what-i-did-on-the-tablet-reaches-the-office-by-itself.md`
  summary: Decide whether "Reenviar" of a dead create must re-send later acked puts on the same entity.
  evidence: Not reachable with the current single-op batches; needs Epic 5's multi-op batches to construct the scenario.
  class: post-mvp
  state: ~~open (not reachable until Epic 5 multi-op batches)~~ ~~open (owner: Story 10.4 (batch S); 2026-09-29, E9-A5)~~ closed (2026-09-29, Story 10.4: with Story 10.1's atomic client batches a rejected batch is dead as a whole, and "Reenviar" (`resendDead`) returns every dead row to `pending` in commit order; a later put the server acked on its own stays `acked`, keeps its effect and is not re-sent, since the server already applied it. Proven by `apps/web/src/db/sync-store.test.ts` "10.4 (ledger 160)")

- source_spec: `_bmad-output/implementation-artifacts/spec-1-6-home-and-account-show-what-is-on-this-device.md`
  summary: Home card counted forms ("Baixando… n de m") once the company summary carries `progress(snapshot)`.
  evidence: Duplicate of `spec-1-5` item 1, cross-referenced there. No `progress(snapshot)` kernel function exists yet.
  class: post-mvp
  state: ~~open (duplicate of `spec-1-5` item 1, cross-reference)~~ ~~open (owner: Story 10.4 (batch S); 2026-09-29, E9-A5)~~ closed (2026-09-29, Story 10.4: `homeCards` takes the file rows and words a downloading card "Baixando… 12 de 30 fichas" from the summary `progress` (`downloadProgress().short`); without `progress` the word alone)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-6-home-and-account-show-what-is-on-this-device.md`
  summary: Decide whether `syncCounts` takes the snapshot beside the outbox.
  evidence: `packages/domain/src/sync/counts.ts` (`syncCounts`) still takes only the outbox array; no snapshot parameter. Verified unchanged in the current tree; no snapshot exists before Epic 5 (an accepted deviation recorded in the Epic 1 retrospective).
  class: debt
  state: ~~open~~ closed (2026-09-28, stale: decided without a snapshot; `syncCounts(outbox, reading)` (`packages/domain/src/sync/counts.ts:54`) takes the outbox and explicit reading rows, Story 8.1)

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
  state: "resolved by Story 11.8, superseded (2026-09-30): the root `build:image` script is deleted and `scripts/build-tagged-image.sh` is orphaned, left for Matheus to delete (a guard hook refused the deletion in batch e11d); `infra/bin/deploy` builds the self-contained `apps/api/Dockerfile.prod` (COPY, no bind mount), the ocr and caddy images for the instance's platform, tags them with the HEAD commit SHA and pushes them to ECR"

- source_spec: `_bmad-output/implementation-artifacts/spec-1-7-reach-the-local-stack-from-a-tablet-over-https.md`
  summary: `apps/api/src/db/migrate.ts` has no automated test and is not invoked by `pnpm verify`.
  evidence: No `migrate.test.ts` or `migrate*.integration.test.ts` exists under `apps/api/src/db/`. Migrations now exist (`apps/api/drizzle/0000_sweet_solo.sql`, `0001_identity.sql`, `0002_sync_device_push.sql`), but the `migrate()` function that applies them is still untested. Verified absence.
  class: test-gap
  state: ~~open (migrations now exist, but still untested)~~ closed (2026-09-28, `spec-epic-9-deferred-sweep.md`, batch C2, A4: `apps/api/src/db/migrate.integration.test.ts` runs `migrate()` on a scratch database: every journal entry applied, a second run applies nothing)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-8-nothing-captured-is-lost-when-the-tab-closes-the-network-dro.md`
  summary: Outbox retention (acked rows never pruned).
  evidence: Duplicate of `spec-1-5` item 4, cross-referenced there. No pruning job exists.
  class: debt
  state: ~~open~~ re-owned (owner: Matheus, via `bmad-correct-course`; 2026-09-30, Epic 11 batch C: Epic 11 has no sync retention story, so no batch can own it; a correct-course pass decides whether to add one (R10-12 also expected that story to split `engine.ts` and `apply.ts`) or to date it post-MVP)

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
  state: ~~open~~ closed (2026-09-28, stale: `ficha-fields.tsx`, `number-input.tsx`, `generated-text-field.tsx` and `point-editor.tsx` register draft sources)

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
  state: ~~open~~ closed (2026-09-28, `spec-epic-9-deferred-sweep.md`, batch C2, A5: `--sample-relatorio` seeds the small Porto Seguro fixture onto the named company through `seedPortoSeguroSmall` (fixed ids, one company at a time; refused with `--test`); README and CLI usage; `seed-cli.integration.test.ts`, `scripts/tooling.test.ts`)

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
  state: ~~open~~ closed (2026-09-28, `spec-epic-9-deferred-sweep.md`, batch C2, A6: `projectUser` decides create or name put again under the company lock (`applyServerBatch` `before`) and recomputes once; `seed.integration.test.ts` concurrent seeds log one create)

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-1-fix-identity-and-kernel.md`
  summary: commitBatch looks up prev_op_id outside the commit transaction with per-op sequential queries over unpruned history; byClientTsThenOpId is defined twice.
  evidence: Overlapping commits on one path or a pull in between can name a stale prev_op_id (false "mescladas" row). Revisit with the first debounced field emitter.
  class: debt
  state: ~~open~~ closed (2026-09-28, `spec-epic-9-deferred-sweep.md`, batch C2, B2: `commitBatch`, `commitFileBatch` and `commitPhotoBatch` build and apply in one Dexie rw transaction over the tables the build reads, so overlapping commits chain; one shared `byClientTsThenOpId`; `commit.test.ts` "chains two overlapping commits")

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-1-fix-identity-and-kernel.md`
  summary: Parallel api integration beforeAll re-seeds revoke the shared test users' sessions, so another file's push can get a 401 mid-test.
  evidence: Seen once in pnpm verify (1.5-API-002); re-run green. Pre-existing revocation, wider window now; belongs with retro A6. Likely closed by this PR's own fix for a related race -- `apps/api/vitest.config.ts`'s new `fileParallelism: false` (added to stop `resetTestCompanyData` from wiping a sibling file's rows) also serializes every `apps/api` integration file, which removes the interleaving this item describes. Left open rather than marked closed: no dedicated regression test proves this specific flake is gone, only that its root cause (file-level parallelism in that suite) no longer exists.
  class: test-gap
  state: ~~open (probably resolved as a side effect of this PR's fileParallelism fix; unverified by a dedicated test)~~ closed (2026-09-28, stale: `apps/api/vitest.config.ts` `fileParallelism: false` runs the api files one at a time, so no other file's `beforeAll` re-seed can revoke a session mid-test; the flake was not seen again in the gates since PR #10)

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-1-fix-ui-hygiene.md`
  summary: Grouped FilterChipGroup arrow keys move focus but not the selection (APG radiogroup expects selection to follow focus).
  evidence: Independent review of PR #12 measured aria-checked unchanged after ArrowRight; pre-existing (React Aria ToggleButtonGroup), no production caller yet. Fix with the first surface that renders filter chips, reusing the SegmentedControl keyboard contract.
  class: bug
  state: ~~open~~ closed (2026-09-28, `spec-epic-9-deferred-sweep.md`, batch C2, B3: `FilterChipGroup` is a hand-rolled radiogroup with the SegmentedControl keyboard contract (arrows, Home, End move focus and selection together); `chip.test.tsx`)

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-1-fix-ui-hygiene.md`
  summary: Esc on the draft toast leaves focus on body; on a cold load with the api down the badge reads "Sincronizado" for about 2 s until the first cycle ends.
  evidence: Independent review of PR #12. The toast has no opener to return focus to; the first-cycle window needs a "not yet confirmed" badge input the kernel does not have. Both low; revisit with the Epic 5 sheet toasts and the badge.
  class: bug
  state: ~~open~~ partially closed (2026-09-28, `spec-epic-9-deferred-sweep.md`, batch C2, B4: Esc on a toast returns focus to the element focused before, else `main`; `toast.test.tsx`). The "Sincronizado" before the first cycle stays open, re-owned to Matheus (UX): what the badge says before the server has answered once is a new badge state, a product choice

- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-register-a-test-instrument-with-its-calibration-record.md`
  summary: Component-level tests are missing for `registries-surface.tsx`, `instrumentos-tab.tsx`, `instrument-row.tsx` and the five placeholder tabs; coverage is kernel unit tests plus 4 e2e specs.
  evidence: Internal review pass 2026-09-22. `apps/web/src/surfaces/registries/instrument-panel.test.tsx` was added during triage for the most severe instance (the AC4 referenced/unreferenced branch); the remaining components have no `*.test.tsx`. Full coverage of every branch in the six new components was judged disproportionate for this pass under the story's token budget.
  class: test-gap
  state: ~~open~~ closed (2026-09-28, `spec-epic-9-deferred-sweep.md`, batch C2, B5: `registries-surface.test.tsx` (tabs, phone selector, each tab's list and empty state) and `instrumentos-tab.test.tsx` (list, add, the row's code, due state and panel))

- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-register-a-test-instrument-with-its-calibration-record.md`
  summary: A second device editing the same instrument while its panel is open on a first device shows stale text for untouched fields until that field is itself edited.
  evidence: Internal review pass 2026-09-22. `apps/web/src/surfaces/registries/instrument-panel.tsx`'s `TextField`/`NumberField`/`TestDefaultField` each seed local state once at mount (`useState(value)`) and never resync from the live row prop. Real but unconfirmed by any test; the same seed-once-never-resync pattern is already used by every other Epic 1 field editor (e.g. `RegistrationDialog`), so it predates and is not unique to this story.
  class: debt
  state: ~~open~~ ~~open (owner: Story 10.4 (batch S); 2026-09-29, E9-A5)~~ closed (2026-09-29, Story 10.4: `instrument-panel.tsx` `useLiveReseed` re-seeds `TextField`, `NumberField` and `TestDefaultField` from the live row when it changes while the field is not focused and holds no unsaved change; `instrument-panel.test.tsx` "ledger 310")

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-1-fix-sw-hold-persisted.md`
  summary: Scope the shell pin per user, or hold while any user on the device has a backlog.
  evidence: The pin is one sentinel per origin while the outbox is per user (releng-{user_id}). User B signing in with an empty outbox posts hold:false and promotes the waiting worker, releasing user A's pin. PR #8's promotion already behaved this way. Severity medium.
  class: bug
  state: ~~open~~ open, re-owned 2026-09-28 by batch C2 (owner: Matheus with the architect, AD-8): a per-user pin with promotion refused while another user holds was built and withdrawn, because a user who never signs in again would keep every other user of the device on the old shell forever; the choice between that and the current device-wide pin (or an expiring hold) is a product decision

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-1-fix-sw-hold-persisted.md`
  summary: Identify the page's build by a version stamped into index.html, not only by its entry chunk name.
  evidence: sw.js cacheHolding resolves an {entry} pin to the oldest shell cache holding that file. A deploy that changes only index.html, CSS or public/ keeps the entry name, so a job started on the newer document can be served the older one after a reload (PR #11 review 2, L-1, reproduced with a same-entry rebuild). Any JS change, including a Dexie schema bump, renames the entry, so the effect is limited to markup and styles. Severity low.
  class: bug
  state: ~~open~~ closed (2026-09-28, `spec-epic-9-deferred-sweep.md`, batch C2, B7: `shellPrecache()` (`stampShell`, `vite.config.ts`) digests every emitted file, `index.html` included, stamps the version into `<meta name="shell-version">` and `sw.js`; the page names its build by it and the worker pins `releng-shell-<version>`; `shell-version.test.ts`, `sw-lifecycle.test.ts` "pin by version", `durability.spec.ts` 1.8-E2E-006)

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-1-fix-sw-hold-persisted.md`
  summary: Keep the page's build identity correct if code splitting moves register.ts out of the entry chunk.
  evidence: register.ts currentShellEntry uses import.meta.url of the chunk that runs it, which is the entry only because the build emits one JS chunk today. A shared chunk would still be a precached hashed file of that build, but shared across builds it would reintroduce the wrong-shell pin (PR #11 review 2, L-2). Stamping a build version (item above) removes the dependency. Severity low.
  class: bug
  state: ~~open~~ closed (2026-09-28, `spec-epic-9-deferred-sweep.md`, batch C2, B7, with the entry above: the build is named by the stamped version, no longer by `import.meta.url`)

- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-2-5-2-6-registries-batch.md`
  summary: A device whose manufacturer/voltage_class create gets server-merged into another device's existing row keeps the merged-away id as a permanent, unreconciled duplicate row in its own local Dexie.
  evidence: Internal review pass 2026-09-22. The sync protocol has no "your create was superseded, rewrite to id X" signal, so the creating device's optimistic local row is never corrected by a later pull. The same pass's fix (an in-request id-redirect map in `apps/api/src/sync/apply.ts`) covers a put/remove arriving in the *same* push batch as the merging create, but not this client-side residue. Fixing it needs a sync-protocol extension (e.g. a redirect/tombstone instruction in the pull response). Severity medium.
  class: debt
  state: ~~open~~ closed (2026-09-29, Story 10.1: already fixed by the Epic 2 retro D-1 pull path; the pulled `system:registry` remove of the minted id, with the create logged on the survivor, rematerializes the minting device's row to nothing, so no duplicate remains, whether the push was acked first or its answer was lost; proven by the two tests of "a server merge converges on the device that sent the merged ops (Epic 2 retro D-1)" in `apps/web/src/db/sync-store.test.ts`, the second added by Story 10.1)

- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-2-5-2-6-registries-batch.md`
  summary: The manufacturer/voltage_class normalized-name merge scans every live registry row for the company (all kinds) on every create, an O(n) scan with no SQL-level kind filter.
  evidence: Internal review pass 2026-09-22. `apps/api/src/sync/apply.ts`'s merge check loads all live `registry` entities per create and filters by kind in JS. Fine at MVP registry scale (a handful of manufacturers/voltage classes per company); revisit if registries grow large. Severity low.
  class: debt
  state: ~~open~~ closed (2026-09-28, `spec-epic-9-deferred-sweep.md`, batch C2, A7: `mergeTarget` filters by `row->>'kind'` in SQL; `sync.integration.test.ts` same name under another kind does not merge)

- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-2-5-2-6-registries-batch.md`
  summary: The registry edit panels (Clientes, Fabricantes, Classes de tensão) offer two differently-labeled controls that both close the panel ("Fechar edição" icon button, "Fechar" footer button).
  evidence: Internal review pass 2026-09-22. A pre-existing pattern carried forward verbatim from `instrument-panel.tsx` (Story 2.1, already merged), not introduced by this diff. Severity low.
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-2-3-files-and-company-identity.md`
  summary: Concurrent PUTs of the same file can still emit two `file/{id}/uploaded_at` ops.
  evidence: Independent review + fix pass 2026-09-22. `apps/api/src/http/files.ts` re-reads the row immediately after storing the object and emits the op only while `uploaded_at` is still null, which narrows the window but does not close it; closing it needs a per-file advisory lock spanning the object store. Four concurrent PUTs in the review's probe all returned the same timestamp and produced exactly one op, so the window is hard to hit. Severity low.
  class: debt
  state: ~~open~~ closed (2026-09-28, stale: `apps/api/src/http/files.ts` `emitServerOp` checks the field again under the company lock (`before`, `FieldAlreadySet`), PR #53; `files.integration.test.ts:468` sends four concurrent PUTs and gets one op)

- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-2-3-files-and-company-identity.md`
  summary: `sync_state.files_pending` is written by the upload phase and read by no surface.
  evidence: Internal review pass 2026-09-22. A grep over `apps/web/src` finds only the engine writing it; the badge that consumes it belongs to a later epic, so a failed or pending upload is invisible to the user today. Severity medium.
  class: debt
  state: ~~open~~ partially closed (2026-09-25, Story 6.2: a pending or failed photo upload is now visible on its own tile, "Aguardando envio" / "Erro — Tentar novamente" from the kernel's `photoUploadState`; `files_pending` itself is still read by no surface, and the gallery header count `photosPendingText` is Story 6.3's) -- progress 2026-09-25, Stories 6.3-6.5: the gallery header counts the pending, failed and uncaptioned photos (`galleryCounterText`) and Sumário row 7 names the unsent ones (`photos_pending_upload`); `files_pending` is still read by no surface, so non-photo files (logos, certificates) stay visible only on their own tiles

- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-2-3-files-and-company-identity.md`
  summary: A permanent upload failure is remembered only in memory, so a reload re-queues the file.
  evidence: `apps/web/src/sync/engine.ts` keeps `permanentlyFailed` in an in-session Set. The Dexie `files` table has no dead state, and widening its schema was outside this story. Severity low.
  class: debt
  state: ~~open~~ closed (2026-09-25, Story 6.2: `FileBlobRow.upload_error` `{state: 'dead' | 'failed', code, at}` persists in Dexie; a `dead` file is never retried on its own, the tile's pill clears it and runs "Sincronizar agora"; the in-memory `permanentlyFailed` Set is gone)

- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-2-3-files-and-company-identity.md`
  summary: Two devices creating the first Empresa row offline produce two `empresa` rows, with no convergence rule.
  evidence: `apps/web/src/db/home-store.ts`'s `empresaRow` picks the first row of kind `empresa`, and `empresa-tab.tsx` mints a fresh id per mount until a row has been pulled. A singleton or lowest-uuid-wins rule belongs with Epic 7's consumer of the company profile. Severity medium.
  class: debt
  state: ~~open~~ open (2026-09-29, re-owned by Story 10.1 to Epic 11 or Matheus: the merge fold of Story 10.1 decides two writes of one path, and two devices' `empresa` creates are two distinct entity ids, so no fold sees them as a pair; converging them needs a company-singleton rule for the Empresa registry, a product decision outside the merge policy)

- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-2-3-files-and-company-identity.md`
  summary: MinIO's `ListObjectsV2` hides variant keys because the `{id}` object shadows the `{id}/` prefix.
  evidence: Reads by key work and are pinned by `apps/api/src/http/files.integration.test.ts`; only listing-based tooling (a future backup, lifecycle or audit job) would miss the variants. Real S3 does not behave this way, and the key scheme is what AD-7 mandates. Severity low.
  class: debt
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-2-3-files-and-company-identity.md`
  summary: `applyOp`'s create path does not re-check `value.id` against the path id; the invariant is enforced only by `opSchema` at the push boundary.
  evidence: Independent review 2026-09-22. `packages/domain/src/ops/apply.ts:172` parses `op.value` without comparing ids. Any future server-side emitter that bypasses `opSchema` would materialize a row whose JSON id differs from its key; `apps/api/src/http/files.ts` now guards itself against such a row, but the kernel rule would be the general fix. Severity medium.
  class: bug
  state: ~~open~~ closed (2026-09-28, `spec-epic-9-deferred-sweep.md`, batch C2, A8: `createRow` refuses a create whose row id is not its path id (`SeedPathError`, a permanent refusal answered `op_invalid`); `ops/apply.test.ts`, `apply-batch.integration.test.ts`)

- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-2-3-files-and-company-identity.md`
  summary: Epic 2 ends with two different `PreIssueRow` shapes in the kernel (`checks/pre-issue.ts`'s `CompanyPreIssueRow` and `checks/pre-issue-client.ts`'s `PreIssueRow`).
  evidence: Merge reconciliation 2026-09-22 between this batch and the parallel Stories 2.4-2.6 batch: both landed an isolated warning-row helper with its own row shape (`{id, severity, text, action?}` vs `{key, text}`). They were kept separate so neither batch's tests had to change; Epic 7's real `preIssue(snapshot)` aggregator (AD-15) unifies them when it reads both. Severity low.
  class: debt
  state: ~~open~~ closed (2026-09-28, stale: as the entry planned, `preIssue` (`relatorio/pre-issue.ts:214-217`) maps both helpers' rows into its one `PreIssueRow`; no surface reads either helper shape)

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
  state: ~~open~~ closed (2026-09-28, `spec-epic-9-deferred-sweep.md`, batch C2, B8: `templateList` counts live template records that fail the schema (logged once) and the Templates empty state treats them as present, so no second standard template is offered; `templates-surface.test.tsx` "B8")

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-3-2-seed-and-standard-template.md`
  summary: `seedStandardTemplate` is idempotent by template name only: a re-run after the seeded template was renamed seeds a second one; two concurrent runs can both create one.
  evidence: Internal and independent review of PR #18 (`apps/api/src/db/seed.ts`). Operator-only path, documented in the CLI usage. Severity low.
  class: debt
  state: ~~open~~ closed (2026-09-28, `spec-epic-9-deferred-sweep.md`, batch C2, A9: any live template with a `seed_version` counts as seeded (a renamed one included; only the one still named is upgraded), and the check is repeated under the company lock; `standard-template.integration.test.ts` rename and concurrent runs)

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-3-2-seed-and-standard-template.md`
  summary: `companyDownloaded` (the Templates empty-state gate) is a small rule living in `apps/web/src/db/sync-store.ts` rather than the kernel.
  evidence: Independent review of PR #18. It reads a sync_state column, not a sheet, so it does not break the AGENTS.md ownership rule outright; revisit when a second surface needs the same gate. Severity low.
  class: debt
  state: ~~open~~ closed (2026-09-28, `spec-epic-9-deferred-sweep.md`, batch C2, B9: the rule is the kernel's `companyStreamDownloaded` (`sync/streams.ts`), read by `companyDownloaded`; `streams.test.ts`)

- source_spec: `_bmad-output/implementation-artifacts/spec-3-7-porto-seguro-fixture.md`
  summary: `extract-raw-sources.md` §2.1's claim that all 94 FO.SERV-03 sheets carry zero C/NC/NA marks is false; the actual DOCX (read visually page by page, not text-extracted) shows real checkmarks throughout, uniform per block type. The fixture and its tests were built against the real marks, not the extract's claim; the extract itself is not corrected by this entry (out of this story's scope) but should be, so a future reader does not repeat the "zero marks" assumption.
  evidence: `packages/domain/fixtures/porto-seguro/data.ts` file header and `op-log.test.ts` file header record the finding and the resulting test-task deviation (no "zero checklist marks" assertion exists; instead the suite asserts the real, fixed-per-block-type NA/C pattern). Direct visual read of every one of the 94 converted DOCX pages in this story's session.
  class: docs
  state: ~~open (extract-raw-sources.md itself not amended by this story; flagged for whoever next touches it)~~ closed (2026-09-28, `spec-epic-9-deferred-sweep.md`, batch C2, A14: the "zero marks" sentence of `extract-raw-sources.md` § 2.1 is struck through with a dated correction citing the fixture header)

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
  state: ~~open (blocked on a renderer/derived-value story; no op-path change belongs in this story)~~ closed for the derived columns (2026-09-28, stale: `packages/domain/src/relatorio/readings.ts` computes VAL CALCULADO and CONDIÇÕES, Story 5.6); the typed `TAP Nº` half lives on in the "Adicionar TAP" entry (Story 5.6 narrowing)

- source_spec: `_bmad-output/implementation-artifacts/spec-3-7-porto-seguro-fixture.md`
  summary: The Porto Seguro fixture's `dataQueue` (`packages/domain/fixtures/porto-seguro/op-log.ts`) is zipped against `standardTemplate()`'s equipment blocks only by aggregate length (94 === 94), never validated per block-type/location segment.
  evidence: Edge Case Hunter review pass, 2026-09-23. A same-type reordering mistake in a future `data.ts` edit (e.g. during the not-tested-designation review already logged above) would not be caught by the total-count guard alone. A safe per-segment validation would need a tag-naming heuristic that does not exist today and risks false positives on real TAGs that don't follow a strict convention, so it is not a trivial fix to add now. Severity low.
  class: debt
  state: ~~open~~ closed (2026-09-28, `spec-epic-9-deferred-sweep.md`, batch C2, A10: `assertInstanceFitsBlockType` checks each instance against its block type's definition before any op is written (nameplate keys, insulation form and rows, contact resistance, ratio); `op-log.test.ts` "3.7-UNIT-004". A same-type reorder is still not detectable without a TAG heuristic)

- source_spec: `_bmad-output/implementation-artifacts/spec-3-7-porto-seguro-fixture.md`
  summary: Several `isoRows` entries in `packages/domain/fixtures/porto-seguro/data.ts` use the raw string `'2T'` for a `1 MINUTO` insulation capture cell (4 occurrences: `SUBSOLO_TRANSFORMERS` TR-1/2/4, both `COBERTURA_A`/`COBERTURA_B` TR-COB blocks), while the generator always tags that cell with unit `GΩ`, producing a composite that reads as neither a clean number nor a clear overflow marker.
  evidence: Blind Hunter review pass, 2026-09-23. Likely a field abbreviation for "> 2 TΩ" (an instrument overflow reading common on megohmmeters), but the correct value/unit representation is a domain judgment call, not a safely guessable code fix. Severity medium.
  class: debt
  state: ~~open (Matheus/Bruno review requested, alongside the not-tested-designation item above)~~ open, re-owned 2026-09-28 by batch C2 (owner: Matheus with Bruno, E7-A5): what "2T" means (an overflow "> 2 TΩ" or a value) is a domain decision, and `data.ts` is being edited by batch C1

- source_spec: `_bmad-output/implementation-artifacts/spec-1-6-home-and-account-show-what-is-on-this-device.md`
  summary: The real client's full legal name, `'Porto Seguro Companhia de Seguros Gerais'`, appears in `apps/web/src/db/home-store.test.ts:65`, outside `packages/domain/fixtures/porto-seguro/` — the only path AGENTS.md's R-023 waiver permits real Porto Seguro client data.
  evidence: Independent review of PR #20 (Story 3.7), 2026-09-23, cross-checked against `git log`: the string was introduced by Story 1.6 (commit `3395035`, 2026-09-22), one day after the waiver was signed (2026-09-21), and predates this story; Story 3.7's own diff does not touch that file and its fixture keeps the same string correctly confined to `packages/domain/fixtures/porto-seguro/data.ts`. Not caught earlier because Story 1.6's own review was scoped before the waiver's client-data path restriction was exercised by a real fixture to compare against. A few other files use the bare word `Porto Seguro` (e.g. `apps/web/src/surfaces/home/home-surface.test.tsx:123`, `apps/web/src/surfaces/registries/client-panel.test.tsx:43`) which is lower concern, being also a common Brazilian place name. Severity medium.
  class: bug
  state: closed (2026-09-23, branch fix/epic-3-kernel-fixture, Epic 3 review K8: `home-store.test.ts` now uses the synthetic 'Seguradora Exemplo S.A.'; the same change replaced 'Porto Seguro' in `packages/domain/src/templates/list.test.ts` and 'Torres A e B' in `packages/domain/src/templates/section-text.test.ts`. The bare 'Porto Seguro' and 'Torres A e B' in other Epic 1 test files named above stay as they are.)

- source_spec: `_bmad-output/implementation-artifacts/spec-3-3-3-4-templates-list-and-composer.md`
  summary: The Home Templates shortcut count (`templatesSubline`) still counts archived templates, so it can disagree with the list's "Templates (n)".
  evidence: Implementation report and independent review of PR #19, 2026-09-23. Cosmetic; one kernel filter change when Home is next touched. Severity low.
  class: debt
  state: ~~open~~ closed (2026-09-28, `spec-epic-9-deferred-sweep.md`, batch C2, B10: `templatesSubline(templates)` counts `activeTemplates`, the list's own count; `cards.test.ts` "B10")

- source_spec: `_bmad-output/implementation-artifacts/spec-3-3-3-4-templates-list-and-composer.md`
  summary: `templateUseCount` reads only the company pull summary, so a relatório created on this device from a template and not yet synced does not make that template "referenced"; Epic 4 (relatório creation) must count local relatório rows too before offering "Remover".
  evidence: Implementation report and independent review of PR #19 (`packages/domain/src/templates/list.ts`, `templates-surface.tsx`). Unreachable until Story 4.x creates relatórios. Severity low.
  class: debt
  state: closed (2026-09-23, branch story/4-1-4-3-project-relatorio-and-sumario: `templateUseCount(templateId, summaries, localRelatorios)` unites the summary with this device's relatório rows by id; `templates-surface.tsx` passes `relatorioRows`; kernel test `4.1-UNIT templateUseCount`, e2e `4.1-E2E-001` asserts "usado em 1 relatório" and no "Remover" before any sync)

- source_spec: `_bmad-output/implementation-artifacts/spec-3-3-3-4-templates-list-and-composer.md`
  summary: Composer section actions (Adicionar abaixo, Duplicar, Remover) and drag drops work by index captured at render or press time; a pull that reorders sections in between acts on the wrong section.
  evidence: Internal review layers and independent review of PR #19 (`packages/domain/src/templates/compose.ts` section functions, `use-reorder.ts` centres measured at press). Needs a concurrent pull while a dialog or drag is open on an office-only surface; undo restores. Resolve by stable identity if it is ever seen. Severity low.
  class: debt
  state: ~~open~~ closed (2026-09-28, `spec-epic-9-deferred-sweep.md`, batch C2, B11: section actions carry the section's (type, occurrence) and resolve its index at write time (`resolveSectionIndex`); a removed or retyped section writes nothing, a moved one is acted on where it is; `compose.test.ts` and composer tests)

- source_spec: `_bmad-output/implementation-artifacts/spec-3-3-3-4-templates-list-and-composer.md`
  summary: The QuantityStepper's in-flight guard (`inFlight > 0 && value !== target`) can keep showing a local count if a pulled value lands during a write and the row then settles on it without another change.
  evidence: Independent review of PR #19 (`apps/web/src/components/quantity-stepper.tsx` value effect), reasoned from code, not reproduced. Severity low.
  class: bug
  state: ~~open~~ closed (2026-09-28, `spec-epic-9-deferred-sweep.md`, batch C2, B12: when the last in-flight write settles and the row holds a value neither the start value nor one it sent (a pulled value), the stepper shows it; `quantity-stepper.test.tsx` "B12")

- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-3-6-sub-block-defaults-and-boilerplate-editor.md`
  summary: Story 3.5's `enabledSubBlocks` is unwired: Epic 4/5's `progress`/`groupForPrint`/renderer must filter sheet fields and printed sub-blocks through it once they exist.
  evidence: `packages/domain/src/templates/compose.ts` `enabledSubBlocks(config)` is the pure helper the story AC names ("a switched-off sub-block is omitted, never printed empty"); `progress`, `groupForPrint` and the renderer are Epic 4+ and do not exist yet. Kernel test `3.5-UNIT enabledSubBlocks` pins the rule.
  class: debt
  state: ~~open~~ closed (2026-09-28, stale: `enabledSubBlocksOf` (`relatorio/sheet-state.ts:42`) feeds `relatorio/readings.ts`, `print/section-9.ts` and `print/section-11.ts`)

- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-3-6-sub-block-defaults-and-boilerplate-editor.md`
  summary: Story 3.6's `resolveSectionText().unresolved` is unwired: the future kernel `integrity` surface (Epic 4+) must read it per relatório section and surface gaps in the Sumário/pre-issue check.
  evidence: `packages/domain/src/templates/section-text.ts` `resolveSectionText(text, relatorioInputs)` returns `{resolved, unresolved}`; no `integrity` surface exists yet. Kernel test `3.6-UNIT resolveSectionText` pins the bracketed label and the once-per-variable list.
  class: debt
  state: ~~open~~ closed (2026-09-28, stale: `relatorio/pre-issue.ts:227-231` reads `unresolved` per section into its pre-issue rows)

- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-3-6-sub-block-defaults-and-boilerplate-editor.md`
  summary: `flattenSectionText` discards the seed's heading/item structure (`TextBlock.kind`) once a section's text is overridden in a template, so a future renderer cannot recover FO.SERV-03's heading/list formatting for an edited section from `section_text` alone.
  evidence: Review pass of PR (story/3-5-3-6), 2026-09-23. `packages/domain/src/templates/section-text.ts` `flattenSectionText` joins `TextBlock[]` into one plain string with no inverse parser; `section_text` on `templateBlockSchema` is a bare `string | null`. Storing structure conflicts with this story's plain-text-only mandate (FR-12/UX-DR69), so this is an accepted MVP tradeoff, not a defect to fix now; Epic 11's rich-text/renderer work must either re-derive structure from the flat text (headings/items inferred by line shape) or extend `section_text` to carry structure.
  class: debt
  state: ~~open~~ closed (2026-09-28, stale: the renderer took the entry's first option: `print/layout.ts` `ownParagraphs` re-derives paragraphs and items from the flat text by line shape, PR #24; a chunk whose first line was an item prints as a paragraph, as documented there)

- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-3-6-sub-block-defaults-and-boilerplate-editor.md`
  summary: The FR-13 kernel test ("a template edit never touches a relatório made from it") only proves `applyOp` key-isolation on a hand-built relatório row with no `section_text` or type config of its own; it does not prove that the future `instantiateTemplate` (Epic 4) deep-copies a template's `section_text` and per-type `BlockConfig` into a relatório's own Block rows at creation, which is what FR-13 actually requires.
  evidence: Review pass of PR (story/3-5-3-6), 2026-09-23. `packages/domain/src/templates/compose.test.ts`, describe block `3.5/3.6-UNIT a template edit never touches a relatório made from it (FR-13)`. `instantiateTemplate` does not exist yet (Epic 4). Epic 4's relatório-creation story must add the real copy-on-create test once instantiation exists.
  class: debt
  state: closed (2026-09-23, branch story/4-1-4-3-project-relatorio-and-sumario: `packages/domain/src/relatorio/instantiate.test.ts` `4.1-UNIT FR-13` instantiates the standard template, then edits the template's `section_text`, a type's `sub_blocks` and its name through `applyOp` (D-4 bumps `version` to 3) and asserts every relatório-side row is byte-identical, `template_version` stays 1 and the block configs are unchanged)

- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-3-6-sub-block-defaults-and-boilerplate-editor.md`
  summary: Three small, low-severity notes from PR #21's independent review, all accepted as-is rather than patched. (a) Dropping an equipment type's last placement to zero and re-adding it loses its customized subtype and sub-block toggles, reverting to the pristine seed defaults (`typeConfigFor` returns null when no placement exists) — intended by the "per-type config keyed by current placements" design, but nothing tells the user. (b) Clearing a section's whole text silently falls back to the seed default with no toast, unlike the explicit "Restaurar" action which does toast — consistent with the app's general silent-autosave pattern elsewhere, so left as-is. (c) `section-text-dialog.tsx` lowercases the domain's `SECTION_VARIABLE_LABELS` for chip button text in `apps/web`, a small presentational bend of the string-home rule (a capitalization choice, not new derived business text).
  evidence: Independent review of PR #21, 2026-09-23 (findings 6, 7, 8). Reviewer's verdict on the PR overall was "approve as-is"; these three were named as low and not blocking.
  class: debt
  state: ~~open~~ partially closed (2026-09-28, `spec-epic-9-deferred-sweep.md`, batch C2, B13: (c) the chip label is the kernel's `sectionVariableChipLabel`, no lowercasing in `apps/web`; `section-text.test.ts`). (a) and (b) stay open, re-owned to Matheus (UX): whether to warn when a type's config is lost at zero placements, and whether clearing a section's text toasts like "Restaurar", are product choices

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
  state: ~~open~~ open, re-owned 2026-09-28 by batch C2 (owner: Matheus with the architect): widening `EDITED_SINCE_FAMILIES` also moves the Emitido to Em revisão transition (AD-22), so it is an AD-15 decision, not a local fix

- source_spec: `_bmad-output/implementation-artifacts/spec-4-8-docx-skeleton-renderer.md`
  summary: A `409 not_caught_up` whose `missing_files` name files this device holds no pending upload for is retried blindly (sync, 2 s, ten times) and then ends in the failed state without naming the files.
  evidence: `apps/web/src/surfaces/export/use-generate.ts` `request` loop (`MAX_NOT_CAUGHT_UP_RETRIES`); the 409 details (`notCaughtUpDetailsSchema`) are parsed by the contract but not shown. Related to the `expectedFileIds` entry above.
  class: debt
  state: ~~open~~ closed (2026-09-28, `spec-epic-9-deferred-sweep.md`, batch C2, B14: a `not_caught_up` whose op is not missing and whose files no pending upload here will bring fails at once (`notCaughtUpRetryable`), and the failed state says "N arquivos ainda não chegaram ao servidor" (`missingFilesText`, authored, for Bruno); `revisions.test.ts`, `export-dialog.test.tsx`)

- source_spec: `_bmad-output/implementation-artifacts/spec-4-8-docx-skeleton-renderer.md`
  summary: Story 4.8's AC says `statusTable(Em campo, generate)` yields Em revisão "with a warning"; the dialog emits the status op, the warning banner is Story 4.6's (another batch).
  evidence: `apps/web/src/surfaces/export/use-generate.ts` `emitStatus('generate')`; no banner is drawn here (EXPERIENCE.md State Patterns › "Relatório exported, then edited" belongs to Story 4.6's Sumário banner).
  class: debt
  state: closed (2026-09-24, merge of branch story/4-2-4-6-4-7-setup-status-section-text: the Sumário's `issuedBannerText`/banner paragraph covers the Em campo -> Em revisão transition once a `revision` row exists; see that spec's I/O matrix row "Banner, em_revisao without a prior issue")

- source_spec: `_bmad-output/implementation-artifacts/spec-4-8-docx-skeleton-renderer.md`
  summary: With a company logo, the header's second line (form code and revision) sits under the image rather than beside both lines; the fixture has no logo, so the structure golden does not cover it.
  evidence: `apps/api/src/jobs/generate/docx.ts` header: the logo rides in the title paragraph a tab before the title, the form line is its own paragraph. Needs a real logo upload and Bruno's look at the rendered page (R-009 read); a two-cell header table is the likely fix.
  class: debt
  state: ~~open~~ closed (2026-09-28, `spec-epic-9-deferred-sweep.md`, batch C2, A11: with a logo the header is a two-cell borderless table (logo left, title and form lines right), unchanged without one (goldens unchanged); `docx.test.ts` "A11". The logo's width limit (half the content width) is an open question for Bruno's R-009 read) *(2026-10-23, Story 16.1: Bruno's read came as a cut logo; the image is now capped at the half minus the cell margins and the cell sized to the image plus margins, `docx.test.ts` "Story 16.1" wide and tall cases. Half the content width stays the limit (a width-capped logo now prints 0.38 cm narrower, 8.85 cm); Bruno asked only for no cut.)*

- source_spec: `_bmad-output/implementation-artifacts/spec-4-8-docx-skeleton-renderer.md`
  summary: "pode fechar — o aviso chega quando terminar" holds while the user stays on that relatório's Sumário: the watcher (`useGenerate` inside the Sumário's `ExportDialog`) reconciles the device's `generate_awaiting:<id>` entry on mount, so a user who leaves for Home or another relatório gets the toast and the `issue` status op only when they come back to that Sumário (reload included).
  evidence: `apps/web/src/surfaces/export/use-generate.ts` resume effect, `apps/web/src/surfaces/relatorio/generate-action.tsx`; 4.8-E2E-004 proves the reload-and-return path. An app-level watcher beside `SyncProvider` iterating the `generate_awaiting:*` prefs is the fix; it belongs with the `relatorio-exported` notification already tracked for Epic 7 (Story 1.6 ledger entry, "`suggestions-ready`/`relatorio-exported`/`conflict` remain"). Independent review R4, 2026-09-24. Owner: Epic 7 (Export and notifications).
  class: debt
  state: ~~open~~ closed (2026-09-28, stale: `apps/web/src/state/generate-watcher.tsx`, mounted once per session beside the sync provider, pulls each waited relatório and raises the toast wherever the user is, Story 7.5, PR #51)

- source_spec: `_bmad-output/implementation-artifacts/spec-4-8-docx-skeleton-renderer.md`
  summary: A generate job's expiry counts from its `created_at` (queue time) while pg-boss's `expireInSeconds` counts from the job's start, so a job that waits more than 15 minutes behind others counts as dead to the route and the dialog, and a second press can queue a duplicate that later allocates an extra revision number.
  evidence: `packages/domain/src/print/revisions.ts` `isJobActive`/`jobExpiresAt`; `apps/api/src/jobs/generate/worker.ts` `QUEUE_OPTIONS`. Unlikely in the MVP (one company, concurrency 1, seconds per job); stamping a `started_at` in the `running` put and expiring from it is the fix. Independent review R7, 2026-09-24. Owner: Epic 7 or Epic 11 (queue under load).
  class: debt
  state: ~~open~~ closed (2026-09-28, stale: R7, `print/revisions.ts:114-125` expires a running job from its `started_at`, written by the `running` put (`jobs/generate/job.ts:239`); `preview.integration.test.ts` "R7", PR #51)

- source_spec: `_bmad-output/implementation-artifacts/spec-4-8-docx-skeleton-renderer.md`
  summary: A pg-boss job whose payload fails the worker's schema is logged and skipped, and its `generation_job` row stays `queued` until the expiry makes it inactive.
  evidence: `apps/api/src/jobs/generate/worker.ts` `registerGenerateWorker`. Only the route sends this payload, so a failing one is a bug of this codebase; the expiry already unblocks the next press and the dialog now fails at the expiry. Writing `failed`/`render_failed` when `job_id` and `company_id` still parse is the fix. Independent review R9, 2026-09-24. Owner: Epic 7.
  class: debt
  state: ~~open~~ closed (2026-09-26, `spec-7-2-7-3-photo-record-points-certificates.md`, batch G2: `worker.ts` `handleGenerateJobs`, which `registerGenerateWorker` now runs, fails the job row with `status: failed` and `error: render_failed` as `system:generate` when the payload fails the schema but `job_id` and `company_id` parse and the `generation_job` row exists; otherwise it only logs. Covered by `worker.integration.test.ts`)

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
  state: ~~open (owner: Epic 7, Story 7.4)~~ closed (2026-09-28, stale: `apps/web/src/surfaces/relatorio/setup/etapa6-parecer.tsx`, Story 7.4, PR #51)

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
  state: ~~open (owner: whichever story next touches `commit.ts`'s `buildBatch` or Epic 5's equipment work; a candidate fix is a `db.entities.where('relatorio_id').anyOf(projectRelatorioIds)` scan filtered to `entity === 'block' && row.equipment_id === id` in JS, gated behind an `emitido`-status check to keep the common case cheap)~~ closed (2026-09-26, spec-epic-8-carry-over.md: the fix landed in PR #29, `apps/web/src/db/commit.ts` `inRelatorioStream`, unit test "E4 retro Q15"; the tree's "Renomear TAG" on an Emitido relatório is now covered end to end by 4.6-E2E-006)
  note: 2026-09-24, Epic 4 QA fixes (`spec-epic-4-fix-qa.md`, Q4). A later relatório of the obra now reuses the project's equipment, so this gap is no longer rare. A TAG rename made in relatório 2 changes what an Emitido relatório 1 prints, and relatório 1's status does not move. The rename dialog also gives no sign that the TAG is shared. The priority rises; the owner is unchanged.

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-4-fix-qa.md`
  summary: Q4 reuse matches only the base TAG the template position would get. An equipment renamed in an earlier relatório, or one that got a suffix at creation from a cross-type TAG collision, is not reused, and the next relatório mints a new row for that position.
  evidence: The coordinator fixed the key (base TAG plus type) on 2026-09-24. `instantiate.ts` compares `normalizeTag(row.tag)` with the base TAG computed over this run's TAGs only. A rename-aware key, or one keyed on location path and ordinal, needs a new product decision. Found by the review pass of 2026-09-24 (Blind Hunter and Edge Case Hunter).
  class: design
  state: ~~open (owner: Epic 5's equipment work, when nameplates make an equipment's identity visible)~~ open; assigned 2026-11-10 (evening, Matheus on M-5 of `sprint-change-proposal-2026-11-10.md`) to Epic 24, Story 24.21: the equipment stores a key at its creation and the reuse matches on it, so a rename or a suffix no longer loses the equipment. An equipment created before the story has no key, still matches by its TAG and is not covered; ~~open~~ closed 2026-11-11 by batch e24b (Story 24.21, contract 43, `spec-e24b-screen-lane.md`): the equipment stores a write-once `reuse_key` at its creation and a new relatório matches on it, so a renamed TAG or a suffixed one keeps its equipment and its previous visit. Narrowing, still open (owner: Matheus): an equipment created before the batch has no key and is still matched by its TAG, so renaming it loses its history at the next relatório (the coordinator's reading of Story 24.21)

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-4-fix-qa.md`
  summary: Removing an equipment sheet frees (tombstones) its `equipment` row unless another live block this device holds references it (Epic 4 QA Q4, `removeSheetOps` over `projectBlockRows`). A later relatório of the obra now reuses the project's equipment, so an equipment shared with a relatório this device never pulled (another device's, not yet opened here) can still be tombstoned by a remove made here; the other relatório's block then points at a removed equipment row until someone restores it.
  evidence: `apps/web/src/surfaces/relatorio/tree-actions.ts` `removeBlock` reads only the blocks of the project's relatórios present in this device's Dexie (`projectBlockRows`); the company pull lists other relatórios by summary only, without their blocks (AD-8). Closing it needs either the server to answer "is this equipment referenced elsewhere" at remove time, a project-scope reference count, or the removal to stop tombstoning equipment altogether and leave TAG freeing to an explicit action; each is a design decision beyond the QA fix pass.
  class: bug
  state: ~~open (owner: Epic 5's equipment work, or whichever story next touches equipment removal)~~ closed (2026-09-28, `spec-epic-9-deferred-sweep.md`, batch C2, B15, the conservative reading: the equipment is freed only when no other live block holds it AND every other relatório of the obra the company summary lists is on this device (`equipmentFreedByRemoval`); otherwise the TAG stays taken; `tree.test.ts`, `tree-actions.test.ts` "never pulled")

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
  state: ~~open~~ (owner: ~~Story 6.6 for `derivedPoints` and the merge rule,~~ ~~Epic 7 for the section 8 renderer~~). Closed (2026-09-26, `spec-7-2-7-3-photo-record-points-certificates.md`, batch G2: `packages/domain/src/print/section-8.ts` `derivedGroupText` composes the merged bullet, "Equipamento não ensaiado: ⟨título⟩. ⟨J⟩" for one sheet and "Equipamentos não ensaiados: ⟨t1⟩, ⟨t2⟩ e ⟨t3⟩. ⟨J⟩" for a group (authored, listed for Bruno), J being the justification or the reason's label. Stored `origin: not_tested` points print one bullet each and are not merged, so the Porto Seguro fixture prints its three stored points as three bullets; whether they should merge like derived groups stays an open question for Bruno, see the "Open questions for Bruno" entry of this spec below). 2026-09-25, Story 6.6 (`spec-6-6-points-of-attention.md`): the data half landed. `derivedPoints(snapshot)` (`packages/domain/src/points/derived.ts`) lists every untested sheet after the manual points in tree order, suppressed by a live `origin: not_tested` point of the same equipment, and `groupDerivedPoints(entries)` merges consecutive entries with the same reason and justification into one group. The Porto Seguro fixture stores its three not-tested points, so it derives nothing; the printed sentence of a merged bullet 4 (and whether stored `not_tested` points merge the same way) stays open for the Epic 7 renderer.

- source_spec: `_bmad-output/implementation-artifacts/spec-6-6-points-of-attention.md`
  summary: Narrowing. The point editor saves on "Concluir" only; text typed and not yet concluded is not kept in the `drafts` store, so a tab discarded mid-edit loses it.
  evidence: `apps/web/src/surfaces/points/point-editor.tsx`; the spec's Design Notes allow the explicit save and ask for a note when the drafts store is not wired.
  class: deferred
  state: ~~open (owner: Epic 6 follow-up, with the drafts reopen offer of FR-61)~~ closed (2026-09-25, `spec-epic-6-fix-qa.md` E6-Q2: the editor autosaves per field through `useFieldCommit`, the new point created with its pre-generated id on the first non-empty commit and field puts after (`points/point-writes.ts`); Esc, the scrim and "Concluir" flush first; uncommitted text is a `point/{id}` draft, and `usePointDraftRecovery` on the sheet and the Points surface lets "Recuperar" store it with the editor closed. `e2e/points.spec.ts` 6.6-E2E-009 and 6.6-E2E-010)

- source_spec: `_bmad-output/implementation-artifacts/spec-6-6-points-of-attention.md`
  summary: Section 8 prints nothing yet: the renderer of the points (text with each `[[foto:<id>]]` resolved to its frozen "Imagem N", the action, then the derived untested entries grouped by `groupDerivedPoints`) and the no-UI `priority`, `deadline`, `owner` fields are for Epic 7 and post-MVP.
  evidence: `source-deltas.md` row 29; `apps/api/src/jobs/generate/docx.ts` renders no section 8.
  class: stub
  state: ~~open (owner: Epic 7, section 8 renderer)~~ closed for the renderer (2026-09-26, `spec-7-2-7-3-photo-record-points-certificates.md`, batch G2: `packages/domain/src/print/section-8.ts` `resolveSection8` gives the live points in `order_key` order with each token resolved through the revision's `numberPhotos` ("imagem removida" for a photo no longer numbered) and the action after one space, then the `groupDerivedPoints` bullets; `apps/api/src/jobs/generate/sections/section-8.ts` prints one bullet each). The no-UI `priority`, `deadline` and `owner` still print nothing (`source-deltas.md` row 29, post-MVP)

- source_spec: `_bmad-output/implementation-artifacts/spec-6-1-6-2-photo-capture-and-durability.md`
  summary: Narrowing, Story 6.3. The gallery header's Camera capture button and its "3 fotos aguardando envio" count are not built; the camera opens from the sheet's Sticky action bar and an NC row only.
  evidence: The kernel text ships (`photosPendingText` in `packages/domain/src/photos/text.ts`); the gallery surface does not exist yet.
  class: deferred
  state: ~~open (owner: Story 6.3)~~ closed (2026-09-25, Stories 6.3-6.5: `apps/web/src/surfaces/photos/gallery-surface.tsx` carries the Camera capture button in its Sticky action bar, a gallery shot being "Geral", and the header counter `galleryCounterText`; `e2e/gallery.spec.ts` 6.3-E2E-001 and 6.4-E2E-003)

- source_spec: `_bmad-output/implementation-artifacts/spec-6-1-6-2-photo-capture-and-durability.md`
  summary: Narrowing, Story 6.4. A denied camera shows its reason and OS path, but no "Adicionar fotos" (import) beside it.
  evidence: `apps/web/src/surfaces/ficha/photo-openers.tsx` renders `.camera-denied` only; the import path, the capture sheet and the drop zone are Story 6.4's.
  class: deferred
  state: ~~open (owner: Story 6.4)~~ closed (2026-09-25, Stories 6.3-6.5: "Adicionar fotos" sits beside the camera in every sheet's Sticky action bar and in the gallery, and under a denied NC-row camera (`AddPhotosButton`, `RowPhotoAction`), opening the Photo capture sheet; files dropped on a sheet or the gallery take the same path)

- source_spec: `_bmad-output/implementation-artifacts/spec-6-1-6-2-photo-capture-and-durability.md`
  summary: Narrowing, Epic 8. The nameplate "Fotografar placa" single-shot tile is not built.
  evidence: `source-deltas.md` row 49; the camera's single-shot path exists only as the no-camera-API fallback (`camera-view.tsx`).
  class: deferred
  state: ~~open (owner: Epic 8)~~ closed (2026-09-28, stale: `apps/web/src/surfaces/ficha/plate-photo.tsx`, Story 8.2)

- source_spec: `_bmad-output/implementation-artifacts/spec-6-1-6-2-photo-capture-and-durability.md`
  summary: Narrowing, Epic 7. The Export dialog has no pre-issue warning row for photos the server does not hold yet; it drains pending uploads and generates with the photos the server holds.
  evidence: Coordinator decision 2026-09-25 (`epic-6-context.md`); photos do not print before Epic 7, so the warning row lands with the section 7 renderer. `pendingUploadCount` leaves `dead` files out so a refused photo never stalls the drain.
  class: deferred
  state: ~~open (owner: Epic 7)~~ closed (2026-09-28, stale: `relatorio/pre-issue.ts:251` `photos_pending_upload`, shown by the Sumário and the Export dialog)

- source_spec: `_bmad-output/implementation-artifacts/spec-6-1-6-2-photo-capture-and-durability.md`
  summary: Narrowing, Epic 11. A geolocation denial is recorded as the device-local pref `geolocation_denied`, not as an op on the account row.
  evidence: `apps/web/src/db/photo-store.ts` `writeGeolocationDenied`; the location switch surface (FR-8) that would read it is Epic 11's.
  class: deferred
  state: ~~open (owner: Epic 11)~~ closed (2026-09-30, Story 11.5, `spec-11-4-11-5-rich-text-and-location-stamp.md`: Account's "Localização nas fotos" row reads the pref (`useGeolocationDenied`) and shows "Permissão negada no aparelho" with the switch still on; a fix that arrives (`onGranted` of the position tracker) or a Permissions API state of `granted` clears it, `denied` sets it. It stays device-local by design: the OS permission is per device, so it is never an op on the account row. Tests: 11.5-E2E-002 in `e2e/photos.spec.ts`, `11.5 Account` in `account-surface.test.tsx`)

- source_spec: `_bmad-output/implementation-artifacts/spec-6-1-6-2-photo-capture-and-durability.md`
  summary: AD-17's `device_id` tie-breaker is not a column of the photo row; Story 6.3's `numberPhotos` must take it from the create op's `device_id` (or the UUIDv7 `id`).
  evidence: `photoFileRowSchema` (`packages/domain/src/schemas/entities.ts`) carries `captured_at` and `local_seq` only, by the spec's Code Map.
  class: deferred
  state: ~~open (owner: Story 6.3)~~ closed (2026-09-25, Stories 6.3-6.5: `comparePhotos` (`packages/domain/src/photos/order.ts`) and `numberPhotos` (`photos/numbering.ts`) sort by `(captured_at, local_seq, id)`; only one device fills a relatório (source-deltas row 14), so AD-17's device component collapses and the UUIDv7 `id` is the final deterministic tie-breaker)

- source_spec: `_bmad-output/implementation-artifacts/spec-12-3-12-4-sheet-cabine-instrument-plate-nc.md`
  summary: The nameplate TAG field is prefilled from the block's TAG on screen but never written as a value; the kernel `nameplateTagPrefill({blocks, equipment}, blockId)` derives it. The section 9 renderer must print the prefill when the stored TAG cell is empty (E12-A2).
  evidence: batch C PR #37 "Known open"; `epic-12-retro-2026-09-25.md` E12-A2.
  class: stub
  state: ~~open (owner: Epic 7 Story 7.1, print the equipment sheets)~~ closed (2026-09-26, `spec-7-1-section-9-equipment-sheets.md`: section 9's DADOS DO EQUIPAMENTO prints `nameplateTagPrefill` in the TAG field while it has no cell of its own; a stored TAG wins and an empty stored cell prints "-"; nothing is written. `packages/domain/src/print/section-9.ts` `nameplatePart`; `section-9.test.ts` "TAG prefill (E12-A2)")

- source_spec: `_bmad-output/implementation-artifacts/spec-6-3-6-5-gallery-import-and-captions.md`
  summary: Narrowing, Story 6.5. The Caption composer is a full-screen modal, not the mock's route (`71-legenda.html`), so one component serves the sheet tile, the gallery tile, the viewer and the gallery batch.
  evidence: `apps/web/src/surfaces/photos/caption-composer.tsx`; ~~the mock's photo preview block above the rows (`.capture-preview`, `.capture-meta`) is not drawn~~ (2026-09-25, E6-Q3: drawn for a single photo, the batch composer has none).
  class: deferred
  state: open (owner: none; revisit if Bruno asks for the route). 2026-09-25, `spec-epic-6-fix-qa.md` E6-Q3: the preview half is closed -- the composer opens on the photo (`.capture-preview` with `.number-badge`, `.capture-meta`), the caption it composes comes before the rows (pinned with a compact photo below 768 px) and "Salvar legenda" sits in a sticky `.sticky-action-bar` (`gallery.spec.ts` 6.5-E2E-003 at 390 px); the modal-not-route narrowing stands.

- source_spec: `_bmad-output/implementation-artifacts/spec-6-3-6-5-gallery-import-and-captions.md`
  summary: Narrowing, Story 6.5. Caption recents are device-local per relatório (`local_prefs` key `caption_recents:{relatorio_id}`), not synced; the Equipamento choice changes the text only, never the photo's `block_id`.
  evidence: One device fills a relatório (source-deltas row 14) and the photo row stores the caption text only; `apps/web/src/db/photo-store.ts` `pushCaptionRecents`.
  class: deferred
  state: open (owner: none)

- source_spec: `_bmad-output/implementation-artifacts/spec-6-3-6-5-gallery-import-and-captions.md`
  summary: Narrowing, Story 6.3. A gallery camera shot is "Geral" (no `block_id`, caption null); the mock's "local from the gallery filter" needs a location column the photo row does not have.
  evidence: `70-fotos.html` `.cam-hint`; `apps/web/src/surfaces/photos/gallery-surface.tsx` `GERAL_TARGET`.
  class: deferred
  state: open (owner: none)

- source_spec: `_bmad-output/implementation-artifacts/spec-6-3-6-5-gallery-import-and-captions.md`
  summary: Narrowing, Story 6.3. A removed photo comes back only through the toast's "Desfazer"; there is no restore list, and no gallery day headers (`.gallery-day`).
  evidence: `apps/web/src/surfaces/photos/gallery-surface.tsx` `remove`; the tombstone stays in the store and a `file/{id}/removed_at` null put restores it.
  class: deferred
  state: open (owner: none)

- source_spec: `_bmad-output/implementation-artifacts/spec-6-3-6-5-gallery-import-and-captions.md`
  summary: Narrowing, Story 6.4. ~~A gallery batch commits on "Adicionar N fotos" (a sheet import commits at once);~~ HEIC conversion is unit-tested with the converter mocked, and no HEIC file runs through Playwright.
  evidence: `apps/web/src/files/photo-import.test.ts`; `heic-to` is loaded by dynamic import only when a HEIC arrives.
  class: test-gap
  state: open (owner: none) for the HEIC half. 2026-09-25, `spec-epic-6-fix-qa.md` E6-Q8 closed the batch half: a gallery batch is committed on pick as "Geral" with no caption, "Adicionar N fotos" writes the `block_id` and `caption` puts in one batch (`photo-ops.ts` `assignPhotoBatch`), and "Cancelar" leaves them as "Geral" with a toast (`gallery.spec.ts` 6.4-E2E-007 and 6.4-E2E-008).

- source_spec: `_bmad-output/implementation-artifacts/spec-6-3-6-5-gallery-import-and-captions.md`
  summary: Story 6.5 open question, conservative choice taken: a composer opened on a caption that is not what its prefilled rows compose (a hand-edited caption, or a sheet shot captioned on the ensaios step, whose activity the row does not store) opens in "Editar texto" with the stored text.
  evidence: `apps/web/src/surfaces/photos/caption-composer.tsx` `ComposerBody`; the photo row stores no step or test key, so `contextCaptionParts` cannot rebuild a test activity.
  class: deferred
  state: open (owner: none; revisit with Bruno)

- source_spec: `_bmad-output/implementation-artifacts/spec-e2e-parallel-workers.md`
  summary: With 3 e2e workers on per-worker companies, `POST /api/sync/ops` slows from about 1.2 s alone to about 17 s median when pushes overlap, and 12.3-E2E-004 failed in 1 of 3 parallel full runs (never serially). The gate stays at 1 worker (`PARALLEL_WORKERS = 1`); `--workers=3` is opt-in. Probable fix: apply a push batch in one transaction (or find the shared lock/pool the pushes serialize on), then repeat the 3+3 validation of PR #45 and switch the gate if it holds.
  evidence: PR #45 body (validation table, api log timings).
  class: deferred
  state: ~~open (owner: Epic 7 carry-over batch; blocks the 18 -> ~10 min gate)~~ partially closed (2026-09-26, spec-epic-8-carry-over.md: a client push is applied as one transaction under one company lock (a refused op removes its own log row, no savepoint), before/after/mutation timings in the spec's Design Notes. The slowdown half is closed: no overlapping push took over 3 s in three 3-worker full runs (worst 2.9 s, against 33 s before). The gate half is not: each 3-worker run still failed one test the serial runs passed, so `PARALLEL_WORKERS` stays 1; see the entry below)

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-8-carry-over.md`
  summary: With the push path fixed, `test:e2e:full --workers=3` still fails one test per run that the three serial runs pass. 12.3-E2E-004 failed twice: once "Ensaios, 9 faltando" with the values on screen (the device's reading commits land after the 5 s effect window), once an NC radio not checked within its window. 6.2-E2E-001 failed once (the retried upload past its 60 s bound). All pass alone, three times each. The gate stays at one worker (`PARALLEL_WORKERS = 1`), so `verify` stays over its 15-minute budget.
  evidence: PR of branch `fix/epic-8-carry-over`, validation table (3 serial + 3 parallel runs, 2026-09-26). A host Chrome renderer used about 200 % CPU during the runs. Next steps: find why a device's commit queue slows under three browsers (IndexedDB contention, the preview server or CPU), try two workers, or widen the effect windows of the two tests.
  class: deferred
  state: ~~open (owner: Epic 9 carry-over batch; blocks the ~13 min gate)~~ closed (2026-09-27, spec-test-speed.md: 6.2-E2E-001's retry waits out the cycle in flight (`SyncEngine.retryUpload`); 12.3-E2E-004's lost tap was `humanTap`'s 10-frame settle against a Combobox closing late, now time-bounded; the tap-timing specs run in the serial group; a PUT/retry race on file server ops (6.2-E2E-003) fixed in the api; `PARALLEL_WORKERS = 3`, validation runs in the spec; the remaining device cost is the entry below)

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-6-fix-qa.md`
  summary: E6-R1. In a new point of attention, text typed right before a plain reload (no page-hidden event first) is neither committed nor kept as a draft; it is recovered when the page is hidden first (a phone going to the background).
  evidence: `reviews/epic-6-review-qa.md` § Re-check (PR #44).
  class: deferred
  state: ~~open (owner: Epic 7 carry-over batch)~~ closed (2026-09-26, spec-epic-8-carry-over.md: the point editor also writes its `point/{id}` draft 300 ms after typing stops (`state/draft-autosave.ts`), rewritten after each stored commit; the hide-time write stays; 6.6-E2E-013)

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-6-fix-qa.md`
  summary: E6-R2. Photos captioned before PR #44 open the caption composer in "Editar texto"; a chip tapped there shows pressed but the caption does not change and nothing says why.
  evidence: `reviews/epic-6-review-qa.md` § Re-check (PR #44).
  class: deferred
  state: ~~open (owner: Epic 7 carry-over batch)~~ closed (2026-09-26, spec-epic-8-carry-over.md: while "Editar texto" is on every chip of the rows is `aria-disabled`, never pressed, a tap does nothing, and an authored note under the toggle says why; `app.css` mirrors the mock's disabled `.btn` opacity for `.chip[aria-disabled]`)

- source_spec: `_bmad-output/implementation-artifacts/spec-8-3-local-ocr-service.md`
  summary: The OCR sidecar repeats `OCR_READ_MAX_BYTES` (20 MB) and the `/read` and `/health` paths as literals (`services/ocr/app/main.py`, `services/ocr/tests/test_api.py`); `ocrContractJsonSchema()` exports neither, so the kernel drift test does not cover them. Tie them when the api `ocr-svc` provider is built (export them in the schema or assert them in a test).
  evidence: Story 8.3 review, Verification Gap finding; both sides agree today.
  class: deferred
  state: ~~open (owner: Epic 8 batch R, Story 8.4)~~ closed (2026-09-27, spec-8-4-8-5-reading-job.md: `ocrContractJsonSchema()` exports a top-level `x-ocr-service` with both routes and `read_max_bytes`; `services/ocr/app/main.py` and `tests/test_api.py` read them from the committed schema, so the kernel drift test covers them)

- source_spec: `_bmad-output/implementation-artifacts/spec-8-3-local-ocr-service.md`
  summary: The sidecar reads the pixel grid as received (EXIF orientation ignored), and the api's `print` variant is re-encoded by sharp without `.rotate()`, so a photo whose pixels are stored sideways reaches OCR sideways. Decide in the reading job whether the image sent to OCR is auto-oriented first (the boxes must stay in the space of the bytes the job normalizes against).
  evidence: `apps/api/src/storage/variants.ts` `render`; `services/ocr/app/pipeline.py` `decode`.
  class: deferred
  state: ~~open (owner: Epic 8 batch R, Story 8.4)~~ closed (2026-09-27, spec-8-4-8-5-reading-job.md: the reading job reads the original's EXIF orientation and, for 2 to 8, applies it to the `print` bytes and re-encodes them in the same format without EXIF (`apps/api/src/jobs/reading/image.ts`); both providers receive those bytes and the boxes normalize over their size)

- source_spec: `_bmad-output/implementation-artifacts/spec-8-3-local-ocr-service.md`
  summary: A contract change regenerated with `pnpm schema:ocr` passes `pnpm verify` without the sidecar being rebuilt and tested; only the manual `docker compose --profile ocr build ocr` and `run --rm ocr pytest` (AGENTS.md) catch a sidecar that no longer validates its own responses.
  evidence: Story 8.3 review, Verification Gap finding; the 1.9 GB image stays out of the 15-minute gate by decision.
  class: deferred
  state: ~~open (owner: none)~~ closed (2026-09-28, stale: process rule E8-A4 in `epic-batch-orchestrator.md` § 2 and AGENTS.md: a PR touching `contract/ocr.ts`, the committed schema or `services/ocr` builds the sidecar and runs its pytest under the host lock and pastes the output; the image stays out of the gate by decision)

- source_spec: `_bmad-output/implementation-artifacts/spec-7-4-7-5-parecer-export-preview.md`
  summary: Certificate-missing stub. The pre-issue row "⟨código⟩ sem certificado" (section 11, warning) reads `packages/domain/src/checks/certificate-missing-stub.ts`, which only asks whether the registry row names a `certificate_file_id`; the rule that decides a missing certificate is Epic 7 batch G2's (Story 7.3, section 11). When both batches are on main, point `preIssue` at G2's kernel function and delete the stub.
  evidence: `packages/domain/src/relatorio/pre-issue.ts` (`certificate_missing` rows); spec-7-4-7-5 Design Notes, "Cross-batch wiring".
  class: deferred
  state: ~~open (owner: Epic 7 batch G2, or whichever of G2 and G3 merges last)~~ closed (2026-09-27, coordinator merge of Stories 7.2-7.5: `preIssue` reads `missingCertificates` from `print/section-11.ts`; the stub is deleted)

- source_spec: `_bmad-output/implementation-artifacts/spec-7-4-7-5-parecer-export-preview.md`
  summary: The pre-issue calibration and certificate rows read `snapshot.instruments`, the instruments the sheets' copied headers name; an instrument checked in Etapa 4 that no sheet uses is not in the snapshot, so it gets no row. Section 11's union (`section11Instruments`, G2) is where both meet; wire the rows over it when it lands.
  evidence: `packages/domain/src/schemas/snapshot.ts` `buildSnapshot` (instruments from sheet headers only).
  class: deferred
  state: ~~open (owner: Epic 7 batch G2 or the integrated Epic 7/8 review)~~ closed (2026-09-28, `spec-epic-9-carry-over.md`, batch C1, E7-A4: `preIssue`'s calibration rows iterate `section11Instruments(snapshot)` and judge each on its registry row, so they name exactly what section 11 prints; `pre-issue-export.test.ts` "the calibration rows follow section 11's own list")


- source_spec: `_bmad-output/implementation-artifacts/spec-7-2-7-3-photo-record-points-certificates.md`
  summary: Narrowing. Section 11 prints the placeholder line for an instrument with no certificate attached, but the pre-issue warning row for it is not built. The kernel list it reads is ready: `missingCertificates(snapshot)` in `packages/domain/src/print/section-11.ts`.
  evidence: Epic 7 context, coordinator decisions of 2026-09-26: the pre-issue rows are batch G3's (Stories 7.4/7.5), and batch G2 does not touch `preIssue`.
  class: deferred
  state: ~~open (owner: Epic 7 batch G3, Story 7.5)~~ closed (2026-09-28, `spec-epic-9-carry-over.md`, batch C1, stale: `preIssue` already builds `certificate_missing` from `missingCertificates(snapshot)` (`pre-issue.ts`, Story 7.5); `pre-issue-export.test.ts` "calibration per instrument on section 11")

- source_spec: `_bmad-output/implementation-artifacts/spec-7-2-7-3-photo-record-points-certificates.md`
  summary: Narrowing. The `integrity` finding `cert_number_mismatch` exists (`integrityFindings` with `blocks` and `instruments`, `packages/domain/src/relatorio/integrity.ts`; `Section11Instrument.cert_mismatch`), but nothing shows it yet: no pre-issue row and no Sumário line. The print uses the registry's certificate either way.
  evidence: Same boundary as the entry above; batch G2 adds the finding only.
  class: deferred
  state: ~~open (owner: Epic 7 batch G3, Story 7.5)~~ closed (2026-09-28, `spec-epic-9-carry-over.md`, batch C1, E7-A4: a `cert_number_mismatch` pre-issue row per `cert_mismatch` instrument, section 11, `info`, never blocking, listed one by one in the Export dialog; text "⟨código⟩: nº de certificado da ficha difere do cadastro" (`certNumberMismatchText`, authored, open for Bruno); `pre-issue-export.test.ts` "a sheet certificate number that differs from the registry". No Sumário line of its own beyond row 11's rows)

- source_spec: `_bmad-output/implementation-artifacts/spec-7-2-7-3-photo-record-points-certificates.md`
  summary: Open questions for Bruno, conservative choice taken. (1) Stored `origin: not_tested` points print as their own bullets and are not merged like derived groups. (2) A point's Ação recomendada prints after its text in the same bullet. (3) A photo the server does not hold keeps its number in section 7 and prints "(foto não disponível no servidor)" in place of the image. (4) A sheet's copied `cert_number` with an empty registry value is not a mismatch. Authored printed strings awaiting his review: `PHOTO_UNAVAILABLE_TEXT`, `REMOVED_PHOTO_REF_TEXT` ("imagem removida"), the derived-group sentence (one and many), the certificate placeholder "Certificado não anexado: ⟨código⟩ — ⟨nome⟩ (nº ⟨certificado⟩)", `certificatesCountText` and the two gallery lines ("Números da revisão N", "Números provisórios — serão definidos na revisão N+1").
  evidence: The spec's Design Notes ("For Bruno" and "Open questions").
  class: design
  state: open (owner: Bruno, with the Epic 7 review); 2026-11-10 (evening): question (1) and the derived-group sentence are superseded by fix batch e24h (no automatic points), since only stored points print, each as its own bullet. Questions (2) to (4) and the other strings stay open

- source_spec: `_bmad-output/implementation-artifacts/spec-7-2-7-3-photo-record-points-certificates.md`
  summary: The small Porto Seguro fixture's sheets carry `config.sub_blocks: {}`, so their test sub-blocks count as switched off and section 11 lists none of the instruments their headers name (only instruments checked at setup print). The full fixture is unaffected. Either the small fixture should enable the tests its sheets fill, or a stored header on a switched-off test should still count; the spec's rule (only enabled tests) was kept.
  evidence: `packages/domain/fixtures/porto-seguro/small/op-log.ts`; `job.integration.test.ts` and `e2e/photo-numbers.spec.ts` check the instruments at setup for that reason.
  class: deferred
  state: ~~open (owner: Epic 7 integrated review)~~ closed (2026-09-28, `spec-epic-9-carry-over.md`, batch C1, E7-A4: the small fixture's three sheets enable their type's template sub-blocks (`defaultBlockConfig(...).sub_blocks`, as the full fixture), `small/snapshot.golden.json` regenerated; the tests that checked instruments at setup for the old gap were left as they are)

- source_spec: `_bmad-output/implementation-artifacts/spec-7-1-section-9-equipment-sheets.md`
  summary: Narrowing, Story 7.1. `groupForPrint` returns an `unpaired_cable` integrity warning for an alimentação cable that feeds no live transformer of its cabine (printed last in the transformer group), but no pre-issue row or Export row shows it yet.
  evidence: `packages/domain/src/print/group-for-print.ts` `PrintGroupWarning`; `LayoutSectionSheets.warnings` carries it into the layout.
  class: deferred
  state: ~~open (owner: Epic 7 batch G3, the pre-issue shape)~~ open (owner: Matheus's decision on the `feeds_block_id` writer (entry below, "No surface writes `block/{id}/feeds_block_id`"); the row ships with that writer, because today every alimentação cable of an app-created relatório is unpaired and the user cannot act on the warning; re-owned 2026-09-28, batch C1)

- source_spec: `_bmad-output/implementation-artifacts/spec-7-1-section-9-equipment-sheets.md`
  summary: Narrowing, Story 7.1. No surface writes `block/{id}/feeds_block_id`, so every alimentação cable of a relatório created in the app prints unpaired, last in its transformer group; only the Porto Seguro fixture pairs its five 1° Subsolo cables.
  evidence: `groupForPrint` pairs by `feeds_block_id` only (never by name); the op path exists (`ops/path.ts`), no web writer.
  class: deferred
  state: open (owner: none; open question for Matheus: a pairing control on the cable sheet, or pairing at instantiation)

- source_spec: `_bmad-output/implementation-artifacts/spec-7-1-section-9-equipment-sheets.md`
  summary: Narrowing, Story 7.1. The printed ÍNDICE lists the eleven sections only; FO.SERV-03's also lists 9.1-9.11. The PDF outline already carries them as level 2 (Heading 2).
  evidence: `apps/api/src/jobs/generate/toc.ts` pages TOC entries only; `layoutSpec(...).toc` holds the sections.
  class: deferred
  state: ~~open (owner: Epic 7 integrated fix batch)~~ closed (2026-09-28, `spec-epic-9-carry-over.md`, batch C1, E7-A4: the ÍNDICE lists section 9's subsections 9.1 to 9.N at level 2, indented, after section 9, each placed from the outline's Heading 2 title (kernel `tocLines`; `toc.ts` keys by the printed number string); `toc.test.ts`, `docx.test.ts` "prints the AC parts" and "writes the page numbers", `generate.integration.test.ts` "its ÍNDICE pages equal the PDF outline")

- source_spec: `_bmad-output/implementation-artifacts/spec-7-1-section-9-equipment-sheets.md`
  summary: Narrowing, Story 7.2 AC2. A sheet marked Não ensaiado prints its plate and its reason band only, never the photos linked to it.
  evidence: `packages/domain/src/print/section-9.ts` `sheetOf`; `section-9.test.ts` "Não ensaiada".
  class: deferred
  state: open (owner: none)

- source_spec: `_bmad-output/implementation-artifacts/spec-7-1-section-9-equipment-sheets.md`
  summary: Found in Story 7.1's render check. Section 9's Heading 1 follows section 8 on the same page (no section starts a page), so the first sheet of section 9 starts mid-page and splits across two when the rest of that page is short. A page break before the first subsection leaves "9 RELATÓRIOS DOS ENSAIOS" alone at the foot of the page (LibreOffice does not carry a keep-with-next paragraph over a forced break), so the fix is a page break before the section's own Heading 1, in `docx.ts`'s sections loop.
  evidence: Porto Seguro render, pages 7-8; `apps/api/src/jobs/generate/sections/section-9.ts` breaks before every subsection after the first and every sheet after its subsection's first.
  class: deferred
  state: ~~open (owner: Epic 7 integrated fix batch, once sections 7 and 8 print)~~ closed (2026-09-28, `spec-epic-9-carry-over.md`, batch C1, E7-A4: `docx.ts` breaks the page before section 9's own Heading 1 (the breaks inside section 9 stay); `docx.test.ts` "E7-A4 section 9 starts a page", asserted from the heading)

- source_spec: `_bmad-output/implementation-artifacts/spec-7-1-section-9-equipment-sheets.md`
  summary: Found in Story 7.1. AMBIENTE DE ENSAIO prints the cabine's own `env.altitude_m` (the spec's reading); since Story 12.3 a relatório's altitude lives in its setup (`site_altitude_m`, Etapa 5) and no sheet asks the cabine's, so a relatório created in the app prints "-" for ALTITUDE.
  evidence: `packages/domain/src/relatorio/cabine.ts` (`SETUP_OWNED = 'altitude_m'`); `print/section-9.ts` `cabineParts`.
  class: deferred
  state: ~~open (owner: none; open question for Matheus: print the setup's altitude when the cabine holds none)~~ closed (2026-09-26, same batch: ownership is already decided by Story 12.3 (`SETUP_OWNED`), so AMBIENTE DE ENSAIO prints the setup's `site_altitude_m` when the cabine holds none, and a cabine value still wins; `section-9.test.ts` "ALTITUDE prints the setup altitude")

- source_spec: `_bmad-output/implementation-artifacts/spec-8-1-suggestion-entity.md`
  summary: Sync status lines "leituras na fila" and "sugestões por confirmar" are not rendered yet. `syncCounts(outbox, {suggestions, photos})` computes `readings_queued` and `suggestions_pending` (0 when the input is omitted), but `SyncProvider` still calls it with the outbox alone.
  evidence: `packages/domain/src/sync/counts.ts` `ReadingCountInputs`; `apps/web/src/state/sync.tsx` `syncCounts(rows)`.
  class: deferred
  state: ~~open (owner: Epic 8 batch P, Story 8.2)~~ closed (2026-09-27, batch P: `SyncProvider` feeds `syncCounts` from `readingCountRows` (live photos, pending rows on live blocks); Sync status shows the "Leituras" rows)

- source_spec: `_bmad-output/implementation-artifacts/spec-8-1-suggestion-entity.md`
  summary: The pre-issue row "N fichas com sugestões por confirmar" (a warning that never blocks) is not in `preIssue` yet: its text is the kernel's `fichasComSugestoesText`, but `relatorio/pre-issue.ts` stayed untouched while the Epic 7 batches run.
  evidence: `packages/domain/src/relatorio/suggestions.ts` `fichasComSugestoesText`, `blocksWithPendingSuggestions`.
  class: deferred
  state: ~~open (owner: Epic 8 batch P, Story 8.6)~~ closed (2026-09-27, batch P: `preIssue` context `pendingSuggestions` adds the section 9 warning `suggestions_pending`; Sumário and Export dialog pass the device's pending rows)

- source_spec: `_bmad-output/implementation-artifacts/spec-8-1-suggestion-entity.md`
  summary: The plate tile, the plate crop above the group (with the focused field's region), "da foto N" in the group note, the arrival toast "N leituras prontas para confirmar — Ver" and the "Sugestões prontas" banner are not built; the group note reads "N sugestões lidas. Nada foi gravado ..." without the photo number.
  evidence: `suggestionGroupNoteText` comment; `apps/web/src/surfaces/ficha/nameplate-suggestions.tsx`.
  class: deferred
  state: ~~open (owner: Epic 8 batch P, Stories 8.2 and 8.6)~~ closed (2026-09-27, batch P: `plate-photo.tsx` tile, photo row, reading lines and plate crop; "da foto N" in the note; `reading-arrivals.tsx` toast; sheet banner `suggestions-ready`)

- source_spec: `_bmad-output/implementation-artifacts/spec-8-1-suggestion-entity.md`
  summary: "Criar ⟨nome⟩?" from a suggestion's `hint.create_registry_entry` is not rendered; the row carries the hint (contract 5) and the device ignores it.
  evidence: `packages/domain/src/schemas/entities.ts` `suggestionHintSchema`.
  class: deferred
  state: ~~open (~~owner: Epic 8 batch R, Story 8.5~~ owner: Epic 8 batch P, Story 8.6, re-owned 2026-09-27: batch R emits the `hint` on the server, batch P renders "Criar ⟨nome⟩?")~~ closed (2026-09-27, batch P: `hasCreateHint`, "Criar ⟨nome⟩?" writes the manufacturer create with the confirm pair in one batch)

- source_spec: `_bmad-output/implementation-artifacts/spec-8-1-suggestion-entity.md`
  summary: A crop source fetched from the server is kept as a `crop` blob under the photo id and the eviction pass (`runEviction`) never removes it (it deletes acked `original` rows only), so every plate photo a device only viewed through a crop keeps its full original on the device.
  evidence: `apps/web/src/db/file-store.ts` `cropSourceBlob`, `runEviction`.
  class: debt
  state: ~~open (owner: none)~~ closed (2026-09-28, `spec-epic-9-carry-over.md`, batch C1, E8-A5: `runEviction` takes acked `crop` rows as candidates, sized by the blob and aged from when it was fetched; the next view downloads it again; `photo-store.test.ts` "evicts a kept crop source like an acked original")

- source_spec: `_bmad-output/implementation-artifacts/spec-8-1-suggestion-entity.md`
  summary: A pending suggestion whose target later receives an equal value by another path (a copy chip, another device's put) shows nothing on the sheet (`suggestionView` = `none`) yet stays pending and counted; auto-confirm runs only over pulled suggestion creates, and one that throws is not retried.
  evidence: `apps/web/src/db/suggestion-store.ts` `autoConfirmPulled`; `apps/web/src/sync/engine.ts` `autoConfirm` (review pass 2026-09-26).
  class: deferred
  state: ~~open (owner: Epic 8 batch P, Story 8.2 typed-first exclusion)~~ closed (2026-09-27, batch P: `autoConfirmPending` sweeps every local pending row after each pull, per row, so any path to an equal value confirms and a failed confirm is retried)

- source_spec: `_bmad-output/implementation-artifacts/spec-8-1-suggestion-entity.md`
  summary: A manufacturer typed over a suggested guess is written as a name with no registry row, where the normal field offers "Criar" first.
  evidence: `packages/domain/src/relatorio/suggestions.ts` `parseFieldInput` default branch (review pass 2026-09-26).
  class: deferred
  state: ~~open (owner: Epic 8 batch P, Story 8.6 with the "Criar ⟨nome⟩?" path)~~ closed (2026-09-27, batch P: a typed manufacturer absent from the registry is created in the same batch as the typed put and the discard, `unknownManufacturer`)

- source_spec: `_bmad-output/implementation-artifacts/spec-8-1-suggestion-entity.md`
  summary: Unverified: `cropSourceBlob` re-downloads a photo's original on every crop mount when the id already holds another blob under `files` (it keeps the fetched bytes only when the id is free).
  evidence: `apps/web/src/db/file-store.ts` `cropSourceBlob`; settle by checking whether any path stores a photo thumb under `files` (tiles read `thumbs`).
  class: debt
  state: ~~open (owner: integrated Epic 8 review)~~ closed (2026-09-28, `spec-epic-9-carry-over.md`, batch C1, E8-A5: confirmed (`ensureLocalBlob` keeps a fetched `thumb` under `files` when the id is free); `cropSourceBlob` now replaces a cached `thumb` with the fetched original as `crop`, so it is fetched once, and a failed fetch keeps the thumb; `file-store.test.ts` "over a cached thumb")

- source_spec: `_bmad-output/implementation-artifacts/spec-8-4-8-5-reading-job.md`
  summary: Narrowing, Story 8.4. Only `plate` readings run. File receipt enqueues a job only for `reading_kind: plate`, a photo queued with another kind (`display`, `caption`, `panel`, `nc_obs`) stays `queued`, the reread route answers it `400 invalid_request`, and the job fails any other kind permanently.
  evidence: `apps/api/src/http/files.ts` receipt condition; `apps/api/src/http/reading.ts`; `apps/api/src/jobs/reading/job.ts` first check.
  class: deferred
  state: open (owner: the story that introduces each reading kind)

- source_spec: `_bmad-output/implementation-artifacts/spec-8-4-8-5-reading-job.md`
  summary: The `thumb` and `print` variants are still rendered without applying the original's EXIF orientation, so a photo stored sideways shows sideways in its tile and prints sideways in the document; only the reading job orients the image it sends to OCR.
  evidence: `apps/api/src/storage/variants.ts` `render` (no `.rotate()`); `apps/api/src/jobs/reading/image.ts` orients a copy for the reading alone.
  class: deferred
  state: ~~open (owner: none)~~ ~~open (owner: the batch that may change `apps/api/src/jobs/reading/image.ts`, Epic 9 batch D or later; re-owned 2026-09-28, batch C1: rotating `thumb` and `print` in `renderVariants` alone would turn every oriented plate sideways for OCR, because the reading job applies the original's EXIF orientation to the `print` bytes again (`readingImage`), and batch C1 may not touch `jobs/reading/*`; both sides must change in one batch)~~ closed (2026-09-28, `spec-epic-9-deferred-sweep.md`, batch C2, A12: `renderVariants` auto-orients (`.rotate()` before the resize, no EXIF out) and the reading job sends the print as it is, so a plate is rotated once; `variants.test.ts` EXIF-6 original, `image.test.ts`)

- source_spec: `_bmad-output/implementation-artifacts/spec-8-4-8-5-reading-job.md`
  summary: A reading whose last attempt never returns (the api process dies mid-read, or the attempt outlives `expireInSeconds: 300`) is failed by pg-boss without `runReadingJob` seeing it, so nothing writes `reading_status = failed` and the photo stays `running` on the device, where "Tentar novamente" never shows. A dead-letter queue (`deadLetter` on the `reading` queue, its worker writing `failed` when the status is still `running`) or a boot-time sweep would close it.
  evidence: `apps/api/src/jobs/reading/worker.ts` computes `lastAttempt` only for attempts that run to completion; no `deadLetter` or failed-job handler (review pass 2026-09-27, Edge Case Hunter and Verification Gap).
  class: debt
  state: ~~open (owner: Epic 8 integrated fix batch)~~ closed (2026-09-28, `spec-epic-7-8-fix-qa.md`, E78-Q6: the `reading` queue gets the dead letter queue `reading-dead` (created first; an existing queue is updated), and its worker writes `failed` as `system:reading` while the photo is still `running` and no job of its singleton key is queued or active. Covered by `job.integration.test.ts` with a provider that never answers and a 1 s expiry. A send that fails at file receipt now writes `failed` too, E78-Q7)

- source_spec: `_bmad-output/implementation-artifacts/spec-test-speed.md`
  summary: The gate still runs over its 15-minute budget on the 4-core laptop, and the e2e cost per step is the device's: each commit rebuilds the relatório's whole snapshot through its live query (`toSnapshot` + `buildSnapshot`, about 223 ops of a standard relatório), so under CPU contention a commit's render lands late. That is why the tap-timing specs (12.1-E2E-007 lost its tap in 1 of 5 repeats beside other workers) must run alone in the serial group, and why `signIn`/`pushDrafts` cost twice as much per call at 3 workers. An incremental snapshot (or a narrower live query per surface) would shorten every e2e step and the field device's own latency.
  evidence: `spec-test-speed.md` measurements (timings reporter, repeat runs at 2 and 3 workers); `apps/web/src/db/snapshot.ts`.
  class: deferred
  state: ~~open (owner: Epic 9 carry-over batch)~~ closed (2026-09-28, `spec-epic-9-carry-over.md`, batch C1, E7-A1/E8-A1: the device snapshot is incremental (kernel `createSnapshotBuilder`, equal to `buildSnapshot`; `relatorioState` reads the relatório index once and keeps untouched rows identical by a per-write `rev`; every surface reads through `useRelatorioSnapshot`); commit-to-render before and after is in the spec's Design Notes (`e2e/commit-to-render.perf.spec.ts`); the gate time is measured by the orchestrator's `verify` runs)

- source_spec: `_bmad-output/implementation-artifacts/spec-8-2-8-6-plate-capture-and-confirm.md`
  summary: The "Fotografar placa" tile shows on every equipment sheet with a nameplate, but batch R reads only `transformador_forca` plates; a plate photo of any other type stays `queued` with "Foto guardada — leitura quando houver sinal" indefinitely.
  evidence: `apps/web/src/surfaces/ficha/nameplate-section.tsx` (tile for any block); batch R contract (coordinator message 2026-09-27: "only `transformador_forca` plates are read").
  class: deferred
  state: ~~open (owner: integrated Epic 8 fix batch; open question for Matheus: hide the tile on other types, or have the server end their reading as `failed`)~~ closed (2026-09-28, `spec-epic-9-carry-over.md`, batch C1, stale: refuted by the Epic 7/8 QA (`reviews/epic-7-8-review-qa.md` line 30): the job reads any type with a nameplate definition and a photo with no fake fixture ends `failed`, never stuck; the remaining product question lives in E78-Q2 (entry "Under the `fake` providers only `transformador_forca` has a default fixture") and E8-A3)

- source_spec: `_bmad-output/implementation-artifacts/spec-8-2-8-6-plate-capture-and-confirm.md`
  summary: A confirmed month-only date suggestion (`2024-08`, the fixture's DATA FABRICAÇÃO) shows blank in the plain date field once the cell holds it; found in Story 8.1's path, seen by batch P.
  evidence: `apps/web/src/surfaces/ficha/ficha-fields.tsx` date kind; kernel `parseFieldInput` accepts `mm/aaaa`.
  class: deferred
  state: ~~open (owner: integrated Epic 8 fix batch)~~ closed (2026-09-28, `spec-epic-7-8-fix-qa.md`, E78-Q3: `DateValueField` keeps the date picker for an empty value or a full date and shows any other stored value as the kernel's text (`dateFieldText`) in a text input committing `parseFieldInput`; the reading parse and "Copiar da última visita" store a month or day in the canonical shape (`normalizeDateValue`). Covered by `e2e/nameplate-values.spec.ts` and the kernel tests)

- source_spec: `_bmad-output/implementation-artifacts/spec-8-2-8-6-plate-capture-and-confirm.md`
  summary: `@p1` 7.3-E2E-001 (`e2e/photo-numbers.spec.ts`) fails in `test:e2e:full` and alone on the batch P branch: the Export dialog lists "Parecer não preenchido" and keeps "Gerar relatório" disabled while the Sumário foot says "Nada impede gerar". It fails the same with batch P's pre-issue and Export changes reverted, so it is read as pre-existing from Stories 7.2 to 7.5 (not in `verify`, which tags `@p0`).
  evidence: batch P `test:e2e:full` 2026-09-28 (223 passed, 1 failed, 4 skipped); isolated reruns with and without `pre-issue.ts`/`surfaces/export/*` of this branch.
  class: deferred
  state: ~~open (owner: Epic 8 integrated review; confirm on clean main first)~~ closed (2026-09-28, `spec-epic-7-8-fix-qa.md`, E78-Q1: confirmed on clean main with two causes. The test now sets the parecer before generating, and counts the section 11 page breaks from its own heading (section 9's sheets break pages of their own). The kernel draws the eleven printed sections as virtual Sumário rows on a relatório with no section block, so the foot and the dialog both name "linha 10"; `@p0` 7.5-E2E-006 covers it)

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-7-8-fix-qa.md`
  summary: Narrowing, E78-Q1. A relatório with no live section block (the Porto Seguro fixtures, a legacy relatório) lists the eleven sections it prints as virtual Sumário rows, which cannot be moved, removed, duplicated or given a section below them, and whose text rows (2, 4, 5, 6) do not open the section text editor (it needs a block). Giving such a relatório its section blocks is a migration no story owns.
  evidence: `packages/domain/src/relatorio/sumario.ts` `virtualSectionRows`; `apps/web/src/surfaces/relatorio/sumario-row.tsx` (`StaticPosition`).
  class: deferred
  state: open (owner: none)

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-7-8-fix-qa.md`
  summary: Narrowing, E78-Q2. Under the `fake` providers only `transformador_forca` has a default fixture: a plate photographed through the app on any other type still fails permanently at its first attempt ("no fixture for block type ..."). Adding a default per type needs a synthetic plate for it.
  evidence: `apps/api/src/jobs/reading/providers/fake.ts` `DEFAULT_FIXTURE_BY_BLOCK_TYPE`.
  class: deferred
  state: ~~open (owner: none)~~ closed (2026-10-07, Story 13.7, `spec-13-7-plate-tile-every-type.md`, batch e13d: every block type with a nameplate has a synthetic default plate, `fixtures/images/plate-<type>.png` from `apps/api/src/scripts/make-plate-fixtures.ts`, listed in `kinds/plate.ts` `fakeDefaults`; the two cable types have no nameplate and keep the permanent failure)

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-7-8-fix-qa.md`
  summary: Narrowing, E78-Q5. "Tentar novamente" waits for the photo's next reading status op in component state: a reload before that op arrives offers it again. The route still answers 409 while the reading is `running`, so the only second run left is one asked after the job already ended.
  evidence: `apps/web/src/surfaces/ficha/plate-photo.tsx` `FailedReading` (keyed by `reading_status_op_id`); `apps/api/src/http/reading.ts`.
  class: deferred
  state: ~~open (owner: none)~~ closed (2026-09-28, `spec-epic-9-deferred-sweep.md`, batch C2, B16: the press records the photo's current status op in `local_prefs` (`reread_asked:{photo_id}`), so after a reload the button stays disabled until the next status op; `plate-photo-reread.test.tsx`)

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-7-8-fix-qa.md`
  summary: Narrowing, E78-Q6. A reading job sent before its queue got the `reading-dead` dead letter (a job already queued when the api first runs this code) carries no dead letter, so its dying last attempt still leaves the photo `running`; every job sent after it is covered.
  evidence: pg-boss copies the queue's dead letter onto a job at send time (`COALESCE(deadLetter, q.dead_letter)`); `apps/api/src/jobs/reading/worker.ts` `ensureReadingQueue`.
  class: deferred
  state: ~~open (owner: none)~~ closed (2026-09-28, `spec-epic-9-deferred-sweep.md`, batch C2, A13: `ensureReadingQueue` gives the queue's live jobs that lack it the dead letter (`pgboss.job`, created/retry/active); `job.integration.test.ts` "A13")

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-7-8-fix-qa.md`
  summary: E78-R1. The plate crop shrinks the plate text to about 7 px at 768 px (the crop is 297 px wide inside a 657 px box), and the focused field's outline covers the value it points at.
  evidence: `reviews/epic-7-8-review-qa.md` § Re-check (PR #55), screenshot R1.
  class: deferred
  state: ~~open (owner: Epic 9 carry-over batch)~~ closed (2026-09-28, `spec-epic-9-carry-over.md`, batch C1, E8-A5: while a field is focused the crop zooms to its region with a margin, padded to the box aspect (kernel `plateCropView`), and `.region` is an outline outside the field's box, at least 12 px high (`app.css`); `suggestions-plate.test.ts` "E78-R1 plateCropView", `plate-photo.test.tsx`, `@p1` 8.6-E2E-004 in `e2e/plate-reading.spec.ts`)

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-7-8-fix-qa.md`
  summary: E78-R2. The Sumário header reads "3 de 94 fichas concluídas" while the parecer band reads "0 de 94": two definitions of a concluded sheet reach the screen.
  evidence: `reviews/epic-7-8-review-qa.md` § Re-check (PR #55).
  class: deferred
  state: ~~open (owner: Epic 9 carry-over batch)~~ open (owner: Matheus decides the one definition of a concluded ficha (`progress.ts:142` vs `parecer.ts:148`); then the next batch touching the Sumário header or the parecer band; 2026-09-29, E9-A5)

- source_spec: none (found by Matheus on the running app, 2026-09-26; investigated with Sally and Amelia the same day)
  summary: Home layout at desktop width. (1) On Home the Sync badge and the avatar sit in the middle of the App bar instead of its right edge, at every width. (2) On wide screens the capped content column hugs the left edge, leaving the right half of the screen empty.
  evidence: (1) Home renders its `h1` as `app-bar-title visually-hidden` (`apps/web/src/app.tsx` route handle `titleHidden`; `apps/web/src/surfaces/app-shell.tsx`, the `h1` in the header), taken from `mockups/key-home.html`. `.visually-hidden` is `position: absolute`, so the `h1` leaves the `.app-bar` grid (`1fr auto 1fr`, `components.css`), and `.app-bar-right` falls into the middle `auto` column. Measured on Home, right group: 142-266 px at 390, 284-484 at 768, 540-740 at 1280, 853-1053 at 1906. `/cadastros` (visible title) is correct. `key-home.html` carries the same markup and the same defect (287-481 px in its 768 frame), while `MOCK-GUIDE.md` § App bar says right = `sync-badge`, then `avatar-btn`. (2) `.content` is capped at `content-max` plus gutters with no horizontal margin: at 1906 px it ends at 928 px. `DESIGN.md` § Layout & Spacing caps the column at 880 px but does not say where it sits, and the mocks draw desktop only at 1280 px. Decisions (Matheus, 2026-09-26): the Home title stays visually hidden, because the wordmark with `aria-current` names the page and the `h1` stays for screen readers; on surfaces without the Relatório tree rail, the capped column is centered at every width, including 1280 px. Fix scope:
  - one `app.css` rule placing `.app-bar-right` in the third grid column, with a comment naming the `key-home.html` defect; `tokens.css` and `components.css` stay byte-identical;
  - a centering rule for the capped column on rail-less surfaces; `/project/:id` at desktop and the sheet beside the rail keep their current layout;
  - a dated sentence beside `DESIGN.md`'s `content-max` sentence ("centered in the viewport when no rail is present");
  - the same App bar correction in `key-home.html`'s page `<style>`;
  - a `@p0` Playwright test on Home and `/cadastros` at 390, 768, 1280 and 1906 px (the avatar's right edge within 16 px of the App bar's right edge; the column centered at 1280 and 1906 px);
  - a real-browser pass with screenshots at the four widths in light and dark, plus one dialog.
  class: bug
  state: ~~open (owner: the next carry-over batch between epics; not part of Epic 8 batch C, already running)~~ closed (2026-09-28, `spec-epic-9-carry-over.md`, batch C1: `app.css` puts `.app-bar-right` in grid column 3 and centers the capped column of rail-less surfaces (`.screen > .content`, `.registry-main.is-narrow`); dated line beside DESIGN.md's `content-max` sentence; the same App bar rule in `key-home.html`; `@p0` HOME-LAYOUT-E2E-001 in `e2e/app-layout.spec.ts` at 390, 768, 1280 and 1906 px, with light and dark screenshots and one dialog attached)

- source_spec: spec-epic-7-8-fix-qa.md
  summary: E78-Q10. Section 10's validity line prints the literal placeholder `[ART]` when the ART number is blank ("Este relatório tem validade apenas acompanhada da ART [ART]").
  evidence: `reviews/epic-7-8-review-qa.md` E78-Q10 (Rev. 1 PDF p.106); tracked under E7-A3 (2026-09-28).
  class: question
  state: open (owner: Matheus decides the blank-ART wording (E7-A5); the next batch touching section 10 applies it)

- source_spec: spec-epic-7-8-fix-qa.md
  summary: E78-Q12. "82 aguardando envio" (pre-issue row, gallery header, tiles) reads as if this device will send the photos; on an office device that never held them the server simply lacks them. The gallery's static note "Os números são provisórios até a exportação" sits beside "Números da revisão 1".
  evidence: `reviews/epic-7-8-review-qa.md` E78-Q12; tracked under E7-A3 (2026-09-28).
  class: question
  state: open (owner: Matheus with Bruno for wording (E7-A5); then the next batch touching the gallery or pre-issue)

- source_spec: spec-epic-7-8-fix-qa.md
  summary: E78-Q15. The Porto Seguro fixture stores the transformer TTR "V PRIMÁRIO" as raw `13200` with the seed unit kV, printing "13.200 kV"; VAL CALCULADO prints "-" because the dual secondary "380/220" does not parse.
  evidence: `reviews/epic-7-8-review-qa.md` E78-Q15; tracked under E7-A3 (2026-09-28).
  class: bug
  state: ~~open (owner: Epic 9 batch C1 fixes the fixture value to 13.2; the dual-voltage secondary stays with Matheus (E7-A5))~~ TTR half closed (2026-09-28, `spec-epic-9-carry-over.md`, batch C1, E7-A3: the seven transformer ratios store V PRIMÁRIO `13.2` and print "13,2 kV"; goldens regenerated; `op-log.test.ts` "E7-A3 ... TR-1"); open for the dual-voltage secondary "380/220" (owner: Matheus, E7-A5)

- source_spec: spec-9-1-read-the-instrument-display-with-ler-visor.md
  summary: Story 9.1 narrowing: a thermo-hygrometer suggestion confirmed on the cabine environment gets no provenance glyph: `location/{id}/env/*` values are bare number values with no cell provenance (`source_suggestion_id`).
  evidence: `packages/domain/src/schemas/entities.ts` `locationEnvSchema`; `apps/web/src/surfaces/ficha/read-display.tsx` (no confirmed crop on env fields).
  class: question
  state: ~~open (owner: Epic 9 integrated review)~~ ~~open (owner: Epic 11; 2026-09-29, E9-A5: needs provenance on `location/{id}/env/*` values, a row shape change with a contract bump that Epic 10's batches already hold)~~ re-owned (owner: Matheus; 2026-09-30, Epic 11 batch C: not small. Provenance on `location/{id}/env/*` turns bare numbers into provenance cells, a row-shape change of every env reader (fold, print, pre-issue, the cabine environment surface) with a contract and MIN bump, and no Epic 11 story touches that surface; whether the glyph is worth it is a product call)

- source_spec: spec-9-1-read-the-instrument-display-with-ler-visor.md
  summary: Story 9.1 narrowing: pending thermo-hygrometer suggestions count in Sync status ("Leituras") but not in the pre-issue section 9 row or the Sumário, which read sheet suggestions only.
  evidence: `livePendingSuggestions(blocks, pending, locations)` keeps env rows only when `locations` is given; `db/suggestion-store.ts` `readingCountRows` passes them, `relatorio/pre-issue.ts` does not.
  class: question
  state: ~~open (owner: Epic 9 integrated review)~~ ~~open (owner: Story 10.4 (batch S); 2026-09-29, E9-A5)~~ open (owner: Matheus, product question; 2026-09-29, Story 10.4: not small. The section 9 row "N fichas com sugestões" counts sheets, and a thermo-hygrometer suggestion sits on a cabine, not a sheet, so counting it there needs a new row or wording, a product decision; Sync status keeps counting it under "Leituras")

- source_spec: spec-9-1-read-the-instrument-display-with-ler-visor.md
  summary: Story 9.1 narrowing: a display reading that failed has no retry UI on the cell (the plate's "Tentar novamente" has no display counterpart); `POST /api/photos/{id}/reread` already accepts display photos.
  evidence: `apps/web/src/surfaces/ficha/read-display.tsx` `QueuedBanner` shows queued and running only; `apps/api/src/http/reading.ts`.
  class: debt
  state: ~~open (owner: Epic 9 integrated review)~~ ~~open (owner: Epic 11; 2026-09-29, E9-A5: needs a failed-display state, a kernel line, a reread wiring with `local_prefs` persistence (as B16 did for the plate) and a failing-fake e2e; a feature, not a fix)~~ ~~re-owned (owner: Matheus; 2026-09-30, Epic 11 batch C: not small, a feature: a failed state in `displayQueuedCells`, a failed line with "Tentar novamente" per cell or per photo (no mock draws a display failure; where it sits is a UX call), the reread wiring with `local_prefs` as the plate's `FailedReading` does, and a failing-fake e2e; it needs a story with its copy decided)~~ closed (2026-10-07, Story 13.5 WAIT-2, Epic 13 batch C: `displayQueuedCells`/`displayQueuedEnv` carry `failed` on an empty target; the shared `FailedReading` (`ficha/reading-line.tsx`) shows under the cell or field with "Tentar novamente" (persisted like the plate's `reread_asked`, "Sem conexão" offline) and "Digitar"; `e2e/reading-wait.spec.ts` 13.5-E2E-002)

- source_spec: spec-9-1-read-the-instrument-display-with-ler-visor.md
  summary: Story 9.1 spike finding: the plate pipeline reads the tiny real display crops better than the chosen display path (8 of 15 against 6 of 15, cleaner confidences); running both and keeping the higher-confidence value is the next experiment, once real tablet photos exist.
  evidence: `docs/display-reading-spike.md` § Caveats and next steps.
  class: question
  state: open (owner: E8-A8 follow-up)

- source_spec: spec-9-1-read-the-instrument-display-with-ler-visor.md
  summary: Story 9.1 open questions: the range source for the unit-less megôhmetro (E8-A3: the unit comes from the cell, the previous row or the column default, a column default on an insulation column being Verificar); stored 30 s / 10 min values dropped (print-only columns, Conflict 3); the 2 ambiguous crops #08/#10 (E8-A8); the SM-3 recount (measured 20 taps and 9 keys with Enter confirming down the run; EXPERIENCE.md's 19 taps assumed 5 base taps and per-table "Confirmar todos").
  evidence: `spec-9-1-read-the-instrument-display-with-ler-visor.md` Open questions; `e2e/tap-budget-signal.spec.ts`.
  class: question
  state: open (owner: Matheus)

- source_spec: spec-9-2-create-a-block-by-photographing-the-equipment.md
  summary: Story 9.2 narrowing: a panel photo whose result dialog is left by navigation (another route, a reload) stays a live "Geral" photo with no caption, `reading_kind: panel` and its pending panel suggestion; nothing offers the dialog again and nothing removes it.
  evidence: `apps/web/src/surfaces/relatorio/panel-capture.tsx` (the dialog state lives in the mounted tree; only "Cancelar", Esc, the scrim and "Fotografar de novo" remove the photo).
  class: debt
  state: ~~open (owner: Epic 9 integrated review)~~ ~~open (owner: Epic 11; 2026-09-29, E9-A5: needs a product choice that is Matheus's (offer the dialog again or sweep the orphan photo), then a recovery path)~~ closed (2026-10-07, Story 13.5 WAIT-3, Epic 13 batch C: the dialog is offered again: the field palette of the photo's location lists each waiting panel photo (`panelPhotosAwaiting`) with its state or proposal and reopens its dialog (`PanelCapture.resume`), and the arrival toast's "Ver" on its panel suggestion opens the Sumário with `?panel={photoId}`; `e2e/reading-wait.spec.ts` 13.5-E2E-003 and -005)

- source_spec: spec-9-2-create-a-block-by-photographing-the-equipment.md
  summary: Story 9.2 narrowing: the `@p1` pipeline e2e (`e2e/panel-capture-pipeline.spec.ts`, the real panel and plate jobs under `fake`) runs only in `test:e2e:full`, not in the `verify` gate.
  evidence: `e2e/panel-capture-pipeline.spec.ts` is tagged `@p1` and listed in `SERIAL_SPECS` (`e2e/support/groups.ts`).
  class: debt
  state: ~~open (owner: Epic 9 integrated review)~~ open (owner: E9-A1, the gate budget decision (Matheus); 2026-09-29, E9-A5)

- source_spec: spec-9-2-create-a-block-by-photographing-the-equipment.md
  summary: Story 9.2 open questions (conservative readings taken): the app's single-shot camera replaces the mock's simulated viewfinder, so "Escolher o tipo" is no viewfinder action (the type chips are always in the result dialog); the create keeps the palette's reveal and "Desfazer" toast instead of the mock's jump to the ficha; the tile shows at every palette width; a read column with no live coluna under the palette's cabine falls back to the palette's location flagged Verificar (no column is created); "Desfazer" reverts the whole batch, which puts `reading_kind` back to `panel` and so re-queues a panel reading.
  evidence: `spec-9-2-create-a-block-by-photographing-the-equipment.md` Design Notes; `packages/domain/src/relatorio/panel.ts` `panelLocation`.
  class: question
  state: open (owner: Matheus)

- source_spec: spec-9-2-create-a-block-by-photographing-the-equipment.md
  summary: Story 9.2 review (known open): a client may put any of the five reading kinds on its own company's photo (`file/{id}/reading_kind`), re-queueing or re-reading it; only `plate` is needed by the "Fotografar equipamento" re-target. Hardening: accept only `plate`, or only a kind with a handler and a matching `reading_target`.
  evidence: `apps/api/src/sync/apply.ts` `clientReadingPutIsValid` accepts every kind of `READING_KINDS`; the tenant check runs first, so no cross-company effect.
  class: debt
  state: ~~open (owner: Epic 9 integrated review)~~ closed (2026-09-29, E9-A5): fixed by E9-Q2 in PR #62, `clientReadingPutIsValid` (`apps/api/src/sync/apply.ts`) accepts only `plate` or null for a client `reading_kind` put, and `assertClientReadingKindPut` checks the photo's stored state

- source_spec: spec-9-2-create-a-block-by-photographing-the-equipment.md
  summary: Story 9.2 review (known open): "Desfazer" after a photo-backed create is exercised by no test; it reverts the whole batch (photo back to a panel photo with no block, suggestion back to pending, a panel reading re-queued).
  evidence: `apps/web/src/surfaces/relatorio/tree-actions.ts` `createPair` puts `panelRetargetOps` and the suggestion status put in the undoable batch; `e2e/panel-capture*.spec.ts` never click "Desfazer".
  class: debt
  state: ~~open (owner: Epic 9 integrated review)~~ resolved 2026-09-29 by the Epic 9 fix batch (E9-Q3, branch fix/epic-9-qa): the undo leaves a plain photo and a discarded panel suggestion, with no reading re-queued

- source_spec: spec-epic-9-deferred-sweep.md
  summary: The Export dialog's preview press ("Pré-visualizar") still retries a `409 not_caught_up` blindly; batch C2 (B14) made only the issue press fail at once, with "N arquivos ainda não chegaram ao servidor", when the missing files are ones no upload of this device will bring.
  evidence: `apps/web/src/surfaces/export/use-preview.ts` retry loop (`MAX_ROUNDS`) parses no `details`; the kernel rule `notCaughtUpRetryable` and `missingFilesText` (`print/revisions.ts`) are ready to adopt. Verification Gap review of batch C2.
  class: debt
  state: ~~open (owner: Epic 9 integrated review)~~ closed (2026-09-29, E9-A5): refuted by the Epic 9 QA, known-open (g) of `reviews/epic-9-review-qa.md` (the retry loop stops after `MAX_ROUNDS`; not a defect)

- source_spec: spec-9-3-9-5-captions-and-nc-drafts.md
  summary: Stories 9.3/9.5 narrowing: an import batch's photos are committed as "Geral" at pick time (E6-Q8), so a people mark or an equipment chosen in a batch left open while online may reach the server after the job read the photo. The run-time re-check and the device's stale sweep drop the suggestion, but the image already went to the prose provider (`fake` now); this must close before a cloud LLM is wired.
  evidence: `apps/web/src/surfaces/photos/capture-sheet.tsx` `startBatch` (GERAL) and `finish`; `apps/api/src/jobs/reading/kinds/caption.ts` `captionSkipReason`.
  class: debt
  state: ~~open (owner: Epic 11)~~ closed (2026-09-30, Epic 11 batch C, `spec-epic-11-carry-over.md`, contract 14): a gallery import batch creates its photos with no reading (`reading_status: 'none'`, `GERAL_BATCH` in `capture-sheet.tsx`) and asks for the caption reading only once the batch is answered or closed, with a `file/{id}/reading_kind = 'caption'` put after the answer's other puts for each photo left with no sheet, caption or people mark (`assignPhotoBatch`); the server accepts a client `caption` put only on a photo with no reading and no context (`clientReadingKindPutAllowed`). Tests: `apps/api/src/sync/caption-batch.integration.test.ts`, `e2e/captions.spec.ts` 9.3-E2E-001/003/005, `gallery.spec.ts` 6.4-E2E-008. Left for Story 11.6 (batch L): `MIN_CONTRACT_VERSION` stays 13, so a version-13 bundle still queues the caption at pick time; L raises MIN to 14 (or later) before a cloud LLM is wired. A batch whose sheet is never answered nor closed (reload, tab killed) keeps no caption reading (the conservative side)

- source_spec: spec-9-3-9-5-captions-and-nc-drafts.md
  summary: Story 9.3 narrowings: unmarking "Pessoas na foto" does not request a caption (no client reread of `caption`); caption suggestions are not in the Sync status "Leituras" counts (`livePendingSuggestions` reads `sheet/*` and cabine targets only); the tile's "Pessoas na foto" chip shows only on tiles with no equipment or already marked.
  evidence: `apps/web/src/surfaces/photos/gallery-surface.tsx` (people chip condition); `apps/web/src/db/suggestion-store.ts` `readingCountRows`.
  class: question
  state: ~~open (owner: Epic 9 integrated review)~~ ~~open (owner: Story 10.4 (batch S); 2026-09-29, E9-A5)~~ closed for the Sync status counts (2026-09-29, Story 10.4: `readingCountRows` adds the caption suggestion each live photo shows (`captionSuggestions`) to the "Leituras" count; `suggestion-store.test.ts` "ledger 1137"). The other two narrowings of this entry (unmarking "Pessoas na foto" does not request a caption; the chip condition) stay as the 9.3 conservative reading, open for Matheus

- source_spec: spec-9-3-9-5-captions-and-nc-drafts.md
  summary: Stories 9.3/9.5 open questions (conservative reading kept): the tile keeps the mock's "Confirmar" while the composer and the NC draft say "Usar" (the story); "Confirmar todas" confirms every suggestion of the relatório, not only the filtered cabine; `captions_suggested` is an `info` row (a warning, never blocking) beside the unchanged `photos_uncaptioned`, and the Export dialog counts it among its "N avisos" (not an explicit kind), while the Sumário row 7 names it.
  evidence: `spec-9-3-9-5-captions-and-nc-drafts.md` Open questions; `packages/domain/src/relatorio/pre-issue.ts` `EXPLICIT_KINDS`.
  class: question
  state: open (owner: Matheus with Bruno for wording)

- source_spec: spec-epic-9-fix-qa.md
  summary: E9-Q7 narrowing (2026-09-29): a failed frame grab in a "Ler visor" burst makes the next shutter retry its row only when the failure lands before the next tap; when the engineer already tapped again, the failed row stays without a photo in that burst (the failure toast still shows). A retry queue of failed rows was judged more machinery than a rare grab failure warrants.
  evidence: `apps/web/src/surfaces/ficha/camera-view.tsx` `grab` failure branch (`taken.current === shot + 1`). Edge Case Hunter review of the Epic 9 fix batch.
  class: debt
  state: ~~open (owner: Epic 9 retrospective)~~ closed (2026-09-29, E9-A5): narrowing accepted by the Epic 9 retrospective

- source_spec: spec-epic-9-fix-qa.md
  summary: E9-Q1 narrowing (2026-09-29): a pending display reading under a cell that shows a dictated reading is not drawn as a second line before the dictation is confirmed; it becomes the existing "Visor … Conferir" line once the dictated value is stored. The "Confirmar todos" toast's "a conferir" count leaving out that cell is covered by the kernel unit test only (no e2e with a `verify` fill under a dictated cell).
  evidence: `apps/web/src/surfaces/ficha/ensaios-section.tsx` (`actions(dictatedCell)`), `read-display.tsx` `confirmAll` (`measurementTableVerifyCount(..., exclude)`); Verification Gap review of the Epic 9 fix batch.
  class: debt
  state: ~~open (owner: Epic 9 retrospective)~~ closed (2026-09-29, E9-A5): by the Epic 10 carry-over batch (`spec-epic-10-carry-over.md`), `@p0` 9.4-E2E-013 in `e2e/dictation.spec.ts` (a `verify` display fill under a dictated cell: "Confirmar todos (1)", the toast counts only the verify fill still shown, the batch holds the suggested cell alone; red when the `exclude` is dropped from the toast count)

- source_spec: spec-epic-9-fix-qa.md
  summary: E9-Q2 residual (2026-09-29): client pushes are applied per op (E6-A1), so if the `plate` put of a Story 9.2 create batch were refused (its photo row absent or no longer a panel photo) the batch's other ops (equipment, block, `block_id`, caption, plate target) still land and the photo keeps its panel kind. Not reachable from the app's own flow (the create always follows the panel photo's create); a per-batch savepoint was not added.
  evidence: `apps/api/src/sync/apply.ts` `applyOps` (per-op refusal) and `assertClientReadingKindPut`; Edge Case Hunter review of the Epic 9 fix batch.
  class: debt
  state: ~~open (owner: Epic 9 retrospective)~~ closed (2026-09-29, Story 10.1, `spec-10-1-merge-by-rule.md`: a client batch is atomic in a push; `applyOps` applies each multi-op `batch_id` under one savepoint and a permanent refusal of any of its ops rolls the batch back and answers every op of it `op_invalid`, while other ops of the push apply; the device never splits a batch across pushes, `batches` in `apps/web/src/sync/policy.ts`; test `10.1-API-002` in `apps/api/src/sync/merge.integration.test.ts`)

- source_spec: `_bmad-output/implementation-artifacts/spec-10-1-merge-by-rule.md`
  summary: Story 10.1 known limits of the merge fold (2026-09-29): a device that lost a kept merge (the C device) and writes the same cell again before it pulls chains on its merged-away head, so the fold treats the write as sequential and it replaces the standing NC with no entry; the undo of a merged-away put does the same; an observation the C device wrote before its C result is not caught by `nc_observation`.
  evidence: `packages/domain/src/merge/policy.ts` `isConcurrent` compares `prev_op_id` with the head only, and `prev_op_id` cannot tell "saw the standing value" from "did not"; a guard on (same device, prev = kept head) would also block the deliberate override the story requires. Needs a device-side stamp of the standing `op_id` and a two-id check in the fold. Edge Case Hunter review of Story 10.1. Severity medium.
  class: debt
  state: ~~open (owner: Story 10.2, batch X, which reworks the same `mergePolicy` branch)~~ closed for its first two parts (2026-09-29, Stories 10.2/10.3, `spec-10-2-10-3-contradictions-and-structure-conflicts.md`: a device-written `sheet/*` put carries `meta.standing_op_id`, stamped at commit in `apps/web/src/db/commit.ts` (`stampSeen`), and `isConcurrent` also treats a put whose stamp is not the cell's current `op_id` as concurrent, so the losing device's write before its pull and the undo of a merged-away put merge by rule, while a deliberate write after the pull stays sequential; tests `10.2 isConcurrent: the standing stamp` and `ledger: the losing device writes C again before its pull` in `packages/domain/src/merge/conflicts.test.ts`, `10.2-API-001 ... ledger (10.1 known limit)` in `apps/api/src/sync/conflicts.integration.test.ts`); the third part (the observation written before the C result) is re-owned in the entry below

- source_spec: `_bmad-output/implementation-artifacts/spec-10-1-merge-by-rule.md`
  summary: The per-batch savepoint of ledger 1161 opens one Postgres subtransaction per multi-op client batch; a push holding more than 64 of them overflows the subxact cache (the `pg_subtrans` slowdown `applyOps` documents). Also unverified: `batches()` and `applyOps` move a batch's later ops to its first op's position, which reorders an interleaved same-path op, if outbox coalescing can produce one.
  evidence: Porto Seguro replay 24.4 s before, 24.9 s after (its log holds no multi-op batch); a 500-op offline-day push was not measured. A dry-run of the batch in memory before a savepoint-free apply would avoid it. Edge Case Hunter and Verification Gap review of Story 10.1. Severity medium (unverified).
  class: debt
  state: ~~open (owner: Epic 11, sync performance and retention)~~ re-owned (owner: Matheus, via `bmad-correct-course`; 2026-09-30, Epic 11 batch C: Epic 11 has no sync performance or retention story, so no batch can own it; a correct-course pass decides whether to add one (R10-12 also expected that story to split `engine.ts` and `apply.ts`) or to date it post-MVP)

- source_spec: `_bmad-output/implementation-artifacts/spec-10-2-10-3-contradictions-and-structure-conflicts.md`
  summary: The third part of the Story 10.1 known limits (re-owned 2026-09-29): an observation the C device wrote before its C result folds as `latest_text` (the result cell carries no merge record yet when the observation folds), so it can replace the NC device's observation although NC stands.
  evidence: `packages/domain/src/merge/policy.ts` `mergePolicy` (`nc_observation` reads the result cell's `merge` record at the time the observation folds). The standing stamp of Stories 10.2/10.3 does not change the order in which the two paths fold; catching it needs an item-level merge record (the result and the observation merged as one unit), a reducer and row-shape change.
  class: debt
  state: open (owner: Matheus, product call on whether the rare order is worth an item-level merge record; otherwise Epic 11)

- source_spec: `_bmad-output/implementation-artifacts/spec-11-4-11-5-rich-text-and-location-stamp.md`
  summary: 11.4-TEMPLATE-FORMAT (Epic 11 cross-story table, 11.3 x 11.4): a template saved from a relatório ("Salvar como template", Story 11.3, batch B) keeps the formatted section text and prints it. Not asserted by batch E: Story 11.3 is not on this branch.
  evidence: `epic-11-context.md` Cross-Story Dependencies; the markup lives in `section_text` as a string (`packages/domain/src/templates/rich-text.ts`), so the 11.3 projection carries it unchanged if it copies `section_text`.
  class: deferred
  state: ~~open (owner: the Epic 11 coordinator's integrated QA, once batches B and E are both on main)~~ closed 2026-09-30 by the Epic 11 fix batch (`spec-epic-11-qa-fixes.md`, E11-Q3): `packages/domain/src/templates/from-relatorio.test.ts` "11.4-TEMPLATE-FORMAT: bold, italic and list markup in a relatório section text survive into the template verbatim"; the manual pass is in `reviews/epic-11-review-qa.md`

- source_spec: `_bmad-output/implementation-artifacts/spec-11-4-11-5-rich-text-and-location-stamp.md`
  summary: 11.4-PRINT-BOTH, the PDF half through the UI: the formatted text downloaded as the revision's PDF from the Export dialog needs Story 11.1's PDF route and button (batch A). Batch E covers the renderer half only: `apps/api/src/jobs/generate/rich-text.integration.test.ts` reads the stored PDF and finds the bold and italic words in bold and italic fonts.
  evidence: `epic-11-context.md` Cross-Story Dependencies (11.4 x renderer / 11.1).
  class: deferred
  state: ~~open (owner: the Epic 11 coordinator's integrated QA, once batches A and E are both on main)~~ closed 2026-09-30 by the Epic 11 fix batch (E11-Q3): `e2e/rich-text-print.spec.ts` 11.4-E2E-002 saves the revision's PDF through "PDF — enviar ao cliente" (`relatorio-rev-1.pdf`, `%PDF`), and `apps/api/src/jobs/generate/rich-text.integration.test.ts` reads that stored PDF's bold and italic fonts; the manual font check is in `reviews/epic-11-review-qa.md`

- source_spec: `_bmad-output/implementation-artifacts/spec-11-2-11-3-move-block-and-save-as-template.md`
  summary: Story 11.2 narrowing (2026-09-30): "Mover para…" sits on the Sumário's Block card (section 9 expansion) and the sheet header Overflow; the 320 px rail tree rows carry no Overflow in `shell-foot.html` nor in code, so they get none. The AC's "tree row" is read as the Sumário tree's equipment row.
  evidence: `apps/web/src/surfaces/relatorio/relatorio-tree.tsx` `RailEquipment` (no OverflowMenu); `mockups/prototype/shell-foot.html` rail rows. OPEN QUESTION in the PR.
  class: narrowing
  state: open (owner: Matheus, product call; a later batch adds an Overflow to rail rows if wanted)

- source_spec: `_bmad-output/implementation-artifacts/spec-11-2-11-3-move-block-and-save-as-template.md`
  summary: A `block/{id}/location_id` put is not checked against the relatório's live locations: a target coluna removed on another device while a move is pending leaves the block under a removed location, hidden from the tree until moved back or restored.
  evidence: `packages/domain/src/ops/apply.ts` `block/field` branch writes any id; the device refuses a gone target at commit (`movePlan`), but a concurrent removal is not caught. A fold or push refusal would be a reducer change and a contract bump. Edge Case Hunter review of Stories 11.2/11.3. Severity medium (unverified).
  class: debt
  state: ~~open (owner: Epic 11 integrated review)~~ re-owned 2026-09-30 (E11-Q8): owner Matheus, latent until a relatório can remove a location. A relatório has no location-removal op today (`apps/web/src/surfaces/relatorio/relatorio-ops.ts` offers only the `location/{id}` create, `name`/`order_key` puts and `agrupar_por_tipo`; the only removal is the Template composer's), so no UI path produces the state (`reviews/epic-11-review-qa.md` E11-Q8) *(closed 2026-10-13 by Story 14.2's second pass, PR #126: a relatório can now remove a location, and the state is answered for every reader of the snapshot by one ancestor-liveness rule, `liveLocationIds` in `packages/domain/src/relatorio/location-live.ts`, read by `buildSnapshot` and `createSnapshotBuilder`: a block whose location is removed, or sits under a removed location, is absent from the tree, the counters, the pre-issue list, sections 9 and 11 and a saved template, and comes back when the location is restored. No fold or push refusal was added and the contract stays 17. Tests: `packages/domain/src/relatorio/removal-readers.test.ts` (a sheet created under, and one moved into, a removed location by another device), `apps/api/src/sync/sync.integration.test.ts` (the same through `POST /api/sync/ops`). What the rule does not reach, the readers of raw rows, is entry (g) under Story 14.2 below.)*

- source_spec: `_bmad-output/implementation-artifacts/spec-11-9-11-10-priority-deadline-and-action-plan.md`
  summary: 11.10-PDF (2026-09-30): the action-plan table in the downloaded PDF is not asserted. The PDF is LibreOffice's conversion of the same DOCX, so the table is already in it, but there is no download route for it until Story 11.1 (`GET /api/revisions/{id}/pdf`).
  evidence: `e2e/action-plan.spec.ts` 11.10-E2E-001 reads the DOCX only; Epic 11 context, Cross-Story Dependencies row 11.10 x 11.1.
  class: test-gap
  state: ~~open (owner: batch A, Story 11.1, or the Epic 11 QA once A merges)~~ closed 2026-09-30 by the Epic 11 fix batch (E11-Q3, E11-Q4): `apps/api/src/jobs/generate/rich-text.integration.test.ts` reads the stored PDF's action-plan table under the section 8 heading (every header word whole, the row's priority, deadline, action and owner), and `e2e/action-plan.spec.ts` 11.10-E2E-001 saves the PDF through "PDF — enviar ao cliente"

- source_spec: `_bmad-output/implementation-artifacts/spec-11-9-11-10-priority-deadline-and-action-plan.md`
  summary: Stories 11.9/11.10 open questions (2026-09-30): the P4 hint word "próxima intervenção" (authored; the mock's "365 dias" is overridden by source-deltas row 29); the undo toast texts "Prioridade gravada", "Prioridade removida", "Prazo substituído" (authored); whether "pontos sem prazo" should count points without priority instead (EXPERIENCE says priority, the story says prazo; built as prazo); whether the table prints when no row carries an action-plan value (built: always); the Points surface "Como imprime na seção 8" preview (`72-pontos.html` 290-318, named by neither story, not built); a P4 deadline stored as a month only (`YYYY-MM`) shows as read-only `mm/aaaa` in Prazo, since the Date field holds whole days.
  evidence: `packages/domain/src/points/priority.ts`, `apps/web/src/copy/pt-br.ts` (`points.priorityWritten` and neighbours), `apps/web/src/surfaces/points/point-editor.tsx` `PrazoField`.
  class: question
  state: ~~open (owner: Matheus and Bruno)~~ the undo toast texts closed 2026-10-07 by the review fixes batch 3 (F-25, decision D12, `spec-review-fixes-layout-copy-3.md`): a pick and a clear show no toast (`points.priorityWritten` and `points.priorityCleared` removed), "Prazo substituído" stays as the undo toast of "Substituir"; the other questions of this entry stay open (owner: Matheus and Bruno)

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-11-qa-fixes.md`
  summary: Flake ledger (E11-Q7, 2026-09-30): in the Epic 11 QA's `test:e2e:matrix`, `durability-desktop-chrome` `e2e/durability.spec.ts:61` (1.8-E2E-001) failed after 31.6 s, the first test after the bundle build: `signInForDurability` (`e2e/support/durability.ts:74`) hit "Protocol error (Runtime.callFunctionOn): Internal server error, session closed". The re-run passed on all three projects (3/3, 94 s); no app defect reproduced.
  evidence: `reviews/epic-11-review-qa.md` E11-Q7; `/tmp/verify-e11q-matrix.log` and `/tmp/verify-e11q-matrix-rerun.log` on the QA machine.
  class: bug
  state: open (owner: the Epic 12 coordinator if it recurs: a warm-up navigation in the global setup, or `retries: 1` on the durability projects' first spec only)

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-11-qa-fixes.md`
  summary: DEPLOY-SMOKE and 11.8-ROLE were never asserted live (E11-Q2, 2026-09-30): no batch ran `infra/bin/deploy`, so DEPLOY-SMOKE-{tag} has no evidence, the live half of 11.7 (a real `DetectDocumentText`) waits, and neither the budget action's deny on `bedrock:InvokeModel*`/`textract:*` nor the task role's Bedrock/Textract policy was proved against the account.
  evidence: `reviews/epic-11-review-qa.md` E11-Q2; `sprint-status.yaml` 11-8 and 11-7 comments; `infra/production/budget.tf:6-16,52-75`, `infra/production/iam.tf:58-67`.
  class: test-gap
  state: open (owner: Matheus: the first deploy with `fasor-admin`, then DEPLOY-SMOKE once for the wave (migration task exit 0, `GET /api/health` over HTTPS with every component up) and 11.8-ROLE (one `DetectDocumentText` through the task role, one Converse call outside the allow list denied, `aws iam simulate-principal-policy` for both roles with the deny attached); 11.8 closes only then)

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-11-qa-fixes.md`
  summary: Edge Case Hunter (2026-09-30): a DOCX/PDF file fetch answered 401 (session expired) is worded with the same "could not download" line as a network failure, not as a session problem with a way to sign in again.
  evidence: `apps/web/src/surfaces/export/revision-file.ts` and `export-dialog.tsx` word every fetch failure alike; `fetchRevisionBlob` in `apps/web/src/sync/client.ts` already carries the HTTP status in `SyncRequestError`.
  class: debt
  state: ~~open (owner: Matheus, low; the next Export dialog change)~~ closed 2026-09-30 by the review fixes batch rff (W-23, F-12): a 401 on a revision file, a preview or "Gerar relatório" raises the re-auth banner (`publishReAuth`) and the dialog says "Sua sessão expirou. Entre de novo para enviar." with "Entrar de novo" (`surfaces/export/session-expired.tsx`); `export-dialog.test.tsx` asserts the three paths

- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-field-defects.md`
  summary: F-06 (review 2026-09-30): bulk actions and copies on a 94-block relatório take 2 to 8 s to show any feedback ("Marcar os restantes como Conforme" 7.9 s, "Repetir da ficha anterior" 2.6 s, "Igual à" 2.3 s, an instrument tick in Etapa 4 2.0 s). The cost is the commit path and the live queries (K-1, K-2, W-1, W-3, W-5, W-6, W-8, batch rfp); optimistic sheet state would break AD-13, so batch rff does not change it.
  evidence: `reviews/full-review-2026-09-30/2-ux-review.md` F-06 and section 2's timings; `reviews/full-review-2026-09-30/1-code-quality.md` K-1, K-2, W-1 to W-8.
  class: debt
  state: open (owner: wave-2 QA: re-measure the four taps on a 94-block relatório with `commit-to-render.perf.spec.ts` after rfp merges; reopen as a bug if any still takes over 1 s)

- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-field-defects.md`
  summary: F-09, renderer half (review 2026-09-30): a point's photo reference prints "Imagem N" where § Capture-to-Document › 8 Pontos de atenção writes "conforme Imagem 5". Batch rff fixed the editor half (the chip lands spaced, after the text); whether the renderer adds "conforme" or the engineer types it is an open question, and `print/section-8.ts` is batch rfp's with the goldens byte-identical in wave 1.
  evidence: `reviews/full-review-2026-09-30/2-ux-review.md` F-09; `packages/domain/src/print/section-8.ts`; `apps/web/src/surfaces/points/point-text-editor.ts` `insertPhotoChip`.
  class: question
  state: open (owner: wave 2, batch rfr, with Matheus's answer; regenerate the goldens with `scripts/regen-goldens.ts` if the renderer changes)

- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-field-defects.md`
  summary: F-12, badge half (review 2026-09-30): after a 401 the Sync badge still reads "Sincronização: sem conexão" beside the "Sua sessão expirou" banner. A session state on the badge is a new product state no mock draws, and the badge's state is `state/sync.tsx` and `sync/policy.ts` (batch rfp). Batch rff fixed the Export dialog half (the session words and "Entrar de novo").
  evidence: `reviews/full-review-2026-09-30/2-ux-review.md` F-12 (`01d-home-session-expired-1280.png`); `apps/web/src/state/sync.tsx`, `apps/web/src/sync/policy.ts`.
  class: question
  state: open (owner: Matheus for the badge's words; then batch rfp or wave 2)

- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-field-defects.md`
  summary: K-13 (review 2026-09-30): three readers of `block.not_tested` against the seed's reasons, each with its own "Outro"/typed-text rule: `relatorio/tree.ts` `notTestedReasonText`, `relatorio/parecer.ts` `notTestedReason` (prints in the golden), `points/derived.ts` `reasonOf`. One `notTestedReasonOf(block)` in `relatorio/not-tested.ts` is the fix; two of the three files are batch rfp's and one prints in the golden, so wave 1 leaves it.
  evidence: `reviews/full-review-2026-09-30/1-code-quality.md` K-13.
  class: debt
  state: open (owner: wave 2, batch rfr)

- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-field-defects.md`
  summary: W-22 (review 2026-09-30): the Export dialog's DOCX and PDF prefetch continues after the dialog closes; no fetch in the app is abortable. Threading an `AbortSignal` needs a `signal` parameter in `sync/client.ts` (`fetchRevisionBlob`, batch rfp).
  evidence: `reviews/full-review-2026-09-30/1-code-quality.md` W-22; `apps/web/src/surfaces/export/export-dialog.tsx` prefetch effect; `apps/web/src/sync/client.ts`.
  class: debt
  state: open (owner: batch rfp adds the `signal` parameter; the dialog passes it in wave 2 (rfr))
  state: open (owner: Matheus, low; the next Export dialog change)

- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-kernel-device-perf.md`
  summary: Review fixes rfp (2026-09-30) left four parts outside its files. (1) The `getDefinition` try/catch wrappers outside its files still need moving to the new `findDefinition`/`findSeed` (K-20). (2) `checks/calibration.ts parseCalendarDate` and `format/datetime.ts splitDate` are still duplicates (K-20). (3) `relatorio/section-variables.ts section3Text` is still a dead export (K-19). (4) Home still reads the outbox itself instead of receiving the SyncProvider's rows (W-1).
  evidence: `reviews/full-review-2026-09-30/1-code-quality.md` K-19, K-20, W-1; the spec's Boundaries name the files involved, which belong to `rff`.
  class: debt
  state: open (owner: batch `rfr`, wave 2)

- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-kernel-device-perf.md`
  summary: Two review findings of batch rfp (2026-09-30) remain open. (1) The `files.acked` boolean is not migrated to 0/1, so IndexedDB still cannot key it (section 4). (2) There is no test for `readingCountRows` with a cabine thermo-hygrometer suggestion, nor for `lastOpIdFor` after a project-scope op is pruned. The spec's `deferred` list holds the low edge cases.
  evidence: 60 read/write sites of `acked`, including the e2e helpers in `e2e/support/outbox.ts`; the verification-gap layer's two findings in the spec's Review Triage Log.
  class: test-gap
  state: open (owner: `rft` for the e2e-side `acked` sites, with a Dexie v7 upgrade; the next change to `db/suggestion-store.ts` or `db/generate-store.ts` for the two tests)

- source_spec: `_bmad-output/implementation-artifacts/spec-11-6-structure-readings-on-bedrock.md`
  summary: Run `bedrock-eval` on real Porto Seguro nameplate photos (a git-ignored folder under `docs/media/` with `<name>.expected.json` files), pick the cheapest candidate within 1-2 accuracy points of Claude Haiku 4.5 as `bedrock_model_id`, then narrow `infra/bootstrap/iam.tf` to the chosen models (and the escalation model). Until then the default stays Haiku 4.5 and IAM keeps all five models (source-deltas 2026-10-05, Story 11.6).
  evidence: `apps/api/src/scripts/bedrock-eval.ts` (header: `--dir`, the expected-values format, the credential flow); `infra/bootstrap/iam.tf` statement `InvokeStory116Models`; `infra/production/variables.tf` `bedrock_model_id`.
  class: post-mvp
  state: open (owner: Matheus, once real nameplate photos and their expected values are in `docs/media/`)

- source_spec: `_bmad-output/implementation-artifacts/spec-11-6-structure-readings-on-bedrock.md`
  summary: The usage of a Converse call that fails after Bedrock billed it (a reply without the tool call, a tool input the schema refuses) is not recorded on `reading_runs`: the adapter throws `PermanentReadingError` and the job writes the failed run row with `model`, `prompt_version` and `llm_usage` null. Recording it needs `job.ts` to keep partial facts (the model and usage carried on the error) for the failed run row.
  evidence: `apps/api/src/jobs/reading/providers/bedrock.ts` `converseTool` (usage computed before the tool-call and schema checks); `apps/api/src/jobs/reading/job.ts` `recordRun` (reads `facts.structuring` / `facts.model`, set only on success).
  class: debt
  state: open (owner: coordinator, the next change to `job.ts`)

- source_spec: `_bmad-output/implementation-artifacts/spec-11-6-structure-readings-on-bedrock.md`
  summary: The usage of a billed Converse call that fails (a reply without the tool call, a tool input the schema refuses) is not counted anywhere, including a failed escalation whose first reading is kept: the plate kind's catch returns the first reading with its own usage only. Counting it needs the adapter's error to carry the call's usage and model, and the plate catch (escalation) and `job.ts` (failed run row) to add it.
  evidence: `apps/api/src/jobs/reading/providers/bedrock.ts` `converseTool` (usage computed, then `PermanentReadingError` thrown without it); `apps/api/src/jobs/reading/kinds/plate.ts` (escalation catch); `apps/api/src/jobs/reading/job.ts` `recordRun`.
  class: debt
  state: open (owner: coordinator, with the entry above)

- source_spec: `_bmad-output/implementation-artifacts/spec-11-6-structure-readings-on-bedrock.md`
  summary: `infra/production/variables.tf` does not validate `bedrock_model_id`, `bedrock_prose_model_id` or `bedrock_escalation_model_id` against the models priced in `BEDROCK_PRICES` and allowed in `infra/bootstrap/iam.tf`; a tfvars typo reaches the api, whose provider factory throws on an unpriced model at boot, so the task crash-loops after the apply.
  evidence: `infra/production/variables.tf` (only a non-empty check on `bedrock_model_id`); `apps/api/src/jobs/reading/providers/bedrock.ts` `assertPricedModel`; `infra/bootstrap/iam.tf` statement `InvokeStory116Models`.
  class: bug
  state: open (owner: Matheus, before the post-merge `ai_features = "on"` apply)

- source_spec: `_bmad-output/implementation-artifacts/spec-11-6-structure-readings-on-bedrock.md`
  summary: `apps/web/src/state/theme.test.tsx` "sets the attribute at once and writes the choice to local_prefs" fails (`expected null to be 'dark'`) on the baseline `3ab9a92` (branch `fix/arm64-local-dev`) as well, so `test:unit` is red before Story 11.6 touches anything; found during the 11.6 gate on the podman host.
  evidence: the same single file run alone fails on the main checkout at `3ab9a92` and on the story worktree; Story 11.6 changes no file under `apps/web` or `e2e`.
  class: bug
  state: open (owner: whoever merges `fix/arm64-local-dev`; check whether it is podman-specific)

## Deferred from: code review of spec-11-6-structure-readings-on-bedrock (2026-10-06)

- source_spec: `_bmad-output/implementation-artifacts/spec-11-6-structure-readings-on-bedrock.md`
  summary: An escalated reading's run row names one model but sums two calls' usage, so the model and its price no longer reproduce the stored USD; keep per-call usage on `reading_runs.llm_usage` together with the failed-call usage entry above.
  evidence: `apps/api/src/jobs/reading/kinds/plate.ts` returns `{ ...kept.structuring, usage: summed }`.
  class: debt
  state: open (owner: coordinator, with the failed-call usage entry)

## Deferred from: MVP hands-on review fix batch (2026-10-06), split into three PRs

- source_spec: none
  summary: Review fixes, field defects: F-02 setup numeric field lost without its own Confirmar, F-03/F-04 issue with empty sheets and printed placeholders, F-05 section 8 token and action run-on, F-08 "Empresa executora" hint in setup, F-09 registry seed of voltage classes and manufacturers, F-12 "Concluir ficha" jump, F-13 queued wording while online, F-14 Sync status contradictions, F-20 Cadastros default tab, F-21 account photo count wording, F-27 instrument picker order, F-28 two "Novo relatório" dialogs.
  evidence: split from the 2026-10-06 review batch so Story 11.11 ships on its own PR first (`_bmad-output/implementation-artifacts/reviews/mvp-review-2026-10-06/README.md`); Matheus chose three PRs on 2026-10-06.
  class: bug
  state: open (owner: next bmad-build run after the 11.11 PR)
- source_spec: none
  summary: Review fixes, layout and copy: F-06 sticky App bar, F-07 rail mid-word breaks, F-10 unlabeled photo button at 390, F-11 scroll-padding under the sticky bar, F-15 certificates row wording, F-16 duplicated Sumário title, F-17 export dialog header at 390, F-18 header counts wrap at 390, F-19 clipped options popover, F-22 display-read comparison wrap, F-23 stale live region, F-24 composer numbering, F-25 priority toast over Prazo, F-26 camera-opening state, F-29 "OK" badge at 390.
  evidence: split from the 2026-10-06 review batch, same source; third PR after the field-defects one.
  class: debt
  state: ~~open (owner: third bmad-build run of the batch)~~ closed 2026-10-07 by the review fixes batch 3 (`spec-review-fixes-layout-copy-3.md`, decisions D5 to D12)

- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-layout-copy-3.md`
  summary: F-24 follow-up: the Template composer lets the office reorder its section blocks (each with a Position box), but `instantiate` (`packages/domain/src/relatorio/instantiate.ts`, "Section blocks, in FO.SERV-03 number order") sorts the sections of a new relatório by their FO.SERV-03 number, so a section reordered in the composer comes out in number order in the relatório.
  evidence: `instantiate.ts` `sections.sort((a, b) => a.number - b.number)`; EXPERIENCE.md keeps the composer's Position box. Found while fixing F-24 (2026-10-07); out of that finding's scope (copy only).
  class: bug
  state: open (owner: Matheus: keep the composer's order or drop section reordering from the composer)

- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-layout-copy-3.md`
  summary: F-26 follow-up: the "Abrindo câmera…" state covers the "Fotografar placa" tile and the Sticky action bar's camera button; the other openers of the camera through their own `useCamera` still show nothing while the browser's permission prompt is open: "Ler visor" (the burst in `read-display.tsx`, `ReadDisplayButton` and the cabine's `EnvReadDisplayButton`), the NC row's "Adicionar foto" (`photo-openers.tsx` `RowPhotoAction`) and the palette's "Fotografar equipamento" (`relatorio/panel-capture.tsx`).
  evidence: `apps/web/src/surfaces/ficha/read-display.tsx` (`useCamera` in `ReadDisplayButton`, ~:483), `apps/web/src/surfaces/ficha/photo-openers.tsx` `RowPhotoAction`, `apps/web/src/surfaces/relatorio/panel-capture.tsx` (`useCamera`, ~:121); `CameraControl.opening` is there to read.
  class: debt
  state: open (owner: next sheet batch)

- source_spec: `_bmad-output/implementation-artifacts/spec-11-11-sheet-photo-strip-and-direct-picker.md`
  summary: The sheet mounts one more relatório-wide photo tile live query and PhotoViewer instance (`SheetPhotos` on `useCropViewer`, beside the nameplate and readings ones); one shared tile source and viewer per sheet would cut the queries.
  evidence: review BH8, 2026-10-06; same pattern as the existing mounts, so no user-visible defect today.
  class: debt
  state: open (owner: next sheet performance batch)

- source_spec: `_bmad-output/implementation-artifacts/spec-11-11-sheet-photo-strip-and-direct-picker.md`
  summary: The "Fotos da ficha" strip retry pill (`onRetry` -> `retryUpload`) has no e2e of its own; the pill is proven on the checklist row only.
  evidence: review VG5, 2026-10-06; one-line wiring on the shared PhotoRow.
  class: test
  state: ~~open (owner: epic QA)~~ re-owned (2026-10-14, E14-A2): owner the next story touching the "Fotos da ficha" strip, which adds the e2e; the Epic 11 QA ran without it.

- source_spec: `_bmad-output/implementation-artifacts/spec-11-11-sheet-photo-strip-and-direct-picker.md`
  summary: The "Fotos da ficha" strip draws caption, stamp and pill only; the mock (`60-ficha.html` 781) also prints the checklist row line ("Item 8 · Contatos · NC") and "Enviada" on an uploaded photo, and no test opens the strip on a not-tested (read-only) sheet.
  evidence: review BH5/BH6, 2026-10-06; the story's AC names badge, pill and caption.
  class: debt
  state: ~~open (owner: epic QA)~~ re-owned (2026-10-14, E14-A2): owner the next story touching the "Fotos da ficha" strip; the Epic 11 QA ran without it.

- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-layout-copy-3.md`
  summary: Sumário row 11 reads "3 instrumentos · nenhum certificado anexado · Nenhum instrumento em Dados do relatório" when the sheets copied instruments but setup ticked none; the two parts are both true (sheets vs setup) but read as a contradiction (review 2026-10-07, BH2).
  evidence: `packages/domain/src/relatorio/sumario.test.ts` Porto Seguro case; the setup row wording comes from Story 7.5 and predates batch 3. A reword such as "nenhum marcado em Dados do relatório" would settle it; copy decision for Bruno.
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-layout-copy-3.md`
  summary: F-11's `scroll-padding-bottom` measures the sticky bar against `window.innerHeight`, so on WebKit/iOS the on-screen keyboard inset (`visualViewport`) is left out of the padding EXPERIENCE.md:369 asks for; the WebKit leg of `test:e2e:matrix` was not run for this batch (review 2026-10-07, BH8).
  evidence: `apps/web/src/components/toast.tsx` `stickyBarCovered`; unverified on WebKit. A `durability-webkit` run of the F-11 case, or a `visualViewport.height` fallback with a test, would settle it.
  state: closed (2026-10-14, batch co14a): the `durability-webkit` run of F-11 failed (the padding was set but WebKit's focus scroll does not honour it); settled by `keepClearOfStickyBar` in `toast.tsx`, see the e14b gate entry. The `visualViewport` keyboard inset stays unmeasured: a real-iPad check for the epic QA.

- source_spec: `_bmad-output/implementation-artifacts/spec-13-4-keyboard-and-salvo.md`
  summary: Story 13.4 narrowing: a typed guess over a suggested "Data de fabricação" (OCR suggestion pending) still parses with `parseFieldInput`, so it refuses a bare year ("2012") and digit runs and applies no F-22 range, while the plain empty field accepts them through `parsePlateDateText`.
  evidence: `apps/web/src/surfaces/ficha/nameplate-suggestions.tsx` `useNameplateSuggestions().type` (~:237-241) and `packages/domain/src/relatorio/suggestion-group.ts:155-158`; review VG3, 2026-10-07. The spec kept the OCR path's parse unchanged; whether a bare year may be written over a suggestion is a product call.
  class: debt
  state: ~~open (owner: coordinator decision, then the next sheet batch)~~ closed 2026-10-08 by the review fixes batch r8read (PLN-13, decided with AIR-V1 in the coordinator's launch prompt): `parseFieldInput` reads a date through `parsePlateDateText` with the F-22 range when given `now`, so a typed bare year or digit run over a suggestion is taken as the plain field takes it.

- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-plate-reading.md`
  summary: Independent review r8read-rules-3 (PR #115): the OCR/structuring contract still documents a `date` value as `YYYY-MM[-DD]` (`structuringValueSchemaFor('date')`) while the reading accepts a bare plate year ("2012") before that check and the Bedrock prompt (`bedrock-structuring-2`) asks for `YYYY` when only a year is printed. A consumer validating against `structuringValueSchemaFor` would drop every bare-year plate date again.
  evidence: `packages/domain/src/contract/ocr.ts:131` and `:163`, the committed `services/ocr/contract/ocr-contract.schema.json:276`; `packages/domain/src/reading/value.ts` `normalizeReadingValue` (bare year returned first). The batch spec forbade editing `contract/ocr.ts`.
  class: debt
  state: open (owner: the next change to `contract/ocr.ts`: add `YYYY` to the date shape and re-export the schema)

- source_spec: `_bmad-output/implementation-artifacts/spec-13-4-keyboard-and-salvo.md`
  summary: EXPERIENCE.md › Autosave still describes "Salvo" as a visually hidden status; Story 13.4 made it a visible header line ("Salvo às HH:MM", offline "Salvo neste aparelho às HH:MM").
  evidence: `ux-fasor-2026-09-18/EXPERIENCE.md:404`; planning documents are amended by strike-through with a date, which this batch leaves to the coordinator.
  class: docs
  state: ~~open (owner: coordinator)~~ closed (2026-10-14, E13-A4): landed in #109; `EXPERIENCE.md:404` strikes the visually hidden "Salvo" sentence and adds the visible header line, dated 2026-10-08, Story 13.4.

- source_spec: `_bmad-output/implementation-artifacts/spec-13-3-13-5-zoom-and-waiting.md`
  summary: Story 13.3's touch spec (`e2e/photo-zoom.durability.spec.ts`) is skipped on `durability-webkit`: Playwright's WebKit build cannot store a photo Blob in IndexedDB ("UnknownError: Error preparing Blob/File data to be stored in object store"), so no photo exists there to zoom. The WebKit leg of the 13.3 DoD is a manual iPad pass (Epic 13 batch C, 2026-10-07).
  evidence: `test.skip` on `browserName === 'webkit'` at the top of the spec; it runs green on desktop Chrome and Android Chrome emulation.
  class: debt
  state: ~~open (owner: epic QA, manual iPad pass)~~ re-owned (2026-10-14, E13-A4): owner Matheus's device run, `test-artifacts/manual/offline-proof-script.md` steps 11 and 13 (E13-A3); the Epic 13 QA ran without the iPad pass.
- source_spec: `_bmad-output/implementation-artifacts/spec-13-3-13-5-zoom-and-waiting.md`
  summary: Story 13.5 (WAIT-3): the palette lists every live panel photo awaiting its dialog on that location, including one shot on another device whose dialog is still open there, so two devices could confirm the same photo and create the block twice (review 2026-10-07).
  evidence: `packages/domain/src/relatorio/panel.ts` `panelPhotosAwaiting` filters by kind, target and liveness only. Limiting it to this device's or author's photos is a product rule.
  class: question
  state: ~~open (owner: Matheus)~~ decided (2026-10-14, E13-A4, recording Matheus's answer of 2026-10-07 under Story 13.5 in `epics.md`): the palette lists the awaiting photos of every device. The two-device double-confirm risk this entry names stays open, routed: owner the next story touching `panelPhotosAwaiting` or the panel confirm, which adds a 10.3-style duplicate check at confirm (a second confirm of one photo is refused or merged), else Matheus accepts the risk with a dated line.
- source_spec: `_bmad-output/implementation-artifacts/spec-13-3-13-5-zoom-and-waiting.md`
  summary: Story 13.5 review (known open, unverified): the Sumário's `?panel=` effect drops the parameter if the photo is not yet in `snapshot.files` on its first run, so "Ver" would open the Sumário without the dialog; 13.5-E2E-005 passes, the tree mounting with the snapshot loaded.
  evidence: `apps/web/src/surfaces/relatorio/relatorio-tree.tsx` `PANEL_PARAM` effect. A slow-snapshot test would settle it.
  class: debt
  state: ~~open (owner: epic QA)~~ re-owned (2026-10-14, E13-A4): owner the next story touching the Sumário's `?panel=` effect, which adds the slow-snapshot test; the Epic 13 QA did not settle it.
- source_spec: `_bmad-output/implementation-artifacts/spec-13-3-13-5-zoom-and-waiting.md`
  summary: Story 13.5 review (known open): the panel dialog's elapsed wait text ("Lendo… N s" after 10 s) and the cancel sweep's order before auto-confirm (a cancelled reading equal to a typed value must be discarded, not auto-confirmed) have no test.
  evidence: `panel-capture.tsx` `panelWaitText`; `apps/web/src/sync/engine.ts` post-pull sweep; neither is referenced by a test.
  class: debt
  state: ~~open (owner: Epic 13 fix batch)~~ re-owned (2026-10-14, E13-A4): owner the next story touching `panel-capture.tsx` or the post-pull sweep in `sync/engine.ts`; the Epic 13 fix batch merged without it, it is not among the items of the carry-over batches co14a/co14b (E14-A7), and on 2026-10-14 `panelWaitText` is still referenced by no test.
- source_spec: `_bmad-output/implementation-artifacts/spec-13-8-emission-audit.md`
  summary: Story 13.8 review (known open): the audit worker's invalid-payload path (`handleAuditJobs`, `recordInvalidPayload` in `apps/api/src/jobs/audit/worker.ts`) has no test; a malformed job would leave its run reading as running until its age expires.
  evidence: only the definitions reference them; the integration test calls `runAuditJob` directly. Mirror `apps/api/src/jobs/generate/worker.integration.test.ts`.
  class: debt
  state: ~~open (owner: Epic 13 fix batch)~~ done (2026-10-08, review fixes batch r8emit, API-V1): the invalid-payload path also writes `finished_at` (`apps/api/src/jobs/audit/worker.ts`), and `apps/api/src/jobs/audit/worker.integration.test.ts` drives `handleAuditJobs` with a malformed payload (run failed, `audit_failed`, `finished_at` set, the row passing `auditRunRowSchema`) and with ids that name no row (logged only, never throws).
- source_spec: `AGENTS.md` (Decisions of record, 2026-10-08 story gate)
  summary: Three unit failures recur on this host in almost every gate and force reruns: `apps/web/src/state/theme.test.tsx` (fails every run), `apps/web/src/surfaces/export/export-dialog.test.tsx` (load-sensitive, passes alone) and the unhandled timer error from `apps/web/src/components/number-input.test.tsx:21` (a harness timer never cleared, setState after teardown). Fix them so a red unit stage means a defect.
  evidence: Epic 13 gate logs (`test-results/gate-e13*/test-unit.log` in the batch worktrees); `reviews/epic-13-review-qa.md` § 4 (b).
  class: debt
  state: ~~open (owner: the next carry-over batch)~~ closed (2026-10-08, PR #116, review fixes batch r8gate, E13-A2): `theme.test.tsx` was a real race (a late first read of `local_prefs` put the old theme back after a press; a choice made first now wins, `apps/web/src/state/theme.tsx`); `export-dialog.test.tsx:271` waits for the press the dialog defers until its first read; the `number-input.test.tsx` harness clears its timers on unmount; `session.test.tsx` unmounts before it deletes its database, and it and `theme.test.tsx` wait 5 s on their Dexie boots. `test:unit` green twice in a row on the merged head 201ef72: 270 files, 3132 tests (122 s, 112 s).
- source_spec: `AGENTS.md` (Decisions of record, 2026-10-08 story gate)
  summary: Measure, on a free machine, (B) the `@p0` e2e at `--workers=2` against `PARALLEL_WORKERS=1` (the 2026-09-27 three-worker validation failed on the older 4 GB VM; the VM now has 11.4 GB) and (C) the plain `pnpm verify` against the stage-by-stage gate (it was OOM-killed on the 4 GB VM). Adopt each one only if it stays green twice.
  evidence: `e2e/support/groups.ts` `PARALLEL_WORKERS`; `scripts/verify.ts` phases; `spec-test-speed.md`.
  class: debt
  state: ~~open (owner: coordinator, next free gate)~~ closed (2026-10-08, main a8b9b0e): (B) `--workers=2` passed `@p0` 229/229 twice (612 s, 723 s, against 1081 s on one worker), `PARALLEL_WORKERS` is now 2; (C) the plain `pnpm verify` ran twice without OOM (run 1 green in 1527 s; run 2 stopped at `test:unit` on the recurring `export-dialog.test.tsx`, the entry above), the stage-by-stage script is retired
- source_spec: `epic-13-retro-2026-10-08.md` (E13-A1 wave gate)
  summary: Four e2e failures remain on integrated main after Epic 13, each a known host failure or red on the pre-epic base b1c2c6b: points 6.6-E2E-011 (load-sensitive, passes alone), ficha.durability E5-A2-E2E-003 (`toBeFocused` "inactive" at 390 px on this host), Android 4.5-E2E-004 (phone palette bottom sheet) and WebKit F-11 (reading focus by Tab or Enter run). They keep `test:e2e:full` and the matrix red on this host.
  evidence: `test-results/wave-e13/e2e-full.log` and `e2e-matrix.log` in the E13-A1 worktree; `reviews/epic-13-review-qa.md` § 1 (base comparison).
  class: debt
  state: ~~open (owner: the next carry-over batch, with E13-A2).~~ points 6.6-E2E-011 and WebKit F-11 closed 2026-10-14 by batch co14a (the two entries below and the e14b gate entry say how); Android 4.5-E2E-004 stays open (owner: the next carry-over batch). 2026-10-08, batch r8emit (PR #119): ~~ficha.durability E5-A2-E2E-003~~ settled in the test, with E5-A2-E2E-002 (same race): the test tapped "T1, Valor" before the stepper's first land (`afterFrames(land)`, 3 frames, `apps/web/src/surfaces/ficha/use-ficha-steps.ts`), which then focused `#ficha-step-ensaios` (the reading "inactive", no toast up, traced with a probe); both now wait for the step's focus before the tap (`e2e/ficha.durability.spec.ts`), and the whole spec passed 3 of 3 on both desktop projects. No product defect: a person cannot tap within those 3 frames, and the 12-frame re-land never takes the focus from a control. The other three failures stay open here; 6.6-E2E-011 failed 2 of 6 on the r8emit base with the batch stashed.
- source_spec: `epic-13-retro-2026-10-08.md` (E13-A1 wave gate)
  summary: Building the api/tools image from scratch in a new compose project on this macOS podman host fails: the LibreOffice step downloads the arm64 packages while dpkg reports an amd64 system ("package architecture (arm64) does not match system (amd64)"). Existing images run fine, so new worktrees reuse them with `podman tag`. Likely a `TARGETARCH` versus the base image platform mismatch in the Dockerfile's LibreOffice case.
  evidence: `test-results/wave-e13/attempt1/verify-plain.log` (E13-A1 worktree) around line 675; the `RUN arch="${TARGETARCH:-$(dpkg --print-architecture)}"` step.
  class: defect
  state: open (owner: the next carry-over batch)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-gate-integrity.md`
  summary: `scripts/e2e.ts` `summarize` keys results by title, so under `--repeat-each` the summary counts each title once with its last outcome (a run with 2 failed repeats printed "14 passed" while Playwright exited 1). The exit code stays right; only `summary.json` and the printed counts undercount.
  evidence: `scripts/e2e.ts` `collect()` (`into.results[...] = test.status`); the batch's `--repeat-each=5` run of `journey-forward.spec.ts` (PR #116 body). Predates the batch.
  class: bug
  state: open (owner: the next carry-over batch)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-gate-integrity.md`
  summary: The `signIn` setup helper waits 5 s for Home ("Relatórios por status"); under host load 12.2-E2E-006 failed there 2 of 5 repeats, then passed 3 of 3 isolated.
  evidence: `e2e/support/merged-fixtures.ts` `signIn`; `e2e/journey-forward.spec.ts:172`; PR #116 body.
  class: debt
  state: open (owner: the next carry-over batch); assigned 2026-11-10 to Epic 24, Story 24.9; ~~open~~ closed 2026-11-11 by batch e24b (Story 24.9, `spec-e24b-screen-lane.md`): `signIn` waits up to 15 s for Home
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-gate-integrity.md`
  summary: The unhandled timer error of `apps/web/src/components/number-input.test.tsx:21` (PR #105) could not be reproduced on demand, not even with `--detectAsyncLeaks`; PR #116 makes the harness clear its timers on unmount, which removes the only timer that outlived a test. Close it once a wave gate shows no such error.
  evidence: `apps/web/src/components/number-input.test.tsx` `Harness`; PR #116 body.
  class: test-gap
  state: ~~open (owner: the coordinator, at the next wave gate)~~ closed (2026-10-14, E14-A2): no such error since PR #116. The story gates of PRs #129 and #130 ran the whole `test:unit` with exit 0 (4083 and 4098 tests), and the only unit red of PRs #126 to #130 was the `quantity-stepper` flake of its own row.
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-gate-integrity.md` (independent review of PR #116, r8gate-correctness-1)
  summary: With a corrupt stored theme, a theme pressed during the provider's first read is put first and then overwritten by `readTheme`'s repair write of 'system' (the localStorage mirror too); the `chosen` guard drops the read result, so the screen shows the choice while `local_prefs` holds 'system' until the next load. Narrow: needs a corrupt row plus a press during the first read.
  evidence: `apps/web/src/db/prefs.ts:22-29` (repair write in `readTheme`); `apps/web/src/state/theme.tsx:50` (`cancelled || chosen.current`) and `:70-77` (`setTheme`). Fix: skip the repair when a choice was made, or repair only while the row still holds the invalid value (compare-and-put in one Dexie transaction).
  class: bug
  state: open (owner: the next carry-over batch)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-gate-integrity.md` (independent review of PR #116, r8gate-correctness-3 and r8gate-tests-4)
  summary: The source scans in `scripts/e2e.test.ts` are textual. The focused-test scan misses `it.only.each(` and a `.only(` split across lines (`allowOnly: false` and `forbidOnly: true` still fail those at run time). The TST-2 guard has no run-time backup: it checks only the literal `name: 'Sincronizar agora'`, so `getByText`, double quotes or a regex name pass it, and it picks the tap-timing specs by the prose of `SERIAL_SPECS[].why`.
  evidence: `scripts/e2e.test.ts` `FOCUSED` and the TST-2 test (`/^times (a|every) tap/`, `.includes("name: 'Sincronizar agora'")`); `e2e/support/groups.ts:58-61, :90`. No current spec breaks either; every current use is written `{ name: 'Sincronizar agora' }`.
  class: test-gap
  state: open (owner: the next carry-over batch)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-gate-integrity.md` (independent review of PR #116, r8gate-tests-2)
  summary: `export-dialog.test.tsx` no longer pins that the press asks for the sync cycle at once: its `waitFor(() => expect(pending.syncNow).toHaveBeenCalled())` is also met by the flushing effect's retry kick 10 ms later (`retryMs` 10 in the test, 2000 in production), so removing `void sync.syncNow()` from `start()` keeps it green.
  evidence: `apps/web/src/surfaces/export/export-dialog.test.tsx:36, :275`; `apps/web/src/surfaces/export/use-generate.ts:372-387, :468-473`. Fix: wait for the dialog's first read before the click and keep the synchronous expect, or give the test a `retryMs` above the wait window.
  class: test-gap
  state: open (owner: the next carry-over batch)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-gate-integrity.md` (independent review of PR #116, r8gate-tests-5)
  summary: `duplicateTestIds()` compares a template id as its source text (`10.3-E2E-00${...}`), so a new literal `10.3-E2E-001` would duplicate a runtime id of `e2e/conflicts.spec.ts:337` unseen, and titles held in a variable are not read at all. No collision exists today.
  evidence: `scripts/e2e.test.ts` `testIds`; `e2e/conflicts.spec.ts:337, :708`. Fix: expand `${cond ? a : b}` into both ids, or read the ids from `playwright test --list --reporter=json`.
  class: test-gap
  state: open (owner: the next carry-over batch)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-gate-integrity.md` (independent review of PR #116, r8gate-rules-5)
  summary: The TST-V2 renames leave review and QA documents citing the old ids: `reviews/epic-13-review-qa.md:100` cites 13.7-E2E-001 for the plated tile (now 13.7-E2E-002, `e2e/plate-every-type.spec.ts:83`); `spec-epic-7-8-fix-qa.md:166` and `reviews/epic-7-8-review-qa.md:209` cite 8.1-E2E-005 for the nameplate-values test (now 8.1-E2E-010; 8.1-E2E-005 resolves only to `e2e/suggestions.spec.ts:279`). The map: ficha D-2 12.1-E2E-007 to 12.1-E2E-011, ficha J-15 12.1-E2E-008 to 12.1-E2E-012, plate-every-type plated case 13.7-E2E-001 to 13.7-E2E-002, nameplate-values 8.1-E2E-005 to 8.1-E2E-010.
  evidence: PR #116 body; `spec-review-fixes-2026-10-08-gate-integrity.md` Execution list. A dated note beside each citation (strike-through rule) settles it.
  class: docs
  state: ~~open (owner: the coordinator)~~ resolved 2026-10-09 (closing docs PR of the round): a dated note beside each citation, plus `reviews/epic-7-8-review-qa.md:23` (the `ficha.spec.ts` case of 12.1-E2E-007, now 12.1-E2E-011); `reviews/epic-13-review-qa.md:100` reads as a split, since the old 13.7-E2E-001 named both the plated and the cable case
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-gate-integrity.md` (independent review of PR #116, r8gate-rules-2)
  summary: `playwright/no-wait-for-timeout` warns on e2e/** since PR #116, with an allow-list of the files whose fixed waits are the gesture or schedule under test (`e2e/support/taps.ts`, `e2e/lost-taps.durability.spec.ts`). The other 24 `waitForTimeout` calls warn on every lint run until each is shrunk, sized from an app constant or allowed (review TST-7).
  evidence: `eslint.config.js` (the e2e block and its allow-list); `pnpm lint` reports 24 warnings, 0 errors.
  class: debt
  state: open (owner: the next carry-over batch, with TST-7)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-photo-failures.md`
  summary: Review 2026-10-08 DG-2, narrowed (known open): the r8cap batch adds "Manter o digitado" on each replace line and discards a replace suggestion when a different value is typed; the group action "Manter os digitados" and the tree's "Concluída · N sugestões" (a concluded ficha with pending suggestions reads as concluded while the Sumário does not count it) are not built. An identical retype still writes nothing (no discard).
  evidence: `review-field-ux-and-code-2026-10-08.md` DG-2; `apps/web/src/surfaces/relatorio/relatorio-tree.tsx` (r8lay's file); `packages/domain/src/relatorio/progress.ts:41-51`.
  class: debt
  state: open (owner: coordinator)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-photo-failures.md`
  summary: Review 2026-10-08 DB-4, narrowed (known open): the camera now says "Salvando a foto…" / "Salvando as fotos…" and disables the shutter and "Concluir" until it closes, but still closes only once each shot is stored, which waits for the GPS fix (up to 5 s, `FIX_WAIT_MS`). Closing before the fix needs a later coords op on the photo (a contract change); measure the close on a real tablet first.
  evidence: `review-field-ux-and-code-2026-10-08.md` DB-4; `apps/web/src/files/geolocation.ts:10, 93-100`; `apps/web/src/surfaces/ficha/use-photo-capture.ts` `shoot`.
  class: debt
  state: open (owner: coordinator)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-photo-failures.md` (r8cap batch review, E10/E11)
  summary: Review 2026-10-08 CAPT-V1, known open: a reread that reads nothing after an earlier run's suggestions were discarded ("Cancelar", then "Ler de novo") reads `done`, not `empty`, so the plate row or the display cell shows no line. `plateReadingView` and `targetLine` decide `empty` from any suggestion row citing the photo; telling the latest run apart needs the photo's newest `reading_run_id` on the device (a contract addition).
  evidence: `packages/domain/src/relatorio/plate-suggestions.ts` `plateReadingView`; `packages/domain/src/relatorio/measurement-suggestions.ts` `targetLine`; `apps/api/src/jobs/reading/job.ts:241-262` (each run writes its rows with its own `reading_run_id`).
  class: debt
  state: open (owner: coordinator)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-concluir-text.md`
  summary: Review 2026-10-08 AIB-1, the parecer part (known open): the r8conc batch adds the `conclusion_stale` pre-issue row for the sheets' conclusion texts only; a confirmed or edited parecer text whose basis no longer matches section 10's values has no `parecer_stale` row, so the Sumário and the Export dialog do not say it.
  evidence: `review-field-ux-and-code-2026-10-08.md` AIB-1; `packages/domain/src/relatorio/pre-issue.ts` (`conclusion_stale` beside `conclusion_unconfirmed`); `packages/domain/src/relatorio/parecer.ts`. The batch's Never list excludes `parecer_stale`.
  class: debt
  state: open (owner: coordinator)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-concluir-text.md`
  summary: Open question: the review's 14.3 lists "+ D-7 observation" in the conclude batch, while the source-deltas row of 2026-10-08 lists only `text`, `text_status` and `text_basis`. The conservative reading ships: "Concluir ficha" never writes the D-7 sheet observation suggestion (`suggestedSheetObservation`); only the text's own "Confirmar" (and the observation's) writes it. Consequence (independent review of PR #121, 2026-10-09, r8conc-decision-1): on a Sem restrições sheet with NC observations, the old route (confirming the text later, which wrote the observation with it) is gone once "Concluir ficha" confirms the text, so the suggestion stays unwritten unless its own "Confirmar" is tapped, and no pre-issue row names it (the observation is required only with Com restrições).
  evidence: `review-field-ux-and-code-2026-10-08.md` 14.3; `source-deltas.md` row "Story 5.8: the composed conclusion text …"; `apps/web/src/surfaces/ficha/use-ficha-actions.ts` `conclude`; `apps/web/src/surfaces/ficha/conclusao-section.tsx` `confirmText`.
  class: debt
  state: open (owner: Matheus)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-concluir-text.md`
  summary: Open question (AIB-1): a stale edited conclusion text is named in the new `conclusion_stale` row ("Texto de conclusão desatualizado: <TAG>") but still prints in section 9 (`print/section-9.ts` prints an edited text always, drops a stale confirmed one). Whether a stale edited text should print, or block, is a product decision; AIB-16's single print rule stays out of this round.
  evidence: `packages/domain/src/print/section-9.ts` `conclusionParts`; `packages/domain/src/relatorio/pre-issue.ts` `staleConclusionNames`.
  class: debt
  state: open (owner: Matheus)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-concluir-text.md`
  summary: Wording review (Decision 1 of 2026-10-08: "Concluir ficha" confirms the composed text): the conclusion text helper still reads "… Impresso na linha Conclusão da seção 9 depois de confirmar." (mock copy) although "Concluir ficha" now confirms the text; Bruno may prefer "confirmado ao concluir a ficha", as the instrument picker says. The new kernel copy `conclusionStaleText` ("Texto de conclusão desatualizado: …", authored) is in the same review.
  evidence: `apps/web/src/copy/pt-br.ts` `ficha.conclusao.textHelper`; `packages/domain/src/relatorio/pre-issue.ts` `conclusionStaleText`.
  class: docs
  state: open (owner: Bruno)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-concluir-text.md` (r8conc batch review, edge-case EC-1)
  summary: Known open: the conclude, the ficha's conclusion text field and Story 5.8's "Confirmar" compose with the TAG of the project's equipment row, removed rows included (`useProjectEquipment`, `rows.equipment`), while section 9 and the pre-issue rows read only the snapshot's live equipment rows. A live block whose equipment row was removed (a merge state) would get a text that reads stale at once in section 9 and the `conclusion_stale` row. Pre-existing divergence, not introduced by the fold.
  evidence: `apps/web/src/surfaces/ficha/use-ficha-actions.ts` `conclude`; `apps/web/src/surfaces/relatorio/relatorio-editor.ts:70-80`; `packages/domain/src/schemas/snapshot.ts` `buildSnapshot` (live equipment only). Settle by choosing one TAG source for the ficha, section 9 and pre-issue.
  class: bug
  state: open (owner: coordinator)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-concluir-text.md` (r8conc batch review, edge-case EC-7)
  summary: Open question: the new `conclusion_stale` row is summarized in the Export dialog ("N avisos — estão nas linhas do sumário", "Ver no sumário" leads to row 9, which names the TAGs), like its twin `conclusion_unconfirmed`; it is not in `EXPLICIT_KINDS`, so the dialog itself does not name the TAGs. A stale confirmed text is dropped from section 9 while the sheet still shows it, which fits the `EXPLICIT_KINDS` rationale ("the document then prints … the sheet did not name"); listing it by name is a one-word change once decided.
  evidence: `packages/domain/src/relatorio/pre-issue.ts` `EXPLICIT_KINDS`, `exportPrecheck`; `apps/web/src/surfaces/export/export-dialog.tsx:419-458`.
  class: debt
  state: open (owner: Matheus)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-concluir-text.md` (r8conc batch review, edge-case EC-4 and EC-3)
  summary: Known open: `conclusionStaleText` names every stale sheet, with no cap ("e mais N") and no disambiguation of two sheets sharing a TAG (the duplicate already has its own `duplicate_tag` row). Many concluded sheets going stale at once (a criterion change in a later seed) would make row 9's meta long.
  evidence: `packages/domain/src/relatorio/pre-issue.ts` `conclusionStaleText`, `staleConclusionNames`.
  class: debt
  state: open (owner: Bruno, with the wording review)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-concluir-text.md` (r8conc batch review, edge-case EC-10)
  summary: Known open: concluding a sheet has no undo toast (unchanged: `conclude` shows the plain "Ficha concluída"), so the folded text cannot be undone from the UI; the batch's inversion is covered by the kernel `invertBatch` test in `conclusion.test.ts` and the generic `undoBatch` tests. After an undo the text fields read as null cells, which every reader treats as absent.
  evidence: `apps/web/src/surfaces/ficha/use-ficha-actions.ts` `conclude` (`showToast(t.concluded)`); `packages/domain/src/relatorio/conclusion.test.ts` (R8CONC undo case); `apps/web/src/db/commit.test.ts` "batch and undo".
  class: debt
  state: open (owner: coordinator)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-concluir-text.md` (independent review of PR #121, r8conc-decision-2)
  summary: Open question: when a sheet is concluded with a confirmed (never edited) text that went stale, should the conclude replace it with the fresh composition, as it confirms an unconfirmed one? Kept as is for now: the conclude never writes over a stored confirmed or edited text (`conclusionTextOnConclude`), the sheet shows "Sugerido: texto atualizado — Substituir" and row 9 names it (`conclusion_stale`).
  evidence: `packages/domain/src/relatorio/conclusion.ts` `conclusionTextOnConclude`; `packages/domain/src/relatorio/pre-issue.ts` `staleConclusionNames`.
  class: debt
  state: open (owner: Matheus)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-concluir-text.md` (independent review of PR #121, r8conc-consistency-2)
  summary: Known open: a `text_basis` conflict (two devices confirming or editing the conclusion text concurrently, or an edited text against a conclude) shows each side's 8-hex basis hash in the Conflict view, a value the engineer cannot read; `text_status` now reads "Confirmado" / "Editado". *(2026-10-09, focused review of 794757a: the text, its status and its basis are one "Texto da conclusão" row; the basis has no row of its own and no hash is shown; each side's meta says its status.)*
  evidence: `packages/domain/src/merge/conflicts.ts` `conflictValueText`, `CONCLUSION_WORDS`, `conclusionTextConflict`.
  class: debt
  state: closed (PR #121, contract 16 round)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-emission.md`
  summary: Review 2026-10-08 DF-6, narrowed: the issue confirmation names a named party's blank CNPJ ("o CNPJ do contratante em branco", "os CNPJs do contratante e da contratada em branco") and the missing logo ("o logo da empresa não cadastrado") only when it is already asked (empty sheets or `[Rótulo]` blanks, decision D1). Open question for Matheus: should a blank CNPJ or a missing logo alone ask before issuing?
  evidence: `packages/domain/src/relatorio/pre-issue.ts` `issueConfirmation`, `identityGapParts`; EXPERIENCE.md:337 (D1); source-deltas.md row 27 (warn only, never required).
  class: debt
  state: open (owner: coordinator, decision by Matheus)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-emission.md`
  summary: Review 2026-10-08 DF-1, narrowed: "Pré-visualizar" and "Gerar relatório" stay reachable through the Sumário foot bar made sticky (static under 480 px height, with the page's scroll padding); no "Gerar relatório" entry was added to the header overflow or the Home card (the report's second option).
  evidence: `apps/web/src/surfaces/relatorio/relatorio.css` (block "Review fixes 2026-10-08 (batch r8emit): DF-1", in r8lay's file); `sumario-surface.tsx` `useStickyBarScrollPadding`.
  class: debt
  state: open (owner: coordinator)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-emission.md`
  summary: Open question (review 2026-10-08 DC-4, DB-5): an arrival toast ("N leituras prontas para confirmar · Ver") now leaves once served (nothing it named is pending off screen) but still never on a timer, as EXPERIENCE.md:262 and the Epic 13 Q-1 decision say for a toast with an action. Should it expire (DE-6 refuted an 8-10 s expiry for undo toasts; nobody decided one for arrivals)?
  evidence: `apps/web/src/state/reading-arrivals.tsx`; `packages/domain/src/relatorio/arrivals.ts` `arrivalServed`; `state/toast.tsx` header (Q-1, R-1).
  class: debt
  state: open (owner: coordinator, decision by Matheus)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-emission.md`
  summary: Open question (review 2026-10-08 DE-6, DC-4): at 390 px the undo toast wraps to 4 lines ("Foto 28 removida do relatório · Desfazer · Fechar") and the arrival toast to 3-4; the report proposes one-line undo copy ("Foto 28 removida · Desfazer") and a 1-2 line cap. Copy from the mocks was kept; the batch only added the bottom room and the focused-field rule.
  evidence: `review-field-ux-and-code-2026-10-08.md` DE-6, DC-4; `apps/web/src/components/toast.tsx`.
  class: debt
  state: open (owner: coordinator, wording by Bruno)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-emission.md`
  summary: Open question (review of PR #119, r8emit-rules-2): "Ver" on a reading-arrival toast opens the first sheet in tree order with a pending suggestion (Story 8.2 AC, epics.md:2019; FR-42), so when an earlier sheet holds older pending suggestions it opens that one, not the sheet the toast announced. The review loop had changed it to the announced rows first; reverted to the AC. Should "Ver" open the announced sheet first?
  evidence: `apps/web/src/state/reading-arrivals.tsx` `arrivalTarget`; epics.md:2019, :82; EXPERIENCE.md:379.
  class: debt
  state: open (owner: coordinator, decision by Matheus)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-emission.md`
  summary: Review 2026-10-08 DC-4, known open: when one pull brings both readings and caption suggestions, one toast announces the readings only (one toast at a time; the kernel's `arrivalAnnouncement` rule); the captions stay on the gallery's "N legendas sugeridas" line and Sumário row 7. Captions of two relatórios in one pull are counted together while "Ver" opens one gallery. A panel suggestion arriving while its Sumário `?panel=` result dialog shows it is still announced (pre-existing).
  evidence: `packages/domain/src/relatorio/arrivals.ts`; `apps/web/src/state/reading-arrivals.tsx`; spec triage log (2026-10-08 review pass).
  class: debt
  state: open (owner: coordinator)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-emission.md`
  summary: Residual risk (QW25): "Pré-visualizar" pressed in the first moments after a load, before the sync provider's first outbox read lands, reads `counts.dead` as 0, opens the blank tab and closes it again when the drain finds the dead op (the refusal still shows). The tab must open inside the press, so the press-time check cannot wait for the read.
  evidence: `apps/web/src/surfaces/export/use-preview.ts` `start`; `use-generate.ts` `outboxRead` guard for comparison.
  class: debt
  state: open (owner: coordinator)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-emission.md`
  summary: Known open from the independent review of PR #119 (lows, not fixed in the batch): (1) r8emit-toast-2: `keepClearOfToast` scrolls the window only, so a focused row in a nested scroller (the ficha rail at 768-1024 px with the rail open) stays under the toast while the page behind it jumps; (2) r8emit-export-barrier-2: the preview and audit polls do not stop on a session known to be gone (pre-existing; the re-auth banner shows, and signing in again resumes the poll); (3) r8emit-correctness-tests-1: closing the Export dialog after the preview job was asked closes the waiting tab and drops the preview without a word (the server render is wasted).
  evidence: the independent review of PR #119 (findings r8emit-toast-2, r8emit-export-barrier-2, r8emit-correctness-tests-1); `apps/web/src/components/toast.tsx`; `use-preview.ts`, `use-audit.ts` poll loops.
  class: debt
  state: open (owner: coordinator)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-emission.md`
  summary: Planning documents to amend with a dated line (strike-through rule) for what PR #119 ships: EXPERIENCE.md:273 (the Sticky action bar now also on the Sumário, DF-1); EXPERIENCE.md:337 (the D1 question also names a named party's blank CNPJ and the missing logo, DF-6); EXPERIENCE.md:262 and :379 (a reading-arrival toast is not raised for suggestions the screen already draws, captions are their own "N legendas sugeridas" toast whose "Ver" opens the gallery, an arrival toast leaves once served, a toast reserves its own height at the page's bottom and a focused field scrolls clear of it).
  evidence: PR #119 body; review of PR #119 r8emit-rules-5.
  class: docs
  state: ~~open (owner: coordinator)~~ resolved 2026-10-09 (closing docs PR of the round): dated notes on EXPERIENCE.md :262 (toast room and focused field, arrival toast leaves once served), :273 (Sumário foot bar sticky), :337 (DF-6 names in the question) and :379 (what a pull announces, the caption toast)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-layout-interaction.md`
  summary: Open question (review 2026-10-08 DC-1): the transformer TTR at tablet widths stays a table (UX-DR40 "real table at every width", UX-DR74 "tables in full in landscape"); in a 657 px box (768 portrait with the strip, 1024 with the 320 px rail) its eight columns at their whole-word minimum (about 825 px, measured 2026-10-09 once the unit and the "Não medido" trigger wrap under the input: TAP 44, V 114 + 114, Calculado 113, captures 3 x 120, Condição 80) do not fit, so the table scrolls inside its own `.mt-scroll` box, the title row and the page still; from 1280 (864 px) it fits. Cards up to 1279 px, or an auto-collapsing rail while a sheet is filled (DC-8), are the alternatives the report proposes.
  evidence: `apps/web/src/surfaces/ficha/ficha.css` (block "Review fixes 2026-10-08 (batch r8lay)"); `ensaios-section.tsx` `.mt-scroll`; report DC-1, DC-8; spec Design Notes.
  class: debt
  state: open (owner: coordinator, decision by Matheus and Bruno)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-layout-interaction.md`
  summary: Open question (review 2026-10-08 DA-6): the phone Sumário tree rows keep the drag handle and the Position box on every row (about 100 px left for TAG, type and state); the batch only keeps words whole. Hiding the handle or the Position box below 768 px (reorder from the menu or a "Reordenar" mode) is a product change.
  evidence: `apps/web/src/surfaces/relatorio/relatorio-tree.tsx` `SumarioEquipment`; `relatorio.css` (block r8lay DA-6); report DA-6.
  class: debt
  state: open (owner: coordinator, decision by Matheus and Bruno)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-layout-interaction.md`
  summary: Open question (review 2026-10-08 DB-3): abbreviating or dropping the Linha / Terra / Guard columns (an empty Guard column at phone width) would let the phone isolation tables fit without their own scroller; the batch keeps every column and its words whole, and lets a too-wide table scroll inside `.mt-scroll`.
  evidence: `apps/web/src/surfaces/ficha/ficha.css` (phone table rules); report DB-3; EXPERIENCE.md:307.
  class: debt
  state: open (owner: coordinator, decision by Matheus and Bruno)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-layout-interaction.md`
  summary: Open question (review 2026-10-08 DB-2): a unit change on an open sheet still rewrites the value at once with no "Desfazer", and on a concluded sheet the batch only turns the first tap into "edit the cell" (the kernel's `unitTapNeedsEdit`); the report also proposes the unit as a choice with Desfazer once a value exists, or a confirmation on a concluded sheet.
  evidence: `apps/web/src/surfaces/ficha/measurement-field.tsx` `tapUnit`; `packages/domain/src/relatorio/reading-run.ts` `unitTapNeedsEdit`; report DB-2.
  class: debt
  state: open (owner: coordinator, decision by Matheus)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-layout-interaction.md`
  summary: Open question (review 2026-10-08 DH-1): the Combobox popover with 'Criar "…"' still opens over the next field (Nome in the instrument panel), so a tap meant for Nome lands on "Criar"; moving the popover off the next field is a design question. The leave-commit now saves the name either way.
  evidence: `apps/web/src/components/combobox.tsx` (Popover placement); `registry-picker-field.tsx` `commitLeft`; report DH-1.
  class: debt
  state: open (owner: coordinator, decision by Bruno)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-layout-interaction.md`
  summary: Review 2026-10-08 DA-1, narrowed: the Form and Confirm dialogs now stay inside the scrim's padding and scroll inside themselves (`app.css` block r8lay, the `export.css` precedent), but DESIGN.md › Form dialog and UX-DR60 (epics.md:272) ask for a full-screen Form dialog on phone; still not full-screen.
  evidence: `apps/web/src/styles/app.css` (block "Review fixes 2026-10-08 (batch r8lay)"); DESIGN.md › Form dialog; epics.md:272.
  class: debt
  state: open (owner: coordinator)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-layout-interaction.md`
  summary: ~~Known open~~ Open question against Story 13.4 INP-2 (epics.md:2837-2839, "done" on the run's last input before the primary; independent review of PR #122, r8lay-rules-2, 2026-10-09) (review 2026-10-08 DB-7): every plate and cabine text, number and date-text field labels the keyboard's Enter key "next", including the last one before the sheet's primary (the readings' run computes "done" from the kernel's run; the plate has no such run in the kernel). Also: Enter in a select or a manufacturer / voltage class field does not run on.
  evidence: `apps/web/src/surfaces/ficha/ficha-fields.tsx` `focusNextMissingField`, `enterKeyHint="next"`.
  class: debt
  state: open (owner: coordinator, decision by Matheus: keep "next", or compute "done" when no missing-field marker follows the field, a dynamic target the plate run gained with DB-7)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-layout-interaction.md`
  summary: Known open (review 2026-10-08 DH-1): an unreadable voltage class ("abc") typed and left in Classe de tensão creates nothing and stays as typed text, unsaved and unmarked (today's behaviour; `parseVoltageClassKv` returns null).
  evidence: `apps/web/src/surfaces/ficha/ficha-fields.tsx` `WordField` `onCreate`; `apps/web/src/components/registry-picker-field.tsx` `commitLeft`.
  class: debt
  state: open (owner: coordinator)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-layout-interaction.md`
  summary: ~~Open question, a contradiction in the spec~~ (resolved 2026-10-09, review of the batch: the value cells of a ratio table keep the mock's own wrap, `.is-wide td.cell-value .measurement-field { flex-wrap: wrap }`, so the unit and the 48 px trigger go under the input, and "Marcar Com restrições" wraps between its words; both tables fit at 1280 and R8LAY-E2E-001/009 assert it) Was: a contradiction in the spec (AC1, AC2 "at 1280 the table scroller does not scroll at all"; Design Notes "from about 880 px it fits"): measured on 2026-10-09 at 1280x800 the transformer TTR's whole-word minimum is 1223 px and the TP's 945 px, against the 864 px the 880 px content column leaves (rail open or not, `--content-max`). Each value cell carries its 48 px "Não medido" Overflow trigger, each V cell a 48 px unit slot, and each input keeps six digits ("34,512") at the value size, so neither fits without dropping a touch target, the unit slot's mock width or the content cap. Both tables scroll inside `.mt-scroll` at 1280 with the title row and the page still; R8LAY-E2E-001/009 assert that, not the no-scroll clause.
  evidence: `e2e/review-layout-interaction-2026-10-08.spec.ts` R8LAY-E2E-001 and -009 (the 2026-10-09 measurement before the fix, one-line cells: TAP 44, V primário 210, V secundário 210, Calculado 113, captures 199/199/168, Condição 80; TP: 68, 210, 210, 127, 168, 162); `components.css` `.overflow-trigger`, `.mf-unit` (`min-width: var(--touch-min)`); `tokens.css` `--content-max: 880px`.
  class: debt
  state: resolved (2026-10-09)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-layout-interaction.md`
  summary: Planning documents to amend with a dated line (strike-through rule) for what PR #122 ships (independent review r8lay-rules-1, 2026-10-09): EXPERIENCE.md:125 (Units: "a tap cycles MΩ → GΩ → TΩ"; on a concluded sheet a pointer tap on a measured cell's unit only focuses the input, the kernel's `unitTapNeedsEdit`); EXPERIENCE.md:276 (Combobox: a name typed under "Outro…" and left is selected or created as "Criar" would, only text changed since the field took the focus); EXPERIENCE.md:307/:406 and source-deltas.md D-2 (Enter in a plate or cabine field commits and moves to the next missing field, then the primary; that run does not collapse the section it leaves, only the readings run does); DESIGN.md › Measurement table and `60-ficha.html` (each table in its own `.mt-scroll` box, the title row never scrolls; ratio tables by content from 768 px, the trailing parts under a six-digit input; Condição drawn `td.cell-dim`; phone point labels wrap between words, the phone value input 4.5ch); DESIGN.md › Form dialog (the dialog scrolls inside the scrim on phone, not full screen).
  evidence: PR #122 body; `measurement-field.tsx` `tapUnit`; `registry-picker-field.tsx` `commitLeft`; `ficha-fields.tsx` `focusNextMissingField`; `use-ficha-steps.ts` `isEnterRunMoving`; `ficha.css` and `app.css` r8lay blocks.
  class: docs
  state: ~~open (owner: coordinator)~~ resolved 2026-10-09 (closing docs PR of the round): dated notes on EXPERIENCE.md Units, Combobox, Measurement table and the Enter line of Interaction Primitives, the source-deltas D-2 row, and DESIGN.md Measurement table (the fixed widths struck) and Form dialog (not full screen yet; the DA-1 row stays open); the mock `60-ficha.html` is not redrawn, DESIGN.md wins over it
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-layout-interaction.md`
  summary: Deferred review finding (spec frontmatter `deferred:`, independent review r8lay-rules-3): a TAG wider than the phone Sumário row's room runs the page sideways at 390 px; the rail's F-07 ellipsis has no phone `.s9-eq` counterpart. Mostly pre-existing (`.sum-s9 .s9-eq-open`'s grid already gave an unbreakable TAG its min-content), now with the batch's `nowrap` TAG and `min-content` row.
  evidence: `apps/web/src/surfaces/relatorio/relatorio.css` (block r8lay DA-6); TAGs are free text (`tag-dialogs.tsx`).
  class: debt
  state: open (owner: coordinator)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-layout-interaction.md`
  summary: Follow-up review recommended (spec `followup_review_recommended: true`, independent review r8lay-rules-3): check on real Android Chrome and iPadOS WebKit tablets (Inter at the value size) that the ratio tables' wrap and the 1280 fit hold, that `.mt-scroll`'s cue and the scroll to Condição show, and that the held-Enter swallow of the plate Enter run works with soft keyboards (which may not mark `repeat`). Never run in this batch (desktop Chrome only).
  evidence: `ficha.css` r8lay TTR block; `ficha-fields.tsx` `focusNextMissingField`; R8LAY-E2E-001/009.
  class: debt
  state: ~~open (owner: coordinator, at the integrated QA pass)~~ re-owned (2026-10-14, E14-A2): owner Matheus's device run with the Epic 13 steps of `test-artifacts/manual/offline-proof-script.md` (E13-A3); no integrated QA pass ran it on a real tablet.
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-layout-interaction.md`
  summary: Narrowing 8 of PR #122: the spec's task "scope the E9-Q4 phone wrap off a confirmed reading's cell" was not done (it put the crop glyph on the input's line and pushed the contact tables past their 358 px box, 9.4-E2E-011); the input and its unit control still share their line, asserted by R8LAY-E2E-010 and the 8 px hit test of R8LAY-E2E-002 on the real phone tables. A wider confirmed value or a narrower table could still wrap the unit off the line.
  evidence: `apps/web/src/styles/app.css` (r8lay block, DB-2/DB-3 note); spec triage log (maybe-false row).
  class: debt
  state: open (owner: coordinator)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-photo-failures.md`, `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-layout-interaction.md`
  summary: R8CAP-E2E-003 scrolls once (`window.scrollTo(0, 300)`) and then polls `scrollY > 200` without scrolling again; when the sheet is not yet tall enough (`openChaveSheet` waits only for the title) the poll times out. Failed once under the load of PR #122's first gate; passed 3 of 3 alone on the branch and 3 of 3 on origin/main 9027abf. Retry the scroll inside the poll (independent review of PR #122, r8lay-tests-3).
  evidence: `e2e/review-photo-failures.spec.ts:165-166`; `e2e/support/photos.ts` `openChaveSheet`.
  class: debt
  state: ~~open (owner: coordinator)~~ resolved 2026-10-09 (PR #123, the final gate fix batch: the poll scrolls to 300 px again on every try)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-concluir-text.md` (r8conc second gate, 2026-10-09)
  summary: Process pitfall: the compose `api` service runs `tsx watch src/main.ts`, which does not reload a change under `packages/domain` (reached through the workspace link), so an e2e run after a kernel edit meets a server that still folds with the previous kernel; the web bundle is rebuilt by `scripts/e2e.ts` and is current. The r8conc gate met it: R8CONC-E2E-004 failed with the server cell merged `latest_text` while the device folded a `contradiction`. A batch that edits the fold (`ops/apply.ts`, `merge/`) restarts the api (`podman compose restart api`) before its e2e run; a gate step or a watch on `packages/domain` would settle it.
  evidence: `docker-compose.yml` api `command: pnpm --filter @app/api dev`; `apps/api/package.json` `"dev": "tsx watch src/main.ts"`; `/tmp/gate2-r8conc-e2e.log` (R8CONC-E2E-004 `expectConverged` diff).
  class: debt
  state: open (owner: coordinator)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-dry-transformer.md` (r8dry, Decision 2)
  summary: `conclusion.ts` `anyAnswered` counts any filled checklist result as an answer, so the oil items a dry TIPO DE ISOLAÇÃO marks NA count too: a no-subtype transformer whose only answers are those eight NA marks offers the amber conclusion pair as if the engineer had checked something. Whether a dry-insulation mark (or any NA) should count as an answer there is r8conc's file and call.
  evidence: `packages/domain/src/relatorio/conclusion.ts:66` (`anyAnswered`); `packages/domain/src/relatorio/dry-insulation.ts` `dryInsulationNaItems`; marks written by `apps/web/src/surfaces/ficha/{nameplate-section.tsx,nameplate-suggestions.tsx}`.
  class: debt
  state: ~~open (owner: coordinator)~~ resolved 2026-10-09 (Matheus's amendment of Decision 2): the NA marks are now written only by the engineer's own tap on the chip "Marcar N itens de óleo como NA" (`oilNaChipItems`), so they are an answer and `anyAnswered` counting them is right; `dryInsulationNaItems` no longer exists.
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-dry-transformer.md` (r8dry, open question 1)
  summary: Open question for Matheus and Bruno: should a copy chip ("Igual à ⟨TAG⟩?", "Copiar da última visita") that writes a dry TIPO DE ISOLAÇÃO also write the oil items' NA marks? Kept conservative: today only "Confirmar", "Substituir", "Confirmar todos", a value typed over the suggestion and the select picked by hand write them; the copy chips, the device auto-confirm sweep and another device's put do not. VOL. ÓLEO stops counting as missing whatever wrote the dry value.
  evidence: `apps/web/src/surfaces/ficha/nameplate-section.tsx` `copyFrom`, `copySame`; `apps/web/src/db/suggestion-store.ts` (auto-confirm); `packages/domain/src/relatorio/dry-insulation.ts` `nameplateMissingKeys`.
  class: question
  state: ~~open (owner: coordinator)~~ resolved 2026-10-09 (Matheus's amendment of Decision 2): no write path marks anything by itself; the chip follows the stored value, so a copy chip, the auto-confirm sweep or another device's put offer the same chip as a confirm (R8DRY-E2E-004).
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-dry-transformer.md` (r8dry, amendment 2026-10-09; independent review of PR #120 r8dry-decision-1)
  summary: Seed v1 offers TIPO DE ISOLAÇÃO only EPÓXI and Á SECO and the field is required, so an oil-filled unit must pick a dry value (and is then offered the oil NA chip and loses VOL. ÓLEO as a required field). An oil option waits for a new seed version.
  evidence: `packages/domain/src/seed/v1.ts:42`; source-deltas row "Story 3.5 and FR-11", amended 2026-10-09; spec frontmatter `deferred`.
  class: debt
  state: open (owner: Matheus and Bruno)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-dry-transformer.md` (r8dry, amendment 2026-10-09; independent review r8dry-decision-3)
  summary: Clearing or changing TIPO DE ISOLAÇÃO after the chip wrote the NA marks keeps those marks (the chip goes away and VOL. ÓLEO counts again). Whether clearing should offer to unmark them is an open question for Matheus.
  evidence: `packages/domain/src/relatorio/dry-insulation.ts` `oilNaChipItems`, `nameplateMissingKeys`; `apps/web/src/surfaces/ficha/nameplate-section.tsx` `markOilItemsNa`; spec frontmatter `deferred`.
  class: question
  state: open (owner: Matheus)
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-2026-10-08-concluir-text.md` (focused review of 794757a, contract 16)
  summary: Deploy: PR #121 raises `CONTRACT_VERSION` and `MIN_CONTRACT_VERSION` to 16 (the conclusion text merge rule), so every tablet on a version-15 bundle gets 426 on its next pull and must update before it syncs again (G2-1, G2-5). Deploy the MIN 16 release as a release train in an evening window, with the field asked to sync first.
  evidence: `packages/domain/src/contract/version.ts` (16 paragraphs); `review-fixes-2026-10-08-context.md` (struck "No MIN raise" sentence); `source-deltas.md` row "FR-58 and Story 10.1".
  class: debt
  state: open (owner: Matheus)
- source_spec: `_bmad-output/implementation-artifacts/review-fixes-2026-10-08-context.md` (final gate fix batch, PR #123)
  summary: `apps/web/src/components/quantity-stepper.test.tsx` "commits a typed number on blur or Enter, clamped to 99; anything else restores with no commit" is flaky: typing "150" after `userEvent.clear` sometimes loses the first keystroke ("50" stays, and the `waitFor` gives up at about 1.1 s). It failed once in #123's round-2 `test:unit` and 2 of 5 runs alone on main 375c2d6; the full suite passed on the re-run. Neither the component nor anything it imports changed since #99, so it predates the 2026-10-08 round.
  evidence: `quantity-stepper.test.tsx:119-122`; PR #123 body (round 2 and the five runs alone).
  class: debt
  state: ~~open (owner: the next carry-over batch)~~ closed (2026-10-14, batch co14a): a product race, not the test: `onFocus` deferred `input.select()` to the next frame, and typing that landed first was selected and replaced by the next keystroke; the pending frame is now kept in a ref and cancelled on any change of the text and on unmount (`quantity-stepper.tsx`), with a test that queues the frames by hand (mutation run: red with the cancel reverted).
- source_spec: `_bmad-output/implementation-artifacts/review-fixes-2026-10-08-context.md` (closing PR of the round, review of PR #124)
  summary: Wording review of the pt-BR copy the round's PRs marked `// authored:` (no mock shows it). #118: `copy.account.screenHeading` "Tela", `keepScreenOnLabel` "Manter a tela ligada", the kernel's `keepScreenOnSubText()` ("Enquanto uma ficha, a câmera ou uma leitura estiver aberta. Depois de 10 minutos sem toque a tela volta a apagar sozinha."), `cameraSavingText` ("Salvando a foto…", "Salvando as fotos…"), `copy.readingWait.empty` "Nada foi lido nesta foto", `ui.suggestionField.keepTyped` "Manter o digitado". #119: `copy.export.deadOpsPreviewReason`, `copy.audit.deadOpsReason`, `precheckCountMetaText(1)`, `outrasCondicoesLabel(1)` and the DF-6 parts ("o CNPJ do contratante em branco", "o CNPJ da contratada em branco", "os CNPJs do contratante e da contratada em branco", "o logo da empresa não cadastrado"). #120: `oilNaChipText` ("Marcar N itens de óleo como NA"), `oilItemsNaText` ("N itens de óleo marcados NA") and the chip's place under TIPO DE ISOLAÇÃO. #121: `conclusionStaleText` (its own row above) and the Conflict view's `CONCLUSION_WORDS` ("Confirmado", "Editado"). #122 added none.
  evidence: the "New pt-BR copy" sections of the PR bodies of #118, #119, #120 and #121; `apps/web/src/copy/pt-br.ts`, `apps/web/src/copy/ui.ts` and the kernel modules named.
  class: docs
  state: open (owner: Bruno)

- source_spec: `_bmad-output/implementation-artifacts/spec-status-flow-2026-10-10.md`
  summary: A generate answered `running` (a retry after a lost response) writes no `generate` status op, so the relatório stays Em campo or Rascunho with a revision on record and "Marcar como enviado ao cliente" is not offered until another generate.
  evidence: `apps/web/src/surfaces/export/use-generate.ts:243` emits `emitStatus('generate')` for `outcome === 'queued'` only, and the line predates the status flow of 2026-10-10 (edge-case review of that story, finding EC4, medium, unverified in a run). Settle by emitting for `running` too (the table makes it a no-op once Em revisão) with a test that answers `running` on an Em campo relatório. *(2026-10-13: the call now reads `emitStatus('queued')` and asks the kernel's `advanceOnGenerate`; a `running` answer still writes no status op.)*
  class: bug
  state: open

- source_spec: `_bmad-output/implementation-artifacts/spec-status-flow-2026-10-10.md`
  summary: `points.spec.ts` 6.6-E2E-011 fails 20 to 80 percent of the time run alone because `Escape` pressed right after "Cancelar" in the remove-photo confirm can land on `BODY`, before React Aria hands the focus back to the photo viewer, so the viewer stays open; the ledger's earlier row calls this test load-sensitive, which is not the cause.
  evidence: Event log of 2026-10-10 inside the test: "Cancelar" at 334 ms, focus on `BODY` at 339 ms, `Escape` at 342 ms on `BODY`, focus back on the viewer's "Remover" at 347 ms; passing runs have the focus back before the key. Same failure (`.dialog-scrim.scrim-viewer intercepts pointer events` on "Foto 2, abrir") with every tracked file of the status-flow story reverted to `80f3d08`: 8, 3 and 5 failures of 10 in three runs, against 2 and 4 of 10 on the story's tree. Settle in the product (the viewer closes on `Escape` while it is the top dialog, wherever the focus is during the hand-back) or, if a key pressed in that gap is judged not a user case, wait for the focus in the test.
  class: bug
  state: ~~open~~ closed (2026-10-14, batch co14a): a test defect, as the event log shows: the key now waits for the focus back inside the viewer through the shared `escapeDialog` (`e2e/support/dialogs.ts`, the E9-Q13 body, which the four specs that copied it now import), and the test asserts the confirm and then the viewer closed. Making `Escape` on `BODY` close the top dialog stays an open question, not built.

## Deferred from: Story 14.2, Local › Painel › Coluna (2026-10-13)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-2-local-painel-coluna.md`
  summary: O1. No location can be removed in the relatório tree, so the painel's "Remover … recuperável até a emissão" of the approved mock (`40-relatorio-overview.html`) is not built: a painel is removed only as the "Desfazer" of its own create, and at the fold level. A coluna and a local have no removal there either. Decide whether location removal (with its restore list) enters the tree, and for which kinds.
  evidence: `apps/web/src/surfaces/relatorio/relatorio-tree.tsx` `locationMenu` (no destructive group); the ledger entry on `block/{id}/location_id`; spec Design notes O1.
  class: question
  state: ~~open (owner: Matheus)~~ closed 2026-10-13: Matheus decided in the review of PR #126 that removal and restore of a coluna, a painel and a local are built in Story 14.2 (`epics.md` Story 14.2, criteria block of 2026-10-13). Built in the story's second pass: "Remover" in the Sumário tree's Overflow of the three kinds (none in the rail), one batch of explicit tombstones planned by `locationRemovalPlan`, the restore entries of `restorableEntries` in "Restaurar ficha removida"; spec section "Second pass, 2026-10-13"; `e2e/local-painel-coluna.spec.ts` 14.2-E2E-004.

- source_spec: `_bmad-output/implementation-artifacts/spec-14-2-local-painel-coluna.md`
  summary: O2. The mock's location Overflow items "Mover para outro local" (a painel or coluna moved to another parent), "Duplicar" and "Adicionar abaixo" are not built on either surface; a location moves only among the siblings of its own parent and kind (`moveNode`, `moveLocation`).
  evidence: `packages/domain/src/templates/compose.ts` `moveNode`; `apps/web/src/surfaces/relatorio/tree-actions.ts` `moveLocation`; spec Never list and O2.
  class: question
  state: open (owner: Matheus)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-2-local-painel-coluna.md`
  summary: O3. Inside a painel with `agrupar_por_tipo` on, the type-group titles keep the FO.SERV-03 words with the local's name as numbered subsections ("9.2 Seccionadoras dos Cubículos de MT da ⟨local⟩") under the unnumbered painel band, which is not in the ÍNDICE; the approved print mock draws unnumbered group headings under one numbered local heading. Story 14.4 checks the print against that mock and settles the titles.
  evidence: `packages/domain/src/print/group-for-print.ts` `byTypeRuns`; `packages/domain/src/print/section-9.ts`; `apps/api/src/jobs/generate/docx.test.ts` "flag on".
  class: question
  state: open (owner: Story 14.4)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-2-local-painel-coluna.md`
  summary: O4. Announcement and toast wording for the three levels is authored: noun-led sentences with agreement ("Local Geradores movido para a posição 4 de 6", "Painel 2 adicionado", "Coluna 5 movida"), a local whose name leads with "Cabine" read by its name alone in the feminine ("Cabine de transformação adicionada", "Cabine primária atualizada"), and "⟨local⟩ atualizado" after "Função e nome". The mock's toasts carry hints and bare names. Also authored and to review: the dialog's "Escolha a função", "Informe a função", the list names "Equipamentos direto em ⟨local⟩" and "Painéis de ⟨local⟩", and the pre-issue row "Local ⟨nome⟩ sem equipamento".
  evidence: `packages/domain/src/templates/text.ts` `itemPhrase`, `said`, `localUpdatedText`; `apps/web/src/copy/pt-br.ts` `localDialog`, `sumario.tree`; `packages/domain/src/relatorio/pre-issue.ts` `cabineSemEquipamentoText`.
  class: docs
  state: open (owner: Bruno's copy review)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-2-local-painel-coluna.md`
  summary: O5. A local that already holds colunas directly (every tree and template from before the painel level) keeps the "current coluna" palette target and its "Adicionar bloco em ⟨local⟩" button, and keeps offering "Adicionar coluna" on both surfaces; only a local with no direct coluna shows "Adicionar equipamento no local". Decide whether such a local should also take equipment directly, or be converted (its colunas moved under a painel).
  evidence: `packages/domain/src/relatorio/tree.ts` `paletteLocationFor`; `apps/web/src/surfaces/relatorio/relatorio-tree.tsx` `locationMenu`; `apps/web/src/surfaces/templates/skeleton-list.tsx` `LocalCard`.
  class: question
  state: open (owner: Matheus)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-2-local-painel-coluna.md`
  summary: Narrowed: the rail's local row reads "Local · ⟨Função⟩ · N painéis · N fichas" as the approved rail mock (`shell-foot.html`) draws it, and no longer shows the cabine data line; DESIGN.md still says "Both: Cabine rows show meta …" for the rail and the Sumário. The spec was followed; DESIGN.md needs the sentence struck and dated, or the rail needs the data line back.
  evidence: `packages/domain/src/relatorio/tree.ts` `locationMetaTexts` (`railMeta`); `DESIGN.md` "Both: Cabine rows show meta"; `e2e/tree.spec.ts` 5.2-E2E-004.
  class: docs
  state: open (owner: Matheus)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-2-local-painel-coluna.md`
  summary: Narrowed, tree texts with no mock: (a) the Sumário's local data line ends with "sem painéis" only when nothing hangs under the local, and a local with direct colunas counts them in the rail ("N colunas"); (b) the rail's coluna row keeps its progress counter ("Coluna · 1 de 3" when the name does not say Coluna) where the mock writes "N fichas"; (c) a painel with no coluna reads "Painel · sem colunas" and shows the composer's empty-painel note in the tree.
  evidence: `packages/domain/src/relatorio/tree.ts` `locationMetaTexts`; `packages/domain/src/relatorio/tree-painel.test.ts`.
  class: docs
  state: open (owner: Bruno's copy review)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-2-local-painel-coluna.md`
  summary: Narrowed, where EXPERIENCE.md won over the mock: the Template composer keeps the "Agrupar por tipo" Toggle on the local card beside the mock's sub-line ("Função: primária · Agrupar por tipo: ativado"), local and painel cards open by default, and the relatório tree's location rows carry a drag handle and a Position box ("drag, Position box, Overflow menu, or Alt+arrows" at every level), hidden below 768 px. The mock draws none of the three; confirm or redraw.
  evidence: `apps/web/src/surfaces/templates/skeleton-list.tsx` `LocalCard`; `apps/web/src/surfaces/relatorio/relatorio-tree.tsx` `reorderControls`; `apps/web/src/styles/app.css` (tree rows).
  class: question
  state: open (owner: Matheus)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-2-local-painel-coluna.md`
  summary: Not touched: a photo's caption and the gallery name where a photo was taken as coluna plus local, without the painel's name, while the sheet header names the whole path ("⟨local⟩ › ⟨painel⟩ › ⟨coluna⟩"). Decide whether the painel enters the photo's place text.
  evidence: `packages/domain/src/photos/` (the place part of a caption); `packages/domain/src/relatorio/location-path.ts` `locationPathText`.
  class: question
  state: open (owner: Matheus)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-2-local-painel-coluna.md`
  summary: Deploy: Story 14.2 raises `CONTRACT_VERSION` and `MIN_CONTRACT_VERSION` to 17 (the `painel` kind and `location/{id}/funcao`), so every device on a version-16 bundle gets 426 on its next pull and must update before it syncs again. Ship it as the earlier MIN raises were: an evening window, the field asked to sync first.
  evidence: `packages/domain/src/contract/version.ts` (paragraph 17); `apps/api/src/sync/sync.integration.test.ts` (contract-17 pull test).
  class: debt
  state: open (owner: Matheus)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-2-local-painel-coluna.md`
  summary: `e2e/local-painel-coluna.spec.ts` 14.2-E2E-001 seeds the content of the two sheets it concludes (plate, checklist, readings, the conclusion pair) and the local's own fields by office ops, as 5.1-E2E-003 does, and concludes each by the tap; typing a whole transformer sheet through the UI is covered by the ficha specs, not repeated there.
  evidence: `e2e/local-painel-coluna.spec.ts` `completeSheet`, `concludeSheet`.
  class: debt
  state: ~~open (owner: the epic QA)~~ closed (2026-10-14, E14-A2): accepted as the test's design. Typing a whole sheet through the UI is the ficha specs' job, and the Epic 14 QA (`epic-14-qa-2026-10-13.md` section 3) walked 14.2 in the browser and raised nothing on it.

- source_spec: `_bmad-output/implementation-artifacts/spec-14-2-local-painel-coluna.md`
  summary: Coordinator review 2026-10-13 (a). The painel refusal can be bypassed by op order, and the reducer never checks what a painel hangs under. `applyOp` refuses a block create or a `block/{id}/location_id` put naming a painel only when the painel row is already in state (a location not in state is not checked, for replay safety), so a block op applied before its painel's create is accepted and the block stays on the painel; the tree draws it under the painel and `templateFromRelatorio` and `instantiateTemplate` skip it. And a `location/{id}` create of kind `painel` is stored whatever its `parent_id` names: the row schema asks only for a non-null parent, so a painel under a coluna or under another painel is accepted by both layers (no client writes one; the kernel tree draws it under that parent). Decide whether the server refuses a block op whose location it does not hold, and whether the fold checks the parent's kind once the parent is in state.
  evidence: `packages/domain/src/ops/apply.ts` (`carriedLocationId`, `targetsOf`, the `LocationKindError` checks; no parent-kind check in the location create); `packages/domain/src/schemas/entities.ts` `locationRowSchema`; `packages/domain/src/ops/apply.test.ts` "a location not in state is not checked, as before"; spec triage log, the `ops/apply.ts` finding (marked real on 2026-10-13).
  class: question
  state: open (owner: Matheus; the architect for the fold rule)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-2-local-painel-coluna.md`
  summary: Coordinator review 2026-10-13 (b). Since Story 14.2 `targetsOf` also names the location a block create or a `location_id` put points at, so the device's `targets` index (`outbox.targets`, `remote_ops.targets`) holds that location key for ops written by a contract-17 bundle and not for the block ops an earlier bundle stored: the index is mixed across bundles. Traced consequences: a pulled block create re-materializes its location (extra work, the same row), and `rematerialize` reads block ops for a location key and ignores them; no wrong row was found. The risk is a later reader that takes "every op whose targets hold this location key" to mean "every op on this location". A read-only ref list kept apart from the write targets would remove it, at the cost of a new public kernel surface.
  evidence: `packages/domain/src/ops/apply.ts` `targetsOf`; `apps/web/src/db/commit.ts` (`targets` of an outbox row); `apps/web/src/db/sync-store.ts` `rematerialize`; `apps/web/src/db/decision-store.ts` `createFacts` (reads equipment keys only today).
  class: debt
  state: open (owner: the architect)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-2-local-painel-coluna.md`
  summary: Coordinator review 2026-10-13 (c). The panel reading accepts a painel as its target: `panelHandler.prepare` checks that the photo's `reading_target.location_id` names a live location of the photo's relatório and never its kind, so a panel photo whose target is a painel is read and a suggestion is stored, although a painel takes no block and the kernel's `panelLocation` returns null for it (the device then has nowhere to propose the block). No client writes such a target (the palette never opens on a painel); only a non-conforming one can. Refuse it as a permanent reading error, with a test beside the existing target checks.
  evidence: `apps/api/src/jobs/reading/kinds/panel.ts:23-27` (`prepare`); `packages/domain/src/relatorio/panel.ts` `panelLocation` (null for a painel).
  class: bug
  state: ~~open (owner: the next story touching `apps/api/src/jobs/reading`, else the epic 14 deferred sweep)~~ closed (2026-10-14, batch co14a): `prepare` refuses a target the kernel says takes no block (`takesBlocks`) with `PermanentReadingError` "the target location takes no block"; `job.integration.test.ts` covers a live painel (run failed, photo failed, no suggestion).

- source_spec: `_bmad-output/implementation-artifacts/spec-14-2-local-painel-coluna.md`
  summary: Coordinator review 2026-10-13 (d). The Porto Seguro fixture's op log maps every skeleton node that is not a cabine to `kind: 'coluna'` (`locationRow`), which is right only while the standard template holds no painel: a painel added to that template would be written as a coluna, silently, and the goldens would be regenerated from a wrong tree. Make the mapping exhaustive over the three kinds (or throw on a painel) before the standard template ever gains one.
  evidence: `packages/domain/fixtures/porto-seguro/op-log.ts:260-264` (`locationRow`, "The standard template holds cabines and colunas only").
  class: debt
  state: open (owner: whoever first changes the standard template's skeleton; Story 14.5 if it does)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-2-local-painel-coluna.md`
  summary: Coordinator review 2026-10-13 (e). Below 768 px the relatório tree's location rows hide the drag handle and the Position box (`display: none`), so a local, a painel or a coluna reorders there by the Overflow's "Subir" and "Descer" or by Alt+arrows only; EXPERIENCE.md says "drag, Position box, Overflow menu, or Alt+arrows" at every level and names no breakpoint. Decide whether phones keep the two ways (the row has no room for both controls beside the name and the counter), or the row is redrawn to carry them.
  evidence: `apps/web/src/styles/app.css:263-265` (the three location rows, under the phone media query); `apps/web/src/surfaces/relatorio/relatorio-tree.tsx` `reorderControls`; the ledger entry above on where EXPERIENCE.md won over the mock ("hidden below 768 px").
  class: question
  state: open (owner: Matheus's decision)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-2-local-painel-coluna.md`
  summary: Coordinator review 2026-10-13 (f). Section 9 with *Agrupar por tipo* on and painéis: (1) with two painéis of one local the type groups of each painel carry the same title (the FO.SERV-03 words with the local's name, as O3 records), so the ÍNDICE lists identical type-group titles twice, told apart only by their numbers, the painel band between them not being in the ÍNDICE; (2) with the flag on and an empty direct run (no block on the local itself nor in a coluna directly under it) the local emits no heading of its own: its first heading is the first painel's first type group, whereas with the flag off the `cabine` subsection is emitted even when its run is empty. Check both against the approved print mock and settle them with O3.
  evidence: `packages/domain/src/print/group-for-print.ts` `byTypeRuns` (the painel heading subsection and its type groups; the direct run split by type first) and `baseSubsections`; `packages/domain/src/print/section-9.ts` `section9Layout`; `apps/api/src/jobs/generate/toc.ts`; spec I/O matrix rows "Print, flag off" and "Print, `por_local_e_tipo` and flag on".
  class: question
  state: open (owner: Story 14.4, checked against the print mock)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-2-local-painel-coluna.md`
  summary: Second pass 2026-10-13 (g). The ancestor-liveness rule lives in the snapshot; readers of raw rows do not apply it. A sheet another device left live under a removed location (created there or moved in before it pulled the removal) is hidden from every snapshot reader but is still counted or held by: the api's pull summary totals, the Home card's on-device counter, the obra's "n de N fichas", the TAG checks (its TAG stays taken, or reads as a duplicate with no visible holder, and its equipment is never freed) and the panel reading's target check. Nothing is wrong while every sheet under a removed location carries its own tombstone, which is what a removal writes; the gap is only the concurrent case. Either filter those readers by `hiddenLocationIds`, or surface the hidden sheet as a decision (see (h)).
  evidence: `apps/api/src/sync/pull.ts` `relatorioTotals` (SQL by the row's own `removed_at`); `packages/domain/src/home/cards.ts:223`; `apps/web/src/surfaces/project/project-surface.tsx:56`; `packages/domain/src/relatorio/tag.ts:71` and `tree.ts` (`equipmentSharedElsewhere`, the duplicate set); `apps/api/src/jobs/reading/kinds/panel.ts:26`. Edge Case Hunter finding 7 and Verification Gap finding 2 of the second pass. *(2026-10-14, Epic 14 QA Q-10, source `_bmad-output/implementation-artifacts/spec-epic-14-qa-fixes.md`: three more raw-row readers see such a sheet in the concurrent case: the Conflict view's decisions (`packages/domain/src/merge/conflicts.ts:367`, `:376`, fed by `apps/web/src/db/decision-store.ts:96-118`), Sync status "Leituras" (`apps/web/src/db/suggestion-store.ts:245`) and "Repetir da ficha anterior" (`apps/web/src/surfaces/ficha/checklist-section.tsx:136`); the same fix applies: read them through the snapshot or `hiddenLocationIds`.)*
  class: debt
  state: open (owner: the architect; Story 14.3 touches the same counters for the site checklist)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-2-local-painel-coluna.md`
  summary: Second pass 2026-10-13 (h). A sheet created in, or moved into, a location by an offline device, when another device removed that location and the relatório was issued before the first one synced, is stranded: the sheet is live (no tombstone, no removed-versus-edited mark, since the fold marks only an edit on a removed block), hidden by the ancestor rule, and its location is no longer offered in "Restaurar ficha removida" because the removal is older than the newest revision. Without an emission in between the location's entry brings it back, but the device that wrote the sheet gets no sign that it is hidden. Decide: keep a removed location in the list past the cut while a live row sits under it, or raise a decision for the hidden sheet (a new mark in the fold, so a contract bump).
  evidence: `packages/domain/src/schemas/snapshot.ts` (the block filter); `packages/domain/src/relatorio/sumario.ts` `restorableEntries` (the `since` cut); `packages/domain/src/ops/apply.ts` `attributed`. Edge Case Hunter finding 1 of the second pass (it also corrects the spec's rule 6, see the triage log).
  class: question
  state: ~~open (owner: Matheus)~~ closed (2026-10-14, Epic 14 QA fix batch, `_bmad-output/implementation-artifacts/spec-epic-14-qa-fixes.md`, recommendation R-2 of `epic-14-qa-2026-10-13.md`: every live sheet whose location is hidden is its own entry of "Restaurar ficha removida" whatever the cut (`strandedSheetRows`, detail "⟨lugar⟩ · restaura ⟨locais⟩"), and its restore puts back only its removed ancestors (`removedAncestorIds`, `restoreStrandedSheetOps`); the sheets the removal tombstoned stay removed. Kernel: `removal-readers.test.ts` (ledger (h)); e2e: `local-painel-coluna.spec.ts` 14.2-E2E-006. No new mark in the fold, no contract bump. The site work of such a local, Q-8 below, stays open)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-2-local-painel-coluna.md`
  summary: Second pass 2026-10-13 (i). The cut of "Restaurar ficha removida" compares a row's `removed_at` (the removing device's clock, `client_ts`) with the newest revision's `created_at` (the server's clock). A removal made offline before an emission and synced after it, or made on a device whose clock runs slow, falls before the cut although the issued document still holds the rows, and is never offered. The rule is the sheets' own since Epic 4 (retro item 29); location removal makes a miss cost a whole painel or local.
  evidence: `packages/domain/src/relatorio/sumario.ts` (`removed_at > since` for blocks and for locations); `apps/web/src/surfaces/relatorio/sumario-surface.tsx` (`latestRevision(revisions)?.created_at`). Edge Case Hunter finding 2 of the second pass. A cut by log position (the remove op's `seq` against the revision's snapshot `seq`) would not depend on clocks.
  class: debt
  state: open (owner: the architect)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-2-local-painel-coluna.md`
  summary: Second pass 2026-10-13 (j). Two fold behaviours a location removal now sweeps many sheets through, both older than this story and both reducer changes (a contract bump) to alter. (1) A `remove` of a row that is already removed re-stamps its `removed_at`: a device that removes a coluna it has not yet seen removed with its painel moves the coluna and its sheets to its own timestamp, so the painel's restore leaves them out; they are then offered on their own once the painel is back, so nothing is lost, but the painel's entry counted them. (2) A `block/{id}/removed_at` remove that lands on a block already removed and holding an undecided removed-versus-edited mark drops the mark (`writeRemovedAt`): an offline device removing the local above sends such a remove for every sheet it still saw live, and the pending decision disappears with nobody choosing.
  evidence: `packages/domain/src/ops/apply.ts` `writeRow` (the default branch writes `client_ts` whatever the row held) and `writeRemovedAt` (`block.removed_at !== null` returns the plain removal); `apps/api/src/sync/marks.ts` (guards only a mark-blind client). Edge Case Hunter findings 3 and 4 of the second pass.
  class: question
  state: open (owner: the architect, then Matheus if the fold changes)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-2-local-painel-coluna.md`
  summary: Second pass 2026-10-13 (k). Three product choices left as built. (1) The "Desfazer" of "Adicionar coluna", "Adicionar painel" or "Adicionar local" writes a removal, so the undone, empty location is offered in "Restaurar ficha removida" until the next emission, as an undone "Adicionar bloco" already is for a sheet. (2) A location with no sheet is removed with no confirmation (the criterion's rule); a sheet that reaches it between the press and the commit leaves with it, recoverable by the toast's "Desfazer" or the restore entry. (3) The photos and points of a sheet removed with its location follow the sheet exactly as they do for a sheet removed alone; the removal writes no tombstone of its own for them.
  evidence: `packages/domain/src/ops/outbox.ts` `invertBatch` (a create is undone by a remove); `apps/web/src/surfaces/relatorio/relatorio-tree.tsx` (the confirm rule); `packages/domain/src/relatorio/removal.ts` `locationRemovalPlan`. Edge Case Hunter finding 10 of the second pass.
  class: question
  state: open (owner: Matheus; Bruno for whether an empty undone location should be listed)

## Deferred from: Stories 14.3 and 14.4, Verificações do local (2026-10-13)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-3-14-4-verificacoes-do-local.md`
  summary: O1. "Concluir verificações" stores nothing: the site checklist has no "concluded" state, it is complete when its 19 items are answered. The button names what is missing (a toast, as the mock draws it) and focuses the first unanswered row, or returns to the tree when nothing is missing. Decide whether a local's checklist should hold a concluded mark of its own (who, when), as a sheet does.
  evidence: `apps/web/src/surfaces/local/verificacoes-surface.tsx` `conclude`; `packages/domain/src/relatorio/site-checklist.ts` (`siteMissingText`, `siteFirstUnanswered`); spec Design Notes O1.
  class: question
  state: open (owner: Matheus)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-3-14-4-verificacoes-do-local.md`
  summary: O2. A C or NC against NA contradiction on a site item (two devices, concurrent) keeps the `seq`-later value and marks the cell `conflict`, as a sheet cell does, but it is not a decision in the Conflict view and no banner counts it: the mark is invisible on "Verificações do local". Decide whether site cells enter the Conflict view (block-scoped today) or are resolved on the surface itself.
  evidence: `packages/domain/src/merge/policy.ts` (the `location/checklist` branches); `packages/domain/src/merge/conflicts.ts` (block-scoped decisions, not extended); `packages/domain/src/ops/site-checklist.test.ts`; spec matrix row "Two devices, same item" and O2.
  class: question
  state: open (owner: Matheus)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-3-14-4-verificacoes-do-local.md`
  summary: O3. NC site items are not in `Progress.nc_open` nor in the Sumário's "NC abertos" list, and a local's progress counter on its tree row stays sheets-only ("3 de 9"): the site answers show only on the row's own line ("Verificações do local · 12 de 19"), on the rail row and in the one pre-issue row. `Progress` was left as it is because the Porto Seguro goldens capture it. Decide whether site NCs count as open NCs and whether the local's counter should include its checklist.
  evidence: `packages/domain/src/relatorio/progress.ts` (`Progress`, unchanged); `packages/domain/src/relatorio/tree.ts` (`TreeLocationNode.site` beside `counterText`); spec task 2 and O3.
  class: question
  state: open (owner: Matheus)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-3-14-4-verificacoes-do-local.md`
  summary: O4. No photo-read NC draft on a site item: a site item's photo is created with no reading (`reading_kind` null), so an NC site row never shows "Rascunho pela foto" above its observation, as an NC sheet row does (Story 9.5).
  evidence: `apps/web/src/surfaces/local/verificacoes-surface.tsx` (`photoTarget` with `reading: null`, `siteRowTarget.ncDraft: null`); `packages/domain/src/reading/` (`ncObsReadingOf` is block-scoped); spec Never list and O4.
  class: question
  state: open (owner: Matheus)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-3-14-4-verificacoes-do-local.md`
  summary: O5. Authored pt-BR copy for Bruno to review before the first real job (none blocks a merge): the NC phrases of the 19 site items and of NO-BREAK DE COMANDO (`docs/nc-chip-phrases.md`); the pre-issue row "Verificações do local sem resposta: ⟨local⟩ (N itens) e …"; the issued banner "Relatório emitido (revisão N). Editar estas verificações reabre o relatório como Em revisão e gera a revisão N+1."; the Rascunho status-step sentences "… preencher uma ficha ou as verificações do local …"; the singular of the missing sentence "1 item sem resposta — é o item N, ⟨item⟩"; the point title "⟨local⟩ · Verificações do local"; the merge-info line "Verificações do local · Item N" with the local's name; the site photo caption "Verificação de ⟨item⟩ d⟨o/a⟩ ⟨local⟩"; the painel type-group title "⟨grupo⟩ d⟨o⟩ ⟨painel⟩ — ⟨local⟩"; and on the web the not-found sentence "Verificações do local não encontradas neste relatório." and the entry's accessible name "Verificações do local · N de 19 — ⟨local⟩" (the tree) and "Verificações do local — ⟨local⟩" (the rail).
  evidence: `packages/domain/src/seed/v4.ts`; `packages/domain/src/relatorio/site-checklist.ts`; `packages/domain/src/relatorio/sumario.ts` `statusStepText`; `packages/domain/src/merge/info.ts`; `packages/domain/src/photos/caption.ts` `siteCaption`; `packages/domain/src/print/group-for-print.ts`; `apps/web/src/copy/pt-br.ts` `local`; spec O5.
  class: question
  state: open (owner: Bruno)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-3-14-4-verificacoes-do-local.md`
  summary: O6. The print mock (`key-print-section-9.html`) draws unnumbered group headings under one numbered local heading (Story 14.2's O3); as built, a type group stays a numbered subsection, and only the painel wording of its title was added. The group heading form stays with Bruno.
  evidence: `packages/domain/src/print/group-for-print.ts`; `apps/api/src/jobs/generate/docx-site-checklist.test.ts` ("por_local_e_tipo, flag on"); the Story 14.2 entry O3 above; spec O6.
  class: question
  state: open (owner: Bruno)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-3-14-4-verificacoes-do-local.md`
  summary: Narrowing: the capture surface is one column with no relatório rail beside it, although mock 61 is drawn inside the shell with the rail (`data-rail="true"`). The spec's task lists the header, the intro, the groups and the Sticky action bar; the rail's "Verificações do local" row is built in the tree's rail presentation (the tree surface and a sheet's rail) and is not marked as the current row anywhere. Back goes to the tree surface on a phone and to the Sumário with section 9 open from 768 px.
  evidence: `apps/web/src/surfaces/local/verificacoes-surface.tsx`; `apps/web/src/surfaces/relatorio/relatorio-tree.tsx` `RailLocation` (`li[data-site-of]`); `apps/web/src/app.tsx` (the route's `back` and `backWide`); mock `61-verificacoes-local.html:37`.
  class: question
  state: ~~open (owner: Matheus, at the epic 14 integrated review)~~ re-owned (2026-10-14, E14-A2): owner Matheus, product decision on the rail beside the Verificações surface; the integrated review ran (`epic-14-qa-2026-10-13.md`) without raising it, so it joins the open Epic 14 decisions of E14-A9.

- source_spec: `_bmad-output/implementation-artifacts/spec-14-3-14-4-verificacoes-do-local.md`
  summary: Narrowing: an NC site row is the sheet checklist's row, by the spec's reuse rule, so three things of mock 61 are not drawn: the photo tile inside the NC expansion (`.vl-photo-row`; the item's photos are the Photo tile rows under the row, as on a sheet), the count in the photo reason ("1 foto · recomendada para não conforme"; the reason stays "Recomendada para não conforme") and the "Outro…" chip that opens the full list of observations. The bulk bar's reason line "7 itens marcados — toque de novo para desfazer" is the prototype's toggle: the app raises the toast with "Desfazer", as the spec's matrix says.
  evidence: `apps/web/src/surfaces/ficha/checklist-section.tsx` `ChecklistRow`; `apps/web/src/surfaces/local/verificacoes.css` (header comment, what is left out); mock `61-verificacoes-local.html:54,81`.
  class: question
  state: open (owner: Bruno, on the first real job)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-3-14-4-verificacoes-do-local.md`
  summary: Narrowing: beside a denied camera a site row's "Adicionar fotos" opens the system file picker and saves the files on that item at once (the local, the item and the kernel's caption), with no Photo capture sheet and no "De qual equipamento?" step, which are block-scoped. The gallery's batch assignment likewise knows blocks only: a site photo given a sheet there keeps its `location_id` and is read as its block's (the kernel's rule).
  evidence: `apps/web/src/surfaces/local/verificacoes-surface.tsx` (`useDirectPicker`, `importFiles`); `apps/web/src/surfaces/photos/capture-sheet.tsx` (`mode.kind === 'sheet'`, `preselectBlockId`); `apps/web/src/surfaces/photos/photo-ops.ts` `assignPhotoBatch`.
  class: debt
  state: open (owner: the next story touching the Photo capture sheet)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-3-14-4-verificacoes-do-local.md`
  summary: Narrowing: the Caption composer cannot compose a site photo's caption from its three chip rows (the caption is its own sentence, "Verificação de ⟨item⟩ d⟨o/a⟩ ⟨local⟩", not the "Detalhe d… realizad… n…" grammar). A site photo therefore opens the composer in "Editar texto" on its stored caption, or on the kernel's caption for it when none is stored; turning "Editar texto" off composes from the chips alone.
  evidence: `apps/web/src/surfaces/photos/caption-composer.tsx` (`prefillText`); `apps/web/src/surfaces/photos/photo-caption-dialog.tsx`; `packages/domain/src/photos/caption.ts` (`siteCaption`, `contextCaptionParts` unchanged).
  class: question
  state: open (owner: Bruno, with the caption copy of O5)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-3-14-4-verificacoes-do-local.md`
  summary: Narrowing: "Verificações do local" has no read-only state. The spec says "read-only exactly as the sheet", and the sheet's only read-only state is "não ensaiado", which a local does not have; no relatório status makes a sheet read-only either. The issued banner is built as the sheet's.
  evidence: `apps/web/src/surfaces/local/verificacoes-surface.tsx` (`readOnly={false}`); `apps/web/src/surfaces/ficha/sheet-read-only.tsx`.
  class: question
  state: open (owner: Matheus)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-3-14-4-verificacoes-do-local.md`
  summary: Accepted (spec Design Notes): a relatório created offline from a template row the device has not pulled since the server moved it to seed v4 is born on the old version and has no site checklist, for good (no relatório's `seed_version` is rewritten). The office can only recreate it once the device has synced.
  evidence: `apps/api/src/db/template-seed-upgrade.ts`; `packages/domain/src/relatorio/instantiate.ts` (a relatório takes its template's version).
  class: question
  state: open (owner: Matheus; revisit if a real job hits it)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-3-14-4-verificacoes-do-local.md`
  summary: The mock's `.s9-verif` line is 44 px tall; the app draws it 48 px (`--touch-min`) because DESIGN.md's touch target wins over a mock and ERGO-E2E-001 measures every control on the Sumário; "Editar" on the observation line keeps the mock's zero padding and is given a 48 px minimum width for the same reason. Fold both into the mocks at the next mock pass.
  evidence: `apps/web/src/surfaces/relatorio/relatorio.css` (`.s9-verif`, authored override); `apps/web/src/surfaces/local/verificacoes.css` (`.vl-obs-line .btn-text`); `e2e/ergonomics.spec.ts`.
  class: debt
  state: open (owner: the next mock pass, Sally)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-3-14-4-verificacoes-do-local.md`
  summary: `apps/web/src/surfaces/relatorio/relatorio-tree-edges.test.tsx` "the cabine's "Adicionar bloco" follows the last sheet's coluna; a cabine with no coluna takes the block itself, "criada em ⟨cabine⟩"" fails on this batch's base (`f60fd938`, Story 14.2's branch) with no change of this batch: it finds no menu item named "Adicionar equipamento" (`Unable to find role="menuitem" and name "Adicionar equipamento"`). It was left as found; the full `test:unit` of this batch is green apart from it (3724 of 3725 on 2026-10-13).
  evidence: `apps/web/src/surfaces/relatorio/relatorio-tree-edges.test.tsx`; `apps/web/src/surfaces/relatorio/relatorio-tree.tsx` `locationMenu` (`add-block` label); `test-results/e14b/unit.log` of 2026-10-13.
  class: bug
  state: ~~open (owner: batch e14a, Story 14.2; else the coordinator before the wave gate)~~ closed (2026-10-14, E14-A2, from the note beside it) *(2026-10-13, batch e14b gate: closed. The test passes on the merge of Story 14.2's second pass, `50e4afff`: `pnpm test:unit` shows no failure in `relatorio-tree-edges.test.tsx`.)*

- source_spec: `_bmad-output/implementation-artifacts/spec-14-3-14-4-verificacoes-do-local.md`
  summary: Found while writing 14.3-E2E-001, in the Checklist row both the sheet and "Verificações do local" draw: for 180 frames (about 3 s) after the camera view closes, the camera's opener ("Adicionar foto") takes the focus back whenever it finds the focus lost (`returnFocus`, E6-Q6). A point dialog opened from the same row and closed inside that window ("Criar ponto de atenção", "Concluir") therefore hands the focus to "Adicionar foto" instead of the button that opened it: the opener's watch runs in the frame where the dialog's own restore has not landed yet. A person rarely shoots, opens and saves a point in 3 s; a test does. The e2e asserts the focus return on a row where no camera was opened (14.3-E2E-004); the sheet's 6.6-E2E-002 never opens the camera first.
  evidence: `apps/web/src/surfaces/ficha/camera-view.tsx` `returnFocus` (`restoreFocus` with `LIST_FOCUS_WATCH_FRAMES`, no `once`); `apps/web/src/components/dialog-shell.tsx` `useReturnFocus`; the run of 2026-10-13 (`document.activeElement` after "Concluir" was the row's "Adicionar foto").
  class: bug
  state: ~~open (owner: the next story touching `camera-view.tsx`; else the epic 14 deferred sweep)~~ closed (2026-10-14, `spec-e14-carry-over-b.md`, E14-A7: `restoreFocus` gains the opt-in `until: 'moved'`, which ends the watch once the focus, after the target held it, sits on a connected control other than the target; the camera's `returnFocus`, now in `camera-session.tsx`, uses it, so the point dialog's own restore is left alone while a re-render's loss to `<body>` is still taken back (E6-Q6). Pinned by `focus-restore.test.ts` and `verificacoes-local.spec.ts` E14-CO-B-E2E-001, red with the option reverted.)

## Deferred from: review of batch e14b, Stories 14.3 and 14.4 (2026-10-13)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-3-14-4-verificacoes-do-local.md`
  summary: 2026-10-13, review of batch e14b. The boot wiring of `upgradeTemplateSeeds` in `main.ts` and `migrate-cli.ts` is exercised by no test: the integration tests call the function, never the start that calls it. Check at the wave gate that a v3 template pushed before a restart reads v4 after it.
  evidence: `apps/api/src/main.ts` (`withRetry('template seeds', ...)`); `apps/api/src/db/migrate-cli.ts`; `apps/api/src/db/template-seed-upgrade.ts`.
  class: debt
  state: ~~open (owner: the coordinator's wave gate)~~ closed (2026-10-14, E14-A2): checked by the Epic 14 QA on the QA stack (`epic-14-qa-2026-10-13.md` section 3, the `upgradeTemplateSeeds` at boot row: a template set to v3 in SQL reads v5 after a restart, a second restart moves 0), and PR #129 (Q-7) also runs the seed step on a client push. A test of the boot wiring itself stays absent and is accepted.

- source_spec: `_bmad-output/implementation-artifacts/spec-14-3-14-4-verificacoes-do-local.md`
  summary: 2026-10-13, review of batch e14b. "Legendar" on a site photo is opened by no test: the caption of a site item's photo is covered in the kernel and at capture, but no unit or Playwright test opens the caption editor on one.
  evidence: `apps/web/src/surfaces/local/` (the site rows' photo list); `e2e/` (no spec presses "Legendar" on a site photo).
  class: debt
  state: ~~open (owner: the epic QA)~~ re-owned (2026-10-14, E14-A2): owner the next story touching the site rows' photo list (`apps/web/src/surfaces/local/`), which adds the test; the Epic 14 QA did not open "Legendar" on a site photo.

- source_spec: `_bmad-output/implementation-artifacts/spec-14-3-14-4-verificacoes-do-local.md`
  summary: 2026-10-13, review of batch e14b. `location_id` on a file or a point is not checked at the fold: an id naming a painel, a coluna or no location is accepted. A point naming a location that is not in the snapshot is left out of it with no trace (`pointsOfLiveLocals`); one naming a live painel or coluna stays and reads "Geral" (`pointTitle`, since this review). No client writes either: every writer takes the id of a live root cabine.
  evidence: `packages/domain/src/ops/apply.ts` (no branch reads the row a file's or a point's `location_id` names; `carriedLocationId` covers blocks only); `packages/domain/src/schemas/snapshot.ts` `pointsOfLiveLocals`; `packages/domain/src/relatorio/site-checklist.ts` `siteLocalOf`; `packages/domain/src/points/summary.ts` `pointTitle`.
  class: question
  state: ~~open (owner: the integrated epic review)~~ re-owned (2026-10-14, E14-A2): owner the architect, with the location-liveness decision of E14-A8 (one kernel accessor or an accepted list); the integrated review ran without settling it.

- source_spec: `_bmad-output/implementation-artifacts/spec-14-3-14-4-verificacoes-do-local.md`
  summary: 2026-10-13, review of batch e14b. `MergeInfoContext.relatorios` has no production caller (`mergeTextContext` in `apps/web/src/db/sync-store.ts` passes none), so a site merge entry numbers its item by the current seed and not by its relatório's. Harmless while every seed ships the same site list.
  evidence: `packages/domain/src/merge/info.ts` (`MergeInfoContext.relatorios`); `apps/web/src/db/sync-store.ts` `mergeTextContext`.
  class: debt
  state: open (owner: the story that first changes the site list)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-3-14-4-verificacoes-do-local.md`
  summary: 2026-10-13, review of batch e14b. A relatório on v3 that already holds painéis with *Agrupar por tipo* on prints the new painel type-group titles and the local's own heading before its first painel, since the 2026-10-13 criterion is not tied to a seed. A local with no painel prints unchanged on every seed.
  evidence: `packages/domain/src/print/group-for-print.ts` (the Stories 14.3 and 14.4 note); `packages/domain/src/print/section-9.test.ts` (matrix "Type titles under a painel", the v3 half).
  class: question
  state: open (owner: Matheus, for information)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-3-14-4-verificacoes-do-local.md`
  summary: 2026-10-13, gate of batch e14b. Two open failures of main showed in this batch's widened Playwright run, on specs it did not touch: `points.spec.ts` 6.6-E2E-011 failed once in the 28-file run and passed 4 of 5 alone on `ec9140b0` (the status-flow story's entry above: `Escape` on `BODY` before the focus returns to the photo viewer), and `ficha.durability.spec.ts` F-11 on `durability-webkit` failed in the run and 2 of 2 alone (the E13-A1 wave gate entry above: a reading focused by Tab lands under the Sticky action bar on WebKit). Neither was changed here; both keep the wave gate red on this host until settled.
  evidence: `test-results/e14b/gate.log`, `points-alone.log` and `webkit-f11.log` in the e14b worktree (git-ignored); the PR body of Stories 14.3 and 14.4. *(2026-10-14, Epic 14 QA Q-18, source `_bmad-output/implementation-artifacts/spec-epic-14-qa-fixes.md`: a third one joins them: `parecer-export.spec.ts` 7.5-E2E-003 (`@p1`, serial) failed once in the wave's `test:e2e:full` under load, a dialog scrim intercepting "Voltar" after Escape before the dialog held the focus (the E9-Q13 pattern), and passed 3 of 3 alone; `epic-14-qa-2026-10-13.md` § 1.)* *(2026-10-14, coordinator, PR #130: a fourth joins them: `parecer-export.spec.ts` 7.5-E2E-004 failed once in the batch's story gate under load, an Overflow trigger not yet stable after the generate toast, and passed twice alone and 8 of 8 as a whole spec; same family, owner the next carry-over batch with E14-A7.)*
  class: debt
  state: ~~open (owner: the next carry-over batch, with the two entries it points at)~~ closed (2026-10-14, batch co14a): 6.6-E2E-011, 7.5-E2E-003 and 7.5-E2E-004 pressed `Escape` before React Aria handed the focus back to the dialog (the E9-Q13 family); each now waits for it through the shared `escapeDialog` and asserts the dialog closed. WebKit F-11 was a product defect: WebKit's focus scroll ignores `scroll-padding-bottom` (probe: padding 133 px set, the reading left at 698 px under a bar whose top was 612 px of 800), so a keyboard-moved focus is now scrolled clear of the Sticky action bar and the App bar by `keepClearOfStickyBar` (`toast.tsx`, beside the `--sticky-bar-covered` writer, all browsers), run on the focus and again when the page or the bar changes size within 1.5 s (the reading left grows its row on blur; the Bulk mirror joins the bar); the test now measures three frames after each key, as a person sees it, since both changes land a frame later and WebKit has no scroll anchoring. F-11 on `durability-webkit`: 5 of 5 with the fix, red with the hook removed.


## Deferred from: Story 14.5, the measurement table and the Chave de transferência automática (2026-10-13)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: N1, narrowed. E6 (termografia): the columns ΔT similares and ΔT ambiente are typed by the technician (optional numbers in °C, never counted as missing), and the Classe is chosen from its four options (a select in the cell, see W1 below); the verdict comes from the Classe alone (`choice_pass`, only Normal passes). The approved mock draws the two ΔT cells as calculated (`.cell-calc`, from the temperatures and the ambient value) and the Classe as text derived from them. Left out: any computed cell. Why: the grammar has no derived column ("no derived column" is the decision recorded in the spec's Never list and in `epic-14-context.md`, Dropped). Lifted by a derived column kind in the grammar, shipped as a later seed version. Revisit after the first real job with a CTA.
  evidence: spec Design Notes, Narrowings; `packages/domain/src/seed/v5.ts` `E6_TERMOGRAFIA`; `packages/domain/src/seed/measurement.ts` (the column kinds); mock `mockups/prototype/screens/63-ficha-cta.html:326-335`.
  class: question
  state: open (owner: Matheus, product decision on a derived column; Bruno says after the first job whether typing the ΔT is acceptable)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: N2, narrowed. E5 (transferência): the Ajuste column is typed (optional), with two fixed cells ("limite 10 s" on "Até carga na Emergência", a dash on "Falha da Emergência"). The mock draws every Ajuste cell as dim text echoed from E4's retardos ("3 s (TD 1C)", "5 min (TD 3A)", "5 min (TD 2E)"). Left out: reading E4's Deixado into E5. Why: a cell of this grammar cannot refer to another test; the spec keeps the grammar to what one table holds. Lifted by a cross-test reference in the grammar (a later seed version), or dropped if the technicians find typing it fine. Revisit after the first real job with a CTA.
  evidence: spec Design Notes, Narrowings; `packages/domain/src/seed/v5.ts` `E5_TRANSFERENCIA` (column `ajuste`, the two `fixed` rows); mock `63-ficha-cta.html:305-309`.
  class: question
  state: open (owner: Matheus, product decision; Bruno's answer after the first job)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: N3, narrowed. The mock's row note under "Falha da Normal até partida" (`.cta-skip`, shown when the método is the controller's test button) is not built. In its place the método option itself carries the wording in the test's values line, on the sheet and in the printed MÉTODO line (the option's `phrase`, which says the engine-start delay TD 1C is skipped), as § 8.4 asks ("the sheet notes the method beside the times"). Left out: a helper text on one row that depends on a test value. Why: the grammar has no row note. Lifted by a row note conditional on a value (a later seed version) if the line beside the times proves not enough.
  evidence: spec Design Notes, Narrowings; `packages/domain/src/seed/v5.ts` `E5_TRANSFERENCIA.values` (`metodo`, option `botao_teste`); `packages/domain/src/print/section-9.ts` `measurementTestPart` (the values line); mock `63-ficha-cta.html:107-108, 305`; `sprint-change-proposal-2026-10-08.md` § 8.4, the sentence under "Options of E5".
  class: question
  state: open (owner: Bruno, after the first real job with a CTA: is the method line enough, and is its wording right)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: N4, narrowed. The E5 limit is the seeded 10 s for every CTA: one `absolute` criterion (`<= 10 s`) on the Medido cell of "Até carga na Emergência", the Ajuste cell of that row fixed at "limite 10 s", and a `criterion_override` put on a measurement test refused by the fold. § 8.4 words it as "the design limit (default 10 s)", so a job whose design asks another time cannot say so on the sheet. The deviation of every other step from its Ajuste is recorded only, with no verdict, as § 8.4 says. Left out: a per-sheet or per-relatório limit. Lifted by duplicating the type with another limit once company types exist (§ 8.5 item 3; Stories 14.6 to 14.8), or by a per-sheet override if Matheus decides one sooner.
  evidence: spec Design Notes, Narrowings; I/O matrix row "Absolute"; `packages/domain/src/seed/v5.ts` `E5_TRANSFERENCIA.criteria`; `packages/domain/src/ops/apply.ts` `assertSeedPath` (a measurement test holds no criterion override); `sprint-change-proposal-2026-10-08.md` § 8.4 (E5 row) and § 8.5 item 3.
  class: question
  state: open (owner: Bruno says whether a real job has a design limit other than 10 s; lifted by Stories 14.6 to 14.8, company types)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: N5, narrowed. The CTA's configuration (tensão, polos, neutro, transição, bypass) is set on the sheet, in its Configuração section, through `block/{id}/config`; a block added from either palette starts on the seed defaults (BT, 3 polos, neutro sólido, transição aberta, sem bypass). The Template composer adds the type with the Quantity stepper only: its type dialog asks nothing about the configuration, because the approved composer mock draws no such step. Left out: preparing the configuration in the office, in the template. Lifted by a configuration step in the composer (needs a mock first).
  evidence: spec Design Notes, Narrowings and Keys; `packages/domain/src/relatorio/measurement-evaluation.ts` `configFieldsOf`, `blockConfigWithOption`; `apps/web/src/surfaces/ficha/configuracao-section.tsx`; mock `mockups/prototype/screens/42-template-composer.html:186-188, 283`.
  class: question
  state: open (owner: Matheus, product decision and a mock; revisit after the first real job with a CTA)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: N6, narrowed. Only E1 (the instruments registered for resistência de contato) and E2 and E3 (those for isolação) offer the instrument picker and print an instrument line. E4 (ajustes do controlador), E5 (transferência) and E6 (termografia) offer none and print none, and an instrument put on them is refused. Why: an instrument in the registry is flagged for the seeded test kinds only, and the spec forbids a new registry field in this story. Left out: naming the timer or analyser of E5 and the thermal camera of E6 on the relatório. Lifted by a registry flag for those uses and `instrument_of` gaining the values.
  evidence: spec Design Notes, Narrowings, and Never list ("No new instrument-registry field"); `packages/domain/src/seed/measurement.ts` `instrumentOfSchema`; `packages/domain/src/seed/v5.ts` (`instrument_of` on E1 to E3 only); `packages/domain/src/print/section-9.ts` `measurementTestPart`.
  class: question
  state: open (owner: Matheus for the registry field; Bruno says which instruments the relatório must name, after the first real job with a CTA)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: N7, narrowed. The CTA's criteria are not listed in the Critérios de aceitação tab of Cadastros: the tab still shows the three seeded criteria (`SEEDED_CRITERIA`, unchanged). Each CTA criterion lives in the type's seed definition with its source and is shown where it is applied: the test's caption on the sheet and the ACEITÁVEL line of the printed table. Left out: a place in the office that lists what a library type is judged by. Lifted with company types, whose editor shows and edits a type's criteria (Story 14.7), or sooner by a read-only list per library type on that tab.
  evidence: spec Design Notes, Narrowings, and Never list ("no change to the Critérios de aceitação tab"); `packages/domain/src/seed/criteria.ts` `SEEDED_CRITERIA`; `packages/domain/src/seed/v5.ts` (the `criteria` of each test).
  class: question
  state: open (owner: Matheus; lifted by Story 14.7, the type editor)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: Q1, open question. E2 (isolamento principal) has eight rows: the seven of § 8.4 plus N-T, which the approved mock draws for a four-pole switch. Built as the mock: the row N-T exists only with polos = 4 and is hidden, not counted and not printed otherwise. If Bruno says the row does not belong, removing it is a later seed version (v5 is frozen once merged) and the values already typed in it stay on their sheets.
  evidence: spec Design Notes, Open questions; `packages/domain/src/seed/v5.ts` `E2_ISOLAMENTO_PRINCIPAL.rows` (`n_t`, `when` polos 4); mock `63-ficha-cta.html:212, 225`; `sprint-change-proposal-2026-10-08.md` § 8.4 (E2 row).
  class: question
  state: open (owner: Bruno, before or after the first real job with a CTA)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: Q2, open question. E4 (ajustes do controlador) has the eight sensor rows of § 8.4 (pickup and dropout of tensão and of frequência, for Normal and for Emergência), then Falta de fase, TD 1C, TD 2B, TD 3A, TD 2E and Exercitador: 14 rows, each asking Projeto, Encontrado and Deixado. The approved mock draws five sensor rows (no dropout de frequência of the Normal, no dropout of the Emergência), so the built sheet asks for three rows more than the mock. Built as § 8.4, the fuller list. If Bruno wants the mock's five, the change is a later seed version.
  evidence: spec Design Notes, Open questions; `packages/domain/src/seed/v5.ts` `E4_AJUSTES_CONTROLADOR.rows`; mock `63-ficha-cta.html:262-300`; `sprint-change-proposal-2026-10-08.md` § 8.4 (E4 row).
  class: question
  state: open (owner: Bruno, after the first real job with a CTA)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: Q3, open question. A test switched off on the sheet (E1, E2, E3 or E6) prints nothing in section 9, as a disabled sub-block of the eight types prints nothing today (AD-21, renderer rule). § 8.4 says of these tests "Each one is marked NA when the switch cannot be de-energized", which can be read as the table printed with an NA mark, so the reader of the relatório sees that the test exists and was not run. Built: the conservative reading, nothing printed; the off note on the sheet tells the technician to mark NA. Left out: a printed NA table or line for a test switched off.
  evidence: spec Design Notes, Open questions; I/O matrix row "Test switched off"; `packages/domain/src/print/section-9.ts` `measurementTestPart` (null for a test switched off); `sprint-change-proposal-2026-10-08.md` § 8.4, "Defaults".
  class: question
  state: open (owner: Bruno: should a test switched off print as NA)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: Q4, open question. A cell out of its criterion prints as any other cell, the convention of the seeded tables of FO.SERV-03; the out reading is named in the sheet's conclusion text. The approved print mock writes the percent above the lowest and the word "INVESTIGAR" inside the E1 cell. Built: the existing convention, no word and no percent in the cell. Left out: any mark of an out-of-criterion cell in the printed table.
  evidence: spec Design Notes, Open questions; `packages/domain/src/print/section-9.ts` `measurementText` and the file's header comment ("An out-of-criterion cell prints as any other"); mock `mockups/key-print-section-9.html:206`.
  class: question
  state: open (owner: Bruno: how an out cell prints, for the CTA and, if changed, for the seeded tables too)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: Left by the kernel slice (a). E5 with the método "Não realizado" drops only its table: section 9 still prints the test's title, the MÉTODO line and the ACEITÁVEL line (criterion and source) with no rows under them, and the sheet asks for none of the E5 cells. The spec's matrix says the table is "not required and not printed" and says nothing about the three lines. Decide whether a transfer test that was not run prints those lines, prints one "não realizado" line, or prints nothing.
  evidence: spec "Phase 1 result", last bullet; `packages/domain/src/seed/v5.ts` `E5_TRANSFERENCIA.skip_when`; `packages/domain/src/print/section-9.ts` `measurementTestPart` (`test.skipped`).
  class: question
  state: open (owner: Bruno, with Q3: what the relatório shows for a test not run)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: Left by the kernel slice (b). The suggested TAG of a CTA follows the existing rule with the new prefix only (`CTA`): on a coluna it is "CTA-C05", and placed directly on a local named "Geradores" it is "CTA-GERADORES". The approved mocks show "CTA-GER" there, which is example data: no rule abbreviates a local's name, and the TAG rule is unchanged by decision (`epic-14-context.md`, shared item "TAG rule"). The technician can type any TAG. Decide only if short TAGs for equipment placed directly on a local are wanted; that would be a change to the rule for all nine types.
  evidence: spec "Phase 1 result", last bullet; `packages/domain/src/relatorio/tag.ts` (prefix map, rule untouched); mocks `63-ficha-cta.html:116-124`, `40-relatorio-overview.html:304`, `mockups/key-print-section-9.html:171`.
  class: question
  state: open (owner: Matheus; no action unless the first real job asks for it); assigned 2026-11-10 to Epic 24, Story 24.8 (the new TAG rule, TYPE-NN, answers it when built); ~~open~~ closed 2026-11-11 by batch e24b (Story 24.8, `spec-e24b-screen-lane.md`): the suggestion is PREFIX-NN for every type, so a CTA on "Geradores" is "CTA-01"

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: § 8.5 item 1, as it reaches the CTA. With tensão = MT the E2 criterion of a CTA is the firm's own seeded insulation criterion (the `isolacao` entry of `SEEDED_CRITERIA`, "> 400 MΩ", source "aceitável na ficha"), read from there and never repeated in the type, so one relatório judges all its MV equipment by one criterion. `sprint-change-proposal-2026-10-08.md` § 8.5 item 1 records that this value is well below the NETA figure for the 15 kV class and that the matter concerns every MV sheet, not only the CTA; it changes nothing now. If the firm's criterion changes, the CTA in MT follows it with no change to the type. With tensão = BT the criterion is the type's own (`>= 100 MΩ` at 1.000 Vcc).
  evidence: `packages/domain/src/seed/v5.ts` `E2_ISOLAMENTO_PRINCIPAL.criteria` (`seeded: 'isolacao'`, `when` tensão mt); `packages/domain/src/seed/criteria.ts`; spec I/O matrix row "Absolute"; `sprint-change-proposal-2026-10-08.md` § 8.4 (E2 row) and § 8.5 items 1 and 2.
  class: question
  state: open (owner: Bruno; recorded, to adjust after first use)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: Authored pt-BR copy of Story 14.5 awaiting Bruno's review. No FO.SERV-03 text exists for this type, so these were written for the story and are marked `// authored:` in the seed: the three NC chip phrases of each of the 17 checklist items (item 3's are the mock's chips), the wording of every criterion, the two off notes of a test switched off, every option label and phrase of the configuration and of the E5 options, the configuration defaults, and the labels with no § 8.4 source. The sources of the criteria are § 8.4's, read second hand; a maker's manual is named as "manual do fabricante". v5 is frozen once Story 14.5 merges, so every correction ships as a later seed version.
  evidence: `docs/nc-chip-phrases.md`, section "Chave de transferência automática (library type, seed `v5`)" (verified item by item against the seed on 2026-10-13); `packages/domain/src/seed/v5.ts` (the `// authored:` comments); `epic-14-context.md`, "Open with Bruno".
  class: docs
  state: open (owner: Bruno's copy review, before the first real job with a CTA)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: W1, narrowed in the web slice. A choice cell with two options (E4 "Falta de fase": Ligado, Desligado) is a Segmented control in the mock's `td.cell-yn`, as the spec's task says. A choice cell with more than two options (E4 "Exercitador", E6 "Classe": four each) is the sheet's select (`select.input`), with "Selecione" (clears the cell) and "Não medido" among its options. Why: four segments in each of four columns fit no tablet side by side, and the approved CTA mock draws these cells as a value box, not as segments. Left out: a Segmented control for every choice cell, as the spec's task line reads literally. Decide whether the select stands.
  evidence: spec Tasks, phase 2, first bullet ("choice cells as Segmented control"); `apps/web/src/surfaces/ficha/measurement-test-section.tsx` `ChoiceCell` (`SEGMENTED_OPTIONS`); mock `mockups/prototype/screens/63-ficha-cta.html` (the "Falta de fase" and "Exercitador" rows; page rule `td.cell-yn`); `mockups/MOCK-GUIDE.md` ("linha sim/não como segmentado").
  class: question
  state: ~~open (owner: Matheus, at the browser pass on the integrated main)~~ re-owned (2026-10-14, E14-A2): owner Matheus, product decision listed in E14-A9 (14.5 W1); the browser pass on the integrated main ran (`epic-14-qa-2026-10-13.md` section 3) without a finding on it.

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: W2, narrowed in the web slice. Text the mock draws and the sheet does not: the helper lines under Tensão ("BT: E2 a 1.000 Vcc ...") and Polos ("4 polos: E1 e E2 ganham a linha do neutro (N)") in Configuração, the helper under the E5 Método, the section notes of E3 and E4, the table titles (`.mt-title`: "Polo × lado", "Tempos") and the prose after each criterion source. Why: each restates a fact the seed owns (a criterion value, which rows a configuration shows) or is example data, and the grammar carries no helper, note or table title, so the web would hold a second copy that a later seed version could contradict. The criterion text and its source are the kernel's and are shown. Lifted by `helper` and `note` fields on the grammar's config field, value and test (a later seed version) if the technicians miss them.
  evidence: `apps/web/src/surfaces/ficha/configuracao-section.tsx`, `apps/web/src/surfaces/ficha/measurement-test-section.tsx`; `packages/domain/src/seed/measurement.ts` (`configFieldSchema`, `measurementValueSchema`, `measurementTestSchema`); mock `63-ficha-cta.html` (the `.helper`, `.section-note` and `.mt-title` elements of the Configuração and E1 to E6 sections).
  class: question
  state: open (owner: Bruno for the wording, Matheus for adding the fields; after the first real job with a CTA)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: W3, the spec's first acceptance criterion against an older narrowing. The criterion says that after the composer adds a CTA "the node shows it with the suggested TAG". The Template composer has never drawn the mock's `.qty-tag` line ("TAG ao criar: CTA-C05") for any type: Stories 3.3 and 3.4 left it out and Story 14.2 kept it out. Built: the node lists the type by name with its stepper and the template totals name it; the suggested TAG is shown where the app shows suggested TAGs, on the field palette's row ("17 itens · até 6 ensaios · CTA-GERADORES") and on the block at creation. Left out: `.qty-tag` on the composer's quantity rows, which would be for all nine types and touches the composer of batch e14a.
  evidence: spec Acceptance Criteria, first bullet; `_bmad-output/implementation-artifacts/spec-3-3-3-4-templates-list-and-composer.md:67` ("no ... TAG suggestions (`.qty-tag`)"); `apps/web/src/surfaces/templates/templates.css:17`; `apps/web/src/surfaces/templates/skeleton-list.tsx` `QtyGrid`; `apps/web/src/surfaces/relatorio/block-palette-field.tsx` `ItemBody`; mock `mockups/prototype/screens/42-template-composer.html:283`.
  class: question
  state: open (owner: Matheus: draw `.qty-tag` in the composer for every type, or reword the criterion)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: W4, found in the web slice, not changed. The composer's "Editar padrões" dialog of a type lists every sub-block of its definition with a switch. For the CTA that includes E4 (ajustes do controlador) and E5 (transferência), which the sheet cannot switch off: the kernel treats a test with no `switchable` as always on, so a template that switches one of them off changes nothing on the sheet, in the counts or in the document. The dialog also shows no line of what a measurement test holds (`subBlockSummaryText` answers null for it). Left as is: the story's composer task is the palette group, and the fix is a kernel rule (which sub-blocks of a definition are locked) the dialog reads, beside `LOCKED_SUB_BLOCKS`.
  evidence: `apps/web/src/surfaces/templates/type-defaults-dialog.tsx:82-110`; `packages/domain/src/seed/template.ts` `LOCKED_SUB_BLOCKS`; `packages/domain/src/relatorio/measurement-evaluation.ts` `evaluate` (`enabled`); `packages/domain/src/templates/text.ts` `subBlockSummaryText`.
  class: bug
  state: ~~open (owner: Matheus; small kernel and dialog change, or Story 14.7 when the type editor redraws this dialog)~~ closed (2026-10-13, review patch of this story: `lockedSubBlocksOf` in `packages/domain/src/seed/template.ts` locks a measurement test that is not `switchable`; the dialog draws E4 and E5 as "Sempre" and `enabledSubBlocks` in `packages/domain/src/templates/compose.ts` keeps them enabled for every reader. Still open under the same owner: `subBlockSummaryText` answers null for the six `cta_*` sub-blocks, so the dialog shows no "what it holds" line for them)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: W5, narrowed in the web slice. A measurement test's table has no "Ler visor" and no Dictation button, and its Instrument picker (E1 to E3) shows no "Sugerido" instrument and "Concluir ficha" writes none: the display-reading fixtures, the table utterance parser and `suggestedInstruments` are the four seeded grammars'. The picker lists the registry instruments that fit the seeded test kind the seed names (`instrument_of`), the one last used for that kind in the relatório first, and stores the header under the measurement test's own key. Every cell is typed. Left out: the three assists on a library type's tables.
  evidence: `apps/web/src/surfaces/ficha/measurement-test-section.tsx` (no `.mt-actions`); `apps/web/src/surfaces/ficha/instrument-picker.tsx` (`instrumentOf`); `packages/domain/src/relatorio/instrument-pick.ts` `suggestedInstruments` (walks `definition.tests`); `apps/web/src/surfaces/ficha/ensaios-section.tsx` (the seeded `TestSection` carries the three).
  class: question
  state: ~~open (owner: Matheus; after the first real job with a CTA says which assist is missed)~~ partly closed (2026-10-13, review patch of this story: E1 to E3 take the "Sugerido" instrument through `instrument_of`, `suggestedInstrument`/`suggestedInstruments` in `packages/domain/src/relatorio/instrument-pick.ts`). Open (owner: Matheus, after the first real job with a CTA): "Ler visor" and Dictation on a measurement table

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: W6, a reading taken in the web slice. Below 768 px a measurement table of one or two value columns stays a table (E1, E3, E5) and one of more stacks into a card per row (E2, E4, E6), the rule EXPERIENCE.md states for the Measurement table. The approved mock stacks every table of this sheet on phone. Built: EXPERIENCE.md, which wins over a mock; the spec's phone criterion names E4 only. To check at the browser pass: E1 and E5 at 390 px, where each row holds two fields with their unit and Overflow, and E4 on a tablet, whose four columns and unbroken row labels make the table scroll inside its own box (never the page) below about 1100 px of content width.
  evidence: `EXPERIENCE.md` › Measurement table ("With one or two value columns the table stays a table on phone"); `apps/web/src/surfaces/ficha/measurement-test-section.tsx` (`TABLE_COLUMNS_ON_PHONE`); `apps/web/src/styles/app.css` (the `.lib-cards` and `.has-cards` translations); mock `63-ficha-cta.html:93-95`; spec Acceptance Criteria, the 390 px bullet.
  class: question
  state: ~~open (owner: the integrated review's browser pass at 390, 768 and 1280 px; Matheus decides if E1 and E5 should stack too)~~ re-owned (2026-10-14, E14-A2): the browser pass ran (`epic-14-qa-2026-10-13.md` section 3: "14.5 sheet fit (tables scroll inside their box), dark" pass at 390 and 768 px); owner Matheus, whether E1 and E5 should stack too, listed in E14-A9 (14.5 W6).

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: W7, added to the kernel in the web slice. The continuous Enter run of the sheet's readings (EXPERIENCE.md › Measurement table, Keyboard) had no rule for a measurement test, so `measurementRunTarget` and `measurementRunEnterKeyHint` were added to `packages/domain/src/relatorio/measurement-evaluation.ts` after the kernel slice was committed: down the column over the typed number cells of the rows shown, then the first empty one of what follows, then the primary; a choice or a fixed cell is never a stop. Kernel tests cover it. Not covered by a Playwright spec: the run across a measurement test is asserted in the kernel and in the web unit test only (the walk of `e2e/cta.spec.ts` leaves each cell with Tab).
  evidence: `packages/domain/src/relatorio/measurement-evaluation.ts` `measurementRunTarget`; `packages/domain/src/relatorio/measurement-evaluation.test.ts` ("the continuous Enter run over the measurement tests"); `apps/web/src/surfaces/ficha/ensaios-section.tsx` `onMeasurementRun`.
  class: test-gap
  state: ~~open (owner: the story gate once the stack is up: one Enter-run step in `e2e/cta.spec.ts` or `e2e/cta.durability.spec.ts`)~~ closed (2026-10-13: `e2e/cta.spec.ts` 14.5-E2E-002 presses Enter on E1 at 768 px and on the E4 cards at 390 px and asserts the focused cell)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: R1, review finding left open. A CTA's configuration and its test switches are written as one whole `block/{id}/config` put, so two devices editing the same sheet offline (one sets polos, the other switches E6 off) end with the last writer's whole config and the other choice silently reverted. The eight types never wrote config from the sheet, so the last-writer rule was not reachable there.
  evidence: `apps/web/src/surfaces/ficha/configuracao-section.tsx` (`blockConfigWithOption`), `measurement-test-section.tsx` (`blockConfigWithSubBlock`); `packages/domain/src/ops/path.ts` `BLOCK_FIELDS` (`config`). Edge Case Hunter, review of 2026-10-13. *(2026-10-14, Epic 14 QA fix batch, recommendation R-1, source `_bmad-output/implementation-artifacts/spec-epic-14-qa-fixes.md`: the cheap signal is built: a reported concurrent `block/{id}/config` pair now names the keys whose values differ with the kernel's labels, "CTA-C01: configuração de Ana mantida (a mais recente prevalece); diferem: polos, E6" (`packages/domain/src/merge/info.ts` `configDifferences`, `info.test.ts`). The whole-config last-writer rule itself is unchanged: the per-key family stays the architect's, a contract bump to 20 before Wave 3.)*
  class: bug
  state: open (owner: the architect with Story 14.6: per-key config paths are a new op family and a contract bump, outside this story's numbers)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: R2, open question from the review. `block/{id}/config` is structure for the status flow (`countsAsFieldContent` answers false), as `epic-14-context.md` settles for what shapes the sheet before the visit. On a CTA the Configuração section and the test switches can also be changed on a concluded sheet of an Emitido relatório: tensão changes the E2 criterion and polos the required rows, the verdicts move, ~~and the relatório stays Emitido (the change still counts for `editedSince`, so the next generate is a new revision). Built as the context says.~~ *(2026-10-14, Epic 14 QA Q-15, source `_bmad-output/implementation-artifacts/spec-epic-14-qa-fixes.md`: that reading was wrong.)* and the kernel reopens the relatório as Em revisão: a config change on an Emitido relatório is an edit, and the status step moves Emitido to Em revisão on any edit (`packages/domain/src/relatorio/status-advance.ts:30`), pinned for `block/{id}/config` by `status-advance.test.ts:43-62`; only a Rascunho relatório stays where it is, since config is structure. The 14.5 "As built" line in `epics.md` says the same wrong thing and is left to the coordinator (this batch does not edit `epics.md`).
  evidence: `packages/domain/src/status/edited-since.ts` `countsAsFieldContent`; `apps/web/src/surfaces/ficha/configuracao-section.tsx` (read-only only when the sheet is marked not tested). Edge Case Hunter, review of 2026-10-13. `packages/domain/src/relatorio/status-advance.ts:30`; `status-advance.test.ts:43-62` (2026-10-14).
  class: question
  state: open (owner: Matheus: ~~either a CTA config change after emission reopens the relatório as Em revisão, or Configuração is read-only once the sheet is concluded~~ (2026-10-14) the first is what the kernel does today: is it wanted, or should Configuração be read-only once the sheet is concluded?)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: R3, review finding rejected as unreachable from the product, recorded. The fold accepts a measurement cell whose unit is foreign to its row (a `min` on a row in `s`), a number on a choice cell or an option key outside the list; the evaluation then gives the cell no verdict. The sheet writes only the row's own unit and its listed options, so only a hand-written op reaches it.
  evidence: `packages/domain/src/ops/apply.ts` `assertMeasurementCell`; `packages/domain/src/relatorio/measurement-evaluation.ts` (`scaleToUnit` null). Edge Case Hunter, review of 2026-10-13.
  class: bug
  state: open (owner: Story 14.6, when company types make cell kinds data: a fold refusal with its sync-route test)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: R4, review finding rejected as low, recorded. The Conflict view and `enabledCells` enumerate every row and value of a measurement test, the rows hidden by polos, the values hidden by `when` and a skipped E5 table included, so a conflict on a cell the sheet no longer draws is still listed for a decision.
  evidence: `packages/domain/src/merge/conflicts.ts` (measurement enumeration), `packages/domain/src/relatorio/sheet-state.ts` `enabledCells`. Edge Case Hunter, review of 2026-10-13.
  class: bug
  state: open (owner: Matheus; low: needs two devices and a polos change between them)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: R5, test gap deferred by the review. `sheet/test/value` was added to the SM-C1 suggestion metric's families with no assertion; no suggestion source writes a test value today, so the metric cannot differ yet.
  evidence: `packages/domain/src/print/sm-c1.ts:17`; `packages/domain/src/print/section-10.test.ts` (no value path). Verification Gap Reviewer, review of 2026-10-13.
  class: test-gap
  state: open (owner: the story that first suggests a test value)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: R6, open question from a review patch. A measurement test stores no test parameter in its instrument header and prints none on its instrument line (`measurementInstrumentHeaderOf`): the registry's default for the megôhmetro (for example 5 kV) would print beside a criterion that names 1.000 Vcc or 500 Vcc. The E1 line therefore prints no test current either.
  evidence: `packages/domain/src/relatorio/instrument-pick.ts` `measurementInstrumentHeaderOf`; `packages/domain/src/print/section-9.ts` `instrumentLine`.
  class: question
  state: open (owner: Bruno: whether E1 to E3 should print a test current or voltage typed on the sheet)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md`
  summary: R7, process. At the gate of this batch `origin/main` held Story 14.2 squash-merged with its removal pass (PR #126) and the batch under this one (e14b, branch `story/14-3-14-4-verificacoes-do-local`) had not merged it yet. Merging main here conflicted in 56 files, almost all between the removal pass and e14b's own work, so the resolution belongs to e14b; this branch was gated on its own work plus e14b's latest head and must merge `origin/main` and re-run its story gate after e14b merges.
  evidence: `git merge origin/main` at `6cdba8cc` (aborted); the launch prompt's rule "no gate runs on a base that is still moving".
  class: process
  state: ~~open (owner: the coordinator, with this batch's orchestrator: merge main after e14b merges, gate, open the PR)~~ closed (2026-10-14: PR #126 and PR #127 merged; this branch merged `origin/main` at `3acbddb`, taking main's version of every file the batch did not change and re-applying the Story 14.5 delta on the 114 it did, and gated on that merge)


## Deferred from: Epic 14 QA fix batch (2026-10-14)

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-14-qa-fixes.md`
  summary: Q-8. Site work written offline on a local another device removed disappears with no sign: device B answers the 19 items and adds a point offline, device A removes the local and syncs first; on B's next pull the answers are hidden with the local, the Verificações route says "não encontradas", no merge entry or decision is raised (the edit-on-removed mark exists for blocks only), and after the next emission the local's entry is cut from "Restaurar ficha removida", so nothing brings the answers back. The fix batch closed ledger (h) for sheets (a stranded live sheet is its own restore entry); site answers, site photos and site points have no such entry.
  evidence: `packages/domain/src/ops/apply.ts:190-202`; `apps/web/src/surfaces/local/verificacoes-surface.tsx:84-91`; `packages/domain/src/relatorio/sumario.ts` `restorableEntries` (the `since` cut, `strandedSheetRows`); `epic-14-qa-2026-10-13.md` Q-8 and R-2.
  class: question
  state: open (owner: Matheus, joins ledger (h): either a local holding site work written after its removal stays offered past the cut, or the site work raises a decision, which is a new mark in the fold and a contract bump)

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-14-qa-fixes.md`
  summary: Q-9. The site photos of a removed local still print in section 7 ("Imagem 1: Verificação de … da Sala dos trafos") and the Sumário still counts them, while section 9 drops the local; once an emission cuts the local from the restore list the photo prints for good. This is how removed sheets' photos already behave, and it contradicts the context line "Story 14.4 prints nothing for a removed local".
  evidence: `packages/domain/src/schemas/snapshot.ts:161`, `:356` (files are not filtered by the location rule); `packages/domain/src/print/section-7.ts:55-71`; `epic-14-context.md` "Added 2026-10-13: location removal".
  class: question
  state: open (owner: Matheus: hide a removed local's site photos from section 7 and the counts, or keep the sheets' behaviour)

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-14-qa-fixes.md`
  summary: Q-4, the part left out. The fix batch added the pending pre-issue row "Verificações do local com NC sem ponto de atenção: …" (a local whose NC site items outnumber its live points). Not built: whether a site NC enters "NC abertos" (`Progress.nc_open`) and its list on the Sumário header, and whether it counts as a restriction in the parecer suggestion; both were kept out by the coordinator (the spec's Never list).
  evidence: `packages/domain/src/relatorio/progress.ts` (`nc_open`); `packages/domain/src/relatorio/parecer.ts:85-97`; `packages/domain/src/relatorio/site-checklist.ts` `siteNcWithoutPoint`; `epic-14-qa-2026-10-13.md` R-3.
  class: question
  state: open (owners: Matheus for the counter, Bruno for the parecer wording)

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-14-qa-fixes.md`
  summary: Q-16. Story 14.4's DoD asks that the DOCX and its PDF are checked against the approved print mock; no PDF check exists in the repository. The QA pass read the text of revision 1's PDF (14 pages, VERIFICAÇÕES DO LOCAL twice, both painel bands, E5) but not its layout against `key-print-section-9.html`.
  evidence: `epic-14-qa-2026-10-13.md` Q-16 and § 3 (the 14.4 PDF row, "partial"); `mockups/key-print-section-9.html`.
  class: test-gap
  state: open (owner: the next print story)

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-14-qa-fixes.md`
  summary: Tooling. The `install` container leaves `_tmp_13_*` files behind: pnpm 12.5.1's link probe, outside this repository's code. ~~They are not ours to fix here.~~ *(2026-10-14, E14-A13: they are: the probe is pnpm's store lookup, which runs because no store is set.)*
  evidence: the `install` service of `docker-compose.yml`; pnpm 12.5.1.
  class: debt
  state: ~~open (owner: tooling)~~ closed (2026-10-14, `spec-e14-carry-over-b.md`, E14-A13: pnpm 12 reads its settings from `pnpm_config_*` only, so the `npm_config_store_dir` of the `x-app-env` anchor was ignored and every pnpm call in a container looked for a store itself, writing `_tmp_<pid>_*` probe files into the bind-mounted worktree root (seen 3 to 6 per `install`, left behind when a run is cut short). The anchor now sets `pnpm_config_store_dir` to the store that lookup already picked, `/workspace/node_modules/.pnpm-store`, which skips the probe: no `_tmp_*` file during `install` or `pnpm exec`, `--frozen-lockfile` green, packages still hard linked from the same store, and a fresh set of volumes installs clean.)


## Deferred from: production deploy v0.2.0 (2026-10-14)

- source_spec: `infra/PUBLISHING.md`
  summary: `infra/bin/check` fails `terraform init -backend=false` for both stacks on this machine ("No valid credential sources found", the S3 backend asking for credentials) even with a live `fasor-admin` session, while `validate`, `fmt`, tflint, ShellCheck and the real `plan` pass. Separately, the cached provider binaries under `infra/*/.terraform/providers` had lost their execute bit (plan failed with "permission denied" until `chmod u+x`).
  evidence: deploy of 2026-10-14; `infra/bin/check` output; `infra/bin/tf` runs `hashicorp/terraform:1.16.4` with `--user $(id -u):$(id -g)` over a bind mount.
  class: debt
  state: open (owner: the next infra change)

- source_spec: `infra/PUBLISHING.md`
  summary: The production log of the first start of v0.2.0 says "template seeds upgraded, moved: 0" with no "skipped" line, so no live template moved from its seed to v5. Either production holds no live template, or every template was already on the current seed. Not verified against the database; if a template is on v3, relatórios created from it are born on v3 and have no Verificações do local or CTA.
  evidence: `/fasor/production/api` log lines at 17:24:55Z and 17:40:44Z; `apps/api/src/db/template-seed-upgrade.ts`.
  class: verification-gap
  state: ~~open (owner: coordinator, with Matheus: open the Template list in production and read each template's seed)~~ closed 2026-10-14 (coordinator): the migration task of the deploy moved them first. `/fasor/production/migrate` stream `migrate/migrate/5003ceed49a14dbe83a2a92d1984f9ca` at 17:24:06Z logs three templates of one company moved from v3 to v5 ("moved":3), so every later start finds nothing to move. No defect.

- source_spec: `infra/PUBLISHING.md`
  summary: The Home card and the Sumário disagree on the same relatório: the card reads "2 de 12 fichas" and the Sumário "0 de 12 fichas concluídas". Since Story 8.1 the Sumário counts a sheet holding a pending suggestion as not concluded (`progress()` with the device's pending rows, `held`), while the Home and obra cards call `progress({ blocks, suggestions: [] })` and count it concluded. Seen in production on 2026-10-14 (a relatório with 18 suggestions waiting). Older than Epic 14; not a deploy defect.
  evidence: `packages/domain/src/home/cards.ts` `counterOf`; `packages/domain/src/relatorio/progress.ts` `over` and `progress`; production browser check of v0.2.0.
  class: defect
  state: ~~open (owner: Matheus decides which count the card shows; then the next carry-over batch)~~ closed (2026-10-15, `spec-14-10-carry-over-2-d.md`: Matheus chose the more restrictive count; the Home card and the Project row compute it through the kernel's `relatorioCounter`, the Sumário's `held` rule over the device's pending suggestion rows, so the three surfaces agree; kernel tests in `progress.test.ts` and `cards.test.ts`, e2e 14.10-E2E-032)

- source_spec: `_bmad-output/implementation-artifacts/spec-13-8-emission-audit.md`
  summary: 2026-10-15, production check of cd33356 (relatório "TESTE v0.2.0 — apagar", 76 sheets, 2 filled): the emission audit ("Conferir antes de emitir") reported "A imagem menciona 'chave de transferência automática CTA-APAGAR' que não consta em nenhuma folha de ensaio do relatório", although the CTA-APAGAR sheet exists and carries values. Either the audit input (`packages/domain/src/audit/input.ts`, built from the printed layout) cut that sheet (the long-relatório truncation of line 30) or it does not render a measurement-table sheet of a library type (seed v5) the way the photo caption names it. Not reproduced locally.
  evidence: production browser check 2026-10-15 07:59 (Playwright MCP, Bruno's account); `packages/domain/src/audit/input.ts` `sheetLines`, `sheetLabelOf`.
  class: defect
  state: ~~open (owner: the next carry-over batch: reproduce with a v5 CTA sheet and a captioned photo in the kernel audit-input test)~~ closed (2026-10-15, `spec-14-10-carry-over-2-b.md`: reproduced in `audit.test.ts` 14.10-UNIT-001 with 76 sheets on v5, 2 filled, the CTA tagged CTA-APAGAR with a captioned photo: the cut dropped the CTA's sheet line (the filled sheets printed last). `auditInput` now sends the filled or photographed sheets first and writes each sheet's screen label beside its printed title when they differ; the run stores `coverage` (contract 20) and the screen says "Conferidas N de M fichas")

- source_spec: `_bmad-output/implementation-artifacts/spec-e14-carry-over-b.md`
  summary: 2026-10-15, production check of cd33356 at 390 px: after a plate shot on the CTA sheet ("Fotografar placa", one shot, the camera closing by itself), `document.activeElement` was `BODY`: the focus did not come back to "Fotografar placa" or to the reading result that replaced it. The co14b focus watch (`restoreFocus` with `until: 'moved'`) covers the sheet's "Adicionar foto"; the plate path's opener is replaced by its result, so there is no target left.
  evidence: production browser check 2026-10-15 07:25; `apps/web/src/input/focus-restore.ts`; the plate section of `apps/web/src/surfaces/ficha/`.
  class: defect
  state: ~~open (owner: the next carry-over batch: decide the plate shot's return target, e.g. the reading status line, and assert it in plate-shot e2e)~~ closed (2026-10-15, `spec-14-10-carry-over-2-b.md`: the plate tile's camera returns the focus to the plate row's waiting line (`tabIndex={-1}`: the pending shot's row, then the stored row's), else the stored row's tile, else `.plate-crop-open` (`surfaces/ficha/plate-focus.ts`), and a plate row leaving while it holds the focus hands it on; the retake does the same. `e2e/plate-shot-fallback.spec.ts` 14.10-E2E-003 at 390 and 768 px)

## Deferred from: Story 14.10 lane B (2026-10-15)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-10-carry-over-2-b.md`
  summary: Open questions of the batch, kept conservative: a sync request still in flight but slow (no failure yet) keeps the previous badge word until it fails (no client timeout on sync calls, by the spec), so "Tentando de novo" shows only after a failed cycle; and the "Hoje" chip of Próxima intervenção shows on an empty field only (13.4's rule).
  evidence: `apps/web/src/sync/engine.ts` `probeServer`; `apps/web/src/surfaces/relatorio/setup/etapa5-local.tsx`.
  class: question
  state: open (owner: Matheus, listed in the PR)

## Deferred from: Story 14.10 lane A, carry-over 2 (2026-10-15)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-10-carry-over-2-a.md`
  summary: Part 6 (the production smoke of the carry-over) is not built in lane A: which test company and which relatório a smoke may write to in production is Matheus's decision, and lane A touches no `infra/` and no AWS.
  evidence: spec Boundaries ("Never: Part 6 (production smoke), `infra/`..."); the production check of 2026-10-15 ran by hand on Bruno's account (relatório "TESTE v0.2.0 — apagar").
  class: debt
  state: ~~open (owner: Matheus decides the production test company; then a batch builds the smoke)~~ closed (2026-10-15, batch co16a, `spec-14-10-carry-over-2-c.md`): Matheus chose option (a), a dedicated test company and user (`infra/production/smoke.tf`, password in Secrets Manager); `infra/bin/deploy` runs the `smoke-seed` reset, the suite `e2e/production/production.smoke.ts` and the cleanup after every deploy (`--skip-smoke` opts out)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-10-carry-over-2-a.md`
  summary: The `tools` service now mounts the container engine socket (read with GET requests only by `scripts/preflight.ts`) with SELinux label separation off for that one-off container, which gives a gate container engine access on a local stack. A read-only socket proxy in front of it would remove that access; open question 3 of the spec.
  evidence: `docker-compose.yml` `tools` service (`/var/run/engine.sock`, `security_opt: label=disable`); `scripts/preflight.ts`. The api suite's `generation-time.integration.test.ts` reads the api's `generate timing` log lines through the same socket (`serviceLog`, GET only) for its per-stage targets. With no socket it asserts the totals only.
  class: decision
  state: ~~open (owner: Matheus: keep the direct mount or put a read-only proxy in front)~~ decided 2026-10-15 (Matheus): keep the direct mount; it serves the local gate only

## Deferred from: Stories 14.9 and 14.11, batch c17 (2026-10-20)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-9-14-11-qgbt-oil-dry.md`
  summary: The SELV/PELV mark of a Quadro elétrico is a plate field ("Circuito SELV/PELV", select SIM/NÃO, optional), not a `block/{id}/config` option as `epics.md` proposed; SIM picks `>= 0,25 MΩ` whatever the voltage. Conservative reading of Matheus's open question; a config option would be structure, not field content.
  evidence: `packages/domain/src/seed/v6.ts` `quadroNameplate`; `relatorio/reading-evaluation.ts` `bandCriterion`.
  class: question
  state: ~~open (owner: Matheus, listed in the PR)~~ decided 2026-10-21 (Bruno via Matheus, answer 1): the yes/no plate field is kept; SELV and PELV mean a circuit voltage up to 120 V d.c. or 50 V a.c., per NBR 5410. Its help text and a non-blocking notice when it reads SIM above 50 V are Story 14.14 (backlog)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-9-14-11-qgbt-oil-dry.md`
  summary: A QGBT whose TENSÃO NOMINAL is empty, not a positive number or above 1000 V has no criterion: no verdict on its four rows, "critério não avaliado" on the sheet, ACEITÁVEL MΩ "-" and "CRITÉRIO: critério não avaliado · NBR 5410" in the document, and no "Sem restrições" suggested over its readings. The pre-issue check does not name the missing TENSÃO NOMINAL beyond the plate's own missing count; the typed TENSÃO ENSAIO is never checked against the band.
  evidence: `relatorio/reading-evaluation.ts` `CRITERION_NOT_EVALUATED`; `relatorio/conclusion.ts` `suggestConclusionPair`; `print/section-9.ts` `instrumentPart`.
  class: question
  state: ~~open (owner: Matheus, listed in the PR)~~ partially closed 2026-10-21 (Bruno via Matheus, answers 2 and 3): an empty or above-1000 V TENSÃO NOMINAL staying "critério não avaliado" is confirmed, no change; the TENSÃO ENSAIO check against the band is wanted only when the instrument photo is sent (non-blocking notice on a mismatch, "not checked" without the photo), owner Story 14.14 (backlog)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-9-14-11-qgbt-oil-dry.md`
  summary: The oil crossing's "N itens de óleo apagados" counts each oil item that held a result, an observation or a photo once, and VOL. ÓLEO once ("2 itens" for one answered item with its photo and VOL. ÓLEO). A write that copies the plate ("Igual à ⟨TAG⟩?", "Copiar da última visita") or confirms a reading carries the crossing in its batch but keeps its own toast. A crossing is read on the device's photos as last drawn (`snapshot.files`), the blocks fresh.
  evidence: `relatorio/oil-rule.ts` `oilCrossingClearedCount`; `apps/web/src/surfaces/ficha/ficha-ops.ts` `withOilCrossing`; `nameplate-section.tsx`, `nameplate-suggestions.tsx`.
  class: decision
  state: open (owner: Bruno reviews the toast wording, listed in the PR)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-9-14-11-qgbt-oil-dry.md`
  summary: Narrowings kept by the spec's Never list: no option typed by hand on MEIO DE EXTINÇÃO or as an NC chip (Story 14.12), no per-equipment screen label or editable type name (Stories 14.6 and 14.7), photos of an oil item untied and never deleted, an NC photo's `reading_target` never rewritten, the seccionadora's medium unchanged.
  evidence: spec Boundaries & Constraints; `epics.md` Stories 14.9, 14.11 and 14.12.
  class: debt
  state: open (owner: Story 14.12 and the company-types stories)  *(2026-10-21, Bruno via Matheus, answers 4, 8 and 9: no value is typed on MEIO DE EXTINÇÃO at all, the medium becomes a fixed list with "Outro" in Story 14.14 and leaves Story 14.12, whose typed values are the NC phrases and FABRICANTE; the per-equipment screen label is closed, TAG only; the type's own name editable by the office stays with Stories 14.6 and 14.7)*

- source_spec: `_bmad-output/implementation-artifacts/epic-batch-orchestrator.md`
  summary: 2026-10-20, coordinator: the second root-owned-file breakage from the `tools` container running with `--user root`. After the 2026-10-14 `.vite-temp` crash loop, the main stack's `install` service (user `node`) failed with ERR_PNPM_CMD_SHIM_CHMOD on `node_modules/.pnpm/esbuild@0.25.12/...` owned by root, which stopped a wave gate before it ran; `chown -R node:node /workspace/node_modules` fixed it. Root cause: gate runs as root write into the shared `node_modules` volume.
  evidence: the 2026-10-20 wave gate log (`install` exit 1); `docker-compose.yml` `tools` service; the playbook's `--user root` rule.
  class: debt
  state: open (owner: the next carry-over batch: run `tools` as `node`, or chown the volume back on exit, and assert it in `scripts/preflight.ts`)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-9-14-11-qgbt-oil-dry.md`
  summary: 2026-10-20, coordinator: PR #148's review patched 8 findings in one loop with no second review over the patches (listed in its PR body under "patched, not re-reviewed"); the batch recommends a follow-up review. Also `apps/web/src/components/quantity-stepper.tsx` keeps the deferred `select()` with no cancel on blur that PR #149 fixed in the Position box.
  evidence: PR #148 and #149 bodies.
  class: verification-gap
  state: open (owner: the Epic 14 integrated review, with the quantity stepper in the next carry-over batch)

## Deferred from: Story 14.12, learned company options (2026-10-21)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-12-learned-options.md`
  summary: The site checklist (Verificações do local) learns nothing: an NC observation typed on a site item stays a recent of its relatório only, never a company option (answer 7 scopes learned phrases per equipment type and item). Whether site items learn too is open.
  evidence: `apps/web/src/surfaces/local/verificacoes-surface.tsx` `siteRowTarget` (`ncChipPhrases` with no learned rows); `apps/api/src/sync/apply.ts` `learnPushedOptions` reads `sheet/...` paths only.
  class: decision
  state: open (owner: a later dated decision by Matheus or Bruno)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-12-learned-options.md`
  summary: A partial text may be learned. The observation field commits after 500 ms of idle typing and a push runs every 60 s (or on "Sincronizar agora"), so a push can carry a half-typed observation ("Fuga no buj") and the server learns that piece; the settled text learns too on the next push. The office removes the stray phrase in Cadastros › Frases de NC; a removed phrase is never learned again.
  evidence: `apps/web/src/surfaces/ficha/ficha-fields.tsx` `useTypedText` (idle commit); `packages/domain/src/registry/nc-phrase-row.ts` `learnedOptionCandidates` (reads the end-of-push row).
  class: debt
  state: open (owner: Bruno's first real job with the feature; a fix would learn only from a sheet left or concluded)

- source_spec: `_bmad-output/implementation-artifacts/spec-14-12-learned-options.md`
  summary: The refusal branches of `learnPushedOptions` (a learned create that does not validate is skipped; a refused savepoint is logged and the push still commits) have no test that forces a refusal; the precedent `upgradePushedTemplates` has the same gap. Closing it needs a fault-injection seam for both post-passes.
  evidence: `apps/api/src/sync/apply.ts` `learnPushedOptions` and `upgradePushedTemplates` catch blocks; Verification Gap review of Story 14.12.
  class: verification-gap
  state: open (owner: the Epic 14 integrated review)

## Deferred from: UX pass fixes (2026-10-22)

- source_spec: `_bmad-output/implementation-artifacts/spec-ux-pass-fixes-2026-10-22.md`
  summary: F28 of the 2026-10-22 hands-on pass: an insulation reading's unit defaults by block type (Disjuntor, TC and Transformador in GΩ; cables and para-raio in MΩ, as FO.SERV-03 prints them, F41 reclassified form-faithful), so moving from a GΩ sheet to a MΩ one can type a value 1000x off with nothing said. A one-line hint when the default differs from the previous sheet's unit, or a sanity hint for an absurd value, is a content decision for Bruno (also whether cables should ever default to GΩ).
  evidence: `_bmad-output/test-artifacts/manual/ux-pass-2026-10-22.md` F28 and F41; `rev1.pdf` p.17 vs p.8 (gitignored evidence).
  class: decision
  state: open (owner: Bruno, relayed by Matheus)

- source_spec: `_bmad-output/implementation-artifacts/spec-ux-pass-fixes-2026-10-22.md`
  summary: A template or relatório whose Conclusão carries its own text (Story 11.4 `section_text`) still prints the literal "itens 8 e 9"; the v8 results-reference variable is not offered for insertion, so the office cannot fix such a text from the composer.
  evidence: review finding 5 (blind hunter); `INSERTABLE_SECTION_VARIABLES` excludes the section variables by design. Settle with Bruno whether custom Conclusão texts should get the variable or a pre-issue warning.
  class: decision
  state: open (owner: Bruno, relayed by Matheus)
- source_spec: `_bmad-output/implementation-artifacts/spec-ux-pass-fixes-2026-10-22.md`
  summary: A ratio row's INSATISFATÓRIO verdict feeds only the screen and the printed sheet; the conclusion suggestion, the pre-issue rows and the parecer count never read it, so a sheet can still be concluded Aprovado / Sem restrições over a failed ratio (the UX pass F42 case).
  evidence: review finding 7; `condicao` consumers are `ensaios-section.tsx` and `print/section-9.ts` only. Pre-existing: the suggestion engine reads insulation and contact verdicts, not ratio rows.
  class: bug
  state: ~~open (owner: next fix batch)~~ ~~scheduled (2026-10-27, Bruno's answer 6: yes; Story 17.5, Epic 17 wave A)~~ closed (2026-10-27, Story 17.5, batch e17b: `failedRatioRows` (`reading-evaluation.ts`) is the one reader of the ratio verdict; `suggestConclusionPair` reads it explicitly, `restrictionWarning` names the row, `parecer.ts` `restricted()`, the parecer sentence and its Critérios item count it; the pre-issue `conclusion_stale` row already fired through the basis, now tested. Verified while building: the suggestion and the composed text already read the capture's `out` verdict since F42; the real gaps were the warning and the parecer)
- source_spec: `_bmad-output/implementation-artifacts/spec-ux-pass-fixes-2026-10-22.md`
  summary: The P2/P3 findings of the 2026-10-22 hands-on pass (F1–F3, F5, F7–F15, F18–F27, F30–F39, F44–F50) are recorded only in `_bmad-output/test-artifacts/manual/ux-pass-2026-10-22.md`; they need triage into stories or a later fix batch.
  evidence: review finding 8; the report is the backlog source until then.
  class: backlog
  state: ~~open (owner: Matheus)~~ open since 2026-10-22 (owner: Matheus, the triage into stories or the next epic's carry-over batch; dated 2026-11-03, E15-A1: untriaged as a list since the pass, while Epics 16 to 19 took single findings from Bruno's feedback)
- source_spec: `_bmad-output/implementation-artifacts/spec-ux-pass-fixes-2026-10-22.md`
  summary: With TAP Nº now read from the plate, a transformer ratio row is named by a number ("5, V primário"); the dictation parser (`parse/utterance.ts` `tableDictationLabel`) may take that leading number as the value.
  evidence: review finding 17, unverified (maybe-false, medium if true). Settle with a dictation parse test over a row named "5".
  class: verification-gap
  state: ~~open (owner: next fix batch)~~ open (owner: Story 13.9, dictation on behind one line of consent, in the backlog since 2026-10-21; dictation reaches no user before it, so its build adds the parse test over a row named "5"; re-owned 2026-11-03, E15-A1: `parse/utterance.test.ts` still has no such case)

## Deferred from: Stories 15.3 and 15.6, seed v9 and the ratio with √3 (2026-10-22)

- source_spec: `_bmad-output/implementation-artifacts/spec-15-3-15-6-seed-v9-ratio.md`
  summary: A company template with a dry (EPÓXI or Á SECO) TP, TC or Transformador de força keeps `indicador_nivel_de_oleo` in that block's `na_defaults`; seed v9 drops the item, so the template fails v9's row check and `templateSeedUpgrade` leaves it on v8 (Story 14.3: only `seed_version` moves). Relatórios made from it are born on v8, without the two new site items, the TC change or the √3 ratio. The standard template has no dry subtype and moves. Options: a data step that filters the dropped key out of `na_defaults` while moving, or leave such templates on v8.
  evidence: `packages/domain/src/templates/from-relatorio.test.ts` "Story 15.3: a v4/v8 template with a dry transformer ... fails v9 and stays"; `epic-15-context.md` defaults (Bruno answer 1 pending).
  class: decision
  state: ~~open (owner: coordinator / Bruno answer 1)~~ closed, moot (2026-11-03, E15-A1: Matheus recorded on 2026-10-23 under Story 15.6 in `epics.md` that "the dry-template migration is moot: the production migrate task of v0.3.0 moved all 7 templates to v9 and skipped none"; no production template is left on v8)

## Deferred from: Stories 15.4 and 15.5 (2026-10-22)

- source_spec: `_bmad-output/implementation-artifacts/spec-15-4-15-5-voltar-coluna-add.md`
  summary: No back target leads to `/relatorio/:id/arvore` any more (Story 15.4), but its phone presentation (the rail drawn full width) still renders when the address is typed or deep-linked. Remove the phone presentation, or the route below 768 px, if it is not wanted.
  evidence: `apps/web/src/app.tsx` keeps the route for the rail and deep links; `relatorio.css` keeps the `/relatorio/:id/arvore` phone rules.
  class: backlog
  state: ~~open (owner: a later story)~~ open (owner: Matheus decides whether the phone presentation stays; if it goes, the next epic's carry-over batch removes it (playbook § 6, E6-A7); re-owned 2026-11-03, E15-A1: the route still renders, `apps/web/src/app.tsx:158`)
- source_spec: `_bmad-output/implementation-artifacts/spec-15-4-15-5-voltar-coluna-add.md`
  summary: From 1024 px a coluna's "Adicionar equipamento" follows the local button's toggle literally: since a coluna's body shows only while it is the target, the press always releases it and closes the row. Whether it should instead keep the target (idempotent) or be hidden where the palette is inline is open.
  evidence: spec Design Notes; `template-composer.tsx` `onAddEquipamento`.
  class: decision
  ~~state: open (owner: Matheus)~~
  state: done (2026-10-23, fix batch fx15q: idempotent from 1024 px, Matheus)

## Deferred from: fix batch fx15q, Epic 15 follow-up (2026-10-23)

- source_spec: `_bmad-output/implementation-artifacts/spec-fix-epic-15-decisions.md`
  summary: With only automatic points the Sumário's row 8 reads "N automáticos" (Matheus, 2026-10-23), but the Points surface heading still reads "Pontos de atenção (0 + N automáticos)"; the same wording rule belongs there.
  evidence: PR #174 open question; `apps/web/src/surfaces/points/points-surface.tsx` heading, kernel text in `points/summary.ts`.
  class: bug
  state: ~~open (owner: the next fix batch)~~ open (owner: the next epic's carry-over batch, playbook § 6, E6-A7; re-owned 2026-11-03, E15-A1: fx15q, fx17r and the 2026-10-29 fix batches did not take it, and `pointsHeadingText` (`packages/domain/src/points/summary.ts:147-151`) still answers "(0 + N automáticos)" with no live point); ~~assigned 2026-11-10 to Epic 24, Story 24.7~~ superseded 2026-11-10 (evening) by fix batch e24h (no automatic points): the heading and the Sumário's row 8 count stored points only, so neither has an "automáticos" part; e24h closes it

## Deferred from: Epic 16 integrated QA browser pass (2026-10-26)

Source: `_bmad-output/test-artifacts/manual/qa-e16-2026-10-26.md` (verdict pass; no P1, no P2; the three P3 gaps below). The tablet soft keyboard limit of Story 16.4 is not listed here: it is a product decision recorded under the story in `epics.md` (candidate Story 16.5).

- source_spec: `_bmad-output/implementation-artifacts/spec-16-4-na-in-number-fields.md`
  summary: After a plate reading on a nameplate field holding N.A, the "Manter o digitado" button's accessible name ends with the bare unit ("… Potência nominal, kVA") instead of "N.A" (QA G1).
  evidence: QA report G1; the kept-value name is composed where the suggestion row reads the stored number, so the `not_applicable` state needs its own text there.
  class: bug
  state: ~~open (owner: the next fix batch)~~ ~~scheduled (2026-10-27: Story 17.3 fixes the kept-value name with the N/A control and spelling)~~ closed (2026-10-27, Story 17.3, batch e17b: `suggestionValueText` (`relatorio/suggestion-ops.ts`) reads the `not_applicable` state first and answers `NOT_APPLICABLE_TEXT`, so the name reads "Manter o digitado em Potência nominal, N/A")
- source_spec: `_bmad-output/implementation-artifacts/spec-16-2-16-3-revision-banner-display-shots.md`
  summary: The remove confirm on a "Ler visor" display shot still says "A foto sai da galeria e da seção 3", while since Story 16.3 the Registro fotográfico never holds display shots (QA G2).
  evidence: QA report G2; the confirm sentence is one static string for every photo, so the display shot needs its own sentence (kernel text, AD-1).
  class: bug
  state: ~~open (owner: the next fix batch)~~ ~~scheduled (2026-10-27: Story 17.1 takes every sheet photo out of section 7, so the confirm sentence changes for every sheet photo there, display shots included)~~ closed (2026-10-27, batch e17a, `spec-17-1-17-4-section-7-by-hand-display-shots-numbered.md`: `photoRemoveDescription` in `packages/domain/src/photos/gallery.ts` composes the sentence by where the photo prints: a Geral photo names section 7 (or the gallery alone when the relatório lacks it), a sheet's photo "a ficha do equipamento", a local's site-item photo "as verificações do local"; `display-shots.spec.ts` asserts the sheet sentence on a display shot)
- source_spec: `_bmad-output/implementation-artifacts/spec-16-4-na-in-number-fields.md`
  summary: "Altitude do site" (Dados do relatório, Etapa 5) is a native number input, so `n.a` is dropped without a word and the sheet's read-only Altitude can never hold N.A (QA G3). Story 16.4 names the cabine fields but its AC does not name this setup field; whether altitude should take N.A is a product question for Matheus.
  evidence: QA report G3; `inputmode` and `type="number"` on the setup field.
  class: question
  state: ~~open (owner: Matheus; then a story line under 16.4 or the next fix batch)~~ ~~scheduled (2026-10-27, Bruno's answer 4: N/A, or the phone's position; Story 17.6, Epic 17 wave B, contract 27)~~ closed (2026-10-28, Story 17.6, batch e17c, `_bmad-output/implementation-artifacts/spec-15-7-17-6-tc-checklist-seed-v10-altitude-na.md`: the field keeps `type="number"`, takes N/A from the shared "N/A" control (`site_altitude_na`) and says when the device gave no altitude; the sheet's read-only Altitude and the document read "N/A")
- source_spec: `_bmad-output/implementation-artifacts/spec-17-1-17-4-section-7-by-hand-display-shots-numbered.md`
  summary: A relatório whose latest revision predates Stories 17.1 and 17.4 and that holds sheet, local or display-shot photos shows "Números da revisão N" in the gallery while its badges read the new document-order numbers, which that revision's document does not carry (the 16.3 drift again, in the other direction). A revision stores no numbers; the unchanged snapshot is what freezes them, so the label is right again at the next revision.
  evidence: `photoNumbersStatusText(latest, edited)` and `numberPhotos(snapshot)` in `gallery-surface.tsx`; the rule changed, the snapshot did not.
  class: known-open
  state: open (owner: ends by itself at the next revision of each such relatório; a line under Story 17.4 if Bruno notices)
- source_spec: `_bmad-output/implementation-artifacts/spec-17-2-17-7-device-camera-app-save-to-device.md`
  summary: With "Câmera do aparelho" on, two quick "Ler visor" taps (the second before the first photo's row landed in the snapshot) compute the same start cell, so both display photos would target row 0; the viewfinder burst counts its shots locally and never does.
  evidence: `read-display.tsx` `target()` recomputes `displayBurstStart` from the snapshot at every press; the picker path has no per-session counter. Unverified whether a user can tap again before the commit lands (camera app round trip plus encode, 1-3 s). The sequential two-tap e2e (17.2-E2E-001) is green.
  class: known-open
  state: ~~open (owner: a timed two-tap run on a tablet at the Epic 17 QA; a guard would advance `start.current` locally after each pick)~~ re-owned (2026-10-28, E17-A6: the Epic 17 QA ran on a desktop browser; owner Bruno's tablet session, E17-A3, a timed two-tap run; the guard is the same)
- source_spec: `_bmad-output/implementation-artifacts/spec-17-2-17-7-device-camera-app-save-to-device.md`
  summary: The viewer fetches the server's original of every uploaded photo it lands on when this device holds no original (so "Salvar no aparelho" shares inside the press's activation on iPadOS), so paging through evicted photos on mobile data downloads every original even when the action is never pressed.
  evidence: `photo-viewer.tsx` `useSaveFile` runs `photoSaveFile` on landing; the viewer already fetches the `print` variant for its picture, so the original is a second, larger download per photo.
  class: question
  state: open (owner: Matheus; keep the prefetch, fetch on the press (a share after the await may fall back to a download on iPadOS), or serve the picture and the save from one fetched original)
- source_spec: `_bmad-output/implementation-artifacts/spec-17-2-17-7-device-camera-app-save-to-device.md`
  summary: A touch-screen laptop or desktop (`navigator.maxTouchPoints > 0`) defaults to the camera app, where `capture` is ignored and a file picker opens instead of the webcam viewfinder.
  evidence: The default rule is the 2026-10-27 decision (touch points); the Conta switch is the remedy on such a machine.
  class: question
  state: open (owner: Matheus; a `(pointer: coarse)` media query would refine the default)

## Deferred from: Epic 17 integrated QA browser pass (2026-10-28)

Source: `_bmad-output/test-artifacts/manual/qa-e17-2026-10-28.md` (verdict pass; no P1, no P2; the two P3 gaps below). The items the report lists as known open (Sumário row 7 count, gallery order, "VASAMENTO" spelling, the altitude hint on a denied geolocation permission) are Matheus's decisions recorded under the stories in `epics.md`, not rows here.

- source_spec: `_bmad-output/implementation-artifacts/spec-17-3-17-5-na-control-failed-ratio.md`
  summary: On an EPÓXI (or a seco) TC the "N/A" control is still offered beside Vol. óleo, an oil field the oil rule already excuses: the tap stores `not_applicable` and the field shows "N/A" at rest while the document prints "VOL. ÓLEO -" by the rule's design, and the field was never counted as missing (QA G1). A typed "n.a" did the same since 16.4; the control makes it one tap away.
  evidence: QA report G1, `preview-1.txt` line 400; `oil-rule.ts` ("an oil field of a non-oil unit: shown excused, never missing, printed '-'") against `acceptsNotApplicable` in `ficha-fields.tsx`.
  class: bug
  state: ~~open (owner: the next fix batch; either hide the control on an excused oil field or print the stored "N/A")~~ ~~scheduled (2026-10-28, E17-A6: fix batch fx17r, E17-A1; one predicate shared by the oil rule and `acceptsNotApplicable`)~~ done (2026-10-28, fix batch fx17r: the kernel's `nameplateAcceptsNotApplicable`, the negation of `isNameplateFieldExcused` that `nameplateMissingKeys` reads, drives the plate's `acceptsNotApplicable`; `oil-rule.test.ts`, `nameplate-oil-rule.test.tsx`, 14.11-E2E-001)
- source_spec: `_bmad-output/implementation-artifacts/spec-17-3-17-5-na-control-failed-ratio.md`
  summary: The Ensaio de relação cells' accessible names start with a comma while TAP atual is blank (`textbox ", V primário"`, `", H1-H3 / X1-X0"`); after TAP atual is typed they read "5, V primário" (QA G2). The visible table is right. Pre-existing, untouched by 17.5.
  evidence: QA report G2; the row label composes the TAP value and the separator before the column name without a blank-TAP case.
  class: bug
  state: ~~open (owner: the next fix batch)~~ ~~scheduled (2026-10-28, E17-A6: fix batch fx17r, E17-A1)~~ done (2026-10-28, fix batch fx17r: the kernel's `measurementCellName` names a cell by its column alone while the row has no label; `readings.test.ts`, 17.5-E2E-001)

## Deferred from: Epic 17 retrospective, integrated code review (2026-10-28)

Source: `_bmad-output/implementation-artifacts/epic-17-retro-2026-10-28.md` § Diff-scope review (three lenses over `9f0df21b..3beacd40`; 18 reported, 13 confirmed). The four fix-now findings (R4, R5, R11, R18) go to fix batch fx17r (E17-A1) with QA G1 and G2 above and carry no row; the three folded into Matheus's decisions (R7, R8, R9, R12) are dated questions under their stories (E17-A2). The rows below are the deferred confirmed findings and the one e17a spec item that had no row.

- source_spec: `_bmad-output/implementation-artifacts/spec-17-1-17-4-section-7-by-hand-display-shots-numbered.md`
  summary: The viewer's remove confirm on a local's site-item photo ("…e das verificações do local…") is verified only by the kernel test (`photoRemoveDescription` M12), never through the viewer (e17a VGR-1).
  evidence: e2e covers the sheet and Geral sentences through the viewer; the local sentence depends on the tile carrying `location_id`. One viewer-remove step in `verificacoes-local.spec.ts` 14.3-E2E-001 at its next change.
  class: test-gap
  state: open (owner: the next batch that changes `verificacoes-local.spec.ts`)
- source_spec: `_bmad-output/implementation-artifacts/spec-17-2-17-7-device-camera-app-save-to-device.md`
  summary: The "Ler visor" exhausted-target guard runs only with "Câmera do aparelho" on (`camera-session.tsx:160`, `if (cameraApp && …)`); with it off and no `getUserMedia` (the pre-17.2 fallback picker), the file chooser opens where the viewfinder disables its shutter, and the picked photo lands as a plain sheet photo (retro R1).
  evidence: `camera-session.tsx:156-166`; pre-existing path, rare (a desktop without a camera, every cell read).
  class: bug
  state: ~~open (owner: fix batch fx17r if its scope allows, else the next camera batch; drop the `cameraApp &&` so the guard covers both picker paths)~~ open (owner: the next epic's carry-over batch, playbook § 6, E6-A7; re-owned 2026-11-03, E17-A6: fx17r (PR #199) finished without it and the guard still reads `if (cameraApp && …)` at `camera-session.tsx:162`; the fix is the same)
- source_spec: `_bmad-output/implementation-artifacts/spec-17-2-17-7-device-camera-app-save-to-device.md`
  summary: A camera-app HEIC whose `heicToJpeg` rejects (decoder chunk unavailable offline, decode error) is lost with the failure toast; the `capture` input keeps no copy in the device's camera roll (retro R3).
  evidence: `camera-single-shot.tsx:125-141`. iOS answers a file input with JPEG by default, so the case needs a device set to keep HEIC. Cheapest guard: an authored toast that says to take the photo again; a fuller one keeps the raw file in the outbox for a later conversion.
  class: bug
  state: open (owner: Bruno's tablet session confirms the HEIC device case (E17-A3), then the next camera batch)
- source_spec: `_bmad-output/implementation-artifacts/spec-17-2-17-7-device-camera-app-save-to-device.md`
  summary: `useCameraApp` is called by `useCamera`, which every opener instantiates, so a ficha holds one `local_prefs` live query per opener and each answers `cameraAppDefault(points)` until its query lands; a tap in the first instants after mount can take the camera app for a user who switched it off (retro R6).
  evidence: `use-camera-app.ts:31-34`, `camera-session.tsx:75`. One session-level read (a provider beside the theme, or a field on `useSession()`) removes both the subscriptions and the window.
  class: improvement
  state: open (owner: the next camera batch; measure the window on a tablet first)
- source_spec: `_bmad-output/implementation-artifacts/spec-17-2-17-7-device-camera-app-save-to-device.md`
  summary: `photoFileName` names the saved JPEG by the stamp to the second, so two photos of one second saved to the device share a name and the OS suffixes or asks (retro R10).
  evidence: `packages/domain/src/photos/save.ts:39-45`. A disambiguator (the photo's document number when numbered, else a sequence) in `PhotoSaveRow`.
  class: improvement
  state: open (owner: the next batch touching `photos/save.ts`)
- source_spec: `_bmad-output/implementation-artifacts/spec-17-1-17-4-section-7-by-hand-display-shots-numbered.md`
  summary: Gallery numbers come from the snapshot and tiles from a separate query, so for one render after a shot a tile can draw no badge and the viewer read "Foto" before "Foto 12 de 12"; no test pins the convergence (retro R13).
  evidence: `gallery-surface.tsx:117-120`, `photo-viewer.tsx:160-163`. A component test rendering a tile absent from the snapshot, then the snapshot update.
  class: test-gap
  state: open (owner: the next gallery batch)

## Deferred from: production pass, epic by epic (2026-10-28)

Source: `_bmad-output/test-artifacts/manual/prod-pass-2026-10-28.md` (v0.4.0 on `app.fasorengenharia.com.br`, the smoke test company, three successive Playwright MCP passes: 17 epics, 186 checks held, 38 not checkable from a desktop browser, 11 gaps). G6 is the one feature that does not work in production and is Matheus's decision; G8 goes to the next fix batch; the P3 rows wait for the next batch touching their surface.

- source_spec: `services/ocr/app/detector.py`
  summary: "Ler visor" never reads in production: every display photo fails after three attempts with `ResourceExhaustedError: Fail to alloc memory of 5648154624` in the PP-OCRv5 server text detector of the sidecar on the 4 GiB `t3a.medium`; the photo was 1200 x 900 px, so it is the server model's CPU memory, not the image. No display read was ever attempted in production before 2026-10-28 (CloudWatch, 14 days). The "Digitar" path keeps the sheet usable (prod-pass G6, P1).
  evidence: `/fasor/production/ocr` log; `prod-pass-2026-10-28.md` § "Coordinator's diagnosis of G6"; `infra/README.md` memory risk note; `t3a.large` would add about USD 22 per month and cross the USD 100 ceiling.
  class: bug
  state: ~~open (owner: Matheus decides between (1) `PP-OCRv5_mobile_det` in the sidecar with the display accuracy tests re-run, (2) display reading through Bedrock vision with the sidecar off in production, (3) a lower `OCR_DET_LIMIT_SIDE_LEN` by Terraform, unproven; then one batch and a deploy)~~ done (2026-10-29, fix batch fxg6: option 1, `PP-OCRv5_mobile_det` serves `/read/display` and `/read` (the plate tests held 43 of 43 words, 16 of 16 values) and the server model left the image; the display working copy is capped at 1200 px a side (`MAX_DISPLAY_SIDE`) because a 2000 x 1500 print was OOM-killed on the mobile detector under the cap. Under a 1536 MiB cgroup limit on the amd64 image: the unchanged image OOM-killed on one 1200 x 900 display read (`oom_kill 1`, pytest exit 137), the fixed one passed `tests/test_display.py` with two 2000 x 1500 prints (11 passed, `memory.peak` 1187180544) and a uvicorn print read (1238253568); full suite 48 passed, peak 1811865600. Production needs the deploy, on Matheus's word)
- source_spec: `_bmad-output/implementation-artifacts/spec-9-5-nc-drafts.md`
  summary: A long learned NC phrase chip (66 characters) renders 490 px wide and makes the whole sheet scroll sideways at 390 px (`scrollWidth` 505 against 375) (prod-pass G8, P2).
  evidence: `prod-pass-2026-10-28.md` Epic 9 G8, screenshot `e9-*`; the chip has no max width or wrap rule.
  class: bug
  state: ~~open (owner: the next fix batch; a max width with ellipsis or wrapping on the chip row, checked at 390 px)~~ done (2026-10-29, fix batch fxpw: `app.css` wraps the learned NC chip inside its pill, the other chip rows keep `nowrap`; e2e `learned-options.spec.ts` 14.12-E2E-004 at 390 px)
- source_spec: `_bmad-output/implementation-artifacts/spec-1-6-home-and-account.md`
  summary: One console error `merge pairs of a pull failed` on the first load of an empty device (the "Dados deste aparelho foram apagados" recovery screen); "Baixar do servidor" then worked and the error never recurred (prod-pass G1, P3).
  evidence: `prod-pass-2026-10-28.md` Epic 1 G1.
  class: bug
  state: ~~open (owner: the next sync batch; reproduce on a fresh profile against production)~~ done (2026-10-29, fix batch fxpw: the sync engine waits for the boot read (`SessionState.settled`), so it never runs on a cached pointer's database the server replaces with another user's; `session.test.tsx`, `sync.test.tsx`; e2e `durability.spec.ts` 1.8-E2E-004 (no console error) and 1.8-E2E-007)
- source_spec: `_bmad-output/implementation-artifacts/spec-3-4-compose-template.md`
  summary: The template composer's sections palette "+" adds a section the template already holds (a second "1 Objetivo" at position 10); removable through "Mais opções > Remover" (prod-pass G2, P3).
  evidence: `prod-pass-2026-10-28.md` Epic 3 G2.
  class: bug
  state: ~~open (owner: the next template batch; the palette hides or disables a section already in the template)~~ done (2026-10-29, fix batch fxpw: a held section reads "No template" in "Seções" and a tap writes nothing and toasts "{N Título} já está no template" (`42-template-composer.html` L186-194, `heldSectionTypes`); `template-composer-palette.test.tsx`; e2e `templates.spec.ts` 3.4-E2E-003)
- source_spec: `_bmad-output/implementation-artifacts/spec-6-3-gallery-captions.md`
  summary: Importing a photo as "Geral" with no caption toasts "1 foto adicionada — legenda aplicada" while the gallery counts it "1 sem legenda" (prod-pass G3, P3).
  evidence: `prod-pass-2026-10-28.md` Epic 6 G3; the toast text does not read the caption state.
  class: bug
  state: ~~open (owner: the next gallery batch; kernel toast text by caption state)~~ done (2026-10-29, fix batch fxpw: `photosImportedText` takes the caption: "… — sem legenda" with none; `gallery.test.ts`; e2e `gallery.spec.ts` 6.4-E2E-010)
- source_spec: `_bmad-output/implementation-artifacts/spec-5-2-cabine-characteristics.md`
  summary: The cabine's "Tensão secundária" refuses `380/220` ("Número não reconhecido") although the seeded sample carries exactly that value in the same field (prod-pass G4, P3).
  evidence: `prod-pass-2026-10-28.md` Epic 5 G4; the seed writes a text the field's parser does not accept.
  class: question
  state: ~~open (owner: Matheus: a number with one value, or a text field for the pair; then the seed or the parser)~~ done (2026-10-29, fix batch fxpw: `secondary_kv` accepts the pair (`acceptsVoltagePair`, `parseVoltagePairPtBr`), stored as typed, printed "380/220 V"; goldens unchanged; e2e `sheet-knows-12-3-12-4.spec.ts` 12.3-E2E-003)
- source_spec: `_bmad-output/implementation-artifacts/spec-7-x-export-dialog.md`
  summary: The Sumário chip reads "2 de 96 fichas concluídas" while the parecer hint reads "1 de 96 fichas concluídas, 1 não ensaiada" (prod-pass G5, P3).
  evidence: `prod-pass-2026-10-28.md` Epic 7 G5; two readers count a Não ensaiada sheet differently.
  class: bug
  state: ~~open (owner: the next Sumário batch; one kernel count for both)~~ done (2026-10-29, fix batch fxpw: `sheets_concluded` excludes a not-tested sheet, `sheets_handled` keeps the remaining-work readers; one-snapshot test in `parecer.test.ts`; e2e `ficha.spec.ts` E5-Q18e)
- source_spec: `_bmad-output/implementation-artifacts/spec-11-9-11-11-completions.md`
  summary: No "Sugerir TAG para Coluna 9?" offer after "Mover para…" (SEC-C01 kept its TAG in Coluna 9) (prod-pass G7, P3).
  evidence: `prod-pass-2026-10-28.md` Epic 11 G7.
  class: question
  state: ~~open (owner: Matheus: is the re-suggestion expected after a move; then the next tree batch)~~ done (2026-10-29, fix batch fxpw: no product defect (the pass clicked "Mover" without reading the dialog, which asks "Sugerir TAG para Coluna 9?"); pin `move.test.ts` SEC-C01 to Coluna 9 = SEC-C09; e2e `move-block.spec.ts` 11.2-E2E-001/002 as evidence)
- source_spec: `_bmad-output/implementation-artifacts/spec-10-2-sync-status.md`
  summary: Merge-by-rule rows ("… mesclado") never shown in Sync status after a C-versus-NC merge between two devices (prod-pass G9, P3).
  evidence: `prod-pass-2026-10-28.md` Epic 10 G9.
  class: bug
  state: ~~open (owner: the next sync batch)~~ done (2026-10-29, fix batch fxpw: no product defect (the pass's unexact "Conforme" locator wrote different items, and reloads clear the engine's merges by design); pin `engine.test.ts` nc_over_c entry and its row text; e2e `merge.spec.ts` 10.1-E2E-001 as evidence)
- source_spec: `_bmad-output/implementation-artifacts/spec-fix-epic-17-retro-and-qa-gaps.md`
  summary: A pending "Verificar" suggestion stays offered on Vol. óleo after EPÓXI excused the field (prod-pass G10, P3); the fx17r predicate hides the N/A control but not the pending suggestion row.
  evidence: `prod-pass-2026-10-28.md` Epic 8 G10.
  class: bug
  state: ~~open (owner: the next plate batch; `isNameplateFieldExcused` also filters the suggestion rows)~~ done (2026-10-29, fix batch fxpw: `nameplateSuggestions` and `livePendingSuggestions` skip a field `isNameplateFieldExcused` excuses, the row kept pending; `oil-rule.test.ts`; e2e `oil-dry.spec.ts` 14.11-E2E-004)
- source_spec: `_bmad-output/implementation-artifacts/spec-6-1-capture-sheet.md`
  summary: "Cancelar" on the capture sheet's equipment step keeps the picked photo as Geral (toast "1 foto ficou como Geral, sem legenda"); the toast says it is intended, so it may be a wording question (prod-pass G11, P3).
  evidence: `prod-pass-2026-10-28.md` Epic 17 G11.
  class: question
  state: ~~open (owner: Matheus: keep as Geral or discard on Cancelar)~~ done (2026-10-29, fix batch fxpw: the photos stay as Geral and the toast offers "Desfazer", which removes the batch in one batch (`removePhotos`); `photo-ops.test.ts`; e2e `gallery.spec.ts` 6.4-E2E-008)

## Deferred from: fix batch fxpw review (2026-10-29)

Source: `_bmad-output/implementation-artifacts/spec-fix-prod-pass-fxpw.md` § Review Triage Log (Edge Case Hunter and Verification Gap Reviewer). Both pre-existing; neither changed by the batch.

- source_spec: `_bmad-output/implementation-artifacts/spec-fix-prod-pass-fxpw.md`
  summary: An offline boot with one user's cached pointer and another user's session cookie settles as unreachable on the pointer's database, and once online the sync engine pushes and pulls with that cookie into it (the G1 mix by the offline path).
  evidence: `apps/web/src/state/session.tsx` boot effect, `'unreachable'` branch (unchanged by fxpw); needs a cookie changed outside the app's sign-in, as the production pass's persistent MCP profile had (ECH-3).
  class: bug
  state: open (owner: the next session or sync batch; re-read the session on the first `online` event before the engine's first push)
- source_spec: `_bmad-output/implementation-artifacts/spec-fix-prod-pass-fxpw.md`
  summary: The Sumário header leaves out a concluded sheet held by a pending suggestion on this device, while the Etapa 6 parecer hint and summary count it as concluded (G5 aligned the not-tested reading only).
  evidence: `packages/domain/src/relatorio/progress.ts` `over()` (Story 8.1 held rule) against `parecer.ts` `parecerCounts` (snapshot only, no device suggestion rows) (ECH-11, VGR).
  class: question
  state: open (owner: Matheus: whether the parecer counts a held sheet as concluded, or the header counts it)

## Deferred from: fix batch fxg6 review (2026-10-29)

Source: `_bmad-output/implementation-artifacts/spec-fix-prod-pass-fxg6.md` § Review Triage Log (Verification Gap Reviewer, VG-4). The fix lies in `apps/api` and `packages/domain`, which the batch could not touch.

- source_spec: `_bmad-output/implementation-artifacts/spec-fix-prod-pass-fxg6.md`
  summary: The kernel and api display tests still replay tokens the sidecar produced on `PP-OCRv5_server_det`, and `services/ocr/tests/test_display.py` checks only that each expected number appears, so the confidences and row placement the mobile detector now produces (what `displayValues` uses for the unit token and the 0.5 trust threshold) are not checked at the kernel's level.
  evidence: `packages/domain/src/reading/display.test.ts` "recorded sidecar reads" and the `apps/api` job-display fixtures (`fixtures/README.md`) predate the swap; the mobile read of `display-tres-valores` spells the units `GO`/`GO`/`GO` where the recording has `GO`/`GD`/`GD` (all three map to GΩ, `display.ts:28`).
  class: test-gap
  state: open (owner: the next batch touching display reading; re-record the fixtures from the mobile sidecar and let the existing kernel and job tests judge them)

## Deferred from: fix batch fxrm (2026-10-29)

Source: `_bmad-output/implementation-artifacts/spec-fix-prod-remove-test-data-fxrm.md` (Never: no `apps/web` behavior change).

- source_spec: `_bmad-output/implementation-artifacts/spec-fix-prod-remove-test-data-fxrm.md`
  summary: There is no "Remover relatório" or "Remover projeto" in the UI; test or mistaken relatórios and obras can only be removed by the server's one-shot cleanup (`apps/api/src/db/tombstone-cli.ts`). The op family `relatorio/removed_at` (contract 28) now exists, and `project/{id}/removed_at` already did, so a surface needs no new contract.
  evidence: fix batch fxrm, Intent "The app has no Remover for a relatório or a project"; runbook `infra/README.md` "Remove test data from a company".
  class: question
  state: open (owner: Bruno and Matheus: whether the product offers the removal, to whom, for which statuses, and with what undo)
- source_spec: `_bmad-output/implementation-artifacts/spec-fix-prod-remove-test-data-fxrm.md`
  summary: The family `relatorio/removed_at` is not server-only (coordinator decision), so a contract-28 client that crafts a push could tombstone an emitido relatório; the "never an emitido relatório" rule lives only in the cleanup CLI. No app surface writes the family today.
  evidence: `packages/domain/src/ops/path.ts` family entry (no `serverOnly`); `apps/api/src/sync/apply.ts` `validate` has no status rule for it; review of fix batch fxrm, Edge Case Hunter.
  class: debt
  state: open (owner: the batch that builds a "Remover relatório" surface: refuse it on an emitido relatório in the push route, or make the family server-only until then)

## Deferred from: the production re-check and Matheus's asks of 2026-10-29

Source: `_bmad-output/test-artifacts/manual/prod-pass-2026-10-28.md` § "Re-check after the fix deploy (2026-10-29)" and `_bmad-output/implementation-artifacts/backlog-2026-10-29-home-nav-and-telemetry.md`.

- source_spec: `_bmad-output/implementation-artifacts/spec-fix-prod-pass-fxpw.md`
  summary: The chip row "Observações sugeridas do item N" offers a learned NC phrase twice: the registry's normalized name (no closing period) and this device's recent text (with the period); recents and learned phrases are not deduplicated across the trailing period or the registry normalization (production re-check 2026-10-29, G8 steps, P3).
  evidence: `prod-pass-2026-10-28.md` § Re-check, TR-1 item 1 after the 66-character observation on TR-TEST synced; chip sources in `packages/domain/src/registry/nc-phrase-row.ts` (Stories 9.5 and 14.12).
  class: bug
  state: open (owner: the next ficha batch; dedupe a recent against the learned phrases with the registry's normalization); assigned 2026-11-10 to Epic 24, Story 24.6; ~~open~~ closed 2026-11-11 by batch e24b (Story 24.6, `spec-e24b-screen-lane.md`): `ncChipPhrases` compares a phrase without its final period
- source_spec: `_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/EXPERIENCE.md`
  summary: Home with many relatórios buries the Templates and Cadastros shortcuts under the card list (Matheus, 2026-10-29); Sally's options and recommendation (fold Emitido behind its chip, shortcuts above the list) in `backlog-2026-10-29-home-nav-and-telemetry.md` § 1, with two questions for Bruno.
  evidence: `20-home.html` section order (status chips, cards, "Atalhos"); production Home on 2026-10-29 already puts the shortcuts below the fold at 390 px with two relatórios.
  class: question
  state: ~~open (owner: Matheus and Bruno decide the option; then a UX amendment and a story)~~ re-owned (2026-10-30, Matheus: "Fazer: B. Atalhos acima da lista": Story 19.1 built from main, EXPERIENCE.md § Home and the two Home mocks amended; the list at scale as he described it, Sally's option A plus the mocks' cap, drafted as Story 19.2 with its Definition of Ready waiting for his word; Bruno's volume answers still open)
- source_spec: `_bmad-output/planning-artifacts/architecture/architecture-fasor-2026-09-21/ARCHITECTURE-SPINE.md`
  summary: Record every user interaction to find friction (Matheus, 2026-10-29): Amelia's analysis and recommendation (an offline event queue in IndexedDB flushed with the sync to `POST /api/telemetry`, a dedicated CloudWatch Logs group queried with Logs Insights, no free text, 90 days, cents a month) in `backlog-2026-10-29-home-nav-and-telemetry.md` § 2, with three stories and an architecture amendment (a second local write kind outside the op log).
  evidence: the op log records every data edit but no navigation, cancel, retry, disabled tap or wait; CloudWatch holds only the api, ocr, caddy, migrate and smoke groups.
  class: debt
  state: ~~open (owner: Matheus approves the amendment, the LGPD wording and the three stories for a coming epic)~~ closed (2026-11-03, E18-A3: Matheus approved the amendment (AD-28, planning PR #211) and the three stories, built as Epic 18 (PRs #212, #213) and deployed on 2026-10-30 as `3b45e83c` (smoke 8 of 8, `epic-18-context.md`); only the LGPD wording stays open, carried by the Conta row "Uso do aplicativo" (`// authored (Epic 18, open for Bruno)`) and E18-A5 item 5)

## Deferred from: Epic 18 batch o18a (Stories 18.1 and 18.2, 2026-10-29)

Source: `_bmad-output/implementation-artifacts/spec-epic-18-o18a.md`.

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-18-o18a.md`
  summary: The CloudWatch sink timestamps each log event with the event's own `ts` (Story 18.2, the spec's rule). `PutLogEvents` refuses a whole batch whose events span more than 24 hours and rejects events older than 14 days or more than 2 hours in the future, so a device that queued events offline across two days (or with a wrong clock) loses that batch: the api logs `ux_event_sink_failed` once and still answers 204, and the device deletes the batch.
  evidence: `apps/api/src/telemetry/sink.ts` `cloudWatchSink` (one put per batch, `timestamp = Date.parse(event.ts)`); AWS PutLogEvents limits; the device flushes oldest first in batches of 200 (`apps/web/src/telemetry/flush.ts`).
  class: risk
  state: ~~open (owner: Matheus decides before the first digest: split a batch by 24 h windows, or timestamp with `received_at` and keep `ts` in the message)~~ done (2026-10-29, o18a review: each log event is timestamped with the batch's server `received_at`, the device `ts` stays in the message; one put per batch)
- source_spec: `_bmad-output/implementation-artifacts/spec-epic-18-o18a.md`
  summary: Narrowed instrumentation: a control pressed from the keyboard (Enter or Space on a React Aria button) may queue no `action`, since the listener reads the native click; `wait` of kind `generate` and `preview` times the request, not the job until the document is ready; a natively `disabled` control queues `disabled_tap` only where the browser dispatches `pointerdown` to it (the app's own Button uses `aria-disabled`, which always does); "Renomear TAG" is tracked from the sheet only, not from the Sumário tree; `upload` waits are not tracked.
  evidence: `apps/web/src/telemetry/instrument.ts`, `apps/web/src/state/sync.tsx` (`generate`, `preview`), `apps/web/src/surfaces/ficha/ficha-dialogs.tsx`.
  class: debt
  state: open (owner: Story 18.3's first friction read says which of these the funnel needs; 2026-10-30, first production read: the first preview took 26.8 s on the screen and 176 ms in the `waits` view, so the `preview` and `generate` kinds of that view read the request, not the wait, until a story times them until the document opens; `reading` and `sync` are right, `epic-18-context.md`) 2026-10-30, Matheus's "pode fazer": the re-timing of the `preview` and `generate` waits is owned by Story 18.4 (`epics.md`), the keyboard activation note stays with E18-A1. *(2026-11-03, batch s184, Story 18.4: the `preview` and `generate` part is done: both waits time the press, `use-preview.ts` until the tab is pointed at the PDF and `use-generate.ts` until the ready revision is held, one wait per press across the `not_caught_up` retries; `sync.tsx` keeps only their error codes; the `document_waits` view reads them by `app_version`. The other parts of this row stay as they were.)*
- source_spec: `_bmad-output/implementation-artifacts/spec-epic-18-o18a.md`
  summary: Targets beyond the epic's minimum list were added where the minimum names none: `photos.add` ("Adicionar fotos"), `export.retry` (the Export dialog's "Tentar novamente", a `retry`) and `toast.undo` (every "Desfazer", an `undo`); the Export dialog's foot button "Gerar relatório" is `sumario.export` and the dialog's own "Gerar relatório" is `sumario.generate`. The CloudWatch stream is `api/<start instant>/<pid>` with the instant's colons written as `-` (CloudWatch refuses `:` in a stream name).
  evidence: `apps/web/src/surfaces/ficha/photo-openers.tsx`, `apps/web/src/surfaces/export/export-dialog.tsx`, `apps/web/src/components/toast.tsx`, `apps/api/src/telemetry/sink.ts` `logStreamName`.
  class: question
  state: ~~open (owner: the o18b dashboard and saved queries read these names; the coordinator confirms or renames before the deploy)~~ done (2026-10-30, first production read after the deploy of `3b45e83c`: the `actions` saved query lists these targets as any other; names kept, `epic-18-context.md`)
- source_spec: `_bmad-output/implementation-artifacts/spec-epic-18-o18a.md`
  summary: The per-device telemetry limit (1 000 events a minute) is keyed on `user:device_id`, and the device id is the client's own claim, so one signed-in user can spread events over many ids and pass the limit (review ECH-4); a refused batch from two devices also spends the first device's window (ECH-5, rejected: a real client sends its own id only).
  evidence: `apps/api/src/http/telemetry.ts` consumes `${userId}:${device_id}` per group; the DoR of Story 18.2 names a per-device limit; a per-user aggregate key beside it would close the gap.
  class: risk
  state: open (owner: the coordinator decides whether a per-user aggregate limit is worth adding; only signed-in users can post)

## Deferred from: Story 19.2 review (2026-10-30)

- source_spec: `_bmad-output/implementation-artifacts/spec-19-2-home-opens-on-the-active-work.md`
  summary: The Home usage events cannot tell which Status board tile was pressed or which page size was chosen: all four tiles share the target `home.status_chip`, the four chips share `home.page_size`, and the event has no value field.
  evidence: Review BH-4 (2026-10-30): `uxEventSchema` is strict with no value; the digest can count tile and chip taps per session, not the Emitido presses or the sizes. A target per tile (`home.status_chip_<status>`) and per size would be appended to `UX_ACTION_TARGETS` (Epic 18's kernel-first rule) in a story, with the `actions` view reading them; the Story 19.2 DoD sentence was narrowed with the date.
  state: ~~open (owner: Story 18.4, the targets per tile and per size; 2026-10-30, Matheus's "pode fazer")~~ done (2026-11-03, batch s184: `home.status_chip_<status>` and `home.page_size_<size>` appended to `UX_ACTION_TARGETS` with `homeStatusTileTarget` and `homePageSizeTarget`; the tiles and the chips carry them, the shared names stay in the kernel for old bundles; `e2e/home.spec.ts` asserts one `action` per tile and size pressed)
- source_spec: `_bmad-output/implementation-artifacts/spec-19-2-home-opens-on-the-active-work.md`
  summary: Relatórios past the 100th of a selection are unreachable from Home: the largest page is 100 and there is no next page or search.
  evidence: Review ECH-2 and BH-6 (2026-10-30): `homeList` slices at the page size and `HOME_PAGE_SIZES` ends at 100 (Matheus's sizes); a company with more than 100 emitted relatórios reaches the oldest from the Project surface only. EXPERIENCE.md § Home names that way in; a next page or a search (option D of the 2026-10-29 analysis) waits for Bruno's volume answers.
  state: closed (2026-11-03, Story 20.2, batch e20w: Home searches every relatório of the company by client and obra, every status with no tile pressed, so a relatório past the 100th is one query away; `homeList`'s `query`, `HomeCard.searchKeys`; `e2e/home.spec.ts` searches past the page size)

## Deferred from: the Epic 19 deploy (2026-10-30)

- source_spec: `_bmad-output/implementation-artifacts/epic-19-context.md`
  summary: `infra/bin/check` is red on the operator's machine at its `terraform init -backend=false` step for both stacks ("No valid credential sources found", the S3 backend's message) while every other step passes; the check is documented as needing no AWS login.
  evidence: Run of 2026-10-30 before the Epic 19 deploy (`.scratch-prodfix/check-29f030b2.log`): fmt, validate, tflint, caddy validate, the fallback origin secret and shellcheck `ok`, `FAILED: terraform init bootstrap` and `FAILED: terraform init production`. Both stack directories hold a `.terraform/terraform.tfstate` written on 2026-10-05 by a real init with the S3 backend, and the container has no credentials; a plain `infra/bin/tf production init` (with the login session) and `plan` ran green the same minute. ~~To decide: let the check pass `-reconfigure` with `-backend=false`, run it in a scratch copy of the stack directory, or mount the login session for that one step. Owner: the next infrastructure batch (E18-A2 or later).~~
  state: done (2026-11-03, batch e18fb: `infra/bin/check` runs `init -backend=false` and `validate` with `TF_DATA_DIR=.terraform/check`, a data dir of its own under each stack, and `infra/bin/tf` passes `INFRA_TF_DATA_DIR` into the container as `TF_DATA_DIR` (a dedicated name, so an operator's exported `TF_DATA_DIR` never reaches the deploy); the operator's `.terraform/terraform.tfstate` is never read or changed. Proved on a copy of `infra/` with the main checkout's S3-backend `terraform.tfstate` in both stacks: the old check `FAILED: terraform init bootstrap` and `production` with "No valid credential sources found", the new one `all passed`, the state file byte for byte the same; `infra/README.md` § Checks)

## Deferred from: the deploy of 2026-11-03 (54b11947)

- source_spec: `_bmad-output/implementation-artifacts/epic-18-context.md`
  summary: The production smoke's step 6 ("preview the PDF") can fail right after a roll with the preview tab closed before the preview request is observed; the deploy then exits 1 without rolling back and the suite has to be re-run by hand.
  evidence: Deploy of 2026-11-03 (`.scratch-prodfix/deploy-54b11947.log`, artifacts in `.scratch-prodfix/smoke-fail-54b11947/`): `page.waitForRequest: Target page, context or browser has been closed` at `e2e/production/production.smoke.ts:270`, 24 s into the run, steps 1 to 5 green, no preview request of the smoke company in the api log; the same suite 8 of 8 minutes later (`.scratch-prodfix/smoke-rerun-54b11947.log`). The web closes the tab it opened when the preview fails or times out on the device; what failed on the device side was not captured. To decide: the step retries once after a fresh `page.goto`, or the suite captures the device's error toast and console on failure; an automatic re-run of the suite in `infra/bin/deploy` is open question Q-1 of 2026-10-15.
  class: risk
  state: ~~open (owner: the next infra batch, E18-A2 or E15-A10)~~ done (2026-11-03, batch e18fb: step 6 presses the preview through `previewRequest` (`e2e/production/preview-tab.ts`), which retries once, and only when the tab closed before the preview request was seen: it records the dialog's failure line and the page's console errors to `test-results/production-smoke/preview-retry.json` and the log, closes the dialog, reloads the Sumário and presses once more; a second close fails the step with the first error, any other error at once; the eight steps and every assertion unchanged. Unit test with fakes `scripts/preview-tab.test.ts`. The suite's own re-run by the deploy stays open question Q-1)

## Deferred from: batch e18fa (2026-11-03)

- source_spec: `_bmad-output/implementation-artifacts/spec-e18fa-code-fix-batch.md`
  summary: The end-to-end half of R-E3 (a tap on a read-only checklist segment queues a `disabled_tap`) cannot be observed in a browser: `.is-readonly .tri-state { pointer-events: none; }` (the locked `components.css:817`, repeated in `ficha.css:28`) sends the tap to the row beneath, so no `[data-telemetry]` control receives the `pointerdown`.
  evidence: Batch e18fa: the instrument treats a control inside `[aria-readonly="true"]` as disabled (`instrument.ts` `isDisabled`) and the unit test proves it in jsdom, where no stylesheet applies; the `E5-A2-E2E-004` assertion the spec asked for was not written, since it would fail on every project. To decide: accept the unit coverage, or let the read-only group take pointer events (an `app.css` mirror of the mock rule without `pointer-events: none`, the Tri-state's own guard already refusing the press), which is a look-and-behaviour change for Sally and Matheus.
  class: risk
  state: open (owner: Matheus decides; the coordinator records it in the PR)
- source_spec: `_bmad-output/implementation-artifacts/spec-e18fa-code-fix-batch.md`
  summary: The reading watcher no longer sees a photo whose only change reached this device through a snapshot download rather than the pulled op log (`remote_ops`), nor a photo of another device that arrives through a stream whose cursor lags the highest pulled `seq` (photos pending at the last look are read by key, and photos shot here through the outbox since review fix ECH-4, so both cases are photos this device never waited for).
  evidence: R-A14 narrowing (`telemetry/readings.ts`): after the baseline, a look reads the photos pending at the last look and the `file` entities named by `remote_ops` rows above the last seen `seq`. A relatório downloaded as a snapshot writes entities without `remote_ops` rows, so a reading that lands that way is not tracked; a photo pending at the last look is still read by key. Spec Design Notes.
  class: risk
  state: open (owner: Story 18.4, if the first digest shows reading waits missing) *(2026-11-03, batch s184: Story 18.4 was built before the first digest, so this row is the first digest's to raise; owner then the next epic's carry-over batch.)*
- source_spec: `_bmad-output/implementation-artifacts/spec-e18fa-code-fix-batch.md`
  summary: A 401 on `POST /api/telemetry` still deletes the batch (only 429 was named for keeping), so a session that expires with a full queue loses it.
  evidence: `telemetry/flush.ts` `drain`: kept on a 5xx, a network failure, a timeout and a 429; deleted on every other 4xx, 401 included (Q1 of Story 18.1). The retro's production read saw one 401 batch dropped after `prodpass.sh cleanup`. Open question of the PR.
  class: risk
  state: open (owner: Matheus decides; Story 18.4 if kept) *(2026-11-03, batch s184: no decision yet, so Story 18.4 left the 401 rule as it was; the runbook says a 401 drops the batch.)*
- source_spec: `_bmad-output/implementation-artifacts/spec-e18fa-code-fix-batch.md`
  summary: A session id rotated for a second user in the same tab queues no `session_start` of its own, so the `sessions` views count it only through `count_distinct(session_id)` of its other events.
  evidence: R-A15 (`telemetry/track.ts` `configureTelemetry`): the id rotates when the database name differs from the last one; no event is queued on rotation (spec Design Notes). Open question of the PR.
  class: question
  state: ~~open (owner: Story 18.4)~~ done (2026-11-03, batch s184: the rotation queues the new session's `session_start` with its device context first, then the held events; the first configure of a load queues none, `track.test.ts`)
- source_spec: `_bmad-output/implementation-artifacts/spec-e18fa-code-fix-batch.md`
  summary: Structural block puts (`location_id`, `order_key`, `removed_at`, `feeds_block_id`) left the friction read's spans and re-edits but still count in `device_op_count`.
  evidence: R-A16 (`apps/api/src/db/friction-read.ts`): the item named spans and re-edits only. Whether the device op count should drop them too is an open question of the PR.
  class: question
  state: open (owner: Matheus decides at the first digest, E18-A7)
- source_spec: `_bmad-output/implementation-artifacts/spec-e18fa-code-fix-batch.md`
  summary: The friction read's "typed after a failed reading" compares the device's `client_ts` with the server's `received_at` of the failure (R-A17), so a device clock running behind the server never counts a value typed after the failure, and one running ahead counts a value typed offline while the reading still ran.
  evidence: Review ECH-3 of batch e18fa (2026-11-03): `apps/api/src/db/friction-read.ts` `foldFriction` (`ts > photo.armed.failedAt`); the comparison is the one E18-A1 prescribed. A skew window, or the put's own `received_at` against the failure's, would bound it.
  class: risk
  state: open (owner: the first digest, E18-A7, reads the count beside the device clocks it can see)

  state: ~~open (owner: the next infra batch, E18-A2 or E15-A10)~~ done (2026-11-03, batch e18fb: step 6 presses the preview through `previewRequest` (`e2e/production/preview-tab.ts`), which retries once, and only when the tab closed before the preview request was seen: it records the dialog's failure line and the page's console errors to `test-results/production-smoke/preview-retry.json` and the log, closes the dialog, reloads the Sumário and presses once more; a second close fails the step with the first error, any other error at once; the eight steps and every assertion unchanged. Unit test with fakes `scripts/preview-tab.test.ts`. The suite's own re-run by the deploy stays open question Q-1)

## Deferred from: the Epic 18 retrospective and the ledger hygiene of Epics 15 to 17 (2026-11-03, batch e18fd)

Source: `epic-15-retro-2026-10-26.md` (E15-A1: R15-13, R15-14), `epic-16-retro-2026-10-26.md` (E16-A5: R16-14, R16-17, R16-18), `epic-17-retro-2026-10-28.md` (E17-A6: F13, F15) and `epic-18-retro-2026-10-30.md` (E18-A3: P7, A3, R-A2, R-A5, R-A6, R-A12, R-A13, R-E4, the `test:e2e:full` red of Behavior verification). Rows that already existed were re-owned or closed in place with a dated note above. Owner "the next epic's carry-over batch" is the first batch of the next epic, which takes the agent-closable ledger rows of earlier epics (`epic-batch-orchestrator.md` § 6, E6-A7); the coordinator reads these rows when it cuts that batch. Epic 16's third spec `deferred:` item (a tablet's soft numeric keypad cannot type N.A, `spec-16-4-na-in-number-fields.md`) has no row on purpose: it was a product decision recorded under Story 16.4 in `epics.md`, answered by Bruno on 2026-10-27 and built as Story 17.3 (E16-A1 closed). Epic 17's remaining owners are scheduled items (Bruno's tablet session E17-A3, the next batch touching a named file); no Epic 17 row is owned by a finished event after the R1 re-owning above.

- source_spec: `_bmad-output/implementation-artifacts/spec-15-2-tree-levels.md`
  summary: A collapsed local, painel or coluna shows no NC indicator, so a band closed in the Sumário tree hides that a sheet under it holds an open NC (PR #167 "Known open"; the as-built line under Story 15.2 says "(known open)").
  evidence: PR #167 body § Known open ("The mocks draw none on bands; the header's 'NC abertos' tap opens the path to the sheet"); `epics.md:4016`; `epic-15-retro-2026-10-26.md` R15-13. The bands draw `ncBadge` for the site card and for sheets only (`apps/web/src/surfaces/relatorio/relatorio-tree-rail.tsx:80,121`).
  class: known-open
  state: open (owner: Matheus, with Bruno at his tablet session (E17-A3): whether a collapsed band needs an indicator the mocks do not draw; if yes, the next epic's carry-over batch, the count derived in the kernel's tree, AD-1)
- source_spec: `_bmad-output/implementation-artifacts/spec-16-2-16-3-revision-banner-display-shots.md`
  summary: A relatório whose last revision predates Story 16.3 and holds display shots showed its gallery numbers as the revision's while they no longer matched that revision's document (spec `deferred:` item 1, PR #181 "Known open").
  evidence: spec frontmatter `deferred:` (`gallery-surface.tsx:126` at the time); `epic-16-retro-2026-10-26.md` R16-14 and R16-18 (the row was never written).
  class: known-open
  state: closed into the Story 17.1 and 17.4 row of § Epic 16 integrated QA browser pass above (2026-11-03, E16-A5): Story 17.4 numbered display shots again and Story 17.1 changed the order, so any relatório whose latest revision predates 17.1 and 17.4 shows the drift that row describes; it ends by itself at the next revision of each such relatório
- source_spec: `_bmad-output/implementation-artifacts/spec-16-2-16-3-revision-banner-display-shots.md`
  summary: A ponto de atenção that cited a display shot before Story 16.3 printed "imagem removida" in section 8, because a token without a number resolved to `REMOVED_PHOTO_REF_TEXT` (spec `deferred:` item 2).
  evidence: spec frontmatter `deferred:` (`section-8.ts:72` at the time); `epic-16-retro-2026-10-26.md` R16-13 and R16-18.
  class: question
  state: closed (2026-10-28, Story 17.4, batch e17a, PR #190, `0bdd925a`: Bruno's answers 1 and 5 of 2026-10-27; a display shot is numbered again, so a cited display shot prints "Imagem N"; a photo deleted since keeps "imagem removida" (confirmation 6 of the Epic 17 preamble); E16-A2 closed; recorded 2026-11-03, E16-A5)
- source_spec: `_bmad-output/implementation-artifacts/spec-16-2-16-3-revision-banner-display-shots.md`
  summary: The point editor's photo picker applied the kernel's display-shot rule a second time in `apps/web` (`tile.reading_kind !== 'display'` at `point-editor.tsx:741`, the 16.3 ECH-5 patch), while the cross-story table named one filter, `numberPhotos`, for every reader (low).
  evidence: `epic-16-retro-2026-10-26.md` R16-17; `spec-16-2-16-3-revision-banner-display-shots.md:143`.
  class: debt
  state: closed (2026-10-28, Story 17.4, `0bdd925a`: the filter is gone; the picker offers display shots like any photo, `apps/web/src/surfaces/points/point-editor.tsx:725,740`; recorded 2026-11-03, E16-A5)
- source_spec: `_bmad-output/implementation-artifacts/spec-epic-18-o18b.md`
  summary: The friction read loads every op row of the company into memory at once (`readFriction` selects all ops of the company ordered by `seq` and folds them in memory); fine for the one-shot CLI at today's volume, a large company would need paging by `seq`.
  evidence: spec frontmatter `deferred:` (severity low); `apps/api/src/db/friction-read.ts` `readFriction` (one repeatable-read transaction over the relatórios, blocks and ops); `epic-18-retro-2026-10-30.md` P7 (i).
  class: debt
  state: open (owner: the first monthly digest, E18-A7 on 2026-11-30, which is the read's first production run: it records the run time and the task's memory; paging by `seq` becomes a carry-over item only if that run nears the migrate task's memory)
- source_spec: `_bmad-output/implementation-artifacts/spec-epic-18-o18a.md`
  summary: One unknown event refuses the whole telemetry batch with `400 telemetry_invalid` and the device deletes it, so a bundle and an api that disagree on a closed list (the minutes of a deploy) lose that device's batch (retro R-A2, confirmed by design).
  evidence: `apps/api/src/http/telemetry.ts:61-63`, `apps/web/src/telemetry/flush.ts:64-65` (line numbers of `3b45e83c`); `epic-18-retro-2026-10-30.md` R-A2. The rule that keeps the window short (names, kinds and targets are appended, never removed or renamed within a release) belongs in `docs/observability.md` § Adding an event name, the E18-A3 docs part owned by this wave's observability lane.
  class: risk
  state: open (owner: the first monthly digest, E18-A7: count the api's `telemetry_invalid` answers in `/fasor/production/api` over the month; a per-event parse (keep the valid events, drop the unknown) is cut as a story only if the count is not zero outside deploy minutes)
- source_spec: `_bmad-output/implementation-artifacts/spec-epic-18-o18a.md`
  summary: Two tabs of one device share one telemetry queue and can both post the same oldest rows, since the in-flight guard is module state per tab (retro R-A5, plausible); rare on a tablet PWA, possible on a desktop review.
  evidence: `apps/web/src/telemetry/flush.ts:33-35` (line numbers of `3b45e83c`); `epic-18-retro-2026-10-30.md` R-A5. Fix: Web Locks (`navigator.locks.request`) around the drain.
  class: risk
  state: open (owner: the next epic's carry-over batch, playbook § 6, E6-A7; the digest can see duplicates as two rows with one `ts`, `session_id` and `name`)
- source_spec: `_bmad-output/implementation-artifacts/spec-epic-18-o18a.md`
  summary: The beacon awaits an IndexedDB read before `navigator.sendBeacon`, so a tab closed at once may hand nothing to the browser; the rows are not lost (they go with the next sync) but can land on a later day (retro R-A6, plausible). The `pagehide` listener is E18-A1's one-line fix; this row is the deferred half, a synchronous in-memory mirror of the unsent rows the beacon can send without awaiting.
  evidence: `apps/web/src/telemetry/flush.ts:110-118`, `apps/web/src/telemetry/instrument.ts:59-66` (only `visibilitychange` listened to); `epic-18-retro-2026-10-30.md` R-A6.
  class: improvement
  state: open (owner: the next epic's carry-over batch, after E18-A1 adds `pagehide`; measure first at the digest whether late rows show, `received_at` days after `ts`)
- source_spec: `_bmad-output/implementation-artifacts/spec-epic-18-o18a.md`
  summary: Two api processes started in the same millisecond would share one CloudWatch stream name (`api/<start instant>/<pid>`), since the name is the start instant and the pid (retro R-A12).
  evidence: `apps/api/src/telemetry/sink.ts:34-35` `logStreamName`; one api task in production, and two processes of one task cannot share a pid.
  class: risk
  state: accepted (2026-10-30, Epic 18 retrospective: not reachable in practice; recorded 2026-11-03, E18-A3, no owner)
- source_spec: `_bmad-output/implementation-artifacts/spec-epic-18-o18a.md`
  summary: One `sync_result` row and one `POST /api/telemetry` per `ran` cycle: the engine runs a cycle every 60 s while the tab is visible and every 5 s while a reading is pending, and an empty outbox still pulls, so the `syncs` view is dominated by idle cycles and is read as ratios, not counts (retro R-A13; per Story 18.1's criterion "`sync_result` per finished cycle"). About 500 rows and 500 requests a day per active device, within the cost line.
  evidence: `apps/web/src/state/sync.tsx` `observeCycle` (`:257-262` at `3b45e83c`); `apps/web/src/sync/engine.ts:164,173`; first production read of 2026-10-30 (23 `ran` rows in fifteen minutes on one device, 19 in one minute on the smoke runner); `epic-18-retro-2026-10-30.md` R-A13.
  class: decision
  state: open (owner: Matheus, E18-A5 item 2, after the first digest (E18-A7) measures the share of `sync_result` rows: keep one row per ran cycle, or amend Story 18.1 to transitions and cycles that moved data)
- source_spec: `_bmad-output/implementation-artifacts/spec-epic-18-o18a.md`
  summary: The `reading` wait counts from the shot's `captured_at`, so offline time and a failed first attempt inflate it, and a re-read ("Ler de novo") measures from the original shot, not from the re-read tap (retro R-E4, accepted as Story 18.1's "shot stored to result").
  evidence: `apps/web/src/telemetry/readings.ts:49-52`; `epic-18-retro-2026-10-30.md` R-E4. The runbook caveat ("reading waits count from the shot") is the E18-A3 docs part in `docs/observability.md`, owned by this wave's observability lane.
  class: improvement
  state: open (owner: Story 18.4, which re-times the waits (its scope item 5 times `preview` and `generate`) and extracts the observer around `sync.tsx` `rereadPhoto` (`:542`), where a re-read could stamp its own start for `readings.ts`; if 18.4 leaves it, the next epic's carry-over batch) *(2026-11-03, batch s184: Story 18.4 left it: the observer moved to `telemetry/sync-observer.ts` and `rereadPhoto` still tracks only its error code, so a re-read is still measured from the original shot; owner now the next epic's carry-over batch.)*
- source_spec: `_bmad-output/implementation-artifacts/spec-epic-18-o18a.md`
  summary: `apps/web/src/state/sync.tsx` grew from 522 to 631 lines and is now the telemetry observer of the engine as well as the owner of the sync state (`observeCycle`, `failureCode`, `failureOutcome`, `syncWaitOutcome`, the dead-op `trackError` effect, the waits of `syncNow`, `generate`, `preview` and `rereadPhoto`); the helpers belong in `apps/web/src/telemetry/sync-observer.ts` as pure functions, with `sync-telemetry.test.tsx` moving beside them (retro A3).
  evidence: `epic-18-retro-2026-10-30.md` A3 (`sync.tsx:245-275`, `:385-400`, `:460-552` at `3b45e83c`); `epics.md` Story 18.4 Definition of Ready scope item 5 ("with the `sync.tsx` observer extraction of retro finding A3 in the same change").
  class: debt
  state: ~~open (owner: Story 18.4, the same change that re-times `preview` and `generate`; closes E18-A5 item 3)~~ done (2026-11-03, batch s184: `observeCycle`, `failureCode`, `failureOutcome` and `syncWaitOutcome` are pure functions in `apps/web/src/telemetry/sync-observer.ts` with their cases in `sync-observer.test.ts`; `sync.tsx` imports them, its `generate` and `preview` no longer time a wait; closes E18-A5 item 3)
- source_spec: `_bmad-output/implementation-artifacts/epic-18-retro-2026-10-30.md`
  summary: `e2e/photo-numbers.spec.ts` `closeDialog` presses `Escape` after "Marcar como enviado ao cliente"; when the pressed button unmounts, focus falls to `body` and `Escape` can miss the Export dialog, which stays visible past the 5 s expectation (7.2-E2E-001 red once in the retrospective's `test:e2e:full`, green alone, 2 of 2).
  evidence: `e2e/photo-numbers.spec.ts:82-85`; `epic-18-retro-2026-10-30.md` § Behavior verification (`.scratch-prodfix/e2e-full-retro18.log`, the rerun `.scratch-prodfix/e2e-photo-numbers-rerun.log`); the spec and `dialog-shell.tsx` unchanged since 2026-10-13 and 2026-09-23.
  class: test-gap
  state: open (owner: the next epic's carry-over batch, or the first batch that touches `photo-numbers.spec.ts`: `closeDialog` focuses the dialog or presses its close control before `Escape`; a wave gate that sees it red again re-runs it alone per E15-A4 and links this row)

## Deferred from: the integrated review of Epics 15 and 16 (2026-11-03, E15-A5 and E16-A6)

Source: `_bmad-output/test-artifacts/review-e15-e16-integrated-2026-11-03.md` (main `0fede8ac`).

- **E15-R1, the rail's site card is named without its counter.** `apps/web/src/surfaces/relatorio/relatorio-tree-rail.tsx:67` sets the button's `aria-label` to the label, NC badge and name, which replaces the content, so "N de M" (`site.railCounter`) and the state word are never announced (the mock and the Sumário card carry the counter); both trees compose the "· ncBadge" in `apps/web` (also `relatorio-tree-sumario.tsx:116`) against Story 15.2's rule that every text is composed in `packages/domain`. Fix: the kernel site node exposes one accessible name used by both trees.
  state: open (owner: the next epic's carry-over batch)
- **E15-R2, the palette drawer's target is not announced on open.** `apps/web/src/surfaces/templates/block-palette.tsx:88` holds the target ("Toque para adicionar em: ...") in an `aria-live` paragraph mounted with the dialog, which screen readers usually skip; the drawer is named only "Blocos" since Story 15.5 (`:265-272`). Fix: `aria-describedby` on the drawer's `DialogShell` pointing at that paragraph.
  state: open (owner: the next epic's carry-over batch); assigned 2026-11-10 to Epic 24, Story 24.8 (only if the story edits `block-palette.tsx`; else it stays open); 2026-11-11: batch e24b did not edit `block-palette.tsx`, so the row stays open
- **E16-R1, an `unchanged` ready names an older revision.** `apps/web/src/surfaces/export/use-generate.ts:456-458`: the "anterior às alterações" banner and row tags are suppressed only while generating, so an `unchanged` answer whose revision is not pulled yet shows "Revisão N pronta" over "(revisão N-1). Alterações desde então geram a revisão N" (Story 16.2 AC 3). Fix: gate both on `readyHeld`, with a dialog test that delivers the job before the revision.
  state: ~~open (owner: batch s184, the Story 18.4 wave, which re-times the waits in the same file)~~ done (2026-11-03, batch s184: `beforeEdits`, and with it `beforeEditsBanner`, also require `readyHeld`; `export-dialog.test.tsx` "E16-R1" delivers an `unchanged` answer before its revision: no banner and no row tag, then the revision lands and both show; red without the gate)
- **E16-R2, a cabine environment display shot prints nowhere yet holds a photo number.** A temperature or humidity "Ler visor" shot on a local (`apps/web/src/surfaces/ficha/read-display.tsx:733`, `displayEnvTarget`) has no block and no item; Story 16.3 took display shots out of section 7 for sheets only and Story 17.4 kept this one unprinted and numbered last (`packages/domain/src/print/photo-order.ts:83-86`, `:112-113`; pinned by `section-9.test.ts:1169`). The evidence of AMBIENTE DE ENSAIO leaves the document and the gallery shows a "Foto N" no "Imagem N" carries. Options: print it under the cabine's characteristics or environment part, or leave it out of the numbering and say so in the gallery.
  state: open (owner: Matheus, with Bruno; then the next epic's carry-over batch)

## Deferred from: batch e18fb (2026-11-03)

- source_spec: `_bmad-output/implementation-artifacts/spec-e18fb-observability-and-tooling.md`
  summary: E15-A10, the deploy that died after the roll: diagnosed and fixed. The v0.3.0 deploy (2026-10-23) rolled the services, then the AWS CLI container lost `https://ecs.us-east-1.amazonaws.com/` during `aws ecs wait services-stable` (exit 255, "Could not connect to the endpoint URL"), and `set -euo pipefail` ended `infra/bin/deploy` before the tag record and the smoke; the cause is a transient network loss between the host's container VM and the AWS endpoint, not an AWS error, and nothing in the script retried or said how to finish.
  evidence: main checkout `.scratch-deploy/deploy-v0.3.0.log:762` (`aws: [ERROR]: Could not connect to the endpoint URL`, `DEPLOY_EXIT=255`); `epic-15-retro-2026-10-26.md` R15-9. Fix: `aws_retry` in `infra/bin/lib.sh` (exit 255 with a connection message only; 5 attempts 15 s apart by default) around the repeatable calls after the roll (the stable wait, `ssm get-parameter`, `ssm put-parameter --overwrite`, the one-shot polls; never `run-task`), an EXIT trap that prints `infra/bin/deploy --resume --tag <tag>` once the roll started and before the smoke finished, and `--resume` (no build, push, migrate or roll; a read-only check that every service runs the tag; then the wait, health, record and smoke). Tests: `scripts/deploy.test.ts` (the retry with a stub, the hint on a failed stable wait, `--resume` and its refusal of another tag).
  state: done (2026-11-03, batch e18fb; the next real deploy is the field proof: its log should show either no retry or `lost the AWS endpoint ... attempt n of 5` followed by the tag record)
- source_spec: `_bmad-output/implementation-artifacts/spec-e18fb-observability-and-tooling.md`
  summary: The deploy's usage-events check (`smoke: check the usage events`) is a warning, never a failure, in this release; it should fail the deploy once it has been green on a production run.
  evidence: `infra/bin/deploy` `check_usage_events`: N = 0 `session_start` with the tag, M > 0 `ux_event_sink_failed` or a read error print `deploy: warning: ...` and keep the exit; the coordinator's decision of 2026-11-03 (`epic-18-context.md` § Follow-up delivery) made it a warning for the first deploy that carries it. Turning it into a failure is a red smoke like the others (cleanup still runs, rollback hint printed) and changes `scripts/deploy.test.ts`'s warning cases.
  class: risk
  state: open (owner: the next infra batch, after the first deploy that prints `telemetry: N session_start ... ; 0 ux_event_sink_failed` with N >= 1)
- source_spec: `_bmad-output/implementation-artifacts/spec-e18fb-observability-and-tooling.md`
  summary: The ten views' new text (the smoke filter, `sessions_per_day` by `substr(ts, 0, 10)`, the group from its resource) and the app role without `logs:DescribeLogStreams` reach production only with the next `infra/bin/tf production apply` or deploy; the new query syntax has run offline only (`infra/bin/check`), not in Logs Insights.
  evidence: batch e18fb is offline by rule (no apply). The `users` view's `fields ... as ... | stats ... by` shape and `filter` chains already ran to `Complete` in production (2026-10-30), and `substr` is a documented Logs Insights string function, so the risk is low; the first read after the apply should open `sessions_per_day` and one filtered view and check they run to `Complete` and that the `smoke` row is gone from them.
  class: risk
  state: open (owner: the coordinator, at the deploy that carries the batch, on Matheus's word)
- source_spec: `_bmad-output/implementation-artifacts/spec-e18fb-observability-and-tooling.md`
  summary: A `--resume` of a deploy cut after its tag record (during the smoke) reads `previous_tag` equal to the tag, so a red smoke on that resume says "no earlier tag was recorded to roll back to; fix forward" instead of naming the tag before the deploy.
  evidence: `infra/bin/deploy` reads `previous_tag` from the image-tag parameter right before `put-parameter`; a first run that recorded the tag and then died leaves the parameter at the new tag. Review finding ECH-5 of batch e18fb. To decide: persist the pre-deploy tag (a file under `test-results/` or an SSM tag) or let `--resume` take `--previous-tag`.
  class: risk
  state: open (owner: the next infra batch)
- source_spec: `_bmad-output/implementation-artifacts/spec-e18fb-observability-and-tooling.md`
  summary: The smoke step 6 retry (`e2e/production/preview-tab.ts`) is unit-tested with fakes only; the `openTab` and `recover` callbacks the suite passes (press, Escape, reload the Sumário, reopen the dialog) run only against production.
  evidence: `scripts/preview-tab.test.ts` covers the retry decision; the suite has no local run. Review finding VGR-4 of batch e18fb. The next deploy whose preview tab closes early is the proof: its log line `pressing it once more` and `test-results/production-smoke/preview-retry.json`.
  class: risk
  state: open (owner: the coordinator, at the next deploy that shows the retry)

## Deferred from: the Epic 19 retrospective (2026-11-03, E19-A3)

- source_spec: `_bmad-output/implementation-artifacts/epic-19-retro-2026-11-03.md`
  summary: R-4: Home reads "no summary entry" as "created on this device", so a relatório removed on the server sorts right after the current card as the newest until its stream pulls and tombstones the local row.
  evidence: The summary leaves removed entities out (`isNull(entities.removed_at)`, `apps/api/src/sync/pull.ts:163`); `homeCards` sorts an undefined `updated_seq` first after the current card (Matheus's "A", `packages/domain/src/home/cards.ts` sort). Plausible, not exercised (retro adversarial 3a). Fix: mark the unsynced bucket with a positive signal, a pending `relatorio` create op in `outboxByRelatorio`, not with a missing sequence; a kernel test with a local row absent from the summary and no create op.
  class: risk
  state: open (owner: the next Home story or fix batch, after Matheus's E19-A1 decision on the order key)
- source_spec: `_bmad-output/implementation-artifacts/epic-19-retro-2026-11-03.md`
  summary: R-6: two kernel functions take a `filter` whose `null` means opposite things: every card in `homeCards`, the active statuses only in `homeList`; and `homeList` assumes its input is the unfiltered set (`cards.length === 0` decides `none`).
  evidence: `packages/domain/src/home/cards.ts` (`homeCards` returns `input.filter === null ? cards : ...`; `homeList` filters `HOME_ACTIVE_STATUSES` when `options.filter === null`); production passes `filter: null` to `homeCards` only (`apps/web/src/surfaces/home/home-surface.tsx`, `allCards`). Confirmed (retro adversarial 6). Fix: drop `filter` from `HomeCardsInput` (its tests move to `homeList`), or rename `homeList`'s option to `tile`, and document the input contract on `homeList`.
  class: debt
  state: open (owner: the next batch that touches `cards.ts`; Story 18.4 may take it if it edits `homeList`)
- source_spec: `_bmad-output/implementation-artifacts/epic-19-retro-2026-11-03.md`
  summary: R-10: the page size has no optimistic state, and a failed write is swallowed after the usage event was already counted.
  evidence: `selectedId` comes from IndexedDB through the live query only (`home-surface.tsx`, `pageSize` and the `FilterChipGroup`); `choosePageSize` does `void writeHomePageSize(db, size).catch(() => undefined)`. A quick 20 then 10, or an arrow held on a loaded tablet, can leave the focused chip and the stored size out of step; a rejected write leaves the chip unchanged with no word to the user. Plausible, not exercised (retro adversarial 4 and 10). Fix: a local pending size shown until the live query agrees, and a failed write surfaced (a toast) instead of swallowed; a component test with a write that hangs and one that rejects.
  class: risk
  state: open (owner: the next Home story or fix batch)
- source_spec: `_bmad-output/implementation-artifacts/epic-19-retro-2026-11-03.md`
  summary: R-13 (UX question): the page-size chips sit only below the list. After 50 or 100 they are at the end of a long list; a larger size inserts cards above the focused chip; when a sync drops the selection to 10 or fewer the chip group unmounts while it holds focus; and the stored size makes every later visit open long, against the epic's goal of a short Home.
  evidence: `home-surface.tsx` renders the note row with the chips after `.relatorio-cards` and only when `list.note !== null`; the mocks draw the note under the cards (`20-home.html`, `key-home.html`), so this is not a defect of the as-built. Plausible, not exercised (retro adversarial 12, edge case 5 and 6). To decide: also place the chips by the "Relatórios" heading, reset a large stored size on the next visit, and where focus goes when the group unmounts.
  class: question
  state: open (owner: Matheus and Sally, the decision; then the next Home story)

## Deferred from: batch s184 (2026-11-03)

- source_spec: `_bmad-output/implementation-artifacts/spec-s184-events-say-how-long.md`
  summary: The Conta sentence ("Uso do aplicativo", `copy.account.usageNote`) still says the device records screens, taps, waits and errors; `session_start` now also says the viewport, whether the app is installed and whether it was online (the device and its connection), and `input_refused` says a typed value was refused (never the value).
  evidence: Spec Design Notes, "Conta sentence verdict"; `apps/web/src/copy/pt-br.ts` unchanged; `docs/observability.md` § LGPD.
  class: decision
  state: ~~open (owner: Matheus and Bruno decide the wording; the production deploy of Story 18.4 waits on it)~~ closed 2026-11-03: Matheus chose the short wording, "as telas abertas, os toques, as esperas, os erros e o tipo de tela e de conexão, nunca o que é digitado"; `copy.account.usageNote` and its component test carry it. `input_refused` is read as an error and needs no word of its own.
- source_spec: `_bmad-output/implementation-artifacts/spec-s184-events-say-how-long.md`
  summary: "Cancels by preceding screen" is not an aggregated view: the dialog events carry no `from`, so the `paths` view lists the per-session sequence and the reader finds the screen before a cancel in the `screen_view` rows around it.
  evidence: Spec Design Notes, view `paths`; `infra/production/observability.tf` `paths`; `_bmad-output/test-artifacts/friction-digest-template.md` "Five questions" item 3.
  class: question
  state: open (owner: the first digest says whether the reading by hand suffices; else a story adds `from` to `dialog_open` and `dialog_cancel`)
- source_spec: `_bmad-output/implementation-artifacts/spec-s184-events-say-how-long.md`
  summary: The seven new views (`screen_time`, `home_first_nav`, `paths`, `bounces`, `viewports`, `refusals`, `document_waits`) have run offline only (`infra/bin/check`, `scripts/telemetry-queries.test.ts`), not in Logs Insights: `ispresent()`, the backticked `` `from` `` and the field-to-field comparison `` `from` != screen `` are untried there.
  evidence: Batch s184 is offline by rule (no apply). The first read after the apply should open each of the seven and check it runs to `Complete`.
  class: risk
  state: open (owner: the coordinator, at the deploy that carries Story 18.4, on Matheus's word)
- source_spec: `_bmad-output/implementation-artifacts/spec-s184-events-say-how-long.md`
  summary: While old and new bundles report together, `funnel` mixes `screen_view` rows written on entering (old bundles) with rows written on leaving (new), and `waits` mixes request-timed and press-timed `preview` and `generate` waits; `document_waits` splits the waits by `app_version`, `funnel` has no such split.
  evidence: `docs/observability.md` § The views (`funnel` and `waits` notes); the device starts on the new bundle at its next load.
  class: risk
  state: open (owner: the first digest notes the share of sessions on the new bundle; accepted as a transition)
- source_spec: `_bmad-output/implementation-artifacts/spec-s184-events-say-how-long.md`
  summary: Narrowed refusal points: a sheet number or measurement field reports a refusal on blur and Enter, not on Shift+Enter (which commits through `commitNow`, never a refusal report) or a unit chip; the setup altitude's refusal is always `not_a_number`, named in `apps/web` because its parse is the surface's own (`parseAltitude`), not the kernel's; the date picker's one refusal is `out_of_range` on leaving it; an `input_refused` target is checked against `TELEMETRY_TARGET_PATTERN` by the schema, like every target, and against `UX_INPUT_TARGETS` by `targets.test.ts`.
  evidence: `apps/web/src/components/number-input.tsx` `onRefuse` (blur and Enter only), `apps/web/src/surfaces/relatorio/setup/etapa5-local.tsx`, `apps/web/src/surfaces/ficha/ficha-fields.tsx` `DatePickerField`, `apps/web/src/telemetry/targets.test.ts`.
  class: debt
  state: open (owner: the first digest says whether a missing path matters; the altitude's reason moves to the kernel with its parse if a story moves the parse)
- source_spec: `_bmad-output/implementation-artifacts/spec-s184-events-say-how-long.md`
  summary: The e2e of `input_refused` types "quinze", not the spec's "abc": the queue holds hexadecimal ids, so "abc" can occur inside a uuid and the "never the typed text" check would fail by chance.
  evidence: `e2e/usage-events.spec.ts` 18.4-E2E-001.
  class: test-gap
  state: accepted (2026-11-03, batch s184: the assertion is the same, with a word that cannot occur in an id)
- source_spec: `_bmad-output/implementation-artifacts/spec-s184-events-say-how-long.md`
  summary: On a sign-out and another user's sign-in in the same tab, the events tracked while no database was configured (the first user's last `screen_view`, written when the login opens) take the new user's session id, so the `paths` view can show the first user's last screen at the start of the second user's session (review ECH-9, second half; the rotated `session_start` now takes the earliest held `ts`).
  evidence: `apps/web/src/telemetry/track.ts` `configureTelemetry` (held events re-stamped, batch e18fa R-A15 design); `apps/web/src/telemetry/views.ts` (the view left on the route to the login).
  class: risk
  state: open (owner: the next telemetry story; options: drop held events older than the sign-in, or keep them under the old id)
- source_spec: `_bmad-output/implementation-artifacts/spec-s184-events-say-how-long.md`
  summary: Review ECH-1 and ECH-2, accepted: a route change while the tab is hidden opens a view the tab's return cannot reopen (its hidden time counts), and a full surface (426 update, eviction recovery) that goes in the same commit as a route change writes a near-zero view of the route cached before it.
  evidence: `apps/web/src/telemetry/views.ts` `enterScreen`, `resumeScreen`; `apps/web/src/telemetry/hooks.ts` `useScreenView` cleanup.
  class: risk
  state: accepted (2026-11-03, batch s184 review: both are rare and their fix is a new guard; reopen if `screen_time` shows outliers on `update` or `recovery`)

## Deferred from: Epic 20 batch e20s (2026-11-03)

- source_spec: `_bmad-output/implementation-artifacts/spec-e20s-server-rules.md`
  summary: Nothing was counted in production. Values stored before contract 29 that are over their new cap stay as they are (never rewritten) and keep printing; a device that edits such a field can only shrink it. The read-only query that counts them per field is in the PR body for Matheus to run before the deploy.
  evidence: `packages/domain/src/ops/value-limits.ts` (`TEXT_CAPS`, `FAMILY_VALUE_RULES`); the PR body's SQL.
  class: risk
  state: ~~open (owner: Matheus, before the deploy)~~ *(2026-11-04, E20-A3: closed. 0 values over their cap in every field of the PR #239 query, and 0 site altitudes outside -500 to 9 000 m, against 12 relatórios, 422 blocks, 421 files, 96 locations and 12 points (`entities` rows). The query ran unchanged on 2026-11-04 at about 23:06 (America/Sao_Paulo), after the e0b47ad4 deploy, as a `tsx -e` command override on the `fasor-production-migrate` task inside `sql.begin('read only', ...)`; tasks 958cda7c (count) and f4e32093 (row counts), both exit 0, output in `/fasor/production/migrate`. No stored value needs the shrink-only path.)*
- source_spec: `_bmad-output/implementation-artifacts/spec-e20s-server-rules.md`
  summary: One "Desfazer" is now refused: undoing "Voltar para Em campo" from an Em revisão whose content changed since its latest revision (or that has no revision yet) puts Em revisão back with no generate queued after the back move and no unchanged revision, so `statusMoveVerdict` reads it as a forward move without its precondition (`op_status_transition`). The device shows the sentence, stays Em campo, and the next generate moves it to Em revisão as usual. Every other undo of a status move applies.
  evidence: `packages/domain/src/status/table.ts` `statusMoveVerdict`; `apps/api/src/sync/status-transition.integration.test.ts` (the undo of the back move on an unchanged revision applies).
  class: risk
  state: open (owner: Matheus; if the undo must apply, the kernel can accept a move back to the status the op named by `prev_op_id` replaced, which needs that op's previous value in the log)
- source_spec: `_bmad-output/implementation-artifacts/spec-e20s-server-rules.md`
  summary: A client batch whose serialized ops alone are over 4 MiB is pushed alone and still earns a 413, since a batch is never split for bytes~~; and a batch of more than 500 ops is cut by count only~~ *(2026-11-03, batch e20s review: the 500-op slices of such a batch are cut again by bytes, an op alone over the cap in a push of its own)*. Neither shape exists today (an op's values are capped, and the largest batch, a relatório's creation, is about 200 KB).
  evidence: `apps/web/src/sync/policy.ts` `batches`; `apps/web/src/sync/policy.test.ts`.
  class: risk
  state: accepted (2026-11-03, batch e20s: reopen if a 413 is ever logged for a device push)
- source_spec: `_bmad-output/implementation-artifacts/spec-e20s-server-rules.md`
  summary: Two inputs outside the Story 20.9 inventory take no `maxLength`: the `CnpjField` (format-validated) and the `RegistryPickerField` behind a sheet's manufacturer and voltage class fields; the server still caps both (short text). The setup altitude's `input_refused` reason is now `out_of_range` for a whole number outside -500 to 9 000 m, so the batch s184 row that says it is always `not_a_number` reads one case short.
  evidence: `apps/web/src/components/registry-picker-field.tsx`; `apps/web/src/surfaces/relatorio/setup/etapa5-local.tsx` `parseAltitude`.
  class: debt
  state: open (owner: the next story that touches those fields)
- source_spec: `_bmad-output/implementation-artifacts/spec-e20s-server-rules.md`
  summary: The history a removal conflict's `edited_by` may restore is any earlier op of that colleague in the same relatório, not one on the removed block's own paths (the edit may be a sheet put, a Não ensaiado mark or a photo carrying the block). A mark the UI shows only in Sync status, never printed.
  evidence: `packages/domain/src/ops/attribution.ts` (`op.meta.restore.removal_conflict.edited_by`, `same_relatorio_actor`); `apps/api/src/sync/rules.ts` `historyOf`.
  class: risk
  state: accepted (2026-11-03, batch e20s)
- source_spec: `_bmad-output/implementation-artifacts/spec-e20s-server-rules.md`
  summary: The dev-only field fixture (`/__fixture/field`) writes `relatorio/setup/local` puts to a fixed relatório id no company holds, so since contract 29 the server refuses them (`op_target_missing`) and they stay dead rows on the device. The durability specs that use it assert only the device side and pass; A5-E2E-003, which needs its put acked, seeds that relatório as the server holds it (tombstoned at once, so no Home shows it).
  evidence: `apps/web/src/surfaces/fixtures/field-fixture-surface.tsx` `FIXTURE_RELATORIO_ID`; `e2e/support/durability.ts`; `e2e/ui-hygiene.spec.ts` A5-E2E-003.
  class: debt
  state: open (owner: the next story touching the fixture; it could create its own relatório)
- source_spec: `_bmad-output/implementation-artifacts/spec-e20s-server-rules.md`
  summary: The api answers a push over 4 MiB with 413 before the body is uploaded; the Vite dev proxy in front of the e2e page sometimes reports that early answer as a 502 (EPIPE while it still writes the body), so `security-ops.spec.ts` sends its 5 MB push from the test runner straight to the api with the page's cookie. Whether production's Caddy relays the early 413 was not checked; a device only sends such a push for a client batch alone over the cap (see the row above), and a 5xx would make it retry.
  evidence: `e2e/security-ops.spec.ts` `pushFromRunner`; the e2e log of the full `@p0` run of 2026-11-03 (one 502 in three runs).
  class: risk
  state: open (owner: the second security pass of wave B, which runs against the integrated main behind Caddy)
## Deferred from: batch e20w (2026-11-03)

- source_spec: `_bmad-output/implementation-artifacts/spec-e20w-web-conforme-search-relink.md`
  summary: The Home search field records no usage event: the telemetry target `home.search` (Story 20.2 DoR, AD-28) is not in `UX_ACTION_TARGETS`, so the field carries no `data-telemetry`.
  evidence: `UX_ACTION_TARGETS` lives in `packages/domain/src/contract/telemetry.ts`, which batch e20s owns in wave 1; `apps/web/src/telemetry/rendered-targets.test.tsx` and `targets.test.ts` refuse a name outside the list. The field is `SearchField` in `apps/web/src/surfaces/home/home-surface.tsx`.
  class: deferred-feature
  state: ~~open (owner: batch e20e, wave 2, after e20s merges: append `home.search` to `UX_ACTION_TARGETS`, wire the field's use event so it records that a search was used and never its text (AD-28), and extend the guard to the field)~~ closed 2026-11-04 (Epic 20 retrospective P-3): landed in e20e, `apps/web/src/surfaces/home/home-surface.tsx` line 88 records one `home.search` action per search started, tested at `home-surface.test.tsx` line 686

## Deferred from: Epic 20 batch e20e (2026-11-04)

- source_spec: `_bmad-output/implementation-artifacts/spec-e20e-device-quotas-edges.md`
  summary: The per-e-mail sign-in lockout stays (security pass S8): any client can keep a known e-mail out of sign-in with 10 attempts every 5 minutes. A device with a live 30-day session is not affected.
  evidence: `apps/api/src/http/rate-limit.ts` `signInRateLimit`; coordinator's reading of Story 20.13 (accepted risk).
  class: risk
  state: accepted (owner: Matheus)
- source_spec: `_bmad-output/implementation-artifacts/spec-e20e-device-quotas-edges.md`
  summary: An early answer of the api to a large body can reach the client as Caddy's 502, not the api's JSON. Measured on the batch's stack (a throwaway `caddy:2.11.4-alpine` with `reverse_proxy api:3000`): a 1 MB sign-in body is relayed as the api's JSON 413; a 20 MB push was once a 502 and once the JSON 413; a 5 MB push (answered 401 or 413 after the async session read) was a 502 in three runs of four. The cause is the api, not Caddy: `@hono/node-server` 2.1.1 (`autoCleanupIncoming`, default on) destroys an incoming body the route did not read, which resets the connection while Caddy still writes it. Neither `request_body max_size` nor `request_buffers` in the Caddyfile changed the outcome, so the Caddyfile was left with the HSTS change only.
  evidence: `.scratch-e20e/caddy/check413.mjs` and its copy of the Caddyfile (batch worktree, not tracked); `node_modules/@hono/node-server/dist/index.mjs` `getRequestListener` and `drainIncoming`.
  class: risk
  state: ~~open (owner: Matheus; a candidate fix is `serve({ ..., autoCleanupIncoming: false })` in `apps/api/src/main.ts`, so Node drains the unread body itself, to be measured behind Caddy before it lands)~~ *(2026-11-04, e20e orchestrator: closed in `eb5bcf04`. The reset came from the body limiters and the origin guard touching `c.req.raw.body`, which turns the incoming body into a stream that is never drained. `bodyTooLarge` in `apps/api/src/http/app.ts` now answers a declared `Content-Length` over its cap from the header alone, the push's 4 MiB cap also runs before the session read, and the origin guard reads `raw.body` only for a request with neither length nor chunked header. Behind a plain `reverse_proxy api:3000`, `.scratch-e20e/caddy/check413-session.mjs` (1 MB sign-in, 5 MB and 20 MB pushes with a session, six rounds) gave 6 of 18 answers as 502 with the check reverted and 0 of 54 with it; `autoCleanupIncoming: false` alone did not help and was not kept. A chunked body over a cap still goes through hono's `bodyLimit`, unmeasured behind Caddy; browsers send a length for every body the app posts.)*
- source_spec: `_bmad-output/implementation-artifacts/spec-e20e-device-quotas-edges.md`
  summary: The sign-out unsent count counts a photo whose create op and bytes both wait once per item the uploader sees: the create op is counted while unacknowledged, and the original only once its create is acknowledged (`pendingUploads` lists a file only after the server holds its row), so the double count of the spec's reading (1) does not happen; a refused (`dead`) upload is counted too, since Sair would delete it.
  evidence: `apps/web/src/surfaces/account/account-surface.tsx` `unsentCount`; `apps/web/src/db/file-store.ts` `pendingUploads`.
  class: note
  state: open (owner: Matheus, to confirm the reading)
- source_spec: `_bmad-output/implementation-artifacts/spec-e20e-device-quotas-edges.md`
  summary: The matrix projects (`durability-android-chrome`, `durability-webkit`) run only `*durability.spec.ts` files (`playwright.config.ts` `testMatch`), so `security-device.spec.ts` and `auth.spec.ts` run on `desktop-chrome` only; the boot and sign-in paths reach WebKit through `durability.spec.ts`.
  evidence: `playwright.config.ts` projects.
  class: note
  state: open (owner: Matheus; renaming the spec to `security-device.durability.spec.ts` would put it on the matrix)
- source_spec: `_bmad-output/implementation-artifacts/spec-e20e-device-quotas-edges.md`
  summary: Not fixed, as the spec says (e20s deferral): "Reenviar" re-sends a clock-skew op unchanged.
  evidence: e20s deferral.
  class: risk
  state: ~~open (owner: Matheus)~~ closed 2026-11-04 (Epic 20 retrospective P-3): fixed in e20f (#241), `resendDead` re-stamps rows refused `op_attribution` (`apps/web/src/db/sync-store.ts`, `restampOp`), proven by `e2e/device-clock.durability.spec.ts`; the re-stamp's own scope and order are retrospective finding R-2 (E20-A1)

- source_spec: `_bmad-output/implementation-artifacts/spec-e20g-no-blank-page.md`
  summary: No automated check sends a request through each production Caddy site block to a live upstream and asserts the edge headers (no `Via`, no `Server`, HSTS); `infra/bin/check` validates the file and the fallback block's status codes only.
  evidence: e20g review VGR-1. The proof of the `-Via` change is manual (domain and CloudFront fallback blocks through a throwaway `caddy:2.11.4-alpine`); the IP block needs its ACME certificate.
  class: risk
  state: open (owner: Matheus; a stub upstream on `127.0.0.1:3000` in `infra/bin/check` closes it)
- source_spec: `_bmad-output/implementation-artifacts/spec-e20g-no-blank-page.md`
  summary: The plain-HTTP redirect still sends `Server: Caddy`; removing it means replacing Caddy's implicit `:80` redirect with explicit `http://` site blocks on the port that also answers the HTTP-01 challenges of both certificates, which cannot be proven without an ACME server.
  evidence: e20g Design Notes; `.scratch-e20g` probe of the redirect.
  class: note
  state: open (owner: Matheus, cosmetic)
- source_spec: `_bmad-output/implementation-artifacts/spec-test-speed-2.md`
  summary: The generation spike of `sprint-change-proposal-2026-11-04.md` § 4.2 is approved but unscheduled. Its job is to measure where one generation's ~9.5 s goes (the job's `generate timing` stages, the soffice spawn share, the device's 3 s `GenerateWatcher` poll and pull) and, only if worth it, to propose a costed product story.
  evidence: T2 review; the proposal's § 5 handoff names no date. The job-side stages are already logged (`apps/api/src/jobs/generate/job.ts`, `generation-time.integration.test.ts`); the device side is not.
  class: note
  state: ~~open (owner: Matheus to schedule; Developer or TEA, opus · high)~~ closed 2026-11-04 (measured on Matheus's word, `_bmad-output/test-artifacts/generation-timing-2026-11-04.md`; the one proposal left, a faster queue pickup and device poll, was declined by Matheus the same day: "nao vamos fazer")
- source_spec: `_bmad-output/implementation-artifacts/spec-test-speed-2.md`
  summary: Two tests in `e2e/durability.spec.ts` still tap "Sincronizar agora" by hand (go to `/sync`, wait for the button to lose `aria-disabled`, click, then poll a store). E5-A1 calls that readiness signal racy, and `e2e/support/sync.ts` `syncNow` waits on the cycle's end instead. They are the one at about line 426 (`tab`) and the one at about line 674.
  evidence: T2 review; 1.8-E2E-002 in the same file moved to `syncNow` in T2. Neither is a wait on the 60 s tick, so the C-4 guard does not read them.
  class: note
  state: open (owner: the next batch touching `durability.spec.ts`)

## Deferred from: the Epic 20 retrospective (2026-11-04, E20-A3)

- source_spec: `_bmad-output/implementation-artifacts/epic-20-retro-2026-11-04.md`
  summary: Every file GET runs a second query (`relatorioRemoved`) after `findFileRow` since e20f (QA N2), so a gallery or thumbnail grid doubles its database round trips (R-5).
  evidence: `apps/api/src/http/files.ts` line 343.
  class: debt
  state: open (owner: the next batch touching `files.ts`; join the relatório's `removed_at` into `findFileRow`'s lookup)
- source_spec: `_bmad-output/implementation-artifacts/epic-20-retro-2026-11-04.md`
  summary: Unknown client `meta` keys are bounded only by the depth cap (`opDepthIssue`), not by the byte and count caps the value carries, so a client can store large strings or arrays in the ops log through `meta` (R-12, plausible, not reproduced).
  evidence: `packages/domain/src/ops/op.ts` `opMetaSchema` (`z.looseObject`); `packages/domain/src/ops/value-limits.ts` `opDepthIssue`.
  class: risk
  state: open (owner: coordinator; apply `VALUE_MAX_BYTES` and `VALUE_MAX_ITEMS` to `meta`, or refuse unknown meta keys from a client)
- source_spec: `_bmad-output/implementation-artifacts/epic-20-retro-2026-11-04.md`
  summary: The read-only count of values over the contract-29 caps (PR #239 body) has no record of a run against production before the d6e8eea1 deploy, though its e20s row says "before the deploy" (P-3).
  evidence: e20s row "Nothing was counted in production"; `epic-20-context.md` deploy records name no such run.
  class: risk
  state: ~~open (owner: Matheus, needs his AWS login; record the per-field result in the e20s row, or that it was skipped)~~ *(2026-11-04, E20-A3: closed; run after the e0b47ad4 deploy on Matheus's login, 0 values over cap; the result is in the e20s row)*

## Deferred from: E20-A1 retrospective fix batch (2026-11-04)

- source_spec: `_bmad-output/implementation-artifacts/spec-e20a1-retro-fixes.md`
  summary: The preview and audit "never arrived" expiries moved to the monotonic clock (`use-preview.ts`, `use-audit.ts`) have no test harness, so a regression back to the corrected `now()` would pass every test.
  evidence: review pass 1, triage #10 (VG-3); a search for `usePreview`, `useAudit` and "never arrived" in `apps/web/src/**/*.test.*` and `e2e/` finds no test.
- source_spec: `_bmad-output/implementation-artifacts/spec-e20a1-retro-fixes.md`
  summary: The relatório budget's stored side now reads and re-serializes every live client row of the relatório once per push that grows it, where before it was one SQL `sum(octet_length)`; the cost on the push path is unmeasured.
  evidence: review pass 1, triage #17 (BH-5), maybe-false, medium if real; settle it by timing a growing push on a Porto Seguro-sized relatório (and a 4 MiB one) against the old SQL sum, then keep, or move to a per-relatório byte counter.
- source_spec: `_bmad-output/implementation-artifacts/spec-e20a1-retro-fixes.md`
  summary: `POST /api/photos/{id}/reread` (`apps/api/src/http/reading.ts`) and `sendRetargetedReading` (`apps/api/src/sync/routes.ts`) check only the photo's own tombstone, not `fileWithdrawn`, so a photo of a removed relatório can still spend a paid reading.
  evidence: review pass 1, triage #18 (VG-6); `reading.ts:54-57` repeats the old inline check; no test rereads a photo of a removed relatório.

## Deferred from: Epic 21 batch e21r (2026-11-05)

- source_spec: `_bmad-output/implementation-artifacts/spec-e21r-ratio-vector-group.md`
  summary: Before the deploy, Matheus runs `apps/api/src/scripts/bedrock-eval.ts` on the real plate set with prompt ~~`bedrock-structuring-3`~~ `bedrock-structuring-4` (2026-11-05, fix batch e21f); record the group column per plate in the PR.
  evidence: Story 21.2 DoD; the script is prepared (its "Vector group read" table, the two synthetic v11 transformer plates added to its default set) and was never run in the batch (paid call).
  state: partly done (2026-11-05, coordinator, Matheus's go-ahead for the overnight deploy): run on the synthetic set only, since the real plate set (`docs/media/`, git-ignored) is not on this machine. Production model `global.anthropic.claude-haiku-4-5-20251001-v1:0`, Textract OCR. On `bedrock-structuring-3` (main fdc19924) the drawn Yyn0 plate read Dy1 3 of 3 (fixed by e21f); on `bedrock-structuring-4` (PR #256 head 3d8a76ed) Dyn1, Dyn1 and Yyn0 (diagram) 3 of 3, field accuracy 96.2 % (25/26), citations 100 %, about USD 0.006 per reading. ~~The real-set run stays open (owner: Matheus).~~
  state: closed (2026-11-06, coordinator, after the 2026-11-06 00:30 deploy, accepted deviation (a) of `epic-21-retro-2026-11-06.md`): six real transformer plates from the production bucket (in the ignored `docs/media/real-plates-2026-11-06/`, never committed), `bedrock-structuring-4`, Haiku 4.5, two identical runs: 5 of 6 Dyn1 (one as a diagram read), 1 blurred and rotated photo with no suggestion, 0 wrong; none is star-star. The diagram-read plate prints "Dyn I" (letter I for 1); batch e21a reads it as Dyn1 in `parseVectorGroup`. Recorded in `epic-21-context.md` § After the deploy.
- source_spec: `_bmad-output/implementation-artifacts/spec-e21r-ratio-vector-group.md`
  summary: The drawn-diagram path of Story 21.2 is exercised end to end on the device with the reading job's suggestion seeded as the job writes it (`e2e/plate.spec.ts` 21.2-E2E-001), and through the real job only in `apps/api` (`job.integration.test.ts`, the committed plate's own fixture): an imported photo is re-encoded by the device, so the fake providers replay the transformer's default plate (printed Dyn1) and never the drawn one.
  evidence: `providers/fake.ts` chooses a default fixture by reading kind, block type and table only; making the drawn plate a default would change every transformer plate test.
- source_spec: `_bmad-output/implementation-artifacts/spec-e21r-ratio-vector-group.md` (review, owner: the Epic 21 integrated review or its fix batch)
  summary: `suggestConclusionPair` can offer "Aprovado · Sem restrições" on a v11 transformer whose LIGAÇÃO SECUNDÁRIA is empty and whose captures are measured, since no VAL CALCULADO judges them.
  evidence: `relatorio/conclusion.ts` does not read `EvaluatedTable.groupMissing`; a ratio row missing V PRIMÁRIO behaves the same today, and the sheet still counts the row missing, so "Concluir ficha" stays blocked.
  state: closed (2026-11-06, fix batch e21g, D6, PR #260)
- source_spec: `_bmad-output/implementation-artifacts/spec-e21r-ratio-vector-group.md` (review, owner: the Epic 21 integrated review or its fix batch)
  summary: When the v11 missing group is the only thing missing in Ensaios, "Concluir ficha" lands on Ensaios with no field focused (the fix is on Placa).
  evidence: `apps/web/src/surfaces/ficha/ensaios-section.tsx` `firstMissing` reads evaluated cells only, and the group has no cell; the missing-group helper is shown under the ratio table.
  state: closed (2026-11-06, fix batch e21g, D7, PR #260)
- source_spec: `_bmad-output/implementation-artifacts/spec-e21r-ratio-vector-group.md` (review, before the deploy with the eval run)
  summary: A drawn-only vector diagram whose terminal labels the OCR did not return is dropped as uncited, so no group is suggested.
  evidence: `providers/bedrock.ts` `withoutUncitedValues` and `structuringValueSchema` (`min(1)`) drop a value citing no token; changing that touches `contract/ocr.ts` and the OCR sidecar gate. The paid eval run shows how often the real plates hit it.
  state: ~~open (2026-11-05: the synthetic drawn plate's labels were returned by Textract and cited in all runs; how often real plates hit it needs the real-set run, owner: Matheus)~~ open (2026-11-06, batch e21a): on the real set 1 of 6, a blurred and rotated photo, got no suggestion, its cause not recorded; none of the six is a drawn-only plate (the one diagram read prints "Dyn I"). Since e21a, facts whose labels the OCR did not return are ignored and the model's own group entry is kept as a diagram read (R-1), and every transformer reading logs `reading vector diagram` with the fold's outcome (`uncited` for this case, R-3), so the next production reading says how often it happens. Owner: E21-A2.

## Deferred from: Epic 21 fix batch e21f (2026-11-05)

- source_spec: `_bmad-output/implementation-artifacts/spec-e21f-diagram-vector-group.md`
  summary: Before the deploy, the coordinator reruns `apps/api/src/scripts/bedrock-eval.ts` with `bedrock-structuring-4`; the drawn Yyn0 plate (`plate-transformador-yyn0.png`) must read Yyn0 (the group table shows "Yyn0 (diagram)").
  evidence: the coordinator's paid eval of 2026-11-05 read the drawn plate "Dy1" 3 of 3 on `bedrock-structuring-3`; the fix (the model describes the diagram in `vector_diagram`, `composeVectorGroup` composes the code) is exercised only on stubbed Converse answers and the fake fixture, never on the model (paid call).
  state: closed (2026-11-05, coordinator: three runs on PR #256 head 3d8a76ed, the drawn plate read "Yyn0 (diagram)" 3 of 3, the printed plates Dyn1 plain)
- source_spec: `_bmad-output/implementation-artifacts/spec-e21f-diagram-vector-group.md`
  summary: A group the model composes itself, citing words that print no group, with no `vector_diagram` facts, keeps the e21r handling (a diagram read, `verify`); only facts that compose replace it.
  evidence: spec Design Notes (conservative, listed in the PR); `providers/vector-diagram.ts` `withVectorDiagram` changes nothing without composable facts.
- source_spec: `_bmad-output/implementation-artifacts/spec-e21f-diagram-vector-group.md` (review, owner: the coordinator at the eval run)
  summary: The eval's "(diagram)" marker (`bedrock-eval.ts` `groupRead`) has no test; the script has no harness and runs only as the paid eval, so whoever reads its table checks the marker against the plate (drawn plate "Yyn0 (diagram)", printed plates plain).
  evidence: verification-gap review of e21f; `groupRead` is not exported and no test imports `apps/api/src/scripts/`.
  state: closed (2026-11-05, coordinator: checked against the plates in the three runs above; drawn plate marked, printed plates plain)
  state: tested (2026-11-06, batch e21a, R-2): `groupRead` moved to `apps/api/src/scripts/eval-group-read.ts` with its own test, and it reads the kernel classification the job stores by (`vectorGroupReadOf`).

## Deferred from: Epic 21 batch e21p (2026-11-05)

- source_spec: `_bmad-output/implementation-artifacts/spec-e21p-section-7-photo-order.md`
  summary: "Subir" on a photo (or block, or point) directly below a run of equal order keys, which two devices can mint apart, lands after the run again, so nothing moves, while the gallery's announcement says it moved (it reads `moveLandingIndex`).
  evidence: review pass 1 (edge-case hunter); `orderKeyForMove` in `packages/domain/src/ops/order-key.ts` is pre-existing and shared by blocks, points and now photos. Owner: a later fix batch; settle it with a kernel test of an equal-key run above the moved row.

## Deferred from: the Epic 21 retrospective (2026-11-06)

- source_spec: `_bmad-output/implementation-artifacts/epic-21-retro-2026-11-06.md` (R-5, owner: E21-A2)
  summary: The plate escalation model (`us.amazon.nova-pro-v1:0`, the `bedrock_escalation_model_id` default) gets the `bedrock-structuring-4` tool schema with the required, nullable `vector_diagram` object and was never measured on it; a refusal is caught and only logged (`kinds/plate.ts:116-123`).
  evidence: every escalation test stubs Converse; the e21f integration test turns escalation off; the evals of 2026-11-05 and 2026-11-06 ran Haiku 4.5 only.
  state: partly addressed (2026-11-07, coordinator, the paid eval before the deploy of `ae3d37e0`, prompt `bedrock-structuring-5`): Nova Pro was measured on both sets with the `vector_diagram` schema; no refusal and no failed call (synthetic 32 of 33, real 5 of 6, the same as Haiku). On the real plate tf3 (blurred, rotated; expected Dyn1), where Haiku returns no group, Nova Pro returns "Dd0 (diagram)", a wrong group composed from diagram facts. An escalated reading kept for its larger number of suggested values could carry that group as a suggestion. Open, owner E21-A2: drop a diagram-composed group from the escalation model, or revise its prompt and measure again.
- source_spec: `_bmad-output/implementation-artifacts/epic-21-retro-2026-11-06.md` (R-6, owner: E21-A2, a measured prompt revision)
  summary: Prompt and schema wording: `hv_neutral` names only the star centre (a zigzag HV neutral, ZNy5 or ZNy11, may compose as Zy5 or Zy11); the system rule "give one value for each field you can read" contradicts "leave the group out and fill vector_diagram"; the tool description omits `vector_diagram`; `vector_diagram.ocr_token_ids` has no `minItems: 1`.
  evidence: `providers/vector-diagram.ts:53,62`; `providers/bedrock.ts:174,269`. Each fix is a prompt change, so a new prompt version and a paid eval.
- source_spec: `_bmad-output/implementation-artifacts/epic-21-retro-2026-11-06.md` (R-7, owner: E21-A2)
  summary: "Printed wins" in the fold depends on OCR fidelity: a printed code the OCR garbles is replaced by the composed diagram code, and nothing checks that the composed value's citations print no group (a value citing a printed code's word would reach the device `suggested`, with no diagram note).
  evidence: `providers/vector-diagram.ts:91-104,125,130`; on the real set of 2026-11-06 one of five Dyn1 reads came back as a diagram read, cause not recorded.
  state: partly addressed (2026-11-06, batch e21a): the diagram-read real plate prints "Dyn I" (a garbled print, not a drawing-only plate); `parseVectorGroup` now reads a single trailing I or l as clock 1, so a model entry citing those words is printed and wins over the facts (stored `verify` by the digit rule, with its box). The second half (a composed value citing a printed code's word) stays open, owner E21-A2.
- source_spec: `_bmad-output/implementation-artifacts/epic-21-retro-2026-11-06.md` (R-8, owner: a later reading batch)
  summary: Two group entries in one structuring answer fail the whole plate reading (the unique-key refine, unchanged by e21f); a nested `vector_diagram` answered as a JSON string is ignored; `make-plate-fixtures.ts` hard-codes the Yyn0 facts for any drawn plate and uses `value: null` to mean "omit".
  evidence: `contract/ocr.ts:167-173`; `providers/vector-diagram.ts:118`; `apps/api/src/scripts/make-plate-fixtures.ts:217,287,293`.
  state: open; assigned 2026-11-10 to Epic 24, Story 24.13 (the third part only, the plate script, and only if the new plates need it); *(2026-11-11, batch e24s: not needed: the No-break plate is drawn with no vector group and every value it carries is given, so `make-plate-fixtures.ts` only learned the type (`PlateSpec.blockType`) and its plate; the Yyn0 facts and the `value: null` convention stay as they are, the row stays open for a later reading batch)*
- source_spec: `_bmad-output/implementation-artifacts/epic-21-retro-2026-11-06.md` (P-3, owner: E21-A4, a test-hardening batch)
  summary: Four tests went red under load in two or more gates and passed alone each time: `apps/web/src/state/reading-arrivals.test.tsx` (the caption toast), `apps/web/src/surfaces/home/home-surface.test.tsx` (12.2 "Continuar"), `apps/web/src/surfaces/relatorio/setup-surface.test.tsx` (the exclusion typing) and R8LAY-E2E-008 (`e2e/review-layout-interaction-2026-10-08.spec.ts`, the "Novo relatório" dialog within 5 s).
  evidence: PR #254 § Story gate (load 23.5); PR #255 § Earlier gate (load 26); `epic-21-context.md` § Integrated gate (load 4.5 to 5.2, with the review stack beside it); `docs/kbs/log.md` chore T2 (R8LAY-E2E-008 red once in 5); `epic-12-retro-2026-09-25.md:73` (`home-surface.test.tsx`).
  state: closed (2026-11-10, fix batch e24f, E23-A4) for the three unit tests, each hardened on its cause, written in `spec-e24f-retro-fixes.md` § Auto Run Result (setup-surface: the edit pasted whole, a keystroke race of the product reported in the e24f rows below; reading-arrivals and home-surface: a render chain of live queries given the test's budget). R8LAY-E2E-008 is not closed by a fix: its press is now repeated until the dialog opens, and the lost press it met stays open in the e24f rows below.

## Deferred from: e22c (2026-11-06)

- source_spec: `_bmad-output/implementation-artifacts/spec-e22c-parecer-follows-fichas.md`
  summary: "Possível duplicado" pairs every live manual point of an equipment or local with every NC entry of it; it does not read the point's photos or text, so an unrelated manual point of the same equipment is flagged too (the coordinator's reading; open for Bruno).
  evidence: `packages/domain/src/points/derived.ts` `possibleDuplicatePoints`.
  state: superseded 2026-11-10 by fix batch e24h (no automatic points): with no NC entry there is no pair, so the flag and its pre-issue row go
- source_spec: `_bmad-output/implementation-artifacts/spec-e22c-parecer-follows-fichas.md`
  summary: The out cell's "Marcar com restrições" action (`measurement-field.tsx`, `measurement-test-section.tsx`) still writes only the restriction; under Story 22.4 the floor already gives Reprovado · Com restrições, so the action is redundant on the effective pair. Not removed (outside the spec's Code Map).
  evidence: `apps/web/src/surfaces/ficha/measurement-field.tsx` `markRestricted`; `measurement-test-section.tsx` `markRestricted`.
  state: ~~open; assigned 2026-11-10 to Epic 24, Story 24.3 (on seed v14 the kernel says when the action may show; on v1 to v13 it stays)~~ closed (2026-11-11, batch e24a, Story 24.3): `markRestrictionOffered(block)` in `relatorio/conclusion.ts`; on seed v14 the action is never offered on a reading out of its criterion, on v1 to v13 it shows as before
- source_spec: `_bmad-output/implementation-artifacts/spec-e22c-parecer-follows-fichas.md`
  summary: The `blocking` severity and the Export dialog's blocking-row UI (`copy.export.blockingMeta`, `editInSetup`) stay with no rule emitting a blocking row; the parecer copy keys `parecerHelper`, `parecerConfirmed` and `parecerConfirmedToast` are no longer rendered.
  evidence: `packages/domain/src/relatorio/pre-issue.ts` `PreIssueSeverity`; `apps/web/src/surfaces/export/export-dialog.tsx`; `apps/web/src/copy/pt-br.ts` `setup`.
  state: open; assigned 2026-11-10 to Epic 24, Story 24.9 (the three unused parecer copy keys; the `blocking` severity and the Export dialog's keys are still in use and stay); 2026-11-11: the three parecer copy keys removed by batch e24b (Story 24.9, `spec-e24b-screen-lane.md`); the `blocking` severity and the Export dialog's keys stay, still open
- source_spec: `_bmad-output/implementation-artifacts/spec-e22c-parecer-follows-fichas.md`
  summary: The e2e walk of a local's NC site item as a derived entry (Pontos card, "Abrir verificações", Editar) is not written; the kernel covers it (`points/derived-kinds.test.ts`, `relatorio/site-checklist.test.ts`) and `e2e/verificacoes-local.spec.ts` asserts the origin `nc` point written from the item.
  evidence: `e2e/points.spec.ts` 22.5-E2E-001 (sheet NC and out reading only).
  state: open; assigned 2026-11-10 to Epic 24, Story 24.7; 2026-11-10 (evening): superseded in this form by fix batch e24h (no automatic points), since there is no entry to walk. What remains, still in Story 24.7: the browser walk of the point created by the tap on a local's NC item, and of the question on the local's row (24.7-E2E-003); ~~still in Story 24.7~~ closed 2026-11-11 by batch e24b (Story 24.7, `spec-e24b-screen-lane.md`): `e2e/point-question.spec.ts` 24.7-E2E-003 creates the point by the tap on a local's NC item and walks the question on the local's row with both answers
- source_spec: `_bmad-output/implementation-artifacts/spec-e22c-parecer-follows-fichas.md`
  summary: A point of origin `nc` or `reading` relinked to another equipment or local (Story 20.4 pick, or a later `point/{id}/equipment_id` put) keeps its `item_key`/`test_key` but changes its owner, so it suppresses the new owner's entry and the original entry prints again; needs an immutable source (the block id at create) or a relink guard when `origin !== 'manual'`.
  evidence: `packages/domain/src/points/derived.ts` `pointSource`; review findings EC3 and VG8 of the e22c pass.
  class: bug
  state: ~~open (owner: the Epic 22 wave A integrated review)~~ partly superseded 2026-11-10 by fix batch e24h (no automatic points): no entry is suppressed and none prints again. What remains, open (owner: batch e24b's spec, Story 24.7): a relinked point keeps its `item_key` or `test_key` under its new owner, so "Origem resolvida" and Story 24.7's question read it against the wrong row; 2026-11-11, batch e24b (`spec-e24b-screen-lane.md` D5): Story 24.7 asks by owner and `item_key` as the story defines it, so a relinked point is asked about by its new owner's row of the same item; an immutable source or a relink guard is a product decision, not built. Open (owner: Matheus)
- source_spec: `_bmad-output/implementation-artifacts/spec-e22c-parecer-follows-fichas.md`
  summary: A derived entry of a sheet with no equipment (`equipment_id` null) is never suppressed (Story 6.6's rule), so "Editar" or "Criar ponto" on it writes a point that prints beside the entry.
  evidence: `packages/domain/src/points/derived.ts` `entrySource`; review findings EC4, EC5, EC13.
  class: bug
  state: ~~open (owner: the Epic 22 wave A integrated review)~~ superseded 2026-11-10 by fix batch e24h (no automatic points): no entry prints, so nothing prints beside the point
- source_spec: `_bmad-output/implementation-artifacts/spec-e22c-parecer-follows-fichas.md`
  summary: A stricter parecer verdict, once tapped, stays stored after the fichas clear (the stored LWW object has no "follow the derived verdict" state), so the effective verdict can stay stricter than the fichas with no way back but tapping the derived one, which also stores it.
  evidence: `apps/web/src/surfaces/relatorio/setup/etapa6-parecer.tsx` verdict tap; `relatorio/parecer.ts` `effectiveParecer`; review finding EC8.
  class: decision
  state: open (owner: Bruno, relayed by Matheus)

## Deferred from: Epic 22 batch e22p (2026-11-06)

- source_spec: `_bmad-output/implementation-artifacts/spec-e22p-print-and-attach.md` (Story 22.1, narrowing)
  summary: The DoR's "the oversized file shows the import's size message": no client size message exists on the import path; a large file is re-encoded to the 2560 px original cap like any import (`22.1-E2E-004` asserts the cap). A non-image is not offered (`PHOTO_ACCEPT`) and, forced, is skipped with the import's toast.
  evidence: `apps/web/src/files/photo-import.ts`, `photo-encode.ts` `ORIGINAL_MAX_PX`.
- source_spec: `_bmad-output/implementation-artifacts/spec-e22p-print-and-attach.md` (Story 22.1, test narrowing)
  summary: `22.1-E2E-003` (HEIC) answers the `heic-to` chunk with a stand-in that decodes through the browser: no HEVC HEIC encoder exists in the stack (sharp's libheif writes AVIF only) and the repo carries no HEIC fixture, so the third-party decoder itself is not exercised end to end. The route matches `/assets/heic-to*.js`; a renamed chunk fails the test loudly. Owner: a later test batch, with a real HEIC fixture from a phone (no client material).
  evidence: `e2e/attach-file.spec.ts`; `podman compose exec api node -e` with `sharp().heif({ compression: 'hevc' })` answers "Unsupported compression".
- source_spec: `_bmad-output/implementation-artifacts/spec-e22p-print-and-attach.md` (Story 22.1)
  summary: "Anexar arquivo" carries no `data-telemetry` name: a new usage event name is a contract change (`contract/telemetry.ts`), which this batch may not make. Owner: the next batch that bumps the contract, if Matheus wants the attach counted apart from the shot.
  evidence: `packages/domain/src/contract/telemetry.ts`.
- source_spec: `_bmad-output/implementation-artifacts/spec-e22p-print-and-attach.md` (Story 22.3, narrowing of the DoR, decided in the spec)
  summary: Keep-together is per joint, not "every row and paragraph keep-with-next from the title bar to CONCLUSÃO": every table keeps its rows, and only the joints named in the spec keep with the next part, so a ficha taller than a page breaks between two parts (a chain over the whole ficha would break inside a table). The nameplate and VERIFICAÇÕES GERAIS keep with the next part only as the plate before a Não ensaiado band or as the part right before CONCLUSÃO.
  evidence: `packages/domain/src/print/section-9.ts` `keptTogether`; `page-placement.integration.test.ts` 22.3 cases.
- source_spec: `_bmad-output/implementation-artifacts/spec-e22p-print-and-attach.md` (Story 22.3)
  summary: Label columns keep their weights (coordinator constraint), so a long bold label can still wrap inside itself by the kernel's estimate: "IDENTIFICAÇÃO" in DADOS DO EQUIPAMENTO measures about 9,5 em against its 9,4 em share. Whether it breaks on the real PDF is not checked here. Owner: Matheus or Bruno, if a printed label is seen broken.
  evidence: `print-fit.test.ts` measures value columns only; `wordsWiderThanColumns` reports the label.
- source_spec: `_bmad-output/implementation-artifacts/spec-e22p-print-and-attach.md` (Story 22.2)
  summary: The spec names `_bmad-output/planning-artifacts/source-deltas.md`; the file is `_bmad-output/specs/spec-fasor/source-deltas.md`, where the 2026-11-06 FR-68 row was already written by the planning PR: it was marked built rather than duplicated, and the AD-18 attribution row amended beside it.
  evidence: `source-deltas.md` rows FR-68 (2026-11-06) and FR-32/AD-18.

## e22r

Deferred from: Epic 22 batch e22r (2026-11-06), Stories 22.10 and 22.12, contract 32.

- source_spec: `_bmad-output/implementation-artifacts/spec-e22r-readings-over-range-previous.md` (open questions, conservative readings taken, for Matheus and Bruno)
  summary: (1) a limit below a `>` criterion is out (it cannot prove the criterion); (2) MANUT. ANTERIOR is the table's last column, not inside the VALORES group; (3) measurement tests carry their number cells only; (4) the instrument range is per test type in the registry (AR-18's pattern), read live at entry and stored by value. The authored wordings: the two refusals, the no-limit text, "> limite", "Limite de medição (…)" and its helper "Gravado na ficha quando o visor mostra OL (ex.: 2 e TΩ)".
  evidence: `packages/domain/src/relatorio/over-range.ts`, `apps/web/src/copy/pt-br.ts` (`rangeLabel`, `rangeHelper`), `apps/web/src/copy/ui.ts` (`overRange`).
- source_spec: `_bmad-output/implementation-artifacts/spec-e22r-readings-over-range-previous.md` (Code Map, value-limits bullet)
  summary: The spec says a malformed over-range cell value is refused "(op_invalid)"; the check lives in `ops/value-limits.ts` as the spec places it, whose refusals answer `op_value_invalid` (Story 20.9), so that is the code a push gets.
  evidence: `apps/api/src/sync/apply.ts` (`opValueIssue` -> `op_value_invalid`), `apps/api/src/http/generate.integration.test.ts` 22.10 case.
- source_spec: `_bmad-output/implementation-artifacts/spec-e22r-readings-over-range-previous.md` (Story 22.10)
  summary: A display-reading suggestion typed over (`read-display.tsx` `SuggestedCell`, `parseReadingPtBr`) still refuses ">"/"OL": only the Measurement field and the dictated cell take a limit. A plate or display reading never proposes one (the spec's Never). The instrument limit's unit is kept as typed in Cadastros: "TΩ" or "µΩ" works, a bare "T" finds no unit and "OL" then says there is no limit.
  evidence: `apps/web/src/surfaces/ficha/read-display.tsx` line 210; `relatorio/instrument-pick.ts` `instrumentRangeOf`.
  state: the unit half resolved (2026-11-07, fix batch e22g, review S1): `normalizeOhmUnit` reads "T", "TOhm", "uΩ", "μΩ" and the spelled prefixes as the Ω table's keys, on read and on Cadastros' commit; a unit it cannot read makes "OL" say so, and Cadastros shows a helper. The display-reading half stays as written.
- source_spec: `_bmad-output/implementation-artifacts/spec-e22r-readings-over-range-previous.md` (Story 22.12)
  summary: MANUT. ANTERIOR is decided per sheet: when its equipment has a previous value from another relatório, every reading table of the sheet gets the column, a test with nothing from that visit printing "-" on each row. The merge after e22s re-runs `section-9.test.ts`, `last-results.test.ts` and `previous-visit.spec.ts` on a v12 relatório (e22s owns the insulation table's columns; `withPreviousColumn` appends after them).
  evidence: `packages/domain/src/print/section-9.ts` `withPreviousColumn`, `previousReadingsOf`.
  state: resolved (2026-11-07, fix batch e22g, review N1): MANUT. ANTERIOR is decided per table, the two halves of a side-by-side pair together.
- source_spec: `_bmad-output/implementation-artifacts/spec-e22r-readings-over-range-previous.md` (Review Triage Log, Edge Case Hunter, unverified medium)
  summary: Re-issuing an older relatório X after a newer relatório Y of the same equipment was issued makes X the top `last_results` entry with Y as its prior: X's sheet and MANUT. ANTERIOR would show Y's later values as "previous", and a later relatório Z would read X's older values. The chain is ordered by issue, not by the visit's service date. Settled by ordering the chain by the visit's service date in `lastResults`.
  evidence: `packages/domain/src/print/last-results.ts` `lastResults`, `previousResultsFor`.
  class: defect
  state: ~~open (owner: the Epic 22 wave B integrated review); assigned 2026-11-10 to Epic 24, Story 24.15 (the visits ordered by the service date kept at issue)~~ resolved (2026-11-11, batch e24p, Story 24.15): each entry keeps its visit's service date (`service_date`) and `lastResults` orders two visits by their dates when one of them keeps one (`compareVisits`, `print/visit-date.ts`): an older visit issued late becomes the top's `prior`, never the top. An entry from before keeps its issue date and today's order; what an open relatório reads before its issue is a new row in the e24p section.

## Deferred from: Epic 22 batch e22s (2026-11-06)

- source_spec: `_bmad-output/implementation-artifacts/spec-e22s-seed-v12.md` (Story 22.11)
  summary: "Section 3 counts it": section 3 (LIMITE DE ESCOPO) is seeded boilerplate with no equipment list or count in any seed version, so there is nothing for the Inspeção de QGBT to be counted in; the batch counts it where totals exist (`templates/text.ts` `TOTALS_ORDER`, the composer's totals) and prints it in section 9. A section 3 equipment list is a new feature. Owner: Matheus or Bruno.
  evidence: `packages/domain/src/seed/sections-v1.ts` `SECTION_3`; `relatorio/section-variables.ts` `section3Blocks`.
  class: decision
  state: open (owner: Matheus)
- source_spec: `_bmad-output/implementation-artifacts/spec-e22s-seed-v12.md` (Story 22.9)
  summary: The DoR and the AC write ACEITÁVEL as "± 1,2 %"; the kernel's one criterion format (`formatCriterionValue`) prints "±1,2 %" with no space, as v1 to v11 print "±0,5 %". Kept, so older documents print byte-identical. Owner: Bruno, if the spaced form is wanted on every seed.
  evidence: `packages/domain/src/seed/criteria.ts` `formatCriterionValue`.
  class: decision
  state: open (owner: Bruno, relayed by Matheus)
- source_spec: `_bmad-output/implementation-artifacts/spec-e22s-seed-v12.md` (Story 22.8, OQ-1)
  summary: The notice follows Bruno's "0,5 ou 1 kV na BT": a winding rated at most 1000 V warns only above 1 kV, not above the DoR's 0,5 kV band (under which the 1 kV default would warn on every 220 V transformer). A two-level secondary ("380/220 V") is rated by its higher side.
  evidence: `packages/domain/src/relatorio/row-voltage.ts` `rowVoltageNotice`.
  class: decision
  state: open (owner: Bruno, relayed by Matheus)
- source_spec: `_bmad-output/implementation-artifacts/spec-e22s-seed-v12.md` (Stories 22.7 and 22.9)
  summary: The paid eval of the `bedrock-structuring-5` prompt (the oil plate in the synthetic set, the class reading) runs on Matheus's word before the wave B deploy, outside `verify`; this batch ran the fake-provider plumbing tests only.
  evidence: `apps/api/src/scripts/bedrock-eval.ts`.
  class: decision
  state: ~~open (owner: Matheus)~~ done (2026-11-07, coordinator, on Matheus's AWS login, before the deploy of `ae3d37e0`): `bedrock-structuring-5`, Textract, Haiku 4.5 and Nova Pro. The seed v12 oil plate reads 7 of 7 on both models (TIPO TRICAST, TIPO DO ÓLEO B; TIPO DE ISOLAÇÃO left out for the kernel to compose); the synthetic set is 32 of 33 on both, the one miss being the seccionadora panel (1 of 2 on both); the vector group table is unchanged (Dyn1, Dyn1, Yyn0 (diagram)). The real set (`docs/media/real-plates-2026-11-06/`, six plates) is 5 of 6 on both: Haiku matches the 2026-11-06 baseline exactly (tf3, the blurred rotated photo, gives no group). The class reading ("0,6C25" to EXATIDÃO 0,6) is in neither set, so it was not measured. Mean USD per reading: 0.0065 and 0.0042 (synthetic), 0.0082 and 0.0061 (real).
- source_spec: `_bmad-output/implementation-artifacts/spec-e22s-seed-v12.md` (Story 22.9)
  summary: The TC's default fake plate prints EXATIDÃO "10B100" (an ANSI class); on v12 the parser reads "10", not an option of the select, so the plate reading drops that field (`invalid_shape`) where v11 stored the text.
  evidence: `apps/api/src/jobs/reading/fixtures/92d3a9fb2cdc8ae0cf174211fe614107cb03edd31093dd126be275d53d7e2ecb.json`.
  class: decision
  state: resolved (2026-11-07, fix batch e22g, Bruno's test base rev03 item 8c): "10B100" is the old NBR protection notation and now reads as "10P", an option of the v12 TC select.

## Deferred from: Epic 22 fix batch e22f (2026-11-06)

- source_spec: `_bmad-output/implementation-artifacts/spec-e22f-wave-a-fixes.md` (integrated review of wave A, N5)
  summary: The palette's "Fotografar equipamento" result dialog offers only "Fotografar de novo": an office user who attached a file there has no "Anexar arquivo" to redo it. Outside Story 22.1's opener list. Owner: the next batch touching `panel-capture.tsx`.
  evidence: `apps/web/src/surfaces/relatorio/panel-capture.tsx` result dialog; `epic-22-wave-a-integrated-review-2026-11-06.md` N5.
- source_spec: `_bmad-output/implementation-artifacts/spec-e22f-wave-a-fixes.md` (integrated review of wave A, N6)
  summary: The file input's `cancel` event needs Chromium 113, Safari 16.4 or Firefox 91; where it never fires, a cancelled palette pick keeps `shotRef` set until the next open and the focus is not returned. Nothing visible stays open. Low risk; owner: the next batch touching `attach-file.tsx`, with a focus-return fallback on the window's next `focus`.
  evidence: `apps/web/src/surfaces/ficha/attach-file.tsx:93`; review N6.
- source_spec: `_bmad-output/implementation-artifacts/spec-e22f-wave-a-fixes.md` (integrated review of wave A, N7)
  summary: Section 10 replaces the fixed reference "nos itens 8 e 9" only when it sits whole inside one rich run; a template's own Conclusão text that styles part of the phrase (a bold "8 e 9") keeps the literal numbers. Owner: the next batch touching `print/section-10.ts`, joining the runs before the replacement.
  evidence: `packages/domain/src/print/section-10.ts` `positioned`; review N7.
  state: ~~open; assigned 2026-11-10 to Epic 24, Story 24.4 (on seed v14 only)~~ closed (2026-11-11, batch e24a, Story 24.4, on seed v14 only): `referenceAcrossRuns` in `print/section-10.ts` replaces the reference across the joined runs (flag `results_reference_across_runs`); the replaced phrase takes the marks of the run where it starts; v1 to v13 keep the per-run replacement and print the literal "8 e 9" as pinned by the v13 layout lock

## Deferred from: Epic 22 fix batch e22g (2026-11-07)

- source_spec: `_bmad-output/implementation-artifacts/spec-e22g-wave-b-fixes.md` (review S5; the E21-A4 P-3 row above, "a test red under load in two gates")
  summary: R8LAY-E2E-001's "title row top -33" red, measured: two runs of `--repeat-each 10` under the host lock (load 4.6 to 13) went red 2 and 6 times, every red at the same -33,03 px. The timeline logged every scroll, focus, key and resize: the page kept its scroll through every `setViewportSize`, blur and focus, in all 20 runs, so neither the review's settle-window hypothesis nor its helper-line one holds. The red is decided at 1280, before any resize: the Enter run's last `primary.focus()` ("Próxima ficha" in the Sticky action bar) scrolls the page by the same 399 px from wherever it stands, and it stands 200 px apart depending on whether the focus scroll of the last capture (a 19 px helper line appearing as the focus moves) ran first. The test now puts the title row 120 px under the viewport's top and waits for two still frames before its "a focus that arrives now" check; `--repeat-each 10` went 10 of 10. The app side the review suggested (`useFocusedClearOfStickyBar` ignoring a viewport resize) was not taken: no resize scrolled in 20 runs, so nothing proves it. Open: whether the Enter run's end should focus the Sticky action bar's primary with `preventScroll` (the bar is always on screen), which would make the page's place after a run deterministic; a UX question for Matheus.
  evidence: `.scratch-e22g/r8lay-run1.log`, `r8lay-run2.log` (the batch worktree, ignored); `e2e/review-layout-interaction-2026-10-08.spec.ts` `expectTableWhole`; `apps/web/src/surfaces/ficha/ensaios-section.tsx` (the run's `primary?.focus()`).
  class: decision
  state: ~~open (owner: Matheus)~~ closed (2026-11-08, fix batch e23f, PR #283): Matheus decided on 2026-11-08 that the run's end focuses the primary with `preventScroll`. `focusRunEnd` (`apps/web/src/surfaces/ficha/ficha-fields.tsx`) ends the readings', the measurement tests' and the plate fields' runs; a primary outside the viewport (the bar static below 480 px of height) is brought into view, so the focus is never off screen. R8LAY-E2E-001 asserts no page scroll, the primary in the viewport and `:focus-visible` at the run's end.

## Deferred from: Epic 22 fix batch e22h (2026-11-07)

- source_spec: `_bmad-output/implementation-artifacts/epic-22-wave-c-integrated-review-2026-11-07.md` (N7)
  summary: The api's `toSnapshot` loads every `equipment_type_version` row of the company for every snapshot and generate, and `buildSnapshot` keeps the referenced ones. Fine at today's scale (a few types per company); filter the query by the type ids the relatório's blocks reference when a company holds many versions.
  evidence: `apps/api/src/sync/snapshot.ts:45-47`.
  class: performance
  state: open (owner: the first batch that sees a company with more than about 50 published versions, or the next batch touching `sync/snapshot.ts`)
- source_spec: `_bmad-output/implementation-artifacts/epic-22-wave-c-integrated-review-2026-11-07.md` (E21-A4 P-3, "a test red under load in two gates")
  summary: `apps/web/src/surfaces/templates/template-composer-local.test.tsx` went red under load in two gates of Epic 22, both times green alone. Harden it (its waits on the composer's live query, the 15 s test timeout) so it does not depend on the host load.
  evidence: the Epic 22 wave gate logs; `template-composer-local.test.tsx`.
  class: test-hardening
  state: ~~open (owner: the next carry-over batch)~~ closed (2026-11-08, fix batch e23f, PR #283): the cause is not a timeout (e18fb had widened them; 10 busy loops at load 10.5 left it 17 of 17, three runs) but one-shot DOM reads right after the announcer: the composer announces when the edit's commit resolves, and redraws when its live query delivers the row, on its own schedule. An experiment that delays the live query 150 ms turned 3 of 17 red on the old file ("Unable to find ... list", the Epic 15 record's symptom) and 0 on the hardened one, where every DOM read after a write waits on the rendered state.
- source_spec: `_bmad-output/implementation-artifacts/epic-22-wave-c-integrated-review-2026-11-07.md` (N10)
  summary: The review asked that `formatCriterionValue` print `>=` and `<=` as "≥" and "≤", on the premise that seeded criteria use only `>`, `<` and `±`. That premise is wrong: the Quadro elétrico's NBR 5410 bands (seeds v5 and v6) are `>=` and have printed "Aceitável >=0,5 MΩ" and "critério: >=0,5 MΩ" on the sheet and in the DOCX since seed v5 (`e2e/qgbt.spec.ts`, `docx-qgbt.test.ts`, `quadro-eletrico.test.ts`). Changing the formatter moves every printed QGBT relatório (the protected layout: print changes only the asked delta), and changing it for company rows alone would print "≥" and ">=" side by side on a copy that carries the bands (S1). e22h left the formatter as it is. Decision for Bruno: "≥ 0,5 MΩ" everywhere (seeded and company, one formatter change, goldens and specs re-read), or ">=" as today.
  evidence: `packages/domain/src/seed/criteria.ts` `formatCriterionValue`; `packages/domain/src/seed/v6.ts` bands.
  class: decision
  state: open (owner: Bruno, via Matheus)
- source_spec: `_bmad-output/implementation-artifacts/epic-22-context.md` § Wave gates, the pre-deploy gate on `7ba788cf` (2026-11-07)
  summary: `e2e/photo-order.durability.spec.ts` @p0 21.3-E2E-005 went red once on durability-android-chrome in the matrix at load 4.5: after `movePhoto(page, plain, 'Subir', 2, 4)` the photo's badge read "2", yet `tileIds(page)` still returned the gallery's earlier DOM order (`plain` third). The helper waits on the status line and the badge, then `tileIds` reads the tiles once, so under load the read can land before the reordered list renders. Run alone under the lock on the same commit it passed 8 of 8 (four runs). Proposed fix: read the order with `expect.poll(() => tileIds(page)).toEqual(moved)` at every assertion after a move.
  evidence: the gate log `matrix.log` of 2026-11-07; `e2e/photo-order.durability.spec.ts:105-110` and `:158`.
  class: test-hardening
  state: ~~open (owner: the next carry-over batch)~~ closed (2026-11-08, fix batch e23f, PR #283): the five one-shot `tileIds` reads (after the imports, after the moves, 21.3-E2E-005 and -006) are `expect.poll`, as the proposed fix said; `tileIds` says it is read only that way.

## Deferred from: the production check of Bruno's relatório after the deploy of `ae3d37e0` (2026-11-07)

Seen by the coordinator in the preview PDF of a real relatório on seed v5 (revisão 3, signed in with Bruno's account on Matheus's word, read only, no revision generated). The client text is not copied here.

- source_spec: `_bmad-output/implementation-artifacts/epic-22-context.md` § Deploy (production check, 2026-11-07)
  summary: The derived "Equipamento reprovado" point of section 9 prints the sheet's OBSERVAÇÕES with its line breaks lost: the bullet and the table cell read "Item 1: <text> Item 3: <text> Item 12: <text> <free sentence>", one run of text with no separator between the item lines.
  evidence: `packages/domain/src/print/section-8.ts:161` (`reprovado` label) and the derived point's text built from the observation (`packages/domain/src/points/derived.ts`). The ficha's own OBSERVAÇÕES box prints the same lines one per line.
  class: defect
  state: ~~open (owner: the first Epic 23 fix batch)~~ closed (2026-11-08, fix batch e23f, PR #283): the kernel's text already kept the line breaks; the DOCX renderer wrote each bullet and action-plan cell as one run, whose line feed LibreOffice prints as a space. `lineRuns` (`apps/api/src/jobs/generate/sections/section-8.ts`) prints each break as `<w:br/>` inside the bullet and the cell; a text with no break is the one run it was. The renderer serves every section 8 bullet, so a point typed on several lines (or the Reprovado entry kept as a point with "Editar") prints its lines too.
- source_spec: `_bmad-output/implementation-artifacts/epic-22-context.md` § Deploy (production check, 2026-11-07)
  summary: A sheet's derived conclusion text doubles the punctuation when an NC item's observation ends with a period: "<observation>. (item 9, NC)".
  evidence: `packages/domain/src/relatorio/conclusion.ts:458` puts `item.observation` before " (item N, NC)" as typed, final period included.
  class: defect
  state: ~~open (owner: the first Epic 23 fix batch)~~ closed (2026-11-08, fix batch e23f, PR #283): `ncClauseText` drops the observation's final period(s) ("etc." keeps its own; an observation that is only a period says the item's label). The basis is unchanged, so a text confirmed before the fix keeps printing as confirmed (new row below).
- source_spec: `_bmad-output/implementation-artifacts/epic-22-context.md` § Deploy (production check, 2026-11-07)
  summary: A manual point whose text ends with a period before its photo prints differently in the two places of section 9: the bullet reads "<text>, conforme Imagem 13." while the table's "Ponto de atenção" cell reads "<text>.Imagem 13" with no space (another point in the same table reads "<text>. Imagem 12").
  evidence: `packages/domain/src/print/section-8.ts:100-110` (the bullet's "conforme Imagem N" rule for a token after a period) against the table cell's own token resolution in the same file.
  class: defect
  state: ~~open (owner: the first Epic 23 fix batch)~~ closed (2026-11-08, fix batch e23f, PR #283): `resolvePhotoTokens` puts one space before "Imagem N" glued to a letter, a digit, a closing bracket or a sentence mark (`GLUED_BEFORE_REF`), as the point editor spaces a chip (F-09); the cell reads "<text>. Imagem 13". The bullet is unchanged.

## Deferred from: Epic 23 fix batch e23f (2026-11-08)

- source_spec: `_bmad-output/implementation-artifacts/spec-e23f-fixes.md` (decision 3)
  summary: A conclusion text confirmed before e23f keeps "<observation>. (item N, NC)" in print: section 9 prints the stored text the engineer confirmed, and the fix moved only the composition (the basis hashes the NC rows, not the text, so the stored text stays confirmed). Bruno's relatório of the 2026-11-07 production check prints it until its engineer edits the text. Whether a confirmed text equal to the old composition should be recomposed on print is a product decision; e23f did not take it (it would rewrite confirmed texts). Related (e23f review, Edge Case Hunter 8): a conflict between two such confirmed texts shows the recomposed text in the dialog (`merge/conflicts.ts`), while the stored one prints.
  evidence: `packages/domain/src/relatorio/conclusion.ts` `printedConclusionText`, `conclusionTextState`.
  class: decision
  state: ~~open (owner: Matheus)~~ closed (2026-11-08, Matheus: kept as stored): a confirmed text is the technician's and does not change by itself; reopening the conclusion offers the regenerated text, as with any outdated conclusion. No code change.
- source_spec: `_bmad-output/implementation-artifacts/spec-e23f-fixes.md` (decision 4, seen while fixing (c))
  summary: Two glued photo references e23f left as they are, both only reachable when the text is typed or pasted without the editor's spacing (F-09 spaces every chip it inserts): the bullet's lead-in path appends the label with no space after a lead-in word glued to the token ("ver[[foto]]" prints "verImagem 1", `resolveBulletPhotoTokens` `leadsIn`), and a word glued after a token prints "Imagem 1texto" in the bullet and the cell; a removed photo's word glues the same way ("Porta.imagem removida"). Low; owner: the next batch touching `print/section-8.ts`.
  evidence: `packages/domain/src/print/section-8.ts` `resolveBulletPhotoTokens`, `resolvePhotoTokens`; `e23f-print-fixes.test.ts` pins today's output of the removed word.
  class: defect
  state: ~~open (owner: the next batch touching `print/section-8.ts`); assigned 2026-11-10 to Epic 24, Story 24.17 (the proposal offers it to Story 24.16 only if that story touches `print/section-8.ts`; Story 24.17 edits the file in the same batch; on seed v14 only)~~ resolved on seed v14 (2026-11-11, batch e24p, Story 24.17, flag `recommendation_as_action`): a reference or a removed photo's text glued to a word on either side prints with one space, in the bullet and in the table (`resolvePhotoTokens`, `resolveBulletPhotoTokens` with `spaced`); v1 to v13 print as before.
- source_spec: `_bmad-output/implementation-artifacts/spec-e23f-fixes.md` (review loop, Edge Case Hunter 7; pre-existing)
  summary: An NC row's observation typed with line breaks reaches the conclusion's NC clause with them, and section 9 prints the conclusion text line by line (`cellParagraphs` splits each `\n` into a paragraph), so the sentence breaks in the middle. Pre-existing (the clause always took the observation as typed); outside e23f's three deltas. Fix candidate: the clause joins the observation's lines with "; ".
  evidence: `packages/domain/src/relatorio/conclusion.ts` `ncClauseText`; `apps/api/src/jobs/generate/sections/section-9.ts` `cellParagraphs`.
  class: defect
  state: ~~open (owner: the next batch touching `relatorio/conclusion.ts`); assigned 2026-11-10 to Epic 24, Story 24.4 (on seed v14 only: the text is composed for every seed)~~ closed (2026-11-11, batch e24a, Story 24.4, on seed v14 only): an NC observation's lines enter the clause joined by "; ", each without its final period, ";" or "," (flag `nc_clause_on_one_line`); v1 to v13 compose as before, pinned by the v13 layout lock's two-line observation

## Deferred from: Epic 23 batch e23a (2026-11-08)

- source_spec: `_bmad-output/implementation-artifacts/spec-e23a-criteria-tables.md` (Tasks, `ops/apply.ts`; narrowing)
  summary: The fold refuses a malformed manufacturer's value only on a v13 (or later) sheet. A v1 to v12 sheet folds any `criterion_override` as before, because the replay fixture's log (`fixtures/replay-small/op-log.ts`, a v1 block) holds one in an older shape (`{operator, value, unit, source}`) and its golden must replay byte-equal; the readers keep ignoring a malformed value there (`effectiveCriterion`), and the sheet's entry refuses one inline on every version, so no surface writes one.
  evidence: `packages/domain/src/ops/apply.ts` `assertManufacturerValue` (`MANUFACTURER_CHECK_FROM`); `relatorio/criteria-tables.test.ts` "a v12 (or older) sheet folds any value as before".
  class: decision
  state: ~~open (owner: Matheus, confirm the reading)~~ closed (2026-11-10, Matheus: accepted, no change): only a new sheet (v13 or later) refuses a malformed manufacturer's value; an older sheet keeps accepting it.
- source_spec: `_bmad-output/implementation-artifacts/spec-e23a-criteria-tables.md` (Design Notes, authored texts)
  summary: The authored pt-BR texts of the batch, listed for Bruno: the two fallback helpers ("Sem a tensão nominal na placa, vale {crit}. Informe-a para julgar pela {Tabela 100.x}." and "Sem o tipo de isolação na placa, vale {crit}. Informe-o para julgar pela Tabela 100.5."), the row helper ("Tabela 100.5 (ANSI/NETA MTS-2023), seco, 13,8 kV: ≥ 25.000 MΩ"), "por linha" / "POR LINHA", the four manufacturer notes, the source line "Fabricante — digitado nesta ficha, vale para todas as linhas deste ensaio.", the two refusals, the print suffix " (fabricante)", the entry's accessible name "Valor do fabricante, {ensaio}", the company-type validation sentences of a criterion table, and IP "N/A". The note text is the base's (decision F).
  evidence: `packages/domain/src/relatorio/reading-evaluation.ts` (batch e23a block), `print/section-9.ts` `ACCEPTABLE_PER_ROW`, `types/validate.ts`, `apps/web/src/copy/pt-br.ts` `copy.ficha.ensaios.manufacturer*`.
  class: decision
  state: open (owner: Bruno, through Matheus)
- source_spec: `_bmad-output/implementation-artifacts/spec-e23a-criteria-tables.md` (coordinator-free readings of the implementation)
  summary: Three readings the spec leaves open: (1) a manufacturer's value on a QGBT band test whose plate picks no band takes the first band's operator and unit, so the value still judges; (2) the instrument-limit note quotes the first reading above the limit judged within, so a test holding two different limits names one; (3) the manufacturer's note on a table test names every distinct row minimum the table asks ("≥ 25.000 MΩ e ≥ 500 MΩ").
  evidence: `relatorio/reading-evaluation.ts` `manufacturerCriterion`, `limitNoteOf`, `manufacturerValueView`.
  class: decision
  state: ~~open (owner: Matheus)~~ closed (2026-11-10, Matheus: accepted, no change): the three readings stay as built, among them the instrument-limit note that names only the first limit of a test holding two.
- source_spec: `_bmad-output/implementation-artifacts/spec-e23a-criteria-tables.md` (gate; pre-existing at `027d916c`)
  summary: Three unit tests failed on the batch's first commit because they read the current seed version, which became v13 there: `templates/text.test.ts` (the summary says "Semente v13"), `types/company-types.test.ts` (the fixture's relatório is pinned at v12) and `print/print-fit.test.ts` (v13 carries v12's TENSÃO column and steps as v12 does). Fixed in this batch, expectations only.
  evidence: the three test files.
  class: defect
  state: closed (2026-11-08, batch e23a)
- source_spec: `_bmad-output/implementation-artifacts/spec-e23a-criteria-tables.md` (review fix loop, item 7c)
  summary: A v13 table whose rows pick different minimums prints a per-row ACEITÁVEL column; beside MANUT. ANTERIOR the transformer's insulation table has 11 columns and broke every word at the 7 pt floor, so those per-row tables alone may shrink to 6,5 and 6 pt (`PER_ROW_TEXT_STEPS_HALF_POINTS`). v1 to v12 tables keep their steps (layout lock green). 6 pt print needs an OK, or another layout (for example the row minimums in the header, or a line under the table).
  evidence: `packages/domain/src/print/section-9.ts` `PER_ROW_TEXT_STEPS_HALF_POINTS`; `print/criteria-tables-print.test.ts` "e23a review fixes: the band test, the previous visit".
  class: decision
  state: ~~open (owner: Matheus, with Bruno)~~ closed (2026-11-10, fix batch e23p, P2, on Matheus's approval of the behaviour-pass fixes): the table is now fitted by Arial's advance widths with every column counted against the page (`print/text-metrics.ts`, `WHOLE_FIT_TABLES` in `print/section-9.ts`). The PDF previewed through LibreOffice (`apps/api/src/jobs/generate/v13-insulation-print.integration.test.ts`) prints every word of the four shapes whole: one criterion at 7,5 pt (ten columns), ACEITÁVEL per row at 7 pt (eleven), one criterion with MANUT. ANTERIOR at 7 pt (eleven), ACEITÁVEL with MANUT. ANTERIOR at 6 pt (twelve). On `b307ced1` the same PDF broke "SECUNDÁRIO" and "22,6". *(2026-11-10, Matheus: accepted these four sizes, 7,5 pt, 7 pt, 7 pt and 6 pt, with every word whole.)*

## Deferred from: Epic 23 batch e23b (2026-11-08)

- source_spec: `_bmad-output/implementation-artifacts/spec-e23b-nameplate-applicability.md` (Story 23.8)
  summary: Seed v13's tap rows carry no previous visit. `readingSlotsOf` walks a table's seeded rows, so for the transformer's TTR (`rows_from: 'taps'`) it records only v12's typed row 0 in `last_results`; a tap row (keyed by its volts, 13800) gets no "Anterior" helper on the sheet and no MANUT. ANTERIOR in section 9. A slot per tap needs a row key by the tap's volts and a rule for a tap the next plate no longer lists.
  evidence: `packages/domain/src/print/last-results.ts` `readingSlotsOf`, `previousReadingsByAddress`; `packages/domain/src/print/section-9.ts` `testParts` (`previousTexts` reads a `rows_from` table by its evaluated rows, which find no slot).
  class: gap
  state: ~~open (owner: the next batch touching `print/last-results.ts`, after Bruno says how a previous tap reading should show)~~ closed (2026-11-08, batch e23b review fix): `readingSlotsOf` takes the block, so a `rows_from` table's slots are its plate and off-plate rows keyed by the tap's volts (`relacao_transformacao:@13800`); `last_results` keeps each tap's readings and the next relatório finds them on the same tap whatever its position, in the "Anterior" helper and MANUT. ANTERIOR (`seed-v13-e23b.test.ts`). How Bruno wants a previous tap reading to show stays his to say.
- source_spec: `_bmad-output/implementation-artifacts/spec-e23b-nameplate-applicability.md` (Story 23.7, "No default fake reading fixture of an existing type changes")
  summary: The cables gain a nameplate on seed v13 but no default fake plate fixture. On the compose stack (`fake` providers) a cable plate photographed in the app (re-encoded bytes) finds no fixture and its reading fails permanently; only the committed `images/plate-cabos-v13.png` replays, for its own bytes. Adding a cable default is a fixture decision the spec ruled out for this batch.
  evidence: `apps/api/src/jobs/reading/kinds/plate.ts` `fakeDefaults`; `apps/api/src/jobs/reading/fixtures/README.md` § The seven seed v13 plates.
  class: gap
  state: ~~open (owner: Matheus)~~ decided (2026-11-10, Matheus: yes, inside Epic 24, no extra batch): add the cable's default fake plate fixture. ~~Open (owner: Epic 24, wave 2); assigned 2026-11-10 to Epic 24, Story 24.13~~ closed (2026-11-11, batch e24s, Story 24.13: `kinds/plate.ts` `fakeDefaults` lists `cabos_entrada` and `cabos_saida` on the v13 cable plate, `images/plate-cabos-v13.png`, so a cable plate photographed on the local stack reads; `plate-every-type.spec.ts` covers both cables; the job test that a photo with no fixture fails permanently now reads a cable instead, since no seeded type with a plate is left without a default)
- source_spec: `_bmad-output/implementation-artifacts/spec-e23b-nameplate-applicability.md` (baseline `5f86c821`, e23a's first commit `027d916c`)
  summary: Three unit tests failed at the baseline because e23a's first commit made `SEED_VERSION` v13 without updating them: `templates/text.test.ts` (the seed name "Semente v13"), `print/print-fit.test.ts` (v13 excluded with v12 from the fit sweep) and `types/company-types.test.ts` (a v12 duplicate asserted on `seed_version: 'v12'`). This batch fixed them to pass its gate; e23a may fix the same lines, so the merge of the two batches must keep one version of each.
  evidence: the three test files, each failing when run alone on the baseline with this batch's changes stashed.
  class: process
  state: ~~open (owner: the coordinator, at the e23a and e23b merge)~~ closed (2026-11-09, merge of main `17127590` into e23b): main's versions of the three files taken whole; e23a fixed them on its own branch.
- source_spec: `_bmad-output/implementation-artifacts/spec-e23b-nameplate-applicability.md` (Story 23.7 AC 4; "Do not run the paid eval")
  summary: The plate prompt moved to `bedrock-structuring-6` (field notes for TAPS, TAP ATUAL, MATERIAL DO ENROLAMENTO, the √3 secondary and the dash ratio) and `bedrock-eval.ts` gained the seven synthetic v13 plates, but the paid evaluation was not run: providers stayed `fake`. It is due before the Epic 23 deploy, against the prompt-5 baseline.
  evidence: `apps/api/src/jobs/reading/providers/bedrock.ts` `BEDROCK_STRUCTURING_PROMPT_VERSION`, `plateFieldNotes`; `apps/api/src/scripts/bedrock-eval.ts`.
  class: verification
  state: ~~open (owner: the coordinator, before the Epic 23 deploy)~~ done (2026-11-10, coordinator, on Matheus's AWS login): prompt 6 was never measured alone; the eval ran on `bedrock-structuring-8`, which carries 6's field notes, with the v13 plates in the synthetic set. Its log stamps 05:50 to 05:54 UTC on 2026-11-10, so it ran after the deploy of `ef099d41` (which already served prompt 8) and before the deploy of `47be2638` (no prompt change). Against the prompt-5 baseline of 2026-11-07: the real set holds for Haiku (5 of 6, tf3 still gives no group) and rises to 6 of 6 for Nova Pro; the synthetic set grew from 33 to 82 fields, so its 97,6 % (Haiku) and 98,8 % (Nova Pro) do not compare one to one. The table is in `epic-23-context.md` § Deploy.
- source_spec: `_bmad-output/implementation-artifacts/spec-e23b-nameplate-applicability.md` (screens from `60-ficha.html` #/ficha/TR1 and #/ficha/SEC-C05)
  summary: Only the mock rules this batch renders are translated into `app.css` (`.v13-line`, `.tap-cell`, `.tap-mark`, `.tap-optional`, `.ficha-ttr-taps`, the tap cards, `.v13-na*`, `.band-text`, `.band-sub`, `.v13-applied-band`, `.is-applied`). The TR1 frame's manufacturer value (`.v13-mfr`, Story 23.3), the oil-sampling choice (`.v13-choice`, `.v13-reason`) and "Como ensaiar" (Story 23.10) keep their rules untranslated until their stories render them.
  evidence: `apps/web/src/styles/app.css` (the e23b block); `mockups/prototype/screens/60-ficha.html` CSS lines 236 to 305.
  class: note
  state: open (owner: Stories 23.3, 23.10 and the oil-sampling story)
- source_spec: `_bmad-output/implementation-artifacts/spec-e23b-nameplate-applicability.md` (Design Notes, "Open with Bruno, kept as read")
  summary: Read as the spec says until Bruno answers: both equipment temperatures optional (the base marks them required; Story 23.5 falls back to the ambient), DESLIGADOR ÍNTEGRO as SIM or NÃO (the base's "sem desligador" is the field's N/A), an unmeasured unmarked tap row printed "-", the TTR Yd factor (B-2) and the TP insulation criterion (B-4) untouched. The authored pt-BR wordings of the batch are listed in its PR for him.
  evidence: `packages/domain/src/seed/v13.ts` (the e23b section); `packages/domain/src/print/section-9.ts` `measurementTable`.
  class: decision
  state: open (owner: Bruno, through Matheus)
- source_spec: `_bmad-output/implementation-artifacts/spec-e23b-nameplate-applicability.md` (the e2e grep of the DoD, E15-A3)
  summary: The e2e journeys that count taps against a measured budget or baseline (`tap-budget.spec.ts` TAP_BUDGET J1 and J3, `tap-budget-signal.spec.ts` SM-3, `journey-taps.spec.ts` and `journeys-12-3-12-4.spec.ts` J1 to J3) and the reading pipelines that count the transformer default fixture's eleven suggestions (`plate.spec.ts` 8.6-E2E-001, `plate-reading.spec.ts` 8.4-E2E-001, `reading-wait.spec.ts` 13.5-E2E-001, `panel-capture-pipeline.spec.ts` 9.2-E2E-004) are pinned to seed v12, the seed they were measured or written on; so are the tests built on v12's text TAP ATUAL. On v13 the seccionadora's required TIPO DE SECCIONADORA is not in a plate copied from an earlier visit, so J1 needs one more pick (two taps), and the default transformer fixture gives ten suggestions (its text TAP ATUAL is dropped as `unknown_key`). The budgets were not re-measured on v13.
  evidence: the specs named, each with its dated comment; `e2e/tap-budget.spec.ts` `TAP_BUDGET`.
  class: verification
  state: ~~open (owner: the Epic 23 QA, with the v13 re-measure of the field journeys)~~ re-measured (2026-11-10, Epic 23 QA, at 768 px on desktop-chrome, each journey run on a v13 relatório with the one change it needs: TIPO DE SECCIONADORA picked SEM CARGA in J1, a native select counted two taps, its tap and its option): `tap-budget.spec.ts` J1 (plate copied from a v2 visit) 9 taps, 36 keystrokes on v12, 11 and 36 on v13; J3 7 and 47 on both. `journey-taps.spec.ts` J1 (plate typed) 21 and 83 on v12, 23 and 83 on v13; J3 7 and 47 on both. `journeys-12-3-12-4.spec.ts` J1 21 and 83 on v12, 23 and 83 on v13; J3 7 and 47 on both (2 and 11 of them the per-unit fields, so the target of at most 5 holds); J2 10 and 47 on both (one chip, nothing typed in the observation). `tap-budget-signal.spec.ts` SM-3: 20 taps, 9 keystrokes on v12, 22 and 9 on v13, over its 20-tap budget by the same two taps. On v13 the copied plate leaves 1 missing on Placa and the sheet shows 12 missing on Ensaios before the pick (the HH fuses apply while TIPO DE SECCIONADORA is empty) and 9 after it, as on v12. Only J1 and SM-3 change, by that pick alone. The transformer's default plate gives 10 pending suggestions on a v13 sheet (11 on v12), now pinned beside the v12 count in `job.integration.test.ts` "E78-Q2 on seed v13". The e2e pins stay on v12, unchanged; ~~open only for one decision (owner: Matheus): whether the budgets move to v13, which means TAP_BUDGET J1 11 taps and SIGNAL_BUDGET 22 taps, or a plate copied from a pre-v13 visit should fill TIPO DE SECCIONADORA some other way~~ decided (2026-11-10, Matheus): the limits measured on seed v13 are accepted, TAP_BUDGET J1 11 taps and SIGNAL_BUDGET (SM-3) 22 taps. The budget documents are amended with seed v14 in Epic 24. ~~Open (owner: Epic 24, with seed v14); assigned 2026-11-10 to Epic 24, Story 24.10, batch e24s (the tap budgets get their seed v14 run with the numbers accepted on v13)~~ closed (2026-11-11, batch e24s, Story 24.10: each of the four journey specs keeps its v12 run and gains a v14 run beside it, 24.10-E2E-002 to 005, with the numbers accepted on v13: J1 within 11 taps, SM-3 within 22, J1 of `journey-taps.spec.ts` and `journeys-12-3-12-4.spec.ts` at 23 taps and 83 keystrokes, J2 and J3 as on v13; dated comments in each spec)
- source_spec: `_bmad-output/implementation-artifacts/spec-e23b-nameplate-applicability.md` (review pass of 2026-11-09)
  summary: The NA band of a measurement-grammar test (`measurement-test-section.tsx`) has no browser coverage: the kernel is tested and the e2e drives the seeded grammar only.
  evidence: no seeded v13 test carries `applies_when`; only a company draft put reaches that branch today.
  class: verification
  state: ~~open (owner: the first of Stories 23.15 to 23.21 that attaches a condition to a measurement test)~~ closed (2026-11-10, Epic 23 QA, with evidence, no change): seeded v13 measurement tests now carry `applies_when` (`coleta_oleo` on the transformer and the disjuntor, `resistencia_fusiveis` on the seccionadora, `termografia` on the eight types), and three `@p0` specs drive their NA band in the browser: `fuse-resistance.spec.ts` 23.19-E2E-001 (SEM CARGA: `data-applicability="na"`, the band's kernel phrase, "Aplicar este ensaio" and "Seguir a placa" writing the override), `oil-liquid-sampling.spec.ts` 23.17-E2E-001 (EPÓXI and the disjuntor's Vácuo) and `thermography.spec.ts` 23.20-E2E-001 and e23z-E2E-001; at component level `measurement-test-section.test.tsx` "23.9 …" (the band in place of the body, the switch kept; switched off, no band). All ran green in the final integrated `test:e2e:full` on `47be2638` (`epic-23-context.md`, 652 of 656 passed, 0 failed)
- source_spec: `_bmad-output/implementation-artifacts/spec-e23b-nameplate-applicability.md` (review pass of 2026-11-09; Story 23.8 "accepts exactly the rows the plate gives")
  summary: A tap reading typed offline while another device removes that tap from TAPS is refused by the fold when it syncs (`op_invalid`) and dropped by the device; and a reading on an off-plate row (or the pre-TAPS row 0) cannot be cleared unless the tap is put back, while it is still judged and printed.
  evidence: `packages/domain/src/ops/apply.ts` `assertCellGeometry` on a `rows_from` table; `relatorio/tap-rows.ts` `tapRowAccepted`; the off-plate cell is drawn read-only (`ensaios-section.tsx`).
  class: decision
  state: ~~open (owner: Matheus, with Bruno: whether an off-plate row takes a clear, or any write)~~ closed (2026-11-10, Matheus: accepted, no change): a tap reading typed offline while another device removes that tap from the plate is dropped at sync. The case is rare. The second half of this row, a reading on an off-plate row that could not be cleared, was built by fix batch e23z (item 3, "Apagar leitura"; § "Epic 23 fix batch e23z").

## Deferred from: Epic 23 fix batch e23g (2026-11-09)

- source_spec: `_bmad-output/implementation-artifacts/spec-e23g-wave1-fixes.md` (R2-1, "Rows in table order")
  summary: `measurementSuggestions` (every pending Measurement fill of a block) still sorts by the numeric row key, so on a v13 TTR whose taps descend its list reads 11400 before 13800. Its consumers do not depend on that order today (`read-display.tsx` keys its map by cell, `suggestion-store.ts` reads one entry); "Confirmar todos" and its verify count re-sort a table's fills by the table's row order (`tableFills`). A consumer that walks the list in reading order would need the same table-order sort.
  evidence: `packages/domain/src/relatorio/measurement-suggestions.ts` `measurementSuggestions`, `tableFills`.
  class: note
  state: open (owner: the next batch reading `measurementSuggestions` in order)
- source_spec: `_bmad-output/implementation-artifacts/spec-e23g-wave1-fixes.md` (review, Edge Case Hunter, low)
  summary: the TTR table on the sheet still chooses its tap-row markup by `row.tap !== null` in `apps/web` (the position cell, V PRIMÁRIO and V SECUNDÁRIO drawn as text, the tap card): e23b's render branches. e23g moved the tap count and the "optional" and "tap table" predicates to the kernel; the input-as-text branch partly mirrors `tapCellTyped`, whose off-plate reading differs, so it was left as e23b drew it.
  evidence: `apps/web/src/surfaces/ficha/ensaios-section.tsx` `MeasurementTable` (row.tap branches); `packages/domain/src/relatorio/tap-rows.ts` `tapCellTyped`.
  class: note
  state: open (owner: the next batch touching the TTR's markup, Epic 23 wave 2 or later)
- source_spec: `_bmad-output/implementation-artifacts/spec-e23g-wave1-fixes.md` (late finding, noticed while folding it in, not verified on screen)
  summary: a company copy of the transformer that removes its DESLOCAMENTO ANGULAR (`ligacao_secundaria`) field keeps a TTR read by vector group (`ratio_factor: 'vector_group'`) with no field to pick the group from: VAL CALCULADO never computes and the step counts the group missing for good, the R2-2 class for a seeded-grammar key. `removeDraftEntry` does not prune `ratio_factor`.
  evidence: `packages/domain/src/types/draft-edit.ts` `removeDraftEntry`; `relatorio/reading-cells.ts` `ratioGroupOf` reads `VECTOR_GROUP_FIELD`; `relatorio/vector-group.ts` `vectorGroupFieldLabel` falls back to "LIGAÇÃO SECUNDÁRIA" when the field is gone.
  class: decision
  state: ~~open (owner: Matheus: refuse that removal, or drop the table's `ratio_factor` with it)~~ closed 2026-11-10 by fix batch e23z (item 4, Matheus: refuse): `removeDraftEntryRefusal` and the editor's toast; a draft that already lost the field is a new row under § "Epic 23 fix batch e23z"

## Deferred from: Epic 23 batch e23v (2026-11-09)

- source_spec: `_bmad-output/implementation-artifacts/spec-e23v-three-levels.md` (Tasks, `print/section-9.ts`: "the TF table fits at 8 pt (16 half points)")
  summary: The transformer's insulation table with the "20 °C" column does not fit the 60 em rule at 8 pt by the kernel's own measure (`fittedColumns`): v12's table needs 58,9 em at 8 pt and the column adds at least 2,2 em with its margins (61,6 em with the frame's readings), so it steps on to 7,5 pt (15 half points), every word whole; judged row by row (its ACEITÁVEL column) it steps further, as e23a's per-row steps allow. Nothing else was changed to reach 8 pt (the rule and its measure are e22g's); `three-levels.test.ts` pins 7,5 pt with the reason.
  evidence: `packages/domain/src/print/section-9.ts` `fittedColumns`, `READING_FIT_WIDTH_EM`; `packages/domain/src/relatorio/three-levels.test.ts` "section 9 at the fit".
  class: decision
  state: ~~open (owner: Matheus: 7,5 pt as the rule gives it, or a narrower layout)~~ closed 2026-11-09 by fix batch e23w (W2-K2, Matheus's option (b)): the "20 °C" column is measured outside the 60 em budget and the table prints at 8 pt
- source_spec: `_bmad-output/implementation-artifacts/spec-e23v-three-levels.md` (Design Notes, "Rules as read")
  summary: The narrowings of the batch, as the spec reads the base: correction only on TR-OL-02, TR-SE-02, DJ-02 and SC-02 (DJ and SC by the solid factor, at the ambient); a transformer whose TIPO DE ISOLAÇÃO is empty is not corrected; a reading above the instrument's limit is never corrected and prints "-" at 20 °C; CB-02's history (its only term, "queda acentuada", is open item B-1) and DJ-02/SC-02's "fases com diferença > 50 %" (no number in the rule) are not built; TR-OL-02's history serves TR-SE-02; the cable and arrester comparison is below 50 % of the largest other row (FASE RESERVA included); a failed prerequisite is the test's `reading` entry, never a new derived kind; a test with a `reading` entry derives no `restricao` entry; the TEMPERATURA cell and the "20 °C" column also print on the disjuntor's and the seccionadora's tables. Two readings of the implementation: a temperature outside -10 °C to 110 °C still prints in TEMPERATURA (with its source) while the "20 °C" column prints "-"; the corrected value is rounded to three significant figures, and that rounded value is what is judged and shown.
  evidence: `packages/domain/src/seed/v13.ts` (the e23v section), `relatorio/temperature-correction.ts`, `relatorio/restriction.ts`, `points/derived.ts`.
  class: decision
  state: open (owner: Bruno, through Matheus)
- source_spec: `_bmad-output/implementation-artifacts/spec-e23v-three-levels.md` (Boundaries, authored strings listed for Bruno)
  summary: The authored pt-BR texts of the batch: the temperature line's sources ("do óleo, na placa", "do enrolamento, na placa", "do ambiente de ensaio, no local"), its requests ("Informe a temperatura do óleo na placa ou a do ambiente de ensaio no local: sem ela, …", "Informe o tipo de isolação na placa: sem ele, …") and its out-of-table note; the column header "Corrigido a 20 °C", the card lead "A 20 °C:", the print header "20 °C" and the TEMPERATURA cell ("40 °C (ÓLEO)", "(ENROLAMENTO)", "(AMBIENTE)"); the out helper "Abaixo do aceitável a 20 °C: {valor} ({critério})" and " a 20 °C" after a judged value; the three restriction reasons and helper details ("queda de mais de 50 % desde a manutenção anterior", "abaixo de 50 % da maior leitura", "mais de 50 % acima do menor polo", each with the row and value compared), the closing sentence (`60-ficha.html`'s, verbatim); the prerequisite clause "pré-requisito não atendido ({campo}: {valor})"; the floor words "pré-requisito do ensaio não atendido" and "leitura com restrição"; the conclusion clauses "com restrição no {ensaio} ({linhas})" and "{pré-requisito} no {ensaio}"; the point's text "{Ensaio}: valor dentro do critério, com restrição ({motivos})", its chip "Com restrição" and its section 8 head "Ensaio com restrição"; the type editor's four validation sentences.
  evidence: `packages/domain/src/relatorio/temperature-correction.ts`, `relatorio/restriction.ts`, `relatorio/conclusion.ts`, `relatorio/reading-run.ts`, `points/derived.ts`, `print/section-8.ts`, `types/validate.ts`, `apps/web/src/copy/pt-br.ts` `restrictedLead`.
  class: decision
  state: open (owner: Bruno, through Matheus)
- source_spec: `_bmad-output/implementation-artifacts/spec-e23v-three-levels.md` (gate, `pnpm test:unit` 2026-11-09)
  summary: One web test failed once in the full unit run under load and passed alone (`relatorio-tree-edges.test.tsx` "Desfazer after a move focuses the row's Position box", 9,5 s): the relatório tree, untouched by this batch.
  evidence: `.scratch-e23v/unit-all-1.log`, `.scratch-e23v/unit-tree-edges.log` (11 of 11 alone).
  class: flake
  state: ~~open (owner: the next carry-over batch, E15-A4)~~ closed (2026-11-10, fix batch e24f, E23-A4): "Desfazer" was read at once after the announcement, before its toast renders; the test now waits for it (`spec-e24f-retro-fixes.md` § Auto Run Result)
- source_spec: `_bmad-output/implementation-artifacts/spec-e23v-three-levels.md` (Review Triage Log 2026-11-09, Edge Case Hunter)
  summary: The parecer names a para-raio Reprovado only by its failed prerequisite (DESLIGADOR ÍNTEGRO NÃO) in the reasonless group ("Reprovado (PR-1)."), as if the engineer had chosen Reprovado. A fix needs a reason group, an authored word and a parecer-basis key present only when used.
  evidence: `packages/domain/src/relatorio/parecer.ts` (the `byReason` loop: ratio, reading, defect, other).
  class: defect
  state: ~~open (owner: the Epic 23 wave 2 fix batch)~~ closed 2026-11-09 by fix batch e23w (W2-K1): the parecer's `prerequisite` group, "por pré-requisito do ensaio não atendido"

## Deferred from: Epic 23 batch e23h (2026-11-09)

- source_spec: `_bmad-output/implementation-artifacts/spec-e23h-field-help.md` (review, Verification Gap VG-3, low)
  summary: no test checks that an over-cap "Como ensaiar" heading or recommendation shows its issue inline under its own field in the type editor; only the kernel paths of `validateTypeDraft` are tested. A wrong `issuesAt` prefix would lose the placement only (the message still lists on the test's row and the kernel blocks "Publicar").
  evidence: `apps/web/src/surfaces/templates/type-editor-parts.tsx` `TestTextsFields` (`issuesAt(issues, [part, index, 'help', key])`, `[part, index, 'recommendation']`); `packages/domain/src/types/company-types.test.ts`.
  class: verification
  state: ~~open (owner: the next batch touching the type editor's Ensaios tab)~~ closed (2026-11-10, Epic 23 QA): `apps/web/src/surfaces/templates/type-editor-test-texts.test.tsx` renders `TestsPanel` with the kernel's `validateTypeDraft` issues and checks, in both grammars, that an over-cap heading (one, then two of one test) and an over-cap recommendation each show their sentence in their own field's `.field` box and in no other heading's; mutating the help prefix to `[part, index, 'help']` fails three of its four tests
- source_spec: `_bmad-output/implementation-artifacts/spec-e23h-field-help.md` (review loop, patched, not re-reviewed)
  summary: "Como ensaiar" on the head of a test the nameplate makes NA is unit-tested in the measurement grammar only; the seeded-grammar NA head (`ensaios-section.tsx` `NotApplicableTest` with `headEnd`) has no component test, because `EnsaiosSection` has none, and no e2e opens it.
  evidence: `apps/web/src/surfaces/ficha/ensaios-section.tsx` (NotApplicableTest branch); `apps/web/src/surfaces/ficha/measurement-test-section.test.tsx`.
  class: verification
  state: ~~open (owner: the Epic 23 wave 2 integrated review, second pass)~~ closed (2026-11-10, Epic 23 QA): `apps/web/src/surfaces/ficha/ensaios-section.test.tsx` renders `EnsaiosSection` on a v13 seccionadora whose two seeded tests carry an invented plate condition (no seeded v13 test of that grammar has one) and synthetic help on the insulation only: the NA test keeps "Como ensaiar" on its head beside the pill, under the kernel's band reason, and opens the dialog with only the filled headings; the NA test without help draws no action; dropping `headEnd` from the NA branch fails two of its three tests
- source_spec: `_bmad-output/implementation-artifacts/spec-e23h-field-help.md` (Story 23.11, "Which points")
  summary: only the `reading` origin takes the recommendation. A `reprovado` entry derives only for a Reprovado the floor does not explain (the engineer's own choice, no failing test), so no test is its reason; a test-caused Reprovado derives a `reading` entry, which carries it. If Bruno wants the recommendation on a Reprovado chosen by hand, that is a new rule.
  evidence: `packages/domain/src/points/derived.ts` `sheetEntries` (the `reprovado` entry only when `conclusionFloor` is not Reprovado); `points/derived-recommendation.test.ts`.
  class: decision
  state: open (owner: Bruno, question 36, with the authored join); 2026-11-10 (evening): superseded in this form by fix batch e24h (no automatic points), since no entry derives. What remains for Bruno: which points a test's recommendation should fill, now over the create action of Story 24.17

## Deferred from: Epic 23 fix batch e23w (2026-11-09)

- source_spec: `_bmad-output/implementation-artifacts/spec-e23w-wave2-fixes.md` (review, Edge Case Hunter, deferred)
  summary: A v13 arrester whose nameplate sub-block is switched off while it still stores DESLIGADOR ÍNTEGRO NÃO stays Reprovado by a plate value the sheet no longer shows (W2-2 reads the prerequisite "unconditionally", Story 23.6's AC).
  evidence: `packages/domain/src/relatorio/restriction.ts` `failedPrerequisites` (no sub-block check).
  class: decision
  state: ~~open (owner: Matheus with Bruno: keep it, or read the prerequisite only while the nameplate sub-block is on)~~ decided (2026-11-10, Matheus: yes, inside Epic 24, no extra batch): read the prerequisite only while the nameplate sub-block is on. ~~Open (owner: Epic 24, wave 1); assigned 2026-11-10 to Epic 24, Story 24.3 (on seed v14 only)~~ Closed (2026-11-11, batch e24a, Story 24.3, on seed v14 only): `prerequisiteFailure` answers null while the nameplate sub-block is off (flag `prerequisite_needs_nameplate`), so the floor, the conclusion text, the parecer and "Origem resolvida" ignore it; a v13 arrester is read as before (the v13 layout lock pins one, reprovado by its prerequisite alone)
- source_spec: `_bmad-output/implementation-artifacts/spec-e23w-wave2-fixes.md` (Design Notes, W2-1)
  summary: `last_results` keeps two entries (top and `prior`). A re-issue of A after two later visits (B, then C over B) cannot see that A is older: A's sheets read C as their previous visit. With one later visit (top's `prior` is A) they read none, never the later one, and the issue job never writes A over a later top. A full order needs a deeper chain or the visit date in the entry, a projection shape change and a contract.
  evidence: `packages/domain/src/print/reading-slots.ts` `previousResultsFor`; `print/last-results.ts` `lastResults`; `schemas/entities.ts` `lastResultsSchema`.
  class: decision
  state: ~~open (owner: Matheus, if a re-issue after two later visits of one equipment is a real case)~~ closed (2026-11-10, Matheus: accepted, no change): the case is rare. It is looked at again only if it happens.
- source_spec: `_bmad-output/implementation-artifacts/spec-e23w-wave2-fixes.md` (W2-K2, residual risk)
  summary: The v13 transformer insulation table with the "20 °C" column prints at 8 pt; by the kernel's conservative measure its longest words take 61,6 em against the calibrated 60 em, so the fit holds by the rule as built (the column outside the budget), not by a measured page. No PDF was checked by eye.
  evidence: `packages/domain/src/print/section-9.ts` `fittedColumns` (`outsideBudget`), `readingFitWidthEm`; `relatorio/three-levels.test.ts` (16 half points).
  class: verification
  state: ~~open (owner: the Epic 23 wave 2 re-check or wave 3 integrated QA: look at a v13 transformer's section 9 in the PDF, every word whole)~~ closed (2026-11-10, fix batch e23p, P2): the behaviour pass looked at the PDF and found "SECUNDÁRIO" and "22,6" broken at 8 pt (its F3). The table is now fitted whole by Arial's widths and prints at 7,5 pt, every word whole in the PDF, asserted by `apps/api/src/jobs/generate/v13-insulation-print.integration.test.ts` (it fails on `b307ced1`).
- source_spec: `_bmad-output/implementation-artifacts/spec-e23w-wave2-fixes.md` (authored strings, listed for Bruno)
  summary: The authored pt-BR texts of the batch: the parecer group "por pré-requisito do ensaio não atendido" (the floor's existing word); the contact rise's reason "alta de {N} % sobre {valor} da manutenção anterior, rev. {n} de {dd/mm/aaaa}, acima do limite de {pct} %" (the rise rounded up to one decimal), in the point and the conclusion clause, and its helper "Acima do aceitável: {motivo}".
  evidence: `packages/domain/src/relatorio/parecer.ts` `REPROVADO_REASONS`; `relatorio/restriction.ts` `applyHistoryRise`.
  class: decision
  state: open (owner: Bruno, through Matheus)
- source_spec: `_bmad-output/implementation-artifacts/spec-e23w-wave2-fixes.md` (B-6 narrowings)
  summary: The contact rise judges only measured readings on both visits (a reading above the instrument's limit on either side judges nothing) and only a previous visit issued on seed v13 or later; the rule's base status stays the restriction's CONFIRMADO (one status per restriction), although DJ-03 and SC-03 are PADRÃO FASOR.
  evidence: `packages/domain/src/relatorio/restriction.ts` `applyHistoryRise`; `seed/v13.ts` `E23V_KEYS`.
  class: decision
  state: open (owner: Bruno, through Matheus)
- source_spec: `_bmad-output/implementation-artifacts/spec-e23w-wave2-fixes.md` (no contract bump)
  summary: The batch changes how a v13 sheet is judged (TP-02, the contact rise, the prerequisite off, the re-issue order) with no contract bump, as launched (38 and 39 reserved). Safe only because v13 is not deployed: wave 3's contracts move `MIN_CONTRACT_VERSION` past 37 before the one deploy, so no contract-37 bundle meets a server that judges otherwise.
  evidence: `packages/domain/src/contract/version.ts` (37, unchanged); epic-23-context M-2.
  class: decision
  state: ~~open (owner: the coordinator: keep MIN following wave 3's bump; if an earlier deploy is asked, this batch's change needs its own number)~~ closed (2026-11-10, coordinator): MIN followed wave 3, 38 at e23t (`fc0aa508`) and 39 at e23e (`7f29b243`); the first v13 deploy, `ef099d41`, went out at contract 39, MIN 39, so no contract-37 bundle meets it.

## Deferred from: Epic 23 batch e23t (2026-11-09)

- source_spec: `_bmad-output/implementation-artifacts/spec-e23t-transformer-tests.md` (Story 23.17, "Old spelling")
  summary: a TIPO DE ISOLAÇÃO stored as an older spelling ("ÓLEO MINERAL", "ÓLEO") directly on a v13 transformer (a v13 sheet written before e23t, or a hand-built op) reads as oil for the correction and the sampling (`mediumOf`, `testApplicability` resolve aliases) but as not oil for the oil items and fields (`oilStateOf` compares the stored text with `oil_values`); every path the app writes it through (the select, "Igual à", "Copiar da última visita", a plate reading) stores ÓLEO ISOLANTE. Aliasing `oilStateOf` reaches v6 to v12's readers too, so it was left for a decision.
  evidence: `packages/domain/src/relatorio/oil-rule.ts` `oilStateOf`; `relatorio/temperature-correction.ts` `mediumOf`; `relatorio/e23t-transformer-tests.test.ts` ("the older spellings").
  class: decision
  state: ~~open (owner: the Epic 23 wave 3 integrated review)~~ closed (2026-11-10, Matheus: accepted, no change): no screen writes the old spelling any more, and the build that carried the risk never reached production.
- source_spec: `_bmad-output/implementation-artifacts/spec-e23t-transformer-tests.md` (Design Notes, "Readings listed for Bruno")
  summary: the narrowings and authored wordings of the batch for Bruno: deviation over the lowest phase; a dry winding has no out band but an open circuit; the IP classes on both media; no IP history; the DAR captured, unjudged, on both media; the sampling reason a closed choice (free text in Observações); silicone applies the sampling; an empty TIPO DE SECCIONADORA applies the fuse test; no factory comparison for the winding; the criteria texts ("desvio entre fases ≤ 2 % (com restrição até 5 %)", "… (com restrição acima)", "desvio entre fusíveis ≤ 15 %", "registro da coleta (a análise é do laboratório)", "IP ≥ 1,0"), the helpers and reasons (`measurement-evaluation.ts`, `reading-evaluation.ts` `judgeIndexCells`, `temperature-correction.ts` winding texts) and the off note of the three tests.
  evidence: every `// authored (Story 23.1x, listed for Bruno)` in `packages/domain/src/seed/v13.ts`, `relatorio/measurement-evaluation.ts`, `relatorio/reading-evaluation.ts`, `relatorio/temperature-correction.ts`, `relatorio/conclusion.ts`.
  class: decision
  state: open (owner: Bruno, with the PR's list)

## Deferred from: Epic 23 batch e23e (2026-11-09)

- source_spec: `_bmad-output/implementation-artifacts/spec-e23e-tc-thermo-ground.md` (Design Notes, "Narrowings"; Base rev08 AT-02)
  summary: AT-02's "the technician can add a row" (a continuity point beyond the five authored ones) is not built: no seeded or measurement table takes a row the definition does not hold (`ops/apply.ts` `assertMeasurementCell`, `assertCellGeometry`). A point outside the five goes in Observações until a row-adding capability is decided.
  evidence: `packages/domain/src/seed/v13.ts` `CONTINUIDADE_MALHA`; `packages/domain/src/ops/apply.ts`.
  class: decision
  state: ~~open (owner: Matheus)~~ decided (2026-11-10, Matheus: accepted, no change): the technician cannot add a point beyond the five, and an extra point goes in Observações. Open only for the question to Bruno (owner: Matheus, the next list of questions for Bruno)
- source_spec: `_bmad-output/implementation-artifacts/spec-e23e-tc-thermo-ground.md` (Design Notes, "Readings taken" and "Narrowings")
  summary: the readings and authored wordings of the batch for Bruno: polarity and FUNÇÃO DO TC required; thermography NA until "Equipamento em carga" is Sim (its rows and ΔT optional); the arrester with MCOV empty takes the instrument's voltage; the TC's and TP's secondaries at 1 kV apply to no row; the Malha's continuity rows optional and the Malha last under "Outros equipamentos"; thermal photos are sheet photos in the sheet's photo block. Authored texts: the faturamento notice, the ratio print note, the polarity helper (the frame's) and point ("polaridade invertida em Fase R"), the conclusion clause, the thermography's off note, row header, points, criteria wordings, band classes and actions, NA reasons ("Informe se o equipamento está em carga", "Equipamento fora de carga") and applied sentence ("Aplicado mesmo assim: …"), "Foto térmica", the caption's "ensaios de termografia", the Malha's label, test labels, row headers, points, criteria wordings, the out helper and the default's note ("Sem VALOR DE PROJETO na placa, vale ≤ 5 Ω."), its nouns and TAG prefix MA. Added by the review loop: the floor reason and the parecer's `choice` group for a sheet failed by polarity alone ("polaridade invertida", "Polaridade invertida em N fichas", its Critérios item).
  evidence: every `// authored (Story 23.13`, `23.18`, `23.20` or `23.21, listed for Bruno)` in `packages/domain/src/seed/v13.ts`, `relatorio/reading-evaluation.ts`, `relatorio/measurement-evaluation.ts`, `relatorio/applicability.ts`, `relatorio/conclusion.ts`, `points/derived.ts`, `photos/caption.ts`, `templates/text.ts`, `types/duplicate.ts`, `apps/web/src/copy/pt-br.ts`.
  class: decision
  state: open (owner: Bruno, with the PR's list)
- source_spec: `_bmad-output/implementation-artifacts/spec-e23e-tc-thermo-ground.md` (Boundaries, "Layout lock")
  summary: `packages/domain/fixtures/porto-seguro/op-log.test.ts` gains `malha_aterramento: 0` in its `templateTotals` expectation (the totals name every equipment type, and the spec appends one to `EQUIPMENT_BLOCK_TYPES`). The Porto Seguro golden JSON and the layout-lock goldens are byte-equal; only this test file shows an `M` line in `git diff 7424771d --name-status -- apps/api/src/jobs/generate/golden packages/domain/fixtures`. e22s changed the same line when it added the Inspeção de QGBT.
  evidence: `packages/domain/fixtures/porto-seguro/op-log.test.ts`.
  class: note
  state: ~~open (owner: the coordinator, to confirm against the lock rule)~~ closed (2026-11-10, coordinator): the changed test line does not break the layout lock.
- source_spec: `_bmad-output/implementation-artifacts/spec-e23e-tc-thermo-ground.md` (I/O matrix, "Not in load")
  summary: on a thermography NA by its own value the band's button reads "Seguir a placa" once applied, though the condition reads the test's value, not the plate (the band is Story 23.9's). The paid eval of `bedrock-structuring-8` (the synthetic TC plate `plate-tc-funcao-v13.png`) is the coordinator's before the deploy.
  evidence: `apps/web/src/surfaces/ficha/applicability-band.tsx`; `apps/api/src/scripts/bedrock-eval.ts`.
  class: note
  state: ~~open (owner: the Epic 23 wave 3 integrated review)~~ the band's wording closed 2026-11-10 by fix batch e23z (W3-6); ~~the paid eval of `bedrock-structuring-8` stays open (owner: the coordinator, before the deploy)~~ the paid eval of `bedrock-structuring-8` done 2026-11-10 (coordinator, on Matheus's AWS login; after the deploy of `ef099d41`, before that of `47be2638`; see the e23b eval row and `epic-23-context.md` § Deploy)
- source_spec: `_bmad-output/implementation-artifacts/spec-e23e-tc-thermo-ground.md` (review pass of 2026-11-09, rejected finding)
  summary: the v13 TC's EXATIDÃO offers 5P20 and 10P20 only (Story 23.18), so a plate read 5P10, 5P30 or 10P10 lands on 5P20 or 10P20: judged the same (± 1 %, ± 3 %), but the stored and printed accuracy limit factor differs from the plate. Question for Bruno: should the select offer the other factors?
  evidence: `packages/domain/src/relatorio/accuracy-class.ts` `accuracyClassOption`; `packages/domain/src/seed/v13.ts` (the TC's classes).
  class: decision
  state: open (owner: Bruno)

## Deferred from: Epic 23 batch e23x (2026-11-09)

- source_spec: `_bmad-output/implementation-artifacts/spec-e23x-base-texts.md` (Design Notes, narrowing)
  summary: the base's texts show only on sheets of the imported company type copies, not on the library's seeded types (a company overlay on seeded types would need an entity, an op family and a contract). A relatório must use the imported copies for "Como ensaiar" and the recommendation to appear.
  evidence: `packages/domain/src/types/test-base-import.ts` `planTestBaseImport`.
  class: decision
  state: ~~open (owner: Matheus, with Bruno)~~ closed (2026-11-10, Matheus: accepted, no change): the base's texts stay on the imported types only. Epic 24 hides the library type when a copy of it exists, which removes the confusion.; assigned 2026-11-10 to Epic 24, Story 24.19 *(2026-11-11, batch e24c, Story 24.19: built. A published, non-retired copy whose definition names the library type as its `base_block_type` hides it in both palettes and in "Fotografar equipamento" and stands in its place (`hidingCopies`), so a relatório is offered the imported copy and its texts; the type list says the library type is hidden.)*
- source_spec: `_bmad-output/implementation-artifacts/spec-e23x-base-texts.md` (rows before e23e)
  summary: GE-01 (`termografia`) and AT-01/AT-02 (`malha_aterramento`) attach only once e23e's seed lands; until then they are listed as "Sem ensaio no app". After the e23e merge, add explicit kernel assertions that they attach (the spec's Tasks).
  evidence: `packages/domain/src/types/test-base-import.test.ts` (reads the kernel definition, holds before and after).
  class: verification
  state: ~~open (owner: the batch merging second of e23e and e23x)~~ closed (2026-11-10, Epic 23 QA, with evidence, no change): the assertions landed with e23x's merge over e23e (`6a7e641e`) and hold unconditionally on the current seed: `test-base-import.test.ts` "after e23e (Stories 23.20, 23.21): GE-01 lands on the termografia of every FO.SERV-03 copy, AT-01 and AT-02 on the malha copy" checks GE-01 on `termografia` of all eight types (text and recommendation), the AT copy's `malha_aterramento` type, AT-01 on `resistencia_malha`, AT-02 on `continuidade_malha`, and none of the three in `unattached`; the file ran 22 of 22 green on main `63a3f35a`
- source_spec: `_bmad-output/implementation-artifacts/spec-e23x-base-texts.md` (authored strings, listed for Bruno)
  summary: the authored pt-BR texts of the batch: the action "Importar base de ensaios", "Importar"; the preview lines "Cria {n} tipos da empresa, com os textos de {m} ensaios: …", "Ficam como rascunho, com avisos para publicar: …", "Já importado: …", "Todos os tipos desta base já foram importados. Nada será gravado.", "Sem ensaio no app: …", "Texto acima de 1000 caracteres, deixado de fora: …"; the toast "{n} tipos importados da base de ensaios"; the invalid-file lines; the copy names "⟨tipo⟩ (⟨ID⟩)"; the criterion's level words "Aprovado:", "Com restrições:", "Reprovado:".
  evidence: every `// authored (Story 23.12, listed for Bruno)` in `packages/domain/src/types/test-base-import.ts` and `apps/web/src/copy/pt-br.ts`.
  class: decision
  state: open (owner: Bruno, through Matheus)
- source_spec: `_bmad-output/implementation-artifacts/spec-e23x-base-texts.md` (review EC6, EC15)
  summary: a company that already imported the base never gets texts for tests a later seed adds: a held copy (same seeded source and name, not removed) is skipped, never updated, so a re-import cannot refresh it without overwriting the office's edits. Updating held copies is a product choice.
  evidence: `packages/domain/src/types/test-base-import.ts` `alreadyHeld`, `planTestBaseImport`.
  class: decision
  state: ~~open (owner: Matheus; harmless for the first production import, which runs after the single v13 deploy with e23e's tests)~~ decided (2026-11-10, Matheus: accepted, no change): a re-import does not update the types already imported, so the office's edits are not lost. Open only until Bruno sends a new revision of the base, when it is decided again (owner: Matheus)

## Deferred from: Epic 23 fix batch e23z (2026-11-10)

- source_spec: `_bmad-output/implementation-artifacts/spec-e23z-final-fixes.md` (review, Edge Case Hunter)
  summary: a company draft can publish while a ratio table reads by vector group with no plate field left to read. This happens when the draft lost `ligacao_secundaria` before e23z (pruned by `removeDraftEntry` since e23g, or by a draft put from an older build). The ratio never computes. The editor's refusal guards removals from now on only, and `validateTypeDraft` raises no issue.
  evidence: `packages/domain/src/types/draft-edit.ts` `removeDraftEntryRefusal`; `packages/domain/src/types/validate.ts`.
  class: decision
  state: ~~open (owner: Matheus: add a publish issue, or leave such drafts to the office)~~ decided (2026-11-10, Matheus: yes, inside Epic 24, no extra batch): raise a publish issue. ~~Open (owner: Epic 24, wave 3); assigned 2026-11-10 to Epic 24, Story 24.20~~ closed (2026-11-11, batch e24c, Story 24.20, contract 44): `vectorGroupPublishIssue` is one publish issue on the ratio test (the field missing, its kind or its options changed) that holds "Publicar", and the push route refuses such a version create `op_invalid`; outside the strict schema (D3 of `spec-e24c-company-types.md`), so a version published broken before still folds on a fresh device and its sheet works
- source_spec: `_bmad-output/implementation-artifacts/spec-e23z-final-fixes.md` (Design Notes, W3-3 narrowing)
  summary: only a copy created from e23z on carries `base_block_type` and prints in its base type's group. A copy duplicated or imported earlier keeps printing in "Outros equipamentos" until it is duplicated again. Nothing backfills: published versions are immutable.
  evidence: `packages/domain/src/types/duplicate.ts` `duplicateSeededDefinition`; `packages/domain/src/print/group-for-print.ts`.
  class: decision
  state: ~~open (owner: Matheus; the first production base import runs on a build with e23z, so its copies carry the key)~~ closed (2026-11-10, coordinator, with evidence, no change): a read-only count in production on 2026-11-10 (counts only) found zero company type versions, so no copy duplicated or imported before `base_block_type` exists there (`epic-23-context.md` § Deploy).
- source_spec: `_bmad-output/implementation-artifacts/spec-e23z-final-fixes.md` (Design Notes, W3-7 narrowing)
  summary: the base's IP rows (TR-OL-03, TR-SE-03) give the insulation test only its `index_recommendation`. Their "Como ensaiar" texts are not merged into the test's help, and the type editor neither shows nor edits `index_recommendation`. In rev08 the IP rows carry the same recommendation as the 1-minute rows.
  evidence: `packages/domain/src/types/test-base-import.ts` `TEST_BASE_INDEX_ROWS`; `apps/web/src/surfaces/templates/type-editor-parts.tsx`.
  class: decision
  state: ~~open (owner: Matheus, with Bruno)~~ decided (2026-11-10, Matheus: accepted, no change): the IP rows' "Como ensaiar" texts do not enter the insulation test's help. Open only for the question to Bruno (owner: Matheus, the next list of questions for Bruno); 2026-11-10 (evening): after fix batch e24h (no automatic points) the index recommendation no longer prints by itself. It reaches print only inside a point someone created (fix batch e24f item R-3, reworded in `epic-24-context.md`; Story 24.17). *(2026-11-10, fix batch e24f, R-3: any write of the test's "Recomendação se reprovado" in the editor deletes its `index_recommendation`; an untouched copy keeps it.)*
- source_spec: `_bmad-output/implementation-artifacts/spec-e23z-final-fixes.md` (item 2 reading; I/O matrix)
  summary: how this batch reads Bruno's item 6 (2026-11-09). A Reprovado chosen by hand starts with the recommendations of the sheet's restricted tests when any test is restricted, else of every in-force test that has one. Texts are taken once each, in definition order. Bruno decides whether he wants only one test's recommendation, or none when no test is restricted.
  evidence: `packages/domain/src/points/derived.ts` `reprovadoRecommendations`.
  class: decision
  state: open (owner: Bruno, through Matheus); 2026-11-10 (evening): after fix batch e24h (no automatic points) nothing starts a point by itself. Story 24.17 keeps this picking rule for the point its create action starts on a Reprovado chosen by hand; Bruno's decision is still open
- source_spec: `_bmad-output/implementation-artifacts/spec-e23z-final-fixes.md` (W3-2, item 3 and item 4 narrowings)
  summary: three narrowings.
  - W3-2: a measured cell the deviation between phases cannot judge only withholds the floor. The sheet shows no "Conferir" helper on that cell; the medium-unknown note stays.
  - Item 3: the clear has no "Desfazer", because only clearing is allowed. A cleared reading is typed again once its tap is back on the plate.
  - Item 4: only removing the field is refused. Changing its kind or options is not. *(2026-11-11, batch e24c, Story 24.20: a change of its kind, or options that are no longer exactly the codes, is refused too while a ratio table reads it (`updateDraftFieldRefusal`, the removal's toast pattern); its label and unit still change.)*
  evidence: `packages/domain/src/relatorio/measurement-evaluation.ts` (`unjudged`); `apps/web/src/surfaces/ficha/ensaios-section.tsx` (`OffPlateClearButton`); `packages/domain/src/types/draft-edit.ts`.
  class: note
  state: ~~open (owner: the Epic 23 retrospective)~~ closed (2026-11-10, the Epic 23 retrospective, headless): the clear with no "Desfazer" (item 3) and the refusal of only the field's removal (item 4) are accepted as designed. The missing helper on a cell the deviation between phases cannot judge (W3-2) goes to E23-A1 with finding R-1 of `epic-23-retro-2026-11-10.md`. *(2026-11-10, fix batch e24f, R-1: the cell carries a "Conferir:" helper and the paragraph reads "com leitura a conferir".)* *(2026-11-10, Epic 24 planning, the same day: item 4 is taken further by Story 24.20, which also refuses a vector-group field whose kind or options were changed.)*
- source_spec: `_bmad-output/implementation-artifacts/spec-e23z-final-fixes.md` (authored strings, listed for Bruno)
  summary: the batch's authored pt-BR texts:
  - "Apagar leitura" and "Leitura apagada";
  - "Desfazer a aplicação", "Aplicação desfeita — não se aplica" and "Não conta como faltando e não sai no relatório.";
  - "O campo {label} não pode ser removido: a relação de transformação calcula por ele. Remova antes o ensaio.";
  - the editor's "Grupo na impressão", which shows the base type's group words;
  - how several recommendations are joined in a hand-chosen Reprovado's point.
  evidence: every `authored (e23z, listed for Bruno)` in `apps/web/src/copy/pt-br.ts`, `packages/domain/src/types/draft-edit.ts`, `packages/domain/src/print/group-for-print.ts`, `packages/domain/src/points/derived.ts`.
  class: decision
  state: open (owner: Bruno, through Matheus)

## Deferred from: Epic 23 fix batch e23p (2026-11-10)

- source_spec: `_bmad-output/implementation-artifacts/spec-e23p-pass-fixes.md` (Design Notes, P1 list)
  summary: the fields neither copy chip copies, measured on the day of the visit: TEMPERATURA DO ÓLEO, TEMPERATURA DO ENROLAMENTO, CONTADOR DE OPERAÇÕES, DESLIGADOR ÍNTEGRO and CONDIÇÃO DO SOLO (`DAY_MEASURED_NAMEPLATE_KEYS`, by key). MÉTODO DE MEDIÇÃO, TAP ATUAL and every plate field keep copying. The list is the batch's reading of the launch's two temperatures.
  evidence: `packages/domain/src/relatorio/nameplate-copy.ts` `DAY_MEASURED_NAMEPLATE_KEYS`.
  class: decision
  state: ~~open (owner: Matheus: confirm the list)~~ confirmed (2026-11-10, Matheus): the list stands, with the three fields beyond the two temperatures (CONTADOR DE OPERAÇÕES, DESLIGADOR ÍNTEGRO, CONDIÇÃO DO SOLO).
- source_spec: `_bmad-output/implementation-artifacts/spec-e23p-pass-fixes.md` (Design Notes, P4 reading)
  summary: on a v13 oil unit the dry fields (TEMPERATURA DO ENROLAMENTO, CLASSE TÉRMICA) are drawn read-only and empty with the reason, and a crossing to oil clears them. The oil fields of a dry unit keep today's screen: editable, excused, cleared at the crossing to dry. A plate-reading suggestion on a dry field of an oil unit is not drawn on that field (the field is read-only); "Confirmar todos" can still write it, kept unseen and printed "-".
  evidence: `packages/domain/src/relatorio/oil-rule.ts` `dryFieldExcusedReason`; `apps/web/src/surfaces/ficha/nameplate-section.tsx`.
  class: decision
  state: ~~open (owner: Matheus: align the oil fields of a dry unit the same way, or keep them)~~ decided (2026-11-10, Matheus, E23-A2 item 5: yes, read-only); assigned 2026-11-10 to Epic 24, Story 24.11 (decided by Matheus with the approval of the story list: the oil fields of a dry unit read-only, the mirror of e23p's fix); closed (2026-11-11, batch e24s, Story 24.11: `relatorio/oil-rule.ts` `oilFieldExcusedReason`, the mirror of `dryFieldExcusedReason`, on every definition with `oil_rule.fields` (v6 on): an oil field of a non-oil unit is drawn read-only and empty with "Não se aplica: {campo} é {valor}.", the stored value kept and printed "-" as before; `nameplate-oil-rule.test.tsx`, 24.11-E2E-002 on a v12 dry unit)
- source_spec: `_bmad-output/implementation-artifacts/spec-e23p-pass-fixes.md` (P2, sizes)
  summary: the v13 transformer's insulation table now prints at 7,5 pt (one criterion), 7 pt (ACEITÁVEL per row, or MANUT. ANTERIOR) and 6 pt (both), every word whole; the disjuntor's and the seccionadora's paired tables print as on `b307ced1` (the behaviour pass's F13, reported, not fixed).
  evidence: `packages/domain/src/print/section-9.ts` `WHOLE_FIT_TABLES`; `relatorio/three-levels.test.ts`; `print/criteria-tables-print.test.ts`.
  class: note
  state: ~~open (owner: Matheus, with Bruno, if the smaller sizes need another layout)~~ confirmed (2026-11-10, Matheus): the sizes are accepted, 7,5 pt with one criterion, 7 pt with ACEITÁVEL per row, 7 pt with one criterion and MANUT. ANTERIOR, 6 pt with ACEITÁVEL per row and MANUT. ANTERIOR, every word whole. The paired tables (F13) stay as reported, not fixed.
- source_spec: `_bmad-output/implementation-artifacts/spec-e23p-pass-fixes.md` (authored strings, listed for Bruno)
  summary: the batch's authored pt-BR texts:
  - the previous line with its corrected value, "Anterior: {medido}, {corrigido} a {ref} °C (rev. {n}, {dd/mm/aaaa})";
  - the history comparison in the derived point, "(de {antes} para {agora}, a {ref} °C)";
  - the dry field's reason, "Não se aplica: {campo} é {valor}.";
  - the crossing toast's second part, "{m} campo(s) de unidade a seco apagado(s)", joined with " e ";
  - the Malha's criterion with a design value, "≤ {valor} Ω, valor de projeto".
  evidence: every `authored (e23p, listed for Bruno)` in `packages/domain/src/print/last-results.ts`, `relatorio/restriction.ts`, `relatorio/measurement-evaluation.ts`, `relatorio/oil-rule.ts`.
  class: decision
  state: open (owner: Bruno, through Matheus)

## Deferred from: the Epic 23 retrospective (2026-11-10)

- source_spec: `_bmad-output/implementation-artifacts/epic-23-retro-2026-11-10.md` (R-2, owner: E23-A2)
  summary: Fix batch e23p changed what a device derives and writes (the day-measured plate fields never copied, the dry fields cleared at the crossing to oil, the derived point's text, the Malha's criterion text) and took no contract number, after contract 40 was already in production. A device still on the `47be2638` bundle passes every pull and keeps the old behaviour until its next launch with an empty outbox.
  evidence: `packages/domain/src/contract/version.ts:469,738` (40 and MIN 40, untouched in `47be2638..9add87b5`); `apps/web/src/sw/use-shell-update.ts:8-9`; the MIN comments for 37 and 40 in `version.ts`; the e23w contract row above.
  class: decision
  state: ~~open (owner: Matheus: contract 41 with MIN 41, or the gap accepted here with a date)~~ closed (2026-11-10, Matheus: the gap is accepted). A device on the older bundle takes the changes at its next reload. Epic 24's first batch (e24a) takes contract 41 with MIN 41, which forces the update. *(2026-11-10, evening: contract 41 with MIN 41 comes with fix batch e24h, before e24a, which takes 42.)* A read-only count in production the same day found no relatório on seed v13, so no device had v13 work to derive differently.
- source_spec: `_bmad-output/implementation-artifacts/epic-23-retro-2026-11-10.md` (R-6, owner: E23-A2)
  summary: Seed v13 has no layout lock. The goldens cover v5, v11 and v12 and the Porto Seguro fixture, so "goldens byte-equal" in a gate says nothing about how a v13 relatório prints. e23p's promise that the disjuntor's and the seccionadora's paired insulation tables print as before is pinned only by type size and by words that fit the kernel's own width model.
  evidence: `packages/domain/fixtures/layout-lock/op-log.ts:40` (`LAYOUT_LOCK_VERSIONS`); `apps/api/src/jobs/generate/golden/` (no v13 folder); `epic-23-context.md` § Coordinator decisions, "Only v13 fixtures may gain goldens".
  class: decision
  state: ~~open (owner: Matheus: lock v13 as it prints in production before seed v14 opens, or not)~~ decided (2026-11-10, Matheus: yes). ~~Open (owner: Epic 24, Story 24.2)~~ Closed (2026-11-11, batch e24a, Story 24.2): `golden/layout-lock-v13/` taken on main `8bddd986` (e24h and e24f merged) before any Epic 24 rule change, from the synthetic v13 relatório of `fixtures/layout-lock/op-log.ts`
- source_spec: `_bmad-output/implementation-artifacts/epic-23-retro-2026-11-10.md` (R-9, the deferred half)
  summary: Two low items. A dry-only value hidden on an oil transformer stays in the store and is written to `last_nameplate` with no filter, so a later "Copiar da última visita" carries CLASSE TÉRMICA along, still hidden; nothing prints or judges by it. The off-plate clear swallows a commit error with no message.
  evidence: `packages/domain/src/print/last-nameplate.ts:38-41`; `apps/web/src/surfaces/ficha/ensaios-section.tsx` (`OffPlateClearButton`, `.catch(() => undefined)`).
  class: note
  state: open (owner: the next batch touching the nameplate copy or the TTR's off-plate rows)
- source_spec: `_bmad-output/implementation-artifacts/epic-23-retro-2026-11-10.md` (P-4, owner: E23-A4, a test-hardening batch)
  summary: Three tests went red under load in two or more gates of Epic 23 and passed alone each time: 21.1-E2E-002 (`e2e/seed-v11.spec.ts`; e23t's story gate, the wave 3 gate, T3's run 1), R8CAP-E2E-010 (`e2e/review-photo-failures.spec.ts`; e23t's story gate, e23p's full run) and 4.8-E2E-005 (`e2e/export.spec.ts`; e23w's story gate, T3's run 2, where the job finished in 1.6 s and the device sent no request for 150 s). `setup-surface.test.tsx`, already in the Epic 21 retrospective's row above, was red again in e23p's story gate. That row still has no state and no owner batch.
  evidence: `epic-23-context.md` § Fix batch e23w, § Wave 3, § Fix batch e23p; `spec-e23t-transformer-tests.md` Auto Run Result (gate reds); `spec-t3-serial-split.md:151-152`.
  class: flake
  state: ~~open (owner: E23-A4); assigned 2026-11-10 to fix batch e24f (Matheus: yes), `epic-24-context.md` § Fix batch e24f~~ closed (2026-11-10, fix batch e24f): 4.8-E2E-005 and 21.1-E2E-002 wait on the revision poll, which answers `busy` while a sync cycle runs; a JSON request with no answer held the cycle with no timeout, so the product now ends one whose answer's headers never come as a network failure, after 60 s plus its body at 8 KB/s (`requestHeadersTimeoutMs`, `apps/web/src/sync/client.ts`); R8CAP-E2E-010 retries its "Criar" press while the field's list re-mounts and reads the tray once the reloaded sheet is drawn; `setup-surface.test.tsx` as in the Epic 21 row above. Causes and runs in `spec-e24f-retro-fixes.md` § Auto Run Result
- source_spec: `_bmad-output/implementation-artifacts/epic-23-retro-2026-11-10.md` (Behavior verification, owner: E23-A5)
  summary: The read-only preview of Bruno's v5 relatório after the deploy, planned in `epic-23-context.md` § Coordinator decisions ("Bruno's v5 relatório"), has no run on record for any of the three Epic 23 deploys. The v5 layout-lock golden covers the same risk in tests; the production check is the one that was planned.
  evidence: `epic-23-context.md:341` against § Deploy.
  class: verification
  state: open (owner: the coordinator: run it and record it, or record why it was dropped)

## Deferred from: Epic 24 fix batch e24h (2026-11-10)

- source_spec: `_bmad-output/implementation-artifacts/spec-e24h-points-on-click.md` (Design Notes, D3)
  summary: The Porto Seguro skeleton golden carries 18 automatic `reading` rows in section 8's action-plan table (rows 8 to 25, "Ensaio fora do critério: …") and the parecer's "Foram registrados 25 pontos de atenção" sentence; after e24h the fixture prints its 7 stored points and "7 pontos". The golden is not regenerated, so `docx.test.ts` 4.8-UNIT-006 stays red with that diff alone (the proposed skeleton and its diff are in the batch's PR).
  evidence: `apps/api/src/jobs/generate/golden/porto-seguro-skeleton.json` (action-plan rows 8 to 25); `apps/api/src/jobs/generate/docx.test.ts` 4.8-UNIT-006.
  class: decision
  state: open (owner: Matheus: regenerate the skeleton with `GOLDEN_UPDATE=1`, or another reading)
- source_spec: `_bmad-output/implementation-artifacts/spec-e24h-points-on-click.md` (Design Notes, D5 a)
  summary: An NC row (of a ficha or a local) with no point of attention is named nowhere before issue now: the Q-4 pre-issue row retired with Story 22.5, when the row was a point by itself. Should the pre-issue list name such a row again? Not built.
  evidence: `packages/domain/src/relatorio/site-checklist.ts` (the struck 22.5 note); `packages/domain/src/relatorio/pre-issue.ts`.
  class: decision
  state: open (owner: Matheus)
- source_spec: `_bmad-output/implementation-artifacts/spec-e24h-points-on-click.md` (Design Notes, D4 and D2)
  summary: A test's "Recomendação se reprovado" starts no point any more: the only path that used it was "Editar" on the automatic card, which went, and no create action exists for a reading out of its criterion, a restricted reading or a Reprovado chosen by hand (a person writes them with "Criar" on the Points screen). The type editor's helper ("Texto inicial do ponto de atenção quando um valor deste ensaio fica fora do critério") stays as written. The findings' texts are still composed in `points/derived.ts` (`sheetEntries`) and read by nothing; Epic 24 plans the create paths.
  evidence: `packages/domain/src/points/derived.ts` (`sheetEntries`, `recommendedPointText`); `apps/web/src/copy/pt-br.ts` `typeEditor.recommendationHelper`.
  class: decision
  state: open (owner: Matheus with Epic 24's planning of automatic points)
- source_spec: `_bmad-output/implementation-artifacts/spec-e24h-points-on-click.md` (Design Notes, D5 b)
  summary: A parecer text confirmed while its relatório had automatic points reads stale after the update: the composed summary and its basis now count the stored points only, so "Foram registrados N pontos de atenção" drops the automatic ones. Expected; listed for Matheus.
  evidence: `packages/domain/src/relatorio/parecer.ts` `composeParecer` (the `points` count and basis key).
  class: note
  state: open (owner: Matheus)
- source_spec: `_bmad-output/implementation-artifacts/spec-e24h-points-on-click.md` (contract 41)
  summary: e24h takes contract 41 and MIN 41, the number `epic-24-context.md` first reserved for e24a; the unlaunched Epic 24 batches move up by one.
  evidence: `packages/domain/src/contract/version.ts` (41 and MIN 41).
  class: note
  state: ~~open (owner: the coordinator)~~ closed 2026-11-10: main's planning delta (#305) already records 41 and 41 for e24h in `epic-24-context.md` and `docs/kbs/architecture/kernel-and-seed.md`.
- source_spec: `_bmad-output/implementation-artifacts/spec-e24h-points-on-click.md` (H9, an observation never forces a restriction)
  summary: On every seed, an observation (the sheet's OBSERVAÇÕES or a C/NA row's observation) no longer floors Aprovado · Com restrições: the `observation` floor reason is gone. A ficha whose observation was its floor's only source now reads its stored Sem restrições (or, unset, the floor's Sem) everywhere: the screen, the suggestion, section 9's marks, the paragraph (no recommendation sentence), the parecer (it can fall to Apto). A conclusion text confirmed before reads stale there ("Sugerido: texto atualizado", the `conclusion_stale` pre-issue row) because its basis holds the pair; nothing is rewritten. No stored pair changes; a stored Com restrições stays. Of the fixtures only `replay-small` moves (its verdict holds). The readers are listed in the spec's H9 section.
  evidence: `packages/domain/src/relatorio/conclusion.ts` (`computeFloor`, `ConclusionFloorReason`); `packages/domain/src/relatorio/observation-free.test.ts`.
  class: note
  state: open (owner: Matheus: a production count of the fichas whose stored conclusion text goes stale, if wanted before the deploy)
- source_spec: `_bmad-output/implementation-artifacts/spec-e24h-points-on-click.md` (H9)
  summary: Story 24.3 planned "an observation floors nothing" for seed v14 only, behind the `conclusion_restriction_by_choice` flag; H9 does it on every seed now, so 24.3 keeps only the Reprovado-without-restriction half. Its text in `epics.md` and `epic-24-context.md` is the planner's to amend (not edited here).
  evidence: `epic-24-context.md` § Decisions, the 24.3 row of the flags table.
  class: decision
  state: ~~open (owner: the coordinator, with Story 24.3's amendment)~~ closed (2026-11-10, coordinator): Story 24.3 carries its dated note in `epics.md`, with the row in `source-deltas.md` and the H9 paragraph of `epic-24-context.md` § Fix batch e24h

## Deferred from: the e24h hands-on pass (2026-11-10)

- source_spec: `_bmad-output/test-artifacts/manual/behaviour-pass-e24h-2026-11-10.md` (H3)
  summary: Once a point was created from an NC item, the item shows "Ponto de atenção N" and "Criar ponto de atenção" stays, so a second identical point can be saved with no warning. On the "Não ensaiado" band the button disappears and nothing on the ficha says a point exists.
  evidence: the pass's screenshots `66-wip-second-point-same-item-dialog.png` and `17-wip-A8-band-after-point.png` (gitignored).
  class: note
  state: open (owner: Epic 24, Story 24.7, batch e24b, if it touches the two create paths; else the wave 1 fix batch)
- source_spec: `_bmad-output/test-artifacts/manual/behaviour-pass-e24h-2026-11-10.md` (H5)
  summary: The Sumário's points line undercounts "sem ação": a point created from the "Não ensaiado" band is counted as "1 não ensaiada" and left out of "sem ação" though it has no action.
  evidence: `packages/domain/src/points/summary.ts`; the pass's screenshot `59-new-A9-sumario.png` (gitignored).
  class: note
  state: open (owner: the next batch touching `points/summary.ts`)
- source_spec: `_bmad-output/test-artifacts/manual/behaviour-pass-e24h-2026-11-10.md` (H6)
  summary: The Export dialog's "Antes de emitir" lists the last sends of other devices with no "Outro aparelho" label and leaves out this device's line, so the last send reads as days old on a relatório created minutes ago. The Sync screen shows the same lines with the label.
  evidence: the pass's screenshots `60-new-C1-export-dialog.png` and `64-sync-status.png` (gitignored).
  class: note
  state: open (owner: the next batch touching the Export dialog)
- source_spec: `_bmad-output/test-artifacts/manual/behaviour-pass-e24h-2026-11-10.md` (H7)
  summary: "Controle do documento" in the Export dialog says "FO.SERV-03 · Revisão 01" and names the user's company as Contratada, while the issued PDF prints "Revisão 00" and the letterhead company. It may be local data only.
  evidence: the pass's `new-rev1.pdf`, page 2, against `60-new-C1-export-dialog.png` (gitignored).
  class: verification
  state: open (owner: the next batch touching the Export dialog: check it on a company with real document-control data first)
- source_spec: `_bmad-output/test-artifacts/manual/behaviour-pass-e24h-2026-11-10.md` (H8)
  summary: A ficha stored Aprovado · Com restrições whose stored reading is judged out of its criterion shows Reprovado · Com restrições with "Conclusão ajustada pela ficha" and "Confirmar". On a transformer it is an over-range reading ("> 10 GΩ") judged below a minimum of 25 000 MΩ. Older than e24h: a revision of 2026-11-09 already listed the reading.
  evidence: the pass's screenshots `27-B7-ficha-before.png` and `28-B7-para-raio-before.png` (gitignored); Story 23.4's instrument-limit rule.
  class: decision
  state: open (owner: Bruno, with the next list of questions: is an over-range reading below the table's minimum a failure?)

## Deferred from: Epic 24 fix batch e24f (2026-11-10)

- source_spec: `_bmad-output/implementation-artifacts/spec-e24f-retro-fixes.md` (R-4, the narrowing as built)
  summary: A company copy of cabos de saída carries no role (the block config schema refuses one on a company type and no screen writes one), so it prints in the seccionadoras subsection, unpaired, and no copy feeds a transformer: W3-3's "cables before their transformer" holds for the seeded cables only. The e23z test now asserts this. Whether a copy should carry a role is Epic 24's question (E23-A8).
  evidence: `packages/domain/src/print/group-for-print.ts` (`cabos_saida` without `alimentacao`); `packages/domain/src/relatorio/e23z-final-fixes.test.ts` (W3-3).
  class: narrowing
  state: open (owner: Matheus, Epic 24 planning)
- source_spec: `_bmad-output/implementation-artifacts/spec-e24f-retro-fixes.md` (R-1, Design Notes D1)
  summary: The conclusion basis is unchanged by R-1, so a paragraph confirmed before the fix with "dentro dos critérios de aceitação" over an unjudged reading keeps printing its confirmed words; only the composed text changed. A production count found no relatório on seed v13 (R-1a's path); R-1b's path is a company copy of the Quadro elétrico with a second test.
  evidence: `packages/domain/src/relatorio/conclusion.ts` (`composeConclusion`, the basis).
  class: decision
  state: open (owner: Matheus: keep the confirmed texts, or another reading)
- source_spec: `_bmad-output/implementation-artifacts/spec-e24f-retro-fixes.md` (authored strings listed for Bruno)
  summary: Two authored pt-BR sentences: the helper of a measured cell the deviation between phases could not judge, "Conferir: leitura sem comparação com as outras fases, sem critério aplicado"; and, reused on two new paths, the paragraph's existing "valores medidos com leitura a conferir".
  evidence: `packages/domain/src/relatorio/measurement-evaluation.ts` `UNJUDGED_DEVIATION_HELPER`; `packages/domain/src/relatorio/conclusion.ts`.
  class: decision
  state: open (owner: Bruno, through Matheus)
- source_spec: `_bmad-output/implementation-artifacts/spec-e24f-retro-fixes.md` (E23-A4, setup-surface)
  summary: A text field of the setup (and any `useTextField`, and the exclusions list) commits after 500 ms idle and resyncs from the store when the stored value differs from the last one it saw. A key typed after an idle commit and before that commit's live-query echo is overwritten by the echo. On a loaded host the test lost keys this way; on a slow tablet a pause and a fast key could do the same. Not fixed (outside the batch's behaviour scope).
  evidence: `apps/web/src/surfaces/relatorio/setup/setup-fields.ts` `useTextField`; `apps/web/src/surfaces/relatorio/setup/etapa2-escopo.tsx` (the exclusions' resync); `apps/web/src/input/field-commit.ts` `FIELD_COMMIT_IDLE_MS`.
  class: defect
  state: open (owner: the next batch touching the setup fields)
- source_spec: `_bmad-output/implementation-artifacts/spec-e24f-retro-fixes.md` (R-5)
  summary: The fold's branch for a `remove` on a tap row's cell is pinned by a kernel test only: the op schema accepts a `remove` on a `removed_at` path only, so no push carries one on a cell. The two-device case runs through the push route with null puts.
  evidence: `packages/domain/src/ops/op.ts` (the remove refinement); `packages/domain/src/ops/apply.ts` `assertCellGeometry`.
  class: note
  state: open (owner: none needed; recorded)
- source_spec: `_bmad-output/implementation-artifacts/spec-e24f-retro-fixes.md` (R-9)
  summary: The spec's I/O row asks that "Igual à ⟨TAG⟩?" counts the copied fields in its toast; the product's toast reads "Copiado de ⟨TAG⟩" with no count (only "Copiar da última visita" counts). The new case asserts the product's words and counts the copied fields from the outbox; no behaviour was changed.
  evidence: `apps/web/src/surfaces/ficha/nameplate-section.tsx` `copySame`; `apps/web/src/copy/pt-br.ts` `nameplate.copiedFrom`; `e2e/v13-nameplate.spec.ts` e24f-E2E-002.
  class: decision
  state: open (owner: Matheus: a count in that toast too, or as is)
- source_spec: `_bmad-output/implementation-artifacts/spec-e24f-retro-fixes.md` (E23-A4, R8CAP-E2E-010)
  summary: FABRICAÇÃO's combobox list was re-mounted between the "Criar ⟨nome⟩" option's resolution and the press, twice in three runs at load 6 to 10 (Playwright: "element was detached from the DOM"), while the sheet re-rendered under the sync engine's retries of a held upload. The test now retries the press. Whether a tap on a slow tablet is lost the same way is not known; not fixed (outside the batch's behaviour scope).
  evidence: `.scratch-e24f/e2e-repeat-2.log`, `e2e-repeat-3.log` (worktree, not tracked); `apps/web/src/components/registry-picker-field.tsx`.
  class: risk
  state: open (owner: the next batch touching the registry picker)
- source_spec: `_bmad-output/implementation-artifacts/spec-e24f-retro-fixes.md` (E23-A4, R8LAY-E2E-008)
  summary: "Novo relatório" pressed on a Home that already shows its status board can be lost while the launch still re-renders (the dialog never opened in the load reds). The test now repeats the press until the dialog opens, so this lost press, which a user would meet too, no longer fails any test. The cause is not found; nothing in the product changed.
  evidence: `e2e/review-layout-interaction-2026-10-08.spec.ts` R8LAY-E2E-008; `apps/web/src/surfaces/home/home-surface.tsx` (the "Novo relatório" button).
  class: flake
  state: open (owner: the next batch touching the Home launch)
- source_spec: `_bmad-output/implementation-artifacts/spec-e24f-retro-fixes.md` (E23-A4, 4.8-E2E-005)
  summary: Only the JSON requests' wait for their answer's headers is bounded (`requestHeadersTimeoutMs`). `send()` (the photo uploads, the thumbnail and file downloads) still has no bound, so the sync cycle, and every poll gated on it, can still be held by an upload or a thumbnail whose answer never comes.
  evidence: `apps/web/src/sync/client.ts` `send`; `apps/web/src/sync/engine.ts` (the upload and thumbnail phases).
  class: note
  state: open (owner: the next batch touching sync)


## Deferred from: Epic 24 batch e24b (2026-11-11)

- source_spec: `spec-e24b-screen-lane.md` (Design Notes D4; review ECH-8, ECH-11)
  summary: A reuse key names a place (type, local code, order): a sheet moved to another local and then saved with "Salvar como template", a palette breaker that sits before the original in its coluna, or a keyed sibling removed before the template is saved makes the next relatório miss (or swap) that equipment, which starts with no previous visit.
  evidence: `packages/domain/src/relatorio/instantiate.ts` (the run), `relatorio/tag.ts` `reuseKeyFor`; Story 24.21 states the template-side limits.
  class: design
  state: open (owner: Matheus, with the next decision on equipment identity)
- source_spec: `spec-e24b-screen-lane.md` (review ECH-4)
  summary: Story 24.6 counts the recents (other sheets' observations of the item) as offered phrases, so an observation the technician typed that equals another sheet's typed observation ("Repetir padrão" included) reads as automatic and is removed with no warning when the row leaves NC.
  evidence: `packages/domain/src/relatorio/ficha.ts` `ncObservationOnLeave`; `apps/web/src/surfaces/ficha/checklist-section.tsx` `sheetRowTarget` (`leaveChips`).
  class: decision
  state: ~~open (owner: Matheus: keep the recents in the rule, or judge against the seed and learned phrases only)~~ closed (2026-11-11, fix batch e24x, A1, on Matheus's decision 17): the rule judges against the item's seed phrases only; an observation equal to a recent or a learned phrase is kept with the warning (`spec-e24x-review-fixes.md`).
- source_spec: `spec-e24b-screen-lane.md` (review ECH-6, ECH-7)
  summary: "Foto térmica · N" counts the sheet's photos with no item whose caption is the thermography's context caption: a sheet renamed after its shots counts 0, and a sheet-camera photo with that caption counts. No stored marker of a thermal shot exists; one needs a file field (a contract). Screen only.
  evidence: `packages/domain/src/photos/text.ts` `thermalPhotoText`.
  class: debt
  state: open (owner: the next ficha batch)
- source_spec: `spec-e24b-screen-lane.md` (review ECH-14)
  summary: `moveTagQuestion`, `renameToText`, `MoveTagSuggestion` and the Move dialog's rename branch are dead now that `moveTagSuggestion()` is always null.
  evidence: `packages/domain/src/relatorio/move.ts`; `apps/web/src/surfaces/relatorio/move-block-dialog.tsx`.
  class: debt
  state: open (owner: the next carry-over batch)
- source_spec: `spec-e24b-screen-lane.md` (Part A report)
  summary: The "Fotografar equipamento" detect frame of `40-relatorio-overview.html` (:662) still reads "tipo + coluna · nenhuma SEC-C09 no relatório"; the build now reads "tipo · próximo número livre" for every type (Story 24.8).
  evidence: `mockups/prototype/screens/40-relatorio-overview.html`; `packages/domain/src/relatorio/panel.ts` `panelProvenance`.
  class: note
  state: open (owner: the coordinator, with the next mock pass)


## Deferred from: Epic 24 batch e24a (2026-11-11)

- source_spec: `spec-e24a-conclusion-rules.md` (Story 24.2)
  summary: The layout-lock fixture builds a v14 relatório with the same extras as the v13 one (24.2-UNIT-SAME compares the two with the v14 flags read off), but no v14 golden is taken: seed v14 is not deployed and later Epic 24 batches still change it.
  evidence: `packages/domain/fixtures/layout-lock/op-log.ts` (`EPIC24_EXTRAS`); `apps/api/src/jobs/generate/docx-layout-lock.test.ts` (`LAYOUT_LOCK_VERSIONS` stops at v13).
  class: note
  state: open (owner: the coordinator, at the Epic 24 deploy, when seed v14 freezes: lock v14 or not)
- source_spec: `spec-e24a-conclusion-rules.md` (Story 24.2, phase B report)
  summary: 24.2-UNIT-SAME reads v14 "with its flags off" through a `vi.mock` of `seedRule`; a later v14 key that is not a `rules` flag (a definition key of e24s or e24p) makes v14 differ from v13 and must be stripped or listed in that test.
  evidence: the 24.2-UNIT-SAME test beside `packages/domain/fixtures/layout-lock/op-log.ts`'s callers (grep `24.2-UNIT-SAME`).
  class: note
  state: open (owner: batches e24s and e24p, when they add to `seed/v14.ts`); *(2026-11-11, batch e24s: done for its own keys: `withoutE24s` strips them in `seed.test.ts`, and 24.2-UNIT-SAME names the types e24s changes (`E24S_TYPES`: tc, transformador_forca, inspecao_qgbt), asserts they differ and are equal with their checklist part (and the inspection's thermography) removed, and leaves the No-break out of the v14 fixture (`withoutTypes`); open for e24p)*
- source_spec: `spec-e24a-conclusion-rules.md` (phase B report)
  summary: `e2e/cta.spec.ts` 14.5-E2E-001 and `e2e/qgbt.spec.ts` 14.9-E2E-001 build their template in the composer, which always takes the current seed; to keep asserting the v13 conclusion they pin the template's seed with a server-op helper (`pinTemplateSeed`) instead of a tap.
  evidence: `e2e/support/` (`pinTemplateSeed`), the two specs.
  class: debt
  state: open (owner: the next carry-over batch: give these two specs a v14 twin or a seeded template)
- source_spec: `spec-e24a-conclusion-rules.md` (Story 24.3, coordinator's readings)
  summary: Built as the coordinator read them, open to Matheus: an NC row and a restricted reading still floor Aprovado · Com restrições on v14; the technician's Aprovado · Com restrições is justified in OBSERVAÇÕES (no second field); on v14 OBSERVAÇÕES is required under any Reprovado, the technician's own included, so a Reprovado ficha cannot be concluded without it; the arrester's prerequisite with its plate off is ignored on v14 only.
  evidence: `epics.md` § Story 24.3, "Coordinator's reading"; `relatorio/conclusion.ts` `observationRequiredBy`, `computeFloor`; `relatorio/restriction.ts` `prerequisiteFailure`.
  class: decision
  state: open (owner: Matheus)
- source_spec: `spec-e24a-conclusion-rules.md` (Story 24.3)
  summary: A restriction stored under a v14 Reprovado (a ficha concluded Aprovado · Com restrições whose reading was then corrected out) is ignored on read and shows "Conclusão ajustada pela ficha" until the technician confirms; nothing rewrites it on its own (decision 3).
  evidence: `relatorio/conclusion.ts` `effectiveConclusionPair`, `conclusionAdjusted`, `conclusionPairWrites` (`clearRestriction`).
  class: note
  state: open (owner: the Epic 24 hands-on pass: check it reads as intended)

## Deferred from: Epic 24 batch e24c (2026-11-11)

- source_spec: `spec-e24c-company-types.md` (Design Notes D2; Story 24.18)
  summary: the printed form of a tolerance is Bruno's open item B-9. Until he answers, "nominal ± %" reads "220 V ±5 %" (the sign glued to the tolerance, a space before "%"), as the ratio's "±0,5 %" prints today; the story and the mock wrote "220 V ± 5 %".
  evidence: `packages/domain/src/seed/criteria.ts` `formatCriterionValue`.
  class: decision
  state: open (owner: Bruno, with B-9, through Matheus)
- source_spec: `spec-e24c-company-types.md` (Design Notes D3; Story 24.20)
  summary: the story asked "the strict schema refuses the same draft on the server". The rule is a publish rule instead: the editor's issue and the push route's refusal (`checkClientOp`, `op_invalid`). The strict schema runs in the fold of every pulled version create, so a rule there would stop a fresh device's sync on a version already published broken (possible before e23z). An older build cannot publish such a type either, because contract 44 refuses its pull.
  evidence: `packages/domain/src/types/validate.ts` `vectorGroupPublishIssue`; `apps/api/src/sync/rules.ts` `checkClientOp`.
  class: note
  state: open (owner: Matheus, to accept the narrowing)
- source_spec: `spec-e24c-company-types.md` (Story 24.19, the coordinator's readings)
  summary: the original is hidden in the template composer's palette too, and the copy takes the original's place in the list instead of sitting at the end of "Outros equipamentos" (both coordinator's readings, built as written). A copy whose base the relatório's seed does not ship (a library type first shipped by a later seed) hides nothing there and stays at the end of "Outros equipamentos".
  evidence: `packages/domain/src/relatorio/tree.ts` `hidingCopies`, `paletteTypeGroups`.
  class: decision
  state: open (owner: Matheus)
- source_spec: `spec-e24c-company-types.md` (authored strings, listed for Bruno)
  summary: the batch's authored pt-BR texts: the rule word "nominal ± %" and the line of rules with it after "entre"; the inputs "Valor nominal" and "Tolerância (%)"; the issues "informe a tolerância (%).", "a tolerância (%) precisa ser maior que zero.", "só a regra "nominal ± %" tem tolerância.", "informe o valor nominal." and "a regra "nominal ± %" julga uma leitura, não o desvio da relação de transformação; escolha outra regra."; the palette mark "Tipo da empresa · …"; the hidden line "Oculto nas paletas: a cópia … está publicada." (several: "as cópias … e … estão publicadas."); the new `libraryNote`; Story 24.20's issue ("… a relação de transformação é calculada pelo grupo de ligação do campo … da placa, que não está mais na placa como a lista dos grupos. Remova este ensaio, ou comece de novo com "Duplicar".", summary "… sem o campo …") and its refusal toast ("O campo … não pode mudar de tipo nem de opções: …").
  evidence: every `// authored (e24c, listed for Bruno)` in `packages/domain/src` and `apps/web/src/copy/pt-br.ts`.
  class: decision
  state: open (owner: Bruno, through Matheus)
- source_spec: `spec-e24c-company-types.md` (Story 24.18 AC "ACEITÁVEL prints 220 V ± 5 %"; Tasks 7)
  summary: a measurement table prints no criterion since Story 22.2 (its ACEITÁVEL line was removed), and `print/section-9.ts` is outside this batch, so a "nominal ± %" row of a measurement table in V prints its reading and the ficha's marks as a range row does, but no "220 V ±5 %". ACEITÁVEL prints the rule's text on a seeded-grammar test (insulation, contact, ratio), whose criterion units are the seed's (MΩ, µΩ, %): `24.18-E2E-001` reads "100 µΩ ±20 %" there. Printing a measurement row's criterion is a print change for a later batch.
  evidence: `packages/domain/src/print/section-9.ts` `measurementTestPart`, `instrumentPart`; `e2e/nominal-tolerance.spec.ts`.
  class: decision
  state: open (owner: Matheus: print a measurement table's criteria, or accept)
- source_spec: `spec-e24c-company-types.md` (review, Edge Case Hunter and Verification Gap Reviewer)
  summary: in the template composer a library type hidden by a published copy leaves the palette, and with it the only "Editar padrões" entry of that type: a template that already places it (the standard template places five transformers) keeps its rows and its quantities (the skeleton list's grid), but its defaults for that type cannot be edited while the copy is published. Retiring the copy brings the entry back. Whether the composer should keep a placed original's row (for its defaults and its count) is the same product choice as the coordinator's reading on the composer's palette.
  evidence: `apps/web/src/surfaces/templates/block-palette.tsx` (`onEditDefaults` only on a palette row of a placed seeded type); `packages/domain/src/relatorio/tree.ts` `paletteTypeGroups`.
  class: decision
  state: ~~open (owner: Matheus, with the 24.19 reading on the composer's palette)~~ closed (2026-11-11, fix batch e24x, on Matheus's decision 17): while a template places it, the hidden original stands right after its copies in the composer's palette with "Editar padrões", its count, and a stepper disabled by the type list's hidden line (`types/palette-meta.ts` `composerHiddenTypes`; `spec-e24x-review-fixes.md` Design Notes D4).

## Deferred from: Epic 24 batch e24p (2026-11-11)

- source_spec: `spec-e24p-print.md` (Part A report; Story 24.15)
  summary: before a relatório is issued, its sheet reads the equipment's top entry as its previous visit whatever the dates: while relatório A (service in March) is still open and relatório B (service in September) is already issued, A's sheets and A's preview show B's later values as "Anterior" and MANUT. ANTERIOR. The story orders the stored chain at issue (A becomes B's `prior`, never the top) and says nothing about what an open relatório reads; `previousResultsFor` takes no service date of its own relatório.
  evidence: `packages/domain/src/print/reading-slots.ts` `previousResultsFor`; `packages/domain/src/print/visit-date.ts` `compareVisits`.
  class: decision
  state: ~~open (owner: Matheus: should an open relatório read no previous visit, or the prior, when the stored top is a later visit by date)~~ closed (2026-11-11, fix batch e24x, D3): the coordinator took it as a defect (a signed document naming a later visit as the previous one), listed for Matheus: a sheet reads no visit later than its own relatório's service date; with the top later it reads the top's prior when that is not later, else nothing; with its own dates unknown, as before (`previousResultsFor`'s `visitDate`, passed by the visit context, the "Anterior" helper and section 9).
- source_spec: `spec-e24p-print.md` (Review Triage Log, Edge Case Hunter; Story 24.15)
  summary: a re-issue whose service dates were edited after its first issue is not re-ordered: on a re-issue of the top relatório the date order is not compared with its prior, and when the top's `prior` is the re-issued relatório (fix batch e23w's first rule) its new date is not compared with the top. Reached only by editing the service dates of an issued relatório and issuing it again.
  evidence: `packages/domain/src/print/last-results.ts` `lastResults` (the `order` line and the W2-1 branch above it).
  class: defect
  state: open (owner: the next batch touching `print/last-results.ts`; low)
- source_spec: `spec-e24p-print.md` (Review Triage Log, Edge Case Hunter; Story 24.17)
  summary: on seed v14 the action a point starts with joins several recommendations (a chosen Reprovado over several tests, a failed index beside its test's), and each recommendation may hold up to the action's own cap (1000 characters): ~~a join longer than the cap shows over the editor's count and the create is refused until the technician shortens it~~ (2026-11-11, fix batch e24x, D2: past the cap the action starts empty and the recommendations start the text, Story 23.11's form, or the finding stands alone past the text's cap; no create the server refuses is offered). Not reachable with the imported base's lengths seen so far.
  evidence: `packages/domain/src/points/derived.ts` `sheetPointFindings`; `value-limits` point action cap (medium).
  class: note
  state: ~~open (owner: Matheus, with Bruno's base; low)~~ closed (2026-11-11, fix batch e24x, D2).
- source_spec: `spec-e24p-print.md` (Design Notes D2; Story 24.16)
  summary: the note line under a table names each flagged cell with the kernel's reason as it stands ("alta de 53 % sobre 40 µΩ da manutenção anterior, rev. 1 de 14/03/2026, acima do limite de 50 %"; "queda de mais de 50 % desde a manutenção anterior (de 16,4 GΩ para 7,9 GΩ, a 20 °C)"), as the story says; the approved frame's sample was shorter ("subiu 53 % (40 µΩ)"). A risen pole is named where the conclusion names it ("T1-T2–Fase A").
  evidence: `packages/domain/src/print/history-note.ts`; `key-print-section-9-v14.html` (sample text).
  class: decision
  state: open (owner: Bruno, through Matheus, with the authored sentences)
- source_spec: `spec-e24p-print.md` (Design Notes D5; Story 24.17)
  summary: a reading back within its criterion does not ask about the point written from its test, as an NC row back to Conforme asks (Story 24.7): the story does not ask for it. The point keeps "Origem resolvida" and the card's "Remover ponto".
  evidence: `packages/domain/src/points/derived.ts` `resolvedOriginPoints`; `apps/web/src/surfaces/ficha/point-place.tsx`.
  class: decision
  state: open (owner: Matheus)
- source_spec: `spec-e24p-print.md` (the coordinator's readings of Stories 24.15 to 24.17, built as written)
  summary: built as the coordinator read them, open to Matheus: the service date kept is `service_end`, else `service_start`; an older visit with no service date is compared by its issue date; "relevant" for the note is what the three v13 rules flag; "Criar ponto de atenção" on a test that fails, a restricted reading and a ficha the technician reproved, one per test, on every seed; a restricted reading's point starts with no recommendation. Also built: a failed prerequisite whose test's sub-block is off offers its action on the Conclusão step (D6); a single recommendation in the v14 action takes a final period, as Story 23.11's join gives it.
  evidence: `spec-e24p-print.md` Design Notes D4 to D6.
  class: decision
  state: open (owner: Matheus)
- source_spec: `spec-e24p-print.md` (authored strings, listed for Bruno)
  summary: the batch's authored pt-BR text: the note line's opening and form "Em relação à manutenção anterior: ⟨onde⟩, ⟨motivo⟩; ⟨onde⟩, ⟨motivo⟩." (Story 24.16). The header's second line is a date; the editor's helpers "Da recomendação do ensaio · editável" and "Das recomendações dos ensaios · editável" are the frame's.
  evidence: every `// authored (e24p, listed for Bruno)` in `packages/domain/src`.
  class: decision
  state: open (owner: Bruno, through Matheus)
- source_spec: `spec-e24p-print.md` (the print check of the touched table shapes, Story 24.15)
  summary: the seccionadora's side-by-side insulation tables with MANUT. ANTERIOR break "GUARD" inside the word ("GUAR" over "D") at their type size. It is already so in the locked v13 golden (`golden/layout-lock-v13/pdf-text.json`), so it is not caused by the dated header (whose date is narrower than "ANTERIOR"); on v14 it prints the same. Fixing it is a layout change of a locked shape.
  evidence: `apps/api/src/jobs/generate/golden/layout-lock-v13/pdf-text.json` ("LINHA TERRA GUAR D TENSÃO"); `test-results/e24p-pdf/e24p-v14-relatorio.pdf` page 12; `e24p-pdf-crops/v14-dated-header-and-rise-note.png`.
  class: defect
  state: ~~open (owner: Matheus: a v14 fit change for that shape, or accept)~~ *(2026-11-11, fix batch e24y, P1: closed on v14. The pair is fitted whole there (`paired_tables_fit_whole`): measured by Arial's widths against the page, columns first, each value joined to its unit; v13 keeps its pair byte for byte, "GUAR"/"D" included, as its golden holds it. `spec-e24y-pass-fixes.md`, `e24y-pdf-crops/`.)*
- source_spec: `spec-e24p-print.md` (the PDF crops, Story 24.16)
  summary: the note line wraps where LibreOffice finds a space, so a value and its unit can part across lines ("limite de 50" / "% ...", "a 20" / "°C"). The kernel's reasons use plain spaces before "%" and "°C" everywhere; a no-break space in the note alone would make its text differ from the same reason elsewhere.
  evidence: `e24p-pdf-crops/v14-dated-header-and-rise-note.png`, `e24p-pdf-crops/v14-insulation-dated-header-and-drop-note.png`.
  class: note
  state: open (owner: Matheus, with the note's wording; low) *(2026-11-11, fix batch e24y: still open. P1's no-break space joins a value to its unit inside the paired tables and the measurement tables only; the note line is a paragraph whose reasons are the kernel's own texts, so the same rule there would make them differ from the conclusion's and the point's.)*

## Deferred from: Epic 24 batch e24s (2026-11-11)

- source_spec: `spec-e24s-seed-v14-sheets.md` (Story 24.13)
  summary: The plate prompt is `bedrock-structuring-9` (a note that the "BATERIAS:" fields are the battery bank's, read only where the photo shows them, and that BATERIAS: QUANTIDADE is a plain count). No paid eval ran in the batch (no cloud account in a batch, Policy); every fake-provider test of the No-break plate is a plumbing test (E21-A4 P-1).
  evidence: `apps/api/src/jobs/reading/providers/bedrock.ts` (`BEDROCK_STRUCTURING_PROMPT_VERSION`, `plateFieldNotes`); `apps/api/src/scripts/eval-samples.ts` (the No-break sample).
  class: gap
  state: open (owner: the coordinator, before the Epic 24 deploy, on Matheus's AWS login: the battery fields filled only from text printed for the batteries and left empty otherwise, the quantity a plain number, the VA, W, min and Ah values, and every older plate reading as on `bedrock-structuring-8`)
- source_spec: `spec-e24s-seed-v14-sheets.md` (review, Edge Case Hunter and Verification Gap Reviewer, two low rows rejected)
  summary: The v14 Malha de aterramento's first block reads "Dados da malha" on the sheet and in the composer only; the Conflict view still names its fields under "Dados de placa" (`SECTION_NAMEPLATE`) and the sheet stepper's step still reads "Placa".
  evidence: `packages/domain/src/merge/conflicts.ts:155`; `apps/web/src/copy/pt-br.ts` (`placa: { long: 'Placa', short: 'Placa' }`); `packages/domain/src/relatorio/nameplate-block.ts` `nameplateTitleOf`.
  class: debt
  state: ~~open (owner: the next batch touching the conflict view or the sheet stepper; Bruno may say whether the step should read "Malha")~~ *(2026-11-11, fix batch e24y, F10: closed. The stepper, the Sheet header and the Conflict view read the definition's `nameplate_title` ("Dados da malha"), and on v14 (`empty_steps_hidden`) the Malha shows no "Verificações" step. Bruno may still say whether the step should read "Malha".)*
- source_spec: `spec-e24s-seed-v14-sheets.md` (the coordinator's readings of Stories 24.10 to 24.14, built as written)
  summary: Built as the coordinator read them, open to Matheus: the TC gains no item on its secondary (B-11 for Bruno) and the TP's fuse wording is a hint; forced ventilation is item 5 renamed and made a dry item, the three new transformer items appended, nothing printed about the laboratory's report; the QGBT function test is one item with a hint and the thermography keeps its four points (B-3); the No-break has six items, "Potência (VA/W)" is two fields (W optional), the battery fields carry "BATERIAS:" and the photo fills them only when it shows them; the "Outro" text is required while it shows; the grid's block is "Dados da malha", on v14 only.
  evidence: `epics.md` § Stories 24.10 to 24.14, "Coordinator's reading"; `packages/domain/src/seed/v14.ts` (the batch's fenced sections).
  class: decision
  state: open (owner: Matheus)
- source_spec: `spec-e24s-seed-v14-sheets.md` (authored strings, listed for Bruno)
  summary: The batch's authored pt-BR texts: the TP's FUSÍVEIS hint; the transformer's three new items' NC phrases; the QGBT inspection's two hints and the function test's four phrases; the No-break's name, print title, eighteen plate labels, six items, two hints and nineteen NC phrases, and its nouns; "Descreva o motivo", "Ditar o motivo", the printed form "MOTIVO: OUTRO, <texto>"; "Dados da malha"; the toast for cleared dry items (the reason line of an oil field on a non-oil unit reuses e23p's form).
  evidence: every `// authored (e24s, listed for Bruno)` in `packages/domain/src` and `apps/web/src/copy/pt-br.ts`; `docs/nc-chip-phrases.md`.
  class: decision
  state: open (owner: Bruno, through Matheus, with B-7)
- source_spec: `spec-e24s-seed-v14-sheets.md` (Story 24.12)
  summary: The v14 Inspeção de QGBT, a library type, numbers its measurement tests, so its thermography prints as "E1 · TERMOGRAFIA" where the eight types print "TERMOGRAFIA" under their own numbering. Kept: it is how a library type's measurement test prints (the CTA's "E1 · RESISTÊNCIA DE CONTATO", `measurement-print.test.ts`).
  evidence: `packages/domain/src/print/section-9.ts` (the library type's test numbering); `e2e/seed-v14-qgbt-inspecao.spec.ts`.
  class: note
  state: open (owner: the Epic 24 hands-on pass: check it reads as intended)
- source_spec: `spec-e24s-seed-v14-sheets.md` (Stories 24.11 and 24.12)
  summary: `screenLabel` learned three words for the v14 labels: "DPS" is an acronym, "O" is a lowered one-letter word ("Torque conforme o fabricante"), and "NA" inside a phrase reads as the preposition ("Trincas na resina") while the column "NA" alone stays. No v1 to v13 label holds "O" or an inner "NA" (`screen-label.test.ts`); screen only, print unchanged.
  evidence: `packages/domain/src/relatorio/screen-label.ts` (`ONE_LETTER_WORDS`, `PREPOSITION_ACRONYMS`).
  class: note
  state: closed (2026-11-11, batch e24s, tested in `screen-label.test.ts`)
- source_spec: `spec-e24s-seed-v14-sheets.md` (Story 24.14)
  summary: The cap of `sheet/test/value` at the route rose from short (200) to medium (1000) for the oil sampling's text value; the fold keeps every non-text value's strings within 200 (`assertTestValueShape`), so a long string on a number or a choice value is now refused by the fold instead of by the route's value check.
  evidence: `packages/domain/src/ops/value-limits.ts` (`sheet/test/value`); `packages/domain/src/ops/apply.ts` `assertTestValueShape`; 24.14-API-001.
  class: note
  state: closed (2026-11-11, batch e24s; the production over-cap count of 2026-11-04 found no stored value over a cap, so no replayed op reaches the fold's check over 200)

## Deferred from: Epic 24 fix batch e24x, the integrated review's fixes, part 1 (2026-11-11)

- source_spec: `spec-e24x-review-fixes.md` (integrated review B2, ledger only)
  summary: remove a sheet, add the same type from the palette, restore the removed sheet: two live equipment on one `reuse_key`; the next relatório binds the oldest, and nothing reports the other.
  evidence: `apps/web/src/surfaces/relatorio/tree-actions.ts:792`; `packages/domain/src/relatorio/tag.ts:211` (`reuseKeyFor`).
  class: decision
  state: open (owner: Matheus)
- source_spec: `spec-e24x-review-fixes.md` (B4, stopped by its Boundaries)
  summary: binding an obra's equipment to a template block of another type of the same family (the library breaker and its published copy) is one line in `instantiateTemplate` (`free`), but the previous visit refuses it: `previousResultsFor` returns no previous visit when the equipment's last entry (`last_results.block_type`) is of another type than the sheet's ("the equipment changed type"), so the copy's sheet would show no "Anterior", print no MANUT. ANTERIOR and judge no history rule, the opposite of the I/O row. Reading across a family there needs the company's type definitions in `previousResultsFor` and so in `visitContextOf`, which 6 of its 14 callers (the ficha's live queries, the conclusion writes, `sheetProgress`, the merge view) do not hold today, and its memo keys on the block type alone. Also, a copy's TAG prefix is `TAG_PREFIX` while the library row's key used `LEGACY_TAG_PREFIX`, so a seccionadora copy (SC) never finds a library seccionadora's key (SEC), and a copy whose prefix was edited finds none. Nothing was changed for B4.
  evidence: `packages/domain/src/relatorio/instantiate.ts` (`free`, the reuse run); `packages/domain/src/print/reading-slots.ts` `previousResultsFor`; `packages/domain/src/relatorio/visit-context.ts` `visitContextOf`; `packages/domain/src/types/duplicate.ts` `seededTagPrefix`.
  class: decision
  state: open (owner: Matheus: thread the definitions through the visit context for a family-aware previous visit, or keep the binding to one type)
- source_spec: `spec-e24x-review-fixes.md` (A1, Design Notes N1, listed for Matheus)
  summary: with the seed's phrases alone automatic (decision 17), a learned or a recent chip tapped and left untouched is now kept with the warning when its row leaves NC (one tap on "Apagar observação" removes it, with "Desfazer"), where Story 24.6 removed it; and a seed phrase typed letter by letter still reads as automatic and is removed (no stored provenance tells a tap from typing; one would be a contract).
  evidence: `packages/domain/src/relatorio/ficha.ts` `ncObservationOnLeave`.
  class: decision
  state: open (owner: Matheus)
- source_spec: `spec-e24x-review-fixes.md` (B1, Design Notes N2)
  summary: with the uplink floor at 1 KB/s a push whose answer never comes holds its sync cycle up to ~~about 69 min at 4 MiB (was 572 s)~~ *(2026-11-11, review: 360 s per attempt, the body's share capped at 300 s, the server's request limit; about 18 min over the three attempts of one cycle)*; a body-less request still ends after 60 s. A doubling per attempt was not taken.
  evidence: `apps/web/src/sync/client.ts` `SYNC_REQUEST_FLOOR_UPLINK_BYTES_PER_S`, `requestHeadersTimeoutMs`.
  class: note
  state: open (owner: the next batch touching sync; low)
- source_spec: `spec-e24x-review-fixes.md` (D4, ledger only; e24p Design Notes D4)
  summary: a top entry from before Story 24.15 (no `service_date`; service 2026-11-03, issued 2026-11-10) is dated by its issue day, so a re-test with service 2026-11-08 issued after the deploy compares as older than it and is filed as its prior: the earlier visit stays on top and the re-test's sheets read nothing newer.
  evidence: `packages/domain/src/print/visit-date.ts` `visitDateOf`, `compareVisits`; `packages/domain/src/print/last-results.ts` `lastResults` (the `order` line).
  class: decision
  state: open (owner: Matheus)
- source_spec: `spec-e24x-review-fixes.md` (review X6)
  summary: a reading above the instrument's limit inside a range criterion withholds the ficha's floor and the paragraph reads "a conferir", but its cell carries no helper saying why: e24f R-1's "Conferir: leitura sem comparação com as outras fases, sem critério aplicado" names the other phases and does not fit. Proposed sentence for Bruno: "Conferir: o limite do instrumento está dentro da faixa do critério; meça com outra escala." Not authored in code.
  evidence: `packages/domain/src/relatorio/measurement-evaluation.ts` (the over-range cells an absolute criterion leaves unjudged); `relatorio/conclusion.ts` `overRangeUnjudged`.
  class: decision
  state: open (owner: Bruno, through Matheus)
- source_spec: `spec-e24x-review-fixes.md` (review X8)
  summary: D1 on the Não ensaiado band (the editor kept open through its autosave, the focus on "Desfazer") has a web test over a live snapshot but no end-to-end step.
  evidence: `apps/web/src/surfaces/ficha/point-place.test.tsx`; `e2e/points.spec.ts`.
  class: test-gap
  state: open (owner: the next batch touching the band; low)
- source_spec: `spec-e24x-review-fixes.md` (review X8)
  summary: nothing tests what the sheet shows for a reading "a conferir" because of C1 (a limit inside a range): no helper exists for it (X6), and no web test pins the cell.
  evidence: `apps/web/src/surfaces/ficha/measurement-test-section.tsx`.
  class: test-gap
  state: open (owner: with X6's sentence)
- source_spec: `spec-e24x-review-fixes.md` (review X8)
  summary: no test runs three hung push attempts of one sync cycle against the capped bound (about 18 min).
  evidence: `apps/web/src/sync/engine.ts` (`withRetry` of the push); `apps/web/src/sync/client.test.ts`.
  class: test-gap
  state: open (owner: the next batch touching sync; low)
- source_spec: `spec-e24x-review-fixes.md` (review X8)
  summary: no test re-issues a top entry from before Story 24.15 (no `service_date`) after the reading relatório's service date, where D3 and D4 meet.
  evidence: `packages/domain/src/print/reading-slots.ts` `previousResultsFor`; `print/last-results.ts` `lastResults`.
  class: test-gap
  state: open (owner: the next batch touching the previous visit; low)
- source_spec: `spec-e24x-review-fixes.md` (review X8)
  summary: decision 17's composer row (the hidden original kept for its defaults) is untested at 390 px and with several published copies of one type.
  evidence: `apps/web/src/surfaces/templates/block-palette.tsx`; `packages/domain/src/types/palette-meta.ts` `composerHiddenTypes`.
  class: test-gap
  state: open (owner: the next batch touching the composer; low)

## Deferred from: Epic 24 fix batch e24y (2026-11-11)

- source_spec: `spec-e24y-pass-fixes.md` (Design Notes N2; P2)
  summary: a confirmed conclusion text prints only while it is the text composed now (`printedConclusionText`), and a stale confirmed text prints only when the floor adjusted the pair. The batch carries the new TAG into an unedited, current suggestion in the rename's batch, but any other input that changes the composed text after "Concluir ficha" (a reading, an instrument, an observation edited while the pair stays) still leaves the CONCLUSÃO boxes with no paragraph and no warning. The same holds for a confirmed text that was already stale when the TAG was renamed: the rename writes nothing to it.
  evidence: `packages/domain/src/relatorio/conclusion.ts` `printedConclusionText`, `conclusionTextState`; `packages/domain/src/relatorio/tag-rename.ts`.
  class: decision
  state: open (owner: Matheus: a stale confirmed text prints the stored text, the composed one, or blocks "Gerar" with a Sumário warning)
- source_spec: `spec-e24y-pass-fixes.md` (Design Notes N6; P6)
  summary: not a defect. In the composer's palette the company copy "Chave seccionadora (SC)" (from before Story 24.8) is the one copy that hides the seeded seccionadora, so Story 24.19 proposes it; "Chave seccionadora (cópia)", made before fix batch e23z, carries no `base_block_type`, hides nothing and sits under "Outros equipamentos", and a type duplicated from it inherits none. An older copy without a base never hides its original.
  evidence: `packages/domain/src/relatorio/panel.ts` `proposedFor`; `packages/domain/src/relatorio/tree.ts` `hidingCopies`.
  class: note
  state: open (owner: Matheus: whether copies made before e23z should learn their base)
- source_spec: `spec-e24y-pass-fixes.md` (Design Notes N7; F4)
  summary: an NC row still offers "Criar ponto de atenção" after its point exists, so one item can hold several points.
  evidence: `apps/web/src/surfaces/ficha/checklist-section.tsx` (`ChecklistRow`).
  class: decision
  state: open (owner: Matheus: may an item hold several points)
- source_spec: `spec-e24y-pass-fixes.md` (Design Notes N7; F5)
  summary: in the local dev company the print's company identity differs from what Cadastros shows; older than Epic 24.
  evidence: the hands-on pass of 2026-11-11 (report kept outside the repository).
  class: defect
  state: open (owner: the next batch touching the cover's identity; low)
- source_spec: `spec-e24y-pass-fixes.md` (Design Notes N7; F7)
  summary: a conclusion and section 10 name only the first pole out by its criterion; a rise on another pole appears only in the note line.
  evidence: `packages/domain/src/relatorio/conclusion.ts` (`worstReadings`); `packages/domain/src/relatorio/parecer.ts`.
  class: decision
  state: open (owner: Bruno, through Matheus)
- source_spec: `spec-e24y-pass-fixes.md` (Design Notes N7; F12 and F13)
  summary: two wordings for Bruno: a restriction the technician chose over a clean sheet composes "dentro dos critérios ... Recomenda-se a correção dos pontos indicados" with no point indicated; an NC clause reads "apresentou baterias (item 4, NC)" before its observation.
  evidence: `packages/domain/src/relatorio/conclusion.ts` (`composeConclusion`, `ncClauseText`).
  class: decision
  state: open (owner: Bruno, through Matheus)
- source_spec: `spec-e24y-pass-fixes.md` (Design Notes N7; F15)
  summary: "Último envio" shows another device's older push.
  evidence: the hands-on pass of 2026-11-11; `apps/web/src/surfaces/sync/`.
  class: defect
  state: open (owner: the next batch touching the sync status; low)
- source_spec: `spec-e24y-pass-fixes.md` (P5, Design Notes N4)
  summary: like with like is judged on the current reading only: a reading corrected from the cabine's ambient (the plate's TEMPERATURA DO ÓLEO, or DO ENROLAMENTO, not typed) is not compared with the previous visit on v14. The stored previous reading keeps no record of where its temperature came from (a new synced field would be a fold change), so a previous visit corrected from its own ambient is still compared with a current one corrected from the plate. v13 keeps comparing as before.
  evidence: `packages/domain/src/relatorio/reading-evaluation.ts` (`unlike`), `packages/domain/src/relatorio/measurement-evaluation.ts` `applyHistory`; `packages/domain/src/schemas/entities.ts` `lastResultReadingSchema`.
  class: decision
  state: open (owner: Matheus: whether v13 should also take it, and whether the stored reading should keep its temperature's source)
- source_spec: `spec-e24y-pass-fixes.md` (P3, Design Notes N3)
  summary: the plate's TAG field renames the equipment on every seed (a person's commit, never on reading): an older seed's relatório whose stored plate TAG differs from its equipment's moves only when someone commits the field or renames. A plate reading that suggests a TAG and is confirmed through "Substituir" or "Confirmar todos" writes the cell alone, not the rename.
  evidence: `apps/web/src/surfaces/ficha/nameplate-section.tsx` (`commitPlateTag`); `apps/web/src/surfaces/ficha/nameplate-suggestions.tsx`.
  class: decision
  state: open (owner: Matheus: whether a confirmed TAG suggestion should rename too)
