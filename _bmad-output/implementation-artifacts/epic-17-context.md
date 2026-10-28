# Epic 17 Context: Bruno's answers and third production feedback (WhatsApp of 2026-10-27)

<!-- Compiled 2026-10-27 from epics.md Epic 17, Bruno's WhatsApp message of 2026-10-27 (ten answers, two new items,
the spreadsheet already in docs/context/), the code of main e2023853, spine AD-1/7/8/11/15/17/26, AR-27. Current
decisions only. Edit freely. -->

## Goal

Bruno's ten answers of 2026-10-27 and his two new items, landed as seven stories plus the already-written Story 15.7:
section 7 holds only the "Geral" photos (17.1), the device's camera app takes the photos on phones and tablets
(17.2), "N/A" from a control beside the field and printed "N/A" (17.3), display shots numbered again (17.4, amends
16.3), a failed ratio feeds the conclusion suggestion (17.5, E15-A2), Altitude do site takes N/A (17.6, contract 27),
a photo saved to the device on request (17.7), and the TC's own checklist (15.7, seed v10, contract 27).

"Photos not saved on the device" is the design, not a fault (AD-7/AD-8: IndexedDB plus upload, evicted once acked;
nothing writes to the gallery), and the copy "salva neste aparelho" misled; 17.2 corrects the words, 17.7 gives the
one honest way to a gallery copy the web platform offers (`navigator.share` with the file). Details in the epic
preamble (`epics.md` Epic 17, investigation bullets).

## Stories, waves and lanes

| Wave | Batch | Story | Dev model | Seed / contract | Base |
|---|---|---|---|---|---|
| A | e17a | 17.1 The REGISTRO FOTOGRÁFICO holds only the photos added to it by hand | opus · medium | none | main (e2023853 or later) |
| A | e17a | 17.4 Display shots keep their number | opus · medium | none | same branch as 17.1 (shared print and numbering files) |
| A | e17b | 17.3 "N/A" from a control beside the field, printed "N/A" | opus · medium | none | main; lane 1 |
| A | e17b | 17.5 A failed ratio feeds the conclusion suggestion, the pre-issue rows and the parecer count | opus · medium | none | main; lane 2 (no shared files with 17.3) |
| B | e17c | 15.7 The TC's own checklist (seed v10) | opus · medium | **seed v10, contract 27, minimum 27** | main after wave A's gate |
| B | e17c | 17.6 "Altitude do site" takes N/A and says when the device gave none | opus · medium | contract 27 (one entry with 15.7) | same branch as 15.7 |
| B | e17d | 17.2 The device's camera app takes the photos | opus · high | none | main after wave A's gate, once Matheus confirms the camera default |
| B | e17d | 17.7 A photo saved to the device | opus · medium | none | same branch as 17.2 (photo viewer and Conta copy shared) |

Two batch stacks at a time (E11-A1): e17a and e17b in parallel as two worktrees; v0.3.4 deploy after wave A's gate;
e17c and e17d in parallel after it; v0.4.0 after wave B's gate (contract bump). Numbers are fixed here: no other batch
takes seed v10 or contract 27. Story 17.6 ships in e17c because the contract entry is one for the batch; if 15.7
slips, 17.6 takes 27 alone and 15.7 the next number.

Defaults taken on 2026-10-27 (Matheus) while the six confirmations are out (`epics.md` Epic 17 preamble, asked at
the afternoon tablet session); an answer that differs becomes a dated line under its story before the batch merges:

- 17.1: "Geral" = `block_id`, `item_key`, `location_id` and `reading_kind` all null; one numbering sequence in
  document order (section 7 first in capture order, then section 9 in print order).
- 17.2: device-local preference "Câmera do aparelho" on by default when `navigator.maxTouchPoints > 0`; every opener
  through the existing `capture` input; one photo per tap; viewfinder as the off state and on desktops; copy "no
  relatório".
- 17.3: secondary "N/A" button at the trailing end of every `acceptsNotApplicable` field; `NOT_APPLICABLE_TEXT`
  becomes "N/A" (no contract: the stored state carries no spelling).
- 17.4: display shots numbered in the 17.1 sequence under their test; section 9 "Imagem N: ⟨legenda⟩."; `REMOVED_PHOTO_REF_TEXT`
  stays for deleted photos.
- 17.6: `site_altitude_na: boolean` beside `site_altitude_m`; authored hint when the device answered no altitude.
- 17.7: "Salvar no aparelho" on the photo viewer; share the file where `navigator.canShare` allows, else download.
- 15.7: oil item "VASAMENTO" only; `epoxi` and `a_seco` mark it NA; spelling as the spreadsheet's.

