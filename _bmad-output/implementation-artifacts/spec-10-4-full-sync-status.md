---
title: 'Story 10.4: See everything the sync did or is waiting to do'
type: 'feature'
created: '2026-09-29'
status: 'in-progress'
baseline_revision: 'e14229de12beda030e59864fb11144f369fc9878'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: medium
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context.md'
warnings: ['batched', 'oversized']
batched_why: 'Ledger entries 106, 166, 160, 310, 1071 and 1137 routed to 10.4 by PR #63 share the Sync status surface, its counts and the pull summary.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** Sync status (`/sync`) today shows only the headline, "Sincronizar agora", dead ops, the 10.1 merge rows, an aggregate Leituras section and "Último envio". FR-60 / UX-DR13 ask for the full surface: every pending upload, download progress, errors, merges, contradictions and each colleague's last send, so the user can judge on Monday whether work is still on a tablet.

**Approach:** Build the whole `85-sync.html` surface from kernel-derived rows. Every count, row text, plural and progress figure is a new `packages/domain/src/sync/` function; the web reads IndexedDB rows and renders. The pull summary gains optional per-relatório totals (sheets, photos) for the download line. The "Decisões" section renders a list that batch X fills (empty today).

## Boundaries & Constraints

**Always:**
- Epic-10 context "Coordinator decisions" and Conflicts 8-12 are binding: the kernel composes the headline; `role="status"` is dropped from `.sync-headline` (the mock file is NOT edited); the disclosure label is the mock's "Como funciona a mesclagem"; the summary gets optional totals with `CONTRACT_VERSION` = main + 1 (11 today) and `MIN_CONTRACT_VERSION` unchanged; "Último envio de ⟨nome⟩: dd/mm hh:mm" is formatted in the kernel from `last_push_at`, one row per `(user, device)`; badge precedence is conflict > error > offline > pending > ok.
- The surface is not a live region: no `role="status"`, `role="alert"` or `aria-live` anywhere under `main[data-route="/sync"]` (the badge announcer stays the only live region). The Decisões banners render without `role="alert"`.
- Mock class names from `85-sync.html` (lines 30-140); its page-local CSS (lines 6-28) goes into `surfaces/sync/sync.css` with `[data-route='/sync']` scope; the `.frame-phone` rules (23-27) become `@media (max-width: 767.98px)` there (AGENTS.md "Mock container selectors").
- New strings follow AGENTS.md's three homes: derived text in `packages/domain`, static surface copy in `copy/pt-br.ts` (verbatim from 85 or `// authored:`).
- Existing test ids stay (`sync-rejected-row`, `sync-superseded-row`, `sync-merge-row`, `sync-readings`, `sync-readings-queued`, `sync-suggestions-pending`, `sync-unreachable`), and the existing 1.5/6.2/8.x/10.1 e2e stay green.

