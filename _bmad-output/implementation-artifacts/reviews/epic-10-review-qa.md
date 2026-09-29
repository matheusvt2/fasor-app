# Epic 10 integrated review and human-style QA

Date: 2026-09-29. Reviewer: integrated code review and QA agent (tag `e10q`, port base 45), branch `qa/epic-10-review` on `origin/main` dbba10b.
Scope: PRs #63 (carry-over), #64 (Story 10.1), #65 (Story 10.4) and #66 (Stories 10.2 + 10.3), that is `git diff 256f358..origin/main` (107 files, +10644/-1802).

## 1. Gates

`pnpm verify` and `test:e2e:full` were not re-run: main's code equals PR #66's head 865be3b, where both were green (verify 1777 s; e2e:full 2373 s, 282 passed, 0 failed).

| Gate | Where | Lock wait | Time | Result |
|---|---|---|---|---|
| `pnpm test:e2e:matrix` (first run on this epic) | dbba10b, tools container, `flock /tmp/fasor-verify.lock` | 0 s | 521 s gate (518.7 s e2e, build included) | **RED (EXIT 1)**: 66 tests, 57 passed, 1 failed, 8 skipped, 0 flaky. Parallel group 33 tests (26 passed, 7 skipped) in 112 s. Serial group 33 tests (31 passed, 1 failed, 1 skipped) in 403 s. |
| Targeted re-run of the failure, `--repeat-each=3`, all three durability projects | same | 0 s | 110 s | desktop-chrome 3/3 passed, android-chrome 3/3 passed, **webkit 0/3** |
| Instrumented re-run (webkit, once, outbox dumped; the spec edit was reverted) | same | 0 s | about 100 s | failed. Root cause in E10-Q1. |

The failing test is `e2e/ficha.durability.spec.ts:124` `@p1 E5-A2-E2E-002` (phone 390: the M · G · T chips). The first matrix run failed it on durability-desktop-chrome, while this QA's browser session was running on the same machine. The re-runs had no other load, and there it failed on WebKit every time. The Epic 9 QA matrix was green (58 passed, 0 failed). This is a regression, or a race the epic made visible. It was not bisected: a checkout of the pre-epic sources in this worktree was refused by the permission guard.

## 2. Findings

### E10-Q1 (medium): a reading committed twice (chip tap, then Enter), so the matrix is red

