---
title: 'Stories 10.2 + 10.3: Contradictions and structure conflicts'
type: 'feature'
created: '2026-09-29'
status: 'done'
baseline_revision: 'e14229de12beda030e59864fb11144f369fc9878'
review_loop_iteration: 0
followup_review_recommended: true
dev_model: opus
dev_effort: high
warnings: ['batched', 'multiple-goals', 'oversized']
batched_why: 'Both stories share the fold''s conflict marks (cell and block), the conflict Banner kind and slot, the badge conflict state and the Conflict view dialog; built apart they would each invent half of that seam.'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-10-1-merge-by-rule.md'
---

<intent-contract>

## Intent

**Problem:** Since Story 10.1 two devices writing one sheet merge by rule, but a true contradiction (two different filled values in one cell) silently keeps the `seq`-later value, a block removed on one device and edited on the other silently stays removed, and one TAG created on two devices only shows as a pre-issue row. Nobody is asked.

**Approach:** The kernel fold marks the contradiction on the cell (`cell.conflict`) and the structure conflict on the block row (`block.removal_conflict`), identically on device and server. A kernel function lists every open decision of a relatório (cell contradictions, removal conflicts, duplicate TAGs created on two devices). The web publishes the conflict Banner on the sheet and the Sumário, turns the badge to "Conflito", lists the decisions in a minimal "Decisões" section of Sync status, and resolves them with plain client ops through one Conflict view dialog (mock 86) or in place.

## Boundaries & Constraints

**Always:**
- Binding: `epic-10-context.md` Conflicts 4-7 and 12 and its "Coordinator decisions", read with the refinements below (each refinement is the conservative reading; list it in the PR as a reading taken).
- **Cell contradiction (10.2).** `mergePolicy`'s `{kind: 'contradiction'}` branch (`packages/domain/src/merge/policy.ts`) is the only entry. `mergeCell` then writes the op's own cell (the `seq`-later value stands and is displayed, as today) plus `conflict: {op_id, value, source_suggestion_id}` = the displaced side (the current cell before the op). Refinement of Conflict 4: the fold has no author or time for the displaced cell, so the record holds only op ids and values; author, device and `client_ts` of both sides are looked up from the op log (`remote_ops` + outbox on the device) by the kernel listing function's caller.
  - A sequential put (`prev_op_id` = head, see the standing stamp below) writes a plain cell: it clears `conflict`. That is how "Aplicar" resolves.
  - A later concurrent rule merge that keeps the standing cell (`kind: 'keep'`) keeps its `conflict`; an `apply` drops it. A second concurrent contradiction replaces the record with the cell it displaced (three writers: the oldest side drops out; known limit).