**Never:**
- No conflict detection, no `cell.conflict`, no kernel list of open contradictions, no Conflict view, no row-to-dialog wiring (batch X owns them). Do not build on X's branch.
- No new server route; no Dexie version bump unless an index is truly required (prefer filtering in memory like `readingCountRows`).
- No change to `syncBadgeState` semantics beyond accepting a `conflicts` count (0 today): uploads of photo bytes do not turn the badge to pending (open question, see Design Notes).
- Do not edit `epics.md`, `sprint-status.yaml` or any mock.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Headline | 3 blocks with unsent ops, 12 photo originals not acked, 2 readings queued, 0 contradictions | `.sh-state` badge word; `.sh-counts` "3 fichas e 12 fotos aguardando · 2 leituras na fila" | Nothing pending: "Nada pendente neste aparelho." |
| Headline with contradictions | `contradictions = 1` (X), rest as above | "1 contradição para resolver · 3 fichas e 12 fotos aguardando · 2 leituras na fila" | -- |
| Enviando, sheets | outbox rows for block B, one `sent` | row "⟨block label⟩", secondary "Alterada por ⟨nome⟩ · dd/mm hh:mm" (latest op), state "Enviando…" when any row of B is `sent`, else "Aguardando envio" | Unknown block/user: TAG or "Ficha", user id fallback like "Último envio" |
| Enviando, photos | original blobs `acked = false` | one row per photo, upload order (`orderUploads`), `UploadPill` state pending; at most 10 rows, then "+ n fotos aguardando envio" | blob with `upload_error`: pill "Erro — Tentar novamente" calls `retryUpload(id)` |
| Leituras | photos with `reading_status` queued/running | one row per photo, `.sr-state` "Leitura na fila"; the pending-suggestions row stays | -- |
| Baixando | `sync_state` of a relatório with `complete = false`, summary `progress {sheets: 30, photos: 20}`, device holds 12 live blocks and 8 live photo files of it | "Baixando… 12 de 30 fichas · 8 de 20 fotos", state "40 %" (kernel: (12 + 8) / (30 + 20), floored) with `.progress-track` | Summary without `progress` (older server): "Baixando…" and no percent |
| Home card | same relatório | card device text "Baixando… 12 de 30 fichas" (ledger 166) | no progress: "Baixando…" as today |
| Último envio | `last_push_at` rows | per row "Último envio de Eduardo: 06/09 18:10" as `.sr-primary`, secondary "Este aparelho"/"Outro aparelho" | none: "Nenhum envio registrado ainda." |
| Merged | 10.1 `SyncState.merges` | "Mesclado automaticamente" sub-list under Decisões: primary `mergeInfoText`, secondary rule words (kernel `mergeRuleText`), `.sr-state` "Mesclado" | survives navigation, cleared by reload |
| Decisões | `SyncState.decisions = []` | section shows only when decisions or merges exist; decisions render as `.banner[data-variant=conflict]` in `.conflict-list`, head badge "n aguardam decisão" | -- |

</intent-contract>

## Code Map