## Cross-story table (one assertion per shared item)

| Shared item | Stories | Assertion |
|---|---|---|
| `photos/numbering.ts` `numberPhotos` | 17.1, 17.4 | one function, one order (document order), one filter (live photos, every kind); no second numbering in `apps/*`; the revision-frozen numbers keep the rule in force at issue |
| `print/section-7.ts` `section7Photos` | 17.1 | the only selector of section 7; reads the "Geral" predicate from one kernel helper (`photos/order.ts` or beside it) that the gallery wording reuses |
| `print/section-9.ts` `contextOf`, display line | 17.1, 17.4 | 17.1 changes nothing in section 9 but the numbers it reads; 17.4 changes the display line only |
| `parse/pt-br-number.ts` `NOT_APPLICABLE_TEXT` | 17.3, 17.6 | the one spelling; 17.6 prints it for the altitude through the same readers |
| `components/number-input.tsx` `acceptsNotApplicable` | 17.3, 17.6 | the control is rendered by the field that accepts N/A; 17.6 opts the altitude field in, never a second control |
| `schemas/entities.ts` relatório setup fields; `contract/version.ts` | 17.6, 15.7 | one contract entry 27 naming both reasons; `seed/definitions.ts` gains v10 only |
| `surfaces/ficha/camera-session.tsx` `useCamera`, `camera-single-shot.tsx` `useCameraPicker` | 17.2 | the preference is read in one place (`useCamera`); every opener keeps its call; the `capture` input stays the one system-camera path |
| `db/prefs.ts` `local_prefs` | 17.2 | the camera preference is stored like the theme (AR-27), with the kernel schema for its value |
| `photos/text.ts`, `copy/pt-br.ts` camera lines | 17.2, 17.7 | "no relatório" words in 17.2; the Conta sentence of 17.7 is the only place that says where a gallery copy comes from |
| `surfaces/export/revision-file.ts` `shareFile`, `saveFile` | 17.7 | reused for the photo, not duplicated |
| `relatorio/conclusion.ts` `suggestConclusionPair`, `restrictionWarning`, `composeConclusion`; `parecer.ts` | 17.5 | one reader of the ratio verdict (`condicao` or the capture cells' `out`), named in the batch spec after the verification |
| Porto Seguro goldens | 17.1, 17.3, 17.4, 17.6 | unchanged by every story (82 "Geral" photos, no display shot, no N/A, no altitude N/A) |

Undo pairs: 17.3 and 17.6 add no op kind (an N/A commit is the existing put); 17.1, 17.2, 17.4, 17.5 and 17.7 add
no op; 15.7 adds no op (a seed version).

## Gate

The 2026-10-08 story gate per PR: `lint`, `static`, `test:unit`, `test:api` and the Playwright specs the story touched
(`pnpm exec tsx scripts/e2e.ts <specs> --project desktop-chrome --project durability-desktop-chrome`), plus the touched
durability specs on the matrix projects for e17c (a value shape the ficha's live query folds) and e17d (the capture
path on `durability-android-chrome` and `durability-webkit`). The full `@p0`, `test:e2e:full` and the matrix once per
wave on the integrated main, by the coordinator. Tools run only in the `tools` container through `podman compose`;
restart the batch's api container after a kernel change before the story's e2e (E16-A8); every gate under
`lockf -t 20000 /tmp/fasor-verify.lock`; at most two batch stacks up, the main checkout's stack stopped meanwhile.

## Wave gates

- **Start, 2026-10-27 (Matheus):** "Bruno já deu todas as informações necessárias": the six confirmations stand as the defaults above, the camera default of 17.2 is confirmed. Wave A launched from main `c2ee5580`: e17a (17.1 + 17.4, worktree `fasor-app-e17a`, port base 29, branch `story/17-1-17-4-section-7-by-hand-display-shots-numbered`) and e17b (17.3 + 17.5, worktree `fasor-app-e17b`, port base 30, branch `story/17-3-17-5-na-control-failed-ratio`), images tagged from `app-api-e16c` / `app-tools-e16c`.
- **Wave A merged, 2026-10-28.** e17b first: PR #189 squash-merged as `fd5efabf` (gate on its final commit: lint, static, test:unit 4513/4513, test:api 683/684 with the one `generation-time` target missed under the two-batch load and green alone, 51/51 touched specs, 2/2 on Android emulation). e17a second, with the cross-batch rule: `fd5efabf` merged into the branch as `a0724e6e`, then static, test:unit 4528/4528 and the 24 touched specs of both batches on the merge commit, 179/181 with two timing failures in `verificacoes-local.spec.ts` during a window where the host lost its network and later rebooted (macOS update), 9/9 on the isolated rerun; PR #190 squash-merged as `0bdd925a`. Lessons: the e17a orchestrator was cut by the runtime at every monitor tick and died on the network loss; the gate scripts must log inside the worktree (`.scratch-<tag>/`), never in `/tmp`, which the reboot wiped. Decisions pending for Matheus are listed under Story 17.1 in `epics.md` (orphan photos, stamp and item line in section 9, Sumário row 7, gallery note, gallery order) and under 17.5 (parecer counts a failed ratio as NC; TAP naming).
- **Wave A gate, 2026-10-28:** launched 09:48 on `0bdd925a` from the main checkout (`.scratch-wave17a/`, git-excluded): `pnpm verify` (with `@p0`), `test:e2e:full`, `test:e2e:matrix` under the host lock. Green, all three stages, `LOCKED_AFTER=0s`: `verify` passed in 2366 s (lint 34 s, static 46 s, test:api 684/684 in 362 s, test:unit 4528/4528 in 224 s, `@p0` 312/312 in 1777 s); `test:e2e:full` 524/528 with 4 skipped, 0 failed, in 2554 s; `test:e2e:matrix` 109/120 with 11 skipped, 0 failed, in 407 s. Ready for the v0.3.4 deploy on Matheus's go.
- **Wave B started, 2026-10-28 (after the wave A gate, record PR #191, main `1a2f0b0f`):** e17c (15.7 + 17.6, worktree `fasor-app-e17c`, port base 31, branch `story/15-7-17-6-tc-checklist-seed-v10-altitude-na`, seed v10, contract 27, minimum 27) and e17d (17.2 + 17.7, worktree `fasor-app-e17d`, port base 32, branch `story/17-2-17-7-device-camera-app-save-to-device`), images tagged from `app-api-e17b` / `app-tools-e17b`; the wave A worktrees removed. Gate logs inside each worktree's `.scratch-<tag>/`. The v0.3.4 deploy of wave A waits for Matheus's go and runs independently of these batches.
- **Wave B, e17c merged, 2026-10-28:** PR #193 squash-merged as `6c28b886` (gate on `cad3aad4`, `LOCKED_AFTER=0s`: lint, static, test:api 686/686, test:unit 4562/4562, 72/72 touched specs on desktop-chrome and durability-desktop-chrome, 16/16 durability specs on Android and WebKit emulation; post-merge of `79465811`: static and 296/296 touched unit tests). Seed v10, contract 27, minimum 27. e17d applies the cross-batch rule on `6c28b886` before its PR. 
- **Wave B, e17d merged, 2026-10-28:** PR #194 squash-merged as `3beacd40`. Gate 1 on `2e65555d` (lint, static, test:api 684/684, test:unit 4556/4556, `LOCKED_AFTER=160s` behind e17c; five failures of the new spec's own assertions fixed in `bdfc232f`, 9 passed on the four projects after). Gate 2 on the merge commit `6bb4e517` with `6c28b886` (cross-batch rule): static, test:unit 4590/4590, both batches' 35 specs 191/194 with 3 skipped and 0 failed on desktop-chrome and durability-desktop-chrome, both batches' durability specs 46/56 with 10 skipped and 0 failed on Android and WebKit emulation. `docx.ts`, `layout.ts` and the goldens untouched in both wave B PRs. Review of e17d: 20 findings, 5 patched, 3 deferred, 12 rejected.
- **Wave B gate, 2026-10-28:** launched 12:58 on `3beacd40` from the main checkout (`.scratch-wave17b/`): `pnpm verify` (with `@p0`), `test:e2e:full`, `test:e2e:matrix`. Green, all three stages, `LOCKED_AFTER=0s`: `verify` passed in 1806 s (lint 24 s, static 32 s, test:api 686/686 in 279 s, test:unit 4590/4590 in 183 s, `@p0` 318/318 in 1343 s); `test:e2e:full` 533/537 with 4 skipped, 0 failed, in 2047 s; `test:e2e:matrix` 121/135 with 14 skipped, 0 failed, in 473 s. Matheus gave the go for the deploy and the follow-up work the same afternoon; v0.3.4 is skipped and both waves ship together as v0.4.0 (contract 27) from this commit.