- **Standing stamp (closes ledger "merge fold's known limits", first two parts).** A device-written `sheet/*` put carries `meta.standing_op_id` = the `op_id` of the cell as the device's materialized row holds it at commit (null when the slot is empty), stamped in `apps/web/src/db/commit.ts` next to `prev_op_id` (commits and undo inverses alike; a caller-set value wins). `isConcurrent` becomes: `(prev_op_id ?? null) !== head` OR (`meta.standing_op_id` is present (not undefined) AND `(standing ?? null) !== cell.op_id`). An op without the key (fixtures, server ops) folds as in 10.1. This makes the losing device's write-before-pull and the undo of a merged-away put concurrent (rules apply), while a deliberate write after a pull stays sequential. The third part (C device's observation before its C result) is re-owned, not solved.
- **Block removal conflict (10.3).** Refinement of Conflict 5 (a sheet op's `prev_op_id` names a cell path, so it cannot tell whether the removal was seen):
  - A block `removed_at` write (a `remove` op, or a put) from a device carries `meta.seen_modified_at` = the block row's `last_modified_at` as the device held it (null when never edited), stamped in `commit.ts` for `block/{id}/removed_at` ops.
  - Fold, removal lands on a live block: when `meta.seen_modified_at` is present and differs from the row's `last_modified_at`, the removal applies (the row is tombstoned, as today) and the row gets `removal_conflict: {removed_by, removed_at, edited_by, edited_at}` (removal: the op's `actor_id`/`client_ts`; edit: the row's `last_modified_by`/`last_modified_at`).
  - Fold, an edit lands on a tombstone: an op that `attributed()` the block (sheet puts, `not_tested`, a photo carrying the `block_id`) from a non-server device, on a row with `removed_at !== null`, applies (the edit is kept on the tombstone, as today) and sets `removal_conflict` with `removed_by` = the row's `removed_by`, `removed_at` = the row's `removed_at`, `edited_by`/`edited_at` = the op's.
  - The block row gains optional `removed_by` (actor of the latest `removed_at` write; dropped when `removed_at` is put null) so the second case has the remover's name.
  - Any sequential `removed_at` write clears `removal_conflict`: "Manter" = the existing `restoreSheetOps` batch (`removed_at` null, plus the freed equipment); "Remover" = `removeSheetOps` with the stamp of the current row (so it is sequential). The tombstoned state is what shows while in conflict (the block is not in the tree).
- **Duplicate TAG across devices (10.3, Conflict 6).** `integrityFindings(...).duplicate_tag` stays the detector. A finding is a decision only when the equipment creates of its ids carry at least two distinct `device_id`s (the create ops looked up by the caller). "Later" = the higher create `seq`; a create not yet pushed (no `seq`) is later. "Manter as duas" = one `equipment/{id}/tag` put on the later one with the next free suffix by `suggestTag`'s rule (`-2`, then `-3`). "Renomear uma" opens the existing "Renomear TAG ⟨TAG⟩" dialog (`apps/web/src/surfaces/relatorio/tag-dialogs.tsx`) on the later one. The pre-issue row keeps its text.
- **Block added elsewhere (10.3).** A pulled `block/{id}` create from another device, in a stream past its first download (10.1's first-download rule), becomes one session info entry: add `'block_added'` to `MERGE_RULES` (not to `CELL_MERGE_RULES`), `MergeInfo.over_op_id` becomes `string | null` (null here), and `mergeInfoText` words it `Eduardo adicionou SEC-C09 em Coluna 9` (the TAG and the location as the tree names them). It flows through the existing `SyncState.merges`, `syncCounts(...).merged` and the Sync status merge rows. Kernel `pulledAdditions(previous, pulled, ownDeviceId)` beside `pulledMergePairs`.
- **One kernel listing (the X/S seam).** `packages/domain/src/merge/conflicts.ts` exports `openDecisions(input): Decision[]` for one relatório, `Decision` = `{kind: 'cell', block_id, cells: CellConflict[]} | {kind: 'block_removal', block_id, ...} | {kind: 'duplicate_tag', tag, earlier_equipment_id, later_equipment_id, ...}`, in tree order (cells, then removals, then TAGs), plus `decisionText(decision, context)`, `decisionCount(decisions)` (cells count one per cell), the Conflict view texts, and the toast texts. Input: the relatório's blocks (tombstones included), project equipment, users, the viewer's `actor_id` and `device_id`, and an op lookup `(op_id) => {actor_id, device_id, client_ts, seq?} | undefined` plus `createOpOf(entityKey)`. Every text, count and plural is kernel (AD-1); the web only renders.
- **Badge (Conflict 12).** `syncCounts(outbox, reading, merges, decisions = 0)` adds `conflicts`; `syncBadgeState` returns `'conflict'` first when `counts.conflicts > 0` (conflict > error > offline > pending > ok); its return type includes `'conflict'`. `apps/web/src/state/sync.tsx` computes the device-wide decision count from IndexedDB (a live query over blocks with a `conflict` cell or a `removal_conflict`, and duplicate-TAG decisions per held relatório).
- **Banners (priority `conflict` first, `role="alert"`, `data-variant="conflict"`, one slot per surface through `useExtraBanner`).**
  - Sheet (`ficha-surface.tsx`): when the open block has cell conflicts, `SEC-C12: 1 célula em contradição` with the action "Ver" (opens the Conflict view for that block). The AC's "— Ver" is text + one action button.
  - Sumário (`sumario-surface.tsx`): the first removal or duplicate-TAG decision of the relatório: `SEC-C12: removido por Eduardo, alterado por você` with actions "Ver" (Conflict view, two block cards), "Manter", "Remover" (`data-tone="red"`); `SEC-C09 foi criada em dois aparelhos` with "Renomear uma", "Manter as duas". When the relatório holds cell conflicts only, the Sumário shows `SEC-C12: 1 célula em contradição` with "Ver". Several decisions: the first by `openDecisions` order; the rest are listed in Sync status.
  - The surface's existing extra banner (if any) is ranked with `pickBanner`; conflict wins.
- **Conflict view** (`apps/web/src/surfaces/sync/conflict-dialog.tsx`, CSS in `surfaces/sync/sync.css` translated from `prototype/screens/86-sync-conflito.html` lines 7-38 per AGENTS.md "Mock container selectors": the `[data-route="/sync/conflito"]` prefix becomes the dialog's own class, `.frame-phone X` a `@media (max-width: 767.98px)` rule). React Aria `ModalOverlay` + `Modal` + `Dialog` (`aria-modal`, labelled by `.dialog-title`, described by `.cv-desc`). Layout: `.conflict-page` > `.conflict-head` (title `⟨TAG⟩ · ⟨tipo⟩ · ⟨local⟩`, `.cv-desc` "O resto da ficha já foi mesclado por sub-bloco. Escolha só na célula em contradição; nada mais muda.", icon close `aria-label="Voltar sem decidir"`) > `.conflict-scroll` > `.conflict-view` > one `.cv-cell` per contradicting cell (`.cc-label` `⟨n⟩ célula(s) em contradição · ⟨seção⟩`, `.cc-name` the cell's label as the sheet names it, `.cv-pick[role=radiogroup]` with `aria-label` `⟨cell⟩: qual valor fica`, two `.cv-option[role=radio]` rows, min-height 56 px, each `.radio`, a 48 px `.crop-thumb` (existing `components/crop-thumb.tsx`) when the side's `source_suggestion_id` resolves to a suggestion with a photo and bbox, `.cvo-text` > `.cvo-who` (avatar initial + "A minha" when the side's actor is the viewer, else "A de ⟨primeiro nome⟩"), `.cvo-value` (the value as the sheet displays it), `.cvo-meta` (`Ler visor` or `Digitado` · `dd/mm hh:mm` · `este aparelho` when the side's device is this one)). No preselection; `.sticky-action-bar` with `.btn-reason` "Só a célula escolhida é gravada; o resto da ficha já está mesclado. Voltar sem resolver mantém a contradição listada." and "Aplicar" (disabled until every cell has a pick). No merged list (Conflict 7). Esc, the close button and browser back close without writing.
  - "Aplicar": one `commitBatch` with one put per cell, the picked value, `meta.source_suggestion_id` of the picked side when it has one, `prev_op_id`/`standing_op_id` stamped by `commit.ts` (so sequential). Toast "Contradição resolvida — ficha mesclada" with "Desfazer" (existing `undoBatch`).
  - Removal variant (same shell, title as above): `.conflict-view` > `.conflict-columns` > two `.conflict-column` (`.conflict-column-title` `Removido por ⟨nome|você⟩ · dd/mm hh:mm` / `Alterado por ⟨nome|você⟩ · dd/mm hh:mm`, then `.conflict-cell` lines: TAG, location, and the sheet's existing kernel progress/status text). Foot: "Manter", "Remover" (red). If `key-sync-status.html` has no phone rule for `.conflict-columns`, keep `components.css` as is and assert the fit.
  - Toasts (kernel texts, from `85-sync.html` lines 119-124, names from users): `DJ-C09 mantido na Coluna 9 com as alterações de Eduardo`, `DJ-C09 removido — a edição de Eduardo fica recuperável`, `A ficha de Eduardo passou a SEC-C09-2`, each with "Desfazer".
- **Sync status "Decisões" (minimal, X's side of the seam).** In `sync-status-surface.tsx`, a `section` "Decisões" (`section-head` h2 + `.conflict-list`) rendering `openDecisions` for every held relatório as `.banner[data-variant=conflict]` WITHOUT `role="alert"` (the surface is not live, Conflict 8): cell rows with "Resolver" (opens the Conflict view, mock 85 line 116), removal rows with "Manter"/"Remover", TAG rows with "Renomear uma" (navigates to that relatório's Sumário and opens the rename dialog on the later equipment) / "Manter as duas". Rendered only when the list is non-empty. S (Story 10.4) builds the full surface in parallel; the second to merge reconciles.
- Contract: one bump for the batch, `CONTRACT_VERSION` and `MIN_CONTRACT_VERSION` to main + 1 (11 today), dated note naming `cell.conflict`, `block.removal_conflict`/`removed_by`, the two meta stamps and `block_added`.
- Tests: api integration tests through the sync route; Playwright with two browser contexts (`colleagueContext(browser, seed)`, `SeedAccount.colleague`, `e2e/support/colleague.ts`), "Sincronizar agora"; every `@p0` asserts the committed cell/block state in IndexedDB on both devices and the server row.

**Never:**
- No server-emitted ops, no new Dexie store, no new entity. No conflict as a pre-issue row (open question). No change to `client_ts` semantics. No PARALLEL_WORKERS change. No host pnpm/node. No build on batch S's branch. Do not remove `supersededCount`/`supersededText`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output |
|---|---|---|
| Two readings | A types 3300 in a test cell (prev X), E types 330 (prev X); E pushes first | Server and both devices: the later push's value (3300) stands, `conflict` = the other side (330); badge Conflito; sheet Banner |
| C vs NA | Checklist result C vs NA | Same: contradiction |
| NC vs C on the same sheet | plus a two-readings contradiction | NC merges (10.1 entry listed); only the reading cell is in the view; "Aplicar" leaves the NC merge intact |
| Aplicar | Pick the displaced side | One put, sequential; `conflict` gone on server and both devices after sync; value = pick |
| Esc/back | Dialog open | Closes; no outbox row; conflict remains |
| Loser writes before pull (ledger) | C device re-taps after its C was merged away, not pulled | Concurrent (standing mismatch): NC stays, entry listed |
| Removed vs edited | E removes block (seen t0); A edits a cell of it; either push order | Row removed, edit kept, `removal_conflict` set on server and both devices; Sumário Banner |
| Manter / Remover | From the Banner | Manter: block live again (equipment restored), conflict gone; Remover: stays removed, conflict gone |
| Same TAG, two devices | Both create SEC-C09 | Sumário Banner + Decisões row; Manter as duas: later becomes SEC-C09-2; Renomear uma: rename dialog on the later |
| Same TAG, one device | Not reachable (refused inline) | Pre-issue row only, no decision |
| Block added elsewhere | E adds TP-C09 in Coluna 9 | A's tree shows it; Sync status row `Eduardo adicionou TP-C09 em Coluna 9`; no decision |
| Replay | Any of the above | Device `materializeEntity` row deep-equals the server row; Porto Seguro golden unchanged |

</intent-contract>

## Code Map

- `packages/domain/src/merge/policy.ts` -- `isConcurrent`, `mergePolicy` contradiction branch, `mergeCell` (write `conflict`); `rules.ts` (`block_added`); `info.ts` (`over_op_id` nullable, `pulledAdditions`, text); new `conflicts.ts` (+ tests); `index.ts` re-exports.
- `packages/domain/src/schemas/entities.ts:30-60` -- `cellSchema` optional `conflict`; block row optional `removed_by`, `removal_conflict`.
- `packages/domain/src/ops/op.ts:24` -- `opMetaSchema` optional `standing_op_id` (uuid, nullable), `seen_modified_at` (iso, nullable).
- `packages/domain/src/ops/apply.ts` -- `cellOf`, `attributed` (edit on tombstone), `writeRow` `block/field` `removed_at` branch and remove kind (:303), `applyOp`'s carried-block branch (photo on a tombstone).
- `packages/domain/src/sync/counts.ts:61,115` -- `conflicts` count, badge state.
- `packages/domain/src/relatorio/integrity.ts:83`, `relatorio/tag.ts:79` (`suggestTag`), `contract/version.ts`.
- `apps/api/src/sync/apply.ts` -- no merge code expected (the fold is `applyOp`); confirm meta is stored and passed through.
- `apps/web/src/db/commit.ts:123-170` -- stamp `standing_op_id` and `seen_modified_at`; `undoBatch` inverses too.
- `apps/web/src/sync/engine.ts` -- additions into session entries.
- `apps/web/src/state/sync.tsx` -- decision count, badge.
- `apps/web/src/surfaces/sync/` -- `conflict-dialog.tsx` (new), `sync-status-surface.tsx` (Decisões), `sync.css`.
- `apps/web/src/surfaces/ficha/ficha-surface.tsx:140`, `surfaces/relatorio/sumario-surface.tsx:152`, `state/extra-banner.tsx`, `state/banner-slot.tsx` -- banners.
- `apps/web/src/surfaces/relatorio/tree-actions.ts:490-530` (`removeSheetOps`, `restoreSheetOps`), `tag-dialogs.tsx` (rename), `relatorio-ops.ts:38`.
- `apps/web/src/copy/pt-br.ts` -- static copy (dialog desc, btn-reason, button words, "Decisões").
- Tests: `packages/domain/src/merge/*.test.ts`, `ops/apply.test.ts`, `sync/counts.test.ts`; `apps/api/src/sync/merge.integration.test.ts` (10.1 pattern), `replay.integration.test.ts`; `apps/web/src/sync/engine.test.ts`; `e2e/merge.spec.ts` (pattern), new `e2e/conflicts.spec.ts`.
- Ledger: `deferred-work.md` ~1164 ("merge fold's known limits", owner batch X).

## Tasks & Acceptance

**Execution:**
- [ ] Kernel: schemas, meta, `isConcurrent` two-id check, `mergeCell` conflict, fold marks for removal, `block_added`, `openDecisions` + texts, counts/badge, contract 11/11 -- unit tests for every matrix row, including commutativity (both push orders give equal rows) and the standing-stamp cases.
- [ ] Api: `apps/api/src/sync/conflicts.integration.test.ts` through the sync route: cell contradiction mark + "Aplicar" put clears it (and no `superseded`); removal-vs-edit mark in both push orders + "Manter" and "Remover" writes; duplicate TAG create from two devices + "Manter as duas" put; replay byte-equal with a contradiction and a removal conflict in the log; the ledger case (loser re-tap before pull keeps NC).
- [ ] Web: commit stamps, engine additions, state counts/badge, banners, Conflict view, Decisões section, toasts with Desfazer.
- [ ] E2E `e2e/conflicts.spec.ts` (two contexts, Ana + colleague Eduardo): `@p0` two-readings contradiction on a sheet that also holds an NC/C merge: Banner text and role alert, badge Conflito, the view lists one cell only (two radios), Esc writes nothing, pick + "Aplicar" -> IndexedDB cell on both devices and the server row equal the pick with no `conflict`, the NC merge intact; `@p0` removed-vs-edited: Sumário Banner, "Ver" shows two `.conflict-column`, "Remover" and (second test) "Manter" -> block row on both devices and server; `@p0` duplicate TAG: Banner text, "Manter as duas" -> later equipment `SEC-C09-2` on both devices and server; `@p0` Sync status Decisões row "Resolver" opens the dialog and the row disappears after "Aplicar"; `@p1` sheet contradiction + removal conflict at once (badge Conflito, each resolves alone); `@p1` block added elsewhere -> tree + info row; `@p1` 390 px: `.cv-pick` single column, each `.cv-option` inside `.conflict-scroll` with `scrollWidth <= clientWidth` for `.conflict-scroll`, `.cv-pick`, `.conflict-columns`, and the page. Add to `SERIAL_SPECS` only if it times taps or shares the queue.
- [ ] Mutation runs (report in the PR): make the contradiction branch write no `conflict` -> the api and `@p0` cell tests go red; drop the removal-conflict mark -> the removal tests go red; drop the standing check -> the ledger test goes red. Restore each.
- [ ] Ledger: close the first two parts of ~1164 with the test names; re-own the observation-before-result part (owner Epic 11 or Matheus, reason: needs an item-level merge record). Strike the old state, add the dated new one.

**Acceptance Criteria:**
- Given two different filled values on one cell from two devices, when the pull applies them, then the cell carries `conflict` on the server and both devices, the sheet Banner (`data-variant="conflict"`, `role="alert"`) reads `SEC-C12: 1 célula em contradição` with "Ver", and the badge reads Conflito.
- Given that Banner, when "Ver" is pressed, then a modal dialog lists only the contradicting cells, each one radiogroup with two 56 px option rows (value, author, time, and a 48 px crop when the value came from a reading); Esc or "Voltar sem decidir" closes it and writes nothing.
- Given a pick on every cell, when "Aplicar" is pressed, then one batch of puts is committed, and after both devices sync the cell holds the pick with no `conflict` on the server and both devices, and an NC/C merge on the same sheet is unchanged.
- Given a block removed on one device and edited on the other, when both push and pull in either order, then the row is removed with its edit kept and carries `removal_conflict` everywhere, the Sumário Banner reads `SEC-C12: removido por Eduardo, alterado por você` with "Manter"/"Remover", and "Ver" shows one block card per side; "Manter" restores it and "Remover" keeps it removed, each clearing the conflict everywhere.
- Given the same TAG created on two devices, when `integrity` reports it after the pull, then the row reads `SEC-C09 foi criada em dois aparelhos` with "Renomear uma" / "Manter as duas", and "Manter as duas" renames the later one `SEC-C09-2` everywhere; a block added elsewhere appears in the tree and is listed as `Eduardo adicionou ⟨TAG⟩ em ⟨local⟩` only.
- Given a Sync status Decisões row, when it is used, then it opens the Conflict view (cell) or resolves in place (structure, TAG) and disappears once resolved.
- Given any conflict in an op log, when the api replays it, then device and server rows are byte-equal and the Porto Seguro golden is unchanged.

## Design Notes

Why the displayed value is the `seq`-later one: it keeps the fold commutative with 10.1 (the row after both ops is the same in either arrival order on the device, because the device folds pulled ops in `seq` order before its own pending ones) and needs no tie rule.

Why meta stamps and not new path semantics: `prev_op_id` stays "last op on this path" (AD-3, AD-24 `superseded`); the two stamps add what the device saw of the standing value and of the block, which `prev_op_id` cannot say. An op without them folds exactly as in 10.1, so the fixtures' op logs and golden stay as they are.

Open questions (list in the PR, do not decide): a contradiction as a pre-issue row; "— Manter / Remover" rendered with an extra "Ver" action on the Sumário Banner; "Renomear uma" opens the Sumário rename dialog instead of the sheet (mock 85 toast says "abrindo a mais recente" on the sheet); three writers on one cell keep only the last two sides; the Sumário shows one decision at a time.

## Verification

**Commands** (inside the worktree, compose project `fasor-e10x`):
- `docker compose --profile tools run --rm tools pnpm test:unit -- packages/domain/src/merge` -- green
- `docker compose --profile tools run --rm tools pnpm test:api` -- green
- `docker compose --profile tools run --rm tools pnpm test:e2e -- --grep conflicts` then `merge` -- green

## Spec Change Log


## Review Triage Log

### 2026-09-29 — Review pass
- verdicts: 16 findings — high 0, medium 4, low 9, false 1, maybe-false 2
- layers run: Edge Case Hunter, Verification Gap Reviewer (Blind Hunter and Intent Alignment skipped: token economy; the integrated epic review covers them)
- findings:
  - `[medium]` `[patch]` VG: nothing pins that a coalesced outbox row keeps the first op's stamps — test added (two stamped puts on a filled cell keep the first `standing_op_id`/`seen_conflict_op_id`).
  - `[medium]` `[patch]` VG: the Sumário rename save path and the Sync status "Renomear uma" navigation are never exercised — e2e extended: from the Decisões row, rename the later equipment, assert both devices and the server, the Banner and row gone.
  - `[low]` `[patch]` VG: the `block_added` row's location is covered only by a @p1 e2e — unit test of `mergeTextContext` returning the location.
  - `[low]` `[reject]` VG other: a failed commit after `build()` is silent — commit failures are rare and a notice needs new error copy; the existing actions share the pattern.
  - `[low]` `[reject]` VG other: the Home card badge never reads Conflito — the spec asks only for the device-wide badge; the card's counts carry no decisions by design.
  - `[medium]` `[patch]` ECH: the displayed side's device rewriting its cell before a pull silently drops `conflict` — new commit stamp `meta.seen_conflict_op_id`; a sequential put keeps the conflict when the stamp differs from the record (unit + api test).
  - `[medium]` `[patch]` ECH: a removed block still holding a cell conflict yields a cell decision whose "Aplicar" lands on the tombstone and marks a spurious removal conflict — cell decisions listed for live blocks only.
  - `[low]` `[reject]` ECH: any later device edit on an already-removed block marks a removal conflict even when the device saw the removal — with the previous patch no app path edits a removed block; a guard needs a third stamp.
  - `[low]` `[patch]` ECH: a duplicate-TAG decision counted and listed once per held relatório of the project — deduped by (project, earlier, later) for the count and the rows.
  - `[low]` `[reject]` ECH: three equipment sharing a TAG with first and last created on one device — three-way duplicates across devices are rare; the fix adds a selection rule the spec does not define.
  - `[low]` `[patch]` ECH: "Manter as duas" tapped twice renames again to -3 — returns null once the later TAG no longer matches.
  - `[maybe-false]` `[reject]` ECH: "Aplicar" after the sides changed while the dialog was open — the pick carries the value the user saw, so the write is what they chose; the case needs a pull during an open dialog; would be low.
  - `[maybe-false]` `[reject]` ECH: radio stays checked on a side whose value changed — same root as the previous row; would be low.
  - `[low]` `[reject]` ECH: `commitBatch` throwing after `build()` is silent — same as the VG other row.
  - `[low]` `[reject]` ECH: the Sumário rename refusal (TAG taken meanwhile) is not shown — the dialog refuses inline before saving; only a pull between typing and saving reaches it.
  - `[false]` `[reject]` ECH: coalescing keeps the first stamps so a deliberate overwrite becomes a false contradiction — the merged op carries the run's first `prev_op_id` and the first stamps consistently (what the device saw before the run), which is the coalescing contract; an overwrite after a pull folds as the run's first op would have.

## Auto Run Result

- Summary: the kernel fold marks a true cell contradiction (`cell.conflict`, the displaced side; the `seq`-later value shows) and a block removed on one device and edited on the other (`block.removal_conflict`, `removed_by`), identically on device and server; three commit stamps (`meta.standing_op_id`, `meta.seen_conflict_op_id`, `meta.seen_modified_at`) tell what the device saw. `merge/conflicts.ts` lists every open decision (`openDecisions`, cell / block_removal / duplicate_tag) with its texts and counts; the badge reads Conflito first; conflict Banners on the sheet and the Sumário; a React Aria Conflict view (mock 86 `.cv-*`, "Aplicar"; removal variant with two `.conflict-column`); a minimal "Decisões" section in Sync status; `block_added` info rows. Contract 11/11. Ledger "merge fold's known limits": two parts closed, the third re-owned.
- Files: kernel `merge/{policy,stamp,conflicts,info,rules}.ts`, `ops/{apply,op,outbox}.ts`, `schemas/entities.ts`, `sync/counts.ts`, `contract/version.ts`; web `db/{commit,sync-store,decision-store}.ts`, `sync/engine.ts`, `state/sync.tsx`, `surfaces/sync/{conflict-dialog,conflict-banner,decision-actions,sync-status-surface}`, `sync.css`, `ficha-surface.tsx`, `sumario-surface.tsx`, `components/crop-thumb.tsx`, `copy/pt-br.ts`; tests `merge/conflicts.test.ts`, `apps/api/src/sync/conflicts.integration.test.ts`, `e2e/conflicts.spec.ts`.
- Review: 16 findings; 7 patched (4 medium, 3 low), 0 deferred, 8 rejected (reasons in the triage log), 1 false.
- Follow-up review recommended: true. Four medium entries were patched in one pass; the unverified risk is the interplay of the three commit stamps with outbox coalescing and undo inverses beyond the tested cases (the integrated epic review covers it).
- Verification: targeted unit and api suites green (after patches: 109 targeted unit tests, conflicts api 8/8, `conflicts.spec` 8/8, `merge.spec` 4/4); mutation runs: contradiction without `conflict` (2 api + 2 @p0 red), removal mark dropped (3 api + 2 @p0 red), standing check dropped (api ledger test + 2 unit red), each restored. Full `pnpm verify` and `test:e2e:full` run by the orchestrator before the PR.
- Residual risks: the decisions live query reads every block and equipment row on each database change; the X/S seam in Sync status (Story 10.4) is reconciled by the second merger.