- `apps/web/src/surfaces/sync/sync-status-surface.tsx` (180 lines) -- current surface; rebuild section by section in the 85 order: headline (+ disclosure), `.sync-summary`, "Sincronizar agora" (decision C-4 keeps it at the top), cause line, rejected/superseded rows, Leituras, Enviando, Baixando, Último envio, Decisões (+ Mesclado automaticamente), foot. Split into small components in the same folder if it passes ~300 lines.
- `apps/web/src/surfaces/sync/sync.css` -- page-local CSS; add 85 lines 6-28 translated.
- `apps/web/src/surfaces/sync/sync-status-surface.test.tsx` -- asserts `.sync-headline` at :71,106; extend.
- `apps/web/src/state/sync.tsx` -- `SyncState` (add `uploads`, `downloads`, `pendingSheets`, `readingsQueued` rows, `decisions: readonly SyncDecisionRow[]` defaulting to `[]`, `headline` text), live queries at :198-213, `counts` :211, `badgeState` in the memo. Test doubles elsewhere construct `SyncState`: keep new fields optional or update the doubles (`grep -rn "SyncContext" apps/web/src`).
- `apps/web/src/db/sync-store.ts` -- `outboxRows`, `localUsers`, `mergeTextContext` (reuse its block/equipment/user lookup for sheet row labels); add the queries for pending-sheet context, original blobs not acked (`FileBlobRow` in `db/schema.ts:67-83`, `acked`, `upload_error`), live block/photo counts per relatório for the download line.
- `apps/web/src/db/suggestion-store.ts:198-219` -- `readingCountRows`; add the per-photo queued rows; ledger 1137: count pending caption suggestions (targets on a live photo's caption) in `suggestions`.
- `apps/web/src/components/photo-row.tsx:31-60` -- `UploadPill({state, onRetry, id})` reuse for photo rows.
- `packages/domain/src/sync/counts.ts` -- `syncCounts(outbox, reading, merges, uploads?)`: new optional 4th input `uploads: readonly {id: string; error: boolean}[]`; `photos_pending` = distinct ids of unsent photo creates ∪ uploads without error (unchanged when omitted); new `upload_errors`. `syncBadgeState(counts, deps)` gains `deps.conflicts?: number` returning `'conflict'` first; change its return type to `SyncBadgeState` and update `SyncState.badgeState`'s type and the badge component.
- `packages/domain/src/sync/` (new `status.ts` + test, re-exported from the package index) -- `syncHeadlineText({counts, contradictions})`, `syncSummaryBadges(...)` (the four compact badges, each only when non-zero: "n contradição/contradições", "… aguardando envio", "n erro(s)", "n leituras prontas · n na fila"), `pendingSheetRows(outbox, context)`, `lastSendText(name, at)`, `downloadProgress(totals | undefined, local)` -> `{text, percent | null}`, `morePhotosText(n)`, `decisionsCountText(n)` ("n aguardam decisão"), `mergeRuleText(rule)` ("NC vence C", "preenchido vence vazio", "a edição mais recente prevalece", ...), state words "Enviando…", "Aguardando envio", "Leitura na fila", "Mesclado".
- `packages/domain/src/merge/info.ts:146-231` -- `MergeInfoContext`, `blockName` (reuse for sheet labels), `MERGE_RULES` in `merge/rules.ts`.
- `packages/domain/src/photos/upload-order.ts` -- `orderUploads` for the photo row order.
- `packages/domain/src/contract/sync.ts:49-56` -- `relatorioSummarySchema` (non-strict): add optional `progress: {sheets: int >= 0, photos: int >= 0}`; `contract/version.ts:55` -> 11 with a dated note, MIN stays 10.
- `apps/api/src/sync/pull.ts:102-130` -- `companySummary`: count live `block` rows and live `file` rows with `row.kind = 'photo'` per `relatorio_id` (one grouped query; `entities` has `relatorio_id`, `removed_at`).
- `packages/domain/src/home/cards.ts:88-93,158-165` -- `DEVICE_TEXT.downloading`; the card uses `downloadProgress` short form when the summary has `progress` (needs the local counts in `HomeCardsInput`, optional).
- `packages/domain/src/status/table.ts:40` -- `isAutoPulled`.
- `apps/web/src/sync/engine.ts` / `db/sync-store.ts` `resendDead` -- ledger 160.
- `apps/web/src/surfaces/registries/instrument-panel.tsx` -- ledger 310: `TextField`/`NumberField`/`TestDefaultField` seed `useState(value)` once.
- `packages/domain/src/relatorio/pre-issue.ts:292`, `suggestion-rows.ts:89` -- ledger 1071.
- E2E: badge locator `e2e/support/merged-fixtures.ts:73`; `e2e/sync.spec.ts` (1.5 tests), `e2e/merge.spec.ts` (10.1 two-device pattern), `e2e/support/colleague.ts` (`SeedAccount.colleague`, `colleagueContext(browser, seed)`), `e2e/support/sync.ts` (`syncNow`, `syncNowAndReturn`), `e2e/support/outbox.ts` (`seedOutbox`, `readStore`).

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/sync/status.ts`, `counts.ts`, tests -- the kernel functions above, unit-tested per matrix row (plurals, empty, fallbacks, percent rounding and clamp to 0-100, precedence).
- `packages/domain/src/contract/sync.ts`, `version.ts`, `apps/api/src/sync/pull.ts` + api integration test through the pull route (totals present, removed blocks and non-photo files excluded, cross-tenant: another company's rows never counted).
- `apps/web/src/db/*`, `state/sync.tsx` -- the live rows; `decisions` default `[]` with a comment naming batch X as the owner of its source.
- `apps/web/src/surfaces/sync/*` -- the full surface, `sync.css` translation, "Como funciona a mesclagem" as `details.sync-how > summary.sh-how` + `.how-body` copied verbatim from 85 lines 36-47 into `copy/pt-br.ts`.
- `packages/domain/src/home/cards.ts` + web caller -- ledger 166.
- Ledgers in `deferred-work.md` (strike the old state, add the dated new one): 106 and 166 closed by this story; 1137 fixed (caption suggestions counted); 1071, 160, 310: fix when small (310: re-seed a field from the live row when it is not focused and not dirty; 160: prove with a unit test that "Reenviar" re-queues every dead op of the batch (10.1 made batches atomic), and state what happens to later acked puts); otherwise re-own with the reason.
- E2E (new `e2e/sync-status.spec.ts`; add to `SERIAL_SPECS` only if it times taps or shares the queue): the surface is opened by clicking the badge every time.
  - `@p0` pending uploads: offline edits on two blocks + a captured or imported photo -> headline counts, Enviando sheet rows and photo row; go online, "Sincronizar agora" -> rows gone, and the outbox rows `acked` (committed state).
  - `@p0` merged row pair (10.1 x 10.4): two contexts (user + `colleagueContext`), an NC/C merge as in `merge.spec.ts`; the "Mesclado automaticamente" row shows on the full surface, still shows after navigating to Home and back through the badge; after a reload it is gone.
  - `@p1` Leituras: a photo with a queued reading shows "Leitura na fila".
  - `@p1` download line: hold the relatório stream pull (`page.route`) so the stream stays incomplete; the Baixando row shows "Baixando… n de m fichas · …" and Home shows the counted form; releasing it removes the row.
  - `@p1` errors: a photo upload refused (route the upload to 4xx) -> row with "Erro — Tentar novamente"; tap it with the route released -> the blob row is `acked` and the row gone.
  - `@p1` rejected: extend or reuse 1.5-E2E-002's pattern: "Reenviar" writes the dead rows back to `pending` (assert the outbox).
  - `@p1` Último envio: after both contexts push, the row "Último envio de Eduardo Esteves: dd/mm hh:mm" shows on the first device.
  - `@p1` 390 px: every `.sync-list` has `scrollWidth <= clientWidth`, the page has no horizontal scroll, and the disclosure opens; no element under the surface has `aria-live`, `role=status` or `role=alert`.

**Acceptance Criteria:**
- Given pending work, readings, downloads, errors, dead ops, merges and pushes on the device, when the user opens Sync status from the badge, then the headline reads the badge word plus the kernel counts ("3 fichas e 12 fotos aguardando · 2 leituras na fila"), and each row type of the matrix is listed in its 85 section.
- Given a row with a button ("Tentar novamente", "Reenviar", "Sincronizar agora"), when it is pressed, then the committed IndexedDB state changes (blob `acked`/`upload_error` cleared, outbox rows `pending` then `acked`) and the row disappears after the cycle.
- Given the surface, when inspected, then no descendant is a live region and the explanations sit behind the collapsed "Como funciona a mesclagem".
- Given a 390 px viewport, when the surface shows every section, then no list overflows horizontally.
- Given an older server summary without `progress`, when the device parses it, then the download row reads "Baixando…" (non-strict field, no MIN bump).

## Spec Change Log

## Review Triage Log

## Design Notes

Open questions (conservative reading taken, list in the PR): (1) photo bytes waiting do not turn the badge to pending (it counts ops only), so the headline may read "Sincronizado · 2 fotos aguardando"; (2) the "Último envio" row shows the kernel sentence instead of the mock's name + time columns (story wins); (3) the Enviando `.progress-counter` "12 de 31 fotos enviadas" and the per-sheet `.progress-track` are omitted: the device has no per-op progress; (4) error rows cover photo upload errors only; a failed cycle keeps its cause line (`sync-unreachable`); (5) photo rows show caption (or the photo's label via existing kernel text) and time, not the provisional number (numbering needs relatório context) unless an existing kernel helper gives it cheaply.

X/S seam: `SyncState.decisions: readonly {key: string; kind: 'cell' | 'removal' | 'duplicate_tag'; text: string}[]` plus `contradictions` in `syncHeadlineText`/`syncBadgeState` are the only contract; X fills them and wires the buttons. Whichever merges second resolves.

## Verification

**Commands** (inside the worktree, compose project `fasor-e10s`):
- `docker compose --profile tools run --rm tools pnpm test:unit -- packages/domain/src/sync apps/web/src/surfaces/sync` -- green
- `docker compose --profile tools run --rm tools pnpm test:api` -- green
- `docker compose --profile tools run --rm tools pnpm test:e2e -- e2e/sync-status.spec.ts e2e/sync.spec.ts e2e/merge.spec.ts` -- green (targeted; the full gate is run by the orchestrator)
