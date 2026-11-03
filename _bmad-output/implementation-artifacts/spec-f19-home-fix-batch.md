---
title: 'E19-A2: Home fix batch (current card rule, pending list, page-size chips, tests)'
type: 'bugfix'
created: '2026-11-03'
status: 'done'
route: 'dispatch'
baseline_revision: 'f085d7ec0ae6a6af32a4ba6af4fb5194dfabc0f1'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: medium
context:
  - '{project-root}/AGENTS.md'
warnings: ['batched', 'multiple-goals']
batched_because: 'E19-A2 is one retrospective action item of eight small Home fixes on the same three files (cards.ts, home-surface.tsx, chip.tsx) and two specs; one branch and one story gate (Matheus, token economy).'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The Epic 19 retrospective (`_bmad-output/implementation-artifacts/epic-19-retro-2026-11-03.md` § Diff-scope review, R-2 to R-13) found that Story 19.2 made the current card follow the new list order (R-2), cuts the first frame of a cold open in the wrong order (R-3), fires a page-size click on every key even when the selection does not move (R-5), keeps the active statuses as a hand list (R-7), lets a failed preference read take down Home (R-11) and changes the note silently for screen readers (R-12); two Home tests are weaker than their ACs (R-8, R-9).

**Approach:** Fix each in place, red first, at its owner (kernel for the rule and the list, the sync provider for the read flag, the chip group for the keys, the surface for the fallback and the live line), strengthen the two e2e checks, and record the four deferred findings (R-4, R-6, R-10, R-13) as ledger rows (E19-A3).

## Boundaries & Constraints

