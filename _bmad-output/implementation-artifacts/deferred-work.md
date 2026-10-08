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
  state: ~~open~~ closed (2026-09-28, `spec-epic-9-deferred-sweep.md`, batch C2, A11: with a logo the header is a two-cell borderless table (logo left, title and form lines right), unchanged without one (goldens unchanged); `docx.test.ts` "A11". The logo's width limit (half the content width) is an open question for Bruno's R-009 read)

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
  state: open (owner: Epic 5's equipment work, when nameplates make an equipment's identity visible)

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
  state: open (owner: Bruno, with the Epic 7 review)

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
  state: ~~open (owner: Epic 11 integrated review)~~ re-owned 2026-09-30 (E11-Q8): owner Matheus, latent until a relatório can remove a location. A relatório has no location-removal op today (`apps/web/src/surfaces/relatorio/relatorio-ops.ts` offers only the `location/{id}` create, `name`/`order_key` puts and `agrupar_por_tipo`; the only removal is the Template composer's), so no UI path produces the state (`reviews/epic-11-review-qa.md` E11-Q8)

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
  state: open (owner: epic QA)

- source_spec: `_bmad-output/implementation-artifacts/spec-11-11-sheet-photo-strip-and-direct-picker.md`
  summary: The "Fotos da ficha" strip draws caption, stamp and pill only; the mock (`60-ficha.html` 781) also prints the checklist row line ("Item 8 · Contatos · NC") and "Enviada" on an uploaded photo, and no test opens the strip on a not-tested (read-only) sheet.
  evidence: review BH5/BH6, 2026-10-06; the story's AC names badge, pill and caption.
  class: debt
  state: open (owner: epic QA)

- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-layout-copy-3.md`
  summary: Sumário row 11 reads "3 instrumentos · nenhum certificado anexado · Nenhum instrumento em Dados do relatório" when the sheets copied instruments but setup ticked none; the two parts are both true (sheets vs setup) but read as a contradiction (review 2026-10-07, BH2).
  evidence: `packages/domain/src/relatorio/sumario.test.ts` Porto Seguro case; the setup row wording comes from Story 7.5 and predates batch 3. A reword such as "nenhum marcado em Dados do relatório" would settle it; copy decision for Bruno.
- source_spec: `_bmad-output/implementation-artifacts/spec-review-fixes-layout-copy-3.md`
  summary: F-11's `scroll-padding-bottom` measures the sticky bar against `window.innerHeight`, so on WebKit/iOS the on-screen keyboard inset (`visualViewport`) is left out of the padding EXPERIENCE.md:369 asks for; the WebKit leg of `test:e2e:matrix` was not run for this batch (review 2026-10-07, BH8).
  evidence: `apps/web/src/components/toast.tsx` `stickyBarCovered`; unverified on WebKit. A `durability-webkit` run of the F-11 case, or a `visualViewport.height` fallback with a test, would settle it.

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
  state: open (owner: coordinator)

- source_spec: `_bmad-output/implementation-artifacts/spec-13-3-13-5-zoom-and-waiting.md`
  summary: Story 13.3's touch spec (`e2e/photo-zoom.durability.spec.ts`) is skipped on `durability-webkit`: Playwright's WebKit build cannot store a photo Blob in IndexedDB ("UnknownError: Error preparing Blob/File data to be stored in object store"), so no photo exists there to zoom. The WebKit leg of the 13.3 DoD is a manual iPad pass (Epic 13 batch C, 2026-10-07).
  evidence: `test.skip` on `browserName === 'webkit'` at the top of the spec; it runs green on desktop Chrome and Android Chrome emulation.
  class: debt
  state: open (owner: epic QA, manual iPad pass)
- source_spec: `_bmad-output/implementation-artifacts/spec-13-3-13-5-zoom-and-waiting.md`
  summary: Story 13.5 (WAIT-3): the palette lists every live panel photo awaiting its dialog on that location, including one shot on another device whose dialog is still open there, so two devices could confirm the same photo and create the block twice (review 2026-10-07).
  evidence: `packages/domain/src/relatorio/panel.ts` `panelPhotosAwaiting` filters by kind, target and liveness only. Limiting it to this device's or author's photos is a product rule.
  class: question
  state: open (owner: Matheus)
- source_spec: `_bmad-output/implementation-artifacts/spec-13-3-13-5-zoom-and-waiting.md`
  summary: Story 13.5 review (known open, unverified): the Sumário's `?panel=` effect drops the parameter if the photo is not yet in `snapshot.files` on its first run, so "Ver" would open the Sumário without the dialog; 13.5-E2E-005 passes, the tree mounting with the snapshot loaded.
  evidence: `apps/web/src/surfaces/relatorio/relatorio-tree.tsx` `PANEL_PARAM` effect. A slow-snapshot test would settle it.
  class: debt
  state: open (owner: epic QA)
- source_spec: `_bmad-output/implementation-artifacts/spec-13-3-13-5-zoom-and-waiting.md`
  summary: Story 13.5 review (known open): the panel dialog's elapsed wait text ("Lendo… N s" after 10 s) and the cancel sweep's order before auto-confirm (a cancelled reading equal to a typed value must be discarded, not auto-confirmed) have no test.
  evidence: `panel-capture.tsx` `panelWaitText`; `apps/web/src/sync/engine.ts` post-pull sweep; neither is referenced by a test.
  class: debt
  state: open (owner: Epic 13 fix batch)
- source_spec: `_bmad-output/implementation-artifacts/spec-13-8-emission-audit.md`
  summary: Story 13.8 review (known open): the audit worker's invalid-payload path (`handleAuditJobs`, `recordInvalidPayload` in `apps/api/src/jobs/audit/worker.ts`) has no test; a malformed job would leave its run reading as running until its age expires.
  evidence: only the definitions reference them; the integration test calls `runAuditJob` directly. Mirror `apps/api/src/jobs/generate/worker.integration.test.ts`.
  class: debt
  state: open (owner: Epic 13 fix batch)
- source_spec: `AGENTS.md` (Decisions of record, 2026-10-08 story gate)
  summary: Three unit failures recur on this host in almost every gate and force reruns: `apps/web/src/state/theme.test.tsx` (fails every run), `apps/web/src/surfaces/export/export-dialog.test.tsx` (load-sensitive, passes alone) and the unhandled timer error from `apps/web/src/components/number-input.test.tsx:21` (a harness timer never cleared, setState after teardown). Fix them so a red unit stage means a defect.
  evidence: Epic 13 gate logs (`test-results/gate-e13*/test-unit.log` in the batch worktrees); `reviews/epic-13-review-qa.md` § 4 (b).
  class: debt
  state: open (owner: the next carry-over batch)
- source_spec: `AGENTS.md` (Decisions of record, 2026-10-08 story gate)
  summary: Measure, on a free machine, (B) the `@p0` e2e at `--workers=2` against `PARALLEL_WORKERS=1` (the 2026-09-27 three-worker validation failed on the older 4 GB VM; the VM now has 11.4 GB) and (C) the plain `pnpm verify` against the stage-by-stage gate (it was OOM-killed on the 4 GB VM). Adopt each one only if it stays green twice.
  evidence: `e2e/support/groups.ts` `PARALLEL_WORKERS`; `scripts/verify.ts` phases; `spec-test-speed.md`.
  class: debt
  state: ~~open (owner: coordinator, next free gate)~~ closed (2026-10-08, main a8b9b0e): (B) `--workers=2` passed `@p0` 229/229 twice (612 s, 723 s, against 1081 s on one worker), `PARALLEL_WORKERS` is now 2; (C) the plain `pnpm verify` ran twice without OOM (run 1 green in 1527 s; run 2 stopped at `test:unit` on the recurring `export-dialog.test.tsx`, the entry above), the stage-by-stage script is retired
- source_spec: `epic-13-retro-2026-10-08.md` (E13-A1 wave gate)
  summary: Four e2e failures remain on integrated main after Epic 13, each a known host failure or red on the pre-epic base b1c2c6b: points 6.6-E2E-011 (load-sensitive, passes alone), ficha.durability E5-A2-E2E-003 (`toBeFocused` "inactive" at 390 px on this host), Android 4.5-E2E-004 (phone palette bottom sheet) and WebKit F-11 (reading focus by Tab or Enter run). They keep `test:e2e:full` and the matrix red on this host.
  evidence: `test-results/wave-e13/e2e-full.log` and `e2e-matrix.log` in the E13-A1 worktree; `reviews/epic-13-review-qa.md` § 1 (base comparison).
  class: debt
  state: open (owner: the next carry-over batch, with E13-A2)
- source_spec: `epic-13-retro-2026-10-08.md` (E13-A1 wave gate)
  summary: Building the api/tools image from scratch in a new compose project on this macOS podman host fails: the LibreOffice step downloads the arm64 packages while dpkg reports an amd64 system ("package architecture (arm64) does not match system (amd64)"). Existing images run fine, so new worktrees reuse them with `podman tag`. Likely a `TARGETARCH` versus the base image platform mismatch in the Dockerfile's LibreOffice case.
  evidence: `test-results/wave-e13/attempt1/verify-plain.log` (E13-A1 worktree) around line 675; the `RUN arch="${TARGETARCH:-$(dpkg --print-architecture)}"` step.
  class: defect
  state: open (owner: the next carry-over batch)