- Where: `apps/web/src/surfaces/ficha/measurement-field.tsx` (the Enter path after a unit chip), `apps/web/src/db/commit.ts:78-92` (a coalesce needs `batch_id == null`, and every `commit` mints one), `e2e/ficha.durability.spec.ts:147`.
- Reproduction: `docker compose --profile tools run --rm tools pnpm exec tsx scripts/e2e.ts --project durability-webkit --grep "E5-A2-E2E-002"`. The outbox holds two pending puts of `{raw:'2', unit:'MΩ'}` on `isolacao/cell/0/0`, 153 ms apart, each in its own batch. The second has `prev_op_id` = the first, with `meta.standing_op_id` = the first. The test expects one.
- Effect: a duplicate op with the same value. It is harmless to the data, but it adds an extra outbox row and push, and a second undo step that does nothing. `test:e2e:matrix` stays red.
- Suspected cause: after the chip's immediate commit, the field's "already committed" check does not see the store echo before Enter arrives. The ficha now also renders `useConflictBanner` (a live query per sheet, PR #66), which lengthens that echo on WebKit. This is unconfirmed.
- Proposed fix: in the measurement field's Enter/confirm path, skip the commit when the parsed value equals the last value this field sent. `useTypedText` already keeps a `sent` list for its own echo, so do the same for measurements. Add a unit test for chip-then-Enter, and re-run `test:e2e:matrix`.

### E10-Q2 (medium): undoing "Aplicar" or "Manter" drops the decision, and the other side is lost with no prompt

- Where: `packages/domain/src/ops/outbox.ts` `invertBatch` (inverses carry `meta: null`), `apps/web/src/db/commit.ts:70` (`stampSeen` stamps from the rows as they stand after the resolution), `packages/domain/src/merge/policy.ts:139-143`, `packages/domain/src/ops/apply.ts` `writeRemovedAt`.
- Reproduction, in the browser with two contexts (Ana, Eduardo; worker pair 2):
  1. Cell contradiction T1 (3.300 vs 330 GΩ). Ana taps "Ver", picks "A de Eduardo", taps "Aplicar", then "Desfazer" in the toast. The cell reads 3.300 again with no `conflict`, no Banner and no Decisões row. After a sync, Eduardo's 330 is gone from both tablets and no one was asked.
  2. Removal conflict SEC-C11 (removed by Ana, edited by Eduardo). Ana taps "Manter", then "Desfazer". The block is removed again with `removal_conflict` absent, and Eduardo's Decisões list is empty. The dialog promised "a edição fica recuperável", but his edit is now just a tombstone.
- Proposed fix (one of):
  - (a) Make the resolution toasts carry no "Desfazer". Simplest, and in line with "a decision costs one tap".
  - (b) Have `invertBatch` re-create the mark: the inverse of an "Aplicar" put carries `meta.restore_conflict` = the cleared side, and the inverse of "Manter"/"Remover" carries `seen_modified_at: null`, so the fold marks again.
  - (b) is a reducer change and needs a contract bump. Add a `@p0` for undo after each resolution.

### E10-Q3 (low): "N alterações mescladas pelo servidor" counts contradictions as merges

- Where: `apps/web/src/sync/engine.ts:280` (`supersededCount += response.superseded.length`), `apps/web/src/surfaces/sync/sync-status-surface.tsx:91-112`, `packages/domain/src/sync/counts.ts:195`.
- Reproduction: two readings contradict on T3 and T5, with no merge at all. After the sync Ana's Sync status reads "2 alterações mescladas pelo servidor" next to "2 contradições para resolver". In the first scenario it read "3 alterações mescladas" beside 2 "Mesclado automaticamente" rows and 1 contradiction.
- Epic-10 context: the 10.1 x 10.4 pair names "the replacement of `supersededCount`/`supersededText`", but it was kept.
- Proposed fix: drop the superseded row now that `merge_info` rows and Decisões list every pair. Otherwise, count only `superseded` pairs that did not become a contradiction, derived in the kernel.

### E10-Q4 (low): the headline and badge call structure decisions "contradições"

- Where: `packages/domain/src/sync/status.ts:41,60` and `packages/domain/src/sync/counts.ts:152` (`decisionTotal` feeds `contradictions`).
- Reproduction: one removed-versus-edited block plus one duplicate TAG gives the headline "2 contradições para resolver" and the summary badge "2 contradições" (screenshot 03). Right below, the surface itself says "Só contradições reais e dois casos de estrutura pedem decisão".
- Proposed fix: word the total as decisions ("2 decisões pendentes", as the section already says "2 aguardam decisão"), or split it into cells and structure. This is copy for Matheus (open question 3).

### E10-Q5 (low): a sheet row reads "Enviando…" while the device is offline

- Where: `packages/domain/src/sync/status.ts:108-121` reads the persisted outbox `status === 'sent'`, and `apps/web/src/db/sync-store.ts:56` sets `sent`, which stays after an aborted push.
- Reproduction: with the api unreachable, edit a cell. Sync status shows "Sem conexão" and "Não foi possível falar com o servidor", yet the row says "SEC-C12 — Chave seccionadora · Enviando…" (screenshot 05). The photo row beside it correctly says "Aguardando envio".
- Proposed fix: pass the engine's in-flight state (or `reachable`) into `pendingSheetRows`, so that `sent` reads "Enviando…" only while a request is open.

### E10-Q6 (low): a client on contract 11 or older clears a contradiction with a plain edit

- Where: `packages/domain/src/merge/policy.ts:139-143` ("An unstamped op clears it") and `packages/domain/src/contract/version.ts:1-7` (the push route never reads the version).
- Evidence: a throwaway unit test (run in the tools container, then removed) showed it. On a cell with `conflict`, an op with `prev_op_id` = head and `meta: null` returns a cell without `conflict`. The same op stamped by a contract-12 client keeps the mark.
- Effect: an old tablet that pulled before the MIN-12 bump can still push, and its edit silently settles a contradiction it never saw.
- Proposed fix: treat an unstamped `sheet/*` put from a non-server device as not having seen the mark (keep `conflict`), or refuse pushes below MIN at the route. Rare. Record it in the ledger if not fixed.

### E10-Q7 (low): counts derived in `apps/web` (AD-1/AD-13)

- Where: `apps/web/src/surfaces/sync/sync-status-surface.tsx:29-30` falls back to `decisions.length` (rows) where the state uses `decisionTotal` (cells). They differ with two cells in one sheet, but the fallback is only reached when `sync.headline` is absent (tests). Also `sync-sections.tsx:119-129`: `sendingGroupText('sheets', sheets.length)` and `photoTotal = rows.length + more`.
- Proposed fix: have the kernel return the counts with the row lists and remove the fallback.

### Checked with no defect found

- The merge fold is deterministic on device and server. After every scenario, both tablets' IndexedDB block rows matched cell for cell (NC over C kept with the NC observation; `latest_text` on the sheet observations; the T1 contradiction with `conflict`).
- NC/C merges, C/NA and reading pairs contradict. "Aplicar" leaves the NC merge intact.
- Coalescing keeps the first stamps. Outbox coalescing plus stamps: every `commit` carries a `batch_id`, so ordinary edits never coalesce (see E10-Q1).
- Atomic client batches (ledger 1161) and MIN 12 answering 426 on pull: checked by reading only, since the api suite covers them.
- Duplicate TAG "-2": both tablets got `TC-C01` and `TC-C01-2`.
- The removal conflict marks only on a tombstone that a non-server device edits.
- No pt-BR literal was added outside `packages/domain` and `apps/web/src/copy/` in the changed web files. No emoji in the diff.
- Classes from the 85/86 mocks that the surfaces do not render: `cv-merged` (intended, Conflict 7), `progress-counter` and `readings-banner`. The others come from shared components.

## 3. Pass or fail per AC (walked in the browser as two users of one company, worker pair 2)

| Story | AC | Result |
|---|---|---|
| 10.1 | NC vs C resolves to NC with the NC device's observation; filled beats empty; text latest edit with the other readable; additions from both kept; converged on both tablets | **Pass** (photo link on NC not walked by hand; covered by 10.1-E2E-001) |
| 10.1 | Every merge is a Sync status row ("SEC-C12: item 10 NC de Eduardo mesclado") | **Pass**, but the extra "N alterações mescladas pelo servidor" line miscounts (E10-Q3) |
| 10.2 | Contradiction: cell in conflict, sheet Banner `role="alert"` "SEC-C12: 1 célula em contradição" + "Ver", Conflict view with only the contradicting cells, both values with author and time, "Aplicar" writes the pick, Esc writes nothing | **Pass**: keyboard Tab/Arrow picks, Esc wrote 0 outbox rows, "Aplicar" disabled until every cell has a pick, Enter on "Aplicar" works, converged on both. **Fails on undo** (E10-Q2). 48 px crop not walked (no reading suggestion in the scenario; e2e covers it). |
| 10.3 | Removed vs edited: Sumário Banner "SEC-C11: removido por você, alterado por Eduardo" with Ver / Manter / Remover; Conflict view with one card per side | **Pass**; the "Manter" toast reads "SEC-C11 mantido na Coluna 11 com as alterações de Eduardo". **Fails on undo** (E10-Q2). |
| 10.3 | Duplicate TAG row "TC-C01 foi criada em dois aparelhos — Renomear uma / Manter as duas"; "Manter as duas" gives the later one "-2"; a block added elsewhere is an information row | **Pass** ("Manter as duas" walked; "Renomear uma" not walked by hand, covered by 10.3-E2E-006) |
| 10.4 | Opens from the badge; headline counts ("1 ficha e 1 foto aguardando"); Enviando rows; Último envio per user ("Último envio de Eduardo Esteves: 29/09 16:12"); merges; contradictions open the Conflict view; "Como funciona a mesclagem"; nothing on the surface is a live region | **Pass**, with E10-Q4 and E10-Q5 copy issues. "Tentar novamente", "Reenviar", "Leitura na fila" and "Baixando" were not reproduced by hand (they need a server refusal or a slow stream); covered by 10.4-E2E-003/004/005/006. |
| Carry-over | Dictation default off on a default build | **Pass**: no dictation control on the sheet; `docker-compose.yml:115` and `.env.example:21` say `none` |

Viewports and themes:
- 1280 px: Sync status and Conflict view (screenshots 01, 02).
- 768 px: Sync status Decisões and the removal dialog (screenshots 03, 04).
- 390 px: Sync status offline (05) and the Conflict view with two cells in dark theme (06); no horizontal scroll (scrollWidth - innerWidth = -15).
- Console: no errors besides the expected `ERR_INTERNET_DISCONNECTED` while offline.

Screenshots: `reviews/epic-10-qa/01-sync-status-merge-and-decision-1280.png`, `02-conflict-view-cell-1280.png`, `03-sync-status-decisions-768.png`, `04-removal-conflict-view-768.png`, `05-sync-status-offline-390.png`, `06-conflict-view-two-cells-390-dark.png`.

## 4. What went well and what went badly

Went well:
- Four PRs merged in one day in two waves, as planned. Every PR had a green, complete `verify` pasted, and lock waits were mostly 0 s.
- Each batch showed mutation evidence: reverting the key branch turned its tests red (#63, #64, #66).
- The X/S seam (Decisões) and the contract bumps (10, 11, 12 with MIN 10 then 12) landed without a merge conflict in code.
- The cross-story pairs from the context file each got an e2e owner and a test (10.2-E2E-001, 10.3-E2E-004/005, 10.4-E2E-002).

Went badly:
- Gate times stay far over the 900 s budget:
  - #63: verify 2055 s;
  - #64: verify 1594 s, plus an e2e:full of 2207 s with 2 load flakes, and one e2e:full thrown away after contamination by a concurrent run;
  - #65: verify 1713 s after a lock wait of 1781 s, plus an e2e:full of 2366 s after a lock wait of 1697 s, and a second verify red on a stale selector;
  - #66: verify 1777 s, e2e:full 2373 s.
- `test:e2e:matrix` was not run by any batch and is red now (E10-Q1).
- The cross-story seam defect sits where two stories meet: the undo of a resolution (10.2/10.3) against the kernel's inverse ops (Epic 5 undo), flagged as a follow-up by the X review and never tested (E10-Q2).
- The 10.1 x 10.4 "replace supersededCount" item fell between the batches (E10-Q3).
- Token use: not measured by this agent.

## 5. Open questions for Matheus

1. Should a resolution ("Aplicar", "Manter", "Remover", "Manter as duas") be undoable? If yes, undo must bring the decision back (E10-Q2 option b); if no, drop "Desfazer" from those toasts (option a).
2. Keep "N alterações mescladas pelo servidor" at all, now that each merge is its own row (E10-Q3)?
3. Headline wording when the pending decisions are structural: "contradições" or "decisões" (E10-Q4)?
4. Should a pre-contract-12 client's pushes be refused, since it can silently settle a contradiction (E10-Q6)?
5. Carried from the PRs: does a contradiction become a pre-issue row, does NC vs NA stay a contradiction, and does "de {nome}" name the viewer too?