**Always:**
- AD-13: every selection, order, count and text stays in `packages/domain`; the surface only renders and keeps the pressed tile and the page size.
- R-2 rule (conservative reading while Matheus's E19-A1 decision on "most recent" is open): the current card is the on-device (`syncStates` holds its id) Em campo card with the latest `service_start`, a missing date after any date, then the smaller id (the pre-19.2 `57d3b5cc` rule), chosen independently of the list sort. It is moved first, as today. The list order itself (summary `updated_seq` descending, unsynced right after the current card) does NOT change.
- R-3: Home's list and Status board stay pending (the existing `LoadingNote`) until the provider's `sync_state` live query (which carries the company stream and its summary) has answered. The new flag is optional in `SyncState` (older test doubles omit it and read as answered), like `outboxRead`.
- R-5: `FilterChipGroup.moveTo` always moves focus; it clicks the target chip only when the target id differs from `selectedId`, and calls `onChange(target.id)` directly when the chip's ref is missing.
- R-7: `HOME_ACTIVE_STATUSES` is derived from `RELATORIO_STATUSES` as every status except `emitido`, and a kernel test pins it.
- R-11: the page-size live query falls back to `DEFAULT_HOME_PAGE_SIZE` when `readHomePageSize` rejects.
- R-12: a visually hidden `role="status"` line, always mounted in the list section, carries `list.note` (empty string when null or pending); the visible note stays. No new copy: the text is the kernel's note.
- Red first: every new or changed unit/component test is run and seen failing before its fix; record the red run (command and failing test name) in the report. E2E strengthenings (R-8, R-9) need not be red (they cover behavior already right).
- English code and comments, no emoji, no new pt-BR string.

**Never:**
- No change to the list order, the summary, `updated_seq`, any op, seed or contract version, or the server.
- No change to telemetry targets or any `data-telemetry` name on Home (Story 18.4 owns per-tile and per-size targets).
- No edit to `sprint-status.yaml` or `epics.md`. No fix of R-1, R-4, R-6, R-10 or R-13 (ledger rows only).
- No new shared component; no CSS beyond what `.visually-hidden` already gives.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Two Em campo on device (R-2) | A: em_campo, on device, `updated_seq` 9, start 2026-08-01; B: em_campo, on device, `updated_seq` 3, start 2026-09-01 | B `isCurrent` and first; A in its sequence place after any unsynced card | none |
| Same start (R-2) | two on-device Em campo, equal start | the smaller id is current | none |
| Missing start (R-2) | on-device Em campo with no start vs one with a start | the one with a start is current | none |
| Not on device (R-2) | Em campo with the latest start but no sync state, plus an on-device Em campo | the on-device one is current | none |
| Cold open (R-3) | rows and page size read, provider's states not yet answered | `LoadingNote`, no tiles, no cards | none |
| Answered (R-3) | states answered, no company stream yet (fresh device) | list renders (summary empty) | none |
| Home key on first chip (R-5) | chip 10 checked and focused, press Home | focus stays on 10, no click event, `onChange` not called | none |
| Arrow moves (R-5) | 10 checked, ArrowRight | focus and selection on 20, exactly one click on it | none |
| Missing ref (R-5) | the target's ref is null | `onChange(target.id)` called once | none |
| Status list (R-7) | `RELATORIO_STATUSES` | `HOME_ACTIVE_STATUSES` equals it without `emitido`, same order | none |
| Pref read fails (R-11) | `readHomePageSize` rejects | Home renders with a page of 10 | silent |
| Note changes (R-12) | 12 emitted, tile pressed, press 50 | the `role="status"` line reads "Mostrando 10 de 12 relatórios", then "Mostrando 12 de 12 relatórios" | none |

</intent-contract>

## Code Map

- `packages/domain/src/home/cards.ts:292-319` -- `homeCards` sort and the `current` pick (`cards.find(... 'em_campo' && states.has ...)` on the sorted array, R-2). Replace the pick with its own comparison over `sources` (`service_start`) per the rule; keep the `unshift`. `:325` `HOME_ACTIVE_STATUSES` (R-7); `RELATORIO_STATUSES` is already imported (`:7`). `homeList` (`:374-399`) reads `HOME_ACTIVE_STATUSES`; keep its behavior.
- `packages/domain/src/home/cards.test.ts` -- `onDevice` helper `:109`, current-card cases `:308-330`, the 19.2 ordering and `homeList` blocks; add the R-2 rows (the summary entries carry `updated_seq`) and the R-7 pin.
- `apps/web/src/state/sync.tsx:400` -- `states` live query has a default (`NO_STATES`), so it never reads as pending. Follow the `outboxRead` pattern at `:380-383` (`loadedRows`, `outboxRead = db === null || loaded !== undefined`): add an optional `SyncState` field (name it `summaryRead`, doc comment like `outboxRead` at `:156`) and set it in the context value near `:595`; `states` itself keeps `?? NO_STATES`.
- `apps/web/src/surfaces/home/home-surface.tsx:82-86` -- `pageSize` live query (R-11: `.catch(() => DEFAULT_HOME_PAGE_SIZE)`), `relatoriosPending` (R-3: also pending while `sync.summaryRead === false`). The list section `:227-266` gains the hidden status line (R-12; precedent `apps/web/src/surfaces/photos/gallery-surface.tsx:280`, `data-testid="home-list-status"`), placed outside the pending/empty/list conditional so it stays mounted.
- `apps/web/src/surfaces/home/home-surface.test.tsx` -- `describe('Home: the active list and its page (Story 19.2)')` at `:443`, `renderHome`/`syncState` helpers; add R-3 (a sync double with `summaryRead: false`, then true), R-11 (a rejected read, e.g. `vi.spyOn` on the db's `local_prefs.get` for the `home_page_size` key or a module mock of `readHomePageSize`; no current card in that case so `readLastSheet` is not involved), R-12 (the status line's text before and after pressing 50).
- `apps/web/src/components/chip.tsx:87-96` -- `moveTo` (R-5); `selectedId` is in scope. `apps/web/src/components/chip.test.tsx` -- add the R-5 rows; count clicks with a document `click` listener or an `onClick` spy on the chip; the missing-ref row may need a ref that resolves to null (if it cannot be reached without internals, say so in the report and keep the code path).
- `apps/web/src/state/sync.test.tsx` (if a provider test exists there) -- one case: `summaryRead` false before the states query answers, true after. Skip if no provider harness exists; the component test covers the surface.
- `e2e/app-layout.spec.ts:43-44` -- both `.shortcut-card` checks become `toBeInViewport({ ratio: 1 })` (R-8). Seeding more than 10 relatórios is not added (the shortcut row sits above the list since 19.1, so the list length cannot push it down); a narrowing in the PR.
- `e2e/home.spec.ts:205-295` (`@p1 19.2-E2E-001`) -- R-9: after the reload-keeps-50 block and before the 390 px block (or at the end, at 1280 px; implementer's choice that keeps the test linear), block the push (`page.route` on `url.pathname === '/api/sync/ops'` aborting with `'internetdisconnected'`, precedent `e2e/durability.spec.ts:384-387`), create a relatório as a person does (`createProjectFromHome` then `createRelatorio`, `e2e/support/relatorio-flow.ts`), go back to Home with no tile pressed, and assert the list ids are `[emCampo, <new id>, emRevisao, rascunho]`, the first card has class `is-current`, and the new relatório has an outbox row (committed state, E12-A6; `readStore` on `outbox`). Unroute at the end.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- E19-A3 (coordinator part of this batch, written by the orchestrator, not the implementer): a new section "Deferred from: the Epic 19 retrospective (2026-11-03)" with four rows R-4, R-6, R-10, R-13 (`source_spec`, `summary`, `evidence`, `state` with owner), the format of § "Deferred from: Story 19.2 review".
- `docs/kbs/log.md` -- one dated line (orchestrator).

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/home/cards.test.ts` then `cards.ts` -- R-2 rows red, then the current-card pick by its own rule; R-7 pin, then the derived list -- AD-13, pre-19.2 rule
- [x] `apps/web/src/components/chip.test.tsx` then `chip.tsx` -- R-5 rows red, then `moveTo` guard and fallback -- no event when nothing changes
- [x] `apps/web/src/surfaces/home/home-surface.test.tsx` then `apps/web/src/state/sync.tsx` and `home-surface.tsx` -- R-3, R-11, R-12 red, then the flag, the pending gate, the catch and the status line
- [x] `e2e/app-layout.spec.ts` -- R-8 ratio 1
- [x] `e2e/home.spec.ts` -- R-9 extension of 19.2-E2E-001
- [x] `deferred-work.md`, `docs/kbs/log.md` -- E19-A3 rows and the log line (orchestrator)

**Acceptance Criteria:**
- Given every row of the matrix, when the kernel, chip and surface tests run, then each row holds in a test that was seen red before its fix.
- Given a company with Em campo, Em revisão and Rascunho synced and a relatório created on this device with the push blocked, when Home shows with no tile pressed, then the Em campo card is first with `is-current`, the new relatório is second, and its create op waits in the outbox.
- Given Home at 390, 768, 1280 and 1906 px and 900 px high, when it renders, then both shortcut cards are wholly in the viewport (ratio 1).
- Given the story gate, when lint, static, test:unit, test:api and `e2e/home.spec.ts` plus `e2e/app-layout.spec.ts` on `desktop-chrome` and `durability-desktop-chrome` run, then all are green.

## Spec Change Log

## Review Triage Log

### 2026-11-03 — Review pass (Edge Case Hunter and Verification Gap Reviewer; Blind Hunter and Intent Alignment skipped: token economy, the integrated epic review covers them)
- verdicts: 5 findings — high 0, medium 0, low 4, false 0, maybe-false 1
- findings:
  - `[maybe-false]` `[reject]` ECH-1: after `readHomePageSize` rejects inside the live query, the query may not re-run after a later write, so the chips stay at 10 — whether Dexie registers the observed key of a failed `get` was not settled; if true it is low (a device whose `local_prefs` read fails is already broken, the write would most likely fail too, and before this batch Home did not render at all), so rejected with this note.
  - `[low]` `[reject]` ECH-2: with a null chip ref, `onChange` moves the selection but focus and the usage event do not follow — the inline ref callback holds the element of every rendered chip, so the branch is a defensive fallback the retro asked to keep; making it focus or emit adds branches for a state no user meets.
  - `[low]` `[reject]` ECH-3: on a switch to another non-null database, `useLiveQuery` may keep the previous database's states for a frame, so `summaryRead` reads true with stale rows — the same transient holds for `loadedRelatorios` and `outboxRead` (pre-existing pattern); the flag does not widen it, and tagging each result with its db adds surface for a sign-out frame.
  - `[low]` `[reject]` ECH-4: a month-precision `service_start` ('2026-09') loses the current-card pick to any day of that month — the comparison is the pre-19.2 rule and the list sort's, byte for byte; a month-only rule is a product choice outside E19-A2.
  - `[low]` `[reject]` ECH-5 (claim): the matrix row "Missing ref (R-5)" has no test — true; the null ref cannot be reached from the rendered component without reaching into the ref map, as the spec's Code Map allowed; the code path is kept and the gap is listed in the PR as known open.
- Verification Gap Reviewer: no verification gaps found.

## Design Notes

- R-2 is kept apart from the sort on purpose: a sync that moves another relatório's `updated_seq` must never move "Continuar". The rule is the pre-19.2 one because Story 19.2 said "no change to the card itself"; the retrospective's open question (latest start vs. last sheet opened on this device) is Matheus's, so this batch does not decide it.
- R-3's flag sits in the provider, next to `outboxRead`, because the summary Home sorts on is the provider's `company.relatorios`; Home's own `syncStateRows` query answering first would not prove the provider's has.

## Verification

**Commands (tools container, `--user root`, host lock, logs in `.scratch-f19/`; restart the api container after changes under `packages/domain` before `test:api` and the e2e):**
- `podman compose --profile tools run --rm --user root tools pnpm exec vitest run <file>` -- while iterating, the narrowest file
- `podman compose --profile tools run --rm --user root tools pnpm lint` / `static` / `test:unit` / `test:api` -- green
- `podman compose --profile tools run --rm --user root tools pnpm exec tsx scripts/e2e.ts e2e/home.spec.ts e2e/app-layout.spec.ts --project desktop-chrome --project durability-desktop-chrome` -- green

## Auto Run Result

Status: done

**Summary:** E19-A2 whole, red first, and E19-A3's four ledger rows. R-2: `homeCards` picks the current card by its own rule (on-device Em campo, latest `service_start`, a missing date after any date, then the smaller id), apart from the list sort, which is unchanged. R-3: `SyncState.summaryRead` (optional; false until the provider's `sync_state` live query answers) keeps Home's board and list pending. R-5: `FilterChipGroup.moveTo` moves focus always and clicks only when the target differs from `selectedId`, with `onChange` when the ref is null. R-7: `HOME_ACTIVE_STATUSES` derived from `RELATORIO_STATUSES` without `emitido`, pinned by a kernel test. R-8: `app-layout.spec.ts` `toBeInViewport({ ratio: 1 })`. R-9: `19.2-E2E-001` creates a relatório through the dialogs with the push aborted and asserts `[Em campo (is-current), new, Em revisão, Rascunho]` and the create op in the outbox. R-11: the page-size live query falls back to 10 on a rejected read. R-12: an always-mounted visually hidden `role="status"` line (`home-list-status`) carries the kernel's note.

**Files:** `packages/domain/src/home/cards.ts` (+ test), `apps/web/src/components/chip.tsx` (+ test), `apps/web/src/state/sync.tsx` (+ test), `apps/web/src/surfaces/home/home-surface.tsx` (+ test), `e2e/app-layout.spec.ts`, `e2e/home.spec.ts`, `deferred-work.md` (§ Deferred from: the Epic 19 retrospective), `docs/kbs/log.md`.

**Review:** 5 findings (Edge Case Hunter 5, Verification Gap 0): 0 patched, 0 deferred, 5 rejected with reasons in the triage log (4 low, 1 maybe-false that would only be low). `followup_review_recommended: false` (no patch).

**Red-first runs (implementation subagent, `.scratch-f19/*-red.log`):** cards.test.ts 3 R-2 tests red; chip.test.tsx the Home and End rows red; sync.test.tsx the `summaryRead` case red; home-surface.test.tsx the R-3 pending, R-11 fallback and two R-12 tests red; all green after the fixes. Not red by nature: the R-2 not-on-device row, the R-7 pin, the R-3 fresh-device row and the two e2e strengthenings. No test for the R-5 null-ref row (unreachable without internals).

**Verification (host lock, `.scratch-f19/gate*.log`):** run 1 on `7741c3b6`: lock wait 0 s (after a first attempt whose wrapper failed on quoting after a 165 s wait behind batch e18fa's gate), load 4.91 at start, 6.05 at end; lint 0 errors (25 warnings in untouched specs) 15 s, static green 31 s, test:api 97 files 738 tests 295 s, test:unit 336 files 4749 tests 205 s, touched specs 4 of 5 (19.2-E2E-001 red: the Project page had no "Novo relatório a partir de template" step to click, then the reset without the standard template left the Template combobox empty). Two test-only fixes to `e2e/home.spec.ts` (drop the extra click; `resetEmpresaB(account, { standard: true })`, wait for "1 template", `test.setTimeout(120_000)`). Run 3: lint 0 errors 17 s, static green 26 s, `home.spec.ts` + `app-layout.spec.ts` 5 of 5 (24.7 s wall, build included; the durability project holds none of them), load 4.66 at start, 4.53 at end; batch e18fa's stack up beside it.

**Residual risks:** R-1 (the order key) waits for Matheus's E19-A1; the current-card rule here is the conservative pre-19.2 reading and may change with his answer to the retro's open question (latest start or last sheet opened on this device).
